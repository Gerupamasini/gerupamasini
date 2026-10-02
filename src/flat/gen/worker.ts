/// <reference lib="webworker" />
/**
 * Generator worker: builds the flat once, then answers tide requests with the water state.
 * Messages in:  { type: 'generate', seed, tide } | { type: 'tide', tide, id }
 * Messages out: { type: 'progress', label, f } | { type: 'flat', data, water, ms } | { type: 'water', water, id, ms }
 */
import { generateFlat, type FlatData } from './generate';
import { computeWater, type WaterState } from './water';
import { bakeNormals } from './normals';

let flat: FlatData | null = null;

function waterTransfer(w: WaterState): Transferable[] {
  return [w.fine.levels.buffer, w.fine.info.buffer, w.far.levels.buffer, w.far.info.buffer];
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type: string; seed?: number; tide?: number; id?: number };
  if (msg.type === 'generate') {
    const t0 = performance.now();
    flat = generateFlat(msg.seed ?? 1, (label, f) => (self as unknown as Worker).postMessage({ type: 'progress', label, f }));
    const normals = { fine: bakeNormals(flat.fine.height, flat.fine.n, flat.fine.cell), far: bakeNormals(flat.far.height, flat.far.n, flat.far.cell) };
    const water = computeWater(flat, msg.tide ?? -0.4);
    const ms = performance.now() - t0;
    // the heights stay here too (tide requests need them): send copies of what the renderer keeps
    const out = {
      ...flat,
      fine: { ...flat.fine, height: flat.fine.height.slice(), mat: flat.fine.mat.slice(), rip: flat.fine.rip.slice(), flow: flat.fine.flow.slice(), creek: new Float32Array(0) },
      far: { ...flat.far, height: flat.far.height.slice(), mat: flat.far.mat.slice() },
    };
    (self as unknown as Worker).postMessage({ type: 'flat', data: out, normals, water, ms }, [
      out.fine.height.buffer, out.fine.mat.buffer, out.fine.rip.buffer, out.fine.flow.buffer, out.far.height.buffer, out.far.mat.buffer,
      normals.fine.buffer, normals.far.buffer, ...waterTransfer(water),
    ]);
  } else if (msg.type === 'tide' && flat) {
    const t0 = performance.now();
    const water = computeWater(flat, msg.tide ?? -0.4);
    (self as unknown as Worker).postMessage({ type: 'water', water, id: msg.id, ms: performance.now() - t0 }, waterTransfer(water));
  }
};
