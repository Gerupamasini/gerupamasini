# -*- coding: utf-8 -*-
"""
Mictyris brevidactylus（ミナミコメツキガニ）LOD0 を Blender 上で自動生成し GLB へ書き出す。

使い方:
  blender -b -P build_mictyris.py -- out.glb
  または  python3 build_mictyris.py out.glb   （pip の bpy モジュール使用時）

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
OUT = argv[0] if argv else "mictyris_brevidactylus_LOD0.glb"
MM = 0.001          # mm → m
TEX = 2048          # テクスチャアトラス解像度
RNG = np.random.default_rng(7)

# ------------------------------------------------------------------ 形態パラメータ（mm）
CL = 15.0           # 甲長（前後）
CW_HALF = 6.5       # 甲幅の半分（甲幅 13.0 mm）
DOME_T = 6.4        # 甲の中心線から背面頂部までの高さ（強く膨らむ球状の甲）
DOME_D = 3.4        # 中心線から腹面までの深さ（腹面は平たい）
H_CENTER = 10.0     # 仮の甲中心高さ（脚先接地ソルバで最終的に全体を持ち上げ/下げ）

# 歩脚: [coxa, basis, merus, carpus, propodus, dactylus] の長さ（mm）
#       歩脚は細長く、長節は側扁、指節は細長い槍状。第2・第3歩脚が最長。
LEGS = {
    "leg1": dict(z=2.6, yaw=38.0, L=[1.3, 1.0, 6.6, 3.0, 3.7, 4.2]),
    "leg2": dict(z=0.4, yaw=12.0, L=[1.3, 1.0, 7.6, 3.3, 4.2, 4.6]),
    "leg3": dict(z=-1.9, yaw=-14.0, L=[1.3, 1.0, 7.6, 3.3, 4.2, 4.6]),
    "leg4": dict(z=-4.0, yaw=-42.0, L=[1.2, 0.9, 6.2, 2.8, 3.6, 4.0]),
}
# 断面半径（幅=脚平面の法線方向, 高さ=脚平面内）: 付け根→先端
SEG_R = {
    "coxa":     (0.80, 0.72, 0.90, 0.80),
    "basis":    (0.58, 0.52, 0.70, 0.64),
    "merus":    (0.34, 0.28, 0.78, 0.58),   # 長節: 側扁して幅広
    "carpus":   (0.33, 0.29, 0.50, 0.42),
    "propodus": (0.29, 0.24, 0.42, 0.34),
    "dactylus": (0.24, 0.03, 0.32, 0.04),   # 指節: 尖る
}
SEGS = ["coxa", "basis", "merus", "carpus", "propodus", "dactylus"]
# 基本姿勢（水平からの仰角, 度）。carpus 以降はソルバで接地まで曲げを追加。
PITCH = [-30.0, -8.0, 20.0, -14.0, -58.0, -78.0]

# 鋏脚: 控えめで細長く、指は下向きに湾曲した二叉のフォーク状（左右同大）
CHEL = dict(z=5.2,
            L=[1.0, 0.8, 4.4, 1.9, 3.0, 2.7],       # coxa, basis, merus, carpus, propodus(掌部), dactylus
            yaw=[55.0, 70.0, 86.0, 122.0, 100.0, 96.0],   # 長節は前方へ、腕節で内側へ折れ、掌部は前下方
            pitch=[-45.0, -35.0, -6.0, -32.0, -74.0, -84.0])
CHEL_R = {
    "coxa": (0.80, 0.70, 0.90, 0.80),
    "basis": (0.62, 0.56, 0.72, 0.66),
    "merus": (0.48, 0.44, 0.78, 0.66),
    "carpus": (0.50, 0.46, 0.62, 0.58),
    "propodus": (0.55, 0.45, 0.80, 0.60),   # 掌部: 細長い
    "fixed": (0.30, 0.03, 0.34, 0.04),      # 不動指
    "dactylus": (0.28, 0.03, 0.34, 0.04),   # 可動指
}


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ 甲羅プロファイル
def carapace_profile(s):
    """s: 前後位置 [-1(後縁), +1(前縁)]。返値: 半幅W, 背高T, 腹深D, 中心y補正, 前後z"""
    s = np.asarray(s, dtype=float)
    s0 = -0.10                                        # 最大幅は中央よりやや後方
    q = np.where(s > s0, (s - s0) / (1 - s0), (s - s0) / (1 + s0))
    base = np.clip(1 - q * q, 0, 1)
    W = CW_HALF * base ** np.where(s > s0, 0.36, 0.50)   # 後縁は丸く回り込む
    W = W * (1 - 0.40 * smooth(0.25, 1.0, s))          # 前方へ強く絞る（額域は狭い）
    W = W * (1 - 0.06 * smooth(-0.3, -1.0, s))         # 後縁はやや丸く狭まる
    T = DOME_T * np.clip(1 - ((s + 0.04) / 1.04) ** 2, 0, 1) ** np.where(s > -0.04, 0.46, 0.62)   # ドームの頂点はやや後方
    D = DOME_D * np.clip(1 - s ** 2, 0, 1) ** 0.30
    yc = -1.5 * smooth(0.50, 1.0, s) + 0.3 * smooth(-0.4, -1.0, s)     # 前縁は下方へ落ち込む
    z = s * CL / 2
    return W, T, D, yc, z


def carapace_point(s, a):
    """a: 断面角（-pi/2 = 腹面中央, 0 = 右側面, pi/2 = 背面中央）"""
    W, T, D, yc, z = carapace_profile(s)
    c, sn = math.cos(a), math.sin(a)
    px = 2 / 2.3                                      # 側面をやや角張らせる超楕円
    x = W * math.copysign(abs(c) ** px, c)
    if sn >= 0:
        y = yc + T * abs(sn) ** (2 / 2.2)
    else:
        y = yc - D * abs(sn) ** (2 / 3.4)             # 腹面は平たい
    # 背面中央の浅い U 字溝（胃域と心域の境）
    if sn > 0.2:
        r = math.sqrt((x / 2.3) ** 2 + (min(0.0, z - 2.2) / 3.6) ** 2)
        y -= 0.22 * math.exp(-((r - 1.0) / 0.10) ** 2) * smooth(3.8, 2.4, z) * smooth(0.2, 0.6, sn)
        # 側方の鰓域のわずかな膨らみ
        y += 0.25 * math.exp(-((abs(x) - 4.2) / 1.2) ** 2) * math.exp(-((z + 1.0) / 3.5) ** 2) * sn
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
layout_row("misc", [("eyestalk", 2.5, dict(kind="eyestalk")),
                    ("cornea", 1.5, dict(kind="cornea")),
                    ("mxp", 3.0, dict(kind="mxp")),
                    ("spare", 3.0, dict(kind="spare"))])


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
         cap0=0.75, cap1=0.75, ext0=0.22, ext1=0.22, mat=0, sq=2.3, h_override=None):
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
        bend = {"dactylus": 0.55, "propodus": 0.10, "merus": -0.20}.get(sgm, 0.0)
        tube(P, dirs[i], L, SEG_R[sgm], name, f"{leg}_{sgm}", sg, nl=nl, nc=14, bend=bend, tip=tip,
             sq=2.6 if sgm == "merus" else 2.3)
        BONES.append((name, mirror_x(P, sg), mirror_x(P + dirs[i] * L, sg), parent))
        parent = name
        P = P + dirs[i] * L


def build_cheliped(sg):
    side = "R" if sg > 0 else "L"
    P0 = side_attach(CHEL["z"], lower=0.55)
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
    base_fixed = P - h_palm * 0.34 - d_palm * 0.25
    tube(base_fixed, d_f, 3.0, CHEL_R["fixed"], f"cheliped_{side}_propodus", "cheliped_fixed", sg,
         nl=16, nc=12, bend=0.45, tip=True, ext0=0.6)
    # 可動指（掌部の背側先端に関節）
    hinge = P + h_palm * 0.30 - d_palm * 0.15
    d_d = chain_dirs([CHEL["yaw"][5]], [CHEL["pitch"][5] - 6.0])[0]
    name = f"cheliped_{side}_dactylus"
    tube(hinge, d_d, CHEL["L"][5], CHEL_R["dactylus"], name, "cheliped_dactylus", sg,
         nl=16, nc=12, bend=0.55, tip=True, ext0=0.6)
    BONES.append((name, mirror_x(hinge, sg), mirror_x(hinge + d_d * CHEL["L"][5], sg), f"cheliped_{side}_propodus"))


def build_eye(sg):
    side = "R" if sg > 0 else "L"
    s = 0.93
    W, T, D, yc, z = carapace_profile(s)
    base = np.array([1.75, yc + H_CENTER + 1.1, z - 0.6])
    d = chain_dirs([62.0], [34.0])[0]                   # 前方やや外向き・上向き
    L = 2.3
    name = f"eye_{side}"
    tip = tube(base, d, L, (0.34, 0.30, 0.36, 0.32), name, "eyestalk", sg, nl=10, nc=12, ext0=0.5, ext1=0.1)
    # 角膜（眼柄先端をやや太く包む。黒い球を貼るのではなく柄の先端に被せた形）
    dd, n, h = frame_from(d)
    C = tip - dd * 0.15
    rot = np.stack([n, dd, h], axis=1)                  # 楕円体の y 軸を柄の向きへ
    ellipsoid(C, 0.44, 0.52, 0.44, name, "cornea", sg, nu=16, nv=10, mat=1, rot=rot)
    BONES.append((name, mirror_x(base, sg), mirror_x(base + d * L, sg), "carapace"))


def build_mouthparts():
    """第3顎脚: 口器を覆う大きな半円形の板（前方下面）"""
    for sg in (1, -1):
        W, T, D, yc, z = carapace_profile(0.78)
        C = np.array([1.05, yc + H_CENTER - D * 0.75, z - 0.2])
        tilt = math.radians(-35)
        rot = np.array([[1, 0, 0], [0, math.cos(tilt), -math.sin(tilt)], [0, math.sin(tilt), math.cos(tilt)]])
        ellipsoid(C, 1.05, 0.35, 1.9, "carapace", "mxp", sg, nu=18, nv=8, rot=rot)


# ------------------------------------------------------------------ 組み立て
build_carapace()
build_mouthparts()
GROUND = 0.0
for leg, p in LEGS.items():
    for sg in (1, -1):
        build_leg(leg, p, sg, GROUND + 0.35)             # 指節の丸み分だけ上で解いて最後に接地
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

mesh = bpy.data.meshes.new("Mictyris_brevidactylus_LOD0")
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

obj = bpy.data.objects.new("mictyris", mesh)
scene.collection.objects.link(obj)

groups = {}
for vi, g in enumerate(ACC.G):
    groups.setdefault(g, []).append(vi)
for g, idx in groups.items():
    vg = obj.vertex_groups.new(name=g)
    vg.add(idx, 1.0, 'REPLACE')

# ------------------------------------------------------------------ テクスチャ（手続き生成）
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

col = np.zeros((TEX, TEX, 3))
col[:] = (0.80, 0.80, 0.80)
rough = np.full((TEX, TEX), 0.55)
height = np.zeros((TEX, TEX))

BLUE_TOP = np.array([0.50, 0.62, 0.86])       # 甲の背面: 明るい青紫〜空色
BLUE_SIDE = np.array([0.66, 0.74, 0.92])
BELLY = np.array([0.93, 0.92, 0.90])
LEG = np.array([0.95, 0.93, 0.92])            # 歩脚: 白っぽい半透明感
JOINT = np.array([0.66, 0.36, 0.50])          # 関節部: 赤紫
TIP = np.array([0.70, 0.52, 0.34])            # 指節先端: 飴色

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
    if kind == "carapace":
        a = 2 * np.pi * lu - np.pi / 2                  # 周方向
        s = lv * 2 - 1                                  # 前後
        top = np.sin(a) * np.ones_like(s)
        W, T, D, yc, z = carapace_profile(s)
        x = W * np.cos(a)
        wt = smooth(-0.15, 0.75, top)
        wu = smooth(-0.05, -0.55, top)
        c = BLUE_SIDE[None, None, :] * (1 - wt[..., None]) + BLUE_TOP[None, None, :] * wt[..., None]
        c = c * (1 - wu[..., None]) + BELLY[None, None, :] * wu[..., None]
        # U 字溝と鰓域の境は少し濃い
        r = np.sqrt((x / 2.3) ** 2 + (np.minimum(0, z - 2.2) / 3.6) ** 2)
        groove = np.exp(-((r - 1.0) / 0.12) ** 2) * smooth(3.8, 2.4, z) * wt
        c = c * (1 - 0.18 * groove[..., None])
        # 前縁・後縁はやや白っぽい
        rim = smooth(0.80, 0.98, np.abs(s)) * wt
        c = c * (1 - 0.35 * rim[..., None]) + np.array([0.86, 0.86, 0.94]) * 0.35 * rim[..., None]
        c = c * (0.93 + 0.12 * mac[..., None]) + (fin[..., None] - 0.5) * 0.05
        col[y0:y1, x0:x1] = np.clip(c, 0, 1)
        rough[y0:y1, x0:x1] = 0.42 + 0.10 * fin - 0.06 * wt + 0.08 * wu
        height[y0:y1, x0:x1] = 0.25 * fin + 0.45 * grn - 1.2 * groove
    elif kind == "seg":
        sg = info["seg"]
        c = LEG[None, None, :] * np.ones_like(lu)[..., None] * np.ones_like(lv)[..., None]
        band = np.zeros_like(lu * lv)
        if sg in ("merus", "carpus", "propodus", "basis"):
            band = np.exp(-((lu - 0.08) / 0.06) ** 2) * 0.35 + np.exp(-((lu - 0.92) / 0.06) ** 2) * 0.65
            band = band * np.ones_like(lv)
        if sg == "merus":
            # 長節の背縁（周方向 0.25 付近）に淡い赤紫の筋
            band = band + 0.25 * np.exp(-((lv - 0.25) / 0.10) ** 2) * smooth(0.1, 0.4, lu)
        c = c * (1 - band[..., None]) + JOINT * band[..., None]
        if sg in ("dactylus", "fixed"):
            tipw = smooth(0.55, 0.95, lu) * np.ones_like(lv)
            c = c * (1 - tipw[..., None]) + TIP * tipw[..., None]
        c = c * (0.95 + 0.08 * mac[..., None]) + (fin[..., None] - 0.5) * 0.04
        col[y0:y1, x0:x1] = np.clip(c, 0, 1)
        rough[y0:y1, x0:x1] = 0.52 + 0.08 * fin - (0.12 * smooth(0.6, 1.0, lu) if sg in ("dactylus", "fixed") else 0)
        height[y0:y1, x0:x1] = 0.5 * fin + 0.4 * grn
    elif kind == "eyestalk":
        c = np.array([0.80, 0.84, 0.93]) * np.ones_like(lu * lv)[..., None]
        col[y0:y1, x0:x1] = c * (0.96 + 0.06 * mac[..., None])
        rough[y0:y1, x0:x1] = 0.5
        height[y0:y1, x0:x1] = 0.3 * fin
    elif kind == "cornea":
        col[y0:y1, x0:x1] = (0.10, 0.09, 0.08)
        rough[y0:y1, x0:x1] = 0.2
    elif kind == "mxp":
        c = np.array([0.90, 0.90, 0.95]) * np.ones_like(lu * lv)[..., None]
        col[y0:y1, x0:x1] = c * (0.95 + 0.08 * mac[..., None])
        rough[y0:y1, x0:x1] = 0.5
        height[y0:y1, x0:x1] = 0.6 * fin

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


img_col = make_image("Mictyris_baseColor", col, 'sRGB')
mr = np.stack([np.ones_like(rough), np.clip(rough, 0.05, 1.0), np.zeros_like(rough)], axis=-1)  # R=AO(1), G=roughness, B=metallic(0)
img_mr = make_image("Mictyris_metallicRoughness", mr, 'Non-Color')
img_nrm = make_image("Mictyris_normal", normal, 'Non-Color')

# ------------------------------------------------------------------ マテリアル
def body_material():
    m = bpy.data.materials.new("Mictyris_Body")
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
    m = bpy.data.materials.new("Mictyris_Eye")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.012, 0.011, 0.010, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.18
    bsdf.inputs["Metallic"].default_value = 0.0
    return m


mesh.materials.append(body_material())
mesh.materials.append(eye_material())

# ------------------------------------------------------------------ アーマチュア
arm_data = bpy.data.armatures.new("Mictyris_Rig")
arm = bpy.data.objects.new("Mictyris_Rig", arm_data)
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
