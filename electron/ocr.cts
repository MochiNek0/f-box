import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";
import os from "os";
import https from "https";
import AdmZip from "adm-zip";

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
  private getPluginPath(): string {
    return path.join(os.homedir(), ".f-box", "plugins", "ocr");
  }

  public isInstalled(): boolean {
    const pluginPath = this.getPluginPath();
    const exePath = path.join(pluginPath, "PaddleOCR-json.exe");
    return fs.existsSync(exePath);
  }

  private getExecutablePath(): string {
    const pluginPath = this.getPluginPath();
    const exePath = path.join(pluginPath, "PaddleOCR-json.exe");
    if (fs.existsSync(exePath)) return exePath;
    return "";
  }

  private startProcess() {
    const exePath = this.getExecutablePath();
    if (!exePath) return;

    if (this.process) return;

    console.log("Starting PaddleOCR-json at:", exePath);

    // PaddleOCR-json args
    // --use_debug=0 to disable logs
    this.process = spawn(exePath, ["--ensure_ascii=1", "--use_gpu=0"], {
      cwd: path.dirname(exePath), // Important: cwd must be the dir of exe for models
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

  public async install(): Promise<boolean> {
    const url =
      "https://github.com/MochiNek0/f-box/releases/download/ocr-plugin/ocr.zip";
    const tempDir = app.getPath("temp");
    const zipPath = path.join(tempDir, `ocr_${Date.now()}.zip`);
    const destDir = this.getPluginPath();

    try {
      console.log(`Downloading OCR plugin from ${url}...`);
      await this.downloadFile(url, zipPath);

      console.log(`Extracting OCR plugin to ${destDir}...`);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      // Check if all entries are inside a single root folder
      let rootFolder = "";
      if (zipEntries.length > 0) {
        const firstEntry = zipEntries[0].entryName.split("/")[0];
        const allInRoot = zipEntries.every(
          (e) =>
            e.entryName.startsWith(firstEntry + "/") ||
            e.entryName === firstEntry ||
            e.entryName === firstEntry + "/",
        );
        if (allInRoot) {
          rootFolder = firstEntry;
        }
      }

      zipEntries.forEach((entry) => {
        if (entry.isDirectory) return;

        let targetPath = entry.entryName;
        if (rootFolder && targetPath.startsWith(rootFolder + "/")) {
          targetPath = targetPath.substring(rootFolder.length + 1);
        }

        const fullPath = path.join(destDir, targetPath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, entry.getData());
      });

      // Clean up temp zip
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      console.log("OCR plugin installation complete.");
      return true;
    } catch (e) {
      console.error("Failed to install OCR plugin:", e);
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      return false;
    }
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          this.downloadFile(response.headers.location!, dest)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      });

      request.on("error", (err) => {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    });
  }

  public async uninstall(): Promise<boolean> {
    this.kill();
    const dest = this.getPluginPath();
    try {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      return true;
    } catch (e) {
      console.error("Failed to uninstall OCR plugin:", e);
      return false;
    }
  }
}
