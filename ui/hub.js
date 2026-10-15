// Oberfläche des App-Fensters.
import { ideas } from './ideas.js';
import { glossary } from './glossary.js';
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// Fenster hat keine Titelleiste: Minimieren, Maximieren, Schließen selbst auslösen.
document.getElementById('win').addEventListener('click', (event) => {
  const action = event.target.dataset.win;
  if (action) window.__TAURI__.window.getCurrentWindow()[action]();
});

// Beim Größenändern Lichtflecken und Übergänge aussetzen, sonst ruckelt es.
// Maximiert füllt das Fenster den Bildschirm, dann ohne runde Ecken.
let resizeTimer;
async function syncWindowShape() {
  const appWindow = window.__TAURI__.window.getCurrentWindow();
  const filled = await appWindow.isMaximized() || await appWindow.isFullscreen();
  document.body.classList.toggle('filled', filled);
}
window.addEventListener('resize', () => {
  document.body.classList.add('resizing');
  syncWindowShape();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => document.body.classList.remove('resizing'), 180);
});
syncWindowShape();

// Chat-Verlauf der Ansicht „Begriffe“; bleibt beim Wechseln der Ansicht erhalten.
const chat = [];
let chatBusy = false;
let chatView = { done() {}, remember() {} };

const view = document.getElementById('view');
const nav = document.getElementById('nav');

// ---------- Helfer ----------

/** DOM-Baustein; Text landet immer als Textknoten, nie als HTML. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const compact = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('de-DE');
const total = (t) => t.input + t.output + t.cache_write + t.cache_read;
const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const relative = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto', style: 'short' });

function ago(ms) {
  if (!ms) return 'noch nie';
  const minutes = Math.round((ms - Date.now()) / 60000);
  if (Math.abs(minutes) < 1) return 'gerade eben';
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

const shortPath = (path) => path.replace(/^\/home\/[^/]+/, '~');
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' });
const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const longDate = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const resetDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const monthName = new Intl.DateTimeFormat('de-DE', { month: 'short' });

/** Restzeit als "2 Std. 14 Min." oder "2 Tage 19 Std."; bei abgelaufener Zeit "abgelaufen". */
function remaining(ms) {
  const minutes = Math.ceil((ms - Date.now()) / 60000);
  if (minutes <= 0) return 'abgelaufen';
  if (minutes >= 2880) return `${Math.floor(minutes / 1440)} Tage ${Math.floor((minutes % 1440) / 60)} Std.`;
  return minutes >= 60 ? `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.` : `${minutes} Min.`;
}

/** Text mit hervorgehobenen Fundstellen von `query` (ohne Groß-/Kleinschreibung). */
function marked(text, query) {
  const needle = query?.trim().toLowerCase();
  if (!needle) return [text];
  const parts = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    parts.push(text.slice(from, at), h('mark', {}, text.slice(at, at + needle.length)));
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

let toastTimer;
function toast(message, error = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), error ? 4200 : 1800);
}

/** Führt einen Backend-Befehl aus und zeigt Fehler als Toast. */
async function run(command, args, done) {
  try {
    const result = await invoke(command, args);
    if (done) toast(done);
    return result;
  } catch (error) {
    toast(String(error), true);
    throw error;
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast('Kopiert');
}

const empty = (text) => h('div', { class: 'empty' }, text);
const title = (text, sub, ...extra) =>
  h('div', { class: 'head-row' }, h('div', {}, h('h1', {}, text), sub && h('p', { class: 'sub' }, sub)), ...extra);

// ---------- Bausteine ----------

function statCard(label, tokens, cost) {
  return h('div', { class: 'card stat' },
    h('h2', {}, label),
    h('div', { class: 'num', 'data-count': total(tokens), title: `${full.format(total(tokens))} Tokens` }, compact.format(total(tokens))),
    h('div', { class: 'parts' },
      h('span', {}, 'Eingabe ', h('b', {}, compact.format(tokens.input))),
      h('span', {}, 'Ausgabe ', h('b', {}, compact.format(tokens.output))),
      h('span', {}, 'Cache ', h('b', {}, compact.format(tokens.cache_write + tokens.cache_read))),
      cost != null && h('span', { title: 'Listenpreis der Claude API. Im Abo fällt er nicht an.' }, 'API-Gegenwert ', h('b', {}, money.format(cost)))));
}

/** Laufendes 5-Stunden-Fenster mit Countdown bis zum Zurücksetzen. */
function blockCard(block) {
  if (!block) {
    return h('div', { class: 'card stat' },
      h('h2', {}, '5-Stunden-Fenster'),
      h('div', { class: 'num idle' }, 'Frei'),
      h('div', { class: 'parts' }, h('span', {}, 'Beginnt mit der nächsten Nachricht.')));
  }
  const span = block.reset - block.start;
  const bar = h('i', { 'data-span': `${block.start},${block.reset}`, style: `width:${Math.min(100, ((Date.now() - block.start) / span) * 100)}%` });
  return h('div', { class: 'card stat', title: 'Aus den lokalen Logs geschätzt: Fenster beginnt zur vollen Stunde der ersten Nachricht.' },
    h('h2', {}, '5-Stunden-Fenster · geschätzt'),
    h('div', { class: 'num', 'data-reset': block.reset }, remaining(block.reset)),
    h('div', { class: 'meter' }, bar),
    h('div', { class: 'parts' },
      h('span', {}, 'Zurückgesetzt um ', h('b', {}, clock.format(block.reset))),
      h('span', {}, 'Tokens ', h('b', {}, compact.format(total(block.tokens))))));
}

/** Echtes Limit aus Claude Code: Anteil verbraucht und Zeit bis zum Zurücksetzen. */
function limitCard(label, limit, at, idle) {
  if (!limit) {
    return h('div', { class: 'card stat' },
      h('h2', {}, label),
      h('div', { class: 'num idle' }, 'Frei'),
      h('div', { class: 'parts' }, h('span', {}, idle)));
  }
  const sameDay = new Date(limit.reset).toDateString() === new Date().toDateString();
  return h('div', { class: 'card stat', title: `Von Claude Code gemeldet, ${ago(at)}. Zählt alle Geräte und claude.ai mit.` },
    h('h2', {}, label),
    h('div', { class: 'num' }, `${Math.round(limit.percent)} %`),
    h('div', { class: 'meter' }, h('i', { style: `width:${Math.min(100, limit.percent)}%` })),
    h('div', { class: 'parts' },
      h('span', {}, 'Zurückgesetzt ', h('b', {}, (sameDay ? 'um ' : `${resetDay.format(limit.reset)}, `) + clock.format(limit.reset))),
      h('span', {}, 'in ', h('b', { 'data-reset': limit.reset }, remaining(limit.reset)))));
}

/** 5-Stunden-Fenster: echt, sobald Claude Code es gemeldet hat, sonst aus den Logs geschätzt. */
const sessionCard = (usage) => usage.limits
  ? limitCard('5-Stunden-Fenster', usage.limits.session, usage.limits.at, 'Beginnt mit der nächsten Nachricht.')
  : blockCard(usage.block);

/** Kalender der letzten 26 Wochen: je dunkler, desto weniger Tokens. */
function heatmap(usage) {
  const days = usage.heatmap;
  const max = Math.max(1, ...days.map((d) => total(d.tokens)));
  // Wurzel, damit einzelne Rekordtage den Rest nicht verblassen lassen.
  const level = (tokens) => (tokens === 0 ? 0 : Math.min(4, 1 + Math.floor(Math.sqrt(tokens / max) * 4)));
  const months = [];
  for (let week = 0; week * 7 < days.length; week++) {
    const first = new Date(`${days[week * 7].date}T12:00:00`);
    const label = monthName.format(first);
    if (months.at(-1)?.label !== label) months.push({ label, week });
  }
  const fact = (value, label) => h('div', {}, h('b', {}, value), h('span', {}, label));
  return h('div', { class: 'card' },
    h('h2', {}, 'Aktivität · 26 Wochen'),
    h('div', { class: 'heat-wrap' },
      h('div', { class: 'heat-box' },
        h('div', { class: 'heat-months' }, months.filter((m, i) => i === months.length - 1 || months[i + 1].week - m.week > 1)
          .map((m) => h('span', { style: `grid-column:${m.week + 1}` }, m.label))),
        h('div', { class: 'heat' }, days.map((day) => {
          const tokens = total(day.tokens);
          return h('i', {
            class: `l${level(tokens)}`,
            title: `${longDate.format(new Date(`${day.date}T12:00:00`))}: ${tokens ? `${full.format(tokens)} Tokens · ${money.format(day.cost)}` : 'nichts'}`,
          });
        }))),
      h('div', { class: 'facts' },
        fact(`${usage.streak} ${usage.streak === 1 ? 'Tag' : 'Tage'}`, 'Serie'),
        fact(`${usage.longest_streak} ${usage.longest_streak === 1 ? 'Tag' : 'Tage'}`, 'Längste Serie'),
        fact(full.format(usage.active_days), 'Aktive Tage'),
        fact(money.format(usage.cost_month), 'API-Gegenwert 30 Tage'))));
}

const modelName = (id) => id.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-(\d+)$/, ' $1').replace(/^./, (c) => c.toUpperCase());

function modelUsage(models) {
  const max = Math.max(1e-9, ...models.map((m) => m.cost));
  return h('div', { class: 'card' },
    h('h2', {}, 'Pro Modell · 30 Tage'),
    models.length === 0 ? h('div', { class: 'sub' }, 'Noch kein Verbrauch.') :
    h('div', { class: 'list', style: 'gap:10px' }, models.map((m) =>
      h('div', { class: 'usage-row', title: m.model },
        h('span', { class: 'title' }, modelName(m.model)),
        h('span', { class: 'n sub' }, `${compact.format(total(m.tokens))} Tokens`),
        h('span', { class: 'n' }, m.priced ? money.format(m.cost) : 'Preis unbekannt'),
        h('div', { class: 'meter' }, h('i', { style: `width:${(m.cost / max) * 100}%` }))))));
}

function barChart(days) {
  const max = Math.max(1, ...days.map((d) => total(d.tokens)));
  return h('div', { class: 'card' },
    h('h2', {}, 'Letzte 7 Tage'),
    h('div', { class: 'bars' }, days.map((day, i) =>
      h('div', { class: `col${i === days.length - 1 ? ' today' : ''}`, title: `${day.date}: ${full.format(total(day.tokens))} Tokens` },
        h('div', { class: 'bar', style: `height:${(total(day.tokens) / max) * 100}%;--i:${i}` }),
        h('div', { class: 'lbl' }, weekday.format(new Date(`${day.date}T12:00:00`)))))));
}

function projectUsage(projects, limit) {
  const rows = projects.filter((p) => total(p.month) > 0).sort((a, b) => b.cost_month - a.cost_month).slice(0, limit);
  const max = Math.max(1e-9, ...rows.map((p) => p.cost_month));
  return h('div', { class: 'card' },
    h('h2', {}, 'Pro Projekt · 30 Tage'),
    rows.length === 0 ? h('div', { class: 'sub' }, 'Noch kein Verbrauch.') :
    h('div', { class: 'list', style: 'gap:10px' }, rows.map((p) =>
      h('div', { class: 'usage-row', title: p.path },
        h('span', { class: 'title' }, p.name),
        h('span', { class: 'n sub' }, `${compact.format(total(p.month))} Tokens`),
        h('span', { class: 'n' }, money.format(p.cost_month)),
        h('div', { class: 'meter' }, h('i', { style: `width:${(p.cost_month / max) * 100}%` }))))));
}

function projectRow(p) {
  const badges = [p.has_claude_md && 'CLAUDE.md', p.has_claude_dir && '.claude'].filter(Boolean);
  const start = (resume) => run('launch_claude', { path: p.path, resume }, resume ? 'Fortsetzen …' : 'Claude startet …');
  return h('div', { class: 'row stack' },
    h('div', { class: 'main' },
      h('div', { class: 'title' }, p.name),
      h('div', { class: 'meta', title: p.path },
        `${shortPath(p.path)} · ${p.sessions} Sessions · ${ago(p.last_active)}`)),
    badges.map((b) => h('span', { class: 'badge' }, b)),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small primary', onclick: () => start(false) }, 'Claude starten'),
      h('button', { class: 'btn small', disabled: p.sessions === 0, onclick: () => start(true) }, 'Fortsetzen')));
}

const resume = (s) => run('launch_claude', { path: s.project_path, resume: true, sessionId: s.id }, 'Fortsetzen …');

function sessionRow(s) {
  return h('div', { class: 'row' },
    h('div', { class: 'main' },
      h('div', { class: 'title', title: s.title }, s.title),
      h('div', { class: 'meta', title: s.project_path }, `${s.project_name} · ${ago(s.last_active)} · ${s.messages} Nachrichten`)),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small ghost', onclick: () => show('session', { id: s.id }) }, 'Verlauf'),
      h('button', { class: 'btn small', onclick: () => resume(s) }, 'Fortsetzen')));
}

/** Treffer der Volltextsuche: Session mit bis zu drei Fundstellen. */
function hitRow(hit, query) {
  const open = () => show('session', { id: hit.id, query });
  return h('div', { class: 'row hit' },
    h('button', { class: 'main link-btn', onclick: open },
      h('div', { class: 'title', title: hit.title }, marked(hit.title, query)),
      h('div', { class: 'meta', title: hit.project_path },
        `${hit.project_name} · ${ago(hit.last_active)}${hit.hits ? ` · ${hit.hits} Treffer` : ''}`),
      hit.snippets.map((snippet) => h('div', { class: 'snippet' },
        h('span', { class: 'who' }, snippet.role === 'user' ? 'Du' : 'Claude'),
        snippet.before, h('mark', {}, snippet.hit), snippet.after))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small ghost', onclick: open }, 'Verlauf'),
      h('button', { class: 'btn small', onclick: () => resume(hit) }, 'Fortsetzen')));
}

const statusLabel = { busy: 'arbeitet', shell: 'führt Befehl aus', idle: 'wartet auf Eingabe', waiting: 'braucht Antwort' };

function liveRow(l) {
  return h('div', { class: 'row' },
    h('span', { class: `dot live-${l.status}` }),
    h('div', { class: 'main' },
      h('div', { class: 'title', title: l.title }, l.title),
      h('div', { class: 'meta', title: l.project_path },
        `${l.project_name} · ${statusLabel[l.status] ?? l.status} seit ${clock.format(l.status_since)} · gestartet ${ago(l.started_at)}`)),
    h('span', { class: `badge live-${l.status}` }, statusLabel[l.status] ?? l.status),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', disabled: !l.has_log, onclick: () => show('session', { id: l.session_id }) }, 'Verlauf')));
}

// ---------- Ansichten ----------

const views = {
  async overview() {
    const [usage, sessions, projects, running] = await Promise.all([
      invoke('get_usage'), invoke('list_sessions', { limit: 6 }), invoke('list_projects'), invoke('list_live'),
    ]);
    return [
      title('Übersicht', 'Was heute in Claude Code passiert ist.'),
      running.length > 0 && h('div', {}, h('h2', {}, 'Läuft gerade'), h('div', { class: 'list' }, running.map(liveRow))),
      h('div', { class: 'grid' }, statCard('Tokens heute', usage.today), sessionCard(usage), barChart(usage.days)),
      h('div', { class: 'cols' },
        h('div', {}, h('h2', {}, 'Letzte Sessions'), h('div', { class: 'list' }, sessions.length ? sessions.map(sessionRow) : empty('Noch keine Sessions.'))),
        h('div', {}, h('h2', {}, 'Aktive Projekte'), h('div', { class: 'list' }, projects.slice(0, 5).map(projectRow)))),
    ];
  },

  async projects(options = {}) {
    const projects = await invoke('list_projects', { refresh: !!options.refresh });
    return [
      title('Projekte', `${projects.length} Ordner mit CLAUDE.md, .claude oder Sessions.`,
        h('button', { class: 'btn', onclick: () => show('projects', { refresh: true }) }, 'Neu suchen')),
      projects.length ? h('div', { class: 'list' }, projects.map(projectRow)) : empty('Keine Projekte gefunden.'),
    ];
  },

  async live() {
    const [running, settings] = await Promise.all([invoke('list_live'), invoke('get_settings')]);
    const toggle = h('label', { class: 'switch-row', title: 'Meldung, wenn Claude fertig ist oder eine Antwort braucht' },
      'Benachrichtigen',
      h('span', { class: 'switch' },
        h('input', {
          type: 'checkbox', checked: settings.notify, 'aria-label': 'Benachrichtigen',
          onchange: async (event) => {
            const enabled = event.target.checked;
            try { await run('set_notify', { enabled }, enabled ? 'Benachrichtigungen an' : 'Benachrichtigungen aus'); }
            catch { event.target.checked = !enabled; }
          },
        }), h('span', {})));
    return [
      title('Live', 'Claude-Code-Sessions, die gerade offen sind.', toggle),
      running.length ? h('div', { class: 'list' }, running.map(liveRow)) : empty('Gerade läuft keine Session.'),
      settings.tray && h('p', { class: 'sub note' }, 'Claude Hub bleibt über das Symbol in der Kontrollleiste aktiv, auch wenn das Fenster zu ist.'),
    ];
  },

  async sessions(options = {}) {
    const sessions = await invoke('list_sessions', { limit: 80 });
    const list = h('div', { class: 'list' });
    const recent = () => list.replaceChildren(...(sessions.length ? sessions.map(sessionRow) : [empty('Noch keine Sessions.')]));
    let latest = 0;
    let timer;
    const search = async (query) => {
      sessionQuery = query;
      const mine = ++latest;
      if (query.trim().length < 2) return recent();
      try {
        const hits = await invoke('search_sessions', { query });
        if (mine !== latest) return;
        list.replaceChildren(...(hits.length ? hits.map((hit) => hitRow(hit, query)) : [empty(`Nichts gefunden für „${query.trim()}“.`)]));
      } catch (error) {
        if (mine === latest) list.replaceChildren(empty(`Fehler: ${error}`));
      }
    };
    const input = h('input', {
      type: 'search', placeholder: 'Alle Sessions durchsuchen …', value: options.query ?? sessionQuery, 'aria-label': 'Sessions durchsuchen',
      oninput: (event) => {
        clearTimeout(timer);
        timer = setTimeout(() => search(event.target.value), 180);
      },
    });
    if (input.value.trim().length >= 2) await search(input.value);
    else recent();
    setTimeout(() => input.isConnected && input.focus({ preventScroll: true }));
    return [
      title('Sessions', 'Volltextsuche über alle lokalen Claude-Code-Logs.'),
      input,
      list,
    ];
  },

  /** Verlauf einer Session zum Nachlesen. */
  async session(options = {}) {
    const t = await invoke('read_session', { id: options.id });
    const query = options.query ?? '';
    const chat = h('div', { class: 'chat' });
    let steps;
    let first = true;
    for (const item of t.items) {
      if (item.role === 'tool') {
        if (!steps) chat.append(h('details', { class: 'steps' }, h('summary', {}), steps = h('div', {})));
        steps.append(h('div', {}, item.text));
        steps.previousSibling.textContent = `${steps.children.length} ${steps.children.length === 1 ? 'Schritt' : 'Schritte'}`;
        continue;
      }
      steps = null;
      const parts = marked(item.text, query);
      const bubble = h('div', { class: `msg ${item.role}` }, parts);
      if (first && parts.length > 1) {
        bubble.querySelector('mark').dataset.scrollHere = '';
        first = false;
      }
      chat.append(bubble);
    }
    if (first) chat.append(h('span', { 'data-scroll-here': '', 'data-scroll-end': '' }));
    return [
      title(t.title, `${t.project_name} · ${ago(t.last_active)} · ${t.items.length} Einträge${t.skipped ? ` · ${t.skipped} ältere ausgeblendet` : ''}`,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: () => show('sessions') }, 'Zurück'),
          h('button', { class: 'btn primary', onclick: () => resume({ id: t.id, project_path: t.project_path }) }, 'Fortsetzen'))),
      t.items.length ? chat : empty('Kein lesbarer Verlauf.'),
    ];
  },

  async usage() {
    const usage = await invoke('get_usage');
    return [
      title('Verbrauch', 'Tokens aus den lokalen Logs. Dollar-Werte sind API-Listenpreise, kein Abo-Preis.'),
      h('div', { class: 'grid' },
        statCard('Heute', usage.today, usage.cost_today), statCard('Letzte 7 Tage', usage.week, usage.cost_week), !usage.limits && sessionCard(usage)),
      usage.limits && h('div', { class: 'grid' },
        sessionCard(usage), limitCard('Wochenlimit', usage.limits.week, usage.limits.at, 'Noch nichts verbraucht.')),
      heatmap(usage),
      barChart(usage.days),
      h('div', { class: 'cols' }, modelUsage(usage.models), projectUsage(usage.projects, 50)),
    ];
  },

  async skills(options = {}) {
    const skills = await invoke('list_skills');
    const list = h('div', { class: 'list' });
    const draw = (query = '') => {
      const q = query.toLowerCase();
      const shown = skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q));
      list.replaceChildren(...(shown.length ? shown.map((skill) => {
        const row = h('div', { class: `row${skill.enabled ? '' : ' off'}`, title: skill.path },
          h('div', { class: 'main' }, h('div', { class: 'title' }, skill.name), h('div', { class: 'desc' }, skill.description)),
          h('label', { class: 'switch', title: skill.enabled ? 'Ausschalten' : 'Einschalten' },
            h('input', {
              type: 'checkbox', checked: skill.enabled, 'aria-label': `${skill.name} aktiv`,
              onchange: async (event) => {
                const enabled = event.target.checked;
                try {
                  await run('set_skill_enabled', { path: skill.path, enabled }, enabled ? 'Skill an' : 'Skill aus');
                  skill.enabled = enabled;
                  row.classList.toggle('off', !enabled);
                } catch { event.target.checked = !enabled; }
              },
            }), h('span', {})));
        return row;
      }) : [empty('Kein Skill passt.')]));
    };
    draw(options.query);
    const active = skills.filter((s) => s.enabled).length;
    return [
      title('Skills', `${active} von ${skills.length} aktiv · ~/.claude/skills`),
      h('input', { type: 'search', placeholder: 'Skills durchsuchen …', value: options.query ?? '', oninput: (e) => draw(e.target.value) }),
      list,
    ];
  },

  async mcp() {
    const servers = await invoke('list_mcp');
    const labels = { ready: 'Bereit', missing: 'Befehl fehlt', configured: 'Konfiguriert', disabled: 'Deaktiviert', pending: 'Wartet auf Freigabe', auth: 'Anmeldung nötig' };
    return [
      title('MCP-Server', 'Status aus der Config, ohne Verbindungstest.'),
      servers.length ? h('div', { class: 'list' }, servers.map((s) =>
        h('div', { class: 'row' },
          h('span', { class: `dot ${s.status}` }),
          h('div', { class: 'main' },
            h('div', { class: 'title' }, s.name),
            h('div', { class: 'meta path', title: s.target }, s.target || s.scope),
            s.env_keys.length > 0 && h('div', { class: 'meta' }, `Umgebung: ${s.env_keys.join(', ')}`)),
          h('span', { class: 'badge' }, s.scope),
          h('span', { class: 'badge' }, s.transport),
          h('span', { class: 'badge' }, labels[s.status])))) : empty('Keine MCP-Server konfiguriert.'),
    ];
  },

  async links() {
    const links = await invoke('list_links');
    const input = h('input', { type: 'url', placeholder: 'https://… einfügen', 'aria-label': 'Link-Adresse' });
    const button = h('button', { class: 'btn primary', type: 'submit' }, 'Hinzufügen');
    const form = h('form', {
      class: 'form-row',
      onsubmit: async (event) => {
        event.preventDefault();
        if (!input.value.trim()) return;
        button.disabled = true;
        button.textContent = 'Lädt …';
        try {
          await run('add_link', { url: input.value }, 'Link gespeichert');
          show('links');
        } catch {
          button.disabled = false;
          button.textContent = 'Hinzufügen';
        }
      },
    }, input, button);
    return [
      title('Links', 'Titel und Favicon werden automatisch geholt. Klick öffnet ein eigenes Fenster.'),
      form,
      links.length ? h('div', { class: 'grid' }, links.map((link) =>
        h('div', { class: 'row' },
          link.icon ? h('img', { class: 'fav', src: link.icon, alt: '' }) : h('div', { class: 'fav letter' }, (link.title[0] || '?').toUpperCase()),
          h('div', { class: 'main' }, h('div', { class: 'title', title: link.title }, link.title), h('div', { class: 'meta', title: link.url }, new URL(link.url).host)),
          h('div', { class: 'actions' },
            h('button', { class: 'btn small', onclick: () => run('open_link', { id: link.id }) }, 'Öffnen'),
            h('button', { class: 'btn small ghost danger', title: 'Link löschen', 'aria-label': `${link.title} löschen`, onclick: async () => { await run('remove_link', { id: link.id }); show('links'); } }, '✕'))))) : empty('Noch keine Links.'),
    ];
  },

  async prompts(options = {}) {
    const prompts = await invoke('list_prompts');
    const editing = prompts.find((p) => p.id === options.edit);
    const name = h('input', { type: 'text', placeholder: 'Titel (optional)', value: editing?.title ?? '' });
    const body = h('textarea', { placeholder: 'Prompt-Text …', value: editing?.body ?? '', rows: 4 });
    const form = h('form', {
      class: 'form card',
      onsubmit: async (event) => {
        event.preventDefault();
        await run('save_prompt', { id: editing?.id ?? null, title: name.value, body: body.value }, 'Gespeichert');
        show('prompts');
      },
    }, name, body,
      h('div', { class: 'form-row' },
        h('button', { class: 'btn primary', type: 'submit' }, editing ? 'Änderung speichern' : 'Prompt speichern'),
        editing && h('button', { class: 'btn ghost', type: 'button', onclick: () => show('prompts') }, 'Abbrechen')));
    return [
      title('Prompts', 'Klick auf einen Schnipsel kopiert ihn.'),
      form,
      prompts.length ? h('div', { class: 'list' }, prompts.map((p) =>
        h('div', { class: 'row' },
          h('button', { class: 'main link-btn', style: 'text-align:left;font-size:inherit;color:inherit', title: 'Kopieren', onclick: () => copy(p.body) },
            h('div', { class: 'title' }, p.title), h('div', { class: 'desc' }, p.body)),
          h('div', { class: 'actions' },
            h('button', { class: 'btn small ghost', onclick: () => show('prompts', { edit: p.id }) }, 'Bearbeiten'),
            h('button', { class: 'btn small ghost danger', title: 'Prompt löschen', 'aria-label': `${p.title} löschen`, onclick: async () => { await run('remove_prompt', { id: p.id }); show('prompts'); } }, '✕'))))) : empty('Noch keine Prompts.'),
    ];
  },

  async glossary() {
    const asked = await invoke('list_asked').catch(() => []);
    const known = new Set(glossary.flatMap(([, terms]) => terms.map(([term]) => term.toLowerCase())));
    const groups = [...(asked.length ? [['Von dir gefragt', asked.map((a) => [a.term, a.meaning]), true]] : []), ...glossary];
    const count = groups.reduce((n, [, terms]) => n + terms.length, 0);

    // ----- Chat -----
    const log = h('div', { class: 'chat-log' });
    const field = h('textarea', { class: 'chat-input', rows: 1, placeholder: 'Frag etwas, z. B. „Was ist ein Pull Request?“', spellcheck: true });
    const send = h('button', { class: 'btn primary', type: 'submit' }, 'Senden');
    const bubble = (role, text, term) => h('div', { class: `msg ${role}` },
      term && h('div', { class: 'msg-term' }, term), h('div', { class: 'msg-text' }, text));
    const drawChat = () => {
      log.replaceChildren(...(chat.length ? chat.map((m) => bubble(m.role, m.text, m.term)) : [h('div', { class: 'chat-empty' },
        h('p', {}, 'Frag nach jedem Begriff. Claude erklärt ihn sofort, Rückfragen gehen auch.'),
        h('div', { class: 'chips' }, ['Was ist ein Pull Request?', 'Was macht Docker?', 'RAM und SSD, was ist der Unterschied?', 'Was heißt Server-Autorität bei Roblox?'].map((q) =>
          h('button', { class: 'chip', type: 'button', onclick: () => ask(q) }, q))))]));
      log.scrollTop = log.scrollHeight;
    };
    const ask = async (question) => {
      question = question.trim();
      if (!question || chatBusy) return;
      chatBusy = true;
      send.disabled = true;
      field.value = '';
      chat.push({ role: 'user', text: question });
      drawChat();
      const thinking = bubble('assistant thinking', 'Claude überlegt …');
      log.append(thinking);
      log.scrollTop = log.scrollHeight;
      try {
        const reply = await invoke('glossary_chat', { messages: chat.map(({ role, text }) => ({ role, text })) });
        chat.push({ role: 'assistant', text: reply.text, term: reply.term });
        if (reply.term && !known.has(reply.term.toLowerCase())) {
          await invoke('save_asked', { term: reply.term, meaning: reply.text }).catch(() => {});
          chatView.remember(reply.term, reply.text);
        }
      } catch (error) {
        chat.push({ role: 'assistant error', text: `Fehler: ${error}` });
      } finally {
        chatBusy = false;
        send.disabled = false;
        if (current === 'glossary') chatView.done();
      }
    };
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(field.value); }
    });
    field.addEventListener('input', () => { field.style.height = 'auto'; field.style.height = `${Math.min(field.scrollHeight, 120)}px`; });
    const chatBox = h('div', { class: 'card chat' }, log,
      h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); ask(field.value); } }, field, send));
    drawChat();

    // ----- Liste -----
    const body = h('div', { class: 'stack' });
    const draw = (query = '') => {
      const q = query.trim().toLowerCase();
      const shown = groups
        .map(([group, terms, mine]) => [group, q ? terms.filter(([term, meaning]) => `${term} ${meaning}`.toLowerCase().includes(q)) : terms, mine])
        .filter(([, terms]) => terms.length);
      body.replaceChildren(...(shown.length ? shown.map(([group, terms, mine]) =>
        h('div', {}, h('h2', {}, `${group} · ${terms.length}`), h('div', { class: 'list' }, terms.map(([term, meaning]) =>
          h('div', { class: 'row' },
            h('button', { class: 'main link-btn term-btn', title: 'Im Chat genauer erklären lassen', onclick: () => { ask(`Erklär mir „${term}“ genauer.`); chatBox.scrollIntoView({ block: 'nearest' }); } },
              h('div', { class: 'title' }, term), h('div', { class: 'desc' }, meaning)),
            mine && h('div', { class: 'actions' }, h('button', { class: 'btn small ghost danger', title: 'Aus „Von dir gefragt“ entfernen', 'aria-label': `${term} entfernen`, onclick: async () => { await run('remove_asked', { term }); show('glossary'); } }, '✕')))))))
        : [h('div', { class: 'empty-ask' }, empty('Nicht in der Liste.'), h('button', { class: 'btn primary', onclick: () => ask(`Was ist ${query.trim()}?`) }, `„${query.trim()}“ Claude fragen`))]));
    };
    draw();
    // Eine Antwort kann eintreffen, nachdem die Ansicht neu aufgebaut wurde: immer die aktuelle bedienen.
    chatView = {
      done: () => { drawChat(); field.focus(); },
      remember: (term, meaning) => {
        let mine = groups.find(([, , own]) => own);
        if (!mine) groups.unshift(mine = ['Von dir gefragt', [], true]);
        mine[1] = [[term, meaning], ...mine[1].filter(([t]) => t.toLowerCase() !== term.toLowerCase())];
        draw(search.value);
      },
    };
    const search = h('input', { type: 'search', class: 'glossary-search', placeholder: `${full.format(count)} Begriffe durchsuchen …`, oninput: (e) => draw(e.target.value) });
    const newChat = h('button', { class: 'btn ghost', onclick: () => { if (!chatBusy) { chat.length = 0; drawChat(); } } }, 'Neuer Chat');
    return [
      title('Begriffe', `Frag Claude oder stöbere in ${full.format(count)} Begriffen. Klick auf einen Begriff erklärt ihn genauer.`, newChat),
      chatBox,
      search,
      body,
    ];
  },

  async claudemd() {
    const file = await invoke('read_global_md');
    const area = h('textarea', { class: 'editor', value: file.content, spellcheck: false, placeholder: 'Globale Anweisungen für Claude Code …' });
    const save = h('button', { class: 'btn primary', disabled: true }, 'Speichern');
    area.addEventListener('input', () => (save.disabled = false));
    save.addEventListener('click', async () => {
      await run('write_global_md', { content: area.value }, 'CLAUDE.md gespeichert');
      save.disabled = true;
    });
    return [
      title('Globale CLAUDE.md', file.exists ? shortPath(file.path) : `${shortPath(file.path)} · existiert noch nicht, Speichern legt sie an`, save),
      area,
    ];
  },
};

const icon = (paths) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const tabs = [
  ['overview', 'Übersicht', '<rect x="2" y="2" width="5" height="5" rx="1.5"/><rect x="9" y="2" width="5" height="5" rx="1.5"/><rect x="2" y="9" width="5" height="5" rx="1.5"/><rect x="9" y="9" width="5" height="5" rx="1.5"/>'],
  ['live', 'Live', '<circle cx="8" cy="8" r="2"/><path d="M4.5 4.5a5 5 0 0 0 0 7M11.5 4.5a5 5 0 0 1 0 7"/>'],
  ['projects', 'Projekte', '<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"/>'],
  ['sessions', 'Sessions', '<path d="M3.5 3h9A1.5 1.5 0 0 1 14 4.5v5a1.5 1.5 0 0 1-1.5 1.5H8l-3 2.5V11H3.5A1.5 1.5 0 0 1 2 9.5v-5A1.5 1.5 0 0 1 3.5 3z"/>'],
  ['usage', 'Verbrauch', '<path d="M3 13V9M8 13V3M13 13V6"/>'],
  ['skills', 'Skills', '<path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6z"/>'],
  ['mcp', 'MCP-Server', '<circle cx="4" cy="8" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><path d="M5.8 7.1l4.4-2.2M5.8 8.9l4.4 2.2"/>'],
  ['links', 'Links', '<path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1"/>'],
  ['prompts', 'Prompts', '<path d="M3 4h10M3 8h10M3 12h6"/>'],
  ['glossary', 'Begriffe', '<path d="M3 3.5A1.5 1.5 0 0 1 4.5 2H13v10H4.5A1.5 1.5 0 0 0 3 13.5z"/><path d="M3 13.5A1.5 1.5 0 0 0 4.5 15H13v-3"/><path d="M6 5.5h4"/>'],
  ['claudemd', 'CLAUDE.md', '<path d="M4.5 2h5l3 3v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M9.5 2v3h3"/>'],
];

// Nur reine Anzeige-Ansichten automatisch neu laden, damit keine Eingabe verloren geht.
const live = new Set(['overview', 'live', 'usage']);
// Unteransichten ohne eigenen Eintrag in der Seitenleiste.
const parent = { session: 'sessions' };
let sessionQuery = '';
let current;
let currentOptions;
let ticket = 0;

const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const pill = h('span', { class: 'pill' });
const mark = document.querySelector('.mark');
let turns = 0;

const easeOut = (t) => 1 - (1 - t) ** 4;
const overshoot = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

/**
 * Lässt `draw(fortschritt)` über `duration` ms laufen, Bild für Bild im Hauptthread.
 * Bewusst keine CSS-Animation: WebKitGTK blendet Elemente an deren Ende kurz aus.
 */
function tween(duration, delay, draw, alive = () => true) {
  draw(0);
  const began = performance.now() + delay;
  const step = (now) => {
    if (!alive()) return;
    const t = Math.min(1, Math.max(0, (now - began) / duration));
    draw(t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Auftritt einer frisch geöffneten Ansicht: Blöcke und Zeilen gestaffelt, Balken wachsen. */
function animateIn() {
  if (calm.matches) return;
  const mine = ticket;
  const alive = () => mine === ticket;
  const rise = (el, delay, duration, distance) => tween(duration, delay, (t) => {
    const e = easeOut(t);
    el.style.opacity = t < 1 ? e : '';
    el.style.transform = t < 1 ? `translateY(${(1 - e) * distance}px)` : '';
  }, alive);
  const grow = (el, delay, duration, axis, ease) => tween(duration, delay, (t) => {
    el.style.transform = t < 1 ? `scale${axis}(${Math.max(0, ease(t))})` : '';
  }, alive);

  // Raster blenden nicht selbst ein, nur ihre Kinder: kein doppeltes Einblenden.
  const blocks = [...view.children].flatMap((el) => (el.matches('.grid, .cols') ? [...el.children] : [el]));
  blocks.forEach((el, i) => rise(el, Math.min(i, 6) * 50, 550, 12));
  for (const list of view.querySelectorAll('.list')) {
    [...list.querySelectorAll(':scope > .row')].slice(0, 8).forEach((el, i) => rise(el, 120 + i * 30, 450, 8));
  }
  view.querySelectorAll('.bar').forEach((el, i) => grow(el, 200 + i * 50, 800, 'Y', overshoot));
  view.querySelectorAll('.meter i').forEach((el) => grow(el, 300, 900, 'X', easeOut));
}

/** Lässt Inhalt, der oben oder unten aus der Ansicht läuft, weich auslaufen statt hart abzuschneiden. */
function fadeEdges() {
  const below = view.scrollHeight - view.clientHeight - view.scrollTop;
  view.style.setProperty('--fade-top', `${Math.min(26, Math.max(0, view.scrollTop))}px`);
  view.style.setProperty('--fade-bottom', `${Math.min(34, Math.max(0, below))}px`);
}
view.addEventListener('scroll', fadeEdges, { passive: true });
new ResizeObserver(fadeEdges).observe(view);

// Lichtfleck, der auf Karten dem Mauszeiger folgt.
view.addEventListener('pointermove', (event) => {
  const card = event.target.closest('.card, .grid > .row');
  if (!card) return;
  const box = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${event.clientX - box.left}px`);
  card.style.setProperty('--my', `${event.clientY - box.top}px`);
});

/** Schiebt die Auswahl-Markierung in der Seitenleiste zum aktiven Eintrag. */
function movePill() {
  const active = nav.querySelector('[aria-selected="true"]');
  if (!active) return;
  pill.style.height = `${active.offsetHeight}px`;
  pill.style.top = `${active.offsetTop}px`;
}

/** Zählt die großen Zahlen einer frisch geöffneten Ansicht von 0 hoch. */
function countUp() {
  if (calm.matches) return;
  for (const el of view.querySelectorAll('[data-count]')) {
    const target = Number(el.dataset.count);
    // Einheit und Nachkommastellen des Endwerts durchgehend beibehalten, damit nichts umspringt.
    const divisor = target >= 1e9 ? 1e9 : target >= 1e6 ? 1e6 : 1;
    const digits = divisor > 1 ? 1 : 0;
    const number = new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const unit = compact.formatToParts(target).find((part) => part.type === 'compact')?.value;
    const format = (value) => number.format(value / divisor) + (unit ? ` ${unit}` : '');
    const done = el.textContent;
    const began = performance.now();
    el.textContent = format(0);
    const step = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - began) / 700);
      el.textContent = t < 1 ? format(target * (1 - (1 - t) ** 4)) : done;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

async function show(name, options, quiet = false) {
  const mine = ++ticket;
  current = name;
  if (!quiet) currentOptions = options;
  for (const button of nav.querySelectorAll('button')) button.setAttribute('aria-selected', String(button.dataset.view === (parent[name] ?? name)));
  movePill();
  if (!quiet && !calm.matches) {
    const from = turns;
    turns += 90;
    const to = turns;
    tween(700, 0, (t) => (mark.style.transform = `rotate(${from + (to - from) * overshoot(t)}deg)`), () => turns === to);
  }
  // Die alte Ansicht blendet aus, während die neue lädt.
  const left = quiet || calm.matches || !view.firstChild ? null : new Promise((done) => tween(130, 0, (t) => {
    view.style.opacity = 1 - t;
    if (t === 1) done();
  }, () => mine === ticket));
  try {
    const [nodes] = await Promise.all([views[name](options), left]);
    if (mine !== ticket) return;
    const scroll = quiet ? view.scrollTop : 0;
    view.replaceChildren(...nodes.filter(Boolean));
    view.style.opacity = '';
    view.scrollTop = scroll;
    fadeEdges();
    const target = !quiet && view.querySelector('[data-scroll-here]');
    if (target) target.scrollIntoView({ block: 'scrollEnd' in target.dataset ? 'end' : 'center' });
    // Auftritt nur beim Wechsel, nicht beim stillen Nachladen oder Filtern.
    if (!quiet) {
      animateIn();
      countUp();
    }
  } catch (error) {
    if (mine === ticket && !quiet) {
      view.replaceChildren(empty(`Fehler: ${error}`));
      view.style.opacity = '';
    }
  }
}

nav.setAttribute('role', 'tablist');
nav.append(pill);
for (const [name, label, paths] of tabs) {
  // Icons sind feste Zeichenketten aus dieser Datei, kein fremder Inhalt.
  nav.append(h('button', { role: 'tab', 'data-view': name, innerHTML: icon(paths), onclick: () => show(name) }, label));
}
const liveCount = h('span', { class: 'count', hidden: true });
nav.querySelector('[data-view="live"]').append(liveCount);

/** Zahl der laufenden Sessions am Eintrag "Live"; pulsiert, solange Claude arbeitet. */
async function syncLive() {
  try {
    const running = await invoke('list_live');
    liveCount.hidden = running.length === 0;
    liveCount.textContent = running.length;
    liveCount.classList.toggle('busy', running.some((l) => l.status === 'busy' || l.status === 'shell'));
  } catch { /* Anzeige bleibt, wie sie war */ }
}
window.addEventListener('resize', movePill);

const refresh = () => {
  if (!document.hidden && live.has(current)) show(current, undefined, true);
};
setInterval(refresh, 60000);

// Restzeit des 5-Stunden-Fensters läuft mit, ohne die Ansicht neu zu laden.
setInterval(() => {
  for (const el of view.querySelectorAll('[data-reset]')) el.textContent = remaining(Number(el.dataset.reset));
  for (const el of view.querySelectorAll('[data-span]')) {
    const [start, reset] = el.dataset.span.split(',').map(Number);
    el.style.width = `${Math.min(100, ((Date.now() - start) / (reset - start)) * 100)}%`;
  }
}, 20000);

listen('live-changed', () => {
  syncLive();
  if (!document.hidden && (current === 'live' || current === 'overview')) show(current, undefined, true);
});
syncLive();
setInterval(syncLive, 30000);
document.addEventListener('visibilitychange', refresh);
window.addEventListener('focus', refresh);

// ---------- Befehlspalette (Strg+K) ----------

const palette = {
  wrap: h('div', { class: 'palette-wrap', hidden: true }),
  input: h('input', { type: 'text', placeholder: 'Projekt, Session, Prompt oder Ansicht …', 'aria-label': 'Suchen', spellcheck: false }),
  results: h('div', { class: 'palette-results', role: 'listbox' }),
  hint: h('div', { class: 'palette-hint' }),
  items: [],
  shown: [],
  selected: 0,
  opened: 0,
};
palette.box = h('div', { class: 'palette glass', role: 'dialog', 'aria-label': 'Befehlspalette' }, palette.input, palette.results, palette.hint);
palette.wrap.append(palette.box);
document.body.append(palette.wrap);

/** Bewertet, wie gut `query` auf `text` passt; -1 heißt gar nicht. Wortanfänge und zusammenhängende Treffer zählen mehr. */
function fuzzy(query, text) {
  const lower = text.toLowerCase();
  const at = lower.indexOf(query);
  if (at !== -1) return 1000 - Math.min(at, 200) + (at === 0 || /[\s/_.-]/.test(lower[at - 1]) ? 200 : 0) - Math.min(lower.length, 100) / 10;
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of query) {
    const found = lower.indexOf(char, from);
    if (found === -1) return -1;
    score += 10 + (found === previous + 1 ? 15 : 0) + (found === 0 || /[\s/_.-]/.test(lower[found - 1]) ? 20 : 0);
    previous = found;
    from = found + 1;
  }
  return score;
}

/** Einträge der Palette: zuerst nur die Ansichten, sobald geladen auch Projekte, Sessions, Prompts und Skills. */
async function loadPalette() {
  const go = tabs.map(([name, label]) => ({ kind: 'Ansicht', label, sub: 'Ansicht öffnen', hint: 'Öffnen', run: () => show(name) }));
  palette.items = go;
  const mine = palette.opened;
  const [projects, sessions, prompts, skills, running] = await Promise.all(
    [invoke('list_projects'), invoke('list_sessions', { limit: 300 }), invoke('list_prompts'), invoke('list_skills'), invoke('list_live')]
      .map((request) => request.catch(() => [])));
  if (mine !== palette.opened) return;
  const start = (p, again) => run('launch_claude', { path: p.path, resume: again }, again ? 'Fortsetzen …' : 'Claude startet …');
  palette.items = [
    ...running.map((l) => ({
      kind: 'Live', label: l.title, sub: `${l.project_name} · ${statusLabel[l.status] ?? l.status}`, recent: true,
      hint: 'Verlauf', run: () => (l.has_log ? show('session', { id: l.session_id }) : show('live')),
    })),
    ...projects.map((p, i) => ({
      kind: 'Projekt', label: p.name, sub: shortPath(p.path), recent: i < 5,
      hint: 'Claude starten', run: () => start(p, false),
      altHint: p.sessions > 0 && 'Fortsetzen', alt: () => start(p, true),
    })),
    ...sessions.map((s, i) => ({
      kind: 'Session', label: s.title, sub: `${s.project_name} · ${ago(s.last_active)}`, recent: i < 5,
      hint: 'Fortsetzen', run: () => resume(s),
      altHint: 'Verlauf', alt: () => show('session', { id: s.id }),
    })),
    ...go,
    ...prompts.map((p) => ({ kind: 'Prompt', label: p.title, sub: p.body, hint: 'Kopieren', run: () => copy(p.body) })),
    ...skills.map((k) => ({ kind: 'Skill', label: k.name, sub: k.description, hint: 'Anzeigen', run: () => show('skills', { query: k.name }) })),
  ];
  drawPalette();
}

function drawPalette() {
  const raw = palette.input.value.trim();
  const query = raw.toLowerCase();
  if (!query) {
    palette.shown = palette.items.filter((item) => item.recent || item.kind === 'Ansicht');
  } else {
    palette.shown = palette.items
      .map((item) => ({ item, score: Math.max(fuzzy(query, item.label), fuzzy(query, item.sub) * 0.5) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((entry) => entry.item);
    if (raw.length >= 2) {
      palette.shown.push({
        kind: 'Suche', label: `In allen Sessions suchen: „${raw}“`, sub: 'Volltextsuche über die Logs', plain: true,
        hint: 'Suchen', run: () => show('sessions', { query: raw }),
      });
    }
  }
  palette.selected = Math.min(palette.selected, Math.max(0, palette.shown.length - 1));
  palette.results.replaceChildren(...(palette.shown.length ? palette.shown.map((item, i) =>
    h('button', {
      class: 'palette-item', role: 'option', tabIndex: -1, 'data-i': i,
      onclick: (event) => choose(i, event.shiftKey),
      onmousemove: () => i !== palette.selected && select(i),
    },
      h('div', { class: 'main' },
        h('div', { class: 'title' }, item.plain ? item.label : marked(item.label, raw)),
        h('div', { class: 'meta' }, item.sub)),
      h('span', { class: 'badge' }, item.kind))) : [h('div', { class: 'palette-empty' }, 'Nichts gefunden.')]));
  select(palette.selected);
}

function select(index) {
  palette.selected = index;
  for (const el of palette.results.children) {
    const active = Number(el.dataset.i) === index;
    el.setAttribute?.('aria-selected', String(active));
    if (active) el.scrollIntoView({ block: 'nearest' });
  }
  const item = palette.shown[index];
  palette.hint.replaceChildren(...(item ? [
    h('span', {}, h('kbd', {}, '↵'), item.hint),
    item.altHint && h('span', {}, h('kbd', {}, '⇧ ↵'), item.altHint),
    h('span', { class: 'right' }, h('kbd', {}, 'Esc'), 'Schließen'),
  ] : [h('span', { class: 'right' }, h('kbd', {}, 'Esc'), 'Schließen')]).filter(Boolean));
}

function choose(index, alternative) {
  const item = palette.shown[index];
  if (!item) return;
  closePalette();
  (alternative && item.altHint ? item.alt : item.run)();
}

function openPalette() {
  if (!palette.wrap.hidden) return palette.input.focus();
  palette.opened++;
  palette.wrap.hidden = false;
  palette.input.value = '';
  palette.selected = 0;
  palette.input.focus();
  loadPalette();
  drawPalette();
  if (calm.matches) return;
  const mine = palette.opened;
  tween(200, 0, (t) => {
    const e = easeOut(t);
    palette.wrap.style.opacity = t < 1 ? e : '';
    palette.box.style.transform = t < 1 ? `translateY(${(1 - e) * -10}px) scale(${0.97 + 0.03 * e})` : '';
  }, () => mine === palette.opened && !palette.wrap.hidden);
}

function closePalette() {
  palette.wrap.hidden = true;
  palette.wrap.style.opacity = '';
  palette.box.style.transform = '';
}

palette.input.addEventListener('input', () => {
  palette.selected = 0;
  drawPalette();
});
palette.wrap.addEventListener('mousedown', (event) => {
  if (event.target === palette.wrap) closePalette();
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    return palette.wrap.hidden ? openPalette() : closePalette();
  }
  if (palette.wrap.hidden) return;
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (step) {
    event.preventDefault();
    const count = palette.shown.length;
    if (count) select((palette.selected + step + count) % count);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    choose(palette.selected, event.shiftKey);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closePalette();
  } else if (event.key === 'Tab') {
    // Fokus bleibt im Suchfeld.
    event.preventDefault();
  }
});

// ---------- Ideenleiste ----------

const ideaBar = document.getElementById('idea');
const ideaText = h('div', { class: 'idea-text' });
const ideaLine = h('i');
const ideaGrip = h('button', { class: 'idea-grip', type: 'button', onclick: () => openIdea(!ideaBar.classList.contains('open')) }, ideaLine);
let ideaStretch = 1;
let ideaPull = 0;

/** Streckt den Strich im Griff federnd auf `to`-fache Breite. */
function stretchGrip(to) {
  const from = ideaStretch;
  const mine = ++ideaPull;
  if (calm.matches || from === to) return;
  tween(350, 0, (t) => {
    ideaStretch = from + (to - from) * overshoot(t);
    ideaLine.style.transform = t < 1 || to !== 1 ? `scaleX(${ideaStretch})` : '';
  }, () => mine === ideaPull);
}
ideaGrip.addEventListener('pointerenter', () => stretchGrip(1.5));
ideaGrip.addEventListener('pointerleave', () => stretchGrip(1));
ideaGrip.addEventListener('pointerdown', () => stretchGrip(0.8));
ideaGrip.addEventListener('pointerup', () => stretchGrip(ideaGrip.matches(':hover') ? 1.5 : 1));
const ideaIcon = h('span', { class: 'idea-icon', innerHTML: icon('<path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6z"/>') });
let ideaSize = 0;
let ideaSpin = 0;
let idea;
let ideaTurn = 0;

/** Zieht eine Idee, die noch nicht dran war; erst wenn alle gezeigt wurden, beginnt der Stapel neu. */
function pickIdea() {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('ideas-seen')) ?? []; } catch { /* Stapel beginnt neu */ }
  if (!Array.isArray(seen)) seen = [];
  let fresh = ideas.filter((item) => !seen.includes(item.title));
  if (fresh.length === 0) {
    seen = [];
    fresh = ideas.filter((item) => item !== idea);
  }
  const next = fresh[Math.floor(Math.random() * fresh.length)];
  seen.push(next.title);
  try { localStorage.setItem('ideas-seen', JSON.stringify(seen)); } catch { /* ohne Ablage wiederholen sich Ideen früher */ }
  return next;
}

/** Ändert die Leiste über `change` und lässt ihre Höhe vom alten zum neuen Maß federn. */
function resizeIdea(change) {
  const from = ideaBar.offsetHeight;
  ideaBar.style.height = '';
  change();
  const mine = ++ideaSize;
  const to = ideaBar.offsetHeight;
  if (calm.matches || from === to || from === 0) return;
  tween(420, 0, (t) => {
    ideaBar.style.height = t < 1 ? `${from + (to - from) * overshoot(t)}px` : '';
  }, () => mine === ideaSize);
}

/** Klappt die Leiste über den Griff auf den ganzen Prompt auf oder wieder auf eine Zeile zu. */
function openIdea(open) {
  resizeIdea(() => ideaBar.classList.toggle('open', open));
  ideaGrip.setAttribute('aria-expanded', open);
  ideaGrip.setAttribute('aria-label', open ? 'Idee einklappen' : 'Ganze Idee lesen');
  ideaGrip.title = open ? 'Einklappen' : 'Ganz lesen';
}

function nextIdea() {
  idea = pickIdea();
  resizeIdea(() => ideaText.replaceChildren(
    h('div', { class: 'idea-title' }, h('span', {}, idea.title), h('span', { class: 'badge' }, idea.tag)),
    h('div', { class: 'idea-prompt' }, idea.prompt)));
  if (calm.matches) return;
  const mine = ++ideaTurn;
  const from = ideaSpin;
  ideaSpin += 180;
  tween(800, 0, (t) => (ideaIcon.style.transform = `rotate(${from + 180 * overshoot(t)}deg)`), () => mine === ideaTurn);
  tween(450, 0, (t) => {
    const e = easeOut(t);
    ideaText.style.opacity = t < 1 ? e : '';
    ideaText.style.transform = t < 1 ? `translateY(${(1 - e) * 8}px)` : '';
  }, () => mine === ideaTurn);
}

ideaBar.append(
  ideaGrip,
  ideaIcon,
  ideaText,
  h('div', { class: 'actions' },
    h('button', { class: 'btn small', onclick: () => copy(idea.prompt) }, 'Prompt kopieren'),
    h('button', { class: 'btn small ghost', onclick: nextIdea }, 'Neue Idee')));
openIdea(false);
nextIdea();

// Wer nach einer Pause zurückkommt, findet eine neue Idee vor.
let leftAt = 0;
window.addEventListener('blur', () => (leftAt = Date.now()));
window.addEventListener('focus', () => {
  if (leftAt && Date.now() - leftAt > 60000) nextIdea();
  leftAt = 0;
});

/** Klick auf „Claude Hub“: Projekte neu suchen, Ansicht frisch laden, neue Idee. */
async function reloadAll() {
  nextIdea();
  syncLive();
  await invoke('list_projects', { refresh: true }).catch(() => {});
  await show(current, currentOptions);
  toast('Aktualisiert');
}
document.getElementById('home').addEventListener('click', reloadAll);

document.getElementById('find').addEventListener('click', openPalette);
/** Führt aus, was ein Aufruf von außen verlangt (Tastenkürzel, Kontrollleiste, Startparameter). */
function follow(intent) {
  if (!intent) return;
  if (intent.palette) return openPalette();
  closePalette();
  if (Object.hasOwn(views, intent.view)) show(intent.view, intent.options);
}
listen('intent', (event) => follow(event.payload));

show('overview');
invoke('take_start_intent').then(follow).catch(() => {});
