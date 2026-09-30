// Application shell: renderer, cameras, modes (aquarium / studio), input,
// main loop, profiling hooks.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FishSystem } from './fish/FishSystem.js';
import { Fish } from './fish/Fish.js';
import { Brain } from './ai/Brain.js';
import { AnimDemo } from './fish/AnimDemo.js';
import { U } from './render/SharedUniforms.js';
import { buildStudioEnvScene, bakeEnvironment } from './render/StudioEnvironment.js';
import { PostFX } from './render/PostFX.js';
import { World } from './world/World.js';
import { TANK } from './world/TankConfig.js';
import { DebugDraw } from './debug/DebugDraw.js';
import { buildGUI } from './debug/DebugGUI.js';
import { RNG } from './core/random.js';
import { resolveOverlaps } from './ai/Steering.js';

export class App {
  constructor(container, opts) {
    this.container = container;
    this.opts = opts;
    this.mode = opts.mode === 'studio' ? 'studio' : 'aquarium';
    this.time = 0;
    this.timeScale = 1;
    this.paused = false;
    this.frame = 0;
    this.selected = null;
    this.cameraMode = 'orbit';
    this.anim = new AnimDemo();
    this.animTarget = 'selected';
    this.perf = { fps: 0, frameMs: 0, simMs: 0, renderMs: 0, acc: 0, n: 0 };
    this.rng = new RNG(opts.seed ?? 2024);
  }

  async init() {
    const test = !!this.opts.test;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: test });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;
    renderer.info.autoReset = false; // count every pass of a frame (shadow, reflection, composer)

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.005, 30);
    this.camera.layers.enable(1);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    const neutral = new THREE.DataTexture(new Uint8Array([87, 87, 87, 255]), 1, 1);
    neutral.needsUpdate = true;
    U.uCaustics.value = neutral;

    this.fishSystem = new FishSystem(this.scene, { maxFish: 48 });
    this.school = { fish: this.fishSystem.fish };
    this.debugDraw = new DebugDraw(this.scene);

    if (this.mode === 'studio') this._initStudio();
    else this._initAquarium();

    this.post = new PostFX(renderer, this.scene, this.camera);
    if (this.mode === 'studio') {
      this.post.bloom.strength = 0.1;
      this.post.bloom.threshold = 1.2;
    }
    this.usePost = this.opts.quality !== 'low';
    this._bindInput();
    window.addEventListener('resize', () => this._resize());
    this._resize();
    if (this.opts.gui && !test) this.gui = buildGUI(this);
    this.hud = document.getElementById('hud');
    if (this.opts.params.get('hud') === '0' && this.hud) this.hud.style.display = 'none';
    if (test) {
      for (const id of ['help', 'hud']) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      }
    }

    // compile shaders up-front to avoid first-frame hitches
    if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);

    if (!test) renderer.setAnimationLoop(() => this._tick());
    else this._runTest();
  }

  // ------------------------------------------------------------------ modes
  _initAquarium() {
    this.world = new World(this.renderer, this.scene);
    const n = this.opts.fishCount ?? 10;
    this.setFishCount(n);
    this.selected = this.fishSystem.fish[0] || null;
    this.camera.position.set(0.0, 0.26, 1.22);
    this.controls.target.set(0, 0.22, 0);
    this.controls.minDistance = 0.08;
    this.controls.maxDistance = 4;
    this.controls.update();
  }

  spawnFish(colorType = null) {
    const seed = Math.floor(this.rng.next() * 1e9);
    const f = new Fish(this.fishSystem.layout, { seed, colorType });
    f.brain = new Brain(f, this.school);
    const p = this.world.randomPoint(this.rng, 0.12, 0.08, TANK.water - 0.06);
    f.loc.pos.copy(p);
    f.loc.yaw = this.rng.range(-Math.PI, Math.PI);
    f.loc.speed = 0.3 * f.SL;
    this.fishSystem.add(f);
    // settle the fins before the first frame
    for (let i = 0; i < 30; i++) f.update(1 / 60, this.time + i / 60, this.world);
    return f;
  }

  setFishCount(n) {
    n = Math.max(1, Math.min(40, Math.round(n)));
    while (this.fishSystem.fish.length < n) {
      const k = this.fishSystem.fish.length;
      this.spawnFish(k === 0 ? 0 : null); // mix follows the reference set (mostly sarasa)
    }
    while (this.fishSystem.fish.length > n) {
      const f = this.fishSystem.fish[this.fishSystem.fish.length - 1];
      this.fishSystem.remove(f);
      if (this.selected === f) this.selected = this.fishSystem.fish[0];
    }
  }

  _initStudio() {
    const { scene, renderer } = this;
    scene.background = new THREE.Color(0x000000);
    scene.environment = bakeEnvironment(renderer, buildStudioEnvScene());
    scene.environmentIntensity = 0.9;
    U.uCausticParams.value.y = 0;
    U.uWaterDensity.value = 0;
    const key = new THREE.DirectionalLight(0xfff5ea, 3.2);
    key.position.set(0.4, 2.0, 1.0);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdde8ff, 0.8);
    fill.position.set(-1.5, 0.4, 1.2);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xbfd2e0, 0x201a14, 0.35));
    this.studioLights = { key, fill };
    const p = this.opts.params;
    const seed = this.opts.seed ?? 7;
    const colorType = p.has('color') ? Number(p.get('color')) : 0;
    const fish = new Fish(this.fishSystem.layout, { seed, colorType });
    fish.flume = true;
    this.fishSystem.add(fish);
    this.studioFish = fish;
    this.selected = fish;
    if (p.has('debug')) U.uDebugView.value = Number(p.get('debug'));
    this.anim.set(p.get('anim') || 'idle');
    this.studioView(p.get('view') || 'side');
  }

  studioView(v) {
    const f = this.studioFish;
    const SL = f.SL;
    const c = new THREE.Vector3(-0.18 * SL, 0, 0);
    const d = SL * 3.4 * Number(this.opts.params.get('zoom') || 1);
    const views = {
      side: [0, 0.02, d],
      top: [0, d, 0.001],
      front: [d * 0.9, 0.0, 0.0],
      q34: [d * 0.6, d * 0.35, d * 0.75],
      rear: [-d * 0.8, d * 0.25, d * 0.5],
      head: [SL * 0.9, SL * 0.1, SL * 1.3],
      dorsal: [-0.1 * SL, SL * 0.35, SL * 1.1],
      tail: [-0.9 * SL, 0.0, SL * 1.6],
      below: [0, -d, 0.001],
    };
    const pos = views[v] || views.side;
    if (v === 'head') c.set(0.25 * SL, 0, 0);
    if (v === 'dorsal') c.set(-0.2 * SL, 0.3 * SL, 0);
    if (v === 'tail') c.set(-0.95 * SL, 0, 0);
    this.camera.position.set(c.x + pos[0], c.y + pos[1], c.z + pos[2]);
    this.controls.target.copy(c);
    this.camera.lookAt(c);
    this.controls.update();
  }

  // ------------------------------------------------------------------ input
  _bindInput() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 5 && performance.now() - down.t < 400) this._click(e);
      down = null;
    });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if (k === 'f') this.feed();
      if (k === 't') this.tapGlass();
      if (k === 'l') this.loom();
      if (k === 'p') this.paused = !this.paused;
      if (k === 'h') this.toggleUI();
      if (k === 'n') this.selectNext();
      if (k === 'c') this.cameraMode = this.cameraMode === 'follow' ? 'orbit' : 'follow';
    });
  }

  toggleUI() {
    this.uiHidden = !this.uiHidden;
    const d = this.uiHidden ? 'none' : '';
    for (const id of ['hud', 'help', 'labels']) {
      const el = document.getElementById(id);
      if (el) el.style.display = d;
    }
    if (this.gui) this.gui.domElement.style.display = d;
  }

  selectNext() {
    const list = this.fishSystem.fish;
    if (!list.length) return;
    const i = list.indexOf(this.selected);
    this.selected = list[(i + 1) % list.length];
  }

  _click(e) {
    if (!this.world) return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    // select the fish nearest to the ray first
    let best = null;
    let bd = Infinity;
    for (const f of this.fishSystem.fish) {
      const dist = ray.ray.distanceToPoint(f.loc.pos);
      if (dist < f.SL * 0.5 && dist < bd) {
        bd = dist;
        best = f;
      }
    }
    if (best && !e.shiftKey) {
      this.selected = best;
      return;
    }
    // water surface seen from above -> feed there
    if (o.y > TANK.water && d.y < 0) {
      const t = (TANK.water - o.y) / d.y;
      const p = o.clone().addScaledVector(d, t);
      if (Math.abs(p.x) < TANK.L / 2 && Math.abs(p.z) < TANK.D / 2) {
        this.feed(p.x, p.z);
        return;
      }
    }
    // front glass -> tap (vibration stimulus)
    if (d.z < 0 && o.z > TANK.D / 2) {
      const t = (TANK.D / 2 - o.z) / d.z;
      const p = o.clone().addScaledVector(d, t);
      if (Math.abs(p.x) < TANK.L / 2 && p.y > 0 && p.y < TANK.H) this.tapGlass(p);
    }
  }

  feed(x = null, z = null, n = 10) {
    if (!this.world) return;
    if (x === null) {
      x = this.rng.range(-0.35, 0.35);
      z = this.rng.range(-0.05, 0.12);
    }
    this.world.food.drop(x, z, n, 'mixed');
  }

  tapGlass(p = null) {
    if (!this.world) return;
    if (!p) p = new THREE.Vector3(this.rng.range(-0.4, 0.4), this.rng.range(0.1, 0.35), TANK.D / 2);
    this.world.addStimulus('tap', p, 1.0);
  }

  loom() {
    if (!this.world) return;
    const p = new THREE.Vector3(this.rng.range(-0.4, 0.4), TANK.water + 0.1, this.rng.range(-0.1, 0.1));
    this.world.addStimulus('loom', p, 1.0);
  }

  // ------------------------------------------------------------------ loop
  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.post) this.post.setSize(w, h);
    if (this.world) {
      this.world.surface.resize(s.x, s.y);
      this.world.particles.resize(s.y);
    }
  }

  step(dt) {
    const t0 = performance.now();
    this.time += dt;
    U.uTime.value = this.time;
    this.anim.update(dt);
    for (const f of this.fishSystem.fish) {
      if (this.mode === 'studio') this.anim.applyStudio(f, dt);
      else if (this.animTarget === 'all' || f === this.selected) this.anim.applyAquarium(f, dt, this.world);
      else if (f.brain) {
        f.brain.forced = null;
        f.loc.override.enabled = false;
        f.loc.override.brake = false;
      }
      f.update(dt, this.time, this.world);
    }
    if (this.world) {
      resolveOverlaps(this.fishSystem.fish);
      this.world.update(dt, this.time);
    }
    this.perf.simMs = performance.now() - t0;
  }

  _updateCamera(dt) {
    if (this.cameraMode === 'follow' && this.selected) {
      const f = this.selected;
      const fwd = f.loc.forward;
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
      if (side.z < 0) side.negate(); // stay on the viewer's side of the fish
      const want = f.loc.pos.clone().addScaledVector(side, f.SL * 3.2).addScaledVector(fwd, -f.SL * 0.4);
      want.y += f.SL * 0.5;
      this.camera.position.lerp(want, 1 - Math.exp(-dt * 2.5));
      this.controls.target.lerp(f.loc.pos, 1 - Math.exp(-dt * 5));
    }
    this.controls.update();
  }

  render() {
    const t0 = performance.now();
    this.renderer.info.reset();
    this.fishSystem.update(this.camera, this.renderer);
    if (this.usePost) this.post.render();
    else this.renderer.render(this.scene, this.camera);
    // TIR mirror for the next frame (after the shadow maps of this frame exist)
    if (this.world) this.world.surface.renderReflection(this.camera);
    this.perf.renderMs = performance.now() - t0;
  }

  _tick() {
    const now = performance.now();
    const realDt = this._last ? (now - this._last) / 1000 : 1 / 60;
    const rawDt = Math.min(0.05, realDt);
    this._last = now;
    if (!this.paused) this.step(rawDt * this.timeScale);
    this._updateCamera(rawDt);
    this.debugDraw.update(this.fishSystem.fish, this.world, this.camera, this.selected);
    this.render();
    this.frame++;
    const p = this.perf;
    p.acc += realDt;
    p.n++;
    if (p.acc > 0.5) {
      p.fps = p.n / p.acc;
      p.frameMs = (p.acc / p.n) * 1000;
      p.acc = 0;
      p.n = 0;
      this._hud();
    }
  }

  _hud() {
    if (!this.hud || this.uiHidden) return;
    const info = this.renderer.info;
    const fs = this.fishSystem.stats;
    const s = this.selected;
    const lines = [
      `FPS ${this.perf.fps.toFixed(0)}  frame ${this.perf.frameMs.toFixed(1)} ms  sim(CPU) ${this.perf.simMs.toFixed(2)} ms  submit ${this.perf.renderMs.toFixed(1)} ms`,
      `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k  fish ${this.fishSystem.fish.length}  visible ${fs.visible}  LOD0/1/2 ${fs.lod.join('/')}`,
    ];
    if (s) {
      const b = s.brain;
      lines.push(
        `selected #${s.id} ${s.variation.colorName}  SL ${(s.SL * 100).toFixed(1)} cm  state ${b ? b.state : '-'}  gait ${s.loc.gait}  ${s.loc.debug.speedBL.toFixed(2)} BL/s  tail ${s.loc.freq.toFixed(2)} Hz ±${(s.loc.amp * 100).toFixed(1)}%SL`
      );
      if (b) {
        const d = b.drives;
        lines.push(`drives  hunger ${d.hunger.toFixed(2)}  fear ${d.fear.toFixed(2)}  fatigue ${d.fatigue.toFixed(2)}  social ${d.social.toFixed(2)}  curiosity ${d.curiosity.toFixed(2)}`);
      }
    }
    this.hud.textContent = lines.join('\n');
  }

  /** Render N time steps into a grid (motion inspection in headless tests). */
  _filmstrip(p) {
    const n = Number(p.get('strip'));
    const sdt = Number(p.get('stripDt') || 0.05);
    const cols = Number(p.get('cols') || 4);
    const rows = Math.ceil(n / cols);
    const r = this.renderer;
    const W = r.domElement.width / r.getPixelRatio();
    const H = r.domElement.height / r.getPixelRatio();
    const vw = W / cols;
    const vh = H / rows;
    this.camera.aspect = vw / vh;
    this.camera.updateProjectionMatrix();
    r.setScissorTest(true);
    r.autoClear = true;
    const dt = 1 / 120;
    for (let k = 0; k < n; k++) {
      if (k > 0) for (let t = 0; t < sdt - 1e-6; t += dt) this.step(dt);
      if (p.has('follow') && this.selected) for (let i = 0; i < 3; i++) this._updateCamera(1 / 30);
      this.fishSystem.update(this.camera, r);
      const x = (k % cols) * vw;
      const y = H - (Math.floor(k / cols) + 1) * vh;
      r.setViewport(x, y, vw, vh);
      r.setScissor(x, y, vw, vh);
      r.render(this.scene, this.camera);
    }
    r.setScissorTest(false);
  }

  /** Headless behaviour statistics (no rendering). */
  _probe(seconds) {
    const dt = 1 / 60;
    const stats = { states: {}, gaits: {}, speed: [], depth: [], wallMin: Infinity, collisions: 0, startles: 0, eaten: 0, tailHz: [] };
    const fish = this.fishSystem.fish;
    let foodBefore = 0;
    const t0 = performance.now();
    for (let t = 0, k = 0; t < seconds; t += dt, k++) {
      if (k % 1800 === 600) this.feed(this.rng.range(-0.3, 0.3), this.rng.range(-0.1, 0.1), 10);
      if (k % 2400 === 1200) this.tapGlass();
      foodBefore = this.world.food.items.length;
      this.step(dt);
      if (this.world.food.items.length < foodBefore) stats.eaten += foodBefore - this.world.food.items.length;
      if (k % 30 !== 0) continue;
      for (const f of fish) {
        const b = f.brain;
        stats.states[b.state] = (stats.states[b.state] || 0) + 1;
        stats.gaits[f.loc.gait] = (stats.gaits[f.loc.gait] || 0) + 1;
        stats.speed.push(f.loc.speed / f.SL);
        stats.depth.push(f.loc.pos.y / TANK.water);
        stats.tailHz.push(f.loc.freq);
        const wd = Math.min(TANK.L / 2 - Math.abs(f.loc.pos.x), TANK.D / 2 - Math.abs(f.loc.pos.z));
        stats.wallMin = Math.min(stats.wallMin, wd / f.SL);
        if (b.startleTime > t - 0.5 && b.startleTime <= t) stats.startles++;
        for (const o of fish) if (o !== f && o.loc.pos.distanceTo(f.loc.pos) < 0.25 * (f.SL + o.SL)) stats.collisions++;
      }
    }
    const q = (arr, p) => {
      const a = [...arr].sort((x, y) => x - y);
      return a[Math.floor(p * (a.length - 1))].toFixed(2);
    };
    const tot = Object.values(stats.states).reduce((a, b) => a + b, 0);
    const pct = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ((v / tot) * 100).toFixed(1) + '%']));
    console.log('PROBE ' + JSON.stringify({
      simSeconds: seconds,
      wallclockMs: Math.round(performance.now() - t0),
      msPerFrame: ((performance.now() - t0) / (seconds * 60)).toFixed(3),
      states: pct(stats.states),
      gaits: pct(stats.gaits),
      speedBL: { p10: q(stats.speed, 0.1), p50: q(stats.speed, 0.5), p90: q(stats.speed, 0.9), max: q(stats.speed, 1) },
      depthFrac: { p10: q(stats.depth, 0.1), p50: q(stats.depth, 0.5), p90: q(stats.depth, 0.9) },
      tailHz: { p10: q(stats.tailHz, 0.1), p50: q(stats.tailHz, 0.5), p90: q(stats.tailHz, 0.9) },
      minWallClearanceBL: stats.wallMin.toFixed(2),
      closeContacts: stats.collisions,
      foodEaten: stats.eaten,
      usPerFishUpdate: { brain: ((Fish.prof.brain / Fish.prof.n) * 1000).toFixed(1), loc: ((Fish.prof.loc / Fish.prof.n) * 1000).toFixed(1), rig: ((Fish.prof.rig / Fish.prof.n) * 1000).toFixed(1) },
    }));
  }

  _runTest() {
    const p = this.opts.params;
    if (p.has('probe')) {
      this._probe(Number(p.get('probe')));
      return;
    }
    const tWarm = Number(p.get('t') || 2);
    const dt = 1 / 60;
    if (p.has('anim')) {
      this.anim.set(p.get('anim'));
      if (p.get('animAll')) this.animTarget = 'all';
    }
    if (p.has('feed')) this.feed(0, 0.05, 12);
    for (let t = 0; t < tWarm; t += dt) {
      this.step(dt);
      if (p.has('tapAt') && Math.abs(t - Number(p.get('tapAt'))) < dt / 2) this.tapGlass(new THREE.Vector3(0, 0.2, TANK.D / 2));
    }
    if (p.has('cam')) {
      const c = p.get('cam').split(',').map(Number);
      this.camera.position.set(c[0], c[1], c[2]);
      if (c.length >= 6) this.controls.target.set(c[3], c[4], c[5]);
      this.controls.update();
    }
    if (p.has('follow') && this.selected) {
      this.cameraMode = 'follow';
      for (let i = 0; i < 200; i++) this._updateCamera(1 / 30);
    }
    for (const k of ['skeleton', 'velocity', 'target', 'collision', 'labels']) if (p.has(k)) this.debugDraw.flags[k] = true;
    if (p.has('debugRefl') && this.world) this.world.surface.material.uniforms.uDebugRefl.value = 1;
    if (p.has('hide')) {
      const names = p.get('hide').split(',');
      this.scene.traverse((o) => {
        if (names.includes(o.name)) o.visible = false;
      });
      if (names.includes('post')) this.usePost = false;
    }
    this.debugDraw.update(this.fishSystem.fish, this.world, this.camera, this.selected);
    if (p.has('strip')) this._filmstrip(p);
    else {
      this.render();
      this.render(); // second frame: reflection + shadows fully initialised
    }
    if (p.has('showRefl') && this.world) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.world.surface.rt.texture, depthTest: false }));
      const sc = new THREE.Scene();
      sc.add(q);
      this.renderer.setRenderTarget(null);
      this.renderer.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    }
  }
}
