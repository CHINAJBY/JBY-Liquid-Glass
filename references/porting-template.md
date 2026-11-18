# 新电脑 / 新皮肤全自动模板适配蓝图（Porting SOP）

当您换了一台新电脑重新从 GitHub 下载/安装了原版 **Codex Dream Skin**，或者拿到了一张全新壁纸、一个全新主题压缩包时，请直接按本 SOP 将整套 **S26 液态玻璃 + HarmonyOS 7 动效模板** 部署或套用到新皮肤上。

---

## 一、在全新 Codex Dream Skin 环境上部署通用渲染模板

原版 Codex Dream Skin 的核心前端资源位于运行目录与安装包载荷镜像中（Windows 下常见为 `%LOCALAPPDATA%\CodexDreamSkin\engine\assets\` 与安装目录 `payload\assets\`）：

1. **在 `renderer-inject.js` 注入通用引擎（与任何主题名彻底解耦）**：
   - 确认激活开关判定函数：
     - **全皮肤通吃模式（推荐）**：不按主题 ID 白名单拦截，只要 `!window[DISABLED_KEY]` 且主题未显式关闭 (`THEME.liquidGlass !== false`)，即挂载通用液态玻璃与物理弹簧引擎；
     - **双版本隔离模式**：保留原版风格不变，当且仅当主题 ID 符合约定后缀（例如 `-liquid-glass`）或字段标记时才激活液态玻璃属性 `data-dream-lg="on"`。
   - 实现通用色彩推导（参见 [appearance-and-params.md](./appearance-and-params.md#1-从任意主题--壁纸自动推导配色与光学参数)）：
     - 从当前加载的 `THEME.colors` / `--ds-accent-rgb` 动态算出 `prismA` 与 `prismB`；
     - **不要写入任何按固定主题名查表的字典**，确保未来导入任何新主题包都能自动亮出匹配该壁纸色相的边缘色散光。
   - 挂载 WebGL2 `GLASS_TIERS` 离线/尺寸自适应烘焙流水线、`72×45` 壁纸亮度网格 `ENV` 采样、`ResizeObserver` 尺寸监听、`solveSpringLinear` 曲线、`stepSprings` & `stepSegSprings` 实时弹簧、`fxCanvas` 144 FPS 边框高光与微粒波纹、以及 `checkBusyState` 生成态极光。
   - 完整实现 `cleanup / teardown`：停止所有 rAF、断开观察器、释放 Blob URL 与 `#ds-lg-*` 节点，确保暂停或卸载时 Codex 原生状态 100% 还原。

2. **在 `dream-skin.css` 尾部合并通用 S26 + HarmonyOS 样式模板**：
   - 将本模板的所有布局与光学样式统一挂载在通用选择前缀下（全皮肤通吃用 `html[data-dream-skin="active"][data-dream-lg="on"]`，双版本隔离则加上主题后缀属性匹配），覆盖：
     - 浅/暗通透光学变量与 `--ds-lg-text-halo`；
     - 字重梯度 `500 / 530 / 560`；
     - `40px` 顶部避让晶岛侧栏、`34px / 40px` 高对比凹凸“聊天 | 工作”分段器；
     - 双胶囊 Composer 悬浮栈 + Goal Mode 防溢出防截断规则 + Work 下挂托盘；
     - `[data-dream-lg-gpu="1"]::before` 贴图接管规则（当 GPU 贴图就绪时强制清除原元素 CSS `backdrop-filter`，避免双重采样掉帧）；
     - AI 无框阅读流 + 晶体气泡/代码砖块 + 极光动画关键帧 + `prefers-reduced-motion` 降级保护。

---

## 二、任意新壁纸 / 新主题包的标准化生成模板 (`theme.json` + `theme.css`)

不论您将来准备用哪一张图，新主题目录只需包含以下标准化结构，模板引擎会自动接管全部高阶液态玻璃与物理交互：

### 1. 标准 `theme.json` 模板
```json
{
  "schemaVersion": 1,
  "id": "<唯一英文小写标识，如 my-new-skin 或 my-new-skin-liquid-glass>",
  "name": "<展示名称>",
  "brandSubtitle": "<副标题风格短语，如 CRYSTAL OPTICS · 液态玻璃>",
  "image": "background.png",
  "appearance": "light",
  "art": {
    "focusX": 0.5,
    "focusY": 0.48,
    "safeArea": "none",
    "taskMode": "full"
  },
  "colors": {
    "background": "<从壁纸提取的浅/深底色>",
    "panel": "<从壁纸提取的面板底色>",
    "panelAlt": "<微深/微浅次级面板色>",
    "accent": "<从壁纸主体或视觉中心抽取的主强调色>",
    "accentAlt": "<邻近辅强调色，驱动棱镜色散>",
    "secondary": "<次要配色>",
    "highlight": "<高亮/暗accent>",
    "text": "<确保与壁纸高对比的主文字色>",
    "muted": "<次要文字色>",
    "line": "<低饱和分隔线色>"
  }
}
```
- **关键参数填写建议**：
  - `appearance`：浅色调/明亮二次元/白底图设 `"light"`；暗黑/夜景/深色调设 `"dark"`；
  - `art.taskMode`：希望对话页也能透过壁纸看到全幅液态通透感时，一律设 `"full"`；仅靠人物焦点避让可配 `safeArea: "left" / "right"` 搭配 `focusX`（如人物在右侧则 `safeArea: "left"`, `focusX: 0.72~1.0`）；
  - **禁止写与壁纸无关的颜色**：`accent` 与 `accentAlt` 必须从新壁纸实景采样，这样底层模板才会算出最贴合画面的边缘折射色散。

### 2. 标准轻量 `theme.css` Safe CSS 模板
新皮肤的 `theme.css` 只需提供基础半透面板与强调色聚焦反馈（**千万不要写重动画或高像素嵌套 blur**，具体液态折射和 144 FPS 粒子全由外层通用模板接管，同时确保能通过 `safe-css-validator.mjs` 校验）：
- `main / home / home-hero / thread / message` 一律 `background-color: transparent;`
- `sidebar / composer / dialog` 使用从主题色衍生出的柔和底色与低半径圆角，保留 `--ds-theme-color-text` 变量联动，这样通用层关闭时原版依然干净美观，通用层开启时立刻无缝升级为 S26 液态玻璃！

---

## 三、双端同步与必过验收清单

每次在新环境把模板写进 `engine/` 后，务必：
1. 将改动的 `assets/` 与 `scripts/` 文件同步镜像到对应打包载荷目录（如 `payload/`），核对哈希一致；
2. 执行前端语法与打包自检：`node --check renderer-inject.js`、`node injector.mjs --self-test`、`node injector.mjs --check-payload`；
3. 对真实窗口运行 `node injector.mjs --verify` 并截图目视检查：**Home 主页、Thread 对话流、Goal Mode 长文案目标条、顶部“聊天 | 工作”分段器、右下/全局菜单悬浮窗**。
