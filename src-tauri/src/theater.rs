use crate::activity;
use crate::journal;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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
