# Pitfalls & Production Stability Rules

1. **Never use `:has(*)` or `document.querySelectorAll("*")` in predicates or observers**
   - Even one `:has(*)` selector resolved across dynamic mutation cycles (`refreshPredicates`) causes multi-second UI stalls (`predicateMs > 12s`). Use `:empty` (or `:not(:empty)`) and explicitly guard `branch.selector === "*"`.
2. **Keep `partObserver` strictly structural**
   - Ignore `#codex-dream-skin-plugin-host`, `#ds-lg-svg-defs`, `#ds-lg-fx-canvas`, `.ProseMirror`, `[contenteditable="true"]`, text-only mutations, `style` attribute mutations (from animations), and `data-dream-*` / `data-ds-*` attributes. Throttle >= `120ms`.
3. **Never put Liquid Glass base styles below `@layer dreamskin-community`**
   - Safe CSS wraps per-theme `theme.css` inside `@layer dreamskin-community` with `!important`. In CSS Cascade Layers, `!important` reverses layer priority — so universal Liquid Glass overrides MUST live inside `@layer dreamskin-accessibility` (declared before `dreamskin-community`) to win cleanly.
4. **Always bake static/non-white optical rules cleanly for white pages**
   - Never paint fixed `accentRgb` rim glazes or dark-navy shadows over translucent composers that slide above bright white content blocks (`[data-oai-writing-block-surface]`). Let a real-time `<feDisplacementMap>` SVG lens bend live underlying pixels cleanly.
5. **Chromium SVG `<feDisplacementMap>` essentials**
   - Set `color-interpolation-filters="sRGB"` on `<filter>` (linearRGB shifts neutral `128` gray!).
   - Never hide the `<svg>` container with `display: none`; position it offscreen (`left:-9999px;width:0;height:0;opacity:0`).
   - Taper displacement to `0` over the outermost `14%` of bezel (`edgeFade = min(1, t / 0.14)`) to prevent corner pixel pinching.
6. **No `background-attachment: fixed`, no bare `div:has(...)`, and no unlayered `blur()` overrides**
   - `background-attachment: fixed` and `main div:has(...)` force Chromium Blink to invalidate styles and repaint across large Settings trees during every tab switch. Use `scroll !important` on wallpapers, replace `main div:has(...)` with explicit `[data-dream-lg-surface]` markers, and never inject an unlayered `backdrop-filter: blur(...) !important` rule that wipes out `var(--ds-lg-lens-*)`.
7. **Handle tall cards (`>1100px`) and native mode indicators cleanly**
   - Switch SVG `feImage` generation to a `224x1` horizontal bevel map when `rect.height > 1100` so vertical glass borders stay crisp on tall `[data-oai-writing-block-surface]` outputs. Skip `[role="group"]` tracks that already own `:scope > [class*="indicator-"]` in `rescanSegTracks()` to avoid duplicate white pills over controls.
8. **Zero `pointermove` style recalculation, scoped predicate caching, & zero `innerHTML` rebuilds**
   - Never mutate CSS custom properties inside `pointermove`; scope narrow predicates like `:has(input[type="text"])` away from `<html>`/`<body>` so Settings tab switches never re-trigger full-document `RecalcStyle`.
9. **Window Store ACL & Zero Business Class Pollution**
   - Never edit `C:\Program Files\WindowsApps\OpenAI.Codex*`. Never inject `dream-*` or `codex-dream-skin*` classes onto Codex DOM elements (`businessClassPollution === 0`).
10. **Preserve Home Work Mode (`工作`) Native 2-Part Composer Shape**
    - Detect Home Work Mode via `[data-composer-utility-bar-variant="home"]` containing `[class*="ResponsiveHomeUtilityBar"] [data-composer-rail]` (`data-dream-lg-surface="work-composer"`). Keep its outer root borderless/transparent and `[class*="ResponsiveHomeUtilityBar"]` `position: absolute` (forcing `position: relative` adds flex `gap-2` and creates a 4px seam gap); apply Liquid Glass & SVG Snell lenses onto `[data-composer-body]` (`#ds-lg-lens-composer`) and tucked `[data-composer-utility-rail]` (`#ds-lg-lens-rail`) without overriding native `border-radius`, `margin`, or `padding`.
11. **Never pass `none` into a multi-function `backdrop-filter` fallback**
    - `backdrop-filter: none blur(...)` is rejected by Chromium and disables blur + saturation entirely. Always fall back to `blur(0px)` in both CSS `var(--ds-lg-lens-*, blur(0px))` and disabled-lens JS paths.
