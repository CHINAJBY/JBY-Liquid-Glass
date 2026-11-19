# Porting & Sync Blueprint (v3)

## 1. Engine & CSS Integration (Codex Dream Skin / Electron)

1. Append `assets/s26-liquid-glass.css` at the bottom of `engine/assets/dream-skin.css` (inside `@layer dreamskin-accessibility`, ensuring `background-attachment: scroll !important` and zero `:has(*)` / `main div:has(...)` selectors).
2. Embed `JbyLiquidGlass.create(...)` (or equivalent unified `initLiquidGlassEdition()`) in `engine/assets/renderer-inject.js`, activating via theme-agnostic opt-in:
   `id.endsWith("-liquid-glass") || THEME.liquidGlass === true`.
3. Update `applyLiveTuneRuntime` in `renderer-inject.js` to drive per-zone tokens (`--ds-lg-z-{zone}-hi/mid/lo/blur/rim-a` and `--ds-lg-z-{zone}-dark-*`), global fallbacks, and `window.__dsLgApplyLiveParams?.(p)` without injecting overriding `backdrop-filter: blur(...) !important` on Liquid Glass surfaces.
4. Wire Studio thumbnail, zone state, & widget RPCs in `engine/scripts/injector.mjs` + `engine/assets/theme-preferences.mjs`:
   - `getThemeThumbSource` & `saveThemeThumb` (`thumb-cache/*.jpg` atomic write)
   - `normalizeLiveParams` with `LIQUID_ZONES` (`composer`, `writing`, `sidebar`, `cards`, `popover`)
   - `normalizePluginUiState` (`pillMode: "orb" | "pill"`, `selectedZone`, `posX`, `posY`, `panelOpen`, `activeTab`)
   - `pushPayloadToSessions({ skipEarlyRefresh: args.commit === false })` to eliminate disk/CDP stalls while dragging sliders.

## 2. Authoring a New Liquid Glass Theme ZIP

1. Start from `assets/theme-template/theme.json` + `theme.css`.
2. Ensure `"liquidGlass": true` in `theme.json` (and/or suffix the ID with `-liquid-glass`) plus optional `art.focusX / focusY` so Studio 16:10 thumbnails and WebGL2 wallpaper framing align cleanly.
3. Keep per-theme `theme.css` lightweight (typography/palette overrides only); avoid heavy opaque backgrounds on composers or thread containers so the universal Liquid Glass engine renders cleanly over white and wallpaper surfaces alike.

## 3. Sync & Verification Checklist

```bash
# 1. Mirror engine -> payload (keep installed runtime in sync!)
# 2. Validate Skill template
node scripts/verify-template.mjs
# 3. Validate syntax & self-tests
node --check renderer-inject.js
node injector.mjs --self-test
node injector.mjs --check-payload
# 4. Live CDP verification & visual inspection
node injector.mjs --once
node injector.mjs --verify --screenshot
```
