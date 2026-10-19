// The default shots of tools/models/osagani/render.mjs (the images in docs/models/yamatoosagani/).
const TOP = { cam: [0, 0.2, 0.0001], target: [0, 0, 0.004], up: [0, 0, 1] };
const STUDIO = { behave: false, floor: true, mudFloor: false, ortho: 0, sex: 0, cw: 35, seed: 1, morph: 0, juvenile: 0, mud: 0.2, palmBlue: 0 };
export default [
  // the shape stage: untextured clay in the views compared with the photographs (A = the 51-photo sheet, B = the 70)
  { name: 'clay_top', size: [1280, 760], set: { ...STUDIO, view: 'top', clay: true, lod: 0, pose: 'rest', sex: 1, floor: false, ortho: 0.042, ...TOP } },
  { name: 'clay_top_male', set: { view: 'top', sex: 0, pose: 'stand', floor: false, ortho: 0.042, ...TOP } },
  { name: 'clay_front', set: { view: 'front', pose: 'stand', floor: true, ortho: 0, fov: 18, cam: [0, 0.035, 0.22], target: [0, 0.004, 0.012], up: [0, 1, 0] } },
  { name: 'clay_front_female', set: { view: 'front', sex: 1, pose: 'stand', fov: 18, cam: [0.035, 0.085, 0.2], target: [0, 0.004, 0.0] } },
  { name: 'clay_side', set: { view: 'side', sex: 1, pose: 'stand', ortho: 0.03, cam: [0.2, 0.01, 0.0], target: [0, 0.012, 0.0], up: [0, 1, 0] } },
  { name: 'clay_oblique', set: { view: 'oblique', sex: 0, pose: 'stand', ortho: 0, fov: 18, cam: [0.17, 0.06, 0.12], target: [0, 0.004, 0.004] } },
  { name: 'clay_eye', set: { view: 'macro', sex: 1, pose: 'stand', fov: 16, cam: [0.02, 0.034, 0.06], target: [0.0047, 0.0285, 0.0105] } },
  { name: 'clay_under', set: { view: 'under', sex: 0, pose: 'stand', floor: false, ortho: 0.032, cam: [0, -0.2, 0.0001], target: [0, 0.02, 0.006], up: [0, 0, 1] } },
  { name: 'clay_under_female', set: { view: 'under', sex: 1, pose: 'stand', floor: false, ortho: 0.032, cam: [0, -0.2, 0.0001], target: [0, 0.02, 0.006], up: [0, 0, 1] } },
  // the finished crab
  { name: 'top', set: { ...STUDIO, view: 'top', clay: false, mudFloor: true, pose: 'rest', sex: 1, floor: true, ortho: 0.042, ...TOP } },
  { name: 'front', set: { view: 'front', sex: 0, pose: 'stand', ortho: 0, fov: 18, cam: [0, 0.035, 0.22], target: [0, 0.004, 0.012], up: [0, 1, 0] } },
  { name: 'oblique', set: { view: 'oblique', sex: 0, pose: 'stand', fov: 18, cam: [0.17, 0.06, 0.12], target: [0, 0.004, 0.004] } },
  { name: 'oblique_female', set: { view: 'oblique', sex: 1, seed: 5, morph: 1, pose: 'stand', fov: 18, cam: [0.12, 0.08, 0.15], target: [0, 0.006, 0.0] } },
  { name: 'side', set: { view: 'side', sex: 1, seed: 5, morph: 1, pose: 'stand', fov: 18, cam: [-0.19, 0.06, 0.09], target: [0, 0.007, 0.0], up: [0, 1, 0] } },
  { name: 'macro_carapace', set: { view: 'macro', sex: 0, seed: 1, morph: 0, pose: 'stand', fov: 22, cam: [0.03, 0.07, 0.05], target: [0, 0.022, 0.0] } },
  { name: 'macro_chela', set: { view: 'macro', pose: 'stand', fov: 22, cam: [0.06, 0.03, 0.08], target: [0.012, 0.006, 0.02] } },
  { name: 'macro_eye', set: { view: 'macro', sex: 1, pose: 'stand', fov: 16, cam: [0.02, 0.034, 0.06], target: [0.0047, 0.0285, 0.0105] } },
  { name: 'morph_mud', set: { view: 'top', sex: 0, seed: 2, morph: 0, mud: 0.15, pose: 'stand', ortho: 0.045, ...TOP } },
  { name: 'morph_grey', set: { view: 'top', sex: 0, seed: 3, morph: 1, mud: 0.3, palmBlue: 0.8, pose: 'stand', ortho: 0.045, ...TOP } },
  { name: 'morph_dark', set: { view: 'top', sex: 0, seed: 4, morph: 2, mud: 0.45, pose: 'stand', ortho: 0.045, ...TOP } },
  { name: 'young', set: { view: 'top', sex: 0, seed: 6, morph: 1, cw: 16, juvenile: 0.8, mud: 0.1, pose: 'stand', ortho: 0.021, cam: [0, 0.1, 0.0001], target: [0, 0, 0.002], up: [0, 0, 1] } },
  // the tiers
  { name: 'lod0', set: { view: 'oblique', cw: 35, juvenile: 0, seed: 1, morph: 0, mud: 0.2, palmBlue: 0, lod: 0, pose: 'stand', fov: 30, cam: [0.09, 0.08, 0.11], target: [0, 0.008, 0.004] } },
  { name: 'lod1', set: { lod: 1 } },
  { name: 'lod2', set: { lod: 2 } },
  // the seven behaviours on the mud (studio light)
  { name: 'b_idle', set: { view: 'oblique', behave: true, lod: 0, sex: 0, seed: 1, fov: 30 }, call: { fn: 'mode', args: ['IDLE'] }, advance: 1.5, follow: { offset: [0.09, 0.07, 0.11] } },
  { name: 'b_walk', call: { fn: 'mode', args: ['WALK'] }, advance: 0.7, follow: { offset: [0.02, 0.05, 0.16] } },
  { name: 'b_walk2', advance: 0.12, follow: { offset: [0.02, 0.05, 0.16] } },
  { name: 'b_forage', call: { fn: 'mode', args: ['FORAGE'] }, advance: 1.6, follow: { offset: [0.06, 0.05, 0.14] } },
  { name: 'b_defend', call: { fn: 'mode', args: ['DEFEND'] }, advance: 1.2, follow: { offset: [0.04, 0.05, 0.2], dt: [0, 0.02, 0] } },
  { name: 'b_entry', call: { fn: 'mode', args: ['BURROW_ENTRY'] }, advance: 1.9, follow: { offset: [0.06, 0.08, 0.12] } },
  { name: 'b_entry2', advance: 0.35, follow: { offset: [0.06, 0.08, 0.12] } },
  { name: 'b_peek', call: { fn: 'mode', args: ['BURROW_EXIT'] }, advance: 1.0, follow: { offset: [0.05, 0.05, 0.12] } },
  { name: 'b_exit', advance: 2.0, follow: { offset: [0.06, 0.07, 0.12] } },
  { name: '_away', call: { fn: 'mode', args: ['WALK'] }, advance: 1.5 },
  { name: 'b_escape2', call: { fn: 'mode', args: ['ESCAPE'] }, advance: 0.35, follow: { offset: [0.03, 0.09, 0.2] } },
];
