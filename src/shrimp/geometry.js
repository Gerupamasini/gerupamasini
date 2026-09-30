import * as THREE from 'three';

/**
 * Closed exoskeletal tube along X. `dir` = +1 builds toward +X, -1 toward -X.
 * profile(t) -> { top, bottom, width, y } (half-extents in metres).
 * Adds `aJoint` attribute: 1 near the articulating ends (arthrodial membrane).
 */
export function shellTube(length, dir, profile, { rings = 16, radial = 28, jointEnds = [true, true], jointWidth = 0.1 } = {}) {
  const pos = [];
  const joint = [];
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const p = profile(t);
    const x = dir * t * length;
    let j = 0;
    if (jointEnds[0]) j = Math.max(j, 1 - t / jointWidth);
    if (jointEnds[1]) j = Math.max(j, (t - (1 - jointWidth)) / jointWidth);
    j = THREE.MathUtils.clamp(j, 0, 1);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      // Dorsal arch is rounder; ventral side flatter (sternites).
      const y = s >= 0 ? p.top * Math.pow(s, 0.85) : -p.bottom * Math.pow(-s, 1.6);
      const z = p.width * Math.sign(c) * Math.pow(Math.abs(c), 0.8);
      pos.push(x, (p.y ?? 0) + y, z);
      joint.push(j);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c = a + radial;
      const d = b + radial;
      if (dir > 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  // End caps
  for (const [ring, flip] of [[0, true], [rings, false]]) {
    const t = ring / rings;
    const p = profile(t);
    const ci = pos.length / 3;
    pos.push(dir * t * length, p.y ?? 0, 0);
    joint.push(1);
    for (let k = 0; k < radial; k++) {
      const a = ring * radial + k;
      const b = ring * radial + ((k + 1) % radial);
      const f = flip !== dir < 0;
      if (f) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aJoint', new THREE.Float32BufferAttribute(joint, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Tapered podomere along +X from 0 to len, with slightly flattened section. */
export function podomere(len, r0, r1, radial = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 3, false);
  g.rotateZ(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  g.scale(1, 1, 0.8);
  // Swell the middle a little (podomeres are fusiform).
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / len;
    const s = 1 + 0.18 * Math.sin(Math.PI * t);
    p.setY(i, p.getY(i) * s);
    p.setZ(i, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

/** Flat leaf-shaped plate (uropod ramus, scaphocerite, pleuron) in XY plane, extruded thinly in Z. */
export function plate(outline, thickness) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.4, bevelSize: thickness * 0.5, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -thickness / 2);
  const n = g.attributes.position.count;
  g.setAttribute('aJoint', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  g.computeVertexNormals();
  return g;
}

export function ellipseOutline(len, halfW, n = 20, bias = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = (Math.cos(a) * 0.5 + 0.5) * len;
    const w = halfW * (1 + bias * (x / len - 0.5));
    pts.push([x, Math.sin(a) * w]);
  }
  return pts;
}

/**
 * Rostrum profile with dorsal basal crest teeth, subdistal teeth, and ventral teeth.
 * Built in XY (x forward from base), extruded in Z.
 */
export function rostrumGeometry(R) {
  const L = R.length;
  const h = R.baseHeight;
  const top = [];
  const bottom = [];
  const N = 90;
  const toothAt = (t, positions, amp, width) => {
    let v = 0;
    for (const p of positions) {
      const d = (t - p) / width;
      if (d > -1 && d < 0.4) v = Math.max(v, amp * (d < 0 ? 1 + d : 1 - d / 0.4)); // saw tooth pointing forward
    }
    return v;
  };
  const crest = Array.from({ length: R.dorsalCrestTeeth }, (_, i) => 0.04 + i * 0.075);
  const sub = Array.from({ length: R.dorsalSubdistalTeeth }, (_, i) => 0.86 + i * 0.05);
  const ventral = Array.from({ length: R.ventralTeeth }, (_, i) => 0.4 + i * 0.065);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const upturn = Math.pow(t, 2.5) * R.tipUpturn * L;
    const crestH = h * (0.55 + 0.45 * Math.exp(-Math.pow((t - 0.2) / 0.25, 2))) * (1 - t * 0.85);
    const yTop = upturn + crestH * 0.55 + toothAt(t, crest, h * 0.28, 0.06) + toothAt(t, sub, h * 0.14, 0.04);
    const yBot = upturn - crestH * 0.45 - toothAt(t, ventral, h * 0.2, 0.05) * (t < 0.95 ? 1 : 0);
    top.push([t * L, yTop]);
    bottom.push([t * L, yBot]);
  }
  const outline = [...top, ...bottom.reverse()];
  const g = plate(outline, h * 0.22);
  return g;
}
