//! Projekte: Ordner mit CLAUDE.md oder .claude, plus Ordner, die in den Logs vorkommen.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use walkdir::WalkDir;

use crate::{home, logs};

const SKIP: &[&str] = &[
    "node_modules", "target", "build", "dist", "venv", "__pycache__", "snap", "Steam", "vendor",
];
const SCAN_TTL: Duration = Duration::from_secs(300);

static FOUND: Mutex<Option<(Instant, Vec<String>)>> = Mutex::new(None);

#[derive(Serialize)]
pub struct Project {
    pub name: String,
    pub path: String,
    has_claude_md: bool,
    has_claude_dir: bool,
    sessions: u32,
    pub last_active: Option<i64>,
}

fn find(refresh: bool) -> Vec<String> {
    let mut found = FOUND.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, paths)) = found.as_ref() {
        if !refresh && at.elapsed() < SCAN_TTL {
            return paths.clone();
        }
    }
    let walker = WalkDir::new(home()).min_depth(1).max_depth(5).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        e.file_type().is_dir() && !name.starts_with('.') && !SKIP.contains(&name.as_ref())
    });
    let paths: Vec<String> = walker
        .flatten()
        .filter(|e| e.path().join("CLAUDE.md").is_file() || e.path().join(".claude").is_dir())
        .map(|e| e.path().to_string_lossy().into_owned())
        .collect();
    *found = Some((Instant::now(), paths.clone()));
    paths
}

pub fn list(refresh: bool) -> Vec<Project> {
    let mut activity: HashMap<String, (u32, Option<i64>)> = HashMap::new();
    for file in logs::scan().iter().filter(|f| f.top && f.parsed.messages > 0) {
        let Some(cwd) = file.parsed.cwd.clone() else { continue };
        let entry = activity.entry(cwd).or_default();
        entry.0 += 1;
        entry.1 = entry.1.max(file.parsed.last_ts.map(|t| t.timestamp_millis()));
    }

    let mut paths = find(refresh);
    paths.extend(activity.keys().filter(|p| Path::new(p).is_dir()).cloned());
    paths.sort();
    paths.dedup();

    let mut projects: Vec<Project> = paths
        .into_iter()
        .map(|path| {
            let dir = Path::new(&path);
            let (sessions, last_active) = activity.get(&path).copied().unwrap_or_default();
            Project {
                name: logs::project_name(&path),
                has_claude_md: dir.join("CLAUDE.md").is_file(),
                has_claude_dir: dir.join(".claude").is_dir(),
                sessions,
                last_active,
                path,
            }
        })
        .collect();
    projects.sort_by(|a, b| {
        b.last_active.cmp(&a.last_active).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    projects
}
