/// <reference lib="webworker" />
// The surf zone's level bakes off the main thread (SurfZone): the frame comes once, then one level per request.
import { bakeLevel, type BakeFrame } from './surfZoneBake';

let frame: BakeFrame | null = null;
self.onmessage = (e: MessageEvent<{ type: 'frame'; frame: BakeFrame } | { type: 'bake'; id: number; level: number; period: number }>) => {
  const m = e.data;
  if (m.type === 'frame') { frame = m.frame; return; }
  if (!frame) return;
  const r = bakeLevel(frame, m.level, m.period);
  (self as unknown as Worker).postMessage({ id: m.id, ...r }, [r.t.buffer, r.sh.buffer, r.imp.buffer]);
};
