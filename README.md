# F-Box: 极简 Flash 游戏浏览器

F-Box 是一款基于 Electron 开发的轻量级浏览器，专为现代系统（Windows / macOS）中的 Flash 游戏体验而设计。它解决了现代浏览器停止支持 Flash 的痛点，提供了一个简洁、高效且功能丰富的 Flash 游戏运行环境。

---

## ✨ 核心功能

- **🚀 原生 Flash 支持**：自动扫描系统中的 Pepper Flash 插件，无需繁琐配置，确保 Flash 内容流畅运行。
- **🎮 游戏库管理**：内置精选游戏入口，支持一键启动；更可自由添加自定义游戏链接，打造专属游戏库。
- **🕹️ 键位映射 (Windows)**：内置强大的按键映射功能（基于 AutoHotkey），支持键盘重映射及手柄模拟，让经典老游戏焕发新生。
- **⚙️ 个性化设置**：全新的可视化设置面板，轻松调节窗口透明度、自定义老板键、管理键位配置。
- **📑 多标签页浏览**：采用现代浏览器的标签页设计，支持同时运行多个游戏，快速切换，互不干扰。
- **🪟 智能弹窗接管**：完美兼容需要弹出独立窗口的游戏（如赛尔号登录、洛克王国等），自动接管并优化弹窗体验。
- **🕵️ 隐私老板键**：全局快捷键（默认 `Esc`）一键隐形，瞬间隐藏/呼出窗口，保护你的游戏隐私。
- **🌫️ 沉浸式透明度**：支持全局窗口透明度调节，让播放器与桌面背景完美融合，提供独特的视觉体验。
- **📦 绿色便携**：提供 Portable 便携版，无需安装，解压即用，配置随身带。
- **📁 托盘后台**：支持最小化至系统托盘，保持任务栏整洁，随时待命。

### 🤖 自动化与辅助功能

- **📹 操作录制/回放**：支持录制鼠标点击、键盘输入等操作，可精确到毫秒级时间戳，支持断点暂停功能。
- **👁️ OCR 图像识别**：Windows 使用内置 Paddle OCR；macOS 支持接入 [macOCR](https://github.com/schappim/macOCR) 方案进行文字识别。
- **🖱️ 连点器**：内置鼠标连点功能，支持自定义点击频率、按键类型（左键/右键/双击）。
- **🎯 断点调试**：自动化脚本支持在指定时间点暂停，用户可手动干预（如 OCR 选区）后继续执行。

---

## ⚠️ 兼容性说明

> 本项目已区分 Windows 与 macOS 的运行能力，并分别提供对应方案。

- **macOS 用户**：
  - OCR 支持插件化安装（与 Windows 一样通过应用内下载/卸载）。
  - 若未安装插件，也可使用系统已安装的 `macocr` 命令作为兜底方案。
  - 键位映射已支持通过系统 `hidutil` 应用（免第三方依赖）。
  - 自动化回放支持通过 [Hammerspoon](https://www.hammerspoon.org/) CLI (`hs`) 执行，需授予辅助功能权限。
  - 自动化录制建议搭配下列 macOS 工具：Hammerspoon / Keyboard Maestro / BetterTouchTool。

- **键位映射与自动化功能**：
  - 该功能底层依赖 Windows 平台的 AutoHotkey 脚本实现。
  - **macOS 系统下已支持键位映射与自动化回放；自动化录制与连点器仍在完善中**。

---

## 🛠️ 技术栈

- **框架**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **构建工具**: [Vite 5](https://vitejs.dev/)
- **桌面环境**: [Electron 11](https://www.electronjs.org/) (为了维持 Flash 的最佳兼容性)
- **样式**: [Tailwind CSS](https://tailwindcss.com/)
- **状态管理**: [Zustand](https://github.com/pmndrs/zustand)
- **图标**: [Lucide React](https://lucide.dev/)
- **OCR 引擎**:
  - Windows: [Paddle OCR](https://github.com/PaddlePaddle/PaddleOCR) (本地部署)
  - macOS: [macOCR](https://github.com/schappim/macOCR)

---

## 🚀 快速开始

### 1. 环境准备

- [Node.js](https://nodejs.org/) (建议版本 18+)
- 系统需安装有 Flash 插件（项目会自动检测 `Windows/System32/Macromed/Flash` 下的 DLL 文件）。

### 2. 安装与运行

```bash
# 克隆项目 (或下载源码)
# 进入项目目录
npm install

# 启动开发环境
npm run dev
```

### 3. 项目打包

```bash
# 生成 Windows 安装程序
npm run dist:win

# 生成 Windows 便携版
npm run dist:win:portable

# 生成 macOS 安装包
npm run dist:mac

# 生成 macOS ZIP
npm run dist:mac:zip
```

打包完成后，安装包位于 `release/` 目录。

---

## 📖 使用说明

### 基础功能

- **添加游戏**：在"游戏库"页面点击右上角的"添加游戏"按钮，输入名称和链接即可。
- **调节透明度**：通过应用顶部的工具栏滑块即可实时调节窗口透明度。
- **老板键设置**：默认按 `Esc` 隐藏窗口，可在设置面板中修改。

### 自动化功能

1. **打开录制器**：在设置面板的"操作自动化"标签页，点击"新建录制"。
2. **录制操作**：录制器会最小化为工具条，点击录制按钮开始捕捉操作。
3. **保存脚本**：录制完成后输入脚本名称保存。
4. **执行脚本**：在自动化列表中点击播放按钮即可回放操作。

> macOS 提示：请先安装 Hammerspoon，并确保 `hs` 命令可用（如 Homebrew 安装）。

### OCR 功能（按系统区分）

- Windows 首次使用 OCR 功能时，系统会自动下载 Paddle OCR 模型（约 200MB）。
- macOS 同样支持在应用内下载 OCR 插件（默认下载安装到 `~/.f-box/plugins/ocr`）。
- 在自动化脚本执行到断点时，可手动框选 OCR 识别区域。
- OCR 识别结果将用于脚本的条件判断。

### 连点器

1. 在设置面板中打开"连点器"标签页。
2. 配置点击间隔（毫秒）、点击类型（左键/右键/双击）。
3. 设置快捷键启动/停止连点。

---

## ❓ 常见问题

**Q: 启动后提示找不到 Flash 插件怎么办？**
A: 请确保系统中安装了 PPAPI 版本的 Flash Player。您可以从官方渠道（如 flash.cn）下载适配 Windows 的版本。F-Box 会尝试自动寻找系统路径下的 `pepflashplayer*.dll`。

**Q: OCR 功能无法使用？**
A: 首次使用需要下载 OCR 模型文件，请确保网络连接正常。下载进度可在设置面板中查看。

**Q: 自动化脚本无法执行？**
A: Windows 请确保 AutoHotkey 已正确安装，且 `keymap.exe` 与 `automation.exe` 存在于 `public/assets/`。macOS 请先安装并授权 Hammerspoon（`hs` 命令可用）。

---

## 📄 开源协议

[MIT License](LICENSE)
