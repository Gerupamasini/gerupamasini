import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MeshPhysicalMaterial, ShaderLib } from 'three';
import { anatomyFor, isGobyBody, makeTranslucentBody, organsFor, type GobyBodyExtras } from '../../src/creatures/species/mahaze/bodyTranslucency';

// The gobies' bodies are translucent on the flat and in the tank, not only in the observation's hero material.
const root = fileURLToPath(new URL('../../', import.meta.url));
function body(rel: string): { name: string; extras: GobyBodyExtras } {
  const buf = readFileSync(root + 'src/assets/models/' + rel);
  const len = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as { materials: { name: string; extras?: { mahaze?: GobyBodyExtras } }[] };
  const m = j.materials.find((mm) => mm.extras?.mahaze?.role === 'body')!;
  return { name: m.name, extras: m.extras!.mahaze! };
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

describe('the goby organs mapped onto each body', () => {
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

describe('the goby body material', () => {
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
