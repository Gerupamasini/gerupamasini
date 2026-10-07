import type { Object3D } from 'three';
import type { Driver } from './Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { MahazeDriver } from '../species/mahaze/MahazeDriver';
import { ShrimpDriver } from '../species/shrimp/ShrimpDriver';
import { PloverDriver } from '../species/plover/PloverDriver';
import { AsariDriver } from '../asari/Asari.js';
import { AkaeiDriver } from '../species/akaei/AkaeiDriver';
import { FORMS } from '../asari/AsariModel.js';

export interface DriverEntry {
  create(): Driver;
  /** procedural placeholder model factory when the species has no glTF */
  placeholder?: () => PlaceholderModel;
  /** a representative model for the 図鑑 preview (and the scoop) when the driver builds its own geometry; `seed` in [0, 1) picks the individual's pattern */
  preview?: (seed?: number) => Object3D;
  /** the driver animates continuously (a swimming wave): within the near distance update it every frame, like a lod1 model */
  smoothNear?: boolean;
}

/** The only place that needs a code change when a species gets a custom driver. */
export const DRIVERS: Record<string, DriverEntry> = {
  mahaze: { create: () => new MahazeDriver() },
  shrimp: { create: () => new ShrimpDriver(), placeholder: () => ShrimpDriver.makeModel(), preview: () => ShrimpDriver.makePreview() },
  plover: { create: () => new PloverDriver(), placeholder: () => PloverDriver.makeModel() },
  asari: { create: () => new AsariDriver() as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: (seed) => AsariDriver.makePreview(FORMS.asari, seed) },
  hamaguri: { create: () => new AsariDriver(FORMS.hamaguri) as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: (seed) => AsariDriver.makePreview(FORMS.hamaguri, seed) },
  akaei: { create: () => new AkaeiDriver(), placeholder: () => AkaeiDriver.makeModel(), preview: (seed) => AkaeiDriver.makePreview(seed), smoothNear: true },
};
