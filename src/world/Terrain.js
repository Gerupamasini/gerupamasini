import * as THREE from 'three';
import { fbm2, valueNoise2 } from '../core/noise.js';
import { SURFACE, SURFACE_RULES, emersionPreyFactor } from './SurfaceTypes.js';

// Tidal flat terrain: height field, substrate (mud / sand / vegetation), and dynamic surface type
// from the tide (submerged → shallow/deep water; recently emerged → wet; later → dry).
// Coordinates in metres. Sea toward −Z, land toward +Z.

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Terrain {
  constructor({ size = 260, segments = 256, seed = 7, tide } = {}) {
    this.size = size;
    this.half = size / 2;
    this.segments = segments;
    this.seed = seed;
    this.tide = tide;
    this.mesh = this._buildMesh();
    this.water = this._buildWater();
  }

  // ------------------------------------------------------------------ analytic fields
  creekCentre(z) {
    return 16 * Math.sin(z * 0.024 + 0.6) + 6 * Math.sin(z * 0.071 + 1.3) - 8;
  }

  heightAt(x, z) {
    // gentle intertidal slope (≈1.2 cm/m), steeper upper beach and a low dune/vegetated ridge
    let h = -1.6 + 0.012 * (z + 150);
    h += 0.048 * Math.max(0, z - 38) - 0.02 * Math.max(0, z - 72);
    // sand bars / runnels and low-frequency relief
    h += 0.07 * Math.sin(x * 0.045 + fbm2(x * 0.01, z * 0.01, 2, this.seed) * 2.5) * smooth(-120, -20, z) * (1 - smooth(25, 40, z));
    h += 0.09 * fbm2(x * 0.018, z * 0.018, 3, this.seed + 3);
    // meandering tidal creek (deeper seaward)
    if (z < 34) {
      const dx = x - this.creekCentre(z);
      const w = 3.5 + 0.035 * (34 - z);
      // the creek head grades up over 2 m: ending it at full depth left a 25 cm step in heightAt at z = 34,
      // which teleported birds (and the follow camera) walking across it (tools/dev/gaitjitter.mjs)
      const depth = (0.55 * smooth(34, 10, z) + 0.25) * smooth(34, 32, z);
      h -= depth * Math.exp(-(dx * dx) / (w * w));
    }
    return h;
  }

  /** Substrate weights {mud, sand, veg} (sum 1) */
  substrate(x, z) {
    const h = this.heightAt(x, z);
    const n = fbm2(x * 0.02, z * 0.02, 3, this.seed + 11);
    // mud accumulates low on the flat and along the creek banks; sand on bars and upper shore
    let mud = smooth(18, -35, z + n * 30);
    if (z < 34) {
      const dx = Math.abs(x - this.creekCentre(z));
      mud = Math.max(mud, Math.exp(-((dx - 5) ** 2) / 30) * 0.9);
    }
    mud = Math.min(1, Math.max(0, mud - smooth(0.02, 0.1, h - 0.95) * 0.9));
    let veg = smooth(1.35, 1.6, h + n * 0.25);
    const sand = Math.max(0, 1 - mud - veg);
    const sum = mud + sand + veg || 1;
    return { mud: mud / sum, sand: sand / sum, veg: veg / sum };
  }

  /**
   * Surface at (x,z) now: { type, key, h, depth, exposedFor, wet, preyFactor }
   */
  surfaceAt(x, z) {
    const h = this.heightAt(x, z);
    const L = this.tide.level;
    const depth = L - h;
    if (depth > SURFACE_RULES.deepWaterDepth) return this._s('deepWater', h, depth, -1);
    if (depth > 0) return this._s('shallowWater', h, depth, -1);
    const sub = this.substrate(x, z);
    const exposed = this.tide.timeSinceExposed(h);
    if (sub.veg > 0.5) return this._s('vegetation', h, depth, exposed);
    const wet = exposed < SURFACE_RULES.wetDuration;
    if (sub.mud > 0.5) return this._s(wet ? 'wetMud' : 'mud', h, depth, exposed);
    if (wet) return this._s('wetSand', h, depth, exposed);
    return this._s(exposed > SURFACE_RULES.drySandDuration ? 'drySand' : 'sand', h, depth, exposed);
  }

  _s(key, h, depth, exposed) {
    const def = SURFACE[key];
    return { key, def, h, depth, exposedFor: exposed, preyFactor: def.preyProbability * (exposed >= 0 ? emersionPreyFactor(Math.min(exposed, 12 * 3600)) : key === 'shallowWater' ? 0.6 : 0) };
  }

  /** Approximate distance to the water's edge (m): sampled rays, capped at maxD. */
  distanceToWater(x, z, maxD = 40) {
    const L = this.tide.level;
    if (this.heightAt(x, z) < L) return 0;
    let best = maxD;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      for (let d = 1; d < best; d += d < 6 ? 0.5 : 2) {
        if (this.heightAt(x + dx * d, z + dz * d) < L) {
          best = d;
          break;
        }
      }
    }
    return best;
  }

  /** Direction (unit x,z) toward the nearest water, or null */
  directionToWater(x, z, maxD = 40) {
    const L = this.tide.level;
    let best = maxD;
    let dir = null;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      for (let d = 1; d < best; d += d < 6 ? 0.5 : 2) {
        if (this.heightAt(x + dx * d, z + dz * d) < L) {
          best = d;
          dir = { x: dx, z: dz, d };
          break;
        }
      }
    }
    return dir;
  }

  // ------------------------------------------------------------------ rendering
  _buildMesh() {
    const g = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    const sub = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
      const s = this.substrate(x, z);
      sub[i * 3] = s.mud;
      sub[i * 3 + 1] = s.sand;
      sub[i * 3 + 2] = s.veg;
    }
    g.setAttribute('aSub', new THREE.BufferAttribute(sub, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    const uniforms = { uTide: { value: 0 }, uWetLevel: { value: 0 }, uTime: { value: 0 } };
    this.uniforms = uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aSub; varying vec3 vSub; varying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vSub = aSub; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTide, uWetLevel, uTime; varying vec3 vSub; varying vec3 vWPos;
          float th(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float tn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(th(i), th(i+vec2(1,0)), u.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), u.x), u.y); }
          float tfbm(vec2 p){ return tn(p)*0.5 + tn(p*2.1)*0.25 + tn(p*4.3)*0.125 + tn(p*8.7)*0.0625; }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float h = vWPos.y;
          float wet = smoothstep(uWetLevel + 0.03, uWetLevel - 0.04, h);
          float under = smoothstep(uTide + 0.002, uTide - 0.01, h);
          vec2 p = vWPos.xz;
          float n = tfbm(p * 0.35);
          float fine = tfbm(p * 9.0);
          // linear-space albedos: dry sand ≈0.35–0.45, wet sand ≈0.15–0.2, mud ≈0.1, wet mud ≈0.05
          vec3 sandDry = mix(vec3(0.52, 0.43, 0.30), vec3(0.60, 0.51, 0.37), n);
          vec3 sandWet = mix(vec3(0.21, 0.17, 0.12), vec3(0.26, 0.21, 0.15), n);
          vec3 mudDry = mix(vec3(0.16, 0.135, 0.105), vec3(0.2, 0.17, 0.13), n);
          vec3 mudWet = mix(vec3(0.055, 0.047, 0.04), vec3(0.075, 0.064, 0.052), n);
          vec3 veg = mix(vec3(0.33, 0.38, 0.22), vec3(0.45, 0.47, 0.3), tn(p * 1.7));
          vec3 sandC = mix(sandDry, sandWet, wet);
          vec3 mudC = mix(mudDry, mudWet, wet);
          vec3 c = sandC * vSub.y + mudC * vSub.x + veg * vSub.z;
          c *= 0.93 + 0.14 * fine;
          // submerged: attenuate & tint by depth
          float depth = max(uTide - h, 0.0);
          c = mix(c, c * vec3(0.55, 0.62, 0.6), under * (1.0 - exp(-depth * 18.0)));
          // worm casts & burrow holes on mud (visual cue of the prey community)
          float wormCast = smoothstep(0.93, 0.97, tn(p * 6.0 + 17.0)) * vSub.x * (1.0 - under);
          c = mix(c, c * 1.5, wormCast);
          float burrow = smoothstep(0.95, 0.99, tn(p * 11.0 - 3.0)) * vSub.x * (1.0 - under);
          c = mix(c, c * 0.35, burrow);
          diffuseColor.rgb *= c;
          float kRough = mix(0.92, 0.22, wet * (vSub.x * 0.85 + vSub.y * 0.45));
          kRough = mix(kRough, 0.08, under);`
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = kRough;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          // sand ripples (wavelength ~6 cm) + mud micro relief, faded with distance
          float fade = 1.0 - smoothstep(4.0, 22.0, length(vViewPosition));
          vec2 rp = p * vec2(95.0, 12.0);
          float rip = sin(p.x * 100.0 + tn(p * 3.0) * 6.0 + p.y * 18.0);
          vec3 bump = vec3(cos(p.x * 100.0 + tn(p * 3.0) * 6.0 + p.y * 18.0) * 0.12 * vSub.y, 0.0, (tn(p * 40.0) - 0.5) * 0.25 * vSub.x);
          normal = normalize(normal + (viewMatrix * vec4(bump.x, 0.0, bump.z, 0.0)).xyz * fade * (1.0 - under));`
        );
    };
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  _buildWater() {
    const g = new THREE.PlaneGeometry(this.size, this.size, 1, 1);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x506a6c, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.55, depthWrite: false });
    const u = { uTime: { value: 0 } };
    this.waterUniforms = u;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vWP;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          vec2 q = vWP.xz;
          vec3 wn = vec3(sin(q.x * 3.1 + uTime * 1.3) * 0.05 + sin(q.y * 4.7 - uTime * 1.1) * 0.04, 1.0, cos(q.y * 2.3 + uTime * 0.9) * 0.05 + sin((q.x + q.y) * 7.0 + uTime * 2.0) * 0.02);
          normal = normalize((viewMatrix * vec4(normalize(wn), 0.0)).xyz);`
        )
        .replace('#include <opaque_fragment>', `float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);\n diffuseColor.a = clamp(0.35 + fres * 0.6, 0.0, 0.92);\n#include <opaque_fragment>`);
    };
    const m = new THREE.Mesh(g, mat);
    m.name = 'water';
    m.renderOrder = 1;
    return m;
  }

  update(realDt) {
    this.uniforms.uTide.value = this.tide.level;
    this.uniforms.uWetLevel.value = this.tide.maxLevelSince(SURFACE_RULES.wetDuration);
    this.uniforms.uTime.value += realDt;
    this.waterUniforms.uTime.value += realDt;
    this.water.position.y = this.tide.level;
  }
}
