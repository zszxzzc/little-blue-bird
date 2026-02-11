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
