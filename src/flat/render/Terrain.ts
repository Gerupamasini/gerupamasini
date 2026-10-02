import {
  BufferAttribute, DynamicDrawUsage, Frustum, GLSL3, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, ShaderMaterial, Vector3, Box3,
  type IUniform, type PerspectiveCamera, type Texture,
} from 'three';
import { COMMON_GLSL } from './glsl/common';
import { FIELD_GLSL, type FieldUniforms } from '../FlatField';
import { SEDIMENT_GLSL } from './glsl/sediment';
import { WAVES_GLSL, type WaveUniforms } from './glsl/waves';
import { LIGHTING_GLSL, cubeUVDefines } from './glsl/lighting';
import { ATMOS_GLSL, CLOUDS_GLSL, type SkyUniforms } from './Sky';
import { SHADOW_GLSL, type ShadowUniforms } from './Shadow';

/**
 * The ground, drawn as a CDLOD quadtree (Strugar 2009): every selected node is the same 32×32 patch, instanced,
 * its vertices morphing toward the next coarser grid as they near the end of their level's range, so neighbouring
 * levels always meet without cracks and nothing pops. Heights come from the baked grids (0.25 m near, 4 m far);
 * up close the megaripples are real geometry. Everything finer is in the fragment shader.
 */
const GRID = 32;
const L0 = 3.2;          // finest node (m): 0.1 m between vertices
const LEVELS = 12;       // root covers 6.5 km
const R0 = 10;           // finest level's range (m)
const MAX_NODES = 1600;

export interface TerrainOptions {
  /** 0…1: grains, parallax and micro-shadows */
  detail: number;
  /** debug view (see the end of the fragment shader) */
  debug?: number;
}

export class TerrainRenderer {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly nodes: InstancedBufferAttribute;
  private readonly frustum = new Frustum();
  private readonly box = new Box3();
  private readonly tmpM = new Matrix4();
  private count = 0;
  private readonly cam = new Vector3();
  nodeCount = 0;

  constructor(field: FieldUniforms, sky: SkyUniforms, waves: WaveUniforms, shared: { uNoise: IUniform<Texture>; uTime: IUniform<number>; uEnv: IUniform<Texture | null> }, shadow: ShadowUniforms, envHeight: number, opts: TerrainOptions) {
    const geo = new InstancedBufferGeometry();
    const n = GRID + 1;
    const pos = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      pos[k] = i / GRID; pos[k + 1] = 0; pos[k + 2] = j / GRID;
    }
    const idx: number[] = [];
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.nodes = new InstancedBufferAttribute(new Float32Array(MAX_NODES * 4), 4);
    this.nodes.setUsage(DynamicDrawUsage);
    geo.setAttribute('aNode', this.nodes);
    geo.instanceCount = 0;

    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      defines: { ...cubeUVDefines(envHeight), GRID_N: GRID.toFixed(1), RANGE0: R0.toFixed(1) },
      uniforms: { ...field, ...sky, ...waves, ...shared, ...shadow, uDetailK: { value: opts.detail }, uDebug: { value: opts.debug ?? 0 } },
      vertexShader: /* glsl */ `
        ${COMMON_GLSL}
        ${FIELD_GLSL}
        ${SEDIMENT_GLSL}
        in vec4 aNode;   // x0, z0, size, level
        out vec3 vWorld;
        void main() {
          vec2 g = position.xz;
          vec2 xz = aNode.xy + g * aNode.z;
          float h = groundHeight(xz);
          float dist = distance(cameraPosition, vec3(xz.x, h, xz.y));
          float range = RANGE0 * exp2(aNode.w);
          float morph = clamp((dist - 0.72 * range) / (0.25 * range), 0.0, 1.0);
          vec2 fr = fract(g * GRID_N * 0.5) * 2.0 / GRID_N;
          xz -= fr * aNode.z * morph;
          h = groundHeight(xz);
          // megaripples as real relief up close (faded before the vertices get too sparse for them)
          float mf = 1.0 - smoothstep(7.0, 13.0, distance(cameraPosition.xz, xz));
          if (mf > 0.0 && fineW(xz) > 0.0) {
            vec4 m = texture(tMFine, fineUV(xz));
            vec4 rp = texture(tRip, fineUV(xz));
            vec2 kd = rp.rg * 2.0 - 1.0;
            h += megaAt(xz, kd / max(length(kd), 1e-4), megaAmpAt(xz, rp.a, m.r) * fineW(xz)).x * mf;
          }
          vWorld = vec3(xz.x, h, xz.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON_GLSL}
        ${FIELD_GLSL}
        ${ATMOS_GLSL}
        ${CLOUDS_GLSL}
        ${WAVES_GLSL}
        ${LIGHTING_GLSL}
        ${SEDIMENT_GLSL}
        ${SHADOW_GLSL}
        uniform float uDetailK;
        uniform int uDebug;
        in vec3 vWorld;
        out vec4 fragColor;

        void main() {
          vec3 P = vWorld;
          vec2 xz = P.xz;
          vec3 toEye = cameraPosition - P;
          float dist = length(toEye);
          vec3 V = toEye / dist;
          float fw = max(length(fwidth(xz)), 1e-5);

          // ---- fields
          float concav;
          vec4 gn = groundNormalC(xz, concav);
          vec3 Nm = gn.xyz;
          vec4 mt = groundMat(xz);
          float mud = mt.r, shell = mt.g;
          float fineK = fineW(xz);
          vec4 rp = texture(tRip, fineUV(xz));
          float ripAmp = mt.b * fineK, asym = mt.a;
          vec2 kdir = rp.rg * 2.0 - 1.0; kdir /= max(length(kdir), 1e-4);
          float lam = 0.03 + rp.b * 0.17;
          float megaAmp = megaAmpAt(xz, rp.a, mud) * fineK;
          vec4 nA = vnoise4(xz * 0.061 + 5.0), nB = vnoise4(xz * 0.53 - 3.0), nC = vnoise4(xz * 4.1 + 11.0), nD = vnoise4(xz * 0.19 + 21.0);
          // organic masks (warped fbm: single-octave value noise, thresholded, draws grid-aligned crosses)
          vec2 wq = xz + 1.7 * vec2(nB.x - 0.5, nB.y - 0.5);
          float fMud = fbm(wq * 0.9 + 3.0, 4), fFilm = fbm(wq * 0.37 - 8.0, 4), fShell = fbm(wq * 2.3 + 5.0, 3), fIron = fbm(wq * 0.11 + 2.0, 3);

          // ---- relief: megaripples (geometry near, shading far) and the ripples
          vec3 mg = megaAt(xz, kdir, megaAmp * (1.0 - smoothstep(0.06, 0.2, fw)));
          // the exact ground from the baked grid (not the vertex-interpolated one, which differs by millimetres
          // between levels of detail and would draw the wet edges along the tile borders)
          float yBase = groundHeight(xz);
          float yMega = yBase + mg.x;
          float lodR = (1.0 - smoothstep(lam * 0.2, lam * 0.6, fw));
          Ripples R = ripplesAt(xz, kdir, lam, ripAmp, asym, lodR);
          float shiftS = 0.0;
          float ph = R.phase;
          float pomK = (1.0 - smoothstep(lam * 0.02, lam * 0.07, fw)) * uDetailK;
          if (pomK > 0.0 && R.amp > 1e-4) {
            float s;
            ripplePOM(R, V, s);
            shiftS = s * pomK;
            float km = length(R.gphi);
            vec2 kh = R.gphi / max(km, 1e-4);
            float vh = max(length(V.xz), 1e-4);
            ph = R.phase + km * dot(V.xz, kh) / vh * shiftS;
          }
          float dP;
          float Pr = ripProfile(ph, R.asym, R.sharp, R.cap, dP);
          float hR = R.amp * Pr + (R.h - R.amp * ripProfile(R.phase, R.asym, R.sharp, R.cap, dP));
          float dP2; ripProfile(ph, R.asym, R.sharp, R.cap, dP2);
          vec2 gR = R.amp * dP2 * R.gphi + (R.grad - R.amp * dP * R.gphi);
          float crest = Pr * 0.5 + 0.5;
          vec2 xzS = xz + normalize(V.xz + 1e-6) * shiftS;
          float yDet = yMega + hR;

          // ---- water: here, the nearest, and the water table under the sand
          vec2 lv = waterLevels(xz);
          vec4 wi = waterInfo(xz);
          float kind = wi.x, distW = wi.w;
          float level = lv.x;
          float depth = level - yMega;
          float under = (level > -50.0) ? smoothstep(0.0, 0.002, depth) : 0.0;
          float wt = lv.y + 0.004 + 0.0022 * distW;
          wt += mud * 0.012 * exp(-distW * 0.08);
          // the water table never stands above the ground (that would be a pool): at most it seeps out at the surface
          wt = min(wt, yMega + 0.0015);
          float hw = yDet - wt;
          float hwM = yMega - wt;
          // the backshore above the last high water: dry
          float dryBeach = smoothstep(1.05, 1.5, yBase);
          float moist = (1.0 - smoothstep(0.015 + 0.05 * mud, 0.3 + 0.55 * mud, hw)) * (1.0 - dryBeach);
          // hollows hold water, rises drain first: the wetness follows the metre-scale relief, and the surface dries
          // in irregular pale patches where the sand stands a little higher
          moist = sat(moist + concav * 2.5 - 0.06);
          float dryPatch = smoothstep(0.5, 0.78, nD.x * 0.65 + nB.w * 0.35) * smoothstep(0.03, 0.15, hw) * (1.0 - mud);
          moist *= 1.0 - 0.55 * dryPatch;
          moist *= 1.0 - 0.35 * smoothstep(0.12, 0.3, hw) * smoothstep(0.45, 0.75, nA.w) * (1.0 - mud);
          // ripple troughs stay wetter than crests on damp sand
          moist = sat(moist + (0.5 - crest) * 0.35 * lodR * (1.0 - mud) * smoothstep(0.0, 0.05, hw) * (1.0 - smoothstep(0.15, 0.4, hw)));
          float film = (1.0 - smoothstep(-0.001, 0.003 + 0.02 * mud, hwM)) * 0.5 * (1.0 - smoothstep(1.5, 6.0, distW) * (1.0 - mud));
          // wet mud carries its own thin sheet of water: it shines
          film = max(film, smoothstep(0.45, 0.9, mud) * moist * (0.35 + 0.3 * nB.y));
          // water left standing in the ripple troughs where the sand sits at the water table
          float trough = smoothstep(0.0008, -0.0008, hw) * (1.0 - smoothstep(-0.003, -0.012, hwM));
          // unresolved ripples far away: the trough water reads as a partial sheen
          float troughFar = smoothstep(-ripAmp * 0.006, ripAmp * 0.006, -hwM) * (1.0 - lodR) * step(0.001, ripAmp);
          film = max(film, max(trough, troughFar * (0.08 + 0.2 * nB.x)));
          film *= 1.0 - under;
          moist = max(moist, under);

          // ---- albedo
          vec3 sandDry = vec3(0.44, 0.37, 0.27);
          sandDry *= 0.9 + 0.2 * nA.x;
          sandDry *= vec3(1.0 + 0.07 * (nA.y - 0.5), 1.0, 1.0 - 0.1 * (nA.y - 0.5));
          sandDry *= 0.94 + 0.12 * nB.x;
          // the dry backshore is paler (salt, sun-bleached)
          sandDry = mix(sandDry, sandDry * vec3(1.08, 1.08, 1.12), dryBeach);
          vec3 mudC = vec3(0.2, 0.185, 0.16) * (0.85 + 0.3 * nA.z);
          // diatom film on mud and muddy sand: golden brown in patches
          float diatom = mud * smoothstep(0.45, 0.68, fFilm) * (1.0 - under * 0.5);
          mudC *= mix(vec3(1.0), vec3(1.05, 0.92, 0.62), diatom * 0.7);
          float mudMix = smoothstep(0.15, 0.85, mud + (nB.z - 0.5) * 0.25);
          vec3 alb = mix(sandDry, mudC, mudMix);
          // heavy minerals and fines concentrate in the ripple troughs: thin dark lines
          alb *= 1.0 - 0.22 * pow(1.0 - crest, 3.0) * lodR * (1.0 - mud) * smoothstep(0.4, 0.8, nC.x);
          // reduced (black) mud just under the surface shows in the lowest wet hollows
          float reduced = mudMix * smoothstep(0.62, 0.8, nA.w * 0.5 + fMud * 0.5) * moist * 0.4;
          alb = mix(alb, vec3(0.075, 0.072, 0.066), reduced);
          // grains, shell hash and pebbles (up close)
          Grains G;
          G.cover = 0.0; G.nrm = vec2(0.0); G.glint = 0.0; G.occl = 0.0;
          if (uDetailK > 0.0 && fw < 0.02) G = grainsAt(xzS, fw, shell, 1.0 - mudMix, 1.0 - crest, alb);
          // shell hash seen from afar: a paler, speckled tone
          alb = mix(alb, vec3(0.58, 0.55, 0.5), shell * (0.18 + 0.3 * smoothstep(0.5, 0.7, fShell)) * smoothstep(0.004, 0.02, fw) * (1.0 - mudMix));
          // metre-scale tone: coarser or finer sand, iron-stained or grey patches
          alb *= 0.92 + 0.16 * nD.y;
          // rippled ground too far for its ripples reads a touch darker (shadowed, wet troughs)
          alb *= 1.0 - 0.07 * ripAmp * (1.0 - lodR);
          // the strand line of the last spring tide: dried eelgrass and seaweed, dark, in broken streaks
          float wrackBand = exp(-sq((yBase - 1.12 - 0.05 * (nA.z - 0.5)) / 0.05));
          float streaks = smoothstep(0.55, 0.8, fbm(vec2(xz.x * 0.7, xz.y * 3.2) + 9.0, 3)) * smoothstep(0.3, 0.6, nD.z);
          alb = mix(alb, vec3(0.075, 0.068, 0.052) * (0.8 + 0.4 * nC.w), wrackBand * streaks * 0.85);
          alb *= mix(vec3(1.0), vec3(1.04, 0.99, 0.92), smoothstep(0.5, 0.7, fIron) * (1.0 - mudMix));

          // wet darkening (and a little more saturation)
          vec3 wetK = mix(vec3(0.54, 0.53, 0.5), vec3(0.6, 0.6, 0.6), mudMix);
          alb *= mix(vec3(1.0), wetK, moist);

          // ---- normal
          float hx = -Nm.x / Nm.y, hz = -Nm.z / Nm.y;
          vec2 gD = mg.yz + gR;
          // mud: soft lumps and dimples; sand: fine grain relief
          float microK = (1.0 - smoothstep(0.002, 0.012, fw));
          vec3 mb = vec3(0.0);
          if (microK > 0.0) {
            vec2 pm = xz * 22.0;
            vec4 a = vnoise4(pm), b = vnoise4(pm + vec2(0.5, 0.0)), c = vnoise4(pm + vec2(0.0, 0.5));
            mb = vec3(0.0, (b.x - a.x), (c.x - a.x)) * 2.0 * 0.0042 * 22.0 * microK * (0.4 + 0.6 * mudMix);
          }
          gD += mb.yz + G.nrm * 0.35;
          vec3 N = normalize(vec3(-(hx + gD.x), 1.0, -(hz + gD.y)));
          vec3 Nfilm = normalize(vec3(-hx - mg.y * 0.3, 1.0, -hz - mg.z * 0.3));

          // ---- light
          vec3 L = uSunDir;
          vec3 E = uSunE;
          float cshade = cloudShadow(P);
          float sunVis = cshade * sunShadow(P);
          // ripple self-shadow near, statistical darkening far
          if (pomK > 0.0 && R.amp > 1e-4) sunVis *= mix(1.0, rippleShadow(R, ph, Pr * R.amp, L), pomK);
          float lk = abs(dot(L.xz, kdir)) / max(length(L.xz), 1e-3);
          float slopeRip = ripAmp * 0.12;
          float statShadow = sat(1.0 - slopeRip * lk / max(L.y, 0.05) * 0.6);
          sunVis *= mix(1.0, statShadow, (1.0 - pomK) * step(0.001, ripAmp));
          float ao = sat(1.0 - concav * 0.6) * (1.0 - G.occl) * (1.0 - 0.25 * (1.0 - crest) * lodR * (1.0 - mud));

          // under water: refracted sun, attenuated, focused by the ripples into caustics
          vec3 Lw = L;
          float Tdown = 1.0;
          float caus = 1.0;
          if (under > 0.0) {
            vec3 lr = refract(-L, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
            Lw = -lr;
            float D = max(depth, 0.0) / max(Lw.y, 0.2);
            float fetchM = wi.z * 60.0;
            float gust = gustAt(xz, uTime);
            caus = causticAt(xz, Lw, D, uTime, fw, fetchM, max(depth, 0.0), gust);
            float tr = 1.0 - fresnelWater(L.y);
            Tdown = tr * exp(-D * mix(1.2, 0.7, step(0.5, kind) * (1.0 - step(1.5, kind)))) ;
          }
          vec3 Ls = mix(L, Lw, under);
          float NoL = max(dot(N, Ls), 0.0);
          // sand: back-scattering hot spot (opposition effect), lost when wet
          float phaseAng = acos(clamp(dot(V, L), -1.0, 1.0));
          float opp = 1.0 + 0.3 * exp(-phaseAng / 0.06) * (1.0 - moist) + 0.12 * exp(-phaseAng / 0.4) * (1.0 - moist);
          vec3 sun = E * sunVis * mix(1.0, Tdown * caus, under);
          vec3 diff = alb * INV_PI * NoL * opp * sun + alb * envIrradiance(N) * ao * mix(1.0, Tdown * 0.9, under);
          float rough = mix(mix(0.92, 0.55, moist), 0.5, mudMix * moist);
          rough = mix(rough, 0.35, G.glint * 0.5);
          vec3 R1 = reflect(-V, N);
          float NoV = max(dot(N, V), 1e-3);
          vec2 eb = envBRDF(NoV, rough);
          vec3 spec = vec3(specGGX(N, V, Ls, rough, 0.04)) * sun + envRadiance(R1, rough) * (0.04 * eb.x + eb.y) * ao * (1.0 - under * 0.7);
          spec += sun * G.glint * pow(max(dot(reflect(-Ls, N), V), 0.0), 60.0) * 0.6 * (1.0 - under);
          vec3 col = diff + spec;
          // the water film: a smooth layer over the wet ground, mirror-like at grazing angles
          if (film > 0.001) {
            float cf = max(dot(Nfilm, V), 1e-3);
            float Fw = fresnelWater(cf);
            vec3 Rf = reflect(-V, Nfilm);
            Rf.y = abs(Rf.y);
            vec3 refl = envRadiance(Rf, 0.06);
            vec3 hs = sun * specGGX(Nfilm, V, L, 0.07, 0.02) * 1.0;
            col = mix(col, col * (1.0 - Fw) + refl * Fw + hs, film);
          }
          col = aerial(col, dist, -V);
          if (uDebug == 1) col = alb;
          else if (uDebug == 2) col = N * 0.5 + 0.5;
          else if (uDebug == 3) col = vec3(moist, film, trough);
          else if (uDebug == 4) col = vec3(hR / max(R.amp, 1e-5) * 0.5 + 0.5, lodR, pomK);
          else if (uDebug == 5) col = vec3(mud, shell, ripAmp);
          else if (uDebug == 6) col = vec3(under, sat(depth * 5.0), kind / 3.0);
          else if (uDebug == 7) col = vec3(sat(hw * 10.0 + 0.5), sat(-hwM * 50.0), sat(distW / 10.0));
          else if (uDebug == 8) col = vec3(sunVis, cshade, ao);
          else if (uDebug == 9) col = vec3(caus * 0.5, wi.z, Tdown);
          else if (uDebug == 10) col = vec3(sunShadow(P), cshade, 0.0);
          if (uDebug > 0) col *= 0.4;
          fragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'terrain';
  }

  setEnv(env: Texture, envHeight: number): void {
    (this.material.uniforms.uEnv as IUniform<Texture>).value = env;
    const d = cubeUVDefines(envHeight);
    let changed = false;
    for (const [k, v] of Object.entries(d)) if (this.material.defines[k] !== v) { this.material.defines[k] = v; changed = true; }
    if (changed) this.material.needsUpdate = true;
  }

  /** Select the quadtree nodes for this camera and fill the instance buffer. */
  update(camera: PerspectiveCamera): void {
    camera.updateMatrixWorld();
    this.tmpM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.tmpM);
    this.cam.setFromMatrixPosition(camera.matrixWorld);
    this.count = 0;
    const rootSize = L0 * Math.pow(2, LEVELS - 1);
    this.select(-rootSize / 2, -rootSize / 2, rootSize, LEVELS - 1);
    this.nodes.needsUpdate = true;
    this.nodes.addUpdateRange(0, this.count * 4);
    (this.mesh.geometry as InstancedBufferGeometry).instanceCount = this.count;
    this.nodeCount = this.count;
  }

  private select(x0: number, z0: number, size: number, level: number): void {
    this.box.min.set(x0, -9, z0);
    this.box.max.set(x0 + size, 6, z0 + size);
    if (!this.frustum.intersectsBox(this.box)) return;
    const c = this.cam;
    const dx = Math.max(x0 - c.x, 0, c.x - (x0 + size)), dz = Math.max(z0 - c.z, 0, c.z - (z0 + size)), dy = Math.max(-9 - c.y, 0, c.y - 6);
    const d = Math.hypot(dx, dy, dz);
    if (level === 0 || d > R0 * Math.pow(2, level - 1)) {
      if (this.count >= MAX_NODES) return;
      const a = this.nodes.array as Float32Array, o = this.count * 4;
      a[o] = x0; a[o + 1] = z0; a[o + 2] = size; a[o + 3] = level;
      this.count++;
      return;
    }
    const h = size / 2;
    this.select(x0, z0, h, level - 1);
    this.select(x0 + h, z0, h, level - 1);
    this.select(x0, z0 + h, h, level - 1);
    this.select(x0 + h, z0 + h, h, level - 1);
  }
}
