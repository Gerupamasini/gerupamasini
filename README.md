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
npm run model:pagurus-hide            # ユビナガホンヤドカリの「殻に閉じこもる姿勢」の表を再生成（形態・殻を変えたあと）
npm run terrain:bake # 地形 PNG の再生成
```

ローカルや別ホストでは `VITE_BASE=/ npm run build` のようにベースパスを変えられます。

ユビナガホンヤドカリ単体のラボは `hermit-lab.html`（開発時は http://localhost:5173/gerupamasini/hermit-lab.html）。
殻の種類、LOD、水、デバッグ表示を切り替え、脅かす・餌・空き殻を試せます。`?mode=guard` で繁殖期の交尾前ガード、`?mode=naked` で殻から出した体（`&stage=dark` で写真と同じ黒い撮影台）、`?mode=retract` で殻に閉じこもる様子を見られます。

## 文書
- `docs/spec/` 仕様書 4 本（ゲームと MVP、アーキテクチャとデータ、生物 AI とモデル、潮位・セーブ・進行）
- `docs/planning/` 設計質問と回答、マハゼモデル監査
- `docs/TESTING.md` 身内テスト手順
- `docs/models/` マハゼモデルの説明
- `docs/creatures/yubinagahonyadokari/` ユビナガホンヤドカリ（*Pagurus minutus*）の調査、実写資料の分析、技術設計、科学的検証

## データ駆動
生物は `public/data/species/*.json`、行動ツリーは `public/data/behaviors/*.json`、地図は `public/data/maps/`、潮位観測点は `public/data/tide/stations/` に置き、`npm run data:validate` で検証します。種の追加はデータと `src/assets/models/<種>/` のモデル追加だけで済み、固有ドライバが必要な場合のみ `src/creatures/drivers/index.ts` に登録します。
