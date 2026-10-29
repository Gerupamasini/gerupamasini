# 沿岸の魚の写真の皮膚を作る

実物の標本（ffish.asia / floraZia.com の CC0 の写真測量、Sketchfab）の横からの画像を、モデルのテクスチャの並びに写す。できたものは `src/assets/fish/`（出典もそこ）。

```
pip install onnxruntime opencv-python-headless pillow numpy       # IS-Net は measure/README.md の手順で
W=/tmp/fish-photo; mkdir -p $W/src $W/al $W/geom $W/out
# 1. プレビュー画像: https://api.sketchfab.com/v3/models/<uid> の thumbnails（1920 × 1080）を $W/src/<名>.jpg に
#    （uid と使う画像の名は specimens.json）。画像はリポジトリに置かない
# 2. 切り抜いて向きをそろえる（吻端から尾柄の中央を水平に、全長 1 を 2048 px に）
python3 -I align.py $W/src/suzuki_1.jpg $W/al/suzuki_1 --isnet $FISH_MEASURE/models/isnet.onnx
# 3. モデルの横から見た形（テクスチャの画素ごとの位置、ひれのアトラス、眼・口角・鰓蓋・胸びれ）
npx esbuild tools/models/fish/photo/geom.ts --bundle --platform=node --format=esm --outfile=$W/geom.mjs \
  --define:import.meta.glob=globalThis.__noGlob --banner:js="globalThis.__noGlob=()=>({});"
node $W/geom.mjs suzuki $W/geom
# 4. 写す（--check で、モデルの輪郭・眼・鰓蓋・ひれの網を標本に重ねた確認用の図）
python3 -I bake.py suzuki $W/al $W/geom $W/out --check $W
cp $W/out/suzuki.* src/assets/fish/
```

- `specimens.json`: 標本ごとの目印（標本の全長に対する割合で読んだもの）。尾びれの付け根 `cb`、眼（中心と虹彩の半径）、口角、鰓蓋の後ろの縁、胸びれの付け根、ひれの付け根の範囲、体側に重なった胸びれの輪郭 `pecPoly`（その下の体側は周りの色と後ろの鱗で埋める）、長いひれが体の縁を隠すところは鱗が終わる線 `baseTop` / `baseBot`。
- `bake.py`: モデルの横から見た位置から標本の位置への薄板スプライン（ひれのない区間の輪郭、眼、口角、鰓蓋、胸びれ）。二つは標準体長（吻端〜尾びれの付け根）でそろえる（標本の尾びれは傷んでいることがある）。ひれは標本のひれの付け根から、モデルの鰭条の向きに標本のひれの先までを、モデルのひれの長さに伸ばして取る。
- 種の形（眼・口角・鰓蓋・胸びれ・ひれの付け根）は、この標本の目印に合わせて `species.ts` を直してある（2026-10-29）。形を変えたら 3〜4 をやり直す。
