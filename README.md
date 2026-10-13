# 干潟図鑑 (Higata Zukan)

現実の潮汐と連動する干潟を探索し、実物に近い 3D 生物を観察・採集・飼育して図鑑を完成させる Web ゲーム（Three.js + TypeScript）。

## 開発

```bash
npm install
npm run dev          # http://localhost:5173/gerupamasini/
npm run check        # 型検査 + 単体テスト + データ検証
npm run build        # dist/ を生成（GitHub Pages 用のベースパス /gerupamasini/）
npm run smoke:progression # ビルド後、水槽・ろ過装置のショップ、飼育上限、導入クエストをブラウザで検証
npm run smoke        # ヘッドレス Chromium で起動し tests/smoke/out/ にスクリーンショット
node tests/smoke/pagurus-lab.mjs     # ユビナガホンヤドカリのラボを撮影（tests/smoke/out/pagurus-*.png）
CHROMIUM_PATH=/usr/bin/chromium node tests/smoke/aquarium.mjs # 水槽設備・ガチャ・自動配線・保存復元のブラウザ検証
node tests/smoke/goby-translucency.mjs  # ハゼ 3 種の体の透け（観察の体積シェーダーと、干潟・水槽の全段階の透け）を順光・逆光で撮影
CHROMIUM_PATH=/usr/bin/chromium node tests/smoke/aquarium-water.mjs # 水槽の水の描画（4 つの画質・底床・水中視点）
node tests/smoke/physics.mjs         # 生きものの物理（重ならない・接地・波の揺れ）をゲーム内で確認（tests/smoke/out/physics-*.png）
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
npm run render:akaei  # アカエイ（5 つの行動・腹面・LOD）の画像を再生成（docs/models/akaei/）
npm run render:ishigarei # イシガレイの文書画像を再生成（docs/models/ishigarei/）
npm run render:mimiika   # ミミイカ（7 状態・体色・LOD）の画像を再生成（docs/models/mimiika/）
npm run render:sand-dust # 砂煙（アカエイ・イシガレイ・ミミイカ）の画像を再生成（docs/creatures/sand-dust/）
npm run terrain:bake # 地形 PNG の再生成
npm run terrain:manko      # 漫湖（70 m × 70 m）の泥干潟と浅い澪筋を再生成
npm run terrain:hashirimizu # 走水マップの地形 PNG と文書の図（docs/maps/hashirimizu/）を再生成
```

ローカルや別ホストでは `VITE_BASE=/ npm run build` のようにベースパスを変えられます。

波打ち際ラボは `surf-lab.html`（開発時は http://localhost:5173/gerupamasini/surf-lab.html）。急な前浜・砂州・岩場のある浜で、潮位・波高・周期・波向・時刻・画質・デバッグ表示（区分・泡の種類・位相）と視点を切り替え、寄せ波・砕波・遡上・引き波・濡れた砂を確かめられます。`node tests/smoke/surf-lab.mjs` で各視点の連番、`node tests/smoke/surf.mjs` で走水の画、`node tests/smoke/surf-trace.mjs` で歩いて振り返るときの砂の跡、`node tests/smoke/surf-perf.mjs` で画質ごとの負荷。

ユビナガホンヤドカリ単体のラボは `hermit-lab.html`（開発時は http://localhost:5173/gerupamasini/hermit-lab.html）。
殻の種類、LOD、水、デバッグ表示を切り替え、脅かす・餌・空き殻を試せます。`?mode=guard` で繁殖期の交尾前ガード、`?mode=naked` で殻から出した体（`&stage=dark` で写真と同じ黒い撮影台）、`?mode=retract` で殻に閉じこもる様子を見られます。

## 文書
- [水槽・ろ過装置のショップと導入クエスト](docs/aquarium-progression/README.md) CRでの解放・Lv.5までの強化、最大20匹の飼育、9件のクエストとスマホ画面写真。
- [生きものの物理](docs/creatures/physics.md) 全種共通の物理層（`src/creatures/physics/`）。生きもの同士が重ならないように押し分ける接触、体の足場の面に沿って寝かせる接地（ハゼ類・アサリ類）、うねりと寄せ波で小さな魚を前後に運んで揺らす水の動き。
- [砂煙](docs/creatures/sand-dust.md) 魚やエイが舞い上げる砂（`src/creatures/fx/SandDust.ts`）。全種共通の 1 回の描画で、膨らんでゆっくり沈みうねりで揺れる泥の雲・すぐ落ちる砂粒・漂う墨。底質で色と量が変わり、画質で間引く。いまはアカエイ・イシガレイ・ミミイカ。
- [ヤエヤマヒルギ](docs/models/yaeyama-hirugi/README.md) 成木5樹形・幼木3サイズ、支柱根の衝突判定、潮汐の湿潤材質、群生の共有Geometry／LOD。ビューアは `reference/yaeyama-hirugi-viewer/`、画像・ブラウザー検証は `npm run render:yaeyama-hirugi`。
- `docs/models/aquarium/` 水槽基本設備20種、共通材質、LOD、設備コレクション・専用チケットガチャ・自動配線（自宅 → 水槽 → 設備 / ガチャ）
- [ホームの水槽の水・光・底床の描画](docs/models/aquarium/water.md) 専用 HDR パイプライン（屈折・水面の裏の全反射・側面ガラスの鏡・吸収と散乱・影の入る光の筋・コースティクス・ブルーム）、起伏と断面のある底床、作り直した飾り、画質設定ごとの負荷と動的解像度。確認は `node tests/smoke/aquarium-water.mjs`
- [スマホ・タブレットの操作と画面写真](docs/mobile/README.md) ホーム・水槽編集・ガチャ・干潟の移動／採集／観察、縦横画面の確認手順
- `docs/spec/` 仕様書 4 本（ゲームと MVP、アーキテクチャとデータ、生物 AI とモデル、潮位・セーブ・進行）
- `docs/planning/` 設計質問と回答、マハゼモデル監査
- `docs/TESTING.md` 身内テスト手順
- `docs/models/` マハゼモデルの説明、`docs/models/nets/` タモ網 6 種の調査・設計・使い方（ゲームでは `NetView` と `ToolShelf` がこの GLB を使う）
- `docs/models/oyster/` マガキの調査・設計（個体差の seed、殻の層、LOD、群生と牡蠣礁の大量配置、行動、ゲームへの統合）
- `docs/models/` マハゼモデルの説明
- `docs/creatures/yubinagahonyadokari/` ユビナガホンヤドカリ（*Pagurus minutus*）の調査、実写資料の分析、技術設計、科学的検証
- `docs/models/amamo/` アマモ場（株・群落・水中の揺れ・潮の干満）の調査・設計・使い方（ゲームでは `World` の `AmamoMeadow`、ビューアは `reference/amamo-viewer/`）
- [漫湖マップ](docs/maps/manko.md) 沖縄から選べる70 m × 70 mの泥干潟。マングローブ林と浅い澪筋。いきもの・建物なし。潮汐はゲーム用の仮設定。
- [波打ち際](docs/research/surf/README.md) 砕波・白波・遡上・引き波・濡れた砂の調査と設計（地形と潮位から砕波帯を自動計算、不規則波、浅水変形、砕波指標と砕波形式、段波、遡上と引き波、泡 4 種、砂の記憶、巻き波の波頭、GPU 飛沫、LOD と画質、負荷）
- `docs/maps/hashirimizu/` 走水海岸〜観音崎マップ（一定の緩斜面、潮干狩り帯、胴長で入るアマモ場、生息環境のホットスポット、新しい 5 種。ビューアは `reference/shore-viewer/`）
- `docs/models/himehaze/` ヒメハゼ（*Favonigobius gymnauchen*）の調査・設計（写真 70 枚の計測、鰭・体色・模様、リグ、繁殖期の雄。GLB はマハゼのパイプライン `tools/models/himehaze/` で生成し、ゲームではマハゼのドライバで動く）
- `docs/models/haku/` ハク（ボラの稚魚）の調査・設計（写真との照合、群れの 5 状態、一斉逃避、LOD 3 段、接地影。ビューアは `reference/haku-viewer/`）
- `docs/creatures/isosujiebi/` イソスジエビ（*Palaemon pacificus*）の調査とシラタエビとの差分一覧（共有エビモデルの種プロファイル `isosuji.js`、行動 AI `IsosujiBrain.js`。岩礁の潮だまりとアマモ場のビューアは `reference/isosuji-viewer/`、`?species=shirata` で元のシラタエビと見比べられる）
- `docs/models/amimehagi/` アミメハギ（*Rudarius ercodes*）の調査・設計（写真 70 枚との照合、側扁した菱形の体・網目模様・第一背鰭棘、背鰭と臀鰭の波による定位と移動、アマモ場での 5 状態、葉を押しのける連携、LOD 3 段。ビューアは `reference/amimehagi-viewer/`）
- `docs/models/youjiuo/` ヨウジウオの調査・設計（体輪と骨板、筒状の吻、背鰭推進、アマモに沿う擬態と尾のかけ方、ピボット摂餌、草陰への逃避、LOD 3 段。ビューアは `reference/youjiuo-viewer/`、静止画は `node tools/models/youjiuo/render.mjs`、ゲーム内は `node tests/smoke/youjiuo.mjs`）
- `docs/models/aramushiro/` アラムシロ（*Reticunassa festiva*）の調査・設計（写真 50 枚と文献、対数螺旋の殻と粒の格子・厚い外唇・滑層・前溝、半透明の足と触角・水管・吻・蓋、6 状態の行動、腐肉と匂いの流れ、這い跡と潜砂の盛り上がり、LOD 3 段。ビューアは `reference/aramushiro-viewer/`、静止画は `node tools/models/aramushiro/render.mjs`、ゲーム内は `node tests/smoke/aramushiro.mjs`）
- `docs/models/ishigarei/` イシガレイ（*Platichthys bicoloratus*）若魚の調査・設計（写真 70 枚との照合、右眼側の左右非対称な頭部と三日月形の瞳孔、厚い唇の端位口、砂粒状の擬態模様、底に伏せる・潜砂・底すれすれの遊泳・摂餌・逃避の 5 状態、LOD 3 段。ビューアは `reference/ishigarei-viewer/`、静止画は `npm run render:ishigarei`、ゲーム内は `node tests/smoke/ishigarei.mjs`）
- `docs/models/mimiika/` ミミイカ（*Euprymna morsei*）の調査・設計（写真 70 枚との照合、丸い外套膜・耳状のヒレ・頭から張り出した眼球（頭に固定したまぶたの開口、角膜の泡、銀の虹彩と昼の細い瞳孔）・外套膜の縁の下から出る太い漏斗・吸盤のある腕と収納式の触腕、写真を測った色の 3 組の色素胞（銅色のモザイク・黒褐の点・黄と金の網目）と虹色素胞・半透明の体と透ける内臓のシェーダー、REST／HOVER／SWIM／CRAWL／BURROW／HUNT／ESCAPE の 7 状態（ヒレの波とジェット、漏斗で砂を吹き腕で頭に砂をかける潜砂、アミへの触腕、墨と後退ジェット）、LOD 3 段。ビューアは `reference/mimiika-viewer/`、静止画は `npm run render:mimiika`、ゲーム内は `node tests/smoke/mimiika.mjs`）
- `docs/models/akaei/` アカエイの調査・設計（体盤・眼・噴水孔・腹側の口と鰓孔・尾棘、格子ボーンの波打ち遊泳、砂潜り・摂餌・逃避、LOD、ゲームへの統合）

## データ駆動
生物は `public/data/species/*.json`、行動ツリーは `public/data/behaviors/*.json`、地図は `public/data/maps/`、潮位観測点は `public/data/tide/stations/` に置き、`npm run data:validate` で検証します。種の追加はデータと `src/assets/models/<種>/` のモデル追加だけで済み、固有ドライバが必要な場合のみ `src/creatures/drivers/index.ts` に登録します。
