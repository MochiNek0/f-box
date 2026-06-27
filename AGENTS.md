# AGENTS.md

## Project Overview

F-Box is an Electron + React desktop app that runs Flash games with enhanced features: speed control (变速齿轮), automation scripting, and OCR-based screen recognition. Windows-only for native features.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Zustand
- **Main Process**: Electron, TypeScript compiled to `.cts` (CommonJS)
- **Native**: MinHook C code for DLL injection (speed hack), AutoHotkey scripts
- **OCR**: PaddleOCR (downloaded on first use)

## Directory Structure

```
src/          # React frontend (UI, components, stores, utils)
electron/     # Electron main process (IPC, window mgmt, feature managers)
native/       # C/C++ native code (speedhack.c, injector.c, minhook/)
public/       # Static assets (native exe/dll files, icons)
dist/         # Built React app (production)
dist-electron/# Compiled main process
```

**Key entry points**: `electron/main.cts` (app bootstrap, Flash detection), `src/App.tsx` (UI root component).

## Code Conventions

### Frontend (`src/`)
- Components: `src/components/app/` (feature-specific) and `src/components/common/` (reusable)
- State: Zustand stores in `src/store/` (`useTabStore`, `useSettingsStore`, `useSpeedStore`)
- `useSettingsStore` persists to localStorage via Zustand persist middleware
- Utils: `src/utils/` (e.g. `imageProcess.ts` for OCR preprocessing)
- Styles: Tailwind CSS with custom design system — spacing prefix `gr-*`, custom border radius, color tokens in `tailwind.config.js`
- Types: `src/types/` (e.g. `electron.d.ts` for IPC type definitions)
- No direct Node.js access in renderer; all native calls go through `window.electronAPI`

### Main Process (`electron/`)
- All files use `.cts` extension, compiled to `.cjs` — use `require`, never ESM `import`
- IPC exposed via `contextBridge` in `electron/preload.cts` as `window.electronAPI`
- Feature modules: `speed-manager.cts`, `automation-manager.cts`, `ocr.cts`, `ocr-result-manager.cts`, `shortcut-manager.cts`, `update-manager.cts`, `config-manager.cts`, `window-manager.cts`
- Each manager owns its domain; the main process (`main.cts`) orchestrates initialization

### Native (`native/`)
- C code hooks Windows timer APIs via MinHook for speed manipulation
- DLL injection via custom injector exe
- Build via `native/compile.ps1` (PowerShell + MSVC toolchain)
- Compiled outputs shipped in `public/assets/` as `speedhack32.dll`, `speedhack64.dll`, `injector32.exe`, `injector64.exe`

## Platform Constraints

- Native features (speed hack, automation, OCR, key mapping) are **Windows-only**
- Frontend should degrade gracefully — don't assume Windows-specific features are available
- Build targets: Windows (NSIS installer, portable zip), macOS (DMG/ZIP)

## Build & Run

```bash
npm run dev           # Dev mode — Vite dev server + Electron in parallel
npm run build         # Production build (Vite + tsc compile)
npm run dist:win      # Windows installer (NSIS)
npm run dist:win:portable  # Windows portable zip
npm run dist:mac      # macOS DMG/ZIP
```

## IPC Pattern

When modifying IPC interfaces, always update both sides:

1. Define/update the channel in `electron/main.cts` (ipcMain handler)
2. Expose it in `electron/preload.cts` via `contextBridge`
3. Call it from the renderer via `window.electronAPI.<method>()`

## Key Implementation Notes

- **Speed hack**: Hooks `timeGetTime` and `QueryPerformanceCounter` via MinHook; speed multipliers range from 0.01x to 999x; F1/F2 shortcuts toggle gears
- **Automation**: Records input events with millisecond timestamps, replays with exact timing; supports breakpoints with OCR-based resume conditions; F3/F4/F5 hotkey slots for quick script execution
- **OCR**: PaddleOCR runs as a separate process; results stored in `~/.f-box/ocr-results/`; selection overlay lets users pick screen regions
- **Flash detection**: Scans system directories for Pepper Flash PPAPI plugin; falls back to tutorial if not found
- **Game library**: Pre-configured links for popular Chinese Flash games (造梦西游, 洛克王国, 赛尔号, 奥拉星); custom games persisted in localStorage
- **DLL injection** may trigger antivirus — users need to whitelist the app; never silently bypass security warnings
