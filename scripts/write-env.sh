#!/usr/bin/env bash
# Thin wrapper — delegates to the cross-platform Node script.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT_DIR/scripts/write-env.mjs"