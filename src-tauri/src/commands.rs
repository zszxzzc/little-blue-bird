use crate::config::{self, AppConfig};
use crate::tracker::Tracker;
use crate::tray_icon;
use crate::activity;
use crate::journal;
use crate::claude_api;
use crate::memes;
use crate::mood;
use crate::social;
use crate::villain;
use crate::world;
use crate::theater;
use crate::vocab;
use crate::inspiration;
use crate::writing;
use crate::ai_provider;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State, image::Image};

pub struct TrackerState(pub Mutex<Tracker>);
pub struct TrayState(pub Mutex<Option<tauri::tray::TrayIcon>>);

#[tauri::command]
pub fn get_config() -> Result<AppConfig, String> {
    Ok(config::load_config())
}

#[tauri::command]
pub fn save_config(cfg: AppConfig) -> Result<(), String> {
    config::save_config_to_file(&cfg)
}

#[tauri::command]
pub fn start_monitor(state: State<TrackerState>, tray: State<TrayState>, app: AppHandle) -> Result<(), String> {
    let mut tracker = state.0.lock().map_err(|e| e.to_string())?;
    let handle = app.clone();
    tracker.start(move |entry| {
        let _ = handle.emit("new-activity-entry", &entry);
    });

    // 切换为绿色鸟
    if let Some(ref tray_icon) = *tray.0.lock().unwrap() {
        let green = tray_icon::green_bird();
        let _ = tray_icon.set_icon(Some(Image::new_owned(green, 64, 64)));
        let _ = tray_icon.set_tooltip(Some("小蓝鸟 - 监测中"));
    }
    Ok(())
}

#[tauri::command]
pub fn stop_monitor(state: State<TrackerState>, tray: State<TrayState>) -> Result<(), String> {
    let mut tracker = state.0.lock().map_err(|e| e.to_string())?;
    tracker.stop();

    // 切换为灰色鸟
    if let Some(ref tray_icon) = *tray.0.lock().unwrap() {
        let gray = tray_icon::gray_bird();
        let _ = tray_icon.set_icon(Some(Image::new_owned(gray, 64, 64)));
        let _ = tray_icon.set_tooltip(Some("小蓝鸟 - 已停止"));
    }
    Ok(())
}

#[tauri::command]
pub fn get_monitor_status(state: State<TrackerState>) -> Result<bool, String> {
    let tracker = state.0.lock().map_err(|e| e.to_string())?;
    Ok(tracker.is_running())
}

fn get_data_dir() -> PathBuf {
    let cfg = config::load_config();
    PathBuf::from(&cfg.data_dir)
}

#[tauri::command]
pub fn get_today_activity() -> Result<Vec<crate::tracker::ActivityEntry>, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(activity::load_entries(&get_data_dir(), &today))
}

#[tauri::command]
pub fn load_activity(date: String) -> Result<Vec<crate::tracker::ActivityEntry>, String> {
    Ok(activity::load_entries(&get_data_dir(), &date))
}

#[tauri::command]
pub fn get_activity_summary(date: String) -> Result<HashMap<String, u64>, String> {
    let entries = activity::load_entries(&get_data_dir(), &date);
    let summary = activity::summarize(&entries);
    Ok(summary.into_iter().collect())
}

#[tauri::command]
pub fn get_daily_totals(days: usize) -> Result<Vec<(String, u64)>, String> {
    Ok(activity::daily_totals(&get_data_dir(), days))
}

#[tauri::command]
pub fn get_range_summary(days: usize) -> Result<Vec<(String, u64)>, String> {
    Ok(activity::range_summary(&get_data_dir(), days))
}

#[tauri::command]
pub fn load_journal(date: String) -> Result<String, String> {
    Ok(journal::load(&get_data_dir(), &date))
}

#[tauri::command]
pub fn save_journal(date: String, content: String) -> Result<(), String> {
    journal::save(&get_data_dir(), &date, &content)
}

#[tauri::command]
pub fn delete_journal(date: String) -> Result<(), String> {
    journal::delete(&get_data_dir(), &date)
}

#[tauri::command]
pub fn list_journal_dates() -> Result<Vec<String>, String> {
    Ok(journal::list_dates(&get_data_dir()))
}

#[tauri::command]
pub fn search_journals(keyword: String) -> Result<Vec<(String, String)>, String> {
    if keyword.trim().is_empty() {
        return Ok(vec![]);
    }
    Ok(journal::search(&get_data_dir(), &keyword))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_generate(date: String, existing_text: String, app: AppHandle) -> Result<String, String> {
    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }
    let data_dir = PathBuf::from(&cfg.data_dir);
    claude_api::generate(&app, &cfg.api_key, &cfg.model, &cfg.language, &cfg.personality, &date, &existing_text, &data_dir).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_organize(date: String, raw_content: String, app: AppHandle) -> Result<String, String> {
    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }
    claude_api::organize(&app, &cfg.api_key, &cfg.model, &cfg.language, &cfg.personality, &date, &raw_content).await
}

#[tauri::command]
pub async fn ai_report(days: usize, app: AppHandle) -> Result<String, String> {
    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }
    let data_dir = PathBuf::from(&cfg.data_dir);
    claude_api::report(&app, &cfg.api_key, &cfg.model, &cfg.language, &cfg.personality, days, &data_dir).await
}

#[tauri::command]
pub async fn pick_and_read_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("选择要导入的日记文件")
        .add_filter("文本文件", &["txt", "md"])
        .pick_file(move |path| {
            let content = path.and_then(|p| {
                std::fs::read_to_string(p.as_path()?).ok()
            });
            let _ = tx.send(content);
        });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browse_directory(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("选择数据存放目录")
        .pick_folder(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chick_mood() -> Result<mood::ChickMood, String> {
    Ok(mood::evaluate(&get_data_dir()))
}

#[tauri::command]
pub fn get_social_status() -> Result<social::SocialStatus, String> {
    Ok(social::evaluate(&get_data_dir()))
}

#[tauri::command]
pub fn get_today_villain() -> Result<Option<villain::Villain>, String> {
    Ok(villain::detect(&get_data_dir()))
}

#[tauri::command]
pub fn seal_villain(category: String, condition: Option<String>) -> Result<(), String> {
    villain::seal(&get_data_dir(), &category, condition)
}

#[tauri::command]
pub fn get_memes() -> Result<Vec<memes::MemeEntry>, String> {
    Ok(memes::load(&get_data_dir()))
}

#[tauri::command]
pub fn refresh_memes() -> Result<Vec<memes::MemeEntry>, String> {
    let data_dir = get_data_dir();
    let scanned = memes::scan_patterns(&data_dir);
    // 保留手动添加的梗，只替换自动检测的
    let existing = memes::load(&data_dir);
    let custom: Vec<_> = existing.into_iter().filter(|m| m.pattern == "custom").collect();
    let mut merged = scanned;
    merged.extend(custom);
    memes::save(&data_dir, &merged)?;
    Ok(merged)
}

#[tauri::command]
pub fn add_meme(meme_text: String) -> Result<(), String> {
    memes::add(&get_data_dir(), meme_text)
}

#[tauri::command]
pub fn delete_meme(index: usize) -> Result<(), String> {
    memes::remove(&get_data_dir(), index)
}

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

#[tauri::command]
pub fn get_theater(date: String) -> Result<Option<theater::TheaterEntry>, String> {
    Ok(theater::load(&get_data_dir(), &date))
}

#[tauri::command]
pub fn list_theater_dates() -> Result<Vec<String>, String> {
    Ok(theater::list_dates(&get_data_dir()))
}

#[tauri::command]
pub fn save_theater(entry: theater::TheaterEntry) -> Result<(), String> {
    theater::save(&get_data_dir(), &entry)
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

    let user_msg = format!(
        "请将以下灵感碎片炼金合成（请给出全新的、不同于之前的创意角度，seed={}）：\n{}",
        chrono::Local::now().timestamp_millis(),
        material
    );
    claude_api::call_api_stream(&app, &cfg.api_key, &cfg.model, &system_prompt, &user_msg).await
}

#[tauri::command]
pub fn get_personality_growth() -> Result<crate::personality::PersonalityGrowth, String> {
    Ok(crate::personality::load_growth(&get_data_dir()))
}

#[tauri::command]
pub fn add_personality_affinity(amount: u32) -> Result<crate::personality::PersonalityGrowth, String> {
    Ok(crate::personality::add_affinity(&get_data_dir(), amount))
}

// === 写作模块命令 ===

#[tauri::command]
pub fn get_writing_structure() -> Result<writing::WritingStructure, String> {
    Ok(writing::load_structure(&get_data_dir()))
}

#[tauri::command]
pub fn create_volume(title: String) -> Result<writing::WritingStructure, String> {
    writing::create_volume(&get_data_dir(), title)
}

#[tauri::command]
pub fn create_chapter(volume_id: String, title: String) -> Result<writing::WritingStructure, String> {
    writing::create_chapter(&get_data_dir(), volume_id, title)
}

#[tauri::command]
pub fn update_volume(volume_id: String, title: String) -> Result<writing::WritingStructure, String> {
    writing::update_volume(&get_data_dir(), volume_id, title)
}

#[tauri::command]
pub fn update_chapter(volume_id: String, chapter_id: String, title: String) -> Result<writing::WritingStructure, String> {
    writing::update_chapter(&get_data_dir(), volume_id, chapter_id, title)
}

#[tauri::command]
pub fn delete_volume(volume_id: String) -> Result<writing::WritingStructure, String> {
    writing::delete_volume(&get_data_dir(), volume_id)
}

#[tauri::command]
pub fn delete_chapter(volume_id: String, chapter_id: String) -> Result<writing::WritingStructure, String> {
    writing::delete_chapter(&get_data_dir(), volume_id, chapter_id)
}

#[tauri::command]
pub fn load_chapter_content(chapter_id: String) -> String {
    writing::load_chapter_content(&get_data_dir(), chapter_id)
}

#[tauri::command]
pub fn save_chapter_content(chapter_id: String, content: String) -> Result<(), String> {
    writing::save_chapter_content(&get_data_dir(), chapter_id, content)
}

#[tauri::command]
pub fn get_info_panel() -> Result<writing::InfoPanel, String> {
    Ok(writing::load_info_panel(&get_data_dir()))
}

#[tauri::command]
pub fn add_info_item(panel_type: String, content: String) -> Result<writing::InfoPanel, String> {
    writing::add_info_item(&get_data_dir(), panel_type, content)
}

#[tauri::command]
pub fn delete_info_item(panel_type: String, item_id: String) -> Result<writing::InfoPanel, String> {
    writing::delete_info_item(&get_data_dir(), panel_type, item_id)
}

#[tauri::command]
pub fn load_chapter_memo(chapter_id: String) -> writing::ChapterMemo {
    writing::load_chapter_memo(&get_data_dir(), chapter_id)
}

#[tauri::command]
pub fn save_chapter_memo(memo: writing::ChapterMemo) -> Result<(), String> {
    writing::save_chapter_memo(&get_data_dir(), &memo)
}

#[tauri::command]
pub fn update_chapter_status(volume_id: String, chapter_id: String, status: String) -> Result<writing::WritingStructure, String> {
    writing::update_chapter_status(&get_data_dir(), volume_id, chapter_id, status)
}

// === 人物系统命令 ===

#[tauri::command]
pub fn get_characters() -> Result<writing::CharacterStore, String> {
    Ok(writing::load_characters(&get_data_dir()))
}

#[tauri::command]
pub fn add_character(character: writing::Character) -> Result<writing::CharacterStore, String> {
    writing::add_character(&get_data_dir(), character)
}

#[tauri::command]
pub fn update_character(character: writing::Character) -> Result<writing::CharacterStore, String> {
    writing::update_character(&get_data_dir(), character)
}

#[tauri::command]
pub fn delete_character(character_id: String) -> Result<writing::CharacterStore, String> {
    writing::delete_character(&get_data_dir(), &character_id)
}

#[tauri::command]
pub fn get_character_chapters(char_id: String) -> Result<Vec<writing::CharacterChapter>, String> {
    Ok(writing::get_character_chapters(&get_data_dir(), &char_id))
}

// === 伏笔追踪命令 ===

#[tauri::command]
pub fn get_foreshadows() -> Result<writing::ForeshadowStore, String> {
    Ok(writing::get_foreshadows_with_urgency(&get_data_dir()))
}

#[tauri::command]
pub fn add_foreshadow(foreshadow: writing::Foreshadow) -> Result<writing::ForeshadowStore, String> {
    writing::add_foreshadow(&get_data_dir(), foreshadow)
}

#[tauri::command(rename_all = "snake_case")]
pub fn resolve_foreshadow(foreshadow_id: String, resolved_chapter: String, resolved_quote: String) -> Result<writing::ForeshadowStore, String> {
    writing::resolve_foreshadow(&get_data_dir(), &foreshadow_id, resolved_chapter, resolved_quote)
}

#[tauri::command]
pub fn delete_foreshadow(foreshadow_id: String) -> Result<writing::ForeshadowStore, String> {
    writing::delete_foreshadow(&get_data_dir(), &foreshadow_id)
}

// === 字数统计命令 ===

#[tauri::command]
pub fn get_writing_stats(chapter_id: String) -> Result<writing::WritingStats, String> {
    Ok(writing::get_writing_stats(&get_data_dir(), &chapter_id))
}

// === 保存章节时扫描人物出场 ===

#[tauri::command]
pub fn save_chapter_content_with_scan(chapter_id: String, content: String) -> Result<(), String> {
    writing::save_chapter_content(&get_data_dir(), chapter_id, content.clone())?;
    // 保存后扫描人物出场
    writing::scan_character_mentions(&get_data_dir(), &content)?;
    Ok(())
}

// === 书籍管理命令 ===

#[tauri::command]
pub fn create_book(title: String) -> Result<writing::BookMeta, String> {
    writing::create_book(&get_data_dir(), title)
}

#[tauri::command]
pub fn get_book_meta(book_id: String) -> Result<writing::BookMeta, String> {
    writing::load_book_meta(&get_data_dir(), &book_id)
}

#[tauri::command]
pub fn update_book_meta(meta: writing::BookMeta) -> Result<(), String> {
    writing::save_book_meta(&get_data_dir(), &meta)
}

#[tauri::command(rename_all = "snake_case")]
pub fn rename_chapter_cmd(book_id: String, chapter_id: String, title: String) -> Result<(), String> {
    writing::rename_chapter(&get_data_dir(), &book_id, &chapter_id, title)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_book_chapter_status(book_id: String, chapter_id: String, status: String) -> Result<(), String> {
    writing::update_book_chapter_status(&get_data_dir(), &book_id, &chapter_id, status)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_book_chapter(book_id: String, chapter_id: String) -> Result<(), String> {
    writing::delete_book_chapter(&get_data_dir(), &book_id, &chapter_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn reorder_chapters(book_id: String, volume_id: String, chapter_ids: Vec<String>) -> Result<(), String> {
    writing::reorder_chapters(&get_data_dir(), &book_id, &volume_id, chapter_ids)
}

// === 快照命令 ===

#[tauri::command(rename_all = "snake_case")]
pub fn create_snapshot(book_id: String, chapter_id: String) -> Result<(), String> {
    writing::create_snapshot(&get_data_dir(), &book_id, &chapter_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_snapshots(book_id: String, chapter_id: String) -> Result<Vec<writing::SnapshotInfo>, String> {
    Ok(writing::list_snapshots(&get_data_dir(), &book_id, &chapter_id))
}

#[tauri::command(rename_all = "snake_case")]
pub fn load_snapshot(book_id: String, chapter_id: String, snapshot_id: String) -> Result<String, String> {
    writing::load_snapshot(&get_data_dir(), &book_id, &chapter_id, &snapshot_id)
}

// === 设定集命令 ===

#[tauri::command]
pub fn get_worldbuilding(book_id: String) -> Result<serde_json::Value, String> {
    Ok(writing::load_worldbuilding(&get_data_dir(), &book_id))
}

#[tauri::command]
pub fn save_worldbuilding(book_id: String, data: serde_json::Value) -> Result<(), String> {
    writing::save_worldbuilding(&get_data_dir(), &book_id, &data)
}

#[tauri::command]
pub fn search_worldbuilding(book_id: String, keyword: String) -> Result<Vec<writing::SearchResult>, String> {
    Ok(writing::search_worldbuilding(&get_data_dir(), &book_id, &keyword))
}

// === AI Provider 命令 ===

#[tauri::command]
pub async fn test_ai_provider(provider: ai_provider::AIProvider) -> Result<bool, String> {
    provider.test_connection().await
}

// === AI 写作辅助命令 ===

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_writing_suggest(_book_id: String, _chapter_id: String, context: String, app: AppHandle) -> Result<String, String> {
    let provider = ai_provider::get_writing_provider()?;

    // 收集人物和设定信息作为上下文
    let data_dir = get_data_dir();
    let characters = writing::load_characters(&data_dir);
    let mut char_info = String::new();
    for c in &characters.characters {
        char_info.push_str(&format!("- {}（{}）\n", c.name, c.role));
    }

    let system = format!(
        "你是一个小说写作助手。根据以下上下文，给出3个不同的后续发展方向建议。\n\
         每个建议用一句话概括方向，再用2-3句话描述具体可以怎么写。\n\
         不要直接写正文，只给思路。\n\n\
         {}",
        if char_info.is_empty() { String::new() } else { format!("已知人物：\n{}\n", char_info) }
    );

    let user_msg = format!("当前内容：\n{}", context);
    provider.chat_stream(&app, &system, &user_msg).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_consistency_check(book_id: String, chapter_id: String, app: AppHandle) -> Result<String, String> {
    let provider = ai_provider::get_writing_provider()?;
    let data_dir = get_data_dir();

    let chapter_content = writing::load_chapter_content(&data_dir, chapter_id);
    if chapter_content.trim().is_empty() {
        return Err("章节内容为空".to_string());
    }

    let characters = writing::load_characters(&data_dir);
    let mut char_info = String::new();
    for c in &characters.characters {
        char_info.push_str(&format!("- {}：{} / {}\n", c.name, c.role, c.personality));
    }

    let worldbuilding = writing::load_worldbuilding(&data_dir, &book_id);
    let wb_str: String = serde_json::to_string_pretty(&worldbuilding)
        .unwrap_or_default()
        .chars().take(2000).collect();

    let system = "你是一个小说校对助手。对照以下设定资料，检查这章内容有没有矛盾或不一致的地方。\n\
                  如果发现矛盾，指出具体位置和原因。如果没有问题，说\"未发现矛盾\"。";

    let user_msg = format!(
        "设定资料：\n{}\n\n人物档案：\n{}\n\n本章内容：\n{}",
        wb_str, char_info, chapter_content
    );

    provider.chat_stream(&app, system, &user_msg).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_foreshadow_detect(_book_id: String, chapter_id: String, app: AppHandle) -> Result<String, String> {
    let provider = ai_provider::get_writing_provider()?;
    let data_dir = get_data_dir();

    let chapter_content = writing::load_chapter_content(&data_dir, chapter_id);
    if chapter_content.trim().is_empty() {
        return Err("章节内容为空".to_string());
    }

    let foreshadows = writing::load_foreshadows(&data_dir);
    let mut fs_info = String::new();
    for f in &foreshadows.items {
        let status_str = if f.status == "resolved" { "已回收" } else { "未回收" };
        fs_info.push_str(&format!("- [{}] {}：{}\n", status_str, f.id, f.description));
    }

    let system = "你是一个小说分析助手。阅读以下章节内容，找出可能是伏笔的地方（暗示、悬念、未解释的细节）。\n\
                  列出你发现的潜在伏笔，以及是否可能回收了已有伏笔。";

    let user_msg = format!(
        "已知伏笔列表：\n{}\n\n本章内容：\n{}",
        if fs_info.is_empty() { "（暂无）".to_string() } else { fs_info },
        chapter_content
    );

    provider.chat_stream(&app, system, &user_msg).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_chapter_summary(_book_id: String, chapter_id: String, app: AppHandle) -> Result<String, String> {
    let provider = ai_provider::get_writing_provider()?;
    let data_dir = get_data_dir();

    let chapter_content = writing::load_chapter_content(&data_dir, chapter_id);
    if chapter_content.trim().is_empty() {
        return Err("章节内容为空".to_string());
    }

    let system = "你是一个小说摘要助手。用一句话概括这章的核心内容（不超过50字）。只输出摘要，不要其他内容。";
    provider.chat_stream(&app, system, &chapter_content).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_bird_comment(text: String, prompt: String, app: AppHandle) -> Result<String, String> {
    let provider = ai_provider::get_writing_provider()?;
    provider.chat_stream(&app, &prompt, &text).await
}
