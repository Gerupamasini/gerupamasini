// The documentation's images (docs/models/aramushiro/): each shot is a list of viewer calls ([method, args]) then
// a screenshot. Shots run in order and keep the scene the previous one left (the sequences rely on it).
const F = [0.03, 0.022, 0.025];
export default [
  // the shell, as the specimen photographs show it
  { name: 'shell_aperture', steps: [['set', [{ scene: 'aperture', lod: 0, morph: 0, cam: [0, 0, 0.075], target: [0, 0, 0], fov: 14 }]]] },
  { name: 'shell_back', steps: [['set', [{ scene: 'back', lod: 0, morph: 0, cam: [0, 0, 0.075], target: [0, 0, 0], fov: 14 }]]] },
  { name: 'shell_side', steps: [['set', [{ scene: 'side', lod: 0, morph: 2, cam: [0, 0, 0.075], target: [0, 0, 0], fov: 14 }]]] },
  { name: 'shell_apex', steps: [['set', [{ scene: 'apex', lod: 0, morph: 0, cam: [0, 0, 0.05], target: [0, 0, 0], fov: 14 }]]] },
  { name: 'shell_black', steps: [['set', [{ scene: 'black', lod: 0, morph: 3, cam: [0, 0, 0.075], target: [0, 0, 0], fov: 14 }]]] },
  { name: 'shell_forms', steps: [['set', [{ scene: 'forms', lod: 0 }]]] },
  { name: 'shell_lod1', steps: [['set', [{ scene: 'back', lod: 1, morph: 0, cam: [0, 0, 0.075], target: [0, 0, 0], fov: 14 }]]] },
  { name: 'shell_lod2', steps: [['set', [{ scene: 'back', lod: 2, morph: 0, cam: [0, 0, 0.075], target: [0, 0, 0], fov: 14 }]]] },
  // alive, in air (set down on a white dish, as in the photographs of snails picked up on the shore)
  { name: 'live_dish', steps: [['set', [{ scene: 'dish', lod: 0 }]], ['advance', [6]], ['follow', [0, [0.035, 0.025, 0.03]]]] },
  { name: 'live_dish_top', steps: [['follow', [0, [0.0, 0.055, 0.0001]]]] },
  // under water on the sand
  { name: 'crawl', steps: [['set', [{ scene: 'sand', lod: 0, brain: false, reset: true }]], ['intent', [0, { kind: 'wander', seconds: 120, target: [0.3, 0, 0.3] }]], ['advance', [14]], ['follow', [0, F]]] },
  { name: 'crawl_top', steps: [['follow', [0, [0.0, 0.05, 0.0001]]]] },
  { name: 'crawl_low', steps: [['follow', [0, [0.035, 0.008, 0.008]]]] },
  { name: 'trail', steps: [['advance', [40]], ['follow', [0, [-0.02, 0.06, -0.05]]]] },
  { name: 'forage', steps: [['intent', [0, { kind: 'forage', seconds: 60 }]], ['until', ['FORAGE', 'sample', 30]], ['advance', [1.5]], ['follow', [0, [0.02, 0.025, 0.035]]]] },
  { name: 'hide_0', steps: [['intent', [0, { kind: 'rest', seconds: 60 }]], ['advance', [4]], ['follow', [0, F]]] },
  { name: 'hide_1', steps: [['startle', []], ['advance', [0.35]], ['follow', [0, F]]] },
  { name: 'hide_2', steps: [['advance', [0.6]], ['follow', [0, F]]] },
  { name: 'hide_3', steps: [['advance', [1.5]], ['follow', [0, F]]] },
  { name: 'emerge', steps: [['until', ['HIDE_IN_SHELL', 'emerge', 30]], ['advance', [1.8]], ['follow', [0, F]]] },
  { name: 'burrow_0', steps: [['advance', [4]], ['intent', [0, { kind: 'burrow', seconds: 200 }]], ['advance', [14]], ['follow', [0, F]]] },
  { name: 'burrow_1', steps: [['advance', [16]], ['follow', [0, F]]] },
  { name: 'burrow_2', steps: [['advance', [40]], ['follow', [0, [0.02, 0.025, 0.02]]]] },
  { name: 'bait_emerge', steps: [['act', ['bait']], ['advance', [8]], ['follow', [0, F]]] },
  // the carrion and the crowd on it
  { name: 'feeding', steps: [['set', [{ scene: 'feeding', lod: 0, reset: true }]], ['advance', [10]], ['set', [{ cam: [0.06, 0.07, 0.07], target: [0, 0, 0], fov: 30 }]]] },
  { name: 'feeding_close', steps: [['follow', [2, [0.022, 0.016, 0.02]]]] },
  { name: 'crowd', steps: [['set', [{ scene: 'crowd', lod: 'auto' }]], ['advance', [6]], ['set', [{ cam: [0.0, 0.55, 1.0], target: [0, 0, -0.1], fov: 40 }]]] },
];
