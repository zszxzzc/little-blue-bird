use crate::activity;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemeEntry {
    pub pattern: String,
    pub meme_text: String,
    pub count: u32,
    pub last_seen: String,
}

/// 扫描最近 7 天数据，提取行为模式生成梗
pub fn scan_patterns(data_dir: &PathBuf) -> Vec<MemeEntry> {
    let today = chrono::Local::now().date_naive();
    let mut memes = Vec::new();

    // 收集每天的数据
    let mut daily_data: Vec<DayInfo> = Vec::new();
    for i in 0..7 {
        let date = today - chrono::Duration::days(i as i64);
        let ds = date.format("%Y-%m-%d").to_string();
        let entries = activity::load_entries(data_dir, &ds);
        if entries.is_empty() { continue; }
        let summary = activity::summarize(&entries);
        let total_sec: u64 = entries.iter().map(|e| e.duration).sum();
        let has_late_night = entries.iter().any(|e| {
            if let Some(h) = parse_hour(&e.ts) {
                h >= 23 || h < 4
            } else { false }
        });
        // 统计每个 exe 出现
        let mut exe_set: HashMap<String, u64> = HashMap::new();
        for e in &entries {
            if e.duration < 30 { continue; }
            let key = e.exe.to_lowercase();
            *exe_set.entry(key).or_insert(0) += e.duration;
        }
        let weekday = date.format("%u").to_string().parse::<u32>().unwrap_or(1);
        daily_data.push(DayInfo {
            date: ds,
            summary,
            total_sec,
            has_late_night,
            exe_map: exe_set,
            is_weekend: weekday >= 6,
        });
    }

    if daily_data.is_empty() { return memes; }

    // 模式1: 夜猫子 — 连续 3+ 天深夜有活动
    check_night_owl(&daily_data, &mut memes);
    // 模式2: XX 沉迷者 — 某分类连续 3+ 天占比 >40%
    check_category_addict(&daily_data, &mut memes);
    // 模式3: 老朋友 {exe} — 某 exe 连续 5+ 天出现
    check_old_friend(&daily_data, &mut memes);
    // 模式4: 周末战士 — 周末游戏时长 > 工作日 3 倍
    check_weekend_warrior(&daily_data, &mut memes);

    memes
}

pub fn load(data_dir: &PathBuf) -> Vec<MemeEntry> {
    let path = data_dir.join("memes.jsonl");
    if !path.exists() { return vec![]; }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    content.lines()
        .filter_map(|l| serde_json::from_str(l.trim()).ok())
        .collect()
}

pub fn save(data_dir: &PathBuf, memes: &[MemeEntry]) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let path = data_dir.join("memes.jsonl");
    let lines: Vec<String> = memes.iter()
        .filter_map(|m| serde_json::to_string(m).ok())
        .collect();
    fs::write(&path, lines.join("\n")).map_err(|e| e.to_string())
}

/// 手动添加一条梗
pub fn add(data_dir: &PathBuf, meme_text: String) -> Result<(), String> {
    let mut memes = load(data_dir);
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    memes.push(MemeEntry {
        pattern: "custom".into(),
        meme_text,
        count: 1,
        last_seen: today,
    });
    save(data_dir, &memes)
}

/// 删除指定索引的梗
pub fn remove(data_dir: &PathBuf, index: usize) -> Result<(), String> {
    let mut memes = load(data_dir);
    if index >= memes.len() {
        return Err("索引超出范围".into());
    }
    memes.remove(index);
    save(data_dir, &memes)
}

/// 随机取一条梗（如果有的话）
pub fn random_meme(data_dir: &PathBuf) -> Option<MemeEntry> {
    let memes = load(data_dir);
    if memes.is_empty() { return None; }
    let idx = simple_rand() % memes.len();
    Some(memes[idx].clone())
}

// === 内部辅助 ===

struct DayInfo {
    date: String,
    summary: Vec<(String, u64)>,
    total_sec: u64,
    has_late_night: bool,
    exe_map: HashMap<String, u64>,
    is_weekend: bool,
}

fn parse_hour(ts: &str) -> Option<u32> {
    // ts 格式: "2025-01-15T23:45:00" 或 "HH:MM:SS" 等
    if ts.len() >= 13 && ts.contains('T') {
        ts[11..13].parse().ok()
    } else if ts.len() >= 2 {
        ts[0..2].parse().ok()
    } else {
        None
    }
}

fn simple_rand() -> usize {
    use std::time::SystemTime;
    let d = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    // 混合秒和纳秒，避免短时间内重复
    let secs = d.as_secs() as usize;
    let nanos = d.subsec_nanos() as usize;
    secs.wrapping_mul(2654435761) ^ nanos
}

fn check_night_owl(days: &[DayInfo], memes: &mut Vec<MemeEntry>) {
    let consecutive = days.iter()
        .take_while(|d| d.has_late_night)
        .count();
    if consecutive >= 3 {
        memes.push(MemeEntry {
            pattern: "night_owl".into(),
            meme_text: "夜猫子认证！连续{}天深夜活跃".into(),
            count: consecutive as u32,
            last_seen: days[0].date.clone(),
        });
    }
}

fn check_category_addict(days: &[DayInfo], memes: &mut Vec<MemeEntry>) {
    let cats = ["编程", "浏览器", "游戏", "视频", "社交", "文档", "音乐"];
    for cat in &cats {
        let consecutive = days.iter()
            .take_while(|d| {
                if d.total_sec == 0 { return false; }
                let cat_sec = d.summary.iter()
                    .find(|(c, _)| c == cat)
                    .map(|(_, s)| *s)
                    .unwrap_or(0);
                (cat_sec as f64 / d.total_sec as f64) > 0.4
            })
            .count();
        if consecutive >= 3 {
            memes.push(MemeEntry {
                pattern: format!("addict_{}", cat),
                meme_text: format!("{}沉迷者！连续{{}}天占比超40%", cat),
                count: consecutive as u32,
                last_seen: days[0].date.clone(),
            });
        }
    }
}

fn check_old_friend(days: &[DayInfo], memes: &mut Vec<MemeEntry>) {
    // 收集所有出现过的 exe
    let mut all_exes: HashMap<String, u32> = HashMap::new();
    for d in days {
        for exe in d.exe_map.keys() {
            *all_exes.entry(exe.clone()).or_insert(0) += 1;
        }
    }
    for (exe, count) in &all_exes {
        if *count >= 5 {
            // 取一个友好的名字（去掉 .exe 后缀）
            let friendly = exe.replace(".exe", "").replace(".app", "");
            memes.push(MemeEntry {
                pattern: format!("old_friend_{}", exe),
                meme_text: format!("老朋友 {} 又来了！连续{{}}天形影不离", friendly),
                count: *count,
                last_seen: days[0].date.clone(),
            });
        }
    }
}

fn check_weekend_warrior(days: &[DayInfo], memes: &mut Vec<MemeEntry>) {
    let mut weekend_gaming: u64 = 0;
    let mut weekday_gaming: u64 = 0;
    let mut weekend_days = 0u32;
    let mut weekday_days = 0u32;

    for d in days {
        let gaming = d.summary.iter()
            .find(|(c, _)| c == "游戏")
            .map(|(_, s)| *s)
            .unwrap_or(0);
        if d.is_weekend {
            weekend_gaming += gaming;
            weekend_days += 1;
        } else {
            weekday_gaming += gaming;
            weekday_days += 1;
        }
    }

    if weekend_days > 0 && weekday_days > 0 {
        let avg_weekend = weekend_gaming / weekend_days as u64;
        let avg_weekday = weekday_gaming.max(1) / weekday_days as u64;
        if avg_weekday > 0 && avg_weekend > avg_weekday * 3 {
            memes.push(MemeEntry {
                pattern: "weekend_warrior".into(),
                meme_text: "周末战士！周末游戏时长是工作日的{}倍".into(),
                count: (avg_weekend / avg_weekday) as u32,
                last_seen: days[0].date.clone(),
            });
        }
    }
}
