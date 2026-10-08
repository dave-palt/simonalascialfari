#!/bin/sh
# (Local) Copies the union of the two archive photo folders into
# sources/photos/ — the ORIGINALS, never published. public/photos holds only
# build-generated webp variants (.thumbs/.full).
# Archive lives at <workspace>/archivio-consegna (sibling of simona-infra);
# override with SIMONA_ARCHIVE if the layout changes.
BASE="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="${SIMONA_ARCHIVE:-$BASE/../../archivio-consegna}"
SRC1="$ARCHIVE/simona-sito-2/public/photos"
SRC2="$ARCHIVE/simona-sito-3/public/photos"
OUT="$BASE/sources/photos"

mkdir -p "$OUT"
for src in "$SRC1" "$SRC2"; do
  [ -d "$src" ] || continue
  find "$src" -mindepth 1 -maxdepth 1 -type d -exec cp -Rn {} "$OUT/" \; 2>/dev/null
  find "$src" -maxdepth 1 -type f \( -name '*.jpg' -o -name '*.png' \) -exec cp -n {} "$OUT/" \;
done
rm -f "$OUT/manifest.json"
echo "Foto sorgente in $OUT:"
ls "$OUT"
