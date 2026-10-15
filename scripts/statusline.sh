#!/usr/bin/env bash
# Statuszeile für Claude Code: legt die echten Abo-Limits (5-Stunden-Fenster, Woche) für
# Claude Hub in ~/.cache/claude-hub/limits.json ab. Mit --quiet nur ablegen, nichts ausgeben
# (für eine eigene Statuszeile: Eingabe zusätzlich an `claude-hub-statusline --quiet` geben).
input=$(cat)

limits=$(printf '%s' "$input" | python3 -c '
import json, sys, time
data = json.load(sys.stdin)
if data.get("rate_limits"):
    print(json.dumps({"at": int(time.time() * 1000), "rate_limits": data["rate_limits"]}))
' 2>/dev/null)
if [ -n "$limits" ]; then
  dir="$HOME/.cache/claude-hub"
  mkdir -p "$dir" && printf '%s\n' "$limits" > "$dir/limits.json.$$" && mv "$dir/limits.json.$$" "$dir/limits.json"
fi

[ "$1" = "--quiet" ] && exit 0
cwd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("cwd",""))' 2>/dev/null)
printf '[%s@%s %s]' "$(whoami)" "$(hostname -s 2>/dev/null || uname -n)" "$(basename "${cwd:-$PWD}")"
