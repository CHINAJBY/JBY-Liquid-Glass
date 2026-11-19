(() => {
  const BOOT = /*__AGY_DS_BOOT__*/ {
    theme: {},
    selectors: [],
    cssText: "",
    safeCssText: "",
    artDataUrl: "",
    videoUrl: "",
    customMediaKind: "none",
    revision: "1",
    version: "3.0.0",
    liveParams: {},
    pluginUi: {},
    themesCatalog: [],
    guardConfig: {},
    studioBundle: true,
  }/*__AGY_DS_BOOT_END__*/;

  const DISABLED_KEY = "__AGY_DREAM_SKIN_DISABLED__";
  const STATE_KEY = "__AGY_DREAM_SKIN_STATE__";
  const STYLE_REGISTRY_KEY = "__AGY_DREAM_SKIN_STYLE_SHEETS__";
  const STYLE_ID = "agy-dream-skin-style";
  const WALLPAPER_LAYER_ID = "agy-ds-wallpaper-layer";
  const PLUGIN_HOST_ID = "agy-dream-skin-plugin-host";
  const LG_SVG_ID = "ds-lg-svg-defs";
  const LG_CANVAS_ID = "ds-lg-fx-canvas";
  const SHELL_ATTR = "data-dream-shell";
  const THEME_ATTR = "data-dream-theme";
  const PART_ATTR = "data-ds-part";
  const RPC_FN = "__agyDsPluginRpc";

  const THEME = BOOT.theme && typeof BOOT.theme === "object" ? BOOT.theme : {};
  const SELECTORS = Array.isArray(BOOT.selectors) ? BOOT.selectors : [];
  const PAYLOAD_REVISION = String(BOOT.revision || "1");
  const SKIN_VERSION = String(BOOT.version || "3.0.0");
  const cssText = [String(BOOT.cssText || ""), String(BOOT.safeCssText || "")].filter(Boolean).join("\n");
  const selectorByKey = new Map(SELECTORS.map((item) => [item.key, item]));

  const LIQUID_ZONES = ["composer", "writing", "sidebar", "cards", "popover"];
  const DEFAULT_LIVE_PARAMS = {
    transparency: 80,
    refractScale: 100,
    blurScale: 100,
    rimIntensity: 100,
    fontWeightBoost: 0,
    motionMode: "spring",
    particlesEnabled: true,
    zones: {},
  };

  const now = () => (typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now());

  const metrics = {
    startedAt: now(),
    rootPasses: 0,
    partPasses: 0,
    styleWrites: 0,
    partWrites: 0,
    styleRepairs: 0,
    analysisMs: null,
  };

  const prevStudioBody = document.getElementById(PLUGIN_HOST_ID)?.shadowRoot?.querySelector(".body");
  const prevStudioScrollTop = prevStudioBody ? prevStudioBody.scrollTop : 0;
  const previous = window[STATE_KEY];
  if (typeof previous?.cleanup === "function") {
    try { previous.cleanup(); } catch {}
  }
  window[DISABLED_KEY] = false;

  const existingRegistry = window[STYLE_REGISTRY_KEY];
  const styleRegistry = existingRegistry instanceof Set ? existingRegistry : new Set();
  window[STYLE_REGISTRY_KEY] = styleRegistry;

  const artDataUrl = String(BOOT.artDataUrl || "");
  const artUrl = (() => {
    if (!artDataUrl.startsWith("data:")) return artDataUrl;
    try {
      const comma = artDataUrl.indexOf(",");
      const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
      const binary = atob(artDataUrl.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch {
      return artDataUrl;
    }
  })();

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const setStyleProperty = (target, name, value) => {
    if (!target?.style) return;
    if (target.style.getPropertyValue(name) !== value) {
      target.style.setProperty(name, value);
      metrics.styleWrites += 1;
    }
  };

  const setAttribute = (target, name, value) => {
    const str = String(value);
    if (target.getAttribute(name) !== str) {
      target.setAttribute(name, str);
    }
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const hex = String(value).trim().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      const d = hex[1];
      const rgbHex = d.length <= 4
        ? d.slice(0, 3).split("").map((c) => c + c).join("")
        : d.slice(0, 6);
      const aHex = d.length === 4 ? d[3] + d[3] : d.length === 8 ? d.slice(6, 8) : "ff";
      const n = Number.parseInt(rgbHex, 16);
      return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, alpha: Number.parseInt(aHex, 16) / 255 };
    }
    const m = String(value).trim().match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
    if (!m) return null;
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      alpha: m[4] === undefined ? 1 : clamp(Number(m[4]), 0, 1),
    };
  };

  const rgbString = (value) => {
    const rgb = parseRgb(value);
    return rgb ? `${Math.round(clamp(rgb.r, 0, 255))} ${Math.round(clamp(rgb.g, 0, 255))} ${Math.round(clamp(rgb.b, 0, 255))}` : null;
  };

  const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

  const relativeLuminance = ({ r, g, b }) => {
    const ch = [r, g, b].map((v) => {
      const n = clamp(v, 0, 255) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };

  const compositeColor = (value, background, alphaOverride = null) => {
    const fg = parseRgb(value);
    if (!fg) return background;
    const a = clamp(alphaOverride ?? fg.alpha ?? 1, 0, 1);
    return {
      r: clamp(fg.r, 0, 255) * a + background.r * (1 - a),
      g: clamp(fg.g, 0, 255) * a + background.g * (1 - a),
      b: clamp(fg.b, 0, 255) * a + background.b * (1 - a),
    };
  };

  const readableAccentInk = (accent, panel, panelAlpha = 0.94) => {
    const lums = [0, 255].map((bg) => relativeLuminance(compositeColor(accent, compositeColor(panel, { r: bg, g: bg, b: bg }, panelAlpha))));
    const whiteC = Math.min(...lums.map((v) => 1.05 / (v + 0.05)));
    const blackC = Math.min(...lums.map((v) => (v + 0.05) / 0.05));
    return whiteC >= blackC ? "#ffffff" : "#0b111e";
  };

  const rgbToHsl = ({ r, g, b }) => {
    const vs = [r, g, b].map((v) => v / 255);
    const max = Math.max(...vs);
    const min = Math.min(...vs);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === vs[0]) h = (vs[1] - vs[2]) / d + (vs[1] < vs[2] ? 6 : 0);
    else if (max === vs[1]) h = (vs[2] - vs[0]) / d + 2;
    else h = (vs[0] - vs[1]) / d + 4;
    return { h: h * 60, s, l };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const n = Math.round(l * 255);
      return { r: n, g: n, b: n };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const c = (off) => {
      let t = hue + off;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: c(1 / 3) * 255, g: c(0) * 255, b: c(-1 / 3) * 255 };
  };

  // Detect Antigravity native Light / Dark mode from body classes, html colorScheme, or Monaco workbench
  const detectShellAppearance = () => {
    const root = document.documentElement;
    const body = document.body;
    if (body) {
      if (body.classList.contains("theme-dark") || body.classList.contains("dark-theme") || body.classList.contains("dark")) {
        return "dark";
      }
      if (body.classList.contains("theme-light")) {
        return "light";
      }
    }
    const cs = root?.style?.colorScheme;
    if (cs === "dark" || cs === "light") return cs;
    const dt = root?.getAttribute("data-theme");
    if (dt === "dark" || dt === "light") return dt;
    const monaco = document.querySelector(".monaco-workbench");
    if (monaco) {
      if (monaco.classList.contains("vs-dark") || monaco.classList.contains("hc-black")) return "dark";
      return "light";
    }
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch {}
    return "light";
  };

  const resolvedShell = () => {
    if (THEME.appearance === "light" || THEME.appearance === "dark") return THEME.appearance;
    return detectShellAppearance();
  };

  const makeAdaptivePalette = (sample, shell) => {
    const source = sample || { r: 78, g: 122, b: 196 };
    const hsl = rgbToHsl(source);
    const hue = hsl.s < 0.12 ? 216 : hsl.h;
    const saturation = clamp(hsl.s, 0.36, 0.72);
    const accent = hslToRgb({ h: hue, s: saturation, l: shell === "light" ? 0.44 : 0.65 });
    const accentAlt = hslToRgb({ h: hue + 14, s: saturation * 0.84, l: shell === "light" ? 0.54 : 0.73 });
    const secondary = hslToRgb({ h: hue - 22, s: saturation * 0.65, l: shell === "light" ? 0.56 : 0.64 });
    const highlight = hslToRgb({ h: hue + 24, s: saturation * 0.78, l: shell === "light" ? 0.38 : 0.58 });
    const neutral = (l, ch = 0.08) => rgbToHex(hslToRgb({ h: hue, s: ch, l }));
    return shell === "light"
      ? {
          background: neutral(0.96, 0.06),
          panel: neutral(0.985, 0.03),
          panelAlt: neutral(0.94, 0.08),
          accent: THEME.accent || rgbToHex(accent),
          accentAlt: rgbToHex(accentAlt),
          secondary: rgbToHex(secondary),
          highlight: rgbToHex(highlight),
          text: neutral(0.12, 0.09),
          muted: neutral(0.42, 0.07),
        }
      : {
          background: neutral(0.06, 0.05),
          panel: neutral(0.10, 0.04),
          panelAlt: neutral(0.14, 0.05),
          accent: THEME.accent || rgbToHex(accent),
          accentAlt: rgbToHex(accentAlt),
          secondary: rgbToHex(secondary),
          highlight: rgbToHex(highlight),
          text: neutral(0.94, 0.025),
          muted: neutral(0.68, 0.03),
        };
  };

  let analyzedArt = null;
  let analyzedArtPromise = null;

  const analyzeArt = () => {
    if (analyzedArtPromise) return analyzedArtPromise;
    analyzedArtPromise = new Promise((resolve) => {
      if (!artUrl) { resolve(null); return; }
      const started = now();
      const img = new Image();
      img.decoding = "async";
      let done = false;
      const finish = (res) => {
        if (done) return;
        done = true;
        analyzedArt = res;
        metrics.analysisMs = Number((now() - started).toFixed(2));
        resolve(res);
      };
      const timer = setTimeout(() => finish(null), 5000);
      img.onerror = () => { clearTimeout(timer); finish(null); };
      img.onload = () => {
        clearTimeout(timer);
        try {
          const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
          const w = Math.max(16, Math.round(ratio >= 1 ? 80 : 80 * ratio));
          const h = Math.max(16, Math.round(ratio >= 1 ? 80 / ratio : 80));
          const cv = document.createElement("canvas");
          cv.width = w;
          cv.height = h;
          const ctx = cv.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("No 2D context");
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
          let lightSum = 0;
          let count = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 32) continue;
            const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
            const light = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
            const hsl = rgbToHsl(rgb);
            lightSum += light;
            count += 1;
            if (hsl.s >= 0.16 && hsl.l >= 0.16 && hsl.l <= 0.86) {
              const b = bins[Math.min(23, Math.floor(hsl.h / 15))];
              const wt = hsl.s * (1 - Math.abs(hsl.l - 0.52) * 0.85);
              b.w += wt; b.r += rgb.r * wt; b.g += rgb.g * wt; b.b += rgb.b * wt;
            }
          }
          const top = bins.reduce((best, cur) => (cur.w > best.w ? cur : best), bins[0]);
          const accentRgb = top.w > 0 ? { r: top.r / top.w, g: top.g / top.w, b: top.b / top.w } : null;
          finish({
            width: img.naturalWidth,
            height: img.naturalHeight,
            brightness: count ? lightSum / count : 0.5,
            accentRgb,
            focusX: Number(THEME.art?.focusX ?? 0.5),
            focusY: Number(THEME.art?.focusY ?? 0.45),
          });
        } catch {
          finish(null);
        }
      };
      img.src = artUrl;
    });
    return analyzedArtPromise;
  };

  let styleSheet = null;
  let styleNode = null;
  let styleMode = "none";

  const installStyle = () => {
    try {
      if ("adoptedStyleSheets" in document && typeof CSSStyleSheet === "function") {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(cssText);
        const kept = [...document.adoptedStyleSheets].filter((s) => !styleRegistry.has(s));
        document.adoptedStyleSheets = [...kept, sheet];
        styleRegistry.clear();
        styleRegistry.add(sheet);
        document.getElementById(STYLE_ID)?.remove();
        styleSheet = sheet;
        styleMode = "adopted";
        return;
      }
    } catch {}
    styleSheet = null;
    styleNode = document.getElementById(STYLE_ID) || document.createElement("style");
    styleNode.id = STYLE_ID;
    styleNode.textContent = cssText;
    if (!styleNode.parentElement) (document.head || document.documentElement).appendChild(styleNode);
    styleMode = "style";
  };

  const ensureStyle = () => {
    if (styleMode === "adopted" && styleSheet) {
      if (!document.adoptedStyleSheets.includes(styleSheet)) {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
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

  // Mount Wallpaper Layer behind #root + maintain dynamic Browser-Hole clip-path cutout
  let wpHoleObs = null;
  const syncBrowserHoleClip = () => {
    const layer = document.getElementById(WALLPAPER_LAYER_ID);
    if (!layer) return;
    const holes = [];
    for (const el of document.querySelectorAll('[data-has-browser-hole="true"]:not(body), .browser-hole-opaque')) {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) holes.push(r);
    }
    if (!holes.length) {
      if (layer.style.clipPath) layer.style.removeProperty("clip-path");
      return;
    }
    const vw = window.innerWidth || document.documentElement.clientWidth || 1920;
    const vh = window.innerHeight || document.documentElement.clientHeight || 1080;
    const pts = [`0px 0px`, `${vw}px 0px`, `${vw}px ${vh}px`, `0px ${vh}px`, `0px 0px`];
    for (const r of holes) {
      const x1 = Math.max(0, Math.round(r.left));
      const y1 = Math.max(0, Math.round(r.top));
      const x2 = Math.min(vw, Math.round(r.right));
      const y2 = Math.min(vh, Math.round(r.bottom));
      if (x2 > x1 && y2 > y1) {
        pts.push(`${x1}px ${y1}px`, `${x1}px ${y2}px`, `${x2}px ${y2}px`, `${x2}px ${y1}px`, `${x1}px ${y1}px`);
      }
    }
    layer.style.clipPath = `polygon(evenodd, ${pts.join(", ")})`;
  };

  const ensureWallpaperLayer = () => {
    const body = document.body;
    const rootEl = document.documentElement;
    if (!body || !rootEl) return;
    let layer = document.getElementById(WALLPAPER_LAYER_ID);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = WALLPAPER_LAYER_ID;
      layer.setAttribute("aria-hidden", "true");
      const imgDiv = document.createElement("div");
      imgDiv.className = "agy-ds-wp-img";
      const veilDiv = document.createElement("div");
      veilDiv.className = "agy-ds-wp-veil";
      layer.append(imgDiv, veilDiv);
      if (body.firstChild) body.insertBefore(layer, body.firstChild);
      else body.appendChild(layer);
    }
    const videoUrl = String(BOOT.videoUrl || "");
    let videoEl = layer.querySelector("video.agy-ds-wp-video");
    if (videoUrl) {
      if (!videoEl) {
        videoEl = document.createElement("video");
        videoEl.className = "agy-ds-wp-video";
        videoEl.autoplay = true;
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        layer.insertBefore(videoEl, layer.querySelector(".agy-ds-wp-veil"));
      }
      if (videoEl.src !== videoUrl) {
        videoEl.src = videoUrl;
        videoEl.play?.().catch(() => {});
      }
      setAttribute(body, "data-dream-skin-video", "true");
    } else {
      videoEl?.remove();
      body.removeAttribute("data-dream-skin-video");
    }
    if (layer.isConnected && (artUrl || videoUrl)) {
      setAttribute(rootEl, "data-dream-wallpaper-ready", "1");
    } else {
      rootEl.removeAttribute("data-dream-wallpaper-ready");
    }
    syncBrowserHoleClip();
  };

  const applyThemeTokens = (root, shell) => {
    const declared = THEME.colors && typeof THEME.colors === "object" ? THEME.colors : {};
    const adaptive = makeAdaptivePalette(analyzedArt?.accentRgb, shell);
    const pick = (k) => (typeof declared[k] === "string" && declared[k].trim()) ? declared[k] : adaptive[k];

    const bgHex = pick("background");
    const panelHex = pick("panel");
    const panelAltHex = pick("panelAlt");
    const accentHex = pick("accent");
    const accentAltHex = pick("accentAlt");
    const secondaryHex = pick("secondary");
    const highlightHex = pick("highlight");
    const textHex = pick("text");
    const mutedHex = pick("muted");

    const setRgb = (varName, hex, fb) => setStyleProperty(root, varName, rgbString(hex) || fb);
    setStyleProperty(root, "--ds-bg-solid", bgHex);
    setRgb("--ds-bg-rgb", bgHex, shell === "light" ? "244 246 250" : "14 16 24");
    setRgb("--ds-panel-rgb", panelHex, shell === "light" ? "255 255 255" : "20 24 36");
    setRgb("--ds-panel-alt-rgb", panelAltHex, shell === "light" ? "238 242 248" : "28 32 46");
    setRgb("--ds-surface-rgb", panelHex, shell === "light" ? "255 255 255" : "20 24 36");
    setRgb("--ds-accent-rgb", accentHex, "47 117 195");
    setRgb("--ds-accent-alt-rgb", accentAltHex, "96 144 228");
    setRgb("--ds-secondary-rgb", secondaryHex, "104 128 184");
    setRgb("--ds-highlight-rgb", highlightHex, "61 84 168");
    setStyleProperty(root, "--ds-text-rgb", rgbString(textHex) || (shell === "light" ? "11 17 30" : "244 247 253"));
    setStyleProperty(root, "--ds-muted-rgb", rgbString(mutedHex) || (shell === "light" ? "71 85 105" : "154 167 194"));
    const accentInk = readableAccentInk(accentHex, panelHex, 0.94);
    setStyleProperty(root, "--ds-accent-ink", accentInk);
    setStyleProperty(root, "--ds-theme-color-background", bgHex);
    setStyleProperty(root, "--ds-theme-color-panel", panelHex);
    setStyleProperty(root, "--ds-theme-color-panel-alt", panelAltHex);
    setStyleProperty(root, "--ds-theme-color-accent", accentHex);
    setStyleProperty(root, "--ds-theme-color-accent-alt", accentAltHex);
    setStyleProperty(root, "--ds-theme-color-secondary", secondaryHex);
    setStyleProperty(root, "--ds-theme-color-highlight", highlightHex);
    setStyleProperty(root, "--ds-theme-color-text", textHex);
    setStyleProperty(root, "--ds-theme-color-muted", mutedHex);
    setStyleProperty(root, "--ds-theme-color-line", typeof declared.line === "string" ? declared.line : (shell === "light" ? "rgba(18,28,48,0.12)" : "rgba(255,255,255,0.16)"));

    const focusX = Math.round((analyzedArt?.focusX ?? Number(THEME.art?.focusX ?? 0.5)) * 100);
    const focusY = Math.round((analyzedArt?.focusY ?? Number(THEME.art?.focusY ?? 0.45)) * 100);
    setStyleProperty(root, "--ds-art-position", `${focusX}% ${focusY}%`);

    const darkArtInLight = shell === "light" && typeof analyzedArt?.brightness === "number" && analyzedArt.brightness < 0.56;
    if (shell === "light") {
      setStyleProperty(root, "--ds-wallpaper-veil-rgb", "255 255 255");
      setStyleProperty(root, "--ds-wallpaper-veil-top", darkArtInLight ? "0.24" : "0.10");
      setStyleProperty(root, "--ds-wallpaper-veil-mid", darkArtInLight ? "0.14" : "0.06");
      setStyleProperty(root, "--ds-wallpaper-veil-bot", darkArtInLight ? "0.22" : "0.14");
      setStyleProperty(root, "--ds-main-scrim", darkArtInLight ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.08)");
      setAttribute(root, "data-dream-art-tone", darkArtInLight ? "dim" : "bright");
    } else {
      setStyleProperty(root, "--ds-wallpaper-veil-rgb", "8 11 20");
      setStyleProperty(root, "--ds-wallpaper-veil-top", "0.28");
      setStyleProperty(root, "--ds-wallpaper-veil-mid", "0.22");
      setStyleProperty(root, "--ds-wallpaper-veil-bot", "0.34");
      setStyleProperty(root, "--ds-main-scrim", "rgba(8, 10, 18, 0.24)");
      root.removeAttribute("data-dream-art-tone");
    }
  };

  let lastRootSig = "";
  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    ensureStyle();
    ensureWallpaperLayer();
    const shell = resolvedShell();
    const sig = `${shell}\0${THEME.id || "custom"}\0${artUrl}\0${Boolean(analyzedArt)}`;
    if (lastRootSig === sig && root.getAttribute("data-dream-skin") === "active" && root.getAttribute(SHELL_ATTR) === shell) {
      return shell;
    }
    lastRootSig = sig;
    setAttribute(root, "data-dream-skin", "active");
    setAttribute(root, SHELL_ATTR, shell);
    setAttribute(root, THEME_ATTR, THEME.id || "custom");
    setStyleProperty(root, "--dream-skin-art", artUrl ? `url("${artUrl}")` : "none");
    applyThemeTokens(root, shell);
    return shell;
  };

  // [data-ds-part] tagger from Antigravity selectors.json
  const partNodes = new Set();
  const querySafe = (sel) => {
    if (!sel) return [];
    try { return [...document.querySelectorAll(sel)]; } catch { return []; }
  };

  const refreshParts = () => {
    metrics.partPasses += 1;
    const desired = new Map();
    const addPart = (part, nodes) => {
      for (const n of nodes) {
        if (n && typeof n.setAttribute === "function" && !n.closest?.(`#${PLUGIN_HOST_ID}`) && !desired.has(n)) {
          desired.set(n, part);
        }
      }
    };
    addPart("root", [document.documentElement]);
    addPart("sidebar", querySafe(selectorByKey.get("left-panel")?.selector));
    addPart("header", querySafe(selectorByKey.get("header-tint")?.selector));
    addPart("home", querySafe(selectorByKey.get("home-route")?.selector));
    addPart("home-hero", querySafe(selectorByKey.get("home-icon")?.selector));
    addPart("main", querySafe(selectorByKey.get("shell-main")?.selector));
    addPart("project-list", querySafe(selectorByKey.get("project-selector")?.selector));
    addPart("thread", querySafe(selectorByKey.get("thread-surface")?.selector));
    addPart("message", querySafe(selectorByKey.get("message")?.selector));
    addPart("composer", querySafe(selectorByKey.get("composer-chrome")?.selector));
    addPart("composer-toolbar", querySafe(selectorByKey.get("composer-toolbar")?.selector));
    addPart("dialog", querySafe(selectorByKey.get("overlay-dialog")?.selector));

    for (const oldNode of partNodes) {
      if (!desired.has(oldNode)) {
        oldNode.removeAttribute?.(PART_ATTR);
        metrics.partWrites += 1;
      }
    }
    partNodes.clear();
    for (const [node, part] of desired) {
      if (node.getAttribute(PART_ATTR) !== part) {
        node.setAttribute(PART_ATTR, part);
        metrics.partWrites += 1;
      }
      partNodes.add(node);
    }
  };

  // === Per-Zone Live Tune Runtime (1:1 Codex Optical Formulas) ===
  window.__dsCurrentLiveParams = { ...DEFAULT_LIVE_PARAMS, ...(BOOT.liveParams || {}) };
  const ZONE_OPTICS = {
    composer: { hi: 0.10, mid: 0.025, lo: 0.065, blur: 1.1, rim: 0.15, darkHi: 0.11, darkMid: 0.18, darkLo: 0.24, darkRim: 0.22 },
    writing:  { hi: 0.24, mid: 0.070, lo: 0.150, blur: 5.0, rim: 0.16, darkHi: 0.11, darkMid: 0.24, darkLo: 0.30, darkRim: 0.24 },
    sidebar:  { hi: 0.22, mid: 0.080, lo: 0.140, blur: 4.0, rim: 0.15, darkHi: 0.11, darkMid: 0.20, darkLo: 0.24, darkRim: 0.22 },
    cards:    { hi: 0.22, mid: 0.070, lo: 0.140, blur: 5.0, rim: 0.15, darkHi: 0.11, darkMid: 0.20, darkLo: 0.24, darkRim: 0.22 },
    popover:  { hi: 0.48, mid: 0.280, lo: 0.380, blur: 10.0, rim: 0.16, darkHi: 0.64, darkMid: 0.58, darkLo: 0.54, darkRim: 0.24, darkTintPopover: true },
  };

  const resolveZone = (params, zone) => {
    const ov = params.zones && zone && params.zones[zone];
    return {
      transparency: clamp(Number(ov?.transparency ?? params.transparency ?? 80), 0, 100),
      refractScale: clamp(Number(ov?.refractScale ?? params.refractScale ?? 100), 0, 200),
      blurScale: clamp(Number(ov?.blurScale ?? params.blurScale ?? 100), 0, 200),
      rimIntensity: clamp(Number(ov?.rimIntensity ?? params.rimIntensity ?? 100), 0, 200),
    };
  };

  const applyLiveTuneRuntime = (nextParams) => {
    const cur = {
      ...DEFAULT_LIVE_PARAMS,
      ...(window.__dsCurrentLiveParams || {}),
      ...(nextParams || {}),
    };
    window.__dsCurrentLiveParams = cur;
    const root = document.documentElement;
    if (!root) return cur;

    const shell = resolvedShell();
    const clampA = (v, min = 0.01, max = 0.94) => Math.max(min, Math.min(max, v)).toFixed(3);
    const opacityScale = clamp((112 - Number(cur.transparency ?? 80)) / 32, 0.14, 2.8);
    setStyleProperty(root, "--ds-lg-glaze-hi", clampA(0.10 * opacityScale));
    setStyleProperty(root, "--ds-lg-glaze-mid", clampA(0.025 * opacityScale, 0.005));
    setStyleProperty(root, "--ds-lg-glaze-lo", clampA(0.065 * opacityScale));
    setStyleProperty(root, "--ds-lg-live-blur", `${(1.1 * (Number(cur.blurScale ?? 100) / 100)).toFixed(2)}px`);
    setStyleProperty(root, "--ds-lg-rim-alpha", clampA((shell === "dark" ? 0.22 : 0.15) * Math.max(0.20, Number(cur.rimIntensity ?? 100) / 100), 0.03, 0.88));
    if (shell === "dark") {
      if (Number(cur.transparency) === 80) {
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
      const zp = resolveZone(cur, z);
      const zOp = clamp((112 - zp.transparency) / 32, 0.14, 2.8);
      setStyleProperty(root, `--ds-lg-z-${z}-hi`, clampA(cfg.hi * zOp));
      setStyleProperty(root, `--ds-lg-z-${z}-mid`, clampA(cfg.mid * zOp, 0.005));
      setStyleProperty(root, `--ds-lg-z-${z}-lo`, clampA(cfg.lo * zOp));
      setStyleProperty(root, `--ds-lg-z-${z}-blur`, `${Math.max(0, cfg.blur * (zp.blurScale / 100)).toFixed(2)}px`);
      const baseRim = shell === "dark" ? cfg.darkRim : cfg.rim;
      setStyleProperty(root, `--ds-lg-z-${z}-rim-a`, clampA(baseRim * Math.max(0.20, zp.rimIntensity / 100), 0.03, 0.88));
      setStyleProperty(root, `--ds-lg-z-${z}-bg-a`, clampA(cfg.hi * zOp, 0.04, 0.88));
      if (shell === "dark") {
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

    const boost = clamp(Number(cur.fontWeightBoost ?? 0), -80, 150);
    setStyleProperty(root, "--ds-live-weight-body", String(Math.round(clamp(500 + boost, 300, 800))));
    setStyleProperty(root, "--ds-live-weight-ctrl", String(Math.round(clamp(530 + boost, 320, 800))));
    setStyleProperty(root, "--ds-live-weight-head", String(Math.round(clamp(560 + boost, 360, 850))));
    window.__dsLgApplyLiveParams?.(cur);
    return cur;
  };

  // === Liquid Glass v3 Engine (Tier 1 SVG Snell + Tier 2 WebGL2 Static Glass + Tier 3 HarmonyOS Springs) ===
  const initLiquidGlassEdition = () => {
    const id = String(THEME.id || "custom");
    const enabled = id === "harmony-liquid-glass-lunar" || id.endsWith("-liquid-glass") || THEME.liquidGlass === true;
    if (!enabled || window[DISABLED_KEY]) {
      document.documentElement?.removeAttribute("data-dream-lg");
      document.documentElement?.removeAttribute("data-dream-lg-motion");
      return () => {};
    }
    const root = document.documentElement;
    const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const resolveMotionFlags = () => {
      const mode = window.__dsCurrentLiveParams?.motionMode || "spring";
      const sysReduced = Boolean(reducedMotionQuery?.matches);
      return { mode, reduced: sysReduced || mode === "off", lite: !sysReduced && mode === "lite" };
    };
    let { reduced: reducedMotion, lite: liteMotion } = resolveMotionFlags();
    setAttribute(root, "data-dream-lg", "on");
    setAttribute(root, "data-dream-lg-motion", reducedMotion ? "reduced" : (liteMotion ? "lite" : "full"));

    const solveSpringLinear = (responseS, dampingRatio, steps = 32) => {
      const wn = (2 * Math.PI) / Math.max(0.08, responseS);
      const z = clamp(dampingRatio, 0.2, 1.8);
      const sample = (t) => {
        if (z < 1) {
          const wd = wn * Math.sqrt(1 - z * z);
          return 1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
        }
        return 1 - Math.exp(-wn * t) * (1 + wn * t);
      };
      let duration = responseS * 2.2;
      for (let t = 0.05; t <= 1.5; t += 0.01) {
        if (Math.abs(1 - sample(t)) < 0.002 && Math.abs(1 - sample(t + 0.02)) < 0.002) {
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

    setStyleProperty(root, "--ds-lg-spring-responsive", solveSpringLinear(0.14, 0.84, 28));
    setStyleProperty(root, "--ds-lg-spring-settle", solveSpringLinear(0.32, 0.78, 32));
    setStyleProperty(root, "--ds-lg-spring-press", solveSpringLinear(0.17, 0.74, 26));

    let accentUnit = [0.2, 0.45, 0.78];
    let accentAltUnit = [0.5, 0.65, 0.93];
    const syncAccentUnits = () => {
      const csRoot = getComputedStyle(root);
      const aStr = csRoot.getPropertyValue("--ds-accent-rgb").trim() || "47 117 195";
      const aaStr = csRoot.getPropertyValue("--ds-accent-alt-rgb").trim() || "132 168 238";
      setStyleProperty(root, "--ds-lg-accent-rgb", aStr);
      setStyleProperty(root, "--ds-lg-accent-alt-rgb", aaStr);
      setStyleProperty(root, "--ds-lg-prism-a", aaStr);
      setStyleProperty(root, "--ds-lg-prism-b", aStr);
      accentUnit = aStr.split(/\s+/).map((n) => Number(n) / 255);
      accentAltUnit = aaStr.split(/\s+/).map((n) => Number(n) / 255);
    };
    syncAccentUnits();

    let disposed = false;
    let radiusCache = new WeakMap();
    const getRadiusPx = (el, fb = 20) => {
      if (!el) return fb;
      const hit = radiusCache.get(el);
      if (typeof hit === "number") return hit;
      let r = fb;
      try {
        const raw = parseFloat(getComputedStyle(el).borderTopLeftRadius);
        if (Number.isFinite(raw)) r = raw;
      } catch {}
      radiusCache.set(el, r);
      return r;
    };

    // Tier 1 SVG Snell Lenses
    const SVG_NS = "http://www.w3.org/2000/svg";
    const XLINK_NS = "http://www.w3.org/1999/xlink";
    document.getElementById(LG_SVG_ID)?.remove();
    const svgRoot = document.createElementNS(SVG_NS, "svg");
    svgRoot.id = LG_SVG_ID;
    svgRoot.setAttribute("aria-hidden", "true");
    svgRoot.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;overflow:hidden;";
    const svgDefs = document.createElementNS(SVG_NS, "defs");
    svgRoot.appendChild(svgDefs);
    (document.body || root).appendChild(svgRoot);

    const COMPOSER_SEL = '[data-testid="agent-input-box"] .surface-composer-card, .surface-composer-card, .agy-takeover-frame > .agy-takeover-card, .interactive-input-part';
    const RAIL_SEL = '[data-testid="agent-input-box"] [data-testid="input-box-bottom-toolbar"]';
    const WRITING_SEL = '.agy-user-bubble, .artifact-card, .agy-callout, .agy-md-table, .md-table-host, .animate-overview-panel';
    const LENS_SLOTS = [
      { name: "composer", zone: "composer", filterId: "ds-lg-lens-composer", cssVar: "--ds-lg-lens-filter", selector: COMPOSER_SEL, baseScale: 36, defaultR: 28, bezelFn: (w, h) => Math.max(15, Math.min(26, Math.min(w, h) * 0.32)) },
      { name: "rail", zone: "composer", filterId: "ds-lg-lens-rail", cssVar: "--ds-lg-lens-rail", selector: RAIL_SEL, baseScale: 20, defaultR: 18, bezelFn: (w, h) => Math.max(8, Math.min(16, Math.min(w, h) * 0.30)) },
      { name: "writing", zone: "writing", filterId: "ds-lg-lens-writing", cssVar: "--ds-lg-lens-writing", selector: WRITING_SEL, multi: true, baseScale: 32, defaultR: 24, bezelFn: (w, h) => Math.max(14, Math.min(24, Math.min(w, h) * 0.24)) },
    ];
    const SHARED_FILTERS = [
      { name: "card", zone: "cards", filterId: "ds-lg-lens-card", cssVar: "--ds-lg-lens-card", w: 160, h: 160, r: 20, bez: 18, baseScale: 22 },
      { name: "popover", zone: "popover", filterId: "ds-lg-lens-popover", cssVar: "--ds-lg-lens-popover", w: 160, h: 160, r: 22, bez: 18, baseScale: 26 },
    ];

    const createDisplacementFilter = (id, baseScale) => {
      const f = document.createElementNS(SVG_NS, "filter");
      f.id = id;
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

    const snellCache = new Map();
    const snellCv = document.createElement("canvas");
    const snellCtx = snellCv.getContext("2d", { willReadFrequently: false });

    const buildSnellMap = (qw, qh, qr, qb) => {
      const tall1D = qh > 1100;
      const key = tall1D ? `1d:${qw}:b${qb}` : `${qw}x${qh}:r${qr}:b${qb}`;
      const hit = snellCache.get(key);
      if (hit) return hit;
      if (!snellCtx) return "";
      const maxDim = 224;
      if (tall1D) {
        const cw = Math.min(maxDim, Math.max(48, qw));
        snellCv.width = cw;
        snellCv.height = 1;
        const imgData = snellCtx.createImageData(cw, 1);
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
          const mag = Math.pow(1 - t, 1.45) * (0.38 + 0.62 * Math.min(1, t / 0.14)) * 0.90;
          data[idx] = Math.max(0, Math.min(255, Math.round(127.5 - nx * mag * 127.5)));
          data[idx + 1] = 128; data[idx + 2] = 128; data[idx + 3] = 255;
        }
        snellCtx.putImageData(imgData, 0, 0);
        const url = snellCv.toDataURL("image/png");
        snellCache.set(key, url);
        return url;
      }
      const aspect = qw / Math.max(1, qh);
      const cw = aspect >= 1 ? Math.min(maxDim, Math.max(40, qw)) : Math.max(24, Math.round(Math.min(maxDim, Math.max(40, qh)) * aspect));
      const ch = aspect >= 1 ? Math.max(24, Math.round(cw / aspect)) : Math.min(maxDim, Math.max(40, qh));
      snellCv.width = cw;
      snellCv.height = ch;
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
          const sdf = outD + Math.min(Math.max(qx, qy), 0) - cr;
          const idx = (y * cw + x) * 4;
          if (sdf > 0 || -sdf >= bez) {
            data[idx] = 128; data[idx + 1] = 128; data[idx + 2] = 128; data[idx + 3] = 255;
            continue;
          }
          const d = -sdf;
          let nx = 0; let ny = 0;
          if (ox > 0 || oy > 0) {
            const inv = 1 / Math.max(1e-5, outD);
            nx = (px >= 0 ? 1 : -1) * ox * inv;
            ny = (py >= 0 ? 1 : -1) * oy * inv;
          } else if (qx > qy) nx = px >= 0 ? 1 : -1;
          else ny = py >= 0 ? 1 : -1;
          const t = d / bez;
          const mag = Math.pow(1 - t, 1.45) * (0.38 + 0.62 * Math.min(1, t / 0.14)) * 0.90;
          data[idx] = Math.max(0, Math.min(255, Math.round(127.5 - nx * mag * 127.5)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(127.5 - ny * mag * 127.5)));
          data[idx + 2] = 128; data[idx + 3] = 255;
        }
      }
      snellCtx.putImageData(imgData, 0, 0);
      const url = snellCv.toDataURL("image/png");
      snellCache.set(key, url);
      while (snellCache.size > 18) snellCache.delete(snellCache.keys().next().value);
      return url;
    };

    const slotNodes = new Map();
    for (const slot of LENS_SLOTS) {
      const { filter, feImg, feDisp } = createDisplacementFilter(slot.filterId, slot.baseScale);
      slotNodes.set(slot.name, { slot, filter, feImg, feDisp, lastKey: "", lastScale: "", activeEls: new Set() });
    }
    const sharedNodes = new Map();
    for (const sf of SHARED_FILTERS) {
      const { filter, feImg, feDisp } = createDisplacementFilter(sf.filterId, sf.baseScale);
      const u = buildSnellMap(sf.w, sf.h, sf.r, sf.bez);
      if (u) { feImg.setAttribute("href", u); feImg.setAttributeNS(XLINK_NS, "href", u); }
      sharedNodes.set(sf.name, { sf, filter, feImg, feDisp, lastScale: "", lastVar: "" });
    }

    const syncSvgLenses = () => {
      if (disposed) return;
      const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
      for (const sf of SHARED_FILTERS) {
        const entry = sharedNodes.get(sf.name);
        const zp = resolveZone(cur, sf.zone);
        const mult = Math.max(0, zp.refractScale / 100);
        const on = !reducedMotion && mult > 0.02;
        if (on) {
          const sStr = (sf.baseScale * mult).toFixed(2);
          if (entry.lastScale !== sStr) { entry.feDisp.setAttribute("scale", sStr); entry.lastScale = sStr; }
        }
        const val = on ? `url("#${sf.filterId}")` : "blur(0px)";
        if (entry.lastVar !== val) { setStyleProperty(root, sf.cssVar, val); entry.lastVar = val; }
      }
      for (const slot of LENS_SLOTS) {
        const entry = slotNodes.get(slot.name);
        const zp = resolveZone(cur, slot.zone);
        const mult = Math.max(0, zp.refractScale / 100);
        const on = !reducedMotion && mult > 0.02;
        const targets = [];
        for (const el of querySafe(slot.selector)) {
          if (el.closest(`#${PLUGIN_HOST_ID}`) || el.closest('[data-has-browser-hole="true"]:not(body)')) continue;
          const r = el.getBoundingClientRect();
          if (r.width >= 24 && r.height >= 18) {
            targets.push({ el, r });
            if (!slot.multi) break;
          }
        }
        const nextSet = new Set(targets.map((t) => t.el));
        for (const oldEl of entry.activeEls) {
          if (!nextSet.has(oldEl)) {
            oldEl.removeAttribute("data-dream-lg-filter");
            oldEl.style.removeProperty(slot.cssVar);
          }
        }
        entry.activeEls = nextSet;
        if (!targets.length) continue;
        if (!on) {
          for (const { el } of targets) {
            setAttribute(el, "data-dream-lg-filter", "off");
            el.style.setProperty(slot.cssVar, "blur(0px)");
          }
          continue;
        }
        const pri = targets[0];
        const qw = Math.max(32, Math.round(pri.r.width / 8) * 8);
        const qh = Math.max(24, Math.round(pri.r.height / 8) * 8);
        const qr = Math.max(4, Math.round(getRadiusPx(pri.el, slot.defaultR)));
        const qb = Math.round(slot.bezelFn(qw, qh));
        const gKey = qh > 1100 ? `1d:${qw}:b${qb}` : `${qw}x${qh}:r${qr}:b${qb}`;
        if (entry.lastKey !== gKey) {
          const url = buildSnellMap(qw, qh, qr, qb);
          if (url) { entry.feImg.setAttribute("href", url); entry.feImg.setAttributeNS(XLINK_NS, "href", url); entry.lastKey = gKey; }
        }
        const sStr = (slot.baseScale * mult).toFixed(2);
        if (entry.lastScale !== sStr) { entry.feDisp.setAttribute("scale", sStr); entry.lastScale = sStr; }
        const fVal = `url(#${slot.filterId})`;
        for (const { el } of targets) {
          if (el.getAttribute("data-dream-lg-filter") !== "lens") el.setAttribute("data-dream-lg-filter", "lens");
          if (el.style.getPropertyValue(slot.cssVar) !== fVal) el.style.setProperty(slot.cssVar, fVal);
        }
      }
    };

    // Tier 2 WebGL2 Static Optical Tile Engine (Sidebar + Home Cards)
    const GPU_TARGETS = [
      { kind: "sidebar", selector: '[data-ds-part="sidebar"]', bezel: 22, scale: 32, blurLod: 0.24, defaultR: 24, tintAlpha: 0.055 },
      { kind: "homeCard", selector: '.agy-home .agy-card, [data-ds-part="home-hero"] button', bezel: 18, scale: 26, blurLod: 0.14, defaultR: 20, tintAlpha: 0.048 },
    ];
    const allBlobUrls = new Set();
    const activeTileUrls = new Map();
    const tileQueue = [];
    let tileRaf = 0;

    const artFocusX = clamp(Number(THEME.art?.focusX ?? 0.5), 0, 1);
    const artFocusY = clamp(Number(THEME.art?.focusY ?? 0.45), 0, 1);
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
  if (sdf > 0.75) { outColor = vec4(0.0); return; }
  float d = max(0.0, -sdf);
  float bez = min(uBezel, min(halfExt.x, halfExt.y));
  vec2 n = rrNormal(p, halfExt, r);
  float t = clamp(d / max(1.0, bez), 0.0, 1.0);
  float dome = pow(1.0 - t, 1.65);
  float dispPx = -dome * (0.36 + 0.64 * smoothstep(0.0, 0.14, t)) * uScale;
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
  float tAlpha = clamp(uTintAlpha * uOpacityScale * (1.0 - 0.35 * whiteNeutral), 0.015, 0.48);
  glass = mix(glass, mix(lightTint, darkTint, uIsDark), tAlpha);
  float rimBand = 1.0 - smoothstep(0.0, 2.2, abs(d - 1.2));
  float diagHighlight = clamp((-n.x * 0.58 - n.y * 0.81) * 0.5 + 0.5, 0.0, 1.0);
  vec3 rimTone = mix(vec3(1.0), uAccentAlt * 0.3 + vec3(0.7), 0.18 * (1.0 - whiteNeutral));
  glass += rimTone * (0.34 * rimBand * (0.45 + 0.55 * diagHighlight) * uRimMul);
  outColor = vec4(clamp(glass, 0.0, 1.0), 1.0) * smoothstep(0.75, -0.75, sdf);
}`;

    const initWebGL = () => {
      if (!gl || !artDataUrl || BOOT.videoUrl) return false;
      const comp = (type, srcStr) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, srcStr);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
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
      const loc = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gpuLocs = {};
      for (const n of ["uArt", "uArtRes", "uArtFocus", "uViewport", "uRect", "uRadius", "uBezel", "uScale", "uBlurLod", "uAccent", "uAccentAlt", "uIsDark", "uTintAlpha", "uRimMul", "uOpacityScale"]) {
        gpuLocs[n] = gl.getUniformLocation(prog, n);
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

    const drawTileToBlob = (el, spec, rect, key) => {
      if (!gpuProgram || !artReady || !gl || disposed) return;
      const ratio = Math.min(1, 512 / Math.max(1, rect.width, rect.height));
      const tw = Math.max(16, Math.round(rect.width * ratio));
      const th = Math.max(16, Math.round(rect.height * ratio));
      glCanvas.width = tw;
      glCanvas.height = th;
      gl.viewport(0, 0, tw, th);
      gl.useProgram(gpuProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, artTex);
      gl.uniform1i(gpuLocs.uArt, 0);

      const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
      const zName = spec.kind === "sidebar" ? "sidebar" : "cards";
      const lp = resolveZone(cur, zName);
      const isDark = resolvedShell() === "dark" ? 1 : 0;
      const r = getRadiusPx(el, spec.defaultR);
      gl.uniform2f(gpuLocs.uArtRes, artImgW, artImgH);
      gl.uniform2f(gpuLocs.uArtFocus, artFocusX, artFocusY);
      gl.uniform2f(gpuLocs.uViewport, Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
      gl.uniform4f(gpuLocs.uRect, rect.left, rect.top, rect.width, rect.height);
      gl.uniform1f(gpuLocs.uRadius, r);
      gl.uniform1f(gpuLocs.uBezel, spec.bezel);
      gl.uniform1f(gpuLocs.uScale, spec.scale * (lp.refractScale / 100));
      gl.uniform1f(gpuLocs.uBlurLod, spec.blurLod * (lp.blurScale / 100));
      gl.uniform3f(gpuLocs.uAccent, accentUnit[0] ?? 0.2, accentUnit[1] ?? 0.45, accentUnit[2] ?? 0.78);
      gl.uniform3f(gpuLocs.uAccentAlt, accentAltUnit[0] ?? 0.4, accentAltUnit[1] ?? 0.6, accentAltUnit[2] ?? 0.9);
      gl.uniform1f(gpuLocs.uIsDark, isDark);
      gl.uniform1f(gpuLocs.uTintAlpha, isDark ? Math.max(0.16, spec.tintAlpha * 2.8) : spec.tintAlpha);
      gl.uniform1f(gpuLocs.uRimMul, Math.max(0.2, lp.rimIntensity / 100));
      gl.uniform1f(gpuLocs.uOpacityScale, clamp((112 - lp.transparency) / 32, 0.18, 2.6));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      glCanvas.toBlob((blob) => {
        if (!blob || disposed || !el.isConnected) return;
        const url = URL.createObjectURL(blob);
        allBlobUrls.add(url);
        const prev = activeTileUrls.get(el);
        activeTileUrls.set(el, { key, url });
        el.style.setProperty("--ds-lg-gpu-bg", `url("${url}")`);
        el.setAttribute("data-dream-lg-gpu", "1");
        if (prev?.url) {
          const oldUrl = prev.url;
          setTimeout(() => {
            allBlobUrls.delete(oldUrl);
            try { URL.revokeObjectURL(oldUrl); } catch {}
          }, 500);
        }
      }, "image/png");
    };

    const flushTiles = () => {
      tileRaf = 0;
      if (disposed || !artReady) return;
      let count = 0;
      while (tileQueue.length > 0 && count < 2) {
        const job = tileQueue.shift();
        if (job?.el?.isConnected) drawTileToBlob(job.el, job.spec, job.rect, job.key);
        count++;
      }
      if (tileQueue.length > 0) tileRaf = requestAnimationFrame(flushTiles);
    };

    const refreshGpuTiles = () => {
      if (!artReady || disposed || BOOT.videoUrl) return;
      const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
      const shell = resolvedShell();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const qSet = new Set(tileQueue.map((j) => j.el));
      for (const spec of GPU_TARGETS) {
        const lp = resolveZone(cur, spec.kind === "sidebar" ? "sidebar" : "cards");
        const sig = `${shell}:${lp.transparency}:${lp.refractScale}:${lp.blurScale}:${lp.rimIntensity}:${accentUnit.map((v) => v.toFixed(2)).join(",")}:${vw}x${vh}`;
        for (const el of querySafe(spec.selector)) {
          if (el.closest(`#${PLUGIN_HOST_ID}`)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 16) continue;
          const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}x${Math.round(rect.height)}:${sig}`;
          if (activeTileUrls.get(el)?.key === key) continue;
          if (!qSet.has(el)) { tileQueue.push({ el, spec, rect, key }); qSet.add(el); }
        }
      }
      if (tileQueue.length > 0 && !tileRaf) tileRaf = requestAnimationFrame(flushTiles);
    };

    let opticsRaf = 0;
    const refreshAllOptics = () => {
      if (disposed || opticsRaf) return;
      opticsRaf = requestAnimationFrame(() => {
        opticsRaf = 0;
        if (disposed) return;
        syncSvgLenses();
        refreshGpuTiles();
      });
    };

    initWebGL();

    // Tier 3: Segmented Pill Spring & Interactive FX Canvas
    const segStates = new WeakMap();
    const activeSegTracks = new Set();
    const segSprings = new Map();
    let segRaf = 0;
    let lastSegTime = 0;

    const findActiveSeg = (track) => {
      const items = [...track.children].filter((c) => c.matches?.('[role="tab"], [role="radio"], button, a'));
      if (items.length < 2) return null;
      return items.find((c) =>
        c.getAttribute("aria-selected") === "true" ||
        c.getAttribute("aria-checked") === "true" ||
        c.getAttribute("aria-pressed") === "true" ||
        c.getAttribute("data-pressed") === "true" ||
        c.getAttribute("data-state") === "active" ||
        c.getAttribute("data-state") === "on" ||
        c.hasAttribute("aria-current")
      ) || items[0];
    };

    const stepSegSprings = (nowTs) => {
      segRaf = 0;
      const dt = Math.min(0.032, Math.max(0.004, ((nowTs - lastSegTime) || 16.6) / 1000));
      lastSegTime = nowTs;
      for (const [track, st] of segSprings) {
        if (!track.isConnected) { segSprings.delete(track); continue; }
        st.vx += (-380 * (st.x - st.tx) - 26 * st.vx) * dt;
        st.x += st.vx * dt;
        st.vw += (-380 * (st.w - st.tw) - 26 * st.vw) * dt;
        st.w += st.vw * dt;
        const sx = 1 + Math.min(0.18, Math.abs(st.vx) / 1800);
        const done = Math.abs(st.x - st.tx) < 0.25 && Math.abs(st.vx) < 1.2 && Math.abs(st.w - st.tw) < 0.25;
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

    const syncSegTrack = (track, animate = true) => {
      if (!track?.isConnected) return;
      const active = findActiveSeg(track);
      if (!active) return;
      const prev = segStates.get(track);
      if (prev && prev.activeEl === active && !animate) return;
      if (track.getAttribute("data-dream-lg-seg") !== "1") track.setAttribute("data-dream-lg-seg", "1");
      const tr = track.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      if (tr.width <= 0 || ar.width <= 0) return;
      const tx = ar.left - tr.left;
      const tw = ar.width;
      if (prev && Math.abs(prev.tx - tx) < 0.5 && Math.abs(prev.tw - tw) < 0.5) { prev.activeEl = active; return; }
      if (!animate || reducedMotion || !prev) {
        segStates.set(track, { tx, tw, activeEl: active });
        track.style.setProperty("--ds-lg-seg-x", `${tx.toFixed(2)}px`);
        track.style.setProperty("--ds-lg-seg-w", `${tw.toFixed(2)}px`);
        track.style.setProperty("--ds-lg-seg-sx", "1");
        return;
      }
      const existing = segSprings.get(track) || { x: prev.tx, vx: 0, tx, w: prev.tw, vw: 0, tw };
      existing.tx = tx; existing.tw = tw;
      segStates.set(track, { tx, tw, activeEl: active });
      segSprings.set(track, existing);
      if (!segRaf) { lastSegTime = performance.now(); segRaf = requestAnimationFrame(stepSegSprings); }
    };

    const rescanSegTracks = () => {
      for (const track of querySafe('[data-slot="toggle-group"], [role="tablist"], [role="radiogroup"]')) {
        if (track.closest(`#${PLUGIN_HOST_ID}`)) continue;
        const tr = track.getBoundingClientRect();
        const items = [...track.children].filter((c) => c.matches?.('[role="tab"], [role="radio"], button'));
        const isCompactSeg = tr.height > 0 && tr.height <= 52 && items.length >= 2 && items.length <= 6
          && items.every((c) => c.getBoundingClientRect().height <= 46)
          && items.some((c) => c.hasAttribute("data-pressed") || c.hasAttribute("aria-pressed") || c.hasAttribute("aria-checked") || c.hasAttribute("aria-selected"));
        if (isCompactSeg) {
          activeSegTracks.add(track);
          syncSegTrack(track, false);
        } else if (track.hasAttribute("data-dream-lg-seg")) {
          activeSegTracks.delete(track);
          track.removeAttribute("data-dream-lg-seg");
          track.style.removeProperty("--ds-lg-seg-x");
          track.style.removeProperty("--ds-lg-seg-w");
          track.style.removeProperty("--ds-lg-seg-sx");
        }
      }
    };

    const springNodes = new Map();
    let springRaf = 0;
    let lastSpringTime = 0;
    const stepSprings = (t) => {
      springRaf = 0;
      const dt = Math.min(0.032, Math.max(0.004, ((t - lastSpringTime) || 16.6) / 1000));
      lastSpringTime = t;
      for (const [el, st] of springNodes) {
        if (!el.isConnected) { springNodes.delete(el); continue; }
        st.vs += (-st.stiffness * (st.s - st.ts) - st.damping * st.vs) * dt;
        st.s += st.vs * dt;
        if (Math.abs(st.s - st.ts) < 0.0008 && Math.abs(st.vs) < 0.004) {
          springNodes.delete(el);
          if (st.ts === 1) { el.style.removeProperty("transform"); el.style.removeProperty("transition"); delete el.dataset.dsLgTouchTransform; }
          else el.style.transform = `scale(${st.ts.toFixed(4)})`;
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
      if (!st) { st = { s: 1, vs: 0, ts: 1, stiffness: target.stiffness ?? 500, damping: target.damping ?? 27 }; springNodes.set(el, st); }
      if (initVel && typeof initVel.vs === "number") st.vs = initVel.vs;
      if (typeof target.ts === "number") st.ts = target.ts;
      if (typeof target.stiffness === "number") st.stiffness = target.stiffness;
      if (typeof target.damping === "number") st.damping = target.damping;
      if (!springRaf) { lastSpringTime = performance.now(); springRaf = requestAnimationFrame(stepSprings); }
    };

    // Crystal Spark & Sheen FX Canvas
    document.getElementById(LG_CANVAS_ID)?.remove();
    const fxCanvas = document.createElement("canvas");
    fxCanvas.id = LG_CANVAS_ID;
    fxCanvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147482500;";
    (document.body || root).appendChild(fxCanvas);
    const fxCtx = fxCanvas.getContext("2d");
    const particles = [];
    let fxRaf = 0;
    let hoveredRect = null;
    let hoveredRadius = 14;
    let hoverX = 0;
    let hoverY = 0;
    let hoverAlpha = 0;

    const sizeFxCanvas = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      fxCanvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      fxCanvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      fxCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      radiusCache = new WeakMap();
      syncBrowserHoleClip();
      refreshAllOptics();
      for (const t of activeSegTracks) syncSegTrack(t, false);
    };
    sizeFxCanvas();

    const stepFx = () => {
      fxRaf = 0;
      if (!fxCtx || !fxCanvas.isConnected || disposed) return;
      fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (hoveredRect && hoverAlpha > 0.02) {
        const rad = Math.min(hoveredRadius, hoveredRect.width * 0.5, hoveredRect.height * 0.5);
        const g = fxCtx.createRadialGradient(hoverX, hoverY, 2, hoverX, hoverY, 130);
        g.addColorStop(0, `rgba(255,255,255,${(0.75 * hoverAlpha).toFixed(3)})`);
        g.addColorStop(0.45, `rgba(255,255,255,${(0.22 * hoverAlpha).toFixed(3)})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        fxCtx.save();
        fxCtx.strokeStyle = g;
        fxCtx.lineWidth = 1.4;
        fxCtx.beginPath();
        if (typeof fxCtx.roundRect === "function") fxCtx.roundRect(hoveredRect.left + 0.5, hoveredRect.top + 0.5, Math.max(0, hoveredRect.width - 1), Math.max(0, hoveredRect.height - 1), rad);
        else fxCtx.rect(hoveredRect.left + 0.5, hoveredRect.top + 0.5, Math.max(0, hoveredRect.width - 1), Math.max(0, hoveredRect.height - 1));
        fxCtx.stroke();
        fxCtx.restore();
        hoverAlpha *= 0.84;
      } else hoverAlpha = 0;

      const tNow = performance.now();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const age = (tNow - p.t0) / p.life;
        if (age >= 1) { particles.splice(i, 1); continue; }
        const ease = 1 - Math.pow(1 - age, 3);
        const a = p.alpha * Math.pow(1 - age, 1.6);
        if (p.kind === "ring") {
          fxCtx.beginPath();
          fxCtx.arc(p.x, p.y, 4 + ease * p.r, 0, Math.PI * 2);
          fxCtx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          fxCtx.lineWidth = 1.3 * (1 - age * 0.5);
          fxCtx.stroke();
        } else {
          fxCtx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          fxCtx.beginPath();
          fxCtx.arc(p.x + p.vx * ease, p.y + p.vy * ease + 12 * age * age, p.r * (1 - age * 0.45), 0, Math.PI * 2);
          fxCtx.fill();
        }
      }
      if (particles.length > 0 || (hoveredRect && hoverAlpha > 0.02)) fxRaf = requestAnimationFrame(stepFx);
    };

    const ensureFxRaf = () => { if (!fxRaf && !disposed) fxRaf = requestAnimationFrame(stepFx); };
    const emitSparks = (x, y) => {
      if (window.__dsCurrentLiveParams?.particlesEnabled === false || reducedMotion || liteMotion) return;
      const tNow = performance.now();
      particles.push({ kind: "ring", x, y, r: 22, t0: tNow, life: 320, alpha: 0.48 });
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.4;
        const sp = 16 + Math.random() * 24;
        particles.push({ kind: "spark", x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 4, r: 1.4 + Math.random(), t0: tNow, life: 300 + Math.random() * 80, alpha: 0.72 });
      }
      if (particles.length > 36) particles.splice(0, particles.length - 36);
      ensureFxRaf();
    };

    const INTERACTIVE_SEL = '[data-ds-part="sidebar"] button, [data-ds-part="sidebar"] a, .agy-sidebar-row, [data-testid="conversation-row-sidebar"], .surface-composer button, .surface-composer-card button, .agy-takeover-card button, [data-side-panel-body="true"] button, .agy-dialog button, [role="menuitem"], [role="option"], [role="radio"], [role="switch"]';
    const GLASS_CARD_SEL = `${COMPOSER_SEL}, ${RAIL_SEL}, ${WRITING_SEL}, .agy-card, [role="dialog"], [role="menu"]`;

    let activePress = null;
    let hoveredCard = null;
    let hoverPairRoot = null;
    let hoveredBtn = null;

    const clearHover = () => {
      if (hoveredCard?.isConnected) hoveredCard.removeAttribute("data-dream-lg-hover");
      if (hoverPairRoot?.isConnected) hoverPairRoot.querySelectorAll("[data-dream-lg-pair-active]").forEach((n) => n.removeAttribute("data-dream-lg-pair-active"));
      hoveredCard = null; hoverPairRoot = null; hoveredBtn = null; hoveredRect = null;
    };

    const onPointerOver = (e) => {
      if (e.target?.closest?.(`#${PLUGIN_HOST_ID}`)) return;
      const card = e.target?.closest?.(GLASS_CARD_SEL) || null;
      if (card !== hoveredCard) {
        clearHover();
        hoveredCard = card;
        if (card) {
          card.setAttribute("data-dream-lg-hover", "1");
          if (card.matches?.(COMPOSER_SEL) || card.matches?.(RAIL_SEL)) {
            const pair = card.closest?.('[data-testid="agent-input-box"], .surface-composer');
            if (pair) {
              hoverPairRoot = pair;
              pair.querySelectorAll(`${COMPOSER_SEL}, ${RAIL_SEL}`).forEach((n) => n.setAttribute("data-dream-lg-pair-active", "1"));
            }
          }
        }
      }
      const btn = e.target?.closest?.(INTERACTIVE_SEL) || null;
      if (btn && btn !== hoveredBtn && !reducedMotion && !liteMotion) {
        hoveredBtn = btn;
        hoveredRect = btn.getBoundingClientRect();
        hoveredRadius = getRadiusPx(btn, 12);
        hoverX = e.clientX; hoverY = e.clientY; hoverAlpha = 1;
        ensureFxRaf();
      }
    };

    const onPointerMove = (e) => {
      if (activePress && !activePress.cancelled && Math.hypot(e.clientX - activePress.x0, e.clientY - activePress.y0) > 18) {
        activePress.cancelled = true;
        setSpringTarget(activePress.el, { ts: 1, stiffness: 460, damping: 27 });
      }
      if (hoveredBtn && hoveredRect && !reducedMotion && !liteMotion) {
        hoverX = e.clientX; hoverY = e.clientY; hoverAlpha = 1;
        ensureFxRaf();
      }
    };

    const onPointerOut = (e) => {
      const next = e.relatedTarget;
      if (!next || (hoveredCard && !hoveredCard.contains(next))) clearHover();
      if (activePress && !activePress.cancelled && next && !activePress.el.contains(next)) {
        activePress.cancelled = true;
        setSpringTarget(activePress.el, { ts: 1, stiffness: 460, damping: 27 });
      }
    };

    const onPointerDown = (e) => {
      if (e.button !== 0 || e.target?.closest?.(`#${PLUGIN_HOST_ID}`)) return;
      const btn = e.target?.closest?.(INTERACTIVE_SEL);
      if (!btn) return;
      activePress = { el: btn, x0: e.clientX, y0: e.clientY, cancelled: false };
      setSpringTarget(btn, { ts: 0.964, stiffness: 580, damping: 28 });
      emitSparks(e.clientX, e.clientY);
      const track = btn.closest?.('[data-slot="toggle-group"], [role="tablist"], [role="radiogroup"]');
      if (track && activeSegTracks.has(track)) requestAnimationFrame(() => syncSegTrack(track, true));
    };

    const onPointerUp = () => {
      if (activePress && !activePress.cancelled) setSpringTarget(activePress.el, { ts: 1, stiffness: 420, damping: 22 }, { vs: 0.42 });
      activePress = null;
    };

    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("resize", sizeFxCanvas, { passive: true });

    // Floating Composer Over Scrolling Thread Layout (makes conversation prose flow & refract behind composer glass)
    let activeThreadShell = null;
    let activeThreadScroll = null;
    let activeComposerDock = null;
    const clearThreadOverlayMarkers = () => {
      if (activeThreadShell) {
        activeThreadShell.removeAttribute("data-dream-agy-thread-shell");
        activeThreadShell.style.removeProperty("--ds-agy-dock-h");
      }
      if (activeThreadScroll) activeThreadScroll.removeAttribute("data-dream-agy-thread-scroll");
      if (activeComposerDock) activeComposerDock.removeAttribute("data-dream-agy-composer-dock");
      activeThreadShell = null;
      activeThreadScroll = null;
      activeComposerDock = null;
    };

    const syncThreadOverlayLayout = () => {
      if (disposed) return;
      for (const sc of querySafe('[data-testid="agent-input-box"] .surface-composer, .surface-composer')) {
        const tb = sc.querySelector('[data-testid="input-box-bottom-toolbar"]');
        const hasVisibleRail = Boolean(tb && tb.getBoundingClientRect().height > 4);
        if (hasVisibleRail) setAttribute(sc, "data-dream-agy-has-rail", "1");
        else sc.removeAttribute("data-dream-agy-has-rail");
      }

      const viewport = document.querySelector('[data-testid="autoscroll-viewport"]');
      let foundShell = null;
      let foundScroll = null;
      let foundDock = null;
      if (viewport) {
        let cur = viewport.parentElement;
        for (let depth = 0; depth < 5 && cur && cur.parentElement; depth += 1) {
          const parent = cur.parentElement;
          const dock = [...parent.children].find((ch) => ch !== cur && ch.querySelector?.('[data-testid="agent-input-box"]'));
          if (dock && !dock.querySelector?.('[data-has-browser-hole="true"]')) {
            foundShell = parent;
            foundScroll = cur;
            foundDock = dock;
            break;
          }
          cur = parent;
        }
      }

      if (!foundShell || !foundScroll || !foundDock) {
        clearThreadOverlayMarkers();
        return;
      }
      if (activeThreadShell && activeThreadShell !== foundShell) clearThreadOverlayMarkers();
      activeThreadShell = foundShell;
      activeThreadScroll = foundScroll;
      activeComposerDock = foundDock;
      setAttribute(foundShell, "data-dream-agy-thread-shell", "1");
      setAttribute(foundScroll, "data-dream-agy-thread-scroll", "1");
      setAttribute(foundDock, "data-dream-agy-composer-dock", "1");
      const dockH = Math.max(84, Math.ceil(foundDock.getBoundingClientRect().height));
      setStyleProperty(foundShell, "--ds-agy-dock-h", `${dockH}px`);
    };

    let wasBusy = false;
    let settledTimer = 0;
    const syncBusyState = () => {
      if (disposed) return;
      const stopBtn = document.querySelector(
        '[data-testid="agent-input-box"] :is(button[aria-label*="stop" i], button[aria-label*="cancel" i], button[aria-label*="停止"], [data-testid*="stop"], [data-testid*="cancel"])'
      );
      const busy = Boolean(stopBtn && !stopBtn.disabled && stopBtn.offsetParent !== null);
      if (busy) {
        wasBusy = true;
        clearTimeout(settledTimer);
        root.removeAttribute("data-dream-lg-settled");
        setAttribute(root, "data-dream-lg-busy", "true");
      } else {
        root.removeAttribute("data-dream-lg-busy");
        if (wasBusy) {
          wasBusy = false;
          setAttribute(root, "data-dream-lg-settled", "1");
          clearTimeout(settledTimer);
          settledTimer = setTimeout(() => root.removeAttribute("data-dream-lg-settled"), 740);
        }
      }
    };

    let resizeObs = null;
    const observedNodes = new WeakSet();
    const observeOpticsTargets = () => {
      if (!resizeObs) return;
      for (const sel of [COMPOSER_SEL, RAIL_SEL, WRITING_SEL, '[data-ds-part="sidebar"]', '[data-dream-agy-composer-dock="1"]', '[data-has-browser-hole="true"]:not(body)']) {
        for (const n of querySafe(sel)) {
          if (!observedNodes.has(n) && !n.closest(`#${PLUGIN_HOST_ID}`)) {
            observedNodes.add(n);
            resizeObs.observe(n);
          }
        }
      }
    };
    if (typeof ResizeObserver === "function") {
      resizeObs = new ResizeObserver(() => {
        syncThreadOverlayLayout();
        syncBrowserHoleClip();
        refreshAllOptics();
      });
      observeOpticsTargets();
    }

    let domTimer = 0;
    const domObs = new MutationObserver((records) => {
      let dirty = false;
      let enterCount = 0;
      for (const rec of records) {
        if (rec.type === "childList") {
          const tEl = rec.target?.nodeType === 1 ? rec.target : null;
          if (tEl?.closest?.(`#${PLUGIN_HOST_ID}, #${WALLPAPER_LAYER_ID}, [data-lexical-editor="true"], [contenteditable="true"], .ProseMirror`)) continue;
          for (const n of rec.addedNodes) {
            if (n.nodeType !== 1 || n.id === LG_SVG_ID || n.id === LG_CANVAS_ID || n.id === PLUGIN_HOST_ID || n.id === WALLPAPER_LAYER_ID) continue;
            dirty = true;
            if (!reducedMotion && enterCount < 2 && n.matches?.('.agy-user-bubble, .artifact-card, .agy-dialog, [role="dialog"], [role="menu"], [role="listbox"], .compact-tooltip, .agy-toast') && !n.hasAttribute("data-dream-lg-seen")) {
              n.setAttribute("data-dream-lg-seen", "enter");
              enterCount += 1;
            }
          }
          if (!dirty) {
            for (const n of rec.removedNodes) {
              if (n.nodeType === 1 && n.id !== LG_SVG_ID && n.id !== LG_CANVAS_ID && n.id !== PLUGIN_HOST_ID && n.id !== WALLPAPER_LAYER_ID) {
                dirty = true;
                break;
              }
            }
          }
        } else if (rec.type === "attributes") {
          if (rec.attributeName === "data-has-browser-hole") syncBrowserHoleClip();
          if (rec.attributeName === "aria-label") dirty = true;
          const track = rec.target?.closest?.('[data-slot="toggle-group"], [role="tablist"], [role="radiogroup"]');
          if (track && activeSegTracks.has(track)) syncSegTrack(track, true);
        }
        if (dirty && (reducedMotion || enterCount >= 2)) break;
      }
      if (dirty) {
        clearTimeout(domTimer);
        domTimer = setTimeout(() => {
          domTimer = 0;
          if (disposed) return;
          refreshParts();
          syncThreadOverlayLayout();
          syncBrowserHoleClip();
          syncBusyState();
          refreshAllOptics();
          rescanSegTracks();
          observeOpticsTargets();
        }, 120);
      }
    });
    domObs.observe(document.body || root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected", "aria-checked", "aria-pressed", "aria-label", "data-pressed", "data-state", "data-has-browser-hole"],
    });

    syncThreadOverlayLayout();
    syncBusyState();
    rescanSegTracks();
    observeOpticsTargets();
    refreshAllOptics();

    let paramDebounce = 0;
    window.__dsLgApplyLiveParams = () => {
      const f = resolveMotionFlags();
      reducedMotion = f.reduced;
      liteMotion = f.lite;
      setAttribute(root, "data-dream-lg-motion", reducedMotion ? "reduced" : (liteMotion ? "lite" : "full"));
      syncSvgLenses();
      clearTimeout(paramDebounce);
      paramDebounce = setTimeout(() => { if (!disposed) refreshGpuTiles(); }, 48);
    };
    window.__dsLgRefreshAccentOptics = () => {
      if (disposed) return;
      syncAccentUnits();
      syncSvgLenses();
      refreshGpuTiles();
    };

    return () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(fxRaf);
      cancelAnimationFrame(springRaf);
      cancelAnimationFrame(segRaf);
      cancelAnimationFrame(tileRaf);
      cancelAnimationFrame(opticsRaf);
      clearTimeout(domTimer);
      clearTimeout(settledTimer);
      clearTimeout(paramDebounce);
      clearThreadOverlayMarkers();
      resizeObs?.disconnect();
      domObs.disconnect();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", sizeFxCanvas);
      for (const u of allBlobUrls) URL.revokeObjectURL(u);
      allBlobUrls.clear();
      activeTileUrls.clear();
      try { gl?.getExtension("WEBGL_lose_context")?.loseContext(); } catch {}
      document.getElementById(LG_SVG_ID)?.remove();
      document.getElementById(LG_CANVAS_ID)?.remove();
      root.removeAttribute("data-dream-lg-busy");
      root.removeAttribute("data-dream-lg-settled");
      for (const n of document.querySelectorAll("[data-dream-lg-gpu], [data-dream-lg-filter], [data-dream-lg-seg], [data-dream-lg-seen], [data-dream-lg-hover], [data-dream-lg-pair-active], [data-dream-agy-has-rail]")) {
        n.removeAttribute("data-dream-lg-gpu");
        n.removeAttribute("data-dream-lg-filter");
        n.removeAttribute("data-dream-lg-seg");
        n.removeAttribute("data-dream-lg-seen");
        n.removeAttribute("data-dream-lg-hover");
        n.removeAttribute("data-dream-lg-pair-active");
        n.removeAttribute("data-dream-agy-has-rail");
        n.style.removeProperty("--ds-lg-gpu-bg");
        n.style.removeProperty("--ds-lg-lens-filter");
        n.style.removeProperty("--ds-lg-lens-rail");
        n.style.removeProperty("--ds-lg-lens-writing");
      }
      delete window.__dsLgApplyLiveParams;
      delete window.__dsLgRefreshAccentOptics;
    };
  };

  // === Floating Crystal Orb Studio (v3) ===
  const studioRuntime = {
    open: Boolean(BOOT.pluginUi?.panelOpen),
    activeTab: BOOT.pluginUi?.activeTab || "themes",
    selectedZone: BOOT.pluginUi?.selectedZone || "global",
    pillMode: BOOT.pluginUi?.pillMode === "pill" ? "pill" : "orb",
    posX: Number.isFinite(BOOT.pluginUi?.posX) ? BOOT.pluginUi.posX : 0.96,
    posY: Number.isFinite(BOOT.pluginUi?.posY) ? BOOT.pluginUi.posY : 0.88,
    search: "",
    filterKind: "all",
    barePreview: false,
    catalog: Array.isArray(BOOT.themesCatalog) ? BOOT.themesCatalog : [],
    guardConfig: BOOT.guardConfig || {},
    opticalPresets: BOOT.opticalPresets || { schemaVersion: 1, defaultPresetId: null, presets: [] },
    selectedPresetId: null,
    inited: false,
  };

  const rpcCallbacks = new Map();
  let rpcSeq = 1;
  window.__agyDsPluginReply = (reply) => {
    if (!reply || typeof reply !== "object") return;
    const cb = rpcCallbacks.get(reply.id);
    if (!cb) return;
    rpcCallbacks.delete(reply.id);
    cb.resolve(reply.result ?? null);
  };

  const callRpc = (action, payload = {}) => new Promise((resolve) => {
    const id = `rpc-${Date.now()}-${rpcSeq++}`;
    const timer = setTimeout(() => { rpcCallbacks.delete(id); resolve({ ok: false, timeout: true }); }, 15000);
    rpcCallbacks.set(id, {
      resolve: (res) => { clearTimeout(timer); resolve(res); },
    });
    const packet = JSON.stringify({ id, action, payload });
    try {
      if (typeof window[RPC_FN] === "function") {
        window[RPC_FN](packet);
      } else {
        window.__agyDsRpcQueue = window.__agyDsRpcQueue || [];
        window.__agyDsRpcQueue.push(packet);
      }
    } catch {
      clearTimeout(timer);
      rpcCallbacks.delete(id);
      resolve({ ok: false });
    }
  });

  const thumbMemCache = new Map();
  const thumbQueue = [];
  let thumbBusy = false;
  const runThumbWorker = async () => {
    if (thumbBusy || !thumbQueue.length) return;
    thumbBusy = true;
    while (thumbQueue.length > 0) {
      const job = thumbQueue.shift();
      if (!job) continue;
      if (thumbMemCache.has(job.id)) { job.onDone(thumbMemCache.get(job.id)); continue; }
      try {
        let src = job.thumbDataUrl;
        if (!src) {
          const res = await callRpc("getThemeThumbSource", { themeId: job.id });
          if (res?.thumbDataUrl) {
            thumbMemCache.set(job.id, res.thumbDataUrl);
            job.onDone(res.thumbDataUrl);
            continue;
          }
          src = res?.rawDataUrl || "";
        }
        if (!src) { job.onDone(""); continue; }
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
        const tw = 240; const th = 150;
        const cv = document.createElement("canvas");
        cv.width = tw; cv.height = th;
        const ctx = cv.getContext("2d");
        const sRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
        const tRatio = tw / th;
        let sx = 0; let sy = 0; let sw = img.naturalWidth; let sh = img.naturalHeight;
        if (sRatio > tRatio) { sw = img.naturalHeight * tRatio; sx = (img.naturalWidth - sw) * (job.focusX ?? 0.5); }
        else { sh = img.naturalWidth / tRatio; sy = (img.naturalHeight - sh) * (job.focusY ?? 0.45); }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
        const outUrl = cv.toDataURL("image/jpeg", 0.82);
        thumbMemCache.set(job.id, outUrl);
        job.onDone(outUrl);
        callRpc("saveThemeThumb", { themeId: job.id, thumbDataUrl: outUrl }).catch(() => {});
      } catch {
        job.onDone("");
      }
      await new Promise((r) => setTimeout(r, 12));
    }
    thumbBusy = false;
  };

  let studioCleanupFn = null;
  let studioRefreshFn = null;
  const mountStudio = () => {
    if (!BOOT.studioBundle || window[DISABLED_KEY]) return;
    if (studioRefreshFn && document.getElementById(PLUGIN_HOST_ID)) {
      studioRefreshFn();
      return;
    }
    let host = document.getElementById(PLUGIN_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = PLUGIN_HOST_ID;
      document.documentElement.appendChild(host);
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });

    const marginX = 14;
    const marginTop = 44;
    const marginBottom = 14;
    const getBounds = (w, h) => ({
      minX: marginX,
      maxX: Math.max(marginX, window.innerWidth - w - marginX),
      minY: marginTop,
      maxY: Math.max(marginTop, window.innerHeight - h - marginBottom),
    });
    const fracToPx = (fx, fy, w, h) => {
      const b = getBounds(w, h);
      return { x: b.minX + clamp(fx, 0, 1) * (b.maxX - b.minX), y: b.minY + clamp(fy, 0, 1) * (b.maxY - b.minY) };
    };
    const pxToFrac = (x, y, w, h) => {
      const b = getBounds(w, h);
      return {
        posX: b.maxX === b.minX ? 0.96 : clamp((x - b.minX) / (b.maxX - b.minX), 0, 1),
        posY: b.maxY === b.minY ? 0.88 : clamp((y - b.minY) / (b.maxY - b.minY), 0, 1),
      };
    };

    const persistUi = () => {
      callRpc("setPluginUi", {
        ui: {
          pillMode: studioRuntime.pillMode,
          pillMinimized: studioRuntime.pillMode === "orb",
          panelOpen: studioRuntime.open,
          activeTab: studioRuntime.activeTab,
          selectedZone: studioRuntime.selectedZone,
          posX: studioRuntime.posX,
          posY: studioRuntime.posY,
        },
      }).catch(() => {});
    };

    const ensureScaffold = () => {
      if (shadow.getElementById("ds-fab")) return;
      const st = document.createElement("style");
      st.setAttribute("data-ds-studio-style", "1");
      shadow.appendChild(st);

      const wrap = document.createElement("div");
      wrap.className = "wrap";
      wrap.innerHTML = `
        <button type="button" class="fab" id="ds-fab" title="JBY Liquid Glass · Antigravity (Ctrl+Shift+D)">
          <span class="fab-orb-ico">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9"/><path d="M8.5 14.5A4.5 4.5 0 0 0 15.5 9"/></svg>
          </span>
          <span class="fab-pill-body">
            <span class="fab-dot"></span>
            <span>皮肤</span>
            <span class="fab-badge" id="ds-fab-badge"></span>
          </span>
        </button>

        <section class="drawer" id="ds-drawer" hidden>
          <header class="drawer-head" id="ds-drag-handle">
            <div class="head-left">
              <div class="orb-mark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div class="title-col">
                <div class="title">JBY Liquid Glass · Antigravity</div>
                <div class="sub" id="ds-head-sub"></div>
              </div>
            </div>
            <div class="head-actions">
              <button type="button" class="mini-btn" id="ds-bare-toggle">对比原版</button>
              <button type="button" class="icon-btn" id="ds-close-drawer" title="收起 (Ctrl+Shift+D)">×</button>
            </div>
          </header>

          <nav class="tabs" role="tablist">
            <div class="tab-slider" id="ds-tab-slider"></div>
            <button type="button" class="tab" role="tab" data-tab="themes" aria-selected="true">皮肤与壁纸</button>
            <button type="button" class="tab" role="tab" data-tab="tune" aria-selected="false">光学分区</button>
            <button type="button" class="tab" role="tab" data-tab="auto" aria-selected="false">守护设置</button>
          </nav>

          <div class="body">
            <div class="view" data-view="themes">
              <div class="media-bar">
                <button type="button" class="mini-btn" id="ds-pick-media">自定义壁纸 / 视频</button>
                <button type="button" class="mini-btn" id="ds-reset-media" hidden>恢复默认图</button>
                <button type="button" class="mini-btn" id="ds-import-zip">导入 ZIP</button>
              </div>
              <div class="search-row">
                <input type="text" class="search" id="ds-search" placeholder="搜索皮肤、主题或编号..." autocomplete="off" spellcheck="false" />
                <div class="filter-chips">
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
                  <span>光学预设 · <strong id="ds-preset-status">自定义</strong></span>
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
                  <span>光学分区 · <strong id="ds-zone-status">全部全局</strong></span>
                  <button type="button" class="mini-reset" id="ds-reset-zone" hidden>重置本区</button>
                </div>
                <div class="zone-chips">
                  <button type="button" class="chip" data-zone="global">全部</button>
                  <button type="button" class="chip" data-zone="composer">输入栏</button>
                  <button type="button" class="chip" data-zone="writing">气泡·产物</button>
                  <button type="button" class="chip" data-zone="sidebar">侧边栏</button>
                  <button type="button" class="chip" data-zone="cards">面板·卡片</button>
                  <button type="button" class="chip" data-zone="popover">弹窗·胶囊</button>
                </div>
              </div>
              <div class="tune-group">
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
                <div class="seg-group">
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
                <div class="seg-group">
                  <button type="button" class="chip" data-pillmode="orb">晶透圆钮</button>
                  <button type="button" class="chip" data-pillmode="pill">极简胶囊</button>
                </div>
              </div>
              <label class="row-card toggle-row">
                <span>开启 Antigravity 自动挂载皮肤</span>
                <input type="checkbox" id="ds-guard-enabled" />
              </label>
              <label class="row-card toggle-row">
                <span>开机自动打开 Antigravity</span>
                <input type="checkbox" id="ds-guard-launch" />
              </label>
              <div class="btn-pair">
                <button type="button" class="btn-wide" id="ds-reapply-btn">立即重绘光学层</button>
                <button type="button" class="btn-wide" data-folder="themes">打开主题目录</button>
              </div>
              <button type="button" class="btn-wide" data-folder="images">打开自定义壁纸目录</button>
            </div>
          </div>
        </section>
      `;
      shadow.appendChild(wrap);
    };

    const syncStudioStyles = () => {
      const styleEl = shadow.querySelector("style[data-ds-studio-style]");
      if (!styleEl) return;
      const isDark = resolvedShell() === "dark";
      const accent = THEME.accent || THEME.colors?.accent || (isDark ? "#7aa2ff" : "#2f75c3");
      styleEl.textContent = `
        :host {
          all: initial;
          position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
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
          --rim: ${isDark ? "rgba(255,255,255,0.24)" : "rgba(18,28,48,0.16)"};
          --spec: ${isDark ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.96)"};
          --glass-drawer: ${isDark ? "linear-gradient(156deg, rgba(20,25,40,0.78), rgba(12,16,26,0.64))" : "linear-gradient(156deg, rgba(255,255,255,0.72), rgba(246,249,255,0.52))"};
          --glass-fab: ${isDark ? "linear-gradient(150deg, rgba(255,255,255,0.20), rgba(18,24,38,0.42))" : "linear-gradient(150deg, rgba(255,255,255,0.44), rgba(255,255,255,0.16))"};
          --card: ${isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.54)"};
          --card-hi: ${isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.82)"};
          position: fixed; inset: 0; pointer-events: none; color: var(--fg);
        }
        .fab {
          pointer-events: auto; position: fixed; left: 0; top: 0; height: 38px; width: 38px; padding: 0; border-radius: 999px;
          display: flex; align-items: center; justify-content: center;
          background: var(--glass-fab); border: 1px solid var(--rim);
          backdrop-filter: blur(10px) saturate(1.5); -webkit-backdrop-filter: blur(10px) saturate(1.5);
          box-shadow: 0 12px 28px -6px rgba(10,16,32,${isDark ? "0.52" : "0.22"}), inset 0 1.5px 1px var(--spec);
          touch-action: none; will-change: transform;
          transition: width 220ms cubic-bezier(0.22,1.18,0.36,1), box-shadow 180ms ease;
        }
        .fab::after, .drawer::after {
          content: ""; position: absolute; inset: 0; padding: 1.25px; border-radius: inherit; pointer-events: none;
          background: linear-gradient(138deg, rgba(255,255,255,0.92), rgba(255,255,255,0.20) 45%, rgba(255,255,255,0.58));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
        }
        .fab[data-mode="orb"] .fab-pill-body { display: none; }
        .fab[data-mode="orb"] .fab-orb-ico { display: inline-flex; }
        .fab[data-mode="pill"] { width: auto; max-width: 196px; height: 34px; padding: 0 12px 0 10px; }
        .fab[data-mode="pill"] .fab-orb-ico { display: none; }
        .fab[data-mode="pill"] .fab-pill-body { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 560; white-space: nowrap; }
        .fab-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--acc); box-shadow: 0 0 8px var(--acc); }
        .fab-badge { max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--muted); padding: 2px 7px; border-radius: 999px; background: var(--card); }
        .fab[hidden], .drawer[hidden], .view[hidden], .mini-btn[hidden], .mini-reset[hidden] { display: none !important; }
        .drawer {
          pointer-events: auto; position: fixed; left: 0; top: 0;
          width: min(382px, calc(100vw - 28px)); height: min(540px, calc(100vh - 68px));
          border-radius: 24px; display: flex; flex-direction: column; overflow: hidden;
          background: var(--glass-drawer); border: 1px solid var(--rim);
          backdrop-filter: blur(18px) saturate(1.52); -webkit-backdrop-filter: blur(18px) saturate(1.52);
          box-shadow: 0 28px 64px -12px rgba(10,16,30,${isDark ? "0.68" : "0.28"}), inset 0 1.5px 1px var(--spec);
          will-change: transform;
        }
        .drawer-head {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 13px 14px 10px; cursor: grab; touch-action: none;
          border-bottom: 1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(18,28,48,0.07)"};
        }
        .head-left { display: flex; align-items: center; gap: 9px; min-width: 0; }
        .orb-mark { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--card-hi); border: 1px solid var(--rim); }
        .title-col { min-width: 0; }
        .title { font-size: 13px; font-weight: 620; }
        .sub { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
        .head-actions { display: flex; align-items: center; gap: 6px; }
        .mini-btn, .icon-btn {
          height: 27px; border-radius: 999px; font-size: 11px; font-weight: 560;
          background: var(--card); border: 1px solid var(--rim); box-shadow: inset 0 1px 0 var(--spec);
          transition: transform 140ms ease, background-color 140ms ease;
        }
        .mini-btn { padding: 0 10px; }
        .mini-btn.active { background: var(--acc); color: #fff; border-color: transparent; }
        .icon-btn { width: 27px; display: grid; place-items: center; font-size: 15px; }
        .mini-btn:hover, .icon-btn:hover { background: var(--card-hi); transform: translateY(-1px); }
        .tabs {
          position: relative; display: grid; grid-template-columns: repeat(3, 1fr); margin: 10px 14px 4px; padding: 3px;
          border-radius: 14px; background: ${isDark ? "rgba(0,0,0,0.24)" : "rgba(18,28,48,0.06)"}; border: 1px solid var(--rim);
        }
        .tab-slider {
          position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 3);
          border-radius: 11px; background: var(--card-hi); border: 1px solid var(--rim);
          transition: transform 240ms cubic-bezier(0.22,1.22,0.36,1); pointer-events: none;
        }
        .tab { position: relative; z-index: 1; height: 28px; font-size: 12px; font-weight: 560; color: var(--muted); }
        .tab[aria-selected="true"] { color: var(--fg); font-weight: 620; }
        .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 10px 14px 14px; scrollbar-width: thin; }
        .media-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 9px; }
        .search-row { display: flex; flex-direction: column; gap: 7px; margin-bottom: 10px; }
        .search {
          width: 100%; height: 32px; padding: 0 11px; border-radius: 11px; font-size: 12px; color: var(--fg);
          background: var(--card); border: 1px solid var(--rim); outline: none;
        }
        .filter-chips, .seg-group, .zone-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
        .chip {
          position: relative; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 11px; font-weight: 540;
          color: var(--muted); background: var(--card); border: 1px solid var(--rim); transition: all 140ms ease;
        }
        .chip.active { background: var(--acc); color: #fff; border-color: transparent; }
        .chip.customized::after {
          content: ""; position: absolute; top: -2px; right: -2px; width: 6px; height: 6px; border-radius: 50%;
          background: var(--acc); border: 1px solid #fff;
        }
        .theme-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
        .theme-card {
          position: relative; display: flex; flex-direction: column; overflow: hidden; text-align: left;
          border-radius: 15px; background: var(--card); border: 1px solid var(--rim);
          transition: transform 180ms cubic-bezier(0.22,1.24,0.36,1), border-color 160ms ease;
        }
        .theme-card:hover { transform: translateY(-2px); border-color: var(--acc); }
        .theme-card.active { border: 1.5px solid var(--acc); }
        .theme-card[hidden] { display: none !important; }
        .card-thumb { position: relative; width: 100%; aspect-ratio: 16 / 10; overflow: hidden; background: ${isDark ? "#1a2033" : "#dde5f4"}; }
        .thumb-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 240ms ease; }
        .thumb-img.loaded { opacity: 1; }
        .thumb-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(10,14,26,0.52)); pointer-events: none; }
        .thumb-tag { position: absolute; top: 6px; left: 6px; padding: 2px 6px; border-radius: 999px; font-size: 9.5px; font-weight: 600; color: #fff; background: rgba(14,18,30,0.46); border: 1px solid rgba(255,255,255,0.28); }
        .thumb-active { position: absolute; top: 6px; right: 6px; padding: 2px 6px; border-radius: 999px; font-size: 9.5px; font-weight: 650; color: #fff; background: var(--acc); }
        .card-meta { padding: 7px 8px 8px; min-width: 0; }
        .card-title { font-size: 11.5px; font-weight: 620; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-sub { font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .zone-card, .slider-row, .row-card {
          padding: 9px 11px; border-radius: 14px; background: var(--card); border: 1px solid var(--rim); margin-bottom: 9px;
        }
        .zone-head, .slider-head { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; font-weight: 560; margin-bottom: 6px; }
        .zone-head strong, .slider-head .val { color: var(--acc); font-weight: 640; font-variant-numeric: tabular-nums; }
        .mini-reset { font-size: 10.5px; padding: 2px 8px; border-radius: 999px; background: var(--card-hi); border: 1px solid var(--rim); }
        .mini-reset[hidden] { display: none !important; }
        .preset-bar { display: flex; align-items: center; gap: 5px; margin-top: 7px; }
        .preset-input {
          flex: 1 1 auto; min-width: 0; height: 24px; padding: 0 8px; border-radius: 999px; font-size: 11px;
          color: var(--fg); background: var(--card-hi); border: 1px solid var(--rim); outline: none;
        }
        .preset-input:focus { border-color: var(--acc); }
        .preset-bar .chip { flex: 0 0 auto; font-size: 10.5px; height: 24px; padding: 0 8px; }
        .tune-group { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
        input[type="range"] { width: 100%; accent-color: var(--acc); height: 4px; cursor: pointer; }
        .row-card { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; font-weight: 560; }
        .toggle-row { cursor: pointer; }
        .toggle-row input { width: 16px; height: 16px; accent-color: var(--acc); }
        .btn-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
        .btn-wide {
          width: 100%; height: 34px; padding: 0 12px; border-radius: 12px; font-size: 12px; font-weight: 580;
          background: var(--card); border: 1px solid var(--rim);
        }
        .btn-wide:hover { background: var(--card-hi); }
      `;
    };

    ensureScaffold();
    syncStudioStyles();

    const fab = shadow.getElementById("ds-fab");
    const drawer = shadow.getElementById("ds-drawer");
    const dragHandle = shadow.getElementById("ds-drag-handle");
    const themeGrid = shadow.getElementById("ds-theme-grid");
    let curFabPos = { x: 0, y: 0 };
    let curDrawerPos = { x: 0, y: 0 };
    const getFabDims = () => (studioRuntime.pillMode === "orb" ? { w: 38, h: 38 } : { w: Math.max(146, fab.getBoundingClientRect().width || 156), h: 34 });
    const getDrawerDims = () => ({ w: Math.min(382, Math.max(280, window.innerWidth - 28)), h: Math.min(540, Math.max(320, window.innerHeight - 68)) });

    const syncPositions = () => {
      const fd = getFabDims();
      const fp = fracToPx(studioRuntime.posX, studioRuntime.posY, fd.w, fd.h);
      curFabPos = fp;
      fab.style.transform = `translate3d(${fp.x.toFixed(1)}px, ${fp.y.toFixed(1)}px, 0)`;

      const dd = getDrawerDims();
      const rawDx = fp.x + fd.w * 0.5 > window.innerWidth * 0.5 ? fp.x + fd.w - dd.w : fp.x;
      const rawDy = fp.y + fd.h * 0.5 > window.innerHeight * 0.5 ? fp.y + fd.h - dd.h : fp.y;
      const db = getBounds(dd.w, dd.h);
      const dx = clamp(rawDx, db.minX, db.maxX);
      const dy = clamp(rawDy, db.minY, db.maxY);
      curDrawerPos = { x: dx, y: dy };
      drawer.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    };

    const ZONE_LABELS = { global: "全部全局", composer: "输入栏", writing: "气泡·产物", sidebar: "侧边栏", cards: "面板·卡片", popover: "弹窗·胶囊" };
    const cardMap = new Map();

    const syncThemeCards = () => {
      const list = studioRuntime.catalog;
      if (cardMap.size !== list.length) {
        themeGrid.innerHTML = "";
        cardMap.clear();
        for (const t of list) {
          const card = document.createElement("button");
          card.type = "button";
          card.className = "theme-card";
          card.dataset.id = t.id;
          card.innerHTML = `
            <div class="card-thumb">
              <img class="thumb-img" alt="" loading="lazy" />
              <div class="thumb-scrim"></div>
              <span class="thumb-tag">${t.liquidGlass ? "液态玻璃" : (t.appearance === "dark" ? "深色" : "浅色")}</span>
              <span class="thumb-active" hidden>当前使用</span>
            </div>
            <div class="card-meta">
              <div class="card-title"></div>
              <div class="card-sub"></div>
            </div>
          `;
          card.querySelector(".card-title").textContent = t.name || t.id;
          card.querySelector(".card-sub").textContent = t.subtitle || t.id;
          const imgEl = card.querySelector(".thumb-img");
          const showImg = (url) => { if (url) { imgEl.src = url; imgEl.classList.add("loaded"); } };
          if (thumbMemCache.has(t.id)) showImg(thumbMemCache.get(t.id));
          else if (t.thumbDataUrl) { thumbMemCache.set(t.id, t.thumbDataUrl); showImg(t.thumbDataUrl); }
          else thumbQueue.push({ id: t.id, focusX: t.focusX, focusY: t.focusY, thumbDataUrl: "", onDone: showImg });

          card.addEventListener("click", async () => {
            if (card.dataset.busy === "1") return;
            card.dataset.busy = "1";
            try {
              const res = await callRpc("applyTheme", { themeId: t.id });
              if (res?.ok) {
                studioRuntime.barePreview = false;
                if (res.catalog) studioRuntime.catalog = res.catalog;
              }
            } finally {
              delete card.dataset.busy;
            }
          });
          cardMap.set(t.id, card);
          themeGrid.appendChild(card);
        }
        runThumbWorker();
      }

      const q = studioRuntime.search.trim().toLowerCase();
      for (const t of list) {
        const card = cardMap.get(t.id);
        if (!card) continue;
        const matchQ = !q || `${t.name || ""} ${t.id || ""} ${t.subtitle || ""}`.toLowerCase().includes(q);
        const matchKind = studioRuntime.filterKind === "all" || t.appearance === studioRuntime.filterKind;
        card.hidden = !(matchQ && matchKind);
        const active = t.id === THEME.id;
        card.classList.toggle("active", active);
        const actTag = card.querySelector(".thumb-active");
        if (actTag) actTag.hidden = !active;
      }
    };

    const renderState = () => {
      const bodyEl = shadow.querySelector(".body");
      const prevScrollTop = bodyEl ? bodyEl.scrollTop : 0;
      syncStudioStyles();
      const headSub = shadow.getElementById("ds-head-sub");
      if (headSub) headSub.textContent = THEME.name || THEME.id || "JBY Liquid Glass";
      const badge = shadow.getElementById("ds-fab-badge");
      if (badge) badge.textContent = THEME.name || THEME.id || "Liquid Glass";
      fab.dataset.mode = studioRuntime.pillMode;
      const bareBtn = shadow.getElementById("ds-bare-toggle");
      if (bareBtn) {
        bareBtn.classList.toggle("active", studioRuntime.barePreview);
        bareBtn.textContent = studioRuntime.barePreview ? "还原皮肤" : "对比原版";
      }
      const resetMedia = shadow.getElementById("ds-reset-media");
      if (resetMedia) resetMedia.hidden = BOOT.customMediaKind === "none";

      const tabIdx = ["themes", "tune", "auto"].indexOf(studioRuntime.activeTab);
      const sliderEl = shadow.getElementById("ds-tab-slider");
      if (sliderEl) sliderEl.style.transform = `translate3d(${Math.max(0, tabIdx) * 100}%, 0, 0)`;
      shadow.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === studioRuntime.activeTab)));
      shadow.querySelectorAll("[data-view]").forEach((v) => { v.hidden = v.dataset.view !== studioRuntime.activeTab; });
      shadow.querySelectorAll("[data-kind]").forEach((c) => c.classList.toggle("active", c.dataset.kind === studioRuntime.filterKind));
      shadow.querySelectorAll("[data-pillmode]").forEach((c) => c.classList.toggle("active", c.dataset.pillmode === studioRuntime.pillMode));

      const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
      const zone = studioRuntime.selectedZone || "global";
      const zEff = zone === "global" ? cur : resolveZone(cur, zone);
      const zoneStatus = shadow.getElementById("ds-zone-status");
      if (zoneStatus) zoneStatus.textContent = ZONE_LABELS[zone] || "全部全局";
      const resetZoneBtn = shadow.getElementById("ds-reset-zone");
      if (resetZoneBtn) resetZoneBtn.hidden = zone === "global" || !cur.zones?.[zone];
      shadow.querySelectorAll("[data-zone]").forEach((c) => {
        c.classList.toggle("active", c.dataset.zone === zone);
        c.classList.toggle("customized", Boolean(cur.zones?.[c.dataset.zone]));
      });
      for (const k of ["transparency", "refractScale", "blurScale", "rimIntensity", "fontWeightBoost"]) {
        const inp = shadow.querySelector(`[data-tune="${k}"]`);
        const valEl = shadow.getElementById(`ds-val-${k}`);
        const val = k === "fontWeightBoost" ? (cur.fontWeightBoost ?? 0) : (zEff[k] ?? DEFAULT_LIVE_PARAMS[k]);
        if (inp && document.activeElement !== inp) inp.value = String(val);
        if (valEl) valEl.textContent = k === "fontWeightBoost" ? String(val) : `${val}%`;
      }
      const opState = studioRuntime.opticalPresets || { defaultPresetId: null, presets: [] };
      const opList = Array.isArray(opState.presets) ? opState.presets : [];
      const pListEl = shadow.getElementById("ds-preset-list");
      const pStatusEl = shadow.getElementById("ds-preset-status");
      const pDelBtn = shadow.getElementById("ds-preset-del");
      if (studioRuntime.selectedPresetId && !opList.some((p) => p.id === studioRuntime.selectedPresetId)) {
        studioRuntime.selectedPresetId = null;
      }
      const activePresetObj = opList.find((p) => p.id === studioRuntime.selectedPresetId) || opList.find((p) => p.id === opState.defaultPresetId) || null;
      if (pStatusEl) {
        pStatusEl.textContent = activePresetObj
          ? (activePresetObj.id === opState.defaultPresetId ? `${activePresetObj.name} · ★默认` : activePresetObj.name)
          : `共 ${opList.length} 项`;
      }
      if (pDelBtn) pDelBtn.hidden = !(studioRuntime.selectedPresetId && opList.some((p) => p.id === studioRuntime.selectedPresetId));
      const presetSig = JSON.stringify({
        def: opState.defaultPresetId || "",
        sel: studioRuntime.selectedPresetId || "",
        items: opList.map((p) => `${p.id}:${p.name}`),
      });
      if (pListEl && (!pListEl.childElementCount || studioRuntime.lastPresetSig !== presetSig)) {
        studioRuntime.lastPresetSig = presetSig;
        pListEl.textContent = "";
        for (const p of opList) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chip";
          if (p.id === studioRuntime.selectedPresetId) btn.classList.add("active");
          btn.textContent = p.id === opState.defaultPresetId ? `★ ${p.name}` : p.name;
          btn.title = p.id === opState.defaultPresetId ? "全局默认预设（新皮肤与双端共用）" : "点击立即应用此预设到当前皮肤";
          btn.addEventListener("click", async () => {
            studioRuntime.selectedPresetId = p.id;
            const curApplied = applyLiveTuneRuntime(p.params);
            renderState();
            await callRpc("setLiveParams", { themeId: THEME.id, params: curApplied, commit: true });
          });
          pListEl.appendChild(btn);
        }
      }
      shadow.querySelectorAll("[data-motion]").forEach((c) => c.classList.toggle("active", c.dataset.motion === cur.motionMode));
      const pt = shadow.getElementById("ds-particles-toggle");
      if (pt) pt.checked = cur.particlesEnabled !== false;
      const ge = shadow.getElementById("ds-guard-enabled");
      const glCheckbox = shadow.getElementById("ds-guard-launch");
      if (ge) ge.checked = studioRuntime.guardConfig?.antigravityAutoGuardEnabled !== false;
      if (glCheckbox) glCheckbox.checked = Boolean(studioRuntime.guardConfig?.autoLaunchAntigravityOnBoot);

      if (fab.hidden !== studioRuntime.open) fab.hidden = studioRuntime.open;
      if (drawer.hidden !== !studioRuntime.open) drawer.hidden = !studioRuntime.open;
      syncThemeCards();
      syncPositions();
      if (bodyEl && Math.abs(bodyEl.scrollTop - prevScrollTop) > 1) {
        bodyEl.scrollTop = prevScrollTop;
      }
    };

    const setPanelOpen = (open, persist = false) => {
      studioRuntime.open = open;
      renderState();
      if (persist) persistUi();
    };

    const bindDraggable = (handleEl, isFab) => {
      let glideRaf = 0;
      let suppressNextClick = false;
      if (isFab) {
        handleEl.addEventListener("click", (ev) => {
          if (suppressNextClick) { suppressNextClick = false; return; }
          ev.stopPropagation();
          setPanelOpen(true, true);
        });
      }
      handleEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (!isFab && e.target.closest("button, input, a")) return;
        e.preventDefault();
        if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = 0; }
        const dims = isFab ? getFabDims() : getDrawerDims();
        const startPos = isFab ? { ...curFabPos } : { ...curDrawerPos };
        const x0 = e.clientX; const y0 = e.clientY;
        const samples = [{ t: performance.now(), x: x0, y: y0 }];
        let moved = false;
        const b = getBounds(dims.w, dims.h);
        const onMove = (ev) => {
          const dx = ev.clientX - x0; const dy = ev.clientY - y0;
          if (!moved && Math.hypot(dx, dy) > 4) moved = true;
          const x = clamp(startPos.x + dx, b.minX, b.maxX);
          const y = clamp(startPos.y + dy, b.minY, b.maxY);
          if (isFab) { curFabPos = { x, y }; fab.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; }
          else { curDrawerPos = { x, y }; drawer.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; }
          samples.push({ t: performance.now(), x: ev.clientX, y: ev.clientY });
          if (samples.length > 6) samples.shift();
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          if (moved && isFab) {
            suppressNextClick = true;
            setTimeout(() => { suppressNextClick = false; }, 120);
          }
          if (!moved && isFab) {
            suppressNextClick = true;
            setTimeout(() => { suppressNextClick = false; }, 120);
            setPanelOpen(true, true);
            return;
          }
          if (moved) {
            const pos = isFab ? curFabPos : curDrawerPos;
            const frac = pxToFrac(pos.x, pos.y, dims.w, dims.h);
            studioRuntime.posX = frac.posX;
            studioRuntime.posY = frac.posY;
            syncPositions();
            persistUi();
          }
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });
    };

    if (!studioRuntime.inited) {
      studioRuntime.inited = true;
      bindDraggable(fab, true);
      bindDraggable(dragHandle, false);

      shadow.getElementById("ds-close-drawer").addEventListener("click", () => setPanelOpen(false, true));
      shadow.getElementById("ds-bare-toggle").addEventListener("click", async () => {
        studioRuntime.barePreview = !studioRuntime.barePreview;
        if (studioRuntime.barePreview) {
          try { window[STATE_KEY]?.cleanup?.(true); } catch {}
          renderState();
        } else {
          renderState();
          await callRpc("reapplySkin", {});
        }
      });

      shadow.getElementById("ds-pick-media").addEventListener("click", async () => {
        await callRpc("pickCustomWallpaper", {});
      });
      shadow.getElementById("ds-reset-media").addEventListener("click", async () => {
        await callRpc("resetCustomWallpaper", {});
      });
      shadow.getElementById("ds-import-zip").addEventListener("click", async () => {
        await callRpc("importThemeZip", {});
      });

      shadow.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.addEventListener("click", () => { studioRuntime.activeTab = btn.dataset.tab || "themes"; renderState(); persistUi(); });
      });
      shadow.getElementById("ds-search").addEventListener("input", (e) => { studioRuntime.search = e.target.value || ""; syncThemeCards(); });
      shadow.querySelectorAll("[data-kind]").forEach((btn) => {
        btn.addEventListener("click", () => { studioRuntime.filterKind = btn.dataset.kind || "all"; renderState(); });
      });
      shadow.querySelectorAll("[data-zone]").forEach((btn) => {
        btn.addEventListener("click", () => { studioRuntime.selectedZone = btn.dataset.zone || "global"; renderState(); persistUi(); });
      });
      shadow.getElementById("ds-reset-zone").addEventListener("click", async () => {
        if (studioRuntime.selectedZone === "global") return;
        const base = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
        const nextZones = { ...(base.zones || {}) };
        delete nextZones[studioRuntime.selectedZone];
        const cur = applyLiveTuneRuntime({ ...base, zones: nextZones });
        renderState();
        await callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: true });
      });

      let tuneSaveTimer = 0;
      shadow.querySelectorAll("[data-tune]").forEach((inp) => {
        const key = inp.dataset.tune;
        const onInput = (commit) => {
          const val = Number(inp.value);
          const base = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
          const zone = studioRuntime.selectedZone || "global";
          let next;
          if (zone === "global" || key === "fontWeightBoost") {
            next = { ...base, [key]: val };
          } else {
            next = { ...base, zones: { ...(base.zones || {}), [zone]: { ...(base.zones?.[zone] || {}), [key]: val } } };
          }
          const cur = applyLiveTuneRuntime(next);
          renderState();
          clearTimeout(tuneSaveTimer);
          if (commit) {
            callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: true }).catch(() => {});
          } else {
            tuneSaveTimer = setTimeout(() => callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: false }).catch(() => {}), 80);
          }
        };
        inp.addEventListener("input", () => onInput(false));
        inp.addEventListener("change", () => onInput(true));
      });

      shadow.querySelectorAll("[data-motion]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const cur = applyLiveTuneRuntime({ ...(window.__dsCurrentLiveParams || {}), motionMode: btn.dataset.motion || "spring" });
          renderState();
          await callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: true });
        });
      });
      shadow.getElementById("ds-particles-toggle").addEventListener("change", async (e) => {
        const cur = applyLiveTuneRuntime({ ...(window.__dsCurrentLiveParams || {}), particlesEnabled: Boolean(e.target.checked) });
        renderState();
        await callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: true });
      });
      shadow.getElementById("ds-reset-tune").addEventListener("click", async () => {
        const res = await callRpc("resetThemeParams", { themeId: THEME.id });
        if (res?.ok && res.params) {
          if (res.opticalPresets) studioRuntime.opticalPresets = res.opticalPresets;
          applyLiveTuneRuntime(res.params);
          renderState();
        } else {
          const cur = applyLiveTuneRuntime({ ...DEFAULT_LIVE_PARAMS, transparency: Number(THEME.panelAlpha ? Math.round((1 - THEME.panelAlpha) * 100) : 80) });
          renderState();
          await callRpc("setLiveParams", { themeId: THEME.id, params: cur, commit: true });
        }
      });

      shadow.getElementById("ds-preset-save")?.addEventListener("click", async () => {
        const nameInp = shadow.getElementById("ds-preset-name");
        const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
        const customName = String(nameInp?.value || "").trim();
        const res = await callRpc("savePreset", { name: customName, params: cur });
        if (res?.ok && res.opticalPresets) {
          studioRuntime.opticalPresets = res.opticalPresets;
          if (res.savedPreset?.id) studioRuntime.selectedPresetId = res.savedPreset.id;
          if (nameInp && customName) nameInp.value = "";
          renderState();
        }
      });

      shadow.getElementById("ds-preset-default")?.addEventListener("click", async () => {
        const nameInp = shadow.getElementById("ds-preset-name");
        const cur = window.__dsCurrentLiveParams || DEFAULT_LIVE_PARAMS;
        const customName = String(nameInp?.value || "").trim();
        const opList = studioRuntime.opticalPresets?.presets || [];
        const hasSel = Boolean(studioRuntime.selectedPresetId && opList.some((p) => p.id === studioRuntime.selectedPresetId));
        const res = await callRpc("setDefaultPreset", {
          presetId: (!customName && hasSel) ? studioRuntime.selectedPresetId : null,
          name: customName,
          params: cur,
        });
        if (res?.ok && res.opticalPresets) {
          studioRuntime.opticalPresets = res.opticalPresets;
          if (res.opticalPresets.defaultPresetId) studioRuntime.selectedPresetId = res.opticalPresets.defaultPresetId;
          if (nameInp && customName) nameInp.value = "";
          renderState();
        }
      });

      shadow.getElementById("ds-preset-del")?.addEventListener("click", async () => {
        if (!studioRuntime.selectedPresetId) return;
        const res = await callRpc("deletePreset", { presetId: studioRuntime.selectedPresetId });
        if (res?.ok && res.opticalPresets) {
          studioRuntime.opticalPresets = res.opticalPresets;
          studioRuntime.selectedPresetId = null;
          renderState();
        }
      });
      shadow.querySelectorAll("[data-pillmode]").forEach((btn) => {
        btn.addEventListener("click", () => { studioRuntime.pillMode = btn.dataset.pillmode === "pill" ? "pill" : "orb"; renderState(); persistUi(); });
      });
      shadow.getElementById("ds-guard-enabled").addEventListener("change", async (e) => {
        studioRuntime.guardConfig = { ...studioRuntime.guardConfig, antigravityAutoGuardEnabled: Boolean(e.target.checked) };
        await callRpc("setGuardConfig", { config: studioRuntime.guardConfig });
      });
      shadow.getElementById("ds-guard-launch").addEventListener("change", async (e) => {
        studioRuntime.guardConfig = { ...studioRuntime.guardConfig, autoLaunchAntigravityOnBoot: Boolean(e.target.checked) };
        await callRpc("setGuardConfig", { config: studioRuntime.guardConfig });
      });
      shadow.getElementById("ds-reapply-btn").addEventListener("click", () => callRpc("reapplySkin", {}));
      shadow.querySelectorAll("[data-folder]").forEach((btn) => {
        btn.addEventListener("click", () => callRpc("openFolder", { target: btn.dataset.folder }));
      });
    }

    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setPanelOpen(!studioRuntime.open, true);
      }
    };
    const onResize = () => syncPositions();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.__agyDsApplyExternalParams = (nextParams, nextPresets) => {
      if (nextPresets) studioRuntime.opticalPresets = nextPresets;
      if (nextParams) applyLiveTuneRuntime(nextParams);
      renderState();
    };
    studioRefreshFn = renderState;
    renderState();
    if (prevStudioScrollTop > 0) {
      const initBody = shadow.querySelector(".body");
      if (initBody) initBody.scrollTop = prevStudioScrollTop;
    }
    studioCleanupFn = () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      delete window.__agyDsApplyExternalParams;
      studioRefreshFn = null;
      host?.remove();
    };
  };

  // === Main Activation & Observers (deferred safely until both <html> and <body> exist) ===
  let shellObserver = null;
  let lgTeardown = null;

  const cleanup = (keepStudio = false) => {
    if (!keepStudio) window[DISABLED_KEY] = true;
    shellObserver?.disconnect();
    wpHoleObs?.disconnect();
    try { lgTeardown?.(); } catch {}
    document.getElementById(WALLPAPER_LAYER_ID)?.remove();
    document.body?.removeAttribute("data-dream-skin-video");
    if (!keepStudio) {
      try { studioCleanupFn?.(); } catch {}
      document.getElementById(PLUGIN_HOST_ID)?.remove();
    }
    for (const node of partNodes) node.removeAttribute?.(PART_ATTR);
    partNodes.clear();
    for (const el of document.querySelectorAll("[data-dream-agy-thread-shell], [data-dream-agy-thread-scroll], [data-dream-agy-composer-dock], [data-dream-agy-has-rail]")) {
      el.removeAttribute("data-dream-agy-thread-shell");
      el.removeAttribute("data-dream-agy-thread-scroll");
      el.removeAttribute("data-dream-agy-composer-dock");
      el.removeAttribute("data-dream-agy-has-rail");
      el.style.removeProperty("--ds-agy-dock-h");
    }
    if ("adoptedStyleSheets" in document) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets].filter((s) => !styleRegistry.has(s));
    }
    styleRegistry.clear();
    document.getElementById(STYLE_ID)?.remove();
    const rootEl = document.documentElement;
    if (rootEl) {
      rootEl.removeAttribute("data-dream-wallpaper-ready");
      for (const attr of [...rootEl.attributes]) {
        if (attr.name.startsWith("data-dream-")) rootEl.removeAttribute(attr.name);
      }
      for (const prop of [...rootEl.style]) {
        if (prop.startsWith("--ds-") || prop.startsWith("--dream-")) rootEl.style.removeProperty(prop);
      }
    }
    if (!keepStudio) {
      try { if (artUrl.startsWith("blob:")) URL.revokeObjectURL(artUrl); } catch {}
      delete window[STATE_KEY];
    }
    return true;
  };

  const activateSkin = () => {
    const root = document.documentElement;
    if (!root || !document.body || window[DISABLED_KEY]) return;
    applyRootState(root);
    refreshParts();
    applyLiveTuneRuntime(BOOT.liveParams);
    lgTeardown = initLiquidGlassEdition();
    mountStudio();
    analyzeArt().then(() => {
      if (!window[DISABLED_KEY]) {
        lastRootSig = "";
        applyRootState(root);
        window.__dsLgRefreshAccentOptics?.();
      }
    });

    let lastNativeSig = `${detectShellAppearance()}:${root.style.getPropertyValue("--background")}:${document.body?.className || ""}`;
    shellObserver = new MutationObserver(() => {
      if (window[DISABLED_KEY]) return;
      const curNativeSig = `${detectShellAppearance()}:${root.style.getPropertyValue("--background")}:${document.body?.className || ""}`;
      if (curNativeSig !== lastNativeSig) {
        lastNativeSig = curNativeSig;
        lastRootSig = "";
        applyRootState(root);
        applyLiveTuneRuntime(window.__dsCurrentLiveParams);
        if (studioRuntime.inited && document.getElementById(PLUGIN_HOST_ID)?.shadowRoot) {
          mountStudio();
        }
      }
      syncBrowserHoleClip();
    });
    shellObserver.observe(root, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
    shellObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-agy-theme", "data-has-browser-hole"] });

    window[STATE_KEY] = {
      version: SKIN_VERSION,
      revision: PAYLOAD_REVISION,
      themeId: THEME.id || "custom",
      styleMode,
      styleSheet,
      styleNode,
      metrics,
      artUrl,
      cleanup,
      reapply: () => {
        lastRootSig = "";
        applyRootState(root);
        refreshParts();
        applyLiveTuneRuntime(window.__dsCurrentLiveParams);
      },
    };
  };

  if (document.documentElement && document.body) {
    activateSkin();
  } else {
    document.addEventListener("DOMContentLoaded", activateSkin, { once: true });
  }
})();
