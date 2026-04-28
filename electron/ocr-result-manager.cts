import { app } from "electron";
import path from "path";
import fs from "fs";

export interface OcrResultEntry {
  timestamp: string;
  runCount: number;
  eventIndex: number;
  requestId: string;
  recognizedText: string;
  expectedText: string;
  matched: boolean;
}

export class OcrResultManager {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(app.getPath("home"), ".f-box", "ocr_result");
  }

  private ensureDir(scriptName: string): string {
    const dir = path.join(this.baseDir, scriptName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  saveResult(scriptName: string, entry: OcrResultEntry): void {
    try {
      const dir = this.ensureDir(scriptName);
      const filePath = path.join(dir, "results.json");

      let results: OcrResultEntry[] = [];
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          results = JSON.parse(content);
        } catch {
          results = [];
        }
      }

      results.push(entry);
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2), "utf-8");
    } catch (e) {
      console.error("OcrResultManager.saveResult error:", e);
    }
  }

  getResults(scriptName: string): OcrResultEntry[] {
    try {
      const filePath = path.join(this.baseDir, scriptName, "results.json");
      if (!fs.existsSync(filePath)) {
        return [];
      }
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  clearResults(scriptName: string): boolean {
    try {
      const filePath = path.join(this.baseDir, scriptName, "results.json");
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (e) {
      console.error("OcrResultManager.clearResults error:", e);
      return false;
    }
  }

  clearAllResults(): void {
    try {
      if (fs.existsSync(this.baseDir)) {
        fs.rmSync(this.baseDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("OcrResultManager.clearAllResults error:", e);
    }
  }
}
