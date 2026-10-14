export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'run' | 'crouch'
  | 'interact' | 'observe' | 'zukan' | 'menu' | 'speedUp' | 'speedDown' | 'home' | 'ticket' | 'debug' | 'zoom' | 'zoomIn' | 'zoomOut' | 'map'
  | 'tool1' | 'tool2' | 'tool3' | 'caseView' | 'jump' | 'sunglasses' | 'viewUp' | 'viewDown';

const BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'ControlRight', 'KeyC'],
  viewUp: ['ShiftLeft', 'ShiftRight'],
  viewDown: ['ControlLeft', 'ControlRight'],
  interact: ['KeyE'],
  observe: ['KeyF'],
  zukan: ['Tab'],
  menu: ['Escape'],
  speedUp: ['BracketRight', 'Period'],
  speedDown: ['BracketLeft', 'Comma'],
  home: ['KeyH'],
  ticket: ['KeyT'],
  debug: ['F3', 'Backquote'],
  zoom: ['KeyZ'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
  map: ['KeyM'],
  tool1: ['Digit1'],
  tool2: ['Digit2'],
  tool3: ['Digit3'],
  caseView: ['KeyQ'],
  jump: ['Space'],
  sunglasses: ['KeyG'],
};

/** Keyboard, mouse and touch state with per-frame edge detection. */
export class Input {
  readonly touchDevice = window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  private down = new Set<string>();
  private pressedCodes = new Set<string>();
  private releasedCodes = new Set<string>();
  private touchActions = new Set<Action>();
  private touchPressed = new Set<Action>();
  private touchRight = 0;
  private touchForward = 0;
  private lookPointer: { id: number; x: number; y: number } | null = null;
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  mouseDown = false;
  mouseClicked = false;
  mouseRightDown = false;
  pointerLocked = false;
  /** When true, game actions are ignored (a text field or dialog has focus). */
  blocked = false;
  /** when the pointer is not locked, dragging on the canvas still looks around (fallback if the lock is refused) */
  dragLook = false;
  /** called when the browser refuses a pointer lock request */
  onLockError: ((reason: string) => void) | null = null;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (this.isEditable(e.target)) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code === 'F3') e.preventDefault();
      if (!this.down.has(e.code)) this.pressedCodes.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedCodes.add(e.code);
    });
    const reset = () => {
      this.down.clear();
      this.pressedCodes.clear();
      this.clearTouch();
      this.mouseDown = this.mouseRightDown = this.mouseClicked = false;
    };
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked && !(this.dragLook && this.mouseDown)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockerror', () => { this.onLockError?.('pointerlockerror'); });
    // the buttons are read from pointer events: when OrbitControls holds the canvas (observing, the case, the home) it
    // captures the pointer and the browser then drops the compatibility mouse events, so a right button held to zoom
    // would never be seen through mousedown alone
    const down = (button: number) => {
      if (button === 0) { this.mouseDown = true; this.mouseClicked = true; }
      if (button === 2) this.mouseRightDown = true;
    };
    const up = (button: number) => {
      if (button === 0) this.mouseDown = false;
      if (button === 2) this.mouseRightDown = false;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') { down(e.button); return; }
      e.preventDefault();
      if (!this.dragLook || this.blocked || this.lookPointer) return;
      this.lookPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.lookPointer;
      if (!p || p.id !== e.pointerId || !this.dragLook || this.blocked) return;
      this.mouseDX += e.clientX - p.x;
      this.mouseDY += e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
    });
    const release = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') up(e.button);
      if (this.lookPointer?.id === e.pointerId) this.lookPointer = null;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', (e) => {
      release(e);
      if (e.pointerType !== 'touch') this.mouseDown = this.mouseRightDown = false;
    });
    canvas.addEventListener('lostpointercapture', release);
    // Keep mouse events for browsers that suppress pointer events during pointer lock.
    // preventDefault on touch pointerdown suppresses compatibility mouse events.
    canvas.addEventListener('mousedown', (e) => down(e.button));
    window.addEventListener('mouseup', (e) => up(e.button));
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private isEditable(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  held(action: Action): boolean {
    if (this.blocked) return false;
    return this.touchActions.has(action) || BINDINGS[action].some((c) => this.down.has(c));
  }

  pressed(action: Action): boolean {
    if (this.blocked && action !== 'menu' && action !== 'map') return false;
    return this.touchPressed.has(action) || BINDINGS[action].some((c) => this.pressedCodes.has(c));
  }

  setTouchAction(action: Action, held: boolean): void {
    if (held) {
      if (!this.touchActions.has(action)) this.touchPressed.add(action);
      this.touchActions.add(action);
    } else this.touchActions.delete(action);
  }

  setTouchMove(right: number, forward: number): void {
    const safe = (n: number) => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
    this.touchRight = safe(right); this.touchForward = safe(forward);
  }

  get moveRight(): number {
    return this.blocked ? 0 : Math.max(-1, Math.min(1, this.touchRight + Number(this.held('right')) - Number(this.held('left'))));
  }

  get moveForward(): number {
    return this.blocked ? 0 : Math.max(-1, Math.min(1, this.touchForward + Number(this.held('forward')) - Number(this.held('back'))));
  }

  /** Release fingers when leaving a screen, hiding the page or cancelling an OS gesture. */
  clearTouch(): void {
    this.touchActions.clear(); this.touchPressed.clear();
    this.touchRight = this.touchForward = 0;
    this.lookPointer = null;
    this.mouseDX = this.mouseDY = 0;
  }

  keyPressed(code: string): boolean {
    return this.pressedCodes.has(code);
  }

  requestPointerLock(): void {
    if (this.touchDevice) return;
    if (this.pointerLocked || document.pointerLockElement === this.canvas) return;
    try {
      const r = (this.canvas.requestPointerLock as (() => Promise<void> | void) | undefined)?.call(this.canvas);
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch((e) => this.onLockError?.(String(e)));
    } catch (e) {
      this.onLockError?.(String(e));
    }
  }

  /** true while the view follows the mouse: the pointer is locked, or the fallback drag is in progress */
  get looking(): boolean {
    return this.pointerLocked || (this.dragLook && (this.mouseDown || this.lookPointer !== null));
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  /** Consume per-frame deltas. Call at the end of the frame. */
  endFrame(): void {
    this.pressedCodes.clear();
    this.touchPressed.clear();
    this.releasedCodes.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.mouseClicked = false;
  }
}
