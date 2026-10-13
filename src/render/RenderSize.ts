import type { Vector2, WebGLRenderer } from 'three';

const sizes = new WeakMap<WebGLRenderer, Vector2>();

/**
 * The size the 3D view is drawn at, before it is scaled up to the screen (FSR 1 in the field on a PC). The drawing
 * buffer's own size unless the renderer was told to draw smaller.
 */
export function renderSize(gl: WebGLRenderer, out: Vector2): Vector2 {
  const s = sizes.get(gl);
  return s ? out.copy(s) : gl.getDrawingBufferSize(out);
}

/** Sets (or, with null, clears) the size the 3D view of a renderer is drawn at. */
export function setRenderSize(gl: WebGLRenderer, size: Vector2 | null): void {
  if (size) sizes.set(gl, size.clone());
  else sizes.delete(gl);
}
