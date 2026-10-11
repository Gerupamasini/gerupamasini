#!/usr/bin/env node
// Build first. Exercise home clicks and manual camera movement through real pointer and keyboard events.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4180;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* startup */ }
    if (i === 59) throw new Error('Home preview did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.setDefaultTimeout(60000);
  const pose = () => page.evaluate(() => { const a = window.__higata, t = a.tank; return { mode: a.mode, p: t.camera.position.toArray(), q: t.camera.quaternion.toArray(), target: t.controls.target.toArray(), auto: t.controls.autoRotate }; });
  const frames = async (count) => { const f = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction(({ f, count }) => window.__higata.frameCount >= f + count, { f, count }); };
  const near = (a, b) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-8), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  const unchanged = (a, b) => { near(a.p, b.p); near(a.q, b.q); near(a.target, b.target); };
  const keyMove = async (key) => {
    const before = await pose(); await page.keyboard.down(key); await frames(5); await page.keyboard.up(key);
    const after = await pose(); await frames(4); unchanged(after, await pose());
    return { before, after };
  };

  await page.goto(url); await page.waitForFunction(() => !!window.__higata);
  await page.locator('button.primary').first().click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  const initial = await pose(); await frames(12); unchanged(initial, await pose()); assert.equal(initial.auto, false);
  const click = await page.evaluate(() => {
    const a = window.__higata; a.tank.scene.updateMatrixWorld(true); a.tank.camera.updateMatrixWorld(true);
    const p = a.tank.camera.position.clone().set(0, 0.85, 0).project(a.tank.camera), r = a.canvas.getBoundingClientRect();
    window.__homeClicks = 0; window.__homeClickOriginal = a.onHomeClick;
    a.onHomeClick = function(x, y) { window.__homeClicks++; return window.__homeClickOriginal.call(this, x, y); };
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2, hit: a.tank.pick(p.x, p.y)?.kind };
  });
  assert.equal(click.hit, 'tank');
  await page.mouse.click(click.x, click.y); await page.waitForFunction(() => window.__homeClicks === 1); await frames(8);
  assert.equal((await pose()).mode, 'home'); unchanged(initial, await pose());
  await page.evaluate(() => { window.__higata.onHomeClick = window.__homeClickOriginal; });
  console.log('home remains still; tank click does not open editing');

  for (const key of ['ShiftLeft', 'ControlLeft', 'ShiftRight', 'ControlRight']) {
    const { before, after } = await keyMove(key), delta = after.p[1] - before.p[1];
    assert.ok(key.startsWith('Shift') ? delta > 0.01 : delta < -0.01);
    near([before.p[0], before.p[2]], [after.p[0], after.p[2]]); near(before.q, after.q);
    assert.ok(Math.abs(after.target[1] - before.target[1] - delta) < 1e-8);
  }
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('ControlLeft'); let before = await pose();
  await frames(5); unchanged(before, await pose()); await page.keyboard.up('ControlLeft'); await page.keyboard.up('ShiftLeft');
  const moved = await keyMove('KeyW'); near(moved.before.q, moved.after.q); near([moved.before.p[1]], [moved.after.p[1]]);
  assert.ok(Math.hypot(moved.after.p[0] - moved.before.p[0], moved.after.p[2] - moved.before.p[2]) > 0.01);
  const cKey = await keyMove('KeyC'); unchanged(cKey.before, cKey.after);
  console.log('left/right Shift and Ctrl move vertically, preserve the angle, and stop on release; WASD retained');

  await page.evaluate(() => window.__higata.openOverlay('menu')); before = await pose();
  const blocked = await keyMove('ShiftLeft'); unchanged(before, blocked.after);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__higata.mode === 'home');
  before = await pose(); await frames(6); unchanged(before, await pose());
  await page.evaluate(() => window.__higata.tank.resetView());
  before = await pose();
  await page.mouse.move(520, 390); await page.mouse.down(); await page.mouse.move(610, 410, { steps: 6 }); await page.mouse.up();
  const dragged = await pose(); assert.ok(dragged.q.some((v, i) => Math.abs(v - before.q[i]) > 1e-4));
  await frames(8); unchanged(dragged, await pose()); assert.equal(dragged.mode, 'home');
  console.log('menu blocks movement; manual rotation remains available and stops on release');

  await page.getByRole('button', { name: '水槽', exact: true }).click(); await page.waitForFunction(() => window.__higata.mode === 'tankEdit');
  const edited = await keyMove('ShiftLeft'); unchanged(edited.before, edited.after);
  await page.getByLabel('閉じる', { exact: true }).click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  before = await pose(); await frames(8); unchanged(before, await pose()); assert.equal(before.auto, false);
  const lower = await page.evaluate(() => { const t = window.__higata.tank; t.panCamera(0, 0, 100, -1); return t.camera.position.y; });
  assert.ok(lower >= 0.02 - 1e-8);
  const upper = await page.evaluate(() => { const t = window.__higata.tank; t.panCamera(0, 0, 100, 1); return t.camera.position.y; });
  assert.ok(upper <= 2.8 + 1e-8);
  const outside = await page.evaluate(() => {
    const t = window.__higata.tank;
    // Mouse panning can move outside the key limits; vertical keys must still keep their direction.
    t.camera.position.y += 0.5; t.controls.target.y += 0.5; t.controls.update();
    const above = t.camera.position.y; t.panCamera(0, 0, 0.1, 1); const up = t.camera.position.y - above;
    t.camera.position.y -= 4; t.controls.target.y -= 4; t.controls.update();
    const below = t.camera.position.y; t.panCamera(0, 0, 0.1, -1); const down = t.camera.position.y - below;
    return { up, down };
  });
  assert.ok(Math.abs(outside.up) < 1e-8 && Math.abs(outside.down) < 1e-8);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', checks: ['no automatic orbit or breathing', 'tank click stays at home', 'Shift/Ctrl vertical movement with fixed angle', 'left/right modifiers and cancellation', 'no motion after release', 'WASD and mouse rotation', 'menu blocks keys', 'edit button and return', 'vertical room limits', 'no shader/page errors'] }));
} finally { await browser?.close(); server.kill(); }
