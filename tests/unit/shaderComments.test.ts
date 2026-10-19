import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { programSearches, searchesIn, sourceFiles, stripShaderComments, stripStretch } from '../../tools/build/shaderComments.mjs';

const strip = (code: string, searched = false) => {
  const s = searchesIn(code, 'x.ts');
  return stripShaderComments(code, 'x.ts', searched ? { patterns: s.patterns, names: new Set(s.names) } : undefined);
};

/** the GLSL of each template literal in a file, as the program cooks it (`${…}` as \0) */
function cooked(code: string): string[] {
  const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    else if (ts.isTemplateExpression(n)) out.push([n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join('\0'));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * What a GLSL compiler (and its preprocessor) reads in a stretch of shader text: comments as spaces, every line's
 * tokens with single spaces, no blank lines; and whether the text begins or ends with a space or a line break, which
 * matters to what is pasted next to it.
 */
function meaning(glsl: string): string {
  const t = glsl.replace(/\/\*[\s\S]*?\*\//g, (c) => (c.includes('\n') ? '\n' : ' ')).replace(/\/\/[^\n]*/g, '');
  const body = t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return [/^\s/.test(t), /^[^\S\n]*\n/.test(t), body, /\n[^\S\n]*$/.test(t), /\s$/.test(t)].join('|');
}

describe('シェーダーのコメントを本番ビルドで除く', () => {
  it('drops comments, indentation and blank lines, keeping each line on its own', () => {
    const src = 'const FRAG = /* glsl */ `\n  // the colour\n  uniform vec3 uC; // tint\n\n#ifdef USE_X\n  gl_FragColor = vec4(uC, 1.0); /* opaque */\n#endif\n`;\n';
    expect(strip(src)).toBe('const FRAG = /* glsl */ `\nuniform vec3 uC;\n#ifdef USE_X\ngl_FragColor = vec4(uC, 1.0);\n#endif\n`;\n');
  });

  it('keeps the space and the line breaks next to an interpolation', () => {
    const src = 'const A = `uniform ${T} uA; // a\n  float x = ${V}; // b\n  ${B}\n`;';
    expect(strip(src)).toBe('const A = `uniform ${T} uA;\nfloat x = ${V};\n${B}\n`;');
    // a literal pasted after a directive keeps its first line break; its first line keeps its indentation
    expect(stripStretch('\n  // c\n  float a;\n\n')).toBe('\nfloat a;\n');
    expect(stripStretch('  vec3 a; // c\n')).toBe('  vec3 a;\n');
  });

  it('leaves alone what it cannot strip safely', () => {
    // a comment running into an interpolation or to the end, a line continuation, a block comment inside a line
    expect(stripStretch('float a; // ')).toBe('float a; // ');
    expect(stripStretch('#define F(x) \\\\\n  x\n')).toBeNull();
    expect(stripStretch('\nfloat a = 1.0 /* one\n */ + b;\n')).toBeNull();
    // not shader text, a tagged template
    expect(strip('const u = `https://example.com/a // b\n`;')).toBeNull();
    expect(strip('const s = css`uniform vec3 a; // b\n`;')).toBeNull();
  });

  it('leaves a literal alone when the code searches shader text for what would go', () => {
    const src = 'const FRAG = `\n  // INJECT\n  void main() {}\n`;\nconst x = FRAG.replace(\'// INJECT\', s);';
    expect(strip(src, true)).toBeNull();
    // (but a split(',') or an includes('mud') does not count: a word of the code is never taken out)
    const words = 'const FRAG = `\n  // mud, sand\n  void main() {}\n`;\nconst x = s.split(\',\').includes(\'mud\');';
    expect(strip(words, true)).not.toBeNull();
    // nor is a pattern itself, or a constant searched with
    expect(strip('s.replace(`  vec3 a; // b\n`, t);')).toBeNull();
    const named = 'const AT = `  vec3 a; // b\n`;\nconst y = s.replace(AT, t);';
    expect(strip(named, true)).toBeNull();
  });

  it('every shader in the game keeps its code, token for token', () => {
    const files = sourceFiles('src');
    const searches = programSearches(files);
    let changed = 0;
    for (const f of files) {
      const code = readFileSync(f, 'utf8');
      const out = stripShaderComments(code, f, searches);
      if (out === null) continue;
      const a = cooked(code), b = cooked(out);
      expect(b.length, f).toBe(a.length);
      a.forEach((glsl, k) => { if (glsl !== b[k]) { changed++; expect(meaning(b[k]), `${f} #${k}`).toBe(meaning(glsl)); } });
    }
    expect(changed).toBeGreaterThan(200);
  }, 60000);
});
