import * as THREE from 'three';

/** Tapered podomere along +X from 0 to len, with slightly flattened section. */
export function podomere(len, r0, r1, radial = 10) {
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 6, false);
  g.rotateZ(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  g.scale(1, 1, 0.8);
  // Swell the middle a little (podomeres are fusiform).
  const p = g.attributes.position;
  const j = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / len;
    const s = 1 + 0.18 * Math.sin(Math.PI * t);
    p.setY(i, p.getY(i) * s);
    p.setZ(i, p.getZ(i) * s);
    // Arthrodial membranes at both articulations: darker, less transparent.
    j[i] = Math.max(0, 1 - t / 0.12, (t - 0.88) / 0.12);
  }
  g.setAttribute('aJoint', new THREE.Float32BufferAttribute(j, 1));
  g.setAttribute('aPig', new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(0.3), 1));
  g.setAttribute('aThick', new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(0.5), 1));
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
