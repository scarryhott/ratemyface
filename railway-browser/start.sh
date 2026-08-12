#!/usr/bin/env bash
set -euo pipefail

# Railway healthchecks only need HTTP 200 on PORT. Chromium needs Xvfb, but
# gating listen() on the X socket is what made deploys flake: identical images
# failed when Xvfb was slow or the unix socket was not yet a -S file.
# Bind Node first, then bring the display up (with retries) under the same PID 1.

PROFILE_DIR="${RMF_BROWSER_PROFILE_DIR:-/data/browser-profile}"
DISPLAY_VALUE="${DISPLAY:-:99}"
PORT_VALUE="${PORT:-8080}"
DISPLAY_NUMBER="${DISPLAY_VALUE#:}"
DISPLAY_NUMBER="${DISPLAY_NUMBER%%.*}"
DISPLAY_SOCKET="/tmp/.X11-unix/X${DISPLAY_NUMBER}"
DISPLAY_LOCK="/tmp/.X${DISPLAY_NUMBER}-lock"

mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix 2>/dev/null || true
mkdir -p "$PROFILE_DIR" 2>/dev/null || echo "[browser-runtime] warning: could not create $PROFILE_DIR" >&2

export DISPLAY=":${DISPLAY_NUMBER}"
export PORT="$PORT_VALUE"

echo "[browser-runtime] startup DISPLAY=$DISPLAY PORT=$PORT_VALUE PROFILE_DIR=$PROFILE_DIR"

# A Railway volume remount can preserve Chrome singleton locks after the old
# PID is gone. X11 sockets live in /tmp and can also be stale on restart.
rm -f "$DISPLAY_SOCKET" "$DISPLAY_LOCK"
rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/SingletonCookie"

display_ready() {
  if [ ! -e "$DISPLAY_SOCKET" ] && [ ! -S "$DISPLAY_SOCKET" ]; then
    return 1
  fi
  if command -v xdpyinfo >/dev/null 2>&1; then
    xdpyinfo -display "$DISPLAY" >/dev/null 2>&1
    return $?
  fi
  return 0
}

xvfb_alive() {
  [ -n "${XVFB_PID:-}" ] && kill -0 "$XVFB_PID" 2>/dev/null
}

start_xvfb() {
  Xvfb "$DISPLAY" -screen 0 1440x900x24 -ac -nolisten tcp >/tmp/xvfb.log 2>&1 &
  XVFB_PID=$!
  echo "[browser-runtime] started Xvfb pid=$XVFB_PID DISPLAY=$DISPLAY"
}

wait_for_xvfb() {
  local i
  for i in {1..150}; do
    if xvfb_alive && display_ready; then
      echo "[browser-runtime] X socket ready at $DISPLAY_SOCKET"
      return 0
    fi
    if ! xvfb_alive; then
      echo "[browser-runtime] Xvfb exited before display became ready" >&2
      cat /tmp/xvfb.log >&2 || true
      return 1
    fi
    sleep 0.1
  done
  echo "[browser-runtime] Xvfb display did not become ready" >&2
  cat /tmp/xvfb.log >&2 || true
  return 1
}

ensure_display() {
  local attempt
  for attempt in 1 2 3; do
    if xvfb_alive && display_ready; then
      return 0
    fi
    if xvfb_alive; then
      kill -TERM "$XVFB_PID" 2>/dev/null || true
      wait "$XVFB_PID" 2>/dev/null || true
    fi
    rm -f "$DISPLAY_SOCKET" "$DISPLAY_LOCK"
    echo "[browser-runtime] Xvfb start attempt $attempt"
    start_xvfb
    if wait_for_xvfb; then
      fluxbox >/tmp/fluxbox.log 2>&1 &
      FLUXBOX_PID=$!
      return 0
    fi
    sleep 0.5
  done
  echo "[browser-runtime] Xvfb not confirmed; /health still served, headed Chrome will wait" >&2
  return 1
}

echo "[browser-runtime] starting Node server on PORT=$PORT_VALUE (HTTP before Xvfb)"
SERVER_JS="${RMF_BROWSER_SERVER:-/app/server.mjs}"
node "$SERVER_JS" &
NODE_PID=$!

cleanup() {
  trap - EXIT TERM INT
  if [ -n "${NODE_PID:-}" ]; then
    kill -TERM "$NODE_PID" 2>/dev/null || true
    wait "$NODE_PID" 2>/dev/null || true
  fi
  kill -TERM "${FLUXBOX_PID:-}" "${XVFB_PID:-}" 2>/dev/null || true
  wait "${FLUXBOX_PID:-}" "${XVFB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT TERM INT

# Bring X up in parallel with Node listen. Do not exit if the display is late;
# Railway would otherwise mark the deploy failed while /health is already valid.
ensure_display || true

while kill -0 "$NODE_PID" 2>/dev/null; do
  if ! xvfb_alive; then
    echo "[browser-runtime] Xvfb lost; restarting display" >&2
    cat /tmp/xvfb.log >&2 || true
    ensure_display || true
  fi
  sleep 1
done

echo "[browser-runtime] Node browser server exited; restarting browser runtime" >&2
exit 1
