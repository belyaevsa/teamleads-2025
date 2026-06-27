#!/bin/bash
# Local launcher – builds the image and (re)runs the container. No docker-compose.
# Mirrors what the CI workflow does on the server, but reads ./backend.env here.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="teamleads-backend:local"
NAME="teamleads-backend"
ENV_FILE="backend.env"
HOST_BIND="127.0.0.1:5080"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE – copy backend.env.example to backend.env and fill it in." >&2
  exit 1
fi

echo "Building $IMAGE…"
docker build -t "$IMAGE" .

echo "Restarting $NAME on $HOST_BIND…"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" \
  --restart unless-stopped \
  -p "${HOST_BIND}:8080" \
  --env-file "$ENV_FILE" \
  "$IMAGE"

echo "Up. Health: curl http://${HOST_BIND}/api/health"
