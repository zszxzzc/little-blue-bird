use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Volume {
    pub id: String,
    pub title: String,
    pub order: u32,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub order: u32,
    #[serde(default = "default_chapter_status")]
    pub status: String, // empty/draft/done/published
}

fn default_chapter_status() -> String {
    "empty".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingStructure {
    pub volumes: Vec<Volume>,
}

impl WritingStructure {
    pub fn new() -> Self {
        WritingStructure { volumes: vec![] }
    }
}

// 信息面板数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfoItem {
    pub id: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfoPanel {
    pub characters: Vec<InfoItem>,
    pub foreshadows: Vec<InfoItem>,
    pub settings: Vec<InfoItem>,
    pub memos: Vec<InfoItem>,
}

impl InfoPanel {
    pub fn new() -> Self {
        InfoPanel {
            characters: vec![],
            foreshadows: vec![],
            settings: vec![],
            memos: vec![],
        }
    }
}

// 章节备忘数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterMemo {
    pub chapter_id: String,
    pub outline: String,      // 大纲
    pub mood: String,          // 情绪基调
    pub notes: String,         // 写作笔记
}

impl ChapterMemo {
    pub fn new(chapter_id: String) -> Self {
        ChapterMemo {
            chapter_id,
            outline: String::new(),
            mood: String::new(),
            notes: String::new(),
        }
    }
}

/// 获取写作结构文件路径
fn structure_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("writing_structure.json")
}

/// 获取章节内容文件路径
fn chapter_content_path(data_dir: &PathBuf, chapter_id: &str) -> PathBuf {
    data_dir.join("writing").join(format!("{}.txt", chapter_id))
}

/// 获取信息面板文件路径
fn info_panel_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("writing_info.json")
}

/// 获取章节备忘文件路径
fn chapter_memo_path(data_dir: &PathBuf, chapter_id: &str) -> PathBuf {
    data_dir.join("writing").join(format!("{}_memo.json", chapter_id))
}

/// 加载信息面板
pub fn load_info_panel(data_dir: &PathBuf) -> InfoPanel {
    let path = info_panel_path(data_dir);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(InfoPanel::new)
    } else {
        InfoPanel::new()
    }
}

/// 保存信息面板
pub fn save_info_panel(data_dir: &PathBuf, panel: &InfoPanel) -> Result<(), String> {
    let path = info_panel_path(data_dir);
    let json = serde_json::to_string_pretty(panel)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

/// 添加信息项
pub fn add_info_item(data_dir: &PathBuf, panel_type: String, content: String) -> Result<InfoPanel, String> {
    let mut panel = load_info_panel(data_dir);
    let id = format!("info_{}", chrono::Local::now().timestamp_millis());
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let item = InfoItem {
        id,
        content,
        created_at,
    };

    match panel_type.as_str() {
        "characters" => panel.characters.push(item),
        "foreshadows" => panel.foreshadows.push(item),
        "settings" => panel.settings.push(item),
        "memos" => panel.memos.push(item),
        _ => return Err("无效的面板类型".to_string()),
    }

    save_info_panel(data_dir, &panel)?;
    Ok(panel)
}

/// 删除信息项
pub fn delete_info_item(data_dir: &PathBuf, panel_type: String, item_id: String) -> Result<InfoPanel, String> {
    let mut panel = load_info_panel(data_dir);

    match panel_type.as_str() {
        "characters" => panel.characters.retain(|item| item.id != item_id),
        "foreshadows" => panel.foreshadows.retain(|item| item.id != item_id),
        "settings" => panel.settings.retain(|item| item.id != item_id),
        "memos" => panel.memos.retain(|item| item.id != item_id),
        _ => return Err("无效的面板类型".to_string()),
    }

    save_info_panel(data_dir, &panel)?;
    Ok(panel)
}

/// 加载章节备忘
pub fn load_chapter_memo(data_dir: &PathBuf, chapter_id: String) -> ChapterMemo {
    let path = chapter_memo_path(data_dir, &chapter_id);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| ChapterMemo::new(chapter_id))
    } else {
        ChapterMemo::new(chapter_id)
    }
}

/// 保存章节备忘
pub fn save_chapter_memo(data_dir: &PathBuf, memo: &ChapterMemo) -> Result<(), String> {
    let path = chapter_memo_path(data_dir, &memo.chapter_id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let json = serde_json::to_string_pretty(memo)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

/// 加载写作结构
pub fn load_structure(data_dir: &PathBuf) -> WritingStructure {
    let path = structure_path(data_dir);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(WritingStructure::new)
    } else {
        WritingStructure::new()
    }
}

/// 保存写作结构
pub fn save_structure(data_dir: &PathBuf, structure: &WritingStructure) -> Result<(), String> {
    let path = structure_path(data_dir);
    let json = serde_json::to_string_pretty(structure)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

/// 创建新卷
pub fn create_volume(data_dir: &PathBuf, title: String) -> Result<WritingStructure, String> {
    let mut structure = load_structure(data_dir);
    let id = format!("vol_{}", chrono::Local::now().timestamp_millis());
    let order = structure.volumes.len() as u32;

    structure.volumes.push(Volume {
        id,
        title,
        order,
        chapters: vec![],
    });

    save_structure(data_dir, &structure)?;
    Ok(structure)
}

/// 创建新章
pub fn create_chapter(data_dir: &PathBuf, volume_id: String, title: String) -> Result<WritingStructure, String> {
    let mut structure = load_structure(data_dir);

    let volume = structure.volumes.iter_mut()
        .find(|v| v.id == volume_id)
        .ok_or("卷不存在")?;

    let id = format!("chap_{}", chrono::Local::now().timestamp_millis());
    let order = volume.chapters.len() as u32;

    volume.chapters.push(Chapter {
        id: id.clone(),
        title,
        order,
        status: "empty".to_string(),
    });

    // 创建空内容文件
    let content_path = chapter_content_path(data_dir, &id);
    if let Some(parent) = content_path.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(&content_path, "").ok();

    save_structure(data_dir, &structure)?;
    Ok(structure)
}

/// 更新卷标题
pub fn update_volume(data_dir: &PathBuf, volume_id: String, title: String) -> Result<WritingStructure, String> {
    let mut structure = load_structure(data_dir);

    let volume = structure.volumes.iter_mut()
        .find(|v| v.id == volume_id)
        .ok_or("卷不存在")?;

    volume.title = title;
    save_structure(data_dir, &structure)?;
    Ok(structure)
}

/// 更新章标题
pub fn update_chapter(data_dir: &PathBuf, volume_id: String, chapter_id: String, title: String) -> Result<WritingStructure, String> {
    let mut structure = load_structure(data_dir);

    let volume = structure.volumes.iter_mut()
        .find(|v| v.id == volume_id)
        .ok_or("卷不存在")?;

    let chapter = volume.chapters.iter_mut()
        .find(|c| c.id == chapter_id)
        .ok_or("章不存在")?;

    chapter.title = title;
    save_structure(data_dir, &structure)?;
    Ok(structure)
}

/// 更新章节状态
pub fn update_chapter_status(data_dir: &PathBuf, volume_id: String, chapter_id: String, status: String) -> Result<WritingStructure, String> {
    let mut structure = load_structure(data_dir);

    let volume = structure.volumes.iter_mut()
        .find(|v| v.id == volume_id)
        .ok_or("卷不存在")?;

    let chapter = volume.chapters.iter_mut()
        .find(|c| c.id == chapter_id)
        .ok_or("章不存在")?;

    chapter.status = status;
    save_structure(data_dir, &structure)?;
    Ok(structure)
}

/// 删除卷
pub fn delete_volume(data_dir: &PathBuf, volume_id: String) -> Result<WritingStructure, String> {
    let mut structure = load_structure(data_dir);

    // 删除卷下所有章节的内容文件
    if let Some(volume) = structure.volumes.iter().find(|v| v.id == volume_id) {
        for chapter in &volume.chapters {
            let content_path = chapter_content_path(data_dir, &chapter.id);
            fs::remove_file(&content_path).ok();
        }
    }

    structure.volumes.retain(|v| v.id != volume_id);
    save_structure(data_dir, &structure)?;
    Ok(structure)
}

/// 删除章
pub fn delete_chapter(data_dir: &PathBuf, volume_id: String, chapter_id: String) -> Result<WritingStructure, String> {
    let mut structure = load_structure(data_dir);

    let volume = structure.volumes.iter_mut()
        .find(|v| v.id == volume_id)
        .ok_or("卷不存在")?;

    // 删除内容文件
    let content_path = chapter_content_path(data_dir, &chapter_id);
    fs::remove_file(&content_path).ok();

    volume.chapters.retain(|c| c.id != chapter_id);
    save_structure(data_dir, &structure)?;
    Ok(structure)
}

/// 加载章节内容
pub fn load_chapter_content(data_dir: &PathBuf, chapter_id: String) -> String {
    let path = chapter_content_path(data_dir, &chapter_id);
    fs::read_to_string(&path).unwrap_or_default()
}

/// 保存章节内容
pub fn save_chapter_content(data_dir: &PathBuf, chapter_id: String, content: String) -> Result<(), String> {
    let path = chapter_content_path(data_dir, &chapter_id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(&path, content)
        .map_err(|e| format!("保存失败: {}", e))?;
    Ok(())
}

// ============================================================
// 人物系统
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relationship {
    pub target: String,
    pub relation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub appearance: String,
    #[serde(default)]
    pub personality: String,
    #[serde(default)]
    pub abilities: String,
    #[serde(default)]
    pub relationships: Vec<Relationship>,
    #[serde(default)]
    pub appearance_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterStore {
    pub characters: Vec<Character>,
}

fn characters_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("writing").join("characters.json")
}

pub fn load_characters(data_dir: &PathBuf) -> CharacterStore {
    let path = characters_path(data_dir);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(CharacterStore { characters: vec![] })
    } else {
        CharacterStore { characters: vec![] }
    }
}

fn save_characters(data_dir: &PathBuf, store: &CharacterStore) -> Result<(), String> {
    let path = characters_path(data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn add_character(data_dir: &PathBuf, character: Character) -> Result<CharacterStore, String> {
    let mut store = load_characters(data_dir);
    if store.characters.iter().any(|c| c.id == character.id) {
        return Err("人物 ID 已存在".to_string());
    }
    store.characters.push(character);
    save_characters(data_dir, &store)?;
    Ok(store)
}

pub fn update_character(data_dir: &PathBuf, character: Character) -> Result<CharacterStore, String> {
    let mut store = load_characters(data_dir);
    let existing = store.characters.iter_mut()
        .find(|c| c.id == character.id)
        .ok_or("人物不存在")?;
    existing.name = character.name;
    existing.aliases = character.aliases;
    existing.role = character.role;
    existing.appearance = character.appearance;
    existing.personality = character.personality;
    existing.abilities = character.abilities;
    existing.relationships = character.relationships;
    // appearance_count 不覆盖，由扫描更新
    save_characters(data_dir, &store)?;
    Ok(store)
}

pub fn delete_character(data_dir: &PathBuf, character_id: &str) -> Result<CharacterStore, String> {
    let mut store = load_characters(data_dir);
    store.characters.retain(|c| c.id != character_id);
    save_characters(data_dir, &store)?;
    Ok(store)
}

/// 扫描章节正文中的 @人物名，更新出场统计
pub fn scan_character_mentions(data_dir: &PathBuf, content: &str) -> Result<(), String> {
    let mut store = load_characters(data_dir);
    if store.characters.is_empty() {
        return Ok(());
    }

    // 重新统计所有章节中的出场次数
    // 先收集所有章节内容
    let writing_dir = data_dir.join("writing");
    let mut all_text = String::new();

    if writing_dir.exists() {
        if let Ok(entries) = fs::read_dir(&writing_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".txt") {
                    if let Ok(text) = fs::read_to_string(entry.path()) {
                        all_text.push_str(&text);
                        all_text.push('\n');
                    }
                }
            }
        }
    }
    // 也包含当前正在保存的内容（可能还没写入磁盘）
    all_text.push_str(content);

    for character in &mut store.characters {
        let mut count = 0u32;
        // 匹配 @人物名
        let at_name = format!("@{}", character.name);
        count += all_text.matches(&at_name).count() as u32;
        // 也匹配别名
        for alias in &character.aliases {
            let at_alias = format!("@{}", alias);
            count += all_text.matches(&at_alias).count() as u32;
        }
        character.appearance_count = count;
    }

    save_characters(data_dir, &store)
}

/// 人物出场章节信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterChapter {
    pub chapter_id: String,
    pub chapter_title: String,
}

/// 获取某个人物出场过的所有章节
pub fn get_character_chapters(data_dir: &PathBuf, char_id: &str) -> Vec<CharacterChapter> {
    let store = load_characters(data_dir);
    let character = match store.characters.iter().find(|c| c.id == char_id) {
        Some(c) => c,
        None => return vec![],
    };

    // 收集要匹配的名字：@主名 + @别名
    let mut names: Vec<String> = vec![format!("@{}", character.name)];
    for alias in &character.aliases {
        names.push(format!("@{}", alias));
    }

    let structure = load_structure(data_dir);
    let mut result = Vec::new();

    for volume in &structure.volumes {
        for chapter in &volume.chapters {
            let content = load_chapter_content(data_dir, chapter.id.clone());
            if content.is_empty() {
                continue;
            }
            let mentioned = names.iter().any(|n| content.contains(n));
            if mentioned {
                result.push(CharacterChapter {
                    chapter_id: chapter.id.clone(),
                    chapter_title: chapter.title.clone(),
                });
            }
        }
    }

    result
}

// ============================================================
// 伏笔追踪系统
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Foreshadow {
    pub id: String,
    pub description: String,
    #[serde(default)]
    pub source_chapter: String,
    #[serde(default)]
    pub source_quote: String,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub status: String, // "active" or "resolved"
    pub resolved_chapter: Option<String>,
    pub resolved_quote: Option<String>,
    pub resolved_date: Option<String>,
    #[serde(default)]
    pub urgency: String, // "green", "yellow", "red" — 计算字段
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeshadowStore {
    pub items: Vec<Foreshadow>,
}

fn foreshadowing_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("writing").join("foreshadowing.json")
}

pub fn load_foreshadows(data_dir: &PathBuf) -> ForeshadowStore {
    let path = foreshadowing_path(data_dir);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(ForeshadowStore { items: vec![] })
    } else {
        ForeshadowStore { items: vec![] }
    }
}

fn save_foreshadows(data_dir: &PathBuf, store: &ForeshadowStore) -> Result<(), String> {
    let path = foreshadowing_path(data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// 计算伏笔紧急度：根据埋下章节与当前最新章节的距离
fn calc_urgency(source_chapter: &str, structure: &WritingStructure) -> String {
    // 从 source_chapter id 找到它在全局章节列表中的位置
    let all_chapters: Vec<&str> = structure.volumes.iter()
        .flat_map(|v| v.chapters.iter().map(|c| c.id.as_str()))
        .collect();

    let total = all_chapters.len();
    let source_idx = all_chapters.iter().position(|&id| id == source_chapter);

    match source_idx {
        Some(idx) => {
            let distance = total.saturating_sub(idx + 1);
            if distance > 10 {
                "red".to_string()
            } else if distance >= 5 {
                "yellow".to_string()
            } else {
                "green".to_string()
            }
        }
        None => "green".to_string(),
    }
}

/// 加载伏笔并计算紧急度
pub fn get_foreshadows_with_urgency(data_dir: &PathBuf) -> ForeshadowStore {
    let mut store = load_foreshadows(data_dir);
    let structure = load_structure(data_dir);

    for item in &mut store.items {
        if item.status != "resolved" {
            item.urgency = calc_urgency(&item.source_chapter, &structure);
        } else {
            item.urgency = "done".to_string();
        }
    }
    store
}

pub fn add_foreshadow(data_dir: &PathBuf, mut foreshadow: Foreshadow) -> Result<ForeshadowStore, String> {
    let mut store = load_foreshadows(data_dir);
    if foreshadow.id.is_empty() {
        foreshadow.id = format!("fs_{}", chrono::Local::now().timestamp_millis());
    }
    if foreshadow.created.is_empty() {
        foreshadow.created = chrono::Local::now().format("%Y-%m-%d").to_string();
    }
    if foreshadow.status.is_empty() {
        foreshadow.status = "active".to_string();
    }
    store.items.push(foreshadow);
    save_foreshadows(data_dir, &store)?;
    // 返回带紧急度的
    Ok(get_foreshadows_with_urgency(data_dir))
}

pub fn resolve_foreshadow(
    data_dir: &PathBuf,
    foreshadow_id: &str,
    resolved_chapter: String,
    resolved_quote: String,
) -> Result<ForeshadowStore, String> {
    let mut store = load_foreshadows(data_dir);
    let item = store.items.iter_mut()
        .find(|f| f.id == foreshadow_id)
        .ok_or("伏笔不存在")?;

    item.status = "resolved".to_string();
    item.resolved_chapter = Some(resolved_chapter);
    item.resolved_quote = Some(resolved_quote);
    item.resolved_date = Some(chrono::Local::now().format("%Y-%m-%d").to_string());

    save_foreshadows(data_dir, &store)?;
    Ok(get_foreshadows_with_urgency(data_dir))
}

pub fn delete_foreshadow(data_dir: &PathBuf, foreshadow_id: &str) -> Result<ForeshadowStore, String> {
    let mut store = load_foreshadows(data_dir);
    store.items.retain(|f| f.id != foreshadow_id);
    save_foreshadows(data_dir, &store)?;
    Ok(get_foreshadows_with_urgency(data_dir))
}

// ============================================================
// 字数统计
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingStats {
    pub chapter_words: u32,
    pub total_words: u32,
    pub today_words: u32,
    pub streak_days: u32,
}

/// 统计文本字数：中文按字符数，英文按单词数
fn count_words(text: &str) -> u32 {
    let chinese: u32 = text.chars()
        .filter(|c| ('\u{4e00}'..='\u{9fff}').contains(c))
        .count() as u32;
    let english: u32 = text.split(|c: char| !c.is_ascii_alphabetic())
        .filter(|w| !w.is_empty())
        .count() as u32;
    chinese + english
}

pub fn get_writing_stats(data_dir: &PathBuf, chapter_id: &str) -> WritingStats {
    // 本章字数
    let chapter_content = load_chapter_content(data_dir, chapter_id.to_string());
    let chapter_words = count_words(&chapter_content);

    // 全书字数：遍历所有章节文件
    let writing_dir = data_dir.join("writing");
    let mut total_words = 0u32;
    if writing_dir.exists() {
        if let Ok(entries) = fs::read_dir(&writing_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".txt") {
                    if let Ok(text) = fs::read_to_string(entry.path()) {
                        total_words += count_words(&text);
                    }
                }
            }
        }
    }

    // 今日字数和连续写作天数：基于章节文件的修改时间
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut today_words = 0u32;
    let mut dates_with_writing: std::collections::HashSet<String> = std::collections::HashSet::new();

    // 检查 writing 目录下的 txt 文件修改日期
    if writing_dir.exists() {
        if let Ok(entries) = fs::read_dir(&writing_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".txt") {
                    if let Ok(meta) = entry.metadata() {
                        if let Ok(modified) = meta.modified() {
                            let dt: chrono::DateTime<chrono::Local> = modified.into();
                            let date_str = dt.format("%Y-%m-%d").to_string();
                            dates_with_writing.insert(date_str.clone());
                            if date_str == today {
                                if let Ok(text) = fs::read_to_string(entry.path()) {
                                    today_words += count_words(&text);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 计算连续写作天数（从今天往回数）
    let today_date = chrono::Local::now().date_naive();
    let mut streak_days = 0u32;
    for i in 0..365 {
        let date = today_date - chrono::Duration::days(i);
        let ds = date.format("%Y-%m-%d").to_string();
        if dates_with_writing.contains(&ds) {
            streak_days += 1;
        } else {
            break;
        }
    }

    WritingStats {
        chapter_words,
        total_words,
        today_words,
        streak_days,
    }
}

// ============================================================
// 书籍管理
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookMeta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub created: String,
    pub volumes: Vec<Volume>,
}

fn book_dir(data_dir: &PathBuf, book_id: &str) -> PathBuf {
    data_dir.join("writing").join(book_id)
}

fn book_meta_path(data_dir: &PathBuf, book_id: &str) -> PathBuf {
    book_dir(data_dir, book_id).join("meta.json")
}

pub fn create_book(data_dir: &PathBuf, title: String) -> Result<BookMeta, String> {
    let id = format!("book_{}", chrono::Local::now().timestamp_millis());
    let meta = BookMeta {
        id: id.clone(),
        title,
        author: String::new(),
        created: chrono::Local::now().format("%Y-%m-%d").to_string(),
        volumes: vec![],
    };
    let dir = book_dir(data_dir, &id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(book_meta_path(data_dir, &id), json).map_err(|e| e.to_string())?;
    Ok(meta)
}

pub fn load_book_meta(data_dir: &PathBuf, book_id: &str) -> Result<BookMeta, String> {
    let path = book_meta_path(data_dir, book_id);
    if !path.exists() {
        return Err("书籍不存在".to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("解析失败: {}", e))
}

pub fn save_book_meta(data_dir: &PathBuf, meta: &BookMeta) -> Result<(), String> {
    let dir = book_dir(data_dir, &meta.id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    fs::write(book_meta_path(data_dir, &meta.id), json).map_err(|e| e.to_string())
}

pub fn rename_chapter(data_dir: &PathBuf, book_id: &str, chapter_id: &str, title: String) -> Result<(), String> {
    let mut meta = load_book_meta(data_dir, book_id)?;
    for vol in &mut meta.volumes {
        if let Some(ch) = vol.chapters.iter_mut().find(|c| c.id == chapter_id) {
            ch.title = title;
            save_book_meta(data_dir, &meta)?;
            return Ok(());
        }
    }
    Err("章节不存在".to_string())
}

pub fn update_book_chapter_status(data_dir: &PathBuf, book_id: &str, chapter_id: &str, status: String) -> Result<(), String> {
    let mut meta = load_book_meta(data_dir, book_id)?;
    for vol in &mut meta.volumes {
        if let Some(ch) = vol.chapters.iter_mut().find(|c| c.id == chapter_id) {
            ch.status = status;
            save_book_meta(data_dir, &meta)?;
            return Ok(());
        }
    }
    Err("章节不存在".to_string())
}

pub fn delete_book_chapter(data_dir: &PathBuf, book_id: &str, chapter_id: &str) -> Result<(), String> {
    let mut meta = load_book_meta(data_dir, book_id)?;
    let dir = book_dir(data_dir, book_id);
    // 删除章节文件
    let chap_file = dir.join("chapters").join(format!("{}.md", chapter_id));
    fs::remove_file(&chap_file).ok();
    let meta_file = dir.join("chapters").join(format!("{}.meta.json", chapter_id));
    fs::remove_file(&meta_file).ok();

    for vol in &mut meta.volumes {
        vol.chapters.retain(|c| c.id != chapter_id);
    }
    save_book_meta(data_dir, &meta)
}

pub fn reorder_chapters(data_dir: &PathBuf, book_id: &str, volume_id: &str, chapter_ids: Vec<String>) -> Result<(), String> {
    let mut meta = load_book_meta(data_dir, book_id)?;
    let vol = meta.volumes.iter_mut()
        .find(|v| v.id == volume_id)
        .ok_or("卷不存在")?;

    let mut reordered = Vec::new();
    for (i, cid) in chapter_ids.iter().enumerate() {
        if let Some(mut ch) = vol.chapters.iter().find(|c| c.id == *cid).cloned() {
            ch.order = i as u32;
            reordered.push(ch);
        }
    }
    vol.chapters = reordered;
    save_book_meta(data_dir, &meta)
}

// ============================================================
// 快照系统
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotInfo {
    pub id: String,
    pub timestamp: String,
    pub size: u64,
}

pub fn create_snapshot(data_dir: &PathBuf, book_id: &str, chapter_id: &str) -> Result<(), String> {
    let dir = book_dir(data_dir, book_id);
    let chap_file = dir.join("chapters").join(format!("{}.md", chapter_id));
    let content = fs::read_to_string(&chap_file).unwrap_or_default();
    if content.trim().is_empty() {
        return Err("章节内容为空，无需快照".to_string());
    }

    let ts = chrono::Local::now().format("%Y-%m-%dT%H-%M-%S").to_string();
    let snap_dir = dir.join("snapshots").join(chapter_id);
    fs::create_dir_all(&snap_dir).map_err(|e| e.to_string())?;
    let snap_file = snap_dir.join(format!("{}.md", ts));
    fs::write(&snap_file, content).map_err(|e| e.to_string())
}

pub fn list_snapshots(data_dir: &PathBuf, book_id: &str, chapter_id: &str) -> Vec<SnapshotInfo> {
    let snap_dir = book_dir(data_dir, book_id).join("snapshots").join(chapter_id);
    let mut result = Vec::new();
    if !snap_dir.exists() {
        return result;
    }
    if let Ok(entries) = fs::read_dir(&snap_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".md") {
                let id = name.trim_end_matches(".md").to_string();
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                let timestamp = if id.len() >= 19 {
                    format!("{} {}", &id[..10], id[11..].replace('-', ":"))
                } else {
                    id.clone()
                };
                result.push(SnapshotInfo { id, timestamp, size });
            }
        }
    }
    result.sort_by(|a, b| b.id.cmp(&a.id)); // newest first
    result
}

pub fn load_snapshot(data_dir: &PathBuf, book_id: &str, chapter_id: &str, snapshot_id: &str) -> Result<String, String> {
    let snap_file = book_dir(data_dir, book_id)
        .join("snapshots").join(chapter_id).join(format!("{}.md", snapshot_id));
    fs::read_to_string(&snap_file).map_err(|e| format!("读取快照失败: {}", e))
}

// ============================================================
// 设定集（Worldbuilding）
// ============================================================

fn worldbuilding_path(data_dir: &PathBuf, book_id: &str) -> PathBuf {
    book_dir(data_dir, book_id).join("worldbuilding.json")
}

pub fn load_worldbuilding(data_dir: &PathBuf, book_id: &str) -> serde_json::Value {
    let path = worldbuilding_path(data_dir, book_id);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    }
}

pub fn save_worldbuilding(data_dir: &PathBuf, book_id: &str, data: &serde_json::Value) -> Result<(), String> {
    let path = worldbuilding_path(data_dir, book_id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub key: String,
    pub snippet: String,
}

pub fn search_worldbuilding(data_dir: &PathBuf, book_id: &str, keyword: &str) -> Vec<SearchResult> {
    let data = load_worldbuilding(data_dir, book_id);
    let keyword_lower = keyword.to_lowercase();
    let mut results = Vec::new();
    search_json_recursive(&data, "", &keyword_lower, &mut results);
    results
}

fn search_json_recursive(value: &serde_json::Value, path: &str, keyword: &str, results: &mut Vec<SearchResult>) {
    match value {
        serde_json::Value::String(s) => {
            if s.to_lowercase().contains(keyword) {
                let snippet: String = s.chars().take(100).collect();
                results.push(SearchResult {
                    key: path.to_string(),
                    snippet,
                });
            }
        }
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                let new_path = if path.is_empty() { k.clone() } else { format!("{}.{}", path, k) };
                // Also match key name
                if k.to_lowercase().contains(keyword) {
                    let snippet: String = v.to_string().chars().take(100).collect();
                    results.push(SearchResult {
                        key: new_path.clone(),
                        snippet,
                    });
                }
                search_json_recursive(v, &new_path, keyword, results);
            }
        }
        serde_json::Value::Array(arr) => {
            for (i, v) in arr.iter().enumerate() {
                let new_path = format!("{}[{}]", path, i);
                search_json_recursive(v, &new_path, keyword, results);
            }
        }
        _ => {}
    }
}
