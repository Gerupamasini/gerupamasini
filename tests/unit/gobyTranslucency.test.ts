import { closeSync, openSync, readSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MeshPhysicalMaterial, ShaderLib } from 'three';
import { anatomyFor, gobyLodVariant, isGobyBody, makeTranslucentBody, organsFor, type GobyBodyExtras } from '../../src/creatures/species/mahaze/bodyTranslucency';

// The gobies' bodies are translucent on the flat and in the tank, not only in the observation's hero material.
const root = fileURLToPath(new URL('../../', import.meta.url));
/** the body material of a GLB (only its JSON chunk is read: the hero files are 40 MB) */
function body(rel: string): { name: string; extras: GobyBodyExtras } {
  const fd = openSync(root + 'src/assets/models/' + rel, 'r');
  try {
    const head = new Uint8Array(20);
    readSync(fd, head, 0, 20, 0);
    const json = new Uint8Array(new DataView(head.buffer).getUint32(12, true));
    readSync(fd, json, 0, json.length, 20);
    const j = JSON.parse(new TextDecoder().decode(json)) as { materials: { name: string; extras?: { mahaze?: GobyBodyExtras } }[] };
    const m = j.materials.find((mm) => mm.extras?.mahaze?.role === 'body')!;
    return { name: m.name, extras: m.extras!.mahaze! };
  } finally {
    closeSync(fd);
  }
}
const bodyExtras = (rel: string) => body(rel).extras;
const GOBIES = [
  'mahaze/mahaze_juvenile', 'mahaze/mahaze_subadult', 'mahaze/mahaze_adult', 'edohaze/edohaze', 'edohaze/edohaze_gravid',
  'himehaze/himehaze', 'himehaze/himehaze_male',
];

/** the analytic body's normalised superellipse radius at a fish-frame point (as the shader's gbBodyR) */
function bodyR(x: GobyBodyExtras, s: number, y: number, z: number): number {
  const p = x.profile!, f = x.fishFrame!;
  const k = Math.min(p.n - 1, Math.round((s / f.SEND) * (p.n - 1)));
  const [yc, t, b, w, nT, nB] = p.data.slice(k * 6, k * 6 + 6);
  const up = y > yc, n = up ? nT : nB;
  return ((Math.abs(z) / w) ** n + (Math.abs(y - yc) / (up ? t : b)) ** n) ** (1 / n);
}

// (these read the JSON chunks of up to 21 GLBs: generous time for a cold disk right after an install)
const GLB_READS = { timeout: 30_000 };
describe('the goby organs mapped onto each body', GLB_READS, () => {
  it('reproduce the hero material\'s organs in the マハゼ juvenile they were placed in', () => {
    const x = bodyExtras('mahaze/mahaze_juvenile.lod2.glb');
    const o = organsFor(x.profile!, x.fishFrame!);
    const hero: [number, number, number][] = [[13.4, 1.55, 0.2], [17.9, 1.4, -0.1], [16.9, 2.72, 0], [16.8, 3.2, 0], [10.2, 0.9, 0], [6.8, 4.4, 0], [8.3, 3.75, 0.78], [8.3, 3.75, -0.78]];
    hero.forEach(([s, y, z], i) => {
      expect(o[i].c.x).toBeCloseTo(s, 1);
      expect(o[i].c.y).toBeCloseTo(y, 1);
      expect(o[i].c.z).toBeCloseTo(z, 1);
    });
  });

  it('lie inside the body of every species and growth form', () => {
    for (const g of GOBIES) {
      const { name, extras: x } = body(`${g}.lod1.glb`);
      const an = anatomyFor(name, x);
      expect(an.organs.length, g).toBe(8);
      for (const o of an.organs) expect(bodyR(x, o.c.x, o.c.y, o.c.z), `${g} ${o.c.toArray()}`).toBeLessThan(0.95);
      expect(an.column[0], g).toBeGreaterThan(5);
      expect(an.column[1], g).toBeLessThan(x.fishFrame!.SL);
    }
  });

  it('each species has its own: the エドハゼ from its GLB (the gravid one with its ovary), the ヒメハゼ with a white peritoneum', () => {
    const edo = anatomyFor(body('edohaze/edohaze.lod1.glb').name, bodyExtras('edohaze/edohaze.lod1.glb'));
    expect(edo.sigS).toBe(0.8);
    expect(edo.organs[0].c.toArray()).toEqual([12.9, 1.45, 0.2]);
    const gravid = anatomyFor(body('edohaze/edohaze_gravid.lod1.glb').name, bodyExtras('edohaze/edohaze_gravid.lod1.glb'));
    expect(gravid.organs[1].k.toArray()).toEqual([0.25, 0.45, 1.3]);
    const hime = anatomyFor(body('himehaze/himehaze.lod1.glb').name, bodyExtras('himehaze/himehaze.lod1.glb'));
    expect(hime.sigS).toBe(0.75);
    const peri = hime.organs.find((o) => o.s > 0)!;
    expect(peri.k.x).toBeLessThan(0.5);
    // the マハゼ: no dark-free scattering organs, its dark peritoneum
    const ma = anatomyFor(body('mahaze/mahaze_adult.lod1.glb').name, bodyExtras('mahaze/mahaze_adult.lod1.glb'));
    expect(ma.organs.every((o) => o.s === 0)).toBe(true);
    expect(ma.organs[2].k.x).toBe(3.8);
    expect(ma.jaws).toEqual(bodyExtras('mahaze/mahaze_adult.lod1.glb').fishFrame!.jaws);
  });
});

describe('the goby body material', GLB_READS, () => {
  const material = (rel: string) => {
    const m = new MeshPhysicalMaterial({ transmission: 0.5, thickness: 0.008 });
    const b = body(rel);
    m.name = b.name;
    m.userData.mahaze = b.extras;
    return m;
  };
  const compile = (m: MeshPhysicalMaterial) => {
    const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader } as unknown as Parameters<NonNullable<typeof m.onBeforeCompile>>[0];
    m.onBeforeCompile(shader, null as never);
    return shader;
  };

  it('every goby GLB body (all tiers) is recognised', () => {
    for (const g of GOBIES) for (const tier of ['hero', 'lod1', 'lod2']) expect(isGobyBody(material(`${g}.${tier}.glb`)), `${g} ${tier}`).toBe(true);
    const fin = new MeshPhysicalMaterial();
    fin.userData.mahaze = { role: 'fin' };
    expect(isGobyBody(fin)).toBe(false);
  });

  it('is blended by the light that comes through it instead of the glTF transmission pass', () => {
    const m = material('mahaze/mahaze_subadult.lod1.glb');
    makeTranslucentBody(m, 'lod1');
    expect(m.transmission).toBe(0);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(true);
    expect(m.defines).toMatchObject({ STANDARD: '', PHYSICAL: '', USE_UV: '' });
    expect(m.defines?.GB_LOW).toBeUndefined();
    // idempotent: the cached material is prepared again on every variant swap
    const before = m.onBeforeCompile;
    makeTranslucentBody(m, 'lod1');
    expect(m.onBeforeCompile).toBe(before);
  });

  it('works the light path into every stage of three\'s physical shader it needs', () => {
    const m = material('edohaze/edohaze.lod1.glb');
    makeTranslucentBody(m, 'lod1');
    const s = compile(m);
    expect(s.vertexShader).toContain('vGbToWorld = mat3(modelMatrix) * mat3(skinMatrix);');
    expect(s.vertexShader).toContain('vGbWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    expect(s.fragmentShader).toContain('float gbExit(');
    expect(s.fragmentShader).toContain('gbAlpha = clamp(1.0 - dot(T,');
    expect(s.fragmentShader).toContain('gl_FragColor = vec4((base * gbAlpha + add)');
    for (const u of ['uGbProfile', 'uGbPigment', 'uGbFrame', 'uGbOrgC', 'uGbOrgR', 'uGbOrgK']) expect(s.uniforms, u).toHaveProperty(u);
  });

  it('the far tier has its own, lighter program', () => {
    const near = material('mahaze/mahaze_juvenile.lod1.glb'), far = material('mahaze/mahaze_juvenile.lod2.glb');
    makeTranslucentBody(near, 'lod1');
    makeTranslucentBody(far, 'lod2');
    expect(far.defines?.GB_LOW).toBe('');
    expect(near.customProgramCacheKey()).not.toBe(far.customProgramCacheKey());
    // the large organs first (gut, peritoneum, liver): the far tier loops over only those
    const big = (compile(far).uniforms as unknown as { uGbOrgK: { value: { x: number }[] } }).uGbOrgK.value.slice(0, 3).map((k) => k.x).sort();
    expect(big).toEqual([1.0, 1.3, 3.8]);
  });
});

describe('the goby distance tiers\' packed maps (one material for every pattern and colour)', GLB_READS, () => {
  const material = (rel: string) => {
    const m = new MeshPhysicalMaterial();
    const b = body(rel);
    m.name = b.name;
    m.userData.mahaze = b.extras;
    return m;
  };
  const uniforms = (m: MeshPhysicalMaterial) => {
    const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader } as unknown as Parameters<NonNullable<typeof m.onBeforeCompile>>[0];
    m.onBeforeCompile(shader, null as never);
    return { u: shader.uniforms as Record<string, { value: { x: number; y: number; z: number; w?: number } }>, fs: shader.fragmentShader };
  };

  it('the マハゼ tiers carry the nine variants as a table; the other gobies one', () => {
    for (const stage of ['juvenile', 'subadult', 'adult']) {
      const near = bodyExtras(`mahaze/mahaze_${stage}.lod1.glb`).lod!, far = bodyExtras(`mahaze/mahaze_${stage}.lod2.glb`).lod!;
      expect(near).toMatchObject({ packing: 1, variants: 9, colours: 3, patternChannels: 3 });
      expect(far).toMatchObject({ packing: 1, variants: 9, colours: 3, patternChannels: 1 });
      expect(near.morphs!.map((c) => c.name)).toEqual(['standard', 'amber', 'dark']);
      // the standard colour is the one the albedo map is baked in: its factors change nothing
      expect(near.morphs![0]).toMatchObject({ melK: 1, melAdd: 0, xanK: 1, iriK: 1 });
      expect(bodyExtras(`mahaze/mahaze_${stage}.lod1.glb`).pigmentTexture).toBeDefined();
      expect(bodyExtras(`mahaze/mahaze_${stage}.lod2.glb`).pigmentTexture).toBeUndefined();
    }
    for (const g of ['edohaze/edohaze', 'edohaze/edohaze_gravid', 'himehaze/himehaze', 'himehaze/himehaze_male']) {
      expect(bodyExtras(`${g}.lod1.glb`).lod, g).toMatchObject({ packing: 1, variants: 1, colours: 1 });
      expect(bodyExtras(`${g}.lod1.glb`).lod!.morphs, g).toBeUndefined();
    }
  });

  it('a variant gets its own copy of the material, with its pattern\'s melanin and its colour morph', () => {
    const base = material('mahaze/mahaze_adult.lod1.glb');
    const prepare = (m: unknown) => makeTranslucentBody(m as MeshPhysicalMaterial, 'lod1');
    prepare(base);
    expect(base.defines).toMatchObject({ GB_PACKED: '', GB_MORPH: '' });
    expect(gobyLodVariant(base, 'Body', 0, prepare)).toBeNull();
    expect(gobyLodVariant(base, 'Body', 9, prepare)).toBeNull();
    // variant 5: pattern 2 in the dark morph
    const v5 = gobyLodVariant(base, 'Body', 5, prepare) as MeshPhysicalMaterial;
    expect(v5).not.toBe(base);
    expect(gobyLodVariant(base, 'Body', 14, prepare)).toBe(v5);
    expect(gobyLodVariant(base, 'Body', -4, prepare)).toBe(v5);
    expect(v5.customProgramCacheKey()).toBe(base.customProgramCacheKey());
    const { u, fs } = uniforms(v5);
    expect([u.uGbPatSel.value.x, u.uGbPatSel.value.y, u.uGbPatSel.value.z]).toEqual([0, 1, 0]);
    expect(u.uGbMorphK.value.x).toBeCloseTo(1.35);
    expect(fs).toContain('vec3 gbMorphPig(');
    expect(uniforms(base).u.uGbMorphK.value.x).toBe(1);
  });

  it('the observed fish reads its melanin as a density, the distance tiers as a darkening', () => {
    const hero = material('mahaze/mahaze_adult.hero.glb'), near = material('mahaze/mahaze_adult.lod1.glb');
    makeTranslucentBody(hero, 'hero');
    makeTranslucentBody(near, 'lod1');
    expect(hero.defines).toMatchObject({ GB_PACKED: '', GB_MORPH: '', GB_MEL_DENSITY: '' });
    expect(near.defines?.GB_MEL_DENSITY).toBeUndefined();
    expect(hero.customProgramCacheKey()).not.toBe(near.customProgramCacheKey());
    expect(uniforms(hero).fs).toContain('diffuseColor.rgb *= gbDark4(');
  });

  it('the far tier has the first pattern only, but every colour', () => {
    const base = material('mahaze/mahaze_juvenile.lod2.glb');
    const prepare = (m: unknown) => makeTranslucentBody(m as MeshPhysicalMaterial, 'lod2');
    prepare(base);
    const v8 = gobyLodVariant(base, 'Body', 8, prepare) as MeshPhysicalMaterial;
    const { u } = uniforms(v8);
    expect([u.uGbPatSel.value.x, u.uGbPatSel.value.y, u.uGbPatSel.value.z]).toEqual([1, 0, 0]);
    expect(u.uGbMorphK.value.x).toBeCloseTo(1.35);
    expect(u.uGbFarPig.value.x).toBeGreaterThan(0);
    expect(v8.defines).toMatchObject({ GB_LOW: '', GB_PACKED: '' });
  });

  it('the fins take the colour morph\'s tint; the far tier\'s eyes, which share their material, do not', () => {
    const fin = new MeshPhysicalMaterial();
    fin.userData.mahaze = { role: 'fin', lodTints: [[1, 1, 1], [1, 0.88, 0.66], [0.68, 0.62, 0.52]] };
    const amber = gobyLodVariant(fin, 'Fin_Caudal', 4, () => {}) as MeshPhysicalMaterial;
    expect(amber.color.toArray()).toEqual([1, 0.88, 0.66]);
    expect(gobyLodVariant(fin, 'Fin_Caudal', 3, () => {})).toBeNull();
    expect(gobyLodVariant(fin, 'Eye_L', 4, () => {})).toBeNull();
    // a species with one colour: nothing to make
    const plain = new MeshPhysicalMaterial();
    plain.userData.mahaze = { role: 'fin' };
    expect(gobyLodVariant(plain, 'Fin_Caudal', 4, () => {})).toBeNull();
  });
});
