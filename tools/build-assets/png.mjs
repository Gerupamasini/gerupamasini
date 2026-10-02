// Tiny PNG helpers (pngjs). Images are {width, height, data: Uint8Array|Uint8ClampedArray RGBA}.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

export function writePng(file, img) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}
export function readPng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}
export function newImage(width, height, fill = [0, 0, 0, 255]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[i * 4] = fill[0]; data[i * 4 + 1] = fill[1]; data[i * 4 + 2] = fill[2]; data[i * 4 + 3] = fill[3]; }
  return { width, height, data };
}
