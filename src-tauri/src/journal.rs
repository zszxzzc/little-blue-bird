use std::fs;
use std::path::PathBuf;

/// 加载指定日期的日记
pub fn load(data_dir: &PathBuf, date: &str) -> String {
    let path = data_dir.join("journal").join(format!("{}.md", date));
    if path.exists() {
        fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    }
}

/// 保存日记（自动备份上一版）
pub fn save(data_dir: &PathBuf, date: &str, content: &str) -> Result<(), String> {
    let dir = data_dir.join("journal");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.md", date));
    // 如果已有内容且与新内容不同，先备份
    if path.exists() {
        let old = fs::read_to_string(&path).unwrap_or_default();
        let new_trimmed = format!("{}\n", content.trim_end());
        if old != new_trimmed && !old.trim().is_empty() {
            let bak = dir.join(format!("{}.md.bak", date));
            let _ = fs::write(&bak, &old);
        }
    }
    fs::write(&path, format!("{}\n", content.trim_end())).map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除指定日期的日记
pub fn delete(data_dir: &PathBuf, date: &str) -> Result<(), String> {
    let path = data_dir.join("journal").join(format!("{}.md", date));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 搜索日记内容，返回匹配的日期和摘要片段
pub fn search(data_dir: &PathBuf, keyword: &str) -> Vec<(String, String)> {
    let dir = data_dir.join("journal");
    let mut results = Vec::new();
    let kw = keyword.to_lowercase();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(date) = name.strip_suffix(".md") {
                if date.ends_with(".bak") { continue; }
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    let lower = content.to_lowercase();
                    if let Some(byte_pos) = lower.find(&kw) {
                        // 转换为字符索引，避免在多字节字符中间切片
                        let chars: Vec<char> = content.chars().collect();
                        let char_pos = content[..byte_pos].chars().count();

                        let start = char_pos.saturating_sub(20);
                        let end = (char_pos + kw.chars().count() + 40).min(chars.len());

                        let snippet: String = chars[start..end].iter().collect();
                        let snippet = snippet.replace('\n', " ");
                        let snippet = if start > 0 { format!("...{}", snippet) } else { snippet };
                        let snippet = if end < chars.len() { format!("{}...", snippet) } else { snippet };
                        results.push((date.to_string(), snippet));
                    }
                }
            }
        }
    }
    results.sort_by(|a, b| b.0.cmp(&a.0));
    results
}
pub fn list_dates(data_dir: &PathBuf) -> Vec<String> {
    let dir = data_dir.join("journal");
    let mut dates = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(date) = name.strip_suffix(".md") {
                if !date.is_empty() {
                    dates.push(date.to_string());
                }
            }
        }
    }
    dates.sort_by(|a, b| b.cmp(a));
    dates
}
