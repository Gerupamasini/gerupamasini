import * as THREE from 'three';

// Bill, legs/toes/claws and eyes. Units: mm while building, metres in the output geometry.
// aPart: 0 bill keratin, 1 leg skin (reticulate scales), 2 claw, 3 feathered thigh, 4 mouth lining,
//        5 foot pad (plantar), 6 eyelid rim

class Skinned {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.part = [];
    this.si = [];
    this.sw = [];
    this.index = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  v(p, n, uv, part, bones) {
    this.pos.push(p[0] / 1000, p[1] / 1000, p[2] / 1000);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.nrm.push(n[0] / l, n[1] / l, n[2] / l);
    this.uv.push(uv[0], uv[1]);
    this.part.push(part);
    const b = bones.slice(0, 4);
    const sum = b.reduce((a, x) => a + x[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      this.si.push(b[k] ? b[k][0] : 0);
      this.sw.push(b[k] ? b[k][1] / sum : 0);
    }
  }
  /** Loft rings (each ring = array of {p, n, uv}) into a tube; `cap` closes the ends. */
  loft(rings, part, bonesPerRing, { capStart = false, capEnd = false, flip = false } = {}) {
    const start = this.count;
    const seg = rings[0].length;
    rings.forEach((ring, i) => ring.forEach((q) => this.v(q.p, q.n, q.uv, q.part ?? part, bonesPerRing[i])));
    // auto-orient: make triangle winding agree with the analytic outward normals (robust to mirrored builds)
    {
      const mid = Math.min(rings.length - 2, Math.floor(rings.length / 2));
      const s0 = Math.floor(seg / 4);
      const P = (ri, si) => rings[ri][si % seg].p;
      const a0 = P(mid, s0);
      const c0 = P(mid + 1, s0);
      const b0 = P(mid, s0 + 1);
      const gn = cross(sub(c0, a0), sub(b0, a0));
      const an = rings[mid][s0].n;
      if (gn[0] * an[0] + gn[1] * an[1] + gn[2] * an[2] < 0) flip = !flip;
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let s = 0; s < seg; s++) {
        const a = start + i * seg + s;
        const b = start + i * seg + ((s + 1) % seg);
        const c = a + seg;
        const d = b + seg;
        if (flip) this.index.push(a, b, c, b, d, c);
        else this.index.push(a, c, b, b, c, d);
      }
    }
    const cap = (ri, capFlip) => {
      const flip = capFlip;
      const ring = rings[ri];
      const c = ring.reduce((acc, q) => [acc[0] + q.p[0] / seg, acc[1] + q.p[1] / seg, acc[2] + q.p[2] / seg], [0, 0, 0]);
      const ci = this.count;
      const axis = ri === 0 ? sub(rings[0][0].p, rings[1][0].p) : sub(rings[ri][0].p, rings[ri - 1][0].p);
      this.v(c, axis, [0, ri ? 1 : 0], part, bonesPerRing[ri]);
      for (let s = 0; s < seg; s++) {
        const a = start + ri * seg + s;
        const b = start + ri * seg + ((s + 1) % seg);
        if (flip !== flipAll) this.index.push(ci, a, b);
        else this.index.push(ci, b, a);
      }
    };
    const flipAll = flip;
    if (capStart) cap(0, true);
    if (capEnd) cap(rings.length - 1, false);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerpv = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- Bill
// Charadrius bill: short, straight; basal part deep with a long nasal groove, mid-bill constriction,
// swollen distal third (dertrum), blunt-pointed tip; upper tip slightly overhangs the lower.
// Length 16 mm (S2,S3), depth/width at base D (morphology.md).
export function billProfile(t) {
  // widths & heights (mm) as function of t (0 = feathering, 1 = tip)
  // t: 0 = inside the feathering (hidden ~4.5 mm), ≈0.2 = feather line, 1 = tip
  const W = 4.6 * (1 - 0.42 * smooth(0.1, 0.55, t)) * (1 - smooth(0.9, 1.0, t) ** 1.6) + 0.1 * Math.exp(-(((t - 0.8) / 0.1) ** 2));
  const Hu = 3.0 - 1.45 * smooth(0.12, 0.55, t) + 0.38 * Math.exp(-(((t - 0.8) / 0.1) ** 2)) - 1.35 * smooth(0.88, 1, t) ** 1.3;
  const Hl = 2.1 - 1.0 * smooth(0.12, 0.58, t) + 0.12 * Math.exp(-(((t - 0.78) / 0.1) ** 2)) - 0.85 * smooth(0.86, 1, t) ** 1.3;
  return { W: Math.max(0.05, W), Hu: Math.max(0.12, Hu), Hl: Math.max(0.08, Hl) };
}

export function buildBill(sk, boneIndex, J, opts = {}) {
  const segL = opts.segL ?? 22;
  const segR = opts.segR ?? 14;
  const base = [0, 77.6, 57.0]; // hidden ~4.5 mm inside the lores feathering (feather line z≈61.8)
  const tip = [0, 75.7, 77.8]; // exposed culmen 16 mm (S2, S3)
  const axis = norm(sub(tip, base));
  const up = norm(cross(cross(axis, [0, 1, 0]), axis)); // world-up-ish, perpendicular to the bill axis
  const side = norm(cross(up, axis));
  const Ltot = Math.hypot(...sub(tip, base));
  const head = boneIndex.head;
  const jaw = boneIndex.jaw;
  for (const which of ['upper', 'lower']) {
    const rings = [];
    const bones = [];
    for (let i = 0; i < segL; i++) {
      const tt = i / (segL - 1);
      const t = tt ** 0.85; // denser near the tip
      const lenOff = which === 'lower' ? -0.45 * t : 0; // lower mandible slightly shorter
      const { W, Hu, Hl } = billProfile(t);
      const c = addv(addv(base, scl(axis, t * Ltot + lenOff)), scl(up, which === 'upper' ? -0.25 * smooth(0.82, 1, t) : 0.05));
      const ring = [];
      for (let s = 0; s < segR; s++) {
        // angle 0..π across the curved outer surface, flat face along the commissure
        const a = (s / segR) * Math.PI * 2;
        let x;
        let y;
        let nx;
        let ny;
        if (a <= Math.PI) {
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const e = 0.62; // superellipse exponent: flat sides, rounded culmen
          x = Math.sign(ca) * Math.abs(ca) ** e * W * 0.5;
          const H = which === 'upper' ? Hu : Hl;
          y = sa ** 0.9 * H;
          nx = Math.sign(ca) * Math.abs(ca) ** (2 - e) / W;
          ny = sa / H;
          // nasal groove on upper mandible sides (basal 45%)
          if (which === 'upper' && t > 0.18 && t < 0.58) {
            const g = Math.exp(-(((Math.abs(ca) - 0.62) / 0.12) ** 2)) * Math.sin(Math.PI * smooth(0.18, 0.58, t));
            x -= Math.sign(ca) * 0.28 * g;
          }
        } else {
          // commissure face (slightly concave palate / tongue side)
          const u = Math.cos(a);
          x = u * W * 0.5;
          y = -0.08 * (1 - u * u);
          nx = 0;
          ny = -1;
        }
        const yy = which === 'upper' ? y : -y;
        const p = addv(addv(c, scl(side, x)), scl(up, yy));
        const n = addv(scl(side, nx), scl(up, which === 'upper' ? ny : -ny));
        ring.push({ p, n: norm(addv(n, scl(axis, 0.05))), uv: [s / segR, t], part: a > Math.PI ? 4 : 0 });
      }
      rings.push(ring);
      bones.push([[which === 'upper' ? head : jaw, 1]]);
    }
    sk.loft(rings, 0, bones, { capStart: true, capEnd: true });
  }
}

// ---------------------------------------------------------------- Legs
function legFrame(dir) {
  const d = norm(dir);
  let ref = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const b = norm(cross(d, ref));
  const n = cross(b, d);
  return { d, n, b };
}

/** Elliptic ring around a point; rx along frame.n, rz along frame.b. */
function ring(center, frame, rx, rz, seg, v, part, bulgeBack = 0) {
  const out = [];
  for (let s = 0; s < seg; s++) {
    const a = (s / seg) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const back = bulgeBack * Math.max(0, -ca) ** 2;
    const p = addv(addv(center, scl(frame.n, ca * (rx + back))), scl(frame.b, sa * rz));
    const n = norm(addv(scl(frame.n, ca / rx), scl(frame.b, sa / rz)));
    out.push({ p, n, uv: [s / seg, v], part });
  }
  return out;
}

export function buildLegs(sk, boneIndex, J, toes, opts = {}) {
  const seg = opts.seg ?? 10;
  const detail = opts.detail ?? 0;
  for (const side of ['L', 'R']) {
    const m = side === 'L' ? 1 : -1;
    const mir = (p) => [p[0] * m, p[1], p[2]];
    const knee = mir(J.knee);
    const ankle = mir(J.ankle);
    const foot = mir(J.foot);
    const B = (n) => boneIndex[`${n}_${side}`];
    // tibiotarsus: feathered skirt (t 0..0.69) then bare (0.69..1)
    const tib = sub(ankle, knee);
    const fT = legFrame(tib);
    // make ring 'n' axis point forward-ish (toward +Z) for consistent flattening
    const fwd = norm(cross(fT.d, [m, 0, 0]));
    const frT = { d: fT.d, n: fwd, b: norm(cross(fT.d, fwd)) };
    // Feathered "drumstick": one continuous tube from the mid-femur (deep inside the belly) through the knee
    // down the upper tibiotarsus, so no gap can open between belly and bare tibia however the femur swings.
    // The tibia leaves the belly contour at t≈0.35 (rest pose); feathers end at t≈0.66 with a ragged,
    // feather-tipped edge (alternating length per vertex) instead of a clean cuff.
    {
      const hip = mir(J.hip);
      const fem = sub(knee, hip);
      const fF = legFrame(fem);
      const fwdF = norm(cross(fF.d, [m, 0, 0]));
      const frF = { d: fF.d, n: fwdF, b: norm(cross(fF.d, fwdF)) };
      const tSeg = detail < 2 ? seg + 2 : seg;
      // [segment, t, radius, rows]
      const st =
        detail < 2
          ? [['f', 0.35, 4.2], ['f', 0.7, 4.6], ['k', 0, 4.4], ['t', 0.14, 3.9], ['t', 0.28, 3.2], ['t', 0.4, 2.55], ['t', 0.5, 2.05], ['t', 0.58, 1.7], ['t', 0.64, 1.45], ['e', 0.675, 1.28]]
          : [['f', 0.5, 4.2], ['k', 0, 4.2], ['t', 0.3, 3.0], ['t', 0.5, 1.9], ['e', 0.66, 1.3]];
      const thigh = [];
      const thighB = [];
      st.forEach(([s, t, r]) => {
        let c;
        let fr;
        let w;
        if (s === 'f') {
          c = addv(hip, scl(fem, t));
          fr = frF;
          w = [[B('femur'), 1]];
        } else if (s === 'k') {
          // knee: average of the two frames, split weights so the tube bends smoothly
          c = knee;
          const d = norm(addv(frF.d, frT.d));
          const n = norm(cross(d, [m, 0, 0]));
          fr = { d, n, b: norm(cross(d, n)) };
          w = [[B('femur'), 0.5], [B('tibio'), 0.5]];
        } else {
          c = addv(knee, scl(tib, t));
          fr = frT;
          w = s === 't' && t < 0.2 ? [[B('tibio'), 0.75 + t * 1.25], [B('femur'), 0.25 - t * 1.25]] : [[B('tibio'), 1]];
        }
        const rg = ring(c, fr, r * 1.06, r * 0.9, tSeg, s === 'f' ? t * 0.3 : 0.3 + (s === 'k' ? 0 : t), 3, 0.35 * r / 4);
        if (s === 'e') {
          // ragged feather-tip edge: every other vertex reaches further down and tucks in
          rg.forEach((q, i) => {
            const long = i % 2 === 0;
            const extra = long ? 0.9 : -0.35;
            q.p = addv(q.p, scl(frT.d, extra));
            const radial = sub(q.p, addv(knee, scl(tib, t + extra / Math.hypot(...tib))));
            q.p = addv(q.p, scl(radial, long ? -0.12 : 0.0));
            q.uv = [q.uv[0], 1];
          });
        }
        thigh.push(rg);
        thighB.push(w);
      });
      sk.loft(thigh, 3, thighB);
    }
    // Bare tibia → intertarsal joint → tarsometatarsus → foot joint
    const tar = sub(foot, ankle);
    const fM = legFrame(tar);
    const fwdM = norm(cross(fM.d, [m, 0, 0]));
    const frM = { d: fM.d, n: fwdM, b: norm(cross(fM.d, fwdM)) };
    const rings = [];
    const rb = [];
    const tibStations = detail < 2 ? [0.64, 0.75, 0.86, 0.94, 0.985] : [0.66, 0.99];
    tibStations.forEach((k) => {
      const joint = smooth(0.84, 1, k);
      rings.push(ring(addv(knee, scl(tib, k)), frT, 1.15 + 0.55 * joint, 1.0 + 0.45 * joint, seg, k * 0.3, 1, 0.5 * joint));
      rb.push([[B('tibio'), 1 - 0.5 * smooth(0.9, 1.0, k)], [B('tarso'), 0.5 * smooth(0.9, 1.0, k)]]);
    });
    const tarStations = detail < 2 ? [0.03, 0.1, 0.25, 0.45, 0.65, 0.82, 0.93, 1.0] : [0.05, 0.5, 1.0];
    tarStations.forEach((k) => {
      const joint = 1 - smooth(0, 0.14, k);
      const toeJ = smooth(0.85, 1.0, k);
      // tarsometatarsus is laterally compressed: depth (n) > width (b)
      rings.push(ring(addv(ankle, scl(tar, k)), frM, 1.12 + 0.55 * joint + 0.45 * toeJ, 0.82 + 0.5 * joint + 0.55 * toeJ, seg, 0.3 + k * 0.7, 1, 0.45 * joint));
      rb.push([[B('tarso'), 1 - 0.5 * toeJ], [B('foot'), 0.5 * toeJ]]);
    });
    sk.loft(rings, 1, rb, { capEnd: true });

    // Toes (3 forward, no hallux): loft over phalanx segments with plantar pads and a claw.
    for (const [key, toe] of Object.entries(toes)) {
      const a = (toe.angle * Math.PI) / 180;
      const dir = [Math.sin(a) * m, 0, Math.cos(a)];
      const tRings = [];
      const tBones = [];
      const nSeg = toe.segs.length;
      const clawLen = 2.1;
      const flesh = toe.length - clawLen;
      const samples = detail < 2 ? 14 : 5;
      for (let i = 0; i <= samples; i++) {
        const u = i / samples; // 0..1 along the fleshy toe
        const along = u * flesh;
        // which phalanx
        let acc = 0;
        let si = 0;
        for (let k = 0; k < nSeg; k++) {
          if (along / toe.length <= acc + toe.segs[k] || k === nSeg - 1) {
            si = k;
            break;
          }
          acc += toe.segs[k];
        }
        const y = u < 0.12 ? 2.5 - (2.5 - 1.0) * smooth(0, 0.12, u) : 1.0 - 0.25 * u;
        const c = [foot[0] + dir[0] * along, y, foot[2] + dir[2] * along];
        // joint pads: bulges at phalangeal joints (below)
        let pad = 0;
        let acc2 = 0;
        for (let k = 0; k < nSeg - 1; k++) {
          acc2 += toe.segs[k];
          pad += Math.exp(-(((along / toe.length - acc2) / 0.05) ** 2));
        }
        const r = (0.78 - 0.22 * u) * (1 + 0.14 * pad) + (u < 0.1 ? 0.6 * (1 - u / 0.1) : 0);
        const fr = { d: dir, n: [0, 1, 0], b: norm(cross(dir, [0, 1, 0])) };
        const rr = ring(c, fr, r * 0.85, r, seg, u, 1);
        // flatten the sole (plantar surface) — tagged as foot pad
        rr.forEach((q) => {
          if (q.p[1] < c[1] - r * 0.35) {
            q.p[1] = c[1] - r * 0.35 - 0.08 * pad;
            q.part = 5;
            q.n = norm([q.n[0] * 0.3, -1, q.n[2] * 0.3]);
          }
        });
        tRings.push(rr);
        // skin weights: segment bone, blended at joints
        const bn = `toe_${key}${si}`;
        const nextStart = toe.segs.slice(0, si + 1).reduce((x, y2) => x + y2, 0);
        const bw = si < nSeg - 1 ? smooth(nextStart - 0.06, nextStart + 0.02, along / toe.length) : 0;
        const w = [[B(bn), 1 - bw]];
        if (bw > 0) w.push([B(`toe_${key}${si + 1}`), bw]);
        if (u < 0.1) w.push([B('foot'), 1 - u / 0.1]);
        tBones.push(w);
      }
      // claw: curved, laterally compressed, tapering to a point (tagged part 2)
      const last = `toe_${key}${nSeg - 1}`;
      const clawSteps = detail < 2 ? 5 : 2;
      for (let i = 1; i <= clawSteps; i++) {
        const u = i / clawSteps;
        const along = flesh + u * clawLen;
        const y = 0.75 - 0.35 * u - 0.25 * u * u;
        const c = [foot[0] + dir[0] * along, y, foot[2] + dir[2] * along];
        const r = 0.5 * (1 - u) + 0.03;
        const fr = { d: dir, n: [0, 1, 0], b: norm(cross(dir, [0, 1, 0])) };
        tRings.push(ring(c, fr, r * 1.1, r * 0.7, seg, 1 + u, 2));
        tBones.push([[B(last), 1]]);
      }
      sk.loft(tRings, 1, tBones, { capEnd: true });
    }
  }
}

// ---------------------------------------------------------------- Eyes
export const EYE = {
  radius: 4.0, // eyeball (mm)
  aperture: 2.7, // visible radius (5.4 mm aperture)
  corneaR: 3.1,
  axisL: norm([0.955, 0.13, 0.27]), // lateral, 15.7° forward, 7.5° up (D)
};

function sphereCap(sk, center, axis, R, maxAngle, segA, segR, part, bones, uvMode, hand = 1) {
  const start = sk.count;
  // t1 = anterior direction for both eyes (hand = ±1), t2 = ventral; uv.y = phi from anterior
  const t1 = scl(norm(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), hand);
  const t2 = cross(axis, t1);
  for (let i = 0; i <= segA; i++) {
    const th = (i / segA) * maxAngle;
    for (let j = 0; j < segR; j++) {
      const ph = (j / segR) * Math.PI * 2;
      const dir = norm(addv(scl(axis, Math.cos(th)), addv(scl(t1, Math.sin(th) * Math.cos(ph)), scl(t2, Math.sin(th) * Math.sin(ph)))));
      const p = addv(center, scl(dir, R));
      // uv: polar (angle/maxAngle, phi) for iris / lid shaders
      sk.v(p, dir, uvMode === 'polar' ? [th / maxAngle, j / segR] : [0, 0], part, bones);
    }
  }
  for (let i = 0; i < segA; i++) {
    for (let j = 0; j < segR; j++) {
      const a = start + i * segR + j;
      const b = start + i * segR + ((j + 1) % segR);
      const c = a + segR;
      const d = b + segR;
      sk.index.push(a, c, b, b, c, d); // counter-clockwise seen from outside (verified by tools/dev/winding.mjs)
    }
  }
}

/**
 * Returns { eyeball, cornea, lids } geometries (all skinned).
 * eyeball: iris/pupil via polar uv (x = angle fraction from optical axis).
 * cornea: transparent high-specular cap.
 * lids: rim torus (part 6) + lower-lid/nictitans caps (aPart 7 = lower lid, 8 = nictitating membrane).
 */
export function buildEyes(boneIndex, J, opts = {}) {
  const segA = opts.segA ?? 14;
  const segR = opts.segR ?? 28;
  const eyeball = new Skinned();
  const cornea = new Skinned();
  const lids = new Skinned();
  for (const side of ['L', 'R']) {
    const m = side === 'L' ? 1 : -1;
    const c = [J.eyeCenter[0] * m, J.eyeCenter[1], J.eyeCenter[2]];
    const axis = [EYE.axisL[0] * m, EYE.axisL[1], EYE.axisL[2]];
    const eb = [[boneIndex[`eye_${side}`], 1]];
    const hb = [[boneIndex.head, 1]];
    const maxA = Math.asin(EYE.aperture / EYE.radius) + 0.12;
    sphereCap(eyeball, c, axis, EYE.radius, maxA, segA, segR, 0, eb, 'polar');
    // cornea: more curved sphere whose rim meets the eyeball at the aperture edge
    const d = Math.sqrt(EYE.radius ** 2 - EYE.aperture ** 2) - Math.sqrt(EYE.corneaR ** 2 - EYE.aperture ** 2);
    sphereCap(cornea, addv(c, scl(axis, d)), axis, EYE.corneaR, Math.asin(EYE.aperture / EYE.corneaR) * 1.02, 8, segR, 0, eb, 'polar');
    // lid rim torus (dark, thin eyelid skin)
    const rimC = addv(c, scl(axis, Math.sqrt(EYE.radius ** 2 - EYE.aperture ** 2) + 0.05));
    const t1 = norm(cross(axis, [0, 1, 0]));
    const t2 = cross(axis, t1);
    const rimStart = lids.count;
    const rimSeg = 32;
    const tubeSeg = 8;
    const rMajor = EYE.aperture + 0.12;
    const rMinor = 0.18;
    for (let i = 0; i < rimSeg; i++) {
      const ph = (i / rimSeg) * Math.PI * 2;
      const radial = norm(addv(scl(t1, Math.cos(ph)), scl(t2, Math.sin(ph))));
      const cc = addv(rimC, scl(radial, rMajor));
      for (let j = 0; j < tubeSeg; j++) {
        const th = (j / tubeSeg) * Math.PI * 2;
        const n = norm(addv(scl(radial, Math.cos(th)), scl(axis, Math.sin(th))));
        lids.v(addv(cc, scl(n, rMinor)), n, [i / rimSeg, j / tubeSeg], 6, hb);
      }
    }
    for (let i = 0; i < rimSeg; i++) {
      for (let j = 0; j < tubeSeg; j++) {
        const a = rimStart + i * tubeSeg + j;
        const b = rimStart + ((i + 1) % rimSeg) * tubeSeg + j;
        const cI = rimStart + i * tubeSeg + ((j + 1) % tubeSeg);
        const dI = rimStart + ((i + 1) % rimSeg) * tubeSeg + ((j + 1) % tubeSeg);
        lids.index.push(a, cI, b, b, cI, dI);
      }
    }
    // lower lid (rises when the bird sleeps) and nictitating membrane (sweeps front→back)
    const lidCenter = addv(c, scl(axis, d));
    sphereCap(lids, lidCenter, axis, EYE.corneaR + 0.12, Math.asin(Math.min(0.99, (EYE.aperture + 0.3) / (EYE.corneaR + 0.12))), 8, segR, 7, hb, 'polar', m);
    sphereCap(lids, lidCenter, axis, EYE.corneaR + 0.05, Math.asin(Math.min(0.99, (EYE.aperture + 0.15) / (EYE.corneaR + 0.05))), 8, segR, 8, hb, 'polar', m);
  }
  return { eyeball: eyeball.build(), cornea: cornea.build(), lids: lids.build() };
}

export function buildBareParts(boneIndex, J, toes, detail = 0) {
  const sk = new Skinned();
  buildBill(sk, boneIndex, J, detail === 0 ? {} : detail === 1 ? { segL: 14, segR: 10 } : { segL: 6, segR: 6 });
  buildLegs(sk, boneIndex, J, toes, detail === 0 ? { seg: 10 } : detail === 1 ? { seg: 7, detail: 1 } : { seg: 5, detail: 2 });
  return sk.build();
}
