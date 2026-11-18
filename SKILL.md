---
name: jby-liquid-glass
description: >-
  Universal, theme-agnostic style template, reusable WebGL2/CSS assets, and
  porting blueprint for OpenAI Codex Desktop (Dream Skin): iOS 26 / S26 clear
  Liquid Glass + HarmonyOS 7 continuous spring physics. Works for ANY wallpaper,
  ANY new theme ZIP, or ANY fresh Codex Dream Skin install on a new PC without
  hardcoding specific theme IDs.
---

# JBY-Liquid-Glass — Codex 通用液态玻璃风格模板包

> **核心定位（万能通用模板，不绑定任何特定皮肤）**：
> 本 Skill 将 **iOS 26 / S26 极度通透液态玻璃 + HarmonyOS 7 连续物理动效** 打包成完全脱耦的模板文档与可复用源码。
> 无论在新电脑重新下载原版 Codex Dream Skin，还是以后导入任何新壁纸 / 新主题包，AI Agent 只需读取本包与 [`assets/`](./assets/) 即可自动从新图推导配色与棱镜折射参数，完整落地整套视觉与交互体系。

---

## 1. 一句话审美标准（主次设计语言）

- **主视觉体系 —— Apple iOS 26 / S26 极度通透液态玻璃（Liquid Glass）**：
  - 拒绝糊成死白一片的厚雾。要求**低白雾釉层（`10%~18%`）+ 高饱和透视（`saturate 1.46~2.02`）+ 边缘 SDF 法线折射色散 + 双层立体高光斜角边框**，让每个浮层控件与壁纸拉开明显空间分离感。
- **辅助动效体系 —— HarmonyOS 7 流畅连续物理交互**：
  - ArkUI 连续阻尼谐振弹簧、可随时打断的手势状态机、分段滑块果冻拉伸、144 FPS 零 DOM 重排 Canvas 悬停流光与点击粒子波纹、AI 生成态极光描边。
- **全自动配色与光影自适应（零写死 ID 字典）**：
  - 主色从当前皮肤的 `theme.colors`（缺省时由画布 `96×96` HSL 聚类抽取）读取；
  - 棱镜色散光 (`prismA` / `prismB`) 直接由 `accentRgb` 与 `accentAltRgb` 动态混合推导；
  - 局部亮度网格（`72×45`）按每个玻璃组件背后壁纸实时亮度动态调整分离描边对比度。

---

## 2. 通用核心界面形态定式

1. **顶部“聊天 | 工作”分段器**：凹陷暗化外槽 (`34px`) vs 高浮高亮晶体滑块 (`40px`, `scale(1.06)`, `weight 600`)，未选项目后退降噪 (`opacity 0.64~0.68`, `scale 0.90`)，切换时耦合横向速度拉伸。
2. **左侧悬浮晶岛侧边栏**：`margin: 40px 0 8px 8px`、`border-radius: 24px`，严格让开顶部 `40px` 系统菜单栏。
3. **双胶囊悬浮输入框栈（主页 & 对话页）**：
   - 容器黄金宽 `max-width: min(760px, calc(100% - 64px))`；
   - 上方小托盘（`[此计算机 | UI设计]` 或 目标模式状态条）左右共收窄 `36px`，上方 `24px` 盘圆润，`margin: 0 auto -22px auto` 自然衔接主框后肩，内部强约束防止超长目标文字把右侧“暂停/编辑目标”按钮挤出屏幕；
   - 下方主输入框 `border-radius: 28px`、`z-index: 3`，内部剥离冗余边框与嵌套模糊；Work 下挂托盘对称衔接于下方。
4. **对话内容区**：AI 回复 **100% 无框透明**直浮壁纸，用户提问气泡/代码块/Diff 卡/工具胶囊表现为独立晶体砖块（`16px~20px`）。
5. **字体字重平衡红线**：适度微加粗提升透视可读性，但**禁止太重变笨拙**——严格使用 **正文 `500` / 控件 `530` / 标题 `560`** + 柔和外光晕 (`text-shadow`)。

---

## 3. 两种激活模式选择

- **策略 A · 全皮肤自动生效（推荐）**：控制函数返回 `true`（只要 `THEME.liquidGlass !== false` 即挂载 `data-dream-lg="on"`），此后**所有新皮肤开箱自动带满整套液态玻璃与物理动效**。
- **策略 B · 原版与增强双版本隔离**：控制函数检查后缀（如 `id.endsWith("-liquid-glass")`），保留原版压缩包外观不动，仅强化派生版本。

---

## 4. 包内文件与按需阅读索引

- **直接可用的通用代码与骨架**：
  - 通用样式层：[assets/s26-liquid-glass.css](./assets/s26-liquid-glass.css)
  - 通用 WebGL2 + 弹簧 JS 引擎：[assets/s26-liquid-glass-engine.js](./assets/s26-liquid-glass-engine.js)
  - 新主题起始模板：[assets/theme-template/theme.json](./assets/theme-template/theme.json) 与 [assets/theme-template/theme.css](./assets/theme-template/theme.css)
- **深入规格与操作手册**：
  - 全量数学/光学/CSS 参数：[references/appearance-and-params.md](./references/appearance-and-params.md)
  - 新电脑 / 原版 Dream Skin 零基础移植 SOP：[references/porting-template.md](./references/porting-template.md)
  - 7 大实测深坑与防掉帧/防溢出校验红线：[references/pitfalls-and-rules.md](./references/pitfalls-and-rules.md)
- **运行脚本核验**：`node scripts/verify-template.mjs`
