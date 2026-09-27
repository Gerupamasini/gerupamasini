// Strawberry conch / マガキガイ (Conomurex luhuanus) — procedural shell and animal.
// Local frame: shell axis along +x, apex (spire tip) at x = 0, anterior (siphonal) end at
// x = 1; the aperture faces -y (down, onto the sand). Real size ~6 cm; scale on placement.
import * as THREE from 'three';

// ---------------------------------------------------------------- shell ----------
// Body-whorl profile r(x): rounded shoulder, then an almost straight taper (conical).
function bodyR(x) {
  if (x < 0.3) { const t = (x - 0.12) / 0.18; const e = Math.max(0, Math.min(1, t)); return 0.125 + 0.185 * Math.sin(e * Math.PI / 2) ** 0.8; }   // sloping, rounded shoulder
  const t = (x - 0.3) / 0.68;
  return 0.31 * (1 - t) + 0.06 * t + 0.03 * Math.sin(t * Math.PI);    // convex flanks: squat shell (L:W ~ 1.6)
}
// Spire: low stepped cone of ~7 whorls with sutures
function spireR(x) {
  const t = x / 0.135, turns = 6;
  const base = 0.15 * Math.pow(t, 0.85);
  const w = t * turns, f = w - Math.floor(w);
  return base * (1 - 0.035 * Math.pow(1 - f, 4));                      // smooth spire, faint sutures                        // step at each suture
}

function shellGeometry() {
  const pos = [], nrm = [], suv = [], idx = [];
  const push = (p, s) => { pos.push(p.x, p.y, p.z); suv.push(s[0], s[1], s[2]); };
  // Body whorl: angle th from 0 (columella side, facing down) through the back to the lip.
  const NT = 150, NX = 150, TH = Math.PI * 2 * 0.985;
  const lipFlare = (x) => 0.03 * Math.max(0, 1 - Math.abs((x - 0.5) / 0.4)) + 0.014;   // wing near the posterior
  const P = (th, x, inner) => {
    const f = th / (Math.PI * 2);
    let r = bodyR(x) * (1 + 0.05 * f);                                  // spiral growth: lip stands proud
    if (f > 0.93) r += lipFlare(x) * Math.pow((f - 0.93) / 0.055, 2);   // flared, thickened outer lip
    if (inner) r -= 0.018 + 0.02 * Math.pow(Math.max(0, f - 0.9) / 0.085, 2);
    // stromboid notch near the anterior end of the lip
    const notch = Math.exp(-Math.pow((x - 0.9) / 0.03, 2)) * Math.max(0, f - 0.94) * 2.5;
    r -= notch * 0.04;
    const a = th - Math.PI / 2;                                          // th = 0 points down (-y)
    return new THREE.Vector3(x, r * Math.sin(a), r * Math.cos(a));
  };
  const grid = (inner) => {
    const start = pos.length / 3;
    for (let i = 0; i <= NT; i++) for (let j = 0; j <= NX; j++) {
      const th = (i / NT) * TH, x = 0.12 + (0.86 * j) / NX;
      push(P(th, x, inner), [th / (Math.PI * 2), x, inner ? 1 : 0]);
    }
    for (let i = 0; i < NT; i++) for (let j = 0; j < NX; j++) {
      const a = start + i * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1;
      if (inner) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    return start;
  };
  const outer = grid(false), inner = grid(true);
  // rounded rim joining outer and inner surfaces along the lip (th = TH)
  const rimStart = pos.length / 3, NR = 6;
  for (let k = 0; k <= NR; k++) for (let j = 0; j <= NX; j++) {
    const x = 0.12 + (0.86 * j) / NX, a = k / NR;
    const po = P(TH, x, false), pi = P(TH, x, true);
    const mid = po.clone().lerp(pi, a);
    const out = new THREE.Vector3(0, mid.y, mid.z).normalize();
    const tang = new THREE.Vector3(0, -out.z, out.y);                   // along increasing th
    mid.addScaledVector(tang, 0.012 * Math.sin(a * Math.PI));
    push(mid, [0.99, x, 2]);
  }
  for (let k = 0; k < NR; k++) for (let j = 0; j < NX; j++) {
    const a = rimStart + k * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // spire (surface of revolution) closing the posterior end
  const spStart = pos.length / 3, NS = 90, NA = 72;
  for (let j = 0; j <= NS; j++) for (let i = 0; i <= NA; i++) {
    const x = (j / NS) * 0.135, r = spireR(x), a = (i / NA) * Math.PI * 2;
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
    // "strawberry" pattern: axial flames broken into spiral bands of blotches
    vec2 q = vec2(u * 22.0, x * 30.0);
    float flame = cf(vec2(u * 9.0 + cf(q * 0.3) * 1.5, x * 3.0));
    float bands = 0.55 + 0.45 * sin(x * 55.0 + cf(q) * 3.0);
    float bl = smoothstep(0.46, 0.6, flame * (0.7 + 0.5 * bands)) * (0.6 + 0.4 * cn(q * 1.7));
    c = mix(cream, mix(straw, brown, cn(q * 0.5)), bl * 0.85);
    // fine spiral cords and growth lines
    // spire: paler with brown flecks at the sutures
    if (part > 2.5) { c = mix(cream * 1.02, straw, 0.35 * step(0.7, cn(vec2(u * 40.0, x * 200.0)))); }
    // living shell: olive-brown periostracum and a thin algae / sediment film
    float film = uLive * (0.72 + 0.28 * cf(vec2(u * 7.0, x * 9.0)));
    vec3 peri = mix(vec3(0.26, 0.22, 0.11), vec3(0.18, 0.23, 0.09), cn(vec2(u * 12.0, x * 14.0)));
    peri *= 0.85 + 0.3 * step(0.8, ch(floor(vec2(u * 500.0, x * 500.0))));   // sand grains stuck in it
    c = mix(c, peri, film * 0.9);
    rough = mix(0.3, 0.75, film);
  } else if (part < 1.5) {
    // aperture interior: orange-red lining deepening to plum, dark columella and inner lip
    c = mix(vec3(0.95, 0.42, 0.2), vec3(0.55, 0.16, 0.12), smoothstep(0.95, 0.35, u));
    c = mix(c, vec3(0.12, 0.07, 0.07), smoothstep(0.2, 0.05, u) + smoothstep(0.82, 0.9, x) * smoothstep(0.3, 0.1, u));
    c = mix(c, vec3(0.08, 0.05, 0.05), smoothstep(0.93, 0.975, u) * 0.85);   // black band just inside the lip
    rough = 0.12;
  } else {
    c = vec3(0.96, 0.62, 0.38);   // lip edge
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
        { float n = cf(vOP.xy * ${scale.toFixed(1)} + vOP.z * 7.0); float sp = step(0.72, cn(vOP.xz * ${(scale * 3).toFixed(1)}));
          diffuseColor.rgb *= mix(vec3(${base.join(',')}), vec3(${dark.join(',')}), smoothstep(0.4, 0.65, n)) * (1.0 - 0.25 * sp); }`);
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
  body.add(shell);

  // soft parts emerge from the anterior end of the aperture, under the shell
  const skin = mottled([0.36, 0.33, 0.24], [0.14, 0.13, 0.1], 60, 'skin');
  const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skin);
  foot.scale.set(0.22, 0.045, 0.08); foot.position.set(0.75, -0.2, -0.01);
  body.add(foot);
  const snout = tube([new THREE.Vector3(0.9, -0.19, 0), new THREE.Vector3(0.98, -0.21, 0.015), new THREE.Vector3(1.05, -0.24, 0.02)], 0.026, 0.016).g;
  body.add(new THREE.Mesh(snout, skin));
  // eyestalks with ringed eyes
  const stalkMat = mottled([0.72, 0.7, 0.62], [0.45, 0.42, 0.36], 90, 'stalk');
  stalkMat.transparent = true; stalkMat.opacity = 0.85;
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 });
  const stalks = [];
  for (const side of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(0.93, -0.16, side * 0.05);
    const { g, curve } = tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 0.035, side * 0.025), new THREE.Vector3(0.11, 0.085, side * 0.05), new THREE.Vector3(0.14, 0.14, side * 0.065)], 0.011, 0.008);
    piv.add(new THREE.Mesh(g, stalkMat));
    const end = curve.getPointAt(1), dir = curve.getTangentAt(1);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), eyeMat);
    eye.position.copy(end).addScaledVector(dir, 0.012);
    eye.lookAt(eye.position.clone().add(new THREE.Vector3(0.3, 0.1, side * 1.0)));
    eye.rotateY(-Math.PI / 2);                      // texture pole faces outwards
    piv.add(eye);
    piv.userData.side = side; body.add(piv); stalks.push(piv);
  }
  // operculum: brown, sickle-shaped, serrated along one edge
  const opShape = new THREE.Shape();
  opShape.moveTo(0, 0);
  for (let i = 0; i <= 20; i++) { const t = i / 20; opShape.lineTo(t * 0.26, 0.035 * Math.sin(t * Math.PI) + 0.004 * (i % 2)); }
  for (let i = 20; i >= 0; i--) { const t = i / 20; opShape.lineTo(t * 0.26, -0.004 + 0.012 * Math.sin(t * Math.PI)); }
  const opGeo = new THREE.ExtrudeGeometry(opShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
  const opMat = new THREE.MeshPhysicalMaterial({ color: 0x5a3418, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const operculum = new THREE.Mesh(opGeo, opMat);
  const opPiv = new THREE.Group(); opPiv.position.set(0.55, -0.26, -0.01); opPiv.add(operculum);
  operculum.rotation.set(Math.PI / 2, 0, 0.15);
  body.add(opPiv);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // Behaviour: sits, looks about with its eyestalks, and now and then "leaps": the operculum
  // digs into the sand and the shell is heaved forward and rocks back down.
  let leapT = -1, next = 3 + Math.random() * 6;
  const state = { heading: Math.random() * Math.PI * 2, pos: new THREE.Vector3() };
  function update(dt, t) {
    for (const s of stalks) {
      const sd = s.userData.side;
      s.rotation.set(0.25 * Math.sin(t * 0.7 + sd), 0.35 * Math.sin(t * 0.43 + sd * 2), 0.15 * Math.sin(t * 0.9 + sd));
    }
    next -= dt;
    if (leapT < 0 && next <= 0) { leapT = 0; next = 6 + Math.random() * 10; }
    if (leapT >= 0) {
      leapT += dt / 1.3;
      const k = Math.min(leapT, 1);
      const push = Math.sin(Math.min(k / 0.3, 1) * Math.PI / 2);          // operculum swings down and back
      opPiv.rotation.z = -1.2 * push * (1 - Math.max(0, (k - 0.6) / 0.4));
      const lift = Math.sin(Math.min(Math.max((k - 0.15) / 0.5, 0), 1) * Math.PI);
      body.rotation.z = 0.35 * lift;                                     // shell rears up at the front
      body.position.y = 0.08 * lift;
      const fwd = Math.min(Math.max((k - 0.15) / 0.6, 0), 1);
      group.userData.stepDist = 0.3 * dt / 1.3 * (fwd > 0 && fwd < 1 ? 1.6 : 0);
      if (leapT >= 1) { leapT = -1; body.rotation.z = 0; body.position.y = 0; }
    } else { group.userData.stepDist = 0; opPiv.rotation.z = 0; }
  }
  return { group, update, state, uLive };
}
