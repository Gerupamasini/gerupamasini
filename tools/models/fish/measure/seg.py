# Foreground masks for the reference photographs (IS-Net general-use, rembg's export): masks/<species>/<photo>.png
import os
W = os.environ.get('FISH_MEASURE', '/tmp/fish-measure')  # work folder: photos, masks, renders (not in the repository)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
import sys, os, glob, numpy as np, onnxruntime as ort
from PIL import Image
so = ort.SessionOptions(); so.intra_op_num_threads = 4
sess = ort.InferenceSession(W + '/models/isnet.onnx', so, providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0].name
files = sorted(glob.glob(W + '/photos/*/*.jpg'))
k, n = int(sys.argv[1]), int(sys.argv[2])
for i, f in enumerate(files):
    if i % n != k: continue
    sp = f.split('/')[-2]
    out = f'{W}/masks/{sp}/{os.path.basename(f)[:-4]}.png'
    if os.path.exists(out): continue
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        im = Image.open(f).convert('RGB')
    except Exception as e:
        print('bad', f); continue
    x = np.asarray(im.resize((1024, 1024), Image.BILINEAR), dtype=np.float32) / 255.0
    x = (x - 0.5) / 1.0
    x = x.transpose(2, 0, 1)[None]
    y = sess.run(None, {inp: x})[0][0, 0]
    y = (y - y.min()) / max(1e-6, y.max() - y.min())
    Image.fromarray((y * 255).astype(np.uint8)).resize(im.size, Image.BILINEAR).save(out)
print('done', k)
