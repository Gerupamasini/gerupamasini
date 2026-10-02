// Flock spawn layout for the tidal-flat demo (src/demo/main.js) and tools/dev/gaitjitter.mjs.
// Every bird is placed on exposed ground: above the current water level and above the level the tide
// will reach over the next `lookahead` game seconds, so a flock spawned on a rising tide, or across the
// creek, never starts in water too deep to wade (SURFACE_RULES.deepWaterDepth) and stranded.

/** Highest tide level from now to now + lookahead (game seconds). */
export function spawnWaterLevel(tide, lookahead = 1800) {
  if (tide.override != null) return tide.override;
  let m = -Infinity;
  const n = 12;
  for (let i = 0; i <= n; i++) m = Math.max(m, tide.levelAt(tide.time + (lookahead * i) / n));
  return m;
}

/** z (seaward scan) where the ground drops to ~0.25 m above `level`: the feeding band near the edge. */
export function findShoreZ(terrain, level, x) {
  for (let z = 80; z > -140; z -= 0.5) if (terrain.heightAt(x, z) < level + 0.25) return z;
  return 0;
}

/**
 * n spawn points {x, z} on dry ground. The preferred layout is the original elliptical scatter around
 * the shore band; a point that would be wet is moved to the nearest dry spot (spiral search),
 * keeping birds at least `spacing` apart.
 */
export function flockSpawnPoints(terrain, tide, n, { cx = 0, margin = 0.03, spacing = 0.4, lookahead = 1800 } = {}) {
  const level = spawnWaterLevel(tide, lookahead);
  const dry = (x, z) => terrain.heightAt(x, z) > level + margin;
  let cz = findShoreZ(terrain, level, cx) + 1.5;
  while (!dry(cx, cz) && cz < 120) cz += 0.5; // the centre itself can sit in the creek
  const pts = [];
  const free = (x, z) => dry(x, z) && pts.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 >= spacing * spacing);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i;
    const r = 1.5 + (i % 5) * 1.4;
    const px = cx + Math.cos(a) * r * 2.2;
    const pz = cz + Math.sin(a) * r * 0.8;
    let best = free(px, pz) ? { x: px, z: pz } : null;
    for (let rr = 0.5; !best && rr <= 40; rr += 0.5) {
      const steps = Math.ceil((2 * Math.PI * rr) / 0.5);
      for (let k = 0; k < steps; k++) {
        // start toward the flock centre so relocated birds stay with the group
        const t = Math.atan2(cz - pz, cx - px) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ((2 * Math.PI) / steps);
        const x = px + Math.cos(t) * rr;
        const z = pz + Math.sin(t) * rr;
        if (free(x, z)) {
          best = { x, z };
          break;
        }
      }
    }
    if (!best) {
      // last resort: straight up-shore until dry
      let z = pz;
      while (!dry(px, z) && z < 120) z += 0.5;
      best = { x: px, z };
    }
    pts.push(best);
  }
  return pts;
}
