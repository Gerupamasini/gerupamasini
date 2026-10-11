import { Color, CubeCamera, CubeTexture, DirectionalLight, HalfFloatType, HemisphereLight, LinearFilter, MathUtils, PMREMGenerator, Scene, Vector3, WebGLCubeRenderTarget, type Texture, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * A map's air: the clear-day sky, clouds, sun and fill light. The defaults are the temperate Tokyo Bay day every
 * map had before; a subtropical map (漫湖) overrides some of them. Dusk, night and overcast blend from these.
 */
export interface Atmosphere {
  /** Preetham clear-day scattering (dusk and overcast are added on top) */
  rayleigh: number; turbidity: number; mie: number;
  /** dome brightness, and its factor when the sun is high (a near-zenith sun would bleach the dome to cyan-white) */
  skyScale: number; skyScaleHighSun: number;
  /** fair-weather cumulus: cover, density, size (smaller is larger clouds) and the sunlit tops' brightness */
  cloudCoverage: number; cloudDensity: number; cloudScale: number; cloudGain: number;
  /** clear-day key light colour and a factor on its intensity */
  sunColor: readonly [number, number, number]; sunGain: number;
  /** clear-day hemisphere fill colours and the day fog/horizon colour */
  hemiSky: readonly [number, number, number]; hemiGround: readonly [number, number, number];
  fogDay: readonly [number, number, number];
}
export const DEFAULT_ATMOSPHERE: Atmosphere = {
  rayleigh: 2.2, turbidity: 2.0, mie: 0.002, skyScale: 0.32, skyScaleHighSun: 1,
  cloudCoverage: 0.5, cloudDensity: 0.7, cloudScale: 0.00025, cloudGain: 1,
  sunColor: [1, 0.96, 0.9], sunGain: 1, hemiSky: [0.58, 0.68, 0.78], hemiGround: [0.28, 0.24, 0.18], fogDay: [0.6, 0.7, 0.78],
};

/** Preetham sky dome, key light, hemisphere light and a PMREM environment refreshed as the sun moves. */
export class SkyDome {
  readonly sky: Sky;
  readonly sunLight: DirectionalLight;
  private readonly uCloudTime = { value: 0 };
  readonly hemi: HemisphereLight;
  readonly fogColor = new Color();
  private readonly pmrem: PMREMGenerator;
  private envTex: Texture | null = null;
  private lastEnvElevation = NaN;
  private readonly envScene = new Scene();
  private readonly sunDir = new Vector3(0, 1, 0);
  private readonly cubeRT: WebGLCubeRenderTarget;
  private readonly cubeCam: CubeCamera;
  private lastEnvOvercast = 0;
  private overcast = 0;
  elevation = 45;
  private readonly atm: Atmosphere;

  constructor(private readonly scene: Scene, private readonly renderer: WebGLRenderer, shadows: boolean, shadowMapSize: number, atmosphere: Partial<Atmosphere> = {}) {
    this.atm = { ...DEFAULT_ATMOSPHERE, ...atmosphere };
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    // the Preetham model comes out far brighter than the ground at any exposure; scale the dome so the sky keeps its
    // blue and the environment maps built from it stop washing the flat out
    const mat = this.sky.material;
    mat.uniforms.uSkyScale = { value: this.atm.skyScale };
    mat.uniforms.uCloudGain = { value: this.atm.cloudGain };
    const CLOUD_SUN = 'vec3 sunColor = vSunE * Fex * 0.22 * 0.04;';
    // (fail loudly if a three upgrade changes the cloud shader: the gain would silently do nothing)
    if (!mat.fragmentShader.includes(CLOUD_SUN)) throw new Error('Sky: cloud lighting line not found in three Sky shader');
    mat.fragmentShader = mat.fragmentShader
      .replace('uniform float mieDirectionalG;', `uniform float mieDirectionalG;
		uniform float uSkyScale;
		uniform float uCloudGain;`)
      .replace(CLOUD_SUN, 'vec3 sunColor = vSunE * Fex * 0.22 * 0.04 * uCloudGain;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uSkyScale, 1.0 );');
    mat.needsUpdate = true;
    // fair-weather cumulus: three's own cloud layer (lit by the sun with a silver lining on the rims toward it,
    // self-shadowed, fading into the haze toward the horizon); they also end up in the environment cube and in the
    // sea's mirror, so the water reflects them
    mat.uniforms.cloudScale.value = this.atm.cloudScale;
    mat.uniforms.cloudElevation.value = 0.7;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.003;
    u.mieDirectionalG.value = 0.8;
    scene.add(this.sky);

    this.sunLight = new DirectionalLight(0xffffff, 3);
    this.sunLight.castShadow = shadows;
    const cam = this.sunLight.shadow.camera;
    cam.left = -45; cam.right = 45; cam.top = 45; cam.bottom = -45; cam.near = 1; cam.far = 300;
    this.sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.05;
    scene.add(this.sunLight, this.sunLight.target);

    this.hemi = new HemisphereLight(0x88aabb, 0x44392c, 0.8);
    scene.add(this.hemi);

    this.pmrem = new PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.cubeRT = new WebGLCubeRenderTarget(128, { type: HalfFloatType, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
    this.cubeCam = new CubeCamera(1, 5000, this.cubeRT);
  }

  /** The sky as a cube map (for the water's reflections). */
  get envCube(): CubeTexture {
    return this.cubeRT.texture;
  }

  /** Key light colour times intensity. */
  sunColorHdr(out = new Vector3()): Vector3 {
    const c = this.sunLight.color, i = this.sunLight.intensity;
    return out.set(c.r * i, c.g * i, c.b * i);
  }

  /** Update lights and sky for a sun direction (unit vector) and elevation in degrees. Call every frame; cheap. */
  update(sunDir: Vector3, elevation: number, anchor: Vector3, overcast = 0): void {
    this.sunDir.copy(sunDir);
    this.elevation = elevation;
    this.overcast = overcast;
    this.sky.material.uniforms.sunPosition.value.copy(sunDir);
    this.uCloudTime.value += 1 / 60;
    const cu = this.sky.material.uniforms;
    cu.time.value = this.uCloudTime.value;
    const atm = this.atm, oc = MathUtils.clamp(overcast, 0, 1);
    cu.cloudCoverage.value = atm.cloudCoverage + (0.95 - atm.cloudCoverage) * oc;
    cu.cloudDensity.value = atm.cloudDensity + (1 - atm.cloudDensity) * oc;
    const day = MathUtils.smoothstep(elevation, -4, 10);
    const dusk = 1 - MathUtils.smoothstep(elevation, -2, 18);
    const cloud = MathUtils.clamp(overcast, 0, 1);
    // key light: warm when low, white when high; below the horizon a faint moon/sky light remains
    const keyColor = new Color(...atm.sunColor).lerp(new Color(1, 0.62, 0.35), dusk).lerp(new Color(0.55, 0.65, 0.9), 1 - day);
    this.sunLight.color.copy(keyColor);
    // the sun carries the daylight; sky light stays a soft bluish fill so sand reads warm with cool shadows
    this.sunLight.intensity = (0.7 + 1.9 * day) * (1 - 0.75 * cloud) * (1 + (atm.sunGain - 1) * day);
    const lightDir = elevation > -2 ? sunDir : new Vector3(0.3, 1, 0.2).normalize();
    this.sunLight.position.copy(anchor).addScaledVector(lightDir, 120);
    this.sunLight.target.position.copy(anchor);
    // hemisphere: sky colour tracks the horizon tint
    const skyCol = new Color(...atm.hemiSky).lerp(new Color(0.16, 0.22, 0.34), 1 - day);
    const groundCol = new Color(...atm.hemiGround).lerp(new Color(0.05, 0.05, 0.07), 1 - day);
    this.hemi.color.copy(skyCol);
    this.hemi.groundColor.copy(groundCol);
    this.hemi.intensity = (0.2 + 0.1 * day) * (1 + 0.6 * cloud);
    this.hemi.color.lerp(new Color(0.6, 0.63, 0.66), cloud * 0.7);
    this.fogColor.copy(new Color(...atm.fogDay).lerp(new Color(0.85, 0.6, 0.42), dusk * day)).lerp(new Color(0.06, 0.08, 0.13), 1 - day);
    this.fogColor.lerp(new Color(0.62, 0.66, 0.7), cloud * day * 0.8);
    this.sky.material.uniforms.turbidity.value = atm.turbidity + 6 * dusk + 14 * cloud;
    // (dusk blends back to the default scattering, so sunsets stay as they were)
    this.sky.material.uniforms.rayleigh.value = MathUtils.lerp(atm.rayleigh, 2.2, dusk) - 1.2 * cloud;
    this.sky.material.uniforms.mieCoefficient.value = atm.mie + 0.03 * cloud;
    this.sky.material.uniforms.uSkyScale.value = atm.skyScale * MathUtils.lerp(1, atm.skyScaleHighSun, MathUtils.smoothstep(elevation, 25, 75));
    // below the horizon the Preetham model goes black: hide the dome and show the dark fog colour instead
    this.sky.visible = elevation > -7;
  }

  /** Rebuild the environment map when the sun moved enough (throttled by the caller). */
  refreshEnvironment(): void {
    if (Math.abs(this.elevation - this.lastEnvElevation) < 1.5 && Math.abs(this.overcast - this.lastEnvOvercast) < 0.15 && this.envTex) return;
    this.lastEnvElevation = this.elevation;
    this.lastEnvOvercast = this.overcast;
    const prev = this.envTex;
    this.envScene.add(this.sky);
    this.envScene.background = this.fogColor;
    const rt = this.pmrem.fromScene(this.envScene as unknown as Scene, 0, 0.1, 5000);
    this.cubeCam.position.set(0, 0, 0);
    this.cubeCam.update(this.renderer, this.envScene);
    this.scene.add(this.sky);
    this.envTex = rt.texture;
    this.scene.environment = this.envTex;
    // three applies this in place of a material's own envMapIntensity (materials without an envMap of their own), so
    // it is the sky's share of the daylight on everything: a fifth of the sun's, not an equal partner
    // (a map with a darker dome keeps the same ambient on the ground: the dome's scale is divided back out)
    this.scene.environmentIntensity = (0.03 + 0.06 * MathUtils.smoothstep(this.elevation, -4, 10)) * DEFAULT_ATMOSPHERE.skyScale / this.sky.material.uniforms.uSkyScale.value;
    prev?.dispose();
  }

  dispose(): void {
    this.pmrem.dispose();
    this.envTex?.dispose();
    this.cubeRT.dispose();
  }
}
