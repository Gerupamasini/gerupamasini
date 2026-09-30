import * as THREE from 'three';

// Suspended sediment / detritus flocs drifting in the tidal current around the camera.
export class Sediment {
  constructor(scene, count = 2600, radius = 0.45) {
    this.R = radius;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), s = new Float32Array(count), ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 2 * radius; p[i * 3 + 1] = Math.random() * 0.3; p[i * 3 + 2] = (Math.random() - 0.5) * 2 * radius;
      s[i] = 0.25 + Math.pow(Math.random(), 4) * 1.4; ph[i] = Math.random() * 100;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    this.uniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uR: { value: radius }, uFlow: { value: new THREE.Vector3(0.012, 0, 0.004) }, uWaterY: { value: 1 }, uGround: { value: 0 }, uPx: { value: 800 } };
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.uniforms,
      vertexShader: `attribute float aSize; attribute float aPh; uniform float uTime; uniform vec3 uCenter; uniform float uR; uniform vec3 uFlow; uniform float uWaterY; uniform float uGround; uniform float uPx;
        varying float vA;
        void main(){
          vec3 p = position + uFlow * uTime + 0.004 * vec3(sin(uTime*0.7+aPh), sin(uTime*0.5+aPh*1.3), cos(uTime*0.6+aPh));
          p.xz = mod(p.xz - uCenter.xz + uR, 2.0*uR) - uR + uCenter.xz;
          float span = max(uWaterY - uGround, 0.01);
          p.y = uGround + mod(p.y * 3.0, 1.0) * span * (0.2 + 0.8 * fract(aPh));  // denser near bottom
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * 0.0006 * uPx / -mv.z;
          vA = 0.35 * smoothstep(0.0, 0.03, -mv.z) * exp(-(-mv.z) * 1.2);
        }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(0.62,0.6,0.5), vA * (1.0 - d*2.0)); }`,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
  }
  update(time, center, waterY, ground, viewportH) {
    const u = this.uniforms; u.uTime.value = time; u.uCenter.value.copy(center); u.uWaterY.value = waterY; u.uGround.value = ground; u.uPx.value = viewportH;
  }
}
