// Dump MeshPhysicalMaterial default property values from the actual r186.1 build.
import * as THREE from '/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/three-0.186.1/package/build/three.module.js';
console.log('THREE.REVISION =', THREE.REVISION);
const m = new THREE.MeshPhysicalMaterial();
const out = {};
const keys = new Set([...Object.keys(m)]);
// add accessor properties from prototypes
let p = Object.getPrototypeOf(m);
while (p && p !== Object.prototype) {
  for (const k of Object.getOwnPropertyNames(p)) {
    const d = Object.getOwnPropertyDescriptor(p, k);
    if (d && d.get) keys.add(k);
  }
  p = Object.getPrototypeOf(p);
}
const fmt = v => {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (v && v.isColor) return 'Color(' + v.getHexString() + ')';
  if (v && v.isVector2) return `Vector2(${v.x},${v.y})`;
  if (v && v.isEuler) return `Euler(${v.x},${v.y},${v.z},${v.order})`;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
const want = process.argv.slice(2);
for (const k of [...keys].sort()) {
  if (k.startsWith('_') || typeof m[k] === 'function') continue;
  out[k] = fmt(m[k]);
}
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(28), v);
