# Behavior AI Specification — シロチドリ

根拠 ID は `research.md`。数値はすべて `KentishPloverConfig.js` の `behavior` / `disturbance` / `social` / `foraging`、地表は `src/world/SurfaceTypes.js`。

## 1. アーキテクチャ

```
Perception (可変レート 4–20 Hz)
   ├ threats   : player / 将来の捕食者・犬  → 距離・接近速度・直進性
   ├ neighbors : 空間ハッシュで近傍個体
   ├ prey      : 停止中のみ高確率で検出（視覚採餌者 S19, S21）
   └ terrain   : 足元の地表タイプ、水際までの距離、潮位
        ↓
Drives（内部状態） hunger, fear, fatigue, alertness, socialNeed, comfort(羽繕い欲求)
        ↓
Utility selection（高位の活動を選ぶ。ヒステリシス＋最小持続時間つき）
   FORAGE / ROOST(REST) / PREEN / SOCIAL / AVOID / RELOCATE
        ↓
FSM（活動の中の具体的な状態）
   REST, IDLE, SCAN, WALK, RUN, FORAGE_SEARCH, PECK, EAT, PREEN,
   SOCIAL, ALERT, FLEE, TAKEOFF, FLY, LAND
        ↓
Locomotion（加減速制限。チドリらしい急停止＝大きな減速度）→ Animator
```

`Math.random() < p` を毎フレーム行う実装はしない。確率は **ハザード率**（単位時間あたり、`1 - exp(-λ dt)`）として内部状態から計算し、フレームレート非依存にする。

## 2. 採餌: run–stop–peck（S13, S14, S15, S19, S21）

```
SCAN (停止・地面を見る, 0.4–2.5 s)
  ├ 餌を検出 → 目標へ RUN（遠い）/ WALK（近い）→ 急停止 → PECK → EAT → SCAN
  ├ foot-trembling（湿った泥で稀に）→ 検出確率を一時的に上昇 → SCAN 続行
  └ 検出なし（ハザード率で打ち切り）→ 短い移動 (RUN 0.3–1.5 m / WALK) → 急停止 → SCAN
```

- **検出は停止中のみ実質的に起こる**。移動中の検出率は停止時の 15%、停止直後 0.3 s は検出しない（頭・眼の安定化。D）。
- 行動シミュレーションでの結果（validation.md §4）: 静止探索 中央値 0.8 s、移動 中央値 1.1 m、啄み 14 回/分、成功率 ≈50%。
- 検出確率 = 手がかり強度 × 距離減衰 × 地表係数 × 干出後時間係数（S15）× (1 − fear×0.7)。
- 次の移動先は、直前の方向からの転回角をランダムに（±70°）、水際の好ましい距離（地表ごとの `preferredDistance`）へ向かう偏りを加える。
- 餌の種類ごとの接近・捕食（`src/world/PreyField.js` の `PREY_TYPES`）

| 種類 | 地表 | 手がかり | 接近 | 捕食動作 | 処理時間 |
|---|---|---|---|---|---|
| polychaete（ゴカイ） | wetMud, mud | 断続的（巣穴から出る） | 走って急停止、最後はゆっくり | 深めに刺して引き抜く（1–2回の引き） | 1.5–3 s |
| crab（小型カニ） | wetMud, mud, sand | 常時可視・移動 | 最大速度で突進（巣穴に逃げる前に） | 素早い突き＋首振り | 1–2 s |
| amphipod（端脚類） | sand, wetSand | 短い跳ね | 歩いて近づく | 素早い浅い啄み | 0.3 s |
| insect（昆虫） | drySand, vegetation | 移動 | 歩行 | 素早い啄み | 0.3 s |

## 3. 人・脅威への段階的反応（S11, S12, S37）

設定ファイル `disturbance`（既定値。コードに固定しない）:

| 段階 | 既定距離 | 根拠 |
|---|---|---|
| 通常行動 | > 50 m | S12（50 m 以内で反応確率>0.2） |
| ALERT（頭を上げ注視・姿勢を高く） | ≤ 50 m | S12 |
| 歩いて距離を取る | ≤ 35 m | S11（越冬個体の反応距離≈40 m、人には歩いて離れることが多い） |
| 走って離れる | ≤ 22 m | 推定（S11 の段階を分割） |
| 飛翔（FID） | ≤ 14 m、または接近継続時間 > `persistSeconds`（9 s） | S11,S12 の越冬値から推定。犬は `threatTypes.dog.distanceScale = 1.6`（S12: 20 m 以内に入る前に必ず移動） |

- 実効距離 = 距離 / (速度係数 × 直進性係数 × 個体の `fearThreshold`)。速く・まっすぐ近づくほど早く反応（S37）。
- 営巣中の個体は `contextScale.nesting = 1.8`（S11: 繁殖個体 ≈80 m は越冬群 ≈40 m の約2倍）。干潟で採餌する群れは `foraging = 1.0`（デモ既定）。
- 慣れ（habituation）: 脅威が一定距離以上に保たれ続けると `fearThreshold` を徐々に緩める（上限つき）。
- 逃げる方向: 脅威から離れつつ、水に入らない方向を地表コストで選ぶ。

## 4. 社会行動（S5, S30, S31）

- **Boids は使わない**。各個体が独立に意思決定し、他個体の影響は以下のみ:
  1. **個体距離** `personalSpace`（既定 0.6 m, 個体差 ±20%）: 近すぎると歩いて離れる。
  2. **追い払い**: 採餌中に `personalSpace × 0.5` 以内へ他個体が入り、餌が近くにある場合、ハザード率で短い突進（頭を下げ・背を丸めた姿勢）。相手は走って離れる（S30）。
  3. **警戒の伝播**: 近傍個体が FLEE/TAKEOFF すると、距離に応じて fear を加算（群れの一斉飛翔はこの結果として起こる。同期させない）。
  4. **socialNeed**: 近傍に同種がいないと増加し、群れの方向へ採餌移動先を偏らせる。
  5. **塒**: 満潮時は乾いた砂の高所へ移動し、個体距離を 0.25 m に縮めて休息。体を風上に向ける（`world.windDir`）。

## 5. 潮位・地形（S15, S31）

`src/world/SurfaceTypes.js`:

| type | walkCost | preyProbability | preferredDistance（水際から, m） | avoidance |
|---|---|---|---|---|
| deepWater | ∞（不可） | 0 | – | 1.0 |
| shallowWater | 3.0 | 0.25 | 0 | 0.6 |
| wetMud | 1.3 | 1.0 | 0–6 | 0 |
| mud | 1.2 | 0.55 | 3–15 | 0 |
| wetSand | 1.0 | 0.6 | 0–5 | 0 |
| sand | 1.0 | 0.25 | 5–30 | 0 |
| drySand | 1.1 | 0.1 | – | 0 |
| vegetation | 2.2 | 0.15 | – | 0.4 |

- 地表タイプ = 基質（泥/砂/植生、地形高さとノイズ）× 冠水状態（潮位との比較）× 乾燥度（干出後の経過時間）。
- 潮が引く → 新たな泥面が露出（`exposedAt` を記録）→ 干出後時間とともに餌の手がかり頻度が上昇（S15）→ AI の RELOCATE 効用が上がり採餌域へ移動。これは `Tide` → `Terrain.surfaceAt()` → `PreyField` → `KentishPloverAI` の依存で繋がっており、各段を差し替え可能。

## 6. 効用関数（要約）

| 活動 | 効用 |
|---|---|
| FORAGE | hunger^0.8 × 地表の餌期待値 × (1 − fear) |
| ROOST/REST | fatigue × (0.4 + 0.6·満潮度) × (1 − fear) + 夜間補正 |
| PREEN | comfort × (1 − hunger×0.6) × (1 − fear) |
| SOCIAL | socialNeed × (1 − fear) |
| AVOID | 段階的反応のレベル（最優先。ALERT は他の活動と併存し頭部だけを乗っ取る） |
| RELOCATE | 現在地の餌期待値が低く、近くにより良い地表がある |

選択には現在の活動に +0.15 のヒステリシスと最小持続時間を与え、ちらつきを防ぐ。
