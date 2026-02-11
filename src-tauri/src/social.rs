use crate::activity;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct SocialStatus {
    pub social_min: u32,
    pub total_min: u32,
    pub energy_pct: u32,
    pub overloaded: bool,
}

const THRESHOLD_MIN: u32 = 120;

pub fn evaluate(data_dir: &PathBuf) -> SocialStatus {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let entries = activity::load_entries(data_dir, &today);
    let summary = activity::summarize(&entries);

    let social_sec = summary.iter()
        .find(|(c, _)| c == "社交")
        .map(|(_, d)| *d)
        .unwrap_or(0);
    let total_sec: u64 = entries.iter().map(|e| e.duration).sum();

    let social_min = (social_sec / 60) as u32;
    let total_min = (total_sec / 60) as u32;
    let energy_pct = ((social_min as f64 / THRESHOLD_MIN as f64) * 100.0).min(150.0) as u32;
    let overloaded = social_min > THRESHOLD_MIN;

    SocialStatus { social_min, total_min, energy_pct, overloaded }
}
