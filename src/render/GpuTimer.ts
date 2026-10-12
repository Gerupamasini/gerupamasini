import type { WebGLRenderer } from 'three';

interface TimerQueryExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/**
 * The GPU's time for the frame's draws (EXT_disjoint_timer_query_webgl2), read a few frames late as the queries come
 * back. Where the browser does not offer the extension, `available` is false and `ms` stays NaN.
 */
export class GpuTimer {
  readonly available: boolean;
  /** the last measured frame, milliseconds (NaN until one is back) */
  ms = Number.NaN;
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: TimerQueryExt | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(renderer: WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    let ext: TimerQueryExt | null = null;
    try { ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null; } catch { /* none */ }
    this.ext = ext;
    this.available = !!ext;
  }

  /** Starts timing (ignored while one is running, or when too many are still out). */
  begin(): void {
    if (!this.ext || this.active || this.pending.length >= 4) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Collects the queries that are back; true when `ms` was updated. */
  poll(): boolean {
    if (!this.ext || !this.pending.length) return false;
    const gl = this.gl;
    // a disjoint event (a clock change, the GPU reset) spoils every query out: they are dropped
    const disjoint = !!gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    let got = false;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!disjoint && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!disjoint) {
        this.ms = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
        got = true;
      }
      gl.deleteQuery(q);
      this.pending.shift();
    }
    return got;
  }

  dispose(): void {
    if (this.active && this.ext) this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    for (const q of [...this.pending, ...(this.active ? [this.active] : [])]) this.gl.deleteQuery(q);
    this.pending.length = 0;
    this.active = null;
  }
}
