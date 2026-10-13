import { Vector3 } from 'three';
import type { LegId } from './anatomy';
import type { LegRig, RigDef } from './geometry';
import { emptyPose, legKey, planarOf, solveLeg, type LegPose, type Pose } from './rig';

/**
 * The ガザミ's postures, read off the photographs, as joint angles (the behaviour blends between them and the gait
 * and the strokes move the legs about them).
 */

type Partial4 = Partial<LegPose>;

/** the chelipeds folded at rest: the merus out along the anterolateral margin, the chela back across in front of it, the fingers towards the eyes (19, 55) */
export const CHELA_FOLDED: Partial4 = { promo: -0.55, pitch: -0.1, lev: 0.15, roll: 0.0, meYaw: 0.15, mcYaw: -2.6, mc: 0.0, cp: -0.2, cpRoll: 0.9, cpYaw: -0.3, pd: 0.03 };
/** held out in front, ready, the chelae pointing in and forward near the ground (66) */
export const CHELA_READY: Partial4 = { promo: 0.15, pitch: -0.1, lev: 0.1, roll: 0.0, meYaw: 0.55, mcYaw: -2.35, mc: -0.25, cp: -0.15, cpRoll: 0.3, cpYaw: -0.2, pd: 0.06 };
/** the threat display: raised high and spread wide, the fingers gaping (12, 47, 53, 58) */
export const CHELA_DEFEND: Partial4 = { promo: 0.2, pitch: -0.1, lev: 0.25, roll: -0.2, meYaw: 0.9, mcYaw: -1.8, mc: 0.0, cp: -0.2, cpRoll: -0.6, cpYaw: -0.15, pd: 0.42 };
/** reaching down to the sand in front to pick (foraging) */
export const CHELA_PICK: Partial4 = { promo: 0.55, pitch: -0.1, lev: -0.05, roll: 0.1, meYaw: 0.8, mcYaw: -1.7, mc: -0.45, cp: -0.35, cpRoll: 0.4, cpYaw: -0.1, pd: 0.2 };
/** to the mouth (the third maxillipeds take the food) */
export const CHELA_MOUTH: Partial4 = { promo: 0.75, pitch: -0.1, lev: 0.15, roll: 0.3, meYaw: 1.35, mcYaw: -2.75, mc: 0.05, cp: 0.15, cpRoll: 1.1, cpYaw: -0.75, pd: 0.05 };
/**
 * swimming (and running): folded tight and low, the palms under the front below the body's plane, the fingertips
 * meeting at the front margin, hidden from above (6: nothing of the claws shows in front of the swimming crab); FK
 * fitted: the palm's middle at (23, −1, 18) mm, the fingertip at the front margin (z 25)
 */
export const CHELA_SWIM: Partial4 = { promo: -0.75, pitch: -0.1, lev: -0.05, roll: 0.0, meYaw: 0.15, mcYaw: -2.8, mc: 0.0, cp: -0.2, cpRoll: 0.9, cpYaw: -0.3, pd: 0.0 };

/**
 * The walking legs while swimming (6: from above, the legs of each side held straight out to the side in a close
 * bundle, level with the carapace and swept a little back, the dactyli in line; never hanging as if standing): FK
 * fitted, the tips at the coxae's height ±3 mm, 80 mm out, P2 to P4 swept 0 – 40 mm back.
 */
export const LEG_SWIM: Record<string, Partial4> = {
  P2: { promo: -0.7, lev: 0.1, mc: -0.15, cp: -0.08, pd: 0.15 },
  P3: { promo: -0.45, lev: 0.1, mc: -0.15, cp: -0.08, pd: 0.15 },
  P4: { promo: -0.2, lev: 0.12, mc: -0.15, cp: -0.08, pd: 0.15 },
};
/** the paddles held up and back over the posterior margin while the crab walks (66) */
export const PADDLE_CARRY: Partial4 = { promo: -0.25, lev: 0.35, mc: -0.3, cp: -0.1, cpRoll: 0.0, pd: -0.15 };
/** the paddles laid flat on the sand at rest (55, 61) */
export const PADDLE_REST: Partial4 = { promo: -0.1, lev: -0.05, mc: -0.15, cp: -0.05, cpRoll: 0.0, pd: -0.05 };

/**
 * Where the walking legs stand (body frame, mm at CW 100): the angle off the leg's rest direction and the reach from
 * the coxa; the dactylus meets the sand at `th`. Standing they fan from forward to back (19, 47, 55); low at rest
 * they splay further; in alarm they stand tall.
 */
export const STANCE: Record<string, { ang: number; r: number }> = {
  P2: { ang: 0.22, r: 46 }, P3: { ang: 0.02, r: 49 }, P4: { ang: -0.25, r: 45 },
};
export const DACTYL_ANGLE = -1.1;

const _t = new Vector3();
/** a walking leg's neutral foot (body frame, mm) for a body height `lift` over the ground and a spread factor */
export function neutralFoot(leg: LegRig, lift: number, spread = 1, out = new Vector3()): Vector3 {
  const s = STANCE[leg.id];
  const a = leg.yaw + s.ang * spread;
  const r = s.r * (0.88 + 0.12 * spread);
  return out.set(leg.coxa.x + leg.sg * Math.cos(a) * r, -lift, leg.coxa.z + Math.sin(a) * r);
}

export const isWalking = (id: LegId) => id === 'P2' || id === 'P3' || id === 'P4';

export function blendLeg(a: LegPose, b: Partial4, k: number, out: LegPose): LegPose {
  for (const key of Object.keys(b) as (keyof LegPose)[]) {
    const v = b[key];
    if (v !== undefined) out[key] = a[key] + (v - a[key]) * k;
  }
  return out;
}

/** a still pose for the viewers and the 図鑑: standing, resting low with the chelipeds folded, the threat display */
export function stillPose(rig: RigDef, kind: 'stand' | 'rest' | 'defend' | 'bind', over: Record<string, Partial4> = {}): Pose {
  const P = emptyPose();
  if (kind === 'bind') { P.lift = 0; return P; }
  P.lift = kind === 'rest' ? 4.5 : kind === 'defend' ? 15 : 9;
  for (const leg of rig.legs) {
    const L = P.legs[legKey(leg.id, leg.side)];
    if (isWalking(leg.id)) {
      const f = neutralFoot(leg, P.lift, kind === 'rest' ? 1.25 : kind === 'defend' ? 0.85 : 1, _t);
      solveLeg(leg, planarOf(leg), f, DACTYL_ANGLE, L);
    } else if (leg.id === 'P5') {
      Object.assign(L, kind === 'rest' ? PADDLE_REST : PADDLE_CARRY);
    } else {
      Object.assign(L, kind === 'rest' ? CHELA_FOLDED : kind === 'defend' ? CHELA_DEFEND : CHELA_READY);
    }
    const o = { ...(over[leg.id] ?? {}), ...(over[leg.id + leg.side] ?? {}) };
    if (Object.keys(o).length) Object.assign(L, o);
  }
  if (kind === 'defend') P.pitch = 0.22;
  return P;
}
