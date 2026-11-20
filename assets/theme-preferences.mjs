import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveDefaultLiveParams } from "./optical-presets.mjs";

export function dreamSkinStateRoot(platform = process.platform, env = process.env, home = os.homedir()) {
  return platform === "win32"
    ? path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "JBYLiquidGlass")
    : path.join(home, "Library", "Application Support", "JBYLiquidGlassStudio");
}

export function themePreferencesPath(platform = process.platform, env = process.env, home = os.homedir()) {
  return path.join(dreamSkinStateRoot(platform, env, home), "theme-preferences.json");
}

export function pluginConfigPath(platform = process.platform, env = process.env, home = os.homedir()) {
  return path.join(dreamSkinStateRoot(platform, env, home), "dream-skin-plugin.json");
}

export function guardConfigPath(platform = process.platform, env = process.env, home = os.homedir()) {
  return path.join(dreamSkinStateRoot(platform, env, home), "guard-config.json");
}

export const LIQUID_ZONES = Object.freeze(["composer", "slash", "writing", "sidebar", "cards", "popover"]);

export const DEFAULT_LIVE_PARAMS = Object.freeze({
  transparency: 80,
  refractScale: 100,
  blurScale: 100,
  rimIntensity: 100,
  motionMode: "spring",
  particlesEnabled: true,
  fontWeightBoost: 0,
  zones: {},
});

export const DEFAULT_GUARD_CONFIG = Object.freeze({
  schemaVersion: 1,
  autoGuardEnabled: true,
  autoLaunchCodexOnBoot: false,
  quietAttach: true,
  checkIntervalMs: 1600,
});

const clampNum = (value, min, max, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(Math.min(max, Math.max(min, num)));
};

const normalizeZoneParams = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  if (raw.transparency !== undefined && raw.transparency !== null) out.transparency = clampNum(raw.transparency, 0, 100, 80);
  if (raw.refractScale !== undefined && raw.refractScale !== null) out.refractScale = clampNum(raw.refractScale, 0, 200, 100);
  if (raw.blurScale !== undefined && raw.blurScale !== null) out.blurScale = clampNum(raw.blurScale, 0, 200, 100);
  if (raw.rimIntensity !== undefined && raw.rimIntensity !== null) out.rimIntensity = clampNum(raw.rimIntensity, 0, 200, 100);
  return Object.keys(out).length ? out : null;
};

export function normalizeLiveParams(raw = {}, baseTransparency = 80) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const fallbackAlpha = clampNum(baseTransparency, 0, 100, DEFAULT_LIVE_PARAMS.transparency);
  const motionMode = ["spring", "lite", "off"].includes(src.motionMode)
    ? src.motionMode
    : DEFAULT_LIVE_PARAMS.motionMode;
  const zones = {};
  if (src.zones && typeof src.zones === "object" && !Array.isArray(src.zones)) {
    for (const zid of LIQUID_ZONES) {
      const z = normalizeZoneParams(src.zones[zid]);
      if (z) zones[zid] = z;
    }
  }
  return {
    transparency: clampNum(src.transparency ?? fallbackAlpha, 0, 100, fallbackAlpha),
    refractScale: clampNum(src.refractScale, 0, 200, DEFAULT_LIVE_PARAMS.refractScale),
    blurScale: clampNum(src.blurScale, 0, 200, DEFAULT_LIVE_PARAMS.blurScale),
    rimIntensity: clampNum(src.rimIntensity, 0, 200, DEFAULT_LIVE_PARAMS.rimIntensity),
    motionMode,
    particlesEnabled: typeof src.particlesEnabled === "boolean"
      ? src.particlesEnabled
      : DEFAULT_LIVE_PARAMS.particlesEnabled,
    fontWeightBoost: clampNum(src.fontWeightBoost, -80, 150, DEFAULT_LIVE_PARAMS.fontWeightBoost),
    zones,
  };
}

const clampUnit = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(Math.min(1, Math.max(0, num)) * 10000) / 10000;
};

export function normalizePluginUiState(raw = {}) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const activeTab = ["themes", "tune", "auto"].includes(src.activeTab) ? src.activeTab : "themes";
  const pillMode = src.pillMode === "pill" ? "pill" : "orb";
  const validZones = new Set(["global", ...LIQUID_ZONES]);
  const selectedZone = validZones.has(src.selectedZone) ? src.selectedZone : "global";
  return {
    pillMode,
    pillMinimized: pillMode === "orb",
    panelOpen: Boolean(src.panelOpen),
    activeTab,
    selectedZone,
    posX: clampUnit(src.posX),
    posY: clampUnit(src.posY),
  };
}

export function normalizeGuardConfig(raw = {}) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    schemaVersion: 1,
    autoGuardEnabled: typeof src.autoGuardEnabled === "boolean"
      ? src.autoGuardEnabled
      : DEFAULT_GUARD_CONFIG.autoGuardEnabled,
    autoLaunchCodexOnBoot: typeof src.autoLaunchCodexOnBoot === "boolean"
      ? src.autoLaunchCodexOnBoot
      : DEFAULT_GUARD_CONFIG.autoLaunchCodexOnBoot,
    quietAttach: typeof src.quietAttach === "boolean"
      ? src.quietAttach
      : DEFAULT_GUARD_CONFIG.quietAttach,
    checkIntervalMs: clampNum(src.checkIntervalMs, 800, 10000, DEFAULT_GUARD_CONFIG.checkIntervalMs),
  };
}

const MAX_BYTES = 256 * 1024;
const warned = new Set();

async function readBoundedJson(filePath) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("invalid json file");
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
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
      warn("[dream-skin] Local theme preferences unavailable or invalid; using theme transparency defaults.");
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

export async function readGuardConfig({
  configPath = guardConfigPath(),
} = {}) {
  try {
    const data = await readBoundedJson(configPath);
    return normalizeGuardConfig(data);
  } catch {
    return normalizeGuardConfig();
  }
}

export async function writeGuardConfig(nextConfig, {
  configPath = guardConfigPath(),
} = {}) {
  const normalized = normalizeGuardConfig(nextConfig);
  await writeAtomicJson(configPath, normalized);
  return normalized;
}

