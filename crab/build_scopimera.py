# -*- coding: utf-8 -*-
"""
Scopimera globosa（コメツキガニ）LOD0 を Blender 上で自動生成し GLB へ書き出す。

使い方:
  blender -b -P build_scopimera.py -- out.glb
  または  python3 build_scopimera.py out.glb   （pip の bpy モジュール使用時）

座標系（glTF / Three.js 側）: X=左右(+X が右), Y=上, Z=前(+Z が頭側), 1 unit = 1 m。
脚先が Y=0 に接地する。内部計算は mm・Y-up で行い、Blender(Z-up) へ変換して配置する。
"""
import sys
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector

# ------------------------------------------------------------------ 設定
argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = argv[1:]
OUT = argv[0] if argv else "scopimera_globosa_LOD0.glb"
MM = 0.001          # mm → m
TEX = 2048          # テクスチャアトラス解像度
RNG = np.random.default_rng(7)

# ------------------------------------------------------------------ 形態パラメータ（mm）
CL = 8.0            # 甲長（前後）
CW_HALF = 5.0       # 甲幅の半分（甲幅 10 mm。幅は長さよりやや広い）
DOME_T = 3.5        # 中心線から背面頂部まで（丸く膨らむ甲）
DOME_D = 2.3        # 中心線から腹面まで
H_CENTER = 4.2      # 仮の甲中心高さ（脚先接地ソルバで最終的に全体を持ち上げ/下げ）

# 歩脚: [coxa, basis, merus, carpus, propodus, dactylus] の長さ（mm）
#       長節は幅広く側扁（鼓膜状の窓がある）、指節はやや長く湾曲して尖る。第2・第3歩脚が最長。
LEGS = {
    "leg1": dict(z=1.9, yaw=48.0, L=[0.8, 0.6, 4.6, 2.2, 2.8, 2.9]),
    "leg2": dict(z=0.3, yaw=13.0, L=[0.8, 0.6, 5.6, 2.6, 3.3, 3.3]),
    "leg3": dict(z=-1.4, yaw=-13.0, L=[0.8, 0.6, 5.6, 2.6, 3.3, 3.3]),
    "leg4": dict(z=-2.9, yaw=-50.0, L=[0.8, 0.6, 4.8, 2.2, 2.8, 3.0]),
}
# 断面半径（幅=脚平面の法線方向, 高さ=脚平面内）: 付け根→先端
SEG_R = {
    "coxa":     (0.58, 0.52, 0.66, 0.60),
    "basis":    (0.46, 0.42, 0.52, 0.48),
    "merus":    (0.40, 0.34, 0.70, 0.55),   # 長節: 幅広く平たい板状
    "carpus":   (0.30, 0.26, 0.40, 0.34),
    "propodus": (0.26, 0.21, 0.34, 0.28),
    "dactylus": (0.20, 0.02, 0.24, 0.03),   # 指節: 湾曲して尖る
}
SEGS = ["coxa", "basis", "merus", "carpus", "propodus", "dactylus"]
# 基本姿勢（水平からの仰角, 度）。膝（長節末端）は甲の上面近くまで上がる。carpus 以降はソルバで接地。
PITCH = [-10.0, 5.0, 30.0, -38.0, -64.0, -80.0]

# 鋏脚: 左右同大。掌部は丸く平たく、口の前に折りたたみ、指は下内向き
CHEL = dict(z=2.5,
            L=[0.6, 0.5, 1.8, 1.2, 3.0, 2.3],       # coxa, basis, merus, carpus, propodus(掌部), dactylus
            yaw=[30.0, 55.0, 80.0, 140.0, 165.0, 172.0],  # 前隅で高く構え、指先は正中線付近の地面近くへ
            pitch=[-10.0, 15.0, 35.0, 5.0, -70.0, -82.0])
CHEL_R = {
    "coxa": (0.55, 0.50, 0.62, 0.56),
    "basis": (0.45, 0.42, 0.50, 0.48),
    "merus": (0.38, 0.34, 0.75, 0.62),
    "carpus": (0.42, 0.38, 0.56, 0.52),
    "propodus": (0.42, 0.36, 1.55, 1.25),   # 掌部: 大きく丸く平たい板状
    "fixed": (0.24, 0.02, 0.32, 0.03),      # 不動指
    "dactylus": (0.22, 0.02, 0.30, 0.03),   # 可動指
}


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ 甲羅プロファイル
def carapace_profile(s):
    """s: 前後位置 [-1(後縁), +1(前縁)]。返値: 半幅W, 背高T, 腹深D, 中心y補正, 前後z
    コメツキガニの甲は上面から見て角の丸い四角形〜円形。前縁は広く、前面はほぼ垂直に落ちる。"""
    s = np.asarray(s, dtype=float)
    s0 = 0.05                                          # 最大幅はほぼ中央
    q = np.where(s > s0, (s - s0) / (1 - s0), (s - s0) / (1 + s0))
    base = np.clip(1 - np.abs(q) ** 3.0, 0, 1)
    W = CW_HALF * base ** (1 / 3.0)                    # 角の丸い四角
    W = W * (1 - 0.14 * smooth(-0.2, -1.0, s))         # 後方はやや狭まる
    T = DOME_T * np.clip(1 - np.abs((s + 0.05) / 1.05) ** 2.4, 0, 1) ** 0.55
    D = DOME_D * np.clip(1 - np.abs(s) ** 3.0, 0, 1) ** 0.40
    yc = -0.5 * smooth(0.6, 1.0, s)
    z = s * CL / 2
    return W, T, D, yc, z


def carapace_point(s, a):
    """a: 断面角（-pi/2 = 腹面中央, 0 = 右側面, pi/2 = 背面中央）"""
    W, T, D, yc, z = carapace_profile(s)
    c, sn = math.cos(a), math.sin(a)
    px = 2 / 2.7                                      # 側縁は丸く張り出す
    x = W * math.copysign(abs(c) ** px, c)
    if sn >= 0:
        y = yc + T * abs(sn) ** (2 / 2.4)
    else:
        y = yc - D * abs(sn) ** (2 / 3.6)             # 腹面は平たい
    if sn > 0.15:
        # H 字状の胃域溝と、鰓域の膨らみ
        gx = math.exp(-((abs(x) - 1.6) / 0.28) ** 2) * math.exp(-((z - 0.6) / 1.4) ** 2)
        gz = math.exp(-((z + 0.2) / 0.28) ** 2) * math.exp(-(x / 1.7) ** 2)
        y -= 0.16 * max(gx, gz) * smooth(0.15, 0.5, sn)
        y += 0.22 * math.exp(-((abs(x) - 3.2) / 1.1) ** 2) * math.exp(-((z + 0.6) / 2.4) ** 2) * sn
    return np.array([x, y + H_CENTER, z])


# ------------------------------------------------------------------ UV アトラス
class Atlas:
    def __init__(self):
        self.rects = {}      # key -> (u0, v0, w, h, info)

    def add(self, key, u0, v0, w, h, info):
        self.rects[key] = (u0, v0, w, h, info)
        return self.rects[key]


ATLAS = Atlas()
ATLAS.add("carapace", 0.004, 0.515, 0.992, 0.481, dict(kind="carapace"))
ROWS = ["leg1", "leg2", "leg3", "leg4", "cheliped", "misc"]
ROW_H = 0.5 / len(ROWS)


def layout_row(row, items):
    """items: [(key, relative_length, info)] を 1 行に並べる"""
    r = ROWS.index(row)
    v0 = 0.004 + r * ROW_H
    h = ROW_H - 0.008
    total = sum(it[1] for it in items)
    avail = 0.992 - 0.006 * (len(items) - 1)
    u = 0.004
    for key, ln, info in items:
        w = avail * ln / total
        ATLAS.add(key, u, v0, w, h, info)
        u += w + 0.006


for leg, p in LEGS.items():
    layout_row(leg, [(f"{leg}_{sg}", p["L"][i] + 1.2, dict(kind="seg", seg=sg, leg=leg))
                     for i, sg in enumerate(SEGS)])
layout_row("cheliped", [(f"cheliped_{sg}", ln + 1.0, dict(kind="seg", seg=sg, leg="cheliped"))
                        for sg, ln in zip(["coxa", "basis", "merus", "carpus", "propodus", "fixed", "dactylus"],
                                          CHEL["L"][:5] + [3.0, CHEL["L"][5]])])
layout_row("misc", [("eyestalk", 3.0, dict(kind="eyestalk")),
                    ("cornea", 1.5, dict(kind="cornea")),
                    ("mxp", 3.0, dict(kind="mxp")),
                    ("seta", 1.0, dict(kind="seta")),
                    ("abd", 2.0, dict(kind="abd"))])


# ------------------------------------------------------------------ メッシュ蓄積
class Acc:
    def __init__(self):
        self.V = []          # mm, Y-up
        self.G = []          # vertex -> bone name
        self.F = []          # faces (vertex idx tuples)
        self.FUV = []        # faces uv tuples
        self.FM = []         # material index

    def v(self, p, g):
        self.V.append(np.array(p, dtype=float))
        self.G.append(g)
        return len(self.V) - 1

    def f(self, idx, uv, mat=0):
        self.F.append(tuple(idx))
        self.FUV.append(tuple(uv))
        self.FM.append(mat)


ACC = Acc()


def mirror_x(p, sg):
    return np.array([p[0] * sg, p[1], p[2]])


def frame_from(d):
    """脚平面の基底: d=軸方向, n=脚平面の法線(幅方向), h=脚平面内の背側方向"""
    d = d / np.linalg.norm(d)
    up = np.array([0.0, 1.0, 0.0])
    n = np.cross(d, up)
    if np.linalg.norm(n) < 1e-6:
        n = np.array([0.0, 0.0, 1.0])
    n = n / np.linalg.norm(n)
    h = np.cross(n, d)
    if h[1] < 0:
        h = -h
    return d, n, h


def tube(P0, d, L, r, grp, rect_key, sg, nl=14, nc=14, bend=0.0, tip=False,
         cap0=0.45, cap1=0.45, ext0=0.10, ext1=0.10, mat=0, sq=2.3, h_override=None):
    """扁平断面・テーパー・端部丸めつきの節。r=(幅0,幅1,高0,高1)。
    sg=+1 右, -1 左（ミラー）。UV は rect に展開（u=長さ方向, v=周方向）。"""
    d, n, h = frame_from(d)
    if h_override is not None:
        h = h_override
    rw0, rw1, rh0, rh1 = r
    e0 = ext0 * rh0
    e1 = 0.0 if tip else ext1 * rh1
    Lx = L + e0 + e1
    start = P0 - d * e0
    u0, v0, uw, vh, _ = ATLAS.rects[rect_key]
    rings = []
    taus = []
    for i in range(1, nl):
        tau = i / nl
        # 端付近を細かく（丸めの形状を保つ）
        tau = 0.5 - 0.5 * math.cos(math.pi * tau)
        x = tau * Lx
        t = min(max((x - e0) / L, 0.0), 1.0)
        rw = rw0 + (rw1 - rw0) * t
        rh = rh0 + (rh1 - rh0) * t
        bulge = 1.0 + 0.07 * math.sin(math.pi * t)
        env0 = math.sqrt(max(0.0, 1 - (1 - min(x / (rh0 * cap0 + 1e-6), 1.0)) ** 2))
        if tip:
            env1 = min((Lx - x) / (L * 0.30), 1.0) ** 0.75
        else:
            env1 = math.sqrt(max(0.0, 1 - (1 - min((Lx - x) / (rh1 * cap1 + 1e-6), 1.0)) ** 2))
        env = env0 * env1 * bulge
        C = start + d * x - h * bend * (t ** 2)
        ring = []
        for k in range(nc):
            th = 2 * math.pi * k / nc
            c, s_ = math.cos(th), math.sin(th)
            px = 2 / sq
            cx = math.copysign(abs(c) ** px, c)
            sy = math.copysign(abs(s_) ** px, s_)
            p = C + n * (rw * env * cx) + h * (rh * env * sy)
            ring.append(ACC.v(mirror_x(p, sg), grp))
        rings.append(ring)
        taus.append(tau)
    p_start = ACC.v(mirror_x(start, sg), grp)
    p_end = ACC.v(mirror_x(start + d * Lx - h * bend, sg), grp)

    def uv(tau, k):
        return (u0 + tau * uw, v0 + (k / nc) * vh)

    for i in range(len(rings) - 1):
        for k in range(nc):
            k1 = k + 1
            a, b = rings[i][k], rings[i][k1 % nc]
            c_, d_ = rings[i + 1][k1 % nc], rings[i + 1][k]
            ACC.f((a, b, c_, d_), (uv(taus[i], k), uv(taus[i], k1), uv(taus[i + 1], k1), uv(taus[i + 1], k)), mat)
    for k in range(nc):
        k1 = k + 1
        ACC.f((p_start, rings[0][k1 % nc], rings[0][k]),
              ((u0, v0 + (k + 0.5) / nc * vh), uv(taus[0], k1), uv(taus[0], k)), mat)
        ACC.f((p_end, rings[-1][k], rings[-1][k1 % nc]),
              ((u0 + uw, v0 + (k + 0.5) / nc * vh), uv(taus[-1], k), uv(taus[-1], k1)), mat)
    return start + d * (e0 + L) - h * bend


def ellipsoid(C, ax, ay, az, grp, rect_key, sg, nu=16, nv=10, mat=0, rot=None):
    u0, v0, uw, vh, _ = ATLAS.rects[rect_key]
    rows = []
    for j in range(1, nv):
        ph = -math.pi / 2 + math.pi * j / nv
        row = []
        for i in range(nu):
            th = 2 * math.pi * i / nu
            p = np.array([ax * math.cos(ph) * math.cos(th), ay * math.sin(ph), az * math.cos(ph) * math.sin(th)])
            if rot is not None:
                p = rot @ p
            row.append(ACC.v(mirror_x(C + p, sg), grp))
        rows.append(row)
    bot = ACC.v(mirror_x(C + (rot @ np.array([0, -ay, 0]) if rot is not None else np.array([0, -ay, 0])), sg), grp)
    top = ACC.v(mirror_x(C + (rot @ np.array([0, ay, 0]) if rot is not None else np.array([0, ay, 0])), sg), grp)

    def uv(i, j):
        return (u0 + i / nu * uw, v0 + j / nv * vh)

    for j in range(len(rows) - 1):
        for i in range(nu):
            i1 = i + 1
            ACC.f((rows[j][i], rows[j][i1 % nu], rows[j + 1][i1 % nu], rows[j + 1][i]),
                  (uv(i, j + 1), uv(i1, j + 1), uv(i1, j + 2), uv(i, j + 2)), mat)
    for i in range(nu):
        i1 = i + 1
        ACC.f((bot, rows[0][i1 % nu], rows[0][i]), ((u0 + (i + .5) / nu * uw, v0), uv(i1, 1), uv(i, 1)), mat)
        ACC.f((top, rows[-1][i], rows[-1][i1 % nu]), ((u0 + (i + .5) / nu * uw, v0 + vh), uv(i, nv - 1), uv(i1, nv - 1)), mat)


# ------------------------------------------------------------------ 甲羅メッシュ
def build_carapace(nl=104, nc=128):
    u0, v0, uw, vh, _ = ATLAS.rects["carapace"]
    rings, ss = [], []
    for i in range(1, nl):
        t = i / nl
        s = -math.cos(math.pi * t)                    # 端を細かく
        ring = [ACC.v(carapace_point(s, 2 * math.pi * k / nc - math.pi / 2), "carapace") for k in range(nc)]
        rings.append(ring)
        ss.append(s)
    Wb, Tb, Db, ycb, zb = carapace_profile(-1.0)
    Wf, Tf, Df, ycf, zf = carapace_profile(1.0)
    back = ACC.v(np.array([0, ycb + H_CENTER + 0.4, zb]), "carapace")
    front = ACC.v(np.array([0, ycf + H_CENTER - 0.2, zf]), "carapace")

    def uv(s, k):
        return (u0 + (k / nc) * uw, v0 + (s + 1) / 2 * vh)

    for i in range(len(rings) - 1):
        for k in range(nc):
            k1 = k + 1
            ACC.f((rings[i][k], rings[i][k1 % nc], rings[i + 1][k1 % nc], rings[i + 1][k]),
                  (uv(ss[i], k), uv(ss[i], k1), uv(ss[i + 1], k1), uv(ss[i + 1], k)))
    for k in range(nc):
        k1 = k + 1
        ACC.f((back, rings[0][k1 % nc], rings[0][k]), ((u0 + (k + .5) / nc * uw, v0), uv(ss[0], k1), uv(ss[0], k)))
        ACC.f((front, rings[-1][k], rings[-1][k1 % nc]), ((u0 + (k + .5) / nc * uw, v0 + vh), uv(ss[-1], k), uv(ss[-1], k1)))


def side_attach(z, lower=0.45):
    """甲羅側面下部の付着点（右側）。lower: 腹側への寄り具合"""
    s = z / (CL / 2)
    a = -math.asin(lower)
    return carapace_point(s, a) + np.array([-0.35, 0.0, 0.0])


# ------------------------------------------------------------------ 脚チェーン
def chain_dirs(yaws, pitches):
    out = []
    for yw, pt in zip(yaws, pitches):
        y, p = math.radians(yw), math.radians(pt)
        out.append(np.array([math.cos(p) * math.cos(y), math.sin(p), math.cos(p) * math.sin(y)]))
    return out


def solve_leg(P0, yaw, L, ground):
    """carpus 以降の曲げ δ を二分法で決め、指節先端を ground の高さに接地させる"""
    def tip(delta):
        pts = [PITCH[0], PITCH[1], PITCH[2], PITCH[3] - 0.35 * delta,
               max(PITCH[4] - delta, -100.0), max(PITCH[5] - 0.6 * delta, -105.0)]
        ds = chain_dirs([yaw] * 6, pts)
        P = P0.copy()
        for dd, ln in zip(ds, L):
            P = P + dd * ln
        return P, pts
    lo, hi = -45.0, 70.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        P, _ = tip(mid)
        if P[1] > ground:
            lo = mid
        else:
            hi = mid
    return tip(0.5 * (lo + hi))[1]


BONES = []   # (name, head_mm, tail_mm, parent)


def build_leg(leg, p, sg, ground):
    side = "R" if sg > 0 else "L"
    P0 = side_attach(p["z"])
    pitches = solve_leg(P0, p["yaw"], p["L"], ground)
    dirs = chain_dirs([p["yaw"]] * 6, pitches)
    P = P0.copy()
    parent = "carapace"
    for i, sgm in enumerate(SEGS):
        name = f"{leg}_{side}_{sgm}"
        L = p["L"][i]
        tip = sgm == "dactylus"
        nl = {"coxa": 8, "basis": 8, "merus": 20, "carpus": 12, "propodus": 14, "dactylus": 16}[sgm]
        bend = {"dactylus": 0.45, "propodus": 0.08, "merus": -0.12}.get(sgm, 0.0)
        tube(P, dirs[i], L, SEG_R[sgm], name, f"{leg}_{sgm}", sg, nl=nl, nc=14, bend=bend, tip=tip,
             sq=2.6 if sgm == "merus" else 2.3)
        if sgm in ("merus", "carpus", "propodus"):
            add_setae(P, dirs[i], L, SEG_R[sgm][2], name, sg, {"merus": 12, "carpus": 6, "propodus": 8}[sgm],
                      {"merus": 1.1, "carpus": 0.9, "propodus": 1.0}[sgm], hash((leg, sgm, sg)) % 1000)
        BONES.append((name, mirror_x(P, sg), mirror_x(P + dirs[i] * L, sg), parent))
        parent = name
        P = P + dirs[i] * L


def build_cheliped(sg):
    side = "R" if sg > 0 else "L"
    P0 = side_attach(CHEL["z"], lower=0.05)
    dirs = chain_dirs(CHEL["yaw"], CHEL["pitch"])
    names = ["coxa", "basis", "merus", "carpus", "propodus"]
    P = P0.copy()
    parent = "carapace"
    for i, sgm in enumerate(names):
        name = f"cheliped_{side}_{sgm}"
        L = CHEL["L"][i]
        nl = {"coxa": 8, "basis": 8, "merus": 18, "carpus": 12, "propodus": 18}[sgm]
        tube(P, dirs[i], L, CHEL_R[sgm], name, f"cheliped_{sgm}", sg, nl=nl, nc=16,
             bend=-0.15 if sgm == "merus" else 0.0, sq=2.5)
        BONES.append((name, mirror_x(P, sg), mirror_x(P + dirs[i] * L, sg), parent))
        parent = name
        P = P + dirs[i] * L
    # 不動指（掌部の腹側先端から伸び、下向きに湾曲）
    d_palm, n_palm, h_palm = frame_from(dirs[4])
    d_f = chain_dirs([CHEL["yaw"][5]], [CHEL["pitch"][5] + 4.0])[0]
    base_fixed = P - h_palm * 0.45 - d_palm * 0.25
    tube(base_fixed, d_f, 2.1, CHEL_R["fixed"], f"cheliped_{side}_propodus", "cheliped_fixed", sg,
         nl=16, nc=12, bend=0.25, tip=True, ext0=0.6)
    # 可動指（掌部の背側先端に関節）
    hinge = P + h_palm * 0.40 - d_palm * 0.15
    d_d = chain_dirs([CHEL["yaw"][5]], [CHEL["pitch"][5] - 6.0])[0]
    name = f"cheliped_{side}_dactylus"
    tube(hinge, d_d, CHEL["L"][5], CHEL_R["dactylus"], name, "cheliped_dactylus", sg,
         nl=16, nc=12, bend=0.35, tip=True, ext0=0.6)
    BONES.append((name, mirror_x(hinge, sg), mirror_x(hinge + d_d * CHEL["L"][5], sg), f"cheliped_{side}_propodus"))
    # 指の咬合縁の細かな歯（両指の向かい合う縁に並ぶ小さな突起）
    for grp, base, dd_, L, bend, toward in ((f"cheliped_{side}_propodus", base_fixed, d_f, 2.1, 0.25, +1),
                                            (name, hinge, d_d, CHEL["L"][5], 0.35, -1)):
        d0, n0, h0 = frame_from(dd_)
        for k in range(9):
            t = 0.12 + 0.62 * k / 8
            r_here = 0.30 * (1 - t) + 0.03 * t
            C = base + d0 * (L * t) - h0 * bend * t * t + h0 * (toward * r_here * 0.8)
            tooth_dir = h0 * toward + d0 * 0.35
            tube(C, tooth_dir, 0.12 + 0.05 * (k % 2), (0.05, 0.005, 0.05, 0.005), grp, "cheliped_fixed", sg,
                 nl=3, nc=4, tip=True, ext0=0.0)


def build_eye(sg):
    """長い眼柄が甲の前縁中央付近からほぼ垂直に立ち、先端に角膜（眼）がある"""
    side = "R" if sg > 0 else "L"
    s = 0.86
    W, T, D, yc, z = carapace_profile(s)
    base = np.array([1.25, yc + H_CENTER + T * 0.45, z - 0.2])
    d = chain_dirs([80.0], [80.0])[0]                   # ほぼ真上、わずかに前・外へ
    L = 4.2
    name = f"eye_{side}"
    tip = tube(base, d, L, (0.52, 0.48, 0.56, 0.52), name, "eyestalk", sg, nl=14, nc=14, ext0=0.4, ext1=0.1)
    # 角膜: 眼柄先端をやや太く包む縦長の楕円体（前・外側を向く）
    dd, n, h = frame_from(d)
    C = tip - dd * 0.35 + np.array([0.05, 0.0, 0.08])
    rot = np.stack([n, dd, h], axis=1)
    ellipsoid(C, 0.58, 0.75, 0.60, name, "cornea", sg, nu=16, nv=12, mat=1, rot=rot)
    BONES.append((name, mirror_x(base, sg), mirror_x(base + d * L, sg), "carapace"))


def build_mouthparts():
    """第3顎脚: 前面で口器を覆う大きな板（左右 2 枚、ほぼ垂直）"""
    for sg in (1, -1):
        W, T, D, yc, z = carapace_profile(0.9)
        C = np.array([0.98, yc + H_CENTER - 0.55, z + 0.30])
        tilt = math.radians(12)
        rot = np.array([[1, 0, 0], [0, math.cos(tilt), -math.sin(tilt)], [0, math.sin(tilt), math.cos(tilt)]])
        ellipsoid(C, 0.85, 1.2, 0.40, "carapace", "mxp", sg, nu=24, nv=16, rot=rot)


def build_abdomen():
    """腹節: 腹面中央の細長い板（雄は幅が狭い）"""
    W, T, D, yc, z = carapace_profile(-0.1)
    C = np.array([0.0, yc + H_CENTER - D * 0.93, -0.3])
    ellipsoid(C, 1.05, 0.22, 2.6, "carapace", "abd", 1, nu=20, nv=8)


def add_setae(P0, d, L, rh, grp, sg, count, length, seed):
    """脚の縁の剛毛（写真で目立つ長い毛）。細い三角錐として実ジオメトリ化"""
    rng = np.random.default_rng(seed)
    d, n, h = frame_from(d)
    for i in range(count):
        t = 0.15 + 0.75 * (i + rng.random() * 0.6) / count
        side_h = -1.0 if i % 2 else 1.0                  # 背縁・腹縁の両方
        base = P0 + d * (L * t) + h * (rh * 0.85 * side_h) + n * (rng.random() - 0.5) * 0.2
        hd = h * side_h * 0.8 + d * 0.55 + n * (rng.random() - 0.5) * 0.5
        tube(base, hd, length * (0.7 + 0.6 * rng.random()), (0.035, 0.004, 0.035, 0.004), grp, "seta", sg,
             nl=3, nc=3, tip=True, ext0=0.0)


# ------------------------------------------------------------------ 組み立て
build_carapace()
build_mouthparts()
build_abdomen()
GROUND = 0.0
for leg, p in LEGS.items():
    for sg in (1, -1):
        build_leg(leg, p, sg, GROUND + 0.2)             # 指節の丸み分だけ上で解いて最後に接地
for sg in (1, -1):
    build_cheliped(sg)
    build_eye(sg)

V = np.array(ACC.V)
min_y = V[:, 1].min()
V[:, 1] -= min_y                                         # 最下点(脚先) = Y 0
BONES = [(n, h - np.array([0, min_y, 0]), t - np.array([0, min_y, 0]), p) for n, h, t, p in BONES]
H_BODY = H_CENTER - min_y


def to_blender(p):
    """Y-up(mm) → Blender Z-up(m)。glTF 出力時に (x, y, z) へ戻る（前=+Z）"""
    return Vector((p[0] * MM, -p[2] * MM, p[1] * MM))


# ------------------------------------------------------------------ Blender シーン構築
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

mesh = bpy.data.meshes.new("Scopimera_globosa_LOD0")
mesh.from_pydata([to_blender(p) for p in V], [], ACC.F)
mesh.update()
uvl = mesh.uv_layers.new(name="UVMap")
li = 0
for poly, fuv in zip(mesh.polygons, ACC.FUV):
    for j, loop_index in enumerate(poly.loop_indices):
        uvl.data[loop_index].uv = fuv[j]
for poly, m in zip(mesh.polygons, ACC.FM):
    poly.material_index = m
    poly.use_smooth = True

bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(mesh)
bm.free()
mesh.update()

obj = bpy.data.objects.new("scopimera", mesh)
scene.collection.objects.link(obj)

groups = {}
for vi, g in enumerate(ACC.G):
    groups.setdefault(g, []).append(vi)
for g, idx in groups.items():
    vg = obj.vertex_groups.new(name=g)
    vg.add(idx, 1.0, 'REPLACE')

# ------------------------------------------------------------------ テクスチャ（手続き生成）
def noise_at(px, py, seed):
    """任意座標での値ノイズ（ワールド座標 mm でサンプルし、UV の伸びを避ける）"""
    ix, iy = np.floor(px), np.floor(py)
    fx, fy = px - ix, py - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)

    def h(x, y):
        v = np.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
        return v - np.floor(v)
    return ((h(ix, iy) * (1 - fx) + h(ix + 1, iy) * fx) * (1 - fy)
            + (h(ix, iy + 1) * (1 - fx) + h(ix + 1, iy + 1) * fx) * fy)


def fbm_at(px, py, freq, octaves, seed):
    out, amp, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        out = out + amp * noise_at(px * freq * 2 ** o, py * freq * 2 ** o, seed + o)
        tot += amp
        amp *= 0.5
    return out / tot


def value_noise(res, cells, seed):
    rng = np.random.default_rng(seed)
    g = rng.random((cells + 1, cells + 1))
    x = np.linspace(0, cells, res, endpoint=False)
    xi = np.floor(x).astype(int)
    xf = x - xi
    xf = xf * xf * (3 - 2 * xf)
    a = g[xi][:, xi] * (1 - xf)[None, :] + g[xi][:, xi + 1] * xf[None, :]
    b = g[xi + 1][:, xi] * (1 - xf)[None, :] + g[xi + 1][:, xi + 1] * xf[None, :]
    return a * (1 - xf)[:, None] + b * xf[:, None]


def fbm(res, base_cells, octaves, seed):
    out = np.zeros((res, res))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        out += amp * value_noise(res, base_cells * 2 ** o, seed + o)
        tot += amp
        amp *= 0.5
    return out / tot


N_MACRO = fbm(TEX, 6, 4, 11)          # 大きな色ムラ（控えめ）
N_FINE = fbm(TEX, 96, 3, 23)          # 微細な顆粒
N_GRAIN = value_noise(TEX, 512, 31)    # 極微細
N_MID = fbm(TEX, 64, 3, 41)           # まだら模様

col = np.zeros((TEX, TEX, 3))
col[:] = (0.80, 0.80, 0.80)
rough = np.full((TEX, TEX), 0.55)
height = np.zeros((TEX, TEX))

BASE = np.array([0.46, 0.44, 0.35])           # 灰オリーブ（砂色の迷彩）
DARK = np.array([0.18, 0.19, 0.17])           # 暗色斑
LIGHT = np.array([0.88, 0.87, 0.78])
LILAC = np.array([0.58, 0.47, 0.76])          # 腹面の胸板: 薄紫
PALM = np.array([0.86, 0.85, 0.93])           # 鋏: つやのある淡いラベンダー白          # 明色の小斑
BELLY = np.array([0.93, 0.92, 0.88])
TIP = np.array([0.93, 0.80, 0.80])            # 鋏の指先: 白〜淡いピンク
DTIP = np.array([0.55, 0.45, 0.32])           # 歩脚指節先端: 飴色

for key, (u0, v0, uw, vh, info) in ATLAS.rects.items():
    pad = 4
    x0 = max(int(u0 * TEX) - pad, 0)
    x1 = min(int((u0 + uw) * TEX) + pad, TEX)
    y0 = max(int(v0 * TEX) - pad, 0)
    y1 = min(int((v0 + vh) * TEX) + pad, TEX)
    xs = (np.arange(x0, x1) + 0.5) / TEX
    ys = (np.arange(y0, y1) + 0.5) / TEX
    lu = np.clip((xs - u0) / uw, 0, 1)[None, :]
    lv = np.clip((ys - v0) / vh, 0, 1)[:, None]
    mac = N_MACRO[y0:y1, x0:x1]
    fin = N_FINE[y0:y1, x0:x1]
    grn = N_GRAIN[y0:y1, x0:x1]
    kind = info["kind"]
    mid = N_MID[y0:y1, x0:x1]
    if kind == "carapace":
        a = 2 * np.pi * lu - np.pi / 2                  # 周方向
        s = lv * 2 - 1                                  # 前後
        top = np.sin(a) * np.ones_like(s)
        wt = smooth(-0.35, 0.35, top)
        wu = smooth(-0.15, -0.6, top)
        # 甲羅表面の実座標（mm）で模様を生成: 上面は (x, z)、側面は高さも混ぜる
        W, T, D, yc, zz = carapace_profile(s)
        wx = W * np.sign(np.cos(a)) * np.abs(np.cos(a)) ** (2 / 2.7)
        wy = np.where(top > 0, T * np.abs(top) ** (2 / 2.4), -D * np.abs(top) ** (2 / 3.6))
        # 三平面投影: 上面は (x, z)、側面は (y, z) で標本化し、面の向きで混ぜる
        sw = smooth(0.35, 0.85, np.abs(np.cos(a))) * np.ones_like(s)
        fw = smooth(0.70, 0.95, np.abs(s)) * np.ones_like(sw)       # 前面・後面
        def tri(fn):
            return (fn(wx, zz) * (1 - sw) + fn(wy + 11.0, zz) * sw) * (1 - fw) + fn(wx, wy + 23.0) * fw
        mott = smooth(0.55, 0.64, tri(lambda u_, v_: fbm_at(u_, v_, 0.9, 3, 5))) * 0.65          # 暗色の網目状まだら
        spot = (smooth(0.62, 0.70, tri(lambda u_, v_: fbm_at(u_, v_, 7.0, 2, 9))) * 0.9
                + smooth(0.66, 0.72, tri(lambda u_, v_: noise_at(u_ * 16, v_ * 16, 3))) * 0.8)   # 明色の細かな顆粒斑
        c = BASE * (1 - mott[..., None] * 0.75) + DARK * mott[..., None] * 0.75
        c = c * (1 - spot[..., None] * 0.6) + LIGHT * spot[..., None] * 0.6
        c = c * wt[..., None] + BASE * 1.08 * (1 - wt[..., None])
        lil = wu * smooth(0.95, 0.6, np.abs(np.cos(a))) * smooth(0.04, 0.16, np.abs(np.cos(a))) * (0.85 + 0.15 * mac)   # 胸板の紫斑、縁は白
        c = c * (1 - wu[..., None]) + BELLY * wu[..., None]
        c = c * (1 - lil[..., None]) + LILAC * lil[..., None]
        c = c * (0.92 + 0.14 * mac[..., None])
        col[y0:y1, x0:x1] = np.clip(c, 0, 1)
        rough[y0:y1, x0:x1] = 0.36 + 0.10 * fin + 0.06 * wu
        height[y0:y1, x0:x1] = 0.6 * spot + 0.25 * mott
    elif kind == "seg":
        sg = info["seg"]
        chel = info["leg"] == "cheliped"
        ones = np.ones_like(lu * lv)
        c = BASE * 1.08 * ones[..., None]
        # 横縞（暗色の帯）。節ごとに本数を変える
        nb = {"merus": 2, "carpus": 1, "propodus": 2, "dactylus": 1, "basis": 1, "coxa": 1}.get(sg, 1)
        band = np.zeros_like(ones)
        for b in range(nb):
            cpos = (b + 0.55) / (nb + 0.2)
            wdt = (0.09 / nb ** 0.5) * (0.8 + 0.4 * noise_at(lv * 6, np.full_like(lv, b * 3.1 + nb), 17))
            band = np.maximum(band, smooth(1.0, 0.55, np.abs(lu - cpos) / wdt) * ones)
        band = np.clip(band * (0.75 + 0.25 * mid), 0, 1)
        if chel:
            band = band * 0.35
        # 長節の鼓膜状の窓（暗い楕円）
        if sg == "merus":
            tymp = np.exp(-(((lu - 0.5) / 0.28) ** 2 + ((lv - 0.25) / 0.12) ** 2))
            band = np.maximum(band, tymp * 0.8)
        c = c * (1 - band[..., None] * 0.7) + DARK * band[..., None] * 0.7
        spot = smooth(0.80, 0.86, fin)
        c = c * (1 - spot[..., None] * 0.4) + LIGHT * spot[..., None] * 0.4
        if chel and sg in ("propodus", "fixed", "dactylus", "carpus"):
            # 鋏: つやのある淡いラベンダー白。掌部の外面上部にだけ薄い斑
            # 掌部の平たい面（外面・内面）に灰褐色のまだらと明点、上縁は暗く、下縁は明るい
            face = np.abs(np.cos(lv * 2 * np.pi)) * np.ones_like(lu)
            mot = face * smooth(0.45, 0.6, fbm_at(lu * uw * 40, lv * vh * 40, 1.0, 3, 21)) * (0.22 if sg == "propodus" else 0.12)
            up = smooth(0.12, 0.0, np.abs(lv - 0.25)) * 0.5 * np.ones_like(lu)
            c = PALM * (1 - mot[..., None]) + BASE * mot[..., None]
            c = c * (1 - up[..., None]) + DARK * up[..., None]
            dots = smooth(0.70, 0.76, noise_at(lu * uw * 400, lv * vh * 400, 4)) * face * 0.6
            c = c * (1 - dots[..., None]) + PALM * dots[..., None]
            c = c * (0.96 + 0.06 * mac[..., None])
        if sg in ("dactylus", "fixed"):
            tipw = smooth(0.45, 0.9, lu) * ones
            tc = TIP if chel or sg == "fixed" else DTIP
            c = c * (1 - tipw[..., None]) + tc * tipw[..., None]
        memb = (smooth(0.06, 0.0, lu) + smooth(0.94, 1.0, lu)) * np.ones_like(lv) * (0.0 if sg == "dactylus" else 0.5)
        c = c * (1 - memb[..., None]) + np.array([0.62, 0.58, 0.55]) * memb[..., None]   # 関節膜
        c = c * (0.94 + 0.10 * mac[..., None])
        col[y0:y1, x0:x1] = np.clip(c, 0, 1)
        rough[y0:y1, x0:x1] = (0.30 if chel else 0.48) + 0.08 * fin - (0.15 * smooth(0.6, 1.0, lu) if sg in ("dactylus", "fixed") else 0)
        # 法線用の高さ場は縦横比を補正した局所座標で生成（UV の伸びによる筋を防ぐ）
        height[y0:y1, x0:x1] = 0.5 * fbm_at(lu * uw * 300, lv * vh * 300, 1.0, 2, 13) + 0.3 * noise_at(lu * uw * 900, lv * vh * 900, 19)
        if chel and sg in ("propodus", "carpus", "fixed", "dactylus"):
            height[y0:y1, x0:x1] *= 0.15                   # 鋏はなめらかでつやがある
    elif kind == "eyestalk":
        # 眼柄: 明るい灰色、付け根側に暗い帯
        dk = np.exp(-((lu - 0.45) / 0.12) ** 2) * np.ones_like(lv) * 0.5
        c = np.array([0.80, 0.80, 0.74]) * (1 - dk[..., None]) + DARK * dk[..., None]
        col[y0:y1, x0:x1] = c * (0.96 + 0.06 * mac[..., None])
        rough[y0:y1, x0:x1] = 0.5
        height[y0:y1, x0:x1] = 0.3 * fin
    elif kind == "cornea":
        col[y0:y1, x0:x1] = (0.10, 0.09, 0.08)
        rough[y0:y1, x0:x1] = 0.2
    elif kind == "abd":
        c = np.array([0.80, 0.82, 0.84]) * np.ones_like(lu * lv)[..., None]
        seg_line = np.exp(-((np.mod(lu * 5, 1) - 0.5) / 0.05) ** 2) * 0.25
        c = c * (1 - seg_line[..., None]) + (fin[..., None] - 0.5) * 0.08
        col[y0:y1, x0:x1] = np.clip(c, 0, 1)
        rough[y0:y1, x0:x1] = 0.35
        height[y0:y1, x0:x1] = 0.3 * fin - 1.5 * seg_line
    elif kind == "seta":
        col[y0:y1, x0:x1] = (0.20, 0.19, 0.16)
        rough[y0:y1, x0:x1] = 0.6
    elif kind == "mxp":
        # 第3顎脚: 白い板に、上半分の暗色斑と点刻
        up = smooth(0.58, 0.74, lv) * np.ones_like(lu)
        dots = smooth(0.70, 0.78, fin)
        c = np.array([0.84, 0.84, 0.82]) * (1 - up[..., None] * 0.7) + DARK * up[..., None] * 0.7
        c = c * (1 - dots[..., None] * 0.5 * up[..., None]) + BELLY * dots[..., None] * 0.5 * up[..., None]
        col[y0:y1, x0:x1] = c * (0.95 + 0.08 * mac[..., None])
        rough[y0:y1, x0:x1] = 0.5
        height[y0:y1, x0:x1] = 0.0

# 高さ場 → 接空間ノーマル（OpenGL/glTF 規約: +Y = +V）
gy, gx = np.gradient(height)
strength = 3.0
nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(height)
ln = np.sqrt(nx * nx + ny * ny + nz * nz)
normal = np.stack([nx / ln, ny / ln, nz / ln], axis=-1) * 0.5 + 0.5


def make_image(name, rgb, colorspace):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False)
    img.colorspace_settings.name = colorspace
    px = np.ones((TEX, TEX, 4), dtype=np.float32)
    px[..., :3] = rgb
    img.pixels.foreach_set(px.ravel())
    img.file_format = 'PNG'
    img.pack()
    return img


img_col = make_image("Scopimera_baseColor", col, 'sRGB')
mr = np.stack([np.ones_like(rough), np.clip(rough, 0.05, 1.0), np.zeros_like(rough)], axis=-1)  # R=AO(1), G=roughness, B=metallic(0)
img_mr = make_image("Scopimera_metallicRoughness", mr, 'Non-Color')
img_nrm = make_image("Scopimera_normal", normal, 'Non-Color')

# ------------------------------------------------------------------ マテリアル
def body_material():
    m = bpy.data.materials.new("Scopimera_Body")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    t_col = nt.nodes.new("ShaderNodeTexImage"); t_col.image = img_col
    t_mr = nt.nodes.new("ShaderNodeTexImage"); t_mr.image = img_mr
    t_n = nt.nodes.new("ShaderNodeTexImage"); t_n.image = img_nrm
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.inputs["Strength"].default_value = 1.0
    nt.links.new(t_col.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(t_mr.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nt.links.new(t_n.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m


def eye_material():
    m = bpy.data.materials.new("Scopimera_Eye")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.10, 0.085, 0.075, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.18
    bsdf.inputs["Metallic"].default_value = 0.0
    return m


mesh.materials.append(body_material())
mesh.materials.append(eye_material())

# ------------------------------------------------------------------ アーマチュア
arm_data = bpy.data.armatures.new("Scopimera_Rig")
arm = bpy.data.objects.new("Scopimera_Rig", arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
root = eb.new("root")
root.head = to_blender(np.array([0, 0, 0]))
root.tail = to_blender(np.array([0, 0, -3.0]))
car = eb.new("carapace")
car.head = to_blender(np.array([0, H_BODY, -1.0]))
car.tail = to_blender(np.array([0, H_BODY, 4.0]))
car.parent = root
for name, h, t, parent in BONES:
    b = eb.new(name)
    b.head = to_blender(h)
    b.tail = to_blender(t)
    b.parent = eb[parent]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

obj.parent = arm
mod = obj.modifiers.new("Armature", 'ARMATURE')
mod.object = arm

# ------------------------------------------------------------------ 集計と書き出し
tri = sum(len(p.vertices) - 2 for p in mesh.polygons)
print(f"triangles={tri} vertices={len(mesh.vertices)} bones={len(arm_data.bones)} "
      f"body_height={H_BODY:.2f}mm span_x={(V[:,0].max()-V[:,0].min()):.1f}mm")

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_tangents=True,
    export_materials='EXPORT',
    export_image_format='JPEG',
    export_jpeg_quality=90,
    export_skins=True,
    export_all_influences=False,
    export_animations=False,
    export_apply=False,
)
print("wrote", OUT)
