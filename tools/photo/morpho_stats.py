#!/usr/bin/env python3
"""Aggregate landmark measurements (landmarks_<chunk>_<A|B>.json) into morphometric ratios,
a normalised body-silhouette profile and inter-rater error estimates.

Conventions
  * All input coordinates are original image pixels (y down).
  * s  = arc-length position along the snout -> caudal_base midline, 0 at the snout, 1 at caudal_base.
  * d  = signed perpendicular distance from the midline, in units of SL (positive = dorsal).
  * SL = midline arc length (curved SL). `curve_ratio` = curved SL / straight SL (flag > 1.05).
  * HL = straight distance snout -> opercle_post.

usage:  morpho_stats.py [--dir docs/yamame/photo_analysis] [--min-conf med]
writes: morphometrics.json, morphometrics_summary.md, profile_mean.json  (into --dir)
"""
import argparse, glob, json, math, os, statistics as st
import numpy as np

CONF = {"low": 0, "med": 1, "medium": 1, "high": 2}


def pt(lm, k):
    v = lm.get(k)
    if v is None or len(v) != 2 or any(x is None for x in v):
        return None
    return np.array(v, float)


def dist(a, b):
    return None if a is None or b is None else float(np.linalg.norm(a - b))


class Midline:
    def __init__(self, pts):
        self.p = np.array(pts, float)
        seg = np.diff(self.p, axis=0)
        self.l = np.linalg.norm(seg, axis=1)
        self.c = np.concatenate([[0.0], np.cumsum(self.l)])
        self.total = float(self.c[-1])

    def project(self, q):
        """-> (arc_length, signed_distance). sign = cross(tangent, q - foot) (image coords, y down)."""
        q = np.asarray(q, float)
        best = None
        n = len(self.l)
        for i in range(n):
            a, b = self.p[i], self.p[i + 1]
            ab = b - a
            L2 = float(ab @ ab)
            if L2 == 0:
                continue
            t = float(((q - a) @ ab) / L2)
            tc = t
            if not (i == 0 and t < 0) and not (i == n - 1 and t > 1):
                tc = min(1.0, max(0.0, t))
            foot = a + tc * ab
            d = float(np.linalg.norm(q - foot))
            if best is None or d < best[0]:
                cross = ab[0] * (q - foot)[1] - ab[1] * (q - foot)[0]
                best = (d, self.c[i] + tc * math.sqrt(L2), math.copysign(d, cross if cross != 0 else 1.0))
        return best[1], best[2]


def photo_metrics(rec):
    lm = rec.get("landmarks") or rec  # tolerate flat layout
    mid = rec.get("midline") or lm.get("midline")
    snout, cb = pt(lm, "snout"), pt(lm, "caudal_base")
    out = {}
    if snout is None or cb is None:
        return None
    if not mid or len(mid) < 3:
        mid = [snout.tolist(), cb.tolist()]
    M = Midline(mid)
    SL = M.total
    out["SL_px"] = SL
    out["curve_ratio"] = SL / dist(snout, cb)
    S = lambda k: (lambda p: None if p is None else M.project(p))(pt(lm, k))
    sg = lambda k: (lambda r: None if r is None else r[0] / SL)(S(k))

    def ratio(a, b, den):
        d = dist(pt(lm, a), pt(lm, b))
        return None if d is None else d / den

    HL = dist(snout, pt(lm, "opercle_post"))
    out["HL_over_SL"] = None if HL is None else HL / SL
    if HL:
        out["eye_d_over_HL"] = ratio("eye_anterior", "eye_posterior", HL)
        out["snout_len_over_HL"] = ratio("snout", "eye_anterior", HL)
        out["maxilla_over_HL"] = ratio("snout", "maxilla_post", HL)
        out["postorbital_over_HL"] = ratio("eye_posterior", "opercle_post", HL)
        out["lower_jaw_over_HL"] = ratio("snout", "lower_jaw_tip", HL)
    ed = dist(pt(lm, "eye_anterior"), pt(lm, "eye_posterior"))
    out["eye_d_over_SL"] = None if ed is None else ed / SL
    pd = lm.get("pupil_diameter_px")
    out["pupil_over_eye_d"] = None if (pd is None or not ed) else pd / ed
    # maxilla end relative to eye (in eye diameters along body axis; <0 = before eye centre)
    sm, se = S("maxilla_post"), S("eye_center")
    if sm and se and ed:
        out["maxilla_end_minus_eye_centre_in_eyeD"] = (sm[0] - se[0]) / ed
    out["BD_max_over_SL"] = ratio("bd_max_top", "bd_max_bottom", SL)
    t, b = pt(lm, "bd_max_top"), pt(lm, "bd_max_bottom")
    if t is not None and b is not None:
        out["BD_max_pos_s"] = M.project((t + b) / 2)[0] / SL
    out["CP_min_over_SL"] = ratio("cp_min_top", "cp_min_bottom", SL)
    t, b = pt(lm, "cp_min_top"), pt(lm, "cp_min_bottom")
    if t is not None and b is not None:
        out["CP_min_pos_s"] = M.project((t + b) / 2)[0] / SL
    for k, name in (("dorsal_origin", "predorsal"), ("pelvic_origin", "prepelvic"), ("anal_origin", "preanal"),
                    ("pectoral_base_top", "prepectoral"), ("adipose_base_front", "preadipose")):
        out[name + "_s"] = sg(k)
    for a, bb, name in (("dorsal_origin", "dorsal_end", "D_base"), ("anal_origin", "anal_end", "A_base"),
                        ("adipose_base_front", "adipose_base_rear", "Ad_base")):
        sa, sb = S(a), S(bb)
        out[name + "_over_SL"] = None if not (sa and sb) else abs(sb[0] - sa[0]) / SL

    def fin_height(o, e, tip):
        po, pe, pt_ = pt(lm, o), pt(lm, e), pt(lm, tip)
        if po is None or pe is None or pt_ is None:
            return None
        v = pe - po
        n = np.linalg.norm(v)
        return None if n == 0 else abs(v[0] * (pt_ - po)[1] - v[1] * (pt_ - po)[0]) / n / SL

    out["D_height_over_SL"] = fin_height("dorsal_origin", "dorsal_end", "dorsal_tip_longest")
    out["A_height_over_SL"] = fin_height("anal_origin", "anal_end", "anal_tip_longest")
    pb = None
    t, b = pt(lm, "pectoral_base_top"), pt(lm, "pectoral_base_bottom")
    if t is not None and b is not None:
        pb = (t + b) / 2
    pt_tip = pt(lm, "pectoral_tip")
    out["P1_len_over_SL"] = None if pb is None or pt_tip is None else dist(pb, pt_tip) / SL
    out["P2_len_over_SL"] = ratio("pelvic_origin", "pelvic_tip", SL)
    ad_h = None
    ab_, ar, at = pt(lm, "adipose_base_front"), pt(lm, "adipose_base_rear"), pt(lm, "adipose_tip")
    if ab_ is not None and ar is not None and at is not None:
        v = ar - ab_
        n = np.linalg.norm(v)
        ad_h = None if n == 0 else abs(v[0] * (at - ab_)[1] - v[1] * (at - ab_)[0]) / n / SL
    out["Ad_height_over_SL"] = ad_h
    cu, cl, cf = pt(lm, "caudal_tip_upper"), pt(lm, "caudal_tip_lower"), pt(lm, "caudal_fork")
    if cu is not None and cl is not None:
        out["caudal_span_over_SL"] = dist(cu, cl) / SL
        out["caudal_len_over_SL"] = dist(cb, (cu + cl) / 2) / SL
        if cf is not None:
            mid_tip = (cu + cl) / 2
            out["caudal_fork_depth_over_SL"] = dist(mid_tip, cf) / SL
    # silhouette profile
    prof = None
    od, ov = rec.get("outline_dorsal") or lm.get("outline_dorsal"), rec.get("outline_ventral") or lm.get("outline_ventral")
    if od and ov and len(od) >= 6 and len(ov) >= 6:
        def conv(poly):
            r = [M.project(p) for p in poly]
            return [(a / SL, d / SL) for a, d in r]
        cd, cv = conv(od), conv(ov)
        if np.median([d for _, d in cd]) < np.median([d for _, d in cv]):  # make dorsal positive
            cd = [(a, -d) for a, d in cd]
            cv = [(a, -d) for a, d in cv]
        prof = {"dorsal": cd, "ventral": cv}
    # parr marks
    pm = rec.get("parr_marks") or []
    marks = []
    for m in pm:
        try:
            a, d = M.project((m["cx"], m["cy"]))
            marks.append({"s": a / SL, "d": d / SL, "h_over_SL": m.get("h", 0) / SL, "w_over_SL": m.get("w", 0) / SL})
        except Exception:
            pass
    return {"metrics": {k: v for k, v in out.items() if v is not None}, "profile": prof, "parr_marks": marks}


def resample(curve, grid):
    curve = sorted(curve)
    xs, ys = zip(*curve)
    return np.interp(grid, xs, ys, left=np.nan, right=np.nan)


def summarise(vals):
    v = [x for x in vals if x is not None and not (isinstance(x, float) and math.isnan(x))]
    if not v:
        return None
    return {"n": len(v), "mean": float(np.mean(v)), "sd": float(np.std(v, ddof=1)) if len(v) > 1 else 0.0,
            "median": float(np.median(v)), "min": float(np.min(v)), "max": float(np.max(v))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="docs/yamame/photo_analysis")
    ap.add_argument("--min-conf", default="med")
    a = ap.parse_args()
    cat = {}
    for f in glob.glob(os.path.join(a.dir, "catalog_c*.json")):
        try:
            for r in json.load(open(f)):
                cat[r["id"]] = r
        except Exception as e:
            print("catalog load fail", f, e)
    per = {}  # (photo, rater) -> result
    for f in sorted(glob.glob(os.path.join(a.dir, "landmarks_c*_*.json"))):
        try:
            d = json.load(open(f))
        except Exception as e:
            print("landmark load fail", f, e)
            continue
        rater = d.get("rater")
        for rec in d.get("photos", []):
            r = photo_metrics(rec)
            if r:
                conf = str(rec.get("confidence", "med")).lower()
                r["confidence"] = conf
                r["facing"] = rec.get("facing")
                per[(rec["id"], rater)] = r
    min_c = CONF.get(a.min_conf, 1)
    photos = sorted({p for p, _ in per})
    # inter-rater
    inter = {}
    for p in photos:
        if (p, "A") in per and (p, "B") in per:
            ma, mb = per[(p, "A")]["metrics"], per[(p, "B")]["metrics"]
            for k in set(ma) & set(mb):
                if abs(ma[k] + mb[k]) > 0:
                    inter.setdefault(k, []).append((abs(ma[k] - mb[k]), abs(ma[k] - mb[k]) / (abs(ma[k] + mb[k]) / 2)))
    inter_s = {k: {"n": len(v), "median_abs": float(np.median([x[0] for x in v])),
                   "median_rel": float(np.median([x[1] for x in v])), "p90_rel": float(np.percentile([x[1] for x in v], 90))}
               for k, v in inter.items()}
    # aggregated per photo (mean of raters that pass the confidence filter)
    agg = {}
    for p in photos:
        rs = [per[(p, r)] for r in ("A", "B") if (p, r) in per and CONF.get(per[(p, r)]["confidence"], 1) >= min_c]
        if not rs:
            continue
        keys = set().union(*[set(r["metrics"]) for r in rs])
        m = {}
        for k in keys:
            vv = [r["metrics"][k] for r in rs if k in r["metrics"]]
            m[k] = float(np.mean(vv))
        agg[p] = {"metrics": m, "n_raters": len(rs), "curve_ratio": m.get("curve_ratio")}
    # exclusion by catalog: non-yamame suspects / curved bodies tracked as flags only
    def stage(p):
        return (cat.get(p, {}).get("life_stage") or "unknown")

    def species(p):
        return ((cat.get(p, {}).get("species_ident") or {}).get("label") or "unclear")

    groups = {"all": lambda p: True,
              "yamame_only": lambda p: species(p) in ("yamame", "unclear"),
              "parr_juvenile": lambda p: stage(p) in ("parr", "juvenile") and species(p) in ("yamame", "unclear"),
              "adult_nonspawning": lambda p: stage(p) == "adult_nonspawning" and species(p) in ("yamame", "unclear"),
              "spawning_or_post": lambda p: stage(p) in ("spawning_male", "spawning_female", "post_spawn")}
    keys = sorted({k for v in agg.values() for k in v["metrics"]})
    stats = {g: {k: summarise([agg[p]["metrics"].get(k) for p in agg if fn(p)]) for k in keys} for g, fn in groups.items()}
    # profile
    grid = np.linspace(0, 1, 41)
    prof_stack = {"dorsal": [], "ventral": [], "ids": []}
    for p in agg:
        if species(p) not in ("yamame", "unclear"):
            continue
        ps = [per[(p, r)]["profile"] for r in ("A", "B") if (p, r) in per and per[(p, r)]["profile"]
              and CONF.get(per[(p, r)]["confidence"], 1) >= min_c and (per[(p, r)]["metrics"].get("curve_ratio", 1) < 1.08)]
        if not ps:
            continue
        dd = np.nanmean([resample(x["dorsal"], grid) for x in ps], axis=0)
        vv = np.nanmean([resample(x["ventral"], grid) for x in ps], axis=0)
        prof_stack["dorsal"].append(dd.tolist())
        prof_stack["ventral"].append(vv.tolist())
        prof_stack["ids"].append(p)
    prof_out = {"s": grid.tolist(), "ids": prof_stack["ids"]}
    if prof_stack["ids"]:
        D, V = np.array(prof_stack["dorsal"]), np.array(prof_stack["ventral"])
        prof_out.update({"dorsal_mean": np.nanmean(D, axis=0).tolist(), "dorsal_sd": np.nanstd(D, axis=0).tolist(),
                         "ventral_mean": np.nanmean(V, axis=0).tolist(), "ventral_sd": np.nanstd(V, axis=0).tolist(),
                         "depth_mean": np.nanmean(D - V, axis=0).tolist(), "depth_sd": np.nanstd(D - V, axis=0).tolist()})
    marks_all = {p: per[(p, r)]["parr_marks"] for (p, r) in per if r == "A" and per[(p, r)]["parr_marks"]}
    json.dump({"per_photo_rater": {f"{p}|{r}": v for (p, r), v in per.items()}, "aggregated": agg, "stats": stats,
               "inter_rater": inter_s, "parr_marks_raterA": marks_all}, open(os.path.join(a.dir, "morphometrics.json"), "w"),
              indent=1, default=float)
    json.dump(prof_out, open(os.path.join(a.dir, "profile_mean.json"), "w"), indent=1)
    # markdown
    L = ["# 写真ランドマーク計測 集計 (自動生成: tools/photo/morpho_stats.py)", "",
         f"- 計測写真数(集約後): {len(agg)} / 評価者別レコード: {len(per)} / 信頼度フィルタ: >= {a.min_conf}",
         f"- シルエット平均に使用した写真: {len(prof_stack['ids'])} ({', '.join(prof_stack['ids'])})", "",
         "## 比率統計 (yamame_only 群)", "", "| 指標 | n | 平均 | SD | 中央値 | 最小 | 最大 | 評価者間 中央相対差 |", "|---|---|---|---|---|---|---|---|"]
    for k in keys:
        s = stats["yamame_only"].get(k)
        if not s:
            continue
        ir = inter_s.get(k)
        L.append(f"| {k} | {s['n']} | {s['mean']:.3f} | {s['sd']:.3f} | {s['median']:.3f} | {s['min']:.3f} | {s['max']:.3f} | "
                 f"{'%.1f%%' % (ir['median_rel'] * 100) if ir else '-'} |")
    for g in ("parr_juvenile", "adult_nonspawning", "spawning_or_post"):
        L += ["", f"## 群別: {g}", "", "| 指標 | n | 平均 | SD |", "|---|---|---|---|"]
        for k in ("HL_over_SL", "BD_max_over_SL", "CP_min_over_SL", "eye_d_over_HL", "maxilla_over_HL", "predorsal_s", "prepelvic_s",
                  "preanal_s", "D_base_over_SL", "A_base_over_SL", "P1_len_over_SL", "P2_len_over_SL"):
            s = stats[g].get(k)
            if s:
                L.append(f"| {k} | {s['n']} | {s['mean']:.3f} | {s['sd']:.3f} |")
    if prof_stack["ids"]:
        L += ["", "## 体の深さプロファイル depth(s)/SL (s=0 吻端, 1 尾柄基部)", "", "| s | depth/SL 平均 | SD | 背側d | 腹側d |", "|---|---|---|---|---|"]
        for i in range(0, 41, 2):
            L.append(f"| {grid[i]:.3f} | {prof_out['depth_mean'][i]:.3f} | {prof_out['depth_sd'][i]:.3f} | {prof_out['dorsal_mean'][i]:.3f} | {prof_out['ventral_mean'][i]:.3f} |")
    open(os.path.join(a.dir, "morphometrics_summary.md"), "w").write("\n".join(L) + "\n")
    print("\n".join(L[:12]))
    print("... wrote", a.dir)


if __name__ == "__main__":
    main()
