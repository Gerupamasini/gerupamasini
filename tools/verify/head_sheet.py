#!/usr/bin/env python3
"""Side-by-side sheet: reference head photos vs the model rendered from a matching viewpoint (yaw / pitch / flank from the raters' estimates).
usage: head_sheet.py OUT.png pNNN [pNNN ...] [--glb FILE] [--pitch-bias DEG]
The model is rendered with viewer/dev/still.html (orbit camera). Photos facing left are viewed from the model's left flank.
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../photo')); import head_stats as H
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
PH = os.environ.get('YAMAME_PHOTOS', '/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/head50')

def main():
    a = sys.argv[1:]; out = a[0]; ids = []; glb = None; bias = 0.0; i = 1
    while i < len(a):
        if a[i] == '--glb': glb = a[i + 1]; i += 2
        elif a[i] == '--pitch-bias': bias = float(a[i + 1]); i += 2
        else: ids.append(a[i]); i += 1
    A, B = {}, {}
    for g in (1, 2, 3): A.update(H.load(g, 'A')); B.update(H.load(g, 'B'))
    lm = json.load(open(os.path.join(ROOT, 'assets/generated/head_landmarks.json'))) if os.path.exists(os.path.join(ROOT, 'assets/generated/head_landmarks.json')) else {}
    cx = 0.5 * (lm.get('snout_tip', [0.096, 0])[0] + lm.get('opercle_post_mid', [0.048, 0])[0]); cy = lm.get('eye_center', [0, 0])[1] - 0.004
    rows = []
    for pid in ids:
        r = [x[pid] for x in (A, B) if pid in x]
        yaw = sum(x.get('yaw_deg') or 0 for x in r) / max(len(r), 1); pit = sum(x.get('pitch_deg') or 0 for x in r) / max(len(r), 1) + bias
        facing = (r[0].get('facing') if r else 'left') or 'left'
        side = 'L' if facing == 'left' else 'R'
        url = f"/viewer/dev/still.html?view=orbit&yaw={yaw:.0f}&pitch={pit:.0f}&side={side}&dist=0.17&fov=26&cx={cx:.4f}&cy={cy:.4f}&bg=7d8a90" + (f"&file={glb}" if glb else '')
        f = tempfile.mktemp(suffix='.png')
        subprocess.run(['node', os.path.join(ROOT, 'tools/headless/render-snapshot.mjs'), url, f, '--w', '640', '--h', '520'], cwd=ROOT, capture_output=True)
        photo = Image.open(os.path.join(PH, pid + '.jpg')).convert('RGB'); photo = photo.resize((int(photo.width * 520 / photo.height), 520))
        if facing == 'right': pass
        m = Image.open(f).convert('RGB') if os.path.exists(f) else Image.new('RGB', (640, 520))
        d = ImageDraw.Draw(m); d.text((6, 6), f'{pid} yaw {yaw:.0f} pitch {pit:.0f} {side}', fill=(255, 255, 0))
        rows.append((photo, m))
    W = max(p.width + m.width for p, m in rows); Hh = sum(520 for _ in rows)
    sheet = Image.new('RGB', (W, Hh), (20, 20, 20)); y = 0
    for p, m in rows: sheet.paste(p, (0, y)); sheet.paste(m, (p.width, y)); y += 520
    sheet.save(out); print(out, sheet.size)

if __name__ == '__main__': main()
