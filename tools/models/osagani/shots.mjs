// The default shots of tools/models/osagani/render.mjs (the images in docs/models/yamatoosagani/).
const TOP = { cam: [0, 0.2, 0.0001], target: [0, 0, 0.004], up: [0, 0, 1] };
export default [
  // the shape stage: untextured clay in the five views compared with the photographs
  { name: 'clay_top', set: { view: 'top', clay: true, lod: 0, pose: 'stand', sex: 0, floor: false, ortho: 0.042, ...TOP } },
  { name: 'clay_front', set: { view: 'front', pose: 'stand', floor: true, ortho: 0, fov: 30, cam: [0, 0.03, 0.14], target: [0, 0.008, 0] } },
  { name: 'clay_side', set: { view: 'side', pose: 'stand', ortho: 0.03, cam: [0.2, 0.01, 0.0], target: [0, 0.01, 0.0], up: [0, 1, 0] } },
  { name: 'clay_oblique', set: { view: 'oblique', pose: 'stand', ortho: 0, fov: 30, cam: [0.09, 0.08, 0.11], target: [0, 0.006, 0.004] } },
  { name: 'clay_macro_eye', set: { view: 'macro', pose: 'stand', fov: 18, cam: [0.03, 0.03, 0.06], target: [0.002, 0.016, 0.01] } },
];
