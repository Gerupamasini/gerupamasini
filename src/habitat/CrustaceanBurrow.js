import * as THREE from 'three';

// Habitat object for thalassinidean shrimp burrows (ニホンスナモグリ / アナジャコ).
// Edohaze uses these as refuge and spawning sites (confirmed; RESEARCH.md §5.1).
//
//  type 'nihonotrypaea': callianassid, opening on a low ejecta mound, narrow
//                        near-vertical shaft that branches (1 opening modelled).
//  type 'upogebia':      Y/U-shaped burrow with two flush openings joined by a
//                        U-tube; shaft diameter larger (Upogebia major ~15–20 mm).
//
// Geometry is in metres. `path` runs from the opening (t=0) into the sediment.
let nextId = 1;

export class CrustaceanBurrow {
  constructor({ type = 'nihonotrypaea', opening, groundY, rand = Math.random, partnerOpening = null }) {
    this.id = nextId++;
    this.type = type;
    this.radius = type === 'upogebia' ? 0.0085 : 0.0065;
    this.moundHeight = type === 'nihonotrypaea' ? 0.006 + rand() * 0.006 : 0.0;
    this.moundRadius = type === 'nihonotrypaea' ? 0.035 + rand() * 0.02 : 0;
    this.opening = opening.clone();
    this.opening.y = groundY + this.moundHeight;
    // Shaft: slightly inclined, gently curving down; ~12–18 cm usable for the fish
    const lean = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize().multiplyScalar(0.02 + rand() * 0.03);
    const pts = [
      this.opening.clone().add(new THREE.Vector3(0, 0.03, 0)), // above-opening guide point (approach)
      this.opening.clone(),
      this.opening.clone().add(new THREE.Vector3(lean.x * 0.5, -0.05, lean.z * 0.5)),
      this.opening.clone().add(new THREE.Vector3(lean.x, -0.11, lean.z)),
      this.opening.clone().add(new THREE.Vector3(lean.x * 1.8, -0.17, lean.z * 1.8)),
    ];
    if (type === 'upogebia' && partnerOpening) {
      // U-tube to the partner opening
      const p2 = partnerOpening.clone(); p2.y = groundY;
      const mid = this.opening.clone().lerp(p2, 0.5); mid.y -= 0.16;
      pts.splice(3, 2, mid, p2.clone().add(new THREE.Vector3(0, -0.05, 0)), p2);
      this.partnerOpening = p2;
    }
    this.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    this._len = this.path.getLength();
    this.occupants = new Set();
    this.owner = null;       // breeding male guarding eggs
    this.capacity = 2;
  }

  shiftY(dy) {
    this.opening.y += dy;
    for (const p of this.path.points) p.y += dy;
    this.path.updateArcLengths?.(); this._len = this.path.getLength();
  }

  /** arc-length point along the shaft, d in metres from the opening (negative = above) */
  pointAt(d, out = new THREE.Vector3()) {
    const u = THREE.MathUtils.clamp((d + 0.03) / this._len, 0, 1);
    return this.path.getPointAt(u, out);
  }
  tangentAt(d, out = new THREE.Vector3()) {
    const u = THREE.MathUtils.clamp((d + 0.03) / this._len, 0, 1);
    return this.path.getTangentAt(u, out); // points into the burrow
  }
  get usableDepth() { return this._len - 0.03; }

  isFlooded(waterY) { return waterY > this.opening.y + 0.004; }
  hasRoom(fish) { return this.occupants.has(fish) || this.occupants.size < this.capacity; }
}
