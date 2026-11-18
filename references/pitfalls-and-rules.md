# Codex 皮肤开发实测踩坑经验与工程防踩红线

以下全部坑点均来自真实联调、视频录屏排查与 `--verify` 校验故障总结，任何后续新适配皮肤或升级新电脑环境的 Agent 必须严格遵守。

---

## 坑 1：高频悬停重绘 + 多层 `backdrop-filter` 触发 Skia 软件回读，造成鼠标卡顿掉帧

- **踩坑现象**：页面平时静止看着像透明玻璃，但鼠标移到侧边栏、菜单、卡片或快速操作时明显掉帧延迟；使用重 SVG `<filter>` 或大面积 `:hover { backdrop-filter }`、写死 CSS `--mouse-x/--mouse-y` 触发全卡片重绘时，直接沦为低帧率 PPT。
- **根因**：Chromium / Electron 对动态变化的 `backdrop-filter` 与带位移滤镜的大元素会强制执行 **CPU / Skia Backdrop Readback（屏幕背板像素回读）**。
- **标准破解法**：
  1. **静态/低频变尺寸玻璃用 WebGL2 预烘焙 (`bakeGpuSurface` -> `--ds-lg-gpu-bg`)**：将圆角折射/色散/雾化由显卡 Fragment Shader 一次画成 `DataURL` 纹理贴到 `::before` 伪元素上，并将原元素 `backdrop-filter` 清为 `none`，实现 **0 次 Skia 回读、144 FPS 悬停与菜单滚动**；
  2. **动态跟手边框流光全交由 `fxCanvas`**：单层 `position: fixed; pointer-events: none;` 2D Canvas 通过 `requestAnimationFrame` 只在当前悬停卡片外沿画一条径向渐变描边，**零 DOM 样式突变**；
  3. **嵌套深度封顶 `<= 2` 层**：Composer 内部 `[data-composer-body]` / `LayoutBody` / `LayoutFooter` / `[data-ds-part="composer-toolbar"]` 必须剥离背景、阴影与模糊 (`backdrop-filter: none`)；
  4. **禁止在 `pointermove` 内反复读布局**：必须使用 `ResizeObserver` 与带 `280ms~320ms` 有效期的 `WeakMap` (`rectCache`) 缓存包围盒；
  5. **交互弹簧仅允许作用于小尺寸交互件（`width < 340`）且只改纯合成属性 `transform: translate3d(...) scale(...)` / `opacity`**，严禁对整屏容器做宽高/边距补间动画。

---

## 坑 2：项目“目标模式（Goal Mode）”开启时，超长目标文字把右侧“暂停/修改目标”按钮挤出屏幕

- **踩坑现象**：打开目标模式后，Composer 上方小胶囊内的目标描述文案把父容器横向撑爆，导致整个横条向右溢出屏幕之外，用户完全无法点击右侧的 **“暂停目标 / 修改目标 / 恢复 / 清除”** 按钮。
- **根因**：上挂工具条内的标题按钮默认没加缩容约束，Flex 布局下拒绝换行和收缩，顶翻了右侧兄弟按钮。
- **标准修法（必须成组保留）**：
  ```css
  /* 内部容器允许收缩至 0 且绝不超 100% */
  [data-composer-rail][class*="attached-"] :is(div, button[class*="text-codex-description"], span) {
    min-width: 0 !important;
    max-width: 100% !important;
  }
  /* 描述按钮自动省略号截断 */
  button[class*="text-codex-description"] {
    flex: 1 1 0% !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  /* 右侧功能操作按钮锁定不被压缩 */
  :is(button[aria-label*="目标"], button[aria-label*="清除"], button[aria-label*="恢复"], button[aria-label*="暂停"], button[aria-label*="编辑"]) {
    flex: 0 0 auto !important;
  }
  ```
- **反向防误伤坑**：首页 (`[role="main"]:has([data-testid="home-icon"])`) 上方 `[此计算机 | UI设计]` 两个下拉胶囊内的 `[class*="horizontal-scroll-fade-mask"]` 和 `ComposerDropdownLabelValue` 必须保持 `overflow: visible` 与 `flex-shrink: 0`，否则双标签会被截断隐藏只剩一个。

---

## 坑 3：“聊天 | 工作”分段切换器两态粘连、看不清当前在哪个窗口

- **踩坑现象**：如果滑块和背景槽透明度太接近、缺少明暗和高度差，两个按钮就像平铺在一块，看不清当前是“聊天”还是“工作”，切换动画也很生硬。
- **标准修法**：
  - 底层槽 (`mode-toggle-track` / `tablist`) 压低高度 (`34px`) + **内阴影加深凹陷**；
  - 激活指示器滑块 (`indicator-` / `[data-dream-lg-seg="1"]::before`) 抬高 (`40px`) + 高亮纯白微冰透渐变 + **1.5px 纯白实边与明显外投影**；
  - 选中按钮文字 `scale(1.06) font-weight: 600`，未选中按钮刻意 `opacity: .64~0.68 scale(.90)` 拉开反差；
  - 用独立阻尼弹簧驱动 `--ds-lg-seg-x` / `--ds-lg-seg-w` / `--ds-lg-seg-sx`。

---

## 坑 4：上方附着小托盘不够圆润，或与主输入框脱节

- **踩坑现象**：上方小胶囊如果和下方输入框等宽，或底角/顶角过方，会变成两块生硬堆叠的砖头。
- **标准修法**：
  - 上方托盘比下框**收窄 `36px`** (`width: calc(100% - 36px)`)；
  - 顶角 `24px` 圆润、底角 `16px`，底部负边距 `margin: 0 auto -22px auto` + 下 padding `20px` 藏入主框 (`z-index: 3`) 后肩；
  - 上框内多余原生套娃框全部清为 `transparent` / `border: 0`。

---

## 坑 5：Codex DOM 路由缓存污染、顶栏裁切与 `:has()` 性能陷阱

1. **旧路由隐藏 DOM 污染**：Codex 26.930+ 会在切页后把旧路由保留在 DOM 里并打上 `[data-app-shell-active-page="false"]`。任何 `querySelectorAll` 检索必须过滤掉 `!node.closest?.('[data-app-shell-active-page="false"]')`，否则会把后台旧页面识别成当前激活页。
2. **顶部标题栏 40px 避让**：悬浮晶岛侧边栏如果从 `y=0` 开始画，会被 `ApplicationMenuTopBar` 挡住或冲突。必须 `margin: 40px 0 8px 8px`、高度 `calc(100% - 48px)`。
3. **`:has()` 预编译替身属性**：直接把高频复杂 `:has(...)` 写进样式表会让 Chromium 在每次 hover 重新扫描整棵树。`renderer-inject.js` 内的 `CSS_PREDICATES` 会在注入时自动将其改写为 `data-dream-has-0..16` 属性并用节流后的 `MutationObserver` 维护，**修改 `dream-skin.css` 选择器时不得破坏该映射机制**。
4. **Pet Overlay / 隔离沙箱误注入排除**：不得向 `/avatar-overlay` 页面或非 `app://` 协议页面（如 `codex-sandbox://` iframe、外站 OAuth webview）注入皮肤。

---

## 坑 6：安全边界、零类名污染与商店签名规则

1. **严禁篡改 WindowsApps 安装目录**：`OpenAI.Codex` 由微软商店签名与 `TrustedInstaller` ACL 保护，**所有主题化只能通过本地回环 `127.0.0.1` CDP 注入实现**。
2. **零业务类名污染 (`businessClassPollution === 0`)**：绝对禁止给任何 Codex DOM 节点添加 `dream-*` 或 `codex-dream-skin*` CSS `class`，状态标识只能写 `data-dream-*` / `data-ds-*` 属性，且 CSS 注入优先使用 `document.adoptedStyleSheets`。
3. **主题包字符串转义防炸漏洞**：使用 `injector.mjs` 拼接前端 payload 时，`String.prototype.replace` 的第二参数必须传回调函数 `() => JSON.stringify(...)`，绝不能直接传字符串，否则主题名/副标题中包含 `$&`、`$$`、`` $` `` 时会触发 JS 语法截断崩溃。
4. **Windows 运行库同步 & UTF-8 坑**：
   - 运行目录 `CodexDreamSkin\engine\{assets,scripts}` 与安装包镜像 `Programs\CodexDreamSkin\payload\{assets,scripts}` 改完后**必须保持双端完全同步一致**；
   - PowerShell 5.1 默认读写 JSON 不加 `-Encoding UTF8` 会把中文主题名写成乱码或解析报错，凡处理带中文的 `theme.json` 务必显式使用 UTF-8 编码或交由 Node 读取。

---

## 坑 7：前端验证指标底线

任何改动收尾后，必须使用内置验证确认全部通过：
- `node --check` 校验 JS 无语法错误；
- `injector.mjs --self-test` 与 `--check-payload` 通过；
- 真机或测试窗口执行 `injector.mjs --verify`：要求 `installed: true`、`stylePresent: true`、`businessClassPollution: 0`、`structurePass: true`、`viewportPass: true`、`documentOverflow.x === false`、`pass: true`，且主界面、Home、Thread、Goal Mode、右键菜单和暗/浅模式均有真实截图目视核验。
