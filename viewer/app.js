// Demo application: manual locomotion modes (05 §5.3) and autonomous behaviour (04) on one scene. Used by viewer/index.html and by the packed single-file build.
import { createScene, presetCamera } from './scene.js';
import { MODES } from '../src/yamame/modes.js';
import { World } from '../src/behavior/world.js';
import { YamameAgent } from '../src/behavior/agent.js';
import { explain } from '../src/behavior/trace.js';
import { CFG } from '../src/behavior/config.js';

export async function start({ glb = '/assets/generated/yamame.glb', glbBytes = null, root = document.body } = {}) {
  const q = new URLSearchParams(location.search);
  const rock = { x: -0.9, z: 0.55, r: 0.15 };
  const S = await createScene({ q, glb, glbBytes, rock }); const { r, scene, cam, ctl, fish, THREE } = S;
  const st = { ai: q.get('ai') === '1', mode: q.get('mode') || 'Idle', follow: q.get('follow') !== '0', slow: parseFloat(q.get('slow') || '1') };
  const hideDwell = parseFloat(q.get('hide') || '20');       // demo override of hide_dwell_s (spec default 60 s), shown as an E value in the trace
  const cfg = { ...CFG, hide_dwell_s: { ...CFG.hide_dwell_s, v: hideDwell } };
  const seed = parseInt(q.get('seed') || '3');
  const world = new World({ seed, rock, u_mean: parseFloat(q.get('u') || '0.25'), drift_rate: parseFloat(q.get('drift') || '0.12'), area: { zmax: 0.35, ymin: -0.03, ymax: 0.10 } });
  let agent = null;
  const preyGeo = new THREE.SphereGeometry(0.0028, 10, 8), preyMat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.6 }), preyMeshes = new Map();
  const threatMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.9, 6, 12), new THREE.MeshBasicMaterial({ color: 0x07110f, transparent: true, opacity: 0.85 })); threatMesh.visible = false; scene.add(threatMesh);

  const css = document.createElement('style'); css.textContent = `
  .yp{position:fixed;background:#0c1a21d9;border:1px solid #2c4a57;border-radius:8px;padding:8px 10px;backdrop-filter:blur(4px);color:#d6e8ee;font:13px/1.4 system-ui,sans-serif}
  .yp button,.yp select{background:#1b3844;color:#d6e8ee;border:1px solid #356273;border-radius:5px;padding:3px 8px;margin:2px;cursor:pointer;font:inherit}
  .yp button.on{background:#69c0d8;color:#04161d}
  #yui{left:8px;top:calc(8px + env(safe-area-inset-top,0px));max-width:calc(100vw - 16px)} #yhud{right:8px;top:calc(8px + env(safe-area-inset-top,0px));font:11px/1.35 ui-monospace,monospace;white-space:pre}
  #ytr{right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));width:min(520px,calc(100vw - 16px));max-height:42vh;overflow:auto;font:11px/1.35 ui-monospace,monospace;white-space:pre-wrap} #ytr .e{border-top:1px solid #2c4a57;padding-top:3px;margin-top:3px} #ytr .e:first-child{border-top:0;margin-top:0;padding-top:0}
  @media (max-width:700px){#yhud{display:none}}`;
  document.head.appendChild(css);
  const ui = Object.assign(document.createElement('div'), { id: 'yui', className: 'yp' }), hud = Object.assign(document.createElement('div'), { id: 'yhud', className: 'yp' }), tr = Object.assign(document.createElement('div'), { id: 'ytr', className: 'yp' });
  root.append(ui, hud, tr);
  const btn = (txt, fn, parent = ui) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = fn; parent.appendChild(b); return b; };
  const row = () => { const d = document.createElement('div'); ui.appendChild(d); return d; };
  const head = row(); head.innerHTML = '<b>ヤマメ (Oncorhynchus masou masou)</b> ';
  const bManual = btn('手動: 遊泳モード', () => setAI(false), head), bAI = btn('自律行動 (04 章)', () => setAI(true), head);
  const manualRow = row(), aiRow = row(), commonRow = row(); const modeBtns = {};
  for (const k of Object.keys(MODES)) modeBtns[k] = btn(MODES[k].label, () => setMode(k), manualRow);
  btn('摂餌ストライク', () => fish.triggerStrike(0.12 / st.slow), manualRow); btn('C-start ←', () => fish.triggerEscape(1), manualRow); btn('C-start →', () => fish.triggerEscape(-1), manualRow);
  btn('脅威が歩いて接近 (1 m/s)', () => world.addThreat({ pos: [5.2, 0.45, 0.25], vel: [-1.0, 0, 0], size: 1, shadow: true, expire: world.t + 14 }), aiRow);
  btn('頭上を影が通過 (3 m/s)', () => world.addThreat({ pos: [3.2, 0.7, 0.1], vel: [-3.0, 0, 0], size: 0.8, shadow: true, expire: world.t + 3 }), aiRow);
  btn('餌を 1 個流す', () => world.prey.push({ id: 'pr_u' + Math.random().toString(36).slice(2, 6), x: 1.2, z: (Math.random() - 0.5) * 0.2, y: 0.03 + Math.random() * 0.05, size_BL: 0.025, terrestrial: false, alive: true, wob: 0 }), aiRow);
  const lodSel = document.createElement('select'); ['auto', '0', '1', '2'].forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = 'LOD ' + v; lodSel.appendChild(o); }); lodSel.value = q.get('lod') || 'auto';
  lodSel.onchange = () => fish.setLOD(lodSel.value === 'auto' ? null : +lodSel.value); commonRow.appendChild(lodSel);
  const lab = (txt, el) => { const l = document.createElement('label'); l.textContent = ' ' + txt + ' '; l.appendChild(el); commonRow.appendChild(l); };
  const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: st.follow }); cb.onchange = () => { st.follow = cb.checked; }; lab('追従', cb);
  const sl = Object.assign(document.createElement('input'), { type: 'range', min: 0.1, max: 3, step: 0.1, value: st.slow }); sl.oninput = () => { st.slow = +sl.value; }; lab('時間倍率', sl);
  const morphSel = document.createElement('select'); morphSel.innerHTML = '<option value="">モーフ…</option>' + ['mt_body_depth', 'mt_belly', 'mt_peduncle', 'mt_buccal_swell', 'mt_branchiostegal'].map((m) => `<option>${m}</option>`).join('');
  const morphVal = Object.assign(document.createElement('input'), { type: 'range', min: -1, max: 1, step: 0.05, value: 0 });
  morphSel.onchange = () => { morphVal.value = 0; }; morphVal.oninput = () => { if (morphSel.value) fish.setMorph(morphSel.value, +morphVal.value); }; commonRow.appendChild(morphSel); commonRow.appendChild(morphVal);

  function setMode(k) { st.mode = k; for (const n in modeBtns) modeBtns[n].classList.toggle('on', n === k); }
  function setAI(on) {
    st.ai = on; bManual.classList.toggle('on', !on); bAI.classList.toggle('on', on); manualRow.style.display = on ? 'none' : ''; aiRow.style.display = on ? '' : 'none'; tr.style.display = on ? '' : 'none';
    if (on && !agent) agent = new YamameAgent({ body: fish, world, cfg, seed });
    if (on) { fish.pos.set(agent.focal.x, agent.heightFor('hold'), agent.focal.z); fish.heading = 0; fish.pitch = 0; }
    if (!on) { fish.pos.y = 0; fish.pitch = 0; }
  }
  setMode(st.mode); setAI(st.ai); fish.wave.settle(st.ai ? 1.2 : MODES[st.mode].U_bl);

  function step(dt) {
    if (st.ai) { agent.update(dt); return; }
    const intent = { mode: MODES[st.mode] }; const d = Math.hypot(fish.pos.x, fish.pos.z);
    if (q.get('wander') !== '0' && MODES[st.mode].flow_bl === 0 && d > 0.9) { const want = Math.atan2(fish.pos.z, -fish.pos.x), diff = Math.atan2(Math.sin(want - fish.heading), Math.cos(want - fish.heading)); intent.turn = Math.max(-0.9, Math.min(0.9, diff * 1.5)); }
    fish.update(dt, intent);
  }
  function sync() {
    const live = new Set();
    if (st.ai) {
      for (const p of world.prey) { live.add(p.id); let m = preyMeshes.get(p.id); if (!m) { m = new THREE.Mesh(preyGeo, preyMat); m.scale.set(1.8, 1, 1); preyMeshes.set(p.id, m); scene.add(m); } m.position.set(p.x, p.y, p.z); m.rotation.z = Math.sin(p.wob) * 0.5; }
      const th = world.threats[0]; threatMesh.visible = !!th; if (th) threatMesh.position.set(th.pos[0], th.pos[1] + 0.2, th.pos[2]);
      hud.textContent = `state  ${agent.state}   t ${agent.sim.toFixed(0)} s\nneeds  F ${(agent.needs.F * 100).toFixed(0)}%  H ${(agent.needs.H * 100).toFixed(0)}%\nstrikes ${agent.stats.strikes} eaten ${agent.stats.eaten} rejected ${agent.stats.rejected} missed ${agent.stats.missed} flees ${agent.stats.flees}\nflow ${(agent.uLocal() * 100).toFixed(0)} cm/s  hide_dwell ${hideDwell}s (demo; spec 60 s)`;
      if (tr.dataset.n !== String(agent.trace.entries.length)) { tr.innerHTML = agent.trace.last(4).reverse().map((e) => `<div class="e">${explain(e).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join(''); tr.dataset.n = agent.trace.entries.length; }
    } else {
      threatMesh.visible = false; hud.textContent = `mode ${st.mode}\nU ${fish.wave.U.toFixed(2)} BL/s  f ${fish.wave.f.toFixed(2)} Hz  A ${fish.wave.A.toFixed(3)} SL\nground ${(fish.speed / fish.SL).toFixed(2)} BL/s  heading ${(fish.heading * 57.3).toFixed(0)}°`;
    }
    for (const [id, m] of preyMeshes) if (!live.has(id)) { scene.remove(m); preyMeshes.delete(id); }
  }
  const clock = new THREE.Timer();
  function frame(ts) {
    clock.update(ts); const dt = Math.min(clock.getDelta(), 0.05) * st.slow; for (let i = 0; i < 2; i++) step(dt / 2);
    if (st.follow) { const d = new THREE.Vector3(fish.pos.x, fish.pos.y, fish.pos.z).sub(ctl.target); ctl.target.add(d); cam.position.add(d); }
    sync(); ctl.update(); r.render(scene, cam); requestAnimationFrame(frame);
  }
  window.__fish = fish; window.__agent = () => agent;
  if (q.get('lod') && q.get('lod') !== 'auto') fish.setLOD(+q.get('lod'));
  if (q.has('sim')) { // headless stills: ?sim=3&mode=Cruise&cam=persp  |  ?ai=1&sim=10&threat=5&cam=wide
    const T = parseFloat(q.get('sim')), thrAt = parseFloat(q.get('threat') ?? '-1'), strikeAt = parseFloat(q.get('strike') ?? '-1'), escAt = parseFloat(q.get('escape') ?? '-1'); let thr = false, struck = false, esc = false;
    for (let t = 0; t < T; t += 1 / 60) {
      if (!thr && thrAt >= 0 && t >= thrAt) { world.addThreat({ pos: [5.2, 0.45, 0.25], vel: [-1.0, 0, 0], size: 1, shadow: true, expire: world.t + 14 }); thr = true; }
      if (!struck && strikeAt >= 0 && t >= strikeAt) { fish.triggerStrike(0.12 * parseFloat(q.get('stretch') || '1')); struck = true; }
      if (!esc && escAt >= 0 && t >= escAt) { fish.triggerEscape(1); esc = true; }
      step(1 / 60);
    }
    S.gltf.scene.updateMatrixWorld(true); sync(); presetCamera(S, q.get('cam') || (st.ai ? 'wide' : 'persp')); r.render(scene, cam); window.__ready = true;
  } else { requestAnimationFrame(frame); window.__ready = true; }
  return { S, st, world, step };
}
