#!/usr/bin/env bash
# Baut (falls nötig) und installiert Claude Hub für den aktuellen Benutzer, ohne sudo.
# Danach steht die App in der Suche und im Startmenü.
#   ./install.sh              bauen, falls noch kein Build da ist, und installieren
#   ./install.sh --rebuild    immer neu bauen
#   ./install.sh --no-statusline   Statuszeile von Claude Code nicht anfassen
set -euo pipefail
cd "$(dirname "$0")"

rebuild=0
statusline=1
for arg in "$@"; do
  case "$arg" in
    --rebuild) rebuild=1 ;;
    --no-statusline) statusline=0 ;;
    *) echo "Unbekannte Option: $arg" >&2; exit 1 ;;
  esac
done

bin=src-tauri/target/release/claude-hub

hint_deps() {
  echo
  echo "Benötigt werden Rust (https://rustup.rs), Node.js mit pnpm oder npm und die Tauri-Systempakete:"
  if command -v dnf >/dev/null; then
    echo "  sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel gcc"
  elif command -v apt-get >/dev/null; then
    echo "  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev"
  elif command -v pacman >/dev/null; then
    echo "  sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg"
  elif command -v zypper >/dev/null; then
    echo "  sudo zypper in webkit2gtk3-devel libopenssl-devel curl wget file libappindicator3-1 librsvg-devel"
    echo "  sudo zypper in -t pattern devel_basis"
  else
    echo "  siehe https://v2.tauri.app/start/prerequisites/#linux"
  fi
  exit 1
}

if [ "$rebuild" = 1 ] || [ ! -x "$bin" ]; then
  command -v cargo >/dev/null || { echo "cargo fehlt."; hint_deps; }
  pkg-config --exists webkit2gtk-4.1 2>/dev/null || { echo "webkit2gtk-4.1 (Entwicklerpaket) fehlt."; hint_deps; }
  if command -v pnpm >/dev/null; then
    pnpm install
    pnpm build:bin
  elif command -v npm >/dev/null; then
    npm install
    npm run build:bin
  else
    echo "Weder pnpm noch npm gefunden."; hint_deps
  fi
fi

install -Dm755 "$bin" "$HOME/.local/bin/claude-hub"
install -Dm755 scripts/statusline.sh "$HOME/.local/bin/claude-hub-statusline"
install -Dm644 src-tauri/icons/32x32.png "$HOME/.local/share/icons/hicolor/32x32/apps/claude-hub.png"
install -Dm644 src-tauri/icons/64x64.png "$HOME/.local/share/icons/hicolor/64x64/apps/claude-hub.png"
install -Dm644 src-tauri/icons/128x128.png "$HOME/.local/share/icons/hicolor/128x128/apps/claude-hub.png"
install -Dm644 src-tauri/icons/128x128@2x.png "$HOME/.local/share/icons/hicolor/256x256/apps/claude-hub.png"
install -Dm644 src-tauri/icons/icon.png "$HOME/.local/share/icons/hicolor/512x512/apps/claude-hub.png"

mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/claude-hub.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Claude Hub
GenericName=Dashboard für Claude Code
Comment=Projekte, Sessions, Verbrauch, Skills und MCP-Server von Claude Code
Exec=$HOME/.local/bin/claude-hub
Icon=claude-hub
Terminal=false
Categories=Utility;
Keywords=claude;hub;ai;ki;dashboard;
StartupWMClass=claude-hub
Actions=Palette;

[Desktop Action Palette]
Name=Suchen
Exec=$HOME/.local/bin/claude-hub --palette
X-KDE-Shortcuts=Meta+C
DESKTOP

# Echte Limits (5-Stunden-Fenster, Woche) liefert Claude Code nur an die Statuszeile.
# Ist noch keine Statuszeile eingerichtet, wird claude-hub-statusline eingetragen.
if [ "$statusline" = 1 ]; then
  python3 - "$HOME/.claude/settings.json" "$HOME/.local/bin/claude-hub-statusline" <<'PY'
import json, shutil, sys
from pathlib import Path
path, helper = Path(sys.argv[1]), sys.argv[2]
settings = json.loads(path.read_text()) if path.is_file() and path.read_text().strip() else {}
current = (settings.get("statusLine") or {}).get("command", "")
if "claude-hub-statusline" in current:
    pass
elif current:
    print(f"Hinweis: Du hast schon eine Statuszeile ({current}).")
    print(f"Für die Limits in Claude Hub ihre Eingabe zusätzlich an `{helper} --quiet` geben.")
else:
    if path.is_file():
        shutil.copy(path, path.with_suffix(".json.bak"))
    path.parent.mkdir(parents=True, exist_ok=True)
    settings["statusLine"] = {"type": "command", "command": helper}
    path.write_text(json.dumps(settings, indent=2, ensure_ascii=False) + "\n")
    print("Statuszeile für die Limits in ~/.claude/settings.json eingetragen.")
PY
fi

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
gtk-update-icon-cache -q "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
kbuildsycoca6 2>/dev/null || true

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) echo "Hinweis: ~/.local/bin ist nicht im PATH. \`claude-hub\` im Terminal geht erst danach." ;;
esac
echo "Installiert. In der Suche nach „Claude Hub“ suchen."
