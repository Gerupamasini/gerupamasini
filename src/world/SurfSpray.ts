import { BufferAttribute, BufferGeometry, Points, Scene, ShaderMaterial, Vector2, Vector4, type IUniform, type PerspectiveCamera, type Texture, type WebGLRenderer } from 'three';
import { SURF_GLSL, type SurfUniforms } from './Surf';
import type { LipLight } from './SurfLip';

/**
 * Spray and mist over the breaking waves near the viewer: GPU points with no state of their own (nothing is
 * simulated or stored; a few thousand points are one draw). Each point lives a short cycle; at the start of each
 * cycle it is born somewhere along 50 m of the shore about the viewer, finds the crest going over in its own column
 * at that moment (the same search as the lips: the surf drawn by the water) and leaves it on a ballistic path with a
 * little drag: thrown forward and up off a plunging lip, or kicked up off a bore's rolling front; some are mist, larger
 * and fainter, drifting off with the breeze. A point that finds no breaking crest stays hidden for that cycle, so the
 * spray comes where and when the waves break. Drawn over the water (after its composite), tested against the scene's
 * depth by hand, and lit by the sun from behind (the bright halo of spray against the light).
 */
export class SurfSpray {
  readonly scene = new Scene();
  private readonly points: Points;
  private readonly material: ShaderMaterial;
  private readonly uSpray = { value: new Vector4(0, 50, 0, 10) };
  private readonly uLevel = { value: 0 };
  private readonly uRes = { value: new Vector2(1, 1) };
  private readonly uNearFar = { value: new Vector2(0.05, 1000) };
  private readonly tDepth: IUniform<Texture | null> = { value: null };

  constructor(surf: SurfUniforms, light: LipLight, count: number) {
    const seeds = new Float32Array(count * 4);
    let a = 9127 >>> 0;
    const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < count * 4; i++) seeds[i] = rnd();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('seed', new BufferAttribute(seeds, 4));
    this.material = new ShaderMaterial({
      uniforms: {
        ...light, uSpray: this.uSpray, uLevel: this.uLevel, uRes: this.uRes, tDepth: this.tDepth, uNearFar: this.uNearFar,
        uSurf: surf.uSurf, uSurfDir: surf.uSurfDir, tSurfZone: surf.tSurfZone, tSurfAux: surf.tSurfAux, uSurfLv: surf.uSurfLv, uSurfGrid: surf.uSurfGrid,
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // (premultiplied: drops white over the water, mist a faint veil)
      premultipliedAlpha: true,
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        uniform vec4 uSpray;     // x: the viewer's alongshore position, y: the length of shore, z, w: the band searched (s)
        uniform float uLevel, uTime;
        uniform vec2 uRes;
        varying float vA, vMist, vDepth;
        varying vec3 vWorld;
        ${SURF_GLSL}
        float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
        void main() {
          vA = 0.0; vMist = 0.0; vDepth = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          float kind = seed.w;                                  // < 0.6 lip spray, < 0.85 bore splash, else mist
          float mist = step(0.85, kind);
          float life = mix(mix(0.7, 1.4, seed.x), mix(1.8, 3.2, seed.x), mist);
          float cyc = (uTime + seed.y * 37.0) / life;
          float ci = floor(cyc), age = (cyc - ci) * life;
          float tb = uTime - age;
          // born somewhere along the shore about the viewer, anew each cycle
          float y = uSpray.x + (h1(seed.z * 71.3 + ci * 1.7) - 0.5) * uSpray.y;
          vec4 cr = surfBreakingCrest(y, uSpray.z, uSpray.w, uLevel, tb, 20);
          if (cr.x < -1e3) return;
          float stage = smoothstep(0.98, 1.32, cr.y);
          float H = cr.w;
          // off a plunging lip while it goes over; off a bore's front once broken (and off spilling crests, a little)
          float lipOn = smoothstep(0.25, 0.55, cr.z) * smoothstep(0.1, 0.4, stage) * (1.0 - smoothstep(0.85, 1.0, stage));
          float boreOn = smoothstep(1.1, 1.5, cr.y) * smoothstep(0.04, 0.12, H) * mix(0.4, 1.0, cr.z);
          float on = kind < 0.6 ? lipOn : kind < 0.85 ? boreOn : max(lipOn, boreOn) * 0.8;
          on *= smoothstep(0.06, 0.18, H);
          if (on < h1(seed.x * 13.1 + ci * 3.3)) return;
          vec2 d = uSurfDir.xy, al = vec2(-d.y, d.x);
          float c = sqrt(9.81 * max(H / 0.9, 0.05));            // the crest's speed near the break
          float r1 = h1(seed.y * 5.7 + ci), r2 = h1(seed.z * 9.1 + ci * 2.1), r3 = h1(seed.x * 3.9 + ci * 4.7);
          float topH = uLevel + H * (kind < 0.6 ? 0.55 : 0.25);
          float s0 = cr.x - (kind < 0.6 ? H * 0.4 * stage : 0.05);
          vec3 v0;
          if (kind < 0.6) v0 = vec3(0.0, mix(0.4, 1.8, r1) * (0.6 + H), 0.0) - vec3(d.x, 0.0, d.y) * c * mix(0.6, 1.25, r2);
          else v0 = vec3(0.0, mix(0.25, 1.0, r1) * (0.5 + H), 0.0) - vec3(d.x, 0.0, d.y) * c * mix(0.3, 0.9, r2);
          v0 += vec3(al.x, 0.0, al.y) * (r3 - 0.5) * 0.6;
          // drag (a droplet of a few millimetres slows over about a second; mist drifts with the breeze)
          float tau = mix(0.9, 0.35, mist);
          float e = 1.0 - exp(-age / tau);
          vec3 p0 = vec3(d.x * s0 + al.x * y, topH, d.y * s0 + al.y * y) + vec3(al.x, 0.0, al.y) * (r2 - 0.5) * 0.4;
          vec3 P = p0 + v0 * tau * e;
          P.y -= 9.81 * mix(1.0, 0.04, mist) * (tau * age - tau * tau * e);
          P += mist * vec3(0.25, 0.08, 0.15) * age;
          // back in the water: gone
          if (P.y < uLevel + surfEtaAt(P.xz, uLevel, uTime) - 0.01) return;
          vec4 mv = viewMatrix * vec4(P, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = mix(mix(0.004, 0.012, r3), mix(0.08, 0.3, r3), mist) * (1.0 + mist * age);
          float px = size * projectionMatrix[1][1] * uRes.y * 0.5 / max(-mv.z, 0.05);
          // (a drop smaller than a pixel drawn as one, dimmer by its share of it)
          gl_PointSize = clamp(px, 1.5, 48.0);
          float fade = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.6, 1.0, age / life));
          vA = fade * min(1.0, (px * px) / 2.25) * mix(0.55, 0.05, mist) * (1.0 - smoothstep(35.0, 60.0, -mv.z));
          vMist = mist;
          vDepth = -mv.z;
          vWorld = P;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDepth;
        uniform vec3 uSunDir, uSunCol, uFogColor;
        uniform float uSunUp, uAmbient, uFogDensity;
        uniform vec2 uRes;
        varying float vA, vMist, vDepth;
        varying vec3 vWorld;
        uniform vec2 uNearFar;
        // (the scene's depth back to a view distance)
        float linearDepth(float z) { float n = uNearFar.x, f = uNearFar.y; return n * f / (f - z * (f - n)); }
        void main() {
          if (vA <= 0.002) discard;
          vec2 q = gl_PointCoord - 0.5;
          float r = length(q) * 2.0;
          float disc = vMist > 0.5 ? exp(-r * r * 3.0) : smoothstep(1.0, 0.55, r);
          if (disc <= 0.0) discard;
          // behind something in the scene: hidden (softly)
          float sd = linearDepth(texture2D(tDepth, gl_FragCoord.xy / uRes).r);
          float vis = smoothstep(-0.05, 0.15, sd - vDepth);
          // drops scatter the sun strongly forward: bright against the light, grey-white otherwise
          float fwd = pow(max(dot(normalize(vWorld - cameraPosition), uSunDir), 0.0), 6.0);
          vec3 col = uSunCol * uSunUp * (0.22 + 1.8 * fwd) * 0.4 + uAmbient * vec3(0.55, 0.6, 0.66);
          col = mix(col, uFogColor, 1.0 - exp(-pow(uFogDensity * vDepth, 2.0)));
          float a = vA * disc * vis;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor = vec4(gl_FragColor.rgb * a, a);
        }`,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /** Follow the viewer and the water (the band searched is the lips' one). */
  update(band: Vector4, level: number): void {
    this.uSpray.value.set(band.x, 50, band.z, band.w);
    this.uLevel.value = level;
  }

  /** Draw over what the water composited (into the target bound now), against the scene's depth. */
  render(gl: WebGLRenderer, camera: PerspectiveCamera, depth: Texture | null, width: number, height: number): void {
    this.tDepth.value = depth;
    this.uRes.value.set(width, height);
    this.uNearFar.value.set(camera.near, camera.far);
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.render(this.scene, camera);
    gl.autoClear = auto;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
