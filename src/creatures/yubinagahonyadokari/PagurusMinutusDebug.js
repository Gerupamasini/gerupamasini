// Development overlay for ユビナガホンヤドカリ: bones, IK targets, planted feet, velocity, body and shell
// centres of mass, current state and the internal drives (fear, hunger, shell satisfaction …).
import * as THREE from 'three';

const COLORS = { bone: 0x66ccff, planted: 0x33ff66, swing: 0xff5544, target: 0xffdd33, vel: 0xff66ff, bodyCom: 0xffffff, shellCom: 0xff9933, contact: 0xff0000 };

export class CrabDebug {
  constructor(crab) {
    this.crab = crab;
    this.group = new THREE.Group();
    this.group.name = 'pagurus-debug';
    this.group.renderOrder = 999;
    const n = crab.rig.list.length;
    this.bonePos = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.bonePos, 3));
    this.bones = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLORS.bone, depthTest: false, transparent: true, opacity: 0.8 }));
    this.bones.frustumCulled = false;
    this.group.add(this.bones);
    const sphere = new THREE.SphereGeometry(1, 8, 6);
    const mk = (c) => {
      const m = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.9 }));
      m.renderOrder = 999;
      this.group.add(m);
      return m;
    };
    this.feet = {};
    for (const key of ['L1', 'R1', 'L2', 'R2']) this.feet[key] = { planted: mk(COLORS.planted), target: mk(COLORS.target) };
    this.bodyCom = mk(COLORS.bodyCom);
    this.shellCom = mk(COLORS.shellCom);
    this.contacts = [];
    this.vel = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.01, COLORS.vel);
    this.vel.line.material.depthTest = false;
    this.vel.cone.material.depthTest = false;
    this.group.add(this.vel);
    // text label
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) {
      this.canvas.width = 512;
      this.canvas.height = 256;
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
      this.label.renderOrder = 1000;
      this.group.add(this.label);
    }
    this.textTimer = 0;
    this.sphere = sphere;
    this.contactMat = new THREE.MeshBasicMaterial({ color: COLORS.contact, depthTest: false });
  }

  attach(parent) {
    if (this.group.parent !== parent) parent.add(this.group);
  }

  update(dt) {
    const crab = this.crab;
    const SL = crab.SL;
    // bones
    const list = crab.rig.list;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < list.length; i++) {
      const bone = list[i];
      a.setFromMatrixPosition(bone.matrixWorld);
      if (bone.parent && bone.parent.isBone) b.setFromMatrixPosition(bone.parent.matrixWorld);
      else b.copy(a);
      this.bonePos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    }
    this.bones.geometry.attributes.position.needsUpdate = true;
    // feet
    const r = 0.12 * SL;
    for (const leg of Object.values(crab.loco.legs)) {
      const f = this.feet[leg.key];
      f.planted.position.copy(leg.contact ? leg.planted : leg.footWorld);
      f.planted.material.color.setHex(leg.contact ? COLORS.planted : COLORS.swing);
      f.planted.scale.setScalar(r);
      f.target.position.copy(leg.footTarget);
      f.target.scale.setScalar(r * 0.7);
      f.target.visible = leg.stepping;
    }
    // centres of mass
    this.bodyCom.position.setFromMatrixPosition(crab.rig.root.matrixWorld);
    this.bodyCom.scale.setScalar(r * 1.3);
    if (crab.shell) {
      this.shellCom.visible = true;
      this.shellCom.position.copy(crab.shell.props.centerOfMass).applyMatrix4(crab.shell.object3D.matrixWorld);
      this.shellCom.scale.setScalar(r * 1.3);
    } else this.shellCom.visible = false;
    // shell ground contacts
    const pts = crab.shellDyn?.lastContactPoints ?? [];
    while (this.contacts.length < pts.length) {
      const m = new THREE.Mesh(this.sphere, this.contactMat);
      m.renderOrder = 999;
      this.group.add(m);
      this.contacts.push(m);
    }
    this.contacts.forEach((m, i) => {
      m.visible = i < pts.length;
      if (m.visible) { m.position.copy(pts[i]); m.scale.setScalar(r * 0.6); }
    });
    // velocity
    const v = crab.loco.velocity;
    const sp = v.length();
    this.vel.position.copy(this.bodyCom.position);
    if (sp > 1e-5) {
      this.vel.setDirection(v.clone().normalize());
      this.vel.setLength(Math.max(SL, sp * 1.5), SL * 0.5, SL * 0.35);
      this.vel.visible = true;
    } else this.vel.visible = false;
    // label (4 Hz)
    this.textTimer -= dt;
    if (this.label) {
      this.label.position.copy(this.bodyCom.position).add(new THREE.Vector3(0, 5 * SL, 0));
      this.label.scale.set(12 * SL, 6 * SL, 1);
      if (this.textTimer <= 0) {
        this.textTimer = 0.25;
        this.drawText();
      }
    }
  }

  drawText() {
    const crab = this.crab;
    const s = crab.behavior.snapshot();
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, 512, 256);
    g.font = 'bold 30px monospace';
    g.fillStyle = '#fff';
    g.fillText(`${s.state}${s.sub ? ' · ' + s.sub : ''}  LOD${crab.lod}`, 12, 36);
    g.font = '24px monospace';
    const bars = [['fear', s.fear, '#ff6655'], ['hunger', s.hunger, '#ffcc44'], ['shellSat', s.shellSatisfaction, '#66ddff'], ['curiosity', s.curiosity, '#bb88ff'], ['energy', s.energy, '#88ff88'], ['activity', s.activity, '#ffffff']];
    bars.forEach(([name, v, c], i) => {
      const y = 70 + i * 30;
      g.fillStyle = '#ccc';
      g.fillText(name, 12, y + 18);
      g.fillStyle = '#333';
      g.fillRect(170, y, 320, 20);
      g.fillStyle = c;
      g.fillRect(170, y, 320 * Math.max(0, Math.min(1, v)), 20);
    });
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.geometry && o.geometry !== this.sphere) o.geometry.dispose();
      if (o.material) o.material.dispose?.();
    });
    this.sphere.dispose();
    this.tex?.dispose();
  }
}
