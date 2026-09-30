// Debug overlays: skeleton (spine + fin ray chains), velocity vectors, AI
// targets, collision volumes, and HTML state labels.

import * as THREE from 'three';
import { NS } from '../fish/RigLayout.js';
import { TANK } from '../world/TankConfig.js';

const MAX_SEG = 60000;

export class DebugDraw {
  constructor(scene) {
    this.scene = scene;
    this.flags = { skeleton: false, velocity: false, target: false, collision: false, labels: false };
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_SEG * 6);
    this.col = new Float32Array(MAX_SEG * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9, toneMapped: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    scene.add(this.lines);
    this.n = 0;
    this.collisionGroup = null;
    this.labelsEl = document.getElementById('labels');
    this.labelMap = new Map();
  }

  seg(a, b, c) {
    if (this.n >= MAX_SEG) return;
    const i = this.n * 6;
    this.pos[i] = a.x; this.pos[i + 1] = a.y; this.pos[i + 2] = a.z;
    this.pos[i + 3] = b.x; this.pos[i + 4] = b.y; this.pos[i + 5] = b.z;
    this.col[i] = this.col[i + 3] = c.r;
    this.col[i + 1] = this.col[i + 4] = c.g;
    this.col[i + 2] = this.col[i + 5] = c.b;
    this.n++;
  }

  _buildCollision(world) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true, transparent: true, opacity: 0.35, depthTest: false });
    for (const c of world.colliders) {
      if (c.type === 'ellipsoid') {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat);
        m.position.copy(c.center);
        m.scale.copy(c.radii);
        grp.add(m);
      } else {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(c.radius, c.radius, c.height, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x33ff99, wireframe: true, transparent: true, opacity: 0.3, depthTest: false }));
        m.position.set(c.center.x, c.height / 2, c.center.z);
        grp.add(m);
      }
    }
    const box = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-TANK.L / 2, 0, -TANK.D / 2), new THREE.Vector3(TANK.L / 2, TANK.water, TANK.D / 2)), 0xffff00);
    grp.add(box);
    grp.renderOrder = 10;
    this.scene.add(grp);
    return grp;
  }

  update(fishList, world, camera, selected) {
    this.n = 0;
    const f = this.flags;
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const cSpine = new THREE.Color(1, 1, 0.2);
    const cFin = new THREE.Color(0.3, 0.9, 1);
    const cVel = new THREE.Color(0.2, 1, 0.3);
    const cTgt = new THREE.Color(1, 0.3, 0.8);
    const cSel = new THREE.Color(1, 1, 1);
    for (const fish of fishList) {
      const rig = fish.rig;
      if (f.skeleton) {
        for (let i = 0; i < NS - 1; i++) {
          A.fromArray(rig.spineP, i * 3);
          B.fromArray(rig.spineP, (i + 1) * 3);
          this.seg(A, B, cSpine);
        }
        // spine frames (lateral axis ticks)
        for (let i = 0; i < NS; i += 3) {
          A.fromArray(rig.spineP, i * 3);
          const q = new THREE.Quaternion().fromArray(rig.spineQ, i * 4);
          B.set(0, 0, 0.02 * fish.SL * 3).applyQuaternion(q).add(A);
          this.seg(A, B, cSel);
        }
        for (const ch of rig.chains) {
          for (let k = 0; k < ch.M - 1; k++) {
            A.fromArray(rig.pos, (ch.offset + k) * 3);
            B.fromArray(rig.pos, (ch.offset + k + 1) * 3);
            this.seg(A, B, cFin);
          }
        }
      }
      if (f.velocity) {
        A.copy(fish.loc.pos);
        B.copy(fish.loc.vel).multiplyScalar(0.6).add(A);
        this.seg(A, B, cVel);
        if (fish.brain) {
          B.copy(fish.loc.cmd.dir).multiplyScalar(fish.loc.cmd.speed * fish.SL * 0.6).add(A);
          this.seg(A, B, new THREE.Color(1, 0.6, 0.1));
        }
      }
      if (f.target && fish.brain) {
        const b = fish.brain;
        const tgt = b.food ? b.food.pos : b.target;
        if (tgt) this.seg(fish.loc.pos, tgt, fish === selected ? cSel : cTgt);
      }
    }
    this.lines.geometry.setDrawRange(0, this.n * 2);
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
    this.lines.visible = this.n > 0;

    if (f.collision && !this.collisionGroup && world) this.collisionGroup = this._buildCollision(world);
    if (this.collisionGroup) this.collisionGroup.visible = f.collision;

    this._labels(fishList, camera, selected);
  }

  _labels(fishList, camera, selected) {
    if (!this.labelsEl) return;
    const show = this.flags.labels;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const seen = new Set();
    if (show) {
      for (const fish of fishList) {
        let el = this.labelMap.get(fish);
        if (!el) {
          el = document.createElement('div');
          el.className = 'fish-label';
          this.labelsEl.appendChild(el);
          this.labelMap.set(fish, el);
        }
        seen.add(fish);
        const p = fish.loc.pos.clone();
        p.y += fish.SL * 0.4;
        p.project(camera);
        if (p.z > 1 || !fish.visible) {
          el.style.display = 'none';
          continue;
        }
        el.style.display = 'block';
        el.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
        el.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
        const b = fish.brain;
        const d = b ? b.drives : null;
        el.style.outline = fish === selected ? '1px solid #fff' : 'none';
        el.textContent = b
          ? `#${fish.id} ${b.state}/${fish.loc.gait}  H${d.hunger.toFixed(2)} F${d.fear.toFixed(2)}  ${fish.loc.debug.speedBL.toFixed(1)}BL/s ${fish.loc.freq.toFixed(1)}Hz`
          : `#${fish.id} ${fish.loc.gait} ${fish.loc.freq.toFixed(1)}Hz`;
      }
    }
    for (const [fish, el] of this.labelMap) {
      if (!seen.has(fish)) {
        el.remove();
        this.labelMap.delete(fish);
      }
    }
  }
}
