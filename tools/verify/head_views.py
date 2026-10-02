#!/usr/bin/env python3
"""Render a contact sheet of canonical head views of a GLB (side, 3/4 front from above, front, top, below, 3/4 from below).
usage: head_views.py OUT.png [--glb /assets/generated/geom/yamame.glb] [--w 520 --h 400] [--dist 0.15] [--extra "yaw=..,pitch=..,side=R"]"""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
def main():
    a = sys.argv[1:]; out = a[0]; glb = '/assets/generated/yamame.glb'; w, h, dist = 520, 400, 0.15; extra = []
    i = 1
    while i < len(a):
        if a[i] == '--glb': glb = a[i + 1]; i += 2
        elif a[i] == '--w': w = int(a[i + 1]); i += 2
        elif a[i] == '--h': h = int(a[i + 1]); i += 2
        elif a[i] == '--dist': dist = float(a[i + 1]); i += 2
        elif a[i] == '--extra': extra.append(a[i + 1]); i += 2
        else: i += 1
    cx, cy = 0.072, -0.004
    views = [('side', f'yaw=0&pitch=0'), ('3/4 above', 'yaw=38&pitch=18'), ('3/4 level', 'yaw=45&pitch=2'), ('front', 'yaw=88&pitch=0'),
             ('top', 'yaw=0&pitch=84'), ('3/4 below', 'yaw=40&pitch=-25'), ('oblique above', 'yaw=20&pitch=35'), ('rear 3/4', 'yaw=-35&pitch=10')]
    for e in extra: views.append((e, e.replace(',', '&')))
    tiles = []
    for name, q in views:
        f = tempfile.mktemp(suffix='.png')
        url = f"/viewer/dev/still.html?view=orbit&{q}&side=R&dist={dist}&fov=24&cx={cx}&cy={cy}&bg=7d8a90&file={glb}" + (("&" + os.environ.get("HV_EXTRA")) if os.environ.get("HV_EXTRA") else "")
        subprocess.run(['node', os.path.join(ROOT, 'tools/headless/render-snapshot.mjs'), url, f, '--w', str(w), '--h', str(h)], cwd=ROOT, capture_output=True)
        im = Image.open(f).convert('RGB') if os.path.exists(f) else Image.new('RGB', (w, h))
        ImageDraw.Draw(im).text((6, 6), name, fill=(255, 255, 0)); tiles.append(im)
    cols = 4; rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (w * cols, h * rows), (20, 20, 20))
    for k, t in enumerate(tiles): sheet.paste(t, ((k % cols) * w, (k // cols) * h))
    sheet.save(out); print(out, sheet.size)
main()
