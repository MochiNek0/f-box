import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  globalShortcut,
  shell,
} from "electron";
import path from "path";
import fs from "fs";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentBossKey: string = "Escape";

// Configure Flash Plugin via System Search
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
    // macOS
    flashFileName = "PepperFlashPlayer.plugin";
    searchPaths = [
      "/Library/Internet Plug-Ins/PepperFlashPlayer/PepperFlashPlayer.plugin",
      path.join(
        app.getPath("userData"),
        "PepperFlash",
        "PepperFlashPlayer.plugin",
      ),
    ];
  } else if (process.platform === "linux") {
    // Linux
    flashFileName = "libpepflashplayer.so";
    searchPaths = [
      "/usr/lib/adobe-flashplugin/libpepflashplayer.so",
      "/usr/lib/pepperflashplugin-nonfree/libpepflashplayer.so",
      "/usr/lib/PepperFlash/libpepflashplayer.so",
      "/opt/google/chrome/PepperFlash/libpepflashplayer.so",
    ];
  }

  console.log(
    `Searching for Flash (${process.platform} ${process.arch}) in:`,
    searchPaths,
  );

  for (const dir of searchPaths) {
    if (fs.existsSync(dir)) {
      // If the path itself is the plugin (macOS .plugin is a directory)
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

const flashPath = findSystemFlashPlugin();

if (flashPath) {
  console.log("Flash Plugin found:", flashPath);
  app.commandLine.appendSwitch("ppapi-flash-path", flashPath);
  app.commandLine.appendSwitch("ppapi-flash-version", "34.0.0.342"); // Optional: Try forcing version if known, or parse from filename
  // Additional helpful switches for Flash
  app.commandLine.appendSwitch("ignore-certificate-errors");
} else {
  console.warn(`Flash Plugin NOT found for arch: ${process.arch}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
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
      plugins: true, // Enable plugins (Flash)
      preload: path.join(__dirname, "preload.cjs"),
    },
    backgroundColor: "#00000000", // Allow transparency
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Window Controls IPC
  ipcMain.on(
    "window-controls",
    (_event: any, action: "minimize" | "maximize" | "close") => {
      if (!mainWindow) return;
      switch (action) {
        case "minimize":
          mainWindow.minimize();
          break;
        case "maximize":
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
          } else {
            mainWindow.maximize();
          }
          break;
        case "close":
          mainWindow.close();
          break;
      }
    },
  );

  // Opacity Control IPC
  ipcMain.on("set-opacity", (_event: any, opacity: number) => {
    if (mainWindow) {
      mainWindow.setOpacity(opacity);
    }
  });

  // Flash Detection IPC
  ipcMain.handle("check-flash", () => {
    return flashPath ? fs.existsSync(flashPath) : false;
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Handle minimize to tray
  mainWindow.on("minimize", (event: any) => {
    event.preventDefault();
    mainWindow?.hide();
  });
}

function registerBossKey(key: string) {
  globalShortcut.unregisterAll();
  try {
    const success = globalShortcut.register(key, () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    if (success) {
      console.log(`Boss Key registered: ${key}`);
      currentBossKey = key;
    } else {
      console.warn(`Failed to register Boss Key: ${key}`);
    }
  } catch (e) {
    console.error("Error registering Boss Key:", e);
  }
}

function setupTray() {
  const iconPath = path.join(__dirname, "..", "public", "icon.ico");

  if (!fs.existsSync(iconPath)) {
    console.warn("Tray icon not found at:", iconPath);
  }

  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示窗口",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: "退出",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Flash Game Browser");
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.on("ready", () => {
  createWindow();
  setupTray();
  registerBossKey(currentBossKey);
});

// IPC for updating Boss Key
ipcMain.on("update-boss-key", (_event: any, key: string) => {
  registerBossKey(key);
});

// IPC for opening external links
ipcMain.on("open-external", (_event: any, url: string) => {
  shell.openExternal(url);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
