import { MathUtils, type PerspectiveCamera } from 'three';
import type { FlatField } from './FlatField';
import { WALK_HALF } from './gen/generate';

/**
 * First-person walker for the flat: the walkable square is 300 × 300 m; mud and water slow the pace; water deeper
 * than a wader's boots stops it. Mouse look (pointer lock, or drag where the lock is refused), WASD / arrows,
 * Shift to run, C to crouch to the water's level.
 */
export class Walker {
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  eye = 1.6;
  crouch = false;
  private eyeNow = 1.6;
  private bob = 0;
  private readonly keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  locked = false;
  enabled = true;
  speed = 0;

  constructor(private readonly camera: PerspectiveCamera, private readonly field: FlatField, private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      if (e.code === 'KeyC') this.crouch = !this.crouch;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.enabled || this.locked) return;
      try {
        const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => undefined);
      } catch { /* drag fallback below */ }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    canvas.addEventListener('pointerdown', (e) => { if (!this.locked) { this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY; } });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (this.locked) this.look(e.movementX, e.movementY);
      else if (this.dragging) { this.look(e.clientX - this.lastX, e.clientY - this.lastY); this.lastX = e.clientX; this.lastY = e.clientY; }
    });
  }

  private look(dx: number, dy: number): void {
    this.yaw -= dx * 0.0022;
    this.pitch = MathUtils.clamp(this.pitch - dy * 0.0022, -1.5, 1.4);
  }

  setPose(x: number, z: number, yaw: number, pitch = this.pitch): void {
    this.x = MathUtils.clamp(x, -WALK_HALF, WALK_HALF);
    this.z = MathUtils.clamp(z, -WALK_HALF, WALK_HALF);
    this.yaw = yaw;
    this.pitch = pitch;
    this.eyeNow = this.crouch ? 0.5 : this.eye;
    this.sync(0);
  }

  private canStand(x: number, z: number): boolean {
    if (Math.abs(x) > WALK_HALF || Math.abs(z) > WALK_HALF) return false;
    return this.field.depthAt(x, z) < 0.55;
  }

  update(dt: number): void {
    let mx = 0, mz = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    }
    this.speed = 0;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const dx = fx * mz - fz * mx, dz = fz * mz + fx * mx;
      const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      let v = this.crouch ? 0.8 : run ? 4.2 : 1.5;
      const mud = this.field.mudAt(this.x, this.z);
      v *= 1 - 0.4 * mud;
      const depth = this.field.depthAt(this.x, this.z);
      v *= 1 - 0.55 * Math.min(1, depth / 0.4);
      const sx = dx * v * dt, sz = dz * v * dt;
      if (this.canStand(this.x + sx, this.z + sz)) { this.x += sx; this.z += sz; }
      else if (this.canStand(this.x + sx, this.z)) this.x += sx;
      else if (this.canStand(this.x, this.z + sz)) this.z += sz;
      this.speed = v;
      this.bob += dt * v * 1.9;
    }
    this.sync(dt);
  }

  private sync(dt: number): void {
    const target = this.crouch ? 0.5 : this.eye;
    this.eyeNow = dt > 0 ? MathUtils.damp(this.eyeNow, target, 6, dt) : target;
    const ground = this.field.heightAt(this.x, this.z);
    // stand on the water when wading (the eye is above the surface, never below it)
    const water = this.field.waterLevelAt(this.x, this.z);
    const bobY = this.speed > 0 ? Math.sin(this.bob * 2) * 0.014 * Math.min(1, this.speed / 1.5) : 0;
    let y = ground + this.eyeNow + bobY;
    if (water !== null) y = Math.max(y, water + 0.12);
    this.camera.position.set(this.x, y, this.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
  }
}
