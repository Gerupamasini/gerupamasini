#!/usr/bin/env python3
"""Fit a weak-perspective camera of the model to a reference photo from matched head landmarks, render the model in exactly that pose and write
a  photo | model | blend  sheet plus the landmark reprojection error (in head lengths).  Verifies the 3-D head from any viewing angle.

usage: pose_fit.py PNNN [PNNN ...] [--glb /assets/generated/yamame.glb] [--lm assets/generated/head_landmarks3d.json] [--out DIR] [--tex clay]
 * photo landmarks: mean of the two raters (docs/yamame/photo_analysis/head_landmarks_g*_{A,B}.json); model landmarks: head_landmarks3d.json (build output).
 * writes DIR/fit_PNNN.png and DIR/fit.json (pose + per-landmark error).
"""
import json, math, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import least_squares
sys.path.insert(0, os.path.dirname(__file__)); sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../photo'))
from head_overlay import photo_landmarks, PH
import head_stats as HS
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
HL_M = 0.254 * 0.19

def rot(yaw, pitch, roll):
    cy, sy, cp, sp, cr, sr = math.cos(yaw), math.sin(yaw), math.cos(-pitch), math.sin(-pitch), math.cos(roll), math.sin(roll)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]]); Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    return Ry @ Rx @ Rz

def project(X, p, T):
    yaw, pitch, roll, k, ox, oy = p; R = rot(yaw, pitch, roll); d = (X - T) @ R   # rows: (right, up, back) components
    return np.stack([ox + k * d[:, 0], oy - k * d[:, 1]], 1)

def rater_prior(pid):
    """(yaw_abs_deg, pitch_deg, facing) averaged over the raters; yaw 0 = pure flank view"""
    rs = []
    for g in (1, 2, 3):
        for r in 'AB':
            try:
                d = HS.load(g, r)
                if pid in d: rs.append(d[pid])
            except Exception: pass
    if not rs: return 0.0, 0.0, 'left'
    yaw = np.mean([abs(x.get('yaw_deg') or 0) for x in rs]); pit = np.mean([x.get('pitch_deg') or 0 for x in rs]); fac = rs[0].get('facing') or 'left'
    return float(yaw), float(pit), fac

def fit(names, M, P, size, prior):
    T = M.mean(0); W, H = size; yawp, pitp, fac = prior; best = None
    base = math.pi if fac == 'left' else 0.0                      # camera on -Z (left flank, head to the left) or +Z
    for sign in (1, -1):
        y0 = base + sign * math.radians(yawp); p0 = math.radians(pitp)
        for yawj in (0.0,):
            x0 = [y0, p0, 0.0, W * 0.9 / 0.07, W / 2, H / 2]
            def f(p):
                r = (project(M, p, T) - P).ravel()
                pr = np.array([(p[0] - y0) / math.radians(14), (p[1] - p0) / math.radians(14)]) * 0.04 * W   # soft prior on the viewing angle from the raters
                return np.concatenate([r, pr])
            try: r = least_squares(f, x0, loss='soft_l1', f_scale=0.02 * W, max_nfev=400, bounds=([-math.pi * 1.5, -1.3, -1.0, 500, -3000, -3000], [math.pi * 1.5, 1.4, 1.0, 60000, 5000, 5000]))
            except Exception: continue
            if best is None or r.cost < best.cost: best = r
    return best, T

def main():
    a = sys.argv[1:]; ids = []; glb = '/assets/generated/yamame.glb'; lmf = 'assets/generated/head_landmarks3d.json'; out = '/tmp/pose_fit'; tex = None; norender = False; i = 0
    while i < len(a):
        if a[i] == '--glb': glb = a[i + 1]; i += 2
        elif a[i] == '--lm': lmf = a[i + 1]; i += 2
        elif a[i] == '--out': out = a[i + 1]; i += 2
        elif a[i] == '--tex': tex = a[i + 1]; i += 2
        elif a[i] == '--no-render': norender = True; i += 1
        else: ids.append(a[i]); i += 1
    os.makedirs(out, exist_ok=True)
    mlm = json.load(open(os.path.join(ROOT, lmf)))
    res = {}
    for pid in ids:
        photo = Image.open(os.path.join(PH, pid + '.jpg')).convert('RGB'); W, H = photo.size
        plm = photo_landmarks(pid); names = [n for n in plm if n in mlm]
        if len(names) < 5: print(pid, 'too few landmarks', names); continue
        M = np.array([mlm[n] for n in names]); P = np.array([plm[n] for n in names])
        r, T = fit(names, M, P, (W, H), rater_prior(pid)); p = r.x; proj = project(M, p, T); err = np.linalg.norm(proj - P, axis=1)
        hl_px = p[3] * HL_M
        R = rot(p[0], p[1], p[2]); ox, oy, k = p[4], p[5], p[3]
        # look-at point so that the render centre = photo centre
        xc, yc = (W / 2 - ox) / k, -(H / 2 - oy) / k; L = T + R @ np.array([xc, yc, 0.0])
        # signed residuals in the head frame: du forward (towards the snout) positive, dv up positive, in head lengths
        fwd = 1.0 if (R[:, 0] @ np.array([1.0, 0, 0])) > 0 else -1.0                     # camera right = +x -> the snout is to the right of the image
        res_hl = {n: [float((q[0] - e[0]) * fwd / hl_px), float(-(q[1] - e[1]) / hl_px)] for n, q, e in zip(names, P, proj)}
        if norender:
            res[pid] = {'yaw': math.degrees(p[0]), 'pitch': math.degrees(p[1]), 'roll': math.degrees(p[2]), 'k': p[3], 'hl_px': hl_px, 'n': len(names), 'rms_hl': float(np.sqrt((err ** 2).mean()) / hl_px), 'err_hl': {n: float(e / hl_px) for n, e in zip(names, err)}, 'res_hl': res_hl}
            print(pid, 'rms', round(res[pid]['rms_hl'], 3)); continue
        url = f"/viewer/dev/still.html?view=pose&yaw={math.degrees(p[0]):.3f}&pitch={math.degrees(p[1]):.3f}&roll={math.degrees(p[2]):.3f}&half={H / (2 * k):.6f}&tx={L[0]:.6f}&ty={L[1]:.6f}&tz={L[2]:.6f}&bg=7d8a90&file={glb}" + (f"&tex={tex}" if tex else '')
        f = os.path.join(out, f'render_{pid}.png')
        subprocess.run(['node', os.path.join(ROOT, 'tools/headless/render-snapshot.mjs'), url, f, '--w', str(W), '--h', str(H)], cwd=ROOT, capture_output=True)
        m = Image.open(f).convert('RGB') if os.path.exists(f) else Image.new('RGB', (W, H))
        blend = Image.blend(photo, m, 0.5)
        panels = []
        for base in (photo, m, blend):
            im = base.copy(); d = ImageDraw.Draw(im)
            for n, q, e in zip(names, P, proj):
                d.ellipse((q[0] - 3, q[1] - 3, q[0] + 3, q[1] + 3), outline=(255, 255, 0)); d.ellipse((e[0] - 3, e[1] - 3, e[0] + 3, e[1] + 3), outline=(0, 255, 255)); d.line((q[0], q[1], e[0], e[1]), fill=(255, 80, 80))
            panels.append(im)
        sheet = Image.new('RGB', (W * 3, H)); [sheet.paste(im, (j * W, 0)) for j, im in enumerate(panels)]
        d = ImageDraw.Draw(sheet); d.text((6, 6), f'{pid} yaw {math.degrees(p[0]):.0f} pitch {math.degrees(p[1]):.0f} roll {math.degrees(p[2]):.0f}  rms {np.sqrt((err ** 2).mean()) / hl_px:.3f} HL', fill=(255, 255, 0))
        sc = max(1, 640 // W) if W < 640 else 1
        if sc > 1: sheet = sheet.resize((sheet.width * sc, sheet.height * sc), Image.LANCZOS)
        sheet.save(os.path.join(out, f'fit_{pid}.png'))
        res[pid] = {'yaw': math.degrees(p[0]), 'pitch': math.degrees(p[1]), 'roll': math.degrees(p[2]), 'k': p[3], 'hl_px': hl_px, 'n': len(names), 'rms_hl': float(np.sqrt((err ** 2).mean()) / hl_px), 'err_hl': {n: float(e / hl_px) for n, e in zip(names, err)}, 'res_hl': res_hl}
        print(pid, f"yaw {math.degrees(p[0]):.0f} pitch {math.degrees(p[1]):.0f} roll {math.degrees(p[2]):.0f}  n={len(names)}  rms={res[pid]['rms_hl']:.3f} HL", ' '.join(f'{n}:{v:.2f}' for n, v in sorted(res[pid]['err_hl'].items(), key=lambda t: -t[1])[:3]))
    json.dump(res, open(os.path.join(out, 'fit.json'), 'w'), indent=1)
main()
