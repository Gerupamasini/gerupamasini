import { BufferGeometry, CapsuleGeometry, Color, ConeGeometry, Group, Mesh, MeshPhysicalMaterial, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The prey of the ミミイカ: a mysid (アミ), the small glassy crustacean that hangs in swarms just over the sand at night
 * and is the bobtail squids' staple with the amphipods and small shrimps. It drifts and hovers on its swimming legs,
 * nose into the water, with small jerks; when something comes at it, it flicks backwards with its tail fan.
 * The motion is the behaviour's (no rendering here); the model is a tiny shared mesh (eyes, carapace, abdomen, tail
 * fan, a hint of the legs) in one transparent material.
 */

export type PreyState = 'drift' | 'dart' | 'caught' | 'eaten';

export class Mysid {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  heading = 0;
  state: PreyState = 'drift';
  /** body length (m) */
  readonly length: number;
  private t = 0;
  private turnT = 0;
  private dartT = 0;
  private readonly alt: number;
  /** 1 … 0 while it is being eaten */
  remains = 1;
  /** how briskly it swims (a mysid on the night's current drifts past faster) */
  pace = 1;

  constructor(x: number, y: number, z: number, length: number, private readonly rng: () => number, heading = rng() * Math.PI * 2) {
    this.pos.set(x, y, z);
    this.length = length;
    this.heading = heading;
    this.alt = length * (0.8 + 2.5 * rng());
  }

  /** a flick backwards, away from `from` */
  dart(from: Vector3): void {
    if (this.state !== 'drift') return;
    this.state = 'dart';
    this.dartT = 0.22 + 0.12 * this.rng();
    const away = this.pos.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-10) away.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    away.normalize();
    // it shoots tail first: the body keeps facing roughly where it came from
    this.heading = Math.atan2(-away.x, -away.z) + (this.rng() - 0.5) * 0.6;
    this.vel.copy(away).multiplyScalar(this.length * (28 + 10 * this.rng())).setY(this.length * (3 + 6 * this.rng()));
  }

  update(dt: number, ground: (x: number, z: number) => number, water: number): void {
    this.t += dt;
    if (this.state === 'caught' || this.state === 'eaten') return;
    if (this.state === 'dart') {
      this.dartT -= dt;
      this.vel.multiplyScalar(Math.exp(-dt * 7));
      if (this.dartT <= 0) this.state = 'drift';
    } else {
      // a slow wander with little jerks of the swimming legs, keeping its height over the sand
      this.turnT -= dt;
      if (this.turnT <= 0) { this.turnT = 0.6 + 1.6 * this.rng(); this.heading += (this.rng() - 0.5) * 1.6; }
      const jerk = 0.5 + 0.5 * Math.max(0, Math.sin(this.t * 9.0 + Math.sin(this.t * 2.3) * 2));
      const sp = this.length * (0.25 + 0.45 * jerk) * this.pace;
      this.vel.x += (Math.sin(this.heading) * sp - this.vel.x) * Math.min(1, dt * 4);
      this.vel.z += (Math.cos(this.heading) * sp - this.vel.z) * Math.min(1, dt * 4);
      const gy = ground(this.pos.x, this.pos.z);
      const want = gy + this.alt + Math.sin(this.t * 1.7) * this.length * 0.4;
      this.vel.y += ((want - this.pos.y) * 3 - this.vel.y) * Math.min(1, dt * 3);
    }
    this.pos.addScaledVector(this.vel, dt);
    const gy = ground(this.pos.x, this.pos.z) + this.length * 0.3;
    if (this.pos.y < gy) { this.pos.y = gy; this.vel.y = Math.abs(this.vel.y) * 0.3; }
    if (this.pos.y > water - this.length) this.pos.y = water - this.length;
  }

  /** the swimming legs' beat (for the model) */
  get beat(): number { return Math.sin(this.t * 38); }
}

let GEO: BufferGeometry | null = null;
let MAT: MeshPhysicalMaterial | null = null;
let EYE_MAT: MeshPhysicalMaterial | null = null;
let EYE_GEO: BufferGeometry | null = null;

/** the mysid's mesh for a body 1 m long along +z (scaled to the prey's length) */
function mysidGeometry(): BufferGeometry {
  if (GEO) return GEO;
  const parts: BufferGeometry[] = [];
  const carapace = new CapsuleGeometry(0.075, 0.28, 4, 10);
  carapace.rotateX(Math.PI / 2);
  carapace.translate(0, 0, 0.22);
  parts.push(carapace);
  // the abdomen: segments tapering back, a little curved down
  for (let i = 0; i < 5; i++) {
    const s = new SphereGeometry(0.06 - i * 0.007, 8, 6);
    s.scale(1, 0.9, 1.7);
    s.translate(0, -0.006 * i * i * 0.4, -0.02 - i * 0.1);
    parts.push(s);
  }
  // the tail fan
  const fan = new ConeGeometry(0.08, 0.16, 6, 1, true);
  fan.rotateX(-Math.PI / 2);
  fan.scale(1.4, 0.25, 1);
  fan.translate(0, -0.03, -0.56);
  parts.push(fan);
  // antennae and the thoracic legs: thin cones
  for (const sx of [-1, 1]) {
    const a = new ConeGeometry(0.008, 0.35, 3);
    a.rotateX(Math.PI / 2 - 0.25);
    a.rotateY(sx * 0.35);
    a.translate(sx * 0.05, 0.02, 0.52);
    parts.push(a);
    for (let k = 0; k < 3; k++) {
      const l = new ConeGeometry(0.006, 0.16, 3);
      l.rotateZ(sx * (Math.PI / 2 + 0.5));
      l.translate(sx * 0.08, -0.06, 0.12 + 0.07 * k);
      parts.push(l);
    }
  }
  const flat = parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; });
  GEO = mergeGeometries(flat, false)!;
  GEO.computeBoundingSphere();
  return GEO;
}

function mysidMaterial(): MeshPhysicalMaterial {
  if (MAT) return MAT;
  MAT = new MeshPhysicalMaterial({ color: new Color(0.42, 0.4, 0.36), roughness: 0.3, clearcoat: 0.6, transparent: true, opacity: 0.38, depthWrite: false });
  MAT.name = 'MysidBody';
  return MAT;
}

/** a mysid's model (shared geometry and materials; dispose nothing per instance) */
export function makeMysidModel(): Group {
  const g = new Group();
  g.name = 'Mysid';
  const body = new Mesh(mysidGeometry(), mysidMaterial());
  body.name = 'MysidBody';
  body.renderOrder = 3;
  g.add(body);
  EYE_GEO ??= new SphereGeometry(0.045, 8, 6);
  EYE_MAT ??= new MeshPhysicalMaterial({ color: new Color(0.02, 0.02, 0.02), roughness: 0.2, clearcoat: 1 });
  EYE_MAT.name = 'MysidEye';
  for (const sx of [-1, 1]) {
    const e = new Mesh(EYE_GEO, EYE_MAT);
    e.position.set(sx * 0.07, 0.03, 0.42);
    g.add(e);
  }
  return g;
}

/** put the mysid's model where the prey is */
export function poseMysid(model: Group, m: Mysid): void {
  model.position.copy(m.pos);
  model.rotation.set(0.15 * m.beat * 0.1, m.heading, 0);
  model.scale.setScalar(m.length * Math.max(0.001, m.remains));
  model.visible = m.state !== 'eaten' && m.remains > 0.02;
}
