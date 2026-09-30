import * as THREE from 'three';

// Threat and prey actors used to exercise the Edohaze AI.
// Threat record: { position, velocity, size, visible, active, kind }

export class HandNet {
  constructor(scene, world) {
    this.world = world; this.kind = 'net'; this.size = 0.16; this.active = true; this.visible = true;
    this.position = new THREE.Vector3(0.9, 0.12, 0.9); this.velocity = new THREE.Vector3();
    this.target = null; this.speed = 0.35;
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.0025, 8, 48), new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.5, metalness: 0.6 }));
    frame.rotation.y = Math.PI / 2;
    const bagGeo = new THREE.ConeGeometry(0.08, 0.14, 32, 6, true); bagGeo.rotateZ(Math.PI / 2); bagGeo.translate(-0.07, 0, 0);
    const bag = new THREE.Mesh(bagGeo, new THREE.MeshStandardMaterial({ color: 0x1d2a26, transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.9 }));
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6), frame.material);
    handle.position.set(0.0, 0.3, 0); handle.rotation.z = 0.3;
    g.add(frame, bag, handle);
    g.traverse((o) => { o.castShadow = true; });
    this.object = g; scene.add(g);
  }
  sweepTo(p) { this.target = p.clone(); this.target.y = this.world.getGroundHeight(p.x, p.z) + 0.05; }
  update(dt) {
    const prev = this.position.clone();
    if (this.target) {
      const to = this.target.clone().sub(this.position); const d = to.length();
      if (d < 0.01) this.target = null;
      else this.position.addScaledVector(to.normalize(), Math.min(d, this.speed * dt));
    }
    this.velocity.copy(this.position).sub(prev).divideScalar(Math.max(dt, 1e-4));
    this.object.position.copy(this.position);
    if (this.velocity.lengthSq() > 1e-6) this.object.rotation.y = Math.atan2(-this.velocity.z, this.velocity.x) + Math.PI;
  }
}

// Stand-in predator (juvenile sea bass / large goby class, ~15 cm). Visual proxy only.
export class PredatorProxy {
  constructor(scene, world) {
    this.world = world; this.kind = 'predator'; this.size = 0.15; this.active = true; this.visible = true;
    this.position = new THREE.Vector3(-0.8, 0.08, -0.6); this.velocity = new THREE.Vector3(0.05, 0, 0.02);
    this.heading = 0.3; this.t = 0; this.lunge = 0;
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshStandardMaterial({ color: 0x6b6f66, roughness: 0.4, metalness: 0.2 }));
    body.scale.set(0.022, 0.028, 0.075);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 3), body.material); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.085; tail.scale.set(0.3, 1, 1);
    this.object = new THREE.Group(); this.object.add(body, tail);
    this.object.traverse((o) => { o.castShadow = true; });
    scene.add(this.object);
  }
  update(dt, fishes) {
    this.t += dt;
    // wander in the area; occasionally dash at the nearest visible goby
    let target = null, bd = 0.35;
    for (const f of fishes) { if (f.loco.hidden) continue; const d = f.loco.pos.distanceTo(this.position); if (d < bd) { bd = d; target = f; } }
    let want = this.heading + Math.sin(this.t * 0.3) * 0.4 * dt;
    let spd = 0.06;
    if (target && Math.sin(this.t * 0.11) > 0.75) { const to = target.loco.pos.clone().sub(this.position); want = Math.atan2(to.x, to.z); spd = 0.28; }
    if (!this.world.inBounds(this.position)) want = Math.atan2(-this.position.x, -this.position.z);
    let e = want - this.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
    this.heading += Math.max(-2 * dt, Math.min(2 * dt, e));
    this.velocity.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(spd);
    this.position.addScaledVector(this.velocity, dt);
    const g = this.world.getGroundHeight(this.position.x, this.position.z);
    this.position.y += (g + 0.05 - this.position.y) * Math.min(1, dt * 2);
    this.object.position.copy(this.position); this.object.rotation.y = this.heading;
    this.object.children[1].rotation.y = Math.sin(this.t * 10) * 0.4;
  }
}

// Camera-as-diver threat: the player's approach frightens fish when fast/close.
export class CameraThreat {
  constructor(camera) { this.camera = camera; this.kind = 'player'; this.size = 0.25; this.active = true; this.visible = true; this.position = new THREE.Vector3(); this.velocity = new THREE.Vector3(); this._p = new THREE.Vector3(); }
  update(dt) { this._p.copy(this.position); this.position.copy(this.camera.position); this.velocity.copy(this.position).sub(this._p).divideScalar(Math.max(dt, 1e-4)); }
}

// Small epibenthic prey (amphipods / copepods; diet confirmed: small crustaceans & polychaetes).
export class PreyField {
  constructor(scene, world, count = 60) {
    this.world = world; this.items = [];
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb9ad92, roughness: 0.5, transparent: true, opacity: 0.85 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < count; i++) this.items.push(this._spawn({}));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
  }
  _spawn(p) {
    const S = this.world.size * 0.38;
    p.position = new THREE.Vector3((Math.random() - 0.5) * 2 * S, 0, (Math.random() - 0.5) * 2 * S);
    p.position.y = this.world.getGroundHeight(p.position.x, p.position.z) + 0.0008;
    p.alive = true; p.hop = Math.random() * 3; p.vel = new THREE.Vector3(); p.size = 0.0012 + Math.random() * 0.0012; p.respawn = 0;
    return p;
  }
  update(dt) {
    this.items.forEach((p, i) => {
      if (!p.alive) { p.respawn += dt; if (p.respawn > 8) this._spawn(p); }
      else {
        p.hop -= dt;
        if (p.hop < 0) { p.hop = 0.5 + Math.random() * 4; const a = Math.random() * 6.28; p.vel.set(Math.cos(a) * 0.04, 0.03, Math.sin(a) * 0.04); }
        p.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(Math.exp(-dt * 6)); p.vel.y -= dt * 0.05;
        const g = this.world.getGroundHeight(p.position.x, p.position.z) + 0.0008;
        if (p.position.y < g) { p.position.y = g; p.vel.y = 0; }
      }
      this._s.setScalar(p.alive ? p.size : 0); this._s.z *= 1.8;
      this._m.compose(p.position, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
