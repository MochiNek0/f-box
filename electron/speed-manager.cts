import { app, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { spawn, execSync, ChildProcess } from "child_process";
import { killProcessTree } from "./process-utils.cjs";

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
  private injectorProcess: ChildProcess | null = null;
  private injectorTimeout: NodeJS.Timeout | null = null;
  // setSpeed coalescing — see setSpeed() for rationale
  private setSpeedDrain: Promise<void> | null = null;
  private pendingSetSpeed: number | null = null;

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
    const pid = this.getFlashPid();
    if (!pid) return { success: false, error: "Flash 进程未就绪" };

    // If already injected but PID changed (e.g. crash/reload), reset state
    if (this.injected && this.flashPid !== pid) {
      this.injected = false;
      this.dataAddr = null;
    }

    if (this.injected) return { success: true };

    const is64 = await this.isProcess64Bit(pid);
    const injectorExe = this.getInjectorPath(is64);
    const dllPath = this.getDllPath(is64);

    if (!fs.existsSync(injectorExe) || !fs.existsSync(dllPath)) {
      return { success: false, error: "核心组件 (Native) 丢失" };
    }

    return new Promise((resolve) => {
      try {
        // Kill previous injector process if still running
        this.cleanupInjector();

        const proc = spawn(injectorExe, [pid.toString(), dllPath, "1.0"], {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        this.injectorProcess = proc;

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
            // Only report success if injection handshake was confirmed via stdout.
            // Exit code 0 alone is insufficient — the injector may exit 0 without
            // ever printing STATUS|INJECTED, leaving dataAddr / injected unset.
            if (code === 0 && this.injected) {
              resolve({ success: true });
            } else if (code === 0) {
              resolve({ success: false, error: "注入器未完成握手" });
            } else {
              resolve({ success: false, error: "注入器非正常退出" });
            }
          }
        });

        // Async spawn errors (ENOENT, EACCES, AV block, etc.) surface here
        // rather than as a thrown exception. Without this listener, an
        // unhandled 'error' event would crash the main process.
        proc.on("error", (err) => {
          if (!resolved) {
            resolved = true;
            if (this.injectorTimeout) {
              clearTimeout(this.injectorTimeout);
              this.injectorTimeout = null;
            }
            resolve({ success: false, error: err.message || "注入器启动失败" });
          }
        });

        this.injectorTimeout = setTimeout(() => {
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
   *
   * Coalesces concurrent calls: each spawn opens the target process, writes
   * to shared memory, and exits. Firing 20+ injectors in a 200ms slider drag
   * triggers AV heuristics, races the writes against each other (later
   * spawns can finish first → speed snaps back), and can exhaust process
   * handles. We keep at most one injector in flight at a time; any calls
   * during the spawn only update `pendingSetSpeed` so we apply the LATEST
   * value when the in-flight injector finishes. Slider drag → at most 2
   * injectors (first value + final value), no AV noise, no race.
   */
  async setSpeed(multiplier: number): Promise<{ success: boolean; error?: string }> {
    if (!this.injected || !this.flashPid || !this.dataAddr) {
      return { success: false, error: "尚未开启变速" };
    }

    if (this.setSpeedDrain) {
      // Queue the latest desired value; the in-flight drain loop will
      // apply it before exiting. Return immediately so slider drag stays
      // responsive — the caller doesn't block on the actual write.
      this.pendingSetSpeed = multiplier;
      return { success: true };
    }

    const drain = this.runSetSpeedDrain(multiplier);
    this.setSpeedDrain = drain;
    try {
      await drain;
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || "写入失败" };
    } finally {
      this.setSpeedDrain = null;
      // On success the drain loop already consumed pendingSetSpeed. On a spawn
      // failure it bails out early, so a value queued by a coalesced call
      // during the drag would otherwise be silently dropped here — the game
      // would stay at the last-written speed while the UI shows the requested
      // one. Re-arm a fresh drain (fire-and-forget) for that leftover value so
      // the user's latest slider position still gets applied. Bounded: the new
      // drain has no pending value of its own, so a repeated failure stops
      // after one retry rather than looping.
      const leftover = this.pendingSetSpeed;
      this.pendingSetSpeed = null;
      if (leftover !== null && leftover !== this.currentSpeed) {
        void this.setSpeed(leftover);
      }
    }
  }

  /**
   * Drives the inner write loop: spawn → wait → check pending → repeat.
   * Stops on first spawn failure (next user setSpeed will re-arm).
   */
  private async runSetSpeedDrain(initial: number): Promise<void> {
    let target = initial;
    while (true) {
      await this.spawnSetSpeedOnce(target);
      this.currentSpeed = target;
      if (
        this.pendingSetSpeed === null ||
        this.pendingSetSpeed === this.currentSpeed
      ) {
        break;
      }
      target = this.pendingSetSpeed;
      this.pendingSetSpeed = null;
    }
  }

  /**
   * Spawn a single injector --speed run and resolve when it exits cleanly.
   * Wraps async spawn errors and adds a 3s safety timeout so a stuck
   * injector can't block the coalescing queue forever.
   */
  private spawnSetSpeedOnce(multiplier: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // If stop() ran while we were in the drain loop, injected/flashPid/
      // dataAddr have been cleared. Reject so the drain loop exits cleanly
      // rather than crashing on a null-deref of `this.flashPid!`.
      if (!this.injected || !this.flashPid || !this.dataAddr) {
        reject(new Error("已停止"));
        return;
      }

      const injectorExe = this.getInjectorPath(this.is64Bit);
      let settled = false;
      let timer: NodeJS.Timeout | null = null;

      const finalize = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        fn();
      };

      let child: ChildProcess;
      try {
        child = spawn(
          injectorExe,
          [
            "--speed",
            this.flashPid!.toString(),
            this.dataAddr!,
            multiplier.toString(),
          ],
          { windowsHide: true, stdio: "ignore" },
        );
      } catch (e: any) {
        reject(e);
        return;
      }

      child.on("error", (err) => {
        console.error("[Speed] setSpeed injector spawn error:", err);
        finalize(() => reject(err));
      });

      child.on("exit", (code) => {
        finalize(() => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`injector exited with code ${code}`));
          }
        });
      });

      timer = setTimeout(() => {
        finalize(() => {
          try {
            child.kill();
          } catch {
            // ignore
          }
          reject(new Error("setSpeed 超时"));
        });
      }, 3000);
    });
  }

  /**
   * Stops the speedhack and resets the multiplier to 1.0x.
   *
   * Coordinates with the setSpeed coalescing queue: if a drain is in
   * flight, we queue 1.0 as its next value AND wait for it to settle
   * before tearing down state. Otherwise the in-flight injector could
   * leave the DLL holding the user's last slider value (e.g. 5x) after
   * "stop" appears to have run — the UI says inactive, the game still
   * runs fast until reload.
   *
   * NOTE: this deliberately does NOT just `await this.setSpeed(1.0)`. When a
   * drain is active, setSpeed queues the value and returns IMMEDIATELY (by
   * design, so the slider stays responsive — the renderer awaits setSpeed
   * before updating the UI). Awaiting it here would therefore return before
   * 1.0 is actually written. We must await the drain promise itself. Do not
   * "simplify" this into a single setSpeed call.
   */
  async stop(): Promise<{ success: boolean }> {
    if (this.injected && this.flashPid && this.dataAddr) {
      if (this.setSpeedDrain) {
        // Drain is active — queue 1.0 as the final value and wait.
        this.pendingSetSpeed = 1.0;
        try {
          await this.setSpeedDrain;
        } catch {
          // Already logged inside the drain; proceed with teardown.
        }
      } else {
        await this.setSpeed(1.0);
      }
    }
    this.cleanupInjector();
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
   * Clean up the injector process (timeout, listeners, process).
   */
  private cleanupInjector(): void {
    if (this.injectorTimeout) {
      clearTimeout(this.injectorTimeout);
      this.injectorTimeout = null;
    }
    let pid: number | undefined;
    if (this.injectorProcess && !this.injectorProcess.killed) {
      pid = this.injectorProcess.pid;
      try {
        this.injectorProcess.removeAllListeners();
        this.injectorProcess.stdout?.removeAllListeners();
        this.injectorProcess.stderr?.removeAllListeners();
        this.injectorProcess.kill();
      } catch (e) {
        // ignore
      }
    }
    this.injectorProcess = null;
    killProcessTree(pid);
  }

  /**
   * Immediate cleanup upon application core termination.
   */
  kill(): void {
    this.cleanupInjector();
    this.injected = false;
    this.flashPid = null;
    this.dataAddr = null;
  }

  /**
   * Remove IPC handlers registered by this manager.
   */
  cleanupIPCHandlers(): void {
    ipcMain.removeHandler("speed-start");
    ipcMain.removeHandler("speed-stop");
    ipcMain.removeHandler("speed-set");
    ipcMain.removeHandler("speed-status");
  }
}
