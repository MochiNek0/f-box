import { app, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { spawn, execSync } from "child_process";

/**
 * SpeedManager: Professional Speed Gear Orchestrator
 * Handles DLL injection and memory-based IPC for frame timing manipulation.
 */
export class SpeedManager {
  private injected = false;
  private currentSpeed = 1.0;
  private flashPid: number | null = null;
  private dataAddr: string | null = null;
  private is64Bit = true;

  /**
   * Resolves the absolute path to the native injector executable.
   */
  private getInjectorPath(is64bit: boolean): string {
    const exeName = is64bit ? "injector64.exe" : "injector32.exe";
    return app.isPackaged
      ? path.join(process.resourcesPath, exeName)
      : path.join(__dirname, "..", "public", "assets", exeName);
  }

  /**
   * Resolves the absolute path to the speedhack DLL.
   */
  private getDllPath(is64bit: boolean): string {
    const dllName = is64bit ? "speedhack64.dll" : "speedhack32.dll";
    return app.isPackaged
      ? path.join(process.resourcesPath, dllName)
      : path.join(__dirname, "..", "public", "assets", dllName);
  }

  /**
   * Detects the bitness of a target process by inspecting its executable header.
   */
  private async isProcess64Bit(pid: number): Promise<boolean> {
    try {
      const command = `powershell -NoProfile -Command "(Get-Process -Id ${pid}).Path"`;
      const procPath = execSync(command, { encoding: "utf-8" }).trim();

      if (procPath && fs.existsSync(procPath)) {
        try {
          const fd = fs.openSync(procPath, "r");
          const header = Buffer.alloc(4096);
          fs.readSync(fd, header, 0, 4096, 0);
          fs.closeSync(fd);

          const peOffset = header.readUInt32LE(60);
          const machine = header.readUInt16LE(peOffset + 4);
          return machine === 0x8664 || machine === 0xaa64 || machine === 0x014c ? (machine !== 0x014c) : process.arch === "x64";
        } catch {
          return process.arch === "x64";
        }
      }
    } catch { /* Silent fail */ }
    return process.arch === "x64";
  }

  /**
   * Scans Electron's application metrics to find the Flash plugin (Pepper Plugin) process ID.
   */
  private getFlashPid(): number | null {
    try {
      const metrics = app.getAppMetrics();
      const flash = metrics.find((m) => m.type === "Pepper Plugin");
      if (flash) return flash.pid;

      const ppapi = metrics.find((m) => (m.type as string) === "Plugin" || m.name?.includes("ppapi"));
      return ppapi ? ppapi.pid : null;
    } catch { return null; }
  }

  /**
   * Injects the speedhack DLL into the target Flash process.
   */
  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.injected) return { success: true };

    const pid = this.getFlashPid();
    if (!pid) return { success: false, error: "Flash 进程未就绪" };

    const is64 = await this.isProcess64Bit(pid);
    const injectorExe = this.getInjectorPath(is64);
    const dllPath = this.getDllPath(is64);

    if (!fs.existsSync(injectorExe) || !fs.existsSync(dllPath)) {
      return { success: false, error: "核心组件 (Native) 丢失" };
    }

    return new Promise((resolve) => {
      try {
        const proc = spawn(injectorExe, [pid.toString(), dllPath, "1.0"], {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let output = "";
        let resolved = false;

        proc.stdout?.on("data", (data: Buffer) => {
          output += data.toString();
          const lines = output.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes("STATUS|INJECTED")) {
              const match = trimmed.match(/DATA_ADDR=(?:0x)?([0-9A-Fa-f]+)/);
              if (match) {
                this.dataAddr = "0x" + match[1];
                this.injected = true;
                this.flashPid = pid;
                this.is64Bit = is64;
                if (!resolved) { resolved = true; resolve({ success: true }); }
              }
            } else if (trimmed.includes("STATUS|ERROR")) {
              const msg = trimmed.split("|").pop();
              if (!resolved) { resolved = true; resolve({ success: false, error: msg }); }
            }
          }
        });

        proc.on("exit", (code) => {
          if (!resolved) {
            resolved = true;
            if (code === 0) resolve({ success: true });
            else resolve({ success: false, error: "注入器非正常退出" });
          }
        });

        setTimeout(() => { 
          if (!resolved) { 
            resolved = true; 
            try { proc.kill(); } catch {}
            resolve({ success: false, error: "注入响应超时" }); 
          } 
        }, 8000);
      } catch (e: any) {
        resolve({ success: false, error: e.message });
      }
    });
  }

  /**
   * Updates the speed multiplier in the target process memory.
   */
  async setSpeed(multiplier: number): Promise<{ success: boolean; error?: string }> {
    if (!this.injected || !this.flashPid || !this.dataAddr) {
      return { success: false, error: "尚未开启变速" };
    }

    const injectorExe = this.getInjectorPath(this.is64Bit);
    try {
      execSync(`"${injectorExe}" --speed ${this.flashPid} ${this.dataAddr} ${multiplier}`, { windowsHide: true });
      this.currentSpeed = multiplier;
      return { success: true };
    } catch {
      return { success: false, error: "写入失败" };
    }
  }

  /**
   * Stops the speedhack and resets the multiplier to 1.0x.
   */
  async stop(): Promise<{ success: boolean }> {
    if (this.injected && this.flashPid && this.dataAddr) {
      await this.setSpeed(1.0);
    }
    this.injected = false;
    this.flashPid = null;
    this.dataAddr = null;
    this.currentSpeed = 1.0;
    console.log("[Speed] Service stopped.");
    return { success: true };
  }

  /**
   * Returns the current operational status of the speedhack.
   */
  getStatus() {
    return {
      active: this.injected,
      speed: this.currentSpeed,
      pid: this.flashPid,
    };
  }

  /**
   * Registers IPC handlers for renderer communication.
   */
  setupIPCHandlers(): void {
    ipcMain.handle("speed-start", async () => this.start());
    ipcMain.handle("speed-stop", async () => this.stop());
    ipcMain.handle("speed-set", async (_event, multiplier: number) => this.setSpeed(multiplier));
    ipcMain.handle("speed-status", async () => this.getStatus());
  }

  /**
   * Immediate cleanup upon application core termination.
   */
  kill(): void {
    this.injected = false;
    this.flashPid = null;
    this.dataAddr = null;
  }
}
