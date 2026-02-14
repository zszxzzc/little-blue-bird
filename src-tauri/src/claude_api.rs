use chrono::Datelike;
use crate::activity;
use crate::tracker::ActivityEntry;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;

const API_URL: &str = "https://api.deepseek.com/chat/completions";

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    temperature: f32,
    stream: bool,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct StreamChunk {
    choices: Vec<StreamChoice>,
}

#[derive(Deserialize)]
struct StreamChoice {
    delta: Delta,
}

#[derive(Deserialize)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
}

/// 格式化秒数
fn fmt_duration(sec: u64) -> String {
    if sec < 60 {
        return format!("{}s", sec);
    }
    if sec < 3600 {
        return format!("{}m", sec / 60);
    }
    let h = sec / 3600;
    let m = (sec % 3600) / 60;
    if m > 0 { format!("{}h {}m", h, m) } else { format!("{}h", h) }
}

/// 流式调用 DeepSeek API，通过事件推送每个 chunk
pub async fn call_api_stream(
    app: &AppHandle,
    api_key: &str,
    model: &str,
    system: &str,
    user_msg: &str,
) -> Result<String, String> {
    let mut headers = HeaderMap::new();
    let auth = HeaderValue::from_str(&format!("Bearer {}", api_key))
        .map_err(|e| format!("API key 无效: {}", e))?;
    headers.insert(AUTHORIZATION, auth);
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    let body = ChatRequest {
        model: model.to_string(),
        messages: vec![
            Message { role: "system".to_string(), content: system.to_string() },
            Message { role: "user".to_string(), content: user_msg.to_string() },
        ],
        temperature: 0.7,
        stream: true,
    };

    let client = reqwest::Client::new();
    let resp = client.post(API_URL)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("API 返回 {}: {}", status, text));
    }

    let mut full_text = String::new();
    let mut stream = resp.bytes_stream();
    let mut pending = String::new();
    let mut done = false;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取流失败: {}", e))?;
        pending.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = pending.find('\n') {
            let line = pending[..pos].trim().to_string();
            pending.drain(..=pos);
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                done = true;
                break;
            }

            if let Ok(parsed) = serde_json::from_str::<StreamChunk>(data) {
                if let Some(choice) = parsed.choices.first() {
                    if let Some(ref content) = choice.delta.content {
                        full_text.push_str(content);
                        let _ = app.emit("ai-chunk", content.clone());
                    }
                }
            }
        }
        if done {
            break;
        }
    }

    let tail = pending.trim();
    if !done && tail.starts_with("data: ") {
        let data = &tail[6..];
        if data != "[DONE]" {
            if let Ok(parsed) = serde_json::from_str::<StreamChunk>(data) {
                if let Some(choice) = parsed.choices.first() {
                    if let Some(ref content) = choice.delta.content {
                        full_text.push_str(content);
                        let _ = app.emit("ai-chunk", content.clone());
                    }
                }
            }
        }
    }

    let _ = app.emit("ai-done", ());

    if full_text.trim().is_empty() {
        return Err("API 返回空内容".to_string());
    }
    Ok(full_text.trim().to_string())
}

/// 生成日记
pub async fn generate(
    app: &AppHandle,
    api_key: &str,
    model: &str,
    language: &str,
    personality: &str,
    date: &str,
    existing_text: &str,
    data_dir: &PathBuf,
) -> Result<String, String> {
    let entries = activity::load_entries(data_dir, date);
    let summary = activity::summarize(&entries);

    let mut activity_text = String::new();
    if !summary.is_empty() {
        activity_text.push_str("今日活动统计：\n");
        for (cat, secs) in &summary {
            activity_text.push_str(&format!("- {}: {}\n", cat, fmt_duration(*secs)));
        }
        let recent: Vec<&ActivityEntry> = entries.iter().rev().take(30).collect();
        if !recent.is_empty() {
            activity_text.push_str("\n详细活动记录：\n");
            for e in recent.iter().rev() {
                let ts = if e.ts.len() >= 16 { &e.ts[11..16] } else { &e.ts };
                activity_text.push_str(&format!(
                    "  {} [{}] {} ({})\n",
                    ts, e.exe, e.title, fmt_duration(e.duration)
                ));
            }
        }
    }

    let weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    let weekday = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|d| weekdays[d.weekday().num_days_from_monday() as usize])
        .unwrap_or("未知");

    let mut user_msg = format!("请根据以下信息，为 {} {} 写一篇日记。\n\n", date, weekday);
    if !activity_text.is_empty() {
        user_msg.push_str(&activity_text);
        user_msg.push('\n');
    }
    if !existing_text.is_empty() {
        user_msg.push_str(&format!("用户手动备注：\n{}\n\n", existing_text));
    }
    if activity_text.is_empty() && existing_text.is_empty() {
        user_msg.push_str("（今天没有活动数据和备注，请写一篇简短的日记占位。）\n\n");
    }
    match language {
        "bilingual" => user_msg.push_str("请使用混合格式：先写中文正文，然后分隔线 ---，再写英文版本。"),
        "english" => user_msg.push_str("Please write the journal in English."),
        _ => user_msg.push_str("请使用中文写日记。"),
    }

    let persona = crate::personality::get(personality);
    let system_prompt = format!(
        "{}\n{}",
        persona.ai_persona,
        concat!(
            "你是一个日记助手。根据用户提供的电脑活动数据和备注，写一篇自然的日记。\n",
            "要求：\n",
            "- 第一人称\n",
            "- 按时间/事件顺序组织\n",
            "- 润色总结，不是流水账。提炼、归纳，合并同类事项\n",
            "- 技术细节适当简化，记录做了什么和结果如何\n",
            "- 保留情绪和感受\n",
            "- 语气自然口语化\n",
            "- 格式：# YYYY-MM-DD 星期X 开头\n",
            "- 如果是双语，中文在上，英文在下，用 --- 分隔\n",
            "- 末尾加 *记录时间：HH:MM*",
        )
    );

    call_api_stream(app, api_key, model, &system_prompt, &user_msg).await
}

/// 整理日记
pub async fn organize(
    app: &AppHandle,
    api_key: &str,
    model: &str,
    language: &str,
    personality: &str,
    date: &str,
    raw_content: &str,
) -> Result<String, String> {
    if raw_content.trim().is_empty() {
        return Err("没有内容可以整理".to_string());
    }

    let weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    let weekday = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|d| weekdays[d.weekday().num_days_from_monday() as usize])
        .unwrap_or("未知");

    let mut user_msg = format!(
        "请将以下 {} {} 的日记内容整理成一篇连贯的日记：\n\n{}\n\n",
        date, weekday, raw_content
    );

    match language {
        "bilingual" => user_msg.push_str("请使用混合格式：先写中文正文，然后分隔线 ---，再写英文版本。"),
        "english" => user_msg.push_str("Please write the journal in English."),
        _ => user_msg.push_str("请使用中文写日记。"),
    }

    let persona = crate::personality::get(personality);
    let system_prompt = format!(
        "{}\n{}",
        persona.ai_persona,
        concat!(
            "你是一个日记整理助手。用户会给你一段日记内容，可能包含：已有的完整日记、用户新加的笔记、AI生成的片段等。\n",
            "你的任务是将它们整合成一篇连贯自然的日记。\n",
            "核心原则：\n",
            "- 绝对不能丢失任何用户写的内容，每一句用户新增的话都必须体现在最终结果中\n",
            "- 用户新加的笔记要融入到日记的合适位置，不能忽略或吞掉\n",
            "- 如果原文已经很完整，只需要把新增内容自然地插入到对应位置即可，不要大幅重写\n",
            "格式要求：\n",
            "- 第一人称\n",
            "- 按时间/事件顺序组织\n",
            "- 语气自然口语化\n",
            "- 格式：# YYYY-MM-DD 星期X 开头\n",
            "- 如果是双语，中文在上，英文在下，用 --- 分隔，新增内容两个语言版本都要加\n",
            "- 末尾加 *记录时间：HH:MM*",
        )
    );

    call_api_stream(app, api_key, model, &system_prompt, &user_msg).await
}

/// 生成周报/月报
pub async fn report(
    app: &AppHandle,
    api_key: &str,
    model: &str,
    language: &str,
    personality: &str,
    days: usize,
    data_dir: &PathBuf,
) -> Result<String, String> {
    use crate::journal;
    let today = chrono::Local::now().date_naive();
    let report_type = if days <= 7 { "周报" } else { "月报" };

    let mut journal_parts = Vec::new();
    for i in 0..days {
        let date = today - chrono::Duration::days(i as i64);
        let ds = date.format("%Y-%m-%d").to_string();
        let content = journal::load(data_dir, &ds);
        if !content.trim().is_empty() {
            let snippet: String = content.chars().take(200).collect();
            journal_parts.push(format!("【{}】{}", ds, snippet));
        }
    }

    let daily = activity::daily_totals(data_dir, days);
    let cats = activity::range_summary(data_dir, days);

    let mut user_msg = format!("请根据以下数据生成一份{}（最近 {} 天）。\n\n", report_type, days);

    if !daily.is_empty() {
        user_msg.push_str("每日活动时长：\n");
        for (date, sec) in &daily {
            if *sec > 0 {
                user_msg.push_str(&format!("- {}: {}\n", date, fmt_duration(*sec)));
            }
        }
        user_msg.push('\n');
    }

    if !cats.is_empty() {
        user_msg.push_str("分类汇总：\n");
        for (cat, sec) in &cats {
            user_msg.push_str(&format!("- {}: {}\n", cat, fmt_duration(*sec)));
        }
        user_msg.push('\n');
    }

    if !journal_parts.is_empty() {
        user_msg.push_str("日记摘要：\n");
        for part in &journal_parts {
            user_msg.push_str(&format!("{}\n", part));
        }
        user_msg.push('\n');
    }

    match language {
        "english" => user_msg.push_str("Please write the report in English."),
        _ => user_msg.push_str("请使用中文。"),
    }

    let persona = crate::personality::get(personality);
    let system_prompt = format!(
        "{}\n你是一个{rt}助手。根据用户提供的活动数据和日记摘要，生成一份简洁的{rt}。\n\
         要求：总结主要活动和成果、分析时间分配、提出简短改进建议、语气轻松友好、Markdown 格式、300 字以内。",
        persona.ai_persona, rt = report_type
    );

    call_api_stream(app, api_key, model, &system_prompt, &user_msg).await
}
