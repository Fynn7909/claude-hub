use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};

mod explain;
mod launch;
mod limits;
mod links;
mod live;
mod logs;
mod mcp;
mod projects;
mod search;
mod skills;
mod store;
mod tray;
mod widget;

pub type R<T> = Result<T, String>;

pub fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

pub fn claude_dir() -> PathBuf {
    home().join(".claude")
}

/// Only the app window may call commands; link windows show external pages.
fn guard(window: &WebviewWindow) -> R<()> {
    match window.label() {
        "main" => Ok(()),
        _ => Err("Nicht erlaubt".into()),
    }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> R<T> + Send + 'static) -> R<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

// ---- Skills ----

#[tauri::command]
async fn list_skills(window: WebviewWindow) -> R<Vec<skills::Skill>> {
    guard(&window)?;
    blocking(skills::list).await
}

#[tauri::command]
async fn set_skill_enabled(window: WebviewWindow, path: String, enabled: bool) -> R<()> {
    guard(&window)?;
    blocking(move || skills::set_enabled(&path, enabled)).await
}

// ---- Projekte, Sessions, Verbrauch ----

#[tauri::command]
async fn list_projects(window: WebviewWindow, refresh: Option<bool>) -> R<Vec<projects::Project>> {
    guard(&window)?;
    blocking(move || Ok(projects::list(refresh.unwrap_or(false)))).await
}

#[tauri::command]
async fn launch_claude(
    window: WebviewWindow,
    path: String,
    resume: bool,
    session_id: Option<String>,
) -> R<()> {
    guard(&window)?;
    blocking(move || launch::launch(&path, resume, session_id.as_deref())).await
}

#[tauri::command]
async fn list_sessions(window: WebviewWindow, limit: Option<usize>) -> R<Vec<logs::Session>> {
    guard(&window)?;
    blocking(move || Ok(logs::sessions(limit.unwrap_or(50)))).await
}

#[tauri::command]
async fn get_usage(window: WebviewWindow) -> R<logs::Usage> {
    guard(&window)?;
    blocking(|| Ok(logs::usage())).await
}

// ---- Suche, Verlauf, laufende Sessions ----

#[tauri::command]
async fn search_sessions(window: WebviewWindow, query: String) -> R<Vec<search::Hit>> {
    guard(&window)?;
    blocking(move || search::search(&query, 60)).await
}

#[tauri::command]
async fn read_session(window: WebviewWindow, id: String) -> R<search::Transcript> {
    guard(&window)?;
    blocking(move || search::transcript(&id)).await
}

#[tauri::command]
async fn list_live(window: WebviewWindow) -> R<Vec<live::Live>> {
    guard(&window)?;
    blocking(|| Ok(live::list())).await
}

// ---- Einstellungen ----

#[derive(Serialize, serde::Deserialize)]
struct Settings {
    /// Benachrichtigen, wenn Claude fertig ist oder eine Antwort braucht
    notify: bool,
    /// Symbol in der Kontrollleiste läuft; Schließen versteckt nur das Fenster
    #[serde(skip_deserializing)]
    tray: bool,
}

const SETTINGS: &str = "settings.json";

fn settings_file(app: &AppHandle) -> R<PathBuf> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join(SETTINGS))
}

fn load_settings(app: &AppHandle) {
    let saved = settings_file(app)
        .ok()
        .and_then(|path| std::fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice::<Settings>(&bytes).ok());
    if let Some(saved) = saved {
        tray::NOTIFY.store(saved.notify, Ordering::Relaxed);
    }
}

#[tauri::command]
async fn get_settings(window: WebviewWindow) -> R<Settings> {
    guard(&window)?;
    Ok(Settings { notify: tray::NOTIFY.load(Ordering::Relaxed), tray: tray::ACTIVE.load(Ordering::Relaxed) })
}

#[tauri::command]
async fn set_notify(window: WebviewWindow, app: AppHandle, enabled: bool) -> R<()> {
    guard(&window)?;
    tray::NOTIFY.store(enabled, Ordering::Relaxed);
    let bytes = serde_json::to_vec_pretty(&Settings { notify: enabled, tray: false }).map_err(|e| e.to_string())?;
    store::write_atomic(&settings_file(&app)?, &bytes)
}

/// Was der Aufruf öffnen soll: `--palette`, `--view <name>`, `--search <text>` oder `--session <id>`.
fn intent(args: &[String]) -> Option<Value> {
    let value = |flag: &str| args.iter().position(|arg| arg == flag).and_then(|i| args.get(i + 1));
    if args.iter().any(|arg| arg == "--palette") {
        Some(json!({ "palette": true }))
    } else if let Some(query) = value("--search") {
        Some(json!({ "view": "sessions", "options": { "query": query } }))
    } else if let Some(id) = value("--session") {
        Some(json!({ "view": "session", "options": { "id": id } }))
    } else {
        value("--view").map(|view| json!({ "view": view }))
    }
}

/// Wunsch des ersten Starts: Die Oberfläche holt ihn beim Laden einmal ab.
static START_INTENT: Mutex<Option<Value>> = Mutex::new(None);

#[tauri::command]
async fn take_start_intent(window: WebviewWindow) -> R<Option<Value>> {
    guard(&window)?;
    Ok(START_INTENT.lock().unwrap_or_else(|e| e.into_inner()).take())
}

// ---- MCP ----

#[tauri::command]
async fn list_mcp(window: WebviewWindow) -> R<Vec<mcp::Server>> {
    guard(&window)?;
    blocking(|| Ok(mcp::list())).await
}

// ---- Links ----

#[tauri::command]
async fn list_links(window: WebviewWindow, app: AppHandle) -> R<Vec<links::Link>> {
    guard(&window)?;
    Ok(store::load(&app, links::FILE))
}

#[tauri::command]
async fn add_link(window: WebviewWindow, app: AppHandle, url: String) -> R<links::Link> {
    guard(&window)?;
    links::add(&app, &url).await
}

#[tauri::command]
async fn remove_link(window: WebviewWindow, app: AppHandle, id: String) -> R<()> {
    guard(&window)?;
    store::update::<links::Link>(&app, links::FILE, |items| items.retain(|l| l.id != id))
}

#[tauri::command]
async fn open_link(window: WebviewWindow, app: AppHandle, id: String) -> R<()> {
    guard(&window)?;
    links::open(&app, &id)
}

// ---- Prompts ----

#[derive(Serialize, serde::Deserialize, Clone)]
struct Prompt {
    id: String,
    title: String,
    body: String,
    updated: i64,
}

const PROMPTS: &str = "prompts.json";

#[tauri::command]
async fn list_prompts(window: WebviewWindow, app: AppHandle) -> R<Vec<Prompt>> {
    guard(&window)?;
    Ok(store::load(&app, PROMPTS))
}

#[tauri::command]
async fn save_prompt(
    window: WebviewWindow,
    app: AppHandle,
    id: Option<String>,
    title: String,
    body: String,
) -> R<()> {
    guard(&window)?;
    let body = body.trim().to_string();
    if body.is_empty() {
        return Err("Prompt ist leer".into());
    }
    let title = match title.trim() {
        "" => body.lines().next().unwrap_or("").chars().take(60).collect(),
        t => t.to_string(),
    };
    let updated = chrono::Utc::now().timestamp_millis();
    store::update::<Prompt>(&app, PROMPTS, |items| {
        match id.and_then(|id| items.iter_mut().find(|p| p.id == id)) {
            Some(p) => {
                p.title = title;
                p.body = body;
                p.updated = updated;
            }
            None => items.insert(0, Prompt { id: store::new_id(), title, body, updated }),
        }
    })
}

#[tauri::command]
async fn remove_prompt(window: WebviewWindow, app: AppHandle, id: String) -> R<()> {
    guard(&window)?;
    store::update::<Prompt>(&app, PROMPTS, |items| items.retain(|p| p.id != id))
}

// ---- Globale CLAUDE.md ----

#[derive(Serialize)]
struct GlobalMd {
    path: String,
    exists: bool,
    content: String,
}

#[tauri::command]
async fn read_global_md(window: WebviewWindow) -> R<GlobalMd> {
    guard(&window)?;
    let path = claude_dir().join("CLAUDE.md");
    let content = std::fs::read_to_string(&path).ok();
    Ok(GlobalMd {
        path: path.to_string_lossy().into_owned(),
        exists: content.is_some(),
        content: content.unwrap_or_default(),
    })
}

#[tauri::command]
async fn write_global_md(window: WebviewWindow, content: String) -> R<()> {
    guard(&window)?;
    let path = claude_dir().join("CLAUDE.md");
    store::write_atomic(&path, content.as_bytes())
}

// ---- Begriffe-Chat ----

const ASKED: &str = "asked_terms.json";

#[tauri::command]
async fn glossary_chat(window: WebviewWindow, messages: Vec<explain::Message>) -> R<explain::Reply> {
    guard(&window)?;
    blocking(move || explain::chat(&messages)).await
}

#[tauri::command]
async fn list_asked(window: WebviewWindow, app: AppHandle) -> R<Vec<explain::Asked>> {
    guard(&window)?;
    Ok(store::load(&app, ASKED))
}

/// Merkt sich einen gefragten Begriff samt Erklärung; gleicher Begriff wird ersetzt.
#[tauri::command]
async fn save_asked(window: WebviewWindow, app: AppHandle, term: String, meaning: String) -> R<()> {
    guard(&window)?;
    let term = term.trim().to_string();
    if term.is_empty() || term.chars().count() > 60 || meaning.trim().is_empty() {
        return Err("Ungültiger Begriff".into());
    }
    store::update(&app, ASKED, |items: &mut Vec<explain::Asked>| {
        items.retain(|a| !a.term.eq_ignore_ascii_case(&term));
        items.insert(0, explain::Asked { term, meaning: meaning.trim().to_string(), at: chrono::Utc::now().timestamp_millis() });
        items.truncate(2000);
    })
}

#[tauri::command]
async fn remove_asked(window: WebviewWindow, app: AppHandle, term: String) -> R<()> {
    guard(&window)?;
    store::update(&app, ASKED, |items: &mut Vec<explain::Asked>| items.retain(|a| a.term != term))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Das Desktop-Widget fragt nur Zahlen ab; dafür startet keine Oberfläche.
    if std::env::args().any(|arg| arg == "--widget-json") {
        widget::print();
        return;
    }

    *START_INTENT.lock().unwrap_or_else(|e| e.into_inner()) = intent(&std::env::args().collect::<Vec<_>>());

    tauri::Builder::default()
        // Zweiter Start (Tastenkürzel, Startmenü) holt das laufende Fenster nach vorn.
        .plugin(tauri_plugin_single_instance::init(move |app, args, _cwd| {
            tray::show_main(app, intent(&args));
        }))
        .setup(|app| {
            let handle = app.handle().clone();
            load_settings(&handle);
            tray::install(&handle);
            tray::watch(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Mit Symbol in der Kontrollleiste läuft die App im Hintergrund weiter.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && tray::ACTIVE.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_skills,
            set_skill_enabled,
            list_projects,
            launch_claude,
            list_sessions,
            get_usage,
            search_sessions,
            read_session,
            list_live,
            get_settings,
            set_notify,
            take_start_intent,
            list_mcp,
            list_links,
            add_link,
            remove_link,
            open_link,
            list_prompts,
            save_prompt,
            remove_prompt,
            read_global_md,
            write_global_md,
            glossary_chat,
            list_asked,
            save_asked,
            remove_asked,
        ])
        .run(tauri::generate_context!())
        .expect("Claude Hub konnte nicht starten");
}
