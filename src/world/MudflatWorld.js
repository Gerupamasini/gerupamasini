import * as THREE from 'three';
import { CrustaceanBurrow } from '../habitat/CrustaceanBurrow.js';
import { Simplex3, mulberry32, smoothstep, clamp, lerp } from '../creatures/edohaze/EdohazeMath.js';
import { causticsGLSL, EdohazeShared } from '../creatures/edohaze/EdohazeShaders.js';

// Estuarine sandy-mud flat patch (metres, +Y up). Implements the Edohaze world
// adapter. Height is analytic so fish queries match the rendered mesh exactly.
export class MudflatWorld {
  constructor(scene, { size = 3.0, seed = 3 } = {}) {
    this.scene = scene; this.size = size;
    this.rand = mulberry32(seed);
    this.noise = new Simplex3(seed);
    this.time = 0;
    this.tide = { mean: 0.20, amp: 0.17, periodS: 360, phase: 1.2, manual: null }; // compressed semidiurnal tide
    this.daylight = 1; this.month = 4; // April: spawning season (confirmed Mar–May)
    this.visibility = 1.3;
    this.fish = [];
    this.threats = [];
    this.prey = [];
    this._buildBurrows();
    this._buildTerrain();
    this._buildBurrowTubes();
    this._buildShells();
  }

  // ---------------------------------------------------------------- terrain
  baseHeight(x, z) {
    const n = this.noise;
    let h = -0.012 * x - 0.006 * z;                              // gentle slope → one side drains first
    h += 0.018 * n.fbm(x * 0.8, 0, z * 0.8, 3);                  // broad undulation
    // current ripples (sandy areas stronger), λ ≈ 5–7 cm, slightly sinuous crests
    const sand = this.sandiness(x, z);
    const rp = (x * 0.94 + z * 0.34) * (2 * Math.PI / 0.06) + 1.8 * n.noise(x * 3, 1, z * 3);
    const ripple = Math.pow(0.5 + 0.5 * Math.sin(rp), 1.6) - 0.45;
    h += ripple * lerp(0.0012, 0.0035, sand);
    h += 0.0012 * n.noise(x * 25, 2, z * 25);                    // micro-relief
    return h;
  }
  sandiness(x, z) { return smoothstep(-0.2, 0.5, this.noise.fbm(x * 0.9 + 10, 3, z * 0.9, 2)); }

  getGroundHeight(x, z) {
    let h = this.baseHeight(x, z);
    for (const b of this.burrows) {
      const dx = x - b.opening.x, dz = z - b.opening.z; const d2 = dx * dx + dz * dz;
      if (b.moundHeight > 0) {
        const R = b.moundRadius; if (d2 > R * R) continue;
        const d = Math.sqrt(d2);
        const cone = b.moundHeight * (1 - smoothstep(b.radius * 1.2, R, d));   // ejecta volcano
        const crater = -0.003 * (1 - smoothstep(0, b.radius * 1.8, d));
        h += cone + crater;
      } else {
        const R = b.radius * 3; if (d2 > R * R) continue;
        h -= 0.003 * (1 - smoothstep(b.radius, R, Math.sqrt(d2)));          // shallow funnel
      }
    }
    return h;
  }
  getGroundNormal(x, z, out = new THREE.Vector3()) {
    const e = 0.004;
    const hx = this.getGroundHeight(x + e, z) - this.getGroundHeight(x - e, z);
    const hz = this.getGroundHeight(x, z + e) - this.getGroundHeight(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  getSubstrate(x, z) { const s = this.sandiness(x, z); return s > 0.7 ? 'sand' : s > 0.3 ? 'sandy_mud' : 'mud'; }
  inBounds(p) { return Math.abs(p.x) < this.size * 0.42 && Math.abs(p.z) < this.size * 0.42; }

  _buildBurrows() {
    this.burrows = [];
    const r = this.rand;
    const tries = 22;
    for (let i = 0; i < tries; i++) {
      const p = new THREE.Vector3((r() - 0.5) * this.size * 0.75, 0, (r() - 0.5) * this.size * 0.75);
      if (this.burrows.some((b) => b.opening.distanceTo(p) < 0.12)) continue;
      const type = r() < 0.65 ? 'nihonotrypaea' : 'upogebia';
      let partner = null;
      if (type === 'upogebia') { const a = r() * 6.28; partner = p.clone().add(new THREE.Vector3(Math.cos(a) * 0.09, 0, Math.sin(a) * 0.09)); }
      const b = new CrustaceanBurrow({ type, opening: p, groundY: this.baseHeight(p.x, p.z), rand: r, partnerOpening: partner });
      this.burrows.push(b);
    }
    // seat openings exactly on the final surface (mound crater / funnel)
    for (const b of this.burrows) {
      b.shiftY(this.getGroundHeight(b.opening.x, b.opening.z) - b.opening.y);
      if (b.partnerOpening) b.partnerOpening.y = this.getGroundHeight(b.partnerOpening.x, b.partnerOpening.z);
    }
  }

  _buildTerrain() {
    const N = 420, S = this.size;
    const geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.getGroundHeight(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const holes = this.burrows.flatMap((b) => [b.opening, b.partnerOpening].filter(Boolean).map((o) => new THREE.Vector4(o.x, o.z, b.radius, b.type === 'nihonotrypaea' ? 1 : 0)));
    while (holes.length < 48) holes.push(new THREE.Vector4(1e4, 1e4, 0, 0));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, EdohazeShared.uniforms, { uHoles: { value: holes } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vW; uniform vec4 uHoles[48];
uniform float uTime; uniform vec3 uSunDirView; uniform vec3 uSunColor; uniform float uCaustic; uniform float uCausticScale; uniform float uWaterY;
${causticsGLSL}
float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1))) * 43758.55); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+1.),f.x), f.y); }
float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }
`).replace('#include <color_fragment>', `#include <color_fragment>
  float rim = 0.0;
  for (int i = 0; i < 48; i++) {
    vec4 H = uHoles[i]; float d = distance(vW.xz, H.xy);
    if (d < H.z) discard;
    rim = max(rim, (1.0 - smoothstep(H.z, H.z * (H.w > 0.5 ? 2.6 : 2.0), d)));
  }
  float sandN = fbm2(vW.xz * 1.1 + 10.0);
  float grain = fbm2(vW.xz * 900.0);
  float mottle = fbm2(vW.xz * 18.0);
  vec3 mud = vec3(0.105, 0.092, 0.07), sand = vec3(0.21, 0.185, 0.14), dark = vec3(0.05, 0.043, 0.035);
  vec3 c = mix(mud, sand, smoothstep(0.45, 0.65, sandN));
  c *= 0.85 + 0.3 * mottle; c *= 0.88 + 0.24 * grain;
  c = mix(c, dark, rim * 0.7);                       // reduced (anoxic) sediment at burrow lining
  // biofilm (diatom) tint in patches
  c = mix(c, c * vec3(0.92, 0.95, 0.78), smoothstep(0.55, 0.8, fbm2(vW.xz * 4.0 + 3.0)) * 0.6);
  diffuseColor.rgb = c;`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * (0.8 + 0.4 * fbm2(vW.xz * 60.0));`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { float cc = edoCaustics(vW, uTime, uCausticScale, uWaterY);
    reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * cc * uCaustic * clamp(dot(normal, uSunDirView), 0.0, 1.0) * 0.6; }`);
    };
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true; this.terrain.name = 'mudflat';
    this.scene.add(this.terrain);
  }

  _buildBurrowTubes() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.9, side: THREE.BackSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDepth;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDepth = uv.x;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDepth;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= exp(-vDepth * 9.0);');
    };
    this.burrowMeshes = [];
    for (const b of this.burrows) {
      const pts = [];
      for (let d = -0.001; d <= b.usableDepth; d += 0.006) pts.push(b.pointAt(d));
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, b.radius * 1.02, 14, false), mat);
      this.scene.add(tube); this.burrowMeshes.push(tube);
      if (b.partnerOpening) {
        const p2 = [b.partnerOpening.clone(), b.partnerOpening.clone().setY(b.partnerOpening.y - 0.06)];
        const t2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(p2[0], p2[1]), 4, b.radius * 1.02, 14, false), mat);
        this.scene.add(t2);
      }
    }
  }

  _buildShells() {
    // small bivalve fragments / granules for scale and substrate realism
    const r = this.rand;
    const geo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45);
    const mat = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.55, side: THREE.DoubleSide });
    const N = 240; const inst = new THREE.InstancedMesh(geo, mat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      p.set((r() - 0.5) * this.size * 0.9, 0, (r() - 0.5) * this.size * 0.9);
      p.y = this.getGroundHeight(p.x, p.z) - 0.0005;
      const sz = 0.002 + Math.pow(r(), 3) * 0.009;
      s.set(sz, sz * 0.35, sz * 0.8);
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6 + (r() < 0.4 ? Math.PI : 0)));
      m.compose(p, q, s); inst.setMatrixAt(i, m);
      inst.setColorAt(i, c.setHSL(0.09 + r() * 0.04, 0.12 + r() * 0.1, 0.45 + r() * 0.35));
    }
    inst.castShadow = true; inst.receiveShadow = true;
    this.scene.add(inst);
  }

  // ---------------------------------------------------------------- environment API
  getWaterLevel() {
    if (this.tide.manual !== null) return this.tide.manual;
    return this.tide.mean + this.tide.amp * Math.sin(2 * Math.PI * this.time / this.tide.periodS + this.tide.phase);
  }
  getTideRate() {
    if (this.tide.manual !== null) return 0;
    return this.tide.amp * 2 * Math.PI / this.tide.periodS * Math.cos(2 * Math.PI * this.time / this.tide.periodS + this.tide.phase);
  }
  getBurrows() { return this.burrows; }
  getThreats() { return this.threats.filter((t) => t.active !== false); }
  getPrey() { return this.prey; }
  consumePrey(p) { p.alive = false; if (p.onEaten) p.onEaten(); }
  getConspecifics() { return this.fish; }
  getVisibility() { return this.visibility; }
  getDaylight() { return this.daylight; }
  isBreedingSeason() { return [3, 4, 5].includes(this.month); }

  update(dt) { this.time += dt; }
}
