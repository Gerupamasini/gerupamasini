import * as THREE from 'three';
import { EdohazeShared } from '../creatures/edohaze/EdohazeShaders.js';

// Estuarine water column: tide-driven surface, spectral attenuation of sunlight
// with depth (Beer–Lambert, turbid/CDOM-rich water absorbs blue and red),
// exponential fog for in-water scattering, and an animated surface seen from below.
export class Water {
  constructor(scene, world, renderer) {
    this.scene = scene; this.world = world;
    this.sigma = new THREE.Vector3(0.9, 0.42, 0.75);     // per-metre attenuation (R,G,B) — turbid estuary
    this.fogColor = new THREE.Color(0x3f5448);
    scene.fog = new THREE.FogExp2(this.fogColor, 0.75);
    scene.background = this.fogColor.clone();

    this.sunDir = new THREE.Vector3(0.35, 1, 0.25).normalize();
    this.sun = new THREE.DirectionalLight(0xffffff, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera; c.left = -0.6; c.right = 0.6; c.top = 0.6; c.bottom = -0.6; c.near = 0.05; c.far = 4;
    this.sun.shadow.bias = -0.0002; this.sun.shadow.normalBias = 0.0015; this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x9fc4b4, 0x3a3226, 0.9);
    scene.add(this.hemi);

    // environment for PBR reflections: vertical gradient "under water" dome
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec3 vP; void main(){
        float y = vP.y;
        vec3 top = vec3(2.2, 2.6, 2.2); vec3 mid = vec3(0.22, 0.32, 0.27); vec3 bot = vec3(0.05, 0.05, 0.04);
        vec3 c = y > 0.0 ? mix(mid, top, pow(y, 3.0)) : mix(mid, bot, pow(-y, 0.6));
        c += vec3(3.0) * pow(max(dot(vP, normalize(vec3(0.35,1.0,0.25))), 0.0), 60.0); // Snell's window sun
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    envScene.add(dome);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.55;

    // surface from below
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(8, 8, 1, 1), new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
      uniforms: { uTime: EdohazeShared.uniforms.uTime, uFog: { value: this.fogColor } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; uniform float uTime; uniform vec3 uFog;
        void main(){
          vec2 p = vW.xz * 6.0;
          float w = sin(p.x * 1.3 + uTime * 1.1) * sin(p.y * 1.7 - uTime * 0.9) + 0.5 * sin((p.x + p.y) * 2.3 + uTime * 1.7);
          vec3 c = mix(uFog * 1.6, vec3(0.75, 0.85, 0.78), 0.25 + 0.15 * w);
          float dist = length(vW.xz - cameraPosition.xz);
          float a = 0.85 * exp(-dist * 0.35);
          gl_FragColor = vec4(c, a);
        }`,
    }));
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.renderOrder = 10;
    scene.add(this.surface);
    this.sunBase = new THREE.Color(1.0, 0.97, 0.9);
    this.sunColor = new THREE.Color();
  }

  /** validation: white light, no fog, grey backdrop (judging albedo without water tint) */
  setNeutral(on) { this.neutral = on; }

  update(camera, focus) {
    const wy = this.world.getWaterLevel();
    this.surface.position.y = wy;
    const g = this.world.getGroundHeight(focus.x, focus.z);
    const depth = Math.max(wy - g, 0);
    const exposed = depth < 0.004;
    // spectral transmission along the (refracted) sun path to the bottom
    const path = depth / Math.max(this.sunDir.y, 0.3);
    const tr = new THREE.Vector3(Math.exp(-this.sigma.x * path), Math.exp(-this.sigma.y * path), Math.exp(-this.sigma.z * path));
    this.sunColor.setRGB(this.sunBase.r * tr.x, this.sunBase.g * tr.y, this.sunBase.b * tr.z);
    const day = this.world.getDaylight();
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = 2.6 * day;
    this.hemi.intensity = 0.9 * day * (0.5 + 0.5 * tr.y);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 2);
    this.sun.target.position.copy(focus);
    this.scene.fog.density = exposed ? 0.05 : 0.75 * (this.world.visibility ? 1.3 / this.world.visibility : 1);
    const caustic = exposed ? 0 : 0.9 * Math.exp(-depth * 1.2);
    EdohazeShared.update({ camera, sunDirWorld: this.sunDir, sunColor: this.sunColor.clone().multiplyScalar(day), caustic, waterY: wy });
    this.surface.visible = camera.position.y < wy;
    if (this.neutral) {
      this.sun.color.set(0xffffff); this.sun.intensity = 2.2; this.hemi.intensity = 1.0; this.hemi.color.set(0xffffff); this.hemi.groundColor.set(0x777777);
      this.scene.fog.density = 0; this.scene.background.set(0x808080); this.surface.visible = false;
      EdohazeShared.update({ camera, sunDirWorld: this.sunDir, sunColor: new THREE.Color(1, 1, 1), caustic: 0 });
    }
  }
}
