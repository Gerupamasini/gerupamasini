import { AlwaysDepth, BackSide, BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Mesh, NoBlending, Scene, ShaderMaterial, Vector3, type IUniform, type Matrix4, type PerspectiveCamera, type Texture } from 'three';
import { BOX_VERT, ROOM_LOOKUP, SCREEN, TANK_COMMON } from './glsl';
import type { ScreenUniforms, TankPasses } from './TankRenderer';

/**
 * The water and the glass, one full-screen pass: outside the tank's box the scene is copied through (colour and
 * depth, so what is transparent above the water can be drawn over it afterwards); inside it, per pixel, from the
 * opaque scene's colour and depth:
 *  - the front pane: the room in its two faces (Fresnel), a faint green through it, thicker at a slant;
 *  - the way into the water: through a pane, down through the moving surface (bent by its
 *    slope, the room and the bar reflected), or from the camera itself when it is under water;
 *  - what the bent ray meets: found on the depth buffer by a few secant steps, then looked up in the colour, blurred
 *    a little with the length of water on the way. Through a flat pane the image is not shifted (the shift is small
 *    and even, and a screen-space search would fray every silhouette); the bent ray still decides whether the view
 *    leaves the water first and how far it travels in it. Through the moving surface the image swims as it should;
 *  - a ray that leaves the water first: up through the surface (Snell's window: the room and the bar) or mirrored
 *    by it (past the critical angle the underside of the surface is a perfect mirror of the sand and the animals),
 *    out through a pane to the room, or mirrored by a side pane at a slant (total reflection at the glass's outer
 *    face, the aquarium's endless side walls);
 *  - Beer–Lambert absorption over the whole way, a little light scattered back by the water itself, the light
 *    shafts from the half-resolution pass, and the meniscus where the surface meets the glass.
 */
const WATER_FRAG = /* glsl */ `
uniform sampler2D uSceneColor, uVol;
uniform vec2 uRes;
uniform float uGlass, uTankTop, uBlurK, uPixAngle, uExtinct;
uniform vec3 uScatterCol, uDeepCol, uGlassTint, uMeniscusCol;
uniform mat4 uCamWorld;
uniform float uDebug;   // 1: which way each ray went (green: met something, blue: the surface from below, red: a pane as a mirror, yellow: out through a pane)
float dbgBranch = 0.0;
varying vec2 vNdc;

// capillary ripples finer than the simulation's grid: the bar's reflection breaks into glints, the view through
// the surface shimmers (faded out where they would be finer than a pixel)
vec3 microNormal(vec3 n, vec2 p, float px) {
  float fade = 1.0 - smoothstep(0.0015, 0.005, px);
  vec2 g = vec2(0.0);
  // three short wave trains at odd angles, each bent by the next, so no grid shows
  vec2 q = p * 210.0;
  float a = dot(q, vec2(0.83, 0.56)) + 1.7 * sin(dot(q, vec2(-0.31, 0.95)) * 0.37 + uTime * 0.8) - uTime * 3.1;
  g += vec2(0.83, 0.56) * cos(a);
  float b = dot(q, vec2(-0.47, 0.88)) * 1.37 + 1.3 * sin(dot(q, vec2(0.9, 0.43)) * 0.41 - uTime * 0.6) - uTime * 3.7;
  g += vec2(-0.47, 0.88) * cos(b) * 0.8;
  float c = dot(q, vec2(0.99, -0.12)) * 1.91 + 1.1 * sin(a * 0.29) - uTime * 4.3;
  g += vec2(0.99, -0.12) * cos(c) * 0.55;
  return normalize(n + vec3(g.x, 0.0, g.y) * 0.016 * fade);
}
bool onScreen(vec3 q) { return q.z > 0.0 && q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0; }
vec3 sceneAt(vec3 p, float L) {
  vec3 q = projectUV(p);
  float lod = clamp(log2(1.0 + L * uBlurK), 0.0, 4.0);
  return textureLod(uSceneColor, clamp(q.xy, vec2(0.0), vec2(1.0)), lod).rgb;
}
// the opaque scene along E + r s, from the guess s (secant steps on the depth buffer; s stays within sMax)
float findHit(vec3 o, vec3 E, vec3 r, float s, float sMax) {
  for (int i = 0; i < HIT_ITER; i++) {
    vec3 P = E + r * s;
    vec3 q = projectUV(P);
    if (!onScreen(q)) break;
    vec3 v = P - o;
    float dP = length(v);
    float k = max(dot(r, v / dP), 0.25);
    s = clamp(s + (sceneDist(q.xy) - dP) / k, 0.0, sMax);
  }
  return s;
}
// a second leg inside the water (mirrored by the surface or a pane): what it meets and how long it is
vec3 bounce(vec3 o, vec3 P, vec3 r, vec3 whi, out float Lb) {
  vec2 tx = boxHit(P, r, vec3(-uTankHalf.x, uFloorY, -uTankHalf.y), whi);
  float sB = max(tx.y, 0.0);
  float s = findHit(o, P, r, sB, sB);
  Lb = s;
  vec3 q = projectUV(P + r * s);
  if (!onScreen(q)) return uDeepCol;
  return textureLod(uSceneColor, q.xy, clamp(log2(1.0 + s * uBlurK), 0.0, 4.0)).rgb;
}

vec3 waterView(vec3 o, vec3 d, float t0, float t1, float tScene, bool fromOutside, vec2 uv, vec3 base) {
  vec3 wlo = vec3(-uTankHalf.x, 0.0, -uTankHalf.y), whi = vec3(uTankHalf.x, uWaterLevel, uTankHalf.y);
  vec3 p0 = o + d * t0;
  float h0 = uWaterLevel + wave(clamp(p0.xz, -uTankHalf, uTankHalf)).x;
  // the meniscus: the water climbs the glass a millimetre or two; a bright line on it, the surface's edge under it
  float men = 0.0;
  if (fromOutside && abs(d.y) < 0.95) {
    float px = max(t0 * uPixAngle, 1e-4), dy = p0.y - h0;
    men = exp(-abs(dy - 0.0006) / max(1.2 * px, 0.0005));
  }
  vec3 E, r;
  float tE, Ff = 0.0;
  vec3 front = vec3(0.0);
  bool pane = false;
  if (p0.y <= h0) {
    E = p0; tE = t0;
    pane = fromOutside;
    r = fromOutside ? refract(d, boxNormal(p0, wlo, whi + vec3(0.0, 0.012, 0.0)), 1.0 / W_IOR) : d;
  } else {
    // in the air above the water: down through the moving surface, if the ray gets there
    if (d.y > -1e-4) return base + uMeniscusCol * men;
    float ts = (uWaterLevel - o.y) / d.y;
    for (int i = 0; i < 2; i++) ts = (uWaterLevel + wave(clamp(o.xz + d.xz * ts, -uTankHalf, uTankHalf)).x - o.y) / d.y;
    ts = max(ts, t0);
    if (ts >= t1) return base + uMeniscusCol * men;
    E = o + d * ts; tE = ts;
    vec3 n = microNormal(normalOf(wave(clamp(E.xz, -uTankHalf, uTankHalf))), E.xz, ts * uPixAngle);
    float cn = dot(d, n);
    if (cn > -0.05) { n = normalize(n - d * (cn + 0.05)); cn = dot(d, n); }
    Ff = fresnel(-cn);
    front = room(E, reflect(d, n), 0.0);
    r = refract(d, n, 1.0 / W_IOR);
  }
  // in the water: what the view meets, or where it leaves the water
  float L, sHit, sBox;
  if (pane) {
    // through a flat pane: the straight view finds what is met (the image is not shifted)
    sBox = max(boxHit(E, d, wlo, whi).y, 0.0);
    sHit = tScene - tE;
  } else {
    sBox = max(boxHit(E, r, wlo, whi).y, 0.0);
    sHit = findHit(o, E, r, clamp(tScene - tE, 0.0, sBox), sBox);
  }
  vec3 c;
  if (sHit < sBox - 0.002) {
    L = sHit;
    float lod = clamp(log2(1.0 + L * uBlurK), 0.0, 4.0);
    if (pane) c = textureLod(uSceneColor, uv, lod).rgb;
    else {
      // what the bent ray meets may be hidden on screen by something nearer (the rim of a pane, a hose above the
      // water): the straight view is used there instead of the thing in front
      vec3 P = E + r * sHit, q = projectUV(P);
      bool seen = onScreen(q) && sceneDist(q.xy) > length(P - o) - 0.015;
      c = textureLod(uSceneColor, seen ? q.xy : uv, lod).rgb;
    }
    dbgBranch = 1.0;
  } else {
    // the bent ray decides how the view leaves the water
    if (pane) sBox = max(boxHit(E, r, wlo, whi).y, 0.0);
    L = sBox;
    vec3 P = E + r * sBox, nx = boxNormal(P, wlo, whi);
    if (nx.y > 0.5) {
      // the surface from below
      vec3 nw = microNormal(normalOf(wave(clamp(P.xz, -uTankHalf, uTankHalf))), P.xz, (tE + sBox) * uPixAngle);
      vec3 rt = refract(r, -nw, W_IOR);
      float F = dot(rt, rt) < 1e-4 ? 1.0 : fresnel(dot(rt, nw));
      float Lb;
      vec3 refl = bounce(o, P, reflect(r, -nw), whi, Lb) * exp(-uAbsorb * Lb);
      c = mix(room(P, rt, 0.0), refl, F);
      dbgBranch = 2.0;
    } else {
      float cw = dot(r, nx);
      if (W_IOR * W_IOR * (1.0 - cw * cw) > 1.0 && nx.y > -0.5) {
        // a side pane seen at a slant: a mirror
        float Lb;
        c = bounce(o, P, reflect(r, nx), whi, Lb) * exp(-uAbsorb * Lb) * uGlassTint;
        dbgBranch = 3.0;
      } else {
        // out through the pane into the room
        if (pane) c = textureLod(uSceneColor, uv, 0.0).rgb * uGlassTint;
        else {
          vec3 ra = refract(r, -nx, W_IOR);
          float s2 = findHit(o, P, ra, max(tScene - tE - sBox, 0.0), 40.0);
          c = sceneAt(P + ra * s2, 0.0) * uGlassTint;
        }
        dbgBranch = 4.0;
      }
    }
  }
#ifdef SHAFTS
  if (uDebug > 1.5) return textureLod(uVol, uv, 0.0).rgb * 4.0;
#endif
  if (uDebug > 0.5) return 0.15 * c + (dbgBranch == 1.0 ? vec3(0.0, 0.5, 0.0) : dbgBranch == 2.0 ? vec3(0.0, 0.0, 0.8) : dbgBranch == 3.0 ? vec3(0.8, 0.0, 0.0) : vec3(0.7, 0.7, 0.0));
  vec3 T = exp(-uAbsorb * L);
  c = c * T + uScatterCol * (1.0 - exp(-uExtinct * L));
#ifdef SHAFTS
  c += textureLod(uVol, uv, 0.0).rgb;
#endif
  return mix(c, front, Ff) + uMeniscusCol * men;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  gl_FragDepth = textureLod(uSceneDepth, uv, 0.0).r;
  vec3 col = textureLod(uSceneColor, uv, 0.0).rgb;
  gl_FragColor = vec4(col, 1.0);
  vec3 o = cameraPosition - uTankOrigin;
  vec4 vp = uInvProj * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize((uCamWorld * vec4(vp.xyz / vp.w, 0.0)).xyz);
  vec3 lo = vec3(-uTankHalf.x - uGlass, -uGlass, -uTankHalf.y - uGlass), hi = vec3(uTankHalf.x + uGlass, uTankTop, uTankHalf.y + uGlass);
  vec2 tb = boxHit(o, d, lo, hi);
  if (tb.x > tb.y || tb.y < 0.0 || uTankTop <= 0.0) return;
  float tScene = sceneDist(uv);
  if (max(tb.x, 0.0) >= tScene) return;
  vec2 tw = boxHit(o, d, vec3(-uTankHalf.x, 0.0, -uTankHalf.y), vec3(uTankHalf.x, uWaterLevel + 0.012, uTankHalf.y));
  float t0 = max(tw.x, 0.0), t1 = min(tw.y, tScene);
  if (tw.x <= tw.y && t0 < t1) col = waterView(o, d, t0, t1, tScene, tw.x > 0.0, uv, col);
  // the pane in front: the room in its two faces
  if (tb.x > 0.0) {
    vec3 pg = o + d * tb.x, ng = boxNormal(pg, lo, hi);
    if (ng.y < 0.5) {
      float c = abs(dot(d, ng));
      float Fg = min(1.0, 2.0 * (0.04 + 0.96 * pow(1.0 - c, 5.0)));
      col = col * pow(uGlassTint, vec3(1.0 / max(c, 0.25))) * (1.0 - Fg) + room(pg, reflect(d, ng), 0.01) * Fg;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * The bar's light scattered toward the eye inside the water, at half resolution: a few steps along the bent view
 * ray, each lit by the bar (its falloff, the shadows of the animals and the stones from the spot light's shadow map)
 * through the moving surface. Near the surface the light is even; deeper down it gathers into the sheets whose foot
 * is the caustic net on the sand. Forward scattering makes the shafts glow when the eye looks up toward the bar.
 */
const SHAFT_FRAG = /* glsl */ `
uniform vec2 uVolRes;
uniform vec3 uShaftCol;
#ifdef SHAFT_SHADOW
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
#endif
varying vec3 vWorld;
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
// fine particles scatter mostly forward, the water itself evenly
float phase(float c) { return 0.4 * 0.0796 + 0.6 * hg(c, 0.65); }
void main() {
  vec2 uv = gl_FragCoord.xy / uVolRes;
  vec3 o = cameraPosition - uTankOrigin;
  vec3 d = normalize(vWorld - cameraPosition);
  float tScene = sceneDist(uv);
  vec3 wlo = vec3(-uTankHalf.x, 0.0, -uTankHalf.y), whi = vec3(uTankHalf.x, uWaterLevel, uTankHalf.y);
  vec2 tw = boxHit(o, d, wlo, whi);
  float t0 = max(tw.x, 0.0), t1 = min(tw.y, tScene);
  if (tw.x > tw.y || t0 >= t1) discard;
  vec3 E = o + d * t0, r = d;
  if (tw.x > 0.0) r = refract(d, boxNormal(E, wlo, whi), 1.0 / W_IOR);
  float sEnd = min(t1 - t0, max(boxHit(E, r, wlo, whi).y, 0.0));
  float ds = sEnd / float(SHAFT_N), j = ign(gl_FragCoord.xy);
  float span = max(uWaterLevel - uFloorY, 0.05);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < SHAFT_N; i++) {
    float s = (float(i) + j) * ds;
    vec3 X = E + r * s;
    vec3 L;
    float e = lampAt(X, L);
    vec3 lin = refract(-L, vec3(0.0, 1.0, 0.0), 1.0 / W_IOR);
    float depth = max(uWaterLevel - X.y, 0.0);
    vec2 cuv = causUV(X.xz + lin.xz * (max(X.y - uFloorY, 0.0) / max(-lin.y, 0.3)));
    float sharp = textureLod(uCaus, cuv, 0.0).g, soft = textureLod(uCaus, cuv, 4.0).g;
    float focus = clamp(depth / span, 0.0, 1.0);
    // the sheets: the net's contrast, gathering with depth (sharper and more broken up toward the sand)
    float ratio = clamp(sharp / max(soft, 1e-3), 0.0, 6.0);
    float sheet = mix(1.0, ratio * ratio * 0.7, 0.3 + 0.7 * focus);
    float vis = 1.0;
#ifdef SHAFT_SHADOW
    vec4 sc = uShadowMatrix * vec4(X + uTankOrigin, 1.0);
    sc.xyz /= sc.w;
    if (sc.w > 0.0 && sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) vis = texture(uShadowMap, vec3(sc.xy, sc.z - 0.002));
#endif
    acc += e * sheet * vis * phase(dot(lin, -r)) * exp(-uAbsorb * (depth / max(-lin.y, 0.3) + s));
  }
  gl_FragColor = vec4(acc * ds * uLampCol * uShaftCol, 1.0);
}
`;

export interface WaterPassOptions {
  /** secant steps for what the bent rays meet (1–3) */
  hitIter: number;
  /** steps through the light shafts (0: none) */
  shaftSteps: number;
  /** whether the animals' and the stones' shadows cut the shafts */
  shaftShadows: boolean;
}

/** The water/glass pass and the shaft pass of one tank, with the uniforms they share. */
export class WaterPasses implements TankPasses {
  readonly water = new Scene();
  private readonly shaftScene = new Scene();
  readonly screen: ScreenUniforms;
  private readonly waterMesh: Mesh;
  private readonly shaftMesh: Mesh;
  private readonly waterMat: ShaderMaterial;
  private readonly shaftMat: ShaderMaterial;
  private shaftsOn = false;
  /** the uniforms of these passes (besides the tank's shared block and the screen's) */
  readonly P: {
    uGlass: IUniform<number>; uTankTop: IUniform<number>; uExtinct: IUniform<number>;
    uScatterCol: IUniform<Color>; uDeepCol: IUniform<Color>; uGlassTint: IUniform<Color>; uMeniscusCol: IUniform<Color>;
    uShaftCol: IUniform<Color>; uShadowMap: IUniform<Texture | null>; uShadowMatrix: IUniform<Matrix4 | null>; uDebug: IUniform<number>;
  };
  /** the tank's world origin: the box meshes follow it */
  private readonly origin: Vector3;
  /** set by the tank: per-frame updates that need the camera (the lamp's colours, the shadow map) */
  onBeforeRender: ((camera: PerspectiveCamera) => void) | null = null;
  /** set by the tank: whether transparent things above the water were found (LAYER_OVER) */
  hasOverlay = true;

  constructor(U: Record<string, IUniform>, screen: ScreenUniforms, origin: Vector3) {
    this.screen = screen;
    this.origin = origin;
    this.P = {
      uGlass: { value: 0.006 }, uTankTop: { value: 0.36 }, uExtinct: { value: 1.1 },
      uScatterCol: { value: new Color(0.03, 0.08, 0.09) }, uDeepCol: { value: new Color(0.02, 0.05, 0.06) },
      uGlassTint: { value: new Color(0.972, 0.99, 0.982) }, uMeniscusCol: { value: new Color(0.3, 0.33, 0.34) },
      uShaftCol: { value: new Color(1.7, 2.5, 2.7) }, uShadowMap: { value: null }, uShadowMatrix: { value: null }, uDebug: { value: 0 },
    };
    const uniforms = { ...U, ...screen, ...this.P };
    this.waterMat = new ShaderMaterial({
      name: 'TankWater', uniforms, fragmentShader: TANK_COMMON + ROOM_LOOKUP + SCREEN + WATER_FRAG,
      vertexShader: 'varying vec2 vNdc; void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      depthTest: true, depthWrite: true, depthFunc: AlwaysDepth, blending: NoBlending, defines: { HIT_ITER: 2 },
    });
    this.shaftMat = new ShaderMaterial({
      name: 'TankShafts', uniforms, vertexShader: BOX_VERT, fragmentShader: TANK_COMMON + SCREEN + SHAFT_FRAG,
      side: BackSide, depthTest: false, depthWrite: false, blending: NoBlending, defines: { SHAFT_N: 10 },
    });
    const tri = new BufferGeometry();
    tri.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.waterMesh = new Mesh(tri, this.waterMat);
    this.shaftMesh = new Mesh(new BoxGeometry(1, 1, 1), this.shaftMat);
    for (const m of [this.waterMesh, this.shaftMesh]) m.frustumCulled = false;
    this.water.add(this.waterMesh);
    this.shaftScene.add(this.shaftMesh);
  }

  get shafts(): Scene | null { return this.shaftsOn && this.shaftMesh.visible ? this.shaftScene : null; }

  /** The box over the tank, its panes included: the passes draw on its back faces. */
  setDimensions(width: number, depth: number, height: number, glass: number): void {
    this.P.uGlass.value = glass; this.height = height;
    if (this.shaftMesh.visible) this.P.uTankTop.value = height;
    this.shaftMesh.scale.set(width + 2 * glass + 0.004, height + glass + 0.004, depth + 2 * glass + 0.004);
    this.shaftMesh.userData.centerY = (height - glass) / 2;
  }

  setOptions(o: WaterPassOptions): void {
    const wd = this.waterMat.defines, sd = this.shaftMat.defines;
    const shafts = o.shaftSteps > 0;
    let dirty = wd.HIT_ITER !== o.hitIter || ('SHAFTS' in wd) !== shafts;
    wd.HIT_ITER = o.hitIter;
    if (shafts) wd.SHAFTS = 1; else delete wd.SHAFTS;
    if (dirty) this.waterMat.needsUpdate = true;
    dirty = sd.SHAFT_N !== o.shaftSteps || ('SHAFT_SHADOW' in sd) !== o.shaftShadows;
    if (shafts) sd.SHAFT_N = o.shaftSteps;
    if (o.shaftShadows) sd.SHAFT_SHADOW = 1; else delete sd.SHAFT_SHADOW;
    if (dirty && shafts) this.shaftMat.needsUpdate = true;
    this.shaftsOn = shafts;
  }

  /** Without a tank in the room the full-screen pass only copies the scene through (a zero-height box). */
  setVisible(on: boolean): void { this.shaftMesh.visible = on; this.P.uTankTop.value = on ? this.height : 0; }
  private height = 0.36;

  beforeRender(camera: PerspectiveCamera): void {
    const m = this.shaftMesh;
    m.position.set(this.origin.x, this.origin.y + m.userData.centerY, this.origin.z);
    this.onBeforeRender?.(camera);
  }

  dispose(): void {
    this.waterMesh.geometry.dispose();
    this.shaftMesh.geometry.dispose();
    this.waterMat.dispose();
    this.shaftMat.dispose();
  }
}
