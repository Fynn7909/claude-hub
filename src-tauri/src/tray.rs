//! Symbol im Systemabschnitt der Kontrollleiste und der Wächter für laufende Sessions:
//! meldet, wenn Claude fertig ist oder auf eine Antwort wartet.

use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

use crate::{launch, live, logs, projects};

const TRAY: &str = "main";
const POLL: Duration = Duration::from_secs(3);
const MENU_REFRESH: Duration = Duration::from_secs(60);
/// Kürzere Antworten hat man ohnehin vor Augen.
const QUIET_BELOW_MS: i64 = 10_000;

/// Mit Symbol bleibt die App beim Schließen des Fensters im Hintergrund.
pub static ACTIVE: AtomicBool = AtomicBool::new(false);
pub static NOTIFY: AtomicBool = AtomicBool::new(true);
/// Ordner hinter den Menüeinträgen "project:<n>".
static PROJECTS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Holt das Fenster nach vorn, auch wenn es versteckt oder verdeckt war.
pub fn show_main(app: &AppHandle, intent: Option<serde_json::Value>) {
    let Some(window) = app.get_webview_window("main") else { return };
    let focused = window.is_focused().unwrap_or(false);
    if !focused {
        // Wayland lässt ein offenes Fenster sich nicht selbst nach vorn holen; neu einblenden schon.
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        }
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    if let Some(intent) = intent {
        let _ = app.emit_to("main", "intent", intent);
    }
}

fn compact(n: u64) -> String {
    let (value, unit) = match n {
        1_000_000_000.. => (n as f64 / 1e9, " Mrd."),
        1_000_000.. => (n as f64 / 1e6, " Mio."),
        1_000.. => (n as f64 / 1e3, " Tsd."),
        _ => return n.to_string(),
    };
    format!("{}{unit}", format!("{value:.1}").replace('.', ","))
}

fn dollars(cost: f64) -> String {
    format!("{cost:.2}").replace('.', ",")
}

pub fn status_label(status: &str) -> &str {
    match status {
        "busy" => "arbeitet",
        "shell" => "führt Befehl aus",
        "idle" => "wartet auf Eingabe",
        "waiting" => "braucht Antwort",
        other => other,
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    let info = |text: String| MenuItem::new(app, text, false, None::<&str>);
    let line = || PredefinedMenuItem::separator(app);

    let usage = logs::usage();
    menu.append(&info(format!("Heute: {} Tokens · ≈ {} $", compact(usage.today.total()), dollars(usage.cost_today)))?)?;
    let minutes_until = |reset: i64| ((reset - chrono::Utc::now().timestamp_millis()) / 60_000).max(0);
    if let Some(limits) = &usage.limits {
        match &limits.session {
            Some(session) => {
                let minutes = minutes_until(session.reset);
                menu.append(&info(format!("5-Stunden-Fenster: {:.0} % · noch {} h {:02} min", session.percent, minutes / 60, minutes % 60))?)?;
            }
            None => menu.append(&info("5-Stunden-Fenster: frei".into())?)?,
        }
        if let Some(week) = &limits.week {
            menu.append(&info(format!("Woche: {:.0} %", week.percent))?)?;
        }
    } else if let Some(block) = &usage.block {
        let minutes = minutes_until(block.reset);
        menu.append(&info(format!("5-Stunden-Fenster: noch {} h {:02} min (geschätzt)", minutes / 60, minutes % 60))?)?;
    }

    let sessions = live::raw();
    if !sessions.is_empty() {
        menu.append(&line()?)?;
        for session in sessions.iter().take(6) {
            menu.append(&info(format!("{} · {}", session.project_name, status_label(&session.status)))?)?;
        }
    }

    let recent: Vec<(String, String)> = projects::list(false)
        .into_iter()
        .filter(|p| p.last_active.is_some())
        .take(3)
        .map(|p| (p.name, p.path))
        .collect();
    if !recent.is_empty() {
        menu.append(&line()?)?;
        for (i, (name, _)) in recent.iter().enumerate() {
            menu.append(&MenuItem::with_id(app, format!("project:{i}"), format!("Claude starten: {name}"), true, None::<&str>)?)?;
        }
    }
    *PROJECTS.lock().unwrap_or_else(|e| e.into_inner()) = recent.into_iter().map(|(_, path)| path).collect();

    menu.append(&line()?)?;
    menu.append(&MenuItem::with_id(app, "palette", "Suchen …", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "open", "Claude Hub öffnen", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?)?;
    Ok(menu)
}

fn refresh_menu(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY) else { return };
    if let Ok(menu) = build_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "open" => show_main(app, None),
        "palette" => show_main(app, Some(serde_json::json!({ "palette": true }))),
        "quit" => app.exit(0),
        _ => {
            let Some(index) = id.strip_prefix("project:").and_then(|i| i.parse::<usize>().ok()) else { return };
            let path = PROJECTS.lock().unwrap_or_else(|e| e.into_inner()).get(index).cloned();
            if let Some(path) = path {
                std::thread::spawn(move || {
                    let _ = launch::launch(&path, false, None);
                });
            }
        }
    }
}

pub fn install(app: &AppHandle) {
    let built = build_menu(app).and_then(|menu| {
        let mut builder = TrayIconBuilder::with_id(TRAY)
            .tooltip("Claude Hub")
            .menu(&menu)
            .on_menu_event(|app, event| on_menu(app, event.id().as_ref()));
        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }
        builder.build(app)
    });
    match built {
        Ok(_) => ACTIVE.store(true, Ordering::Relaxed),
        Err(error) => eprintln!("Kein Symbol in der Kontrollleiste: {error}"),
    }
}

fn notify(title: &str, body: &str) {
    let spawned = Command::new("notify-send")
        .args(["--app-name", "Claude Hub", "--icon", "claude-hub", "--hint", "string:desktop-entry:claude-hub", title, body])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    if let Ok(mut child) = spawned {
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
}

/// Meldet den Wechsel von "arbeitet" zu "fertig" oder "braucht Antwort".
fn announce(pid: u32, before: &live::Live, status: &str) {
    if !NOTIFY.load(Ordering::Relaxed) || !live::working(&before.status) {
        return;
    }
    let worked = chrono::Utc::now().timestamp_millis() - before.status_since;
    let title = match status {
        "idle" if worked >= QUIET_BELOW_MS => "Claude ist fertig",
        "waiting" => "Claude braucht deine Antwort",
        _ => return,
    };
    let session = live::list().into_iter().find(|l| l.pid == pid);
    let body = match &session {
        Some(s) if s.has_log => format!("{} · {}", s.project_name, s.title),
        _ => before.project_name.clone(),
    };
    notify(title, &body);
}

/// Läuft im Hintergrund, solange die App lebt.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut known: HashMap<u32, live::Live> = live::raw().into_iter().map(|l| (l.pid, l)).collect();
        let mut refreshed = Instant::now();
        loop {
            std::thread::sleep(POLL);
            let now: HashMap<u32, live::Live> = live::raw().into_iter().map(|l| (l.pid, l)).collect();
            let mut changed = now.len() != known.len();
            for (pid, session) in &now {
                match known.get(pid) {
                    Some(before) if before.status == session.status => {}
                    Some(before) => {
                        changed = true;
                        announce(*pid, before, &session.status);
                    }
                    None => changed = true,
                }
            }
            known = now;
            if changed {
                let _ = app.emit_to("main", "live-changed", ());
            }
            if changed || refreshed.elapsed() >= MENU_REFRESH {
                refreshed = Instant::now();
                refresh_menu(&app);
            }
        }
    });
}
