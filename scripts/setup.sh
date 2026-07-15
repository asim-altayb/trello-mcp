#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

echo "Trello MCP — credential setup"
echo "======================================"
echo

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "Created $ENV_FILE from .env.example"
else
  echo "Using existing $ENV_FILE"
fi

read -r -p "Paste your Trello API key: " api_key
if [[ -z "$api_key" ]]; then
  echo "API key is required." >&2
  exit 1
fi

encoded_key="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$api_key")"
auth_url="https://trello.com/1/authorize?expiration=never&scope=read,write,account&response_type=token&key=${encoded_key}"

echo
echo "1) Open this URL in your browser and click Allow:"
echo "$auth_url"
echo
echo "2) Copy the token shown on the next page."
read -r -p "Paste your Trello token: " token

if [[ -z "$token" ]]; then
  echo "Token is required." >&2
  exit 1
fi

tmp_file="$(mktemp)"
awk -v key="$api_key" -v token="$token" '
  /^TRELLO_API_KEY=/ { print "TRELLO_API_KEY=" key; next }
  /^TRELLO_TOKEN=/ { print "TRELLO_TOKEN=" token; next }
  { print }
' "$ENV_FILE" > "$tmp_file"
mv "$tmp_file" "$ENV_FILE"

chmod 600 "$ENV_FILE"

echo
echo "Saved credentials to $ENV_FILE (mode 600)."
echo "Next:"
echo "  npm run build"
echo "  TRELLO_PROJECT_ROOT=/path/to/your/project npm run init-project"