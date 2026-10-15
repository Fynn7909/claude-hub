//! Öffnet ein Terminal im Projektordner und startet dort `claude`.

use std::path::Path;
use std::process::{Command, Stdio};

use crate::R;

/// Nach `claude` bleibt eine Shell offen, damit das Fenster nicht sofort zugeht.
const SCRIPT: &str = r#"claude "$@"; exec bash"#;

pub fn launch(dir: &str, resume: bool, session_id: Option<&str>) -> R<()> {
    if !Path::new(dir).is_dir() {
        return Err(format!("Ordner nicht gefunden: {dir}"));
    }
    let mut claude_args: Vec<&str> = Vec::new();
    if let Some(id) = session_id {
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err("Ungültige Session-ID".into());
        }
        claude_args.extend(["--resume", id]);
    } else if resume {
        claude_args.push("--resume");
    }

    // (Programm, Argumente bis zum Befehl). $TERMINAL zuerst, dann gängige Terminals der Desktops.
    let custom = std::env::var("TERMINAL").ok().filter(|t| !t.trim().is_empty());
    let mut terminals: Vec<(&str, Vec<&str>)> = Vec::new();
    if let Some(t) = custom.as_deref() {
        terminals.push((t, vec!["-e"]));
    }
    terminals.extend([
        ("konsole", vec!["--workdir", dir, "-e"]),
        ("gnome-terminal", vec!["--working-directory", dir, "--"]),
        ("ptyxis", vec!["--working-directory", dir, "--"]),
        ("kgx", vec!["--working-directory", dir, "--"]),
        ("xfce4-terminal", vec!["--working-directory", dir, "-x"]),
        ("tilix", vec!["--working-directory", dir, "-e"]),
        ("kitty", vec!["--directory", dir]),
        ("alacritty", vec!["--working-directory", dir, "-e"]),
        ("wezterm", vec!["start", "--cwd", dir, "--"]),
        ("foot", vec!["--working-directory", dir]),
        ("xterm", vec!["-e"]),
    ]);
    for (terminal, prefix) in terminals {
        let spawned = Command::new(terminal)
            .args(prefix)
            .args(["bash", "-lc", SCRIPT, "claude-hub"])
            .args(&claude_args)
            .current_dir(dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
        if let Ok(mut child) = spawned {
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            return Ok(());
        }
    }
    Err("Kein Terminal gefunden. Setze $TERMINAL oder installiere z. B. konsole oder gnome-terminal.".into())
}
