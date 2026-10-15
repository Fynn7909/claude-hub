//! Liest die Claude-Code-Logs (~/.claude/projects/**/*.jsonl): Sessions und Token-Verbrauch.
//! Geparste Dateien werden nach Änderungszeit und Größe zwischengespeichert.

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::SystemTime;

use chrono::{DateTime, Days, Duration, DurationRound, Local, NaiveDate, Utc};
use serde::Serialize;
use serde_json::Value;
use walkdir::WalkDir;

use crate::{claude_dir, limits};

#[derive(Default, Clone, Copy, Serialize)]
pub struct Tokens {
    input: u64,
    output: u64,
    cache_write: u64,
    cache_read: u64,
}

impl Tokens {
    fn add(&mut self, other: &Tokens) {
        self.input += other.input;
        self.output += other.output;
        self.cache_write += other.cache_write;
        self.cache_read += other.cache_read;
    }

    pub fn total(&self) -> u64 {
        self.input + self.output + self.cache_write + self.cache_read
    }
}

/// Eine Assistant-Antwort mit Verbrauch.
struct Reply {
    id: String,
    ts: DateTime<Utc>,
    /// lokaler Tag
    day: NaiveDate,
    model: String,
    tokens: Tokens,
    /// API-Listenpreis in US-Dollar
    cost: f64,
}

pub struct Parsed {
    pub cwd: Option<String>,
    title: Option<String>,
    first_prompt: Option<String>,
    pub last_ts: Option<DateTime<Utc>>,
    pub messages: u32,
    usage: Vec<Reply>,
}

impl Parsed {
    pub fn title(&self) -> String {
        self.title
            .clone()
            .or_else(|| self.first_prompt.clone())
            .unwrap_or_else(|| "Ohne Titel".into())
    }
}

/// US-Dollar je Million Tokens: Eingabe, Ausgabe, Cache schreiben (5 min), Cache schreiben (1 h), Cache lesen.
/// Listenpreise der Claude API; im Abo fallen sie nicht an, sie zeigen nur den Gegenwert.
fn rates(model: &str) -> Option<[f64; 5]> {
    Some(match model {
        m if m.starts_with("claude-opus-5-5") => [4.0, 20.0, 5.0, 8.0, 0.2],
        m if m.starts_with("claude-opus") => [5.0, 25.0, 6.25, 10.0, 0.5],
        m if m.starts_with("claude-fable") || m.starts_with("claude-mythos") => [10.0, 50.0, 12.5, 20.0, 0.25],
        m if m.starts_with("claude-sonnet-5") => [2.0, 10.0, 2.5, 4.0, 0.2],
        m if m.starts_with("claude-sonnet") => [3.0, 15.0, 3.75, 6.0, 0.3],
        m if m.starts_with("claude-haiku-5") => [0.1, 0.5, 0.125, 0.2, 0.01],
        m if m.starts_with("claude-haiku") => [1.0, 5.0, 1.25, 2.0, 0.1],
        _ => return None,
    })
}

struct Cached {
    mtime: SystemTime,
    len: u64,
    parsed: Arc<Parsed>,
}

static CACHE: LazyLock<Mutex<HashMap<PathBuf, Cached>>> = LazyLock::new(Default::default);

pub struct LogFile {
    pub id: String,
    pub path: PathBuf,
    /// Haupt-Session (keine Subagent-Datei)
    pub top: bool,
    pub parsed: Arc<Parsed>,
}

fn clean(text: &str) -> String {
    let joined = text.split_whitespace().collect::<Vec<_>>().join(" ");
    joined.chars().take(140).collect()
}

fn parse(path: &Path) -> Parsed {
    let mut parsed = Parsed {
        cwd: None,
        title: None,
        first_prompt: None,
        last_ts: None,
        messages: 0,
        usage: Vec::new(),
    };
    let Ok(file) = std::fs::File::open(path) else { return parsed };
    // Streaming schreibt dieselbe Antwort mehrfach; der letzte Eintrag je ID zählt.
    let mut replies: HashMap<String, Reply> = HashMap::new();

    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        if parsed.cwd.is_none() {
            parsed.cwd = v["cwd"].as_str().map(str::to_string);
        }
        let ts = v["timestamp"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|t| t.with_timezone(&Utc));
        if let Some(ts) = ts {
            parsed.last_ts = Some(parsed.last_ts.map_or(ts, |old| old.max(ts)));
        }
        match v["type"].as_str() {
            Some("ai-title") => parsed.title = v["aiTitle"].as_str().map(clean),
            Some("summary") => parsed.title = v["summary"].as_str().map(clean),
            Some("user") => {
                if v["isMeta"].as_bool() == Some(true) {
                    continue;
                }
                let content = &v["message"]["content"];
                let text = match content {
                    Value::String(s) => Some(s.as_str()),
                    Value::Array(items) => {
                        if items.iter().any(|i| i["type"] == "tool_result") {
                            None
                        } else {
                            items.iter().find_map(|i| i["text"].as_str())
                        }
                    }
                    _ => None,
                };
                if let Some(text) = text {
                    parsed.messages += 1;
                    if parsed.first_prompt.is_none() && !text.trim_start().starts_with('<') {
                        parsed.first_prompt = Some(clean(text));
                    }
                }
            }
            Some("assistant") => {
                let message = &v["message"];
                let (Some(id), Some(ts)) = (message["id"].as_str(), ts) else { continue };
                if message["model"] == "<synthetic>" {
                    continue;
                }
                let usage = &message["usage"];
                let get = |key: &str| usage[key].as_u64().unwrap_or(0);
                let tokens = Tokens {
                    input: get("input_tokens"),
                    output: get("output_tokens"),
                    cache_write: get("cache_creation_input_tokens"),
                    cache_read: get("cache_read_input_tokens"),
                };
                let model = message["model"].as_str().unwrap_or("unbekannt").to_string();
                // Schreiben in den 1-Stunden-Cache kostet mehr als in den 5-Minuten-Cache.
                let hour = usage["cache_creation"]["ephemeral_1h_input_tokens"].as_u64().unwrap_or(0);
                let cost = rates(&model).map_or(0.0, |[input, output, write, write_hour, read]| {
                    let short = tokens.cache_write.saturating_sub(hour);
                    (tokens.input as f64 * input
                        + tokens.output as f64 * output
                        + short as f64 * write
                        + hour.min(tokens.cache_write) as f64 * write_hour
                        + tokens.cache_read as f64 * read)
                        / 1e6
                });
                let day = ts.with_timezone(&Local).date_naive();
                replies.insert(id.to_string(), Reply { id: id.to_string(), ts, day, model, tokens, cost });
            }
            _ => {}
        }
    }
    parsed.messages += replies.len() as u32;
    parsed.usage = replies.into_values().collect();
    parsed
}

pub fn scan() -> Vec<LogFile> {
    let root = claude_dir().join("projects");
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let mut files = Vec::new();
    for entry in WalkDir::new(&root).min_depth(2).max_depth(5).into_iter().flatten() {
        let path = entry.path();
        if !entry.file_type().is_file() || path.extension().is_none_or(|e| e != "jsonl") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let fresh = cache
            .get(path)
            .is_some_and(|c| c.mtime == mtime && c.len == meta.len());
        if !fresh {
            let parsed = Arc::new(parse(path));
            cache.insert(path.to_path_buf(), Cached { mtime, len: meta.len(), parsed });
        }
        files.push(LogFile {
            id: path.file_stem().unwrap_or_default().to_string_lossy().into_owned(),
            path: path.to_path_buf(),
            top: entry.depth() == 2,
            parsed: cache[path].parsed.clone(),
        });
    }
    cache.retain(|path, _| path.exists());
    files
}

pub fn project_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

#[derive(Serialize)]
pub struct Session {
    id: String,
    project_path: String,
    project_name: String,
    title: String,
    last_active: i64,
    messages: u32,
}

pub fn sessions(limit: usize) -> Vec<Session> {
    let mut sessions: Vec<Session> = scan()
        .into_iter()
        .filter(|f| f.top && f.parsed.messages > 0)
        .filter_map(|f| {
            let p = &f.parsed;
            let path = p.cwd.clone()?;
            Some(Session {
                id: f.id,
                project_name: project_name(&path),
                project_path: path,
                title: p.title(),
                last_active: p.last_ts?.timestamp_millis(),
                messages: p.messages,
            })
        })
        .collect();
    sessions.sort_by_key(|s| std::cmp::Reverse(s.last_active));
    sessions.truncate(limit);
    sessions
}

#[derive(Serialize)]
pub struct Day {
    date: String,
    tokens: Tokens,
    cost: f64,
}

#[derive(Serialize)]
pub struct ProjectUsage {
    path: String,
    name: String,
    today: Tokens,
    week: Tokens,
    /// letzte 30 Tage
    month: Tokens,
    cost_month: f64,
}

#[derive(Serialize)]
pub struct ModelUsage {
    model: String,
    /// letzte 30 Tage
    tokens: Tokens,
    cost: f64,
    priced: bool,
}

/// Laufendes 5-Stunden-Fenster, aus den Logs geschätzt.
#[derive(Serialize)]
pub struct Block {
    start: i64,
    pub reset: i64,
    tokens: Tokens,
    cost: f64,
}

#[derive(Serialize)]
pub struct Usage {
    pub today: Tokens,
    /// letzte 7 Tage inklusive heute
    week: Tokens,
    days: Vec<Day>,
    projects: Vec<ProjectUsage>,
    pub cost_today: f64,
    cost_week: f64,
    cost_month: f64,
    /// letzte 26 Wochen, ältester Tag zuerst, beginnt an einem Montag
    heatmap: Vec<Day>,
    models: Vec<ModelUsage>,
    /// Tage in Folge mit Verbrauch
    streak: u32,
    longest_streak: u32,
    active_days: u32,
    pub block: Option<Block>,
    /// Echte Limits aus Claude Code; fehlen, bis die Statuszeile sie gemeldet hat.
    pub limits: Option<limits::Limits>,
}

const BLOCK_HOURS: i64 = 5;

/// Fenster beginnt zur vollen Stunde der ersten Antwort und endet nach fünf Stunden
/// oder nach fünf Stunden Pause. So rechnen auch gängige Verbrauchs-Werkzeuge.
fn current_block(mut replies: Vec<&Reply>) -> Option<Block> {
    let window = Duration::hours(BLOCK_HOURS);
    replies.sort_by_key(|r| r.ts);
    let mut block: Option<(DateTime<Utc>, DateTime<Utc>, Tokens, f64)> = None;
    for reply in replies {
        let fresh = block.as_ref().is_none_or(|(start, last, ..)| reply.ts >= *start + window || reply.ts - *last >= window);
        if fresh {
            let start = reply.ts.duration_trunc(Duration::hours(1)).unwrap_or(reply.ts);
            block = Some((start, reply.ts, Tokens::default(), 0.0));
        }
        let (_, last, tokens, cost) = block.as_mut()?;
        *last = reply.ts;
        tokens.add(&reply.tokens);
        *cost += reply.cost;
    }
    let (start, _, tokens, cost) = block?;
    let reset = start + window;
    (Utc::now() < reset).then(|| Block { start: start.timestamp_millis(), reset: reset.timestamp_millis(), tokens, cost })
}

pub fn usage() -> Usage {
    use chrono::Datelike;
    let today = Local::now().date_naive();
    let start = today - Days::new(6);
    let month_start = today - Days::new(29);
    // 26 volle Wochen, erste Spalte beginnt am Montag.
    let heat_start = today - Days::new(25 * 7 + today.weekday().num_days_from_monday() as u64);
    let heat_len = (today - heat_start).num_days() as usize + 1;
    let mut heat: Vec<(Tokens, f64)> = vec![(Tokens::default(), 0.0); heat_len];
    let mut projects: HashMap<String, ProjectUsage> = HashMap::new();
    let mut models: HashMap<&str, (Tokens, f64)> = HashMap::new();
    let mut active: HashSet<NaiveDate> = HashSet::new();
    let mut recent: Vec<&Reply> = Vec::new();
    let recent_from = Utc::now() - Duration::hours(48);
    let files = scan();
    // Fortgesetzte Sessions kopieren alte Einträge; jede Antwort nur einmal zählen.
    let mut seen: HashSet<&str> = HashSet::new();

    for file in &files {
        let path = file.parsed.cwd.as_deref().unwrap_or("Unbekannt");
        for reply in &file.parsed.usage {
            if reply.day > today || !seen.insert(&reply.id) {
                continue;
            }
            active.insert(reply.day);
            if reply.ts >= recent_from {
                recent.push(reply);
            }
            if reply.day >= heat_start {
                let slot = &mut heat[(reply.day - heat_start).num_days() as usize];
                slot.0.add(&reply.tokens);
                slot.1 += reply.cost;
            }
            if reply.day < month_start {
                continue;
            }
            let model = models.entry(&reply.model).or_default();
            model.0.add(&reply.tokens);
            model.1 += reply.cost;
            let entry = projects.entry(path.to_string()).or_insert_with(|| ProjectUsage {
                name: project_name(path),
                path: path.to_string(),
                today: Tokens::default(),
                week: Tokens::default(),
                month: Tokens::default(),
                cost_month: 0.0,
            });
            entry.month.add(&reply.tokens);
            entry.cost_month += reply.cost;
            if reply.day >= start {
                entry.week.add(&reply.tokens);
            }
            if reply.day == today {
                entry.today.add(&reply.tokens);
            }
        }
    }

    let heatmap: Vec<Day> = heat
        .iter()
        .enumerate()
        .map(|(i, (tokens, cost))| Day { date: (heat_start + Days::new(i as u64)).to_string(), tokens: *tokens, cost: *cost })
        .collect();
    let days: Vec<Day> = heatmap[heat_len - 7..]
        .iter()
        .map(|d| Day { date: d.date.clone(), tokens: d.tokens, cost: d.cost })
        .collect();
    let mut week = Tokens::default();
    days.iter().for_each(|d| week.add(&d.tokens));
    let cost_since = |from: NaiveDate| -> f64 {
        heat.iter().skip((from - heat_start).num_days().max(0) as usize).map(|(_, cost)| cost).sum()
    };

    let mut projects: Vec<ProjectUsage> = projects.into_values().collect();
    projects.sort_by_key(|p| std::cmp::Reverse((p.week.total(), p.month.total())));
    let mut models: Vec<ModelUsage> = models
        .into_iter()
        .map(|(model, (tokens, cost))| ModelUsage { priced: rates(model).is_some(), model: model.to_string(), tokens, cost })
        .collect();
    models.sort_by(|a, b| b.cost.total_cmp(&a.cost).then(b.tokens.total().cmp(&a.tokens.total())));

    // Serie läuft weiter, solange heute noch nichts verbraucht wurde.
    let mut day = if active.contains(&today) { today } else { today - Days::new(1) };
    let mut streak = 0;
    while active.contains(&day) {
        streak += 1;
        day = day - Days::new(1);
    }
    let mut sorted: Vec<NaiveDate> = active.iter().copied().collect();
    sorted.sort();
    let (mut longest_streak, mut run) = (0, 0);
    for (i, day) in sorted.iter().enumerate() {
        run = if i > 0 && *day - sorted[i - 1] == Duration::days(1) { run + 1 } else { 1 };
        longest_streak = longest_streak.max(run);
    }

    Usage {
        today: days[6].tokens,
        week,
        cost_today: days[6].cost,
        cost_week: cost_since(start),
        cost_month: cost_since(month_start),
        days,
        projects,
        heatmap,
        models,
        streak,
        longest_streak,
        active_days: active.len() as u32,
        block: current_block(recent),
        limits: limits::read(),
    }
}

impl Usage {
    /// Das Wichtigste für das Desktop-Widget, Tokens schon summiert.
    pub fn summary(&self) -> Value {
        serde_json::json!({
            "today": self.today.total(),
            "week": self.week.total(),
            "cost_today": self.cost_today,
            "cost_week": self.cost_week,
            "cost_month": self.cost_month,
            "days": self.days.iter().map(|d| serde_json::json!({ "date": d.date, "tokens": d.tokens.total() })).collect::<Vec<_>>(),
            "streak": self.streak,
            "block": self.block.as_ref().map(|b| serde_json::json!({
                "start": b.start,
                "reset": b.reset,
                "tokens": b.tokens.total(),
                "cost": b.cost,
            })),
            "limits": self.limits,
        })
    }
}
