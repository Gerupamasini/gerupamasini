// Semi-diurnal tide (M2 period 12.42 h) and game clock. Heights in metres relative to mean sea level.
// Designed so the flat is progressively exposed on the ebb (new mud surface → prey activity →
// plovers move down to feed) — docs/behavior.md §5.

export class Tide {
  constructor({ period = 12.42 * 3600, amplitude = 0.9, mean = 0.0, phase = 0, startHour = 7.5, timeScale = 60 } = {}) {
    this.period = period;
    this.amplitude = amplitude;
    this.mean = mean;
    this.phase = phase;
    this.time = startHour * 3600; // game seconds since midnight of day 0
    this.timeScale = timeScale; // game seconds per real second
    this.override = null; // manual tide level (m) for demos
    this.omega = (2 * Math.PI) / period;
  }

  update(realDt) {
    this.time += realDt * this.timeScale;
  }

  levelAt(t) {
    return this.mean + this.amplitude * Math.sin(this.omega * t + this.phase);
  }

  get level() {
    return this.override ?? this.levelAt(this.time);
  }

  /** +1 rising, −1 falling */
  get trend() {
    return Math.cos(this.omega * this.time + this.phase) >= 0 ? 1 : -1;
  }

  get state() {
    const r = (this.level - this.mean) / this.amplitude;
    if (r > 0.85) return 'high';
    if (r < -0.85) return 'low';
    return this.trend > 0 ? 'rising' : 'falling';
  }

  /** Highest level over the last `seconds` (used for the wet band on the terrain). */
  maxLevelSince(seconds) {
    if (this.override != null) return this.override;
    let m = -Infinity;
    const n = 12;
    for (let i = 0; i <= n; i++) m = Math.max(m, this.levelAt(this.time - (seconds * i) / n));
    return m;
  }

  /** Seconds since a point at height h emerged (−1 if submerged, Infinity if never flooded). */
  timeSinceExposed(h) {
    const L = this.level;
    if (L >= h) return -1;
    if (this.override != null) return 3600; // manual mode: treat as recently exposed
    const r = (h - this.mean) / this.amplitude;
    if (r >= 1) return Infinity;
    if (r <= -1) return -1;
    // falling crossing phase θ2 = π − asin(r)
    const th2 = Math.PI - Math.asin(r);
    const th = this.omega * this.time + this.phase;
    let d = (th - th2) % (2 * Math.PI);
    if (d < 0) d += 2 * Math.PI;
    return d / this.omega;
  }

  get hourOfDay() {
    return (this.time / 3600) % 24;
  }

  /** 0 at night … 1 at noon (simple solar model for lighting & activity) */
  get daylight() {
    const h = this.hourOfDay;
    return Math.max(0, Math.sin(((h - 5.5) / 13) * Math.PI));
  }
}
