import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { decodeAndValidateSafeCss } from "../assets/safe-css-validator.mjs";
import {
  DEFAULT_LIVE_PARAMS,
  antigravityStateRoot,
  codexStateRoot,
  normalizeLiveParams,
  normalizePluginUiState,
  normalizeSharedGuardConfig,
  pluginConfigPath,
  readPluginConfig,
  readSharedGuardConfig,
  readThemeLiveParams,
  sharedImagesDir,
  sharedThemesDir,
  sharedThumbCacheDir,
  themePreferencesPath,
  writePluginConfig,
  writeSharedGuardConfig,
  writeThemeTransparency,
} from "../assets/antigravity-preferences.mjs";
import {
  deleteOpticalPreset,
  opticalPresetsPath,
  readOpticalPresets,
  resolveDefaultLiveParams,
  saveOpticalPreset,
  setDefaultOpticalPreset,
} from "../assets/optical-presets.mjs";
import { readImageMetadata } from "./image-metadata.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENGINE_ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ENGINE_ROOT, "assets");
const PRESETS_DIR = path.join(ENGINE_ROOT, "presets");

const SKIN_VERSION = "3.1.1";
const DEFAULT_PORT = 9235;

const CODEX_ROOT = codexStateRoot();
const AGY_ROOT = antigravityStateRoot();
const THEMES_DIR = sharedThemesDir();
const THUMB_CACHE_DIR = sharedThumbCacheDir();
const IMAGES_DIR = sharedImagesDir();
const CUSTOM_MEDIA_DIR = path.join(AGY_ROOT, "custom-media");
const ACTIVE_THEME_FILE = path.join(AGY_ROOT, "active-theme.json");
const STATE_FILE = path.join(AGY_ROOT, "state.json");
const DEFAULT_PAUSE_FILE = path.join(AGY_ROOT, "paused");

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const TARGET_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const RPC_BINDING_NAME = "__agyDsPluginRpc";

const OPERATION_UI_HOST_ID = "agy-dream-skin-operation-host";
const OPERATION_UI_REGISTRY_KEY = "__AGY_DREAM_SKIN_OPERATION_UI__";
const OPERATION_UI_CSS = `
  :host {
    position: fixed;
    inset: 0;
    z-index: 2147482900;
    pointer-events: none;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 44px;
    font-family: "Microsoft YaHei UI", "PingFang SC", "Segoe UI", system-ui, sans-serif;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  :host([data-visible="true"]) { opacity: 1; }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 9px 16px;
    border-radius: 999px;
    background: rgba(24, 28, 40, 0.84);
    color: #f4f7fd;
    border: 1px solid rgba(255, 255, 255, 0.24);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
    backdrop-filter: blur(16px) saturate(1.4);
    font-size: 13px;
    font-weight: 560;
  }
  :host([data-tone="light"]) .pill {
    background: rgba(255, 255, 255, 0.88);
    color: #151d2e;
    border-color: rgba(18, 28, 48, 0.14);
    box-shadow: 0 12px 30px rgba(10, 16, 32, 0.14);
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid #5b8eff;
    border-top-color: transparent;
    animation: agy-spin 700ms linear infinite;
  }
  :host([data-state="success"]) .dot { animation: none; border-color: #34c77b; background: #34c77b; }
  :host([data-state="error"]) .dot { animation: none; border-color: #ef5f76; background: #ef5f76; }
  @keyframes agy-spin { to { transform: rotate(360deg); } }
`;

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    mode: "watch",
    timeoutMs: 20000,
    screenshot: null,
    reload: false,
    themeId: null,
    themeDir: null,
    pauseFile: DEFAULT_PAUSE_FILE,
    operationKind: "apply",
    operationUiState: null,
    operationMessage: null,
    operationToken: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--begin-operation") options.mode = "begin-operation";
    else if (arg === "--finish-operation") options.mode = "finish-operation";
    else if (arg === "--self-test") options.mode = "self-test";
    else if (arg === "--check-payload") options.mode = "check-payload";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else if (arg === "--theme") options.themeId = argv[++i];
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--pause-file") options.pauseFile = path.resolve(argv[++i]);
    else if (arg === "--operation-kind") options.operationKind = argv[++i];
    else if (arg === "--operation-ui-state") options.operationUiState = argv[++i];
    else if (arg === "--operation-message") options.operationMessage = argv[++i];
    else if (arg === "--operation-token") options.operationToken = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  return options;
}

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\r\n`, "utf8");
  await fs.rename(tmp, filePath);
}

async function copyDirectorySafe(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDirectorySafe(s, d);
    else if (ent.isFile()) await fs.copyFile(s, d);
  }
}

// Initialize isolated Antigravity state under %LOCALAPPDATA%\JBYLiquidGlass\antigravity
// while reading themes/thumbs/images from shared %LOCALAPPDATA%\JBYLiquidGlass\.
async function ensureAntigravityInitialized() {
  await fs.mkdir(AGY_ROOT, { recursive: true });
  await fs.mkdir(CUSTOM_MEDIA_DIR, { recursive: true });
  await fs.mkdir(THEMES_DIR, { recursive: true });
  await fs.mkdir(THUMB_CACHE_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });

  const existingDirs = (await fs.readdir(THEMES_DIR, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory()).map((e) => e.name);
  if (existingDirs.length === 0) {
    const gothicPreset = path.join(PRESETS_DIR, "preset-gothic-void-crusade");
    if (await pathExists(gothicPreset)) {
      await copyDirectorySafe(gothicPreset, path.join(THEMES_DIR, "preset-gothic-void-crusade"));
    }
  }

  if (!await pathExists(ACTIVE_THEME_FILE)) {
    const postDirs = (await fs.readdir(THEMES_DIR, { withFileTypes: true }).catch(() => []))
      .filter((e) => e.isDirectory()).map((e) => e.name);
    // One-time read-only migration from earlier standalone AntigravityDreamSkin if valid
    const legacyFile = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "AntigravityDreamSkin",
      "active-theme.json",
    );
    const legacy = await readJsonSafe(legacyFile, null);
    let initialId = ["asuka-liquid-glass", "harmony-liquid-glass-lunar", "alpha-lock-liquid-glass", "preset-gothic-void-crusade"]
      .find((id) => postDirs.includes(id)) || postDirs[0] || "preset-gothic-void-crusade";
    let customImage = null;
    let customVideo = null;
    if (legacy && typeof legacy.themeId === "string" && postDirs.includes(legacy.themeId)) {
      initialId = legacy.themeId;
      if (legacy.customImage && await pathExists(legacy.customImage)) {
        const dst = path.join(CUSTOM_MEDIA_DIR, path.basename(legacy.customImage));
        await fs.copyFile(legacy.customImage, dst).catch(() => {});
        customImage = dst;
      }
      if (legacy.customVideo && await pathExists(legacy.customVideo)) {
        const dst = path.join(CUSTOM_MEDIA_DIR, path.basename(legacy.customVideo));
        await fs.copyFile(legacy.customVideo, dst).catch(() => {});
        customVideo = dst;
      }
    }
    await writeJsonAtomic(ACTIVE_THEME_FILE, {
      schemaVersion: 1,
      themeId: initialId,
      customImage,
      customVideo,
    });
  }
}

async function readActiveState() {
  const data = await readJsonSafe(ACTIVE_THEME_FILE, {});
  return {
    themeId: typeof data?.themeId === "string" && data.themeId ? data.themeId : "asuka-liquid-glass",
    customImage: typeof data?.customImage === "string" && data.customImage ? data.customImage : null,
    customVideo: typeof data?.customVideo === "string" && data.customVideo ? data.customVideo : null,
  };
}

async function resolveThemeDirectory(explicitDir = null, explicitId = null) {
  if (explicitDir) return explicitDir;
  const active = await readActiveState();
  const id = explicitId || active.themeId;
  const candidate = path.join(THEMES_DIR, id);
  if (await pathExists(path.join(candidate, "theme.json"))) return candidate;
  const dirs = (await fs.readdir(THEMES_DIR, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory()).map((e) => e.name);
  for (const dirName of dirs) {
    const p = path.join(THEMES_DIR, dirName);
    if (await pathExists(path.join(p, "theme.json"))) return p;
  }
  return path.join(PRESETS_DIR, "preset-gothic-void-crusade");
}

async function findThemeMediaFile(themeDir, theme) {
  const candidates = [
    theme?.image,
    theme?.background,
    "background.jpg",
    "background.png",
    "background.webp",
  ].filter(Boolean);
  for (const name of candidates) {
    const p = path.join(themeDir, name);
    if (await pathExists(p)) return p;
  }
  const files = await fs.readdir(themeDir).catch(() => []);
  const found = files.find((f) => /\.(?:png|jpe?g|webp)$/i.test(f));
  return found ? path.join(themeDir, found) : null;
}

function mimeForExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  return "image/jpeg";
}

async function toDataUrl(filePath, maxBytes = 24 * 1024 * 1024) {
  if (!filePath || !await pathExists(filePath)) return "";
  const st = await fs.stat(filePath);
  if (!st.isFile() || st.size > maxBytes) return "";
  const bytes = await fs.readFile(filePath);
  return `data:${mimeForExt(filePath)};base64,${bytes.toString("base64")}`;
}

async function listThemesCatalog() {
  const entries = await fs.readdir(THEMES_DIR, { withFileTypes: true }).catch(() => []);
  const list = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(THEMES_DIR, ent.name);
    const theme = await readJsonSafe(path.join(dir, "theme.json"), null);
    if (!theme) continue;
    const id = String(theme.id || ent.name);
    const safeId = id.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Support both Antigravity thumb-cache and Codex SHA cache naming
    let thumbDataUrl = await toDataUrl(path.join(THUMB_CACHE_DIR, `agy_${safeId}.jpg`), 512 * 1024);
    if (!thumbDataUrl) {
      thumbDataUrl = await toDataUrl(path.join(THUMB_CACHE_DIR, `${safeId}.jpg`), 512 * 1024);
    }
    list.push({
      id,
      dirName: ent.name,
      name: String(theme.name || id),
      subtitle: String(theme.brandSubtitle || theme.description || id).slice(0, 60),
      appearance: theme.appearance === "dark" ? "dark" : "light",
      liquidGlass: Boolean(theme.liquidGlass === true || id === "harmony-liquid-glass-lunar" || id.endsWith("-liquid-glass")),
      focusX: Number(theme.art?.focusX ?? 0.5),
      focusY: Number(theme.art?.focusY ?? 0.45),
      thumbDataUrl,
    });
  }
  list.sort((a, b) => Number(b.liquidGlass) - Number(a.liquidGlass) || a.name.localeCompare(b.name, "zh-CN"));
  return list;
}

async function buildPayload({ themeDir = null, themeId = null, catalog = null } = {}) {
  const activeState = await readActiveState();
  const resolvedDir = await resolveThemeDirectory(themeDir, themeId);
  const theme = await readJsonSafe(path.join(resolvedDir, "theme.json"), {});
  const effectiveId = String(theme.id || path.basename(resolvedDir) || "custom");
  theme.liquidGlass = Boolean(theme.liquidGlass === true || effectiveId === "harmony-liquid-glass-lunar" || effectiveId.endsWith("-liquid-glass"));

  const [selectorsJson, baseCss, templateJs, liveData, guardConfig, themesCatalog, opticalPresets] = await Promise.all([
    readJsonSafe(path.join(ASSETS_DIR, "antigravity-selectors.json"), { selectors: [] }),
    fs.readFile(path.join(ASSETS_DIR, "antigravity-skin.css"), "utf8"),
    fs.readFile(path.join(ASSETS_DIR, "antigravity-inject.js"), "utf8"),
    readThemeLiveParams(effectiveId),
    readSharedGuardConfig(),
    catalog ? Promise.resolve(catalog) : listThemesCatalog(),
    readOpticalPresets(),
  ]);

  let safeCssText = "";
  const themeCssPath = path.join(resolvedDir, "theme.css");
  if (await pathExists(themeCssPath)) {
    try {
      const cssBytes = await fs.readFile(themeCssPath);
      const compiled = decodeAndValidateSafeCss(cssBytes);
      safeCssText = compiled.runtimeSource;
    } catch (err) {
      console.error(`[agy-dream-skin] Skipping invalid theme.css for ${effectiveId}: ${err.message}`);
    }
  }

  let customMediaKind = "none";
  let videoUrl = "";
  let imageFile = await findThemeMediaFile(resolvedDir, theme);

  if (!themeId && !themeDir) {
    if (activeState.customVideo && await pathExists(activeState.customVideo)) {
      customMediaKind = "video";
      videoUrl = await toDataUrl(activeState.customVideo, 28 * 1024 * 1024);
    } else if (activeState.customImage && await pathExists(activeState.customImage)) {
      customMediaKind = "image";
      imageFile = activeState.customImage;
    }
  }

  const artDataUrl = await toDataUrl(imageFile, 20 * 1024 * 1024);
  if (artDataUrl && imageFile) {
    try {
      const bytes = await fs.readFile(imageFile);
      const meta = readImageMetadata(bytes, path.extname(imageFile));
      if (meta && (!theme.art || typeof theme.art !== "object")) {
        theme.art = { focusX: 0.5, focusY: 0.45, width: meta.width, height: meta.height };
      }
    } catch {}
  }

  const boot = {
    theme: { ...theme, id: effectiveId },
    selectors: selectorsJson.selectors || [],
    cssText: baseCss,
    safeCssText,
    artDataUrl,
    videoUrl,
    customMediaKind,
    revision: crypto.createHash("sha1")
      .update(`${effectiveId}:${customMediaKind}:${imageFile || ""}:${videoUrl.length}:${JSON.stringify(liveData.params)}:${JSON.stringify(opticalPresets)}`)
      .digest("hex")
      .slice(0, 12),
    version: SKIN_VERSION,
    liveParams: liveData.params,
    pluginUi: liveData.ui,
    themesCatalog,
    guardConfig,
    opticalPresets,
    studioBundle: true,
  };

  const startMarker = "/*__AGY_DS_BOOT__*/ {";
  const endMarker = "}/*__AGY_DS_BOOT_END__*/;";
  const idx = templateJs.indexOf(startMarker);
  if (idx === -1) throw new Error("Template placeholder /*__AGY_DS_BOOT__*/ missing");
  const closeIdx = templateJs.indexOf(endMarker, idx);
  if (closeIdx === -1) throw new Error("Template end marker /*__AGY_DS_BOOT_END__*/ missing");

  const payload = templateJs.slice(0, idx)
    + `/*__AGY_DS_BOOT__*/ ${JSON.stringify(boot)}/*__AGY_DS_BOOT_END__*/;`
    + templateJs.slice(closeIdx + endMarker.length);

  return { payload, boot, theme: boot.theme, revision: boot.revision };
}

// Wrap Page.addScriptToEvaluateOnNewDocument so injection NEVER runs inside iframes,
// data:text/html curtains, or before <html>, <body>, and Antigravity UI roots have mounted!
export function earlyPayloadFor(payload, revision) {
  return `(() => {
    if (window !== window.top) return;
    const u = String(location.href || "");
    if (u.startsWith("data:") || u.startsWith("devtools:") || u === "about:blank") return;
    if (!/^https:\\/\\/(?:127\\.0\\.0\\.1|localhost):\\d+\\//i.test(u) && !/^vscode-file:\\/\\//i.test(u)) return;
    const genKey = "__AGY_DREAM_SKIN_EARLY_GENERATION__";
    const appliedKey = "__AGY_DREAM_SKIN_EARLY_APPLIED__";
    const gen = ${JSON.stringify(revision)};
    window[genKey] = gen;
    let timer = null;
    let timeout = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };
    const hasSurface = () => Boolean(
      document.documentElement &&
      document.body &&
      document.querySelector('#root .agy-shell, #root .onboarding-shell, [data-main-content-body="true"], [data-testid="title-menu-bar"], .monaco-workbench')
    );
    const install = () => {
      if (window[genKey] !== gen) { stop(); return true; }
      if (!hasSurface()) return false;
      stop();
      ${payload};
      window[appliedKey] = gen;
      return true;
    };
    if (install()) return;
    document.addEventListener?.("DOMContentLoaded", () => install(), { once: true });
    timer = setInterval(install, 250);
    timeout = setTimeout(stop, 12000);
  })()`;
}

// === CDP Transport ===
function validatedDebuggerUrl(target, port) {
  const url = new URL(target.webSocketDebuggerUrl);
  const okPath = /^\/devtools\/(?:page|browser)\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname);
  if (url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port || !okPath) {
    throw new Error(`Rejected CDP URL: ${target.webSocketDebuggerUrl}`);
  }
  return url.href;
}

function isCandidateAntigravityTarget(item, port) {
  if (item?.type !== "page" || typeof item.id !== "string" || !TARGET_ID_PATTERN.test(item.id) || !item.webSocketDebuggerUrl) {
    return false;
  }
  const u = String(item.url || "");
  if (u.startsWith("data:") || u.startsWith("devtools://") || u === "about:blank") return false;
  const allowedOrigin = /^https:\/\/(?:127\.0\.0\.1|localhost):\d+\//i.test(u) || /^vscode-file:\/\//i.test(u);
  if (!allowedOrigin) return false;
  try {
    validatedDebuggerUrl(item, port);
    return true;
  } catch {
    return false;
  }
}

class CdpSession {
  constructor(target, port) {
    this.target = target;
    this.ws = new WebSocket(validatedDebuggerUrl(target, port));
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => { try { this.ws.close(); } catch {} reject(new Error("CDP WS open timed out")); }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(to); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(to); reject(new Error("CDP WS open failed")); }, { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.id) {
        const w = this.pending.get(msg.id);
        if (!w) return;
        clearTimeout(w.timeout);
        this.pending.delete(msg.id);
        if (msg.error) w.reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else w.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params ?? {});
      }
    });
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const w of this.pending.values()) { clearTimeout(w.timeout); w.reject(new Error("CDP socket closed")); }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  on(method, fn) {
    const arr = this.listeners.get(method) ?? [];
    arr.push(fn);
    this.listeners.set(method, arr);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP session closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 12000);
      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || "Renderer eval error");
    }
    return res.result?.value;
  }

  close() {
    if (!this.closed) try { this.ws.close(); } catch {}
    this.closed = true;
  }
}

async function fetchCdpJson(port, resource) {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), 2500);
  try {
    const res = await fetch(`http://127.0.0.1:${port}${resource}`, { signal: c.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}

async function probeAntigravityDom(session) {
  return session.evaluate(`(() => {
    const u = String(location.href || '');
    const isHub = Boolean(document.querySelector('#root .agy-shell, #root .onboarding-shell, [data-main-content-body="true"], [data-testid="title-menu-bar"]'));
    const isIde = Boolean(document.querySelector('.monaco-workbench'));
    const isDenied = u.startsWith('data:') || u.startsWith('devtools:') || document.title?.includes('DevTools');
    return {
      url: u,
      title: document.title,
      isAntigravity: Boolean(!isDenied && document.body && (isHub || isIde)),
      kind: isIde ? 'ide' : 'hub',
    };
  })()`);
}

async function connectAntigravityTargets(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const list = await fetchCdpJson(port, "/json/list");
      const candidates = (Array.isArray(list) ? list : []).filter((t) => isCandidateAntigravityTarget(t, port));
      const connected = [];
      for (const target of candidates) {
        let session;
        try {
          session = await new CdpSession(target, port).open();
          const probe = await probeAntigravityDom(session);
          if (probe?.isAntigravity) connected.push({ target, session, probe });
          else session.close();
        } catch (err) {
          session?.close();
          lastErr = err;
        }
      }
      if (connected.length > 0) return connected;
      lastErr = new Error("No Antigravity Hub/IDE page matched DOM probe");
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(`No Antigravity renderer found on 127.0.0.1:${port}: ${lastErr?.message || "timed out"}`);
}

async function showOperationUi(session, action, token, state = "loading", message = "") {
  if (session.closed) return;
  const cfg = { action, token, state, message };
  await session.evaluate(`(() => {
    const cfg = ${JSON.stringify(cfg)};
    const id = ${JSON.stringify(OPERATION_UI_HOST_ID)};
    const regKey = ${JSON.stringify(OPERATION_UI_REGISTRY_KEY)};
    const css = ${JSON.stringify(OPERATION_UI_CSS)};
    const clearTimers = (r) => { if (r?.expiryTimer) clearTimeout(r.expiryTimer); };
    if (cfg.action === 'hide' || cfg.action === 'clear') {
      const old = document.getElementById(id);
      clearTimers(window[regKey]);
      old?.remove();
      return;
    }
    let host = document.getElementById(id);
    if (!host && document.documentElement) {
      host = document.createElement('div');
      host.id = id;
      const sr = host.attachShadow({ mode: 'open' });
      const st = document.createElement('style'); st.textContent = css;
      const pill = document.createElement('div'); pill.className = 'pill';
      const dot = document.createElement('span'); dot.className = 'dot';
      const msg = document.createElement('span'); msg.className = 'msg';
      pill.append(dot, msg);
      sr.append(st, pill);
      document.documentElement.appendChild(host);
    }
    if (!host) return;
    const isLight = !document.body?.classList?.contains('theme-dark') && !document.body?.classList?.contains('dark');
    host.dataset.tone = isLight ? 'light' : 'dark';
    host.dataset.state = cfg.state;
    host.dataset.visible = 'true';
    const msgEl = host.shadowRoot?.querySelector('.msg');
    if (msgEl) msgEl.textContent = cfg.message;
    clearTimers(window[regKey]);
    const ttl = cfg.state === 'loading' ? 60000 : 1800;
    window[regKey] = {
      token: cfg.token,
      expiryTimer: setTimeout(() => { document.getElementById(id)?.remove(); }, ttl),
    };
  })()`).catch(() => {});
}

async function verifySession(session, expectedThemeId = null) {
  return session.evaluate(`(() => {
    const rt = window.__AGY_DREAM_SKIN_STATE__;
    const root = document.documentElement;
    const sidebar = document.querySelector('[data-ds-part="sidebar"]');
    const main = document.querySelector('[data-ds-part="main"], [data-ds-part="home"], [data-ds-part="thread"], .monaco-workbench .part.editor');
    const composer = document.querySelector('.surface-composer-card, [data-ds-part="composer"]');
    const wp = document.getElementById('agy-ds-wallpaper-layer');
    const studio = document.getElementById('agy-dream-skin-plugin-host');
    const svgDefs = document.getElementById('ds-lg-svg-defs');
    const rootHtmlLen = document.getElementById('root')?.innerHTML?.length ?? 0;
    const stylePresent = (rt?.styleMode === 'adopted' && [...document.adoptedStyleSheets].includes(rt.styleSheet))
      || Boolean(document.getElementById('agy-dream-skin-style'));
    const wallpaperReady = root?.getAttribute('data-dream-wallpaper-ready') === '1';
    const hasFilter = composer ? getComputedStyle(composer).backdropFilter : '';
    const pollution = [...document.querySelectorAll('[class]')].filter((n) =>
      [...n.classList].some((c) => /^(?:dream-|codex-dream-skin|agy-dream-skin)/.test(c))
    ).length;
    const expectedId = ${JSON.stringify(expectedThemeId)};
    const pass = Boolean(
      root?.getAttribute('data-dream-skin') === 'active'
      && wallpaperReady
      && rt?.version === ${JSON.stringify(SKIN_VERSION)}
      && (!expectedId || rt?.themeId === expectedId)
      && stylePresent
      && wp
      && studio
      && svgDefs
      && rootHtmlLen > 200
      && window.innerWidth >= 300
      && window.innerHeight >= 200
      && pollution === 0
    );
    return {
      pass,
      installed: root?.getAttribute('data-dream-skin') === 'active',
      wallpaperReady,
      shell: root?.getAttribute('data-dream-shell'),
      themeId: rt?.themeId || null,
      version: rt?.version || null,
      styleMode: rt?.styleMode || null,
      stylePresent,
      hasWallpaperLayer: Boolean(wp),
      hasStudioHost: Boolean(studio),
      hasSvgLenses: Boolean(svgDefs),
      hasSidebar: Boolean(sidebar),
      hasMain: Boolean(main),
      hasComposer: Boolean(composer),
      composerBackdropFilter: hasFilter,
      rootHtmlLen,
      businessClassPollution: pollution,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  })()`);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__AGY_DREAM_SKIN_DISABLED__ = true;
    try { window.__AGY_DREAM_SKIN_STATE__?.cleanup?.(); } catch {}
    document.getElementById('agy-dream-skin-plugin-host')?.remove();
    document.getElementById('agy-ds-wallpaper-layer')?.remove();
    document.getElementById('ds-lg-svg-defs')?.remove();
    document.getElementById('ds-lg-fx-canvas')?.remove();
    document.getElementById('agy-dream-skin-style')?.remove();
    document.documentElement?.removeAttribute('data-dream-wallpaper-ready');
    return true;
  })()`);
}

async function openWindowsFilePicker({ title, filter }) {
  if (process.platform !== "win32") return null;
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $d = [System.Windows.Forms.OpenFileDialog]::new()
    $d.Title = ${JSON.stringify(title)}
    $d.Filter = ${JSON.stringify(filter)}
    $d.Multiselect = $false
    if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }
  `;
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-STA", "-Command", psScript], { windowsHide: false });
  const picked = String(stdout || "").trim();
  return picked || null;
}

async function handleRpcAction({ action, payload = {} }, context) {
  if (action === "applyTheme") {
    const active = await readActiveState();
    const nextId = String(payload.themeId || active.themeId);
    await writeJsonAtomic(ACTIVE_THEME_FILE, { schemaVersion: 1, themeId: nextId, customImage: null, customVideo: null });
    await context.syncStatStamps?.();
    await context.reloadAll();
    return { ok: true, themeId: nextId, catalog: await listThemesCatalog() };
  }
  if (action === "reapplySkin") {
    await context.syncStatStamps?.();
    await context.reloadAll();
    return { ok: true };
  }
  if (action === "setLiveParams") {
    const themeId = String(payload.themeId || (await readActiveState()).themeId);
    const normalized = normalizeLiveParams(payload.params);
    if (payload.commit) {
      const cfg = await readPluginConfig();
      cfg.themes[themeId] = normalized;
      await writePluginConfig(cfg);
      await writeThemeTransparency(themeId, normalized.transparency);
      await context.syncStatStamps?.();
    }
    return { ok: true, params: normalized };
  }
  if (action === "resetThemeParams") {
    const themeId = String(payload.themeId || (await readActiveState()).themeId);
    const defParams = await resolveDefaultLiveParams();
    const cfg = await readPluginConfig();
    cfg.themes[themeId] = defParams;
    await writePluginConfig(cfg);
    await writeThemeTransparency(themeId, defParams.transparency);
    await context.syncStatStamps?.();
    return { ok: true, params: defParams, opticalPresets: await readOpticalPresets() };
  }
  if (action === "savePreset") {
    const saved = await saveOpticalPreset({
      id: payload.presetId || null,
      name: payload.name || "",
      params: payload.params || {},
      setAsDefault: Boolean(payload.setAsDefault),
    });
    await context.syncStatStamps?.();
    return { ok: true, savedPreset: saved.preset, opticalPresets: saved.state };
  }
  if (action === "setDefaultPreset") {
    let nextState;
    if (payload.presetId) {
      nextState = await setDefaultOpticalPreset(payload.presetId);
    } else {
      const saved = await saveOpticalPreset({
        name: payload.name || "",
        params: payload.params || {},
        setAsDefault: true,
      });
      nextState = saved.state;
    }
    await context.syncStatStamps?.();
    return { ok: true, opticalPresets: nextState };
  }
  if (action === "deletePreset") {
    const nextState = await deleteOpticalPreset(payload.presetId);
    await context.syncStatStamps?.();
    return { ok: true, opticalPresets: nextState };
  }
  if (action === "setPluginUi") {
    const cfg = await readPluginConfig();
    cfg.ui = normalizePluginUiState(payload.ui);
    await writePluginConfig(cfg);
    await context.syncStatStamps?.();
    return { ok: true, ui: cfg.ui };
  }
  if (action === "setGuardConfig") {
    // Only touch Antigravity keys inside shared JBYLiquidGlass/guard-config.json
    const saved = await writeSharedGuardConfig(payload.config);
    return { ok: true, config: saved };
  }
  if (action === "getThemeThumbSource") {
    const id = String(payload.themeId || "");
    const safeId = id.replace(/[^a-zA-Z0-9._-]/g, "_");
    let cached = await toDataUrl(path.join(THUMB_CACHE_DIR, `agy_${safeId}.jpg`), 512 * 1024);
    if (!cached) cached = await toDataUrl(path.join(THUMB_CACHE_DIR, `${safeId}.jpg`), 512 * 1024);
    if (cached) return { ok: true, thumbDataUrl: cached };
    const dir = await resolveThemeDirectory(null, id);
    const theme = await readJsonSafe(path.join(dir, "theme.json"), {});
    const media = await findThemeMediaFile(dir, theme);
    const rawDataUrl = await toDataUrl(media, 18 * 1024 * 1024);
    return { ok: Boolean(rawDataUrl), rawDataUrl };
  }
  if (action === "saveThemeThumb") {
    const id = String(payload.themeId || "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const dataUrl = String(payload.thumbDataUrl || "");
    const m = dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!id || !m) return { ok: false };
    await fs.mkdir(THUMB_CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(THUMB_CACHE_DIR, `agy_${id}.jpg`), Buffer.from(m[1], "base64"));
    return { ok: true };
  }
  if (action === "pickCustomWallpaper") {
    const picked = await openWindowsFilePicker({
      title: "选择自定义壁纸图片或动态视频 (JBY Liquid Glass · Antigravity)",
      filter: "壁纸图片或视频 (*.png;*.jpg;*.jpeg;*.webp;*.mp4;*.webm)|*.png;*.jpg;*.jpeg;*.webp;*.mp4;*.webm|所有文件|*.*",
    });
    if (!picked) return { ok: false, cancelled: true };
    const ext = path.extname(picked).toLowerCase();
    const isVideo = [".mp4", ".webm", ".mov"].includes(ext);
    const dst = path.join(CUSTOM_MEDIA_DIR, `custom-${Date.now()}${ext}`);
    await fs.mkdir(CUSTOM_MEDIA_DIR, { recursive: true });
    await fs.copyFile(picked, dst);
    const active = await readActiveState();
    await writeJsonAtomic(ACTIVE_THEME_FILE, {
      schemaVersion: 1,
      themeId: active.themeId,
      customImage: isVideo ? active.customImage : dst,
      customVideo: isVideo ? dst : null,
    });
    await context.syncStatStamps?.();
    await context.reloadAll();
    return { ok: true, path: dst, kind: isVideo ? "video" : "image" };
  }
  if (action === "resetCustomWallpaper") {
    const active = await readActiveState();
    await writeJsonAtomic(ACTIVE_THEME_FILE, { schemaVersion: 1, themeId: active.themeId, customImage: null, customVideo: null });
    await context.syncStatStamps?.();
    await context.reloadAll();
    return { ok: true };
  }
  if (action === "importThemeZip") {
    const zipPath = await openWindowsFilePicker({
      title: "选择主题压缩包 (.zip) — 将自动转为液态玻璃并推送",
      filter: "主题压缩包 (*.zip)|*.zip",
    });
    if (!zipPath) return { ok: false, cancelled: true };
    const importer = path.join(ENGINE_ROOT, "scripts", "import-theme-zip.ps1");
    if (await pathExists(importer)) {
      const target = ["none", "codex", "antigravity", "both"].includes(payload.target) ? payload.target : "antigravity";
      const args = [
        "-NoProfile", "-ExecutionPolicy", "RemoteSigned",
        "-File", importer,
        "-ArchivePath", zipPath,
        "-StateRoot", CODEX_ROOT,
        "-Target", target,
      ];
      if (payload.convertToLiquidGlass !== false) args.push("-ConvertToLiquidGlass");
      const { stdout } = await execFileAsync("powershell.exe", args, { windowsHide: true });
      let imported = {};
      try { imported = JSON.parse(String(stdout || "{}").trim().split(/\r?\n/).pop() || "{}"); } catch {}
      const themeId = String(imported.themeId || path.basename(zipPath, ".zip"));
      await context.syncStatStamps?.();
      await context.reloadAll();
      return { ok: true, themeId, liquidGlass: Boolean(imported.liquidGlass), catalog: await listThemesCatalog() };
    }
    const stage = await fs.mkdtemp(path.join(os.tmpdir(), "agy-ds-zip-"));
    try {
      await execFileAsync("powershell.exe", [
        "-NoProfile", "-Command",
        `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(stage)} -Force`,
      ]);
      let themeRoot = stage;
      if (!await pathExists(path.join(themeRoot, "theme.json"))) {
        const subs = await fs.readdir(stage, { withFileTypes: true });
        for (const s of subs) {
          if (s.isDirectory() && await pathExists(path.join(stage, s.name, "theme.json"))) {
            themeRoot = path.join(stage, s.name);
            break;
          }
        }
      }
      const themeObj = await readJsonSafe(path.join(themeRoot, "theme.json"), null);
      if (!themeObj) throw new Error("ZIP 内未找到有效的 theme.json");
      const themeId = String(themeObj.id || path.basename(zipPath, ".zip")).replace(/[^a-zA-Z0-9._-]/g, "-");
      const dest = path.join(THEMES_DIR, themeId);
      await copyDirectorySafe(themeRoot, dest);
      await writeJsonAtomic(ACTIVE_THEME_FILE, { schemaVersion: 1, themeId, customImage: null, customVideo: null });
      await context.syncStatStamps?.();
      await context.reloadAll();
      return { ok: true, themeId, catalog: await listThemesCatalog() };
    } finally {
      await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
    }
  }
  if (action === "openFolder") {
    const folder = payload.target === "images" ? IMAGES_DIR : THEMES_DIR;
    await fs.mkdir(folder, { recursive: true });
    if (process.platform === "win32") execFileAsync("explorer.exe", [folder]).catch(() => {});
    return { ok: true, folder };
  }
  return { ok: false, error: `Unknown RPC action: ${action}` };
}

async function runWatch(options) {
  const attached = new Map(); // targetId -> { session, earlyId, revision }
  const PLUGIN_CFG_FILE = pluginConfigPath();
  const PREFS_FILE = themePreferencesPath();
  const PRESETS_STATE_FILE = opticalPresetsPath();
  const statStamp = async (p) => (await fs.stat(p).catch(() => null))?.mtimeMs || 0;

  let currentBuilt = await buildPayload({ themeDir: options.themeDir, themeId: options.themeId });
  let lastActiveStat = await statStamp(ACTIVE_THEME_FILE);
  let lastPluginCfgStat = await statStamp(PLUGIN_CFG_FILE);
  let lastPrefStat = await statStamp(PREFS_FILE);
  let lastPresetsStat = await statStamp(PRESETS_STATE_FILE);
  let lastPaused = options.pauseFile ? await pathExists(options.pauseFile) : false;

  const writeState = async (themeId) => {
    await writeJsonAtomic(STATE_FILE, {
      schemaVersion: 1,
      port: options.port,
      injectorPid: process.pid,
      injectorPath: __filename,
      themeId,
      startedAt: new Date().toISOString(),
    }).catch(() => {});
  };
  await writeState(currentBuilt.theme.id);

  const injectSession = async (id, entry, built) => {
    const { session } = entry;
    if (entry.earlyId) {
      await session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: entry.earlyId }).catch(() => {});
    }
    const wrappedEarly = earlyPayloadFor(built.payload, built.revision);
    const added = await session.send("Page.addScriptToEvaluateOnNewDocument", { source: wrappedEarly }).catch(() => null);
    entry.earlyId = added?.identifier || null;
    await session.evaluate(built.payload);
    entry.revision = built.revision;
  };

  const context = {
    syncStatStamps: async () => {
      [lastActiveStat, lastPluginCfgStat, lastPrefStat, lastPresetsStat] = await Promise.all([
        statStamp(ACTIVE_THEME_FILE),
        statStamp(PLUGIN_CFG_FILE),
        statStamp(PREFS_FILE),
        statStamp(PRESETS_STATE_FILE),
      ]);
    },
    pushExternalParams: async () => {
      if (options.pauseFile && await pathExists(options.pauseFile)) return;
      currentBuilt = await buildPayload({ themeDir: options.themeDir, themeId: options.themeId });
      const liveParams = await readThemeLiveParams(currentBuilt.theme.id, currentBuilt.theme);
      const opticalPresets = await readOpticalPresets();
      const expr = `window.__agyDsApplyExternalParams?.(${JSON.stringify(liveParams)}, ${JSON.stringify(opticalPresets)})`;
      for (const [, entry] of attached) {
        if (!entry.session.closed) {
          if (entry.earlyId) {
            await entry.session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: entry.earlyId }).catch(() => {});
          }
          const wrappedEarly = earlyPayloadFor(currentBuilt.payload, currentBuilt.revision);
          const added = await entry.session.send("Page.addScriptToEvaluateOnNewDocument", { source: wrappedEarly }).catch(() => null);
          entry.earlyId = added?.identifier || null;
          await entry.session.evaluate(expr).catch(() => {});
        }
      }
    },
    reloadAll: async () => {
      if (options.pauseFile && await pathExists(options.pauseFile)) return;
      await context.syncStatStamps();
      currentBuilt = await buildPayload({ themeDir: options.themeDir, themeId: options.themeId });
      await writeState(currentBuilt.theme.id);
      for (const [id, entry] of attached) {
        if (!entry.session.closed) {
          await injectSession(id, entry, currentBuilt).catch(() => {});
        }
      }
    },
  };

  let scanning = false;
  const syncTargets = async () => {
    if (scanning) return;
    scanning = true;
    try {
      const isPaused = options.pauseFile ? await pathExists(options.pauseFile) : false;
      if (isPaused !== lastPaused) {
        lastPaused = isPaused;
        if (isPaused) {
          for (const [, entry] of attached) {
            if (!entry.session.closed) {
              if (entry.earlyId) {
                await entry.session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: entry.earlyId }).catch(() => {});
                entry.earlyId = null;
              }
              await removeFromSession(entry.session).catch(() => {});
            }
          }
          return;
        }
        await context.reloadAll().catch(() => {});
      }

      if (!isPaused) {
        const [activeStat, pluginCfgStat, prefStat, presetsStat] = await Promise.all([
          statStamp(ACTIVE_THEME_FILE),
          statStamp(PLUGIN_CFG_FILE),
          statStamp(PREFS_FILE),
          statStamp(PRESETS_STATE_FILE),
        ]);
        if (activeStat !== lastActiveStat) {
          lastActiveStat = activeStat;
          lastPluginCfgStat = pluginCfgStat;
          lastPrefStat = prefStat;
          lastPresetsStat = presetsStat;
          await context.reloadAll().catch(() => {});
        } else if (pluginCfgStat !== lastPluginCfgStat || prefStat !== lastPrefStat || presetsStat !== lastPresetsStat) {
          lastPluginCfgStat = pluginCfgStat;
          lastPrefStat = prefStat;
          lastPresetsStat = presetsStat;
          await context.pushExternalParams().catch(() => {});
        }
      }

      const list = await fetchCdpJson(options.port, "/json/list").catch(() => null);
      if (!Array.isArray(list)) return;
      const aliveIds = new Set();
      for (const item of list) {
        if (!isCandidateAntigravityTarget(item, options.port)) continue;
        aliveIds.add(item.id);
        if (attached.has(item.id) && !attached.get(item.id).session.closed) continue;
        let session;
        try {
          session = await new CdpSession(item, options.port).open();
          const probe = await probeAntigravityDom(session);
          if (!probe?.isAntigravity) { session.close(); continue; }
          await session.send("Runtime.addBinding", { name: RPC_BINDING_NAME }).catch(() => {});
          const entry = { session, earlyId: null, revision: null };
          attached.set(item.id, entry);
          session.on("Runtime.bindingCalled", async (ev) => {
            if (ev.name !== RPC_BINDING_NAME) return;
            let req;
            try { req = JSON.parse(String(ev.payload)); } catch { return; }
            const res = await handleRpcAction(req, context).catch((err) => ({ ok: false, error: err.message }));
            await session.evaluate(`window.__agyDsPluginReply?.(${JSON.stringify({ id: req.id, result: res })})`).catch(() => {});
          });
          if (!isPaused) {
            await injectSession(item.id, entry, currentBuilt);
          }
          console.log(`[agy-dream-skin] Attached & skinned (${probe.kind}): ${item.id}`);
        } catch {
          session?.close();
        }
      }
      for (const [id, entry] of attached) {
        if (!aliveIds.has(id) || entry.session.closed) {
          entry.session.close();
          attached.delete(id);
        }
      }
    } finally {
      scanning = false;
    }
  };

  console.log(`[agy-dream-skin] Watching Antigravity CDP on 127.0.0.1:${options.port} (theme: ${currentBuilt.theme.id})...`);
  await syncTargets();
  const interval = setInterval(syncTargets, 1600);
  const stop = async () => {
    clearInterval(interval);
    for (const { session } of attached.values()) session.close();
    await fs.rm(STATE_FILE, { force: true }).catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

async function runSelfTest(options) {
  await ensureAntigravityInitialized();
  const built = await buildPayload({ themeDir: options.themeDir, themeId: options.themeId });
  const early = earlyPayloadFor(built.payload, built.revision);
  new Function(built.payload);
  new Function(early);
  const prefs = normalizeLiveParams(DEFAULT_LIVE_PARAMS);
  const ui = normalizePluginUiState();
  const guard = normalizeSharedGuardConfig();
  if (!built.payload.includes("AGY_DREAM_SKIN")) throw new Error("Missing runtime marker");
  if (/backdrop-filter:\s*(?:var\([^)]*,\s*)?none\b\s*blur\(/i.test(built.boot.cssText)) {
    throw new Error("Forbidden backdrop-filter: none before blur()");
  }
  if (/background-attachment:\s*fixed/i.test(built.boot.cssText)) {
    throw new Error("Forbidden background-attachment: fixed");
  }
  console.log(JSON.stringify({
    ok: true,
    version: SKIN_VERSION,
    themeId: built.theme.id,
    payloadBytes: Buffer.byteLength(built.payload, "utf8"),
    earlyBytes: Buffer.byteLength(early, "utf8"),
    selectorCount: built.boot.selectors.length,
    catalogCount: built.boot.themesCatalog.length,
    prefsTransparency: prefs.transparency,
    uiPillMode: ui.pillMode,
    agyDefaultPort: guard.antigravityPort,
  }, null, 2));
}

async function runCheckPayload(options) {
  await ensureAntigravityInitialized();
  const built = await buildPayload({ themeDir: options.themeDir, themeId: options.themeId });
  const early = earlyPayloadFor(built.payload, built.revision);
  new Function(built.payload);
  new Function(early);
  console.log(JSON.stringify({
    ok: true,
    themeId: built.theme.id,
    revision: built.revision,
    payloadBytes: Buffer.byteLength(built.payload, "utf8"),
    earlyBytes: Buffer.byteLength(early, "utf8"),
    artEmbedded: built.boot.artDataUrl.startsWith("data:"),
    videoEmbedded: built.boot.videoUrl.startsWith("data:"),
  }, null, 2));
}

async function runOneShot(options) {
  const built = (options.mode === "once" || options.mode === "verify")
    ? await buildPayload({ themeDir: options.themeDir, themeId: options.themeId })
    : null;
  const connected = await connectAntigravityTargets(options.port, options.timeoutMs);
  const opToken = `${process.pid}:${Date.now()}`;
  try {
    const out = [];
    for (const { target, session, probe } of connected) {
      if (options.mode === "begin-operation") {
        await showOperationUi(session, "show", options.operationToken || opToken, "loading", "正在准备皮肤…");
        out.push({ id: target.id, ok: true });
      } else if (options.mode === "finish-operation") {
        await showOperationUi(session, "show", options.operationToken || opToken, options.operationUiState || "success", options.operationMessage || "完成");
        out.push({ id: target.id, ok: true });
      } else if (options.mode === "remove") {
        await showOperationUi(session, "show", opToken, "loading", "正在暂停 Antigravity 皮肤…");
        await removeFromSession(session);
        await showOperationUi(session, "show", opToken, "success", "Antigravity 皮肤已暂停");
        out.push({ id: target.id, kind: probe.kind, removed: true });
      } else {
        if (options.mode === "once") {
          await showOperationUi(session, "show", opToken, "loading", `正在应用「${built.theme.name}」…`);
          await session.evaluate(built.payload);
          await new Promise((r) => setTimeout(r, 700));
        }
        if (options.reload) {
          await session.send("Page.reload", { ignoreCache: true });
          await new Promise((r) => setTimeout(r, 1500));
          if (built) {
            await session.evaluate(built.payload);
            await new Promise((r) => setTimeout(r, 700));
          }
        }
        const expected = options.mode === "once" ? built?.theme.id : null;
        const v = await verifySession(session, expected);
        if (options.mode === "once") {
          await showOperationUi(session, "show", opToken, v?.pass ? "success" : "error",
            v?.pass ? `已应用「${built.theme.name}」` : "显示校验未通过");
        }
        out.push({ id: target.id, kind: probe.kind, verify: v });
        if (options.screenshot) {
          await showOperationUi(session, "hide", opToken);
          await fs.mkdir(path.dirname(options.screenshot), { recursive: true });
          const cap = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          await fs.writeFile(options.screenshot, Buffer.from(cap.data, "base64"));
        }
      }
    }
    console.log(JSON.stringify({ ok: true, results: out }, null, 2));
    if ((options.mode === "once" || options.mode === "verify") && out.some((r) => !r.verify?.pass)) {
      process.exitCode = 1;
    }
  } finally {
    for (const { session } of connected) session.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await ensureAntigravityInitialized();
  if (options.mode === "self-test") await runSelfTest(options);
  else if (options.mode === "check-payload") await runCheckPayload(options);
  else if (options.mode === "watch") await runWatch(options);
  else await runOneShot(options);
}

main().catch((err) => {
  console.error(`[agy-dream-skin] ${err?.message || err}`);
  process.exitCode = 1;
});
