# ヤマメ (Oncorhynchus masou masou) 3D — Three.js

河川型ヤマメの写実的な 3D モデル、手続き遊泳、行動 AI。Node のみで GLB を生成し（Blender 不要）、Three.js r186 で表示します。
調査・仕様は `docs/yamame/`、実装の現状は `docs/yamame/impl/STATUS.md`。頭部の作り直し（50 枚の頭部写真から測定）は `docs/yamame/impl/HEAD.md`。

## すぐ動かす

```bash
npm ci
npm run build:assets      # assets/generated/yamame.glb を生成（成魚・seed 1・ヒーロー LOD0-3・モーフ・アニメクリップ付き。約 1 分。`-- --dev` で軽量 3 段）
npm test                  # 単体テスト + GLB 検査
npm run serve             # http://127.0.0.1:<port>/viewer/index.html（手動モード）, /viewer/behavior.html（自律行動）
```

| 画面 | 内容 |
|---|---|
| `viewer/index.html` | 12 種の遊泳モード（Idle〜ReturnToPosition）、摂餌ストライク、C-start 逃避、LOD 切替 |
| `viewer/behavior.html` | 流れの中の定位 → 流下する餌の迎撃 → 復帰。脅威の接近で警戒 → 逃避 → 隠れ。判断理由（ExplainTrace）をリアルタイム表示 |
| `viewer/dev/*.html` | 開発用（側面静止画 `still.html`、個体差 `lineup.html`、体波 `swim.html` など） |

## 個体を変える

```bash
node tools/build-assets/build.mjs --seed 12 --individual --out assets/generated/ind_12.glb
node tools/headless/render-snapshot.mjs "/viewer/dev/lineup.html?files=ind_11,ind_12,ind_13,ind_14" out.png --w 1600 --h 800
```

## 構成

```
assets/src/        params.json（写真・文献由来の寸法と provenance）, stage_adult.json（a01 の実寸写真から）
tools/build-assets surface → loft → fins / eyes / textures → rig + weights → write-glb（glTF-Transform）
src/locomotion     体波・C-start・運動学（three.js 非依存）
src/yamame         Yamame ラッパ（ボーン駆動・LOD・モーフ・ミキサ）, 遊泳モード表
src/behavior       知覚 → 内的状態 → 意思決定 → 操舵 → ExplainTrace
tools/headless     Chromium(SwiftShader) でのスナップショット
```
