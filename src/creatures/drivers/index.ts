import type { Driver } from './Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { MahazeDriver } from '../species/mahaze/MahazeDriver';
import { ShrimpDriver } from '../species/shrimp/ShrimpDriver';
import { PloverDriver } from '../species/plover/PloverDriver';
import { PagurusMinutusDriver } from '../yubinagahonyadokari/PagurusMinutusDriver';

export interface DriverEntry {
  create(): Driver;
  /** procedural placeholder model factory when the species has no glTF */
  placeholder?: () => PlaceholderModel;
  /**
   * Procedural models with their own LOD: within this distance (m) the individual counts as near (lod 1:
   * driver updated every frame, brain at the near rate) although it uses the placeholder tier.
   */
  nearDistance?: number;
}

/** The only place that needs a code change when a species gets a custom driver. */
export const DRIVERS: Record<string, DriverEntry> = {
  mahaze: { create: () => new MahazeDriver() },
  shrimp: { create: () => new ShrimpDriver(), placeholder: () => ShrimpDriver.makeModel() },
  plover: { create: () => new PloverDriver(), placeholder: () => PloverDriver.makeModel() },
  pagurus: { create: () => new PagurusMinutusDriver(), placeholder: () => PagurusMinutusDriver.makeModel(), nearDistance: 4.5 },
};
