// Geometry that only shows when the mouth or the gill covers open:
//   * buccal cavity (lip mucosa, palate, floor, cheek walls) with teeth
//   * inner lining + free edge of each gill cover, gill-chamber wall and four gill arches per side
// Every vertex carries a `zone` + blend parameter that the rig turns into skin weights.
import { section, toObject, dirToObject, gapeY, RICTUS_S, OPERCLE, PREOPERCLE } from './anatomy.mjs';

// back of the buccal cavity (pharynx), just in front of the preopercle / first gill arch
const PREOP_S = Math.max(...PREOPERCLE.map((p) => p[0]));
const PHARYNX_S = PREOP_S - 0.85;
import { hash01, clamp, smoothstep } from '../../lib/noise.mjs';

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
  // src: index of the body-skin vertex this interior vertex hangs from (its skin weights are reused)
  vert(fish, color, uv, zone, blend, gill = 0, src = -1) {
    this.v.push({ fish, color, uv, zone, blend, gill, src });
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
  const lip = [0.6, 0.47, 0.41], palate = [0.52, 0.34, 0.31], floorC = [0.56, 0.37, 0.34], deep = [0.06, 0.012, 0.01];
  const colorAt = (u, upper, lat) => {
    const base = u < 0.12 ? lip : upper ? palate : floorC;
    const d = smoothstep(0.15, 0.85, u);
    const c = base.map((x, i) => x + (deep[i] - x) * d);
    const ao = 1 - 0.8 * Math.pow(u, 0.9);
    return [c[0] * ao, c[1] * ao, c[2] * ao, 1];
  };
  const pharynx = (P) => {
    const q = section(PHARYNX_S - 0.2);
    const lat = clamp(P[2] / Math.max(section(Math.max(P[0], 0.3)).w, 0.3), -1, 1);
    return [PHARYNX_S, q.yc - 0.5, lat * 0.9];
  };
  const ctrl = { true: [], false: [] }; // per column: [P, lipIn, C, T]
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
      // lip-roll radii as in anatomy.mjs (buildFeatures)
      const reach = upper ? 2 * (0.29 - 0.12 * f - 0.07 * f * f) - 0.14 + 0.06 : 2 * (0.28 - 0.1 * f - 0.08 * f * f) - 0.15 + 0.06;
      const az = Math.abs(P[2]);
      // pass over the top of the roll (slightly across the gape line) so the strip never cuts through it;
      // near the snout tip the roll lies across the axis, so step back behind it instead
      const front = 1 - clamp(az / 0.9, 0, 1);
      const lipIn = [s + 0.3 + (reach + 0.1) * front, gy + (upper ? -0.03 : 0.03), Math.sign(P[2]) * Math.max(az - reach, az * 0.3)];
      // control: palate vaults up, the floor forms a trough (deepest at the midline), both pulled inward
      const latN = clamp(Math.abs(P[2]) / 1.8, 0, 1);
      const C = [s + 1.3 + (PHARYNX_S - s) * 0.2, gy + (upper ? 0.5 - 0.22 * latN * latN : -0.7 + 0.4 * latN * latN), lipIn[2] * 0.7];
      ctrl[upper].push([P, lipIn, C, T]);
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
  // point on a sheet at fractional column kf and depth tau (0 = just inside the lip, 1 = pharynx)
  const sheetAt = (upper, kf, tau) => {
    const cs = ctrl[upper];
    const k0 = clamp(Math.floor(kf), 0, cs.length - 2), f = clamp(kf - k0, 0, 1);
    const at = (c) => bez(c[1], c[2], c[3], tau);
    return lerp3(at(cs[k0]), at(cs[k0 + 1]), f);
  };
  const midK = (K - 1) / 2;
  // tongue: a pale, flattened lobe on the mouth floor with a free, bluntly rounded tip; it rides on the
  // floor (jaw + hyoid) like the floor sheet it sits on
  {
    const NA = 12, NL = 14;
    const rows = [];
    for (let j = 0; j <= NL; j++) {
      const l = j / NL; // 0 = tip, 1 = root
      const tau = 0.1 + 0.45 * l;
      const halfW = 0.36 * Math.pow(smoothstep(0.0, 0.35, l), 0.5) * (1 - 0.15 * l) + 0.14;
      const row = [];
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * 2 - 1;
        // columns around the midline: convert the lateral offset (mm) into a fractional column
        const base0 = sheetAt(false, midK, tau);
        const colW = Math.hypot(...sub(sheetAt(false, midK + 1, tau), base0)) || 0.05;
        const p = sheetAt(false, midK + (a * halfW) / colW, tau);
        const bulge = Math.pow(Math.max(0, 1 - a * a), 0.7) * (0.2 * smoothstep(0.0, 0.14, l) + 0.03) * (1 - 0.6 * smoothstep(0.6, 1.0, l));
        p[1] += bulge;
        const shade = 0.82 + 0.18 * Math.max(0, 1 - a * a);
        const col = [0.62 * shade, 0.44 * shade, 0.42 * shade, 1];
        row.push(B.vert(p, col, [0.5 + a * 0.05, tau], 'mouthLower', 0.12 + 0.5 * l, 0));
      }
      rows.push(row);
    }
    B.grid(rows, (c) => [0, 1, 0]);
  }
  // teeth (after the cleared-and-dried skeleton reference): an outer row of well-spaced, enlarged conical
  // teeth that curve back and inward (largest at the front of the dentary), and behind them a band of fine
  // villiform teeth; both jaws are toothed back to just before the mouth corner
  const teeth = new Builder();
  const colBase = [0.86, 0.83, 0.74, 1], colTip = [0.93, 0.9, 0.82, 1];
  const addTooth = (base, dir, len, rad, curl, zone) => {
    // curved cone: centre line bends from `dir` toward the back of the mouth (+s) and the midline
    const back = nrm([1, 0, -Math.sign(base[2]) * 0.35]);
    const NS = 4, NA = 7;
    const centre = (u) => add(base, add(mul(dir, len * u), mul(back, len * curl * u * u)));
    const tangent = (u) => nrm(add(mul(dir, len), mul(back, 2 * len * curl * u)));
    const rings = [];
    for (let i = 0; i < NS; i++) {
      const u = i / NS;
      const c = centre(u), tg = tangent(u);
      const a0 = nrm(cross(tg, [0, 0, 1]).map((x) => x + 1e-6));
      const b0 = nrm(cross(tg, a0));
      const r = rad * Math.pow(1 - u, 0.85);
      const col = colBase.map((x, k) => x + (colTip[k] - x) * u);
      const ring = [];
      for (let j = 0; j < NA; j++) {
        const ang = (j / NA) * Math.PI * 2;
        ring.push(teeth.vert(add(c, add(mul(a0, Math.cos(ang) * r), mul(b0, Math.sin(ang) * r))), col, [0.5, 0.02], zone, 0.06, 0));
      }
      rings.push({ ring, c });
    }
    const tip = teeth.vert(centre(1), colTip, [0.5, 0.02], zone, 0.06, 0);
    for (let i = 0; i < NS - 1; i++) {
      const A = rings[i], Bn = rings[i + 1];
      const mid = mul(add(A.c, Bn.c), 0.5);
      for (let j = 0; j < NA; j++) {
        const j1 = (j + 1) % NA;
        teeth.tri(A.ring[j], A.ring[j1], Bn.ring[j1], (c) => sub(c, mid));
        teeth.tri(A.ring[j], Bn.ring[j1], Bn.ring[j], (c) => sub(c, mid));
      }
    }
    const last = rings[NS - 1];
    for (let j = 0; j < NA; j++) teeth.tri(last.ring[j], last.ring[(j + 1) % NA], tip, (c) => sub(c, last.c));
  };
  const toothRow = (edge, upper) => {
    // inner lip margin (just inside the lip roll) as an arc-length polyline
    const cs = ctrl[upper];
    const pts = cs.map((c) => bez(c[1], c[2], c[3], 0.015));
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(...sub(pts[k], pts[k - 1])));
    const at = (d) => {
      let k = 1;
      while (k < pts.length - 1 && cum[k] < d) k++;
      const f = clamp((d - cum[k - 1]) / Math.max(cum[k] - cum[k - 1], 1e-6), 0, 1);
      return lerp3(pts[k - 1], pts[k], f);
    };
    const total = cum[cum.length - 1];
    const zone = upper ? 'mouthUpper' : 'mouthLower';
    const sEnd = RICTUS_S - (upper ? 0.7 : 0.55);
    const place = (spacing, row, idx0) => {
      for (let d = spacing * 0.5, i = 0; d < total; d += spacing, i++) {
        const q = at(d + (hash01(i, row, upper ? 11 : 12, 3) - 0.5) * spacing * 0.3);
        if (q[0] > sEnd) continue;
        if (row > 0 && hash01(i, row, upper ? 5 : 6, 7) < 0.15) continue;
        const front = 1 - clamp(q[0] / sEnd, 0, 1); // 1 at the symphysis
        const h = hash01(i, row + idx0, upper ? 1 : 2, 9);
        const base = [q[0] + 0.03 + 0.075 * row, q[1] + (upper ? 0.035 : -0.035) * (1 + 0.8 * row), q[2] * (1 - 0.045 * row)];
        const dir = nrm([0.12 + 0.08 * row, upper ? -1 : 1, -Math.sign(q[2] || 1) * (0.2 + 0.1 * row)]);
        if (row === 0) {
          // fine sharp teeth in a narrow band; a large, backward-curved canine on each side of the lower jaw
          // [F: Fauna Sinica 裸项蜂巢虾虎鱼 "large canine teeth on both sides of the lower jaw curved backward"]
          const canine = upper ? 0 : Math.exp(-(((front - 0.5) / 0.1) ** 2));
          const len = (upper ? 0.11 + 0.05 * front : 0.1 + 0.03 * front + 0.17 * canine) * (0.85 + 0.3 * h);
          const cdir = canine > 0.3 ? nrm([dir[0] + 0.35 * canine, dir[1], dir[2]]) : dir;
          addTooth(base, cdir, len, 0.026 + 0.01 * front + 0.016 * canine, 0.35 + 0.25 * canine, zone);
        } else {
          addTooth(base, dir, 0.05 + 0.03 * h, 0.012 + 0.003 * h, 0.2, zone);
        }
      }
    };
    place(0.14, 0, 0);
    place(0.06, 1, 10);
    place(0.065, 2, 20);
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
    while (ROWS < 60 && mesh.grid.sList[im - ROWS - 1] > PREOP_S + 0.1) ROWS++;
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
        row.push(out.vert(p, [...lining.map((c) => c * (0.8 + 0.2 * hash01(r, k, 3, 4))), 0.5], [k / (J - 1), u], 'flapLining', 1, 0, g));
      }
      lin.push(row);
    }
    out.grid(lin, (c) => [0, 0, -Math.sign(c[2])]); // lining looks toward the body
    // 2) free edge strip joining the outer skin (flap copy) to the lining
    const edgeRows = [E.flap.map((g) => out.vert(V[g].fish, [...edgeC, 0.5], [0, 0], 'flapLining', 1, 0, g)), lin[0]];
    out.grid(edgeRows, (c) => [1, 0, 0]);
    // 3) chamber wall: starts at the body-side cut and runs forward under the flap, 0.55 mm deep
    const wallRows = [];
    for (let r = 0; r <= ROWS; r++) {
      const row = [];
      for (let k = 0; k < J; k++) {
        const gi = r === 0 ? E.body[k] : gidAt(im - r, js[k]);
        const v = V[gi];
        const nf = [-v.n[2], v.n[1], v.n[0]];
        const halfW = Math.max(Math.abs(v.fish[2]), 0.2);
        const d = r === 0 ? 0 : Math.min(0.18 + 0.4 * smoothstep(0, 6, r), 0.42 * halfW);
        const p = sub(v.fish, mul(nf, d));
        const endFade = Math.min(k, J - 1 - k) / 3;
        row.push(out.vert(p, [...wall.map((c) => c * (0.7 + 0.3 * clamp(endFade))), 0.5], [k / (J - 1), r / ROWS], 'gillWall', 0, 0, gi));
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
        const gs = out.v[wallRows[r][k]].src;
        base.push(out.vert(pw, [0.5, 0.05, 0.05, 0.5], [k / (J - 1), 0], 'gillArch', 0, 1, gs));
        top.push(out.vert(add(pw, mul(nf, h)), [0.85, 0.16, 0.14, 0.5], [k / (J - 1), 1], 'gillArch', 0, 1, gs));
      }
      out.grid([base, top], (c) => [1, 0, 0]);
      // back face of the ribbon too (arches are seen from both sides when the cover swings)
      out.grid([top, base], (c) => [-1, 0, 0]);
    }
  }
  return out.finish('Gill_Chamber');
}
