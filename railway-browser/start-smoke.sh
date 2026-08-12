#!/usr/bin/env bash
# Prove start.sh binds /health even when Xvfb cannot start.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'if [ -n "${START_PID:-}" ]; then kill "$START_PID" 2>/dev/null || true; wait "$START_PID" 2>/dev/null || true; fi; rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/data"
PORT_VALUE="${PORT:-18081}"

cat > "$TMP/bin/Xvfb" <<'EOF'
#!/bin/sh
echo "fake Xvfb refusing to start" >&2
exit 1
EOF
cat > "$TMP/bin/fluxbox" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$TMP/bin/Xvfb" "$TMP/bin/fluxbox"

export PATH="$TMP/bin:$PATH"
export PORT="$PORT_VALUE"
export DISPLAY=":99"
export RMF_BROWSER_PROFILE_DIR="$TMP/data/browser-profile"
export RMF_BROWSER_SERVER="$ROOT/health-stub.mjs"

bash "$ROOT/start.sh" >"$TMP/start.log" 2>&1 &
START_PID=$!

deadline=$((SECONDS + 8))
body=""
while (( SECONDS < deadline )); do
  if ! kill -0 "$START_PID" 2>/dev/null; then
    echo "start.sh exited while Xvfb was down; log:" >&2
    cat "$TMP/start.log" >&2
    exit 1
  fi
  if body=$(curl -sf "http://127.0.0.1:${PORT_VALUE}/health" 2>/dev/null); then
    break
  fi
  sleep 0.1
done

if [[ "$body" != *'"ok":true'* ]]; then
  echo "health not ready; log:" >&2
  cat "$TMP/start.log" >&2
  exit 1
fi

if ! kill -0 "$START_PID" 2>/dev/null; then
  echo "start.sh died after health succeeded" >&2
  cat "$TMP/start.log" >&2
  exit 1
fi

echo "start-smoke ok $body"
