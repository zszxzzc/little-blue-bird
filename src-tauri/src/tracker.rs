use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub ts: String,
    pub title: String,
    pub exe: String,
    #[serde(default)]
    pub duration: u64,
}

const IDLE_INDICATORS: &[&str] = &["lockapp", "windows default lock screen", ""];

pub struct Tracker {
    interval: u64,
    data_dir: PathBuf,
    stop_flag: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

/// 获取当前前台窗口的标题和进程名
fn get_active_window() -> (String, String) {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowTextW;
    use windows::Win32::System::Threading::OpenProcess;
    use windows::Win32::System::Threading::QueryFullProcessImageNameW;
    use windows::Win32::System::Threading::PROCESS_NAME_FORMAT;
    use windows::Win32::System::Threading::PROCESS_QUERY_LIMITED_INFORMATION;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return (String::new(), String::new());
        }

        // 获取窗口标题
        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..len as usize]);

        // 获取进程 ID
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return (title, String::new());
        }

        // 获取进程名
        let exe = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(handle) => {
                let mut name_buf = [0u16; 512];
                let mut size = name_buf.len() as u32;
                let ok = QueryFullProcessImageNameW(
                    handle,
                    PROCESS_NAME_FORMAT(0),
                    windows::core::PWSTR(name_buf.as_mut_ptr()),
                    &mut size,
                );
                let _ = windows::Win32::Foundation::CloseHandle(handle);
                if ok.is_ok() {
                    let full = String::from_utf16_lossy(&name_buf[..size as usize]);
                    full.rsplit('\\').next().unwrap_or("").to_string()
                } else {
                    String::new()
                }
            }
            Err(_) => String::new(),
        };

        (title, exe)
    }
}

fn is_idle(title: &str, exe: &str) -> bool {
    if title.is_empty() && exe.is_empty() {
        return true;
    }
    let exe_lower = exe.to_lowercase();
    if exe_lower.contains("lockapp") {
        return true;
    }
    let title_lower = title.to_lowercase();
    IDLE_INDICATORS.iter().any(|ind| !ind.is_empty() && title_lower == *ind)
}

fn activity_dir(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("activity")
}

fn write_entry(data_dir: &PathBuf, entry: &ActivityEntry) -> Result<(), String> {
    let dir = activity_dir(data_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let date = &entry.ts[..10]; // YYYY-MM-DD
    let path = dir.join(format!("{}.jsonl", date));
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    let line = serde_json::to_string(entry).map_err(|e| e.to_string())?;
    writeln!(f, "{}", line).map_err(|e| e.to_string())?;
    Ok(())
}

impl Tracker {
    pub fn new(interval: u64, data_dir: PathBuf) -> Self {
        Self {
            interval,
            data_dir,
            stop_flag: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn start<F>(&mut self, on_entry: F)
    where
        F: Fn(ActivityEntry) + Send + 'static,
    {
        if self.is_running() {
            return;
        }

        self.stop_flag.store(false, Ordering::Relaxed);
        self.running.store(true, Ordering::Relaxed);

        let interval = self.interval;
        let data_dir = self.data_dir.clone();
        let stop_flag = self.stop_flag.clone();
        let running = self.running.clone();

        std::thread::spawn(move || {
            let mut last_title = String::new();
            let mut last_exe = String::new();
            let mut last_ts: Option<chrono::DateTime<Local>> = None;

            loop {
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }

                let (title, exe) = get_active_window();

                if is_idle(&title, &exe) {
                    if let Some(ts) = last_ts.take() {
                        let dur = (Local::now() - ts).num_seconds().max(0) as u64;
                        let entry = ActivityEntry {
                            ts: ts.format("%Y-%m-%dT%H:%M:%S").to_string(),
                            title: last_title.clone(),
                            exe: last_exe.clone(),
                            duration: dur,
                        };
                        let _ = write_entry(&data_dir, &entry);
                        on_entry(entry);
                        last_title.clear();
                        last_exe.clear();
                    }
                } else if title == last_title && exe == last_exe {
                    // 去重
                } else {
                    if let Some(ts) = last_ts.take() {
                        let dur = (Local::now() - ts).num_seconds().max(0) as u64;
                        let entry = ActivityEntry {
                            ts: ts.format("%Y-%m-%dT%H:%M:%S").to_string(),
                            title: last_title.clone(),
                            exe: last_exe.clone(),
                            duration: dur,
                        };
                        let _ = write_entry(&data_dir, &entry);
                        on_entry(entry);
                    }
                    last_title = title;
                    last_exe = exe;
                    last_ts = Some(Local::now());
                }

                // 分段 sleep，每秒检查一次 stop_flag
                for _ in 0..interval {
                    if stop_flag.load(Ordering::Relaxed) {
                        break;
                    }
                    std::thread::sleep(Duration::from_secs(1));
                }
            }

            // 退出时 flush
            if let Some(ts) = last_ts {
                let dur = (Local::now() - ts).num_seconds().max(0) as u64;
                let entry = ActivityEntry {
                    ts: ts.format("%Y-%m-%dT%H:%M:%S").to_string(),
                    title: last_title,
                    exe: last_exe,
                    duration: dur,
                };
                let _ = write_entry(&data_dir, &entry);
                on_entry(entry);
            }

            running.store(false, Ordering::Relaxed);
        });
    }

    pub fn stop(&mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
    }
}
