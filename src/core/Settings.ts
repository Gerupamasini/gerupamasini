import { get, set } from 'idb-keyval';

export type Quality = 'low' | 'mid' | 'high';

export interface SettingsData {
  version: 1;
  quality: Quality;
  mouseSensitivity: number;
  invertY: boolean;
  volume: number;
  heroMaterials: boolean;
}

export const DEFAULT_SETTINGS: SettingsData = {
  version: 1,
  quality: 'mid',
  mouseSensitivity: 1,
  invertY: false,
  volume: 0.8,
  heroMaterials: true,
};

export interface QualityPreset {
  maxDpr: number;
  shadows: boolean;
  shadowMapSize: number;
  post: boolean;
  creatureScale: number;
  lod1Count: number;
  waterNormals: boolean;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { maxDpr: 1, shadows: false, shadowMapSize: 512, post: false, creatureScale: 0.6, lod1Count: 2, waterNormals: true },
  mid: { maxDpr: 1.5, shadows: true, shadowMapSize: 1024, post: false, creatureScale: 1, lod1Count: 4, waterNormals: true },
  high: { maxDpr: 2, shadows: true, shadowMapSize: 2048, post: true, creatureScale: 1, lod1Count: 6, waterNormals: true },
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
