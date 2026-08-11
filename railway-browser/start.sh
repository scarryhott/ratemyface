#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="${RMF_BROWSER_PROFILE_DIR:-/data/browser-profile}"
DISPLAY_VALUE="${DISPLAY:-:99}"
PORT_VALUE="${PORT:-8080}"
DISPLAY_NUMBER="${DISPLAY_VALUE#:}"
DISPLAY_NUMBER="${DISPLAY_NUMBER%%.*}"
DISPLAY_SOCKET="/tmp/.X11-unix/X${DISPLAY_NUMBER}"
DISPLAY_LOCK="/tmp/.X${DISPLAY_NUMBER}-lock"

mkdir -p "$PROFILE_DIR" /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix
export DISPLAY=":${DISPLAY_NUMBER}"

echo "browser-runtime startup DISPLAY=$DISPLAY PORT=$PORT_VALUE PROFILE_DIR=$PROFILE_DIR"

# A Railway container restart can preserve stale X11 and Chrome lock files even
# though their owning processes are gone. Remove only those per-process locks.
rm -f "$DISPLAY_SOCKET" "$DISPLAY_LOCK"
rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/SingletonCookie"

Xvfb "$DISPLAY" -screen 0 1440x900x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

XVFB_READY=0
for _ in $(seq 1 100); do
  if kill -0 "$XVFB_PID" 2>/dev/null && [ -S "$DISPLAY_SOCKET" ]; then
    XVFB_READY=1
    break
  fi
  if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    echo "Xvfb exited before display became ready" >&2
    cat /tmp/xvfb.log >&2 || true
    exit 1
  fi
  sleep 0.1
done

if [ "$XVFB_READY" -ne 1 ] || ! kill -0 "$XVFB_PID" 2>/dev/null; then
  echo "Xvfb display did not become ready" >&2
  cat /tmp/xvfb.log >&2 || true
  exit 1
fi

fluxbox >/tmp/fluxbox.log 2>&1 &
FLUXBOX_PID=$!

cleanup() {
  trap - EXIT TERM INT
  if [ -n "${NODE_PID:-}" ]; then
    kill -TERM "$NODE_PID" 2>/dev/null || true
    wait "$NODE_PID" 2>/dev/null || true
  fi
  kill -TERM "$FLUXBOX_PID" "$XVFB_PID" 2>/dev/null || true
  wait "$FLUXBOX_PID" "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT TERM INT

echo "Xvfb ready on DISPLAY=$DISPLAY PID=$XVFB_PID; starting Node server on PORT=$PORT_VALUE"
node /app/server.mjs &
NODE_PID=$!

# Keep PID 1 supervising both required processes. If either Node or Xvfb exits,
# stop the other and exit so Railway restarts the complete display/browser unit.
set +e
wait -n "$NODE_PID" "$XVFB_PID"
EXIT_STATUS=$?
set -e

if [ "$EXIT_STATUS" -eq 0 ]; then
  EXIT_STATUS=1
fi

if ! kill -0 "$XVFB_PID" 2>/dev/null; then
  echo "Xvfb exited; restarting browser runtime" >&2
  cat /tmp/xvfb.log >&2 || true
else
  echo "Node browser server exited; restarting browser runtime" >&2
fi

exit "$EXIT_STATUS"
