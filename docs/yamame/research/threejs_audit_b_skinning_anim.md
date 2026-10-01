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
| 中景（〜100〜200 匹程度） | `SkeletonUtils.clone` で個体複製（geometry・material は共有、skeleton は個体別）。個体ごとに mixer は作らず**1 つの mixer に `clipAction(clip, 個体root)`** | 24 ボーンで CPU は 1 個体あたり約 6〜10 µs/frame（Node 実測 [T]）。支配するのは**描画コール数と影パス**（[R]。skeleton ごとに DataTexture と描画コールが 1 つずつ） | 個体を消すときは `mixer.uncacheRoot()` と `skeleton.dispose()`（§3-12） |
| 遠景・大量 | **InstancedMesh + `morphTexture`（相対モーフ 5〜8 本、重みを個体ごとに毎フレーム書く）** | r186 では **SkinnedMesh を InstancedMesh/BatchedMesh に載せる手段が無い**（§2.7）。morphTexture は 1 描画コール、標準マテリアルのまま影も追従する [S] | 波長・包絡は焼き込み固定。**設計案であり実描画は未検証**（§4） |
| 最終手段 | InstancedMesh + `onBeforeCompile` の頂点シェーダ変形（ボーン無し脊椎スプライン）、または独自のインスタンス・スキニング | 実現可能（§2.7）。ただし法線・影（`customDepthMaterial`/`customDistanceMaterial`）・カリングを全部自前で持つ | 実装コスト大。morph 方式で足りるか先に試す |

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

骨 j のローカル回転角 = `atan(y′(s_j)) − atan(y′(s_{j−1}))`、ただし `y′(s,t) = A′(s)·sin(ks−ωt) + A(s)·k·cos(ks−ωt)`。**回転だけ**で構成するので、ボーン鎖は体長を変えない（単純に y(s) を横ずらしすると、尾端振幅 0.10L で +3.2%、0.12L で +4.5%、0.17L で +8.4% 伸びる: [T] T15）。`A(s)` の定義（片振幅か peak-to-peak か）は `r08_swim_steady.md` でも未確定なので、**値を入れる前に定義を決める**こと（本書は式の形だけを扱う）。

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
bone.quaternion.copy(s.proc).multiply(s.delta);    // (4) 手続きの絶対姿勢 ⊗ δ
```

4. **mixer の Normal ブレンドで weight < 1 のトラックは「現在のボーン値」ではなく「play() の瞬間に保存した original」へ向かって混ざる** [T] T3-b。手続き側の姿勢に向かって混ざることを期待しない。additive も同様に `original ⊗ δ` で、手続き姿勢の上には載らない（B のレシピが必要）。
5. `action.stop()` や、フェードアウトで weight が 0 になったトラックのボーンは **original に戻される**（stop は `restoreOriginalState`: `AnimationMixer.js:171-193`, `PropertyMixer.js:279-286`）[T] T3-c。手続き側が書いた値は、stop した瞬間に original で上書きされる。
6. 休止姿勢を**最初に確定**してから `play()`（`skeleton.pose()` を使うなら play の前）。play 後に手続きで書いた値は original に反映されない [T] T3-b。
7. フェード: `incoming.reset().play(); outgoing.crossFadeTo(incoming, dur, warp)`。**`crossFadeFrom/To` は incoming を `play()` しない**し、フェード後の outgoing は `enabled=false` のまま active リストに残る（`reset()` しないと再利用できない）[T] T9-a/b。

### 1.5 バウンディング／カリング

- **個体の移動・回転・拡縮は、mesh と root ボーンの共通の親 `Group` で行う**。AttachedBindMode では mesh の `matrixWorld` が `bindMatrixInverse` で打ち消されるので（`SkinnedMesh.js:294-296`）、Group を動かせば骨も mesh も一緒に動き、**ローカル空間で計算した boundingSphere が有効なまま**（[T] T13: 回転・拡縮 2 倍・曲げでも世界座標の頂点が球の中に収まる）。**root ボーンを mesh に対して大きく動かさない**（[T] T4-a: root を 500 動かすとキャッシュ球が古く、実体が視錐台内でも描画されない）。
- `SkinnedMesh.boundingSphere` は**初回のカリング判定で 1 回だけ自動計算してキャッシュ**される（`Frustum.js:146-152`）。そのとき姿勢が波の途中だと球が偏る。**ロード時（休止姿勢・`updateMatrixWorld(true)` 後）に 1 度 `computeBoundingSphere()` し、`radius` に最大横振幅＋頭の振れ分の余裕を足して固定**する。クローンは球を複製する（`SkinnedMesh.js:171-172`）ので、**クローン前に計算**する。
- **毎フレーム `computeBoundingSphere()` はしない**: 全頂点を CPU スキニングする。5k 頂点で 2.1 ms、20k で 7.5 ms、100k で 37 ms（Node 実測 [T] T4-c）。JSDoc の「毎フレーム再計算すべき」（`SkinnedMesh.js:104-107,134-137`）は個体数が多いと非現実的。
- 余裕の目安: 強く曲げた鎖（各関節 0〜0.6 rad）で休止姿勢の球から最大 2.25 はみ出した（体長 5、休止球半径 2.62: [T] T13）。実際の泳ぎ（尾端振幅 ≲ 0.12〜0.2L）での必要余白は未計測（§4）。
- `frustumCulled = false` にすれば常に描画（`WebGLRenderer.js:1914`, 影は `WebGLShadowMap.js:526`）。個体が少なければ最も安全だが、画面外の個体も skeleton 更新と描画コールが走る。
- 影パスも同じ球で判定する（`WebGLShadowMap.js:526`）ので、球がずれると**影だけ消える**。

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
| WebGPU 経路: ボーン行列が uniform buffer 上限に収まれば uniform buffer、超えれば bone texture。属性は `skinIndex: uvec4` | `src/nodes/accessors/Skinning.js:57-88, 234` | [S]（実行はしていない） |

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
| WebGPU 経路は `OnObjectUpdate` 内で `frameId` ごとに 1 回 `skeleton.update()` | `Skinning.js:244-265` | [S] |

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
| `raycast` も球 → 箱 → CPU スキニングで全三角形判定（重い） | `SkinnedMesh.js:178-211` | [S] |
| CPU コスト（Node）: computeBoundingSphere 5k=2.1ms / 20k=7.5ms / 100k=37ms | §5 T4-c | [T] |
| InstancedMesh も境界は**初回に 1 回だけ**計算（`Frustum.js:150`）。インスタンスを動かしても古いまま。`computeBoundingSphere()` は 2,000 個で約 0.14 ms、10,000 個で約 0.65 ms | `InstancedMesh.js:100,151-180`, [T] T17 | [S][T] |

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
| 適用順: morph → skin（`begin_vertex` → `morphtarget_vertex` → `skinning_vertex`、法線は `morphnormal` → `skinnormal`） | `meshphysical.glsl.js:34-42` | [S] |
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
| `Skeleton.clone()` は**骨を複製しない**（同じ `Bone` を指す新 Skeleton）。`SkeletonUtils.clone` はこれを使ったうえで骨を差し替えている | [S][T] T5-d, `Skeleton.js:232-236`, `SkeletonUtils.js:405-413` |
| クリップは複数 mixer／複数 root で共有できる | [T] T5-c/e |

**ボーン無し脊椎スプライン変形（頂点シェーダ）の実現性**

- **実現可能（[R]、実行は未）**。差し込み位置は `meshphysical.glsl.js:27-47` の並びで決まる: **法線は `beginnormal_vertex` の直後**（`defaultnormal_vertex` で `transformedNormal` を作る前）、**位置は `begin_vertex` の直後**（`project_vertex` の前）。`project_vertex` は `instanceMatrix` → `modelViewMatrix` の順に掛ける（`project_vertex.glsl.js`）ので、変形はローカル空間で終える。
- 個体ごとの位相・振幅は **`InstancedBufferAttribute` をジオメトリに足す**（`WebGLBindingStates.js:405-411` が `meshPerAttribute` を除数にする）。ユニフォームは描画単位でしか持てない。
- `onBeforeCompile` を使うときは **`customProgramCacheKey()` を必ず定義**する。既定は `onBeforeCompile.toString()`（`Material.js:544-548`）で、**ソース文字列が同じクロージャは同じプログラムとして共有**されてしまう。
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
8. **LoopRepeat は `time == duration` で 0 に折り返す** [T] T11。周期クリップは最後のキー＝最初のキーにする。0.5 秒時点で見たいなら 0.5 を渡す。
9. **`makeClipAdditive` は引数のクリップを破壊的に変更**する（`AnimationUtils.js:380`）。元のクリップが要るなら先に `clip.clone()`（`AnimationClip.js:381`）。
10. **初回カリングで姿勢が焼き込まれる**: `boundingSphere` は最初の判定時の姿勢で計算（`Frustum.js:150`）。休止姿勢で先に計算・固定する（§1.5）。
11. **影パスの二重更新と不規則な更新**: `info.render.frame++`（`WebGLRenderer.js:1729`）の**前**に `projectObject`、**後**に影パスがあるため、影を落とす SkinnedMesh は毎回 `skeleton.update()` が 2 回呼ばれうる。さらに、影パスが一部の render() でしか走らない構成（`shadowMap.autoUpdate=false` + `needsUpdate` を時々立てる）では、**次の render() の `projectObject` が「影パスで更新済み」と見なして更新を飛ばし、1 フレーム古い骨行列で描画**しうる（`WebGLObjects` を模擬した [T] T7-C。実レンダラでの再現は未確認）。→ 影を間引くなら、自前で `updateMatrixWorld(true)` → `skeleton.update()` を毎フレーム呼べば安全（二重計算は軽い）。
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
| t4 | バウンディング | root 骨移動でキャッシュ球が古い／5k=2.1ms・20k=7.5ms・100k=37ms |
| t5 | clone | 素の clone は skeleton 共有、`SkeletonUtils.clone` は個別、geometry/material/boneInverses 共有、1 mixer × 複数 root |
| t7 | `WebGLObjects` のモック | 影パスあり＝毎 render 2 回→定常 1 回、不規則な影で 1 フレーム古い骨行列の経路 |
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

> CPU 時間は実行ごとに多少ばらつく（JIT・負荷）。表は目安で、判断に使った量は桁（µs〜ms）である。

---

## 付録 A: テストスクリプト全文

（`…/scratchpad/three/audit_b/`。`SRC` は three@0.186.1 の展開先。`common.mjs` が三者共通。）
