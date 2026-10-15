//! Kleine JSON-Ablage im App-Datenordner (~/.local/share/dev.franz.claude-hub).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Manager};

use crate::R;

static LOCK: Mutex<()> = Mutex::new(());
static COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn new_id() -> String {
    format!(
        "{:x}{:x}",
        chrono::Utc::now().timestamp_millis(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

fn file(app: &AppHandle, name: &str) -> R<PathBuf> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> R<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn read<T: DeserializeOwned>(app: &AppHandle, name: &str) -> Vec<T> {
    file(app, name)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

pub fn load<T: DeserializeOwned>(app: &AppHandle, name: &str) -> Vec<T> {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    read(app, name)
}

pub fn update<T: DeserializeOwned + Serialize>(
    app: &AppHandle,
    name: &str,
    change: impl FnOnce(&mut Vec<T>),
) -> R<()> {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut items = read(app, name);
    change(&mut items);
    let bytes = serde_json::to_vec_pretty(&items).map_err(|e| e.to_string())?;
    write_atomic(&file(app, name)?, &bytes)
}
