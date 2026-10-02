/**
 * Per-cell ground normal and curvature, baked for the shaders (RGBA8):
 *   R, G  normal x and z (×0.5 + 0.5)
 *   B     concavity over ~1 m (0.5 flat; > 0.5 hollow, < 0.5 crest) — ambient occlusion and wetness
 *   A     slope magnitude (0…1 → 0…0.5)
 */
export function bakeNormals(H: Float32Array, n: number, cell: number): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  const r = Math.max(1, Math.round(1 / cell));
  for (let j = 0; j < n; j++) {
    const jd = j > 0 ? j - 1 : j, ju = j < n - 1 ? j + 1 : j;
    const jd2 = Math.max(0, j - r), ju2 = Math.min(n - 1, j + r);
    for (let i = 0; i < n; i++) {
      const il = i > 0 ? i - 1 : i, ir = i < n - 1 ? i + 1 : i;
      const k = j * n + i;
      const hx = (H[j * n + ir] - H[j * n + il]) / ((ir - il) * cell);
      const hz = (H[ju * n + i] - H[jd * n + i]) / ((ju - jd) * cell);
      const len = Math.hypot(hx, 1, hz);
      const il2 = Math.max(0, i - r), ir2 = Math.min(n - 1, i + r);
      const lap = (H[j * n + il2] + H[j * n + ir2] + H[jd2 * n + i] + H[ju2 * n + i]) * 0.25 - H[k];
      const o = k * 4;
      out[o] = Math.round((-hx / len * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((-hz / len * 0.5 + 0.5) * 255);
      out[o + 2] = Math.max(0, Math.min(255, Math.round(128 + lap * 2000)));
      out[o + 3] = Math.max(0, Math.min(255, Math.round(Math.hypot(hx, hz) * 2 * 255)));
    }
  }
  return out;
}
