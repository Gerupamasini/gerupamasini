#!/usr/bin/env bash
# Re-run every experiment used by threejs_audit_a_materials.md
# Prereqs: node >= 22; `npm i puppeteer-core @sparticuz/chromium` in this directory (done once);
#          the unpacked three@0.186.1 package at THREE_ROOT (see harness.mjs).
set -u
cd "$(dirname "$0")"
node dump_defaults.mjs            > dump_defaults.out 2>&1
node chunk_map.mjs                > chunk_map.out 2>&1
for p in e1_transmission e2_gating_pmrem e2b_samplers e3_onbeforecompile_alpha e4_webgpu_fallback e4b_webgpu_counts e5_env_colorspace e6_doublesided_version e7_shadow_patch e8_skin_parity_webgl; do
  timeout 170 node harness.mjs pages/$p.html 2>&1 | grep -v 'GPU stall' > $p.out
  echo "== $p done ($(wc -l < $p.out) lines)"
done
