#!/usr/bin/env node
// The トビハゼ's clips for the 図鑑's preview and the photo studio (ModelPreview plays species.model.clips.idle, and an
// encyclopedia behaviour's `clip`): glTF animations baked into a built GLB by sampling the game's own pose module
// (src/creatures/species/tobihaze/pose.js) on that GLB's own extras, so the clips and the game always agree (as the
// gobies' Idle/Swim/Yawn are sampled from theirs: tools/lib/gobyBuild.mjs). A post-process on a built tier:
//   node tools/models/tobihaze/clips.mjs <in.glb> <out.glb> [--fps 30] [--clips Idle,Crawl,Swim,Display]
// Each clip is a loop of synthetic frames (the behaviour's TobiFrame fields pose.js reads), posed and written as the
// joints' rotation and translation channels (absolute: the node's rest translation + the pose's), the Eye nodes'
// rotations and every mesh's blend-shape weights; a channel that does not change through the clip is written as two
// keys. The clips (behaviour.md §3):
//   Idle     propped on the planted pectorals (the welded prop, its raise breathing 14–16°), the buccal pump every 2 s,
//            a blink (560 ms, the eye dropped by 35 % of it), the two eyes' independent saccades — 6 s
//   Crawl    two crutching cycles (0.5 s each: the stance's vault on the welded tips, the recovery on the cup), on a
//            treadmill: the root drawn back a stride a cycle so the loop stays in place — 1 s
//   Swim     two tail beats of the carangiform wave, the caudal spread, the paddles sculling — 1 s
//   Display  the first dorsal raised, then the second and the anal fin, the cheeks inflated, the front raised to 22°,
//            and back — 4 s
// The previews floor the bind pose's bounds (ModelPreview), so every clip lifts J_root by the bind's lowest point less
// its pose's ground: the fish stands on the preview's floor. Ships with the hero and lod1 (the 図鑑 shows those; lod2's
// download budget has no room and nothing previews it).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB, writeGLB } from '../../lib/glb.mjs';
import { poseRig, poseInto, createPose, GAPE_HALF } from '../../../src/creatures/species/tobihaze/pose.js';

void GAPE_HALF;
const TAU = Math.PI * 2;
const smooth = (u) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };

/**
 * The blink's eye drop over its 560 ms (Aiello et al. 2023: fully down at 35 % of it, the up-stroke slower), 0..1 at
 * time `t` (s) since it began.
 */
export function blinkAt(t, dur = 0.56, close = 0.35) {
  if (t < 0 || t > dur) return 0;
  const u = t / dur;
  return u < close ? smooth(u / close) : 1 - smooth((u - close) / (1 - close));
}

/** Piecewise gaze targets (deg) held, each eased in over `ease` s; the schedule wraps at `period` (loops). */
function saccades(schedule, period, ease = 0.05) {
  return (t) => {
    const tt = ((t % period) + period) % period;
    let i = schedule.length - 1;
    for (let k = 0; k < schedule.length; k++) if (schedule[k].at <= tt) i = k;
    const cur = schedule[i], prev = schedule[(i - 1 + schedule.length) % schedule.length], u = smooth((tt - cur.at) / ease);
    return { yaw: prev.yaw + (cur.yaw - prev.yaw) * u, pitch: prev.pitch + (cur.pitch - prev.pitch) * u };
  };
}

/** The clips: name → { duration (s), frame(t) → a TobiFrame's pose fields, ground: the pose whose ground the floor takes } */
export function clipDefinitions(rig) {
  const hl = rig.hl, alert = 0.03 * hl, rest = { yaw: 16.7, pitch: 2.8 };
  const gazeL = saccades([{ at: 0, ...rest }, { at: 0.9, yaw: 34, pitch: 8 }, { at: 2.3, yaw: 6, pitch: -4 }, { at: 3.6, yaw: 48, pitch: 12 }, { at: 5.1, yaw: 22, pitch: 4 }], 6);
  const gazeR = saccades([{ at: 0, ...rest }, { at: 1.4, yaw: 28, pitch: 2 }, { at: 2.9, yaw: 52, pitch: 10 }, { at: 4.2, yaw: 12, pitch: 6 }, { at: 5.5, yaw: 20, pitch: 0 }], 6);
  const pulse = (t, every, len) => { const u = (t % every) / len; return u < 1 ? Math.sin(Math.PI * u) : 0; };
  return {
    Idle: {
      duration: 6, ground: 'land',
      frame: (t) => {
        const b = blinkAt(t - 2.1);
        return {
          pose: 'prop', prop: { raise: 15 + Math.sin((TAU * t) / 6) },
          eyes: { L: { ...gazeL(t), lift: alert }, R: { ...gazeR(t), lift: alert }, blink: { L: b, R: b } },
          head: { gulp: pulse(t + 0.5, 2, 0.4), inflate: 0.2, gape: 0, vent: 0 },
          fins: { d1: 0.1, median: 0.3, caudal: 0 },
        };
      },
    },
    Crawl: {
      duration: 1, ground: 'land', treadmill: true,
      frame: (t) => ({
        pose: 'crawl', crawl: { phase: (t / 0.5) % 1, turn: 0 },
        eyes: { L: { ...rest, lift: alert }, R: { ...rest, lift: alert }, blink: { L: 0, R: 0 } },
        head: { gulp: 0, inflate: 0.2 }, fins: { d1: 0.15, median: 0.3, caudal: 0 },
      }),
      // (the cycle's J_root carries the body a stride forward: drawn back at a stride a cycle, the loop stays put)
      strideAt: (t) => t / 0.5,
    },
    Swim: {
      duration: 1, ground: 'swim', lift: 0.002,
      frame: (t) => ({
        pose: 'swim', swim: { phase: 2 * t, amp: 1, speed: 2, turn: 0 },
        eyes: { L: { yaw: 10, pitch: 0, lift: 0 }, R: { yaw: 10, pitch: 0, lift: 0 }, blink: { L: 0, R: 0 } },
        head: { vent: 0.5 - 0.5 * Math.cos(TAU * 2 * t) }, fins: { d1: 0, median: 0.5, caudal: 1 },
      }),
    },
    Display: {
      duration: 4, ground: 'land',
      frame: (t) => {
        // up over 1.2 s (the first dorsal leading), held, down over the last second
        const up = smooth(t / 1.2) * (1 - smooth((t - 3) / 1));
        const d1 = smooth(t / 0.6) * (1 - smooth((t - 3.2) / 0.8));
        return {
          pose: 'prop', prop: { raise: 15 + 7 * up },
          eyes: { L: { yaw: 8, pitch: 6, lift: alert }, R: { yaw: 8, pitch: 6, lift: alert }, blink: { L: 0, R: 0 } },
          head: { inflate: 0.2 + 0.8 * smooth((t - 0.4) / 1.0) * (1 - smooth((t - 2.9) / 1)), gulp: 0 },
          fins: { d1: 0.1 + 0.9 * d1, median: 0.3 + 0.7 * up, caudal: 0 },
        };
      },
    },
  };
}

/** The bind pose's lowest point (m, y): the skinned meshes' positions (at the scene root) and the eyes (on their joints). */
function bindMinY(json) {
  const parent = new Map();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const worldY = (i) => { let y = 0; for (let k = i; k !== undefined; k = parent.get(k)) y += json.nodes[k].translation?.[1] ?? 0; return y; };
  let lo = Infinity;
  json.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    const off = n.skin === undefined ? worldY(i) : 0;
    for (const p of json.meshes[n.mesh].primitives) { const a = json.accessors[p.attributes.POSITION]; if (a?.min) lo = Math.min(lo, a.min[1] + off); }
  });
  return lo;
}

/**
 * Bake the clips into a GLB's JSON and binary chunk: returns { json, bin, report }.
 * @param {object} json   @param {Buffer} bin   @param {{ fps?: number, clips?: string[] }} o
 */
export function bakeClips(json, bin, o = {}) {
  const fps = o.fps ?? 30;
  const root = json.nodes[json.scenes[json.scene ?? 0].nodes[0]];
  const rig = poseRig(root.extras);
  const defs = clipDefinitions(rig), want = o.clips ?? Object.keys(defs);
  const nodeOf = Object.fromEntries(json.nodes.map((n, i) => [n.name, i]));
  const floor = bindMinY(json);
  const parts = [bin], pad4 = () => { const len = parts.reduce((a, b) => a + b.length, 0); if (len % 4) parts.push(Buffer.alloc(4 - (len % 4))); };
  json.animations ??= [];
  const accessor = (arr, type, minMax = false) => {
    pad4();
    const offset = parts.reduce((a, b) => a + b.length, 0), buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    parts.push(buf);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length });
    const nc = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type], acc = { bufferView: json.bufferViews.length - 1, componentType: 5126, count: arr.length / nc, type };
    if (minMax) { acc.min = [arr[0]]; acc.max = [arr[arr.length - 1]]; }
    json.accessors.push(acc);
    return json.accessors.length - 1;
  };
  // the meshes' blend shapes in their own order (extras targetNames), by node
  const morphNodes = json.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.mesh !== undefined && json.meshes[n.mesh].extras?.targetNames?.length)
    .map(({ n, i }) => ({ node: i, names: json.meshes[n.mesh].extras.targetNames, k: json.meshes[n.mesh].extras.targetNames.map((t) => rig.targetIndex[t]) }));
  const report = [];
  for (const name of want) {
    const D = defs[name];
    if (!D) throw new Error(`clips: no clip '${name}'`);
    const n = Math.round(D.duration * fps) + 1, times = Float32Array.from({ length: n }, (_, f) => (f / (n - 1)) * D.duration);
    const out = createPose(rig), nj = rig.joints.length;
    const Q = new Float32Array(n * nj * 4), T = new Float32Array(n * nj * 3), E = new Float32Array(n * 8), Wt = new Float32Array(n * rig.targets.length);
    const g = rig.groundM[D.ground] ?? rig.groundM.land ?? 0, lift = floor - g + (D.lift ?? 0);
    for (let f = 0; f < n; f++) {
      const t = times[f], fr = D.frame(t);
      poseInto(rig, fr, out);
      Q.set(out.q, f * nj * 4); T.set(out.t, f * nj * 3); E.set(out.eye, f * 8); Wt.set(out.w, f * rig.targets.length);
      // (J_root: on the preview's floor; on the treadmill the stride drawn back)
      const r = rig.index.J_root;
      T[(f * nj + r) * 3 + 1] += lift;
      if (D.treadmill) T[(f * nj + r) * 3 + 2] -= ((rig.crawl?.strideMM ?? 15) / 1000) * D.strideAt(t);
    }
    const ends = Float32Array.from([0, D.duration]);
    let tIn = -1, eIn = -1;
    const input = (constant) => (constant ? (eIn >= 0 ? eIn : (eIn = accessor(ends, 'SCALAR', true))) : (tIn >= 0 ? tIn : (tIn = accessor(times, 'SCALAR', true))));
    const samplers = [], channels = [];
    const add = (node, pathName, values, width) => {
      // (a channel that does not change through the clip: two keys)
      let constant = true;
      for (let f = 1; f < n && constant; f++) for (let c = 0; c < width; c++) if (Math.abs(values[f * width + c] - values[c]) > 1e-7) { constant = false; break; }
      const v = constant ? Float32Array.from([...values.subarray(0, width), ...values.subarray(0, width)]) : values;
      samplers.push({ input: input(constant), output: accessor(v, pathName === 'weights' ? 'SCALAR' : width === 4 ? 'VEC4' : 'VEC3'), interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node, path: pathName } });
    };
    for (const j of rig.joints) {
      const node = nodeOf[j.name];
      if (node === undefined) continue;
      const rot = new Float32Array(n * 4), tr = new Float32Array(n * 3), rest = json.nodes[node].translation ?? [0, 0, 0];
      let turns = false, moves = false;
      for (let f = 0; f < n; f++) {
        for (let c = 0; c < 4; c++) rot[f * 4 + c] = Q[(f * nj + j.i) * 4 + c];
        for (let c = 0; c < 3; c++) { const d = T[(f * nj + j.i) * 3 + c]; tr[f * 3 + c] = rest[c] + d; if (Math.abs(d) > 1e-9) moves = true; }
        if (Math.abs(rot[f * 4 + 3]) < 1 - 1e-9) turns = true;
      }
      if (turns) add(node, 'rotation', rot, 4);
      if (moves) add(node, 'translation', tr, 3);
    }
    for (const [s, nm] of ['Eye_L', 'Eye_R'].entries()) {
      const node = nodeOf[nm];
      if (node === undefined || !rig.hasEyes) continue;
      const rot = new Float32Array(n * 4);
      for (let f = 0; f < n; f++) for (let c = 0; c < 4; c++) rot[f * 4 + c] = E[f * 8 + s * 4 + c];
      add(node, 'rotation', rot, 4);
    }
    for (const m of morphNodes) {
      const w = new Float32Array(n * m.names.length);
      for (let f = 0; f < n; f++) m.k.forEach((k, c) => { w[f * m.names.length + c] = k === undefined ? 0 : Wt[f * rig.targets.length + k]; });
      add(m.node, 'weights', w, m.names.length);
    }
    json.animations = json.animations.filter((a) => a.name !== name);
    json.animations.push({ name, samplers, channels });
    report.push({ name, duration: D.duration, frames: n, channels: channels.length });
  }
  pad4();
  return { json, bin: Buffer.concat(parts), report };
}

// ------------------------------------------------------------------------------------------------ the command line

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const [inFile, outFile] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!inFile || !outFile) { console.error('usage: node tools/models/tobihaze/clips.mjs <in.glb> <out.glb> [--fps 30] [--clips Idle,Crawl,Swim,Display]'); process.exit(2); }
  const { json, bin } = readGLB(fs.readFileSync(inFile));
  if (json.extensionsUsed?.includes('EXT_meshopt_compression')) throw new Error('clips: bake into the master (src/assets/models/…), not a packed copy');
  const before = bin.length;
  const r = bakeClips(json, bin, { fps: Number(opt('--fps', 30)), clips: opt('--clips', null)?.split(',') });
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, writeGLB(r.json, r.bin));
  for (const c of r.report) console.log(`${c.name}: ${c.duration} s, ${c.frames} frames, ${c.channels} channels`);
  console.log(`${path.basename(outFile)}: +${((r.bin.length - before) / 1024).toFixed(1)} kB of animation`);
}
