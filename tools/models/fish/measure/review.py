# Review sheet: every normalised photo (head left) with its silhouette outlined, numbered; lateral candidates first.
import os
W = os.environ.get('FISH_MEASURE', '/tmp/fish-measure')  # work folder: photos, masks, renders (not in the repository)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw
SP = sys.argv[1]; lo, hi = float(sys.argv[2]), float(sys.argv[3]); TAG = sys.argv[4] if len(sys.argv) > 4 else SP
d = json.load(open(f'{W}/norm/{SP}.json'))
ids = [k for k, v in d.items() if lo <= v['elong'] <= hi and v['edge'] < 40]
TW, TH, C = 240, 110, 7
rows = (len(ids) + C - 1) // C
S = Image.new('RGB', (TW * C, TH * rows), (20, 20, 20))
for i, k in enumerate(ids):
    ph = Image.open(f'{W}/norm/{SP}/{k}_ph.jpg').convert('RGB')
    m = np.asarray(Image.open(f'{W}/norm/{SP}/{k}.png'))
    cnt, _ = cv2.findContours((m > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    a = np.asarray(ph).copy()
    cv2.drawContours(a, cnt, -1, (255, 40, 40), 2)
    im = Image.fromarray(a); im.thumbnail((TW - 4, TH - 14))
    S.paste(im, ((i % C) * TW + 2, (i // C) * TH + 12))
    ImageDraw.Draw(S).text(((i % C) * TW + 3, (i // C) * TH), f'{i}', fill='yellow')
S.save(f'{W}/rev_{TAG}.jpg', quality=80)
json.dump(ids, open(f'{W}/rev_{TAG}.json', 'w'))
print(len(ids))
