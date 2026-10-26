# 沿岸の魚（手続き生成）

スズキ、メジナ、シロギス、マゴチ、ヒラメ、ボラ（成魚）、サッパ、コノシロ、イシモチ（シログチ）。1 つの仕組み（`src/creatures/fish/`）に、種ごとの差分（`species.ts`）を載せている。

| ファイル | 中身 |
|---|---|
| `spec.ts` | 種の記述の型。体の背・腹の輪郭と幅（全長に対する割合の表）、断面の形、吻の丸み、口裂と口角、眼、鰓蓋の縁、ひれ |
| `body.ts` | 共通の骨格（脊椎 8・下顎・左右の胸びれ）と 3 段階の形。口は本当に開き（下顎が骨、口の内側の面がある）、鰓蓋の縁は段になる |
| `skin.ts` | 共通の PBR。本体（色＋金属感、法線＋粗さ、鱗の起伏、鰓蓋・前鰓蓋・口の線、眼の虹彩）、ひれ（鰭条・膜・縁・斑、ヒラメの縁のひれは波打つ）、眼（角膜の透明な層） |
| `rig.ts` | 泳ぎの姿勢（体を伝わる波＋曲がり、胸びれ、下顎、ひれの波）と LOD の切り替え（画質の設定に従う） |
| `motion.ts` | 共通の行動。IDLE・SWIM・TURN・FORAGE・ESCAPE と、種によって REST・BURY・STRIKE・LEAP・ALERT。採餌の仕方は種ごと（hunt・pick・dig・ambush・graze・filter・peck） |
| `school.ts` | 群れ。1 群れに 1 つの状態、近くの仲間との分離・整列・結合だけの軽い処理。驚きの波、コノシロの一斉の方向転換 |
| `FishDriver.ts` | ゲームとのつなぎ（`drivers/index.ts` に登録）。ボラは 20 cm からこちら、それより小さいハク・スバシリは従来どおり |

ヒラメは同じ骨格を、無眼側を下に寝かせた体の枠に入れている（波は上下に伝わり、縁のひれが波打つ）。眼は 2 つとも左側、口は大きい。マゴチは縦扁した頭（幅 0.2 TL・高さ 0.06 TL）、上を向いた小さな眼、底に広げる胸びれ・腹びれ。

## 形の確かめ方

実物の側面写真（iNaturalist の研究用グレードの写真）を、吻端と尾びれの端で全長 100 % にそろえた格子に載せて、背と腹の輪郭、眼、口角、鰓蓋、ひれの位置を 5 % ごとに読み取って表にした。モデルの側面を同じ格子に並べて見比べる。

```
node tools/models/fish/render.mjs               # 側面・正面・上面・斜め（docs/models/fish/<種>.jpg）
node tools/models/fish/render.mjs --head 1      # 頭の拡大
node tools/models/fish/render.mjs --photo --out public/data/photos   # 図鑑の静止画像
```

| 種 | 4 方向 |
|---|---|
| スズキ | ![](suzuki.jpg) |
| メジナ | ![](mejina.jpg) |
| シロギス | ![](kisu.jpg) |
| マゴチ | ![](magochi.jpg) |
| ヒラメ（上から見たのが「側面」） | ![](hirame.jpg) |
| ボラ（成魚） | ![](bora.jpg) |
| サッパ | ![](sappa.jpg) |
| コノシロ | ![](konoshiro.jpg) |
| イシモチ | ![](ishimochi.jpg) |

容量は [容量予算](../../quality/model-budget.md) の §5。
