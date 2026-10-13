import {
  Color, DirectionalLight, Group, HalfFloatType, HemisphereLight, InstancedBufferAttribute, InstancedMesh, LinearFilter,
  LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, NoBlending, OrthographicCamera, PlaneGeometry, Scene, Vector2, Vector3,
  WebGLRenderTarget, type IUniform, type WebGLRenderer,
} from 'three';
import { finishInstances, writeInstance, type HirugiKit } from './kit';
import { PARTS } from './materials';
import { treeSpec, type HirugiBase } from './types';

/**
 * Billboard impostors of the five adult trees, for the background forest's edge rows far beyond the tree models
 * (across the lake, along its shores): each tree is the real model rendered once, at load, from eight directions
 * into a shared atlas (5 trees × 8 views), and drawn as one camera-facing quad that picks the view nearest to the
 * camera's bearing. Two triangles a tree, one draw call for them all; the prop roots and crown are those of the
 * near trees, so the forest edge reads the same at 300 m as at 30 m.
 */
export interface ImpostorSite { x: number; y: number; z: number; scale: number; base: HirugiBase; yaw: number }

const VIEWS = 8, BASES = 5, TILE = 256;

export interface ImpostorAtlas {
  target: WebGLRenderTarget;
  /** per base: the tile's side (m) and its bottom (m, relative to the tree's base) */
  frames: Vector2[];
}

/**
 * Render the five adult trees (LOD1, still air, no seed lean) from eight azimuths into one HDR atlas. Each view is
 * drawn into a small 4× MSAA tile and copied into the atlas, which keeps no depth or multisample buffers: ~28 MB
 * of texture (with mips) stays, the bake's working buffers (~2 MB) are freed at once.
 */
export function bakeImpostors(renderer: WebGLRenderer, kit: HirugiKit): ImpostorAtlas {
  const target = new WebGLRenderTarget(TILE * VIEWS, TILE * BASES, {
    type: HalfFloatType, samples: 0, depthBuffer: false, generateMipmaps: false, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter,
  });
  target.texture.name = 'YaeyamaHirugi/Impostors';
  const tile = new WebGLRenderTarget(TILE, TILE, { type: HalfFloatType, samples: 4, minFilter: LinearFilter, magFilter: LinearFilter });
  // the copy: a screen-filling quad drawn into one tile of the atlas, texel for texel, alpha and all (no blending)
  const copyCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1), copyScene = new Scene();
  // (transparent with no blending: an opaque material would have its alpha forced to 1 and lose the coverage)
  const copyQuad = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ map: tile.texture, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, blending: NoBlending }));
  copyScene.add(copyQuad);
  const scene = new Scene();
  // a clear noon: a strong warm key from above and to one side of each view, a blue-white sky fill
  const hemi = new HemisphereLight(new Color(0.5, 0.66, 0.88), new Color(0.26, 0.26, 0.18), 0.3);
  const sun = new DirectionalLight(new Color(1, 0.95, 0.86), 2.8);
  scene.add(hemi, sun, sun.target);
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const frames: Vector2[] = [];
  const prev = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, color: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha(), shadows: renderer.shadowMap.enabled };
  renderer.shadowMap.enabled = false; renderer.autoClear = false;
  // (a transparent clear: the renderer premultiplies it to zero anyway; the impostor shader divides the
  // coverage back out, so edges and small mips keep the foliage's own colour)
  renderer.setClearColor(new Color(0, 0, 0), 0);
  renderer.setRenderTarget(target); renderer.clear();
  for (let base = 0 as HirugiBase; base < BASES; base = (base + 1) as HirugiBase) {
    const spec = { ...treeSpec(1, base, base), yaw: 0, scale: 1, trunkSeed: 2147483647, rootSeed: 2147483647, leafSeed: 2147483647, scaleSeed: 2147483647 };
    const group = new Group(), meshes = PARTS.map((part) => {
      const m = kit.mesh(base, 1, part, 1); writeInstance(m, 0, spec, kit.ground); finishInstances(m, 1); group.add(m); return m;
    });
    scene.add(group);
    const sk = kit.skeleton(base), g = kit.ground.heightAt(0, 0);
    const half = sk.reach * 1.1 + 0.4, bottom = -0.35, side = Math.max(2 * half, sk.height * 1.08 - bottom);
    frames.push(new Vector2(side, bottom));
    cam.left = -side / 2; cam.right = side / 2; cam.bottom = bottom; cam.top = bottom + side; cam.updateProjectionMatrix();
    for (let k = 0; k < VIEWS; k++) {
      const a = k / VIEWS * Math.PI * 2;
      cam.position.set(Math.sin(a) * 60, g, Math.cos(a) * 60); cam.lookAt(0, g, 0);
      // the key light 40° to the left of the view and 55° up, so every view is lit alike
      const la = a - 0.7;
      sun.position.set(Math.sin(la) * Math.cos(0.96) * 60, g + Math.sin(0.96) * 60, Math.cos(la) * Math.cos(0.96) * 60);
      renderer.setRenderTarget(tile); renderer.clear(); renderer.render(scene, cam);
      // the mips are built once, with the last tile
      target.texture.generateMipmaps = base === BASES - 1 && k === VIEWS - 1;
      target.viewport.set(k * TILE, base * TILE, TILE, TILE);
      target.scissor.set(k * TILE, base * TILE, TILE, TILE); target.scissorTest = true;
      renderer.setRenderTarget(target); renderer.render(copyScene, copyCam);
    }
    scene.remove(group);
    for (const m of meshes) kit.release(m);
  }
  target.scissorTest = false; target.viewport.set(0, 0, TILE * VIEWS, TILE * BASES); target.scissor.set(0, 0, TILE * VIEWS, TILE * BASES);
  renderer.setRenderTarget(prev.target); renderer.autoClear = prev.autoClear; renderer.setClearColor(prev.color, prev.alpha);
  renderer.shadowMap.enabled = prev.shadows;
  tile.dispose(); copyQuad.geometry.dispose(); (copyQuad.material as MeshBasicMaterial).dispose();
  return { target, frames };
}

/** The impostor field: one instanced quad per site, turned to the camera about its vertical axis. */
export interface ImpostorUniforms { uImpLight: IUniform<Color>; uImpHaze: IUniform<Color> }
export function impostorField(atlas: ImpostorAtlas, sites: readonly ImpostorSite[], uniforms: ImpostorUniforms): InstancedMesh {
  const geo = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
  // (no scene fog: that is the water's own distance haze; the far shore takes the lighter air haze, as its land does)
  const mat = new MeshBasicMaterial({ color: 0xffffff, fog: false });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uImpAtlas = { value: atlas.target.texture };
    sh.uniforms.uImpFrames = { value: atlas.frames };
    sh.uniforms.uImpLight = uniforms.uImpLight;
    sh.uniforms.uImpHaze = uniforms.uImpHaze;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec3 aImp;      // scale, yaw, base
uniform vec2 uImpFrames[${BASES}];
varying vec2 vImpUv;
varying float vImpDist;`)
      .replace('#include <begin_vertex>', `
vec3 impC = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
vec2 toCam = cameraPosition.xz - impC.xz;
vec2 dir = length(toCam) > 1e-4 ? normalize(toCam) : vec2(0.0, 1.0);
// the baked view nearest the camera's bearing in the tree's own frame
float theta = atan(dir.x, dir.y) - aImp.y;
float view = mod(floor(theta / ${(Math.PI * 2 / VIEWS).toFixed(8)} + 0.5), ${VIEWS}.0);
int b = int(aImp.z + 0.5);
vec2 fr = uImpFrames[0];
for (int i = 1; i < ${BASES}; i++) if (i == b) fr = uImpFrames[i];
float s = fr.x * aImp.x;
vec3 transformed = vec3(dir.y, 0.0, -dir.x) * position.x * s + vec3(0.0, position.y * s + fr.y * aImp.x, 0.0);
vImpUv = vec2((view + uv.x) / ${VIEWS}.0, (aImp.z + uv.y) / ${BASES}.0);`)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvImpDist = length(mvPosition.xyz);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uImpAtlas;
uniform vec3 uImpLight, uImpHaze;
varying vec2 vImpUv;
varying float vImpDist;`)
      .replace('#include <map_fragment>', `
vec4 imp = texture2D(uImpAtlas, vImpUv);
// coverage thins in the small mip levels: lower the cut there so the far crowns stay full
float fp = max(fwidth(vImpUv.x) * ${TILE * VIEWS}.0, fwidth(vImpUv.y) * ${TILE * BASES}.0);
if (imp.a < mix(0.5, 0.25, smoothstep(1.0, 6.0, fp))) discard;
// (the atlas is premultiplied by coverage: divide it back out so edges and small mips keep the leaves' colour)
diffuseColor.rgb = imp.rgb / max(imp.a, 1e-3) * uImpLight;`)
      .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uImpHaze, 1.0 - exp(-pow(vImpDist / 2200.0, 2.0)));');
  };
  mat.customProgramCacheKey = () => 'hirugi-impostor-v1';
  const mesh = new InstancedMesh(geo, mat, sites.length);
  const imp = new Float32Array(sites.length * 3), m = new Matrix4(), p = new Vector3();
  sites.forEach((site, i) => {
    mesh.setMatrixAt(i, m.makeTranslation(p.set(site.x, site.y, site.z)));
    imp.set([site.scale, site.yaw, site.base], i * 3);
  });
  geo.setAttribute('aImp', new InstancedBufferAttribute(imp, 3));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  // (the quads are sized and turned in the shader: grow the bounds by the largest tree)
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 12;
  mesh.name = 'MangroveImpostors'; mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}
