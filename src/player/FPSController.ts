import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Input } from '../core/Input';
import type { Terrain } from '../world/Terrain';
import type { Habitat } from '../world/Habitat';
import type { MapDef } from '../data/schemas';

export const EYE_HEIGHT = 1.5;
export const CROUCH_HEIGHT = 0.55;
export const BOOT_DEPTH = 0.35;
const WALK = 1.7, RUN = 4.5, CROUCH = 0.7;
const FOV_NORMAL = 70, FOV_ZOOM = 32;

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
  private eye = EYE_HEIGHT;
  private bob = 0;
  private fov = FOV_NORMAL;
  zooming = false;
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

  /** Reset the field of view (e.g. when leaving the field). */
  resetFov(): void {
    this.fov = FOV_NORMAL;
    this.camera.fov = FOV_NORMAL;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, sensitivity: number, invertY: boolean): void {
    const input = this.input;
    if (this.enabled && input.pointerLocked) {
      const look = 0.0022 * sensitivity * (this.zooming ? 0.45 : 1);
      this.yaw -= input.mouseDX * look;
      this.pitch -= input.mouseDY * look * (invertY ? -1 : 1);
      this.pitch = MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    }
    this.crouching = this.enabled && input.held('crouch');
    this.running = this.enabled && !this.crouching && input.held('run');
    this.zooming = this.enabled && (input.mouseRightDown || input.held('zoom'));
    const targetFov = this.zooming ? FOV_ZOOM : FOV_NORMAL;
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
    if (len > 0) {
      mx /= len; mz /= len;
      const fwd = this.forward;
      this.tmpRight.set(-fwd.z, 0, fwd.x);
      const dir = new Vector3().addScaledVector(fwd, mz).addScaledVector(this.tmpRight, mx);
      let speed = this.crouching ? CROUCH : this.running ? RUN : WALK;
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
    this.depthHere = this.habitat.depthAt(this.position.x, this.position.z);
    this.position.y = this.terrain.heightAt(this.position.x, this.position.z);
    this.syncCamera(dt);
  }

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
    const targetEye = this.crouching ? CROUCH_HEIGHT : EYE_HEIGHT;
    this.eye = dt > 0 ? MathUtils.damp(this.eye, targetEye, 10, dt) : targetEye;
    const bobY = this.speedNow > 0 ? Math.sin(this.bob * 2) * 0.012 * Math.min(1, this.speedNow / WALK) : 0;
    this.camera.position.set(this.position.x, this.position.y + this.eye + bobY, this.position.z);
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }
}
