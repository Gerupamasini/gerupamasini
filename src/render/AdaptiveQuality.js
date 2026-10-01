// Adaptive quality: keeps the frame rate up on any device by stepping render
// resolution and the expensive passes down (and cautiously back up) from the
// measured frame time. Phones / tablets start a few levels lower.

import * as THREE from 'three';

// shafts: the additive in-water light slabs (pure overdraw, first to go)
export const QUALITY_LEVELS = [
  { name: 'ultra', pr: 2.0, samples: 4, dof: true, refl: true, bloom: true, lens: true, shafts: true },
  { name: 'high', pr: 1.5, samples: 4, dof: true, refl: true, bloom: true, lens: true, shafts: true },
  { name: 'medium', pr: 1.0, samples: 4, dof: true, refl: true, bloom: true, lens: true, shafts: true },
  { name: 'low', pr: 0.85, samples: 2, dof: false, refl: true, bloom: true, lens: true, shafts: false },
  { name: 'lower', pr: 0.72, samples: 0, dof: false, refl: false, bloom: true, lens: false, shafts: false },
  { name: 'minimal', pr: 0.6, samples: 0, dof: false, refl: false, bloom: false, lens: false, shafts: false },
];

export function isMobileDevice() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.screen?.width || 1e4, window.screen?.height || 1e4) < 820;
  return coarse && small;
}

export class AdaptiveQuality {
  constructor(app, { mode = 'auto' } = {}) {
    this.app = app;
    const byName = QUALITY_LEVELS.findIndex((l) => l.name === mode);
    this.auto = byName < 0;
    this.level = byName >= 0 ? byName : isMobileDevice() ? 3 : 1;
    this.failed = new Set();
    this.acc = 0;
    this.n = 0;
    this.warm = 2.5; // seconds ignored after start / after each change
    this.goodWindows = 0;
    this.apply();
  }

  get current() {
    return QUALITY_LEVELS[this.level];
  }

  apply() {
    const L = this.current;
    const app = this.app;
    const pr = Math.min(L.pr, window.devicePixelRatio || 1);
    app.renderer.setPixelRatio(pr);
    app._resize();
    if (app.post) {
      app.post.setSamples(L.samples);
      app.post.dof.enabled = L.dof && app.dofEnabled !== false;
      app.post.bloom.enabled = L.bloom;
      app.post.lens.enabled = L.lens;
    }
    if (app.world) {
      app.world.surface.useReflection = L.refl;
      app.world.shafts.group.visible = L.shafts;
    }
    this.warm = 2.5;
    this.acc = 0;
    this.n = 0;
  }

  set(index) {
    this.level = THREE.MathUtils.clamp(index, 0, QUALITY_LEVELS.length - 1);
    this.apply();
  }

  /** Feed the real (wall-clock) frame interval in seconds. */
  sample(dt) {
    if (!this.auto || document.hidden) return;
    if (this.warm > 0) {
      this.warm -= dt;
      return;
    }
    this.acc += dt;
    this.n++;
    if (this.acc < 2.0) return;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;
    if (avg > 1 / 42 && this.level < QUALITY_LEVELS.length - 1) {
      this.failed.add(this.level);
      this.goodWindows = 0;
      this.set(this.level + 1);
    } else if (avg < 1 / 57) {
      this.goodWindows++;
      if (this.goodWindows >= 3 && this.level > 0 && !this.failed.has(this.level - 1)) {
        this.goodWindows = 0;
        this.set(this.level - 1);
      }
    } else this.goodWindows = 0;
  }
}
