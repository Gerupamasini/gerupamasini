// Geometry that only shows when the mouth or the gill covers open:
//   * buccal cavity (lip mucosa, palate, floor, cheek walls) with teeth
//   * inner lining + free edge of each gill cover, gill-chamber wall and four gill arches per side
// Every vertex carries a `zone` + blend parameter that the rig turns into skin weights.
import { section, toObject, dirToObject, gapeY, RICTUS_S, OPERCLE } from './anatomy.mjs';
import { hash01, clamp, smoothstep } from '../lib/noise.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const bez = (p0, c, p1, t) => add(add(mul(p0, (1 - t) * (1 - t)), mul(c, 2 * t * (1 - t))), mul(p1, t * t));

class Builder {
  constructor() { this.v = []; this.idx = []; }
  vert(fish, color, uv, zone, blend, gill = 0) {
    this.v.push({ fish, color, uv, zone, blend, gill });
    return this.v.length - 1;
  }
  // grid of vertex indices [row][col] -> quads; `inside` = a point the normals must face
  grid(rows, flipTest) {
    for (let r = 0; r < rows.length - 1; r++)
      for (let c = 0; c < rows[r].length - 1; c++) {
        const a = rows[r][c], b = rows[r + 1][c], d = rows[r][c + 1], e = rows[r + 1][c + 1];
        this.tri(a, b, e, flipTest);
        this.tri(a, e, d, flipTest);
      }
  }
  tri(a, b, c, facing) {
    const A = this.v[a].fish, B = this.v[b].fish, C = this.v[c].fish;
    const n = cross(sub(B, A), sub(C, A));
    if (Math.hypot(...n) < 1e-12) return;
    const centre = mul(add(add(A, B), C), 1 / 3);
    const want = facing(centre); // direction the face must look toward
    if (dot(n, want) < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  finish(name) {
    // smooth normals from faces (fish space) -> object space arrays
    const n = this.v.length;
    const acc = new Float64Array(n * 3);
    for (let k = 0; k < this.idx.length; k += 3) {
      const [a, b, c] = [this.idx[k], this.idx[k + 1], this.idx[k + 2]];
      const fn = cross(sub(this.v[b].fish, this.v[a].fish), sub(this.v[c].fish, this.v[a].fish));
      for (const i of [a, b, c]) { acc[i * 3] += fn[0]; acc[i * 3 + 1] += fn[1]; acc[i * 3 + 2] += fn[2]; }
    }
    const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), uv = new Float32Array(n * 2), color = new Float32Array(n * 4), gill = new Float32Array(n);
    this.v.forEach((v, i) => {
      position.set(toObject(v.fish), i * 3);
      normal.set(dirToObject(nrm([acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]])), i * 3);
      uv.set(v.uv, i * 2);
      color.set([v.color[0], v.color[1], v.color[2], v.color[3] ?? 1], i * 4);
      gill[i] = v.gill;
    });
    return { name, position, normal, uv, color, gill, indices: new Uint32Array(this.idx), verts: this.v };
  }
}

// ---------------------------------------------------------------------------------------------
// Buccal cavity

export function buildMouth(mesh) {
  const V = mesh.verts;
  const B = new Builder();
  const edgeU = [...mesh.edges.gapeL.up, ...mesh.edges.gapeR.up.slice().reverse().slice(1)];
  const edgeL = [...mesh.edges.gapeL.lo, ...mesh.edges.gapeR.lo.slice().reverse().slice(1)];
  const K = edgeU.length;
  const M = 10;
  const lip = [0.66, 0.55, 0.48], palate = [0.62, 0.42, 0.38], floorC = [0.66, 0.46, 0.42], deep = [0.07, 0.015, 0.012];
  const colorAt = (u, upper, lat) => {
    const base = u < 0.12 ? lip : upper ? palate : floorC;
    const d = smoothstep(0.15, 0.85, u);
    const c = base.map((x, i) => x + (deep[i] - x) * d);
    const ao = 1 - 0.8 * Math.pow(u, 0.9);
    return [c[0] * ao, c[1] * ao, c[2] * ao, 1];
  };
  const pharynx = (P) => {
    const q = section(6.9);
    const lat = clamp(P[2] / Math.max(section(Math.max(P[0], 0.3)).w, 0.3), -1, 1);
    return [7.1, q.yc - 0.55, lat * 0.95];
  };
  const sheet = (edge, upper) => {
    const rows = [];
    for (let m = 0; m <= M; m++) rows.push([]);
    edge.forEach((vi, k) => {
      const P = V[vi].fish;
      const T = pharynx(P);
      const lat = T[2];
      const s = P[0];
      const gy = gapeY(Math.max(s, 0.1));
      // inner face of the lip roll: the mucosa starts at the gape and curls in behind the lip roll
      // (the roll reaches ~2r - out inward from the skin, see anatomy lipLine)
      const f = clamp(s / RICTUS_S, 0, 1);
      const reach = upper ? 2 * (0.38 - 0.17 * f) - 0.15 + 0.06 : 2 * (0.31 - 0.14 * f) - 0.12 + 0.06;
      const az = Math.abs(P[2]);
      // pass over the top of the roll (slightly across the gape line) so the strip never cuts through it;
      // near the snout tip the roll lies across the axis, so step back behind it instead
      const front = 1 - clamp(az / 0.9, 0, 1);
      const lipIn = [s + 0.3 + (reach + 0.1) * front, gy + (upper ? -0.03 : 0.03), Math.sign(P[2]) * Math.max(az - reach, az * 0.3)];
      // control: palate vaults up, the floor forms a trough (deepest at the midline), both pulled inward
      const latN = clamp(Math.abs(P[2]) / 1.8, 0, 1);
      const C = [s + 1.6 + (7.1 - s) * 0.2, gy + (upper ? 0.55 - 0.25 * latN * latN : -0.78 + 0.45 * latN * latN), lipIn[2] * 0.7];
      // first ring just inside the lip so the mucosa curls inward
      for (let m = 0; m <= M; m++) {
        const u = m / M;
        let pos;
        if (m === 0) pos = P;
        else if (m === 1) pos = lipIn;
        else pos = bez(lipIn, C, T, (m - 1) / (M - 1));
        rows[m].push(B.vert(pos, colorAt(u, upper, lat), [k / (K - 1), u], upper ? 'mouthUpper' : 'mouthLower', u, 0));
      }
    });
    return rows;
  };
  const up = sheet(edgeU, true);
  const lo = sheet(edgeL, false);
  // normals face the cavity centre (between the sheets)
  const centreOf = (p) => {
    const s = p[0];
    return [s + 0.4, gapeY(clamp(s, 0.1, RICTUS_S)) - 0.05, p[2] * 0.3];
  };
  const faceInto = (c) => sub(centreOf(c), c);
  B.grid(up, faceInto);
  B.grid(lo, faceInto);
  // cheek walls close the cavity between the sheets at both rictus ends
  for (const k of [0, K - 1]) {
    const W = 3;
    const rows = [];
    for (let m = 0; m <= M; m++) {
      const a = B.v[up[m][k]].fish, b = B.v[lo[m][k]].fish;
      const row = [up[m][k]];
      for (let w = 1; w < W; w++) {
        const t = w / W;
        const p = lerp3(a, b, t);
        const outward = k === 0 ? 1 : -1;
        p[2] += outward * 0.12 * Math.sin(Math.PI * t) * (m > 0 ? 1 : 0);
        row.push(B.vert(p, colorAt(m / M, true, 0), [k / (K - 1), m / M], 'mouthWall', t, 0));
      }
      row.push(lo[m][k]);
      rows.push(row);
    }
    B.grid(rows, faceInto);
  }
  // teeth: small recurved cones along both jaws, just inside the lips
  const teeth = new Builder();
  const addTooth = (base, dir, len, rad, zone) => {
    const tip = add(base, mul(dir, len));
    const a0 = nrm(cross(dir, [0, 0, 1]).map((x) => x + 1e-6));
    const b0 = nrm(cross(dir, a0));
    const ring = [];
    const col = [0.62, 0.58, 0.5, 1];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const p = add(base, add(mul(a0, Math.cos(ang) * rad), mul(b0, Math.sin(ang) * rad)));
      ring.push(teeth.vert(p, col, [0, 0], zone, 0.06, 0));
    }
    const t = teeth.vert(add(tip, mul([1, 0, 0], len * 0.25)), col, [0, 1], zone, 0.06, 0);
    for (let i = 0; i < 6; i++) teeth.tri(ring[i], ring[(i + 1) % 6], t, (c) => sub(c, base));
  };
  const toothRow = (edge, upper) => {
    let acc = 0;
    for (let k = 0; k < edge.length - 1; k++) {
      const a = V[edge[k]].fish, b = V[edge[k + 1]].fish;
      const L = Math.hypot(...sub(b, a));
      const n = Math.floor((acc + L) / 0.07) - Math.floor(acc / 0.07);
      for (let t = 0; t < n; t++) {
        const f = (t + 0.5) / Math.max(n, 1);
        const p = lerp3(a, b, f);
        if (p[0] > RICTUS_S - 1.2) continue;
        if (hash01(k, t, upper ? 5 : 6, 7) < 0.15) continue;
        const gy = gapeY(Math.max(p[0], 0.1));
        const row2 = hash01(k, t, upper ? 3 : 4, 8) < 0.4 ? 1 : 0; // inner row
        const base = [p[0] + 0.3 + 0.07 * row2, gy + (upper ? 0.2 : -0.24) + (upper ? 0.03 : -0.03) * row2, p[2] * (0.86 - 0.05 * row2)];
        const dir = nrm([0.45, upper ? -1 : 1, -Math.sign(p[2]) * 0.15]);
        const h = hash01(k, t, upper ? 1 : 2, 9);
        addTooth(base, dir, (0.045 + 0.03 * h) * (row2 ? 0.7 : 1), 0.011 + 0.004 * h, upper ? 'mouthUpper' : 'mouthLower');
      }
      acc += L;
    }
  };
  toothRow(edgeU, true);
  toothRow(edgeL, false);
  return { cavity: B.finish('Mouth_Cavity'), teeth: teeth.finish('Mouth_Teeth') };
}

// ---------------------------------------------------------------------------------------------
// Gill covers: lining + free edge, chamber wall, gill arches

export function buildGills(mesh) {
  const V = mesh.verts;
  const { cols, im } = mesh.grid;
  const out = new Builder();
  const lining = [0.3, 0.14, 0.13], wall = [0.24, 0.05, 0.045], edgeC = [0.62, 0.55, 0.5];
  for (const side of [1, -1]) {
    const E = side > 0 ? mesh.edges.marginL : mesh.edges.marginR;
    const js = E.body.map((g) => V[g].j);
    const J = js.length;
    // rows of the flap inward from the margin (stop at the preopercle so nothing reaches the pharynx)
    let ROWS = 0;
    while (ROWS < 60 && mesh.grid.sList[im - ROWS - 1] > 7.9) ROWS++;
    const gidAt = (i, j) => i * cols + j;
    // 1) lining under the flap (offset inward), rows im … im-ROWS
    const lin = [];
    for (let r = 0; r <= ROWS; r++) {
      const row = [];
      for (let k = 0; k < J; k++) {
        const g = r === 0 ? E.flap[k] : gidAt(im - r, js[k]);
        const v = V[g];
        const nf = [-v.n[2], v.n[1], v.n[0]]; // object -> fish direction
        const depth = 0.07;
        const p = sub(v.fish, mul(nf, depth));
        const u = r / ROWS;
        row.push(out.vert(p, [...lining.map((c) => c * (0.8 + 0.2 * hash01(r, k, 3, 4))), 0.5], [k / (J - 1), u], 'flapLining', 1, 0));
      }
      lin.push(row);
    }
    out.grid(lin, (c) => [0, 0, -Math.sign(c[2])]); // lining looks toward the body
    // 2) free edge strip joining the outer skin (flap copy) to the lining
    const edgeRows = [E.flap.map((g) => out.vert(V[g].fish, [...edgeC, 0.5], [0, 0], 'flapLining', 1, 0)), lin[0]];
    out.grid(edgeRows, (c) => [1, 0, 0]);
    // 3) chamber wall: starts at the body-side cut and runs forward under the flap, 0.55 mm deep
    const wallRows = [];
    for (let r = 0; r <= ROWS; r++) {
      const row = [];
      for (let k = 0; k < J; k++) {
        const v = V[r === 0 ? E.body[k] : gidAt(im - r, js[k])];
        const nf = [-v.n[2], v.n[1], v.n[0]];
        const halfW = Math.max(Math.abs(v.fish[2]), 0.2);
        const d = r === 0 ? 0 : Math.min(0.18 + 0.4 * smoothstep(0, 6, r), 0.42 * halfW);
        const p = sub(v.fish, mul(nf, d));
        const endFade = Math.min(k, J - 1 - k) / 3;
        row.push(out.vert(p, [...wall.map((c) => c * (0.7 + 0.3 * clamp(endFade))), 0.5], [k / (J - 1), r / ROWS], 'gillWall', 0, 0));
      }
      wallRows.push(row);
    }
    out.grid(wallRows, (c) => [0, 0, Math.sign(c[2])]); // wall looks out through the gill slit
    // 4) four gill arches: ribbons standing on the wall, parallel to the margin, filament texture via `gill`
    for (let a = 0; a < 4; a++) {
      const r = 2 + a * Math.max(2, Math.floor(ROWS / 5));
      const H = 0.42 - a * 0.04;
      const base = [], top = [];
      for (let k = 1; k < J - 1; k++) {
        const pw = out.v[wallRows[r][k]].fish;
        const v = V[gidAt(im - r, js[k])];
        const nf = [-v.n[2], v.n[1], v.n[0]];
        const lat = Math.sin((Math.PI * k) / (J - 1));
        // keep the filament tips under the closed gill cover (wall depth minus the lining clearance)
        const depth = Math.hypot(...sub(v.fish, pw));
        const h = Math.max(0.02, Math.min(H * (0.4 + 0.6 * lat), depth - 0.12));
        base.push(out.vert(pw, [0.5, 0.05, 0.05, 0.5], [k / (J - 1), 0], 'gillArch', 0, 1));
        top.push(out.vert(add(pw, mul(nf, h)), [0.85, 0.16, 0.14, 0.5], [k / (J - 1), 1], 'gillArch', 0, 1));
      }
      out.grid([base, top], (c) => [1, 0, 0]);
      // back face of the ribbon too (arches are seen from both sides when the cover swings)
      out.grid([top, base], (c) => [-1, 0, 0]);
    }
  }
  return out.finish('Gill_Chamber');
}
