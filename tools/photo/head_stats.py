#!/usr/bin/env python3
"""Head morphometrics from the two-rater landmark files (docs/yamame/photo_analysis/head_landmarks_g{1,2,3}_{A,B}.json).

Head frame (per photo): origin = snout_tip, u axis = unit vector snout_tip -> opercle_post_mid ("head chord"), v = perpendicular, pointing to the DORSAL side
(sign chosen from the eye position: the eye lies on the dorsal side of the chord). Lengths are divided by HL = |snout_tip - opercle_post_mid|.
Prints per-landmark mean +- SD over the photos flagged usable_for_profile (yaw <= 30) by BOTH raters, plus A/B disagreement; writes head_profile_stats.json.
"""
import json, glob, math, os, statistics as st, sys
D = os.path.join(os.path.dirname(__file__), '../../docs/yamame/photo_analysis')

def load(g, r):
    p = os.path.join(D, f'head_landmarks_g{g}_{r}.json')
    if not os.path.exists(p): return {}
    try: d = json.load(open(p))
    except Exception as e: print('bad json', p, e); return {}
    return {ph['id']: ph for ph in d.get('photos', [])}

def frame(lm):
    S, O, E = lm.get('snout_tip'), lm.get('opercle_post_mid'), lm.get('eye_center')
    if not (S and O): return None
    ux, uy = O[0] - S[0], O[1] - S[1]; hl = math.hypot(ux, uy)
    if hl < 8: return None
    ux, uy = ux / hl, uy / hl; vx, vy = -uy, ux
    if E and ((E[0] - S[0]) * vx + (E[1] - S[1]) * vy) < 0: vx, vy = -vx, -vy   # eye on +v (dorsal side)
    return S, (ux, uy), (vx, vy), hl

def to_frame(lm):
    fr = frame(lm)
    if not fr: return None
    S, u, v, hl = fr; out = {'HL_px': hl}
    for k, p in lm.items():
        if p is None: continue
        dx, dy = p[0] - S[0], p[1] - S[1]
        out[k] = ((dx * u[0] + dy * u[1]) / hl, (dx * v[0] + dy * v[1]) / hl)
    return out

def main():
    A, B = {}, {}
    for g in (1, 2, 3): A.update(load(g, 'A')); B.update(load(g, 'B'))
    ids = sorted(set(A) & set(B)); print('photos rated by both:', len(ids))
    rows = []
    for i in ids:
        a, b = A[i], B[i]
        fa, fb = to_frame(a.get('landmarks', {})), to_frame(b.get('landmarks', {}))
        if not fa or not fb: continue
        use = bool(a.get('usable_for_profile')) and bool(b.get('usable_for_profile'))
        rows.append((i, use, fa, fb, a, b))
    print('with frames:', len(rows), ' usable by both:', sum(1 for r in rows if r[1]))
    names = sorted({k for r in rows for k in r[2] if k != 'HL_px'})
    stats = {}
    for n in names:
        vals_u, vals_v, dis = [], [], []
        for i, use, fa, fb, a, b in rows:
            if not use or n not in fa or n not in fb: continue
            vals_u.append((fa[n][0] + fb[n][0]) / 2); vals_v.append((fa[n][1] + fb[n][1]) / 2); dis.append(math.hypot(fa[n][0] - fb[n][0], fa[n][1] - fb[n][1]))
        if len(vals_u) >= 3:
            stats[n] = {'n': len(vals_u), 'u': [st.mean(vals_u), st.pstdev(vals_u)], 'v': [st.mean(vals_v), st.pstdev(vals_v)], 'ab_disagree_med': st.median(dis)}
    print(f"{'landmark':22s} {'n':>3s} {'u mean':>7s} {'u sd':>6s} {'v mean':>7s} {'v sd':>6s} {'A/B':>6s}")
    for n, s in stats.items(): print(f"{n:22s} {s['n']:3d} {s['u'][0]:7.3f} {s['u'][1]:6.3f} {s['v'][0]:7.3f} {s['v'][1]:6.3f} {s['ab_disagree_med']:6.3f}")
    json.dump({'stats': stats, 'photos': [r[0] for r in rows if r[1]]}, open(os.path.join(D, 'head_profile_stats.json'), 'w'), indent=1)

if __name__ == '__main__': main()
