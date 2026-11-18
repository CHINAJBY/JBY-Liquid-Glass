# 通用 S26 液态玻璃 + HarmonyOS 7 参数规范（主题无关版）

所有数值均与具体主题名称完全解耦，可直接作为通用模板引擎写进 `renderer-inject.js` 与 `dream-skin.css`。

---

## 1. 从任意主题 / 壁纸自动推导配色与光学参数

不要为不同皮肤写死颜色表，按以下固定优先级从当前 `THEME` 与背景图动态计算：

1. **提取主题主色 RGB 三元组**：
   - `accentRgb` ⇐ `THEME.colors?.accent` 或 root `--ds-accent-rgb`（fallback：由 `analyzeArt()` 对壁纸 `96×96` 画布做饱和度/亮度加权 24-bin 色相聚类所得的主色彩）。
   - `accentAltRgb` ⇐ `THEME.colors?.accentAlt || THEME.colors?.highlight || --ds-secondary-rgb`（fallback 同 `accentRgb`）。
2. **自动合成 S26 光学双棱镜 (`prismA`, `prismB`)**：
   - **通用派生公式**（浅色高光白略染主题色调 + 强调色色散）：
     ```js
     // prismA：把白光 (255,255,255) 向 accentRgb 混合 22%~28%，生成晶莹剔透的冰晶边缘高光
     const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
     const prismA = mixRgb([255, 255, 255], parseRgbVec(accentRgb), 0.24).join(" ");
     const prismB = parseRgbVec(accentAltRgb).join(" ");
     ```
   - 写入 CSS 变量：`--ds-lg-accent-rgb`、`--ds-lg-accent-alt-rgb`、`--ds-lg-prism-a`、`--ds-lg-prism-b`。
3. **局部壁纸光影采样自校准 (`sampleRegionOptics`)**：
   - 将壁纸绘制至离屏 `ENV_W = 72, ENV_H = 45` 的 `ImageData`，结合壁纸 `background-size: cover` 数学映射与 `art.focusX / art.focusY`，对每个注册玻璃元素的屏幕矩形 `(r.left, r.top, r.width, r.height)` 采样平均 RGB 与相对亮度 `lum`；
   - 按 `lum` 实时分级：`lum >= 0.72 -> "bright"`、`lum <= 0.44 -> "rich"`、其余 `"balanced"`；
   - 自动推导深冰分离描边透明度：`rimAlpha = clamp(0.22 + max(0, lum - 0.26) * 0.44, 0.24, 0.52)`，写入 `--ds-lg-bg-lum`、`--ds-lg-env-rgb`、`--ds-lg-rim-alpha`。

---

## 2. 7 阶硬件 WebGL2 玻璃分级矩阵 (`GLASS_TIERS`)

`classifyGlassTier(el)` 按控件层级自动分配折射与倒角厚度（**0 次 Skia 软件回读**）：

| Tier | 匹配目标 | `radius` | `bezel` | `scale` | `chromatic` | `blurLod` | `coreAlpha` | `tintAlpha`(浅色) | `rimAlpha` | `saturate` |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **composer** | 主输入框大胶囊 | `28` | `12` | `13` | `0.060` | `0.35` | `0.88` (对话页内 `0.0`) | `0.22` | `0.90` | `1.56` |
| **rail** | 上方附着托盘 / 下方 Work 托盘 | `24` | `10` | `11` | `0.055` | `0.35` | `0.86` | `0.22` | `0.86` | `1.52` |
| **sidebar** | 左侧悬浮晶岛侧边栏 | `24` | `15` | `15` | `0.070` | `0.65` | `0.86` | `0.26` | `0.82` | `1.46` |
| **menu** | 下拉菜单 / 额度浮窗 / 右键菜单 | `22` | `12` | `14` | `0.065` | `0.34` | `1.00` | `0.58` | `0.90` | `1.50` |
| **dialog** | 模态对话框 | `22` | `12` | `14` | `0.070` | `0.40` | `0.00` | `0.16` | `0.88` | `1.54` |
| **card** | 设置页卡片组 | `20` | `12` | `12` | `0.060` | `0.35` | `0.86` | `0.20` | `0.82` | `1.50` |
| **pill** | 首页推荐卡 / 项目选区胶囊 / Tooltip | `18` | `9` | `10` | `0.050` | `0.35` | `0.88` | `0.24` | `0.90` | `1.52` |

### WebGL2 Fragment Shader 核心物理常量 (`GPU_FRAG`)
- **边缘薄壁倒角曲率**：`bezelCurve = pow(1.0 - clamp(distIn / max(1.0, bez), 0.0, 1.0), 3.2)`（折射集中在最外圈倒角壁，确保居中文字区平静清晰不扭曲）；
- **波长色散**：按法线方向对 RGB 分量分别位移 `disp * (1.0 - uChromatic)`、`disp`、`disp * (1.0 + uChromatic)`；
- **Mipmap 自适应模糊**：`lod = mix(uBlurLod, max(0.4, uBlurLod + 0.7), bezelCurve)`；
- **暗黑皮肤自动底色 (`[data-dream-shell="dark"]`)**：`gl.uniform4f(uTint, 0.08, 0.10, 0.16, tier === "menu" ? 0.62 : 0.22)`。

---

## 3. HarmonyOS 7 连续物理弹簧与粒子参数

### A. CSS `linear()` 阻尼谐振预设 (`solveSpringLinear`)
基于二阶阻尼谐振方程数值采样 28~36 个控制点生成 CSS 物理曲线：
- `--ds-lg-spring-responsive`：`responseS = 0.14, dampingRatio = 0.85, steps = 32`
- `--ds-lg-spring-settle`：`responseS = 0.34, dampingRatio = 0.80, steps = 36`
- `--ds-lg-spring-press`：`responseS = 0.18, dampingRatio = 0.74, steps = 28`

### B. JS 实时可打断弹簧 (`stepSprings` & `stepSegSprings`)
- **按压弹性（仅 `width < 340` 小控件）**：
  - 按下目标：`ts = 0.964`（Switch 为 `0.94`），`ty = 0.5`，`stiffness = 640, damping = 28`；
  - 抬手复原：`ts = 1, ty = 0, sx = 1`，`stiffness = 520, damping = 24`；
  - Switch 滑块形变弹：`initDelta = { s: 0.95, sx: 1.10 }`，`stiffness = 560, damping = 24`。
- **分段滑块弹簧**：
  - `k = 380, c = 26`，水平速度形变拉伸：`sx = 1 + min(0.18, |vx| / 1800)`。

### C. 2D 覆盖画布特效 (`fxCanvas` + `emitBurst`)
- **鼠标悬停流光**：`createRadialGradient` 半径 `150px`，线宽 `1.6px`，衰减系数 `* 0.88`，完全零 DOM 重排；
- **点击微粒波纹**：双同心扩张圈（外环最大半径 `40px` / `410ms` 主题色 + 内环 `26px` / `340ms` 白色）+ `5` 个上升微粒点（速度 `1.15~2.55`，`310~450ms`，粒子数保护上限 `90`）。

### D. SVG 位移色散备用方案（适合极简无边框变体）
若某些超轻透皮肤希望 Composer 使用动态矢量折射与无框气泡流：
- `#apple-true-liquid-glass` 滤镜：对 `border = 0.08`、`mapBlur = 14px` 贴图做 `feDisplacementMap`（R/G/B `scale` 分别为 `-85, -77, -69`）接 `feBlend (screen)` 合成色散；
- 极简文字比例：标题 `26px / font-weight: 500`，对话正文 `15px / line-height: 1.65`，点击发射 `7` 颗 `shadowBlur: 6` 亮白星点火花（阻尼 `0.93`）。

---

## 4. 全量布局、圆角、阴影与字重 CSS 模板参数

1. **浅/暗通透质感玻璃变量**
   - **浅色 (`[data-dream-shell="light"]`)**：
     - `--ds-lg-glass-hi`: `rgb(255 255 255 / .18)`
     - `--ds-lg-glass-mid`: `rgb(255 255 255 / .10)`
     - `--ds-lg-glass-lo`: `rgb(var(--ds-lg-env-rgb, var(--ds-lg-accent-rgb)) / .14)`
     - `--ds-lg-rim-dark`: `rgb(var(--ds-text-rgb) / var(--ds-lg-rim-alpha, .36))`
     - `--ds-lg-rim-spec`: `rgb(255 255 255 / .98)`
     - `--ds-lg-text-halo`: `0 1px 1px rgb(255 255 255 / .88), 0 0 10px rgb(255 255 255 / .76)`
   - **暗色 (`[data-dream-shell="dark"]`)**：
     - `--ds-lg-glass-hi`: `rgb(255 255 255 / .14)`
     - `--ds-lg-glass-mid`: `rgb(var(--ds-panel-rgb) / .24)`
     - `--ds-lg-glass-lo`: `rgb(var(--ds-lg-env-rgb, var(--ds-lg-accent-rgb)) / .20)`
     - `--ds-lg-rim-dark`: `rgb(255 255 255 / .28)`、`--ds-lg-rim-spec`: `rgb(255 255 255 / .46)`
     - `--ds-lg-text-halo`: `0 1px 2px rgb(0 0 0 / .72), 0 0 10px rgb(0 0 0 / .52)`
2. **字重精确梯队**：
   - 正文容器：`font-weight: 500; -webkit-font-smoothing: subpixel-antialiased; text-rendering: optimizeLegibility;`
   - 按钮/链接/菜单项/Tab：`font-weight: 530;`
   - 标题/Hero：`font-weight: 560;`
3. **组件几何参数清单**：
   - **悬浮晶岛侧边栏**：`margin: 40px 0 8px 8px; height: calc(100% - 48px); border-radius: 24px;`（非 GPU 降级模糊 `blur(4px) saturate(165%)`）
   - **顶部“聊天 | 工作”切换器**：`group` 高 `38px`、`mode-toggle-track` 高 `34px` 内阴影凹槽、选中 `indicator-` 高 `40px` `1.5px solid #ffffff` 滑块、`aria-pressed="true"` `scale(1.06) weight 600`、`aria-pressed="false"` `scale(.90) opacity .68 weight 500`
   - **双胶囊 Composer 栈**：整体 `max-width: min(760px, calc(100% - 64px))`；上方托盘 `width: calc(100% - 36px); min-height: 44px; margin: 0 auto -22px auto; padding: 5px 18px 20px 18px; border-radius: 24px 24px 16px 16px;`；下方 Work 托盘 `margin: -22px auto 14px auto; padding: 20px 18px 5px 18px; border-radius: 16px 16px 24px 24px;`；主大框 `border-radius: 28px; z-index: 3;`
   - **对话元素**：AI 信息流 `transparent` 全无框；用户提问气泡 `border-radius: 20px; padding: 10px 16px; border-left: 2.5px solid ...`；工具胶囊 `16px`；代码块 `18px`；设置卡 `20px`；弹窗/菜单 `22px`；Tooltip `14px`。
4. **AI 运行态视觉**：
   - Busy (`[data-dream-lg-busy="true"]`)：`2.4s linear infinite` 极光流光边框 + 停止键 `1.8s` 脉冲声呐；
   - Settled (`[data-dream-lg-settled="1"]`)：`720ms` 完成态内泛白光环闪烁；
   - Turn 入场 `280ms` 上浮 `12px`，菜单弹出 `210ms` 从中心弹性缩放展开。
