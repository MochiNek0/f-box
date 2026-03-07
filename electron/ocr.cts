import { spawn, ChildProcess, execFile } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";
import os from "os";
import https from "https";
import AdmZip from "adm-zip";

import { getFastestProxy } from "./proxy-utils.cjs";

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

  private isWindows(): boolean {
    return process.platform === "win32";
  }

  private isMac(): boolean {
    return process.platform === "darwin";
  }

  private getPluginPath(): string {
    return path.join(os.homedir(), ".f-box", "plugins", "ocr");
  }

  private getWindowsPluginUrl(): string {
    return "https://github.com/MochiNek0/f-box/releases/download/ocr-plugin/ocr.zip";
  }

  private getMacPluginUrl(): string {
    return "https://github.com/MochiNek0/f-box/releases/download/ocr-plugin/ocr-mac.zip";
  }

  private getMacPluginCandidates(): string[] {
    const pluginPath = this.getPluginPath();
    return [
      path.join(pluginPath, "macocr"),
      path.join(pluginPath, "bin", "macocr"),
      path.join(pluginPath, "macOCR"),
      path.join(pluginPath, "macOCR", "macocr"),
    ];
  }

  private getMacOcrCandidates(): string[] {
    return [
      ...this.getMacPluginCandidates(),
      "/opt/homebrew/bin/macocr",
      "/usr/local/bin/macocr",
      "macocr",
    ];
  }

  private getMacPluginExecutablePath(): string {
    for (const candidate of this.getMacPluginCandidates()) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return "";
  }

  private getMacExecutablePath(): string {
    const pluginExecutable = this.getMacPluginExecutablePath();
    if (pluginExecutable) {
      return pluginExecutable;
    }

    for (const candidate of this.getMacOcrCandidates()) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return "macocr";
  }

  public isInstalled(): boolean {
    if (this.isWindows()) {
      const pluginPath = this.getPluginPath();
      const exePath = path.join(pluginPath, "PaddleOCR-json.exe");
      return fs.existsSync(exePath);
    }

    if (this.isMac()) {
      return this.getMacPluginExecutablePath().length > 0;
    }

    return false;
  }

  private getExecutablePath(): string {
    if (!this.isWindows()) {
      return "";
    }
    const pluginPath = this.getPluginPath();
    const exePath = path.join(pluginPath, "PaddleOCR-json.exe");
    if (fs.existsSync(exePath)) return exePath;
    return "";
  }

  private execFileAsync(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve((stdout || "").trim());
      });
    });
  }

  private async runMacOcr(imagePath: string): Promise<any> {
    const executable = this.getMacExecutablePath();
    if (!executable) {
      throw new Error("未检测到 macOCR，请先安装 macOCR（brew install --cask macocr）");
    }

    const argVariants = [[imagePath], ["--path", imagePath], ["--file", imagePath]];
    let output = "";
    let lastError = "";

    for (const args of argVariants) {
      try {
        output = await this.execFileAsync(executable, args);
        if (output) break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Unknown error";
      }
    }

    if (!output) {
      throw new Error(lastError || "macOCR 未返回可用识别结果");
    }

    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      code: 100,
      data: lines.map((text) => ({ text })),
      raw: output,
    };
  }

  private async recognizeMac(base64Image: string): Promise<any> {
    let cleanBase64 = base64Image;
    if (cleanBase64.startsWith("data:image")) {
      cleanBase64 = cleanBase64.split(",")[1];
    }

    const tempPath = path.join(app.getPath("temp"), `macocr_${Date.now()}.png`);
    fs.writeFileSync(tempPath, Buffer.from(cleanBase64, "base64"));

    try {
      return await this.runMacOcr(tempPath);
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
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
    if (this.isMac()) {
      return this.recognizeMac(base64Image);
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, image: base64Image });
      this.processQueue();
    });
  }

  private processQueue() {
    if (!this.isWindows()) {
      const req = this.queue.shift();
      req?.reject(new Error("当前系统不支持 PaddleOCR-json 队列模式"));
      return;
    }

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

  public async install(
    onProgress?: (percent: number) => void,
  ): Promise<boolean> {
    if (this.isMac()) {
      return this.installFromZip(this.getMacPluginUrl(), onProgress, true);
    }

    if (!this.isWindows()) {
      console.warn(`OCR install is not supported on platform: ${process.platform}`);
      return false;
    }

    return this.installFromZip(this.getWindowsPluginUrl(), onProgress, false);
  }

  private async installFromZip(
    rawUrl: string,
    onProgress?: (percent: number) => void,
    makeExecutable: boolean = false,
  ): Promise<boolean> {
    const downloadUrl = await getFastestProxy(rawUrl);
    const tempDir = app.getPath("temp");
    const zipPath = path.join(tempDir, `ocr_${Date.now()}.zip`);
    const destDir = this.getPluginPath();

    const tryDownload = async (url: string) => {
      console.log(`Downloading OCR plugin from ${url}...`);
      await this.downloadFile(url, zipPath, onProgress);
    };

    try {
      try {
        await tryDownload(downloadUrl);
      } catch (e) {
        console.warn(
          `Failed to download from selected URL, trying original URL...`,
          e,
        );
        // Reset progress if it failed halfway
        if (onProgress) onProgress(0);
        await tryDownload(rawUrl);
      }

      console.log(`Extracting OCR plugin to ${destDir}...`);
      if (onProgress) onProgress(100); // 100% means download finished, now extracting

      // Clean destination directory first to remove old version files
      if (fs.existsSync(destDir)) {
        console.log("Cleaning old OCR plugin directory...");
        if (typeof fs.rmSync === "function") {
          fs.rmSync(destDir, { recursive: true, force: true });
        } else {
          fs.rmdirSync(destDir, { recursive: true });
        }
      }
      fs.mkdirSync(destDir, { recursive: true });

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      if (zipEntries.length === 0) {
        throw new Error("OCR plugin zip is empty");
      }

      // Check if all entries are inside a single root folder
      let rootFolder = "";
      const firstEntry = zipEntries[0].entryName.split("/")[0];
      const allInRoot = zipEntries.every(
        (e) =>
          e.entryName.startsWith(firstEntry + "/") ||
          e.entryName === firstEntry ||
          e.entryName === firstEntry + "/",
      );
      if (allInRoot) {
        rootFolder = firstEntry;
        console.log(`Detected single root folder: ${rootFolder}`);
      }

      let extractedCount = 0;
      zipEntries.forEach((entry) => {
        if (entry.isDirectory) return;

        let targetPath = entry.entryName;
        if (rootFolder && targetPath.startsWith(rootFolder + "/")) {
          targetPath = targetPath.substring(rootFolder.length + 1);
        }

        // Skip entries that would extract outside destDir
        const fullPath = path.join(destDir, targetPath);
        const normalizedFull = path.normalize(fullPath);
        const normalizedDest = path.normalize(destDir);
        if (!normalizedFull.startsWith(normalizedDest)) {
          console.warn(`Skipping potentially malicious entry: ${entry.entryName}`);
          return;
        }

        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, entry.getData());
        extractedCount++;
      });

      console.log(`Extracted ${extractedCount} files to ${destDir}`);

      // Clean up temp zip
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      if (makeExecutable) {
        for (const file of this.getMacPluginCandidates()) {
          if (fs.existsSync(file)) {
            try {
              fs.chmodSync(file, 0o755);
            } catch (chmodErr) {
              console.warn(`Failed to chmod ${file}:`, chmodErr);
            }
          }
        }
      }

      console.log("OCR plugin installation complete.");
      return true;
    } catch (e) {
      console.error("Failed to install OCR plugin:", e);
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      return false;
    }
  }

  private downloadFile(
    url: string,
    dest: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          this.downloadFile(response.headers.location!, dest, onProgress)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(
          response.headers["content-length"] || "0",
          10,
        );
        let downloadedSize = 0;

        const file = fs.createWriteStream(dest);
        response.on("data", (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0 && onProgress) {
            const percent = Math.round((downloadedSize / totalSize) * 100);
            onProgress(percent);
          }
        });

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
        if (typeof fs.rmSync === "function") {
          fs.rmSync(dest, { recursive: true, force: true });
        } else {
          // Fallback for older Node.js (before 14.14.0)
          fs.rmdirSync(dest, { recursive: true });
        }
      }
      return true;
    } catch (e) {
      console.error("Failed to uninstall OCR plugin:", e);
      return false;
    }
  }
}
