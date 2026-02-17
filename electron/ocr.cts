import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";
import os from "os";

interface OcrRequest {
  resolve: (data: any) => void;
  reject: (err: any) => void;
  image: string; // base64 or path
}

export class OcrManager {
  private process: ChildProcess | null = null;
  private queue: OcrRequest[] = [];
  private isProcessing = false;
  private buffer = ""; // Buffer for stdout
  private exePath: string = "";

  constructor() {
    this.exePath = this.getExecutablePath();
    this.startProcess();
  }

  private getExecutablePath(): string {
    const basePath = app.isPackaged
      ? path.join(process.resourcesPath, "ocr")
      : path.join(__dirname, "..", "public", "assets", "ocr");

    // Check known structures
    const possiblePaths = [
      path.join(basePath, "PaddleOCR-json.exe"),
      path.join(basePath, "PaddleOCR-json", "PaddleOCR-json.exe"),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }

    console.warn("PaddleOCR-json.exe not found in:", possiblePaths);
    return "";
  }

  private startProcess() {
    if (!this.exePath) {
      this.exePath = this.getExecutablePath();
      if (!this.exePath) return; // Still not found
    }

    if (this.process) return;

    console.log("Starting PaddleOCR-json at:", this.exePath);

    // PaddleOCR-json args
    // --use_debug=0 to disable logs
    this.process = spawn(this.exePath, ["--ensure_ascii=1", "--use_gpu=0"], {
      cwd: path.dirname(this.exePath), // Important: cwd must be the dir of exe for models
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data) => this.handleData(data));
    this.process.stderr?.on("data", (data) =>
      console.error("OCR Stderr:", data.toString()),
    );

    this.process.on("exit", (code) => {
      console.log("PaddleOCR-json exited with code:", code);
      this.process = null;
      this.isProcessing = false;
      // Retry pending queue? or reject?
      // For now, let's try to restart on next request
    });
  }

  private handleData(data: Buffer) {
    this.buffer += data.toString();

    const lines = this.buffer.split("\n");
    // If the last line is not complete, put it back in buffer
    if (!this.buffer.endsWith("\n")) {
      this.buffer = lines.pop() || "";
    } else {
      this.buffer = "";
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const json = JSON.parse(trimmed);
        this.completeRequest(json);
      } catch (e) {
        console.warn("OCR Non-JSON output:", trimmed);
      }
    }
  }

  private completeRequest(result: any) {
    if (this.queue.length === 0) return;

    const req = this.queue.shift();
    this.isProcessing = false;

    if (req) {
      if (result.code === 100 || result.code === 200 || result.code === 201) {
        // 100: success, 101: no text
        req.resolve(result);
      } else {
        req.reject(new Error(`OCR Error Code: ${result.code}`));
      }
    }

    this.processQueue();
  }

  public async recognize(base64Image: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, image: base64Image });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    if (!this.process) {
      this.startProcess();
      if (!this.process) {
        const req = this.queue.shift();
        req?.reject(new Error("PaddleOCR-json executable not found."));
        return;
      }
    }

    this.isProcessing = true;
    const req = this.queue[0];

    // PaddleOCR-json requires "image_base64" (without data:image/... base64 header usually, checking docs)
    // Actually typically standard base64 string.
    // Let's strip the header if present.
    let cleanBase64 = req.image;
    if (cleanBase64.startsWith("data:image")) {
      cleanBase64 = cleanBase64.split(",")[1];
    }

    const payload = JSON.stringify({ image_base64: cleanBase64 }) + "\n";
    this.process.stdin?.write(payload);
  }

  public kill() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
