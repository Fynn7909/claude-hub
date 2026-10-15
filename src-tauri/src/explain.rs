//! Chat in der Ansicht „Begriffe“: Claude erklärt Fachbegriffe (`claude -p`, Modell Haiku).

use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

use crate::R;

const SYSTEM: &str = "Du bist der Erklär-Chat in Claude Hub. Du erklärst einem Einsteiger, der mit KI Apps und Spiele baut, \
Fachbegriffe und Technik auf Deutsch. Einfache Sprache, kurz (meist 2 bis 5 Sätze), ohne Einleitung und ohne Markdown-Überschriften. \
Wenn sinnvoll, ein kurzes Alltagsbeispiel. Rückfragen beziehen sich auf den bisherigen Verlauf. \
Erste Zeile deiner Antwort ist immer genau `Begriff: <Name>` mit dem Fachbegriff, um den es geht, so wie man ihn üblicherweise schreibt, \
oder `Begriff: -`, wenn es keine Frage nach einem einzelnen Begriff ist. Danach eine Leerzeile, dann die Antwort.";

#[derive(Deserialize)]
pub struct Message {
    pub role: String,
    pub text: String,
}

#[derive(Serialize)]
pub struct Reply {
    /// Erkannter Begriff, falls die Frage einem einzelnen Begriff galt.
    pub term: Option<String>,
    pub text: String,
}

fn clip(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

pub fn chat(messages: &[Message]) -> R<Reply> {
    let Some(last) = messages.last().filter(|m| m.role == "user" && !m.text.trim().is_empty()) else {
        return Err("Keine Frage".into());
    };
    if last.text.chars().count() > 2000 {
        return Err("Frage zu lang".into());
    }
    // Bisheriger Verlauf als Text, damit Rückfragen funktionieren; nur die letzten Nachrichten.
    let history: Vec<String> = messages[..messages.len() - 1]
        .iter()
        .rev()
        .take(10)
        .rev()
        .map(|m| format!("{}: {}", if m.role == "user" { "Nutzer" } else { "Du" }, clip(&m.text, 1500)))
        .collect();
    let prompt = if history.is_empty() {
        last.text.trim().to_string()
    } else {
        format!("Bisheriger Verlauf:\n{}\n\nNeue Frage: {}", history.join("\n\n"), last.text.trim())
    };

    // Nur Projekt-Einstellungen eines leeren Ordners: keine eigenen Hooks, keine MCP-Server, keine Tools.
    let claude = crate::home().join(".local/bin/claude");
    let program = if claude.is_file() { claude.into_os_string() } else { "claude".into() };
    let output = Command::new(program)
        .args(["-p", "--model", "haiku", "--setting-sources", "project", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--system-prompt", SYSTEM])
        .arg(prompt)
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("claude nicht startbar: {e}"))?;
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() || raw.is_empty() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() { "Claude hat nicht geantwortet".into() } else { err });
    }

    let (term, text) = match raw.split_once('\n') {
        Some((first, rest)) if first.trim_start().starts_with("Begriff:") => {
            let name = first.trim_start()["Begriff:".len()..].trim().trim_matches('`').trim().to_string();
            let term = (!name.is_empty() && name != "-" && name.chars().count() <= 60).then_some(name);
            (term, rest.trim().to_string())
        }
        _ => (None, raw),
    };
    Ok(Reply { term, text })
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Asked {
    pub term: String,
    pub meaning: String,
    pub at: i64,
}
