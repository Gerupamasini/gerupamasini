# ヒメハゼ *Favonigobius gymnauchen* — Three.js リアルタイム生物モデル

東京湾の干潟・浅い砂底にいるヒメハゼを、リアルタイム動作する Three.js 用にプロシージャル生成したモデル・リグ・アニメーション・行動AIです。

**根拠タグ**（コード内コメントでも同じタグを使っています）

| タグ | 意味 |
|---|---|
| **F** | 論文・図鑑・公的機関資料で確認した事実 |
| **P** | 写真・動画から合理的に判断したもの（複数個体の共通特徴） |
| **R** | 近縁種・同科の一般的知見からの推定 |
| **G** | ゲーム実装上の仮定 |

---

## 1. 種の同定 (Species identification)

| 項目 | 内容 | 根拠 |
|---|---|---|
| 学名 | *Favonigobius gymnauchen* (Bleeker, 1860) | F |
| 和名 / 英名 | ヒメハゼ / sharp-nosed sand goby | F |
| 分類 | スズキ系 ハゼ目 ハゼ科 (Gobiidae) ヒメハゼ属 *Favonigobius* | F |
| 近縁種 | *F. reichei*, *F. lentiginosus*, *F. exquisitus* など（インド-西太平洋・豪州） | F |
| 分布 | 日本（東京湾を含む本州〜九州）、朝鮮半島、中国沿岸など北西太平洋の温帯域 | F |
| 東京湾 | 湾全域の干潟域・漁港等で見られる（東京都の稚魚調査資料） | F |
| 最大サイズ | 全長 約9 cm | F |
| 紛らわしい種 | マハゼとの違い：ヒメハゼは体色がより黒っぽく、**下顎が上顎より突出**する | F |

種名 *gymnauchen* は「裸の項部（うなじ）」の意で、項部（第1背鰭前方の背面）に鱗がないことを示します（F: 語源・記載）。モデルでは項部と頭部を無鱗にしています。

## 2. 出典 (Sources / papers)

調査時点でアクセスできた一次/二次資料：

- FishBase: *Favonigobius gymnauchen*, Sharp-nosed sand goby — 鰭式 D VI–VII / I,9; A I,9、体色記述（上半部の暗褐色と白の斑点、腹側淡色、眼から顎中央上に至る褐色帯、体側中央に約5対の黒斑、腹側下部の不規則な白細線、雄の第1背鰭は暗色で縁が淡色かつ第1棘伸長）。<https://fishbase.net.br/summary/48981>
- 神奈川県立生命の星・地球博物館 研究報告 (Arao et al.) — 相模湾・東京湾周辺の魚類記録。<https://nh.kanagawa-museum.jp/assets/icp/contents/1612425324536/simple/42_25_Arao_et_al.pdf>
- 東京都環境局「稚魚速報」(2020, R3) — 東京湾内湾の干潟でのヒメハゼ出現、マハゼとの識別点（体色、下顎の突出）、**危険を察知すると砂に潜る**習性、砂色の模様。<https://www.kankyo.metro.tokyo.lg.jp/documents/d/kankyo/creature-aquatic_creature-files-2020_06_chigyo_sokuhou>
- 千葉市 稲毛海浜公園の魚類（東京湾奥の人工海浜での記録）。<https://www.city.chiba.jp/toshi/koenryokuchi/kanri/chuo-mihama/inagekaihinkoensakana.html>
- 韓国西海岸潮間帯におけるヒメハゼ（날개망둑）の食性 — 主餌はヨコエビ類・多毛類・カニ類・カイアシ類、少量の腹足類・タナイス類・等脚類。**成長に伴う食性変化**：1–2 cm 個体はヨコエビ・多毛類・カイアシ類が主、成長と共に多毛類・カニ類が増えカイアシ類が減少。別研究ではカイアシ類が胃内容物の68%。<https://scholar.kyobobook.co.kr/article/detail/4010016944579>
- ヒメハゼの**放射状の溝を持つ巣** (radially ditched nests) に関する研究（*Fishes* 誌, MDPI, 11(2):45）— 雄が巣から周囲へ向かって掘る行動と、巣内に溜まった砂を掃き出す行動を繰り返すことで溝が形成され、クレーター状の構造になる。基質の清掃・安定化や雌の配偶者選択に関与する可能性。（全文PDFはこの環境のネットワーク制限で取得できず、要旨のみ確認）
- Western Australian Museum: *Favonigobius* 属の再記載（属の形態的定義）。<https://museum.wa.gov.au/sites/default/files/A%20NEW%20GENUS%20AND%20SPECIES%20OF%20GOBY%20FROM%20THE%20SWAN-AVON%20ESTUARY%2C%20WESTERN%20AUSTRALIA%2C%20WITH%20A%20REDESCRIPTION%20OF%20THE%20GENUS%20FAVONIGOBI.pdf>

一般知見（R）として使用：ハゼ科の腹鰭が癒合した吸盤状の盤、魚類のC-start逃避（Domenici & Blake 1997, *J. Exp. Biol.*）、吸引摂餌の運動学、*Pomatoschistus* など砂底性ハゼの間欠的な移動（saltatory search）。

## 3. 形態の知見 (Morphological findings)

全長 TL = 1.0 とした比率。値は `model/anatomy.js` に根拠タグ付きで格納しています。

| 部位 | TL比 | 根拠 | 備考 |
|---|---|---|---|
| 標準体長 SL | 0.82 | P | 尾鰭は丸みのある槍形でやや長い |
| 頭長 | 0.25 | P | SL の約30% |
| 吻長 | 0.075 | P | 尖った吻（“sharp-nosed”） |
| 眼径 | 0.058 | P | 大きく背側寄り、左右の眼は頭頂で接近（眼間隔が狭い） |
| 最大体高 | 0.15 | P | 第1背鰭起部付近 |
| 頭幅 | 0.145 | P | 頭部は体高よりわずかに幅広、腹面は平ら（底生適応） |
| 尾柄高 / 尾柄長 | 0.075 / 0.13 | P | 側扁する |
| 口 | 端位〜やや斜め、口裂後端は眼前半の下 | P | 下顎突出は F |
| 鰓蓋後縁 | 0.245 | P | 下方で前方へ湾曲 |

**断面**：吻端では小さな楕円 → 眼の位置で上半が丸く下半が平ら（superellipse指数：上2.3/下3.0）→ 胸部で最も幅広・腹面扁平 → 体幹後半で縦長 → 尾柄で強く側扁、と13断面で段階的に変化させています。

**鰭**（鰭条数は F / 位置と大きさは P）

| 鰭 | 鰭式 | 形状 | 実装 |
|---|---|---|---|
| 第1背鰭 | VI（VII も）| 三角〜丸み、棘間膜は切れ込む。**雄は第1(〜2)棘が伸長**、暗色で縁が淡色 | 6棘・雄/繁殖期パラメータで棘伸長と暗色帯 |
| 第2背鰭 | I, 9 | ほぼ等高の四角形、鰭条上に褐色点列 | 10鰭条 |
| 臀鰭 | I, 9 | 第2背鰭よりやや後方起部・淡色 | 10鰭条 |
| 胸鰭 | 16–18 (R: 属の一般値) | 大きな丸い団扇状 | 17鰭条 |
| 腹鰭 | I, 5 ×2（癒合盤、膜蓋あり） | 吸盤状の盤（ハゼ科; R）| 11鰭条の盤、基質に接する |
| 尾鰭 | 分節鰭条 ~17 (R) | 円形〜やや槍形 | 15鰭条 |

**皮膚**：体側は櫛鱗（ctenoid, R）、縦列鱗数は28–31程度と推定（R: 属の値。本種の確実な値は取得資料で未確認）。頭部・項部は無鱗（F: 種名）。粘液層による湿潤光沢（P）、腹部と鰭は半透明（P）、体側に白い真珠光沢の斑点（P, 虹色素胞）。

## 4. 体色・模様 (Color/pattern findings)

複数写真に共通する特徴を抽出し、個体差を分離しました。

| 部位 | 共通特徴 | 個体差 |
|---|---|---|
| 背面 | 淡い砂色地に暗褐色の網目/斑点（F）、弱い鞍状斑 4 個（P） | 斑の濃淡・網目の細かさ |
| 側面 | 体側中央に**約5個の暗色斑**（F: “約5対”）、最後は尾鰭基部。上半部に褐色斑と白点（F） | 斑の形・位置±2%・二重/縦長 |
| 腹面 | 白〜半透明（F）。時に下部側面に不規則な白細線（F: occasionally） | 白細線の有無（35%） |
| 頭部 | **眼から上顎中央上方へ向かう褐色帯**（F）、頬と鰓蓋に小褐点（P）、頭頂暗め（P） | 点の数と位置 |
| 眼 | 暗色の虹彩に金褐色の内輪と淡色の斑（P）、背側に体の模様が連続（P） | — |
| 尾柄 | 尾鰭基部の暗斑（第5斑; F/P） | 濃さ |
| 第1背鰭 | 雌・非繁殖: 半透明に褐点。**雄: 暗色＋淡色縁、前方棘伸長**（F） | 性・繁殖期で切替 |
| 第2背鰭・尾鰭 | 鰭条上に小褐点の列（P） | 列数 |
| 胸・腹・臀鰭 | ほぼ無色半透明（P） | — |

## 5. 生息環境 (Habitat)

- 内湾・河口干潟の砂底〜砂泥底、浅い砂地（F）。東京湾では湾全域の干潟・漁港（F）。
- 砂に潜って身を隠す（F）。体色は砂や砂利によく似る（F）。
- デモ環境：波長約7 cmの小さな砂漣、貝殻片（アサリ等の殻；G）、低〜高透明度の水。

## 6. 食性 (Feeding ecology)

- 肉食性。主にヨコエビ類、多毛類、カニ類（小型）、カイアシ類。少量の腹足類・タナイス類・等脚類（F）。
- **成長に伴う変化**：小型個体（1–2 cm）はヨコエビ・多毛類・カイアシ類、大型化につれて多毛類・カニ類が増加しカイアシ類は減少（F）。→ `preyPreference(TL)` に実装。
- 環境によりアミ類・小型エビ類の利用（ユーザー提示・一部資料；F/R）。
- 摂餌様式：底面を見ながら短く移動→注視→接近/短い突進→吸い込み（R: ハゼ科一般の吸引摂餌; P: 動画）。

## 7. 移動・行動 (Locomotion / behavior)

- 底生：腹鰭盤と胸鰭で砂上に体を支えて静止（P, R）。
- 間欠的移動：数cm の短い「ホップ」を繰り返し、止まって周囲を見る（P, R: 砂底性ハゼの saltatory search）。
- 危険時：急発進して数十cm逃げて着底、**または砂に潜る**（F）。
- 眼は左右独立に動く（R: ハゼ科一般）。

## 8. 繁殖・求愛 (Reproduction / courtship)

- 雄は**放射状の溝をもつ巣**を作る。巣から外へ掘る行動と、巣内の砂を掃き出す行動の繰り返しで溝が形成されクレーター状になる（F）。
- 雄の第1背鰭の伸長・暗色化（F）。繁殖期の雄の婚姻色の程度は資料で未確認。
- 雌への誇示（鰭を立てる側面誇示、巣へ誘導する往復）は**ハゼ科一般からの推定（R/G）**で、本種での記載は確認できていません。
- 雄間の闘争的側面誇示も **R/G**。
- 巣の基質（貝殻の下か、砂中の空洞か）は取得資料で未確認 → デモでは貝殻の下に置く（G）。

## 9. 不明・不確実な点 (Unknown or uncertain points)

1. 縦列鱗数・胸鰭条数・尾鰭分節鰭条数の本種での確定値（R値を使用）。
2. 巣の構造の詳細（溝の本数・長さ、蓋となる基質）— 論文全文未取得。溝6本・長さ約10 cmは **G**。
3. 求愛ディスプレイの具体的動作、雌の産卵場所・卵保護（R: ハゼ科は一般に雄が卵保護）。
4. 活動の日周性（昼行性として **G**）、潮汐に応じた行動変化（**G**）。
5. 遊泳運動学（尾打ち頻度・振幅・C-start 時間）は本種の実測なし → 近縁・同サイズ魚の値（R）。
6. 呼吸頻度は実測なし（70–160回/分、**R/G**）。
7. 雄の繁殖期の体色変化の程度。
8. 写真計測の比率は、遠近・レンズ歪み・体の屈曲・水中屈折を考慮し、真横に近く体がまっすぐな写真を優先して平均したもの（誤差±5%程度と見積もり）。

## 10. 3D 実装方針 (3D implementation plan)

- **プロシージャル生成**を採用：個体差（seed）を形状レベルで入れられ、LODごとにトポロジーを再生成でき、GLB 依存なしに既存プロジェクトへ導入できるため。
- 体：13断面キーフレームを Catmull-Rom 補間して lofting、眼窩の窪みと縁、口裂溝、頬の膨らみ、鰓蓋溝、下顎の突出を解析的に変形。
- 鰭：鰭条（三角柱）と鰭膜（プリーツ付き格子）を別メッシュ化、棘間膜の切れ込み、透過・薄膜の擬似SSS。
- 眼：眼球／虹彩（テクスチャ・虹色干渉）／水晶体（瞳孔から突出）／角膜（transmission, IOR 1.376, clearcoat）の4層。
- テクスチャ：UV 上でルールに基づき合成（アルベド・鱗ノーマル・ラフネス）。
- リグ：23 ボーン（下記）。スキニングは1つのスケルトンを全LODで共有。

---

## ファイル構成

```
Himehaze/
 ├ index.html               デモ（東京湾の干潟シーン）
 ├ Himehaze.js              モデル本体（THREE.Group）：スケルトン・LOD・眼
 ├ HimehazeAnimator.js      手続き的アニメーション（進行波、C-start、呼吸、胸鰭、視線）
 ├ HimehazeBehavior.js      行動生態AI（utility + state machine、底面raycast、姿勢合わせ）
 ├ model/anatomy.js         形態データ（根拠タグ付き）
 ├ model/HimehazeGeometry.js 体・鰭のスキン付きジオメトリ生成、ボーン配置
 ├ materials/HimehazeMaterials.js 部位別 PBR マテリアル
 ├ textures/HimehazeTextures.js   模様・鱗ノーマル・鰭膜・虹彩のプロシージャル生成
 ├ shaders/subsurface.js    擬似サブサーフェス（wrap + 透過散乱）
 ├ animations/              （Animatorの歩容パラメータは HimehazeAnimator.GAITS）
 ├ behavior/                （行動AIは HimehazeBehavior.js）
 ├ fx/SandParticles.js      砂粒・微細な砂煙
 ├ demo/                    デモ用ワールド（地形・caustics・餌・捕食者・照明プリセット）
 └ vendor/                  three.js r160 (MIT) と OrbitControls
```

## 使い方

```js
import { Himehaze } from './Himehaze/Himehaze.js';
import { HimehazeBehavior } from './Himehaze/HimehazeBehavior.js';

const fish = new Himehaze({ seed: 12, sex: 'male', breeding: true, TL: 0.07 });
scene.add(fish);
const ai = new HimehazeBehavior(fish, world, { nest: world.nests[0] });
// 毎フレーム
ai.update(dt);            // 内部で fish.animator.update(dt, cmd) を呼ぶ
fish.updateLOD(camera);
```

AI なしで直接動かす場合：`fish.animator.update(dt, { gait: 'swim', thrust: 0.8, turn: 0, pectoral: 'tuck', gaze: someVector3 })`

### 座標系・スケール
- 1 unit = 1 m。成魚 TL ≈ 7 cm（個体差 ±6%）。
- 魚ローカル：+X 前方、+Y 背側、+Z 右体側。Root 原点 ≈ 腹鰭盤の直上（重心付近）。
- `fish.contactOffset`：Root 原点から腹面接地点までの距離（着底高さ計算に使用）。

### World インターフェース（ホストゲーム側で実装）
```ts
raycastGround(raycaster, pos): { point: Vector3, normal: Vector3 } | null
predators: { position, radius, danger }[]
player: { position, velocity } | null
food: { type:'copepod'|'amphipod'|'polychaete'|'mysid'|'crab', size /*m*/, position, moving, eaten, visible }[]
shelters: { position, radius }[]
fishes: HimehazeBehavior[]
current: Vector3 (m/s)      timeOfDay: 0..24      tide: 0..1
sand(pos, intensity, heading): void     eat(food): void     clampToArena?(pos): void
```

## Rig（23 bones）

```
Root
 └ Body
    ├ Head ── Jaw, Opercle_L, Opercle_R, Eye_L, Eye_R
    ├ Pectoral_L, Pectoral_R, Pelvic
    └ Spine01 ── DorsalFin1
       └ Spine02
          └ Spine03 ── DorsalFin2, AnalFin
             └ Spine04 ─ Spine05 ─ TailBase ── Caudal
                                      └ TailMid ─ TailTip
```
追加ボーン：`Opercle_L/R`（呼吸・吸引時の鰓蓋外転）、`Caudal`（尾鰭の開閉）。

## アニメーション

- 進行波：`yaw_i = A·env(u_i)·sin(φ(t) − 2πk·u_i)`、`env(u) = h + (1−h)(0.15u + 0.85u²)`（頭部で小さく尾で大）。位相 φ は周波数を積分するので歩容切替時に破綻しない。
- 歩容パラメータ（R/G）：rest 0.25 Hz / idle 0.45 Hz / hover 2.2 Hz / crawl 4 Hz / swim 7 Hz / burst 15 Hz、振幅・波数も連続補間。
- C-start：Stage1 (≈28 ms) で逃避方向と反対に C 字屈曲 → Stage2 (≈60 ms) で逆方向の推進ストローク（R）。
- 呼吸：口腔（下顎・喉）拡張が先行、鰓蓋開大が約1/4周期遅れる。頻度は活動度＋ゆらぎノイズで非周期的。
- 胸鰭：左右独立。rest / flutter / stroke（這う）/ tuck（高速時に畳む）/ brace（警戒時に広げて踏ん張る）。
- 視線：眼（独立サッケード, τ≈25 ms）→ 頭（遅延, ±0.22 rad）→ 体（行動層が `headDemand` を受けて旋回）。

## 行動AI

内部状態：`hunger, fear, energy, curiosity, territoriality, breedingDrive`（+ 個性 `boldness`）。
外部刺激：`distanceToPlayer/Predator/Food/Shelter/Bottom/Conspecific, waterCurrent, timeOfDay, tideState`、接近速度（looming）。

状態：`IDLE_BOTTOM, SCAN, CRAWL, SHORT_SWIM, FREEZE, BURST_ESCAPE, BURY, FORAGE, REST, COURTSHIP, TERRITORIAL`

- 選択は utility スコア（+現状態へのヒステリシス、個体seedによる±10%の揺らぎ）。恐怖は割り込み。
- FORAGE：search（ホップ→静止して見る）→ fixate（眼→頭→体）→ approach（ホップ/最終突進）→ strike（吸い込み：15 ms 開口＋鰓蓋外転）→ handle（砂の吐き出し）→ 着底。獲物選好は体長依存（F）。
- 危険：警戒（FREEZE・鰭を立て眼で追う）→ または即 BURST_ESCAPE（C-start、16 BL/s、20–50 cm）→ 着底 → BURY（砂に潜る; F）または FREEZE。
- COURTSHIP（巣持ち雄）：巣から溝方向へ掘り進み→戻って砂を掃き出す、の反復（F）。雌が近いと側面誇示→巣へ誘導（R/G, 推定）。
- 底面：毎フレーム下方 Raycaster（地形を16×16タイルに分割し該当タイルのみ判定）→ 高さと法線 → 腹鰭盤が接する高さに `contactOffset` で配置、法線に体軸を合わせる（遊泳中は水平へ補間）。

## LOD

| LOD | 距離 | 体 (リング×周) | 鰭 | 眼 |
|---|---|---|---|---|
| LOD0 観察 | < 0.35 m | 170×72 | 鰭条あり・鰭膜4分割 | 角膜 transmission |
| LOD1 通常 | < 1.2 m | 96×40 | 鰭条あり・2分割 | 簡易角膜 |
| LOD2 遠距離 | < 4 m | 48×22 | 鰭膜のみ | 虹彩のみ |
| LOD3 | ≥ 4 m | 24×12 | 鰭膜のみ（全鰭保持） | 虹彩のみ |

シルエットを決める鰭（特に第1背鰭・胸鰭・尾鰭）は全LODで保持し、先に鰭条・分割数・角膜を削ります。

## 検証

`index.html?view=side|top|front|front34|back34|head|eye&preset=clearShallow|turbidFlat|lowSun|shade` で固定アングルの観察ができます（`&lod=0..3`）。詳細は下の「検証ログ」。

## 検証ログ (PHASE 8)

headless Chromium（SwiftShader, ソフトウェアGL）で固定アングル撮影と240秒の行動シミュレーションを実施。`docs/` にスクリーンショット。

| 画像 | 内容 |
|---|---|
| `docs/side_clear.png` | 側面・明るい浅瀬 |
| `docs/head_obs.png` | 頭部観察（LOD0） |
| `docs/top.png` | 上面 |
| `docs/turbid.png` | 濁った干潟 |
| `docs/lowsun.png` | 低角度日光・長い影 |
| `docs/swim.png` | SHORT_SWIM 中の進行波（上面） |
| `docs/lod2.png` | LOD2 |
| `docs/overview.png` | 6個体・行動AI稼働中 |

**修正したもの**
- 鰭の向きが前後反転していた → s空間で後方を +s に修正。
- 砂・魚が白飛び → caustics 関数の出力をクランプ。
- caustics パッチが LOD 数だけ多重適用されシェーダがコンパイル失敗 → マテリアル単位で1回だけ適用。
- 眼が頭から大きく飛び出し「カエル顔」→ 眼球中心を頭表面下 ≈0.45R に沈め、虹彩キャップを拡大。
- 体側斑が不明瞭 → 5個の体側暗斑（F）を大きく濃くし、背部の斑を細かく。
- 胸鰭が体に貼り付く → 静止時に外側へ開くよう調整。
- 地形 raycast が重い → 16×16 タイルに分割。底面は頭・腹鰭盤・尾の3本の ray で支持高さと勾配を取る。
- テクスチャ生成時間 2.2 s → 1.3 s（スタンプ処理）、ヒーロー以外は 512 px。

**240 s シミュレーション結果（6個体）**：状態遷移 IDLE→COURTSHIP（巣の掘削/掃き出し）→ 捕食者接近で FREEZE → BURST_ESCAPE（C-start）→ BURY（砂に潜る）→ FORAGE… を確認。捕食 15–20 回、NaN なし、最大浮上高 2.7 cm、接地誤差 −2 mm 程度（リップルの上を移動中の追従遅れ）。

**残っている問題（正直な評価）**
- 3/4 前方からの眼は依然としてやや大きく暗く見える。実物は虹彩に金属光沢の斑がより多い。写真との並列比較でさらに詰める余地あり。
- 体側の鱗は法線マップのみで、斜光下で鱗列のシルエットは出ない。
- 腹鰭盤は下からしか見えず、着底時の「盤で体を支える」姿勢は法線合わせと高さで近似。
- 雄の求愛誇示・雄間闘争は推定（R/G）。巣の溝本数・長さは G。
- 性能は SwiftShader では評価不能（CPUラスタライズ）。三角形数：LOD0 ≈ 38k / LOD1 ≈ 13.5k / LOD2 ≈ 2.7k / LOD3 ≈ 0.9k、描画コールは魚1匹あたり LOD0 約14、LOD2 約8。実GPUでの計測は未実施。
- 魚体への caustics は砂と同じパターンを適用しているが、体表への投影は近似。
- CRAWL 単独状態は FORAGE/SCAN の探索ホップに吸収されがちで、選択頻度が低い。
