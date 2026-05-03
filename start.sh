#!/bin/bash
set -e

echo "==> Starting FastAPI backend on :8000 ..."
uvicorn main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

# Wait for backend to be healthy before starting frontend
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8000/ > /dev/null 2>&1; then
    echo "==> Backend is ready (PID $BACKEND_PID)"
    break
  fi
  sleep 1
done

echo "==> Starting Next.js frontend on :${PORT:-3000} ..."
cd frontend
PORT=${PORT:-3000} HOSTNAME=0.0.0.0 exec node server.js
