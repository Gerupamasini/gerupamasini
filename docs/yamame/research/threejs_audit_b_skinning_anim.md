# Three.js r186 監査 B: スキニング／アニメーション（SkinnedMesh・Skeleton・AnimationMixer・モーフ・多数個体）

> 担当: 「スキニング／アニメーション」。対象は **three@0.186.1**（`REVISION` = 186）と **@types/three@0.186.0**。
> 方針: 記憶ではなく実ソースを grep/Read し、可能なものは Node 22 でコードを実行して確かめた。主張には `ファイル:行` を付ける。
>
> **この文書の読み方**
> - 根拠の種別: **[S]** ソースの該当行を直接読んで確認 / **[T]** Node（GPU なし）で実際にコードを実行して確認 / **[R]** ソースからの推論（実行していない）/ **[U]** 未確認。
> - `src/…` は `three-0.186.1/package/src/…`、`examples/jsm/…` は同 package 内、`types/…` は `types-three-0.186.0/three/src/…` を指す。
> - 作業ディレクトリ `…/scratchpad/three/` に展開済み。**型定義の実パスは課題文の `types-three-0.186.0/package` ではなく `types-three-0.186.0/three/`**（`package/` は存在しない）。
> - **GPU が無い環境**で作業したため、シェーダの実描画・GPU 時間・ブラウザ差は一切測っていない（§4）。CPU 時間は Node v22.22.0 (V8) の値で、ブラウザの値ではない。
> - レンダラは **WebGLRenderer** を前提とする（WebGPU 経路は §2 で補足のみ。`WebGLRenderer.js:409` が `'webgl2'` のみを要求するので WebGL1 は考えなくてよい [S]）。

---

## 1. 結論（実装方針に直結する推奨）

### 1.1 個体数別の方式選択

| 区分 | 方式 | 理由（要点） | 注意 |
|---|---|---|---|
| 主役・近景（1〜十数匹） | **SkinnedMesh + 脊椎ボーン鎖（16〜24 本）+ 副ボーン**（胸鰭・腹鰭・尾鰭・顎・鰓蓋）。**脊椎はプロシージャル専有、副ボーンは AnimationMixer の additive クリップ** | ボーン数に上限は実質なく（§2.1）、体波は回転だけで作るので**体長が保存される**（§3-18）。mixer は脊椎以外の細部に使う | ボーン軸・休止姿勢の扱い（§1.4, §3-19） |
| 中景（〜100〜200 匹程度） | `SkeletonUtils.clone` で個体複製（geometry・material は共有、skeleton は個体別）。個体ごとに mixer は作らず**1 つの mixer に `clipAction(clip, 個体root)`** | 24 ボーンで CPU は 1 個体あたり約 6〜10 µs/frame（N=50〜500、手続きのみ〜mixer 込み。Node 実測 [T] T12）。支配するのは**描画コール数と影パス**（[R]。skeleton ごとに DataTexture と描画コールが 1 つずつ） | 個体を消すときは `mixer.uncacheRoot()` と `skeleton.dispose()`（§3-12） |
| 遠景・大量 | **InstancedMesh + `morphTexture`（相対モーフ 5〜8 本、重みを個体ごとに毎フレーム書く）** | r186 では **SkinnedMesh を InstancedMesh/BatchedMesh に載せる標準の手段が無い**（§2.7）。morphTexture は 1 描画コール、標準マテリアルのまま影も追従する [S] | 波長・包絡は焼き込み固定。**設計案であり実描画は未検証**（§4） |
| 最終手段 | InstancedMesh + `onBeforeCompile` の頂点シェーダ変形（ボーン無し脊椎スプライン）、または独自のインスタンス・スキニング | 実現可能（§2.7）。ただし法線・影（`customDepthMaterial`/`customDistanceMaterial`）・カリングを全部自前で持つ | 実装コスト大。morph 方式で足りるか先に試す |

- 近景（SkinnedMesh）と遠景（InstancedMesh + morph）を切り替える場合は、**同じ `A(s)`・λ・ω・位相 φ を両方式に渡す**と見た目の連続性を保てる（設計上の推奨 [R]。切替の見え方は未検証）。

### 1.2 毎フレームの更新順序（「mixer.update → プロシージャル上書き → skeleton.update」の正しい形）

```js
const timer = new THREE.Timer(); timer.connect(document);      // Clock は r183 で deprecated。new Clock() は警告を出す（src/core/Clock.js:6,61）[S]
function frame(ts) {
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 1 / 20);               // タブ復帰時の巨大 dt で mixer が飛ぶのを防ぐ（判断。ソース根拠は mixer が dt をそのまま積算する点: AnimationMixer.js:676-）
  // 0) 行動層 → 波パラメータ（周波数 f、振幅 a、位相 φ += 2π f dt）を決める
  // 1) 脊椎と mixer が「同じボーン」を触る場合だけ: mixer の前に前回の mixer 出力を戻す（§1.4 の B）
  mixer.update(dt);                                            // 副ボーンの additive クリップ。骨のローカル TRS を書くだけで matrixWorld は更新しない
  // 2) プロシージャル上書き: 脊椎ボーンの quaternion を「休止姿勢 restQ ⊗ 波」で絶対指定
  for (const j of spine) j.bone.quaternion.copy(j.restQ).multiply(q.setFromAxisAngle(AXIS, j.angle(t)));
  // 3) 個体の移動・向きは「mesh と root ボーンの共通の親 Group」で行う（root ボーンを動かさない: §1.5）
  fish.group.position.addScaledVector(vel, dt);
  // 4) 通常は何もしない。renderer.render() が scene.updateMatrixWorld() → projectObject → skeleton.update() をやる
  renderer.render(scene, camera);                              // WebGLRenderer.js:1663 → 1709 → WebGLObjects.js:52
}
```

- **`skeleton.update()` は手動で呼ぶ必要がない**。`renderer.render()` 内で `scene.updateMatrixWorld()`（`WebGLRenderer.js:1663`）の後、`projectObject`（同 `:1709`）→ `objects.update()`（同 `:1901/:1916`）→ `WebGLObjects.js:46-56` が skeleton ごとに `info.render.frame` あたり 1 回 `skeleton.update()` を呼ぶ [S]。
- **手動で呼ぶ場合は必ず先に `updateMatrixWorld(true)`**。`Skeleton.update()` は `bones[i].matrixWorld × boneInverses[i]` を詰めるだけで、骨の行列は更新しない（`Skeleton.js:208-217`）。更新せずに呼ぶと**1 フレーム古いまま**（[T] T2-A/B）。手動呼びが要るのは、`scene.matrixWorldAutoUpdate=false` にした場合、`boneMatrices` を CPU で読む場合、影パスが不規則なときの保険（§3-11）だけ。
- 順序の因果: `mixer.update` は `PropertyBinding` 経由で `position/quaternion/scale` を書く（書込み後 `matrixWorldNeedsUpdate=true`: `PropertyBinding.js:463-468`, 版管理 `:650`）。行列への反映は `Object3D.updateMatrixWorld`（`Object3D.js:1176`）。**mixer の後にプロシージャルを書き、その後に行列更新**、が正しい。逆順（プロシージャル → mixer）だと mixer が上書きする。
- `bone.matrixAutoUpdate = false` にすると TRS の変更が無視される [T] T2-C。骨では触らない。

### 1.3 脊椎の体波を回転で作るときの式（length 保存）

骨 j のローカル回転角 = `θ_j − θ_{j−1}`、`θ_j = atan(y′(s_j))`（区間 j の中点の接線角）、`y′(s,t) = A′(s)·sin(ks−ωt) + A(s)·k·cos(ks−ωt)`（本書の導出。[T] T19 で FK を数値実行）。**回転だけ**で構成するので、ボーン鎖は体長を変えない（単純に y(s) を横ずらしすると、尾端振幅 0.10L で +3.2%、0.12L で +4.5%、0.17L で +8.4% 伸びる: [T] T15）。1 関節あたりの最大回転角は、24 ボーンなら 尾端振幅 0.10L で 12°、0.12L で 15°、0.20L で 24°（12 ボーンだと 23°/27°/43°、32 ボーンだと 9.5°/11°/18°: [T] T19）— **ボーン数の決定材料**にする（線形ブレンドスキニングの崩れは関節角が大きいほど目立つ。閾値は未検証）。鎖の中心線は x(s) が弧長で縮むぶん伸展した目標 y(s) と尾端で最大 0.9%L（0.10L）〜5%L（0.20L）ずれるが、これは弧長パラメータ化の違いで誤差ではない（T19）。`A(s)` の定義（片振幅か peak-to-peak か）は `r08_swim_steady.md` でも未確定なので、**値を入れる前に定義を決める**こと（本書は式の形だけを扱う）。

### 1.4 mixer（固定クリップ加算）とプロシージャルの分担ルール

1. **ボーン（チャンネル）を分ける**のが最も安全。脊椎の `quaternion` は手続き側が毎フレーム**絶対値で**書く。クリップは脊椎以外のボーンだけにトラックを持たせる。クリップを `makeClipAdditive(clip, 0)` で加算化し、`weight` を振幅、`timeScale` を周波数に使う（加算の重みは回転角にほぼ線形に効く: [T] T3-d、weight 0.5 で角度が半分）。
2. **A. 同じボーンを両方が触らない** → `bone.quaternion.copy(restQ).multiply(wave)` だけでよい（`restQ` はロード時に `bone.userData` へ保存）。
3. **B. 同じボーンを両方が触る**（例: 脊椎の曲げ + 加算の「うねり」）→ mixer は**値が変化したフレームしか書かない**（§2.5）ので、素朴な `q.multiply(δ)` は蓄積バグになる [T] T3-a。次のレシピは検証済み [T] T14-a:

```js
// 初期化: play() の前に休止姿勢を確定し、その値を保存（mixer が「original」としてこれを保存する）
s.restQ.copy(bone.quaternion);  s.restInv.copy(s.restQ).invert();  s.mixerOut.copy(s.restQ);
// 毎フレーム
bone.quaternion.copy(s.mixerOut);                  // (1) 前回の mixer 出力を戻す（前フレームの手続き分を消す）
mixer.update(dt);                                  // (2) 変化があれば mixer が書く。無ければ (1) の値が残る
s.mixerOut.copy(bone.quaternion);                  // (3) mixer 出力 = restQ ⊗ δ を保存
s.delta.copy(s.restInv).multiply(s.mixerOut);      //     δ = restQ⁻¹ ⊗ mixerOut
bone.quaternion.copy(s.proc).multiply(s.delta);    // (4) 手続きの絶対姿勢 ⊗ δ    ※ s.proc = restQ ⊗ wave（§1.2 の (2) で計算した値）
```

4. **mixer の Normal ブレンドで weight < 1 のトラックは「現在のボーン値」ではなく「play() の瞬間に保存した original」へ向かって混ざる** [T] T3-b。手続き側の姿勢に向かって混ざることを期待しない。additive も同様に `original ⊗ δ` で、手続き姿勢の上には載らない（B のレシピが必要）。
5. `action.stop()` や、フェードアウトで weight が 0 になったトラックのボーンは **original に戻される**（stop は `restoreOriginalState`: `AnimationMixer.js:171-193`, `PropertyMixer.js:279-286`）[T] T3-c。手続き側が書いた値は、stop した瞬間に original で上書きされる。
6. 休止姿勢を**最初に確定**してから `play()`（`skeleton.pose()` を使うなら play の前）。play 後に手続きで書いた値は original に反映されない [T] T3-b。
7. フェード: `incoming.reset().play(); outgoing.crossFadeTo(incoming, dur, warp)`。**`crossFadeFrom/To` は incoming を `play()` しない**し、フェード後の outgoing は `enabled=false` のまま active リストに残る（`reset()` しないと再利用できない）[T] T9-a/b。

### 1.5 バウンディング／カリング

- **個体の移動・回転・拡縮は、mesh と root ボーンの共通の親 `Group` で行う**。AttachedBindMode では mesh の `matrixWorld` が `bindMatrixInverse` で打ち消されるので（`SkinnedMesh.js:294-296`）、Group を動かせば骨も mesh も一緒に動き、**ローカル空間で計算した boundingSphere が有効なまま**（[T] T13: 移動・回転・2 倍拡縮で球が追従し、適度な曲げなら変形後の頂点が世界座標の球の中に収まる。強い曲げでは休止球からはみ出す: 下記）。**root ボーンを mesh に対して大きく動かさない**（[T] T4-a: root を 500 動かすとキャッシュ球が古く、実体が視錐台内でも描画されない）。
- `SkinnedMesh.boundingSphere` は**初回のカリング判定で 1 回だけ自動計算してキャッシュ**される（`Frustum.js:146-152`）。そのとき姿勢が波の途中だと球が偏る。**ロード時（休止姿勢・`updateMatrixWorld(true)` 後）に 1 度 `computeBoundingSphere()` し、`radius` に最大横振幅＋頭の振れ分の余裕を足して固定**する。クローンは球を複製する（`SkinnedMesh.js:171-172`）ので、**クローン前に計算**する。
- **毎フレーム `computeBoundingSphere()` はしない**: 全頂点を CPU スキニングする。5k 頂点で約 2〜2.5 ms、20k で約 7.5〜10.6 ms、100k で約 37〜40 ms（Node 実測、3 回の実行の範囲 [T] T4-c）。JSDoc の「毎フレーム再計算すべき」（`SkinnedMesh.js:104-107,134-137`）は個体数が多いと非現実的。
- 余裕の目安: 強く曲げた鎖（各関節 0〜0.6 rad）で休止姿勢の球から最大 2.25 はみ出した（体長 5、休止球半径 2.62: [T] T13）。実際の泳ぎ（尾端振幅 ≲ 0.12〜0.2L）での必要余白は未計測（§4）。
- `frustumCulled = false` にすれば常に描画（`WebGLRenderer.js:1914`, 影は `WebGLShadowMap.js:526`）。個体が少なければ最も安全だが、画面外の個体も skeleton 更新と描画コールが走る。
- 影パスも同じ球で判定する（`WebGLShadowMap.js:526`、光のカメラの視錐台に対して）ので、球がずれると本体と影のカリングが食い違いうる [R]。

### 1.6 ボーン／テクスチャの設計値

- ボーン数に**コード上の上限は無い**。`bone texture` 1 枚に全行列を入れる（常に使用）。サイズ式は `size = max(4, ceil(sqrt(N×4)/4)×4)`（`Skeleton.js:252-254`）。**2 のべきではなく 4 の倍数**: N=24 → 12×12（2,304 B）、N=36 → 12×12、N=37 → 16×16、N=100 → 20×20 [T] T1。毎フレーム全体を再アップロード（`Skeleton.js:219-222`）。
- 1 頂点あたりの影響ボーンは**最大 4**（`skinIndex`/`skinWeight` が `vec4`: `WebGLProgram.js:665-666`）。5 本以上のウェイトは glTF の `JOINTS_1/WEIGHTS_1` に入れても使われない（`GLTFLoader.js:2286-2287` は `_0` だけをマップ）。
- 属性型: `skinIndex` は **Uint16（または Uint8）か Float32**、`skinWeight` は Float32（または正規化 Uint8/16）。**Uint32/Int32 は避ける**（整数属性として `vertexAttribIPointer` に回り（`WebGLBindingStates.js:357`）、`vec4` 宣言と食い違う疑い。GPU 未検証 [U]）。
- ウェイトは作成後に **`mesh.normalizeSkinWeights()` を 1 回**（シェーダは再正規化しない: 合計 2 だと頂点が約 2 倍に伸びる [T] T8-a）。ローダは自分で呼んでいる（`GLTFLoader.js:3926-3928`, `FBXLoader.js:1454`）。
- マテリアルに `skinning: true` のようなフラグは不要（`USE_SKINNING` は `object.isSkinnedMesh` から自動: `WebGLPrograms.js:330`, `WebGLProgram.js:579`）。

### 1.7 モーフターゲット

- r186 のモーフは**常にテクスチャ方式**（`DataArrayTexture` に 1 ターゲット 1 層）。旧来の「8 本まで」の制限は無い（`WebGLMorphtargets.js:12-100`）。実質の上限は、非インスタンス時のユニフォーム配列 `morphTargetInfluences[MORPHTARGETS_COUNT]`（`morphtarget_pars_vertex.glsl.js:7`、`MAX_VERTEX_UNIFORM_VECTORS` による）と層数 `MAX_ARRAY_TEXTURE_LAYERS`（実機値は未確認 [U]）、頂点あたりのループ（`morphtarget_vertex.glsl.js:9-13`）。
- テクスチャは**ジオメトリごとに 1 回しか作られない**（`WebGLMorphtargets.js:20-22`。ターゲット数が変わったときだけ再生成）。**初回描画後に morphAttributes の中身を書き換えても反映されない**。
- **相対モーフ（`geometry.morphTargetsRelative = true`）を使う**。そうでないと基準の重みが `1 − Σ重み` になる（`WebGLMorphtargets.js:146`, `InstancedMesh.js:377`）。
- 表情・口・鰓蓋のようなモーフは `.morphTargetInfluences[名前]` トラックで AnimationMixer に載せられる（名前→添字は `PropertyBinding.js:661-688`）[T] T9-e。

### 1.8 型定義（@types/three 0.186.0）の取扱い

`types/objects/Skeleton.d.ts:71` に**ソースに存在しない `frame: number`**、`types/objects/SkinnedMesh.d.ts:70` に**存在しない第 3 コンストラクタ引数 `useVertexTexture`**、`boundingBox/boundingSphere` を非 null で宣言（実体は初期値 `null`: `SkinnedMesh.js:91,99`）。型を信じず、`mesh.boundingSphere ??= …` の形で書く。

---

## 2. 確認事項と根拠（ファイル:行）

### 2.1 ボーン数の上限と boneTexture のサイズ計算

| 事項 | 根拠 | 種別 |
|---|---|---|
| レンダラにボーン数上限の記述が無い（`maxBones`/`MAX_BONES` は src/renderers に 0 件） | §5 の grep（exit=1） | [S] |
| WebGL は WebGL2 のみ | `WebGLRenderer.js:409` | [S] |
| ボーン行列は常に bone texture 経由。初回描画で未生成なら `computeBoneTexture()` | `WebGLRenderer.js:2687-2699`、シェーダ `skinning_pars_vertex.glsl.js:6-22`（`texelFetch` を 4 回 = 1 行列 4 ピクセル） | [S] |
| サイズ式、RGBA/Float の `DataTexture`、Nearest フィルタ | `Skeleton.js:252-260`、`DataTexture.js:32` | [S][T] |
| 例: N=1〜4 → 4×4、5〜16 → 8×8、17〜36 → 12×12、37〜64 → 16×16、100 → 20×20、256 → 32×32 | 表 §5 T1 | [T] |
| 行をまたがない保証: `size % 4 == 0` かつ `size² ≥ 4N`（N=1〜5000 全てで成立） | §5 T1 | [T] |
| 理論上限 = `MAX_TEXTURE_SIZE² / 4`（4096 なら 4,194,304 本）。コードは検査しない | `WebGLCapabilities.js:106,133` が `maxTextureSize` を保持 | [R] |
| `computeBoneTexture()` は `skeleton.boneMatrices` を**パディング付きの大きい配列に差し替える**（24 ボーンで 384 → 576 要素） | `Skeleton.js:256-262` | [S][T] |
| `update()` のたびに `boneTexture.needsUpdate = true`（毎フレーム全体を再アップロード） | `Skeleton.js:219-222` | [S] |
| WebGPU 経路: ボーン行列が uniform buffer 上限に収まれば uniform buffer、超えれば bone texture。属性は `skinIndex: uvec4` | `src/nodes/accessors/Skinning.js:58-88, 234` | [S]（実行はしていない） |

### 2.2 `skeleton.update()` の呼ばれ方と更新順序

| 事項 | 根拠 | 種別 |
|---|---|---|
| `update()` は `bones[i].matrixWorld × boneInverses[i]` を `boneMatrices` に書く。骨の行列は更新しない | `Skeleton.js:199-225`（式は `:212-216`） | [S][T] T2-A/B |
| `update()` の JSDoc は誤り（「Resets the skeleton to the base pose」。それは `pose()`）。型定義側の説明は正しい | `Skeleton.js:196-198` vs `Skeleton.js:153-194`、`types/objects/Skeleton.d.ts` | [S] |
| 呼び出し元は `WebGLObjects.update()`: skeleton ごとに `info.render.frame` あたり 1 回 | `WebGLObjects.js:46-56` | [S] |
| 描画順序: `scene.updateMatrixWorld()` → `projectObject`（`objects.update`）→ `info.render.frame++` → `shadowMap.render`（影の `objects.update`）→ 描画 | `WebGLRenderer.js:1663 → 1709(1901/1916) → 1729 → 1737`、`WebGLShadowMap.js:526-530` | [S] |
| `objects.update()` は**視錐台判定を通った物体にだけ**呼ばれる（画面外の個体は `skeleton.update()` されない） | `WebGLRenderer.js:1914-1916`、`WebGLShadowMap.js:526-530` | [S] |
| `SkinnedMesh.updateMatrixWorld` は毎回 `bindMatrixInverse` を再計算（Attached: `inverse(matrixWorld)`、Detached: `inverse(bindMatrix)`） | `SkinnedMesh.js:290-308` | [S] |
| 骨の `matrixAutoUpdate=false` だと TRS 変更が行列に反映されない | `Object3D.js:1176-1178`, [T] T2-C | [S][T] |
| WebGPU 経路は `OnObjectUpdate` 内で `frameId` ごとに 1 回 `skeleton.update()` | `Skinning.js:240-258` | [S] |

### 2.3 frustumCulled とバウンディング

| 事項 | 根拠 | 種別 |
|---|---|---|
| `boundingBox`/`boundingSphere` の初期値は `null` | `SkinnedMesh.js:91,99` | [S] |
| 計算は**全頂点**を `getVertexPosition`（= morph + `applyBoneTransform`）で CPU スキニングし、メッシュ**ローカル**空間で包む | `SkinnedMesh.js:109-159,213-221` | [S] |
| カリングは `object.boundingSphere !== undefined` なら**それを使い**、`null` なら 1 度計算。`geometry.boundingSphere` は使わない | `Frustum.js:146-166` | [S] |
| 描画前の透明ソートの基準点も `object.boundingSphere.center` | `WebGLRenderer.js:1921-1925` | [S] |
| 手動で `mesh.boundingSphere = new Sphere(...)` を入れると尊重され、自動再計算されない | `Frustum.js:148-150`, [T] T14-b | [S][T] |
| `frustumCulled = false` で判定自体が飛ぶ | `Object3D.js:315`、`WebGLRenderer.js:1892,1914`、`WebGLShadowMap.js:526` | [S] |
| root ボーンだけ動かすとキャッシュ球が古くなり、**実体が見える位置でカリング／見えない位置で描画**される | [T] T4-a | [T] |
| `SkinnedMesh.copy` は球・箱を複製する | `SkinnedMesh.js:171-172` | [S][T] T5-b |
| `boundingBox` はレンダラでは使われず、`raycast` の事前判定（球の後）だけに使われる（`computeBoundingBox` を呼んでいなければ `null` のままで判定を省略） | `SkinnedMesh.js:201-205` | [S] |
| `raycast` も球 → 箱 → CPU スキニングで全三角形判定（重い） | `SkinnedMesh.js:178-211` | [S] |
| CPU コスト（Node、3 回の実行の範囲）: computeBoundingSphere 5k≈2〜2.5ms / 20k≈7.5〜10.6ms / 100k≈37〜40ms | §5 T4-c | [T] |
| InstancedMesh も境界は**初回に 1 回だけ**計算（`Frustum.js:150`）。インスタンスを動かしても古いまま。`computeBoundingSphere()` は 2,000 個で約 0.14 ms、10,000 個で約 0.7 ms | `InstancedMesh.js:100,151-180`, [T] T17 | [S][T] |

### 2.4 ウェイト・属性型・bindMode・bindMatrix・applyBoneTransform

| 事項 | 根拠 | 種別 |
|---|---|---|
| 頂点シェーダの式: `transformed = bindMatrixInverse × Σ w_i·boneMat_i × (bindMatrix × v)`（`boneMat` = bone texture の行列） | `skinning_vertex.glsl.js`, `skinbase_vertex.glsl.js`。CPU 版 `applyBoneTransform` と一致を確認 | [S][T] T8-a |
| 法線: `bindMatrixInverse × Σ w_i·boneMat_i × bindMatrix` を掛ける | `skinnormal_vertex.glsl.js` | [S] |
| ウェイトは**シェーダで再正規化されない** | 同上 | [S][T] T8-a |
| `normalizeSkinWeights()`: 各頂点を L1 ノルム（manhattanLength）で割る。合計 0 なら `(1,0,0,0)` | `SkinnedMesh.js:262-288` | [S][T] |
| `bind(skeleton, bindMatrix?)`: 省略時は `updateMatrixWorld(true)` → `skeleton.calculateInverses()`（**その時点の骨の matrixWorld の逆行列**）→ `bindMatrix = mesh.matrixWorld`。引数ありなら逆行列は再計算しない | `SkinnedMesh.js:230-247` | [S] |
| `bindMode`: Attached（既定）は mesh が skeleton と同じワールド空間を共有。Detached は skeleton を複数 mesh で共有する用途 | `constants.js:484-500`, `SkinnedMesh.js:61-69,290-308` | [S] |
| Detached では mesh の `matrixWorld` が結果にそのまま乗る。骨が mesh の子だと**二重に動く**（mesh を +10 動かすと世界座標で +20 [T] T8-b） | 同上 | [T] |
| `applyBoneTransform(index, target)`: 1 頂点の CPU スキニング。`Vector3`=位置、`Vector4`(w=0)=方向。骨の `matrixWorld` を直接使う（`boneMatrices` ではない） | `SkinnedMesh.js:319-366` | [S][T] |
| 用途: `getVertexPosition` → bounds・raycast、`BufferGeometryUtils.computeMorphedAttributes`（姿勢の焼き込み） | `SkinnedMesh.js:213-221`、`examples/jsm/utils/BufferGeometryUtils.js:924,994-997` | [S] |
| `skinIndex` の型: FBXLoader は `Uint16BufferAttribute`、GL 側は `Uint32/Int32` のとき整数属性扱い（`vertexAttribIPointer`）。GLSL 宣言は `vec4` | `FBXLoader.js:1820`、`WebGLBindingStates.js:357`、`WebGLProgram.js:665-666` | [S]（食い違いの実害は [U]） |
| `skeleton.pose()`: 骨の matrixWorld を `boneInverses⁻¹` に戻し、ローカル TRS に分解して書き戻す | `Skeleton.js:153-194` | [S] |

### 2.5 AnimationMixer / Clip / Action / PropertyBinding

**mixer 内部のブレンド実装（`PropertyMixer.js`）— 手続きとの併用で最重要**

| 事項 | 根拠 | 種別 |
|---|---|---|
| バッファ構成 `[incoming \| accu0 \| accu1 \| orig \| add \| work]`、quaternion は 6 領域 | `PropertyMixer.js:15-60` | [S] |
| `accumulate`: 重みの累積で正規化した加重平均（`mix = w / 累積重み`）。重み (2,1) → (2·a+b)/3、(1,1) → 平均 | `PropertyMixer.js:130-166`, [T] T3-e | [S][T] |
| `apply`: 累積重み < 1 なら**`orig` へ (1−w) だけ混ぜる**。additive があれば加える。**accu が前フレームから変化した場合のみ**ボーンへ書く | `PropertyMixer.js:198-247` | [S][T] |
| `saveOriginalState`: トラックの**最初の有効化時**（`useCount` 0→1）に現在のボーン値を保存 | `PropertyMixer.js:250-277`, `AnimationMixer.js:129-165` | [S][T] |
| 無効化（`stop`）で `restoreOriginalState` | `PropertyMixer.js:279-286`, `AnimationMixer.js:171-193` | [S][T] |
| quaternion の additive は `current ⊗ δ`（右から掛ける）を恒等からの slerp で重み付け → 角度は重みに線形 | `PropertyMixer.js:344-354`, [T] T3-d | [S][T] |

**AnimationAction**

| 事項 | 根拠 | 種別 |
|---|---|---|
| `time` は書込み可（個体ごとの位相ずらし）、`timeScale`、`weight`、`paused`、`enabled`、`clampWhenFinished` | `AnimationAction.js:84,93,104,125,136,151` | [S] |
| `setEffectiveWeight(w)`（フェードを止めて重みを設定）、`fadeIn/fadeOut`（`_scheduleFading`：mixer 時間で線形） | `:277-286`, `:306-330`, `:919-934` | [S][T] T9-a |
| `crossFadeFrom/To(other, dur, warp)` は片方を `fadeOut`、他方を `fadeIn` するだけで **`play()` しない**。warp=true は `warp(1, 長さ比)`/`warp(長さ比の逆, 1)` を張る | `:334-372` | [S][T] T9-b/c |
| フェードアウトが終わると `enabled=false`（active リストには残る）。再利用は `reset()`（`enabled=true`, `time=0`） | `:638-673`, `:202-212` | [S][T] T9-a |
| `warp(start, end, dur)`: タイムスケール係数を mixer 時間で線形補間。終了時に `timeScale` を確定（0 に向かう場合は `paused`）。`halt(dur)` は 0 へ。`setDuration(d)` は `timeScale = clip.duration / d` | `:475-506`, `:459-461`, `:430-436`, `:675-722` | [S][T] T9-d |
| LoopRepeat は時刻が `duration` に**ちょうど達すると 0 に折り返す**（最後のキーで止まらない） | `:724-880`, [T] T11 の注 | [S][T] |
| ブレンドモードは action ごと（既定は clip.blendMode）。additive は `accumulateAdditive`、normal は `accumulate` | `:560-636`, `AnimationMixer.js:557-619` | [S] |

**AnimationMixer**

| 事項 | 根拠 | 種別 |
|---|---|---|
| `update(dt)`: `dt *= mixer.timeScale` → 時間加算 → 全 active action の `_update` → 全 active binding の `apply` | `AnimationMixer.js:676-716` | [S] |
| `clipAction(clip, root)`: (clip, root, blendMode) ごとに 1 つ。**1 つの mixer に複数の root を載せ、root ごとに独立した時間・重みを持てる** | `AnimationMixer.js:557-619`, [T] T5-e | [S][T] |
| 個体を外しても mixer は action/binding を保持して更新し続ける。`uncacheRoot(root)` で解放 | `AnimationMixer.js:801-843`, [T] T18（20→10） | [S][T] |
| `AnimationObjectGroup`: 全メンバーに**同じ値**を書く。個体別の位相は持てない | `AnimationObjectGroup.js:1-24` | [S] |

**AnimationClip / makeClipAdditive / KeyframeTrack**

| 事項 | 根拠 | 種別 |
|---|---|---|
| `makeClipAdditive(targetClip, referenceFrame=0, referenceClip=targetClip, fps=30)`: 数値トラックは基準値を引き、quaternion は**基準の共役を左から掛ける**（δ = q_ref⁻¹ ⊗ q(t)）。**元のクリップを破壊的に変更**して `blendMode = Additive` に。bool/string は対象外 | `AnimationUtils.js:263-382`（`:380`） | [S][T] T3-d |
| 基準が bone の original と同じ姿勢なら、重み 1 の additive はもとのクリップを再現する（`orig ⊗ q_ref⁻¹ ⊗ q(t) = q(t)`） | 上記から導出。z 軸のみで [T] T3-d（0.2 + 0.15 = 0.35） | [R]（非同軸は未実行） |
| `QuaternionKeyframeTrack` は Linear（slerp）と Discrete のみ（`InterpolantFactoryMethodSmooth = undefined`）→ 周期の波を焼くなら**キーを密に、最初と最後を同値に** | `QuaternionKeyframeTrack.js` | [S] |
| `CreateFromMorphTargetSequence` 等の補助 | `AnimationClip.js:162-204` | [S] |

**PropertyBinding（トラック名の仕様）**

| 事項 | 根拠 | 種別 |
|---|---|---|
| 文法: `nodeName.property[accessor]`、`.bones[名前].property`、`.morphTargetInfluences[名前]`、`親/ノード.property`。予約文字は `[ ] . : /` | `PropertyBinding.js:1-30, 186-262`、[T] T11-a | [S][T] |
| `sanitizeNodeName`: 空白→`_`、予約文字を除去（例 `"fin L.001:x"` → `fin_L001x`） | `PropertyBinding.js:185-187`, [T] | [S][T] |
| ノード探索: `root.name/uuid` 一致 → `root.skeleton.getBoneByName`（最初の一致）→ 子孫を DFS（最初の一致）。見つからなければ警告のみで**トラックは無音で無効** | `PropertyBinding.js:266-320, 487-504`, [T] T11-b | [S][T] |
| Object3D への書込みは `fromArray` 後に `matrixWorldNeedsUpdate = true` | `PropertyBinding.js:463-468, 640-651` | [S] |

### 2.6 モーフターゲット

| 事項 | 根拠 | 種別 |
|---|---|---|
| モーフ位置（＋法線＋色）を `DataArrayTexture`（層=ターゲット、幅=頂点数×stride 1/2/3、`maxTextureSize` 超は折返し）に格納 | `WebGLMorphtargets.js:15-60`, `WebGLPrograms.js:86-92` | [S] |
| ジオメトリごとに `WeakMap` キャッシュ、**ターゲット数が変わったときだけ再生成** | `WebGLMorphtargets.js:20-22` | [S] |
| 頂点シェーダ: `gl_VertexID` で引き、**影響が 0 でないターゲットだけ**足す。基準は `transformed *= morphTargetBaseInfluence` | `morphtarget_vertex.glsl.js:9-13` | [S] |
| 相対／絶対: `morphTargetsRelative` で基準影響が 1 か `1 − Σw` | `WebGLMorphtargets.js:146`, `InstancedMesh.js:377`, [T] T10-b（絶対だと 1.1） | [S][T] |
| 適用順: morph → skin（`begin_vertex` → `morphtarget_vertex` → `skinning_vertex`、法線は `morphnormal` → `skinnormal`） | `meshphysical.glsl.js:33-42` | [S] |
| `Mesh.morphTargetInfluences` は**構築時**に `updateMorphTargets()` で作る。あとから morphAttributes を足したら自分で `updateMorphTargets()` | `Mesh.js:137`, [T] T9-e | [S][T] |
| `Mesh.copy` は `morphTargetInfluences` を `slice()`（個体別の重みになる）、geometry/material は参照共有 | `Mesh.js:110-130`（`:116`） | [S] |
| **InstancedMesh.morphTexture**: `RedFormat`/`Float`、幅 = K+1、高さ = count。行 = `[基準影響, w0…wK−1]`。`setMorphAt(i, mesh)` の後に `morphTexture.needsUpdate = true` | `InstancedMesh.js:77, 355-385`, [T] T10-b | [S][T] |
| インスタンス morph のシェーダ: `texelFetch(morphTexture, ivec2(i+1, gl_InstanceID))`。ローカル配列なので**ユニフォーム上限に掛からない** | `morphinstance_vertex.glsl.js:4-10`, `WebGLMorphtargets.js:132-134` | [S] |
| 影（深度／距離）シェーダにも同じ `morphinstance_vertex` が入っている → **影パスは自動で追従** | `depth.glsl.js:23`, `distance.glsl.js:21` | [S] |
| `InstancedMesh.updateMorphTargets()` は**空関数**なので `morphTargetInfluences` は `undefined`。`morphTexture` が `null` のまま描画すると `WebGLMorphtargets.js:140` で `undefined.length`（**読解による予測**。レンダラ上では未実行） | `InstancedMesh.js:388`, [T] T10-d（`undefined` を確認） | [S][R] |
| モーフ・テクスチャのメモリ: 20k 頂点 × 位置＋法線 × 2 ターゲット ≈ 1.2 MiB | §5 T10-c | [T] |

### 2.7 多数個体（InstancedMesh／BatchedMesh／clone／脊椎スプライン案）

**SkinnedMesh を InstancedMesh／BatchedMesh で扱えるか: r186 では不可（標準機能として）**

| 事項 | 根拠 | 種別 |
|---|---|---|
| スキニングの有効化は `object.isSkinnedMesh`、インスタンスは `object.isInstancedMesh`、バッチは `object.isBatchedMesh` という**別々の型フラグ**。1 つのオブジェクトは 1 つのクラス | `WebGLPrograms.js:124-125, 330` | [S] |
| `InstancedMesh.js` に skeleton/skin/bone の記述が 0 件（morph は 25 件）。`BatchedMesh.js` は morph/skin/skelet/bone の記述が **0 件** | §5 の grep | [S] |
| `BatchedMesh` は**属性だけ**をコピー。`morphAttributes` は引き継がない。一貫性検査も属性のみ | `BatchedMesh.js:381-413, 418-441` | [S] |
| シェーダの `getBoneMatrix(i)` はインスタンス番号を取らない。`bindMatrix`/`boneTexture` は 1 描画につき 1 組 | `skinning_pars_vertex.glsl.js:6-22` | [S] |
| レンダーリストの `materialVariant` も Skinned(+1) と Instanced(+2) を別バリアントで管理（併用想定が無い） | `WebGLRenderLists.js:74-79` | [S] |
| WebGPU/TSL 側の `NodeMaterial` も morph → skinning → batch → instance の順に独立に適用するだけで、個体別 skeleton の仕組みは無い | `src/materials/nodes/NodeMaterial.js:770-800` | [S]（未実行） |
| 迂回策（未検証）: ボーン行列をアプリ側で 1 枚の `DataTexture` に詰め、`onBeforeCompile` で `getBoneMatrix` に `gl_InstanceID × ボーン数` を足す。`USE_SKINNING` は `isSkinnedMesh` に結び付いている（属性宣言 `WebGLProgram.js:663-667`）ので**属性宣言も自前**。影用に `customDepthMaterial`/`customDistanceMaterial` が必要 | 上記＋`WebGLShadowMap.js:433`, `Object3D.js:347,357` | [R] |

**SkeletonUtils.clone と Skeleton 共有（`examples/jsm/utils/SkeletonUtils.js:392-431`）**

| 事項 | 種別 |
|---|---|
| 素の `object.clone()` では SkinnedMesh の `skeleton` が**元の個体と共有**される（`SkinnedMesh.copy`: `SkinnedMesh.js:169`）。複製側の骨を動かしても描画は元の骨で行われる | [S][T] T5-a |
| `SkeletonUtils.clone` は skeleton を個体別にし、複製された骨に付け替えて `bind` し直す。**geometry・material は共有**、`boneInverses` 配列も共有、`boneMatrices` は個体別 | [S][T] T5-b |
| 複製ごとに初回描画で自前の bone texture を作る（個体数 = テクスチャ数） | [S] `WebGLRenderer.js:2696` |
| `Skeleton.clone()` は**骨を複製しない**（同じ `Bone` を指す新 Skeleton）。`SkeletonUtils.clone` はこれを使ったうえで骨を差し替えている | [S][T] T5-d, `Skeleton.js:232-236`, `SkeletonUtils.js:414-423` |
| クリップは複数 mixer／複数 root で共有できる | [T] T5-c/e |

**ボーン無し脊椎スプライン変形（頂点シェーダ）の実現性**

- **実現可能（[R]、実行は未）**。差し込み位置は `meshphysical.glsl.js:33-44` の並びで決まる: **法線は `beginnormal_vertex` の直後**（`defaultnormal_vertex` で `transformedNormal` を作る前）、**位置は `begin_vertex` の直後**（`project_vertex` の前）。`project_vertex` は `instanceMatrix` → `modelViewMatrix` の順に掛ける（`project_vertex.glsl.js`）ので、変形はローカル空間で終える。
- 個体ごとの位相・振幅は **`InstancedBufferAttribute` をジオメトリに足す**（`WebGLBindingStates.js:405-411` が `meshPerAttribute` を除数にする）。ユニフォームは描画単位でしか持てない。
- `onBeforeCompile` を使うときは **`customProgramCacheKey()` を必ず定義**する。既定は `onBeforeCompile.toString()`（`Material.js:544-548`）。**関数のソーステキストが同じなら、クロージャの変数で生成される GLSL が違っても同じプログラムとして扱われる**ので、波長やボーン数など GLSL に埋め込む値は必ずキーに含める。
- **影**: 組込みの深度／距離マテリアルは変形を知らない。`mesh.customDepthMaterial`（平行光・スポット）と `mesh.customDistanceMaterial`（点光源）に同じ変形を入れたマテリアルを渡す（`WebGLShadowMap.js:433`）。
- **カリング**: InstancedMesh の球は「ジオメトリの休止球 × インスタンス行列」を初回に 1 回だけ作る。変形の振れ幅を加味して半径を足し、個体が動くなら定期的に `computeBoundingSphere()`（2,000 個で約 0.14 ms [T]）、または `frustumCulled=false`。
- 伸び: 横ずらしだけの変形は体長が伸びる（尾端振幅 0.10L で +3.2%: [T] T15）。シェーダで `x(s) = ∫cosθ ds` を数値積分するか、伸びを許容する。

**morph 方式の設計案（本書の提案。CPU 上の数式のみ検証）**

- 固定波長 λ・固定包絡 A(s) の進行波 `y(s,t) = A(s) sin(ks − ωt)` は、**2 つの相対モーフ** `S = A sin(ks)`, `C = A cos(ks)` と重み `(cos ωt, −sin ωt)` で**厳密に**書ける（CPU 上の最大誤差 3.9e-9: [T] T10-a）。振幅は重みのスケール、位相は個体ごとの積算 ωt。
- 体長の伸びは 2 次の量なので、**x 方向の短縮を表す 3 本（重み `cos², sin·cos, sin²`）を足すと** 0.10L で +3.18% → +0.26%、0.12L で +4.48% → +0.53%、0.17L で +8.4% → +2.0% に減る（[T] T16）。計 5 本。旋回の曲げを足すなら 1〜2 本。
- 法線は線形化したモーフ法線を足す（`morphNormals`）。断面の回転（頂点の横オフセット × 傾き）による位置のずれは 1 次の量で、同じ線形ターゲットに含められる（**数値検証は未実施** §4）。
- 1 個体の重み更新は `Float32Array` への直接書込みで 1,000 個体 30 µs/frame、アップロードは 12 KB/frame（[T] T10-b）。
- 影は組込みの深度シェーダが自動で追従（§2.6）。**カスタム GLSL 不要**が最大の利点。

### 2.8 型定義との差異（@types/three 0.186.0）

| 型定義 | ソース | 影響 |
|---|---|---|
| `Skeleton.frame: number`（`types/objects/Skeleton.d.ts:71`） | `Skeleton.js` に `frame` なし | 参照すると `undefined` |
| `SkinnedMesh` のコンストラクタ第 3 引数 `useVertexTexture`（`SkinnedMesh.d.ts:70`） | ソースの引数は `(geometry, material)` のみ（`SkinnedMesh.js:46`） | 無視される |
| `SkinnedMesh.boundingBox/boundingSphere: Box3/Sphere`（非 null） | 初期値 `null`（`SkinnedMesh.js:91,99`） | null チェックが型に出ない |
| `Skeleton.fromJSON(): void` | ソースは `this` を返す（`Skeleton.js:317-342`） | 軽微 |

---

## 3. 落とし穴

1. **骨がシーンに入っていない**: `Skeleton.update()` は `matrixWorld` を読むだけ（`Skeleton.js:212`）。root ボーンを mesh（または scene 内の何か）の子にしていないと行列が更新されず、アニメしても動かない（休止姿勢のまま）。[R]
2. **`skeleton.update()` を `updateMatrixWorld` 前に呼ぶ** → 1 フレーム古いデータ [T] T2-A。
3. **骨の `matrixAutoUpdate=false`** → TRS の変更が行列に反映されない [T] T2-C。
4. **mixer は「変化した時だけ」書く** → 手続きで `q.multiply(δ)` を毎フレーム重ねると、クリップが静止／一時停止の間に**蓄積**（+0.1/frame）[T] T3-a。→ §1.4 の B。
5. **weight < 1 の Normal ブレンドと additive は「play() 時点の original」基準**。手続きで play 後に書いた値は使われない [T] T3-b/d。
6. **`stop()` やフェード終了で original へ復元される**: 手続きで上書きした値が消える／ポップする [T] T3-c。フェード終了後に手続きで書いた 0.9 は、次の `mixer.update()` では書き戻されず残る（accu が不変のため）[T] T3-c。
7. **`crossFade` は incoming を `play()` しない**、フェード後の outgoing は `enabled=false` で残り、`play()` だけでは復帰しない（`reset()` が必要）[T] T9-a/b。warp=true は長さの異なるクリップの位相合わせ用で、フェード終了時に timeScale を元に戻す [T] T9-c。
8. **LoopRepeat は `time == duration` で 0 に折り返す** [T] T11。最後のキーで止まらず先頭に戻るので、周期クリップは最後のキー＝最初のキーにする（`update(duration)` ちょうどだと先頭の値になる）。
9. **`makeClipAdditive` は引数のクリップを破壊的に変更**する（`AnimationUtils.js:380`）。元のクリップが要るなら先に `clip.clone()`（`AnimationClip.js:381`）。
10. **初回カリングで姿勢が焼き込まれる**: `boundingSphere` は最初の判定時の姿勢で計算（`Frustum.js:150`）。休止姿勢で先に計算・固定する（§1.5）。
11. **影パスの二重更新と不規則な更新**: `info.render.frame++`（`WebGLRenderer.js:1729`）の**前**に `projectObject`、**後**に影パスがあるため、影を落とす SkinnedMesh は**最初の render() では `skeleton.update()` が 2 回**（`projectObject` と影パス）呼ばれ、**定常状態では影パス側の 1 回だけ**になる（次の render() の `projectObject` の `frame` が、前回の影パスが使った値と一致して重複扱いになるため。[T] T7-B）。さらに、影パスが一部の render() でしか走らない構成（`shadowMap.autoUpdate=false` + `needsUpdate` を時々立てる）では、**次の render() の `projectObject` が「影パスで更新済み」と見なして更新を飛ばし、1 フレーム古い骨行列で描画**しうる（`WebGLObjects` を模擬した [T] T7-C。実レンダラでの再現は未確認）。→ 影を間引くなら、自前で `updateMatrixWorld(true)` → `skeleton.update()` を毎フレーム呼べば安全（二重計算は軽い）。
12. **個体の破棄**: ① `mixer.uncacheRoot(root)` をしないと mixer が action/binding を保持して更新し続ける（20 個体中 10 個を scene から外しても 20/20 のまま: [T] T18）。② `skeleton.dispose()` を呼ばないと bone texture が GPU に残る（`Skeleton.js:298-308`。`SkinnedMesh` は自動で呼ばない [R]）。③ geometry/material は共有なので個体ごとに dispose しない。
13. **素の `clone()` は skeleton を共有**する [T] T5-a。必ず `SkeletonUtils.clone`。**`Skeleton.clone()` も骨を共有**する [T] T5-d。個体ごとにマテリアルを変える（模様・色の個体差）なら複製後に `mesh.material = material.clone()`（`Mesh.copy` は material を参照共有: `Mesh.js:126`）。
14. **ウェイト未正規化**でメッシュが伸縮（合計 2 → 約 2 倍）[T] T8-a。`normalizeSkinWeights()`。
15. **`skinIndex` に `Uint32Array`/`Int32Array`**: 整数属性経路になり、`vec4` 宣言と不一致の疑い（`WebGLBindingStates.js:357`）。GPU 未検証。`Uint16`/`Uint8`/`Float32` を使う。
16. **DetachedBindMode で骨が mesh の子**: mesh の `matrixWorld` が二重に掛かる（+10 → +20）[T] T8-b。Detached は「骨が mesh の子孫でない」場合のみ。
17. **モーフ**: ① テクスチャは初回に作られ、以後は書換えが反映されない（`WebGLMorphtargets.js:20-22`）。② 絶対モーフで Σw > 1 だと基準影響が負になる。③ `InstancedMesh` は `morphTargetInfluences` が `undefined` で、**描画前に `setMorphAt` で `morphTexture` を作る**（`InstancedMesh.js:388`）。④ `setMorphAt` の後は `morphTexture.needsUpdate = true`（`InstancedMesh.js:347-348` の注記）。⑤ ターゲット数が違うと別プログラム（`MORPHTARGETS_COUNT` が define）。
18. **横ずらしだけの体波は体長が伸びる**: 尾端振幅 0.10L で最大 +3.2%、0.12L で +4.5%、0.17L で +8.4%、0.20L で +11.1% [T] T15。骨の回転で作れば保存される。
19. **休止姿勢の回転を捨てる**: `bone.quaternion.setFromAxisAngle(...)` は絶対値で、書き出し元（Blender/glTF）の骨が非恒等の休止回転を持つと**ポップ**する。`restQ ⊗ wave` にする（§1.4）。回転軸は骨のローカル軸（背腹軸まわり）に合わせる。モデルの軸規約は本調査では確認していない（§4）。
20. **トラック名**: 予約文字 `[ ] . : /`、先頭一致、見つからないと無音で無効（警告 1 行）[T] T11。名前は `PropertyBinding.sanitizeNodeName` 後の値と一致させる。同名の骨が複数あると最初の 1 つだけ（`PropertyBinding.js:277-283`）。
21. **`Clock` は deprecated（r183）で、生成時に警告を出す**（`Clock.js:61`）。`THREE.Timer` を使い `connect(document)` で非表示時の巨大 dt を避ける（`Timer.js:43`）。
22. **高い尾鰭振動数の表示**: `r08_swim_steady.md` の稚魚の尾鰭振動数 20.8〜39.1 Hz は 60 fps のナイキスト（30 Hz）付近以上。位相積算 `φ += 2π f dt` をそのまま描くとエイリアシングで逆回転に見える。表示用の周波数を上限で丸める／ブラーを足す設計が要る（r186 固有ではなく標本化の問題。[R]）。
23. **`SkinnedMesh.raycast` は CPU スキニングで全三角形**（`SkinnedMesh.js:178-211`）。クリック判定には単純なプロキシ（球・カプセル）を使う。
24. **`Skeleton.update()` の JSDoc が誤り**（`Skeleton.js:196-198`）。`pose()` と混同しない。
25. **型定義のドリフト**（§2.8）: `Skeleton.frame`、`useVertexTexture`、非 null の bounds。
26. **`SkinnedMesh.copy` は球を複製する**（`:171-172`）ので、**複製前に正しい（余白付きの）球を作る**。複製後に個別に作り直すと頂点数分のコストが個体ごとに掛かる。
27. **glTF の 5 本以上のウェイト**（`JOINTS_1/WEIGHTS_1`）は属性名が `joints_1`/`weights_1` になりシェーダは読まない（`GLTFLoader.js:1974, 2286-2287`）。Blender 側で「最大 4 本に制限」して書き出す。

---

## 4. 未確認／要追加検証

- **GPU 実描画は一切未検証**（WebGL コンテキスト無し）: bone texture のアップロード時間、`texelFetch` 16 回/頂点のコスト、描画コール数の上限、影パス込みのフレーム時間、ブラウザ差（Chrome/Firefox/Safari）。§1.1 の個体数しきい値（100〜200）は **CPU 実測＋描画コール数の推論**で、GPU 実測ではない。
- `Uint32/Int32` の `skinIndex` が実際に壊れるか（`vertexAttribIPointer` と `vec4` の不一致）。
- 影パスが不規則なときの「1 フレーム古い骨行列」（§3-11）を**実際の WebGLRenderer** で再現するか。T7 は `WebGLObjects` のモックで経路を再現しただけ。
- `MAX_VERTEX_UNIFORM_VECTORS`・`MAX_ARRAY_TEXTURE_LAYERS` の実機値と、モーフターゲット数の実際の上限。
- **morph 方式の画質**: 断面回転による位置ずれ（1 次項）と法線モーフの精度、旋回時の曲げ、実際の尾端振幅（0.12〜0.2L）での見た目。T16 は**中心線の長さ**しか検証していない。固定波長の仮定は `r08_swim_steady.md` の λ ≈ 0.9L（速度非依存）に依拠。
- `AnimationAction`/mixer を**数百個体**で使ったときの GC・メモリ（Node で 500 個体の CPU 時間のみ測定）。
- 休止姿勢の骨軸規約・骨の命名（モデルをどう作るか未確認: Blender 書出し／glTF／手続き生成）。`A(s)` の振幅定義（片振幅 or peak-to-peak）。
- インスタンス・スキニング（独自 bone texture）の実装と、`isSkinnedMesh` を InstancedMesh に立てる「裏技」の可否。後者は `WebGLRenderLists.js:74-79`・`skinning_pars_vertex.glsl.js` から**非推奨と判断したが試していない**。
- **WebGPURenderer** の挙動（`Skinning.js` を読んだのみ。uniform buffer／bone texture の切替しきい値の実機値は不明）。
- 非同軸回転での `makeClipAdditive` の合成（`orig ⊗ q_ref⁻¹ ⊗ q(t)` の恒等性）は式から導出しただけで、軸を変えた実行テストは未実施（z 軸のみ [T]）。
- r186 のリリースノートや公式サンプル（`examples/*.html`）は npm パッケージに含まれず、**ネットワーク遮断のため参照していない**。公式サンプルに instanced skinning があるかは未確認（`examples/jsm` 内には該当するヘルパーが無いことのみ grep で確認）。

---

## 5. 実行したコマンドと結果（再現できる形）

作業ディレクトリ: `…/scratchpad/three/`（`S`）。Node v22.22.0。ネットワークは npm レジストリのみ到達可。

### 5.1 取得物の完全性

```sh
S=/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three
# 取得（再取得する場合）
cd $S && npm pack three@0.186.1 && npm pack @types/three@0.186.0
mkdir -p three-0.186.1 types-three-0.186.0 && tar xzf three-0.186.1.tgz -C three-0.186.1 && tar xzf types-three-0.186.0.tgz -C types-three-0.186.0
# 完全性: tarball の sha1 を registry の dist.shasum と照合
sha1sum three-0.186.1.tgz types-three-0.186.0.tgz
npm view three@0.186.1 dist.shasum ; npm view @types/three@0.186.0 dist.shasum
node -e "import('$S/three-0.186.1/package/build/three.module.js').then(T=>console.log('REVISION',T.REVISION))"
```

結果: sha1 は `6d50f70c…ca38a`（three）と `fc936323…ea99`（types）で registry と一致。`REVISION 186`。展開先は three が `three-0.186.1/package/`、types が **`types-three-0.186.0/three/`**。

### 5.2 根拠 grep（`audit_b/evidence_greps.sh`、出力は付録 B）

主な結果:

- `grep -rn "maxBones\|MAX_BONES" src/renderers` → 0 件（exit 1）。
- `WebGLRenderer.js:409: const contextName = 'webgl2';`
- `grep -c -i "morph|skin|skelet|bone"`: `BatchedMesh.js:0`、`InstancedMesh.js:25`（`skelet|skin|bone` は 0 件）。
- `WebGLPrograms.js:124/125/330`: `IS_INSTANCEDMESH` / `IS_BATCHEDMESH` / `skinning: object.isSkinnedMesh === true`。
- 描画順: `1663 scene.updateMatrixWorld → 1709 projectObject → 1729 info.render.frame++ → 1737 shadowMap.render`、`WebGLObjects.js:52 skeleton.update()`。
- `Skeleton.js:252-254` のサイズ式。`WebGLProgram.js:665-666` の `attribute vec4 skinIndex/skinWeight`。`WebGLBindingStates.js:357` の整数属性判定。
- `Clock.js:6,61` の deprecated 警告。型定義の `frame`/`useVertexTexture`（ソースに無い）。

### 5.3 動作確認テスト（Node、GPU なし）

```sh
cd $S/audit_b          # common.mjs と t*.mjs（付録 A にソース全文）
sh run_all.sh > run_all.log 2>&1      # 全テスト。出力全文は付録 B
sh evidence_greps.sh > evidence_greps.log 2>&1
```

| テスト | 内容 | 結果の要点 |
|---|---|---|
| t1 | boneTexture サイズ式 | 4×4/8×8/12×12/16×16/20×20/…、`size%4==0 && size²≥4N`（N=1〜5000 で成立）、`boneMatrices` はパディングされる |
| t2 | `skeleton.update` と `matrixWorld` | `updateMatrixWorld` 前の update は古い値、`matrixAutoUpdate=false` は無視 |
| t3 | mixer × 手続き | 蓄積バグ（0.5→0.8）、復元レシピは一定、weight<1 は original 基準、stop で original 復元、additive = original ⊗ δ、重み正規化 |
| t4 | バウンディング | root 骨移動でキャッシュ球が古い／computeBoundingSphere は 5k≈2〜2.5ms・20k≈7.5〜10.6ms・100k≈37〜40ms |
| t5 | clone | 素の clone は skeleton 共有、`SkeletonUtils.clone` は個別、geometry/material/boneInverses 共有、1 mixer × 複数 root |
| t7 | `WebGLObjects` のモック | 影パスあり＝最初の render は 2 回→定常は 1 回、不規則な影で 1 フレーム古い骨行列の経路 |
| t8 | スキニング式 | GPU 式 = `applyBoneTransform`、未正規化で伸びる、Attached/Detached の差 |
| t9 | フェード・warp | 重みの遷移、再利用に `reset()` 必要、`crossFade` は play しない、warp の時間係数 |
| t10 | morph 進行波 | 2 本の相対モーフで厳密（誤差 3.9e-9）、`morphTexture` 配置、絶対モーフの基準影響 1.1、メモリ |
| t11 | トラック名 | 文法、`sanitizeNodeName`、未知の骨は警告のみ |
| t12 | CPU コスト | 24 ボーン、N=50〜500 で 1 個体あたり約 6〜10 µs/frame（手続きのみ〜mixer 込み） |
| t13 | Group 移動と球 | 回転・2 倍拡縮・曲げで世界座標が一致、強い曲げの球はみ出し 2.25 |
| t14 | 共有ボーン | 復元レシピは期待値と完全一致（running/paused とも）、素朴版は破綻、手動球は尊重 |
| t15/t16 | 体長の伸び | 横ずらしのみ +3.2%（0.10L）、2 次ターゲット追加で +0.26% |
| t17 | InstancedMesh の境界 | 初回のみ計算、動かすと古い、再計算は 2,000 個で約 0.14 ms |
| t18 | `uncacheRoot` | 20/20 → 10/10 |
| t19 | ボーン鎖の関節角 | 24 ボーン・尾端 0.12L で最大 14.8°/関節、鎖長は常に 1.000L |

> CPU 時間は実行ごとに多少ばらつく（JIT・負荷）。表は目安で、判断に使った量は桁（µs〜ms）である。

---

## 付録 A: テストスクリプト全文

（`…/scratchpad/three/audit_b/`。`SRC` は three@0.186.1 の展開先。`common.mjs` が三者共通。）

### common.mjs

```js
// Shared imports for audit_b tests. three@0.186.1 extracted at SRC.
export const SRC = '/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/three-0.186.1/package';
export const THREE = await import(SRC + '/build/three.module.js');
export const SkeletonUtils = await import(SRC + '/examples/jsm/utils/SkeletonUtils.js');

// Build a fish-like chain: N bones along +X, each 1 unit apart, mesh = box strip skinned to bones.
export function makeSkinnedChain(N = 6, vertsPerSeg = 4) {
  const { Bone, Skeleton, SkinnedMesh, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, MeshBasicMaterial } = THREE;
  const bones = [];
  let prev = null;
  for (let i = 0; i < N; i++) {
    const b = new Bone(); b.name = 'spine_' + i;
    b.position.x = i === 0 ? 0 : 1;
    if (prev) prev.add(b);
    bones.push(b); prev = b;
  }
  // vertices: for x = 0..N-1 two verts (y=+-0.2) -> strip
  const pos = [], idx = [], si = [], sw = [];
  for (let i = 0; i < N; i++) {
    for (const y of [-0.2, 0.2]) {
      pos.push(i, y, 0);
      si.push(i, Math.min(i + 1, N - 1), 0, 0);
      sw.push(1, 0, 0, 0);
    }
  }
  for (let i = 0; i < N - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  const mesh = new SkinnedMesh(g, new MeshBasicMaterial());
  mesh.add(bones[0]);
  const skel = new Skeleton(bones);
  mesh.bind(skel);
  return { mesh, skel, bones, geometry: g };
}
```

### run_all.sh

```sh
#!/bin/sh
# usage: cd audit_b && sh run_all.sh  (needs node>=18; three@0.186.1 extracted at SRC in common.mjs)
for t in t1_bonetexture t2_update_order t3_mixer_procedural t4_bounds t5_clone t7_webglobjects t8_skin_math t9_fade_warp t10_morph_wave t10d_instanced_noop t11_trackname t12_cpu_cost t13_group_move t14_shared_bone t15_wave_length_error t16_second_order t17_instanced_bounds t18_uncache t19_bone_chain_wave; do
  echo "================ $t.mjs"; node $t.mjs 2>&1
done
```

### evidence_greps.sh

```sh
#!/bin/sh
# Evidence greps. P = extracted three@0.186.1 package; TY = extracted @types/three@0.186.0
S=/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three
P=$S/three-0.186.1/package
TY=$S/types-three-0.186.0/three
cd $P
echo '$ grep -rn "maxBones\|MAX_BONES" src/renderers  (expect: no hits => no bone-count cap in renderer)'
grep -rn "maxBones\|MAX_BONES" src/renderers; echo "(exit=$?)"
echo; echo '$ grep -n "contextName = " src/renderers/WebGLRenderer.js'
grep -n "contextName = " src/renderers/WebGLRenderer.js
echo; echo '$ grep -c -i "morph|skin|skelet|bone" BatchedMesh.js InstancedMesh.js'
grep -c -i "morph\|skin\|skelet\|bone" src/objects/BatchedMesh.js src/objects/InstancedMesh.js
echo; echo '$ grep -n -i "skelet\|skin\|bone" src/objects/InstancedMesh.js  (expect: none)'
grep -n -i "skelet\|skin\|bone" src/objects/InstancedMesh.js; echo "(exit=$?)"
echo; echo '$ grep -n "skinning:\|IS_INSTANCEDMESH =\|IS_BATCHEDMESH =" src/renderers/webgl/WebGLPrograms.js'
grep -n "skinning:\|IS_INSTANCEDMESH =\|IS_BATCHEDMESH =" src/renderers/webgl/WebGLPrograms.js
echo; echo '$ grep -rn "isSkinnedMesh" src/renderers/WebGLRenderer.js src/renderers/webgl'
grep -rn "isSkinnedMesh" src/renderers/WebGLRenderer.js src/renderers/webgl
echo; echo '$ grep -n "skeleton.update\|info.render.frame\|projectObject( scene\|shadowMap.render(\|scene.updateMatrixWorld()" (renderer/objects)'
grep -n "skeleton.update" src/renderers/webgl/WebGLObjects.js
grep -n "info.render.frame ++\|projectObject( scene\|shadowMap.render(\|scene.updateMatrixWorld()" src/renderers/WebGLRenderer.js
echo; echo '$ grep -n "frustumCulled" src/renderers/WebGLRenderer.js src/renderers/webgl/WebGLShadowMap.js'
grep -n "frustumCulled" src/renderers/WebGLRenderer.js src/renderers/webgl/WebGLShadowMap.js
echo; echo '$ grep -n "Math.sqrt( this.bones.length\|Math.ceil( size / 4\|Math.max( size, 4" src/objects/Skeleton.js'
grep -n "Math.sqrt( this.bones.length\|Math.ceil( size / 4\|Math.max( size, 4" src/objects/Skeleton.js
echo; echo '$ grep -n "attribute vec4 skin" src/renderers/webgl/WebGLProgram.js'
grep -n "attribute vec4 skin" src/renderers/webgl/WebGLProgram.js
echo; echo '$ grep -n "const integer" src/renderers/webgl/WebGLBindingStates.js'
grep -n "const integer" src/renderers/webgl/WebGLBindingStates.js
echo; echo '$ grep -n "JOINTS_\|WEIGHTS_" examples/jsm/loaders/GLTFLoader.js | head'
grep -n "JOINTS_\|WEIGHTS_" examples/jsm/loaders/GLTFLoader.js | head
echo; echo '$ grep -n "deprecated" src/core/Clock.js | head -3'
grep -n "deprecated" src/core/Clock.js | head -3
echo; echo '$ types drift'
grep -n "frame: number\|useVertexTexture" $TY/src/objects/Skeleton.d.ts $TY/src/objects/SkinnedMesh.d.ts
grep -n "^	*frame\|useVertexTexture" src/objects/Skeleton.js src/objects/SkinnedMesh.js; echo "(source: exit=$? => no 'frame' member / no useVertexTexture param)"
echo; echo '$ sha1sum tarballs vs npm registry'
sha1sum $S/three-0.186.1.tgz $S/types-three-0.186.0.tgz
npm view three@0.186.1 dist.shasum 2>&1 | head -2
npm view @types/three@0.186.0 dist.shasum 2>&1 | head -2
```

### t1_bonetexture.mjs

```js
import { THREE } from './common.mjs';
const { Bone, Skeleton } = THREE;
console.log('# T1: boneTexture size vs bone count (Skeleton.computeBoneTexture, src/objects/Skeleton.js:243-267)');
console.log('N_bones  texSize  texels  capacityMatrices  bytes(RGBA32F)');
for (const N of [1, 2, 4, 5, 16, 17, 20, 24, 32, 36, 37, 64, 100, 128, 256, 1000, 1024]) {
  const bones = Array.from({ length: N }, () => new Bone());
  const sk = new Skeleton(bones);
  sk.computeBoneTexture();
  const s = sk.boneTexture.image.width;
  console.log(String(N).padStart(7), String(s + 'x' + sk.boneTexture.image.height).padStart(8), String(s * s).padStart(7), String(s * s / 4).padStart(10), String(s * s * 16).padStart(14),
    ' boneMatrices.length=', sk.boneMatrices.length, ' (N*16=', N * 16, ')');
}
// verify size%4==0 always so a mat4 (4 consecutive texels) never wraps a row
let ok = true;
for (let N = 1; N <= 5000; N++) { let size = Math.sqrt(N * 4); size = Math.ceil(size / 4) * 4; size = Math.max(size, 4); if (size % 4 !== 0 || size * size < N * 4) ok = false; }
console.log('size%4==0 and capacity>=N for N=1..5000:', ok);
// max N at 4096 / 16384 texture limit
for (const T of [2048, 4096, 8192, 16384]) console.log('MAX_TEXTURE_SIZE', T, '-> max bones (T*T/4) =', T * T / 4);
const dt = new Skeleton([new Bone()]).computeBoneTexture().boneTexture;
console.log('DataTexture defaults: format', dt.format, '(1023=RGBAFormat) type', dt.type, '(1015=FloatType) minFilter', dt.minFilter, '(1003=Nearest) magFilter', dt.magFilter, 'generateMipmaps', dt.generateMipmaps);
```

### t2_update_order.mjs

```js
import { THREE, makeSkinnedChain } from './common.mjs';
const { Matrix4, Vector3 } = THREE;
console.log('# T2: skeleton.update() reads bone.matrixWorld (Skeleton.js:208-217); stale unless updateMatrixWorld ran');
const { mesh, skel, bones } = makeSkinnedChain(4);
mesh.updateMatrixWorld(true);
skel.update();
const tail = () => Array.from(skel.boneMatrices.slice(3 * 16, 3 * 16 + 2)).map(v => +v.toFixed(4)); // [m00,m10] = cos,sin of net rotation of last bone
console.log('rest pose, last-bone [cos,sin] of last boneMatrix:', tail());
// A: modify bones, call skeleton.update() WITHOUT updateMatrixWorld
bones[0].rotation.z = Math.PI / 2;
skel.update();
console.log('A) rotated root, skeleton.update() only         ->', tail(), '(expected unchanged = stale)');
// B: updateMatrixWorld then update
mesh.updateMatrixWorld(true);
skel.update();
console.log('B) + mesh.updateMatrixWorld(true), update()     ->', tail());
// C: bone.matrixAutoUpdate=false hides rotation changes
bones[0].rotation.z = 0; mesh.updateMatrixWorld(true); skel.update();
bones[0].matrixAutoUpdate = false;
bones[0].rotation.z = 1.0; mesh.updateMatrixWorld(true); skel.update();
console.log('C) matrixAutoUpdate=false, rotation.z=1 ignored ->', tail(), '(expected = rest pose values)');
bones[0].matrixAutoUpdate = true;
// D: only-child-bone modified: does updateMatrixWorld() (no force) propagate? matrixAutoUpdate -> updateMatrix sets matrixWorldNeedsUpdate
bones[2].rotation.z = 0.5; mesh.updateMatrixWorld(); skel.update();
console.log('D) child bone changed, updateMatrixWorld() (no force) ->', tail());
// E: boneMatrices identity at bind pose
bones[0].rotation.z = 0; bones[2].rotation.z = 0; bones[0].matrixAutoUpdate = true; mesh.updateMatrixWorld(true); skel.update();
console.log('E) back to rest: boneMatrix[0] elements ~ identity?', Array.from(skel.boneMatrices.slice(0, 16)).map(v => +v.toFixed(3)).join(','));
```

### t3_mixer_procedural.mjs

```js
import { THREE, makeSkinnedChain } from './common.mjs';
const { AnimationMixer, AnimationClip, QuaternionKeyframeTrack, Quaternion, Euler, AnimationUtils, AdditiveAnimationBlendMode, LoopRepeat } = THREE;
const ang = q => +(2 * Math.atan2(q.z, q.w)).toFixed(4);
const qz = a => new Quaternion().setFromEuler(new Euler(0, 0, a));
const trackFor = (name, a0, a1, dur = 1) => new QuaternionKeyframeTrack(name + '.quaternion', [0, dur], [...qz(a0).toArray(), ...qz(a1).toArray()]);

function fresh(origAngle = 0.2) {
  const c = makeSkinnedChain(4);
  c.bones[1].quaternion.copy(qz(origAngle));   // "original state" = non-identity so restore is observable
  c.mesh.updateMatrixWorld(true);
  return c;
}

console.log('# T3a: mixer writes bone only when accumulated value CHANGED (PropertyMixer.apply, src/animation/PropertyMixer.js:198-247)');
{
  const { mesh, bones } = fresh(0);
  const clip = new AnimationClip('c', 1, [trackFor('spine_1', 0.0, 0.8)]);
  const mixer = new AnimationMixer(mesh);
  const act = mixer.clipAction(clip); act.play();
  mixer.update(0.5);   // time .5 -> 0.4
  console.log('t=0.5 angle', ang(bones[1].quaternion));
  act.paused = true;   // value now constant -> mixer must NOT rewrite
  // naive procedural composition: bone.q *= delta each frame AFTER mixer.update
  const delta = qz(0.1);
  const seen = [];
  for (let f = 0; f < 4; f++) { mixer.update(1 / 60); bones[1].quaternion.multiply(delta); seen.push(ang(bones[1].quaternion)); }
  console.log('naive "q *= delta" after mixer.update with paused clip, 4 frames:', seen.join(' -> '), ' (accumulates +0.1/frame = BUG)');
  // save/restore pattern
  const { mesh: m2, bones: b2 } = fresh(0);
  const mixer2 = new AnimationMixer(m2);
  const a2 = mixer2.clipAction(clip); a2.play(); mixer2.update(0.5); a2.paused = true;
  const saved = b2[1].quaternion.clone();
  const seen2 = [];
  for (let f = 0; f < 4; f++) {
    b2[1].quaternion.copy(saved);          // (1) restore mixer's last pose (undo previous procedural delta)
    mixer2.update(1 / 60);                 // (2) mixer writes only if changed
    saved.copy(b2[1].quaternion);          // (3) capture mixer output
    b2[1].quaternion.multiply(delta);      // (4) procedural layered on top
    seen2.push(ang(b2[1].quaternion));
  }
  console.log('restore -> mixer.update -> capture -> procedural, 4 frames  :', seen2.join(' -> '), ' (constant 0.5 = 0.4 + 0.1 OK)');
}

console.log('\n# T3b: weight<1 blends toward the ORIGINAL state saved at first activation (PropertyMixer.apply weight<1 branch; saveOriginalState)');
{
  const { mesh, bones } = fresh(0.2);
  const clip = new AnimationClip('c', 1, [trackFor('spine_1', 0.6, 0.6)]); // constant 0.6
  const mixer = new AnimationMixer(mesh);
  const act = mixer.clipAction(clip); act.play(); act.setEffectiveWeight(0.5);
  mixer.update(0.1);
  console.log('orig=0.2, clip=0.6, weight .5 -> angle', ang(bones[1].quaternion), '(expect ~0.4 = mid of orig and clip)');
  // procedurally change bone BEFORE the first play(): original captured at play()
  const f2 = fresh(0.2); f2.bones[1].quaternion.copy(qz(0.9));
  const m2 = new AnimationMixer(f2.mesh); const a2 = m2.clipAction(clip); a2.play(); a2.setEffectiveWeight(0.5); m2.update(0.1);
  console.log('bone set to 0.9 BEFORE play(): angle', ang(f2.bones[1].quaternion), '(expect ~0.75: original captured at play() time = 0.9)');
  // procedurally change bone AFTER play(): original is stale
  const f3 = fresh(0.2); const m3 = new AnimationMixer(f3.mesh); const a3 = m3.clipAction(clip); a3.play(); a3.setEffectiveWeight(0.5);
  f3.bones[1].quaternion.copy(qz(0.9)); m3.update(0.1);
  console.log('bone set to 0.9 AFTER play():  angle', ang(f3.bones[1].quaternion), '(expect ~0.4: procedural change ignored, uses saved original 0.2)');
}

console.log('\n# T3c: stop() restores original state; fadeOut-to-0 + enabled=false keeps action active (AnimationMixer._deactivateAction -> restoreOriginalState; AnimationAction._updateWeight)');
{
  const { mesh, bones } = fresh(0.2);
  const clip = new AnimationClip('c', 1, [trackFor('spine_1', 0.6, 0.6)]);
  const mixer = new AnimationMixer(mesh); const act = mixer.clipAction(clip); act.play(); mixer.update(0.1);
  console.log('playing: angle', ang(bones[1].quaternion));
  bones[1].quaternion.copy(qz(0.9));   // procedural tweak
  act.stop();
  console.log('after stop(): angle', ang(bones[1].quaternion), '(expect 0.2 = original, procedural 0.9 overwritten)');
  const f = fresh(0.2); const m = new AnimationMixer(f.mesh); const a = m.clipAction(clip); a.play(); a.fadeOut(0.2);
  m.update(0.1); m.update(0.15); m.update(0.05);
  console.log('fadeOut(0.2) after 0.3s: enabled', a.enabled, 'isScheduled', a.isScheduled(), 'angle', ang(f.bones[1].quaternion), '(back to original 0.2, action still scheduled/active)');
  f.bones[1].quaternion.copy(qz(0.9)); m.update(0.016);
  console.log('procedural 0.9 written; next mixer.update():', ang(f.bones[1].quaternion), '(accu unchanged -> mixer does not rewrite; 0.9 survives)');
}

console.log('\n# T3d: additive clip = original (pose at play()) * delta; local right-multiply (PropertyMixer._slerpAdditive)');
{
  const { mesh, bones } = fresh(0.2);
  const base = new AnimationClip('wave', 1, [trackFor('spine_1', 0.0, 0.3)]);
  AnimationUtils.makeClipAdditive(base, 0, base, 30);   // reference frame 0 => delta = q(t) * conj(q(0))
  console.log('makeClipAdditive: blendMode', base.blendMode, '(2501=Additive)', ' first key', ang({ z: base.tracks[0].values[2], w: base.tracks[0].values[3] }), ' last key', ang({ z: base.tracks[0].values[6], w: base.tracks[0].values[7] }));
  const mixer = new AnimationMixer(mesh); const act = mixer.clipAction(base); act.play(); act.setEffectiveWeight(1.0);
  mixer.update(0.5);
  console.log('additive only at t=.5, original=0.2: angle', ang(bones[1].quaternion), '(expect 0.2+0.15=0.35)');
  act.setEffectiveWeight(0.5); mixer.update(0.0001);
  console.log('additive weight .5 (t~.5):', ang(bones[1].quaternion), '(expect 0.2+0.075=0.275)');
}

console.log('\n# T3e: normal actions with total weight>1 are normalised; <1 falls back to original');
{
  const { mesh, bones } = fresh(0.0);
  const c1 = new AnimationClip('a', 1, [trackFor('spine_1', 0.2, 0.2)]);
  const c2 = new AnimationClip('b', 1, [trackFor('spine_1', 0.8, 0.8)]);
  const mixer = new AnimationMixer(mesh);
  const a1 = mixer.clipAction(c1).play(); const a2 = mixer.clipAction(c2).play();
  a1.setEffectiveWeight(1); a2.setEffectiveWeight(1); mixer.update(0.1);
  console.log('w=1,1 ->', ang(bones[1].quaternion), '(expect 0.5)');
  a1.setEffectiveWeight(2); a2.setEffectiveWeight(1); mixer.update(0.1);
  console.log('w=2,1 ->', ang(bones[1].quaternion), '(expect 0.4 = (2*.2+.8)/3)');
  a1.setEffectiveWeight(0.25); a2.setEffectiveWeight(0.25); mixer.update(0.1);
  console.log('w=.25,.25 ->', ang(bones[1].quaternion), '(expect .25*.2+.25*.8+.5*0 = 0.25)');
}
```

### t4_bounds.mjs

```js
import { THREE, makeSkinnedChain } from './common.mjs';
const { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, SkinnedMesh, MeshBasicMaterial, Skeleton, Bone } = THREE;

console.log('# T4a: SkinnedMesh.boundingSphere is computed ONCE lazily (Frustum.intersectsObject, src/math/Frustum.js:146-152) and then cached; moving bones (not the mesh) leaves it stale');
const { mesh, skel, bones } = makeSkinnedChain(6);
mesh.updateMatrixWorld(true);
console.log('initial boundingSphere:', mesh.boundingSphere, '(null until first culling test)');
const cam = new PerspectiveCamera(50, 1, 0.1, 100);
cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
console.log('visible at start?', frustum.intersectsObject(mesh));
const s0 = mesh.boundingSphere.clone();
console.log('cached sphere center/radius:', s0.center.toArray().map(v => +v.toFixed(3)), +s0.radius.toFixed(3));
// swim far away by moving ONLY the root bone (mesh.matrixWorld unchanged)
bones[0].position.set(0, 500, 0);
mesh.updateMatrixWorld(true); skel.update();
const v = new Vector3(); mesh.getVertexPosition(0, v);
console.log('vertex 0 actual local pos after bone move:', v.toArray().map(x => +x.toFixed(2)));
console.log('visible after moving bone 500 units up? (should be false, true body is off-screen):', frustum.intersectsObject(mesh), ' <- stale cache says visible');
// now move the camera to look at the *real* body location; the culled one flips
cam.position.set(0, 500, 10); cam.lookAt(0, 500, 0); cam.updateMatrixWorld(true);
const fr2 = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
console.log('camera looking at real body (0,500,0): visible =', fr2.intersectsObject(mesh), ' <- stale cache says CULLED => fish invisible (bug)');
mesh.computeBoundingSphere();
console.log('after computeBoundingSphere(): visible =', fr2.intersectsObject(mesh), ' sphere center', mesh.boundingSphere.center.toArray().map(x => +x.toFixed(1)));

console.log('\n# T4b: AttachedBindMode: moving the mesh object itself is cancelled by bindMatrixInverse (SkinnedMesh.updateMatrixWorld, lines 290-308)');
{
  const c = makeSkinnedChain(3);
  c.mesh.updateMatrixWorld(true);
  const a = new Vector3(); c.mesh.getVertexPosition(0, a);
  c.mesh.position.set(100, 0, 0);               // move the SkinnedMesh object, bones are children => they move too
  c.mesh.updateMatrixWorld(true);
  const b = new Vector3(); c.mesh.getVertexPosition(0, b);
  console.log('bones are children of mesh: vertex0 local before', a.toArray(), 'after mesh.position.x=100:', b.toArray(), '(local pos unchanged -> sphere stays valid)');
  // now bones NOT children of the mesh (sibling skeleton root)
  const d = makeSkinnedChain(3);
  d.mesh.remove(d.bones[0]);
  const root = new THREE.Group(); root.add(d.mesh); root.add(d.bones[0]);
  root.updateMatrixWorld(true);
  d.mesh.bind(d.skel);   // rebind => bindMatrix = mesh.matrixWorld, boneInverses recomputed
  root.updateMatrixWorld(true);
  d.bones[0].position.set(0, 7, 0); root.updateMatrixWorld(true);
  const e = new Vector3(); d.mesh.getVertexPosition(0, e);
  console.log('bones as sibling of mesh, bone moved +7y: vertex0 local =', e.toArray().map(x => +x.toFixed(2)), '(local coordinates follow the bone; mesh.matrixWorld unchanged)');
}

console.log('\n# T4c: cost of SkinnedMesh.computeBoundingSphere/Box (per vertex: up to 4 matrix multiplies, src/objects/SkinnedMesh.js:213-221,319-366)');
function bigSkinned(nv, nb) {
  const bones = []; let prev = null;
  for (let i = 0; i < nb; i++) { const b = new Bone(); b.position.x = i ? 0.1 : 0; if (prev) prev.add(b); bones.push(b); prev = b; }
  const pos = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) { pos[i * 3] = (i / nv) * nb * 0.1; pos[i * 3 + 1] = Math.sin(i) * 0.05; si[i * 4] = Math.floor(i / nv * (nb - 1)); si[i * 4 + 1] = si[i * 4] + 1; sw[i * 4] = 0.5; sw[i * 4 + 1] = 0.5; }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
  const m = new SkinnedMesh(g, new MeshBasicMaterial()); m.add(bones[0]); m.bind(new Skeleton(bones)); m.updateMatrixWorld(true); return m;
}
for (const nv of [5000, 20000, 100000]) {
  const m = bigSkinned(nv, 20);
  m.computeBoundingSphere(); // warm
  const N = 5; const t0 = performance.now();
  for (let i = 0; i < N; i++) m.computeBoundingSphere();
  const t1 = performance.now();
  for (let i = 0; i < N; i++) m.computeBoundingBox();
  const t2 = performance.now();
  console.log(`verts=${nv}: computeBoundingSphere ${(t1 - t0) / N | 0}.${Math.round(((t1 - t0) / N % 1) * 10)} ms, computeBoundingBox ${((t2 - t1) / N).toFixed(1)} ms per call (Node ${process.version}, JIT warm)`);
}
```

### t5_clone.mjs

```js
import { THREE, SkeletonUtils, makeSkinnedChain } from './common.mjs';
const { Group, AnimationMixer, AnimationClip, QuaternionKeyframeTrack, Quaternion, Euler, Matrix4 } = THREE;
const ang = q => +(2 * Math.atan2(q.z, q.w)).toFixed(4);
const qz = a => new Quaternion().setFromEuler(new Euler(0, 0, a));

console.log('# T5a: plain Object3D.clone() of a SkinnedMesh (SkinnedMesh.copy, src/objects/SkinnedMesh.js:161-176 : this.skeleton = source.skeleton)');
const { mesh, skel, bones } = makeSkinnedChain(5);
const root = new Group(); root.add(mesh);
root.updateMatrixWorld(true);
const naive = root.clone();
const nMesh = naive.children[0];
console.log('clone.skeleton === source.skeleton :', nMesh.skeleton === skel, ' (SHARED skeleton)');
console.log('clone bones[0] === source bones[0] :', nMesh.children[0] === bones[0], '(children cloned: different Bone objects)  clone.skeleton.bones[0] is a source bone:', nMesh.skeleton.bones[0] === bones[0]);

console.log('\n# T5b: SkeletonUtils.clone (examples/jsm/utils/SkeletonUtils.js:392-431)');
const c1 = SkeletonUtils.clone(root), c2 = SkeletonUtils.clone(root);
const m1 = c1.children[0], m2 = c2.children[0];
console.log('geometry shared with source        :', m1.geometry === mesh.geometry, m2.geometry === mesh.geometry);
console.log('material shared with source        :', m1.material === mesh.material);
console.log('skeleton distinct per clone        :', m1.skeleton !== skel, m1.skeleton !== m2.skeleton);
console.log('boneInverses array shared (same ref):', m1.skeleton.boneInverses === skel.boneInverses, m2.skeleton.boneInverses === skel.boneInverses);
console.log('clone skeleton bones are clone\'s own children :', m1.skeleton.bones[0] === m1.children[0], ' not source bones:', m1.skeleton.bones[0] !== bones[0]);
console.log('boneMatrices distinct Float32Array :', m1.skeleton.boneMatrices !== skel.boneMatrices);
console.log('boneTexture (not yet computed) null:', m1.skeleton.boneTexture === null, ' -> each clone allocates its own DataTexture on first render (WebGLRenderer.js:2696)');
// boundingSphere copied if already computed
mesh.computeBoundingSphere();
const c3 = SkeletonUtils.clone(root);
console.log('boundingSphere cloned when source had one:', c3.children[0].boundingSphere !== null && c3.children[0].boundingSphere !== mesh.boundingSphere);
console.log('morphTargetInfluences array copied (not shared):', 'n/a here (no morphs) -> Mesh.copy uses .slice() (Mesh.js:116)');

console.log('\n# T5c: independent poses & independent mixers');
const mix1 = new AnimationMixer(c1), mix2 = new AnimationMixer(c2);
const clip = new AnimationClip('c', 1, [new QuaternionKeyframeTrack('spine_1.quaternion', [0, 1], [...qz(0).toArray(), ...qz(0.8).toArray()])]);
mix1.clipAction(clip).play(); mix2.clipAction(clip).play();
mix1.update(0.25); mix2.update(0.75);
c1.updateMatrixWorld(true); c2.updateMatrixWorld(true);
console.log('clip shared, clone1 bone angle', ang(m1.skeleton.bones[1].quaternion), 'clone2', ang(m2.skeleton.bones[1].quaternion), 'source (untouched)', ang(bones[1].quaternion));
m1.skeleton.update(); m2.skeleton.update();
console.log('boneMatrices differ:', m1.skeleton.boneMatrices[16] !== m2.skeleton.boneMatrices[16], '  source skeleton.boneMatrices never updated (all zeros):', skel.boneMatrices[16]);

console.log('\n# T5d: Skeleton.clone() (Skeleton.js:232-236) does NOT clone bones');
const sk2 = skel.clone();
console.log('sk2.bones[0] === skel.bones[0]:', sk2.bones[0] === skel.bones[0], '; boneInverses same array:', sk2.boneInverses === skel.boneInverses, '; bones array copied:', sk2.bones !== skel.bones);

console.log('\n# T5e: one AnimationMixer, many roots via clipAction(clip, root) -> independent action time per root');
const A = SkeletonUtils.clone(root), B = SkeletonUtils.clone(root);
const big = new Group(); big.add(A, B);
const mixer = new AnimationMixer(big);
const aA = mixer.clipAction(clip, A), aB = mixer.clipAction(clip, B);
aA.play(); aB.play(); aB.time = 0.5;
mixer.update(0.25);
console.log('single mixer: A angle', ang(A.children[0].skeleton.bones[1].quaternion), ' B angle', ang(B.children[0].skeleton.bones[1].quaternion), '(expect 0.2 and 0.6)');
console.log('mixer.stats bindings total/inUse:', mixer.stats.bindings.total, mixer.stats.bindings.inUse, ' actions total/inUse:', mixer.stats.actions.total, mixer.stats.actions.inUse);
```

### t7_webglobjects.mjs

```js
import { THREE, SRC, makeSkinnedChain } from './common.mjs';
const { WebGLObjects } = await import(SRC + '/src/renderers/webgl/WebGLObjects.js');
console.log('# T7: WebGLObjects.update() (src/renderers/webgl/WebGLObjects.js:46-56): skeleton.update() runs at most once per info.render.frame');
console.log('# Emulated order inside WebGLRenderer.render(): projectObject->objects.update [WebGLRenderer.js:1901/1916] ; info.render.frame++ [:1729] ; shadowMap.render->objects.update [WebGLShadowMap.js:530] ; draw');
function scenario(title, plan) {
  const { mesh, skel } = makeSkinnedChain(4);
  const log = [];
  let cur = null;
  const orig = skel.update.bind(skel); skel.update = () => { cur.push('update'); return orig(); };
  const info = { render: { frame: 0 } };
  const objects = WebGLObjects({}, { get: (o, g) => g, update() {} }, { update() {}, remove() {} }, { releaseStatesOfObject() {} }, info);
  plan.forEach((shadowPass, i) => {
    cur = []; log.push(cur);
    cur.push('frame=' + info.render.frame);
    objects.update(mesh);                       // projectObject
    cur.push('[proj]');
    info.render.frame++;
    if (shadowPass) { cur.push('[shadow]'); objects.update(mesh); }
  });
  console.log(title);
  log.forEach((l, i) => console.log('  render#' + (i + 1) + ': ' + l.join(' ')));
}
scenario('A) no shadow casters:', [false, false, false]);
scenario('B) shadow pass every render (castShadow=true, autoUpdate):', [true, true, true, true]);
scenario('C) shadow pass only on render#2 (shadowMap.autoUpdate=false + needsUpdate once):', [false, true, false, false]);
```

### t8_skin_math.mjs

```js
import { THREE, makeSkinnedChain } from './common.mjs';
const { Vector3, Vector4, Matrix4, DetachedBindMode, AttachedBindMode, Group, Uint8BufferAttribute, Uint16BufferAttribute, Float32BufferAttribute } = THREE;
const f = v => v.toArray().map(x => +x.toFixed(4));

console.log('# T8a: GPU formula (skinning_vertex.glsl.js) re-implemented on CPU == SkinnedMesh.applyBoneTransform (SkinnedMesh.js:319-366)');
{
  const { mesh, skel, bones, geometry } = makeSkinnedChain(5);
  // two-bone blend for vertex 6 (x=3): 70% bone3 + 30% bone4
  geometry.attributes.skinIndex.setXYZW(6, 3, 4, 0, 0); geometry.attributes.skinWeight.setXYZW(6, 0.7, 0.3, 0, 0);
  bones[3].rotation.z = 0.5; bones[4].rotation.z = -0.4; mesh.position.set(2, 3, 0); mesh.rotation.y = 0.3;
  mesh.updateMatrixWorld(true); skel.update();
  const p = new Vector3().fromBufferAttribute(geometry.attributes.position, 6);
  // shader: transformed = bindMatrixInverse * sum_i( w_i * boneMat_i * (bindMatrix * v) ), boneMat = skeleton.boneMatrices
  const idx = [3, 4, 0, 0], w = [0.7, 0.3, 0, 0];
  const skinVertex = new Vector4(p.x, p.y, p.z, 1).applyMatrix4(mesh.bindMatrix);
  const acc = new Vector4();
  for (let i = 0; i < 4; i++) { const m = new Matrix4().fromArray(skel.boneMatrices, idx[i] * 16); acc.addScaledVector(skinVertex.clone().applyMatrix4(m), w[i]); }
  const gpu = new Vector3(acc.x, acc.y, acc.z).applyMatrix4(mesh.bindMatrixInverse);
  const cpu = mesh.applyBoneTransform(6, new Vector3().fromBufferAttribute(geometry.attributes.position, 6));
  console.log('GPU-formula:', f(gpu), ' applyBoneTransform:', f(cpu), ' getVertexPosition:', f(mesh.getVertexPosition(6, new Vector3())));
  console.log('Vector4 variant w preserved:', mesh.applyBoneTransform(6, new Vector4(p.x, p.y, p.z, 0)).toArray().map(x => +x.toFixed(3)), '(w=0 -> direction transform)');
  // un-normalised weights scale the geometry: no normalisation in shader
  geometry.attributes.skinWeight.setXYZW(6, 1.4, 0.6, 0, 0); // sum 2
  const doubled = mesh.getVertexPosition(6, new Vector3());
  console.log('weights sum=2 (unnormalised): vertex ->', f(doubled), '(≈ 2x offset from bone origin => stretched; shader has no renormalise)');
  mesh.normalizeSkinWeights();
  console.log('after mesh.normalizeSkinWeights():', Array.from(geometry.attributes.skinWeight.array.slice(24, 28)).map(x => +x.toFixed(3)), '->', f(mesh.getVertexPosition(6, new Vector3())));
}

console.log('\n# T8b: bindMode Attached vs Detached (SkinnedMesh.js:290-308; constants.js:491,500)');
{
  for (const mode of [AttachedBindMode, DetachedBindMode]) {
    const { mesh, skel, bones } = makeSkinnedChain(3);
    const root = new Group(); root.add(mesh); root.updateMatrixWorld(true);
    mesh.bindMode = mode;
    mesh.updateMatrixWorld(true); skel.update();
    // world position of vertex 4 (x=2) before / after translating ONLY the mesh object
    const world = () => { const v = mesh.getVertexPosition(4, new Vector3()); return v.applyMatrix4(mesh.matrixWorld); };
    const w0 = world();
    mesh.position.set(10, 0, 0); mesh.updateMatrixWorld(true); skel.update();
    // bones are CHILDREN of mesh in this helper => they move too; so also check with mesh shifted AND bones counter-shifted
    const w1 = world();
    console.log(mode.padEnd(9), 'world pos before', f(w0), ' after moving mesh.position.x+=10 (bones are mesh children):', f(w1));
  }
  // Skeleton shared by two skinned meshes, bones NOT children of either: detached mode lets each mesh sit elsewhere
  const A = makeSkinnedChain(3); const B = makeSkinnedChain(3);
  A.mesh.remove(A.bones[0]); const scene = new Group(); scene.add(A.mesh); scene.add(A.bones[0]);
  scene.updateMatrixWorld(true);
  A.mesh.bind(A.skel);               // bindMatrix = A.mesh.matrixWorld (identity)
  const meshB = new THREE.SkinnedMesh(A.geometry, A.mesh.material);
  meshB.position.set(0, 0, 5); scene.add(meshB); scene.updateMatrixWorld(true);
  meshB.bindMode = DetachedBindMode;
  meshB.bind(A.skel, A.mesh.matrixWorld);   // share skeleton; bindMatrix = A's world matrix (identity)
  A.bones[1].rotation.z = 0.6; scene.updateMatrixWorld(true); A.skel.update();
  const wa = A.mesh.getVertexPosition(4, new Vector3()).applyMatrix4(A.mesh.matrixWorld);
  const wb = meshB.getVertexPosition(4, new Vector3()).applyMatrix4(meshB.matrixWorld);
  console.log('shared skeleton, mesh A (attached) world', f(wa), ' mesh B (detached, offset z+5) world', f(wb), ' (B = A shifted by its own matrixWorld)');
}
console.log('\n# T8c: attribute typing: Uint8/Uint16/Float32 skinIndex all ok on CPU; GL: integer path only for INT/UNSIGNED_INT or gpuType IntType (WebGLBindingStates.js:357) -> vertexAttribIPointer, but GLSL declares vec4 (WebGLProgram.js:665)');
{
  const { geometry, mesh } = makeSkinnedChain(3);
  for (const [name, Ctor] of [['Uint8', Uint8BufferAttribute], ['Uint16', Uint16BufferAttribute], ['Float32', Float32BufferAttribute]]) {
    const a = new Ctor(Array.from(geometry.attributes.skinIndex.array), 4);
    geometry.setAttribute('skinIndex', a);
    const v = mesh.getVertexPosition(2, new Vector3());
    console.log(name.padEnd(8), 'array', a.array.constructor.name.padEnd(13), 'gl type?', 'n/a in node', ' CPU skinning ok', f(v));
  }
  const u32 = new THREE.Uint32BufferAttribute(Array.from(geometry.attributes.skinIndex.array), 4);
  console.log('Uint32 attribute: gpuType =', u32.gpuType, '(1015=Float) ; GL type will be UNSIGNED_INT -> `integer` branch (WebGLBindingStates.js:357) -> vertexAttribIPointer => mismatch with `attribute vec4 skinIndex` (UNVERIFIED on GPU)');
}
```

### t9_fade_warp.mjs

```js
import { THREE, makeSkinnedChain } from './common.mjs';
const { AnimationMixer, AnimationClip, QuaternionKeyframeTrack, NumberKeyframeTrack, Quaternion, Euler, LoopOnce, LoopPingPong } = THREE;
const qz = a => new Quaternion().setFromEuler(new Euler(0, 0, a));
const ang = q => +(2 * Math.atan2(q.z, q.w)).toFixed(3);
const clipConst = (name, a, dur) => new AnimationClip(name, dur, [new QuaternionKeyframeTrack('spine_1.quaternion', [0, dur], [...qz(a).toArray(), ...qz(a).toArray()])]);
const ramp = (name, dur) => new AnimationClip(name, dur, [new QuaternionKeyframeTrack('spine_1.quaternion', [0, dur], [...qz(0).toArray(), ...qz(1).toArray()])]);

console.log('# T9a: crossFadeFrom/To semantics (AnimationAction.js:334-372) — weights over a 1.0s fade, t = mixer time');
{
  const { mesh, bones } = makeSkinnedChain(3);
  const mixer = new AnimationMixer(mesh);
  const A = mixer.clipAction(clipConst('A', 0.2, 2)), B = mixer.clipAction(clipConst('B', 0.8, 2));
  A.play(); mixer.update(0.0001);
  B.reset().play(); A.crossFadeTo(B, 1.0, false);      // == B.crossFadeFrom(A, 1.0, false)
  const rows = [];
  for (let i = 0; i < 6; i++) { mixer.update(i === 0 ? 0.0001 : 0.2); rows.push(`t=${mixer.time.toFixed(2)} wA=${A.getEffectiveWeight().toFixed(2)} wB=${B.getEffectiveWeight().toFixed(2)} angle=${ang(bones[1].quaternion)}`); }
  console.log(rows.join('\n'));
  console.log('after fade: A.enabled=', A.enabled, ' A.isScheduled()=', A.isScheduled(), ' B.enabled=', B.enabled, '  mixer.stats.actions inUse=', mixer.stats.actions.inUse);
  // reuse A without reset(): remains disabled
  A.play(); mixer.update(0.1);
  console.log('A.play() again WITHOUT reset(): A.enabled =', A.enabled, ' weight', A.getEffectiveWeight(), '(stays disabled -> call A.reset().play())');
  A.reset().play(); A.setEffectiveWeight(1); mixer.update(0.1);
  console.log('A.reset().play(): A.enabled =', A.enabled, ' weight', A.getEffectiveWeight());
}

console.log('\n# T9b: crossFade does NOT call play() on the incoming action');
{
  const { mesh, bones } = makeSkinnedChain(3);
  const mixer = new AnimationMixer(mesh);
  const A = mixer.clipAction(clipConst('A', 0.2, 2)), B = mixer.clipAction(clipConst('B', 0.8, 2));
  A.play(); mixer.update(0.01);
  B.crossFadeFrom(A, 1.0, false);   // B never played
  mixer.update(0.5);
  console.log('B.isScheduled() =', B.isScheduled(), ' B eff weight', B.getEffectiveWeight(), ' A eff weight', A.getEffectiveWeight(), ' angle', ang(bones[1].quaternion), '(B never contributes; A fades to 0 -> bone drifts to ORIGINAL pose)');
}

console.log('\n# T9c: warp=true crossfade of clips with different duration (crossFadeFrom lines with startEndRatio/endStartRatio)');
{
  const { mesh } = makeSkinnedChain(3);
  const mixer = new AnimationMixer(mesh);
  const slow = mixer.clipAction(clipConst('slow', 0.2, 2)), fast = mixer.clipAction(clipConst('fast', 0.8, 1));
  slow.play(); mixer.update(0.0001); fast.reset().play();
  fast.crossFadeFrom(slow, 1.0, true);
  const rows = [];
  for (let i = 0; i < 6; i++) { mixer.update(i === 0 ? 0.0001 : 0.2); rows.push(`t=${mixer.time.toFixed(2)} slow.effTimeScale=${slow.getEffectiveTimeScale().toFixed(3)} fast.effTimeScale=${fast.getEffectiveTimeScale().toFixed(3)}`); }
  console.log(rows.join('\n'));
  console.log('(slow warps 1.0 -> fadeOutDuration/fadeInDuration = 2.0, fast warps 0.5 -> 1.0; at the end of the fade both timeScale values are restored to the pre-fade ones, here 1.0)');
}

console.log('\n# T9d: setDuration / timeScale / halt / warp');
{
  const { mesh } = makeSkinnedChain(3);
  const mixer = new AnimationMixer(mesh);
  const a = mixer.clipAction(ramp('r', 2)); a.play();
  a.setDuration(1); console.log('clip.duration=2, setDuration(1) -> timeScale', a.timeScale);
  a.setEffectiveTimeScale(2); console.log('setEffectiveTimeScale(2) -> timeScale', a.timeScale, 'effective', a.getEffectiveTimeScale());
  mixer.update(0.1); console.log('after 0.1 s mixer time: action.time =', a.time.toFixed(3), '(=0.1*2)');
  a.warp(2, 0.5, 1.0); mixer.update(0.5); console.log('warp(2->0.5 over 1s) at +0.5s: effTimeScale', a.getEffectiveTimeScale().toFixed(3), '(expect 1.25 = lerp)');
  mixer.update(0.6); console.log('warp finished: timeScale', a.timeScale, ' effective', a.getEffectiveTimeScale());
  const b = mixer.clipAction(ramp('r2', 2)); b.play(); b.halt(0.5); mixer.update(0.3); mixer.update(0.3);
  console.log('halt(0.5) done: paused =', b.paused, ' timeScale', b.timeScale);
  mixer.timeScale = 0; const before = a.time; mixer.update(1); console.log('mixer.timeScale=0 pauses all: action.time unchanged', before === a.time);
  mixer.timeScale = 1;
  console.log('per-action phase offset via action.time =', (a.time = 0.7), ' (public field, AnimationAction.js:84); also startAt(mixer.time+x) for delayed start');
}

console.log('\n# T9e: morph influences via named track, resolved through morphTargetDictionary (PropertyBinding.js:655-690) & CreateFromMorphTargetSequence');
{
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.array.length).fill(0.1), 3), new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.array.length).fill(-0.1), 3)];
  g.morphAttributes.position[0].name = 'open'; g.morphAttributes.position[1].name = 'close';
  g.morphTargetsRelative = true;
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  console.log('Mesh auto-populates dictionary:', JSON.stringify(m.morphTargetDictionary), 'influences', m.morphTargetInfluences);
  const clip = new AnimationClip('mouth', 1, [new NumberKeyframeTrack('.morphTargetInfluences[open]', [0, 0.5, 1], [0, 1, 0])]);
  const mixer = new AnimationMixer(m); mixer.clipAction(clip).play(); mixer.update(0.5);
  console.log('track ".morphTargetInfluences[open]" at t=.5 ->', m.morphTargetInfluences);
  // sets dictionary only at construction: late-added morphAttributes require updateMorphTargets()
  const g2 = new THREE.BoxGeometry(1, 1, 1); const m2 = new THREE.Mesh(g2, new THREE.MeshBasicMaterial());
  g2.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(g2.attributes.position.array.length), 3)];
  console.log('morphs added AFTER Mesh creation: influences =', m2.morphTargetInfluences, '-> call mesh.updateMorphTargets():', (m2.updateMorphTargets(), m2.morphTargetInfluences));
}
```

### t10_morph_wave.mjs

```js
import { THREE } from './common.mjs';
const { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, InstancedMesh, Vector3, Matrix4 } = THREE;

console.log('# T10a: traveling wave y(x,t)=A(x) sin(kx - wt) as 2 RELATIVE morph targets  S=A sin(kx), C=A cos(kx) with weights (cos wt, -sin wt)');
const NSEG = 200, L = 1.0, lambda = 0.9, k = 2 * Math.PI / lambda;
const A = x => 0.02 + (-0.0825 * x + 0.1625 * x * x) * 1.0;      // r08 envelope A(x)/L (docs/yamame/research/r08_swim_steady.md §1: 0.02-0.0825x+0.1625x^2); NOTE amplitude definition unverified there
const pos = [], S = [], C = [];
for (let i = 0; i <= NSEG; i++) { const x = i / NSEG * L; pos.push(x, 0, 0); S.push(0, A(x) * Math.sin(k * x), 0); C.push(0, A(x) * Math.cos(k * x), 0); }
const g = new BufferGeometry();
g.setAttribute('position', new Float32BufferAttribute(pos, 3));
g.morphAttributes.position = [new Float32BufferAttribute(S, 3), new Float32BufferAttribute(C, 3)];
g.morphTargetsRelative = true;
const mesh = new Mesh(g, new MeshStandardMaterial());
let maxErr = 0;
for (const wt of [0, 0.7, 1.9, 3.3, 5.5]) {
  mesh.morphTargetInfluences[0] = Math.cos(wt); mesh.morphTargetInfluences[1] = -Math.sin(wt);
  for (let i = 0; i <= NSEG; i += 10) { const x = i / NSEG * L; const v = mesh.getVertexPosition(i, new Vector3()); maxErr = Math.max(maxErr, Math.abs(v.y - A(x) * Math.sin(k * x - wt))); }
}
console.log('max |CPU morph result - analytic wave| over 5 phases x 21 samples =', maxErr.toExponential(2));

console.log('\n# T10b: InstancedMesh.setMorphAt / morphTexture layout (InstancedMesh.js:355-385) and base influence for relative vs absolute morphs');
{
  const N = 1000;
  const im = new InstancedMesh(g, new MeshStandardMaterial(), N);
  const proxy = new Mesh(g, new MeshStandardMaterial());      // supplies morphTargetInfluences
  proxy.morphTargetInfluences[0] = 0.3; proxy.morphTargetInfluences[1] = -0.4;
  im.setMorphAt(0, proxy);
  const tex = im.morphTexture;
  console.log('morphTexture size', tex.image.width, 'x', tex.image.height, ' format', tex.format, '(1028=RedFormat) type', tex.type, '(1015=Float)  floats/instance =', tex.image.width);
  console.log('row 0 =', Array.from(tex.image.data.slice(0, 3)).map(x => +x.toFixed(3)), '[base, w0, w1]  (relative => base = 1)');
  g.morphTargetsRelative = false; im.setMorphAt(1, proxy);
  console.log('row 1 (morphTargetsRelative=false) =', Array.from(tex.image.data.slice(3, 6)).map(x => +x.toFixed(3)), '[1 - sum(w) = 1.1, ...] => must use relative morphs');
  g.morphTargetsRelative = true;
  // CPU cost of rewriting all rows per frame directly in the typed array
  const data = tex.image.data; const phases = new Float32Array(N).map((_, i) => i * 0.37);
  const T = 2000; const t0 = performance.now();
  for (let it = 0; it < T; it++) { for (let i = 0; i < N; i++) { const p = phases[i] + it * 0.1; const o = i * 3; data[o] = 1; data[o + 1] = Math.cos(p); data[o + 2] = -Math.sin(p); } }
  console.log(`direct typed-array rewrite of ${N} instances: ${((performance.now() - t0) / T * 1000).toFixed(1)} us/frame; texture bytes uploaded per frame when needsUpdate=true = ${N * 3 * 4} B (RedFormat/Float32 -> N x 3 texels)`);
}

console.log('\n# T10c: morph texture memory (WebGLMorphtargets.js:27-45): width=verts*stride(1 pos,2 +normal,3 +color) texels, split into rows at maxTextureSize; layers = #targets; built ONCE per geometry');
for (const [verts, tg, stride] of [[5000, 2, 1], [5000, 2, 2], [20000, 2, 2], [20000, 4, 2], [100000, 2, 2]]) console.log(`verts=${verts} targets=${tg} stride=${stride}: ${(verts * stride * 16 * tg / 1048576).toFixed(2)} MiB (RGBA32F)`);
```

### t10d_instanced_noop.mjs

```js
import { THREE } from './common.mjs';
const g = new THREE.BoxGeometry(1, 1, 1);
g.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.array.length), 3)];
const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial(), 10);
console.log('InstancedMesh.morphTargetInfluences =', im.morphTargetInfluences, '(Mesh ctor calls this.updateMorphTargets(), which InstancedMesh overrides as a no-op: InstancedMesh.js:388) ; morphTexture =', im.morphTexture);
console.log('=> WebGLMorphtargets.update (src/renderers/webgl/WebGLMorphtargets.js:132-141) would hit objectInfluences.length on undefined if morphTexture is still null at first render');
```

### t11_trackname.mjs

```js
import { THREE, makeSkinnedChain } from './common.mjs';
const { PropertyBinding, AnimationMixer, AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack, Quaternion, Euler } = THREE;
const qz = a => new Quaternion().setFromEuler(new Euler(0, 0, a));
console.log('# T11a: parseTrackName (PropertyBinding.js:209-262)');
for (const n of ['spine_1.quaternion', 'Bone.001.position', '.bones[spine_2].quaternion', 'fin L.scale', 'Armature/spine_1.quaternion', 'mesh.morphTargetInfluences[open]', 'a:b.position']) {
  try { const r = PropertyBinding.parseTrackName(n); console.log(n.padEnd(36), JSON.stringify(r)); } catch (e) { console.log(n.padEnd(36), 'THROWS', e.message); }
}
console.log('sanitizeNodeName("fin L.001:x") ->', PropertyBinding.sanitizeNodeName('fin L.001:x'));

console.log('\n# T11b: binding variants resolve & animate');
const { mesh, bones } = makeSkinnedChain(4);
for (const [label, name, root] of [['bone by name, root=mesh', 'spine_2.quaternion', mesh], ['.bones[name], root=mesh', '.bones[spine_2].quaternion', mesh]]) {
  const m = new AnimationMixer(root);
  const c = new AnimationClip('t', 1, [new QuaternionKeyframeTrack(name, [0, 1], [...qz(0).toArray(), ...qz(0.5).toArray()])]);
  bones[2].quaternion.identity();
  m.clipAction(c).play(); m.update(0.5);
  console.log(label.padEnd(28), 'bone angle after 0.5s (expect 0.25; note LoopRepeat wraps t=duration to 0) =', +(2 * Math.atan2(bones[2].quaternion.z, bones[2].quaternion.w)).toFixed(3));
}
// missing node
const warn = console.warn; let msgs = []; console.warn = (...a) => msgs.push(a.join(' ')); const err = console.error; console.error = (...a) => msgs.push(a.join(' '));
const m = new AnimationMixer(mesh); const c = new AnimationClip('t', 1, [new QuaternionKeyframeTrack('nope.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
m.clipAction(c).play(); m.update(0.1);
console.warn = warn; console.error = err;
console.log('unknown bone name: no throw; messages =', JSON.stringify(msgs.slice(0, 2)));
console.log('mixer root = mesh with several same-named bones: findNode returns first via skeleton.getBoneByName (PropertyBinding.js:266-320)');
```

### t12_cpu_cost.mjs

```js
import { THREE, SkeletonUtils, makeSkinnedChain } from './common.mjs';
const { Scene, Group, AnimationMixer, AnimationClip, QuaternionKeyframeTrack, Quaternion, Euler, AnimationUtils } = THREE;
const qz = a => new Quaternion().setFromEuler(new Euler(0, 0, a));
console.log('# T12: CPU cost per frame of procedural spine (bones) for N individuals (Node ' + process.version + ', no GPU; JS only, 24 bones/fish)');
const NB = 24;
const proto = makeSkinnedChain(NB, 4);
const wrap = new Group(); wrap.add(proto.mesh);
// small additive clip on bone 3 (a "fin/gill-like" detail) to emulate mixer cost: 2 tracks
const clip = new AnimationClip('detail', 1, [
  new QuaternionKeyframeTrack('spine_3.quaternion', [0, 0.5, 1], [...qz(0).toArray(), ...qz(0.1).toArray(), ...qz(0).toArray()]),
  new QuaternionKeyframeTrack('spine_4.quaternion', [0, 0.5, 1], [...qz(0).toArray(), ...qz(-0.1).toArray(), ...qz(0).toArray()]),
]);
AnimationUtils.makeClipAdditive(clip, 0, clip, 30);
function bench(N, useMixer) {
  const scene = new Scene(); const fish = [];
  for (let i = 0; i < N; i++) {
    const f = SkeletonUtils.clone(wrap); f.position.set(i * 2, 0, 0); scene.add(f);
    const mesh = f.children[0]; const mixer = useMixer ? new AnimationMixer(f) : null;
    if (mixer) { const a = mixer.clipAction(clip); a.play(); a.time = (i * 0.137) % 1; }
    fish.push({ mesh, mixer, phase: i * 0.7 });
  }
  scene.updateMatrixWorld(true);
  const frame = (t) => {
    for (const F of fish) {
      if (F.mixer) F.mixer.update(1 / 60);
      const bones = F.mesh.skeleton.bones;
      for (let b = 0; b < NB; b++) bones[b].quaternion.setFromAxisAngle({ x: 0, y: 0, z: 1 }, 0.15 * Math.sin(6.28 * (t * 2 - b * 0.06) + F.phase) * (0.3 + b / NB));
    }
    scene.updateMatrixWorld();            // what WebGLRenderer.render does (WebGLRenderer.js:1663)
    for (const F of fish) F.mesh.skeleton.update();   // what WebGLObjects.update does (WebGLObjects.js:52)
  };
  for (let i = 0; i < 200; i++) frame(i / 60);   // warm-up
  const T = 500; const t0 = performance.now();
  for (let i = 0; i < T; i++) frame(i / 60);
  return (performance.now() - t0) / T;
}
for (const N of [1, 10, 50, 100, 200, 500]) {
  const a = bench(N, false), b = bench(N, true);
  console.log(`N=${String(N).padStart(3)}  procedural-only ${a.toFixed(3)} ms/frame (${(a / N * 1000).toFixed(1)} us/fish) | + AnimationMixer(2 additive tracks) ${b.toFixed(3)} ms/frame (${(b / N * 1000).toFixed(1)} us/fish)`);
}
console.log('GPU side (not measured): per-skeleton boneTexture upload each frame = size^2*16 B -> 24 bones: 12x12 -> 2304 B; 200 fish -> 0.46 MB/frame, 200 separate textures + 200 draw calls');
```

### t13_group_move.mjs

```js
import { THREE, makeSkinnedChain } from './common.mjs';
const { Group, Vector3, Matrix4, Frustum, PerspectiveCamera, Sphere, SkinnedMesh } = THREE;
const f = v => v.toArray().map(x => +x.toFixed(3));
console.log('# T13: moving/rotating/scaling a whole fish = transform the parent Group (mesh + root bone are siblings/children under it). BoundingSphere computed once stays valid.');
const { mesh, skel, bones } = makeSkinnedChain(6);
const g = new Group(); g.add(mesh);                 // root bone is a child of mesh (helper), mesh is child of g
g.updateMatrixWorld(true);
mesh.computeBoundingSphere();                       // cached once (rest pose)
const sph0 = mesh.boundingSphere.clone();
g.position.set(30, -4, 12); g.rotation.set(0.3, 1.1, -0.2); g.scale.setScalar(2);
bones[2].rotation.z = 0.4; bones[3].rotation.z = -0.3;
g.updateMatrixWorld(true); skel.update();
const v = mesh.getVertexPosition(10, new Vector3()).applyMatrix4(mesh.matrixWorld);
// expected: independent calc of world position by walking the bone chain (forward kinematics on vertex 10 -> weights (5,..)->bone index 5)
const exp = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 10);   // x=5,y=-0.2 ; skinIndex=(5,5,..) weight 1 on bone 5
const boneIdx = mesh.geometry.attributes.skinIndex.getX(10);
const m = new Matrix4().multiplyMatrices(bones[boneIdx].matrixWorld, skel.boneInverses[boneIdx]);   // bone offset in world
const expected = exp.clone().applyMatrix4(mesh.bindMatrix).applyMatrix4(m);                        // world position
console.log('world pos via getVertexPosition*matrixWorld:', f(v), '  via boneWorld*boneInverse*bindMatrix*v:', f(expected));
// bounding sphere (local) * matrixWorld encloses the deformed vertex?
const sW = mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
console.log('cached local sphere unchanged (rest pose):', f(sph0.center), sph0.radius.toFixed(3), ' world sphere radius (scale 2):', sW.radius.toFixed(3), ' vertex inside world sphere:', sW.containsPoint(v));
// bending beyond rest sphere: how much can the tail leave the rest-pose sphere?
let maxOut = 0;
const p = new Vector3();
for (let a = 0; a <= 1.2; a += 0.1) { bones.forEach((b, i) => { b.rotation.z = a * 0.5; }); g.updateMatrixWorld(true); skel.update();
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) { mesh.getVertexPosition(i, p); maxOut = Math.max(maxOut, p.distanceTo(sph0.center) - sph0.radius); } }
console.log('worst-case protrusion beyond rest-pose bounding sphere for chain bent 0..0.6 rad/bone (strong curl):', maxOut.toFixed(3), 'units (sphere radius', sph0.radius.toFixed(2) + ') -> pad radius by max lateral amplitude');
```

### t14_shared_bone.mjs

```js
import { THREE, makeSkinnedChain } from './common.mjs';
const { AnimationMixer, AnimationClip, QuaternionKeyframeTrack, Quaternion, Euler, AnimationUtils, Sphere, Frustum, Matrix4, PerspectiveCamera } = THREE;
const qz = a => new Quaternion().setFromEuler(new Euler(0, 0, a));
const ang = q => 2 * Math.atan2(q.z, q.w);
console.log('# T14a: layering ONE bone = procedural base * (additive clip delta). Correct recipe vs naive.');
function run(mode, pauseClip) {
  const { mesh, bones } = makeSkinnedChain(3);
  const B = bones[1];
  B.quaternion.copy(qz(0.1));                     // rest pose, set BEFORE play(): this is what the mixer saves as "original"
  const orig = B.quaternion.clone(), origInv = orig.clone().invert();
  mesh.updateMatrixWorld(true);
  // wave clip: delta angle 0 -> 0.3 (ramp), made additive relative to frame 0
  const ramp = new AnimationClip('add', 1, [new QuaternionKeyframeTrack('spine_1.quaternion', [0, 1], [...qz(0).toArray(), ...qz(0.3).toArray()])]);
  AnimationUtils.makeClipAdditive(ramp, 0, ramp, 30);
  const mixer = new AnimationMixer(mesh); const act = mixer.clipAction(ramp); act.play();
  const mixerOut = orig.clone(); const out = [];
  for (let f = 0; f < 6; f++) {
    if (f === 3 && pauseClip) act.paused = true;                  // clip stops changing -> mixer stops writing
    const proc = qz(0.5 * Math.sin(f));                             // procedural absolute bend this frame
    if (mode === 'recipe') B.quaternion.copy(mixerOut);            // (1) put back last mixer output
    mixer.update(0.1);                                             // (2)
    if (mode === 'recipe') {
      mixerOut.copy(B.quaternion);                                 // (3) capture mixer output = orig * delta
      const delta = origInv.clone().multiply(mixerOut);            //     delta = orig^-1 * mixerOut
      B.quaternion.copy(proc).multiply(delta);                     // (4) procedural base * delta
    } else {                                                       // naive: premultiply procedural onto whatever is there
      B.quaternion.premultiply(proc);
    }
    out.push(+ang(B.quaternion).toFixed(3));
  }
  const expected = []; for (let f = 0; f < 6; f++) { const t = Math.min(f + 1, pauseClip ? 3 : 99) * 0.1; expected.push(+(0.5 * Math.sin(f) + 0.3 * Math.min(t, 1)).toFixed(3)); }
  return { out, expected };
}
for (const pause of [false, true]) {
  const r = run('recipe', pause), n = run('naive', pause);
  console.log(`clip ${pause ? 'paused at f=3' : 'running   '} | recipe ${r.out.join(' ')} | expected(proc+delta) ${r.expected.join(' ')} | naive ${n.out.join(' ')}`);
}

console.log('\n# T14b: manual boundingSphere is honoured by frustum culling (Frustum.intersectsObject uses object.boundingSphere if !== undefined; SkinnedMesh initialises it to null)');
{
  const { mesh } = makeSkinnedChain(6); mesh.updateMatrixWorld(true);
  mesh.boundingSphere = new Sphere(new THREE.Vector3(2.5, 0, 0), 4);   // hand-made, padded
  const cam = new PerspectiveCamera(50, 1, 0.1, 100); cam.position.set(0, 0, 10); cam.updateMatrixWorld(true);
  const fr = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  console.log('visible with manual sphere:', fr.intersectsObject(mesh), '; boundingSphere unchanged after test:', mesh.boundingSphere.radius === 4, '(no lazy recompute)');
  mesh.frustumCulled = false; console.log('frustumCulled=false skips test entirely (WebGLRenderer.js:1914, WebGLShadowMap.js:526)');
}
```

### t15_wave_length_error.mjs

```js
// Feasibility numbers for the "no-bone" lateral wave: arc-length inflation of y(s)=A(s) sin(k s - phase) when s is used directly as x (small-amplitude approximation)
const lambda = 0.9, k = 2 * Math.PI / lambda;
const env = (a_tail) => (s) => a_tail * (0.02 + (-0.0825 * s + 0.1625 * s * s)) / 0.10; // shape from r08 (A(1.0)=0.10 -> normalised so tail amplitude = a_tail)
console.log('# T15: centerline length / L for y=A(s)sin(ks-phase), s in [0,1], lambda=0.9L, envelope shape from docs/yamame/research/r08_swim_steady.md (quadratic)');
for (const aTail of [0.06, 0.10, 0.12, 0.17, 0.20]) {
  let worst = 0, mean = 0; const P = 64;
  for (let p = 0; p < P; p++) {
    const ph = 2 * Math.PI * p / P; const A = env(aTail); let len = 0; const N = 2000; let py = A(0) * Math.sin(-ph);
    for (let i = 1; i <= N; i++) { const s = i / N; const y = A(s) * Math.sin(k * s - ph); len += Math.hypot(1 / N, y - py); py = y; }
    worst = Math.max(worst, len); mean += len / P;
  }
  console.log(`A_tail=${aTail.toFixed(2)}L : max length ${worst.toFixed(4)} L (+${((worst - 1) * 100).toFixed(2)} %), mean ${mean.toFixed(4)} L`);
}
console.log('=> using s directly as x (pure lateral displacement) stretches the centerline by +3..4 % at A_tail=0.10..0.12L and +8..11 % at 0.17..0.20L; a rigid bone chain (rotations only) is length-preserving by construction. A shader/morph version must integrate x(s)=int cos(theta) ds or accept the stretch.');
```

### t16_second_order.mjs

```js
// Does adding 3 quadratic morph targets (x-shortening = -1/2 * int y'^2) fix the +3..11 % length error of a pure lateral wave?
const lambda = 0.9, k = 2 * Math.PI / lambda, N = 4000;
console.log('# T16: centerline length / L with 2 linear + 3 quadratic relative morph targets  (weights: cos, -sin, cos^2, sin*cos, sin^2)');
for (const aTail of [0.06, 0.10, 0.12, 0.17, 0.20]) {
  const A = s => aTail * (0.02 + (-0.0825 * s + 0.1625 * s * s)) / 0.10;
  const dA = s => aTail * (-0.0825 + 2 * 0.1625 * s) / 0.10;
  // basis lateral shapes S=A sin(ks), C=A cos(ks) and their s-derivatives a=S', b=C'
  const a = s => dA(s) * Math.sin(k * s) + A(s) * k * Math.cos(k * s);
  const b = s => dA(s) * Math.cos(k * s) - A(s) * k * Math.sin(k * s);
  // y(s,wt) = S cos(wt) - C sin(wt) ; y' = a cos - b sin ; y'^2 = a^2 cos^2 - 2ab cos sin + b^2 sin^2
  // shortening dx(s) = -1/2 int_0^s y'^2  -> three tables:  Xcc = -1/2 int a^2 ; Xcs = +int ab (coefficient of cos*sin) ; Xss = -1/2 int b^2
  const Xcc = new Float64Array(N + 1), Xcs = new Float64Array(N + 1), Xss = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) { const s = (i - 0.5) / N, ds = 1 / N; Xcc[i] = Xcc[i - 1] - 0.5 * a(s) ** 2 * ds; Xcs[i] = Xcs[i - 1] + a(s) * b(s) * ds; Xss[i] = Xss[i - 1] - 0.5 * b(s) ** 2 * ds; }
  let worst = 0, worstPure = 0;
  const P = 64;
  for (let p = 0; p < P; p++) {
    const wt = 2 * Math.PI * p / P, c = Math.cos(wt), sn = Math.sin(wt);
    let len = 0, lenPure = 0, px = 0, py = A(0) * (Math.sin(0) * c - Math.cos(0) * sn), ppx = 0, ppy = py;
    for (let i = 1; i <= N; i++) {
      const s = i / N;
      const y = A(s) * (Math.sin(k * s) * c - Math.cos(k * s) * sn);
      const x = s + Xcc[i] * c * c + Xcs[i] * c * sn + Xss[i] * sn * sn;     // weights cos^2, sin*cos, sin^2
      len += Math.hypot(x - px, y - py); lenPure += Math.hypot(1 / N, y - ppy); px = x; py = y; ppy = y;
    }
    worst = Math.max(worst, len); worstPure = Math.max(worstPure, lenPure);
  }
  console.log(`A_tail=${aTail.toFixed(2)}L : pure lateral +${((worstPure - 1) * 100).toFixed(2)} %  ->  with 3 quadratic x-targets ${((worst - 1) * 100 >= 0 ? '+' : '') + ((worst - 1) * 100).toFixed(2)} % (max over 64 phases)`);
}
```

### t17_instanced_bounds.mjs

```js
import { THREE } from './common.mjs';
const { InstancedMesh, BoxGeometry, MeshBasicMaterial, Matrix4, Frustum, PerspectiveCamera } = THREE;
console.log('# T17: InstancedMesh bounds are computed lazily ONCE (Frustum.intersectsObject:150) -> stale when instances move; cost of recomputing');
for (const N of [100, 500, 2000, 10000]) {
  const im = new InstancedMesh(new BoxGeometry(1, 0.3, 0.2), new MeshBasicMaterial(), N);
  const m = new Matrix4();
  for (let i = 0; i < N; i++) im.setMatrixAt(i, m.makeTranslation(i % 50, 0, Math.floor(i / 50)));
  im.computeBoundingSphere();
  const T = 200; const t0 = performance.now();
  for (let i = 0; i < T; i++) { for (let j = 0; j < N; j++) im.setMatrixAt(j, m.makeTranslation((j % 50) + i * 0.01, 0, Math.floor(j / 50))); }
  const t1 = performance.now();
  for (let i = 0; i < T; i++) im.computeBoundingSphere();
  const t2 = performance.now();
  console.log(`N=${String(N).padStart(5)}  setMatrixAt x N: ${((t1 - t0) / T).toFixed(3)} ms/frame   computeBoundingSphere(): ${((t2 - t1) / T).toFixed(3)} ms/call`);
}
const im2 = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 2);
const cam = new PerspectiveCamera(50, 1, 0.1, 100); cam.position.set(0, 0, 10); cam.updateMatrixWorld(true);
const fr = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
console.log('initial boundingSphere null:', im2.boundingSphere === null, '; visible', fr.intersectsObject(im2), '; then move instance 0 to x=1000:', (im2.setMatrixAt(0, new Matrix4().makeTranslation(1000, 0, 0)), 'cached sphere radius', im2.boundingSphere.radius.toFixed(2)), '(unchanged -> stale until computeBoundingSphere())');
```

### t18_uncache.mjs

```js
import { THREE, SkeletonUtils, makeSkinnedChain } from './common.mjs';
const { Group, AnimationMixer, AnimationClip, QuaternionKeyframeTrack, Quaternion, Euler } = THREE;
const qz = a => new Quaternion().setFromEuler(new Euler(0, 0, a));
console.log('# T18: removing individuals from a shared mixer requires uncacheRoot (AnimationMixer.js:801-843)');
const proto = makeSkinnedChain(4); const wrap = new Group(); wrap.add(proto.mesh);
const clip = new AnimationClip('c', 1, [new QuaternionKeyframeTrack('spine_1.quaternion', [0, 1], [...qz(0).toArray(), ...qz(0.5).toArray()])]);
const big = new Group(); const mixer = new AnimationMixer(big); const fish = [];
for (let i = 0; i < 20; i++) { const f = SkeletonUtils.clone(wrap); big.add(f); mixer.clipAction(clip, f).play(); fish.push(f); }
const st = () => `actions total/inUse ${mixer.stats.actions.total}/${mixer.stats.actions.inUse}, bindings total/inUse ${mixer.stats.bindings.total}/${mixer.stats.bindings.inUse}`;
console.log('20 individuals playing :', st());
for (let i = 0; i < 10; i++) { big.remove(fish[i]); }
console.log('10 removed from scene (no uncache):', st(), '(bindings and actions still held and updated every frame)');
for (let i = 0; i < 10; i++) { mixer.uncacheRoot(fish[i]); }
console.log('after mixer.uncacheRoot() x10      :', st());
```

### t19_bone_chain_wave.mjs

```js
// Bone-chain realisation of y(s,t)=A(s) sin(ks - wt): local joint angle_j = atan(y'(s_j)) - atan(y'(s_{j-1})) (doc 1.3). FK in plain JS.
// Reports: chain length (exactly L by construction) and max lateral deviation from the analytic centreline (measured at equal ARC length).
const lambda = 0.9, k = 2 * Math.PI / lambda;
console.log('# T19: bone chain driven by joint angles = tangent-angle differences of the target wave (envelope shape: r08 quadratic)');
for (const nBones of [12, 16, 24, 32]) {
  for (const aTail of [0.10, 0.12, 0.20]) {
    const A = s => aTail * (0.02 + (-0.0825 * s + 0.1625 * s * s)) / 0.10, dA = s => aTail * (-0.0825 + 2 * 0.1625 * s) / 0.10;
    const yp = (s, ph) => dA(s) * Math.sin(k * s - ph) + A(s) * k * Math.cos(k * s - ph);
    const ell = 1 / (nBones - 1);
    let worstDev = 0, worstTailAngle = 0;
    const P = 48;
    for (let p = 0; p < P; p++) {
      const ph = 2 * Math.PI * p / P;
      // joint 0 is the root at s=0 with world angle theta_0 = atan(y'(0)); local angle_j = theta_j - theta_{j-1}
      let x = 0, y = A(0) * Math.sin(-ph), th = 0;
      const pts = [[x, y]];
      let prevTheta = 0;
      for (let j = 0; j < nBones - 1; j++) {
        const s = (j + 0.5) * ell;                 // use the segment-midpoint tangent for the segment j->j+1
        const theta = Math.atan(yp(s, ph));
        const local = theta - prevTheta; worstTailAngle = Math.max(worstTailAngle, Math.abs(local)); prevTheta = theta;
        x += ell * Math.cos(theta); y += ell * Math.sin(theta); pts.push([x, y]);
      }
      // compare with the (extensible) analytic target y(s) at the same x. NOTE: this difference is NOT an error of the chain: the rigid chain is the arc-length-parametrised wave, the target stretches x by up to +3..11 % (see t15), so the tail phase differs.
      for (const [px, py] of pts) { const s = Math.min(1, Math.max(0, px)); worstDev = Math.max(worstDev, Math.abs(py - A(s) * Math.sin(k * s - ph))); }
    }
    console.log(`bones=${String(nBones).padStart(2)} A_tail=${aTail.toFixed(2)}L : centre-line difference vs extensible target ${(worstDev * 100).toFixed(2)} %L (parametrisation difference, not an error) ; chain length = ${(1).toFixed(3)} L (rigid) ; max per-joint rotation ${(worstTailAngle * 180 / Math.PI).toFixed(1)} deg`);
  }
}
```

---

## 付録 B: 実行ログ全文

### B-1 evidence_greps.log

```
$ grep -rn "maxBones\|MAX_BONES" src/renderers  (expect: no hits => no bone-count cap in renderer)
(exit=1)

$ grep -n "contextName = " src/renderers/WebGLRenderer.js
409:				const contextName = 'webgl2';

$ grep -c -i "morph|skin|skelet|bone" BatchedMesh.js InstancedMesh.js
src/objects/BatchedMesh.js:0
src/objects/InstancedMesh.js:25

$ grep -n -i "skelet\|skin\|bone" src/objects/InstancedMesh.js  (expect: none)
(exit=1)

$ grep -n "skinning:\|IS_INSTANCEDMESH =\|IS_BATCHEDMESH =" src/renderers/webgl/WebGLPrograms.js
124:		const IS_INSTANCEDMESH = object.isInstancedMesh === true;
125:		const IS_BATCHEDMESH = object.isBatchedMesh === true;
330:			skinning: object.isSkinnedMesh === true,

$ grep -rn "isSkinnedMesh" src/renderers/WebGLRenderer.js src/renderers/webgl
src/renderers/WebGLRenderer.js:2460:				} else if ( object.isSkinnedMesh && materialProperties.skinning === false ) {
src/renderers/WebGLRenderer.js:2464:				} else if ( ! object.isSkinnedMesh && materialProperties.skinning === true ) {
src/renderers/WebGLRenderer.js:2687:			if ( object.isSkinnedMesh ) {
src/renderers/webgl/WebGLRenderLists.js:77:		if ( object.isSkinnedMesh ) variant += 1;
src/renderers/webgl/WebGLObjects.js:46:		if ( object.isSkinnedMesh ) {
src/renderers/webgl/WebGLPrograms.js:330:			skinning: object.isSkinnedMesh === true,

$ grep -n "skeleton.update\|info.render.frame\|projectObject( scene\|shadowMap.render(\|scene.updateMatrixWorld()" (renderer/objects)
52:				skeleton.update();
1454:			if ( _nodesHandler !== null ) shadowMap.render( currentRenderState.state.shadowsArray, targetScene, camera );
1663:			if ( scene.matrixWorldAutoUpdate === true ) scene.updateMatrixWorld();
1709:			projectObject( scene, camera, 0, _this.sortObjects );
1729:			this.info.render.frame ++;
1737:			shadowMap.render( shadowsArray, scene, camera );

$ grep -n "frustumCulled" src/renderers/WebGLRenderer.js src/renderers/webgl/WebGLShadowMap.js
src/renderers/WebGLRenderer.js:1892:					if ( ! object.frustumCulled || object.intersectsFrustum( _frustum ) ) {
src/renderers/WebGLRenderer.js:1914:					if ( ! object.frustumCulled || object.intersectsFrustum( _frustum ) ) {
src/renderers/webgl/WebGLShadowMap.js:526:			if ( ( object.castShadow || ( object.receiveShadow && type === VSMShadowMap ) ) && ( ! object.frustumCulled || object.intersectsFrustum( _frustum ) ) ) {

$ grep -n "Math.sqrt( this.bones.length\|Math.ceil( size / 4\|Math.max( size, 4" src/objects/Skeleton.js
252:		let size = Math.sqrt( this.bones.length * 4 ); // 4 pixels needed for 1 matrix
253:		size = Math.ceil( size / 4 ) * 4;
254:		size = Math.max( size, 4 );

$ grep -n "attribute vec4 skin" src/renderers/webgl/WebGLProgram.js
665:			'	attribute vec4 skinIndex;',
666:			'	attribute vec4 skinWeight;',

$ grep -n "const integer" src/renderers/webgl/WebGLBindingStates.js
357:					const integer = ( type === gl.INT || type === gl.UNSIGNED_INT || geometryAttribute.gpuType === IntType );

$ grep -n "JOINTS_\|WEIGHTS_" examples/jsm/loaders/GLTFLoader.js | head
2286:	WEIGHTS_0: 'skinWeight',
2287:	JOINTS_0: 'skinIndex',

$ grep -n "deprecated" src/core/Clock.js | head -3
6: * @deprecated since r183.
13:	 * @deprecated since 183.
61:		warn( 'Clock: This module has been deprecated. Please use THREE.Timer instead.' ); // @deprecated, r183

$ types drift
/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/types-three-0.186.0/three/src/objects/Skeleton.d.ts:71:    frame: number;
/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/types-three-0.186.0/three/src/objects/SkinnedMesh.d.ts:70:    constructor(geometry?: TGeometry, material?: TMaterial, useVertexTexture?: boolean);
(source: exit=1 => no 'frame' member / no useVertexTexture param)

$ sha1sum tarballs vs npm registry
6d50f70c2c437f844179bbb56d6f5b774e1ca38a  /tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/three-0.186.1.tgz
fc936323d7eeb885052fd5de352e3772f488ea99  /tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/types-three-0.186.0.tgz
6d50f70c2c437f844179bbb56d6f5b774e1ca38a
fc936323d7eeb885052fd5de352e3772f488ea99
```

### B-2 run_all.log（Node v22.22.0）

```
================ t1_bonetexture.mjs
# T1: boneTexture size vs bone count (Skeleton.computeBoneTexture, src/objects/Skeleton.js:243-267)
N_bones  texSize  texels  capacityMatrices  bytes(RGBA32F)
      1      4x4      16          4            256  boneMatrices.length= 64  (N*16= 16 )
      2      4x4      16          4            256  boneMatrices.length= 64  (N*16= 32 )
      4      4x4      16          4            256  boneMatrices.length= 64  (N*16= 64 )
      5      8x8      64         16           1024  boneMatrices.length= 256  (N*16= 80 )
     16      8x8      64         16           1024  boneMatrices.length= 256  (N*16= 256 )
     17    12x12     144         36           2304  boneMatrices.length= 576  (N*16= 272 )
     20    12x12     144         36           2304  boneMatrices.length= 576  (N*16= 320 )
     24    12x12     144         36           2304  boneMatrices.length= 576  (N*16= 384 )
     32    12x12     144         36           2304  boneMatrices.length= 576  (N*16= 512 )
     36    12x12     144         36           2304  boneMatrices.length= 576  (N*16= 576 )
     37    16x16     256         64           4096  boneMatrices.length= 1024  (N*16= 592 )
     64    16x16     256         64           4096  boneMatrices.length= 1024  (N*16= 1024 )
    100    20x20     400        100           6400  boneMatrices.length= 1600  (N*16= 1600 )
    128    24x24     576        144           9216  boneMatrices.length= 2304  (N*16= 2048 )
    256    32x32    1024        256          16384  boneMatrices.length= 4096  (N*16= 4096 )
   1000    64x64    4096       1024          65536  boneMatrices.length= 16384  (N*16= 16000 )
   1024    64x64    4096       1024          65536  boneMatrices.length= 16384  (N*16= 16384 )
size%4==0 and capacity>=N for N=1..5000: true
MAX_TEXTURE_SIZE 2048 -> max bones (T*T/4) = 1048576
MAX_TEXTURE_SIZE 4096 -> max bones (T*T/4) = 4194304
MAX_TEXTURE_SIZE 8192 -> max bones (T*T/4) = 16777216
MAX_TEXTURE_SIZE 16384 -> max bones (T*T/4) = 67108864
DataTexture defaults: format 1023 (1023=RGBAFormat) type 1015 (1015=FloatType) minFilter 1003 (1003=Nearest) magFilter 1003 generateMipmaps false
================ t2_update_order.mjs
# T2: skeleton.update() reads bone.matrixWorld (Skeleton.js:208-217); stale unless updateMatrixWorld ran
rest pose, last-bone [cos,sin] of last boneMatrix: [ 1, 0 ]
A) rotated root, skeleton.update() only         -> [ 1, 0 ] (expected unchanged = stale)
B) + mesh.updateMatrixWorld(true), update()     -> [ 0, 1 ]
C) matrixAutoUpdate=false, rotation.z=1 ignored -> [ 1, 0 ] (expected = rest pose values)
D) child bone changed, updateMatrixWorld() (no force) -> [ 0.0707, 0.9975 ]
E) back to rest: boneMatrix[0] elements ~ identity? 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
================ t3_mixer_procedural.mjs
# T3a: mixer writes bone only when accumulated value CHANGED (PropertyMixer.apply, src/animation/PropertyMixer.js:198-247)
t=0.5 angle 0.4
naive "q *= delta" after mixer.update with paused clip, 4 frames: 0.5 -> 0.6 -> 0.7 -> 0.8  (accumulates +0.1/frame = BUG)
restore -> mixer.update -> capture -> procedural, 4 frames  : 0.5 -> 0.5 -> 0.5 -> 0.5  (constant 0.5 = 0.4 + 0.1 OK)

# T3b: weight<1 blends toward the ORIGINAL state saved at first activation (PropertyMixer.apply weight<1 branch; saveOriginalState)
orig=0.2, clip=0.6, weight .5 -> angle 0.4 (expect ~0.4 = mid of orig and clip)
bone set to 0.9 BEFORE play(): angle 0.75 (expect ~0.75: original captured at play() time = 0.9)
bone set to 0.9 AFTER play():  angle 0.4 (expect ~0.4: procedural change ignored, uses saved original 0.2)

# T3c: stop() restores original state; fadeOut-to-0 + enabled=false keeps action active (AnimationMixer._deactivateAction -> restoreOriginalState; AnimationAction._updateWeight)
playing: angle 0.6
after stop(): angle 0.2 (expect 0.2 = original, procedural 0.9 overwritten)
fadeOut(0.2) after 0.3s: enabled false isScheduled true angle 0.2 (back to original 0.2, action still scheduled/active)
procedural 0.9 written; next mixer.update(): 0.9 (accu unchanged -> mixer does not rewrite; 0.9 survives)

# T3d: additive clip = original (pose at play()) * delta; local right-multiply (PropertyMixer._slerpAdditive)
makeClipAdditive: blendMode 2501 (2501=Additive)  first key 0  last key 0.3
additive only at t=.5, original=0.2: angle 0.35 (expect 0.2+0.15=0.35)
additive weight .5 (t~.5): 0.275 (expect 0.2+0.075=0.275)

# T3e: normal actions with total weight>1 are normalised; <1 falls back to original
w=1,1 -> 0.5 (expect 0.5)
w=2,1 -> 0.4 (expect 0.4 = (2*.2+.8)/3)
w=.25,.25 -> 0.25 (expect .25*.2+.25*.8+.5*0 = 0.25)
================ t4_bounds.mjs
# T4a: SkinnedMesh.boundingSphere is computed ONCE lazily (Frustum.intersectsObject, src/math/Frustum.js:146-152) and then cached; moving bones (not the mesh) leaves it stale
initial boundingSphere: null (null until first culling test)
visible at start? true
cached sphere center/radius: [ 2.404, -0.144, 0 ] 2.618
vertex 0 actual local pos after bone move: [ 0, 499.8, 0 ]
visible after moving bone 500 units up? (should be false, true body is off-screen): true  <- stale cache says visible
camera looking at real body (0,500,0): visible = false  <- stale cache says CULLED => fish invisible (bug)
after computeBoundingSphere(): visible = true  sphere center [ 2.4, 499.9, 0 ]

# T4b: AttachedBindMode: moving the mesh object itself is cancelled by bindMatrixInverse (SkinnedMesh.updateMatrixWorld, lines 290-308)
bones are children of mesh: vertex0 local before [ 0, -0.20000000298023224, 0 ] after mesh.position.x=100: [ 0, -0.20000000298023224, 0 ] (local pos unchanged -> sphere stays valid)
bones as sibling of mesh, bone moved +7y: vertex0 local = [ 0, 6.8, 0 ] (local coordinates follow the bone; mesh.matrixWorld unchanged)

# T4c: cost of SkinnedMesh.computeBoundingSphere/Box (per vertex: up to 4 matrix multiplies, src/objects/SkinnedMesh.js:213-221,319-366)
verts=5000: computeBoundingSphere 2.5 ms, computeBoundingBox 2.8 ms per call (Node v22.22.0, JIT warm)
verts=20000: computeBoundingSphere 10.6 ms, computeBoundingBox 7.9 ms per call (Node v22.22.0, JIT warm)
verts=100000: computeBoundingSphere 39.9 ms, computeBoundingBox 39.8 ms per call (Node v22.22.0, JIT warm)
================ t5_clone.mjs
# T5a: plain Object3D.clone() of a SkinnedMesh (SkinnedMesh.copy, src/objects/SkinnedMesh.js:161-176 : this.skeleton = source.skeleton)
clone.skeleton === source.skeleton : true  (SHARED skeleton)
clone bones[0] === source bones[0] : false (children cloned: different Bone objects)  clone.skeleton.bones[0] is a source bone: true

# T5b: SkeletonUtils.clone (examples/jsm/utils/SkeletonUtils.js:392-431)
geometry shared with source        : true true
material shared with source        : true
skeleton distinct per clone        : true true
boneInverses array shared (same ref): true true
clone skeleton bones are clone's own children : true  not source bones: true
boneMatrices distinct Float32Array : true
boneTexture (not yet computed) null: true  -> each clone allocates its own DataTexture on first render (WebGLRenderer.js:2696)
boundingSphere cloned when source had one: true
morphTargetInfluences array copied (not shared): n/a here (no morphs) -> Mesh.copy uses .slice() (Mesh.js:116)

# T5c: independent poses & independent mixers
clip shared, clone1 bone angle 0.2 clone2 0.6 source (untouched) 0
boneMatrices differ: true   source skeleton.boneMatrices never updated (all zeros): 0

# T5d: Skeleton.clone() (Skeleton.js:232-236) does NOT clone bones
sk2.bones[0] === skel.bones[0]: true ; boneInverses same array: true ; bones array copied: true

# T5e: one AnimationMixer, many roots via clipAction(clip, root) -> independent action time per root
single mixer: A angle 0.2  B angle 0.6 (expect 0.2 and 0.6)
mixer.stats bindings total/inUse: 2 2  actions total/inUse: 2 2
================ t7_webglobjects.mjs
# T7: WebGLObjects.update() (src/renderers/webgl/WebGLObjects.js:46-56): skeleton.update() runs at most once per info.render.frame
# Emulated order inside WebGLRenderer.render(): projectObject->objects.update [WebGLRenderer.js:1901/1916] ; info.render.frame++ [:1729] ; shadowMap.render->objects.update [WebGLShadowMap.js:530] ; draw
A) no shadow casters:
  render#1: frame=0 update [proj]
  render#2: frame=1 update [proj]
  render#3: frame=2 update [proj]
B) shadow pass every render (castShadow=true, autoUpdate):
  render#1: frame=0 update [proj] [shadow] update
  render#2: frame=1 [proj] [shadow] update
  render#3: frame=2 [proj] [shadow] update
  render#4: frame=3 [proj] [shadow] update
C) shadow pass only on render#2 (shadowMap.autoUpdate=false + needsUpdate once):
  render#1: frame=0 update [proj]
  render#2: frame=1 update [proj] [shadow] update
  render#3: frame=2 [proj]
  render#4: frame=3 update [proj]
================ t8_skin_math.mjs
# T8a: GPU formula (skinning_vertex.glsl.js) re-implemented on CPU == SkinnedMesh.applyBoneTransform (SkinnedMesh.js:319-366)
GPU-formula: [ 3.0379, -0.0687, 0 ]  applyBoneTransform: [ 3.0379, -0.0687, 0 ]  getVertexPosition: [ 3.0379, -0.0687, 0 ]
Vector4 variant w preserved: [ 2.812, 0.914, -0, 0 ] (w=0 -> direction transform)
weights sum=2 (unnormalised): vertex -> [ 7.9864, 2.8626, 0.591 ] (≈ 2x offset from bone origin => stretched; shader has no renormalise)
after mesh.normalizeSkinWeights(): [ 0.7, 0.3, 0, 0 ] -> [ 3.0379, -0.0687, 0 ]

# T8b: bindMode Attached vs Detached (SkinnedMesh.js:290-308; constants.js:491,500)
attached  world pos before [ 2, -0.2, 0 ]  after moving mesh.position.x+=10 (bones are mesh children): [ 12, -0.2, 0 ]
detached  world pos before [ 2, -0.2, 0 ]  after moving mesh.position.x+=10 (bones are mesh children): [ 22, -0.2, 0 ]
shared skeleton, mesh A (attached) world [ 1.9383, 0.3996, 0 ]  mesh B (detached, offset z+5) world [ 1.9383, 0.3996, 5 ]  (B = A shifted by its own matrixWorld)

# T8c: attribute typing: Uint8/Uint16/Float32 skinIndex all ok on CPU; GL: integer path only for INT/UNSIGNED_INT or gpuType IntType (WebGLBindingStates.js:357) -> vertexAttribIPointer, but GLSL declares vec4 (WebGLProgram.js:665)
Uint8    array Uint8Array    gl type? n/a in node  CPU skinning ok [ 1, -0.2, 0 ]
Uint16   array Uint16Array   gl type? n/a in node  CPU skinning ok [ 1, -0.2, 0 ]
Float32  array Float32Array  gl type? n/a in node  CPU skinning ok [ 1, -0.2, 0 ]
Uint32 attribute: gpuType = 1015 (1015=Float) ; GL type will be UNSIGNED_INT -> `integer` branch (WebGLBindingStates.js:357) -> vertexAttribIPointer => mismatch with `attribute vec4 skinIndex` (UNVERIFIED on GPU)
================ t9_fade_warp.mjs
# T9a: crossFadeFrom/To semantics (AnimationAction.js:334-372) — weights over a 1.0s fade, t = mixer time
t=0.00 wA=1.00 wB=0.00 angle=0.2
t=0.20 wA=0.80 wB=0.20 angle=0.32
t=0.40 wA=0.60 wB=0.40 angle=0.44
t=0.60 wA=0.40 wB=0.60 angle=0.56
t=0.80 wA=0.20 wB=0.80 angle=0.68
t=1.00 wA=0.00 wB=1.00 angle=0.8
after fade: A.enabled= false  A.isScheduled()= true  B.enabled= true   mixer.stats.actions inUse= 2
A.play() again WITHOUT reset(): A.enabled = false  weight 0 (stays disabled -> call A.reset().play())
A.reset().play(): A.enabled = true  weight 1

# T9b: crossFade does NOT call play() on the incoming action
B.isScheduled() = false  B eff weight 1  A eff weight 0.5  angle 0.1 (B never contributes; A fades to 0 -> bone drifts to ORIGINAL pose)

# T9c: warp=true crossfade of clips with different duration (crossFadeFrom lines with startEndRatio/endStartRatio)
t=0.00 slow.effTimeScale=1.000 fast.effTimeScale=0.500
t=0.20 slow.effTimeScale=1.200 fast.effTimeScale=0.600
t=0.40 slow.effTimeScale=1.400 fast.effTimeScale=0.700
t=0.60 slow.effTimeScale=1.600 fast.effTimeScale=0.800
t=0.80 slow.effTimeScale=1.800 fast.effTimeScale=0.900
t=1.00 slow.effTimeScale=1.000 fast.effTimeScale=1.000
(slow warps 1.0 -> fadeOutDuration/fadeInDuration = 2.0, fast warps 0.5 -> 1.0; at the end of the fade both timeScale values are restored to the pre-fade ones, here 1.0)

# T9d: setDuration / timeScale / halt / warp
clip.duration=2, setDuration(1) -> timeScale 2
setEffectiveTimeScale(2) -> timeScale 2 effective 2
after 0.1 s mixer time: action.time = 0.200 (=0.1*2)
warp(2->0.5 over 1s) at +0.5s: effTimeScale 1.250 (expect 1.25 = lerp)
warp finished: timeScale 0.5  effective 0.5
halt(0.5) done: paused = true  timeScale 1
mixer.timeScale=0 pauses all: action.time unchanged true
per-action phase offset via action.time = 0.7  (public field, AnimationAction.js:84); also startAt(mixer.time+x) for delayed start

# T9e: morph influences via named track, resolved through morphTargetDictionary (PropertyBinding.js:655-690) & CreateFromMorphTargetSequence
Mesh auto-populates dictionary: {"open":0,"close":1} influences [ 0, 0 ]
track ".morphTargetInfluences[open]" at t=.5 -> [ 1, 0 ]
morphs added AFTER Mesh creation: influences = undefined -> call mesh.updateMorphTargets(): [ 0 ]
================ t10_morph_wave.mjs
# T10a: traveling wave y(x,t)=A(x) sin(kx - wt) as 2 RELATIVE morph targets  S=A sin(kx), C=A cos(kx) with weights (cos wt, -sin wt)
max |CPU morph result - analytic wave| over 5 phases x 21 samples = 3.93e-9

# T10b: InstancedMesh.setMorphAt / morphTexture layout (InstancedMesh.js:355-385) and base influence for relative vs absolute morphs
morphTexture size 3 x 1000  format 1028 (1028=RedFormat) type 1015 (1015=Float)  floats/instance = 3
row 0 = [ 1, 0.3, -0.4 ] [base, w0, w1]  (relative => base = 1)
row 1 (morphTargetsRelative=false) = [ 1.1, 0.3, -0.4 ] [1 - sum(w) = 1.1, ...] => must use relative morphs
direct typed-array rewrite of 1000 instances: 29.4 us/frame; texture bytes uploaded per frame when needsUpdate=true = 12000 B (RedFormat/Float32 -> N x 3 texels)

# T10c: morph texture memory (WebGLMorphtargets.js:27-45): width=verts*stride(1 pos,2 +normal,3 +color) texels, split into rows at maxTextureSize; layers = #targets; built ONCE per geometry
verts=5000 targets=2 stride=1: 0.15 MiB (RGBA32F)
verts=5000 targets=2 stride=2: 0.31 MiB (RGBA32F)
verts=20000 targets=2 stride=2: 1.22 MiB (RGBA32F)
verts=20000 targets=4 stride=2: 2.44 MiB (RGBA32F)
verts=100000 targets=2 stride=2: 6.10 MiB (RGBA32F)
================ t10d_instanced_noop.mjs
InstancedMesh.morphTargetInfluences = undefined (Mesh ctor calls this.updateMorphTargets(), which InstancedMesh overrides as a no-op: InstancedMesh.js:388) ; morphTexture = null
=> WebGLMorphtargets.update (src/renderers/webgl/WebGLMorphtargets.js:132-141) would hit objectInfluences.length on undefined if morphTexture is still null at first render
================ t11_trackname.mjs
# T11a: parseTrackName (PropertyBinding.js:209-262)
spine_1.quaternion                   {"nodeName":"spine_1","propertyName":"quaternion"}
Bone.001.position                    {"nodeName":"Bone.001","propertyName":"position"}
.bones[spine_2].quaternion           {"objectName":"bones","objectIndex":"spine_2","propertyName":"quaternion"}
fin L.scale                          {"nodeName":"fin L","propertyName":"scale"}
Armature/spine_1.quaternion          {"nodeName":"spine_1","propertyName":"quaternion"}
mesh.morphTargetInfluences[open]     {"nodeName":"mesh","propertyName":"morphTargetInfluences","propertyIndex":"open"}
a:b.position                         {"nodeName":"b","propertyName":"position"}
sanitizeNodeName("fin L.001:x") -> fin_L001x

# T11b: binding variants resolve & animate
bone by name, root=mesh      bone angle after 0.5s (expect 0.25; note LoopRepeat wraps t=duration to 0) = 0.25
.bones[name], root=mesh      bone angle after 0.5s (expect 0.25; note LoopRepeat wraps t=duration to 0) = 0.25
unknown bone name: no throw; messages = ["THREE.PropertyBinding: No target node found for track: nope.quaternion."]
mixer root = mesh with several same-named bones: findNode returns first via skeleton.getBoneByName (PropertyBinding.js:266-320)
================ t12_cpu_cost.mjs
# T12: CPU cost per frame of procedural spine (bones) for N individuals (Node v22.22.0, no GPU; JS only, 24 bones/fish)
N=  1  procedural-only 0.011 ms/frame (11.4 us/fish) | + AnimationMixer(2 additive tracks) 0.017 ms/frame (16.5 us/fish)
N= 10  procedural-only 0.048 ms/frame (4.8 us/fish) | + AnimationMixer(2 additive tracks) 0.061 ms/frame (6.1 us/fish)
N= 50  procedural-only 0.306 ms/frame (6.1 us/fish) | + AnimationMixer(2 additive tracks) 0.388 ms/frame (7.8 us/fish)
N=100  procedural-only 0.792 ms/frame (7.9 us/fish) | + AnimationMixer(2 additive tracks) 0.969 ms/frame (9.7 us/fish)
N=200  procedural-only 1.689 ms/frame (8.4 us/fish) | + AnimationMixer(2 additive tracks) 1.911 ms/frame (9.6 us/fish)
N=500  procedural-only 3.997 ms/frame (8.0 us/fish) | + AnimationMixer(2 additive tracks) 5.196 ms/frame (10.4 us/fish)
GPU side (not measured): per-skeleton boneTexture upload each frame = size^2*16 B -> 24 bones: 12x12 -> 2304 B; 200 fish -> 0.46 MB/frame, 200 separate textures + 200 draw calls
================ t13_group_move.mjs
# T13: moving/rotating/scaling a whole fish = transform the parent Group (mesh + root bone are siblings/children under it). BoundingSphere computed once stays valid.
world pos via getVertexPosition*matrixWorld: [ 34.455, -2.555, 3.286 ]   via boneWorld*boneInverse*bindMatrix*v: [ 34.455, -2.555, 3.286 ]
cached local sphere unchanged (rest pose): [ 2.404, -0.144, 0 ] 2.618  world sphere radius (scale 2): 5.237  vertex inside world sphere: true
worst-case protrusion beyond rest-pose bounding sphere for chain bent 0..0.6 rad/bone (strong curl): 2.246 units (sphere radius 2.62) -> pad radius by max lateral amplitude
================ t14_shared_bone.mjs
# T14a: layering ONE bone = procedural base * (additive clip delta). Correct recipe vs naive.
clip running    | recipe 0.03 0.481 0.545 0.191 -0.228 -0.299 | expected(proc+delta) 0.03 0.481 0.545 0.191 -0.228 -0.299 | naive 0.13 0.581 0.645 0.291 -0.128 -0.199
clip paused at f=3 | recipe 0.03 0.481 0.545 0.161 -0.288 -0.389 | expected(proc+delta) 0.03 0.481 0.545 0.161 -0.288 -0.389 | naive 0.13 0.581 0.645 0.715 0.337 -0.143

# T14b: manual boundingSphere is honoured by frustum culling (Frustum.intersectsObject uses object.boundingSphere if !== undefined; SkinnedMesh initialises it to null)
visible with manual sphere: true ; boundingSphere unchanged after test: true (no lazy recompute)
frustumCulled=false skips test entirely (WebGLRenderer.js:1914, WebGLShadowMap.js:526)
================ t15_wave_length_error.mjs
# T15: centerline length / L for y=A(s)sin(ks-phase), s in [0,1], lambda=0.9L, envelope shape from docs/yamame/research/r08_swim_steady.md (quadratic)
A_tail=0.06L : max length 1.0119 L (+1.19 %), mean 1.0089 L
A_tail=0.10L : max length 1.0318 L (+3.18 %), mean 1.0241 L
A_tail=0.12L : max length 1.0448 L (+4.48 %), mean 1.0341 L
A_tail=0.17L : max length 1.0840 L (+8.40 %), mean 1.0649 L
A_tail=0.20L : max length 1.1114 L (+11.14 %), mean 1.0868 L
=> using s directly as x (pure lateral displacement) stretches the centerline by +3..4 % at A_tail=0.10..0.12L and +8..11 % at 0.17..0.20L; a rigid bone chain (rotations only) is length-preserving by construction. A shader/morph version must integrate x(s)=int cos(theta) ds or accept the stretch.
================ t16_second_order.mjs
# T16: centerline length / L with 2 linear + 3 quadratic relative morph targets  (weights: cos, -sin, cos^2, sin*cos, sin^2)
A_tail=0.06L : pure lateral +1.19 %  ->  with 3 quadratic x-targets +0.03 % (max over 64 phases)
A_tail=0.10L : pure lateral +3.18 %  ->  with 3 quadratic x-targets +0.26 % (max over 64 phases)
A_tail=0.12L : pure lateral +4.48 %  ->  with 3 quadratic x-targets +0.53 % (max over 64 phases)
A_tail=0.17L : pure lateral +8.40 %  ->  with 3 quadratic x-targets +2.01 % (max over 64 phases)
A_tail=0.20L : pure lateral +11.14 %  ->  with 3 quadratic x-targets +3.66 % (max over 64 phases)
================ t17_instanced_bounds.mjs
# T17: InstancedMesh bounds are computed lazily ONCE (Frustum.intersectsObject:150) -> stale when instances move; cost of recomputing
N=  100  setMatrixAt x N: 0.045 ms/frame   computeBoundingSphere(): 0.088 ms/call
N=  500  setMatrixAt x N: 0.056 ms/frame   computeBoundingSphere(): 0.047 ms/call
N= 2000  setMatrixAt x N: 0.050 ms/frame   computeBoundingSphere(): 0.141 ms/call
N=10000  setMatrixAt x N: 0.121 ms/frame   computeBoundingSphere(): 0.694 ms/call
initial boundingSphere null: true ; visible true ; then move instance 0 to x=1000: 0.87 (unchanged -> stale until computeBoundingSphere())
================ t18_uncache.mjs
# T18: removing individuals from a shared mixer requires uncacheRoot (AnimationMixer.js:801-843)
20 individuals playing : actions total/inUse 20/20, bindings total/inUse 20/20
10 removed from scene (no uncache): actions total/inUse 20/20, bindings total/inUse 20/20 (bindings and actions still held and updated every frame)
after mixer.uncacheRoot() x10      : actions total/inUse 10/10, bindings total/inUse 10/10
================ t19_bone_chain_wave.mjs
# T19: bone chain driven by joint angles = tangent-angle differences of the target wave (envelope shape: r08 quadratic)
bones=12 A_tail=0.10L : centre-line difference vs extensible target 0.75 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 22.7 deg
bones=12 A_tail=0.12L : centre-line difference vs extensible target 1.31 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 26.9 deg
bones=12 A_tail=0.20L : centre-line difference vs extensible target 4.97 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 43.0 deg
bones=16 A_tail=0.10L : centre-line difference vs extensible target 0.81 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 17.9 deg
bones=16 A_tail=0.12L : centre-line difference vs extensible target 1.37 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 21.3 deg
bones=16 A_tail=0.20L : centre-line difference vs extensible target 5.05 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 34.2 deg
bones=24 A_tail=0.10L : centre-line difference vs extensible target 0.86 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 12.4 deg
bones=24 A_tail=0.12L : centre-line difference vs extensible target 1.42 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 14.8 deg
bones=24 A_tail=0.20L : centre-line difference vs extensible target 5.09 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 24.2 deg
bones=32 A_tail=0.10L : centre-line difference vs extensible target 0.87 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 9.5 deg
bones=32 A_tail=0.12L : centre-line difference vs extensible target 1.44 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 11.3 deg
bones=32 A_tail=0.20L : centre-line difference vs extensible target 5.11 %L (parametrisation difference, not an error) ; chain length = 1.000 L (rigid) ; max per-joint rotation 18.4 deg
```
