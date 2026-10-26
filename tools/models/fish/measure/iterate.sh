#!/bin/sh
# Fit a species' profile tables to its photographs: N rounds of render → measure → correct.
#   iterate.sh <species> <SPEC CONST> <review indices> <N> [fit.py options: --exT a-b,… --exB … --fullT … --fullB …]
SP=$1; NAME=$2; IDS=$3; N=$4; shift 4
HERE=$(cd "$(dirname "$0")" && pwd)
i=0
while [ "$i" -lt "$N" ]; do
  "$HERE/remodel.sh" "$SP"
  python3 -I "$HERE/aggregate.py" "$SP" "$IDS" side | head -1
  python3 -I "$HERE/fit.py" "$SP" "$NAME" 0.85 --write "$@" | head -2
  i=$((i + 1))
done
"$HERE/remodel.sh" "$SP"
python3 -I "$HERE/aggregate.py" "$SP" "$IDS" side | head -1
