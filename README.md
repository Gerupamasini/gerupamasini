# チゴガニ (Ilyoplax pusilla) ♂ — 3D モデル

- `models/ilyoplax_pusilla.glb` — 完成モデル（単位 m、甲幅≈1 cm、約 13 MB、13万頂点・24万三角形、MikkTSpace 接線付き、アニメ 3 種、glTF Validator: エラー/警告 0）
- `index.html` + `src/viewer.js` — Three.js ビューア（回転/拡大、関節スライダ、クリック選択、クリップ再生）
- `src/crab-builder.js` — 形状生成（節ごとの断面・長さ・棘・剛毛・眼柄・腹面）／`src/crab-clips.js` — アニメ
- `src/scene-env.js` — 空の IBL・泥干潟の地面・巣穴・小石
- `tools/build-model.mjs` — GLB 再生成（headless Chromium で GLTFExporter を実行）／`tools/validate.mjs` — glTF 検証／`tools/shots.mjs`, `tools/ui-test.mjs` — スクリーンショットと UI 動作テスト

```
npm install        # three / playwright-core（ビューア自体は vendor/ の同梱版で動作）
npm start          # http://localhost:8080/ を開く
npm run build:model
```

## 階層（関節ノード名）
`Body` → `{R,L}_eyestalk`, `{R,L}_maxilliped3`, `Abdomen`,
`{R,L}_cheliped_{coxa→merus→carpus→propodus→dactylus}`（dactylus は propodus の子＝指の開閉）,
`{R,L}_leg{2..5}_{coxa→merus→carpus→propodus→dactylus}`。左側は `_mount` ノードで X 反転（回転値は左右同値）。
各関節の `extras` に `hinge`（主回転軸）と範囲を格納。

## 根拠と推測
写真から読み取った: 甲羅の角丸台形＋高い隆起、長い直立眼柄と小さな黒い角膜、♂の白い鋏脚一対（掌は幅広・指は先細で交差）、
前縁外側の水色斑、暗褐色の脚と先端の鋭い指節、灰オリーブの泥まだら。
**推測（写真で確認不可）**: 鋏の歯の数・形、各節の正確な長さ比、甲羅背面の溝（胃域/心域/鰓域）の配置、腹面（胸板の縫合・♂腹節・第3顎脚）、
剛毛の位置、関節の可動域。これらは *Ilyoplax*/シオマネキ類の一般形態からの造形です。

## 文献による検証（2026-09 時点）
ネットワーク制限で論文本文は開けず、検索結果に出た記述だけを根拠にしています。
- 甲は五角形で、外眼角の後ろに切れ込みがあり、側縁は後方へ強く収束する（[Crabs of Japan](https://crabs-japan.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/taxon.php?id=34486) の記載）→ 台形に近い五角形の輪郭と外眼角の切れ込みに反映。
- 雄の鋏は掌が短く非常に高く、不動指は掌に対して水平、両指の外側に波状の隆線がある。腕節に歯はない → 鋏を再造形（隆線は小粒の列で表現）。
- 歩脚（P2〜P5）の長節は無棘で、両側に大きな鼓膜がある（Dotillinae の特徴）→ 長節の棘を除去し、両面に淡い卵形の鼓膜を追加。
- 甲幅約 10 mm、雄で鋏が大きい性的二形、雄の鋏を振る求愛（[Experiments with claw models …](https://pmc.ncbi.nlm.nih.gov/articles/PMC5080308)）。
- 胸部が水色（教育機関の観察記録）→ 前半部の水色斑。
未確認のままの推測: 鼓膜の正確な大きさ、鋏の歯と隆線の数、腹節の癒合、剛毛の位置。
