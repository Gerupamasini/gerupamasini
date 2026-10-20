// The トビハゼ's eye globes as tier meshes (build.mjs): eye.mjs's globe (the skin cap and the window with its pupil and
// iris ring) at a tier's ring counts, in the object frame and on the body texture's atlas (fishmesh.mjs BODY_LAYOUT:
// the window into the `iris` rect, the globe's skin into `eyeSkin`, eyeAtlasUV).
//   hero, lod1  one mesh, local to its eye joint (origin = the globe's centre, the joint's pivot), drawn by two nodes:
//               Eye_L under J_eyeL as it is, Eye_R under J_eyeR scaled [−1, 1, 1] (the right globe is the left one's
//               mirror image exactly: eye.mjs builds the right frame as the left's mirror; three.js flips the culling
//               of a mirrored node, and the budget counts the mesh once). The gaze turns these nodes about the globe's
//               centre (rig.mjs AXES.eyes); the joints only translate (the blink's drop, the eyes raised).
//   lod2        both globes placed at rest in the object frame, to be merged into the Body (its material, J_head 255)
// The mesh is split into the skin (drawn with the Body material) and the window's two parts, the pupil and the iris ring
// (the clay round's Cornea and Iris materials; the textures round draws the whole window from the iris rect), each part
// with only the vertices it uses.
import { EYE_MM, toObject, dirToObject } from './anatomy.mjs';
import { eyeGlobe } from './eye.mjs';
import { BODY_LAYOUT, eyeAtlasUV } from './fishmesh.mjs';

/** The ring counts per tier (triangles = 2·nt·np per globe): hero 5,120, lod1 384, lod2 84. */
export const EYE_TIERS = { hero: { nt: 40, np: 64 }, lod1: { nt: 12, np: 16 }, lod2: { nt: 7, np: 6 } };

/** Only the vertices `indices` use, renumbered: { position, normal, uv, indices }. */
function compact(P, N, UV, indices) {
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
  return { position, normal, uv, indices: idx };
}

/**
 * The eye globe for a tier, local to its joint (object frame, metres, origin = the globe's centre).
 * @param o { nt, np (ring counts), side (+1 left, −1 right), layout (BODY_LAYOUT) }
 * @returns { position, normal, uv (body atlas), indices (all), parts: { skin, pupil, iris } (each compacted:
 *   { position, normal, uv, indices }), triangles }
 */
export function eyeMeshForTier({ nt, np, side = 1, layout = BODY_LAYOUT } = {}) {
  const g = eyeGlobe(EYE_MM.radius * 0.001, { nt, np, side });
  const n = g.position.length / 3, position = new Float32Array(n * 3), normal = new Float32Array(n * 3);
  // the globe's frame is the fish frame (s, y, z) about its centre: (s, y, z) → (z, y, −s), a rotation (windings stay)
  for (let i = 0; i < n; i++) {
    position.set(dirToObject([g.position[i * 3], g.position[i * 3 + 1], g.position[i * 3 + 2]]), i * 3);
    normal.set(dirToObject([g.normal[i * 3], g.normal[i * 3 + 1], g.normal[i * 3 + 2]]), i * 3);
  }
  const uv = eyeAtlasUV(g.uv, layout);
  const indices = new Uint32Array(g.skin.length + g.cornea.length);
  indices.set(g.skin); indices.set(g.cornea, g.skin.length);
  const parts = {
    skin: compact(position, normal, uv, g.skin),
    pupil: compact(position, normal, uv, g.pupil),
    iris: compact(position, normal, uv, g.iris),
  };
  return { position, normal, uv, indices, parts, triangles: indices.length / 3 };
}

/**
 * Both globes at rest in the object frame (lod2: merged into the Body): the left mesh and the right one (side −1, its
 * own winding) moved to their centres. Returns [{ position, normal, uv, indices }] (left, right).
 */
export function eyesAtRest({ nt, np, layout = BODY_LAYOUT } = {}) {
  return [1, -1].map((side) => {
    const e = eyeMeshForTier({ nt, np, side, layout });
    const c = toObject([EYE_MM.center[0], EYE_MM.center[1], EYE_MM.center[2] * side]);
    const position = Float32Array.from(e.position);
    for (let i = 0; i < position.length; i += 3) { position[i] += c[0]; position[i + 1] += c[1]; position[i + 2] += c[2]; }
    return { position, normal: e.normal, uv: e.uv, indices: e.indices };
  });
}
