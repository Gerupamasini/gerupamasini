# 沿岸の魚の形の計測

写真を集めて切り抜き、向きと大きさをそろえて平均し、モデルの輪郭と比べて合わせる道具。説明と結果は [docs/models/fish/README.md](../../../../docs/models/fish/README.md) と `docs/models/fish/reference.json`。

作業用のフォルダ（写真、マスク、レンダリング）は `FISH_MEASURE`（既定 `/tmp/fish-measure`）。写真はリポジトリに置かない。

```
pip install onnxruntime opencv-python-headless pillow numpy
mkdir -p $FISH_MEASURE/models && curl -L -o $FISH_MEASURE/models/isnet.onnx \
  https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
python3 fetch.py 120                      # 9 種、研究用グレード（足りない種は: fetch.py 150 sappa,ishimochi --any）
python3 seg.py 0 1                        # 前景のマスク（CPU で 1 枚 2 秒ほど）
python3 profile.py bora                   # 向きをそろえて計測
python3 review.py bora 3.0 7.0            # 細長さ 3〜7 の写真を輪郭つきで一覧に（$FISH_MEASURE/rev_bora.jpg の番号で選ぶ）
./iterate.sh bora BORA 3,5,6,10 2         # 2 回、描いて測って直す（species.ts の背・腹の表を書き換える）
python3 aggregate.py bora 3,5,6,10 side   # 平均の輪郭とモデルの輪郭を重ねた図、IoU、中央値の輪郭
python3 heads.py bora 3,5,6,10            # 頭の拡大を写真とモデルで並べる（眼・口角・鰓蓋を読む）
```

`fit.py` の `--exT a-b` / `--exB a-b` は、写真のひれが体の輪郭を広げている区間（背側・腹側）を外す。`--fullT` / `--fullB` はひれが体と同じくらい写る種（メジナ）で、その区間をモデルのひれ込みの輪郭と比べる。
