# r14 リアルタイム魚類レンダリング技法（皮膚／鱗／粘液／眼／鰭／水中）— Three.js(WebGL) 向け

> **調査制約・方法（必読）**
> 1. **外部検索は 1 回も成立していない。** 本ストリームは WebSearch を 3 回呼んだが、3 回とも "Web search was not performed: this session has used its web search budget (200 of 200 WebSearch calls)" で拒否された（クエリは §6）。指示どおり即座に検索をやめ、迂回（WebFetch、curl での外部取得）は行っていない。したがって **査読論文・技術資料（Belcour & Barla 2017、Toksvig、LEAN、GPU Gems 等）の記述は 1 件も検索で裏付けられておらず、すべて証拠ランク M（記憶）** である。論文名・著者は「検証用リード」であって引用ではない。
> 2. 代わりに、指示で許可されている **npm 経由**で `three@0.186.1`（2026-10-01 時点の npm の `latest`）と `@gltf-transform/extensions@4.5.1` をスクラッチパッドに取得し、**実ソースコードを直接読んだ**。これは「Three.js r186 の実装が何をしているか」についての一次確認であり、本書では **[B(code)]** と表記する（A〜C の枠外なので、集計上は B に計上）。論文の主張が正しいことの証拠ではなく、「実装がこうなっている」という事実のみを保証する。
> 3. 写真由来の所見は `docs/yamame/photo_analysis/catalog_c01〜c07.json`（70 枚、ヤマメ判定 57 枚）をこの場で再集計したもの（ランク **P**）。語のカウントは日本語キーワードの機械的一致で粗い。他ストリーム（r06, r07）の記述を引く場合は「二次引用」と明記し、元のランクを継承した。
> 4. 数値計算（**M（計算）**）は、入力値が M または別ストリーム（C/M）由来であるため、結果も M。
> 5. ヤマメ自体のレンダリング実例は存在しない。光学定数（グアニン屈折率など）はすべて仮定パラメータ。
> 6. **ユーザー依頼文（ヤマメの骨格を口・顔・鰓の再現に使う）について**: 骨格の画像は、スクラッチパッド内の `scratchpad/skeleton/s01.jpg`（366×550 px、青染色の透明骨格標本、ラベル断片 "…ncorhynchus"）として存在することを、作業の終盤で確認した（最初はリポジトリとセッション添付の PDF ページ画像しか探しておらず、見落としていた。PDF ページ画像は「3D モデリング用 実写写真資料 70 枚」で骨格図ではない）。画像は頭を下にした斜め上からの短縮像で、頭部は濃い青の塊に見え、顎・鰓蓋の個々の骨は本書の担当範囲では判別できなかった。骨格の解析は別ストリーム `r15_cranial_osteology.md` が担当しており、その結論（個々の頭蓋骨の同定・接続は短縮・重なり・ボケのため不可）と同じ立場である。**骨格由来の寸法は本書に反映していない**。レンダリング側で骨格から必要になる要件は F-26 に書いた。
> 7. 証拠ランク: A=査読論文・学術書・公的機関資料で要約文中に明示／B=図鑑・自治体・博物館・信頼できる解説（本書では実ソースコードの直接確認を B(code) とする）／C=釣り・個人ブログ等／M=自分の記憶（未検証）／P=ユーザー提供写真 70 枚からの観察・集計。

---

## 1. 要約（仕様に直結する結論）

各行末の [F番号] は §2 の根拠 Finding。**[M] を含む行は検証されていない仮定**であり、数値仕様にそのまま採用しないこと。[B(code)] は「Three.js r186.1 のコードがそうなっている」ことのみを保証する。

1. **銀色を Three.js の `iridescence`（薄膜干渉）で作らない。** r186 の虹彩実装は Belcour–Barla 型の Fourier 空間評価（高調波は m=1,2 の 2 次まで）で、**単層の薄膜・スカラーの膜屈折率・膜の外側媒質は空気固定（IOR=1.0）・Fresnel は s/p 分離なしの Schlick** という制約を持つ。魚の銀色は（r06 F-33 によれば）広帯域・非偏光の多層反射体なので、単層の狭帯域干渉色とは性質が違う。銀色は「ほぼ無彩色の金属的鏡面（環境反射）＋弱い虹彩」で作る。 [F-01][F-18][F-19]
2. **水中の薄膜色は r186 では正しく出ない。** `evalIridescence(1.0, …)` が呼ばれ、膜の外側は常に空気と仮定される。水中（n≈1.333）の見えを厳密にやるなら、シェーダ改造（`onBeforeCompile`）で外側 IOR を渡す必要がある。ただし本書では水中での虹色の寄与は小さいという写真所見（虹色の言及は r06 F-18 によれば 70 枚中 6 枚）に合わせ、**改造せず弱い虹彩を載せる程度**を既定案とする。 [F-01][F-19]
3. **デフォルトの膜厚範囲 [100, 400] nm は、グアニン板の 1/4 波長厚（n=1.83 と仮定すると 450–650 nm で約 61–89 nm）より厚い側にずれている。** 一次の反射を狙うなら `iridescenceThicknessRange` の下限を 60 nm 前後まで下げる余地がある（グアニン n と層構造は未検証の仮定）。 [F-02][F-17]
4. **空気中の濡れ光沢は `clearcoat`、水中では使わない（または弱める）。** 写真（ヤマメ判定 57 枚、skin 記述）で「水膜」の語は空気中の 39 枚中 12 枚、水中・水槽 18 枚中 0 枚。「マット／つや消し／サテン」は空気中 7/39、水中 9/18。水中では水と粘液・表皮の屈折率がほぼ同じで界面の鏡面反射がほぼ無い（r06 F-28, M）ので、水中の光沢は下の銀色層の反射が主。 [F-10][F-16]
5. **Three.js の clearcoat は F0=0.04（IOR 1.5 相当）固定。** 水膜（n=1.333）の F0 は 0.0204。非減衰の clearcoat=1 は、垂直入射で絶対誤差 +0.02、80° で +0.06（0.410 対 0.348）。**clearcoat=0.5 に絞ると垂直では合うが 80° で 0.205 と過小**になる。どちらも完全には合わないので、厳密にしたい場合は `clearcoatF0` を 0.02 にするシェーダ改造を許容する。 [F-03][F-16]
6. **鱗の法線マップは必ず「分散つきフィルタ」が要る。** Three.js の `geometryRoughness` は**法線マップ前の幾何法線 (`nonPerturbedNormal`) の導関数**から作られ、法線マップ由来の微細な法線分散は粗さに反映されない。通常の mipmap は法線の平均化で平坦化し、遠距離で鱗が消えて、ハイライトがちらつく。対策として Toksvig／LEAN 系の粗さ補正（M）を、粗さマップの各 mip にオフラインで焼き込む案がある。 [F-06][F-21]
7. **鱗ピッチは遠距離で必ずサブピクセルになる（M 計算）。** r06 の暫定ピッチ 0.55–0.9 %SL を使うと、SL 200 mm の個体（鱗ピッチ 1.1–1.8 mm）は、縦 FOV 50°・1080 px でカメラ距離 約 0.64–1.04 m 以上でピッチが 2 px 未満（ナイキスト以下）、約 1.27–2.08 m 以上で 1 px 未満になる。**数 m 以内の観察でも鱗の格子は折り返し（エイリアシング）の領域に入る**。 [F-14]
8. **鱗は幾何ではなく法線マップ＋粗さ＋AO で作り、ディスプレイスメントは使わない。** `displacementMap` は頂点を法線方向に動かす方式で、鱗ピッチ 1 mm 級に必要な頂点密度が現実的でない。r186 の WebGL 用マテリアルにはパララックス・オクルージョン・マッピング（POM）が無い（TSL 側に単純な UV オフセットの `parallaxUV` があるのみ）。写真側も「鱗の凹凸は極小」（p049、r06 経由の二次引用）。 [F-07][F-10]
9. **鱗テクスチャの密度（M 計算）**: 体長方向の鱗数は 111–182 枚（0.9–0.55 %SL）。1 枚あたり 4–8 texel とすると体長方向に約 440–1450 texel、すなわち **1k〜2k のテクスチャ幅**が必要（UV 展開で体側に集約する場合）。 [F-14]
10. **鰭は `transmission` ではなくアルファ合成の薄膜＋追加の透過光項で作る。** r186 の `transmission` は、透過物体が 1 つでも見えるとき**不透明物体を半精度・MSAA(≥4)・ミップ付きのレンダーターゲットにもう一度描画**し、スクリーン空間で屈折サンプリングする方式で、**透過物体同士は互いに見えない**。多数の魚の鰭や眼に使うと描画コストが 2 倍近くになり、鰭同士の重なりが破綻する。 [F-04]
11. **鰭の透過光（バックライト）は、アドオンの `SubsurfaceScatteringShader`（Barré-Brisebois & Bouchard, GDC 2011 型の近似）の考え方が使える。** ただしこれは MeshPhong ベースで PBR ではない。鰭では、`scatteringHalf = normalize(L + N*distortion)` と `pow(saturate(dot(V, -H)), power)` による視線依存の透過項を、PBR シェーダに `onBeforeCompile` で足すのが現実的（M の設計案）。 [F-08][F-23]
12. **水中の減衰は `FogExp2` では物理的に違う。** r186 の指数フォグは `1 - exp(-(密度×深度)^2)`（距離の**二乗**）で、フォグ色も 1 色・密度もスカラー。Beer–Lambert（exp(-c·r)）かつ波長（RGB）別の減衰にするには、`fog_fragment` を差し替える必要がある。一方 `KHR_materials_volume` 相当の `attenuationColor/attenuationDistance` は物体内部の厚み方向の RGB 別 Beer 則であり、**カメラと魚の間の水の減衰は表現できない**。 [F-05][F-04][F-15]
13. **純水の吸収は赤で急増する（M）**: r06 F-30 の値（650 nm で a≈0.34 m⁻¹、550 nm で 0.064、465 nm で ≈0.010 は M）から、RGB 別の `attenuationColor`（attenuationDistance=1 m で R/G/B≈0.71/0.94/0.99）が得られる。**渓流の実効減衰（CDOM・懸濁粒子）はこれより大きく、青緑側に偏る**ので、純水値は下限。観察距離 0.3–2 m の魚では赤の損失は小さく、見た目の水の色は主に散乱光（背景水色）の混合になる（M）。 [F-15][F-25]
14. **コースティクスと神の光は Three.js コアに既製品が無い。** r186.1 の `src`・`examples/jsm` に "caustic" を含むファイルは無く、ゴッドレイは TSL/WebGPU 用の `GodraysNode`（シャドウマップを使うスクリーン空間レイマーチ）のみ。WebGL 用は自作が必要。コースティクスは `SpotLight.map`（投影テクスチャ）への動くパターン投影という案があるが、方向光ではなくスポットライトが必要（`SpotLight.map` の存在はコード確認、手法の妥当性は M）。 [F-08][F-25]
15. **眼は幾何で作り、パララックスは実形状から得る。** 魚の水晶体はほぼ球形で角膜は水中で光学的にほぼ無効（r07 F-10, C）、虹彩は金色の細い環で外周に暗い眼窩縁（金 46/57、暗輪・眼窩影 34/57, P）。したがって、**透明な薄い角膜の球冠の背後に、虹彩・瞳孔の円盤メッシュを数 %眼径だけ奥に置く**構成にすれば、虹彩パララックスは実形状から自然に出る（M の設計案）。角膜は鏡面（環境反射）専用の薄い層にし、`transmission` は使わない。眼のハイライト（映り込み）の記述は空気中 18/39、水中 1/18 で、空気中の撮影ほど目立つ。 [F-11][F-24][F-04]
16. **瞳孔は円形の固定が基本**（円形 39、楕円 7/57 は斜め視点、P）。真骨魚の瞳孔は固定が大半という総説（r07 F-30, B）と整合。瞳孔径の動的変化は実装しなくてよい。 [F-11]
17. **口・鰓の内部は「見える場面が限られる」ので、常時レンダリングしない。** 口の状態（ヤマメ判定 57 枚）は閉 34、開 14、ルアーで掛かっている 8、不明 1。鰓腔の赤は握りで鰓蓋が開いた 1 枚（p061）にのみ明記があり、開口中の口内は暗く舌は桃色（p012）または灰紫（p047）。口・鰓蓋の開閉で内部が露出する瞬間だけ、暗い口内材質／赤い鰓弁材質を見せる（P の所見に基づく設計）。 [F-12][F-26]
18. **ゲーム資産の事例（ポリ数、ボーン数、テクスチャ解像度、LOD）は何も確認できなかった（Gap）。** Three.js 側の技術制約だけは確認できた: 頂点あたりのボーン影響は 4、ボーン行列は 1 ボーン＝4 texel のテクスチャ、`LOD.addLevel(object, distance, hysteresis)`、モーフターゲットは `DataArrayTexture` に格納される。 [F-09]
19. **Three.js 側のバージョン固定の注意**: 本書のコード確認は r186.1。`iridescenceThicknessRange` や `clearcoatF0` の扱い、`transmission` のレンダーターゲット（half float・MSAA）の挙動は版で変わりうる。実装時は同じバージョンで再確認する（§4 Gap-12）。 [F-01][F-03][F-04]

---

## 2. Findings

### Part A — Three.js r186.1 の実装確認（ランク B(code)）

出典はすべて npm パッケージ `three@0.186.1` の `src/` と `examples/jsm/`、および `@gltf-transform/extensions@4.5.1`。ファイル名は `node_modules/three/` 以下の相対パス。

### F-01 虹彩（iridescence）の実装と制約
- 主張/値:
  - `src/renderers/shaders/ShaderChunk/iridescence_fragment.glsl.js` が、コメントで「Ref: belcour.github.io/blog/research/2017/05/01/brdf-thin-film.html」「Evaluation XYZ sensitivity curves in Fourier space」と書く Belcour–Barla 型の実装。膜の反射を、光路差 OPD の高調波として評価し、`for (int m = 1; m <= 2; ++m)` **で 2 次まで**足す。XYZ 感度曲線をガウス関数で近似した式（定数 5.4856e-13 など）を使う。
  - 膜は**単層**。`iridescenceIOR` は**スカラー**（波長依存なし）。`float iridescenceIOR = mix(outsideIOR, eta2, smoothstep(0.0, 0.03, thinFilmThickness))` により膜厚 0→0.03 nm で膜が消える。
  - 呼び出し側 (`lights_fragment_begin.glsl.js`) は `evalIridescence(1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor)`（誘電体）と、`material.diffuseColor` を F0 に使う金属用の 2 回。**外側 IOR は 1.0 固定**。角度は `dotNVi = saturate(dot(normal, geometryViewDir))`（視線角のみ）。
  - Fresnel は `F_Schlick(R0, 1.0, cosθ)` による**スカラー式で s/p 偏光を分けない**。膜の位相は `phi12`, `phi23` の π 跳びのみ。
  - 虹彩強度は `iridescence` と `iridescenceMap` の R、膜厚は `iridescenceThicknessMap` の **G** チャンネルで `(max - min) * G + min`。マップが無いと `iridescenceThicknessMaximum` が使われる。`iridescenceThickness == 0` なら虹彩は 0。
  - 虹彩は **鏡面の Fresnel 項だけ**を置き換える（`F = mix(F, material.iridescenceFresnel, material.iridescence)`、IBL 側は `computeMultiscatteringIridescence`）。拡散色は変えない。
- 適用範囲: Three.js r186.1 の `MeshPhysicalMaterial`（WebGL）。WebGPU/NodeMaterial の実装は未確認。
- 出典: `three@0.186.1` の上記ファイル（npm）。コメント内 URL: https://belcour.github.io/blog/research/2017/05/01/brdf-thin-film.html （到達確認なし）。
- 証拠: [B(code)] 引用: `for ( int m = 1; m <= 2; ++ m ) {`、`evalIridescence( 1.0, material.iridescenceIOR, dotNVi, ...)`。

### F-02 KHR_materials_iridescence / KHR_materials_volume の既定値と定義
- 主張/値:
  - `iridescenceIOR` の既定 **1.3**、`iridescenceThicknessMinimum` 既定 **100 nm**、`iridescenceThicknessMaximum` 既定 **400 nm**（`@gltf-transform/extensions@4.5.1` の `src/khr-materials-iridescence/iridescence.ts` の `getDefaults()`）。Three.js 側も `iridescenceIOR = 1.3`、`iridescenceThicknessRange = [100, 400]`（`src/materials/MeshPhysicalMaterial.js`）。
  - 厚みテクスチャの定義: 「緑 (G) チャンネルが最小〜最大の間の薄膜厚を決める」。強度テクスチャは R。
  - `KHR_materials_volume`: `attenuationDistance`（「光が媒質中で粒子と相互作用するまでの平均距離 [m]」）と `attenuationColor`（「白色光が減衰距離に達したときに変わる色（リニア）」）、`thicknessFactor`。Three.js では `thickness`（メッシュ座標系）、`attenuationDistance`（既定 Infinity）、`attenuationColor`（既定 白）。
- 適用範囲: glTF 拡張のパラメータ定義。拡張仕様書の本文は読めていない（パッケージ内の型定義コメントと実装のみ）。
- 出典: `@gltf-transform/extensions@4.5.1`（`dist/index.d.ts` のコメント）。拡張仕様の URL（コメント内）: https://github.com/KhronosGroup/gltf/blob/main/extensions/2.0/Khronos/KHR_materials_iridescence/ 、https://github.com/KhronosGroup/gltf/blob/main/extensions/2.0/Khronos/KHR_materials_volume/ （到達確認なし）。
- 証拠: [B(code)] "Minimum thickness of the thin-film layer, in nanometers (nm)."

### F-03 クリアコート（濡れ膜の近似）の実装
- 主張/値:
  - `lights_physical_fragment.glsl.js`: `material.clearcoatF0 = vec3(0.04)`、`clearcoatF90 = 1.0`（IOR 1.5 相当で固定、屈折率入力なし）。
  - クリアコートの粗さ: `clearcoatRoughness = max(clearcoatRoughness, 0.0525)` に `geometryRoughness` を加算して 1.0 で打ち切り。
  - クリアコート専用の法線（`clearcoatNormalMap`、`clearcoatNormalScale`）を持てる（水膜の波紋・水滴の表現に使える）。
  - 下層の減衰（`meshphysical.glsl.js`）: `outgoingLight = outgoingLight * (1.0 - material.clearcoat * Fcc) + (clearcoatSpecularDirect + clearcoatSpecularIndirect) * material.clearcoat`。
  - 基底の粗さにも下限: `material.roughness = max(roughnessFactor, 0.0525)`（コメント: "0.0525 corresponds to the base mip of a 256 cubemap"）。
- 適用範囲: Three.js r186.1 `MeshPhysicalMaterial`。
- 出典: `three@0.186.1` の `lights_physical_fragment.glsl.js`、`lights_physical_pars_fragment.glsl.js`、`ShaderLib/meshphysical.glsl.js`。
- 証拠: [B(code)] 引用: `material.clearcoatF0 = vec3( 0.04 );`。

### F-04 透過（transmission）・ボリューム・分散の実装
- 主張/値:
  - `WebGLRenderer.js` の `renderTransmissionPass`: 専用の `WebGLRenderTarget`（`generateMipmaps: true`、`type: HalfFloatType`（半精度が使える場合）、`minFilter: LinearMipmapLinearFilter`、`samples: Math.max(4, capabilities.samples)`）を作り、`renderObjects(opaqueObjects, scene, camera)` で**不透明物体を再描画**してから、透過物体を通常パスで描く。解像度は `transmissionResolutionScale`（既定 1.0）。透過物体が `DoubleSide` の場合は背面を先に透過パスへ描く。
  - シェーダ (`transmission_pars_fragment.glsl.js`): 屈折レイ `refract(-v, normalize(n), 1.0 / ior)` を `thickness`（ローカル空間、スケール補正あり）倍した位置をスクリーンに投影し、`transmissionSamplerMap` を **bicubic ミップサンプル**。ミップレベルは `log2(size.x) * roughness * clamp(ior*2.0-2.0, 0, 1)`。
  - 減衰: `attenuationCoefficient = -log(attenuationColor) / attenuationDistance; transmittance = exp(-attenuationCoefficient * transmissionDistance)`（コメント "Beer's law"）。`attenuationDistance` が無限大なら 1。
  - 分散 (`USE_DISPERSION`): `halfSpread = (ior - 1.0) * 0.025 * dispersion; iors = vec3(ior - halfSpread, ior, ior + halfSpread)` で RGB 別に屈折サンプル。
  - 透過物体は**不透明パスの内容**だけをサンプルするため、透過物体同士は互いに映らない（コード構造から読み取れる）。
- 適用範囲: Three.js r186.1 WebGL。
- 出典: `three@0.186.1` の `src/renderers/WebGLRenderer.js`（`renderTransmissionPass`）、`transmission_pars_fragment.glsl.js`、`transmission_fragment.glsl.js`。
- 証拠: [B(code)] 引用: `renderObjects( opaqueObjects, scene, camera );`（透過パス内）、`transmittance = exp( - attenuationCoefficient * transmissionDistance ); // Beer's law`。

### F-05 フォグの実装（水中減衰の既製品としての限界）
- 主張/値: `fog_fragment.glsl.js`: `FOG_EXP2` のとき `fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth)`、それ以外は `smoothstep(fogNear, fogFar, vFogDepth)`。最終は `gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor)`。**`fogColor` は vec3 1 つ、`fogDensity` はスカラー**で、波長（RGB）別の減衰係数は持てない。指数が距離の二乗のため、Beer–Lambert（距離の一次指数）と形が違う。
- 適用範囲: Three.js r186.1 の標準マテリアルのフォグ。
- 出典: `three@0.186.1` の `fog_fragment.glsl.js`、`fog_pars_fragment.glsl.js`。
- 証拠: [B(code)] 引用: `float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );`。

### F-06 法線マップ・粗さのアンチエイリアス処理の有無
- 主張/値:
  - `lights_physical_fragment.glsl.js`: `vec3 dxy = max(abs(dFdx(nonPerturbedNormal)), abs(dFdy(nonPerturbedNormal))); float geometryRoughness = max(max(dxy.x, dxy.y), dxy.z);` を粗さに加算。**`nonPerturbedNormal` は法線マップを適用する前の法線**であり、法線マップの微細な法線分散（Toksvig／LEAN が扱うもの）は粗さに入らない。
  - 法線マップ: タンジェント空間・オブジェクト空間・2 チャンネル詰め込み (`USE_PACKED_NORMALMAP`、z を `sqrt(saturate(1 - dot(xy,xy)))` で復元) に対応。`normalScale` で強度。接線属性が無い場合は導関数から接線フレームを計算（`getTangentFrame`）。
  - バンプマップは Mikkelsen の表面勾配法（`bumpmap_pars_fragment.glsl.js` のコメント: mm_sfgrad_bump.pdf）。
  - 既定の `texture.anisotropy`、`generateMipmaps` はテクスチャ側設定（`Texture.js`）。法線マップの分散を考慮したミップ生成機能は無い。
- 適用範囲: Three.js r186.1。
- 出典: `three@0.186.1` の `lights_physical_fragment.glsl.js`、`normal_fragment_maps.glsl.js`、`bumpmap_pars_fragment.glsl.js`。コメント内 URL: https://mmikk.github.io/papers3d/mm_sfgrad_bump.pdf （到達確認なし）。
- 証拠: [B(code)] 引用: `float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );`、`dFdx( nonPerturbedNormal )`。

### F-07 ディスプレイスメント・パララックスの有無
- 主張/値: `displacementmap_vertex.glsl.js` は `transformed += normalize(objectNormal) * (texture2D(displacementMap, vDisplacementMapUv).x * displacementScale + displacementBias);` で**頂点を法線方向に動かす方式**。r186.1 の `src` と `examples/jsm` で "parallax" を含む全ファイル（13 件）を検索したところ、ステレオカメラ・アナグリフ・視差バリア・TSL の `getParallaxCorrectNormal`（ボックス投影の環境マップ補正）・`SpecularHelpers.js`（デノイザ用の項）・時間再投影ノード等で、**WebGL の `MeshPhysicalMaterial`（ShaderChunk）には表面のパララックスマッピングも POM も無い**。唯一、TSL（NodeMaterial 側）の `src/nodes/accessors/AccessorsUtils.js` に `parallaxUV = (uv, scale) => uv.sub(parallaxDirection.mul(scale))`（視線方向の単純な UV オフセット。オクルージョン無し）がある。"occlusion" と parallax／relief／steep を組み合わせた POM 実装は見当たらない（grep の結果）。
- 適用範囲: Three.js r186.1。
- 出典: `three@0.186.1` の `displacementmap_vertex.glsl.js` ほか（grep）。
- 証拠: [B(code)]（不在の確認は grep 結果に基づく。完全性の保証はしない）。

### F-08 アドオンの半透明・ゴッドレイ・水関連
- 主張/値:
  - `examples/jsm/shaders/SubsurfaceScatteringShader.js`: コメントで「GDC 2011 – Approximating Translucency for a Fast, Cheap and Convincing Subsurface Scattering Look」に基づく。MeshPhong ベース。`RE_Direct_Scattering` は `scatteringHalf = normalize(directLight.direction + (geometryNormal * thicknessDistortion)); scatteringDot = pow(saturate(dot(geometryViewDir, -scatteringHalf)), thicknessPower) * thicknessScale;` を厚みマップ（`thicknessMap.r`）と `thicknessColor` に掛け、`thicknessAttenuation` で光色に加算。既定値: `thicknessDistortion 0.1`、`thicknessAmbient 0.0`、`thicknessAttenuation 0.1`、`thicknessPower 2.0`、`thicknessScale 10.0`。
  - `examples/jsm/tsl/display/GodraysNode.js`: "Screen-space raymarched godrays"。制約: 点光源と方向光のみ、完全なシャドウ設定が必要。参考として three-good-godrays を挙げる。`three/webgpu` と `three/tsl` からのインポートで、**WebGL 向けの GodRays パスはリリース内に無い**（"godray" で grep して該当は `GodraysNode.js` と `depthAwareBlend.js` のみ）。
  - `WaterMesh.js` は WebGPURenderer 専用、WebGLRenderer では `Water.js` を使う旨のコメント。いずれも水面の反射・屈折であり、水中視点のボリューム表現ではない。
  - "caustic" を含むファイルは `src`・`examples/jsm` に存在しない（grep の結果）。
  - `SpotLight.map`（投影テクスチャ）がある（`src/lights/SpotLight.js`）。
  - ポストプロセス: `BokehPass`、`SSAOPass`、`GTAOPass`、`SSRPass`、`SMAAPass`、`TAARenderPass`、`SSAARenderPass`、`OutlinePass` が存在。
- 適用範囲: Three.js r186.1 のアドオン。
- 出典: `three@0.186.1` の `examples/jsm/shaders/SubsurfaceScatteringShader.js`、`examples/jsm/tsl/display/GodraysNode.js`、`examples/jsm/objects/WaterMesh.js`。コメント内 URL: https://colinbarrebrisebois.com/2011/03/07/gdc-2011-approximating-translucency-for-a-fast-cheap-and-convincing-subsurface-scattering-look/ 、https://github.com/Ameobea/three-good-godrays （到達確認なし）。
- 証拠: [B(code)] 引用: コメント "Screen-space raymarched godrays"、"Based on GDC 2011".

### F-09 スキニング・モーフ・LOD の実装上の仕様
- 主張/値:
  - スキニング: 頂点属性 `skinIndex`／`skinWeight` を 4 つ使う（`boneMatX/Y/Z/W`）。**1 頂点あたり最大 4 ボーン影響**。
  - ボーン行列は `boneTexture` に 1 ボーン＝4 texel で格納（`getBoneMatrix` が `texelFetch` で 4 つ読む）。テクスチャ辺は `size = Math.sqrt(bones.length * 4); size = Math.ceil(size / 4) * 4; size = Math.max(size, 4)`（`Skeleton.js`）。
  - モーフターゲットは `DataArrayTexture(buffer, width, height, morphTargetsCount)` に格納（`WebGLMorphtargets.js`）。ターゲット数の上限値は未確認（Gap）。
  - `LOD.addLevel(object, distance = 0, hysteresis = 0)`: ヒステリシスは距離に対する比率でちらつきを防ぐ。
- 適用範囲: Three.js r186.1 WebGL。
- 出典: `three@0.186.1` の `skinning_pars_vertex.glsl.js`、`skinning_vertex.glsl.js`、`Skeleton.js`、`WebGLMorphtargets.js`、`LOD.js`。
- 証拠: [B(code)] 引用: `size = Math.ceil( size / 4 ) * 4;`。

---

### Part B — 写真（70 枚、ヤマメ判定 57 枚）の再集計と二次引用（ランク P）

### F-10 皮膚の光沢・鱗の見え方（空気中と水中の差）
- 主張/値（ヤマメ判定 57 枚の `skin` フィールド全文への語の一致。空気中＝ground 15・landing_net 12・hand 8・other 4 の計 39 枚、水中＝in_water_natural 9・aquarium 9 の計 18 枚）:

  | 語 | 空気中(39) | 水中・水槽(18) |
  |---|---|---|
  | 水膜 | 12 | 0 |
  | 濡れ | 27 | 5 |
  | ハイライト | 22 | 5 |
  | マット／つや消し／サテン | 7 | 9 |
  | 鱗（の記述） | 38 | 14 |
  | 粘液 | 11 | 4 |

  全体（57 枚）では「鱗」52、「濡れ」32、「ハイライト」27、「虹色／真珠／パール／玉虫」2。
  p001 の記述（原文）: 「水膜で濡れた光沢。体側全体に細かい鱗の格子状の明暗(5倍ズームで鱗縁が見える)」「体上縁に沿う水面反射の白い線状ハイライト(幅3-5px)。鰓蓋に点状ハイライト」。
- 適用範囲: 参照写真（日本のウェブ上の釣果・図鑑・水族館写真）。解像度・露出・画像処理に依存。語の一致は機械的で、意味の否定（「ない」）を除外していない。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json` の `skin`、`context`。p001 の元ページ https://www.ana.co.jp/travelandlife/article/000941/ 。r06 F-17（同方向の先行集計）。
- 証拠: [P] p001 "水膜で濡れた光沢。体側全体に細かい鱗の格子状の明暗".

### F-11 眼の見え方（虹彩・瞳孔・暗輪・ハイライト）
- 主張/値（ヤマメ判定 57 枚の `eye` フィールド全文への語の一致）:
  - 「金」46 枚、「暗輪／眼窩影／縁」34 枚、「ハイライト／反射／映り込み／光沢」19 枚（空気中 18/39、水中・水槽 1/18）、「円形／丸」39 枚、「楕円」7 枚、「白い点／青白」2 枚。
  - p001 の記述: 「橙金〜銅色の細い環(外径≈24px)」「瞳孔: 黒・円形(≈18-20px)」「眼周囲に黒〜濃褐色の暗輪(眼窩影)」。
  - 二次引用（r07 F-08 の P）: 産卵期〜産卵後の雄は金環が見えない個体（p044, p045）。
  - 二次引用（r07 F-10, C）: 魚の水晶体はほぼ球形で、角膜は水中で光学的に無効。Matthiessen 比 2.55（変動 2.40–2.82）。
  - 二次引用（r07 F-30, B）: 真骨魚の瞳孔は固定が大半。
- 適用範囲: 参照写真。「楕円」は斜め視点の見え方を含み、瞳孔の形の違いとは限らない。ハイライトは撮影環境の映り込み。
- 出典: catalog の `eye`。r07_eye_head_mouth.md の F-08、F-10、F-30（同ディレクトリ）。
- 証拠: [P] p001 "橙金〜銅色の細い環(外径≈24px)"、[C]（r07 F-10 の二次引用部分）.

### F-12 頭部・口・鰓蓋の見え方（口の状態、口内、鰓腔）
- 主張/値（ヤマメ判定 57 枚の `head_mouth`）:
  - `mouth_state`: closed 34、open 14、hooked_by_lure 8、not_visible 1。
  - `maxilla_end_vs_eye`: behind_eye 26、below_center 15、not_visible 15、below_front 1。
  - `jaw_kype`: none 53、clear 2、slight 2。
  - 口内: p012（`landing_net`、婚姻期とみられる雄）「口内は暗く、舌は桃色」、p047（`ground`）「口は少し開き、口内の灰紫が見える」。「歯」の語を含む記述は 0 枚（歯は写真から読み取れていない）。
  - 鰓: p061（`hand`）「握りで鰓蓋が開き鰓腔の赤が見える」。p042 は「鰓蓋下縁に赤みが少しある」。p063 は鰓蓋上部の橙赤斑（鰓ではなく体色）。
  - 鰓蓋: 後縁が明るく縁取られる（p061）、前鰓蓋の弧と縦溝（p022, p024）。色は銀・桃・紫・橙が写真・光で変わる（二次引用: r07 F-18, P）。
- 適用範囲: 参照写真。釣り上げ・網の中など、通常の遊泳状態でない個体が多い（context: ground／landing_net／hand の計 35 枚）。口開閉の頻度は自然状態の頻度ではない。
- 出典: catalog の `head_mouth`、`context`。r07_eye_head_mouth.md F-15、F-16、F-18、F-19（二次）。
- 証拠: [P] p061 "握りで鰓蓋が開き鰓腔の赤が見える"、p012 "口内は暗く、舌は桃色".

### F-13 鰭の半透明（二次引用）
- 主張/値: r06 F-19（二次引用、P）: ヤマメ判定 57 枚のうち「半透明」の語を含む鰭は、胸鰭 34・腹鰭 33・臀鰭 38・背鰭 31・尾鰭 23。鰭条が見える記述は胸鰭 17・背鰭 15・腹鰭 14・尾鰭 9・臀鰭 4 と少なく、**鰭条は「うっすら見える」程度**。p001: 「背鰭: 半透明灰色で体上に倒れる、鰭条が見える」「尾鰭: 半透明の灰褐色、基部は橙褐」。鰭条数（青森ヤマメ, A, 二次引用: r06 F-04）: 背 12–13、胸 12–14、腹 9、臀 12–14。
- 適用範囲: 写真（上記）、鰭条数は青森産（旭川産は別値）。
- 出典: r06_skin_scale_optics.md F-19、F-04（同ディレクトリ）、catalog p001。
- 証拠: [P] p001 "半透明灰色で体上に倒れる(x≈330-440,y≈150-215)、鰭条が見える".

---

### Part C — 数値計算（ランク M（計算））

入力値が M または他ストリーム由来のため、結果は M。計算スクリプトはスクラッチパッドで実行（計算式は各項に記載）。

### F-14 鱗ピッチと画素フットプリント（鱗の折り返しが始まる距離）
- 主張/値: ピッチ p を r06 の暫定レンジ 0.55–0.9 %SL（r06 F-06: 側線有孔鱗 118–134 枚 [A, 青森] を側線長 0.76×SL と仮定して算出。仮定を含む）とし、画素フットプリント k = 2·tan(FOV/2)/H [m/m]、距離 d で 1 画素が覆う長さは k·d。
  - ナイキスト限界（ピッチ＝2 px となる距離）d = p/(2k)、ピッチ＝1 px となる距離 d = p/k。
  - 縦 FOV 50°、H=1080: SL 100 mm（p=0.55–0.90 mm）で 0.32–0.52 m／0.64–1.04 m。SL 200 mm（p=1.10–1.80 mm）で **0.64–1.04 m／1.27–2.08 m**。SL 300 mm（p=1.65–2.70 mm）で 0.96–1.56 m／1.91–3.13 m。
  - 縦 FOV 50°、H=2160(4K 相当): SL 200 mm で 1.27–2.08 m／2.55–4.17 m。縦 FOV 60°、H=1080: SL 200 mm で 0.51–0.84 m／1.03–1.68 m。
  - 体長方向の鱗数は 100/p[%] = 111（0.9 %SL）〜182（0.55 %SL）。1 枚あたり 4／6／8 texel とすると体長方向 444–727／667–1091／889–1455 texel。
- 適用範囲: ヤマメ SL 100–300 mm の仮想個体。ピッチは r06 の暫定値（側線有孔鱗数からの換算）であり、体側の実際の鱗ピッチではない。鱗の大きさは体の部位（頭寄り／尾柄）で変わりうる（未確認）。
- 出典: 本書の計算（r06 F-06 の暫定ピッチを入力）。
- 証拠: [M（計算）] 入力の A 部分（有孔鱗 118–134 枚）は r06 経由の二次引用。

### F-15 水中の RGB 別 Beer–Lambert 減衰（純水の下限）
- 主張/値: 入力は r06 F-30 の記憶値（純水の吸収係数 a [m⁻¹]: 500 nm≈0.020、550≈0.064、600≈0.22、650≈0.34、700≈0.62。出典と細部は r06 でも特定されておらず M）。透過率 T = exp(-a·d):
  - d=1 m: 500/550/600/650/700 nm = 0.980/0.938/0.803/0.712/0.538。d=3 m: 0.942/0.825/0.517/0.361/0.156。d=10 m: 0.819/0.527/0.111/0.033/0.002。
  - RGB 代表波長を 650/550/465 nm とし、465 nm の a=0.010（本書の記憶、M）を使うと、`attenuationDistance` = 1／2／5 m に対する `attenuationColor`（= exp(-a·d)）は R/G/B = 0.712/0.938/0.990、0.507/0.880/0.980、0.183/0.726/0.951。
  - `FogExp2` との比較: 密度 ρ=0.3 で透過率 exp(-(ρd)²) は d=1,2,3,5 m で 0.914/0.698/0.445/0.105。同じ ρ の Beer 型 exp(-ρd) は 0.741/0.549/0.407/0.223。形が違う。
- 適用範囲: 純水の理想化。実際の渓流は CDOM・懸濁粒子の吸収と散乱が加わり、青側の減衰が大きく緑〜黄褐に偏る傾向（一般則、M）。r06 F-45（C）には河川の Kd380 が 0.68–151.1 m⁻¹ と幅が大きい報告の二次引用がある。
- 出典: 本書の計算。入力は r06_skin_scale_optics.md F-30（M）。
- 証拠: [M（計算）]。

### F-16 スネルの窓・フレネル・クリアコート F0 の比較
- 主張/値（n_water=1.333 の非偏光厳密フレネルと、Schlick 近似の比較）:
  - 臨界角 48.61°、スネルの窓 全角 **97.21°**（r06 F-30 の値を再計算で確認）。
  - 空気→水の反射率（厳密）: 0°/45°/60°/70°/80°/85° で 0.0204/0.0279/0.0597/0.1335/0.3479/0.5835。水→空気は 45° で 0.1395、48° で 0.4331、60° 以上は全反射。
  - 水膜の F0 = ((1.333−1)/(1.333+1))² = **0.0204**。Three.js のクリアコートは F0=0.04（F-03）。
  - 空気中の水膜（厳密）に対する、クリアコートの Schlick(F0=0.04) の値と、その 0.5 倍の値: 0°: 0.0204 対 0.040／0.020。60°: 0.0597 対 0.070／0.035。70°: 0.1335 対 0.158／0.079。80°: 0.3479 対 0.410／0.205。85°: 0.5835 対 0.649／0.324。
  - Schlick(F0=0.0204) 自体も 80° で 0.398、85° で 0.641 と厳密値より大きく出る（Schlick 近似の掠め角での過大評価）。
- 適用範囲: 平らな水膜を想定した理想化。実際の魚体は曲面で、粘液は薄く、表皮・鱗の屈折率は未確認（r06 Gap-5）。
- 出典: 本書の計算。
- 証拠: [M（計算）]。入力の F0=0.04 は [B(code)]（F-03）。

### F-17 グアニン／細胞質の 1/4 波長厚と、Three.js の虹彩膜厚範囲
- 主張/値: 1/4 波長光学厚（nd=λ/4）から、グアニン n=1.83（記憶、M）で d = 61.5／75.1／88.8 nm（λ=450／550／650 nm）。細胞質 n=1.34 で 84.0／102.6／121.3 nm、n=1.37 で 82.1／100.4／118.6 nm。Three.js の `iridescenceThicknessRange` の既定 [100, 400] nm（F-02）の下限 100 nm はグアニン板 1 層の 1/4 波長厚（61–89 nm）より厚い。細胞質層の 1/4 波長厚（82–121 nm）はレンジ内。
- 適用範囲: 理想化した仮定値。サケ科のグアニン板の屈折率・厚み・層数は未確認（r06 Gap）。Three.js の虹彩は単層で、2 種の層を交互に重ねる多層膜は表現できない（F-01）。
- 出典: 本書の計算。グアニン n=1.83 は記憶（M）。
- 証拠: [M（計算）]。

---

### Part D — 技法の記憶メモ（ランク M：すべて未検証。検索ができなかったため、論文名・著者・年は検証用リードである）

### F-18 薄膜干渉の実時間近似（Belcour & Barla 2017）
- 主張/値（記憶）: Belcour & Barla, "A Practical Extension to Microfacet Theory for the Modeling of Varying Iridescence", ACM Transactions on Graphics 36(4)（SIGGRAPH 2017）。薄膜の反射を分光領域で積分する代わりに、光路差の周波数（Fourier）空間で評価し、CIE の XYZ 感度曲線をガウス関数で近似して閉形式にする。微小面理論に組み込む際は Fresnel 項を薄膜の Fresnel に置き換え、膜厚を変えられる。Three.js の実装（F-01）はこの手法に沿っている（コメント URL と Fourier 空間・ガウス近似は [B(code)] で確認）。論文本文が主張する精度・コスト・高調波の次数に関する記述は、検索できていないので未確認。
- 適用範囲: 論文が扱うのは単層薄膜。多層膜（グアニン／細胞質の積層）の実時間近似は別の文献が要る（未調査）。
- 出典: なし（記憶）。検証用リード: Belcour & Barla (2017) 上記。
- 証拠: [M]（論文内容）。実装との対応のみ [B(code)]。

### F-19 魚の銀色を「広帯域鏡面＋弱い虹彩」で作る設計案
- 主張/値: 魚の銀色は高屈折率のグアニン板と低屈折率の細胞質を交互に積んだ多層反射体で、ニシン・イワシ類では光学軸の向きが異なる 2 集団の結晶で偏光を打ち消し、層間隔の分布で広帯域化する（r06 F-33, A, PROXY:ニシン・イワシ等の二次引用）。サケ科での層構造は未確認。一方 Three.js の虹彩は単層・スカラー IOR（F-01）。→ 設計案（M）: 銀色成分は `metalness` を高めに、F0 をほぼ無彩色（わずかに青緑寄り）にし、環境反射で見せる。虹彩は `iridescence` を弱く（鰓蓋・腹側・体側境界の局所にマスクをかけ）載せ、色相の角度依存を足す。写真で虹色（青紫〜桃）の言及は 70 枚中 6 枚（r06 F-18, P の二次引用）。
- 適用範囲: ヤマメの銀化度（パー〜スモルト、r06 F-01/F-02）による差は別パラメータ。
- 出典: なし（記憶、設計案）。二次引用: r06_skin_scale_optics.md F-33（A, PROXY）、F-18（P）。
- 証拠: [M]（設計案）。

### F-20 濡れた／粘液表面のモデル化
- 主張/値（記憶）: 濡れた不透明表面の見えは、(a) 表面の粗さ低下（水が微細凹凸を埋める）、(b) 水膜／粘液の薄い誘電体層による鏡面（F0≈0.02）、(c) 多孔質材質では拡散色の暗化（Jensen らの濡れ材質の研究）、の組合せで近似される。魚体は多孔質でないので、(c) の暗化は小さい（M）。粘液層の厚みは、PROXY の孫引きで「500–600 Å と 1–2 µm」（r06 F-37, C。何を測った値か不明）。厚み約 1 µm 以上の膜では白色光の干渉縞は平均化されて目立たない（M）。→ 設計案: 乾燥時の `roughness` を高め、濡れ状態でクリアコートを足す（`clearcoat`＝1、`clearcoatRoughness` を小さく）、水滴・水膜の波紋は `clearcoatNormalMap` に入れる。初期値は調整用の仮置きであり、実測値ではない。
- 適用範囲: 空気中の魚体。水中では F-16 のとおり界面反射が消えるので無効。
- 出典: なし（記憶）。検証用リード: Jensen, Legakis & Dorsey (1999) "Rendering of Wet Materials"（Eurographics Rendering Workshop）。
- 証拠: [M]。厚み値は [C]（r06 F-37 の孫引き）。

### F-21 法線マップのミップによる光沢の消失への対策（Toksvig、LEAN、分布フィルタ）
- 主張/値（記憶）:
  - **Toksvig (2004, "Mipmapping Normal Maps", Journal of Graphics Tools)**: ミップで平均した（正規化前の）法線の長さ |Na| から、鏡面指数 s を s' = ft·s、ft = |Na| / (|Na| + s(1−|Na|)) に下げる。計算例（本書）: s=64 で |Na|=1.0／0.99／0.95／0.90／0.80 に対し s'=64.0／38.9／14.7／7.9／3.8。
  - **LEAN mapping (Olano & Baker 2010, I3D)**: 法線の平均勾配 B と二次モーメント M をテクセルごとに持ち、線形フィルタ可能にして、共分散から粗さ（異方性を含む）を復元する。
  - **Kaplanyan et al. (2016, HPG)** の法線分布のフィルタリング、**Tokuyoshi & Kaplanyan (2019)** の幾何的鏡面アンチエイリアスは、Three.js の `geometryRoughness`（F-06）に近い系統。
  - r186 では法線マップ由来の分散を扱う組込みが無い（F-06）ので、実装案は (1) オフラインで各ミップ階層の粗さを Toksvig／LEAN 的に補正した粗さマップを作る、(2) シェーダ内で法線マップの分散を別マップ（分散マップ）で持つ、の 2 通り。
- 適用範囲: GGX／Beckmann を使う鏡面。公式の詳細・係数は未確認。
- 出典: なし（記憶）。検証用リード: 上記の著者・年・誌名。
- 証拠: [M]。計算例のみ [M（計算）]。

### F-22 鱗の法線マップ生成（重なり鱗パターン）の設計案
- 主張/値（記憶＋設計案）: 円鱗は瓦状に重なり、後縁側が露出する（r06 F-27, M）。高さ場は、(a) 菱形（千鳥）格子に円形〜楕円形の鱗を並べ、(b) 各鱗の高さは前縁側で低く、露出する後縁に向かって緩やかに上がり、縁で小さな段差を作り、(c) 表面に同心円状の隆起（circuli）の微弱な縞を乗せる、という手順で生成し、高さ場から法線を計算する。サイズは F-14 の暫定ピッチ（0.55–0.9 %SL）で UV に割付け、写真側の「鱗の凹凸は極小」（F-10）に合わせて**法線の傾きは小さく**する。鱗の列の傾き・重なり量・段差の大きさ・隆起線の間隔は未確認（Gap-6）。
- 適用範囲: 設計案。ヤマメの鱗の実測形状は無い。
- 出典: なし（記憶、設計案）。二次引用: r06 F-27（M）、F-15/F-16（P）。
- 証拠: [M]。

### F-23 半透明な鰭（薄い膜の透過光）の近似
- 主張/値（記憶＋設計案）: 厚み d の薄い膜の透過は、単純な Beer 則 T = exp(−σ·d/|cosθ|) で近似でき、バックライトされた鰭は色素の吸収で色づく。散乱を含む場合は、Barré-Brisebois & Bouchard (GDC 2011) の視線依存の透過項（F-08 のアドオンの実装）が安価。Jimenez らの "Real-time realistic skin translucency"（IEEE CG&A 2010）はシャドウマップから厚みを推定する方式で、皮膚用の記憶。鰭膜の厚み（µm）は未確認（r06 Gap-6）。鰭条のバンプは、鰭条方向に沿った細い隆起の法線マップ＋鰭条沿いの不透明度（吸収）の濃淡で表現できる（設計案）。
- 適用範囲: 設計案。鰭膜の光学定数は仮定。
- 出典: なし（記憶）。検証用リード: Barré-Brisebois & Bouchard (2011)（F-08 のコメント URL と一致）、Jimenez ら (2010)。
- 証拠: [M]。実装の存在のみ [B(code)]（F-08）。

### F-24 眼のレンダリング（角膜、虹彩、瞳孔、スペキュラ）の設計案
- 主張/値（記憶＋設計案）: 人間のキャラクター向けの眼シェーダ（角膜の屈折による虹彩のパララックス、強膜の SSS、ウェットな縁など）の知識は多いが、魚眼には当てはまらない部分がある。魚眼は水晶体がほぼ球形で、角膜は水中でほぼ屈折力を持たない（r07 F-10, C）。→ 設計案: (1) 眼窩に球形の眼球メッシュ、(2) 虹彩（金色の環、F-11）と瞳孔（黒の円盤、F-11）を円盤状メッシュにして、角膜の球冠の奥に数 %眼径だけ離して置く（視差は実形状で得る）、(3) 角膜は透明で、環境反射（`specularIntensity`、小さな粗さ）と湿り気のハイライトのみを担当し、`transmission` は使わない（F-04 のコストと、透過物体同士が映らない制約のため）、(4) 虹彩の金色は異方的な反射層（グアニン）を持つ可能性があるが未検証。(5) 空気中の写真では映り込みが目立つ（F-11）ので、空気中・水中でハイライト強度を変える。
- 適用範囲: 設計案。空気中の魚眼で角膜の屈折がどう見えるか（空気／角膜界面の屈折、M）は未確認。
- 出典: なし（記憶、設計案）。二次引用: r07 F-10（C）、F-30（B）。
- 証拠: [M]。

### F-25 水中表現（吸収・散乱、コースティクス、神の光、スネルの窓）
- 主張/値（記憶＋設計案）:
  - 距離 r での見え: L = L0·exp(−c·r) + L_水·(1 − exp(−c·r))（c は吸収 a と散乱 b の和のビーム減衰係数、L_水は背景の水色、チャンネルごとに c が違う）。r186 のフォグ（F-05）はこの式の形と違うので、`fog_fragment` を差し替えるか、ポストプロセスで深度から計算する。
  - **コースティクス**: GPU Gems 1 第 2 章（Guardado & Sánchez-Crespo, "Rendering Water Caustics"）は、動くコースティクス模様のテクスチャを太陽方向から受け手に投影し、深度で減衰させる安価な方法。Evan Wallace の WebGL Water（2011）は、屈折させた格子の面積比から明るさを求める方法。Three.js では `SpotLight.map` の投影テクスチャ（F-08）が一つの足がかりだが、方向光には使えない。
  - **神の光**: GPU Gems 3 第 13 章（Kenny Mitchell, "Volumetric Light Scattering as a Post-Process"）の、光源のスクリーン位置に向かう放射状ブラー。Three.js r186 の WebGL には既製品がなく、`GodraysNode` は WebGPU/TSL（F-08）。
  - **スネルの窓**: 水中から水面を見上げると全角 97.2° の円内に空が見え、外側は全反射で水底を映す（F-16）。魚の背側視点（上から見る）には影響が小さく、下から見上げるカメラのときに効く。
  - 純水の吸収係数の出典は Pope & Fry (1997) と Smith & Baker (1981)（r06 F-30 でも記憶）で未検証。
- 適用範囲: 設計案。日本の渓流の光学定数は未確認。
- 出典: なし（記憶）。検証用リード: Guardado & Sánchez-Crespo (GPU Gems 1, 2004)、Mitchell (GPU Gems 3, 2007)、Wallace (2011) の WebGL Water、Pope & Fry (1997) Applied Optics。
- 証拠: [M]。

### F-26 ユーザー依頼「ヤマメの骨格を口・顔・鰓の再現に利用」に関する、レンダリング側の要件
- 主張/値: ユーザー提供の骨格画像 s01.jpg（上記「調査制約」6）は、頭部が画像下端に短縮して写る透明骨格標本で、頭部は濃い青の塊に見え、顎・鰓蓋の個別の骨は判別できない（P。目視。r15 の結論と同じ）。標本には種の確証がない（"…ncorhynchus" の断片のみ）。したがって、**骨格画像から口・顔・鰓の寸法をこのストリームでは読み取っていない**。レンダリングと変形のために、骨格（r15 の成果、または別角度の標本画像）から読み取るべき項目（設計案、M）:
  - 眼窩の位置と大きさ（眼径／頭長、r07 F-01〜F-04 の数値と照合）、眼窩縁の形（暗輪 34/57、P）。
  - 上顎（前上顎骨・主上顎骨・上主上顎骨）と下顎（歯骨・関節角骨）の長さと関節位置。主上顎骨後端の位置（眼との位置関係、F-12: behind_eye 26、below_center 15、P）。開口角の最大値は未確認（r07 F-17）。
  - 鰓蓋骨系（鰓蓋骨・前鰓蓋骨・間鰓蓋骨・下鰓蓋骨）と鰓条骨（r07 F-19: 青森産で鰓条骨数 11 の記述があるが部位に曖昧さ）。鰓蓋の開閉の蝶番位置と、鰓膜が胸鰭基部まで達するか（p041）。
  - 口内の見え: 暗い口内、桃色の舌（p012）、歯の分布（鋤骨・口蓋骨・舌の歯は r07 F-16, M。写真では歯の記述 0 枚）。
  - レンダリングへの対応: 口内と鰓腔は、開口／鰓蓋開放のときだけ露出するので、専用の暗色／赤色マテリアルとブレンドシェイプ（モーフターゲット、F-09）で足りる。ボーンは顎・鰓蓋に少数、というのが目安（本数は未確認、Gap-10）。
- 適用範囲: 設計案。骨格データの確認前。
- 出典: ユーザー提供画像 `scratchpad/skeleton/s01.jpg`（目視のみ）。二次引用: r07_eye_head_mouth.md F-15〜F-19、r15_cranial_osteology.md（同ディレクトリ）。
- 証拠: [M]（設計案）／[P]（s01.jpg の目視所見と、引用した写真所見）。

---

## 3. 資料間の矛盾・不一致

1. **クリアコートの F0**: Three.js は 0.04 固定（IOR 1.5 相当、F-03）、水膜は 0.0204（F-16、M 計算）。係数を 0.5 にして垂直入射に合わせると掠め角で過小（80° で 0.205 対 0.348）、1.0 のままだと垂直で 2 倍・80° で +0.06。どちらも厳密には合わない。**未解決**。
2. **虹彩の既定レンジと、グアニン 1/4 波長厚**: Three.js／glTF の既定 100–400 nm（F-02）に対し、グアニン n=1.83 の仮定では 61–89 nm（F-17）。グアニン n、層構造が未確認なので、どちらが「正しい」とは言えない。
3. **銀色の性質**: 薄膜干渉（狭帯域の虹色）対 広帯域・非偏光の多層反射（r06 F-33, A, PROXY:ニシン・イワシ）。写真側の虹色の言及は 6/70 と少ない（r06 F-18, P）。→ 本書は「広帯域鏡面＋弱い虹彩」を採るが（F-19）、サケ科（ヤマメ）の反射体の直接証拠は無い。
4. **水中の光沢**: 写真集計では空気中 39 枚で「水膜」12／「濡れ」27、水中・水槽 18 枚で 0／5（F-10）。r06 F-17 の先行集計では、空気中（ヤマメ判定 39 枚）の 34 枚に「濡れた艶／水膜」とあり、**語の定義（水膜のみか、濡れ・艶を含むか）で数が違う**。本書は元の語を表に示した。傾向（空気中で多い）は両者で一致。
5. **粘液の厚み**: r06 F-37（C, 孫引き）で「500–600 Å と 1–2 µm」とあり、何を測った値か不明。薄膜干渉として扱うか否かの判断（F-20）に影響する。**未解決**。
6. **純水の吸収係数**: r06 F-30 でも「Smith & Baker (1981) と Pope & Fry (1997) で細部が異なる」と注記されている。本書も同じ記憶値を使っている（550 nm で 0.064）。別の記憶では 550 nm で 0.056–0.06 付近という感触があり、1/e 深さが 16–18 m の間で揺れる。いずれも M で、検証できていない。

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル／アニメ／行動実装に必要だが確認できなかった事項

検索予算（200/200）が尽きていたため、**調査課題 1〜7 の文献的裏付けはすべて未取得**である。

- **Gap-1（課題 1）**: Belcour & Barla (2017) 論文本文の記述（高調波の次数・精度・コスト、制限事項の記述）、KHR_materials_iridescence の仕様本文の制約記述。多層膜（グアニン／細胞質の積層）の実時間近似手法（Airy 和・転送行列・LUT 化）。魚の構造色のレンダリング事例。
- **Gap-2（課題 2）**: 濡れた表面・粘液のレンダリング文献（Jensen らの濡れ材質、ゲームの濡れ表現）、乾燥／湿潤のラフネス差の実測値。魚の粘液の屈折率・厚み・散乱（r06 Gap-5 と同じ）。
- **Gap-3（課題 3）**: Toksvig／LEAN／Kaplanyan らの原論文の式の確認、鱗の法線マップ生成の先行事例、鱗の寸法（mm／体長比）。ヤマメの鱗ピッチは側線有孔鱗数からの暫定換算（F-14）だけで、直接の実測が無い。
- **Gap-4（課題 4）**: 鰭膜の厚み（µm）と透過率、鰭条のバンプ（隆起）の寸法。薄膜の SSS／透過近似の文献。
- **Gap-5（課題 5）**: 魚眼のレンダリング事例、角膜の厚み・屈折率、空気中での魚眼角膜の見え方、虹彩の反射層の厚み。人間用の眼シェーダ文献（Jimenez ら等）の確認。
- **Gap-6（課題 6）**: 日本の渓流の可視域の吸収・散乱スペクトル（Kd）、純水の吸収係数の数値出典（Pope & Fry 1997）、コースティクス／神の光の手法の原典確認。鱗の列の傾き・重なり量・段差・隆起線間隔。
- **Gap-7（課題 7）**: **魚・ゲーム資産の事例（ポリ数、テクスチャ解像度、ボーン数、LOD）は 1 件も確認できていない。** 記憶ベースの数値も、根拠が弱すぎるので本書には載せなかった。
- **Gap-8**: 魚体の質感に関する実時間レンダリングの先行研究（皮膚シェーダ、鱗、虹色）。
- **Gap-9**: `SubsurfaceScatteringShader` を PBR（`MeshPhysicalMaterial`）へ移植する際のコストと見た目の検証（実装・実測はしていない）。
- **Gap-10**: モーフターゲット数の上限（`DataArrayTexture` の層数、環境依存）、口・鰓蓋に必要なボーン数。
- **Gap-11**: ユーザー提供の骨格画像（s01.jpg）は、頭部が短縮・重なりで判別できず、種も未確認（Oncorhynchus 属らしき標本）。口・顔・鰓の骨格由来の寸法（F-26）は、側面（または正面）から撮った頭部骨格の資料が得られるまで、本書では反映できない。r15_cranial_osteology.md の結論を参照すること。
- **Gap-12**: Three.js のコード確認は r186.1 のみ。WebGPU（NodeMaterial）側の虹彩・クリアコート・透過の実装は未確認。実際に描いて見た目を確認する作業は未実施。
- **Gap-13**: 水中・水槽・空気中の写真の色・光沢を実測する計測（測色・測光）。写真は AI による目視記述で、露出・画像処理に依存する。

### 次回、検索予算が使える場合の優先クエリ案（日英。論文本文の文を予想した形）
1. "A Practical Extension to Microfacet Theory for the Modeling of Varying Iridescence" Belcour Barla — Fourier 空間・ガウス近似・2 次の高調波の記述の確認（allowed_domains: belcour.github.io, dl.acm.org, hal.science）。
2. "Mipmapping Normal Maps" Toksvig; "LEAN Mapping" Olano Baker; "Filtering distributions of normals for shading antialiasing" — 式の確認。
3. "Rendering Water Caustics" GPU Gems chapter 2; "Volumetric Light Scattering as a Post-Process" GPU Gems 3 chapter 13（developer.nvidia.com）。
4. "absorption coefficient of pure water Pope Fry 1997 550 nm 600 nm 650 nm" — 純水の吸収係数の数値。
5. "guanine crystal platelet thickness multilayer reflector salmonid skin" 、"サケ科 皮膚 グアニン 層 厚さ" — グアニン層の数値。
6. "fish mucus refractive index thickness skin trout" 、"魚 粘液 屈折率 厚さ"。
7. "fin membrane thickness trout pectoral fin ray micrometer"。
8. "fish model polygon count rigged bones game low poly LOD" — ゲーム資産の事例。

---

## 5. 出典一覧（URL付き。重複排除）

### 5.1 実ソースコード（npm）
- `three@0.186.1`（npm の `latest`、2026-10-01 時点）。本書で参照したファイル（`node_modules/three/` 以下）:
  - `src/renderers/shaders/ShaderChunk/`: `iridescence_fragment.glsl.js`、`iridescence_pars_fragment.glsl.js`、`lights_fragment_begin.glsl.js`、`lights_physical_fragment.glsl.js`、`lights_physical_pars_fragment.glsl.js`、`transmission_fragment.glsl.js`、`transmission_pars_fragment.glsl.js`、`fog_fragment.glsl.js`、`fog_pars_fragment.glsl.js`、`normal_fragment_begin.glsl.js`、`normal_fragment_maps.glsl.js`、`bumpmap_pars_fragment.glsl.js`、`displacementmap_vertex.glsl.js`、`skinning_pars_vertex.glsl.js`、`skinning_vertex.glsl.js`、`envmap_physical_pars_fragment.glsl.js`
  - `src/renderers/shaders/ShaderLib/meshphysical.glsl.js`
  - `src/renderers/WebGLRenderer.js`（`renderTransmissionPass`）、`src/renderers/webgl/WebGLMorphtargets.js`
  - `src/materials/MeshPhysicalMaterial.js`、`src/objects/Skeleton.js`、`src/objects/LOD.js`、`src/lights/SpotLight.js`、`src/nodes/accessors/AccessorsUtils.js`（`parallaxUV`）
  - `examples/jsm/shaders/SubsurfaceScatteringShader.js`、`examples/jsm/tsl/display/GodraysNode.js`、`examples/jsm/tsl/display/SSSNode.js`、`examples/jsm/objects/WaterMesh.js`、`examples/jsm/objects/Water.js`
- `@gltf-transform/extensions@4.5.1`: `dist/index.d.ts`、`src/khr-materials-iridescence/iridescence.ts`。

### 5.2 ソースコード内コメントに現れた URL（到達確認なし。出典の「リード」として記載）
- https://belcour.github.io/blog/research/2017/05/01/brdf-thin-film.html
- https://colinbarrebrisebois.com/2011/03/07/gdc-2011-approximating-translucency-for-a-fast-cheap-and-convincing-subsurface-scattering-look/
- https://github.com/Ameobea/three-good-godrays
- https://mmikk.github.io/papers3d/mm_sfgrad_bump.pdf
- https://github.com/KhronosGroup/gltf/blob/main/extensions/2.0/Khronos/KHR_materials_iridescence/
- https://github.com/KhronosGroup/gltf/blob/main/extensions/2.0/Khronos/KHR_materials_volume/
- https://panoskarabelas.com/posts/screen_space_shadows/ （SSSNode のコメント。本書の結論には使っていない）

### 5.3 写真・他ストリーム（二次引用）
- 写真カタログ: `/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json`〜`catalog_c07.json`（p001 の元ページ https://www.ana.co.jp/travelandlife/article/000941/ ）。
- `/home/user/gerupamasini/docs/yamame/research/r06_skin_scale_optics.md`（F-04, F-06, F-17, F-18, F-19, F-23〜F-30, F-33, F-37, F-45 の二次引用）。
- `/home/user/gerupamasini/docs/yamame/research/r07_eye_head_mouth.md`（F-01〜F-04, F-08, F-10, F-15〜F-19, F-30 の二次引用）。

### 5.4 検証用リード（記憶。未検証、URL なし）
- Belcour & Barla (2017) ACM TOG 36(4)／Toksvig (2004) J. Graphics Tools／Olano & Baker (2010) I3D LEAN／Kaplanyan et al. (2016) HPG／Tokuyoshi & Kaplanyan (2019)／Jensen, Legakis & Dorsey (1999)／Barré-Brisebois & Bouchard (GDC 2011)／Jimenez et al. (2010) IEEE CG&A／Guardado & Sánchez-Crespo, GPU Gems 1 ch.2／Mitchell, GPU Gems 3 ch.13／Wallace (2011) WebGL Water／Pope & Fry (1997) Applied Optics／Smith & Baker (1981)。

---

## 6. 検索ログ

### 6.1 外部検索（WebSearch）— 実行成立 0 回、拒否 3 回
すべて mode: standard。3 件とも "Web search was not performed: this session has used its web search budget (200 of 200 WebSearch calls)" で拒否され、結果は得られていない。以降は検索を行っていない（WebFetch、curl での外部取得も行っていない）。

| # | クエリ | mode | 結果 | 有用度 |
|---|---|---|---|---|
| 1 | Belcour Barla 2017 "A Practical Extension to Microfacet Theory for the Modeling of Varying Iridescence" thin film real-time | standard | 拒否（予算 200/200） | なし |
| 2 | KHR_materials_iridescence glTF extension iridescenceIor iridescenceThicknessMinimum thin-film limitations | standard | 拒否（予算 200/200） | なし |
| 3 | LEAN mapping Toksvig normal map antialiasing specular roughness mip filtering | standard | 拒否（予算 200/200） | なし |

### 6.2 ローカル調査（検索ではないが本書の根拠）
- npm からの `three@0.186.1`、`@gltf-transform/extensions@4.5.1` の取得とソース読解（F-01〜F-09）。有用度: 高（Three.js 実装の確認）。
- 写真カタログ 70 枚の再集計（F-10〜F-12）。有用度: 中（語の一致が粗い）。
- r06、r07、r10 の既存記述の参照（二次引用）。有用度: 中。
- 数値計算（Python、F-14〜F-17）。有用度: 中（入力が M／二次のため結果も M）。
- セッションの添付 PDF ページ画像（3D モデリング用 実写写真資料 70 枚）の確認: ヤマメの骨格図は含まれていなかった。骨格画像は `scratchpad/skeleton/s01.jpg` で確認（目視のみ。詳細解析は r15 に委ねた）。

### 6.3 総検索回数
- 実行成立した WebSearch: **0 回**（拒否された呼び出し: 3 回）。mode:"extended": 0 回。
