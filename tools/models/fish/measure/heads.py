# the heads (s 0 … 0.4) of chosen photographs and of the model, normalised alike (TL = 1200 px), with a 2.5 % grid
import os
W = os.environ.get('FISH_MEASURE', '/tmp/fish-measure')  # work folder: photos, masks, renders (not in the repository)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
import sys, json, numpy as np
from PIL import Image, ImageDraw
SP = sys.argv[1]; REV = sys.argv[3] if len(sys.argv) > 3 else SP
ids = json.load(open(f'{W}/rev_{REV}.json')); sel = [ids[int(i)] for i in sys.argv[2].split(',')]
d = json.load(open(f'{W}/norm/{SP}.json')); md = json.load(open(W + '/model/norm/' + SP + '.json'))
tiles = []
def tile(path, sy, label):
    im = Image.open(path).convert('RGB')
    W = 1200; S = 0.42; cw = int(W * S); ch = int(0.36 * W)
    t = Image.new('RGB', (cw, ch), (30, 30, 30))
    off = int(ch / 2 - sy * W)
    t.paste(im.crop((0, 0, cw, im.height)), (0, off))
    dr = ImageDraw.Draw(t)
    for i in range(0, 17):
        x = int(i * 0.025 * W); dr.line([(x, 0), (x, ch)], fill=(255, 255, 0) if i % 4 == 0 else (110, 110, 160))
        if i % 4 == 0: dr.text((x + 2, 2), f'{i * 2.5:g}', fill='yellow')
    for j in range(-7, 8):
        y = int(ch / 2 + j * 0.025 * W); dr.line([(0, y), (cw, y)], fill=(255, 255, 0) if j == 0 else (110, 110, 160))
    dr.text((4, ch - 14), label, fill='yellow')
    return t
for k in sel: tiles.append(tile(f'{W}/norm/{SP}/{k}_big.jpg', d[k]['snoutY'], k))
tiles.append(tile(f'{W}/model/norm/{SP}_side_big.jpg', md[f'{SP}_side']['snoutY'], 'MODEL'))
C = 3; R = (len(tiles) + C - 1) // C
S = Image.new('RGB', (tiles[0].width * C, tiles[0].height * R))
for i, t in enumerate(tiles): S.paste(t, ((i % C) * t.width, (i // C) * t.height))
S = S.resize((S.width * 2 // 3, S.height * 2 // 3))
S.save(f'{W}/heads_{SP}.jpg', quality=85)
