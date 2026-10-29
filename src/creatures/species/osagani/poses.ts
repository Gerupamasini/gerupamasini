import { Vector3 } from 'three';
import type { LegId } from './anatomy';
import type { LegRig, RigDef } from './geometry';
import { emptyPose, legKey, planarOf, solveLeg, type LegPose, type Pose } from './rig';

/**
 * The ヤマトオサガニ's postures, read off the photographs, as joint angles (the behaviour blends between them, and the
 * gait and the feeding strokes move the legs about them).
 */

export type Partial4 = Partial<LegPose>;

/**
 * standing: the chelae held before the front, the palms running in from the carpi, their outer faces to the front, the
 * fingers hanging from the palms' ends with their tips on the mud near the midline, a gap between the claws (A45, B12,
 * A51, B25, B8). The palms' lie from the claws' outline in B12 projected through the render's front camera (the palm
 * ≈ 29° forward of across, ≈ 4° up), the outer face turned square to the front between that and the photographs from
 * above (B8, B25); the arm solved for it: the carpi out beyond the front corners, the fixed fingers' tips on the mud
 * ≈ 6 mm either side of the midline and ≈ 1 mm in front of the face.
 */
export const CHELA_STAND: Partial4 = { promo: -0.78, pitch: -0.31, lev: 0.23, roll: 0.57, meYaw: 0.48, mcYaw: -0.81, mc: 0.45, cp: 0.26, cpRoll: 0.27, cpYaw: -2.34, pd: 0 };
/** where the male's closed fingertip is in `CHELA_STAND` at the standing lift (body frame, mm, the left claw): the claws'
 *  clearance of the mud */
export const CHELA_STAND_TIP: [number, number, number] = [5.9, -8.4, 10.5];
/** the female's small chelae standing: before the mouth, the fingertips down on the mud, the inner faces to the body (A47,
 *  B4; FK fitted on her arm) */
export const CHELA_STAND_F: Partial4 = { promo: 1.15, pitch: -0.1, lev: 0.17, roll: 0.14, meYaw: 1.03, mcYaw: -1.49, mc: -0.85, cp: 0.17, cpRoll: -0.04, cpYaw: -0.39, pd: 0 };
/** the female's folded at rest across the front under the eyes, the fingers in towards the midline (A28, B32, A1) */
export const CHELA_FOLDED: Partial4 = { promo: 0.99, pitch: -0.1, lev: 0.57, roll: -0.09, meYaw: 1.31, mcYaw: -1.68, mc: 0.09, cp: -0.31, cpRoll: -1.09, cpYaw: -1.13, pd: 0 };
/** the threat and the waving display: raised high over the carapace and apart, the palms upright and leaning in, their
 *  outer faces to the front, the fingers at the top turned in and gaping (A39, B56; the arm solved for the palm's lie) */
export const CHELA_RAISED: Partial4 = { promo: 0.46, pitch: -0.56, lev: 1.12, roll: -0.3, meYaw: 0.53, mcYaw: 0.17, mc: 0.55, cp: 0.31, cpRoll: -1.31, cpYaw: -1.08, pd: 0.4 };

/**
 * Where the walking legs stand (body frame, mm at CW 35): the foot's direction from the coxa (rad from straight out,
 * + forward) and its reach; the dactylus meets the mud at `DACTYL_ANGLE`. Standing they fan from forward (P2) to back
 * (P5) as the scan's feet do — P2 ≈ 47° forward, P3 straight out, P4 ≈ 36° and P5 ≈ 52° back — the meri raised over
 * the carapace's edge and the distal legs steeply down (A47, B4, B7, A20, B44); low at rest they splay further; in
 * alarm they stand tall.
 */
export const STANCE: Record<string, { dir: number; r: number }> = {
  P2: { dir: 0.8, r: 29.0 }, P3: { dir: 0.0, r: 30.0 }, P4: { dir: -0.62, r: 30.0 }, P5: { dir: -0.9, r: 19.5 },
};
export const DACTYL_ANGLE = -1.38;

const _t = new Vector3();
/** a walking leg's neutral foot (body frame, mm) for a body height `lift` over the ground and a spread factor */
export function neutralFoot(leg: LegRig, lift: number, spread = 1, out = new Vector3()): Vector3 {
  const s = STANCE[leg.id];
  const a = s.dir * (1 + 0.2 * (spread - 1));
  const r = s.r * (0.6 + 0.4 * spread);
  return out.set(leg.coxa.x + leg.sg * Math.cos(a) * r, -lift, leg.coxa.z + Math.sin(a) * r);
}

export const isWalking = (id: LegId) => id !== 'P1';

export function blendLeg(a: LegPose, b: Partial4, k: number, out: LegPose): LegPose {
  for (const key of Object.keys(b) as (keyof LegPose)[]) {
    const v = b[key];
    if (v !== undefined) out[key] = a[key] + (v - a[key]) * k;
  }
  return out;
}

/** body heights (mm over the ground at CW 35): low at rest, standing, tall in alarm (B7, A47, A45) */
export const LIFT = { rest: 4.0, stand: 9.0, tall: 12.0 };

/** a still pose for the viewers and the 図鑑: standing, resting low with the chelae folded, the raised display */
export function stillPose(rig: RigDef, kind: 'stand' | 'rest' | 'defend' | 'bind', over: Record<string, Partial4> = {}, maleChela = true): Pose {
  const P = emptyPose();
  if (kind === 'bind') { P.lift = 0; return P; }
  P.lift = kind === 'rest' ? LIFT.rest : kind === 'defend' ? LIFT.tall : LIFT.stand;
  for (const leg of rig.legs) {
    const L = P.legs[legKey(leg.id, leg.side)];
    if (isWalking(leg.id)) {
      const f = neutralFoot(leg, P.lift, kind === 'rest' ? 1.5 : kind === 'defend' ? 0.95 : 1, _t);
      solveLeg(leg, planarOf(leg), f, DACTYL_ANGLE, L);
    } else {
      Object.assign(L, kind === 'defend' ? CHELA_RAISED : kind === 'rest' && !maleChela ? CHELA_FOLDED : maleChela ? CHELA_STAND : CHELA_STAND_F);
    }
    const o = { ...(over[leg.id] ?? {}), ...(over[leg.id + leg.side] ?? {}) };
    if (Object.keys(o).length) Object.assign(L, o);
  }
  if (kind === 'defend') P.pitch = 0.12;
  return P;
}
