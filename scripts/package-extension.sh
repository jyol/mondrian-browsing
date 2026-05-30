#!/usr/bin/env bash
# Package the Chrome extension into docs/mondrian-browsing.zip for the landing page.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/mondrian-browsing.zip"
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

rm -rf "$STAGE"

echo "Created $OUT"
ls -lh "$OUT"
