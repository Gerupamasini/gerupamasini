import * as THREE from 'three';

// Outdoor lighting: sun (shadow-casting directional light), sky/ground hemisphere, and a PMREM
// environment built from a gradient sky with a sun disc (gives the eye/cornea a natural catch-light).

function makeSkyScene(sunDir) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSun: { value: sunDir.clone().normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: `varying vec3 vDir; uniform vec3 uSun;
      void main(){
        float h = vDir.y;
        vec3 zenith = vec3(0.22, 0.42, 0.85);
        vec3 horizon = vec3(0.78, 0.85, 0.95);
        vec3 ground = vec3(0.36, 0.33, 0.29);
        vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.55)) : mix(horizon * 0.8, ground, pow(-h, 0.4));
        float s = max(dot(vDir, uSun), 0.0);
        c += vec3(1.0, 0.95, 0.85) * (pow(s, 900.0) * 60.0 + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
  return scene;
}

export class Environment {
  constructor(renderer, scene, { sunElevation = 38, sunAzimuth = 135, shadowSize = 6, shadowMapSize = 2048 } = {}) {
    this.scene = scene;
    this.sun = new THREE.DirectionalLight(0xfff4e6, 3.6);
    this.sunDir = new THREE.Vector3();
    this.setSun(sunElevation, sunAzimuth);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const s = shadowSize;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: 60 });
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.004;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xe3ebf5, 0xb8a684, 0.7);
    scene.add(this.hemi);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = pmrem.fromScene(makeSkyScene(this.sunDir), 0.02);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }

  setSun(elevDeg, azDeg) {
    const e = THREE.MathUtils.degToRad(elevDeg);
    const a = THREE.MathUtils.degToRad(azDeg);
    this.sunDir.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  }

  /** Keep the shadow frustum centred on the area of interest (camera focus). */
  follow(target) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 20);
  }
}
