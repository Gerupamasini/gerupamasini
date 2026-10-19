// The production build's GLSL without its comments, indentation and blank lines (vite.config.ts): the shaders keep
// their notes in the source, the shipped bundle does not carry them (about a sixth of the game's script is shader text).
//
// A template literal is GLSL when it is marked `/* glsl */` or its text reads as GLSL (a `void main`, a `gl_` built-in,
// an `#include <chunk>`, a uniform/varying/attribute, a vec/float/mat declaration). Every line keeps its line break (a
// preprocessor directive ends with its line), and only comments that lie wholly in one stretch of text between `${…}`
// go. Left as written: a tagged template; a literal with a backslash at a line's end or in a comment, or a block
// comment that is not closed before a `${…}`; a literal that is itself searched for (the first argument of a .replace()
// and the like, or a constant passed as one); and a literal in which a search the code makes in shader text (a string or
// a regular expression) would no longer find what it finds now.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const GLSL_HINT = /\bvoid\s+main\s*\(|\bgl_[A-Z]\w*|#include\s*<|\b(?:uniform|varying|attribute)\s+\w+\s+\w+|\b(?:vec[234]|float|mat[34])\s+\w+\s*[=;(]/;
const MARK = /\/\*\s*glsl\s*\*\/\s*$/;
const SEARCHES = new Set(['replace', 'replaceAll', 'includes', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith', 'split', 'match', 'matchAll', 'search']);
const SOURCE = /\.(?:[cm]?js|ts|tsx)$/;

const isSearch = (n) => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && SEARCHES.has(n.expression.name.text) && n.arguments.length > 0;

function regex(node) {
  const m = node.text.match(/^\/(.*)\/([a-z]*)$/s);
  try { return m ? new RegExp(m[1], m[2].replace(/[gy]/g, '')) : null; } catch { return null; }
}

/**
 * Could the search be one in shader code? Not a single character or a bare word (a split(','), a tags.includes('mud'):
 * code is never taken out, so a word of the code is still found), and not a case-blind regular expression (a GPU's
 * name; GLSL is case-sensitive).
 */
const aimsAtCode = (p) => (typeof p === 'string' ? p.length > 1 && /[^\w-]/.test(p) : !p.flags.includes('i'));
const hits = (p, s) => (typeof p === 'string' ? s.includes(p) : p.test(s));

/**
 * The searches a file makes with a literal pattern, and the names of the constants it searches with.
 * @param {string} code
 * @param {string} fileName
 * @returns {{ patterns: (string | RegExp)[], names: string[] }}
 */
export function searchesIn(code, fileName) {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  const patterns = [], names = [];
  const visit = (n) => {
    if (isSearch(n)) {
      const a = n.arguments[0];
      if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) patterns.push(a.text);
      else if (a.kind === ts.SyntaxKind.RegularExpressionLiteral) patterns.push(regex(a));
      else if (ts.isIdentifier(a)) names.push(a.text);
    }
    // a regular expression's own .test()/.exec() on shader text
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(?:test|exec)$/.test(n.expression.name.text)
      && n.expression.expression.kind === ts.SyntaxKind.RegularExpressionLiteral) patterns.push(regex(n.expression.expression));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { patterns: patterns.filter((p) => p !== null && aimsAtCode(p)), names };
}

/**
 * One stretch's raw text (between the backticks, a `${…}` and the next) without comments, indentation or blank lines;
 * null when that cannot be done safely. The stretch's ends stay as they are (its first line's indentation, its last
 * line's trailing space, a first line break): what is interpolated next to it may lean on them.
 */
export function stripStretch(/** @type {string} */ raw) {
  if (/\\(?:\r?\n|$)/.test(raw)) return null;
  let out = '', line = '', atLineStart = false;
  const endLine = (nl) => {
    let l = atLineStart ? line.replace(/^\s+/, '') : line;
    if (nl) l = l.replace(/\s+$/, '');
    // a line with nothing left on it goes with its break (not the stretch's first)
    if (!nl) out += l;
    else if (l !== '' || !atLineStart) out += l + '\n';
    line = '';
    atLineStart = nl;
  };
  for (let i = 0; i < raw.length;) {
    const two = raw.slice(i, i + 2);
    if (two === '//') {
      const nl = raw.indexOf('\n', i);
      // a comment that runs on into a `${…}` or to the literal's end stays (the line may go on after it)
      if (nl < 0) { line += raw.slice(i); break; }
      if (raw.slice(i, nl).includes('\\')) return null;
      i = nl;
    } else if (two === '/*') {
      const close = raw.indexOf('*/', i + 2);
      if (close < 0 || raw.slice(i, close).includes('\\')) return null;
      // a comment stands for a space; one over several lines goes only where it starts its line (not inside a directive)
      if (!raw.slice(i, close).includes('\n')) line += ' ';
      else if (!atLineStart || line.trim() !== '') return null;
      i = close + 2;
    } else if (raw[i] === '\\') {
      line += two;
      i += 2;
    } else if (raw[i] === '\n') {
      endLine(true);
      i++;
    } else line += raw[i++];
  }
  endLine(false);
  return out;
}

/** the raw text of each stretch of a template literal: its offsets in the file, inside the backticks, `${` and `}` */
function stretches(node, sf) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return [[node.getStart(sf) + 1, node.getEnd() - 1]];
  return [
    [node.head.getStart(sf) + 1, node.head.getEnd() - 2],
    ...node.templateSpans.map(({ literal }) => [literal.getStart(sf) + 1, literal.getEnd() - (ts.isTemplateTail(literal) ? 1 : 2)]),
  ];
}

function searchedFor(node, names) {
  const p = node.parent;
  if (isSearch(p) && p.arguments[0] === node) return true;
  return ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && names.has(p.name.text);
}

/**
 * The file with the GLSL in its template literals stripped, or null when nothing changes.
 * @param {string} code
 * @param {string} fileName
 * @param {{ patterns: (string | RegExp)[], names: Set<string> }} [searches] what the whole program searches shader text
 *   with (programSearches)
 * @returns {string | null}
 */
export function stripShaderComments(code, fileName, searches = { patterns: [], names: new Set() }) {
  if (!code.includes('`')) return null;
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  const edits = [];
  const visit = (n) => {
    if (ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (ts.isTaggedTemplateExpression(n.parent) || searchedFor(n, searches.names)) return;
      const parts = stretches(n, sf);
      const raws = parts.map(([s, e]) => code.slice(s, e));
      const before = raws.join('${}');
      if (MARK.test(code.slice(Math.max(0, n.getFullStart() - 40), n.getStart(sf))) || GLSL_HINT.test(before)) {
        const stripped = raws.map(stripStretch);
        const after = stripped.includes(null) ? before : stripped.join('${}');
        if (after !== before && !searches.patterns.some((p) => hits(p, before) && !hits(p, after))) {
          parts.forEach(([s, e], k) => { if (stripped[k] !== raws[k]) edits.push([s, e, stripped[k]]); });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) return null;
  let out = code;
  for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);
  return out;
}

/** @param {string} dir @returns {string[]} the scripts under a directory */
export function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && SOURCE.test(d.name))
    .map((d) => path.join(d.parentPath, d.name));
}

/** @param {string[]} files what the program in these files searches shader text with */
export function programSearches(files) {
  const all = files.map((f) => searchesIn(fs.readFileSync(f, 'utf8'), f));
  return { patterns: all.flatMap((s) => s.patterns), names: new Set(all.flatMap((s) => s.names)) };
}

/** The Vite plugin: the game's sources (src/) lose their shader comments in `vite build`; the dev server keeps them. */
export function shaderComments() {
  let src = '';
  let searches = null;
  return {
    name: 'higata-shader-comments',
    apply: 'build',
    enforce: 'pre',
    // (Vite's root and module ids use forward slashes on every system)
    configResolved(config) { src = `${config.root}/src/`; },
    buildStart() { searches = programSearches(sourceFiles(src)); },
    transform(code, id) {
      if (!id.startsWith(src) || !SOURCE.test(id)) return null;
      const out = stripShaderComments(code, id, searches);
      // (the line numbers move: no source map for this step)
      return out === null ? null : { code: out, map: { mappings: '' } };
    },
  };
}
