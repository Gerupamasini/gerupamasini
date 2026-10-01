import { describe, it, expect, vi } from 'vitest';
import { GameClock, TICKET_DURATION_SEC } from '../../src/core/GameClock';

describe('GameClock with 潮時チケット', () => {
  it('offsets game time while a ticket is active and switches targets', () => {
    const now = Date.UTC(2026, 9, 1, 6, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const c = new GameClock();
    expect(c.nowGame()).toBe(now);
    const target = now + 5 * 3600000;
    c.useTicket(target);
    expect(c.nowGame()).toBe(target);
    expect(c.ticket?.remainingSec).toBe(TICKET_DURATION_SEC);
    const target2 = now - 3 * 3600000;
    c.useTicket(target2);
    expect(c.nowGame()).toBe(target2);
    vi.restoreAllMocks();
  });

  it('counts down only while unpaused and blends back after expiry', () => {
    let now = Date.UTC(2026, 9, 1, 6, 0, 0);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const c = new GameClock();
    c.update();
    c.useTicket(now + 3600000);
    now += 10000; c.update();
    expect(c.ticket?.remainingSec).toBeCloseTo(TICKET_DURATION_SEC - 5, 0); // dt is clamped to 5 s per update
    c.setPaused(true);
    now += 10000; c.update();
    expect(c.ticket?.remainingSec).toBeCloseTo(TICKET_DURATION_SEC - 5, 0);
    c.setPaused(false);
    c.cancelTicket();
    expect(c.ticket?.phase).toBe('ending');
    for (let i = 0; i < 12; i++) { now += 1000; c.update(); }
    expect(c.ticket).toBeNull();
    expect(c.nowGame()).toBe(now);
    vi.restoreAllMocks();
  });

  it('restores a saved ticket keeping the reproduced moment continuous', () => {
    const start = Date.UTC(2026, 9, 1, 6, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(start + 600000);
    const c = new GameClock();
    c.restore({ targetGameMs: start + 7200000, startedRealMs: start, remainingSec: 1200, paused: false, phase: 'active' });
    // 10 minutes of real time elapsed while the game was closed: the game clock continues from +10 min
    expect(c.nowGame()).toBe(start + 7200000 + 600000);
    vi.restoreAllMocks();
  });
});
