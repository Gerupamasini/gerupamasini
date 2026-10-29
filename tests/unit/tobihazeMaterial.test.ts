import { existsSync, closeSync, openSync, readSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Bone, BufferGeometry, Group, MeshPhysicalMaterial, MeshStandardMaterial, ShaderLib, Skeleton, SkinnedMesh, type Material, type Mesh } from 'three';
import {
  bodyChannels, instanceTobihaze, isTobihazeMaterial, prepareTobihazeMaterials, tobihazeTraits, tobihazeUniformsOf, TobihazeLook,
  type TobiLookState,
} from '../../src/creatures/species/tobihaze/material';

// The トビハゼ's materials at run time (src/creatures/species/tobihaze/material.ts): the GLB's extras read, the rules
// worked into three's shaders (every anchor found), one copy of the shared materials per instance with its own uniforms,
// the driver's look carried into them before a draw.
const root = fileURLToPath(new URL('../../', import.meta.url));

/** the materials of a GLB's JSON chunk (the hero file is 20 MB: the chunk only) */
function glbMaterials(rel: string): { name: string; extras?: { tobihaze?: Record<string, unknown> }; alphaMode?: string; extensions?: Record<string, unknown> }[] | null {
  const file = root + 'src/assets/models/' + rel;
  if (!existsSync(file)) return null;
  const fd = openSync(file, 'r');
  try {
    const head = new Uint8Array(20);
    readSync(fd, head, 0, 20, 0);
    const json = new Uint8Array(new DataView(head.buffer).getUint32(12, true));
    readSync(fd, json, 0, json.length, 20);
    return (JSON.parse(new TextDecoder().decode(json)) as { materials: never[] }).materials;
  } finally {
    closeSync(fd);
  }
}

// round T2's extras, as tools/models/tobihaze/build.mjs wrote them (the parts the runtime reads)
const T2_CHANNELS = {
  R: 'the film: the clearcoat at the master wetness (clearcoatTexture)',
  G: 'the roughness at the master wetness (metallicRoughnessTexture; the clearcoat\'s roughness = G × clearcoatRoughnessFactor)',
  B: 'the wet retention (the rule\'s retain; metallicFactor 0)',
  A: 'the ambient occlusion (three\'s aoMap reads R: the runtime applies A to the indirect light)',
};
const T3_CHANNELS = {
  R: 'the ambient occlusion (occlusionTexture: every glTF renderer applies it — three to the indirect diffuse, the indirect specular and the clearcoat\'s indirect specular)',
  G: 'the roughness at the master wetness (metallicRoughnessTexture; the clearcoat\'s roughness = G × clearcoatRoughnessFactor through clearcoatRoughnessTexture)',
  B: 'the metalness, 0 (metallicFactor 0 too)',
  A: 'the wet retention (the rule\'s retain; only the runtime reads it)',
};
const WET = {
  wet: { roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.07, albedo: 0.85, saturation: 1.1, skinSpecular: 0.2 },
  damp: { roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.16 }, dry: { roughness: 0.6 },
  mud: { roughness: 0.7, colour: '#8e8a82', ventral: [0.15, 0.75] }, gamma: 1.2, carry: 0.5,
};
const TRANS = { diffuse: 0.8, tintPower: 0.8, forward: 2, forwardPower: 4, environment: 0, stopAlpha: [0.93, 0.99] };

/** a hero file's four materials with round T2's extras */
function heroMaterials(): { body: MeshPhysicalMaterial; fin: MeshPhysicalMaterial; finOpaque: MeshPhysicalMaterial; eye: MeshPhysicalMaterial } {
  const tex = () => ({ isTexture: true, channel: 0 }) as never;
  const body = new MeshPhysicalMaterial({ map: tex(), roughnessMap: tex(), metalnessMap: tex(), normalMap: tex(), clearcoat: 1, clearcoatMap: tex(), clearcoatRoughness: 0.2, clearcoatRoughnessMap: tex(), specularIntensity: 0.25, ior: 1.37 });
  body.name = 'Tobihaze_Body';
  body.userData.tobihaze = { role: 'body', runtime: { wetness: { default: 0.65, master: { wetness: 0.65, map: 'body_film_rough_retain_ao' }, WET, channels: T2_CHANNELS, specularOcclusion: { min: 0.25, ao: [0.15, 0.85] } }, tint: {} } };
  const fin = new MeshPhysicalMaterial({ map: tex(), transparent: true, roughness: 0.4395, ior: 1.36 });
  fin.name = 'Tobihaze_Fin';
  fin.userData.tobihaze = { role: 'fin', blend: { depthWrite: true }, runtime: { wetness: { default: 0.65, fin: { master: 0.65, wet: 0.38, dry: 0.55, albedo: 0.85 } }, translucency: TRANS } };
  const finOpaque = new MeshPhysicalMaterial({ map: tex(), roughness: 0.4395, ior: 1.36 });
  finOpaque.name = 'Tobihaze_FinOpaque';
  // (round T2's opaque fins refer to the blended one's rule: "as Tobihaze_Fin")
  finOpaque.userData.tobihaze = { role: 'fin', pass: 'opaque', runtime: { ref: 'as Tobihaze_Fin', translucency: TRANS } };
  const eye = new MeshPhysicalMaterial({ map: tex(), roughnessMap: tex(), normalMap: tex(), clearcoat: 1, clearcoatRoughness: 0.4, ior: 1.376 });
  eye.name = 'Tobihaze_Eye';
  eye.userData.tobihaze = {
    role: 'eye', irisRect: [0.796, 0.746, 0.15, 0.12], skinRect: [0.796, 0.876, 0.15, 0.12],
    runtime: { pupil: { teal: [0.02843, 0.11193, 0.11697], variants: { teal: [0.02843, 0.11193, 0.11697], red: [0.14413, 0.0356, 0.01938], black: [0.00335, 0.007, 0.007] } } },
  };
  return { body, fin, finOpaque, eye };
}

/** the patched shaders of a prepared material: its hook run on three's own physical (or standard) program */
function patched(m: Material): { vertex: string; fragment: string; uniforms: Record<string, unknown> } {
  const lib = (m as MeshPhysicalMaterial).isMeshPhysicalMaterial ? ShaderLib.physical : ShaderLib.standard;
  const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as unknown as Parameters<NonNullable<typeof m.onBeforeCompile>>[0];
  m.onBeforeCompile(shader, null as never);
  return { vertex: shader.vertexShader, fragment: shader.fragmentShader, uniforms: shader.uniforms };
}

/** a skinned model of the four materials, with the joints the body's shadow rides */
function model(mats: Material[]): { root: Group; meshes: Mesh[] } {
  const root = new Group();
  const jroot = new Bone(), jsp4 = new Bone();
  jroot.name = 'J_root'; jsp4.name = 'J_sp4';
  jroot.position.set(0, 0, 0.0205); jsp4.position.set(0, -0.0009, -0.027);
  jroot.add(jsp4);
  root.add(jroot);
  const skeleton = new Skeleton([jroot, jsp4]);
  const meshes = mats.map((m, i) => { const s = new SkinnedMesh(new BufferGeometry(), m); s.name = `part${i}`; s.bind(skeleton); root.add(s); return s as Mesh; });
  root.updateMatrixWorld(true);
  return { root, meshes };
}

describe('the packed body map\'s channels from the extras', () => {
  it('round T2: R the film, B the retention, A the occlusion', () => {
    expect(bodyChannels({ runtime: { wetness: { channels: T2_CHANNELS } } })).toEqual({ retain: 'b', ao: 'a', film: 'r' });
  });
  it('round T3: R the occlusion, A the retention, no film channel', () => {
    expect(bodyChannels({ runtime: { wetness: { channels: T3_CHANNELS } } })).toEqual({ retain: 'a', ao: 'r', film: null });
  });
  it('by the map\'s name when the notes are missing', () => {
    expect(bodyChannels({ runtime: { wetness: { master: { map: 'body_occlusion_roughness_metal_retain' } } } })).toEqual({ retain: 'a', ao: 'r', film: null });
    expect(bodyChannels({ runtime: { wetness: { master: { map: 'body_film_rough_retain_ao' } } } })).toEqual({ retain: 'b', ao: 'a', film: 'r' });
  });
  it('the GLB masters, where they are in the tree', () => {
    for (const tier of ['hero', 'lod1']) {
      const mats = glbMaterials(`tobihaze/tobihaze.${tier}.glb`);
      if (!mats) continue;
      const body = mats.find((m) => m.extras?.tobihaze?.role === 'body')!;
      const ch = bodyChannels(body.extras!.tobihaze as never);
      // the retention is the channel the build's notes give it (T2 B, T3 A), and the film is never the occlusion
      expect(['a', 'b']).toContain(ch.retain);
      expect(ch.film).not.toBe(ch.ao);
    }
  });
});

describe('the shared materials, readied a file at a time', () => {
  const m = heroMaterials();
  prepareTobihazeMaterials([m.body, m.fin, m.finOpaque, m.eye], 'hero');

  it('the blended fins write depth; the others keep theirs', () => {
    expect(isTobihazeMaterial(m.fin)).toBe(true);
    expect(m.fin.depthWrite).toBe(true);
    expect(m.finOpaque.transparent).toBe(false);
  });
  it('every rule is worked into three\'s physical shader (each anchor found once)', () => {
    const body = patched(m.body), fin = patched(m.fin), opaque = patched(m.finOpaque), eye = patched(m.eye);
    for (const s of [body, fin, opaque, eye]) {
      expect(s.vertex).toContain('vTbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      expect(s.fragment).toContain('uniform vec4 uTbState;');
      for (const inc of ['map_fragment', 'lights_physical_fragment', 'roughnessmap_fragment', 'metalnessmap_fragment', 'lights_fragment_end', 'aomap_fragment', 'lights_physical_pars_fragment']) {
        expect(s.fragment.split(`#include <${inc}>`).length - 1, inc).toBe(1);
      }
      expect(Object.keys(s.uniforms)).toEqual(expect.arrayContaining(['uTbState', 'uTbTint', 'uTbLift', 'uTbPupil', 'uTbFlags', 'uTbRules', 'uTbBodyA', 'uTbBodyB']));
    }
    // the skin: the wet rule on the retention (B), the film moved from the master, the T2 occlusion (A) on the indirect light
    expect(body.fragment).toContain('ret = texelRoughness.b');
    expect(body.fragment).toContain('material.clearcoat = saturate(material.clearcoat + (tbCc - tbCc0) * tbSo)');
    expect(body.fragment).toContain('texelRoughness.a, uTbRules.x');
    expect(body.fragment).toContain('diffuseColor.rgb *= 1.0 - 0.6 * uTbState.z * tbA');
    // the fins: their own wet rule relative to the master (0.55 + (0.38 − 0.55)·0.65 = 0.4395), the light through them,
    // the body's shadow on their direct light
    expect(fin.fragment).toContain('/ 0.4395');
    expect(fin.fragment).toContain('#define RE_Direct RE_Direct_Tobihaze');
    expect(fin.fragment).toContain('reflectedLight.directDiffuse += tint * e * RECIPROCAL_PI * uTbRules.y');
    // the opaque fins take the blended one's rule from the file (their extras say "as Tobihaze_Fin") and stop the light
    // through their solid parts
    expect(opaque.fragment).toContain('/ 0.4395');
    expect(opaque.fragment).toContain('smoothstep(0.93, 0.99, diffuseColor.a)');
    // the eye: the pupil's colour in the iris rect, the tint on the caps only, no wet rule and no bars
    expect(eye.fragment).toContain('tbIn(vMapUv, vec4(0.796, 0.746, 0.15, 0.12))');
    expect(eye.fragment).toContain('tbIn(vMapUv, vec4(0.796, 0.876, 0.15, 0.12))');
    expect(eye.fragment).not.toContain('tbRr =');
    expect(eye.fragment).not.toContain('uTbState.z * tbA');
  });
  it('lod2: the far body\'s roughness and colour rule, masked fins (no depth-write change)', () => {
    const tex = () => ({ isTexture: true, channel: 0 }) as never;
    const body = new MeshStandardMaterial({ map: tex(), roughness: 0.45 });
    body.userData.tobihaze = { role: 'body', runtime: { ref: 'the hero file\'s', master: { wetness: 0.65 }, roughness: { wet: 0.35, dry: 0.6 } } };
    const fins = new MeshStandardMaterial({ map: tex(), alphaTest: 0.5, roughness: 0.5 });
    fins.userData.tobihaze = { role: 'fin', merged: true, runtime: { ref: 'the hero file\'s', master: { wetness: 0.65 }, fin: { master: 0.65, wet: 0.38, dry: 0.55, albedo: 0.85 }, translucency: { ...TRANS, stopAlpha: null } } };
    prepareTobihazeMaterials([body, fins], 'lod2');
    const b = patched(body).fragment, f = patched(fins).fragment;
    // (the extras' rule as an offset from the static factor, the identity at the master: 0.45 + (0.6 − 0.35)·(0.65 − w))
    expect(b).toContain('roughnessFactor + 0.25 * (0.65 - w)');
    expect(b).not.toContain('tbRr =');
    expect(f).toContain('vec3 tint = 0.8 * 1.0 *');
    expect(fins.depthWrite).toBe(true);
    expect(fins.transparent).toBe(false);
  });
  it('is idempotent, and leaves any other file\'s materials alone', () => {
    const before = m.body.onBeforeCompile;
    prepareTobihazeMaterials([m.body], 'hero');
    expect(m.body.onBeforeCompile).toBe(before);
    const other = new MeshStandardMaterial();
    other.userData.mahaze = { role: 'body' };
    const hook = other.onBeforeCompile;
    prepareTobihazeMaterials([other], 'hero');
    expect(other.onBeforeCompile).toBe(hook);
  });
});

describe('the instances: their own materials, one program', () => {
  const m = heroMaterials();
  prepareTobihazeMaterials([m.body, m.fin, m.finOpaque, m.eye], 'hero');
  const a = model([m.body, m.fin, m.finOpaque, m.eye]), b = model([m.body, m.fin, m.finOpaque, m.eye]);
  instanceTobihaze(a.meshes, 80);
  instanceTobihaze(b.meshes, 80);

  it('each instance draws copies of the shared materials, under the shared material\'s program key', () => {
    for (let i = 0; i < 4; i++) {
      const ma = a.meshes[i].material as Material, mb = b.meshes[i].material as Material;
      expect(ma).not.toBe(mb);
      expect(ma).not.toBe([m.body, m.fin, m.finOpaque, m.eye][i]);
      expect(ma.customProgramCacheKey()).toBe(mb.customProgramCacheKey());
      expect(ma.customProgramCacheKey()).toBe([m.body, m.fin, m.finOpaque, m.eye][i].customProgramCacheKey());
      expect(ma.customProgramCacheKey()).toMatch(/^tobihaze-/);
    }
    expect(tobihazeUniformsOf(a.meshes[0])).not.toBe(tobihazeUniformsOf(b.meshes[0]));
    // (one uniform set per instance, all its materials)
    expect(tobihazeUniformsOf(a.meshes[3])).toBe(tobihazeUniformsOf(a.meshes[0]));
  });
  it('the fins cast their shadow by coverage (one depth material per fin atlas, shared)', () => {
    const da = a.meshes[1].customDepthMaterial as { alphaHash?: boolean } | undefined, db = b.meshes[1].customDepthMaterial;
    expect(da?.alphaHash).toBe(true);
    expect(db).toBe(da);
    expect((a.meshes[2].customDepthMaterial as { alphaHash?: boolean }).alphaHash).toBe(false);
    expect(a.meshes[0].customDepthMaterial).toBeUndefined();
  });
  it('the defaults are the static GLB: the master wetness, no tint, no water, the body\'s shadow ready', () => {
    const U = tobihazeUniformsOf(a.meshes[0])!;
    expect(U.uTbState.value.toArray()).toEqual([0.65, 0, 0, 0]);
    expect(U.uTbFlags.value.x).toBe(0);
    expect(U.uTbFlags.value.z).toBe(0);
    expect(U.uTbFlags.value.w).toBe(1);
  });
  it('the driver\'s look reaches the uniforms before a draw', () => {
    const look: TobiLookState = { wet: 0.2, mud: 0.5, bars: 1, dark: 0.3, waterY: 0.004, id: 'periophthalmus_modestus#00c0ffee', variation: { tint: { hueDeg: [-6, 6], sat: [0.85, 1.1], val: [0.85, 1.05] } } };
    for (const mesh of a.meshes) mesh.userData.tobihazeLook = look;
    a.root.position.set(1, 2, 3);
    a.root.updateMatrixWorld(true);
    const sync = a.meshes[2].onBeforeRender as unknown as (r: { info: { render: { frame: number } } }) => void;
    sync({ info: { render: { frame: 1 } } });
    const U = tobihazeUniformsOf(a.meshes[0])!;
    expect(U.uTbState.value.toArray().map((v) => +v.toFixed(4))).toEqual([0.2, 0.5, 1, 0.3]);
    // (the water in the root's frame: no parent, the world)
    expect(U.uTbFlags.value.z).toBe(1);
    expect(U.uTbFlags.value.y).toBeCloseTo(0.004, 6);
    expect(U.uTbFlags.value.x).toBe(1);
    // the individual's own colours, from its id
    const t = tobihazeTraits(look.id!, look.variation);
    expect(U.uTbTint.value.x).toBeCloseTo(t.tint.hueDeg, 6);
    // the body's ellipsoids follow the bones: J_root's frame, the root moved
    const e = U.uTbBodyA.value.elements;
    expect(e.every(Number.isFinite)).toBe(true);
    expect(Math.abs(e[12]) + Math.abs(e[13]) + Math.abs(e[14])).toBeGreaterThan(1);
    // once per render call: a second mesh in the same call does not redo it
    look.wet = 0.9;
    (a.meshes[0].onBeforeRender as unknown as typeof sync)({ info: { render: { frame: 1 } } });
    expect(U.uTbState.value.x).toBeCloseTo(0.2, 6);
    (a.meshes[0].onBeforeRender as unknown as typeof sync)({ info: { render: { frame: 2 } } });
    expect(U.uTbState.value.x).toBeCloseTo(0.9, 6);
    // the other fish untouched
    expect(tobihazeUniformsOf(b.meshes[0])!.uTbState.value.x).toBe(0.65);
  });
  it('submerged without a water level: the water above everything', () => {
    for (const mesh of b.meshes) mesh.userData.tobihazeLook = { wet: 1, submerged: true };
    (b.meshes[0].onBeforeRender as unknown as (r: { info: { render: { frame: number } } }) => void)({ info: { render: { frame: 7 } } });
    const U = tobihazeUniformsOf(b.meshes[0])!;
    expect(U.uTbFlags.value.z).toBe(1);
    expect(U.uTbFlags.value.y).toBeGreaterThan(100);
  });
  it('without a look, a model loaded for an individual (its variant) wears that individual\'s pupil', () => {
    const m2 = heroMaterials();
    prepareTobihazeMaterials([m2.body, m2.fin, m2.finOpaque, m2.eye], 'hero');
    // (a variant whose pupil is the reddish-brown one, and the same individual's id on the flat)
    let variant = 0;
    while (tobihazeTraits(variant).pupil !== 'red') variant++;
    const c = model([m2.body, m2.fin, m2.finOpaque, m2.eye]);
    instanceTobihaze(c.meshes, 80, variant);
    (c.meshes[3].onBeforeRender as unknown as (r: { info: { render: { frame: number } } }) => void)({ info: { render: { frame: 1 } } });
    const U = tobihazeUniformsOf(c.meshes[3])!;
    expect(U.uTbPupil.value.w).toBe(1);
    expect(U.uTbPupil.value.x).toBeCloseTo(0.14413, 5);
    // (no tint without the species' variation; the state stays the static master)
    expect(U.uTbFlags.value.x).toBe(0);
    expect(U.uTbState.value.x).toBe(0.65);
  });
  it('the helper hangs one look on every mesh and fills it from a frame and the floor', () => {
    const look = new TobihazeLook('periophthalmus_modestus#1');
    look.attach(a.meshes);
    expect(a.meshes.every((mesh) => mesh.userData.tobihazeLook === look.state)).toBe(true);
    a.root.position.set(0.5, 0, -2);
    look.update({ skin: { wet: 0.4, mud: 0.1 }, colour: { bars: 0, dark: 0 } }, { waterAt: (x, z) => (x === 0.5 && z === -2 ? -0.12 : NaN) }, a.root);
    expect(look.state).toMatchObject({ wet: 0.4, mud: 0.1, bars: 0, dark: 0, waterY: -0.12 });
  });
});

describe('an individual\'s colours', () => {
  it('stable by its id, inside the species\' ranges, about a third with the reddish-brown pupil', () => {
    const v = { tint: { hueDeg: [-6, 6] as [number, number], sat: [0.85, 1.1] as [number, number], val: [0.85, 1.05] as [number, number] } };
    expect(tobihazeTraits('periophthalmus_modestus#abc', v)).toEqual(tobihazeTraits('periophthalmus_modestus#abc', v));
    let red = 0;
    for (let i = 0; i < 2000; i++) {
      const t = tobihazeTraits(`periophthalmus_modestus#${i.toString(16).padStart(8, '0')}`, v);
      expect(t.tint.hueDeg).toBeGreaterThanOrEqual(-6); expect(t.tint.hueDeg).toBeLessThanOrEqual(6);
      expect(t.tint.sat).toBeGreaterThanOrEqual(0.85); expect(t.tint.sat).toBeLessThanOrEqual(1.1);
      expect(t.tint.val).toBeGreaterThanOrEqual(0.85); expect(t.tint.val).toBeLessThanOrEqual(1.05);
      if (t.pupil === 'red') red++;
    }
    expect(red / 2000).toBeGreaterThan(0.3);
    expect(red / 2000).toBeLessThan(0.4);
  });
});
