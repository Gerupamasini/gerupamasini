# Three.js r186 監査 C: GLB／ローダ／オフライン制作ツールチェーン（GLTFLoader・GLTFExporter・KTX2/Draco/Meshopt・glTF-Transform）

> 担当: 「GLB／ローダ／オフラインツールチェーン」。対象は **three@0.186.1**（`REVISION` = 186）と **@types/three@0.186.0**。
> 方針: 記憶ではなく実ソースを grep/Read し、可能なものは **npm install して Node 22 とヘッドレス Chromium（WebGL2 / SwiftShader）で実際に動かして**確かめた。主張には `ファイル:行` を付ける。
>
> **この文書の読み方**
> - 根拠の種別: **[S]** ソースの該当行を直接読んで確認 / **[T]** 実際に実行して確認（Node 22.22.0、または three r186 を載せたヘッドレス Chromium 上）/ **[R]** ソースからの推論（実行していない）/ **[U]** 未確認。
> - `GLTFLoader.js:123` のようにパスを省略したものは `three-0.186.1/package/examples/jsm/loaders/` 配下。`src/…` は `three-0.186.1/package/src/…`。`utils/…`・`exporters/…`・`libs/…` は `examples/jsm/` 配下。
> - **GPU が無い環境**（CPU ラスタライザ SwiftShader）で作業した。描画の見た目の最終判断、GPU 時間、実機（モバイル／Mac／Windows）の KTX2 変換先は測っていない。ms は 4 vCPU Xeon 2.1GHz の値で、実機の値ではない。
> - 他の監査との関係: スキニング／mixer／モーフの実行時の詳細は `threejs_audit_b_skinning_anim.md`（**B**）、マテリアル／色空間は `threejs_audit_a_materials.md`（**A**）、LOD／性能／ヘッドレス描画は `threejs_audit_d_perf_lod_headless.md`（**D**）。本書は「GLB を作る側（Node）と読む側（GLTFLoader 周辺）」の接合部を扱い、重複は参照に留める。
> - 検証用ファイル一式は `…/scratchpad/toolchain_test/`（`poc/` 配下にスクリプト、`out/` に成果物、`poc/run_all.sh` で全再実行）。**scratchpad はセッション限りなので、再現に必要な要点は §5 に書き写してある**。リポジトリには本書以外を書いていない。

---

## 1. 結論（実装方針に直結する推奨）

### 1.1 推奨一覧

| # | 推奨 | 理由（要点） | 詳細 |
|---|---|---|---|
| 1 | **「手続き的ロフト → スキンウェイト → モーフ → テクスチャ → GLB → ブラウザ読込」は Node.js だけで完結する**。生成と GLB 出力は `@gltf-transform/core` 4.5.1 の `Document`/`NodeIO`、検証は Node + npm だけで得られるヘッドレス Chromium | 三角形 384・頂点 236・骨 3・モーフ 1・PBR（clearcoat+iridescence+ior+specular+texture_transform）・テクスチャ 3 枚の PoC を **22 変種**（`out/poc_*.glb`）作り、全て r186 `GLTFLoader` で読み込めた。スキン＋モーフの変形結果は **glTF 仕様どおりの CPU 計算と 0.000 mm 差**（float）／量子化でも ≤0.04 mm | §2.9, §5 |
| 2 | **KTX2 は npm 経由で作れる**。(A) `ktx2tools@1.1.0`（非公式再パッケージ。KTX-Software 4.4.0 の `ktx`/`toktx` Linux バイナリ同梱）＋ `gltf-transform etc1s/uastc` CLI、または (B) `ktx2-encoder@0.6.0`（Basis エンコーダ WASM。プロセス内）。**スロット（色空間）を意識して符号化する**: CLI は自動、(B) は自前で `isSetKTX2SRGBTransferFunc` を切り替える | CLI は baseColor=sRGB／法線・ORM=linear を正しくタグ付け [T]。(B) の既定／同梱 transform は**全テクスチャを sRGB 扱い**にし、法線・ORM が誤解釈される（描画 PSNR 33.05 dB 対 47.28 dB） | §2.10, §3-2 |
| 3 | **質の階層**: 近景（主役）= **UASTC（全スロット）** か「baseColor=ETC1S＋法線/ORM=UASTC」、遠景・小物 = **ETC1S 全部**。`--level 4` は使わない（3 枚 512² で 72 s） | 3×512²: PNG 738.8 KB → UASTC 447 KB（描画 PSNR 55.7 dB）／混成 430 KB（47.0 dB）／ETC1S 81 KB（45.0 dB）。UASTC level 2＋zstd18 は 1.5 s、ETC1S q128 は 1.0 s（CLI 壁時計） | §2.10 |
| 4 | **ジオメトリ圧縮は、この規模（数百〜数千三角形）ではほぼ効かない**。使うなら **Meshopt（`EXT_meshopt_compression`）で POSITION は float のまま**（§1.3）。**Draco は不採用** | 非画像部（頂点＋IBM＋アニメ）は plain 21.7 KB → meshopt 11.2 KB → draco 9.3 KB。差は数 KB。Draco は decoder が wasm 192〜286 KB＋JS 58 KB（gzip で wasm 63 KB）で頂点順も変わる。Meshopt decoder は JS 1 本 29 KB（gzip 7.7 KB） | §2.3, §2.9 |
| 5 | **スキンメッシュの POSITION を `quantize`/`meshopt()` の既定で量子化しない**。量子化すると IBM に逆量子化行列が混ざり、`skeleton.pose()` が骨を壊す（本 PoC で最大 1.0 m、gltfpack 出力では 16.6 km ずれる） | 変形そのものは正しい（≤0.04 mm）が、`Skeleton.pose()`（`Skeleton.js:153-166`）は `boneInverses` の逆行列で骨を置くため。float POSITION の meshopt 変種は pose() 差 0 [T] | §1.3, §3-1 |
| 6 | **GLB は `NodeIO.setVertexLayout(VertexLayout.SEPARATE)` で書く**（既定は INTERLEAVED）。**かつ、ランタイムで `BufferGeometryUtils` を呼ばない設計にする**（タンジェント生成・溶接はオフラインで済ませる） | 既定のインターリーブ GLB を `GLTFLoader` で読むと全属性が `InterleavedBufferAttribute` になり、`mergeVertices` は `TypeError`（§3-3）。`deinterleaveGeometry` は `geometry.morphTargets`（存在しないプロパティ）を見ており morphAttributes を処理しない。meshopt の NORMAL（i8 正規化・stride 4）は SEPARATE でもインターリーブになる | §3-3 |
| 7 | **法線マップがあるなら、タンジェントはオフラインで焼く**: `unweld() → tangents({generateTangents}) → weld()`（`mikktspace@1.1.1`）。三の `computeMikkTSpaceTangents` と**完全一致**（最大差 0） | タンジェントがあると `GLTFLoader` はマテリアルを複製せず `normalScale.y` も反転しない（`GLTFLoader.js:3498,3564`）。頂点数は 236 のまま戻る（weld） | §2.8, §3-6, §3-7 |
| 8 | **`GLTFExporter` は制作パイプラインに使わない**（デバッグ・往復確認用）。圧縮拡張（meshopt/draco/KTX2/AVIF）を書けず、`KHR_materials_diffuse_transmission` は消え、KTX2 は PNG に展開され（ORM が複製されて画像 3→4 枚）、モーフは POSITION/NORMAL のみ | 制作は常に glTF-Transform。ただし clearcoat/iridescence/sheen/transmission/volume/anisotropy/ior/specular/emissive_strength/dispersion/texture_transform/unlit の往復は [T] で保たれた | §2.7, §3-12 |
| 9 | **読み込み側は `GLTFLoader` 1 つ＋ `KTX2Loader` 1 つ＋ `MeshoptDecoder`**。`ktx2.detectSupport(renderer)` を**ロード前**に必ず呼ぶ。個体の複製は `SkeletonUtils.clone`（geometry・material 共有、skeleton・モーフ重みは個体別）。別ミキサー・別時刻で独立に動く [T] | `KTX2Loader.js:379,411` は未初期化で throw。複数インスタンスは警告（`:351`） | §1.4, §2.2 |
| 10 | **gltfpack（npm 版）は「メッシュの meshopt 圧縮だけ」に限って使える**。ただし `-af 0` を付ける（付けないと 30 Hz に再サンプルされ、キーフレームの尖りが 4.9 mm 削れる）。テクスチャ圧縮（`-tc`）は npm 版では不可。ノード構造が変わる（メッシュノードが無名の子に移り、アニメのトラック名が `mesh_0.…` になる） | 制作パイプラインの本線は glTF-Transform に統一する方が予測しやすい | §2.11, §3-10 |
| 11 | **LOD はオフラインで作れる**: `weld() → simplify({simplifier: MeshoptSimplifier, ratio})`。頂点は元の部分集合として残り、**スキンウェイト・モーフも保たれる**（1,536 → 384 三角形、変形誤差 0） | 頂点を新規生成しないため。ただし LOD ごとに同じ骨・同じ IBM を使うこと（D の `LOD` 方針に接続） | §2.9 |
| 12 | **ブラウザ検証は `playwright-core` ＋ 実行ファイル指定**。(a) プリインストール `/opt/pw-browsers/chromium`（141）、または (b) npm だけで得られる `@sparticuz/chromium@153`（展開先 `TMPDIR`）。`playwright-core install chromium` は CDN 遮断で失敗する。**(b) は同梱の既定引数（`--single-process` 含む）だと本検証ハーネスが 300 s 経っても終わらなかった**ので、通常の引数（`--use-angle=swiftshader` 等）で起動する | WebGL2 は SwiftShader 上で動く（`ANGLE (Google, Vulkan 1.3.0 (SwiftShader …))`）。描画は決定論的で PSNR 比較に使える（D と整合） | §2.12, §5 |

### 1.2 オフラインで GLB を作る標準手順（本検証で動いたもの）

```
[Node] 手続き生成（ロフト頂点・法線・UV・JOINTS_0(Uint16)/WEIGHTS_0(Float32)・モーフ差分）
  → @gltf-transform/core: Document に Mesh/Primitive/Target(モーフ)/Skin(IBM)/Node(骨)/Animation/Material を構築
  → doc.transform( unweld(), tangents({generateTangents}), weld() )                 // 法線マップがある場合
  → [任意] doc.transform( reorder({encoder}), quantize({pattern: POSITION を含まない}) ) + EXTMeshoptCompression(FILTER) + KHRMeshQuantization
  → NodeIO.setVertexLayout(SEPARATE).write('fish.glb')                              // PNG テクスチャのまま
  → gltf-transform etc1s|uastc fish.glb out.glb --slots "…"                         // KTX2 化（`ktx` 4.4 を PATH に）
  → gltf-validator（エラー 0 を確認。KTX2/AVIF/WebP は「未対応拡張」警告が出るのが正）
  → [検証] playwright-core → three r186 GLTFLoader → AnimationMixer を進めて getVertexPosition を仕様計算と比較
```

### 1.3 スキン付きメッシュを meshopt で圧縮するときの具体形（POSITION を float に残す）

```js
// 実測 OK: out/poc_meshopt_floatpos*.glb。pose() 差 0、変形誤差 ≤0.031 mm、非画像部 13.0 KB（plain 21.7 KB）
await doc.transform(
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ pattern: /^(TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/, patternTargets: /^(NORMAL|TANGENT)(_\d+)?$/, quantizeNormal: 8, quantizeTexcoord: 12 }),
);
doc.createExtension(KHRMeshQuantization).setRequired(true);    // NORMAL が i8 正規化になるので必須（付けないと validator が MESH_PRIMITIVE_ATTRIBUTES_ACCESSOR_INVALID_FORMAT ×2）
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await new NodeIO().setVertexLayout(VertexLayout.SEPARATE).registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write('fish.glb', doc);
```

`meshopt({encoder, level})`（既定 `high`）は内部で `reorder` ＋ `quantize`（POSITION 14bit）を呼ぶため、**スキン付きでは上の手書き形を使う**（`functions` の `meshopt` 実装: `@gltf-transform/functions/dist/index.js:4380-4408`）。

### 1.4 ランタイム側の最小構成

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
// Draco を使う場合のみ: import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const renderer = new THREE.WebGLRenderer(/* … */);                        // detectSupport は renderer 生成後
const ktx2 = new KTX2Loader().setTranscoderPath('/vendor/basis/').detectSupport(renderer);   // 1 インスタンスだけ。省略時は import.meta.url 相対（KTX2Loader.js:106-107,296-310）
const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
// const draco = new DRACOLoader().setDecoderPath('/vendor/draco/gltf/'); loader.setDRACOLoader(draco);
const gltf = await loader.loadAsync('fish.glb');
const skinned = gltf.scene.getObjectByProperty('isSkinnedMesh', true);
```

---

## 2. 確認事項と根拠（ファイル:行）

### 2.1 GLTFLoader が扱う拡張（`EXTENSIONS` 表と登録）

`GLTFLoader.js:629-653` の `EXTENSIONS` ［S］:

| 拡張 | 実装クラス／行 | 登録方式 | 実測（[T]） |
|---|---|---|---|
| `KHR_binary_glTF` | `:1875` | 内部 | — |
| `KHR_draco_mesh_compression` | `:1945`（`DRACOLoader` 必須: `:1951`） | `parse` の switch（`:521-523`）。`dracoLoader` 無しで拡張があると**例外** | 読込 OK、誤差 0.012 mm |
| `KHR_lights_punctual` | `:662` | プラグイン | ソースのみ |
| `KHR_materials_clearcoat` | `:889` | プラグイン（`:144-` の `register`） | `clearcoat` 等に反映 |
| `KHR_materials_dispersion` | `:965` | 〃 | `dispersion=0.5` |
| `KHR_materials_ior` | `:1252` | 〃 | `ior=1.7` |
| `KHR_materials_sheen` | `:1083` | 〃 | `sheenColor` 反映 |
| `KHR_materials_specular` | `:1292` | 〃 | `specularIntensity/Color` |
| `KHR_materials_transmission` | `:1151` | 〃 | 反映 |
| `KHR_materials_iridescence` | `:1003`（厚さ既定 [100,400]: `:1046-1060`） | 〃 | 反映（下の注） |
| `KHR_materials_anisotropy` | `:1394` | 〃 | `anisotropy=0.8, rotation=0.5` |
| `KHR_materials_unlit` | `:800` | `parse` の switch（`:517-519`） | `MeshBasicMaterial` になる |
| `KHR_materials_volume` | `:1201` | プラグイン | `thickness/attenuationDistance` |
| `KHR_materials_emissive_strength` | `:855` | 〃 | `emissiveIntensity=4` |
| `EXT_materials_bump` | `:1348` | 〃 | ソースのみ（glTF-Transform に該当クラスが無く生成できず） |
| `KHR_texture_basisu` | `:1450-1493`（`KTX2Loader` 必須: 無ければ required のとき throw `:1479`、optional ならフォールバック画像） | 〃 | 読込 OK |
| `EXT_texture_webp` / `EXT_texture_avif` | `:1503` / `:1550` | 〃 | 読込 OK（Chromium） |
| `KHR_texture_transform` | `:2030`（適用は `assignTexture` `:3455-3465`） | `parse` の switch（`:525-527`） | `repeat/offset/rotation` に反映 |
| `KHR_mesh_quantization` | `:2112`（印だけのクラス。正規化アクセサは `loadAccessor`、境界は `computeBounds` `:4734`） | switch（`:529-531`） | 読込 OK |
| `EXT_meshopt_compression` / `KHR_meshopt_compression` | `:1597`（`decoder.supported` を見る `:1618`、無ければ required で throw `:1622`） | プラグイン（両名で登録） | 読込 OK |
| `EXT_mesh_gpu_instancing` | `:1683` | プラグイン | ソースのみ |

- JSDoc の対応リストは `GLTFLoader.js:84-105`。「別途登録するプラグイン」として `KHR_gaussian_splatting`・`KHR_materials_variants`・`MSFT_texture_dds`・`KHR_animation_pointer`・`NEEDLE_progressive` が挙がる（`:107-112`）。
- **`KHR_materials_pbrSpecularGlossiness` と `KHR_materials_diffuse_transmission` は無い**（`EXTENSIONS` に無く、grep 0 件）。未知の拡張は **required なら `console.warn('Unknown extension')` のみ**（`:537`）で読み込みは続き、optional なら黙って無視される。拡張の中身は `material.userData.gltfExtensions` に残る（`addUnknownExtensionsToUserData` `:2337`、材質は `:3742`）。実測: diffuse_transmission の球は `MeshStandardMaterial` ＋ `userData.gltfExtensions` ［T］。spec/gloss は glTF-Transform の `metalRough()` でオフライン変換する。
- iridescence の厚さ: 厚さテクスチャが無いと `iridescenceThicknessMinimum` は効かない（validator が `KHR_MATERIALS_IRIDESCENCE_THICKNESS_RANGE_WITHOUT_TEXTURE` で指摘 ［T］）。three 側は `[min,max]` を保持（`:1052-1060`）。

### 2.2 GLTFLoader への装着 API と挙動

| 事項 | 根拠 |
|---|---|
| `setDRACOLoader` / `setKTX2Loader` / `setMeshoptDecoder` | `GLTFLoader.js:349` / `:363` / `:377`。保持先は `:140-142` |
| `DRACO_GLTF_CONFIG`（glTF 向け decoder の URL 組）は **export されているだけで GLTFLoader は使わない** | `DRACOLoader.js:21-24,772`、`GLTFLoader.js` 内に参照 0 件［S］。glTF 版 decoder を使うなら `setDecoderPath('…/libs/draco/gltf/')` を自分で指定（本検証もそうした） |
| テクスチャは `ImageBitmapLoader` が既定。Safari<17・Firefox<98・`createImageBitmap` 無しのときだけ `TextureLoader` | `GLTFLoader.js:2656-2660`（判定は `:2636-2652`）。JSDoc `:80-82`: **ImageBitmap は GC されず、dispose 時に特別な処理が要る** |
| テクスチャの色空間は**色スロットだけ** `SRGBColorSpace` を明示（`map`・`sheenColorMap`・`specularColorMap`・`emissiveMap`）。法線・ORM・clearcoat 等は**テクスチャローダ／KTX2 の DFD の値がそのまま残る** | `assignTexture(…, SRGBColorSpace)` の呼び出し `:836,1127,1330,3636,3728`、非色は引数なし（`:3645-3646,3693,3709` ほか）。`:3440-3478` |
| サンプラ: `minFilter = WEBGL_FILTERS[sampler.minFilter] \|\| LinearMipmapLinearFilter`、`generateMipmaps = !isCompressedTexture && …`。**KTX2Loader が付けた `minFilter` は上書きされる** | `:3320-3323`。実測: ミップ無し KTX2（`levels=1`）でも `minFilter=1008`（LinearMipmapLinear）になる。**描画は破綻しなかった**（PSNR 44.6 dB。WebGL2 は不変ストレージで完全とみなす）［T］。A の R12/P22（直接 `KTX2Loader` を使う場合）とは別の経路 |
| 法線マップ有無で材質を複製: `geometry.attributes.tangent` が無いと `normalScale.y *= -1` した複製を使う | `:3498-3501,3556-3568`。実測: タンジェント無し `normalScale=[0.8,-0.8]`、有り `[0.8,0.8]` ［T］ |
| `metalnessMap`・`roughnessMap` は同じテクスチャオブジェクトを共有、`aoMap` も（ORM 1 枚方式） | `:3645-3646,3709`。実測 `roughnessMap === metalnessMap` ［T］ |
| スキン: `JOINTS_0`→`skinIndex`、`WEIGHTS_0`→`skinWeight`（`_0` のみ。`JOINTS_1` 等は小文字化されるだけで使われない）、読込直後に `normalizeSkinWeights()`、`mesh.bind(skeleton, identity)` | `:2286-2287`、`:3911-3928`、`:4297`。スキン属性が無いと `Skinning disabled` 警告 `:3916`。`SkinnedMesh` の `bindMatrixInverse` は attached モードで `matrixWorld` の逆行列（**メッシュノードの変換は打ち消される**）`SkinnedMesh.js:294-296` |
| モーフ: POSITION/NORMAL/COLOR_0 のみ。`morphTargetsRelative = true`、重みは `mesh.weights`、名前は `mesh.extras.targetNames`（長さ不一致なら警告して無視） | `GLTFLoader.js:2387-2461,2474-2510`。実測 `morphTargetDictionary={belly:0}` ［T］ |
| スパースアクセサは読込時に密へ展開（GPU 節約にならない） | `:3155-3250` |
| `GLTFLoader.parse` は DOM 無しの Node でも動く（**テクスチャ無し**の GLB に限る）。ジオメトリ・スキン・モーフ・アニメの CI 検査に使える | 実測（`poc/t_interleaved_utils.mjs`）［T］ |

### 2.3 DRACOLoader / Meshopt デコーダ

- `DRACOLoader`: 既定の decoder URL は `import.meta.url` 相対（`DRACOLoader.js:15-19`）。`setDecoderPath(path)`（`:102`）、ワーカー上限 4（`:76`）、`preload()`（`:372`）、`dispose()`（`:504`）。WASM が無い環境で JS 版に落ちる（`:384-410`）が、`path` をオブジェクトで渡すと JS 版は使えず例外（`:392`）。**Draco は頂点順を変える**（実測: `poc_draco.glb` の 3 頂点目が元の 3 頂点目と違う［T］）。モーフターゲットは Draco 化されず通常のアクセサのまま残り、`addMorphTargets` が普通に読む（`float` のまま JSON に出る）［T］。
- Meshopt: `examples/jsm/libs/meshopt_decoder.module.js`（meshoptimizer **1.1** ビルド、ヘッダ記載）。`MeshoptDecoder.supported`（WASM 可否）と `decodeGltfBufferAsync`（`GLTFLoader.js:1643`）を使う。**npm の `meshoptimizer@1.3.0` のエンコーダで作った GLB を three 同梱 1.1 のデコーダが読めた** ［T］（メッシュ頂点・アニメーション）。フィルタ（OCTAHEDRAL/QUATERNION/EXPONENTIAL）込みで動作。
- スキン・モーフとの互換: Meshopt は JOINTS（`u8`）・WEIGHTS（`u8` 正規化）・モーフ差分（`i16` 正規化）・アニメのクォータニオン（i16 正規化）まで圧縮し、`GLTFLoader` はそのまま読む ［T］。Draco は JOINTS/WEIGHTS を一般属性として圧縮（読込 OK）、モーフは対象外。

### 2.4 KTX2Loader

| 事項 | 根拠 |
|---|---|
| `detectSupport(renderer)` 必須。未呼出で `load`/`parse` すると throw | `KTX2Loader.js:230,379,411` |
| 検出した拡張で変換先を選ぶ。UASTC: ASTC > BC7 > ETC2 > BC1/3 …。**ETC1S は ASTC を使わない**（優先度 `Infinity`）: ETC2 > ETC1 > BC7 > BC1 > PVRTC。最後の保険に RGBA32 | `:775-870`（ASTC `:800`、RGBA32 `:868`） |
| **Linux 上の Chromium で ASTC・ETC2・BPTC・DXT が全部あれば ASTC/ETC1/ETC2 を無効化**（Mesa の偽装拡張対策）→ BC7 になる | `:260-269`。実測: SwiftShader（Linux）で ETC1S も UASTC も **`RGBA_BPTC_Format`(36492 = BC7)** に変換された ［T］。**VRAM は ETC1S でも UASTC でも同じ（1 B/px）**で、ETC1S が節約するのは転送量だけ |
| ミップの 4 の倍数警告 | `:726,737,738`。ミップ無しは `minFilter=Linear`（`:453`。ただし GLTFLoader 経由では上書き: §2.2） |
| 色空間は DFD から（BT.709+sRGB→`SRGBColorSpace`、BT.709+linear→`LinearSRGBColorSpace`、primaries 未指定→`NoColorSpace`） | `:1251-1275`（`texture.colorSpace` 設定 `:458`）。実測は §2.10 の表 |
| ワーカー＋WASM（トランスコーダ `basis_transcoder.wasm` 527 KB／gzip 245 KB ＋ JS 57 KB）。`transcoderPath` が空なら `import.meta.url` 相対 | `:106-107,296-310`。インスタンスを複数作ると警告 `:351`、`dispose()` `:512` |
| `ASTC HDR`/`BC6H`（UASTC HDR）にも対応（今回は未使用） | `:480-490,785-800` |

### 2.5 GLTFExporter

- **登録済みプラグイン（`GLTFExporter.js:121-205`）**: lights_punctual、materials: unlit・transmission・volume・ior・specular・clearcoat・dispersion・iridescence・sheen・**anisotropy**（JSDoc の一覧 `:74-96` には載っていないが登録され動作した ［T］）・emissive_strength・EXT_materials_bump、EXT_mesh_gpu_instancing。ほかに本体が `KHR_texture_transform`（`:903-940`。**offset/rotation/repeat のいずれかが既定値でないときだけ**書く）、`KHR_mesh_quantization`（量子化型の属性が現れたら自動で used+required: `:2190-2245`）、`EXT_texture_webp`（`:1603-1608`、required）。
- **書けないもの**: `KHR_draco_mesh_compression`、`EXT_meshopt_compression`、`KHR_texture_basisu`、`EXT_texture_avif`、`KHR_materials_diffuse_transmission`（実測で落ちる）。
- オプション既定: `binary:false, trs:false, onlyVisible:true, maxTextureSize:Infinity, animations:[]`（`:648-657`）。**`animations` が非空だと `trs` が強制 true**（`:659-664`）。
- スキン: IBM は `boneInverse × bindMatrix`（`:2435`）、`skeleton` は `bones[0]`（`:2423,2444`）。
- モーフ: **POSITION と NORMAL のみ**（他は警告 `:2025`）、絶対値モーフは相対化して書く（`:2050-2072`）、重みは**書出し時点の値**、名前は `extras.targetNames`（`:2089`）。実測: 元の `weights:[0]` が書出し時の `[1]` に変わった ［T］。モーフ用キャッシュは書込みキー（baseAttribute）と読出しキー（morph attribute）が違うため効かない（`:2062-2072`）［S］。
- `JOINTS_0` が Uint8/16 以外なら Uint16 に変換（`:1962`）、Uint32/Int32 は float に変換（`:1967`）。
- 圧縮テクスチャ（`CompressedTexture`）は `textureUtils.decompress` で PNG に展開して書く（`:1588,1108`）。`textureUtils` 未設定で throw。`WebGLTextureUtils.decompress(texture, max, renderer)` は **renderer を渡さないと内部で新しい WebGLRenderer を作る**（`utils/WebGLTextureUtils.js:34-80`）ため、`{decompress:(t,m)=>WebGLTextureUtils.decompress(t,m,renderer)}` を注入した。
- 実測の往復（`poc_plain` → ロード → エクスポート → glTF-Transform で読み直し）: ノードは `Scene > [Armature>spine0>spine1>spine2, Body(mesh+skin)]`、スキン・モーフ・アニメ（`rotation`×3、`weights`）・材質拡張（ior/specular/clearcoat/iridescence）が保たれ、validator はエラー 0（`NODE_SKINNED_MESH_NON_ROOT` 警告のみ）。量子化 GLB のエクスポートでは `KHR_mesh_quantization` が付いて i16/i8 のまま出る（`Creating normalized normal attribute` 警告）。

### 2.6 Node で動くか・何が動くか（要約）

三つの層のうち、**GLB を作る層は全て Node で動く**（§2.9 の表）。**GLB を読む層**は DOM が要る（`ImageBitmap`・`Worker`・WebGL）ため、検証は（1）テクスチャ無しの GLB を Node の `GLTFLoader.parse` で、（2）完全版をヘッドレス Chromium で行った。

### 2.7 three のユーティリティ（`examples/jsm/utils`）で使えるもの

| 関数 | 位置 | 評価 |
|---|---|---|
| `SkeletonUtils.clone(source)` | `SkeletonUtils.js:392-430` | **使える**。骨・スケルトンを複製し geometry/material は共有、`bindMatrix` を引き継ぐ。実測: 別ミキサー・別時刻（t=0.5）で元（t=0.25）と独立に変形（最大離隔 35.6 mm）、モーフ重み配列も別、期待値との誤差は plain 0／meshopt 0.039 mm ［T］ |
| `SkeletonUtils.retarget` / `retargetClip` | `:39`, `:226` | 今回は未検証［U］（別骨格へ姿勢を写す用） |
| `BufferGeometryUtils.computeMikkTSpaceTangents(geometry, MikkTSpace, negateSign=true)` | `BufferGeometryUtils.js:38-125` | **使える**（オフライン推奨）。出力は**非インデックス化**される（236→1152 頂点）が、**スキン属性・モーフ属性は保たれ**（`toNonIndexed` がモーフも処理）、`mergeVertices` で 236 に戻り、モーフ差分も一致（不一致 0）［T］。`negateSign=true` は glTF 向け（`w` を反転）。glTF-Transform `tangents()` の結果と最大差 0 ［T］ |
| 〃 引数の `MikkTSpace` | `:38-48` | 三同梱 `libs/mikktspace.module.js`（`isReady`/`ready`/`generateTangents`）なら `await MikkTSpace.ready` で動く。**JSDoc は npm `mikktspace` も可と書くが、npm 1.1.1 の名前空間を直接渡すと `Initialized MikkTSpace library required` で throw**（`isReady` が無い）［T］。`{ isReady: true, generateTangents }` で包めば動く |
| `BufferGeometryUtils.mergeVertices(geometry, tolerance)` | `:643-755` | 条件付き。**モーフ属性を一致判定のハッシュに含めない**（`:703-713` は `geometry.attributes` のみ）ので、基準属性が同じでモーフ差分が違う 2 頂点を**誤統合**する（実測: 差分 +0.5 と −0.5 の 2 頂点が 1 つにまとまり両方 +0.5）［T］。**インターリーブ属性で throw**（§3-3） |
| `deinterleaveGeometry` | `:569-596` | **モーフ未対応**（`:572` が存在しない `geometry.morphTargets` を見る）［S］。実測でインターリーブ GLB に対し `mergeVertices` 前に呼んでも失敗［T］ |
| `mergeGeometries(geometries, useGroups)` | `:133-327` | スキン属性は普通の属性として結合。`morphTargetsRelative`・morphAttributes の一貫性を検査して不一致なら `null`（`:193,198-213`）。**複数 SkinnedMesh の結合ではボーンインデックスの再割当ては行わない**［R］（未実行） |
| `computeMorphedAttributes(object)` | `:924-1000` | 姿勢の焼き込みに使える（B に詳細） |
| `toCreasedNormals` / `mergeGroups` / `toTrianglesDrawMode` | `:1315`, `:1204`, `:810` | 今回は未検証［U］ |
| `GeometryCompressionUtils`（`compressNormals/Positions/Uvs`） | `:21,131,172` | スキン対応の記述なし。専用シェーダ修正を伴う旧式の方式［R］。**不採用**（glTF-Transform の quantize のほうが標準） |
| 同梱 `libs/meshopt_simplifier.module.js` / `meshopt_clusterizer.module.js` | `libs/` | ランタイム LOD 生成に使えるが、オフラインで `simplify` する方が単純 |

### 2.8 タンジェント周りの確認

- `tangents({generateTangents})` は**インデックス無しのプリミティブしか処理しない**（`@gltf-transform/functions/dist/index.js:5492` で `must be unwelded` 警告して skip）→ `unweld() → tangents() → weld()`。`tangents()` は `w *= -1` を内部で行う（`:5462`）。
- 実測（`poc_tangents.glb`）: 頂点 236（weld 後）、TANGENT あり、validator 警告 0、描画は無タンジェント版と PSNR 55.2 dB（同等）。三の `computeMikkTSpaceTangents` 結果と最大差 0 ［T］。

### 2.9 npm パッケージ別の (a)インストール／(b)実行 結果

作業ディレクトリ `…/scratchpad/toolchain_test/`（Node v22.22.0 / x64 linux）。**クリーンな空ディレクトリで `npm install` 一発（19 s、234 パッケージ、node_modules 242 MB）** も確認済み（§5.1）。

| パッケージ | 版 | (a) install | (b) 実行した内容と結果 |
|---|---|---|---|
| `@gltf-transform/core` | 4.5.1 | OK | `Document` 構築、`NodeIO` の書出し／読込、`setVertexLayout`。PoC 全体の土台 |
| `@gltf-transform/extensions` | 4.5.1 | OK | `ALL_EXTENSIONS`（30 個）。clearcoat/iridescence/ior/specular/sheen/transmission/volume/anisotropy/emissive_strength/dispersion/unlit/diffuse_transmission/texture_transform/webp/avif/basisu/meshopt/draco/quantization を生成・往復 |
| `@gltf-transform/functions` | 4.5.1 | OK | `unweld/weld/tangents/reorder/quantize/meshopt/draco/textureCompress/simplify/prune` を実行（84 関数が export） |
| `@gltf-transform/cli` | 4.5.1 | OK | `gltf-transform etc1s/uastc`（`ktx` 4.4 が PATH に要る。`toktx` は不要）を実行。**`ktx` 無しだと `Command failed: command -v ktx`** |
| `meshoptimizer` | 1.3.0 | OK | エンコーダ／デコーダ往復一致、`MeshoptSimplifier`（800→199 三角形）、`MeshoptTangents` の API 有り（未使用）。`gltf-transform` の cli は 1.2.0 を入れ子で使う（共存可） |
| `pngjs` | 7.0.0 | OK | 法線マップ・ORM の PNG 書出し／読込 |
| `jpeg-js` | 0.4.4 | OK | encode/decode 往復（単体。パイプラインでは `sharp` を使用） |
| `@napi-rs/canvas` | 1.0.9 | OK | ベースカラー描画、`toBuffer` で PNG/JPEG/WebP/**AVIF** すべて可。プリビルドは npm に同梱（`@napi-rs/canvas-linux-x64-gnu`）。**推奨** |
| `canvas`（node-canvas） | 3.2.3 | OK | 描画・PNG/JPEG 可。プリビルド取得（install 2〜3 s）に成功。GitHub 等の取得が遮断された環境では `node-gyp` ビルドに落ちて失敗しうる［R］ |
| `sharp` | 0.35.5（libvips 8.18.7） | OK | WebP/AVIF/JPEG 変換、`textureCompress` の encoder、KTX2 エンコーダへの `imageDecoder` |
| `three` | 0.186.1 | OK | Node で import、`SkinnedMesh`/`Skeleton`、`BufferGeometryUtils`、`GLTFLoader.parse`（テクスチャ無し） |
| `draco3dgltf` | 1.5.7 | OK | `createEncoderModule/DecoderModule`、`draco()` で GLB 出力→ブラウザ読込 OK |
| `ktx-parse` | 2.0.0（gltf-transform 内部は 1.1.0） | OK | KTX2 の DFD／レベル／超圧縮の検査（`poc/inspect_ktx2.mjs`）|
| `ktx2-encoder` | 0.6.0 | OK | UASTC/ETC1S の KTX2 を Node で生成（WASM 3.3 MB、3 枚で 6.3 s）。`ktx2-encoder/gltf-transform` の `ktx2()` もあるが色空間が全 sRGB（§3-2） |
| `mikktspace` | 1.1.1 | OK | `generateTangents`（`tangents()` に渡す）。三の同梱版と同一出力 |
| `gltf-validator` | 2.0.0-dev.3.10 | OK | `validateBytes`。KTX2/AVIF/WebP の画像は「未対応拡張」「画像未認識」警告になる（エラーではない） |
| `gltfpack`（npm） | 1.3.0 | OK | `-cc` は OK。**`-tc` は「BasisU 無しでビルドされている」で失敗** |
| `playwright-core` | 1.63.0 | OK | `executablePath` 指定で Chromium 141 起動。`install chromium` は CDN 遮断で失敗 |
| `@sparticuz/chromium` | 153.0.0 | OK | `executablePath()` で展開（初回 5 s、`TMPDIR` に約 200 MB）、Chromium 153 が WebGL2(SwiftShader) で起動し、本ハーネスの PNG/KTX2 を読めた |
| `ktx2tools`（side） | 1.1.0 | OK（`--ignore-scripts`） | `toktx v4.4.0`、`ktx version v4.4.0` が動く。Linux/Windows のみ、macOS 無し。**非公式**（公開者 1 名） |
| `basis_universal`（side） | 1.16.4-1 | OK（`--ignore-scripts`） | `basisu` Linux バイナリ同梱だが**実行ビットが無い**（`chmod +x` で動く）。非公式 |

### 2.10 PoC 結果（テクスチャ変種）

3 枚の 512²（baseColor sRGB／normal／ORM）。「描画 PSNR」は plain（PNG）に対する同一カメラの SwiftShader 描画 640×360 の PSNR（下限の参考。カメラ距離が遠いと差は小さく出る）。

| 変種 | 総バイト | 画像部 | 必須拡張 | 描画 PSNR | 備考 |
|---|---:|---:|---|---:|---|
| `poc_plain`（PNG） | 764,728 | 738,794 | — | — | baseColor 23.7 KB／normal 511.8 KB／orm 203.4 KB |
| `poc_webp`（sharp q85） | 97,136 | 71,046 | `EXT_texture_webp` | 55.76 dB | GPU には非圧縮で載る（512²＋ミップ ≈1.40 MB/枚） |
| `poc_avif`（sharp q60） | 57,076 | 30,979 | `EXT_texture_avif` | 57.83 dB | 〃。エンコードは遅い［R］ |
| `poc_jpeg_base`（baseColor のみ JPEG q90） | 761,736 | 735,805 | — | 58.80 dB | 画像総量はほぼ減らない（normal が支配） |
| `poc_uastc_cli`（全 UASTC L2+zstd18） | 473,304 | 447,190 | `KHR_texture_basisu` | 55.70 dB | CLI 1.5 s |
| `poc_etc1s_cli`（全 ETC1S q128） | 107,052 | 80,943 | 〃 | 44.98 dB | CLI 1.0 s |
| `poc_ktx2_mixed_cli`（base=ETC1S q160／法線・ORM=UASTC） | 455,912 | 429,796 | 〃 | 46.95 dB | 色が支配的に効く |
| `poc_ktx2_wasm_slotaware`（ktx2-encoder、スロット別） | 494,972 | 468,856 | 〃 | 47.28 dB | 3 枚 6.3 s（WASM、単スレッド） |
| `poc_ktx2_wasm_naive`（同ライブラリの既定） | 511,956 | 485,845 | 〃 | **33.05 dB** | 法線・ORM が sRGB タグ付き |
| `poc_ktx2_nomip`（ミップ無し UASTC） | 416,340 | 390,228 | 〃 | 44.57 dB | 破綻なし（§2.2） |

KTX2 の DFD（`poc/inspect_ktx2.mjs`）［T］:

| ファイル／テクスチャ | モデル | 転送関数 | primaries | 超圧縮 | レベル |
|---|---|---|---|---|---:|
| `uastc_cli`: baseColor / normal / orm | UASTC / UASTC / UASTC | sRGB / linear / linear | BT709 / 未指定 / 未指定 | zstd | 10 |
| `etc1s_cli`: 同 | ETC1S | sRGB / linear / linear | BT709 / 未指定 / 未指定 | basislz | 10 |
| `wasm_slotaware`: 同 | ETC1S / UASTC / UASTC | sRGB / linear / linear | BT709 | basislz / zstd | 10 |
| **`wasm_naive`: 同** | UASTC ×3 | **sRGB ×3** | BT709 | zstd | 10 |

読込後の three 側: 変換先は全て `RGBA_BPTC_Format`(36492)、ミップ 10 段、`map.colorSpace='srgb'`、CLI／slot-aware の非色は `''`／`'srgb-linear'`、**naive は法線・ORM も `'srgb'`** ［T］。

`gltfpack` の KTX2: npm 版は不可。**代替（PNG/WebP/AVIF/JPEG ＋ 実行時圧縮）**: three にランタイム GPU 圧縮（BC7/ASTC エンコード）は無く、`generateMipmaps` による自動ミップだけ。WebP/AVIF は転送量を減らせるが VRAM は非圧縮のまま（512² で 1.40 MB/枚 対 BC7 0.35 MB/枚 = 1/4）。ブラウザ内エンコード（`ktx2-encoder` の web 版）は未検証［U］。

### 2.11 PoC 結果（ジオメトリ変種と変形精度）

「変形最大誤差」は、`AnimationMixer` で t=0, 0.25, 0.5, 0.75（モーフ 0/1/0/1）に合わせ `SkinnedMesh.getVertexPosition`（モーフ＋スキン適用、`applyMatrix4(matrixWorld)` でワールドへ）を、glTF 仕様の LBS をそのまま CPU で書いた期待値（`poc/lib_loft.mjs: expectedSkinned`）と比較した最大値（頂点対応は静止姿勢の位置で照合）。

| 変種 | 総バイト | 非画像部 | 必須拡張 | validator E/W | 変形最大誤差 | `skeleton.pose()` との差 |
|---|---:|---:|---|---|---:|---:|
| `poc_plain` | 764,728 | 21,656 | — | 0/1 | 0 mm | 0 |
| `poc_separate`（SEPARATE 配置） | 765,128 | — | — | 0/1 | 0 mm | 0 |
| `poc_tangents`（unweld→mikk→weld） | 768,580 | 25,432 | — | 0/0 | 0 mm | 0 |
| `poc_quantize`（既定 quantize） | 756,296 | 13,160 | quantization | 0/1 | 0.039 mm | **1,000.27 mm** |
| `poc_meshopt_high`（`meshopt()`） | 749,592 | 11,152 | meshopt+quant | 0/1 | 0.039 mm | **1,000.27 mm** |
| `poc_meshopt_medium` | 750,692 | 13,160 | 〃 | 0/1 | 0.039 mm | 1,000.27 mm |
| `poc_meshopt_floatpos`（§1.3） | 751,668 | 13,040 | 〃 | 0/1 | 0.031 mm | **0** |
| `poc_meshopt_floatpos_sep`（SEPARATE 併用） | 751,668 | 13,040 | 〃 | 0/1 | 0.031 mm | 0（NORMAL だけインターリーブ） |
| `poc_draco` | 752,328 | 9,331 | draco | 0/1 | 0.013 mm | 0 |
| `poc_gltfpack_cc`（`-cc`） | 749,124 | 11,891 | quant+meshopt | 0/3 | **4.916 mm**（30 Hz 再サンプル） | 16,627,983 mm |
| `poc_gltfpack_af0`（`-cc -af 0 -kn -ke`） | 748,900 | 11,137 | 〃 | 0/3 | 0.075 mm | 16,627,983 mm |
| `poc_lod25`（1,536→384 三角形、頂点 219） | 763,352 | 20,296 | — | 0/1 | 0 mm | 0 |

- 量子化版で `skeleton.pose()` が壊れる理由: glTF-Transform の `quantize`（`functions/dist/index.js:3960-4000` の `transformMeshParents`/`transformSkin`）も gltfpack も、逆量子化の平行移動＋拡大を**IBM に掛ける**。IBM が「骨のバインド姿勢の逆行列」でなくなるため、`Skeleton.pose()`（`Skeleton.js:153-166`、`bone.matrixWorld = boneInverse⁻¹`）はバインド姿勢を復元できない。通常の描画・アニメは正しい（誤差は表のとおり）。
- gltfpack の位置は **u16 非正規化＋メッシュノードの scale（1.5e-5）と translation** ＋ IBM にも同じ逆量子化。three は attached モードでメッシュの `matrixWorld` を `bindMatrixInverse` で打ち消す（`SkinnedMesh.js:294-296`）ので正しく描画される。ただし `SkinnedMesh.getVertexPosition`・`computeBoundingBox/Sphere` が返すのは**ノード局所（整数）空間**で、ワールド値には `matrixWorld` を掛ける必要がある（本ハーネスで `applyMatrix4(matrixWorld)` を入れて初めて一致）。

### 2.12 拡張マトリクス（球 12 個の GLB を three で読み → GLTFExporter で書き戻し）［T］

| 拡張 | GLTFLoader | GLTFExporter |
|---|---|---|
| clearcoat／iridescence／sheen／transmission／volume／anisotropy／ior／specular／emissive_strength／dispersion | 値が `MeshPhysicalMaterial` に反映 | 全て書出し（transmission 材には `KHR_materials_volume` も付く） |
| texture_transform（scale[2,3], offset[.1,.2], rot .3） | `repeat/offset/rotation` に反映 | 書出し（非恒等のときだけ） |
| unlit | `MeshBasicMaterial` | `KHR_materials_unlit` |
| diffuse_transmission | **未対応**（`MeshStandardMaterial`＋`userData.gltfExtensions`） | **書かれない** |

validator はエクスポート結果をエラー 0・警告 0（情報 13）。

### 2.13 ヘッドレス実行環境

- プリインストール Chromium 141（`/opt/pw-browsers/chromium` → `chromium-1194`）: WebGL2 可（`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)…`）。拡張: s3tc/s3tc_srgb/bptc/astc/etc/etc1（pvrtc 無し）。`MAX_TEXTURE_SIZE=8192`、`MAX_ARRAY_TEXTURE_LAYERS=2048`、`MAX_VERTEX_UNIFORM_VECTORS=4096`（B の [U] 項目の実測値）。
- npm の `@sparticuz/chromium@153.0.0` でも同じハーネスが通る（通常引数で起動した場合）。**同梱 `args`（`--single-process` 等）を全部渡すとハーネスが固まった**（> 300 s、原因は未調査［U］）。
- Chromium 実行中に `www.google.com:443` への接続が proxy に拒否される記録が出る（処理には影響なし）。

---

## 3. 落とし穴

1. **量子化したスキンメッシュで `skeleton.pose()` が壊れる**（§2.11）。`meshopt()` 既定・`quantize()` 既定・gltfpack 既定はすべて該当。リセット姿勢はノードの TRS（ロード直後に保存）から復元する。POSITION を float に残す変種（§1.3）なら問題なし。`SkinnedMesh.getVertexPosition`／境界計算はメッシュ**ノード局所**の値を返す点にも注意（gltfpack 出力で顕在化）。
2. **KTX2 の色空間（sRGB タグ）をスロットごとに分ける**。`ktx2-encoder` の既定は `isSetKTX2SRGBTransferFunc: true`（`dist/utils.js` の `DefaultOptions`）で、同梱の `ktx2()` transform も全テクスチャに同じ設定を使う。法線・ORM は `isSetKTX2SRGBTransferFunc:false, isPerceptual:false`、法線は `isNormalMap:true` も。three は法線・ORM に色空間を上書きしない（`GLTFLoader.js:3645,3693`）ので、DFD の誤タグがそのまま sRGB デコードになる（PSNR 33.05 dB）。`gltf-transform etc1s/uastc` CLI はスロットから自動で正しく付ける。
3. **インターリーブ配置（glTF-Transform の既定）の GLB に `BufferGeometryUtils.mergeVertices` を使うと `TypeError: Cannot set properties of undefined (setting 'NaN')`**。原因は `new attr.constructor(array, itemSize, normalized)`（`BufferGeometryUtils.js:672`）が `InterleavedBufferAttribute` のコンストラクタ（引数順が違う）に当たるため。`deinterleaveGeometry` は morphAttributes を処理しない（`:572`）。→ `setVertexLayout(SEPARATE)`、かつ meshopt の NORMAL は SEPARATE でもインターリーブになる（stride 4）ので、**ジオメトリの加工はオフラインで終える**。カスタム処理でも `.array` を直接読む前に `isInterleavedBufferAttribute` を見る。
4. **`mergeVertices` はモーフ属性を同一判定に含めない**（§2.7）。モーフ付きで頂点を溶接するなら glTF-Transform の `weld()`（今回の PoC では `poc_tangents` で正しく動作、誤差 0）を使う。
5. **npm の `mikktspace` を `computeMikkTSpaceTangents` に直接渡すと throw**（`isReady` 無し）。三同梱の `libs/mikktspace.module.js`（`await MikkTSpace.ready`）を使うか `{ isReady: true, generateTangents }` で包む。
6. **`tangents()` は unwelded 専用**。順序は `unweld → tangents → weld`。MikkTSpace の入力は非インデックス（`BufferGeometryUtils.js:29,85` も同旨で、三の関数は自動で非インデックス化して返す）。
7. **`GLTFLoader` は TANGENT が無いと材質を複製し `normalScale.y` を符号反転する**（`:3498,3564`）。自前で `material.normalScale` を後から設定するとき、タンジェントの有無で期待値が逆になる。
8. **KTX2Loader は `detectSupport(renderer)` が先**（`:379,411`）。インスタンス複製は警告（`:351`）。UASTC `--level 4` は極端に遅い（3 枚で 71.7 s、出力は level 2 より大きかった 485 KB 対 473 KB）。ETC1S の法線マップは品質が出にくい（一般論。今回の人工法線では描画差は小さい）［R］。ミップは必ず焼く（`gltf-transform` CLI も `ktx2-encoder` も既定でミップ生成）。4 の倍数サイズで作る（ミップ有りで非 4 の倍数は警告 `:726`）。
9. **KTX2 の変換先は環境依存**: SwiftShader（Linux）は BC7。Linux デスクトップの Mesa 系は ASTC/ETC2 を無効化して BC7 に落とす（`:260-269`）。モバイルは ASTC/ETC2 になるはず［R］。ETC1S でも BC7 に変換され VRAM は UASTC と同じ。
10. **gltfpack（npm）**: 既定で 30 Hz に再サンプルする（`-af 0` で止める）。**メッシュノードの下に無名の子ノードを作り、メッシュ名が `mesh_0` になる**（モーフのトラック名が `mesh_0.morphTargetInfluences`、`-kn` でも変わらず）。位置は u16 非正規化。テクスチャ圧縮は不可。名前でノードを探すコード（`getObjectByName('Body')`）が SkinnedMesh でなく親を返す。
11. **Draco／Meshopt／`reorder` は頂点順・インデックス順を変える**（§2.3）。頂点番号をキーにした副データ（生成時の `s`／`θ` など）をファイル外に持たない。必要なら **カスタム属性 `_NAME`** で GLB 内に入れる（`GLTFLoader` は `NAME.toLowerCase()` で属性名にする: `:4871` の `ATTRIBUTES[…] || name.toLowerCase()`。**ランタイム動作は未実行**［U］）。
12. **`GLTFExporter` の制約**: 往復でモーフ weights が書出し時の値になる、`Scene` に `AuxScene` と余分な `Scene` ノードが付く、圧縮テクスチャを PNG に展開（ORM が別オブジェクトになり画像 3→4 枚、`Merged metalnessMap and roughnessMap textures` 警告）、`KHR_materials_diffuse_transmission` 消失、AVIF は書けない（WebP は書け required になる）。テクスチャ展開用の `textureUtils` は renderer を渡す形で注入。
13. **未対応の拡張は黙って消える**（optional の場合）。`KHR_materials_pbrSpecularGlossiness`（glTF-Transform の `metalRough()` で変換）、`KHR_materials_diffuse_transmission`（半透明の鰭や鱗の拡散透過が必要ならカスタムシェーダか別手段）。
14. **ImageBitmap テクスチャは dispose しても解放されない**（`GLTFLoader.js:80-82`）。不要になったら `texture.image.close?.()` を呼ぶ。個体を大量に入れ替える設計では要注意。
15. **`DRACO_GLTF_CONFIG` は使われない**（§2.2）。Draco を使うなら glTF 用 decoder のパス（`libs/draco/gltf/`）を自分で渡す。バンドラ使用時は `import.meta.url` 相対 URL の扱いがバンドラ依存［U］。
16. **gltf-transform CLI の KTX2 は `ktx`（KTX-Software ≥4.4）を探す**。`toktx` だけを PATH に置いても失敗する（今回の最初の失敗）。`ktx2tools` の `ktx.js` ラッパは標準出力に `Running: …` 行を足すので、パイプで使わず実体バイナリ（`node_modules/ktx2tools/bin/linux/ktx`）か自作ラッパ（`poc/setup_side_ktx.sh`）を PATH に置く。
17. **サプライチェーン**: `ktx2tools`・`basis_universal` は公式ではない再パッケージ（公開者は同一の個人。MIT）。バイナリはハッシュ固定して使うか、公式 KTX-Software リリースを持ち込める環境があればそちらを使う。`--ignore-scripts` で入れて内容を確認してから実行した。
18. **`gltf-validator` 2.0.0-dev.3.10 は `KHR_texture_basisu`・`EXT_texture_avif/webp`・`EXT_meshopt_compression` を知らない**ため、`UNSUPPORTED_EXTENSION`・`IMAGE_UNRECOGNIZED_FORMAT`・`VALUE_NOT_IN_LIST (mimeType)` の警告が出る。エラーは 0 のまま。CI ではエラー数だけで判定する。
19. **`ktx2-encoder`** は `enableDebug` を指定しなくても Basis のログ（`Slice: …`）を標準出力に流す（JSON を標準出力に出す補助スクリプトの邪魔になる）。
20. **`@sparticuz/chromium` の既定引数（`--single-process`）でハーネスが固まった**（§2.13）。

---

## 4. 未確認／要追加検証

- **実 GPU**: KTX2 の実機での変換先（Android=ASTC／ETC2、Windows/Linux デスクトップ=BC7 か、macOS/iOS=ASTC か）、トランスコード時間（本検証は SwiftShader＋4 vCPU で 3 枚 0.27〜0.39 s）、VRAM（[R] 512²＋ミップ: BC7/ASTC 4×4 = 349,525 B／枚、RGBA8 = 1,398,101 B／枚）。D の方針どおり、ms は相対比以外使わない。
- **Firefox／Safari**: `ImageBitmapLoader` の分岐（`GLTFLoader.js:2640-2660`）と KTX2/WebP/AVIF の可否。
- **規模**: 本 PoC は骨 3・頂点 236。実機の 24 骨級・数千頂点・2K/4K テクスチャでの KTX2 エンコード時間（UASTC L2＋zstd は 3×512² で 1.5 s だったが、2K×3 は未測定）、ETC1S の品質ラダー（`--quality`/`--compression`）の実素材での見え方。
- **法線マップの向き（緑チャンネルの上下）と鱗の凹凸の見え方**: PoC の法線は人工データで、視覚的な正しさ（凹凸が光に正しく応じるか）は確認していない。タンジェント有無で描画が一致すること（PSNR 55 dB）のみ確認。
- **`EXT_materials_bump`・`EXT_mesh_gpu_instancing`・`KHR_lights_punctual`** の実行確認（ソース確認のみ）。`KHR_materials_variants` 等の外部プラグイン。
- **`KHR_meshopt_compression`（新名）の書出し**: three は両名を受理するが（`GLTFLoader.js:236-246`）、glTF-Transform 4.5.1 は `EXT_` 名で書く。新名の GLB は未作成。
- **`GLTFLoader` の Draco をバンドラ（Vite 等）下で使う場合の decoder 解決**。
- **カスタム頂点属性（`_NAME`）の往復**（作成→GLB→`geometry.attributes['_name']`）。**頂点カラーのモーフ（COLOR_0）**。
- **TANGENT のモーフ**: three のローダ（`addMorphTargets` は POSITION/NORMAL/COLOR_0 のみ `:2387-2455`）／エクスポータ（`:2025`）は未対応［S］。法線マップ＋大きなモーフでは、モーフ後にタンジェントは追従しない［R］。
- **複数 SkinnedMesh を `mergeGeometries` で結合したときのボーンインデックス**（未実行）。`SkeletonUtils.retarget/retargetClip`。
- **`@sparticuz/chromium` の固まり**の原因（`--single-process` との相性か）。**gltfpack を `-kn` でも `mesh_0` になる理由**の詳細。
- **ブラウザ側の `ktx2-encoder`（web 版）によるランタイム圧縮**の実用性。
- **macOS／Windows の CI で `ktx2tools` が使えない**（macOS 無し）。公式 KTX-Software の取得経路は本サンドボックスでは遮断（npm レジストリのみ到達）。

---

## 5. 実行したコマンドと結果（再現できる形）

### 5.0 環境

```
Node v22.22.0 / x64 linux / 4 vCPU Intel Xeon 2.1GHz / RAM 16 GB（GPU 無し）
SP=/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad
three ソース: $SP/three/three-0.186.1/package   型定義: $SP/three/types-three-0.186.0/three（課題文の package/ ではない）
作業: $SP/toolchain_test/（リポジトリには書かない）
Chromium: /opt/pw-browsers/chromium（141.0.7390.37）／ npm: @sparticuz/chromium@153.0.0（153.0.8010.0）
```

### 5.1 クリーンなディレクトリで全パッケージを install（(a) の確認）

```sh
mkdir fresh && cd fresh && npm init -y
npm install --no-audit --no-fund @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions @gltf-transform/cli \
  meshoptimizer pngjs jpeg-js @napi-rs/canvas canvas sharp playwright-core three draco3dgltf ktx-parse ktx2-encoder \
  mikktspace gltf-validator gltfpack @sparticuz/chromium
# → exit 0, added 234 packages in 19s, node_modules 242M
# 版: gltf-transform 4.5.1 / meshoptimizer 1.3.0 / sharp 0.35.5 / three 0.186.1 / playwright-core 1.63.0 / ktx2-encoder 0.6.0 / gltfpack 1.3.0 …（npm dist-tags の latest と一致）
# side（KTX-Software / basisu のバイナリ）:
mkdir side_ktx && cd side_ktx && npm init -y && npm install --ignore-scripts --no-audit --no-fund ktx2tools basis_universal
chmod +x node_modules/basis_universal/bin/basisu
# ktx / toktx / ktx2check … を PATH に出すラッパ: poc/setup_side_ktx.sh（exec <実体> "$@" の 1 行スクリプトを bin/ に置く）
```

### 5.2 全再実行

```sh
cd $SP/toolchain_test && poc/run_all.sh > out/run_all.log 2>&1      # 26 ステップ。失敗するのは `gltfpack -tc`（期待どおり）だけ
```

`poc/run_all.sh` の中身（ステップ順）:

```
setup_side_ktx.sh                     # ktx/toktx ラッパ作成
t_each_package.mjs                    # §2.9 の (b) を 1 本ずつ → out/each_package.json（17 件全て ok）
t_build_plain.mjs                     # poc_plain.glb（骨3・モーフ1・PBR+拡張・PNG×3）
t_variants_geom.mjs                   # tangents / meshopt high|medium / draco / quantize / tangents+meshopt
t_variant_safeskin.mjs (+_sep)        # POSITION を float に残す meshopt（SEPARATE 併用版も）
t_variant_separate.mjs                # 頂点配置 SEPARATE
t_variants_tex.mjs                    # WebP / JPEG / KTX2(ktx2-encoder; slot-aware / naive / nomip)
t_variants_misc.mjs                   # AVIF / LOD（simplify）
npx gltf-transform uastc|etc1s …      # KTX2（toktx 経由）: uastc_cli / etc1s_cli / ktx2_mixed_cli
npx gltfpack -cc [-af 0 -kn -ke] / -tc
inspect_ktx2.mjs / inspect_glb.mjs    # DFD・拡張・属性型・validator
browser/run_browser.mjs               # three r186 GLTFLoader でロード → 変形検証 → 描画 → (--export) GLTFExporter 往復
compare_shots.mjs                     # 描画 PSNR
t_extmatrix.mjs + browser/run_ext.mjs # 拡張マトリクス（§2.12）
t_threeutils.mjs / t_interleaved_utils.mjs / t_tangent_agree.mjs   # three utils（§2.7）
t_sparticuz.mjs                       # npm だけの Chromium
```

### 5.3 主要コマンド単体と結果

```sh
# 1) 生成と GLB 出力（Node のみ）
node poc/t_build_plain.mjs
#  verts 236 tris 384 bytes 764728 / extensionsUsed: clearcoat, ior, iridescence, specular, texture_transform / skins 1 / anims ["Swim"]
node poc/inspect_glb.mjs out/poc_plain.glb          # gltf-validator: errors 0 warnings 1（MESH_PRIMITIVE_GENERATED_TANGENT_SPACE のみ）

# 2) ブラウザ（ヘッドレス Chromium＋SwiftShader）で three r186 GLTFLoader 読込 → 仕様計算と比較
node poc/browser/run_browser.mjs out/poc_plain.glb
#  poc_plain: loadMs≈80 fatal=no pose[t=0:max0mm t=0.25(morph=1):max0mm t=0.5:max0mm t=0.75(morph=1):max0mm] logs=0 glErr=0
CHROME=$PWD/tmp_sparticuz/chromium node poc/browser/run_browser.mjs out/poc_plain.glb out/poc_ktx2_mixed_cli.glb    # npm の Chromium でも同結果

# 3) KTX2（toktx/ktx 経由。PATH に ktx 4.4 のラッパ）
export PATH=$PWD/bin:$PATH
npx gltf-transform uastc out/poc_plain.glb out/poc_uastc_cli.glb --level 2 --zstd 18       # 764.73 KB → 473.3 KB（1.5 s）
npx gltf-transform etc1s out/poc_plain.glb out/poc_etc1s_cli.glb --quality 128              # → 107.05 KB（1.0 s）
npx gltf-transform etc1s out/poc_plain.glb out/tmp.glb --quality 160 --slots "baseColorTexture"
npx gltf-transform uastc out/tmp.glb out/poc_ktx2_mixed_cli.glb --level 2 --zstd 18 \
    --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}"                     # → 455.91 KB
node poc/inspect_ktx2.mjs out/poc_*ktx2*.glb out/poc_*cli.glb                               # DFD（§2.10 の表）

# 4) gltfpack
npx gltfpack -i out/poc_plain.glb -o out/poc_gltfpack_cc.glb -cc                            # OK（4.9 mm 誤差: 30 Hz 再サンプル）
npx gltfpack -i out/poc_plain.glb -o out/poc_gltfpack_af0.glb -cc -af 0 -kn -ke             # OK（0.075 mm）
npx gltfpack -i out/poc_plain.glb -o out/x.glb -cc -tc
#  Error: gltfpack was built without BasisU support, texture compression is not available（exit 1）

# 5) 描画比較
node poc/compare_shots.mjs out/shots/poc_plain.png out/shots/poc_*.png                      # §2.10 の PSNR 列

# 6) three utils（Node）
node poc/t_threeutils.mjs
#  bundled vs npm tangents maxDiff 0 / 非インデックス化 1152 頂点 → mergeVertices 236 / morph 不一致 0
#  mergeIgnoresMorph: before 6 after 4 / morph Z of merged: 0.5 and 0.5（期待 0.5 と -0.5）
node poc/t_interleaved_utils.mjs
#  interleaved: mergeVertices → "Cannot set properties of undefined (setting 'NaN')"、deinterleaveGeometry 後も同じ
#  separate    : mergeVertices ok（236）、mikk ok
node poc/t_tangent_agree.mjs        # {"gltfTransformTangentVerts":236, …, "maxAbsDiffGltfTransformVsThree":0}

# 7) 拡張マトリクス
node poc/t_extmatrix.mjs && node poc/browser/run_ext.mjs      # 材質値の一覧と GLTFExporter 出力（§2.12）

# 8) 参考: playwright の自動ブラウザ取得は不可
npx playwright-core install chromium    # → Download failure（CDN 遮断）
```

### 5.4 PoC の中核コード（要点だけ。全文は `poc/lib_loft.mjs`・`lib_doc.mjs`・`browser/viewer.mjs`）

```js
// --- ロフト: P(s,θ) = (s·L, b(s)cosθ − bulge, (a(s)+0.25·bulge)sinθ); 法線は ∂P/∂θ × ∂P/∂s（中心差分）。
//     モーフ "belly" = P(w=1)−P(w=0) と法線差。ウェイト: 骨 x=[0.18L,0.50L,0.82L] 間を smoothstep で 2 ボーン補間。
// --- glTF-Transform
const doc = new Document(); const buf = doc.createBuffer();
const prim = doc.createPrimitive().setMaterial(mat)
  .setAttribute('POSITION', acc(pos,'VEC3')).setAttribute('NORMAL', acc(nor,'VEC3')).setAttribute('TEXCOORD_0', acc(uv,'VEC2'))
  .setAttribute('JOINTS_0', acc(joints /*Uint16Array*/,'VEC4')).setAttribute('WEIGHTS_0', acc(weights,'VEC4')).setIndices(acc(idx,'SCALAR'));
prim.addTarget(doc.createPrimitiveTarget('belly').setAttribute('POSITION', acc(mPos,'VEC3')).setAttribute('NORMAL', acc(mNor,'VEC3')));
const mesh = doc.createMesh('Body').addPrimitive(prim).setWeights([0]); mesh.setExtras({ targetNames: ['belly'] });
const bones = [ /* Node 'spine0' > 'spine1' > 'spine2'（子の translation は相対 x） */ ];
const skin = doc.createSkin('Skin').setInverseBindMatrices(acc(ibm /*translate(-x_k,0,0)*/,'MAT4')).setSkeleton(armature);
bones.forEach(b => skin.addJoint(b));
doc.createNode('Body').setMesh(mesh).setSkin(skin);
// Animation: rotation ×3（LINEAR・5 キー）＋ weights ×1。Material は clearcoat/iridescence/ior/specular/texture_transform
// --- 検証側（viewer.mjs）
mixer.clipAction(gltf.animations[0]).play(); action.time = 0.25; mixer.update(0);
gltf.scene.updateMatrixWorld(true); skinned.skeleton.update();
skinned.getVertexPosition(i, v); v.applyMatrix4(skinned.matrixWorld);      // vs 仕様 LBS:  jointMatrix_j = world_j · IBM_j, v' = Σ w_j · jointMatrix_j · (p + w_morph·Δp)
```

---

### 付記: 他監査との整合・訂正メモ

- **A の R12／P22**（「ミップが無いと `minFilter=LinearFilter` でチラつく」）は `KTX2Loader` を直接使う場合の記述として正しい（`KTX2Loader.js:453`）。**`GLTFLoader` 経由では `minFilter` がサンプラ既定の `LinearMipmapLinear` に上書きされる**（`GLTFLoader.js:3320`）が、WebGL2（SwiftShader）ではミップ 1 段でも描画は破綻しなかった（PSNR 44.6 dB）。いずれにせよミップは焼く。
- **A の U6**（「法線/ORM に UASTC、色に ETC1S という運用の品質・サイズは未検証」）に対する実測は §2.10: 混成 430 KB／描画 47.0 dB、全 UASTC 447 KB／55.7 dB、全 ETC1S 81 KB／45.0 dB（人工テクスチャでの値。実素材は未検証）。
- **B の [U]**（`MAX_ARRAY_TEXTURE_LAYERS` の実機値）は SwiftShader で 2048（§2.13）。実機の値ではない。
- **D の「ヘッドレス標準手順」**と本書のハーネス（`playwright-core` ＋ ローカル HTTP サーバ ＋ `executablePath`）は同一方針。npm だけで Chromium を得る経路（`@sparticuz/chromium`）を追加した。
