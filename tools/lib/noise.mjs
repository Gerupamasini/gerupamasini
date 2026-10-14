// Deterministic hash / noise helpers used by the texture bakers.

export function hash3i(x, y, z, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647 + seed * 1274126177;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

export function hash01(x, y, z, seed = 0) {
  return hash3i(x, y, z, seed) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function grad(ix, iy, iz, seed, dx, dy, dz) {
  const h = hash3i(ix, iy, iz, seed) & 15;
  const u = h < 8 ? dx : dy;
  const v = h < 4 ? dy : h === 12 || h === 14 ? dx : dz;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

/** Perlin gradient noise, range ~[-1, 1]. */
export function perlin3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const n000 = grad(ix, iy, iz, seed, fx, fy, fz);
  const n100 = grad(ix + 1, iy, iz, seed, fx - 1, fy, fz);
  const n010 = grad(ix, iy + 1, iz, seed, fx, fy - 1, fz);
  const n110 = grad(ix + 1, iy + 1, iz, seed, fx - 1, fy - 1, fz);
  const n001 = grad(ix, iy, iz + 1, seed, fx, fy, fz - 1);
  const n101 = grad(ix + 1, iy, iz + 1, seed, fx - 1, fy, fz - 1);
  const n011 = grad(ix, iy + 1, iz + 1, seed, fx, fy - 1, fz - 1);
  const n111 = grad(ix + 1, iy + 1, iz + 1, seed, fx - 1, fy - 1, fz - 1);
  const x00 = n000 + u * (n100 - n000);
  const x10 = n010 + u * (n110 - n010);
  const x01 = n001 + u * (n101 - n001);
  const x11 = n011 + u * (n111 - n011);
  const y0 = x00 + v * (x10 - x00);
  const y1 = x01 + v * (x11 - x01);
  return (y0 + w * (y1 - y0)) * 0.97;
}

export function fbm3(x, y, z, octaves = 4, seed = 0, lac = 2.03, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * perlin3(x * f, y * f, z * f, seed + i * 17);
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n;
}

export function ridged3(x, y, z, octaves = 4, seed = 0) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * (1 - Math.abs(perlin3(x * f, y * f, z * f, seed + i * 31)));
    n += a;
    a *= 0.5;
    f *= 2.07;
  }
  return s / n;
}

/**
 * Iterate jittered feature points of a 3D cell lattice (cell size 1) around p.
 * cb(fx, fy, fz, id, cx, cy, cz) is called for each of the 27 neighbour points.
 */
export function forEachCell3(x, y, z, seed, cb) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, cz = iz + k;
        const h = hash3i(cx, cy, cz, seed);
        const fx = cx + ((h & 1023) / 1023) * 0.9 + 0.05;
        const fy = cy + (((h >>> 10) & 1023) / 1023) * 0.9 + 0.05;
        const fz = cz + (((h >>> 20) & 1023) / 1023) * 0.9 + 0.05;
        cb(fx, fy, fz, h, cx, cy, cz);
      }
}

/** 2D Worley F1/F2 with ids (cell size 1). */
export function worley2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0, px = 0, py = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const h = hash3i(cx, cy, 7, seed);
      const fx = cx + (h & 65535) / 65535;
      const fy = cy + (h >>> 16) / 65535;
      const d = Math.hypot(fx - x, fy - y);
      if (d < f1) { f2 = f1; f1 = d; id = h; px = fx; py = fy; } else if (d < f2) f2 = d;
    }
  return { f1, f2, id, px, py };
}

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
