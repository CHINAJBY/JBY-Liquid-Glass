import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveDefaultLiveParams } from "./optical-presets.mjs";

const warned = new Set();
const MAX_BYTES = 131072;

export const LIQUID_ZONES = Object.freeze(["composer", "writing", "sidebar", "cards", "popover"]);

export const DEFAULT_LIVE_PARAMS = Object.freeze({
  transparency: 80,
  refractScale: 100,
  blurScale: 100,
  rimIntensity: 100,
  fontWeightBoost: 0,
  motionMode: "spring",
  particlesEnabled: true,
  zones: {},
});

function clampNum(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : fallback;
}

export function normalizeZoneOverride(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const out = {};
  if (entry.transparency !== undefined) out.transparency = clampNum(entry.transparency, 15, 100, 80);
  if (entry.refractScale !== undefined) out.refractScale = clampNum(entry.refractScale, 0, 200, 100);
  if (entry.blurScale !== undefined) out.blurScale = clampNum(entry.blurScale, 0, 200, 100);
  if (entry.rimIntensity !== undefined) out.rimIntensity = clampNum(entry.rimIntensity, 0, 200, 100);
  return Object.keys(out).length ? out : null;
}

export function normalizeLiveParams(input, transparencyFallback = 80) {
  const baseTransparency = clampNum(transparencyFallback, 0, 100, 80);
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const motionMode = ["spring", "lite", "off"].includes(src.motionMode) ? src.motionMode : "spring";
  const zones = {};
  if (src.zones && typeof src.zones === "object" && !Array.isArray(src.zones)) {
    for (const zone of LIQUID_ZONES) {
      const normalized = normalizeZoneOverride(src.zones[zone]);
      if (normalized) zones[zone] = normalized;
    }
  }
  return {
    transparency: clampNum(src.transparency, 0, 100, baseTransparency),
    refractScale: clampNum(src.refractScale, 0, 200, 100),
    blurScale: clampNum(src.blurScale, 0, 200, 100),
    rimIntensity: clampNum(src.rimIntensity, 0, 200, 100),
    fontWeightBoost: clampNum(src.fontWeightBoost, -80, 150, 0),
    motionMode,
    particlesEnabled: src.particlesEnabled !== false,
    zones,
  };
}

export function normalizePluginUiState(input) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const pillMode = src.pillMode === "pill" ? "pill" : "orb";
  const activeTab = ["themes", "tune", "auto"].includes(src.activeTab) ? src.activeTab : "themes";
  const selectedZone = src.selectedZone === "global" || LIQUID_ZONES.includes(src.selectedZone)
    ? src.selectedZone
    : "global";
  const clampFrac = (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, Number(n.toFixed(4)))) : fb;
  };
  return {
    pillMode,
    pillMinimized: pillMode === "orb",
    panelOpen: Boolean(src.panelOpen),
    activeTab,
    selectedZone,
    posX: clampFrac(src.posX, 0.96),
    posY: clampFrac(src.posY, 0.88),
  };
}

export function normalizeSharedGuardConfig(input) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const portNum = Number(src.antigravityPort);
  return {
    antigravityAutoGuardEnabled: src.antigravityAutoGuardEnabled !== false,
    autoLaunchAntigravityOnBoot: Boolean(src.autoLaunchAntigravityOnBoot),
    antigravityPort: Number.isInteger(portNum) && portNum >= 1024 && portNum <= 65535 ? portNum : 9235,
  };
}

export function codexStateRoot({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
} = {}) {
  if (platform === "win32") {
    return path.join(
      env.LOCALAPPDATA || path.join(homeDir, "AppData", "Local"),
      "JBYLiquidGlass",
    );
  }
  return path.join(homeDir, "Library", "Application Support", "JBYLiquidGlassStudio");
}

export function antigravityStateRoot(options) {
  return path.join(codexStateRoot(options), "antigravity");
}

export function sharedThemesDir(options) {
  return path.join(codexStateRoot(options), "themes");
}

export function sharedThumbCacheDir(options) {
  return path.join(codexStateRoot(options), "thumb-cache");
}

export function sharedImagesDir(options) {
  return path.join(codexStateRoot(options), "images");
}

export function themePreferencesPath(options) {
  return path.join(antigravityStateRoot(options), "theme-preferences.json");
}

export function pluginConfigPath(options) {
  return path.join(antigravityStateRoot(options), "plugin-config.json");
}

export function sharedGuardConfigPath(options) {
  return path.join(codexStateRoot(options), "guard-config.json");
}

async function readBoundedJson(filePath) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("invalid json file");
    const bytes = Buffer.allocUnsafe(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > MAX_BYTES) throw new Error("invalid json file");
    return JSON.parse(bytes.subarray(0, length).toString("utf8"));
  } finally {
    await handle?.close();
  }
}

async function writeAtomicJson(filePath, payload) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const text = `${JSON.stringify(payload, null, 2)}\r\n`;
  await fs.writeFile(tempPath, text, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function readThemeTransparency(themeId, {
  preferencesPath = themePreferencesPath(),
  warn = (message) => console.error(message),
} = {}) {
  try {
    const data = await readBoundedJson(preferencesPath);
    if (data?.schemaVersion !== 1 || !data.themes || typeof data.themes !== "object" || Array.isArray(data.themes)) {
      throw new Error("invalid preferences");
    }
    if (!Object.hasOwn(data.themes, themeId)) return 80;
    const value = data.themes[themeId]?.transparency;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error("invalid preferences");
    }
    warned.delete(preferencesPath);
    return value;
  } catch (error) {
    if (error.code !== "ENOENT" && !warned.has(preferencesPath)) {
      warned.add(preferencesPath);
      warn("[agy-dream-skin] Local Antigravity theme preferences unavailable or invalid; using defaults.");
    }
    return 80;
  }
}

export async function writeThemeTransparency(themeId, transparency, {
  preferencesPath = themePreferencesPath(),
} = {}) {
  let current = { schemaVersion: 1, themes: {} };
  try {
    const parsed = await readBoundedJson(preferencesPath);
    if (parsed?.schemaVersion === 1 && parsed.themes && typeof parsed.themes === "object" && !Array.isArray(parsed.themes)) {
      current = parsed;
    }
  } catch {}
  const nextAlpha = clampNum(transparency, 0, 100, 80);
  current.themes = { ...current.themes, [themeId]: { ...(current.themes[themeId] || {}), transparency: nextAlpha } };
  await writeAtomicJson(preferencesPath, current);
  return nextAlpha;
}

export async function readPluginConfig({
  configPath = pluginConfigPath(),
} = {}) {
  try {
    const data = await readBoundedJson(configPath);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { schemaVersion: 1, ui: normalizePluginUiState(), themes: {} };
    }
    const themes = {};
    if (data.themes && typeof data.themes === "object" && !Array.isArray(data.themes)) {
      for (const [id, entry] of Object.entries(data.themes)) {
        if (typeof id === "string" && id && entry && typeof entry === "object" && !Array.isArray(entry)) {
          themes[id] = normalizeLiveParams(entry);
        }
      }
    }
    return {
      schemaVersion: 1,
      ui: normalizePluginUiState(data.ui),
      themes,
    };
  } catch {
    return { schemaVersion: 1, ui: normalizePluginUiState(), themes: {} };
  }
}

export async function writePluginConfig(config, {
  configPath = pluginConfigPath(),
} = {}) {
  const safeThemes = {};
  if (config?.themes && typeof config.themes === "object") {
    for (const [id, entry] of Object.entries(config.themes)) {
      if (typeof id === "string" && id) safeThemes[id] = normalizeLiveParams(entry);
    }
  }
  const normalized = {
    schemaVersion: 1,
    ui: normalizePluginUiState(config?.ui),
    themes: safeThemes,
  };
  await writeAtomicJson(configPath, normalized);
  return normalized;
}

export async function readThemeLiveParams(themeId, {
  preferencesPath = themePreferencesPath(),
  configPath = pluginConfigPath(),
  presetsPath = null,
} = {}) {
  const [prefData, pluginCfg, defaultPreset] = await Promise.all([
    readBoundedJson(preferencesPath).catch(() => null),
    readPluginConfig({ configPath }),
    resolveDefaultLiveParams(presetsPath ? { presetsPath } : {}),
  ]);
  const hasExplicitTransparency = Boolean(
    prefData?.schemaVersion === 1 &&
    prefData.themes &&
    typeof prefData.themes === "object" &&
    !Array.isArray(prefData.themes) &&
    Object.hasOwn(prefData.themes, themeId) &&
    typeof prefData.themes[themeId]?.transparency === "number" &&
    Number.isFinite(prefData.themes[themeId].transparency)
  );
  const explicitTransparency = hasExplicitTransparency ? prefData.themes[themeId].transparency : undefined;
  if (Object.hasOwn(pluginCfg.themes, themeId)) {
    const stored = pluginCfg.themes[themeId];
    const alpha = stored.transparency ?? explicitTransparency ?? defaultPreset.transparency;
    return {
      params: normalizeLiveParams({ ...stored, transparency: alpha }, alpha),
      ui: pluginCfg.ui,
    };
  }
  const baseTransparency = explicitTransparency ?? defaultPreset.transparency;
  return {
    params: normalizeLiveParams({ ...defaultPreset, transparency: baseTransparency }, baseTransparency),
    ui: pluginCfg.ui,
  };
}

// Read only Antigravity fields from shared JBYLiquidGlass/guard-config.json
export async function readSharedGuardConfig({
  configPath = sharedGuardConfigPath(),
} = {}) {
  try {
    const data = await readBoundedJson(configPath);
    return normalizeSharedGuardConfig(data);
  } catch {
    return normalizeSharedGuardConfig();
  }
}

// Atomically merge ONLY Antigravity fields into shared JBYLiquidGlass/guard-config.json without clobbering Codex settings
export async function writeSharedGuardConfig(patch, {
  configPath = sharedGuardConfigPath(),
} = {}) {
  let existing = {
    schemaVersion: 1,
    autoGuardEnabled: true,
    autoLaunchCodexOnBoot: false,
    quietAttach: true,
    checkIntervalMs: 1600,
  };
  try {
    const parsed = await readBoundedJson(configPath);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = { ...existing, ...parsed };
    }
  } catch {}
  const agy = normalizeSharedGuardConfig({ ...existing, ...(patch || {}) });
  const merged = {
    ...existing,
    schemaVersion: 1,
    antigravityAutoGuardEnabled: agy.antigravityAutoGuardEnabled,
    autoLaunchAntigravityOnBoot: agy.autoLaunchAntigravityOnBoot,
    antigravityPort: agy.antigravityPort,
  };
  await writeAtomicJson(configPath, merged);
  return agy;
}
