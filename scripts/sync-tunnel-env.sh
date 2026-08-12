#!/usr/bin/env bash
# 将固定隧道 URL 同步到 file-service（及同级 playlist-player / worship-player）的 .env

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)/.."
URL_FILE="${ROOT}/data/cloudflared.url"

if [[ ! -f "$URL_FILE" ]]; then
  echo "找不到 ${URL_FILE}，请先 npm run tunnel:setup" >&2
  exit 1
fi

BASE="$(tr -d '[:space:]' < "$URL_FILE")"
if [[ ! "$BASE" =~ ^https:// ]]; then
  echo "无效 URL: ${BASE}" >&2
  exit 1
fi

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    if [[ "$(uname)" == Darwin ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    fi
  else
    echo "${key}=${value}" >> "$file"
  fi
}

API_ENV="${ROOT}/.env"
touch "$API_ENV"

upsert_env "$API_ENV" "PUBLIC_BASE_URL" "$BASE"
upsert_env "$API_ENV" "GOOGLE_OAUTH_REDIRECT_URI" "${BASE}/v1/youtube/oauth/callback"

for mobile_name in playlist-player worship-player; do
  MOBILE_ROOT="${ROOT}/../${mobile_name}"
  MOBILE_ENV="${MOBILE_ROOT}/.env"
  if [[ -d "$MOBILE_ROOT" ]]; then
    touch "$MOBILE_ENV"
    upsert_env "$MOBILE_ENV" "API_URL" "$BASE"
    echo "已更新 ${mobile_name}/.env → API_URL=${BASE}"
  fi
done

echo "已更新 file-service/.env → PUBLIC_BASE_URL=${BASE}"
