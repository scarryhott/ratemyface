#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${RMF_BROWSER_PROFILE_DIR:-/data/browser-profile}"

# Explicit X11 setup: start Xvfb on :99, wait for socket, then start fluxbox + Node
export DISPLAY=:99

echo "[browser-runtime] Starting Xvfb on DISPLAY=$DISPLAY with resolution 1440x900x24"
Xvfb "$DISPLAY" -screen 0 1440x900x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

# Wait for X socket to exist (max 10 seconds)
echo "[browser-runtime] Waiting for X socket at /tmp/.X11-unix/99"
for i in {1..100}; do
  if [ -S "/tmp/.X11-unix/99" ]; then
    echo "[browser-runtime] X socket ready"
    break
  fi
  if [ $i -eq 100 ]; then
    echo "[browser-runtime] ERROR: X socket never appeared" >&2
    kill $XVFB_PID 2>/dev/null || true
    exit 1
  fi
  sleep 0.1
done

echo "[browser-runtime] Starting fluxbox window manager"
fluxbox >/tmp/fluxbox.log 2>&1 &

echo "[browser-runtime] Starting Node server on PORT=$PORT with DISPLAY=$DISPLAY"
exec node /app/server.mjs

