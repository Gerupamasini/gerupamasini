#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const root = new URL('../../', import.meta.url), out = new URL('../../docs/maps/manko/', import.meta.url);
fs.mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5199','--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try {
  const url='http://127.0.0.1:5199/gerupamasini/';
  for(let i=0;;i++) { try {if((await fetch(url)).ok)break;}catch{} if(i>80)throw Error('Vite unavailable');await new Promise(r=>setTimeout(r,250)); }
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(180000);
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message,e.stack?.slice(0,600));});page.on('console',m=>{if(m.type()==='error' && !/net::ERR_|Failed to load resource/.test(m.text()))errors.push(m.text());});
  await page.goto(url);await page.waitForFunction(()=>window.__higata?.mode==='title');
  await page.evaluate(()=>window.__higata.updateSettings({quality:'low'}));
  await page.locator('button.primary').first().click();await page.waitForFunction(()=>window.__higata.mode==='home');
  await page.evaluate(()=>window.__higata.openOverlay('spots'));
  await page.getByRole('button',{name:'沖縄を選ぶ'}).click();
  assert.equal(await page.locator('.spot-regions button').filter({hasText:'沖縄'}).getAttribute('aria-pressed'),'true');
  await page.locator('.spots-detail .name').filter({hasText:'漫湖'}).waitFor();
  await page.screenshot({path:new URL('selection.png',out).pathname,animations:'disabled'});
  await page.locator('.spots-detail button.primary').click();
  await page.waitForFunction(()=>window.__higata.mode==='field' && window.__higata.world?.map.id==='manko');
  await page.evaluate(()=>{const a=window.__higata;a.setDebugTime(Date.UTC(2026,9,10,3));a.setTideOverride(-.25);});
  await page.waitForFunction(()=>window.__higata.world.tideLevel===-.25);
  const info=await page.evaluate(()=>{const a=window.__higata; a.forceSpawn();return {map:a.world.map.id,size:a.world.terrain.size,animals:a.creatures.individuals.length,clams:a.clams,reef:!!a.world.oysters,pits:a.world.pits.length,skyline:a.world.skyline.group.children.length,land:a.world.skyline.land?.group.children.length??0,forest:a.world.mangroves.stats,position:a.player.position.toArray()};});
  assert.equal(info.size,300);assert.equal(info.animals,0);assert.equal(info.clams,null);assert.equal(info.reef,false);assert.equal(info.pits,0);assert.equal(info.skyline,0);assert.equal(info.land,5);assert.ok(info.forest.trees>1000);
  await page.screenshot({path:new URL('field.png',out).pathname});
  // clean views (HUD hidden): the basin from the entry, the lake mouth, the west forest; at low and mid quality
  await page.addStyleTag({content:'body > *:not(canvas):not(#app), #app > *:not(canvas), .hud, .overlay { visibility:hidden !important }'});
  for (const [name,quality,x,z,yaw,pitch] of [['view-entry','high',84,76,-1.0,-0.03],['view-lake','high',60,-20,-1.57,-0.02],['view-basin','high',84,76,0.9,-0.05],['view-west','high',-40,0,1.45,0.02],['view-island','high',4,-6,-0.9,-0.05],['view-centre','high',-50,30,2.23,0.02],['view-entry-low','low',84,76,-1.0,-0.03]]) {
    await page.evaluate(([q,x,z,yaw,pitch])=>{const a=window.__higata;a.updateSettings({quality:q});const p=a.player;p.position.set(x,a.world.terrain.heightAt(x,z)+1.6,z);p.yaw=yaw;p.pitch=pitch;},[quality,x,z,yaw,pitch]);
    await page.waitForTimeout(2500);
    const st=await page.evaluate(()=>{const a=window.__higata;return {...a.world.mangroves.stats,frameCalls:a.renderer?.renderer?.info?.render?.calls,frameTris:a.renderer?.renderer?.info?.render?.triangles};});
    console.log(name, JSON.stringify(st));
    await page.screenshot({path:new URL(`${name}.png`,out).pathname});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('validation.json',out),JSON.stringify({info,errors},null,2));console.log(JSON.stringify(info));
} finally {await browser?.close();server.kill('SIGTERM');}
