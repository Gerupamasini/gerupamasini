import { get, set } from 'idb-keyval';

export type Quality = 'minimum' | 'low' | 'mid' | 'high';
export const QUALITY_LABELS: Record<Quality, string> = { minimum: '最低', low: '低', mid: '中', high: '高' };

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
  maxDpr: number;
  shadows: boolean;
  /** 0: no close-up surface detail (grains, burrows, micro relief); 1: full */
  surfaceDetail: number;
  shadowMapSize: number;
  post: boolean;
  hero: boolean;
  samples: number;
  modelTier: 'lod2' | 'lod1' | 'hero';
  tankWaterHz: number;
  creatureScale: number;
  lod1Count: number;
  waterNormals: boolean;
  /** アマモ beds: how many shoots, how far each detail tier reaches, which tiers cast shadows (MEADOW_QUALITY) */
  vegetation: Exclude<Quality, 'minimum'>;
  /** the sea's mirror of the land and sky: its resolution as a fraction of the screen's (0: the sky cube only) */
  mirror: number;
  /** steps of the trace that gives the waves at the waterline their relief (0: the surf drawn on the flat plane) */
  surfSteps: number;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  // (the 3D view renders at most at these device-pixel ratios: on a high-density screen mid draws at 1×, about half
  // the pixels of 1.5×; the water, the sand and the surf are per-pixel work)
  minimum: { maxDpr: 0.75, shadows: false, shadowMapSize: 256, post: false, hero: false, samples: 0, modelTier: 'lod2', tankWaterHz: 0, creatureScale: 0.5, lod1Count: 0, waterNormals: false, surfaceDetail: 0, vegetation: 'low', mirror: 0, surfSteps: 0 },
  low: { maxDpr: 1, shadows: false, shadowMapSize: 512, post: false, hero: false, samples: 0, modelTier: 'lod1', tankWaterHz: 15, creatureScale: 0.6, lod1Count: 2, waterNormals: true, surfaceDetail: 0, vegetation: 'low', mirror: 0, surfSteps: 0 },
  mid: { maxDpr: 1, shadows: true, shadowMapSize: 1024, post: false, hero: true, samples: 2, modelTier: 'hero', tankWaterHz: 30, creatureScale: 1, lod1Count: 4, waterNormals: true, surfaceDetail: 1, vegetation: 'mid', mirror: 0.4, surfSteps: 12 },
  high: { maxDpr: 1.5, shadows: true, shadowMapSize: 2048, post: true, hero: true, samples: 4, modelTier: 'hero', tankWaterHz: 60, creatureScale: 1, lod1Count: 6, waterNormals: true, surfaceDetail: 1, vegetation: 'high', mirror: 0.5, surfSteps: 16 },
};

const KEY = 'settings';

/** Migrate the old single quality setting, and keep corrupt settings from breaking the menu. */
export function normalizeSettings(raw: unknown, defaults: Partial<SettingsData> = {}): SettingsData {
  const s = raw && typeof raw === 'object' ? raw as Partial<SettingsData> : {};
  const validQuality = (q: unknown, fallback: Quality): Quality => typeof q === 'string' && Object.hasOwn(QUALITY_PRESETS, q) ? q as Quality : fallback;
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

export async function loadSettings(defaults: Partial<SettingsData> = {}): Promise<SettingsData> {
  try {
    const s = (await get(KEY)) as Partial<SettingsData> | undefined;
    return normalizeSettings(s, defaults);
  } catch {
    return normalizeSettings(undefined, defaults);
  }
}

export async function saveSettings(s: SettingsData): Promise<void> {
  try {
    await set(KEY, s);
  } catch (e) {
    console.warn('[settings] save failed', e);
  }
}
