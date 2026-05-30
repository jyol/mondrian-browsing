#!/usr/bin/env bash
# Package the Chrome extension zip for the landing page.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/mondrian-browsing.zip"
STAGE="$(mktemp -d)"
PKG="$STAGE/mondrian-browsing"

mkdir -p "$PKG"

EXTENSION_FILES=(
  manifest.json
  background.js
  content.js
  styles.css
  supabase-client.js
  supabase-config.js
  INSTALL.md
)

for file in "${EXTENSION_FILES[@]}"; do
  cp "$ROOT/$file" "$PKG/"
done

rm -f "$OUT"
(
  cd "$STAGE"
  zip -r "$OUT" mondrian-browsing -x "*.DS_Store"
)

# Keep docs/ in sync for anyone using the old path
if [ -d "$ROOT/docs" ]; then
  cp "$OUT" "$ROOT/docs/mondrian-browsing.zip"
fi

rm -rf "$STAGE"

echo "Created $OUT"
ls -lh "$OUT"
