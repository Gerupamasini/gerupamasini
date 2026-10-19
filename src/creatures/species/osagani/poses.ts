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
 * standing: the chelae held before the front, the palms upright facing forward and turned inward, the fingers pointing
 * down to the mud with their tips near the midline (A45, B12, A51, B25: the "Λ" of the male's claws). FK fitted: the
 * carpus at the front corner, the palm across the front pointing in, the fingers down to the mud by the midline.
 */
export const CHELA_STAND: Partial4 = { promo: 0.05, pitch: -0.1, lev: 0.36, roll: 0.0, meYaw: 0.61, mcYaw: -0.88, mc: -0.19, cp: -0.07, cpRoll: 0.26, cpYaw: -1.58, pd: 0.0 };
/** the female's small chelae standing: before the mouth, the fingertips down on the mud (A47, B4; FK fitted on her arm) */
export const CHELA_STAND_F: Partial4 = { promo: 0.78, pitch: -0.1, lev: -0.06, roll: 0.0, meYaw: 0.97, mcYaw: -1.73, mc: -0.85, cp: 0.63, cpRoll: -0.18, cpYaw: -0.19, pd: 0.0 };
/** the female's folded at rest across the front under the eyes, the fingers in towards the midline (A28, B32, A1) */
export const CHELA_FOLDED: Partial4 = { promo: 1.0, pitch: -0.1, lev: 0.48, roll: 0.0, meYaw: 1.35, mcYaw: -1.71, mc: -0.08, cp: -0.1, cpRoll: -1.09, cpYaw: -0.98, pd: 0.0 };
/** the threat and the waving display: raised high over the carapace, the palm upright, the fingers gaping (A39, B56) */
export const CHELA_RAISED: Partial4 = { promo: 0.2, pitch: -0.1, lev: 0.95, roll: -0.15, meYaw: 0.4, mcYaw: -0.8, mc: 0.55, cp: -0.25, cpRoll: 0.2, cpYaw: -0.35, pd: 0.4 };
/** scooping the mud's surface in front (deposit feeding: the chela's fingers scrape the film, B14, A14) */
export const CHELA_SCOOP: Partial4 = { promo: 0.45, pitch: -0.1, lev: -0.12, roll: 0.0, meYaw: 0.6, mcYaw: -1.05, mc: -0.55, cp: -0.35, cpRoll: 0.25, cpYaw: -0.4, pd: 0.22 };
/** to the mouth (the third maxillipeds take the mud and sort it) */
export const CHELA_MOUTH: Partial4 = { promo: 0.55, pitch: -0.1, lev: 0.25, roll: 0.1, meYaw: 1.0, mcYaw: -2.0, mc: -0.05, cp: 0.1, cpRoll: 0.8, cpYaw: -0.7, pd: 0.03 };
/** tucked tight against the front while it runs or slips into its burrow */
export const CHELA_TUCK: Partial4 = { promo: -0.3, pitch: -0.1, lev: 0.0, roll: 0.0, meYaw: 0.25, mcYaw: -2.3, mc: -0.1, cp: -0.05, cpRoll: 1.0, cpYaw: -0.4, pd: 0.0 };

/**
 * Where the walking legs stand (body frame, mm at CW 35): the angle off the leg's rest direction and the reach from
 * the coxa; the dactylus meets the mud at `DACTYL_ANGLE`. Standing they fan from forward (P2) to back (P5) with the
 * meri raised over the carapace's edge and the distal legs steeply down (A47, B4, B7, A20, B44); low at rest they
 * splay further; in alarm they stand tall.
 */
export const STANCE: Record<string, { ang: number; r: number }> = {
  P2: { ang: 0.26, r: 21.0 }, P3: { ang: 0.04, r: 24.0 }, P4: { ang: -0.08, r: 24.5 }, P5: { ang: -0.15, r: 18.0 },
};
export const DACTYL_ANGLE = -1.42;

const _t = new Vector3();
/** a walking leg's neutral foot (body frame, mm) for a body height `lift` over the ground and a spread factor */
export function neutralFoot(leg: LegRig, lift: number, spread = 1, out = new Vector3()): Vector3 {
  const s = STANCE[leg.id];
  const a = leg.yaw + s.ang * spread;
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
