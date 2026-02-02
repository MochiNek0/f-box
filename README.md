# F-Box: 极简 Flash 游戏浏览器

F-Box 是一款基于 Electron 开发的轻量级浏览器，专为现代系统（特别是 Windows）中的 Flash 游戏体验而设计。它解决了现代浏览器停止支持 Flash 的痛点，提供了一个简洁、高效且功能丰富的 Flash 游戏运行环境。

---

## ✨ 核心功能

- **🚀 Flash 原生支持**：自动扫描系统中的 Pepper Flash 插件，确保 Flash 内容流畅运行。
- **🎮 游戏库管理**：内置常用 Flash 游戏入口，并支持用户添加自定义游戏。
- **📑 多标签页体验**：支持同时打开多个 Flash 游戏，通过简洁的标签栏快速切换。
- **🕵️ 隐身/老板键**：支持自定义全局快捷键（默认 `Escape`）一键隐藏/显示窗口，保护隐私。
- **🌫️ 窗口透明度**：可自由调节窗口不透明度，让工具更好地融入桌面背景。
- **📦 便携化分发**：提供绿色版 (Portable) 打包方案，即开即用。
- **📁 系统托盘**：最小化至托盘，常驻后台且不占领任务栏。

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
