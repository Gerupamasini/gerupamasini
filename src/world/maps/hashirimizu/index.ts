import type { Object3D } from 'three';
import type { Terrain } from '../../Terrain';
import type { MeadowLayout } from '../../amamo/AmamoMeadow';
import type { ClamBedOptions } from '../../ClamField';
import type { SurfParams } from '../../Surf';
import { buildHashirimizuProps } from './props';
import { eelgrassField, eelgrassZone, offshore } from './shape';
import { inThicket } from '../manko/shape';
import { backdropCrowns } from '../manko/land';
import type { BackdropCrown } from '../../mangrove/MangroveForest';
import type { Atmosphere } from '../../Sky';

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
  /** the mud's colour against the 葛西 grey (terrain shader); absent: unchanged */
  mudTint?: readonly [number, number, number];
  /** the ripple marks' turn from 葛西's (radians; their crests run along x there): crests parallel to this shore */
  rippleAngle: number;
  /** the waves breaking on the shore (null: none) */
  surf: SurfParams | null;
  /** the water: its colour in depth (linear) and its turbidity against 葛西's silty water */
  water: {
    colour: readonly [number, number, number]; turbidity: number;
    /** a milky body: the share of sun and sky light the suspended fines send back up (linear; absent: none) */
    scatter?: readonly [number, number, number];
    /** factor on the Fresnel reflection (absent: 1) and how broken it is, 0..1 (absent: 0) */
    reflect?: number; rough?: number;
  };
  /** the map's air: sky, clouds, sun and fill light (absent: the temperate Tokyo Bay day) */
  atmosphere?: Partial<Atmosphere>;
  /** mangrove foliage colour against the default (absent: unchanged) */
  mangroveLeafTint?: readonly [number, number, number];
  /** distant mangrove crowns drawn with the trees' own foliage (absent: none) */
  mangroveBackdrop?(): BackdropCrown[];
  /** ground the player cannot enter inside the walkable bounds (absent: none) */
  blocked?(x: number, z: number): boolean;
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

const MANKO: ShoreLayout = {
  meadow: { suitability: () => 0, field: () => 0, holes: false },
  clams: { beds: 0, opts: {} }, pits: { clusters: 0, opts: {} },
  // Manko's estuary silt (user photos): warm greige-khaki, not 葛西's neutral grey; darker and browner when wet.
  landLevel: [3, 4], sandTint: [1.08, 0.98, 0.8], mudTint: [1.42, 1.22, 0.92], rippleAngle: 0.4,
  // the lake's opaque, milky jade water (user's photo): lit from within by the suspended fines, a soft broken
  // reflection; a dim jade residual at dusk and night
  surf: null, water: { colour: [0.03, 0.06, 0.045], turbidity: 2.4, scatter: [0.084, 0.19, 0.0925], reflect: 0.3, rough: 0.6 },
  // subtropical air: a deep blue sky that the high sun does not bleach, bright cumulus, a strong warm sun
  atmosphere: {
    rayleigh: 1.7, turbidity: 1.8, mie: 0.0015, skyScale: 0.3, skyScaleHighSun: 0.55,
    cloudCoverage: 0.42, cloudDensity: 0.9, cloudScale: 0.0003, cloudGain: 2.5,
    sunColor: [1, 0.95, 0.86], sunGain: 1.08, hemiSky: [0.5, 0.66, 0.88], hemiGround: [0.26, 0.26, 0.18], fogDay: [0.55, 0.74, 0.98],
  },
  props: () => [],
  // the dense mangrove forest beyond its front rows
  blocked: inThicket,
  mangroveBackdrop: backdropCrowns,
  // sun-flushed subtropical canopy: brighter, yellower green (user's photo)
  mangroveLeafTint: [1.4, 1.28, 0.85],
};

export const LAYOUTS: Record<string, ShoreLayout> = { hashirimizu: HASHIRIMIZU, manko: MANKO };
