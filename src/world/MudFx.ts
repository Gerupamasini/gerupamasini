import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshStandardMaterial, NormalBlending, PlaneGeometry, Points, Quaternion, ShaderMaterial, Vector3, type Scene,
} from 'three';

/**
 * Traces animals leave in the mud and water: fin prints, belly drags, hop imprints and bite pits pressed into the
 * surface (they glisten wet and fade over minutes), flying drops of water and clods of mud, and expanding ripple rings
 * on the water (handed to the water pass, which bends its surface normals with them).
 */
export type MarkKind = 'fin' | 'drag' | 'imprint' | 'bite' | 'scuff';
const KIND_ID: Record<MarkKind, number> = { fin: 0, drag: 1, imprint: 2, bite: 3, scuff: 4 };
const LIFE_S: Record<MarkKind, number> = { fin: 300, drag: 240, imprint: 360, bite: 200, scuff: 200 };

export interface RippleSink {
  addRipple(x: number, z: number, strength: number): void;
}

const MAX_MARKS = 640;
const MAX_DROPS = 900;

export class MudFx {
  readonly marks: InstancedMesh;
  private readonly markBirth: InstancedBufferAttribute;
  private readonly markData: InstancedBufferAttribute;
  private next = 0;
  private time = 0;
  private readonly uTime = { value: 0 };
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  // drops
  private readonly drops: Points;
  private readonly dPos: Float32Array;
  private readonly dVel: Float32Array;
  private readonly dCol: Float32Array;
  private readonly dSize: Float32Array;
  private readonly dLife: Float32Array;
  private readonly dGround: Float32Array;
  private dNext = 0;
  private dActive = 0;
  ripples: RippleSink | null = null;
  /** ground height for drops to land on */
  groundAt: (x: number, z: number) => number = () => -1e3;
  /** marks are suppressed beyond this distance from the viewer (they are millimetres across) */
  viewer = new Vector3();
  enabled = true;

  constructor(scene: Scene) {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.markBirth = new InstancedBufferAttribute(new Float32Array(MAX_MARKS).fill(-1e6), 1);
    this.markData = new InstancedBufferAttribute(new Float32Array(MAX_MARKS * 3), 3);
    this.markBirth.setUsage(DynamicDrawUsage);
    this.markData.setUsage(DynamicDrawUsage);
    geo.setAttribute('aBirth', this.markBirth);
    geo.setAttribute('aData', this.markData);
    const mat = new MeshStandardMaterial({ color: 0x1b1712, roughness: 0.28, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const uTime = this.uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aBirth;\nattribute vec3 aData;\nvarying vec2 vMk;\nvarying vec3 vMkData;\nvarying float vAge;\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMk = position.xz * 2.0;\nvMkData = aData;\nvAge = uTime - aBirth;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec2 vMk;
varying vec3 vMkData;
varying float vAge;
float mkHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float mkShape(vec2 p, float kind, out vec2 grad) {
  // p in -1..1 (x across, y along the mark); returns the depth of the depression 0..1 and its slope
  float d = 0.0;
  if (kind < 0.5) {            // fin print: a rounded fan pressed in, deeper at the heel, ray grooves
    vec2 q = vec2(p.x, p.y * 1.25 + 0.15);
    float r = length(q);
    d = smoothstep(1.0, 0.55, r) * (0.6 + 0.4 * smoothstep(0.6, -0.6, p.y));
    d *= 0.75 + 0.25 * cos(atan(q.x, q.y + 1.2) * 26.0);
  } else if (kind < 1.5) {     // belly drag: a long shallow trough
    d = smoothstep(1.0, 0.1, abs(p.x)) * smoothstep(1.0, 0.45, abs(p.y)) * 0.7;
  } else if (kind < 2.5) {     // hop imprint: the body's outline, head end wider
    float w = mix(0.38, 0.75, smoothstep(-0.8, 0.6, p.y));
    d = smoothstep(1.0, 0.55, abs(p.x) / w) * smoothstep(1.0, 0.7, abs(p.y));
  } else if (kind < 3.5) {     // bite pit
    d = smoothstep(1.0, 0.25, length(p));
  } else {                     // scuff: churned patch
    d = smoothstep(1.0, 0.3, length(p)) * (0.5 + 0.5 * mkHash(floor(p * 6.0)));
  }
  float e = 0.02;
  grad = vec2(0.0);
  return d;
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  float kind = vMkData.x, life = vMkData.y, strength = vMkData.z;
  vec2 g;
  float dep = mkShape(vMk, kind, g);
  vec2 gx = vec2(0.03, 0.0), gy = vec2(0.0, 0.03);
  vec2 gg;
  float dx = mkShape(vMk + gx, kind, gg) - mkShape(vMk - gx, kind, gg);
  float dy = mkShape(vMk + gy, kind, gg) - mkShape(vMk - gy, kind, gg);
  float fade = 1.0 - smoothstep(life * 0.5, life, vAge);
  // fresh prints are full of water: dark and glossy; they dry back toward the surrounding mud
  float fresh = 1.0 - smoothstep(0.0, life * 0.6, vAge);
  float rim = smoothstep(0.08, 0.0, abs(dep - 0.08)) * 0.5;
  diffuseColor.a = clamp(dep * 0.55 * strength + rim * 0.25, 0.0, 1.0) * fade;
  diffuseColor.rgb = mix(vec3(0.20, 0.17, 0.13), vec3(0.11, 0.095, 0.075), fresh);
  vMkGrad = vec2(dx, dy) * 3.0 * strength;`)
        .replace('#include <common>', '#include <common>\nvec2 vMkGrad;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(normal + (viewMatrix * vec4(vMkGrad.x, 0.0, vMkGrad.y, 0.0)).xyz * 0.6);');
    };
    this.marks = new InstancedMesh(geo, mat, MAX_MARKS);
    this.marks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 1;
    this.marks.name = 'mudMarks';
    const zero = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_MARKS; i++) this.marks.setMatrixAt(i, zero);
    scene.add(this.marks);

    // drops and clods
    this.dPos = new Float32Array(MAX_DROPS * 3).fill(-1e4);
    this.dVel = new Float32Array(MAX_DROPS * 3);
    this.dCol = new Float32Array(MAX_DROPS * 4);
    this.dSize = new Float32Array(MAX_DROPS);
    this.dLife = new Float32Array(MAX_DROPS);
    this.dGround = new Float32Array(MAX_DROPS);
    const dg = new BufferGeometry();
    dg.setAttribute('position', new BufferAttribute(this.dPos, 3).setUsage(DynamicDrawUsage));
    dg.setAttribute('color', new BufferAttribute(this.dCol, 4).setUsage(DynamicDrawUsage));
    dg.setAttribute('size', new BufferAttribute(this.dSize, 1).setUsage(DynamicDrawUsage));
    const dm = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * uScale / max(-mv.z, 0.01), 0.0, 24.0); }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC;
        void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0) discard;
          // a lit bead: bright upper-left highlight on water drops, matte clods
          float hl = smoothstep(0.35, 0.0, length(p - vec2(-0.35, -0.35))) * (1.0 - vC.a * 0.0);
          vec3 c = vC.rgb * (0.75 + 0.25 * (1.0 - r)) + hl * vec3(0.9) * step(0.5, vC.r + vC.g + vC.b);
          gl_FragColor = vec4(c, (1.0 - r * 0.4) * clamp(vC.a, 0.0, 1.0)); }`,
    });
    this.drops = new Points(dg, dm);
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 2;
    this.drops.name = 'mudDrops';
    scene.add(this.drops);
    void AdditiveBlending;
  }

  /** Press a mark into the surface at (x, y, z). length/width in metres, angle = heading of its long axis. */
  mark(kind: MarkKind, x: number, y: number, z: number, angle: number, length: number, width: number, strength = 1, normal?: Vector3): void {
    if (!this.enabled) return;
    if (this.viewer.distanceToSquared(this.v.set(x, y, z)) > 30 * 30) return;
    const i = this.next;
    this.next = (this.next + 1) % MAX_MARKS;
    this.q.setFromAxisAngle(this.up, angle);
    if (normal) {
      const tilt = new Quaternion().setFromUnitVectors(this.up, normal);
      this.q.premultiply(tilt);
    }
    this.m4.compose(this.v.set(x, y + 0.0004, z), this.q, this.s.set(width, 1, length));
    this.marks.setMatrixAt(i, this.m4);
    this.markBirth.setX(i, this.time);
    this.markData.setXYZ(i, KIND_ID[kind], LIFE_S[kind], strength);
    this.marks.instanceMatrix.needsUpdate = true;
    this.markBirth.needsUpdate = true;
    this.markData.needsUpdate = true;
  }

  /** Throw drops (water) or clods (mud) from a point: `energy` ~ launch speed (m/s), `n` particles. */
  splash(kind: 'water' | 'mud', x: number, y: number, z: number, energy: number, n: number, dirX = 0, dirZ = 0, size = 0.0012): void {
    if (!this.enabled) return;
    if (this.viewer.distanceToSquared(this.v.set(x, y, z)) > 40 * 40) return;
    const col = kind === 'water' ? [0.75, 0.8, 0.82, 0.7] : [0.2, 0.17, 0.13, 0.95];
    for (let k = 0; k < n; k++) {
      const i = this.dNext;
      this.dNext = (this.dNext + 1) % MAX_DROPS;
      const a = Math.random() * Math.PI * 2;
      const up = 0.5 + Math.random() * 0.9;
      const sp = energy * (0.35 + Math.random() * 0.75);
      this.dPos[i * 3] = x; this.dPos[i * 3 + 1] = y + 0.001; this.dPos[i * 3 + 2] = z;
      this.dVel[i * 3] = Math.cos(a) * sp * 0.6 + dirX * energy * 0.5;
      this.dVel[i * 3 + 1] = up * sp;
      this.dVel[i * 3 + 2] = Math.sin(a) * sp * 0.6 + dirZ * energy * 0.5;
      const jitter = 0.85 + Math.random() * 0.3;
      this.dCol.set([col[0] * jitter, col[1] * jitter, col[2] * jitter, col[3]], i * 4);
      this.dSize[i] = size * (0.4 + Math.random() * 1.0);
      this.dLife[i] = 0.9 + Math.random() * 0.6;
      this.dGround[i] = this.groundAt(x, z);
    }
    this.dActive = MAX_DROPS;
  }

  ripple(x: number, z: number, strength: number): void {
    this.ripples?.addRipple(x, z, strength);
  }

  update(dt: number, camFov = 60, viewportH = 720): void {
    this.time += dt;
    this.uTime.value = this.time;
    (this.drops.material as ShaderMaterial).uniforms.uScale.value = viewportH / (2 * Math.tan((camFov * Math.PI) / 360));
    if (!this.dActive) return;
    let alive = 0;
    const g = 9.81;
    for (let i = 0; i < MAX_DROPS; i++) {
      if (this.dLife[i] <= 0) continue;
      this.dLife[i] -= dt;
      const k = i * 3;
      this.dVel[k + 1] -= g * dt;
      this.dPos[k] += this.dVel[k] * dt;
      this.dPos[k + 1] += this.dVel[k + 1] * dt;
      this.dPos[k + 2] += this.dVel[k + 2] * dt;
      if (this.dPos[k + 1] < this.dGround[i]) { this.dLife[i] = Math.min(this.dLife[i], 0.08); this.dPos[k + 1] = this.dGround[i]; this.dVel[k] = this.dVel[k + 2] = this.dVel[k + 1] = 0; }
      if (this.dLife[i] <= 0) { this.dPos[k + 1] = -1e4; this.dCol[i * 4 + 3] = 0; continue; }
      this.dCol[i * 4 + 3] = Math.min(this.dCol[i * 4 + 3], this.dLife[i] * 4);
      alive++;
    }
    const geo = this.drops.geometry;
    (geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as BufferAttribute).needsUpdate = true;
    (geo.getAttribute('size') as BufferAttribute).needsUpdate = true;
    if (!alive) this.dActive = 0;
  }

  dispose(): void {
    this.marks.removeFromParent();
    this.marks.geometry.dispose();
    (this.marks.material as MeshStandardMaterial).dispose();
    this.drops.removeFromParent();
    this.drops.geometry.dispose();
    (this.drops.material as ShaderMaterial).dispose();
  }
}

export const MUD_COLORS: Record<string, Color> = {
  mud: new Color(0.24, 0.205, 0.165),
  muddy_sand: new Color(0.36, 0.3, 0.21),
  sand: new Color(0.5, 0.42, 0.3),
  gravel: new Color(0.34, 0.31, 0.27),
  channel: new Color(0.22, 0.19, 0.15),
};
