import * as THREE from 'three';

// A person walking on the flat (the "player" the plovers react to). WASD / arrows, Shift = run.
// Registers itself as a 'human' threat in world.threats.

export class Player {
  constructor(world, scene, pos = new THREE.Vector3(0, 0, 25)) {
    this.world = world;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.heading = Math.PI;
    this.type = 'human';
    this.keys = new Set();
    this.enabled = true;
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89f82, roughness: 0.7 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3f5a6e, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x5b5347, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 6, 12), cloth);
    torso.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skin);
    head.position.y = 1.66;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.9 }));
    hat.position.y = 1.74;
    this.legs = [0, 1].map((i) => {
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.72, 4, 8), pants);
      l.geometry.translate(0, -0.4, 0);
      l.position.set(i ? -0.1 : 0.1, 0.88, 0);
      g.add(l);
      return l;
    });
    g.add(torso, head, hat);
    g.traverse((o) => (o.castShadow = true));
    this.object = g;
    scene.add(g);
    this.phase = 0;
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    world.threats.push(this);
    world.player = this;
  }

  update(dt, cameraYaw) {
    const k = this.keys;
    let fx = 0;
    let fz = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) fx += 1;
      if (k.has('KeyD') || k.has('ArrowRight')) fx -= 1;
    }
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const sp = run ? 3.4 : 1.35;
    const len = Math.hypot(fx, fz);
    const target = new THREE.Vector3();
    if (len > 0) {
      const c = Math.cos(cameraYaw);
      const s = Math.sin(cameraYaw);
      // camera-relative movement
      target.set((fx * c + fz * s) / len, 0, (-fx * s + fz * c) / len).multiplyScalar(sp);
    }
    if (this.autopilot) target.copy(this.autopilot(dt) ?? target);
    this.vel.lerp(target, 1 - Math.exp(-6 * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = this.world.terrain.heightAt(this.pos.x, this.pos.z);
    const v = Math.hypot(this.vel.x, this.vel.z);
    if (v > 0.05) this.heading = Math.atan2(this.vel.x, this.vel.z);
    this.phase += dt * v * 2.4;
    this.legs[0].rotation.x = Math.sin(this.phase) * 0.5 * Math.min(1, v);
    this.legs[1].rotation.x = -Math.sin(this.phase) * 0.5 * Math.min(1, v);
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.heading;
  }
}
