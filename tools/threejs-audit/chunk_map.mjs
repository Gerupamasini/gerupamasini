// List the ShaderChunk #include order for ShaderLib.physical (used by MeshPhysicalMaterial/MeshStandardMaterial)
// and check which candidate onBeforeCompile anchors exist, and how often.
const ROOT = '/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/three-0.186.1/package/src/';
const { ShaderLib } = await import(ROOT + 'renderers/shaders/ShaderLib.js');
const { ShaderChunk } = await import(ROOT + 'renderers/shaders/ShaderChunk.js');
const sh = ShaderLib.physical;
const inc = /^[ \t]*#include +<([\w\d./]+)>/gm;
function list(src) { return [...src.matchAll(inc)].map(m => m[1]); }
const vs = list(sh.vertexShader), fs = list(sh.fragmentShader);
console.log('--- physical VERTEX top-level includes (' + vs.length + ')\n' + vs.join('\n'));
console.log('--- physical FRAGMENT top-level includes (' + fs.length + ')\n' + fs.join('\n'));
console.log('--- ShaderChunk count =', Object.keys(ShaderChunk).length);
// anchors we plan to patch
const anchors = {
  vertex: ['begin_vertex', 'beginnormal_vertex', 'skinbase_vertex', 'skinnormal_vertex', 'skinning_vertex', 'morphtarget_vertex', 'morphnormal_vertex', 'displacementmap_vertex', 'project_vertex', 'defaultnormal_vertex', 'normal_vertex', 'worldpos_vertex'],
  fragment: ['map_fragment', 'color_fragment', 'alphamap_fragment', 'alphatest_fragment', 'alphahash_fragment', 'roughnessmap_fragment', 'metalnessmap_fragment', 'normal_fragment_begin', 'normal_fragment_maps', 'emissivemap_fragment', 'lights_physical_fragment', 'lights_fragment_begin', 'lights_fragment_maps', 'lights_fragment_end', 'aomap_fragment', 'transmission_fragment', 'opaque_fragment', 'tonemapping_fragment', 'colorspace_fragment'],
};
for (const [stage, arr] of Object.entries(anchors)) {
  const src = sh[stage === 'vertex' ? 'vertexShader' : 'fragmentShader'];
  for (const a of arr) {
    const n = (src.match(new RegExp('#include <' + a + '>', 'g')) || []).length;
    console.log(stage.padEnd(8), a.padEnd(28), 'count in top-level shader =', n);
  }
}
// which chunks do the shadow-pass shaders (depth/distance) include? (custom vertex deformation must be duplicated there)
for (const k of ['depth', 'distance']) {
  console.log('--- ShaderLib.' + k + ' vertex includes:', list(ShaderLib[k].vertexShader).join(', '));
  console.log('--- ShaderLib.' + k + ' fragment includes:', list(ShaderLib[k].fragmentShader).join(', '));
}
