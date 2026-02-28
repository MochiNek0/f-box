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

  constructor(options: ShortcutManagerOptions) {
    this.mainWindow = options.getWindow;
  }

  setupTray(): void {
    const iconPath = path.join(__dirname, "..", "public", "icon.ico");

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

    this.tray.setToolTip("Flash Game Browser");
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
    ipcMain.on("update-boss-key", (_event: any, key: string) => {
      this.registerBossKey(key);
    });

    // Suspend/Resume Boss Key
    ipcMain.on("suspend-boss-key", () => {
      this.suspendBossKey();
    });

    ipcMain.on("resume-boss-key", () => {
      this.resumeBossKey();
    });
  }

  dispose(): void {
    globalShortcut.unregisterAll();
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
