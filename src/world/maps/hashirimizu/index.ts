import type { Object3D } from 'three';
import type { Terrain } from '../../Terrain';
import type { MeadowLayout } from '../../amamo/AmamoMeadow';
import type { ClamBedOptions } from '../../ClamField';
import type { SurfParams } from '../../Surf';
import { buildHashirimizuProps } from './props';
import { eelgrassField, eelgrassZone, offshore } from './shape';
import { inThicket, streamLevel } from '../manko/shape';
import { backdropCrowns, edgeImpostorSites } from '../manko/land';
import type { ImpostorSite } from '../../mangrove/impostor';
import type { BackdropCrown } from '../../mangrove/MangroveForest';
import type { Atmosphere } from '../../Sky';
import type { WaterOptics } from '../../Water';

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
  /** the ripple marks' strength (absent: 1) and how far the mud takes the sheltered silt-flat look, 0..1 (absent: 0) */
  ripples?: number; mudLook?: number;
  /** the ripple marks' turn from 葛西's (radians; their crests run along x there): crests parallel to this shore */
  rippleAngle: number;
  /** the waves breaking on the shore (null: none) */
  surf: SurfParams | null;
  /** the water: its colour in depth (linear) and its turbidity against 葛西's silty water */
  water: { colour: readonly [number, number, number]; turbidity: number } & WaterOptics;
  /** the map's air: sky, clouds, sun and fill light (absent: the temperate Tokyo Bay day) */
  atmosphere?: Partial<Atmosphere>;
  /** the background forest's edge rows, drawn as impostors of the tree models (absent: none) */
  mangroveImpostors?(): ImpostorSite[];
  /** mangrove foliage colour against the default (absent: unchanged) */
  mangroveLeafTint?: readonly [number, number, number];
  /** distant mangrove crowns drawn with the trees' own foliage (absent: none) */
  mangroveBackdrop?(): BackdropCrown[];
  /** ground the player cannot enter inside the walkable bounds (absent: none) */
  blocked?(x: number, z: number): boolean;
  /** the surface of the trickle left in the creeks at low water (m), or -1e3 away from them (absent: none) */
  streams?(x: number, z: number): number;
  /** fill the tide pools' whole shallow fringe, so their waterline follows a gentle mud slope (absent: false) */
  poolFringe?: boolean;
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
  // the bay mouth's small wind waves and ship wakes: a few tens of centimetres, a few seconds apart (the sea is to +x)
  surf: { height: 0.24, period: 3.4, slope: 0.05, seaward: [1, 0] },
  // the bay mouth's water: clearer than the silty flat at 葛西 and greener-blue
  water: { colour: [0.07, 0.125, 0.125], turbidity: 0.55 },
  props: buildHashirimizuProps,
};

const MANKO: ShoreLayout = {
  meadow: { suitability: () => 0, field: () => 0, holes: false },
  clams: { beds: 0, opts: {} }, pits: { clusters: 0, opts: {} },
  // Manko's estuary silt (user photos): warm greige-khaki, not 葛西's neutral grey; darker and browner when wet.
  landLevel: [3, 4], sandTint: [1.0, 0.97, 0.88], mudTint: [1.56, 1.44, 1.06], rippleAngle: 0.4,
  // a lake's sheltered mud flat: no ripple marks, the mottled, lumpy, glossy silt of the goby flat (MahazeViewer)
  ripples: 0, mudLook: 1,
  // the river-lake's turbid water (user's photos): a muted grey-green teal of suspended silt, mirroring the sky and
  // the mangrove banks, slightly broken by the breeze
  surf: null, water: {
    colour: [0.035, 0.042, 0.044], turbidity: 3.5, scatter: [0.041, 0.049, 0.052], reflect: 1, rough: 0.3, env: 1.2, reflNear: [1, 6],
    // a breeze over the river: a chop of ~35 cm crests that breaks up the reflected banks; the shallows lie calm
    ripple: { peak: 0.35, boost: 2.5, aniso: 1, calmGain: 0.08, still: 1 },
  },
  // subtropical air: a deep blue sky that the high sun does not bleach, bright cumulus, a strong warm sun
  atmosphere: {
    rayleigh: 1.7, turbidity: 1.8, mie: 0.0015, skyScale: 0.3, skyScaleHighSun: 0.55,
    cloudCoverage: 0.42, cloudDensity: 0.9, cloudScale: 0.0003, cloudGain: 2.6, cloudShadeMin: 0.26, cloudNeutral: 0.7,
    sunColor: [1, 0.95, 0.86], sunGain: 1.08, hemiSky: [0.5, 0.66, 0.88], hemiGround: [0.26, 0.26, 0.18], fogDay: [0.55, 0.74, 0.98],
  },
  props: () => [],
  // the dense mangrove forest beyond its front rows
  blocked: inThicket,
  streams: streamLevel,
  poolFringe: true,
  mangroveBackdrop: backdropCrowns,
  mangroveImpostors: edgeImpostorSites,
  // sun-flushed subtropical canopy: brighter, yellower green (user's photo)
  mangroveLeafTint: [1.7, 1.32, 0.62],
};

export const LAYOUTS: Record<string, ShoreLayout> = { hashirimizu: HASHIRIMIZU, manko: MANKO };
