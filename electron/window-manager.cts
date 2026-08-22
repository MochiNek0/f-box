import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import fs from "fs";

// Wallpaper for the crop letterbox area. It travels to the guest as a data URL
// (a file:// subresource in an http page is unreliable), so keep it small
// enough that base64-ing it over IPC stays cheap.
const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;
const BACKGROUND_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

// Reported by the check-flash IPC. `active` is the only thing that decides
// whether games can run in THIS session; `needsRestart` distinguishes "no
// Flash anywhere" from "Flash is on disk but not the copy we launched with".
export interface FlashStatus {
  active: boolean;
  needsRestart: boolean;
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private flashPath: string | null = null;
  private resolveFlashPath: () => string | null;
  private windowControlsHandler: ((
    _event: any,
    action: "minimize" | "maximize" | "close",
  ) => void) | null = null;
  private setOpacityHandler: ((_event: any, opacity: number) => void) | null =
    null;
  private checkFlashHandler: (() => FlashStatus) | null = null;
  private toggleFullScreenHandler: (() => void) | null = null;
  private pickBackgroundHandler:
    (() => Promise<{ canceled: boolean; path?: string }>) | null = null;
  private readBackgroundHandler:
    | ((
        _event: any,
        filePath: string,
      ) => Promise<{ success: boolean; dataUrl?: string; error?: string }>)
    | null = null;

  constructor(flashPath: string | null, resolveFlashPath: () => string | null) {
    this.flashPath = flashPath;
    this.resolveFlashPath = resolveFlashPath;
  }

  getWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  createWindow(): BrowserWindow {
    // Platform-specific icon
    let iconPath: string;
    if (process.platform === "darwin") {
      iconPath = path.join(__dirname, "..", "public", "icon.png");
    } else {
      iconPath = path.join(__dirname, "..", "public", "icon.ico");
    }

    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 320,
      frame: false, // Frameless window
      transparent: false, // Start as non-transparent
      icon: iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webviewTag: true, // Enable <webview> tag
        plugins: true, // Enable Flash
        preload: path.join(__dirname, "preload.cjs"),
        backgroundThrottling: false,
      },
      backgroundColor: "#00000000", // Allow transparency
    });

    if (!app.isPackaged) {
      this.mainWindow.loadURL("http://localhost:5173");
      // this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    }

    this.setupWindowControls();
    this.setupOpacityControl();
    this.setupFlashDetection();
    this.setupFullScreenControl();
    this.setupBackgroundImage();
    this.setupWindowEvents();

    return this.mainWindow;
  }

  toggleFullScreen(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
  }

  private setupWindowControls(): void {
    this.windowControlsHandler = (_event: any, action: "minimize" | "maximize" | "close") => {
      if (!this.mainWindow) return;
      switch (action) {
        case "minimize":
          this.mainWindow.minimize();
          break;
        case "maximize":
          if (this.mainWindow.isMaximized()) {
            this.mainWindow.unmaximize();
          } else {
            this.mainWindow.maximize();
          }
          break;
        case "close":
          this.mainWindow.close();
          break;
      }
    };
    ipcMain.on("window-controls", this.windowControlsHandler);
  }

  private setupOpacityControl(): void {
    this.setOpacityHandler = (_event: any, opacity: number) => {
      if (this.mainWindow) {
        this.mainWindow.setOpacity(opacity);
      }
    };
    ipcMain.on("set-opacity", this.setOpacityHandler);
  }

  private setupFlashDetection(): void {
    // The Flash DLL carries its version in the filename, and every flash.cn
    // install ships FlashHelperService, an auto-updating Windows service that
    // starts with the OS. So the path resolved at launch can vanish under us
    // (an update swaps the file), and a launch that lands mid-update can find
    // nothing at all even though Flash is installed moments later.
    //
    // --ppapi-flash-path is a Chromium switch fixed before 'ready', so a
    // rescan can never make the current session load a different DLL. Rescan
    // only to tell the user which of the two situations they are in: Flash
    // genuinely missing, or present but not the copy this process launched
    // with (restart required).
    this.checkFlashHandler = (): FlashStatus => {
      if (this.flashPath && fs.existsSync(this.flashPath)) {
        return { active: true, needsRestart: false };
      }
      let rescanned: string | null = null;
      try {
        rescanned = this.resolveFlashPath();
      } catch (e) {
        console.error("Flash rescan failed:", e);
      }
      return { active: false, needsRestart: !!rescanned };
    };
    ipcMain.handle("check-flash", this.checkFlashHandler);
  }

  private setupFullScreenControl(): void {
    this.toggleFullScreenHandler = () => {
      this.toggleFullScreen();
    };
    ipcMain.on("toggle-fullscreen", this.toggleFullScreenHandler);
  }

  private setupBackgroundImage(): void {
    this.pickBackgroundHandler = async () => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        return { canceled: true };
      }
      const result = await dialog.showOpenDialog(this.mainWindow, {
        title: "选择背景图片",
        properties: ["openFile"],
        filters: [
          {
            name: "图片",
            extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"],
          },
        ],
      });
      if (result.canceled || !result.filePaths.length) {
        return { canceled: true };
      }
      return { canceled: false, path: result.filePaths[0] };
    };
    ipcMain.handle("pick-background-image", this.pickBackgroundHandler);

    this.readBackgroundHandler = async (_event: any, filePath: string) => {
      try {
        if (!filePath || !fs.existsSync(filePath)) {
          return { success: false, error: "图片文件不存在" };
        }
        const mime = BACKGROUND_MIME[path.extname(filePath).toLowerCase()];
        if (!mime) {
          return { success: false, error: "不支持的图片格式" };
        }
        const { size } = fs.statSync(filePath);
        if (size > MAX_BACKGROUND_BYTES) {
          return { success: false, error: "图片超过 8MB，请换一张更小的" };
        }
        const base64 = fs.readFileSync(filePath).toString("base64");
        return { success: true, dataUrl: `data:${mime};base64,${base64}` };
      } catch (e: any) {
        console.error("Failed to read background image:", e);
        return { success: false, error: e?.message || "读取图片失败" };
      }
    };
    ipcMain.handle("read-background-image", this.readBackgroundHandler);
  }

  private setupWindowEvents(): void {
    if (!this.mainWindow) return;

    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    // The renderer hides its own chrome in fullscreen, so it has to know when
    // the state changes — including changes it did not initiate (F11 handled
    // in main, or the OS).
    this.mainWindow.on("enter-full-screen", () => {
      this.mainWindow?.webContents.send("fullscreen-changed", true);
    });
    this.mainWindow.on("leave-full-screen", () => {
      this.mainWindow?.webContents.send("fullscreen-changed", false);
    });

    // Handle minimize to tray
    this.mainWindow.on("minimize", (event: any) => {
      event.preventDefault();
      this.mainWindow?.hide();
    });
  }

  setupNewWindowHandler(): void {
    app.on("web-contents-created", (_event, contents) => {
      // @ts-ignore
      contents.on("new-window", (e, url, frameName, disposition, options) => {
        if (options && options.webPreferences) {
          options.webPreferences.nodeIntegration = false;
          options.webPreferences.contextIsolation = true;
          options.webPreferences.plugins = true; // Enable Flash in popups
        }
      });
    });
  }

  destroy(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy();
    }
    this.mainWindow = null;
  }

  cleanup(): void {
    if (this.windowControlsHandler) {
      ipcMain.removeListener("window-controls", this.windowControlsHandler);
      this.windowControlsHandler = null;
    }
    if (this.setOpacityHandler) {
      ipcMain.removeListener("set-opacity", this.setOpacityHandler);
      this.setOpacityHandler = null;
    }
    if (this.checkFlashHandler) {
      ipcMain.removeHandler("check-flash");
      this.checkFlashHandler = null;
    }
    if (this.toggleFullScreenHandler) {
      ipcMain.removeListener("toggle-fullscreen", this.toggleFullScreenHandler);
      this.toggleFullScreenHandler = null;
    }
    if (this.pickBackgroundHandler) {
      ipcMain.removeHandler("pick-background-image");
      this.pickBackgroundHandler = null;
    }
    if (this.readBackgroundHandler) {
      ipcMain.removeHandler("read-background-image");
      this.readBackgroundHandler = null;
    }
  }
}
