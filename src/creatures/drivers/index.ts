import type { Object3D } from 'three';
import type { Driver } from './Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { MahazeDriver } from '../species/mahaze/MahazeDriver';
import { ShrimpDriver } from '../species/shrimp/ShrimpDriver';
import { HamaguriDriver } from '../species/hamaguri/HamaguriDriver';
import { PloverDriver } from '../species/plover/PloverDriver';

export interface DriverEntry {
  create(): Driver;
  /** procedural placeholder model factory when the species has no glTF */
  placeholder?: () => PlaceholderModel;
  /** a representative model for the 図鑑 preview when the driver builds its own geometry */
  preview?: () => Object3D;
}

/** The only place that needs a code change when a species gets a custom driver. */
export const DRIVERS: Record<string, DriverEntry> = {
  mahaze: { create: () => new MahazeDriver() },
  shrimp: { create: () => new ShrimpDriver(), placeholder: () => ShrimpDriver.makeModel(), preview: () => ShrimpDriver.makePreview() },
  hamaguri: { create: () => new HamaguriDriver(), placeholder: () => HamaguriDriver.makeModel(), preview: () => HamaguriDriver.makePreview() },
  plover: { create: () => new PloverDriver(), placeholder: () => PloverDriver.makeModel() },
};
