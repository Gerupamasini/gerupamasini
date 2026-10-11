#!/usr/bin/env node
// Build first. Verify real calendar selection, prediction controls and saved tickets on phones and desktop.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4182;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const shots = new URL('../../docs/mobile/screenshots/', import.meta.url);
await mkdir(shots, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* startup */ }
    if (i === 59) throw new Error('Tide preview did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errors = [];
  for (const mobile of [true, false]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    page.on('pageerror', (e) => errors.push(e.message));
    const click = (locator) => mobile ? locator.tap() : locator.click();
    const reachable = async (selector) => {
      const bad = await page.locator(selector).evaluateAll((elements) => elements.flatMap((el) => {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height || el.disabled) return [];
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return r.x < 0 || r.y < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || !el.contains(hit) ? [{ text: el.textContent, rect: r.toJSON(), hit: hit?.className }] : [];
      }));
      if (bad.length) {
        await page.screenshot({ path: new URL('tide-layout-failure.png', shots).pathname });
        console.log(await page.locator('.tide-table').evaluate((el) => [el, ...el.querySelectorAll('.card-head, .ticket-now, .tide-date-nav, .tide-table-layout')].map((node) => ({ class: node.className, rect: node.getBoundingClientRect().toJSON() }))));
      }
      assert.deepEqual(bad, [], selector);
    };
    await page.goto(url); await page.locator('.title-screen').waitFor();
    await click(page.locator('.title-actions .primary'));
    await page.waitForFunction(() => window.__higata.mode === 'home');
    const openTable = () => click(page.locator('.home-nav').getByRole('button', { name: /^潮見表/ }));
    await openTable();
    await page.locator('.tide-table').waitFor();
    const sizes = mobile ? [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }] : [{ width: 1280, height: 720 }];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await reachable('.tide-table button');
      assert.equal(await page.locator('.tide-chart').count(), 1);
      await click(page.locator('.tide-date-select'));
      await page.getByLabel('カレンダーの年月').fill('2026-08');
      assert.equal(await page.locator('.calendar-day').count(), 31);
      await reachable('.tide-calendar-card button, .calendar-month-nav input');
      if (mobile && size.width === 390) await page.screenshot({ path: new URL('tide-calendar.png', shots).pathname });
      await click(page.locator('[data-calendar-date="2026-08-31"]'));
      assert.match(await page.locator('.tide-date-select').innerText(), /2026年8月31日/);
      await reachable('.tide-table button');
      if (mobile && size.width === 390) await page.screenshot({ path: new URL('tide-table.png', shots).pathname });
      if (mobile && size.width === 568) await page.screenshot({ path: new URL('tide-table-landscape.png', shots).pathname });
    }
    // Leap-day in the past and a July date in a future year both produce a selectable tide table.
    for (const date of ['2024-02-29', '2027-07-16']) {
      await click(page.locator('.tide-date-select'));
      await page.getByLabel('カレンダーの年月').fill(date.slice(0, 7));
      await click(page.locator(`[data-calendar-date="${date}"]`));
      const chart = page.locator('.tide-chart');
      await click(chart);
      await page.locator('.tide-confirm').waitFor();
      await reachable('.tide-confirm button');
      assert.match(await page.locator('.confirm-card .when').innerText(), new RegExp(`${date.slice(0, 4)}年`));
      assert.equal(await page.locator('.tide-confirm .primary').isEnabled(), true);
      const previous = await page.evaluate(() => window.__higata.save.ticket.usedCount);
      await click(page.locator('.tide-confirm .primary'));
      await page.waitForFunction(() => window.__higata.mode === 'home');
      const ticket = await page.evaluate(async () => { const a = window.__higata; await a.writeSave(); return { ...a.save.ticket.active, used: a.save.ticket.usedCount }; });
      assert.equal(ticket.used, previous + 1);
      assert.ok(Math.abs(ticket.targetGameMs - Date.now()) > 3 * 86400000);
      assert.equal(new Date(ticket.targetGameMs + 9 * 3600000).toISOString().slice(0, 10), date);
      await openTable();
      assert.match(await page.locator('.tide-date-select').innerText(), new RegExp(`${date.slice(0, 4)}年`));
      if (date === '2024-02-29') for (const size of sizes) {
        await page.setViewportSize(size);
        await reachable('.tide-table button');
      }
      await click(page.getByRole('button', { name: '中断する', exact: true }));
      await page.waitForFunction(() => !window.__higata.clock.ticket);
      await openTable();
    }
    await click(page.locator('.tide-date-select'));
    await page.getByLabel('カレンダーの年月').fill('2027-01');
    await click(page.locator('[data-calendar-date="2027-01-01"]'));
    assert.match(await page.locator('.tide-recommendations h3').innerText(), /2027年7月/);
    assert.equal(await page.locator('.tide-recommendation').count(), 3);
    const lows = await page.locator('.tide-recommendation').evaluateAll((els) => els.map((el) => Number(el.dataset.tideTime)));
    assert.equal(new Set(lows.map((t) => new Date(t + 9 * 3600000).toISOString().slice(0, 10))).size, 3);
    for (const t of lows) {
      const d = new Date(t + 9 * 3600000); assert.equal(d.getUTCFullYear(), 2027); assert.equal(d.getUTCMonth(), 6);
      assert.ok(await page.evaluate((t) => { const m = window.__higata.tide; return m.level(t) < m.level(t - 60000) && m.level(t) < m.level(t + 60000); }, t));
    }
    await click(page.locator('.tide-recommendation').first());
    await page.locator('.tide-confirm').waitFor();
    assert.match(await page.locator('.confirm-card .when').innerText(), /2027年 7\//);
    assert.equal(await page.locator('.tide-confirm .primary').isEnabled(), true);
    console.log(`PASS ${mobile ? 'phone (four sizes)' : 'desktop'}: full six-week calendar, past/future tickets, saved dates, July spring-tide low recommendations`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser?.close(); server.kill(); }
