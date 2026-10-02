#!/usr/bin/env python3
"""Dense head outlines in chord coordinates: GrabCut each rated lateral photo, warp the mask into the chord frame (u along snout_tip -> opercle_post_mid, v dorsal-up, both /HL)
and read the dorsal/ventral extremes per column.  Output: docs/yamame/photo_analysis/head_outlines.json  { pid: {u:[...], top:[...], bot:[...]} }, plus overlay PNGs in scratch/gc.
usage: head_outlines.py [pid ...]   (default: every photo flagged usable by both raters)"""
import json, glob, math, os, sys, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); import head_stats as H
PH = os.environ.get('YAMAME_PHOTOS', '/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/head50')
OUT = os.path.join(PH, '..', 'gc'); os.makedirs(OUT, exist_ok=True)
U = np.arange(-0.05, 1.31, 0.025)

def mean_lm(a, b):
    lm = {}
    for k in set(a) | set(b):
        pa, pb = a.get(k), b.get(k)
        if pa and pb: lm[k] = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]
        elif pa or pb: lm[k] = list(pa or pb)
    return lm

def run(pid, A, B):
    a, b = A.get(pid, {'landmarks': {}}), B.get(pid, {'landmarks': {}}); lm = mean_lm(a['landmarks'], b['landmarks'])
    if 'snout_tip' not in lm or 'opercle_post_mid' not in lm or 'eye_center' not in lm: return None
    S, O, E = np.array(lm['snout_tip']), np.array(lm['opercle_post_mid']), np.array(lm['eye_center'])
    img = cv2.imread(os.path.join(PH, pid + '.jpg')); h, w = img.shape[:2]
    ux = (O - S) / np.linalg.norm(O - S); hl = np.linalg.norm(O - S); vx = np.array([-ux[1], ux[0]])
    if (E - S) @ vx < 0: vx = -vx
    # probable-foreground polygon: chord frame box u in [-0.08, 1.5], v in [-0.55, 0.6]
    corners = [S + hl * (u * ux + v * vx) for u, v in [(-0.08, -0.55), (1.5, -0.55), (1.5, 0.6), (-0.08, 0.6)]]
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    poly = np.array(corners, np.int32); cv2.fillPoly(mask, [poly], cv2.GC_PR_FGD)
    for k in ('eye_center', 'preopercle_mid', 'mouth_corner', 'maxilla_post_end'):
        if k in lm: cv2.circle(mask, tuple(int(x) for x in lm[k]), 4, cv2.GC_FGD, -1)
    cv2.circle(mask, tuple(int(x) for x in (S + hl * (0.15 * ux + 0.0 * vx))), 3, cv2.GC_FGD, -1)
    cv2.circle(mask, tuple(int(x) for x in (S + hl * (0.6 * ux + 0.05 * vx))), 5, cv2.GC_FGD, -1)
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65)); mask = mask.astype(np.uint8)
    try: cv2.grabCut(img, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    except Exception as e: print(pid, 'grabcut failed', e); return None
    m = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        k = lab[int(E[1]), int(E[0])] or (1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])); m = (lab == k).astype(np.uint8)
    # warp to the chord frame: 300 px per HL, origin at (u=-0.15, v=-0.8)
    sc = 300.0; u0, v0 = -0.15, -0.8; Wc, Hc = int(1.6 * sc), int(1.8 * sc)
    # chord pixel (cx,cy) -> photo: P = S + hl*((cx/sc+u0)*ux + (v0 + (Hc-cy)/sc)*vx)
    M = np.array([[hl / sc * ux[0], -hl / sc * vx[0], S[0] + hl * (u0 * ux[0] + (v0 + Hc / sc) * vx[0])], [hl / sc * ux[1], -hl / sc * vx[1], S[1] + hl * (u0 * ux[1] + (v0 + Hc / sc) * vx[1])]])
    mc = cv2.warpAffine(m, M, (Wc, Hc), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP, borderValue=0)
    top, bot = [], []
    for u in U:
        cx = int((u - u0) * sc)
        if cx < 0 or cx >= Wc: top.append(None); bot.append(None); continue
        col = np.where(mc[:, cx] > 0)[0]
        if len(col) < 3: top.append(None); bot.append(None); continue
        top.append(float(v0 + (Hc - col.min()) / sc)); bot.append(float(v0 + (Hc - col.max()) / sc))
    ov = cv2.cvtColor(mc * 255, cv2.COLOR_GRAY2BGR)
    # overlay the mask contour on the photo too
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); ph = img.copy(); cv2.drawContours(ph, cnts, -1, (255, 0, 255), 1)
    for k, p in lm.items(): cv2.circle(ph, (int(p[0]), int(p[1])), 2, (0, 255, 255), -1)
    cv2.imwrite(os.path.join(OUT, pid + '_gc.png'), cv2.resize(ph, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
    return {'u': [float(x) for x in U], 'top': top, 'bot': bot, 'HL_px': float(hl), 'facing_vx': [float(vx[0]), float(vx[1])]}

def main():
    A, B = {}, {}
    for g in (1, 2, 3): A.update(H.load(g, 'A')); B.update(H.load(g, 'B'))
    ids = sys.argv[1:] or [i for i in sorted(set(A) | set(B)) if (A.get(i, {}).get('usable_for_profile') or B.get(i, {}).get('usable_for_profile'))]
    res = {}
    for i in ids:
        r = run(i, A, B)
        if r: res[i] = r; print(i, 'ok')
    p = os.path.join(os.path.dirname(__file__), '../../docs/yamame/photo_analysis/head_outlines.json'); json.dump(res, open(p, 'w'))
main()
