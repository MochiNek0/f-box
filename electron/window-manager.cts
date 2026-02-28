import { app, BrowserWindow, ipcMain, screen, nativeImage } from "electron";
import path from "path";
import fs from "fs";

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private flashPath: string | null = null;

  constructor(flashPath: string | null) {
    this.flashPath = flashPath;
  }

  getWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  createWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 320,
      frame: false, // Frameless window
      transparent: false, // Start as non-transparent
      icon: path.join(__dirname, "..", "public", "icon.ico"),
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
    this.setupWindowEvents();

    return this.mainWindow;
  }

  private setupWindowControls(): void {
    ipcMain.on(
      "window-controls",
      (_event: any, action: "minimize" | "maximize" | "close") => {
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
      },
    );
  }

  private setupOpacityControl(): void {
    ipcMain.on("set-opacity", (_event: any, opacity: number) => {
      if (this.mainWindow) {
        this.mainWindow.setOpacity(opacity);
      }
    });
  }

  private setupFlashDetection(): void {
    ipcMain.handle("check-flash", () => {
      const result = this.flashPath ? fs.existsSync(this.flashPath) : false;
      return result;
    });
  }

  getFlashPath(): string | null {
    return this.flashPath;
  }

  private setupWindowEvents(): void {
    if (!this.mainWindow) return;

    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
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
}
