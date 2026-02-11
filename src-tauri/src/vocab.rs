use crate::activity;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabDay {
    pub date: String,
    pub words: Vec<VocabWord>,
    pub generated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabWord {
    pub word: String,
    pub source: String,
    pub examples: Vec<VocabExample>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabExample {
    pub style: String,
    pub text: String,
}

/// 从窗口标题中提取英文单词（4字母以上，排除常见词）
pub fn extract_words(data_dir: &PathBuf, date: &str) -> Vec<(String, String)> {
    let entries = activity::load_entries(data_dir, date);
    let stop_words: HashSet<&str> = [
        "the","and","for","are","but","not","you","all","can","had","her",
        "was","one","our","out","with","that","this","from","have","been",
        "will","your","what","when","them","than","each","make","like",
        "just","over","such","take","into","most","also","back","after",
        "file","edit","view","help","home","page","new","open","save",
        "close","window","untitled","chrome","edge","firefox","code",
    ].iter().cloned().collect();

    let mut seen = HashSet::new();
    let mut results = Vec::new();

    for entry in &entries {
        let title = &entry.title;
        // 提取英文单词（4字母以上）
        for word in title.split(|c: char| !c.is_ascii_alphabetic()) {
            let lower = word.to_lowercase();
            if lower.len() >= 4 && !stop_words.contains(lower.as_str()) && !seen.contains(&lower) {
                seen.insert(lower.clone());
                results.push((lower, title.clone()));
            }
        }
    }
    // 最多取 10 个
    results.truncate(10);
    results
}

pub fn load(data_dir: &PathBuf, date: &str) -> Option<VocabDay> {
    let path = data_dir.join("vocab").join(format!("{}.json", date));
    if !path.exists() { return None; }
    fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok())
}

pub fn save(data_dir: &PathBuf, day: &VocabDay) -> Result<(), String> {
    let dir = data_dir.join("vocab");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", day.date));
    let json = serde_json::to_string_pretty(day).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
