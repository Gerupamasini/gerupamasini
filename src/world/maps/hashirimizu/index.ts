import type { Object3D } from 'three';
import type { Terrain } from '../../Terrain';
import type { MeadowLayout } from '../../amamo/AmamoMeadow';
import type { ClamBedOptions } from '../../ClamField';
import type { SurfParams } from '../../Surf';
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
  /** the ripple marks' turn from 葛西's (radians; their crests run along x there): crests parallel to this shore */
  rippleAngle: number;
  /** the waves breaking on the shore (null: none) */
  surf: SurfParams | null;
  /** the water: its colour in depth (linear) and its turbidity against 葛西's silty water */
  water: { colour: readonly [number, number, number]; turbidity: number };
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
  // no stingray resting marks on this shore
  pits: { clusters: 0, opts: {} },
  landLevel: [2.05, 2.4],
  // the bay mouth's sand: browner and warmer than the 葛西 grey (worn from the Miura hills' rock, with shell grit)
  sandTint: [0.98, 0.9, 0.74],
  // the coast runs along z, so the crests do too
  rippleAngle: Math.PI / 2,
  // the bay mouth's small wind waves and ship wakes: a few tens of centimetres, a few seconds apart
  // (the sea is to +x; a little chop and the wakes of the channel's ships run across it)
  surf: { height: 0.24, period: 3.4, slope: 0.05, seaward: [1, 0], cross: 0.5 },
  // the bay mouth's water: clearer than the silty flat at 葛西 and greener-blue
  water: { colour: [0.07, 0.125, 0.125], turbidity: 0.55 },
  props: buildHashirimizuProps,
};

export const LAYOUTS: Record<string, ShoreLayout> = { hashirimizu: HASHIRIMIZU };
