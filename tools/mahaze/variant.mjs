// Which fish the builder makes: 'juvenile' (default) or 'adult'.
// Selected with `--variant <name>` on the command line or MAHAZE_VARIANT in the environment; every module
// that defines shape, pattern or rig reads it from here so one build is always self-consistent.
const argv = process.argv;
const i = argv.indexOf('--variant');
export const VARIANT = (i >= 0 ? argv[i + 1] : process.env.MAHAZE_VARIANT) || 'juvenile';
if (!['juvenile', 'adult'].includes(VARIANT)) throw new Error(`unknown variant "${VARIANT}" (juvenile | adult)`);
export const JUVENILE = VARIANT === 'juvenile';
/** Pick the value for the current variant. */
export const pick = (adult, juvenile) => (JUVENILE ? juvenile : adult);
