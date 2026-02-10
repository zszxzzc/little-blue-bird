#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod activity;
mod claude_api;
mod commands;
mod config;
mod journal;
mod tracker;
mod tray_icon;

use commands::{TrayState, TrackerState};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

fn main() {
    let cfg = config::load_config();
    let data_dir = std::path::PathBuf::from(&cfg.data_dir);
    let tracker = tracker::Tracker::new(cfg.interval, data_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 第二个实例启动时，聚焦已有窗口
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(TrackerState(Mutex::new(tracker)))
        .manage(TrayState(Mutex::new(None)))
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            // 初始灰色鸟图标
            let gray = tray_icon::gray_bird();
            let icon = Image::new_owned(gray, 64, 64);

            let tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("小蓝鸟 - 已停止")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 存 tray handle 到 state，供 commands 切换图标
            let tray_state: tauri::State<TrayState> = app.state();
            *tray_state.0.lock().unwrap() = Some(tray);

            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭窗口时隐藏到托盘
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::start_monitor,
            commands::stop_monitor,
            commands::get_monitor_status,
            commands::get_today_activity,
            commands::load_activity,
            commands::get_activity_summary,
            commands::load_journal,
            commands::save_journal,
            commands::list_journal_dates,
            commands::ai_generate,
            commands::ai_organize,
            commands::browse_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
