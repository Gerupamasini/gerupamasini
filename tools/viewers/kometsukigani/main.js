// Dev-only viewer for the コメツキガニ model, rig, materials and (later) behaviour. Not part of the game build.
// URL params: view=front|side|top|q34|back|low|macro|under  pose=stand|feed|wave|fold|walk  lod=0|1|2
//             wet=0..1 sand=0..1 seed=int sex=m|f sun=elevationDeg az=deg w,h (canvas size) live=1 (run the sim)
import {
  ACESFilmicToneMapping, AgXToneMapping, Color, DirectionalLight, Vector4, IcosahedronGeometry, InstancedMesh, Matrix4, Quaternion, Euler, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshPhysicalMaterial, OrthographicCamera, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer, BackSide, SphereGeometry, ShaderMaterial,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CrabModel } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaModel.js';
import { STANCE } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaMorphology.js';
import { CHELA_POSES } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaRig.js';
import { crabTriangles } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaGeometry.js';
import { ScopimeraGlobosa, makeEnv, seasonFor } from '../../../src/creatures/kometsukigani/ScopimeraGlobosa.js';
import { BurrowRenderer, shaftAxis, RENDER_ORDER } from '../../../src/creatures/kometsukigani/Burrows.js';
import { SandPellets } from '../../../src/creatures/kometsukigani/SandPellets.js';
import { paletteFor } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaMaterial.js';

const Q = new URLSearchParams(location.search);
/**
 * Photo-match presets: the camera, light, ground, colour morph and pose of the reference photographs, so a render
 * can be laid beside its photo and judged part by part (tools/viewers/kometsukigani/compare.mjs).
 *   p1 aquarium, front, just above the floor (pale individual)      p2 on its back on a palm (ventral)
 *   p3 aquarium, front, a little higher (khaki individual)          p4 field, 3/4 from above, dark sand, pellets
 *   p5 field, ground level, a dark purple male waving               p6 the pinned specimen from above (plate 007)
 * Any preset value can be overridden in the URL (e.g. &fov=5 for a close-up, &dbg=1 for the albedo alone).
 */
const PRESETS = {
  p1: { scene: 'studio', pal: 'pale', pose: 'stand', cam: '0,0.55,7.4', tgt: '0,0.36,0', fov: 13, sex: 'm', wet: 0.75, sand: 0.02, tip: 0, sun: 70, az: 175, exp: 1.15, env: 0.6, hemi: 1.5, fill: 0.55 },
  p2: { scene: 'hand', pal: 'pale', pose: 'flip', cam: '0,2.5,-3.0', tgt: '0,0.45,0.1', fov: 17, sex: 'm', wet: 0.9, sand: 0, tip: 0, sun: 60, az: 200, exp: 0.62, env: 0.5, hemi: 0.9 },
  p3: { scene: 'studio', pal: 'khaki', pose: 'stand', cam: '0,2.1,7.4', tgt: '0,0.34,0', fov: 13, sex: 'm', wet: 0.75, sand: 0.02, tip: 0, sun: 65, az: 190, exp: 1.15, env: 0.6, hemi: 1.5, fill: 0.55 },
  p4: { scene: 'dark', pal: 'grey', pose: 'feed', cam: '-3.2,5.2,7.2', tgt: '0,0.25,0.2', fov: 24, sex: 'f', wet: 0.4, sand: 0.5, tip: 0.6, sun: 50, az: 220, exp: 0.95, env: 0.25, hemi: 0.85, pellets: 260, heading: 0.35 },
  // the pinned specimen seen from above (p-007): dorsal pattern and leg proportions
  p6: { scene: 'dark', pal: 'brown', pose: 'stand', cam: '0,9.5,-0.01', tgt: '0,0.3,0', fov: 13.7, sex: 'm', wet: 0.3, sand: 0, tip: 0, sun: 80, az: 180, exp: 0.9, env: 0.3, hemi: 0.9 },
  p5: { scene: 'dark', pal: 'purple', pose: 'wave', cam: '0,1.6,11.3', tgt: '0,0.88,0', fov: 15, sex: 'm', wet: 0.25, sand: 0.35, tip: 0.5, sun: 60, az: 150, exp: 0.75, env: 0.12, hemi: 0.5 },
};
const PRE = PRESETS[Q.get('preset')] ?? {};
const param = (k) => (Q.has(k) ? Q.get(k) : PRE[k] !== undefined ? String(PRE[k]) : null);
const num = (k, d) => { const v = param(k); return v === null ? d : Number(v); };
const vec = (k) => { const v = param(k); return v === null ? null : v.split(',').map(Number); };
const canvas = document.getElementById('c');
const W = num('w', 0), H = num('h', 0);
if (W && H) { canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; }
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W || innerWidth, H || innerHeight, false);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = num('exp', 0.62);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

const SCENE = param('scene') ?? 'field';
const scene = new Scene();
scene.background = new Color(SCENE === 'studio' ? 0xd9dde0 : SCENE === 'hand' ? 0xd9a48c : SCENE === 'dark' ? 0x8a8580 : SCENE === 'clay' ? 0x8c9094 : SCENE === 'sil' ? 0xffffff : SCENE === 'beach' ? 0xb9c4cc : 0x9fb3c0);
// beach: natural daylight on a sand flat, for judging the crab as a macro photograph would show it
const BEACH = SCENE === 'beach';
// clay: the untextured grey model (shape review); sil: a black silhouette on white (overlay on a photo)
const CLAY = SCENE === 'clay', SIL = SCENE === 'sil';

// sky gradient → environment
const skyMat = new ShaderMaterial({
  side: BackSide, depthWrite: false,
  uniforms: { uSun: { value: new Vector3(0, 1, 0) } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: SCENE === 'studio' || SCENE === 'hand'
    // a bright room seen through the tank: white walls, a window band, the bench below
    // a room seen from the tank: mid-grey walls, a bright window to the front-left, a ceiling light, the bench
    ? 'varying vec3 vD; void main(){ float y = vD.y; vec3 c = vec3(0.32,0.33,0.34); c = mix(c, vec3(0.5,0.5,0.5), smoothstep(-0.05, 0.3, y)); float win = smoothstep(0.6, 0.88, dot(vD, normalize(vec3(-0.5,0.35,0.8)))); c += vec3(1.5,1.52,1.55) * win; c += vec3(1.2) * smoothstep(0.88, 0.98, y); c = mix(c, vec3(0.22,0.21,0.2), smoothstep(0.0, -0.4, y)); gl_FragColor = vec4(c, 1.0); }'
    : BEACH
      // a clear sky: deep blue zenith, a pale hazy horizon, the sun as a small very bright disc (it is what a wet
      // cornea or a glossy leg reflects), and the bright sand below (half the light a crab on a beach receives)
      ? `uniform vec3 uSun; varying vec3 vD; void main(){ float y = vD.y; vec3 c = mix(vec3(0.95,0.97,1.0), vec3(0.28,0.45,0.82), smoothstep(0.0, 0.7, y));
         c += vec3(1.0,0.95,0.85) * 0.6 * pow(max(0.0, dot(vD, uSun)), 8.0); c += vec3(60.0,56.0,50.0) * smoothstep(0.9993, 0.9997, dot(vD, uSun));
         c = mix(c, vec3(0.62,0.54,0.42), smoothstep(0.02, -0.12, y)); gl_FragColor = vec4(c, 1.0); }`
      : 'varying vec3 vD; void main(){ float y = vD.y; vec3 c = mix(vec3(0.62,0.66,0.62), vec3(0.32,0.5,0.78), smoothstep(0.0, 0.6, y)); c = mix(c, vec3(0.42,0.38,0.32), smoothstep(0.0, -0.3, y)); gl_FragColor = vec4(c, 1.0); }',
});
const el = num('sun', 48) * Math.PI / 180, az = num('az', 130) * Math.PI / 180;
const sunDir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
skyMat.uniforms.uSun.value.copy(sunDir);
const envScene = new Scene();
envScene.add(new Mesh(new SphereGeometry(10, 64, 32), skyMat));
const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0.0).texture;
scene.environmentIntensity = num('env', BEACH ? 0.55 : 0.09);

const CW = num('cw', 9) / 1000;
// sun: tight shadow frustum around the crab (as in the game's focused observation shadows)
// sunc=rrggbb: the sun's colour (an evening photograph's warm light, 063)
const sun = new DirectionalLight(param('sunc') ? Number(`0x${param('sunc')}`) : BEACH ? 0xffeedd : 0xfff3e6, num('sunI', BEACH ? 2.9 : 2.6));
sun.position.copy(sunDir).multiplyScalar(0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -0.05; sc.right = 0.05; sc.top = 0.05; sc.bottom = -0.05; sc.near = 0.01; sc.far = 1.5;
sun.shadow.bias = -0.00002;
sun.shadow.normalBias = 0.00004;
scene.add(sun, sun.target);
if (SCENE === 'studio' || SCENE === 'hand') {
  scene.add(new HemisphereLight(0xf2f5f8, 0x8c857e, num('hemi', 0.5)));
  // the tank is lit from the room: a broad soft fill from the front
  const fill = new DirectionalLight(0xffffff, num('fill', 0.9));
  fill.position.set(0, 0.2, 1);
  scene.add(fill);
} else scene.add(new HemisphereLight(0x95aec4, 0x5a4a36, num('hemi', BEACH ? 0.25 : 0.5)));
if (BEACH) sun.shadow.radius = 2.5;

// sand: a procedural ground close enough to the game's flat to judge the crab against
const SANDC = SCENE === 'dark' ? [0.2, 0.195, 0.18] : BEACH ? [0.4, 0.33, 0.23] : [0.42, 0.34, 0.22];
// dark tidal sands (5.webp, 6.webp): salt and pepper — quartz and shell white, magnetite black, grey lithics
const PEPPER = SCENE === 'dark' ? 1 : 0;
const sandMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
sandMat.onBeforeCompile = (s) => {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vW;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ return vec2(h21(p), h21(p+17.3)); }
float gH = 0.0; vec2 gN = vec2(0.0);`).replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 mm = vW.xz * 1000.0;
  vec2 ip = floor(mm / 0.22), fp = fract(mm / 0.22);
  float best = 9.0; vec2 id = vec2(0.0), off = vec2(0.0);
  for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){ vec2 g = vec2(i,j); vec2 r = g + h22(ip+g)*0.8+0.1 - fp; float d = dot(r,r); if (d<best){best=d; id=ip+g; off=r;} }
  float k = h21(id+3.1);
  vec3 base = vec3(${SANDC.join(', ')});
  vec3 c = base * (0.75 + 0.5 * k);
  float pep = ${PEPPER.toFixed(1)};
  if (k > 0.94 - 0.12 * pep) c = vec3(0.75, 0.72, 0.66) * (0.8 + 0.25 * h21(id + 7.7)); else if (k > 0.9 - 0.12 * pep || k < 0.22 * pep) c = base * 0.3;
  float disc = smoothstep(0.42, 0.3, sqrt(best));
  c = mix(base * 0.8, c, disc);
  diffuseColor.rgb = c * 0.85;
  gN = -off * disc * 0.9;
}`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(normal + (viewMatrix * vec4(gN.x, 0.0, gN.y, 0.0)).xyz * 0.6);`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = 0.62;');
};
// beach sand at macro scale: grains of several minerals (quartz, feldspar, lithics, a few dark heavy minerals and
// shell bits), each a little dome with a dark crevice around it, a silt fraction between them; plus the contact
// shading of the crab — a soft occlusion under the body and a small dark ring and a dimple where each foot
// presses in (uniforms set every frame from the rig)
const contactU = { uFeet: { value: Array.from({ length: 8 }, () => new Vector3(0, 0, -1)) }, uBody: { value: new Vector4(0, 0, 1, 1) }, uBodyH: { value: 0.1 }, uCWm: { value: num('cw', 9) / 1000 } };
const beachSand = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
beachSand.onBeforeCompile = (s) => {
  Object.assign(s.uniforms, contactU);
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vW;
uniform vec3 uFeet[8];
uniform vec4 uBody;
uniform float uBodyH;
uniform float uCWm;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ return vec2(h21(p), h21(p+17.3)); }
// nearest / second nearest jittered cell centre: distance, crevice width, id, offset
vec4 grains(vec2 p, out vec2 off){
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
  for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){ vec2 g = vec2(i,j); vec2 o = h22(ip+g); vec2 r = g + o*0.9+0.05 - fp;
    float sc = 0.75 + 0.5 * h21(ip+g+5.1); float d = length(r) / sc;
    if (d<d1){ d2=d1; d1=d; id=ip+g; off=r; } else if (d<d2) d2=d; }
  return vec4(d1, d2 - d1, id);
}
float gAO = 1.0; vec2 gN = vec2(0.0); float gR = 0.85;`).replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 mm = vW.xz * 1000.0;                       // millimetres
  vec2 off;
  vec4 g = grains(mm / 0.27, off);
  float k = h21(g.zw + 3.1), k2 = h21(g.zw + 9.7);
  float dome = clamp(1.0 - g.x * g.x * 1.6, 0.0, 1.0);
  float crev = 1.0 - smoothstep(0.0, 0.16, g.y);   // the dark gap between two grains
  // minerals: quartz (pale, glassy), feldspar (buff-pink), lithic grey-brown, dark heavy minerals, shell
  vec3 c = mix(vec3(0.6, 0.55, 0.45), vec3(0.72, 0.68, 0.6), k2);
  float rr = 0.4;
  if (k > 0.55) { c = mix(vec3(0.62, 0.48, 0.36), vec3(0.72, 0.58, 0.45), k2); rr = 0.7; }
  if (k > 0.75) { c = mix(vec3(0.32, 0.28, 0.24), vec3(0.45, 0.4, 0.33), k2); rr = 0.8; }
  if (k > 0.95) { c = vec3(0.09, 0.085, 0.08) * (0.8 + 0.5 * k2); rr = 0.45; }
  if (k > 0.975) { c = vec3(0.85, 0.83, 0.78); rr = 0.6; }
  c *= 0.82 + 0.3 * dome;
  // the silt between the grains
  vec2 o2; vec4 g2 = grains(mm / 0.085 + 7.3, o2);
  vec3 silt = vec3(0.42, 0.37, 0.3) * (0.8 + 0.35 * h21(g2.zw));
  c = mix(c, silt, smoothstep(0.75, 1.05, g.x));
  // broad dry / damp patches
  float pat = h21(floor(mm / 3.0)) * 0.5 + h21(floor(mm / 1.3) + 2.0) * 0.5;
  c *= 0.9 + 0.12 * pat;
  diffuseColor.rgb = c * vec3(${SANDC.map((x) => (x / 0.4).toFixed(3)).join(', ')});
  // each grain shades itself round (its flanks see less sky), so the sand reads as grains even in shadow
  gAO = (1.0 - 0.55 * crev) * (0.62 + 0.38 * dome);
  // a rounded grain: the slope of a low dome (steep at its edge), fading into the crevice
  float r1 = clamp(g.x, 0.0, 0.98);
  gN = normalize(off + 1e-5) * min(2.2, 0.9 * r1 / sqrt(max(0.06, 1.0 - r1 * r1))) * (1.0 - crev);
  gR = mix(rr, 0.95, crev);
  // contact: under the body a broad soft occlusion that deepens as the body comes down to the sand; at each foot
  // a dimple ringed with displaced grains and a tight dark ring
  vec2 b = (vW.xz - uBody.xy) / (uBody.zw * uCWm);
  float under = exp(-dot(b, b) * 1.6);
  gAO *= 1.0 - 0.55 * under * (1.0 - smoothstep(0.05, 0.6, uBodyH));
  for (int i = 0; i < 8; i++) {
    if (uFeet[i].z < 0.0) continue;
    vec2 d = (vW.xz - uFeet[i].xy) / uCWm;
    float r = length(d);
    gAO *= 1.0 - 0.6 * exp(-pow(r / 0.035, 2.0)) - 0.25 * exp(-pow(r / 0.09, 2.0));
    float ring = exp(-pow((r - 0.05) / 0.02, 2.0));
    gN += normalize(d + 1e-5) * ring * 0.35 - normalize(d + 1e-5) * exp(-pow(r / 0.03, 2.0)) * 0.3;
  }
  diffuseColor.rgb *= gAO;
}`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(normal + (viewMatrix * vec4(gN.x, 0.0, gN.y, 0.0)).xyz * 0.6 * (1.0 - smoothstep(0.00004, 0.00015, length(fwidth(vW)))));`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gR;').replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gAO; reflectedLight.indirectSpecular *= gAO;');
};
let groundMat = BEACH ? beachSand : sandMat;
if (SCENE === 'studio') groundMat = new MeshPhysicalMaterial({ color: new Color(0.62, 0.66, 0.68), roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transmission: 0 });
else if (SCENE === 'hand') groundMat = new MeshStandardMaterial({ color: new Color(0.62, 0.36, 0.27), roughness: 0.55 });
if (CLAY) groundMat = new MeshStandardMaterial({ color: new Color(0.55, 0.56, 0.57), roughness: 0.9 });
const ground = new Mesh(new PlaneGeometry(0.6, 0.6, 1, 1).rotateX(-Math.PI / 2), groundMat);
ground.receiveShadow = true;
if (!SIL && !Q.has('noground')) scene.add(ground);
// beach, close up: the sand around the crab as real grains — rounded, of several minerals, half sunk in a bed of
// finer sand — so they cast their own little shadows and the feet stand among them, not on a painted floor
if (BEACH && !Q.has('nograins')) {
  const R = num('grainR', 3.2) * (num('cw', 9) / 1000);
  const n = Math.round(num('grains', 85000));
  const g = new IcosahedronGeometry(1, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // lumpy, not spheres: each vertex pushed in or out a little
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 5.1 + y * 3.7) * Math.cos(z * 4.3 - x * 2.1);
    pos.setXYZ(i, x * k, y * k * 0.72, z * k);
  }
  g.computeVertexNormals();
  const gm = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  const inst = new InstancedMesh(g, gm, n);
  let rs = 977;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const m4 = new Matrix4(), qq = new Quaternion(), sc = new Vector3(), pp = new Vector3(), col = new Color();
  const minerals = [[0.66, 0.6, 0.5, 0.5], [0.74, 0.62, 0.48, 0.24], [0.5, 0.44, 0.36, 0.18], [0.2, 0.17, 0.14, 0.015], [0.84, 0.82, 0.76, 0.025], [0.6, 0.46, 0.32, 0.04]];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R;
    const size = (0.09 + 0.07 * rnd() + 0.06 * rnd() * rnd()) / 1000;
    // sunk to a third of its height or more in the bed; fewer toward the edge of the patch (blends into the floor)
    if (d > R * 0.8 && rnd() < (d - R * 0.8) / (R * 0.2)) { m4.makeScale(0, 0, 0); inst.setMatrixAt(i, m4); continue; }
    pp.set(Math.sin(a) * d, size * (-0.2 + 0.35 * rnd()), Math.cos(a) * d);
    qq.setFromEuler(new Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28));
    sc.set(size * (0.8 + 0.4 * rnd()), size, size * (0.8 + 0.4 * rnd()));
    m4.compose(pp, qq, sc);
    inst.setMatrixAt(i, m4);
    let r = rnd(), mm = minerals[0];
    for (const m of minerals) { if (r < m[3]) { mm = m; break; } r -= m[3]; }
    const v = 0.82 + 0.3 * rnd();
    col.setRGB(mm[0] * v, mm[1] * v, mm[2] * v).convertSRGBToLinear();
    inst.setColorAt(i, col);
  }
  inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);
}

const seed = num('seed', 7);
const crab = new CrabModel({ sex: param('sex') ?? 'm', cw_m: CW, seed, juvenile: num('juv', 0) });
if (param('pal')) crab.applyPalette(paletteFor(param('pal'), seed));
crab.setLod(num('lod', 0));
crab.setShadows(true);
crab.setSurface(num('wet', 0.45), num('sand', 0.4), num('tip', 0.3), 0.5);
crab.root.rotation.y = num('heading', 0);
crab.setSandColor(new Color(SANDC[0] * 1.05, SANDC[1] * 1.05, SANDC[2] * 1.05));
crab.pelletMat.userData.uniforms.uPelPepper.value = PEPPER;
if (num('dbg', 0)) for (const m of [crab.mat, crab.setaeMat]) m.userData.uniforms.uKgMorph.value.y = 1;
if (param('fill')) scene.userData.fill = num('fill', 0.9);
if (CLAY || SIL) {
  const m = SIL ? new MeshBasicMaterial({ color: 0x000000 }) : new MeshStandardMaterial({ color: new Color(0.62, 0.62, 0.62), roughness: 0.65, metalness: 0 });
  const ms = SIL ? m : new MeshStandardMaterial({ color: new Color(0.25, 0.25, 0.25), roughness: 0.8, side: 2 });
  for (const l of crab.lods) l.material = m;
  crab.setae.material = ms;
  if (Q.get('setae') === '0') crab.setae.visible = false, crab.setae.layers.disable(0);
}
scene.add(crab.root);
// a static field of pellets around the crab (p4)
const NPEL = LIVE_CHECK() ? 0 : num('pellets', 0);
let staticPellets = null;
if (NPEL > 0) {
  staticPellets = new SandPellets();
  staticPellets.setSandColor(new Color(SANDC[0] * 1.05, SANDC[1] * 1.05, SANDC[2] * 1.05));
  staticPellets.setPepper(PEPPER);
  staticPellets.setShadows(true);
  scene.add(staticPellets.group);
  let rs = seed * 7919 + 13;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  for (let i = 0; i < NPEL; i++) {
    const a = rnd() * Math.PI * 2, d = CW * (1.2 + Math.sqrt(rnd()) * 6);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    staticPellets.add(x, 0, z, CW * (0.13 + rnd() * 0.05), 'feed', -900 - rnd() * 900, rnd());
  }
  staticPellets.update(0, new Vector3(0, 0.05, 0.1), null);
}
function LIVE_CHECK() { return Q.get('live') === '1'; }

const v = new Vector3();
/**
 * Pose overrides, to fit a photograph's posture (URL, or `window.__fit` from tools/viewers/kometsukigani/fit.mjs).
 * Per-leg lists run L1–L4 then R1–L4 (four values: both sides alike).
 *   bh: sternum height (CW)    roll: body roll (rad)    hd: heading (rad, turns the rig on top of `heading`)
 *   reach: foot radius from the coxa socket (CW)        lyaw: swing of each leg's foot (rad, + forward)
 *   ldac: dactylus angle to the ground (deg)            lcp: carpus–propodus bend (rad)
 *   lh: foot height above the ground (CW; a raised leg)
 *   cpose / cposeR: cheliped posture (7 angles; cposeR for the right one)   eyefold: 0 erect … 1 folded
 */
const list = (k) => { const a = vec(k); return a && a.length === 4 ? [...a, ...a] : a; };
const OV = {
  bh: param('bh') === null ? null : num('bh', 0), roll: num('roll', 0), hd: num('hd', 0),
  reach: list('reach'), lyaw: list('lyaw'), ldac: list('ldac'), lcp: list('lcp'), lh: list('lh'),
  cpose: vec('cpose'), cposeR: vec('cposeR'), eyefold: param('eyefold') === null ? null : num('eyefold', 0),
};
function pose(kind, t = 0) {
  const r = crab.rig;
  if (kind === 'flip') { poseFlip(); return; }
  const h = OV.bh ?? (kind === 'feed' ? STANCE.bodyHeight.feed : kind === 'wave' ? STANCE.bodyHeight.display : STANCE.bodyHeight.calm);
  r.root.rotation.set(0, OV.hd, 0);
  r.body.position.set(0, h, 0);
  r.body.rotation.set(num('pitch', kind === 'feed' ? 0.12 : kind === 'wave' ? -0.12 : 0), 0, OV.roll);
  r.root.updateMatrixWorld(true);
  const bodyInv = r.body.matrix.clone().invert();
  for (let i = 0; i < r.legs.length; i++) {
    const leg = r.legs[i];
    const k = i % 4;
    const reach = OV.reach ? OV.reach[i] : STANCE.footReach[k] * (kind === 'wave' ? 0.95 : 1) * (1 + leg.jit.reach);
    // home foot on the ground (Root space), then into Body space (lyaw: + swings the foot forward on either side)
    leg.homeFoot(v, reach, 0, leg.jit.yaw - (OV.lyaw ? OV.lyaw[i] * leg.side : 0));
    // the tip presses a little into the sand (063, 027: the dactyli stand in small dimples)
    v.y = -num('sink', 0.02) + (OV.lh ? OV.lh[i] : 0);
    v.applyMatrix4(bodyInv);
    const dac = (OV.ldac ? OV.ldac[i] : STANCE.dactylDeg) * Math.PI / 180 + leg.jit.dac;
    leg.solve(v, dac, (OV.lcp ? OV.lcp[i] : [0.3, 0.14, -0.12, -0.3][k]) * leg.side);
  }
  for (const c of r.chelae) {
    if (kind === 'wave') c.setPose(CHELA_POSES.wave);
    else if (kind === 'feed') c.setPose(CHELA_POSES.scoop);
    else if (kind === 'mouth') c.setPose(CHELA_POSES.mouth);
    else c.setPose((c.side < 0 && OV.cposeR) || OV.cpose || CHELA_POSES.fold);
  }
  const fold = OV.eyefold ?? (kind === 'fold' ? 1 : 0);
  for (const e of r.eyes) e.pose(fold, null, 0);
  crab.setMouthPellet(kind === 'feed' ? 0.7 : 0);
}

/** on its back on a palm (p2): legs folded over the underside, chelae folded, the carapace resting on the hand */
function poseFlip() {
  const r = crab.rig;
  r.body.position.set(0, 0, 0);
  r.body.rotation.set(0, 0, 0);
  r.root.updateMatrixWorld(true);
  // the legs fold over the underside (knees toward the viewer), as a crab held on its back does (3.webp)
  for (let i = 0; i < r.legs.length; i++) {
    const leg = r.legs[i];
    const k = i % 4;
    // meri swung forward and level, the knee shut so carpus, propodus and dactylus lie folded back over the
    // merus' ventral edge: from below one sees the slender distal segments, not the broad meri (3.webp)
    // (yaw > 0 is backward on the left side, forward on the right)
    leg.ang.yaw = -leg.side * [0.62, 0.55, 0.45, 0.3][k];
    leg.ang.lev = [0.15, 0.2, 0.25, 0.3][k];
    leg.ang.knee = -2.55;
    leg.ang.cp = 0;
    leg.ang.dac = -1.0;
    leg.apply();
  }
  for (const c of r.chelae) c.setPose(CHELA_POSES.fold);
  for (const e of r.eyes) e.pose(0.15, null, 0);
  crab.setMouthPellet(0);
  // upside down, the dome on the palm
  crab.root.rotation.set(0, 0, Math.PI);
  crab.root.position.set(0, (0.58 + 0.02) * CW, 0);
}

const ASPECT = (W || innerWidth) / (H || innerHeight);
// ortho=<frame height in CW>: an orthographic camera (silhouettes to lay over photographs at a known scale)
const camera = Q.has('ortho')
  ? new OrthographicCamera(-num('ortho', 4) * CW * ASPECT / 2, num('ortho', 4) * CW * ASPECT / 2, num('ortho', 4) * CW / 2, -num('ortho', 4) * CW / 2, 0.0005, 5)
  : new PerspectiveCamera(num('fov', 40), ASPECT, 0.0005, 5);
const target = new Vector3(0, CW * 0.35, 0);
const views = {
  front: [0, 0.35, 3.2], side: [3.2, 0.4, 0], top: [0, 3.6, 0.001], q34: [2.1, 1.5, 2.3], back: [-1.6, 1.5, -2.6],
  low: [1.2, 0.15, 3.0], macro: [0.9, 0.7, 1.3], under: [0.4, -0.6, 2.4], eye: [0.5, 0.9, 1.0], chela: [0.6, 0.15, 1.2], leg: [1.6, 0.6, 0.5],
};
const vw = vec('cam') ?? views[Q.get('view') ?? 'q34'] ?? views.q34;
const tg = vec('tgt');
if (tg) target.set(tg[0], tg[1], tg[2]).multiplyScalar(CW);
camera.position.set(vw[0], vw[1], vw[2]).multiplyScalar(CW * num('dist', 1)).add(target);
if (Q.get('view') === 'eye') target.set(0, CW * 0.75, CW * 0.4);
if (Q.get('view') === 'chela') target.set(0, CW * 0.2, CW * 0.55);
if (Q.get('view') === 'leg') target.set(CW * 0.9, CW * 0.2, CW * 0.1);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(target);
controls.update();

// ---------------------------------------------------------------- live: a crab, its burrow, pellets, a passer-by
const LIVE = Q.get('live') === '1';
let live = null;
if (LIVE) {
  scene.remove(crab.root);
  const burrows = new BurrowRenderer();
  scene.add(burrows.group);
  const pellets = new SandPellets();
  scene.add(pellets.group);
  pellets.setShadows(true);
  const up = new Vector3(0, 1, 0);
  const bk = 1, az = num('baz', 0.4);
  const bE = new Vector3(0, 0, 0), bR = CW * 0.45;
  const burrow = { e: bE, axis: shaftAxis(bk, az, up), r: bR, az };
  const probe = {
    heightAt(x, z) {
      let h = 0;
      // the worn funnel at the mouth
      const d = Math.hypot(x - bE.x, z - bE.z);
      if (d < bR * 1.32) h -= 0.3 * bR * (1 - (d / (bR * 1.32)) ** 2);
      const ph = pellets.heightAt(x, z);
      return Math.max(h, ph);
    },
  };
  const c = new ScopimeraGlobosa({ seed, sex: Q.get('sex') ?? 'm', cw_mm: CW * 1000, resident: true });
  c.setLod(num('lod', 0));
  c.model.setShadows(true);
  for (const m of c.model.lods) m.renderOrder = RENDER_ORDER.crab;
  c.model.setup?.();
  scene.add(c.root);
  const startState = Q.get('state') ?? 'burrow';
  c.placeAt(0, 0, az, probe, startState === 'burrow');
  c.animator.heading = az;
  if (startState !== 'burrow') { c.behavior.state = 'IDLE'; c.behavior.idleFor = 0.5; c.behavior.plugged = false; c.animator.placeAt(CW * 0.6, CW * 0.2, az, probe); }
  pellets.setSandColor(new Color(0.36, 0.29, 0.19));
  c.model.setSandColor(new Color(0.36, 0.29, 0.19));
  c.onPellet = (p, r, k) => pellets.add(p.x, 0, p.z, r, k, pellets.time, Math.random());
  const env = makeEnv(probe);
  env.burrow = burrow;
  env.season = seasonFor(num('doy', 190));
  env.sinceExposed = 3000;
  env.onExcavate = () => {
    const a = Math.random() * Math.PI * 2;
    pellets.add(bE.x + Math.sin(a) * bR * 1.6, 0, bE.z + Math.cos(a) * bR * 1.6, CW * 0.22, 'dig', pellets.time, Math.random());
  };
  // a passer-by: walks toward the crab from t0 at v (m/s) (threat), param threat=t0
  const threatT0 = num('threat', -1);
  const threatPos = new Vector3(0.6, 0, 1.2);
  // pre-seed some old pellets around the burrow (a fan of radial trails)
  const seedPel = num('pellets', 120);
  for (let i = 0; i < seedPel; i++) {
    const trip = Math.floor(i / 12), a = trip * 0.45 + 1.2, d = (1.1 + (i % 12) * 0.55 + Math.random() * 0.3) * CW;
    const side = (Math.random() - 0.5) * 0.9 * CW;
    pellets.add(bE.x + Math.sin(a) * d + Math.cos(a) * side, 0, bE.z + Math.cos(a) * d - Math.sin(a) * side, CW * (0.09 + Math.random() * 0.04), 'feed', -600 - Math.random() * 600, Math.random());
  }
  live = { c, env, burrows, pellets, burrow, probe, threatT0, threatPos, t: 0 };
}

function stepLive(dt) {
  const L = live;
  L.t += dt;
  const env = L.env;
  // the passer-by
  env.threat = null;
  if (L.threatT0 >= 0 && L.t > L.threatT0) {
    const v = 0.6;
    const dir = new Vector3().subVectors(L.c.pos, L.threatPos).setY(0);
    const dist = dir.length();
    if (dist > 0.3) L.threatPos.addScaledVector(dir.normalize(), v * dt);
    const lvl = Math.max(0, Math.min(1, 1 - dist / 1.4)) + (dist < 0.9 ? 0.3 : 0);
    env.threat = lvl > 0.02 ? { pos: L.threatPos.clone(), level: Math.min(1, lvl), kind: 'player' } : null;
  }
  L.c.update(dt, env);
  L.pellets.update(dt, camera.position, () => -Infinity);
  // the burrow: a real hole while it is open
  L.burrows.begin();
  const plugged = L.c.behavior.plugged;
  if (!plugged) L.burrows.addOpen(L.burrow.e, L.burrow.r, 1, L.burrow.az, new Vector3(0, 1, 0));
  L.burrows.addDecal(L.burrow.e, new Vector3(0, 1, 0), L.burrow.r * 2.1, L.burrow.r * 2.1, 0, 0, plugged ? 0 : 1, 0.3, 1);
  // contact shadow under the body (soft, follows the sun)
  const a = new Vector3(); L.c.anchor(a);
  const hgt = Math.max(0, a.y - 0.0);
  const off = new Vector3(-sunDir.x, 0, -sunDir.z).multiplyScalar(hgt / Math.max(0.2, sunDir.y));
  if (!L.c.hidden) L.burrows.addDecal(new Vector3(a.x + off.x * 0.5, 0, a.z + off.z * 0.5), new Vector3(0, 1, 0), CW * 0.75, CW * 0.6 + off.length() * 0.3, Math.atan2(off.x, off.z), 1, 0.35);
  L.burrows.end();
}

const kind = param('pose') ?? 'stand';
let t = 0, frames = 0;
const hud = document.getElementById('hud');
if (Q.get('hud') === '0') hud.style.display = 'none';
const hudText = () => `CW ${(CW * 1000).toFixed(1)} mm  LOD${num('lod', 0)}  tris ${crabTriangles(num('lod', 0))}  ${LIVE ? `t ${live.t.toFixed(1)}s  ${live.c.behavior.debug}  pellets ${live.pellets.total}` : `pose ${kind}`}`;
hud.textContent = hudText();
// simulate ahead in fixed steps (screenshots of a given moment)
if (LIVE) {
  const T = num('t', 0);
  for (let k = 0; k < T * 60; k++) stepLive(1 / 60);
}
function frame() {
  t += 1 / 60;
  if (LIVE) {
    if (!Q.has('freeze')) stepLive(1 / 60);
    if (Q.has('follow')) { const a = new Vector3(); live.c.anchor(a); controls.target.lerp(a, 0.2); }
    if (Q.has('rel')) {
      // camera fixed in the crab's frame (e.g. rel=front): look at its face whatever way it turns
      const a = new Vector3(); live.c.anchor(a);
      const h = live.c.heading, o = vw;
      const ox = o[0] * Math.cos(h) + o[2] * Math.sin(h), oz = -o[0] * Math.sin(h) + o[2] * Math.cos(h);
      camera.position.set(ox, o[1], oz).multiplyScalar(CW * num('dist', 1)).add(a);
      controls.target.copy(a);
    }
  } else pose(kind, t);
  if (Q.get('setae') === '0') crab.setae.visible = false;
  controls.update();
  if (BEACH) updateContact();
  if (composer) composer.render(); else renderer.render(scene, camera);
  frames++;
  if (frames % 10 === 0) hud.textContent = hudText();
  if (frames === 3) { hud.textContent = hudText(); window.__ready = true; }
  // fit=1: stop after the first frames — the fitting tool renders on demand
  if (Q.has('fit') && frames >= 3) return;
  requestAnimationFrame(frame);
}
// the sand's contact shading follows the real feet and body
const _tip = new Vector3();
function updateContact() {
  const c = LIVE ? live.c.model : crab;
  if (!c || !c.root.visible) return;
  c.root.updateMatrixWorld(true);
  c.rig.legs.forEach((leg, i) => {
    _tip.set(leg.spec.dactylus, 0, 0).applyMatrix4(leg.dactylus.matrixWorld);
    contactU.uFeet.value[i].set(_tip.x, _tip.z, _tip.y < CW * 0.04 ? 1 : -1);
  });
  const b = new Vector3().setFromMatrixPosition(c.rig.body.matrixWorld);
  contactU.uBody.value.set(b.x, b.z, 0.5, 0.46);
  contactU.uBodyH.value = b.y / CW;
}

// photo=1: the camera's own look — a macro lens's shallow depth of field focused on the crab, a little sensor
// grain and vignetting (the reference photographs are all macro shots)
let composer = null;
if (Q.get('photo') === '1') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const focus = camera.position.distanceTo(target);
  composer.addPass(new BokehPass(scene, camera, { focus: num('focus', focus), aperture: num('aperture', 0.004) / CW, maxblur: num('maxblur', 0.018) }));
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSeed: { value: Math.random() * 100 }, uGrain: { value: num('grain', 0.035) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uSeed; uniform float uGrain; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5;
        c.rgb *= 1.0 - 0.35 * dot(d, d);
        float n = (h(gl_FragCoord.xy) + h(gl_FragCoord.xy + 17.0) - 1.0);
        c.rgb *= 1.0 + n * uGrain; gl_FragColor = c; }`,
  }));
  composer.addPass(new OutputPass());
}
if (param('tm') === 'agx') renderer.toneMapping = AgXToneMapping;

window.__crab = crab;
window.__live = live;

/**
 * Fitting hook (tools/viewers/kometsukigani/fit.mjs, scene=sil): set pose overrides and an orthographic view
 * { el: elevation (rad), az: azimuth (rad), tx, ty: frame centre (CW), oh: frame height (CW) }, render once and
 * compare the black silhouette with `window.__fitTarget` (a 0/1 mask the canvas' size, row 0 at the top).
 * Returns { iou, inter, photoOnly, modelOnly } (inside `roi` [x, y, w, h] if given), or the model mask itself with
 * `{ mask: true }`.
 */
const _fitDir = new Vector3();
window.__fit = (p) => {
  for (const k of Object.keys(OV)) if (k in p) OV[k] = p[k];
  pose(kind, t);
  if (camera.isOrthographicCamera && 'el' in p) {
    const oh = p.oh * CW, wh = oh * ASPECT;
    Object.assign(camera, { left: -wh / 2, right: wh / 2, top: oh / 2, bottom: -oh / 2 });
    camera.updateProjectionMatrix();
    _fitDir.set(Math.sin(p.az) * Math.cos(p.el), Math.sin(p.el), Math.cos(p.az) * Math.cos(p.el));
    // the frame centre: tx across, ty up in the image plane, about the point 0.35 CW above the ground
    const right = new Vector3(Math.cos(p.az), 0, -Math.sin(p.az));
    const up = new Vector3().crossVectors(_fitDir, right).negate();
    const c = new Vector3(0, 0.35, 0).addScaledVector(right, p.tx).addScaledVector(up, p.ty).multiplyScalar(CW);
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(_fitDir, 0.5);
    camera.up.set(0, 1, 0);
    camera.lookAt(c);
  }
  crab.root.updateMatrixWorld(true);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const T = window.__fitTarget;
  const m = p.mask ? new Uint8Array(w * h) : null;
  let inter = 0, po = 0, mo = 0;
  const R = p.roi;                                   // [x, y, w, h]: compare only inside this rectangle
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((h - 1 - y) * w + x) * 4;
    const isM = px[i] < 128 ? 1 : 0;
    if (m) m[y * w + x] = isM;
    if (!T || (R && (x < R[0] || y < R[1] || x >= R[0] + R[2] || y >= R[1] + R[3]))) continue;
    const isP = T[y * w + x];
    if (isM && isP) inter++; else if (isP) po++; else if (isM) mo++;
  }
  if (m) return Array.from(m);
  return { iou: inter / Math.max(1, inter + po + mo), inter, photoOnly: po, modelOnly: mo };
};
frame();
