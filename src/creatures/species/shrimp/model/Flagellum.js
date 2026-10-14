import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Antennal flagellum simulated as a Verlet chain in world space with
 * hydrodynamic drag, bending stiffness (decreasing toward the tip) and an
 * actively driven root direction. Rendered as a tapered tube rebuilt each frame.
 */
export class Flagellum {
  constructor({ length, nodes, rootRadius, tipRadius, material, stiffness = 0.5, annuli = true }) {
    this.n = nodes;
    this.seg = length / (nodes - 1);
    this.p = Array.from({ length: nodes }, () => new THREE.Vector3());
    this.q = Array.from({ length: nodes }, () => new THREE.Vector3());
    this.stiffness = stiffness;
    this.rootRadius = rootRadius;
    this.tipRadius = tipRadius;
    this.initialized = false;
    this.rootPos = new THREE.Vector3();
    this.rootDir = new THREE.Vector3(1, 0, 0);

    const radial = 5;
    this.radial = radial;
    const count = nodes * radial;
    this.positions = new Float32Array(count * 3);
    this.normals = new Float32Array(count * 3);
    const idx = [];
    for (let i = 0; i < nodes - 1; i++) {
      for (let k = 0; k < radial; k++) {
        const a = i * radial + k;
        const b = i * radial + ((k + 1) % radial);
        idx.push(a, a + radial, b, b, a + radial, b + radial);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.annuli = annuli;
  }

  reset(rootPos, dir) {
    for (let i = 0; i < this.n; i++) {
      this.p[i].copy(rootPos).addScaledVector(dir, i * this.seg);
      this.q[i].copy(this.p[i]);
    }
    this.initialized = true;
  }

  /**
   * @param dt seconds
   * @param rootPos world position of flagellum base
   * @param rootDir world unit direction the peduncle points (active control)
   * @param waterVel function(pos, out) -> world water velocity at pos
   * @param groundY function(x,z) -> floor height (for contact)
   */
  update(dt, rootPos, rootDir, waterVel, groundY) {
    if (!this.initialized) this.reset(rootPos, rootDir);
    const n = this.n;
    const h = Math.min(dt, 1 / 30);
    // Integrate with drag toward local water velocity (very overdamped at this Re).
    const drag = 18;
    for (let i = 1; i < n; i++) {
      const p = this.p[i];
      const q = this.q[i];
      _v.subVectors(p, q); // displacement ~ vel*h
      waterVel(p, _w);
      _w.multiplyScalar(h);
      _v.lerp(_w, Math.min(1, drag * h));
      q.copy(p);
      p.add(_v);
    }
    this.p[0].copy(rootPos);
    this.q[0].copy(rootPos);

    for (let it = 0; it < 8; it++) {
      // Active root: the proximal articles follow the peduncle direction.
      this.p[1].lerp(_v.copy(rootPos).addScaledVector(rootDir, this.seg), 0.9);
      this.p[2].lerp(_v.copy(rootPos).addScaledVector(rootDir, this.seg * 2), 0.35 * this.stiffness);
      // Bending stiffness as symmetric Laplacian smoothing (no kinks), weaker toward the tip.
      for (let i = 2; i < n - 1; i++) {
        const k = this.stiffness * 0.5 * Math.pow(1 - i / n, 1.2);
        _v.addVectors(this.p[i - 1], this.p[i + 1]).multiplyScalar(0.5);
        _w.subVectors(_v, this.p[i]).multiplyScalar(k);
        this.p[i].add(_w);
        this.p[i - 1].addScaledVector(_w, i > 2 ? -0.25 : 0);
        this.p[i + 1].addScaledVector(_w, -0.25);
      }
      // Distance constraints (inextensible).
      for (let i = 0; i < n - 1; i++) {
        const a = this.p[i];
        const b = this.p[i + 1];
        _dir.subVectors(b, a);
        const d = _dir.length() || 1e-9;
        const diff = (d - this.seg) / d;
        if (i === 0) b.addScaledVector(_dir, -diff);
        else {
          a.addScaledVector(_dir, diff * 0.5);
          b.addScaledVector(_dir, -diff * 0.5);
        }
      }
      // Floor contact.
      if (groundY) {
        for (let i = 2; i < n; i++) {
          const gy = groundY(this.p[i].x, this.p[i].z) + this.tipRadius * 2;
          if (this.p[i].y < gy) this.p[i].y = gy;
        }
      }
    }
    this.rebuild();
  }

  rebuild() {
    const n = this.n;
    const R = this.radial;
    const pos = this.positions;
    const nor = this.normals;
    let prevN = null;
    for (let i = 0; i < n; i++) {
      const a = this.p[Math.max(0, i - 1)];
      const b = this.p[Math.min(n - 1, i + 1)];
      _dir.subVectors(b, a).normalize();
      // Parallel-transport-ish frame.
      if (!prevN) {
        _n.crossVectors(_dir, Math.abs(_dir.y) > 0.9 ? _v.set(1, 0, 0) : _up).normalize();
      } else {
        _n.copy(prevN).addScaledVector(_dir, -prevN.dot(_dir)).normalize();
      }
      prevN = (prevN || new THREE.Vector3()).copy(_n);
      _b.crossVectors(_dir, _n);
      const t = i / (n - 1);
      let r = THREE.MathUtils.lerp(this.rootRadius, this.tipRadius, Math.pow(t, 0.7));
      if (this.annuli) r *= 1 + 0.12 * (i % 2); // articles of the flagellum
      for (let k = 0; k < R; k++) {
        const ang = (k / R) * Math.PI * 2;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const nx = _n.x * c + _b.x * s;
        const ny = _n.y * c + _b.y * s;
        const nz = _n.z * c + _b.z * s;
        const o = (i * R + k) * 3;
        pos[o] = this.p[i].x + nx * r;
        pos[o + 1] = this.p[i].y + ny * r;
        pos[o + 2] = this.p[i].z + nz * r;
        nor[o] = nx;
        nor[o + 1] = ny;
        nor[o + 2] = nz;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
  }

  tip(out) {
    return out.copy(this.p[this.n - 1]);
  }
}
