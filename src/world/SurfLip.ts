import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial, Vector3, Vector4, type IUniform, type PerspectiveCamera } from 'three';
import { SURF_GLSL, type SurfUniforms } from './Surf';
import type { SurfZone } from './SurfZone';
import { breakingDepth, runup2 } from './surfPhysics';

/** The water's light, shared with the lip (WaterPass's uniforms of the same names). */
export interface LipLight {
  uSunDir: IUniform<Vector3>; uSunCol: IUniform<Vector3>; uSunUp: IUniform<number>; uAmbient: IUniform<number>;
  tEnv: IUniform<unknown>; uEnvI: IUniform<number>; uFogColor: IUniform<unknown>; uFogDensity: IUniform<number>;
  uWaterFog: IUniform<unknown>; uTime: IUniform<number>; uWater: IUniform<number>; uSurfDebug: IUniform<number>;
}

const COLS = 192, ROWS = 12;

/**
 * The band of the shore the lips and the spray look for breaking crests in, at the viewer's place along the shore:
 * from just above the still waterline (the run-up) out to where the biggest common waves break. x: the viewer's
 * alongshore position (shore frame), z, w: the band (s, seaward).
 */
export function breakerBand(zone: SurfZone, seaward: readonly [number, number], camera: PerspectiveCamera, level: number, sea: { height: number; period: number }, out = new Vector4()): Vector4 {
  const d = zone.uniforms.uSurfLv.value, dx = seaward[0], dz = seaward[1];
  const cx = camera.position.x, cz = camera.position.z;
  const y = -cx * dz + cz * dx;
  const at = (s: number) => [dx * s - dz * y, dz * s + dx * y] as const;
  // the waterline seaward of the viewer (or behind them, wading)
  let sWl = cx * dx + cz * dz;
  for (let i = 0; i < 200; i++) { const [x, zz] = at(sWl); if (level - zone.groundAt(x, zz) > 0) break; sWl += 0.25; }
  for (let i = 0; i < 200; i++) { const [x, zz] = at(sWl - 0.25); if (level - zone.groundAt(x, zz) <= 0) break; sWl -= 0.25; }
  const [wx, wz] = at(sWl + 2);
  const Db = breakingDepth(1.6 * sea.height, Math.max(d.w, 0.3), Math.max(zone.slopeAt(wx, wz), 0.01), sea.period);
  let s1 = sWl;
  for (let i = 0; i < 240; i++) { const [x, zz] = at(s1); if (level - zone.groundAt(x, zz) > 1.25 * Db) break; s1 += 0.25; }
  return out.set(y, 0, sWl - 0.5 - runup2(sea.height, sea.period, 0.08), s1 + 1);
}

/**
 * The thrown lip of a plunging wave, near the viewer. A height field cannot curl over, so where a wave plunges (on
 * a steep beach face: the surf similarity at the break over about 0.4) its lip is a mesh of its own: a ribbon along
 * the shore, 60 m of it about the viewer, whose vertices find the crest that is going over in their own column
 * (the same surf as the water draws) and lay the jet off it. As the wave goes over the lip is thrown forward — about
 * half the wave's height ahead of the crest — and falls to the trough in front, thinning and whitening as it goes,
 * until it lands (the water pass's curtain and the spray take over there). Where the crest is not plunging the ribbon
 * folds away to nothing, so sections of a crest throw their lips while the next one is still standing, and the
 * break runs along the crest of a wave that comes in at an angle.
 *
 * Drawn in the scene (before the water): the water pass sees it as something standing above its surface, and covers
 * the part of it that is inside the wave.
 */
export class SurfLip {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly uLip = { value: new Vector4(0, 60, 0, 10) };
  private readonly uLevel = { value: 0 };

  constructor(surf: SurfUniforms, light: LipLight) {
    const pos = new Float32Array((COLS + 1) * (ROWS + 1) * 3);
    const uvs = new Float32Array((COLS + 1) * (ROWS + 1) * 2);
    for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) {
      const k = j * (COLS + 1) + i;
      uvs[k * 2] = i / COLS; uvs[k * 2 + 1] = j / ROWS;
    }
    const idx: number[] = [];
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i, b = a + COLS + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('lipUv', new BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    this.material = new ShaderMaterial({
      uniforms: {
        ...light, uLip: this.uLip, uLevel: this.uLevel,
        uSurf: surf.uSurf, uSurfDir: surf.uSurfDir, tSurfZone: surf.tSurfZone, tSurfAux: surf.tSurfAux, uSurfLv: surf.uSurfLv, uSurfGrid: surf.uSurfGrid,
      },
      side: DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec2 lipUv;
        uniform vec4 uLip;      // x: the viewer's alongshore position, y: the ribbon's length, z, w: the band searched (s)
        uniform float uLevel, uTime;
        varying vec3 vPos;
        varying vec3 vNrm;
        varying float vV, vFoam, vAlpha, vStage;
        ${SURF_GLSL}
        void main() {
          float y = uLip.x + (lipUv.x - 0.5) * uLip.y;
          vec4 cr = surfBreakingCrest(y, uLip.z, uLip.w, uLevel, uTime, 24);
          vec2 d = uSurfDir.xy, al = vec2(-d.y, d.x);
          // the lip is thrown while the crest goes over (q from 1 to about 1.3), by plunging waves big enough to show
          float stage = smoothstep(0.98, 1.32, cr.y);
          float on = cr.x > -1e3 ? smoothstep(0.25, 0.55, cr.z) * smoothstep(0.92, 1.0, cr.y) * (1.0 - smoothstep(1.3, 1.5, cr.y)) * smoothstep(0.08, 0.16, cr.w) : 0.0;
          float H = cr.w;
          float v = lipUv.y;
          // the jet off the crest: forward (shoreward) about half the wave's height at most, a little lift at first,
          // then falling to the trough in front as the wave goes over
          float reach = H * mix(0.08, 0.62, pow(stage, 0.7)) * on;
          float top = uLevel + H * 0.56, trough = uLevel - H * 0.36;
          float fall = (top - trough) * pow(stage, 1.4) * on;
          float sx = cr.x - reach * v;
          float h = top + H * 0.1 * on * v * (1.0 - v) * (1.0 - stage) - fall * v * v;
          // (it starts a little inside the crest, so the root is under the water's surface)
          h -= (1.0 - smoothstep(0.0, 0.12, v)) * 0.03;
          vec2 xz = d * sx + al * y;
          vec3 P = vec3(xz.x, h, xz.y);
          // the curve's tangent across the lip and the shore's along it
          vec2 tg = vec2(-reach, H * 0.1 * on * (1.0 - 2.0 * v) * (1.0 - stage) - 2.0 * fall * v);
          vec3 t1 = normalize(vec3(d.x * tg.x, tg.y, d.y * tg.x) + vec3(0.0, 1e-4, 0.0));
          vec3 t2 = vec3(al.x, 0.0, al.y);
          vNrm = normalize(cross(t2, t1));
          vPos = P;
          vV = v;
          vStage = stage;
          vFoam = stage;
          vAlpha = on;
          // (folded away where no crest is going over)
          gl_Position = on > 0.002 ? projectionMatrix * viewMatrix * vec4(P, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir, uSunCol, uWaterFog, uFogColor;
        uniform float uSunUp, uAmbient, uEnvI, uFogDensity, uTime, uSurfDebug;
        uniform samplerCube tEnv;
        varying vec3 vPos;
        varying vec3 vNrm;
        varying float vV, vFoam, vAlpha, vStage;
        float hashL(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vnoiseL(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hashL(i), hashL(i + vec2(1, 0)), f.x), mix(hashL(i + vec2(0, 1)), hashL(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          // the edges of the sheet: torn, dithered away where the lip is only starting or ending
          float n = vnoiseL(vPos.xz * 3.0 + uTime * vec2(0.3, -0.2)) * 0.6 + vnoiseL(vPos.xz * 11.0 - uTime) * 0.4;
          float edge = vAlpha * (1.0 - smoothstep(0.82 - 0.35 * n, 1.0, vV));
          if (edge < hashL(gl_FragCoord.xy + fract(uTime * 13.0) * 61.0) * 0.9 + 0.05) discard;
          vec3 V = normalize(cameraPosition - vPos);
          vec3 N = normalize(vNrm);
          if (dot(N, V) < 0.0) N = -N;
          float cosT = clamp(dot(N, V), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
          vec3 refl = min(textureCube(tEnv, reflect(-V, N)).rgb * uEnvI, vec3(10.0));
          // a sheet of water a few centimetres thick: the light through it bottle green, bright with the sun behind
          float back = pow(max(dot(-V, uSunDir), 0.0), 3.0);
          vec3 trans = (uWaterFog * 3.0 + vec3(0.04, 0.17, 0.13)) * (uSunCol * uSunUp * (0.35 + 1.4 * back) + uAmbient * uFogColor * 0.7);
          vec3 col = mix(trans, refl, F);
          // and white where it is torn into spray and air: toward its tip, more as it goes over
          float foam = clamp(smoothstep(0.15, 0.7, vV * 0.8 + 0.45 * vStage + 0.4 * (n - 0.5)) * (0.45 + 0.55 * vStage), 0.0, 1.0);
          vec3 skyE = (textureCube(tEnv, vec3(0.0, 1.0, 0.0)).rgb * 0.45 + textureCube(tEnv, normalize(vec3(V.x, 0.35, V.z))).rgb * 0.55) * uEnvI;
          vec3 foamC = 0.92 * (uSunCol * uSunUp * (0.15 + 0.85 * max(dot(N, uSunDir), 0.0)) * 0.34 + min(skyE, vec3(6.0)) * 1.05 + uAmbient * vec3(0.12, 0.13, 0.14)) + uSunCol * uSunUp * back * 0.1;
          col = mix(col, foamC, foam);
          float fogF = 1.0 - exp(-pow(uFogDensity * length(cameraPosition - vPos), 2.0));
          col = mix(col, uFogColor, fogF);
          if (uSurfDebug > 0.5) col = vec3(2.0, 0.0, 2.0) * (0.5 + 0.5 * vV);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'surf-lip';
    this.mesh.renderOrder = 1;
  }

  /** Follow the viewer and the water level (`band`: breakerBand's). */
  update(band: Vector4, level: number): void {
    this.uLip.value.set(band.x, 60, band.z, band.w);
    this.uLevel.value = level;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
