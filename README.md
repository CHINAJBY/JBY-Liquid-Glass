# JBY-Liquid-Glass

> Universal **Apple iOS 26 / S26 Clear Liquid Glass + HarmonyOS 7 Fluid Physics** Design System, Reusable WebGL2/CSS Engine, and Cross-Agent Skill Pack for Codex Desktop / Electron UI Themes.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent_Skill-SKILL.md-7c3aed)](SKILL.md)
[![FPS](https://img.shields.io/badge/Rendering-144_FPS_WebGL2_GPU-0ea5e9)](references/appearance-and-params.md)

**JBY-Liquid-Glass** 是一套**与具体壁纸和具体主题完全解耦的通用液态玻璃设计系统与 AI Agent Skill 模板包**。  
无论您换到全新电脑重装原版 **Codex Dream Skin**，还是导入任何新下载的皮肤 ZIP / 自定义壁纸，只要把本仓库交给任意支持 `SKILL.md` 的 AI Agent（Antigravity、Codex、Claude Code、Cursor 等），它就能零歧义地理解全套审美偏好、避坑经验，并直接套用 [`assets/`](assets/) 中的可复用引擎代码。

---

## 核心特性 / Highlights

- **零主题绑定 · 全自动色彩与棱镜推导**：不写死任何主题 ID。自动从任意 `theme.json` 或壁纸画布抽取 `accent` / `accentAlt` 混合生成 S26 双色棱镜高光 (`prismA` / `prismB`)，并通过 `72×45` 背景环境网格实时校准每块玻璃背面的明暗描边对比度。
- **WebGL2 硬件预烘焙液态玻璃 (`144 FPS` · 0 Skia 软件回读)**：用 SDF 圆角法线折射 + RGB 波长微色散 + Mipmap LOD 模糊把玻璃纹理一次烘焙至 `--ds-lg-gpu-bg`，规避 Chromium 大面积动态 `backdrop-filter` 导致的鼠标掉帧与延迟。
- **HarmonyOS 7 连续可打断物理弹簧与光效**：ArkUI 二阶阻尼 `linear()` 曲线、手势实时打断回弹、分段切换滑块速度形变拉伸、纯 2D Canvas 悬停流光与点击粒子涟漪、AI 生成态极光巡航边框。
- **精细排版与防溢出工程规范**：`500 / 530 / 560` 字重平衡与精准白光/暗光光晕、顶部 `40px` 标题栏避让晶岛侧栏、高对比凹凸“聊天 | 工作”切换器、双胶囊悬浮输入框栈，以及完整解决 Goal Mode（目标模式）超长文本把“暂停/编辑目标”按钮挤出屏幕的 Flex 约束。
- **支持两种集成策略**：通过单一属性 `[data-dream-lg="on"]` 即可选择**全皮肤自动通吃**或**原版 / 液态玻璃双版本隔离**。

---

## 仓库结构 / Repository Structure

```text
JBY-Liquid-Glass/
├── SKILL.md                         # AI Agent Skill 入口规范（Antigravity / Codex / Claude 通用）
├── README.md                        # 项目介绍与快速上手指南
├── LICENSE                          # MIT 开源协议
├── assets/
│   ├── s26-liquid-glass.css         # 主题无关的通用 S26 + HarmonyOS 7 CSS 样式层
│   ├── s26-liquid-glass-engine.js   # 主题无关的 WebGL2 + 弹簧 + 粒子运行时引擎模块
│   └── theme-template/
│       ├── theme.json               # 新主题包标准配置骨架
│       └── theme.css                # 轻量级 Safe CSS 主题骨架
├── references/
│   ├── appearance-and-params.md     # 全量光学 Shader / 弹簧 / 圆角 / 字重数值规格书
│   ├── porting-template.md          # 新电脑 / 原版 Dream Skin 零基础移植 SOP
│   └── pitfalls-and-rules.md        # 7 大实测踩坑经验（防卡顿、防溢出、安全与校验底线）
└── scripts/
    └── verify-template.mjs          # 自动化模板语法与脱敏校验脚本
```

---

## 快速安装为 Agent Skill / Quick Install

### 1. Antigravity

```powershell
git clone https://github.com/CHINAJBY/JBY-Liquid-Glass.git "$env:USERPROFILE\.gemini\config\skills\JBY-Liquid-Glass"
```

### 2. OpenAI Codex

```powershell
git clone https://github.com/CHINAJBY/JBY-Liquid-Glass.git "$env:USERPROFILE\.codex\skills\JBY-Liquid-Glass"
```

### 3. 在新电脑上对原版 Codex Dream Skin 一键适配

安装本 Skill 后，在任意对话中直接告诉 Agent：

> “请读取 `JBY-Liquid-Glass` 技能，把这套通用 S26 液态玻璃与 HarmonyOS 7 动效模板应用到当前电脑的 Codex Dream Skin，并帮我适配这个新主题/新壁纸。”

---

## 校验 / Verification

```bash
node scripts/verify-template.mjs
```

---

## Credits & Design References

- **Visual Optics**: Apple iOS 26 / macOS Liquid Glass (SDF bezel refraction, subtle chromatic dispersion, specular bevel separation)
- **Motion Physics**: HarmonyOS 7 / ArkUI continuous damped harmonic springs & interruptible gestures
- **Target Host**: Community theming workflow for **Codex Dream Skin**
