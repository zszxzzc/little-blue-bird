# 小蓝鸟写作模块 - 实施指南（三）

> 接 WRITING_MODULE_PROMPT_2.md，本文件包含 Rust 命令、AI集成、小鸟系统、多API、实施顺序

---

## 八（补充）：Rust 后端命令清单

在 `src-tauri/src/` 下新建 `writing.rs`，实现以下 Tauri 命令：

```rust
// === 书籍管理 ===
#[tauri::command]
fn create_book(title: String) -> Result<BookMeta, String>

#[tauri::command]
fn get_book_meta(book_id: String) -> Result<BookMeta, String>

#[tauri::command]
fn update_book_meta(meta: BookMeta) -> Result<(), String>

// === 卷章管理 ===
#[tauri::command]
fn create_volume(book_id: String, title: String) -> Result<Volume, String>

#[tauri::command]
fn create_chapter(book_id: String, volume_id: String, title: String) -> Result<Chapter, String>

#[tauri::command]
fn rename_chapter(book_id: String, chapter_id: String, title: String) -> Result<(), String>

#[tauri::command]
fn update_chapter_status(book_id: String, chapter_id: String, status: String) -> Result<(), String>

#[tauri::command]
fn delete_chapter(book_id: String, chapter_id: String) -> Result<(), String>

#[tauri::command]
fn reorder_chapters(book_id: String, volume_id: String, chapter_ids: Vec<String>) -> Result<(), String>

// === 章节内容 ===
#[tauri::command]
fn load_chapter(book_id: String, chapter_id: String) -> Result<String, String>

#[tauri::command]
fn save_chapter(book_id: String, chapter_id: String, content: String) -> Result<(), String>

#[tauri::command]
fn load_chapter_meta(book_id: String, chapter_id: String) -> Result<ChapterMeta, String>

#[tauri::command]
fn save_chapter_meta(book_id: String, chapter_id: String, meta: ChapterMeta) -> Result<(), String>

// === 人物管理 ===
#[tauri::command]
fn get_characters(book_id: String) -> Result<Vec<Character>, String>

#[tauri::command]
fn save_character(book_id: String, character: Character) -> Result<(), String>

#[tauri::command]
fn delete_character(book_id: String, char_id: String) -> Result<(), String>

// === 伏笔管理 ===
#[tauri::command]
fn get_foreshadowing(book_id: String) -> Result<Vec<Foreshadow>, String>

#[tauri::command]
fn create_foreshadow(book_id: String, item: Foreshadow) -> Result<(), String>

#[tauri::command]
fn resolve_foreshadow(book_id: String, fs_id: String, resolved_chapter: String, resolved_quote: String) -> Result<(), String>

// === 设定集 ===
#[tauri::command]
fn get_worldbuilding(book_id: String) -> Result<serde_json::Value, String>

#[tauri::command]
fn save_worldbuilding(book_id: String, data: serde_json::Value) -> Result<(), String>

#[tauri::command]
fn search_worldbuilding(book_id: String, keyword: String) -> Result<Vec<SearchResult>, String>

// === 统计 ===
#[tauri::command]
fn get_writing_stats(book_id: String) -> Result<WritingStats, String>
// 返回：全书字数、各章字数、今日字数、连续写作天数

// === 快照 ===
#[tauri::command]
fn create_snapshot(book_id: String, chapter_id: String) -> Result<(), String>

#[tauri::command]
fn list_snapshots(book_id: String, chapter_id: String) -> Result<Vec<SnapshotInfo>, String>

#[tauri::command]
fn load_snapshot(book_id: String, chapter_id: String, snapshot_id: String) -> Result<String, String>
```

**注意**：所有命令都要在 `main.rs` 的 `invoke_handler` 中注册。数据目录从 `config.json` 的 `data_dir` 读取，参考现有 `commands.rs` 中的 `get_data_dir()` 写法。

---

## 九、AI 集成

### 多 API 接口支持

现有 `config.json` 只存一组 API 配置。需要扩展为支持多组：

**config.json 新增字段：**
```json
{
  "api_key": "sk-xxx",
  "model": "deepseek-chat",
  "ai_providers": [
    {
      "id": "deepseek-v3",
      "name": "DeepSeek-V3",
      "api_key": "sk-xxx",
      "base_url": "https://api.deepseek.com/v1",
      "model": "deepseek-chat",
      "temperature": 0.7,
      "enabled": true
    },
    {
      "id": "deepseek-r1",
      "name": "DeepSeek-R1",
      "api_key": "sk-xxx",
      "base_url": "https://api.deepseek.com/v1",
      "model": "deepseek-reasoner",
      "temperature": 0.7,
      "enabled": false
    },
    {
      "id": "openai",
      "name": "OpenAI GPT-4o",
      "api_key": "",
      "base_url": "https://api.openai.com/v1",
      "model": "gpt-4o",
      "temperature": 0.7,
      "enabled": false
    },
    {
      "id": "custom",
      "name": "自定义",
      "api_key": "",
      "base_url": "",
      "model": "",
      "temperature": 0.7,
      "enabled": false
    }
  ],
  "active_provider": "deepseek-v3",
  "writing_provider": "deepseek-v3"
}
```

**关键点：**
- 保留原有 `api_key` 和 `model` 字段做向后兼容
- `active_provider` 是全局默认（日记等功能用）
- `writing_provider` 是写作模块专用，可以和全局不同
- 所有接口都走 OpenAI 兼容协议（`/v1/chat/completions`）
- 设置页新增「AI 引擎管理」区域，每个接口可独立配置和测试连接

### 设置页 UI

```html
<div class="ai-provider-section">
  <label class="field-label">AI 引擎管理</label>
  <div class="provider-list" id="providerList">
    <!-- JS 动态渲染每个 provider 卡片 -->
  </div>
  <button class="btn-small" id="addProviderBtn">+ 添加接口</button>

  <label class="field-label">日记模块使用</label>
  <select id="activeProviderSelect" class="field-select"></select>

  <label class="field-label">写作模块使用</label>
  <select id="writingProviderSelect" class="field-select"></select>
</div>
```

### Rust 后端改造

修改 `claude_api.rs`（建议重命名为 `ai_api.rs`），抽象出统一接口：

```rust
pub struct AIProvider {
    pub id: String,
    pub name: String,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub temperature: f64,
}

impl AIProvider {
    pub async fn chat(&self, messages: Vec<Message>) -> Result<String, String> {
        // 统一走 OpenAI 兼容协议
        // POST {base_url}/chat/completions
    }

    pub async fn test_connection(&self) -> Result<bool, String> {
        // 发一条简单消息测试连通性
    }
}

#[tauri::command]
pub async fn test_ai_provider(provider: AIProvider) -> Result<bool, String> {
    provider.test_connection().await
}
```

### AI 写作辅助功能

以下功能通过 AI 接口实现，前端调用 Rust 命令，Rust 调用 AI API：

**1. 续写建议（不是直接续写，是给思路）**
```javascript
// 前端触发
async function getWritingSuggestions() {
  const text = writingEditor.value;
  const lastParagraph = text.split('\n').filter(Boolean).slice(-3).join('\n');
  const result = await invoke('ai_writing_suggest', {
    bookId: currentBookId,
    chapterId: currentChapterId,
    context: lastParagraph
  });
  // 显示 3 个方向建议，用户选择后不自动写入，只是参考
}
```

Rust 端 prompt：
```
你是一个小说写作助手。根据以下上下文，给出3个不同的后续发展方向建议。
每个建议用一句话概括方向，再用2-3句话描述具体可以怎么写。
不要直接写正文，只给思路。

当前内容：
{context}
```

**2. 一致性检查**
```
你是一个小说校对助手。对照以下设定资料，检查这章内容有没有矛盾或不一致的地方。

设定资料：
{worldbuilding_excerpt}

人物档案：
{relevant_characters}

本章内容：
{chapter_content}

如果发现矛盾，指出具体位置和原因。如果没有问题，说"未发现矛盾"。
```

**3. 伏笔智能识别**
```
你是一个小说分析助手。阅读以下章节内容，找出可能是伏笔的地方（暗示、悬念、未解释的细节）。

已知伏笔列表：
{existing_foreshadows}

本章内容：
{chapter_content}

列出你发现的潜在伏笔，以及是否可能回收了已有伏笔。
```

**4. 章节摘要**
每章保存时自动生成一句话摘要，存入 chapter meta。

---

## 十、小鸟系统（写作伙伴）

### 概述
小鸟是浮在编辑器右上角的角色，有表情、动作、对话气泡。它不只是装饰，是写作过程中的实时反馈伙伴。

### 尺寸
用户可调，默认「大」：
```javascript
const BIRD_SIZES = {
  small:  { width: 32, height: 32 },
  medium: { width: 64, height: 64 },
  large:  { width: 96, height: 96 },   // 默认
  xlarge: { width: 128, height: 128 }
};
```

### HTML 结构
```html
<div class="writing-bird" id="writingBird" data-size="large">
  <div class="bird-speech" id="birdSpeech">
    <!-- 气泡框，说话时显示 -->
    <span class="bird-speech-text" id="birdSpeechText"></span>
  </div>
  <div class="bird-body" id="birdBody">
    <!-- SVG 小鸟，复用主页小鸡的 SVG 结构但改为蓝色 -->
    <!-- 需要多套表情：normal, surprised, laughing, sleeping, glasses, angry, sparkle -->
  </div>
</div>
```

### CSS 定位
```css
.writing-bird {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  cursor: grab;
  user-select: none;
  transition: top 300ms ease, right 300ms ease;
}

.writing-bird.dragging {
  cursor: grabbing;
  transition: none;
}

.bird-speech {
  position: absolute;
  bottom: 100%;
  right: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 13px;
  max-width: 200px;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 200ms ease, transform 200ms ease;
  pointer-events: none;
}

.bird-speech.visible {
  opacity: 1;
  transform: translateY(0);
}

/* 气泡小三角 */
.bird-speech::after {
  content: '';
  position: absolute;
  top: 100%;
  right: 20px;
  border: 6px solid transparent;
  border-top-color: var(--border-color);
}
```

### 小鸟行为状态机

```javascript
const BirdState = {
  IDLE: 'idle',           // 站着，偶尔歪头
  PEEKING: 'peeking',    // 偷看编辑器内容，眼睛跟光标
  SURPRISED: 'surprised', // 写得快时瞪大眼
  SLEEPING: 'sleeping',   // 长时间没打字，打瞌睡
  LAUGHING: 'laughing',   // 删了一大段，偷笑
  READING: 'reading',     // 查设定时，戴眼镜
  GONE: 'gone',           // 长时间无操作，飞走了
  SPEAKING: 'speaking'    // 说话中
};

class WritingBird {
  constructor() {
    this.state = BirdState.IDLE;
    this.lastInputTime = Date.now();
    this.inputSpeed = 0;        // 每分钟输入字数
    this.deletedCount = 0;      // 连续删除字数
    this.idleTimer = null;
    this.speechTimer = null;
    this.speechQueue = [];
  }

  // 每次编辑器 input 事件调用
  onInput(event) {
    const now = Date.now();
    const timeDiff = now - this.lastInputTime;
    this.lastInputTime = now;

    // 计算输入速度
    if (timeDiff < 5000) {
      this.inputSpeed = 60000 / timeDiff; // 字/分钟
    }

    // 判断是删除还是输入
    if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') {
      this.deletedCount++;
      if (this.deletedCount > 50) {
        this.setState(BirdState.LAUGHING);
        this.speak('deleteLarge');
        this.deletedCount = 0;
      }
    } else {
      this.deletedCount = 0;
      if (this.inputSpeed > 120) {
        this.setState(BirdState.SURPRISED);
      } else {
        this.setState(BirdState.PEEKING);
      }
    }

    // 重置空闲计时
    this.resetIdleTimer();
  }

  resetIdleTimer() {
    clearTimeout(this.idleTimer);
    // 2分钟没输入 → 打瞌睡
    this.idleTimer = setTimeout(() => {
      this.setState(BirdState.SLEEPING);
      // 再过5分钟 → 飞走
      this.idleTimer = setTimeout(() => {
        this.setState(BirdState.GONE);
      }, 300000);
    }, 120000);
  }

  setState(newState) {
    if (this.state === newState) return;
    this.state = newState;
    this.updateVisual();
  }

  updateVisual() {
    const birdBody = document.getElementById('birdBody');
    // 切换 SVG 表情，参考主页小鸡的 data-mood 机制
    birdBody.setAttribute('data-expression', this.state);
  }

  // 说话系统
  speak(trigger) {
    const line = this.getLine(trigger);
    if (!line) return;
    const speechText = document.getElementById('birdSpeechText');
    const speech = document.getElementById('birdSpeech');
    speechText.textContent = line;
    speech.classList.add('visible');
    clearTimeout(this.speechTimer);
    this.speechTimer = setTimeout(() => {
      speech.classList.remove('visible');
    }, 4000); // 4秒后消失
  }

  getLine(trigger) {
    // 根据当前性格 + 触发条件返回台词
    // 性格从 config 读取
    const personality = getCurrentPersonality();
    const lines = BIRD_LINES[personality]?.[trigger];
    if (!lines || lines.length === 0) return null;
    return lines[Math.floor(Math.random() * lines.length)];
  }
}
```

### 性格台词库

```javascript
const BIRD_LINES = {
  // === 温柔系 ===
  gentle: {
    open:        ["欢迎回来~今天也一起加油吧", "又见面了，准备好写了吗？"],
    typing:      ["写得不错哦，继续~", "嗯嗯，我在看着呢"],
    typingFast:  ["哇，好快！灵感来了吗？", "手速好快，加油加油~"],
    idle:        ["休息一下也好~", "想不出来的话，深呼吸试试？"],
    deleteLarge: ["删掉也没关系的，重新来~", "有时候推倒重来反而更好呢"],
    milestone1k: ["一千字了！你好棒~", "稳步前进中~"],
    milestone3k: ["三千字！今天超厉害的", "写了好多呢，辛苦了~"],
    lateNight:   ["已经很晚了哦，注意休息~", "熬夜对身体不好...再写一点就睡吧？"],
    foreshadow:  ["那条伏笔...要不要看看？", "有个伏笔好久没回收了呢~"],
    comeback:    ["好久不见！想你了~", "你终于回来了，我一直在等你"],
  },

  // === 毒舌系 ===
  sarcastic: {
    open:        ["哟，今天居然来写了？", "来了？我还以为你弃坑了"],
    typing:      ["就这？继续啊", "嗯...凑合吧"],
    typingFast:  ["打字倒是挺快，质量呢？", "这速度...你在水字数吧"],
    idle:        ["发什么呆呢，写啊", "卡文了？意料之中"],
    deleteLarge: ["哈哈哈删了这么多，早说写得不行嘛", "推倒重来？勇气可嘉"],
    milestone1k: ["才一千字就想邀功？", "一千字，离完结还远着呢"],
    milestone3k: ["三千字，行吧，算你今天没摸鱼", "居然写了三千字，太阳打西边出来了？"],
    lateNight:   ["都几点了还不睡，明天又要起不来", "熬夜写的质量能看吗？"],
    foreshadow:  ["第{n}章那个伏笔，你不会忘了吧？", "有个坑你还没填，读者要骂了"],
    comeback:    ["消失了{n}天，你的读者都跑光了", "哦，回来了？我还以为你转行了"],
  },

  // === 中二系 ===
  chuuni: {
    open:        ["哼，你终于来了。本鸟等你很久了", "命运的笔...再次觉醒了！"],
    typing:      ["继续吧...让本鸟见识你的创世之力", "这股文字的力量...还不够！"],
    typingFast:  ["这速度...！难道你觉醒了？！", "不可能...凡人怎能有如此笔速！"],
    idle:        ["怎么停下了？难道被黑暗侵蚀了？", "本鸟感受到了...你内心的迷茫"],
    deleteLarge: ["愚蠢！那可是蕴含力量的文字！", "毁灭与重生...这也是一种力量"],
    milestone1k: ["一千字的封印...已被突破！", "这只是开始，真正的力量还在沉睡"],
    milestone3k: ["三千字！这已经超越了凡人的极限！", "不可思议的力量...本鸟都感到颤抖"],
    lateNight:   ["深夜...是力量最强的时刻。本鸟允许你继续", "黑暗中的创作...别有一番风味"],
    foreshadow:  ["那条命运之线...你感觉不到吗？", "第{n}章的伏笔在呼唤你！那是未完成的宿命！"],
    comeback:    ["{n}天...本鸟以为你已经被黑暗吞噬了", "你回来了...看来命运还没有放弃你"],
  },

  // === 冷淡系 ===
  cold: {
    open:        ["来了", "嗯"],
    typing:      ["..."],
    typingFast:  ["速度不错"],
    idle:        ["...要写就写", ""],
    deleteLarge: ["删了啊", "嗯，重写吧"],
    milestone1k: ["一千", "继续"],
    milestone3k: ["三千字了", "还行"],
    lateNight:   ["该睡了", "...太晚了"],
    foreshadow:  ["第{n}章，伏笔", "有个坑没填"],
    comeback:    ["回来了", "...好久"],
  }
};
```

### AI 驱动的写作评价

除了预设台词，小鸟还会定期（每写完一段，约 300 字触发一次）把最近写的内容发给 AI，获取一句短评：

```javascript
async function getBirdComment(recentText) {
  const personality = getCurrentPersonality();
  const prompt = BIRD_COMMENT_PROMPTS[personality];
  const result = await invoke('ai_bird_comment', {
    text: recentText,
    prompt: prompt
  });
  bird.speak('aiComment', result);
}

const BIRD_COMMENT_PROMPTS = {
  gentle: `你是一只温柔的小蓝鸟，是作者的写作伙伴。用一句话评价这段文字（不超过20字）。语气温暖鼓励，像朋友。`,
  sarcastic: `你是一只毒舌的小蓝鸟。用一句话吐槽这段文字（不超过20字）。嘴毒但不恶意，像损友。`,
  chuuni: `你是一只中二的小蓝鸟，自称"本鸟"，说话浮夸。用一句话评价这段文字（不超过20字）。用中二的方式表达。`,
  cold: `你是一只话很少的小蓝鸟。用最简短的话评价这段文字（不超过10字）。能不说就不说。`,
  custom: null  // 使用用户自定义 prompt
};
```

### 自定义性格

设置页新增自定义性格编辑区：

```html
<div class="custom-personality" id="customPersonality" style="display:none">
  <label class="field-label">性格名称</label>
  <input type="text" id="customPersonalityName" class="field-input"
         placeholder="如：自恋鸟">

  <label class="field-label">人设描述（作为 AI prompt）</label>
  <textarea id="customPersonalityDesc" class="field-textarea" rows="4"
            placeholder="你是一只自恋的小蓝鸟，觉得自己是全世界最帅的鸟..."></textarea>

  <label class="field-label">口癖/常用语气词</label>
  <input type="text" id="customPersonalityCatchphrase" class="field-input"
         placeholder="如：哼哼、本大爷、切~">

  <label class="field-label">说话频率</label>
  <input type="range" id="customSpeechFreq" min="1" max="5" value="3">
  <span>低 ←→ 高</span>

  <label class="field-label">评价倾向</label>
  <input type="range" id="customTone" min="1" max="5" value="3">
  <span>夸 ←→ 损</span>
</div>
```

**存储在 config.json：**
```json
{
  "custom_personality": {
    "name": "自恋鸟",
    "description": "你是一只自恋的小蓝鸟...",
    "catchphrase": "哼哼、本大爷",
    "speech_frequency": 3,
    "tone": 3
  }
}
```

当用户选择自定义性格时，AI prompt 拼接为：
```
{用户填的人设描述}
口癖：{用户填的口癖}
用一句话评价这段文字，不超过25字。
```

### 小鸟互动

1. **单击小鸟** → 随机说一句话，或弹出快捷菜单（今日统计、伏笔提醒、AI建议）
2. **双击小鸟** → 打开对话模式（底部弹出小对话框，可以和小鸟聊剧情，实际调用 AI）
3. **右键小鸟** → 设置菜单：切换性格、调整大小、说话频率、静音
4. **拖拽小鸟** → 可拖到编辑器边缘任意位置，松手后吸附到最近的边缘

---

## 十一、实施顺序（严格按此执行）

分 4 个阶段，每个阶段完成后必须能编译运行。

### 阶段 1：骨架（先能看到页面）

1. `index.html` 中添加写作导航按钮和 `<section id="page-writing">`
2. 新建 `src/scripts/writing.js`，实现页面切换
3. 实现三栏布局的 CSS（可新建 `src/styles/writing.css` 并在 html 中引入）
4. 左侧结构树：硬编码一个示例卷/章结构，能点击切换
5. 中间编辑器：textarea，能输入文字
6. 底部状态栏：显示字数（本章）
7. 右侧面板：空的 4 个 tab，能切换

**验收标准**：点击导航进入写作页，能看到三栏布局，能在编辑器里打字，字数实时更新。

### 阶段 2：数据持久化

1. Rust 端新建 `writing.rs`，实现核心命令：
   - `create_book` / `get_book_meta` / `update_book_meta`
   - `create_volume` / `create_chapter` / `rename_chapter` / `delete_chapter`
   - `load_chapter` / `save_chapter`
   - `load_chapter_meta` / `save_chapter_meta`
   - `get_writing_stats`
2. 在 `main.rs` 注册所有新命令
3. 前端结构树改为从 `meta.json` 动态渲染
4. 编辑器内容从文件加载/保存
5. 实现自动保存（30秒 + 失焦）
6. 实现章节状态标记（右键菜单）
7. 状态栏显示：本章字数、全书字数、今日字数

**验收标准**：新建卷/章，写入内容，关闭重开后数据还在。

### 阶段 3：信息面板

1. **章节备忘 tab**（最简单，先做）：大纲、情绪、笔记的 textarea，存入 chapter meta
2. **人物系统**：
   - Rust 端：`get_characters` / `save_character` / `delete_character`
   - 前端：人物列表渲染、人物档案弹窗、手动添加人物到章节
3. **伏笔系统**：
   - Rust 端：`get_foreshadowing` / `create_foreshadow` / `resolve_foreshadow`
   - 前端：伏笔列表渲染、创建对话框、回收流程、紧急度颜色
4. **设定速查 tab**：
   - Rust 端：`get_worldbuilding` / `save_worldbuilding` / `search_worldbuilding`
   - 前端：搜索框 + 结果列表

**验收标准**：能创建人物档案、标记伏笔、回收伏笔、搜索设定。

### 阶段 4：小鸟 + AI

1. **小鸟视觉**：
   - SVG 小鸟（蓝色版，参考主页小鸡的 SVG 结构改色）
   - 多套表情：normal、peeking、surprised、sleeping、laughing、reading、gone
   - CSS 动画：idle 歪头、打瞌睡点头、飞走/飞回
2. **小鸟行为状态机**：
   - 监听编辑器 input 事件，根据输入速度/删除/空闲切换状态
   - 实现 `WritingBird` 类（见第十节代码）
3. **小鸟说话**：
   - 预设台词库（gentle/sarcastic/chuuni/cold 四套）
   - 气泡框显示/隐藏动画
   - 触发条件：打开页面、字数里程碑、深夜、长时间未来、伏笔提醒
4. **自定义性格**：
   - 设置页自定义性格编辑区
   - 存入 config.json
5. **小鸟尺寸可调**：设置页 4 档选择
6. **拖拽**：小鸟可拖拽到编辑器边缘任意位置
7. **AI 写作评价**：每 300 字触发一次，调用 AI 获取短评，通过气泡显示
8. **多 API 接口**：
   - 扩展 config.json 支持多组 AI 配置
   - 设置页 AI 引擎管理 UI
   - Rust 端抽象 `AIProvider`，统一 OpenAI 兼容协议
   - 测试连接功能
9. **AI 辅助功能**：续写建议、一致性检查、伏笔智能识别、章节摘要

**验收标准**：小鸟能根据写作行为切换表情和说话，AI 评价能正常触发，多 API 可切换。

---

## 十二、重要约束

### 必须遵守
1. **不要引入任何前端框架**（React/Vue/Svelte 都不行），项目是 vanilla JS，保持一致
2. **不要引入构建工具**（webpack/vite 都不行），直接 `<script>` 引入
3. **CSS 必须支持亮色/暗色两套主题**，用 CSS 变量，参考现有 `main.css` 的 `[data-theme="dark"]`
4. **Rust 代码风格**参考现有 `commands.rs`，用 `#[tauri::command]` 暴露，错误统一返回 `Result<T, String>`
5. **数据全部存本地文件**，不引入数据库
6. **每个阶段完成后必须能 `cargo tauri dev` 正常运行**，不能留编译错误
7. **新增的 JS 文件**要在 `index.html` 底部用 `<script>` 引入，放在 `settings.js` 之后
8. **不要动现有功能的代码**，除非是必要的集成点（如 nav-rail 加按钮、config 加字段）

### 文件清单（预计新增）
```
src/
├── scripts/
│   └── writing.js          # 写作模块全部前端逻辑
├── styles/
│   └── writing.css         # 写作模块样式（可选，也可写在 main.css）
src-tauri/src/
├── writing.rs              # 写作模块 Rust 后端
├── ai_provider.rs          # 多 AI 接口抽象（可选，也可在 writing.rs 内）
```

### 性格系统集成
项目已有 `personality.js` 和 `personality.rs`，支持 gentle/sarcastic/chuuni/shy 四种性格。写作模块的小鸟性格应该**复用现有性格系统**，不要另起一套。在现有基础上扩展 cold（冷淡）和 custom（自定义）即可。

---

*本文档共三个文件：WRITING_MODULE_PROMPT.md（布局+风格）、WRITING_MODULE_PROMPT_2.md（人物+伏笔）、WRITING_MODULE_PROMPT_3.md（后端+AI+小鸟+实施顺序）。按阶段 1→2→3→4 顺序实施。*
