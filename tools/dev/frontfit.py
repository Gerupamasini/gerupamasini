#!/usr/bin/env python3
"""Front-view photo fit (docs/body_shape_spec.md v4 §F, docs/validation.md §AB).

Reads posed triangles written by `node tools/dev/fitcheck.mjs out.json legs=1` (legs and feet kept), projects
them orthographically onto a view from the front (camera elevated by --el degrees above the horizontal, turned by
--yaw degrees about the vertical), rasterises the silhouette and scores it against a binary mask of a photo seen
from the same viewpoint. Both silhouettes are normalised by their crown-to-foot height (top of the outline to the
bottom of the toes = 1) and centred on the horizontal centre of their widest row; the score is the IoU over the
union, plus the width profile (width / crown-to-foot height at fractions of the crown → belly drop).

The photo mask (derived from a photo) is NOT in the repository: pass its path.
usage: python3 tools/dev/frontfit.py fit.json --mask photo_mask.png [--el 8] [--yaw 0] [--out cmp.png]
                                     [--json metrics.json] [--search]   (search: best elevation 0…20° too)
"""
import argparse
import json
import sys

import numpy as np

try:
    import cv2
except ImportError:  # pragma: no cover
    sys.exit('frontfit.py needs numpy and opencv-python')

N = 600  # px per unit height of the normalised frame
SUB = 2


def load(path):
    d = json.load(open(path))
    tris = []
    for name, m in d['meshes'].items():
        p = np.array(m['pos'], float).reshape(-1, 3)
        t = np.array(m['tri'], int).reshape(-1, 3)
        tris.append(p[t])
    return d, np.concatenate(tris)


def project(tris, el, yaw):
    e, y = np.radians(el), np.radians(yaw)
    # camera in front (+z), turned by yaw about +y, raised by el: right r, up u
    d = np.array([-np.sin(y) * np.cos(e), -np.sin(e), -np.cos(y) * np.cos(e)])
    r = np.array([-np.cos(y), 0, np.sin(y)])
    u = np.cross(d, r)
    u /= np.linalg.norm(u)
    return np.stack([tris @ r, tris @ u], -1)


def raster_model(t2):
    v = t2.reshape(-1, 2)
    top, bot = v[:, 1].max(), v[:, 1].min()
    H = top - bot
    W = int(1.6 * N)
    img = np.zeros(((N + 40) * SUB, W * SUB), np.uint8)
    px = np.stack([(t2[..., 0] / H) * N + W / 2, (top - t2[..., 1]) / H * N + 20], -1) * SUB
    for t in np.round(px * 16).astype(np.int32):
        cv2.fillConvexPoly(img, t, 1, lineType=cv2.LINE_8, shift=4)
    m = cv2.resize(img.astype(np.float32), (W, N + 40), interpolation=cv2.INTER_AREA) >= 0.5
    return m, H


def norm_photo(mask):
    ys, xs = np.nonzero(mask)
    top, bot = ys.min(), ys.max()
    H = bot - top
    W = int(1.6 * N)
    s = N / H
    M = np.float32([[s, 0, 0], [0, s, 20 - top * s]])
    out = cv2.warpAffine(mask.astype(np.uint8) * 255, M, (int(mask.shape[1] * s) + 10, N + 40), flags=cv2.INTER_AREA) >= 128
    return out


def centre(m, bellyFrac=0.85):
    """x centre of the widest row in the upper 85 % (the body, not the legs)."""
    rows = [(r.max() - r.min(), (r.max() + r.min()) / 2) for r in (np.nonzero(m[j])[0] for j in range(20, 20 + int(N * bellyFrac))) if len(r)]
    w = max(rows)[0]
    cs = [c for ww, c in rows if ww >= w - 2]
    return float(np.mean(cs))


def shift_to(m, cx, W):
    out = np.zeros((m.shape[0], W), bool)
    dx = int(round(W / 2 - cx))
    for j in range(m.shape[0]):
        r = np.nonzero(m[j])[0] + dx
        r = r[(r >= 0) & (r < W)]
        out[j, r] = True
    return out


def profile(m):
    """width per row (normalised units), belly row (lowest row whose width > 30 % of the max)."""
    w = np.array([(lambda r: (r.max() - r.min() + 1) if len(r) else 0)(np.nonzero(m[j])[0]) for j in range(m.shape[0])]) / N
    fill = m.sum(1) / N  # filled width (the two legs are not body)
    j = int(np.argmax(w))
    belly = j
    while belly + 1 < len(w) and fill[belly + 1] > 0.3 * w[j]:
        belly += 1
    return w, belly


def score(model, photo):
    W = max(model.shape[1], photo.shape[1])
    a = shift_to(model, centre(model), W)
    b = shift_to(photo, centre(photo), W)
    best = (-1, 0)
    for dx in range(-6, 7):  # residual centring (asymmetric photo)
        bb = np.roll(b, dx, 1)
        iou = (a & bb).sum() / (a | bb).sum()
        best = max(best, (iou, dx))
    return best[0], a, np.roll(b, best[1], 1)


def stats(m):
    w, belly = profile(m)
    top = 20
    cb = (belly - top) / N
    j = np.argmax(w[: belly + 1])
    out = {'width_H': round(float(w.max()), 3), 'crown_belly_H': round(cb, 3), 'width_cb': round(float(w.max()) / cb, 3), 'belly_H': round(1 - cb, 3), 'widest_at_cb': round((j - top) / N / cb, 2)}
    out['prof'] = [[round(f, 2), round(float(w[int(top + f * (belly - top))]), 3)] for f in np.arange(0.05, 1.0001, 0.05)]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('fit')
    ap.add_argument('--mask', required=True)
    ap.add_argument('--el', type=float, default=8)
    ap.add_argument('--yaw', type=float, default=0)
    ap.add_argument('--out')
    ap.add_argument('--json')
    ap.add_argument('--search', action='store_true')
    a = ap.parse_args()
    d, tris = load(a.fit)
    photo = norm_photo(cv2.imread(a.mask, cv2.IMREAD_GRAYSCALE) > 127)
    els = np.arange(0, 20.1, 2) if a.search else [a.el]
    res = []
    for el in els:
        m, H = raster_model(project(tris, el, a.yaw))
        iou, A, B = score(m, photo)
        res.append((iou, el, A, B, H))
    iou, el, A, B, H = max(res, key=lambda r: r[0])
    out = {'IoU': round(float(iou), 3), 'el': float(el), 'crown_foot_mm': round(float(H), 1), 'model': stats(A), 'photo': stats(B)}
    if a.search:
        out['byEl'] = {float(r[1]): round(float(r[0]), 3) for r in res}
    print(json.dumps({k: v for k, v in out.items() if k not in ('model', 'photo')}))
    for k in ('model', 'photo'):
        print(k, {kk: vv for kk, vv in out[k].items() if kk != 'prof'})
    print('prof (f of crown→belly: model / photo width_H)', ' '.join(f"{p[0]:.2f}:{p[1]:.2f}/{q[1]:.2f}" for p, q in zip(out['model']['prof'], out['photo']['prof'])))
    if a.out:
        img = np.full(A.shape + (3,), 255, np.uint8)
        img[B] = (255, 200, 200)
        img[A & ~B] = (160, 160, 255)
        img[A & B] = (200, 120, 150)
        cv2.imwrite(a.out, img)
    if a.json:
        json.dump(out, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
