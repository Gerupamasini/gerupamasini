"""Bake the ORIGINAL periodic Gray–Scott surface field; no photograph/source asset.
Optional offline authoring tool: Python + NumPy. Runtime has no Python dependency.
Run from repository root; writes the compact, synchronous TypeScript height asset.
"""
from pathlib import Path
import base64
import numpy as np

N = 192
rng = np.random.default_rng(739)
u = np.ones((N, N), np.float32)
v = np.zeros((N, N), np.float32)
for _ in range(90):
    x, y = rng.integers(0, N - 7, 2)
    u[x:x + 7, y:y + 7] = .5
    v[x:x + 7, y:y + 7] = .25

def lap(a):
    return -a + .2 * (np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) + .05 * (np.roll(np.roll(a, 1, 0), 1, 1) + np.roll(np.roll(a, 1, 0), -1, 1) + np.roll(np.roll(a, -1, 0), 1, 1) + np.roll(np.roll(a, -1, 0), -1, 1))

for _ in range(3500):
    uvv = u * v * v
    u += lap(u) - uvv + .035 * (1 - u)
    v += .5 * lap(v) + uvv - .095 * v
field = np.uint8(np.rint((v - v.min()) / (v.max() - v.min()) * 255))
encoded = base64.b64encode(field.tobytes()).decode('ascii')
chunks = [repr(encoded[i:i + 120]) for i in range(0, len(encoded), 120)]
source = '''/** Original periodic reaction–diffusion height field, 192 × 192 R8.
 * Rebuild: python tools/models/okinawa-coral/surface-brain-bake.py
 * This is an authored procedural surface, not a photograph or measured coral scan.
 */
const packed =\n  ''' + ' +\n  '.join(chunks) + ''';
let field: Uint8Array | undefined;
export function brainField(): Uint8Array {
  return (field ??= Uint8Array.from(atob(packed), (c) => c.charCodeAt(0)));
}
'''
Path('src/world/coral/surface-brain-field.ts').write_text(source)
print(f'Baked {N} x {N} field, {len(field.tobytes())} bytes.')
