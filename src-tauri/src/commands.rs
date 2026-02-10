use crate::config::{self, AppConfig};
use crate::tracker::Tracker;
use crate::tray_icon;
use crate::activity;
use crate::journal;
use crate::claude_api;
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
pub fn load_journal(date: String) -> Result<String, String> {
    Ok(journal::load(&get_data_dir(), &date))
}

#[tauri::command]
pub fn save_journal(date: String, content: String) -> Result<(), String> {
    journal::save(&get_data_dir(), &date, &content)
}

#[tauri::command]
pub fn list_journal_dates() -> Result<Vec<String>, String> {
    Ok(journal::list_dates(&get_data_dir()))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_generate(date: String, existing_text: String, app: AppHandle) -> Result<String, String> {
    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }
    let data_dir = PathBuf::from(&cfg.data_dir);
    claude_api::generate(&app, &cfg.api_key, &cfg.model, &cfg.language, &date, &existing_text, &data_dir).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_organize(date: String, raw_content: String, app: AppHandle) -> Result<String, String> {
    let cfg = config::load_config();
    if cfg.api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }
    claude_api::organize(&app, &cfg.api_key, &cfg.model, &cfg.language, &date, &raw_content).await
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
