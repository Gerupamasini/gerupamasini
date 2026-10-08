import type { Object3D, WebGLRenderer } from 'three';
import type { Driver } from './Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { MahazeDriver } from '../species/mahaze/MahazeDriver';
import { ShrimpDriver } from '../species/shrimp/ShrimpDriver';
import { ISOSUJI } from '../species/shrimp/model/isosuji.js';
import { PloverDriver } from '../species/plover/PloverDriver';
import { AsariDriver } from '../asari/Asari.js';
import { FORMS } from '../asari/AsariModel.js';
import { PagurusMinutusDriver } from '../yubinagahonyadokari/PagurusMinutusDriver';
import { OysterDriver } from '../oyster/OysterDriver';
import { CrabDriver, HermitDriver, SnailDriver } from '../species/shore/crawlers';
import { WormDriver } from '../species/shore/others';
import { HakuDriver } from '../species/haku/HakuDriver';
import { AmimehagiDriver } from '../species/amimehagi/AmimehagiDriver';
import { YoujiuoDriver } from '../species/youjiuo/YoujiuoDriver';

export interface DriverEntry {
  create(): Driver;
  /** procedural placeholder model factory when the species has no glTF */
  placeholder?: () => PlaceholderModel;
  /** a representative model for the 図鑑 preview (and the scoop) when the driver builds its own geometry; `seed` in [0, 1) picks the individual's pattern */
  preview?: (seed?: number, renderer?: WebGLRenderer) => Object3D;
  /**
   * Procedural models with their own LOD: within this distance (m) the individual counts as near (lod 1:
   * driver updated every frame, brain at the near rate) although it uses the placeholder tier.
   */
  nearDistance?: number;
}

/** The only place that needs a code change when a species gets a custom driver. */
export const DRIVERS: Record<string, DriverEntry> = {
  mahaze: { create: () => new MahazeDriver() },
  shrimp: { create: () => new ShrimpDriver(), placeholder: () => ShrimpDriver.makeModel(), preview: () => ShrimpDriver.makePreview() },
  // イソスジエビ: the same shrimp rig and locomotion with its species profile (shape, stripes, kinematics)
  isosuji: { create: () => new ShrimpDriver(ISOSUJI), placeholder: () => ShrimpDriver.makeModel(), preview: () => ShrimpDriver.makePreview(ISOSUJI) },
  plover: { create: () => new PloverDriver(), placeholder: () => PloverDriver.makeModel() },
  asari: { create: () => new AsariDriver() as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: (seed) => AsariDriver.makePreview(FORMS.asari, seed) },
  hamaguri: { create: () => new AsariDriver(FORMS.hamaguri) as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: (seed) => AsariDriver.makePreview(FORMS.hamaguri, seed) },
  pagurus: { create: () => new PagurusMinutusDriver(), placeholder: () => PagurusMinutusDriver.makeModel(), nearDistance: 4.5 },
  oyster: { create: () => new OysterDriver(), placeholder: () => OysterDriver.makeModel(), preview: (seed, renderer) => OysterDriver.makePreview(seed, renderer) },
  // the 走水 shore: procedural models built per individual by the drivers
  crab: { create: () => new CrabDriver(), placeholder: () => CrabDriver.makeModel(), preview: (seed) => CrabDriver.makePreview(seed) },
  hermit: { create: () => new HermitDriver(), placeholder: () => HermitDriver.makeModel(), preview: (seed) => HermitDriver.makePreview(seed) },
  snail: { create: () => new SnailDriver(), placeholder: () => SnailDriver.makeModel(), preview: (seed) => SnailDriver.makePreview(seed) },
  worm: { create: () => new WormDriver(), placeholder: () => WormDriver.makeModel(), preview: (seed) => WormDriver.makePreview(seed) },
  // ハク: the schooling juvenile mullet (its own tiers in the placeholder view; near within 5 m)
  haku: { create: () => new HakuDriver(), placeholder: () => HakuDriver.makeModel(), preview: () => HakuDriver.makePreview(), nearDistance: 5 },
  // アミメハギ: the small filefish of the eelgrass (its own tiers in the placeholder view; near within 4 m)
  amimehagi: { create: () => new AmimehagiDriver(), placeholder: () => AmimehagiDriver.makeModel(), preview: (seed) => AmimehagiDriver.makePreview(seed), nearDistance: 4 },
  // ヨウジウオ: the pipefish of the eelgrass (its own tiers in the placeholder view; near within 6 m)
  youjiuo: { create: () => new YoujiuoDriver(), placeholder: () => YoujiuoDriver.makeModel(), preview: (seed) => YoujiuoDriver.makePreview(seed), nearDistance: 6 },
};
