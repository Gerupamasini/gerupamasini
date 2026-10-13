import { Color, CubeCamera, CubeTexture, DirectionalLight, HalfFloatType, HemisphereLight, LinearFilter, MathUtils, PMREMGenerator, Scene, Vector3, WebGLCubeRenderTarget, type Texture, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * the near shadow map's half width (m): it covers the ground ahead of the player (FarShadow takes over beyond), so
 * its texels stay small (2048: 3 cm, 1024: 6 cm)
 */
const NEAR_HALF = 32;

/** the ozone layer's optical depth straight up (red, green, blue: Bruneton's absorption over a 15 km column) */
const OZONE_TAU = [0.00975, 0.0282, 0.00128];

/**
 * The sunlight's transmittance through the ozone layer (a shell 25 km up) on its way to the sky the player sees, for
 * a sun `elevation`° up, `column` times the real ozone column, into `out`. The Preetham model leaves ozone out; it is
 * what keeps the sky over a sunset blue (Chappuis absorption takes the orange and green out of the light crossing the
 * layer edge-on) where without it the sky goes teal. Past the horizon the light crosses the layer twice (doubled by
 * 6° down).
 */
export function ozoneTransmittance(elevation: number, column: number, out: Vector3): Vector3 {
  const R = 6371, H = 25;
  const c = Math.cos(MathUtils.degToRad(Math.max(0, elevation))) * R;
  const m = (R + H) / Math.sqrt((R + H) ** 2 - c * c) * (1 + MathUtils.clamp(-elevation / 6, 0, 1));
  return out.set(Math.exp(-OZONE_TAU[0] * column * m), Math.exp(-OZONE_TAU[1] * column * m), Math.exp(-OZONE_TAU[2] * column * m));
}

/**
 * A map's air: the clear-day sky, clouds, sun and fill light. The defaults are the temperate Tokyo Bay day; a
 * subtropical map (漫湖) overrides some of them. Dusk, night and overcast blend from these.
 */
export interface Atmosphere {
  /** Preetham clear-day scattering (dusk and overcast are added on top) */
  rayleigh: number; turbidity: number; mie: number;
  /** dome brightness, and its factor when the sun is high (a near-zenith sun would bleach the dome to cyan-white) */
  skyScale: number; skyScaleHighSun: number;
  /** the dome's saturation by day (toward sunset it goes to the shared `SkyDome.look.saturationDusk`) */
  skySaturation: number;
  /** fair-weather cumulus: cover, density, size (smaller is larger clouds) and the sunlit tops' brightness */
  cloudCoverage: number; cloudDensity: number; cloudScale: number; cloudGain: number;
  /** the cumulus' shading: how dark their thick, shaded bases go (three's 0.45), and how far their colour is taken
   * from the air's reddened tint toward a neutral white-grey (0: none) */
  cloudShadeMin: number; cloudNeutral: number;
  /** clear-day key light colour and a factor on its intensity */
  sunColor: readonly [number, number, number]; sunGain: number;
  /** clear-day hemisphere fill colours and the day fog/horizon colour */
  hemiSky: readonly [number, number, number]; hemiGround: readonly [number, number, number];
  fogDay: readonly [number, number, number];
}
/** (the clear-day sky fitted to photographs of flats at midday, tools/grade/calibrate.mjs: a deeper, more saturated
 * blue than before) */
export const DEFAULT_ATMOSPHERE: Atmosphere = {
  rayleigh: 3, turbidity: 1.8, mie: 0.002, skyScale: 0.27, skyScaleHighSun: 1, skySaturation: 1.4,
  cloudCoverage: 0.5, cloudDensity: 0.7, cloudScale: 0.00025, cloudGain: 1, cloudShadeMin: 0.45, cloudNeutral: 0,
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
  readonly atm: Atmosphere;
  /**
   * The sky toward sunset, fitted to photographs of flats (tools/grade/calibrate.mjs) and shared by every map: the
   * dome's saturation at dusk, the haze it gathers (turbidity and Mie scattering added at dusk), the ozone the
   * sunlight crosses on its way to the sky (times the real column; see `ozoneTransmittance`), and how much of the
   * sunset's warmth the sky light gives the shadows.
   */
  readonly look = { saturationDusk: 1, turbidityDusk: 10, mieDusk: 0.012, ozone: 1.5, ambientDusk: 0.5 };

  constructor(private readonly scene: Scene, private readonly renderer: WebGLRenderer, shadows: boolean, shadowMapSize: number, atmosphere: Partial<Atmosphere> = {}) {
    this.atm = { ...DEFAULT_ATMOSPHERE, ...atmosphere };
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    // the Preetham model comes out far brighter than the ground at any exposure; scale the dome so the sky keeps its
    // blue and the environment maps built from it stop washing the flat out
    const mat = this.sky.material;
    mat.uniforms.uSkyScale = { value: this.atm.skyScale };
    mat.uniforms.uSkySat = { value: this.atm.skySaturation };
    mat.uniforms.uOzone = { value: new Vector3(1, 1, 1) };
    mat.uniforms.uCloudGain = { value: this.atm.cloudGain };
    mat.uniforms.uCloudShadeMin = { value: this.atm.cloudShadeMin };
    mat.uniforms.uCloudNeutral = { value: this.atm.cloudNeutral };
    const CLOUD_SUN = 'vec3 sunColor = vSunE * Fex * 0.22 * 0.04;';
    const CLOUD_SHADE = 'float shade = mix( 0.45, 1.0,';
    const CLOUD_COL = 'cloudColor *= max( dayFactor, 0.03 );';
    const OZONE_AT = 'vec3 L0 = vec3( 0.1 ) * Fex;';
    // (fail loudly if a three upgrade changes the sky shader: the gain or the ozone would silently do nothing)
    for (const line of [CLOUD_SUN, CLOUD_SHADE, CLOUD_COL, OZONE_AT]) if (!mat.fragmentShader.includes(line)) throw new Error(`Sky: line not found in three Sky shader: ${line}`);
    mat.fragmentShader = mat.fragmentShader
      .replace('uniform float mieDirectionalG;', `uniform float mieDirectionalG;
		uniform float uSkyScale;
		uniform float uSkySat;
		uniform vec3 uOzone;
		uniform float uCloudGain;
		uniform float uCloudShadeMin;
		uniform float uCloudNeutral;`)
      .replace(OZONE_AT, `Lin *= uOzone;\n\t\t\t${OZONE_AT}`)
      .replace(CLOUD_SUN, 'vec3 sunColor = vSunE * Fex * 0.22 * 0.04 * uCloudGain;')
      .replace(CLOUD_SHADE, 'float shade = mix( uCloudShadeMin, 1.0,')
      .replace(CLOUD_COL, `${CLOUD_COL}
				cloudColor = mix( cloudColor, vec3( dot( cloudColor, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * vec3( 0.97, 0.99, 1.04 ), uCloudNeutral );`)
      // (more saturated, but not past the spectrum's edge: the reddened sun's disc would go negative in blue)
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( max( mix( vec3( dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) ) ), texColor, uSkySat ), 0.0 ) * uSkyScale, 1.0 );');
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
    cam.left = -NEAR_HALF; cam.right = NEAR_HALF; cam.top = NEAR_HALF; cam.bottom = -NEAR_HALF; cam.near = 1; cam.far = 300;
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

  private readonly shadowCentre = new Vector3();
  private readonly lx = new Vector3();
  private readonly ly = new Vector3();

  /**
   * Update lights and sky for a sun direction (unit vector) and elevation in degrees. Call every frame; cheap.
   * `view`: the camera's forward, which the near shadow map is moved ahead along.
   */
  update(sunDir: Vector3, elevation: number, anchor: Vector3, overcast = 0, view?: Vector3): void {
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
    // the near map: centred a little ahead of the player (what is looked at), and moved in whole texels so that its
    // edges do not crawl as the player walks
    const c = this.shadowCentre.copy(anchor);
    if (view) {
      const h = Math.hypot(view.x, view.z);
      if (h > 1e-3) c.x += (view.x / h) * NEAR_HALF * 0.55, c.z += (view.z / h) * NEAR_HALF * 0.55;
    }
    const lx = this.lx.set(0, 1, 0).cross(lightDir);
    if (lx.lengthSq() < 1e-6) lx.set(1, 0, 0); else lx.normalize();
    const ly = this.ly.copy(lightDir).cross(lx);
    const texel = (2 * NEAR_HALF) / Math.max(1, this.sunLight.shadow.mapSize.x);
    const px = c.dot(lx), py = c.dot(ly);
    c.addScaledVector(lx, Math.round(px / texel) * texel - px).addScaledVector(ly, Math.round(py / texel) * texel - py);
    this.sunLight.position.copy(c).addScaledVector(lightDir, 120);
    this.sunLight.target.position.copy(c);
    // hemisphere: sky colour tracks the horizon tint
    const skyCol = new Color(...atm.hemiSky).lerp(new Color(0.9, 0.62, 0.45), this.look.ambientDusk * dusk).lerp(new Color(0.16, 0.22, 0.34), 1 - day);
    const groundCol = new Color(...atm.hemiGround).lerp(new Color(0.05, 0.05, 0.07), 1 - day);
    this.hemi.color.copy(skyCol);
    this.hemi.groundColor.copy(groundCol);
    this.hemi.intensity = (0.2 + 0.1 * day) * (1 + 0.6 * cloud);
    this.hemi.color.lerp(new Color(0.6, 0.63, 0.66), cloud * 0.7);
    this.fogColor.copy(new Color(...atm.fogDay).lerp(new Color(0.85, 0.6, 0.42), dusk * day)).lerp(new Color(0.06, 0.08, 0.13), 1 - day);
    this.fogColor.lerp(new Color(0.62, 0.66, 0.7), cloud * day * 0.8);
    const look = this.look;
    this.sky.material.uniforms.turbidity.value = atm.turbidity + look.turbidityDusk * dusk + 14 * cloud;
    // (dusk blends back to the default scattering, so sunsets stay as they were)
    this.sky.material.uniforms.rayleigh.value = MathUtils.lerp(atm.rayleigh, DEFAULT_ATMOSPHERE.rayleigh, dusk) - 1.2 * cloud;
    this.sky.material.uniforms.mieCoefficient.value = atm.mie + look.mieDusk * dusk + 0.03 * cloud;
    this.sky.material.uniforms.uSkyScale.value = atm.skyScale * MathUtils.lerp(1, atm.skyScaleHighSun, MathUtils.smoothstep(elevation, 25, 75));
    this.sky.material.uniforms.uSkySat.value = MathUtils.lerp(atm.skySaturation, look.saturationDusk, dusk);
    ozoneTransmittance(elevation, look.ozone, this.sky.material.uniforms.uOzone.value);
    // below the horizon the Preetham model goes black: hide the dome and show the dark fog colour instead
    this.sky.visible = elevation > -7;
  }

  /** The environment maps are built again on the next refresh (the look changed). */
  invalidateEnvironment(): void {
    this.lastEnvElevation = Number.NaN;
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
