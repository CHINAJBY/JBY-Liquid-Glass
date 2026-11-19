((rootScope, factory) => {
  const api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  if (rootScope && typeof rootScope === "object") {
    rootScope.JbyLiquidGlass = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  function createJbyLiquidGlassEngine(options = {}) {
    const THEME = options.theme && typeof options.theme === "object" ? options.theme : {};
    const REVISION = String(options.revision || "2");
    const isEnabled = typeof options.isEnabled === "function" ? options.isEnabled : () => THEME.liquidGlass !== false;
    const resolveShell = typeof options.resolvedShell === "function"
      ? options.resolvedShell
      : () => (document.documentElement?.getAttribute("data-dream-shell") === "dark" ? "dark" : "light");
    const resolveArtDataUrl = () => {
      if (typeof options.artDataUrl === "function") return String(options.artDataUrl() || "");
      if (typeof options.artDataUrl === "string") return options.artDataUrl;
      if (typeof THEME.art?.dataUrl === "string") return THEME.art.dataUrl;
      const cssArt = document.documentElement ? getComputedStyle(document.documentElement).getPropertyValue("--dream-skin-art") : "";
      const m = cssArt.match(/url\((['"]?)(.*?)\1\)/i);
      return m?.[2] || "";
    };

    const opticsOptions = options.optics && typeof options.optics === "object" ? options.optics : {};
    const LG_SVG_ID = "ds-lg-svg-defs";
    const LG_CANVAS_ID = "ds-lg-fx-canvas";

    const DEFAULT_PARAMS = {
      transparency: 80,
      refractScale: 100,
      blurScale: 100,
      rimIntensity: 100,
      motionMode: options.motionMode || "spring",
      particlesEnabled: options.particlesEnabled !== false,
      zones: {},
    };
    let liveParams = { ...DEFAULT_PARAMS, ...(options.liveParams || {}) };
    const resolveLgZone = (zone) => {
      const ov = liveParams.zones && zone && liveParams.zones[zone];
      return {
        transparency: Number(ov?.transparency ?? liveParams.transparency ?? 80),
        refractScale: Number(ov?.refractScale ?? liveParams.refractScale ?? 100),
        blurScale: Number(ov?.blurScale ?? liveParams.blurScale ?? 100),
        rimIntensity: Number(ov?.rimIntensity ?? liveParams.rimIntensity ?? 100),
      };
    };

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
      document.getElementById("ds-lg-dynamic-style")?.remove();
      document.getElementById(LG_SVG_ID)?.remove();
      document.getElementById(LG_CANVAS_ID)?.remove();
      document.getElementById("harmony-liquid-sparks-canvas")?.remove();
      document.getElementById("apple-liquid-glass-svg")?.remove();
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

    let applyParamsImpl = null;

    const initLiquidGlassEdition = () => {
      if (!isEnabled()) {
        teardownLiquidGlassEdition();
        return;
      }
      const instanceKey = `${THEME.id || "custom"}:${REVISION}`;
      if (window.__dsLgEditionInstalled === instanceKey) return;
      teardownLiquidGlassEdition();
      window.__dsLgEditionInstalled = instanceKey;

      const root = document.documentElement;
      const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      const resolveMotionFlags = () => {
        const mode = liveParams.motionMode || "spring";
        const sysReduced = Boolean(reducedMotionQuery?.matches);
        return { mode, reduced: sysReduced || mode === "off", lite: !sysReduced && mode === "lite" };
      };
      let { reduced: reducedMotion, lite: liteMotion } = resolveMotionFlags();

      root.setAttribute("data-dream-lg", "on");
      root.setAttribute("data-dream-lg-motion", reducedMotion ? "reduced" : (liteMotion ? "lite" : "full"));

      const tagline = THEME.brandSubtitle || THEME.tagline || "LIQUID GLASS EDITION";
      if (!root.style.getPropertyValue("--dream-skin-tagline")) {
        root.style.setProperty("--dream-skin-tagline", JSON.stringify(tagline));
      }

      const solveSpringLinear = (responseS, dampingRatio, steps = 34) => {
        const wn = (2 * Math.PI) / Math.max(0.08, responseS);
        const z = Math.max(0.2, Math.min(1.8, dampingRatio));
        const sample = (t) => {
          if (z < 1) {
            const wd = wn * Math.sqrt(1 - z * z);
            return 1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
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
      const accentRgb = parseRgbTriplet(THEME.colors?.accent || opticsOptions.accent || csRoot.getPropertyValue("--ds-accent-rgb"), "100,114,178");
      const accentAltRgb = parseRgbTriplet(THEME.colors?.accentAlt || THEME.colors?.highlight || opticsOptions.accentAlt || csRoot.getPropertyValue("--ds-secondary-rgb"), accentRgb);
      root.style.setProperty("--ds-lg-accent-rgb", accentRgb.replace(/,/g, " "));
      root.style.setProperty("--ds-lg-accent-alt-rgb", accentAltRgb.replace(/,/g, " "));
      root.style.setProperty("--ds-lg-prism-a", (opticsOptions.prismA || accentRgb).replace(/,/g, " "));
      root.style.setProperty("--ds-lg-prism-b", (opticsOptions.prismB || accentAltRgb).replace(/,/g, " "));

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

      // Tier 1: Single-Pass Live SVG Snell Displacement Lens (100% colorless over white surfaces)
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
      const WRITING_SEL = '[data-oai-writing-block-surface], [data-testid="chatgpt-writing-block"]';
      const BANNER_SEL = 'aside[class*="banner-"], [class*="ComposerBannerPortal"] aside';
      const LENS_SLOTS = [
        { name: "composer", zone: "composer", filterId: "ds-lg-lens-composer", cssVar: "--ds-lg-lens-filter", selector: COMPOSER_SEL, baseScale: 36, defaultR: 28, bezelFn: (w, h) => Math.max(15, Math.min(26, Math.min(w, h) * 0.32)) },
        { name: "rail", zone: "composer", filterId: "ds-lg-lens-rail", cssVar: "--ds-lg-lens-filter", selector: `[data-dream-lg-surface="work-composer"] [data-composer-utility-rail], ${RAIL_SEL}`, excludeClosest: `:is(${COMPOSER_SEL}):not([data-dream-lg-surface="work-composer"])`, baseScale: 20, defaultR: 18, bezelFn: (w, h) => Math.max(8, Math.min(16, Math.min(w, h) * 0.30)) },
        { name: "writing", zone: "writing", filterId: "ds-lg-lens-writing", cssVar: "--ds-lg-lens-writing", selector: WRITING_SEL, multi: true, baseScale: 32, defaultR: 24, bezelFn: (w, h) => Math.max(14, Math.min(24, Math.min(w, h) * 0.24)) },
      ];
      const SHARED_FILTERS = [
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
        slotNodes.set(slot.name, { slot, filter, feImg, feDisp, lastKey: "", lastScale: "", activeEls: new Set() });
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
            const mag = Math.pow(1 - t, 1.45) * (0.38 + 0.62 * edgeFade) * 0.90;
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
        const cw = aspect >= 1 ? Math.min(maxDim, Math.max(40, qw)) : Math.max(24, Math.round(Math.min(maxDim, qh) * aspect));
        const ch = aspect >= 1 ? Math.max(24, Math.round(cw / aspect)) : Math.min(maxDim, Math.max(40, qh));
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
            const sdf = outD + Math.min(Math.max(qx, qy), 0) - cr;
            const idx = (y * cw + x) * 4;
            if (sdf > 0 || -sdf >= bez) {
              data[idx] = 128; data[idx + 1] = 128; data[idx + 2] = 128; data[idx + 3] = 255;
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
            const mag = Math.pow(1 - t, 1.45) * (0.38 + 0.62 * edgeFade) * 0.90;
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
        for (const rawEl of document.querySelectorAll(slot.selector)) {
          if (rawEl.closest("#codex-dream-skin-plugin-host")) continue;
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
        return out;
      };

      const isWorkComposerNode = (node) => Boolean(
        node?.matches?.('[data-composer-utility-bar-variant="home"]')
        && node.querySelector?.('[data-composer-rail][data-composer-rail-placement="responsive"], [class*="ResponsiveHomeUtilityBar"] [data-composer-rail]')
      );
      const syncSurfaceMarkers = () => {
        for (const rootEl of document.querySelectorAll('[class*="ComposerLayoutRoot"][data-composer-utility-bar-variant="home"], [data-dream-lg-surface="work-composer"]')) {
          const isWork = isWorkComposerNode(rootEl);
          const hasWork = rootEl.getAttribute("data-dream-lg-surface") === "work-composer";
          if (isWork && !hasWork) rootEl.setAttribute("data-dream-lg-surface", "work-composer");
          else if (!isWork && hasWork) rootEl.removeAttribute("data-dream-lg-surface");
        }
        for (const rail of document.querySelectorAll('[data-composer-rail], [class*="rail-"][class*="attached-"]')) {
          if (rail.closest(COMPOSER_SEL)) continue;
          const host = rail.parentElement;
          if (host && host.querySelector('[class*="ComposerLayoutRoot"]') && host.getAttribute("data-dream-lg-surface") !== "rail-host") {
            host.setAttribute("data-dream-lg-surface", "rail-host");
          }
        }
        for (const cRoot of document.querySelectorAll('[data-codex-composer-root]')) {
          const tray = cRoot.parentElement;
          if (!tray) continue;
          if (tray.parentElement?.querySelector(".thread-scroll-container") || tray.closest("main")?.querySelector(".thread-scroll-container")) {
            if (tray.getAttribute("data-dream-lg-surface") !== "thread-tray") tray.setAttribute("data-dream-lg-surface", "thread-tray");
          }
          const outer = tray.parentElement;
          if (outer) {
            for (const ch of outer.children) {
              if (ch !== tray && ch.querySelector?.('button[class*="text-codex-description"]') && ch.getAttribute("data-dream-lg-surface") !== "queued-strip") {
                ch.setAttribute("data-dream-lg-surface", "queued-strip");
              }
            }
          }
        }
        for (const h of document.querySelectorAll('.group\\/turn-diff-header')) {
          const card = h.parentElement;
          if (card && card.getAttribute("data-dream-lg-surface") !== "turn-diff") card.setAttribute("data-dream-lg-surface", "turn-diff");
        }
      };

      const syncSvgLenses = () => {
        if (disposed) return;
        for (const sf of SHARED_FILTERS) {
          const entry = sharedFilterNodes.get(sf.name);
          const zp = resolveLgZone(sf.zone);
          const mult = Math.max(0, zp.refractScale / 100);
          const enabled = !reducedMotion && mult > 0.02;
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
          const enabled = !reducedMotion && mult > 0.02;
          const targets = pickOutermostVisibleList(slot);
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

      // Tier 2: WebGL2 Static Optical Shader v2 (White-Neutrality + Async toBlob)
      const GPU_TARGETS = [
        { kind: "sidebar", selector: 'aside.app-shell-left-panel, [data-ds-part="sidebar"]', bezel: 22, scale: 32, blurLod: 0.24, defaultR: 24, tintAlpha: 0.055 },
        { kind: "homeCard", selector: '[role="main"]:has([data-testid="home-icon"]) .group\\/home-suggestions button, .group\\/project-selector > button, [data-ds-part="home-hero"] button', bezel: 16, scale: 26, blurLod: 0.12, defaultR: 20, tintAlpha: 0.048 },
      ];
      const allBlobUrls = new Set();
      const activeTileUrls = new Map();
      const tileQueue = [];
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
        const artUrl = resolveArtDataUrl();
        if (!gl || !artUrl || artUrl.length < 24) return false;
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
        img.src = artUrl;
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

        const zName = spec.kind === "sidebar" ? "sidebar" : "cards";
        const zp = resolveLgZone(zName);
        const isDark = resolveShell() === "dark" ? 1 : 0;
        const refractMult = Math.max(0, zp.refractScale / 100);
        const blurMult = Math.max(0, zp.blurScale / 100);
        const rimMult = Math.max(0.2, zp.rimIntensity / 100);
        const opacityScale = Math.max(0.18, Math.min(2.6, (112 - zp.transparency) / 32));

        gl.uniform2f(gpuLocs.uArtRes, artImgW, artImgH);
        gl.uniform2f(gpuLocs.uArtFocus, artFocusX, artFocusY);
        gl.uniform2f(gpuLocs.uViewport, Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
        gl.uniform4f(gpuLocs.uRect, rect.left, rect.top, rect.width, rect.height);
        gl.uniform1f(gpuLocs.uRadius, getRadiusPx(el, spec.defaultR));
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
          if (!blob || disposed || !el.isConnected) return;
          const url = URL.createObjectURL(blob);
          allBlobUrls.add(url);
          const prev = activeTileUrls.get(el);
          if (prev?.url) {
            allBlobUrls.delete(prev.url);
            URL.revokeObjectURL(prev.url);
          }
          activeTileUrls.set(el, { key, url });
          el.style.setProperty("--ds-lg-gpu-bg", `url("${url}")`);
          el.setAttribute("data-dream-lg-gpu", "1");
        }, "image/png");
      };

      const flushTileQueue = () => {
        tileRaf = 0;
        if (disposed || !artReady) return;
        let count = 0;
        while (tileQueue.length > 0 && count < 2) {
          const job = tileQueue.shift();
          if (!job || !job.el.isConnected) continue;
          drawTileToBlob(job.el, job.spec, job.rect, job.key);
          count++;
        }
        if (tileQueue.length > 0) tileRaf = requestAnimationFrame(flushTileQueue);
      };

      const refreshGpuTiles = () => {
        if (!artReady || disposed) return;
        const shell = resolveShell();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const queuedSet = new Set(tileQueue.map((j) => j.el));
        for (const spec of GPU_TARGETS) {
          const zName = spec.kind === "sidebar" ? "sidebar" : "cards";
          const zp = resolveLgZone(zName);
          const paramSig = `${shell}:${zp.transparency}:${zp.refractScale}:${zp.blurScale}:${zp.rimIntensity}:${vw}x${vh}`;
          for (const el of document.querySelectorAll(spec.selector)) {
            if (el.closest("#codex-dream-skin-plugin-host")) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 20 || rect.height < 16) continue;
            const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}x${Math.round(rect.height)}:${paramSig}`;
            if (activeTileUrls.get(el)?.key === key) continue;
            if (!queuedSet.has(el)) {
              tileQueue.push({ el, spec, rect, key });
              queuedSet.add(el);
            }
          }
        }
        if (tileQueue.length > 0 && !tileRaf) tileRaf = requestAnimationFrame(flushTileQueue);
      };

      let opticsRaf = 0;
      const refreshAllOptics = () => {
        if (disposed || opticsRaf) return;
        opticsRaf = requestAnimationFrame(() => {
          opticsRaf = 0;
          if (disposed) return;
          syncSurfaceMarkers();
          syncSvgLenses();
          refreshGpuTiles();
        });
      };

      initWebGL();

      // Tier 3: HarmonyOS 7 Segmented Pill + Interruptible Springs + Crystal Gleam FX
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

      const springNodes = new Map();
      let springRaf = 0;
      let lastSpringTime = 0;

      const stepSprings = (now) => {
        springRaf = 0;
        const dt = Math.min(0.032, Math.max(0.004, ((now - lastSpringTime) || 16.6) / 1000));
        lastSpringTime = now;
        for (const [el, st] of springNodes) {
          if (!el.isConnected) { springNodes.delete(el); continue; }
          st.vs += (-st.stiffness * (st.s - st.ts) - st.damping * st.vs) * dt;
          st.s += st.vs * dt;
          if (Math.abs(st.s - st.ts) < 0.0008 && Math.abs(st.vs) < 0.004) {
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
            fxCtx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
            fxCtx.beginPath();
            fxCtx.arc(p.x + p.vx * ease, p.y + p.vy * ease + 12 * age * age, p.r * (1 - age * 0.45), 0, Math.PI * 2);
            fxCtx.fill();
          }
        }
        if (particles.length > 0 || (hoveredRect && hoverSheenAlpha > 0.02)) {
          fxRaf = requestAnimationFrame(stepFx);
        } else {
          fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        }
      };

      const ensureFxRaf = () => { if (!fxRaf && !disposed) fxRaf = requestAnimationFrame(stepFx); };
      const emitPressSparks = (x, y) => {
        if (liveParams.particlesEnabled === false || reducedMotion || liteMotion) return;
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

      const WORK_BODY_SEL = '[data-dream-lg-surface="work-composer"] [data-composer-body]';
      const INTERACTIVE_SEL = 'aside.app-shell-left-panel button, aside.app-shell-left-panel a, header button, [role="main"] .group\\/home-suggestions button, .group\\/project-selector > button, [data-ds-part="home-hero"] button, .composer-surface-chrome button, [class*="ComposerLayoutRoot"] button, [class*="rail-"][class*="attached-"] button, [class*="homeUtilityBar"] button, [data-oai-writing-block-surface] header button, [role="menuitem"], [role="option"], [role="switch"]';
      const GLASS_CARD_SEL = `.composer-surface-chrome:not([data-dream-lg-surface="work-composer"]), ${WORK_BODY_SEL}, [class*="ComposerLayoutRoot"]:not([data-dream-lg-surface="work-composer"]), [class*="rail-"][class*="attached-"], [class*="homeUtilityBar"], [data-oai-writing-block-surface], [data-testid="chatgpt-writing-block"], aside[class*="banner-"], [class*="ComposerBannerPortal"] aside, aside.app-shell-left-panel, [role="main"] .group\\/home-suggestions button, .group\\/project-selector > button, section div[class*="rounded-2xl"][class*="border"], [role="dialog"], [role="menu"]`;

      let activePress = null;
      let hoveredCard = null;
      let hoverPairRoot = null;
      let hoveredTarget = null;

      const clearHoverCard = () => {
        if (hoveredCard?.isConnected) hoveredCard.removeAttribute("data-dream-lg-hover");
        if (hoverPairRoot?.isConnected) hoverPairRoot.querySelectorAll("[data-dream-lg-pair-active]").forEach((n) => n.removeAttribute("data-dream-lg-pair-active"));
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
        if (activePress && !activePress.cancelled && Math.hypot(e.clientX - activePress.x0, e.clientY - activePress.y0) > 18) {
          activePress.cancelled = true;
          setSpringTarget(activePress.el, { ts: 1, stiffness: 460, damping: 27 });
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

      let resizeObs = null;
      const observedResizeNodes = new WeakSet();
      const observeLensNodes = () => {
        if (!resizeObs) return;
        for (const sel of [COMPOSER_SEL, WORK_BODY_SEL, RAIL_SEL, WRITING_SEL, BANNER_SEL, 'aside.app-shell-left-panel']) {
          for (const node of document.querySelectorAll(sel)) {
            if (!observedResizeNodes.has(node) && !node.closest("#codex-dream-skin-plugin-host")) {
              observedResizeNodes.add(node);
              resizeObs.observe(node);
            }
          }
        }
      };
      if (typeof ResizeObserver === "function") {
        resizeObs = new ResizeObserver(() => refreshAllOptics());
        observeLensNodes();
      }

      let wasBusy = false;
      let settledTimer = 0;
      const syncBusyState = () => {
        if (disposed) return;
        const stopBtn = document.querySelector('button[aria-label="停止"], button[aria-label*="stop" i]');
        const busy = Boolean(stopBtn && !stopBtn.disabled && stopBtn.offsetParent !== null);
        if (busy) {
          wasBusy = true;
          clearTimeout(settledTimer);
          root.removeAttribute("data-dream-lg-settled");
          root.setAttribute("data-dream-lg-busy", "true");
        } else {
          root.removeAttribute("data-dream-lg-busy");
          if (wasBusy) {
            wasBusy = false;
            root.setAttribute("data-dream-lg-settled", "1");
            clearTimeout(settledTimer);
            settledTimer = setTimeout(() => root.removeAttribute("data-dream-lg-settled"), 740);
          }
        }
      };

      let domObsTimer = 0;
      const domObs = new MutationObserver((records) => {
        let hasNewSurface = false;
        let enterCount = 0;
        for (const rec of records) {
          if (rec.type === "childList" && (rec.addedNodes.length > 0 || rec.removedNodes.length > 0)) {
            const tEl = rec.target?.nodeType === 1 ? rec.target : null;
            if (tEl?.closest?.("#codex-dream-skin-plugin-host, .ProseMirror, [contenteditable='true']")) continue;
            for (const n of rec.addedNodes) {
              if (n.nodeType !== 1 || n.id === LG_SVG_ID || n.id === LG_CANVAS_ID || n.id === "codex-dream-skin-plugin-host") continue;
              hasNewSurface = true;
              if (!reducedMotion && enterCount < 2 && n.matches?.('[data-local-conversation-item-target-ids], [role="dialog"], [role="menu"], [role="tooltip"], [data-radix-popper-content-wrapper]') && !n.hasAttribute("data-dream-lg-seen")) {
                n.setAttribute("data-dream-lg-seen", "enter");
                enterCount++;
              }
              if (hasNewSurface && (reducedMotion || enterCount >= 2)) break;
            }
            if (!hasNewSurface) {
              for (const n of rec.removedNodes) {
                if (n.nodeType === 1 && n.id !== LG_SVG_ID && n.id !== LG_CANVAS_ID && n.id !== "codex-dream-skin-plugin-host") {
                  hasNewSurface = true;
                  break;
                }
              }
            }
          } else if (rec.type === "attributes") {
            const track = rec.target?.closest?.('[role="group"], [role="tablist"], [role="radiogroup"]');
            if (track && activeSegTracks.has(track)) syncSegmentedTrack(track, true);
            if (rec.attributeName === "aria-label") hasNewSurface = true;
          }
        }
        if (hasNewSurface) {
          syncSurfaceMarkers();
          clearTimeout(domObsTimer);
          domObsTimer = setTimeout(() => {
            domObsTimer = 0;
            if (disposed) return;
            refreshAllOptics();
            rescanSegTracks();
            syncBusyState();
            observeLensNodes();
          }, 150);
        }
      });
      domObs.observe(document.body || root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-selected", "aria-checked", "aria-pressed", "aria-label", "data-state"],
      });

      rescanSegTracks();
      syncBusyState();
      refreshAllOptics();

      let liveParamDebounce = 0;
      applyParamsImpl = (next) => {
        liveParams = { ...liveParams, ...(next || {}) };
        const flags = resolveMotionFlags();
        reducedMotion = flags.reduced;
        liteMotion = flags.lite;
        root.setAttribute("data-dream-lg-motion", reducedMotion ? "reduced" : (liteMotion ? "lite" : "full"));
        syncSvgLenses();
        clearTimeout(liveParamDebounce);
        liveParamDebounce = setTimeout(() => { if (!disposed) refreshGpuTiles(); }, 48);
      };

      const cleanupFn = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(fxRaf);
        cancelAnimationFrame(springRaf);
        cancelAnimationFrame(segRaf);
        cancelAnimationFrame(tileRaf);
        cancelAnimationFrame(opticsRaf);
        clearTimeout(domObsTimer);
        clearTimeout(settledTimer);
        clearTimeout(liveParamDebounce);
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
        applyParamsImpl = null;
      };
      window.__dsLgEditionCleanup = cleanupFn;
    };

    const mount = () => {
      if (isEnabled()) {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", initLiquidGlassEdition, { once: true });
        } else {
          initLiquidGlassEdition();
        }
      } else {
        teardownLiquidGlassEdition();
      }
      return teardownLiquidGlassEdition;
    };

    return {
      init: initLiquidGlassEdition,
      teardown: teardownLiquidGlassEdition,
      mount,
      applyLiveParams: (p) => applyParamsImpl?.(p),
    };
  }

  return { create: createJbyLiquidGlassEngine };
});
