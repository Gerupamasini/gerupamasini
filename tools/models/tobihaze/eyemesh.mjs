// The トビハゼ's eye globes as tier meshes (build.mjs): eye.mjs's globe (the skin cap and the window with its pupil and
// iris ring) at a tier's ring counts, in the object frame and on the body texture's atlas (fishmesh.mjs BODY_LAYOUT).
//   hero, lod1  one mesh, local to its eye joint (origin = the globe's centre, the joint's pivot), drawn by two nodes:
//               Eye_L under J_eyeL as it is, Eye_R under J_eyeR scaled [−1, 1, 1] (the right globe is the left one's
//               mirror image exactly: eye.mjs builds the right frame as the left's mirror; three.js flips the culling
//               of a mirrored node, and the budget counts the mesh once). The gaze turns these nodes about the globe's
//               centre (rig.mjs AXES.eyes); the joints only translate (the blink's drop, the eyes raised).
//   lod2        both globes placed at rest in the object frame, to be merged into the Body (its material, J_head 255)
// The mesh is split into the skin (drawn with the Body material) and the window (the clay round's Cornea and Iris
// materials as its two parts, the pupil and the iris ring; `window` is the two as one primitive for a tier that draws
// the whole window from the iris rect). Each part has only the vertices it uses and its own UVs: the skin's all in the
// `eyeSkin` rect (its rim, the window's edge, on the rect's top row), the window's in the `iris` rect, so the ring the
// two share is two rings of vertices and no triangle reaches across the gutter between the rects. Each part carries
// per-vertex tangents (tiers.vertexTangents: the skin is drawn with the Body material and its normal map).
import { EYE_MM, toObject, dirToObject } from './anatomy.mjs';
import { eyeGlobe } from './eye.mjs';
import { BODY_LAYOUT } from './fishmesh.mjs';
import { vertexTangents } from './tiers.mjs';

/** The ring counts per tier (triangles = 2·nt·np per globe): hero 5,120, lod1 384, lod2 112 (8 columns: an octagon from
 * every side, where B1's 6 showed a hexagon in the far renders). */
export const EYE_TIERS = { hero: { nt: 40, np: 64 }, lod1: { nt: 12, np: 16 }, lod2: { nt: 7, np: 8 } };

/** eyeGlobe's uv (u = azimuth / 2π, v = ρ / 2: the window v ≤ 0.5, the skin 0.5 … 1) on the atlas: `part` 'window' maps
 * v ∈ [0, 0.5] onto the iris rect, 'skin' maps v ∈ [0.5, 1] onto the eyeSkin rect (v clamped into the part's range). */
export function eyePartUV(uv, part, layout = BODY_LAYOUT) {
  const out = new Float32Array(uv.length), R = part === 'skin' ? layout.eyeSkin : layout.iris;
  for (let i = 0; i < uv.length / 2; i++) {
    const v = uv[i * 2 + 1], t = part === 'skin' ? Math.max(0, Math.min(1, (v - 0.5) / 0.5)) : Math.max(0, Math.min(1, v / 0.5));
    out[i * 2] = R[0] + uv[i * 2] * (R[2] - R[0]);
    out[i * 2 + 1] = R[1] + t * (R[3] - R[1]);
  }
  return out;
}

/** Only the vertices `indices` use, renumbered: { position, normal, uv, indices, tangent? }. */
function compact(P, N, UV, indices, { tangents = true } = {}) {
  const map = new Map(), idx = new Uint32Array(indices.length), order = [];
  for (let i = 0; i < indices.length; i++) {
    let j = map.get(indices[i]);
    if (j === undefined) { j = order.length; map.set(indices[i], j); order.push(indices[i]); }
    idx[i] = j;
  }
  const n = order.length, position = new Float32Array(n * 3), normal = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  order.forEach((v, j) => {
    position.set(P.subarray(v * 3, v * 3 + 3), j * 3);
    normal.set(N.subarray(v * 3, v * 3 + 3), j * 3);
    uv.set(UV.subarray(v * 2, v * 2 + 2), j * 2);
  });
  const part = { position, normal, uv, indices: idx };
  if (!tangents || !idx.length) return part;
  // (MeshoptTangents must be ready: fishmesh / tiers `ready`, which build.mjs awaits before it builds a tier)
  const t = vertexTangents(part);
  return { ...t.mesh, tangent: t.tangent };
}

/**
 * The eye globe for a tier, local to its joint (object frame, metres, origin = the globe's centre).
 * @param o { nt, np (ring counts), side (+1 left, −1 right), layout (BODY_LAYOUT), tangents (true) }
 * @returns { parts: { skin, window, pupil, iris } (each compacted with its own UVs and tangents: { position, normal,
 *   uv, indices, tangent }), triangles, and for the older callers position / normal / indices (all) with uv (the
 *   window's rings in the iris rect, the skin's in eyeSkin: the boundary ring in the iris rect) }
 */
export function eyeMeshForTier({ nt, np, side = 1, layout = BODY_LAYOUT, tangents = true } = {}) {
  const g = eyeGlobe(EYE_MM.radius * 0.001, { nt, np, side });
  const n = g.position.length / 3, position = new Float32Array(n * 3), normal = new Float32Array(n * 3);
  // the globe's frame is the fish frame (s, y, z) about its centre: (s, y, z) → (z, y, −s), a rotation (windings stay)
  for (let i = 0; i < n; i++) {
    position.set(dirToObject([g.position[i * 3], g.position[i * 3 + 1], g.position[i * 3 + 2]]), i * 3);
    normal.set(dirToObject([g.normal[i * 3], g.normal[i * 3 + 1], g.normal[i * 3 + 2]]), i * 3);
  }
  const uvSkin = eyePartUV(g.uv, 'skin', layout), uvWin = eyePartUV(g.uv, 'window', layout);
  const uv = Float32Array.from(g.uv, (_, i) => (g.uv[(i | 1)] <= 0.5 ? uvWin[i] : uvSkin[i]));
  const indices = new Uint32Array(g.skin.length + g.cornea.length);
  indices.set(g.skin); indices.set(g.cornea, g.skin.length);
  const o = { tangents };
  const parts = {
    skin: compact(position, normal, uvSkin, g.skin, o),
    window: compact(position, normal, uvWin, g.cornea, o),
    pupil: compact(position, normal, uvWin, g.pupil, o),
    iris: compact(position, normal, uvWin, g.iris, o),
  };
  return { position, normal, uv, indices, parts, triangles: indices.length / 3 };
}

/**
 * Both globes at rest in the object frame (lod2: merged into the Body): per side the skin part (its uv in eyeSkin) and
 * the window (in the iris rect) as one mesh with separate vertices on their shared ring, moved to the globe's centre
 * (the right globe built with side −1, its own winding). Returns [{ position, normal, uv, indices }] (left, right).
 */
export function eyesAtRest({ nt, np, layout = BODY_LAYOUT } = {}) {
  return [1, -1].map((side) => {
    const e = eyeMeshForTier({ nt, np, side, layout, tangents: false });
    const c = toObject([EYE_MM.center[0], EYE_MM.center[1], EYE_MM.center[2] * side]);
    const A = e.parts.skin, B = e.parts.window, na = A.position.length / 3, nb = B.position.length / 3;
    const position = new Float32Array((na + nb) * 3), normal = new Float32Array((na + nb) * 3), uv = new Float32Array((na + nb) * 2);
    position.set(A.position); position.set(B.position, na * 3);
    normal.set(A.normal); normal.set(B.normal, na * 3);
    uv.set(A.uv); uv.set(B.uv, na * 2);
    for (let i = 0; i < position.length; i += 3) { position[i] += c[0]; position[i + 1] += c[1]; position[i + 2] += c[2]; }
    const indices = new Uint32Array(A.indices.length + B.indices.length);
    indices.set(A.indices); for (let i = 0; i < B.indices.length; i++) indices[A.indices.length + i] = B.indices[i] + na;
    return { position, normal, uv, indices, parts: { skin: [0, A.indices.length / 3], window: [A.indices.length / 3, B.indices.length / 3] } };
  });
}
