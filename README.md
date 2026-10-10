# 干潟図鑑 (Higata Zukan)

現実の潮汐と連動する干潟を探索し、実物に近い 3D 生物を観察・採集・飼育して図鑑を完成させる Web ゲーム（Three.js + TypeScript）。

## 開発

```bash
npm install
npm run dev          # http://localhost:5173/gerupamasini/
npm run check        # 型検査 + 単体テスト + データ検証
npm run build        # dist/ を生成（GitHub Pages 用のベースパス /gerupamasini/）
npm run smoke        # ヘッドレス Chromium で起動し tests/smoke/out/ にスクリーンショット
node tests/smoke/pagurus-lab.mjs     # ユビナガホンヤドカリのラボを撮影（tests/smoke/out/pagurus-*.png）
npm run model:mahaze -- --tier lod2   # マハゼモデルの再生成（hero / lod1 / lod2）
npm run model:edohaze -- --tier hero  # エドハゼモデルの再生成（hero / lod1 / lod2）
npm run model:edohaze-gravid -- --tier hero   # エドハゼの抱卵雌（edohaze_gravid.*.glb）
npm run model:himehaze -- --tier hero  # ヒメハゼモデルの再生成（hero / lod1 / lod2）
npm run model:himehaze-male -- --tier hero   # ヒメハゼの繁殖期の雄（himehaze_male.*.glb）
npm run model:nets   # タモ網 6 種の GLB を再生成（docs/models/nets/）
npm run render:oyster # マガキ（個体・群生・牡蠣礁）の画像を再生成（docs/models/oyster/）
npm run model:pagurus-hide            # ユビナガホンヤドカリの「殻に閉じこもる姿勢」の表を再生成（形態・殻を変えたあと）
npm run render:amamo # アマモの文書画像を再生成（docs/models/amamo/）
npm run render:amimehagi # アミメハギの文書画像を再生成（docs/models/amimehagi/）
npm run render:youjiuo # ヨウジウオの文書画像を再生成（docs/models/youjiuo/）
npm run render:aramushiro # アラムシロの文書画像を再生成（docs/models/aramushiro/）
npm run terrain:bake # 地形 PNG の再生成
npm run terrain:hashirimizu # 走水マップの地形 PNG と文書の図（docs/maps/hashirimizu/）を再生成
```

ローカルや別ホストでは `VITE_BASE=/ npm run build` のようにベースパスを変えられます。

ユビナガホンヤドカリ単体のラボは `hermit-lab.html`（開発時は http://localhost:5173/gerupamasini/hermit-lab.html）。
殻の種類、LOD、水、デバッグ表示を切り替え、脅かす・餌・空き殻を試せます。`?mode=guard` で繁殖期の交尾前ガード、`?mode=naked` で殻から出した体（`&stage=dark` で写真と同じ黒い撮影台）、`?mode=retract` で殻に閉じこもる様子を見られます。

## 文書
- `docs/spec/` 仕様書 4 本（ゲームと MVP、アーキテクチャとデータ、生物 AI とモデル、潮位・セーブ・進行）
- `docs/planning/` 設計質問と回答、マハゼモデル監査
- `docs/TESTING.md` 身内テスト手順
- `docs/models/` マハゼモデルの説明、`docs/models/nets/` タモ網 6 種の調査・設計・使い方（ゲームでは `NetView` と `ToolShelf` がこの GLB を使う）
- `docs/models/oyster/` マガキの調査・設計（個体差の seed、殻の層、LOD、群生と牡蠣礁の大量配置、行動、ゲームへの統合）
- `docs/models/` マハゼモデルの説明
- `docs/creatures/yubinagahonyadokari/` ユビナガホンヤドカリ（*Pagurus minutus*）の調査、実写資料の分析、技術設計、科学的検証
- `docs/models/amamo/` アマモ場（株・群落・水中の揺れ・潮の干満）の調査・設計・使い方（ゲームでは `World` の `AmamoMeadow`、ビューアは `reference/amamo-viewer/`）
- `docs/maps/hashirimizu/` 走水海岸〜観音崎マップ（一定の緩斜面、潮干狩り帯、胴長で入るアマモ場、生息環境のホットスポット、新しい 5 種。ビューアは `reference/shore-viewer/`）
- `docs/models/himehaze/` ヒメハゼ（*Favonigobius gymnauchen*）の調査・設計（写真 70 枚の計測、鰭・体色・模様、リグ、繁殖期の雄。GLB はマハゼのパイプライン `tools/models/himehaze/` で生成し、ゲームではマハゼのドライバで動く）
- `docs/models/haku/` ハク（ボラの稚魚）の調査・設計（写真との照合、群れの 5 状態、一斉逃避、LOD 3 段、接地影。ビューアは `reference/haku-viewer/`）
- `docs/creatures/isosujiebi/` イソスジエビ（*Palaemon pacificus*）の調査とシラタエビとの差分一覧（共有エビモデルの種プロファイル `isosuji.js`、行動 AI `IsosujiBrain.js`。岩礁の潮だまりとアマモ場のビューアは `reference/isosuji-viewer/`、`?species=shirata` で元のシラタエビと見比べられる）
- `docs/models/amimehagi/` アミメハギ（*Rudarius ercodes*）の調査・設計（写真 70 枚との照合、側扁した菱形の体・網目模様・第一背鰭棘、背鰭と臀鰭の波による定位と移動、アマモ場での 5 状態、葉を押しのける連携、LOD 3 段。ビューアは `reference/amimehagi-viewer/`）
- `docs/models/youjiuo/` ヨウジウオの調査・設計（体輪と骨板、筒状の吻、背鰭推進、アマモに沿う擬態と尾のかけ方、ピボット摂餌、草陰への逃避、LOD 3 段。ビューアは `reference/youjiuo-viewer/`、静止画は `node tools/models/youjiuo/render.mjs`、ゲーム内は `node tests/smoke/youjiuo.mjs`）
- `docs/models/aramushiro/` アラムシロ（*Reticunassa festiva*）の調査・設計（写真 50 枚と文献、対数螺旋の殻と粒の格子・厚い外唇・滑層・前溝、半透明の足と触角・水管・吻・蓋、6 状態の行動、腐肉と匂いの流れ、這い跡と潜砂の盛り上がり、LOD 3 段。ビューアは `reference/aramushiro-viewer/`、静止画は `node tools/models/aramushiro/render.mjs`、ゲーム内は `node tests/smoke/aramushiro.mjs`）

## データ駆動
生物は `public/data/species/*.json`、行動ツリーは `public/data/behaviors/*.json`、地図は `public/data/maps/`、潮位観測点は `public/data/tide/stations/` に置き、`npm run data:validate` で検証します。種の追加はデータと `src/assets/models/<種>/` のモデル追加だけで済み、固有ドライバが必要な場合のみ `src/creatures/drivers/index.ts` に登録します。
