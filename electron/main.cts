import { app, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import { OcrManager } from "./ocr.cjs";
import { WindowManager } from "./window-manager.cjs";
import { ShortcutManager } from "./shortcut-manager.cjs";
import { ConfigManager } from "./config-manager.cjs";
import { AutomationManager } from "./automation-manager.cjs";
import { UpdateManager } from "./update-manager.cjs";

// ================================================================
// System Integrator - Flash Plugin Detection
// ================================================================
function findSystemFlashPlugin(): string | null {
  let searchPaths: string[] = [];
  let flashFileName = "";

  if (process.platform === "win32") {
    flashFileName = "pepflashplayer*.dll";
    if (process.arch === "x64") {
      searchPaths = [
        path.join("C:", "Windows", "System32", "Macromed", "Flash"),
      ];
    } else {
      searchPaths = [
        path.join("C:", "Windows", "SysWOW64", "Macromed", "Flash"),
        path.join("C:", "Windows", "System32", "Macromed", "Flash"),
      ];
    }
  } else if (process.platform === "darwin") {
    flashFileName = "PepperFlashPlayer.plugin";
    searchPaths = [
      "/Library/Internet Plug-Ins/PepperFlashPlayer/PepperFlashPlayer.plugin",
      path.join(
        app.getPath("userData"),
        "PepperFlash",
        "PepperFlashPlayer.plugin",
      ),
    ];
  }

  console.log(
    `Searching for Flash (${process.platform} ${process.arch}) in:`,
    searchPaths,
  );

  for (const dir of searchPaths) {
    if (fs.existsSync(dir)) {
      if (process.platform === "darwin" && dir.endsWith(".plugin")) {
        return dir;
      }

      try {
        const files = fs.readdirSync(dir);
        const flashFile = files.find((file) => {
          if (flashFileName.includes("*")) {
            const pattern = new RegExp(flashFileName.replace("*", ".*"));
            return pattern.test(file);
          }
          return file === flashFileName;
        });

        if (flashFile) {
          return path.join(dir, flashFile);
        }
      } catch (e) {
        console.error(`Error reading ${dir}:`, e);
      }
    }
  }
  return null;
}

// Disable Chromium sandbox for Cheat Engine compatibility
app.commandLine.appendSwitch("disable-features", "RendererCodeIntegrity");
app.commandLine.appendSwitch("disable-frame-rate-limit");
app.commandLine.appendSwitch("disable-gpu-vsync");

const flashPath = findSystemFlashPlugin();

if (flashPath) {
  console.log("Flash Plugin found:", flashPath);
  app.commandLine.appendSwitch("ppapi-flash-path", flashPath);
  app.commandLine.appendSwitch("ppapi-flash-version", "34.0.0.342");
  app.commandLine.appendSwitch("ignore-certificate-errors");
} else {
  console.warn(`Flash Plugin NOT found for arch: ${process.arch}`);
}

// Initialize managers
let ocrManager: OcrManager | null = null;
let windowManager: WindowManager | null = null;
let shortcutManager: ShortcutManager | null = null;
let configManager: ConfigManager | null = null;
let automationManager: AutomationManager | null = null;
let updateManager: UpdateManager | null = null;

// Get window reference (used by multiple managers)
const getWindow = () => windowManager?.getWindow() || null;

app.on("ready", () => {
  // Initialize all managers
  windowManager = new WindowManager(flashPath);
  shortcutManager = new ShortcutManager({ getWindow });
  configManager = new ConfigManager();
  ocrManager = new OcrManager();
  automationManager = new AutomationManager(getWindow, ocrManager);
  updateManager = new UpdateManager();

  // Setup
  windowManager.createWindow();
  windowManager.setupNewWindowHandler();
  configManager.ensureDefaultConfig();
  configManager.startAHK();
  shortcutManager.setupTray();
  shortcutManager.registerBossKey("Escape");

  // Setup IPC handlers
  configManager.setupIPCHandlers();
  shortcutManager.setupIPCHandlers();
  automationManager.setupIPCHandlers();
  updateManager.setupIPCHandlers();

  setupExternalLinkHandler();
  setupAppVersionHandler();
  setupFlashPIDHandler();
  setupOCRHandlers();
  setupAutomationOCRHandler();
});

// ---------------------------------------------------------------
// IPC Handlers - Core
// ---------------------------------------------------------------
function setupExternalLinkHandler(): void {
  ipcMain.on("open-external", (_event: any, url: string) => {
    shell.openExternal(url);
  });
}

function setupAppVersionHandler(): void {
  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });
}

// ---------------------------------------------------------------
// IPC Handlers - Flash
// ---------------------------------------------------------------
function setupFlashPIDHandler(): void {
  ipcMain.handle("get-flash-pid", () => {
    try {
      const metrics = app.getAppMetrics();
      const flashProcess = metrics.find((m) => m.type === "Pepper Plugin");
      if (flashProcess) {
        console.log("Found Flash Plugin PID:", flashProcess.pid);
        return flashProcess.pid;
      }

      const ppapiProcess = metrics.find(
        (m) => (m.type as string) === "Plugin" || m.name?.includes("ppapi"),
      );
      return ppapiProcess ? ppapiProcess.pid : null;
    } catch (e) {
      console.error("Failed to get Flash PID:", e);
      return null;
    }
  });
}

// ---------------------------------------------------------------
// IPC Handlers - OCR
// ---------------------------------------------------------------
function setupOCRHandlers(): void {
  ipcMain.handle("perform-ocr", async (_event, imageBase64: string) => {
    if (!ocrManager) {
      ocrManager = new OcrManager();
    }
    if (!ocrManager.isInstalled()) {
      return { success: false, error: "OCR 扩展包未安装" };
    }
    try {
      const result = await ocrManager.recognize(imageBase64);
      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("ocr-get-status", async () => {
    if (!ocrManager) ocrManager = new OcrManager();
    return { installed: ocrManager.isInstalled() };
  });

  ipcMain.handle("ocr-install", async (event) => {
    if (!ocrManager) ocrManager = new OcrManager();
    const success = await ocrManager.install((percent) => {
      event.sender.send("ocr-install-progress", percent);
    });
    return { success };
  });

  ipcMain.handle("ocr-uninstall", async () => {
    if (!ocrManager) ocrManager = new OcrManager();
    const success = await ocrManager.uninstall();
    return { success };
  });
}

// ---------------------------------------------------------------
// IPC Handlers - Automation OCR Response
// ---------------------------------------------------------------
function setupAutomationOCRHandler(): void {
  ipcMain.on(
    "automation-ocr-response",
    (
      _event,
      {
        requestId,
        text,
        matched,
      }: { requestId: string; text: string; matched: boolean },
    ) => {
      console.log(
        `OCR Result [id=${requestId}] from Renderer: "${text}", matched: ${matched}`,
      );
      automationManager?.handleOCRResponse({ requestId, text, matched });
    },
  );
}

// ---------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------
app.on("before-quit", () => {
  configManager?.killAHK();
  automationManager?.kill();
  ocrManager?.kill();
  shortcutManager?.dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
