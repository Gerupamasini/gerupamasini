import { describe, it, expect } from 'vitest';
import { Capture, CAPTURE_PHASE_SEC, REVEAL_SEC } from '../../src/systems/Capture';
import { Rng } from '../../src/core/Rng';

const tool = { id: 'hand_net', ja: 'タモ', type: 'capture' as const, targets: [], minigame: 'timing' as const, available: true, params: { barSpeed: 1, bandWidth: 0.3 }, description: '' };
const ind = {
  id: 'x', species: { names: { ja: 'テスト' }, capture: { baseDifficulty: 0.5, alertPenalty: 0.4 } }, alert: 0, rng: new Rng(1), length_mm: 69,
} as unknown as import('../../src/creatures/Individual').Individual;

describe('タモ capture sequence', () => {
  it('swings, lifts, reveals, then resolves success', () => {
    const c = new Capture();
    let resolved: boolean | null = null, swung: boolean | null = null;
    c.onSwung = (_i, ok) => { swung = ok; };
    c.onResolved = (_i, ok) => { resolved = ok; };
    c.start(ind, tool);
    const st = c.state.value!;
    expect(st.phase).toBe('aim');
    expect(st.catchText).toBe('テスト 6.9 cm');
    c.state.value = { ...st, cursor: (st.bandStart + st.bandEnd) / 2 };
    c.attempt();
    expect(c.state.value!.result).toBe('success');
    expect(c.state.value!.phase).toBe('swing');
    // the animal leaves the world when the net has passed, not before
    c.update(CAPTURE_PHASE_SEC.swing - 0.05);
    expect(swung).toBeNull();
    c.update(0.1);
    expect(swung).toBe(true);
    expect(c.state.value!.phase).toBe('lift');
    c.update(CAPTURE_PHASE_SEC.lift + 0.01);
    expect(c.state.value!.phase).toBe('check');
    expect(c.state.value!.revealed).toBe(false);
    c.update(REVEAL_SEC + 0.01);
    expect(c.state.value!.revealed).toBe(true);
    expect(resolved).toBeNull();
    for (let i = 0; i < 40; i++) c.update(0.1);
    expect(resolved).toBe(true);
    expect(c.state.value).toBeNull();
  });

  it('a miss is only told at the reveal, and cannot be cancelled once swung', () => {
    const c = new Capture();
    c.start(ind, tool);
    const st = c.state.value!;
    c.state.value = { ...st, cursor: st.bandEnd + 0.1 > 1 ? st.bandStart - 0.1 : st.bandEnd + 0.1 };
    c.attempt();
    expect(c.state.value!.result).toBe('fail');
    expect(c.cancel()).toBe(false);
    expect(c.active).toBe(true);
    for (let i = 0; i < 50; i++) c.update(0.1);
    expect(c.active).toBe(false);
  });
});
