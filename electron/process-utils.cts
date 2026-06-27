import { spawn } from "child_process";

/**
 * Forcefully terminate a process and its entire child tree (Windows).
 *
 * `ChildProcess.kill()` only signals the immediate process. The native
 * helpers we spawn (AutoHotkey automation/keymap, the DLL injector, the
 * PaddleOCR worker) can leave orphaned descendants that survive a plain
 * kill — `taskkill /F /T` force-kills the whole tree. Best-effort: any
 * failure (process already gone, no permission) is swallowed.
 *
 * Fire-and-forget async spawn: the result is never read, and `taskkill /T`
 * can take a while to walk a deep tree (slower under AV). Using the
 * synchronous form would block the Electron main/UI thread on every Stop
 * and serially during app quit, freezing the window. We attach an 'error'
 * listener so a spawn failure can't crash the main process.
 */
export function killProcessTree(pid: number | undefined | null): void {
  if (process.platform !== "win32" || !pid) return;
  try {
    const child = spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.on("error", () => {
      // best-effort cleanup — process already gone, no permission, etc.
    });
    child.unref();
  } catch {
    // best-effort cleanup
  }
}
