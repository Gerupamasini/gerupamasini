// Feather layout of the LEFT wing, the tail and the scapulars in the bind pose (mm, bird-local).
// Wing is authored spread flat (bind pose); folding is done by bone rotations (animator).
// Evidence: 10 primaries (Charadriiformes), long white wing-bar formed by white tips of greater
// coverts and white bases of remiges (S7, S27), white outer tail feathers (S7, S27).
// Bone lengths of the arm are D (derived) — see docs/validation.md "wingspan" note.

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const deg = Math.PI / 180;

export const WING = {
  shoulder: [7.5, 63.5, 21],
  humerus: [10, 64, 20],
  elbow: [45, 64, 15.5], // humerus 35.4 mm
  wrist: [89, 64, 21.5], // forearm (ulna) 44.4 mm
  handTip: [115, 64, 17.5], // carpometacarpus + digits 26.3 mm
};

// Direction in the wing plane: angle measured from +X (distal) toward −Z (trailing edge).
const dirFromAngle = (a) => [Math.cos(a * deg), 0, -Math.sin(a * deg)];

function solveLength(base, dir, pivot, dist) {
  const bx = base[0] - pivot[0];
  const by = base[1] - pivot[1];
  const bz = base[2] - pivot[2];
  const B = dir[0] * bx + dir[1] * by + dir[2] * bz;
  const C = bx * bx + by * by + bz * bz - dist * dist;
  return -B + Math.sqrt(Math.max(0, B * B - C));
}

/**
 * Feather record:
 *  { name, bone, type, base[3], angle(deg, in wing plane), length, width, innerVane, curve, layer, index }
 * `layer` is a dorsal stacking order: higher = more dorsal (on top).
 */
export function buildWingLayout() {
  const { humerus, elbow, wrist, handTip } = WING;
  const feathers = [];
  // Stacking order from wing tip to body: p10 lowest … t3 highest (proximal feathers overlie distal ones).
  let order = 0;
  const STACK = 0.11; // mm per layer

  // Primaries
  const pAngles = [66, 59, 52, 45, 38, 31, 24.5, 18.5, 13.5, 9.5]; // p1..p10
  const pTipDist = [60, 64, 69, 75, 82, 90, 98, 104.5, 108, 104]; // from wrist; p9 = wing chord (S1,S3)
  const prim = [];
  for (let i = 10; i >= 1; i--) {
    const t = 0.06 + (0.9 * (i - 1)) / 9;
    const base = add(lerp3(wrist, handTip, t), [0, order * STACK, -2.2]);
    const angle = pAngles[i - 1];
    const L = solveLength(base, dirFromAngle(angle), wrist, pTipDist[i - 1]);
    prim[i] = { name: `p${i}`, bone: `p${i}`, type: 'primary', base, angle, length: L, width: 10.2 + (10 - i) * 0.3, innerVane: 0.7, curve: 0.05, layer: order++, index: i };
  }
  for (let i = 10; i >= 1; i--) feathers.push(prim[i]);

  // Secondaries s1 (next to p1, at wrist) … s11 (near elbow)
  const sec = [];
  for (let j = 1; j <= 11; j++) {
    const t = 0.02 + (0.93 * (j - 1)) / 10;
    const base = add(lerp3(wrist, elbow, t), [0, order * STACK, -2.4]);
    const angle = 82 + j * 1.7;
    const length = 41 - j * 0.45;
    sec[j] = { name: `s${j}`, bone: `s${j}`, type: 'secondary', base, angle, length, width: 10.5, innerVane: 0.62, curve: 0.08, layer: order++, index: j };
    feathers.push(sec[j]);
  }

  // Tertials t1..t3, on the elbow region of the humerus
  const tLen = [41, 45, 39];
  const tAng = [112, 124, 136];
  for (let k = 1; k <= 3; k++) {
    const base = add(lerp3(elbow, humerus, 0.04 + 0.12 * (k - 1)), [0, order * STACK + 0.4, -2.0]);
    feathers.push({ name: `t${k}`, bone: `t${k}`, type: 'tertial', base, angle: tAng[k - 1], length: tLen[k - 1], width: 11.5, innerVane: 0.55, curve: 0.1, layer: order++, index: k });
  }

  // Coverts ride on the bone of the remex they overlie, so they fold with it.
  const top = order * STACK + 0.5;
  for (let i = 1; i <= 10; i++) {
    const p = prim[i];
    feathers.push({ name: `pc${i}`, bone: p.bone, type: 'primaryCovert', base: add(p.base, [0, top - p.base[1] + wrist[1] + 0.2, 2.6]), angle: p.angle, length: p.length * 0.33, width: 6.5, innerVane: 0.6, curve: 0.06, layer: order + 1, index: i });
  }
  for (let j = 1; j <= 11; j++) {
    const s = sec[j];
    feathers.push({ name: `gc${j}`, bone: s.bone, type: 'greaterCovert', base: add(s.base, [0, top - s.base[1] + wrist[1] + 0.25, 3.4]), angle: s.angle - 2, length: s.length * 0.44, width: 10.5, innerVane: 0.55, curve: 0.08, layer: order + 1, index: j });
    feathers.push({ name: `mc${j}`, bone: s.bone, type: 'medianCovert', base: add(s.base, [0, top - s.base[1] + wrist[1] + 0.6, 8.0]), angle: s.angle - 4, length: s.length * 0.25, width: 8.5, innerVane: 0.55, curve: 0.08, layer: order + 2, index: j });
  }
  // Lesser coverts: small, on the arm itself, rigid with the arm bone.
  const lesser = [
    ['forearm', elbow, wrist, 9, 7.0, 7.2],
    ['humerus', humerus, elbow, 6, 8.0, 7.5],
  ];
  for (const [bone, a, b, n, len, w] of lesser) {
    for (let r = 0; r < 2; r++) {
      for (let q = 0; q < n; q++) {
        const t = (q + 0.5 + r * 0.5) / (n + 0.5);
        const base = add(lerp3(a, b, t), [0, top + 1.0 + r * 0.25 - a[1] + wrist[1], 12.5 - r * 3.2]);
        feathers.push({ name: `lc_${bone}_${r}_${q}`, bone, type: 'lesserCovert', base, angle: 96, length: len - r, width: w, innerVane: 0.5, curve: 0.1, layer: order + 3 + r, index: q });
      }
    }
  }
  // Alula (bastard wing): 3 small feathers on the leading edge at the wrist.
  for (let a = 0; a < 3; a++) {
    feathers.push({ name: `al${a}`, bone: 'alula', type: 'alula', base: add(wrist, [1 + a * 1.5, top + 0.8 - wrist[1] + wrist[1], 5.5 - a * 0.6]), angle: -2 + a * 7, length: 15 - a * 3, width: 3.8, innerVane: 0.7, curve: 0.05, layer: order + 3, index: a });
  }
  return feathers;
}

/** Tail: 6 pairs of rectrices on the pygostyle bone (bind = closed tail). */
export function buildTailLayout(tailPivot) {
  const feathers = [];
  const lengths = [45, 44.6, 44.1, 43.4, 42.4, 41.2]; // S2,S3 (tail 45 mm); slight graduation (D)
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1;
    for (let i = 1; i <= 6; i++) {
      const x = sgn * (0.6 + 1.25 * (i - 1));
      const base = [tailPivot[0] + x, tailPivot[1] + 0.9 - (i - 1) * 0.16, tailPivot[2] + 1.5];
      feathers.push({
        name: `r${i}${side ? 'R' : 'L'}`,
        bone: `r${i}_${side ? 'R' : 'L'}`,
        type: 'rectrix',
        base,
        yaw: sgn * (i - 1) * 1.6 * deg, // fanned slightly outward
        length: lengths[i - 1],
        width: 8.2,
        innerVane: 0.58,
        curve: 0.04,
        index: i,
        side: sgn,
      });
    }
  }
  // Upper-tail coverts (grey-brown centrally, white laterally) and white under-tail coverts: together
  // they hide the basal half of the rectrices, so only ~20 mm of tail shows beyond the body (D).
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      feathers.push({
        name: `utc${i}${side ? 'R' : 'L'}`,
        bone: 'tail',
        type: 'upperTailCovert',
        base: [tailPivot[0] + sgn * (1.0 + i * 2.8), tailPivot[1] + 3.2 - i * 0.6, tailPivot[2] + 12 - i * 2.0],
        yaw: sgn * (4 + i * 8) * deg,
        length: 26 - i * 3,
        width: 10,
        innerVane: 0.55,
        curve: 0.05,
        index: i,
        side: sgn,
      });
      feathers.push({
        name: `ltc${i}${side ? 'R' : 'L'}`,
        bone: 'tail',
        type: 'underTailCovert',
        base: [tailPivot[0] + sgn * (1.0 + i * 2.4), tailPivot[1] - 4.5 - i * 0.3, tailPivot[2] + 10 - i * 2.5],
        yaw: sgn * (3 + i * 7) * deg,
        length: 25 - i * 3,
        width: 9.5,
        innerVane: 0.55,
        curve: -0.05,
        index: i,
        side: sgn,
      });
    }
  }
  return feathers;
}

/**
 * Scapulars: body feathers lying over the base of the folded wing (grey-brown with darker centres).
 * Placed along two rows on the mantle; projected to the SDF surface at build time.
 */
export function buildScapularLayout() {
  const out = [];
  const rows = [
    { x0: 6.5, x1: 9.5, z0: 20, z1: -8, n: 6, len: [15, 21], w: 8.8, out: 0.2, y: 0 },
    { x0: 11.5, x1: 14.5, z0: 22, z1: -2, n: 5, len: [13, 18], w: 8.0, out: 0.42, y: -2.5 },
  ];
  rows.forEach((r, ri) => {
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? 1 : -1;
      for (let i = 0; i < r.n; i++) {
        const t = i / (r.n - 1);
        out.push({
          name: `sc${ri}_${i}${side ? 'R' : 'L'}`,
          type: 'scapular',
          side: sgn,
          row: ri,
          seed: [sgn * (r.x0 + (r.x1 - r.x0) * t), 70 + r.y, r.z0 + (r.z1 - r.z0) * t],
          outward: sgn * r.out,
          length: r.len[0] + (r.len[1] - r.len[0]) * Math.sin(t * Math.PI * 0.9),
          width: r.w,
          innerVane: 0.5,
          curve: 0.12,
          index: i,
          layer: ri === 0 ? 2 - t : 1 - t,
        });
      }
    }
  });
  return out;
}
