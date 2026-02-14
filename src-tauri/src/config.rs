use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_interval")]
    pub interval: u64,
    #[serde(default)]
    pub data_dir: String,
    #[serde(default)]
    pub daily_goal_minutes: u64,
    #[serde(default = "default_personality")]
    pub personality: String,
}

fn default_model() -> String {
    "deepseek-chat".to_string()
}

fn default_language() -> String {
    "bilingual".to_string()
}

fn default_interval() -> u64 {
    30
}

fn default_personality() -> String {
    "gentle".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: default_model(),
            language: default_language(),
            interval: default_interval(),
            data_dir: String::new(),
            daily_goal_minutes: 0,
            personality: default_personality(),
        }
    }
}

/// 鑾峰彇 config.json 鐨勮矾寰?
pub fn config_path() -> PathBuf {
    app_dir().join("config.json")
}

/// 获取应用根目录（config.json 所在目录）
pub fn app_dir() -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(path) = std::env::var("XIAOLANNIAO_APP_DIR") {
        if !path.trim().is_empty() {
            candidates.push(PathBuf::from(path));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.to_path_buf());
            if let Some(pp) = parent.parent() {
                candidates.push(pp.to_path_buf());
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd);
    }

    for dir in &candidates {
        if dir.join("config.json").exists() {
            return dir.clone();
        }
    }

    candidates
        .into_iter()
        .next()
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(mut cfg) = serde_json::from_str::<AppConfig>(&content) {
                if cfg.data_dir.is_empty() {
                    cfg.data_dir = app_dir().join("data").to_string_lossy().to_string();
                }
                return cfg;
            }
        }
    }
    let mut cfg = AppConfig::default();
    cfg.data_dir = app_dir().join("data").to_string_lossy().to_string();
    cfg
}

pub fn save_config_to_file(cfg: &AppConfig) -> Result<(), String> {
    let path = config_path();
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}
