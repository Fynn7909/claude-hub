//! Echte Limits des Abos, wie `/usage` sie zeigt. Claude Code übergibt sie der Statuszeile;
//! scripts/statusline.sh (installiert als claude-hub-statusline) legt sie in ~/.cache/claude-hub/limits.json ab.

use serde::Serialize;
use serde_json::Value;

use crate::home;

#[derive(Serialize)]
pub struct Window {
    /// 0 bis 100
    pub percent: f64,
    pub reset: i64,
}

#[derive(Serialize)]
pub struct Limits {
    /// Zeitpunkt der Meldung
    at: i64,
    /// 5-Stunden-Fenster; fehlt, sobald es abgelaufen ist
    pub session: Option<Window>,
    pub week: Option<Window>,
}

/// Ein Fenster, dessen Ende schon vorbei ist, wurde zurückgesetzt: der Stand gilt nicht mehr.
fn window(limits: &Value, key: &str, now: i64) -> Option<Window> {
    let entry = limits.get(key)?;
    let reset = entry.get("resets_at")?.as_i64()? * 1000;
    let percent = entry.get("used_percentage")?.as_f64()?;
    (reset > now).then_some(Window { percent, reset })
}

pub fn read() -> Option<Limits> {
    let text = std::fs::read_to_string(home().join(".cache/claude-hub/limits.json")).ok()?;
    let file: Value = serde_json::from_str(&text).ok()?;
    let limits = file.get("rate_limits")?;
    let now = chrono::Utc::now().timestamp_millis();
    Some(Limits {
        at: file.get("at")?.as_i64()?,
        session: window(limits, "five_hour", now),
        week: window(limits, "seven_day", now),
    })
}
