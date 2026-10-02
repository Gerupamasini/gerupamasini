import { describe, it, expect } from 'vitest';
import { Capture, CAPTURE_PHASE_SEC, REVEAL_SEC, catchLabel } from '../../src/systems/Capture';

const tool = { id: 'hand_net', ja: 'タモ', type: 'capture' as const, targets: [], minigame: 'none' as const, available: true, params: {}, description: '' };
const ind = (name: string, len: number) => ({ id: name, species: { names: { ja: name } }, length_mm: len }) as unknown as import('../../src/creatures/Individual').Individual;

describe('タモ capture sequence', () => {
  it('swings, lifts, reveals, then resolves with what was caught', () => {
    const c = new Capture();
    let resolved: string[] | null = null, swung: string[] | null = null;
    c.onSwung = (caught) => { swung = caught.map((i) => i.id); };
    c.onResolved = (caught) => { resolved = caught.map((i) => i.id); };
    c.start(tool, [ind('マハゼ', 69), ind('シラタエビ', 31)]);
    const st = c.state.value!;
    expect(st.phase).toBe('swing');
    expect(st.result).toBe('success');
    expect(st.catchText).toBe('マハゼ 6.9 cm ・ シラタエビ 3.1 cm');
    // the animals leave the world when the net has passed, not before
    c.update(CAPTURE_PHASE_SEC.swing - 0.05);
    expect(swung).toBeNull();
    c.update(0.1);
    expect(swung).toEqual(['マハゼ', 'シラタエビ']);
    expect(c.state.value!.phase).toBe('lift');
    c.update(CAPTURE_PHASE_SEC.lift + 0.01);
    expect(c.state.value!.phase).toBe('check');
    expect(c.state.value!.revealed).toBe(false);
    c.update(REVEAL_SEC + 0.01);
    expect(c.state.value!.revealed).toBe(true);
    expect(resolved).toBeNull();
    for (let i = 0; i < 40; i++) c.update(0.1);
    expect(resolved).toEqual(['マハゼ', 'シラタエビ']);
    expect(c.state.value).toBeNull();
    expect(c.active).toBe(false);
  });

  it('an empty sweep plays out the same and resolves with nothing', () => {
    const c = new Capture();
    let resolved: number | null = null;
    c.onResolved = (caught) => { resolved = caught.length; };
    c.start(tool, []);
    expect(c.state.value!.result).toBe('fail');
    expect(catchLabel([])).toBe('');
    for (let i = 0; i < 50; i++) c.update(0.1);
    expect(resolved).toBe(0);
  });
});
