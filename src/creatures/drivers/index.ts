import type { Object3D } from 'three';
import type { Driver } from './Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { MahazeDriver } from '../species/mahaze/MahazeDriver';
import { ShrimpDriver } from '../species/shrimp/ShrimpDriver';
import { PloverDriver } from '../species/plover/PloverDriver';
import { AsariDriver } from '../asari/Asari.js';
import { HakuDriver } from '../species/haku/HakuDriver';

export interface DriverEntry {
  create(): Driver;
  /** procedural placeholder model factory when the species has no glTF */
  placeholder?: () => PlaceholderModel;
  /** a representative model for the 図鑑 preview when the driver builds its own geometry */
  preview?: () => Object3D;
  /**
   * for a species that draws its own tiers in the placeholder view: within this camera distance (m) it counts as near
   * (driver updated every frame, brain at the near rate) instead of every other frame
   */
  nearLod_m?: number;
}

/** The only place that needs a code change when a species gets a custom driver. */
export const DRIVERS: Record<string, DriverEntry> = {
  mahaze: { create: () => new MahazeDriver() },
  shrimp: { create: () => new ShrimpDriver(), placeholder: () => ShrimpDriver.makeModel(), preview: () => ShrimpDriver.makePreview() },
  plover: { create: () => new PloverDriver(), placeholder: () => PloverDriver.makeModel() },
  asari: { create: () => new AsariDriver() as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: () => AsariDriver.makePreview() },
  haku: { create: () => new HakuDriver(), placeholder: () => HakuDriver.makeModel(), preview: () => HakuDriver.makePreview(), nearLod_m: 5 },
};
