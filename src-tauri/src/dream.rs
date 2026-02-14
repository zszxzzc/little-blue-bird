use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Dream {
    pub id: String,
    pub date: String,
    pub time: String,
    pub title: String,
    pub content: String,
    pub mood: String,
    pub tags: Vec<String>,
    pub lucid: bool,
    pub vividness: u8,
    pub ai_analysis: String,
    pub created_at: String,
}

fn dreams_dir(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("dreams")
}

pub fn save(data_dir: &PathBuf, dream: &Dream) -> Result<(), String> {
    let dir = dreams_dir(data_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // 计算同一天的序号
    let prefix = format!("{}_", dream.date);
    let mut max_seq: u32 = 0;
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(rest) = name.strip_prefix(&prefix) {
                if let Some(seq_str) = rest.strip_suffix(".json") {
                    if let Ok(seq) = seq_str.parse::<u32>() {
                        if seq > max_seq {
                            max_seq = seq;
                        }
                    }
                }
            }
        }
    }

    let mut dream = dream.clone();
    let seq = max_seq + 1;
    dream.id = format!("{}_{:03}", dream.date, seq);

    let filename = format!("{}_{:03}.json", dream.date, seq);
    let path = dir.join(&filename);
    let json = serde_json::to_string_pretty(&dream).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_all(data_dir: &PathBuf) -> Vec<Dream> {
    let dir = dreams_dir(data_dir);
    let mut dreams = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".json") {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    if let Ok(dream) = serde_json::from_str::<Dream>(&content) {
                        dreams.push(dream);
                    }
                }
            }
        }
    }
    dreams.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    dreams
}

pub fn delete(data_dir: &PathBuf, id: &str) -> Result<(), String> {
    let dir = dreams_dir(data_dir);
    let filename = format!("{}.json", id);
    let path = dir.join(&filename);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn update_analysis(data_dir: &PathBuf, id: &str, analysis: &str) -> Result<(), String> {
    let dir = dreams_dir(data_dir);
    let filename = format!("{}.json", id);
    let path = dir.join(&filename);
    if !path.exists() {
        return Err("梦境记录不存在".to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut dream: Dream = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    dream.ai_analysis = analysis.to_string();
    let json = serde_json::to_string_pretty(&dream).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}
