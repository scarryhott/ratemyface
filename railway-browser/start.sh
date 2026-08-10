#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${RMF_BROWSER_PROFILE_DIR:-/data/browser-profile}"
rm -f /tmp/.X99-lock || true
Xvfb :99 -screen 0 1440x900x24 -nolisten tcp &
XVFB_PID=$!

for _ in $(seq 1 50); do
  if xdpyinfo -display :99 >/dev/null 2>&1; then break; fi
  sleep 0.1
done

fluxbox >/tmp/fluxbox.log 2>&1 &
exec npm start
