# 小蓝鸟 - 写作模块实施指南

> 本文档是写作模块的完整设计与实施规范。按照优先级分阶段实现，每个阶段都要能独立运行。

---

## 一、项目现状

### 技术栈
- **前端**：vanilla JS + 单 HTML 文件（`src/index.html`），无框架无构建工具
- **后端**：Rust + Tauri 2，通过 `#[tauri::command]` 暴露 API
- **AI**：DeepSeek API（OpenAI 兼容协议），配置在 `config.json`
- **数据**：本地文件存储，`data/` 目录下按日期组织

### 现有模块
- `home.js` — 主页，含小鸡吉祥物 + 番茄钟
- `monitor.js` — 活动监测
- `journal.js` — 日记编辑
- `settings.js` — 设置面板
- `personality.js` — 性格系统（gentle/sarcastic/chuuni/shy）
- `app.js` — 路由和全局逻辑

### 现有导航结构
左侧 `nav-rail` 有三个按钮：主页、活动监测、今日日记。写作模块作为**第四个导航项**加入。

### 关键约定
- 所有页面都在 `index.html` 中作为 `<section class="page">` 存在
- 页面切换通过 `data-page` 属性和 JS 控制 `active` class
- Rust 命令在 `commands.rs` 注册，通过 `window.__TAURI__.core.invoke()` 调用
- CSS 全部在 `src/styles/main.css` 中（可以为写作模块新建 `writing.css`）

---

## 二、UI 风格规范

### 设计原则
- **与现有风格统一**：沿用项目已有的圆角、阴影、间距规范
- **安静透气**：大量留白，元素不挤
- **强调色**：`#4A9EE5`（小蓝鸟蓝），贯穿全局，已在项目中使用
- **编辑器区域要沉浸**：正文最大宽度 720px 居中，两侧留白

### 配色（沿用现有主题变量）
项目已有亮色/暗色切换，写作模块必须同时支持两套主题。使用 CSS 变量，不要硬编码颜色。

新增的语义色：
```css
:root {
  --writing-bg: #FFFFFF;           /* 编辑区背景 */
  --writing-text: #2C3E50;         /* 正文色 */
  --writing-text-secondary: #8B95A5;
  --foreshadow-active: #E8915A;    /* 未回收伏笔 */
  --foreshadow-urgent: #E25D5D;    /* 过期伏笔 */
  --foreshadow-done: #5CC6A0;      /* 已回收 */
  --chapter-draft: #F0AD4E;        /* 草稿状态 */
  --chapter-done: #5CC6A0;         /* 定稿状态 */
  --chapter-published: #4A9EE5;    /* 已发布 */
}

[data-theme="dark"] {
  --writing-bg: #22262E;
  --writing-text: #D4D8E0;
  --writing-text-secondary: #6B7280;
}
```

### 字体
```css
.writing-editor {
  font-family: "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif;
  font-size: 16px;
  line-height: 1.8;
}

.writing-ui {
  font-family: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
}
```

### 动画
- 面板展开/折叠：`200ms ease`
- hover 状态变化：`150ms ease`
- 小鸟动作：`300ms ease-in-out`
- 不要用弹跳、闪烁等花哨动画

---

## 三、整体布局

```
┌─────────┬──────────────────────────┬──────────┐
│         │        工具栏             │          │
│ 结构树   │─────────────────────────│ 信息面板  │
│         │                          │          │
│ 卷/章   │     编辑器（居中720px）    │ 人物/伏笔 │
│         │                          │ /设定/备忘 │
│         │                          │          │
│         │─────────────────────────│          │
│         │   状态栏（字数/进度）      │          │
└─────────┴──────────────────────────┴──────────┘
         ↑ 小鸟浮在编辑器右上角区域
```

### HTML 结构
```html
<!-- 在 index.html 的 nav-rail 中新增按钮 -->
<button class="nav-btn" data-page="writing" title="写作">
  <span class="nav-icon">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  </span>
  <span class="nav-label">写作</span>
</button>

<!-- 写作页面 section -->
<section class="page" id="page-writing">
  <div class="writing-layout">
    <!-- 左：结构树 -->
    <aside class="writing-sidebar-left" id="writingStructure">
      <!-- 内容见第四节 -->
    </aside>

    <!-- 中：编辑器 -->
    <div class="writing-main">
      <div class="writing-toolbar" id="writingToolbar">
        <!-- 内容见第五节 -->
      </div>
      <div class="writing-editor-wrap">
        <div class="writing-bird" id="writingBird">
          <!-- 小鸟，见第九节 -->
        </div>
        <textarea class="writing-editor" id="writingEditor"
                  placeholder="开始写作..."></textarea>
      </div>
      <div class="writing-statusbar" id="writingStatusbar">
        <!-- 内容见第七节 -->
      </div>
    </div>

    <!-- 右：信息面板 -->
    <aside class="writing-sidebar-right" id="writingInfoPanel">
      <!-- 内容见第六节 -->
    </aside>
  </div>
</section>
```

### CSS 布局
```css
.writing-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.writing-sidebar-left {
  width: 220px;
  min-width: 180px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
}

.writing-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;  /* 小鸟定位的参考 */
}

.writing-editor-wrap {
  flex: 1;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: 24px;
}

.writing-editor {
  max-width: 720px;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--writing-text);
  font-family: "Noto Serif CJK SC", serif;
  font-size: 16px;
  line-height: 1.8;
}

.writing-sidebar-right {
  width: 280px;
  min-width: 240px;
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
  transition: width 200ms ease, opacity 200ms ease;
}

.writing-sidebar-right.collapsed {
  width: 0;
  opacity: 0;
  overflow: hidden;
}
```

---

## 四、左侧结构树

### 功能描述
树形展示作品的卷→章结构，支持新建、重命名、拖拽排序、状态标记。

### HTML 结构
```html
<aside class="writing-sidebar-left" id="writingStructure">
  <div class="writing-tree-header">
    <span class="writing-tree-title">作品目录</span>
    <button class="writing-tree-add" id="addVolumeBtn" title="新建卷">+</button>
  </div>
  <div class="writing-tree" id="writingTree">
    <!-- JS 动态渲染 -->
  </div>
  <div class="writing-tree-footer">
    <button class="tree-settings-btn" id="openSettingsDoc">📖 设定集</button>
  </div>
</aside>
```

### 树节点渲染示例
```html
<div class="tree-volume" data-volume-id="v1">
  <div class="tree-volume-header">
    <span class="tree-toggle">▸</span>
    <span class="tree-volume-name">卷一：初入江湖</span>
    <button class="tree-action" title="新建章节">+</button>
  </div>
  <div class="tree-chapters">
    <div class="tree-chapter active" data-chapter-id="v1_c01">
      <span class="tree-status-dot draft"></span>
      <span class="tree-chapter-name">第1章：少年</span>
    </div>
  </div>
</div>
```

### 状态标记
章节名前的小圆点：
- `.empty` → `var(--writing-text-secondary)` 未开始
- `.draft` → `var(--chapter-draft)` 草稿
- `.done` → `var(--chapter-done)` 定稿
- `.published` → `var(--chapter-published)` 已发布

### 交互行为
1. **点击章节** → 编辑器加载该章内容，右侧面板更新
2. **双击章节名** → inline 重命名
3. **右键** → 上下文菜单（重命名、修改状态、删除、上移/下移）
4. **点击 ▸** → 展开/折叠卷
5. **当前章节** → 左边 3px 蓝色竖线高亮
6. **拖拽** → 卷内排序 + 跨卷移动

---

## 五、编辑器工具栏

### HTML
```html
<div class="writing-toolbar" id="writingToolbar">
  <div class="toolbar-left">
    <button class="toolbar-btn" id="writingBoldBtn" title="加粗 Ctrl+B">
      <strong>B</strong>
    </button>
    <button class="toolbar-btn" id="writingItalicBtn" title="斜体 Ctrl+I">
      <em>I</em>
    </button>
    <span class="toolbar-divider"></span>
    <button class="toolbar-btn" id="writingTodoBtn" title="插入 TODO">
      📌 TODO
    </button>
    <button class="toolbar-btn" id="writingNoteBtn" title="插入批注">
      💬 批注
    </button>
    <button class="toolbar-btn" id="writingForeshadowBtn" title="标记伏笔">
      🧵 伏笔
    </button>
  </div>
  <div class="toolbar-right">
    <button class="toolbar-btn" id="writingFocusBtn" title="专注模式">
      ⛶ 专注
    </button>
    <button class="toolbar-btn" id="writingPanelToggle" title="切换信息面板">
      ☰ 面板
    </button>
  </div>
</div>
```

### 功能说明
1. **加粗/斜体** — 选中文字后点击，用 markdown 语法包裹（`**text**` / `*text*`）
2. **TODO** — 在光标处插入 `[TODO: 描述]`，高亮显示（黄色背景 + 虚线边框）
3. **批注** — 选中文字后弹出小输入框，输入批注内容，存储在章节 meta 中，正文右侧显示小气泡
4. **伏笔** — 选中文字后弹出对话框，填写伏笔描述，存入 `foreshadowing.json`
5. **专注模式** — 隐藏左右面板 + 工具栏，只留编辑器，按 Esc 退出
6. **面板切换** — 展开/折叠右侧信息面板

### 自动保存
```javascript
// 每 30 秒自动保存 + 失焦时保存
let autoSaveTimer = null;
const AUTOSAVE_INTERVAL = 30000;

writingEditor.addEventListener('input', () => {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveCurrentChapter(), AUTOSAVE_INTERVAL);
  updateWordCount();
});

writingEditor.addEventListener('blur', () => {
  saveCurrentChapter();
});
```

### TODO 高亮渲染
编辑器使用 textarea，但在其下方叠一层 `<div>` 做语法高亮（类似 CodeMirror 的 overlay 思路）：
```css
.writing-todo-highlight {
  background: rgba(240, 173, 78, 0.15);
  border: 1px dashed var(--chapter-draft);
  border-radius: 3px;
  padding: 0 2px;
}
```

如果实现复杂度太高，第一版可以先不做 overlay 高亮，只在预览模式中渲染 TODO 样式。

---

## 六、右侧信息面板

### 结构
四个 tab 页，用底部细线标识当前 tab：

```html
<aside class="writing-sidebar-right" id="writingInfoPanel">
  <div class="info-tabs">
    <button class="info-tab active" data-tab="characters">人物</button>
    <button class="info-tab" data-tab="foreshadow">伏笔</button>
    <button class="info-tab" data-tab="settings-doc">设定</button>
    <button class="info-tab" data-tab="chapter-memo">备忘</button>
  </div>

  <!-- Tab 1: 本章人物 -->
  <div class="info-content active" id="tabCharacters">
    <div class="info-section-title">本章出场人物</div>
    <div class="character-list" id="chapterCharacters">
      <!-- JS 动态渲染 -->
    </div>
    <button class="btn-small" id="manageCharactersBtn">管理全部人物</button>
  </div>

  <!-- Tab 2: 伏笔追踪 -->
  <div class="info-content" id="tabForeshadow">
    <div class="info-section-title">未回收伏笔</div>
    <div class="foreshadow-list" id="activeForeshadows">
      <!-- JS 动态渲染 -->
    </div>
    <div class="info-section-title">已回收</div>
    <div class="foreshadow-list" id="resolvedForeshadows"></div>
  </div>

  <!-- Tab 3: 设定速查 -->
  <div class="info-content" id="tabSettingsDoc">
    <input type="text" class="info-search" id="settingsSearch"
           placeholder="搜索设定...">
    <div class="settings-doc-list" id="settingsDocList"></div>
  </div>

  <!-- Tab 4: 章节备忘 -->
  <div class="info-content" id="tabChapterMemo">
    <label class="info-label">本章大纲</label>
    <textarea class="info-textarea" id="chapterOutline"
              placeholder="这章要写什么..."></textarea>
    <label class="info-label">情绪基调</label>
    <input type="text" class="info-input" id="chapterMood"
           placeholder="如：紧张 → 绝望 → 反转">
    <label class="info-label">写作笔记</label>
    <textarea class="info-textarea" id="chapterNotes"
              placeholder="随手记..."></textarea>
  </div>
</aside>
```
