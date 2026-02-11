use crate::tracker::ActivityEntry;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// 分类规则
const CATEGORY_RULES: &[(&str, &[&str])] = &[
    ("编程", &[
        "code", "visual studio", "pycharm", "idea", "webstorm", "vim",
        "neovim", "sublime", "atom", "cursor", "windsurf", "devtools",
        "terminal", "powershell", "cmd.exe", "windowsterminal",
        "git", "node", "python", "java", "claude",
    ]),
    ("浏览器", &["chrome", "firefox", "edge", "msedge", "brave", "opera", "safari"]),
    ("游戏", &[
        "steam", "epicgames", "genshinimpact", "yuanshen", "game",
        "minecraft", "league", "valorant", "原神", "崩坏", "mhy",
    ]),
    ("视频", &["youtube", "bilibili", "vlc", "mpv", "potplayer", "哔哩哔哩"]),
    ("社交", &["wechat", "weixin", "telegram", "discord", "qq", "slack", "teams"]),
    ("文档", &[
        "word", "excel", "powerpoint", "wps", "notion", "obsidian",
        "typora", "notepad", "onenote",
    ]),
    ("音乐", &["spotify", "netease", "cloudmusic", "qqmusic", "网易云"]),
];

fn categorize(exe: &str, title: &str) -> &'static str {
    let text = format!("{} {}", exe, title).to_lowercase();
    for (cat, keywords) in CATEGORY_RULES {
        if keywords.iter().any(|kw| text.contains(kw)) {
            return cat;
        }
    }
    "其他"
}

/// 加载指定日期的活动记录
pub fn load_entries(data_dir: &PathBuf, date: &str) -> Vec<ActivityEntry> {
    let path = data_dir.join("activity").join(format!("{}.jsonl", date));
    let mut entries = Vec::new();
    if !path.exists() {
        return entries;
    }
    if let Ok(content) = fs::read_to_string(&path) {
        for line in content.lines() {
            let line = line.trim();
            if !line.is_empty() {
                if let Ok(entry) = serde_json::from_str::<ActivityEntry>(line) {
                    entries.push(entry);
                }
            }
        }
    }
    entries
}

/// 按分类汇总活动时长，返回有序的 Vec（按时长降序）
pub fn summarize(entries: &[ActivityEntry]) -> Vec<(String, u64)> {
    let mut map: HashMap<String, u64> = HashMap::new();
    for e in entries {
        if e.duration < 30 {
            continue;
        }
        let cat = categorize(&e.exe, &e.title);
        *map.entry(cat.to_string()).or_insert(0) += e.duration;
    }
    let mut sorted: Vec<(String, u64)> = map.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    sorted
}

/// 获取最近 N 天每天的总活动时长（秒），返回 [(日期, 秒数)]
pub fn daily_totals(data_dir: &PathBuf, days: usize) -> Vec<(String, u64)> {
    use chrono::Local;
    let today = Local::now().date_naive();
    let mut result = Vec::new();
    for i in (0..days).rev() {
        let date = today - chrono::Duration::days(i as i64);
        let ds = date.format("%Y-%m-%d").to_string();
        let entries = load_entries(data_dir, &ds);
        let total: u64 = entries.iter().map(|e| e.duration).sum();
        result.push((ds, total));
    }
    result
}

/// 获取最近 N 天的分类汇总
pub fn range_summary(data_dir: &PathBuf, days: usize) -> Vec<(String, u64)> {
    use chrono::Local;
    let today = Local::now().date_naive();
    let mut map: HashMap<String, u64> = HashMap::new();
    for i in 0..days {
        let date = today - chrono::Duration::days(i as i64);
        let ds = date.format("%Y-%m-%d").to_string();
        let entries = load_entries(data_dir, &ds);
        for e in &entries {
            if e.duration < 30 { continue; }
            let cat = categorize(&e.exe, &e.title);
            *map.entry(cat.to_string()).or_insert(0) += e.duration;
        }
    }
    let mut sorted: Vec<(String, u64)> = map.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    sorted
}
