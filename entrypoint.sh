#!/bin/sh
set -e

echo "[entrypoint] arrancando motor de análisis en :8000..."
uvicorn main:app --app-dir /srv/engine --host 0.0.0.0 --port 8000 &
ENGINE_PID=$!

echo "[entrypoint] arrancando web en :3000..."
node /app/server.js &
WEB_PID=$!

shutdown() {
  echo "[entrypoint] deteniendo servicios..."
  kill "$ENGINE_PID" "$WEB_PID" 2>/dev/null || true
}
trap shutdown TERM INT

wait -n
EXIT_CODE=$?
shutdown
exit "$EXIT_CODE"
