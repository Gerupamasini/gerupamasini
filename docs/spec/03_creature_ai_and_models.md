# 『干潟図鑑』 生物 AI 設計 + 3D モデル仕様（圧縮版 3/4）

版: 0.1（2026-10-01）

---

## 1. 方針

- 単純なランダム移動ではなく、実際の生態を参考にした行動を、種ごとにデータで定義できること。
- 構造は 2 層。上層の「脳」が意図を決め、下層の「ドライバ」が意図を姿勢と移動に変換する。
- 脳はビヘイビアツリー（BT）を JSON で記述し、種間で共有できる。ドライバは種固有の動き（マハゼの手続き駆動）と、クリップ再生の汎用ドライバの 2 系統。
- 200 体でも破綻しないよう、脳とドライバの更新頻度を LOD で間引く。

## 2. 知覚（Perception）

脳が参照できる文脈。毎ティック、個体ごとに計算する。

| 項目 | 内容 |
|---|---|
| `depth` | 個体位置の水深 [m]。負なら露出 |
| `exposed`, `wetness` | 露出しているか、直近の水没からの濡れ |
| `substrate` | 底質 |
| `tide.phase`, `tide.rate` | 上げ潮・下げ潮、変化率 [m/h] |
| `sun.elevation`, `timeOfDay` | day / dusk / night / dawn |
| `playerDist`, `playerApproachSpeed`, `playerVisible` | プレイヤーとの関係。しゃがみは視認距離を 0.6 倍 |
| `neighbors` | 半径内の同種と他種（空間ハッシュで取得、半径 3 m） |
| `alert` | 個体の警戒度 0..1。接近で上がり、時間で下がる |
| `energy` | 空腹度の簡易値 0..1 |
| `homeDist` | 出現点からの距離 |

## 3. ビヘイビアツリー JSON

```json
{
  "id": "fish_benthic",
  "tickHz": { "near": 5, "mid": 2, "far": 0.5 },
  "root": { "type": "selector", "children": [
    { "type": "sequence", "children": [
      { "type": "condition", "name": "player_within", "args": { "m": "$fleeDistance_m" } },
      { "type": "action", "name": "flee", "args": { "from": "player", "distance_m": 1.5, "urgency": 1 } }
    ]},
    { "type": "sequence", "children": [
      { "type": "condition", "name": "depth_below", "args": { "m": 0.03 } },
      { "type": "action", "name": "move_to_deeper", "args": { "minDepth_m": 0.15 } }
    ]},
    { "type": "sequence", "children": [
      { "type": "condition", "name": "alert_above", "args": { "v": 0.5 } },
      { "type": "action", "name": "display", "args": { "param": "alert", "seconds": [3, 8] } }
    ]},
    { "type": "random", "weights": [0.62, 0.24, 0.1, 0.04], "children": [
      { "type": "action", "name": "rest", "args": { "seconds": "$restMean_s" } },
      { "type": "action", "name": "wander", "args": { "distance_m": "$dartDistance_m", "stayNearHome_m": 4 } },
      { "type": "action", "name": "forage", "args": { "seconds": [2, 5] } },
      { "type": "cooldown", "seconds": 60, "child": { "type": "action", "name": "special", "args": { "param": "yawn" } } }
    ]}
  ]}
}
```

- ノード型: `selector`（左から成功するまで）、`sequence`（全部成功）、`condition`、`action`、`cooldown`、`random`（重み付き選択）。
- `"$name"` は種データ `brain.params` から差し込む。
- 条件カタログ（MVP）: `player_within`, `player_beyond`, `alert_above`, `depth_below`, `depth_above`, `exposed`, `time_is`, `tide_is`, `neighbor_within`, `energy_below`, `random_chance`。
- 行動カタログ（MVP）: `rest`, `wander`, `move_to`, `move_to_deeper`, `move_to_waterline`, `flee`, `forage`, `display`, `burrow`, `special`。行動は `Intent` を 1 つドライバに渡し、ドライバの完了通知か時間経過で終わる。
- 行動の完了はドライバがイベントで返す。脳は行動中は再評価しないが、`flee` だけは割り込み可（`interrupt: true`）。

## 4. ドライバ

### 4.1 共通契約
- `attach(root, model, individual)` で three のオブジェクトとリグを受け取り、個体のサイズと色調を適用する。
- `setIntent(intent)` で意図を受け取り、`update(dt, ctx)` で姿勢・位置・向きを更新する。地形への接地はドライバの責務。
- 行動が「図鑑に残る出来事」になった瞬間に `BehaviorEvent` を発火する（例: `yawn` 開始、`dart` 開始、`flee`、`forage_peck`、`alert`）。
- LOD が変わるとドライバはモデルを差し替えられるが、状態は保持する。

### 4.2 汎用ドライバ
| 名前 | 対象 | 内容 |
|---|---|---|
| `ClipWalker` | 歩行動物（エビ、鳥、将来のカニ） | `idle` と `move` クリップのブレンド。移動速度に再生速度を同期。地形の高さと傾きに接地。向きは目標へ回頭 |
| `ClipSwimmer` | 遊泳魚の lod1 / lod2 | `idle` と `move` のブレンド。水底からの高さを保つ。上下のうねりを少量追加 |
| `ClipFlyer` | 鳥の離脱飛行 | 離陸、上昇、旋回、着地の簡易経路。クリップ `fly` があれば使い、なければ翼の揺動を手続きで生成 |

### 4.3 種固有ドライバ: マハゼ
- 既存の `Behavior.js` と `pose.js` を TypeScript へ移植し、`MahazeDriver` とする。状態 perch / paddle / orient / dart / glide / yawn をそのまま使う。
- 脳の意図への対応: `rest` → perch（休止時間を意図の秒数に）、`wander` → dart（距離と方向）、`flee` → orient + dart を脅威の反対方向へ、`display:alert` → prop を上げる、`special:yawn` → yawn、`forage` → paddle + 小さな位置直し。
- 接地: 既存の接地点ロジックを地形の高さに対して行う（床は水平ではない）。
- 発火イベント: `rest`（30 秒以上の休止）、`dart`、`yawn`、`alert`、`flee`。
- lod2 ではドライバを `ClipSwimmer` に差し替え、`Idle` と `Swim` を再生する。

### 4.4 種固有ドライバ: シラタエビ（金曜版は簡易モデル）
- 歩行は `ClipWalker` 相当の手続き（脚の揺動は正弦波）。遊泳は体を傾けて腹脚を振る簡易表現。
- `flee` は尾扇を使った後方跳躍（0.3 秒で 0.4 m 後退、3 回まで）。イベント `tail_flip_escape`。
- `forage` は触角を動かしながら前進と停止を繰り返す。イベント `forage`。
- 夜はスポーン密度を 2 倍。

### 4.5 種固有ドライバ: シロチドリ（金曜版は簡易モデル）
- 歩行、走行（1.2 m/s）、停止して見張り、ついばみ（頭を下げる 0.4 秒）。イベント `forage_peck`、`alert`。
- `flee`: プレイヤーが 8 m 以内で `ClipFlyer` に切替、20〜40 m 離れた水際へ飛んで着地。イベント `flee_flight`。
- 水際（`waterline` タグ）に沿って移動し、露出面でのみ採餌する。満潮で露出面が無くなると消える（デスポーン）。

## 5. スポーンと個体生成

### 5.1 スポーン
- 地図を 10 m セルに分割。プレイヤー半径 60 m 内のセルを 1 秒ごとに評価。
- セルの Habitat（深さ、底質、露出、タグ）と現在の時刻・季節・潮で、各種の `spawn[]` ルールを評価。合致したルールの `density_per_100m2` から目標個体数を出し、足りなければ生成、ルールから外れた個体は時間をかけて退場（移動して視界外で消す）。
- セルごとに決定論的なシードを持ち、同じ条件なら同じ個体が出るようにする（再訪時の一貫性）。採集済みの個体はセーブに記録され再出現しない。
- 種ごとに `maxPopulation` で上限。

### 5.2 個体生成
- 全長: 種データの正規分布を min と max で切る。成長段階は全長で判定。
- 重量: `a * L^b`（L は mm）。
- 性別: `maleRatio`。性差の表現は翌週以降（データ項目は用意）。
- 特徴タグ: `when` 式（`length_pct>=90` など）で付与。
- 表示: スケール = 全長 / `modelLength_mm`。色調はインスタンスごとの `tint` をマテリアルのユニフォーム（lod1）または頂点色（lod2）で渡す。
- ID: `#0001` 形式の通し番号を種ごとに。

## 6. 図鑑との接続

- `BehaviorRecorder` が、観察モードでロック中の個体のドライバイベントだけを購読する。ロック中に発生した `behaviorId` を種の進捗に記録し、トーストで通知する。
- 種登録は採集時。採集不可の種は観察モードでロックした時点で「観察」として登録。
- ♂ 発見と ♀ 発見は採集個体の性別、または観察ロック中に性差表現がある種で記録。

## 7. 3D モデル仕様（Claude が制作する手続き生成モデルの契約）

### 7.1 形式と座標
- glTF 2.0 バイナリ（.glb）。拡張は `KHR_mesh_quantization`、`KHR_materials_transmission`、`KHR_materials_volume`、`KHR_materials_ior`、`KHR_materials_clearcoat` まで。Khronos glTF Validator でエラー 0。
- 単位メートル。+Y 上、+Z 前（頭の向き）、+X は生物の左。
- 原点は「体の中心直下の接地面」。歩行動物は脚の接地面、魚は腹の最下点、鳥は足の接地面。マハゼ既存モデルは例外で、ルートノード extras の `contactY` を使う。
- ルートノード名は `<SpeciesId>_<stage>`。extras に `higata` ブロックを持つ（下記）。

### 7.2 3 段階
| 段階 | ファイル | 三角形 | テクスチャ | 内容 |
|---|---|---|---|---|
| hero | `<id>.hero.glb` | 40 万以下 | 2048 | 観察用。口内など内部構造を含んでよい |
| lod1 | `<id>.lod1.glb` | 3 万以下 | 1024 | 近距離。内部構造なし |
| lod2 | `<id>.lod2.glb` | 4 千以下 | 512 | 中距離。透過なし、薄い部位は alphaTest |

3 段階でリグの関節名、クリップ名、モーフ名を一致させる。lod2 は関節を減らしてよいが、残す関節の名前は同じにする。

### 7.3 リグ
- ルート関節 `J_root`。体軸は `J_sp1` … の連番、頭 `J_head`、左右は `_L` / `_R`。
- 静止姿勢は全関節が単位回転。
- extras `higata.rig.axes` に手続き駆動用の回転軸を入れる（マハゼの `mahazeRig.axes` と同じ考え）。

### 7.4 クリップ
| 名前 | 必須 | 内容 |
|---|---|---|
| `Idle` | 必須 | ループ。呼吸や微動 |
| `Move` | 必須 | ループ。歩行、遊泳、歩き。1 サイクル。移動速度との同期係数 `higata.clips.moveSpeed_mps` を extras に |
| `Flee` | 任意 | 高速移動 |
| `Fly` | 鳥は必須 | 翼の 1 拍 |
| 種固有 | 任意 | `Yawn`, `Wave`, `Burrow`, `Peck` など。図鑑の行動 ID と対応 |

マハゼ既存の `Swim` は `Move` の別名として種データの `clips.move` で指定する。

### 7.5 マテリアル
- 全段階で標準 PBR（ベースカラー、法線、ORM）を持つ。独自シェーダーは hero 段階の追加機能であり、無くても表示できること。
- 半透明部位（ひれ、エビの体）は hero と lod1 で transmission、lod2 で不透明化。
- 個体差の色調はマテリアルを複製せず、ユニフォーム（lod1）か頂点色の乗算（lod2）で与えられる構造にする。

### 7.6 extras `higata`

```json
{ "species": "acanthogobius_flavimanus", "stage": "juvenile", "totalLength_mm": 50.5,
  "forward": "+Z", "up": "+Y", "contactY_m": -0.0034,
  "rig": { "axes": {} }, "clips": { "moveSpeed_mps": 0.25 } }
```

### 7.7 ビルダー
- `tools/models/<id>/build.mjs --tier hero|lod1|lod2` で 3 段階を生成。分割数とテクスチャサイズは tier で切替。
- 依存は Node 標準と jpeg-js のみ。ビルドは CI では行わず、生成物をコミットする。

## 8. マハゼ既存モデルの組み込み手順

1. ブランチ `claude/adoring-faraday-h25n7c` を本ブランチへマージ。`tools/mahaze/*` → `tools/models/mahaze/`、`src/materials/*` と `src/fish/*` → `src/creatures/species/mahaze/`、`models/mahaze_juvenile.glb` → `src/assets/models/mahaze/mahaze_juvenile.hero.glb`。vendor の three.js は削除。
2. ビルダーに `--tier` を追加。lod1 は NS 230 × NV 112、ひれ SUB 3 × NT 18、テクスチャ 1024、内部構造なし。lod2 は NS 115 × NV 56、ひれ SUB 2 × NT 12、テクスチャ 512、口内なし、ひれは alphaTest 用に被覆率をアルファへ。
3. `pose.js` と `Behavior.js` を TypeScript 化し `MahazeDriver` へ。床の高さを地形関数に置き換える。dt のスケールは `simScale` で受ける。
4. ヒーロー材質（Body / Fin / Eye / Interior）はフィーチャーフラグ `heroMaterials` の背後に置く。描画パスが `uBg` を供給できる場合だけ有効。
5. 標準フォールバック: lod1 は `MeshPhysicalMaterial`（透過あり）、lod2 は透過なし。
6. フラスタムカリングを有効にし、バウンディングスフィアを段階ごとに計算。
7. 成魚は当面スケールと色調で代用。翌週にビルダーへ成魚プリセット（体高比、頭部比、色）を足す。

## 9. 金曜版の簡易モデル仕様

| 種 | 構成 | 三角形 | 動き |
|---|---|---|---|
| シラタエビ（全長 40〜70 mm） | 頭胸甲（カプセル）、腹節 6（円錐台の連結）、尾扇（板 3 枚）、歩脚 5 対（線分 2 節）、触角 2 本（線分）、半透明の白〜灰 | 1,500 | 腹節を正弦波で屈曲、歩脚は位相差で揺動、尾扇の跳躍は腹節を一気に屈曲 |
| シロチドリ（全長 170 mm） | 胴（楕円体）、頭（球）、嘴（円錐）、脚 2（細円柱）、翼 2（板）、白い腹と灰褐の背、首輪状の黒帯 | 1,200 | 脚の交互揺動、ついばみは首の前傾、飛行は翼の揺動と経路移動 |

図鑑では「仮モデル」と表示し、翌週以降に写実モデルへ差し替える。差し替えはファイルと `model` 項目の変更のみ。
