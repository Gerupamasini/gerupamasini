# Comet Goldfish — リアルタイム水槽（Three.js）

写真資料・文献調査に基づいて手続き生成した **コメット金魚（*Carassius auratus*）** が、Three.js / WebGL2 の水槽内を自律的に泳ぎ続けるプロジェクトです。外部の 3D モデル・テクスチャは使わず、形態・鱗・鰭・眼・体色・動き・行動をすべて実行時に生成します。

![水槽](docs/images/aquarium_overview.jpg)

| | |
|---|---|
| ![接写](docs/images/closeup_in_tank.jpg) | ![スタジオ](docs/images/studio_side.jpg) |
| ![頭部](docs/images/studio_head.jpg) | ![C スタート](docs/images/cstart_filmstrip.jpg) |
| ![上面の屈折](docs/images/view_from_above_refraction.jpg) | ![デバッグ表示](docs/images/debug_overlays.jpg) |

## 起動

```bash
npm install
npm run dev        # http://localhost:5173 を開く（npm start ならブラウザも自動で開く）
```

本番ビルド：`npm run build`（`dist/` を任意の静的サーバで配信）。PC ブラウザ（WebGL2 対応の Chrome / Edge / Firefox / Safari）を対象としています。

## 操作

| 操作 | 内容 |
|---|---|
| ドラッグ / ホイール | カメラの回転・ズーム |
| 金魚をクリック | その個体を選択（GUI・HUD・追従カメラの対象） |
| 前面ガラスをクリック（魚に重なる場合は Shift+クリック） | ガラスをタップ＝振動刺激（近い個体ほど C スタートで逃避、慣れも発生） |
| 上から水面をクリック | その位置に給餌（浮く餌と沈む餌） |
| `F` | 給餌 |
| `T` / `L` | ガラスをタップ / 頭上の影（ルーミング刺激） |
| `C` | 選択個体の追従カメラ切替 |
| `N` | 次の個体を選択 |
| `P` | 一時停止 |
| `H` | UI の表示切替 |

## URL パラメータ

| パラメータ | 例 | 内容 |
|---|---|---|
| `mode` | `?mode=studio` | 黒背景のスタジオ（1 尾を流水中で定位させ、あらゆる角度から観察） |
| `fish` | `?fish=20` | 尾数（1–40） |
| `seed` | `?seed=7` | 個体生成の乱数シード |
| `anim` | `?mode=studio&anim=startle` | スタジオのアニメーション（idle / slow / cruise / accelerate / turn / brake / startle / feeding / surfaceFeeding） |
| `view` | `?mode=studio&view=head` | スタジオのカメラ（side / top / front / q34 / rear / head / dorsal / tail / below） |
| `color` | `?mode=studio&color=1` | 体色（0 更紗、1 赤、2 橙、3 黄、4 白） |
| `quality` | `?quality=low` | ポストエフェクトを無効化 |
| `gui` | `?gui=0` | GUI を非表示 |

## デバッグ GUI（右上）

- **Simulation**：時間倍率（スローモーション）、一時停止、尾数、給餌・タップ・頭上の影・全個体驚愕、空腹の上昇速度、カメラ
- **Animation**：Idle / Slow Swim / Cruise / Accelerate / Turn / Brake / Startle / Feeding / Surface Feeding（選択個体または全個体）、遊泳速度、尾の振幅・周波数、鰭の剛性・水の抵抗、呼吸速度
- **Material / Eyes**：鱗の強さ、粗さ、グアニン反射、虹色、SSS、鰭の不透明度・透過・粗さ、体色、瞳孔・虹彩
- **AI**：状態の強制、現在の状態、性格パラメータ
- **LOD**：強制 LOD、切替閾値
- **Lighting & Water**：露出、トーンマップ、環境光、キーライト（強さ・方位・仰角）、コースティクス、濁度、粒子、光条、泡、水面反射、水流、ブルーム
- **Debug View**：Normal / Albedo / 鱗法線、Wireframe、Skeleton、Collision、Velocity、AI target、Current state

HUD（左下）：FPS、フレーム時間、CPU シミュレーション時間、ドローコール、三角形数、LOD 分布、選択個体の状態・速度・尾拍・欲求。

## ドキュメント

- [docs/RESEARCH_REPORT.md](docs/RESEARCH_REPORT.md) — 写真 100 枚の計測と文献調査（形態・光学・運動学・行動）
- [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md) — モデル構造、リグ、シェーダ、アニメーション、AI、LOD の設計
- [docs/QA_REPORT.md](docs/QA_REPORT.md) — 実写比較と修正、動き・行動の検証、不具合、性能計測

## 開発用ツール

```bash
npm run dev                                            # 別ターミナルで起動しておく
node tools/dev/shot.mjs "/?test=1&t=5" out.png         # 決定的な静止画
node tools/dev/shot.mjs "/?mode=studio&test=1&t=1.6&anim=startle&view=top&strip=8&stripDt=0.012" strip.png
node tools/dev/shot.mjs "/?test=1&probe=120&fish=10" p.png   # 行動統計（コンソールに PROBE）
npm run perf                                           # 性能計測（--gpu で実 GPU）
```

ヘッドレス実行には Chromium が必要です（`CHROME_PATH` かスクリプト内のパスを環境に合わせて変更）。

## 構成

```
src/fish      形態・メッシュ生成・リグ（背骨＋鰭条チェーン物理）・運動・シェーダ・インスタンス描画
src/ai        欲求＋ユーティリティ＋状態機械＋ステアリング
src/world     水槽・底砂・岩・水草・水面（全反射/屈折）・コースティクス・光条・粒子・泡・餌
src/render    共有ユニフォーム・環境プローブ・ポストエフェクト
src/debug     GUI・デバッグ描画
```

アセットはすべて手続き生成のため、KTX2 / Draco / Meshopt による圧縮対象はありません。外部の高精細スキャン等を導入する場合は、テクスチャを KTX2（UASTC: 法線、ETC1S: カラー）、メッシュを Meshopt で配信し、`FishSystem` の LOD 構成に合わせて読み込む想定です。

参照写真（支給 PDF）は権利者に帰属するためリポジトリには含めていません。
