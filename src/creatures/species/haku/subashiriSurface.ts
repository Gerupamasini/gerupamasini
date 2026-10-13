import { Color } from 'three';
import type { MulletForm } from './anatomy';
import { GILLS_GLSL, eyeGLSL, f, farGLSL, lipsGLSL, structureGLSL } from './glsl';
import type { FinLook, Variant } from './materials';

/**
 * The スバシリ's skin (5–10 cm young mullet), after lateral photographs of live fish in a tank and an aquarium and of
 * fresh specimens on a scale: a golden-olive back fading through a pale gold band into mirror-silver flanks and a white
 * belly; large regular cycloid scales, each with a dark base on the upper flank, so that the dots line up into faint
 * stripes along the scale rows; a pinkish-gold sheen along the middle of the flank; on the head a speckled golden crown
 * and snout, a silver cheek and a large gill cover with a pink-lavender, golden sheen; a blue-black spot at the top of
 * the pectoral's base; a gold ring round the eye. The mouth and the gill cover are geometry on the near tier, as on the
 * ハク (glsl.ts).
 *
 * Uniforms (per individual look): uBack the back's colour, uPigment how strongly the scale bases and the speckles are
 * pigmented, uSilver the mirror's brightness, uIri the gill cover's sheen.
 */
export function subashiriSurface(F: MulletForm): string {
  const P = F.pec;
  return /* glsl */ `
float hkMetal = 0.0, hkRough = 0.5, hkCoat = 0.15, hkIriAmt = 0.0, hkIriThick = 380.0, hkThin = 0.0;
// ambient occlusion from the geometry (the gape between the lips, the mouth, under the gill cover's edges)
float hkOcc = vOcc;
vec2 hkTilt = vec2(0.0);
{
  float s = vBody.x, cd = vBody.y;
  float part = vPart;
  // the gill cover's face (0.39) runs into its rounded rim (4) across one row of triangles: the values in between are
  // that seam, not the eye (1), the tail sliver (2) or the mouth's lining (3), so they take the rim's pale lining
  if (part > 0.46 && part < 3.9 && abs(part - floor(part + 0.5)) > 0.002) part = 4.0;
  float h = vRest.y;
  vec3 col;
${eyeGLSL(F, 0.55)}  } else if (part > 1.5 && part < 2.5) {
    // ---- LOD2's tail sliver: a dusky fan
    col = vec3(0.32, 0.31, 0.27);
    hkMetal = 0.1; hkRough = 0.6; hkCoat = 0.0;
  } else if (part > 2.5 && part < 3.5) {
    // ---- the mouth's lining: pale, wet, in shadow
    col = vec3(0.42, 0.3, 0.3) * (0.85 + 0.3 * hkNoise(vRest.xz * 900.0));
    hkMetal = 0.0; hkRough = 0.4; hkCoat = 0.5;
  } else if (part > 3.5) {
    // ---- the gill cover's rounded free edge and its inner face: a pale silvery lining, soft-edged
    col = vec3(0.86, 0.85, 0.84);
    hkMetal = 0.25; hkRough = 0.4; hkCoat = 0.2;
    hkThin = 0.35;
  } else {
    vec2 pat = vec2(vPat.x, vBody.z < 0.0 ? -vPat.y : vPat.y);
    float trunk = smoothstep(0.2, 0.27, s);
    float headK = 1.0 - smoothstep(0.22, 0.28, s);
    // ---- the back: down to a third of the flank on the trunk, the crown on the head; its lower edge soft, through a
    // pale gold band into the silver
    float edge = mix(0.4, 0.22, smoothstep(0.14, 0.26, s));
    edge = mix(edge, -0.2, smoothstep(0.6, 0.82, s));
    edge += 0.03 * (hkNoise(vec2(s * 30.0, 2.7)) - 0.5);
    float band = smoothstep(edge - 0.18, edge + 0.16, cd);
    float goldBand = smoothstep(edge - 0.55, edge - 0.1, cd) * (1.0 - band);
    float belly = smoothstep(-0.2, -0.7, cd);
${lipsGLSL(F)}
    float headTop = 1.0 - smoothstep(0.17, 0.24, s);
    // ---- the scales: about forty along the side, thirteen rows from back to belly; the most anterior scale covering a
    // point lies on top, its free edge an arc; each its own slightly tilted mirror
    float scaleEdge = 0.0, scaleDome = 0.0, scalePocket = 0.0, scaleField = 0.5, scaleLod = 0.0;
    vec3 sh = vec3(0.5);
#ifndef HAKU_LOW
    {
      // (the rows counted round the body, eighteen from the back to the belly: the scales grow smaller where the body
      // narrows, on the tail stock and toward the head)
      vec2 sc = vec2(s / 0.012, acos(clamp(cd, -1.0, 1.0)) * ${f(18 / Math.PI)} + (vBody.z < 0.0 ? 0.37 : 0.0));
      float best = 1e9, bestD = 0.0;
      vec2 bestC = vec2(0.0), bestV = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        float row = floor(sc.y) + float(j);
        float off = 0.5 * mod(row, 2.0);
        vec2 c = vec2(floor(sc.x - off) + float(i) + off + 0.5, row + 0.5);
        c += (hkHash3(c + 3.0).xy - 0.5) * vec2(0.2, 0.16);
        vec2 dv = (sc - c) * vec2(1.0, 1.15);
        float d = length(dv);
        if (d < 0.9 && c.x < best) { best = c.x; bestC = c; bestD = d; bestV = dv; }
      }
      sh = hkHash3(bestC + 17.0);
      scaleLod = (1.0 - smoothstep(0.25, 0.7, max(fwidth(sc.x), fwidth(sc.y)))) * smoothstep(0.235, 0.27, s) * smoothstep(0.85, 0.81, s);
      // only the free edge (the arc behind the centre) shows: the rows of arcs zig-zag along the flank
      scaleEdge = smoothstep(0.74, 0.88, bestD) * smoothstep(0.05, 0.4, bestV.x) * scaleLod;
      scaleDome = smoothstep(0.2, 0.86, bestD) * scaleLod;
      // across a scale's exposed field, from the pocket just behind the scale lying over it (in its shadow, and where its
      // melanophores sit) to its own pale free rim; in a row the pockets join into the dark lines of the flank
      scaleField = smoothstep(-0.3 + 0.1 * (sh.y - 0.5), 0.8, bestV.x);
      scalePocket = (1.0 - scaleField) * (1.0 - smoothstep(0.35, 0.6, abs(bestV.y))) * (0.8 + 0.4 * sh.z);
      // (fading out where a scale is smaller than a pixel or two: its mean)
      scalePocket = mix(0.32, scalePocket, scaleLod) * smoothstep(0.235, 0.27, s) * smoothstep(0.86, 0.8, s);
      scaleField = mix(0.5, scaleField, scaleLod);
      hkTilt = (sh.xy - 0.5) * vec2(0.08, 0.04) * scaleLod * (1.0 - 0.6 * band);
    }
#else
    // (the far tier: the pockets' mean darkness, so the fish does not lighten as it swims off)
    scalePocket = 0.32 * smoothstep(0.235, 0.27, s) * smoothstep(0.86, 0.8, s);
#endif
    // the dashes are dark on the back and the upper flank, fainter down the side, gone on the belly
    float rowsK = smoothstep(-0.6, 0.15, cd) * (0.55 + 0.45 * band) * uPigment;
    // ---- fine speckles (melanophores) on the head's top and the snout, sparser on the back
    float speck = 0.0;
#ifndef HAKU_LOW
    {
      vec2 mp = pat * 420.0;
      vec2 c0 = floor(mp);
      float dens = uPigment * (0.75 * headTop * band + 0.22 * band * trunk + 0.12 * trunk * smoothstep(-0.45, 0.2, cd) * (1.0 - band)) * smoothstep(0.012, 0.03, s);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 c = c0 + vec2(float(i), float(j));
        vec3 hh = hkHash3(c + 5.0);
        if (hh.z > dens) continue;
        vec2 dv = mp - c - 0.2 - 0.6 * hh.xy;
        speck = max(speck, (1.0 - smoothstep(0.08, 0.2 + 0.1 * hh.x + 0.12 * headTop, length(dv))) * (0.5 + 0.5 * hh.y));
      }
      speck *= 1.0 - smoothstep(0.55, 1.2, max(fwidth(mp.x), fwidth(mp.y)));
    }
#endif
    // ---- colours
    vec3 backCol = uBack * (0.86 + 0.28 * hkNoise(pat * 35.0));
    backCol *= 1.0 - 0.22 * smoothstep(0.85, 1.0, cd) * trunk;
    // the crown and the snout a little paler and more golden
    backCol = mix(backCol, uBack * vec3(1.18, 1.05, 0.92) * (0.82 + 0.36 * hkNoise(pat * 90.0)) * (0.9 + 0.2 * hkNoise(pat * 25.0 + 3.0)), headTop * 0.8);
    // the crown and the nape mottled: golden patches and darker ones under the skin's dusting of melanophores
    float mottle = hkNoise(pat * 55.0 + 11.0) * 0.6 + hkNoise(pat * 140.0 + 4.0) * 0.4;
    backCol *= 1.0 + (mottle - 0.5) * 0.5 * (1.0 - smoothstep(0.24, 0.34, s));
    backCol = mix(backCol, backCol * vec3(1.25, 1.1, 0.7), smoothstep(0.55, 0.75, mottle) * 0.5 * headTop);
    vec3 goldCol = mix(uBack * 1.75, vec3(0.9, 0.8, 0.55), 0.5);
    // (a warm, creamy silver: the photographs' lower flank is brighter than the ハク's and faintly gold)
    vec3 silver = mix(vec3(0.97, 0.92, 0.78), vec3(1.0, 0.96, 0.84), belly) * uSilver;
    // the flank just under the gold band a translucent grey before the bright silver
    silver = mix(silver, vec3(0.8, 0.79, 0.77) * uSilver, smoothstep(-0.1, 0.25, cd) * (1.0 - band) * trunk * 0.35);
    // a pinkish-gold sheen along the middle of the flank
    float midSheen = (1.0 - smoothstep(0.0, 0.16, abs(cd - 0.08))) * trunk * smoothstep(0.84, 0.72, s);
    // the cheek and the gill cover: silver with a gold and pink-lavender sheen
    float cheekGold = (1.0 - smoothstep(0.24, 0.27, s)) * smoothstep(0.09, 0.14, s) * (1.0 - band) * smoothstep(-0.5, 0.1, cd);
    // the snout's tip yellowish
    float snoutTip = 1.0 - smoothstep(0.015, 0.06, s);
${structureGLSL(F)}
    // ---- the axillary spot: blue-black at the top of the pectoral's base
    float axil = 1.0 - smoothstep(0.45, 1.0, length(vec2((s - ${f(P.s - 0.002)}) / 0.012, (h - ${f(P.y + 0.006)}) / 0.011)));
#ifdef HAKU_LOW
    // the far tier has no eye mesh: the dark eye painted on
    axil = max(axil, (1.0 - smoothstep(0.5, 0.9, de)) * smoothstep(0.3, 0.6, abs(vBody.z)));
#endif
    // ---- thin tissue: the peduncle, the fin bases and the lips let the light through
    hkThin = smoothstep(0.62, 0.82, s) * 0.35 + 0.2 * smoothstep(0.7, 0.95, abs(cd)) * smoothstep(0.45, 0.6, s) + 0.4 * lips;

    float silverAmt = (1.0 - band) * (1.0 - 0.6 * goldBand);
    col = mix(backCol, silver, silverAmt);
    col = mix(col, goldCol, goldBand * 0.8);
    col = mix(col, vec3(0.9, 0.7, 0.62) * uSilver, midSheen * 0.3);
    // the thin tail stock: flesh and blood show through, pinkish brown, the back's colour fading softly into it
    float pedK = smoothstep(0.64, 0.8, s) * smoothstep(-0.7, -0.1, cd) * (1.0 - smoothstep(0.83, 0.86, s));
    col = mix(col, vec3(0.62, 0.48, 0.42) * (0.9 + 0.2 * uSilver), pedK * 0.45);
    col = mix(col, vec3(0.86, 0.76, 0.5) * uSilver, cheekGold * 0.32);
    // the cheek and the gill cover: a lavender-grey cast and soft patches in the silver (the bones under the skin)
    float cheekM = hkNoise(vec2(s * 60.0, h * 45.0) + 5.0);
    col = mix(col, col * vec3(0.9, 0.88, 0.94), cheek * (1.0 - band) * 0.6);
    col *= 1.0 + (cheekM - 0.5) * 0.16 * cheek * (1.0 - band);
    // the preopercle's edge: a soft arc in the silver, behind and below the eye
    float preArc = (1.0 - smoothstep(0.0, 0.006, abs(s - hkPreopEdge(h) - 0.002))) * smoothstep(-0.07, -0.05, h) * (1.0 - smoothstep(0.03, 0.045, h));
    col *= 1.0 - 0.1 * preArc * (1.0 - band);
    col = mix(col, vec3(0.62, 0.45, 0.2), snoutTip * 0.8 * smoothstep(-0.6, 0.2, cd));
    col = mix(col, vec3(0.72, 0.7, 0.64), lips * 0.3);
    // scales: each field darker in its pocket (pigmented on the back and the upper flank) and brighter toward its rim,
    // each its own mirror only a little different from its neighbours, a shallow dome
    col *= 1.0 - scalePocket * (0.05 + 0.3 * rowsK);
    col *= 1.0 + 0.04 * scaleField * scaleLod * (1.0 - band);
    col *= 1.0 + 0.05 * (sh.z - 0.5) * scaleLod;
    col *= 1.0 - 0.05 * scaleDome * belly;
    // a fine, uneven grain over it all (no skin is as clean as a pattern)
    col *= 1.0 + 0.07 * (hkNoise(pat * 900.0) - 0.5) + 0.05 * (hkNoise(pat * 160.0 + 7.0) - 0.5);
    // the free margins: a darker net over the back, paler arcs down the flank, a faint shadow line on the bright belly
    float lowK = smoothstep(0.0, -0.4, cd);
    col *= 1.0 - 0.22 * scaleEdge * band;
    col = mix(col, col * 1.12 + 0.04, scaleEdge * 0.45 * (1.0 - band) * (1.0 - lowK));
    col *= 1.0 - 0.2 * scaleEdge * lowK;
    col *= 1.0 - 0.7 * speck;
    col = mix(col, vec3(0.06, 0.08, 0.14), axil * 0.85);
    col = mix(col, vec3(0.08, 0.07, 0.07), nostril * 0.55);
${farGLSL(F)}
    // the membranous flap: thinner, a little milky over the silver
    col = mix(col, col * 0.9 + vec3(0.06, 0.06, 0.07), membrane * 0.6);
    col = mix(col, vec3(0.8, 0.8, 0.79), orbit * 0.25);
    col *= 1.0 - 0.35 * orbitShade;
    col = mix(col, vec3(0.3, 0.29, 0.28), orbitTop * 0.35);
    float snoutFront = 1.0 - smoothstep(0.012, 0.04, s);
    hkMetal = mix(0.18, mix(0.86, 0.62, belly), silverAmt) * (1.0 - 0.55 * snoutFront) * (1.0 - 0.7 * lips);
    hkMetal = mix(hkMetal, 0.62, goldBand * 0.6);
    hkMetal = mix(hkMetal, 0.62, oper * (1.0 - membrane));
    hkMetal = mix(hkMetal, 0.5, membrane);
    hkMetal *= 1.0 - 0.25 * scalePocket * rowsK - 0.3 * axil - 0.6 * speck;
    hkRough = mix(0.46, 0.22 + 0.1 * (sh.x - 0.5) * scaleLod, silverAmt) + 0.08 * scaleEdge + 0.06 * belly + 0.15 * lips;
    hkRough = mix(hkRough, 0.3, oper * 0.7 * (1.0 - membrane));
    hkRough = mix(hkRough, 0.4, snoutFront * 0.7);
    hkMetal = mix(hkMetal, 0.6, satin);
    hkRough = mix(hkRough, 0.3, satin);
    hkThin = max(hkThin, 0.3 * snoutFront);
    hkThin = max(hkThin, 0.4 * membrane);
    hkCoat = 0.14 + 0.08 * band + 0.2 * lips;
    // the gill cover's pink-lavender and gold sheen, a faint play of colour along the flank
    // (each scale's film a little thicker or thinner than the next: they shimmer pink, gold and green as the fish turns)
    hkIriAmt = uIri * (0.1 * silverAmt * smoothstep(-0.2, 0.5, cd) + 0.4 * oper * (1.0 - membrane) + 0.12 * goldBand
      + 0.22 * scaleLod * silverAmt * sh.x);
    hkIriThick = 320.0 + 200.0 * hkNoise(pat * 9.0 + 2.0) + 160.0 * oper + 260.0 * (sh.y - 0.5) * scaleLod;
${GILLS_GLSL}  }
  diffuseColor.rgb = col;
}
`;
}

/**
 * A few individual looks of the スバシリ, as the photographs show them: the dark olive back with a gold cast of fish in
 * the wild, a pale golden-tan one (mullet pale over a pale ground: the fish in a bright tank of the photo match), the
 * grey-green and the blue-grey backs of many fresh-caught ones. (Linear colour: the backs are dark.)
 */
export const SUBASHIRI_VARIANTS: Variant[] = [
  { back: new Color(0.19, 0.18, 0.1), pigment: 1.05, silver: 1.0, iri: 1.0 },
  { back: new Color(0.46, 0.34, 0.2), pigment: 0.9, silver: 0.97, iri: 1.1 },
  { back: new Color(0.14, 0.16, 0.12), pigment: 1.15, silver: 1.02, iri: 0.9 },
  { back: new Color(0.12, 0.15, 0.16), pigment: 1.1, silver: 1.0, iri: 0.95 },
];

/** the スバシリ's fins: dusky, yellowish membranes, the caudal with a darker trailing margin, the pelvics pale */
export const SUBASHIRI_FINS: FinLook = {
  rays: [20, 4, 9, 10, 6, 16],
  membrane: [0.48, 0.43, 0.35], pectoral: [0.7, 0.67, 0.6], ray: [0.4, 0.36, 0.29],
  opacity: [0.5, 0.42, 0.38, 0.36],
  caudalMargin: 0.6, dusky: 0.35, melanophores: 0.05, pectoralRays: 0.6, rayAlpha: 0.22,
};
