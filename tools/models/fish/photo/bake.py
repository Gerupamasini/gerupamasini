# The coastal fishes' photographic skin: a CC0 specimen's lateral image (align.py) laid onto the model's body texture,
# fin atlas and eye, through a thin-plate spline from the model's side view to the specimen's (their outlines where
# no fin hides the body, the eye, the corner of the mouth, the gill cover's edge, the pectoral's base):
#   python3 -I bake.py <species id> <aligned dir> <geom dir> <out dir> [--check <dir>]
# geom.ts writes the model's side view (<geom dir>/<id>.geom.json, .f32); specimens.json names the image and its
# landmarks. → <out dir>/<id>.body.jpg (1024 × 512, the body texture's layout), <id>.fins.jpg (256 × 384, the fin
# atlas), <id>.eye.jpg (128 × 128, the eye's disc). skin.ts lays them over the procedural skin of the near tiers.
import sys, os, json, numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sp, adir, gdir, odir = sys.argv[1:5]
check = sys.argv[sys.argv.index('--check') + 1] if '--check' in sys.argv else None
SPEC = json.load(open(os.path.join(HERE, 'specimens.json')))[sp]
G = json.load(open(os.path.join(gdir, sp + '.geom.json')))
W, H, FW, FH = G['W'], G['H'], G['FW'], G['FH']
raw = np.fromfile(os.path.join(gdir, sp + '.geom.f32'), np.float32)
S = raw[:W]; Y = raw[W:W + W * H].reshape(H, W); F = raw[W + W * H:W + 2 * W * H].reshape(H, W)
FA = raw[W + 2 * W * H:].reshape(6, FH, FW, 2)
meta = json.load(open(os.path.join(adir, SPEC['image'] + '.json')))
img = np.asarray(Image.open(os.path.join(adir, SPEC['image'] + '.png')).convert('RGBA')).astype(np.float32) / 255
L, AX = meta['L'], meta['axis']
rgb, alpha = img[..., :3].copy(), img[..., 3].copy()
PH, PW = alpha.shape
cbM, cbP = G['cb'], SPEC['cb']
k = cbP / cbM                       # specimen TL per model TL (the two scaled to one standard length)

def px(s, y): return s * L, AX - y * L

# ------------------------------------------------------------------------------------------------ outlines
B = len(meta['top'])
sP = (np.arange(B) + 0.5) / B
topP = np.array([np.nan if v is None else v for v in meta['top']]); botP = np.array([np.nan if v is None else v for v in meta['bot']])
mB = len(G['top']) - 1
topM = np.array([np.nan if v is None else v for v in G['top']]); botM = np.array([np.nan if v is None else v for v in G['bot']])
def mtop(s): return np.interp(s, np.arange(mB + 1) / mB, np.nan_to_num(topM, nan=topM[~np.isnan(topM)][-1]))
def mbot(s): return np.interp(s, np.arange(mB + 1) / mB, np.nan_to_num(botM, nan=botM[~np.isnan(botM)][-1]))
def ptop(s): return np.interp(s, sP, topP)
def pbot(s): return np.interp(s, sP, botP)
# the model's outer outline with its fins (a species whose fins are as opaque as its body is matched fin to fin)
outT = np.full(mB + 1, -1.0); outB = np.full(mB + 1, -1.0)
for band in range(4):
    pts = FA[band].reshape(-1, 2)
    pts = pts[~np.isnan(pts[:, 0])]
    for s_, y_ in pts:
        i = int(round(s_ * mB))
        if 0 <= i <= mB:
            if y_ > 0: outT[i] = max(outT[i], y_)
            else: outB[i] = max(outB[i], -y_)
fins = SPEC.get('fins', {})
def excl(s, which):
    pad = 0.012
    if s > cbP - 0.005: return True
    if which == 'top':
        return any(a - pad < s < b + pad for f, (a, b) in fins.items() if f != 'a')
    ra = [fins['a']] if 'a' in fins else []
    if 'pel' in SPEC: ra.append(SPEC['pel'])
    if 'pecPoly' in SPEC:
        pp = np.array(SPEC['pecPoly']);
        if pp[:, 1].min() < -pbot(pp[:, 0].mean()) + 0.01: ra.append([pp[:, 0].min(), pp[:, 0].max()])
    return any(a - pad < s < b + pad for a, b in ra)

# the specimen's body outline under its fins: the outline across each fin's stretch bridged from either side of it
def bridged(arr, which):
    ok = np.array([not excl(x, which) or x > cbP - 0.005 for x in sP]) & ~np.isnan(arr)
    out = np.interp(sP, sP[ok], arr[ok])
    # (where a long fin hides it, the body's edge read off the image: where the scales end and the rays begin)
    bl = SPEC.get('baseTop' if which == 'top' else 'baseBot')
    if bl:
        bl = np.array(bl); on = (sP >= bl[0, 0]) & (sP <= bl[-1, 0])
        out[on] = np.abs(np.interp(sP[on], bl[:, 0], bl[:, 1]))
    return out
topB, botB = bridged(topP, 'top'), bridged(botP, 'bot')
def btop(s): return np.interp(s, sP, topB)
def bbot(s): return np.interp(s, sP, botB)
src, dst = [], []        # model (s, y) → specimen (s, y)
full = SPEC.get('full', False)
for sm in np.arange(0.006, cbM + 1e-6, 0.008):
    spn = sm * k
    for which in ('top', 'bot'):
        sign = 1 if which == 'top' else -1
        hm = mtop(sm) if which == 'top' else mbot(sm)
        hp = ptop(spn) if which == 'top' else pbot(spn)
        if np.isnan(hp): continue
        if full:
            o = outT if which == 'top' else outB
            om = o[int(round(sm * mB))]
            if om > hm + 0.004:
                src.append((sm, sign * om)); dst.append((spn, sign * hp)); continue
        bl = SPEC.get('baseTop' if which == 'top' else 'baseBot')
        if bl and bl[0][0] <= spn <= bl[-1][0]:
            src.append((sm, sign * hm)); dst.append((spn, sign * (btop(spn) if which == 'top' else bbot(spn)))); continue
        if excl(spn, which): continue
        src.append((sm, sign * hm)); dst.append((spn, sign * hp))
src.append((0.0, 0.5 * (mtop(0) - mbot(0)))); dst.append((0.0, 0.0))
# the landmarks
eyes = G['eyes']
peyes = SPEC.get('eyes') or ([SPEC['eye']] if 'eye' in SPEC else [])
for e, pe in zip(eyes, peyes):
    if e.get('across') is not None: continue
    r, rp = e['r'], pe[2]
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        src.append((e['s'] + dx * r, e['y'] + dy * r)); dst.append((pe[0] + dx * rp, pe[1] + dy * rp))
if 'mouth' in SPEC:
    src.append((G['mouth']['corner'], G['mouth']['gapeCorner'])); dst.append(tuple(SPEC['mouth']))
if 'oper' in SPEC:
    src.append((G['oper']['s'], SPEC['oper'][1] / k)); dst.append(tuple(SPEC['oper']))
if 'pec' in SPEC:
    src.append((G['pectoral']['s'], G['pectoral']['y'])); dst.append(tuple(SPEC['pec']))
src, dst = np.array(src, np.float64), np.array(dst, np.float64)

# ------------------------------------------------------------------------------------------------ thin-plate spline
def U(r2): return np.where(r2 > 0, 0.5 * r2 * np.log(np.maximum(r2, 1e-20)), 0.0)
n = len(src)
K = U(((src[:, None, :] - src[None, :, :]) ** 2).sum(-1)) + 1e-6 * np.eye(n)
P = np.hstack([np.ones((n, 1)), src])
A = np.zeros((n + 3, n + 3)); A[:n, :n] = K; A[:n, n:] = P; A[n:, :n] = P.T
sol = np.linalg.solve(A, np.vstack([dst, np.zeros((3, 2))]))
def tps(q):
    q = q.reshape(-1, 2).astype(np.float64)
    out = np.empty_like(q)
    for i in range(0, len(q), 65536):
        c = q[i:i + 65536]
        out[i:i + 65536] = U(((c[:, None, :] - src[None, :, :]) ** 2).sum(-1)) @ sol[:n] + sol[n] + c @ sol[n + 1:]
    return out

# ------------------------------------------------------------------------------------------------ the photo, prepared
rgb0 = rgb.copy()
# the pectoral pressed on the flank: the flank under it filled from the low tones round it and the texture just behind;
# so are the slivers of background the silhouette lets in under a fin
body_m = (alpha > 0.5).astype(np.uint8)
closed = cv2.morphologyEx(body_m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
holes = (closed > 0) & (body_m == 0)
if 'pecPoly' in SPEC or holes.any():
    m = np.zeros((PH, PW), np.uint8)
    if 'pecPoly' in SPEC:
        poly = np.array([px(s, y) for s, y in SPEC['pecPoly']], np.float32)
        cv2.fillPoly(m, [poly.astype(np.int32)], 255)
    else:
        poly = np.array([[0, 0], [0.004 * L, 0]], np.float32)
    m = cv2.dilate(m, np.ones((9, 9), np.uint8)) | (cv2.dilate(holes.astype(np.uint8), np.ones((5, 5), np.uint8)) * 255)
    alpha = np.maximum(alpha, closed.astype(np.float32))
    sm_ = 4
    small = cv2.resize((rgb * 255).astype(np.uint8), (PW // sm_, PH // sm_), interpolation=cv2.INTER_AREA)
    low = cv2.inpaint(small, cv2.resize(m, (PW // sm_, PH // sm_), interpolation=cv2.INTER_NEAREST), 12, cv2.INPAINT_TELEA)
    low = cv2.GaussianBlur(cv2.resize(low, (PW, PH), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255, (0, 0), 10)
    dx = int((poly[:, 0].max() - poly[:, 0].min()) + 0.01 * L)
    shifted = np.roll(rgb, -dx, axis=1)
    detail = shifted - cv2.GaussianBlur(shifted, (0, 0), 10)
    fill = np.clip(low + detail, 0, 1)
    wgt = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 4)[..., None]
    rgb = rgb * (1 - wgt) + fill * wgt
# the skin carried out past its silhouette (the background's fringe cut away first), so a texel the spline sets a
# little outside the specimen still reads the skin
core = cv2.erode((alpha > 0.6).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(np.float32)
acc, wsum = rgb * core[..., None], core.copy()
filled = rgb.copy()
have = core > 0
for sig in (2, 4, 8, 16, 32, 64):
    a_ = cv2.GaussianBlur(acc, (0, 0), sig); w_ = cv2.GaussianBlur(wsum, (0, 0), sig)
    new = (~have) & (w_ > 1e-3)
    filled[new] = a_[new] / w_[new, None]
    have |= new
rgb = np.where(core[..., None] > 0, rgb, filled)
rgbA = cv2.GaussianBlur(rgb, (0, 0), 1.0)       # (anti-aliased for the body texture's coarser texels)
# the fins read the photograph as it is (the pectoral not painted out), carried out past the silhouette the same way
finsrc = np.where(core[..., None] > 0, rgb0, filled)

def sample(im, s, y):
    X, Yp = px(s, y)
    return cv2.remap(im, X.astype(np.float32), Yp.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

# ------------------------------------------------------------------------------------------------ body
# (the peduncle's closing end, under the tail's root, from the peduncle itself: not from the fin behind it)
sg = np.broadcast_to(np.minimum(S, cbM - 0.004)[None, :], (H, W))
q = tps(np.stack([sg, Y], -1)).reshape(H, W, 2)
# where the skin turns away to the back's and the belly's midlines the side view only grazes it: read a little inside
# the outline there (the outline itself is where the fins rise from the body)
q[..., 1] -= np.sign(q[..., 1]) * 0.006 * (1 - F) ** 2
body = sample(rgbA, q[..., 0], q[..., 1])
Image.fromarray((np.clip(body, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(odir, sp + '.body.jpg'), quality=88)

# ------------------------------------------------------------------------------------------------ fins
def march(p0, d, inside, maxlen):
    """distance from p0 (specimen TL) along d until `inside` fails (once inside: a base just off the fin steps in first)"""
    step = 0.6 / L
    t = 0.0
    while t < 0.02 and not inside(p0[0] + d[0] * t, p0[1] + d[1] * t): t += step
    while t < maxlen:
        if not inside(p0[0] + d[0] * (t + step), p0[1] + d[1] * (t + step)): break
        t += step
    return t
def alpha_in(s, y):
    X, Yp = px(s, y)
    xi, yi = int(round(X)), int(round(Yp))
    return 0 <= xi < PW and 0 <= yi < PH and alpha[yi, xi] > 0.35
def poly_in(poly):
    pp = np.array([px(s, y) for s, y in poly], np.float32)
    return lambda s, y: cv2.pointPolygonTest(pp, tuple(map(float, px(s, y))), False) >= 0
atlas = np.zeros((6 * FH, FW, 3), np.float32)
FINPTS = []
ids = G['bands']
for band, fid in enumerate(ids):
    grid = FA[band]
    if np.isnan(grid[0, 0, 0]): continue
    base = grid[0]                   # v ≈ 0: the base points, model frame
    tip = grid[-1]
    out = np.zeros((FH, FW, 2))
    med = fid in ('d1', 'd2', 'a') and fid in fins
    paired = fid in ('p', 'v')
    if paired:
        # the specimen's fin: from its base toward its farthest point (the pectoral's outline on the flank; the pelvic,
        # what of the silhouette hangs below the belly there)
        if fid == 'p' and 'pecPoly' in SPEC:
            pp = np.array(SPEC['pecPoly']); pb = np.array(SPEC['pec'])
        elif fid == 'v' and 'pel' in SPEC:
            a0, a1 = SPEC['pel']
            ss_ = np.linspace(a0, a1, 40)
            pts = []
            for s_ in ss_:
                X, _ = px(s_, 0); xi = int(X)
                col = np.nonzero(alpha[:, min(PW - 1, xi)] > 0.35)[0]
                if len(col): pts.append((s_, (AX - col.max()) / L))
            pp = np.array(pts) if pts else None
            pb = np.array([a0, -bbot(a0) + 0.003]) if pts else None
        else:
            pp = None
        if pp is not None:
            far = pp[np.argmax(np.hypot(pp[:, 0] - pb[0], pp[:, 1] - pb[1]))]
            ang0 = np.arctan2(far[1] - pb[1], far[0] - pb[0])
            mdirs = [np.arctan2(*(tip[i] - base[i])[::-1]) for i in (0, FW - 1)]
            mmid = 0.5 * (mdirs[0] + mdirs[1])
        else:
            paired = False
    for i in range(FW):
        u = (i + 0.5) / FW
        dm = tip[i] - base[i]; lm = float(np.hypot(*dm)) or 1e-3
        d = dm / lm
        if med:
            a, b = fins[fid]
            sb = a + (b - a) * u
            b0 = np.array([sb, (btop(sb) - 0.004) if fid != 'a' else -(bbot(sb) - 0.004)])
        elif paired:
            b0 = pb + (tps(base[i])[0] - tps(base[0])[0])
            # (a fin pressed to the body or folded lies with its rays close together: the fan narrowed)
            th = ang0 + 0.4 * (np.arctan2(d[1], d[0]) - mmid)
            d = np.array([np.cos(th), np.sin(th)])
        else:
            b0 = tps(base[i])[0]
        if fid == 'p' and 'pecPoly' in SPEC: inside = poly_in(SPEC['pecPoly'])
        else: inside = alpha_in
        # (start just off the body for the median fins and the tail, where the march begins on the skin)
        lp = march(b0, d, inside, 2.0 * lm * k)
        if lp < 0.3 * lm * k: lp = 0.3 * lm * k
        for j in range(FH):
            v = np.hypot(*(grid[j, i] - base[i])) / lm
            out[j, i] = b0 + d * v * lp
    FINPTS.append(out)
    col = sample(finsrc, out[..., 0], out[..., 1])
    atlas[band * FH:(band + 1) * FH] = col
Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(odir, sp + '.fins.jpg'), quality=90)

# ------------------------------------------------------------------------------------------------ eye
if peyes:
    e, pe = eyes[0], peyes[0]
    N = 128
    g = (np.arange(N) + 0.5) / N * 2 - 1
    dxg, dyg = np.meshgrid(g, g)        # +x back, +y up (rows: dy from −1 at the top row of the data… as paintEye)
    s_ = pe[0] + dxg * pe[2]; y_ = pe[1] + dyg * pe[2]
    eye = sample(rgb, s_, y_)
    # the dead specimen's cloudy pupil and the studio's highlights out: a clear black pupil, the iris's tones capped
    r = np.hypot(dxg, dyg)
    lum = eye.mean(-1)
    ring = (r > e['pupil'] * 1.1) & (r < 0.95)
    cap = np.percentile(lum[ring], 85) if ring.any() else 1
    eye = eye * np.minimum(1, cap / np.maximum(lum, 1e-4))[..., None] ** 0.8
    pup = 1 - np.clip((r - e['pupil'] * 0.92) / (e['pupil'] * 0.16), 0, 1)
    eye = eye * (1 - pup[..., None]) + np.array([0.012, 0.016, 0.02]) * pup[..., None]
    Image.fromarray((np.clip(eye, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(odir, sp + '.eye.jpg'), quality=92)

if check:
    # the model's outline, eye, mouth and gill cover carried onto the specimen through the spline
    vis = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(vis)
    ss = np.linspace(0, cbM, 200)
    for sign, f in ((1, mtop), (-1, mbot)):
        pts = tps(np.stack([ss, sign * f(ss)], -1)); dr.line([px(a, b) for a, b in pts], fill=(0, 255, 255), width=3)
    for e in eyes:
        if e.get('across') is not None: continue
        t = np.linspace(0, 2 * np.pi, 40)
        pts = tps(np.stack([e['s'] + e['r'] * np.cos(t), e['y'] + e['r'] * np.sin(t)], -1)); dr.line([px(a, b) for a, b in pts], fill=(255, 0, 0), width=3)
    o = G['oper']; v = np.linspace(-1, 1, 30)
    pts = tps(np.stack([o['s'] - o['sweep'] * v * v, np.where(v > 0, v * o['top'], v * o['bot'])], -1)); dr.line([px(a, b) for a, b in pts], fill=(0, 255, 0), width=3)
    for a, b in dst: x_, y_ = px(a, b); dr.ellipse([x_ - 4, y_ - 4, x_ + 4, y_ + 4], outline=(255, 255, 0))
    for o_ in FINPTS:
        for j in range(0, FH, 8):
            dr.line([px(a, b) for a, b in o_[j, ::8]], fill=(255, 128, 255), width=1)
        for i in range(0, FW, 16):
            dr.line([px(a, b) for a, b in o_[:, i]], fill=(255, 128, 255), width=1)
    vis.thumbnail((1600, 900)); vis.save(os.path.join(check, sp + '.check.jpg'), quality=85)
print(sp, 'ok', len(src), 'control points')
