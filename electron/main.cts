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
import os from "os";
import { spawn, ChildProcess } from "child_process";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentBossKey: string = "Escape";
let ahkProcess: any = null;
let automationProcess: ChildProcess | null = null;
let currentRecordingPath: string | null = null;
const configDir = path.join(os.homedir(), ".f-box");
const configPath = path.join(configDir, "keymap.ini");
const scriptsDir = path.join(configDir, "scripts");
const scriptsConfigDir = path.join(configDir, "scripts_config");

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

function ensureDefaultConfig() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    const defaultConfig = `[Settings]
enabled=1

[Mappings]
1 = Numpad1
2 = Numpad2
3 = Numpad3
4 = Numpad4
5 = Numpad5
6 = Numpad6
7 = Numpad7
8 = Numpad8
9 = Numpad9
0 = Numpad0`;
    fs.writeFileSync(configPath, defaultConfig.trim());
  }
}

function parseIni(content: string) {
  const lines = content.split(/\r?\n/);
  let enabled = true;
  const mappings: Array<{ source: string; target: string }> = [];
  let currentSection = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      currentSection = trimmed.slice(1, -1);
    } else if (trimmed.includes("=") && !trimmed.startsWith(";")) {
      const pos = trimmed.indexOf("=");
      const key = trimmed.slice(0, pos).trim();
      const value = trimmed.slice(pos + 1).trim();
      if (currentSection === "Settings" && key === "enabled") {
        enabled = value === "1";
      } else if (currentSection === "Mappings") {
        if (key && value) {
          mappings.push({ source: key, target: value });
        }
      }
    }
  }

  return { enabled, mappings };
}

function generateIni(
  enabled: boolean,
  mappings: Array<{ source: string; target: string }>,
) {
  let content = `[Settings]\nenabled=${enabled ? "1" : "0"}\n\n[Mappings]\n`;
  for (const m of mappings) {
    content += `${m.source} = ${m.target}\n`;
  }
  return content.trim();
}

function startAHK() {
  if (ahkProcess) {
    ahkProcess.kill();
    ahkProcess = null;
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const { enabled } = parseIni(content);
  if (!enabled) return;

  const ahkPath = app.isPackaged
    ? path.join(process.resourcesPath, "keymap.exe")
    : path.join(__dirname, "..", "public", "assets", "keymap.exe"); // dev 时路径

  if (!fs.existsSync(ahkPath)) {
    console.warn("keymap.exe 未找到，无法启动键盘映射");
    return;
  }

  ahkProcess = spawn(ahkPath, [configPath, process.pid.toString()]);
  ahkProcess.on("error", (err: any) => {
    console.error("AHK 启动失败:", err);
  });
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
  ensureDefaultConfig();
  startAHK();
  setupTray();
  registerBossKey(currentBossKey);

  // Handle new window creation (for game popups like Seer login)
  app.on("web-contents-created", (_event, contents) => {
    // Electron 11 uses 'new-window' event
    // @ts-ignore
    contents.on("new-window", (e, url, frameName, disposition, options) => {
      // Ensure new windows have correct settings
      if (options && options.webPreferences) {
        options.webPreferences.nodeIntegration = false;
        options.webPreferences.contextIsolation = true;
        options.webPreferences.plugins = true; // Enable Flash in popups
      }
    });
  });
});

// IPC for updating Boss Key
ipcMain.on("update-boss-key", (_event: any, key: string) => {
  registerBossKey(key);
});

// IPC for opening external links
ipcMain.on("open-external", (_event: any, url: string) => {
  shell.openExternal(url);
});

// 获取当前配置
ipcMain.handle("get-keymap-config", () => {
  ensureDefaultConfig();
  const content = fs.readFileSync(configPath, "utf-8");
  return parseIni(content);
});

// 保存配置（始终完整保存并根据 enabled 重启 AHK）
ipcMain.on(
  "save-keymap-config",
  (
    _event,
    config: {
      enabled: boolean;
      mappings: Array<{ source: string; target: string }>;
    },
  ) => {
    const content = generateIni(config.enabled, config.mappings);
    fs.writeFileSync(configPath, content);
    startAHK();
  },
);

// IPC for suspending/resuming Boss Key
ipcMain.on("suspend-boss-key", () => {
  globalShortcut.unregisterAll();
  console.log("Boss Key suspended");
});

ipcMain.on("resume-boss-key", () => {
  registerBossKey(currentBossKey);
  console.log("Boss Key resumed");
});

// IPC for suspending/resuming Keymapping (AHK)
ipcMain.on("suspend-keymap", () => {
  if (ahkProcess) {
    ahkProcess.kill();
    ahkProcess = null;
    console.log("Keymap (AHK) suspended");
  }
});

ipcMain.on("resume-keymap", () => {
  startAHK();
  console.log("Keymap (AHK) resumed");
});

// =================================================================
// Automation IPC Handlers
// =================================================================

function getAutomationRuntime(): {
  exe: string;
  args: string[];
  isAhk: boolean;
} {
  const possibleAhkPaths = [
    "C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey.exe",
    "C:\\Program Files (x86)\\AutoHotkey\\v2\\AutoHotkey.exe",
    path.join(
      os.homedir(),
      "AppData\\Local\\Programs\\AutoHotkey\\v2\\AutoHotkey.exe",
    ),
  ];

  let ahkPath = "";
  for (const p of possibleAhkPaths) {
    if (fs.existsSync(p)) {
      ahkPath = p;
      break;
    }
  }

  const ahkSourcePath = app.isPackaged
    ? path.join(process.resourcesPath, "automation.ahk")
    : path.join(__dirname, "..", "public", "assets", "automation.ahk");
  const exePath = app.isPackaged
    ? path.join(process.resourcesPath, "automation.exe")
    : path.join(__dirname, "..", "public", "assets", "automation.exe");

  if (!app.isPackaged && ahkPath && fs.existsSync(ahkSourcePath)) {
    console.log("Using AHK Source:", ahkSourcePath);
    return { exe: ahkPath, args: [ahkSourcePath], isAhk: true };
  }

  console.log("Using Automation EXE:", exePath);
  return { exe: exePath, args: [], isAhk: false };
}

function ensureScriptDirs() {
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }
  if (!fs.existsSync(scriptsConfigDir)) {
    fs.mkdirSync(scriptsConfigDir, { recursive: true });
  }
}

function killAutomationProcess() {
  if (automationProcess && !automationProcess.killed) {
    try {
      automationProcess.kill();
    } catch (e) {
      // ignore
    }
    automationProcess = null;
  }
}

// Start Recording
ipcMain.handle("automation-start-record", async (_event, name: string) => {
  ensureScriptDirs();
  killAutomationProcess();
  const scriptPath = path.join(scriptsDir, `${name}.json`);
  currentRecordingPath = scriptPath;

  try {
    const runtime = getAutomationRuntime();
    if (!fs.existsSync(runtime.exe)) {
      return { success: false, error: "未找到运行环境" };
    }

    const args = [...runtime.args, "record", scriptPath];
    console.log("Spawning record:", runtime.exe, args.join(" "));
    automationProcess = spawn(runtime.exe, args);

    automationProcess.stdout?.on("data", (data: Buffer) => {
      const lines = data
        .toString()
        .split("\n")
        .filter((l: string) => l.trim());
      for (const line of lines) {
        mainWindow?.webContents.send("automation-status", line.trim());
      }
    });

    automationProcess.stderr?.on("data", (data: Buffer) => {
      console.error("Automation stderr:", data.toString());
    });

    automationProcess.on("exit", () => {
      automationProcess = null;
      mainWindow?.webContents.send("automation-status", "STATUS|PROCESS_EXIT");
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Stop Recording
ipcMain.handle("automation-stop-record", async () => {
  if (currentRecordingPath) {
    const stopFile = currentRecordingPath + ".stop";
    try {
      fs.writeFileSync(stopFile, "");
      // Wait a bit for AHK to detect and exit
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      console.error("Error creating stop signal:", e);
    }
  }
  killAutomationProcess();
  currentRecordingPath = null;
  return { success: true };
});

// Start Playing
ipcMain.handle("automation-start-play", async (_event, name: string) => {
  ensureScriptDirs();

  const scriptPath = path.join(scriptsDir, `${name}.json`);
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: "脚本文件不存在" };
  }

  const configPath = path.join(scriptsConfigDir, `${name}.json`);
  let repeatCount = 0;
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      repeatCount = config.repeatCount || 0;
    }
  } catch (e) {
    console.error("Error reading config for play:", e);
  }

  killAutomationProcess();

  try {
    const runtime = getAutomationRuntime();
    if (!fs.existsSync(runtime.exe)) {
      return {
        success: false,
        error: "未找到运行环境 (automation.exe 或 AutoHotkey v2)",
      };
    }

    // AHK V2 script args: play <scriptFile> <maxLoops>
    const args = [...runtime.args, "play", scriptPath, repeatCount.toString()];
    console.log("Spawning play:", runtime.exe, args.join(" "));
    automationProcess = spawn(runtime.exe, args);

    automationProcess.stdout?.on("data", (data: Buffer) => {
      const lines = data
        .toString()
        .split("\n")
        .filter((l: string) => l.trim());
      for (const line of lines) {
        mainWindow?.webContents.send("automation-status", line.trim());
      }
    });

    automationProcess.stderr?.on("data", (data: Buffer) => {
      console.error("Automation stderr:", data.toString());
    });

    automationProcess.on("exit", () => {
      automationProcess = null;
      mainWindow?.webContents.send("automation-status", "STATUS|PROCESS_EXIT");
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Stop Playing
ipcMain.handle("automation-stop-play", async () => {
  killAutomationProcess();
  return { success: true };
});

// List Scripts
ipcMain.handle("automation-list-scripts", async () => {
  ensureScriptDirs();
  try {
    const files = fs.readdirSync(scriptsDir);
    return files
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(".json", ""));
  } catch {
    return [];
  }
});

// Delete Script
ipcMain.handle("automation-delete-script", async (_event, name: string) => {
  ensureScriptDirs();
  const scriptPath = path.join(scriptsDir, `${name}.json`);
  const cfgPath = path.join(scriptsConfigDir, `${name}.json`);
  try {
    if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
    if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Save Config
ipcMain.handle(
  "automation-save-config",
  async (_event, name: string, config: any) => {
    ensureScriptDirs();
    const cfgPath = path.join(scriptsConfigDir, `${name}.json`);
    try {
      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
);

// Get Config
ipcMain.handle("automation-get-config", async (_event, name: string) => {
  ensureScriptDirs();
  const cfgPath = path.join(scriptsConfigDir, `${name}.json`);
  try {
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    }
  } catch {
    // ignore
  }
  return null;
});

app.on("before-quit", () => {
  if (ahkProcess) ahkProcess.kill();
  killAutomationProcess();
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
