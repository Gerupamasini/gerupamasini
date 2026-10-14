import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The gobies' tiers (hero, lod1, lod2) and the far models of each map stay within the model budget
// (docs/quality/model-budget.md, tools/models/budget.json), as the budget report measures the packed files.
const root = fileURLToPath(new URL('../../', import.meta.url));

describe('the goby models against the model budget', () => {
  it('every goby hero, lod1 and lod2, and every map\'s far models, are within it', { timeout: 60_000 }, () => {
    const report = execFileSync(process.execPath, ['tools/models/budget.mjs'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 24 });
    const lines = report.split('\n');
    const gobies = lines.filter((l) => /\[(L|M) (hero|lod[12])\] (mahaze|edohaze|himehaze)\//.test(l));
    expect(gobies.length).toBe(21);
    for (const l of gobies) expect(l.startsWith('ok'), l).toBe(true);
    const maps = lines.filter((l) => / map /.test(l));
    expect(maps.length).toBeGreaterThan(0);
    for (const l of maps) expect(l.startsWith('ok'), l).toBe(true);
  });
});
