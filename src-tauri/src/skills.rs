//! Skills aus ~/.claude/skills. Ausgeschaltet = SKILL.md heißt SKILL.md.disabled,
//! dann lädt Claude Code den Skill nicht mehr.

use std::path::Path;

use serde::Serialize;
use walkdir::WalkDir;

use crate::{claude_dir, R};

const ON: &str = "SKILL.md";
const OFF: &str = "SKILL.md.disabled";

#[derive(Serialize)]
pub struct Skill {
    name: String,
    description: String,
    /// Skill-Ordner
    path: String,
    enabled: bool,
}

pub fn list() -> R<Vec<Skill>> {
    let root = claude_dir().join("skills");
    let mut skills = Vec::new();
    let walker = WalkDir::new(&root)
        .follow_links(true)
        .max_depth(5)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'));
    for entry in walker.flatten() {
        let file_name = entry.file_name().to_string_lossy();
        if !entry.file_type().is_file() || (file_name != ON && file_name != OFF) {
            continue;
        }
        let Some(dir) = entry.path().parent() else { continue };
        let text = std::fs::read_to_string(entry.path()).unwrap_or_default();
        let (name, description) = front_matter(&text);
        skills.push(Skill {
            name: name.unwrap_or_else(|| {
                dir.file_name().unwrap_or_default().to_string_lossy().into_owned()
            }),
            description: description.unwrap_or_default(),
            path: dir.to_string_lossy().into_owned(),
            enabled: file_name == ON,
        });
    }
    skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(skills)
}

pub fn set_enabled(dir: &str, enabled: bool) -> R<()> {
    let root = claude_dir().join("skills").canonicalize().map_err(|e| e.to_string())?;
    let dir = Path::new(dir).canonicalize().map_err(|e| e.to_string())?;
    if !dir.starts_with(&root) || dir == root {
        return Err("Pfad liegt nicht in ~/.claude/skills".into());
    }
    let (from, to) = if enabled { (OFF, ON) } else { (ON, OFF) };
    if dir.join(to).exists() {
        return Ok(());
    }
    std::fs::rename(dir.join(from), dir.join(to)).map_err(|e| e.to_string())
}

/// Liest `name` und `description` aus dem YAML-Kopf (einfache, zitierte und Block-Werte).
fn front_matter(text: &str) -> (Option<String>, Option<String>) {
    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (None, None);
    }
    let head: Vec<&str> = lines.take_while(|l| l.trim() != "---").collect();
    let (mut name, mut description) = (None, None);
    let mut i = 0;
    while i < head.len() {
        let line = head[i];
        i += 1;
        let Some((key, raw)) = line.split_once(':') else { continue };
        if line.starts_with([' ', '\t']) {
            continue;
        }
        let raw = raw.trim();
        let value = if raw.is_empty() || raw.starts_with(['>', '|']) {
            let mut parts = Vec::new();
            while i < head.len() && (head[i].starts_with([' ', '\t']) || head[i].trim().is_empty()) {
                parts.push(head[i].trim());
                i += 1;
            }
            parts.join(" ").trim().to_string()
        } else if raw.starts_with('"') {
            serde_json::from_str::<String>(raw).unwrap_or_else(|_| raw.trim_matches('"').to_string())
        } else if raw.starts_with('\'') {
            raw.trim_matches('\'').replace("''", "'")
        } else {
            raw.to_string()
        };
        match key.trim() {
            "name" => name = Some(value),
            "description" => description = Some(value),
            _ => {}
        }
    }
    (name.filter(|s| !s.is_empty()), description)
}
