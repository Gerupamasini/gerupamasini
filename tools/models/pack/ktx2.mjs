// KTX2 (Basis Universal UASTC) encoding of a model's images, and the decode used to check what came out.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const require = createRequire(import.meta.url);

/** Decodes a PNG or JPEG into 8-bit RGBA. */
export function decodeImage(buf) {
  if (buf[0] === 0x89) {
    const p = PNG.sync.read(Buffer.from(buf));
    return { data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length), width: p.width, height: p.height };
  }
  const r = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  return { data: r.data, width: r.width, height: r.height };
}

let encoder = null;
async function loadEncoder() {
  // the encoder's WASM prints its progress through console.log: kept quiet (the packer reports for itself)
  const log = console.log;
  console.log = () => {};
  try {
    encoder ??= (await import('ktx2-encoder')).encodeToKTX2;
  } finally {
    console.log = log;
  }
  return encoder;
}

/**
 * Encodes one image. `role` is 'normal' (tangent-space normal map), 'color' (sRGB colour) or 'data' (linear values:
 * roughness, occlusion, masks, pigment fields).
 */
export async function encodeKTX2(src, role) {
  const encode = await loadEncoder();
  const linear = role !== 'color';
  const log = console.log;
  console.log = () => {};
  try {
    return await encode(new Uint8Array(src), {
      isUASTC: true,
      uastcLDRQualityLevel: 1,
      needSupercompression: true,
      generateMipmap: true,
      isNormalMap: role === 'normal',
      isPerceptual: !linear,
      isSetKTX2SRGBTransferFunc: !linear,
      enableDebug: false,
      imageDecoder: async (b) => decodeImage(b),
    });
  } finally {
    console.log = log;
  }
}

let transcoder = null;
/** The transcoder the game itself uses (three's copy of basis_transcoder), run in Node. */
async function loadTranscoder() {
  if (transcoder) return transcoder;
  const dir = path.dirname(require.resolve('three/examples/jsm/libs/basis/basis_transcoder.js'));
  const js = fs.readFileSync(path.join(dir, 'basis_transcoder.js'), 'utf8');
  // (an Emscripten script that defines BASIS; three's package is ESM, so it is evaluated rather than required)
  const BASIS = new Function('require', '__filename', '__dirname', `${js}\n;return BASIS;`)(require, path.join(dir, 'basis_transcoder.js'), dir);
  transcoder = await BASIS({ wasmBinary: fs.readFileSync(path.join(dir, 'basis_transcoder.wasm')) });
  transcoder.initializeBasis();
  return transcoder;
}

/** Decodes the top mip of a KTX2 file to RGBA, with its size and number of mip levels. */
export async function decodeKTX2(buf) {
  const basis = await loadTranscoder();
  const k = new basis.KTX2File(new Uint8Array(buf));
  try {
    if (!k.isValid()) throw new Error('invalid KTX2');
    if (!k.startTranscoding()) throw new Error('KTX2: cannot start transcoding');
    const RGBA32 = 13;
    const out = new Uint8Array(k.getImageTranscodedSizeInBytes(0, 0, 0, RGBA32));
    if (!k.transcodeImage(out, 0, 0, 0, RGBA32, 0, -1, -1)) throw new Error('KTX2: transcode failed');
    return { data: out, width: k.getWidth(), height: k.getHeight(), levels: k.getLevels(), hasAlpha: !!k.getHasAlpha() };
  } finally {
    k.close();
    k.delete();
  }
}

/** PSNR (dB) of `b` against `a` over the given channels of two RGBA rasters of one size (99 when identical). */
export function psnr(a, b, channels) {
  let se = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (const c of channels) {
      const d = a[i + c] - b[i + c];
      se += d * d;
      n++;
    }
  }
  return se === 0 ? 99 : 10 * Math.log10((255 * 255 * n) / se);
}
