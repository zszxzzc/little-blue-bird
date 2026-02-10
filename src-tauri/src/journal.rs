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

/// 保存日记
pub fn save(data_dir: &PathBuf, date: &str, content: &str) -> Result<(), String> {
    let dir = data_dir.join("journal");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.md", date));
    fs::write(&path, format!("{}\n", content.trim_end())).map_err(|e| e.to_string())?;
    Ok(())
}

/// 列出所有有日记的日期（降序）
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
