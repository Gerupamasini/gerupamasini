// A fish eye built like the real organ: a spherical globe that bulges from the head, a
// recessed black pupil, a flattened iris with radial fibres and a colour gradient, a thin
// dark limbus, and a clear glossy cornea over the front that catches highlights.
import * as THREE from 'three';

const EYE_GLSL = /* glsl */`
varying vec3 vEyeDir;
uniform vec3 uPupil, uIrisIn, uIrisOut, uLimbus, uSclera, uUpper;
uniform float uPupilA, uIrisA, uUpperAmt, uPupAsp, uAzMix;
uniform vec3 uAzV, uAzH;
float eh(float n){ return fract(sin(n) * 43758.5453); }
vec3 eyeColor(){
  vec3 d = normalize(vEyeDir);
  float th = acos(clamp(d.z, -1.0, 1.0));            // angle from the outward pole
  float az = atan(d.y, d.x);
  float fib = 0.8 + 0.2 * sin(az * 70.0 + 3.0 * eh(floor(az * 20.0))) * eh(floor(az * 55.0) + 3.0);
  vec3 c;
  // optional horizontally elongated pupil (measured on the local x axis)
  float thP = d.z > 0.0 ? asin(clamp(length(vec2(d.x / uPupAsp, d.y)), 0.0, 1.0)) : 3.1416;
  if (thP < uPupilA) {
    c = uPupil;
  } else if (th < uIrisA) {
    float f = (th - uPupilA) / (uIrisA - uPupilA);
    c = mix(uIrisIn, uIrisOut, smoothstep(0.0, 1.0, f)) * fib;
    c = mix(c, c * 1.35, exp(-pow((f - 0.08) / 0.06, 2.0)) * 0.6);   // bright collar at the pupil edge
    c = mix(c, uUpper, uUpperAmt * smoothstep(0.1, 0.9, d.y) * (0.4 + 0.6 * f));
    // optional azimuthal pattern: one colour above / below the pupil, another in front / behind
    vec2 az2 = normalize(d.xy + 1e-5);
    c = mix(c, mix(uAzH, uAzV, smoothstep(0.35, 0.85, abs(az2.y))) * fib, uAzMix);
    c = mix(c, uLimbus, smoothstep(0.86, 0.98, f));                    // dark limbus
  } else {
    c = mix(uLimbus, uSclera, smoothstep(uIrisA, uIrisA + 0.12, th));
  }
  return c;
}
`;

// Displace the globe: pupil recessed, iris flattened slightly (it sits behind the cornea).
function eyeballGeometry(r, pupilA, irisA) {
  const g = new THREE.SphereGeometry(r, 96, 64);
  g.rotateX(Math.PI / 2);                 // poles along +/- z
  const p = g.attributes.position, dirs = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    dirs.push(v.x, v.y, v.z);
    const th = Math.acos(Math.max(-1, Math.min(1, v.z)));
    let k = 1;
    if (th < irisA) k = 1 - 0.05 * (1 - th / irisA) ** 0.5;           // iris plane lies a little back
    if (th < pupilA) k -= 0.03 * (1 - th / pupilA);                   // pupil deepest
    v.multiplyScalar(r * k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.setAttribute('eyeDir', new THREE.Float32BufferAttribute(dirs, 3));
  g.computeVertexNormals();
  return g;
}

export function createFishEye({
  r, pupil = [0.01, 0.01, 0.012], irisIn = [0.2, 0.15, 0.1], irisOut = [0.4, 0.4, 0.42], limbus = [0.05, 0.05, 0.06],
  sclera = [0.1, 0.1, 0.11], upper = [0.8, 0.5, 0.8], upperAmt = 0, pupilA = 0.36, irisA = 0.78, patch = (m) => m,
  pupilAspect = 1, azV = [0, 0, 0], azH = [0, 0, 0], azMix = 0,
  matrix = new THREE.Matrix4(),   // placement, baked into the vertices (so the swim bend applies)
}) {
  const group = new THREE.Group();
  const U = {
    uPupil: { value: new THREE.Color(...pupil) }, uIrisIn: { value: new THREE.Color(...irisIn) }, uIrisOut: { value: new THREE.Color(...irisOut) },
    uLimbus: { value: new THREE.Color(...limbus) }, uSclera: { value: new THREE.Color(...sclera) }, uUpper: { value: new THREE.Color(...upper) },
    uPupilA: { value: pupilA }, uIrisA: { value: irisA }, uUpperAmt: { value: upperAmt },
    uPupAsp: { value: pupilAspect }, uAzMix: { value: azMix }, uAzV: { value: new THREE.Color(...azV) }, uAzH: { value: new THREE.Color(...azH) },
  };
  // underwater the cornea and water have nearly the same refractive index (1.376 vs 1.333), so the
  // eye shows almost no milky surface reflection: a deep black pupil and a dark, saturated iris
  // with only a small crisp highlight from the lens
  const ballMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.0, envMapIntensity: 0.12, specularIntensity: 0.25 });
  patch(ballMat, 'eyeball');
  const prev = ballMat.onBeforeCompile;
  ballMat.onBeforeCompile = (sh, rr) => {
    if (prev) prev(sh, rr);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 eyeDir; varying vec3 vEyeDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeDir = eyeDir;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + EYE_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= eyeColor();')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n{ vec3 dd = normalize(vEyeDir); float thq = acos(clamp(dd.z, -1.0, 1.0)); roughnessFactor = mix(0.12, roughnessFactor, smoothstep(uPupilA * 0.8, uPupilA * 1.1, thq)); }');   // glossy black lens in the pupil
  };
  const pk = ballMat.customProgramCacheKey?.bind(ballMat);
  ballMat.customProgramCacheKey = () => (pk ? pk() : '') + '|eyeball';
  group.add(new THREE.Mesh(eyeballGeometry(r, pupilA, irisA).applyMatrix4(matrix), ballMat));
  // cornea: a clear dome over the iris; mostly invisible except for its reflections
  const cg = new THREE.SphereGeometry(r * 1.035, 64, 32, 0, Math.PI * 2, 0, irisA * 1.15);
  cg.rotateX(Math.PI / 2); cg.applyMatrix4(matrix);
  // cornea: adds only its specular reflection (black base colour, additive), and weakly - no white veil
  const cornea = new THREE.MeshPhysicalMaterial({ color: 0x000000, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, roughness: 0.04, metalness: 0,
    clearcoat: 0.0, envMapIntensity: 0.35, depthWrite: false, specularIntensity: 0.45 });
  patch(cornea, 'cornea');
  const cm = new THREE.Mesh(cg, cornea); cm.renderOrder = 3;
  group.add(cm);
  return group;
}
