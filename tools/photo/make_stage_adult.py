#!/usr/bin/env python3
"""Build assets/src/stage_adult.json from the two independent landmark sets of the scaled adult photo a01
(SL 243.2 mm / TL 269.6 mm, MLIT Naruka fishway photo supplied by the user). n = 1 individual.
Averages the two raters (same individual), NOT across individuals."""
import json, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import morpho_stats as ms

D = 'docs/yamame/photo_analysis'
res = []
for r in 'AB':
    rec = json.load(open(f'{D}/landmarks_a01_{r}.json'))['photos'][0]
    res.append(ms.photo_metrics(rec))
M = [r['metrics'] for r in res]
mean = lambda k, default=None: (float(np.mean([m[k] for m in M if k in m])) if any(k in m for m in M) else default)
grid = np.round(np.arange(0, 1.0001, 0.05), 2)
dors, vent = [], []
for r in res:
    dors.append(ms.resample(r['profile']['dorsal'], grid)); vent.append(ms.resample(r['profile']['ventral'], grid))
dm = np.nanmean(dors, axis=0); vm = np.nanmean(vent, axis=0)
pooled = json.load(open('assets/src/params.json'))['silhouette']
# fill unavailable ends (s=0 snout, s=1 tail) from the pooled profile, and lightly smooth the traced profile
dm = np.where(np.isnan(dm), np.array(pooled['dorsal']), dm); vm = np.where(np.isnan(vm), np.array(pooled['ventral']), vm)
def smooth(a):
    b = a.copy()
    for i in range(1, len(a) - 1): b[i] = 0.25 * a[i - 1] + 0.5 * a[i] + 0.25 * a[i + 1]
    return b
dm, vm = smooth(dm), smooth(vm)
# symmetrise the midline slightly: keep depth, centre on the pooled centre offset
out = {
    "_doc": "Adult stage parameters from ONE scaled individual (photo a01: SL 243.2 mm, TL 269.6 mm, captured 2010-08-27 at the Naruka dam fishway; maturity not stated). Mean of two independent raters. Provenance P (n=1).",
    "source": {"photo": "a01", "SL_mm": 243.2, "TL_mm": 269.6, "url": "https://www.kkr.mlit.go.jp/river/kankyou/tashizen/qgl8vl000000624f-att/13.pdf", "raters": ["A", "B"], "px_per_mm": 2.18},
    "silhouette": {"s": [float(x) for x in grid], "dorsal": [round(float(x), 4) for x in dm], "ventral": [round(float(x), 4) for x in vm]},
    "head_length_over_sl": round(mean('HL_over_SL'), 4),
    "eye_outer_d_over_sl": round(mean('eye_d_over_SL'), 4),
    "eye_d_over_hl": round(mean('eye_d_over_HL'), 3),
    "snout_len_over_hl": round(mean('snout_len_over_HL'), 3),
    "fins": {
        "dorsal_origin_s": round(mean('predorsal_s'), 3), "dorsal_base_len": round(mean('D_base_over_SL'), 3),
        "adipose_origin_s": round(mean('preadipose_s'), 3), "adipose_base_len": round(mean('Ad_base_over_SL'), 3),
        "pectoral_origin_s": round(mean('prepectoral_s'), 3), "pectoral_length": round(mean('P1_len_over_SL'), 3),
        "pelvic_origin_s": round(mean('prepelvic_s'), 3), "pelvic_length": round(mean('P2_len_over_SL'), 3),
        "anal_origin_s": round(mean('preanal_s'), 3), "anal_base_len": round(mean('A_base_over_SL'), 3),
        "caudal_length": round(mean('caudal_len_over_SL'), 3), "caudal_span": round(mean('caudal_span_over_SL'), 3), "caudal_fork_depth": round(mean('caudal_fork_depth_over_SL'), 3),
    },
    "body_depth_max_over_sl": round(mean('BD_max_over_SL'), 3), "body_depth_max_pos_s": round(mean('BD_max_pos_s'), 3),
    "peduncle_min_over_sl": round(mean('CP_min_over_SL'), 3),
    "note": "Fin heights/lengths from a01 are lower bounds (fins folded/drooping in the photo); dorsal/anal heights are NOT used."
}
json.dump(out, open('assets/src/stage_adult.json', 'w'), indent=1)
print(json.dumps({k: out[k] for k in out if k not in ('silhouette',)}, indent=1))
print('depth(s):', [round(d - v, 3) for d, v in zip(dm, vm)])
