#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod activity;
mod claude_api;
mod commands;
mod config;
mod inspiration;
mod journal;
mod memes;
mod mood;
mod personality;
mod social;
mod tracker;
mod tray_icon;
mod villain;
mod vocab;
mod world;
mod theater;
mod writing;
mod ai_provider;
mod dream;

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
            commands::get_daily_totals,
            commands::get_range_summary,
            commands::load_journal,
            commands::save_journal,
            commands::delete_journal,
            commands::list_journal_dates,
            commands::search_journals,
            commands::ai_generate,
            commands::ai_organize,
            commands::ai_report,
            commands::browse_directory,
            commands::pick_and_read_file,
            commands::get_chick_mood,
            commands::get_social_status,
            commands::get_today_villain,
            commands::seal_villain,
            commands::get_memes,
            commands::refresh_memes,
            commands::add_meme,
            commands::delete_meme,
            commands::get_world_state,
            commands::get_world_history,
            commands::get_theater,
            commands::list_theater_dates,
            commands::generate_theater,
            commands::save_theater,
            commands::get_today_vocab,
            commands::extract_today_words,
            commands::generate_vocab_examples,
            commands::get_inspiration_notes,
            commands::add_inspiration,
            commands::delete_inspiration,
            commands::get_alchemy_recipes,
            commands::alchemy_synthesize,
            commands::get_personality_growth,
            commands::add_personality_affinity,
            commands::get_writing_structure,
            commands::create_volume,
            commands::create_chapter,
            commands::update_volume,
            commands::update_chapter,
            commands::delete_volume,
            commands::delete_chapter,
            commands::load_chapter_content,
            commands::save_chapter_content,
            commands::get_info_panel,
            commands::add_info_item,
            commands::delete_info_item,
            commands::load_chapter_memo,
            commands::save_chapter_memo,
            commands::update_chapter_status,
            commands::get_characters,
            commands::add_character,
            commands::update_character,
            commands::delete_character,
            commands::get_character_chapters,
            commands::get_foreshadows,
            commands::add_foreshadow,
            commands::resolve_foreshadow,
            commands::delete_foreshadow,
            commands::get_writing_stats,
            commands::save_chapter_content_with_scan,
            // 书籍管理
            commands::create_book,
            commands::get_book_meta,
            commands::update_book_meta,
            commands::rename_chapter_cmd,
            commands::update_book_chapter_status,
            commands::delete_book_chapter,
            commands::reorder_chapters,
            // 快照
            commands::create_snapshot,
            commands::list_snapshots,
            commands::load_snapshot,
            // 设定集
            commands::get_worldbuilding,
            commands::save_worldbuilding,
            commands::search_worldbuilding,
            // AI Provider
            commands::test_ai_provider,
            // AI 写作辅助
            commands::ai_writing_suggest,
            commands::ai_consistency_check,
            commands::ai_foreshadow_detect,
            commands::ai_chapter_summary,
            commands::ai_bird_comment,
            // 梦境日志
            commands::save_dream,
            commands::load_dreams,
            commands::delete_dream,
            commands::update_dream_analysis,
            commands::ai_dream_analysis,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
