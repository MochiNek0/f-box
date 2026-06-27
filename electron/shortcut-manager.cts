import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  globalShortcut,
} from "electron";
import path from "path";
import fs from "fs";

export interface ShortcutManagerOptions {
  getWindow: () => BrowserWindow | null;
}

export class ShortcutManager {
  private mainWindow: () => BrowserWindow | null;
  private tray: Tray | null = null;
  private currentBossKey: string = "Escape";

  private updateBossKeyHandler: ((_event: any, key: string) => void) | null =
    null;
  private suspendBossKeyHandler: (() => void) | null = null;
  private resumeBossKeyHandler: (() => void) | null = null;

  constructor(options: ShortcutManagerOptions) {
    this.mainWindow = options.getWindow;
  }

  setupTray(): void {
    // Platform-specific icon
    let iconPath: string;
    if (process.platform === "darwin") {
      iconPath = path.join(__dirname, "..", "public", "icon.png");
    } else {
      iconPath = path.join(__dirname, "..", "public", "icon.ico");
    }

    if (!fs.existsSync(iconPath)) {
      console.warn("Tray icon not found at:", iconPath);
    }

    this.tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "显示窗口",
        click: () => {
          this.mainWindow()?.show();
          this.mainWindow()?.focus();
        },
      },
      {
        label: "退出",
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setToolTip("F-Box");
    this.tray.setContextMenu(contextMenu);

    this.tray.on("double-click", () => {
      this.mainWindow()?.show();
      this.mainWindow()?.focus();
    });
  }

  registerBossKey(key: string): boolean {
    globalShortcut.unregisterAll();
    try {
      const success = globalShortcut.register(key, () => {
        if (!this.mainWindow()) return;
        if (this.mainWindow()!.isVisible()) {
          this.mainWindow()!.hide();
        } else {
          this.mainWindow()!.show();
          this.mainWindow()!.focus();
        }
      });
      if (success) {
        console.log(`Boss Key registered: ${key}`);
        this.currentBossKey = key;
        return true;
      } else {
        console.warn(`Failed to register Boss Key: ${key}`);
        return false;
      }
    } catch (e) {
      console.error("Error registering Boss Key:", e);
      return false;
    }
  }

  suspendBossKey(): void {
    globalShortcut.unregisterAll();
    console.log("Boss Key suspended");
  }

  resumeBossKey(): void {
    this.registerBossKey(this.currentBossKey);
    console.log("Boss Key resumed");
  }

  getCurrentBossKey(): string {
    return this.currentBossKey;
  }

  setupIPCHandlers(): void {
    // Update Boss Key
    this.updateBossKeyHandler = (_event: any, key: string) => {
      this.registerBossKey(key);
    };
    ipcMain.on("update-boss-key", this.updateBossKeyHandler);

    // Suspend/Resume Boss Key
    this.suspendBossKeyHandler = () => {
      this.suspendBossKey();
    };
    ipcMain.on("suspend-boss-key", this.suspendBossKeyHandler);

    this.resumeBossKeyHandler = () => {
      this.resumeBossKey();
    };
    ipcMain.on("resume-boss-key", this.resumeBossKeyHandler);
  }

  cleanupIPCHandlers(): void {
    if (this.updateBossKeyHandler) {
      ipcMain.removeListener("update-boss-key", this.updateBossKeyHandler);
      this.updateBossKeyHandler = null;
    }
    if (this.suspendBossKeyHandler) {
      ipcMain.removeListener("suspend-boss-key", this.suspendBossKeyHandler);
      this.suspendBossKeyHandler = null;
    }
    if (this.resumeBossKeyHandler) {
      ipcMain.removeListener("resume-boss-key", this.resumeBossKeyHandler);
      this.resumeBossKeyHandler = null;
    }
  }

  dispose(): void {
    this.cleanupIPCHandlers();
    globalShortcut.unregisterAll();
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
