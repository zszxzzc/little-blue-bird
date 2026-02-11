# 小蓝鸟 - 功能扩展实现指南（Part 2：词汇拾取 + 灵感炼金 + 收藏馆 + 现有功能增强）

## 项目背景

同 FEATURE_PROMPT_1.md，不再重复。请先阅读该文件了解代码模式。

---

## 功能三：英语词汇拾取（P2）

### 概述
检测到用户在英文相关应用停留较久时，从窗口标题中提取英文词汇，用 AI 生成风格化例句，形成"今日拾取道具"。

### 实现思路（简化版）
不做剪贴板监听或辅助功能 API，只从 `activity.rs` 已有的窗口标题数据中提取英文单词。

### 数据结构

文件：`data/vocab/2026-02-11.json`

```json
{
  "date": "2026-02-11",
  "words": [
    {
      "word": "authentication",
      "source": "Chrome - JWT Authentication Guide",
      "examples": [
        { "style": "日常", "text": "The app requires two-factor authentication." },
        { "style": "网文", "text": "\"认证失败，\" 系统冰冷地宣告，\"入侵者，你的authentication已过期。\"" },
        { "style": "程序员", "text": "又是authentication的锅，token过期了都不告诉我。" }
      ]
    }
  ],
  "generated": false
}
```

### Rust 后端

新建 `src-tauri/src/vocab.rs`：

```rust
use crate::activity;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabDay {
    pub date: String,
    pub words: Vec<VocabWord>,
    pub generated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabWord {
    pub word: String,
    pub source: String,
    pub examples: Vec<VocabExample>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabExample {
    pub style: String,
    pub text: String,
}

/// 从窗口标题中提取英文单词（4字母以上，排除常见词）
pub fn extract_words(data_dir: &PathBuf, date: &str) -> Vec<(String, String)> {
    let entries = activity::load_entries(data_dir, date);
    let stop_words: HashSet<&str> = [
        "the","and","for","are","but","not","you","all","can","had","her",
        "was","one","our","out","with","that","this","from","have","been",
        "will","your","what","when","them","than","each","make","like",
        "just","over","such","take","into","most","also","back","after",
        "file","edit","view","help","home","page","new","open","save",
        "close","window","untitled","chrome","edge","firefox","code",
    ].iter().cloned().collect();

    let mut seen = HashSet::new();
    let mut results = Vec::new();

    for entry in &entries {
        let title = &entry.title;
        // 提取英文单词（4字母以上）
        for word in title.split(|c: char| !c.is_ascii_alphabetic()) {
            let lower = word.to_lowercase();
            if lower.len() >= 4 && !stop_words.contains(lower.as_str()) && !seen.contains(&lower) {
                seen.insert(lower.clone());
                results.push((lower, title.clone()));
            }
        }
    }
    // 最多取 10 个
    results.truncate(10);
    results
}

pub fn load(data_dir: &PathBuf, date: &str) -> Option<VocabDay> {
    let path = data_dir.join("vocab").join(format!("{}.json", date));
    if !path.exists() { return None; }
    fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok())
}

pub fn save(data_dir: &PathBuf, day: &VocabDay) -> Result<(), String> {
    let dir = data_dir.join("vocab");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", day.date));
    let json = serde_json::to_string_pretty(day).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
```

### commands.rs 新增

```rust
use crate::vocab;

#[tauri::command]
pub fn get_today_vocab() -> Result<Option<vocab::VocabDay>, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(vocab::load(&get_data_dir(), &today))
}

#[tauri::command]
pub fn extract_today_words() -> Result<Vec<(String, String)>, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(vocab::extract_words(&get_data_dir(), &today))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn generate_vocab_examples(date: String, words: Vec<(String, String)>, app: AppHandle) -> Result<String, String> {
    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }

    let mut word_list = String::new();
    for (word, source) in &words {
        word_list.push_str(&format!("- {} (来源: {})\n", word, source));
    }

    let system_prompt = "你是一个英语学习助手。为每个英文单词生成3种风格的例句。\n\
        输出 JSON 数组格式，每个元素：{\"word\":\"xxx\",\"examples\":[{\"style\":\"日常\",\"text\":\"...\"},{\"style\":\"网文\",\"text\":\"...\"},{\"style\":\"程序员\",\"text\":\"...\"}]}\n\
        网文风格要有中二感，程序员风格要有吐槽感。只输出 JSON，不要其他内容。";

    let user_msg = format!("请为以下单词生成例句：\n{}", word_list);
    claude_api::call_api_stream(&app, &cfg.api_key, &cfg.model, system_prompt, &user_msg).await
}
```

在 `main.rs` 加 `mod vocab;`，在 `invoke_handler` 注册三个命令。

### 前端 - 词汇拾取

在主页社交能量条下方加一个"今日拾取"卡片：

```html
<!-- 英语词汇拾取（加在 socialEnergy 后面） -->
<div class="vocab-card" id="vocabCard" style="display:none">
  <div class="goal-header">
    <span class="goal-label">📦 今日拾取</span>
    <button class="btn-small" id="vocabGenBtn">生成例句</button>
  </div>
  <div class="vocab-list" id="vocabList"></div>
</div>
```

CSS：
```css
.vocab-card { margin-top: 12px; padding: 12px 16px; background: var(--card-bg); border-radius: 12px; }
.vocab-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.vocab-item { padding: 8px 12px; background: var(--bg); border-radius: 8px; }
.vocab-word { font-weight: 600; color: var(--accent, #4A9EE5); font-size: 15px; }
.vocab-source { font-size: 11px; color: var(--text-secondary); }
.vocab-examples { margin-top: 6px; font-size: 13px; line-height: 1.6; }
.vocab-style { font-weight: 500; color: var(--text-secondary); margin-right: 4px; }
```

JS 逻辑写在 `home.js` 中：页面加载时调用 `extract_today_words`，有词汇就显示卡片，点击"生成例句"调用 AI。

---

## 功能四：灵感炼金术（P2）

### 概述
提供一个轻量的"灵感速记"入口，用户随时记录零散想法。积累一定数量后，用 AI 做聚类合成，给出"炼金配方"：A灵感+B情绪+C场景→一个可用的段落或设定。

### 实现思路
分两部分：
1. **灵感速记**：独立的快速笔记 CRUD，不依赖日记系统
2. **炼金合成**：AI 分析已有灵感，找出关联，生成合成结果

### 数据结构

文件：`data/inspiration/notes.json`

```json
{
  "notes": [
    {
      "id": 1,
      "text": "如果记忆可以交易，穷人卖快乐记忆换钱",
      "tags": ["设定", "赛博朋克"],
      "mood": "兴奋",
      "created_at": "2026-02-11T14:30:00",
      "used": false
    }
  ],
  "next_id": 2
}
```

文件：`data/inspiration/recipes.json`

```json
{
  "recipes": [
    {
      "id": 1,
      "title": "记忆黑市",
      "ingredients": [1, 3, 5],
      "result": "（AI 生成的合成段落）",
      "created_at": "2026-02-11T22:00:00"
    }
  ]
}
```

### Rust 后端

新建 `src-tauri/src/inspiration.rs`：

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteStore {
    pub notes: Vec<InspirationNote>,
    pub next_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspirationNote {
    pub id: u32,
    pub text: String,
    pub tags: Vec<String>,
    pub mood: String,
    pub created_at: String,
    pub used: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeStore {
    pub recipes: Vec<Recipe>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recipe {
    pub id: u32,
    pub title: String,
    pub ingredients: Vec<u32>,  // note ids
    pub result: String,
    pub created_at: String,
}

fn notes_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("inspiration").join("notes.json")
}

fn recipes_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("inspiration").join("recipes.json")
}

pub fn load_notes(data_dir: &PathBuf) -> NoteStore {
    let path = notes_path(data_dir);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(NoteStore { notes: vec![], next_id: 1 })
    } else {
        NoteStore { notes: vec![], next_id: 1 }
    }
}

pub fn save_notes(data_dir: &PathBuf, store: &NoteStore) -> Result<(), String> {
    let dir = data_dir.join("inspiration");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(notes_path(data_dir), json).map_err(|e| e.to_string())
}

pub fn add_note(data_dir: &PathBuf, text: String, tags: Vec<String>, mood: String) -> Result<InspirationNote, String> {
    let mut store = load_notes(data_dir);
    let note = InspirationNote {
        id: store.next_id,
        text, tags, mood,
        created_at: chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        used: false,
    };
    store.next_id += 1;
    store.notes.push(note.clone());
    save_notes(data_dir, &store)?;
    Ok(note)
}

pub fn delete_note(data_dir: &PathBuf, id: u32) -> Result<(), String> {
    let mut store = load_notes(data_dir);
    store.notes.retain(|n| n.id != id);
    save_notes(data_dir, &store)
}

pub fn load_recipes(data_dir: &PathBuf) -> Vec<Recipe> {
    let path = recipes_path(data_dir);
    if !path.exists() { return vec![]; }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<RecipeStore>(&s).ok())
        .map(|s| s.recipes)
        .unwrap_or_default()
}

pub fn save_recipe(data_dir: &PathBuf, recipe: &Recipe) -> Result<(), String> {
    let dir = data_dir.join("inspiration");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut recipes = load_recipes(data_dir);
    recipes.push(recipe.clone());
    let store = RecipeStore { recipes };
    let json = serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?;
    fs::write(recipes_path(data_dir), json).map_err(|e| e.to_string())
}

/// 标记灵感为已使用
pub fn mark_used(data_dir: &PathBuf, ids: &[u32]) -> Result<(), String> {
    let mut store = load_notes(data_dir);
    for note in &mut store.notes {
        if ids.contains(&note.id) { note.used = true; }
    }
    save_notes(data_dir, &store)
}
```

### commands.rs 新增

```rust
use crate::inspiration;

#[tauri::command]
pub fn get_inspiration_notes() -> Result<Vec<inspiration::InspirationNote>, String> {
    let store = inspiration::load_notes(&get_data_dir());
    Ok(store.notes)
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_inspiration(text: String, tags: Vec<String>, mood: String) -> Result<inspiration::InspirationNote, String> {
    inspiration::add_note(&get_data_dir(), text, tags, mood)
}

#[tauri::command]
pub fn delete_inspiration(id: u32) -> Result<(), String> {
    inspiration::delete_note(&get_data_dir(), id)
}

#[tauri::command]
pub fn get_alchemy_recipes() -> Result<Vec<inspiration::Recipe>, String> {
    Ok(inspiration::load_recipes(&get_data_dir()))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn alchemy_synthesize(note_ids: Vec<u32>, app: AppHandle) -> Result<String, String> {
    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }
    let data_dir = get_data_dir();
    let store = inspiration::load_notes(&data_dir);

    // 收集选中的灵感
    let selected: Vec<&inspiration::InspirationNote> = store.notes.iter()
        .filter(|n| note_ids.contains(&n.id))
        .collect();

    if selected.len() < 2 {
        return Err("至少选择 2 条灵感进行炼金".to_string());
    }

    let mut material = String::new();
    for n in &selected {
        material.push_str(&format!("- [{}] {} (情绪: {}, 标签: {})\n",
            n.id, n.text, n.mood, n.tags.join("/")));
    }

    let persona = crate::personality::get(&cfg.personality);
    let system_prompt = format!(
        "{}\n你是一个灵感炼金师。将用户提供的零散灵感碎片合成为一段完整的、可用的创作素材。\n\
         要求：\n\
         - 找出灵感之间的隐藏关联\n\
         - 合成一个有趣的设定/场景/段落（200-400字）\n\
         - 给合成结果起一个标题\n\
         - 输出格式：第一行是标题，空一行后是正文\n\
         - 用中文",
        persona.ai_persona
    );

    let user_msg = format!("请将以下灵感碎片炼金合成：\n{}", material);
    claude_api::call_api_stream(&app, &cfg.api_key, &cfg.model, &system_prompt, &user_msg).await
}
```

在 `main.rs` 加 `mod inspiration;`，在 `invoke_handler` 注册五个命令。

### 前端 - 导航按钮

在 `index.html` 的 `nav-rail` 中，世界观按钮后面加：

```html
<button class="nav-btn" data-page="inspiration" title="灵感炼金">
  <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 12 18.469c-.874 0-1.71-.346-2.328-.964l-.548-.547z"/></svg></span><span class="nav-label">灵感</span>
</button>
```

### 前端 - 页面结构

在世界观 section 后面加新 section：

```html
<section class="page" id="page-inspiration">
  <div class="inspiration-container">
    <div class="inspiration-header">
      <h2 class="world-title">灵感炼金术</h2>
      <span class="inspiration-count" id="inspirationCount">0 条灵感</span>
    </div>

    <!-- 快速记录 -->
    <div class="inspiration-input-card">
      <textarea id="inspirationInput" class="inspiration-textarea" placeholder="闪过一个想法？快记下来..." rows="2"></textarea>
      <div class="inspiration-input-row">
        <div class="inspiration-tags">
          <button class="tag-btn" data-tag="设定">设定</button>
          <button class="tag-btn" data-tag="人物">人物</button>
          <button class="tag-btn" data-tag="情节">情节</button>
          <button class="tag-btn" data-tag="对白">对白</button>
          <button class="tag-btn" data-tag="随想">随想</button>
        </div>
        <button class="btn-green btn-small" id="addInspirationBtn">记录</button>
      </div>
    </div>

    <!-- 灵感列表 -->
    <div class="section-title">灵感碎片</div>
    <div class="inspiration-list" id="inspirationList">
      <div class="empty-hint">还没有灵感，随时记录你的想法</div>
    </div>

    <!-- 炼金区 -->
    <div class="alchemy-section">
      <div class="section-title">炼金工坊</div>
      <div class="alchemy-hint">选择 2-5 条灵感，点击炼金合成</div>
      <button class="btn-primary btn-small" id="alchemyBtn" disabled>开始炼金</button>
      <div class="alchemy-result" id="alchemyResult" style="display:none">
        <div class="alchemy-result-title" id="alchemyTitle"></div>
        <div class="alchemy-result-text" id="alchemyText"></div>
      </div>
    </div>

    <!-- 历史配方 -->
    <div class="recipe-section" id="recipeSection" style="display:none">
      <div class="section-title">炼金记录</div>
      <div class="recipe-list" id="recipeList"></div>
    </div>
  </div>
</section>
```

### 前端 - CSS（加到 main.css 末尾）

```css
/* === 灵感炼金术 === */
.inspiration-container { padding: 24px; max-width: 800px; margin: 0 auto; }
.inspiration-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px; }
.inspiration-count { font-size: 13px; color: var(--text-secondary); }

.inspiration-input-card {
  background: var(--card-bg); border-radius: 12px; padding: 16px; margin-bottom: 24px;
}
.inspiration-textarea {
  width: 100%; border: none; background: transparent; resize: none;
  font-size: 14px; line-height: 1.6; color: var(--text-primary);
  font-family: inherit; outline: none;
}
.inspiration-input-row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.inspiration-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.tag-btn {
  padding: 4px 10px; border-radius: 12px; font-size: 12px;
  background: var(--bg); border: 1px solid var(--border-color);
  color: var(--text-secondary); cursor: pointer; transition: all 0.2s;
}
.tag-btn.active { background: var(--accent, #4A9EE5); color: white; border-color: var(--accent, #4A9EE5); }

.inspiration-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
.inspiration-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 16px; background: var(--card-bg); border-radius: 10px;
  cursor: pointer; transition: all 0.2s; border: 2px solid transparent;
}
.inspiration-item.selected { border-color: var(--accent, #4A9EE5); }
.inspiration-item-text { flex: 1; font-size: 14px; line-height: 1.5; }
.inspiration-item-meta { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
.inspiration-item-delete { opacity: 0; cursor: pointer; color: var(--text-secondary); font-size: 16px; }
.inspiration-item:hover .inspiration-item-delete { opacity: 1; }

.alchemy-section { margin-bottom: 24px; }
.alchemy-hint { font-size: 13px; color: var(--text-secondary); margin: 8px 0; }
.alchemy-result {
  margin-top: 16px; padding: 20px; background: var(--card-bg);
  border-radius: 12px; border: 1px solid var(--accent, #4A9EE5);
}
.alchemy-result-title { font-size: 16px; font-weight: 600; color: var(--accent, #4A9EE5); margin-bottom: 12px; }
.alchemy-result-text { font-size: 14px; line-height: 1.8; white-space: pre-wrap; }

.recipe-list { display: flex; flex-direction: column; gap: 10px; }
.recipe-item { padding: 12px 16px; background: var(--card-bg); border-radius: 10px; cursor: pointer; }
.recipe-item-title { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.recipe-item-date { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
```

### 前端 - JS（新建 `src/scripts/inspiration.js`）

```js
// inspiration.js - 灵感炼金术
(function() {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  let selectedTags = [];
  let selectedNoteIds = new Set();
  let allNotes = [];

  // 页面激活时加载
  window.addEventListener('page-change', (e) => {
    if (e.detail === 'inspiration') loadNotes();
  });

  // 标签切换
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const tag = btn.dataset.tag;
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter(t => t !== tag);
      } else {
        selectedTags.push(tag);
      }
    });
  });

  // 添加灵感
  document.getElementById('addInspirationBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('inspirationInput');
    const text = input.value.trim();
    if (!text) return;
    try {
      await invoke('add_inspiration', { text, tags: [...selectedTags], mood: '默认' });
      input.value = '';
      selectedTags = [];
      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
      loadNotes();
    } catch(e) { console.error(e); }
  });

  async function loadNotes() {
    try {
      allNotes = await invoke('get_inspiration_notes');
      renderNotes();
      document.getElementById('inspirationCount').textContent = `${allNotes.length} 条灵感`;

      const recipes = await invoke('get_alchemy_recipes');
      renderRecipes(recipes);
    } catch(e) { console.error(e); }
  }

  function renderNotes() {
    const list = document.getElementById('inspirationList');
    if (allNotes.length === 0) {
      list.innerHTML = '<div class="empty-hint">还没有灵感，随时记录你的想法</div>';
      return;
    }
    list.innerHTML = allNotes.slice().reverse().map(n => `
      <div class="inspiration-item ${selectedNoteIds.has(n.id) ? 'selected' : ''}"
           data-id="${n.id}" onclick="window._toggleNote(${n.id})">
        <div>
          <div class="inspiration-item-text">${escapeHtml(n.text)}</div>
          <div class="inspiration-item-meta">
            ${n.tags.map(t => `<span class="tag-btn">${t}</span>`).join(' ')}
            · ${n.created_at.slice(0, 16)}
            ${n.used ? ' · 已使用' : ''}
          </div>
        </div>
        <span class="inspiration-item-delete" onclick="event.stopPropagation();window._deleteNote(${n.id})">×</span>
      </div>
    `).join('');
    updateAlchemyBtn();
  }

  window._toggleNote = function(id) {
    if (selectedNoteIds.has(id)) selectedNoteIds.delete(id);
    else if (selectedNoteIds.size < 5) selectedNoteIds.add(id);
    renderNotes();
  };

  window._deleteNote = async function(id) {
    try {
      await invoke('delete_inspiration', { id });
      selectedNoteIds.delete(id);
      loadNotes();
    } catch(e) { console.error(e); }
  };

  function updateAlchemyBtn() {
    const btn = document.getElementById('alchemyBtn');
    btn.disabled = selectedNoteIds.size < 2;
    btn.textContent = selectedNoteIds.size > 0
      ? `开始炼金（已选 ${selectedNoteIds.size} 条）`
      : '开始炼金';
  }

  // 炼金合成
  document.getElementById('alchemyBtn')?.addEventListener('click', async () => {
    const ids = [...selectedNoteIds];
    const resultDiv = document.getElementById('alchemyResult');
    const titleEl = document.getElementById('alchemyTitle');
    const textEl = document.getElementById('alchemyText');
    resultDiv.style.display = '';
    titleEl.textContent = '炼金中…';
    textEl.textContent = '';

    let fullText = '';
    const unlisten = await listen('ai-chunk', (e) => {
      fullText += e.payload;
      textEl.textContent = fullText;
    });
    const unlistenDone = await listen('ai-done', () => {
      unlisten(); unlistenDone();
      // 解析标题（第一行）
      const lines = fullText.split('\n');
      const title = lines[0].replace(/^#+\s*/, '').trim();
      const body = lines.slice(1).join('\n').trim();
      titleEl.textContent = title || '炼金结果';
      textEl.textContent = body || fullText;
      selectedNoteIds.clear();
      renderNotes();
    });

    try {
      await invoke('alchemy_synthesize', { note_ids: ids });
    } catch(err) {
      titleEl.textContent = '炼金失败';
      textEl.textContent = err;
      unlisten(); unlistenDone();
    }
  });

  function renderRecipes(recipes) {
    const section = document.getElementById('recipeSection');
    const list = document.getElementById('recipeList');
    if (!recipes || recipes.length === 0) { section.style.display = 'none'; return; }
    section.style.display = '';
    list.innerHTML = recipes.slice().reverse().map(r => `
      <div class="recipe-item" onclick="this.querySelector('.recipe-item-body').style.display=this.querySelector('.recipe-item-body').style.display==='none'?'':'none'">
        <div class="recipe-item-title">${escapeHtml(r.title)}</div>
        <div class="recipe-item-date">${r.created_at.slice(0, 16)}</div>
        <div class="recipe-item-body" style="display:none;margin-top:8px;font-size:13px;line-height:1.6;white-space:pre-wrap">${escapeHtml(r.result)}</div>
      </div>
    `).join('');
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
```

在 `index.html` 底部 `</body>` 前加 `<script src="scripts/inspiration.js"></script>`

---

## 功能五：小蓝鸟收藏馆（P2）

### 概述
把长期积累的数据变成可逛的"博物馆"界面——常用工具展柜、灵感标本、年度关键词云、成就墙。纯前端聚合展示，不需要新的 Rust 模块，复用已有命令获取数据。

### 实现思路
收藏馆是一个只读的数据可视化页面，调用已有的后端命令聚合数据，前端渲染为展馆风格。不需要新建 `.rs` 文件。

### 前端 - 导航按钮

在灵感按钮后面加：

```html
<button class="nav-btn" data-page="museum" title="收藏馆">
  <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg></span><span class="nav-label">收藏馆</span>
</button>
```

### 前端 - 页面结构

```html
<section class="page" id="page-museum">
  <div class="museum-container">
    <div class="museum-header">
      <h2 class="world-title">小蓝鸟收藏馆</h2>
      <span class="museum-subtitle" id="museumSubtitle">记录你的数字足迹</span>
    </div>

    <!-- 总览统计 -->
    <div class="museum-stats" id="museumStats">
      <div class="museum-stat-card">
        <div class="museum-stat-value" id="msTotalDays">0</div>
        <div class="museum-stat-label">使用天数</div>
      </div>
      <div class="museum-stat-card">
        <div class="museum-stat-value" id="msTotalHours">0</div>
        <div class="museum-stat-label">总记录时长(h)</div>
      </div>
      <div class="museum-stat-card">
        <div class="museum-stat-value" id="msJournalCount">0</div>
        <div class="museum-stat-label">日记篇数</div>
      </div>
      <div class="museum-stat-card">
        <div class="museum-stat-value" id="msMemeCount">0</div>
        <div class="museum-stat-label">共同梗</div>
      </div>
    </div>

    <!-- 常用工具展柜 -->
    <div class="museum-section">
      <div class="section-title">常用工具展柜</div>
      <div class="museum-tools" id="museumTools">
        <div class="empty-hint">加载中…</div>
      </div>
    </div>

    <!-- 关键词云 -->
    <div class="museum-section">
      <div class="section-title">日记关键词</div>
      <div class="museum-wordcloud" id="museumWordcloud">
        <div class="empty-hint">需要积累更多日记</div>
      </div>
    </div>

    <!-- 梗库精选 -->
    <div class="museum-section">
      <div class="section-title">梗库精选</div>
      <div class="museum-memes" id="museumMemes">
        <div class="empty-hint">暂无梗</div>
      </div>
    </div>
  </div>
</section>
```

### 前端 - CSS（加到 main.css 末尾）

```css
/* === 收藏馆 === */
.museum-container { padding: 24px; max-width: 800px; margin: 0 auto; }
.museum-header { margin-bottom: 24px; }
.museum-subtitle { font-size: 13px; color: var(--text-secondary); }
.museum-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px;
}
.museum-stat-card {
  background: var(--card-bg); border-radius: 12px; padding: 16px; text-align: center;
}
.museum-stat-value { font-size: 28px; font-weight: 700; color: var(--accent, #4A9EE5); }
.museum-stat-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.museum-section { margin-bottom: 28px; }
.museum-tools {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;
}
.museum-tool-card {
  background: var(--card-bg); border-radius: 10px; padding: 14px 12px; text-align: center;
}
.museum-tool-icon { font-size: 28px; margin-bottom: 6px; }
.museum-tool-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.museum-tool-hours { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
.museum-wordcloud {
  display: flex; flex-wrap: wrap; gap: 8px; padding: 16px;
  background: var(--card-bg); border-radius: 12px; min-height: 80px;
  align-items: center; justify-content: center;
}
.museum-word {
  padding: 4px 10px; border-radius: 12px;
  background: var(--bg); color: var(--text-primary); cursor: default;
}
.museum-memes { display: flex; flex-direction: column; gap: 8px; }
.museum-meme-card {
  padding: 12px 16px; background: var(--card-bg); border-radius: 10px;
  font-size: 14px; color: var(--text-primary);
}
```

### 前端 - JS（新建 `src/scripts/museum.js`）

```js
// museum.js - 小蓝鸟收藏馆
(function() {
  const { invoke } = window.__TAURI__.core;

  window.addEventListener('page-change', (e) => {
    if (e.detail === 'museum') loadMuseum();
  });

  async function loadMuseum() {
    try {
      // 并行加载所有数据
      const [journals, memes, totals, summary] = await Promise.all([
        invoke('list_journal_dates'),
        invoke('get_memes'),
        invoke('get_daily_totals', { days: 365 }),
        invoke('get_range_summary', { days: 365 }),
      ]);

      // 总览统计
      document.getElementById('msTotalDays').textContent = totals.length;
      const totalSec = totals.reduce((s, [_, sec]) => s + sec, 0);
      document.getElementById('msTotalHours').textContent = Math.round(totalSec / 3600);
      document.getElementById('msJournalCount').textContent = journals.length;
      document.getElementById('msMemeCount').textContent = memes.length;

      // 常用工具展柜（按时长排序前 8）
      renderTools(summary);
      // 梗库精选
      renderMemes(memes);
      // 关键词云（从日记标题/内容提取）
      renderWordcloud(journals);
    } catch(e) { console.error('收藏馆加载失败:', e); }
  }

  function renderTools(summary) {
    const el = document.getElementById('museumTools');
    if (!summary || summary.length === 0) {
      el.innerHTML = '<div class="empty-hint">暂无数据</div>';
      return;
    }
    // summary 是 [(category, seconds)] 数组
    const sorted = summary.sort((a, b) => b[1] - a[1]).slice(0, 8);
    const icons = {
      '编程': '💻', '浏览器': '🌐', '游戏': '🎮', '视频': '📺',
      '社交': '💬', '文档': '📄', '音乐': '🎵', '其他': '📦'
    };
    el.innerHTML = sorted.map(([cat, sec]) => `
      <div class="museum-tool-card">
        <div class="museum-tool-icon">${icons[cat] || '📦'}</div>
        <div class="museum-tool-name">${cat}</div>
        <div class="museum-tool-hours">${Math.round(sec / 3600)}h</div>
      </div>
    `).join('');
  }

  function renderMemes(memes) {
    const el = document.getElementById('museumMemes');
    if (!memes || memes.length === 0) {
      el.innerHTML = '<div class="empty-hint">暂无梗</div>';
      return;
    }
    el.innerHTML = memes.slice(0, 6).map(m => `
      <div class="museum-meme-card">${escapeHtml(m.meme_text)}</div>
    `).join('');
  }

  async function renderWordcloud(journalDates) {
    const el = document.getElementById('museumWordcloud');
    if (!journalDates || journalDates.length === 0) {
      el.innerHTML = '<div class="empty-hint">需要积累更多日记</div>';
      return;
    }
    // 简单词频统计：加载最近 30 篇日记，提取中文词汇
    const recent = journalDates.slice(0, 30);
    const wordCount = {};
    for (const date of recent) {
      try {
        const content = await invoke('load_journal', { date });
        // 简单分词：按标点和空格切分，取 2-6 字的片段
        const words = content.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
        for (const w of words) {
          wordCount[w] = (wordCount[w] || 0) + 1;
        }
      } catch(e) {}
    }
    // 取频率前 20 的词
    const sorted = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    if (sorted.length === 0) {
      el.innerHTML = '<div class="empty-hint">需要积累更多日记</div>';
      return;
    }
    const maxCount = sorted[0][1];
    el.innerHTML = sorted.map(([word, count]) => {
      const size = 12 + Math.round((count / maxCount) * 16);
      return `<span class="museum-word" style="font-size:${size}px">${word}</span>`;
    }).join('');
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
```

在 `index.html` 底部 `</body>` 前加 `<script src="scripts/museum.js"></script>`

---

## 功能六：现有功能增强

### 6.1 反派系统 - 故事线进化

当前反派系统只做单日检测。增强为多日追踪，反派会"成长"：

在 `villain.rs` 中新增：

```rust
/// 反派成长等级（基于连续天数）
pub fn villain_growth(data_dir: &PathBuf, category: &str) -> u32 {
    let today = chrono::Local::now().date_naive();
    let mut streak = 0u32;
    for i in 0..7 {
        let date = today - chrono::Duration::days(i as i64);
        let ds = date.format("%Y-%m-%d").to_string();
        let entries = crate::activity::load_entries(data_dir, &ds);
        let summary = crate::activity::summarize(&entries);
        let cat_min = summary.iter()
            .find(|(c, _)| c == category)
            .map(|(_, s)| s / 60)
            .unwrap_or(0);
        if cat_min >= 30 { streak += 1; } else { break; }
    }
    streak
}
```

在 `Villain` 结构体加 `pub growth: u32` 字段，`detect()` 中调用 `villain_growth` 填充。

前端根据 growth 值显示不同台词：
- growth 1-2：普通反派台词
- growth 3-4：反派进化，台词更嚣张
- growth 5+：最终 Boss 形态，台词带威胁感

在 `home.js` 渲染反派时加判断：
```js
if (villain.growth >= 5) {
  villainName.textContent += ' [BOSS]';
  villainCard.classList.add('villain-boss');
} else if (villain.growth >= 3) {
  villainName.textContent += ' [进化]';
}
```

CSS 加一个 boss 样式：
```css
.villain-boss { border: 1px solid #ff4444; animation: villain-pulse 2s infinite; }
@keyframes villain-pulse { 0%,100% { box-shadow: 0 0 0 rgba(255,68,68,0); } 50% { box-shadow: 0 0 12px rgba(255,68,68,0.3); } }
```

### 6.2 人格系统 - 成长机制

当前人格是固定选择的。增加"好感度"机制，让小鸡的性格随使用逐渐变化。

数据结构：在 `config.json` 中新增字段（或单独文件 `data/personality_growth.json`）：

```json
{
  "affinity": 0,
  "traits_unlocked": [],
  "special_lines": [],
  "milestone_days": [7, 30, 100, 365]
}
```

在 `personality.rs` 中新增：

```rust
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalityGrowth {
    pub affinity: u32,
    pub traits_unlocked: Vec<String>,
    pub special_lines: Vec<String>,
}

pub fn load_growth(data_dir: &PathBuf) -> PersonalityGrowth {
    let path = data_dir.join("personality_growth.json");
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(PersonalityGrowth { affinity: 0, traits_unlocked: vec![], special_lines: vec![] })
    } else {
        PersonalityGrowth { affinity: 0, traits_unlocked: vec![], special_lines: vec![] }
    }
}

pub fn add_affinity(data_dir: &PathBuf, amount: u32) -> PersonalityGrowth {
    let mut growth = load_growth(data_dir);
    growth.affinity += amount;

    // 里程碑解锁特殊台词
    let milestones = [(10, "初识"), (50, "熟悉"), (100, "默契"), (300, "羁绊")];
    for (threshold, trait_name) in &milestones {
        if growth.affinity >= *threshold && !growth.traits_unlocked.contains(&trait_name.to_string()) {
            growth.traits_unlocked.push(trait_name.to_string());
        }
    }

    let path = data_dir.join("personality_growth.json");
    let json = serde_json::to_string_pretty(&growth).unwrap_or_default();
    let _ = fs::write(&path, json);
    growth
}
```

好感度增长触发点（在已有逻辑中嵌入）：
- 写日记：+3 好感度（在 `save_journal` 命令中调用）
- 完成番茄钟：+2（前端完成时调用）
- 封印反派：+5（在 `seal_villain` 中调用）
- 连续使用 7 天：+10（在 `mood.rs` 的 `evaluate` 中检测）

commands.rs 新增：

```rust
#[tauri::command]
pub fn get_personality_growth() -> Result<crate::personality::PersonalityGrowth, String> {
    Ok(crate::personality::load_growth(&get_data_dir()))
}

#[tauri::command]
pub fn add_personality_affinity(amount: u32) -> Result<crate::personality::PersonalityGrowth, String> {
    Ok(crate::personality::add_affinity(&get_data_dir(), amount))
}
```

在 `invoke_handler` 注册这两个命令。

前端在主页显示好感度等级（在小鸡下方）：
```js
// home.js 中加载好感度
async function loadAffinity() {
  try {
    const growth = await invoke('get_personality_growth');
    const level = growth.traits_unlocked.length > 0
      ? growth.traits_unlocked[growth.traits_unlocked.length - 1]
      : '陌生';
    document.getElementById('homeSubtitle').textContent += ` · 好感度: ${level}`;
  } catch(e) {}
}
```

---

## 实施顺序

### Phase 3：英语词汇拾取
1. 创建 `vocab.rs`，实现单词提取和存储
2. 在 `commands.rs` 加命令，`main.rs` 注册
3. `cargo build` 确认编译通过
4. 在 `index.html` 主页加"今日拾取"卡片 HTML
5. 在 `main.css` 加词汇 CSS
6. 在 `home.js` 加词汇加载和生成逻辑
7. 测试：有英文窗口标题时能提取单词，点击生成例句正常

### Phase 4：灵感炼金术
1. 创建 `inspiration.rs`，实现灵感 CRUD 和配方存储
2. 在 `commands.rs` 加 5 个命令，`main.rs` 注册
3. `cargo build` 确认编译通过
4. 在 `index.html` 加导航按钮和灵感页面 HTML
5. 在 `main.css` 加灵感 CSS
6. 创建 `inspiration.js`，实现记录、选择、炼金逻辑
7. 在 `app.js` 页面切换处确保 `page-change` 事件派发
8. 测试：添加灵感、选择多条、炼金合成、查看历史配方

### Phase 5：收藏馆
1. 不需要新 Rust 模块，复用已有命令
2. 在 `index.html` 加导航按钮和收藏馆页面 HTML
3. 在 `main.css` 加收藏馆 CSS
4. 创建 `museum.js`，实现数据聚合和渲染
5. 测试：打开收藏馆，确认统计数据、工具展柜、关键词云正常

### Phase 6：现有功能增强
1. 在 `villain.rs` 加 `villain_growth` 函数，`Villain` 加 `growth` 字段
2. 在 `personality.rs` 加 `PersonalityGrowth` 和好感度逻辑
3. 在 `commands.rs` 加好感度命令
4. `cargo build` 确认编译通过
5. 在 `home.js` 加反派成长显示和好感度显示
6. 在 `main.css` 加 boss 动画样式
7. 在已有的 `save_journal`、`seal_villain` 等命令中嵌入好感度增长调用

## 重要约束

- 不要用任何框架或构建工具
- 不要修改现有功能的行为
- 两个主题（浅色/深色）都要支持，用 CSS 变量
- 所有用户可见文案要用中文
- Rust 代码要能编译通过，注意 `use` 导入和模块可见性
- `call_api_stream` 需要在 `claude_api.rs` 中改为 `pub`（如果 Part 1 已经改过就不用重复）
- 新页面都需要在 `app.js` 的页面切换逻辑中支持 `page-change` 事件
- 每个 Phase 完成后先 `cargo build` 确认编译通过，再做前端
