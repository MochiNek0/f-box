# F-Box: 极简 Flash 游戏浏览器

F-Box 是一款基于 Electron 开发的轻量级浏览器，专为现代系统（特别是 Windows）中的 Flash 游戏体验而设计。它解决了现代浏览器停止支持 Flash 的痛点，提供了一个简洁、高效且功能丰富的 Flash 游戏运行环境。

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

## ⚠️ 兼容性说明

> 本项目优先针对 Windows 环境优化，以获得最佳的游戏体验。

- **Mac / Linux 用户**：
  - 项目构建脚本虽包含 Mac (dmg) 和 Linux (AppImage/deb) 的配置，但目前 **尚未在实机环境下进行充分测试**，可能存在兼容性问题。
  - 欢迎社区开发者贡献测试反馈或修复补丁。

- **键位映射功能**：
  - 该功能底层依赖 Windows 平台的 AutoHotkey 脚本实现。
  - **Mac 和 Linux 系统下无法使用键位映射功能**。

## 🛠️ 技术栈

- **框架**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **构建工具**: [Vite 5](https://vitejs.dev/)
- **桌面环境**: [Electron 11](https://www.electronjs.org/) (为了维持 Flash 的最佳兼容性)
- **样式**: [Tailwind CSS](https://tailwindcss.com/)
- **状态管理**: [Zustand](https://github.com/pmndrs/zustand)
- **图标**: [Lucide React](https://lucide.dev/)

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
# 生成安装程序
npm run dist

# 生成便携版 (Single Executable)
npm run dist:portable

# 生成 macOS 安装包
npm run dist:mac

# 生成 Linux 安装包
npm run dist:linux
```

## 📖 使用说明

- **添加游戏**：在“游戏库”页面点击右上角的“添加游戏”按钮，输入名称和链接即可。
- **调节透明度**：通过应用顶部的工具栏滑块即可实时调节窗口透明度。
- **老板键设置**：默认按 `Esc` 隐藏窗口。如果需要修改，可在 `electron/main.cts` 中调整 `currentBossKey` 初始值，或通过后续增加的 UI 进行配置。

## ❓ 常见问题

**Q: 启动后提示找不到 Flash 插件怎么办？**
A: 请确保系统中安装了 PPAPI 版本的 Flash Player。您可以从官方渠道（如 flash.cn）下载适配 Windows 的版本。F-Box 会尝试自动寻找系统路径下的 `pepflashplayer*.dll`。

---

## 📄 开源协议

[MIT License](LICENSE)
