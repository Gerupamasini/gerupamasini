#!/usr/bin/env python3
"""Sample the colour of a rectangular region of a reference photo.

usage: colorsample.py PHOTO_ID x0 y0 x1 y1 [x0 y0 x1 y1 ...]
Prints, per rectangle: median sRGB (0-255), hex, mean linear-sRGB, CIE L*a*b* of the
median, and the 10th/90th percentile luminance (specular/shadow spread).
Median is used (not mean) so that specular highlights and pixels of dark spots do not
dominate. Always sample a small, visually uniform patch.
"""
import os, sys
import numpy as np
from PIL import Image

DEF_DIR = os.environ.get("YAMAME_PHOTOS", "/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/photos")

def srgb_to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def lin_to_lab(rgb_lin):
    M = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = M @ rgb_lin
    xyz = xyz / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return 116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])

def main():
    if len(sys.argv) < 6 or (len(sys.argv) - 2) % 4:
        print(__doc__); sys.exit(1)
    pid = sys.argv[1]
    im = np.asarray(Image.open(os.path.join(DEF_DIR, pid + ".jpg")).convert("RGB"), dtype=np.float64)
    nums = list(map(int, sys.argv[2:]))
    for i in range(0, len(nums), 4):
        x0, y0, x1, y1 = nums[i:i + 4]
        patch = im[y0:y1, x0:x1].reshape(-1, 3)
        if patch.size == 0:
            print(f"{pid} ({x0},{y0},{x1},{y1}) EMPTY"); continue
        med = np.median(patch, axis=0)
        lin = srgb_to_lin(patch).mean(axis=0)
        L, a, b = lin_to_lab(srgb_to_lin(med))
        lum = patch @ np.array([0.2126, 0.7152, 0.0722])
        p10, p90 = np.percentile(lum, [10, 90])
        hx = "#%02x%02x%02x" % tuple(int(round(v)) for v in med)
        print(f"{pid} ({x0},{y0},{x1},{y1}) n={len(patch)} median_sRGB=({med[0]:.0f},{med[1]:.0f},{med[2]:.0f}) {hx} "
              f"mean_linear=({lin[0]:.3f},{lin[1]:.3f},{lin[2]:.3f}) Lab=({L:.1f},{a:.1f},{b:.1f}) lum_p10/p90=({p10:.0f}/{p90:.0f})")

if __name__ == "__main__":
    main()
