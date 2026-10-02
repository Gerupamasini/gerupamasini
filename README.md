# 干潟図鑑 (Higata Zukan)

現実の潮汐と連動する干潟を探索し、実物に近い 3D 生物を観察・採集・飼育して図鑑を完成させる Web ゲーム（Three.js + TypeScript）。

## 開発

```bash
npm install
npm run dev          # http://localhost:5173/gerupamasini/
npm run check        # 型検査 + 単体テスト + データ検証
npm run build        # dist/ を生成（GitHub Pages 用のベースパス /gerupamasini/）
npm run smoke        # ヘッドレス Chromium で起動し tests/smoke/out/ にスクリーンショット
npm run model:mahaze -- --tier lod2   # マハゼモデルの再生成（hero / lod1 / lod2）
npm run terrain:bake # 地形 PNG の再生成
```

ローカルや別ホストでは `VITE_BASE=/ npm run build` のようにベースパスを変えられます。

`flat.html` は葛西海浜公園をモデルにした、歩ける架空の干潟（300 m 四方、人や生き物なし）です。詳しくは `docs/flat/README.md` を参照してください。

## 文書
- `docs/spec/` 仕様書 4 本（ゲームと MVP、アーキテクチャとデータ、生物 AI とモデル、潮位・セーブ・進行）
- `docs/planning/` 設計質問と回答、マハゼモデル監査
- `docs/TESTING.md` 身内テスト手順
- `docs/models/` マハゼモデルの説明
- `docs/flat/` 架空の干潟「なぎさ干潟」（flat.html）の操作・生成・描画・組み込み方法

## データ駆動
生物は `public/data/species/*.json`、行動ツリーは `public/data/behaviors/*.json`、地図は `public/data/maps/`、潮位観測点は `public/data/tide/stations/` に置き、`npm run data:validate` で検証します。種の追加はデータと `src/assets/models/<種>/` のモデル追加だけで済み、固有ドライバが必要な場合のみ `src/creatures/drivers/index.ts` に登録します。
