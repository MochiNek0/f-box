import { app, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, ChildProcess, execSync } from "child_process";

export class SpeedManager {
  private injected = false;
  private currentSpeed = 1.0;
  private flashPid: number | null = null;

  /**
   * Get the native injector path based on bitness
   */
  private getInjectorPath(is64bit: boolean): string {
    const exeName = is64bit ? "injector64.exe" : "injector32.exe";
    return app.isPackaged
      ? path.join(process.resourcesPath, exeName)
      : path.join(__dirname, "..", "public", "assets", exeName);
  }

  /**
   * Determine the DLL path based on target process bitness
   */
  private getDllPath(is64bit: boolean): string {
    const dllName = is64bit ? "speedhack64.dll" : "speedhack32.dll";
    return app.isPackaged
      ? path.join(process.resourcesPath, dllName)
      : path.join(__dirname, "..", "public", "assets", dllName);
  }

  /**
   * Get the speed file path for a given PID
   */
  private getSpeedFilePath(pid: number): string {
    return path.join(os.tmpdir(), `fbox_speed_${pid}.txt`);
  }

  /**
   * Detect if a process is 64-bit
   */
  private async isProcess64Bit(pid: number): Promise<boolean> {
    try {
      const command = `powershell -NoProfile -Command "(Get-Process -Id ${pid}).Path"`;
      const procPath = execSync(command, { encoding: "utf-8" }).trim();

      if (procPath) {
        const lower = procPath.toLowerCase();
        if (lower.includes("syswow64")) return false;

        try {
          const fd = fs.openSync(procPath, "r");
          const dosHeader = Buffer.alloc(64);
          fs.readSync(fd, dosHeader, 0, 64, 0);

          const peOffset = dosHeader.readUInt32LE(60);
          const peHeader = Buffer.alloc(6);
          fs.readSync(fd, peHeader, 0, 6, peOffset);
          fs.closeSync(fd);

          const machine = peHeader.readUInt16LE(4);
          return machine === 0x8664 || machine === 0xaa64;
        } catch {
          return process.arch === "x64";
        }
      }
    } catch (e) {
      console.error("[Speed] Failed to detect process bitness:", e);
    }
    return process.arch === "x64";
  }

  /**
   * Find the Flash plugin PID from Electron metrics
   */
  private getFlashPid(): number | null {
    try {
      const metrics = app.getAppMetrics();
      const flash = metrics.find((m) => m.type === "Pepper Plugin");
      if (flash) return flash.pid;

      const ppapi = metrics.find(
        (m) => (m.type as string) === "Plugin" || m.name?.includes("ppapi"),
      );
      return ppapi ? ppapi.pid : null;
    } catch (e) {
      console.error("[Speed] Failed to get Flash PID:", e);
      return null;
    }
  }

  /**
   * Write speed multiplier to the speed file
   */
  private writeSpeedFile(pid: number, speed: number): void {
    try {
      const filePath = this.getSpeedFilePath(pid);
      fs.writeFileSync(filePath, speed.toString(), "utf-8");
    } catch (e) {
      console.error("[Speed] Failed to write speed file:", e);
    }
  }

  /**
   * Delete the speed file
   */
  private deleteSpeedFile(pid: number): void {
    try {
      const filePath = this.getSpeedFilePath(pid);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error("[Speed] Failed to delete speed file:", e);
    }
  }

  /**
   * Start the speedhack: find Flash PID, inject DLL, set initial speed
   */
  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.injected) {
      return { success: false, error: "变速齿轮已在运行中" };
    }

    const pid = this.getFlashPid();
    if (!pid) {
      return { success: false, error: "未找到 Flash 插件进程，请先加载一个 Flash 游戏" };
    }

    // Detect process bitness
    const is64 = await this.isProcess64Bit(pid);
    
    // Choose compatible injector and DLL
    const injectorExe = this.getInjectorPath(is64);
    const dllPath = this.getDllPath(is64);

    console.log(`[Speed] Flash PID: ${pid}, 64-bit: ${is64}`);
    console.log(`[Speed] Injector: ${injectorExe}`);
    console.log(`[Speed] DLL: ${dllPath}`);

    if (!fs.existsSync(injectorExe)) {
      return { success: false, error: `未找到注入器: ${path.basename(injectorExe)}` };
    }

    if (!fs.existsSync(dllPath)) {
      return { success: false, error: `未找到 speedhack DLL: ${path.basename(dllPath)}` };
    }

    // Write initial speed file
    this.writeSpeedFile(pid, this.currentSpeed);

    // Run native injector
    return new Promise((resolve) => {
      try {
        const proc = spawn(injectorExe, [pid.toString(), dllPath], {
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
              this.injected = true;
              this.flashPid = pid;
              console.log(`[Speed] DLL injected successfully into PID ${pid}`);
              if (!resolved) {
                resolved = true;
                resolve({ success: true });
              }
            } else if (trimmed.includes("STATUS|ERROR")) {
              const errorMsg = trimmed.split("|").pop();
              console.error(`[Speed] Injection error: ${trimmed}`);
              if (!resolved) {
                resolved = true;
                resolve({ success: false, error: `注入失败: ${errorMsg}` });
              }
            }
          }
        });

        proc.stderr?.on("data", (data: Buffer) => {
          console.error("[Speed] Injector stderr:", data.toString());
        });

        proc.on("exit", (code) => {
          if (!resolved) {
            resolved = true;
            if (code === 0) {
              this.injected = true;
              this.flashPid = pid;
              resolve({ success: true });
            } else {
              resolve({ success: false, error: `注入器退出码: ${code}` });
            }
          }
        });

        // Timeout after 15 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try { proc.kill(); } catch {}
            resolve({ success: false, error: "注入超时" });
          }
        }, 15000);
      } catch (e: any) {
        resolve({ success: false, error: e.message });
      }
    });
  }

  /**
   * Set the speed multiplier
   */
  async setSpeed(
    multiplier: number,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.injected || !this.flashPid) {
      return { success: false, error: "变速齿轮未启动" };
    }

    if (multiplier < 0.01 || multiplier > 999) {
      return { success: false, error: "速度值超出范围 (0.01 ~ 999)" };
    }

    this.currentSpeed = multiplier;
    this.writeSpeedFile(this.flashPid, multiplier);
    console.log(`[Speed] Speed set to ${multiplier}x`);
    return { success: true };
  }

  /**
   * Stop the speedhack: reset speed to 1.0 and clean up
   */
  async stop(): Promise<{ success: boolean }> {
    if (this.flashPid) {
      // Set speed back to 1.0 before cleaning up
      this.writeSpeedFile(this.flashPid, 1.0);

      // Give the DLL time to read the reset value
      await new Promise((resolve) => setTimeout(resolve, 300));

      this.deleteSpeedFile(this.flashPid);
    }

    this.injected = false;
    this.flashPid = null;
    this.currentSpeed = 1.0;
    console.log("[Speed] Speedhack stopped");
    return { success: true };
  }

  /**
   * Get current status
   */
  getStatus(): {
    active: boolean;
    speed: number;
    pid: number | null;
  } {
    return {
      active: this.injected,
      speed: this.currentSpeed,
      pid: this.flashPid,
    };
  }

  /**
   * Register IPC handlers
   */
  setupIPCHandlers(): void {
    ipcMain.handle("speed-start", async () => {
      return this.start();
    });

    ipcMain.handle("speed-stop", async () => {
      return this.stop();
    });

    ipcMain.handle("speed-set", async (_event, multiplier: number) => {
      return this.setSpeed(multiplier);
    });

    ipcMain.handle("speed-status", async () => {
      return this.getStatus();
    });
  }

  /**
   * Cleanup on app quit
   */
  kill(): void {
    if (this.flashPid) {
      // Reset speed to 1.0
      this.writeSpeedFile(this.flashPid, 1.0);
      // Slight delay not possible in sync context, just delete
      this.deleteSpeedFile(this.flashPid);
    }
    this.injected = false;
    this.flashPid = null;
  }
}
