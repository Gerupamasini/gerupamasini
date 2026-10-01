// Aquarium world: builds the environment, owns lights, environment stimuli
// (glass taps, overhead shadows), food, water currents, and answers the
// spatial queries used by the behaviour AI (signed distance to walls /
// obstacles, ground height, flow field).

import * as THREE from 'three';
import { TANK } from './TankConfig.js';
import { buildTank } from './Tank.js';
import { buildSubstrate, groundHeight } from './Substrate.js';
import { buildRocks, buildPlants } from './Decor.js';
import { WaterSurface } from './WaterSurface.js';
import { Caustics } from './Caustics.js';
import { SuspendedParticles, BubbleColumn, PuffSystem } from './Particles.js';
import { FoodSystem } from './Food.js';
import { LightShafts } from './LightShafts.js';
import { buildAquariumEnvScene, buildRoomEnvScene, bakeEnvironment } from '../render/StudioEnvironment.js';
import { U } from '../render/SharedUniforms.js';

export class World {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.time = 0;
    this.stimuli = []; // {type, pos, time, intensity}
    this.groundHeight = groundHeight;
    this.bounds = { min: new THREE.Vector3(-TANK.L / 2, 0, -TANK.D / 2), max: new THREE.Vector3(TANK.L / 2, TANK.water, TANK.D / 2) };

    scene.background = new THREE.Color(0x0b0c0d);
    scene.environment = bakeEnvironment(renderer, buildAquariumEnvScene());
    scene.environmentIntensity = 0.58;

    // the room around the tank: reflected by everything outside the water
    // (glass panes, frame, the surface seen from above)
    this.roomEnv = bakeEnvironment(renderer, buildRoomEnvScene());
    this.tank = buildTank({ glassEnv: this.roomEnv });
    scene.add(this.tank);
    const rocks = buildRocks();
    this.rocks = rocks.group;
    scene.add(this.rocks);
    this.substrate = buildSubstrate(rocks.footprints);
    scene.add(this.substrate);
    const plants = buildPlants();
    this.plants = plants.group;
    this.plantCurrent = plants.current;
    scene.add(this.plants);
    this.colliders = [...rocks.colliders, ...plants.colliders];
    // layer 1 = content visible in the surface TIR mirror (pebble instances are
    // skipped: from the grazing mirror angle only the base colour reads)
    for (const o of [this.substrate, this.rocks, this.plants]) o.traverse((c) => { if (!c.isInstancedMesh || o !== this.substrate) c.layers.enable(1); });
    this.tank.traverse((c) => {
      if (c.material && c.geometry && c.geometry.type === 'PlaneGeometry') c.layers.enable(1);
    });

    // lights: hood LED (key, casts shadows) + hemispherical in-water fill
    const key = new THREE.DirectionalLight(0xfff6ec, 5.2);
    key.position.set(0.18, TANK.water + 1.2, 0.3);
    key.target.position.set(0, 0.15, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -0.72;
    sc.right = 0.72;
    sc.top = 0.42;
    sc.bottom = -0.42;
    sc.near = 0.4;
    sc.far = 2.4;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.0015;
    key.shadow.radius = 4;
    key.shadow.blurSamples = 12;
    scene.add(key, key.target);
    key.layers.enable(1);
    this.key = key;
    // share the key-light shadow transform with the fish shaders (light that
    // enters the body elsewhere is shadowed at its entry point)
    U.uKeyShadowMatrix.value = key.shadow.matrix;
    U.uKeyShadowOn.value = 1;
    const hemi = new THREE.HemisphereLight(0xaacdc4, 0x3b3122, 0.22);
    hemi.layers.enable(1);
    scene.add(hemi);
    this.hemi = hemi;
    // soft front room light (from the viewer's side)
    const room = new THREE.DirectionalLight(0xffe8d0, 0.08);
    room.position.set(0.2, 0.6, 2.0);
    scene.add(room);
    this.room = room;
    this._updateLightDir();

    this.caustics = new Caustics(renderer);
    this.surface = new WaterSurface(renderer, scene, { roomEnv: this.roomEnv });
    this.particles = new SuspendedParticles(scene);
    this.shafts = new LightShafts(scene);
    this.bubbles = new BubbleColumn(scene, new THREE.Vector3(-0.54, groundHeight(-0.54, -0.18) + 0.01, -0.18));
    this.puffs = new PuffSystem(scene);
    this.food = new FoodSystem(scene);
    this.food.onSplash = (x, z, s) => this.surface.addRipple(x, z, s);

    U.uWaterMin.value.set(-TANK.L / 2, 0, -TANK.D / 2);
    U.uWaterMax.value.set(TANK.L / 2, TANK.water, TANK.D / 2);
    U.uCausticParams.value.z = TANK.water;
    U.uCausticParams.value.y = 1.0;
    U.uWaterDensity.value = 1.0;
    // filter current: gentle flow along the tank near the surface
    this.currentStrength = 0.012;
  }

  /** Reach of the fine pebble LOD (adaptive quality): 1 = default, 0 = coarse only. */
  setDetail(k) {
    this.substrate.traverse((o) => {
      if (!o.isLOD || o.levels.length < 2) return;
      if (o.userData.near === undefined) o.userData.near = o.levels[1].distance;
      o.levels[1].distance = o.userData.near * k;
    });
  }

  _updateLightDir() {
    const d = new THREE.Vector3().subVectors(this.key.position, this.key.target.position).normalize();
    U.uCausticLightDir.value.copy(d);
  }

  setLightAngle(azimuthDeg, elevationDeg) {
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const el = THREE.MathUtils.degToRad(elevationDeg);
    const r = 1.3;
    this.key.position.set(Math.cos(el) * Math.sin(az) * r, TANK.water * 0.4 + Math.sin(el) * r, Math.cos(el) * Math.cos(az) * r);
    this._updateLightDir();
  }

  // ------------------------------------------------------------------ queries
  /** Water flow velocity at p (filter current + bubble entrainment). */
  flowAt(p, out = new THREE.Vector3()) {
    const top = THREE.MathUtils.smoothstep(p.y, TANK.water * 0.4, TANK.water);
    out.set(this.currentStrength * top, 0, this.currentStrength * 0.25 * Math.sin(p.x * 3));
    const b = this.bubbles.flowAt(p, new THREE.Vector3());
    return out.add(b);
  }

  /**
   * Signed distance from p to the nearest boundary (walls, floor, surface,
   * rocks, plants) and the outward gradient (direction to move away).
   */
  distance(p, grad, { ignoreSurface = false, ignoreFloor = false, softPlants = true } = {}) {
    let best = Infinity;
    const g = grad || new THREE.Vector3();
    const test = (d, gx, gy, gz) => {
      if (d < best) {
        best = d;
        g.set(gx, gy, gz);
      }
    };
    const { min, max } = this.bounds;
    test(p.x - min.x, 1, 0, 0);
    test(max.x - p.x, -1, 0, 0);
    test(p.z - min.z, 0, 0, 1);
    test(max.z - p.z, 0, 0, -1);
    if (!ignoreFloor) test(p.y - groundHeight(p.x, p.z), 0, 1, 0);
    if (!ignoreSurface) test(max.y - p.y, 0, -1, 0);
    const v = new THREE.Vector3();
    for (const c of this.colliders) {
      if (c.type === 'ellipsoid') {
        v.subVectors(p, c.center).divide(c.radii);
        const l = v.length();
        const d = (l - 1) * Math.min(c.radii.x, c.radii.y, c.radii.z);
        if (d < best) test(d, v.x / (c.radii.x * l + 1e-6), v.y / (c.radii.y * l + 1e-6), v.z / (c.radii.z * l + 1e-6));
      } else if (c.type === 'cylinder') {
        if (p.y > c.height + 0.02) continue;
        const dx = p.x - c.center.x;
        const dz = p.z - c.center.z;
        const r = Math.hypot(dx, dz);
        const d = (r - c.radius) + (softPlants && c.soft ? 0.03 : 0);
        test(d, dx / (r + 1e-6), 0, dz / (r + 1e-6));
      }
    }
    g.normalize();
    return best;
  }

  /** Register an environmental stimulus (tap on the glass, looming shadow...). */
  addStimulus(type, pos, intensity = 1) {
    this.stimuli.push({ type, pos: pos.clone(), time: this.time, intensity });
    if (this.stimuli.length > 32) this.stimuli.shift();
  }

  randomPoint(rng, margin = 0.06, yMin = null, yMax = null) {
    const x = rng.range(-TANK.L / 2 + margin, TANK.L / 2 - margin);
    const z = rng.range(-TANK.D / 2 + margin, TANK.D / 2 - margin);
    const g = groundHeight(x, z);
    const y = rng.range(yMin ?? g + margin, yMax ?? TANK.water - margin);
    return new THREE.Vector3(x, y, z);
  }

  update(dt, time) {
    this.time = time;
    U.uCausticParams.value.w = time;
    this.caustics.update(time);
    this.bubbles.update(dt, time);
    this.puffs.update(dt);
    this.food.update(dt, time, (p, o) => this.flowAt(p, o));
    this.plantCurrent.value.set(0.6 + 0.3 * Math.sin(time * 0.05), 0, 0.15);
    // forget old stimuli
    this.stimuli = this.stimuli.filter((s) => time - s.time < 2);
  }
}

export { TANK };
