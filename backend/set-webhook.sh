#!/bin/bash
# Registers (or clears) the Telegram webhook for @temlead_helper_bot.
#
# Run once after the first deploy, and again whenever TG_WEBHOOK_SECRET rotates.
# Deliberately NOT done on app startup: a crash-looping container would hammer
# the Telegram API and could get the bot rate-limited.
#
#   ./set-webhook.sh                 # reads ./backend.env, points at https://teamleads.kz
#   ./set-webhook.sh https://staging.example.com
#   ./set-webhook.sh --delete        # unregister
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="${ENV_FILE:-backend.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }

# Read the two keys we need instead of sourcing the file. `source` would execute it as
# shell, and the connection string contains both `;` and `SSL Mode=Require`, which the
# shell reads as a command separator followed by a command named SSL.
env_value() { grep -m1 -E "^$1=" "$ENV_FILE" | cut -d= -f2-; }

TG_BOT_TOKEN="$(env_value TG_BOT_TOKEN)"
TG_WEBHOOK_SECRET="$(env_value TG_WEBHOOK_SECRET)"

: "${TG_BOT_TOKEN:?TG_BOT_TOKEN is not set in $ENV_FILE}"
: "${TG_WEBHOOK_SECRET:?TG_WEBHOOK_SECRET is not set in $ENV_FILE}"

API="https://api.telegram.org/bot${TG_BOT_TOKEN}"

if [[ "${1:-}" == "--delete" ]]; then
  curl -fsS -X POST "$API/deleteWebhook" -d drop_pending_updates=true
  echo
  exit 0
fi

BASE_URL="${1:-https://teamleads.kz}"
URL="${BASE_URL}/api/tg/webhook/${TG_WEBHOOK_SECRET}"

# secret_token makes Telegram send X-Telegram-Bot-Api-Secret-Token on every call;
# the backend requires it in addition to the path segment.
curl -fsS -X POST "$API/setWebhook" \
  -d "url=${URL}" \
  -d "secret_token=${TG_WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\",\"callback_query\"]" \
  -d "drop_pending_updates=true"
echo

echo "Current state:"
# The URL is echoed back with the secret in it – keep this output off screenshots.
curl -fsS "$API/getWebhookInfo"
echo
