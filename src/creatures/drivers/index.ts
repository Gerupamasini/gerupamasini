import type { Object3D, WebGLRenderer } from 'three';
import type { Driver } from './Driver';
import type { PlaceholderModel } from '../models/placeholders';
import type { BodyBuild } from '../physics/contacts';
import { MahazeDriver } from '../species/mahaze/MahazeDriver';
import { ShrimpDriver } from '../species/shrimp/ShrimpDriver';
import { ISOSUJI } from '../species/shrimp/model/isosuji.js';
import { PloverDriver } from '../species/plover/PloverDriver';
import { AsariDriver } from '../asari/Asari.js';
import { AkaeiDriver } from '../species/akaei/AkaeiDriver';
import { FORMS } from '../asari/AsariModel.js';
import { PagurusMinutusDriver } from '../yubinagahonyadokari/PagurusMinutusDriver';
import { OysterDriver } from '../oyster/OysterDriver';
import { CrabDriver, HermitDriver } from '../species/shore/crawlers';
import { WormDriver } from '../species/shore/others';
import { HakuDriver } from '../species/haku/HakuDriver';
import { AmimehagiDriver } from '../species/amimehagi/AmimehagiDriver';
import { YoujiuoDriver } from '../species/youjiuo/YoujiuoDriver';
import { AramushiroDriver } from '../species/aramushiro/AramushiroDriver';
import { IshigareiDriver } from '../species/ishigarei/IshigareiDriver';
import { MimiikaDriver } from '../species/mimiika/MimiikaDriver';

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
  /**
   * A model of the species in every tier it is drawn in, built once per flat into `parent` and never drawn: its
   * materials keep the species' shader programs alive (three drops a program with the last material that used it, so
   * without this the programs would be compiled again, synchronously, whenever the species came back into view) and
   * the loading screen compiles them ahead (CreatureSystem.keptModels, FieldRenderer.compileKept).
   */
  keep?: (parent: Object3D) => { dispose(): void };
  /** the body's build for the contacts between animals (physics/contacts.ts), in shares of its length */
  body?: BodyBuild;
}

// the bodies the animals push each other aside with (physics/contacts.ts): in shares of the individual's length
/** a palaemonid: the body with its walking legs spread (not the rostrum and the long antennae) */
const SHRIMP_BODY: BodyBuild = { width: 0.22, height: 0.18, core: 0.8 };
/** a clam: the shell lying on a valve; never pushed */
const CLAM_BODY: BodyBuild = { width: 0.8, height: 0.45, fixed: true };

/** The only place that needs a code change when a species gets a custom driver. */
export const DRIVERS: Record<string, DriverEntry> = {
  mahaze: { create: () => new MahazeDriver(), body: { width: 0.17, height: 0.15, core: 0.85, ahead: 0.07 } },
  shrimp: { create: () => new ShrimpDriver(), placeholder: () => ShrimpDriver.makeModel(), preview: () => ShrimpDriver.makePreview(), body: SHRIMP_BODY },
  // イソスジエビ: the same shrimp rig and locomotion with its species profile (shape, stripes, kinematics)
  isosuji: { create: () => new ShrimpDriver(ISOSUJI), placeholder: () => ShrimpDriver.makeModel(), preview: () => ShrimpDriver.makePreview(ISOSUJI), body: SHRIMP_BODY },
  plover: { create: () => new PloverDriver(), placeholder: () => PloverDriver.makeModel(), body: { width: 0.35, height: 0.7, core: 0.6 } },
  asari: { create: () => new AsariDriver() as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: (seed) => AsariDriver.makePreview(FORMS.asari, seed), body: CLAM_BODY },
  hamaguri: { create: () => new AsariDriver(FORMS.hamaguri) as unknown as Driver, placeholder: () => AsariDriver.makeModel(), preview: (seed) => AsariDriver.makePreview(FORMS.hamaguri, seed), body: CLAM_BODY },
  pagurus: { create: () => new PagurusMinutusDriver(), placeholder: () => PagurusMinutusDriver.makeModel(), nearDistance: 4.5, body: { width: 0.6, height: 0.5, core: 0.9 } },
  oyster: { create: () => new OysterDriver(), placeholder: () => OysterDriver.makeModel(), preview: (seed, renderer) => OysterDriver.makePreview(seed, renderer), body: { width: 0.6, height: 0.3, fixed: true } },
  // the 走水 shore: procedural models built per individual by the drivers
  crab: { create: () => new CrabDriver(), placeholder: () => CrabDriver.makeModel(), preview: (seed) => CrabDriver.makePreview(seed), body: { width: 1.3, height: 0.45, core: 0.9 } },
  hermit: { create: () => new HermitDriver(), placeholder: () => HermitDriver.makeModel(), preview: (seed) => HermitDriver.makePreview(seed), body: { width: 0.6, height: 0.55 } },
  worm: { create: () => new WormDriver(), placeholder: () => WormDriver.makeModel(), preview: (seed) => WormDriver.makePreview(seed), body: { width: 0.06, height: 0.05 } },
  // ハク: the schooling juvenile mullet (its own tiers in the placeholder view; near within 5 m)
  haku: { create: () => new HakuDriver(), placeholder: () => HakuDriver.makeModel(), preview: () => HakuDriver.makePreview(), nearDistance: 5, body: { width: 0.15, height: 0.18, core: 0.85, ahead: -0.05, flock: 'haku' } },
  // アミメハギ: the small filefish of the eelgrass (its own tiers in the placeholder view; near within 4 m)
  amimehagi: { create: () => new AmimehagiDriver(), placeholder: () => AmimehagiDriver.makeModel(), preview: (seed) => AmimehagiDriver.makePreview(seed), nearDistance: 4, body: { width: 0.14, height: 0.5, core: 0.75 } },
  // ヨウジウオ: the pipefish of the eelgrass (its own tiers in the placeholder view; near within 6 m)
  youjiuo: { create: () => new YoujiuoDriver(), placeholder: () => YoujiuoDriver.makeModel(), preview: (seed) => YoujiuoDriver.makePreview(seed), nearDistance: 6, body: { width: 0.04, height: 0.05, core: 0.95, ahead: -0.16 } },
  // アラムシロ: the carrion snail of the sand (its own tiers in the placeholder view; near within 3 m)
  aramushiro: { create: () => new AramushiroDriver(), placeholder: () => AramushiroDriver.makeModel(), preview: (seed) => AramushiroDriver.makePreview(seed), nearDistance: 3, keep: (parent) => AramushiroDriver.keep(parent), body: { width: 0.7, height: 0.7, core: 1.1 } },
  // イシガレイ: the juvenile flounder of the sandy flats (its own tiers in the placeholder view; near within 3 m)
  ishigarei: { create: () => new IshigareiDriver(), placeholder: () => IshigareiDriver.makeModel(), preview: (seed) => IshigareiDriver.makePreview(seed), nearDistance: 3, keep: (parent) => IshigareiDriver.keep(parent), body: { width: 0.45, height: 0.08, core: 0.85, ahead: -0.14 } },
  // アカエイ: the ray of the shallow sand (its own tiers in the placeholder view; its wave runs every frame within 10 m)
  // ミミイカ: the bobtail squid of the sandy shallows (its own tiers in the placeholder view; near within 2.5 m)
  mimiika: { create: () => new MimiikaDriver(), placeholder: () => MimiikaDriver.makeModel(), preview: (seed) => MimiikaDriver.makePreview(seed), nearDistance: 2.5, keep: (parent) => MimiikaDriver.keep(parent), body: { width: 0.75, height: 0.7, core: 1.4, ahead: 0.1 } },
  akaei: { create: () => new AkaeiDriver(), placeholder: () => AkaeiDriver.makeModel(), preview: (seed) => AkaeiDriver.makePreview(seed), nearDistance: 10, keep: (parent) => AkaeiDriver.keep(parent), body: { width: 0.41, height: 0.07, core: 0.38 } },
};
