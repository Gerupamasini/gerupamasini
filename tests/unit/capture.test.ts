import { describe, it, expect } from 'vitest';
import { Capture } from '../../src/systems/Capture';
import { Rng } from '../../src/core/Rng';

const tool = { id: 'hand_net', ja: '手網', type: 'capture' as const, targets: [], minigame: 'timing' as const, params: { barSpeed: 1, bandWidth: 0.3 }, description: '' };
const ind = {
  id: 'x', species: { names: { ja: 'テスト' }, capture: { baseDifficulty: 0.5, alertPenalty: 0.4 } }, alert: 0, rng: new Rng(1),
} as unknown as import('../../src/creatures/Individual').Individual;

describe('Capture mini-game', () => {
  it('resolves success after the result delay', () => {
    const c = new Capture();
    let resolved: boolean | null = null;
    c.onResolved = (_i, ok) => { resolved = ok; };
    c.start(ind, tool);
    const st = c.state.value!;
    c.state.value = { ...st, cursor: (st.bandStart + st.bandEnd) / 2 };
    c.attempt();
    expect(c.state.value!.result).toBe('success');
    for (let i = 0; i < 20; i++) c.update(0.1);
    expect(resolved).toBe(true);
    expect(c.state.value).toBeNull();
  });
});
