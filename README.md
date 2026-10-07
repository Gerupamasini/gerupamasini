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
npm run model:nets   # タモ網 6 種の GLB を再生成（docs/models/nets/）
npm run render:oyster # マガキ（個体・群生・牡蠣礁）の画像を再生成（docs/models/oyster/）
npm run render:akaei  # アカエイ（5 つの行動・腹面・LOD）の画像を再生成（docs/models/akaei/）
npm run terrain:bake # 地形 PNG の再生成
```

ローカルや別ホストでは `VITE_BASE=/ npm run build` のようにベースパスを変えられます。

## 文書
- `docs/spec/` 仕様書 4 本（ゲームと MVP、アーキテクチャとデータ、生物 AI とモデル、潮位・セーブ・進行）
- `docs/planning/` 設計質問と回答、マハゼモデル監査
- `docs/TESTING.md` 身内テスト手順
- `docs/models/` マハゼモデルの説明、`docs/models/nets/` タモ網 6 種の調査・設計・使い方（ゲームでは `NetView` と `ToolShelf` がこの GLB を使う）
- `docs/models/oyster/` マガキの調査・設計（個体差の seed、殻の層、LOD、群生と牡蠣礁の大量配置、行動、ゲームへの統合）
- `docs/models/akaei/` アカエイの調査・設計（体盤・眼・噴水孔・腹側の口と鰓孔・尾棘、格子ボーンの波打ち遊泳、砂潜り・摂餌・逃避、LOD、ゲームへの統合）

## データ駆動
生物は `public/data/species/*.json`、行動ツリーは `public/data/behaviors/*.json`、地図は `public/data/maps/`、潮位観測点は `public/data/tide/stations/` に置き、`npm run data:validate` で検証します。種の追加はデータと `src/assets/models/<種>/` のモデル追加だけで済み、固有ドライバが必要な場合のみ `src/creatures/drivers/index.ts` に登録します。
