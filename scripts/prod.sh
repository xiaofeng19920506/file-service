#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example to .env and adjust values."
  exit 1
fi

docker compose -f docker-compose.prod.yml up --build -d "$@"

echo ""
echo "Production stack running at http://localhost:${PORT:-3000}"
echo "  docker compose -f docker-compose.prod.yml logs -f"
echo "  docker compose -f docker-compose.prod.yml down"
