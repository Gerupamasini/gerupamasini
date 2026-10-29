# 沿岸の魚の写真の皮膚

沿岸の魚（`src/creatures/fish/`）の近い 2 段階（LOD0・LOD1）に貼る、実物の標本の写真。遠景（LOD2）は手続きの皮膚のまま（ここからは何も読まない）。

| ファイル | 大きさ | 中身 |
|---|---|---|
| `<種>.body.jpg` | 1024 × 512 | 本体のテクスチャの並び（横が体の前後 `bodyU`、縦が体の周り φ。左右の体側に同じ写真） |
| `<種>.fins.jpg` | 256 × 384 | ひれのアトラスの並び（背びれ 1・背びれ 2・しりびれ・尾びれ・胸びれ・腹びれの 6 段） |
| `<種>.eye.jpg` | 128 × 128 | 眼の円盤（虹彩と眼のまわり。瞳孔は描き直す） |

色だけを写真から取り、金属感（銀）・粗さ・粘液・透け・頭のつくりの法線は手続きのまま。鱗の凹凸は写真の細かな明暗から作る（`paint.ts` の `highPass`）。ヒラメの無眼側、マゴチは写真がなく手続き。

## 出典

すべて ffish.asia / floraZia.com の写真測量の標本（Sketchfab、**CC0 1.0 パブリックドメイン**）。使ったのは各モデルの公開されているプレビュー画像（横から）。クレジットは不要だが記録しておく。

| 種 | 標本 | Sketchfab |
|---|---|---|
| スズキ | CC0 スズキ ♂ Japanese Seabass, *Lateolabrax japonicus* | [158f9d97574a4de8a9a1575a562d750d](https://sketchfab.com/3d-models/158f9d97574a4de8a9a1575a562d750d) |
| メジナ | CC0 メジナ Largescale Blackfish, *Girella punctata* | [b91832f1336d4ad380946d50f9537735](https://sketchfab.com/3d-models/b91832f1336d4ad380946d50f9537735) |
| シロギス | CC0 シロギス ♀ Japanese Whiting, *Sillago japonica* | [c747cc9d14494a588e8a526e0da1336c](https://sketchfab.com/3d-models/c747cc9d14494a588e8a526e0da1336c) |
| ヒラメ | CC0 ヒラメ Bastard Halibut, *Paralichthys olivaceus* | [abaafcb174bc44f1a0206e267925bc8f](https://sketchfab.com/3d-models/abaafcb174bc44f1a0206e267925bc8f) |
| ボラ | CC0 ボラ ♂ Flathead Mullet, *Mugil cephalus* | [f95a53553ed64737ac83ec43fde0e75b](https://sketchfab.com/3d-models/f95a53553ed64737ac83ec43fde0e75b) |
| サッパ | CC0 カタボシイワシ Bali Sardinella, *Sardinella lemuru*（同属の別種。サッパの標本がない） | [7d9b949777c143858ca178e82bee45c3](https://sketchfab.com/3d-models/7d9b949777c143858ca178e82bee45c3) |
| コノシロ | CC0 コノシロ Dotted Gizzard Shad, *Konosirus punctatus* | [14d96a8cc77948a29abbbe4b9f0648e6](https://sketchfab.com/3d-models/14d96a8cc77948a29abbbe4b9f0648e6) |
| イシモチ | CC0 シログチ・イシモチ ♂ Silver Croaker, *Pennahia argentata* | [8c48fef7b022405a9a98a48ef9b53720](https://sketchfab.com/3d-models/8c48fef7b022405a9a98a48ef9b53720) |

作り方は `tools/models/fish/photo/README.md`。ライセンスが CC0・CC BY 以外の写真（CC BY-NC など）はここに置かない（Steam 版は商用）。
