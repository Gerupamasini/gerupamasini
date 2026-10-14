// Shared steps of the goby GLB builders (エドハゼ, ヒメハゼ; the マハゼ pipeline's copies) that make each detail level
// fit the creatures' model budget (tools/models/budget.json, docs/quality/model-budget.md):
//   - the fin atlas painted once at 2048 and box-filtered down to the tier's size, with the eye's iris in its free
//     corner (so the eyes need no image of their own)
//   - the far tier's (lod2) alpha-tested fins: an alpha that keeps the membranes instead of a few dark specks
//   - the far tier's lighter skeleton (the head-detail joints dropped, their weights handed to the head) and one
//     merged mesh for the fins and the eyes, posed at rest (fins at their resting fold, pectorals planted)
// Everything here is plain arrays in, plain arrays out: the builders keep their own shapes and rigs.

/** 2× box filter of an interleaved image. */
export function downsample2(w, h, ch, data) {
  const W = w >> 1, H = h >> 1;
  const out = new Uint8Array(W * H * ch);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let c = 0; c < ch; c++) {
        const i = (a, b) => data[((y * 2 + b) * w + x * 2 + a) * ch + c];
        out[(y * W + x) * ch + c] = (i(0, 0) + i(1, 0) + i(0, 1) + i(1, 1) + 2) >> 2;
      }
  return { w: W, h: H, data: out };
}

/**
 * Soften channels `chans` of an interleaved `ch`-channel w × h image by a [1 2 1] / 4 kernel, wrapping round the body
 * in v and clamped along it in u (in place). The distance tiers' melanophores: single-texel speckle is below what those
 * tiers show (they are drawn from the smaller mipmaps), and three channels of it do not survive the block compression
 * (tools/models/pack: PSNR ≥ 30 dB). As the packed maps of the earlier distance tiers did (tools/lib/gobyLod.mjs).
 */
export function softenChannels(data, w, h, ch, chans) {
  const tmp = new Float32Array(w * h);
  for (const c of chans) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1);
        tmp[y * w + x] = (data[(y * w + xm) * ch + c] + 2 * data[(y * w + x) * ch + c] + data[(y * w + xp) * ch + c]) / 4;
      }
    for (let y = 0; y < h; y++) {
      const ym = (y - 1 + h) % h, yp = (y + 1) % h;
      for (let x = 0; x < w; x++) data[(y * w + x) * ch + c] = Math.round((tmp[ym * w + x] + 2 * tmp[y * w + x] + tmp[yp * w + x]) / 4);
    }
  }
  return data;
}

/** Repeated 2× box filter down to `size` (square images). */
export function shrinkSquare(size, ch, data, target) {
  let s = size, d = data;
  while (s > target) { const r = downsample2(s, s, ch, d); s = r.w; d = r.data; }
  return d;
}

/** Interleave an RGB image and one channel of another image (same size) into RGBA. */
export function withAlpha(rgb, src, srcCh, srcC, n) {
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = rgb[i * 3];
    out[i * 4 + 1] = rgb[i * 3 + 1];
    out[i * 4 + 2] = rgb[i * 3 + 2];
    out[i * 4 + 3] = src[i * srcCh + srcC];
  }
  return out;
}

/**
 * The square in the fin atlas (2048-pixel units) the eye's iris goes into: the corner no fin uses
 * (x 1024–2048, y 1536–2048 holds nothing in the goby atlases), inset so its filtering never meets a fin.
 */
export const IRIS_RECT_2048 = { x: 1040, y: 1552, w: 480, h: 480 };

/**
 * The fin atlas of one tier: the iris painted into its corner, then the atlas filtered down to `size`.
 * `atlas` is paintFinAtlas()'s 2048² result ({ size, color RGBA, normal RGB, data RGBA }); `iris` paintIris()'s
 * ({ size, rgb }). Returns the atlas at `size` and the iris rectangle in UV units [u, v, w, h].
 */
export function finAtlasForTier(atlas, iris, size) {
  const S = atlas.size, R = IRIS_RECT_2048;
  const color = atlas.color.slice(), normal = atlas.normal.slice(), data = atlas.data.slice();
  // the iris, resampled (bilinear) into the rectangle; opaque, flat normal, full coverage
  for (let y = 0; y < R.h; y++)
    for (let x = 0; x < R.w; x++) {
      const u = ((x + 0.5) / R.w) * iris.size - 0.5, v = ((y + 0.5) / R.h) * iris.size - 0.5;
      const x0 = Math.max(0, Math.min(iris.size - 1, Math.floor(u))), y0 = Math.max(0, Math.min(iris.size - 1, Math.floor(v)));
      const x1 = Math.min(iris.size - 1, x0 + 1), y1 = Math.min(iris.size - 1, y0 + 1);
      const fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
      const o = ((R.y + y) * S + R.x + x);
      for (let c = 0; c < 3; c++) {
        const p = (xx, yy) => iris.rgb[(yy * iris.size + xx) * 3 + c];
        color[o * 4 + c] = Math.round((p(x0, y0) * (1 - fx) + p(x1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x1, y1) * fx) * fy);
      }
      color[o * 4 + 3] = 255;
      normal[o * 3] = 128; normal[o * 3 + 1] = 128; normal[o * 3 + 2] = 255;
      data[o * 4] = 0; data[o * 4 + 1] = 0; data[o * 4 + 2] = 0; data[o * 4 + 3] = 255;
    }
  // a one-pixel ring of the iris' own border colour round the rectangle, so the filtered tiers keep its edge clean
  for (let y = -8; y < R.h + 8; y++)
    for (let x = -8; x < R.w + 8; x++) {
      if (x >= 0 && y >= 0 && x < R.w && y < R.h) continue;
      const cx = Math.max(0, Math.min(R.w - 1, x)), cy = Math.max(0, Math.min(R.h - 1, y));
      const o = (R.y + y) * S + R.x + x, q = (R.y + cy) * S + R.x + cx;
      if (color[o * 4 + 3] !== 0) continue; // a fin is there (never, in the goby atlases)
      for (let c = 0; c < 3; c++) color[o * 4 + c] = color[q * 4 + c];
    }
  return {
    size,
    color: shrinkSquare(S, 4, color, size),
    normal: shrinkSquare(S, 3, normal, size),
    data: shrinkSquare(S, 4, data, size),
    irisRect: [R.x / S, R.y / S, R.w / S, R.h / S],
  };
}

/**
 * Alpha for alpha-tested (MASK) fins: the blended tiers' alpha is coverage × opacity and the membranes' opacity is
 * mostly under 0.5, so a 0.5 cutoff left only specks of the fins. Here the membrane counts as there wherever it is
 * at least faintly pigmented or rayed (opacity × k ≥ the cutoff), and the fin's outline stays its coverage.
 */
export function maskFinAlpha(color, data, n, k = 2.5) {
  const out = color.slice();
  for (let i = 0; i < n; i++) out[i * 4 + 3] = Math.min(data[i * 4 + 3], Math.round(color[i * 4 + 3] * k));
  return out;
}

/** Map eye UVs (the iris disc over [0, 1]²) into the atlas rectangle [u, v, w, h]. */
export function remapUV(uv, rect) {
  const out = new Float32Array(uv.length);
  for (let i = 0; i < uv.length; i += 2) {
    out[i] = rect[0] + uv[i] * rect[2];
    out[i + 1] = rect[1] + uv[i + 1] * rect[3];
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ skeleton

/** The far tier keeps the axial chain (every contact bone) and the pelvic disc: 12 joints. */
export const LOD2_JOINTS = ['J_root', 'J_head', 'J_pelvic', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal', 'J_caudal2'];

/**
 * A reduced skeleton: `joints` ({ name, parent, obj }[] in the builder's order) and the names to keep. Returns the
 * kept joints (builder order), and for every original joint index the kept joint that takes its weights: itself, or
 * its nearest kept ancestor.
 */
export function reduceSkeleton(joints, keepNames) {
  const keep = new Set(keepNames);
  const byName = Object.fromEntries(joints.map((j, i) => [j.name, i]));
  const kept = joints.filter((j) => keep.has(j.name));
  const newIndex = Object.fromEntries(kept.map((j, i) => [j.name, i]));
  const remap = joints.map((j) => {
    let k = j;
    while (k && !keep.has(k.name)) k = k.parent ? joints[byName[k.parent]] : null;
    if (!k) throw new Error(`reduceSkeleton: ${j.name} has no kept ancestor`);
    return newIndex[k.name];
  });
  // a kept joint's parent must be kept too (the reduced hierarchy is the original one, pruned)
  for (const j of kept) if (j.parent && !keep.has(j.parent)) throw new Error(`reduceSkeleton: parent ${j.parent} of ${j.name} is dropped`);
  return { kept, remap };
}

/** Re-point packed skin weights (uint8 joints / weights, 4 per vertex) at a reduced skeleton, merging duplicates. */
export function remapSkin({ joints, weights }, remap) {
  const n = joints.length / 4;
  const oj = new Uint8Array(n * 4), ow = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const acc = new Map();
    for (let k = 0; k < 4; k++) {
      const w = weights[i * 4 + k];
      if (!w) continue;
      const j = remap[joints[i * 4 + k]];
      acc.set(j, (acc.get(j) || 0) + w);
    }
    const arr = [...acc.entries()].sort((a, b) => b[1] - a[1]);
    const sum = arr.reduce((a, [, w]) => a + w, 0) || 1;
    const q = arr.map(([, w]) => Math.round((w / sum) * 255));
    q[0] += 255 - q.reduce((a, b) => a + b, 0);
    arr.forEach(([j], k) => { oj[i * 4 + k] = j; ow[i * 4 + k] = q[k]; });
  }
  return { joints: oj, weights: ow };
}

// ------------------------------------------------------------------------------------------------ rest pose

/** v rotated by the unit quaternion q = [x, y, z, w] (v + 2w(q×v) + 2 q×(q×v)) */
const qrot = (q, v) => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};

/** Smooth vertex normals of an indexed triangle mesh (area-weighted). */
export function vertexNormals(position, indices) {
  const n = new Float32Array(position.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { n[i] += nx; n[i + 1] += ny; n[i + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/**
 * A fin mesh posed at rest, in the bind frame: its morph targets applied at the rest pose's weights, and, for a fin
 * on its own joint (the pectorals), that joint's rest rotation applied by its skin weight (linear blend, the rest of the
 * skeleton being at its bind pose at rest). `mesh` is buildFinMesh()'s; `targets` buildFinTargets()'s (object-space
 * deltas, in `weights` order); `skin` the fin's packed weights in the full skeleton; `joint` { index, pivot (object m),
 * q (local rotation) } or null.
 */
export function restFin(mesh, targets, weights, skin, joint) {
  const p = mesh.position.slice();
  targets.forEach((d, k) => {
    const w = weights[k] || 0;
    if (w) for (let i = 0; i < p.length; i++) p[i] += w * d[i];
  });
  if (joint) {
    const n = p.length / 3;
    for (let i = 0; i < n; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (skin.joints[i * 4 + k] === joint.index) w += skin.weights[i * 4 + k] / 255;
      if (!w) continue;
      const v = [p[i * 3] - joint.pivot[0], p[i * 3 + 1] - joint.pivot[1], p[i * 3 + 2] - joint.pivot[2]];
      const r = qrot(joint.q, v);
      for (let c = 0; c < 3; c++) p[i * 3 + c] += w * (r[c] - v[c]);
    }
  }
  return p;
}

/** An eye mesh (eye frame) placed on its joint at bind: p = joint + offset + rotation · v. */
export function placeEye(eye, joint, rotation, offset = [0, 0, 0]) {
  const n = eye.position.length / 3;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = qrot(rotation, [eye.position[i * 3], eye.position[i * 3 + 1], eye.position[i * 3 + 2]]);
    const nn = qrot(rotation, [eye.normal[i * 3], eye.normal[i * 3 + 1], eye.normal[i * 3 + 2]]);
    for (let c = 0; c < 3; c++) { position[i * 3 + c] = joint[c] + offset[c] + v[c]; normal[i * 3 + c] = nn[c]; }
  }
  return { position, normal };
}

/**
 * One mesh from parts { position, normal, uv, indices, joints, weights } (skins already in the same skeleton).
 * Indices become 16-bit when they fit.
 */
export function mergeParts(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.position.length / 3; ni += p.indices.length; }
  const position = new Float32Array(nv * 3), normal = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const joints = new Uint8Array(nv * 4), weights = new Uint8Array(nv * 4);
  const indices = nv < 65536 ? new Uint16Array(ni) : new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    const n = p.position.length / 3;
    position.set(p.position, ov * 3); normal.set(p.normal, ov * 3); uv.set(p.uv, ov * 2);
    joints.set(p.joints, ov * 4); weights.set(p.weights, ov * 4);
    for (let i = 0; i < p.indices.length; i++) indices[oi + i] = p.indices[i] + ov;
    ov += n; oi += p.indices.length;
  }
  return { position, normal, uv, joints, weights, indices };
}

/** 16-bit indices where they fit (every lighter tier), else the original array. */
export function compactIndices(indices, vertexCount) {
  return vertexCount < 65536 ? Uint16Array.from(indices) : indices;
}
