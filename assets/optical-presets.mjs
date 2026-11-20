import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

const MAX_BYTES = 256 * 1024;

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

export function sharedStateRoot(platform = process.platform, env = process.env, home = os.homedir()) {
  return platform === "win32"
    ? path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "JBYLiquidGlass")
    : path.join(home, "Library", "Application Support", "JBYLiquidGlassStudio");
}

export function opticalPresetsPath({
  presetsPath = null,
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
} = {}) {
  if (presetsPath) return presetsPath;
  return path.join(sharedStateRoot(platform, env, home), "optical-presets.json");
}

async function readBoundedJson(filePath) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("invalid json file");
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < stat.size) {
      const res = await handle.read(bytes, offset, stat.size - offset, offset);
      if (!res.bytesRead) break;
      offset += res.bytesRead;
    }
    return JSON.parse(bytes.subarray(0, offset).toString("utf8"));
  } finally {
    await handle?.close();
  }
}

async function writeAtomicJson(filePath, payload) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const text = `${JSON.stringify(payload, null, 2)}\r\n`;
  await fs.writeFile(tempPath, text, "utf8");
  await fs.rename(tempPath, filePath);
}

function normalizePresetsPayload(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const seen = new Set();
  const presets = [];
  if (Array.isArray(src.presets)) {
    for (const item of src.presets) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const id = String(item.id || "").trim().slice(0, 80);
      const name = String(item.name || "").trim().slice(0, 60);
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      presets.push({
        id,
        name,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        params: normalizeLiveParams(item.params || {}),
      });
    }
  }
  const defaultPresetId = typeof src.defaultPresetId === "string" && seen.has(src.defaultPresetId)
    ? src.defaultPresetId
    : null;
  return {
    schemaVersion: 1,
    defaultPresetId,
    presets,
  };
}

export async function readOpticalPresets(options = {}) {
  const targetPath = opticalPresetsPath(options);
  try {
    const parsed = await readBoundedJson(targetPath);
    return normalizePresetsPayload(parsed);
  } catch {
    return { schemaVersion: 1, defaultPresetId: null, presets: [] };
  }
}

export async function writeOpticalPresets(state, options = {}) {
  const targetPath = opticalPresetsPath(options);
  const normalized = normalizePresetsPayload(state);
  await writeAtomicJson(targetPath, normalized);
  return normalized;
}

export async function resolveDefaultLiveParams(options = {}) {
  const state = await readOpticalPresets(options);
  if (state.defaultPresetId) {
    const match = state.presets.find((p) => p.id === state.defaultPresetId);
    if (match) return normalizeLiveParams(match.params);
  }
  return normalizeLiveParams(DEFAULT_LIVE_PARAMS);
}

export function nextAutoPresetName(presets = []) {
  const used = new Set();
  for (const p of presets) {
    const m = /^预设\s*(\d+)(?:\s*·.*)?$/.exec(String(p?.name || "").trim());
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `预设 ${n}`;
}

export async function saveOpticalPreset({ id = null, name = "", params = {}, setAsDefault = false } = {}, options = {}) {
  const state = await readOpticalPresets(options);
  const cleanNameInput = String(name || "").trim().slice(0, 60);
  const cleanParams = normalizeLiveParams(params);
  const now = new Date().toISOString();

  let target = id ? state.presets.find((p) => p.id === String(id).trim()) : null;
  if (!target && cleanNameInput) {
    target = state.presets.find((p) => p.name === cleanNameInput) || null;
  }

  if (target) {
    target.name = cleanNameInput || target.name;
    target.updatedAt = now;
    target.params = cleanParams;
  } else {
    const assignedName = cleanNameInput || nextAutoPresetName(state.presets);
    let newId = `preset-${Date.now().toString(36)}`;
    while (state.presets.some((p) => p.id === newId)) {
      newId = `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    }
    target = {
      id: newId,
      name: assignedName,
      updatedAt: now,
      params: cleanParams,
    };
    state.presets.push(target);
  }

  if (setAsDefault) {
    state.defaultPresetId = target.id;
  }
  const saved = await writeOpticalPresets(state, options);
  const savedPreset = saved.presets.find((p) => p.id === target.id) || target;
  return { preset: savedPreset, state: saved };
}

export async function setDefaultOpticalPreset(presetId, options = {}) {
  const state = await readOpticalPresets(options);
  if (presetId === null || presetId === undefined || presetId === "") {
    state.defaultPresetId = null;
  } else {
    const cleanId = String(presetId).trim();
    if (!state.presets.some((p) => p.id === cleanId)) {
      throw new Error(`Preset not found: ${cleanId}`);
    }
    state.defaultPresetId = cleanId;
  }
  return writeOpticalPresets(state, options);
}

export async function deleteOpticalPreset(presetId, options = {}) {
  const state = await readOpticalPresets(options);
  const cleanId = String(presetId || "").trim();
  state.presets = state.presets.filter((p) => p.id !== cleanId);
  if (state.defaultPresetId === cleanId) {
    state.defaultPresetId = null;
  }
  return writeOpticalPresets(state, options);
}
