// Texture baking for the トビハゼ tiers. Every map is computed from the fish-frame position under each texel (the
// charts of charts.mjs are projections, so a texel always maps to one place on the fish), which keeps the charts'
// edges seamless and lets every tier bake its own size from the same functions:
//   rasterize()  a mesh's triangles into its UV space: per covered texel the barycentric blend of chosen vertex
//                attributes (position, normal, tangent ...)
//   dilate()     pushes covered texels outward into the gutter, so mipmaps and bilinear filtering never pull in the
//                background at a chart's edge
//   tangentNormals()  the detailed surface normal (from the dense sculpt mesh or the field itself) expressed in a
//                tier mesh's own tangent frame: the normal map that restores what the simplification removed

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
