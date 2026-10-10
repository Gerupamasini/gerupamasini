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
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error' && !/net::ERR_|Failed to load resource/.test(m.text()))errors.push(m.text());});
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
  const info=await page.evaluate(()=>{const a=window.__higata; a.forceSpawn();return {map:a.world.map.id,size:a.world.terrain.size,animals:a.creatures.individuals.length,clams:a.clams,reef:!!a.world.oysters,pits:a.world.pits.length,skyline:a.world.skyline.group.children.length,forest:a.world.mangroves.stats,position:a.player.position.toArray()};});
  assert.equal(info.size,70);assert.equal(info.animals,0);assert.equal(info.clams,null);assert.equal(info.reef,false);assert.equal(info.pits,0);assert.equal(info.skyline,0);assert.ok(info.forest.trees>90);
  // Separate scene settings must reach the forest without changing its root collision or enabling animals.
  await page.evaluate(()=>{window.mankoRoots=window.__higata.world.mangroves.collision.segments;});
  for (const [fieldQuality, vegetation, shadows] of [['high','high',true],['minimum','low',false]]) {
    await page.evaluate(fieldQuality=>window.__higata.updateSettings({homeQuality:'minimum',fieldQuality}),fieldQuality);
    assert.deepEqual(await page.evaluate(()=>{
      const a=window.__higata;
      return {vegetation:a.world.mangroves.quality,shadows:a.world.sky.sunLight.castShadow,
        sameRoots:a.world.mangroves.collision.segments===window.mankoRoots,animals:a.creatures.individuals.length};
    }),{vegetation,shadows,sameRoots:true,animals:0});
  }
  await page.evaluate(()=>window.__higata.updateSettings({homeQuality:'high',fieldQuality:'low'}));
  assert.equal(await page.evaluate(()=>window.__higata.world.mangroves.quality),'low');
  await page.screenshot({path:new URL('field.png',out).pathname});
  await page.close();
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  mobile.setDefaultTimeout(120000);mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(url);await mobile.waitForFunction(()=>window.__higata?.mode==='title');
  await mobile.evaluate(()=>window.__higata.openOverlay('spots'));
  for (const size of [{width:390,height:844},{width:320,height:568},{width:568,height:320},{width:844,height:390}]) {
    await mobile.setViewportSize(size);
    for (const region of ['沖縄','東京湾']) {
      await mobile.locator('.spot-regions').getByRole('button',{name:region,exact:true}).tap();
      const failures=await mobile.locator('.mobile-spots-card button').evaluateAll(buttons=>buttons.flatMap(el=>{
        const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return r.x<0||r.y<0||r.right>innerWidth+1||r.bottom>innerHeight+1||!el.contains(hit)
          ? [{text:el.textContent,rect:r.toJSON(),hit:hit?.className}]:[];
      }));
      assert.deepEqual(failures,[],`${JSON.stringify(size)} ${region}`);
      assert.equal(await mobile.locator('.mobile-spots-card').evaluate(el=>el.scrollHeight>el.clientHeight+1),false);
      assert.equal(await mobile.locator('.spots-maps svg').count(),2);
      assert.equal(await mobile.locator('.mobile-spot').count(),region==='沖縄'?1:2);
    }
  }
  await mobile.close();
  assert.deepEqual(errors,[]);fs.writeFileSync(new URL('validation.json',out),JSON.stringify({info,errors},null,2));console.log(JSON.stringify(info));
} finally {await browser?.close();server.kill('SIGTERM');}
