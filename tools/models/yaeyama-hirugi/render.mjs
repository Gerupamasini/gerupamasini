#!/usr/bin/env node
// Real browser/render validation. Outputs original procedural asset renders, not the reference photographs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2), value = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const out = path.resolve(value('--out', path.join(root, 'tests/smoke/out/hirugi')));
const only = value('--only', null)?.split(',');
const shots = [
  ...Array.from({length:5},(_,base) => ({name:`adult-${base}`,mode:'single',base,seed:317,lod:0})),
  { name:'five',mode:'five',lod:0 }, { name:'roots',mode:'roots',base:4,lod:0 },
  { name:'collision',mode:'roots',base:4,lod:0,collision:true },
  { name:'leaf',mode:'leaf',base:0,lod:0,collision:false }, { name:'saplings',mode:'saplings',lod:0,tide:-0.23 },
  { name:'forest',mode:'forest',lod:'auto',tide:-0.06,collision:false },
  { name:'forest-low',mode:'forest',quality:'low',lod:'auto',tide:-0.06,collision:false },
  { name:'flood',mode:'forest',lod:'auto',tide:0.55,collision:false },
  ...[0,1,2].map(lod => ({name:`lod${lod}`,mode:'single',base:0,lod,tide:-0.06})),
];
fs.mkdirSync(out,{recursive:true});
const port = 5198, url=`http://127.0.0.1:${port}/gerupamasini/reference/yaeyama-hirugi-viewer/index.html?capture`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverLog=''; server.stdout.on('data',c=>serverLog+=c); server.stderr.on('data',c=>serverLog+=c);
let browser;
const errors=[],results=[];
try {
  for(let i=0;;i++) { try { if((await fetch(url)).ok)break; }catch{} if(i>80)throw new Error(`Vite did not start: ${serverLog}`); await new Promise(r=>setTimeout(r,250)); }
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:Number(value('--width',1400)),height:Number(value('--height',900))}}); page.setDefaultTimeout(180000);
  let rejectInit;
  const initFailure=new Promise((_,reject)=>{rejectInit=reject});
  page.on('pageerror',e=>{errors.push(e.message);console.error('pageerror:',e.message);rejectInit(e)});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error('console:',m.text().slice(0,3500))}});
  await page.goto(url); await Promise.race([page.waitForFunction(()=>window.__hirugi),initFailure]);
  for(const shot of shots) {
    if(only && !only.includes(shot.name))continue;
    const start=Date.now(),info=await page.evaluate(s=>window.__hirugi.set({quality:'high',...s,collision:s.collision??false}),shot);
    assert.ok(info.trees>0); assert.ok(info.triangles>0);
    const shaderFailures=await page.evaluate(()=>window.__hirugi.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length); assert.equal(shaderFailures,0,'Shader compilation failed');
    await page.locator('#view').screenshot({path:path.join(out,`${shot.name}.jpg`),type:'jpeg',quality:92});
    results.push({name:shot.name,...info,seconds:(Date.now()-start)/1000}); console.log(JSON.stringify(results.at(-1)));
  }
  const support=await page.evaluate(()=>{
    const roots=window.__hirugi.collision;
    for(const s of roots.segments) {
      if(!s.root || Math.abs(s.b.y-s.a.y)>0.13)continue;
      const x=(s.a.x+s.b.x)*0.5,z=(s.a.z+s.b.z)*0.5,y=Math.max(s.a.y,s.b.y)+Math.max(s.ra,s.rb)+0.1;
      const hit=roots.supportAt(x,z,y);if(hit)return {height:hit.height,normal:hit.normal.toArray(),tree:hit.tree};
    }return null;
  });
  assert.ok(support,'Rendered roots must expose support queries'); assert.ok(support.normal[1]>=0.3);
  // Regression: with the game's 5 cm near plane, a tree >100 m away must retain its dry trunk in the water composite.
  await page.evaluate(async()=>{
    const h=window.__hirugi;await h.set({mode:'single',base:0,seed:317,lod:1,tide:-0.1,cam:[115,5,10],target:[0,1,0],collision:false});
    h.camera.near=0.05;h.camera.far=2500;h.camera.updateProjectionMatrix();h.render();
  });
  const farProbe=await page.evaluate(async()=>{
    const h=window.__hirugi, {worldPoint}=await import('/gerupamasini/src/world/mangrove/index.ts');
    const p=worldPoint(h.kit.skeleton(0).trunk[0].points[1],h.trees[0].spec,false,h.terrain).project(h.camera);
    const gl=h.renderer.getContext(), x=Math.round((p.x*0.5+0.5)*gl.drawingBufferWidth),y=Math.round((p.y*0.5+0.5)*gl.drawingBufferHeight);
    // Use a diagnostic red emissive trunk so the probe cannot accidentally validate an empty/fog pixel.
    // Both reference and test go through the *same* HDR/MSAA/tone-mapping pipeline.
    for(const part of ['Trunk','Branches','Roots'])h.kit.materials[part].emissive.setRGB(2,0,0);h.render();
    const compositeArea=new Uint8Array(5*5*4),bareArea=new Uint8Array(5*5*4);
    gl.readPixels(x-2,y-2,5,5,gl.RGBA,gl.UNSIGNED_BYTE,compositeArea);
    h.water.setLevel(-1000);h.field.render(h.scene,h.camera,h.water);gl.readPixels(x-2,y-2,5,5,gl.RGBA,gl.UNSIGNED_BYTE,bareArea);
    // Pick a fully covered woody pixel in the reference, avoiding an MSAA silhouette/background mixture.
    let best=0;for(let i=4;i<bareArea.length;i+=4)if(bareArea[i]-bareArea[i+1]>bareArea[best]-bareArea[best+1])best=i;
    const composite=compositeArea.slice(best,best+4),bare=bareArea.slice(best,best+4);
    for(const part of ['Trunk','Branches','Roots'])h.kit.materials[part].emissive.setRGB(0,0,0);
    h.render();
    return {composite:Array.from(composite),bare:Array.from(bare),difference:(Math.abs(composite[0]-bare[0])+Math.abs(composite[1]-bare[1])+Math.abs(composite[2]-bare[2]))/3};
  });
  console.log('far-water-probe',JSON.stringify(farProbe));
  assert.ok(farProbe.difference<12,`Water hid the far trunk: ${JSON.stringify(farProbe)}`);
  assert.ok(farProbe.bare[0]>farProbe.bare[1]+30,'The pixel probe must sample the diagnostic trunk');
  // Exercise World.create/update/dispose against the repository's real terrain data. Injected test metadata
  // is held only in this browser; the existing temperate map JSON is never edited.
  const integration=await page.evaluate(async()=>{
    const [{World},{QUALITY_PRESETS}]=await Promise.all([import('/gerupamasini/src/app/World.ts'),import('/gerupamasini/src/core/Settings.ts')]);
    const map=await (await fetch('/gerupamasini/data/maps/hashirimizu.json')).json();
    const station=await (await fetch('/gerupamasini/data/tide/stations/jma_yokosuka.json')).json();
    map.id='hirugi-integration-test';map.mangroves={seed:41,clusters:[{x:-21,z:0,radius:7,count:6}],minGround:-0.5,maxGround:1.3,juvenileFraction:0,minSpacing:2.5};
    const h=window.__hirugi,w=await World.create(map,station,h.renderer,QUALITY_PRESETS.low);
    try {
      const primed=w.mangroves.group.children.length;
      h.camera.position.set(-27,2,8);h.camera.lookAt(-21,1,0);h.camera.updateMatrixWorld();
      w.update(Date.UTC(2026,9,9,3),0.016,h.camera.position,h.camera);
      await h.field.compile(w.scene,h.camera,w.water);
      return {primed,trees:w.mangroves.stats.trees,calls:w.mangroves.stats.calls,segments:w.mangroves.collision.segments.length,tide:w.mangroves.kit.uniforms.uHgWater.value,worldTide:w.tideLevel};
    } finally {w.dispose()}
  });
  assert.ok(integration.primed>0 && integration.trees>0 && integration.calls>0 && integration.segments>0,'World integration did not construct the forest');
  assert.equal(integration.tide,integration.worldTide,'Forest tide must track World');
  console.log('world-integration',JSON.stringify(integration));
  assert.deepEqual(errors,[],'Browser/shader errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status:'passed',results,support,farProbe,integration,errors},null,2));
} finally { await browser?.close(); server.kill(); }
