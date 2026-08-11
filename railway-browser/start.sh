#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="${RMF_BROWSER_PROFILE_DIR:-/data/browser-profile}"
DISPLAY_VALUE="${DISPLAY:-:99}"
PORT_VALUE="${PORT:-8080}"

mkdir -p "$PROFILE_DIR"
export DISPLAY="$DISPLAY_VALUE"

echo "browser-runtime startup DISPLAY=$DISPLAY PORT=$PORT_VALUE PROFILE_DIR=$PROFILE_DIR"

Xvfb "$DISPLAY" -screen 0 1440x900x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

for _ in $(seq 1 50); do
  if [ -S "/tmp/.X11-unix/X${DISPLAY#:}" ]; then
    break
  fi
  if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    echo "Xvfb exited before display became ready" >&2
    cat /tmp/xvfb.log >&2 || true
    exit 1
  fi
  sleep 0.1
done

if [ ! -S "/tmp/.X11-unix/X${DISPLAY#:}" ]; then
  echo "Xvfb display socket did not become ready" >&2
  cat /tmp/xvfb.log >&2 || true
  exit 1
fi

fluxbox >/tmp/fluxbox.log 2>&1 &

echo "Xvfb ready on DISPLAY=$DISPLAY; starting Node server on PORT=$PORT_VALUE"
exec node /app/server.mjs
