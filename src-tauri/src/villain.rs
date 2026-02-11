use crate::activity;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct Villain {
    pub category: String,
    pub name: String,
    pub emoji: String,
    pub taunt: String,
    pub minutes: u32,
    pub growth: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SealRecord {
    pub sealed: bool,
    pub condition: Option<String>,
    pub category: String,
    pub sealed_at: String,
}

struct VillainTemplate {
    category: &'static str,
    name: &'static str,
    emoji: &'static str,
    taunt: &'static str,
}

const VILLAINS: &[VillainTemplate] = &[
    VillainTemplate { category: "游戏", name: "游戏魔王", emoji: "👾", taunt: "又来了？今天准备献祭多少时间？" },
    VillainTemplate { category: "视频", name: "深渊领主", emoji: "🌀", taunt: "再看一个？你说的\"最后一个\"呢？" },
    VillainTemplate { category: "社交", name: "话痨精灵", emoji: "💬", taunt: "聊够了吗？键盘都要冒烟了" },
    VillainTemplate { category: "浏览器", name: "冲浪幽灵", emoji: "🏄", taunt: "又在无目的地漂流了…" },
];

const TRIGGER_MIN: u32 = 30;

/// 反派成长等级（基于连续天数）
pub fn villain_growth(data_dir: &PathBuf, category: &str) -> u32 {
    let today = chrono::Local::now().date_naive();
    let mut streak = 0u32;
    for i in 0..7 {
        let date = today - chrono::Duration::days(i as i64);
        let ds = date.format("%Y-%m-%d").to_string();
        let entries = activity::load_entries(data_dir, &ds);
        let summary = activity::summarize(&entries);
        let cat_min = summary.iter()
            .find(|(c, _)| c == category)
            .map(|(_, s)| s / 60)
            .unwrap_or(0);
        if cat_min >= 30 { streak += 1; } else { break; }
    }
    streak
}

pub fn detect(data_dir: &PathBuf) -> Option<Villain> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let entries = activity::load_entries(data_dir, &today);
    let summary = activity::summarize(&entries);

    // 加载今日封印记录
    let seals = load_seals(data_dir, &today);

    // 在分心类别中找最大的
    let distract_cats = ["游戏", "视频", "社交", "浏览器"];
    let mut best: Option<(&str, u64)> = None;

    for (cat, sec) in &summary {
        if !distract_cats.contains(&cat.as_str()) { continue; }
        let min = (*sec / 60) as u32;
        if min < TRIGGER_MIN { continue; }
        // 已封印的跳过
        if seals.iter().any(|s| s.category == *cat) { continue; }
        match best {
            None => best = Some((cat, *sec)),
            Some((_, bs)) if *sec > bs => best = Some((cat, *sec)),
            _ => {}
        }
    }

    let (cat, sec) = best?;
    let tpl = VILLAINS.iter().find(|v| v.category == cat)?;
    let growth = villain_growth(data_dir, cat);

    Some(Villain {
        category: cat.to_string(),
        name: tpl.name.to_string(),
        emoji: tpl.emoji.to_string(),
        taunt: tpl.taunt.to_string(),
        minutes: (sec / 60) as u32,
        growth,
    })
}

pub fn seal(data_dir: &PathBuf, category: &str, condition: Option<String>) -> Result<(), String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let now = chrono::Local::now().format("%H:%M").to_string();

    let mut seals = load_seals(data_dir, &today);
    seals.push(SealRecord {
        sealed: true,
        condition,
        category: category.to_string(),
        sealed_at: now,
    });

    save_seals(data_dir, &today, &seals)
}

fn villain_dir(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("villain")
}

fn load_seals(data_dir: &PathBuf, date: &str) -> Vec<SealRecord> {
    let path = villain_dir(data_dir).join(format!("{}.json", date));
    if !path.exists() { return vec![]; }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_seals(data_dir: &PathBuf, date: &str, seals: &[SealRecord]) -> Result<(), String> {
    let dir = villain_dir(data_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", date));
    let json = serde_json::to_string_pretty(seals).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
