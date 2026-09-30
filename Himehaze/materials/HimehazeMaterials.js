// Per-part PBR materials. Values chosen to read as wet, mucus-coated, slightly translucent fish tissue
// rather than plastic: low-mid roughness + clearcoat (mucus film), IOR of mucus/water ≈ 1.34-1.38,
// pseudo-subsurface wrap/back-scatter term for thin tissue (belly, fins, peduncle).
import * as THREE from 'three';
import { createBodyTextures, createFinTexture, createIrisTexture } from '../textures/HimehazeTextures.js';
import { patchSubsurface } from '../shaders/subsurface.js';

export function createMaterials(v, quality = 'high') {
  const size = quality === 'high' ? 1024 : 512;
  const tex = createBodyTextures(v, size);

  const body = new THREE.MeshPhysicalMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: tex.roughnessMap,
    roughness: 1.0,            // multiplied by roughnessMap
    metalness: 0.0,
    ior: 1.37,
    specularIntensity: 0.55,
    specularColor: new THREE.Color(0.95, 0.97, 1.0),
    clearcoat: 0.35,           // mucus layer
    clearcoatRoughness: 0.22,
    sheen: 0.15,               // guanine iridescent sheen on flanks (weak; P)
    sheenColor: new THREE.Color(0.75, 0.82, 0.8),
    sheenRoughness: 0.5,
  });
  patchSubsurface(body, { color: new THREE.Color(0.95, 0.7, 0.55), strength: 0.35 });

  const finMat = (kind, rays) => {
    const m = new THREE.MeshPhysicalMaterial({
      map: createFinTexture(kind, v, rays),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.38,
      metalness: 0,
      ior: 1.34,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
      specularIntensity: 0.4,
      alphaTest: 0.02,
    });
    patchSubsurface(m, { color: new THREE.Color(1.0, 0.85, 0.7), strength: 0.55, thin: true });
    return m;
  };
  const fins = {
    dorsal1: finMat('dorsal1', 6), dorsal2: finMat('dorsal2', 10), anal: finMat('anal', 10),
    caudal: finMat('caudal', 15), pectoral: finMat('pectoral', 17), pelvic: finMat('pelvic', 11),
  };
  const ray = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.72, 0.64, 0.52).multiplyScalar(v.brightness),
    roughness: 0.4, clearcoat: 0.3, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  });

  // --- eye: separate physical layers -----------------------------------------------------------
  const eyeball = new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.5 });   // choroid/sclera (hidden mostly)
  const iris = new THREE.MeshPhysicalMaterial({
    map: createIrisTexture(v), roughness: 0.45, metalness: 0.0,
    iridescence: 0.35, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 500],   // argentea/tapetal glint (P)
  });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x020202, roughness: 0.05, ior: 1.65, specularIntensity: 1 }); // pupil / lens
  const cornea = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1.0, thickness: 0.0004, ior: 1.376, roughness: 0.0,
    clearcoat: 1.0, clearcoatRoughness: 0.0, specularIntensity: 1.0, transparent: true, opacity: 1.0,
    depthWrite: false,
  });
  const corneaCheap = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.0, clearcoat: 1, depthWrite: false,
  });
  return { body, fins, ray, eyeball, iris, lens, cornea, corneaCheap, textures: tex };
}
