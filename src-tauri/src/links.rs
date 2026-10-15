//! Links: Titel und Favicon holen, lokal speichern, in eigenem Fenster öffnen.

use std::sync::LazyLock;
use std::time::Duration;

use base64::Engine;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use url::Url;

use crate::{store, R};

pub const FILE: &str = "links.json";

const MAX_HTML: usize = 512 * 1024;
const MAX_ICON: usize = 256 * 1024;
const USER_AGENT: &str =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

static TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap());
static LINK_TAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<link\b[^>]*>").unwrap());
static ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)\b(rel|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#).unwrap()
});

#[derive(Serialize, Deserialize, Clone)]
pub struct Link {
    pub id: String,
    url: String,
    title: String,
    /// Favicon als data:-URL
    icon: Option<String>,
    added: i64,
}

fn parse_url(input: &str) -> R<Url> {
    let input = input.trim();
    let with_scheme = if input.contains("://") { input.to_string() } else { format!("https://{input}") };
    let url = Url::parse(&with_scheme).map_err(|_| "Ungültige URL".to_string())?;
    match url.scheme() {
        "http" | "https" if url.host_str().is_some() => Ok(url),
        _ => Err("Nur http- und https-Links".into()),
    }
}

async fn fetch(client: &reqwest::Client, url: &Url, limit: usize) -> Option<(Vec<u8>, String)> {
    let mut response = client.get(url.clone()).send().await.ok()?.error_for_status().ok()?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() >= limit {
            body.truncate(limit);
            break;
        }
    }
    Some((body, content_type))
}

fn decode_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

fn icon_href(html: &str) -> Option<String> {
    LINK_TAG.find_iter(html).find_map(|tag| {
        let (mut rel, mut href) = (String::new(), None);
        for cap in ATTR.captures_iter(tag.as_str()) {
            let value = cap.get(2).or(cap.get(3)).or(cap.get(4)).map_or("", |m| m.as_str());
            if cap[1].eq_ignore_ascii_case("rel") {
                rel = value.to_ascii_lowercase();
            } else {
                href = Some(decode_entities(value));
            }
        }
        href.filter(|_| rel.split_whitespace().any(|r| r == "icon" || r == "apple-touch-icon"))
    })
}

pub async fn add(app: &AppHandle, input: &str) -> R<Link> {
    let url = parse_url(input)?;
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let html = fetch(&client, &url, MAX_HTML)
        .await
        .map(|(body, _)| String::from_utf8_lossy(&body).into_owned())
        .unwrap_or_default();
    let title = TITLE
        .captures(&html)
        .map(|c| decode_entities(&c[1]).split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| url.host_str().unwrap_or("Link").to_string());

    let mut candidates: Vec<Url> = Vec::new();
    candidates.extend(icon_href(&html).and_then(|href| url.join(&href).ok()));
    candidates.extend(url.join("/favicon.ico").ok());
    let mut icon = None;
    for candidate in candidates.iter().filter(|c| matches!(c.scheme(), "http" | "https")) {
        if let Some((bytes, content_type)) = fetch(&client, candidate, MAX_ICON + 1).await {
            let is_image = content_type.starts_with("image/") || candidate.path().ends_with(".ico");
            if is_image && !bytes.is_empty() && bytes.len() <= MAX_ICON {
                let mime = if content_type.starts_with("image/") { &content_type } else { "image/x-icon" };
                let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
                icon = Some(format!("data:{mime};base64,{data}"));
                break;
            }
        }
    }

    let link = Link {
        id: store::new_id(),
        url: url.to_string(),
        title: title.chars().take(160).collect(),
        icon,
        added: chrono::Utc::now().timestamp_millis(),
    };
    let saved = link.clone();
    store::update::<Link>(app, FILE, |items| items.insert(0, saved))?;
    Ok(link)
}

pub fn open(app: &AppHandle, id: &str) -> R<()> {
    let link = store::load::<Link>(app, FILE)
        .into_iter()
        .find(|l| l.id == id)
        .ok_or("Link nicht gefunden")?;
    let url = parse_url(&link.url)?;
    // Eigenes Fenster je Öffnen; Label "link-…" hat bewusst keine Befehlsrechte.
    WebviewWindowBuilder::new(app, format!("link-{}", store::new_id()), WebviewUrl::External(url))
        .title(&link.title)
        .inner_size(1180.0, 800.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
