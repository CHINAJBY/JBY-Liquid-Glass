/* === JBY-Liquid-Glass: Universal S26 Clear Liquid Glass (WebGL2 GPU) + HarmonyOS 7 Spring Engine === */
/* Theme-agnostic runtime module: works with ANY wallpaper or theme configuration. */
(function (rootScope, factory) {
  const api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  if (rootScope && typeof rootScope === "object") {
    rootScope.JbyLiquidGlass = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function createJbyLiquidGlassEngine(options = {}) {
    const THEME = options.theme && typeof options.theme === "object" ? options.theme : {};
    const REVISION = String(options.revision || "1");
    const isEnabled = typeof options.isEnabled === "function" ? options.isEnabled : () => THEME.liquidGlass !== false;
    let motionMode = options.motionMode || "spring";
    const opticsOptions = options.optics && typeof options.optics === "object" ? options.optics : {};

    const LG_SVG_ID = "ds-lg-svg-defs";
    const LG_CANVAS_ID = "ds-lg-fx-canvas";
    const LG_MAX_FILTERS = 28;

    const parseRgbTriplet = (raw, fallback) => {
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
      for (const el of document.querySelectorAll("[data-dream-lg-filter], [data-dream-lg-gpu], [data-dream-lg-seg], [data-dream-lg-seen], [data-dream-lg-interactive], [data-dream-lg-hover], [data-dream-lg-pair-active], [data-dream-lg-tone], [data-dream-lg-spring]")) {
        el.removeAttribute("data-dream-lg-filter");
        el.removeAttribute("data-dream-lg-gpu");
        el.removeAttribute("data-dream-lg-seg");
        el.removeAttribute("data-dream-lg-seen");
        el.removeAttribute("data-dream-lg-interactive");
        el.removeAttribute("data-dream-lg-hover");
        el.removeAttribute("data-dream-lg-pair-active");
        el.removeAttribute("data-dream-lg-tone");
        el.removeAttribute("data-dream-lg-spring");
        el.style.removeProperty("--ds-lg-filter");
        el.style.removeProperty("--ds-lg-gpu-bg");
        el.style.removeProperty("--ds-lg-seg-x");
        el.style.removeProperty("--ds-lg-seg-w");
        el.style.removeProperty("--ds-lg-seg-sx");
        el.style.removeProperty("--ds-lg-mx");
        el.style.removeProperty("--ds-lg-my");
        el.style.removeProperty("--ds-lg-bg-lum");
        el.style.removeProperty("--ds-lg-env-rgb");
        el.style.removeProperty("--ds-lg-rim-alpha");
        if (el.dataset.dsLgTouchTransform === "1") {
          el.style.removeProperty("transform");
          el.style.removeProperty("transition");
          delete el.dataset.dsLgTouchTransform;
        }
      }
      delete window.__dsLgEditionInstalled;
    };

    const initLiquidGlassEdition = () => {
      if (!isEnabled()) {
        teardownLiquidGlassEdition();
        return;
      }
      const editionInstanceKey = `${THEME.id || "custom"}:${REVISION}`;
      if (window.__dsLgEditionInstalled === editionInstanceKey) return;
      teardownLiquidGlassEdition();
      window.__dsLgEditionInstalled = editionInstanceKey;

      const root = document.documentElement;
      const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      const resolveMotionFlags = () => {
        const mode = motionMode || "spring";
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

      const fallbackTagline = THEME.brandSubtitle || "LIQUID GLASS EDITION";
      if (!root.style.getPropertyValue("--dream-skin-tagline")) {
        root.style.setProperty("--dream-skin-tagline", JSON.stringify(fallbackTagline));
      }

      // Solve ArkUI continuous damped harmonic oscillator -> CSS linear() curve
      const solveSpringLinear = (responseS, dampingRatio, steps = 36) => {
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
        for (let t = 0.05; t <= 1.6; t += 0.01) {
          if (Math.abs(1 - sample(t)) < 0.0018 && Math.abs(1 - sample(t + 0.02)) < 0.0018) {
            duration = t;
            break;
          }
        }
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          pts.push(sample((i / steps) * duration).toFixed(4));
        }
        pts[0] = "0";
        pts[steps] = "1";
        return `${Math.round(duration * 1000)}ms linear(${pts.join(", ")})`;
      };

      root.style.setProperty("--ds-lg-spring-responsive", solveSpringLinear(0.14, 0.85, 32));
      root.style.setProperty("--ds-lg-spring-settle", solveSpringLinear(0.34, 0.80, 36));
      root.style.setProperty("--ds-lg-spring-press", solveSpringLinear(0.18, 0.74, 28));

      // Resolve theme RGB tokens + per-theme S26 optical prism signature
      const csRoot = getComputedStyle(root);
      const accentRgb = parseRgbTriplet(THEME.colors?.accent || csRoot.getPropertyValue("--ds-accent-rgb"), "100,114,178");
      const accentAltRgb = parseRgbTriplet(THEME.colors?.accentAlt || THEME.colors?.highlight || csRoot.getPropertyValue("--ds-secondary-rgb"), accentRgb);
      const mixRgbTriplet = (aStr, bStr, t) => {
        const a = aStr.split(",").map(Number);
        const b = bStr.split(",").map(Number);
        return [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)).join(" ");
      };
      const opticsSig = {
        prismA: THEME.optics?.prismA || mixRgbTriplet("255,255,255", accentRgb, 0.24),
        prismB: THEME.optics?.prismB || accentAltRgb.replace(/,/g, " "),
      };
      root.style.setProperty("--ds-lg-accent-rgb", accentRgb.replace(/,/g, " "));
      root.style.setProperty("--ds-lg-accent-alt-rgb", accentAltRgb.replace(/,/g, " "));
      root.style.setProperty("--ds-lg-prism-a", opticsSig.prismA);
      root.style.setProperty("--ds-lg-prism-b", opticsSig.prismB);

      // === Real-Time Wallpaper Luminance & Environment Color Sampler (S26 Optical Adaptation) ===
      const ENV_W = 72;
      const ENV_H = 45;
      let envPixels = null;
      const artFocusX = Math.max(0, Math.min(1, Number(THEME.art?.focusX ?? 0.5)));
      const artFocusY = Math.max(0, Math.min(1, Number(THEME.art?.focusY ?? 0.45)));
      let envImgW = 1920;
      let envImgH = 1080;

      // === Real-Time Hardware GPU (WebGL2) Optical Liquid Glass Engine (iOS 26 Physics) ===
      const gpuArtImg = new Image();
      let gpuArtReady = false;
      const gpuBlobMap = new WeakMap();
      const allBlobUrls = new Set();
      const trackedHeroEls = new Set();
      let rectCache = new WeakMap();
      let gpuGl = null;
      let gpuCanvas = null;
      let gpuProg = null;
      let gpuTex = null;
      let gpuUniforms = null;
      let gpuQueue = new Set();
      let gpuFlushRaf = 0;

      const GPU_VERT = `#version 300 es
        in vec2 aPos;
        out vec2 vUv;
        void main() {
          vUv = aPos * 0.5 + 0.5;
          gl_Position = vec4(aPos, 0.0, 1.0);
        }
      `;

      const GPU_FRAG = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;

        uniform sampler2D uArt;
        uniform vec2 uViewport;
        uniform vec2 uImgSize;
        uniform vec2 uFocus;
        uniform vec4 uBox; // x, y, w, h in CSS px
        uniform float uRadius;
        uniform float uBezel;
        uniform float uRefract;
        uniform float uChromatic;
        uniform float uBlurLod;
        uniform float uCoreAlpha;
        uniform float uRimAlpha;
        uniform float uSatBoost;
        uniform vec4 uTint;
        uniform vec3 uPrismA;
        uniform vec3 uPrismB;

        float sdRoundedBox(vec2 p, vec2 b, float r) {
          vec2 q = abs(p) - b + vec2(r);
          return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
        }

        vec2 sdGrad(vec2 p, vec2 b, float r) {
          vec2 e = vec2(1.0, 0.0);
          float dx = sdRoundedBox(p + e.xy, b, r) - sdRoundedBox(p - e.xy, b, r);
          float dy = sdRoundedBox(p + e.yx, b, r) - sdRoundedBox(p - e.yx, b, r);
          float len = max(1e-4, length(vec2(dx, dy)));
          return vec2(dx, dy) / len;
        }

        vec2 screenToArtUv(vec2 screenPx) {
          float s = max(uViewport.x / max(1.0, uImgSize.x), uViewport.y / max(1.0, uImgSize.y));
          vec2 drawSize = uImgSize * s;
          vec2 off = (uViewport - drawSize) * uFocus;
          vec2 uv = (screenPx - off) / max(vec2(1.0), drawSize);
          return clamp(uv, vec2(0.001), vec2(0.999));
        }

        vec3 boostSat(vec3 c, float sat) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          return clamp(mix(vec3(l), c, sat), 0.0, 1.0);
        }

        void main() {
          vec2 localPx = vec2(vUv.x * uBox.z, (1.0 - vUv.y) * uBox.w);
          vec2 screenPx = uBox.xy + localPx;
          vec2 halfSize = uBox.zw * 0.5;
          vec2 p = localPx - halfSize;
          float rad = min(uRadius, min(halfSize.x, halfSize.y) - 0.5);
          float d = sdRoundedBox(p, halfSize - vec2(0.5), rad);
          if (d > 1.0) {
            fragColor = vec4(0.0);
            return;
          }

          float aa = smoothstep(0.8, -0.65, d);
          float distIn = max(0.0, -d);
          float bez = min(uBezel, min(halfSize.x, halfSize.y) * 0.48);
          float t = clamp(distIn / max(1.0, bez), 0.0, 1.0);
          float bezelCurve = pow(1.0 - t, 3.2);

          vec2 n = sdGrad(p, halfSize - vec2(0.5), rad);
          float disp = bezelCurve * uRefract;
          // Thin-wall Apple Control Center refraction concentrated cleanly on outer bezel, calm crystal interior
          vec2 uvR = screenToArtUv(screenPx - n * (disp * (1.0 - uChromatic)));
          vec2 uvG = screenToArtUv(screenPx - n * disp);
          vec2 uvB = screenToArtUv(screenPx - n * (disp * (1.0 + uChromatic)));

          float lod = mix(uBlurLod, max(0.4, uBlurLod + 0.7), bezelCurve);
          vec3 bgCol = vec3(
            textureLod(uArt, uvR, lod).r,
            textureLod(uArt, uvG, lod).g,
            textureLod(uArt, uvB, lod).b
          );
          bgCol = boostSat(bgCol, uSatBoost);
          vec3 glassCol = mix(bgCol, uTint.rgb, uTint.a * (1.0 - bezelCurve * 0.35));

          // Chromatic & specular rim Fresnel highlight
          float rimBand = smoothstep(3.2, 0.0, distIn);
          float innerGlow = smoothstep(10.0, 0.0, distIn) * 0.22;
          vec2 lightDir = normalize(vec2(-0.62, -0.78));
          float directional = max(0.0, dot(n, lightDir));
          float backLight = max(0.0, dot(n, -lightDir)) * 0.45;
          vec3 prismTint = mix(uPrismA, uPrismB, clamp(vUv.x * 0.65 + (1.0 - vUv.y) * 0.35, 0.0, 1.0));
          vec3 rimCol = mix(prismTint, vec3(1.0), 0.62 + directional * 0.38);

          glassCol = mix(glassCol, rimCol, innerGlow * 0.55);
          glassCol = mix(glassCol, rimCol, rimBand * (0.48 + (directional + backLight) * 0.52) * uRimAlpha);

          // Outer glass thickness hairline for clean S26 spatial separation
          float outerLip = smoothstep(1.3, 0.25, distIn) * (1.0 - directional * 0.55);
          glassCol = mix(glassCol, vec3(0.08, 0.11, 0.18), outerLip * 0.20);

          float bezelMask = smoothstep(bez, max(0.5, bez * 0.12), distIn);
          float outAlpha = mix(uCoreAlpha, max(uCoreAlpha, 0.90), clamp(bezelMask * 1.15 + rimBand * 0.9, 0.0, 1.0));
          outAlpha *= aa;
          fragColor = vec4(glassCol * outAlpha, outAlpha);
        }
      `;

      const initGpuPipeline = () => {
        if (gpuGl) return true;
        try {
          gpuCanvas = document.createElement("canvas");
          gpuCanvas.width = 2;
          gpuCanvas.height = 2;
          const gl = gpuCanvas.getContext("webgl2", {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
          });
          if (!gl) return false;
          const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
            return sh;
          };
          const vs = compile(gl.VERTEX_SHADER, GPU_VERT);
          const fs = compile(gl.FRAGMENT_SHADER, GPU_FRAG);
          if (!vs || !fs) return false;
          const prog = gl.createProgram();
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
          gl.useProgram(prog);
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
          const loc = gl.getAttribLocation(prog, "aPos");
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          const tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gpuGl = gl;
          gpuProg = prog;
          gpuTex = tex;
          gpuUniforms = {
            uArt: gl.getUniformLocation(prog, "uArt"),
            uViewport: gl.getUniformLocation(prog, "uViewport"),
            uImgSize: gl.getUniformLocation(prog, "uImgSize"),
            uFocus: gl.getUniformLocation(prog, "uFocus"),
            uBox: gl.getUniformLocation(prog, "uBox"),
            uRadius: gl.getUniformLocation(prog, "uRadius"),
            uBezel: gl.getUniformLocation(prog, "uBezel"),
            uRefract: gl.getUniformLocation(prog, "uRefract"),
            uChromatic: gl.getUniformLocation(prog, "uChromatic"),
            uBlurLod: gl.getUniformLocation(prog, "uBlurLod"),
            uCoreAlpha: gl.getUniformLocation(prog, "uCoreAlpha"),
            uRimAlpha: gl.getUniformLocation(prog, "uRimAlpha"),
            uSatBoost: gl.getUniformLocation(prog, "uSatBoost"),
            uTint: gl.getUniformLocation(prog, "uTint"),
            uPrismA: gl.getUniformLocation(prog, "uPrismA"),
            uPrismB: gl.getUniformLocation(prog, "uPrismB"),
          };
          return true;
        } catch {
          return false;
        }
      };

      const uploadArtTexture = () => {
        if (!gpuArtReady || !initGpuPipeline()) return;
        const gl = gpuGl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gpuTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gpuArtImg);
        gl.generateMipmap(gl.TEXTURE_2D);
      };

      const parseRgbVec3 = (triplet) => {
        const nums = String(triplet || "").trim().split(/\s+/).map((n) => Number(n) / 255);
        if (nums.length >= 3 && nums.every(Number.isFinite)) return [nums[0], nums[1], nums[2]];
        return [0.85, 0.90, 1.0];
      };
      const prismAVec = parseRgbVec3(opticsSig.prismA);
      const prismBVec = parseRgbVec3(opticsSig.prismB);

      const bakeGpuSurface = (el) => {
        if (!gpuArtReady || !gpuGl || !el?.isConnected) return;
        const r = el.getBoundingClientRect();
        rectCache.set(el, { rect: r, ts: performance.now() });
        if (r.width < 28 || r.height < 20 || r.width > 1600 || r.height > 1000) return;
        const spec = classifyGlassTier(el);
        const isThreadSurface = Boolean(el.closest?.('main:not(:has([data-testid="home-icon"]))') && !el.matches?.('aside.app-shell-left-panel, [data-ds-part="sidebar"], [role="menu"], [class~="bg-token-dropdown-background"]'));
        const isPopover = el.matches?.('[role="dialog"], [data-ds-part="dialog"]');
        const refractMult = Math.max(0, Math.min(2.2, Number(opticsOptions.refractScale ?? 1.0)));
        const blurMult = Math.max(0, Math.min(2.2, Number(opticsOptions.blurScale ?? 1.0)));
        const rimMult = Math.max(0, Math.min(2.2, Number(opticsOptions.rimIntensity ?? 1.0)));
        const alphaNum = typeof THEME.userTransparency === "number" ? (100 - THEME.userTransparency) / 100 : null;
        const tintMult = alphaNum !== null ? Math.max(0.18, Math.min(1.85, alphaNum / 0.20)) : 1.0;
        const coreAlpha = (isThreadSurface || isPopover) ? 0.0 : spec.coreAlpha;
        const qKey = `${Math.round(r.left / 4)}:${Math.round(r.top / 4)}:${Math.round(r.width / 4)}:${Math.round(r.height / 4)}:${spec.tier}:${coreAlpha.toFixed(2)}:${Math.round(refractMult * 100)}:${Math.round(blurMult * 100)}:${Math.round(rimMult * 100)}:${Math.round(tintMult * 100)}`;
        const prev = gpuBlobMap.get(el);
        if (prev && prev.key === qKey) return;

        const dpr = 1.0;
        const cw = Math.max(16, Math.round(r.width * dpr));
        const ch = Math.max(16, Math.round(r.height * dpr));
        if (gpuCanvas.width !== cw || gpuCanvas.height !== ch) {
          gpuCanvas.width = cw;
          gpuCanvas.height = ch;
        }
        const gl = gpuGl;
        gl.viewport(0, 0, cw, ch);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(gpuProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gpuTex);
        gl.uniform1i(gpuUniforms.uArt, 0);
        gl.uniform2f(gpuUniforms.uViewport, window.innerWidth, window.innerHeight);
        gl.uniform2f(gpuUniforms.uImgSize, envImgW, envImgH);
        gl.uniform2f(gpuUniforms.uFocus, artFocusX, artFocusY);
        gl.uniform4f(gpuUniforms.uBox, r.left, r.top, r.width, r.height);
        gl.uniform1f(gpuUniforms.uRadius, spec.radius);
        gl.uniform1f(gpuUniforms.uBezel, spec.bezel);
        gl.uniform1f(gpuUniforms.uRefract, spec.scale * refractMult);
        gl.uniform1f(gpuUniforms.uChromatic, spec.chromatic * refractMult);
        gl.uniform1f(gpuUniforms.uBlurLod, Math.max(0.0, spec.blurLod + (blurMult - 1.0) * 1.15));
        gl.uniform1f(gpuUniforms.uCoreAlpha, coreAlpha);
        gl.uniform1f(gpuUniforms.uRimAlpha, Math.min(1.4, spec.rimAlpha * rimMult));
        gl.uniform1f(gpuUniforms.uSatBoost, spec.saturate);
        const isDark = root.getAttribute("data-dream-shell") === "dark";
        if (isDark) {
          const baseDarkTint = spec.tier === "menu" ? 0.62 : 0.22;
          gl.uniform4f(gpuUniforms.uTint, 0.08, 0.10, 0.16, Math.min(0.92, baseDarkTint * tintMult));
        } else {
          gl.uniform4f(gpuUniforms.uTint, 1.0, 1.0, 1.0, Math.min(0.90, spec.tintAlpha * tintMult));
        }
        gl.uniform3fv(gpuUniforms.uPrismA, prismAVec);
        gl.uniform3fv(gpuUniforms.uPrismB, prismBVec);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        const url = gpuCanvas.toDataURL("image/png");
        gpuBlobMap.set(el, { key: qKey, url });
        el.style.setProperty("--ds-lg-gpu-bg", `url("${url}")`);
        el.setAttribute("data-dream-lg-gpu", "1");
      };

      const scheduleGpuBake = (el) => {
        if (!el?.isConnected || !el.matches?.(GPU_SURFACE_SELECTOR)) return;
        gpuQueue.add(el);
        if (!gpuFlushRaf) {
          gpuFlushRaf = requestAnimationFrame(() => {
            gpuFlushRaf = 0;
            const batch = [...gpuQueue];
            gpuQueue.clear();
            for (const item of batch) {
              if (item.isConnected) bakeGpuSurface(item);
            }
          });
        }
      };

      const loadWallpaperSampler = () => {
        const rawArt = String(csRoot.getPropertyValue("--dream-skin-art") || "").trim();
        const m = rawArt.match(/url\(["']?(.*?)["']?\)/i);
        const artSrc = m?.[1];
        if (!artSrc || artSrc === "none") return;
        gpuArtImg.onload = () => {
          try {
            envImgW = gpuArtImg.naturalWidth || 1920;
            envImgH = gpuArtImg.naturalHeight || 1080;
            const c = document.createElement("canvas");
            c.width = ENV_W;
            c.height = ENV_H;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(gpuArtImg, 0, 0, ENV_W, ENV_H);
              envPixels = ctx.getImageData(0, 0, ENV_W, ENV_H).data;
            }
            gpuArtReady = true;
            uploadArtTexture();
            refreshAllOptics();
          } catch {
            envPixels = null;
          }
        };
        gpuArtImg.src = artSrc;
      };

      const GLASS_TIERS = {
        composer: { tier: "cmp", radius: 28, bezel: 12, scale: 13, chromatic: 0.06, blurLod: 0.35, coreAlpha: 0.88, tintAlpha: 0.22, rimAlpha: 0.90, saturate: 1.56 },
        rail: { tier: "rail", radius: 24, bezel: 10, scale: 11, chromatic: 0.055, blurLod: 0.35, coreAlpha: 0.86, tintAlpha: 0.22, rimAlpha: 0.86, saturate: 1.52 },
        sidebar: { tier: "side", radius: 24, bezel: 15, scale: 15, chromatic: 0.07, blurLod: 0.65, coreAlpha: 0.86, tintAlpha: 0.26, rimAlpha: 0.82, saturate: 1.46 },
        menu: { tier: "menu", radius: 22, bezel: 12, scale: 14, chromatic: 0.065, blurLod: 0.34, coreAlpha: 1.0, tintAlpha: 0.58, rimAlpha: 0.90, saturate: 1.50 },
        dialog: { tier: "dlg", radius: 22, bezel: 12, scale: 14, chromatic: 0.07, blurLod: 0.40, coreAlpha: 0.0, tintAlpha: 0.16, rimAlpha: 0.88, saturate: 1.54 },
        card: { tier: "card", radius: 20, bezel: 12, scale: 12, chromatic: 0.06, blurLod: 0.35, coreAlpha: 0.86, tintAlpha: 0.20, rimAlpha: 0.82, saturate: 1.50 },
        pill: { tier: "pil", radius: 18, bezel: 9, scale: 10, chromatic: 0.05, blurLod: 0.35, coreAlpha: 0.88, tintAlpha: 0.24, rimAlpha: 0.90, saturate: 1.52 },
      };

      const HERO_OPTICS_SELECTOR = [
        '.composer-surface-chrome',
        '[class*="ComposerLayoutRoot"]',
        '[data-composer-surface-variant]',
        '[data-ds-part="composer"]',
        '[data-composer-rail][class*="attached-"]',
        '[class*="rail-"][class*="attached-"]',
        '[class*="_homeUtilityBar_"]',
        '[class*="_ComposerHomeUtilityBar_"]',
        'aside.app-shell-left-panel',
        '[data-ds-part="sidebar"]',
        '[role="dialog"]',
        '[role="menu"]',
        '[data-ds-part="dialog"]',
        '[class~="bg-token-dropdown-background"]',
        'section > div[class*="rounded-2xl"][class*="border"]',
        '[class*="group/settings"] div[class*="rounded-2xl"][class*="border"]',
        '.group\\/home-suggestions button',
        '.group\\/project-selector > button',
        '[data-ds-part="home-hero"] button',
      ].join(", ");

      // Hardware WebGL2 baked refractive glass on stationary surfaces & menus (0 Skia backdrop readbacks, 144 FPS!)
      const GPU_SURFACE_SELECTOR = [
        '.composer-surface-chrome',
        '[class*="ComposerLayoutRoot"]',
        '[data-composer-surface-variant]',
        '[data-ds-part="composer"]',
        '[data-composer-rail][class*="attached-"]',
        '[class*="rail-"][class*="attached-"]',
        '[class*="_homeUtilityBar_"]',
        '[class*="_ComposerHomeUtilityBar_"]',
        'aside.app-shell-left-panel',
        '[data-ds-part="sidebar"]',
        '[role="menu"]',
        '[class~="bg-token-dropdown-background"]',
        '.group\\/home-suggestions button',
        '.group\\/project-selector > button',
        '[data-ds-part="home-hero"] button',
      ].join(", ");

      const SPECULAR_SELECTOR = [
        '.composer-surface-chrome',
        '[class*="ComposerLayoutRoot"]',
        '[data-composer-surface-variant]',
        '[data-ds-part="composer"]',
        '[data-composer-rail][class*="attached-"]',
        '[class*="rail-"][class*="attached-"]',
        '[class*="_homeUtilityBar_"]',
        '[class*="_ComposerHomeUtilityBar_"]',
        'aside.app-shell-left-panel',
        '[data-ds-part="sidebar"]',
        'section > div[class*="rounded-2xl"][class*="border"]',
        '[class*="group/settings"] div[class*="rounded-2xl"][class*="border"]',
        '.group\\/home-suggestions button',
        '.group\\/project-selector > button',
        '[data-ds-part="home-hero"] button',
        '.thread-scroll-container [data-user-message-bubble="true"]',
        '.thread-scroll-container [class~="bg-user-message"]',
        '.thread-scroll-container :is([class*="group/activity-header"], summary, [data-markdown-copy="code-block"], pre)',
        'main div:has(> .group\\/turn-diff-header)',
        'aside.app-shell-left-panel button',
        'aside.app-shell-left-panel a',
        '[role="tab"]',
        'button[role="combobox"]',
        'header[class*="ApplicationMenuPageHeader"] :is(button, a)',
      ].join(", ");

      const classifyGlassTier = (el) => {
        if (el.matches?.('.composer-surface-chrome, [class*="ComposerLayoutRoot"], [data-composer-surface-variant], [data-ds-part="composer"]')) {
          return GLASS_TIERS.composer;
        }
        if (el.matches?.('[data-composer-rail], [class*="rail-"][class*="attached-"], [class*="_homeUtilityBar_"], [class*="_ComposerHomeUtilityBar_"]')) {
          return GLASS_TIERS.rail;
        }
        if (el.matches?.('aside.app-shell-left-panel, [data-ds-part="sidebar"]')) {
          return GLASS_TIERS.sidebar;
        }
        if (el.matches?.('[role="menu"], [class~="bg-token-dropdown-background"]')) {
          return GLASS_TIERS.menu;
        }
        if (el.matches?.('[role="tooltip"], [class*="Tooltip-"], .group\\/home-suggestions button, .group\\/project-selector > button, [data-ds-part="home-hero"] button')) {
          return GLASS_TIERS.pill;
        }
        if (el.matches?.('section > div[class*="rounded-2xl"][class*="border"], [class*="group/settings"] div[class*="rounded-2xl"][class*="border"]')) {
          return GLASS_TIERS.card;
        }
        return GLASS_TIERS.dialog;
      };

      const getCachedRect = (el, maxAgeMs = 320) => {
        const now = performance.now();
        const hit = rectCache.get(el);
        if (hit && now - hit.ts < maxAgeMs) return hit.rect;
        const rect = el.getBoundingClientRect();
        rectCache.set(el, { rect, ts: now });
        return rect;
      };

      const updateElementOptics = (el) => {
        if (!el?.isConnected) {
          trackedHeroEls.delete(el);
          return;
        }
        const r = el.getBoundingClientRect();
        rectCache.set(el, { rect: r, ts: performance.now() });
        if (r.width <= 0 || r.height <= 0) return;
        applyOpticsToElement(el, r);
        if (el.matches?.(GPU_SURFACE_SELECTOR)) {
          if (el.matches?.('[role="menu"], [class~="bg-token-dropdown-background"]')) {
            bakeGpuSurface(el);
            setTimeout(() => { if (el.isConnected) bakeGpuSurface(el); }, 40);
          }
          scheduleGpuBake(el);
        }
      };

      const refreshAllOptics = () => {
        for (const el of trackedHeroEls) {
          if (!el.isConnected) {
            trackedHeroEls.delete(el);
            continue;
          }
          const r = el.getBoundingClientRect();
          rectCache.set(el, { rect: r, ts: performance.now() });
          applyOpticsToElement(el, r);
          if (el.matches?.(GPU_SURFACE_SELECTOR)) {
            scheduleGpuBake(el);
          }
        }
      };

      const sampleRegionOptics = (r) => {
        const vw = Math.max(1, window.innerWidth);
        const vh = Math.max(1, window.innerHeight);
        if (!envPixels) return { lum: 0.78, rgb: accentRgb.replace(/,/g, " ") };
        const scale = Math.max(vw / envImgW, vh / envImgH);
        const drawW = envImgW * scale;
        const drawH = envImgH * scale;
        const offX = (vw - drawW) * artFocusX;
        const offY = (vh - drawH) * artFocusY;

        const x0 = Math.max(0, Math.min(ENV_W - 1, Math.floor(((r.left - offX) / drawW) * ENV_W)));
        const x1 = Math.max(x0, Math.min(ENV_W - 1, Math.ceil(((r.right - offX) / drawW) * ENV_W)));
        const y0 = Math.max(0, Math.min(ENV_H - 1, Math.floor(((r.top - offY) / drawH) * ENV_H)));
        const y1 = Math.max(y0, Math.min(ENV_H - 1, Math.ceil(((r.bottom - offY) / drawH) * ENV_H)));

        let rs = 0, gs = 0, bs = 0, cnt = 0;
        const stepX = Math.max(1, Math.floor((x1 - x0) / 8));
        const stepY = Math.max(1, Math.floor((y1 - y0) / 5));
        for (let py = y0; py <= y1; py += stepY) {
          for (let px = x0; px <= x1; px += stepX) {
            const i = (py * ENV_W + px) * 4;
            rs += envPixels[i];
            gs += envPixels[i + 1];
            bs += envPixels[i + 2];
            cnt++;
          }
        }
        if (!cnt) return { lum: 0.78, rgb: accentRgb.replace(/,/g, " ") };
        const ar = Math.round(rs / cnt);
        const ag = Math.round(gs / cnt);
        const ab = Math.round(bs / cnt);
        const lum = (0.2126 * ar + 0.7152 * ag + 0.0722 * ab) / 255;
        return { lum, rgb: `${ar} ${ag} ${ab}` };
      };

      const applyOpticsToElement = (el, r) => {
        if (!el?.isConnected || r.width <= 0 || r.height <= 0) return;
        const { lum, rgb } = sampleRegionOptics(r);
        const tone = lum >= 0.72 ? "bright" : (lum <= 0.44 ? "rich" : "balanced");
        if (el.getAttribute("data-dream-lg-tone") !== tone) {
          el.setAttribute("data-dream-lg-tone", tone);
        }
        el.style.setProperty("--ds-lg-bg-lum", lum.toFixed(2));
        el.style.setProperty("--ds-lg-env-rgb", rgb);
        // Higher background brightness strongly sharpens the dark-ice crystal rim separation on clear glass
        const rimAlpha = Math.max(0.24, Math.min(0.52, 0.22 + Math.max(0, lum - 0.26) * 0.44));
        el.style.setProperty("--ds-lg-rim-alpha", rimAlpha.toFixed(2));
      };

      const resizeObs = new ResizeObserver((entries) => {
        for (const entry of entries) updateElementOptics(entry.target);
      });
      const observedEls = new WeakSet();

      // === Continuous Sliding Segmented Pill Controller ("聊天 | 工作" & Tabs, iOS 26 Dock Style) ===
      const SEG_TRACK_SELECTOR = [
        '[role="tablist"]',
        '[role="radiogroup"]',
        'header [class*="segmented"]',
        'header [class*="Segmented"]',
        'header [class*="flex"][class*="items-center"]:not([class*="group/tab"]):has(> [role="tab"] + [role="tab"], > [role="radio"] + [role="radio"], > button[aria-selected], > button[data-state], > button[aria-pressed])',
      ].join(", ");

      const segStates = new WeakMap();
      const activeSegTracks = new Set();

      const findActiveSegItem = (track) => {
        const items = [...track.children].filter((c) => c.matches?.('[role="tab"], [role="radio"], button, a'));
        if (items.length < 2) return null;
        const active = items.find((c) =>
          c.getAttribute("aria-selected") === "true" ||
          c.getAttribute("aria-checked") === "true" ||
          c.getAttribute("aria-pressed") === "true" ||
          c.getAttribute("data-state") === "active" ||
          c.getAttribute("data-state") === "on" ||
          c.hasAttribute("aria-current") ||
          /\bbg-surface|\bbg-token-main|\bbg-primary|\bshadow-/.test(c.className?.toString?.() || "")
        );
        return active || items[0];
      };

      const segSprings = new Map();
      let segRaf = 0;
      let lastSegTime = 0;

      const stepSegSprings = (now) => {
        segRaf = 0;
        const dt = Math.min(0.032, Math.max(0.004, ((now - lastSegTime) || 16.6) / 1000));
        lastSegTime = now;
        for (const [track, st] of segSprings) {
          if (!track.isConnected) {
            segSprings.delete(track);
            continue;
          }
          const k = 380;
          const c = 26;
          const fx = -k * (st.x - st.tx) - c * st.vx;
          st.vx += fx * dt;
          st.x += st.vx * dt;
          const fw = -k * (st.w - st.tw) - c * st.vw;
          st.vw += fw * dt;
          st.w += st.vw * dt;

          // Velocity-coupled droplet horizontal stretch ("Dock" fluid morph)
          const speedNorm = Math.min(0.18, Math.abs(st.vx) / 1800);
          const sx = 1 + speedNorm;

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
        if (segSprings.size > 0) {
          segRaf = requestAnimationFrame(stepSegSprings);
        }
      };

      const syncSegmentedTrack = (track, animate = true) => {
        if (!track?.isConnected) return;
        const active = findActiveSegItem(track);
        if (!active) return;
        if (track.getAttribute("data-dream-lg-seg") !== "1") {
          track.setAttribute("data-dream-lg-seg", "1");
        }
        const tr = track.getBoundingClientRect();
        const ar = active.getBoundingClientRect();
        if (tr.width <= 0 || ar.width <= 0) return;
        const targetX = ar.left - tr.left;
        const targetW = ar.width;
        const prev = segStates.get(track);
        if (prev && Math.abs(prev.tx - targetX) < 0.5 && Math.abs(prev.tw - targetW) < 0.5) return;

        if (!animate || reducedMotion || !prev) {
          segStates.set(track, { tx: targetX, tw: targetW });
          track.style.setProperty("--ds-lg-seg-x", `${targetX.toFixed(2)}px`);
          track.style.setProperty("--ds-lg-seg-w", `${targetW.toFixed(2)}px`);
          track.style.setProperty("--ds-lg-seg-sx", "1");
          return;
        }
        const existing = segSprings.get(track) || { x: prev.tx, vx: 0, tx: targetX, w: prev.tw, vw: 0, tw: targetW };
        existing.tx = targetX;
        existing.tw = targetW;
        segStates.set(track, { tx: targetX, tw: targetW });
        segSprings.set(track, existing);
        if (!segRaf) {
          lastSegTime = performance.now();
          segRaf = requestAnimationFrame(stepSegSprings);
        }
      };

      // === HarmonyOS 7 Interruptible GPU-Only Spring Animator (0% Skia backdrop invalidation) ===
      const springNodes = new Map();
      let springRaf = 0;
      let lastSpringTime = 0;

      const stepSprings = (now) => {
        springRaf = 0;
        const dt = Math.min(0.032, Math.max(0.004, ((now - lastSpringTime) || 16.6) / 1000));
        lastSpringTime = now;
        for (const [el, st] of springNodes) {
          if (!el.isConnected) {
            springNodes.delete(el);
            continue;
          }
          const k = st.stiffness;
          const c = st.damping;
          const fs = -k * (st.s - st.ts) - c * st.vs;
          st.vs += fs * dt;
          st.s += st.vs * dt;
          const fx = -k * (st.x - st.tx) - c * st.vx;
          st.vx += fx * dt;
          st.x += st.vx * dt;
          const fy = -k * (st.y - st.ty) - c * st.vy;
          st.vy += fy * dt;
          st.y += st.vy * dt;
          const fsx = -k * (st.sx - st.tsx) - c * st.vsx;
          st.vsx += fsx * dt;
          st.sx += st.vsx * dt;

          const done = Math.abs(st.s - st.ts) < 0.0006 && Math.abs(st.vs) < 0.004
            && Math.abs(st.x - st.tx) < 0.08 && Math.abs(st.vx) < 0.5
            && Math.abs(st.y - st.ty) < 0.08 && Math.abs(st.vy) < 0.5
            && Math.abs(st.sx - st.tsx) < 0.001 && Math.abs(st.vsx) < 0.005;

          const buildTransform = (vx, vy, vs, vsx) =>
            `translate3d(${vx.toFixed(2)}px, ${vy.toFixed(2)}px, 0) scale(${(vs * vsx).toFixed(4)}, ${vs.toFixed(4)})`;

          if (done) {
            springNodes.delete(el);
            if (st.ts === 1 && st.tx === 0 && st.ty === 0 && st.tsx === 1) {
              el.style.removeProperty("transform");
              el.style.removeProperty("transition");
              delete el.dataset.dsLgTouchTransform;
            } else {
              el.style.transform = buildTransform(st.tx, st.ty, st.ts, st.tsx);
            }
          } else {
            el.dataset.dsLgTouchTransform = "1";
            el.style.transition = "none";
            el.style.transform = buildTransform(st.x, st.y, st.s, st.sx);
          }
        }
        if (springNodes.size > 0) {
          springRaf = requestAnimationFrame(stepSprings);
        }
      };

      const setSpringTarget = (el, target = {}, initDelta = null) => {
        if (!el?.isConnected || reducedMotion) return;
        let st = springNodes.get(el);
        if (!st) {
          st = {
            s: 1, vs: 0, ts: 1,
            x: 0, vx: 0, tx: 0,
            y: 0, vy: 0, ty: 0,
            sx: 1, vsx: 0, tsx: 1,
            stiffness: target.stiffness ?? 460,
            damping: target.damping ?? 27,
          };
          springNodes.set(el, st);
        }
        if (initDelta) {
          if (typeof initDelta.x === "number") st.x = initDelta.x;
          if (typeof initDelta.y === "number") st.y = initDelta.y;
          if (typeof initDelta.s === "number") st.s = initDelta.s;
          if (typeof initDelta.sx === "number") st.sx = initDelta.sx;
        }
        if (typeof target.ts === "number") st.ts = target.ts;
        if (typeof target.tx === "number") st.tx = target.tx;
        if (typeof target.ty === "number") st.ty = target.ty;
        if (typeof target.tsx === "number") st.tsx = target.tsx;
        if (typeof target.stiffness === "number") st.stiffness = target.stiffness;
        if (typeof target.damping === "number") st.damping = target.damping;
        if (!springRaf) {
          lastSpringTime = performance.now();
          springRaf = requestAnimationFrame(stepSprings);
        }
      };

      // === Tactile Harmony Micro-Particle & Zero-Repaint Rim Sheen Canvas ===
      const fxCanvas = document.createElement("canvas");
      fxCanvas.id = LG_CANVAS_ID;
      fxCanvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9998;";
      document.body?.appendChild(fxCanvas) || root.appendChild(fxCanvas);
      const fxCtx = fxCanvas.getContext("2d");
      const particles = [];
      let fxRaf = 0;
      let hoveredRect = null;
      let hoveredRadius = 20;
      let hoverCursorX = 0;
      let hoverCursorY = 0;
      let hoverSheenAlpha = 0;

      const sizeFxCanvas = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        fxCanvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
        fxCanvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
        fxCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        rectCache = new WeakMap();
        refreshAllOptics();
        for (const t of activeSegTracks) syncSegmentedTrack(t, false);
      };
      sizeFxCanvas();

      const stepFx = () => {
        fxRaf = 0;
        if (!fxCtx || !fxCanvas.isConnected) return;
        fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        // Draw smooth cursor-following perimeter crystal gleam with ZERO CSS style recalculation
        if (hoveredRect && hoverSheenAlpha > 0.01) {
          const prismRgb = opticsSig.prismB.replace(/ /g, ",");
          const rad = Math.min(hoveredRadius, hoveredRect.width * 0.5, hoveredRect.height * 0.5);
          const g = fxCtx.createRadialGradient(hoverCursorX, hoverCursorY, 2, hoverCursorX, hoverCursorY, 150);
          g.addColorStop(0, `rgba(255, 255, 255, ${(0.88 * hoverSheenAlpha).toFixed(3)})`);
          g.addColorStop(0.42, `rgba(${prismRgb}, ${(0.42 * hoverSheenAlpha).toFixed(3)})`);
          g.addColorStop(1, "rgba(255, 255, 255, 0)");
          fxCtx.save();
          fxCtx.strokeStyle = g;
          fxCtx.lineWidth = 1.6;
          fxCtx.beginPath();
          if (typeof fxCtx.roundRect === "function") {
            fxCtx.roundRect(hoveredRect.left + 0.5, hoveredRect.top + 0.5, Math.max(0, hoveredRect.width - 1), Math.max(0, hoveredRect.height - 1), rad);
          } else {
            fxCtx.rect(hoveredRect.left + 0.5, hoveredRect.top + 0.5, Math.max(0, hoveredRect.width - 1), Math.max(0, hoveredRect.height - 1));
          }
          fxCtx.stroke();
          fxCtx.restore();
          hoverSheenAlpha *= 0.88;
        }

        const now = performance.now();
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          const age = (now - p.t0) / p.life;
          if (age >= 1) {
            particles.splice(i, 1);
            continue;
          }
          const ease = 1 - Math.pow(1 - age, 3);
          const alpha = p.alpha * Math.pow(1 - age, 1.5);
          if (p.kind === "ring") {
            const rad = 4 + (p.maxR - 4) * ease;
            fxCtx.save();
            fxCtx.strokeStyle = `rgba(${p.rgb}, ${alpha.toFixed(3)})`;
            fxCtx.lineWidth = Math.max(0.4, 1.5 * (1 - age));
            fxCtx.beginPath();
            fxCtx.arc(p.x, p.y, rad, 0, Math.PI * 2);
            fxCtx.stroke();
            fxCtx.restore();
          } else {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.94;
            p.vy = p.vy * 0.94 - 0.04;
            fxCtx.save();
            fxCtx.fillStyle = `rgba(${p.rgb}, ${alpha.toFixed(3)})`;
            fxCtx.beginPath();
            fxCtx.arc(p.x, p.y, p.size * (1 - age * 0.4), 0, Math.PI * 2);
            fxCtx.fill();
            fxCtx.restore();
          }
        }
        if (particles.length > 0 || hoverSheenAlpha > 0.03) fxRaf = requestAnimationFrame(stepFx);
      };

      const emitBurst = (x, y) => {
        if (reducedMotion || liteMotion || opticsOptions.particlesEnabled === false || particles.length > 90) return;
        const t0 = performance.now();
        const prismRgb = opticsSig.prismB.replace(/ /g, ",");
        particles.push({ kind: "ring", x, y, t0, life: 410, maxR: 40, alpha: 0.44, rgb: accentRgb });
        particles.push({ kind: "ring", x, y, t0: t0 + 50, life: 340, maxR: 26, alpha: 0.54, rgb: "255,255,255" });
        const count = 5;
        const baseAngle = Math.random() * Math.PI * 2;
        for (let i = 0; i < count; i++) {
          const a = baseAngle + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
          const spd = 1.15 + Math.random() * 1.4;
          particles.push({
            kind: "dot",
            x, y, t0,
            life: 310 + Math.random() * 140,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 0.25,
            size: 1.4 + Math.random() * 1.0,
            alpha: i % 2 === 0 ? 0.60 : 0.74,
            rgb: i % 3 === 0 ? "255,255,255" : (i % 2 === 0 ? accentRgb : prismRgb),
          });
        }
        if (!fxRaf) fxRaf = requestAnimationFrame(stepFx);
      };

      // === Zero-Reflow Pointer Specular Tracking ===
      let pmRaf = 0;
      let lastClientX = window.innerWidth * 0.5;
      let lastClientY = window.innerHeight * 0.5;
      let lastTarget = null;
      let hoveredCard = null;
      let pairActive = false;

      const clearPairProximity = () => {
        if (!pairActive) return;
        pairActive = false;
        for (const n of document.querySelectorAll('[data-dream-lg-pair-active="1"]')) {
          n.removeAttribute("data-dream-lg-pair-active");
        }
      };

      const syncPairProximity = (card) => {
        const inPair = Boolean(card?.matches?.('.composer-surface-chrome, [class*="ComposerLayoutRoot"], [data-composer-surface-variant], [data-ds-part="composer"], [data-composer-rail], [class*="rail-"][class*="attached-"], [class*="_homeUtilityBar_"], [class*="_ComposerHomeUtilityBar_"]'));
        if (!inPair) {
          clearPairProximity();
          return;
        }
        pairActive = true;
        for (const n of document.querySelectorAll('.composer-surface-chrome, [class*="ComposerLayoutRoot"], [data-composer-surface-variant], [data-composer-rail], [class*="rail-"][class*="attached-"], [class*="_homeUtilityBar_"], [class*="_ComposerHomeUtilityBar_"]')) {
          if (n.getAttribute("data-dream-lg-pair-active") !== "1") {
            n.setAttribute("data-dream-lg-pair-active", "1");
          }
        }
      };

      const clearHoverCard = () => {
        clearPairProximity();
        hoveredRect = null;
        hoverSheenAlpha = 0;
        if (!hoveredCard) return;
        if (hoveredCard.isConnected) {
          hoveredCard.removeAttribute("data-dream-lg-hover");
        }
        hoveredCard = null;
      };

      const onPointerMove = (e) => {
        if (reducedMotion || liteMotion) {
          if (hoveredCard) clearHoverCard();
          return;
        }
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        lastTarget = e.target;
        if (pmRaf) return;
        pmRaf = requestAnimationFrame(() => {
          pmRaf = 0;
          const card = lastTarget?.closest?.(SPECULAR_SELECTOR);
          if (hoveredCard && hoveredCard !== card) {
            hoveredCard.removeAttribute("data-dream-lg-hover");
          }
          hoveredCard = card?.isConnected ? card : null;
          syncPairProximity(hoveredCard);
          if (!hoveredCard) {
            hoveredRect = null;
            hoverSheenAlpha = 0;
            return;
          }
          const r = getCachedRect(hoveredCard, 280);
          if (r.width <= 0 || r.height <= 0) return;
          if (hoveredCard.getAttribute("data-dream-lg-hover") !== "1") {
            hoveredCard.setAttribute("data-dream-lg-hover", "1");
          }
          hoveredRect = r;
          hoveredRadius = classifyGlassTier(hoveredCard).radius || 18;
          hoverCursorX = lastClientX;
          hoverCursorY = lastClientY;
          hoverSheenAlpha = 0.92;
          if (!fxRaf) fxRaf = requestAnimationFrame(stepFx);
        });
      };

      // === Interruptible Press Spring + Fluid Segmented / Nav Pill Morph ===
      const SPRING_PRESS_SELECTOR = [
        'button',
        'a',
        '[role="button"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="option"]',
        '[role="switch"]',
        '.group\\/home-suggestions button',
        '.group\\/project-selector > button',
      ].join(", ");

      let pressedEl = null;

      const releasePressed = () => {
        if (!pressedEl) return;
        const el = pressedEl;
        pressedEl = null;
        if (el.isConnected) {
          setSpringTarget(el, { ts: 1, ty: 0, sx: 1, stiffness: 520, damping: 24 });
        }
      };

      const maybeRunFlip = (clickedEl, groupContainer) => {
        if (reducedMotion || !groupContainer) return;
        if (groupContainer.matches?.(SEG_TRACK_SELECTOR)) {
          requestAnimationFrame(() => syncSegmentedTrack(groupContainer, true));
          setTimeout(() => syncSegmentedTrack(groupContainer, true), 36);
          return;
        }
        const isSwitch = clickedEl.matches?.('[role="switch"]');
        if (isSwitch) {
          const track = clickedEl.querySelector('span');
          if (track) setSpringTarget(track, { ts: 1, tsx: 1, stiffness: 560, damping: 24 }, { s: 0.95, sx: 1.10 });
        }
      };

      const onPointerDown = (e) => {
        if (e.button !== 0) return;
        const interactive = e.target?.closest?.(SPRING_PRESS_SELECTOR);
        if (!interactive) return;
        emitBurst(e.clientX, e.clientY);
        if (reducedMotion || liteMotion) return;
        if (interactive.matches?.('[data-composer-layout], [class*="ComposerLayout"]')) return;
        const r = interactive.getBoundingClientRect();
        if (r.width > 0 && r.width < 340) {
          pressedEl = interactive;
          const isSwitch = interactive.matches?.('[role="switch"]');
          setSpringTarget(interactive, { ts: isSwitch ? 0.94 : 0.964, ty: 0.5, stiffness: 640, damping: 28 });
        }
        const segTrack = interactive.closest?.(SEG_TRACK_SELECTOR);
        if (segTrack || interactive.matches?.('[role="switch"]')) {
          maybeRunFlip(interactive, segTrack || interactive.parentElement);
        }
      };

      // === Incremental DOM Scanner ===
      const ENTER_SELECTOR = [
        '.thread-scroll-container [data-local-conversation-turn]',
        '.thread-scroll-container [data-ds-part="message"]',
        '[role="dialog"]',
        '[role="menu"]',
        '[role="tooltip"]',
        '[class*="Tooltip-"]',
        '[class~="bg-token-dropdown-background"]',
      ].join(", ");

      let domScanRaf = 0;
      let lastBusyCheck = 0;

      const registerGlassTree = (scopeNode) => {
        if (!scopeNode || scopeNode.nodeType !== 1) return;
        if (scopeNode.matches?.(HERO_OPTICS_SELECTOR)) {
          trackedHeroEls.add(scopeNode);
          if (!observedEls.has(scopeNode)) {
            observedEls.add(scopeNode);
            resizeObs.observe(scopeNode);
            updateElementOptics(scopeNode);
          }
        }
        if (scopeNode.querySelectorAll) {
          for (const el of scopeNode.querySelectorAll(HERO_OPTICS_SELECTOR)) {
            trackedHeroEls.add(el);
            if (!observedEls.has(el)) {
              observedEls.add(el);
              resizeObs.observe(el);
              updateElementOptics(el);
            }
          }
          if (scopeNode.matches?.(SEG_TRACK_SELECTOR)) {
            activeSegTracks.add(scopeNode);
            syncSegmentedTrack(scopeNode, false);
          }
          for (const seg of scopeNode.querySelectorAll(SEG_TRACK_SELECTOR)) {
            activeSegTracks.add(seg);
            syncSegmentedTrack(seg, false);
          }
        }
        if (scopeNode.matches?.(ENTER_SELECTOR) && !scopeNode.hasAttribute("data-dream-lg-seen")) {
          scopeNode.setAttribute("data-dream-lg-seen", "enter");
          scopeNode.addEventListener("animationend", () => {
            if (scopeNode.isConnected) scopeNode.setAttribute("data-dream-lg-seen", "done");
          }, { once: true });
        }
        if (scopeNode.querySelectorAll) {
          for (const node of scopeNode.querySelectorAll(ENTER_SELECTOR)) {
            if (!node.hasAttribute("data-dream-lg-seen")) {
              node.setAttribute("data-dream-lg-seen", "enter");
              node.addEventListener("animationend", () => {
                if (node.isConnected) node.setAttribute("data-dream-lg-seen", "done");
              }, { once: true });
            }
          }
        }
      };

      const fullScanDom = () => {
        domScanRaf = 0;
        if (!root.isConnected || root.getAttribute("data-dream-lg") !== "on") return;
        registerGlassTree(document.body || root);
        checkBusyState();
      };

      let settledTimer = 0;

      const checkBusyState = () => {
        const now = performance.now();
        if (now - lastBusyCheck < 140) return;
        lastBusyCheck = now;
        const prevBusy = root.getAttribute("data-dream-lg-busy");
        const stopBtn = document.querySelector('button[aria-label="停止"], button[aria-label*="stop" i]');
        const busyNode = document.querySelector('[aria-busy="true"]');
        const activeReasoning = document.querySelector('.thread-scroll-container [data-response-annotation-conversation]:not([data-local-conversation-final-assistant] *)');
        const nextBusy = (stopBtn || busyNode || activeReasoning) ? "true" : "false";
        if (prevBusy !== nextBusy) {
          root.setAttribute("data-dream-lg-busy", nextBusy);
          if (prevBusy === "true" && nextBusy === "false" && !reducedMotion) {
            root.setAttribute("data-dream-lg-settled", "1");
            if (settledTimer) clearTimeout(settledTimer);
            settledTimer = setTimeout(() => {
              if (root.isConnected) root.removeAttribute("data-dream-lg-settled");
            }, 760);
          }
        }
      };

      let pendingRoots = new Set();
      let needBusyRefresh = false;
      let dirtySegs = new Set();

      const flushMutations = () => {
        domScanRaf = 0;
        if (!root.isConnected || root.getAttribute("data-dream-lg") !== "on") return;
        for (const n of pendingRoots) registerGlassTree(n);
        pendingRoots.clear();
        for (const s of dirtySegs) syncSegmentedTrack(s, true);
        dirtySegs.clear();
        if (needBusyRefresh) {
          needBusyRefresh = false;
          checkBusyState();
        }
      };

      const mutObs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "childList") {
            for (const added of m.addedNodes) {
              if (added.nodeType === 1) pendingRoots.add(added);
            }
            const track = m.target?.closest?.(SEG_TRACK_SELECTOR);
            if (track) dirtySegs.add(track);
            needBusyRefresh = true;
          } else if (m.type === "attributes") {
            const track = m.target?.closest?.(SEG_TRACK_SELECTOR);
            if (track) dirtySegs.add(track);
            needBusyRefresh = true;
          }
        }
        if (!domScanRaf && (pendingRoots.size > 0 || dirtySegs.size > 0 || needBusyRefresh)) {
          domScanRaf = requestAnimationFrame(flushMutations);
        }
      });

      if (document.body) {
        mutObs.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["aria-busy", "aria-selected", "aria-pressed", "aria-checked", "data-state", "data-app-shell-active-page", "data-local-conversation-final-assistant"],
        });
      }

      const syncMotionState = () => {
        const nextFlags = resolveMotionFlags();
        reducedMotion = nextFlags.reduced;
        liteMotion = nextFlags.lite;
        root.setAttribute("data-dream-lg-motion", reducedMotion ? "reduced" : (liteMotion ? "lite" : "full"));
      };
      const onMotionChange = () => syncMotionState();

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerdown", onPointerDown, { passive: true });
      window.addEventListener("pointerup", releasePressed, { passive: true });
      window.addEventListener("pointercancel", releasePressed, { passive: true });
      window.addEventListener("blur", releasePressed, { passive: true });
      window.addEventListener("mouseleave", clearHoverCard, { passive: true });
      window.addEventListener("resize", sizeFxCanvas, { passive: true });
      reducedMotionQuery?.addEventListener?.("change", onMotionChange);

      loadWallpaperSampler();
      fullScanDom();

      const cleanupFn = () => {
        mutObs.disconnect();
        resizeObs.disconnect();
        springNodes.clear();
        segSprings.clear();
        trackedHeroEls.clear();
        activeSegTracks.clear();
        gpuQueue.clear();
        for (const u of allBlobUrls) {
          try { URL.revokeObjectURL(u); } catch {}
        }
        allBlobUrls.clear();
        if (settledTimer) clearTimeout(settledTimer);
        if (fxRaf) cancelAnimationFrame(fxRaf);
        if (pmRaf) cancelAnimationFrame(pmRaf);
        if (springRaf) cancelAnimationFrame(springRaf);
        if (segRaf) cancelAnimationFrame(segRaf);
        if (domScanRaf) cancelAnimationFrame(domScanRaf);
        if (gpuFlushRaf) cancelAnimationFrame(gpuFlushRaf);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointerup", releasePressed);
        window.removeEventListener("pointercancel", releasePressed);
        window.removeEventListener("blur", releasePressed);
        window.removeEventListener("mouseleave", clearHoverCard);
        window.removeEventListener("resize", sizeFxCanvas);
        reducedMotionQuery?.removeEventListener?.("change", onMotionChange);
      };

      window.__dsLgEditionCleanup = cleanupFn;
    };

    const install = () => {
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
      install,
      init: initLiquidGlassEdition,
      teardown: teardownLiquidGlassEdition,
      setMotionMode: (nextMode) => {
        motionMode = nextMode || "spring";
      },
    };
  }

  return { create: createJbyLiquidGlassEngine };
});
