#!/usr/bin/env bash
# Package the Chrome extension for the landing page and Chrome Web Store.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_SITE="$ROOT/mondrian-browsing.zip"
OUT_STORE="$ROOT/mondrian-browsing-store.zip"
STAGE="$(mktemp -d)"
PKG="$STAGE/mondrian-browsing"

mkdir -p "$PKG/icons"

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

cp "$ROOT"/icons/icon16.png "$ROOT"/icons/icon32.png "$ROOT"/icons/icon48.png "$ROOT"/icons/icon128.png "$PKG/icons/"

# Landing-page zip: nested folder (users unzip → load that folder)
rm -f "$OUT_SITE"
(
  cd "$STAGE"
  zip -r "$OUT_SITE" mondrian-browsing -x "*.DS_Store"
)

# Web Store zip: manifest.json at the zip root (required by Chrome)
rm -f "$OUT_STORE"
(
  cd "$PKG"
  zip -r "$OUT_STORE" . -x "*.DS_Store"
)

if [ -d "$ROOT/docs" ]; then
  cp "$OUT_SITE" "$ROOT/docs/mondrian-browsing.zip"
fi

rm -rf "$STAGE"

echo "Created site zip:  $OUT_SITE"
ls -lh "$OUT_SITE"
echo
echo "Created store zip: $OUT_STORE  ← upload this to the Chrome Web Store"
ls -lh "$OUT_STORE"
echo
unzip -l "$OUT_STORE"
