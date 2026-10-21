// Texture baking for the トビハゼ tiers. Every map is computed from the fish-frame position under each texel (the
// charts of charts.mjs are projections, so a texel always maps to one place on the fish), which keeps the charts'
// edges seamless and lets every tier bake its own size from the same functions:
//   rasterize()  a mesh's triangles into its UV space: per covered texel the barycentric blend of chosen vertex
//                attributes (position, normal, tangent ...)
//   dilate()     pushes covered texels outward into the gutter, so mipmaps and bilinear filtering never pull in the
//                background at a chart's edge
//   tangentNormals()  the detailed surface normal (from the dense sculpt mesh or the field itself) expressed in a
//                tier mesh's own tangent frame: the normal map that restores what the simplification removed
// Round T1 (textures.mjs, the bake orchestrator): texelTriangles (the triangle under each texel, the charts' edges
// extrapolated `reach` texels), baryPx, shaderFrames / encodeTangentNormal / decodeTangentNormal (three.js r186's own
// tangent frame from the GLB's int8 attributes and its exact inverse: the round-trip error ≤ 0.38° on every chart and on
// Eye_R through its mirrored tangents, 8-bit quantisation), fillNearest (the gutters filled by jump flooding),
// mipChain / islands / mipBleed (what each mip level of a map borrows from outside an island).

/**
 * Rasterise a mesh into a W×H texel grid.
 * @param mesh   { uv: Float32Array (0..1), indices: Uint32Array, [name]: Float32Array per-vertex attributes }
 * @param attrs  { name: components } the attributes to interpolate
 * @returns { W, H, mask: Uint8Array, tri: Int32Array, [name]: Float32Array (W·H·components) }
 */
export function rasterize(mesh, W, H, attrs) {
  const { uv, indices } = mesh;
  const out = { W, H, mask: new Uint8Array(W * H), tri: new Int32Array(W * H).fill(-1) };
  for (const [k, c] of Object.entries(attrs)) out[k] = new Float32Array(W * H * c);
  const names = Object.entries(attrs);
  for (let t = 0; t < indices.length / 3; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    // texel centres at (i + 0.5) / W; v = 0 at the top row (glTF UV)
    const ax = uv[a * 2] * W - 0.5, ay = uv[a * 2 + 1] * H - 0.5;
    const bx = uv[b * 2] * W - 0.5, by = uv[b * 2 + 1] * H - 0.5;
    const cx = uv[c * 2] * W - 0.5, cy = uv[c * 2 + 1] * H - 0.5;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    // a little beyond the triangle (conservative): thin slivers still claim their texels
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    const eps = -0.02;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const w0 = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / area;
        const w1 = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < eps || w1 < eps || w2 < eps) continue;
        const p = y * W + x;
        if (out.mask[p] === 2) continue; // a texel fully inside an earlier triangle keeps it
        const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
        out.mask[p] = inside ? 2 : 1;
        out.tri[p] = t;
        for (const [k, n] of names) {
          const A = mesh[k], O = out[k];
          for (let j = 0; j < n; j++) O[p * n + j] = A[a * n + j] * w0 + A[b * n + j] * w1 + A[c * n + j] * w2;
        }
      }
  }
  return out;
}

/**
 * Grow covered texels outward by `steps` rings (each uncovered texel takes the mean of its covered 8-neighbours),
 * in place, for any interleaved image with `ch` channels (Uint8Array or Float32Array). `mask` is updated too.
 */
export function dilate(img, mask, W, H, ch, steps) {
  const m = Uint8Array.from(mask, (v) => (v ? 1 : 0));
  for (let s = 0; s < steps; s++) {
    const add = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (m[p]) continue;
        let n = 0;
        const acc = new Float64Array(ch);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx, Y = y + dy;
            if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
            const q = Y * W + X;
            if (!m[q]) continue;
            for (let c = 0; c < ch; c++) acc[c] += img[q * ch + c];
            n++;
          }
        if (n) add.push([p, Array.from(acc, (v) => v / n)]);
      }
    if (!add.length) break;
    for (const [p, v] of add) { for (let c = 0; c < ch; c++) img[p * ch + c] = v[c]; m[p] = 1; }
  }
  for (let i = 0; i < m.length; i++) mask[i] = m[i];
  return img;
}

/**
 * Tangent-space normal map: the detailed normal `hi` (per texel, unit, fish frame) in the frame of a tier mesh
 * rasterised with its own normal and tangent (`lo.normal`, `lo.tangent` with handedness in w).
 * @returns Uint8Array RGB (the usual 0.5-centred encoding; +y = the tangent frame's bitangent)
 */
export function tangentNormals(hi, lo, W, H) {
  const out = new Uint8Array(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    if (!lo.mask[p]) { out[p * 3] = 128; out[p * 3 + 1] = 128; out[p * 3 + 2] = 255; continue; }
    let nx = lo.normal[p * 3], ny = lo.normal[p * 3 + 1], nz = lo.normal[p * 3 + 2];
    let l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    let tx = lo.tangent[p * 4], ty = lo.tangent[p * 4 + 1], tz = lo.tangent[p * 4 + 2];
    const w = lo.tangent[p * 4 + 3] < 0 ? -1 : 1;
    // Gram-Schmidt against the interpolated normal
    const d = tx * nx + ty * ny + tz * nz;
    tx -= nx * d; ty -= ny * d; tz -= nz * d;
    l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    const bx = (ny * tz - nz * ty) * w, by = (nz * tx - nx * tz) * w, bz = (nx * ty - ny * tx) * w;
    const hx = hi[p * 3], hy = hi[p * 3 + 1], hz = hi[p * 3 + 2];
    const X = hx * tx + hy * ty + hz * tz, Y = hx * bx + hy * by + hz * bz, Z = Math.max(0.05, hx * nx + hy * ny + hz * nz);
    l = Math.hypot(X, Y, Z) || 1;
    out[p * 3] = Math.round(((X / l) * 0.5 + 0.5) * 255);
    out[p * 3 + 1] = Math.round(((Y / l) * 0.5 + 0.5) * 255);
    out[p * 3 + 2] = Math.round(((Z / l) * 0.5 + 0.5) * 255);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ round T1: the bake
// (textures.mjs orchestrates: per tier and map size the triangle under each texel, the functions evaluated there, the
// gutters filled, the maps encoded). Pixel coordinates: px = u · W (texel i's centre at i + 0.5), v down (glTF UV).

/** The 8-bit snorm a GLB stores a normal / tangent component as (tools/lib/glb.mjs primitive(): KHR_mesh_quantization),
 * back to float: what the shader reads. */
export const q8 = (v) => Math.max(-127, Math.min(127, Math.round(v * 127))) / 127;

/**
 * The triangle under every texel of a W×H grid (one pass over the triangles; a texel inside two keeps the first), and
 * — with `reach` > 0 — every uncovered texel within `reach` texels (UV distance to the triangle) of a covered one given
 * the nearest triangle, its attributes then extrapolated over that triangle's plane (the surface key's request: the
 * bilinear lookups along a chart's edge read evaluated texels, not dilated ones; seams 0.42° → 0.25° median).
 * @param mesh  { uv, indices }   @param o { reach (texels, default 0), keep(t) → bool (triangles to rasterise) }
 * @returns { W, H, tri: Int32Array (−1 none), mask: Uint8Array (2 inside, 1 on the edge, 3 extrapolated) }
 */
export function texelTriangles(mesh, W, H, { reach = 0, keep = null } = {}) {
  const { uv, indices: I } = mesh;
  const tri = new Int32Array(W * H).fill(-1), mask = new Uint8Array(W * H);
  const nT = I.length / 3;
  for (let t = 0; t < nT; t++) {
    if (keep && !keep(t)) continue;
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const ax = uv[a * 2] * W - 0.5, ay = uv[a * 2 + 1] * H - 0.5, bx = uv[b * 2] * W - 0.5, by = uv[b * 2 + 1] * H - 0.5, cx = uv[c * 2] * W - 0.5, cy = uv[c * 2 + 1] * H - 0.5;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!(Math.abs(area) > 1e-12)) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const w0 = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / area, w1 = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / area, w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        const p = y * W + x;
        if (mask[p] === 2) continue;
        const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
        if (mask[p] === 1 && !inside) continue;
        mask[p] = inside ? 2 : 1; tri[p] = t;
      }
  }
  if (reach > 0) {
    const R = Math.ceil(reach) + 1, add = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (mask[p]) continue;
        let best = Infinity, bt = -1;
        const seen = new Set();
        for (let dy = -R; dy <= R; dy++) {
          const Y = y + dy; if (Y < 0 || Y >= H) continue;
          for (let dx = -R; dx <= R; dx++) {
            const X = x + dx; if (X < 0 || X >= W) continue;
            const t = tri[Y * W + X];
            if (t < 0 || mask[Y * W + X] === 3 || seen.has(t)) continue;
            seen.add(t);
            const d = triDistPx(uv, I, t, x + 0.5, y + 0.5, W, H);
            if (d < best) { best = d; bt = t; }
          }
        }
        if (bt >= 0 && best <= reach) add.push(p, bt);
      }
    for (let i = 0; i < add.length; i += 2) { tri[add[i]] = add[i + 1]; mask[add[i]] = 3; }
  }
  return { W, H, tri, mask };
}

/** Distance (pixels) from the pixel point (px, py) to triangle t in UV space (0 inside). */
function triDistPx(uv, I, t, px, py, W, H) {
  const P = [0, 1, 2].map((k) => [uv[I[t * 3 + k] * 2] * W, uv[I[t * 3 + k] * 2 + 1] * H]);
  const [a, b, c] = P;
  const s = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o = s(a, b, c), X = [px, py];
  const d0 = s(a, b, X) * o, d1 = s(b, c, X) * o, d2 = s(c, a, X) * o;
  if (d0 >= 0 && d1 >= 0 && d2 >= 0) return 0;
  const seg = (p, q) => {
    const ex = q[0] - p[0], ey = q[1] - p[1], l2 = ex * ex + ey * ey || 1;
    const k = Math.max(0, Math.min(1, ((px - p[0]) * ex + (py - p[1]) * ey) / l2));
    return Math.hypot(px - p[0] - k * ex, py - p[1] - k * ey);
  };
  return Math.min(seg(a, b), seg(b, c), seg(c, a));
}

/** The (unclamped) barycentric weights of the pixel point (px, py) in triangle t's UV (extrapolated outside it). */
export function baryPx(uv, I, t, px, py, W, H, out = [0, 0, 0]) {
  const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
  const ax = uv[a * 2] * W, ay = uv[a * 2 + 1] * H, bx = uv[b * 2] * W, by = uv[b * 2 + 1] * H, cx = uv[c * 2] * W, cy = uv[c * 2 + 1] * H;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  out[0] = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
  out[1] = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
  out[2] = 1 - out[0] - out[1];
  return out;
}

/**
 * The tangent frame three.js (r186, normal_vertex / normal_fragment_begin with vertex tangents) shades a mesh with, per
 * vertex, from the attributes as the GLB stores them (int8 snorm, q8): n = normalize(N), t = normalize(T.xyz),
 * b = normalize(cross(n, t)) · T.w. The fragment interpolates each and normalises: tbn = mat3(t, b, n) — not
 * re-orthogonalised. The GLTFLoader keeps normalScale (1, 1) when the mesh has tangents (it flips y only for derivative
 * frames). Returns Float32Arrays n, t, b (3 per vertex).
 */
export function shaderFrames(normal, tangent, { quantize = true } = {}) {
  const nv = normal.length / 3, n = new Float32Array(nv * 3), t = new Float32Array(nv * 3), b = new Float32Array(nv * 3);
  const Q = quantize ? q8 : (v) => v;
  for (let v = 0; v < nv; v++) {
    let nx = Q(normal[v * 3]), ny = Q(normal[v * 3 + 1]), nz = Q(normal[v * 3 + 2]);
    let l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    let tx = Q(tangent[v * 4]), ty = Q(tangent[v * 4 + 1]), tz = Q(tangent[v * 4 + 2]);
    l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    const w = tangent[v * 4 + 3] < 0 ? -1 : 1;
    let bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    l = Math.hypot(bx, by, bz) || 1; bx *= w / l; by *= w / l; bz *= w / l;
    n.set([nx, ny, nz], v * 3); t.set([tx, ty, tz], v * 3); b.set([bx, by, bz], v * 3);
  }
  return { n, t, b };
}

/**
 * A detailed normal `hi` (unit, the mesh's frame) as the tangent-space value m the shader turns back into it:
 * normalize(T m.x + B m.y + N m.z) = hi with T, B, N the interpolated (normalised, not orthogonal) frame — the exact
 * inverse of three.js's tbn · mapN (m solved from the 3×3 system, then normalised; z kept ≥ 0.02).
 */
export function encodeTangentNormal(hi, T, B, N, out = [0, 0, 1]) {
  // m = M⁻¹ hi with M = [T B N] (columns): rows of the inverse are the cross products / det
  const c0 = [B[1] * N[2] - B[2] * N[1], B[2] * N[0] - B[0] * N[2], B[0] * N[1] - B[1] * N[0]];
  const c1 = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
  const c2 = [T[1] * B[2] - T[2] * B[1], T[2] * B[0] - T[0] * B[2], T[0] * B[1] - T[1] * B[0]];
  const det = T[0] * c0[0] + T[1] * c0[1] + T[2] * c0[2];
  let x, y, z;
  if (Math.abs(det) < 1e-6) { x = 0; y = 0; z = 1; } else {
    x = (c0[0] * hi[0] + c0[1] * hi[1] + c0[2] * hi[2]) / det;
    y = (c1[0] * hi[0] + c1[1] * hi[1] + c1[2] * hi[2]) / det;
    z = (c2[0] * hi[0] + c2[1] * hi[1] + c2[2] * hi[2]) / det;
  }
  if (z < 0.02) z = 0.02;
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

/** The shader's normal from an encoded value m (8-bit decode included when `bytes`): normalize(T m.x + B m.y + N m.z). */
export function decodeTangentNormal(m, T, B, N, out = [0, 0, 1]) {
  const x = T[0] * m[0] + B[0] * m[1] + N[0] * m[2], y = T[1] * m[0] + B[1] * m[1] + N[1] * m[2], z = T[2] * m[0] + B[2] * m[1] + N[2] * m[2];
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

/**
 * Every texel `have` leaves out takes the value of its nearest texel that has one (Euclidean, jump flooding + a final
 * 1-step pass): the gutters and the empty atlas become the charts' own edges carried outward, so the bilinear lookups
 * and every mip level read only painted values, a chart's own as far as half the gutter to the next chart. In place.
 * (Round T1, the hero's 1024 maps through mipBleed: a push-pull fill — the coverage-weighted pyramid pushed down — and
 * push-pull behind a 2- or 4-texel nearest ring came out no better at any level, colour L2 p95 6.87 / 6.86 / 6.87 against
 * 6.87, ORM L4 19.8–20.6 against 20.8: what the coarse levels still borrow is the next island across the 20-texel gutters,
 * which no level-0 fill avoids.)
 * @param data  any typed array of W·H·ch   @param have Uint8Array (non-zero = painted)
 * @returns Int32Array the source texel of every texel
 */
export function fillNearest(data, ch, W, H, have) {
  const N = W * H, src = new Int32Array(N).fill(-1);
  for (let p = 0; p < N; p++) if (have[p]) src[p] = p;
  const d2 = (p, s) => { const dx = (p % W) - (s % W), dy = ((p / W) | 0) - ((s / W) | 0); return dx * dx + dy * dy; };
  const steps = [];
  for (let k = 1 << Math.ceil(Math.log2(Math.max(W, H))); k >= 1; k >>= 1) steps.push(k);
  steps.push(1);
  const next = new Int32Array(N);
  for (const k of steps) {
    next.set(src);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        let best = src[p], bd = best >= 0 ? d2(p, best) : Infinity;
        for (let dy = -k; dy <= k; dy += k) {
          const Y = y + dy; if (Y < 0 || Y >= H) continue;
          for (let dx = -k; dx <= k; dx += k) {
            const X = x + dx; if (X < 0 || X >= W || (!dx && !dy)) continue;
            const s = src[Y * W + X];
            if (s < 0) continue;
            const d = d2(p, s);
            if (d < bd) { bd = d; best = s; }
          }
        }
        next[p] = best;
      }
    src.set(next);
  }
  for (let p = 0; p < N; p++) if (!have[p] && src[p] >= 0) for (let c = 0; c < ch; c++) data[p * ch + c] = data[src[p] * ch + c];
  return src;
}

/** A 2×2 box-filtered mip chain (Float32, level 0 a copy) of a W×H×ch image, down to 1×1. */
export function mipChain(data, ch, W, H, levels = Infinity) {
  const out = [{ W, H, data: Float32Array.from(data) }];
  while (out.length <= levels && (out.at(-1).W > 1 || out.at(-1).H > 1)) {
    const A = out.at(-1), w = Math.max(1, A.W >> 1), h = Math.max(1, A.H >> 1), d = new Float32Array(w * h * ch);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < ch; c++) {
          let s = 0, n = 0;
          for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const X = Math.min(A.W - 1, x * 2 + i), Y = Math.min(A.H - 1, y * 2 + j); s += A.data[(Y * A.W + X) * ch + c]; n++; }
          d[(y * w + x) * ch + c] = s / n;
        }
    out.push({ W: w, H: h, data: d });
  }
  return out;
}

/** The islands (8-connected components) of a coverage mask: Int32Array id per texel (−1 off), and their boxes. */
export function islands(have, W, H) {
  const id = new Int32Array(W * H).fill(-1), boxes = [], stack = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!have[p0] || id[p0] >= 0) continue;
    const k = boxes.length, b = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
    id[p0] = k; stack.push(p0);
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); b.n++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const q = Y * W + X; if (have[q] && id[q] < 0) { id[q] = k; stack.push(q); }
      }
    }
    boxes.push(b);
  }
  return { id, boxes };
}

/**
 * What the mipmaps make of a filled map at each island's texels (round T1's mip gate): per level k, every `step`-th
 * painted texel samples level k bilinearly at its own UV (the GPU's lookup) in (a) the filled map's box mip chain and
 * (b) the island's own pure chain (its texels only, weighted by coverage: what the level would hold with no gutter and
 * no other island); the difference, in the map's 8-bit units, is what the level borrows from outside the island.
 * Also the share of reads whose footprint reaches a texel nobody painted (`gutterReads`: what the fill must cover).
 * @param data  the map (8-bit or float in 0…255 units; filled or not)   @param have its painted texels (before the fill)
 * @param o { levels, step, channels (which to compare), isl (islands(have) once for several maps) }
 * @returns [{ level, px, p50, p95, p99, max, over4 (share of reads off by > 4), gutterReads, reads }]
 */
export function mipBleed(data, ch, W, H, have, { levels = 6, step = 3, channels = null, isl = null } = {}) {
  const chans = channels ?? Array.from({ length: ch }, (_, i) => i);
  const L = mipChain(data, ch, W, H, levels);
  const cov = mipChain(Float32Array.from(have, (v) => (v ? 1 : 0)), 1, W, H, levels);
  const I = isl ?? islands(have, W, H);
  const out = [];
  // per island: its pure chain over its box (padded to the level's block), coverage-weighted
  const pure = I.boxes.map((b, k) => {
    const pad = 1 << (levels + 1), x0 = Math.max(0, (b.x0 - pad) & ~((1 << levels) - 1)), y0 = Math.max(0, (b.y0 - pad) & ~((1 << levels) - 1));
    const x1 = Math.min(W, b.x1 + pad + 1), y1 = Math.min(H, b.y1 + pad + 1), w = x1 - x0, h = y1 - y0;
    const d = new Float32Array(w * h * (ch + 1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y + y0) * W + x + x0;
      if (I.id[p] !== k) continue;
      for (let c = 0; c < ch; c++) d[(y * w + x) * (ch + 1) + c] = data[p * ch + c];
      d[(y * w + x) * (ch + 1) + ch] = 1;
    }
    // premultiplied by coverage: the chain of sums, divided at lookup
    return { x0, y0, w, h, chain: mipChain(d, ch + 1, w, h, levels) };
  });
  const bil = (A, chN, u, v, c) => {
    const x = u * A.W - 0.5, y = v * A.H - 0.5, X0 = Math.floor(x), Y0 = Math.floor(y), fx = x - X0, fy = y - Y0;
    let s = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const X = Math.min(A.W - 1, Math.max(0, X0 + i)), Y = Math.min(A.H - 1, Math.max(0, Y0 + j));
      s += A.data[(Y * A.W + X) * chN + c] * (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
    }
    return s;
  };
  for (let k = 0; k <= levels && k < L.length; k++) {
    const errs = [];
    let unp = 0, n = 0;
    for (let p = 0; p < W * H; p += step) {
      if (!have[p]) continue;
      const k0 = I.id[p], P = pure[k0], x = p % W, y = (p / W) | 0;
      const u = (x + 0.5) / W, v = (y + 0.5) / H;
      // (the island's local UV in its box's chain at this level)
      const PL = P.chain[k], lu = (x + 0.5 - P.x0) / P.w, lv = (y + 0.5 - P.y0) / P.h;
      const wsum = bil(PL, ch + 1, lu, lv, ch);
      let e = 0;
      for (const c of chans) {
        const a = bil(L[k], ch, u, v, c), b = wsum > 1e-6 ? bil(PL, ch + 1, lu, lv, c) / wsum : a;
        e = Math.max(e, Math.abs(a - b));
      }
      errs.push(e);
      // (a read whose footprint at this level reaches a texel nobody painted: harmless once the gutters are filled)
      if (bil(cov[k], 1, u, v, 0) < 0.999) unp++;
      n++;
    }
    errs.sort((a, b) => a - b);
    const q = (f) => +(errs[Math.min(errs.length - 1, Math.floor(f * errs.length))] ?? 0).toFixed(2);
    out.push({ level: k, px: L[k].W, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +(errs.at(-1) ?? 0).toFixed(2), over4: +(errs.filter((e) => e > 4).length / Math.max(1, errs.length)).toFixed(4), gutterReads: +(unp / Math.max(1, n)).toFixed(4), reads: n });
  }
  return out;
}

/** Linear [0, 1] → sRGB 8-bit. */
export const toSRGB8 = (c) => {
  c = c < 0 ? 0 : c > 1 ? 1 : c;
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
};
/** sRGB hex (#rrggbb) → linear [r, g, b]. */
export const hexLin = (h) => [1, 3, 5].map((i) => {
  const c = parseInt(h.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
