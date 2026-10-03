import type { Object3D } from 'three';
import type { Driver } from './Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { MahazeDriver } from '../species/mahaze/MahazeDriver';
import { ShrimpDriver } from '../species/shrimp/ShrimpDriver';
import { PloverDriver } from '../species/plover/PloverDriver';
import { AsariDriver } from '../asari/Asari.js';
import { TobihazeDriver } from '../species/tobihaze/TobihazeDriver';

export interface DriverEntry {
  create(): Driver;
  /** procedural placeholder model factory when the species has no glTF */
  placeholder?: () => PlaceholderModel;
  /** a representative model for the 図鑑 preview when the driver builds its own geometry */
  preview?: () => Object3D;
  /** the driver dresses its models in its own materials (the observation hero materials are not applied) */
  ownMaterials?: boolean;
}

/** The only place that needs a code change when a species gets a custom driver. */
export const DRIVERS: Record<string, DriverEntry> = {
  mahaze: { create: () => new MahazeDriver() },
  shrimp: { create: () => new ShrimpDriver(), placeholder: () => ShrimpDriver.makeModel(), preview: () => ShrimpDriver.makePreview() },
  plover: { create: () => new PloverDriver(), placeholder: () => PloverDriver.makeModel() },
  asari: { create: () => new AsariDriver() as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: () => AsariDriver.makePreview() },
  tobihaze: { create: () => new TobihazeDriver(), ownMaterials: true },
};
