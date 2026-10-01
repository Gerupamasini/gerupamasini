// Subtle sand interaction: a few heavy grains that ballistically fall back + a faint fine-silt puff
// that drifts with the current and fades. Pooled, one draw call each.
import * as THREE from 'three';

const GRAIN_VS = `
attribute float aLife; attribute float aSize;
varying float vLife;
void main(){ vLife = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const GRAIN_FS = `
uniform vec3 uColor; uniform float uSoft; varying float vLife;
void main(){ if (vLife <= 0.0) discard; vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float a = uSoft > 0.5 ? smoothstep(0.5, 0.0, d) * 0.22 : step(d, 0.5);
  gl_FragColor = vec4(uColor, a * clamp(vLife, 0.0, 1.0)); if (gl_FragColor.a < 0.01) discard; }`;

class Pool {
  constructor(n, color, soft) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.size = new Float32Array(n); this.decay = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: GRAIN_VS, fragmentShader: GRAIN_FS, transparent: true, depthWrite: false,
      uniforms: { uColor: { value: color }, uSoft: { value: soft ? 1 : 0 } },
    }));
    this.points.frustumCulled = false;
    this.soft = soft;
  }
  emit(p, v, size, decay) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = 1; this.size[i] = size; this.decay[i] = decay;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }
  update(dt, groundY, current) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      if (this.soft) {
        this.vel[k] = this.vel[k] * 0.96 + current.x * 0.04; this.vel[k + 2] = this.vel[k + 2] * 0.96 + current.z * 0.04;
        this.vel[k + 1] = this.vel[k + 1] * 0.95 - 0.0004;
        this.size[i] *= 1 + dt * 0.8;
      } else {
        this.vel[k + 1] -= 0.35 * dt;                    // grains sink quickly in water (drag-limited)
        this.vel[k] *= 0.9; this.vel[k + 2] *= 0.9; this.vel[k + 1] *= 0.95;
      }
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const gy = groundY(this.pos[k], this.pos[k + 2]);
      if (this.pos[k + 1] < gy) { this.pos[k + 1] = gy; if (!this.soft) this.life[i] = 0; }
      this.life[i] -= this.decay[i] * dt;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aLife.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
}

export class SandParticles extends THREE.Group {
  constructor(rng) {
    super();
    this.rng = rng;
    this.grains = new Pool(600, new THREE.Color(0.74, 0.68, 0.56), false);
    this.silt = new Pool(160, new THREE.Color(0.66, 0.62, 0.52), true);
    this.add(this.grains.points, this.silt.points);
  }
  // intensity 0..1 ; heading = fish heading (grains kicked backward/sideways)
  emit(pos, intensity, heading) {
    const r = this.rng;
    const nG = Math.round(4 + intensity * 26), nS = Math.round(1 + intensity * 5);
    const back = new THREE.Vector3(-Math.cos(heading), 0, Math.sin(heading));
    for (let i = 0; i < nG; i++) {
      const v = new THREE.Vector3((r() - 0.5) * 0.08, 0.03 + r() * 0.08 * intensity, (r() - 0.5) * 0.08).addScaledVector(back, 0.05 * intensity);
      this.grains.emit(pos.clone().add(new THREE.Vector3((r() - 0.5) * 0.01, 0.001, (r() - 0.5) * 0.01)), v, 0.0006 + r() * 0.0006, 0.6);
    }
    for (let i = 0; i < nS; i++) {
      const v = new THREE.Vector3((r() - 0.5) * 0.03, 0.006 + r() * 0.01, (r() - 0.5) * 0.03).addScaledVector(back, 0.02 * intensity);
      this.silt.emit(pos.clone().add(new THREE.Vector3(0, 0.003, 0)), v, 0.012 + r() * 0.01 * intensity, 0.35 + r() * 0.3);
    }
  }
  update(dt, groundY, current) { this.grains.update(dt, groundY, current); this.silt.update(dt, groundY, current); }
}
