// AMD FidelityFX Super Resolution 1.0 for WebGL2: EASU (edge-adaptive spatial upsampling) and RCAS (robust contrast-
// adaptive sharpening), after ffx_fsr1.h (Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved. MIT
// licence: Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files, to deal in the Software without restriction, including without limitation the rights to use,
// copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the following
// conditions: the above copyright notice and this permission notice shall be included in all copies or substantial
// portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.)
//
// Both passes take and give perceptual (sRGB-encoded, tone-mapped) colour, as FSR 1 expects. The 12 taps EASU
// gathers are read one by one (WebGL2 has no textureGather) at whole texel addresses.
import { ShaderMaterial, Vector2, type Texture } from 'three';

const VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const EASU_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tInput;
  uniform vec2 uInSize;    // the input's texels
  uniform vec2 uOutSize;   // the output's pixels

  vec3 tap(ivec2 p) { return texelFetch(tInput, clamp(p, ivec2(0), ivec2(uInSize) - 1), 0).rgb; }
  // luma times 2 (as FSR: B/2 + R/2 + G)
  float luma(vec3 c) { return c.b * 0.5 + (c.r * 0.5 + c.g); }

  // direction and length from the '+' around one of the four nearest texels, weighted bilinearly
  void easuSet(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE) {
    //    a
    //  b c d
    //    e
    float dc = lD - lC, cb = lC - lB;
    float lenX = max(abs(dc), abs(cb));
    lenX = lenX > 0.0 ? 1.0 / lenX : 0.0;
    float dirX = lD - lB;
    dir.x += dirX * w;
    lenX = clamp(abs(dirX) * lenX, 0.0, 1.0);
    lenX *= lenX;
    len += lenX * w;
    float ec = lE - lC, ca = lC - lA;
    float lenY = max(abs(ec), abs(ca));
    lenY = lenY > 0.0 ? 1.0 / lenY : 0.0;
    float dirY = lE - lA;
    dir.y += dirY * w;
    lenY = clamp(abs(dirY) * lenY, 0.0, 1.0);
    lenY *= lenY;
    len += lenY * w;
  }

  // one tap of the approximate, direction-stretched Lanczos 2 window
  void easuTap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
    vec2 v = vec2(off.x * dir.x + off.y * dir.y, off.x * -dir.y + off.y * dir.x);
    v *= len;
    float d2 = min(v.x * v.x + v.y * v.y, clp);
    float wB = 2.0 / 5.0 * d2 - 1.0;
    float wA = lob * d2 - 1.0;
    wB *= wB;
    wA *= wA;
    wB = 25.0 / 16.0 * wB - (25.0 / 16.0 - 1.0);
    float w = wB * wA;
    aC += c * w;
    aW += w;
  }

  void main() {
    // the output pixel's centre in input texels, and the texel 'f' at its upper left
    vec2 pp = gl_FragCoord.xy * (uInSize / uOutSize) - 0.5;
    vec2 fp = floor(pp);
    pp -= fp;
    ivec2 f0 = ivec2(fp);
    //    b c
    //  e f g h
    //  i j k l
    //    n o
    vec3 b = tap(f0 + ivec2(0, -1)), c = tap(f0 + ivec2(1, -1));
    vec3 e = tap(f0 + ivec2(-1, 0)), f = tap(f0), g = tap(f0 + ivec2(1, 0)), h = tap(f0 + ivec2(2, 0));
    vec3 i = tap(f0 + ivec2(-1, 1)), j = tap(f0 + ivec2(0, 1)), k = tap(f0 + ivec2(1, 1)), l = tap(f0 + ivec2(2, 1));
    vec3 n = tap(f0 + ivec2(0, 2)), o = tap(f0 + ivec2(1, 2));
    float bL = luma(b), cL = luma(c), eL = luma(e), fL = luma(f), gL = luma(g), hL = luma(h);
    float iL = luma(i), jL = luma(j), kL = luma(k), lL = luma(l), nL = luma(n), oL = luma(o);

    vec2 dir = vec2(0.0);
    float len = 0.0;
    easuSet(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
    easuSet(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
    easuSet(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
    easuSet(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);

    // normalise the direction (a flat neighbourhood keeps the x axis)
    vec2 dir2 = dir * dir;
    float dirR = dir2.x + dir2.y;
    bool zro = dirR < 1.0 / 32768.0;
    dirR = zro ? 1.0 : inversesqrt(dirR);
    dir.x = zro ? 1.0 : dir.x;
    dir *= dirR;
    // {0..2} to {0..1}, shaped
    len = len * 0.5;
    len *= len;
    // stretch the kernel: 1 along an axis, sqrt(2) on a diagonal
    float stretch = (dir.x * dir.x + dir.y * dir.y) / max(abs(dir.x), abs(dir.y));
    vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
    // the negative lobe narrows on edges; the window ends at its clipping point
    float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
    float clp = 1.0 / lob;

    vec3 aC = vec3(0.0);
    float aW = 0.0;
    easuTap(aC, aW, vec2(0.0, -1.0) - pp, dir, len2, lob, clp, b);
    easuTap(aC, aW, vec2(1.0, -1.0) - pp, dir, len2, lob, clp, c);
    easuTap(aC, aW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, i);
    easuTap(aC, aW, vec2(0.0, 1.0) - pp, dir, len2, lob, clp, j);
    easuTap(aC, aW, vec2(0.0, 0.0) - pp, dir, len2, lob, clp, f);
    easuTap(aC, aW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, e);
    easuTap(aC, aW, vec2(1.0, 1.0) - pp, dir, len2, lob, clp, k);
    easuTap(aC, aW, vec2(2.0, 1.0) - pp, dir, len2, lob, clp, l);
    easuTap(aC, aW, vec2(2.0, 0.0) - pp, dir, len2, lob, clp, h);
    easuTap(aC, aW, vec2(1.0, 0.0) - pp, dir, len2, lob, clp, g);
    easuTap(aC, aW, vec2(1.0, 2.0) - pp, dir, len2, lob, clp, o);
    easuTap(aC, aW, vec2(0.0, 2.0) - pp, dir, len2, lob, clp, n);
    // normalise, and keep within the four nearest texels (no ringing)
    vec3 min4 = min(min(f, g), min(j, k));
    vec3 max4 = max(max(f, g), max(j, k));
    gl_FragColor = vec4(min(max4, max(min4, aC / aW)), 1.0);
  }
`;

const RCAS_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tInput;
  uniform float uSharp;   // exp2(-sharpness): 1 the sharpest, 0.25 (sharpness 2) mild

  // (the lobe's limit, as FSR_RCAS_LIMIT)
  #define RCAS_LIMIT (0.25 - (1.0 / 16.0))

  void main() {
    ivec2 sp = ivec2(gl_FragCoord.xy);
    ivec2 hi = textureSize(tInput, 0) - 1;
    //    b
    //  d e f
    //    h
    vec3 b = texelFetch(tInput, clamp(sp + ivec2(0, -1), ivec2(0), hi), 0).rgb;
    vec3 d = texelFetch(tInput, clamp(sp + ivec2(-1, 0), ivec2(0), hi), 0).rgb;
    vec3 e = texelFetch(tInput, sp, 0).rgb;
    vec3 f = texelFetch(tInput, clamp(sp + ivec2(1, 0), ivec2(0), hi), 0).rgb;
    vec3 h = texelFetch(tInput, clamp(sp + ivec2(0, 1), ivec2(0), hi), 0).rgb;
    // noise detection: a lone texel unlike its ring is sharpened less
    float bL = b.b * 0.5 + (b.r * 0.5 + b.g), dL = d.b * 0.5 + (d.r * 0.5 + d.g), eL = e.b * 0.5 + (e.r * 0.5 + e.g);
    float fL = f.b * 0.5 + (f.r * 0.5 + f.g), hL = h.b * 0.5 + (h.r * 0.5 + h.g);
    float nz = 0.25 * bL + 0.25 * dL + 0.25 * fL + 0.25 * hL - eL;
    float range = max(max(max(bL, dL), max(eL, fL)), hL) - min(min(min(bL, dL), min(eL, fL)), hL);
    nz = clamp(abs(nz) / max(range, 1e-5), 0.0, 1.0);
    nz = -0.5 * nz + 1.0;
    // the ring's extremes, and the largest negative lobe that keeps the result within [0, 1]
    vec3 mn4 = min(min(b, d), min(f, h));
    vec3 mx4 = max(max(b, d), max(f, h));
    vec2 peakC = vec2(1.0, -4.0);
    vec3 hitMin = mn4 / max(4.0 * mx4, vec3(1e-5));
    vec3 hitMax = (peakC.x - mx4) / min(4.0 * mn4 + peakC.y, vec3(-1e-5));
    vec3 lobeRGB = max(-hitMin, hitMax);
    float lobe = max(-RCAS_LIMIT, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * uSharp;
    lobe *= nz;
    vec3 c = (lobe * (b + d + h + f) + e) / (4.0 * lobe + 1.0);
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** EASU: scales a perceptual-colour image up to the target's size (`setSizes` before each use when sizes change). */
export function createEasuMaterial(): ShaderMaterial & { setInput(t: Texture, inW: number, inH: number, outW: number, outH: number): void } {
  const m = new ShaderMaterial({
    name: 'FsrEasu',
    uniforms: { tInput: { value: null }, uInSize: { value: new Vector2(1, 1) }, uOutSize: { value: new Vector2(1, 1) } },
    vertexShader: VERT,
    fragmentShader: EASU_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }) as ShaderMaterial & { setInput(t: Texture, inW: number, inH: number, outW: number, outH: number): void };
  m.setInput = (t, inW, inH, outW, outH) => {
    m.uniforms.tInput.value = t;
    (m.uniforms.uInSize.value as Vector2).set(inW, inH);
    (m.uniforms.uOutSize.value as Vector2).set(outW, outH);
  };
  return m;
}

/** RCAS: sharpens an image of the target's own size. `sharpness` in stops: 0 the strongest, 2 mild. */
export function createRcasMaterial(sharpness = 0.25): ShaderMaterial & { setSharpness(s: number): void } {
  const m = new ShaderMaterial({
    name: 'FsrRcas',
    uniforms: { tInput: { value: null }, uSharp: { value: 2 ** -sharpness } },
    vertexShader: VERT,
    fragmentShader: RCAS_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }) as ShaderMaterial & { setSharpness(s: number): void };
  m.setSharpness = (s) => { m.uniforms.uSharp.value = 2 ** -s; };
  return m;
}
