#!/bin/sh
set -u

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

# Espera POSIX (dash): mientras ambos procesos estén vivos, espera.
while kill -0 "$ENGINE_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done

# Uno de los dos terminó: reporta su código si fue un error real.
shutdown
wait "$ENGINE_PID" 2>/dev/null
EC1=$?
wait "$WEB_PID" 2>/dev/null
EC2=$?

[ "$EC1" -ne 0 ] && [ "$EC1" -ne 143 ] && exit "$EC1"
[ "$EC2" -ne 0 ] && [ "$EC2" -ne 143 ] && exit "$EC2"
exit 0
