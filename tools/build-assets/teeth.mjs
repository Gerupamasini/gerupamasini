// Small conical teeth along the lower jaw (dentary) and the maxilla, inside the lip line. Pure data; weights: lower-jaw teeth follow jaw_lower via _JAW = 1.
// Evidence: transparent skeleton images k04/k05 show a serrated row of small pale teeth along the dentary, ~8-12 per side (count not resolvable)
// [docs/yamame/photo_analysis/skeleton_new_summary.json: head.teeth]. Size and recurvature are [E] (salmonid teeth are ~0.5-1 mm, slightly recurved). Maxillary row, vomerine and tongue teeth are not resolvable in the images -> only a short maxillary row is added [E].
const TAU = Math.PI * 2;

function cone(out, c, dir, up, len, rad, sides = 5, bend = 0.25) {
  // c: base centre; dir: tooth axis (unit); up: a vector not parallel to dir. A cone with its tip bent slightly backwards (-x) for recurvature.
  const side = [dir[1] * up[2] - dir[2] * up[1], dir[2] * up[0] - dir[0] * up[2], dir[0] * up[1] - dir[1] * up[0]];
  const sl = Math.hypot(...side) || 1; const sx = side.map((v) => v / sl);
  const up2 = [sx[1] * dir[2] - sx[2] * dir[1], sx[2] * dir[0] - sx[0] * dir[2], sx[0] * dir[1] - sx[1] * dir[0]];
  const base = out.positions.length / 3;
  const tip = [c[0] + dir[0] * len - bend * len, c[1] + dir[1] * len, c[2] + dir[2] * len];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const p = [c[0] + rad * (ca * sx[0] + sa * up2[0]), c[1] + rad * (ca * sx[1] + sa * up2[1]), c[2] + rad * (ca * sx[2] + sa * up2[2])];
    const n = [ca * sx[0] + sa * up2[0] + 0.5 * dir[0], ca * sx[1] + sa * up2[1] + 0.5 * dir[1], ca * sx[2] + sa * up2[2] + 0.5 * dir[2]]; const nl = Math.hypot(...n);
    out.positions.push(...p); out.normals.push(n[0] / nl, n[1] / nl, n[2] / nl); out.uvs.push(k / sides, 0); out.jaw.push(out.curJaw);
  }
  out.positions.push(...tip); out.normals.push(dir[0], dir[1], dir[2]); out.uvs.push(0.5, 1); out.jaw.push(out.curJaw);
  const t = base + sides;
  for (let k = 0; k < sides; k++) out.indices.push(base + k, base + (k + 1) % sides, t);
}

/**
 * lips: body.mouth.lips (per mouth loop: x, y = lip height, zR, zL); cornerX: x of the mouth corner.
 * Returns { positions, normals, uvs, indices, attrs: { _JAW } } in body coordinates.
 */
export function buildTeeth({ lips, SL = 0.19, nDentary = 14, nMaxilla = 12, nPremax = 4, seed = 1 }) {
  const out = { positions: [], normals: [], uvs: [], indices: [], jaw: [], curJaw: 1 };
  const usable = lips.filter((l) => l.shrink >= 0.999);                       // rings between the snout and the corner (not the throat taper)
  if (usable.length < 4) return null;
  const x0 = usable[1].x, x1 = usable[usable.length - 1].x;                    // from just behind the lip tip to the corner
  const at = (t) => { const x = x0 + (x1 - x0) * t; let i = 0; while (i < usable.length - 2 && usable[i + 1].x > x) i++;
    const a = usable[i], b = usable[i + 1], f = Math.min(1, Math.max(0, (a.x - x) / (a.x - b.x || 1))); return { x, y: a.y + (b.y - a.y) * f, zR: a.zR + (b.zR - a.zR) * f, zL: a.zL + (b.zL - a.zL) * f }; };
  let rs = (seed * 9301 + 49297) % 233280; const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);
  const len = 0.0011, rad = 0.0002;
  // dentary: follows the lower jaw (_JAW = 1), tips point up and slightly forward-inward; recurved backwards.  Salmonid dentary teeth are a single row of ~10-15 per side.
  out.curJaw = 1;
  for (let k = 0; k < nDentary; k++) for (const side of [1, -1]) {
    const t = (k + 0.5 + 0.25 * (rnd() - 0.5)) / nDentary * 0.94, p = at(t), z = side > 0 ? p.zR : p.zL, inward = -Math.sign(z) * 0.0006 * (0.6 + 0.4 * (1 - t));
    cone(out, [p.x, p.y - 0.0001, z + inward], [0.1, 1, -Math.sign(z) * 0.25], [1, 0, 0], len * (0.75 + 0.5 * rnd()) * (1 - 0.25 * t), rad * (0.9 + 0.2 * rnd()));
  }
  // maxilla (upper jaw, static): a row along its whole length, tips pointing down; premaxilla: a few at the very front
  out.curJaw = 0;
  for (let k = 0; k < nMaxilla; k++) for (const side of [1, -1]) {
    const t = 0.16 + (k + 0.5 + 0.25 * (rnd() - 0.5)) / nMaxilla * 0.78, p = at(t), z = side > 0 ? p.zR : p.zL, inward = -Math.sign(z) * 0.0007;
    cone(out, [p.x, p.y + 0.0001, z + inward], [0.1, -1, -Math.sign(z) * 0.2], [1, 0, 0], len * 0.8 * (0.8 + 0.4 * rnd()) * (1 - 0.3 * t), rad * 0.9);
  }
  for (let k = 0; k < nPremax; k++) for (const side of [1, -1]) {
    const t = 0.02 + (k + 0.5) / nPremax * 0.13, p = at(t), z = side > 0 ? p.zR : p.zL, inward = -Math.sign(z) * 0.0005;
    cone(out, [p.x, p.y + 0.0001, z + inward], [0.15, -1, -Math.sign(z) * 0.15], [1, 0, 0], len * 0.9 * (0.8 + 0.4 * rnd()), rad);
  }
  // vomerine patch on the roof and tongue teeth on the floor, a few small teeth on the midline (static / jaw-following), pointing inward
  const mid = at(0.55);
  out.curJaw = 0; for (let k = 0; k < 3; k++) cone(out, [mid.x - k * 0.0006, mid.y + 0.0022, (rnd() - 0.5) * 0.0006], [0.05, -1, 0], [1, 0, 0], len * 0.55, rad * 0.8);
  out.curJaw = 1; for (let k = 0; k < 3; k++) cone(out, [mid.x - k * 0.0006 - 0.0006, mid.y - 0.0024, (rnd() - 0.5) * 0.0006], [0.05, 1, 0], [1, 0, 0], len * 0.55, rad * 0.8);
  return { positions: Float32Array.from(out.positions), normals: Float32Array.from(out.normals), uvs: Float32Array.from(out.uvs), indices: Uint32Array.from(out.indices), attrs: { _JAW: Float32Array.from(out.jaw) } };
}
