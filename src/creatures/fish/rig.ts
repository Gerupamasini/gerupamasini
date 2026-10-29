import { Bone, Group, LOD, Matrix4, Skeleton, SkinnedMesh, Sphere, Vector3, type Object3D } from 'three';
import { BONE_CAUD, BONE_EYE0, BONE_EYE1, BONE_JAW, BONE_OPERL, BONE_OPERR, BONE_PECL, BONE_PECR, SPINE_N, fishGeometry, rigRest, type Lod } from './body';
import { fishLook, type FishLook } from './skin';
import type { FishSpec } from './spec';

/**
 * 共通 FishRig + SwimmingSystem: one skeleton per fish over its species' shared tiers, and the swimming pose written
 * into it.
 *
 * The axial wave (a travelling wave whose amplitude grows from a small head recoil to the full tail sweep) plus a
 * C-shaped curvature for turns and the C-start:
 *   h(s, t) = A · e(s) · sin(2π s / λ − φ(t))  +  ½ κ (s − s_pivot)²
 * λ and e(s) are the species' (a mullet's and a herring's subcarangiform wave, a flathead's longer body wave). A
 * flatfish has the same chain in a body frame laid on its blind side, so the wave runs up and down through the bed's
 * normal and its marginal fins ripple; the frame is not just rolled: its pose keeps the head low and the fins working.
 */

export interface SwimPose {
  phase: number;
  /** tail-tip half amplitude (TL) */
  amp: number;
  /** body curvature (1/TL): + bends the fish concave to its left */
  curv: number;
  /** head bend, + = snout down (rad) */
  headBend: number;
  /** jaw drop 0..1 */
  jaw: number;
  /** pectoral abduction 0..1 per side, and a sculling beat (rad) */
  pecL: number;
  pecR: number;
  pecBeat: number;
  /** marginal fin ripple 0..1 and its phase (flatfish) */
  ripple: number;
  ripplePhase: number;
  /** the gill covers swung open 0 (shut) … 1 (flared), and where the eyes look (rad: up, forward) */
  oper: number;
  eyePitch: number;
  eyeYaw: number;
}

export function restPose(): SwimPose {
  return { phase: 0, amp: 0.02, curv: 0, headBend: 0, jaw: 0, pecL: 0.3, pecR: 0.3, pecBeat: 0, ripple: 0, ripplePhase: 0, oper: 0, eyePitch: 0, eyeYaw: 0 };
}

const LOD1_AT = 1.6;   // body lengths
const LOD2_AT = 9;

/** set by the app from the quality preset (like the ray's AKAEI_DETAIL) */
export const FISH_DETAIL = { viewScale: 1, allowLod0: true };

export interface FishModel {
  spec: FishSpec;
  /** the fish's own frame (rolled onto the blind side for a flatfish) */
  frame: Group;
  bones: Bone[];
  skeleton: Skeleton;
  lod: LOD;
  look: FishLook;
  levels: Lod[];
}

const IDENTITY = new Matrix4();

/** One fish: its skeleton and the tiers of its species' shared geometry and materials. */
export function buildFishModel(spec: FishSpec, tiers: Lod[] = [0, 1, 2]): FishModel {
  const rest = rigRest(spec);
  const bones = rest.world.map((w, i) => {
    const b = new Bone();
    b.name = i < SPINE_N ? `S${i}` : (['Jaw', 'PecL', 'PecR', 'OperL', 'OperR', 'Eye0', 'Eye1', 'Caud'] as const)[i - SPINE_N];
    b.position.copy(w);
    const pi = rest.parent[i];
    if (pi >= 0) b.position.sub(rest.world[pi]);
    return b;
  });
  bones.forEach((b, i) => { const pi = rest.parent[i]; if (pi >= 0) bones[pi].add(b); });
  const skeleton = new Skeleton(bones, rest.inverses.map((m) => m.clone()));
  const look = fishLook(spec);
  const frame = new Group();
  frame.name = `${spec.id}Frame`;
  if (spec.flat) frame.rotation.z = spec.flat * Math.PI / 2;
  frame.add(bones[0]);
  const lod = new LOD();
  lod.name = `${spec.id}LOD`;
  const T = spec.modelTL;
  const sphere = new Sphere(new Vector3(0, 0, 0), T * 0.75);
  for (const t of tiers) {
    const geo = fishGeometry(spec, t);
    const level = new Group();
    level.name = `${spec.id}LOD${t}`;
    const body = new SkinnedMesh(geo.body, look.body[t]);
    body.name = 'Body';
    level.add(body);
    const fins = new SkinnedMesh(geo.fins, look.fins[t]);
    fins.name = 'Fins';
    fins.renderOrder = 2;
    level.add(fins);
    if (geo.eyes && look.eyes[t]) {
      const eyes = new SkinnedMesh(geo.eyes, look.eyes[t]);
      eyes.name = 'Eyes';
      level.add(eyes);
    }
    for (const m of level.children as SkinnedMesh[]) {
      m.bind(skeleton, IDENTITY);
      m.boundingSphere = sphere;
      m.castShadow = false;
      m.receiveShadow = false;
    }
    lod.addLevel(level, t === 0 ? 0 : (t === 1 ? LOD1_AT : LOD2_AT) * T, 0.1 * T);
  }
  frame.add(lod);
  return { spec, frame, bones, skeleton, lod, look, levels: tiers };
}

/** the tiers' switch distances for a fish drawn at `scale` (and the preset's reach) */
export function setLodDistances(m: FishModel, scale: number, nearOk: boolean): void {
  const T = m.spec.modelTL * scale, v = FISH_DETAIL.viewScale;
  const lv = m.lod.levels;
  for (let i = 1; i < lv.length; i++) {
    const t = m.levels[i];
    if (!nearOk) lv[i].distance = 0;
    else if (t === 1) lv[i].distance = FISH_DETAIL.allowLod0 ? LOD1_AT * T * v : 0;
    else lv[i].distance = LOD2_AT * T * v;
  }
}

export function disposeFishModel(m: FishModel): void {
  m.frame.removeFromParent();
  m.skeleton.dispose();
}

/** amplitude envelope (1 at the tail tip) */
function envelope(spec: FishSpec, s: number): number {
  const [a, b, c] = spec.swim.env;
  return (a + b * s + c * s * s) / (a + b + c);
}

export function midline(spec: FishSpec, s: number, p: SwimPose, phase = p.phase): number {
  const d = s - spec.pivot;
  return p.amp * envelope(spec, s) * Math.sin((2 * Math.PI * s) / spec.swim.lambda - phase) + 0.5 * p.curv * d * d;
}

const ANG: number[] = [];

/** Write a pose into the rig; `detail` 2 = the axial wave only. */
export function applyPose(m: FishModel, p: SwimPose, detail: Lod): void {
  const spec = m.spec, rest = rigRest(spec), sp = rest.sp, b = m.bones, T = spec.modelTL;
  for (let j = 0; j < SPINE_N; j++) {
    const s0 = sp[j], s1 = j < SPINE_N - 1 ? sp[j + 1] : 1;
    ANG[j] = Math.atan2(-(midline(spec, s1, p) - midline(spec, s0, p)), s1 - s0);
  }
  b[0].position.x = rest.world[0].x + midline(spec, sp[0], p) * T;
  b[0].rotation.set(p.headBend * 0.6, ANG[0], 0);
  for (let j = 1; j < SPINE_N; j++) b[j].rotation.set(j === 1 ? -p.headBend * 0.6 : 0, ANG[j] - ANG[j - 1], 0);
  b[BONE_JAW].rotation.set(spec.mouth.open * p.jaw, 0, 0);
  // the caudal fin's rays trail the peduncle's sweep: the tail's angle a moment ago, less the peduncle's now
  const lag = p.phase - 0.75, cb = spec.caudalBase;
  const tip = Math.atan2(-(midline(spec, 1, p, lag) - midline(spec, cb, p, lag)), 1 - cb);
  b[BONE_CAUD].rotation.set(0, 0.55 * (tip - ANG[SPINE_N - 1]), 0);
  if (detail === 2) return;
  // the gill covers swing out about their front edges; the eyes turn in their orbits
  b[BONE_OPERL].rotation.set(0, -0.2 * p.oper, 0.05 * p.oper);
  b[BONE_OPERR].rotation.set(0, 0.2 * p.oper, -0.05 * p.oper);
  b[BONE_EYE0].rotation.set(-p.eyePitch, p.eyeYaw, 0);
  b[BONE_EYE1].rotation.set(-p.eyePitch, p.eyeYaw, 0);
  const rest0 = spec.fins.pectoral.rest, roll = spec.fins.pectoral.roll ?? 0, beat = detail === 0 ? p.pecBeat : 0;
  b[BONE_PECL].rotation.set(0, -(rest0 + 1.0 * p.pecL) - beat * 0.35, roll - beat * 0.5, 'YZX');
  b[BONE_PECR].rotation.set(0, rest0 + 1.0 * p.pecR + beat * 0.35, -roll + beat * 0.5, 'YZX');
  m.look.ripple.amp.value = p.ripple * 0.02 * T;
  m.look.ripple.phase.value = p.ripplePhase;
}

/** the per-fish values of the shared materials, written before each draw: the fins' ripple, the gill covers' opening */
export function hookRipple(m: FishModel, pose: SwimPose): void {
  const T = m.spec.modelTL;
  for (const level of m.lod.levels) {
    for (const o of level.object.children as Object3D[]) {
      const mesh = o as SkinnedMesh;
      if (o.name === 'Fins') {
        mesh.onBeforeRender = () => {
          const r = m.look.ripple;
          r.amp.value = pose.ripple * 0.02 * T;
          r.phase.value = pose.ripplePhase;
          (mesh.material as { uniformsNeedUpdate?: boolean }).uniformsNeedUpdate = true;
        };
      } else if (o.name === 'Eyes') {
        // the iris turned within the cornea: forward / up (+), half the angle in the eye's radii
        mesh.onBeforeRender = () => {
          m.look.gaze.value.set(-0.5 * pose.eyeYaw, 0.5 * pose.eyePitch);
          (mesh.material as { uniformsNeedUpdate?: boolean }).uniformsNeedUpdate = true;
        };
      } else if (o.name === 'Body') {
        mesh.onBeforeRender = () => {
          m.look.gill.open.value = pose.oper;
          (mesh.material as { uniformsNeedUpdate?: boolean }).uniformsNeedUpdate = true;
        };
      }
    }
  }
}
