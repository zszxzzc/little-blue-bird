use crate::activity;
use crate::config;
use crate::journal;
use crate::memes;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct ChickMood {
    pub mood: String,
    pub greeting: String,  // 问候语（可能包含梗）
    pub message: String,
    pub goal_pct: u32,  // 目标完成百分比 0-100
}

/// 根据当前状态评估小鸡心情
pub fn evaluate(data_dir: &PathBuf) -> ChickMood {
    let mut result = evaluate_inner(data_dir);
    let cfg = config::load_config();

    // 生成 greeting（固定问候语 + 可能的梗）
    let base_greeting = crate::personality::get_greeting(&cfg.personality, &result.mood);
    result.greeting = base_greeting.to_string();

    // 80% 概率附加一条梗到 greeting
    if should_append_meme() {
        if let Some(meme) = memes::random_meme(data_dir) {
            let text = crate::personality::format_meme(&cfg.personality, &meme.meme_text, meme.count);
            result.greeting = format!("{}  {}", result.greeting, text);
        }
    }

    // 社交过载提醒（附加到 message）
    let social = crate::social::evaluate(data_dir);
    if social.overloaded {
        let tip = crate::personality::social_overload_msg(&cfg.personality);
        result.message = format!("{}  {}", result.message, tip);
    }

    result
}

fn should_append_meme() -> bool {
    use std::time::SystemTime;
    let n = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    n % 100 < 80
}

fn evaluate_inner(data_dir: &PathBuf) -> ChickMood {
    let now = chrono::Local::now();
    let hour = now.format("%H").to_string().parse::<u32>().unwrap_or(12);
    let today = now.format("%Y-%m-%d").to_string();
    let cfg = config::load_config();
    let p = crate::personality::get(&cfg.personality);
    let goal_min = cfg.daily_goal_minutes;

    // 1. 深夜检测
    if hour >= 23 || hour < 5 {
        return ChickMood {
            mood: "sleepy".into(),
            greeting: String::new(),
            message: p.mood_sleepy.into(),
            goal_pct: 0,
        };
    }

    // 2. 加载今日活动
    let entries = activity::load_entries(data_dir, &today);
    let summary = activity::summarize(&entries);
    let total_sec: u64 = entries.iter().map(|e| e.duration).sum();

    // 计算目标进度
    let goal_pct = if goal_min > 0 {
        ((total_sec as f64 / (goal_min * 60) as f64) * 100.0).min(100.0) as u32
    } else {
        0
    };

    // 3. 检查日记状态
    let has_journal_today = !journal::load(data_dir, &today).trim().is_empty();

    // 4. 检查最近几天日记连续性
    let missed_days = count_missed_journal_days(data_dir, &now);

    // 5. 分析活动分类
    let gaming_sec = cat_duration(&summary, "游戏");
    let coding_sec = cat_duration(&summary, "编程");
    let doc_sec = cat_duration(&summary, "文档");
    let productive_sec = coding_sec + doc_sec;

    // === 心情判定 ===

    // 连续多天没写日记 → 难过
    if missed_days >= 3 {
        return ChickMood {
            mood: "sad".into(),
            greeting: String::new(),
            message: format!("{}", p.mood_sad.replace("{}", &missed_days.to_string())),
            goal_pct,
        };
    }

    // 游戏时间超过 2 小时且占比过高 → 不满
    if gaming_sec > 7200 && gaming_sec as f64 / (total_sec.max(1) as f64) > 0.5 {
        return ChickMood {
            mood: "unimpressed".into(),
            greeting: String::new(),
            message: p.mood_unimpressed.into(),
            goal_pct,
        };
    }

    // 达成每日目标 → 兴奋
    if goal_min > 0 && goal_pct >= 100 {
        return ChickMood {
            mood: "excited".into(),
            greeting: String::new(),
            message: p.mood_excited_goal.into(),
            goal_pct,
        };
    }

    // 高效工作超过 3 小时 → 兴奋
    if productive_sec > 10800 {
        return ChickMood {
            mood: "excited".into(),
            greeting: String::new(),
            message: p.mood_excited_productive.into(),
            goal_pct,
        };
    }

    // 写了日记 → 满足
    if has_journal_today {
        return ChickMood {
            mood: "content".into(),
            greeting: String::new(),
            message: p.mood_content.into(),
            goal_pct,
        };
    }

    // 有一定活动量 → 开心
    if total_sec > 1800 {
        return ChickMood {
            mood: "happy".into(),
            greeting: String::new(),
            message: p.mood_happy.into(),
            goal_pct,
        };
    }

    // 早上还没开始 → 正常问候
    if hour < 10 {
        return ChickMood {
            mood: "happy".into(),
            greeting: String::new(),
            message: morning_greeting(hour, p),
            goal_pct,
        };
    }

    // 没什么活动 → 无聊
    ChickMood {
        mood: "bored".into(),
        greeting: String::new(),
        message: p.mood_bored.into(),
        goal_pct,
    }
}

fn cat_duration(summary: &[(String, u64)], cat: &str) -> u64 {
    summary.iter()
        .find(|(c, _)| c == cat)
        .map(|(_, d)| *d)
        .unwrap_or(0)
}

fn count_missed_journal_days(data_dir: &PathBuf, now: &chrono::DateTime<chrono::Local>) -> u32 {
    let today = now.date_naive();
    let mut missed = 0;
    for i in 1..=7 {
        let date = today - chrono::Duration::days(i);
        let ds = date.format("%Y-%m-%d").to_string();
        let content = journal::load(data_dir, &ds);
        if content.trim().is_empty() {
            missed += 1;
        } else {
            break; // 遇到有日记的就停
        }
    }
    missed
}

fn morning_greeting(hour: u32, p: &crate::personality::PersonalityText) -> String {
    match hour {
        5..=7 => p.morning_early.into(),
        8..=9 => p.morning_normal.into(),
        _ => p.morning_default.into(),
    }
}
