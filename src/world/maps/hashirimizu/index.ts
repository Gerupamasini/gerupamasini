import type { Object3D } from 'three';
import type { Terrain } from '../../Terrain';
import type { MeadowLayout } from '../../amamo/AmamoMeadow';
import type { ClamBedOptions } from '../../ClamField';
import { buildHashirimizuProps } from './props';
import { eelgrassField, eelgrassZone, offshore } from './shape';

export * as shape from './shape';

/** What a map with its own shore brings to the world (see World.create and App.enterField). */
export interface ShoreLayout {
  /** where the eelgrass goes */
  meadow: MeadowLayout;
  /** the clam ground */
  clams: { beds: number; opts: ClamBedOptions };
  /** the stingray feeding pits: how many clusters, and where */
  pits: { clusters: number; opts: { ok?(x: number, z: number): boolean; perCluster?: readonly [number, number]; spread?: number; margin?: number } };
  /** heights over which the ground becomes grass (terrain shader) */
  landLevel: readonly [number, number];
  /** the sand's colour against the 葛西 grey (terrain shader) */
  sandTint: readonly [number, number, number];
  /** the shore's own scenery standing on the terrain */
  props(terrain: Terrain, seed: number): Object3D[];
}

/** 走水: the clam flat between 5 and 12.5 m, eelgrass from 12 m out. */
export const HASHIRIMIZU: ShoreLayout = {
  meadow: { suitability: eelgrassZone, field: eelgrassField, thresholds: [0.6, 0.5, 0.44], step: 1.3, holes: false },
  clams: {
    beds: 18,
    opts: {
      ok: (x, z) => { const d = offshore(x); return d > 4.5 && d < 12.5 && Math.abs(z) < 38; },
      radius: [1.1, 2.4], perM2: [2.6, 4.6], margin: 3,
    },
  },
  pits: {
    clusters: 7,
    // on the open sand among the eelgrass and at the outer edge of the clam flat
    opts: { ok: (x, z) => { const d = offshore(x); return d > 9 && d < 26 && Math.abs(z) < 37 && eelgrassField(x, z) < 0.35; }, perCluster: [1, 3], spread: 3.5, margin: 6 },
  },
  landLevel: [2.05, 2.4],
  // the darker, browner sand of the bay mouth (worn from the Miura hills' rock, with shell grit)
  sandTint: [0.74, 0.69, 0.6],
  props: buildHashirimizuProps,
};

export const LAYOUTS: Record<string, ShoreLayout> = { hashirimizu: HASHIRIMIZU };
