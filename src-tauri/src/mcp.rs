//! MCP-Server aus der Config: ~/.claude.json (global und je Projekt) und .mcp.json der Projekte.
//! Der Status kommt aus der Config, es wird keine Verbindung aufgebaut.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::{claude_dir, home, logs};

#[derive(Serialize)]
pub struct Server {
    name: String,
    scope: String,
    transport: String,
    target: String,
    /// nur die Namen, nie die Werte
    env_keys: Vec<String>,
    /// ready | missing | configured | disabled | pending | auth
    status: &'static str,
}

fn read_json(path: &Path) -> Value {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(Value::Null)
}

fn in_path(command: &str) -> bool {
    if command.contains('/') {
        return Path::new(command).is_file();
    }
    std::env::var_os("PATH")
        .is_some_and(|paths| std::env::split_paths(&paths).any(|dir| dir.join(command).is_file()))
}

fn names(value: &Value) -> HashSet<String> {
    value
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

fn server(name: &str, scope: String, def: &Value) -> Server {
    let url = def["url"].as_str();
    let transport = def["type"]
        .as_str()
        .unwrap_or(if url.is_some() { "http" } else { "stdio" })
        .to_string();
    let (target, status) = match (url, def["command"].as_str()) {
        // Query-Teil weglassen, dort stehen manchmal Tokens.
        (Some(url), _) => (url.split('?').next().unwrap_or(url).to_string(), "configured"),
        (None, Some(command)) => {
            let args: Vec<&str> = def["args"]
                .as_array()
                .map(|a| a.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            let target = std::iter::once(command).chain(args).collect::<Vec<_>>().join(" ");
            (target, if in_path(command) { "ready" } else { "missing" })
        }
        (None, None) => (String::new(), "missing"),
    };
    Server {
        name: name.to_string(),
        scope,
        transport,
        target,
        env_keys: def["env"].as_object().map(|o| o.keys().cloned().collect()).unwrap_or_default(),
        status,
    }
}

pub fn list() -> Vec<Server> {
    let config = read_json(&home().join(".claude.json"));
    let needs_auth = read_json(&claude_dir().join("mcp-needs-auth-cache.json"));
    let needs_auth: HashSet<&str> =
        needs_auth.as_object().map(|o| o.keys().map(String::as_str).collect()).unwrap_or_default();
    let mut servers = Vec::new();

    let each = |value: &Value, f: &mut dyn FnMut(&str, &Value)| {
        if let Some(map) = value.as_object() {
            map.iter().for_each(|(name, def)| f(name, def));
        }
    };

    each(&config["mcpServers"], &mut |name, def| {
        servers.push(server(name, "Global".into(), def));
    });

    if let Some(projects) = config["projects"].as_object() {
        for (path, project) in projects {
            let label = logs::project_name(path);
            let disabled = names(&project["disabledMcpServers"]);
            each(&project["mcpServers"], &mut |name, def| {
                let mut s = server(name, format!("Lokal · {label}"), def);
                if disabled.contains(name) {
                    s.status = "disabled";
                }
                servers.push(s);
            });

            let file = read_json(&Path::new(path).join(".mcp.json"));
            let enabled = names(&project["enabledMcpjsonServers"]);
            let off = names(&project["disabledMcpjsonServers"]);
            each(&file["mcpServers"], &mut |name, def| {
                let mut s = server(name, format!("Projekt · {label}"), def);
                if off.contains(name) || disabled.contains(name) {
                    s.status = "disabled";
                } else if !enabled.contains(name)
                    && project["enableAllProjectMcpServers"].as_bool() != Some(true)
                {
                    s.status = "pending";
                }
                servers.push(s);
            });
        }
    }

    for s in servers.iter_mut().filter(|s| s.status != "disabled") {
        if needs_auth.contains(s.name.as_str()) {
            s.status = "auth";
        }
    }
    // Konnektoren und Plugin-Server, die nur im Auth-Cache auftauchen.
    let known: HashSet<String> = servers.iter().map(|s| s.name.clone()).collect();
    for name in needs_auth.into_iter().filter(|n| !known.contains(*n)) {
        let (scope, transport) = if name.starts_with("plugin:") {
            ("Plugin", "plugin")
        } else {
            ("claude.ai", "http")
        };
        servers.push(Server {
            name: name.to_string(),
            scope: scope.into(),
            transport: transport.into(),
            target: String::new(),
            env_keys: Vec::new(),
            status: "auth",
        });
    }
    servers
}
