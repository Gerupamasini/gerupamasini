import { astroArgs, norm360 } from './astro';
import { CONSTITUENTS, nodalCorrection, type ConstituentDef } from './constituents';

export interface StationConstituent {
  name: string;
  amplitude_cm: number;
  phase_deg: number;
}

export interface TideStationData {
  id: string;
  names: { ja: string; en?: string };
  lat: number;
  lon: number;
  /** Phase lags in Japanese tables are referred to the 135°E (JST) meridian. */
  phaseReference: 'JST135E' | 'UTC';
  /**
   * How the zone reference is applied to the equilibrium argument.
   * 'zone_speed'       : V = V_G(t_UT) + speed × 9 h  (zone-time epochs, XTide / NOAA style)
   * 'meridian_species' : V = V_G(t_UT) + species × 135° (equilibrium argument at the 135°E meridian)
   * The two differ by up to ~9° for lunar constituents; confirmed against official predictions (see tests).
   */
  phaseConvention?: 'zone_speed' | 'meridian_species';
  mslAboveChartDatum_cm: number | null;
  constituents: StationConstituent[];
  source?: { name: string; url?: string; note?: string };
}

interface Active {
  def: ConstituentDef;
  H: number; // metres
  kappa: number; // degrees
}

export interface TideExtremum {
  t: number;
  level: number;
  kind: 'high' | 'low';
}

const ZONE_HOURS = 9;
const ZONE_DEG = 135;

export class TideModel {
  readonly station: TideStationData;
  private readonly active: Active[];
  private readonly convention: 'zone_speed' | 'meridian_species';

  constructor(station: TideStationData) {
    this.station = station;
    this.convention = station.phaseConvention ?? 'zone_speed';
    this.active = [];
    for (const c of station.constituents) {
      const def = CONSTITUENTS[c.name];
      if (!def) {
        console.warn(`[tide] unknown constituent ${c.name} ignored`);
        continue;
      }
      this.active.push({ def, H: c.amplitude_cm / 100, kappa: c.phase_deg });
    }
  }

  /** Tide height in metres relative to mean sea level at a UTC epoch (ms). */
  level(ms: number): number {
    const a = astroArgs(ms);
    const argsVec = [a.tau, a.s, a.h, a.p, -a.N, a.pp];
    let sum = 0;
    for (const { def, H, kappa } of this.active) {
      let V = def.phase;
      for (let i = 0; i < 6; i++) V += def.doodson[i] * argsVec[i];
      if (this.station.phaseReference === 'JST135E') {
        V += this.convention === 'zone_speed' ? def.speed * ZONE_HOURS : def.doodson[0] * ZONE_DEG;
      }
      const { f, u } = nodalCorrection(def.nodal, a.N);
      const phase = ((norm360(V + u - kappa) * Math.PI) / 180);
      sum += f * H * Math.cos(phase);
    }
    return sum;
  }

  /** Rate of change in metres per hour (central difference). */
  rate(ms: number): number {
    const dt = 5 * 60 * 1000;
    return (this.level(ms + dt) - this.level(ms - dt)) / (2 * (dt / 3600000));
  }

  /** High and low waters between two epochs, refined to ~10 s. */
  extrema(fromMs: number, toMs: number): TideExtremum[] {
    const out: TideExtremum[] = [];
    const step = 10 * 60 * 1000;
    let tPrev = fromMs;
    let vPrev = this.level(tPrev);
    let tCur = fromMs + step;
    let vCur = this.level(tCur);
    for (let t = fromMs + 2 * step; t <= toMs; t += step) {
      const v = this.level(t);
      if ((vCur > vPrev && vCur >= v) || (vCur < vPrev && vCur <= v)) {
        const kind: 'high' | 'low' = vCur > vPrev ? 'high' : 'low';
        // golden-section refinement in [tPrev, t]
        let lo = tPrev, hi = t;
        const sign = kind === 'high' ? 1 : -1;
        const g = (Math.sqrt(5) - 1) / 2;
        let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo);
        let f1 = sign * this.level(x1), f2 = sign * this.level(x2);
        while (hi - lo > 10 * 1000) {
          if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = sign * this.level(x2); }
          else { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = sign * this.level(x1); }
        }
        const tm = (lo + hi) / 2;
        out.push({ t: tm, level: this.level(tm), kind });
      }
      tPrev = tCur; vPrev = vCur; tCur = t; vCur = v;
    }
    return out;
  }

  /** Approximate spring-tide amplitude: sum of the main constituent amplitudes (metres). */
  maxAmplitude(): number {
    return this.active.reduce((s, c) => s + c.H, 0);
  }
}

export type TidePhase = 'high' | 'low' | 'rising' | 'falling';

/**
 * What the water is doing at a moment: at a high or low when within `slackMin` minutes of one of the given extremes
 * (the water is slack around them), else rising or falling by the level's change over the ten minutes either side.
 */
export function tidePhaseAt(level: (ms: number) => number, extrema: { t: number; kind: 'high' | 'low' }[], ms: number, slackMin = 20): TidePhase {
  for (const e of extrema) if (Math.abs(e.t - ms) <= slackMin * 60000) return e.kind;
  return level(ms + 600000) - level(ms - 600000) >= 0 ? 'rising' : 'falling';
}
