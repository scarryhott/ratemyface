#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${RMF_BROWSER_PROFILE_DIR:-/data/browser-profile}"

# Run the entire Node/Playwright process inside xvfb-run so DISPLAY is
# guaranteed to point at a live X server. Child processes started by the
# browser runtime (x11vnc/websockify) inherit the same DISPLAY.
exec xvfb-run -a -s "-screen 0 1440x900x24 -nolisten tcp" \
  bash -lc 'fluxbox >/tmp/fluxbox.log 2>&1 & exec node /app/server.mjs'
