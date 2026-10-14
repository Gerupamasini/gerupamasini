import { closeSync, openSync, readSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MeshPhysicalMaterial, ShaderLib } from 'three';
import { anatomyFor, gobyLook, gobyLookReady, isGobyBody, makeTranslucentBody, organsFor, type GobyBodyExtras } from '../../src/creatures/species/mahaze/bodyTranslucency';
import { morphPick } from '../../src/creatures/species/mahaze/colourMorph.js';

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

  it('the マハゼ wears one of nine looks rebuilt from one set of maps: its pattern\'s melanophores, its colour morph\'s tissue', () => {
    const near = material('mahaze/mahaze_subadult.lod1.glb'), far = material('mahaze/mahaze_subadult.lod2.glb');
    void makeTranslucentBody(near, 'lod1');
    void makeTranslucentBody(far, 'lod2');
    expect(near.defines).toMatchObject({ GB_MORPH: '', GB_NRM_PACKED: '' });
    expect(far.defines).toMatchObject({ GB_MORPH: '', GB_LOW: '' });
    expect(far.defines?.GB_NRM_PACKED).toBeUndefined();
    const s = compile(near);
    // the colour in place of three's map stage, the normal map's x and y (z rebuilt), its roughness and occlusion
    expect(s.fragmentShader).toContain('diffuseColor.rgb *= gbMorphAlbedo(sampledDiffuseColor.rgb, m4.rgb, m4.a, sampledDiffuseColor.a, hn);');
    expect(s.fragmentShader).toContain('mapN.z = sqrt(saturate(1.0 - dot(mapN.xy, mapN.xy)));');
    expect(s.fragmentShader).toContain('roughnessFactor = gbN4.a;');
    expect(s.fragmentShader).toContain('float ambientOcclusion = (gbN4.b - 1.0) * uGbAoStrength + 1.0;');
    type U = { uGbMorphPattern: { value: { toArray(): number[] } }; uGbMorphK: { value: { x: number; y: number } }; uGbMorphCol: { value: { x: number }[] } };
    // the first pattern in the standard colour, unless the material wears another look
    expect((s.uniforms as unknown as U).uGbMorphPattern.value.toArray()).toEqual([1, 0, 0]);
    const look = material('mahaze/mahaze_subadult.lod1.glb');
    (look.userData.mahaze as GobyBodyExtras).morph = { pattern: 2, color: 2 };
    void makeTranslucentBody(look, 'lod1');
    const u = compile(look).uniforms as unknown as U;
    const dark = bodyExtras('mahaze/mahaze_subadult.lod1.glb').morphs!.colors[2];
    expect(dark.name).toBe('dark');
    expect(u.uGbMorphPattern.value.toArray()).toEqual([0, 0, 1]);
    expect([u.uGbMorphK.value.x, u.uGbMorphK.value.y]).toEqual([dark.melK, dark.melAdd]);
    expect(u.uGbMorphCol.value[0].x).toBe(dark.base[0]);
    // one program for every look
    expect(look.customProgramCacheKey()).toBe(near.customProgramCacheKey());
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

describe('the マハゼ\'s looks: one body and one fin material per file, a copy per pattern and colour', GLB_READS, () => {
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
    return { u: shader.uniforms as Record<string, { value: { x: number; y: number; z: number; w?: number; toArray(): number[] } }>, fs: shader.fragmentShader };
  };

  it('every level of the マハゼ carries the nine looks as a table; the other gobies none', () => {
    for (const stage of ['juvenile', 'subadult', 'adult'])
      for (const tier of ['hero', 'lod1', 'lod2']) {
        const x = bodyExtras(`mahaze/mahaze_${stage}.${tier}.glb`);
        expect(x.morphs!.colors.map((c) => c.name), `${stage} ${tier}`).toEqual(['standard', 'amber', 'dark']);
        // the standard colour is the one the ground map is baked in: its factors change nothing
        expect(x.morphs!.colors[0], `${stage} ${tier}`).toMatchObject({ melK: 1, melAdd: 0, xanK: 1, iriK: 1 });
        // every level holds the three patterns' melanophores (the far one too: a fish keeps its pattern as it nears)
        expect(x.channels?.pigment, `${stage} ${tier}`).toBe('melanin3+iridophores');
        expect(x.pigmentTexture, `${stage} ${tier}`).toBeDefined();
      }
    for (const g of ['edohaze/edohaze', 'edohaze/edohaze_gravid', 'himehaze/himehaze', 'himehaze/himehaze_male'])
      for (const tier of ['hero', 'lod1', 'lod2']) expect(bodyExtras(`${g}.${tier}.glb`).morphs, `${g} ${tier}`).toBeUndefined();
  });

  it('a look gets its own copy of the material, with its pattern\'s melanophores and its colour morph', async () => {
    const base = material('mahaze/mahaze_adult.lod1.glb');
    const morphs = (base.userData.mahaze as GobyBodyExtras).morphs!;
    const prepare = (m: unknown) => makeTranslucentBody(m as MeshPhysicalMaterial, 'lod1');
    await prepare(base);
    expect(base.defines).toMatchObject({ GB_MORPH: '', GB_NRM_PACKED: '' });
    expect(gobyLook(base, morphs, morphPick(morphs, 0), prepare)).toBe(base);
    expect(gobyLook(base, morphs, morphPick(morphs, 9), prepare)).toBe(base);
    // look 5: pattern 2 in the dark morph
    const v5 = gobyLook(base, morphs, morphPick(morphs, 5), prepare) as MeshPhysicalMaterial;
    expect(v5).not.toBe(base);
    expect(gobyLook(base, morphs, morphPick(morphs, 14), prepare)).toBe(v5);
    expect(gobyLook(base, morphs, morphPick(morphs, -4), prepare)).toBe(v5);
    await gobyLookReady(v5);
    expect(v5.customProgramCacheKey()).toBe(base.customProgramCacheKey());
    expect(v5.name).toBe('Mahaze_Body_p2_dark');
    const { u, fs } = uniforms(v5);
    expect(u.uGbMorphPattern.value.toArray()).toEqual([0, 1, 0]);
    expect(u.uGbMorphK.value.x).toBeCloseTo(1.35);
    expect(fs).toContain('vec3 gbMorphPig(');
    expect(uniforms(base).u.uGbMorphK.value.x).toBe(1);
    // the asset's own material keeps its look
    expect((base.userData.mahaze as GobyBodyExtras).morph).toBeUndefined();
  });

  it('the far level keeps every pattern and every colour', () => {
    const base = material('mahaze/mahaze_juvenile.lod2.glb');
    const morphs = (base.userData.mahaze as GobyBodyExtras).morphs!;
    const prepare = (m: unknown) => makeTranslucentBody(m as MeshPhysicalMaterial, 'lod2');
    void prepare(base);
    const v8 = gobyLook(base, morphs, morphPick(morphs, 8), prepare) as MeshPhysicalMaterial;
    const { u } = uniforms(v8);
    expect(u.uGbMorphPattern.value.toArray()).toEqual([0, 0, 1]);
    expect(u.uGbMorphK.value.x).toBeCloseTo(1.35);
    expect(v8.defines).toMatchObject({ GB_LOW: '', GB_MORPH: '' });
  });

  it('the fins take the colour morph\'s tint and melanophore factor, shared by the patterns; eyes and plain species keep theirs', () => {
    const morphs = bodyExtras('mahaze/mahaze_adult.lod1.glb').morphs!;
    const fin = new MeshPhysicalMaterial();
    fin.name = 'Mahaze_Fin';
    fin.userData.mahaze = { role: 'fin', tint: [1, 1, 1], melK: 1 };
    const amber = gobyLook(fin, morphs, morphPick(morphs, 4), () => Promise.resolve()) as MeshPhysicalMaterial;
    expect(amber.color.toArray()).toEqual(morphs.colors[1].fin.tint);
    expect((amber.userData.mahaze as { melK: number }).melK).toBe(morphs.colors[1].fin.melK);
    // the same tint for every pattern: one copy
    expect(gobyLook(fin, morphs, morphPick(morphs, 1), () => Promise.resolve())).toBe(amber);
    expect(gobyLook(fin, morphs, morphPick(morphs, 3), () => Promise.resolve())).toBe(fin);
    const eye = new MeshPhysicalMaterial();
    eye.userData.mahaze = { role: 'eye' };
    expect(gobyLook(eye, morphs, morphPick(morphs, 4), () => Promise.resolve())).toBe(eye);
  });
});
