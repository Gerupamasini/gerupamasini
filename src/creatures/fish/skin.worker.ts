/**
 * Paints the coastal fishes' skins off the main thread (paint.ts): a species' procedural skin, and its specimen's
 * photographs over the near tiers when it has them. Asked by skin.ts with a SkinRequest, answers a SkinPaint.
 */
import { paintSkins, type Pixels, type SkinRequest } from './paint';
import { FISH_SPECS } from './species';

async function pixels(url: string): Promise<Pixels> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`魚の写真を読み込めません: ${url}`);
  const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return g.getImageData(0, 0, c.width, c.height);
}

self.onmessage = async (e: MessageEvent<SkinRequest>) => {
  const { id, urls } = e.data;
  const spec = Object.values(FISH_SPECS).find((s) => s.id === id);
  if (!spec) return;
  let photos = null;
  if (urls) {
    try {
      const [body, fins, eye] = await Promise.all([pixels(urls[0]), pixels(urls[1]), urls[2] ? pixels(urls[2]) : Promise.resolve(null)]);
      photos = { body, fins, eye };
    } catch (err) { console.warn(err); }
  }
  const p = paintSkins(spec, photos);
  const transfer = [p.albedo.buffer, p.surface.buffer, p.fins.buffer, p.eye.buffer, ...(p.far ? [p.far.albedo.buffer, p.far.surface.buffer, p.far.fins.buffer] : [])];
  (self as unknown as Worker).postMessage({ id, ...p }, transfer as ArrayBuffer[]);
};
