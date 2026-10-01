# three.js r186.1 audit — reproduction harness

Headless-Chromium (SwiftShader, CPU WebGL2) harness used by `docs/yamame/research/threejs_audit_a_materials.md`.

- `harness.mjs pages/<name>.html` serves a page + the unpacked `three@0.186.1` package, waits for `window.__done`, prints `window.__result`.
- `THREE_ROOT` in `harness.mjs` points at the unpacked npm tarball; change it (`npm pack three@0.186.1 && tar xzf`), then `npm i puppeteer-core @sparticuz/chromium` here.
- `run_all.sh` re-runs every experiment; `outputs/` holds the results captured when the audit was written.
- Results are from a software renderer: they verify API behaviour, not GPU speed.
