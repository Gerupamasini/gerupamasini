// Procedural sky (for IBL), wet-mud tidal-flat ground, burrow, pebbles and shell chips. Units: 1 = 1 cm.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const hash = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
function pnoise(u, v, cells, seed) { // periodic value noise, u,v in [0,1)
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const m = (a) => ((a % cells) + cells) % cells, g = (i, j) => hash(m(i), m(j), seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (g(ix, iy) * (1 - sx) + g(ix + 1, iy) * sx) * (1 - sy) + (g(ix, iy + 1) * (1 - sx) + g(ix + 1, iy + 1) * sx) * sy;
}

export function makeSkyEnvironment(renderer, sunDir) {
  const sc = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sun: { value: sunDir.clone().normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sun;
      void main(){ vec3 d = normalize(vP); float h = d.y;
        vec3 top = vec3(0.66,0.70,0.78), hor = vec3(0.88,0.88,0.86), gnd = vec3(0.30,0.25,0.19);
        vec3 c = h > 0. ? mix(hor, top, pow(h, 0.5)) : mix(hor*0.75, gnd, clamp(-h*3., 0., 1.));
        float s = max(dot(d, normalize(sun)), 0.);
        c += vec3(1.0,0.9,0.72) * (pow(s, 600.) * 60. + pow(s, 12.) * 0.35);
        gl_FragColor = vec4(c, 1.); }`,
  }));
  sc.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(sc, 0.02).texture; pmrem.dispose(); sky.geometry.dispose();
  return tex;
}

function groundTextures() {
  const S = 1024, cA = document.createElement('canvas'), cN = document.createElement('canvas'), cR = document.createElement('canvas');
  cA.width = cA.height = cN.width = cN.height = cR.width = cR.height = S;
  const iA = new ImageData(S, S), iN = new ImageData(S, S), iR = new ImageData(S, S), h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let u = x / S, v = y / S;
    u = (u + 0.035 * (pnoise(u, v, 12, 41) - 0.5) + 1) % 1; v = (v + 0.035 * (pnoise(u, v, 12, 42) - 0.5) + 1) % 1;   // domain warp
    let a = 0, amp = 0.5, c = 3;
    for (let o = 0; o < 6; o++) { a += amp * pnoise(u, v, c, o); amp *= 0.55; c *= 2; }
    const grain = pnoise(u, v, 512, 9), grain2 = pnoise(u, v, 200, 4);
    const pebble = Math.pow(Math.max(0, pnoise(u, v, 40, 3) - 0.62) * 3.0, 1.2);
    h[y * S + x] = a * 0.7 + grain * 0.09 + grain2 * 0.08 + pebble * 0.35;
  }
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, hv = H(x, y), u = x / S, v = y / S;
    const dx = (H(x + 1, y) - H(x - 1, y)) * 4, dy = (H(x, y + 1) - H(x, y - 1)) * 4, l = Math.hypot(dx, dy, 1);
    iN.data[i] = (-dx / l * 0.5 + 0.5) * 255; iN.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; iN.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; iN.data[i + 3] = 255;
    const wet = Math.min(1, Math.max(0, (pnoise(u, v, 6, 21) - 0.35) * 3));  // damp patches
    const spk = Math.min(1, Math.max(0, pnoise(u, v, 700, 7) - 0.84) * 6);                             // glinting sand grains
    const base = 0.42 + hv * 0.5;
    const r = (base * 0.55 + 0.02) * (1 - wet * 0.4) + spk * 0.2, g = (base * 0.47 + 0.02) * (1 - wet * 0.4) + spk * 0.19, b = (base * 0.36 + 0.02) * (1 - wet * 0.35) + spk * 0.16;
    iA.data[i] = Math.pow(r, 0.9) * 255; iA.data[i + 1] = Math.pow(g, 0.9) * 255; iA.data[i + 2] = Math.pow(b, 0.9) * 255; iA.data[i + 3] = 255;
    const rough = 0.95 - wet * 0.3 + spk * -0.25;
    iR.data[i] = 255; iR.data[i + 1] = Math.max(0.75, rough) * 255; iR.data[i + 2] = 0; iR.data[i + 3] = 255;
  }
  cA.getContext('2d').putImageData(iA, 0, 0); cN.getContext('2d').putImageData(iN, 0, 0); cR.getContext('2d').putImageData(iR, 0, 0);
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: T(cA, true), normalMap: T(cN), roughnessMap: T(cR) };
}
function macroAO() { // large, non-tiling patchiness (uv1)
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const im = new ImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; let a = 0, amp = 0.5, f = 5;
    for (let o = 0; o < 5; o++) { a += amp * pnoise(u, v, f, 30 + o); amp *= 0.5; f *= 2; }
    const g = Math.min(1, 0.55 + a * 0.7) * 255, i = (y * S + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = g; im.data[i + 3] = 255;
  }
  c.getContext('2d').putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.channel = 1; return t;
}

export function makeGround(scene, burrowPos = new THREE.Vector3(3.3, 0, 1.2)) {
  const tx = groundTextures(), rep = 24 / 4.5;
  for (const t of Object.values(tx)) t.repeat.set(rep, rep);
  const mat = new THREE.MeshStandardMaterial({ ...tx, aoMap: macroAO(), aoMapIntensity: 1.0, roughness: 1, normalScale: new THREE.Vector2(1.1, 1.1), color: 0xffffff });
  // near patch: displaced (burrow with mud rim, gentle undulation)
  const N = 320, g = new THREE.PlaneGeometry(24, 24, N, N).rotateX(-Math.PI / 2);
  const P = g.attributes.position, uv = g.attributes.uv, uv1 = new THREE.BufferAttribute(new Float32Array(P.count * 2), 2); g.setAttribute('uv1', uv1);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), rc = Math.hypot(x, z);
    const d = Math.hypot(x - burrowPos.x, z - burrowPos.z);
    let y = (pnoise((x + 12) / 24, (z + 12) / 24, 8, 3) - 0.5) * 0.12 * Math.min(1, Math.max(0, (rc - 2.2) / 3));
    y += 0.16 * Math.exp(-(((d - 0.95) / 0.32) ** 2)) * (0.8 + 0.4 * pnoise((x + 12) / 24, (z + 12) / 24, 40, 5));
    y -= (1 - Math.min(1, Math.max(0, (d - 0.55) / 0.42))) ** 1.5 * 1.0;
    P.setY(i, y);
    uv.setXY(i, (x + 12) / 24 * rep, (z + 12) / 24 * rep);
    uv1.setXY(i, (x + 12) / 24, (z + 12) / 24);
  }
  g.computeVertexNormals();
  const near = new THREE.Mesh(g, mat); near.receiveShadow = true; near.name = 'GroundNear';
  // far disc (flat, shares the texture scale)
  const far = new THREE.Mesh(new THREE.RingGeometry(11.9, 60, 64, 1).rotateX(-Math.PI / 2), mat.clone()); far.receiveShadow = true;
  const fp = far.geometry.attributes.position, fu = far.geometry.attributes.uv, fu1 = new THREE.BufferAttribute(new Float32Array(fp.count * 2), 2); far.geometry.setAttribute('uv1', fu1);
  for (let i = 0; i < fp.count; i++) { fu.setXY(i, (fp.getX(i) + 12) / 24 * rep, (fp.getZ(i) + 12) / 24 * rep); fu1.setXY(i, (fp.getX(i) + 12) / 24, (fp.getZ(i) + 12) / 24); }
  far.position.y = 0.001;
  const grp = new THREE.Group(); grp.name = 'Ground'; grp.add(near, far);

  // pebbles, shell chips, wood flecks
  let s = 7; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let geo = new THREE.IcosahedronGeometry(1, 3); geo.deleteAttribute('normal'); geo.deleteAttribute('uv'); geo = mergeVertices(geo); const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const k = 0.88 + 0.24 * hash(Math.round(pos.getX(i) * 3), Math.round(pos.getY(i) * 3), Math.round(pos.getZ(i) * 3) + 1); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k); }
  geo.computeVertexNormals();
  const M = 2600, inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0xffffff }), M);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  const pal = ['#6c6456', '#82796a', '#544e42', '#9e9479', '#3e3a32', '#8a7f68', '#a8a08c'];
  let n = 0;
  while (n < M) {
    const a = rnd() * Math.PI * 2, r = 1.9 + Math.pow(rnd(), 0.7) * 10;
    const x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.hypot(x - burrowPos.x, z - burrowPos.z) < 1.3) continue;
    const sz = 0.015 + Math.pow(rnd(), 4) * 0.17;
    e.set(rnd() * 3, rnd() * 6, rnd() * 3); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, sz * 0.25, z), q, new THREE.Vector3(sz * (0.8 + rnd() * 0.6), sz * (0.55 + rnd() * 0.5), sz * (0.8 + rnd() * 0.6)));
    inst.setMatrixAt(n, m4); col.set(pal[Math.floor(rnd() * pal.length)]).multiplyScalar(0.8 + rnd() * 0.4); inst.setColorAt(n, col); n++;
  }
  inst.castShadow = true; inst.receiveShadow = true; grp.add(inst);
  scene.add(grp);
  return { group: grp, burrow: burrowPos };
}
