import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Input } from '../core/Input';
import type { Terrain } from '../world/Terrain';
import type { Habitat } from '../world/Habitat';
import type { MapDef } from '../data/schemas';

export const EYE_HEIGHT = 1.5;
export const CROUCH_HEIGHT = 0.55;
/** the low, near-the-water view the flat starts in */
export const LOW_HEIGHT = 0.45;
export const BOOT_DEPTH = 0.35;
const WALK = 1.7, RUN = 4.5, CROUCH = 1.3;
const FOV_NORMAL = 70, FOV_ZOOM = 32;
/** the jump: take-off speed (m/s) and gravity; a jump out of a run carries the run's speed and a little more */
const JUMP_V = 2.9, GRAVITY = 13.5, DASH_BOOST = 1.6, DASH_MIN_RUN = 0.6;

/** First-person walker on the terrain with wading limits. */
export class FPSController {
  readonly position = new Vector3();
  yaw = 0;
  pitch = 0;
  crouching = false;
  running = false;
  enabled = true;
  /** true when the last movement attempt was stopped by deep water */
  blockedByDepth = false;
  depthHere = 0;
  speedNow = 0;
  /** standing eye height (metres) */
  eyeHeight = EYE_HEIGHT;
  /** low view (near the water) or standing; toggled with the crouch key, starts low */
  lowView = true;
  private eye = LOW_HEIGHT;
  private bob = 0;
  private fov = FOV_NORMAL;
  zooming = false;
  /** a narrower field forced by the tool in hand (the binoculars), degrees; null for the usual zoom key */
  zoomFov: number | null = null;
  /** short pitch nudge (radians) that decays: the swing of the net */
  private kick = 0;
  /** in the air: height above the ground and vertical speed; the dash is the horizontal speed carried through the jump */
  private airY = 0;
  private vy = 0;
  /** absolute height of the feet while in the air (m) */
  private jumpBaseY = 0;
  private airTime = 0;
  private dashVX = 0;
  private dashVZ = 0;
  airborne = false;
  /** true for the frame the feet leave the ground (the HUD's hop) */
  jumped = false;
  private readonly tmpForward = new Vector3();
  private readonly tmpRight = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly terrain: Terrain,
    private readonly habitat: Habitat,
    private readonly input: Input,
    private readonly map: MapDef,
  ) {
    this.position.set(map.spawnStart.x, 0, map.spawnStart.z);
    this.yaw = MathUtils.degToRad(map.spawnStart.heading);
    this.position.y = terrain.heightAt(this.position.x, this.position.z);
    this.syncCamera(0);
  }

  get forward(): Vector3 {
    return this.tmpForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  setPose(x: number, z: number, yaw: number, pitch?: number): void {
    this.position.set(x, this.terrain.heightAt(x, z), z);
    this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.syncCamera(0);
  }

  /** Nudge the view down (or up when negative); it settles back over a few frames. */
  applyKick(radians: number): void {
    this.kick += radians;
  }

  /** Hold still (capture, dialogs) but keep the camera settled on the body. */
  idle(dt: number): void {
    this.speedNow = 0;
    this.syncCamera(dt);
  }

  /** Reset the field of view (e.g. when leaving the field). */
  resetFov(): void {
    this.fov = FOV_NORMAL;
    this.camera.fov = FOV_NORMAL;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, sensitivity: number, invertY: boolean): void {
    const input = this.input;
    if (this.enabled && input.looking) {
      const look = 0.0022 * sensitivity * (this.zoomFov !== null ? Math.max(0.1, this.zoomFov / FOV_NORMAL) : this.zooming ? 0.45 : 1);
      this.yaw -= input.mouseDX * look;
      this.pitch -= input.mouseDY * look * (invertY ? -1 : 1);
      this.pitch = MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    }
    if (this.enabled && input.pressed('crouch')) this.lowView = !this.lowView;
    // the low view is a stance, not a key held: it stays while a tool is used
    this.crouching = this.lowView;
    this.running = this.enabled && !this.crouching && input.held('run');
    this.zooming = this.enabled && (input.mouseRightDown || input.held('zoom'));
    const targetFov = this.zoomFov ?? (this.zooming ? FOV_ZOOM : FOV_NORMAL);
    if (Math.abs(this.fov - targetFov) > 0.05) {
      this.fov = MathUtils.damp(this.fov, targetFov, 12, dt);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    let mx = 0, mz = 0;
    if (this.enabled) {
      if (input.held('forward')) mz += 1;
      if (input.held('back')) mz -= 1;
      if (input.held('right')) mx += 1;
      if (input.held('left')) mx -= 1;
    }
    const len = Math.hypot(mx, mz);
    this.blockedByDepth = false;
    this.speedNow = 0;
    this.jumped = false;
    // the jump: off the ground (not from deep water), a hop; out of a run, a long jump that keeps the run's pace
    // (Space held keeps jumping: the next hop leaves the ground as soon as the feet touch it)
    if (this.enabled && !this.airborne && (input.pressed('jump') || input.held('jump')) && this.depthHere < 0.25) {
      this.airborne = true;
      this.jumped = true;
      this.vy = JUMP_V * (this.crouching ? 0.85 : 1);
      this.airY = 0.001;
      this.jumpBaseY = this.position.y;
      this.airTime = 0;
      const runFrac = this.running && len > 0 ? 1 : 0;
      const fwd = this.forward;
      this.tmpRight.set(-fwd.z, 0, fwd.x);
      const dx = len > 0 ? (fwd.x * mz + this.tmpRight.x * mx) / len : 0, dz = len > 0 ? (fwd.z * mz + this.tmpRight.z * mx) / len : 0;
      // (capped: a chain of jumps must not keep multiplying the speed carried from the last one)
      const carry = Math.min(RUN * DASH_BOOST, Math.max(this.speedNowLast, runFrac * RUN * DASH_MIN_RUN) * (runFrac ? DASH_BOOST : 1));
      this.dashVX = dx * carry; this.dashVZ = dz * carry;
      this.kick -= runFrac ? 0.06 : 0.03;
    }
    if (this.airborne) {
      // in the air the feet carry on with the take-off speed; the keys only steer a little
      this.vy -= GRAVITY * dt;
      this.jumpBaseY += this.vy * dt;
      const steer = 1.2 * dt;
      if (len > 0) {
        const fwd = this.forward;
        this.tmpRight.set(-fwd.z, 0, fwd.x);
        this.dashVX += (fwd.x * mz + this.tmpRight.x * mx) / len * steer;
        this.dashVZ += (fwd.z * mz + this.tmpRight.z * mx) / len * steer;
      }
      this.tryMove(this.dashVX * dt, this.dashVZ * dt);
      this.speedNow = Math.hypot(this.dashVX, this.dashVZ);
      // the flight is in absolute height: the eye glides over ripples and hollows instead of jittering with the
      // ground under the feet; it lands where the ground comes up to meet it
      const groundNow = this.terrain.heightAt(this.position.x, this.position.z);
      this.airY = this.jumpBaseY - groundNow;
      this.airTime += dt;
      // down on the ground: falling onto it, or rising ground catching the feet (not in the first instant of the hop)
      if (this.airY <= 0 && (this.vy <= 0 || this.airTime > 0.06)) {
        this.airborne = false;
        this.airY = 0;
        this.vy = 0;
        this.dashVX = this.dashVZ = 0;
        this.kick += 0.05;   // the landing
      }
    } else if (len > 0) {
      mx /= len; mz /= len;
      const fwd = this.forward;
      this.tmpRight.set(-fwd.z, 0, fwd.x);
      const dir = new Vector3().addScaledVector(fwd, mz).addScaledVector(this.tmpRight, mx);
      let speed = this.running ? RUN : this.crouching ? CROUCH : WALK;
      const sub = this.terrain.substrateAt(this.position.x, this.position.z);
      if (sub === 'mud' || sub === 'channel') speed *= 0.65;
      else if (sub === 'muddy_sand') speed *= 0.85;
      const depth = Math.max(0, this.habitat.depthAt(this.position.x, this.position.z));
      speed *= 1 - 0.6 * MathUtils.clamp(depth / BOOT_DEPTH, 0, 1);
      // slope: slower uphill
      const n = this.terrain.normalAt(this.position.x, this.position.z);
      const slope = -(n.x * dir.x + n.z * dir.z);
      speed *= MathUtils.clamp(1 - slope * 2, 0.5, 1.2);
      const step = speed * dt;
      this.tryMove(dir.x * step, dir.z * step);
      this.speedNow = speed;
      this.bob += dt * speed * 1.8;
    }
    this.speedNowLast = this.speedNow;
    this.depthHere = this.habitat.depthAt(this.position.x, this.position.z);
    this.position.y = this.terrain.heightAt(this.position.x, this.position.z);
    this.syncCamera(dt);
  }

  private speedNowLast = 0;

  private canStand(x: number, z: number): boolean {
    const b = this.map.bounds.walkable;
    if (x < b[0][0] || x > b[1][0] || z < b[0][1] || z > b[1][1]) return false;
    for (const ne of this.map.bounds.noEntry) if (x >= ne[0][0] && x <= ne[1][0] && z >= ne[0][1] && z <= ne[1][1]) return false;
    if (this.habitat.depthAt(x, z) > BOOT_DEPTH) return false;
    const h = this.terrain.heightAt(x, z);
    if (h - this.position.y > 0.6) return false; // too steep a step
    return true;
  }

  private tryMove(dx: number, dz: number): void {
    const { x, z } = this.position;
    if (this.canStand(x + dx, z + dz)) { this.position.x += dx; this.position.z += dz; return; }
    if (this.canStand(x + dx, z)) { this.position.x += dx; this.blockedByDepth = true; return; }
    if (this.canStand(x, z + dz)) { this.position.z += dz; this.blockedByDepth = true; return; }
    this.blockedByDepth = this.habitat.depthAt(x + dx, z + dz) > BOOT_DEPTH;
  }

  private syncCamera(dt: number): void {
    const targetEye = this.crouching ? LOW_HEIGHT : this.eyeHeight;
    this.eye = dt > 0 ? MathUtils.damp(this.eye, targetEye, 10, dt) : targetEye;
    const bobY = this.speedNow > 0 && !this.airborne ? Math.sin(this.bob * 2) * 0.012 * Math.min(1, this.speedNow / WALK) : 0;
    this.camera.position.set(this.position.x, this.position.y + this.eye + bobY + this.airY, this.position.z);
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotation.y = this.yaw;
    if (dt > 0) this.kick = MathUtils.damp(this.kick, 0, 7, dt);
    this.camera.rotation.x = this.pitch + this.kick;
  }
}
