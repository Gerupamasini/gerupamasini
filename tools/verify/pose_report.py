#!/usr/bin/env python3
"""Summarise pose_fit output: rms per photo, mean landmark error (HL) over all photos / near-lateral photos / oblique photos.
usage: pose_report.py fit.json"""
import json, sys, numpy as np
d = json.load(open(sys.argv[1]))
rows = sorted(d.items(), key=lambda kv: kv[1]['rms_hl'])
print('photo  yaw pitch roll  n   rms(HL)')
for pid, r in rows: print(f"{pid}  {r['yaw']:6.0f} {r['pitch']:4.0f} {r['roll']:4.0f}  {r['n']:2d}  {r['rms_hl']:.3f}")
def flank_off(y):   # degrees away from a pure flank view (0 or +-180)
    y = ((y + 180) % 360) - 180; return min(abs(y), 180 - abs(y))
for title, sel in (('all', lambda r: True), ('near-lateral (<25 deg off the flank)', lambda r: flank_off(r['yaw']) < 25), ('oblique (>=25 deg)', lambda r: flank_off(r['yaw']) >= 25)):
    acc = {}
    for pid, r in d.items():
        if not sel(r): continue
        for n, e in r['err_hl'].items(): acc.setdefault(n, []).append(e)
    print(f'\\n== mean landmark error, {title}: n photos = {sum(1 for r in d.values() if sel(r))}')
    for n, v in sorted(acc.items(), key=lambda kv: -np.mean(kv[1])): print(f"  {n:22s} mean {np.mean(v):.3f}  median {np.median(v):.3f}  (n={len(v)})")
