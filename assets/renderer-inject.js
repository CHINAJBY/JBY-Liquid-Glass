// Canonical cross-platform renderer. Run tools/sync-runtime-assets.mjs after editing.
((cssText, artDataUrl, themeConfig) => {
  const SELECTOR_CONTRACT = {"schema":"codex-dream-skin-selectors/1","selectors":[{"key":"shell-main","selector":"main:is(.main-surface, [data-app-shell-main-surface], [class*=\"_MainContentSurface_\"])","tier":"L1","scope":"all","required":true},{"key":"left-panel","selector":"aside.app-shell-left-panel","tier":"L1","scope":"all","required":true},{"key":"header-tint","selector":"header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*=\"_Header_\"]), header[data-app-shell-titlebar=\"true\"] [data-app-shell-main-titlebar=\"true\"][data-testid=\"app-shell-header-context-menu-surface\"]","tier":"L1","scope":"all","required":true},{"key":"main-content-top-fade","selector":":is(.app-shell-main-content-top-fade, [data-app-shell-main-content-top-fade]:not(:has(*)), [class*=\"_MainContentTopFade_\"])","tier":"L2","scope":"all","required":false},{"key":"home-icon","selector":"[data-testid=\"home-icon\"]","tier":"L1","scope":"home","required":true},{"key":"home-route","selector":"[role=\"main\"]:has([data-testid=\"home-icon\"])","tier":"L1","scope":"home","required":true},{"key":"home-route-css","selector":"[role=\"main\"]","tier":"L1","scope":"home","required":true},{"key":"home-banners","selector":".home-banners","tier":"L2","scope":"home","required":false},{"key":"composer-chrome","selector":":is(.composer-surface-chrome, [class*=\"_ComposerLayoutRoot_\"], [data-composer-surface-variant][data-composer-radius-variant])","tier":"L2","scope":"home+thread","required":false},{"key":"composer-toolbar","selector":":is(.composer-surface-chrome [class*=\"_footer_\"], [class*=\"_ComposerLayoutRoot_\"] [class*=\"_ComposerLayoutFooter_\"], [data-composer-surface-variant][data-composer-radius-variant] :is([data-composer-footer-responsive], [class*=\"_ComposerLayoutFooter_\"], [class*=\"_footer_\"]))","tier":"L2","scope":"home+thread","required":false},{"key":"home-utility","selector":":is([class*=\"_homeUtilityBar_\"], [class*=\"_ComposerHomeUtilityBar_\"])","tier":"L2","scope":"home","required":false},{"key":"game-source","selector":"[data-feature=\"game-source\"]","tier":"L2","scope":"home","required":false},{"key":"home-suggestions","selector":".group\\/home-suggestions","tier":"L2","scope":"home","required":false},{"key":"project-selector","selector":".group\\/project-selector","tier":"L2","scope":"home config","required":false},{"key":"markdown","selector":"[class*=\"_markdown\"]","tier":"L2","scope":"thread","required":false},{"key":"thread-surface","selector":".thread-scroll-container","tier":"L2","scope":"thread","required":false},{"key":"message","selector":":is([data-message-author-role], [data-local-conversation-user-anchor], [data-local-conversation-final-assistant])","tier":"L2","scope":"thread","required":false},{"key":"settings-panel","selector":"[data-settings-panel-slug=\"general-settings\"]","tier":"L2","scope":"settings","required":false},{"key":"appearance-radio","selector":"input[name=\"appearance-theme\"]","tier":"L2","scope":"settings","required":false},{"key":"overlay-menu","selector":"[role=\"menu\"]","tier":"L2","scope":"overlay","required":false},{"key":"overlay-dialog","selector":"[role=\"dialog\"]","tier":"L2","scope":"overlay","required":false},{"key":"overlay-popper","selector":"[data-radix-popper-content-wrapper]","tier":"L2","scope":"overlay","required":false}],"stableTestids":["app-shell-header-context-menu-surface","home-icon","theme-preview"]};
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_DREAM_SKIN_DISABLED__";
  const STYLE_REGISTRY_KEY = "__CODEX_DREAM_SKIN_STYLE_SHEETS__";
  const STYLE_ID = "codex-dream-skin-style";
  const SHELL_ATTR = "data-dream-shell";
  const THEME_ATTR = "data-dream-theme";
  const PART_ATTR = "data-ds-part";

  const COMPOSER_BORDER_BRIDGES = [
    "border-color", "border-top-color", "border-right-color", "border-bottom-color",
    "border-left-color", "border-width", "border-top-width", "border-right-width",
    "border-bottom-width", "border-left-width", "border-style", "border-top-style",
    "border-right-style", "border-bottom-style", "border-left-style",
  ].map((property) => ({
    property,
    variable: `--ds-community-composer-${property}`,
  })).filter(({ variable }) => cssText.includes(`${variable}:`));
  const ROOT_ATTRS = [
    "data-dream-skin", SHELL_ATTR, THEME_ATTR, "data-dream-upload-alpha",
    "data-dream-art-wide", "data-dream-art-safe", "data-dream-task-mode",
    "data-dream-art-safe-area", "data-dream-art-task-mode", "data-dream-art-aspect",
    "data-dream-art-ready",
  ];

  const initialRoute = new URLSearchParams(String(location.search || ""))
    .get("initialRoute") || "";
  const pathname = String(location.pathname || "");
  const excludedPetSurface = location.protocol === "app:" && (
    pathname.endsWith("/avatar-overlay-composition-surface.html") ||
    initialRoute === "/avatar-overlay" || initialRoute.startsWith("/avatar-overlay/")
  );
  if (excludedPetSurface) {
    const previous = window[STATE_KEY];
    if (typeof previous?.cleanup === "function") previous.cleanup();
    window[DISABLED_KEY] = true;
    return;
  }
  const VERSION = __DREAM_SKIN_VERSION_JSON__;
  const STYLE_REVISION = __DREAM_SKIN_STYLE_REVISION_JSON__;
  const PAYLOAD_REVISION = __DREAM_SKIN_PAYLOAD_REVISION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  // Only adapt declarations in the already validated community layer. Keep
  // foregrounds, borders and element opacity intact. Relative colors preserve
  // authored RGB/alpha (including percentages); local preferences replace alpha
  // rather than multiplying it. Opaque legacy literals use the same 30% default
  // as public background tokens. Explicit `transparent` remains an empty layer.
  const communityStart = cssText.indexOf("@layer dreamskin-community {");
  if (communityStart >= 0) {
    const communityCss = cssText.slice(communityStart).replace(
      /(^[ \t]*background-color:\s*)([^;]+?)(\s*!important;)/gm,
      (declaration, prefix, color, suffix) => {
        const value = color.trim();
        if (value.toLowerCase() === "transparent") return declaration;
        const hasAlpha = /^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(value)
          || /^rgba\(/i.test(value) || /^var\(/i.test(value);
        return `${prefix}rgb(from ${value} r g b / var(--ds-user-surface-alpha, ${hasAlpha ? "alpha" : "0.20"}))${suffix}`;
      },
    );
    cssText = cssText.slice(0, communityStart) + communityCss;
  }
  // Cache structural :has() predicates as element markers. Chromium otherwise
  // re-evaluates these stylesheet conditions during every native hover update.
  const CSS_PREDICATES = [{"selector":":has([role=\"main\"])","attribute":"data-dream-has-0","branches":[{"selector":"[role=\"main\"]","relation":"descendant"}],"replacement":":is(:where([data-dream-has-0]), :is(* [role=\"main\"]):not(*))"},{"selector":":has(main:is(.main-surface, [data-app-shell-main-surface], [class*=\"_MainContentSurface_\"]))","attribute":"data-dream-has-1","branches":[{"selector":"main:is(.main-surface, [data-app-shell-main-surface], [class*=\"_MainContentSurface_\"])","relation":"descendant"}],"replacement":":is(:where([data-dream-has-1]), :is(* main:is(.main-surface, [data-app-shell-main-surface], [class*=\"_MainContentSurface_\"])):not(*))"},{"selector":":has(main:is(.main-surface, [data-app-shell-main-surface], [class*=\"_MainContentSurface_\"]):not([data-app-shell-active-page=\"false\"], [data-app-shell-active-page=\"false\"] *) [role=\"main\"])","attribute":"data-dream-has-2","branches":[{"selector":"main:is(.main-surface, [data-app-shell-main-surface], [class*=\"_MainContentSurface_\"]):not([data-app-shell-active-page=\"false\"], [data-app-shell-active-page=\"false\"] *) [role=\"main\"]","relation":"descendant"}],"replacement":":is(:where([data-dream-has-2]), :is(* main:is(.main-surface, [data-app-shell-main-surface], [class*=\"_MainContentSurface_\"]):not([data-app-shell-active-page=\"false\"], [data-app-shell-active-page=\"false\"] *) [role=\"main\"]):not(*))"},{"selector":":has([data-testid=\"home-icon\"])","attribute":"data-dream-has-3","branches":[{"selector":"[data-testid=\"home-icon\"]","relation":"descendant"}],"replacement":":is(:where([data-dream-has-3]), :is(* [data-testid=\"home-icon\"]):not(*))"},{"selector":":has(> .home-banners)","attribute":"data-dream-has-4","branches":[{"selector":".home-banners","relation":"child"}],"replacement":":is(:where([data-dream-has-4]), :is(* > .home-banners):not(*))"},{"selector":":has([data-ds-part=\"main\"])","attribute":"data-dream-has-5","branches":[{"selector":"[data-ds-part=\"main\"]","relation":"descendant"}],"replacement":":is(:where([data-dream-has-5]), :is(* [data-ds-part=\"main\"]):not(*))"},{"selector":":has([data-ds-part=\"main\"], [data-ds-part=\"home\"])","attribute":"data-dream-has-6","branches":[{"selector":"[data-ds-part=\"main\"]","relation":"descendant"},{"selector":"[data-ds-part=\"home\"]","relation":"descendant"}],"replacement":":is(:where([data-dream-has-6]), :is(* [data-ds-part=\"main\"], * [data-ds-part=\"home\"]):not(*))"},{"selector":":has(:is([class*=\"_homeUtilityBar_\"], [class*=\"_ComposerHomeUtilityBar_\"]))","attribute":"data-dream-has-7","branches":[{"selector":":is([class*=\"_homeUtilityBar_\"], [class*=\"_ComposerHomeUtilityBar_\"])","relation":"descendant"}],"replacement":":is(:where([data-dream-has-7]), :is(* :is([class*=\"_homeUtilityBar_\"], [class*=\"_ComposerHomeUtilityBar_\"])):not(*))"},{"selector":":has(input[type=\"text\"])","attribute":"data-dream-has-8","branches":[{"selector":"input[type=\"text\"]","relation":"descendant"}],"replacement":":is(:where([data-dream-has-8]), :is(* input[type=\"text\"]):not(*))"},{"selector":":has(> input[type=\"text\"])","attribute":"data-dream-has-9","branches":[{"selector":"input[type=\"text\"]","relation":"child"}],"replacement":":is(:where([data-dream-has-9]), :is(* > input[type=\"text\"]):not(*))"},{"selector":":has([data-codex-composer-root])","attribute":"data-dream-has-10","branches":[{"selector":"[data-codex-composer-root]","relation":"descendant"}],"replacement":":is(:where([data-dream-has-10]), :is(* [data-codex-composer-root]):not(*))"},{"selector":":has(*)","attribute":"data-dream-has-11","branches":[{"selector":"*","relation":"descendant"}],"replacement":":is(:where([data-dream-has-11]), :is(* *):not(*))"},{"selector":":has(> .horizontal-scroll-fade-mask .group\\/project-selector)","attribute":"data-dream-has-12","branches":[{"selector":".horizontal-scroll-fade-mask .group\\/project-selector","relation":"child"}],"replacement":":is(:where([data-dream-has-12]), :is(* > .horizontal-scroll-fade-mask .group\\/project-selector):not(*))"},{"selector":":has(> [data-mention-list-scroll-area])","attribute":"data-dream-has-13","branches":[{"selector":"[data-mention-list-scroll-area]","relation":"child"}],"replacement":":is(:where([data-dream-has-13]), :is(* > [data-mention-list-scroll-area]):not(*))"},{"selector":":has(~ [role=\"dialog\"] [data-testid=\"image-preview-dismiss-area\"] table)","attribute":"data-dream-has-14","branches":[{"selector":"[role=\"dialog\"] [data-testid=\"image-preview-dismiss-area\"] table","relation":"sibling"}],"replacement":":is(:where([data-dream-has-14]), :is(* ~ [role=\"dialog\"] [data-testid=\"image-preview-dismiss-area\"] table):not(*))"},{"selector":":has([data-testid=\"image-preview-dismiss-area\"] table)","attribute":"data-dream-has-15","branches":[{"selector":"[data-testid=\"image-preview-dismiss-area\"] table","relation":"descendant"}],"replacement":":is(:where([data-dream-has-15]), :is(* [data-testid=\"image-preview-dismiss-area\"] table):not(*))"},{"selector":":has(table)","attribute":"data-dream-has-16","branches":[{"selector":"table","relation":"descendant"}],"replacement":":is(:where([data-dream-has-16]), :is(* table):not(*))"}]
    .filter((item) => item.selector !== ":has(*)" && cssText.includes(item.selector));
  for (const { selector, replacement } of CSS_PREDICATES) {
    cssText = cssText.replaceAll(selector, replacement);
  }
  const ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
  const ART_METADATA = THEME.artMetadata && typeof THEME.artMetadata === "object"
    ? THEME.artMetadata : null;
  const ANALYSIS_CACHE_KEY = "__CODEX_DREAM_SKIN_ANALYSIS_CACHE__";
  const THEME_VARIABLES = [
    "--ds-upload-panel-alpha", "--ds-upload-bg-alpha", "--ds-upload-panel-alt-alpha",
    "--ds-user-surface-alpha",
    "--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-green", "--ds-lime", "--ds-on-accent",
    "--ds-cyan", "--ds-purple", "--ds-text", "--ds-muted", "--ds-line",
    "--ds-bg-rgb", "--ds-panel-rgb", "--ds-panel-2-rgb", "--ds-accent-rgb",
    "--ds-accent-alt-rgb", "--ds-secondary-rgb", "--ds-highlight-rgb",
    "--ds-text-rgb", "--ds-muted-rgb", "--ds-line-rgb",
    "--dream-art-focus-x", "--dream-art-focus-y", "--dream-art-position",
    "--dream-skin-focus-x", "--dream-skin-focus-y", "--dream-skin-art-position",
    "--dream-skin-name", "--dream-skin-tagline", "--dream-skin-project-prefix",
    "--dream-skin-project-label", "--dream-skin-brand-subtitle", "--dream-skin-status",
    "--dream-skin-quote", "--dream-skin-art",
    "--ds-theme-color-background", "--ds-theme-color-panel",
    "--ds-theme-color-panel-alt", "--ds-theme-color-accent",
    "--ds-theme-color-accent-alt", "--ds-theme-color-secondary",
    "--ds-theme-color-highlight", "--ds-theme-color-text",
    "--ds-theme-color-muted", "--ds-theme-color-line",
    "--ds-theme-font-family", "--ds-theme-font-scale",
    "--ds-theme-surface-radius", "--ds-theme-surface-opacity",
    "--ds-theme-surface-blur", "--ds-theme-surface-border-alpha",
    "--ds-theme-surface-shadow", "--ds-theme-image-focus-x",
    "--ds-theme-image-focus-y", "--ds-theme-image-zoom",
    "--ds-theme-image-dim", "--ds-theme-image-task-intensity",
    "--ds-theme-density-scale", "--ds-theme-motion-level",
    "--ds-live-refract-mult", "--ds-live-blur-mult", "--ds-live-rim-mult",
    "--ds-live-weight-body", "--ds-live-weight-ctrl", "--ds-live-weight-head",
  ];
  const selectorByKey = new Map(SELECTOR_CONTRACT.selectors.map((entry) => [entry.key, entry]));
  const stableTestidSelector = (testid) => SELECTOR_CONTRACT.stableTestids?.includes(testid)
    ? `[data-testid="${testid}"]` : null;
  const installToken = {};
  const existingAnalysisCache = window[ANALYSIS_CACHE_KEY];
  const analysisCache = existingAnalysisCache && typeof existingAnalysisCache.get === "function" &&
    typeof existingAnalysisCache.set === "function" ? existingAnalysisCache : new Map();
  window[ANALYSIS_CACHE_KEY] = analysisCache;
  let artAnalysis = typeof THEME.artKey === "string" ? analysisCache.get(THEME.artKey) ?? null : null;
  let analysisTimer = null;
  let rootObserver = null;
  let partObserver = null;
  let bodyReadyHandler = null;
  let styleMode = null;
  let styleNode = null;
  let styleSheet = null;
  let harmonyCleanup = null;

  const now = () => typeof performance === "object" && typeof performance.now === "function"
    ? performance.now() : Date.now();
  const metrics = {
    ensureCalls: 0,
    rootPasses: 0,
    routePasses: 0,
    layoutReads: 0,
    attributeWrites: 0,
    styleWrites: 0,
    styleRepairs: 0,
    partPasses: 0,
    partWrites: 0,
    predicatePasses: 0,
    predicateWrites: 0,
    predicateMs: 0,
    navigationEvents: 0,
    safetyPasses: 0,
    analysisRuns: 0,
    analysisCacheHits: artAnalysis ? 1 : 0,
    firstEnsureMs: null,
    analysisMs: null,
  };

  const previous = window[STATE_KEY];
  if (typeof previous?.cleanup === "function") previous.cleanup();
  window[DISABLED_KEY] = false;

  const existingStyleRegistry = window[STYLE_REGISTRY_KEY];
  const styleRegistry = existingStyleRegistry instanceof Set ? existingStyleRegistry : new Set();
  window[STYLE_REGISTRY_KEY] = styleRegistry;
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();

  const cssString = (value) => JSON.stringify(String(value ?? ""));

  const setStyleProperty = (root, name, value) => {
    if (root.style.getPropertyValue(name) !== value) {
      root.style.setProperty(name, value);
      metrics.styleWrites += 1;
    }
  };

  const setAttribute = (root, name, value) => {
    const normalized = String(value);
    if (root.getAttribute(name) !== normalized) {
      root.setAttribute(name, normalized);
      metrics.attributeWrites += 1;
    }
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const hex = String(value).trim().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      const digits = hex[1];
      const rgbHex = digits.length <= 4
        ? digits.slice(0, 3).split("").map((digit) => `${digit}${digit}`).join("")
        : digits.slice(0, 6);
      const alphaHex = digits.length === 4
        ? `${digits[3]}${digits[3]}`
        : digits.length === 8 ? digits.slice(6, 8) : "ff";
      const number = Number.parseInt(rgbHex, 16);
      return {
        r: number >> 16,
        g: (number >> 8) & 255,
        b: number & 255,
        alpha: Number.parseInt(alphaHex, 16) / 255,
      };
    }
    const m = String(value).trim().match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
    );
    if (!m) return null;
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      alpha: m[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(m[4]))),
    };
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const rgbString = (value) => {
    const rgb = parseRgb(value);
    return rgb ? [rgb.r, rgb.g, rgb.b]
      .map((channel) => Math.round(clamp(channel, 0, 255)))
      .join(" ") : null;
  };

  const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

  const relativeLuminance = ({ r, g, b }) => {
    const channels = [r, g, b].map((value) => {
      const normalized = clamp(value, 0, 255) / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const compositeColor = (value, background, alphaOverride = null) => {
    const foreground = parseRgb(value);
    if (!foreground) return background;
    const alpha = clamp(alphaOverride ?? foreground.alpha ?? 1, 0, 1);
    return {
      r: clamp(foreground.r, 0, 255) * alpha + background.r * (1 - alpha),
      g: clamp(foreground.g, 0, 255) * alpha + background.g * (1 - alpha),
      b: clamp(foreground.b, 0, 255) * alpha + background.b * (1 - alpha),
    };
  };

  const readableAccentInk = (accent, panel, panelAlpha = 0.94) => {
    // Match the composer background alpha and compare both possible backdrop
    // extremes so artwork cannot flip the decision.
    const luminances = [0, 255].map((backdrop) => {
      const surface = compositeColor(
        panel,
        { r: backdrop, g: backdrop, b: backdrop },
        panelAlpha,
      );
      return relativeLuminance(compositeColor(accent, surface));
    });
    const whiteContrast = Math.min(...luminances.map((value) => 1.05 / (value + 0.05)));
    const blackContrast = Math.min(...luminances.map((value) => (value + 0.05) / 0.05));
    return whiteContrast >= blackContrast ? "rgb(255 255 255)" : "rgb(0 0 0)";
  };

  const rgbToHsl = ({ r, g, b }) => {
    const values = [r, g, b].map((value) => value / 255);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue;
    if (max === values[0]) hue = (values[1] - values[2]) / delta + (values[1] < values[2] ? 6 : 0);
    else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
    else hue = (values[0] - values[1]) / delta + 4;
    return { h: hue * 60, s: saturation, l: lightness };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const neutral = Math.round(l * 255);
      return { r: neutral, g: neutral, b: neutral };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset) => {
      let t = hue + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: channel(1 / 3) * 255, g: channel(0) * 255, b: channel(-1 / 3) * 255 };
  };

  const detectShellAppearance = () => {
    const root = document.documentElement;
    const nativeTheme = root?.getAttribute("data-theme");
    if (nativeTheme === "dark" || nativeTheme === "light") return nativeTheme;
    if (root?.classList?.contains("electron-dark")) return "dark";
    if (root?.classList?.contains("electron-light")) return "light";
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch {}
    return "light";
  };

  const makeAdaptivePalette = (sample, shell) => {
    const source = sample || { r: 108, g: 126, b: 136 };
    const hsl = rgbToHsl(source);
    const hue = hsl.s < 0.12 ? 214 : hsl.h;
    const saturation = clamp(hsl.s, 0.38, 0.72);
    const accent = hslToRgb({ h: hue, s: saturation, l: shell === "light" ? 0.42 : 0.66 });
    const accentAlt = hslToRgb({ h: hue + 12, s: saturation * 0.82, l: shell === "light" ? 0.52 : 0.73 });
    const secondary = hslToRgb({ h: hue - 24, s: saturation * 0.64, l: shell === "light" ? 0.56 : 0.62 });
    const highlight = hslToRgb({ h: hue + 24, s: saturation * 0.76, l: shell === "light" ? 0.36 : 0.58 });
    const neutral = (lightness, chroma = 0.08) => rgbToHex(hslToRgb({ h: hue, s: chroma, l: lightness }));
    return shell === "light" ? {
      background: neutral(0.965, 0.07),
      panel: neutral(0.987, 0.035),
      panelAlt: neutral(0.945, 0.09),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.13, 0.10),
      muted: neutral(0.42, 0.08),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .24)`,
    } : {
      background: neutral(0.055, 0.045),
      panel: neutral(0.085, 0.04),
      panelAlt: neutral(0.125, 0.05),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.93, 0.025),
      muted: neutral(0.69, 0.03),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .28)`,
    };
  };

  const resolvedShell = () => {
    if (THEME.appearance === "light" || THEME.appearance === "dark") return THEME.appearance;
    // Image luminance may tune accents and scrims, but auto appearance follows
    // Codex/ChatGPT (or the OS fallback) so a bright wallpaper cannot flip a
    // native dark session back to a light shell after analysis.
    return detectShellAppearance();
  };

  const applyTheme = (root, shell) => {
    const declaredColors = THEME.colors && typeof THEME.colors === "object" ? THEME.colors : {};
    const legacyPalette = THEME.palette && typeof THEME.palette === "object" ? THEME.palette : {};
    // macOS themes use the full `colors` contract; older Windows themes used
    // `palette.accent`. Accept both while keeping one renderer source.
    const colors = Object.keys(declaredColors).length ? declaredColors : legacyPalette;
    const hasExplicitKeyList = Array.isArray(THEME.explicitColorKeys);
    const explicit = new Set(hasExplicitKeyList ? THEME.explicitColorKeys : []);
    if (!hasExplicitKeyList && (THEME.colorMode === "explicit" || !Object.hasOwn(THEME, "colorMode"))) {
      for (const key of Object.keys(declaredColors)) explicit.add(key);
    }
    if (typeof legacyPalette.accent === "string") explicit.add("accent");
    const explicitAlpha = (name) => {
      const value = declaredColors[name];
      if (!explicit.has(name) || typeof value !== "string") return null;
      const source = value.trim();
      const supplied = /^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(source)
        || /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*\)$/i.test(source);
      return supplied ? parseRgb(source)?.alpha ?? null : null;
    };
    // Preferences are supplied by the local injector, never by the theme ZIP.
    // Transparency is the visible wallpaper percentage (30 => alpha .70).
    const userAlpha = typeof THEME.userTransparency === "number"
      && Number.isFinite(THEME.userTransparency)
      && THEME.userTransparency >= 0 && THEME.userTransparency <= 100
      ? (100 - THEME.userTransparency) / 100 : null;
    const panelAlpha = userAlpha ?? explicitAlpha("panel") ?? 0.20;
    const backgroundAlpha = userAlpha ?? explicitAlpha("background") ?? panelAlpha;
    const panelAltAlpha = userAlpha ?? explicitAlpha("panelAlt") ?? panelAlpha;
    if (userAlpha !== null) setStyleProperty(root, "--ds-user-surface-alpha", String(userAlpha));
    else root.style.removeProperty("--ds-user-surface-alpha");
    const uploadAlphas = {
      "--ds-upload-panel-alpha": panelAlpha,
      "--ds-upload-bg-alpha": backgroundAlpha,
      "--ds-upload-panel-alt-alpha": panelAltAlpha,
    };
    for (const [name, alpha] of Object.entries(uploadAlphas)) {
      if (alpha !== null) setStyleProperty(root, name, String(alpha));
      else root.style.removeProperty(name);
    }
    if (Object.values(uploadAlphas).some((alpha) => alpha !== null)) {
      setAttribute(root, "data-dream-upload-alpha", "true");
    } else root.removeAttribute("data-dream-upload-alpha");

    const adaptive = makeAdaptivePalette(artAnalysis?.accentRgb, shell);
    const legacyLight = (THEME.appearance === undefined || THEME.appearance === "auto")
      && THEME.colorMode !== "explicit" && shell === "light";
    const structural = new Set(["background", "panel", "panelAlt", "text", "muted"]);
    const pick = (name) => {
      const allowExplicit = explicit.has(name) && !(legacyLight && structural.has(name));
      return allowExplicit && typeof colors[name] === "string" ? colors[name] : adaptive[name];
    };
    const accent = pick("accent");
    const accentAlt = explicit.has("accentAlt") ? pick("accentAlt") : (explicit.has("accent") ? accent : adaptive.accentAlt);
    const variables = {
      "--ds-bg": pick("background"),
      "--ds-panel": pick("panel"),
      "--ds-panel-2": pick("panelAlt"),
      "--ds-green": accent,
      "--ds-lime": accentAlt,
      "--ds-cyan": pick("secondary"),
      "--ds-purple": pick("highlight"),
      "--ds-text": pick("text"),
      "--ds-muted": pick("muted"),
      "--ds-line": explicit.has("line") && typeof colors.line === "string" ? colors.line : adaptive.line,
    };

    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string" && value) setStyleProperty(root, name, value);
    }
    if (explicit.has("accent")) {
      const accentInk = readableAccentInk(
        accent,
        variables["--ds-panel"],
        panelAlpha ?? 0.94,
      );
      if (accentInk) setStyleProperty(root, "--ds-on-accent", accentInk);
    }
    const publicColors = {
      "--ds-theme-color-background": `rgb(${rgbString(variables["--ds-bg"])} / ${backgroundAlpha})`,
      "--ds-theme-color-panel": `rgb(${rgbString(variables["--ds-panel"])} / ${panelAlpha})`,
      "--ds-theme-color-panel-alt": `rgb(${rgbString(variables["--ds-panel-2"])} / ${panelAltAlpha})`,
      "--ds-theme-color-accent": variables["--ds-green"],
      "--ds-theme-color-accent-alt": variables["--ds-lime"],
      "--ds-theme-color-secondary": variables["--ds-cyan"],
      "--ds-theme-color-highlight": variables["--ds-purple"],
      "--ds-theme-color-text": variables["--ds-text"],
      "--ds-theme-color-muted": variables["--ds-muted"],
      "--ds-theme-color-line": variables["--ds-line"],
    };
    for (const [name, value] of Object.entries(publicColors)) {
      if (typeof value === "string" && value) setStyleProperty(root, name, value);
    }
    setStyleProperty(root, "--ds-theme-surface-radius", "12px");
    setStyleProperty(root, "--ds-theme-surface-opacity", "1");
    setStyleProperty(root, "--ds-theme-surface-blur", "0px");
    setStyleProperty(root, "--ds-theme-font-family", "system");
    setStyleProperty(root, "--ds-theme-font-scale", "1");
    setStyleProperty(root, "--ds-theme-surface-border-alpha", "0.14");
    setStyleProperty(root, "--ds-theme-surface-shadow", "soft");
    setStyleProperty(root, "--ds-theme-image-zoom", "1");
    setStyleProperty(root, "--ds-theme-image-dim", "0");
    setStyleProperty(root, "--ds-theme-image-task-intensity", "0.35");
    setStyleProperty(root, "--ds-theme-density-scale", "standard");
    setStyleProperty(root, "--ds-theme-motion-level", "standard");
    const rgbVariables = {
      "--ds-bg-rgb": variables["--ds-bg"],
      "--ds-panel-rgb": variables["--ds-panel"],
      "--ds-panel-2-rgb": variables["--ds-panel-2"],
      "--ds-accent-rgb": variables["--ds-green"],
      "--ds-accent-alt-rgb": variables["--ds-lime"],
      "--ds-secondary-rgb": variables["--ds-cyan"],
      "--ds-highlight-rgb": variables["--ds-purple"],
      "--ds-text-rgb": variables["--ds-text"],
      "--ds-muted-rgb": variables["--ds-muted"],
      "--ds-line-rgb": variables["--ds-line"],
    };
    for (const [name, value] of Object.entries(rgbVariables)) {
      const rgb = rgbString(value);
      if (rgb) setStyleProperty(root, name, rgb);
    }
    setStyleProperty(root, "--dream-skin-name", cssString(THEME.name || "JBY Liquid Glass"));
    setStyleProperty(root, "--dream-skin-tagline", cssString(THEME.tagline || "Make something wonderful."));
    setStyleProperty(root, "--dream-skin-quote", cssString(THEME.quote || "MAKE SOMETHING WONDERFUL"));
    setStyleProperty(root, "--dream-skin-brand-subtitle", cssString(
      THEME.brandSubtitle || "JBY LIQUID GLASS",
    ));
    setStyleProperty(root, "--dream-skin-status", cssString(THEME.statusText || "DREAM SKIN ONLINE"));
    setStyleProperty(root, "--dream-skin-project-prefix", cssString(THEME.projectPrefix || "选择项目 · "));
    setStyleProperty(root, "--dream-skin-project-label", cssString(THEME.projectLabel || "◉  选择项目"));
  };

  const applyArtMetadata = (root) => {
    const profile = artAnalysis || ART_METADATA;
    const inferredSafe = profile?.safeArea || "center";
    const safeArea = ART.safeArea && ART.safeArea !== "auto" ? ART.safeArea : inferredSafe;
    const canonicalSafe = ["left", "right", "center", "none"].includes(safeArea)
      ? safeArea : "center";
    const focusX = typeof ART.focusX === "number" ? ART.focusX
      : profile?.focusX ?? (safeArea === "left" ? 0.72 : safeArea === "right" ? 0.28 : 0.5);
    const focusY = typeof ART.focusY === "number" ? ART.focusY : profile?.focusY ?? 0.5;
    const taskMode = ART.taskMode && ART.taskMode !== "auto"
      ? ART.taskMode : profile?.taskMode || "ambient";
    const wide = profile?.wide || profile?.aspect === "wide" || profile?.aspect === "ultrawide";
    const aspect = profile?.aspect || "unknown";
    const focusXValue = `${(clamp(focusX, 0, 1) * 100).toFixed(2)}%`;
    const focusYValue = `${(clamp(focusY, 0, 1) * 100).toFixed(2)}%`;

    setAttribute(root, "data-dream-art-wide", wide ? "true" : "false");
    setAttribute(root, "data-dream-art-safe", canonicalSafe);
    setAttribute(root, "data-dream-task-mode", taskMode);
    setAttribute(root, "data-dream-art-safe-area", safeArea);
    setAttribute(root, "data-dream-art-task-mode", taskMode);
    setAttribute(root, "data-dream-art-aspect", aspect);
    setAttribute(root, "data-dream-art-ready", artAnalysis ? "true" : "false");
    setStyleProperty(root, "--dream-art-focus-x", focusXValue);
    setStyleProperty(root, "--dream-art-focus-y", focusYValue);
    setStyleProperty(root, "--dream-art-position", `${focusXValue} ${focusYValue}`);
    setStyleProperty(root, "--dream-skin-focus-x", focusXValue);
    setStyleProperty(root, "--dream-skin-focus-y", focusYValue);
    setStyleProperty(root, "--dream-skin-art-position", `${focusXValue} ${focusYValue}`);
    setStyleProperty(root, "--ds-theme-image-focus-x", String(Number(focusX.toFixed(4))));
    setStyleProperty(root, "--ds-theme-image-focus-y", String(Number(focusY.toFixed(4))));
  };

  const analyzeArt = () => new Promise((resolve) => {
    const startedAt = now();
    metrics.analysisRuns += 1;
    if (typeof window.Image !== "function" || !document?.createElement) {
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(null);
      return;
    }
    const image = new window.Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (analysisTimer) clearTimeout(analysisTimer);
      analysisTimer = null;
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(value);
    };
    analysisTimer = setTimeout(() => finish(null), 6000);
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const ratio = image.naturalWidth / image.naturalHeight;
        if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Invalid image dimensions");
        const maxDimension = 96;
        const width = Math.max(16, Math.round(ratio >= 1 ? maxDimension : maxDimension * ratio));
        const height = Math.max(16, Math.round(ratio >= 1 ? maxDimension / ratio : maxDimension));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const samples = new Array(width * height);
        const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
        let lightTotal = 0;
        let count = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            if (data[offset + 3] < 32) continue;
            const rgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
            const light = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
            const hsl = rgbToHsl(rgb);
            samples[y * width + x] = { light, saturation: hsl.s };
            lightTotal += light;
            count += 1;
            if (hsl.s >= 0.16 && hsl.l >= 0.16 && hsl.l <= 0.86) {
              const bin = bins[Math.min(23, Math.floor(hsl.h / 15))];
              const weight = hsl.s * (1 - Math.abs(hsl.l - 0.52) * 0.85);
              bin.weight += weight;
              bin.r += rgb.r * weight;
              bin.g += rgb.g * weight;
              bin.b += rgb.b * weight;
            }
          }
        }
        if (!count) throw new Error("Image has no visible pixels");
        const brightness = lightTotal / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let pixels = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = samples[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              pixels += 1;
              const previous = x > start ? samples[y * width + x - 1] : null;
              const above = y > 0 ? samples[(y - 1) * width + x] : null;
              if (previous) { edges += Math.abs(sample.light - previous.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = pixels ? total / pixels : 0;
          const variance = pixels ? Math.max(0, totalSquared / pixels - mean * mean) : 1;
          return Math.sqrt(variance) * 0.58 + (edgeCount ? edges / edgeCount : 1) * 0.42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * 0.38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * 0.86) safeArea = "left";
        else if (rightInformation < leftInformation * 0.86) safeArea = "right";

        let saliencyTotal = 0;
        let saliencyX = 0;
        let saliencyY = 0;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const sample = samples[y * width + x];
            if (!sample) continue;
            const previous = x > 0 ? samples[y * width + x - 1] : null;
            const above = y > 0 ? samples[(y - 1) * width + x] : null;
            const edge = (previous ? Math.abs(sample.light - previous.light) : 0) +
              (above ? Math.abs(sample.light - above.light) : 0);
            const weight = 0.01 + Math.abs(sample.light - brightness) * 0.48 +
              sample.saturation * 0.34 + edge * 0.28;
            saliencyTotal += weight;
            saliencyX += (x + 0.5) / width * weight;
            saliencyY += (y + 0.5) / height * weight;
          }
        }
        let focusX = saliencyTotal ? saliencyX / saliencyTotal : 0.5;
        let focusY = saliencyTotal ? saliencyY / saliencyTotal : 0.5;
        if (safeArea === "left") focusX = Math.max(0.64, focusX);
        if (safeArea === "right") focusX = Math.min(0.36, focusX);
        focusX = clamp(focusX, 0.12, 0.88);
        focusY = clamp(focusY, 0.18, 0.82);

        const accentBin = bins.reduce((best, candidate) => candidate.weight > best.weight ? candidate : best, bins[0]);
        const accentRgb = accentBin.weight > 0 ? {
          r: accentBin.r / accentBin.weight,
          g: accentBin.g / accentBin.weight,
          b: accentBin.b / accentBin.weight,
        } : null;
        const aspect = ratio >= 2.25 ? "ultrawide" : ratio >= 1.45 ? "wide"
          : ratio >= 1.08 ? "landscape" : ratio >= 0.9 ? "square" : "portrait";
        finish({
          width: image.naturalWidth,
          height: image.naturalHeight,
          ratio,
          wide: ratio >= 1.75,
          aspect,
          brightness,
          shell: brightness >= 0.58 ? "light" : "dark",
          safeArea,
          focusX,
          focusY,
          taskMode: ratio >= 2.25 ? "banner" : "ambient",
          accentRgb,
        });
      } catch {
        finish(null);
      }
    };
    image.src = artUrl;
  });

  const installStyle = () => {
    try {
      if (!("adoptedStyleSheets" in document) || typeof CSSStyleSheet !== "function") {
        throw new Error("Constructable stylesheets are unavailable");
      }
      const sheet = new CSSStyleSheet();
      if (typeof sheet.replaceSync !== "function") throw new Error("replaceSync is unavailable");
      sheet.replaceSync(cssText);
      const retained = [...document.adoptedStyleSheets]
        .filter((candidate) => !styleRegistry.has(candidate));
      document.adoptedStyleSheets = [...retained, sheet];
      styleRegistry.clear();
      styleRegistry.add(sheet);
      document.getElementById(STYLE_ID)?.remove();
      styleSheet = sheet;
      styleMode = "adopted";
      return;
    } catch {
      styleSheet = null;
    }

    styleNode = document.getElementById(STYLE_ID) || document.createElement("style");
    styleNode.id = STYLE_ID;
    styleNode.textContent = cssText;
    if (!styleNode.parentElement) (document.head || document.documentElement).appendChild(styleNode);
    styleMode = "style";
  };

  const ensureStyle = () => {
    if (styleMode === "adopted" && styleSheet) {
      const current = [...document.adoptedStyleSheets];
      if (!current.includes(styleSheet)) {
        document.adoptedStyleSheets = [...current, styleSheet];
        metrics.styleRepairs += 1;
      }
      return;
    }
    if (styleNode && document.getElementById(STYLE_ID) !== styleNode) {
      document.getElementById(STYLE_ID)?.remove();
      (document.head || document.documentElement).appendChild(styleNode);
      metrics.styleRepairs += 1;
    }
  };

  installStyle();

  let lastRootSignature = "";
  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    ensureStyle();
    const shell = resolvedShell();
    const sig = `${shell}\0${THEME.id || "custom"}\0${THEME.userTransparency ?? 80}\0${artUrl}`;
    if (
      lastRootSignature === sig &&
      root.getAttribute("data-dream-skin") === "active" &&
      root.getAttribute(SHELL_ATTR) === shell
    ) {
      return shell;
    }
    lastRootSignature = sig;
    setAttribute(root, "data-dream-skin", "active");
    setAttribute(root, SHELL_ATTR, shell);
    setAttribute(root, THEME_ATTR, THEME.id || "custom");
    setStyleProperty(root, "--dream-skin-art", `url("${artUrl}")`);
    if (root.style.colorScheme !== shell) {
      root.style.colorScheme = shell;
    }

    applyTheme(root, shell);
    applyArtMetadata(root);
    return shell;
  };

  // Codex 26.930 retains previous routes in the DOM. Their anchors must not
  // select the active scope or receive public theme-part markers.
  const queryAll = (selector) => {
    if (!selector) return [];
    try {
      return [...document.querySelectorAll(selector)]
        .filter((node) => !node.closest?.('[data-app-shell-active-page="false"]'));
    } catch { return []; }
  };
  const selectorHit = (key) => queryAll(selectorByKey.get(key)?.selector).length > 0;
  const stableTestidHit = (testid) => queryAll(stableTestidSelector(testid)).length > 0;

  const partNodes = new Set();
  const composerBorderRestores = new Map();
  const selectorNodes = (key) => queryAll(selectorByKey.get(key)?.selector);
  const genericNodes = (selector) => queryAll(selector)
    .filter((node) => node && typeof node.setAttribute === "function");
  const genericInputNodes = () => genericNodes(
    'textarea, [contenteditable="true"], [role="textbox"]',
  ).filter((node) => !node.closest?.('[role="dialog"], [aria-modal="true"]'));
  const resolvedMainNode = () => {
    const exact = selectorNodes("shell-main")[0];
    if (exact) return exact;
    for (const input of genericInputNodes()) {
      const main = input.closest?.('main, [role="main"]');
      if (main && typeof main.setAttribute === "function") return main;
    }
    return genericNodes('main, [role="main"]')
      .find((node) => !node.closest?.('[role="dialog"], [aria-modal="true"]')) ?? null;
  };
  const fallbackMainNodes = () => selectorNodes("shell-main").length
    ? [] : [resolvedMainNode()].filter(Boolean);
  const fallbackSidebarNodes = () => {
    if (selectorNodes("left-panel").length) return [];
    const main = resolvedMainNode();
    const mainParent = main?.parentElement;
    if (!main || !mainParent) return [];
    const candidate = genericNodes('aside, nav[aria-label]')
      .filter((node) => !main.contains?.(node))
      .filter((node) => !node.closest?.('[role="dialog"], [aria-modal="true"]'))
      .find((node) => node.parentElement === mainParent
        || node.parentElement?.parentElement === mainParent
        || node.parentElement === mainParent.parentElement);
    return candidate ? [candidate] : [];
  };
  const fallbackComposerNodes = () => selectorNodes("composer-chrome").length
    ? [] : (() => {
      const main = resolvedMainNode();
      for (const input of genericInputNodes()) {
        if (main && !main.contains?.(input)) continue;
        const layoutRoot = input.closest?.('[class*="_ComposerLayoutRoot_"]');
        if (layoutRoot && (!main || main.contains?.(layoutRoot))) return [layoutRoot];
        const semanticOwner = input.closest?.(
          '.composer-surface-chrome, [data-composer-surface-variant][data-composer-radius-variant], ' +
          '[class*="_ComposerLayoutRoot_"]',
        );
        if (semanticOwner && (!main || main.contains?.(semanticOwner))) return [semanticOwner];
        const ownerSelector =
          '[data-testid*="composer" i], [data-testid*="prompt" i], ' +
          '[class*="composer" i], [class*="prompt" i]';
        const nearest = input.closest?.(ownerSelector);
        if (!nearest || (main && !main.contains?.(nearest))) continue;
        let owner = nearest;
        for (let parent = nearest.parentElement; parent && parent !== main;
          parent = parent.parentElement) {
          if (parent.matches?.(ownerSelector)) owner = parent;
        }
        return [owner];
      }
      return [];
    })();
  const fallbackComposerToolbarNodes = (composerNodes) => {
    if (selectorNodes("composer-toolbar").length || !composerNodes.length) return [];
    return genericNodes(
      '[data-composer-footer-responsive], [class*="_ComposerLayoutFooter_"], [class*="_footer_"]',
    ).filter((node) => composerNodes.some((composer) =>
      composer !== node && composer.contains?.(node)));
  };
  const addPart = (desired, part, nodes) => {
    for (const node of nodes) {
      if (node && typeof node.setAttribute === "function" && !desired.has(node)) {
        desired.set(node, part);
      }
    }
  };
  const restoreComposerBorders = (node) => {
    const saved = composerBorderRestores.get(node);
    if (!saved) return;
    for (const [property, { value, priority }] of saved) {
      if (value) node.style.setProperty(property, value, priority);
      else node.style.removeProperty(property);
      metrics.styleWrites += 1;
    }
    composerBorderRestores.delete(node);
  };
  const isWorkComposerNode = (node) => Boolean(
    node?.matches?.('[data-composer-utility-bar-variant="home"]')
    && node.querySelector?.('[data-composer-rail][data-composer-rail-placement="responsive"], [class*="ResponsiveHomeUtilityBar"] [data-composer-rail]')
  );
  const refreshComposerBorders = (composerNodes) => {
    const desired = new Set(
      COMPOSER_BORDER_BRIDGES.length
        ? composerNodes.filter((node) => !isWorkComposerNode(node))
        : []
    );
    for (const node of composerBorderRestores.keys()) {
      if (!desired.has(node)) restoreComposerBorders(node);
    }
    for (const node of desired) {
      if (!node?.style || composerBorderRestores.has(node)) continue;
      const saved = new Map();
      for (const { property, variable } of COMPOSER_BORDER_BRIDGES) {
        saved.set(property, {
          value: node.style.getPropertyValue(property),
          priority: node.style.getPropertyPriority(property),
        });
        node.style.setProperty(property, `var(${variable})`, "important");
        metrics.styleWrites += 1;
      }
      composerBorderRestores.set(node, saved);
    }
  };
  const resolvedMessageNodes = () => selectorNodes("message").map((node) => {
    if (!node?.hasAttribute?.("data-local-conversation-user-anchor")) return node;
    // Current Codex user anchors span the conversation column. Prefer the
    // adaptive native bubble, while retaining the older anchor as a fallback.
    return node.querySelector?.(
      '[class*="max-w-"][class*="rounded-2xl"][class*="text-start"]',
    ) ?? node;
  });
  const refreshParts = () => {
    metrics.partPasses += 1;
    const desired = new Map();
    addPart(desired, "root", [document.documentElement]);
    addPart(desired, "sidebar", [...selectorNodes("left-panel"), ...fallbackSidebarNodes()]);
    addPart(desired, "header", selectorNodes("header-tint"));
    // Route-specific parts win when a generic shell collapses home and main
    // onto the same element.
    const homeRoutes = selectorNodes("home-route");
    const settingsRoutes = selectorNodes("settings-panel");
    const threadSurfaces = selectorNodes("thread-surface");
    const isSettingsOnly = settingsRoutes.length > 0 && !threadSurfaces.length && !homeRoutes.length;
    addPart(desired, "home", homeRoutes);
    addPart(desired, "main", [...selectorNodes("shell-main"), ...fallbackMainNodes()]);
    addPart(desired, "project-list", isSettingsOnly ? [] : selectorNodes("project-selector"));
    addPart(desired, "thread", threadSurfaces);
    addPart(desired, "message", isSettingsOnly ? [] : resolvedMessageNodes());
    const composerNodes = isSettingsOnly ? [] : [...selectorNodes("composer-chrome"), ...fallbackComposerNodes()];
    addPart(desired, "composer", composerNodes);
    addPart(desired, "composer-toolbar", isSettingsOnly ? [] : [
      ...selectorNodes("composer-toolbar"), ...fallbackComposerToolbarNodes(composerNodes),
    ]);
    addPart(desired, "dialog", selectorNodes("overlay-dialog"));
    const homeHero = isSettingsOnly ? null : (selectorNodes("game-source")[0] ??
      selectorNodes("home-icon")[0]?.parentElement);
    addPart(desired, "home-hero", homeHero ? [homeHero] : []);

    for (const node of partNodes) {
      if (!desired.has(node)) {
        node.removeAttribute?.(PART_ATTR);
        metrics.partWrites += 1;
      }
    }
    partNodes.clear();
    for (const [node, part] of desired) {
      if (node.getAttribute?.(PART_ATTR) !== part) {
        node.setAttribute(PART_ATTR, part);
        metrics.partWrites += 1;
      }
      partNodes.add(node);
    }
    refreshComposerBorders(composerNodes);
  };

  const ROOT_PREDICATE_ATTRS = new Set([
    "data-dream-has-0", "data-dream-has-1", "data-dream-has-2",
    "data-dream-has-3", "data-dream-has-5", "data-dream-has-6",
  ]);
  const predicateNodes = CSS_PREDICATES.map(() => new Set());
  const refreshPredicates = () => {
    if (!CSS_PREDICATES.length) return;
    const startedAt = now();
    metrics.predicatePasses += 1;
    CSS_PREDICATES.forEach(({ selector, attribute, branches }, index) => {
      // Find the rare landmarks first and scope narrow predicates so leaf mounts
      // never dirty <html>/<body> with irrelevant data-dream-has-* attributes.
      const allowRoot = ROOT_PREDICATE_ATTRS.has(attribute);
      const candidates = new Set();
      if (attribute === "data-dream-has-8") {
        for (const leaf of document.querySelectorAll('input[type="text"]')) {
          const sticky = leaf.closest?.("div.sticky");
          if (sticky) candidates.add(sticky);
        }
      } else if (attribute === "data-dream-has-9") {
        for (const leaf of document.querySelectorAll('input[type="text"]')) {
          const p = leaf.parentElement;
          if (p && p.matches?.("div.no-drag")) candidates.add(p);
        }
      } else if (attribute === "data-dream-has-16") {
        for (const leaf of document.querySelectorAll('[data-testid="image-preview-dismiss-area"] table')) {
          const direct = leaf.closest?.('[data-testid="image-preview-dismiss-area"] > *');
          if (direct) candidates.add(direct);
        }
      } else {
        for (const branch of branches) {
          if (!branch?.selector || branch.selector === "*") continue;
          for (const leaf of document.querySelectorAll(branch.selector)) {
            if (branch.relation === "sibling" || branch.relation === "adjacent") {
              for (let ancestor = leaf; ancestor; ancestor = ancestor.parentElement) {
                for (let sibling = ancestor.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
                  candidates.add(sibling);
                }
              }
            } else {
              for (let ancestor = leaf.parentElement; ancestor; ancestor = ancestor.parentElement) {
                if (!allowRoot && (ancestor === document.documentElement || ancestor === document.body)) break;
                candidates.add(ancestor);
              }
            }
          }
        }
      }
      // Native editor contents never own these structural skin surfaces.
      // Their mutation observer normalizes unexpected attribute writes.
      const desired = new Set([...candidates].filter((node) =>
        !node.closest?.('[contenteditable="true"], .ProseMirror') && node.matches(selector)));
      const previous = predicateNodes[index];
      for (const node of previous) {
        if (!desired.has(node)) {
          node.removeAttribute(attribute);
          metrics.predicateWrites += 1;
        }
      }
      for (const node of desired) {
        if (node.getAttribute(attribute) !== "true") {
          node.setAttribute(attribute, "true");
          metrics.predicateWrites += 1;
        }
      }
      predicateNodes[index] = desired;
    });
    metrics.predicateMs += now() - startedAt;
  };
  const removePredicates = () => {
    CSS_PREDICATES.forEach(({ attribute }, index) => {
      // Sets retain detached owners so cleanup also restores removed routes.
      const nodes = new Set([...predicateNodes[index], ...document.querySelectorAll(`[${attribute}]`)]);
      for (const node of nodes) node.removeAttribute(attribute);
      predicateNodes[index].clear();
    });
  };

  const removeParts = () => {
    for (const node of [...composerBorderRestores.keys()]) restoreComposerBorders(node);
    for (const node of partNodes) node.removeAttribute?.(PART_ATTR);
    partNodes.clear();
    for (const node of document.querySelectorAll(`[${PART_ATTR}]`)) node.removeAttribute?.(PART_ATTR);
  };

  const scopeMatches = (scope, baseState, overlay) => {
    const active = new Set([baseState]);
    if (baseState !== "settings") active.add("all");
    if (overlay) active.add("overlay");
    const tokens = String(scope || "all").toLowerCase().match(/[a-z]+/g) || ["all"];
    return tokens.some((token) => token !== "config" && active.has(token));
  };

  const detectScope = () => {
    const overlay = selectorHit("overlay-menu") || selectorHit("overlay-dialog") ||
      selectorHit("overlay-popper");
    let baseState = "thread";
    if (selectorHit("settings-panel") || selectorHit("appearance-radio") ||
      stableTestidHit("theme-preview")) baseState = "settings";
    else if (selectorHit("home-icon") || selectorHit("home-route")) baseState = "home";
    else if (!selectorHit("shell-main") && !queryAll('main, [role="main"]').length) baseState = "settings";
    const missingL1 = SELECTOR_CONTRACT.selectors
      .filter((entry) => entry.tier === "L1" && entry.required &&
        scopeMatches(entry.scope, baseState, overlay) && !selectorHit(entry.key))
      .map((entry) => entry.key);
    return {
      state: overlay ? "overlay" : baseState,
      baseState,
      overlay,
      // Settings replaces (or partially replaces) the app shell on macOS and
      // can retain a shell on Windows.  It is therefore always an L0 scope;
      // never treat the absence of the home/thread L1 anchors as a failure.
      level: baseState === "settings" || missingL1.length ? "L0" : "L1",
      missingL1,
    };
  };

  const refreshScope = () => {
    metrics.routePasses += 1;
    const scope = detectScope();
    const state = window[STATE_KEY];
    if (state?.installToken === installToken) state.scope = scope;
    return scope;
  };

  const ensure = ({ root: rootPass = true, scope: scopePass = false, parts: partPass = false } = {}) => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    metrics.ensureCalls += 1;
    if (rootPass) applyRootState(root);
    if (partPass) {
      refreshParts();
      refreshPredicates();
    }
    if (scopePass) refreshScope();
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    lastRootSignature = "";
    const root = document.documentElement;
    for (const name of ROOT_ATTRS) root?.removeAttribute(name);
    for (const attribute of [...(root?.attributes || [])]) {
      if (attribute.name.startsWith("data-dream-")) root.removeAttribute(attribute.name);
    }
    for (const name of THEME_VARIABLES) root?.style.removeProperty(name);
    for (const property of [...(root?.style || [])]) {
      if (property.startsWith("--dream-") || property.startsWith("--ds-")) {
        root.style.removeProperty(property);
      }
    }
    root?.style?.removeProperty("color-scheme");
    document.getElementById("ds-live-tune-css")?.remove();
    delete window.__dsHarmonyApplyLiveParams;
    delete window.__dsLgApplyLiveParams;
    removeParts();
    removePredicates();
    state?.rootObserver?.disconnect();
    state?.partObserver?.disconnect();
    if (bodyReadyHandler && typeof document.removeEventListener === "function") {
      document.removeEventListener("DOMContentLoaded", bodyReadyHandler);
    }
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (analysisTimer) clearTimeout(analysisTimer);
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.navigationHandler && state?.navigation) {
      try { state.navigation.removeEventListener("navigate", state.navigationHandler); } catch {}
    }
    if (styleSheet) {
      try {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets]
          .filter((candidate) => candidate !== styleSheet);
      } catch {}
      styleRegistry.delete(styleSheet);
    }
    styleNode?.remove();
    if (document.getElementById(STYLE_ID) === styleNode) document.getElementById(STYLE_ID)?.remove();
    if (styleRegistry.size === 0) delete window[STYLE_REGISTRY_KEY];
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    if (typeof harmonyCleanup === "function") {
      try { harmonyCleanup(); } catch {}
      harmonyCleanup = null;
    }
    delete window.__harmonyLiquidEngineInstalled;
    delete window[STATE_KEY];
    return true;

  };

  const scheduler = { timeout: null, root: false, scope: false, parts: false };
  const flushScheduledEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = null;
    const pending = { root: scheduler.root, scope: scheduler.scope, parts: scheduler.parts };
    scheduler.root = false;
    scheduler.scope = false;
    scheduler.parts = false;
    ensure(pending);
  };
  const scheduleEnsure = ({ root = false, scope = false, parts = false } = {}, delay = 64) => {
    scheduler.root ||= root;
    scheduler.scope ||= scope;
    scheduler.parts ||= parts;
    if (scheduler.timeout) return;
    scheduler.timeout = setTimeout(flushScheduledEnsure, delay);
  };
  if (typeof MutationObserver === "function") {
    rootObserver = new MutationObserver(() => scheduleEnsure({ root: true }));
    // SPA route changes are observable as DOM mutations even when Chromium's
    // Navigation API emits no event. Keep verification scope and public parts
    // derived from the same post-mutation tree.
    const predicateClass = /main-surface|_MainContentSurface_|home-banners|_homeUtilityBar_|_ComposerHomeUtilityBar_|horizontal-scroll-fade-mask|group\/project-selector/;
    const PART_STRUCTURAL_ATTRS = new Set([
      "data-testid",
      "data-codex-surface",
      "data-composer-placement",
      "data-composer-rail-placement",
      "data-thread-find-target",
      "aria-current",
      "aria-pressed",
      "aria-selected",
      "aria-expanded",
      "data-state",
      "role",
    ]);
    partObserver = new MutationObserver((records) => {
      const changed = records.some((record) => {
        const target = record.target;
        const el = target?.nodeType === 1 ? target : target?.parentElement;
        if (!el) return false;
        if (
          el.id === "codex-dream-skin-plugin-host" ||
          el.id === "ds-lg-svg-defs" ||
          el.id === "ds-lg-fx-canvas" ||
          el.closest?.("#codex-dream-skin-plugin-host, #ds-lg-svg-defs, #ds-lg-fx-canvas, .ProseMirror, [contenteditable='true']")
        ) {
          return false;
        }
        if (record.type === "childList") {
          if (el.closest(".thread-scroll-container")) {
            const relevant = '[data-local-conversation-user-anchor], [data-user-message-bubble], [data-local-conversation-final-assistant], [data-codex-composer-root], [role="dialog"], [role="menu"]';
            return [...record.addedNodes, ...record.removedNodes].some((node) =>
              node.nodeType === 1 && (node.matches(relevant) || node.querySelector(relevant)));
          }
          for (const n of record.addedNodes) {
            if (n.nodeType === 1 && n.id !== "codex-dream-skin-plugin-host" && n.id !== "ds-lg-svg-defs" && n.id !== "ds-lg-fx-canvas") {
              return true;
            }
          }
          for (const n of record.removedNodes) {
            if (n.nodeType === 1 && n.id !== "codex-dream-skin-plugin-host" && n.id !== "ds-lg-svg-defs" && n.id !== "ds-lg-fx-canvas") {
              return true;
            }
          }
          return false;
        }
        if (record.type !== "attributes") return false;
        const attrName = record.attributeName;
        if (!attrName || attrName === "style" || attrName.startsWith("data-dream-") || attrName.startsWith("data-ds-")) {
          return false;
        }
        const current = el.getAttribute(attrName);
        if (record.oldValue === current) return false;
        if (attrName === "class") {
          const structuralClasses = (value) => String(value || "").split(/\s+/)
            .filter((token) => predicateClass.test(token)).sort().join(" ");
          return structuralClasses(record.oldValue) !== structuralClasses(current);
        }
        return PART_STRUCTURAL_ATTRS.has(attrName) ||
          attrName.startsWith("data-local-") ||
          attrName.startsWith("data-composer-") ||
          attrName.startsWith("data-oai-") ||
          attrName.startsWith("data-app-shell-");
      });
      if (changed) scheduleEnsure({ scope: true, parts: true }, 160);
    });
  }

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure({ root: true });
  } catch {}

  const navigationApi = window.navigation && typeof window.navigation.addEventListener === "function"
    ? window.navigation : null;
  const navigationHandler = navigationApi ? () => {
    metrics.navigationEvents += 1;
    scheduleEnsure({ scope: true, parts: true }, 180);
  } : null;

  window[STATE_KEY] = {
    ensure,
    cleanup,
    rootObserver,
    partObserver,
    timer: null,
    scheduler,
    mediaQuery,
    mediaHandler,
    navigation: navigationApi,
    navigationHandler,
    artUrl,
    installToken,
    styleMode,
    styleNode,
    styleSheet,
    styleRevision: STYLE_REVISION,
    analysis: artAnalysis,
    artMetadata: ART_METADATA,
    scope: null,
    selectorsSchema: SELECTOR_CONTRACT.schema,
    metrics,
    version: VERSION,
    themeId: THEME.id || "custom",
    revision: PAYLOAD_REVISION,
    detectShellAppearance,
  };
  const firstEnsureStartedAt = now();
  ensure({ root: true, parts: true });
  const initialScope = refreshScope();
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));

  const observeAttributes = (node) => {
    if (!rootObserver || !node) return;
    rootObserver.observe(node, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
    });
  };
  const observePartTree = (node) => {
    if (!partObserver || !node) return;
    partObserver.observe(node, {
      childList: true, subtree: true,
      attributes: true, attributeOldValue: true,
      attributeFilter: [
        "class", "role", "data-testid", "data-app-shell-main-surface",
        "data-app-shell-active-page", "data-codex-composer-root", "type",
        "data-mention-list-scroll-area",
      ],
    });
  };
  observeAttributes(document.documentElement);
  const observeBody = () => {
    observeAttributes(document.body);
    observePartTree(document.body);
  };
  if (document.body) observeBody();
  else if (typeof document.addEventListener === "function") {
    bodyReadyHandler = () => {
      if (!window[DISABLED_KEY]) {
        observeBody();
        scheduleEnsure({ scope: true, parts: true }, 0);
      }
    };
    document.addEventListener("DOMContentLoaded", bodyReadyHandler, { once: true });
  }
  const timer = setInterval(() => {
    metrics.safetyPasses += 1;
    ensure({ root: true });
  }, 30000);
  window[STATE_KEY].timer = timer;
  if (mediaHandler && mediaQuery && typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", mediaHandler);
  }
  if (navigationHandler && navigationApi) {
    navigationApi.addEventListener("navigate", navigationHandler);
  }
  const analysisPromise = artAnalysis ? Promise.resolve(null) : analyzeArt();
  window[STATE_KEY].analysisTimer = analysisTimer;
  analysisPromise.then((analysis) => {
    const state = window[STATE_KEY];
    if (!analysis || state?.installToken !== installToken || window[DISABLED_KEY]) return;
    artAnalysis = analysis;
    state.analysis = analysis;
    if (typeof THEME.artKey === "string") {
      analysisCache.set(THEME.artKey, analysis);
      while (analysisCache.size > 8) analysisCache.delete(analysisCache.keys().next().value);
    }
    ensure({ root: true });
  }).catch(() => {});
  
  // === Unified JBY-Liquid-Glass v2 Engine (Live SVG Snell Lens + WebGL2 + HarmonyOS 7 Fluid Motion) ===
  const isHarmonyLiquidTheme = () => false;
  const teardownHarmonyDomArtifacts = () => {
    document.getElementById("harmony-liquid-sparks-canvas")?.remove();
    document.getElementById("apple-liquid-glass-svg")?.remove();
    document.documentElement?.style.removeProperty("--dynamic-sidebar-width");
    delete window.__harmonyLiquidEngineInstalled;
  };

  const isLiquidGlassEdition = () => {
    const id = String(THEME.id || "custom");
    return id === "harmony-liquid-glass-lunar" || id.endsWith("-liquid-glass") || THEME.liquidGlass === true;
  };

  const LG_SVG_ID = "ds-lg-svg-defs";
  const LG_CANVAS_ID = "ds-lg-fx-canvas";
  const parseRgbTriplet = (raw, fallback = "100,114,178") => {
    const m = String(raw || "").match(/^\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/);
    if (m) return `${Math.round(Number(m[1]))},${Math.round(Number(m[2]))},${Math.round(Number(m[3]))}`;
    const hex = String(raw || "").trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`;
    }
    return fallback;
  };

  const teardownLiquidGlassEdition = () => {
    try { window.__dsLgEditionCleanup?.(); } catch {}
    delete window.__dsLgEditionCleanup;
    teardownHarmonyDomArtifacts();
    document.getElementById("ds-lg-dynamic-style")?.remove();
    document.getElementById(LG_SVG_ID)?.remove();
    document.getElementById(LG_CANVAS_ID)?.remove();
    const root = document.documentElement;
    if (root) {
      root.removeAttribute("data-dream-lg");
      root.removeAttribute("data-dream-lg-busy");
      root.removeAttribute("data-dream-lg-settled");
      root.removeAttribute("data-dream-lg-motion");
      for (const prop of [...root.style]) {
        if (prop.startsWith("--ds-lg-")) root.style.removeProperty(prop);
      }
    }
    for (const el of document.querySelectorAll("[data-dream-lg-filter], [data-dream-lg-gpu], [data-dream-lg-seg], [data-dream-lg-seen], [data-dream-lg-hover], [data-dream-lg-pair-active], [data-dream-lg-surface]")) {
      el.removeAttribute("data-dream-lg-filter");
      el.removeAttribute("data-dream-lg-gpu");
      el.removeAttribute("data-dream-lg-seg");
      el.removeAttribute("data-dream-lg-seen");
      el.removeAttribute("data-dream-lg-hover");
      el.removeAttribute("data-dream-lg-pair-active");
      el.removeAttribute("data-dream-lg-surface");
      el.style.removeProperty("--ds-lg-lens-filter");
      el.style.removeProperty("--ds-lg-lens-slash");
      el.style.removeProperty("--ds-lg-lens-writing");
      el.style.removeProperty("--ds-lg-gpu-bg");
      el.style.removeProperty("--ds-lg-seg-x");
      el.style.removeProperty("--ds-lg-seg-w");
      el.style.removeProperty("--ds-lg-seg-sx");
      if (el.dataset.dsLgTouchTransform === "1") {
        el.style.removeProperty("transform");
        el.style.removeProperty("transition");
        delete el.dataset.dsLgTouchTransform;
      }
    }
    delete window.__dsLgEditionInstalled;
  };

  const DEFAULT_LIVE_PARAMS = {
    transparency: 80,
    refractScale: 100,
    blurScale: 100,
    rimIntensity: 100,
    motionMode: "spring",
    particlesEnabled: true,
    fontWeightBoost: 0,
    zones: {},
  };
  const resolveZoneEffective = (p, zone) => {
    const ov = p.zones?.[zone];
    // Keep labels readable when older themes set global blur to zero.
    const defaultBlur = zone === "slash" || zone === "attach" ? Math.max(40, p.blurScale) : p.blurScale;
    return {
      transparency: ov?.transparency ?? p.transparency,
      refractScale: ov?.refractScale ?? p.refractScale,
      blurScale: ov?.blurScale ?? defaultBlur,
      rimIntensity: ov?.rimIntensity ?? p.rimIntensity,
    };
  };

  const initLiquidGlassEdition = () => {
    if (!isLiquidGlassEdition() || window[DISABLED_KEY]) {
      teardownLiquidGlassEdition();
      return;
    }
    const editionInstanceKey = `${THEME.id || ""}:${PAYLOAD_REVISION}`;
    if (window.__dsLgEditionInstalled === editionInstanceKey) return;
    teardownLiquidGlassEdition();
    window.__dsLgEditionInstalled = editionInstanceKey;

    const root = document.documentElement;
    const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const resolveMotionFlags = () => {
      const mode = window.__dsCurrentLiveParams?.motionMode || "spring";
      const sysReduced = Boolean(reducedMotionQuery?.matches);
      return {
        mode,
        reduced: sysReduced || mode === "off",
        lite: !sysReduced && mode === "lite",
      };
    };
    let { reduced: reducedMotion, lite: liteMotion } = resolveMotionFlags();

    root.setAttribute("data-dream-lg", "on");
    root.setAttribute("data-dream-lg-motion", reducedMotion ? "reduced" : (liteMotion ? "lite" : "full"));

    const THEME_TAGLINES = {
      "alpha-lock-liquid-glass": "GLACIER OPTICS · 极地冰晶折射 · 全曲率超椭圆流体视窗",
      "asuka-liquid-glass": "AMBER REFRACTION · 炽光琉璃 · 高响应物理弹簧与边界色散",
      "chatgpt-dragon-liquid-glass": "PRISM LILAC · 银翼幻彩 · 光学色散边界与沉浸无框对话流",
      "lock-liquid-glass": "SAPPHIRE DEWDROP · 曜蓝露凝 · 多阶通透毛玻璃与流光感知",
      "white-dragon-v-liquid-glass": "AMETHYST SILK · 柔光玉髓 · 五阶光学材质与物理微粒响应",
      "harmony-liquid-glass-lunar": "LUNAR CRYSTAL · 银绡冷月 · 高折射流体镜片与物理弹簧动效",
    };
    const fallbackTagline = THEME.brandSubtitle || THEME_TAGLINES[THEME.id] || "LIQUID GLASS EDITION";
    if (!root.style.getPropertyValue("--dream-skin-tagline")) {
      root.style.setProperty("--dream-skin-tagline", JSON.stringify(fallbackTagline));
    }

    // Solve ArkUI continuous damped harmonic oscillator -> CSS linear() curve
    const solveSpringLinear = (responseS, dampingRatio, steps = 34) => {
      const wn = (2 * Math.PI) / Math.max(0.08, responseS);
      const z = Math.max(0.2, Math.min(1.8, dampingRatio));
      const sample = (t) => {
        if (z < 1) {
          const wd = wn * Math.sqrt(1 - z * z);
          const env = Math.exp(-z * wn * t);
          return 1 - env * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
        }
        return 1 - Math.exp(-wn * t) * (1 + wn * t);
      };
      let duration = responseS * 2.2;
      for (let t = 0.05; t <= 1.5; t += 0.01) {
        if (Math.abs(1 - sample(t)) < 0.0018 && Math.abs(1 - sample(t + 0.02)) < 0.0018) {
          duration = t;
          break;
        }
      }
      const pts = [];
      for (let i = 0; i <= steps; i++) pts.push(sample((i / steps) * duration).toFixed(4));
      pts[0] = "0";
      pts[steps] = "1";
      return `${Math.round(duration * 1000)}ms linear(${pts.join(", ")})`;
    };

    root.style.setProperty("--ds-lg-spring-responsive", solveSpringLinear(0.14, 0.84, 30));
    root.style.setProperty("--ds-lg-spring-settle", solveSpringLinear(0.32, 0.78, 34));
    root.style.setProperty("--ds-lg-spring-press", solveSpringLinear(0.17, 0.74, 28));

    const csRoot = getComputedStyle(root);
    const accentRgb = parseRgbTriplet(THEME.colors?.accent || csRoot.getPropertyValue("--ds-accent-rgb"), "100,114,178");
    const accentAltRgb = parseRgbTriplet(THEME.colors?.accentAlt || THEME.colors?.highlight || csRoot.getPropertyValue("--ds-secondary-rgb"), accentRgb);
    const THEME_OPTICS = {
      "alpha-lock-liquid-glass": { prismA: "212 232 255", prismB: "136 174 242" },
      "asuka-liquid-glass": { prismA: "255 218 192", prismB: "238 118 76" },
      "chatgpt-dragon-liquid-glass": { prismA: "240 218 255", prismB: "184 118 220" },
      "lock-liquid-glass": { prismA: "204 222 255", prismB: "99 124 214" },
      "white-dragon-v-liquid-glass": { prismA: "238 224 255", prismB: "162 128 220" },
      "harmony-liquid-glass-lunar": { prismA: "216 230 255", prismB: "132 168 238" },
    };
    const opticsSig = THEME_OPTICS[THEME.id] || {
      prismA: accentRgb.replace(/,/g, " "),
      prismB: accentAltRgb.replace(/,/g, " "),
    };
    root.style.setProperty("--ds-lg-accent-rgb", accentRgb.replace(/,/g, " "));
    root.style.setProperty("--ds-lg-accent-alt-rgb", accentAltRgb.replace(/,/g, " "));
    root.style.setProperty("--ds-lg-prism-a", opticsSig.prismA);
    root.style.setProperty("--ds-lg-prism-b", opticsSig.prismB);

    let disposed = false;
    let radiusCache = new WeakMap();
    const getRadiusPx = (el, fallback = 20) => {
      if (!el) return fallback;
      const cached = radiusCache.get(el);
      if (typeof cached === "number") return cached;
      let r = fallback;
      try {
        const raw = parseFloat(getComputedStyle(el).borderTopLeftRadius);
        if (Number.isFinite(raw)) r = raw;
      } catch {}
      radiusCache.set(el, r);
      return r;
    };

    // === Tier 1: Live Single-Pass SVG Snell Displacement Lens (Composer & Attached Rail) ===
    const SVG_NS = "http://www.w3.org/2000/svg";
    const XLINK_NS = "http://www.w3.org/1999/xlink";
    const svgRoot = document.createElementNS(SVG_NS, "svg");
    svgRoot.id = LG_SVG_ID;
    svgRoot.setAttribute("aria-hidden", "true");
    svgRoot.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;overflow:hidden;";
    const svgDefs = document.createElementNS(SVG_NS, "defs");
    svgRoot.appendChild(svgDefs);
    (document.body || root).appendChild(svgRoot);

    const COMPOSER_SEL = '.composer-surface-chrome, [class*="ComposerLayoutRoot"], [data-composer-surface-variant][data-composer-radius-variant], [data-ds-part="composer"]';
    const RAIL_SEL = '[data-composer-rail][class*="attached-"], [class*="rail-"][class*="attached-"], [class*="homeUtilityBar"], [class*="ComposerHomeUtilityBar"]';
    const MENU_OVERLAY_SEL = '[data-composer-overlay-floating-ui="true"]';
    const MENU_PANEL_SEL = `:is(${MENU_OVERLAY_SEL}, ${MENU_OVERLAY_SEL} *):has(> [data-mention-list-scroll-area])`;
    const SLASH_SEL = '[data-dream-lg-menu="slash"]';
    const ATTACH_SEL = '[data-dream-lg-menu="attach"]';
    const ADD_CONTEXT_SEL = '[data-composer-navigation-target="add-context"]:is([aria-expanded="true"], [data-state="open"])';
    const MENU_EDITOR_SEL = '[contenteditable="true"]:is([data-codex-composer], [data-composer-markdown])';
    const WRITING_SEL = '[data-oai-writing-block-surface], [data-testid="chatgpt-writing-block"]';
    const BUBBLE_SEL = '.thread-scroll-container :is([data-user-message-bubble="true"], [class~="bg-user-message"], [data-local-conversation-user-anchor] [class*="max-w-"][class*="rounded-2xl"])';
    const GOAL_BUTTON_SEL = 'button:is([aria-label="Clear goal" i], [aria-label="清除目标"])';
    const ACTIVE_PAGE_OFF = '[data-app-shell-active-page="false"], [inert]';
    const OPTICS_STRUCTURAL_SEL = `[data-codex-composer-root], [data-composer-rail-item], ${COMPOSER_SEL}, ${RAIL_SEL}, ${MENU_OVERLAY_SEL}, [data-mention-list-scroll-area], [data-mention-section-id], ${WRITING_SEL}, [data-user-message-bubble], [data-local-conversation-user-anchor], [role="dialog"], [role="menu"], [role="tablist"], [role="radiogroup"], aside.app-shell-left-panel, .group\\/turn-diff-header`;
    const BANNER_SEL = 'aside[class*="banner-"], [class*="ComposerBannerPortal"] aside';
    const LENS_SLOTS = [
      { name: "composer", zone: "composer", filterId: "ds-lg-lens-composer", cssVar: "--ds-lg-lens-filter", selector: COMPOSER_SEL, multi: true, baseScale: 36, defaultR: 28, bezelFn: (w, h) => Math.max(15, Math.min(26, Math.min(w, h) * 0.32)) },
      { name: "rail", zone: "composer", filterId: "ds-lg-lens-rail", cssVar: "--ds-lg-lens-filter", selector: `[data-dream-lg-surface="work-composer"] [data-composer-utility-rail], ${RAIL_SEL}`, excludeClosest: `:is(${COMPOSER_SEL}):not([data-dream-lg-surface="work-composer"])`, multi: true, baseScale: 20, defaultR: 18, bezelFn: (w, h) => Math.max(8, Math.min(16, Math.min(w, h) * 0.30)) },
      { name: "slash", zone: "slash", filterId: "ds-lg-lens-slash", cssVar: "--ds-lg-lens-slash", selector: SLASH_SEL, multi: true, baseScale: 28, defaultR: 22, bezelFn: (w, h) => Math.max(12, Math.min(22, Math.min(w, h) * 0.26)) },
      { name: "attach", zone: "attach", filterId: "ds-lg-lens-attach", cssVar: "--ds-lg-lens-attach", selector: ATTACH_SEL, multi: true, baseScale: 28, defaultR: 22, bezelFn: (w, h) => Math.max(12, Math.min(22, Math.min(w, h) * 0.26)) },
      { name: "writing", zone: "writing", filterId: "ds-lg-lens-writing", cssVar: "--ds-lg-lens-writing", selector: WRITING_SEL, multi: true, baseScale: 32, defaultR: 24, bezelFn: (w, h) => Math.max(14, Math.min(24, Math.min(w, h) * 0.24)) },
    ];
    const SHARED_FILTERS = [
      { name: "composerShared", zone: "composer", filterId: "ds-lg-lens-composer-shared", cssVar: "--ds-lg-lens-filter", w: 320, h: 96, r: 28, bez: 22, baseScale: 36 },
      { name: "writingShared", zone: "writing", filterId: "ds-lg-lens-writing-shared", cssVar: "--ds-lg-lens-writing", w: 220, h: 100, r: 20, bez: 18, baseScale: 32 },
      { name: "card", zone: "cards", filterId: "ds-lg-lens-card", cssVar: "--ds-lg-lens-card", w: 160, h: 160, r: 20, bez: 18, baseScale: 22 },
      { name: "popover", zone: "popover", filterId: "ds-lg-lens-popover", cssVar: "--ds-lg-lens-popover", w: 160, h: 160, r: 22, bez: 18, baseScale: 26 },
    ];

    const slotNodes = new Map();
    const sharedFilterNodes = new Map();
    const createDisplacementFilter = (filterId, baseScale) => {
      const f = document.createElementNS(SVG_NS, "filter");
      f.id = filterId;
      f.setAttribute("x", "0%");
      f.setAttribute("y", "0%");
      f.setAttribute("width", "100%");
      f.setAttribute("height", "100%");
      f.setAttribute("filterUnits", "objectBoundingBox");
      f.setAttribute("color-interpolation-filters", "sRGB");
      const feImg = document.createElementNS(SVG_NS, "feImage");
      feImg.setAttribute("result", "snellMap");
      feImg.setAttribute("x", "0");
      feImg.setAttribute("y", "0");
      feImg.setAttribute("width", "100%");
      feImg.setAttribute("height", "100%");
      feImg.setAttribute("preserveAspectRatio", "none");
      const feDisp = document.createElementNS(SVG_NS, "feDisplacementMap");
      feDisp.setAttribute("in", "SourceGraphic");
      feDisp.setAttribute("in2", "snellMap");
      feDisp.setAttribute("scale", String(baseScale));
      feDisp.setAttribute("xChannelSelector", "R");
      feDisp.setAttribute("yChannelSelector", "G");
      f.append(feImg, feDisp);
      svgDefs.appendChild(f);
      return { filter: f, feImg, feDisp };
    };
    for (const slot of LENS_SLOTS) {
      const { filter, feImg, feDisp } = createDisplacementFilter(slot.filterId, slot.baseScale);
      slotNodes.set(slot.name, { slot, filter, feImg, feDisp, lastKey: "", lastScale: "", activeEls: new Set(), targets: [] });
    }

    const snellMapCache = new Map();
    const snellCanvas = document.createElement("canvas");
    const snellCtx = snellCanvas.getContext("2d", { willReadFrequently: false });

    const buildSnellMapDataUrl = (qw, qh, qr, qb) => {
      const tall1D = qh > 1100;
      const key = tall1D ? `1d:${qw}:b${qb}` : `${qw}x${qh}:r${qr}:b${qb}`;
      const hit = snellMapCache.get(key);
      if (hit) return hit;
      if (!snellCtx) return "";
      const maxDim = 224;
      if (tall1D) {
        const cw = Math.min(maxDim, Math.max(48, qw));
        const ch = 1;
        snellCanvas.width = cw;
        snellCanvas.height = ch;
        const imgData = snellCtx.createImageData(cw, ch);
        const data = imgData.data;
        const hw = cw * 0.5;
        const sc = cw / Math.max(1, qw);
        const bez = Math.max(3, Math.min(qb * sc, hw));
        for (let x = 0; x < cw; x++) {
          const d = Math.min(x + 0.5, cw - (x + 0.5));
          const idx = x * 4;
          if (d >= bez) {
            data[idx] = 128; data[idx + 1] = 128; data[idx + 2] = 128; data[idx + 3] = 255;
            continue;
          }
          const nx = (x + 0.5 < hw) ? -1 : 1;
          const t = d / bez;
          const edgeFade = Math.min(1, t / 0.14);
          const dome = Math.pow(1 - t, 1.45);
          const mag = dome * (0.38 + 0.62 * edgeFade) * 0.90;
          data[idx] = Math.max(0, Math.min(255, Math.round(127.5 - nx * mag * 127.5)));
          data[idx + 1] = 128;
          data[idx + 2] = 128;
          data[idx + 3] = 255;
        }
        snellCtx.putImageData(imgData, 0, 0);
        const url = snellCanvas.toDataURL("image/png");
        snellMapCache.set(key, url);
        while (snellMapCache.size > 18) snellMapCache.delete(snellMapCache.keys().next().value);
        return url;
      }
      const aspect = qw / Math.max(1, qh);
      let cw;
      let ch;
      if (aspect >= 1) {
        cw = Math.min(maxDim, Math.max(40, qw));
        ch = Math.max(24, Math.round(cw / aspect));
      } else {
        ch = Math.min(maxDim, Math.max(40, qh));
        cw = Math.max(24, Math.round(ch * aspect));
      }
      snellCanvas.width = cw;
      snellCanvas.height = ch;
      const imgData = snellCtx.createImageData(cw, ch);
      const data = imgData.data;
      const hw = cw * 0.5;
      const hh = ch * 0.5;
      const sc = cw / Math.max(1, qw);
      const cr = Math.max(2, Math.min(qr * sc, hw - 1, hh - 1));
      const bez = Math.max(3, Math.min(qb * sc, hw, hh));

      for (let y = 0; y < ch; y++) {
        const py = y + 0.5 - hh;
        const ay = Math.abs(py);
        for (let x = 0; x < cw; x++) {
          const px = x + 0.5 - hw;
          const ax = Math.abs(px);
          const qx = ax - (hw - cr);
          const qy = ay - (hh - cr);
          const ox = qx > 0 ? qx : 0;
          const oy = qy > 0 ? qy : 0;
          const outD = Math.hypot(ox, oy);
          const inD = Math.min(Math.max(qx, qy), 0);
          const sdf = outD + inD - cr;
          const idx = (y * cw + x) * 4;
          if (sdf > 0 || -sdf >= bez) {
            data[idx] = 128;
            data[idx + 1] = 128;
            data[idx + 2] = 128;
            data[idx + 3] = 255;
            continue;
          }
          const d = -sdf;
          let nx = 0;
          let ny = 0;
          if (ox > 0 || oy > 0) {
            const inv = 1 / Math.max(1e-5, outD);
            nx = (px >= 0 ? 1 : -1) * ox * inv;
            ny = (py >= 0 ? 1 : -1) * oy * inv;
          } else if (qx > qy) {
            nx = px >= 0 ? 1 : -1;
          } else {
            ny = py >= 0 ? 1 : -1;
          }
          const t = d / bez;
          const edgeFade = Math.min(1, t / 0.14);
          const dome = Math.pow(1 - t, 1.45);
          const mag = dome * (0.38 + 0.62 * edgeFade) * 0.90;
          data[idx] = Math.max(0, Math.min(255, Math.round(127.5 - nx * mag * 127.5)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(127.5 - ny * mag * 127.5)));
          data[idx + 2] = 128;
          data[idx + 3] = 255;
        }
      }
      snellCtx.putImageData(imgData, 0, 0);
      const url = snellCanvas.toDataURL("image/png");
      snellMapCache.set(key, url);
      while (snellMapCache.size > 18) snellMapCache.delete(snellMapCache.keys().next().value);
      return url;
    };

    for (const sf of SHARED_FILTERS) {
      const { filter, feImg, feDisp } = createDisplacementFilter(sf.filterId, sf.baseScale);
      const url = buildSnellMapDataUrl(sf.w, sf.h, sf.r, sf.bez);
      if (url) {
        feImg.setAttribute("href", url);
        feImg.setAttributeNS(XLINK_NS, "href", url);
      }
      sharedFilterNodes.set(sf.name, { sf, filter, feImg, feDisp, lastScale: "", lastVar: "" });
    }

    const pickOutermostVisibleList = (slot) => {
      const out = [];
      let preview = null;
      for (const rawEl of document.querySelectorAll(slot.selector)) {
        if (rawEl.closest("#codex-dream-skin-plugin-host")) {
          if (rawEl.hasAttribute("data-dream-lg-menu-preview")) preview = rawEl;
          continue;
        }
        if (rawEl.closest('[data-app-shell-active-page="false"]')) continue;
        if (slot.excludeClosest && rawEl.closest(slot.excludeClosest)) continue;
        if (slot.name === "rail" && rawEl.closest('[data-dream-lg-surface="work-composer"]') && !rawEl.matches('[data-composer-utility-rail]')) continue;
        if (rawEl.parentElement?.closest(slot.selector) && !(slot.name === "rail" && rawEl.matches('[data-composer-utility-rail]') && rawEl.closest('[data-dream-lg-surface="work-composer"]'))) continue;
        const el = (slot.name === "composer" && rawEl.getAttribute("data-dream-lg-surface") === "work-composer")
          ? (rawEl.querySelector('[data-composer-body], [class*="ComposerLayoutBody"]') || rawEl)
          : rawEl;
        const r = el.getBoundingClientRect();
        if (r.width >= 24 && r.height >= 18) {
          out.push({ el, r });
          if (!slot.multi) break;
        }
      }
      if (!out.length && preview) {
        const r = preview.getBoundingClientRect();
        if (r.width >= 24 && r.height >= 18) out.push({ el: preview, r });
      }
      return out;
    };

    const resolveLgZone = (zone) => {
      return resolveZoneEffective(window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS, zone);
    };

    let slashOwner = null;
    const isVisibleMenuNode = (node) => node?.isConnected &&
      !node.closest(ACTIVE_PAGE_OFF) && node.getClientRects().length > 0;
    const isSlashQuery = (editor) => /(?:^|\s)\/[^\s]*$/.test(editor?.textContent || "");
    const syncComposerMenuMarkers = () => {
      const hasAttach = Array.from(document.querySelectorAll(ADD_CONTEXT_SEL)).some(isVisibleMenuNode);
      const activeEditor = document.activeElement?.closest?.(MENU_EDITOR_SEL);
      if (isSlashQuery(activeEditor)) slashOwner = activeEditor;
      if (!isVisibleMenuNode(slashOwner) || !isSlashQuery(slashOwner)) slashOwner = null;
      const panels = [...document.querySelectorAll(MENU_PANEL_SEL)].filter(isVisibleMenuNode);
      for (const panel of panels) {
        const attachSection = panel.querySelector('[data-mention-section-id="context-actions"], [data-mention-section-id="chatgpt-primary"]');
        const commandSection = panel.querySelector('[data-mention-list-scroll-area][role="listbox"] [data-mention-section-id="commands"]');
        const zone = hasAttach && (attachSection || panels.length === 1) ? "attach" :
          !hasAttach && (commandSection || slashOwner) ? "slash" : null;
        const current = panel.getAttribute("data-dream-lg-menu");
        if (zone && current !== zone) panel.setAttribute("data-dream-lg-menu", zone);
        else if (!zone && current) panel.removeAttribute("data-dream-lg-menu");
      }
      for (const panel of document.querySelectorAll('[data-dream-lg-menu]:not([data-dream-lg-menu-preview])')) {
        if (!panels.includes(panel)) panel.removeAttribute("data-dream-lg-menu");
      }
    };
    const syncSurfaceMarkers = () => {
      for (const rootEl of document.querySelectorAll('[class*="ComposerLayoutRoot"][data-composer-utility-bar-variant="home"], [data-dream-lg-surface="work-composer"]')) {
        const isWork = isWorkComposerNode(rootEl);
        const hasWork = rootEl.getAttribute("data-dream-lg-surface") === "work-composer";
        if (isWork && !hasWork) {
          rootEl.setAttribute("data-dream-lg-surface", "work-composer");
          restoreComposerBorders(rootEl);
        } else if (!isWork && hasWork) {
          rootEl.removeAttribute("data-dream-lg-surface");
        }
      }
      for (const rail of document.querySelectorAll('[data-composer-rail], [class*="rail-"][class*="attached-"]')) {
        if (rail.closest(COMPOSER_SEL)) continue;
        const host = rail.parentElement;
        if (host && host.querySelector('[class*="ComposerLayoutRoot"]')) {
          if (host.getAttribute("data-dream-lg-surface") !== "rail-host") {
            host.setAttribute("data-dream-lg-surface", "rail-host");
          }
        }
      }
      for (const cRoot of document.querySelectorAll('[data-codex-composer-root]')) {
        const tray = cRoot.parentElement;
        if (!tray) continue;
        if (tray.parentElement?.querySelector(".thread-scroll-container") || tray.closest("main")?.querySelector(".thread-scroll-container")) {
          if (tray.getAttribute("data-dream-lg-surface") !== "thread-tray") {
            tray.setAttribute("data-dream-lg-surface", "thread-tray");
          }
        }
      }
      for (const rail of document.querySelectorAll('[data-composer-rail]')) {
        const goalItem = rail.querySelector(`[data-composer-rail-item="present"]:has(${GOAL_BUTTON_SEL})`);
        rail.toggleAttribute("data-dream-lg-goal-rail", Boolean(goalItem));
        for (const item of rail.querySelectorAll("[data-dream-lg-goal-item]")) {
          if (item !== goalItem) item.removeAttribute("data-dream-lg-goal-item");
        }
        goalItem?.setAttribute("data-dream-lg-goal-item", "");
      }
      for (const h of document.querySelectorAll('.group\\/turn-diff-header')) {
        const card = h.parentElement;
        if (card && card.getAttribute("data-dream-lg-surface") !== "turn-diff") {
          card.setAttribute("data-dream-lg-surface", "turn-diff");
        }
      }
    };

    const syncSvgLenses = (measure = true) => {
      if (disposed) return;

      for (const sf of SHARED_FILTERS) {
        const entry = sharedFilterNodes.get(sf.name);
        const zp = resolveLgZone(sf.zone);
        const mult = Math.max(0, zp.refractScale / 100);
        const enabled = mult > 0.02;
        if (enabled) {
          const scaleStr = (sf.baseScale * mult).toFixed(2);
          if (entry.lastScale !== scaleStr) {
            entry.feDisp.setAttribute("scale", scaleStr);
            entry.lastScale = scaleStr;
          }
        }
        const varVal = enabled ? `url("#${sf.filterId}")` : "blur(0px)";
        if (entry.lastVar !== varVal) {
          root.style.setProperty(sf.cssVar, varVal);
          entry.lastVar = varVal;
        }
      }

      for (const slot of LENS_SLOTS) {
        const entry = slotNodes.get(slot.name);
        const zp = resolveLgZone(slot.zone);
        const mult = Math.max(0, zp.refractScale / 100);
        const enabled = mult > 0.02;
        const targets = measure ? (entry.targets = pickOutermostVisibleList(slot)) : entry.targets;
        const nextSet = new Set(targets.map((t) => t.el));
        for (const prevEl of entry.activeEls) {
          if (!nextSet.has(prevEl)) {
            prevEl.removeAttribute("data-dream-lg-filter");
            prevEl.style.removeProperty(slot.cssVar);
          }
        }
        entry.activeEls = nextSet;
        if (targets.length === 0) continue;

        if (!enabled) {
          for (const { el } of targets) {
            el.setAttribute("data-dream-lg-filter", "off");
            el.style.setProperty(slot.cssVar, "blur(0px)");
          }
          continue;
        }

        const primary = targets[0];
        const qw = Math.max(32, Math.round(primary.r.width / 8) * 8);
        const qh = Math.max(24, Math.round(primary.r.height / 8) * 8);
        const qr = Math.max(4, Math.round(getRadiusPx(primary.el, slot.defaultR)));
        const qb = Math.round(slot.bezelFn(qw, qh));
        const gKey = qh > 1100 ? `1d:${qw}:b${qb}` : `${qw}x${qh}:r${qr}:b${qb}`;
        if (entry.lastKey !== gKey) {
          const url = buildSnellMapDataUrl(qw, qh, qr, qb);
          if (url) {
            entry.feImg.setAttribute("href", url);
            entry.feImg.setAttributeNS(XLINK_NS, "href", url);
            entry.lastKey = gKey;
          }
        }
        const scaleStr = (slot.baseScale * mult).toFixed(2);
        if (entry.lastScale !== scaleStr) {
          entry.feDisp.setAttribute("scale", scaleStr);
          entry.lastScale = scaleStr;
        }
        const filterVal = `url(#${slot.filterId})`;
        for (const { el } of targets) {
          if (el.getAttribute("data-dream-lg-filter") !== "lens") el.setAttribute("data-dream-lg-filter", "lens");
          if (el.style.getPropertyValue(slot.cssVar) !== filterVal) el.style.setProperty(slot.cssVar, filterVal);
        }
      }
    };

    const visibleBubbles = new Set();
    const watchedBubbles = new Set();
    const bubbleLenses = new Map();
    let bubbleLensSequence = 0;
    let bubbleRaf = 0;
    let lensRimState = "";
    const releaseBubbleLens = (el) => {
      el.style.removeProperty("--ds-lg-lens-bubble");
      el.removeAttribute("data-dream-lg-bubble-lens");
    };
    const syncBubbleLenses = () => {
      bubbleRaf = 0;
      const mult = Math.max(0, resolveLgZone("writing").refractScale / 100);
      const activeKeys = new Set();
      const pending = [];
      for (const el of visibleBubbles) {
        if (!el.isConnected || el.closest(ACTIVE_PAGE_OFF) || mult <= .02) {
          releaseBubbleLens(el);
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 18) continue;
        const w = Math.max(32, Math.round(rect.width / 8) * 8);
        const h = Math.max(24, Math.round(rect.height / 8) * 8);
        const radius = Math.round(getRadiusPx(el, 20));
        const bezel = Math.max(7, Math.min(17, Math.round(Math.min(w, h) * .22)));
        const key = `${w}/${h > 1100 ? "tall" : h}/${radius}/${bezel}`;
        activeKeys.add(key);
        pending.push({ el, w, h, radius, bezel, key });
      }
      for (const { el, w, h, radius, bezel, key } of pending) {
        let lens = bubbleLenses.get(key);
        if (!lens) {
          const map = buildSnellMapDataUrl(w, h, radius, bezel);
          if (!map) continue;
          const id = `ds-lg-bubble-${++bubbleLensSequence}`;
          lens = { id, ...createDisplacementFilter(id, 34 * mult) };
          lens.feImg.setAttribute("href", map);
          bubbleLenses.set(key, lens);
        }
        const scale = (34 * mult).toFixed(2);
        if (lens.feDisp.getAttribute("scale") !== scale) lens.feDisp.setAttribute("scale", scale);
        const value = `url("#${lens.id}")`;
        if (el.style.getPropertyValue("--ds-lg-lens-bubble") !== value) {
          el.style.setProperty("--ds-lg-lens-bubble", value);
          el.setAttribute("data-dream-lg-bubble-lens", "");
        }
      }
      for (const [key, lens] of bubbleLenses) {
        if (activeKeys.has(key)) continue;
        lens.filter.remove();
        bubbleLenses.delete(key);
      }
      lensRimState = String(mult);
    };
    const queueBubbleLenses = () => {
      if (!disposed && !bubbleRaf) bubbleRaf = requestAnimationFrame(syncBubbleLenses);
    };
    const bubbleIntersection = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) {
          visibleBubbles.add(target);
          resizeObs?.observe(target);
        } else {
          visibleBubbles.delete(target);
          resizeObs?.unobserve(target);
          releaseBubbleLens(target);
        }
      }
      queueBubbleLenses();
    }, { rootMargin: "256px" }) : null;
    const syncBubbleNodes = (scope = document) => {
      const nodes = scope.matches?.(BUBBLE_SEL) ? [scope] : scope.querySelectorAll?.(BUBBLE_SEL) || [];
      for (const node of nodes) {
        if (watchedBubbles.has(node) || node.parentElement?.closest(BUBBLE_SEL)) continue;
        watchedBubbles.add(node);
        if (bubbleIntersection) bubbleIntersection.observe(node);
        else visibleBubbles.add(node);
      }
      for (const node of watchedBubbles) {
        if (node.isConnected) continue;
        bubbleIntersection?.unobserve(node);
        resizeObs?.unobserve(node);
        watchedBubbles.delete(node);
        visibleBubbles.delete(node);
      }
      if (!bubbleIntersection) queueBubbleLenses();
    };

    // === Tier 2: WebGL2 Static Optical Glass Engine v2 (White-Neutrality + Async toBlob) ===
    const GPU_TARGETS = [
      { kind: "header", selector: '[data-ds-part="header"][data-app-shell-header-edge-scroll]', bezel: 9, scale: 12, blurLod: 0.55, defaultR: 0, tintAlpha: 0.09 },
      { kind: "sidebar", selector: 'aside.app-shell-left-panel, [data-ds-part="sidebar"]', bezel: 27, scale: 46, blurLod: 0.18, defaultR: 24, tintAlpha: 0.055 },
      { kind: "homeCard", selector: '[role="main"]:has([data-testid="home-icon"]) .group\\/home-suggestions button, .group\\/project-selector > button, [data-ds-part="home-hero"] button', bezel: 16, scale: 26, blurLod: 0.12, defaultR: 20, tintAlpha: 0.048 },
    ];
    const allBlobUrls = new Set();
    const activeTileUrls = new Map();
    const tileQueue = new Map();
    const desiredTileKeys = new Map();
    let tileRaf = 0;

    const artFocusX = Math.max(0, Math.min(1, Number(THEME.art?.focusX ?? 0.5)));
    const artFocusY = Math.max(0, Math.min(1, Number(THEME.art?.focusY ?? 0.45)));
    const glCanvas = document.createElement("canvas");
    const gl = glCanvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "high-performance" });
    let gpuProgram = null;
    let gpuLocs = null;
    let artTex = null;
    let artImgW = 1920;
    let artImgH = 1080;
    let artReady = false;

    const GPU_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

    const GPU_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uArt;
uniform vec2 uArtRes;
uniform vec2 uArtFocus;
uniform vec2 uViewport;
uniform vec4 uRect;
uniform float uRadius;
uniform float uBezel;
uniform float uScale;
uniform float uBlurLod;
uniform vec3 uAccent;
uniform vec3 uAccentAlt;
uniform float uIsDark;
uniform float uTintAlpha;
uniform float uRimMul;
uniform float uOpacityScale;

vec2 vpToArtUV(vec2 vpUV) {
  vec2 vpPx = vpUV * uViewport;
  float artAR = uArtRes.x / max(1.0, uArtRes.y);
  float vpAR = uViewport.x / max(1.0, uViewport.y);
  vec2 coverSize = vpAR > artAR ? vec2(uViewport.x, uViewport.x / artAR) : vec2(uViewport.y * artAR, uViewport.y);
  vec2 overflow = coverSize - uViewport;
  vec2 artTopLeft = -overflow * uArtFocus;
  vec2 uv = (vpPx - artTopLeft) / coverSize;
  return clamp(vec2(uv.x, 1.0 - uv.y), vec2(0.002), vec2(0.998));
}

float rrSdf(vec2 p, vec2 halfExt, float r) {
  vec2 q = abs(p) - (halfExt - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec2 rrNormal(vec2 p, vec2 halfExt, float r) {
  vec2 q = abs(p) - (halfExt - vec2(r));
  vec2 sp = vec2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
  if (q.x > 0.0 && q.y > 0.0) return normalize(q) * sp;
  if (q.x > q.y) return vec2(sp.x, 0.0);
  return vec2(0.0, sp.y);
}

vec3 sampleBlurred(vec2 vpUV, float lod) {
  vec2 auv = vpToArtUV(vpUV);
  if (lod <= 0.1) return textureLod(uArt, auv, 0.0).rgb;
  vec2 o = (1.15 / uViewport) * max(1.0, lod * 1.35);
  vec3 c = textureLod(uArt, auv, lod).rgb * 0.40;
  c += textureLod(uArt, auv + vec2(o.x, 0.0), lod).rgb * 0.15;
  c += textureLod(uArt, auv - vec2(o.x, 0.0), lod).rgb * 0.15;
  c += textureLod(uArt, auv + vec2(0.0, o.y), lod).rgb * 0.15;
  c += textureLod(uArt, auv - vec2(0.0, o.y), lod).rgb * 0.15;
  return c;
}

void main() {
  vec2 size = uRect.zw;
  vec2 localPx = vec2(vUV.x, 1.0 - vUV.y) * size;
  vec2 halfExt = size * 0.5;
  float r = min(uRadius, min(halfExt.x, halfExt.y));
  vec2 p = localPx - halfExt;
  float sdf = rrSdf(p, halfExt, r);
  if (sdf > 0.75) {
    outColor = vec4(0.0);
    return;
  }
  float d = max(0.0, -sdf);
  float bez = min(uBezel, min(halfExt.x, halfExt.y));
  vec2 n = rrNormal(p, halfExt, r);
  float t = clamp(d / max(1.0, bez), 0.0, 1.0);
  float edgeFade = smoothstep(0.0, 0.14, t);
  float dome = pow(1.0 - t, 1.65);
  float dispPx = -dome * (0.36 + 0.64 * edgeFade) * uScale;
  vec2 dispUV = n * dispPx / max(vec2(1.0), uViewport);
  vec2 vpUV = (uRect.xy + localPx) / uViewport;

  float edge = 1.0 - smoothstep(0.0, bez * 0.75, d);
  vec3 refr = sampleBlurred(clamp(vpUV + dispUV * 0.55, vec2(0.001), vec2(0.999)), mix(uBlurLod, uBlurLod * 0.45, edge));
  float cShift = max(0.0004, min(0.0032, abs(dispPx) * 0.12 / max(uViewport.x, 1.0))) * edge;
  vec3 crR = sampleBlurred(clamp(vpUV + dispUV * 0.55 + n * cShift, vec2(0.001), vec2(0.999)), uBlurLod * 0.5);
  vec3 crB = sampleBlurred(clamp(vpUV + dispUV * 0.55 - n * cShift, vec2(0.001), vec2(0.999)), uBlurLod * 0.5);
  vec3 refrChroma = vec3(crR.r, refr.g, crB.b);

  float luma = dot(refr, vec3(0.2126, 0.7152, 0.0722));
  float maxC = max(refr.r, max(refr.g, refr.b));
  float minC = min(refr.r, min(refr.g, refr.b));
  float whiteNeutral = smoothstep(0.76, 0.94, luma) * (1.0 - smoothstep(0.04, 0.16, maxC - minC));

  vec3 glass = mix(refr, refrChroma, 0.42 * (1.0 - 0.65 * whiteNeutral));
  vec3 lightTint = mix(uAccent * 0.18 + vec3(0.82), vec3(0.99, 0.995, 1.0), 0.72 + 0.28 * whiteNeutral);
  vec3 darkTint = mix(vec3(0.06, 0.08, 0.13), uAccent * 0.30, 0.28);
  vec3 tintCol = mix(lightTint, darkTint, uIsDark);
  float tAlpha = clamp(uTintAlpha * uOpacityScale * (1.0 - 0.35 * whiteNeutral), 0.015, 0.48);
  glass = mix(glass, tintCol, tAlpha);

  float rimBand = 1.0 - smoothstep(0.0, 2.2, abs(d - 1.2));
  float diagHighlight = clamp((-n.x * 0.58 - n.y * 0.81) * 0.5 + 0.5, 0.0, 1.0);
  vec3 rimTone = mix(vec3(1.0), uAccentAlt * 0.3 + vec3(0.7), 0.18 * (1.0 - whiteNeutral));
  glass += rimTone * (0.34 * rimBand * (0.45 + 0.55 * diagHighlight) * uRimMul);

  float aa = smoothstep(0.75, -0.75, sdf);
  outColor = vec4(clamp(glass, 0.0, 1.0), 1.0) * aa;
}`;

    const initWebGL = () => {
      if (!gl || !artDataUrl || artDataUrl.length < 32) return false;
      const comp = (type, srcStr) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, srcStr);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
        return s;
      };
      const vs = comp(gl.VERTEX_SHADER, GPU_VERT);
      const fs = comp(gl.FRAGMENT_SHADER, GPU_FRAG);
      if (!vs || !fs) return false;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gpuProgram = prog;

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const locPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(locPos);
      gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

      gpuLocs = {};
      for (const name of ["uArt", "uArtRes", "uArtFocus", "uViewport", "uRect", "uRadius", "uBezel", "uScale", "uBlurLod", "uAccent", "uAccentAlt", "uIsDark", "uTintAlpha", "uRimMul", "uOpacityScale"]) {
        gpuLocs[name] = gl.getUniformLocation(prog, name);
      }

      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (disposed || !gl) return;
        artImgW = img.naturalWidth || 1920;
        artImgH = img.naturalHeight || 1080;
        artTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, artTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        artReady = true;
        refreshAllOptics();
      };
      img.src = artDataUrl;
      return true;
    };

    const accentUnit = accentRgb.split(",").map((n) => Number(n) / 255);
    const accentAltUnit = accentAltRgb.split(",").map((n) => Number(n) / 255);

    const drawTileToBlob = (el, spec, rect, key) => {
      if (!gpuProgram || !artReady || !gl || disposed) return;
      const maxDim = 512;
      const ratio = Math.min(1, maxDim / Math.max(1, rect.width, rect.height));
      const tw = Math.max(16, Math.round(rect.width * ratio));
      const th = Math.max(16, Math.round(rect.height * ratio));
      glCanvas.width = tw;
      glCanvas.height = th;
      gl.viewport(0, 0, tw, th);
      gl.useProgram(gpuProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, artTex);
      gl.uniform1i(gpuLocs.uArt, 0);

      const zName = spec.kind === "homeCard" ? "cards" : "sidebar";
      const lp = resolveLgZone(zName);
      const isDark = resolvedShell() === "dark" ? 1 : 0;
      const refractMult = Math.max(0, Number(lp.refractScale ?? 100) / 100);
      const blurMult = Math.max(0, Number(lp.blurScale ?? 100) / 100);
      const rimMult = Math.max(0.2, Number(lp.rimIntensity ?? 100) / 100);
      const opacityScale = Math.max(0.18, Math.min(2.6, (112 - Number(lp.transparency ?? 80)) / 32));
      const r = getRadiusPx(el, spec.defaultR);

      gl.uniform2f(gpuLocs.uArtRes, artImgW, artImgH);
      gl.uniform2f(gpuLocs.uArtFocus, artFocusX, artFocusY);
      gl.uniform2f(gpuLocs.uViewport, Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
      gl.uniform4f(gpuLocs.uRect, rect.left, rect.top, rect.width, rect.height);
      gl.uniform1f(gpuLocs.uRadius, r);
      gl.uniform1f(gpuLocs.uBezel, spec.bezel);
      gl.uniform1f(gpuLocs.uScale, spec.scale * refractMult);
      gl.uniform1f(gpuLocs.uBlurLod, spec.blurLod * blurMult);
      gl.uniform3f(gpuLocs.uAccent, accentUnit[0], accentUnit[1], accentUnit[2]);
      gl.uniform3f(gpuLocs.uAccentAlt, accentAltUnit[0], accentAltUnit[1], accentAltUnit[2]);
      gl.uniform1f(gpuLocs.uIsDark, isDark);
      gl.uniform1f(gpuLocs.uTintAlpha, isDark ? Math.max(0.16, spec.tintAlpha * 3.0) : spec.tintAlpha);
      gl.uniform1f(gpuLocs.uRimMul, rimMult);
      gl.uniform1f(gpuLocs.uOpacityScale, opacityScale);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      glCanvas.toBlob((blob) => {
        if (!blob || disposed || !el.isConnected || desiredTileKeys.get(el) !== key) return;
        const url = URL.createObjectURL(blob);
        allBlobUrls.add(url);
        const prev = activeTileUrls.get(el);
        const oldUrl = prev?.url && prev.url !== url ? prev.url : null;
        activeTileUrls.set(el, { key, url });
        el.style.setProperty("--ds-lg-gpu-bg", `url("${url}")`);
        if (el.getAttribute("data-dream-lg-gpu") !== "1") {
          el.setAttribute("data-dream-lg-gpu", "1");
        }
        if (oldUrl) {
          setTimeout(() => {
            allBlobUrls.delete(oldUrl);
            try { URL.revokeObjectURL(oldUrl); } catch {}
          }, 500);
        }
      }, "image/png");
    };

    const flushTileQueue = () => {
      tileRaf = 0;
      if (disposed || !artReady) return;
      let count = 0;
      for (const [el, job] of tileQueue) {
        tileQueue.delete(el);
        if (!el.isConnected || desiredTileKeys.get(el) !== job.key) continue;
        drawTileToBlob(el, job.spec, job.rect, job.key);
        if (++count === 2) break;
      }
      if (tileQueue.size) tileRaf = requestAnimationFrame(flushTileQueue);
    };

    const refreshGpuTiles = () => {
      if (!artReady || disposed) return;
      const shell = resolvedShell();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const current = new Set();
      for (const spec of GPU_TARGETS) {
        const zName = spec.kind === "homeCard" ? "cards" : "sidebar";
        const lp = resolveLgZone(zName);
        const paramSig = `${shell}:${lp.transparency}:${lp.refractScale}:${lp.blurScale}:${lp.rimIntensity}:${vw}x${vh}`;
        for (const el of document.querySelectorAll(spec.selector)) {
          if (el.closest(ACTIVE_PAGE_OFF)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 16) continue;
          current.add(el);
          const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}x${Math.round(rect.height)}:${paramSig}`;
          if (desiredTileKeys.get(el) === key) continue;
          desiredTileKeys.set(el, key);
          if (activeTileUrls.get(el)?.key !== key) tileQueue.set(el, { spec, rect, key });
        }
      }
      for (const [el, { url }] of activeTileUrls) {
        if (current.has(el)) continue;
        el.removeAttribute("data-dream-lg-gpu");
        el.style.removeProperty("--ds-lg-gpu-bg");
        activeTileUrls.delete(el);
        allBlobUrls.delete(url);
        URL.revokeObjectURL(url);
      }
      for (const el of desiredTileKeys.keys()) {
        if (current.has(el)) continue;
        desiredTileKeys.delete(el);
        tileQueue.delete(el);
      }
      if (tileQueue.size && !tileRaf) tileRaf = requestAnimationFrame(flushTileQueue);
    };

    let opticsRaf = 0;
    const refreshAllOptics = () => {
      if (disposed || opticsRaf) return;
      opticsRaf = requestAnimationFrame(() => {
        opticsRaf = 0;
        if (disposed) return;
        syncSurfaceMarkers();
        syncComposerMenuMarkers();
        syncSvgLenses();
        refreshGpuTiles();
        observeLensNodes();
      });
    };
    window.__dsLgQueueOptics = refreshAllOptics;
    const onMenuInput = (event) => {
      const editor = event.target?.closest?.(MENU_EDITOR_SEL);
      if (!editor || (slashOwner !== editor && !isSlashQuery(editor))) return;
      slashOwner = isSlashQuery(editor) ? editor : null;
      syncComposerMenuMarkers();
      refreshAllOptics();
    };
    document.addEventListener("input", onMenuInput, { passive: true });

    initWebGL();

    // === Tier 3: HarmonyOS 7 Segmented Pill, Interruptible Springs & Zero-Lag FX ===
    const segStates = new WeakMap();
    const activeSegTracks = new Set();
    const segSprings = new Map();
    let segRaf = 0;
    let lastSegTime = 0;

    const findActiveSegItem = (track) => {
      const items = [...track.children].filter((c) => c.matches?.('[role="tab"], [role="radio"], button, a'));
      if (items.length < 2) return null;
      return items.find((c) =>
        c.getAttribute("aria-selected") === "true" ||
        c.getAttribute("aria-checked") === "true" ||
        c.getAttribute("aria-pressed") === "true" ||
        c.getAttribute("data-state") === "active" ||
        c.getAttribute("data-state") === "on" ||
        c.hasAttribute("aria-current") ||
        /\bbg-surface|\bbg-token-main|\bbg-primary|\bshadow-/.test(c.className?.toString?.() || "")
      ) || items[0];
    };

    const stepSegSprings = (now) => {
      segRaf = 0;
      const dt = Math.min(0.032, Math.max(0.004, ((now - lastSegTime) || 16.6) / 1000));
      lastSegTime = now;
      for (const [track, st] of segSprings) {
        if (!track.isConnected) { segSprings.delete(track); continue; }
        const k = 380;
        const c = 26;
        st.vx += (-k * (st.x - st.tx) - c * st.vx) * dt;
        st.x += st.vx * dt;
        st.vw += (-k * (st.w - st.tw) - c * st.vw) * dt;
        st.w += st.vw * dt;
        const sx = 1 + Math.min(0.18, Math.abs(st.vx) / 1800);
        const done = Math.abs(st.x - st.tx) < 0.25 && Math.abs(st.vx) < 1.2 && Math.abs(st.w - st.tw) < 0.25 && Math.abs(st.vw) < 1.2;
        if (done) {
          segSprings.delete(track);
          track.style.setProperty("--ds-lg-seg-x", `${st.tx.toFixed(2)}px`);
          track.style.setProperty("--ds-lg-seg-w", `${st.tw.toFixed(2)}px`);
          track.style.setProperty("--ds-lg-seg-sx", "1");
        } else {
          track.style.setProperty("--ds-lg-seg-x", `${st.x.toFixed(2)}px`);
          track.style.setProperty("--ds-lg-seg-w", `${st.w.toFixed(2)}px`);
          track.style.setProperty("--ds-lg-seg-sx", sx.toFixed(4));
        }
      }
      if (segSprings.size > 0) segRaf = requestAnimationFrame(stepSegSprings);
    };

    const syncSegmentedTrack = (track, animate = true) => {
      if (!track?.isConnected) return;
      if (track.querySelector(':scope > [class*="indicator-"]')) return;
      const active = findActiveSegItem(track);
      if (!active) return;
      const prev = segStates.get(track);
      if (prev && prev.activeEl === active && !animate) return;
      if (track.getAttribute("data-dream-lg-seg") !== "1") track.setAttribute("data-dream-lg-seg", "1");
      const tr = track.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      if (tr.width <= 0 || ar.width <= 0) return;
      const targetX = ar.left - tr.left;
      const targetW = ar.width;
      if (prev && Math.abs(prev.tx - targetX) < 0.5 && Math.abs(prev.tw - targetW) < 0.5) {
        prev.activeEl = active;
        return;
      }
      if (!animate || reducedMotion || !prev) {
        segStates.set(track, { tx: targetX, tw: targetW, activeEl: active });
        track.style.setProperty("--ds-lg-seg-x", `${targetX.toFixed(2)}px`);
        track.style.setProperty("--ds-lg-seg-w", `${targetW.toFixed(2)}px`);
        track.style.setProperty("--ds-lg-seg-sx", "1");
        return;
      }
      const existing = segSprings.get(track) || { x: prev.tx, vx: 0, tx: targetX, w: prev.tw, vw: 0, tw: targetW };
      existing.tx = targetX;
      existing.tw = targetW;
      segStates.set(track, { tx: targetX, tw: targetW, activeEl: active });
      segSprings.set(track, existing);
      if (!segRaf) {
        lastSegTime = performance.now();
        segRaf = requestAnimationFrame(stepSegSprings);
      }
    };

    const rescanSegTracks = () => {
      for (const track of document.querySelectorAll('[role="group"], [role="tablist"], [role="radiogroup"]')) {
        if (track.closest("#codex-dream-skin-plugin-host")) continue;
        if (track.querySelector(':scope > [class*="indicator-"]')) {
          if (track.hasAttribute("data-dream-lg-seg")) {
            track.removeAttribute("data-dream-lg-seg");
            track.style.removeProperty("--ds-lg-seg-x");
            track.style.removeProperty("--ds-lg-seg-w");
            track.style.removeProperty("--ds-lg-seg-sx");
          }
          continue;
        }
        const items = [...track.children].filter((c) => c.matches?.('[role="tab"], [role="radio"], button'));
        if (items.length >= 2 && items.some((c) => c.hasAttribute("aria-pressed") || c.hasAttribute("aria-checked") || c.hasAttribute("aria-selected"))) {
          activeSegTracks.add(track);
          syncSegmentedTrack(track, false);
        }
      }
    };

    // Interruptible Spring Engine
    const springNodes = new Map();
    let springRaf = 0;
    let lastSpringTime = 0;

    const stepSprings = (now) => {
      springRaf = 0;
      const dt = Math.min(0.032, Math.max(0.004, ((now - lastSpringTime) || 16.6) / 1000));
      lastSpringTime = now;
      for (const [el, st] of springNodes) {
        if (!el.isConnected) { springNodes.delete(el); continue; }
        const k = st.stiffness;
        const c = st.damping;
        st.vs += (-k * (st.s - st.ts) - c * st.vs) * dt;
        st.s += st.vs * dt;
        const done = Math.abs(st.s - st.ts) < 0.0008 && Math.abs(st.vs) < 0.004;
        if (done) {
          springNodes.delete(el);
          if (st.ts === 1) {
            el.style.removeProperty("transform");
            el.style.removeProperty("transition");
            delete el.dataset.dsLgTouchTransform;
          } else {
            el.style.transform = `scale(${st.ts.toFixed(4)})`;
          }
        } else {
          el.dataset.dsLgTouchTransform = "1";
          el.style.transition = "none";
          el.style.transform = `scale(${st.s.toFixed(4)})`;
        }
      }
      if (springNodes.size > 0) springRaf = requestAnimationFrame(stepSprings);
    };

    const setSpringTarget = (el, target = {}, initVel = null) => {
      if (!el?.isConnected || reducedMotion || liteMotion) return;
      let st = springNodes.get(el);
      if (!st) {
        st = { s: 1, vs: 0, ts: 1, stiffness: target.stiffness ?? 500, damping: target.damping ?? 27 };
        springNodes.set(el, st);
      }
      if (initVel && typeof initVel.vs === "number") st.vs = initVel.vs;
      if (typeof target.ts === "number") st.ts = target.ts;
      if (typeof target.stiffness === "number") st.stiffness = target.stiffness;
      if (typeof target.damping === "number") st.damping = target.damping;
      if (!springRaf) {
        lastSpringTime = performance.now();
        springRaf = requestAnimationFrame(stepSprings);
      }
    };

    // Lightweight Neutral Crystal Micro-FX Canvas (idle = 0 CPU/GPU)
    const fxCanvas = document.createElement("canvas");
    fxCanvas.id = LG_CANVAS_ID;
    fxCanvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9998;";
    (document.body || root).appendChild(fxCanvas);
    const fxCtx = fxCanvas.getContext("2d");
    const particles = [];
    let fxRaf = 0;
    let hoveredRect = null;
    let hoveredRadius = 18;
    let hoverCursorX = 0;
    let hoverCursorY = 0;
    let hoverSheenAlpha = 0;

    const sizeFxCanvas = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      fxCanvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      fxCanvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      fxCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      radiusCache = new WeakMap();
      refreshAllOptics();
      for (const t of activeSegTracks) syncSegmentedTrack(t, false);
    };
    sizeFxCanvas();

    const stepFx = () => {
      fxRaf = 0;
      if (!fxCtx || !fxCanvas.isConnected || disposed) return;
      fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (hoveredRect && hoverSheenAlpha > 0.02) {
        const rad = Math.min(hoveredRadius, hoveredRect.width * 0.5, hoveredRect.height * 0.5);
        const g = fxCtx.createRadialGradient(hoverCursorX, hoverCursorY, 2, hoverCursorX, hoverCursorY, 136);
        g.addColorStop(0, `rgba(255, 255, 255, ${(0.78 * hoverSheenAlpha).toFixed(3)})`);
        g.addColorStop(0.45, `rgba(255, 255, 255, ${(0.24 * hoverSheenAlpha).toFixed(3)})`);
        g.addColorStop(1, "rgba(255, 255, 255, 0)");
        fxCtx.save();
        fxCtx.strokeStyle = g;
        fxCtx.lineWidth = 1.4;
        fxCtx.beginPath();
        if (typeof fxCtx.roundRect === "function") {
          fxCtx.roundRect(hoveredRect.left + 0.5, hoveredRect.top + 0.5, Math.max(0, hoveredRect.width - 1), Math.max(0, hoveredRect.height - 1), rad);
        } else {
          fxCtx.rect(hoveredRect.left + 0.5, hoveredRect.top + 0.5, Math.max(0, hoveredRect.width - 1), Math.max(0, hoveredRect.height - 1));
        }
        fxCtx.stroke();
        fxCtx.restore();
        hoverSheenAlpha *= 0.84;
      } else {
        hoverSheenAlpha = 0;
      }

      const now = performance.now();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const age = (now - p.t0) / p.life;
        if (age >= 1) { particles.splice(i, 1); continue; }
        const ease = 1 - Math.pow(1 - age, 3);
        const alpha = p.alpha * Math.pow(1 - age, 1.6);
        if (p.kind === "ring") {
          fxCtx.beginPath();
          fxCtx.arc(p.x, p.y, 4 + ease * p.r, 0, Math.PI * 2);
          fxCtx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          fxCtx.lineWidth = 1.3 * (1 - age * 0.5);
          fxCtx.stroke();
        } else {
          const px = p.x + p.vx * ease;
          const py = p.y + p.vy * ease + 12 * age * age;
          fxCtx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          fxCtx.beginPath();
          fxCtx.arc(px, py, p.r * (1 - age * 0.45), 0, Math.PI * 2);
          fxCtx.fill();
        }
      }
      if (particles.length > 0 || (hoveredRect && hoverSheenAlpha > 0.02)) {
        fxRaf = requestAnimationFrame(stepFx);
      } else {
        fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    const ensureFxRaf = () => {
      if (!fxRaf && !disposed) fxRaf = requestAnimationFrame(stepFx);
    };

    const emitPressSparks = (x, y) => {
      const enabled = window.__dsCurrentLiveParams?.particlesEnabled !== false;
      if (!enabled || reducedMotion || liteMotion) return;
      const now = performance.now();
      particles.push({ kind: "ring", x, y, r: 22, t0: now, life: 320, alpha: 0.48 });
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.4;
        const sp = 16 + Math.random() * 24;
        particles.push({ kind: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, r: 1.4 + Math.random() * 1.1, t0: now, life: 290 + Math.random() * 80, alpha: 0.72 });
      }
      if (particles.length > 36) particles.splice(0, particles.length - 36);
      ensureFxRaf();
    };

    // Focused Interaction Handlers (zero per-mousemove style mutations!)
    const WORK_BODY_SEL = '[data-dream-lg-surface="work-composer"] [data-composer-body]';
    const INTERACTIVE_SEL = 'aside.app-shell-left-panel button, aside.app-shell-left-panel a, header button, [role="main"] .group\\/home-suggestions button, .group\\/project-selector > button, [data-ds-part="home-hero"] button, .composer-surface-chrome button, [class*="ComposerLayoutRoot"] button, [class*="rail-"][class*="attached-"] button, [class*="homeUtilityBar"] button, [data-oai-writing-block-surface] header button, [role="menuitem"], [role="option"], [role="switch"]';
    const GLASS_CARD_SEL = `.composer-surface-chrome:not([data-dream-lg-surface="work-composer"]), ${WORK_BODY_SEL}, [class*="ComposerLayoutRoot"]:not([data-dream-lg-surface="work-composer"]), [class*="rail-"][class*="attached-"], [class*="homeUtilityBar"], [data-oai-writing-block-surface], [data-testid="chatgpt-writing-block"], aside[class*="banner-"], [class*="ComposerBannerPortal"] aside, aside.app-shell-left-panel, [role="main"] .group\\/home-suggestions button, .group\\/project-selector > button, section div[class*="rounded-2xl"][class*="border"], [role="dialog"], [role="menu"]`;

    let activePress = null;
    let hoveredCard = null;
    let hoverPairRoot = null;
    let hoveredTarget = null;

    const clearHoverCard = () => {
      if (hoveredCard?.isConnected) hoveredCard.removeAttribute("data-dream-lg-hover");
      if (hoverPairRoot?.isConnected) {
        hoverPairRoot.querySelectorAll("[data-dream-lg-pair-active]").forEach((n) => n.removeAttribute("data-dream-lg-pair-active"));
      }
      hoveredCard = null;
      hoverPairRoot = null;
      hoveredTarget = null;
      hoveredRect = null;
    };

    const onPointerOver = (e) => {
      if (e.target?.closest?.("#codex-dream-skin-plugin-host")) return;
      const card = e.target?.closest?.(GLASS_CARD_SEL) || null;
      if (card !== hoveredCard) {
        clearHoverCard();
        hoveredCard = card;
        if (card) {
          card.setAttribute("data-dream-lg-hover", "1");
          if (card.matches?.(COMPOSER_SEL) || card.matches?.(WORK_BODY_SEL) || card.matches?.(RAIL_SEL)) {
            const pairWrap = card.closest?.('[data-dream-lg-surface="work-composer"], [data-codex-composer-root]') || card.parentElement;
            if (pairWrap) {
              hoverPairRoot = pairWrap;
              pairWrap.querySelectorAll(`${COMPOSER_SEL}, ${WORK_BODY_SEL}, ${RAIL_SEL}`).forEach((n) => n.setAttribute("data-dream-lg-pair-active", "1"));
            }
          }
        }
      }
      const btn = e.target?.closest?.(INTERACTIVE_SEL) || null;
      if (btn && btn !== hoveredTarget && !reducedMotion && !liteMotion) {
        hoveredTarget = btn;
        hoveredRect = btn.getBoundingClientRect();
        hoveredRadius = getRadiusPx(btn, 14);
        hoverCursorX = e.clientX;
        hoverCursorY = e.clientY;
        hoverSheenAlpha = 1;
        ensureFxRaf();
      }
    };

    const onPointerMove = (e) => {
      if (activePress && !activePress.cancelled) {
        if (Math.hypot(e.clientX - activePress.x0, e.clientY - activePress.y0) > 18) {
          activePress.cancelled = true;
          setSpringTarget(activePress.el, { ts: 1, stiffness: 460, damping: 27 });
        }
      }
      if (hoveredTarget && hoveredRect && !reducedMotion && !liteMotion) {
        hoverCursorX = e.clientX;
        hoverCursorY = e.clientY;
        hoverSheenAlpha = 1;
        ensureFxRaf();
      }
    };

    const onPointerOut = (e) => {
      const next = e.relatedTarget;
      if (!next || (hoveredCard && !hoveredCard.contains(next))) clearHoverCard();
      if (activePress && !activePress.cancelled && next && !activePress.el.contains(next)) {
        activePress.cancelled = true;
        setSpringTarget(activePress.el, { ts: 1, stiffness: 460, damping: 27 });
      }
    };

    const onPointerDown = (e) => {
      if (e.button !== 0 || e.target?.closest?.("#codex-dream-skin-plugin-host")) return;
      const btn = e.target?.closest?.(INTERACTIVE_SEL);
      if (!btn) return;
      activePress = { el: btn, x0: e.clientX, y0: e.clientY, cancelled: false };
      setSpringTarget(btn, { ts: 0.964, stiffness: 580, damping: 28 });
      emitPressSparks(e.clientX, e.clientY);
      const track = btn.closest?.('[role="group"], [role="tablist"]');
      if (track && activeSegTracks.has(track)) requestAnimationFrame(() => syncSegmentedTrack(track, true));
    };

    const onPointerUpOrCancel = () => {
      if (activePress && !activePress.cancelled) {
        setSpringTarget(activePress.el, { ts: 1, stiffness: 420, damping: 22 }, { vs: 0.42 });
      }
      activePress = null;
    };

    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUpOrCancel, { passive: true });
    window.addEventListener("pointercancel", onPointerUpOrCancel, { passive: true });
    window.addEventListener("resize", sizeFxCanvas, { passive: true });

    // Keep the stable surfaces observed; bubble resize observation is viewport-scoped.
    const observedResizeNodes = new Set();
    const observeLensNodes = () => {
      if (!resizeObs) return;
      const next = new Set(document.querySelectorAll(`${COMPOSER_SEL}, ${WORK_BODY_SEL}, ${RAIL_SEL}, ${SLASH_SEL}, ${ATTACH_SEL}, ${WRITING_SEL}, ${BANNER_SEL}, aside.app-shell-left-panel`));
      for (const node of observedResizeNodes) {
        if (next.has(node)) continue;
        resizeObs.unobserve(node);
        observedResizeNodes.delete(node);
      }
      for (const node of next) {
        if (observedResizeNodes.has(node)) continue;
        resizeObs.observe(node);
        observedResizeNodes.add(node);
      }
    };
    const resizeObs = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
      if (entries.some(({ target }) => visibleBubbles.has(target))) queueBubbleLenses();
      if (entries.some(({ target }) => observedResizeNodes.has(target))) refreshAllOptics();
    }) : null;

    let busyStopTimer = 0;
    let settledTimer = 0;
    let runningSurface = null;
    let runningRim = null;
    const syncBusyState = () => {
      if (disposed || document.hidden) return;
      const stopButtons = document.querySelectorAll(
        `:is([data-codex-composer-root], ${COMPOSER_SEL}) :is(button[aria-label="停止"], button[aria-label="停止生成"], button[aria-label="引导"], button[aria-label="Steer" i], button[aria-label="Stop" i], button[aria-label="Stop generating" i], button[data-testid="stop-button"])`
      );
      const control = Array.from(stopButtons).find(button =>
        !button.matches(':disabled, [aria-disabled="true"]') &&
        !button.closest(`${ACTIVE_PAGE_OFF}, [data-composer-rail]`) &&
        button.getClientRects().length && getComputedStyle(button).visibility === "visible"
      );
      const shell = control?.closest(COMPOSER_SEL);
      if (shell) {
        clearTimeout(busyStopTimer);
        clearTimeout(settledTimer);
        busyStopTimer = 0;
        const surface = isWorkComposerNode(shell) ? shell.querySelector('[data-composer-body]') || shell : shell;
        if (runningSurface !== surface) {
          runningSurface?.removeAttribute("data-dream-lg-running");
          runningRim?.remove();
          runningSurface = surface;
          runningRim = document.createElement("span");
          runningRim.className = "ds-lg-aurora-rim";
          runningRim.setAttribute("aria-hidden", "true");
          surface.appendChild(runningRim);
        }
        if (surface.getAttribute("data-dream-lg-running") !== "active") surface.setAttribute("data-dream-lg-running", "active");
        if (root.getAttribute("data-dream-lg-busy") !== "true") root.setAttribute("data-dream-lg-busy", "true");
      } else if (runningSurface?.getAttribute("data-dream-lg-running") === "active" && !busyStopTimer) {
        busyStopTimer = setTimeout(() => {
          busyStopTimer = 0;
          const surface = runningSurface;
          surface?.setAttribute("data-dream-lg-running", "fade");
          root.removeAttribute("data-dream-lg-busy");
          settledTimer = setTimeout(() => {
            surface?.removeAttribute("data-dream-lg-running");
            runningRim?.remove();
            runningRim = null;
            runningSurface = null;
          }, 320);
        }, 170);
      }
    };
    const stopFallback = setInterval(() => {
      if (runningSurface || root.hasAttribute("data-dream-lg-busy")) syncBusyState();
    }, 1200);
    document.addEventListener("visibilitychange", syncBusyState);

    const domObs = new MutationObserver((records) => {
      let layoutChanged = false;
      let controlsChanged = false;
      let menuChanged = false;
      for (const rec of records) {
        const target = rec.target;
        if (target.closest?.("#codex-dream-skin-plugin-host, #ds-lg-svg-defs, #ds-lg-fx-canvas, [contenteditable='true']")) continue;
        if (target.closest?.(MENU_OVERLAY_SEL) || target.matches?.('[data-composer-navigation-target="add-context"]')) menuChanged = true;
        if (rec.type === "attributes") {
          const track = target.closest?.('[role="group"], [role="tablist"], [role="radiogroup"]');
          if (track && activeSegTracks.has(track)) syncSegmentedTrack(track, true);
          if (target.closest?.('[data-codex-composer-root]')) controlsChanged = true;
          if (rec.attributeName === "aria-expanded") layoutChanged = true;
          continue;
        }
        if (target.closest?.('[data-codex-composer-root]')) controlsChanged = true;
        for (const n of [...rec.addedNodes, ...rec.removedNodes]) {
          if (n.nodeType !== 1 || n.matches("#ds-lg-svg-defs, #ds-lg-fx-canvas, #codex-dream-skin-plugin-host")) continue;
          if (!n.matches(OPTICS_STRUCTURAL_SEL) && !n.querySelector(OPTICS_STRUCTURAL_SEL)) continue;
          layoutChanged = true;
          if (n.isConnected) syncBubbleNodes(n);
          if (n.matches(MENU_OVERLAY_SEL) || n.querySelector(MENU_OVERLAY_SEL)) menuChanged = true;
          if (n.querySelector('[data-codex-composer-root]')) controlsChanged = true;
        }
      }
      if (controlsChanged) {
        syncBusyState();
        layoutChanged = true;
      }
      if (menuChanged) syncComposerMenuMarkers();
      if (layoutChanged || menuChanged) {
        refreshAllOptics();
        rescanSegTracks();
      }
    });
    domObs.observe(document.body || root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected", "aria-checked", "aria-pressed", "aria-label", "aria-expanded", "data-state"],
    });

    syncBubbleNodes();
    rescanSegTracks();
    syncBusyState();
    refreshAllOptics();

    let liveParamDebounce = 0;
    let tileTuneSignature = "";
    window.__dsLgApplyLiveParams = () => {
      const flags = resolveMotionFlags();
      reducedMotion = flags.reduced;
      liteMotion = flags.lite;
      root.setAttribute("data-dream-lg-motion", reducedMotion ? "reduced" : (liteMotion ? "lite" : "full"));
      syncSvgLenses(false);
      if (lensRimState !== String(Math.max(0, resolveLgZone("writing").refractScale / 100))) queueBubbleLenses();
      const nextTileTuneSignature = JSON.stringify([resolveLgZone("sidebar"), resolveLgZone("cards")]);
      if (nextTileTuneSignature !== tileTuneSignature) {
        tileTuneSignature = nextTileTuneSignature;
        clearTimeout(liveParamDebounce);
        liveParamDebounce = setTimeout(() => {
          if (!disposed) refreshGpuTiles();
        }, 48);
      }
    };

    const cleanupFn = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(fxRaf);
      cancelAnimationFrame(springRaf);
      cancelAnimationFrame(segRaf);
      cancelAnimationFrame(tileRaf);
      cancelAnimationFrame(opticsRaf);
      cancelAnimationFrame(bubbleRaf);
      clearTimeout(busyStopTimer);
      clearTimeout(settledTimer);
      runningSurface?.removeAttribute("data-dream-lg-running");
      runningRim?.remove();
      document.removeEventListener("visibilitychange", syncBusyState);
      document.removeEventListener("input", onMenuInput);
      bubbleIntersection?.disconnect();
      for (const node of watchedBubbles) releaseBubbleLens(node);
      for (const node of document.querySelectorAll("[data-dream-lg-menu], [data-dream-lg-goal-rail], [data-dream-lg-goal-item]")) {
        node.removeAttribute("data-dream-lg-menu");
        node.removeAttribute("data-dream-lg-goal-rail");
        node.removeAttribute("data-dream-lg-goal-item");
        node.style.removeProperty("--ds-lg-lens-attach");
      }
      clearTimeout(liveParamDebounce);
      clearInterval(stopFallback);
      resizeObs?.disconnect();
      domObs.disconnect();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUpOrCancel);
      window.removeEventListener("pointercancel", onPointerUpOrCancel);
      window.removeEventListener("resize", sizeFxCanvas);
      for (const u of allBlobUrls) URL.revokeObjectURL(u);
      allBlobUrls.clear();
      activeTileUrls.clear();
      try { gl?.getExtension("WEBGL_lose_context")?.loseContext(); } catch {}
      clearHoverCard();
      delete window.__dsLgApplyLiveParams;
      delete window.__dsLgQueueOptics;
    };
    window.__dsLgEditionCleanup = cleanupFn;
    harmonyCleanup = () => teardownLiquidGlassEdition();
  };

  try {
    teardownHarmonyDomArtifacts();
    if (isLiquidGlassEdition()) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initLiquidGlassEdition, { once: true });
      } else {
        initLiquidGlassEdition();
      }
    } else {
      teardownLiquidGlassEdition();
    }
  } catch (e) {}

  // === Live Optical Parameters Engine (0ms rAF + Multi-Zone updates across all themes) ===
  const LIQUID_ZONES = ["composer", "slash", "attach", "writing", "sidebar", "cards", "popover"];
  const ZONE_OPTICS = {
    composer: { hi: 0.10, mid: 0.025, lo: 0.065, blur: 1.1, rim: 0.15, darkHi: 0.11, darkMid: 0.18, darkLo: 0.24, darkRim: 0.22 },
    slash:    { hi: 0.63, mid: 0.440, lo: 0.540, blur: 13, rim: 0.18, darkHi: 0.32, darkMid: 0.44, darkLo: 0.50, darkRim: 0.26, darkTintPopover: true },
    attach:   { hi: 0.72, mid: 0.560, lo: 0.630, blur: 14, rim: 0.18, darkHi: 0.32, darkMid: 0.44, darkLo: 0.50, darkRim: 0.26, darkTintPopover: true },
    writing:  { hi: 0.24, mid: 0.070, lo: 0.150, blur: 5.0, rim: 0.16, darkHi: 0.11, darkMid: 0.24, darkLo: 0.30, darkRim: 0.24 },
    sidebar:  { hi: 0.22, mid: 0.080, lo: 0.140, blur: 4.0, rim: 0.15, darkHi: 0.11, darkMid: 0.20, darkLo: 0.24, darkRim: 0.22 },
    cards:    { hi: 0.22, mid: 0.070, lo: 0.140, blur: 5.0, rim: 0.15, darkHi: 0.11, darkMid: 0.20, darkLo: 0.24, darkRim: 0.22 },
    popover:  { hi: 0.48, mid: 0.280, lo: 0.380, blur: 10.0, rim: 0.16, darkHi: 0.64, darkMid: 0.58, darkLo: 0.54, darkRim: 0.24, darkTintPopover: true },
  };
  const normalizeClientLiveParams = (raw = {}) => {
    const num = (v, min, max, d) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : d;
    };
    const alphaFallback = typeof THEME.userTransparency === "number" ? THEME.userTransparency : 80;
    const zones = {};
    if (raw.zones && typeof raw.zones === "object" && !Array.isArray(raw.zones)) {
      for (const z of LIQUID_ZONES) {
        const zRaw = raw.zones[z];
        if (!zRaw || typeof zRaw !== "object" || Array.isArray(zRaw)) continue;
        const entry = {};
        if (zRaw.transparency !== undefined) entry.transparency = num(zRaw.transparency, 15, 100, alphaFallback);
        if (zRaw.refractScale !== undefined) entry.refractScale = num(zRaw.refractScale, 0, 200, 100);
        if (zRaw.blurScale !== undefined) entry.blurScale = num(zRaw.blurScale, 0, 200, 100);
        if (zRaw.rimIntensity !== undefined) entry.rimIntensity = num(zRaw.rimIntensity, 0, 200, 100);
        if (Object.keys(entry).length > 0) zones[z] = entry;
      }
    }
    return {
      transparency: num(raw.transparency ?? alphaFallback, 0, 100, alphaFallback),
      refractScale: num(raw.refractScale, 0, 200, 100),
      blurScale: num(raw.blurScale, 0, 200, 100),
      rimIntensity: num(raw.rimIntensity, 0, 200, 100),
      motionMode: ["spring", "lite", "off"].includes(raw.motionMode) ? raw.motionMode : "spring",
      particlesEnabled: typeof raw.particlesEnabled === "boolean" ? raw.particlesEnabled : true,
      fontWeightBoost: num(raw.fontWeightBoost, -80, 150, 0),
      zones,
    };
  };
  const applyLiveTuneRuntime = (nextParams) => {
    const p = normalizeClientLiveParams(nextParams);
    window.__dsCurrentLiveParams = p;
    if (window[DISABLED_KEY]) return p;
    const root = document.documentElement;
    if (!root) return p;

    if (THEME.userTransparency !== p.transparency) {
      THEME.userTransparency = p.transparency;
      applyTheme(root, resolvedShell());
    }
    const refractMult = (p.refractScale / 100).toFixed(3);
    const blurMult = (p.blurScale / 100).toFixed(3);
    const rimMult = (p.rimIntensity / 100).toFixed(3);
    const wBody = Math.max(300, Math.min(800, 500 + p.fontWeightBoost));
    const wCtrl = Math.max(320, Math.min(800, 530 + p.fontWeightBoost));
    const wHead = Math.max(360, Math.min(850, 560 + p.fontWeightBoost));

    setStyleProperty(root, "--ds-live-refract-mult", refractMult);
    setStyleProperty(root, "--ds-live-blur-mult", blurMult);
    setStyleProperty(root, "--ds-live-rim-mult", rimMult);
    setStyleProperty(root, "--ds-live-weight-body", String(wBody));
    setStyleProperty(root, "--ds-live-weight-ctrl", String(wCtrl));
    setStyleProperty(root, "--ds-live-weight-head", String(wHead));

    const curShell = resolvedShell();
    const clampA = (v, min = 0.01, max = 0.94) => Math.max(min, Math.min(max, v)).toFixed(3);
    const opacityScale = Math.max(0.14, Math.min(2.8, (112 - p.transparency) / 32));
    setStyleProperty(root, "--ds-lg-glaze-hi", clampA(0.10 * opacityScale));
    setStyleProperty(root, "--ds-lg-glaze-mid", clampA(0.025 * opacityScale, 0.005));
    setStyleProperty(root, "--ds-lg-glaze-lo", clampA(0.065 * opacityScale));
    setStyleProperty(root, "--ds-lg-live-blur", `${(1.1 * (p.blurScale / 100)).toFixed(2)}px`);
    setStyleProperty(root, "--ds-lg-rim-alpha", clampA((curShell === "dark" ? 0.22 : 0.15) * Math.max(0.20, p.rimIntensity / 100), 0.03, 0.88));
    if (curShell === "dark") {
      if (p.transparency === 80) {
        root.style.removeProperty("--ds-lg-glass-hi");
        root.style.removeProperty("--ds-lg-glass-mid");
        root.style.removeProperty("--ds-lg-glass-lo");
      } else {
        setStyleProperty(root, "--ds-lg-glass-hi", `rgb(255 255 255 / ${clampA(0.11 * Math.max(0.35, opacityScale))})`);
        setStyleProperty(root, "--ds-lg-glass-mid", `rgb(14 18 28 / ${clampA(0.18 * opacityScale)})`);
        setStyleProperty(root, "--ds-lg-glass-lo", `rgb(14 18 28 / ${clampA(0.24 * opacityScale)})`);
      }
    } else {
      root.style.removeProperty("--ds-lg-glass-hi");
      root.style.removeProperty("--ds-lg-glass-mid");
      root.style.removeProperty("--ds-lg-glass-lo");
    }

    for (const z of LIQUID_ZONES) {
      const cfg = ZONE_OPTICS[z];
      const zp = resolveZoneEffective(p, z);
      const zOp = Math.max(0.14, Math.min(2.8, (112 - zp.transparency) / 32));
      setStyleProperty(root, `--ds-lg-z-${z}-hi`, clampA(cfg.hi * zOp));
      setStyleProperty(root, `--ds-lg-z-${z}-mid`, clampA(cfg.mid * zOp, 0.005));
      setStyleProperty(root, `--ds-lg-z-${z}-lo`, clampA(cfg.lo * zOp));
      setStyleProperty(root, `--ds-lg-z-${z}-blur`, `${Math.max(0, cfg.blur * (zp.blurScale / 100)).toFixed(2)}px`);
      const baseRim = curShell === "dark" ? cfg.darkRim : cfg.rim;
      setStyleProperty(root, `--ds-lg-z-${z}-rim-a`, clampA(baseRim * Math.max(0.20, zp.rimIntensity / 100), 0.03, 0.88));
      if (curShell === "dark") {
        if (zp.transparency === 80) {
          root.style.removeProperty(`--ds-lg-z-${z}-dark-hi`);
          root.style.removeProperty(`--ds-lg-z-${z}-dark-mid`);
          root.style.removeProperty(`--ds-lg-z-${z}-dark-lo`);
        } else if (cfg.darkTintPopover) {
          setStyleProperty(root, `--ds-lg-z-${z}-dark-hi`, `rgb(28 35 52 / ${clampA(cfg.darkHi * zOp)})`);
          setStyleProperty(root, `--ds-lg-z-${z}-dark-mid`, `rgb(20 26 40 / ${clampA(cfg.darkMid * zOp)})`);
          setStyleProperty(root, `--ds-lg-z-${z}-dark-lo`, `rgb(14 18 28 / ${clampA(cfg.darkLo * zOp)})`);
        } else {
          setStyleProperty(root, `--ds-lg-z-${z}-dark-hi`, `rgb(255 255 255 / ${clampA(cfg.darkHi * Math.max(0.35, zOp))})`);
          setStyleProperty(root, `--ds-lg-z-${z}-dark-mid`, `rgb(14 18 28 / ${clampA(cfg.darkMid * zOp)})`);
          setStyleProperty(root, `--ds-lg-z-${z}-dark-lo`, `rgb(16 22 36 / ${clampA(cfg.darkLo * zOp)})`);
        }
      } else {
        root.style.removeProperty(`--ds-lg-z-${z}-dark-hi`);
        root.style.removeProperty(`--ds-lg-z-${z}-dark-mid`);
        root.style.removeProperty(`--ds-lg-z-${z}-dark-lo`);
      }
    }

    const rules = [];
    const nativeDataTheme = root.getAttribute("data-theme") || "";
    if (curShell === "dark" && nativeDataTheme !== "dark") {
      rules.push(`
        html[data-dream-skin="active"][data-dream-shell="dark"]:not([data-theme="dark"]) {
          --color-background-user-message: rgb(var(--ds-panel-2-rgb) / var(--ds-upload-panel-alt-alpha, 0.82)) !important;
          --color-background-user-message-hover: rgb(var(--ds-panel-2-rgb) / 0.90) !important;
          --color-text: var(--ds-text) !important;
          --color-text-primary: var(--ds-text) !important;
          --color-text-emphasis: var(--ds-text) !important;
          --color-text-secondary: var(--ds-muted) !important;
          --color-text-tertiary: var(--ds-muted) !important;
          --color-token-foreground: var(--ds-text) !important;
          --color-token-text-primary: var(--ds-text) !important;
          --color-token-text-secondary: var(--ds-muted) !important;
          --color-token-text-tertiary: var(--ds-muted) !important;
          --tw-prose-body: var(--ds-text) !important;
          --tw-prose-headings: var(--ds-text) !important;
          --tw-prose-bold: var(--ds-text) !important;
          --tw-prose-links: var(--ds-accent) !important;
          --tw-prose-code: var(--ds-text) !important;
          --tw-prose-quotes: var(--ds-muted) !important;
        }
        html[data-dream-skin="active"][data-dream-shell="dark"]:not([data-theme="dark"]) :is(.thread-scroll-container, main) :is(h1, h2, h3, h4, p, li, strong, blockquote, td, th, code:not(pre code)) {
          color: var(--ds-text) !important;
        }
        html[data-dream-skin="active"][data-dream-shell="dark"]:not([data-theme="dark"], [data-dream-lg="on"]) .thread-scroll-container :is([data-user-message-bubble="true"], [class~="bg-user-message"]) {
          background-color: rgb(var(--ds-panel-2-rgb) / var(--ds-upload-panel-alt-alpha, 0.82)) !important;
          color: var(--ds-text) !important;
          border: 1px solid rgb(var(--ds-text-rgb) / 0.16) !important;
        }
      `);
    } else if (curShell === "light" && nativeDataTheme === "dark") {
      rules.push(`
        html[data-dream-skin="active"][data-dream-shell="light"][data-theme="dark"] {
          --color-background-user-message: rgb(var(--ds-panel-2-rgb) / var(--ds-upload-panel-alt-alpha, 0.82)) !important;
          --color-background-user-message-hover: rgb(var(--ds-panel-2-rgb) / 0.90) !important;
          --color-text: var(--ds-text) !important;
          --color-text-primary: var(--ds-text) !important;
          --color-text-emphasis: var(--ds-text) !important;
          --color-text-secondary: var(--ds-muted) !important;
          --color-text-tertiary: var(--ds-muted) !important;
          --color-token-foreground: var(--ds-text) !important;
          --color-token-text-primary: var(--ds-text) !important;
          --color-token-text-secondary: var(--ds-muted) !important;
          --color-token-text-tertiary: var(--ds-muted) !important;
          --tw-prose-body: var(--ds-text) !important;
          --tw-prose-headings: var(--ds-text) !important;
          --tw-prose-bold: var(--ds-text) !important;
          --tw-prose-links: var(--ds-accent) !important;
          --tw-prose-code: var(--ds-text) !important;
          --tw-prose-quotes: var(--ds-muted) !important;
        }
        html[data-dream-skin="active"][data-dream-shell="light"][data-theme="dark"] :is(.thread-scroll-container, main) :is(h1, h2, h3, h4, p, li, strong, blockquote, td, th, code:not(pre code)) {
          color: var(--ds-text) !important;
        }
        html[data-dream-skin="active"][data-dream-shell="light"][data-theme="dark"]:not([data-dream-lg="on"]) .thread-scroll-container :is([data-user-message-bubble="true"], [class~="bg-user-message"]) {
          background-color: rgb(var(--ds-panel-2-rgb) / var(--ds-upload-panel-alt-alpha, 0.82)) !important;
          color: var(--ds-text) !important;
          border: 1px solid rgb(var(--ds-text-rgb) / 0.16) !important;
        }
      `);
    }
    if (p.blurScale !== 100) {
      const stdBlur = Math.max(0, (p.blurScale / 100) * 6).toFixed(1);
      rules.push(`
        html[data-dream-skin="active"]:not([data-dream-lg="on"]) :is(aside.app-shell-left-panel, [data-ds-part="composer"], [role="dialog"], [role="menu"]) {
          backdrop-filter: blur(${stdBlur}px) saturate(135%) !important;
          -webkit-backdrop-filter: blur(${stdBlur}px) saturate(135%) !important;
        }
      `);
    }
    if (p.fontWeightBoost !== 0) {
      rules.push(`
        html[data-dream-skin="active"] :is(body, aside, main, [role="menu"], [role="dialog"]) { font-weight: ${wBody} !important; }
        html[data-dream-skin="active"] :is(button, a, label, [role="menuitem"], [role="tab"], [role="option"]) { font-weight: ${wCtrl} !important; }
        html[data-dream-skin="active"] :is(h1, h2, h3, [data-ds-part="home-hero"]) { font-weight: ${wHead} !important; }
      `);
    }
    if (p.motionMode === "off") {
      rules.push(`
        html[data-dream-skin="active"] *, html[data-dream-skin="active"] *::before, html[data-dream-skin="active"] *::after {
          transition-duration: 0ms !important;
          animation-duration: 0ms !important;
        }
      `);
    }
    let liveStyle = document.getElementById("ds-live-tune-css");
    if (rules.length > 0) {
      if (!liveStyle) {
        liveStyle = document.createElement("style");
        liveStyle.id = "ds-live-tune-css";
        (document.head || root).appendChild(liveStyle);
      }
      const nextCss = rules.join("\n");
      if (liveStyle.textContent !== nextCss) liveStyle.textContent = nextCss;
    } else if (liveStyle) {
      liveStyle.remove();
    }

    try { window.__dsLgApplyLiveParams?.(p); } catch {}
    try { window.__dsHarmonyApplyLiveParams?.(p); } catch {}
    return p;
  };

  applyLiveTuneRuntime(THEME.liveParams || DEFAULT_LIVE_PARAMS);
  window[STATE_KEY].applyOptics = (styleRevision, artKey, themeId, revision, params) => {
    const state = window[STATE_KEY];
    if (window[DISABLED_KEY] || state?.installToken !== installToken ||
      styleRevision !== STYLE_REVISION || artKey !== THEME.artKey || themeId !== THEME.id) return false;
    state.revision = revision;
    if (JSON.stringify(params) !== JSON.stringify(window.__dsCurrentLiveParams)) {
      applyLiveTuneRuntime(params);
    }
    return true;
  };


  // === Persistent Shadow DOM Floating Crystal Studio Plugin v2 (#codex-dream-skin-plugin-host) ===
  const mountDreamSkinPluginStudio = () => {
    const HOST_ID = "codex-dream-skin-plugin-host";
    const studioKey = `${PAYLOAD_REVISION}:v3`;
    if (window.__dsPluginRuntime && window.__dsPluginRuntime.studioKey !== studioKey) {
      try { window.__dsPluginTeardown?.(); } catch {}
    }
    const VALID_ZONES = ["global", ...LIQUID_ZONES];
    const initialUi = THEME.pluginUi || {};
    const runtime = window.__dsPluginRuntime || {
      studioKey,
      open: Boolean(initialUi.panelOpen),
      pillMode: initialUi.pillMode === "pill" ? "pill" : "orb",
      minimized: initialUi.pillMinimized !== undefined ? Boolean(initialUi.pillMinimized) : (initialUi.pillMode !== "pill"),
      activeTab: ["themes", "tune", "auto"].includes(initialUi.activeTab) ? initialUi.activeTab : "themes",
      selectedZone: VALID_ZONES.includes(initialUi.selectedZone) ? initialUi.selectedZone : "global",
      posX: typeof initialUi.posX === "number" && Number.isFinite(initialUi.posX) ? Math.max(0, Math.min(1, initialUi.posX)) : 1,
      posY: typeof initialUi.posY === "number" && Number.isFinite(initialUi.posY) ? Math.max(0, Math.min(1, initialUi.posY)) : 1,
      barePreview: false,
      filterKind: "all",
      search: "",
      selectedPresetId: null,
      busyTheme: null,
      state: null,
      rpcSeq: 0,
      pendingRpc: new Map(),
      debounceCommit: 0,
      keyHandler: null,
      resizeHandler: null,
      thumbQueueRunning: false,
      thumbHydrated: new Set(),
      activeFlipAnim: null,
      inited: false,
    };
    if (!Number.isFinite(runtime.posX)) runtime.posX = 1;
    if (!Number.isFinite(runtime.posY)) runtime.posY = 1;
    if (runtime.pillMode !== "pill" && runtime.pillMode !== "orb") runtime.pillMode = "orb";
    runtime.studioKey = studioKey;
    window.__dsPluginRuntime = runtime;

    window.__dsPluginResolveRpc = (reqId, result) => {
      const entry = runtime.pendingRpc.get(reqId);
      if (!entry) return;
      runtime.pendingRpc.delete(reqId);
      clearTimeout(entry.timer);
      entry.resolve(result);
    };

    const callRpc = (action, args = {}) => new Promise((resolve) => {
      if (typeof window.__dsPluginRpc !== "function") {
        resolve({ ok: false, offline: true });
        return;
      }
      const reqId = `dsrpc_${Date.now()}_${++runtime.rpcSeq}`;
      const timer = setTimeout(() => {
        runtime.pendingRpc.delete(reqId);
        resolve({ ok: false, timeout: true });
      }, 15000);
      runtime.pendingRpc.set(reqId, { resolve, timer });
      try {
        window.__dsPluginRpc(JSON.stringify({ reqId, action, args }));
      } catch {
        runtime.pendingRpc.delete(reqId);
        clearTimeout(timer);
        resolve({ ok: false });
      }
    });

    let host = document.getElementById(HOST_ID);
    let shadow = host?.shadowRoot || null;
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("data-dream-skin-plugin", "1");
      shadow = host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(host);
    }

    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => (
      ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "\"" ? "&quot;" : "&#39;"
    ));

    const SAFE_X = 14;
    const SAFE_TOP = 44;
    const SAFE_BOTTOM = 14;
    const getBounds = (w, h) => ({
      minX: SAFE_X,
      maxX: Math.max(SAFE_X, window.innerWidth - w - SAFE_X),
      minY: SAFE_TOP,
      maxY: Math.max(SAFE_TOP, window.innerHeight - h - SAFE_BOTTOM),
    });
    const fracToPx = (fx, fy, w, h) => {
      const b = getBounds(w, h);
      const sx = Number.isFinite(fx) ? fx : 1;
      const sy = Number.isFinite(fy) ? fy : 1;
      return {
        x: Math.round(b.minX + Math.max(0, Math.min(1, sx)) * (b.maxX - b.minX)),
        y: Math.round(b.minY + Math.max(0, Math.min(1, sy)) * (b.maxY - b.minY)),
      };
    };
    const pxToFrac = (x, y, w, h) => {
      const b = getBounds(w, h);
      return {
        posX: b.maxX > b.minX ? Math.max(0, Math.min(1, (x - b.minX) / (b.maxX - b.minX))) : 1,
        posY: b.maxY > b.minY ? Math.max(0, Math.min(1, (y - b.minY) / (b.maxY - b.minY))) : 1,
      };
    };

    const persistUi = () => {
      callRpc("setUiState", {
        ui: {
          panelOpen: runtime.open,
          pillMode: runtime.pillMode,
          pillMinimized: runtime.pillMode === "orb",
          activeTab: runtime.activeTab,
          selectedZone: runtime.selectedZone,
          posX: Number(runtime.posX.toFixed(4)),
          posY: Number(runtime.posY.toFixed(4)),
        },
      });
    };

    // Snell SVG map generator inside Shadow DOM so both Orb & Drawer have real edge refraction!
    const SVG_NS = "http://www.w3.org/2000/svg";
    const XLINK_NS = "http://www.w3.org/1999/xlink";
    const buildStudioLensUrl = (qw, qh, qr, qb) => {
      const c = document.createElement("canvas");
      const maxD = 160;
      const asp = qw / Math.max(1, qh);
      const cw = asp >= 1 ? Math.min(maxD, qw) : Math.max(24, Math.round(Math.min(maxD, qh) * asp));
      const ch = asp >= 1 ? Math.max(24, Math.round(cw / asp)) : Math.min(maxD, qh);
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext("2d");
      if (!ctx) return "";
      const img = ctx.createImageData(cw, ch);
      const d = img.data;
      const hw = cw * 0.5;
      const hh = ch * 0.5;
      const sc = cw / Math.max(1, qw);
      const cr = Math.max(2, Math.min(qr * sc, hw - 1, hh - 1));
      const bez = Math.max(3, Math.min(qb * sc, hw, hh));
      for (let y = 0; y < ch; y++) {
        const py = y + 0.5 - hh;
        const ay = Math.abs(py);
        for (let x = 0; x < cw; x++) {
          const px = x + 0.5 - hw;
          const ax = Math.abs(px);
          const qx = ax - (hw - cr);
          const qy = ay - (hh - cr);
          const ox = qx > 0 ? qx : 0;
          const oy = qy > 0 ? qy : 0;
          const outD = Math.hypot(ox, oy);
          const sdf = outD + Math.min(Math.max(qx, qy), 0) - cr;
          const idx = (y * cw + x) * 4;
          if (sdf > 0 || -sdf >= bez) {
            d[idx] = 128; d[idx + 1] = 128; d[idx + 2] = 128; d[idx + 3] = 255;
            continue;
          }
          let nx = 0;
          let ny = 0;
          if (ox > 0 || oy > 0) {
            const inv = 1 / Math.max(1e-5, outD);
            nx = (px >= 0 ? 1 : -1) * ox * inv;
            ny = (py >= 0 ? 1 : -1) * oy * inv;
          } else if (qx > qy) {
            nx = px >= 0 ? 1 : -1;
          } else {
            ny = py >= 0 ? 1 : -1;
          }
          const t = (-sdf) / bez;
          const edgeFade = Math.min(1, t / 0.14);
          const mag = Math.pow(1 - t, 1.65) * (0.38 + 0.62 * edgeFade) * 0.88;
          d[idx] = Math.max(0, Math.min(255, Math.round(127.5 - nx * mag * 127.5)));
          d[idx + 1] = Math.max(0, Math.min(255, Math.round(127.5 - ny * mag * 127.5)));
          d[idx + 2] = 128;
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL("image/png");
    };

    const ensureScaffold = () => {
      if (shadow.getElementById("ds-studio-root") && shadow.querySelector("style[data-ds-studio-style]")) return;
      shadow.innerHTML = "";

      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-ds-studio-style", "1");
      shadow.appendChild(styleEl);

      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;overflow:hidden;";
      const defs = document.createElementNS(SVG_NS, "defs");
      for (const [id, scale, w, h, r, b] of [
        ["ds-studio-lens-orb", 20, 40, 40, 20, 12],
        ["ds-studio-lens-pill", 20, 152, 34, 17, 11],
        ["ds-studio-lens-drawer", 22, 376, 510, 24, 18],
      ]) {
        const f = document.createElementNS(SVG_NS, "filter");
        f.id = id;
        f.setAttribute("x", "0%");
        f.setAttribute("y", "0%");
        f.setAttribute("width", "100%");
        f.setAttribute("height", "100%");
        f.setAttribute("filterUnits", "objectBoundingBox");
        f.setAttribute("color-interpolation-filters", "sRGB");
        const feImg = document.createElementNS(SVG_NS, "feImage");
        feImg.setAttribute("result", "snell");
        feImg.setAttribute("x", "0");
        feImg.setAttribute("y", "0");
        feImg.setAttribute("width", "100%");
        feImg.setAttribute("height", "100%");
        feImg.setAttribute("preserveAspectRatio", "none");
        const url = buildStudioLensUrl(w, h, r, b);
        feImg.setAttribute("href", url);
        feImg.setAttributeNS(XLINK_NS, "href", url);
        const feDisp = document.createElementNS(SVG_NS, "feDisplacementMap");
        feDisp.setAttribute("in", "SourceGraphic");
        feDisp.setAttribute("in2", "snell");
        feDisp.setAttribute("scale", String(scale));
        feDisp.setAttribute("xChannelSelector", "R");
        feDisp.setAttribute("yChannelSelector", "G");
        f.append(feImg, feDisp);
        defs.appendChild(f);
      }
      svg.appendChild(defs);
      shadow.appendChild(svg);

      const rootEl = document.createElement("div");
      rootEl.id = "ds-studio-root";
      rootEl.className = "wrap";
      rootEl.innerHTML = `
        <button type="button" class="fab" id="ds-fab" title="JBY Liquid Glass · Codex（拖拽移动 · 点击展开）">
          <span class="fab-orb-ico" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M12 2.5L19.5 9.2L12 21.5L4.5 9.2L12 2.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
              <path d="M4.5 9.2H19.5M12 2.5L9.2 9.2L12 21.5L14.8 9.2L12 2.5Z" stroke="currentColor" stroke-width="1.2" opacity="0.72" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="fab-pill-body">
            <span class="fab-dot"></span>
            <span class="fab-label">皮肤</span>
            <span class="fab-badge" id="ds-fab-badge"></span>
          </span>
        </button>

        <section class="drawer" id="ds-drawer" aria-label="JBY Liquid Glass · Codex 工作室" hidden>
          <header class="drawer-head" id="ds-drag-handle">
            <div class="head-left">
              <div class="orb-mark" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2.5L19.5 9.2L12 21.5L4.5 9.2L12 2.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="title-col">
                <div class="title">JBY Liquid Glass · Codex</div>
                <div class="sub" id="ds-active-sub"></div>
              </div>
            </div>
            <div class="head-actions">
              <button type="button" class="mini-btn" id="ds-bare-toggle">对比原版</button>
              <button type="button" class="icon-btn" id="ds-close-drawer" title="缩小为悬浮圆钮">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12H19M19 12L14 7M19 12L14 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </header>

          <nav class="tabs" id="ds-tabs">
            <div class="tab-slider" id="ds-tab-slider"></div>
            <button type="button" class="tab" data-tab="themes">主题库</button>
            <button type="button" class="tab" data-tab="tune">实时调校</button>
            <button type="button" class="tab" data-tab="auto">形态与守护</button>
          </nav>

          <div class="body">
            <div class="view" data-view="themes">
              <div class="search-row">
                <input type="text" class="search" id="ds-search" placeholder="搜索皮肤、主题或编号..." autocomplete="off" spellcheck="false" />
                <div class="filter-chips" id="ds-filter-chips">
                  <button type="button" class="chip" data-kind="all">全部</button>
                  <button type="button" class="chip" data-kind="light">浅色</button>
                  <button type="button" class="chip" data-kind="dark">深色</button>
                </div>
              </div>
              <div class="theme-grid" id="ds-theme-grid"></div>
            </div>

            <div class="view" data-view="tune" hidden>
              <div class="zone-card preset-card">
                <div class="zone-head">
                  <span class="zone-title">光学预设 · <strong id="ds-preset-status">自定义</strong></span>
                  <button type="button" class="mini-reset" id="ds-preset-del" hidden>删除</button>
                </div>
                <div class="zone-chips" id="ds-preset-list"></div>
                <div class="preset-bar">
                  <input type="text" class="preset-input" id="ds-preset-name" placeholder="预设名（留空自动命名为 预设 N）" autocomplete="off" spellcheck="false" />
                  <button type="button" class="chip" id="ds-preset-save">保存预设</button>
                  <button type="button" class="chip" id="ds-preset-default">设为默认</button>
                </div>
              </div>
              <div class="zone-card">
                <div class="zone-head">
                  <span class="zone-title">光学分区 · <strong id="ds-zone-status">全部全局</strong></span>
                  <button type="button" class="mini-reset" id="ds-reset-zone" hidden>重置本区</button>
                </div>
                <div class="zone-chips" id="ds-zone-bar">
                  <button type="button" class="chip" data-zone="global">全部</button>
                  <button type="button" class="chip" data-zone="composer">输入栏</button>
                  <button type="button" class="chip" data-zone="slash">斜杠菜单</button>
                  <button type="button" class="chip" data-zone="attach">加号菜单</button>
                  <button type="button" class="chip" data-zone="writing">输出框</button>
                  <button type="button" class="chip" data-zone="sidebar">侧边栏</button>
                  <button type="button" class="chip" data-zone="cards">设置·卡片</button>
                  <button type="button" class="chip" data-zone="popover">弹窗·胶囊</button>
                </div>
              </div>
              <div class="tune-group">
                <div id="ds-menu-preview-area" class="menu-preview-area" hidden>
                  <slot name="menu-preview"></slot>
                </div>
                <div class="slider-row">
                  <div class="slider-head"><span>玻璃通透度</span><span class="val" id="ds-val-transparency">80%</span></div>
                  <input type="range" min="15" max="100" step="1" data-tune="transparency" />
                </div>
                <div class="slider-row">
                  <div class="slider-head"><span>Snell 边缘折射</span><span class="val" id="ds-val-refractScale">100%</span></div>
                  <input type="range" min="0" max="200" step="5" data-tune="refractScale" />
                </div>
                <div class="slider-row">
                  <div class="slider-head"><span>光学雾度</span><span class="val" id="ds-val-blurScale">100%</span></div>
                  <input type="range" min="0" max="200" step="5" data-tune="blurScale" />
                </div>
                <div class="slider-row">
                  <div class="slider-head"><span>棱镜倒角高光</span><span class="val" id="ds-val-rimIntensity">100%</span></div>
                  <input type="range" min="0" max="200" step="5" data-tune="rimIntensity" />
                </div>
                <div class="slider-row">
                  <div class="slider-head"><span>字体字重微调</span><span class="val" id="ds-val-fontWeightBoost">0</span></div>
                  <input type="range" min="-80" max="150" step="10" data-tune="fontWeightBoost" />
                </div>
              </div>

              <div class="row-card">
                <span>鸿蒙 7 物理动效</span>
                <div class="seg-group" id="ds-motion-seg">
                  <button type="button" class="chip" data-motion="spring">物理弹簧</button>
                  <button type="button" class="chip" data-motion="lite">轻量</button>
                  <button type="button" class="chip" data-motion="off">关闭</button>
                </div>
              </div>

              <label class="row-card toggle-row">
                <span>触控水滴微粒反馈</span>
                <input type="checkbox" id="ds-particles-toggle" />
              </label>

              <button type="button" class="btn-wide" id="ds-reset-tune">恢复当前皮肤默认参数</button>
            </div>

            <div class="view" data-view="auto" hidden>
              <div class="row-card">
                <span>悬浮球形态</span>
                <div class="seg-group" id="ds-pillmode-seg">
                  <button type="button" class="chip" data-pillmode="orb">晶透圆钮</button>
                  <button type="button" class="chip" data-pillmode="pill">极简胶囊</button>
                </div>
              </div>

              <label class="row-card toggle-row">
                <span>开机自动唤醒并注入皮肤</span>
                <input type="checkbox" id="ds-guard-enabled" />
              </label>
              <label class="row-card toggle-row">
                <span>登录桌面时自动启动 Codex</span>
                <input type="checkbox" id="ds-guard-launch" />
              </label>

              <div class="btn-pair">
                <button type="button" class="btn-wide" id="ds-reapply-btn">立即重绘光学层</button>
                <button type="button" class="btn-wide" data-folder="themes">打开主题目录</button>
              </div>
              <button type="button" class="btn-wide" data-folder="images">打开背景壁纸目录</button>
            </div>
          </div>
        </section>
      `;
      shadow.appendChild(rootEl);
    };

    const syncStyles = () => {
      const styleEl = shadow.querySelector("style[data-ds-studio-style]");
      if (!styleEl) return;
      const isDark = resolvedShell() === "dark";
      const accent = THEME.colors?.accent || (isDark ? "#8aa8ff" : "#4f6df5");
      styleEl.textContent = `
        :host {
          all: initial;
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 2147483000;
          font-family: "Microsoft YaHei UI", "PingFang SC", "Segoe UI", system-ui, sans-serif;
          color-scheme: ${isDark ? "dark" : "light"};
        }
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; border: 0; background: none; color: inherit; }
        input { font-family: inherit; }
        .wrap {
          --acc: ${accent};
          --fg: ${isDark ? "#eef3fb" : "#151d2e"};
          --muted: ${isDark ? "#9daabc" : "#56637b"};
          --rim: ${isDark ? "rgba(255, 255, 255, 0.24)" : "rgba(18, 28, 48, 0.16)"};
          --spec: ${isDark ? "rgba(255, 255, 255, 0.42)" : "rgba(255, 255, 255, 0.96)"};
          --glass-drawer: ${isDark
            ? "linear-gradient(156deg, rgba(22, 27, 42, 0.72), rgba(14, 18, 29, 0.58) 58%, rgba(16, 22, 36, 0.66))"
            : "linear-gradient(156deg, rgba(255, 255, 255, 0.64), rgba(250, 252, 255, 0.42) 56%, rgba(246, 249, 255, 0.52))"};
          --glass-fab: ${isDark
            ? "linear-gradient(150deg, rgba(255, 255, 255, 0.18), rgba(18, 24, 38, 0.34) 60%, rgba(255, 255, 255, 0.10))"
            : "linear-gradient(150deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.06) 56%, rgba(255, 255, 255, 0.18))"};
          --card: ${isDark ? "rgba(255, 255, 255, 0.07)" : "rgba(255, 255, 255, 0.52)"};
          --card-hi: ${isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.80)"};
          position: fixed;
          inset: 0;
          pointer-events: none;
          color: var(--fg);
        }
        .fab {
          pointer-events: auto;
          position: fixed;
          left: 0;
          top: 0;
          height: 38px;
          width: 38px;
          padding: 0;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--fg);
          background: var(--glass-fab);
          border: 1px solid var(--rim);
          backdrop-filter: url(#ds-studio-lens-orb) blur(1.4px) saturate(1.55) brightness(1.03);
          -webkit-backdrop-filter: url(#ds-studio-lens-orb) blur(1.4px) saturate(1.55) brightness(1.03);
          box-shadow: 0 12px 28px -6px rgba(12, 18, 34, ${isDark ? "0.48" : "0.20"}), inset 0 1.5px 1px var(--spec), inset 0 -1px 1px rgba(255,255,255,0.28);
          touch-action: none;
          will-change: transform;
          transition: width 220ms cubic-bezier(0.22, 1.18, 0.36, 1), padding 220ms ease, box-shadow 180ms ease;
        }
        .fab::after, .drawer::after {
          content: "";
          position: absolute;
          inset: 0;
          padding: 1.25px;
          border-radius: inherit;
          pointer-events: none;
          background: linear-gradient(138deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.28) 40%, rgba(255,255,255,0.10) 68%, rgba(255,255,255,0.62) 100%);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        .fab:hover {
          box-shadow: 0 16px 34px -6px rgba(12, 18, 34, ${isDark ? "0.58" : "0.26"}), inset 0 1.5px 1px #fff;
        }
        .fab[data-mode="orb"] .fab-pill-body { display: none; }
        .fab[data-mode="orb"] .fab-orb-ico { display: inline-flex; align-items: center; justify-content: center; }
        .fab[data-mode="pill"] {
          width: auto;
          max-width: 196px;
          height: 34px;
          padding: 0 12px 0 10px;
          backdrop-filter: url(#ds-studio-lens-pill) blur(1.4px) saturate(1.55) brightness(1.03);
          -webkit-backdrop-filter: url(#ds-studio-lens-pill) blur(1.4px) saturate(1.55) brightness(1.03);
        }
        .fab[data-mode="pill"] .fab-orb-ico { display: none; }
        .fab[data-mode="pill"] .fab-pill-body {
          display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 560; white-space: nowrap;
        }
        .fab-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--acc); box-shadow: 0 0 8px var(--acc); flex: 0 0 auto; }
        .fab-badge {
          max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-size: 11px; font-weight: 500; color: var(--muted); padding: 2px 7px; border-radius: 999px;
          background: ${isDark ? "rgba(255,255,255,0.10)" : "rgba(18,28,48,0.07)"};
        }
        .fab[hidden], .drawer[hidden], .view[hidden] { display: none !important; }

        .drawer {
          pointer-events: auto;
          position: fixed;
          left: 0;
          top: 0;
          width: min(382px, calc(100vw - 28px));
          height: min(524px, calc(100vh - 68px));
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: var(--fg);
          background: var(--glass-drawer);
          border: 1px solid var(--rim);
          backdrop-filter: url(#ds-studio-lens-drawer) blur(18px) saturate(1.52) brightness(1.02);
          -webkit-backdrop-filter: url(#ds-studio-lens-drawer) blur(18px) saturate(1.52) brightness(1.02);
          box-shadow: 0 28px 64px -12px rgba(10, 16, 30, ${isDark ? "0.68" : "0.28"}), inset 0 1.5px 1px var(--spec);
          will-change: transform;
        }
        .drawer-head {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 13px 14px 10px; cursor: grab; touch-action: none;
          border-bottom: 1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(18,28,48,0.07)"};
        }
        .drawer-head:active { cursor: grabbing; }
        .head-left { display: flex; align-items: center; gap: 9px; min-width: 0; }
        .orb-mark {
          width: 28px; height: 28px; border-radius: 50%; flex: 0 0 auto;
          display: grid; place-items: center;
          background: var(--card-hi); border: 1px solid var(--rim); box-shadow: inset 0 1px 0 var(--spec);
        }
        .title-col { min-width: 0; }
        .title { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
        .sub { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
        .head-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
        .mini-btn, .icon-btn {
          height: 27px; border-radius: 999px; font-size: 11px; font-weight: 550;
          background: var(--card); border: 1px solid var(--rim); box-shadow: inset 0 1px 0 var(--spec);
          transition: transform 140ms cubic-bezier(0.22, 1.25, 0.36, 1), background-color 140ms ease;
        }
        .mini-btn { padding: 0 10px; }
        .mini-btn.active { background: var(--acc); color: #fff; border-color: transparent; }
        .icon-btn { width: 27px; display: grid; place-items: center; }
        .mini-btn:hover, .icon-btn:hover { background: var(--card-hi); transform: translateY(-1px); }
        .mini-btn:active, .icon-btn:active { transform: scale(0.94); }

        .tabs {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          margin: 10px 14px 4px;
          padding: 3px;
          border-radius: 14px;
          background: ${isDark ? "rgba(0,0,0,0.22)" : "rgba(18,28,48,0.06)"};
          border: 1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(18,28,48,0.06)"};
        }
        .tab-slider {
          position: absolute; top: 3px; bottom: 3px; left: 3px;
          width: calc((100% - 6px) / 3);
          border-radius: 11px;
          background: var(--card-hi);
          border: 1px solid var(--rim);
          box-shadow: 0 4px 12px -3px rgba(12,18,34,0.16), inset 0 1px 0 var(--spec);
          transition: transform 240ms cubic-bezier(0.22, 1.22, 0.36, 1);
          pointer-events: none;
        }
        .tab {
          position: relative; z-index: 1; height: 28px; font-size: 12px; font-weight: 560;
          color: var(--muted); transition: color 140ms ease;
        }
        .tab[aria-selected="true"] { color: var(--fg); font-weight: 620; }

        .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 10px 14px 14px; scrollbar-width: thin; }
        .search-row { display: flex; flex-direction: column; gap: 7px; margin-bottom: 10px; }
        .search {
          width: 100%; height: 32px; padding: 0 11px; border-radius: 11px; font-size: 12px;
          color: var(--fg); background: var(--card); border: 1px solid var(--rim); outline: none;
          transition: border-color 140ms ease, background-color 140ms ease;
        }
        .search:focus { border-color: var(--acc); background: var(--card-hi); }
        .filter-chips, .seg-group { display: flex; align-items: center; gap: 5px; }
        .chip {
          height: 24px; padding: 0 10px; border-radius: 999px; font-size: 11px; font-weight: 540;
          color: var(--muted); background: var(--card); border: 1px solid var(--rim);
          transition: all 140ms ease;
        }
        .chip.active { background: var(--acc); color: #fff; border-color: transparent; box-shadow: 0 4px 10px -2px rgba(79,109,245,0.38); }

        .theme-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
        .theme-card {
          position: relative; display: flex; flex-direction: column; overflow: hidden; text-align: left;
          border-radius: 15px; background: var(--card); border: 1px solid var(--rim);
          box-shadow: inset 0 1px 0 var(--spec);
          transition: transform 180ms cubic-bezier(0.22, 1.24, 0.36, 1), border-color 160ms ease, box-shadow 160ms ease;
        }
        .theme-card:hover { transform: translateY(-2px) scale(1.012); border-color: rgba(255,255,255,0.75); box-shadow: 0 10px 22px -8px rgba(14,20,38,0.28); }
        .theme-card:active { transform: scale(0.975); }
        .theme-card.active { border: 1.5px solid var(--acc); box-shadow: 0 0 0 2px rgba(79,109,245,0.18), inset 0 1px 0 var(--spec); }
        .theme-card[hidden] { display: none !important; }
        .card-thumb {
          position: relative; width: 100%; aspect-ratio: 16 / 10; overflow: hidden;
          background: var(--card-fallback);
        }
        .thumb-img {
          position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
          opacity: 0; transition: opacity 260ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .thumb-img.loaded { opacity: 1; }
        .theme-card:hover .thumb-img.loaded { transform: scale(1.045); }
        .thumb-scrim {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(10,14,26,0.06) 0%, rgba(10,14,26,0) 45%, rgba(10,14,26,0.52) 100%);
          pointer-events: none;
        }
        .thumb-tag {
          position: absolute; top: 6px; left: 6px; padding: 2px 6px; border-radius: 999px;
          font-size: 9.5px; font-weight: 600; color: #fff; letter-spacing: 0.01em;
          background: rgba(14, 18, 30, 0.44); border: 1px solid rgba(255,255,255,0.28);
          backdrop-filter: blur(6px);
        }
        .thumb-tag.lg { background: rgba(45, 92, 220, 0.52); border-color: rgba(200,224,255,0.55); }
        .thumb-active {
          position: absolute; top: 6px; right: 6px; padding: 2px 6px; border-radius: 999px;
          font-size: 9.5px; font-weight: 650; color: #fff; background: var(--acc);
          box-shadow: 0 3px 10px rgba(0,0,0,0.28);
        }
        .card-meta { padding: 7px 8px 8px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .card-title { font-size: 11.5px; font-weight: 620; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-sub { font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .tune-group { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
        .menu-preview-area {
          padding: 8px; border-radius: 16px;
          background: var(--dream-skin-art) center / cover no-repeat, var(--card);
        }
        .zone-card {
          padding: 9px 10px; border-radius: 14px; background: var(--card); border: 1px solid var(--rim);
          box-shadow: inset 0 1px 0 var(--spec); margin-bottom: 10px;
        }
        .zone-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; font-size: 11.5px; color: var(--muted); }
        .zone-title strong { color: var(--acc); font-weight: 640; }
        .zone-chips { display: flex; flex-wrap: wrap; gap: 5px; }
        .zone-chips .chip { position: relative; font-size: 10.5px; height: 22px; padding: 0 9px; }
        .zone-chips .chip.customized::after {
          content: ""; position: absolute; top: -2px; right: -2px; width: 6px; height: 6px;
          border-radius: 50%; background: var(--acc); border: 1px solid #fff;
        }
        .mini-reset {
          font-size: 10.5px; font-weight: 580; padding: 2px 8px; border-radius: 999px;
          background: var(--card-hi); border: 1px solid var(--rim); color: var(--fg);
        }
        .mini-reset[hidden] { display: none !important; }
        .preset-bar { display: flex; align-items: center; gap: 5px; margin-top: 7px; }
        .preset-input {
          flex: 1 1 auto; min-width: 0; height: 24px; padding: 0 8px; border-radius: 999px; font-size: 11px;
          color: var(--fg); background: var(--card-hi); border: 1px solid var(--rim); outline: none;
        }
        .preset-input:focus { border-color: var(--acc); }
        .preset-bar .chip { flex: 0 0 auto; font-size: 10.5px; height: 24px; padding: 0 8px; }
        .slider-row {
          padding: 9px 11px; border-radius: 14px; background: var(--card); border: 1px solid var(--rim);
          box-shadow: inset 0 1px 0 var(--spec);
        }
        .slider-head { display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 560; margin-bottom: 6px; }
        .slider-head .val { font-variant-numeric: tabular-nums; color: var(--acc); font-weight: 640; }
        input[type="range"] { width: 100%; accent-color: var(--acc); height: 4px; cursor: pointer; }
        .row-card {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 10px 11px; border-radius: 14px; background: var(--card); border: 1px solid var(--rim);
          box-shadow: inset 0 1px 0 var(--spec); font-size: 12px; font-weight: 560; margin-bottom: 9px;
        }
        .toggle-row { cursor: pointer; }
        .toggle-row input { width: 16px; height: 16px; accent-color: var(--acc); cursor: pointer; }
        .btn-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
        .btn-wide {
          width: 100%; height: 34px; padding: 0 12px; border-radius: 12px; font-size: 12px; font-weight: 580;
          background: var(--card); border: 1px solid var(--rim); box-shadow: inset 0 1px 0 var(--spec);
          transition: transform 140ms cubic-bezier(0.22, 1.24, 0.36, 1), background-color 140ms ease;
        }
        .btn-wide:hover { background: var(--card-hi); transform: translateY(-1px); }
        .btn-wide:active { transform: scale(0.97); }
      `;
    };

    ensureScaffold();
    syncStyles();

    // The slotted light-DOM preview uses the same styles and SVG lens as the actual menu.
    let menuPreview = host.querySelector('[data-dream-lg-menu-preview]');
    if (!menuPreview) {
      menuPreview = document.createElement('div');
      menuPreview.slot = 'menu-preview';
      menuPreview.setAttribute('data-dream-lg-menu-preview', '');
      host.appendChild(menuPreview);
    }

    const fab = shadow.getElementById("ds-fab");
    const drawer = shadow.getElementById("ds-drawer");
    const dragHandle = shadow.getElementById("ds-drag-handle");
    const themeGrid = shadow.getElementById("ds-theme-grid");

    let curFabPos = { x: 0, y: 0 };
    let curDrawerPos = { x: 0, y: 0 };
    const getFabDims = () => {
      if (runtime.pillMode === "orb") return { w: 38, h: 38 };
      const r = fab.getBoundingClientRect();
      return { w: r.width > 40 ? r.width : 156, h: 34 };
    };
    const getDrawerDims = () => ({
      w: Math.min(382, Math.max(280, window.innerWidth - 28)),
      h: Math.min(524, Math.max(320, window.innerHeight - 68)),
    });

    const applyFabTransform = (x, y, scale = 1) => {
      curFabPos = { x, y };
      fab.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale})`;
    };
    const applyDrawerTransform = (x, y, scale = 1) => {
      curDrawerPos = { x, y };
      drawer.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale})`;
    };

    const syncPositions = () => {
      const fd = getFabDims();
      const fp = fracToPx(runtime.posX, runtime.posY, fd.w, fd.h);
      applyFabTransform(fp.x, fp.y);

      const dd = getDrawerDims();
      // Anchor Drawer near Orb so morph feels physically attached, clamped inside safe viewport!
      const fabCenterX = fp.x + fd.w * 0.5;
      const fabCenterY = fp.y + fd.h * 0.5;
      const rawDx = fabCenterX > window.innerWidth * 0.5 ? fp.x + fd.w - dd.w : fp.x;
      const rawDy = fabCenterY > window.innerHeight * 0.5 ? fp.y + fd.h - dd.h : fp.y;
      const db = getBounds(dd.w, dd.h);
      const dx = Math.max(db.minX, Math.min(db.maxX, rawDx));
      const dy = Math.max(db.minY, Math.min(db.maxY, rawDy));
      applyDrawerTransform(dx, dy);
    };

    // VelocitySettleMotion (HarmonyOS damped release glide + viewport boundary clamp)
    let glideRaf = 0;
    const stopGlide = () => { if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = 0; } };
    const startGlide = (x0, y0, vx0, vy0, dims, applyFn, onSettle) => {
      stopGlide();
      let x = x0;
      let y = y0;
      let vx = Math.max(-1600, Math.min(1600, vx0));
      let vy = Math.max(-1600, Math.min(1600, vy0));
      let lastT = performance.now();
      const b = getBounds(dims.w, dims.h);
      const step = (now) => {
        glideRaf = 0;
        const dt = Math.min(0.032, Math.max(0.004, (now - lastT) / 1000));
        lastT = now;
        const damp = Math.exp(-8.5 * dt);
        vx *= damp;
        vy *= damp;
        x += vx * dt;
        y += vy * dt;
        if (x < b.minX) { x = b.minX; vx = Math.abs(vx) * 0.25; }
        else if (x > b.maxX) { x = b.maxX; vx = -Math.abs(vx) * 0.25; }
        if (y < b.minY) { y = b.minY; vy = Math.abs(vy) * 0.25; }
        else if (y > b.maxY) { y = b.maxY; vy = -Math.abs(vy) * 0.25; }
        applyFn(x, y, 1);
        if (Math.hypot(vx, vy) > 18) {
          glideRaf = requestAnimationFrame(step);
        } else {
          const cx = Math.max(b.minX, Math.min(b.maxX, x));
          const cy = Math.max(b.minY, Math.min(b.maxY, y));
          applyFn(cx, cy, 1);
          onSettle(cx, cy);
        }
      };
      if (Math.hypot(vx, vy) > 40) {
        glideRaf = requestAnimationFrame(step);
      } else {
        const cx = Math.max(b.minX, Math.min(b.maxX, x));
        const cy = Math.max(b.minY, Math.min(b.maxY, y));
        applyFn(cx, cy, 1);
        onSettle(cx, cy);
      }
    };

    const bindDraggable = (handleEl, isFab) => {
      handleEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (!isFab && e.target.closest("button, input, a")) return;
        e.preventDefault();
        stopGlide();
        const dims = isFab ? getFabDims() : getDrawerDims();
        const startPos = isFab ? { ...curFabPos } : { ...curDrawerPos };
        const x0 = e.clientX;
        const y0 = e.clientY;
        const samples = [{ t: performance.now(), x: x0, y: y0 }];
        let moved = false;
        const b = getBounds(dims.w, dims.h);
        try { handleEl.setPointerCapture?.(e.pointerId); } catch {}

        const rubber = (val, min, max) => {
          if (val < min) return min - Math.pow(min - val, 0.72);
          if (val > max) return max + Math.pow(val - max, 0.72);
          return val;
        };

        const onMove = (ev) => {
          const dx = ev.clientX - x0;
          const dy = ev.clientY - y0;
          if (!moved && Math.hypot(dx, dy) > 5) moved = true;
          if (!moved) return;
          const nx = rubber(startPos.x + dx, b.minX, b.maxX);
          const ny = rubber(startPos.y + dy, b.minY, b.maxY);
          const now = performance.now();
          samples.push({ t: now, x: ev.clientX, y: ev.clientY });
          while (samples.length > 5) samples.shift();
          if (isFab) applyFabTransform(nx, ny, 1.05);
          else applyDrawerTransform(nx, ny, 1);
        };

        const onEnd = (ev) => {
          window.removeEventListener("pointermove", onMove, true);
          window.removeEventListener("pointerup", onEnd, true);
          window.removeEventListener("pointercancel", onEnd, true);
          try { handleEl.releasePointerCapture?.(e.pointerId); } catch {}
          if (!moved) {
            if (isFab) setPanelOpen(true, true);
            return;
          }
          const newest = samples[samples.length - 1];
          const oldest = samples[0];
          const dt = Math.max(0.016, (newest.t - oldest.t) / 1000);
          const vx = (ev.clientX - oldest.x) / dt;
          const vy = (ev.clientY - oldest.y) / dt;
          const latestPos = isFab ? curFabPos : curDrawerPos;
          startGlide(latestPos.x, latestPos.y, vx, vy, dims, isFab ? applyFabTransform : applyDrawerTransform, (fx, fy) => {
            const f = pxToFrac(fx, fy, dims.w, dims.h);
            runtime.posX = f.posX;
            runtime.posY = f.posY;
            syncPositions();
            persistUi();
          });
        };

        window.addEventListener("pointermove", onMove, true);
        window.addEventListener("pointerup", onEnd, true);
        window.addEventListener("pointercancel", onEnd, true);
      });
    };

    const setPanelOpen = (nextOpen, animate = true) => {
      const reduced = window.__dsCurrentLiveParams?.motionMode === "off" || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      runtime.activeFlipAnim?.cancel();
      runtime.activeFlipAnim = null;
      runtime.open = nextOpen;

      if (!animate || reduced || document.hidden) {
        fab.hidden = nextOpen;
        drawer.hidden = !nextOpen;
        syncPositions();
        persistUi();
        return;
      }

      if (nextOpen) {
        syncPositions();
        const fd = getFabDims();
        const dd = getDrawerDims();
        const startT = `translate3d(${curFabPos.x.toFixed(1)}px, ${curFabPos.y.toFixed(1)}px, 0) scale(${(fd.w / dd.w).toFixed(4)}, ${(fd.h / dd.h).toFixed(4)})`;
        const endT = `translate3d(${curDrawerPos.x.toFixed(1)}px, ${curDrawerPos.y.toFixed(1)}px, 0) scale(1, 1)`;
        fab.hidden = true;
        drawer.hidden = false;
        drawer.style.transformOrigin = "top left";
        let done = false;
        const finishOpen = () => {
          if (done) return;
          done = true;
          runtime.activeFlipAnim = null;
          syncPositions();
        };
        runtime.activeFlipAnim = drawer.animate([
          { transform: startT, borderRadius: "999px", opacity: 0.72 },
          { transform: endT, borderRadius: "24px", opacity: 1 },
        ], { duration: 280, easing: "cubic-bezier(0.22, 1.18, 0.36, 1)" });
        runtime.activeFlipAnim.onfinish = finishOpen;
        setTimeout(finishOpen, 320);
      } else {
        syncPositions();
        const fd = getFabDims();
        const dd = getDrawerDims();
        const startT = `translate3d(${curDrawerPos.x.toFixed(1)}px, ${curDrawerPos.y.toFixed(1)}px, 0) scale(1, 1)`;
        const endT = `translate3d(${curFabPos.x.toFixed(1)}px, ${curFabPos.y.toFixed(1)}px, 0) scale(${(fd.w / dd.w).toFixed(4)}, ${(fd.h / dd.h).toFixed(4)})`;
        drawer.style.transformOrigin = "top left";
        let done = false;
        const finishClose = () => {
          if (done) return;
          done = true;
          runtime.activeFlipAnim = null;
          drawer.hidden = true;
          fab.hidden = false;
          syncPositions();
          fab.animate([
            { transform: `translate3d(${curFabPos.x.toFixed(1)}px, ${curFabPos.y.toFixed(1)}px, 0) scale(0.86)` },
            { transform: `translate3d(${curFabPos.x.toFixed(1)}px, ${curFabPos.y.toFixed(1)}px, 0) scale(1)` },
          ], { duration: 200, easing: "cubic-bezier(0.22, 1.24, 0.36, 1)" });
        };
        runtime.activeFlipAnim = drawer.animate([
          { transform: startT, borderRadius: "24px", opacity: 1 },
          { transform: endT, borderRadius: "999px", opacity: 0.15 },
        ], { duration: 200, easing: "cubic-bezier(0.32, 0, 0.28, 1)" });
        runtime.activeFlipAnim.onfinish = finishClose;
        setTimeout(finishClose, 240);
      }
      persistUi();
    };

    // Incremental Card Renderer & OffscreenCanvas Hardware Thumbnail Cache Pipeline
    const cardEls = new Map();
    const hydrateQueue = [];

    const hydrateNextThumb = async () => {
      if (runtime.thumbQueueRunning) return;
      runtime.thumbQueueRunning = true;
      try {
        while (hydrateQueue.length > 0) {
          const item = hydrateQueue.shift();
          if (!item || !item.thumbKey || runtime.thumbHydrated.has(item.folder)) continue;
          runtime.thumbHydrated.add(item.folder);
          const card = cardEls.get(item.folder);
          if (!card) continue;
          const imgEl = card.querySelector(".thumb-img");
          if (!imgEl || imgEl.classList.contains("loaded")) continue;

          const res = await callRpc("getThemeThumbSource", { folder: item.folder });
          if (!res?.ok || !res.dataUrl) continue;

          try {
            const srcImg = new Image();
            srcImg.decoding = "async";
            await new Promise((resolve, reject) => {
              srcImg.onload = resolve;
              srcImg.onerror = reject;
              srcImg.src = res.dataUrl;
            });
            if (typeof srcImg.decode === "function") {
              try { await srcImg.decode(); } catch {}
            }
            const imgW = srcImg.naturalWidth || 1;
            const imgH = srcImg.naturalHeight || 1;
            const tw = 280;
            const th = 175;
            const srcAR = imgW / Math.max(1, imgH);
            const dstAR = tw / th;
            let sw = imgW;
            let sh = imgH;
            let sx = 0;
            let sy = 0;
            const fx = Math.max(0, Math.min(1, Number(item.focusX ?? 0.5)));
            const fy = Math.max(0, Math.min(1, Number(item.focusY ?? 0.45)));
            if (srcAR > dstAR) {
              sw = Math.round(imgH * dstAR);
              sx = Math.round((imgW - sw) * fx);
            } else {
              sh = Math.round(imgW / dstAR);
              sy = Math.round((imgH - sh) * fy);
            }
            let thumbDataUrl = "";
            if (typeof OffscreenCanvas === "function") {
              const oc = new OffscreenCanvas(tw, th);
              const octx = oc.getContext("2d");
              octx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, tw, th);
              const jpgBlob = await oc.convertToBlob({ type: "image/jpeg", quality: 0.78 });
              thumbDataUrl = await new Promise((resolve) => {
                const fr = new FileReader();
                fr.onloadend = () => resolve(String(fr.result || ""));
                fr.readAsDataURL(jpgBlob);
              });
            } else {
              const c = document.createElement("canvas");
              c.width = tw; c.height = th;
              c.getContext("2d").drawImage(srcImg, sx, sy, sw, sh, 0, 0, tw, th);
              thumbDataUrl = c.toDataURL("image/jpeg", 0.78);
            }
            if (thumbDataUrl) {
              imgEl.src = thumbDataUrl;
              imgEl.classList.add("loaded");
              item.thumb = thumbDataUrl;
              callRpc("saveThemeThumb", { thumbKey: item.thumbKey, dataUrl: thumbDataUrl });
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 20));
        }
      } finally {
        runtime.thumbQueueRunning = false;
      }
    };

    const syncThemeCards = () => {
      const themes = runtime.state?.themes || [];
      const activeFolder = runtime.state?.activeThemeId || THEME.folder || THEME.id;
      const q = runtime.search.trim().toLowerCase();

      for (const t of themes) {
        let card = cardEls.get(t.folder);
        if (!card) {
          card = document.createElement("button");
          card.type = "button";
          card.className = "theme-card";
          card.dataset.folder = t.folder;
          const bg1 = t.colors?.bg || "#dce6f8";
          const bg2 = t.colors?.surface || t.colors?.accent || "#99b4ef";
          const acc = t.colors?.accent || "#4f6df5";
          card.style.setProperty("--card-fallback", `radial-gradient(110% 90% at 25% 20%, ${acc}55 0%, transparent 65%), linear-gradient(145deg, ${bg1}, ${bg2})`);
          card.innerHTML = `
            <div class="card-thumb">
              <img class="thumb-img" alt="" loading="lazy" />
              <div class="thumb-scrim"></div>
              <span class="thumb-tag ${t.isLiquidGlass ? "lg" : ""}">${t.isLiquidGlass ? "液态玻璃" : (t.appearance === "dark" ? "深色" : "浅色")}</span>
              <span class="thumb-active" hidden>使用中</span>
            </div>
            <div class="card-meta">
              <div class="card-title">${esc(t.name)}</div>
              <div class="card-sub">${esc(t.brandSubtitle || (t.appearance === "dark" ? "Dark Theme" : "Light Theme"))}</div>
            </div>
          `;
          card.addEventListener("click", async () => {
            if (runtime.busyTheme) return;
            runtime.busyTheme = t.folder;
            card.style.opacity = "0.72";
            const res = await callRpc("switchTheme", { folder: t.folder });
            runtime.busyTheme = null;
            card.style.opacity = "";
            if (res?.ok) {
              runtime.state = res;
              runtime.barePreview = false;
              renderState();
            }
          });
          cardEls.set(t.folder, card);
          themeGrid.appendChild(card);
        }

        const imgEl = card.querySelector(".thumb-img");
        if (t.thumb && imgEl && !imgEl.classList.contains("loaded")) {
          imgEl.src = t.thumb;
          imgEl.style.objectPosition = `${Math.round((t.focusX ?? 0.5) * 100)}% ${Math.round((t.focusY ?? 0.45) * 100)}%`;
          imgEl.classList.add("loaded");
        } else if (!t.thumb && t.thumbKey && !runtime.thumbHydrated.has(t.folder)) {
          hydrateQueue.push(t);
        }

        const isActive = t.id === activeFolder || t.folder === activeFolder;
        card.classList.toggle("active", isActive);
        const badge = card.querySelector(".thumb-active");
        if (badge) badge.hidden = !isActive;

        const matchKind = runtime.filterKind === "all" || t.appearance === runtime.filterKind;
        const matchText = !q || `${t.name} ${t.id} ${t.folder} ${t.brandSubtitle || ""}`.toLowerCase().includes(q);
        card.hidden = !(matchKind && matchText);
      }

      if (hydrateQueue.length > 0) hydrateNextThumb();
    };

    const renderState = () => {
      const bodyEl = shadow.querySelector(".body");
      const prevScrollTop = bodyEl ? bodyEl.scrollTop : 0;
      syncStyles();
      const s = runtime.state;
      const activeName = s?.activeThemeName || THEME.name || "JBY Liquid Glass";
      fab.dataset.mode = runtime.pillMode === "pill" ? "pill" : "orb";
      shadow.getElementById("ds-fab-badge").textContent = runtime.barePreview ? "原版对比" : activeName;
      shadow.getElementById("ds-active-sub").textContent = runtime.barePreview ? "原版裸眼对比中" : activeName;

      const bareBtn = shadow.getElementById("ds-bare-toggle");
      bareBtn.classList.toggle("active", runtime.barePreview);
      bareBtn.textContent = runtime.barePreview ? "恢复皮肤" : "对比原版";

      const tabIdx = runtime.activeTab === "tune" ? 1 : (runtime.activeTab === "auto" ? 2 : 0);
      shadow.getElementById("ds-tab-slider").style.transform = `translateX(${tabIdx * 100}%)`;
      shadow.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.setAttribute("aria-selected", String(btn.dataset.tab === runtime.activeTab));
      });
      shadow.querySelectorAll("[data-view]").forEach((v) => {
        v.hidden = v.dataset.view !== runtime.activeTab;
      });
      shadow.querySelectorAll("[data-kind]").forEach((c) => {
        c.classList.toggle("active", c.dataset.kind === runtime.filterKind);
      });
      shadow.querySelectorAll("[data-pillmode]").forEach((c) => {
        c.classList.toggle("active", c.dataset.pillmode === runtime.pillMode);
      });

      const ZONE_NAME_MAP = {
        global: "全部全局",
        composer: "对话输入栏",
        slash: "斜杠菜单",
        attach: "加号菜单",
        writing: "气泡·产物",
        sidebar: "左侧边栏",
        cards: "设置·卡片",
        popover: "弹窗·胶囊",
      };
      const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
      const zName = VALID_ZONES.includes(runtime.selectedZone) ? runtime.selectedZone : "global";
      runtime.selectedZone = zName;
      const previewArea = shadow.getElementById("ds-menu-preview-area");
      const previewZone = runtime.open && runtime.activeTab === "tune" && (zName === "slash" || zName === "attach") ? zName : null;
      if (menuPreview.getAttribute("data-dream-lg-menu") !== previewZone) {
        if (previewZone) menuPreview.setAttribute("data-dream-lg-menu", previewZone);
        else menuPreview.removeAttribute("data-dream-lg-menu");
        menuPreview.textContent = previewZone === "attach" ? "实时预览 · 添加文件" : "实时预览 · 斜杠命令";
        previewArea.hidden = !previewZone;
        window.__dsLgQueueOptics?.();
      }
      const zEff = resolveZoneEffective(cur, zName);
      const hasCustomZone = zName !== "global" && Boolean(cur.zones?.[zName] && Object.keys(cur.zones[zName]).length > 0);
      const zStatus = shadow.getElementById("ds-zone-status");
      const zResetBtn = shadow.getElementById("ds-reset-zone");
      if (zStatus) zStatus.textContent = hasCustomZone ? `${ZONE_NAME_MAP[zName]}（独立定制）` : ZONE_NAME_MAP[zName];
      if (zResetBtn) zResetBtn.hidden = !hasCustomZone;
      shadow.querySelectorAll("[data-zone]").forEach((btn) => {
        const bZone = btn.dataset.zone;
        btn.classList.toggle("active", bZone === zName);
        const isCust = bZone !== "global" && Boolean(cur.zones?.[bZone] && Object.keys(cur.zones[bZone]).length > 0);
        btn.classList.toggle("customized", isCust);
      });
      for (const k of ["transparency", "refractScale", "blurScale", "rimIntensity", "fontWeightBoost"]) {
        const inp = shadow.querySelector(`[data-tune="${k}"]`);
        const valEl = shadow.getElementById(`ds-val-${k}`);
        const val = k === "fontWeightBoost" ? (cur.fontWeightBoost ?? 0) : (zEff[k] ?? DEFAULT_LIVE_PARAMS[k]);
        if (inp && shadow.activeElement !== inp) inp.value = String(val);
        if (valEl) valEl.textContent = k === "fontWeightBoost" ? String(val) : `${val}%`;
      }
      const opState = s?.opticalPresets || { defaultPresetId: null, presets: [] };
      const opList = Array.isArray(opState.presets) ? opState.presets : [];
      const pListEl = shadow.getElementById("ds-preset-list");
      const pStatusEl = shadow.getElementById("ds-preset-status");
      const pDelBtn = shadow.getElementById("ds-preset-del");
      if (runtime.selectedPresetId && !opList.some((p) => p.id === runtime.selectedPresetId)) {
        runtime.selectedPresetId = null;
      }
      const activePresetObj = opList.find((p) => p.id === runtime.selectedPresetId) || opList.find((p) => p.id === opState.defaultPresetId) || null;
      if (pStatusEl) {
        pStatusEl.textContent = activePresetObj
          ? (activePresetObj.id === opState.defaultPresetId ? `${activePresetObj.name} · ★默认` : activePresetObj.name)
          : `共 ${opList.length} 项`;
      }
      if (pDelBtn) pDelBtn.hidden = !(runtime.selectedPresetId && opList.some((p) => p.id === runtime.selectedPresetId));
      const presetSig = JSON.stringify({
        def: opState.defaultPresetId || "",
        sel: runtime.selectedPresetId || "",
        items: opList.map((p) => `${p.id}:${p.name}`),
      });
      if (pListEl && (!pListEl.childElementCount || runtime.lastPresetSig !== presetSig)) {
        runtime.lastPresetSig = presetSig;
        pListEl.textContent = "";
        for (const p of opList) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chip";
          if (p.id === runtime.selectedPresetId) btn.classList.add("active");
          btn.textContent = p.id === opState.defaultPresetId ? `★ ${p.name}` : p.name;
          btn.title = p.id === opState.defaultPresetId ? "全局默认预设（新皮肤与双端共用）" : "点击立即应用此预设到当前皮肤";
          btn.addEventListener("click", async () => {
            runtime.selectedPresetId = p.id;
            const applied = applyLiveTuneRuntime(p.params);
            renderState();
            const res = await callRpc("setLiveParams", { themeId: THEME.id, params: applied, commit: true });
            if (res?.ok) {
              runtime.state = res;
              renderState();
            }
          });
          pListEl.appendChild(btn);
        }
      }
      shadow.querySelectorAll("[data-motion]").forEach((c) => {
        c.classList.toggle("active", c.dataset.motion === cur.motionMode);
      });
      const pt = shadow.getElementById("ds-particles-toggle");
      if (pt) pt.checked = cur.particlesEnabled !== false;

      const ge = shadow.getElementById("ds-guard-enabled");
      const glCheckbox = shadow.getElementById("ds-guard-launch");
      if (ge) ge.checked = Boolean(s?.guardConfig?.autoGuardEnabled);
      if (glCheckbox) glCheckbox.checked = Boolean(s?.guardConfig?.autoLaunchCodexOnBoot);

      if (fab.hidden !== runtime.open) fab.hidden = runtime.open;
      if (drawer.hidden !== !runtime.open) drawer.hidden = !runtime.open;
      syncThemeCards();
      syncPositions();
      if (bodyEl && Math.abs(bodyEl.scrollTop - prevScrollTop) > 1) {
        bodyEl.scrollTop = prevScrollTop;
      }
    };

    if (!runtime.inited) {
      runtime.inited = true;
      bindDraggable(fab, true);
      bindDraggable(dragHandle, false);

      shadow.getElementById("ds-close-drawer").addEventListener("click", () => setPanelOpen(false, true));
      shadow.getElementById("ds-bare-toggle").addEventListener("click", async () => {
        runtime.barePreview = !runtime.barePreview;
        if (runtime.barePreview) {
          try { window[STATE_KEY]?.cleanup?.(); } catch {}
          renderState();
        } else {
          renderState();
          const res = await callRpc("reapplySkin", {});
          if (!res?.ok) window[DISABLED_KEY] = false;
        }
      });

      shadow.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          runtime.activeTab = btn.dataset.tab || "themes";
          renderState();
          persistUi();
        });
      });

      shadow.getElementById("ds-search").addEventListener("input", (e) => {
        runtime.search = e.target.value || "";
        syncThemeCards();
      });
      shadow.querySelectorAll("[data-kind]").forEach((btn) => {
        btn.addEventListener("click", () => {
          runtime.filterKind = btn.dataset.kind || "all";
          renderState();
        });
      });

      shadow.querySelectorAll("[data-zone]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const z = btn.dataset.zone || "global";
          runtime.selectedZone = VALID_ZONES.includes(z) ? z : "global";
          renderState();
          persistUi();
        });
      });

      shadow.getElementById("ds-reset-zone")?.addEventListener("click", async () => {
        if (runtime.selectedZone === "global") return;
        const base = window.__dsCurrentLiveParams || { ...DEFAULT_LIVE_PARAMS };
        const nextZones = { ...(base.zones || {}) };
        delete nextZones[runtime.selectedZone];
        const cur = applyLiveTuneRuntime({ ...base, zones: nextZones });
        renderState();
        await callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: true });
      });

      shadow.querySelectorAll("[data-tune]").forEach((inp) => {
        const key = inp.dataset.tune;
        inp.addEventListener("input", () => {
          const base = window.__dsCurrentLiveParams || { ...DEFAULT_LIVE_PARAMS };
          const numVal = Number(inp.value);
          let nextPayload;
          if (key === "fontWeightBoost" || runtime.selectedZone === "global") {
            nextPayload = { ...base, [key]: numVal };
          } else {
            const nextZones = { ...(base.zones || {}) };
            nextZones[runtime.selectedZone] = { ...(nextZones[runtime.selectedZone] || {}), [key]: numVal };
            nextPayload = { ...base, zones: nextZones };
          }
          const cur = applyLiveTuneRuntime(nextPayload);
          const effVal = key === "fontWeightBoost" ? cur.fontWeightBoost : resolveZoneEffective(cur, runtime.selectedZone)[key];
          const valEl = shadow.getElementById(`ds-val-${key}`);
          if (valEl) valEl.textContent = key === "fontWeightBoost" ? String(effVal) : `${effVal}%`;
          if (runtime.selectedZone !== "global") {
            const zBtn = shadow.querySelector(`[data-zone="${runtime.selectedZone}"]`);
            zBtn?.classList.add("customized");
            const zResetBtn = shadow.getElementById("ds-reset-zone");
            if (zResetBtn) zResetBtn.hidden = false;
          }
        });
        inp.addEventListener("change", () => {
          const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
          clearTimeout(runtime.debounceCommit);
          runtime.debounceCommit = setTimeout(() => {
            callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: true });
          }, 40);
        });
      });

      shadow.querySelectorAll("[data-motion]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const base = window.__dsCurrentLiveParams || { ...DEFAULT_LIVE_PARAMS };
          const cur = applyLiveTuneRuntime({ ...base, motionMode: btn.dataset.motion || "spring" });
          renderState();
          callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: true });
        });
      });

      shadow.getElementById("ds-particles-toggle").addEventListener("change", (e) => {
        const base = window.__dsCurrentLiveParams || { ...DEFAULT_LIVE_PARAMS };
        const cur = applyLiveTuneRuntime({ ...base, particlesEnabled: Boolean(e.target.checked) });
        renderState();
        callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: true });
      });

      shadow.getElementById("ds-reset-tune").addEventListener("click", async () => {
        const res = await callRpc("resetThemeParams", { themeId: THEME.id });
        if (res?.ok) {
          runtime.state = res;
          if (res.liveParams) applyLiveTuneRuntime(res.liveParams);
          renderState();
        } else {
          const cur = applyLiveTuneRuntime(DEFAULT_LIVE_PARAMS);
          renderState();
        }
      });

      shadow.getElementById("ds-preset-save")?.addEventListener("click", async () => {
        const nameInp = shadow.getElementById("ds-preset-name");
        const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
        const customName = String(nameInp?.value || "").trim();
        const res = await callRpc("savePreset", {
          name: customName,
          params: cur,
        });
        if (res?.ok) {
          runtime.state = res;
          if (res.savedPreset?.id) runtime.selectedPresetId = res.savedPreset.id;
          if (nameInp && customName) nameInp.value = "";
          renderState();
        }
      });

      shadow.getElementById("ds-preset-default")?.addEventListener("click", async () => {
        const nameInp = shadow.getElementById("ds-preset-name");
        const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
        const customName = String(nameInp?.value || "").trim();
        const opList = runtime.state?.opticalPresets?.presets || [];
        const hasSel = Boolean(runtime.selectedPresetId && opList.some((p) => p.id === runtime.selectedPresetId));
        const res = await callRpc("setDefaultPreset", {
          presetId: (!customName && hasSel) ? runtime.selectedPresetId : null,
          name: customName,
          params: cur,
        });
        if (res?.ok) {
          runtime.state = res;
          if (res.opticalPresets?.defaultPresetId) runtime.selectedPresetId = res.opticalPresets.defaultPresetId;
          if (nameInp && customName) nameInp.value = "";
          renderState();
        }
      });

      shadow.getElementById("ds-preset-del")?.addEventListener("click", async () => {
        if (!runtime.selectedPresetId) return;
        const res = await callRpc("deletePreset", { presetId: runtime.selectedPresetId });
        if (res?.ok) {
          runtime.state = res;
          runtime.selectedPresetId = null;
          renderState();
        }
      });

      shadow.querySelectorAll("[data-pillmode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          runtime.pillMode = btn.dataset.pillmode === "pill" ? "pill" : "orb";
          runtime.minimized = runtime.pillMode === "orb";
          renderState();
          persistUi();
        });
      });

      const pushGuard = () => {
        const nextGuard = {
          autoGuardEnabled: Boolean(shadow.getElementById("ds-guard-enabled")?.checked),
          autoLaunchCodexOnBoot: Boolean(shadow.getElementById("ds-guard-launch")?.checked),
        };
        callRpc("setGuardConfig", { guardConfig: nextGuard });
      };
      shadow.getElementById("ds-guard-enabled").addEventListener("change", pushGuard);
      shadow.getElementById("ds-guard-launch").addEventListener("change", pushGuard);

      shadow.getElementById("ds-reapply-btn").addEventListener("click", () => callRpc("reapplySkin", {}));
      shadow.querySelectorAll("[data-folder]").forEach((btn) => {
        btn.addEventListener("click", () => callRpc("openFolder", { target: btn.dataset.folder }));
      });
    }

    if (runtime.keyHandler) window.removeEventListener("keydown", runtime.keyHandler);
    runtime.keyHandler = (e) => {
      if (e.key === "Escape" && runtime.open) {
        setPanelOpen(false, true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setPanelOpen(!runtime.open, true);
      }
    };
    window.addEventListener("keydown", runtime.keyHandler);

    if (runtime.resizeHandler) window.removeEventListener("resize", runtime.resizeHandler);
    runtime.resizeHandler = () => syncPositions();
    window.addEventListener("resize", runtime.resizeHandler, { passive: true });

    callRpc("getState", {}).then((res) => {
      if (res?.ok) {
        runtime.state = res;
        if (res.ui) {
          if (res.ui.pillMode) runtime.pillMode = res.ui.pillMode === "pill" ? "pill" : "orb";
          if (typeof res.ui.panelOpen === "boolean") runtime.open = res.ui.panelOpen;
          if (["themes", "tune", "auto"].includes(res.ui.activeTab)) runtime.activeTab = res.ui.activeTab;
          if (VALID_ZONES.includes(res.ui.selectedZone)) runtime.selectedZone = res.ui.selectedZone;
          if (typeof res.ui.posX === "number" && Number.isFinite(res.ui.posX)) runtime.posX = Math.max(0, Math.min(1, res.ui.posX));
          if (typeof res.ui.posY === "number" && Number.isFinite(res.ui.posY)) runtime.posY = Math.max(0, Math.min(1, res.ui.posY));
        }
        if (res.liveParams) applyLiveTuneRuntime(res.liveParams);
        renderState();
      }
    });

    window.__dsPluginOnSync = (nextState) => {
      if (nextState?.ok) {
        runtime.state = nextState;
        if (nextState.liveParams) applyLiveTuneRuntime(nextState.liveParams);
        renderState();
      }
    };

    window.__dsPluginTeardown = () => {
      stopGlide();
      runtime.activeFlipAnim?.cancel();
      clearTimeout(runtime.debounceCommit);
      if (runtime.keyHandler) window.removeEventListener("keydown", runtime.keyHandler);
      if (runtime.resizeHandler) window.removeEventListener("resize", runtime.resizeHandler);
      document.getElementById(HOST_ID)?.remove();
      delete window.__dsPluginRuntime;
      delete window.__dsPluginResolveRpc;
      delete window.__dsPluginOnSync;
      delete window.__dsPluginTeardown;
    };

    renderState();
  };

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountDreamSkinPluginStudio, { once: true });
    } else {
      mountDreamSkinPluginStudio();
    }
  } catch {}

  return {
    installed: true,
    version: VERSION,
    themeId: THEME.id || "custom",
    revision: PAYLOAD_REVISION,
    shell: resolvedShell(),
    scope: initialScope,
    styleMode,
    analysis: artAnalysis,
  };
})(__DREAM_SKIN_CSS_JSON__, __DREAM_SKIN_ART_JSON__, __DREAM_SKIN_THEME_JSON__)
