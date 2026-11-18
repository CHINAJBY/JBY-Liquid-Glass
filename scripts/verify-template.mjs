import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const FORBIDDEN_PATTERN = /alpha-lock|asuka|chatgpt-dragon|white-dragon|gothic-void|harmony-liquid-glass-lunar|Auto-Guard|DreamSkin Studio|__dsPlugin/;

const filesToScan = [
  "SKILL.md",
  "README.md",
  "references/appearance-and-params.md",
  "references/porting-template.md",
  "references/pitfalls-and-rules.md",
  "assets/s26-liquid-glass.css",
  "assets/s26-liquid-glass-engine.js",
  "assets/theme-template/theme.json",
  "assets/theme-template/theme.css",
];

for (const rel of filesToScan) {
  const full = path.join(root, rel);
  const content = await fs.readFile(full, "utf8");
  const match = content.match(FORBIDDEN_PATTERN);
  if (match) {
    throw new Error(`Hardcoded theme or leftover prototype token "${match[0]}" found in ${rel}`);
  }
}

const engineJs = await fs.readFile(path.join(root, "assets/s26-liquid-glass-engine.js"), "utf8");
new Function(engineJs);

const cssText = await fs.readFile(path.join(root, "assets/s26-liquid-glass.css"), "utf8");
if (!cssText.includes('[data-dream-lg="on"]') || !cssText.includes("@keyframes ds-lg-aurora")) {
  throw new Error("s26-liquid-glass.css is missing expected Liquid Glass rules");
}
if (cssText.includes('[data-dream-theme$="-liquid-glass"]')) {
  throw new Error("s26-liquid-glass.css should be decoupled via [data-dream-lg=\"on\"]");
}

const themeJson = JSON.parse(await fs.readFile(path.join(root, "assets/theme-template/theme.json"), "utf8"));
if (themeJson.schemaVersion !== 1 || !themeJson.colors?.accent || !themeJson.art) {
  throw new Error("theme-template/theme.json failed structural validation");
}

console.log(JSON.stringify({
  pass: true,
  package: "JBY-Liquid-Glass",
  checkedFiles: filesToScan.length,
  engineBytes: engineJs.length,
  cssBytes: cssText.length,
}, null, 2));
