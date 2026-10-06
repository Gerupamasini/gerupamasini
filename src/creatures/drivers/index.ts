import type { Object3D } from 'three';
import type { Driver } from './Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { MahazeDriver } from '../species/mahaze/MahazeDriver';
import { ShrimpDriver } from '../species/shrimp/ShrimpDriver';
import { PloverDriver } from '../species/plover/PloverDriver';
import { AsariDriver } from '../asari/Asari.js';
import { FORMS } from '../asari/AsariModel.js';
import { CrabDriver, HermitDriver, SnailDriver } from '../species/shore/crawlers';
import { MulletDriver, OysterDriver, WormDriver } from '../species/shore/others';

export interface DriverEntry {
  create(): Driver;
  /** procedural placeholder model factory when the species has no glTF */
  placeholder?: () => PlaceholderModel;
  /** a representative model for the 図鑑 preview (and the scoop) when the driver builds its own geometry; `seed` in [0, 1) picks the individual's pattern */
  preview?: (seed?: number) => Object3D;
}

/** The only place that needs a code change when a species gets a custom driver. */
export const DRIVERS: Record<string, DriverEntry> = {
  mahaze: { create: () => new MahazeDriver() },
  shrimp: { create: () => new ShrimpDriver(), placeholder: () => ShrimpDriver.makeModel(), preview: () => ShrimpDriver.makePreview() },
  plover: { create: () => new PloverDriver(), placeholder: () => PloverDriver.makeModel() },
  asari: { create: () => new AsariDriver() as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: (seed) => AsariDriver.makePreview(FORMS.asari, seed) },
  hamaguri: { create: () => new AsariDriver(FORMS.hamaguri) as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: (seed) => AsariDriver.makePreview(FORMS.hamaguri, seed) },
  // the 走水 shore: procedural models built per individual by the drivers
  crab: { create: () => new CrabDriver(), placeholder: () => CrabDriver.makeModel(), preview: (seed) => CrabDriver.makePreview(seed) },
  hermit: { create: () => new HermitDriver(), placeholder: () => HermitDriver.makeModel(), preview: (seed) => HermitDriver.makePreview(seed) },
  snail: { create: () => new SnailDriver(), placeholder: () => SnailDriver.makeModel(), preview: (seed) => SnailDriver.makePreview(seed) },
  mullet: { create: () => new MulletDriver(), placeholder: () => MulletDriver.makeModel(), preview: () => MulletDriver.makePreview() },
  worm: { create: () => new WormDriver(), placeholder: () => WormDriver.makeModel(), preview: (seed) => WormDriver.makePreview(seed) },
  oyster: { create: () => new OysterDriver(), placeholder: () => OysterDriver.makeModel(), preview: (seed) => OysterDriver.makePreview(seed) },
};
