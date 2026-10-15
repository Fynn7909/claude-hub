//! Volltextsuche über alle Sessions und Verlauf einer einzelnen Session.

use std::io::{BufRead, BufReader};

use regex::{Regex, RegexBuilder};
use serde::Serialize;
use serde_json::Value;

use crate::{logs, R};

const SNIPPETS: usize = 3;
const CONTEXT: usize = 70;
const MAX_ITEMS: usize = 1500;
const MAX_TEXT: usize = 12_000;

#[derive(Serialize)]
pub struct Snippet {
    role: &'static str,
    before: String,
    hit: String,
    after: String,
}

#[derive(Serialize)]
pub struct Hit {
    id: String,
    project_path: String,
    project_name: String,
    title: String,
    last_active: i64,
    hits: u32,
    snippets: Vec<Snippet>,
}

fn matcher(needle: &str) -> R<Regex> {
    RegexBuilder::new(&regex::escape(needle))
        .case_insensitive(true)
        .build()
        .map_err(|e| e.to_string())
}

/// Sichtbarer Text einer Zeile: was der Mensch schrieb oder Claude antwortete.
fn texts(v: &Value) -> Vec<(&'static str, &str)> {
    let role = match v["type"].as_str() {
        Some("user") if v["isMeta"].as_bool() != Some(true) => "user",
        Some("assistant") => "assistant",
        _ => return Vec::new(),
    };
    match &v["message"]["content"] {
        Value::String(s) => vec![(role, s.as_str())],
        Value::Array(items) => items
            .iter()
            .filter(|i| i["type"] == "text")
            .filter_map(|i| i["text"].as_str())
            .map(|t| (role, t))
            .collect(),
        _ => Vec::new(),
    }
}

/// Eingeschleuste Hinweise und Befehls-Hüllen zählen nicht als Nachricht des Menschen.
fn injected(role: &str, text: &str) -> bool {
    role == "user" && text.trim_start().starts_with('<')
}

fn squash(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Fundstelle mit etwas Umgebung; Zeilenumbrüche werden zu Leerzeichen.
fn snippet(role: &'static str, text: &str, start: usize, end: usize) -> Snippet {
    let (head, tail) = (&text[..start], &text[end..]);
    let skip = head.chars().count().saturating_sub(CONTEXT);
    let flat = |part: String| part.replace(char::is_whitespace, " ");
    Snippet {
        role,
        before: format!("{}{}", if skip > 0 { "…" } else { "" }, flat(head.chars().skip(skip).collect())),
        hit: text[start..end].to_string(),
        after: format!(
            "{}{}",
            flat(tail.chars().take(CONTEXT).collect()),
            if tail.chars().count() > CONTEXT { "…" } else { "" }
        ),
    }
}

pub fn search(query: &str, limit: usize) -> R<Vec<Hit>> {
    let query = query.trim();
    if query.chars().count() < 2 {
        return Ok(Vec::new());
    }
    let wanted = matcher(query)?;
    // Vorfilter auf der rohen Zeile: dort steht der Text JSON-kodiert.
    let encoded = serde_json::to_string(query).map_err(|e| e.to_string())?;
    let raw = matcher(&encoded[1..encoded.len() - 1])?;

    let mut hits = Vec::new();
    for file in logs::scan().into_iter().filter(|f| f.top && f.parsed.messages > 0) {
        let (Some(cwd), Some(last)) = (file.parsed.cwd.clone(), file.parsed.last_ts) else { continue };
        let Ok(content) = std::fs::read_to_string(&file.path) else { continue };
        if !raw.is_match(&content) {
            continue;
        }
        let mut count = 0;
        let mut snippets = Vec::new();
        for line in content.lines().filter(|line| raw.is_match(line)) {
            let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
            for (role, text) in texts(&v) {
                if injected(role, text) {
                    continue;
                }
                for found in wanted.find_iter(text) {
                    count += 1;
                    if snippets.len() < SNIPPETS && count as usize <= SNIPPETS {
                        snippets.push(snippet(role, text, found.start(), found.end()));
                    }
                }
            }
        }
        let title = file.parsed.title();
        let in_title = wanted.is_match(&title);
        if count == 0 && !in_title {
            continue;
        }
        hits.push(Hit {
            id: file.id,
            project_name: logs::project_name(&cwd),
            project_path: cwd,
            title,
            last_active: last.timestamp_millis(),
            hits: count,
            snippets,
        });
    }
    hits.sort_by_key(|h| std::cmp::Reverse(h.last_active));
    hits.truncate(limit);
    Ok(hits)
}

#[derive(Serialize)]
pub struct Item {
    /// "user", "assistant" oder "tool"
    role: &'static str,
    text: String,
    ts: Option<String>,
}

#[derive(Serialize)]
pub struct Transcript {
    id: String,
    project_path: String,
    project_name: String,
    title: String,
    last_active: Option<i64>,
    /// ältere Einträge weggelassen
    skipped: usize,
    items: Vec<Item>,
}

fn clip(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let cut: String = text.chars().take(max).collect();
    format!("{cut} …")
}

/// Kurzform eines Werkzeug-Aufrufs, z. B. "Bash · Tests ausführen".
fn tool_line(block: &Value) -> String {
    let name = block["name"].as_str().unwrap_or("Werkzeug");
    let input = &block["input"];
    let detail = ["description", "file_path", "command", "pattern", "query", "url", "prompt", "skill"]
        .iter()
        .find_map(|key| input[*key].as_str());
    match detail {
        Some(detail) => format!("{name} · {}", clip(&squash(detail), 110)),
        None => name.to_string(),
    }
}

pub fn transcript(id: &str) -> R<Transcript> {
    let file = logs::scan()
        .into_iter()
        .find(|f| f.top && f.id == id)
        .ok_or("Session nicht gefunden")?;
    let reader = BufReader::new(std::fs::File::open(&file.path).map_err(|e| e.to_string())?);
    let mut items: Vec<Item> = Vec::new();
    for line in reader.lines().map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        let ts = v["timestamp"].as_str().map(str::to_string);
        for (role, text) in texts(&v) {
            if injected(role, text) || text.trim().is_empty() {
                continue;
            }
            items.push(Item { role, text: clip(text.trim(), MAX_TEXT), ts: ts.clone() });
        }
        if v["type"] == "assistant" {
            if let Some(blocks) = v["message"]["content"].as_array() {
                for block in blocks.iter().filter(|b| b["type"] == "tool_use") {
                    items.push(Item { role: "tool", text: tool_line(block), ts: ts.clone() });
                }
            }
        }
    }
    let skipped = items.len().saturating_sub(MAX_ITEMS);
    items.drain(..skipped);
    let cwd = file.parsed.cwd.clone().unwrap_or_default();
    Ok(Transcript {
        id: file.id,
        project_name: logs::project_name(&cwd),
        project_path: cwd,
        title: file.parsed.title(),
        last_active: file.parsed.last_ts.map(|t| t.timestamp_millis()),
        skipped,
        items,
    })
}
