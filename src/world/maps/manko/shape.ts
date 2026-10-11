/** A 70 m gameplay interpretation of Manko's sheltered estuary, not a surveyed reconstruction. */
export function creekX(z: number): number { return 8 + 3.8 * Math.sin(z * 0.085) + 1.2 * Math.sin(z * 0.21); }
export function heightAt(x: number, z: number): number {
  const d = Math.abs(x - creekX(z));
  const bank = 1.8 * Math.exp(-(((z + 35) / 5.5) ** 2));
  const hummocks = 0.035 * Math.sin(x * 0.43) * Math.cos(z * 0.31) + 0.045 * Math.sin(x * 0.12 + z * 0.16);
  const channel = 0.46 * Math.exp(-((d / 2.4) ** 2));
  const branch = 0.15 * Math.exp(-(((z - (15 + 2 * Math.sin(x * 0.22))) / 1.5) ** 2)) * Math.exp(-(((x + 3) / 16) ** 2));
  return 0.16 - z * 0.006 + bank + hummocks - channel - branch;
}
export function substrateAt(x: number, z: number): number {
  if (Math.abs(x - creekX(z)) < 1.6) return 4;
  if (z < -29) return 1;
  return Math.sin(x * 0.18 + z * 0.11) > 0.82 ? 1 : 2;
}
