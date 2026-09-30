// Strawberry conch / マガキガイ (Conomurex luhuanus) — procedural shell and animal.
// Local frame: shell axis along +x, apex (spire tip) at x = 0, anterior (siphonal) end at
// x = 1; the aperture faces -y (down, onto the sand). Real size ~6 cm; scale on placement.
import * as THREE from 'three';
import { createFishEye } from './eye.js';

// ---------------------------------------------------------------- shell ----------
// Body-whorl profile r(x): rounded shoulder, then an almost straight taper (conical).
function bodyR(x) {
  if (x < 0.3) {   // shoulder, fairly angular: continues the spire's slope, then rolls over (Hermite, slope 1.1 -> 0)
    const e = Math.max(0, Math.min(1, (x - 0.19) / 0.11)), e2 = e * e, e3 = e2 * e;
    return (2 * e3 - 3 * e2 + 1) * 0.135 + (e3 - 2 * e2 + e) * 1.4 * 0.11 + (-2 * e3 + 3 * e2) * 0.31;
  }
  const t = Math.min(1, (x - 0.3) / 0.68);
  let r = 0.075 + 0.235 * (1 - t) + 0.03 * Math.sin(t * Math.PI);   // near-straight, slightly convex taper to a broad, truncated front
  const e = Math.max(0, (x - 0.9) / 0.08);
  return r * Math.sqrt(Math.max(0.0, 1 - e * e * 0.97));                   // blunt, rounded anterior end
}
// Spire: low stepped cone of ~7 whorls with sutures
function spireR(x) {
  const t = Math.max(0, (x + 0.1) / 0.3), turns = 7;
  const base = 0.14 * Math.pow(t, 1.35);    // taller, slightly concave spire (~27% of length)
  const w = t * turns, f = w - Math.floor(w);
  return base * (1 - 0.13 * Math.pow(1 - f, 3));                        // whorls with shallow sutures
}

function shellGeometry() {
  const pos = [], nrm = [], suv = [], idx = [];
  const push = (p, s) => { pos.push(p.x, p.y, p.z); suv.push(s[0], s[1], s[2]); };
  // Body whorl: angle th from 0 (columella side, facing down) through the back to the lip.
  const NT = 170, NX = 150, TH = Math.PI * 2 * 0.93;    // the gap (th > TH) is the long slit-like aperture
  const lipFlare = (x) => 0.02 * Math.max(0, 1 - Math.abs((x - 0.5) / 0.42)) + 0.008;   // wing near the posterior
  const P = (th, x, inner) => {
    const f = th / TH;                                                   // 0 columella .. 1 outer lip
    let r = bodyR(x) * (1 + 0.06 * f);                                  // spiral growth: lip stands proud
    if (f > 0.93) r += lipFlare(x) * Math.pow((f - 0.93) / 0.07, 2);    // flared, thickened outer lip
    if (inner) r = Math.max(0.004, r - (0.02 + 0.02 * Math.pow(Math.max(0, f - 0.88) / 0.12, 2) + 0.012 * Math.pow(Math.max(0, 0.08 - f) / 0.08, 2)));   // thick lip + parietal callus
    // stromboid notch near the anterior end of the lip
    const notch = Math.exp(-Math.pow((x - 0.88) / 0.035, 2)) * Math.max(0, f - 0.9) * 10;
    r -= notch * 0.03;
    const a = th - Math.PI / 2;                                          // th = 0 points down (-y)
    return new THREE.Vector3(x, r * Math.sin(a), r * Math.cos(a));
  };
  const grid = (inner) => {
    const start = pos.length / 3;
    for (let i = 0; i <= NT; i++) for (let j = 0; j <= NX; j++) {
      const th = (i / NT) * TH, x = 0.19 + (0.79 * j) / NX;
      push(P(th, x, inner), [th / TH, x, inner ? 1 : 0]);
    }
    for (let i = 0; i < NT; i++) for (let j = 0; j < NX; j++) {
      const a = start + i * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1;
      if (inner) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    return start;
  };
  const outer = grid(false), inner = grid(true);
  // rounded rims joining outer and inner surfaces: outer lip (th = TH) and columella (th = 0)
  const rim = (th0, dirSign, part) => {
    const rimStart = pos.length / 3, NR = 8;
    for (let k = 0; k <= NR; k++) for (let j = 0; j <= NX; j++) {
      const x = 0.19 + (0.79 * j) / NX, a = k / NR;
      const po = P(th0, x, false), pi = P(th0, x, true);
      const mid = po.clone().lerp(pi, a);
      const out = new THREE.Vector3(0, mid.y, mid.z).normalize();
      const tang = new THREE.Vector3(0, -out.z, out.y);                 // along increasing th
      mid.addScaledVector(tang, dirSign * 0.011 * Math.sin(a * Math.PI));
      push(mid, [dirSign > 0 ? 1.0 : 0.0, x, part]);
    }
    for (let k = 0; k < NR; k++) for (let j = 0; j < NX; j++) {
      const a = rimStart + k * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1;
      if (dirSign > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  };
  rim(TH, 1, 2); rim(0, -1, 1.6);
  // spire (surface of revolution) closing the posterior end
  const spStart = pos.length / 3, NS = 90, NA = 72;
  for (let j = 0; j <= NS; j++) for (let i = 0; i <= NA; i++) {
    const x = -0.1 + (j / NS) * 0.35, r = spireR(x), a = (i / NA) * Math.PI * 2;
    push(new THREE.Vector3(x, r * Math.sin(a), r * Math.cos(a)), [i / NA, x, 3]);
  }
  for (let j = 0; j < NS; j++) for (let i = 0; i < NA; i++) {
    const a = spStart + j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('suv', new THREE.Float32BufferAttribute(suv, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const SHELL_GLSL = /* glsl */`
varying vec3 vSuv; varying vec3 vSP;
float ch(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float cn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(ch(i), ch(i+vec2(1,0)), f.x), mix(ch(i+vec2(0,1)), ch(i+vec2(1,1)), f.x), f.y); }
float cf(vec2 p){ float a = 0.5, r = 0.0; for (int i = 0; i < 5; i++){ r += a * cn(p); p *= 2.07; a *= 0.5; } return r; }
uniform float uLive;    // 0 clean shell, 1 living animal with periostracum and algae film
vec4 shellColor(){
  float u = vSuv.x, x = vSuv.y, part = vSuv.z;
  vec3 cream = vec3(0.93, 0.87, 0.78), straw = vec3(0.86, 0.5, 0.22), brown = vec3(0.5, 0.26, 0.12);
  vec3 c;
  float rough = 0.3;
  if (part < 0.5 || part > 2.5) {
    // "strawberry" pattern: large tan-orange axial flames, broken by white spiral bands into
    // blocky blotches, densest in a broad band across the middle of the body whorl
    vec2 q = vec2(u * 26.0, x * 34.0);
    float flame = cf(vec2(u * 7.0 + cf(vec2(u * 3.0, x * 6.0)) * 1.2, x * 2.2));
    float bands = smoothstep(-0.2, 0.6, sin(x * 48.0 + cf(q * 0.6) * 2.5));   // white spiral interruptions
    float mid = 0.55 + 0.45 * exp(-pow((x - 0.55) / 0.2, 2.0));
    float rag = (cn(vec2(u * 140.0, x * 30.0)) - 0.5) * 0.12;                      // ragged, flecked flame edges
    float bl = smoothstep(0.3, 0.35, flame * mid * (0.75 + 0.35 * bands) + rag) * (0.75 + 0.25 * cn(q * 1.7));
    float zig = 0.5 + 0.5 * sin(u * 380.0 + 2.5 * sin(x * 90.0 + cn(vec2(u * 20.0, x * 10.0)) * 6.0) + cn(vec2(u * 60.0, x * 8.0)) * 5.0);                  // fine axial zigzag growth streaks
    bl *= 0.86 + 0.14 * zig;
    bl *= smoothstep(0.97, 0.9, x);                                            // pale anterior tip
    vec3 tan = mix(vec3(0.72, 0.32, 0.08), vec3(0.5, 0.2, 0.08), smoothstep(0.55, 0.8, cn(q * 0.4)) * 0.6);
    c = mix(cream, tan, bl * 0.9);
    c = mix(c, vec3(0.45, 0.3, 0.3), smoothstep(0.93, 0.99, u) * smoothstep(0.4, 0.6, x) * 0.4);   // purplish-brown near the lip
    // fine spiral cords and growth lines
    // spire: paler with brown flecks at the sutures
    if (part > 2.5) { c = mix(cream * 1.02, straw, 0.35 * step(0.7, cn(vec2(u * 40.0, x * 200.0)))); }
    // living shell: yellow-olive periostracum with a green algae film, brightening to yellow
    // along the shoulder of the outer lip; sand grains and a few pits
    float film = uLive * (0.86 + 0.14 * cf(vec2(u * 7.0, x * 9.0)));
    vec3 peri = mix(vec3(0.26, 0.24, 0.06), vec3(0.13, 0.19, 0.05), cf(vec2(u * 10.0, x * 12.0)));
    peri = mix(peri, vec3(0.2, 0.2, 0.08), smoothstep(0.55, 0.8, cf(vec2(u * 30.0, x * 40.0))) * 0.6);   // darker algae patches
    peri = mix(peri, vec3(0.7, 0.52, 0.1), smoothstep(0.78, 0.97, u) * smoothstep(0.3, 0.5, x) * (part < 0.5 ? 1.0 : 0.0));   // yellow band behind the lip
    peri = mix(peri, c * 0.7, 0.18);                                       // the strawberry pattern shows faintly through
    peri *= 0.85 + 0.35 * step(0.82, ch(floor(vec2(u * 500.0, x * 500.0))));   // sand grains stuck in it
    c = mix(c, peri, film * 0.92);
    rough = mix(0.3, 0.6, film);
  } else if (part < 1.3) {
    // aperture interior: strawberry red-orange lining deepening to plum inside
    float deep = smoothstep(0.93, 0.6, u) * smoothstep(0.03, 0.2, u);
    c = mix(vec3(0.95, 0.4, 0.16), vec3(0.45, 0.1, 0.08), deep);
    c = mix(c, vec3(0.06, 0.04, 0.04), smoothstep(0.93, 0.975, u) * 0.9);   // black band just inside the lip
    c = mix(c, vec3(0.07, 0.05, 0.05), smoothstep(0.12, 0.02, u));          // dark parietal wall
    c *= 0.9 + 0.1 * sin(x * 260.0);                                         // lirae (fine ridges) inside
    rough = 0.1;
  } else if (part < 1.8) {
    // columella: glossy black-brown callus, touched with orange at the anterior canal
    c = mix(vec3(0.06, 0.04, 0.04), vec3(0.7, 0.3, 0.12), smoothstep(0.8, 0.95, x));
    rough = 0.08;
  } else {
    c = mix(vec3(0.92, 0.5, 0.18), vec3(0.4, 0.34, 0.12), uLive * 0.3);   // lip edge: orange, a little fouled on a live shell
    rough = 0.2;
  }
  return vec4(c, rough);
}
`;

// ---------------------------------------------------------------- animal ---------

function tube(points, r0, r1, seg = 40, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / (radial + 1)) / seg, c = curve.getPointAt(Math.min(t, 1));
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar(r0 + (r1 - r0) * t).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return { g, curve };
}

function eyeTexture() {
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = x < W / 2 ? W * 0.25 : W * 0.75, r = Math.hypot(x - cx, y - H / 2);
    // black pupil, bright yellow iris ring with a thin dark outer ring, greyish-white stalk skin
    const col = r < 16 ? [5, 5, 5] : r < 30 ? [235, 205, 40] : r < 34 ? [40, 35, 20] : [205, 200, 185];
    const o = (y * W + x) * 4; img.data.set([...col, 255], o);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function mottled(base, dark, scale, key) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.3 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;\n' + SHELL_GLSL.split('uniform float uLive;')[0])
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 P3 = vOP * ${scale.toFixed(1)};
          float n = (cf(P3.xy) + cf(P3.yz + 3.1) + cf(P3.xz + 7.3)) / 3.0;          // isotropic mottling (no streaks)
          float sp = step(0.8, (cn(P3.xy * 3.0) + cn(P3.yz * 3.0 + 5.0)) * 0.5 + 0.2);
          diffuseColor.rgb *= mix(vec3(${base.join(',')}), vec3(${dark.join(',')}), smoothstep(0.42, 0.58, n)) * (1.0 - 0.3 * sp); }`);
  };
  m.customProgramCacheKey = () => 'conch-' + key;
  return m;
}

export function createStrawberryConch({ live = 1 } = {}) {
  const group = new THREE.Group(); group.name = 'Conomurex luhuanus';
  const body = new THREE.Group(); group.add(body);            // everything that tilts when it leaps
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: live ? 0.08 : 0.7, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  const uLive = { value: live };
  shellMat.onBeforeCompile = (sh) => {
    sh.uniforms.uLive = uLive;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 suv; varying vec3 vSuv; varying vec3 vSP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSuv = suv; vSP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SHELL_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 sc = shellColor(); diffuseColor.rgb *= sc.rgb;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = sc.a;');
  };
  shellMat.customProgramCacheKey = () => 'conch-shell';
  const shell = new THREE.Mesh(shellGeometry(), shellMat);
  shell.rotation.x = 0.8;              // rests tipped towards the flared lip, aperture half-visible
  body.add(shell);

  // soft parts emerge from the anterior end of the aperture, under the shell
  const skin = mottled([0.36, 0.33, 0.24], [0.14, 0.13, 0.1], 60, 'skin');
  const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skin);
  foot.scale.set(0.18, 0.04, 0.075); foot.position.set(0.82, -0.2, -0.05);
  body.add(foot);
  // proboscis: long, grooved, grey-brown with dark mottles, sweeping the sand ahead of the shell
  const snout = tube([new THREE.Vector3(0.86, -0.12, -0.05), new THREE.Vector3(0.96, -0.17, -0.045), new THREE.Vector3(1.06, -0.205, -0.03),
    new THREE.Vector3(1.15, -0.22, -0.01)], 0.034, 0.02, 48, 16).g;
  body.add(new THREE.Mesh(snout, skin));
  // eyestalks with ringed eyes
  const stalkMat = mottled([0.66, 0.62, 0.54], [0.5, 0.44, 0.38], 140, 'stalk');
  stalkMat.transparent = true; stalkMat.opacity = 0.85;
  const stalks = [];
  for (const side of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(0.9, -0.1, -0.03 + side * 0.045);   // stalks leave the anterior notch
    const { g, curve } = tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 0.035, side * 0.025), new THREE.Vector3(0.11, 0.085, side * 0.05), new THREE.Vector3(0.15, 0.15, side * 0.065)], 0.019, 0.013, 40, 14);
    piv.add(new THREE.Mesh(g, stalkMat));
    // a real camera eye at the tip: black pupil, bright lemon iris, thin dark rim, set in the pale stalk
    const end = curve.getPointAt(1), dir = curve.getTangentAt(1);
    const look = new THREE.Vector3(0.45, 0.15, side * 1.0).normalize().add(dir.clone().multiplyScalar(0.6)).normalize();
    const m = new THREE.Matrix4().lookAt(look, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));   // eye's +z (pupil) -> look
    m.setPosition(end.clone().addScaledVector(dir, 0.004));
    piv.add(createFishEye({ r: 0.019, matrix: m, pupilA: 0.5, irisA: 1.25, pupil: [0.01, 0.01, 0.01],
      irisIn: [0.98, 0.86, 0.2], irisOut: [0.9, 0.7, 0.08], limbus: [0.12, 0.1, 0.05], sclera: [0.5, 0.46, 0.4] }));
    piv.userData.side = side; body.add(piv); stalks.push(piv);
  }
  // operculum: brown, sickle-shaped, serrated along one edge
  const opShape = new THREE.Shape();
  opShape.moveTo(0, 0);
  for (let i = 0; i <= 28; i++) { const t = i / 28; opShape.lineTo(t * 0.3, 0.062 * Math.pow(Math.sin(t * Math.PI), 0.8) * (1 - 0.35 * t) + 0.005 * (i % 2)); }   // serrated outer edge
  for (let i = 28; i >= 0; i--) { const t = i / 28; opShape.lineTo(t * 0.3, 0.02 * Math.sin(t * Math.PI) - 0.004); }             // concave inner edge: a sickle
  const opGeo = new THREE.ExtrudeGeometry(opShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3 });
  const opMat = new THREE.MeshPhysicalMaterial({ color: 0x6b3510, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: new THREE.Color(0.9, 0.5, 0.2) });   // horny, amber-brown
  const operculum = new THREE.Mesh(opGeo, opMat);
  const opPiv = new THREE.Group(); opPiv.position.set(0.86, -0.2, -0.13); opPiv.rotation.y = 0.45; opPiv.add(operculum);
  operculum.rotation.set(Math.PI / 2 - 0.6, 0, 0.12);   // on the back of the foot, tipped out so it shows beside the shell
  body.add(opPiv);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // Behaviour: sits, looks about with its eyestalks, and now and then "leaps": the operculum
  // digs into the sand and the shell is heaved forward and rocks back down.
  let leapT = -1, next = 20 + Math.random() * 30;
  const state = { heading: Math.random() * Math.PI * 2, pos: new THREE.Vector3() };
  function update(dt, t) {
    for (const s of stalks) {
      const sd = s.userData.side;
      s.rotation.set(0.12 * Math.sin(t * 0.35 + sd), 0.2 * Math.sin(t * 0.22 + sd * 2), 0.08 * Math.sin(t * 0.45 + sd));
    }
    next -= dt;
    if (leapT < 0 && next <= 0) { leapT = 0; next = 40 + Math.random() * 60; }   // a small shuffle now and then
    if (leapT >= 0) {
      leapT += dt / 2.5;
      const k = Math.min(leapT, 1);
      const push = Math.sin(Math.min(k / 0.3, 1) * Math.PI / 2);          // operculum swings down and back
      opPiv.rotation.z = -0.4 * push * (1 - Math.max(0, (k - 0.6) / 0.4));
      const lift = Math.sin(Math.min(Math.max((k - 0.15) / 0.5, 0), 1) * Math.PI);
      body.rotation.z = 0.06 * lift;                                     // shell lifts slightly at the front
      body.position.y = 0.01 * lift;
      const fwd = Math.min(Math.max((k - 0.15) / 0.6, 0), 1);
      group.userData.stepDist = 0.05 * dt / 2.5 * (fwd > 0 && fwd < 1 ? 1.6 : 0);
      if (leapT >= 1) { leapT = -1; body.rotation.z = 0; body.position.y = 0; }
    } else { group.userData.stepDist = 0; opPiv.rotation.z = 0; }
  }
  return { group, update, state, uLive };
}
