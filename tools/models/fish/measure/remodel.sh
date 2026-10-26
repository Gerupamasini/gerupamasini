#!/bin/sh
# Render the model's silhouettes (side, and the body alone) of the given species (comma list) and measure them.
W=${FISH_MEASURE:-/tmp/fish-measure}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$HERE/../../../..
mkdir -p "$W/model"
(cd "$ROOT" && node tools/models/fish/render.mjs --mask side --body --only "$1" --out "$W/model" >/dev/null 2>&1)
(cd "$ROOT" && node tools/models/fish/render.mjs --mask side --only "$1" --out "$W/model" >/dev/null 2>&1)
for s in $(echo "$1" | tr ',' ' '); do python3 -I "$HERE/profile.py" "$s" side sidebody >/dev/null; done
