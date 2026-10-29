# The CC0 specimens' lateral images (ffish.asia / floraZia.com photogrammetry, their Sketchfab previews) cut out and
# aligned in the model's frame, for the skin's bake (bake.ts):
#   python3 -I align.py <in.jpg> <out prefix> [--flip] [--rot deg] [--isnet <model>]
# → <prefix>.png    RGBA at 2048 px per TL: x 0 at the snout tip, 2047 at the caudal tips; the axis (snout → the
#                   peduncle's middle) horizontal at row `axis`; alpha the fish's mask
#   <prefix>.json   {L, axis, top[], bot[]}: the silhouette above and below the axis per 1/400 TL (TL units, fins included)
# Images are data: read with -I, nothing in their folder is executed.
import os, sys, json, numpy as np, cv2, onnxruntime as ort
from PIL import Image

W = 2048
src, prefix = sys.argv[1], sys.argv[2]
force_flip = '--flip' in sys.argv
rot = float(sys.argv[sys.argv.index('--rot') + 1]) if '--rot' in sys.argv else 0.0
model = sys.argv[sys.argv.index('--isnet') + 1] if '--isnet' in sys.argv else os.path.join(os.environ.get('FISH_MEASURE', '/tmp/fish-measure'), 'models', 'isnet.onnx')

im = np.asarray(Image.open(src).convert('RGB'))
H0, W0 = im.shape[:2]
sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
x = np.asarray(Image.fromarray(im).resize((1024, 1024), Image.BILINEAR), np.float32) / 255.0 - 0.5
y = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})[0][0, 0]
y = (y - y.min()) / max(1e-6, y.max() - y.min())
soft = cv2.resize(y, (W0, H0), interpolation=cv2.INTER_LINEAR)
b = (soft > 0.5).astype(np.uint8)
# the fish: the largest piece (not the colour checker), holes filled
n, lab, st, _ = cv2.connectedComponentsWithStats(b, 8)
k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
comp = (lab == k).astype(np.uint8)
ff = comp.copy()
cv2.floodFill(ff, np.zeros((H0 + 2, W0 + 2), np.uint8), (0, 0), 1)
comp = comp | (1 - ff)
alpha = (np.clip(soft, 0, 1) * comp * 255).astype(np.uint8)

def rotate(img, c, ang, big, interp=cv2.INTER_LINEAR):
    R = cv2.getRotationMatrix2D((float(c[0]), float(c[1])), ang, 1.0)
    R[0, 2] += big / 2 - c[0]; R[1, 2] += big / 2 - c[1]
    return cv2.warpAffine(img, R, (big, big), flags=interp)

def columns(m):
    cols = m.any(0)
    top = np.array([np.argmax(m[:, i]) if cols[i] else -1 for i in range(m.shape[1])], float)
    bot = np.array([m.shape[0] - 1 - np.argmax(m[::-1, i]) if cols[i] else -1 for i in range(m.shape[1])], float)
    return top, bot, np.where(cols, bot - top + 1, 0)

def tailiness(hh):
    q = int(0.32 * len(hh)); seg = hh[-q:]
    i = int(np.argmin(seg[: int(0.85 * q)])) if q > 5 else 0
    return seg[i:].max() / max(1, seg[i])

ys, xs = np.nonzero(comp)
pts = np.stack([xs, ys], 1).astype(np.float64)
c = pts.mean(0)
ev, evec = np.linalg.eigh(np.cov((pts - c).T))
ang = np.degrees(np.arctan2(evec[1, 1], evec[0, 1]))
if ang > 90: ang -= 180
if ang < -90: ang += 180
ang += rot
big = int(np.hypot(H0, W0)) + 4
flip = None
for it in range(4):
    r = rotate(comp * 255, c, ang, big) > 127
    yy, xx = np.nonzero(r)
    crop = r[yy.min():yy.max() + 1, xx.min():xx.max() + 1]
    top, bot, hgt = columns(crop)
    if flip is None: flip = force_flip or tailiness(hgt[::-1]) > tailiness(hgt)
    if flip: top, bot, hgt = top[::-1], bot[::-1], hgt[::-1]
    L = len(hgt)
    k0 = max(1, int(0.012 * L))
    sy = np.mean([(top[i] + bot[i]) / 2 for i in range(k0) if top[i] >= 0])
    a, bb = int(0.62 * L), int(0.88 * L)
    ip = a + int(np.argmin(np.where(hgt[a:bb] > 0, hgt[a:bb], 1e9)))
    py = (top[ip] + bot[ip]) / 2
    d = np.degrees(np.arctan2(py - sy, ip))
    ang += d if not flip else -d
    if abs(d) < 0.1: break

rgb = rotate(im, c, ang, big)
al = rotate(alpha, c, ang, big)
r = rotate(comp * 255, c, ang, big) > 127
yy, xx = np.nonzero(r)
x0, x1, y0, y1 = xx.min(), xx.max(), yy.min(), yy.max()
rgb = rgb[y0:y1 + 1, x0:x1 + 1]; al = al[y0:y1 + 1, x0:x1 + 1]; m = r[y0:y1 + 1, x0:x1 + 1]
if flip: rgb, al, m = rgb[:, ::-1], al[:, ::-1], m[:, ::-1]
L = m.shape[1]
top, bot, _ = columns(m)
k0 = max(1, int(0.012 * L))
sy = np.mean([(top[i] + bot[i]) / 2 for i in range(k0) if top[i] >= 0])
s = W / L
out = cv2.resize(np.dstack([rgb, al]), (W, int(round(m.shape[0] * s))), interpolation=cv2.INTER_AREA)
Image.fromarray(np.ascontiguousarray(out)).save(prefix + '.png')
B = 400
T, Bo = [], []
for j in range(B):
    i0, i1 = int(j * L / B), max(int(j * L / B) + 1, int((j + 1) * L / B))
    tt = [top[i] for i in range(i0, i1) if top[i] >= 0]; bb_ = [bot[i] for i in range(i0, i1) if bot[i] >= 0]
    T.append(round((sy - min(tt)) / L, 5) if tt else None)
    Bo.append(round((max(bb_) - sy) / L, 5) if bb_ else None)
json.dump({'L': W, 'axis': float(sy * s), 'top': T, 'bot': Bo, 'flip': bool(flip), 'ang': float(ang), 'src': src}, open(prefix + '.json', 'w'))
print(prefix, 'L', L, 'px of the source, flip', flip, 'ang', round(ang, 2))
