import type { MulletForm } from './anatomy';

/** A GLSL float literal. */
export const f = (x: number): string => x.toFixed(5);

/** a GLSL function through a table of (x, y) points, linear between them, clamped at the ends */
export function glslTable(name: string, pts: readonly (readonly [number, number])[]): string {
  let body = `float y = ${f(pts[0][1])};\n`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    body += `  y = mix(y, ${f(y0)} + (${f(y1 - y0)}) * clamp((x - ${f(x0)}) / ${f(x1 - x0)}, 0.0, 1.0), step(${f(x0)}, x));\n`;
  }
  return `float ${name}(float x) {\n  ${body}  return y;\n}\n`;
}

/*
 * The pieces of the body's surface that every form of the young mullet shares (materials.ts puts a form's surface
 * together from them and its own skin): the eye, the lips, the shading of the mouth and the gill cover that are
 * geometry on the near tier, the far tiers' stand-ins for them, and the gills in the chamber under the opercle.
 * They are GLSL in the body's colour stage (materials.ts, bodyMaterial): `s`, `cd`, `h`, `part` and `col` in scope.
 */

/**
 * The eye (aPart 1): a silver iris, brightest round the black pupil and greyer to the thin dark rim, pale yellow low and
 * forward; `gold` puts a ring of gold round it (the スバシリ's). The cornea glossy over it.
 */
export function eyeGLSL(F: MulletForm, gold = 0): string {
  return `
  if (part > 0.5 && part < 1.5) {
    // ---- the eye: a silver iris, brightest round the black pupil and greyer to the thin dark rim; pale yellow low and
    // forward; the cornea glossy over it
    vec2 e = vPat;
    float r = length(e);
    vec2 pc = e + vec2(0.0, 0.05);
    float pupil = 1.0 - smoothstep(${f(F.eye.pupil - 0.015)}, ${f(F.eye.pupil + 0.012)}, length(pc * vec2(1.0, 1.04)));
    float rp = length(pc);
    float ang = atan(e.y, e.x);
    // the iris's own radius: from the pupil's edge (as wide as the ハク's) out to the rim
    float ri = ${F.eye.pupil === 0.335 ? 'r' : `0.335 + (r - ${f(F.eye.pupil)}) * ${f(0.665 / (1 - F.eye.pupil))}`};
    float mott = 0.95 + 0.05 * hkNoise(vec2(ang * 9.0, r * 5.0)) + 0.03 * hkNoise(vec2(ang * 30.0, r * 4.0));
    // bright silver round the pupil, light grey toward the rim, a brighter crescent just inside the rim high and forward
    vec3 iris = mix(vec3(0.82, 0.82, 0.81), vec3(0.6, 0.61, 0.62), smoothstep(0.4, 0.62, ri));
    iris = mix(iris, vec3(0.4, 0.41, 0.43), smoothstep(0.74, 0.9, ri)) * mott;
    iris = mix(iris, vec3(0.9, 0.9, 0.89), 0.5 * smoothstep(0.72, 0.88, ri) * (1.0 - smoothstep(0.9, 0.95, ri)) * smoothstep(-0.1, 0.6, e.y + 0.6 * e.x));
    iris = mix(iris, vec3(0.86, 0.85, 0.62), 0.5 * smoothstep(0.0, -0.5, e.y) * smoothstep(-0.3, 0.35, e.x) * smoothstep(0.75, 0.45, rp));
    iris *= 1.0 - 0.2 * (1.0 - smoothstep(${f(F.eye.pupil)}, ${f(F.eye.pupil + 0.07)}, rp));
    iris *= 1.0 - 0.22 * smoothstep(0.8, 0.94, r) * smoothstep(0.1, 0.8, e.y - 0.4 * e.x);
    // the thin dark rim, and past it the skin closing over the eye
    float aa = max(fwidth(r), 0.004);
    float rim = smoothstep(0.915 - aa, 0.915 + aa, r) * (1.0 - smoothstep(0.995, 1.03, r));
    vec3 skin = vec3(0.86, 0.86, 0.86);
    col = mix(iris, skin, smoothstep(0.985, 1.02, r));
    col = mix(col, vec3(0.06, 0.06, 0.065), rim);
    col = mix(col, vec3(0.0), pupil);
    hkMetal = mix(mix(0.6, 0.05, rim), 0.0, pupil);
    hkMetal = mix(hkMetal, 0.8, smoothstep(1.0, 1.04, r));
    hkRough = mix(0.26, 0.1, pupil);
    hkCoat = 1.0 - smoothstep(0.985, 1.02, r);
${gold > 0 ? goldRing(F, gold) : ''}`;
}

/** a ring of gold in the outer iris, brightest above, and a thin bright line round the pupil */
function goldRing(F: MulletForm, gold: number): string {
  return `
    {
      float ring = smoothstep(0.52, 0.66, r) * (1.0 - smoothstep(0.86, 0.94, r)) * (0.55 + 0.45 * smoothstep(-0.7, 0.5, e.y));
      vec3 g = vec3(0.92, 0.74, 0.22) * (0.85 + 0.15 * mott);
      // (the iris under the gold a warm cream, not the ハク's grey)
      col = mix(col, col * vec3(1.06, 1.0, 0.84), ${f(gold)} * (1.0 - pupil) * (1.0 - rim) * smoothstep(1.0, 0.9, r));
      col = mix(col, g, ${f(gold)} * ring * (1.0 - pupil));
      float lid = (1.0 - smoothstep(0.0, 0.035, abs(rp - ${f(F.eye.pupil + 0.025)}))) * (1.0 - pupil);
      col = mix(col, vec3(0.95, 0.93, 0.85), 0.5 * lid);
      hkMetal = mix(hkMetal, 0.75, ${f(gold)} * ring * 0.6);
    }`;
}

/** the lips: the rolls either side of the gape (geometry), pale and translucent; gapeH the gape's height at s */
export function lipsGLSL(F: MulletForm): string {
  return `
    // the lips: the rolls either side of the gape (geometry), pale and translucent
    float gapeH = ${f(F.gape.y0)} + (${f(F.gape.y1)} - ${f(F.gape.y0)}) * clamp(s / ${f(F.gape.s)}, 0.0, 1.0);
    float lips = (1.0 - smoothstep(${f(F.gape.s - 0.004)}, ${f(F.gape.s + 0.006)}, s))
      * (h > gapeH ? 1.0 - smoothstep(0.011, 0.016, h - gapeH) : 1.0 - smoothstep(0.02, 0.027, gapeH - h));
`;
}

/**
 * The gill cover and the cheek: the plates' parts (aPart 0.3 the preopercle, 0.35 → 0.39 the opercle's bone → its
 * flap), the gill chamber (up to 0.16), the shadows in the lee of the free edges, the crumpled-foil cheek, the orbit,
 * the nostrils. Needs `band` (the dorsal band, 0..1).
 */
export function structureGLSL(F: MulletForm): string {
  return `
    // ---- the gill cover is in the geometry: plates (aPart 0.3 the preopercle, 0.35 → 0.39 the opercle's bone → its
    // membranous flap) over the gill chamber (aPart up to 0.15 on the skin beneath), which shows its red gills when the
    // cover swings open
    float near = step(0.005, part) * step(part, 0.2);
    float preopP = step(0.25, part) * step(part, 0.32);
    float operP = step(0.33, part) * step(part, 0.45);
    float membrane = operP * clamp((part - 0.35) / 0.04, 0.0, 1.0);
    float gills = smoothstep(0.03, 0.12, part) * step(part, 0.2) * (1.0 - smoothstep(${f(-F.gill.lining - 0.0035)}, ${f(-F.gill.lining)}, s - hkOperEdge(h)));
    float gillPink = operP * smoothstep(-0.02, -0.06, h) * smoothstep(0.2, 0.25, s);
    // the cheek and gill cover are one mirror sheet of skin over the bones (its edges are geometry)
    float oper = smoothstep(0.13, 0.17, s) * (1.0 - smoothstep(-0.003, 0.003, s - hkOperEdge(h))) * (1.0 - band);
    // the skin in the lee of each free edge: behind the opercle's (on the shoulder) and behind the preopercle's (on the
    // opercle), on the near tier where the edges are real
    float behindOp = near * smoothstep(-0.0005, 0.001, s - hkOperEdge(h)) * (1.0 - smoothstep(0.0, 0.007, s - hkOperEdge(h)))
      * smoothstep(-0.09, -0.08, h) * (1.0 - smoothstep(0.04, 0.05, h));
    float behindPre = operP * (1.0 - smoothstep(0.0, 0.011, s - hkPreopEdge(h))) * smoothstep(-0.075, -0.06, h) * (1.0 - smoothstep(0.035, 0.05, h));
    // the step down from the opercle's bone to its membranous flap: a crease in the plate's own shadow
    float behindBone = operP * smoothstep(-0.001, 0.0005, s - hkOperBone(h)) * (1.0 - smoothstep(0.001, 0.006, s - hkOperBone(h)))
      * smoothstep(-0.08, -0.065, h) * (1.0 - smoothstep(0.035, 0.045, h));
    hkOcc *= 1.0 - ${f(0.25 * F.gill.oper.shade)} * behindOp - ${f(0.35 * F.gill.preop.shade)} * behindPre - ${f(0.4 * F.gill.oper.shade)} * behindBone;
    // the cheek and gill cover are crumpled foil: broad, soft undulations of the mirror
    float cheek = (1.0 - smoothstep(0.26, 0.3, s)) * smoothstep(0.07, 0.11, s) * (1.0 - band);
    float satin = (1.0 - smoothstep(0.16, 0.26, s)) * smoothstep(0.1, 0.5, cd) * (1.0 - band);
    vec2 foil = vec2(hkNoise(vec2(s * 32.0, h * 26.0)), hkNoise(vec2(s * 28.0 + 9.0, h * 34.0 + 3.0))) - 0.5;
    hkTilt += foil * 0.3 * cheek;
    // ---- the eye's orbit: a narrow pale ring of skin round the dark rim
    float de = length(vec2(s - ${f(F.eye.s)}, h - ${f(F.eye.y)})) / ${f(F.eye.r)};
    float orbit = smoothstep(0.98, 1.04, de) * (1.0 - smoothstep(1.04, 1.2, de));
    float orbitShade = (1.0 - smoothstep(0.99, 1.1, de)) * smoothstep(0.95, 1.0, de) * smoothstep(-0.3, 0.6, (h - ${f(F.eye.y)}) / ${f(F.eye.r)});
    // the orbit's bony upper edge: a dark arc just above the eye
    float orbitTop = (1.0 - smoothstep(0.015, 0.04, abs(de - 1.12))) * smoothstep(0.45, 0.85, (h - ${f(F.eye.y)}) / ${f(F.eye.r)} / max(de, 0.01));
    // ---- the nostrils before the eye
    float nostril = 1.0 - smoothstep(0.5, 1.0, length(vec2((s - 0.056) / 0.004, (h - 0.04) / 0.003)));
`;
}

/** the far tiers (no plates, no split mouth): soft shadows where the edges and the gape are */
export function farGLSL(F: MulletForm): string {
  return `
    // the tiers further off have no gill cover or split mouth in their geometry: the edges' shadows and the gape stand
    // in for them, soft, at the size they are seen there
    float far = 1.0 - step(0.005, part);
    float dPre = abs(s - hkPreopEdge(h) - 0.004), dOp = abs(s - hkOperEdge(h) - 0.003);
    float edgeLines = max((1.0 - smoothstep(0.0, 0.006, dPre)) * smoothstep(-0.07, -0.05, h) * (1.0 - smoothstep(0.035, 0.05, h)),
      0.7 * (1.0 - smoothstep(0.0, 0.006, dOp)) * smoothstep(-0.09, -0.07, h) * (1.0 - smoothstep(0.035, 0.05, h)));
    float farGape = (1.0 - smoothstep(0.001, 0.003, abs(h - gapeH))) * (1.0 - smoothstep(${f(F.gape.s - 0.004)}, ${f(F.gape.s)}, s));
    col *= 1.0 - far * max(0.3 * edgeLines, 0.6 * farGape);
`;
}

/** the gills, seen in the chamber when the gill cover swings open */
export const GILLS_GLSL = `
    if (gills > 0.0) {
      // gill arches running down the chamber, each fringed with fine blood-red filaments lying back across it; the
      // clefts between the arches dark
      float ga = fract(s * 150.0 + h * 25.0);
      float ridge = smoothstep(0.0, 0.25, ga) * (1.0 - smoothstep(0.75, 1.0, ga));
      float fil = 0.6 + 0.4 * sin(h * 2300.0 + 3.0 * ga);
      vec3 gc = mix(vec3(0.16, 0.02, 0.03), vec3(0.72, 0.15, 0.14) * fil, ridge);
      col = mix(col, gc, gills);
      hkMetal = mix(hkMetal, 0.0, gills); hkRough = mix(hkRough, 0.35, gills); hkCoat = mix(hkCoat, 0.6, gills);
      hkIriAmt *= 1.0 - gills; hkTilt *= 1.0 - gills; hkThin *= 1.0 - gills;
    }
`;
