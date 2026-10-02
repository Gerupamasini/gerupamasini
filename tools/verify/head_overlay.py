#!/usr/bin/env python3
"""Overlay a transparent side render of the model head on a reference photo and write a side-by-side/overlay sheet.

usage: head_overlay.py PHOTO_ID [--landmarks FILE] [--model PNG --cx CX --cy CY --half H --w W --h H] [--mlm MODEL_LANDMARKS.json] [--out OUT.png]

 * photo landmarks: mean of raters A/B (docs/yamame/photo_analysis/head_landmarks_g*_{A,B}.json) or an explicit JSON {name:[x,y]}.
 * model render: transparent PNG from  render-alpha.mjs "/viewer/dev/still.html?view=side&alpha=1&half=H&cx=CX&cy=CY&w=..." (camera at +Z looking -Z, model faces +x, y up).
 * model landmarks: JSON {name: [x_m, y_m]} in body coordinates (metres): snout_tip, opercle_post_mid, ... The head chord (snout_tip -> opercle_post_mid)
   of the model is mapped onto the photo's chord (similarity transform; mirror if needed so that the eye lies on the dorsal side).
"""
import argparse, json, glob, math, os, sys
from PIL import Image, ImageDraw

D = os.path.join(os.path.dirname(__file__), '../../docs/yamame/photo_analysis')
PH = os.environ.get('YAMAME_PHOTOS', '/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/head50')

def photo_landmarks(pid):
    acc = {}
    for f in glob.glob(os.path.join(D, 'head_landmarks_g*_*.json')):
        try: d = json.load(open(f))
        except Exception: continue
        for ph in d.get('photos', []):
            if ph['id'] == pid:
                for k, v in (ph.get('landmarks') or {}).items():
                    if v: acc.setdefault(k, []).append(v)
    return {k: [sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)] for k, v in acc.items()}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('photo'); ap.add_argument('--landmarks'); ap.add_argument('--model', required=True)
    ap.add_argument('--cx', type=float, required=True); ap.add_argument('--cy', type=float, required=True); ap.add_argument('--half', type=float, required=True)
    ap.add_argument('--mlm', required=True); ap.add_argument('--out', default='overlay.png'); ap.add_argument('--alpha', type=float, default=0.6)
    a = ap.parse_args()
    photo = Image.open(os.path.join(PH, a.photo + '.jpg')).convert('RGB')
    lm = json.load(open(a.landmarks)) if a.landmarks else photo_landmarks(a.photo)
    mlm = json.load(open(a.mlm))
    S, O, E = lm.get('snout_tip'), lm.get('opercle_post_mid'), lm.get('eye_center')
    if not (S and O): sys.exit('photo needs snout_tip and opercle_post_mid')
    ux, uy = O[0] - S[0], O[1] - S[1]; hl = math.hypot(ux, uy); ux, uy = ux / hl, uy / hl; vx, vy = -uy, ux
    if E and ((E[0] - S[0]) * vx + (E[1] - S[1]) * vy) < 0: vx, vy = -vx, -vy
    ms, mo = mlm['snout_tip'], mlm['opercle_post_mid']; hlm = math.hypot(ms[0] - mo[0], ms[1] - mo[1])
    m = Image.open(a.model).convert('RGBA'); W, H = m.size
    # model render pixel -> model metres
    def px2m(px, py): return (a.cx + (px - W / 2) / (W / 2) * a.half * W / H, a.cy - (py - H / 2) / (H / 2) * a.half)
    # model metres -> (u, v) chord coordinates -> photo pixels.  model faces +x: u = (x_tip - x)/hlm (towards the tail), v = (y - y_tip)/hlm
    def m2photo(x, y):
        u, v = (ms[0] - x) / hlm, (y - ms[1]) / hlm
        return (S[0] + hl * (u * ux + v * vx), S[1] + hl * (u * uy + v * vy))
    pts_src = [(0, 0), (W, 0), (0, H)]; pts_dst = [m2photo(*px2m(*p)) for p in pts_src]
    # inverse affine for PIL: maps photo pixel -> render pixel
    (x0, y0), (x1, y1), (x2, y2) = pts_dst
    A = [[x1 - x0, x2 - x0], [y1 - y0, y2 - y0]]; det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
    inv = [[A[1][1] / det, -A[0][1] / det], [-A[1][0] / det, A[0][0] / det]]
    # render px = (0,0) + inv * ((X,Y) - dst0) * [W, H]
    c = [W * (inv[0][0] * (-x0) + inv[0][1] * (-y0)), H * (inv[1][0] * (-x0) + inv[1][1] * (-y0))]
    coef = (W * inv[0][0], W * inv[0][1], c[0], H * inv[1][0], H * inv[1][1], c[1])
    warped = m.transform(photo.size, Image.AFFINE, coef, resample=Image.BICUBIC)
    over = photo.copy().convert('RGBA'); wa = warped.copy(); al = wa.getchannel('A').point(lambda v: int(v * a.alpha)); wa.putalpha(al); over = Image.alpha_composite(over, wa).convert('RGB')
    d = ImageDraw.Draw(over)
    for k, p in lm.items(): d.ellipse((p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2), outline=(255, 255, 0))
    for k, p in mlm.items():
        if k in ('snout_tip', 'opercle_post_mid') or len(p) < 2: continue
        q = m2photo(p[0], p[1]); d.ellipse((q[0] - 2.5, q[1] - 2.5, q[0] + 2.5, q[1] + 2.5), outline=(0, 255, 255))
    # outline panel: silhouette edge of the model drawn in magenta on the clean photo
    from PIL import ImageFilter, ImageChops
    mask = warped.getchannel('A').point(lambda v: 255 if v > 100 else 0); edge = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(3))).filter(ImageFilter.MaxFilter(3))
    outl = photo.copy(); outl.paste((255, 0, 255), mask=edge)
    do = ImageDraw.Draw(outl)
    for k, p in mlm.items():
        if len(p) < 2 or k in ('snout_tip', 'opercle_post_mid'): continue
        q = m2photo(p[0], p[1]); do.ellipse((q[0] - 2.5, q[1] - 2.5, q[0] + 2.5, q[1] + 2.5), outline=(0, 255, 255))
    for k, p in lm.items(): do.ellipse((p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2), outline=(255, 255, 0))
    sc = max(1, 600 // max(photo.size)) if max(photo.size) < 600 else 1
    sheet = Image.new('RGB', (photo.width * 3, photo.height)); sheet.paste(photo, (0, 0)); sheet.paste(outl, (photo.width, 0)); sheet.paste(over, (photo.width * 2, 0))
    if sc > 1: sheet = sheet.resize((sheet.width * sc, sheet.height * sc), Image.LANCZOS)
    sheet.save(a.out); print(a.out, 'HL_px', round(hl, 1), 'HL_model_mm', round(hlm * 1000, 2))

if __name__ == '__main__': main()
