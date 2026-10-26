# Lateral silhouettes from the masks, measured in an anatomical frame: the line from the snout tip to the middle of the
# caudal peduncle's narrowest point is horizontal, the head left, TL = snout → caudal tips. Profiles + normalised masks.
#   python3 profile.py <sp>                 the photographs (masks/<sp>/*.png)
#   python3 profile.py <sp> side sidebody   the model's renders (model/<sp>_<view>.png; *body measured in its full frame)
import os
W = os.environ.get('FISH_MEASURE', '/tmp/fish-measure')  # work folder: photos, masks, renders (not in the repository)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
import sys, os, glob, json, numpy as np, cv2
from PIL import Image
SP = sys.argv[1]
MODEL = len(sys.argv) > 2
B = 200
out = {}
FR = {}

def load(mf):
    if MODEL:
        a = np.asarray(Image.open(mf).convert('RGB'), np.float32)
        return ((np.abs(a - np.array([255, 0, 255])).sum(-1) > 60) * 255).astype(np.uint8)
    return np.asarray(Image.open(mf), dtype=np.uint8)

def component(m):
    b = (m > 127).astype(np.uint8)
    if MODEL: return b
    n, lab, st, _ = cv2.connectedComponentsWithStats(b, 8)
    if n < 2: return None
    k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    if st[k, cv2.CC_STAT_AREA] < 0.01 * b.size: return None
    comp = (lab == k).astype(np.uint8)
    ff = comp.copy(); h, w = ff.shape
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    return comp | (1 - ff)

def rotate(img, c, ang, big):
    R = cv2.getRotationMatrix2D((float(c[0]), float(c[1])), ang, 1.0)
    R[0, 2] += big / 2 - c[0]; R[1, 2] += big / 2 - c[1]
    return R, cv2.warpAffine(img, R, (big, big), flags=cv2.INTER_LINEAR)

def columns(crop):
    L = crop.shape[1]; cols = crop.any(0)
    top = np.array([np.argmax(crop[:, i]) if cols[i] else -1 for i in range(L)], float)
    bot = np.array([crop.shape[0] - 1 - np.argmax(crop[::-1, i]) if cols[i] else -1 for i in range(L)], float)
    return top, bot, np.where(cols, bot - top + 1, 0)

def tailiness(hh):
    q = int(0.32 * len(hh)); seg = hh[-q:]
    i = int(np.argmin(seg[: int(0.85 * q)])) if q > 5 else 0
    return seg[i:].max() / max(1, seg[i])

files = [f'{W}/model/{SP}_{v}.png' for v in sys.argv[2:]] if MODEL else sorted(glob.glob(f'{W}/masks/{SP}/*.png'))
for mf in files:
    pid = os.path.basename(mf)[:-4]
    m = load(mf)
    H0, W0 = m.shape
    s = 600 / max(H0, W0)
    m = cv2.resize(m, (int(W0 * s), int(H0 * s)), interpolation=cv2.INTER_AREA)
    comp = component(m)
    if comp is None: continue
    h, w = comp.shape
    big = int(np.hypot(h, w)) + 4
    if MODEL and pid.endswith('body'):
        ref = FR[pid[:-4]]
        c, ang, flip = ref['c'], ref['ang'], ref['flip']
    else:
        ys, xs = np.nonzero(comp)
        pts = np.stack([xs, ys], 1).astype(np.float64)
        c = pts.mean(0)
        ev, evec = np.linalg.eigh(np.cov((pts - c).T))
        ax = evec[:, 1]
        ang = np.degrees(np.arctan2(ax[1], ax[0]))
        if ang > 90: ang -= 180
        if ang < -90: ang += 180
        # head left, then the anatomical axis (snout → peduncle), twice to settle
        flip = None
        for it in range(3):
            R, r = rotate(comp * 255, c, ang, big)
            ys, xs = np.nonzero(r > 127)
            crop = (r > 127)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            top, bot, hgt = columns(crop)
            if flip is None: flip = tailiness(hgt[::-1]) > tailiness(hgt)
            if flip: top, bot, hgt = top[::-1], bot[::-1], hgt[::-1]
            L = len(hgt)
            k0 = max(1, int(0.015 * L))
            sy = np.mean([(top[i] + bot[i]) / 2 for i in range(k0) if top[i] >= 0])
            a, b = int(0.62 * L), int(0.88 * L)
            ip = a + int(np.argmin(np.where(hgt[a:b] > 0, hgt[a:b], 1e9)))
            py = (top[ip] + bot[ip]) / 2
            d = np.degrees(np.arctan2(py - sy, ip))
            # (the image y runs down; with the head flipped to the left the turn reverses)
            ang += d if not flip else -d
            if abs(d) < 0.2: break
    if MODEL: FR[pid] = {'c': c, 'ang': ang, 'flip': flip}
    R, r = rotate(comp * 255, c, ang, big)
    if MODEL and pid.endswith('body'):
        _, rf = rotate(load(mf.replace('body.png', '.png')) if False else (cv2.resize(load(mf.replace('body.png', '.png')), (w, h), interpolation=cv2.INTER_NEAREST) > 127).astype(np.uint8) * 255, c, ang, big)
        ys, xs = np.nonzero(rf > 127)
    else:
        ys, xs = np.nonzero(r > 127)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    rb = r > 127
    border = cv2.warpAffine(np.pad(np.zeros((h - 2, w - 2), np.uint8), 1, constant_values=255), R, (big, big)) > 0
    edge = int(np.logical_and(border, cv2.dilate(rb.astype(np.uint8), np.ones((3, 3))) > 0).sum())
    crop = rb[y0:y1 + 1, x0:x1 + 1]
    if flip: crop = crop[:, ::-1]
    L = crop.shape[1]
    if L < 80: continue
    top, bot, hgt = columns(crop)
    if MODEL and pid.endswith('body'):
        sy = FR[pid[:-4]]['sy']
    else:
        k0 = max(1, int(0.015 * L))
        sy = np.mean([(top[i] + bot[i]) / 2 for i in range(k0) if top[i] >= 0])
    if MODEL: FR[pid]['sy'] = sy
    xs_ = (np.arange(L) + 0.5) / L
    bins = np.linspace(0, 1, B + 1)
    T = np.full(B, np.nan); Bo = np.full(B, np.nan)
    for j in range(B):
        sel = (xs_ >= bins[j]) & (xs_ < bins[j + 1]) & (top >= 0)
        if sel.any():
            T[j] = (sy - top[sel].min()) / L
            Bo[j] = (bot[sel].max() - sy) / L
    nm = cv2.resize(crop.astype(np.uint8) * 255, (400, max(1, int(round(400 * crop.shape[0] / L)))), interpolation=cv2.INTER_AREA)
    out[pid] = {'elong': L / crop.shape[0], 'edge': edge, 'flip': bool(flip), 'ang': float(ang),
                'top': [None if np.isnan(v) else round(float(v), 4) for v in T], 'bot': [None if np.isnan(v) else round(float(v), 4) for v in Bo],
                'snoutY': float(sy / L), 'h': crop.shape[0] / L}
    od = W + '/model/norm' if MODEL else f'{W}/norm/{SP}'
    os.makedirs(od, exist_ok=True)
    Image.fromarray(nm).save(f'{od}/{pid}.png')
    src = mf if MODEL else f'{W}/photos/{SP}/{pid}.jpg'
    ph = np.asarray(Image.open(src).convert('RGB').resize((w, h)))
    rp = cv2.warpAffine(ph, R, (big, big), borderValue=(40, 40, 40))[y0:y1 + 1, x0:x1 + 1]
    if flip: rp = rp[:, ::-1]
    Image.fromarray(np.ascontiguousarray(rp)).resize((400, nm.shape[0])).save(f'{od}/{pid}_ph.jpg', quality=80)
    Image.fromarray(np.ascontiguousarray(rp)).resize((1200, 3 * nm.shape[0])).save(f'{od}/{pid}_big.jpg', quality=85)
path = f'{W}/model/norm/{SP}.json' if MODEL else f'{W}/norm/{SP}.json'
if MODEL and os.path.exists(path):
    prev = json.load(open(path)); prev.update(out); out = prev
json.dump(out, open(path, 'w'))
print(SP, len(out))
