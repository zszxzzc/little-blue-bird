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

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: default_model(),
            language: default_language(),
            interval: default_interval(),
            data_dir: String::new(),
        }
    }
}

/// 获取 config.json 的路径
pub fn config_path() -> PathBuf {
    app_dir().join("config.json")
}

/// 获取应用根目录（config.json 所在目录）
pub fn app_dir() -> PathBuf {
    // 优先使用环境变量（开发时由 tauri 设置）
    // 否则尝试找到包含 config.json 的目录
    let candidates = vec![
        PathBuf::from(r"D:\小玩意\小蓝鸟"),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default(),
        std::env::current_dir().unwrap_or_default(),
    ];
    for dir in candidates {
        if dir.join("config.json").exists() {
            return dir;
        }
    }
    PathBuf::from(r"D:\小玩意\小蓝鸟")
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
