# JBY-Liquid-Glass v3

Universal, theme-agnostic **iOS 26 / S26 Clear Liquid Glass + HarmonyOS 7 Physics** skin engine and template skill for **OpenAI Codex Desktop (Codex Dream Skin)** and Electron/Chromium UIs.

## What v3 Fixes & Delivers

- **Every Window & Control in Unified Clear Crystal**:
  - **`[data-oai-writing-block-surface]` (Writing Output Block)** now renders as true clear Liquid Glass (`--ds-lg-lens-writing` + translucent specular rim) with an automatic `224x1` horizontal bevel map above `1100px` height so ultra-tall output blocks refract cleanly along vertical crystal borders without stretching.
  - **Mode Switcher (`聊天 | 工作`), Native Work Composer & Quota Banners**: Replaced the opaque white slider blob and duplicate `::before` pill with a pure translucent crystal indicator over a refractive capsule track; restored Home Work Mode's native two-part shape (`[data-composer-body]` + tucked `[data-composer-utility-rail]`, tagged `data-dream-lg-surface="work-composer"`) rendered in full clear Liquid Glass with `#ds-lg-lens-composer` / `#ds-lg-lens-rail` while keeping Chat and Codex composers intact; and styled Work quota banners (`aside[class*="banner-"]`).
  - **Settings Cards & Popovers**: Matched deeply nested `section div[class*="rounded-2xl"][class*="border"]`, menus, dialogs, and Radix slider popovers (`[data-radix-popper-content-wrapper] > div`) under unified `#ds-lg-lens-card` and `#ds-lg-lens-popover` refraction.
- **Per-Zone Live Optical Tuning (`zones`)**:
  - Inside the Floating Crystal Orb Studio drawer, switch freely between `global` (全部) and 5 independent zones (`composer`, `writing`, `sidebar`, `cards`, `popover`) to dial transparency, edge refraction, blur haze, and specular rim intensity per region with 0ms rAF response and persisted `selectedZone` UI state.
- **Deep Chromium Style & Layout Lag Elimination**:
  - Eliminated `background-attachment: fixed`, bare `main div:has(...)` selectors (replaced by targeted `[data-dream-lg-surface]` markers), redundant `applyRootState` style writes, un-scoped `refreshPredicates()` root mutations, and `#ds-live-tune-css` blur overrides that clobbered SVG lenses.

## Verify Template Integrity

```bash
node scripts/verify-template.mjs
```
