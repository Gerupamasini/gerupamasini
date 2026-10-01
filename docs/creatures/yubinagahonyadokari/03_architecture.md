# ユビナガホンヤドカリ 技術設計（Phase 6–15）

## 1. 既存プロジェクトの理解（統合前提）

| 項目 | 既存の実装 | 本種での扱い |
|---|---|---|
| renderer | `GameRenderer`（ACES、sRGB、PCFSoftShadow）。フィールドは `FieldRenderer`（HalfFloat RT → 画面空間の水 `WaterPass`） | すべて深度を書く不透明マテリアル。水中の減衰・屈折・コースティクスは既存の水パスがそのまま掛かる |
| scene / camera | `PerspectiveCamera(70, near 0.05)`。観察時は `near = max(0.002, len×0.02)` の OrbitControls | 観察（ロック）時は LOD0 |
| loop / dt | `App.frame()` の実秒 dt（最大 0.1）。ドライバは `dt × simScale` を使う | 同じ。内部の物理は 1/240 s のサブステップ |
| world scale | 1 単位 = 1 m。+Y 上、+Z 前、+X は動物の左 | モデルは SL 単位で作り、`CrabBody.scale = SL[m]` |
| terrain | `Terrain.heightAt`（ドライバには `Floor.heightAt` だけが渡る） | 法線は差分で自前計算。殻・餌などの小物の高さは `PagurusMinutusWorld.heightAt` で地形に足す |
| water / tide | `Habitat.waterAt / sample`。流速の場は無い | `Floor.sampleAt` を CreatureSystem で供給。流速は `env.flow` 引数（既定 0） |
| creature manager | `CreatureSystem`、`DRIVERS[species.model.driver]`、glb を持たない種は `placeholder()` | `DRIVERS.pagurus` に手続き型モデルを登録。`nearDistance` で近距離個体を毎フレーム更新 |
| tank | MeshStandardMaterial を複製し、`onBeforeCompile` をコースティクスに差し替える | attach 時に本種のシェーダとタンクのシェーダを連結する |
| zukan | `placeholder().root` を静止表示 | placeholder は休息姿勢まで解いた状態で返す |

## 2. モジュール構成

```
src/creatures/yubinagahonyadokari/
  PagurusMinutus.js            HermitCrab 本体（組み立てと更新順序）
  PagurusMinutusMorphology.js  形態データ（SL 単位の比率、色、根拠タグ）
  PagurusMinutusRig.js         ボーン階層、関節軸、制限、腹部の姿勢付け
  PagurusMinutusModel.js       手続き型ジオメトリ（スキン付き、LOD0–2、剛毛カード）
  PagurusMinutusMaterial.js    外骨格・角膜・剛毛・殻・接地影のマテリアル
  PagurusMinutusShell.js       殻（5 種）、質量特性、動力学、適性評価
  PagurusMinutusLocomotion.js  歩容、IK、地形適応、旋回、衝突
  PagurusMinutusAnimator.js    微小運動、触角、眼柄、口器、鉗脚、退避と出現
  PagurusMinutusBehavior.js    内部状態、知覚、効用に基づく行動選択、殻の調査・交換
  PagurusMinutusWorld.js       個体間の共有（他個体、餌、空き殻、空間検索）
  PagurusMinutusLOD.js         LOD 段階と更新頻度
  PagurusMinutusDebug.js       デバッグ表示
  PagurusMinutusUtil.js        乱数、ノイズ、ばね
  PagurusMinutusDriver.ts      ゲームの Driver 実装
  PagurusMinutus.d.ts          TS から使う API の型
```

## 3. オブジェクト階層

```
HermitCrabRoot (Group)                      地面上の体中心。yaw = heading
├── CrabBody (Group, scale = SL[m])
│   ├── SkinnedMesh  body_LOD0 / LOD1 / LOD2（同じ Skeleton）
│   ├── SkinnedMesh  setae_LOD0 / LOD1（剛毛カード）
│   └── Bone "Body"（頭胸部。高さ・pitch・roll・退避時の後退）
│       ├── Shield, EyeStalk_L/R(+Cornea), Antenna1_L/R(3+2), Antenna2_L/R(2+10), Mxp3_L/R
│       ├── Cheliped_L/R: Coxa → Basis(=基節+坐節) → Merus → Carpus → Propodus → Dactylus
│       ├── Leg_L1/R1 (= P2), Leg_L2/R2 (= P3): Coxa → Basis → Merus → Carpus → Propodus → Dactylus → Tip
│       ├── Leg_L3/R3 (= P4), Leg_L4/R4 (= P5): 殻を保持する退化脚
│       ├── Abdomen0..5 → Telson, Uropod_L/R（殻の螺旋に沿って毎フレーム姿勢付け）
│       └── ShellAnchor（殻口の把持点）
├── Shell (Group)                           ShellDynamics がワールド変換を書く（別オブジェクト）
│   └── ShellMesh
└── ContactShadow（Mesh、地面に沿う楕円の影）
```

**脚の番号**: 依頼の例 `Leg_L1` に合わせ、歩行に使う脚から順に `Leg_*1` = P2、`Leg_*2` = P3、`Leg_*3` = P4、`Leg_*4` = P5 とした。
鉗脚（P1）は `Cheliped_*` とした。

## 4. 更新順序（1 フレーム）

1. **Behavior**: 知覚（脅威・餌・殻・環境）→ 内部状態 → 行動の選択と遂行。出力は Command（移動目標・速度・姿勢・鉗脚の作業・注視点・退避量）。
2. **Locomotion**: 体の移動・旋回、足の接地と踏み替え（stance/swing）、IK、体の高さと傾き。
3. **Animator**: 触角・眼柄・口器・鉗脚・P4/P5 を合成し、退避と出現のブレンド、腹部の姿勢を決める。
4. **Skeleton**: ワールド行列を更新し、ShellDynamics（ばね・ダンパ・接地）で殻の変換を求める。
5. **Debug**: 表示が有効なときだけ描く。

## 5. 主要な設計判断

- **殻は解析モデルが唯一の情報源**: 対数螺旋の管から形状を作り、質量・重心・慣性・殻口・内部容積を同じモデルから数値積分する。殻の評価と物理と見た目が一致する。
- **腹部は殻の螺旋に沿う**: 腹部ボーンを殻の内腔の中心線上に置く。殻交換では、殻外の自由曲線と殻内の螺旋を出し入れ量で切り替える。
- **剛体スキニング**: 硬い節は 1 ボーンに 100% 割り当てる。関節膜の輪だけを親子でブレンドし、硬い外骨格と柔らかい関節膜の差を変形でも見せる。
- **テクスチャを使わない**: 模様・顆粒・剛毛はバインドポーズ座標と節座標から手続き的にシェーダで描く。テクスチャメモリは 0。個体差は 8 段階に量子化したマテリアルを共有して表す。
- **歩行は手続き型 IK が主体**: 各歩脚が `footTarget / plantedPosition / stepProgress / stepHeight / strideLength` を持つ。立脚中の足先はワールド座標で固定し、滑らせない。
- **行動は効用ベース**: 状態ごとに内部状態・環境・個性から点数を出し、ヒステリシスと最短継続時間を付けて切り替える。反射層（脅威）が優先する。

## 6. LOD と性能予算

| 段階 | 用途 | 三角形 | 内容 | 更新 |
|---|---|---|---|---|
| LOD0 | 観察ロック、水槽、図鑑 | 約 70k | 主要な長毛を実ジオメトリ、剛毛カード、口器、P4/P5、腹部 | 毎フレーム全 IK |
| LOD1 | 通常プレイ（約 4 m 以内） | 約 12k | 剛毛カードを削減、触角鞭 10 ボーン | 毎フレーム（`nearDistance` 内） |
| LOD2 | 遠景（〜10 m） | 約 2.5k | 剛毛・口器・腹部を省略、触角は 3 セグメント | 2 フレームに 1 回、IK は 2 本ずつ交互に解く |

- **draw call**: 1 個体あたり体 1 + 剛毛 1 + 殻 1 + 影 1（LOD2 は 3）
- **SkinnedMesh**: 1 個体あたり表示中は 1–2
- **ボーン**: 約 100（ボーンテクスチャなので uniform 上限の問題は無い）
- **透明マテリアル**: 接地影だけ（剛毛は alphaTest＋alphaToCoverage で不透明として描く）
- **共有**: ジオメトリは種・LOD・損傷段階ごとにキャッシュし、全個体で共有する
