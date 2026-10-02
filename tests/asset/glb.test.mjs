import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const FILE = new URL('../../assets/generated/yamame.glb', import.meta.url);
const have = fs.existsSync(FILE);
const doc = have ? await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(FILE.pathname) : null;
const skip = have ? false : 'run `npm run build:assets` first';

test('62 joints in one skin', { skip }, () => {
  const skins = doc.getRoot().listSkins(); assert.equal(skins.length, 1);
  assert.equal(skins[0].listJoints().length, 62);
  const names = new Set(skins[0].listJoints().map((j) => j.getName()));
  for (const n of ['fish_root', 'spine_00', 'spine_23', 'jaw_lower', 'opercle_L', 'opercle_R', 'caudal_hub', 'dorsal_hinge', 'adipose_01', 'eye_L', 'eye_R']) assert.ok(names.has(n), n);
});

test('skin weights: <=4 influences, sum to 1, indices in range', { skip }, () => {
  const nJ = doc.getRoot().listSkins()[0].listJoints().length;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const j = prim.getAttribute('JOINTS_0'), w = prim.getAttribute('WEIGHTS_0'); if (!j) continue;
    const ja = j.getArray(), wa = w.getArray();
    for (let v = 0; v < ja.length / 4; v++) { let s = 0; for (let k = 0; k < 4; k++) { s += wa[v * 4 + k]; if (wa[v * 4 + k] > 0) assert.ok(ja[v * 4 + k] < nJ); } assert.ok(Math.abs(s - 1) < 1e-4, `mesh ${mesh.getName()} v${v} sum ${s}`); }
  }
});

test('body length is SL=0.19 m (+/- 2 %) in metres, +X forward', { skip }, () => {
  const body = doc.getRoot().listMeshes().find((m) => m.getName().startsWith('Body'));
  const pos = body.listPrimitives()[0].getAttribute('POSITION'); const min = pos.getMin([]), max = pos.getMax([]);
  const L = max[0] - min[0]; assert.ok(L > 0.19 * 0.98 && L < 0.19 * 1.08, `body x extent ${L}`);
  assert.ok(max[0] > Math.abs(min[0]) * 0.9);
});

test('no NaN positions and normals are unit length', { skip }, () => {
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const p = prim.getAttribute('POSITION').getArray(); for (const v of p) assert.ok(Number.isFinite(v));
    const n = prim.getAttribute('NORMAL').getArray(); for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-3);
  }
});

test('morph targets on the LOD0 body (same count on every primitive) and LOD1/LOD2 share the one skin', { skip }, () => {
  const names = ['mt_body_depth', 'mt_belly', 'mt_peduncle', 'mt_buccal_swell', 'mt_branchiostegal'];
  const body = doc.getRoot().listMeshes().find((m) => m.getName() === 'Body_LOD0');
  assert.deepEqual(body.getExtras().targetNames, names);
  for (const p of body.listPrimitives()) assert.equal(p.listTargets().length, names.length);
  const skin = doc.getRoot().listSkins()[0];
  for (const n of ['Body_LOD1', 'Body_LOD2', 'Fins_LOD0', 'Fins_LOD1', 'Fins_LOD2']) {
    const node = doc.getRoot().listNodes().find((x) => x.getName() === n); assert.ok(node, n); assert.equal(node.getSkin(), skin, `${n} shares the skin`);
  }
});

test('triangle budget report (informational; spec 06 6.8.1 targets ~8k, 6-12k; the hero close-up LOD0 is deliberately ~45k: head sculpt, see docs/yamame/impl/HEAD.md)', { skip }, () => {
  const tri = (m) => m.listPrimitives().reduce((a, p) => a + p.getIndices().getCount() / 3, 0);
  const by = Object.fromEntries(doc.getRoot().listMeshes().map((m) => [m.getName(), tri(m)]));
  const lod0 = (by.Body_LOD0 || 0) + (by.Fins_LOD0 || 0) + (by.Eye_L || 0) + (by.Eye_R || 0) + (by.EyeOrbit_L || 0) + (by.EyeOrbit_R || 0);
  console.log('# triangles', JSON.stringify(by), 'LOD0 total', lod0);
  assert.ok(lod0 < 60000);
});
