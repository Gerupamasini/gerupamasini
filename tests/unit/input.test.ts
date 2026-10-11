import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../../src/core/Input';

describe('touch input alongside keyboard input', () => {
  let canvas: HTMLCanvasElement;
  beforeEach(() => {
    vi.stubGlobal('window', Object.assign(new EventTarget(), { matchMedia: () => ({ matches: true }) }));
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, pointerLockElement: null }));
    vi.stubGlobal('navigator', { maxTouchPoints: 5 });
    canvas = Object.assign(new EventTarget(), { setPointerCapture: vi.fn(), requestPointerLock: vi.fn() }) as unknown as HTMLCanvasElement;
  });
  afterEach(() => vi.unstubAllGlobals());
  const key = (type: string, code: string) => window.dispatchEvent(Object.assign(new Event(type), { code }));
  const pointer = (target: EventTarget, type: string, id: number, x = 0, y = 0) => {
    target.dispatchEvent(Object.assign(new Event(type), { pointerType: 'touch', pointerId: id, clientX: x, clientY: y, button: 0 }));
  };

  it('keeps a short tap until a frame consumes it, without repeating a held action', () => {
    const input = new Input(canvas);
    input.setTouchAction('interact', true); input.setTouchAction('interact', false);
    expect(input.pressed('interact')).toBe(true); expect(input.held('interact')).toBe(false);
    input.endFrame(); expect(input.pressed('interact')).toBe(false);
    input.setTouchAction('interact', true); input.endFrame(); input.setTouchAction('interact', true);
    expect(input.held('interact')).toBe(true); expect(input.pressed('interact')).toBe(false);
  });

  it('combines analogue movement with the keyboard and blocks both in dialogs', () => {
    const input = new Input(canvas);
    input.setTouchMove(0.25, 0.5);
    expect(input.moveRight).toBe(0.25); expect(input.moveForward).toBe(0.5);
    key('keydown', 'KeyA'); expect(input.moveRight).toBe(-0.75);
    key('keydown', 'KeyW'); expect(input.moveForward).toBe(1);
    input.setTouchAction('jump', true); input.blocked = true;
    expect(input.moveRight).toBe(0); expect(input.moveForward).toBe(0);
    expect(input.pressed('jump')).toBe(false); expect(input.held('jump')).toBe(false);
    input.setTouchAction('menu', true); expect(input.pressed('menu')).toBe(true);
    input.blocked = false; input.setTouchMove(NaN, Infinity);
    key('keyup', 'KeyA'); key('keyup', 'KeyW');
    expect(input.moveForward).toBe(0); expect(input.moveRight).toBe(0);
  });

  it('releases all held actions and look deltas when leaving a screen or losing focus', () => {
    const input = new Input(canvas); input.dragLook = true;
    input.setTouchMove(0, 1); input.setTouchAction('run', true);
    pointer(canvas, 'pointerdown', 1, 10, 20); pointer(canvas, 'pointermove', 1, 30, 50);
    expect(input.mouseDX).toBe(20); expect(input.mouseDY).toBe(30); expect(input.looking).toBe(true);
    input.clearTouch();
    expect(input.moveForward).toBe(0); expect(input.held('run')).toBe(false); expect(input.looking).toBe(false);
    expect(input.mouseDX).toBe(0); expect(input.mouseDY).toBe(0);
    key('keydown', 'KeyW'); input.setTouchAction('zoom', true); window.dispatchEvent(new Event('blur'));
    expect(input.moveForward).toBe(0); expect(input.held('zoom')).toBe(false);
    input.setTouchAction('run', true); Object.assign(document, { hidden: true }); document.dispatchEvent(new Event('visibilitychange'));
    expect(input.held('run')).toBe(false);
  });

  it('only looks with the canvas finger, ignores other fingers, and releases on cancellation', () => {
    const input = new Input(canvas); input.dragLook = true;
    pointer(canvas, 'pointerdown', 11, 100, 100);
    pointer(canvas, 'pointerdown', 22, 200, 200); pointer(canvas, 'pointermove', 22, 250, 200);
    expect(input.mouseDX).toBe(0); expect(input.mouseClicked).toBe(false);
    pointer(window, 'pointerup', 22); expect(input.looking).toBe(true);
    pointer(canvas, 'pointermove', 11, 115, 95);
    expect(input.mouseDX).toBe(15); expect(input.mouseDY).toBe(-5);
    pointer(window, 'pointercancel', 11); expect(input.looking).toBe(false);
    input.requestPointerLock(); expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    input.dragLook = false; pointer(canvas, 'pointerdown', 33);
    expect(input.looking).toBe(false); expect(input.mouseClicked).toBe(false);
  });

  it('retains mouse-button input during pointer lock and releases a cancelled mouse drag', () => {
    const input = new Input(canvas);
    canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    expect(input.mouseDown).toBe(true); expect(input.mouseClicked).toBe(true);
    input.endFrame(); expect(input.mouseClicked).toBe(false); expect(input.mouseDown).toBe(true);
    window.dispatchEvent(Object.assign(new Event('mouseup'), { button: 0 }));
    expect(input.mouseDown).toBe(false);
    canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'mouse', button: 2 }));
    expect(input.mouseRightDown).toBe(true);
    window.dispatchEvent(Object.assign(new Event('pointercancel'), { pointerType: 'mouse', button: -1 }));
    expect(input.mouseRightDown).toBe(false);
  });
});
