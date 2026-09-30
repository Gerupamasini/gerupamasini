// Distance-based LOD with hysteresis, measured in *body lengths on screen*
// (projected size), so it is independent of camera FOV and fish size.
//   LOD0 close-up : anatomy-first (full head topology, eye assembly, all fins, micro-animation)
//   LOD1 normal   : same rig, lighter mesh, simplified eye, no gill/mouth interior
//   LOD2 far      : silhouette-first (body + caudal + D2 + pectorals), cheap material,
//                   animation at half rate, no eye/micro channels.
export class EdohazeLOD {
  constructor(fish, { thresholds = [110, 34] } = {}) {
    this.fish = fish; this.level = 0; this.forced = -1;
    this.thresholds = thresholds;  // projected length in pixels: >t0 → LOD0, >t1 → LOD1, else LOD2
    this.frame = (fish.seed * 7) & 1;
  }
  pixelsOnScreen(camera, viewportH) {
    const d = camera.position.distanceTo(this.fish.object.position);
    const fov = (camera.fov * Math.PI) / 180;
    return (this.fish.TL / (2 * Math.tan(fov / 2) * Math.max(d, 1e-4))) * viewportH;
  }
  update(camera, viewportH) {
    let lvl;
    if (this.forced >= 0) lvl = this.forced;
    else {
      const px = this.pixelsOnScreen(camera, viewportH);
      const [t0, t1] = this.thresholds; const h = 1.15;
      lvl = this.level;
      if (lvl === 0 && px < t0 / h) lvl = 1;
      if (lvl === 1 && px > t0 * h) lvl = 0;
      if (lvl === 1 && px < t1 / h) lvl = 2;
      if (lvl === 2 && px > t1 * h) lvl = 1;
      if (lvl === 0 && px < t1 / h) lvl = 2;
      if (lvl === 2 && px > t0 * h) lvl = 0;
    }
    if (lvl !== this.level) { this.level = lvl; this.fish.setLOD(lvl); }
    this.frame++;
    return lvl;
  }
  /** far fish animate on alternating frames; returns dt multiplier (0 = skip) */
  animStep() { return this.level === 2 ? (this.frame & 1 ? 2 : 0) : 1; }
}
