import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  dreamSkinStateRoot,
  guardConfigPath,
  normalizeGuardConfig,
  normalizeLiveParams,
  pluginConfigPath,
  readGuardConfig,
  readPluginConfig,
  readThemeLiveParams,
  readThemeTransparency,
  themePreferencesPath,
  writeGuardConfig,
  writePluginConfig,
  writeThemeTransparency,
} from "../assets/theme-preferences.mjs";
import {
  deleteOpticalPreset,
  opticalPresetsPath,
  readOpticalPresets,
  resolveDefaultLiveParams,
  saveOpticalPreset,
  setDefaultOpticalPreset,
} from "../assets/optical-presets.mjs";
import { constants as fsConstants, watch as watchDirectory } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "./image-metadata.mjs";
import {
  normalizeThemeColor,
  normalizeThemeText,
} from "../assets/theme-package-validator.mjs";
import { decodeAndValidateSafeCss } from "../assets/safe-css-validator.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const here = path.dirname(scriptPath);
const root = path.resolve(here, "..");
const SELECTOR_CONTRACT = JSON.parse(await fs.readFile(
  path.join(root, "assets", "selectors.json"), "utf8",
));
if (SELECTOR_CONTRACT.schema !== "codex-dream-skin-selectors/1" ||
  !Array.isArray(SELECTOR_CONTRACT.selectors)) {
  throw new Error("assets/selectors.json has an unsupported schema");
}
const SELECTOR_MAP = new Map();
for (const entry of SELECTOR_CONTRACT.selectors) {
  if (!entry?.key || !entry.selector || SELECTOR_MAP.has(entry.key)) {
    throw new Error(`assets/selectors.json has an invalid selector key: ${entry?.key || "<missing>"}`);
  }
  SELECTOR_MAP.set(entry.key, entry.selector);
}
const selectorFor = (key) => {
  const selector = SELECTOR_MAP.get(key);
  if (!selector) throw new Error(`Selector contract is missing ${key}`);
  return selector;
};
const selectorLiteral = (key) => JSON.stringify(selectorFor(key));
const stableTestidLiteral = (testid) => {
  if (!SELECTOR_CONTRACT.stableTestids?.includes(testid)) {
    throw new Error(`Selector contract is missing stable testid ${testid}`);
  }
  return JSON.stringify(`[data-testid="${testid}"]`);
};
const SKIN_VERSION = "1.5.21";
// .github/workflows/ci.yml's version-consistency check greps this file for a
// literal `const SKIN_VERSION = "...";` line, so the export stays a separate
// statement rather than an inline `export const`.
export { SKIN_VERSION };
const MAX_ART_BYTES = 10 * 1024 * 1024;
const MAX_SAFE_CSS_BYTES = 256 * 1024;
const STRONG_THEME_AUDIT_MS = 30000;
const MIN_RENDERER_VIEWPORT_WIDTH = 320;
const MIN_RENDERER_VIEWPORT_HEIGHT = 240;
const VISIBLE_WINDOW_STATES = new Set(["normal", "maximized", "fullscreen"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const BROWSER_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const OPERATION_UI_HOST_ID = "chatgpt-dream-skin-operation";
const OPERATION_UI_REGISTRY_KEY = "__CHATGPT_DREAM_SKIN_OPERATION_UI__";
const OPERATION_KINDS = new Set(["apply", "pause", "switch"]);
const OPERATION_UI_STATES = new Set(["success", "error", "cancelled"]);
// Shared with macOS: in-renderer progress for pause/apply so both platforms feel the same.
const OPERATION_UI_CSS = `
  :host {
    all: initial;
    position: fixed;
    top: var(--dream-skin-operation-top, 0px);
    left: var(--dream-skin-operation-left, 0px);
    width: var(--dream-skin-operation-width, 100vw);
    height: var(--dream-skin-operation-height, 100vh);
    z-index: 2147483647;
    pointer-events: none;
    opacity: 0;
    display: grid;
    place-items: center;
    transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1);
    font-family: "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  }
  :host([data-visible="true"]) { opacity: 1; }
  .status {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: min(220px, calc(100% - 32px));
    min-height: 112px;
    padding: 18px 20px;
    border: 1px solid rgba(238, 239, 244, 0.16);
    border-radius: 8px;
    background: rgba(32, 33, 38, 0.94);
    color: #f3f3f6;
    box-shadow: 0 8px 24px rgba(12, 14, 19, 0.22);
    font-size: 13px;
    font-weight: 550;
    line-height: 1.35;
    text-align: center;
    transform: translateY(-4px) scale(0.98);
    transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  :host([data-visible="true"]) .status { transform: translateY(0) scale(1); }
  :host([data-tone="light"]) .status {
    border-color: #d9dbe3;
    background: rgba(248, 248, 251, 0.96);
    color: #25262c;
    box-shadow: 0 8px 24px rgba(31, 35, 48, 0.14);
  }
  .indicator {
    box-sizing: border-box;
    flex: 0 0 22px;
    width: 22px;
    height: 22px;
    color: #78a8f5;
  }
  :host([data-state="loading"]) .indicator {
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: dream-skin-operation-spin 720ms linear infinite;
  }
  :host([data-state="success"]) .indicator,
  :host([data-state="error"]) .indicator,
  :host([data-state="cancelled"]) .indicator {
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 16px;
    font-weight: 750;
  }
  :host([data-state="success"]) .indicator { color: #53b77b; }
  :host([data-state="success"]) .indicator::before { content: "✓"; }
  :host([data-state="error"]) .indicator { color: #e26d7e; }
  :host([data-state="error"]) .indicator::before { content: "!"; }
  :host([data-state="cancelled"]) .indicator { color: #a5a7b0; }
  :host([data-state="cancelled"]) .indicator::before { content: "×"; }
  .message { min-width: 0; overflow-wrap: anywhere; }
  @keyframes dream-skin-operation-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    :host, .status { transition: none; }
    :host([data-state="loading"]) .indicator {
      animation: none;
      border-top-color: currentColor;
      opacity: 0.65;
    }
  }
`;
let operationSequence = 0;

class CdpIdentityMismatchError extends Error {}

function parseArgs(argv) {
  const options = {
    port: 9335,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    reload: false,
    browserId: null,
    themeDir: path.join(root, "assets"),
    pauseFile: null,
    operationKind: null,
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
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--browser-id") options.browserId = argv[++i];
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--pause-file") options.pauseFile = path.resolve(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--operation-kind") options.operationKind = argv[++i];
    else if (arg === "--operation-ui-state") options.operationUiState = argv[++i];
    else if (arg === "--operation-message") options.operationMessage = argv[++i];
    else if (arg === "--operation-token") options.operationToken = argv[++i];
    else if (arg === "--reload") options.reload = true;
    else if (arg === "--self-test") options.mode = "self-test";
    else if (arg === "--check-payload") options.mode = "check-payload";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  if (options.browserId !== null && !BROWSER_ID_PATTERN.test(options.browserId)) {
    throw new Error(`Invalid browser ID: ${options.browserId}`);
  }
  if (options.operationToken !== null && !/^\d{1,12}:\d{13}:\d{1,8}$/.test(options.operationToken)) {
    throw new Error("Invalid operation token");
  }
  if (options.mode === "begin-operation") {
    if (!OPERATION_KINDS.has(options.operationKind)) {
      throw new Error("Begin operation requires --operation-kind apply, pause, or switch");
    }
    if (!options.browserId) throw new Error("--browser-id is required in begin-operation mode");
  }
  if (options.mode === "finish-operation") {
    if (!OPERATION_UI_STATES.has(options.operationUiState)) {
      throw new Error("Finish operation requires --operation-ui-state success, error, or cancelled");
    }
    if (!options.operationToken) throw new Error("Finish operation requires --operation-token");
    if (typeof options.operationMessage !== "string" || options.operationMessage.length > 240
      || /[\r\n]/.test(options.operationMessage)) {
      throw new Error("Finish operation requires a single-line --operation-message up to 240 characters");
    }
    if (!options.browserId) throw new Error("--browser-id is required in finish-operation mode");
  }
  if (["watch", "once", "verify", "remove"].includes(options.mode) && !options.browserId) {
    throw new Error(`--browser-id is required in ${options.mode} mode`);
  }
  return options;
}

function validatedDebuggerUrl(target, port) {
  const url = new URL(target.webSocketDebuggerUrl);
  const pathIsValid = /^\/devtools\/(?:page|browser)\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname);
  if (url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port ||
      url.username || url.password || url.search || url.hash || !pathIsValid) {
    throw new Error("Rejected a CDP WebSocket URL outside the allowed loopback endpoint shape");
  }
  return url.href;
}

function parseCdpMessage(data) {
  try {
    const message = JSON.parse(String(data));
    return message && typeof message === "object" ? message : null;
  } catch {
    return null;
  }
}

function browserIdFromVersion(version, port) {
  const url = validatedDebuggerUrl(version, port);
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/devtools\/browser\/([A-Za-z0-9._-]{1,200})$/);
  if (!match || parsed.search || parsed.hash || !BROWSER_ID_PATTERN.test(match[1])) {
    throw new Error("Rejected an invalid CDP browser identity URL");
  }
  return match[1];
}

function isValidCdpPageTarget(item, port) {
  if (item?.type !== "page" || !item.url?.startsWith("app://") || typeof item.id !== "string" ||
      !BROWSER_ID_PATTERN.test(item.id) || !item.webSocketDebuggerUrl) return false;
  try {
    const debuggerUrl = new URL(validatedDebuggerUrl(item, port));
    return debuggerUrl.pathname === `/devtools/page/${item.id}`;
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
      const timeout = setTimeout(() => {
        try { this.ws.close(); } catch {}
        reject(new Error("CDP WebSocket open timed out"));
      }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket open failed")); }, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("error", () => this.close());
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onMessage(event) {
    const message = parseCdpMessage(event.data);
    if (!message) {
      this.close();
      return;
    }
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        // Keep the numeric CDP code on the rejection: classifyNativeWindowError
        // reads it directly instead of re-parsing the human-readable message,
        // which Codex builds are free to reword at any time.
        const error = new Error(`${message.error.message} (${message.error.code})`);
        error.cdpCode = message.error.code;
        waiter.reject(error);
      } else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }

  close() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

class BrowserIdentityAnchor {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.closed = false;
    this.ws.addEventListener("close", () => { this.closed = true; });
    this.ws.addEventListener("error", () => {
      this.closed = true;
      try { this.ws.close(); } catch {}
    });
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.close();
        reject(new Error("CDP browser identity WebSocket open timed out"));
      }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("CDP browser identity WebSocket open failed"));
      }, { once: true });
      this.ws.addEventListener("close", () => {
        clearTimeout(timeout);
        reject(new Error("CDP browser identity WebSocket closed during startup"));
      }, { once: true });
    });
    if (this.closed) throw new Error("CDP browser identity WebSocket is already closed");
    return this;
  }

  close() {
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

async function fetchCdpJson(port, resource) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${resource}`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function listAppTargets(port, expectedBrowserId = null) {
  const targets = await fetchCdpJson(port, "/json/list");
  if (!Array.isArray(targets)) throw new Error("CDP target list is not an array");
  if (expectedBrowserId) {
    const version = await fetchCdpJson(port, "/json/version");
    const actualBrowserId = browserIdFromVersion(version, port);
    if (actualBrowserId !== expectedBrowserId) {
      throw new CdpIdentityMismatchError(
        `CDP browser identity changed from ${expectedBrowserId} to ${actualBrowserId}`,
      );
    }
  }
  return targets.filter((item) => isValidCdpPageTarget(item, port));
}

async function connectBrowserIdentityAnchor(port, expectedBrowserId) {
  const version = await fetchCdpJson(port, "/json/version");
  const actualBrowserId = browserIdFromVersion(version, port);
  if (actualBrowserId !== expectedBrowserId) {
    throw new CdpIdentityMismatchError(
      `CDP browser identity changed from ${expectedBrowserId} to ${actualBrowserId}`,
    );
  }
  return new BrowserIdentityAnchor(validatedDebuggerUrl(version, port)).open();
}

const THEME_CHOICES = {
  appearance: new Set(["auto", "light", "dark"]),
  safeArea: new Set(["auto", "left", "right", "center", "none"]),
  taskMode: new Set(["auto", "ambient", "banner", "full", "off"]),
};

function normalizedUnit(value, name) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${name} must be null or a number between 0 and 1`);
  }
  return number;
}

function normalizedChoice(value, name, choices, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (!choices.has(value)) throw new Error(`${name} has an unsupported value: ${value}`);
  return value;
}

function normalizedText(value, name, fallback, maxLength = 120) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string" || value.length > maxLength || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${name} must be a short single-line string`);
  }
  return value;
}

function sameFileStat(left, right) {
  return left.isFile() && right.isFile()
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function isContainedRelativePath(relativePath) {
  return relativePath !== ""
    && !path.isAbsolute(relativePath)
    && relativePath !== ".."
    && !relativePath.startsWith(`..${path.sep}`);
}

async function loadSafeCss(themeRoot) {
  const cssPath = path.join(themeRoot, "theme.css");
  let handle;
  try {
    handle = await fs.open(cssPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error.code === "ELOOP") throw new Error("Theme Safe CSS must not be a symbolic link");
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > MAX_SAFE_CSS_BYTES) {
      throw new Error(`Theme Safe CSS must be a non-empty file no larger than ${MAX_SAFE_CSS_BYTES} bytes`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameFileStat(before, after) || bytes.length !== after.size) {
      throw new Error("Theme Safe CSS changed while being loaded");
    }
    const { source, runtimeSource, validation } = decodeAndValidateSafeCss(bytes);
    return { path: cssPath, runtimeSource, source, stat: after, validation };
  } finally {
    await handle.close();
  }
}

export async function loadTheme(themeDir, preferenceOptions = {}) {
  const realThemeDir = await fs.realpath(themeDir);
  const themePath = path.join(realThemeDir, "theme.json");
  const themeText = await fs.readFile(themePath, "utf8");
  const raw = JSON.parse(themeText);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Theme root must be an object");
  }
  if (raw.schemaVersion !== 1) {
    throw new Error("Theme must use schemaVersion 1");
  }
  const image = normalizedText(raw.image, "image", null, 240);
  if (!image || path.isAbsolute(image)) throw new Error("Theme image must be a relative path");
  const imagePath = path.resolve(realThemeDir, image);
  const relativeImage = path.relative(realThemeDir, imagePath);
  if (!isContainedRelativePath(relativeImage)) {
    throw new Error("Theme image must remain inside the selected theme directory");
  }
  const extension = path.extname(imagePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error(`Unsupported theme image format: ${extension || "missing"}`);
  }
  const realImagePath = await fs.realpath(imagePath);
  const realRelativeImage = path.relative(realThemeDir, realImagePath);
  if (!isContainedRelativePath(realRelativeImage)) {
    throw new Error("Theme image cannot escape through a link or junction");
  }
  const art = raw.art && typeof raw.art === "object" && !Array.isArray(raw.art) ? raw.art : {};
  const rawColors = raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors)
    ? raw.colors : null;
  const colorKeys = [
    "background", "panel", "panelAlt", "accent", "accentAlt", "secondary",
    "highlight", "text", "muted", "line",
  ];
  const colors = {
    background: normalizeThemeColor(rawColors?.background, "#071116"),
    panel: normalizeThemeColor(rawColors?.panel, "#0b1a20"),
    panelAlt: normalizeThemeColor(rawColors?.panelAlt, "#10272c"),
    accent: normalizeThemeColor(rawColors?.accent, "#7cff46"),
    accentAlt: normalizeThemeColor(rawColors?.accentAlt, "#b8ff3d"),
    secondary: normalizeThemeColor(rawColors?.secondary, "#36d7e8"),
    highlight: normalizeThemeColor(rawColors?.highlight, "#642a8c"),
    text: normalizeThemeColor(rawColors?.text, "#e9fff1"),
    muted: normalizeThemeColor(rawColors?.muted, "#9ebdb3"),
    line: normalizeThemeColor(rawColors?.line, "rgba(124, 255, 70, .28)"),
  };
  const theme = {
    schemaVersion: 1,
    id: normalizeThemeText(raw.id, "custom", 80, "id", themePath),
    name: normalizeThemeText(raw.name, "JBY Liquid Glass", 80, "name", themePath),
    brandSubtitle: normalizeThemeText(raw.brandSubtitle, "JBY LIQUID GLASS", 120, "brandSubtitle", themePath),
    tagline: normalizeThemeText(raw.tagline, "Make something wonderful.", 120, "tagline", themePath),
    projectPrefix: normalizeThemeText(raw.projectPrefix, "选择项目 · ", 120, "projectPrefix", themePath),
    projectLabel: normalizeThemeText(raw.projectLabel, "◉  选择项目", 120, "projectLabel", themePath),
    statusText: normalizeThemeText(raw.statusText, "DREAM SKIN ONLINE", 120, "statusText", themePath),
    quote: normalizeThemeText(raw.quote, "MAKE SOMETHING WONDERFUL", 120, "quote", themePath),
    image,
    appearance: normalizedChoice(raw.appearance, "appearance", THEME_CHOICES.appearance, "auto"),
    art: {
      focusX: normalizedUnit(art.focusX, "art.focusX"),
      focusY: normalizedUnit(art.focusY, "art.focusY"),
      safeArea: normalizedChoice(art.safeArea, "art.safeArea", THEME_CHOICES.safeArea, "auto"),
      taskMode: normalizedChoice(art.taskMode, "art.taskMode", THEME_CHOICES.taskMode, "auto"),
    },
    colorMode: rawColors ? "explicit" : "auto",
    explicitColorKeys: rawColors ? colorKeys.filter((key) => Object.hasOwn(rawColors, key)) : [],
    colors,
    liquidGlass: raw.liquidGlass === true,
  };
  const hasExplicitPrefOverride = Boolean(preferenceOptions && Object.hasOwn(preferenceOptions, "preferencesPath"));
  if (hasExplicitPrefOverride) {
    const userTransparency = (await readThemeTransparency(theme.id, { preferencesPath: themePreferencesPath("win32"), ...preferenceOptions })) ?? 80;
    theme.userTransparency = userTransparency;
    theme.liveParams = normalizeLiveParams({ transparency: userTransparency }, userTransparency);
  } else {
    const liveState = await readThemeLiveParams(theme.id);
    theme.liveParams = normalizeLiveParams(liveState.params, liveState.params.transparency);
    theme.userTransparency = theme.liveParams.transparency;
  }
  const [themeStat, imageStat, safeCss] = await Promise.all([
    fs.stat(themePath),
    fs.stat(realImagePath),
    loadSafeCss(realThemeDir),
  ]);
  if (!imageStat.isFile()) throw new Error("Theme image is not a file");
  if (imageStat.size < 1) throw new Error("Theme image cannot be empty");
  if (imageStat.size > MAX_ART_BYTES) {
    throw new Error(`Theme image exceeds the ${MAX_ART_BYTES / 1024 / 1024} MB limit`);
  }
  const imageBytes = await fs.readFile(realImagePath);
  if (imageBytes.length < 1 || imageBytes.length > MAX_ART_BYTES) {
    throw new Error(`Theme image must be between 1 byte and ${MAX_ART_BYTES / 1024 / 1024} MB`);
  }
  const artMetadata = readImageMetadata(imageBytes, extension);
  if (!artMetadata) {
    throw new Error("Theme image metadata is invalid or exceeds the 16384px / 50MP safety limit");
  }
  theme.artMetadata = artMetadata;
  const fingerprint = createHash("sha256")
    .update(themeText, "utf8")
    .update(JSON.stringify({ userTransparency: theme.userTransparency, liveParams: theme.liveParams }))
    .update("\0")
    .update(imageBytes)
    .update("\0")
    .update(safeCss?.source ?? "")
    .digest("hex");
  return {
    theme,
    themeText,
    themePath,
    imagePath: realImagePath,
    imageBytes,
    safeCss: safeCss?.source ?? "",
    safeCssRuntime: safeCss?.runtimeSource ?? "",
    safeCssPath: safeCss?.path ?? null,
    safeCssStatus: safeCss ? "validated" : "none",
    fingerprint,
    sourceStamp: `${themeStat.size}:${themeStat.mtimeMs}:${imageStat.size}:${imageStat.mtimeMs}:` +
      (safeCss ? `${safeCss.stat.size}:${safeCss.stat.mtimeMs}` : "none"),
  };
}

export async function loadPayload(themeDir = path.join(root, "assets"), candidateTheme = null) {
  const loadedTheme = candidateTheme ?? await loadTheme(themeDir);
  const themeText = loadedTheme.themeText ?? await fs.readFile(loadedTheme.themePath, "utf8");
  const [css, template] = await Promise.all([
    fs.readFile(path.join(root, "assets", "dream-skin.css"), "utf8"),
    fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
  ]);
  const combinedCss = loadedTheme.safeCssRuntime
    ? `${css}\n${loadedTheme.safeCssRuntime}\n` : css;
  const extension = path.extname(loadedTheme.imagePath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
    : extension === ".webp" ? "image/webp" : "image/png";
  const artDataUrl = `data:${mime};base64,${loadedTheme.imageBytes.toString("base64")}`;
  const styleRevision = createHash("sha256").update(combinedCss).digest("hex").slice(0, 20);
  loadedTheme.theme.artKey = createHash("sha256")
    .update(loadedTheme.imageBytes).digest("hex").slice(0, 20);
  const revision = createHash("sha256")
    .update(SKIN_VERSION)
    .update(combinedCss)
    .update(template)
    .update(JSON.stringify(loadedTheme.theme))
    .digest("hex")
    .slice(0, 20);
  // Every replacement uses a function so String.prototype.replace never
  // interprets $$, $&, $` or $' inside the substituted JSON. Theme text is
  // user-controlled (theme.json legitimately allows "$"), and a literal-string
  // replacement would splice the template source back into the payload -- a
  // stray "$`" produced a SyntaxError, while "$&"/"$$" silently corrupted the
  // theme name.
  const payload = template
    .replace("__DREAM_SKIN_CSS_JSON__", () => JSON.stringify(combinedCss))
    .replace("__DREAM_SKIN_ART_JSON__", () => JSON.stringify(artDataUrl))
    .replace("__DREAM_SKIN_THEME_JSON__", () => JSON.stringify(loadedTheme.theme))
    .replace("__DREAM_SKIN_VERSION_JSON__", () => JSON.stringify(SKIN_VERSION))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", () => JSON.stringify(styleRevision))
    .replace("__DREAM_SKIN_PAYLOAD_REVISION_JSON__", () => JSON.stringify(revision));
  // Defence in depth for every caller, not just --check-payload: a template
  // splice leaves an unreplaced placeholder token behind and usually breaks the
  // syntax outright, so refuse to hand a corrupted script to the renderer.
  if (/__DREAM_SKIN_[A-Z0-9_]+_JSON__/.test(payload)) {
    throw new Error("Payload placeholders were not fully replaced");
  }
  try {
    // Compile-only: this parses the payload and discards the result. It never
    // runs the renderer script here.
    new Function(payload);
  } catch (error) {
    throw new Error(`Payload failed to parse as JavaScript: ${error.message}`);
  }
  const { imageBytes: _imageBytes, ...themeState } = loadedTheme;
  return {
    ...themeState,
    payload,
    revision,
    cachedCombinedCss: combinedCss,
    cachedThemeText: themeText,
    cachedTrailingFpBytes: Buffer.concat([
      Buffer.from("\0"),
      loadedTheme.imageBytes,
      Buffer.from("\0"),
      Buffer.from(loadedTheme.safeCss || "", "utf8"),
    ]),
    cachedTemplate: template,
    cachedArtDataUrl: artDataUrl,
    cachedStyleRevision: styleRevision,
  };
}

function rebuildPayloadFast(currentPayload, nextLiveParams) {
  if (!currentPayload?.cachedTemplate || !currentPayload?.cachedCombinedCss || !currentPayload?.cachedArtDataUrl || !currentPayload?.cachedThemeText || !currentPayload?.cachedTrailingFpBytes) {
    return null;
  }
  const nextTheme = {
    ...currentPayload.theme,
    userTransparency: nextLiveParams.transparency,
    liveParams: nextLiveParams,
  };
  const revision = createHash("sha256")
    .update(SKIN_VERSION)
    .update(currentPayload.cachedCombinedCss)
    .update(currentPayload.cachedTemplate)
    .update(JSON.stringify(nextTheme))
    .digest("hex")
    .slice(0, 20);
  const payload = currentPayload.cachedTemplate
    .replace("__DREAM_SKIN_CSS_JSON__", () => JSON.stringify(currentPayload.cachedCombinedCss))
    .replace("__DREAM_SKIN_ART_JSON__", () => JSON.stringify(currentPayload.cachedArtDataUrl))
    .replace("__DREAM_SKIN_THEME_JSON__", () => JSON.stringify(nextTheme))
    .replace("__DREAM_SKIN_VERSION_JSON__", () => JSON.stringify(SKIN_VERSION))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", () => JSON.stringify(currentPayload.cachedStyleRevision))
    .replace("__DREAM_SKIN_PAYLOAD_REVISION_JSON__", () => JSON.stringify(revision));
  const fingerprint = createHash("sha256")
    .update(currentPayload.cachedThemeText, "utf8")
    .update(JSON.stringify({ userTransparency: nextTheme.userTransparency, liveParams: nextLiveParams }))
    .update(currentPayload.cachedTrailingFpBytes)
    .digest("hex");
  return {
    ...currentPayload,
    theme: nextTheme,
    fingerprint,
    payload,
    revision,
  };
}

async function fileExists(filePath) {
  if (!filePath) return false;
  try {
    return (await fs.stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readThemeSourceStamp(loadedTheme) {
  const [themeStat, imageStat, cssStat] = await Promise.all([
    fs.stat(loadedTheme.themePath),
    fs.stat(loadedTheme.imagePath),
    fs.stat(path.join(path.dirname(loadedTheme.themePath), "theme.css")).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    }),
  ]);
  return `${themeStat.size}:${themeStat.mtimeMs}:${imageStat.size}:${imageStat.mtimeMs}:` +
    (cssStat ? `${cssStat.size}:${cssStat.mtimeMs}` : "none");
}

async function probeSession(session) {
  return session.evaluate(`(() => {
    const initialRoute = new URLSearchParams(String(location.search || ''))
      .get('initialRoute') || '';
    const pathname = String(location.pathname || '');
    const excludedPetSurface = location.protocol === 'app:' && (
      pathname.endsWith('/avatar-overlay-composition-surface.html') ||
      initialRoute === '/avatar-overlay' || initialRoute.startsWith('/avatar-overlay/')
    );
    const genericCodexSurface = () => {
      if (location.protocol !== 'app:') return false;
      const main = document.querySelector('main, [role="main"]');
      const input = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
      const branded = Boolean(document.querySelector(
        ${stableTestidLiteral("app-shell-header-context-menu-surface")},
      ));
      return Boolean(main && input && branded);
    };
    const markers = {
      shell: Boolean(document.querySelector(${selectorLiteral("shell-main")})),
      sidebar: Boolean(document.querySelector(${selectorLiteral("left-panel")})),
      composer: Boolean(document.querySelector(${selectorLiteral("composer-chrome")})),
      main: Boolean(document.querySelector(${selectorLiteral("home-route")})),
      generic: genericCodexSurface(),
    };
    const settings = Boolean(document.querySelector(${selectorLiteral("settings-panel")})) ||
      Boolean(document.querySelector(${selectorLiteral("appearance-radio")})) ||
      Boolean(document.querySelector(${stableTestidLiteral("theme-preview")}));
    return {
      markers,
      excludedPetSurface,
      codex: !excludedPetSurface && location.protocol === 'app:' &&
        ((markers.shell && markers.sidebar) || settings || markers.main || markers.generic),
    };
  })()`);
}

async function waitForCodexProbe(session, timeoutMs = 1800) {
  const deadline = Date.now() + timeoutMs;
  let probe = null;
  while (Date.now() < deadline) {
    try {
      probe = await probeSession(session);
      if (probe?.codex) return probe;
    } catch {
      // The renderer may be between documents while the early payload waits.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return probe;
}

async function connectTarget(target, port) {
  return new CdpSession(target, port).open();
}

function unavailableNativeWindow(error) {
  const message = String(error?.message ?? "");
  const cdpCode = Number(error?.cdpCode);
  const withoutCode = message.replace(/\s*\(-?\d+\)\s*$/, "").trim();
  const domainUnsupported = cdpCode === -32601
    || /\(-32601\)\s*$/.test(message)
    || /^method(?: ['"]Browser\.getWindowForTarget['"])? not found$/i.test(withoutCode)
    || /^['"]?Browser\.getWindowForTarget['"]? (?:wasn't|was not) found$/i.test(withoutCode);
  // Codex 26.721.x (Chrome/150) answers -32000 "Browser window not found" for
  // the app's real, focused, on-screen window -- verified live via CDP: the
  // error is identical before and after actually activating the window, while
  // documentVisibility correctly flips hidden -> visible. The domain exists but
  // this build never resolves a window for our target, so -32000 is exactly as
  // uninformative here as -32601 elsewhere. Treat both the same way and lean on
  // documentVisible, which stays a hard requirement in windowPass below, as the
  // real visibility signal. Matches macOS classifyNativeWindowError. See #256.
  const windowNotFound = cdpCode === -32000
    || /\(-32000\)\s*$/.test(message)
    || /^browser window not found$/i.test(withoutCode)
    || /^no window with given target found$/i.test(withoutCode);
  return {
    pass: false,
    bound: false,
    unsupported: domainUnsupported || windowNotFound,
    reason: domainUnsupported ? "browser-window-api-unavailable"
      : windowNotFound ? "browser-window-not-found"
      : "target-window-unavailable",
  };
}

export async function inspectTargetWindow(session, targetId) {
  if (typeof targetId !== "string" || !BROWSER_ID_PATTERN.test(targetId)) {
    return { pass: false, bound: false, reason: "invalid-target-id" };
  }

  let binding;
  try {
    binding = await session.send("Browser.getWindowForTarget", { targetId });
  } catch (error) {
    return unavailableNativeWindow(error);
  }
  if (!Number.isInteger(binding?.windowId) || binding.windowId <= 0) {
    return { pass: false, bound: false, reason: "invalid-window-binding" };
  }

  let latest;
  try {
    latest = await session.send("Browser.getWindowBounds", { windowId: binding.windowId });
  } catch (error) {
    return unavailableNativeWindow(error);
  }
  const bounds = { ...(binding.bounds ?? {}), ...(latest?.bounds ?? {}) };
  const state = typeof bounds.windowState === "string" ? bounds.windowState : null;
  const width = Number.isFinite(bounds.width) ? Number(bounds.width) : null;
  const height = Number.isFinite(bounds.height) ? Number(bounds.height) : null;
  const statePass = VISIBLE_WINDOW_STATES.has(state);
  const boundsPass = width !== null && height !== null &&
    width >= MIN_RENDERER_VIEWPORT_WIDTH && height >= MIN_RENDERER_VIEWPORT_HEIGHT;
  return {
    pass: statePass && boundsPass,
    bound: true,
    windowId: binding.windowId,
    state,
    width,
    height,
    reason: !statePass ? "window-not-visible" : !boundsPass ? "window-bounds-too-small" : null,
  };
}

async function connectCodexTargets(port, timeoutMs, expectedBrowserId) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await listAppTargets(port, expectedBrowserId);
      const connected = [];
      for (const target of targets) {
        let session;
        try {
          session = await connectTarget(target, port);
          const probe = await probeSession(session);
          if (probe?.codex) connected.push({ target, session, probe });
          else {
            if (probe?.excludedPetSurface && !await cleanupExcludedSurface(session)) {
              throw new Error("Excluded Pet surface cleanup did not verify");
            }
            session.close();
          }
        } catch (error) {
          session?.close();
          lastError = error;
        }
      }
      if (connected.length) return connected;
      lastError = new Error("No page matched the expected Codex shell markers");
    } catch (error) {
      if (error instanceof CdpIdentityMismatchError) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No verified Codex renderer on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

async function applyToSession(session, payload) {
  return session.evaluate(payload);
}

export function earlyPayloadFor(payload, revision) {
  return `(() => {
    const generationKey = "__CODEX_DREAM_SKIN_EARLY_GENERATION__";
    const appliedKey = "__CODEX_DREAM_SKIN_EARLY_APPLIED__";
    const generation = ${JSON.stringify(revision)};
    window[generationKey] = generation;
    let bootstrapTimer = null;
    let timeout = null;
    const stop = () => {
      if (bootstrapTimer) clearInterval(bootstrapTimer);
      bootstrapTimer = null;
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };
    const hasCodexSurface = () => {
      if (location.protocol !== "app:") return false;
      const shell = document.querySelector(${selectorLiteral("shell-main")});
      const sidebar = document.querySelector(${selectorLiteral("left-panel")});
      const main = document.querySelector(${selectorLiteral("home-route")});
      const settings = document.querySelector(${selectorLiteral("settings-panel")}) ||
        document.querySelector(${selectorLiteral("appearance-radio")}) ||
        document.querySelector(${stableTestidLiteral("theme-preview")});
      const genericMain = document.querySelector('main, [role="main"]');
      const genericInput = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
      const branded = Boolean(document.querySelector(
        ${stableTestidLiteral("app-shell-header-context-menu-surface")},
      ));
      return Boolean((shell && sidebar) || settings || main ||
        (genericMain && genericInput && branded));
    };
    const install = () => {
      if (window[generationKey] !== generation) { stop(); return true; }
      const root = document.documentElement;
      // The shared renderer can install against documentElement before body is
      // committed; requiring body here would create a visible unskinned first
      // frame on cold navigation.
      if (!root || !hasCodexSurface()) return false;
      stop();
      ${payload};
      window[appliedKey] = generation;
      return true;
    };
    if (install()) return;
    document.addEventListener?.("DOMContentLoaded", install, { once: true });
    bootstrapTimer = setInterval(install, 250);
    timeout = setTimeout(stop, 10000);
  })()`;
}

async function registerEarlyPayload(session, payload, revision) {
  const result = await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: earlyPayloadFor(payload, revision),
  });
  return result.identifier ?? null;
}

async function removeEarlyPayload(session, identifier) {
  if (!identifier || session.closed) return;
  await session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
}


function nextOperationToken() {
  operationSequence += 1;
  return `${process.pid}:${Date.now()}:${operationSequence}`;
}

function operationKindMessage(kind) {
  if (kind === "pause") return "正在暂停皮肤…";
  if (kind === "switch") return "正在切换主题…";
  return "正在应用皮肤…";
}

function operationUiExpression(action, token, state = "loading", message = "") {
  const config = { action, token, state, message };
  return `(() => {
    const config = ${JSON.stringify(config)};
    const hostId = ${JSON.stringify(OPERATION_UI_HOST_ID)};
    const registryKey = ${JSON.stringify(OPERATION_UI_REGISTRY_KEY)};
    const css = ${JSON.stringify(OPERATION_UI_CSS)};
    const revealDelayMs = 16;
    const minimumLoadingMs = 700;
    const stateTtl = (value) => value === "loading" ? 180000
      : value === "success" ? 1800 : value === "cancelled" ? 2400 : 6000;
    const issuedAt = (value) => Number(String(value).split(":")[1]) || 0;
    const positionInMainArea = (host) => {
      const main = document.querySelector(${selectorLiteral("shell-main")}) ||
        document.querySelector("main") ||
        document.querySelector('[role="main"]') || document.documentElement;
      const rect = main.getBoundingClientRect();
      const top = Math.max(0, rect.top);
      const left = Math.max(0, rect.left);
      const width = Math.max(1, Math.min(innerWidth - left, rect.width || innerWidth));
      const height = Math.max(1, Math.min(innerHeight - top, rect.height || innerHeight));
      host.style.setProperty("--dream-skin-operation-top", String(top) + "px");
      host.style.setProperty("--dream-skin-operation-left", String(left) + "px");
      host.style.setProperty("--dream-skin-operation-width", String(width) + "px");
      host.style.setProperty("--dream-skin-operation-height", String(height) + "px");
    };
    const clearTimer = (timer) => { if (timer) clearTimeout(timer); };
    const removeHost = (expectedToken, force = false) => {
      const host = document.getElementById(hostId);
      const registry = window[registryKey];
      if (!force && host?.dataset.operationToken !== expectedToken) return false;
      if (!force && registry?.token && registry.token !== expectedToken) return false;
      clearTimer(registry?.showTimer);
      clearTimer(registry?.expiryTimer);
      clearTimer(registry?.terminalTimer);
      host?.remove();
      if (force || registry?.token === expectedToken) delete window[registryKey];
      return true;
    };
    if (config.action === "clear") {
      removeHost("", true);
      return { visible: false, cleared: true };
    }
    if (config.action === "hide") {
      return { visible: false, removed: removeHost(config.token) };
    }
    let host = document.getElementById(hostId);
    if (config.action === "show") {
      const currentIssuedAt = Number(host?.dataset.operationIssuedAt || 0);
      if (host?.dataset.operationToken !== config.token && currentIssuedAt > issuedAt(config.token)) {
        return { visible: false, stale: true };
      }
      removeHost("", true);
      host = document.createElement("div");
      host.id = hostId;
      host.dataset.operationToken = config.token;
      host.dataset.operationIssuedAt = String(issuedAt(config.token));
      host.dataset.state = config.state;
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      const rgb = getComputedStyle(document.body || document.documentElement).backgroundColor.match(/\\d+(?:\\.\\d+)?/g)?.map(Number);
      const light = rgb?.length >= 3
        ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) > 150
        : matchMedia("(prefers-color-scheme: light)").matches;
      host.dataset.tone = light ? "light" : "dark";
      positionInMainArea(host);
      const shadow = host.attachShadow({ mode: "open" });
      const styleNode = document.createElement("style");
      styleNode.textContent = css;
      const statusNode = document.createElement("div");
      statusNode.className = "status";
      const indicator = document.createElement("span");
      indicator.className = "indicator";
      indicator.setAttribute("aria-hidden", "true");
      const messageNode = document.createElement("span");
      messageNode.className = "message";
      messageNode.textContent = config.message;
      statusNode.append(indicator, messageNode);
      shadow.append(styleNode, statusNode);
      document.documentElement.append(host);
      const registry = {
        token: config.token,
        startedAt: Date.now(),
        showTimer: null,
        expiryTimer: null,
        terminalTimer: null,
      };
      registry.showTimer = setTimeout(() => {
        const current = document.getElementById(hostId);
        if (current?.dataset.operationToken === config.token) current.dataset.visible = "true";
      }, revealDelayMs);
      registry.expiryTimer = setTimeout(() => removeHost(config.token), stateTtl(config.state));
      window[registryKey] = registry;
      return { visible: true, state: config.state };
    }
    if (!host || host.dataset.operationToken !== config.token) {
      return { visible: false, stale: true };
    }
    const registry = window[registryKey];
    clearTimer(registry?.terminalTimer);
    clearTimer(registry?.expiryTimer);
    positionInMainArea(host);
    const terminal = config.state === "success" || config.state === "error" || config.state === "cancelled";
    const remainingLoadingMs = terminal && host.dataset.state === "loading" && registry?.startedAt
      ? Math.max(0, registry.startedAt + minimumLoadingMs - Date.now())
      : 0;
    if (remainingLoadingMs > 0 && registry?.token === config.token) {
      registry.terminalTimer = setTimeout(() => {
        const current = document.getElementById(hostId);
        const currentRegistry = window[registryKey];
        if (current?.dataset.operationToken !== config.token || currentRegistry?.token !== config.token) return;
        current.dataset.state = config.state;
        current.dataset.visible = "true";
        const currentMessage = current.shadowRoot?.querySelector(".message");
        if (currentMessage) currentMessage.textContent = config.message;
        clearTimer(currentRegistry.expiryTimer);
        currentRegistry.expiryTimer = setTimeout(() => removeHost(config.token), stateTtl(config.state));
      }, remainingLoadingMs);
      return { visible: true, state: "loading", deferred: true };
    }
    host.dataset.state = config.state;
    host.dataset.visible = "true";
    const messageNode = host.shadowRoot?.querySelector(".message");
    if (messageNode) messageNode.textContent = config.message;
    if (registry?.token === config.token) {
      registry.expiryTimer = setTimeout(() => removeHost(config.token), stateTtl(config.state));
    }
    return { visible: true, state: config.state };
  })()`;
}

async function updateOperationUi(session, action, token, state, message, timeoutMs = 10000) {
  if (session.closed) return false;
  const result = await session.evaluate(
    operationUiExpression(action, token, state, message),
    timeoutMs,
  );
  return Boolean(result?.visible || result?.cleared || result?.removed);
}

async function bestEffortOperationUi(session, action, token, state, message, timeoutMs = 10000) {
  try {
    return await updateOperationUi(session, action, token, state, message, timeoutMs);
  } catch (error) {
    console.error(`[dream-skin] client status unavailable: ${error.message}`);
    return false;
  }
}

async function presentOperationUi(session, token, state, message, timeoutMs = 10000) {
  const updated = await bestEffortOperationUi(
    session, "update", token, state, message, timeoutMs,
  );
  if (updated) return true;
  return bestEffortOperationUi(session, "show", token, state, message, timeoutMs);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    try { window.__dsPluginTeardown?.(); } catch {}
    document.getElementById('codex-dream-skin-plugin-host')?.remove();
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    let cleaned = false;
    try { cleaned = Boolean(state?.cleanup && state.cleanup()); } catch {}
    if (cleaned) return true;
    const root = document.documentElement;
    for (const attribute of [...(root?.attributes || [])]) {
      if (attribute.name.startsWith('data-dream-')) root.removeAttribute(attribute.name);
    }
    for (const property of [...(root?.style || [])]) {
      if (property.startsWith('--dream-') || property.startsWith('--ds-')) {
        root.style.removeProperty(property);
      }
    }
    for (const node of document.querySelectorAll('[data-ds-part]')) {
      node.removeAttribute('data-ds-part');
    }
    const sheets = window.__CODEX_DREAM_SKIN_STYLE_SHEETS__;
    if (sheets && 'adoptedStyleSheets' in document) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets]
        .filter((sheet) => !sheets.has(sheet));
    }
    delete window.__CODEX_DREAM_SKIN_STYLE_SHEETS__;
    try { if (state?.artUrl) URL.revokeObjectURL(state.artUrl); } catch {}
    document.getElementById('codex-dream-skin-style')?.remove();
    delete window.__CODEX_DREAM_SKIN_STATE__;
    return true;
  })()`);
}

async function verifyRemovedSession(session) {
  return session.evaluate(`(() => {
    const root = document.documentElement;
    const hasAttributes = [...root.attributes].some((attribute) =>
      attribute.name.startsWith('data-dream-'));
    const hasVariables = [...root.style].some((property) =>
      property.startsWith('--dream-') || property.startsWith('--ds-'));
    const hasParts = Boolean(document.querySelector('[data-ds-part]'));
    const sheets = window.__CODEX_DREAM_SKIN_STYLE_SHEETS__;
    const hasSheets = Boolean(sheets?.size && 'adoptedStyleSheets' in document &&
      [...document.adoptedStyleSheets].some((sheet) => sheets.has(sheet)));
    return !hasAttributes && !hasVariables && !hasParts && !hasSheets &&
      !document.getElementById('codex-dream-skin-style') &&
      !document.getElementById('codex-dream-skin-plugin-host') &&
      !window.__CODEX_DREAM_SKIN_STATE__;
  })()`);
}

export async function cleanupExcludedSurface(session) {
  if (!await removeFromSession(session)) return false;
  return verifyRemovedSession(session);
}

export async function verifySession(
  session,
  targetId,
  expectedThemeId = null,
  expectedRevision = null,
) {
  const nativeWindow = await inspectTargetWindow(session, targetId);
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const opacity = Number.parseFloat(style.opacity);
      const right = Number.isFinite(r.right) ? r.right : r.x + r.width;
      const bottom = Number.isFinite(r.bottom) ? r.bottom : r.y + r.height;
      let cssVisible = r.width > 0 && r.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden' && style.visibility !== 'collapse' &&
        style.contentVisibility !== 'hidden' && (!Number.isFinite(opacity) || opacity > 0);
      try {
        if (typeof node.checkVisibility === 'function') {
          cssVisible = cssVisible && node.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          });
        }
      } catch {}
      const intersectsViewport = right > 0 && bottom > 0 && r.x < innerWidth && r.y < innerHeight;
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height),
        visible: Boolean(node.isConnected !== false && cssVisible && intersectsViewport),
        withinViewport: r.x >= 0 && r.y >= 0 && right <= innerWidth && bottom <= innerHeight,
      };
    };
    const activeNodes = (selector) => [...document.querySelectorAll(selector)]
      .filter((node) => !node.closest?.('[data-app-shell-active-page="false"]'));
    // Hidden home-icon is an intentional theme rule: use ancestry for signals,
    // and the existing visibility test only for measured layout landmarks.
    const firstActive = (selector) => activeNodes(selector)[0] ?? null;
    const firstVisible = (selector) => {
      const nodes = activeNodes(selector);
      return nodes.find((node) => box(node)?.visible) ?? nodes[0] ?? null;
    };
    const homeIndicator = firstActive(${selectorLiteral("home-icon")});
    const homeSignal = homeIndicator ?? firstActive(${selectorLiteral("game-source")}) ??
      firstActive(${selectorLiteral("home-suggestions")});
    const homeRoute = homeSignal?.closest('[role="main"]') ?? null;
    // Codex 26.721.x can render the home content before home-icon. Reuse the
    // already-resolved semantic home container so a healthy home session is
    // not rejected solely because the stricter home-icon selector is late.
    const home = firstVisible(${selectorLiteral("home-route")}) ?? homeRoute;
    const suggestions = home?.querySelector(${selectorLiteral("home-suggestions")}) ?? null;
    const cardButtons = suggestions ? [...suggestions.querySelectorAll('button')] : [];
    const cards = cardButtons.map(box);
    const visibleCards = cards.filter((item) => item?.visible);
    const suggestionLabels = cardButtons.flatMap((button) => {
      const expectedColor = getComputedStyle(button).color;
      return [...button.querySelectorAll('*')]
        .filter((node) => [...node.childNodes].some((child) =>
          child.nodeType === 3 && child.textContent.trim()))
        .map((node) => ({
          ...box(node),
          text: String(node.textContent ?? "").trim().slice(0, 80),
          color: getComputedStyle(node).color,
          expectedColor,
        }));
    });
    const visibleSuggestionLabels = suggestionLabels.filter((item) => item?.visible);
    const suggestionLabelColorsMatch = visibleSuggestionLabels.every((item) =>
      item.color === item.expectedColor);
    const settingsAnchor = firstVisible(${selectorLiteral("settings-panel")}) ||
      firstVisible(${selectorLiteral("appearance-radio")}) ||
      firstVisible(${stableTestidLiteral("theme-preview")});
    const runtime = window.__CODEX_DREAM_SKIN_STATE__;
    const adopted = runtime?.styleMode === 'adopted' &&
      [...document.adoptedStyleSheets].includes(runtime.styleSheet);
    const fallback = runtime?.styleMode === 'style' &&
      document.getElementById('codex-dream-skin-style') === runtime.styleNode;
    // Codex 26.721+ moved the real home content out of home.firstElementChild's
    // descendant chain: that wrapper now only holds the (usually empty) native
    // .home-banners slot, and the actual content became its sibling instead
    // (see #244). Prefer a sibling of the banner-holding wrapper when present;
    // fall back to the pre-26.721 first-child chain (deepest visible node)
    // otherwise, so older Codex builds keep working unchanged.
    const homeChildren = home?.children ? Array.from(home.children) : [];
    const bannerHolder = homeChildren.find((el) => el.querySelector(${selectorLiteral("home-banners")}));
    const siblingCandidates = homeChildren.filter((el) => el !== bannerHolder).map(box);
    const heroChain = [];
    for (let node = home?.firstElementChild ?? null; node && heroChain.length < 3;
      node = node.firstElementChild) heroChain.push(node);
    const boxableChain = heroChain.filter((node) => typeof node?.getBoundingClientRect === "function");
    const chainCandidates = boxableChain.map(box);
    const hero = siblingCandidates.find((item) => item?.visible && item.width >= 280 && item.height >= 120)
      ?? chainCandidates.findLast((item) => item?.visible)
      ?? siblingCandidates.find((item) => item?.visible)
      ?? box(boxableChain[boxableChain.length - 1]);
    const result = {
      installed: document.documentElement.getAttribute('data-dream-skin') === 'active',
      version: runtime?.version ?? null,
      expectedVersion: ${JSON.stringify(SKIN_VERSION)},
      themeId: runtime?.themeId ?? null,
      revision: runtime?.revision ?? null,
      styleMode: runtime?.styleMode ?? null,
      stylePresent: Boolean(adopted || fallback),
      scope: runtime?.scope ?? null,
      businessClassPollution: [...document.querySelectorAll('[class]')].filter((node) =>
        [...node.classList].some((name) => /^(?:dream-|codex-dream-skin(?:-|$))/.test(name))
      ).length,
      homePresent: Boolean(home),
      suggestionsPresent: Boolean(suggestions),
      homeSurface: box(home),
      settingsAnchor: box(settingsAnchor),
      hero,
      cards,
      visibleCardCount: visibleCards.length,
      suggestionLabels,
      suggestionLabelColorsMatch,
      composer: box(firstVisible(${selectorLiteral("composer-chrome")})),
      shell: box(firstVisible(${selectorLiteral("shell-main")})),
      sidebar: box(firstVisible(${selectorLiteral("left-panel")})),
      genericMain: box(firstVisible('[data-ds-part="main"], [data-ds-part="home"]')),
      genericInput: box(firstVisible('[data-ds-part="composer"]')),
      nativeWindow: ${JSON.stringify(nativeWindow)},
      documentVisibility: document.visibilityState ?? null,
      documentHidden: document.hidden === true,
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    const homeScope = result.scope?.baseState === 'home' || result.homePresent;
    const l1ScopePass = result.scope?.level === 'L1' &&
      Array.isArray(result.scope?.missingL1) && result.scope.missingL1.length === 0;
    const genericStructurePass = l1ScopePass && Boolean(result.genericMain?.visible) &&
      Boolean(result.genericInput?.visible || (homeScope && result.homeSurface?.visible));
    const l0StructurePass = result.scope?.level === 'L0' &&
      result.scope?.baseState === 'settings' && Boolean(result.settingsAnchor?.visible);
    const structurePass = l0StructurePass || (l1ScopePass &&
      (Boolean(result.shell?.visible && result.sidebar?.visible) || genericStructurePass));
    const documentPass = result.documentVisibility === 'visible' && !result.documentHidden;
    const viewportPass = result.viewport.width >= ${MIN_RENDERER_VIEWPORT_WIDTH} &&
      result.viewport.height >= ${MIN_RENDERER_VIEWPORT_HEIGHT};
    const nativeWindowPass = result.nativeWindow?.pass === true;
    // Codex 26.721.x (Chrome/150) cannot resolve a native window for our target
    // even when that window is real, focused and on-screen (-32000), and older
    // builds omit the Browser domain outright (-32601). The injector classifies
    // both as unsupported; in that case fall back to the renderer's own
    // visibility evidence instead of failing every install. documentPass and
    // viewportPass below stay hard requirements, so a genuinely hidden or
    // collapsed window still fails closed. Mirrors the macOS
    // assessRendererVerification fallbackWindowPass. See #256.
    const fallbackWindowPass = result.nativeWindow?.unsupported === true;
    const windowPass = nativeWindowPass || fallbackWindowPass;
    const expectedThemeId = ${JSON.stringify(expectedThemeId)};
    const expectedRevision = ${JSON.stringify(expectedRevision)};
    const payloadPass = (!expectedThemeId || result.themeId === expectedThemeId) &&
      (!expectedRevision || result.revision === expectedRevision);
    result.expectedThemeId = expectedThemeId;
    result.expectedRevision = expectedRevision;
    result.readiness = {
      windowPass, documentPass, viewportPass, structurePass,
      nativeWindowPass, fallbackWindowPass,
    };
    // A visible shell can coexist with a Home composer pushed below the window.
    // Mere intersection is insufficient: the observed Windows regression left
    // only 37px of a 98px composer inside a 600px viewport. Keep this requirement
    // scoped to Home, since tool/settings pages can legitimately omit input.
    const homeComposer = result.composer ?? result.genericInput;
    result.homeComposerPass = !homeScope || Boolean(
      homeComposer?.visible && homeComposer.withinViewport
    );
    const homePass = !homeScope || (
      result.homeComposerPass &&
      result.homePresent && Boolean(result.homeSurface?.visible) &&
      ((result.hero?.visible && result.hero.width >= 280 && result.hero.height >= 120) ||
        Boolean(result.genericMain?.visible)) &&
      (!result.suggestionsPresent || result.visibleCardCount === 0 || (
        result.suggestionLabels.filter((item) => item?.visible).length >= result.visibleCardCount &&
        result.suggestionLabelColorsMatch
      ))
    );
    result.pass = result.installed && result.version === result.expectedVersion &&
      result.stylePresent && result.businessClassPollution === 0 && !result.documentOverflow.x &&
      windowPass && documentPass && viewportPass && structurePass &&
      payloadPass && homePass;
    return result;
  })()`);
}

async function waitForVerifiedSession(
  session,
  targetId,
  timeoutMs,
  expectedThemeId = null,
  expectedRevision = null,
) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  let lastError;
  while (Date.now() < deadline) {
    try {
      lastResult = await verifySession(session, targetId, expectedThemeId, expectedRevision);
      lastError = null;
      if (lastResult.pass) return lastResult;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!lastResult && lastError) throw lastError;
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function runBeginOperation(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs, options.browserId);
  const operationToken = options.operationToken ?? nextOperationToken();
  let shown = false;
  try {
    const results = await Promise.all(connected.map(({ session }) => presentOperationUi(
      session,
      operationToken,
      "loading",
      operationKindMessage(options.operationKind),
      Math.max(250, Math.floor(options.timeoutMs / 2)),
    )));
    shown = results.some(Boolean);
  } finally {
    for (const { session } of connected) session.close();
  }
  if (!shown) throw new Error("Could not show operation progress in the verified Codex renderer");
  process.stdout.write(`${operationToken}\n`);
}

async function runFinishOperation(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs, options.browserId);
  let shown = false;
  try {
    const results = await Promise.all(connected.map(({ session }) => presentOperationUi(
      session,
      options.operationToken,
      options.operationUiState,
      options.operationMessage,
      Math.max(250, Math.floor(options.timeoutMs / 2)),
    )));
    shown = results.some(Boolean);
  } finally {
    for (const { session } of connected) session.close();
  }
  if (!shown) throw new Error("Could not show the completed operation state in the verified Codex renderer");
}

async function runOneShot(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs, options.browserId);
  const operationToken = options.mode === "once" || options.mode === "remove"
    ? options.operationToken ?? nextOperationToken()
    : null;
  if (operationToken) {
    const message = options.mode === "remove" ? "正在暂停皮肤…" : "正在准备皮肤…";
    const action = options.operationToken ? presentOperationUi : (session, token, state, text) =>
      bestEffortOperationUi(session, "show", token, state, text);
    await Promise.all(connected.map(({ session }) => action(
      session, operationToken, "loading", message,
    )));
  }
  let loadedPayload = null;
  try {
    loadedPayload = (options.mode === "once" || options.mode === "verify" || options.reload)
      ? await loadPayload(options.themeDir) : null;
  } catch (error) {
    if (operationToken) {
      await Promise.all(connected.map(({ session }) => presentOperationUi(
        session, operationToken, "error", "皮肤准备失败",
      )));
    }
    for (const { session } of connected) session.close();
    throw error;
  }
  const payload = loadedPayload?.payload ?? null;
  const results = [];
  let screenshotCaptured = false;
  try {
    for (const { target, session, probe } of connected) {
      try {
        if (options.mode === "remove") await removeFromSession(session);
        else if (options.mode === "once") {
          if (operationToken) {
            await bestEffortOperationUi(
              session, "update", operationToken, "loading",
              `正在应用「${loadedPayload.theme.name}」…`,
            );
          }
          await applyToSession(session, payload);
          await new Promise((resolve) => setTimeout(resolve, 850));
        }
        if (options.reload) {
          await session.send("Page.reload", { ignoreCache: true });
          await new Promise((resolve) => setTimeout(resolve, 1600));
          if (options.mode !== "remove") {
            if (operationToken) {
              await presentOperationUi(
                session, operationToken, "loading",
                `正在应用「${loadedPayload.theme.name}」…`,
              );
            }
            await applyToSession(session, payload);
          }
        }
        if (operationToken) {
          await presentOperationUi(
            session,
            operationToken,
            "loading",
            options.mode === "remove" ? "正在确认皮肤已暂停…" : "正在检查显示效果…",
          );
        }
        const verified = options.mode === "remove"
          ? await verifyRemovedSession(session)
          : (options.reload || options.mode === "once" || options.mode === "verify")
            ? await waitForVerifiedSession(
              session,
              target.id,
              options.timeoutMs,
              loadedPayload?.theme.id ?? null,
              loadedPayload?.revision ?? null,
            )
            : await verifySession(session, target.id);
        results.push({ targetId: target.id, markers: probe.markers, result: verified });
        if (operationToken) {
          const passed = options.mode === "remove" ? verified === true : verified?.pass;
          await presentOperationUi(
            session,
            operationToken,
            passed ? "success" : "error",
            passed
              ? options.mode === "remove" ? "皮肤已暂停" : `已应用「${loadedPayload.theme.name}」`
              : options.mode === "remove" ? "暂停校验失败" : "显示校验失败",
          );
        }
        if (options.screenshot && !screenshotCaptured) {
          if (operationToken) {
            await bestEffortOperationUi(session, "hide", operationToken, "loading", "");
          }
          await capture(session, options.screenshot);
          screenshotCaptured = true;
        }
      } catch (error) {
        if (operationToken) {
          await presentOperationUi(
            session,
            operationToken,
            "error",
            options.mode === "remove" ? "暂停失败，请重试" : "应用失败，请重试",
          );
        }
        results.push({ targetId: target.id, markers: probe?.markers, error: error.message });
      } finally {
        session.close();
      }
    }
  } finally {
    for (const { session } of connected) session.close();
  }
  console.log(JSON.stringify({ mode: options.mode, port: options.port, targets: results }, null, 2));
  const failed = results.length === 0 || results.some((item) =>
    item.error || (options.mode === "remove" ? item.result !== true : !item.result?.pass));
  if (failed) process.exitCode = 2;
}

const VALID_THEME_FOLDER = /^[a-z0-9][a-z0-9._-]{0,80}$/i;
const VALID_THUMB_KEY = /^[a-f0-9]{16,64}$/;
const MAX_THUMB_CACHE_BYTES = 96 * 1024;

function isDirSyncError(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}

async function readOptionalFileStamp(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() ? `${stat.size}:${stat.mtimeMs}` : "none";
  } catch (error) {
    if (error?.code === "ENOENT") return "none";
    return "err";
  }
}

function buildThemeThumbKey(folder, imageName, imageStat) {
  return createHash("sha256")
    .update(`${folder}\0${imageName}\0${imageStat.size}\0${Math.round(imageStat.mtimeMs)}`)
    .digest("hex")
    .slice(0, 24);
}

async function readCachedThumbDataUrl(thumbCacheDir, thumbKey) {
  if (!VALID_THUMB_KEY.test(String(thumbKey || ""))) return null;
  const thumbPath = path.join(thumbCacheDir, `${thumbKey}.jpg`);
  try {
    const stat = await fs.stat(thumbPath);
    if (!stat.isFile() || stat.size < 64 || stat.size > MAX_THUMB_CACHE_BYTES) return null;
    const bytes = await fs.readFile(thumbPath);
    if (bytes.length < 64 || bytes.length > MAX_THUMB_CACHE_BYTES) return null;
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

async function resolveThemeImageEntry(realThemesDir, folder) {
  if (!VALID_THEME_FOLDER.test(String(folder || ""))) {
    throw new Error("Invalid theme folder identifier");
  }
  const folderPath = path.join(realThemesDir, folder);
  const realFolder = await fs.realpath(folderPath);
  const rel = path.relative(realThemesDir, realFolder);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Theme folder escapes managed themes directory");
  }
  const raw = JSON.parse(await fs.readFile(path.join(realFolder, "theme.json"), "utf8"));
  if (!raw || raw.schemaVersion !== 1 || typeof raw.image !== "string" || !raw.image || path.isAbsolute(raw.image)) {
    throw new Error("Invalid theme manifest");
  }
  const imagePath = path.resolve(realFolder, raw.image);
  const relImg = path.relative(realFolder, imagePath);
  if (!isContainedRelativePath(relImg)) throw new Error("Invalid theme image path");
  const realImagePath = await fs.realpath(imagePath);
  const realRelImg = path.relative(realFolder, realImagePath);
  if (!isContainedRelativePath(realRelImg)) throw new Error("Theme image escapes directory");
  const ext = path.extname(realImagePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) throw new Error("Unsupported theme image format");
  const imageStat = await fs.stat(realImagePath);
  if (!imageStat.isFile() || imageStat.size < 1 || imageStat.size > MAX_ART_BYTES) {
    throw new Error("Theme image size out of bounds");
  }
  return { raw, realFolder, realImagePath, ext, imageStat, thumbKey: buildThemeThumbKey(folder, raw.image, imageStat) };
}

async function listInstalledThemes(stateRoot) {
  const themesDir = path.join(stateRoot, "themes");
  const thumbCacheDir = path.join(stateRoot, "thumb-cache");
  let entries = [];
  try {
    entries = await fs.readdir(themesDir, { withFileTypes: true });
  } catch (error) {
    if (isDirSyncError(error)) return [];
    throw error;
  }
  const realThemesDir = await fs.realpath(themesDir).catch(() => path.resolve(themesDir));
  const list = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !VALID_THEME_FOLDER.test(entry.name)) continue;
    try {
      const { raw, thumbKey } = await resolveThemeImageEntry(realThemesDir, entry.name);
      const colors = raw.colors && typeof raw.colors === "object" ? raw.colors : {};
      const id = String(raw.id || entry.name);
      const thumb = await readCachedThumbDataUrl(thumbCacheDir, thumbKey);
      list.push({
        folder: entry.name,
        id,
        name: String(raw.name || entry.name),
        brandSubtitle: String(raw.brandSubtitle || ""),
        appearance: ["light", "dark", "auto"].includes(raw.appearance) ? raw.appearance : "auto",
        isHarmony: id === "harmony-liquid-glass-lunar",
        isLiquidGlass: id.endsWith("-liquid-glass") || id === "harmony-liquid-glass-lunar" || raw.liquidGlass === true,
        focusX: typeof raw.art?.focusX === "number" ? raw.art.focusX : 0.5,
        focusY: typeof raw.art?.focusY === "number" ? raw.art.focusY : 0.45,
        thumbKey,
        thumb,
        colors: {
          background: String(colors.background || ""),
          panel: String(colors.panel || ""),
          accent: String(colors.accent || "#5b7cfa"),
          accentAlt: String(colors.accentAlt || colors.accent || "#88a4ff"),
          text: String(colors.text || ""),
        },
      });
    } catch {}
  }
  const rank = (item) => (item.isHarmony ? 0 : item.isLiquidGlass ? 1 : item.appearance === "dark" ? 2 : 3);
  list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "zh-Hans-CN"));
  return list;
}

async function copyThemeDirectoryFlat(sourceDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await fs.copyFile(path.join(sourceDir, entry.name), path.join(destDir, entry.name));
  }
}

async function retryFsOp(fn, attempts = 4, delayMs = 45) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastErr = error;
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function swapActiveThemeFromFolder(stateRoot, targetThemeDir, folderId, pauseFile) {
  if (!VALID_THEME_FOLDER.test(String(folderId || ""))) {
    throw new Error("Invalid theme folder identifier");
  }
  const themesDir = await fs.realpath(path.join(stateRoot, "themes"));
  const candidateDir = await fs.realpath(path.join(themesDir, folderId));
  const rel = path.relative(themesDir, candidateDir);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Theme folder escapes managed themes directory");
  }
  // Validate integrity & Safe CSS before swapping anything
  await loadTheme(candidateDir);

  const activeParent = path.dirname(targetThemeDir);
  await fs.mkdir(activeParent, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const stagingDir = `${targetThemeDir}.staging-${token}`;
  const backupDir = `${targetThemeDir}.backup-${token}`;
  await copyThemeDirectoryFlat(candidateDir, stagingDir);
  let movedOld = false;
  try {
    try {
      await fs.access(targetThemeDir);
      await retryFsOp(() => fs.rename(targetThemeDir, backupDir));
      movedOld = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await retryFsOp(() => fs.rename(stagingDir, targetThemeDir));
    if (movedOld) {
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    if (movedOld) {
      await fs.rm(targetThemeDir, { recursive: true, force: true }).catch(() => {});
      await retryFsOp(() => fs.rename(backupDir, targetThemeDir)).catch(() => {});
    }
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  if (pauseFile) {
    await fs.unlink(pauseFile).catch((err) => {
      if (err?.code !== "ENOENT") throw err;
    });
  }
}

async function runWatch(options) {
  const identityAnchor = await connectBrowserIdentityAnchor(options.port, options.browserId);
  const stateRoot = dreamSkinStateRoot("win32");
  const sessions = new Map();
  const earlyScripts = new Map();
  const fallbackTargets = new Map();
  const fallbackListeners = new Set();
  const targetFailures = new Map();
  let stopping = false;
  let listFailures = 0;
  let lastListErrorLogAt = 0;
  let lastThemeErrorLogAt = 0;
  let lastStrongThemeAuditAt = 0;
  let loadedPayload = null;
  let paused = false;
  let lastPrefStamp = "";
  let lastPluginCfgStamp = "";
  let lastPresetsStamp = "";
  let rpcQueue = Promise.resolve();
  const stop = () => { stopping = true; };
  const rejectTarget = (target, baseDelayMs, error = null) => {
    const previous = targetFailures.get(target.id) ?? { failures: 0, lastLogAt: 0 };
    const failures = previous.failures + 1;
    const delayMs = Math.min(30000, baseDelayMs * (2 ** Math.min(failures - 1, 4)));
    const now = Date.now();
    if (error && (failures === 1 || now - previous.lastLogAt >= 30000)) {
      console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}; retrying in ${delayMs}ms`);
      previous.lastLogAt = now;
    }
    targetFailures.set(target.id, { failures, lastLogAt: previous.lastLogAt, until: now + delayMs });
  };
  const attachLoadFallback = (id, target, session) => {
    if (fallbackListeners.has(id)) return;
    fallbackListeners.add(id);
    let lastReinjectErrorLogAt = 0;
    session.on("Page.loadEventFired", () => {
      if (!fallbackTargets.get(id)) return;
      setTimeout(() => {
        const operation = paused ? removeFromSession(session) : applyToSession(session, loadedPayload.payload);
        operation.catch((error) => {
          if (Date.now() - lastReinjectErrorLogAt >= 30000) {
            console.error(`[dream-skin] reinject failed for ${target.id}: ${error.message}`);
            lastReinjectErrorLogAt = Date.now();
          }
        });
      }, 250);
    });
  };
  const buildStudioState = async () => {
    const [themes, guardConfig, pluginConfig, opticalPresets] = await Promise.all([
      listInstalledThemes(stateRoot),
      readGuardConfig(),
      readPluginConfig(),
      readOpticalPresets(),
    ]);
    const currentId = loadedPayload?.theme?.id || "custom";
    return {
      ok: true,
      paused,
      activeThemeId: currentId,
      activeThemeName: loadedPayload?.theme?.name || currentId,
      activeAppearance: loadedPayload?.theme?.appearance || "auto",
      themes,
      liveParams: loadedPayload?.theme?.liveParams || normalizeLiveParams({}, loadedPayload?.theme?.userTransparency ?? 80),
      ui: pluginConfig.ui,
      guardConfig,
      opticalPresets,
    };
  };
  const broadcastSync = async (excludeSession = null) => {
    const syncState = await buildStudioState();
    const expr = `window.__dsPluginOnSync && window.__dsPluginOnSync(${JSON.stringify(syncState)})`;
    for (const [, session] of sessions) {
      if (session === excludeSession || session.closed) continue;
      session.evaluate(expr).catch(() => {});
    }
    return syncState;
  };
  const applyOpticsToSession = async (session, payload) => {
    const args = [payload.cachedStyleRevision, payload.theme.artKey,
      payload.theme.id, payload.revision, payload.theme.liveParams];
    return await session.evaluate(`window.__CODEX_DREAM_SKIN_STATE__?.applyOptics?.(...${JSON.stringify(args)}) === true`);
  };
  const pushPayloadToSessions = async (nextPayload, skipLiveApplyOnSession = null, { skipEarlyRefresh = false, opticsOnly = false } = {}) => {
    loadedPayload = nextPayload;
    if (skipEarlyRefresh && skipLiveApplyOnSession) {
      for (const [, session] of sessions) {
        if (session === skipLiveApplyOnSession || session.closed) continue;
        applyOpticsToSession(session, loadedPayload).catch(() => {});
      }
      return;
    }
    for (const [id, session] of sessions) {
      try {
        const applied = opticsOnly && await applyOpticsToSession(session, nextPayload);
        const previousEarlyScript = earlyScripts.get(id);
        let nextEarlyScript = null;
        try {
          nextEarlyScript = await registerEarlyPayload(
            session,
            loadedPayload.payload,
            loadedPayload.fingerprint,
          );
          if (!nextEarlyScript) throw new Error("CDP did not return an early-script identifier");
          fallbackTargets.set(id, false);
        } catch (error) {
          fallbackTargets.set(id, true);
          console.error(`[dream-skin] early theme refresh unavailable for ${id}: ${error.message}`);
          attachLoadFallback(id, { id }, session);
        }
        if (nextEarlyScript) earlyScripts.set(id, nextEarlyScript);
        else earlyScripts.delete(id);
        await removeEarlyPayload(session, previousEarlyScript);
        if (!applied && session !== skipLiveApplyOnSession) await applyToSession(session, loadedPayload.payload);
      } catch (error) {
        console.error(`[dream-skin] live theme update failed for ${id}: ${error.message}`);
        await removeEarlyPayload(session, earlyScripts.get(id));
        earlyScripts.delete(id);
        fallbackTargets.delete(id);
        fallbackListeners.delete(id);
        session.close();
        sessions.delete(id);
      }
    }
  };
  const handlePluginRpc = async (session, rawPayload) => {
    if (typeof rawPayload !== "string" || rawPayload.length > 163840) return;
    let msg;
    try { msg = JSON.parse(rawPayload); } catch { return; }
    const reqId = typeof msg?.reqId === "string" ? msg.reqId : null;
    const action = typeof msg?.action === "string" ? msg.action : "";
    const args = msg?.args && typeof msg.args === "object" ? msg.args : {};
    const reply = async (data) => {
      if (!reqId || session.closed) return;
      await session.evaluate(
        `window.__dsPluginResolveRpc && window.__dsPluginResolveRpc(${JSON.stringify(reqId)}, ${JSON.stringify(data)})`,
      ).catch(() => {});
    };
    const execute = async () => {
      try {
        if (action === "getState") {
          await reply(await buildStudioState());
          return;
        }
        if (action === "getThemeThumbSource") {
          const folder = String(args.folder || "");
          const themesDir = path.join(stateRoot, "themes");
          const realThemesDir = await fs.realpath(themesDir);
          const { realImagePath, ext, thumbKey } = await resolveThemeImageEntry(realThemesDir, folder);
          const bytes = await fs.readFile(realImagePath);
          const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
          await reply({ ok: true, folder, thumbKey, dataUrl: `data:${mime};base64,${bytes.toString("base64")}` });
          return;
        }
        if (action === "saveThemeThumb") {
          const thumbKey = String(args.thumbKey || "");
          const dataUrl = String(args.dataUrl || "");
          if (!VALID_THUMB_KEY.test(thumbKey)) throw new Error("Invalid thumbKey");
          const m = dataUrl.match(/^data:image\/(?:jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
          if (!m) throw new Error("Invalid thumb image data");
          const buf = Buffer.from(m[1], "base64");
          if (buf.length < 64 || buf.length > MAX_THUMB_CACHE_BYTES) throw new Error("Thumb size out of bounds");
          const thumbCacheDir = path.join(stateRoot, "thumb-cache");
          await fs.mkdir(thumbCacheDir, { recursive: true });
          const targetPath = path.join(thumbCacheDir, `${thumbKey}.jpg`);
          const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
          await fs.writeFile(tempPath, buf);
          await fs.rename(tempPath, targetPath);
          await reply({ ok: true, thumbKey });
          return;
        }
        if (action === "switchTheme") {
          const folderId = String(args.folder || args.themeId || "");
          await swapActiveThemeFromFolder(stateRoot, options.themeDir, folderId, options.pauseFile);
          paused = false;
          const nextPayload = await loadPayload(options.themeDir);
          lastStrongThemeAuditAt = Date.now();
          [lastPrefStamp, lastPluginCfgStamp] = await Promise.all([
            readOptionalFileStamp(themePreferencesPath("win32")),
            readOptionalFileStamp(pluginConfigPath("win32")),
          ]);
          await pushPayloadToSessions(nextPayload);
          const syncState = await broadcastSync(null);
          console.log(`[dream-skin] hot-switched theme -> ${nextPayload.theme.id}`);
          await reply(syncState);
          return;
        }
        if (action === "setLiveParams" || action === "resetThemeParams") {
          const themeId = loadedPayload?.theme?.id || String(args.themeId || "custom");
          const currentTransparency = loadedPayload?.theme?.userTransparency ?? 80;
          const nextParams = action === "resetThemeParams"
            ? await resolveDefaultLiveParams()
            : normalizeLiveParams(args.params, currentTransparency);
          const pluginCfg = await readPluginConfig();
          const nextCfg = {
            schemaVersion: 1,
            ui: args.ui ? { ...pluginCfg.ui, ...args.ui } : pluginCfg.ui,
            themes: { ...pluginCfg.themes, [themeId]: nextParams },
          };
          await writePluginConfig(nextCfg);
          await writeThemeTransparency(themeId, nextParams.transparency);
          [lastPrefStamp, lastPluginCfgStamp] = await Promise.all([
            readOptionalFileStamp(themePreferencesPath("win32")),
            readOptionalFileStamp(pluginConfigPath("win32")),
          ]);
          const nextPayload = rebuildPayloadFast(loadedPayload, nextParams) ?? await loadPayload(options.themeDir);
          lastStrongThemeAuditAt = Date.now();
          const isDragTick = action === "setLiveParams" && args.commit === false;
          await pushPayloadToSessions(nextPayload, action === "setLiveParams" ? session : null, { skipEarlyRefresh: isDragTick, opticsOnly: true });
          const syncState = await broadcastSync(action === "setLiveParams" ? session : null);
          await reply(syncState);
          return;
        }
        if (action === "savePreset") {
          const saved = await saveOpticalPreset({
            id: args.presetId || null,
            name: args.name || "",
            params: args.params || {},
            setAsDefault: Boolean(args.setAsDefault),
          });
          lastPresetsStamp = await readOptionalFileStamp(opticalPresetsPath());
          const syncState = await broadcastSync(null);
          await reply({ ...syncState, savedPreset: saved.preset });
          return;
        }
        if (action === "setDefaultPreset") {
          if (args.presetId) {
            await setDefaultOpticalPreset(args.presetId);
          } else {
            await saveOpticalPreset({
              name: args.name || "",
              params: args.params || {},
              setAsDefault: true,
            });
          }
          lastPresetsStamp = await readOptionalFileStamp(opticalPresetsPath());
          const syncState = await broadcastSync(null);
          await reply(syncState);
          return;
        }
        if (action === "deletePreset") {
          await deleteOpticalPreset(args.presetId);
          lastPresetsStamp = await readOptionalFileStamp(opticalPresetsPath());
          const syncState = await broadcastSync(null);
          await reply(syncState);
          return;
        }
        if (action === "reapplySkin") {
          paused = false;
          if (options.pauseFile) {
            await fs.unlink(options.pauseFile).catch((err) => {
              if (err?.code !== "ENOENT") throw err;
            });
          }
          const nextPayload = await loadPayload(options.themeDir);
          lastStrongThemeAuditAt = Date.now();
          await pushPayloadToSessions(nextPayload, null);
          const syncState = await broadcastSync(null);
          await reply(syncState);
          return;
        }
        if (action === "setUiState") {
          const pluginCfg = await readPluginConfig();
          const nextCfg = {
            schemaVersion: 1,
            ui: { ...pluginCfg.ui, ...(args.ui && typeof args.ui === "object" ? args.ui : {}) },
            themes: pluginCfg.themes,
          };
          const saved = await writePluginConfig(nextCfg);
          lastPluginCfgStamp = await readOptionalFileStamp(pluginConfigPath("win32"));
          await reply({ ok: true, ui: saved.ui });
          return;
        }
        if (action === "setGuardConfig") {
          const current = await readGuardConfig();
          const next = normalizeGuardConfig({ ...current, ...(args.guardConfig || {}) });
          await writeGuardConfig(next);
          const syncState = await broadcastSync(session);
          await reply(syncState);
          return;
        }
        if (action === "openFolder") {
          const targetName = args.target === "images" ? "images" : args.target === "themes" ? "themes" : null;
          if (!targetName) throw new Error("Unsupported folder target");
          const folderPath = path.join(stateRoot, targetName);
          await fs.mkdir(folderPath, { recursive: true });
          const child = spawn("explorer.exe", [folderPath], { detached: true, stdio: "ignore", windowsHide: true });
          child.unref();
          await reply({ ok: true });
          return;
        }
        await reply({ ok: false, error: `Unknown action: ${action}` });
      } catch (error) {
        await reply({ ok: false, error: error?.message || "RPC failed" });
      }
    };
    rpcQueue = rpcQueue.then(execute, execute);
  };
  const attachPluginBridge = async (session) => {
    if (session.__dsBridgeAttached || session.closed) return;
    session.__dsBridgeAttached = true;
    await session.send("Runtime.addBinding", { name: "__dsPluginRpc" }).catch(() => {});
    session.on("Runtime.bindingCalled", (params) => {
      if (params?.name === "__dsPluginRpc") {
        void handlePluginRpc(session, params.payload);
      }
    });
  };
  let wakePreferenceWait;
  let preferencesDirty = false;
  let preferenceWatch;
  const markPreferencesDirty = () => {
    preferencesDirty = true;
    wakePreferenceWait?.();
  };
  const waitForNextAudit = () => new Promise((resolve) => {
    if (preferencesDirty) return resolve();
    const timer = setTimeout(() => {
      wakePreferenceWait = null;
      resolve();
    }, 700);
    wakePreferenceWait = () => {
      clearTimeout(timer);
      wakePreferenceWait = null;
      resolve();
    };
  });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    loadedPayload = await loadPayload(options.themeDir);
    lastStrongThemeAuditAt = Date.now();
    paused = await fileExists(options.pauseFile);
    [lastPrefStamp, lastPluginCfgStamp, lastPresetsStamp] = await Promise.all([
      readOptionalFileStamp(themePreferencesPath("win32")),
      readOptionalFileStamp(pluginConfigPath("win32")),
      readOptionalFileStamp(opticalPresetsPath()),
    ]);
    try {
      const filenames = new Set([themePreferencesPath("win32"), pluginConfigPath("win32"), opticalPresetsPath()].map(file => path.basename(file)));
      preferenceWatch = watchDirectory(stateRoot, (_event, filename) => {
        if (filename && filenames.has(String(filename))) markPreferencesDirty();
      });
      preferenceWatch.on("error", () => preferenceWatch?.close());
    } catch { /* periodic audit still covers filesystem events */ }
    while (!stopping) {
      preferencesDirty = false;
      if (identityAnchor.closed) {
        console.error("[dream-skin] original CDP browser identity closed; watcher is stopping instead of reconnecting");
        process.exitCode = 3;
        break;
      }
      let targets = [];
      try {
        targets = await listAppTargets(options.port);
        listFailures = 0;
      } catch (error) {
        listFailures += 1;
        const retryMs = Math.min(10000, 1000 * (2 ** Math.min(listFailures - 1, 4)));
        if (listFailures === 1 || Date.now() - lastListErrorLogAt >= 30000) {
          console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}; retrying in ${retryMs}ms`);
          lastListErrorLogAt = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        continue;
      }

      await rpcQueue;
      const nextPaused = await fileExists(options.pauseFile);
      let nextPayload = loadedPayload;
      let presetsChanged = false;
      let opticsOnly = false;
      if (!nextPaused) {
        try {
          const now = Date.now();
          let shouldAudit = !loadedPayload || now - lastStrongThemeAuditAt >= STRONG_THEME_AUDIT_MS;
          const [curPrefStamp, curPluginCfgStamp, curPresetsStamp] = await Promise.all([
            readOptionalFileStamp(themePreferencesPath("win32")),
            readOptionalFileStamp(pluginConfigPath("win32")),
            readOptionalFileStamp(opticalPresetsPath()),
          ]);
          presetsChanged = curPresetsStamp !== lastPresetsStamp;
          const preferencesChanged = curPrefStamp !== lastPrefStamp || curPluginCfgStamp !== lastPluginCfgStamp || presetsChanged;
          lastPrefStamp = curPrefStamp;
          lastPluginCfgStamp = curPluginCfgStamp;
          lastPresetsStamp = curPresetsStamp;
          const sourceChanged = !loadedPayload || await readThemeSourceStamp(loadedPayload).catch(() => "") !== loadedPayload.sourceStamp;
          if (preferencesChanged && !sourceChanged) {
            const { params } = await readThemeLiveParams(loadedPayload.theme.id);
            if (JSON.stringify(params) !== JSON.stringify(loadedPayload.theme.liveParams)) {
              const updated = rebuildPayloadFast(loadedPayload, params);
              if (updated) {
                nextPayload = updated;
                opticsOnly = true;
              } else {
                shouldAudit = true;
              }
            }
          }
          shouldAudit ||= sourceChanged;
          if (shouldAudit) {
            const candidateTheme = await loadTheme(options.themeDir);
            lastStrongThemeAuditAt = now;
            if (!loadedPayload || candidateTheme.fingerprint !== loadedPayload.fingerprint) {
              nextPayload = await loadPayload(options.themeDir, candidateTheme);
            } else {
              loadedPayload.sourceStamp = candidateTheme.sourceStamp;
            }
          }
        } catch (error) {
          if (Date.now() - lastThemeErrorLogAt >= 30000) {
            console.error(`[dream-skin] theme update rejected: ${error.message}; keeping the active theme`);
            lastThemeErrorLogAt = Date.now();
          }
        }
      }
      const pauseChanged = nextPaused !== paused;
      const payloadChanged = !nextPaused && nextPayload !== loadedPayload;
      loadedPayload = nextPayload;
      paused = nextPaused;

      if (presetsChanged && !paused && !payloadChanged && !pauseChanged) {
        await broadcastSync().catch(() => {});
      }

      if (!pauseChanged && payloadChanged && opticsOnly) {
        await pushPayloadToSessions(loadedPayload, null, { opticsOnly: true });
        if (presetsChanged) await broadcastSync().catch(() => {});
      } else if (pauseChanged || payloadChanged) {
        for (const [id, session] of sessions) {
          try {
            const previousEarlyScript = earlyScripts.get(id);
            if (paused) {
              await removeFromSession(session);
              await removeEarlyPayload(session, previousEarlyScript);
              earlyScripts.delete(id);
              fallbackTargets.delete(id);
              fallbackListeners.delete(id);
            } else {
              let nextEarlyScript = null;
              try {
                nextEarlyScript = await registerEarlyPayload(
                  session,
                  loadedPayload.payload,
                  loadedPayload.fingerprint,
                );
                if (!nextEarlyScript) throw new Error("CDP did not return an early-script identifier");
                fallbackTargets.set(id, false);
              } catch (error) {
                fallbackTargets.set(id, true);
                console.error(`[dream-skin] early theme refresh unavailable for ${id}: ${error.message}`);
                attachLoadFallback(id, { id }, session);
              }
              if (nextEarlyScript) earlyScripts.set(id, nextEarlyScript);
              else earlyScripts.delete(id);
              await removeEarlyPayload(session, previousEarlyScript);
              await applyToSession(session, loadedPayload.payload);
            }
          } catch (error) {
            console.error(`[dream-skin] live theme update failed for ${id}: ${error.message}`);
            await removeEarlyPayload(session, earlyScripts.get(id));
            earlyScripts.delete(id);
            fallbackTargets.delete(id);
            fallbackListeners.delete(id);
            session.close();
            sessions.delete(id);
          }
        }
        if (!paused) await broadcastSync().catch(() => {});
        console.log(paused ? "[dream-skin] paused" : `[dream-skin] active theme ${loadedPayload.theme.id}`);
      }

      const activeIds = new Set(targets.map((target) => target.id));
      for (const id of targetFailures.keys()) {
        if (!activeIds.has(id)) targetFailures.delete(id);
      }
      for (const [id, session] of sessions) {
        if (!activeIds.has(id) || session.closed) {
          await removeEarlyPayload(session, earlyScripts.get(id));
          earlyScripts.delete(id);
          fallbackTargets.delete(id);
          fallbackListeners.delete(id);
          session.close();
          sessions.delete(id);
          targetFailures.delete(id);
        }
      }

      for (const target of targets) {
        if (identityAnchor.closed) break;
        if (sessions.has(target.id)) continue;
        if ((targetFailures.get(target.id)?.until ?? 0) > Date.now()) continue;
        let session;
        let earlyScriptId = null;
        try {
          session = await connectTarget(target, options.port);
          if (identityAnchor.closed) throw new CdpIdentityMismatchError("Original CDP browser identity closed");
          await attachPluginBridge(session);
          let earlyInjectionFallback = false;
          if (!paused) {
            try {
              earlyScriptId = await registerEarlyPayload(
                session,
                loadedPayload.payload,
                loadedPayload.fingerprint,
              );
              if (!earlyScriptId) throw new Error("CDP did not return an early-script identifier");
              await session.evaluate(earlyPayloadFor(loadedPayload.payload, loadedPayload.fingerprint));
            } catch (error) {
              await removeEarlyPayload(session, earlyScriptId);
              earlyScriptId = null;
              earlyInjectionFallback = true;
              console.error(`[dream-skin] early injection unavailable for ${target.id}: ${error.message}`);
            }
          }
          const probe = await waitForCodexProbe(session);
          if (!probe?.codex) {
            await removeEarlyPayload(session, earlyScriptId);
            if (probe?.excludedPetSurface && !await cleanupExcludedSurface(session)) {
              throw new Error("Excluded Pet surface cleanup did not verify");
            }
            rejectTarget(target, 5000);
            session.close();
            continue;
          }
          fallbackTargets.set(target.id, earlyInjectionFallback);
          if (earlyInjectionFallback) attachLoadFallback(target.id, target, session);
          if (identityAnchor.closed) throw new CdpIdentityMismatchError("Original CDP browser identity closed");
          let earlyApplied = false;
          if (!paused && !earlyInjectionFallback) {
            earlyApplied = await session.evaluate(
              `window.__CODEX_DREAM_SKIN_EARLY_APPLIED__ === ${JSON.stringify(loadedPayload.fingerprint)}`,
            ).catch(() => false);
          }
          if (paused) await removeFromSession(session);
          else if (!earlyApplied) await applyToSession(session, loadedPayload.payload);
          sessions.set(target.id, session);
          if (earlyScriptId) earlyScripts.set(target.id, earlyScriptId);
          targetFailures.delete(target.id);
          console.log(`[dream-skin] injected target ${target.id}`);
        } catch (error) {
          await removeEarlyPayload(session, earlyScriptId);
          fallbackTargets.delete(target.id);
          fallbackListeners.delete(target.id);
          session?.close();
          if (identityAnchor.closed || error instanceof CdpIdentityMismatchError) break;
          rejectTarget(target, 2500, error);
        }
      }
      await waitForNextAudit();
    }
  } finally {
    preferenceWatch?.close();
    wakePreferenceWait?.();
    identityAnchor.close();
    for (const [id, session] of sessions) {
      await removeEarlyPayload(session, earlyScripts.get(id));
      session.close();
    }
    earlyScripts.clear();
    fallbackTargets.clear();
    fallbackListeners.clear();
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "self-test") {
  const valid = validatedDebuggerUrl({ webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/page/test` }, options.port);
  const browserId = browserIdFromVersion({
    webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/browser/test-browser`,
  }, options.port);
  const invalid = [
    "ws://example.com/devtools/page/test",
    `ws://127.0.0.1:${options.port + 1}/devtools/page/test`,
    `wss://127.0.0.1:${options.port}/devtools/page/test`,
    `ws://user@127.0.0.1:${options.port}/devtools/page/test`,
    `ws://127.0.0.1:${options.port}/unexpected/test`,
    `ws://127.0.0.1:${options.port}/devtools/page/test?query=1`,
  ];
  for (const value of invalid) {
    let rejected = false;
    try { validatedDebuggerUrl({ webSocketDebuggerUrl: value }, options.port); } catch { rejected = true; }
    if (!rejected) throw new Error(`CDP URL validation accepted an unsafe URL: ${value}`);
  }
  const invalidBrowserUrls = [
    `ws://127.0.0.1:${options.port}/devtools/page/not-a-browser`,
    `ws://127.0.0.1:${options.port}/devtools/browser/bad%20id`,
    `ws://127.0.0.1:${options.port}/devtools/browser/test?query=1`,
  ];
  for (const value of invalidBrowserUrls) {
    let rejected = false;
    try { browserIdFromVersion({ webSocketDebuggerUrl: value }, options.port); } catch { rejected = true; }
    if (!rejected) throw new Error(`Browser identity validation accepted an unsafe URL: ${value}`);
  }
  const validPageTarget = {
    id: "page-test",
    type: "page",
    url: "app://codex/",
    webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/page/page-test`,
  };
  const invalidPageTargets = [
    { ...validPageTarget, webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/browser/page-test` },
    { ...validPageTarget, id: "other-page" },
    { ...validPageTarget, id: 123 },
    { ...validPageTarget, type: "other" },
  ];
  if (!valid || browserId !== "test-browser" || !isValidCdpPageTarget(validPageTarget, options.port) ||
      invalidPageTargets.some((item) => isValidCdpPageTarget(item, options.port))) {
    throw new Error("CDP URL and target validation self-test failed");
  }
  const validMessage = parseCdpMessage('{"id":7,"result":{"ok":true}}');
  const invalidMessages = ["{not-json", "null", '"text"', "42", "true"];
  if (validMessage?.id !== 7 || validMessage.result?.ok !== true ||
      invalidMessages.some((value) => parseCdpMessage(value) !== null)) {
    throw new Error("CDP message validation self-test failed");
  }
  if (/dispatchKeyEvent|dispatchMouseEvent/.test(capture.toString())) {
    throw new Error("Screenshot capture must not dispatch renderer input events");
  }
  console.log(JSON.stringify({ pass: true, version: SKIN_VERSION, test: "loopback-cdp-validation" }));
  } else if (options.mode === "check-payload") {
    const loaded = await loadPayload(options.themeDir);
    const unresolved = /__DREAM_SKIN_[A-Z0-9_]+_JSON__/.test(loaded.payload);
    if (unresolved) {
      throw new Error("Payload placeholders were not fully replaced");
    }
    console.log(JSON.stringify({
      pass: true,
      version: SKIN_VERSION,
      payloadBytes: Buffer.byteLength(loaded.payload),
      themeId: loaded.theme.id,
      appearance: loaded.theme.appearance,
      colorMode: loaded.theme.colorMode,
      explicitColorKeys: loaded.theme.explicitColorKeys,
      hasColors: !!loaded.theme.colors && typeof loaded.theme.colors === "object",
      hasPalette: Object.hasOwn(loaded.theme, "palette"),
      art: loaded.theme.art,
      artMetadata: loaded.theme.artMetadata ?? null,
      safeCssStatus: loaded.safeCssStatus,
    }));
  } else if (options.mode === "begin-operation") await runBeginOperation(options);
  else if (options.mode === "finish-operation") await runFinishOperation(options);
  else if (options.mode === "watch") await runWatch(options);
  else await runOneShot(options);
}
