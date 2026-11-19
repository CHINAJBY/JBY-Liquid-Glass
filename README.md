# JBY Liquid Glass (Desktop Control Center · `v3.1.0`)

Dual-app **iOS 26 / S26 Clear Liquid Glass & HarmonyOS 7 Fluid Physics** desktop application for **OpenAI Codex Desktop** (`127.0.0.1:9335`) and **Antigravity Desktop** (`127.0.0.1:9235`), powered by one unified system tray daemon, one shared theme & optical preset library, and direct-click native app launchers.

> 双端一体化液态玻璃桌面皮肤应用（`v3.1.0`）：同时支持 **OpenAI Codex** 与 **Antigravity**，共享主题库与光学预设，支持商店主题包导入一键自动液态玻璃化、单端/双端独立切换与推送，以及桌面应用直接点击拉起。

---

## Key Capabilities · 核心能力

1. **Dual-App Optical Parity & Isolation（双端等比光学与独立切肤）**
   - Shared library in `%LOCALAPPDATA%\JBYLiquidGlass\{themes,thumb-cache,images}\` while Codex (`active-theme\`, `dream-skin-plugin.json`) and Antigravity (`antigravity\`) retain completely independent active themes and per-zone tuning.
   - Antigravity overlay composer architecture (`[data-testid="autoscroll-viewport"]` flowing underneath `.surface-composer-card` with live SVG Snell refraction), 24px Crystal Island sidebar (`data-dream-lg-gpu="1"`), WebGL2 backdrop tiles, and HarmonyOS 7 spring motion.

2. **Store Theme ZIP Auto-Conversion & Dual Push（商店包自动转液态玻璃与双端推送）**
   - `scripts\import-theme-zip.ps1` accepts any third-party/store `.zip` theme, automatically injects `"liquidGlass": true` and full-bleed art hints, samples primary & secondary accent highlights from the wallpaper, strips conflicting heavy opaque/blur overrides in `theme.css` (backing up `theme.original.css`), generates dual-end thumbnails, and pushes to **Both / Antigravity / Codex / Library Only**.

3. **Shared Optical Presets & Default Preset Inheritance（共享光学预设与全局默认继承）**
   - `assets\optical-presets.mjs` manages `%LOCALAPPDATA%\JBYLiquidGlass\optical-presets.json` across both floating Crystal Studios (`Ctrl+Shift+D`) and the desktop WPF manager.
   - Save custom or auto-numbered presets (`预设 1`, `预设 2`, ...), switch in one click, delete, or mark any preset as **Default** (`defaultPresetId`) so new/unconfigured themes on either Codex or Antigravity automatically inherit your tuned optical parameters (global + per-zone).

4. **Direct-Click App Launchers & Smart App Control Compatible WPF UI（直接点击应用拉起 & 免签名拦截兼容）**
   - Optimized `Antigravity` and `ChatGPT (Codex)` shortcuts invoke `scripts\launch-antigravity-with-jby.ps1` and `scripts\launch-codex-with-jby.ps1`, keeping native app icons while automatically waking the unified tray and Liquid Glass engine even from a cold state (with stale headless zombie cleanup for Store `ChatGPT.exe`).
   - Windows 11 Smart App Control compatible launcher (`app\launch-jby-liquid-glass.ps1`) hosts the WPF UI (`app\JBYLiquidGlass.cs`) under Windows-signed `powershell.exe -STA`.

---

## Project Layout · 目录结构

- `app\JBYLiquidGlass.cs` & `app\launch-jby-liquid-glass.ps1` — Native dual-app WPF control center & Smart App Control safe host (`app\build-app.ps1` builds optional standalone `.exe`)
- `scripts\tray-jby-liquid-glass.ps1` — Unified single-instance tray & Auto-Guard daemon
- `scripts\injector.mjs` & `assets\{renderer-inject.js,dream-skin.css,selectors.json,theme-preferences.mjs}` — Codex CDP & Liquid Glass engine
- `scripts\antigravity-injector.mjs` & `assets\{antigravity-inject.js,antigravity-skin.css,antigravity-selectors.json,antigravity-preferences.mjs}` — Antigravity CDP & Liquid Glass engine
- `assets\optical-presets.mjs` — Shared cross-app optical presets & default preset resolver
- `scripts\import-theme-zip.ps1` — Theme ZIP extractor, auto-Liquid-Glass converter, thumbnailer & pusher
- `scripts\{launch-antigravity-with-jby.ps1,launch-codex-with-jby.ps1}` — Direct-click app launchers
- `installer\{setup-bootstrap.ps1,jby-liquid-glass.iss,install.cmd}` — Windows bootstrap & Inno Setup packaging

---

## Installation & Build · 安装与构建

```powershell
# Smoke-test / launch the WPF Control Center (Smart App Control safe)
powershell -NoProfile -STA -ExecutionPolicy RemoteSigned -File .\app\launch-jby-liquid-glass.ps1

# Optional: compile standalone JBYLiquidGlass.exe
powershell -NoProfile -ExecutionPolicy Bypass -File .\app\build-app.ps1

# Verify runtime engines (requires Node.js >= 20)
node .\scripts\injector.mjs --self-test
node .\scripts\antigravity-injector.mjs --self-test
node .\scripts\antigravity-injector.mjs --check-payload
```
