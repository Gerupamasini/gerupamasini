#!/usr/bin/env python3
"""Photo-fit score of the posed model (docs/body_shape_spec.md §19).

Reads the posed triangles written by tools/dev/fitcheck.mjs, rasterises the side view (legs and feet
excluded) in Frame A (bill tip (0,0), tail tip (1,0), +y dorsal; R = 400 px per L, x -0.15..1.15,
y -0.75..0.55, 5x5 closing — the photo analysis frame) and scores it against the photo median
silhouette of a posture group and the group's per-photo masks, then measures the mm targets of §2–§5.

The photo data (masks derived from CC BY-NC photos) is NOT in the repository: pass its directory.
usage: python3 tools/dev/fitcheck.py fit.json --shape <photoan/shape dir> [--group relaxedStand]
                                     [--out cmp.png] [--json metrics.json]
"""
import argparse
import json
import os
import sys

import numpy as np

try:
    import cv2
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit('fitcheck.py needs numpy, opencv-python and pillow')

R = 400
XR = (-0.15, 1.15)
YR = (-0.75, 0.55)
XS = np.arange(0, 1.0001, 0.05)
SUB = 4  # supersampling of the triangle raster

# §2 side profile (photo median at L = 142, mm), §4 front outline, §5 top widths (SDF, low confidence)
PROFILE_Z = [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 35]
PROFILE_TOP = [64, 68, 74, 80, 84, 90, 94, 98, 104, 105, 103]
PROFILE_BOT = [53, 49, 43, 40, 37, 36, 38, 42, 48, 56, 66]
FRONT_Y = [44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 92, 96]
FRONT_Z = [14, 22, 25, 29, 32, 33, 35, 36, 37, 38, 41, 39]


def load(path):
    d = json.load(open(path))
    tris = {}
    for name, m in d['meshes'].items():
        p = np.array(m['pos'], float).reshape(-1, 3)
        t = np.array(m['tri'], int).reshape(-1, 3)
        tris[name] = p[t]  # (n, 3 vertices, xyz)
    return d, tris


def raster(tri2d, shape, to_px):
    """Fill 2-D triangles (n,3,2 in model units) into a bool mask; to_px maps model → pixel (float)."""
    h, w = shape
    img = np.zeros((h * SUB, w * SUB), np.uint8)
    px = to_px(tri2d.reshape(-1, 2)).reshape(-1, 3, 2) * SUB
    pts = np.round(px * 16).astype(np.int32)  # 4 fractional bits
    for t in pts:  # one by one: a multi-polygon fillPoly XORs overlapping triangles
        cv2.fillConvexPoly(img, t, 1, lineType=cv2.LINE_8, shift=4)
    small = cv2.resize(img.astype(np.float32), (w, h), interpolation=cv2.INTER_AREA)
    return small >= 0.5


def frame_a(bill, tail):
    o = np.array([-bill[2], bill[1]])
    t = np.array([-tail[2], tail[1]])
    u = t - o
    L = np.linalg.norm(u)
    u = u / L
    up = np.array([-u[1], u[0]])

    def to_px(zy):  # zy columns: (z, y) model mm
        pxy = np.stack([-zy[:, 0], zy[:, 1]], 1) - o
        ax = pxy @ u / L
        ay = pxy @ up / L
        return np.stack([(ax - XR[0]) * R, (YR[1] - ay) * R], 1)

    return to_px, L


def prof_a(mA):
    u, l = [], []
    for x in XS:
        c = int(round((x - XR[0]) * R))
        col = mA[:, max(c - 1, 0):c + 2].any(1)
        r = np.where(col)[0]
        if len(r) == 0:
            u.append(np.nan)
            l.append(np.nan)
            continue
        u.append(YR[1] - r.min() / R)
        l.append(YR[1] - r.max() / R)
    return np.array(u), np.array(l)


def iou(a, b):
    return float((a & b).sum() / max(1, (a | b).sum()))


def mm_mask(tri2d, lo, hi, res=0.25):
    """Orthographic mask in model mm: columns = first coordinate, rows = second (top row = hi[1])."""
    w = int(np.ceil((hi[0] - lo[0]) / res))
    h = int(np.ceil((hi[1] - lo[1]) / res))
    to_px = lambda q: np.stack([(q[:, 0] - lo[0]) / res, (hi[1] - q[:, 1]) / res], 1)
    return raster(tri2d, (h, w), to_px), (lambda c: lo[0] + (c + 0.5) * res), (lambda r: hi[1] - (r + 0.5) * res)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('fit')
    ap.add_argument('--shape', required=True, help='photo shape analysis dir (fig/median_mask_A_*.png, norm/A_p*.png, groups_compact.json)')
    ap.add_argument('--group', default='relaxedStand')
    ap.add_argument('--out')
    ap.add_argument('--json')
    a = ap.parse_args()
    med_path = os.path.join(a.shape, 'fig', f'median_mask_A_{a.group}.png')
    if not os.path.exists(med_path):
        print(f'skip: no photo median at {med_path}')
        return
    med = np.array(Image.open(med_path)) > 127
    groups = json.load(open(os.path.join(a.shape, 'groups_compact.json')))['groups']
    g = groups[a.group]
    pk = [k for k in g if k.startswith('profileA')][0]
    P = {k: np.array(v, dtype=float) for k, v in g[pk].items()}  # None → nan (sparse groups)

    d, tris = load(a.fit)
    allt = np.concatenate(list(tris.values()))
    bill, tail = d['billTip'], d['tailTip']
    to_px, L = frame_a(bill, tail)
    mA = raster(allt[:, :, [2, 1]], med.shape, to_px)
    mA = cv2.morphologyEx(mA.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    I = iou(mA, med)
    per = {}
    for n in g['photos']:
        f = os.path.join(a.shape, 'norm', f'A_p{n}.png')
        if os.path.exists(f):
            per[n] = iou(mA, np.array(Image.open(f)) > 127)
    u, l = prof_a(mA)
    du = u - P['upper_median']
    dl = l - P['lower_median']
    sel = [i for i, x in enumerate(XS) if 0.1 - 1e-9 <= x <= 0.9 + 1e-9]
    sel = [i for i in sel if np.isfinite(du[i]) and np.isfinite(dl[i])]
    within = sum(1 for i in sel if abs(du[i]) <= 0.02 and abs(dl[i]) <= 0.02)
    has_iqr = 'upper_q1' in P  # quartiles only for the relaxed group
    in_iqr = sum(1 for i in sel if P['upper_q1'][i] <= u[i] <= P['upper_q3'][i] and P['lower_q1'][i] <= l[i] <= P['lower_q3'][i]) if has_iqr else None
    bad = [(round(XS[i], 2), round(float(du[i]), 3), round(float(dl[i]), 3)) for i in sel if abs(du[i]) > 0.02 or abs(dl[i]) > 0.02]

    # ---- mm measurements (model frame) ----
    no_bill = np.concatenate([t for k, t in tris.items() if not k.startswith('bare')])
    body = tris.get('body0', no_bill)
    side, zc, yr = mm_mask(allt[:, :, [2, 1]], (-100, 0), (70, 125))
    side_nb, _, _ = mm_mask(no_bill[:, :, [2, 1]], (-100, 0), (70, 125))
    Zc = zc(np.arange(side.shape[1]))
    Yr = yr(np.arange(side.shape[0]))

    def col(z):
        c = int(np.argmin(abs(Zc - z)))
        r = np.where(side[:, c])[0]
        return (float(Yr[r.min()]), float(Yr[r.max()])) if len(r) else (np.nan, np.nan)

    prof = {z: col(z) for z in PROFILE_Z}
    front = {}
    for y in FRONT_Y + [84, 88]:
        r = int(np.argmin(abs(Yr - y)))
        c = np.where(side_nb[r])[0]
        front[y] = float(Zc[c.max()]) if len(c) else np.nan
    # belly low point / crown on the side silhouette
    bot = np.array([Yr[np.where(side_nb[:, c])[0].max()] if side_nb[:, c].any() else np.inf for c in range(side.shape[1])])
    sel_b = (Zc > -45) & (Zc < 30)
    bmin = float(bot[sel_b].min())
    bz = Zc[sel_b][bot[sel_b] <= bmin + 0.5]
    top = np.array([Yr[np.where(side_nb[:, c])[0].min()] if side_nb[:, c].any() else -np.inf for c in range(side.shape[1])])
    crown_i = int(np.argmax(top))
    # widths (top view, x-z): full mesh without bill, and the body mesh alone
    topv, xc, zr = mm_mask(no_bill[:, :, [0, 2]], (-40, -100), (40, 70))
    topb, _, _ = mm_mask(body[:, :, [0, 2]], (-40, -100), (40, 70))
    Xc = xc(np.arange(topv.shape[1]))
    Zr = zr(np.arange(topv.shape[0]))

    def width(mask, z):
        r = int(np.argmin(abs(Zr - z)))
        c = np.where(mask[r])[0]
        return float(Xc[c.max()] - Xc[c.min()]) if len(c) else 0.0

    widths_full = {z: width(topv, z) for z in range(-60, 45, 10)}
    widths_body = {z: width(topb, z) for z in range(-60, 45, 10)}
    # front view (x-y): widest height, head width
    frontv, xc2, yr2 = mm_mask(no_bill[:, :, [0, 1]], (-40, 0), (40, 125))
    X2 = xc2(np.arange(frontv.shape[1]))
    Y2 = yr2(np.arange(frontv.shape[0]))
    wrow = np.array([(np.ptp(X2[np.where(frontv[r])[0]]) if frontv[r].any() else 0) for r in range(frontv.shape[0])])
    body_rows = (Y2 > 30) & (Y2 < 85)
    wide_y = float(Y2[body_rows][np.argmax(wrow[body_rows])])
    frontb, _, _ = mm_mask(body[:, :, [0, 1]], (-40, 0), (40, 125))
    wrowb = np.array([(np.ptp(X2[np.where(frontb[r])[0]]) if frontb[r].any() else 0) for r in range(frontb.shape[0])])
    wide_yb = float(Y2[body_rows][np.argmax(wrowb[body_rows])])
    # head width behind the eye: body mesh vertices of the head region (z 15..22, y 88..100)
    bv = body.reshape(-1, 3)
    hsel = (bv[:, 2] > 15) & (bv[:, 2] < 22) & (bv[:, 1] > 88) & (bv[:, 1] < 100)
    head_w = float(np.ptp(bv[hsel, 0])) if hsel.any() else np.nan
    max_w_full = max(widths_full[z] for z in range(-20, 20, 10))

    res = {
        'group': a.group,
        'L': round(float(L), 1),
        'IoU_median': round(I, 3),
        'perPhoto_median': round(float(np.median(list(per.values()))), 3) if per else None,
        'perPhoto_min': round(float(min(per.values())), 3) if per else None,
        'profile_within_0.02L': f'{within}/{len(sel)}',
        'profile_inIQR': f'{in_iqr}/{len(sel)}' if has_iqr else None,
        'profile_bad(x,dU,dL)': bad,
        'billTip': [round(v, 1) for v in bill],
        'tailTip': [round(v, 1) for v in tail],
        'side_top_bottom': {z: [round(t, 1), round(b, 1), PROFILE_TOP[i], PROFILE_BOT[i]] for i, (z, (t, b)) in enumerate(prof.items())},
        'front_z(model,target)': {y: [round(front[y], 1), FRONT_Z[FRONT_Y.index(y)] if y in FRONT_Y else None] for y in front},
        'belly_low': [round(bmin, 1), [float(bz.min()), float(bz.max())]],
        'crown': [round(float(Zc[crown_i]), 1), round(float(top[crown_i]), 1)],
        'width_full_by_z': widths_full,
        'width_body_by_z': widths_body,
        'max_width_full(z-20..10)': round(max_w_full, 1),
        'max_width_full(any z)': round(float(2 * np.abs(no_bill[:, :, 0]).max()), 1),
        'max_width_body(any z)': round(float(2 * np.abs(body[:, :, 0]).max()), 1),
        'front_widest_y(full,body)': [round(wide_y, 1), round(wide_yb, 1)],
        'head_width': round(head_w, 1),
        'head/body_width': round(head_w / max_w_full, 3) if max_w_full else None,
        'checks': d.get('checks'),
        'tibia_sdf': d.get('tibia'),
        'joints': d.get('joints'),
    }
    txt = json.dumps(res, indent=1, default=float)
    print(txt)
    if a.json:
        open(a.json, 'w').write(txt)
    if a.out:
        img = np.full(med.shape + (3,), 255, np.uint8)
        img[med] = (255, 200, 200)
        img[mA & ~med] = (160, 160, 255)
        img[mA & med] = (200, 120, 150)
        cv2.putText(img, f'IoU {I:.3f}  L {L:.1f}', (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1)
        # median profile lines
        for i, x in enumerate(XS):
            c = int(round((x - XR[0]) * R))
            for yv, colr in ((P['upper_median'][i], (0, 128, 0)), (P['lower_median'][i], (0, 128, 0))):
                if np.isfinite(yv):
                    cv2.circle(img, (c, int(round((YR[1] - yv) * R))), 2, colr, -1)
        cv2.imwrite(a.out, img)


if __name__ == '__main__':
    main()
