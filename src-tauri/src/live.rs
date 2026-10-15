//! Laufende Claude-Code-Sessions aus ~/.claude/sessions/<pid>.json.
//! Claude Code schreibt dort Arbeitsordner und Status ("busy", "idle", "waiting", "shell").

use std::collections::HashMap;

use serde::Serialize;
use serde_json::Value;

use crate::{claude_dir, logs};

#[derive(Serialize, Clone)]
pub struct Live {
    pub pid: u32,
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub title: String,
    /// "busy", "shell", "idle", "waiting" oder was Claude Code sonst meldet
    pub status: String,
    pub started_at: i64,
    pub status_since: i64,
    /// Verlauf liegt in den Logs vor
    pub has_log: bool,
}

/// Startzeit des Prozesses in Uhr-Ticks (Feld 22 aus /proc/<pid>/stat).
fn proc_start(pid: u32) -> Option<String> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // Der Programmname steht in Klammern und darf Leerzeichen enthalten.
    let rest = &stat[stat.rfind(')')? + 2..];
    rest.split(' ').nth(19).map(str::to_string)
}

/// Ohne Titel: liest nur die kleinen Status-Dateien, günstig genug für häufiges Abfragen.
pub fn raw() -> Vec<Live> {
    let Ok(dir) = std::fs::read_dir(claude_dir().join("sessions")) else { return Vec::new() };
    let mut live: Vec<Live> = dir
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|e| e == "json"))
        .filter_map(|entry| {
            let v: Value = serde_json::from_slice(&std::fs::read(entry.path()).ok()?).ok()?;
            let pid = v["pid"].as_u64()? as u32;
            // Datei kann nach einem Absturz liegen bleiben; die PID kann neu vergeben sein.
            let started = proc_start(pid)?;
            if v["procStart"].as_str().is_some_and(|expected| expected != started) {
                return None;
            }
            // Hintergrund-Läufe (Hooks, Skripte) sind keine Session, an der jemand sitzt.
            if v["kind"].as_str().is_some_and(|kind| kind != "interactive") {
                return None;
            }
            let path = v["cwd"].as_str()?.to_string();
            Some(Live {
                pid,
                session_id: v["sessionId"].as_str()?.to_string(),
                project_name: logs::project_name(&path),
                project_path: path,
                has_log: false,
                title: "Neue Session".into(),
                status: v["status"].as_str().unwrap_or("unbekannt").to_string(),
                started_at: v["startedAt"].as_i64().unwrap_or(0),
                status_since: v["statusUpdatedAt"].as_i64().or(v["updatedAt"].as_i64()).unwrap_or(0),
            })
        })
        .collect();
    live.sort_by_key(|l| std::cmp::Reverse(l.started_at));
    live
}

pub fn list() -> Vec<Live> {
    let mut live = raw();
    if live.is_empty() {
        return live;
    }
    let titles: HashMap<String, String> = logs::scan()
        .into_iter()
        .filter(|f| f.top && f.parsed.messages > 0)
        .map(|f| (f.id, f.parsed.title()))
        .collect();
    for session in &mut live {
        if let Some(title) = titles.get(&session.session_id) {
            session.title = title.clone();
            session.has_log = true;
        }
    }
    live
}

/// Arbeitet Claude gerade selbst (und wartet nicht auf den Menschen)?
pub fn working(status: &str) -> bool {
    matches!(status, "busy" | "shell")
}
