# Mean silhouette of the accepted lateral photographs (head left, snout at a fixed row, TL = 400 px) with the median
# dorsal / ventral profiles; the model's silhouette (model/<sp>_side.png) outlined over it; grid every 5 % TL.
import os
W = os.environ.get('FISH_MEASURE', '/tmp/fish-measure')  # work folder: photos, masks, renders (not in the repository)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw
SP = sys.argv[1]; VIEW = sys.argv[3] if len(sys.argv) > 3 else 'side'; REV = sys.argv[4] if len(sys.argv) > 4 else SP; sel = [int(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 and sys.argv[2] else None
ids = json.load(open(f'{W}/rev_{REV}.json'))
if sel is not None: ids = [ids[i] for i in sel]
d = json.load(open(f'{W}/norm/{SP}.json'))
W, H, SY = 400, 260, 130
acc = np.zeros((H, W), np.float32)
for k in ids:
    m = np.asarray(Image.open(f'{W}/norm/{SP}/{k}.png'), np.float32) / 255
    sy = d[k]['snoutY'] * W   # snout row in the normalised mask (TL = 400 px)
    # snoutY was measured from the crop's top in TL units
    off = int(round(SY - sy))
    c = np.zeros((H, W), np.float32)
    y0, y1 = max(0, off), min(H, off + m.shape[0])
    c[y0:y1, :] = m[y0 - off:y1 - off, :W]
    acc += c
acc /= max(1, len(ids))
img = np.stack([acc * 255] * 3, -1).astype(np.uint8)
# the model
try:
    mm = np.asarray(Image.open(f'{W}/model/norm/{SP}_{VIEW}.png'), np.float32) / 255
    msy = json.load(open(f'{W}/model/norm/{SP}.json'))[f'{SP}_{VIEW}']['snoutY'] * W
    off = int(round(SY - msy)); c = np.zeros((H, W), np.float32)
    y0, y1 = max(0, off), min(H, off + mm.shape[0]); c[y0:y1, :] = mm[y0 - off:y1 - off, :W]
    cnt, _ = cv2.findContours((c > 0.5).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(img, cnt, -1, (60, 255, 60), 1)
    a, b = acc > 0.5, c > 0.5
    print('IoU', SP, round(float((a & b).sum() / max(1, (a | b).sum())), 3))
except FileNotFoundError:
    pass
cnt, _ = cv2.findContours((acc > 0.5).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cv2.drawContours(img, cnt, -1, (255, 60, 60), 1)
im = Image.fromarray(img).resize((W * 2, H * 2), Image.NEAREST)
dr = ImageDraw.Draw(im)
for i in range(0, 21):
    x = i * 40; dr.line([(x, 0), (x, H * 2)], fill=(90, 90, 200) if i % 2 else (160, 160, 255))
    if i % 2 == 0: dr.text((x + 2, 2), str(i * 5), fill='yellow')
for j in range(-6, 7):
    y = SY * 2 + j * 40; dr.line([(0, y), (W * 2, y)], fill=(90, 90, 200) if j else (255, 255, 0))
    dr.text((2, y + 1), str(-j * 5), fill='yellow')
dr.text((700, H * 2 - 14), f'{SP} n={len(ids)}', fill='yellow')
im.save(f'{W}/agg_{SP}_{VIEW}.png')
# median profiles every 2.5 % (TL units, + up from the snout)
T = np.array([[np.nan if v is None else v for v in d[k]['top']] for k in ids]); Bo = np.array([[np.nan if v is None else v for v in d[k]['bot']] for k in ids])
mt, mb = np.nanmedian(T, 0), np.nanmedian(Bo, 0)
B = T.shape[1]
print('s   ' + ' '.join(f'{(j + 0.5) / B:5.3f}' for j in range(0, B, 5)))
print('top ' + ' '.join(f'{mt[j]:5.3f}' for j in range(0, B, 5)))
print('bot ' + ' '.join(f'{mb[j]:5.3f}' for j in range(0, B, 5)))
json.dump({'ids': ids, 'top': [None if np.isnan(v) else float(v) for v in mt], 'bot': [None if np.isnan(v) else float(v) for v in mb]}, open(f'{W}/agg_{SP}_{VIEW}.json', 'w'))
