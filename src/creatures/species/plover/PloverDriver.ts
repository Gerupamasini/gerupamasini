import { AdditiveAnimationBlendMode, AnimationAction, AnimationClip, AnimationMixer, AnimationUtils, LoopOnce, LoopRepeat, MathUtils, Object3D, Quaternion, Vector3 } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import { makePlover, type PlaceholderModel } from '../../models/placeholders';
import { turnToward } from '../shrimp/ShrimpDriver';

type Mode = 'idle' | 'walk' | 'run' | 'forage' | 'fly';

/** the baked clips of the plover model (tools: the kentish-plover project's GLB export), by what they are for */
const CLIP = {
  idle: '01_Idle', walk: '02_Walk', run: '03_Run', forage: '05_ForageSearch', peck: ['06_Peck_worm', '06_Peck_crab'],
  preen: ['07_Preen_breast', '07_Preen_belly', '07_Preen_flank', '07_Preen_scapulars', '07_Preen_wing', '07_Preen_tail', '07_Scratch', '07_WingStretch'],
  shake: '07_Shake', rest: ['08_Rest_oneLeg', '08_Rest_tucked', '08_Rest_sit'], alert: '09_Alert', takeoff: '10_Takeoff', flight: '11_Flight', landing: '12_Landing',
} as const;
/** the model's own pace for the walk and run cycles (m/s): the clips are stretched to the speed the bird moves at */
const CLIP_WALK_SPEED = 0.35, CLIP_RUN_SPEED = 1.2;
/** the one-shot gestures (played additively over the loop) */
const GESTURE_CLIPS = new Set<string>([...CLIP.peck, ...CLIP.preen, CLIP.shake, CLIP.alert, CLIP.takeoff, CLIP.landing]);
/**
 * How much of the baked neck and head motion each loop keeps (1 = as exported). The export swings the head some 50°
 * every step and 30° at a 10 Hz run; a plover's head is nearly still as it walks, so the step bob is cut hard and the
 * slower looking-about of the idle and search loops kept more of.
 */
const LOOP_HEAD_GAIN: Record<string, number> = { [CLIP.walk]: 0.3, [CLIP.run]: 0.25, [CLIP.idle]: 0.55, [CLIP.forage]: 0.5, [CLIP.flight]: 0.5 };
const GESTURE_HEAD_GAIN = 0.75;
/** time constant of the neck and head smoothing (s): short enough for a peck, long enough to swallow what bob is left */
const HEAD_SMOOTH_S = 0.12;
const HEAD_TRACK = /^(neck\d|head)\.(quaternion|position)$/;
const _q = new Quaternion(), _q2 = new Quaternion(), _ident = new Quaternion();

/**
 * Scale a clip's neck and head tracks toward a reference pose: the bind pose for a loop, or no motion at all for an
 * additive gesture (whose values are deltas already). The clip is shared by every bird, so this runs once per clip.
 */
function tameHead(clip: AnimationClip, gain: number, rest: Map<string, { q: Quaternion; p: Vector3 }> | null): void {
  for (const t of clip.tracks) {
    const m = HEAD_TRACK.exec(t.name);
    if (!m) continue;
    const bone = m[1], v = t.values;
    if (m[2] === 'quaternion') {
      const ref = rest ? rest.get(bone)?.q : _ident;
      if (!ref) continue;
      for (let i = 0; i + 3 < v.length; i += 4) {
        _q.set(v[i], v[i + 1], v[i + 2], v[i + 3]);
        _q2.copy(ref).slerp(_q, gain);
        v[i] = _q2.x; v[i + 1] = _q2.y; v[i + 2] = _q2.z; v[i + 3] = _q2.w;
      }
    } else {
      const ref = rest ? rest.get(bone)?.p : null;
      const rx = ref?.x ?? 0, ry = ref?.y ?? 0, rz = ref?.z ?? 0;
      for (let i = 0; i + 2 < v.length; i += 3) {
        v[i] = rx + (v[i] - rx) * gain; v[i + 1] = ry + (v[i + 1] - ry) * gain; v[i + 2] = rz + (v[i + 2] - rz) * gain;
      }
    }
  }
}

/**
 * シロチドリ: walking and running along the waterline, pecking, a short escape flight. With the real model the baked
 * clips are played (a layered mixer: the locomotion loop underneath, pecks, preens and the alert on top); the
 * placeholder bird is posed by hand as before.
 */
export class PloverDriver implements Driver {
  private model: PlaceholderModel | null = null;
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private mode: Mode = 'idle';
  private target = new Vector3();
  private timer = 0;
  private phase = 0;
  private peck = 0;
  private peckTimer = 0;
  private alertPose = 0;
  private flyFrom = new Vector3();
  private flyT = 0;
  private flyDur = 1;
  private scale = 1;
  private readonly tmp = new Vector3();
  busy = false;
  // the clip player
  private mixer: AnimationMixer | null = null;
  /** the neck chain and the head, smoothed over ~0.1 s after the mixer so the baked bob does not read as a tremble */
  private readonly steady: { bone: Object3D; q: Quaternion; p: Vector3 }[] = [];
  private clips = new Map<string, AnimationClip>();
  private loop: AnimationAction | null = null;
  private loopName = '';
  private oneShot: AnimationAction | null = null;
  private restVariant: string | null = null;
  private idleFor = 0;
  private nextPreen = 6;

  static makeModel(): PlaceholderModel {
    return makePlover();
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    this.model = (root.userData.placeholder as PlaceholderModel) ?? null;
    this.scale = individual.length_mm / individual.species.model.modelLength_mm;
    root.scale.setScalar(this.scale);
    root.position.set(individual.pos.x, individual.pos.y, individual.pos.z);
    root.rotation.set(0, individual.heading, 0);
    this.disposeMixer();
    const clips = (root.userData.clips as AnimationClip[] | undefined) ?? [];
    if (!this.model && clips.length) {
      this.mixer = new AnimationMixer(root);
      // the bind pose of the neck and head, the reference the baked bob is scaled toward
      const rest = new Map<string, { q: Quaternion; p: Vector3 }>();
      root.traverse((o) => { if ((o as { isBone?: boolean }).isBone && /^(neck\d|head)$/.test(o.name)) rest.set(o.name, { q: o.quaternion.clone(), p: o.position.clone() }); });
      for (const c of clips) {
        this.clips.set(c.name, c);
        if (c.userData.tamed) continue;
        c.userData.tamed = true;
        // gestures are additive deltas from their own first frame, laid over whatever loop is running; blended by
        // weight instead they would average with the loop, and the head would hover between two poses
        if (GESTURE_CLIPS.has(c.name)) { AnimationUtils.makeClipAdditive(c); tameHead(c, GESTURE_HEAD_GAIN, null); }
        else tameHead(c, LOOP_HEAD_GAIN[c.name] ?? 0.55, rest);
      }
      // a finished gesture lets go of its tracks: left clamped at full weight it would keep pulling the head and neck
      // against the walk underneath (a jittery half-blend), so it fades out and the loop has the bird to itself again
      this.mixer.addEventListener('finished', (e) => {
        const a = (e as unknown as { action: AnimationAction }).action;
        a.fadeOut(0.2);
        if (this.oneShot === a) this.oneShot = null;
      });
      this.play(CLIP.idle, 1);
      this.steady.length = 0;
      root.traverse((o) => { if ((o as { isBone?: boolean }).isBone && /^(neck\d|head)$/.test(o.name)) this.steady.push({ bone: o, q: o.quaternion.clone(), p: o.position.clone() }); });
    }
  }

  detach(): void {
    this.steady.length = 0;
    this.disposeMixer();
    this.root = null;
    this.model = null;
  }

  private disposeMixer(): void {
    if (this.mixer) { this.mixer.stopAllAction(); if (this.root) this.mixer.uncacheRoot(this.root); }
    this.mixer = null;
    this.clips.clear();
    this.loop = null;
    this.loopName = '';
    this.oneShot = null;
  }

  /** The locomotion loop underneath everything, cross-faded when it changes. */
  private play(name: string, timeScale: number, fade = 0.18): void {
    const m = this.mixer;
    if (!m) return;
    if (this.loopName === name) { if (this.loop) this.loop.timeScale = timeScale; return; }
    const clip = this.clips.get(name);
    if (!clip) return;
    const next = m.clipAction(clip);
    next.setLoop(LoopRepeat, Infinity);
    next.enabled = true;
    next.timeScale = timeScale;
    next.setEffectiveWeight(1);
    next.reset().play();
    if (this.loop && this.loop !== next) this.loop.crossFadeTo(next, fade, false);
    this.loop = next;
    this.loopName = name;
  }

  /** A gesture laid over the loop: a peck, a preen, the alert, a shake. */
  private gesture(name: string, timeScale = 1): number {
    const m = this.mixer, clip = this.clips.get(name);
    if (!m || !clip) return 0;
    if (this.oneShot) this.oneShot.fadeOut(0.12);
    const a = m.clipAction(clip, undefined, AdditiveAnimationBlendMode);
    a.setLoop(LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = timeScale;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.reset().fadeIn(0.1).play();
    this.oneShot = a;
    return clip.duration / timeScale;
  }

  private pickOne(list: readonly string[]): string {
    return list[Math.floor((this.ind?.rng.next() ?? Math.random()) * list.length)] ?? list[0];
  }

  setIntent(intent: Intent): void {
    this.busy = true;
    this.timer = intent.seconds > 0 ? intent.seconds : 6;
    // an intent can arrive before the model is attached: then the bird's own spot stands in for a missing target
    const here = this.ind?.pos ?? intent.from ?? this.target;
    switch (intent.kind) {
      case 'rest': this.mode = 'idle'; break;
      case 'wander': case 'moveTo':
        this.mode = 'walk';
        this.target.copy(intent.target ?? here);
        this.emit('walk');
        break;
      case 'flee':
        this.target.copy(intent.target ?? here);
        if (intent.param === 'flight') {
          this.mode = 'fly';
          this.flyFrom.copy(here);
          this.flyT = 0;
          const dist = this.flyFrom.distanceTo(this.target);
          this.flyDur = Math.max(2.5, dist / 7 + 1.2);
          this.timer = this.flyDur + 0.5;
          this.emit('flee_flight');
          this.gesture(CLIP.takeoff);
        } else {
          this.mode = 'run';
          this.emit('run');
        }
        break;
      case 'forage':
        this.mode = 'forage';
        this.peckTimer = 0.5;
        break;
      case 'display':
        this.mode = 'idle';
        this.alertPose = 1;
        this.emit('alert');
        this.gesture(CLIP.alert);
        break;
      default: this.mode = 'idle';
    }
    if (intent.kind !== 'rest') { this.restVariant = null; this.idleFor = 0; }
  }

  update(dt: number, ctx: DriverContext): void {
    const root = this.root, ind = this.ind, m = this.model;
    if (!root || !ind) return;
    const sdt = dt * ctx.simScale;
    this.timer -= sdt;
    let speed = 0;
    let height = 0;
    const walkTo = (sp: number): boolean => {
      const dx = this.target.x - ind.pos.x, dz = this.target.z - ind.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) return true;
      ind.heading = turnToward(ind.heading, Math.atan2(dx, dz), 5 * sdt);
      speed = sp;
      const step = Math.min(dist, sp * sdt);
      const nx = ind.pos.x + Math.sin(ind.heading) * step, nz = ind.pos.z + Math.cos(ind.heading) * step;
      if (ctx.floor.waterAt(nx, nz) - ctx.floor.heightAt(nx, nz) < 0.04) { ind.pos.x = nx; ind.pos.z = nz; }
      else return true;
      return false;
    };
    switch (this.mode) {
      case 'walk': if (walkTo(0.35)) this.busy = false; break;
      case 'run': if (walkTo(1.2)) this.busy = false; break;
      case 'forage': {
        this.peckTimer -= sdt;
        if (this.peckTimer <= 0) {
          if (this.peck <= 0 && ind.rng.chance(0.6)) {
            this.peck = this.mixer ? this.gesture(this.pickOne(CLIP.peck)) : 0.45;
            this.emit('forage_peck');
            this.peckTimer = this.peck + ind.rng.range(0.4, 1.4);
          } else {
            const ang = ind.heading + ind.rng.range(-1.0, 1.0);
            this.target.set(ind.pos.x + Math.sin(ang) * ind.rng.range(0.3, 1.2), 0, ind.pos.z + Math.cos(ang) * ind.rng.range(0.3, 1.2));
            this.peckTimer = ind.rng.range(0.8, 1.8);
          }
        }
        if (this.peck <= 0) walkTo(0.4);
        break;
      }
      case 'fly': {
        this.flyT += sdt;
        const u = MathUtils.clamp(this.flyT / this.flyDur, 0, 1);
        const e = u * u * (3 - 2 * u);
        ind.pos.x = MathUtils.lerp(this.flyFrom.x, this.target.x, e);
        ind.pos.z = MathUtils.lerp(this.flyFrom.z, this.target.z, e);
        height = Math.sin(u * Math.PI) * 4;
        ind.heading = turnToward(ind.heading, Math.atan2(this.target.x - this.flyFrom.x, this.target.z - this.flyFrom.z), 6 * sdt);
        speed = 7;
        if (this.mixer) {
          if (u > 0.12 && u < 0.82) this.play(CLIP.flight, 1, 0.25);
          else if (u >= 0.82 && this.loopName !== CLIP.landing) { this.play(CLIP.landing, 1, 0.2); }
        }
        if (u >= 1) { this.mode = 'idle'; this.busy = false; ind.alert = 0.6; if (this.mixer) this.gesture(CLIP.shake); }
        break;
      }
      default: break;
    }
    this.peck = Math.max(0, this.peck - sdt);
    if (this.timer <= 0 && this.mode !== 'fly') this.busy = false;
    if (!this.busy && this.mode !== 'idle') this.mode = 'idle';
    if (this.mode === 'idle') this.alertPose = MathUtils.damp(this.alertPose, 0, 0.6, sdt);
    const ground = ctx.floor.heightAt(ind.pos.x, ind.pos.z);
    ind.pos.y = ground + height;
    root.position.set(ind.pos.x, ind.pos.y, ind.pos.z);
    root.rotation.set(0, ind.heading, 0);
    this.phase += sdt * (speed > 2 ? 50 : speed > 0.8 ? 22 : speed > 0 ? 12 : 0.5);
    if (this.mixer) this.animateClips(sdt, speed);
    else if (m) this.animatePlaceholder(speed);
  }

  /** The clip player: the loop for what the bird does, a rest pose or a preen when it has stood still a while. */
  private animateClips(sdt: number, speed: number): void {
    const ind = this.ind!;
    if (this.mode === 'fly') { /* takeoff, flight and landing are set in the flight itself */ }
    else if (speed > 0.8) this.play(CLIP.run, Math.max(0.6, speed / CLIP_RUN_SPEED));
    else if (speed > 0) this.play(CLIP.walk, Math.max(0.6, speed / CLIP_WALK_SPEED));
    else if (this.mode === 'forage') this.play(CLIP.forage, 1);
    else if (this.restVariant) this.play(this.restVariant, 1, 0.5);
    else this.play(CLIP.idle, 1);
    if (speed === 0 && this.mode !== 'fly' && this.alertPose < 0.3) {
      // standing still: now and then a preen or a stretch; after a long while, settle into a rest pose
      this.idleFor += sdt;
      this.nextPreen -= sdt;
      if (this.nextPreen <= 0 && !this.oneShot?.isRunning()) {
        this.gesture(this.pickOne(CLIP.preen));
        this.nextPreen = ind.rng.range(5, 14);
      }
      if (this.mode === 'idle' && this.idleFor > 8 && !this.restVariant && ind.rng.chance(0.015)) this.restVariant = this.pickOne(CLIP.rest);
    } else {
      this.idleFor = 0;
      if (this.restVariant && speed > 0) this.restVariant = null;
    }
    this.mixer!.update(sdt);
    // the head is steadied: a plover's head hardly bobs; the baked cadence is damped to a sway
    const k = 1 - Math.exp(-sdt / HEAD_SMOOTH_S);
    for (const s of this.steady) {
      s.q.slerp(s.bone.quaternion, k);
      s.bone.quaternion.copy(s.q);
      s.p.lerp(s.bone.position, k);
      s.bone.position.copy(s.p);
    }
  }

  private animatePlaceholder(speed: number): void {
    const m = this.model!;
    const flying = this.mode === 'fly';
    const legL = m.parts.legL, legR = m.parts.legR;
    if (legL && legR) {
      const amp = flying ? 0 : speed > 0 ? 0.6 : 0;
      legL.rotation.x = Math.sin(this.phase) * amp + (flying ? 1.2 : 0);
      legR.rotation.x = -Math.sin(this.phase) * amp + (flying ? 1.2 : 0);
    }
    const body = m.parts.body;
    if (body) {
      body.position.y = 0.075 + (speed > 0 && !flying ? Math.abs(Math.sin(this.phase)) * 0.004 : 0) + (flying ? 0.02 : 0);
      body.rotation.x = flying ? -0.15 : 0;
    }
    const neck = m.parts.neck;
    if (neck) {
      const peckAng = this.peck > 0 ? Math.sin((this.peck / 0.45) * Math.PI) * 1.1 : 0;
      neck.rotation.x = peckAng - this.alertPose * 0.25;
      neck.position.y = 0.016 + this.alertPose * 0.012;
    }
    const wl = m.parts.wingL, wr = m.parts.wingR;
    if (wl && wr) {
      const fold = flying ? 0 : 1.25;
      const flap = flying ? Math.sin(this.phase) * 0.9 : 0;
      wl.rotation.z = fold + flap;
      wr.rotation.z = -fold - flap;
    }
  }

  onEvent(cb: (e: BehaviorEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(behaviorId: string): void {
    if (!this.ind) return;
    const e: BehaviorEvent = { individualId: this.ind.id, behaviorId, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  anchor(): Vector3 {
    return this.root ? this.tmp.copy(this.root.position).add(new Vector3(0, 0.08 * this.scale, 0)) : this.tmp.set(0, 0, 0);
  }

  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}
