# トビハゼ（*Periophthalmus modestus*）— 泥の上を胸びれで這い、跳ねるハゼ

内湾・河口の干潟の上のほうにすむハゼ（ハゼ科トビハゼ亜科）。図鑑の種は `periophthalmus_modestus`、全長 2〜10 cm（モデルは全長 80 mm で作り、個体の長さに合わせて縮める）。東京湾が分布の北の端で、ゲームでは葛西（東なぎさ）の土手寄りの泥・砂泥の上部にだけ出る。陸の上で暮らす魚なので、ほかの魚と違って `aquatic: false`（水に引き戻されない）、`locomotion: "walk"`。

- モデルの組み立て: `tools/models/tobihaze/`（`build.mjs` が段階ごとの GLB を書く。形 `head.mjs`・`body.mjs`・`fins.mjs`、骨格と重み `rig.mjs`・`skull.mjs`・`headrig.mjs`、表情の形 `headmorphs.mjs`、眼 `eyemesh.mjs`・`eye.mjs`・`iris.mjs`、歯 `teeth.mjs`、段階のメッシュ `fishmesh.mjs`・`tiers.mjs`・`transfer.mjs`、テクスチャ `textures.mjs`（模様 `pattern.mjs`、凹凸と濡れ `surface.mjs`、ひれ `finatlas.mjs`）。図鑑のクリップは `clips.mjs`）
- ゲーム側: `src/creatures/species/tobihaze/`（`behavior.ts` 11 状態と移動の計画、`pose.js` 状態から関節・表情の形へ、`TobihazeDriver.ts` ドライバ、`material.ts` 実行時の材質）。登録は `src/creatures/drivers/index.ts` の `tobihaze`
- データ: `public/data/species/periophthalmus_modestus.json`、行動ツリー `public/data/behaviors/mudskipper_flat.json`、図鑑の静止画像 `public/data/photos/periophthalmus_modestus.jpg`
- 確認用ビューア: `reference/tobihaze-viewer/`（`npm run dev` → `/gerupamasini/reference/tobihaze-viewer/index.html?model=<GLB の URL>`。正面・側面・背面・斜め前・顔の接写、クレイと質感、写真光・ゲームの昼・図鑑の光）
- テスト: `tests/unit/tobihaze.test.ts`（データ、行動ツリー、葛西のどこに出るか、GLB の関節・接地点・表情の形・材質、予算）、`tests/unit/tobihazeBehavior.test.ts`（11 状態と滑らない這い方）、`tests/unit/tobihazePose.test.ts`（姿勢）、ブラウザは `node tests/smoke/tobihaze.mjs`

## 1. 作り方

```bash
npm run model:tobihaze                  # 3 段階を tools/models/tobihaze/out/tiers/ に（--tier hero|lod1|lod2、--cache <file> で観察用の重い計算を使い回す）
npm run model:tobihaze-ship             # 図鑑のクリップを焼いて src/assets/models/tobihaze/ へ置き、圧縮（models:pack -- tobihaze）
npm run models:budget                   # 予算の照合（tobihaze/… の 3 行と、葛西の遠景の合計）
```

- `build.mjs` は観察用（hero）の細かい形・骨格の重み・表情の形を一度だけ計算し（数分。`--cache` でファイルに残せる）、近景（lod1）と遠景（lod2）はそこから軽い形に移して、表情の形を自分の皮膚で解き直す。出力は `tools/models/tobihaze/out/tiers/` の 3 つの GLB と、基準の姿勢（`states.json`）、記録（`build-report.json`）。`out/` は git に入れない。
- 体の姿勢は T3（e6079e5、2026-10-21 のビルド）の値に固定してある（`poselock.mjs`、値は `poselock.json`）。姿勢は皮膚の最も低い頂点で地面を決めて解くので、頭だけを変えても体のメッシュの引き直しで動いてしまう（2026-10-25 の眼と唇の作り直しで rest の胸びれが 4.8°、lod1 の這う周期が 5.8°、移り方の `lift` が 1° 動いた）。`build.mjs` はいつもどおり解いたあと、頭の関節（`J_head`、口・喉・頬・鰓蓋・上顎の関節、`J_eyeL/R`）を除くすべての関節の値と、ひれの形の重み（腹びれの押しつけの組も）を固定の値に置き換える。対象は hero の基準の姿勢 5 つ・持ち上げ 13 段・移り方の `lift`（その途中の姿勢はこれから出る）と、3 段階それぞれの這う周期（固定点 `contacts.weld` ごと）で、lod1・lod2 の基準の姿勢・持ち上げ・移り方は hero のものを移すので同じになる。新しいメッシュで測り直すのは、地面の高さ（`groundMM`。解いたときと同じ規則の `rig.groundUnder`、`contactsFor`、`armClearance`）と接地点（`contacts`）だけ。解き直したらどれだけ動いていたかは `build-report.json` の `poseLock`。体・ひれ・骨格を作り直すときだけ `--no-pose-lock` で解き直し、`node tools/models/tobihaze/poselock.mjs --from-dir <その tiers>` で書き直す。
- lod1・lod2 の皮膚の三角形も、眼と口の範囲（`decimlock.mjs` の `FREE_ZONES`）の外は T3 のまま（`decimationlock.json`: T3 の三角形と、細かいメッシュの 1 mm 区画ごとの指紋）。皮膚は領域ごとにまとめて簡略化するので（lod1 は頭 s < 1.32 HL と胴、lod2 は全体で 1 つ）、眼や唇だけを変えても頭全体（lod2 は尾まで）が引き直されていた。`tiers.mjs` の `frozenPlan` が、範囲の外で彫刻の変わっていない所の T3 の三角形をそのまま残し、残りだけを T3 と同じ数に簡略化して縁でつなぐ。何を残したかは `build-report.json` の `decimationLock`。体を作り直すときは `--no-decimation-lock` で簡略化し直し、`node tools/models/tobihaze/decimlock.mjs --from-dir <その tiers> --dense-tree <そのソース>` で書き直す。hero は固定しない（頭の領域 45,000 三角形は頭を変えるたびに引き直される。胴の領域は変わらない）。
- 眼や口を変えたときに変わってよい値: 接地点の `chin`・`throat`（頭の皮膚の点。骨の座標と地面からの高さ）、hero の皮膚の分け方（§2）、lod1・lod2 の眼と口の範囲（縁の外 1 mm まで。範囲の縁にかかる T3 の三角形をつなぎ直すため）と、彫刻が範囲の外でも変わった区画の三角形。体の姿勢は固定なので変わらず、地面の高さも、あごが今より下がって腹・腹びれ・尾より低くならないかぎり変わらない（2026-10-25 のビルドで全段階・全状態とも、あごと喉が地面から 0.35 mm 以上上。いちばん近いのは rest の lod1 で喉 0.35 mm・あご 0.60 mm。上唇を下顎の前へ垂らした段階で下顎の下面が上がり、あごの点は 9977d95 より約 0.2〜0.3 mm 上がった。rest の地面は頭の下も候補）。
- ゲームが読むのは `src/assets/models/tobihaze/tobihaze.{hero,lod1,lod2}.glb`（元）とその圧縮版（`src/assets/models-packed/tobihaze/`）。hero と lod1 には `clips.mjs` が実行時の姿勢の関数（`pose.js`）を時間で取り出して焼いたクリップ（`Idle`・`Crawl`・`Swim`・`Display`）を足す。図鑑のプレビュー（画質「低」は lod1）と図鑑の静止画像（`tools/photos/capture-one.mjs`）が使う。lod2 は動きを焼かない（干潟ではドライバが姿勢を作る）。
- GLB はメートル、+X が魚の左、+Y が背、+Z が頭の向き。原点は全長の真ん中（`anatomy.mjs` の `toObject`）。骨の初期の回転はすべて単位（回転の軸がそのまま物体の軸）。

## 2. 段階（LOD）

`npm run models:budget` の値（圧縮版、2026-10-25、眼の形と唇の重なりを直した段階）。区分は M（全長 120 mm まで）。hero と lod1 のダウンロードは図鑑のクリップ（Idle・Crawl・Swim・Display、各段階 0.17 MB）を含む。

| 段階 | 三角形 | テクスチャ | ダウンロード | GPU | マテリアル | 描画 | 関節 |
|---|---|---|---|---|---|---|---|
| hero（観察・水槽） | 119,084 | 4 枚・2048 | 15.43 MB | 18.18 MB | 4 | 12 | 33 |
| lod1（近景） | 13,686 | 4 枚・1024 | 2.49 MB | 2.45 MB | 3 | 5 | 26 |
| lod2（遠景） | 1,276 | 2 枚・256 | 0.22 MB | 0.17 MB | 2 | 2 | 12 |

- hero: 皮膚は表情の形の組で 4 つ（`Head_Orbit` まぶた代わりの眼の沈み・眼の持ち上げ・頬 16,594 三角形、`Head_Mouth` 口・喉・頬 4,576、`Head` 喉・頬 20,322、`Body` 動かない胴と歯 36,606）。分け方はビルドごとに形の動く範囲から `headmorphs.mjs` の `splitByMorphs` が決め、`build-report.json` の `headSplit` に出る（9977d95 では口の形の範囲が広がって `Head` が `Head_Mouth` に入り 3 つ・描画 11 だったが、2026-10-25 の唇では T3 と同じ 4 つ・描画 12 に戻った）。表情の形のテクスチャは `Head_Orbit` 1.97 / 2.36 / 3.15 MB、`Head_Mouth` 0.66 / 0.46 / 0.46 MB、`Head` 1.18 / 1.18 / 1.57 MB（4096 / 8192 / 16384 行。T3 の 3 つは計 4.19 / 4.13 / 5.31 MB）、ひれと合わせて 11.35 / 12.60 / 13.65 MB で、GPU の合計は 32.3 / 33.5 / 34.6 MB（予算 40 MB。`build-report.json` の `gpu`）。描画は 12、太陽の影の描画は 10。眼は左右 1 つずつ（`Eye_L`・`Eye_R`、眼の関節の子）、ひれは 2 つ（`Fins_Median` 背びれ・臀びれ・尾びれ、`Fins_Paired` 胸びれ・腹びれ）で、それぞれ半透明の膜と不透明な部分（尾びれの付け根の肉、ひれの根元）。
- lod1: 皮膚 1 つ（`Body` 8,896 三角形、まばたき・眼の持ち上げ・喉・頬の形）、眼 2 つ（各 704。2026-10-25 に窓の縁の列を 16 から 32 にして窓の輪郭の角を取った。T3 は各 352）、ひれ 1 つ（3,382、半透明。尾びれの付け根は不透明の値でインデックスの最後）。描画 5、GPU の合計は表情の形のテクスチャ 2.53 / 2.99 / 2.41 MB を足して 5.33 / 5.79 / 5.22 MB（予算 6 MB）。
- lod2: 皮膚 1 つ（眼は休んだ位置で一体、警戒の形 `alert`）、ひれ 1 つ（ひれごとの板。アルファテスト）。胸びれは関節 1 つ（`J_pecL/R`）で、畳む・広げる・巻く・つくの形は板の形で持つ。
- 葛西の遠景の合計（その地図に出る全種の lod2）は 7.9 MB・GPU 1.2 MB（予算 8 MB・16 MB）。トビハゼの lod2 を足して残りは約 0.1 MB。遠景に別の形（雄や幼魚の別モデル）を増やすと予算を超える。
- 画質ごと（`src/core/Settings.ts`）: 超軽量は lod2 だけ（水槽・ケースも lod2、図鑑は静止画像）、低は近い 2 体まで lod1・観察は hero、中・高・最高は近い 4・6・8 体まで lod1・観察と水槽で hero。数は `creatureScale` で 0.35〜1 倍、描画距離は `viewScale`（全長 62 mm の平均で約 25 m）。タッチ端末も同じ段階を使う。

## 3. 骨格（リグ）

関節は hero 33、lod1 26、lod2 12（`budget.json` の M 区分は 96・32・12）。名前と各段階の組は GLB の根の extras `tobihaze.joints`、回し方は `tobihaze.axes`。

| 部位 | 関節 | 段階 |
|---|---|---|
| 体軸 | `J_root`（体の向き）、`J_sp1`〜`J_sp7`、`J_caudal`（尾びれの付け根）、`J_caudal2`・`J_caudal3`（尾びれの中） | lod2 は `J_caudal` まで、lod1 は `J_caudal2` まで |
| 頭 | `J_head`、`J_jaw`（下顎）、`J_hyoid`（喉）、`J_suspL/R`（頬）、`J_opercL/R`（鰓蓋）、`J_premax`・`J_maxL/R`・`J_imj`（上顎と下顎の中の関節） | lod2 は `J_head` だけ、lod1 は上顎の 4 つがない |
| 眼 | `J_eyeL/R`（平行移動だけ: 持ち上げ・沈み。向きは眼のメッシュを回す） | hero・lod1 |
| 胸びれ | `J_pecL/R`（肩）、`J_pecFinL/R`（肉質の柄とひれの境）、`J_pecMidL/R`（ひれの中ほど）、`J_pecTipL/R`（先） | lod2 は肩だけ、lod1 は先がない |
| 腹びれ | `J_pelvic` | hero・lod1 |

- 椎骨は 26（腹椎 10・尾椎 16）。前の体は硬く、這うときは体の中ほどと尾だけが小さく曲がり、跳ぶ前は尾を体の横へ J 字に畳む（最も強く曲がるのは全長の 3 分の 2 あたり）。関節の位置はこの曲がり方に合わせてある（`rig.mjs` の冒頭）。
- 胸びれは筋肉質の柄 1 本と、その先のひれ。柄の付け根（肩）は 4 つの回転（`swing`・`protraction`・`depression`・`twist`）を決まった順に重ね、組み合わせの限界（`coupled`）がある。ひれは陸では巻いて（`furl`）先を泥につき、水中では広げる（`spread`）。
- 眼: 頭の上の突き出た眼は左右別々に、`axes.eyes` の `gaze`（上下 −32〜48°、前後 −28〜92°）で回る。まばたきは眼を眼窩へ沈めること（`blinkL/R`: 沈みが 0.10 HL で 1）、警戒では持ち上げる（`eyesUpL/R`: 0.08 HL で 1）。眼の皮膚の帽は眼といっしょに回り、角膜の窓だけが裸。
- 表情の形（名前で引く。段階ごとに並びが違うので番号では引かない）: `gape`・`gum`（口を開ける、hero）、`throat`（喉の上下・頬の膨らみ）、`inflate`・`inflateMid`（頬をふくらませる、`inflateMid` は 4w(1−w)）、`blinkL/R`、`eyesUpL/R`。ひれは `<形>_<ひれ>`（`fold`・`spread`、尾びれの `flex`、胸びれの `furl`・`plant`・`plantMid`、腹びれの `press` の仲間）。駆動の式は extras `tobihaze.morphs`。

## 4. 基準の姿勢、這う周期、接地点

GLB の根の extras（`tobihaze.states`・`crawl`・`prop`・`transitions`・`contacts`）に、ビルド時に骨格で解いた姿勢が入っている。実行時の姿勢（`pose.js`）はこれを読むだけで、同じ式を二重に持たない。頭以外の関節とひれの重みは T3 の値に固定（`poselock.json`、§1）。

- 基準の姿勢 `land`（胸びれで前を 15° 持ち上げて体を支える）、`reach`（ひれを前へ伸ばす）、`rest`（腹ばいでひれを体に沿わせる）、`water`（水中でひれを広げる）、`swim`（泳ぐ）。それぞれ関節の回転・ひれの形・地面からの高さ（`groundMM`）。`prop` は持ち上げ 10〜25° の 13 段。`transitions` は姿勢の間の移り方（なめらかな補間に、ひれが地面をこすらないよう持ち上げる量 `lift` を足す）。
- 這う周期 `crawl`（`rig.mjs` の `crawlCycle`）: 左右の胸びれを同時につく松葉杖歩き。1 周期 0.5 s、1 歩 15 mm（全長 80 mm で 0.375 BL/s）、接地の割合 0.6。0〜0.6 が支え（ひれの先は泥の 1 点に留めたまま、体を持ち上げて 15 mm 前へ運び、腹びれと腹へ降ろす）、0.6〜1 がひれを弧で前へ戻す回復（体は動かない）。各こまの `contacts.weld` が泥に留めた点で、滑りの判定（1 支えに 0.1 mm 以内）はこれを使う。向きを変えるのは回復の間だけ（腹びれの接地点を軸に）。
- 接地点 `contacts`: 状態ごとに、あご・喉・腹・腹びれ・胸びれ・尾の点を骨の座標で持つ（その段階の関節に付け直してある）。ドライバはこれで泥の高さに体を置く。

## 5. 材質（濡れた PBR）

マテリアルは hero 4（`Tobihaze_Body`・`Tobihaze_Eye`・`Tobihaze_Fin`・`Tobihaze_FinOpaque`）、lod1 3（ひれの不透明な部分を別にしない）、lod2 2（`Tobihaze_Body` 色だけ、`Tobihaze_Fins` アルファテスト）。hero と lod1 は同じマテリアルの機能（マップの有無、透過、両面）で、シェーダーは同じ。lod2 が変えるのはひれの不透明化（アルファテスト）だけ。役割は `extras.tobihaze.role`（ハゼ 3 種の `extras.mahaze` ではないので、マハゼの観察用の材質は掛からない）。

- 皮膚: 色（A は興奮時の横帯の濃さ）、法線、膜のマップ（R 水膜＝クリアコート、G 粗さ、B 濡れの残り、A 環境光の遮り）。ビルドの値は「やや濡れた」状態（濡れ 0.65）。
- 実行時の値（`extras.tobihaze.runtime`、`material.ts` が個体ごとのユニフォームで動かす）: 濡れ（`wetness` 0〜1: 濡れた 粗さ 0.35・クリアコート 1、湿った 0.45、乾いた 0.6、泥をかぶった 0.7。水から出ると乾き、転がると戻る）、個体差（`tint`: 色相・彩度・明度・コントラスト）、興奮の横帯（`bars`）、婚姻色（`nuptial`）、暗化（`dark`）。眼の瞳の照り返し（`pupilGlow`: 青緑が標準、赤褐色など）。ひれは透けて日を通す（`translucency`、three.js の光の計算のあとに足す）、半透明の膜は深度を書いて描く（`blend.depthWrite`）。
- 数値の正本は GLB の extras。テクスチャの係（`tools/models/tobihaze/` の T3）が作り直したら、実行時のコードではなく extras が変わる。

## 6. 行動（11 状態）

状態は `behavior.ts`（描画を持たない状態機械）、姿勢は `pose.js`。脳（行動ツリー `mudskipper_flat`、エンジンの条件と行動だけを使う）が意図を出し、ドライバが魚のいる所の水深（`waterAt − heightAt`）で状態を選ぶ。

| 状態 | 入るとき（脳の意図と場所） | 図鑑の行動 id |
|---|---|---|
| IDLE | 陸で胸びれを立てて前を持ち上げた姿勢（短い `rest`、`display` `alert` の警戒: 止まって頭を上げ、両眼を相手に向ける）。水中の `rest` | `rest` |
| LAND_REST | 陸で長く休む（`rest`。腹ばいで胸びれを体に沿わせる。まばたき、喉の上下、ときどき転がって体を濡らす） | `rest`、`blink` |
| LAND_CRAWL | 陸の短い移動（`wander` 0.08〜0.45 m）。ひれの先を泥に留めたまま体を運ぶ | `crawl` |
| LAND_HOP | 陸の長い移動（`wander` 0.4〜1.4 m）。尾を J 字に畳んで地面を押し、体長の 1〜2 倍跳ぶ（空中は地面に触れない） | `hop` |
| FORAGE | `forage`。頭を下げて泥の上のえものに口を押し当てる | `forage` |
| BURROW | `burrow`（夜、上げ潮で水が届く前、ときどき短く）。巣穴に入ると見えず、網にも入らない | `burrow` |
| ESCAPE | `flee`（`param: "escape"`、割り込み）。跳ねを重ねて水か巣穴へ（脳の「まっすぐ離れる」目標は予備） | `escape` |
| WATER_ENTRY | 陸から水へ（`move_to_deeper` 2 cm の水へ。食べたあとに口の水を入れ替えに行く、乾いたとき）。逃げて水に届いたとき | `water_entry` |
| SWIM | 水中の移動（体の後ろ 3 分の 2 をくねらせる）。水槽・ケースは常に水中 | `swim` |
| SHALLOW_WATER | 浅い水（体高の約 1.2 倍まで）で `rest`・`forage`。眼だけを水面の上に出す | `shallow` |
| WATER_EXIT | 水から陸へ（`move_to_waterline`: 2 cm より深い水に浸かった 40 mm より大きい個体、上げ潮で水際を這い上がる） | `water_exit` |

- 頬をふくらませ背びれを立てるディスプレイ（`display` `inflate`、45 s に 1 回まで）は `display`。
- 行動ツリーの順: 逃げる → 夜は 85 % が巣穴へ（10〜30 分）→ 上げ潮で水が 3 cm 下まで来たら 2 割が巣穴へ → 2 cm より深い水からは水際へ（幼魚は潮だまりに残る）→ 警戒 → 陸の上（休む 36 %・這う 22 %・跳ぶ 8 %・採餌 20 %・水へ 6 %・ディスプレイ 4 %・短く巣穴へ 4 %）→ 水の中（40 mm より大きい個体は休む 45 %・採餌 15 %・陸へ 40 %、幼魚は 60・30・10 % で潮だまりに残る）。
- 図鑑の行動 id はドライバの出すイベントと同じ 12 個（`rest`・`crawl`・`hop`・`swim`・`shallow`・`forage`・`burrow`・`escape`・`water_entry`・`water_exit`・`display`・`blink`）。
- 巣穴（`burrows.ts` が場所を決め、`burrowLayer.ts` が泥に描く）: 自分の巣穴は Y 字で口が 2 つ（すみかの所に直径 2.4〜3.2 cm の口、8〜18 cm 先にもう 1 つ）、まわりにカニの穴が 2 つ（0.5〜1.8 m）。行き先の途中で見つけたカニの穴も足す（全部で 8 つまで）。どれも種の干出した泥の規則の底質（泥・砂泥・澪）の上だけで、砂・礫・石には掘らない（すみかが石の上なら 1.6 m 以内のいちばん近い泥、なければ巣穴なし）。場所はすみかの位置だけから決まる（その場所のもの）ので、同じ日に同じ個体が出直しても、同じ場所をすみかにする別の個体でも、同じ穴になる。状態機械の状態に入るので `serialize`/`restore` で引き継がれ、個体が群れにいるあいだ描かれ、いなくなると一緒に消える（そのときプレイヤーは遠いか、夜）。描くのは開けた干潟だけ（水槽・ケースには描かない）。口は地面（描かれた三角形と状態機械の高さの高いほう）の上に、1 回の描画で全個体の分をまとめて描く。頭から入るとき体の軸は口の真ん中を通り、見えなくなった個体は口の真下にいて、のぞくときは頭と胸が口の真ん中から出る。のぞくたびにも `burrow` を出す（隠れている間に観察を始めても記録できる）。

## 7. 出る場所（葛西のみ）

規則は水位に対する高さ（`depth_m`）でしか書けないので、「上部の泥」を次のように表す（`tests/unit/tobihaze.test.ts` が実際の葛西の地形で確かめる）。

| 規則 | 場所 | 季節・時刻 | 密度（/100 m²）・群れ | 上限 |
|---|---|---|---|---|
| 1 | 泥・砂泥・澪の干出した所で、水面から 0.55 m 以上高い所（干潮で上部の泥） | 夏、朝・昼・夕 | 4・1〜4 | 20 |
| 2 | 泥・砂泥・澪の干出した所すべて（水際から上） | 夏、朝・昼・夕 | 0.8・1〜2 | 20 |
| 3・4 | 1・2 と同じ（春と秋は昼だけ、半分の密度） | 春・秋、昼 | 2 / 0.4 | 12 |
| 5 | 水際の石（護岸の捨て石、礫） | 春〜秋、昼 | 1.5・1〜2 | 12 |
| 6 | 大潮の満潮の水際（土手の下の砂、ヨシの根元） | 春〜秋、昼 | 2・1〜2 | 12 |
| 7 | 潮だまり（泥・砂泥）の幼魚（全長 20〜40 mm） | 夏・秋、昼 | 3・1〜3 | 12 |

- 夏の干潮（潮位 −1.0 m）で、上部（T.P. −0.1〜+0.6 m）の 1 セルあたりの数は下のほうの 3 倍あまり（韓国の Geum 河口の実測 2.6 匹/m² と 0.5 匹/m²）。実際の密度（1 m² に 1〜3 匹）はゲームでは出さず、種の上限（20 体、画質で 0.35〜1 倍）で抑える。
- 冬（12〜2 月）と夜は出ない（巣穴の中）。ゲームに気温はないので、15〜18 °C を下回ると出てこないことは季節と時刻で表す（春・秋は昼だけ）。
- 上げ潮では水際を這い上がり、残った上部の泥の縁から、満潮では土手の下の石の上へ。満ち潮で水に浸かった個体は脳が水際へ戻す。

## 8. 実行時の取り決め（どこに何があるか）

- GLB の根のノード（`Tobihaze_Adult`）の extras `tobihaze`: `tier`、`tlMM`（80）、`joints`、`axes`（関節ごとの回転の軸・範囲・重ね順・組み合わせの限界、眼の `gaze`・持ち上げ・沈み、体軸の位置）、`morphs`（メッシュごとの形の名前と駆動の式）、`states`・`crawl`・`prop`・`transitions`・`contacts`（§4）、`eyes`、`footprint`（接触の体の大きさ: 幅 0.141・高さ 0.160・胴 0.840・前寄り 0.080、全長に対する比。`drivers/index.ts` の `body`）、`layout`（テクスチャの区画）。
- マテリアルの extras `tobihaze`: `role`（`body`・`eye`・`fin`、hero のひれの不透明な部分は `pass: "opaque"`）、`runtime`（§5）。
- 実行時の流れ: 状態機械（`behavior.ts`）が毎フレーム 1 枚の記述を出す（状態とその経過、根の位置・向き・傾き、這う・跳ぶ・泳ぐの位相、前の持ち上げ、両眼の向き・持ち上げ・まばたき、口・喉・頬、ひれ、接地点とその固定、イベント）→ `pose.js` が extras と段階から関節の回転・移動と形の重みにする（`clips.mjs` も同じ関数でクリップを焼く）→ ドライバが骨とメッシュに当て、接地点で泥の高さに置く。段階が変わる（`attach` のたびに関節の組が変わる）ときも状態は続く。
- 合格の条件: 這うあいだ固定した接地点が 1 支えに 0.1 mm より動かない（60 s、平らな所と斜面、全段階）、11 状態のすべてに脳の意図と水深から入れる、水槽（常に水中）とケース（浅い水、巣穴なし）で破綻しない、遠い段階ほど更新が軽い。
- 測った値（2026-10-21、ドライバ・状態機械・姿勢を three の骨に当てて 6 分、途中で hero → lod1 → lod2 → hero と段階を替える）: 固定した接地点と骨の上の点の差は hero 0.009 mm、lod1 0.17 mm（段階を替えた直後の 1 秒だけ。前の段階で泥に留めた足裏の点を引き継ぐため。同じ段階の中では 0.01 mm）、lod2 3.4 mm（胸びれが関節 1 つの板で、腕の長さ方向のずれを吸収できない。遠景の距離では 1 画素より小さい）。1 体 1 回の更新は hero 約 27 µs（状態機械 8・姿勢 15・骨への適用 2）、lod1 約 24 µs、lod2 約 6 µs。毎フレームの更新は、這う・跳ぶ・捕る間で、観察中か 10 m 以内のときだけ。

## 9. 確かめ方

- `npm run check`（`tests/unit/tobihaze*.test.ts`、データ検証、圧縮版が最新か）、`npm run models:budget`。
- ブラウザ: `npm run build` のあと `node tests/smoke/tobihaze.mjs`（葛西の干潮で `__higata.debugSpawn('periophthalmus_modestus')`、観察、遠くの lod1・lod2、図鑑のプレビュー、水槽。画像は `tests/smoke/out/tobihaze/`）。
- 手で: 夏の昼、潮位 −0.5 m 以下の葛西で、F3 の「出す生物」をトビハゼだけにして土手寄りの泥へ（§7）。`docs/TESTING.md` の「トビハゼ」の節。
