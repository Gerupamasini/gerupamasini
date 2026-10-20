// The head's sculpt for the coarser tiers. A cell of lod1 (0.16 mm) or lod2 (0.40 mm) cannot resolve the gape's slit
// (0.01 HL = 0.16 mm), the gill pocket (0.007 HL), the nostril's hole or the eye cup's thin bead (0.004–0.02 HL): meshed
// as they are they give ragged holes, non-manifold edges and the mouth cavity as a closed shell inside the head. These
// copies close them, so each coarse tier's surface nets are one manifold skin of genus 0 (the rig still classifies the
// lips and the gill flap with the unsealed HEAD_SCULPT and its parts: headrig.gapeSide reads K.gape.half).
//   sealSculpt(K)  lod1: the slit closed (the lower jaw's tissue overlaps the upper head by `overlap` instead of being
//                  carved back from it), no mouth cavity or tongue, no gill pocket or chamber, the nostrils' holes and
//                  the pore filled; the pads blended into the face over `soften` (the labial groove, 0.004 HL wide, goes
//                  with it); the socket and the cup's bead moved in by `cupGap`, so the bead's thin ends (0.004 HL behind
//                  and in front of the globe) and the socket's lining lie inside the globe, where the tier drops them
//   farSculpt(K)   lod2: sealed, and what a 0.40 mm cell cannot hold smoothed away (headrig.smoothSculpt's rule: the
//                  pads, the labial groove, the rictal fold and its crease, the gill cover's step; the nostril tube; the
//                  infraorbital crease), the cup's bead 0.04 HL thick all round and moved in by 0.012 HL
//   sealedFishSDF(o) / sealedFishSDFmm(HLmm, o)  the whole fish over the sealed (or far) head, with the pads fused onto
//                  the lower jaw under them (the field the coarse tiers mesh)
// Acceptance (shots-uv.mjs seal): the raw surface nets one component with no non-manifold edge in the gape box
// (s < 0.4, y < 0.2 HL) at h 0.16 and 0.40 mm; measured on the BODY_BOX grid, raw → the tier's dense skin
// (fishmesh.fishDense: the globes' insides dropped, the holes they leave capped):
//   HEAD_SCULPT  0.16: 2 shells, 113 nm (52 in the gape box) → 68 nm      0.40: 41 nm (18) → 43 nm
//   lod1 field   0.16: 1 shell, 40 nm (0) → 0 nm, χ 2 (genus 0)            0.40: 22 nm (0) → 7 nm (at the cups)
//   lod2 field   0.16: 1 shell, 51 nm (0) → 0 nm, χ 2                      0.40: 16 nm (0) → 0 nm, χ 2
// (the raw non-manifold edges of the sealed fields all lie inside the globes, where the skin is dropped)
import { HEAD_SCULPT } from './head.mjs';
import { BODY_SCULPT, fishSDF } from './body.mjs';
import { smin, smoothstep } from './sdf.mjs';

/** Defaults of the sealed (lod1) and far (lod2) sculpts (HL). */
export const SEAL = {
  seal: { overlap: 0.004, soften: 0.01, cupGap: -0.008, fuse: 0.025 },
  far: { overlap: 0.004, cupGap: -0.012, cupThick: 0.04, fuse: 0.025 },
};

/** The slit, the mouth cavity, the gill pocket and the nostrils' holes closed (lod1). */
export function sealSculpt(K = HEAD_SCULPT, o = {}) {
  // (minimal: only the openings closed (the slit, the cavity, the gill pocket, the nostrils' holes), the rest of the
  // sculpt as it is: the field that tells the hero's slit walls and pockets from its outer skin)
  o = o.minimal ? { overlap: SEAL.seal.overlap, nostril: true, ...o } : { ...SEAL.seal, ...o };
  const S = structuredClone(K);
  // (overlap: a negative half-width, so the lower jaw's tissue reaches 2·overlap into the upper head and the two meet
  // as one solid instead of touching along a zero crease the cells could open)
  const ov = -o.overlap;
  const G = S.gape;
  S.gape = { ...G, half: ov, ...(G.front ? { front: { ...G.front, half: ov } } : {}), ...(G.back ? { back: { ...G.back, half: ov } } : {}) };
  const none = { c: [9, 9, 9], r: [1e-3, 1e-3, 1e-3] };
  S.cavity = { front: none, mid: none, back: none, blend: 0 };
  S.tongue = { ...none };
  S.gillSlit = { ...S.gillSlit, y0: 9, y1: -9 };
  S.gillChamber = null;
  // (a sphere of negative radius subtracts nothing, not even the smooth subtraction's dimple; the anterior nostril's
  // tube, 0.1 mm thick, is under a cell: off unless o.nostril)
  S.nostril = { ...S.nostril, hole: -0.01, ...(o.nostril ? {} : { r: S.nostril.r.map(() => 1e-4) }) };
  S.nostrilPost = { ...S.nostrilPost, r: -0.01 };
  // (soften: k — the pads blended into the face over k everywhere: the rictal web's rule (head.mjs pad.web) extended
  // over the whole pad, which also turns the labial groove off; 0 keeps the pads as they are)
  if (o.soften) S.pad = { ...S.pad, web: { s: [-1, -0.9], y: [8, 9], k: o.soften } };
  // (groove: false — only the labial groove off)
  if (o.groove === false) S.pad = { ...S.pad, seam: { ...S.pad.seam, z: [9, 10] } };
  // (cupGap: the socket's radius and the bead's base, re + gap: negative, their thin parts lie inside the globe)
  if (o.cupGap !== undefined) S.cup = { ...S.cup, gap: o.cupGap };
  // (cupThick: the bead's thickness, the same all round (no taper))
  if (o.cupThick !== undefined) S.cup = { ...S.cup, thick: o.cupThick, ...(S.cup.taper ? { taper: { ...S.cup.taper, thickMin: 1, roundMax: S.cup.round } } : {}) };
  // (crease: false — the infraorbital crease under the collar off)
  if (o.crease === false) S.cup = { ...S.cup, crease: { ...S.cup.crease, back: [-1, -0.9] } };
  return S;
}

/** Sealed, the fine features a 0.40 mm cell cannot resolve smoothed away, the cup's bead thickened (lod2). */
export function farSculpt(K = HEAD_SCULPT, o = {}) {
  o = { ...SEAL.far, ...o };
  const S = sealSculpt(K, { ...o, soften: 0, crease: false });
  // (headrig.smoothSculpt: the gill margin's fold and the cover's step, the pads, the labial groove, the rictal fold
  // and crease; the snout's sheath over the pads stays: it is the face's own skin)
  S.opercle = { ...S.opercle, radius: S.opercle.radius.map(() => 0), ...(S.opercle.cover ? { cover: { ...S.opercle.cover, t: 0 } } : {}) };
  S.blend = { ...S.blend, fold: 0, groove: 0 };
  S.pad = { ...S.pad, radius: S.pad.radius.map(() => 1e-4), median: { ...S.pad.median, radius: S.pad.median.radius.map(() => 1e-4), blend: 0 }, seam: { ...S.pad.seam, r: 0, k: 0, z: [9, 10] }, web: undefined };
  S.rictal = { ...S.rictal, r: [1e-4, 1e-4, 1e-4], blend: 0 };
  S.rictalCrease = { ...S.rictalCrease, radius: S.rictalCrease.radius.map(() => 0), ...(S.rictalCrease.soft ? { soft: { ...S.rictalCrease.soft, depth: S.rictalCrease.soft.depth.map(() => 0) } } : {}) };
  // the nostril's tube (0.1 mm thick) is under a cell
  S.nostril = { ...S.nostril, r: S.nostril.r.map(() => 1e-4), hole: -0.01 };
  return S;
}

/**
 * The whole fish's field for a coarse tier (HL): fishSDF over the sealed (or far) head, with the upper lip's pads fused
 * onto the lower jaw under them. The pads overhang the jaw (the upper lip overlaps it when the mouth is shut) and
 * touch its side along a line from the median lip back to the rictus, with a hairline gap (0.002–0.012 HL) between
 * them that a 0.16 mm cell meshes as non-manifold edges; below the gape's line (and only there, so the closed mouth's
 * crease stays) the upper head and the jaw's tissue are united with a smooth minimum over `fuse` HL.
 * @param o { far: the lod2 sculpt, fuse (HL), K (body), H (head sculpt, unsealed), and sealSculpt's options }
 * @returns f(x, y, z) HL with .head, .cup, .parts of fishSDF and .sculpt (the sealed head sculpt)
 */
export function sealedFishSDF({ far = false, K = BODY_SCULPT, H = HEAD_SCULPT, ...o } = {}) {
  const fuse = o.minimal ? 0 : o.fuse ?? (far ? SEAL.far : SEAL.seal).fuse;
  const S = far ? farSculpt(H, o) : sealSculpt(H, o);
  const f = fishSDF(K, S), head = f.head, G = S.gape;
  const gY = (x) => G.yFront + (G.yBack - G.yFront) * smoothstep(0.03, G.rictus, x);
  const g = (x, y, z) => {
    const d = f(x, y, z);
    if (!(fuse > 0) || x < 0.06 || x > 0.42 || y < 0 || y > 0.14) return d;
    const w = (1 - smoothstep(gY(x) - 0.015, gY(x) - 0.004, y)) * smoothstep(0.06, 0.1, x) * (1 - smoothstep(0.36, 0.42, x));
    if (w <= 0) return d;
    const p = head.parts(x, y, z);
    return Math.min(d, smin(p.f, p.j, fuse * w));
  };
  g.head = f.head; g.cup = f.cup; g.parts = f.parts; g.sculpt = S;
  return g;
}

/** sealedFishSDF in fish mm for a head length of HLmm (.hl: the field in HL). */
export function sealedFishSDFmm(HLmm, o = {}) {
  const f = sealedFishSDF(o), k = 1 / HLmm;
  const g = (x, y, z) => f(x * k, y * k, z * k) * HLmm;
  g.hl = f;
  return g;
}
