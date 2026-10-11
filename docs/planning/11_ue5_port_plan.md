# Steam 版の UE5 移植計画（11 回目）

決定: [10_engine_decision.md](10_engine_decision.md)（2026-10-11 に Steam 版は UE5 と決定）
前提の調査: [09_steam_readiness_audit.md](09_steam_readiness_audit.md)

## 1. 方針

- **Steam 版は UE5、Web 版は Three.js のまま**残す。スマホ版をどちらで作るかは未定（§7）
- **`public/data/` の JSON を正本にする**。UE5 側はそれを読むだけで、種・行動・地図・潮汐の値を二重に持たない（`npm run unreal:sync-data` で `unreal/HigataZukan/Content/Data/` に写す）
- **ロジックは C++ に書く**。ブループリントは見た目の調整とレベル配置だけに使う。差分が読めて、AI と一緒に開発できる形を保つ
- **エンジンに依存しない計算（潮汐、時刻、行動ツリーの判定、出現ルール、セーブ形式）は、UE のヘッダーを使わない C++ に移す**。TypeScript の出力から作った**ゴールデンテスト**で、両方の結果が一致することを CI で確かめる（潮汐で実施済み。§4）
- 手続き生成の生物は、TS のコードを**「glTF を書き出すツール」**として使い続ける。個体差（seed）は、材質パラメータと形状キーにして UE 側に渡す
- UE のアセット（`.uasset` / `.umap`）は Git LFS に置く（`.gitattributes` 設定済み）

## 2. リポジトリの構成

```
unreal/
  HigataZukan/                  UE5 プロジェクト（HigataZukan.uproject）
    Config/                     描画（Lumen・Nanite・VSM・HW レイトレーシング）、入力、パッケージ設定
    Content/Data/               public/data の写し（git 管理外、sync-data で生成）
    Source/
      HigataZukan/              ゲーム本体のモジュール
      HigataTide/               潮汐（TideCore/ はエンジン非依存の C++、TideSubsystem は UE 用の窓口）
  tests/tide/                   TideCore のゴールデンテスト（CMake、UE なしで CI で動く）
tools/unreal/                   データの同期、今後の glTF 書き出しなど
```

## 3. 段階

| 段階 | 内容 | 終わりの条件 |
|---|---|---|
| **0. 土台**（実施中） | UE5 プロジェクト、データ同期、潮汐の移植とゴールデンテスト、移植計画 | ✅ CI で C++ の潮汐が TS と一致する。⬜ エディターでビルドが通る（Windows 機で確認） |
| **1. 縦切り** | 走水の干潮・夕方の 1 場面。地形（ハイトマップ → Nanite／ランドスケープ）、潮位で動く水面、濡れと乾きの材質、空と太陽（実際の日時と緯度経度）、一人称の移動（Enhanced Input、パッドとマウス）、マハゼ（GLB）とアカエイ（glTF 書き出し） | 中位 GPU で 1080p・60fps、Steam Deck で 800p・30fps、写真と並べた比較画像 |
| **2. ゲームの骨格** | 時刻（`GameClock`、日本時間、潮時チケット）、セーブ（`SaveV1` と同じ JSON をファイルへ）、行動ツリー（JSON 駆動）、出現ルール、採集（タモ・スコップ）、図鑑 | Web 版のセーブを読み込んで同じ図鑑が出る |
| **3. 生物の移植** | 残りの種を glTF 書き出し + UE の材質へ。行動は種ごとのドライバを C++ に | 種ごとに Web 版の資料画像と見比べる |
| **4. 地図と自宅** | 葛西・走水・漫湖、水槽と設備、ショップ、ガチャ | Web 版と同じ流れで遊べる |
| **5. Steam 対応** | Steamworks（実績、Cloud、リッチプレゼンス）、Steam Deck 認証、設定画面（画質・音量・FOV・キー割り当て・文字サイズ）、英語化 | Deck Verified の項目を自己チェックで満たす |
| **6. 音と仕上げ** | 環境音・効果音（現地録音）、写真モード、トレーラー用カメラ | ストアページと体験版 |

段階 1 は ADR の「縦切り試作」と同じ場面にして、性能と見た目の合格の目安も ADR の表を使う。

## 4. ゴールデンテスト（Web 版と一致させる仕組み）

エンジンに依存しない計算は、**TypeScript を正解**として次の手順で移す。

1. vitest のテストで、TS の結果をテキストのフィクスチャに書き出す（`toMatchFileSnapshot`）
2. C++ の単体テストが同じフィクスチャを読み、許容誤差の範囲で一致を確かめる
3. TS 側を変えるとフィクスチャとの差で vitest が落ちる。`-u` で作り直すと、今度は C++ 側の CI が落ちる。こうして**両方を同時に直す**ことになる

実施済み: 潮汐（`tests/unit/tideGoldenUnreal.test.ts` → `unreal/tests/tide/fixtures/*.txt` → `unreal/tests/tide/tide_golden_test.cpp`）
- 観測点 5 件（東京、横須賀、漫湖の仮設定、JST 基準の 2 方式）
- 1970〜2060 年の潮位と変化率、4 期間の満潮・干潮
- 計 1,891 項目を比較。潮位の誤差は 1e-9 m 未満、満干の時刻の誤差は 1 秒未満
- 定数を 1 つ変えると失敗することも確認した（M2 の速度を 1e-7 変えると 246 項目が失敗）

次に同じ方法で移すもの: `src/core/Time.ts`（日本時間の暦）、`src/core/Moon.ts`（月齢・潮名）、`src/world/Sun.ts`（太陽の位置）、`src/core/Save.ts`（読み込みと検証）、`src/creatures/brain/BehaviorTree.ts`、出現ルール。

## 5. 描画の作り方（UE5 での対応）

| Web 版 | UE5 での作り方 |
|---|---|
| `Terrain.ts`（PNG ハイトマップ、`onBeforeCompile` で濡れの帯と底質） | ランドスケープまたは Nanite メッシュ。底質は Runtime Virtual Texture。**濡れと乾き**は、潮位の履歴から乾燥度を計算してマテリアルパラメータとして渡す |
| `Water.ts`（画面空間の屈折、Fresnel、平面鏡の反射） | Water プラグイン、またはカスタムの浅水メッシュ + Single Layer Water。反射は Lumen（HW レイトレーシング） |
| `Sky.ts`（Preetham + PMREM） | Sky Atmosphere + Volumetric Clouds + Directional Light（太陽の位置は `Sun.ts` の移植から） |
| 影（1 枚、512〜2048） | 仮想シャドウマップ |
| 接地影（ハク） | 距離場の影 + 必要なら Decal |
| 画質プリセット 4 段 | Scalability（Low〜Epic）と Deck 向けのプロファイル |
| `SandFX.ts`、足跡、砂煙 | Niagara + Render Target による地形の変形 |
| 手続き生成の生物 | glTF に書き出す → Interchange で読み込む。材質は UE で作り直し（SSS、濡れ、透明） |

## 6. 開発環境

- UE は **5.7 を想定**（`HigataZukan.uproject` の `EngineAssociation`）。使う版に合わせて変える
- ビルドと実行は **Windows + Visual Studio 2022**（または Rider）。DX12 と HW レイトレーシングに対応した GPU
- クラウドの開発環境（このリポジトリの CI など）では UE をビルドできない。UE のヘッダーを使わない部分だけを CMake で検証する。**UE のモジュールのコンパイル確認は手元の Windows 機で行う**
- Git LFS をインストールしてから `.uasset` をコミットする。GitHub の LFS の容量と転送量の上限は要確認

## 7. 未決定のこと

- **スマホ版**: Web 版（Three.js）をアプリ化するか、UE5 のモバイル版にするか。段階 1 の性能の数字を見て決める
- **日本時間の扱い**（09 §3-1）: 海外のプレイヤー向けに、案 A〜C のどれにするか。段階 2 の前に決める
- **Web 版のこれから**: 開発を続けるか、体験版・宣伝用として凍結するか
- **セーブの共有**: Web 版・スマホ版と Steam 版でセーブを行き来させるか（させるなら、セーブ形式の移行の仕組みが先に必要）
