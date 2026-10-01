# 07 Three.js 実装設計(ヤマメ Oncorhynchus masou masou 河川型)

対象読者: 利用者(ゲーム開発者)と実装エージェント。本章は 02 形態・03 色彩・04 行動・05 アニメーションの仕様を、three.js r186.1 上の**モジュール・アセット・テスト**に落とす。数値は新規に作らず、既存章と監査(threejs_audit_a/b/c/d)から引く。

## 7.0 規約と前提

**出典タグ**: `[spec05 §5.1.2]`=本仕様書の他章。`[aud-A R5, R]`=threejs_audit_a の項目(S=ソース確認、R/H=ヘッドレス実行、T=Node 実行、K=一般知識、U=未確認)。`[aud-C §1.1-5, T]`=audit_c(audit_c は 01 章作成時点では欠落していたが、現在は `research/threejs_audit_c_assets_toolchain.md` として存在する)。`[E: 理由]`=資料の裏付けが無い設計値。`PROXY:種名`=他種の値。

**最重要の限界**: 監査は全て **CPU ラスタライザ(SwiftShader)上**で行われ、GPU 実機の性能・見た目・KTX2 変換先・WebGPU 実機は未測定である [aud-D §4, aud-C §4, aud-A U1]。ms の値は相対比にのみ使う。本章の「予算」はすべて [E] で、7.8 の実機計測で置き換える前提である。

**バージョン固定**

| 項目 | 版 | 根拠 |
|---|---|---|
| three | 0.186.1(`REVISION=186`、2026-09-24 公開、tarball の sha1 は registry と一致) | [aud-A §0] |
| @types/three | 0.186.0(ソースと食い違う箇所あり: `Skeleton.frame`、`useVertexTexture`、非 null の `boundingSphere`) | [aud-B §1.8] |
| Node.js | v22.22.0(監査環境) | [aud-C §5.0, aud-D §5.1] |
| glTF-Transform | core/extensions/functions/cli すべて 4.5.1 | [aud-C §2.9] |
| ヘッドレス Chromium | 141.0.7390.37(`/opt/pw-browsers/chromium`)、WebGL2 は SwiftShader | [aud-D §2.10] |

---

## 7.1 目標とターゲット

| 項目 | 決定 | 根拠 |
|---|---|---|
| 第一ターゲット | PC ブラウザ(Chromium 系)、WebGL2 | [E: 利用者要件] |
| 本線レンダラー | `WebGLRenderer` + `MeshPhysicalMaterial`。WebGL1 は不要(r163 で廃止) | [aud-A R1, S] |
| 並走検証 | `WebGPURenderer` + TSL。WebGPU 不可環境では WebGL2 バックエンドへ自動降格し、`MeshPhysicalMaterial` は `MeshPhysicalNodeMaterial` に自動置換される。降格後のスキン変形・iridescence・transmission は動作し、スキン変形の画素数は WebGLRenderer と完全一致(420→393 px) | [aud-A R1(c), R] |
| WebGPU を本線にしない理由 | `onBeforeCompile`/`ShaderChunk` 差し替えは WebGLRenderer 専用で、WebGPURenderer(降格後も)では `onBeforeCompile` が一度も呼ばれなかった。実 WebGPU アダプタでの動作・速度は未検証 | [aud-A R1(a), R; U1] |
| WebGPU 移行の判断基準 | ①compute で頂点アニメを GPU 化したい、②パッチでは書けない大きさの自前 BRDF が要る、③変形を影に自動反映したい、のいずれかが必須になったとき。それまでは WebGL に留まる | [aud-A R1(e), S] |
| GLSL パッチの書き方 | 機能単位の小関数に分け、後で TSL へ機械的に移せる形にする。`customProgramCacheKey()` を必ず上書き | [aud-A R1(b), R6, R] |
| 色管理 | `ColorManagement.enabled=true`(既定)、作業空間は linear-sRGB。色データ(baseColor/emissive/sheenColor/specularColor)のみ sRGB、ORM・法線は NoColorSpace(GLTFLoader は自動設定、自前 `TextureLoader` は手動で `colorSpace` を設定) | [aud-A R10, S+R] |
| トーンマップ | 初期値は `NoToneMapping`(three の既定)。採用は P3 で 03 章 §3.5.2 の p024 基準の色と比べて決める | [aud-A R10, S] / **未決**(下記) |
| 後処理 | 必要最小限。`outputBufferType: HalfFloatType`+`renderer.setEffects([...])` を既定候補にし、AO・DOF・SSR は 1 つずつ測ってから入れる | [aud-D §1.1-6, H+S] |
| フレームレート目標 | 60 fps(16.7 ms)。対象 GPU 世代は**未定**(09 章の確認事項) | [E] |
| 規模前提 | 「縄張りを持つ数匹〜数十匹」。群れ(数百〜数千)は対象外 | [E: 利用者要件。04 §4.6.6 の縄張り半径と整合] |

**未決(要確認)**: トーンマップ方式、対象 GPU、WebGPU を製品に含めるか(09 章)。

---

## 7.2 リポジトリ構成とランタイムのモジュール分割

### 7.2.1 リポジトリ構成案

現状のリポジトリは `docs/`(調査・仕様)と `tools/`(`photo/`、`threejs-audit/`)のみで、`package.json` は `tools/threejs-audit/` にしか無い。`tools/threejs-audit/harness.mjs` の `THREE_ROOT` はセッション限りの scratchpad の絶対パスを指しているため、そのままでは再現できない。**P0 で `three@0.186.1` を npm 依存にして直す**(09 章)。

```
/                      package.json (type: module, engines.node >=22, three 0.186.1 固定)
├─ src/
│  ├─ yamame/          Body, Eyes, Fins, Skeleton, Materials, Animations, Yamame.js (組立)
│  ├─ genome/          Genome 型, generate.js, validate.js, rng.js, presets
│  ├─ behavior/        perception/, decision/, steering/, explain/ (ExplainTrace)
│  ├─ locomotion/      wave.js (体波), modes.js (5.3 表), fins.js (5.5), mouth.js (5.6), turn.js (5.4)
│  ├─ environment/     flow.js, cover.js, drift.js, light.js, waterFog.js, caustics.js
│  ├─ population/      Population.js (個体群), tiers.js (LOD/描画方式の割当)
│  ├─ render/          createRenderer.js, patches/ (onBeforeCompile 小関数群), warmup.js
│  ├─ debug/           DebugUI.js, TraceView.js, ProvenanceBadge.js
│  └─ main.js
├─ assets/
│  ├─ src/             生成入力 (silhouette.json = 02 §2.2.2, params.json = 外部設定)
│  ├─ generated/       *.glb, *.ktx2 (生成物。コミットするかは 09 章の確認事項)
│  └─ vendor/          basis/ (KTX2 トランスコーダ), meshopt_decoder は three 同梱を使用
├─ tools/
│  ├─ build-assets/    loft.mjs, weights.mjs, morphs.mjs, textures.mjs, write-glb.mjs, validate-glb.mjs
│  ├─ photo/           (既存) morpho_stats.py, grid.py, colorsample.py
│  ├─ threejs-audit/   (既存) 監査ハーネス
│  └─ headless/        render-snapshot.mjs, silhouette-landmarks.mjs, bench.mjs
├─ tests/
│  ├─ unit/            wave, modes, genome, validate, explain (node --test)
│  ├─ asset/           glb-structure, deformation, morph
│  ├─ sim/             AT-01〜AT-14 (Node, 描画なし)
│  └─ render/          スナップショット (期待画像は tests/render/expected/)
└─ docs/yamame/        (既存) research/, spec/, photo_analysis/
```

パラメータは**コードに埋め込まず**、`assets/src/params.json`(Param 型: `{v, unit, min, max, prov, proxy, src}`)に置く。`prov` は 04 §4.1.3 の `Provenance` と同じ(A/B/C/M/P/E)で、DebugUI が E/PROXY を色分けする [spec04 §4.7.2, §4.1.3]。05 章は「全パラメータを外部設定(JSON)に出して差し替え可能にすること」と要求している [spec05 §0]。

### 7.2.2 ランタイムのモジュール分割

04 の 5 層(L1 Perception〜L5 Locomotion)と 05 の更新順に合わせる [spec04 §4.1.2, spec05 §5.7.2]。

| モジュール | 責務 | 入力 → 出力 | 更新頻度 | 根拠 |
|---|---|---|---|---|
| `Perception`(L1) | 世界状態から `PerceptSnapshot` を作る | Environment, 他個体, ThreatSource → `PerceptSnapshot` | 近景 15 Hz / 中景 5 Hz / 遠景 1 Hz | [spec04 §4.1.2, E] |
| `Decision`(L2+L3) | `Needs{F,H,T,R}` 更新、Utility 評価、状態機械、割り込み | Percept, Genome.traits → `StateId`+`LocomotionGoal`+`TraceEntry` | 近景 10 Hz(Needs は 5 Hz)。Startle は即時 | [spec04 §4.1.2, §4.3, E] |
| `Steering`(L4) | rheotaxis、arrival、障害物回避、定位点選択 | Goal, 流速場 → `SteerCmd{speed_rel_water, heading, rate_limits}` | 毎フレーム | [spec04 §4.1.2] |
| `Locomotion`(L5) | `SteerCmd` → 体波パラメータ (f, A_tail, φ)・モード・鰭・口・鰓蓋の目標値 | SteerCmd, Genome.motion → `BodyPose` (数値のみ) | 毎フレーム | [spec05 §5.2〜5.6] |
| `Yamame` | 1 個体の three オブジェクト束。下の 6 部品を所有し、`applyPose(BodyPose)` で骨・モーフに書く | BodyPose → bone.quaternion, morphTargetInfluences | 毎フレーム | [spec05 §5.7.1] |
| `Yamame.Body` | 体の `SkinnedMesh`(LOD 群)、モーフ影響度 | | | 7.4 |
| `Yamame.Eyes` | 眼球 2 個(眼球・虹彩・角膜)。眼ボーンの子として剛体 | | | [spec05 §5.6.3, spec02 §2.7] |
| `Yamame.Fins` | 鰭 6 種の膜メッシュ+条群ボーン | | | [spec05 §5.1.2] |
| `Yamame.Skeleton` | 62 ボーン、`restQ` の保持(`bone.userData`) | | | [spec05 §5.1.2, aud-B §1.4] |
| `Yamame.Materials` | 個体別マテリアル(模様テクスチャ・色)と共有マテリアル | Genome.pattern/color → 材質 | 生成時+婚姻色・濡れ具合などの連続量 | 7.3.5 |
| `Yamame.Animations` | `AnimationMixer` に載せる固定クリップ(additive、副ボーンのみ) | | 毎フレーム | [spec05 §5.7.1] |
| `Environment` | 流速場・カバー・ドリフト・光・水温・水中フォグ・コースティクス | | 毎フレーム | [spec04 §4.4, aud-D §1.3, §1.4] |
| `Population` | 個体の生成・破棄、Genome 生成、LOD/描画方式の割当、共有 mixer | | 毎フレーム | 7.5, 7.6 |
| `DebugUI` | ExplainTrace 表示、Provenance 色分け、パラメータ編集、計測 HUD | | 毎フレーム | [spec04 §4.7] |

**依存の向き**: `behavior → locomotion → yamame(three)` の一方向。`behavior` と `locomotion` と `genome` は three に依存させない(Node の単体テストで GPU・DOM 無しに動かすため) [E: 05 章 T-A* と 04 章 AT-* が Node で走ることを前提にしている]。three に依存するのは `src/yamame/`, `src/render/`, `src/environment/` の描画部分だけ。

**フレーム更新(1 フレーム)** — 05 §5.7.2 と audit_b §1.2 の順序をそのまま採る。

```js
const timer = new THREE.Timer(); timer.connect(document);        // Clock は r183 で非推奨 [aud-B §1.2, S]
function frame(ts) {
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 1 / 20);                  // [spec05 §5.7.2, E: タブ復帰時の mixer 飛び防止]
  population.updateBehavior(dt);        // L1〜L4 (各頻度でスキップ) → SteerCmd
  for (const f of population.skinned) f.locomotion.step(dt);      // L5: f, A, φ += 2π·f_disp·dt, 鰭・口・鰓蓋の目標
  for (const f of population.skinned) f.mixerRestore();           // 同一ボーン併用時のみ [aud-B §1.4-B]
  mixer.update(dt);                                               // 副ボーンの additive クリップ (1 mixer, clipAction(clip, root))
  for (const f of population.skinned) f.applyPose();              // 脊椎・顎・鰓蓋・眼・鰭・モーフを restQ ⊗ 値 で絶対指定
  population.moveGroups(dt);                                      // 移動・向きは mesh と root の共通の親 Group [aud-B §1.5]
  population.updateFarTier();                                     // InstancedMesh 行列・morph 重み
  renderer.render(scene, camera);                                 // skeleton.update() は render 内 [aud-B §1.2]
}
```

逆順(手続き→mixer)は禁止。`action.stop()`/フェード終了で手続き値が original に戻る点に注意 [aud-B §3-6]。

---

## 7.3 アセットパイプライン

### 7.3.1 方針と制約

| 制約 | 内容 | 根拠 |
|---|---|---|
| Blender 無し | 手続き生成+glTF-Transform の `Document`/`NodeIO` で GLB を書く。DCC 経由の手作業を前提にしない | [aud-C §1.1-1, T] |
| Node のみで完結 | 「手続き的ロフト → スキンウェイト → モーフ → テクスチャ → GLB → ブラウザ読込」が Node.js だけで動いた。PoC は三角形 384・頂点 236・骨 3・モーフ 1・PBR(clearcoat+iridescence+ior+specular+texture_transform)・テクスチャ 3 枚で **22 変種**を作り全て r186 `GLTFLoader` で読み込めた。変形は glTF 仕様の CPU 計算と 0.000 mm 差(float) | [aud-C §1.1-1, T] |
| **規模は未検証** | PoC は骨 3・頂点 236。本モデルの 62 骨・数千〜万頂点・2K テクスチャでのエンコード時間と変形誤差は**未測定** | [aud-C §4] |
| KTX2 | 公式 KTX-Software の取得経路はサンドボックスで遮断(npm レジストリのみ到達)。npm 経由で作れる (A) `ktx2tools@1.1.0`(**非公式**再パッケージ、KTX-Software 4.4.0 の `ktx`/`toktx` Linux バイナリ同梱、macOS 無し)+`gltf-transform etc1s/uastc`、または (B) `ktx2-encoder@0.6.0`(WASM、プロセス内)。いずれもハッシュ固定、`--ignore-scripts` で導入して内容確認 | [aud-C §1.1-2, §2.9, §3-17, T] |
| gltfpack | npm 版 1.3.0 は **BasisU 無しでビルド**されておりテクスチャ圧縮(`-tc`)不可。メッシュ圧縮のみ。本線にしない | [aud-C §1.1-10, T] |
| GLTFExporter | 制作には使わない(圧縮拡張を書けない、`KHR_materials_diffuse_transmission` は消える、KTX2 は PNG に展開される)。デバッグ・往復確認用 | [aud-C §1.1-8, T] |
| Draco | 不採用(この規模では差が数 KB、decoder が wasm 192〜286 KB+JS 58 KB) | [aud-C §1.1-4, T] |

### 7.3.2 標準手順(audit_c で動作確認済みの形)

```
[tools/build-assets]
 1. loft.mjs      silhouette.json(02 §2.2.2) + 断面(超楕円) → 頂点・法線・UV・補助属性 (_S, _THETA)
 2. weights.mjs   24 脊椎+副ボーンへの JOINTS_0(Uint16) / WEIGHTS_0(Float32), 最大4本, 正規化
 3. morphs.mjs    相対モーフ差分 (POSITION, NORMAL)
 4. textures.mjs  共有の法線/ORM (PNG, @napi-rs/canvas + pngjs), 鰭 RGBA, 眼
 5. glTF-Transform: Document 構築 (Mesh/Primitive/Target/Skin(IBM)/Node(骨)/Animation/Material)
 6. doc.transform( unweld(), tangents({generateTangents: mikktspace}), weld() )   // 法線マップがある場合
 7. [任意] reorder + quantize(POSITION を含めない) + EXTMeshoptCompression(FILTER) + KHRMeshQuantization
 8. NodeIO.setVertexLayout(VertexLayout.SEPARATE).write('yamame_hero.glb')
 9. gltf-transform etc1s|uastc  → KTX2 化 (ktx 4.4 を PATH に。toktx だけでは失敗)
10. gltf-validator (エラー 0 を確認。KTX2/AVIF/WebP/meshopt は「未対応拡張」警告が出るのが正)
11. 検証: playwright-core → three r186 GLTFLoader → AnimationMixer を進めて getVertexPosition を CPU 計算と比較
```
[aud-C §1.2, T]。手順 6 の `tangents` は unwelded 専用で順序は `unweld → tangents → weld`。npm の `mikktspace` を three の `computeMikkTSpaceTangents` に直接渡すと throw する(`isReady` 無し) [aud-C §3-5, §3-6]。TANGENT があると `GLTFLoader` はマテリアルを複製せず `normalScale.y` も反転しない [aud-C §3-7, S]。

**使うパッケージ(版)**

| 用途 | パッケージ | 版 | 備考 |
|---|---|---|---|
| GLB 構築 | `@gltf-transform/core` / `extensions` / `functions` / `cli` | 4.5.1 | [aud-C §2.9] |
| メッシュ最適化 | `meshoptimizer` | 1.3.0 | simplify/reorder/encoder。cli は 1.2.0 を入れ子で併用(共存可) |
| タンジェント | `mikktspace` | 1.1.1 | three 同梱版と出力が最大差 0 |
| 画像 | `@napi-rs/canvas` 1.0.9(推奨)、`pngjs` 7.0.0、`sharp` 0.35.5 | | プリビルドは npm 同梱。`canvas`(node-canvas)3.2.3 は取得遮断環境で node-gyp ビルドに落ちうる |
| KTX2 | `ktx2tools` 1.1.0 または `ktx2-encoder` 0.6.0 | | 色空間はスロット別(7.3.4) |
| 検証 | `gltf-validator` | 2.0.0-dev.3.10 | CI ではエラー数だけで判定 [aud-C §3-18] |
| ブラウザ | `playwright-core` 1.63.0(`executablePath` 指定) | | `install chromium` は CDN 遮断で失敗 |

### 7.3.3 モデル生成(ロフト)の仕様

| 項目 | 仕様 | 根拠 |
|---|---|---|
| 体軸 | s=0(吻端)〜1(尾鰭基部)を**リング列**で切る。リング数は LOD0 で 96、周方向 40 を初期値とする(頂点約 3,900、三角形約 7,700) | [E: 24 脊椎ボーンの区間当たり 4 リング。数は 7.5 の予算で調整] |
| 側面形 | 背側 d_dorsal(s)・腹側 d_ventral(s) は 02 §2.2.2 のシルエット表(s=0〜0.95、s=1 は尾柄高 0.09 を外挿) | [spec02 §2.2.2, P: profile_mean.json n=27] |
| 断面 | 超楕円。幅/高 = `body_width_over_depth` 0.55(0.45〜0.65)、指数 2.0(1.8〜2.4)。腹側をやや丸く | **未取得**。[spec02 §2.2.4, E: 体幅の資料が無い] |
| 頭部 | 外形のみ(骨はモデルしない)。吻は丸く鈍く、眼は頭の上半分・吻寄り、口裂後端は眼中心の約 0.4 眼径後方 | [spec02 §2.3, §2.4.3, P] |
| 鰭 | 6 種を別 primitive(半透明)。起点 s は背 0.504、腹 0.574、臀 0.751、脂 0.843、胸基部 0.258、尾基部 1.0。条数は `fin_ray_count_*` で個体ごと(背 12、胸 13、腹 9、臀 13、尾の主鰭条 19) | [spec02 §2.5, P/A, PROXY:O. mykiss(尾)] |
| 鱗 | 形状に凹凸を作らず、法線マップ+粗さ+AO。鱗ピッチ 0.7 %SL(0.55〜0.9) | [spec02 §2.6, E+P]。displacementMap は頂点密度が非現実的 [spec01 §1.5, r14 §1-7] |
| 補助属性 | 頂点ごとの `_S`(体軸位置)・`_THETA`(周方向角)をカスタム属性で GLB に持つ(Draco/Meshopt/`reorder` は頂点順を変えるため、頂点番号をキーにした外部データは持たない) | [aud-C §3-11]。**ランタイムでのカスタム属性の往復は未実行 [U]** |
| UV | 側面を体軸方向 u=s、周方向 v=θ の**円筒展開**(模様は側面中心で歪みが小さい)を第 1 UV。鰭は別 UV | [E] |

### 7.3.4 GLB の構造

glTF にはノード木とは別に最上位配列(`materials`、`animations`、`skins`、`meshes`)がある。依頼された「Yamame/Body/Eyes/Fins/Skeleton/Materials/Animations」は次のように対応させる。

| 論理区分 | GLB 上の実体 | 命名 |
|---|---|---|
| `Yamame` | シーンのルート `Group` ノード(`extras` に生成パラメータ要約・版・LOD 情報) | `Yamame` |
| `Body` | `SkinnedMesh`。primitive: 体(不透明)、口腔内側、(LOD ごとに別メッシュ。7.5) | `Body_LOD0`, `Body_LOD1`, `Body_LOD2` |
| `Fins` | 鰭膜(半透明)の primitive。体メッシュと同じ `skin` を参照する別メッシュ | `Fins_LOD0`… |
| `Eyes` | 眼球・虹彩・角膜の非スキンメッシュ。**眼ボーン(`eye_L`, `eye_R`)の子ノード**(眼の回転にボーンが追従する) | `Eye_L`, `Eye_R` |
| `Skeleton` | 62 ボーンのノード木。ルート `fish_root` は `Yamame` の子で、`SkinnedMesh` の兄弟 | [spec05 §5.1.2 の名称: `fish_root`, `spine_00..23`, `jaw_lower`, `maxilla_L/R`, `hyoid`, `opercle_L/R`, `eye_L/R`, `pectoral_*`, `pelvic_*`, `dorsal_*`, `anal_*`, `adipose_01/02`, `caudal_hub`, `caudal_ray_*`] |
| `Materials` | 最上位 `materials[]`: `M_Body`, `M_Fin`, `M_Eye_Iris`, `M_Eye_Cornea`, `M_Mouth` | |
| `Animations` | 最上位 `animations[]`: 副ボーンの additive 用クリップ(2〜4 s ループ): `fin_flutter`, `pec_scull`, `cough` 等。**脊椎にはトラックを置かない** | [spec05 §5.7.1] |

- 論理区分は `extras.groups = {Body:[…], Fins:[…], Eyes:[…], Skeleton:[…]}` に名前で列挙し、ランタイムは `getObjectByName` ではなく `extras` から引く。gltfpack 系の最適化はメッシュ名を `mesh_0` に変え子ノードを挟むため、名前探索が壊れる [aud-C §3-10]。
- 休止姿勢は**恒等回転**、軸規約は +X=前、+Y=背、+Z=右 [spec05 §0]。書き出し側の骨が非恒等の休止回転を持つ場合は `restQ` を保存して `restQ ⊗ 値` で書く(ポップ防止) [aud-B §3-19]。
- 複数メッシュが同じ `skin` を参照したときのロード結果(Skeleton が 1 つに共有されるか、`SkinnedMesh` の `bindMatrix` が揃うか)は audit_c が**未実行**(複数 SkinnedMesh の結合は未実行 [aud-C §4])。P1 の受け入れ項目にする。複数 primitive を持つメッシュが `Group` として読まれる挙動は一般知識 [K] で、P1 で確認する。
- ウェイトは頂点あたり**最大 4**、`JOINTS_1/WEIGHTS_1` は無視される。書出し後に `normalizeSkinWeights()` 相当を一度保証する(未正規化で合計 2 → 約 2 倍に伸びる) [aud-B §1.6, T]。`JOINTS_0` は Uint16(または Uint8)、`WEIGHTS_0` は Float32。Uint32 は避ける [aud-B §1.6]。

### 7.3.5 拡張と GLTFLoader/GLTFExporter の対応

| 拡張 | 用途 | GLTFLoader | GLTFExporter | 備考 |
|---|---|---|---|---|
| `KHR_materials_clearcoat` | 水膜(空気中のみ) | 反映 | 書出し可 | 水膜 F0=0.0204 に対し clearcoat F0=0.04 固定で垂直 +0.02、80° で +0.06 の誤差 [spec01 §1.5, r14 §1-5]。0↔正で再コンパイル [aud-A R2] |
| `KHR_materials_iridescence` | 虹彩色の弱い上乗せ(鰓蓋・腹側・体側境界。写真 70 枚中 6 枚) | 反映 | 書出し可 | 外側媒質は空気固定(水中では厳密でない)。`iridescenceThicknessRange` 既定 [100,400] nm、マップ無しは最大値 [aud-A §2.1.1, S][spec03 §3.6.2] |
| `KHR_materials_transmission` / `KHR_materials_volume` | 眼の角膜・水滴のみに限定 | 反映 | 書出し可(transmission に volume が付く) | 不透明を再描画する追加パス(不透明 5+透過 1 → 描画 11 回)。鰭・薄膜には使わない [aud-A R8, R] |
| `KHR_materials_ior` / `specular` / `sheen` / `anisotropy` / `emissive_strength` / `dispersion` | 必要に応じて | 反映 | 書出し可 | サンプラー予算に注意(下) [aud-C §2.12, T] |
| `KHR_texture_transform` | UV 調整 | 反映 | 非恒等のみ書出し | |
| `KHR_texture_basisu` | KTX2 | `KTX2Loader` 経由 | 書けない(PNG に展開) | `detectSupport(renderer)` をロード前に呼ぶ [aud-C §3-8] |
| `EXT_meshopt_compression` | 頂点圧縮 | `MeshoptDecoder` | 書けない | POSITION は float のまま(7.3.6) |
| `KHR_materials_diffuse_transmission` | 半透明鰭の拡散透過 | **未対応**(`userData.gltfExtensions` に残るのみ) | **消える** | 鰭はアルファ合成の薄膜+追加透過光項(カスタム)で表現 [spec01 §1.5, aud-C §3-13] |
| `EXT_mesh_gpu_instancing` / `KHR_lights_punctual` / `EXT_materials_bump` | 使わない予定 | ソース確認のみ | | 実行未確認 [aud-C §4] |

**サンプラー予算**: STANDARD/PHYSICAL は dfgLUT で常時 1 枠。map+normal+ORM×3+emissive で 8、そこへ iridescence(2)+sheen(2)+clearcoat(3) の全マップを足すと 15。`MAX_TEXTURE_IMAGE_UNITS` は SwiftShader で 32 だが WebGL2 の最小保証は 16、実機に 16 のものがある(影・環境・ボーン・モーフを同時に使う材は超過しうる) [aud-A R5, aud-D §3-15]。**体マテリアルは**: `map`(個体別アルベド)、`normalMap`、ORM(同一 Texture を 3 スロット)、`envMap`(PMREM 1)、影付き平行光 1 灯 → 約 8 枠に収め、iridescence/clearcoat はテクスチャマップを使わず**スカラー値のみ**で与える [E: 枠節約]。ボーンテクスチャは頂点シェーダで別枠(`MAX_VERTEX_TEXTURE_IMAGE_UNITS` 32 は実機 16〜32) [aud-D §2.10]。

### 7.3.6 圧縮の既定

| 対象 | 方式 | 根拠 |
|---|---|---|
| 共有の法線・ORM(近景用) | KTX2 UASTC(level 2+zstd18)。3×512² で PNG 738.8 KB→447 KB、描画 PSNR 55.7 dB、CLI 1.5 s | [aud-C §2.10, T] |
| 個体別アルベド | **ランタイム生成**(7.6.4)。GPU 圧縮は無い(three にランタイム BC7/ASTC エンコードは無い)。2048×1024 RGBA8+ミップ ≈ 11.2 MB/個体、1024×512 なら ≈ 2.8 MB/個体 | [aud-C §2.10, 算術: 2048×1024×4 B×4/3] |
| 遠景用・小物 | ETC1S 全部(3×512² で 81 KB、PSNR 45.0 dB) | [aud-C §1.1-3, T] |
| ジオメトリ | meshopt は**任意**。使う場合は POSITION を float のまま(`quantize({pattern: /^(TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/, patternTargets: /^(NORMAL|TANGENT)(_\d+)?$/})`+`KHRMeshQuantization`+`EXTMeshoptCompression(FILTER)`)。`meshopt()` 既定・`quantize()` 既定・gltfpack 既定は IBM に逆量子化行列が混ざり `skeleton.pose()` が骨を壊す(PoC で最大 1,000 mm、gltfpack で 16,627,983 mm) | [aud-C §1.3, §3-1, T] |
| KTX2 の色空間 | baseColor=sRGB、法線・ORM=linear。`gltf-transform etc1s/uastc` CLI は自動。`ktx2-encoder` の既定は**全テクスチャ sRGB 扱い**(PSNR 33.05 dB 対 47.28 dB) | [aud-C §3-2, T] |
| ミップ・サイズ | ミップは必ず焼く(無いと minFilter が Linear になりチラつく)。4 の倍数サイズ | [aud-A R12, aud-C §3-8] |
| 変換先 | 環境依存(SwiftShader=BC7、Linux Mesa=BC7 に落ちる、モバイルは ASTC/ETC2 の見込み)。**実機未確認** | [aud-C §3-9, R] |

法線マップの向き(緑チャンネルの上下)と鱗の凹凸の見え方は PoC では人工データで**未確認** [aud-C §4]。TANGENT のモーフは three が非対応で、大きなモーフではタンジェントが追従しない [aud-C §4, S]。

### 7.3.7 実行時の読み込み

```js
const renderer = new THREE.WebGLRenderer({ antialias: true });
const ktx2 = new KTX2Loader().setTranscoderPath('/vendor/basis/').detectSupport(renderer);  // 1 インスタンスのみ [aud-C §1.4]
const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('yamame_hero.glb');
// 個体化: SkeletonUtils.clone (geometry・material 共有、skeleton・モーフ重みは個体別) → 個体別 material を作る
```
素の `clone()` は skeleton を共有するので使わない [aud-B §3-13, T]。個体別マテリアルは複製後に `mesh.material = base.clone()`(`Mesh.copy` は材質を参照共有) [aud-B §3-13]。個体破棄時は `mixer.uncacheRoot(root)` と `skeleton.dispose()`、`texture.image.close?.()`(ImageBitmap は dispose で解放されない) [aud-B §3-12, aud-C §3-14]。ランタイムで `BufferGeometryUtils.mergeVertices` を呼ばない(インターリーブ配置で `TypeError`)。必要な溶接はオフラインで済ませる [aud-C §3-3]。

---

## 7.4 スケルトン・スキニング・モーフ

### 7.4.1 05 章のリグ(62 ボーン)を three の制約へ写す

| 項目 | 05 章の仕様 | three 側の制約・結論 | 根拠 |
|---|---|---|---|
| ボーン総数 | 62(fish_root 1、spine 24、jaw_lower 1、maxilla 2、hyoid 1、opercle 2、eye 2、胸 8、腹 6、背 4、臀 3、脂 2、caudal_hub 1、caudal_ray 5) | コード上の上限は無い。ボーンテクスチャ 37〜64 本=16×16。**62 本は 16×16 に収まり、上限 64 まで予備 2** | [spec05 §5.1.1, aud-B T1] |
| ボーンテクスチャのサイズ | | `size = max(4, ceil(sqrt(N×4)/4)×4)`。N=62→16×16。float RGBA で 16×16×16 B = 4,096 B。毎フレーム全体を再アップロード | [aud-B §1.6, 算術] |
| 1 頂点の影響 | | **最大 4**。5 本以上は無視 | [aud-B §1.6, S] |
| 脊椎 24 本 | 等間隔 s_j=j/24 | 1 関節の最大角: 尾端振幅 0.10L で 12°、0.12L で 15°、0.20L で 24°(12 本だと 23°/27°/43°) | [aud-B §1.3, T19] |
| 鰭条 | 条群ボーン(胸 3、腹 2、背 3、臀 2、尾 5)+鰭膜のスキン/テクスチャ。鰭条 1 本ごとのボーンは置かない | 4 影響制限と 64 本上限のため | [spec05 §5.1.2, E] |
| 体波 | `bone_j.quaternion = restQ_j ⊗ R_Y(θ_j − θ_{j−1} + bias_j)` | 回転のみで鎖長を保存(横ずらしだと 0.10L で +3.2%、0.17L で +8.4% 伸びる) | [spec05 §5.2.1, aud-B T15] |
| 移動 | 個体 Group で行う | `fish_root` を動かすとカリング球が古くなる(root を 500 動かすと実体が視錐台内でも描画されない) | [aud-B §1.5, T4-a] |

**ウェイト設計(`weights.mjs`)**

| 領域 | 影響ボーン | 方針 |
|---|---|---|
| 胴〜尾(s≥0.25) | 隣接する spine 2 本(接合の前後で線形、必要なら 3 本) | s の区間 [s_j, s_{j+1}] の中点でウェイトが 0.5/0.5。線形ブレンドスキニングは関節角が大きいほど崩れるが閾値は未検証 [aud-B §1.3] |
| 頭部(s<0.25) | spine_00..05 + `jaw_lower`/`hyoid`/`opercle` | 頭挙上は spine_02..06 に重み 0.10, 0.15, 0.20, 0.25, 0.30 で分配 [spec05 §5.1.2]。下顎・舌骨・鰓蓋は局所領域のみ 1.0 近傍、境界は 2〜3 本でぼかす |
| 眼 | `eye_L/R`(剛体メッシュ) | 眼窩周りのスキンは spine_02 主体。眼球メッシュはウェイトでなくボーンの子 |
| 鰭 | 基部ボーン+条群ボーン | 鰭膜は基部から縁に向けて条群ボーンへ滑らかに移す。**鰭の厚み**は `fin_membrane_thickness_mm` 0.04(0.02〜0.08) [spec02 §2.5, E] |

### 7.4.2 モーフターゲット

three r186 のモーフは常にテクスチャ方式で、旧来の「8 本まで」の制限は無い。`geometry.morphTargetsRelative = true` を使う(そうでないと基準の重みが 1−Σw になる)。テクスチャは**ジオメトリごとに 1 回**作られ、初回描画後に `morphAttributes` を書き換えても反映されない → 全ターゲットをロード時に確定する [aud-B §1.7, S]。ターゲット数が違うと別プログラム(`MORPHTARGETS_COUNT` が define) [aud-B §3-17]。

| # | モーフ名 | 用途 | 既定/範囲 | 駆動 | 根拠 |
|---|---|---|---|---|---|
| 1 | `mt_gape` | 口の開き(骨と併用、口腔内側・唇) | 0〜1 | 手続き(ストライク/呼吸) | [spec05 §5.1.3, E] |
| 2 | `mt_opercle_flare` | 鰓蓋の縁の浮き | 0〜1 | 手続き | 〃 |
| 3 | `mt_branchiostegal` | 鰓条骨膜の展開 | 0〜1 | 手続き | [r15 F-29, M] |
| 4 | `mt_buccal_swell` | 頬の膨らみ | 0〜1 | 手続き | [E] |
| 5 | `mt_kype` | 雄・成熟個体の下顎フック | 0〜1(河川型成熟雄 maturity>0.8 で 0.7) | 個体差 | [spec02 §2.8, E]。発達量は未取得 |
| 6 | `mt_upper_jaw_ext` | 上顎の伸び | 0〜1(成熟雄で 0.5) | 個体差 | [spec02 §2.8, E] |
| 7 | `mt_body_depth` | 体高 | ±1SD = ±0.024 SL(平均 0.242 SL) | 個体差 | [spec05 §5.1.3, P: n=27] |
| 8 | `mt_head_len` | 頭長 | ±0.036 SL(平均 0.264 SL) | 個体差+成熟 | [spec05 §5.1.3, P: n=26] |
| 9 | `mt_peduncle` | 尾柄の細さ | ±0.013 SL(平均 0.091 SL) | 個体差 | [spec05 §5.1.3, P: n=27] |
| 10 | `mt_eye_size` | 眼径(成長) | 眼径/頭長: parr 0.225±0.036、成魚 0.161±0.013(n=4)。SL との対応は parr(SL≈7 cm)=+1、成魚(SL≥15 cm)=−1 の線形 | 個体差 | [spec05 §5.1.3, P][spec02 §2.8, E] |
| 11 | `mt_belly` | 腹部の膨らみ | 0〜1 | 個体差 | [spec05 §5.1.3, E] |
| 12 | `mt_fin_wear` | 胸・背鰭の欠け | 0〜1 | 個体差 | [spec05 §5.1.3, E; r10 F-07/F-30, PROXY:タイセイヨウサケ] |
| (13〜16) | `mt_belly_slim_postspawn`, `mt_hatchery`, `mt_smolt`, `mt_hump` | 産卵後・放流由来・スモルト・降海型雄の隆起 | 既定 0 | 主モデルは**残留型**のため**搭載しない**。P7 以降の任意 | [spec02 §2.8, E] |

**搭載数は 12(必須)+任意 4 = 最大 16** [E: ユニフォーム/層数に余裕を残す]。`MAX_ARRAY_TEXTURE_LAYERS` は SwiftShader で 2048、実機値は未確認 [aud-B §4]。モーフテクスチャの容量は `頂点数 × 2 texel(位置+法線) × ターゲット数 × 16 B`。頂点 15,000(LOD0 の上限案)・16 ターゲットで約 7.7 MB(算術) [aud-B T10c の構成式]。

**資料間の差(整合メモ)**: 02 の `mt_head_length`(−0.1〜+0.1 ×SL、成熟雄で +0.02 [E])と 05 の `mt_head_len`(個体差 ±0.036 SL)は同じ形状軸。**1 つのターゲット `mt_head_len` に統合**し、影響度 = 個体差 + 成熟加算とする(係数は両方とも [E]/[P])。

**眼の大きさ**: `mt_eye_size` は眼窩の凹み・眼窩縁を動かし、眼球メッシュ(眼ボーンの子)は個体ごとの `scale` で合わせる [E: 眼球は剛体で、ウェイト/モーフに載せない]。眼窩縁込みの外径は `eye_outer_d_over_sl` 0.056(parr/juv 0.058、adult 0.046) [spec02 §2.7, P]。

### 7.4.3 プロシージャルとクリップの併用方針

05 §5.7.1 の担当分離をそのまま実装する。

| 所有者 | 対象 | 書き方 |
|---|---|---|
| プロシージャル(CPU) | spine_00..23、頭挙上、jaw/hyoid/opercle、eye、胸鰭 abd、腹鰭、背・臀鰭、尾鰭 spread、モーフ影響度 | 毎フレーム `restQ ⊗ 値` を絶対指定 |
| 固定クリップ(AnimationMixer, additive) | 各鰭の微小ふらつき(2〜4 s)、胸鰭スカルの揺らぎ、咳(鰓蓋)、休息ポーズの微調整 | `makeClipAdditive(clip, 0)` 後に `weight`=振幅、`timeScale`=周波数 |
| 両方が同じボーンを触る場合 | | audit_b §1.4-B の 4 ステップ(前回 mixer 出力を戻す → `mixer.update` → δ=restQ⁻¹⊗mixerOut → `proc ⊗ δ`)。素朴な `q.multiply(δ)` は蓄積バグ |

守るべき落とし穴 [aud-B §3]: `makeClipAdditive` は引数のクリップを**破壊的に変更**(先に `clip.clone()`)、`crossFade` は incoming を `play()` しない(`reset().play()` が別途要る)、`LoopRepeat` は `time==duration` で 0 に折り返す(最後のキー=最初のキー)、トラック名は予約文字 `[ ] . : /` を含めず `PropertyBinding.sanitizeNodeName` 後の値と一致させる、同名の骨が複数あると最初の 1 つのみ。mixer は**個体ごとに作らず 1 つ**に `clipAction(clip, 個体root)` で載せる [aud-B §1.1, T5-e]。

**カリング**: Hero は `frustumCulled = false`(個体が少ないため最も安全) [aud-B §1.5]。中景以下は、ロード時に休止姿勢・`updateMatrixWorld(true)` 後に `computeBoundingSphere()` し、半径に余白を足して固定する(クローン前に計算。クローンは球を複製する)。**余白の根拠**: 強く曲げた鎖(各関節 0〜0.6 rad)で休止球から最大 2.25 はみ出した(体長 5、休止球半径 2.62)が、実際の泳ぎ(尾端 ≲0.12〜0.2 L)での必要余白は**未計測** [aud-B §1.5, §4]。暫定値: 通常遊泳の後縁振幅 A_te = 1.33×A_tail(最大 0.14) = 0.186 SL [spec05 §5.2.2] に加え、C-start の屈曲(100° [spec05 §5.3.3, E])を許容して**半径に 0.5 SL を加算** [E: 暫定。T-A14 で検査]。毎フレームの `computeBoundingSphere()` は禁止(5k 頂点で約 2〜2.5 ms) [aud-B §1.5, T4-c]。

**表示周波数**: 尾鰭の表示用 f は 20 Hz に丸め、12 Hz 以上で振幅を段階的に減らしブラーを足す(60 fps のナイキスト 30 Hz 付近以上は逆回転に見える) [spec05 §5.2.3, aud-B §3-22]。

---

## 7.5 多数個体: 描画方式と LOD

### 7.5.1 結論(audit_b の個体数別方式と、依頼の 3 段構成の調整)

r186 では **SkinnedMesh を InstancedMesh/BatchedMesh に載せる標準の手段が無い**。スキニングの有効化は `object.isSkinnedMesh`、インスタンスは `object.isInstancedMesh` と別々の型フラグで、`InstancedMesh.js` に skeleton の記述が 0 件、`BatchedMesh.js` は morph/skin/skeleton/bone の記述が 0 件。シェーダの `getBoneMatrix(i)` はインスタンス番号を取らない [aud-B §2.7, S]。ただし**モーフは `InstancedMesh.morphTexture` で個体別の重みを持てる** [aud-A R13, S]。

依頼文の「遠=頂点シェーダ脊椎変形+Instanced」に対し、audit_b の推奨順は **①InstancedMesh+`morphTexture`(相対モーフ 5〜8 本)、②(不足なら)`onBeforeCompile` の頂点シェーダ変形** である。理由は、①は標準マテリアルのまま影も追従しカスタム GLSL が不要で、②は法線・影(`customDepthMaterial`/`customDistanceMaterial`)・カリングを全部自前で持つため実装コストが大きい [aud-B §1.1, §2.7]。本設計は **①を遠景の第一案、②を最終手段**とする。どちらも**実描画は未検証** [aud-B §4, aud-D §4]。

### 7.5.2 3 層構成

| 層 | 方式 | 対象数(予算) | 内容 | 根拠 |
|---|---|---|---|---|
| **近景 (Hero)** | `SkinnedMesh`+62 ボーン+副ボーン。`THREE.LOD` で**同一 Skeleton・同一 `bindMatrix` を共有する SkinnedMesh を頂点数違いで並べる** | ≤ 12 | LOD0/LOD1。個体ごと `SkeletonUtils.clone`+共有 mixer | Hero 十数匹以内 [spec05 §5.1.1, E]、LOD [aud-D §1.1-1, §1.2, H] |
| **中景 (Mid)** | 同じ SkinnedMesh を LOD1/LOD2 で使用(**別リグ(36 本以下)は初期案では作らない**) | ≤ 36(Hero 含め合計 ≤ 48 の skinned) | 62 ボーンのまま頂点数だけ減らす | [E: 05 章は中景リグ 36 本以下を許すが、2 系統のリグ/GLB を保守するコストを避ける。24 ボーンで約 6〜10 µs/匹/frame(N=50〜500, Node)、62 本は 25 µs に外挿 [spec05 §5.1.1] なので 48 匹で約 1.2 ms。実機で超過したら 36 本版を作る(09 章 P6)] |
| **遠景 (Far)** | `InstancedMesh`+`morphTexture`(波モーフ 5 本+旋回 1〜2 本)。最遠は非スキンの焼き込みポーズ `Mesh` も可 | 残り(例 ≤ 100) | 波の A(s)・λ・ω・φ を Hero と共通値で渡す | [aud-B §1.1, §2.7, 設計案・未検証][aud-D §1.1-4] |

**切替距離**: 例示は 6 m / 20 m、`hysteresis` は 0.1〜0.2(level≥1 に付ける。level 0 の値は無視される) [spec04 §4.1.2, aud-D §1.1-2, H]。距離は LOD ノード原点(魚の中心)で測られる [aud-D §1.2]。**実寸との対応(SL 0.20 m 個体が何 px になる距離か)は画面解像度・FOV で決まり、数値は 09 章 P6 の実測で決める**。縦 FOV 50°・1080 px では鱗(SL 200 mm で 1.1〜1.8 mm)がカメラ距離約 0.64〜1.04 m 以上で 2 px 未満になる [spec01 §1.5, r14 §1-8, M 計算] ので、法線マップ/鱗の LOD 切替は 1 m 前後が目安。

**LOD ごとの予算(初期案、すべて [E] で実機で調整)**

| LOD | 体の三角形 | ボーン | モーフ | 法線マップ | 鰭 | 備考 |
|---|---|---|---|---|---|---|
| LOD0 | 約 8,000(7.3.3 のロフト 96×40 を基準、顎・鰓蓋の細部は追加) | 62 | 12 | あり(KTX2) | 6 種+条群ボーン | 参照: 販売ページの自己申告で 926〜3,892 など(C)。**平均・中央値の算出は禁止** [spec01 §1.5, r14 §1-18] |
| LOD1 | 約 2,400 | 62(共有) | 6(口・鰓蓋・体高) | あり | 簡略化 | 参照: 共有スケルトンで曲げた 2,352 三角形と 208 三角形のシルエットは 1 px 以内で一致 [aud-D §1.1-1, H] |
| LOD2 | 約 600 | 62(共有) | 0 | 無し(色のみ) | 簡略化 | `weld()`→`simplify({simplifier: MeshoptSimplifier, ratio})`。頂点は元の部分集合で**スキンウェイト・モーフも保たれる**(1,536→384 三角形で変形誤差 0) [aud-C §1.1-11, T] |
| Far | 約 200 | 無し(morph 5〜7) | 波 5+旋回 1〜2 | 無し | 体と一体 | InstancedMesh [E] |

LOD ごとに**同じ骨・同じ IBM**を使う [aud-C §1.1-11]。`mid.bind(skeleton, hi.bindMatrix)` の形で `bindMatrix` を渡す(渡さないと `calculateInverses()` が走って `boneInverses` が壊れる)。骨は LOD0 側にだけ `add` する [aud-D §1.2, S]。

**初回切替のヒッチ対策**: ロード画面の裏で、実キャンバスへ全レベル可視で 1 回描画する(`lod.autoUpdate=false`、全 `visible=true`、描画後に戻す)。`renderer.compile()` だけでは初回描画の遅れが残り、レンダーターゲットへのウォームアップは別プログラムを作るだけで無効(初回切替フレーム 85〜157 ms → 実キャンバス描画後 2〜14 ms、SwiftShader) [aud-D §1.1-3, §3-8, H]。**水中フォグ・ライト数・影の有無も本番と同じ設定でウォームアップ**する。

**複数カメラの注意**: 別カメラの `render()`(鏡面・Reflector・Water)が走ると `.visible` と `getCurrentLevel()` がそのカメラの選択で上書きされる。ゲームロジックでは `getCurrentLevel()` を使わず距離を自前で測るか、`autoUpdate=false` で描画後に手動 `lod.update(mainCamera)` [aud-D §3-7, H]。

### 7.5.3 遠景(InstancedMesh+morph)の設計

| 項目 | 仕様 | 根拠 |
|---|---|---|
| 進行波 | `y(s,t)=A(s)sin(ks−ωt)` を **2 つの相対モーフ** `S=A sin(ks)`、`C=A cos(ks)` と重み `(cos ωt, −sin ωt)` で厳密に表す(CPU 上の最大誤差 3.9e-9) | [aud-B §2.7, T10-a] |
| 体長の伸び補正 | x 方向の短縮 3 本(`cos²`, `sin·cos`, `sin²`)を足す。0.10 L で +3.18%→+0.26%、0.12 L で +4.48%→+0.53%、0.17 L で +8.4%→+2.0%。計 5 本。旋回の曲げに 1〜2 本 | [aud-B §2.7, T16] |
| 固定パラメータ | 波長 λ・包絡 A(s) は**ジオメトリに焼き込み固定**。λ=0.9 SL、包絡は 05 §5.2.2 の節点(0→0.20, 0.10→0.09, 0.20→0.10, 1.0→1.00)。個体差の λ(0.8〜1.05)は遠景では表現しない | [spec05 §5.2.2/5.2.3][E: 遠景では差が見えない前提。未検証] |
| 重み更新 | `Float32Array` への直接書込みで 1,000 個体 30 µs/frame、アップロード 12 KB/frame。`setMorphAt` の後に `morphTexture.needsUpdate = true` | [aud-B §2.7, T10-b][aud-B §3-17] |
| 切替の連続性 | Hero と Far に**同じ A(s)・λ・ω・位相 φ** を渡す | [aud-B §1.1, 設計案・切替の見え方は未検証] |
| カリング | InstancedMesh は**個体単位のカリングが無く**視錐台外も全部描く。tier ごとに `InstancedMesh` を持ち、距離で振り分けた個体の行列だけを先頭から詰めて `mesh.count = n; instanceMatrix.needsUpdate = true`。視錐台判定は自前、`boundingSphere` は全体を覆う球を手動設定 | [aud-D §1.1-4, §1.2, H+S] |
| 法線 | 線形化したモーフ法線を足す。断面回転による位置ずれ(1 次の量)の精度は**未検証** | [aud-B §2.7, §4] |
| 影 | 組込みの深度シェーダが自動で追従 | [aud-B §2.7] |

BatchedMesh は剛体のみ(スキニングもモーフも不可)で、描画ごと・影パスごとに O(個体数) の CPU 処理がある(20,000 個体で約 4〜5 ms)。本件の規模では使わない [aud-D §3-18, H]。

### 7.5.4 描画コール・メモリの目安(実機未測定)

| 項目 | 見積り | 根拠 |
|---|---|---|
| CPU(骨の手続き+skeleton.update) | 48 匹×約 25 µs ≒ 1.2 ms | [spec05 §5.1.1: 24 本 6〜10 µs からの外挿 [E]、T-A15 の合格条件 ≤40 µs/匹] |
| ボーンテクスチャ転送 | 48 匹×4,096 B ≒ 197 KB/frame | 算術(7.4.1) |
| 描画コール | skinned 1 匹あたり body+fins+eye×2+口腔内 ≒ 5〜6 call。48 匹で 240〜290、影パスで約 2 倍 | [E: 概算。skeleton ごとに DataTexture と描画コールが 1 つずつ [aud-B §1.1, R]] |
| 個体別アルベド | 1024×512 で約 2.8 MB、2048×1024 で約 11.2 MB。Hero 12 匹が 2048 なら 約 134 MB | 算術。**実機 VRAM は未実測** [aud-D §4] |
| `skeleton.update()` の多重呼出し | 素: 1 回/frame、後処理により 2〜5 回。LOD で見えないレベルは更新されない | [aud-D §3-3, H] |

---

## 7.6 個体差システム

### 7.6.1 方針

- すべての個体は `seed`(uint32)から再現可能に生成する。生成物は純粋なデータ `Genome`(three に依存しない)。
- パラメータの**既定・範囲・分布の出典は 02/03/04/05 の各表**。本章は型と生成手順、検証関数を定める。数値の再掲は最小限。
- 各パラメータに `prov` を付け、`ExplainTrace` の `paramsUsed` と同じ形式で DebugUI に出す [spec04 §4.7.1]。

### 7.6.2 Genome の型

```ts
type Prov = 'A'|'B'|'C'|'M'|'P'|'E';
interface Param { v:number; unit:string; min:number; max:number; prov:Prov; proxy:string|null; src:string }

interface Genome {
  schema: 1;  seed: number;  species: 'yamame';            // 'amago_or_hybrid' 等は別クラス (03 §3.8.3 #1)
  identity: { life_stage:'parr'|'juvenile'|'adult'|'spawning_male'; sex:'female'|'male';
              maturity:number; silver_s:number; age_months:number; region_hybrid:boolean };
  size:   { sl_m:number };                                   // 0.06–0.35 [05 §5.8]; 基準 0.19 [02 §2.1]
  morph:  { body_depth_max_over_sl; body_depth_max_pos_s; peduncle_depth_min_over_sl; head_length_over_sl;
            eye_d_over_hl; snout_len_over_hl; upper_jaw_end_over_hl;
            predorsal_s; prepelvic_s; preanal_s; adipose_origin_s; prepectoral_s;
            dorsal_base_over_sl; anal_base_over_sl; pectoral_len_over_sl; pelvic_len_over_sl; caudal_fork_depth_over_sl;
            body_width_over_depth; section_exponent; scale_pitch_pct_sl;
            fin_ray_count: {dorsal;pectoral;pelvic;anal};
            mt: Record<MorphName, number> };                 // 7.4.2 の 12 軸
  pattern:{ pm_count; pm_count_lr_delta; pm_s_first; pm_s_last; pm_spacing_cv; pm_aspect; pm_fuse_p; pm_front_faint_p;
            pm_dL; pm_da; pm_db; pm_edge_softness; pm_fade; pm_fade_onset_cm;
            spot_dorsal_n; spot_dorsal_diam_eyeD; spot_dorsal_rows; spot_dorsal_age_gain;
            spot_below_n; spot_below_diam_eyeD; spot_below_black_p; spot_head_n; spot_head_diam_eyeD;
            orange_spot_mode; orange_spot_n };
  color:  { dorsal_L; flank_upper_L; belly_L; flank_hue_a; flank_hue_b; hue_offset_deg;
            pectoral_yellow_b; caudal_margin_a; caudal_margin_sat; adipose_margin:'none'|'dark'|'white';
            fin_damage; nuptial_intensity; flank_pink_da; flank_pink_db; dorsal_darken_dL; pink_band_strength;
            post_spawn_wear; bg_adapt };
  motion: { A_tail_scale; lambda_scale; S_L; f_idle; U_fast_exponent; spine_bend_max; head_yaw_gain;
            p_C; tail_droop; jaw_open_max; vent_amp; k_roll };    // 05 §5.2〜5.6, 5.8
  traits: { wariness; boldness; territoriality; rank; forage_mode:'drift'|'patrol'; rhythm_phase_h };  // 04 §4.8.1
}
```

### 7.6.3 生成の分布と相関

| 区分 | 既定・分布 | 範囲 | 出典 |
|---|---|---|---|
| 体長 SL | 個体群分布(parr/adult 別)。段階の目安は 02 §2.1(0+ 6.65〜8.25 cm など) | 0.06〜0.35 m | [spec05 §5.8, E][spec02 §2.1] |
| 体高 / 体高位置 / 尾柄高 | 0.241±0.024 / 0.445±0.056 / 0.091±0.013(正規、範囲で切る) | 0.20〜0.28 / 0.36〜0.56 / 0.07〜0.115 | [spec02 §2.9.2, P: n=27] |
| 頭長/SL | 0.25(SD 0.036) | 0.22〜0.29 | 〃 |
| 眼径/HL | size 連動 0.227→0.165、±0.03 | | 〃 [E] |
| 鰭起点 | 背 0.504、腹 0.574、臀 0.751、脂 0.843(SD 0.039〜0.049) | 各 02 §2.9.2 | 〃 |
| 鰭条数 | 背 12(10〜15)、胸 13(12〜15)、腹 9(8〜9)、臀 13(11〜14)。腹を狭く、背・胸・臀を広く | | [spec02 §2.5, A/P] |
| 地色 | `dorsal_L` 44(SD 10, 28〜67)、`flank_upper_L` 66(SD 8)、`belly_L` 72(SD 9) | 03 §3.8.2 | [spec03 §3.8.2, P: color n=35〜36] |
| パーマーク | `pm_count` 9(5〜12)、`pm_dL` −18(SD 9.9, −40〜−3)、`pm_fuse_p` 0.31、`pm_front_faint_p` 0.45 | | [spec03 §3.1.7, P] |
| 黒点 | `spot_dorsal_n` 中央値 40(対数正規 σ=0.8, 3〜150) | | [spec03 §3.2.4, E] |
| 遊泳 | `A_tail`=0.10·(SL/0.20)^−0.10(0.07〜0.14)、λ=0.9·(SL/0.20)^−0.05(0.8〜1.05)、`S_L` 0.70(0.55〜0.85)、`U_fast`=6.0·(SL/0.20)^−0.25 BL/s(指数 0.15〜0.35) | | [spec05 §5.8, E] |
| 行動特性 | `wariness` 正規(0.5, 0.15)、`boldness` は 1−wariness と ρ=−0.7、`territoriality` 正規(0.5, 0.2) で**rank に比例して上限** | 0〜1 | [spec04 §4.8.1, E] |

**相関**: 写真から検出できた相関は弱い(パーマーク ΔL* と地色 L* r=−0.09、背 L* と腹 L* r=−0.30、パーマーク個数と背側黒点数(対数) r=0.25 など) ため**既定は独立**。形態指標間の相関も**未算出**(各独立で生成。`depth(s)` の SD を s ごとに独立に使うと尾部が過大にばらつく [spec02 §2.9.2])。設計上の弱い結合のみ入れる [spec03 §3.8.2, E]: 暗い個体ほど `pm_dL` の絶対値を小さく・桃色を弱く、年齢が高いほど `spot_dorsal_n` を増やす、`pm_count` と `pm_contrast` は独立。`depth(s)` は **平均プロファイル + 1 本の「大きさスカラー」×SD プロファイル**でばらつかせる案 [E: 相関が取れるまでの暫定。要追加解析 — 08 章 ◎]。

**資料間の差(体長の表記)**: 04 §4.8.1 の例(parr 10〜16 cm、adult 18〜30 cm、FL/SL 区別なし [E])と 02 §2.1 の基準個体 SL 190 mm(FL 211 mm)、05 §5.8 の SL 0.06〜0.35 m は定義が揃っていない。**Genome は SL(m) を基準**とし、FL は FL/SL=1.109 [spec02 §2.1, P: n=10] で換算する。

### 7.6.4 生成順序とシード

```
seed → sub-seed(カテゴリ名のハッシュ) を作り、カテゴリごとに独立な PRNG ストリームを使う   [E]
 1. identity  : life_stage, sex, maturity, silver_s (河川型 0〜0.15), sl_m             (03 §3.8.1 の順序)
 2. morph     : 形態比 → mt_* → 鰭条数
 3. color     : 地色 → 鰭色
 4. pattern   : パーマーク → 黒点 → 桃色/婚姻色 → 朱点
 5. motion    : A_tail_scale, lambda_scale, S_L … (SL 依存の式 + ±)
 6. traits    : wariness → boldness → territoriality → rank (集団内で体長順)
 7. validate(genome) → violations があれば該当カテゴリのみ再サンプル (最大 16 回, 超過は clamp + 警告)  [E]
```
カテゴリ別ストリームにする理由: パラメータを追加・順序変更しても、**他カテゴリの個体が変わらない**(再現性)。PRNG は 32 bit の軽量なもの(例: mulberry32/sfc32)を想定 [E]。Node とブラウザで同じ結果になること(浮動小数点の再現)を単体テストで固定する(7.7)。

**テクスチャ生成**: 個体別アルベドは `Genome.pattern/color` から **Canvas2D API** で描く(位置・大きさ・形は 03 §3.1.3 の写真統計から直接生成。反応拡散は使わない [spec03 §3.8.4])。Canvas2D は Node では `@napi-rs/canvas`、ブラウザでは `OffscreenCanvas` と同じコードで動く [E: テストとランタイムで同一生成コードを使う]。レイヤーは 03 §3.6.3 の `albedo_base`、`mask_parr`、`mask_spot_*`、`mask_pink`、`silver_map`、`fin_rgba`、`iris_layer` を、**アルベドへ合成した 1 枚(sRGB)+ 個体差の無い共有 ORM・法線**に畳む。連続量(婚姻色 `nuptial_intensity`、`bg_adapt`、`silver_s`、濡れ)は、アルベドに焼かず**シェーダ uniform**(`onBeforeCompile` の小関数)で動かす [E: 時間で動く量にテクスチャ再生成を使わない。`clearcoat`/`iridescence` は最初から正値を入れて値だけ動かす [aud-A R2]]。

### 7.6.5 不自然な組合せの検証関数

`validateGenome(g): Violation[]`、`Violation = {id, severity:'error'|'warn', message, fix:'resample'|'clamp', category}`。ルールは各章の「禁止組合せ」を ID 化する。

| ID | 条件 | 処置 | 出典 |
|---|---|---|---|
| V-C01 | 朱点 5 個以上(`orange_spot_n`≥5)で species='yamame' | error/resample(アマゴ級は別クラス) | [spec03 §3.8.3 #1] |
| V-C02 | `silver_s`>0.3 かつ `pm_dL`<−10 | error | #2 |
| V-C03 | `nuptial_intensity`>0.5 かつ `silver_s`>0.3 | error | #3 |
| V-C04 | 河川型に雲状の桜色斑 / 側線沿いの連続した明瞭な赤紫・赤橙の縦帯 | error | #4, #5 |
| V-C05 | `pm_count`<5 または >12(模様なし型は生成しない) | error | #6 |
| V-C06 | 腹鰭・臀鰭の先端を黒くする | error | #7 |
| V-C07 | `age_months`<4 かつ `spot_dorsal_n`>100 | error | #8 |
| V-C08 | `pm_fade`>0.4 かつ FL<22 cm | error | #9 |
| V-C09 | `|pm_count_lr_delta|`>1、または左右の完全ミラー | error | #10 |
| V-C10 | ブラウントラウトの形質(脂鰭の橙縁、斑の淡色暈)を持つ | error | #11 |
| V-C11 | 口内・舌が資料なしで鮮やかな赤 | warn | #12 |
| V-B01 | 小さい個体が大きい個体より良い定位点を恒常的に占める(`rank` は体長順、逆転は ≤10% の個体のみ) | error(集団単位) | [spec04 §4.8.2 #1] |
| V-B02 | `wariness`>0.8 かつ `hide_dwell`<20 s、`boldness`>0.8 かつ `flee_dist` が平均の 1.2 倍超 | error | #2 |
| V-B03 | 低 rank かつ高 `territoriality` | error | #3 |
| V-B04 | 水温 ≥12℃ で夜行性優勢、≤8℃ で昼の活発な摂餌と追い払い | error(シーン設定) | #4 |
| V-B05 | 産卵行動を産卵期以外に発生、雄の婚姻色を産卵期以外に | error | #6 |
| V-B06 | 稚魚(2.4〜3.3 cm)を成魚と同じ流速に定位 | error | #8 |
| V-M01 | 形態比が 02 §2.9.2 の生成範囲外(体高 0.20〜0.28 など) | clamp | [spec02 §2.9.2] |
| V-M02 | `mt_kype`>0 または `mt_upper_jaw_ext`>0 で sex≠male、または maturity≤0.8 | error | [spec02 §2.8] |
| V-M03 | `life_stage`='parr' で `eye_d_over_hl` が成魚側(<0.18)に偏る、またはその逆 | warn | [spec02 §2.8, P] |
| V-K01 | `A_tail`∉[0.07,0.14] SL、`λ`∉[0.8,1.05] SL、`S_L`∉[0.55,0.85] | clamp | [spec05 §5.2.2〜5.2.4, §5.8] |
| V-K02 | 通常遊泳で 1 関節の最大角 >15°(A_tail ≤0.12 のとき)または >35° | error | [spec05 T-A6] |
| V-K03 | 波速比 c/U <1.1 | error | [spec05 T-A4] |
| V-K04 | `U_fast` が SL スケール式の指数範囲 0.15〜0.35 を外れる | clamp | [spec05 §5.8, E] |

---

## 7.7 テスト・検証

### 7.7.1 階層

| 階層 | 内容 | 実行環境 | 合否 |
|---|---|---|---|
| L0 単体(Node, three 非依存) | `wave`(体波)、`modes`(5.3 の表)、`mouth`(ストライクのタイムライン)、`genome`/`validate`、`rng`、`explain` | `node --test`(Node ≥22) | 数値 |
| L1 アセット | GLB の構造・変形・モーフ・KTX2 のタグ | Node(+ headless で変形比較) | 数値 |
| L2 形状 | 休止姿勢のモデルを正射影レンダーし、シルエット・ランドマークを 02 章の写真統計と比較 | headless Chromium (SwiftShader) | 許容誤差 |
| L3 見た目 | スナップショット(決定論的) | headless | md5 または PSNR |
| L4 行動シミュ | AT-01〜AT-14 を 600 s×20 個体で | Node(描画なし) | 統計 |

### 7.7.2 数値テスト(05 章 T-A1〜T-A15、04 章 AT-01〜AT-14、そのまま自動化)

| ID | 検査 | 合格条件 | 根拠 |
|---|---|---|---|
| T-A1 | 後縁振幅 A_te/SL(1 BL/s、100 周期の最大変位) | 0.10〜0.20(既定 0.133) | [spec05 §5.9.2] |
| T-A2 | f−U の傾き | U_bl/f = S_L ∈ [0.55, 0.85] | 〃 |
| T-A3 | A_tail の速度非依存(1〜10 BL/s) | ±5% 以内 | 〃 |
| T-A4 | 波速比 c/U | ≥1.1 | 〃 |
| T-A5 | チェーンの弧長誤差 | <0.5% | 〃 |
| T-A6 | 1 関節の最大角 | 通常 ≤15°(A_tail 0.12 まで)、全モード ≤35° | 〃 |
| T-A7 | 軌跡曲率 | 通常旋回 ≤1/R_min、全モード ≤5.9/SL | 〃 |
| T-A8 | C-start: T12 / a_peak / 潜時 | T12∈[0.07,0.15] s、a_peak∈[34,60] m/s²、潜時 ≤20 ms | 〃 |
| T-A9〜A10 | 呼吸周期、ストライクの順序(挙上<開口<舌骨<鰓蓋) | 0.95〜2.1 Hz。順序 | 〃 |
| T-A11 | ボーン数・影響数 | ≤64、頂点あたり ≤4、ウェイト合計=1 | 〃(asset テストにも) |
| T-A12〜A15 | 表示 f ≤20 Hz、更新順、カリング、CPU 時間 | T-A15: Hero 62 本で ≤40 µs/匹/frame(Node) | 〃 |
| AT-01〜AT-14 | 定位時間割合 ≥70% [E]、向き ±20° 内 ≥90%、迎撃往復 ≤0.30 m、逃避の運動学、ExplainTrace 100% | 04 §4.9 の表 | [spec04 §4.9] |

時間のしきい値でテストを落とさない(SwiftShader は同一マシンで 2 倍ぶれる)。CPU 時間テストは Node の単独実行で相対値(基準実装比)で見る [aud-D §3-15, §5.7]。

### 7.7.3 アセット検査(`tests/asset/`)

| ID | 検査 | 合格条件 | 根拠 |
|---|---|---|---|
| A-01 | `gltf-validator` | エラー 0(KTX2/AVIF/WebP/meshopt の「未対応拡張」警告は許容) | [aud-C §3-18] |
| A-02 | ボーン数・影響数・ウェイト | ボーン ≤64(62)、`JOINTS_1` 無し、各頂点 Σw=1±1e-4 | [aud-B §1.6] |
| A-03 | 変形の誤差 | `getVertexPosition`(ワールドへ `applyMatrix4(matrixWorld)`)と glTF 仕様の CPU LBS の最大差 ≤0.05 mm(float POSITION)。PoC は float で 0〜0.031 mm | [aud-C §2.11, T][E: 閾値] |
| A-04 | `skeleton.pose()` | 差 0(量子化 POSITION を入れていない確認) | [aud-C §3-1] |
| A-05 | モーフ | 全ターゲットが相対、全重み 0 で休止形、モーフ名の一意性、`morphTargetDictionary` | [aud-B §1.7] |
| A-06 | KTX2 の DFD | baseColor=sRGB、法線/ORM=linear(`inspect_ktx2` 相当) | [aud-C §2.10] |
| A-07 | 骨の休止回転 | 恒等(または `restQ` 保存の一致) | [spec05 §0] |
| A-08 | 同じ `skin` を参照する複数メッシュのロード結果 | Skeleton 共有・`bindMatrix` 一致 | [aud-C §4: 未実行] |

### 7.7.4 形状検査: tools/photo の再利用

`tools/photo/morpho_stats.py` の `photo_metrics(rec)` は、ランドマーク辞書(`snout`, `caudal_base`, `opercle_post`, `eye_anterior/posterior`, `maxilla_post`, `bd_max_top/bottom`, `cp_min_top/bottom`, `dorsal_origin`, `pelvic_origin`, `anal_origin`, `pectoral_base_top`, `adipose_base_front` など、画像ピクセル座標)から SL・HL・各比・鰭起点 s を出す。**モデルを正射影で側面レンダーし、既知の 3D ランドマークを同じ辞書形式(ピクセル座標)に射影して `photo_metrics` に通せば、写真と同じ手順・同じ定義で比較できる**。

| 手順 | 内容 |
|---|---|
| 1 | `tools/headless/silhouette-landmarks.mjs`: 休止姿勢の Hero を直交カメラで側面から描画し、ロフトが保持する 3D ランドマーク(ボーン位置・鰭起点・眼縁など)を射影して `landmarks_model.json` を出す |
| 2 | `python tools/photo/morpho_stats.py --dir <出力dir>` と同等の `photo_metrics()` で各比を算出 |
| 3 | 02 章の既定値と比較。許容誤差は **`depth(s)` ±0.01 SL、鰭起点 ±0.012 SL、頭部比 ±0.02 HL、鰭寸法 ±0.01 SL** [spec02 §2.9.1, E: 評価者間の中央絶対差を丸めた] |
| 4 | 個体差生成: 100 個体を生成し、各比の平均・SD が 02 §2.9.2 の分布と一致(平均 ±0.2 SD、SD ±20% [E]) |

注: `morpho_stats.py` は `--dir` 配下の `landmarks_<chunk>_<A|B>.json`(評価者別)を一括集計して `morphometrics.json` などを同じ dir に書く CLI で、`photo_metrics` は `if __name__ == "__main__"` の外にあるので関数として import できる。モデル由来の出力は**写真の出力 dir と別の dir**に `landmarks_model_A.json` の名前で置く(写真の集計を汚さない) [E]。`colorsample.py` は写真 ID(環境変数 `YAMAME_PHOTOS` の dir にある `pNNN.jpg`)を引数に取る CLI で、任意画像を直接は受けない。**テクスチャの色検査**(レンダー画像の部位ごとの L*a*b* が 03 §3.5.1 の範囲内か)に使うには、レンダー画像を `pNNN.jpg` 形式で別 dir に置いて `YAMAME_PHOTOS` を切り替えるか、Lab 変換部(`srgb_to_lin`/`lin_to_lab`)だけを流用する [E]。`morpho_stats.py` の入力ファイル群は `docs/yamame/photo_analysis/` にあり、回帰の基準(`profile_mean.json` など)として固定する。

### 7.7.5 スナップショット(L3)

- ヘッドレス Chromium(`/opt/pw-browsers/chromium` または `@sparticuz/chromium`)+SwiftShader(WebGL2)。**ローカル HTTP サーバ必須**(`file://` は ES module が CORS で失敗) [aud-D §3-16, H]。
- **描画は決定論的**: 同じページを 3 回実行したスクリーンショットの md5 が一致、別ディレクトリで一から再構築しても一致 [aud-D §2.10, H]。→ 期待画像との**ピクセル一致または PSNR(例 ≥50 dB [E])**で回帰検査できる。ただし Chromium/ANGLE/SwiftShader の版が変わると変わりうるので、版を固定し、版更新時に期待画像を再生成する [E]。
- `readPixels`/`toDataURL` は `render()` と同じタスク内で、または `preserveDrawingBuffer:true`。`page.screenshot()` は合成後の画面を撮る [aud-D §3-17]。
- 検査対象: 側面(休止)、斜め前(頭・眼・口)、開口(ストライク最大)、鰭の展開(胸 70°)、婚姻期(別プリセット)、LOD0/1/2 の並び、水中フォグ有無。
- **初回フレームは 2.4〜3.0 s**(シェーダコンパイル+PMREM)なので、`window.__done` フラグを待つ [aud-D §2.10]。

**ハーネスの不一致(未決)**: `tools/threejs-audit/harness.mjs` は `puppeteer-core ^25.12.0`+`@sparticuz/chromium 153`(同梱 `args` に `--use-angle=swiftshader` 等を足す)で動作したが、audit_c は `playwright-core 1.63.0` で `@sparticuz/chromium` の同梱 `args`(`--single-process` 含む)を全部渡すとハーネスが 300 s 以上固まったと報告している(原因未調査 [aud-C §2.13, §3-20])。P0 で**どちらか 1 つに統一**して再現確認する。

### 7.7.6 CI 案

```
on: push / pull_request
 1. setup Node 22, npm ci (three 0.186.1 固定, lockfile コミット)
 2. lint + typecheck (@types/three 0.186.0 の既知差異を許容する tsconfig)
 3. node --test tests/unit tests/sim                  # T-A*, AT-*, genome, validate  (GPU 不要)
 4. npm run build:assets && node tests/asset/*.mjs    # GLB 生成→A-01〜A-08
 5. headless snapshot (ブラウザ取得は 1 つに統一; 7.7.5)   # L2, L3
 6. アーティファクト: 失敗時の差分画像、ExplainTrace のダンプ、assets/generated の GLB
 7. (手動/夜間) 実機ベンチ: 7.8 の計測ページを人が実機で実行して JSON を保存
```
KTX2 生成に使う `ktx2tools` は macOS 無し・非公式なので、**KTX2 化は Linux の CI ジョブに固定**し、生成物の SHA-256 を記録する [aud-C §2.9, §3-17]。ホスト側 CI がネットワーク制限下の場合は 08 章のドメイン許可の話を参照。

---

## 7.8 性能計測の方法と実 GPU での未検証事項

### 7.8.1 計測レシピ

```js
renderer.info.autoReset = false;                      // 後処理・水面・composer があると既定は最後の render() の値しか残らない
function measure(fn) {
  renderer.info.reset(); const t0 = performance.now(); fn();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // 1 画素の読み戻し = GPU 完了待ち
  const { calls, triangles } = renderer.info.render;
  return { ms: performance.now() - t0, calls, triangles, frame: renderer.info.render.frame,
           geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
           programs: renderer.info.programs.length };
}
```
[aud-D §1.5, H]。`info.reset()` は `calls/triangles/points/lines` だけを消し、`frame` と `memory` は消さない。`composer` や水面があると 1 フレーム=複数 `frame` になる。GPU 時間は `EXT_disjoint_timer_query_webgl2`(ヘッドレスでは値を返すが CPU ラスタ時間。**実ブラウザでの可用性は未確認**)。

### 7.8.2 計測項目

| 項目 | 方法 | 閾値(初期案) |
|---|---|---|
| フレーム時間 | rAF 間隔の 1%/50%/99% タイル(30 s×3 回) | 16.7 ms [E: 60 fps] |
| CPU: 行動+手続き+mixer | `performance.now()` 区間 | Hero 12 匹+skinned 48 匹で <3 ms [E] |
| draw call / 三角形 | `renderer.info` | 影パス込みで <700 call [E] |
| 骨テクスチャ転送 | 帯域換算 | 197 KB/frame の見積り検証 |
| ジオメトリ/テクスチャ VRAM | `info.memory`(件数のみ)+手計算 | 個体別アルベド数×サイズ |
| 初回切替ヒッチ | LOD 切替フレームの時間 | <16 ms [E] |
| 後処理コスト | 1 つずつ ON/OFF | AO は 1 つずつ測ってから |
| Far tier | N=100/500/1000 の InstancedMesh+morph | 実描画未検証 |

### 7.8.3 実 GPU での未検証事項

| # | 未検証 | 影響 | 出典 |
|---|---|---|---|
| 1 | 実 GPU の描画時間(統合 GPU・モバイル含む)。ms は全て SwiftShader | LOD 距離・AO/DOF の可否 | [aud-D §4] |
| 2 | ボーンテクスチャのアップロード時間、`texelFetch` 16 回/頂点のコスト、描画コール上限 | Hero 数の上限 | [aud-B §4] |
| 3 | `MAX_TEXTURE_IMAGE_UNITS`(実機に 16 のものがある)、`MAX_VERTEX_TEXTURE_IMAGE_UNITS`、`MAX_TEXTURE_SIZE`(SwiftShader 8192 に対し実機 16384 が多い)、`MAX_ARRAY_TEXTURE_LAYERS` | サンプラー予算、モーフ層数 | [aud-D §3-15, aud-B §4] |
| 4 | KTX2 の実機変換先(Android=ASTC/ETC2、Windows/Linux=BC7、macOS/iOS=ASTC か)とトランスコード時間 | VRAM(BC7/ASTC 4×4 で 512² が 349,525 B、RGBA8 で 1,398,101 B) | [aud-C §4, R] |
| 5 | InstancedMesh+morphTexture の画質(断面回転による位置ずれ、法線モーフ精度、旋回時の曲げ、実際の尾端振幅での見た目)、数千匹規模の実性能 | 遠景方式の採否 | [aud-B §4, aud-D §4] |
| 6 | 影パスが不規則なときの 1 フレーム古い骨行列を**実レンダラ**で再現するか(T7 はモックのみ) | 影の間引きの可否 | [aud-B §3-11, §4] |
| 7 | `Uint32/Int32` の skinIndex が壊れるか | (回避済み: Uint16) | [aud-B §4] |
| 8 | `EXT_disjoint_timer_query_webgl2` の実ブラウザ可用性 | 計測手段 | [aud-D §4] |
| 9 | WebGPURenderer の実アダプタでの動作・速度・見た目(`requestAdapter` 互換モードで MSAA が 0 に落ちる [aud-A R14(6)]) | 並走検証の結論 | [aud-A U1] |
| 10 | Firefox/Safari の `ImageBitmapLoader` 分岐、KTX2/WebP/AVIF 可否 | 対応ブラウザ範囲 | [aud-C §4] |
| 11 | 数百個体で mixer/AnimationAction を使ったときの GC・メモリ | 個体入替の設計 | [aud-B §4] |
| 12 | 62 ボーン・数千〜万頂点・2K〜4K テクスチャでの KTX2 エンコード時間と品質ラダー(ETC1S の法線は品質が出にくい [R]) | ビルド時間、画質 | [aud-C §4] |
| 13 | GTAO×水中フォグの相互作用(遠景がフォグ色に近いと AO で暗く沈む可能性) | 後処理構成 | [aud-D §4] |
| 14 | LOD 切替のポップ緩和(クロスフェード、ディザ、`alphaHash`)。`THREE.LOD` は即時切替のみ | 見た目 | [aud-D §4] |
| 15 | 水中から見上げる像(スネルの窓、全反射)、コースティクスの影・法線項 | 環境表現 | [aud-D §4] |

### 7.8.4 水中表現(Environment の実装方針)

- 水中フォグは標準 `FogExp2` を使わない(距離の**二乗**・平面深度・1 色・canvas 直描きは sRGB 空間で混合)。`onBeforeCompile` で線形・放射距離・Beer–Lambert の自前実装(`tonemapping_fragment` の前、ビュー空間位置を `vec3` varying で渡し fragment で `length()`)。標準・チャンク置換・自前版の 3 方式で画素値が解析解と一致 [aud-D §1.1-8, §1.3, H]。放射距離を頂点で `length()` して `float` varying で渡さない(大きな三角形で壊れる) [aud-D §3-11]。
- σ(RGB)は純水の吸収係数(650 nm で 0.34、550 nm で 0.064、465 nm で 0.010 m⁻¹)を初期値にするが、これは **M(記憶)の仮定**で、出典により 550 nm は 0.052〜0.070 に割れる。渓流の実効値はより大きい(河川の Kd380 が 0.68〜151.1 m⁻¹ の報告) [spec01 §1.5, spec03 §3.7]。`water_cdom` を別パラメータにする。**日本の渓流の実測は未取得(08 章)**。
- コースティクスは平面投影の `onBeforeCompile`(世界座標 XZ、2 層の `min`、時間オフセット)を第一候補。SkinnedMesh/InstancedMesh/床で GL エラー無し。法線項・影による遮蔽は**未実装・未検証** [aud-D §1.1-9, §1.4, H]。
- 水面は `Reflector`/`Water`/`Water2` がシーンを 1〜2 回再描画し、カメラが水の下だと何も描かない(水中から見上げる面はメッシュを反転) [aud-D §1.1-10, H]。
- 水中の表面光沢: 水・粘液・表皮の屈折率がほぼ同じため水中では粘液界面の鏡面反射は無視でき、**水中は銀色層の環境反射が主体、空気中(釣り上げ・水面上)は水膜のクリアコート的な光沢を加える**。マテリアルのプリセットを 2 つ持つ(`water`/`air`) [spec03 §3.7, E]。

---

## 7.9 資料間の差・未決・不足資料(本章)

### 7.9.1 資料間の差

| 項目 | 差 | 本章の扱い |
|---|---|---|
| 遠景方式 | 依頼文: 頂点シェーダ脊椎変形+Instanced / audit_b: InstancedMesh+`morphTexture` を第一、シェーダ変形は最終手段 | morph を第一案、シェーダ変形を後続(7.5.1) |
| 中景リグ | 05 §5.1.1: 36 本以下 / audit_d: LOD は同一 Skeleton 共有 | 初期は 62 ボーン共有、実機で超過時のみ 36 本版(7.5.2) |
| ヘッドレス起動 | audit_a/d: `@sparticuz/chromium`+puppeteer で動作 / audit_c: 同梱 args で固まった | P0 で統一(7.7.5) |
| 頭長モーフ | 02 `mt_head_length` / 05 `mt_head_len` | 統合(7.4.2) |
| audit_c の所在 | 01 章は「欠落」と記載 | 現在は存在。01 章 §1.5/§1.9 の「audit_c 全般が未確認」は本章で解消(ただし規模・実機は未検証) |
| 体長の定義 | 04: 例示(FL/SL 未区別)/ 02: SL 190 mm 基準 / 05: SL 0.06〜0.35 m | SL 基準、FL/SL=1.109 で換算(7.6.3) |

### 7.9.2 不足資料(本章に効くもの)

| # | 不足 | 影響 |
|---|---|---|
| 1 | 実 GPU でのベンチ(7.8.3) | 全予算(7.5.4)の確定 |
| 2 | 62 ボーン規模のロフト+KTX2 の実ビルド時間・品質 | アセットパイプライン |
| 3 | 体幅・断面形(背面/腹面/正面写真) [spec02 §2.10 #3] | ロフトの断面(`body_width_over_depth`) |
| 4 | 形態指標間の相関(写真から再解析可能) | 個体差生成の相関 |
| 5 | カスタム頂点属性(`_S`, `_THETA`)の GLB 往復のランタイム動作 | 補助属性の方式 |
| 6 | 同じ `skin` を参照する複数メッシュのロード挙動 | 7.3.4 の構造 |

詳細は 08 章に集約する。
