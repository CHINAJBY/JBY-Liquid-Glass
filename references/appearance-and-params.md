# Appearance Tokens & Live Parameters Reference (v3)

## CSS Custom Properties (`@layer dreamskin-accessibility`)

| Token | Default (Light) | Default (Dark) | Purpose |
|---|---|---|---|
| `--ds-lg-lens-filter` | `url(#ds-lg-lens-*)` | `url(#ds-lg-lens-*)` | Live SVG Snell lens on Composer and external Attached Rail |
| `--ds-lg-lens-writing` | `url(#ds-lg-lens-writing)` | `url(#ds-lg-lens-writing)` | Live 2D / 1D-tall SVG Snell lens on `[data-oai-writing-block-surface]` |
| `--ds-lg-lens-card` | `url("#ds-lg-lens-card")` | `url("#ds-lg-lens-card")` | Shared crystal bevel lens on Settings cards & Work banners |
| `--ds-lg-lens-popover` | `url("#ds-lg-lens-popover")` | `url("#ds-lg-lens-popover")` | Shared crystal bevel lens on Dialogs, Menus, Radix popovers & Switcher track |
| `--ds-lg-z-{zone}-hi/mid/lo` | Zone-calibrated alpha | `--ds-lg-z-{zone}-dark-*` | Per-zone crystal glaze gradient stops (`zone` in `composer, writing, sidebar, cards, popover`) |
| `--ds-lg-z-{zone}-blur` | `1.1px .. 10px` | `1.1px .. 10px` | Per-zone micro-blur (`cfg.blur * blurScale / 100`) |
| `--ds-lg-z-{zone}-rim-a` | `.15 .. .16` | `.22 .. .24` | Per-zone outer bezel border alpha |
| `--ds-lg-gpu-bg` | `url("blob:...")` | `url("blob:...")` | Async WebGL2 baked optical tile for static wallpaper surfaces |
| `--ds-lg-seg-x / -w / -sx` | JS spring | JS spring | HarmonyOS segmented droplet X offset, width, velocity stretch |
| `--ds-lg-spring-responsive` | `linear(...)` | `linear(...)` | ArkUI damped harmonic curve for controls |

## Live Optical Parameters (`liveParams`)

| Key | Range | Default | Effect |
|---|---|---|---|
| `transparency` | `0..100` (slider `15..100`) | `80` | Global glass transparency baseline for non-overridden zones |
| `refractScale` | `0..200` | `100` | Global SVG `<feDisplacementMap scale>` & WebGL Snell bend multiplier |
| `blurScale` | `0..200` | `100` | Global `--ds-lg-z-*-blur` & WebGL mipmap LOD multiplier |
| `rimIntensity` | `0..200` | `100` | Global `--ds-lg-z-*-rim-a` & Fresnel rim brightness multiplier |
| `fontWeightBoost` | `-80..150` | `0` | Global `--ds-live-weight-body / ctrl / head` offset |
| `motionMode` | `"spring" \| "lite" \| "off"` | `"spring"` | Full HarmonyOS spring physics, CSS lite, or reduced/off |
| `particlesEnabled` | `boolean` | `true` | Toggles subtle neutral white crystal press ripples/sparks |
| `zones` | `Record<Zone, Partial<ZoneOpts>>` | `{}` | Per-zone overrides (`composer`, `writing`, `sidebar`, `cards`, `popover`) for `transparency`, `refractScale`, `blurScale`, `rimIntensity` |

## Studio Widget UI State (`pluginUi` in `theme-preferences.mjs`)

- `pillMode`: `"orb"` (default compact `38x38px` crystal orb) or `"pill"` (slim capsule)
- `pillMinimized`: boolean (kept synced with `pillMode === "orb"`)
- `panelOpen`: boolean (expanded drawer state)
- `activeTab`: `"themes" | "tune" | "auto"`
- `selectedZone`: `"global" | "composer" | "writing" | "sidebar" | "cards" | "popover"`
- `posX`, `posY`: normalized `[0..1]` viewport fraction within safe screen margins (`14px` X, `44px` top, `14px` bottom)
