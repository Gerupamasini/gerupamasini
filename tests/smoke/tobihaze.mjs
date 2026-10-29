#!/usr/bin/env node
// The トビハゼ in the game: a tank at home (the hero tier with its own materials, the tank's lighting copies), then the
// 葛西 flat at low tide on a June morning (JST): one fish on the mud a step ahead, one a little farther, one far off,
// one in a puddle's shallow water; the near ones in lod1, the far one in lod2, the observed one in the hero tier; the
// 図鑑's preview and the observation case; then a fish going down its burrow and looking out of it. Checks the materials' runtime contract on every model it meets (each
// instance its own copies of the shared materials, one program per role and tier, the blended fins writing depth and
// casting their shadow by coverage, the driver's look read by the materials) and photographs each step, in headless
// Chromium (SwiftShader). Fails on any page error, console error or broken check.
// Build first (npm run build): serves dist with vite preview on 4173, as the other smokes. --dev: the Vite dev server
// instead (no build); --port <n>: another port. Output: tests/smoke/out/tobihaze/*.png and results.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(root, 'tests', 'smoke', 'out', 'tobihaze'));
fs.mkdirSync(outDir, { recursive: true });
const dev = args.includes('--dev');
const PORT = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : 4173);
const BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = `http://localhost:${PORT}${BASE}`;
const SPECIES = 'periophthalmus_modestus';
const server = spawn('npx', dev ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { checks: [], notes: [] };
let code = 0;
/** a check: logged, and a failure fails the run */
function check(name, ok, detail) {
  results.checks.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ''}`);
  if (!ok) code = 1;
}
async function waitFrames(page, n, timeoutMs = 900000) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((target) => (window.__higata?.frameCount ?? 0) >= target, start + n, { timeout: timeoutMs });
}
/** the share of a screenshot's pixels that differ from its median colour by more than 24/255 (is anything drawn?) */
function busy(buf) {
  const png = PNG.sync.read(buf), n = png.width * png.height, step = 7;
  const lum = [];
  for (let i = 0; i < n; i += step) { const k = i * 4; lum.push(0.2126 * png.data[k] + 0.7152 * png.data[k + 1] + 0.0722 * png.data[k + 2]); }
  const med = [...lum].sort((a, b) => a - b)[lum.length >> 1];
  return lum.filter((l) => Math.abs(l - med) > 24).length / lum.length;
}

/**
 * The materials' runtime contract on one model (in the page): its meshes, by the root that was attached. Returns a
 * summary; `prefix` is the cache key's start ('tobihaze-' on the flat and in the case, 'tank-tobihaze-' in the tank).
 */
const inspect = (rootObj, prefix) => {
  const out = { meshes: 0, keys: [], own: 0, fins: 0, finsDepthWrite: 0, finsHashShadow: 0, blended: 0, look: false, wet: null, lookWet: null, flags: null, bad: [] };
  rootObj.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material, x = m?.userData?.tobihaze;
    if (!x) return;
    out.meshes++;
    const key = m.customProgramCacheKey?.() ?? '';
    if (!out.keys.includes(key)) out.keys.push(key);
    if (!key.startsWith(prefix)) out.bad.push(`${o.name}: key ${key}`);
    if (o.userData.tobihazeLook) out.look = true;
    if (x.role === 'fin') {
      out.fins++;
      if (m.transparent) {
        out.blended++;
        if (m.depthWrite) out.finsDepthWrite++; else out.bad.push(`${o.name}: a blended fin without depth writes`);
        if (o.customDepthMaterial?.alphaHash) out.finsHashShadow++; else if (o.castShadow) out.bad.push(`${o.name}: a blended fin casting a solid shadow`);
      }
    }
  });
  return out;
};

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 240) throw new Error(`the ${dev ? 'dev' : 'preview'} server did not start on ${PORT}`);
    await wait(250);
  }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(600000);
  const warnings = [];
  page.on('pageerror', (e) => { console.error('pageerror:', e.message); results.notes.push(`pageerror: ${e.message}`); code = 1; });
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error') {
      if (/net::ERR_|Failed to load resource|Context Lost|Context Restored/.test(text)) return;
      console.error('console:', text.slice(0, 800)); results.notes.push(`console error: ${text.slice(0, 800)}`); code = 1;
    } else if (m.type() === 'warning') warnings.push(text);
  });
  const shot = async (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 180000 });
  // the flat at 低 (SwiftShader); the tank at 中 with the hero materials on (the tank's hero tier)
  await page.evaluate(() => window.__higata.updateSettings({ quality: 'low', homeQuality: 'mid', heroMaterials: true }));
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 180000 });
  const known = await page.evaluate((id) => !!window.__higata.data.species.get(id), SPECIES);
  check('the species is in the manifest', known);
  if (!known) throw new Error(`${SPECIES} is not loaded`);

  // ---------------------------------------------------------------------------------------------------------- tank
  const tank = await page.evaluate(async (sid) => {
    const a = window.__higata, sp = a.data.species.get(sid);
    a.openTankEdit();
    const record = { id: 'tobihaze-smoke-tank', number: 1, speciesId: sid, length_mm: 72, weight_g: 3.3, sex: 'm', stage: 'adult', traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 };
    const second = { ...record, id: 'tobihaze-smoke-tank-2', number: 2, length_mm: 58, weight_g: 1.7, sex: 'f' };
    a.encyclopedia.tankItems.value = [record, second];
    await a.tank.setOccupants([record, second], (id) => a.data.species.get(id));
    const occ = a.tank.occupants.filter((o) => o.species.id === sid);
    return { count: occ.length, files: occ.map((o) => { let f = null; o.root.traverse((m) => { if (m.isMesh && !f) f = m.geometry?.attributes?.position?.count; }); return f; }), stage: sp.stages.map((s) => s.id) };
  }, SPECIES);
  check('two トビハゼ in the tank', tank.count === 2, tank);
  await page.evaluate(() => { const a = window.__higata; a.closeTankEdit(); });
  await page.waitForFunction(() => window.__higata.mode === 'home', null, { timeout: 120000 });
  await page.evaluate(() => { const a = window.__higata; a.tank.setAutoRotate(false); a.tank.frameTank(); });
  await waitFrames(page, 20);
  const tankInfo = await page.evaluate((src) => {
    const inspectFn = new Function(`return (${src})`)();
    const a = window.__higata;
    return a.tank.occupants.filter((o) => o.species.id === 'periophthalmus_modestus').map((o) => ({ hero: !!o.hero, ...inspectFn(o.root, 'tank-tobihaze-') }));
  }, inspect.toString());
  for (const [i, t] of tankInfo.entries()) {
    check(`tank fish ${i}: the tank's lighting copies of its own materials`, t.meshes > 0 && t.bad.length === 0, { keys: t.keys, bad: t.bad });
    check(`tank fish ${i}: blended fins write depth and cast by coverage`, t.blended === t.finsDepthWrite && t.finsDepthWrite > 0, { blended: t.blended, depthWrite: t.finsDepthWrite, hashShadow: t.finsHashShadow });
    check(`tank fish ${i}: no goby hero instance`, !t.hero);
  }
  await shot('tank');

  // ---------------------------------------------------------------------------------------------------------- flat
  await page.evaluate(() => window.__higata.enterField('kasai_west'));
  await page.waitForFunction(() => window.__higata.world && window.__higata.creatures && window.__higata.mode === 'field', null, { timeout: 600000 });
  await waitFrames(page, 4);
  // a June morning (JST), the tide well out; only トビハゼ about (the others hidden), the player at the waterline
  await page.evaluate((sid) => {
    const a = window.__higata;
    a.clock.cancelTicket?.();
    const d = new Date();
    a.setDebugTime(Date.UTC(d.getUTCFullYear(), 5, 12, 0, 30));
    a.setTideOverride(-0.55);
    a.setAllSpeciesShown(false);
    a.setSpeciesShown(sid, true);
    a.teleport('waterline');
  }, SPECIES);
  await waitFrames(page, 8);
  const placed = await page.evaluate((sid) => {
    const a = window.__higata, cs = a.creatures, h = a.world.habitat, terrain = a.world.terrain, p0 = a.player.position;
    const species = a.data.species.get(sid);
    const dry = (x, z, d = -0.02) => h.depthAt(x, z) < d;
    // the shallows: the nearest spot under 1–3 cm of water with dry mud within a metre (the water's edge on a gentle
    // slope or a puddle: the bank at the low-tide waterline is often steep), searched on a 30 cm grid out to 60 m
    let shallow = null, best = Infinity;
    for (let i = -200; i <= 200; i++) for (let j = -200; j <= 200; j++) {
      const r2 = i * i + j * j;
      if (r2 >= best || r2 > 200 * 200) continue;
      const x = p0.x + i * 0.3, z = p0.z + j * 0.3, d = h.depthAt(x, z);
      if (d < 0.01 || d > 0.03) continue;
      let shore = false;
      for (let k = 0; k < 8 && !shore; k++) shore = dry(x + Math.sin(k * 0.785) * 0.9, z + Math.cos(k * 0.785) * 0.9);
      if (shore) { shallow = { x, z }; best = r2; }
    }
    // the player 1.3 m from the shallow spot on dry mud, facing it (or where they stand)
    let px = p0.x, pz = p0.z;
    if (shallow) {
      for (let k = 0; k < 16; k++) {
        const ang = (k * Math.PI) / 8, x = shallow.x + Math.sin(ang) * 1.3, z = shallow.z + Math.cos(ang) * 1.3;
        if (dry(x, z, -0.05) && dry((x + shallow.x) / 2 + Math.cos(ang) * 0.4, (z + shallow.z) / 2 - Math.sin(ang) * 0.4)) { px = x; pz = z; break; }
      }
      a.player.setPose(px, pz, Math.atan2(-(shallow.x - px), -(shallow.z - pz)));
    }
    // the fish on the mud: dry spots at a distance from the player, the nearest bearing to straight ahead
    const f = a.player.forward;
    const head = Math.atan2(f.x, f.z);
    const onMud = (dist, prefer) => {
      for (let k = 0; k < 72; k++) {
        const off = ((k + 1) >> 1) * (k % 2 ? 1 : -1) * (Math.PI / 36);
        const ang = head + prefer + off, x = px + Math.sin(ang) * dist, z = pz + Math.cos(ang) * dist;
        if (dry(x, z, -0.03)) return { x, z };
      }
      return { x: px + f.x * dist, z: pz + f.z * dist };
    };
    const spots = [
      { name: 'near', ...onMud(0.9, 0.5) },
      { name: 'mid', ...onMud(1.6, -0.6) },
      { name: 'far', ...onMud(16, 0.25) },
    ];
    if (shallow) spots.push({ name: 'shallow', x: shallow.x, z: shallow.z });
    const out = [];
    spots.forEach((s, i) => {
      const ind = cs.spawner.create({ species, ruleIndex: 0, cell: 0, seed: 7100 + i * 31, x: s.x, z: s.z, lengthRange: [66, 74] }, Date.now());
      cs.spawn(ind);
      out.push({ name: s.name, id: ind.id, depth: +h.depthAt(s.x, s.z).toFixed(3), ground: +terrain.heightAt(s.x, s.z).toFixed(3) });
    });
    return { out, shallowFound: !!shallow, tide: +a.world.tideLevel.toFixed(3) };
  }, SPECIES);
  console.log('placed', JSON.stringify(placed));
  results.placed = placed;
  check('a shallow spot (1–3 cm of water) near the waterline', placed.shallowFound, placed.tide);
  const byName = Object.fromEntries(placed.out.map((p) => [p.name, p.id]));
  // the uniforms at every draw against the look the driver hung (material.ts syncs them in the meshes' onBeforeRender,
  // so a fish that is not drawn — culled, or down its burrow — keeps the last drawn ones): each トビハゼ mesh's
  // onBeforeRender wrapped, the worst difference over its draws kept by fish (installed again on a new tier's meshes)
  const probe = () => page.evaluate((ids) => {
    const a = window.__higata, P = (window.__tbProbe ??= {});
    const c = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d);
    for (const [name, id] of Object.entries(ids)) {
      const v = a.creatures.entries.get(id)?.view;
      if (!v) continue;
      const tier = v.tier;
      v.root.traverse((o) => {
        if (!o.isMesh || !o.material?.tobihazeUniforms || o.__tbProbe) return;
        o.__tbProbe = true;
        const prev = o.onBeforeRender;
        o.onBeforeRender = function (...args) {
          prev.apply(this, args);
          const U = this.material.tobihazeUniforms, L = this.userData.tobihazeLook, s = U.uTbState.value;
          const r = (P[name] ??= { draws: 0, worst: 0, tiers: [], looks: 0 });
          r.draws++;
          if (!r.tiers.includes(tier)) r.tiers.push(tier);
          if (!L) return;
          r.looks++;
          const want = [c(L.wet, s.x), c(L.mud, 0), c(L.bars, 0), c(L.dark, 0)];
          r.worst = Math.max(r.worst, Math.abs(s.x - want[0]), Math.abs(s.y - want[1]), Math.abs(s.z - want[2]), Math.abs(s.w - want[3]));
        };
      });
    }
    return P;
  }, byName);
  // stand still, crouched (no alarm), looking a little down (the near ones and the far one in view), let the tiers settle
  await page.evaluate(() => { const a = window.__higata; a.player.lowView = true; a.player.pitch = -0.2; });
  await waitFrames(page, 30);
  await probe();
  await waitFrames(page, 8);
  await probe();
  const views = async () => page.evaluate(([ids, src]) => {
    const a = window.__higata, cs = a.creatures, inspectFn = new Function(`return (${src})`)();
    const out = {};
    for (const [name, id] of Object.entries(ids)) {
      const e = cs.entries.get(id);
      if (!e) { out[name] = { gone: true }; continue; }
      const v = e.view;
      const info = v ? inspectFn(v.root, 'tobihaze-') : null;
      // the instance's uniforms (material.ts: every per-instance material carries them) against the driver's look
      let U = null, look = null, body = null;
      v?.root.traverse((o) => { if (o.isMesh && o.material?.tobihazeUniforms && !U) { U = o.material.tobihazeUniforms; look = o.userData.tobihazeLook ?? null; } if (o.isMesh && o.material?.userData?.tobihaze?.role === 'body' && !body) body = o.material; });
      out[name] = {
        tier: v?.tier ?? null, dist: +e.ind.pos.distanceTo(a.camera.position).toFixed(2), label: e.driver.debugLabel?.() ?? null, hero: !!v?.hero,
        ...(info ?? {}),
        state: U ? U.uTbState.value.toArray().map((x) => +x.toFixed(3)) : null,
        flags: U ? U.uTbFlags.value.toArray().map((x) => +x.toFixed(3)) : null,
        look: look ? { wet: look.wet, mud: look.mud, bars: look.bars, dark: look.dark, submerged: look.submerged, waterY: look.waterY, id: look.id } : null,
        bodyMaterial: body ? body.uuid : null,
      };
    }
    return out;
  }, [byName, inspect.toString()]);
  let V = await views();
  console.log('views', JSON.stringify(V));
  results.views = V;
  check('the near fish in lod1', V.near?.tier === 'lod1', { tier: V.near?.tier, dist: V.near?.dist });
  check('the far fish in lod2', V.far?.tier === 'lod2', { tier: V.far?.tier, dist: V.far?.dist });
  for (const [name, v] of Object.entries(V)) {
    if (v.gone || !v.tier) continue;
    check(`${name} (${v.tier}): its materials follow the contract`, v.meshes > 0 && v.bad.length === 0, { keys: v.keys, bad: v.bad });
    check(`${name} (${v.tier}): the driver hangs its look on the meshes`, v.look !== null, v.look);
  }
  check('two fish never share a material (their uniforms are their own)', !V.near?.bodyMaterial || V.near.bodyMaterial !== V.mid?.bodyMaterial);
  check('one program per role and tier (the near fish share their cache keys)', !V.near?.keys || !V.mid?.keys || V.near.tier !== V.mid.tier || JSON.stringify([...V.near.keys].sort()) === JSON.stringify([...V.mid.keys].sort()));
  if (V.shallow?.look && V.shallow.look.waterY === undefined) results.notes.push('the driver gives no waterY: the film is not cut at the waterline in the shallows (material.ts TobiLookState.waterY)');

  // the near ones, crouched a step back
  const look = (id, dist, pitch) => page.evaluate(([id, dist, pitch]) => {
    const a = window.__higata, d = a.creatures.driverOf(id);
    const c = d.anchor().clone(), p = a.player.position;
    const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
    const px = c.x + (dx / l) * dist, pz = c.z + (dz / l) * dist;
    a.player.setPose(px, pz, Math.atan2(-(c.x - px), -(c.z - pz)));
    a.player.lowView = true;
    a.player.pitch = pitch;
    return d.debugLabel?.() ?? '';
  }, [id, dist, pitch]);
  await look(byName.near, 0.7, -0.55);
  await waitFrames(page, 12);
  const near = await shot('field-near-lod1');
  check('the near view draws something', busy(near) > 0.02);
  if (byName.shallow) {
    console.log('shallow', await look(byName.shallow, 0.6, -0.35));
    await waitFrames(page, 6);
    await probe();
    await waitFrames(page, 6);
    await shot('field-shallow');
    V = await views();
    results.shallow = V.shallow;
    check('the fish in the shallows: blended fins write depth (the water composite reads them)', (V.shallow?.blended ?? 0) === (V.shallow?.finsDepthWrite ?? -1), V.shallow && { blended: V.shallow.blended, depthWrite: V.shallow.finsDepthWrite, tier: V.shallow.tier, label: V.shallow.label, flags: V.shallow.flags });
  }
  // the far one: stand where it is 16 m off and look at it
  await look(byName.far, 15, -0.08);
  await waitFrames(page, 8);
  await probe();
  await waitFrames(page, 8);
  await shot('field-far-lod2');
  V = await views();
  check('the far fish in lod2 at 15 m', V.far?.tier === 'lod2', { tier: V.far?.tier, dist: V.far?.dist });
  // the uniforms at every draw were the fish's look (wet, mud, bars, dark), on each tier drawn
  const P = await probe();
  results.draws = P;
  for (const [name, r] of Object.entries(P)) {
    if (r.looks) check(`${name} (${r.tiers.join(', ')}): at every draw the uniforms are its look`, r.worst < 1e-6, r);
  }
  for (const name of Object.keys(byName)) if (!P[name]?.looks) results.notes.push(`${name}: not drawn with a look while probed (culled or down its burrow)`);
  const tiersDrawn = Object.values(P).filter((r) => r.looks).flatMap((r) => r.tiers);
  check('the look reached the uniforms on lod1 and lod2', tiersDrawn.includes('lod1') && tiersDrawn.includes('lod2'), tiersDrawn);

  // ------------------------------------------------------------------------------------------------- observation
  // (one that is out on the mud, not down its burrow: the near one, else the next)
  const obsName = await page.evaluate((ids) => {
    const cs = window.__higata.creatures;
    return ['near', 'mid', 'shallow', 'far'].find((n) => ids[n] && cs.entries.get(ids[n])?.view?.root.visible) ?? 'near';
  }, byName);
  const obsId = byName[obsName];
  await look(obsId, 1.2, -0.5);
  await waitFrames(page, 6);
  await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, obsId);
  await page.waitForFunction((id) => window.__higata.creatures.entries.get(id)?.view?.tier === 'hero', obsId, { timeout: 600000 }).catch(() => undefined);
  await waitFrames(page, 16);
  V = await views();
  const O = V[obsName];
  results.observed = { name: obsName, ...O };
  check(`the observed fish (${obsName}) in the hero tier`, O?.tier === 'hero', { tier: O?.tier, label: O?.label });
  check('the observed fish: no goby hero instance (its own materials)', O?.hero === false);
  await shot('observe-hero');
  await page.evaluate(() => { const o = window.__higata.observation; for (let i = 0; i < 6; i++) o.nudge(-1); o.zoom = true; });
  await waitFrames(page, 16);
  const close = await shot('observe-hero-close');
  check('the close observation draws something', busy(close) > 0.05);
  check('no "[hero] falling back" warning for トビハゼ', !warnings.some((w) => /\[hero\] falling back/.test(w)), warnings.filter((w) => /hero/.test(w)).slice(0, 3));
  await page.evaluate(() => window.__higata.exitObserve());
  await waitFrames(page, 4);

  // -------------------------------------------------------------------------------------------------------- 図鑑
  await page.evaluate(() => window.__higata.openOverlay('zukan'));
  await page.waitForSelector('.zukan-list', { timeout: 60000 });
  const ja = await page.evaluate((id) => window.__higata.data.species.get(id).names.ja, SPECIES);
  await page.locator('.zukan-item', { hasText: ja }).first().click();
  await page.waitForSelector('canvas.zukan-preview', { timeout: 60000 }).catch(() => undefined);
  // (the hero GLB and its programs: SwiftShader takes a while)
  await page.waitForFunction(() => !document.querySelector('.zukan-detail [role=status]'), null, { timeout: 600000 }).catch(() => undefined);
  await wait(3000);
  const err = await page.evaluate(() => !!document.querySelector('.preview-error'));
  check('the 図鑑 preview loads', !err);
  const canvas = page.locator('canvas.zukan-preview');
  if (await canvas.count()) {
    const z = await canvas.first().screenshot({ path: path.join(outDir, 'zukan-preview.png') });
    check('the 図鑑 preview draws the fish', busy(z) > 0.01);
  } else check('the 図鑑 preview canvas', false);
  await shot('zukan');
  await page.evaluate(() => window.__higata.closeOverlay());
  await waitFrames(page, 4);

  // ---------------------------------------------------------------------------------------------- observation case
  await page.evaluate((sid) => {
    const a = window.__higata;
    a.encyclopedia.caseItems.value = [{ id: 'tobihaze-smoke-case', number: 3, speciesId: sid, length_mm: 68, weight_g: 2.6, sex: 'f', stage: 'adult', traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 }];
    a.openCase();
  }, SPECIES);
  await waitFrames(page, 24);
  const caseInfo = await page.evaluate((src) => {
    const a = window.__higata, inspectFn = new Function(`return (${src})`)();
    return (a.fieldCase?.occupants ?? []).filter((o) => o.record.speciesId === 'periophthalmus_modestus').map((o) => inspectFn(o.root, 'tobihaze-'));
  }, inspect.toString());
  check('the case holds the トビハゼ with its own materials', caseInfo.length === 1 && caseInfo[0].meshes > 0 && caseInfo[0].bad.length === 0, caseInfo[0] && { keys: caseInfo[0].keys, bad: caseInfo[0].bad });
  await shot('case');
  await page.evaluate(() => window.__higata.closeCase());
  await waitFrames(page, 2);

  // ------------------------------------------------------------------------------------------------------ the burrow
  // A fish by its own burrow on the low-tide mud (burrows.ts lays the spot's out, burrowLayer.ts draws them): the
  // opening drawn on the mud where the behaviour has it; the fish sent down it (head first), hidden right under the
  // opening, then looking out of it; the encyclopedia's 'burrow' heard by the observation. Photographed close.
  const burrowFish = await page.evaluate((ids) => {
    const a = window.__higata, cs = a.creatures, terrain = a.world.terrain, h = a.world.habitat;
    const MUD = ['mud', 'muddy_sand', 'channel'];
    const layer = cs.group.children.find((o) => o.name === 'TobihazeBurrows');
    const out = { layer: !!layer, fish: null, holes: [], drawn: 0, misplaced: [] };
    const m = new (layer?.matrix.constructor ?? Object)();
    for (const name of ['mid', 'near', 'shallow', 'far']) {
      const id = ids[name], d = id && cs.driverOf(id), b = d?.behaviour;
      if (!b) continue;
      for (const k of b.burrows) {
        const ground = terrain.heightAt(k.x, k.z);
        const hole = { name, kind: k.kind, x: +k.x.toFixed(4), z: +k.z.toFixed(4), r: k.r, sub: terrain.substrateAt(k.x, k.z), depth: +h.depthAt(k.x, k.z).toFixed(3), ground: +ground.toFixed(4), drawnY: null };
        // its opening among the layer's instances: the quad's middle on the hole, on the ground
        if (layer) for (let i = 0; i < layer.count; i++) {
          layer.getMatrixAt(i, m);
          const e = m.elements;
          if (e[5] === 0 && e[4] === 0 && e[6] === 0) continue;
          if (Math.hypot(e[12] - k.x, e[14] - k.z) < 0.003) { hole.drawnY = +e[13].toFixed(4); break; }
        }
        if (hole.drawnY !== null) out.drawn++;
        if (!MUD.includes(hole.sub) || hole.drawnY === null || Math.abs(hole.drawnY - ground) > 0.01) out.misplaced.push(hole);
        out.holes.push(hole);
      }
      if (!out.fish) { const own = b.burrows.find((k) => k.kind === 'own' && h.depthAt(k.x, k.z) < -0.02); if (own) out.fish = { name, id, hole: { x: own.x, z: own.z, r: own.r } }; }
    }
    return out;
  }, byName);
  console.log('burrows', JSON.stringify(burrowFish));
  results.burrows = burrowFish;
  check('the burrows are drawn (one instanced layer)', burrowFish.layer && burrowFish.drawn > 0, { drawn: burrowFish.drawn, holes: burrowFish.holes.length });
  check('every burrow on mud, drawn at its place on the ground', burrowFish.holes.length > 0 && burrowFish.misplaced.length === 0, burrowFish.misplaced.slice(0, 4));
  check('a fish with its own burrow on the exposed mud', !!burrowFish.fish);
  if (burrowFish.fish) {
    const bid = burrowFish.fish.id;
    let hole = burrowFish.fish.hole;
    // the fish 12 cm from its hole facing it, the player crouched a little way off; observed, the camera on the hole
    await page.evaluate(([id, hole]) => {
      const a = window.__higata, d = a.creatures.driverOf(id), ind = a.creatures.get(id);
      const ang = 2.2, fx = hole.x - Math.sin(ang) * 0.12, fz = hole.z - Math.cos(ang) * 0.12;
      d.holdAt(fx, fz, ang);
      // (its brain held: what it does from here is what this step tells it)
      ind.brain.done = false; ind.brain.busyUntil = Infinity;
      d.setIntent({ id: 99000, kind: 'rest', urgency: 0, seconds: 600 });
      const px = hole.x + Math.sin(ang + 1.9) * 1.2, pz = hole.z + Math.cos(ang + 1.9) * 1.2;
      a.player.setPose(px, pz, Math.atan2(-(hole.x - px), -(hole.z - pz)));
      a.player.lowView = true;
      a.player.pitch = -0.45;
      a.enterObserve(ind);
    }, [bid, hole]);
    await waitFrames(page, 6);
    /** the observation's camera on the hole: dist (m) off, elev (rad) up, from azimuth az */
    const aim = (dist, elev, az) => page.evaluate(([hole, dist, elev, az]) => {
      const a = window.__higata, o = a.observation, c = o.controls, y = a.world.terrain.heightAt(hole.x, hole.z);
      if (!c) return false;
      o.zoom = false;
      c.target.set(hole.x, y, hole.z);
      a.camera.position.set(hole.x + Math.sin(az) * Math.cos(elev) * dist, y + Math.sin(elev) * dist, hole.z + Math.cos(az) * Math.cos(elev) * dist);
      c.update();
      return true;
    }, [hole, dist, elev, az]);
    const label = () => page.evaluate((id) => window.__higata.creatures.driverOf(id).debugLabel(), bid);
    await aim(0.3, 0.75, 4.1);
    await waitFrames(page, 10);
    await aim(0.3, 0.75, 4.1);
    await waitFrames(page, 2);
    await shot('burrow-before');
    await aim(0.13, 0.95, 4.1);
    await waitFrames(page, 4);
    await shot('burrow-close');
    // down it, in slow motion (the head-first dive is under a second)
    await page.evaluate((id) => { const a = window.__higata; a.observation.setSpeedIndex(0); a.creatures.driverOf(id).setIntent({ id: 99001, kind: 'burrow', urgency: 0.3, seconds: 12 }); }, bid);
    await aim(0.3, 0.75, 4.1);
    let entered = false, hiddenOk = null;
    for (let i = 0; i < 400; i++) {
      await waitFrames(page, 1);
      const l = await label();
      if (!entered && /BURROW\/enter/.test(l)) { entered = true; await shot('burrow-enter'); }
      if (/\(穴\)/.test(l)) {
        // (its own burrow's either opening, whichever was nearer: the one it went down from here on)
        hiddenOk = await page.evaluate((id) => {
          const a = window.__higata, ind = a.creatures.get(id), b = a.creatures.driverOf(id).behaviour;
          let h = b.burrows[0];
          for (const k of b.burrows) if (Math.hypot(k.x - ind.pos.x, k.z - ind.pos.z) < Math.hypot(h.x - ind.pos.x, h.z - ind.pos.z)) h = k;
          return { kind: h.kind, hole: { x: h.x, z: h.z, r: h.r }, dx: +(ind.pos.x - h.x).toFixed(5), dz: +(ind.pos.z - h.z).toFixed(5), under: ind.pos.y < a.world.terrain.heightAt(h.x, h.z) };
        }, bid);
        hole = hiddenOk.hole;
        break;
      }
    }
    check('the fish went down its burrow (seen entering)', entered && hiddenOk !== null, { entered, hiddenOk });
    check('down the burrow, right under the opening', !!hiddenOk && Math.hypot(hiddenOk.dx, hiddenOk.dz) < 0.002 && hiddenOk.under, hiddenOk);
    await page.evaluate(() => window.__higata.observation.setSpeedIndex(3));
    await aim(0.3, 0.75, 4.1);
    await waitFrames(page, 3);
    await shot('burrow-hidden');
    // out it looks (3–30 s of the game, quicker at the fast speed)
    let peek = null;
    for (let i = 0; i < (hiddenOk ? 900 : 0) && !peek; i++) {
      await waitFrames(page, 2);
      const l = await label();
      if (/BURROW\/peek/.test(l)) {
        await page.evaluate(() => window.__higata.observation.setSpeedIndex(0));
        peek = await page.evaluate(([id, hole]) => { const a = window.__higata, d = a.creatures.driverOf(id), c = d.anchor(); return { head: [+(c.x - hole.x).toFixed(4), +(c.y - a.world.terrain.heightAt(hole.x, hole.z)).toFixed(4), +(c.z - hole.z).toFixed(4)] }; }, [bid, hole]);
      }
    }
    check('the fish looks out of its burrow', !!peek, peek);
    if (peek) {
      await aim(0.3, 0.6, 4.1);
      await waitFrames(page, 3);
      await shot('burrow-peek');
      await aim(0.14, 0.5, 4.1);
      await waitFrames(page, 3);
      await shot('burrow-peek-close');
      check('its head out of the opening (within 3 cm of the middle, above the mud)', Math.hypot(peek.head[0], peek.head[2]) < 0.03 && peek.head[1] > 0, peek);
    }
    const recorded = await page.evaluate(() => window.__higata.observation.state.value?.recorded ?? []);
    check('the observation recorded the burrow', recorded.includes('burrow'), recorded);
    await page.evaluate((id) => { const a = window.__higata, ind = a.creatures.get(id); if (ind) { ind.brain.busyUntil = 0; ind.brain.done = true; } a.observation.setSpeedIndex(2); a.exitObserve(); }, bid);
    await waitFrames(page, 2);
  }
  await browser.close();
} catch (e) {
  console.error(e);
  results.notes.push(String(e?.stack ?? e));
  code = 1;
} finally {
  server.kill();
  results.passed = code === 0;
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
}
process.exit(code);
