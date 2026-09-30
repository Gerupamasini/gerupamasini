import * as THREE from 'three';

// Developer overlay: skeleton, bone axes, velocity, targets, state/internal
// variables, detected burrow and threat. Driven from a lil-gui folder.
export class EdohazeDebug {
  constructor(scene, camera, container, gui) {
    this.scene = scene; this.camera = camera;
    this.opts = { enabled: false, skeleton: true, boneAxes: false, velocity: true, target: true, labels: true, threat: true, burrow: true, onlySelected: false, selected: 0 };
    this.entries = new Map();
    this.group = new THREE.Group(); this.group.name = 'EdohazeDebug'; scene.add(this.group);
    this.labelRoot = document.createElement('div');
    Object.assign(this.labelRoot.style, { position: 'absolute', inset: '0', pointerEvents: 'none', font: '11px/1.25 ui-monospace,monospace', color: '#e9f3ee' });
    container.appendChild(this.labelRoot);
    if (gui) {
      const f = gui.addFolder('Edohaze debug');
      for (const k of ['enabled', 'skeleton', 'boneAxes', 'velocity', 'target', 'labels', 'threat', 'burrow', 'onlySelected']) f.add(this.opts, k);
      f.add(this.opts, 'selected', 0, 32, 1);
      f.close();
    }
  }

  _entry(fish) {
    let e = this.entries.get(fish);
    if (e) return e;
    const sk = new THREE.SkeletonHelper(fish.object); sk.material.depthTest = false; sk.material.transparent = true;
    const axes = fish.rig.list.map((b) => { const a = new THREE.AxesHelper(fish.SL * 0.12); a.material.depthTest = false; b.add(a); return a; });
    const vel = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.01, 0x44ff88, 0.004, 0.003);
    const mkLine = (c) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true })); l.frustumCulled = false; return l; };
    const tgt = mkLine(0xffdd33), thr = mkLine(0xff3344), bur = mkLine(0x33aaff);
    this.group.add(sk, vel, tgt, thr, bur);
    const label = document.createElement('div');
    Object.assign(label.style, { position: 'absolute', background: 'rgba(10,20,18,.72)', padding: '3px 5px', borderRadius: '3px', whiteSpace: 'pre', transform: 'translate(-50%,-120%)' });
    this.labelRoot.appendChild(label);
    e = { sk, axes, vel, tgt, thr, bur, label };
    this.entries.set(fish, e);
    return e;
  }

  update(fishes, renderer) {
    const on = this.opts.enabled;
    this.group.visible = on; this.labelRoot.style.display = on ? '' : 'none';
    if (!on) { for (const e of this.entries.values()) e.axes.forEach((a) => { a.visible = false; }); return; }
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    fishes.forEach((fish, i) => {
      const e = this._entry(fish);
      const show = !this.opts.onlySelected || i === this.opts.selected;
      const bi = fish.behavior.debugInfo, lo = fish.loco;
      e.sk.visible = show && this.opts.skeleton;
      e.axes.forEach((a) => { a.visible = show && this.opts.boneAxes; });
      e.vel.visible = show && this.opts.velocity && lo.vel.lengthSq() > 1e-8;
      if (e.vel.visible) { e.vel.position.copy(lo.pos); e.vel.setDirection(lo.vel.clone().normalize()); e.vel.setLength(Math.max(lo.vel.length() * 0.3, 0.006), 0.004, 0.003); }
      const setLine = (l, a, b, vis) => { l.visible = vis; if (vis) { const p = l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; } };
      setLine(e.tgt, lo.pos, bi.target || lo.pos, show && this.opts.target && !!bi.target);
      setLine(e.thr, lo.pos, bi.threat ? bi.threat.position : lo.pos, show && this.opts.threat && !!bi.threat);
      setLine(e.bur, lo.pos, bi.burrow ? bi.burrow.opening : lo.pos, show && this.opts.burrow && !!bi.burrow);
      // label
      v.copy(lo.pos).project(this.camera);
      const vis = show && this.opts.labels && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      e.label.style.display = vis ? '' : 'none';
      if (vis) {
        e.label.style.left = `${(v.x * 0.5 + 0.5) * w}px`; e.label.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
        const bar = (x) => '█'.repeat(Math.round(x * 8)).padEnd(8, '·');
        e.label.textContent =
          `#${i} ${fish.sex[0].toUpperCase()} ${bi.state}${bi.peek ? ' (peek)' : ''} ${bi.t.toFixed(1)}s  LOD${fish.currentLOD}\n` +
          `fear   ${bar(bi.fear)} ${bi.fear.toFixed(2)}  risk ${bi.threatRisk.toFixed(2)}\n` +
          `hunger ${bar(bi.hunger)} energy ${bar(bi.energy)}\n` +
          `curio  ${bar(bi.curiosity)} shelter ${bar(bi.shelterNeed)}\n` +
          `v ${(lo.speed / fish.TL).toFixed(1)}BL/s tail ${fish.animator.debug.tailFreq.toFixed(1)}Hz pec:${fish.animator.debug.pecMode} ${lo.mode}` +
          (bi.burrow ? `\nburrow #${bi.burrow.id} ${bi.burrow.type}` : '');
      }
    });
  }
}
