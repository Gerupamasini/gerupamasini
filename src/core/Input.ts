export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'run' | 'crouch'
  | 'interact' | 'observe' | 'zukan' | 'menu' | 'speedUp' | 'speedDown' | 'home' | 'ticket' | 'debug' | 'zoom' | 'zoomIn' | 'zoomOut' | 'map';

const BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'ControlRight', 'KeyC'],
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
};

/** Keyboard and mouse state with per-frame edge detection. */
export class Input {
  private down = new Set<string>();
  private pressedCodes = new Set<string>();
  private releasedCodes = new Set<string>();
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
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked && !(this.dragLook && this.mouseDown)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockerror', () => { this.onLockError?.('pointerlockerror'); });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
      if (e.button === 2) this.mouseRightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    });
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
    return BINDINGS[action].some((c) => this.down.has(c));
  }

  pressed(action: Action): boolean {
    if (this.blocked && action !== 'menu') return false;
    return BINDINGS[action].some((c) => this.pressedCodes.has(c));
  }

  keyPressed(code: string): boolean {
    return this.pressedCodes.has(code);
  }

  requestPointerLock(): void {
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
    return this.pointerLocked || (this.dragLook && this.mouseDown);
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  /** Consume per-frame deltas. Call at the end of the frame. */
  endFrame(): void {
    this.pressedCodes.clear();
    this.releasedCodes.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.mouseClicked = false;
  }
}
