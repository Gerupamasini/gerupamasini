// ヤマメ体表テクスチャ生成モジュール（albedo / normal / orm / mouth）と側面プレビュー。
// 純粋関数・Node のみ（three.js 非依存）。乱数は seed 付きで決定論的。仕様: docs/yamame/spec/03, 06 §6.2-6.4, 02 §2.6。契約: docs/yamame/impl/CONTRACT.md。
//
// ── UV / 画像の約束（CONTRACT §2, §3）─────────────────────────────────────────────────────────────────────
//   u = clamp(s,0,1), v = alpha/(2π)。画像の x = u·(W-1), y = v·(H-1)（左上原点）。
//   y=0 / y=H-1 = 背正中線（継ぎ目）, y≈0.25H = 右体側中央, y≈0.5H = 腹正中線, y≈0.75H = 左体側中央。
//   x=0 = 吻端(s=0), x=W-1 = 尾鰭基部(s=1)。頭は左(u=0)。s<0 の吻キャップは u=0 列に潰れる。
//   模様は物理スケール: x 方向 0.19 m / (W-1)、y 方向は各 s の断面周長を数値積分して物理座標(背正中線からの弧長 d)へ写して作る。
// ── チャンネル（CONTRACT §3 / 06 §6.2.4）─────────────────────────────────────────────────────────────────
//   albedo: sRGB 8bit RGBA（A=255）。値は「見かけの色を統合描画で再現する」よう逆算した線形 albedo（下の校正を参照）。
//   normal: 線形・タンジェント空間。glTF 規約 = R:+U(尾方向), G:画像の「上」(= v 減少方向 = 背側へ向かう側が +), B:+法線。
//           three.js の GLTFLoader 経由なら補正される。DataTexture 等で直接使うなら normalScale.y = -1 が必要になる場合がある。
//   orm   : 線形。R=AO, G=roughness, B=metalness（= silver_map × silver_gain を焼いた値。material.metalness=1 で使う）。
//           R(AO) は背側で小さい（~0.25）: three.js は aoMap を間接拡散・間接鏡面・クリアコート間接に掛けるので, 環境反射のベール（M_Body の clearcoat 0.2 + 環境光）を抑えて暗い体色を暗く保つ。
// ── 色の設計と校正（2026-10 体表の作り直し）──────────────────────────────────────────────────────────────────────
//   設計色 = 「写真に写る見かけの色」(BODY_STOPS, sRGB, 成魚の非繁殖期)。albedo 画像はその色を viewer/dev/still.html（ACES + RoomEnvironment 0.9 + 平行光 1.6, M_Body の clearcoat 0.2）で
//   再現するよう逆算した線形 albedo（CAL_KNOTS: シーン線形 S = a(r)·albedo + v(r), 表示 = ACES(S)）。ORM を変えたら tools/verify/body_calibrate.mjs で校正し直す。genome.photoExposure=true は校正なし(albedo=設計色)。
import { makeInterp } from './surface.mjs';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const deg = Math.PI / 180;

// ───────────────────────────── 乱数・ハッシュ・ノイズ ─────────────────────────────
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function makeRng(seed, tag) { return mulberry32((hashString(tag) ^ Math.imul((Math.floor(seed) | 0) + 0x632be5ab, 0x9e3779b1)) >>> 0); }
function seedInt(seed, tag) { return (hashString(tag) ^ Math.imul((Math.floor(seed) | 0) + 0x1234567, 0x85ebca6b)) & 0xffff; }
function gauss(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng()); }
function logNormal(rng, mean, cv) { const s2 = Math.log(1 + cv * cv); return mean * Math.exp(Math.sqrt(s2) * gauss(rng) - 0.5 * s2); }
function clipNormal(rng, mu, sd, lo, hi) { for (let i = 0; i < 20; i++) { const v = mu + sd * gauss(rng); if (v >= lo && v <= hi) return v; } return clamp(mu, lo, hi); }
function pickWeighted(rng, values, weights) {
  const tot = weights.reduce((a, b) => a + b, 0); let u = rng() * tot;
  for (let i = 0; i < values.length; i++) { u -= weights[i]; if (u <= 0) return values[i]; }
  return values[values.length - 1];
}
function ihash(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y); const fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = ihash(x0, y0, s), b = ihash(x0 + 1, y0, s), c = ihash(x0, y0 + 1, s), d = ihash(x0 + 1, y0 + 1, s);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}
function fbm2(x, y, s, oct = 3) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, s + i * 101); norm += a; a *= 0.5; f *= 2.03; }
  return sum / norm;
}

// ───────────────────────────── 色変換 ─────────────────────────────
const f_inv = (t) => (t > 6 / 29 ? t * t * t : 3 * (6 / 29) * (6 / 29) * (t - 4 / 29));
function labToLin(L, a, b, out) { // CIE Lab(D65) -> 線形 sRGB（クリップ）
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = 0.95047 * f_inv(fx), Y = f_inv(fy), Z = 1.08883 * f_inv(fz);
  out[0] = clamp01(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z);
  out[1] = clamp01(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z);
  out[2] = clamp01(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z);
  return out;
}
const f_fwd = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
function linToLab(r, g, b) {
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const fx = f_fwd(X), fy = f_fwd(Y), fz = f_fwd(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
const encSrgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const decSrgb = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const SRGB_ENC = new Uint8Array(4096); for (let i = 0; i < 4096; i++) SRGB_ENC[i] = Math.round(clamp01(encSrgb(i / 4095)) * 255);
const toByte = (v) => SRGB_ENC[(clamp01(v) * 4095 + 0.5) | 0];
const SRGB_DEC = new Float32Array(256); for (let i = 0; i < 256; i++) SRGB_DEC[i] = decSrgb(i / 255);
const labToSrgb8 = (L, a, b) => { const o = labToLin(L, a, b, [0, 0, 0]); return [toByte(o[0]), toByte(o[1]), toByte(o[2])]; };
const rotAB = (a, b, angDeg) => { const t = angDeg * deg, c = Math.cos(t), s = Math.sin(t); return [a * c - b * s, a * s + b * c]; };

// ───────────────────────────── ゲノム（個体差）─────────────────────────────
// 未指定の項目は spec 03 の既定値。snake_case（spec 表の名前）も受け付ける（pm_count -> pmCount）。
const camel = (k) => k.replace(/_([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
export const GENOME_DEFAULTS = Object.freeze({
  pmCount: 9, pmCountOffset: 0, pmCountLrDelta: null,            // §3.1.7（null = 分布 (0.15,0.70,0.15) から seed で抽選）
  pmSFirst: null, pmSLast: null, pmSpacingCv: 0.29,               // null = 正規分布から抽選
  pmContrast: 1.0, pmSize: 1.0,                                   // 個体差の倍率（コントラスト・大きさ）
  pmHeightScale: 1.20, pmWidthScale: 0.80,                        // [E] 成魚の斑は集計(parr/juvenile 主体, h/w 1.72)より細長い: p024/p022/p033 で h/w 2.3-4 -> h を +2 割, w を -2 割 (p024 の幅 ~0.02 SL, p033, p022)
  pmDL: -22, pmDa: -3.5, pmDb: -20,   // [E] p002(-18..-20) p049(-40) p033(-32) p024(-25..-30)。p10-p90(-32..-7.8)の濃い側: 青灰〜スレート青が地色の桃/金の上で明確に見える
  pmEdgeSoftness: 0.15, pmFuseP: 0.31, pmFrontFaintP: 0.45, pmFadeOnsetCm: 25, flCm: null,
  spotDorsalN: 78, spotDensity: 1.0, spotDorsalDiamEyeD: 0.12, spotDorsalRows: 5,   // [P: p033/p065/p024 の背は径 1 鱗ほどの黒点が 5 列前後に密。カタログの可視域中央値 30 は下限 (03 §3.2.1)]
  spotBelowN: 9, spotBelowDiamEyeD: 0.24, spotBelowBlackP: 0.25,
  spotHeadN: null, spotHeadDiamEyeD: 0.08,
  orangeSpotMode: null,                                           // null = 0.96 none / 0.04 trace を seed で抽選。'none'|'trace'|'region_hybrid'
  pinkBandStrength: 0.80, nuptialIntensity: 0,
  dorsalL: 38, flankUpperL: 66, bellyL: 82, flankHueA: 3.3, flankHueB: 9.8, hueOffsetDeg: 0,
  calKnots: null, debugGround: false, calFlat: null,                              // 校正用: calKnots=[[r,kR,kG,kB],...] で見かけ->albedo 倍率を差し替え / debugGround=true で斑・鱗・黒点を描かない
  silverS: 0.10,                                                  // silver_gain = 0.35+2*silver_s = 0.55 [E: 校正した統合描画(ACES+環境光+clearcoat)で白飛びしない値。河川型 0-0.15 の範囲内。0.41 -> 0.55: 体側下半の銀の鏡面反射を強める]
  scalePitchPctSl: 0.7, scaleTiltDeg: 5, scaleAoDepth: 0.15, scaleRoughVar: 0.06,
  mouthLineR: -0.25,
  photoExposure: false,                                           // true: 露出補正なし（写真の見かけ色。参照写真との色比較・無照明表示用）
  albedoGain: 1.0,                                                // 線形 albedo の最終倍率（1 = 設計値）。設計値は r(背+1..腹-1) 依存で 0.48..0.95 [E]: 写真の見かけ色は照明・光沢込みなので、統合描画(ACES, env 0.9, 平行光 1.6, clearcoat 0.35)で白飛びしない反射率に補正。下向きの面は環境光が少ないため高め
  lifeStage: null,                                                // 'parr'|'juvenile'|'adult'。null = params.stage==='adult' なら adult, それ以外 parr
  sheenBand: 0.5,                                                // 側線沿いの青〜桃の光沢帯の強さ 0-1
  spotBelowSmallBlackN: 4,                                        // 側線下の小さな黒点（片側）
});
export function resolveGenome(genome = {}) {
  const g = { ...GENOME_DEFAULTS };
  for (const [k, v] of Object.entries(genome || {})) { const kk = camel(k); if (kk in GENOME_DEFAULTS && v !== undefined) g[kk] = v; }
  return g;
}
// spec 03 §3.8.2 の分布から 1 個体ぶんの genome を抽選する（個体差が欲しいときに main が使う）
export function sampleGenome(seed = 1) {
  const r = makeRng(seed, 'sampleGenome');
  const gam = (k) => { let s = 0; for (let i = 0; i < k; i++) s -= Math.log(1 - r()); return s; };
  const beta = (a, b) => { const x = gam(a), y = gam(b); return x / (x + y); };
  return {
    pmCount: pickWeighted(r, [5, 6, 7, 8, 9, 10, 11, 12], [0.03, 0.03, 0.09, 0.28, 0.27, 0.20, 0.07, 0.03]),
    pmContrast: clamp(Math.exp(0.22 * gauss(r)), 0.6, 1.45),
    pmSize: clamp(Math.exp(0.10 * gauss(r)), 0.8, 1.25),
    pmDL: clipNormal(r, -18, 7, -36, -6), pmDa: clipNormal(r, -2.9, 2.5, -8, 4), pmDb: clipNormal(r, -11.3, 6, -26, 3),
    spotDensity: clamp(Math.exp(0.6 * gauss(r)), 0.25, 3.5),
    spotBelowN: clamp(Math.round(7.5 * Math.exp(1.0 * gauss(r))), 0, 60),
    pinkBandStrength: clamp(0.3 + 0.2 * gauss(r), 0, 1),
    dorsalL: clipNormal(r, 44, 7, 30, 62), flankUpperL: clipNormal(r, 66, 5, 56, 77), bellyL: clipNormal(r, 78, 4, 68, 88),
    flankHueA: clipNormal(r, 3.3, 2.2, -0.8, 9.2), flankHueB: clipNormal(r, 9.8, 4, 3, 22),
    hueOffsetDeg: (r() * 2 - 1) * 15,
    silverS: 0.15 * beta(2, 10),
    scalePitchPctSl: 0.55 + 0.35 * r(),
  };
}

// ───────────────────────────── 体表の幾何テーブル ─────────────────────────────
// Y[idx]: 断面中心線からの高さ(SL比, 側面投影), Av[idx]: 行方向に単調増加する弧長 mm（row0 = 背正中線）, circ[x]: 周長 mm
function buildGeometry(surface, W, H) {
  const SL = surface.SL; const ns = Math.min(W - 1, 256), nc = ns + 1;
  const Yc = new Float32Array(nc * H), Ar = new Float32Array(nc * H), Ax = new Float32Array(nc * H);
  let prevCol = null;
  for (let ci = 0; ci < nc; ci++) {
    const s = ci / ns; const sec = surface.section(s); let prev = null, acc = 0; const col = new Array(H);
    for (let j = 0; j < H; j++) {
      const p = surface.point(s, TAU * j / (H - 1)); col[j] = p;
      Yc[ci * H + j] = p[1] / SL - sec.c;
      if (prev) acc += Math.hypot(p[1] - prev[1], p[2] - prev[2]) * 1000;
      Ar[ci * H + j] = acc; prev = p;
      // 体軸方向の実距離（テーパー部では断面が痩せるぶん x だけより長い）[mm]
      Ax[ci * H + j] = prevCol ? Ax[(ci - 1) * H + j] + Math.hypot(p[0] - prevCol[j][0], p[1] - prevCol[j][1], p[2] - prevCol[j][2]) * 1000 : 0;
    }
    prevCol = col;
  }
  const Y = new Float32Array(W * H), Av = new Float32Array(W * H), Xm = new Float32Array(W * H);
  const cS = new Float32Array(W), hS = new Float32Array(W), circ = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const fx = x / (W - 1) * ns; const i0 = Math.min(Math.floor(fx), ns - 1); const f = fx - i0;
    const sec = surface.section(x / (W - 1)); cS[x] = sec.c; hS[x] = sec.h;
    for (let j = 0; j < H; j++) {
      Y[j * W + x] = lerp(Yc[i0 * H + j], Yc[(i0 + 1) * H + j], f);
      Av[j * W + x] = lerp(Ar[i0 * H + j], Ar[(i0 + 1) * H + j], f);
      Xm[j * W + x] = lerp(Ax[i0 * H + j], Ax[(i0 + 1) * H + j], f);
    }
    circ[x] = Av[(H - 1) * W + x];
  }
  return { W, H, SL, Y, Av, Xm, cS, hS, circ, mmU: SL * 1000 / (W - 1), halfRow: (H - 1) / 2 };
}
// (s, r) -> 行 j（r = 側面投影の相対高さ -1..1, side 'right'|'left'）
function rowForR(surface, G, s, r, side) {
  const sec = surface.section(s); const yM = (sec.c + clamp(r, -1, 1) * sec.h) * G.SL;
  const a = surface.alphaAtHeight(s, yM); const jj = (side === 'right' ? a : TAU - a) / TAU * (G.H - 1);
  return clamp(Math.round(jj), 0, G.H - 1);
}

// ───────────────────────────── 色の設計（Lab 停止点 -> LUT）─────────────────────────────
const ALB_MAX = 0.85;   // 線形 albedo の上限（白い腹でも 0.85 を超えない: 物理的に妥当な反射率）
const NL = 512; // r(-1..1) の LUT 分解能
function makeStopsInterp(stops) { // stops: [{r,L,a,b}] r 降順で渡してよい。単調 3 次補間
  const st = [...stops].sort((p, q) => p.r - q.r); const xs = st.map((s) => s.r);
  return { L: makeInterp(xs, st.map((s) => s.L)), a: makeInterp(xs, st.map((s) => s.a)), b: makeInterp(xs, st.map((s) => s.b)) };
}
function lutFromInterp(itp, hueDeg) {
  const lut = new Float32Array(NL * 3); const o = [0, 0, 0];
  for (let i = 0; i < NL; i++) {
    const r = -1 + 2 * i / (NL - 1); const [a, b] = rotAB(itp.a(r), itp.b(r), hueDeg);
    labToLin(itp.L(r), a, b, o); lut[i * 3] = o[0]; lut[i * 3 + 1] = o[1]; lut[i * 3 + 2] = o[2];
  }
  return lut;
}
function lutScalar(pts) { // [[r,val],...] -> Float32Array(NL)
  const st = [...pts].sort((p, q) => p[0] - q[0]); const f = makeInterp(st.map((p) => p[0]), st.map((p) => p[1]));
  const o = new Float32Array(NL); for (let i = 0; i < NL; i++) o[i] = f(-1 + 2 * i / (NL - 1)); return o;
}
// 体色の設計: 「写真に写る見かけの色」(sRGB) の停止点を r 方向に置き、Lab へ変換して個体差(genome)のオフセットを足し、LUT 化する。
// r = 側面投影の相対高さ (+1 背正中線 ... -1 腹正中線)。成魚・非繁殖期・野生: 背=暗いオリーブ褐(頭部のキャップ (74,60,40)/(60,46,26) へ連続),
// 体側上半=青銅〜金桃(頬 (160,128,72)〜(176,156,130) へ連続), 体側下半=銀クリーム, 腹=冷たい白。[P: p024 背 (86,70,46)-(107,96,71) 上半 (182,147,107)-(208,174,135) 下半 (223,220,195) 腹 (201,205,200); a01 背 (30-45); 03 §3.5]
const BODY_STOPS = [   // [r, R, G, B]
  [1.00, 66, 56, 41], [0.90, 72, 61, 44], [0.78, 83, 71, 50], [0.64, 96, 82, 58], [0.50, 112, 97, 69], [0.38, 129, 112, 82], [0.26, 152, 132, 102],
  [0.14, 182, 153, 117], [0.02, 200, 172, 135], [-0.12, 208, 189, 154], [-0.30, 210, 202, 177], [-0.50, 213, 209, 192], [-0.72, 214, 213, 204], [-1.00, 210, 211, 207]];
const srgbToLab = (R8, G8, B8) => { const l = linToLab(SRGB_DEC[R8], SRGB_DEC[G8], SRGB_DEC[B8]); return [l.L, l.a, l.b]; };
const bellW = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
function designPalette(G) {
  const nup = G.nuptialIntensity;
  const dD = (G.dorsalL - 38) - 8 * nup, dF = G.flankUpperL - 66, dB = G.bellyL - 82;     // 既定個体では 0（BODY_STOPS がそのまま既定）
  const dA = (G.flankHueA - 3.3) + 6 * nup, dBb = (G.flankHueB - 9.8) + 5 * nup;
  const stops = BODY_STOPS.map(([r, R8, G8, B8]) => {
    const [L, a, b] = srgbToLab(R8, G8, B8);
    const wDorsal = sstep(0.30, 0.85, r), wFlank = bellW(r, 0.12, 0.38), wBelly = sstep(-0.15, -0.75, r), wHue = clamp01(1 - sstep(0.45, 0.95, r)) * (1 - 0.5 * wBelly);
    return { r, L: clamp(L + dD * wDorsal + dF * wFlank + dB * wBelly, 2, 98), a: a + dA * wHue, b: b + dBb * wHue };
  });
  const body = makeStopsInterp(stops);
  // 頭部（旧来の簡易塗り。s<0.27 はヘッドアトラスで上書きされる）: 背面=最も暗い、頬=金銀、下面=白 [P: 頭部背面 L22-65(38.8), cheek 59]
  const head = makeStopsInterp([
    { r: 1.00, L: 24 + 0.5 * (G.dorsalL - 44), a: 1.5, b: 11 }, { r: 0.75, L: 30 + 0.5 * (G.dorsalL - 44), a: 1.5, b: 15 }, { r: 0.50, L: 42, a: 0.8, b: 18 },
    { r: 0.20, L: 62, a: 0.0, b: 18 }, { r: -0.20, L: 72, a: -0.5, b: 12 }, { r: -0.60, L: 80, a: -1.0, b: 7 }, { r: -1.00, L: 82, a: -1.0, b: 4 }]);
  const hue = G.hueOffsetDeg;
  return {
    body, head, hue, bodyLut: lutFromInterp(body, hue), headLut: lutFromInterp(head, hue),
    // 鱗・光沢の層（r 方向）。rough/silver は ORM, cal は「見かけの色 -> 線形 albedo」の校正（スタジオ照明下の描画で見かけ=設計色になるよう実測で決めた RGB 倍率）
    rough: lutScalar([[1, 0.78], [0.8, 0.78], [0.55, 0.75], [0.3, 0.68], [0.1, 0.56], [-0.15, 0.44], [-0.4, 0.34], [-0.7, 0.30], [-1, 0.30]]),
    roughHead: lutScalar([[1, 0.58], [0.5, 0.52], [0.2, 0.44], [-0.3, 0.38], [-1, 0.34]]),
    ao: lutScalar([[1, 0.27], [0.85, 0.26], [0.65, 0.24], [0.45, 0.22], [0.25, 0.30], [0.05, 0.52], [-0.2, 0.80], [-0.5, 1.0], [-1, 1.0]]),
    gain: lutCal(G.calKnots ?? CAL_KNOTS),
    silver: lutScalar([[1, 0.0], [0.8, 0.0], [0.55, 0.05], [0.3, 0.16], [0.1, 0.32], [-0.15, 0.52], [-0.45, 0.80], [-0.75, 1.0], [-1, 1.0]]),
    silverHead: lutScalar([[1, 0.0], [0.6, 0.0], [0.2, 0.25], [-0.3, 0.55], [-1, 0.80]]),
    labBody: (r) => { const [a, b] = rotAB(body.a(r), body.b(r), hue); return [body.L(r), a, b]; },
    opercle: [66, -0.6, 10], opercleBlue: [69, -2.2, 3], jaw: [78, 0.5, 9], sheenBlue: [74, -3, -9], sheenLilac: [76, 9, -7], sheenGreen: [76, -7, 12], pink: [74, 21, 17],
    markBlack: [11, 1.0, 2.0], spotBelow: [50, -3.0, -9.0], spotBelowBlack: [26, 0, 0], orange: [62, 19, 28],
    markSlate: [46, -1.5, -10.0], markViolet: [48, 5.0, -12.0],
  };
}
// ── 見かけ -> albedo の校正 ─────────────────────────────────────────────────────────────────────────────────────
// 統合描画(viewer/dev/still.html: ACES filmic + RoomEnvironment 0.9 + 平行光 1.6, M_Body: clearcoat 0.2)を実測した結果:
//   シーン線形値 S = a(r)·albedo + v(r)（a: 拡散+鏡面の応答, v: 反射のベール）, 表示値 = ACES(S)。
//   設計色(表示の線形値 T)を再現する albedo = (ACES^-1(T) − v) / a。a, v は r ごとに 3 段の均一 albedo を描いて最小二乗で求めた（校正ノット [r, a, v]）。
//   AO を低くして(背側)ベールを抑えているので、この式は暗色(背・黒点・斑)でも色相を保つ。ORM の設計を変えたら校正し直す（tools: scratchpad の calib2）。
const CAL_KNOTS = [
  [-1.00, 0.6640, 0.01702],
  [-0.90, 0.6640, 0.01702],
  [-0.80, 0.7977, 0.01295],
  [-0.70, 0.8687, 0.01177],
  [-0.60, 0.8991, 0.00920],
  [-0.50, 0.9386, 0.00535],
  [-0.40, 1.0204, 0.00510],
  [-0.30, 1.1042, 0.00657],
  [-0.20, 1.1920, 0.01118],
  [-0.10, 1.3295, 0.02093],
  [0.00, 1.4397, 0.03558],
  [0.10, 1.3399, 0.04363],
  [0.20, 1.0937, 0.05070],
  [0.30, 0.9112, 0.07164],
  [0.40, 0.8380, 0.06206],
  [0.50, 0.8427, 0.04683],
  [0.60, 0.8865, 0.02228],
  [0.70, 0.9286, 0.01970],
  [0.80, 0.9597, 0.01664],
  [0.90, 0.9438, 0.01692],
  [1.00, 0.9438, 0.01692]];
function lutCal(knots) { // -> Float32Array(NL*2): a, v
  const xs = knots.map((k) => k[0]); const f = [1, 2].map((c) => makeInterp(xs, knots.map((k) => k[c])));
  const o = new Float32Array(NL * 2); for (let i = 0; i < NL; i++) { const r = -1 + 2 * i / (NL - 1); o[i * 2] = f[0](r); o[i * 2 + 1] = f[1](r); } return o;
}
// three.js ACESFilmicToneMapping（r186）の逆写像: 表示の線形 RGB(0..1) -> シーン線形 RGB
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
const inv3 = (m) => { const [[a, b, c], [d, e, f], [g, h, i]] = m; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]]; };
const ACES_IN_INV = inv3(ACES_IN), ACES_OUT_INV = inv3(ACES_OUT);
const acesFit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
const acesFitInv = (y) => { y = clamp(y, 0, 0.9995); const A = 1 - 0.983729 * y, B = 0.0245786 - 0.432951 * y, C = -(9.0537e-5 + 0.238081 * y); return Math.max(0, (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A)); };
export function acesInverse(r, g, b, out = [0, 0, 0]) {   // 校正ツール (tools/verify/body_calibrate.mjs) とテストが使う
  const u0 = ACES_OUT_INV[0][0] * r + ACES_OUT_INV[0][1] * g + ACES_OUT_INV[0][2] * b, u1 = ACES_OUT_INV[1][0] * r + ACES_OUT_INV[1][1] * g + ACES_OUT_INV[1][2] * b, u2 = ACES_OUT_INV[2][0] * r + ACES_OUT_INV[2][1] * g + ACES_OUT_INV[2][2] * b;
  const f0 = acesFitInv(u0), f1 = acesFitInv(u1), f2 = acesFitInv(u2);
  out[0] = Math.max(0, 0.6 * (ACES_IN_INV[0][0] * f0 + ACES_IN_INV[0][1] * f1 + ACES_IN_INV[0][2] * f2));
  out[1] = Math.max(0, 0.6 * (ACES_IN_INV[1][0] * f0 + ACES_IN_INV[1][1] * f1 + ACES_IN_INV[1][2] * f2));
  out[2] = Math.max(0, 0.6 * (ACES_IN_INV[2][0] * f0 + ACES_IN_INV[2][1] * f1 + ACES_IN_INV[2][2] * f2));
  return out;
}

// 側線の位置（中心線より上, SL 比）[P: 02 §2.6 lateral_line_points M-Y n=9; s=0.25 は外挿 [E]]
const LL_S = [0.25, 0.33, 0.50, 0.70, 0.90, 1.0], LL_Y = [0.040, 0.026, 0.012, 0.009, 0.003, 0.0];
const llOffset = makeInterp(LL_S, LL_Y);

// ───────────────────────────── パーマーク ─────────────────────────────
// 位置・大きさの s 区間別平均 [P: 03 §3.1.3 表]
const PM_S = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
const PM_H = [0.063, 0.075, 0.085, 0.074, 0.072, 0.063, 0.055, 0.043];
const PM_W = [0.034, 0.039, 0.042, 0.043, 0.041, 0.040, 0.037, 0.033];
const interpLin = (xs, ys, x) => { if (x <= xs[0]) return ys[0]; for (let i = 0; i < xs.length - 1; i++) if (x <= xs[i + 1]) return lerp(ys[i], ys[i + 1], (x - xs[i]) / (xs[i + 1] - xs[i])); return ys[ys.length - 1]; };

// 生活段階: parr = 斑が濃く輪郭が鋭い / adult = 斑は退色して淡く残る（a01 でも薄く見える）[E: 03 §3.1.5 は連続変化。a01 の見え方に合わせた段階係数]
const STAGES = {
  parr: { contrast: 1.12, opacity: 1.0, soft: 0.80, spots: 1.0, spotSize: 1.0, scaleVis: 1.0, fade: 0 },
  juvenile: { contrast: 1.0, opacity: 1.0, soft: 1.0, spots: 1.0, spotSize: 1.0, scaleVis: 1.1, fade: 0 },
  adult: { contrast: 0.92, opacity: 0.93, soft: 0.95, spots: 1.25, spotSize: 0.9, scaleVis: 1.5, fade: 0.08 },
};
function planIndividual(seed, G) {
  const r = makeRng(seed, 'indiv');
  const base = clamp(Math.round(G.pmCount + G.pmCountOffset), 5, 12);
  const dl = G.pmCountLrDelta ?? pickWeighted(r, [-1, 0, 1], [0.15, 0.70, 0.15]);
  const nRight = base, nLeft = clamp(base + dl, 5, 12);
  const sFirst = G.pmSFirst ?? clipNormal(r, 0.32, 0.07, 0.27, 0.55); // 鰓蓋後縁(0.25)より後ろに制限 [E]
  const sLast = G.pmSLast ?? clipNormal(r, 0.955, 0.04, 0.82, 0.965);        // 尾端リングに斑がかからないよう上限 0.965 [E]
  const frontFaint = r() < G.pmFrontFaintP;
  const stagger = r() < 0.61 ? 0.006 + 0.006 * r() : 0;               // 千鳥 [P 61%]
  const nEv = r() < G.pmFuseP ? 1 + Math.floor(r() * 3) : 0;
  const events = []; for (let i = 0; i < nEv; i++) events.push({ side: r() < 0.5 ? 'right' : 'left', type: pickWeighted(r, ['fuse', 'split', 'double'], [0.4, 0.3, 0.3]), u: r() });
  const flCm = G.flCm ?? 110.9 * (G.slM ?? 0.19);
  const lOn = G.pmFadeOnsetCm;
  const st = STAGES[G.stage]; const fade = Math.max(sstep(lOn, lOn + 15, flCm) * 0.65, st.fade);
  const mode = G.orangeSpotMode ?? (makeRng(seed, 'orange-mode')() < 0.04 ? 'trace' : 'none');      // 既定なし 96% / trace 4% [03 §3.3]
  const nHead = G.spotHeadN ?? (r() < 0.32 ? 0 : 1 + Math.floor(r() * 10));
  // 個体共通のパーマーク色差（個体差 = genome）
  return { nRight, nLeft, dl, sFirst, sLast, frontFaint, stagger, events, fade, orangeMode: mode, nHead, flCm,
    dL: clamp(G.pmDL * G.pmContrast * st.contrast, -44, -3), dA: G.pmDa, dB: clamp(G.pmDb * (0.6 + 0.4 * G.pmContrast * st.contrast), -35, 7), stage: G.stage, st };
}

function genMarks(side, seed, ind, G, pal, geo, surface) {
  const rng = makeRng(seed, 'marks:' + side);
  const n = side === 'right' ? ind.nRight : ind.nLeft;
  const sF = clamp(ind.sFirst + 0.010 * gauss(rng), 0.27, 0.56), sL = clamp(ind.sLast + 0.012 * gauss(rng), 0.84, 0.965);
  const gaps = []; for (let i = 0; i < n - 1; i++) gaps.push(Math.max(0.35, 1 + G.pmSpacingCv * gauss(rng)));
  const gs = gaps.reduce((a, b) => a + b, 0) || 1; let acc = 0; const sPos = [sF];
  for (let i = 0; i < n - 1; i++) { acc += gaps[i]; sPos.push(sF + (sL - sF) * acc / gs); }
  const marks = [];
  for (let i = 0; i < n; i++) {
    const s = sPos[i];
    const zh = gauss(rng), zw = 0.5 * zh + Math.sqrt(0.75) * gauss(rng);               // h と w は正の相関 -> h/w の CV を観測(0.33)に合わせる
    const lnv = (mean, cv, z) => { const s2 = Math.log(1 + cv * cv); return mean * Math.exp(Math.sqrt(s2) * z - 0.5 * s2); };
    const h = clamp(lnv(interpLin(PM_S, PM_H, s) * G.pmSize * G.pmHeightScale * (1 - 0.15 * sstep(0.70, 0.96, s)), 0.38, zh), 0.016, 0.17);
    const w = clamp(lnv(interpLin(PM_S, PM_W, s) * G.pmSize * G.pmWidthScale * (1 - 0.20 * sstep(0.68, 0.96, s)), 0.28, zw), 0.012, 0.08);   // 尾柄側ほど細い（p024）
    const sec = surface.section(s);
    let yc = 0.017 + 0.019 * gauss(rng) + (i % 2 ? 1 : -1) * ind.stagger;   // 側線 (+0.01..0.04) をまたぎ背の暗色へ伸びる [P: 42/49 枚で側線を横切る]
    yc = Math.min(yc, 0.66 * sec.h - h / 2); yc = Math.max(yc, -0.35 * sec.h + h / 2 * 0.6);
    const tilt = (i < 2 ? 7 : 0) + 4.5 * gauss(rng);                   // deg, +: 上端が頭側へ傾く [E: 前方ほど傾く [r04 F-06]]
    let op = clamp(0.95 * Math.exp(0.10 * gauss(rng)) * (1 - ind.fade) * ind.st.opacity * (1 - 0.40 * sstep(0.72, 0.96, s)), 0.18, 1.0);   // 尾に向かって薄くなる
    if (ind.frontFaint && (i === 0 || (i === 1 && rng() < 0.4))) op *= 0.5;
    const rC = (yc) / sec.h;
    const [gL, gA, gB] = pal.labBody(clamp(rC, -1, 1));
    const dL = clamp(ind.dL + 2.5 * gauss(rng), -44, -3);
    const violet = clamp01(0.5 + 0.35 * gauss(rng));                    // 青灰(0) <-> 青紫(1): 個々の斑で色相が少し違う（p033 の青紫 / p024 の青灰）
    const lab = [gL + dL, gA + ind.dA + 0.8 * gauss(rng), gB + ind.dB + 1.5 * gauss(rng)];
    const lin = labToLin(lab[0], lab[1], lab[2], [0, 0, 0]);
    marks.push({ s, yc, h, w, tilt, op, lab, lin, dL, violet, parts: [{ ds: 0, dy: 0, w, h, tilt: 0 }], cut: null, events: [],
      ph: [rng() * TAU, rng() * TAU, rng() * TAU], amp: [0.025 + 0.02 * rng(), 0.02 + 0.02 * rng(), 0.015 + 0.02 * rng()], nseed: Math.floor(rng() * 65535) });
  }
  // 融合・分裂・二重化 [P: 31%]
  for (const ev of ind.events) {
    if (ev.side !== side || marks.length < 3) continue;
    const i = 1 + Math.floor(ev.u * (marks.length - 2.001)); const m = marks[i];
    if (ev.type === 'fuse') {
      const nx = marks[i + 1] ?? marks[i - 1]; const sign = nx.s > m.s ? 1 : -1;
      const gap = Math.abs(nx.s - m.s);
      if (gap < 1.9 * (m.w + nx.w) / 2) { const hm = Math.min(m.h, nx.h), lowEnd = rng() < 0.6 ? -1 : 1;   // 上端または下端でつながる U 字（細い棒にしない）
        m.parts.push({ ds: sign * gap * 0.5, dy: (nx.yc - m.yc) * 0.5 + lowEnd * 0.34 * hm, w: gap * 0.95, h: 0.30 * hm, tilt: 0 }); }
      else m.parts.push({ ds: (rng() < 0.5 ? -1 : 1) * (0.62 * m.w + 0.012), dy: 0.1 * m.h * (rng() - 0.5), w: 0.55 * m.w, h: 0.8 * m.h, tilt: 5 });
    } else if (ev.type === 'split') {
      m.cut = { f: 0.42 + 0.16 * rng(), t: 0.12 + 0.05 * rng(), depth: 0.6 };
    } else {
      m.parts.push({ ds: (rng() < 0.5 ? -1 : 1) * (0.62 * m.w + 0.012), dy: 0.1 * m.h * (rng() - 0.5), w: 0.55 * m.w, h: 0.8 * m.h, tilt: 5 });
    }
    m.events.push(ev.type);
  }
  return marks;
}

// ───────────────────────────── 黒点の配置 ─────────────────────────────
function placeSpots({ rng, count, sMin, sMax, dens, rows, rTop, rStep, rJit, scatterP = 0.15, rScatter, diamMm, gapF, ctx, rejectMask }) {
  const { G, surface, W } = ctx; const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 60) {
    tries++;
    const s = sMin + (sMax - sMin) * rng(); if (rng() > dens(s)) continue;
    const k = Math.floor(rng() * rows);
    let r = rng() < scatterP ? lerp(rScatter[0], rScatter[1], rng()) : rTop - rStep * k + rJit * gauss(rng);
    r = clamp(r, -0.97, 0.97);
    const dia = diamMm(s);
    const side = ctx.side;
    const j = rowForR(surface, G, s, r, side); const x = Math.round(s * (W - 1));
    const idx = j * W + x;
    if (rejectMask && rejectMask[idx] > 0.45) continue;
    const xm = G.Xm[idx], dm = side === 'right' ? G.Av[idx] : G.circ[x] - G.Av[idx];
    let ok = true;
    for (const o of out) { const dd = Math.hypot(o.xm - xm, o.dm - dm); if (dd < gapF * 0.5 * (o.dia + dia)) { ok = false; break; } }
    if (!ok) continue;
    const el = 1 + 0.25 * rng();                                     // 体軸方向に少し長い [P: 03 §3.2.1]
    out.push({ s, r, x, j, xm, dm, dia, rx: dia / 2 * el, rd: dia / 2 / Math.sqrt(el), rot: 0.3 * gauss(rng), side, tone: 0.85 + 0.3 * rng() });
  }
  return out;
}

// ───────────────────────────── 口内テクスチャ 256x256 ─────────────────────────────
// 既定 orientation:'along-u'（loft.mjs の口腔チューブの UV に一致）: 画像 x = u（唇先端 0 -> 喉 1）, y = v（周方向）。
//   v: 0-0.25 口蓋（中心 0.125 = 鋤骨の正中）, 0.25-0.375 左頬, 0.375-0.625 口腔底/舌（中心 0.5）, 0.625-0.75 右頬, 0.75-1 は継ぎ目のなじませ用（頬->口蓋）。
// 'along-v': 上の転置（x = v, y = u: 上端が唇, 下端が喉, 舌は中央 x=0.5）。
// 色: 白みの淡桃の内張り, 奥(喉)だけ暗い赤褐。鮮やかな赤にしない [03 §3.8.3 #12; p012 の注記: 口内は暗く舌は桃色; 統合側の指摘: 実物の内張りは白桃色]。
// 歯: 既定なし（06 §6.2.3 (d) 歯は描画しない）。opts.teeth=true で鋤骨・舌に小さな淡色の歯点を数個。
function buildMouthTexture(seed, size = 256, opts = {}) {
  const orientation = opts.orientation ?? 'along-u'; const teeth = !!opts.teeth;
  const img = new Uint8Array(size * size * 4); const sd = seedInt(seed, 'mouth'); const o = [0, 0, 0];
  const rng = makeRng(seed, 'mouth-teeth'); const dots = [];
  if (teeth) { for (let i = 0; i < 6; i++) dots.push({ u: 0.10 + 0.26 * rng(), v: 0.125 + (rng() - 0.5) * 0.02, r: 0.006 }); for (let i = 0; i < 8; i++) dots.push({ u: 0.08 + 0.22 * rng(), v: 0.5 + (rng() - 0.5) * 0.10, r: 0.005 }); }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1);
    const q = v > 0.75 ? 0.75 : v; const wrapMix = v > 0.75 ? sstep(0.75, 1.0, v) : 0;            // 0.75-1 は頬 -> 口蓋へ連続的に
    // 領域ごとの基調色 (L,a,b)
    const roof = [80, 9, 5], cheek = [71, 16, 6], tongue = [84, 8, 4];
    let base;
    if (q < 0.25) base = roof;
    else if (q < 0.375) { const t = sstep(0.25, 0.375, q); base = [lerp(roof[0], cheek[0], t), lerp(roof[1], cheek[1], t), lerp(roof[2], cheek[2], t)]; }
    else if (q < 0.625) { const t = sstep(0.375, 0.45, q) * (1 - sstep(0.55, 0.625, q)); base = [lerp(cheek[0], tongue[0], t), lerp(cheek[1], tongue[1], t), lerp(cheek[2], tongue[2], t)]; }
    else { const t = sstep(0.625, 0.75, q); base = [lerp(cheek[0], cheek[0], t), cheek[1], cheek[2]]; }
    if (wrapMix > 0) base = [lerp(cheek[0], roof[0], wrapMix), lerp(cheek[1], roof[1], wrapMix), lerp(cheek[2], roof[2], wrapMix)];
    let [L, a, b] = base;
    // 舌の正中はわずかに桃が濃く, 口蓋の正中に縦の隆起（淡色）
    const tc = Math.exp(-Math.pow((q - 0.5) / 0.05, 2)); L -= 2.5 * tc; a += 3 * tc;
    const rc = Math.exp(-Math.pow((q - 0.125) / 0.025, 2)) * (q < 0.25 ? 1 : 0); L += 3 * rc;
    // 奥(喉)だけ暗く: 先端〜u=0.6 はほぼ一定, 以降 暗い赤褐へ
    const deep = Math.pow(sstep(0.58, 1.0, u), 1.25);
    L = lerp(L + 3 * (1 - sstep(0, 0.08, u)), 30, deep * 0.9); a = lerp(a, 20, deep); b = lerp(b, 8, deep);
    // 唇縁は白っぽく
    L = lerp(L, 88, (1 - sstep(0.0, 0.035, u)) * 0.6); a = lerp(a, 5, (1 - sstep(0.0, 0.035, u)) * 0.5);
    // むら
    const nz = fbm2(u * 18, v * 30, sd, 3) - 0.5, nz2 = vnoise(u * 90, v * 90, sd + 3) - 0.5;
    L += 5 * nz + 1.5 * nz2; a += 2.5 * nz;
    labToLin(L, a, b, o);
    for (const d of dots) { const dd = Math.hypot(u - d.u, (v - d.v) * 0.8); if (dd < d.r * 1.6) { const m = 1 - sstep(d.r * 0.6, d.r * 1.6, dd); o[0] = lerp(o[0], 0.96, m); o[1] = lerp(o[1], 0.94, m); o[2] = lerp(o[2], 0.88, m); } }
    const xx = orientation === 'along-v' ? y : x, yy = orientation === 'along-v' ? x : y;     // 転置
    const i = (yy * size + xx) * 4; img[i] = toByte(o[0]); img[i + 1] = toByte(o[1]); img[i + 2] = toByte(o[2]); img[i + 3] = 255;
  }
  return { width: size, height: size, data: img };
}

// ───────────────────────────── メイン生成 ─────────────────────────────
export function generateBodyTextures({ surface, params, genome = {}, seed = 1, width = 2048, height = 1024, mouth: mouthOpts = {} } = {}) {
  const t0 = Date.now(); const timing = {};
  const P = params ?? surface.params;
  const W = width, H = height; const SL = surface.SL; const slMm = SL * 1000;
  const G0 = resolveGenome(genome); G0.slM = SL;
  G0.stage = STAGES[G0.lifeStage] ? G0.lifeStage : (P?.stage === 'adult' ? 'adult' : 'parr'); const STG = STAGES[G0.stage];
  const ind = planIndividual(seed, G0);
  const G = Object.assign(G0, { W, H, SL });
  const geo = buildGeometry(surface, W, H); Object.assign(G, { Av: geo.Av, Xm: geo.Xm, circ: geo.circ, mmU: geo.mmU });
  const uvStats = (() => { // UV の物理的な歪み: u 方向（体軸 3D 距離/テクセル ÷ 公称）と, 周方向テクセル幅 / 軸方向テクセル幅
    let xMax = 0, xMaxTail = 0; const xs = geo.Xm;
    for (let j = 0; j < H; j += 4) for (let x = 0; x < W - 1; x++) { const ratio = (xs[j * W + x + 1] - xs[j * W + x]) / geo.mmU; if (ratio > xMax) xMax = ratio; if (x / (W - 1) > 0.9 && ratio > xMaxTail) xMaxTail = ratio; }
    let vMin = 1e9, vMax = 0, vMinTail = 1e9, vMaxTail = 0;
    for (let x = 0; x < W; x++) { const q = geo.circ[x] / (H - 1) / geo.mmU; if (x / (W - 1) > 0.02) { vMin = Math.min(vMin, q); vMax = Math.max(vMax, q); } if (x / (W - 1) > 0.9) { vMinTail = Math.min(vMinTail, q); vMaxTail = Math.max(vMaxTail, q); } }
    return { u_metric_max: +xMax.toFixed(4), u_metric_max_s_gt_0p9: +xMaxTail.toFixed(4), v_over_u_texel: [+vMin.toFixed(3), +vMax.toFixed(3)], v_over_u_texel_s_gt_0p9: [+vMinTail.toFixed(3), +vMaxTail.toFixed(3)], note: 'patterns are laid out in true surface mm (arc length around, 3D distance along); u metric > 1 only where the section tapers' };
  })();
  const pal = designPalette(G);
  const { Y, Av, Xm, cS, hS, circ, mmU, halfRow } = geo;
  timing.geometry = Date.now() - t0;

  const N = W * H;
  const R = new Float32Array(N), Gc = new Float32Array(N), B = new Float32Array(N);     // 線形 albedo
  const maskPM = new Float32Array(N), maskSpot = new Float32Array(N), maskLow = new Float32Array(N), maskLL = new Float32Array(N);
  const sheenM = new Float32Array(N), opStreak = new Float32Array(N), axil = new Float32Array(N), pinkW = new Float32Array(N);
  const rr = new Float32Array(N);                                                       // r = Y/h
  const headW = new Float32Array(N);                                                    // 頭部重み
  const opM = new Float32Array(N);                                                      // 鰓蓋マスク
  const eyeS = P.eye?.center_s?.v ?? 0.095, eyeFrac = P.eye?.center_height_frac_from_top?.v ?? 0.33, eyeD = (P.eye?.outer_d_over_sl?.v ?? 0.056);
  const opEdgeV = P.operculum?.edge_s?.v ?? 0.25;
  const rEye = 1 - 2 * eyeFrac;
  const eyeMm = eyeD * slMm;                                                            // 眼窩縁込み外径 mm

  // --- 1) 地色 -------------------------------------------------------------------------------------------------
  const sdA = seedInt(seed, 'noiseA'), sdB = seedInt(seed, 'noiseB'), sdC = seedInt(seed, 'noiseC'), sdSc = seedInt(seed, 'scales');
  const rngScale = makeRng(seed, 'scale-phase');
  const pitchMm = G.scalePitchPctSl / 100 * slMm;
  const phX = rngScale() * pitchMm, phY = rngScale() * pitchMm;
  const pinkLin = labToLin(pal.pink[0], pal.pink[1], pal.pink[2], [0, 0, 0]);
  const opLin = labToLin(...pal.opercle, [0, 0, 0]), opBlueLin = labToLin(...pal.opercleBlue, [0, 0, 0]), jawLin = labToLin(...pal.jaw, [0, 0, 0]);
  const bellyLin = [0, 1, 2].map((c) => pal.bodyLut[(Math.round(0.05 * (NL - 1))) * 3 + c]);   // r=-0.9 の腹色
  const axS = (P.fins?.pectoral?.origin_s ?? 0.258) + 0.004;
  const shBlue = labToLin(...pal.sheenBlue, [0, 0, 0]), shLilac = labToLin(...pal.sheenLilac, [0, 0, 0]), shGreen = labToLin(...pal.sheenGreen, [0, 0, 0]);
  const lipLin = labToLin(26, 8, 8, [0, 0, 0]), orbitLin = labToLin(22, 2, 6, [0, 0, 0]);
  const orLin = labToLin(...pal.orange, [0, 0, 0]);
  const pinkS = clamp(G.pinkBandStrength + 0.6 * G.nuptialIntensity, 0, 1.2);
  const sinA = new Float32Array(H), cosA = new Float32Array(H), opEdgeRow = new Float32Array(H);
  for (let j = 0; j < H; j++) {
    const a = TAU * j / (H - 1); sinA[j] = Math.sin(a); cosA[j] = Math.cos(a);
    opEdgeRow[j] = opEdgeV + 0.010 * Math.pow(Math.abs(sinA[j]), 1.5) - 0.004 * cosA[j] * cosA[j];   // loft.mjs の opEdge と同形 [E]
  }
  const llY = new Float32Array(W); for (let x = 0; x < W; x++) llY[x] = llOffset(clamp(x / (W - 1), 0.25, 1.0)) * (x / (W - 1) < 0.25 ? sstep(0.05, 0.25, x / (W - 1)) : 1);
  const tmp3 = [0, 0, 0];
  for (let j = 0; j < H; j++) {
    const right = j < halfRow; const side = right ? 0 : 1;
    for (let x = 0; x < W; x++) {
      const idx = j * W + x; const s = x / (W - 1);
      const h = Math.max(hS[x], 1e-4); const r = clamp(Y[idx] / h, -1, 1); rr[idx] = r;
      const li = ((r + 1) * 0.5 * (NL - 1)) | 0; const lf = ((r + 1) * 0.5 * (NL - 1)) - li; const l2 = Math.min(li + 1, NL - 1);
      const d = right ? Av[idx] : circ[x] - Av[idx]; const xm = Xm[idx]; const tt = d / (circ[x] * 0.5 + 1e-6);
      // 体 / 頭 の混合
      const sop = opEdgeRow[j];
      const hwN = 1 - sstep(sop - 0.012, sop + 0.016, s), hwW = 1 - sstep(sop - 0.045, sop + 0.04, s);
      const hw = lerp(hwN, hwW, sstep(0.1, 0.5, r)); headW[idx] = hw;      // 背側は広くぼかして頭部の暗色が箱に見えないようにする
      let cr = lerp(pal.bodyLut[li * 3], pal.bodyLut[l2 * 3], lf), cg = lerp(pal.bodyLut[li * 3 + 1], pal.bodyLut[l2 * 3 + 1], lf), cb = lerp(pal.bodyLut[li * 3 + 2], pal.bodyLut[l2 * 3 + 2], lf);
      if (hw > 0) {
        const hr = lerp(pal.headLut[li * 3], pal.headLut[l2 * 3], lf), hg = lerp(pal.headLut[li * 3 + 1], pal.headLut[l2 * 3 + 1], lf), hb = lerp(pal.headLut[li * 3 + 2], pal.headLut[l2 * 3 + 2], lf);
        cr = lerp(cr, hr, hw); cg = lerp(cg, hg, hw); cb = lerp(cb, hb, hw);
        // 鰓蓋: 銀〜桃の金属光沢
        const sFront = 0.135 + 0.02 * r * r; const sMid = 0.5 * (sFront + sop + 0.004), aS = 0.5 * (sop + 0.004 - sFront);
        const qo = ((s - sMid) / aS) ** 2 + ((r + 0.06) / 0.64) ** 2; const om = (1 - sstep(0.15, 1.0, qo)) * hwN;
        if (om > 0) { // 鰓蓋: 銀(オリーブ〜青灰)の金属光沢 + 鰓蓋骨の放射状の筋。平坦な白は避ける
          opM[idx] = om;
          const nzo = fbm2(xm / 4.0, d / 4.0, sdA + 11, 3);
          const ang = Math.atan2((r - 0.42) * h, s - 0.135);
          const streak = Math.sin(ang * 60 + 4.0 * (fbm2(xm / 6, d / 6, sdA + 17, 2) - 0.5));
          opStreak[idx] = streak * om;
          const sheen = 0.93 + 0.22 * (nzo - 0.5) + 0.035 * streak + 0.07 * Math.sin(5.0 * (s - sFront) / (sop - sFront + 1e-3) + 2 * r);
          const mixB = sstep(0.35, 0.65, fbm2(xm / 9, d / 9, sdA + 23, 2));
          const o0 = lerp(opLin[0], opBlueLin[0], mixB) * sheen, o1 = lerp(opLin[1], opBlueLin[1], mixB) * sheen, o2 = lerp(opLin[2], opBlueLin[2], mixB) * sheen;
          cr = lerp(cr, o0, om * 0.7); cg = lerp(cg, o1, om * 0.7); cb = lerp(cb, o2, om * 0.7);
        }
        // 下顎・吻先: 淡色 / 唇線
        const jm = (1 - sstep(0.115, 0.14, s)) * (1 - sstep(G.mouthLineR - 0.10, G.mouthLineR + 0.06, r)) * hw;
        if (jm > 0) { cr = lerp(cr, jawLin[0], jm * 0.8); cg = lerp(cg, jawLin[1], jm * 0.8); cb = lerp(cb, jawLin[2], jm * 0.8); }
        if (s < 0.125) {
          const dy = (Y[idx] - G.mouthLineR * hS[x]) * slMm; const lm = Math.exp(-(dy * dy) / (2 * 0.32 * 0.32)) * 0.4;
          cr = lerp(cr, lipLin[0], lm); cg = lerp(cg, lipLin[1], lm); cb = lerp(cb, lipLin[2], lm);
        }
        // 眼窩の暗輪（眼球メッシュは別。ここは縁の馴染ませ）
        const ex = (s - eyeS) * slMm, ey = (Y[idx] - (rEye * hS[Math.round(eyeS * (W - 1))])) * slMm;
        const er = Math.hypot(ex, ey) / (eyeMm * 0.5);
        const em = (1 - sstep(1.1, 1.65, er)) * 0.40; if (em > 0) { cr = lerp(cr, orbitLin[0], em); cg = lerp(cg, orbitLin[1], em); cb = lerp(cb, orbitLin[2], em); }
      }
      // 低周波のむら（背は暗色素のまだら）+ 微細な色素胞のごま塩
      const dorsalness = sstep(0.4, 0.95, r), bodyW = 1 - hw;
      const nzLow = fbm2(xm / 6.0, d / 5.0, sdB, 3) - 0.5, nzFine = vnoise(xm / 0.9, d / 0.9, sdC) - 0.5;
      let k = 1 + (0.10 + 0.16 * dorsalness) * nzLow + (0.03 + 0.06 * dorsalness) * nzFine;
      // 体側上半の微小な黒色素点（p033: 鱗 1 枚以下の暗点が桃/金の地にまばらに散る）
      if (bodyW > 0 && r > -0.35 && !G.debugGround) {
        const gx = xm / 0.55, gy = d / 0.55, ix = Math.floor(gx), iy = Math.floor(gy), hh = ihash(ix, iy, sdC + 5);
        const pDot = 0.22 * sstep(-0.35, 0.35, r) * (1 - 0.5 * dorsalness);
        if (hh < pDot) { const dd = Math.hypot(gx - ix - 0.5 + (ihash(ix, iy, sdC + 6) - 0.5) * 0.4, gy - iy - 0.5 + (ihash(ix, iy, sdC + 7) - 0.5) * 0.4); k *= 1 - 0.30 * (1 - sstep(0.12, 0.30, dd)) * bodyW; }
      }
      cr *= k; cg *= k; cb *= k;
      // 桃色の面的な染み（側線沿い〜パーマーク間）[P: 03 §3.4.1, p033/p035/p041 の鮭肉色]。細帯ではなく面的な拡散, 左右で独立
      if (pinkS > 0) {
        const rLL = llY[x] / h + 0.12; const pr = (r - rLL) / 0.20; const prof = Math.exp(-0.5 * pr * pr);
        if (prof > 0.02) {
          const along = (0.40 + 0.60 * sstep(0.25, 0.48, s)) * (1 + 0.25 * sstep(0.86, 0.97, s)) * (1 - 0.6 * hw);
          const wSide = sstep(0.12, 0.35, tt) * (1 - sstep(0.85, 1.0, tt));
          const n1 = fbm2(xm / 13 + 31.7 * side * wSide, d / 5.0, sdA + 5, 3);
          const n0 = fbm2(xm / 13, d / 5.0, sdA + 5, 3);
          const nz = lerp(n0, n1, wSide);
          const mod = clamp(0.30 + 1.6 * (nz - 0.30), 0, 1.25);
          const wp = clamp(pinkS * 0.85 * prof * along * mod, 0, 0.5);
          cr = lerp(cr, pinkLin[0], wp); cg = lerp(cg, pinkLin[1], wp); cb = lerp(cb, pinkLin[2], wp);
          pinkW[idx] = wp;
        }
      }
      // 虹色の光沢（イリドフォア: 青紫 / 桃紫 / 緑の斑が側線沿い〜体側下半に弱く移ろう 03 §3.6.2, p031/p043/p048）
      if (G.sheenBand > 0 && s > 0.255) {
        const rLL = llY[x] / h; const q = (r - (rLL - 0.10)) / 0.34; const pr2 = Math.exp(-0.5 * q * q);
        if (pr2 > 0.03) {
          const wS2 = sstep(0.12, 0.35, tt) * (1 - sstep(0.85, 1.0, tt));
          const nL = lerp(fbm2(xm / 17, d / 6.5, sdB + 3, 3), fbm2(xm / 17 + 23.1 * side, d / 6.5, sdB + 3, 3), wS2);
          const nG = lerp(fbm2(xm / 21, d / 7.5, sdB + 19, 3), fbm2(xm / 21 + 41.7 * side, d / 7.5, sdB + 19, 3), wS2);
          const wL = sstep(0.42, 0.70, nL), wG = sstep(0.50, 0.74, nG) * (1 - wL);
          const lilacMix = sstep(0.35, 0.65, fbm2(xm / 9, d / 5, sdB + 9, 2));          // 青 <-> 桃紫
          const strength = G.sheenBand * 0.95 * pr2 * sstep(0.26, 0.36, s);
          const wsL = clamp(strength * wL, 0, 0.50), wsG = clamp(strength * wG * 0.8, 0, 0.50);       // 2 色の重みは別々に連続的に混ぜる（硬い切替は円盤状の縁になる）
          cr = lerp(cr, lerp(shBlue[0], shLilac[0], lilacMix), wsL); cg = lerp(cg, lerp(shBlue[1], shLilac[1], lilacMix), wsL); cb = lerp(cb, lerp(shBlue[2], shLilac[2], lilacMix), wsL);
          cr = lerp(cr, shGreen[0], wsG); cg = lerp(cg, shGreen[1], wsG); cb = lerp(cb, shGreen[2], wsG);
          sheenM[idx] = pr2 * sstep(0.26, 0.36, s) * Math.max(wL, wG);
        }
      }
      // 尾柄は少し暖かく（a01 の尾柄: 黄みを帯びた銀）
      { const tw = sstep(0.78, 0.97, s) * sstep(0.7, -0.4, r); if (tw > 0) { cr *= 1 + 0.05 * tw; cb *= 1 - 0.07 * tw; } }
      // 胸鰭基部（腋部）: 鰭モジュールの襟(collar)と明度が揃うよう, 腹と同じ淡い銀白にする（s≈0.26, r≈-0.84..-0.49）
      { const qa = ((s - axS) / 0.026) ** 2 + ((r + 0.66) / 0.36) ** 2; const ax = 1 - sstep(0.2, 1.0, qa);
        if (ax > 0) { axil[idx] = ax; const wa = 0.9 * ax; cr = lerp(cr, bellyLin[0], wa); cg = lerp(cg, bellyLin[1], wa); cb = lerp(cb, bellyLin[2], wa); } }
      R[idx] = cr; Gc[idx] = cg; B[idx] = cb;
    }
  }
  timing.base = Date.now() - t0;

  // --- 4) 鱗（高さ場 / 格子 / 光沢のゆらぎ）-----------------------------------------------------------------------
  // 鱗ピッチ p（物理 mm）。千鳥格子: 行間 q=p/2, 偶奇行で p/2 ずれ。円盤半径 R=0.78p, 前方の鱗が後方の鱗の上に重なる（自由縁は尾側）。
  const hgt = new Float32Array(N), crease = new Float32Array(N), rim = new Float32Array(N), srand = new Float32Array(N).fill(0.5), srand2 = new Float32Array(N).fill(0.5), cellU = new Float32Array(N).fill(0.5);
  {
    const p = pitchMm, q = 0.5 * p, Rr = 0.78 * p, R2 = Rr * Rr;
    const Amm = 0.1 * (slMm / 300);                                  // 突出上限 0.1 mm @ SL300 [r06v V-09] を SL 比で換算
    const cx = new Float64Array(10), cd2 = new Float64Array(10), ck = new Int32Array(10), cj = new Int32Array(10);
    const amp = new Float32Array(W); for (let x = 0; x < W; x++) amp[x] = sstep(0.235, 0.29, x / (W - 1));
    const x0 = Math.floor(0.235 * (W - 1));
    for (let j = 0; j < H; j++) {
      const right = j < halfRow;
      for (let x = x0; x < W; x++) {
        const idx = j * W + x; const xm = Xm[idx] + phX; const dm = (right ? Av[idx] : circ[x] - Av[idx]) + phY;
        const j0 = Math.round(dm / q); let n = 0;
        for (let jj = j0 - 2; jj <= j0 + 2; jj++) {
          const off = (jj & 1) ? 0.5 * p : 0; const kc = Math.floor((xm - off) / p);
          for (let kk = kc; kk <= kc + 1; kk++) {
            const xc = kk * p + off + (ihash(kk, jj, sdSc) - 0.5) * 0.14 * p, yc = jj * q + (ihash(kk, jj, sdSc + 7) - 0.5) * 0.14 * q;
            const dx = xm - xc, dy = dm - yc; cx[n] = xc; cd2[n] = dx * dx + dy * dy; ck[n] = kk; cj[n] = jj; n++;
          }
        }
        let w = -1, bx = 1e30; for (let i = 0; i < n; i++) if (cd2[i] <= R2 && cx[i] < bx) { bx = cx[i]; w = i; }
        if (w < 0) { let bd = 1e30; for (let i = 0; i < n; i++) if (cd2[i] < bd) { bd = cd2[i]; w = i; } }
        let over = 1e9; for (let i = 0; i < n; i++) if (i !== w && cx[i] < cx[w]) { const dd = Math.sqrt(cd2[i]) - Rr; if (dd < over) over = dd; }
        const dw = Math.sqrt(cd2[w]); const u = clamp01((xm - cx[w] + Rr) / (2 * Rr));
        const a = amp[x];
        const r1 = ihash(ck[w], cj[w], sdSc + 21 + (right ? 0 : 1)), r2 = ihash(ck[w], cj[w], sdSc + 29 + (right ? 0 : 1));
        // 鱗ごとに微小に傾く（イリドフォアの板が少しずつ違う向き -> 反射のきらめき）
        const dxc = (xm - cx[w]) / Rr, dyc = (dm - ((cj[w]) * q)) / Rr;
        hgt[idx] = Amm * ((0.1 + 0.9 * u) + 0.55 * ((r1 - 0.5) * dxc + (r2 - 0.5) * dyc)) * a;
        srand2[idx] = 0.5 + (r2 - 0.5) * a; cellU[idx] = u;
        crease[idx] = (1 - sstep(0, 0.16 * p, over)) * a;
        rim[idx] = sstep(Rr - 0.16 * p, Rr, dw) * a;
        srand[idx] = 0.5 + (ihash(ck[w], cj[w], sdSc + 13 + (right ? 0 : 1)) - 0.5) * a;
      }
    }
  }
  // --- 2) パーマーク ---------------------------------------------------------------------------------------------
  // 色は画素ごと: 地色(その高さ r の設計色) + ΔL, 色相は青灰〜青紫へ寄せる。背側では地色が暗いので ΔL を縮め, 斑は背の暗色へ溶ける（p024: 斑の上端は背に消える）。
  const marksBySide = G.debugGround ? { right: [], left: [] } : { right: genMarks('right', seed, ind, G, pal, geo, surface), left: genMarks('left', seed, ind, G, pal, geo, surface) };
  const soft = clamp(G.pmEdgeSoftness, 0.05, 0.35);
  const markLin = [0, 0, 0], slateAB = pal.markSlate, violAB = pal.markViolet;
  for (const side of ['right', 'left']) {
    const j0 = side === 'right' ? 0 : Math.ceil(halfRow), j1 = side === 'right' ? Math.floor(halfRow) : H - 1;
    for (const m of marksBySide[side]) {
      const ext = m.parts.reduce((mx, p) => Math.max(mx, Math.abs(p.ds) + Math.max(p.w, p.h) * 0.8), 0) + 0.03;
      const xa = Math.max(0, Math.floor((m.s - ext) * (W - 1))), xb = Math.min(W - 1, Math.ceil((m.s + ext) * (W - 1)));
      const ct = Math.cos(m.tilt * deg), st = Math.sin(m.tilt * deg);
      const tA = lerp(slateAB[1], violAB[1], m.violet), tB = lerp(slateAB[2], violAB[2], m.violet);
      for (let j = j0; j <= j1; j++) for (let x = xa; x <= xb; x++) {
        const idx = j * W + x; const s = x / (W - 1); const yv = Y[idx];
        let best = 0;
        const xm = Xm[idx], d = side === 'right' ? Av[idx] : circ[x] - Av[idx];
        const rag = 1 + 0.07 * (fbm2(xm / 0.9 + m.nseed * 0.37, d / 0.9, m.nseed, 2) - 0.5) + 0.05 * (vnoise(xm / 3.2, d / 3.2, m.nseed + 9) - 0.5) + 0.06 * (srand[idx] - 0.5);   // 縁が鱗の大きさで凸凹（色素胞が鱗ごとに並ぶ）
        for (let pi = 0; pi < m.parts.length; pi++) {
          const p = m.parts[pi];
          const dx = s - (m.s + p.ds), dy = yv - (m.yc + p.dy);
          const tcs = pi === 0 ? ct : Math.cos((m.tilt + p.tilt) * deg), tsn = pi === 0 ? st : Math.sin((m.tilt + p.tilt) * deg);
          const ex = (dx * tcs + dy * tsn) / (p.w / 2), ey = (-dx * tsn + dy * tcs) / (p.h / 2);
          let rho = Math.sqrt(ex * ex + ey * ey);
          if (rho > 1.6) continue;
          const phi = Math.atan2(ey, ex);
          const wob = 1 + m.amp[0] * Math.cos(2 * phi + m.ph[0]) + m.amp[1] * Math.cos(3 * phi + m.ph[1]) + m.amp[2] * Math.cos(4 * phi + m.ph[2]);
          // 上端・下端はやや尖らせ（小判型）
          rho = rho / (wob * rag);
          const sl = Math.min(0.5, soft * STG.soft * (0.50 + 1.0 * sstep(-0.2, 0.95, ey)));    // 下 2/3 は輪郭を鋭く, 上端は背の暗色に溶ける
          const mk = 1 - sstep(1 - sl, 1 + sl, rho);
          if (mk > best) best = mk;
        }
        if (best <= 0) continue;
        if (m.cut) { // 分裂: 上下の割れ目
          const dx = s - m.s, dy = yv - m.yc; const ey = (-dx * st + dy * ct) / m.h + 0.5; // 0 下端 .. 1 上端
          best *= 1 - m.cut.depth * (1 - sstep(m.cut.t * 0.5, m.cut.t, Math.abs(ey - m.cut.f)));
        }
        const r = rr[idx];
        const [gL, gA, gB] = pal.labBody(r);
        const dark = sstep(0.42, 0.92, r);                                  // 背に近いほど ΔL を縮める
        const L = Math.max(21, gL + m.dL * (1 - 0.62 * dark)); const q = 0.88 * (1 - 0.45 * dark);
        labToLin(L, gA + (tA - gA) * q, gB + (tB - gB) * q, markLin);
        const tex = (0.80 + 0.40 * fbm2(xm / 1.9 + 3.1, d / 1.9, m.nseed, 3) + 0.06 * best) * (1 + 0.24 * (srand[idx] - 0.5) * (1 - 0.5 * best));   // 濃淡のゆらぎ（鱗数枚ぶんの斑）+ 鱗ごとの色素量 + 中心がやや濃い
        const a = clamp(m.op * best * tex, 0, 1) * (1 - sstep(0.945, 0.99, s));      // 最後の斑は尾端へ向けてなだらかに消え, 尾端リングは地色のまま連続
        R[idx] = lerp(R[idx], markLin[0], a); Gc[idx] = lerp(Gc[idx], markLin[1], a); B[idx] = lerp(B[idx], markLin[2], a);
        if (a > maskPM[idx]) maskPM[idx] = a;
      }
    }
  }
  // 斑の周りの桃〜鮭肉色（p033/p035/p041: 斑と斑の間の地が一段赤い）: 斑マスクを幅 ~2.5 mm でぼかした殻に桃を重ねる
  if (!G.debugGround && pinkS > 0) {
    const halo = new Float32Array(N), tmpB = new Float32Array(N); const rad = Math.max(2, Math.round(2.6 / mmU / 3));   // 3 回のボックスぼかし ≈ ガウス
    halo.set(maskPM); for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < H; j++) { let acc = 0; const o = j * W; for (let k = -rad; k <= rad; k++) acc += halo[o + clamp(k, 0, W - 1)]; for (let x = 0; x < W; x++) { tmpB[o + x] = acc / (2 * rad + 1); acc += halo[o + Math.min(x + rad + 1, W - 1)] - halo[o + Math.max(x - rad, 0)]; } }
      const rv = Math.max(2, Math.round(rad * 0.8));   // v 方向は 1 テクセルが ~1.3 倍長いので少し細く
      for (let x = 0; x < W; x++) { let acc = 0; for (let k = -rv; k <= rv; k++) acc += tmpB[(((k % (H - 1)) + (H - 1)) % (H - 1)) * W + x]; for (let j = 0; j < H - 1; j++) { halo[j * W + x] = acc / (2 * rv + 1); acc += tmpB[((j + rv + 1) % (H - 1)) * W + x] - tmpB[((((j - rv) % (H - 1)) + (H - 1)) % (H - 1)) * W + x]; } halo[(H - 1) * W + x] = halo[x]; }
    }
    for (let idx = 0; idx < N; idx++) {
      const hv = halo[idx]; if (hv < 0.02) continue; const r = rr[idx], s = (idx % W) / (W - 1);
      const wr = bellW(r, 0.12, 0.36) * (1 - 0.7 * headW[idx]) * sstep(0.27, 0.34, s);
      const w2 = clamp(pinkS * 1.1 * hv * (1 - clamp01(maskPM[idx] * 1.5)) * wr, 0, 0.30);
      if (w2 > 0) { R[idx] = lerp(R[idx], pinkLin[0], w2); Gc[idx] = lerp(Gc[idx], pinkLin[1], w2); B[idx] = lerp(B[idx], pinkLin[2], w2); pinkW[idx] = Math.max(pinkW[idx], w2); }
    }
  }
  timing.marks = Date.now() - t0;

  // --- 3) 黒点（体側下半の丸斑 / 背側 / 頭部）と朱点 ---------------------------------------------------------------
  const spotReport = { dorsal: {}, below: {}, head: {}, orange: { mode: ind.orangeMode, count: 0 } };
  const drawSpots = (spots, lin, edgeSoft, maskArr, keepRoughMask) => {
    for (const sp of spots) {
      const cs = Math.cos(sp.rot), sn = Math.sin(sp.rot);
      const rx = sp.rx, rd = sp.rd; const span = Math.ceil(Math.max(rx, rd) * 1.6 / mmU) + 2;
      const j0 = sp.side === 'right' ? 0 : Math.ceil(halfRow), j1 = sp.side === 'right' ? Math.floor(halfRow) : H - 1;
      const rowSpan = span * 6;
      for (let j = Math.max(j0, sp.j - rowSpan); j <= Math.min(j1, sp.j + rowSpan); j++) for (let x = Math.max(0, sp.x - span); x <= Math.min(W - 1, sp.x + span); x++) {
        const idx = j * W + x; const xm = Xm[idx], d = sp.side === 'right' ? Av[idx] : circ[x] - Av[idx];
        const dx = xm - sp.xm, dd = d - sp.dm; const ex = (dx * cs + dd * sn) / rx, ey = (-dx * sn + dd * cs) / rd;
        const rho = Math.sqrt(ex * ex + ey * ey); if (rho > 1.5) continue;
        const phs = Math.atan2(ey, ex); const wob = 1 + 0.05 * Math.sin(2 * phs + sp.rot * 7) + 0.06 * Math.sin(3 * phs + sp.rot * 13 + 1.7) + 0.03 * Math.sin(5 * phs + sp.rot * 3);   // 少し歪んだ縁
        const m = 1 - sstep(1 - edgeSoft, 1 + edgeSoft, rho / wob); if (m <= 0) continue;
        const a = clamp(m * sp.tone * (sp.opacity ?? 1), 0, 1);
        R[idx] = lerp(R[idx], lin[0], a); Gc[idx] = lerp(Gc[idx], lin[1], a); B[idx] = lerp(B[idx], lin[2], a);
        if (maskArr && a > maskArr[idx]) maskArr[idx] = a;
      }
    }
  };
  const spotLin = labToLin(...pal.markBlack, [0, 0, 0]);
  const dorsalCount = {};
  for (const side of (G.debugGround ? [] : ['right', 'left'])) {
    const ctx = { G: Object.assign(G, {}), surface, W, side };
    // 背側の黒点: 2-5 列, 尾柄側ほど疎, 眼径比 0.15 (0.05-0.35) [P: 03 §3.2.1/3.2.4]
    const rngD = makeRng(seed, 'spots:dorsal:' + side);
    const nD = clamp(Math.round(G.spotDorsalN * G.spotDensity * STG.spots * Math.exp(0.12 * gauss(rngD))), 0, 220);
    const rows = clamp(Math.round(G.spotDorsalRows), 2, 5);
    const diamD = clamp(G.spotDorsalDiamEyeD * eyeMm * STG.spotSize, 0.4, 3.8);   // 径 ~1 mm（鱗 1 枚）
    const dorsal = placeSpots({ rng: rngD, count: nD, sMin: 0.255, sMax: 0.965, dens: (s) => 1 - 0.55 * sstep(0.40, 1.0, s), rows, rTop: 0.95, rStep: 0.088, rJit: 0.026, scatterP: 0.10, rScatter: [0.18, 0.95],
      diamMm: () => clamp(diamD * Math.exp(0.42 * gauss(rngD)), 0.45, 3.9), gapF: 1.9, ctx, rejectMask: maskPM });
    drawSpots(dorsal, spotLin, 0.28, maskSpot);
    // 体側下半の丸斑（青灰, 一部黒灰）: 前方ほど大きい, 1-4 列
    const rngB = makeRng(seed, 'spots:below:' + side);
    const nB = clamp(Math.round(G.spotBelowN * Math.exp(0.35 * gauss(rngB))), 0, 60);
    const rowsB = 1 + Math.floor(rngB() * 4);
    const diamB = G.spotBelowDiamEyeD * eyeMm;
    const below = placeSpots({ rng: rngB, count: nB, sMin: 0.27, sMax: 0.955, dens: (s) => 1 - 0.75 * sstep(0.3, 1.0, s), rows: rowsB, rTop: -0.16, rStep: 0.11, rJit: 0.04, rScatter: [-0.6, -0.1],
      diamMm: (s) => clamp(diamB * lerp(1.35, 0.55, sstep(0.27, 0.95, s)) * Math.exp(0.25 * gauss(rngB)), 0.8, 6.5), gapF: 1.7, ctx, rejectMask: maskPM });
    for (const sp of below) { sp.black = rngB() < G.spotBelowBlackP; sp.opacity = 0.9; }
    drawSpots(below.filter((q) => !q.black), labToLin(...pal.spotBelow, [0, 0, 0]), 0.35, maskLow);
    drawSpots(below.filter((q) => q.black), labToLin(...pal.spotBelowBlack, [0, 0, 0]), 0.35, maskLow);
    // 側線の下の小さな黒点（数個）[P: p002/p033/p049 の体側下半の小黒点]
    const smallBlack = placeSpots({ rng: rngB, count: Math.round(G.spotBelowSmallBlackN * Math.exp(0.3 * gauss(rngB))), sMin: 0.28, sMax: 0.95, dens: (s) => 1 - 0.5 * sstep(0.4, 1.0, s), rows: 2, rTop: -0.12, rStep: 0.15, rJit: 0.05, scatterP: 0.25, rScatter: [-0.55, -0.06],
      diamMm: () => clamp(0.085 * eyeMm * Math.exp(0.35 * gauss(rngB)), 0.45, 1.8), gapF: 2.2, ctx, rejectMask: maskPM });
    drawSpots(smallBlack, spotLin, 0.3, maskSpot);
    // 頭部〜鰓蓋上部の微小黒点
    const rngH = makeRng(seed, 'spots:head:' + side);
    const nH = ind.nHead === 0 ? 0 : (side === 'right' ? ind.nHead : clamp(ind.nHead + Math.floor(rngH() * 3) - 1, 1, 10));
    const head = placeSpots({ rng: rngH, count: nH, sMin: 0.03, sMax: 0.235, dens: () => 1, rows: 1, rTop: 0.6, rStep: 0, rJit: 0, scatterP: 1, rScatter: [0.25, 0.93],
      diamMm: () => clamp(G.spotHeadDiamEyeD * eyeMm * (0.8 + 0.5 * rngH()), 0.35, 1.4), gapF: 2.5, ctx, rejectMask: null });
    drawSpots(head, spotLin, 0.3, maskSpot);
    // 朱点（既定なし / trace: 1-3 個）
    let orange = [];
    if (ind.orangeMode !== 'none') {
      const rngO = makeRng(seed, 'spots:orange:' + side);
      const nO = ind.orangeMode === 'region_hybrid' ? 4 + Math.floor(rngO() * 12) : (side === 'right' ? 1 + Math.floor(rngO() * 3) : Math.floor(rngO() * 2));
      orange = placeSpots({ rng: rngO, count: nO, sMin: 0.35, sMax: 0.9, dens: () => 1, rows: 1, rTop: 0.0, rStep: 0, rJit: 0.06, scatterP: 0, rScatter: [0, 0],
        diamMm: () => (0.05 + 0.07 * rngO()) * eyeMm, gapF: 3, ctx, rejectMask: maskPM });
      drawSpots(orange, orLin, 0.35, null);
    }
    dorsalCount[side] = dorsal.length;
    spotReport.dorsal[side] = dorsal.length; spotReport.below[side] = below.length; spotReport.head[side] = head.length; spotReport.orange.count += orange.length;
    spotReport.below[side + '_black'] = below.filter((q) => q.black).length; spotReport.below[side + '_smallBlack'] = smallBlack.length;
  }
  timing.spots = Date.now() - t0;

  if (G.debugGround) { hgt.fill(0); crease.fill(0); rim.fill(0); srand.fill(0.5); srand2.fill(0.5); }
  // 側線: 鱗ピッチ間隔の有孔鱗の小さな窪み列 [02 §2.6 lateral_line_scale_count 118-134 -> 周期 ≈ 0.6%SL]
  const pitDepth = 0.03 * (slMm / 300); const llNLL = Math.floor((0.985 - 0.265) / 0.0058) + 1; const llSigma = 0.17;
  for (const side of ['right', 'left']) {
    const jOff = (side === 'right' ? 0 : 0);
    for (let k = 0; k < llNLL; k++) {
      const s = 0.265 + k * 0.0058; const x = Math.round(s * (W - 1));
      const jc = rowForR(surface, G, s, llOffset(s) / Math.max(hS[x], 1e-4), side) + jOff;
      const idc = jc * W + x; const xc = Xm[idc], dc = side === 'right' ? Av[idc] : circ[x] - Av[idc];
      const span = Math.ceil(0.7 / mmU) + 1;
      for (let j = Math.max(0, jc - 12); j <= Math.min(H - 1, jc + 12); j++) for (let xx = Math.max(0, x - span); xx <= Math.min(W - 1, x + span); xx++) {
        if ((side === 'right') !== (j < halfRow)) continue;
        const id2 = j * W + xx; const d2 = side === 'right' ? Av[id2] : circ[xx] - Av[id2];
        const ddx = Xm[id2] - xc, ddd = d2 - dc; const g = Math.exp(-(ddx * ddx + ddd * ddd) / (2 * llSigma * llSigma));
        hgt[id2] -= pitDepth * g; if (g > maskLL[id2]) maskLL[id2] = g;
      }
    }
  }
  for (let i = 0; i < N; i++) if (opStreak[i] !== 0) hgt[i] += 0.008 * (slMm / 190) * opStreak[i];   // 鰓蓋の放射状の微弱な筋 (<1°)
  timing.scales = Date.now() - t0;

  // --- 5) 鱗の光沢ゆらぎ・側線を albedo へ, 色を 8bit へ -------------------------------------------------------------------
  // 設計色(R,Gc,B: 線形, 「写真に写る見かけの色」) -> 線形 albedo は CAL_KNOTS（統合描画で見かけ=設計色になるよう実測）で逆算する。上限 ALB_MAX。
  const albedo = new Uint8Array(N * 4);
  const scaleVisAlbedo = STG.scaleVis;
  const sceneC = [0, 0, 0];
  for (let j = 0; j < H; j++) for (let x = 0; x < W; x++) {
    const idx = j * W + x; const r = rr[idx]; const hw = headW[idx];
    const li = ((r + 1) * 0.5 * (NL - 1)) | 0; const sil = clamp01(lerp(pal.silver[li], pal.silverHead[li], hw) * (1 - 0.5 * maskPM[idx]) * (1 - maskSpot[idx]) + opM[idx] * 0.7);
    const vis = scaleVisAlbedo * (0.50 + 0.50 * sil);                      // 鱗のきらめきは銀の領域で強く, 背でも弱く残る
    let f = 1 + vis * (0.13 * (srand[idx] - 0.5) - 0.13 * crease[idx] + 0.05 * rim[idx]);
    // 側線: 有孔鱗の暗い孔 + 細い淡色の筋（02 §2.6。弱く）
    const lly = llY[x % W] / Math.max(hS[x], 1e-4); const dyMm = (r - lly) * hS[x] * slMm;
    const llLine = Math.exp(-0.5 * (dyMm / 0.45) ** 2) * sstep(0.27, 0.33, x / (W - 1)) * (1 - hw);
    f *= 1 + 0.22 * llLine - 0.30 * maskLL[idx];
    // 鱗ごとの虹色（青紫 <-> 黄緑にわずかに傾く）+ 大きな斑の虹色
    const ir = ((srand2[idx] - 0.5) * 0.035 + (vnoise(x / 70, j / 40, 4001) - 0.5) * 0.05) * sil;
    // 背: 暗い地に鱗縁の淡い光の粒（a01 の背の「きらめく鱗縁」）。加算の線形 albedo
    const dors = sstep(0.15, 0.7, r) * (1 - hw) * (1 - maskSpot[idx]);
    const spark = dors * scaleVisAlbedo * (0.7 * rim[idx] + 1.2 * Math.max(0, srand2[idx] - 0.68)) * 0.016;
    const o4 = idx * 4; const gi = ((r + 1) * 0.5 * (NL - 1)) | 0;
    const ag = f * G.albedoGain;
    const Tr = R[idx] * ag * (1 + ir) + spark, Tg = Gc[idx] * ag + spark * 0.98, Tb = B[idx] * ag * (1 - ir) + spark * 0.9;      // 設計色（表示の線形値）
    if (G.photoExposure) { albedo[o4] = toByte(Tr); albedo[o4 + 1] = toByte(Tg); albedo[o4 + 2] = toByte(Tb); albedo[o4 + 3] = 255; continue; }
    const ax = axil[idx]; const cA = lerp(pal.gain[gi * 2], pal.gain[0], ax), cV = lerp(pal.gain[gi * 2 + 1], pal.gain[1], ax);
    acesInverse(Tr, Tg, Tb, sceneC);
    albedo[o4] = toByte(clamp((sceneC[0] - cV) / cA, 0.0012, ALB_MAX)); albedo[o4 + 1] = toByte(clamp((sceneC[1] - cV) / cA, 0.0012, ALB_MAX)); albedo[o4 + 2] = toByte(clamp((sceneC[2] - cV) / cA, 0.0012, ALB_MAX)); albedo[o4 + 3] = 255;
    if (G.calFlat !== undefined && G.calFlat !== null) { const q = toByte(G.calFlat); albedo[o4] = q; albedo[o4 + 1] = q; albedo[o4 + 2] = q; }
  }
  timing.albedo = Date.now() - t0;

  // --- 6) 法線 -------------------------------------------------------------------------------------------------
  const hb = new Float32Array(N); // [1 2 1]/4 で縁を丸める（1px 幅の段差を避ける）
  {
    const tmpH = new Float32Array(N);
    for (let j = 0; j < H; j++) for (let x = 0; x < W; x++) { const a = hgt[j * W + Math.max(0, x - 1)], b = hgt[j * W + x], c = hgt[j * W + Math.min(W - 1, x + 1)]; tmpH[j * W + x] = 0.25 * a + 0.5 * b + 0.25 * c; }
    for (let j = 0; j < H; j++) { const jm = j === 0 ? H - 2 : j - 1, jp = j === H - 1 ? 1 : j + 1; for (let x = 0; x < W; x++) hb[j * W + x] = 0.25 * tmpH[jm * W + x] + 0.5 * tmpH[j * W + x] + 0.25 * tmpH[jp * W + x]; }
  }
  const normal = new Uint8Array(N * 4); const tanMax = Math.tan(clamp(G.scaleTiltDeg, 1, 12) * deg);
  let maxTilt = 0;
  for (let j = 0; j < H; j++) {
    const jm = j === 0 ? H - 2 : j - 1, jp = j === H - 1 ? 1 : j + 1;
    for (let x = 0; x < W; x++) {
      const idx = j * W + x; const xm1 = Math.max(0, x - 1), xp1 = Math.min(W - 1, x + 1);
      const gx = (hb[j * W + xp1] - hb[j * W + xm1]) / Math.max(Xm[j * W + xp1] - Xm[j * W + xm1], 1e-6);
      const aM = j === 0 ? Av[jm * W + x] - circ[x] : Av[jm * W + x], aP = j === H - 1 ? Av[jp * W + x] + circ[x] : Av[jp * W + x];
      let ga = (hb[jp * W + x] - hb[jm * W + x]) / Math.max(aP - aM, 1e-6);
      let gxx = gx;
      const sl = Math.hypot(gxx, ga);
      if (sl > 1e-9) { const k = Math.tanh(sl / tanMax) * tanMax / sl; gxx *= k; ga *= k; }
      let nx = -gxx, ny = ga, nz = 1; const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
      const tilt = Math.acos(nz); if (tilt > maxTilt) maxTilt = tilt;
      const o4 = idx * 4; normal[o4] = Math.round((nx * 0.5 + 0.5) * 255); normal[o4 + 1] = Math.round((ny * 0.5 + 0.5) * 255); normal[o4 + 2] = Math.round((nz * 0.5 + 0.5) * 255); normal[o4 + 3] = 255;
    }
  }
  timing.normal = Date.now() - t0;

  // --- 7) ORM -------------------------------------------------------------------------------------------------
  // R=AO（背・暗色素で小さく: 環境反射のベール(環境光 + クリアコート)を抑えて暗色を暗いまま保つ。鱗の重なりの谷でも小さく）, G=roughness, B=metalness（銀の層 × silverGain）
  const orm = new Uint8Array(N * 4); const silverGain = 0.35 + 2.0 * clamp(G.silverS, 0, 0.3);
  const sdR = seedInt(seed, 'rough');
  for (let j = 0; j < H; j++) {
    const right = j < halfRow;
    for (let x = 0; x < W; x++) {
      const idx = j * W + x; const r = rr[idx]; const hw = headW[idx]; const s = x / (W - 1);
      const li = ((r + 1) * 0.5 * (NL - 1)) | 0;
      let sil = lerp(pal.silver[li], pal.silverHead[li], hw);
      sil = lerp(sil, 0.50, opM[idx]) + 0.15 * sheenM[idx]; sil = lerp(sil, 0.85, 0.7 * axil[idx]);
      sil *= 1 + 0.40 * (srand2[idx] - 0.5) * clamp01(sil * 2);             // 鱗ごとに反射率が違う（きらめき）
      let rough = lerp(pal.rough[li], pal.roughHead[li], hw); rough = lerp(rough, 0.40 + 0.04 * opStreak[idx], opM[idx]) - 0.05 * sheenM[idx];
      const xm = Xm[idx], d = right ? Av[idx] : circ[x] - Av[idx];
      rough += G.scaleRoughVar * (rim[idx] - 0.3 * crease[idx]) + 0.06 * (srand[idx] - 0.5) * clamp01(sil * 2) + 0.025 * (vnoise(xm / 2.2, d / 2.2, sdR) - 0.5);
      // パーマーク: 地色 +0.06, 金属度 ×0.35 / 黒点: 粗さ 0.5, 金属度 0, AO 低 / 側線の窪み
      const mpm = maskPM[idx], msp = maskSpot[idx], mlw = maskLow[idx];
      rough = lerp(rough, rough + 0.06, mpm); rough = lerp(rough, 0.5, Math.max(msp, 0.5 * mlw));
      sil = sil * (1 - 0.65 * mpm) * (1 - msp) * (1 - 0.5 * mlw);
      let ao = lerp(pal.ao[li], 1, hw) * (1 - G.scaleAoDepth * crease[idx]) * (1 - 0.12 * maskLL[idx]);
      ao *= (1 - 0.15 * mpm) * (1 - 0.40 * msp) * (1 - 0.30 * mlw);
      const o4 = idx * 4;
      orm[o4] = Math.round(clamp01(ao) * 255); orm[o4 + 1] = Math.round(clamp(rough, 0.12, 0.84) * 255); orm[o4 + 2] = Math.round(clamp01(sil * silverGain) * 255); orm[o4 + 3] = 255;
    }
  }
  timing.orm = Date.now() - t0;

  // --- 8) 口内 / レポート ----------------------------------------------------------------------------------------
  const mouth = { albedo: buildMouthTexture(seed, 256, mouthOpts), orientation: mouthOpts.orientation ?? 'along-u' };
  const albedoImg = { width: W, height: H, data: albedo };
  const report = buildReport({ uvStats, seed, G, ind, pal, marksBySide, spotReport, W, H, SL, pitchMm, maxTilt, silverGain, timing, albedoImg, rr, maskPM, maskSpot, Av, circ, mmU, llY, hS, P, eyeMm });
  return { albedo: albedoImg, normal: { width: W, height: H, data: normal }, orm: { width: W, height: H, data: orm }, mouth, report };
}

function bandStat(albedoImg, rr, maskPM, maskSpot, W, H, rLo, rHi, sLo, sHi) {
  let n = 0, sr = 0, sg = 0, sb = 0; const d = albedoImg.data;
  for (let j = 0; j < Math.floor((H - 1) / 2); j++) for (let x = Math.floor(sLo * (W - 1)); x <= Math.floor(sHi * (W - 1)); x++) {
    const idx = j * W + x; const r = rr[idx]; if (r < rLo || r > rHi || maskPM[idx] > 0.05 || maskSpot[idx] > 0.05) continue;
    sr += SRGB_DEC[d[idx * 4]]; sg += SRGB_DEC[d[idx * 4 + 1]]; sb += SRGB_DEC[d[idx * 4 + 2]]; n++;
  }
  if (!n) return null; const lab = linToLab(sr / n, sg / n, sb / n);
  return { lab: [+lab.L.toFixed(1), +lab.a.toFixed(1), +lab.b.toFixed(1)], srgb: [toByte(sr / n), toByte(sg / n), toByte(sb / n)], n };
}

function buildReport({ uvStats, seed, G, ind, pal, marksBySide, spotReport, W, H, SL, pitchMm, maxTilt, silverGain, timing, albedoImg, rr, maskPM, maskSpot, eyeMm }) {
  const fmtMark = (m, i) => ({ index: i, s: +m.s.toFixed(4), y_center_sl: +m.yc.toFixed(4), h_sl: +m.h.toFixed(4), w_sl: +m.w.toFixed(4), tilt_deg: +m.tilt.toFixed(1), opacity: +m.op.toFixed(3),
    lab: m.lab.map((v) => +v.toFixed(1)), srgb: labToSrgb8(...m.lab), events: m.events.slice(), split: !!m.cut });
  const c = (lab) => ({ lab: lab.map((v) => +v.toFixed(1)), srgb: labToSrgb8(...lab) });
  const at = (r) => pal.labBody(r);
  return {
    module: 'textures.mjs', seed, width: W, height: H,
    genome: Object.fromEntries(Object.entries(G).filter(([k]) => !['Av', 'circ', 'mmU', 'W', 'H', 'slM'].includes(k))),
    uv: { stats: uvStats, u: 's (0 = snout, 1 = caudal base)', v: 'alpha/2pi (0 = dorsal midline, 0.25 = right flank, 0.5 = ventral, 0.75 = left flank)', imageOrigin: 'top-left', x: 'u*(W-1)', y: 'v*(H-1)', normalGreen: 'image-up (glTF)', ormMetalnessBakedWithSilverGain: true },
    scale: { pitch_mm: +pitchMm.toFixed(3), pitch_pct_sl: G.scalePitchPctSl, pitch_px_u: +(pitchMm / (SL * 1000 / (W - 1))).toFixed(2), row_spacing_mm: +(pitchMm / 2).toFixed(3), max_normal_tilt_deg: +(maxTilt / deg).toFixed(2), tilt_param_deg: G.scaleTiltDeg, amplitude_mm_at_sl: +(0.1 * SL * 1000 / 300).toFixed(3) },
    parrMarks: { countRight: marksBySide.right.length, countLeft: marksBySide.left.length, lrDelta: marksBySide.left.length - marksBySide.right.length,
      sFirst: +ind.sFirst.toFixed(3), sLast: +ind.sLast.toFixed(3), frontFaint: ind.frontFaint, fadeFactor: +ind.fade.toFixed(3), flCm: +ind.flCm.toFixed(1),
      deltaLab: [+ind.dL.toFixed(1), +ind.dA.toFixed(1), +ind.dB.toFixed(1)], events: ind.events.slice(),
      right: marksBySide.right.map(fmtMark), left: marksBySide.left.map(fmtMark) },
    spots: { dorsalRight: spotReport.dorsal.right, dorsalLeft: spotReport.dorsal.left, belowRight: spotReport.below.right, belowLeft: spotReport.below.left,
      belowBlackRight: spotReport.below.right_black, belowBlackLeft: spotReport.below.left_black, belowSmallBlackRight: spotReport.below.right_smallBlack, belowSmallBlackLeft: spotReport.below.left_smallBlack, headRight: spotReport.head.right, headLeft: spotReport.head.left,
      orange: spotReport.orange, eyeOuterDiameterMm: +eyeMm.toFixed(2) },
    colors: {
      dorsalRidge: c(at(1.0)), dorsal: c(at(0.82)), flankUpper: c(at(0.15)), flankLower: c(at(-0.40)), belly: c(at(-0.85)),
      blackSpot: c(pal.markBlack), belowSpot: c(pal.spotBelow), belowSpotBlack: c(pal.spotBelowBlack), pink: c(pal.pink), opercle: c(pal.opercle), jaw: c(pal.jaw), orange: c(pal.orange),
      hueOffsetDeg: pal.hue, silverGain: +silverGain.toFixed(3),
    },
    measured: {
      dorsal_r0p85: bandStat(albedoImg, rr, maskPM, maskSpot, W, H, 0.78, 0.95, 0.4, 0.8),
      flankUpper_r0p3: bandStat(albedoImg, rr, maskPM, maskSpot, W, H, 0.1, 0.4, 0.4, 0.8),
      flankLower_r_m0p35: bandStat(albedoImg, rr, maskPM, maskSpot, W, H, -0.5, -0.25, 0.4, 0.8),
      belly_r_m0p9: bandStat(albedoImg, rr, maskPM, maskSpot, W, H, -0.97, -0.8, 0.4, 0.8),
    },
    timing_ms: timing,
  };
}

// ───────────────────────────── 側面直交プレビュー（CPU）─────────────────────────────
// side 'right': 右体側(+Z)を +Z 側から見る（頭は画像の右）。'left': 左体側を -Z 側から見る（頭は画像の左, 参照写真と同じ向き）。
// 体の外形は surface、色・法線・ORM はテクスチャから。簡易ライティング（shading:'lit'）か、素の albedo（'albedo'）。
export function renderLateralPreview({ surface, textures, side = 'right', pxPerMeter = 8000, shading = 'lit', background = [0.78, 0.82, 0.85], margin = 0.008, ss = 2, eyes = true } = {}) {
  const SL = surface.SL, cap = surface.cap; const ppm = pxPerMeter;
  let yMin = 1e9, yMax = -1e9;
  for (let i = 0; i <= 200; i++) { const s = i / 200; yMax = Math.max(yMax, surface.point(s, 0)[1]); yMin = Math.min(yMin, surface.point(s, Math.PI)[1]); }
  const xMax = surface.sToX(-cap) + margin, xMin = surface.sToX(1) - margin;
  const Wp = Math.ceil((xMax - xMin) * ppm), Hp = Math.ceil((yMax - yMin + 2 * margin) * ppm);
  const out = new Uint8Array(Wp * Hp * 4);
  const A = textures.albedo, Nm = textures.normal, O = textures.orm;
  const sgn = side === 'right' ? 1 : -1;
  const samp = (img, u, v, o) => { // 双線形, u クランプ, v ラップ
    const fx = clamp(u, 0, 1) * (img.width - 1); let fy = (((v % 1) + 1) % 1) * (img.height - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy); const x1 = Math.min(x0 + 1, img.width - 1), y1 = Math.min(y0 + 1, img.height - 1); const tx = fx - x0, ty = fy - y0; const d = img.data, w = img.width;
    for (let c = 0; c < 3; c++) {
      const a = d[(y0 * w + x0) * 4 + c], b = d[(y0 * w + x1) * 4 + c], cc = d[(y1 * w + x0) * 4 + c], dd = d[(y1 * w + x1) * 4 + c];
      o[c] = ((a + (b - a) * tx) + ((cc + (dd - cc) * tx) - (a + (b - a) * tx)) * ty) / 255;
    }
  };
  const lightDir = (() => { const v = [0.25, 0.80, 0.55 * sgn]; const l = Math.hypot(...v); return v.map((q) => q / l); })();
  const V = [0, 0, sgn];
  const env = (dx, dy, dz, rough) => { // 簡易スタジオ環境: 上が明るい空, 下が暗い川底, 光源方向に面光源
    const up = dy * 0.5 + 0.5; let r = lerp(0.30, 0.62, Math.pow(up, 1.1)), g = lerp(0.30, 0.68, Math.pow(up, 1.1)), b = lerp(0.27, 0.78, Math.pow(up, 1.1));
    const k = Math.max(0, dx * lightDir[0] + dy * lightDir[1] + dz * lightDir[2]); const lobe = Math.pow(k, lerp(60, 4, rough)) * lerp(2.5, 0.5, rough);
    r += lobe; g += lobe; b += lobe * 0.95; const avg = 0.33; const m = rough * rough * 0.6; return [lerp(r, avg, m), lerp(g, avg, m), lerp(b, avg * 1.05, m)];
  };
  const c3 = [0, 0, 0], n3 = [0, 0, 0], o3 = [0, 0, 0];
  // 目（プレビュー専用の平面近似: 暗い眼窩縁・金の細い虹彩環・黒い瞳孔・ハイライト）。本物の眼球は eyes.mjs。
  const eyeP = (surface.params ?? {}).eye ?? {}; const eyeS = eyeP.center_s?.v ?? 0.095, eyeR = 0.5 * (eyeP.outer_d_over_sl?.v ?? 0.056) * SL;
  const eyeSec = surface.section(eyeS); const eyeX = surface.sToX(eyeS), eyeY = (eyeSec.c + eyeSec.h * (1 - 2 * (eyeP.center_height_frac_from_top?.v ?? 0.33))) * SL;
  const eyeAA = 1.2 / ppm / eyeR;
  const eyeLin = (X, Y, base, albedoMode) => {
    if (!eyes) return base;
    const dx = X - eyeX, dy = Y - eyeY; const rho = Math.hypot(dx, dy) / eyeR; if (rho > 1.0 + eyeAA) return base;
    const ring = [0.035, 0.03, 0.025]; const gold = [0.52, 0.34, 0.07]; const pup = [0.004, 0.004, 0.005];
    let col = ring.slice();
    const mix = (c, t) => { col = [lerp(col[0], c[0], t), lerp(col[1], c[1], t), lerp(col[2], c[2], t)]; };
    mix(gold, 1 - sstep(0.64 - eyeAA, 0.64 + eyeAA, rho) );
    mix(pup, 1 - sstep(0.5 - eyeAA, 0.5 + eyeAA, rho));
    const hl = Math.hypot(dx / eyeR + 0.22, dy / eyeR - 0.26); mix([1, 1, 1], 0.9 * (1 - sstep(0.08, 0.13, hl)));
    const a = 1 - sstep(1.0 - eyeAA, 1.0 + eyeAA, rho);
    const out = [lerp(base[0], col[0], a), lerp(base[1], col[1], a), lerp(base[2], col[2], a)];
    return out;
  };
  const shadeAt = (X, Y) => {
    const s = surface.xToS(X); if (s > 1 || s < -cap) return null;
    const sec = surface.section(Math.max(s, 0)); let scale = 1; if (s < 0) { const t = Math.min(-s / cap, 1); scale = Math.sqrt(Math.max(1 - t * t, 0)); if (scale < 1e-4) return null; }
    const cSL = sec.c * SL; const rel = (Y - cSL) / (sec.h * SL * scale); if (Math.abs(rel) > 1) return null;
    const a0 = surface.alphaAtHeight(Math.max(s, 0), cSL + (Y - cSL) / scale);
    const alpha = side === 'right' ? a0 : TAU - a0;
    const u = clamp(s, 0, 1), v = alpha / TAU;
    samp(A, u, v, c3);
    if (shading === 'albedo') {
      const lin = eyeLin(X, Y, [SRGB_DEC[Math.round(c3[0] * 255)], SRGB_DEC[Math.round(c3[1] * 255)], SRGB_DEC[Math.round(c3[2] * 255)]]);
      return [encSrgb(lin[0]), encSrgb(lin[1]), encSrgb(lin[2]), true];
    }
    const al = [SRGB_DEC[Math.round(c3[0] * 255)], SRGB_DEC[Math.round(c3[1] * 255)], SRGB_DEC[Math.round(c3[2] * 255)]];
    samp(O, u, v, o3); const ao = o3[0], rough = o3[1], metal = o3[2];
    // 幾何法線 + 法線マップ
    const N = surface.normal(s, alpha); const ds = 2e-4, da = 2e-3;
    const pU1 = surface.point(Math.max(s, 0) + ds, alpha), pU0 = surface.point(Math.max(s, 0) - ds * (s > ds ? 1 : 0), alpha);
    const pV1 = surface.point(Math.max(s, 0), alpha + da), pV0 = surface.point(Math.max(s, 0), alpha - da);
    let T = [pU1[0] - pU0[0], pU1[1] - pU0[1], pU1[2] - pU0[2]]; let Bv = [pV1[0] - pV0[0], pV1[1] - pV0[1], pV1[2] - pV0[2]];
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const nrm = (p) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
    T = nrm(T); const tn = dot(T, N); T = nrm([T[0] - N[0] * tn, T[1] - N[1] * tn, T[2] - N[2] * tn]);
    Bv = nrm(Bv); const bn = dot(Bv, N); Bv = nrm([Bv[0] - N[0] * bn, Bv[1] - N[1] * bn, Bv[2] - N[2] * bn]);
    if (s >= 0) {
      samp(Nm, u, v, n3); const mx = n3[0] * 2 - 1, my = n3[1] * 2 - 1, mz = n3[2] * 2 - 1;     // G = 画像の上 = -B(v 増加方向)
      N[0] = T[0] * mx - Bv[0] * my + N[0] * mz; N[1] = T[1] * mx - Bv[1] * my + N[1] * mz; N[2] = T[2] * mx - Bv[2] * my + N[2] * mz;
      const l = Math.hypot(N[0], N[1], N[2]); N[0] /= l; N[1] /= l; N[2] /= l;
    }
    const nl = Math.max(0, dot(N, lightDir)); const nv = Math.max(0.0, dot(N, V));
    const hemi = 0.30 + 0.25 * (N[1] * 0.5 + 0.5);
    const Rv = [2 * nv * N[0] - V[0], 2 * nv * N[1] - V[1], 2 * nv * N[2] - V[2]];
    const e = env(Rv[0], Rv[1], Rv[2], rough);
    const fr = Math.pow(1 - nv, 5) * (1 - rough * 0.8);
    const col = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const F0 = lerp(0.04, al[c], metal); const F = F0 + (1 - F0) * fr;
      const diff = al[c] * (1 - metal) * (hemi + 0.85 * nl) * ao;
      col[c] = diff + F * e[c] * (0.55 + 0.45 * ao);
    }
    const ce = eyeLin(X, Y, col); return [ce[0], ce[1], ce[2], false];
  };
  const bg = background.map((v) => v);
  for (let j = 0; j < Hp; j++) for (let i = 0; i < Wp; i++) {
    let r = 0, g = 0, b = 0, cov = 0, direct = false;
    for (let sj = 0; sj < ss; sj++) for (let si = 0; si < ss; si++) {
      const px = i + (si + 0.5) / ss, py = j + (sj + 0.5) / ss;
      const X = side === 'right' ? xMin + px / ppm : xMax - px / ppm, Y = yMax + margin - py / ppm;
      const c = shadeAt(X, Y);
      if (c) { cov++; direct = c[3]; if (c[3]) { r += SRGB_DEC[Math.round(clamp01(c[0]) * 255)]; g += SRGB_DEC[Math.round(clamp01(c[1]) * 255)]; b += SRGB_DEC[Math.round(clamp01(c[2]) * 255)]; } else { r += c[0]; g += c[1]; b += c[2]; } }
    }
    const nS = ss * ss; const o4 = (j * Wp + i) * 4; const bgL = bg.map((v) => decSrgb(v));
    const fr = cov / nS;
    const rr_ = (cov ? r / nS : 0) + (1 - fr) * bgL[0], gg_ = (cov ? g / nS : 0) + (1 - fr) * bgL[1], bb_ = (cov ? b / nS : 0) + (1 - fr) * bgL[2];
    out[o4] = toByte(shading === 'albedo' ? rr_ : tonemap(rr_)); out[o4 + 1] = toByte(shading === 'albedo' ? gg_ : tonemap(gg_)); out[o4 + 2] = toByte(shading === 'albedo' ? bb_ : tonemap(bb_)); out[o4 + 3] = 255;
  }
  return { width: Wp, height: Hp, data: out };
}
const tonemap = (v) => { v = Math.max(0, v); return v / (1 + 0.12 * v) * 1.04; };
