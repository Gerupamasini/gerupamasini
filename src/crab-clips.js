import * as THREE from 'three';
import { JOINTS } from './crab-builder.js';
const D = Math.PI / 180;

/** Bake AnimationClips by sampling pose functions (joint rotations only). */
export function makeClips(crab) {
  const byName = Object.fromEntries(JOINTS.map((j) => [j.name, j]));
  const reset = () => JOINTS.forEach((j) => j.rotation.set(...j.userData.rest));
  const add = (n, ax, deg) => { const j = byName[n]; if (j) j.rotation[ax] += deg * D; };
  const clipFrom = (name, dur, N, pose) => {
    const times = [], vals = {};
    for (let i = 0; i <= N; i++) {
      const ph = i / N; times.push(ph * dur);
      reset(); pose(ph);
      for (const j of JOINTS) { const q = new THREE.Quaternion().setFromEuler(j.rotation); (vals[j.name] ||= []).push(q.x, q.y, q.z, q.w); }
    }
    reset();
    return new THREE.AnimationClip(name, dur, Object.entries(vals).map(([n, v]) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, v)));
  };
  const stow = (k) => { for (const j of JOINTS) if (j.userData.stow) j.rotation.set(...j.userData.rest.map((r, i) => r + (j.userData.stow[i] * D - r) * k)); };
  const S = (p) => Math.sin(p * 2 * Math.PI);
  return [
    clipFrom('Wave', 3.2, 48, (p) => {
      for (const s of ['R', 'L']) {
        const ph = s === 'R' ? 0 : 0.12, k = Math.pow(Math.sin((p * 2 + ph) * 2 * Math.PI) * 0.5 + 0.5, 1.4);
        add(`${s}_cheliped_merus`, 'z', 18 * k); add(`${s}_cheliped_carpus`, 'y', 60 * k); add(`${s}_cheliped_propodus`, 'z', 120 * k);
        add(`${s}_cheliped_dactylus`, 'z', 12 * Math.sin((p * 4 + ph) * 2 * Math.PI) * k + 14 * k);
        add(`${s}_eyestalk`, 'z', 8 * k);
      }
    }),
    clipFrom('Sidewalk', 1.6, 48, (p) => {
      [2, 3, 4, 5].forEach((n, i) => {
        for (const s of ['R', 'L']) {
          const ph = p + ((i + (s === 'R' ? 0 : 1)) % 2) * 0.5, c = Math.cos(ph * 2 * Math.PI), lift = Math.max(0, Math.sin(ph * 2 * Math.PI));
          add(`${s}_leg${n}_coxa`, 'y', 9 * c); add(`${s}_leg${n}_merus`, 'z', 20 * lift);
          add(`${s}_leg${n}_carpus`, 'z', -26 * lift); add(`${s}_leg${n}_propodus`, 'z', 14 * lift);
        }
      });
      for (const s of ['R', 'L']) { add(`${s}_cheliped_merus`, 'z', 3 * S(p * 2)); add(`${s}_cheliped_dactylus`, 'z', 4 * S(p * 2)); }
    }),
    clipFrom('EyeStow', 3, 48, (p) => stow(Math.min(1, Math.max(0, 1.4 - Math.abs(p - 0.5) * 4)))),
    clipFrom('Idle', 4, 48, (p) => {
      for (const s of ['R', 'L']) {
        add(`${s}_eyestalk`, 'z', 5 * S(p) + (p > 0.7 && p < 0.85 ? -60 * Math.sin((p - 0.7) / 0.15 * Math.PI) : 0));
        add(`${s}_maxilliped3`, 'z', 10 * Math.max(0, S(p * 6)));
        add(`${s}_cheliped_dactylus`, 'z', 5 * Math.max(0, S(p * 3 + 0.2)));
      }
      add('Abdomen', 'z', 2 * S(p));
    }),
  ];
}
