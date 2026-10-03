import { Mesh, PlaneGeometry, Quaternion, ShaderMaterial, Vector2, Vector3, type Object3D } from 'three';
import type { Motor } from './Motor';

const UP = new Vector3(0, 1, 0);

/**
 * Soft contact shadow under a mudskipper: the dark line where the belly and tail rest on the mud, a deeper patch
 * under the chest, and two small dark spots where the pectoral fins press into it. It thins as the body is lifted
 * and is gone in mid-jump. (The sun's shadow map is far too coarse for an 8 cm fish.)
 */
export class ContactShadow {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private readonly q = new Quaternion();
  private readonly n = new Vector3();
  private readonly t = new Vector3();

  constructor(parent: Object3D) {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mat = new ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: {
        uHalf: { value: new Vector2(1, 1) }, uBody: { value: new Vector3(0, 0, 0.01) }, uOpacity: { value: 0.5 },
        uFinL: { value: new Vector3(0, 0, 0) }, uFinR: { value: new Vector3(0, 0, 0) }, uLift: { value: 0 }, uChest: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vP; uniform vec2 uHalf; void main() { vP = vec2(position.x, position.z) * 2.0 * uHalf; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vP; uniform vec3 uBody; uniform float uOpacity, uLift; uniform vec3 uFinL, uFinR; uniform vec2 uHalf; uniform float uChest;
        // capsule from z = uBody.x (head) to uBody.y (tail), radius uBody.z, tapering toward the tail
        float capsule(vec2 p) { float z = clamp(p.y, uBody.y, uBody.x); float t = (uBody.x - z) / max(uBody.x - uBody.y, 1e-4);
          float r = uBody.z * mix(1.0, 0.35, t); return length(vec2(p.x, p.y - z)) - r; }
        void main() {
          float d = capsule(vP);
          float soft = uBody.z * (0.7 + 2.2 * uLift);
          float a = (1.0 - smoothstep(-uBody.z * 0.5, soft, d)) * 0.7;
          // deeper under the chest and the pelvic fins
          vec2 c = vec2(0.0, uChest);
          a += 0.3 * exp(-dot(vP - c, vP - c) / (uBody.z * uBody.z * 3.0));
          a *= mix(1.0, 0.25, smoothstep(0.0, 1.0, uLift));
          float fl = uFinL.z * exp(-dot(vP - uFinL.xy, vP - uFinL.xy) / (uBody.z * uBody.z * 0.2));
          float fr = uFinR.z * exp(-dot(vP - uFinR.xy, vP - uFinR.xy) / (uBody.z * uBody.z * 0.2));
          a = max(a, max(fl, fr) * 0.75);
          a *= smoothstep(1.0, 0.8, abs(vP.x) / uHalf.x) * smoothstep(1.0, 0.88, abs(vP.y) / uHalf.y);
          gl_FragColor = vec4(0.02, 0.018, 0.015, clamp(a, 0.0, 1.0) * uOpacity);
        }`,
    });
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.name = 'contactShadow';
    this.mesh.renderOrder = 0;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  update(m: Motor, ground: (x: number, z: number) => number, normal: (x: number, z: number, out: Vector3) => Vector3, fins: boolean): void {
    const L = m.L;
    const u = this.mat.uniforms;
    const visible = !m.hidden && m.gait !== 'dive' && m.gait !== 'emerge';
    this.mesh.visible = visible;
    if (!visible) return;
    // the footprint is centred behind the girdle
    const back = 0.28 * L;
    const f = this.t.set(Math.sin(m.heading), 0, Math.cos(m.heading));
    const cx = m.pos.x - f.x * back, cz = m.pos.z - f.z * back;
    const g = ground(cx, cz);
    const h = Math.max(0, m.pos.y - ground(m.pos.x, m.pos.z));
    this.mesh.position.set(cx, g + 0.0006, cz);
    normal(cx, cz, this.n);
    this.q.setFromUnitVectors(UP, this.n);
    this.mesh.quaternion.setFromAxisAngle(UP, m.heading).premultiply(this.q);
    const halfW = 0.24 * L, halfL = 0.66 * L;
    u.uChest.value = back;
    this.mesh.scale.set(halfW * 2, 1, halfL * 2);
    u.uHalf.value.set(halfW, halfL);
    // body capsule in the footprint's frame: head 0.22 L ahead of the girdle, tail tip 0.78 L behind it
    (u.uBody.value as Vector3).set(0.2 * L + back, -0.72 * L + back, 0.068 * L);
    const lift = Math.min(1, h / (0.12 * L));
    u.uLift.value = lift;
    u.uOpacity.value = m.medium === 'water' ? 0.25 : 0.55;
    const fin = (side: number, out: Vector3) => {
      if (!fins) { out.set(0, 0, 0); return; }
      const c = m.fins.find((x) => x.side === side);
      if (!c || m.gait === 'swim' || (m.gait === 'hop')) { out.set(0, 0, 0); return; }
      const dx = c.contact.x - cx, dz = c.contact.z - cz;
      const lx = dx * Math.cos(m.heading) - dz * Math.sin(m.heading);
      const lz = dx * Math.sin(m.heading) + dz * Math.cos(m.heading);
      const press = c.planted ? 1 : Math.max(0, 1 - (c.contact.y - ground(c.contact.x, c.contact.z)) / (0.03 * L));
      out.set(lx, lz, press);
    };
    fin(1, u.uFinL.value as Vector3);
    fin(-1, u.uFinR.value as Vector3);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
