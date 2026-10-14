import type { ShoreLayout } from '../hashirimizu';

/**
 * The surf lab's shore (surf-lab.html): sand, a steep face, a bar and a rocky reef, and nothing else — no eelgrass,
 * clams, animals or props, an open horizon. Its water is the open sea's, clear and blue-green; its sea a lively one.
 */
export const SURFLAB: ShoreLayout = {
  meadow: { suitability: () => 0, field: () => 0, holes: false },
  clams: { beds: 0, opts: {} },
  pits: { clusters: 0, opts: {} },
  landLevel: [2.4, 2.9],
  // an ocean beach's sand: pale, warm grey-brown
  sandTint: [1.18, 1.06, 0.9],
  ripples: 0.45,
  rippleAngle: Math.PI / 2,
  surf: { height: 0.6, period: 7, slope: 0.1, seaward: [1, 0], angle: -0.25, spread: 0.14 },
  water: { colour: [0.03, 0.09, 0.12], turbidity: 0.4, chop: 1.4 },
  atmosphere: { cloudCoverage: 0.12, fogDay: [0.62, 0.74, 0.9], hemiSky: [0.5, 0.62, 0.85] },
  props: () => [],
};
