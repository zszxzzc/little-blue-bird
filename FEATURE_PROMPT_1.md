# 小蓝鸟 - 功能扩展实现指南（Part 1：桌面世界观 + 记忆小剧场）

## 项目背景

- 技术栈：Tauri 2 + Rust 后端 + 原生 JS 前端（无框架、无构建工具）
- 已有模块：活动监测、AI日记、心情系统、番茄钟、社交能量条、反派系统、人格系统（4种性格）、梗库
- AI 接口：DeepSeek API（OpenAI 兼容协议），流式调用，见 `claude_api.rs` 的 `call_api_stream()`
- 数据目录：`config.json` 中的 `data_dir` 字段（默认 `D:\小玩意\小蓝鸟\data`）
- 性格系统：gentle/sarcastic/chuuni/shy，所有文案都要适配4种性格

## 现有代码模式（必须遵循）

### Rust 后端
- 每个功能一个 `.rs` 文件，放在 `src-tauri/src/` 下
- 在 `main.rs` 顶部加 `mod xxx;`
- 命令函数写在各自模块里，在 `commands.rs` 中 re-export
- 命令签名：`#[tauri::command] pub fn xxx() -> Result<T, String>`
- 异步命令：`#[tauri::command] pub async fn xxx(app: AppHandle) -> Result<T, String>`
- 数据目录获取：`fn get_data_dir() -> PathBuf`（已在 commands.rs 中定义）
- 在 `main.rs` 的 `invoke_handler` 中注册命令

### 前端
- 单文件 `index.html`，所有页面用 `<section class="page">` 切换
- JS 文件放 `src/scripts/`，在 `index.html` 底部 `<script>` 引入
- CSS 放 `src/styles/main.css`
- 调用后端：`const { invoke } = window.__TAURI__.core;`
- 监听事件：`const { listen } = window.__TAURI__.event;`
- 页面切换：导航栏 `.nav-btn[data-page="xxx"]` 点击后显示对应 `#page-xxx`

---

## 功能一：桌面世界观成长（P0）

### 概述
把用户的日常行为映射成一张可视化小世界地图。不同活动类别对应不同区域，活动越多区域越繁荣。

### 区域设计

| 区域 | 对应活动类别 | 等级 1 | 等级 2 | 等级 3 | 等级 4 |
|------|------------|--------|--------|--------|--------|
| 图书馆 | 编程+文档 | 小书摊 | 阅览室 | 图书馆 | 魔法塔 |
| 剧场 | 写作（未来） | 露天台 | 小剧场 | 大剧院 | 星空剧场 |
| 公园 | 运动+健康 | 草地 | 花园 | 公园 | 森林 |
| 咖啡馆 | 社交 | 路边摊 | 小店 | 咖啡馆 | 会所 |
| 游乐场 | 游戏+视频 | 秋千 | 滑梯 | 游乐场 | 主题乐园 |
| 日记小屋 | 日记 | 帐篷 | 木屋 | 小楼 | 城堡 |
| 乌云/怪物 | 熬夜 | 无 | 小乌云 | 大乌云 | 暴风雨 |

### 升级规则
- 每个区域有经验值（XP），活动时长转换为 XP：1分钟 = 1 XP
- 等级阈值：Lv1=0, Lv2=300, Lv3=1500, Lv4=5000
- 每天结算一次（打开世界观页面时自动计算）
- 熬夜惩罚：23:00-05:00 期间的活动时长，按分钟累加乌云值

### 数据结构

文件：`data/world/state.json`

```json
{
  "zones": {
    "library": { "xp": 2350, "level": 3 },
    "theater": { "xp": 120, "level": 1 },
    "park": { "xp": 0, "level": 1 },
    "cafe": { "xp": 680, "level": 2 },
    "playground": { "xp": 1800, "level": 3 },
    "diary_house": { "xp": 450, "level": 2 },
    "dark_cloud": { "xp": 30, "level": 1 }
  },
  "last_settled": "2026-02-10",
  "total_days": 15,
  "history": [
    { "date": "2026-02-10", "changes": { "library": 45, "cafe": 12 } }
  ]
}
```

- `history` 只保留最近 30 天，用于展示趋势
- `last_settled` 防止重复结算

### Rust 后端

新建 `src-tauri/src/world.rs`：

```rust
use crate::activity;
use crate::journal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldState {
    pub zones: HashMap<String, ZoneState>,
    pub last_settled: String,
    pub total_days: u32,
    pub history: Vec<DayChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoneState {
    pub xp: u32,
    pub level: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayChange {
    pub date: String,
    pub changes: HashMap<String, u32>,
}

const LEVEL_THRESHOLDS: [u32; 4] = [0, 300, 1500, 5000];

fn calc_level(xp: u32) -> u32 {
    if xp >= LEVEL_THRESHOLDS[3] { 4 }
    else if xp >= LEVEL_THRESHOLDS[2] { 3 }
    else if xp >= LEVEL_THRESHOLDS[1] { 2 }
    else { 1 }
}

/// 活动类别 → 世界区域映射
fn category_to_zone(cat: &str) -> Option<&'static str> {
    match cat {
        "编程" | "文档" => Some("library"),
        "社交" => Some("cafe"),
        "游戏" | "视频" => Some("playground"),
        _ => None
    }
}

/// 加载世界状态
pub fn load(data_dir: &PathBuf) -> WorldState {
    let path = data_dir.join("world").join("state.json");
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(default_state)
    } else {
        default_state()
    }
}

/// 保存世界状态
pub fn save(data_dir: &PathBuf, state: &WorldState) -> Result<(), String> {
    let dir = data_dir.join("world");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("state.json");
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// 结算指定日期的活动数据到世界经验值
pub fn settle_day(data_dir: &PathBuf, date: &str) -> WorldState {
    let mut state = load(data_dir);
    if state.last_settled == date {
        return state; // 已结算
    }

    let entries = activity::load_entries(data_dir, date);
    let summary = activity::summarize(&entries);
    let mut changes: HashMap<String, u32> = HashMap::new();

    // 活动类别转换为区域 XP
    for (cat, sec) in &summary {
        if let Some(zone) = category_to_zone(cat) {
            let xp = (*sec / 60) as u32;
            if xp > 0 {
                *changes.entry(zone.to_string()).or_insert(0) += xp;
            }
        }
    }

    // 日记加成
    let journal_content = journal::load(data_dir, date);
    if !journal_content.trim().is_empty() {
        *changes.entry("diary_house".to_string()).or_insert(0) += 30;
    }

    // 熬夜检测（简化：检查 23:00-05:00 的活动）
    let late_min = count_late_night_minutes(&entries);
    if late_min > 0 {
        *changes.entry("dark_cloud".to_string()).or_insert(0) += late_min;
    }

    // 应用变更
    for (zone, xp_gain) in &changes {
        let zone_state = state.zones.entry(zone.clone()).or_insert(ZoneState { xp: 0, level: 1 });
        zone_state.xp += xp_gain;
        zone_state.level = calc_level(zone_state.xp);
    }

    // 记录历史
    if !changes.is_empty() {
        state.history.push(DayChange { date: date.to_string(), changes });
        // 只保留最近 30 天
        if state.history.len() > 30 {
            state.history.drain(0..state.history.len() - 30);
        }
    }

    state.last_settled = date.to_string();
    state.total_days += 1;
    let _ = save(data_dir, &state);
    state
}

fn count_late_night_minutes(entries: &[crate::tracker::ActivityEntry]) -> u32 {
    let mut total = 0u32;
    for e in entries {
        if e.ts.len() >= 16 {
            let hour: u32 = e.ts[11..13].parse().unwrap_or(12);
            if hour >= 23 || hour < 5 {
                total += (e.duration / 60) as u32;
            }
        }
    }
    total
}

fn default_state() -> WorldState {
    let mut zones = HashMap::new();
    for name in &["library", "theater", "park", "cafe", "playground", "diary_house", "dark_cloud"] {
        zones.insert(name.to_string(), ZoneState { xp: 0, level: 1 });
    }
    WorldState {
        zones,
        last_settled: String::new(),
        total_days: 0,
        history: vec![],
    }
}
```

### commands.rs 新增

```rust
use crate::world;

#[tauri::command]
pub fn get_world_state() -> Result<world::WorldState, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(world::settle_day(&get_data_dir(), &today))
}

#[tauri::command]
pub fn get_world_history() -> Result<Vec<world::DayChange>, String> {
    let state = world::load(&get_data_dir());
    Ok(state.history)
}
```

在 `main.rs` 加 `mod world;`，在 `invoke_handler` 加 `commands::get_world_state, commands::get_world_history`

### 前端 - 导航按钮

在 `index.html` 的 `nav-rail` 中，日记按钮后面加：

```html
<button class="nav-btn" data-page="world" title="我的世界">
  <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span><span class="nav-label">世界</span>
</button>
```

### 前端 - 页面结构

在 `</section><!-- journal -->` 后面加新 section：

```html
<section class="page" id="page-world">
  <div class="world-container">
    <div class="world-header">
      <h2 class="world-title">我的小世界</h2>
      <span class="world-days" id="worldDays">第 0 天</span>
    </div>

    <!-- 地图区域 - 用 CSS Grid 布局 -->
    <div class="world-map" id="worldMap">
      <div class="world-zone" data-zone="library">
        <div class="zone-icon" id="zoneIconLibrary">📚</div>
        <div class="zone-name">图书馆</div>
        <div class="zone-level" id="zoneLevelLibrary">Lv.1 小书摊</div>
        <div class="zone-xp-bar"><div class="zone-xp-fill" id="zoneXpLibrary"></div></div>
      </div>
      <div class="world-zone" data-zone="theater">
        <div class="zone-icon" id="zoneIconTheater">🎭</div>
        <div class="zone-name">剧场</div>
        <div class="zone-level" id="zoneLevelTheater">Lv.1 露天台</div>
        <div class="zone-xp-bar"><div class="zone-xp-fill" id="zoneXpTheater"></div></div>
      </div>
      <div class="world-zone" data-zone="park">
        <div class="zone-icon" id="zoneIconPark">🌳</div>
        <div class="zone-name">公园</div>
        <div class="zone-level" id="zoneLevelPark">Lv.1 草地</div>
        <div class="zone-xp-bar"><div class="zone-xp-fill" id="zoneXpPark"></div></div>
      </div>
      <div class="world-zone" data-zone="cafe">
        <div class="zone-icon" id="zoneIconCafe">☕</div>
        <div class="zone-name">咖啡馆</div>
        <div class="zone-level" id="zoneLevelCafe">Lv.1 路边摊</div>
        <div class="zone-xp-bar"><div class="zone-xp-fill" id="zoneXpCafe"></div></div>
      </div>
      <div class="world-zone" data-zone="playground">
        <div class="zone-icon" id="zoneIconPlayground">🎮</div>
        <div class="zone-name">游乐场</div>
        <div class="zone-level" id="zoneLevelPlayground">Lv.1 秋千</div>
        <div class="zone-xp-bar"><div class="zone-xp-fill" id="zoneXpPlayground"></div></div>
      </div>
      <div class="world-zone" data-zone="diary_house">
        <div class="zone-icon" id="zoneIconDiary">📖</div>
        <div class="zone-name">日记小屋</div>
        <div class="zone-level" id="zoneLevelDiary">Lv.1 帐篷</div>
        <div class="zone-xp-bar"><div class="zone-xp-fill" id="zoneXpDiary"></div></div>
      </div>
      <div class="world-zone world-zone-dark" data-zone="dark_cloud" id="darkCloudZone" style="display:none">
        <div class="zone-icon">🌧️</div>
        <div class="zone-name">乌云</div>
        <div class="zone-level" id="zoneLevelDark">无</div>
      </div>
    </div>

    <!-- 最近变化 -->
    <div class="world-history">
      <div class="section-title">最近动态</div>
      <div class="world-history-list" id="worldHistoryList">
        <div class="empty-hint">暂无数据，开始使用后会自动记录</div>
      </div>
    </div>
  </div>
</section>
```

### 前端 - CSS（加到 main.css 末尾）

```css
/* === 世界观页面 === */
.world-container { padding: 24px; max-width: 800px; margin: 0 auto; }
.world-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 24px; }
.world-title { font-size: 20px; font-weight: 600; color: var(--text-primary); margin: 0; }
.world-days { font-size: 13px; color: var(--text-secondary); }

.world-map {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}
.world-zone {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 20px 16px;
  text-align: center;
  transition: transform 0.2s, box-shadow 0.2s;
}
.world-zone:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.zone-icon { font-size: 36px; margin-bottom: 8px; }
.zone-name { font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
.zone-level { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
.zone-xp-bar { height: 4px; background: var(--border-color); border-radius: 2px; overflow: hidden; }
.zone-xp-fill { height: 100%; background: var(--accent, #4A9EE5); border-radius: 2px; transition: width 0.6s ease; width: 0%; }
.world-zone-dark { border: 1px dashed var(--text-secondary); opacity: 0.7; }

.world-history-list { display: flex; flex-direction: column; gap: 8px; }
.world-history-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--text-secondary);
  padding: 8px 12px; background: var(--card-bg); border-radius: 8px;
}
.world-history-date { font-weight: 500; color: var(--text-primary); min-width: 90px; }
```

### 前端 - JS（新建 `src/scripts/world.js`）

```js
// world.js - 桌面世界观
(function() {
  const { invoke } = window.__TAURI__.core;

  // 区域名称映射
  const ZONE_NAMES = {
    library:     ['小书摊', '阅览室', '图书馆', '魔法塔'],
    theater:     ['露天台', '小剧场', '大剧院', '星空剧场'],
    park:        ['草地', '花园', '公园', '森林'],
    cafe:        ['路边摊', '小店', '咖啡馆', '会所'],
    playground:  ['秋千', '滑梯', '游乐场', '主题乐园'],
    diary_house: ['帐篷', '木屋', '小楼', '城堡'],
    dark_cloud:  ['无', '小乌云', '大乌云', '暴风雨']
  };

  const ZONE_ICONS = {
    library: ['📖','📚','🏛️','🏰'],
    theater: ['🎪','🎭','🎬','✨'],
    park: ['🌱','🌷','🌳','🌲'],
    cafe: ['🧋','☕','🍰','🏛️'],
    playground: ['🎮','🕹️','🎠','🎡'],
    diary_house: ['⛺','🏠','🏢','🏰'],
    dark_cloud: ['','🌥️','🌧️','⛈️']
  };

  const LEVEL_THRESHOLDS = [0, 300, 1500, 5000];

  // 页面激活时加载
  window.addEventListener('page-change', (e) => {
    if (e.detail === 'world') loadWorld();
  });

  async function loadWorld() {
    try {
      const state = await invoke('get_world_state');
      renderZones(state);
      renderHistory(state.history);
      document.getElementById('worldDays').textContent = `第 ${state.total_days} 天`;
    } catch (err) {
      console.error('加载世界状态失败:', err);
    }
  }

  function renderZones(state) {
    for (const [zone, data] of Object.entries(state.zones)) {
      const level = data.level;
      const names = ZONE_NAMES[zone];
      const icons = ZONE_ICONS[zone];
      if (!names) continue;

      const levelEl = document.getElementById('zoneLevel' + capitalize(zone));
      const iconEl = document.getElementById('zoneIcon' + capitalize(zone));
      const xpEl = document.getElementById('zoneXp' + capitalize(zone));

      if (levelEl) levelEl.textContent = `Lv.${level} ${names[level - 1]}`;
      if (iconEl) iconEl.textContent = icons[level - 1] || icons[0];

      // XP 进度条：当前等级到下一等级的进度
      if (xpEl) {
        const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
        const nextThreshold = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[3];
        const progress = level >= 4 ? 100 :
          ((data.xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
        xpEl.style.width = Math.min(100, Math.max(0, progress)) + '%';
      }

      // 乌云特殊处理
      if (zone === 'dark_cloud') {
        const el = document.getElementById('darkCloudZone');
        if (el) el.style.display = data.xp > 0 ? '' : 'none';
      }
    }
  }

  function renderHistory(history) {
    const list = document.getElementById('worldHistoryList');
    if (!history || history.length === 0) {
      list.innerHTML = '<div class="empty-hint">暂无数据，开始使用后会自动记录</div>';
      return;
    }
    const zoneLabels = { library:'图书馆', theater:'剧场', park:'公园',
      cafe:'咖啡馆', playground:'游乐场', diary_house:'日记小屋', dark_cloud:'乌云' };

    list.innerHTML = history.slice(-7).reverse().map(day => {
      const parts = Object.entries(day.changes)
        .map(([z, xp]) => `${zoneLabels[z] || z} +${xp}XP`).join('、');
      return `<div class="world-history-item">
        <span class="world-history-date">${day.date}</span>
        <span class="world-history-changes">${parts}</span>
      </div>`;
    }).join('');
  }

  function capitalize(s) {
    // dark_cloud → DarkCloud, library → Library
    return s.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('');
  }
})();
```

在 `index.html` 底部 `</body>` 前加 `<script src="scripts/world.js"></script>`

注意：现有的 `app.js` 中页面切换逻辑需要触发 `page-change` 事件。找到页面切换的代码，在切换后加：
```js
window.dispatchEvent(new CustomEvent('page-change', { detail: pageName }));
```

---

## 功能二：记忆小剧场（P1）

### 概述
基于当天活动数据和日记，用 AI 自动生成轻小说/VN 风格的"一日番外"。有场景描写、事件、情绪旁白，还有 2-3 个"如果当时选了另一条路"的分支选项。

### 交互流程
1. 用户在主页或日记页看到"生成小剧场"按钮（当天有日记或活动数据时显示）
2. 点击后弹出全屏浮层，AI 流式生成内容
3. 生成完毕后展示 VN 风格的卡片式对话界面
4. 底部显示 2-3 个分支选项，点击可展开对应的"平行世界"短文
5. 可保存到 `data/theater/` 目录

### 数据结构

文件：`data/theater/2026-02-11.json`

```json
{
  "date": "2026-02-11",
  "generated_at": "2026-02-11T22:30:00",
  "story": "（AI 生成的正文，Markdown 格式）",
  "branches": [
    { "label": "如果今天没有打游戏…", "text": "（分支短文）" },
    { "label": "如果选择了早起跑步…", "text": "（分支短文）" }
  ]
}
```

### Rust 后端

新建 `src-tauri/src/theater.rs`：

```rust
use crate::activity;
use crate::journal;
use crate::claude_api; // 复用 call_api_stream
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TheaterEntry {
    pub date: String,
    pub generated_at: String,
    pub story: String,
    pub branches: Vec<Branch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    pub label: String,
    pub text: String,
}

/// 加载已有的小剧场
pub fn load(data_dir: &PathBuf, date: &str) -> Option<TheaterEntry> {
    let path = data_dir.join("theater").join(format!("{}.json", date));
    if !path.exists() { return None; }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

/// 保存小剧场
pub fn save(data_dir: &PathBuf, entry: &TheaterEntry) -> Result<(), String> {
    let dir = data_dir.join("theater");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", entry.date));
    let json = serde_json::to_string_pretty(entry).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// 列出所有已生成的小剧场日期
pub fn list_dates(data_dir: &PathBuf) -> Vec<String> {
    let dir = data_dir.join("theater");
    if !dir.exists() { return vec![]; }
    let mut dates: Vec<String> = fs::read_dir(&dir)
        .into_iter().flatten()
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if name.ends_with(".json") {
                Some(name.trim_end_matches(".json").to_string())
            } else { None }
        })
        .collect();
    dates.sort();
    dates.reverse();
    dates
}
```

### commands.rs 新增

```rust
use crate::theater;

#[tauri::command]
pub fn get_theater(date: String) -> Result<Option<theater::TheaterEntry>, String> {
    Ok(theater::load(&get_data_dir(), &date))
}

#[tauri::command]
pub fn list_theater_dates() -> Result<Vec<String>, String> {
    Ok(theater::list_dates(&get_data_dir()))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn generate_theater(date: String, app: AppHandle) -> Result<String, String> {
    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }
    let data_dir = PathBuf::from(&cfg.data_dir);

    // 收集当天数据
    let entries = activity::load_entries(&data_dir, &date);
    let summary = activity::summarize(&entries);
    let journal_text = journal::load(&data_dir, &date);

    let mut user_msg = format!("请为 {} 生成一篇轻小说风格的「一日番外」。\n\n", date);

    if !summary.is_empty() {
        user_msg.push_str("今日活动：\n");
        for (cat, sec) in &summary {
            user_msg.push_str(&format!("- {}: {}分钟\n", cat, sec / 60));
        }
        user_msg.push('\n');
    }
    if !journal_text.trim().is_empty() {
        let snippet: String = journal_text.chars().take(500).collect();
        user_msg.push_str(&format!("今日日记摘要：\n{}\n\n", snippet));
    }

    let persona = crate::personality::get(&cfg.personality);
    let system_prompt = format!(
        "{}\n{}",
        persona.ai_persona,
        "你是一个轻小说风格的叙事者。根据用户的一天活动和日记，生成一篇有趣的「一日番外」。\n\
         要求：\n\
         - 第三人称视角，主角是「主人」\n\
         - 有场景描写、事件推进、情绪旁白\n\
         - 语气轻松有趣，像轻小说\n\
         - 300-500字正文\n\
         - 正文结束后，用 --- 分隔，给出2-3个「如果」分支，格式：\n\
           ## 如果xxx\n\
           （50-100字的平行世界短文）\n\
         - 用中文"
    );

    claude_api::call_api_stream(&app, &cfg.api_key, &cfg.model, &system_prompt, &user_msg).await
}
```

在 `main.rs` 加 `mod theater;`，在 `invoke_handler` 加 `commands::get_theater, commands::list_theater_dates, commands::generate_theater`

注意：`call_api_stream` 目前是私有函数，需要改为 `pub async fn call_api_stream(...)` 使其可被其他模块调用。

### 前端 - 小剧场入口

在主页的反派卡片下方加一个按钮：

```html
<!-- 小剧场入口（加在 villainCard 后面） -->
<button class="btn-theater" id="theaterBtn" style="display:none">
  <span>🎭</span> 生成今日小剧场
</button>
```

### 前端 - 小剧场浮层

在 `index.html` 的梗库弹窗后面加：

```html
<!-- 小剧场浮层 -->
<div class="theater-overlay" id="theaterOverlay">
  <div class="theater-panel">
    <div class="report-panel-header">
      <span class="report-panel-title" id="theaterTitle">🎭 一日番外</span>
      <button class="settings-close-btn" id="theaterCloseBtn">✕</button>
    </div>
    <div class="theater-content" id="theaterContent">
      <div class="empty-hint">生成中…</div>
    </div>
    <div class="theater-branches" id="theaterBranches"></div>
    <div class="theater-actions">
      <button class="btn-small" id="theaterHistoryBtn">历史小剧场</button>
    </div>
  </div>
</div>
```

### 前端 - CSS（加到 main.css 末尾）

```css
/* === 小剧场 === */
.btn-theater {
  display: flex; align-items: center; gap: 6px; justify-content: center;
  width: 100%; padding: 12px; margin-top: 12px;
  background: var(--card-bg); border: 1px dashed var(--accent, #4A9EE5);
  border-radius: 12px; color: var(--accent, #4A9EE5);
  font-size: 14px; cursor: pointer; transition: all 0.2s;
}
.btn-theater:hover { background: var(--accent, #4A9EE5); color: white; }

.theater-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: none; align-items: center; justify-content: center; z-index: 200;
}
.theater-overlay.active { display: flex; }
.theater-panel {
  background: var(--bg); border-radius: 16px;
  width: 90%; max-width: 640px; max-height: 80vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.theater-content {
  flex: 1; overflow-y: auto; padding: 20px 24px;
  font-size: 15px; line-height: 1.8; color: var(--text-primary);
  white-space: pre-wrap;
}
.theater-branches {
  padding: 0 24px 16px; display: flex; flex-direction: column; gap: 8px;
}
.theater-branch {
  background: var(--card-bg); border-radius: 10px; padding: 12px 16px;
  cursor: pointer; transition: all 0.2s; border: 1px solid var(--border-color);
}
.theater-branch:hover { border-color: var(--accent, #4A9EE5); }
.theater-branch-label { font-weight: 600; font-size: 14px; color: var(--accent, #4A9EE5); }
.theater-branch-text {
  display: none; margin-top: 8px; font-size: 13px;
  line-height: 1.6; color: var(--text-secondary);
}
.theater-branch.expanded .theater-branch-text { display: block; }
.theater-actions { padding: 12px 24px; border-top: 1px solid var(--border-color); }
```

### 前端 - JS（在 `home.js` 中添加小剧场逻辑）

```js
// === 小剧场 ===
const theaterBtn = document.getElementById('theaterBtn');
const theaterOverlay = document.getElementById('theaterOverlay');
const theaterContent = document.getElementById('theaterContent');
const theaterBranches = document.getElementById('theaterBranches');

// 有活动数据或日记时显示按钮
async function checkTheaterAvailable() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const activity = await invoke('get_today_activity');
    const journal = await invoke('load_journal', { date: today });
    if (activity.length > 0 || journal.trim()) {
      theaterBtn.style.display = '';
    }
  } catch(e) {}
}

theaterBtn?.addEventListener('click', async () => {
  theaterOverlay.classList.add('active');
  theaterContent.innerHTML = '<div class="empty-hint">生成中…</div>';
  theaterBranches.innerHTML = '';

  const today = new Date().toISOString().slice(0, 10);

  // 先检查是否已有
  try {
    const existing = await invoke('get_theater', { date: today });
    if (existing) {
      renderTheater(existing);
      return;
    }
  } catch(e) {}

  // 流式生成
  let fullText = '';
  const unlisten = await listen('ai-chunk', (e) => {
    fullText += e.payload;
    theaterContent.textContent = fullText;
  });
  const unlistenDone = await listen('ai-done', () => {
    unlisten(); unlistenDone();
    parseAndRenderTheater(today, fullText);
  });

  try {
    await invoke('generate_theater', { date: today });
  } catch(err) {
    theaterContent.innerHTML = `<div class="empty-hint">生成失败: ${err}</div>`;
    unlisten(); unlistenDone();
  }
});

function parseAndRenderTheater(date, text) {
  // 解析 AI 返回：正文 + --- + 分支
  const parts = text.split('---');
  const story = parts[0].trim();
  const branches = [];

  // 解析 ## 如果xxx 格式的分支
  if (parts.length > 1) {
    const branchText = parts.slice(1).join('---');
    const branchRegex = /##\s*(.+)\n([\s\S]*?)(?=##|$)/g;
    let match;
    while ((match = branchRegex.exec(branchText)) !== null) {
      branches.push({ label: match[1].trim(), text: match[2].trim() });
    }
  }

  const entry = { date, generated_at: new Date().toISOString(), story, branches };
  // 保存（fire and forget）
  invoke('save_theater', { entry }).catch(() => {});
  renderTheater(entry);
}

function renderTheater(entry) {
  theaterContent.textContent = entry.story;
  theaterBranches.innerHTML = entry.branches.map((b, i) =>
    `<div class="theater-branch" onclick="this.classList.toggle('expanded')">
      <div class="theater-branch-label">${b.label}</div>
      <div class="theater-branch-text">${b.text}</div>
    </div>`
  ).join('');
}

document.getElementById('theaterCloseBtn')?.addEventListener('click', () => {
  theaterOverlay.classList.remove('active');
});
```

注意：还需要在 `commands.rs` 加一个 `save_theater` 命令：
```rust
#[tauri::command]
pub fn save_theater(entry: theater::TheaterEntry) -> Result<(), String> {
    theater::save(&get_data_dir(), &entry)
}
```
并在 `invoke_handler` 注册 `commands::save_theater`

---

## 实施顺序

### Phase 1：桌面世界观
1. 创建 `world.rs`，实现数据结构和结算逻辑
2. 在 `commands.rs` 加命令，`main.rs` 注册
3. `cargo build` 确认编译通过
4. 在 `index.html` 加导航按钮和页面 HTML
5. 在 `main.css` 加世界观 CSS
6. 创建 `world.js`，实现加载和渲染
7. 在 `app.js` 页面切换处加 `page-change` 事件派发
8. 测试：打开世界观页面，确认区域卡片显示正常

### Phase 2：记忆小剧场
1. 创建 `theater.rs`，实现 CRUD
2. 把 `claude_api.rs` 的 `call_api_stream` 改为 `pub`
3. 在 `commands.rs` 加命令（含 `generate_theater`），`main.rs` 注册
4. `cargo build` 确认编译通过
5. 在 `index.html` 加小剧场按钮和浮层 HTML
6. 在 `main.css` 加小剧场 CSS
7. 在 `home.js` 加小剧场 JS 逻辑
8. 测试：有活动数据时点击生成，确认流式输出和分支展示正常

## 重要约束
- 不要用任何框架或构建工具
- 不要修改现有功能的行为
- 两个主题（浅色/深色）都要支持，用 CSS 变量
- 所有用户可见文案要用中文
- Rust 代码要能编译通过，注意 `use` 导入和模块可见性
