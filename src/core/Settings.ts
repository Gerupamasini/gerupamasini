import { get, set } from 'idb-keyval';

export type Quality = 'minimal' | 'low' | 'mid' | 'high';
export const QUALITY_ORDER: Quality[] = ['minimal', 'low', 'mid', 'high'];
export const QUALITY_LABELS: Record<Quality, string> = { minimal: '超軽量', low: '低', mid: '中', high: '高' };

export interface SettingsData {
  version: 1;
  quality: Quality;
  homeQuality: Quality;
  fieldQuality: Quality;
  mouseSensitivity: number;
  invertY: boolean;
  volume: number;
  heroMaterials: boolean;
  /** standing eye height in metres */
  eyeHeight: number;
  /** polarised sunglasses: the water's glare cut, the bottom in view (G toggles) */
  sunglasses: boolean;
}

export const DEFAULT_SETTINGS: SettingsData = {
  version: 1,
  quality: 'mid',
  homeQuality: 'mid',
  fieldQuality: 'mid',
  mouseSensitivity: 1,
  invertY: false,
  volume: 0.8,
  heroMaterials: true,
  eyeHeight: 1.5,
  sunglasses: true,
};

export interface QualityPreset {
  /** the drawing buffer's pixels per CSS pixel, at most (the device's ratio when lower) */
  maxDpr: number;
  /** the drawing buffer's pixels, at most: a big or dense panel is drawn smaller and scaled up by the browser */
  maxPixels: number;
  shadows: boolean;
  /** 0: no close-up surface detail (grains, burrows, micro relief); 1: full */
  surfaceDetail: number;
  shadowMapSize: number;
  post: boolean;
  modelTier: 'lod2' | 'lod1' | 'hero';
  tankWaterHz: number;
  creatureScale: number;
  lod1Count: number;
  /** アマモ beds: how many shoots, how far each detail tier reaches, which tiers cast shadows (MEADOW_QUALITY) */
  vegetation: Quality;
  /** the sea's mirror of the land and sky: its resolution as a fraction of the screen's (0: the sky cube only) */
  mirror: number;
  /** steps of the trace that gives the waves at the waterline their relief (0: the surf drawn on the flat plane) */
  surfSteps: number;
  /** multisampling of the field's HDR buffer and the hero buffer (0: none; the canvas itself is made without it too,
   * from the next load on) */
  msaa: number;
  /** the water's shader: 'lite' keeps every other wave train and drops the foam's warp, the noise rim, the bubbles and the flecks */
  water: 'lite' | 'full';
  /** scale of the distances within which animals are drawn (never under 8 m; the birds keep their reach) and given
   * their detailed tiers */
  viewScale: number;
  /** the small fishes' contact shadows on the bed */
  contactShadows: boolean;
  /** the 葛西 reef's oysters at most */
  oysters: number;
  /** the home tank's water: 'lite' caps the ripples' catch-up at two steps a frame, redraws the caustics every
   * other frame and takes half the steps through the light shafts */
  tankWater: 'lite' | 'full';
  /** whether the hero (volumetric) materials may be used at all (the setting is still the player's) */
  hero: boolean;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  // (the 3D view renders at most at these device-pixel ratios: on a high-density screen mid draws at 1×, about half
  // the pixels of 1.5×; the water, the sand and the surf are per-pixel work)
  minimal: { maxDpr: 0.67, maxPixels: 0.9e6, shadows: false, shadowMapSize: 512, post: false, creatureScale: 0.35, lod1Count: 0, surfaceDetail: 0, vegetation: 'minimal', mirror: 0, surfSteps: 0, msaa: 0, water: 'lite', viewScale: 0.6, contactShadows: false, oysters: 2000, tankWater: 'lite', hero: false, modelTier: 'lod2', tankWaterHz: 30 },
  low: { maxDpr: 1, maxPixels: 1.6e6, shadows: false, shadowMapSize: 512, post: false, creatureScale: 0.6, lod1Count: 2, surfaceDetail: 0, vegetation: 'low', mirror: 0, surfSteps: 0, msaa: 0, water: 'full', viewScale: 0.85, contactShadows: true, oysters: 5000, tankWater: 'full', hero: true, modelTier: 'lod1', tankWaterHz: 30 },
  mid: { maxDpr: 1, maxPixels: 3.0e6, shadows: true, shadowMapSize: 1024, post: false, creatureScale: 1, lod1Count: 4, surfaceDetail: 1, vegetation: 'mid', mirror: 0.4, surfSteps: 12, msaa: 4, water: 'full', viewScale: 1, contactShadows: true, oysters: 12000, tankWater: 'full', hero: true, modelTier: 'hero', tankWaterHz: 60 },
  high: { maxDpr: 1.5, maxPixels: 6.0e6, shadows: true, shadowMapSize: 2048, post: true, creatureScale: 1, lod1Count: 6, surfaceDetail: 1, vegetation: 'high', mirror: 0.5, surfSteps: 16, msaa: 4, water: 'full', viewScale: 1, contactShadows: true, oysters: 12000, tankWater: 'full', hero: true, modelTier: 'hero', tankWaterHz: 60 },
};

const KEY = 'settings';

/** Migrate the old single quality setting, and keep corrupt settings from breaking the menu. */
export function normalizeSettings(raw: unknown, defaults: Partial<SettingsData> = {}): SettingsData {
  const s = raw && typeof raw === 'object' ? raw as Partial<SettingsData> : {};
  const validQuality = (q: unknown, fallback: Quality): Quality => q === 'minimum' ? 'minimal' : typeof q === 'string' && Object.hasOwn(QUALITY_PRESETS, q) ? q as Quality : fallback;
  const base = validQuality(defaults.quality, DEFAULT_SETTINGS.quality);
  const legacy = validQuality(s.quality, base);
  const bounded = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    version: 1, quality: legacy,
    homeQuality: validQuality(s.homeQuality, validQuality(defaults.homeQuality, legacy)),
    fieldQuality: validQuality(s.fieldQuality, validQuality(defaults.fieldQuality, legacy)),
    mouseSensitivity: bounded(s.mouseSensitivity, DEFAULT_SETTINGS.mouseSensitivity, 0.3, 10),
    eyeHeight: bounded(s.eyeHeight, DEFAULT_SETTINGS.eyeHeight, 1.1, 1.9),
    volume: bounded(s.volume, DEFAULT_SETTINGS.volume, 0, 1),
    invertY: typeof s.invertY === 'boolean' ? s.invertY : DEFAULT_SETTINGS.invertY,
    heroMaterials: typeof s.heroMaterials === 'boolean' ? s.heroMaterials : DEFAULT_SETTINGS.heroMaterials,
    sunglasses: typeof s.sunglasses === 'boolean' ? s.sunglasses : DEFAULT_SETTINGS.sunglasses,
  };
}

export async function loadSettings(defaults: Partial<SettingsData> = {}, firstRun?: () => Partial<SettingsData>): Promise<SettingsData> {
  try {
    const s = (await get(KEY)) as Partial<SettingsData> | undefined;
    const out = normalizeSettings(s ?? firstRun?.(), defaults);
    mirrorQuality(out);
    return out;
  } catch {
    return normalizeSettings(firstRun?.(), defaults);
  }
}

export async function saveSettings(s: SettingsData): Promise<void> {
  mirrorQuality(s);
  try {
    await set(KEY, s);
  } catch (e) {
    console.warn('[settings] save failed', e);
  }
}

const QUALITY_MIRROR = 'higata.quality';

/** The quality is mirrored synchronously (localStorage) for what must be decided before the saved settings arrive:
 * the canvas's own context attributes, fixed at creation. */
function mirrorQuality(s: SettingsData): void {
  // One canvas serves both scenes. A scene with no MSAA must not inherit canvas MSAA from the other scene.
  const q = QUALITY_ORDER[Math.min(QUALITY_ORDER.indexOf(s.homeQuality), QUALITY_ORDER.indexOf(s.fieldQuality))];
  try { localStorage.setItem(QUALITY_MIRROR, q); } catch { /* private mode: the renderer takes the default */ }
}

/** The quality saved on the last run, as far as the mirror knows (the default when there is none). */
export function savedQualityHint(): Quality {
  try {
    const q = localStorage.getItem(QUALITY_MIRROR);
    if (q === 'minimum') return 'minimal';
    if (q && Object.hasOwn(QUALITY_PRESETS, q)) return q as Quality;
  } catch { /* no storage */ }
  return DEFAULT_SETTINGS.quality;
}
