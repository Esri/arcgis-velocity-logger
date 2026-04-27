#!/usr/bin/env bash
set -euo pipefail

# Run a repo-wide Markdown link check using npx markdown-link-check
# Excludes image links (png, jpg, svg, etc.) from validation.
# Usage: bash scripts/check-doc-links.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx is required (comes with Node.js)." >&2
  exit 1
fi

TMP_CONFIG="$(mktemp)"
cat > "$TMP_CONFIG" <<'JSON'
{
  "ignorePatterns": [
    { "pattern": "\\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?|heic|heif)$" },
    { "pattern": "^data:image/" }
  ]
}
JSON

cleanup() { rm -f "$TMP_CONFIG"; }
trap cleanup EXIT

echo "Running Markdown link check across all .md files (excluding image links)..."
find . -type f -name "*.md" -not -path "./node_modules/*" -print0 \
  | xargs -0 -I{} bash -lc "npx -y markdown-link-check -q -c '$TMP_CONFIG' '{}'"

echo "All checks completed."
