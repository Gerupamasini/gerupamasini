// Peck kinematics over time (no rendering): plays ACTIONS.peck in real time (60 Hz, smoothing and all — the
// validation strips freeze the action and let the posture converge, which hides lag and overshoot) from the
// settled forage stance and prints per frame: body axis, trunk height, neck stretch, head pivot and bill tip
// (root frame, mm), bill angle, bill tip → prey distance, foot slip, tail pitch and the head speed.
// Then a summary per prey type: strike duration (bill from 10 mm above the ground to contact), peak head speed,
// max neck stretch, contact error, max foot slip, max body axis.
// usage: node tools/dev/peckcurve.mjs [--types=polychaete,crab,amphipod] [--dist=62] [--every=2] [--quiet]
//        [--csv=dir] [--shape] (shape: per printed row also crown − back, eye (z,y) and eye − breast front, mm —
//        the contact pose against p007 / p061: head forward of the breast, crown near the back line)
import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator, GAZE_PITCH_REST } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';
import { BILL } from '../../src/birds/kentishPlover/anatomy/bareParts.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const TYPES = (args.types ?? 'polychaete,crab,amphipod').split(',');
const DIST = Number(args.dist ?? CFG.animation.peck.reach * 1000) / 1000;
const EVERY = Number(args.every ?? 2);
const J = CFG.joints;
const deg = (r) => (r * 180) / Math.PI;
const m = new KentishPloverModel({ lods: [1], shadows: false });
const local = (a, bone, p) => new THREE.Vector3(...p.map((x, i) => (x - J[bone][i]) * 0.001)).applyMatrix4(a.b[bone].matrixWorld).multiplyScalar(1000);
const headPrim = CFG.bodySculpt.headContact;
const _v = new THREE.Vector3();
// crown (highest head-ellipsoid point), back (highest posed body vertex behind the shoulder), breast front, eye
function shape(a) {
  m.object.updateMatrixWorld(true);
  let crown = -Infinity;
  for (let la = -6; la <= 6; la++)
    for (let lo = 0; lo < 24; lo++) {
      const h = headPrim;
      const p = [h.c[0] + h.r[0] * Math.cos(la * 0.26) * Math.sin(lo * 0.2618), h.c[1] + h.r[1] * Math.sin(la * 0.26), h.c[2] + h.r[2] * Math.cos(la * 0.26) * Math.cos(lo * 0.2618)];
      crown = Math.max(crown, local(a, 'head', p).y);
    }
  let back = -Infinity;
  let breast = -Infinity;
  const mesh = m.lods[1].meshes[0];
  const g = mesh.geometry;
  const rest = g.getAttribute('aRest');
  for (let i = 0; i < rest.count; i += 3) {
    mesh.getVertexPosition(i, _v);
    _v.applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);
    if (rest.getZ(i) < -5 && rest.getZ(i) > -60) back = Math.max(back, _v.y);
    if (rest.getY(i) < 80 && rest.getY(i) > 50) breast = Math.max(breast, _v.z);
  }
  const eye = local(a, 'head', J.eyeCenter);
  return { cb: crown - back, ez: eye.z, ey: eye.y, eb: eye.z - breast };
}
const f = (x, w = 7, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–').padStart(w);

const summary = [];
for (const type of TYPES) {
  const a = new KentishPloverAnimator(m, { seed: 3 });
  a.previewAction('forage', 0);
  const target = new THREE.Vector3(0, 0, DIST);
  a.setGaze('ground', target); // as AI._peck: eyes on the prey
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  const feet0 = ['L', 'R'].map((s) => a.b[`foot_${s}`].getWorldPosition(new THREE.Vector3()));
  a.play('peck', { target: target.clone(), preyType: type });
  const dur = a.action.dur;
  const rows = [];
  let prevHead = null;
  let prevTip = null;
  const n = Math.ceil(dur * 60) + 30;
  for (let i = 0; i <= n; i++) {
    const t = i / 60;
    if (i > 0) a.update(1 / 60);
    const q = a.b.body.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const axis = 10 - deg(Math.asin(-fwd.y));
    const by = a.b.body.getWorldPosition(new THREE.Vector3()).y * 1000;
    const head = a.b.head.getWorldPosition(new THREE.Vector3()).multiplyScalar(1000);
    const tip = local(a, 'head', BILL.tip);
    const base = local(a, 'head', BILL.base);
    const bill = deg(Math.atan2(base.y - tip.y, Math.hypot(tip.z - base.z, tip.x - base.x)));
    const toPrey = tip.distanceTo(target.clone().multiplyScalar(1000));
    const slip = Math.max(...['L', 'R'].map((s, k) => a.b[`foot_${s}`].getWorldPosition(new THREE.Vector3()).distanceTo(feet0[k]) * 1000));
    const tail = a.b.tail.getWorldQuaternion(new THREE.Quaternion());
    const tf = new THREE.Vector3(0, 0, -1).applyQuaternion(tail);
    const tailUp = deg(Math.asin(tf.y));
    const hs = prevHead ? head.distanceTo(prevHead) * 60 : 0;
    const ts = prevTip ? tip.distanceTo(prevTip) * 60 : 0;
    prevHead = head.clone();
    prevTip = tip.clone();
    const miss = a.headWant ? a.headWant.clone().multiplyScalar(1000).distanceTo(head) : 0;
    if (args.dbg) console.log("want", a.headWant.clone().multiplyScalar(1000).toArray().map((x) => x.toFixed(1)).join(","), "gaze", a.gaze.pitch.toFixed(2), a.gaze.yaw.toFixed(2), a.gaze.roll.toFixed(2), "corr", a._corr?.clone().multiplyScalar(1000).toArray().map((x) => x.toFixed(1)).join(","), "headWorst", a._headWorst?.toFixed(2), "neckWorst", a._neckWorst?.toFixed(2));
    const sh = 'shape' in args && i % EVERY === 0 ? shape(a) : {};
    rows.push({ ...sh, t, u: a.action ? a.action.t / dur : 1, miss, axis, by, stretch: a.neckStretch, hz: head.z, hy: head.y, tz: tip.z, ty: tip.y, bill, toPrey, slip, tailUp, hs, ts, jaw: 0 });
  }
  if (!('quiet' in args)) {
    console.log(`\n== ${type}  (duration ${dur.toFixed(2)} s, prey ${(DIST * 1000).toFixed(0)} mm ahead)`);
    console.log('   t     u  miss  axis°  bodyY stretch  head(z,y)      tip(z,y)     bill°  →prey  slip  tail°  headV  tipV(mm/s)' + ('shape' in args ? '  crown−back  eye(z,y)  eye−breast' : ''));
    rows.forEach((r, i) => {
      if (i % EVERY) return;
      console.log(`${f(r.t, 5, 2)}${f(r.u, 6, 2)}${f(r.miss, 6)}${f(r.axis)}${f(r.by)}${f(r.stretch, 7, 2)}${f(r.hz)},${f(r.hy, 6)}${f(r.tz)},${f(r.ty, 6)}${f(r.bill)}${f(r.toPrey)}${f(r.slip, 6)}${f(r.tailUp)}${f(r.hs, 7, 0)}${f(r.ts, 7, 0)}${'shape' in args ? `${f(r.cb, 10)}${f(r.ez)},${f(r.ey, 5)}${f(r.eb, 9)}` : ''}`);
    });
  }
  if (args.csv) {
    mkdirSync(args.csv, { recursive: true });
    writeFileSync(`${args.csv}/${type}.csv`, Object.keys(rows[1]).join(',') + '\n' + rows.map((r) => Object.keys(rows[1]).map((k) => r[k]).map((v) => +v.toFixed?.(3) ?? v).join(',')).join('\n'));
  }
  const contact = rows.findIndex((r) => r.toPrey < 2);
  const above = rows.slice(0, contact < 0 ? 0 : contact).findLastIndex((r) => r.ty > 10);
  summary.push({
    type,
    dur,
    strike: contact > 0 && above >= 0 ? (contact - above) / 60 : NaN,
    tContact: contact >= 0 ? contact / 60 : NaN,
    maxMiss: Math.max(...rows.map((r) => r.miss)),
    peakTipV: Math.max(...rows.map((r) => r.ts)),
    maxStretch: Math.max(...rows.map((r) => r.stretch)),
    minPrey: Math.min(...rows.map((r) => r.toPrey)),
    minTipY: Math.min(...rows.map((r) => r.ty)),
    slip: Math.max(...rows.map((r) => r.slip)),
    maxAxis: Math.min(...rows.map((r) => r.axis)),
    minBelly: Math.min(...rows.map((r) => r.by)),
    billAtContact: contact >= 0 ? rows[contact].bill : NaN,
    tailMax: Math.max(...rows.map((r) => r.tailUp)),
  });
}
console.log('\ntype        dur   strike(s) tContact  peakTipV  maxStretch  minTip→prey  maxHeadMiss  minTipY  footSlip  minAxis°  bodyYmin  bill@contact  tail°max');
for (const s of summary) console.log(`${s.type.padEnd(11)}${f(s.dur, 5, 2)}${f(s.strike, 9, 3)}${f(s.tContact, 9, 2)}${f(s.peakTipV, 10, 0)}${f(s.maxStretch, 11, 2)}${f(s.minPrey, 12)}${f(s.maxMiss, 13)}${f(s.minTipY, 9)}${f(s.slip, 9, 2)}${f(s.maxAxis, 10)}${f(s.minBelly, 10)}${f(s.billAtContact, 13)}${f(s.tailMax, 9)}`);
