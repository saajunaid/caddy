#!/bin/bash
# Installs dependencies at the start of Claude Code cloud sessions so lint, tests and builds work.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile --prefer-offline
fi
