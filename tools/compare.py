# Side-by-side / overlay of a reference photo and a render, both scaled to the same height.
# usage: python3 tools/compare.py ref.jpg render.png out.png [flip_ref]
import sys
from PIL import Image, ImageOps
ref, ren, out = sys.argv[1:4]
flip = len(sys.argv) > 4 and sys.argv[4] == '1'
a = Image.open(ref).convert('RGB'); b = Image.open(ren).convert('RGB')
if flip: a = ImageOps.mirror(a)
H = 600
a = a.resize((int(a.width * H / a.height), H)); b = b.resize((int(b.width * H / b.height), H))
c = Image.new('RGB', (a.width + b.width + 10, H), (20, 20, 20))
c.paste(a, (0, 0)); c.paste(b, (a.width + 10, 0))
c.save(out)
