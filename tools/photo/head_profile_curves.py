#!/usr/bin/env python3
"""Robust head profile from head_outlines.json.  Per photo the chord is re-aimed at the centre of the head height at u_ref (default 0.9) so that photo pitch cancels:
rotate (u,v) about the snout tip by -atan2(c(u_ref), u_ref), c = (top+bot)/2.  Then median / spread over photos for top(u), bot(u), height(u), centre(u).
usage: head_profile_curves.py [--exclude pNNN ...] [--uref 0.9]"""
import json, math, os, sys, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); import head_stats as H
D = os.path.join(os.path.dirname(__file__), '../../docs/yamame/photo_analysis')
args = sys.argv[1:]; excl = set(); uref = 0.9; only = None
if '--only' in args: i = args.index('--only'); only = set(args[i + 1:]); args = args[:i]
if '--uref' in args: i = args.index('--uref'); uref = float(args[i + 1]); del args[i:i + 2]
if '--exclude' in args: i = args.index('--exclude'); excl = set(args[i + 1:]); args = args[:i]
d = json.load(open(os.path.join(D, 'head_outlines.json')))
U = np.arange(0.0, 1.201, 0.05)
tops, bots, used = [], [], []
A, B = {}, {}
for g in (1, 2, 3): A.update(H.load(g, 'A')); B.update(H.load(g, 'B'))
LM = {}   # landmark name -> list of (u, v) in the re-aimed frame
MOUTH = {}
for pid, r in d.items():
    if pid in excl or (only and pid not in only): continue
    u = np.array(r['u']); t = np.array([np.nan if x is None else x for x in r['top']]); b = np.array([np.nan if x is None else x for x in r['bot']])
    ok = ~np.isnan(t) & ~np.isnan(b)
    if ok.sum() < 20: continue
    c = (t + b) / 2; cref = np.interp(uref, u[ok], c[ok]); th = math.atan2(cref, uref)
    # rotate the outline points by -th about the origin, then resample top/bottom as functions of the rotated u
    ct, st = math.cos(-th), math.sin(-th)
    ru_t = ct * u[ok] - st * t[ok]; rv_t = st * u[ok] + ct * t[ok]; ru_b = ct * u[ok] - st * b[ok]; rv_b = st * u[ok] + ct * b[ok]
    o = np.argsort(ru_t); T = np.interp(U, ru_t[o], rv_t[o], left=np.nan, right=np.nan); o = np.argsort(ru_b); Bm = np.interp(U, ru_b[o], rv_b[o], left=np.nan, right=np.nan)
    tops.append(T); bots.append(Bm); used.append(pid)
    if pid in A and pid in B:
        fa, fb = H.to_frame(A[pid]['landmarks']), H.to_frame(B[pid]['landmarks']); MOUTH[pid] = (A[pid].get('mouth_state'), B[pid].get('mouth_state'))
        if fa and fb:
            for k in set(fa) & set(fb):
                if k == 'HL_px': continue
                uu, vv = (fa[k][0] + fb[k][0]) / 2, (fa[k][1] + fb[k][1]) / 2
                LM.setdefault(k, []).append((ct * uu - st * vv, st * uu + ct * vv))
tops, bots = np.array(tops), np.array(bots)
med = lambda a: np.nanmedian(a, axis=0); mad = lambda a: 1.4826 * np.nanmedian(np.abs(a - np.nanmedian(a, axis=0)), axis=0)
print('photos:', used)
print(' u     top(med/mad)    bot(med/mad)   height   centre')
res = {'u': U.tolist(), 'top': med(tops).tolist(), 'bot': med(bots).tolist(), 'top_mad': mad(tops).tolist(), 'bot_mad': mad(bots).tolist(), 'photos': used, 'uref': uref}
for i, u in enumerate(U):
    t, b = res['top'][i], res['bot'][i]
    print(f'{u:5.2f}  {t:6.3f}/{res["top_mad"][i]:5.3f}  {b:6.3f}/{res["bot_mad"][i]:5.3f}  {t - b:6.3f}  {(t + b) / 2:6.3f}')
res['mouth_state'] = MOUTH
res['landmarks'] = {k: {'n': len(v), 'u': float(np.median([p[0] for p in v])), 'v': float(np.median([p[1] for p in v])), 'u_mad': float(1.4826 * np.median(np.abs(np.array([p[0] for p in v]) - np.median([p[0] for p in v])))), 'v_mad': float(1.4826 * np.median(np.abs(np.array([p[1] for p in v]) - np.median([p[1] for p in v]))))} for k, v in LM.items() if len(v) >= 3}
print('landmarks (re-aimed frame, median / mad):')
for k, v in sorted(res['landmarks'].items()): print(f"  {k:22s} n={v['n']:2d}  u={v['u']:6.3f}/{v['u_mad']:5.3f}  v={v['v']:6.3f}/{v['v_mad']:5.3f}")
json.dump(res, open(os.path.join(D, 'head_profile_curves.json'), 'w'), indent=1)
