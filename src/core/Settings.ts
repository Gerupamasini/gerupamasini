import { get, set } from 'idb-keyval';

export type Quality = 'low' | 'mid' | 'high';

export interface SettingsData {
  version: 1;
  quality: Quality;
  mouseSensitivity: number;
  invertY: boolean;
  volume: number;
  heroMaterials: boolean;
  /** standing eye height in metres */
  eyeHeight: number;
}

export const DEFAULT_SETTINGS: SettingsData = {
  version: 1,
  quality: 'mid',
  mouseSensitivity: 1,
  invertY: false,
  volume: 0.8,
  heroMaterials: true,
  eyeHeight: 1.5,
};

export interface QualityPreset {
  maxDpr: number;
  shadows: boolean;
  /** 0: no close-up surface detail (grains, burrows, micro relief); 1: full */
  surfaceDetail: number;
  shadowMapSize: number;
  post: boolean;
  creatureScale: number;
  lod1Count: number;
  waterNormals: boolean;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { maxDpr: 1, shadows: false, shadowMapSize: 512, post: false, creatureScale: 0.6, lod1Count: 2, waterNormals: true, surfaceDetail: 0 },
  mid: { maxDpr: 1.5, shadows: true, shadowMapSize: 1024, post: false, creatureScale: 1, lod1Count: 4, waterNormals: true, surfaceDetail: 1 },
  high: { maxDpr: 2, shadows: true, shadowMapSize: 2048, post: true, creatureScale: 1, lod1Count: 6, waterNormals: true, surfaceDetail: 1 },
};

const KEY = 'settings';

export async function loadSettings(): Promise<SettingsData> {
  try {
    const s = (await get(KEY)) as Partial<SettingsData> | undefined;
    return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: SettingsData): Promise<void> {
  try {
    await set(KEY, s);
  } catch (e) {
    console.warn('[settings] save failed', e);
  }
}
