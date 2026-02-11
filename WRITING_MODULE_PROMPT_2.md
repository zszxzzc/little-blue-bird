# 小蓝鸟写作模块 - 实施指南（续）

> 接 WRITING_MODULE_PROMPT.md，本文件包含第六节补充 ~ 第十二节

---

## 六（补充）：人物系统详细规范

### 人物卡片渲染
```html
<div class="character-item" data-char-id="lingyuan">
  <span class="character-dot protagonist"></span>
  <span class="character-name">林渊</span>
  <span class="character-tag">主角</span>
  <span class="character-count">出场 47 次</span>
</div>
```

### 人物档案弹窗（点击人物名弹出）
字段：外貌、性格、能力、人际关系、出场章节（自动统计）。每个字段用 textarea，可编辑。

### 人物标记方式
- 正文中用 `@人物名` 标记，系统自动识别并统计出场次数
- 人物管理面板可手动添加/删除人物
- AI 辅助：保存章节时自动扫描正文，与 `characters.json` 匹配已有人物

---

## 六（补充）：伏笔追踪系统详细规范

**这是核心功能，必须做好。**

### 伏笔创建流程
1. 选中正文中一段文字
2. 点击工具栏「🧵 伏笔」按钮
3. 弹出对话框：伏笔描述（必填）、原文引用（自动填入选中文字）、预计回收章节（可选）
4. 保存到 `foreshadowing.json`

### 伏笔回收流程
1. 写到回收点时，选中相关文字
2. 右键 →「回收伏笔」
3. 弹出未回收伏笔列表，选择要回收的那条
4. 记录回收章节和回收引文

### 伏笔紧急度
- 🟢 绿色：埋下 < 5 章
- 🟡 黄色：埋下 5-10 章
- 🔴 红色：埋下 > 10 章（⚠️ 提醒）

### 伏笔条目渲染
```html
<!-- 未回收 -->
<div class="foreshadow-item active" data-fs-id="fs001">
  <div class="foreshadow-header">
    <span class="foreshadow-status urgent">🔴</span>
    <span class="foreshadow-source">第3章埋下</span>
    <span class="foreshadow-age">已过 9 章 ⚠️</span>
  </div>
  <div class="foreshadow-desc">林渊左手的黑色纹路</div>
  <div class="foreshadow-quote">"他低头看了一眼左手，那道黑色的纹路又蔓延了几分..."</div>
  <button class="btn-tiny" data-action="resolve">标记回收</button>
</div>

<!-- 已回收 -->
<div class="foreshadow-item resolved" data-fs-id="fs002">
  <span class="foreshadow-status done">✅</span>
  <span>第2章 → 第7章：断剑的来历</span>
</div>
```

---

## 七、底部状态栏

```html
<div class="writing-statusbar" id="writingStatusbar">
  <span class="ws-item" id="wsChapterCount">本章：0 字</span>
  <span class="ws-divider">|</span>
  <span class="ws-item" id="wsTotalCount">全书：0 字</span>
  <span class="ws-divider">|</span>
  <span class="ws-item" id="wsTodayCount">今日：0 字</span>
  <span class="ws-divider">|</span>
  <span class="ws-item" id="wsStreak">连续写作：0 天</span>
  <span class="ws-spacer"></span>
  <span class="ws-item ws-save-status" id="wsSaveStatus">已保存 ✓</span>
</div>
```

```css
.writing-statusbar {
  display: flex;
  align-items: center;
  padding: 4px 16px;
  font-size: 12px;
  color: var(--writing-text-secondary);
  border-top: 1px solid var(--border-color);
  gap: 8px;
}
.ws-spacer { flex: 1; }
.ws-save-status { color: var(--chapter-done); }
```

### 字数统计逻辑
```javascript
function countWords(text) {
  // 中文按字符数，英文按空格分词
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}
```

---

## 八、数据结构与 Rust 后端

### 文件存储结构
```
data/
├── activity/          # 已有
├── journal/           # 已有
└── writing/
    └── {book_id}/
        ├── meta.json
        ├── characters.json
        ├── worldbuilding.json
        ├── foreshadowing.json
        ├── chapters/
        │   ├── v1_c01.md
        │   ├── v1_c01.meta.json
        │   ├── v1_c02.md
        │   ├── v1_c02.meta.json
        │   └── ...
        └── snapshots/
            └── v1_c01/
                ├── 2026-02-11T14-30-00.md
                └── ...
```

### meta.json（书籍元数据）
```json
{
  "id": "qieming",
  "title": "窃命",
  "author": "用户名",
  "created": "2026-02-11",
  "volumes": [
    {
      "id": "v1",
      "title": "卷一：初入江湖",
      "chapters": [
        {
          "id": "v1_c01",
          "title": "第1章：少年",
          "status": "draft",
          "created": "2026-02-11",
          "updated": "2026-02-11T14:30:00"
        }
      ]
    }
  ]
}
```

### characters.json
```json
{
  "characters": [
    {
      "id": "lingyuan",
      "name": "林渊",
      "aliases": ["少年"],
      "role": "protagonist",
      "appearance": "...",
      "personality": "...",
      "abilities": "...",
      "relationships": [
        { "target": "sumuwan", "relation": "..." }
      ]
    }
  ]
}
```

### foreshadowing.json
```json
{
  "items": [
    {
      "id": "fs001",
      "description": "林渊左手的黑色纹路",
      "source_chapter": "v1_c03",
      "source_quote": "他低头看了一眼左手...",
      "created": "2026-02-11",
      "status": "active",
      "resolved_chapter": null,
      "resolved_quote": null,
      "resolved_date": null
    }
  ]
}
```

### v1_c01.meta.json（章节备忘）
```json
{
  "outline": "林渊进入北荒，遭遇赤鳞伏击",
  "mood": "紧张 → 绝望 → 反转",
  "notes": "这章要控制在4000字以内",
  "characters_mentioned": ["lingyuan", "chilin"],
  "word_count": 2847,
  "annotations": [
    {
      "id": "ann001",
      "start": 120,
      "end": 145,
      "text": "这里节奏太快了回头改"
    }
  ]
}
```
