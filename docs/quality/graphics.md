# グラフィックの土台（圧縮・FSR 1・動的解像度・画質の自動設定）

[判断記録](../planning/10_engine_decision.md) の §8-2 の 1「土台」のうち、次の 4 つを入れた。どれも「世の中に多くある PC で、画を落とさずに速く描く」ためのもの。スマホ（タッチ端末）の動きは変えていない。

| 何を | 効果 | どこ |
|---|---|---|
| モデルの圧縮（KTX2 + meshopt） | テクスチャの GPU メモリが約 1/4、形状のファイルが約 1/3 | `tools/models/pack/`、`src/assets/models-packed/`、`ModelLoader.ts` |
| FSR 1 での拡大 | 内部の解像度で描いた干潟を、ブラウザーの単純な拡大ではなく FSR 1（EASU + RCAS）で画面の解像度に戻す | `src/render/Fsr.ts`、`Upscaler.ts`、`FieldRenderer.ts` |
| 動的解像度と GPU 時間の計測 | 目標の fps を割りそうなら内部の解像度を下げ、余裕が戻れば上げる | `GpuTimer.ts`、`DynamicResolution.ts`、`Renderer.ts` |
| 画質の自動設定 | 初めて干潟に入ったとき、その PC で実際に測って段階を選ぶ | `AutoQuality.ts`、`App.ts` の `stepAutoQuality` |

## 1. モデルの圧縮

モデルを作る道具（`npm run model:*`）が書き出す GLB（`src/assets/models/`、以下「元」）はそのまま残し、ゲームが読むのは圧縮版（`src/assets/models-packed/`）にした。

```bash
npm run models:pack        # 変わった元だけを圧縮する（4 並列。画像の変換結果は node_modules/.cache/higata-pack に残る）
npm run models:pack -- mahaze nets/net_small   # 名前で絞る
npm run models:check       # 圧縮版が元より古ければ失敗（npm run check と CI に入っている）
node tools/models/pack/compare.mjs [mahaze ...] # 元と圧縮版を同じ条件で描いて比べる（tests/smoke/out/pack-compare/）
```

- **テクスチャ**: KTX2（Basis Universal の UASTC、Zstandard、ミップマップ込み）。実行時に GPU が直接読める形式に変換される（PC と Steam Deck は BC7、スマホは ASTC か ETC2、どれもなければ非圧縮）。ノーマルマップは basisu の normal-map 設定、色は sRGB、それ以外（粗さ、遮蔽、模様の分布など）は線形で圧縮する
- **形状**: EXT_meshopt_compression（可逆。フィルターなし）
- glTF の中身は**番号ごとそのまま**残す。ハゼのヒーロー材質のように、extras がテクスチャを番号で指しているため（gltf-transform などで組み直すと番号がずれる）
- 圧縮のたびに、変換後のテクスチャを元に戻して PSNR を測り、30 dB を下回れば失敗にする。全 55 個の最低は 32.7 dB（128 px の細かいローレットのノーマルマップ）、ほとんどは 40〜55 dB
- ETC1S（もっと小さい形式）も比べたが、模様やノーマルマップが 26〜34 dB まで落ちるので使わない

結果（2026-10-12、55 個）:

| | 元 | 圧縮版 |
|---|---|---|
| ファイルの合計 | 289.6 MB | 311.0 MB |
| うち形状 | 約 106 MB | 約 36 MB |
| うちテクスチャ | 約 178 MB（PNG / JPEG） | 約 268 MB（UASTC + Zstandard） |
| テクスチャを全部 GPU に載せたとき | 約 2.5 GB（RGBA8 + ミップ、計 4.7 億画素） | 約 0.6 GB（BC7 / ASTC 4×4） |

ファイルの合計は 7 % 増える（JPEG だった画像が UASTC で大きくなるため）。読み込み後の GPU メモリと、テクスチャを GPU に送る時間は大きく減る。Web 版のダウンロード量を減らしたくなったら、UASTC の RDO（品質を少し落としてファイルを小さくする）を色のテクスチャに試す。

元と圧縮版の描き比べ（`compare.mjs`、モデルの写っている画素だけの PSNR）: 全 55 個で 28.9〜99 dB。いちばん低いのは lod2 のヒメハゼで、細いひれの条の「切り抜き」の境目が数画素ずれるため（見た目は同じ）。色空間の取り違えや形状の破損があれば 20 dB を大きく下回る。

モデルを作り直したら `npm run models:pack` を忘れずに（忘れると `npm run check` と CI が止まる）。

## 2. FSR 1 での拡大

PC（タッチ端末でない）の干潟では、

- 描画バッファ（キャンバス）は画面の画素数そのまま（約 4K まで）
- 3D の画は、画質の段階が決める大きさ（`maxDpr` と `maxPixels`、今までのキャンバスの大きさと同じ）で描く
- 小さく描いたときだけ、水の合成が画面に出すときと同じ仕上げ（three の ACES Filmic でのトーンマッピング、色の調整と周辺減光、sRGB 化）まで済ませた画を内部の大きさで書き、それを **EASU（拡大）→ RCAS（輪郭の補正）** で画面に出す。three はトーンマッピングと sRGB 化を画面に描くときしかしないので、その分は水のシェーダーが自分でする（`src/render/ToneMapGlsl.ts`）。拡大しないときと色は変わらない
- UI（HTML）とタモ網（最後に画面の解像度で上から描く）は拡大の影響を受けない

ホーム（水槽）、ショップ、スマホは今までどおり（キャンバスそのものを小さくし、ブラウザーが拡大する）。観察モード（ヒーロー材質）も内部の解像度で描き、最後の合成で画面に広げる。

確かめ方: `npm run build` のあと `node tests/smoke/upscale.mjs`。同じ景色を等倍、67 %、50 % で、FSR 1 と単純な拡大（bilinear）の両方で撮り、`tests/smoke/out/upscale-crops.png` に中央を 3 倍に拡大して並べる。デバッグパネル（F3）には `描画 1280×720 → 1920×1080 FSR` のように出る。

FSR 1 は AMD FidelityFX Super Resolution 1.0（MIT ライセンス）を GLSL に移したもの。ライセンス文は `src/render/Fsr.ts` の先頭にある。

## 3. 動的解像度と GPU 時間

- GPU 時間は `EXT_disjoint_timer_query_webgl2` で測る（Chrome / Electron のデスクトップ版にある）。デバッグパネルに `GPU 9.8 ms` と出る
- 目標: 段階「中」「高」は 60 fps、「低」「超軽量」は 30 fps
- GPU 時間が目標の 92 % を超えたら 5 % ずつ小さく、70 % を下回ったら大きくする（段階の大きさが上限、画面の 50 % が下限）。変えたあと 0.75 秒は次を変えない
- 小さくしても GPU 時間が減らないとき（CPU や頂点の処理で詰まっている）は 1 段戻して 20 秒そのまま
- GPU タイマーが無い環境では、遅れたフレームを見て下げるだけ（段階の大きさの 70 % まで）。上げるのは静かな時間が続いてから

## 4. 画質の自動設定

初めて干潟に入ったとき（PC のみ。その GPU で一度だけ）:

1. 動的解像度を止め、段階の大きさのまま 2.5 秒なじませてから 3 秒測る
2. GPU 時間が目標のフレーム時間の 1.3 倍を超えたら 1 段下げる（超軽量まで）。次の段階の目標の半分を下回ったら 1 段上げる（高まで。下げたあとは上げない）
3. 変えたら、その段階でもう一度測る（3 回まで）。決まったら知らせを出し、GPU の名前と一緒に保存する

確かめ方: `npm run build` のあと `node tests/smoke/auto-quality.mjs`（初回の測定・知らせ・保存・再読み込み・手動での解除と「自動」での測り直し）。この環境のソフトウェア描画（SwiftShader）でも GPU タイマーは使え、「超軽量」に決まる。

メニューの「干潟の画質」で段階を選ぶと自動は切れ、「自動」を押すと次に干潟に入ったときに測り直す。別の GPU（GPU の名前が違う）で遊ぶと、自動のままなら測り直す。初回の段階（測る前）は今までどおり GPU の名前から決める（内蔵 GPU なら「低」）。

## 5. まだのこと

- 実機での数字（内蔵 GPU、GTX 1650 級、RTX 3060 級、Steam Deck）。この環境はソフトウェア描画（SwiftShader）しかない
- Steam Deck は今タッチ端末と判定される（[09](../planning/09_steam_readiness_audit.md) の 1-3）ので、それを直すまで FSR 1・動的解像度・自動設定は Deck で効かない
- Electron の起動設定（高性能な GPU、ブロックリストの無視、裏での速度制限を止める）。Electron で包む作業と一緒に入れる
- 判断記録 §8-2 の 2 以降（乾き具合、AgX、TAA、カスケード影）
