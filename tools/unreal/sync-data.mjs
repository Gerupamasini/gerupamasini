// Copy the web build's JSON data (public/data) into the UE5 project, where the game reads it at runtime
// (unreal/HigataZukan/Content/Data, staged as loose files; see Config/DefaultGame.ini).
// public/data stays the single source of truth: run this after changing it, and before packaging.
import { cpSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const from = join(root, 'public/data');
const to = join(root, 'unreal/HigataZukan/Content/Data');

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
// JSON only: images in Content would be offered for import by the editor. Terrain and photos get their own import step.
cpSync(from, to, { recursive: true, filter: (src) => statSync(src).isDirectory() || src.endsWith('.json') });
console.log(`synced ${from} → ${to}`);
