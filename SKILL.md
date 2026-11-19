---
name: jby-liquid-glass
description: Universal, theme-agnostic style template, reusable SVG Snell + WebGL2/CSS assets, and porting blueprint for OpenAI Codex Desktop (Dream Skin): iOS 26 / S26 clear Liquid Glass + HarmonyOS 7 continuous spring physics. Works for ANY wallpaper, ANY new theme ZIP, or ANY fresh Codex Dream Skin install on a new PC without hardcoding specific theme IDs.
---

# JBY-Liquid-Glass v3 — Universal Liquid Glass & HarmonyOS 7 Blueprint

Theme-agnostic Liquid Glass design system pairing **Apple iOS 26 / S26 clear optical crystal optics** with **HarmonyOS 7 physical motion physics**, tuned for low-latency Electron/Chromium UIs (`Codex Dream Skin`).

## Core v3 Multi-Zone Optical Architecture

1. **Tier 1 — Live Multi-Zone SVG Snell Displacement Lenses (`#ds-lg-svg-defs`)**
   - **`--ds-lg-lens-filter` (`#ds-lg-lens-composer`, `#ds-lg-lens-rail`)**: Applied on floating Composer pill and external Attached Utility Rail; on Home Work Mode (`[data-dream-lg-surface="work-composer"]`), targets `[data-composer-body]` (`#ds-lg-lens-composer`) and tucked `[data-composer-utility-rail]` (`#ds-lg-lens-rail`) directly so native two-part geometry stays intact. Uses `blur(0px)` fallback instead of `none` so multi-function `backdrop-filter` rules never drop.
   - **`--ds-lg-lens-writing` (`#ds-lg-lens-writing`)**: Clear Liquid Glass lens on `[data-oai-writing-block-surface]` (`--wb-surface-primary: transparent`) with **automatic 1D tall-card support** (`224x1` horizontal bevel map whenever `height > 1100px`) so ultra-tall writing outputs never stretch corners and stay pure colorless crystal over white surfaces.
   - **Shared Fast Filters (`#ds-lg-lens-card`, `#ds-lg-lens-popover`)**: Shared `160x160` displacement maps driving `--ds-lg-lens-card` (nested `section div[class*="rounded-2xl"][class*="border"]`, work quota banners) and `--ds-lg-lens-popover` (`[role="dialog"]`, `[role="menu"]`, `[data-radix-popper-content-wrapper] > div`, mode switcher track).

2. **Tier 2 — WebGL2 Static Optical Shader (`GPU_FRAG v2`)**
   - Used on static wallpaper-backed elements (`Sidebar`, `Home Cards`) via `::before` (`backdrop-filter: none`), reading zone-resolved `sidebar` / `cards` parameters with white-neutral chroma clamping and queued async `canvas.toBlob` + `URL.revokeObjectURL`.

3. **Tier 3 — Per-Zone Live Tuning, Zero-Lag Blink CSS & HarmonyOS 7 Studio**
   - **Independent Optical Zones (`zones` map)**: `composer` (对话输入栏), `writing` (文字输出框), `sidebar` (左侧边栏), `cards` (设置·卡片), `popover` (弹窗·胶囊), each driving `--ds-lg-z-{zone}-hi/mid/lo/blur/rim-a` and dark variants while cascading unset fields from global defaults.
   - **Blink Style/Observer Performance**: Zero `background-attachment: fixed`, zero bare `div:has(...)` selectors (anchored via `[data-dream-lg-surface="..."]`), native `:scope > [class*="indicator-"]` preserved on mode switchers, and scoped predicate refreshes so Settings navigation avoids redundant full-document style recalculation.
   - **Floating Crystal Orb Studio**: Default `38x38px` draggable Orb (`orb` / `pill`), inertial glide physics, FLIP morph drawer, hardware-cached 16:10 wallpaper thumbnails, and per-zone tuning UI (`selectedZone`).

## Package Layout

- `assets/s26-liquid-glass.css` — Universal `@layer dreamskin-accessibility` Liquid Glass stylesheet.
- `assets/s26-liquid-glass-engine.js` — UMD `JbyLiquidGlass.create(options)` runtime engine (SVG Snell lens + WebGL2 + HarmonyOS springs).
- `assets/theme-template/theme.json` & `theme.css` — Minimal `"liquidGlass": true` theme starter.
- `references/appearance-and-params.md` — CSS tokens, Live Tune parameters, and `pluginUi` state schema.
- `references/pitfalls-and-rules.md` — Critical Chromium/SafeCSS/MutationObserver stability rules.
- `references/porting-template.md` — Fresh PC / Dream Skin porting checklist & sync commands.
- `scripts/verify-template.mjs` — Asset & contract verification script.
