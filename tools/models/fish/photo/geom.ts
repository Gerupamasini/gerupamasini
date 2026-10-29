// The model's side view for the photo bake (bake.py): where every texel of a species' body texture and fin atlas lies
// in the lateral projection (TL units: s from the snout tip, y up from the axis), and its landmarks.
//   npx esbuild tools/models/fish/photo/geom.ts --bundle --platform=node --format=esm --outfile=<tmp>/geom.mjs \
//     --define:import.meta.glob=globalThis.__noGlob --banner:js="globalThis.__noGlob=()=>({});"
//   node <tmp>/geom.mjs <species id> <out dir>
// → <id>.geom.json (landmarks, sizes) and <id>.geom.f32 (body: s per column, then y and the lateral facing per texel;
//   fins: s, y per atlas texel)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { bodyS } from '../../../../src/creatures/fish/body';
import { FISH_SPECS } from '../../../../src/creatures/fish/species';
import { FIN_BAND_COUNT, curve, mix, newSection, profilesOf, sectionAt, sectionPoint, type FinId } from '../../../../src/creatures/fish/spec';

const [id, outDir] = process.argv.slice(2);
const spec = Object.values(FISH_SPECS).find((s) => s.id === id);
if (!spec) throw new Error(`no species ${id}`);
const W = 1024, H = 512, FW = 256, FH = 64;
const P = profilesOf(spec), cb = spec.caudalBase;
const sec = newSection(), pt: [number, number] = [0, 0], q: [number, number] = [0, 0];

// body: s by column; y and the facing (|the normal's lateral component|) by texel
const S = new Float32Array(W), Y = new Float32Array(W * H), F = new Float32Array(W * H);
for (let i = 0; i < W; i++) {
  const s = bodyS(spec, (i + 0.5) / W);
  S[i] = s;
  sectionAt(spec, Math.min(s, cb), sec);
  for (let j = 0; j < H; j++) {
    const phi = ((j + 0.5) / H) * 2 * Math.PI, d = 1e-3;
    sectionPoint(sec, phi, pt);
    Y[j * W + i] = pt[1];
    sectionPoint(sec, phi + d, q);
    const tx = q[0] - pt[0], ty = q[1] - pt[1], l = Math.hypot(tx, ty) || 1;
    F[j * W + i] = Math.abs(ty / l);
  }
}

// fins: the side view of each atlas band's (u, v), as buildFins (body.ts) lays the fins out
const finAt = (id: FinId, u: number, v: number): [number, number] => {
  if (id === 'c') {
    const c = spec.fins.caudal, a = 2 * u - 1, c0 = cb - 0.006;
    const yb = mix(-P.bot(cb) * c.base, P.top(cb) * c.base, u);
    const th = a * c.spread * (1 + 0.18 * v);
    const L = c.len * (c.centre + (c.tip - c.centre) * Math.pow(Math.abs(a), c.p)) * v;
    return [c0 + Math.cos(th) * L, yb + Math.sin(th) * L];
  }
  if (id === 'p') {
    const p = spec.fins.pectoral, pl = curve(p.len);
    const sb = p.s + 0.25 * p.base * u, yb = p.y - p.base * u, th = mix(p.dirs[0], p.dirs[1], u), L = pl(u) * v;
    return [sb + Math.cos(th) * L, yb + Math.sin(th) * L];
  }
  if (id === 'v') {
    const p = spec.fins.pelvic, vl = curve(p.len);
    const sb = p.s + 0.3 * p.base * u, yb = -P.bot(sb) * 0.92, th = mix(p.dirs[0], p.dirs[1], u), L = vl(u) * v;
    const o2 = Math.sin(th) * L;
    return [sb + Math.cos(th) * L, yb - Math.cos(p.rest) * Math.abs(o2) - 0.08 * L];
  }
  const f = spec.fins.median.find((m) => m.id === id);
  if (!f) return [NaN, NaN];
  const len = curve(f.len), up = f.id === 'a' ? -1 : 1;
  const sb = mix(f.s0, f.s1, u), yb = up > 0 ? P.top(sb) * 0.94 : -P.bot(sb) * 0.94;
  const rk = mix(f.rake[0], f.rake[1], u), L = len(u) * v;
  return [sb + Math.sin(rk) * L + 0.12 * len(u) * v * v, yb + up * Math.cos(rk) * L];
};
const ids: FinId[] = ['d1', 'd2', 'a', 'c', 'p', 'v'];
const FA = new Float32Array(FW * FH * FIN_BAND_COUNT * 2);
for (let band = 0; band < FIN_BAND_COUNT; band++) {
  for (let j = 0; j < FH; j++) {
    const v = Math.min(1, Math.max(0, ((j + 0.5) / FH - 0.03) / 0.94));
    for (let i = 0; i < FW; i++) {
      const [s, y] = finAt(ids[band], (i + 0.5) / FW, v);
      const o = ((band * FH + j) * FW + i) * 2;
      FA[o] = s; FA[o + 1] = y;
    }
  }
}

const B = 400;
const meta = {
  id, W, H, FW, FH, bands: ids, cb, flat: spec.flat ?? 0, snoutCap: spec.snoutCap,
  top: Array.from({ length: B + 1 }, (_, k) => (k / B <= cb ? P.top(k / B) : null)),
  bot: Array.from({ length: B + 1 }, (_, k) => (k / B <= cb ? P.bot(k / B) : null)),
  eyes: spec.eyes, mouth: { corner: spec.mouth.corner, gapeCorner: P.gape(spec.mouth.corner) }, oper: spec.oper,
  median: spec.fins.median.map((f) => ({ id: f.id, s0: f.s0, s1: f.s1 })),
  pectoral: { s: spec.fins.pectoral.s, y: spec.fins.pectoral.y, base: spec.fins.pectoral.base },
  pelvic: { s: spec.fins.pelvic.s, base: spec.fins.pelvic.base },
  caudal: { base: spec.fins.caudal.base, topCb: P.top(cb), botCb: P.bot(cb) },
};
writeFileSync(path.join(outDir, `${id}.geom.json`), JSON.stringify(meta));
const all = new Float32Array(S.length + Y.length + F.length + FA.length);
all.set(S, 0); all.set(Y, W); all.set(F, W + W * H); all.set(FA, W + 2 * W * H);
writeFileSync(path.join(outDir, `${id}.geom.f32`), Buffer.from(all.buffer));
console.log(id, 'ok');
