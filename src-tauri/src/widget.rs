//! Daten für das Plasma-Widget auf dem Desktop: `claude-hub --widget-json` gibt eine
//! kompakte Übersicht aus und beendet sich, ohne ein Fenster zu öffnen.

use serde_json::json;

use crate::{live, logs};

pub fn print() {
    let mut summary = logs::usage().summary();
    let live: Vec<_> = live::raw()
        .into_iter()
        .map(|l| json!({ "project": l.project_name, "status": l.status, "working": live::working(&l.status) }))
        .collect();
    summary["live"] = json!(live);
    println!("{summary}");
}
