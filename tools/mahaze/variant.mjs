// Which fish the builder makes. The shape, pattern and rig are defined for two growth stages, the juvenile
// and the adult; any stage in between is a blend of the two (growth g: 0 = juvenile, 1 = adult).
//   --variant juvenile | subadult | adult      (or MAHAZE_VARIANT)
//   --growth <0…1>                             (or MAHAZE_GROWTH; overrides the variant's growth value)
// Every module that defines shape, pattern or rig reads it from here so one build is always self-consistent.
const argv = process.argv;
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

export const STAGES = { juvenile: 0, subadult: 0.5, adult: 1 };
export const VARIANT = arg('--variant') || process.env.MAHAZE_VARIANT || 'juvenile';
if (!(VARIANT in STAGES)) throw new Error(`unknown variant "${VARIANT}" (${Object.keys(STAGES).join(' | ')})`);
const gArg = arg('--growth') ?? process.env.MAHAZE_GROWTH;
export const GROWTH = gArg !== undefined ? Math.min(1, Math.max(0, Number(gArg))) : STAGES[VARIANT];
export const JUVENILE = GROWTH === 0;

/**
 * Value for the current growth stage, blended between the adult and juvenile definitions: numbers are
 * interpolated, arrays and objects element by element, functions return the blend of their results.
 */
export function pick(adult, juvenile) {
  return blend(juvenile, adult, GROWTH);
}

function blend(j, a, g) {
  if (g <= 0) return j;
  if (g >= 1) return a;
  if (typeof j === 'number' && typeof a === 'number') return j + (a - j) * g;
  if (typeof j === 'function' && typeof a === 'function') return (...x) => blend(j(...x), a(...x), g);
  if (Array.isArray(j) && Array.isArray(a)) {
    if (j.length !== a.length) throw new Error('pick(): arrays of different length cannot be blended');
    return j.map((v, k) => blend(v, a[k], g));
  }
  if (j && a && typeof j === 'object' && typeof a === 'object') {
    const out = {};
    for (const k of Object.keys(j)) out[k] = k in a ? blend(j[k], a[k], g) : j[k];
    return out;
  }
  return g < 0.5 ? j : a;
}
