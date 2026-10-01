#!/usr/bin/env python3
"""Render a photo (or a crop of it) with a labelled coordinate grid.

All labels are in ORIGINAL image pixel coordinates, so landmarks read from a
zoomed crop can be recorded directly against the source photo.

usage:
  grid.py PHOTO_ID [x0 y0 x1 y1] [--step N] [--out DIR]
  PHOTO_ID is e.g. p012 (file <PHOTOS>/p012.jpg). Output path is printed.
env:
  YAMAME_PHOTOS  directory holding pNNN.jpg   (default: scratchpad photos dir)
"""
import os, sys, argparse
from PIL import Image, ImageDraw, ImageFont

DEF_DIR = os.environ.get("YAMAME_PHOTOS", "/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/photos")

def nice_step(span, target=10):
    raw = span / target
    for s in (5, 10, 20, 25, 50, 100, 200):
        if s >= raw:
            return s
    return 250

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("box", nargs="*", type=int)
    ap.add_argument("--step", type=int, default=0)
    ap.add_argument("--out", default=os.path.join(DEF_DIR, "..", "grid"))
    ap.add_argument("--target_w", type=int, default=1400)
    a = ap.parse_args()
    src = os.path.join(DEF_DIR, a.photo + ".jpg")
    im = Image.open(src).convert("RGB")
    W, H = im.size
    if len(a.box) == 4:
        x0, y0, x1, y1 = a.box
    else:
        x0, y0, x1, y1 = 0, 0, W, H
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(W, x1), min(H, y1)
    crop = im.crop((x0, y0, x1, y1))
    cw, ch = crop.size
    k = a.target_w / cw
    k = max(1.0, min(k, 8.0)) if cw < a.target_w else 1.0
    if k != 1.0:
        crop = crop.resize((int(cw * k), int(ch * k)), Image.LANCZOS)
    step = a.step or nice_step(max(cw, ch))
    ov = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    try:
        font = ImageFont.load_default(size=max(12, int(13 * min(2, max(1, k / 2)))))
    except TypeError:
        font = ImageFont.load_default()
    major = step * 5
    def line_style(v):
        return ((255, 255, 0, 150), 1) if v % major == 0 else ((0, 255, 255, 95), 1)
    # vertical lines
    gx = (x0 // step + (1 if x0 % step else 0)) * step
    while gx <= x1:
        X = (gx - x0) * k
        col, w = line_style(gx)
        d.line([(X, 0), (X, crop.size[1])], fill=col, width=w)
        lab = str(gx)
        d.text((X + 2, 2), lab, fill=(255, 255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
        d.text((X + 2, crop.size[1] - 18), lab, fill=(255, 255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
        gx += step
    gy = (y0 // step + (1 if y0 % step else 0)) * step
    while gy <= y1:
        Y = (gy - y0) * k
        col, w = line_style(gy)
        d.line([(0, Y), (crop.size[0], Y)], fill=col, width=w)
        lab = str(gy)
        d.text((2, Y + 1), lab, fill=(255, 255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
        d.text((crop.size[0] - 44, Y + 1), lab, fill=(255, 255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
        gy += step
    out = Image.alpha_composite(crop.convert("RGBA"), ov).convert("RGB")
    os.makedirs(a.out, exist_ok=True)
    name = f"{a.photo}_{x0}_{y0}_{x1}_{y1}_s{step}.png"
    path = os.path.abspath(os.path.join(a.out, name))
    out.save(path)
    print(path)
    print(f"source_size={W}x{H} crop=({x0},{y0})-({x1},{y1}) zoom={k:.2f} grid_step={step}px")

if __name__ == "__main__":
    main()
