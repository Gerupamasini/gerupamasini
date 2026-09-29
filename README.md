# チゴガニ (Ilyoplax pusilla) ♂ — 3D モデル

- `models/ilyoplax_pusilla.glb` — 完成モデル（単位 m、甲幅≈1 cm、約 8 MB、アニメ 3 種入り）
- `index.html` + `src/viewer.js` — Three.js ビューア（回転/拡大、関節スライダ、クリック選択、クリップ再生）
- `src/crab-builder.js` — 形状生成（節ごとの断面・長さ・棘・剛毛・眼柄・腹面）／`src/crab-clips.js` — アニメ
- `tools/build-model.mjs` — GLB 再生成（headless Chromium で GLTFExporter を実行）

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
