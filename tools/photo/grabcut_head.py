#!/usr/bin/env python3
"""GrabCut the fish out of a head photo and save mask + overlay.  usage: grabcut_head.py pNNN x0 y0 x1 y1 [fx fy ...] [--bg x y ...] [--out DIR]
The rectangle is the probable-foreground region; extra (fx fy) pairs are forced foreground seeds (small discs), --bg pairs forced background seeds."""
import sys, os, cv2, numpy as np
PH = os.environ.get('YAMAME_PHOTOS', '/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/head50')
def main():
    a = sys.argv[1:]; pid = a[0]; rect = tuple(int(v) for v in a[1:5]); rest = a[5:]; out = os.path.join(PH, '..', 'gc')
    bg = []
    if '--out' in rest: i = rest.index('--out'); out = rest[i + 1]; rest = rest[:i] + rest[i + 2:]
    if '--bg' in rest: i = rest.index('--bg'); bg = [int(v) for v in rest[i + 1:]]; rest = rest[:i]
    fg = [int(v) for v in rest]
    img = cv2.imread(os.path.join(PH, pid + '.jpg')); h, w = img.shape[:2]
    mask = np.zeros((h, w), np.uint8); mask[:] = cv2.GC_BGD
    x0, y0, x1, y1 = rect; mask[y0:y1, x0:x1] = cv2.GC_PR_FGD
    for i in range(0, len(fg), 2): cv2.circle(mask, (fg[i], fg[i + 1]), 6, cv2.GC_FGD, -1)
    for i in range(0, len(bg), 2): cv2.circle(mask, (bg[i], bg[i + 1]), 6, cv2.GC_BGD, -1)
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(img, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    m = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    # keep the biggest component, fill holes
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m); 
    if n > 1: k = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]); m = (lab == k).astype(np.uint8)
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); big = max(cnts, key=cv2.contourArea)
    m2 = np.zeros_like(m); cv2.drawContours(m2, [big], -1, 1, -1)
    os.makedirs(out, exist_ok=True); cv2.imwrite(os.path.join(out, pid + '_mask.png'), m2 * 255)
    ov = img.copy(); cv2.drawContours(ov, [big], -1, (255, 0, 255), 1); cv2.imwrite(os.path.join(out, pid + '_ov.png'), cv2.resize(ov, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
    np.save(os.path.join(out, pid + '_contour.npy'), big[:, 0, :]); print('area', int(m2.sum()), os.path.join(out, pid + '_ov.png'))
main()
