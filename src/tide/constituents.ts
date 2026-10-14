// Tidal constituent catalogue: Doodson numbers (τ, s, h, p, N', p'), phase constant, speed and nodal class.
// Speeds are degrees per mean solar hour. Nodal corrections follow Schureman's formulae.

export type NodalClass = 'none' | 'M2' | 'K1' | 'O1' | 'K2' | 'M4' | 'MS4' | 'MN4' | 'J1' | 'M1' | 'L2' | 'MM' | 'MF';

export interface ConstituentDef {
  name: string;
  doodson: [number, number, number, number, number, number];
  /** phase constant in degrees added to the Doodson argument */
  phase: number;
  speed: number;
  nodal: NodalClass;
}

const d = (
  name: string,
  doodson: [number, number, number, number, number, number],
  phase: number,
  speed: number,
  nodal: NodalClass,
): ConstituentDef => ({ name, doodson, phase, speed, nodal });

/** Catalogue of constituents supported by the predictor. Names follow the JMA / IHO table. */
export const CONSTITUENTS: Record<string, ConstituentDef> = Object.fromEntries(
  [
    // long period
    d('Sa', [0, 0, 1, 0, 0, 0], 0, 0.0410686, 'none'),
    d('Ssa', [0, 0, 2, 0, 0, 0], 0, 0.0821373, 'none'),
    d('Mm', [0, 1, 0, -1, 0, 0], 0, 0.5443747, 'MM'),
    d('MSf', [0, 2, -2, 0, 0, 0], 0, 1.0158958, 'none'),
    d('Mf', [0, 2, 0, 0, 0, 0], 0, 1.0980331, 'MF'),
    // diurnal
    d('2Q1', [1, -3, 0, 2, 0, 0], -90, 12.8542862, 'O1'),
    d('sigma1', [1, -3, 2, 0, 0, 0], -90, 12.9271398, 'O1'),
    d('Q1', [1, -2, 0, 1, 0, 0], -90, 13.3986609, 'O1'),
    d('rho1', [1, -2, 2, -1, 0, 0], -90, 13.4715145, 'O1'),
    d('O1', [1, -1, 0, 0, 0, 0], -90, 13.9430356, 'O1'),
    d('MP1', [1, -1, 2, 0, 0, 0], -90, 14.0251729, 'none'),
    d('M1', [1, 0, 0, 1, 0, 0], 90, 14.4966939, 'M1'),
    d('chi1', [1, 0, 2, -1, 0, 0], 90, 14.5695476, 'J1'),
    d('pi1', [1, 1, -3, 0, 0, 1], -90, 14.9178647, 'none'),
    d('P1', [1, 1, -2, 0, 0, 0], -90, 14.9589314, 'none'),
    d('S1', [1, 1, -1, 0, 0, 0], 0, 15.0, 'none'),
    d('K1', [1, 1, 0, 0, 0, 0], 90, 15.0410686, 'K1'),
    d('psi1', [1, 1, 1, 0, 0, -1], 90, 15.0821353, 'none'),
    d('phi1', [1, 1, 2, 0, 0, 0], 90, 15.1232059, 'none'),
    d('theta1', [1, 2, -2, 1, 0, 0], 90, 15.5125897, 'J1'),
    d('J1', [1, 2, 0, -1, 0, 0], 90, 15.5854433, 'J1'),
    d('SO1', [1, 3, -2, 0, 0, 0], 90, 16.0569644, 'none'),
    d('OO1', [1, 3, 0, 0, 0, 0], 90, 16.1391017, 'OO1' as NodalClass),
    // semidiurnal
    d('OQ2', [2, -3, 0, 3, 0, 0], 0, 27.3416964, 'M2'),
    d('MNS2', [2, -3, 2, 1, 0, 0], 0, 27.4238337, 'M2'),
    d('2N2', [2, -2, 0, 2, 0, 0], 0, 27.8953548, 'M2'),
    d('mu2', [2, -2, 2, 0, 0, 0], 0, 27.9682084, 'M2'),
    d('N2', [2, -1, 0, 1, 0, 0], 0, 28.4397295, 'M2'),
    d('nu2', [2, -1, 2, -1, 0, 0], 0, 28.5125831, 'M2'),
    d('OP2', [2, -1, 2, 0, 0, 0], 180, 28.9019669, 'none'),
    d('M2', [2, 0, 0, 0, 0, 0], 0, 28.9841042, 'M2'),
    d('MKS2', [2, 0, 2, 0, 0, 0], 0, 29.0662415, 'M2'),
    d('lambda2', [2, 1, -2, 1, 0, 0], 180, 29.4556253, 'M2'),
    d('L2', [2, 1, 0, -1, 0, 0], 180, 29.5284789, 'L2'),
    d('T2', [2, 2, -3, 0, 0, 1], 0, 29.9589333, 'none'),
    d('S2', [2, 2, -2, 0, 0, 0], 0, 30.0, 'none'),
    d('R2', [2, 2, -1, 0, 0, -1], 180, 30.0410667, 'none'),
    d('K2', [2, 2, 0, 0, 0, 0], 0, 30.0821373, 'K2'),
    d('MSN2', [2, 3, -2, -1, 0, 0], 0, 30.5443747, 'M2'),
    d('KJ2', [2, 3, 0, -1, 0, 0], 0, 30.6265120, 'K2'),
    d('2SM2', [2, 4, -4, 0, 0, 0], 0, 31.0158958, 'M2'),
    // third diurnal
    d('MO3', [3, -1, 0, 0, 0, 0], -90, 42.9271398, 'M2'),
    d('M3', [3, 0, 0, 0, 0, 0], 180, 43.4761563, 'M2'),
    d('SO3', [3, 1, -2, 0, 0, 0], -90, 43.9430356, 'O1'),
    d('MK3', [3, 1, 0, 0, 0, 0], 90, 44.0251729, 'M2'),
    d('SK3', [3, 3, -2, 0, 0, 0], 90, 45.0410686, 'K1'),
    // shallow water quarter diurnal
    d('MN4', [4, -1, 0, 1, 0, 0], 0, 57.4238337, 'MN4'),
    d('M4', [4, 0, 0, 0, 0, 0], 0, 57.9682084, 'M4'),
    d('SN4', [4, 1, -2, 1, 0, 0], 0, 58.4397295, 'M2'),
    d('MS4', [4, 2, -2, 0, 0, 0], 0, 58.9841042, 'MS4'),
    d('MK4', [4, 2, 0, 0, 0, 0], 0, 59.0662415, 'M4'),
    d('S4', [4, 4, -4, 0, 0, 0], 0, 60.0, 'none'),
    d('SK4', [4, 4, -2, 0, 0, 0], 0, 60.0821373, 'K2'),
    // sixth diurnal
    d('2MN6', [6, -1, 0, 1, 0, 0], 0, 86.4079380, 'M4'),
    d('M6', [6, 0, 0, 0, 0, 0], 0, 86.9523127, 'M4'),
    d('MSN6', [6, 1, -2, 1, 0, 0], 0, 87.4238337, 'M4'),
    d('2MS6', [6, 2, -2, 0, 0, 0], 0, 87.9682084, 'M4'),
    d('2MK6', [6, 2, 0, 0, 0, 0], 0, 88.0503457, 'M4'),
    d('2SM6', [6, 4, -4, 0, 0, 0], 0, 88.9841042, 'M2'),
    d('MSK6', [6, 4, -2, 0, 0, 0], 0, 89.0662415, 'M2'),
  ].map((c) => [c.name, c]),
);

/** Nodal factor f and phase correction u (degrees) for a nodal class, N = lunar node longitude (degrees). */
export function nodalCorrection(cls: NodalClass | 'OO1', Ndeg: number): { f: number; u: number } {
  const N = (Ndeg * Math.PI) / 180;
  const c1 = Math.cos(N), c2 = Math.cos(2 * N), c3 = Math.cos(3 * N);
  const s1 = Math.sin(N), s2 = Math.sin(2 * N), s3 = Math.sin(3 * N);
  switch (cls) {
    case 'M2': return { f: 1.0004 - 0.0373 * c1 + 0.0002 * c2, u: -2.14 * s1 };
    case 'K1': return { f: 1.006 + 0.115 * c1 - 0.0088 * c2 + 0.0006 * c3, u: -8.86 * s1 + 0.68 * s2 - 0.07 * s3 };
    case 'O1': return { f: 1.0089 + 0.1871 * c1 - 0.0147 * c2 + 0.0014 * c3, u: 10.8 * s1 - 1.34 * s2 + 0.19 * s3 };
    case 'K2': return { f: 1.0241 + 0.2863 * c1 + 0.0083 * c2 - 0.0015 * c3, u: -17.74 * s1 + 0.68 * s2 - 0.04 * s3 };
    case 'J1': return { f: 1.0129 + 0.1676 * c1 - 0.017 * c2 + 0.0016 * c3, u: -12.94 * s1 + 1.34 * s2 - 0.19 * s3 };
    case 'OO1': return { f: 1.1027 + 0.6504 * c1 + 0.0317 * c2 - 0.0014 * c3, u: -36.68 * s1 + 4.02 * s2 - 0.57 * s3 };
    case 'M1': return { f: 1.0, u: 0 }; // simplified: M1 nodal dependence omitted
    case 'L2': return { f: 1.0004 - 0.0373 * c1 + 0.0002 * c2, u: -2.14 * s1 }; // approximated as M2
    case 'MM': return { f: 1.0 - 0.1300 * c1 + 0.0013 * c2, u: 0 };
    case 'MF': return { f: 1.0429 + 0.4135 * c1 - 0.004 * c2, u: -23.74 * s1 + 2.68 * s2 - 0.38 * s3 };
    case 'M4': { const m = nodalCorrection('M2', Ndeg); return { f: m.f * m.f, u: 2 * m.u }; }
    case 'MS4': return nodalCorrection('M2', Ndeg);
    case 'MN4': { const m = nodalCorrection('M2', Ndeg); return { f: m.f * m.f, u: 2 * m.u }; }
    default: return { f: 1, u: 0 };
  }
}
