# r14_render_tech.md 独立検証（懐疑的レビュー）

検証対象: `/home/user/gerupamasini/docs/yamame/research/r14_render_tech.md`（全 573 行を読了。元ファイルは書き換えていない）
検証日: 2026-10-01
方法:
1. **WebSearch 11 回**（割当 11、すべて mode: "standard"、拒否 0 回、extended 0 回）。元の調査員が使っていないクエリ、または別ドメイン指定で実行。
2. **Three.js の実ソース再確認**（`three@0.186.1` の tarball `scratchpad/three/three-0.186.1/package` を grep / sed。検索の代わりに使用）。判定名は **CONFIRMED-CODE**（実装がそうなっていることを再確認）。
3. **ローカル再計算**（Python）。判定名は **CONFIRMED-CALC**（元の M(計算) を独立に再計算して一致）。ただし入力が M の場合、結果の意味づけは M のまま。

注意: 検索結果は「タイトル・URL・モデルの要約」だけで、論文全文は読めていない。要約が数値を明示したものだけを判定に使った。要約が「質問文の数値は〜と整合する」と言い換えただけの場合は、裏取りとして扱っていない（V-12）。

判定の凡例: CONFIRMED-MULTI（独立 2 資料以上が一致）/ CONFIRMED-SINGLE / CONFIRMED-CODE / CONFIRMED-CALC / CONTRADICTED / UNVERIFIABLE / NOT-CHECKED（予算外、検証していない）。

---

## 1. 検証表（20 主張）

| ID | 主張（要約、元ファイルの位置） | 判定 | 補正値／範囲 | 新規出典・確認箇所 | 備考 |
|---|---|---|---|---|---|
| V-01 | Three.js r186.1 の虹彩は Belcour–Barla 型の Fourier 評価で高調波 m=1,2 まで、単層、膜 IOR はスカラー、外側 IOR は 1.0 固定、Fresnel は s/p 分離なしの Schlick、強度は `iridescenceMap`.R、膜厚は `iridescenceThicknessMap`.G、鏡面 Fresnel だけを置換（F-01、要約 1,2） | **CONFIRMED-CODE** | 差なし | `ShaderChunk/iridescence_fragment.glsl.js` 行 54（evalIridescence）, 59（`mix(outsideIOR, eta2, smoothstep(0.0, 0.03, thickness))`）, 75/84（`F_Schlick`）, 105（`for (int m = 1; m <= 2; ++m)`）。`lights_fragment_begin.glsl.js` 行 30（`dotNVi = saturate(dot(normal, geometryViewDir))`）, 44–45（`evalIridescence(1.0, material.iridescenceIOR, dotNVi, ...)` を誘電体用・金属用で 2 回）。`lights_physical_fragment.glsl.js` 行 101（`.r`）, 107（`.g`）。`lights_physical_pars_fragment.glsl.js` 行 177（`F = mix(F, material.iridescenceFresnel, material.iridescence)`） | 既定値 `iridescenceIOR = 1.3`、`iridescenceThicknessRange = [100, 400]` も `MeshPhysicalMaterial.js` 行 193/202 で確認。KHR 拡張の既定値（gltf-transform 側）は今回再確認していない |
| V-02 | クリアコートは F0=0.04（IOR 1.5 相当）固定、F90=1.0、粗さ下限 0.0525 に幾何粗さを加算、下層は `outgoingLight*(1-clearcoat*Fcc)` で減衰（F-03、要約 5） | **CONFIRMED-CODE** | 差なし | `lights_physical_fragment.glsl.js` 行 60–61（`clearcoatF0 = vec3(0.04)`, `clearcoatF90 = 1.0`）, 76–77（`max(.., 0.0525)` と `+= geometryRoughness`）。`meshphysical.glsl.js` 行 214, 216 | 屈折率を入力する口は無い。基底粗さにも `max(roughnessFactor, 0.0525)`（行 10） |
| V-03 | `transmission` は透過物が 1 つでもあると不透明物を半精度・MSAA(≥4)・ミップ付き RT へ再描画し、スクリーン空間で屈折サンプル。透過物同士は互いに映らない。Beer 則の `attenuationColor/Distance` は物体内部の厚みのみ（F-04、要約 10,12） | **CONFIRMED-CODE** | 補足 1 点（下記） | `WebGLRenderer.js` 行 2002–2076（`renderTransmissionPass`: `generateMipmaps: true`, `type: HalfFloatType`（half float 拡張がある場合のみ、無ければ UnsignedByteType）, `LinearMipmapLinearFilter`, `samples: Math.max(4, capabilities.samples)`, 行 2076 `renderObjects(opaqueObjects, ...)`）。`transmission_pars_fragment.glsl.js` 行 124（`refract`）, 141（`ior*2.0-2.0` の係数）, 147（`log2(size.x) * roughness`）, 162–163（Beer）, 180–181（分散 `(ior-1)*0.025*dispersion`）。`MeshPhysicalMaterial.js` 行 302/311（`attenuationDistance = Infinity`, `attenuationColor` 白） | **補足**: `side === DoubleSide` の透過物体は、その背面を透過 RT に先に描く（行 2085 付近。`material.side = BackSide` にして `renderObject`）ので、**自分自身の背面は透過物体越しに見える**。元ファイルは「透過物体同士は互いに見えない」と書いており、これは他物体については正しいが、自己の背面は例外。`transmissionResolutionScale` の既定は 1.0（行 297） |
| V-04 | `FogExp2` は `1-exp(-(密度×深度)^2)`、フォグ色は vec3 1 つ・密度はスカラーで RGB 別減衰を持てない（F-05、要約 12） | **CONFIRMED-CODE** | 差なし | `fog_fragment.glsl.js` 行 6（`1.0 - exp(-fogDensity*fogDensity*vFogDepth*vFogDepth)`）, 14（`mix(gl_FragColor.rgb, fogColor, fogFactor)`） | 数値例（ρ=0.3 で d=1,2,3,5 m の透過率 0.914/0.698/0.445/0.105 と Beer 型 0.741/0.549/0.407/0.223）は再計算で一致 → **CONFIRMED-CALC** |
| V-05 | `geometryRoughness` は法線マップ適用前の幾何法線 (`nonPerturbedNormal`) の `dFdx/dFdy` から作られ、法線マップ由来の分散は粗さに入らない。Toksvig／LEAN 相当の機能は組込みに無い（F-06、要約 6） | **CONFIRMED-CODE** | 差なし | `lights_physical_fragment.glsl.js` 行 7–8。`normal_fragment_begin.glsl.js` 行 74（`vec3 nonPerturbedNormal = normal;`、法線マップ適用より前）。`src` と `examples/jsm` で "toksvig" を含むファイルは 0 件 | "LEAN" の語の grep は森林・街路樹ジェネレータ等の無関係な用法のみで、LEAN マッピング実装は無い |
| V-06 | Three.js に caustics の既製品が無い、WebGL 用ゴッドレイが無い（TSL の `GodraysNode` のみ）、WebGL の `MeshPhysicalMaterial` に POM／パララックスマッピングが無い、TSL に単純 UV オフセット `parallaxUV` のみ（F-07, F-08、要約 8,14） | **CONFIRMED-CODE** | 差なし | `grep -rli caustic src examples/jsm` → 0 件。"godray" → `GodraysNode.js`, `depthAwareBlend.js` のみ（`GodraysNode.js` は `three/webgpu` と `three/tsl` から import）。"parallax" → 13 件（元ファイルの「13 件」と一致）。`AccessorsUtils.js` 行 34（`parallaxUV = (uv, scale) => uv.sub(parallaxDirection.mul(scale))`） | "relief" の語は街・地形ジェネレータの別用途で、表面 POM ではない |
| V-07 | スキニングは 1 頂点 4 ボーン、ボーン行列は 1 ボーン＝4 texel（`size = ceil(sqrt(bones*4)/4)*4, 最小 4`）、モーフターゲットは `DataArrayTexture`、`LOD.addLevel(object, distance, hysteresis)`（F-09、要約 18） | **CONFIRMED-CODE** | 差なし | `skinning_vertex.glsl.js` 行 7–10（boneMatX/Y/Z/W）, `skinning_pars_vertex.glsl.js` 行 15–18（texelFetch 4 回）, `Skeleton.js` 行 252–254, `WebGLMorphtargets.js` 行 52, `LOD.js` 行 116 | |
| V-08 | `SubsurfaceScatteringShader` は MeshPhong ベース、既定 `thicknessDistortion 0.1 / Ambient 0.0 / Attenuation 0.1 / Power 2.0 / Scale 10.0`（F-08、要約 11） | **CONFIRMED-CODE** | 差なし | `examples/jsm/shaders/SubsurfaceScatteringShader.js` 行 39–43, 69–72 | PBR への移植は元ファイルも M と明記（Gap-9） |
| V-09 | 無水グアニンの屈折率 n=1.83、細胞質 n=1.33（F-30、要約 1,3、F-17） | **CONFIRMED-MULTI** | グアニン **1.83**（面内方向、(100) 面法線）。細胞質は文献により **1.33〜1.34**（今回の要約は 1.34） | Nature Commun. 2020「In situ differentiation of iridophore crystallotypes underlies zebrafish stripe patterning」https://www.nature.com/articles/s41467-020-20088-1 、https://pmc.ncbi.nlm.nih.gov/articles/PMC7738553/ 、PNAS 2024「The physical and cellular mechanism of structural color change in zebrafish」https://www.pnas.org/doi/full/10.1073/pnas.2308531121 | **PROXY:ゼブラフィッシュ**（元の根拠はニシン等）。サケ科の板の厚み・層数は今回も不明。ゼブラフィッシュ虹色素胞は「交互の高低屈折率層による多層薄膜干渉」と要約されており、transfer matrix で反射スペクトルを計算する。**元の F-30(4)「銀色の魚は非周期構造による広帯域反射」と、F-31(2)「各層 1/4 波長の理想多層膜」は PROXY 種ごとに両方記述される**（矛盾 8 は解消せず、下記 §3 参照） |
| V-10 | サケ科の皮膚反射率は銀化（パー→スモルト）で増加し、鰓 ATPase 活性と皮膚グアニン濃度に相関（F-31(4)） | **CONFIRMED-SINGLE** | 対象種を特定: **ニジマス型（steelhead, O. mykiss）とマスノスケ（chinook, O. tshawytscha）の幼魚、Columbia 川流域**。Haner ら 1995, N. Am. J. Fish. Manage.（要約記載） | https://pubs.usgs.gov/publication/70180320 （元と同一）、https://www.usgs.gov/publications/skin-reflectance-non-lethal-measure-smoltification-juvenile-salmonids 、https://en.wikipedia.org/wiki/Smoltification （銀化は皮膚へのグアニン結晶の沈着、B） | 元ファイルは「サケ科の幼魚（種は要約に明示なし）」としていたが、種は特定できる。**ヤマメ (O. masou) ではない**ので PROXY:O. mykiss／O. tshawytscha と付記すること。F-31(1)「トラウトの虹色素胞に 2 型」（Springer BF00222271）は今回も出典を確認できず **UNVERIFIABLE** |
| V-11 | Pope & Fry 1997 の純水吸収は 418 nm で最小 0.0044±0.0006 m⁻¹（F-38、要約 13(a)） | **CONFIRMED-MULTI** | 0.0044±0.0006 m⁻¹ @418 nm（変更なし）。追加情報: 「420 nm 付近の吸収は従来の定説値より 3 倍以上低い」と要約に明記 | Optica（Appl. Opt. 36, 8710）https://opg.optica.org/ao/viewmedia.cfm?uri=ao-36-33-8710&html=true 、PubMed https://pubmed.ncbi.nlm.nih.gov/18264420/ | 元の出典（omlc.org, 0-dx-doi-org.brum.beds.ac.uk）とは別ドメイン。**最小値の話であり、渓流の減衰ではない**。「従来値より 3 倍低い」は、**古い表（Smith & Baker 1981 系）を使う記憶値は青側が過大**になりうることを意味する → V-12 |
| V-12 | 純水の吸収係数 550 nm≈0.064、650 nm≈0.34、465 nm≈0.010 m⁻¹ と、そこから計算した `attenuationColor`（1 m で R/G/B≈0.71/0.94/0.99）（F-15、要約 13、矛盾 6） | **UNVERIFIABLE**（2 回検索、いずれも個別値の裏取り不成立） | **550 nm は出典により 0.052〜0.070 m⁻¹ とばらつく**（下記）。650 nm の 0.34、465 nm の 0.010 は確認できず | (a) pure sea water の表（要約。出典の特定なし）: 450 nm で 0.012、550 nm で **0.052** m⁻¹。https://oceanopticsbook.info/view/absorption/absorption-overview/pdf など検索結果に出たが本文未読。(b) 検索結果の要約が「Sogandares & Fry 1997 は 550 nm で **0.0697** m⁻¹」と述べた（光熱法の論文 AO 36, 8699。値の出典ページは確認できず、**この要約の数値は採用しない**）。(c) 元の検索 #10 と同様、質問文に入れた 0.0565 / 0.34 は、要約が「整合する」と返しただけ（今回も S1 で同じ現象）で裏取りにならない | 計算自体（exp(-a·d)）は CONFIRMED-CALC。ただし入力が M。G=0.938（a=0.064）は a=0.052〜0.070 の範囲だと 1 m で 0.932〜0.949。**仕様では「仮定パラメータ」として置き、出典付き A/B としては引用しない**。渓流は CDOM・懸濁で純水値より大きいという一般則は元ファイルのとおり M |
| V-13 | 粘液の屈折率 1.3371〜1.3854（海水約 1.34 と同程度かやや高い）、可視域でほぼ透明、反射は小さい（F-32、要約 4） | **CONFIRMED-SINGLE**（同一論文を別ページ・別クエリで再確認） | 1.3371〜1.3854。補足: **ヘテロブランキア類のウミウシ 32 種（沖縄のサンゴ礁）**、Zoological Studies 63 (2024)。粘液が海水に溶け出すと屈折率勾配ができ、反射がさらに減るとの記述あり | https://zoolstud.sinica.edu.tw/news/2024_63-02.html （「Mucus May Help to Exhibit Vivid Body Colors」）、https://zoolstud.sinica.edu.tw/Journals/63/63-02.html | **PROXY:ウミウシ（海産軟体動物）**。魚の粘液の n・厚みは今回も見つからず。元ファイルの F-20b（n=1.385 で F0=0.0261）は計算 ((1.385-1)/2.385)²=0.0261 で一致 |
| V-14 | Toksvig の式 `ft=\|Na\|/(\|Na\|+s(1-\|Na\|))` と計算例（s=64: \|Na\|=1.0/0.99/0.95/0.90/0.80 → 64.0/38.9/14.7/7.9/3.8）（F-21） | 式: **UNVERIFIABLE**。方式の骨子（平均法線の長さで鏡面指数を下げる）: **CONFIRMED-MULTI**。計算例: **CONFIRMED-CALC**（式が正しければ一致） | 式は引き続き **M**（記憶）。掲載誌・年（元は "2004, J. Graphics Tools"）も未確認 | NVIDIA 技術資料 https://developer.download.nvidia.cn/whitepapers/2006/Mipmapping_Normal_Maps.pdf 、https://www.selfshadow.com/talks/rock_solid_shading_v1.pdf 、https://realtimerendering.com/advances/s2018/MaterialAdvancesInWWII-course_notes.pdf 、Unity フォーラム https://forum.unity.com/threads/question-about-the-toksvig-factor.374773/ （いずれも式を要約に出さず） | 検索要約は「質問文の式は表示されていない」と明言。**式を出典付きで仕様に引用してはならない**。実装時は NVIDIA 技術資料の本文で式を確認すること |
| V-15 | 魚の水晶体はほぼ球形で Matthiessen 比 2.55（2.40–2.82）、角膜は水中で光学的にほぼ無効（r07 F-10 の二次引用、要約 15） | **CONFIRMED-MULTI**（Matthiessen 比）／角膜無効は **CONFIRMED-SINGLE** | 2.55（Matthiessen 1882、魚 10 種の平均、変動 2.40–2.82）。別資料では魚全般で **2.2〜3.3 レンズ半径**（3.6〜2.3 の記述もあり） | https://en.wikipedia.org/wiki/Matthiessen%27s_ratio 、https://cob.silverchair.com/jeb/article-pdf/1274441/2724.pdf 、https://pmc.ncbi.nlm.nih.gov/articles/PMC5312020/table/RSTB20160070TB1 | 比は「水晶体中心から網膜までの距離÷水晶体半径」で、**ヤマメ固有値ではない**（PROXY:魚一般）。「角膜は水中で屈折力が小さい」は要約に記述あり（水晶体が主要屈折要素）。層状の屈折率勾配（周辺から中心に向かって増加）により球面収差が小さいとの記述も出た |
| V-16 | 真骨魚の瞳孔は固定が大半で、動的変化は実装しなくてよい（要約 16、r07 F-30 の二次引用） | 一般則は **CONFIRMED-MULTI**。**サケ科固有は UNVERIFIABLE** | 「大多数の真骨魚で瞳孔径は固定（瞳孔括約筋を欠く）、板鰓類は筋性虹彩で可変。例外あり（例: フナは捕食者の存在で瞳孔径が可塑的に変化）」 | https://x-mol.com/paper/1285640784254255104 （J. Anim. Ecol.）、https://cob.silverchair.com/jeb/article-pdf/208/2/261/1253226/261.pdf （J. Exp. Biol. 208）、https://datadryad.org/dataset/doi:10.5061/dryad.0p2ngf1xr | 検索要約が「ニジマス／サケ科の瞳孔光反応に関する具体データは含まれていない」と明言。**瞳孔を静的にする判断は一般則に基づく（サケ科の個別確認は無い）**。例外の存在から、将来「瞳孔径の個体差」は許容されうる |
| V-17 | ヤマメの側線有孔鱗は 118〜134 枚（青森産、A、r06 経由）。これから暫定ピッチ 0.55〜0.9 %SL を換算（F-14、要約 7,9） | 枚数: **CONFIRMED-SINGLE**（青森県の資料群と推定、元の r06 と同系統の可能性あり）。ピッチ: **CONFIRMED-CALC（ただし範囲の作り方に注意）** | 枚数 118〜134（確認）。ピッチ: 側線長=0.76×SL 仮定で **0.57〜0.64 %SL**、側線長≒SL 仮定で **0.75〜0.85 %SL**。元の 0.55〜0.9 %SL は両仮定を包含する範囲 | https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf など（検索結果に出た青森県産業技術センター系の PDF 群。要約は「側線鱗 118–134、背鰭軟条 12–14、臀鰭条 12–14、鰓耙 11、全鰓耙 16–18、幽門垂 39–47」と記述。PDF 本文は未読） | **背鰭条数**: 元ファイルの二次引用は「背 12–13」、今回の要約は「背鰭軟条 12–14」。要約の取り違えの可能性があり決められない → 並記 12–14（要確認）。画素フットプリントの数値（SL 200 mm で 0.64–1.04 m／1.27–2.08 m、縦 FOV50°・1080 px）は **CONFIRMED-CALC**。0.55 %SL 側の下限の根拠が「118 枚＆側線長 0.76SL」では 0.64 %SL にしかならない点に注意（0.55 は端の保守的拡張） |
| V-18 | 計算値: スネルの窓 97.21°、臨界角 48.61°、水膜 F0=0.0204、空気→水のフレネル（0/45/60/70/80/85° で 0.0204/0.0279/0.0597/0.1335/0.3479/0.5835）、Schlick(0.04) との比較、グアニン 1/4 波長厚 61.5/75.1/88.8 nm（n=1.83、λ=450/550/650）（F-16, F-17） | **CONFIRMED-CALC** | 全て一致。追加: 細胞質 n=1.33 で 84.6/103.4/122.2 nm、n=1.34 で 84.0/102.6/121.3 nm、n=1.37 で 82.1/100.4/118.6 nm（元ファイルの値と一致）。Schlick(F0=0.0204) は 80°で 0.398、85°で 0.641 | ローカル Python 再計算 | 入力が屈折率（n_water=1.333、グアニン 1.83＝V-09 で A に昇格）なので、計算の前提は成立。ただし**膜 IOR をグアニン 1.83 に設定すると Three.js の `iridescenceIOR` の既定 1.3 から外れ、上限 2.333 内**であり設定可能（`MeshPhysicalMaterial` のドキュメント複製ページの記述、V-01 と矛盾しない） |
| V-19 | コースティクスは `SpotLight.map`（投影テクスチャ）を足がかりにできるが、方向光ではなくスポットライトが要る（要約 14、F-08） | **CONFIRMED-CODE**（動作）＋**補足 2 点** | 補足: ①影（`castShadow`）は不要。ライトの並びは「影＋マップ／影のみ／マップのみ／なし」の順で、マップのみも可。②`directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;` — **投影範囲の外では変調されず素の光色になる**。③変調されるのは直接光の色のみ（IBL・環境光には効かない） | `WebGLLights.js` 行 155, 375–384, 525–527。`lights_fragment_begin.glsl.js` 行 120–140 | 元ファイルの「コード確認」の範囲では正しい。動くコースティクス模様の見た目の妥当性は元ファイルのとおり M のまま。魚体表面での見え方（鱗のちらつき）は未確認 |
| V-20 | ゲーム用魚モデルの数値（トラウト 3,892 三角形、鯛 2,654、オオクチバス 926、LOD 4,096/896/188/107 頂点ほか）、鰭の三層構造、Godot の頂点アニメ文書、市販鱗テクスチャ、F-28 の周辺文献（F-35, F-40, F-41, F-42, F-28） | **NOT-CHECKED**（予算 11 回の優先順位で外した） | — | — | 元ファイルが自己申告（C）・要約由来（A/B だが本文未読）と明記済み。仕様では桁の目安に留めること |

---

## 2. 仕様書で使う値／使ってはいけない値

### 2.1 採用してよい値（根拠付き）

| 項目 | 採用値 | 根拠・ランク | 注意 |
|---|---|---|---|
| Three.js r186.1 の実装事実（虹彩・クリアコート・透過・フォグ・粗さ・スキニング・LOD・SSS アドオン・SpotLight.map） | V-01〜V-08, V-19 の記述 | B(code)、tarball 再 grep 済み | 「r186.1 がそうなっている」ことのみ保証。版が変われば再確認 |
| クリアコート F0／水膜 F0 | 0.04（Three.js 固定）／0.0204（n=1.333、計算） | B(code)／M(計算、独立再計算で一致) | 80°で Schlick(0.04)=0.410 対 厳密 0.348（元ファイルのとおり） |
| スネルの窓・臨界角 | 97.21°・48.61°（n=1.333） | M(計算、再計算で一致) | |
| 無水グアニンの屈折率 | n=1.83（面内方向） | A（ゼブラフィッシュ等、PROXY） | サケ科の板の厚み・層数は未確認 |
| 細胞質の屈折率 | n=1.33〜1.34 | A（PROXY:ゼブラフィッシュ等） | 1.33 一点に固定しない |
| 純水の吸収極小 | 0.0044±0.0006 m⁻¹ @418 nm | A | 渓流の減衰ではなく、純水の下限。青側の最小値 |
| 魚の水晶体 Matthiessen 比 | 2.55（2.40–2.82）、魚一般は 2.2–3.3 | A/B（PROXY:魚一般） | ヤマメ固有値ではない |
| 側線有孔鱗数（ヤマメ） | 118〜134 枚（青森産） | A（単一系統、本文未読） | 鱗ピッチは仮定を明示して 0.57〜0.64 %SL（側線長 0.76SL）または 0.75〜0.85 %SL（側線長≒SL）と並記 |
| 銀化とグアニン | 皮膚反射率↑がスモルト化と皮膚グアニン濃度に相関 | A（steelhead／chinook、PROXY） | ヤマメの直接データではない |
| 粘液の屈折率 | 1.3371〜1.3854（海水約 1.34 と同程度） | A（PROXY:ウミウシ 32 種、単一論文） | 魚の粘液の n としては**仮定値**扱い。厚みは不明 |
| 瞳孔 | 静的（円形・固定）で実装 | B（真骨魚の一般則）。サケ科固有の確認なし | 個体差（可塑性）の例外はある |

### 2.2 採用してはいけない値・表現

| 項目 | 理由 |
|---|---|
| 純水の吸収係数 550 nm=0.064／650 nm=0.34／465 nm=0.010 m⁻¹ を **A/B として引用すること**、およびそこから作る `attenuationColor`（0.71/0.94/0.99 等） | 2 回の検索でも個別値は裏取りできず（V-12）。出典により 550 nm は 0.052〜0.070 とばらつく。M の仮定パラメータとして置くのは可、出典付き事実としては不可 |
| 「ニシンの鱗のグアニン板の厚み約 130 nm／浮き袋の板 約 19 nm」 | 元ファイル自身が不採用（n=1.83 の 1/4 波長条件と合わない）。今回も追加の裏取りなし |
| 「Toksvig の式 ft=\|Na\|/(\|Na\|+s(1−\|Na\|))」を**出典付きの事実として**引用すること | 式は要約に出ず UNVERIFIABLE（V-14）。計算例の数値は式が正しいときだけ成立 |
| 「トラウトの虹色素胞に反射板の違う 2 型がある」 | 出典（Springer BF00222271）を要約が特定せず、今回も確認できず |
| 「サケ科の USGS 銀化データはヤマメ／サケ科一般」 | 対象は steelhead（O. mykiss）と chinook（O. tshawytscha）の幼魚（V-10） |
| 「背鰭条数は 12–13 と確定」 | 今回の要約は 12–14（V-17）。並記して要確認 |
| ウミウシの粘液 n を**魚のヤマメの粘液の実測値**として扱うこと | PROXY（V-13） |
| 「`transmission` が透過物体同士を互いに映さない」を**例外なしの規則**として書くこと | DoubleSide の自己背面は透過 RT に描かれる（V-03） |
| Pope & Fry の 0.0044 m⁻¹ を渓流や魚の見える距離の減衰に使うこと | 純水の 418 nm の最小値にすぎない（V-11） |
| ゲーム用魚モデルの三角形数の平均・中央値 | 元ファイルが禁止済み（矛盾 10）。今回も未検証（V-20） |

---

## 3. 元ファイルの補正が必要な点（重要度順）

1. **純水吸収の「M の数値」は検索で確定せず、出典で 0.052〜0.070 m⁻¹ と割れている（550 nm）**。F-15 の `attenuationColor` と要約 13 は M のまま（「検索で確認できたのは 3 点のみ」という元の整理は妥当）。ただし古い表（Smith & Baker 系）は青側が Pope & Fry より 3 倍以上高い、と Pope & Fry の要旨にあるので、**465 nm の 0.010 m⁻¹ は「記憶値であり、より低い現行値のほうが近い可能性」**を併記すること。
2. **グアニン／細胞質の屈折率は PROXY 種（ゼブラフィッシュ等）で A に昇格してよいが、細胞質は 1.33〜1.34**（1.33 固定にしない）。また、ゼブラフィッシュ虹色素胞は**多層薄膜干渉（transfer matrix で反射スペクトルを計算）**と記述され、元の F-30(4) の「非周期構造による広帯域反射（銀色の魚）」と並存する。**銀色（広帯域）と有彩色（1/4 波長多層）は種・細胞型で異なる**ため、要約 1 の「広帯域鏡面＋弱い虹彩」の方針は維持してよいが、根拠は「ヤマメで確認」ではなく「PROXY 種で確認」と書くこと。
3. **ヤマメの鱗ピッチ 0.55〜0.9 %SL は、枚数 118〜134（確認済み）から一意に出ない合成範囲**。側線長の仮定で 0.57〜0.64 %SL（0.76×SL）または 0.75〜0.85 %SL（≒SL）に割れる。画素フットプリントの表（F-14）は 0.55〜0.9 を使っているため、**どの仮定の値かを列に明記**すること。
4. USGS の銀化データの対象は steelhead／chinook（V-10）、粘液 n はウミウシ 32 種（V-13）なので、元ファイルにある「サケ科」「粘液」の記述には種名を足すこと。
5. `transmission` の「透過物体同士は見えない」に DoubleSide の自己背面の例外を足す（V-03）。`SpotLight.map` は影不要、投影範囲外は素の光色になる点を足す（V-19）。
6. 背鰭条数 12–13（二次引用）と 12–14（今回の要約）の食い違いを並記（V-17）。

---

## 4. 検索ログ（WebSearch 11 回／割当 11、mode は全て "standard"、拒否 0、WebFetch／curl 外部取得 0）

| # | クエリ（要旨） | domain 指定 | 得たもの | 有用度 | 反映 |
|---|---|---|---|---|---|
| 1 | pure water absorption coefficient 650 nm 0.34 / 550 nm 0.06 / 450 nm 0.01 ocean optics | なし | pure sea water の表（450 nm 0.012、550 nm 0.052）。質問文の数値は「整合する」と言い換えられただけ | 低〜中（0.052 の発見のみ） | V-12 |
| 2 | Pope & Fry 1997 "Absorption spectrum (380–700 nm) of pure water. II" minimum 418 nm | opg.optica.org, pubmed, omlc.org, oceanopticsbook.info | 0.0044±0.0006 m⁻¹ @418 nm、従来値より 3 倍以上低い | 高 | V-11 |
| 3 | biogenic guanine crystals n=1.83 zebrafish iridophore cytoplasm 1.33 multilayer | pmc, pnas, nature, science, sciencedirect | グアニン 1.83、細胞質 1.34、多層薄膜干渉の transfer matrix モデル | 高 | V-09 |
| 4 | skin reflectance parr-smolt guanine gill ATPase nonlethal index | なし | Haner ら 1995、steelhead と chinook、Columbia 川、銀化＝グアニン結晶の沈着 | 高 | V-10 |
| 5 | nudibranch sea slug mucus refractive index close to seawater transparent | なし | 同一論文（Zool. Stud. 63, 2024）の別ページ、32 種、粘液が溶け出すと屈折率勾配 | 中（独立性は弱い） | V-13 |
| 6 | Toksvig mipmapping normal maps ft = \|Na\|/(\|Na\|+s(1−\|Na\|)) | なし | 方式の骨子は一致、式は要約に出ず | 中（式は UNVERIFIABLE の確定） | V-14 |
| 7 | Matthiessen's ratio 2.55 fish lens spherical cornea no refractive power | なし | 2.55（10 種平均、2.40–2.82）、魚全般 2.2–3.3 | 高 | V-15 |
| 8 | teleost pupil fixed size trout salmonid pupillary light response | なし | 大半の真骨魚は固定、板鰓類は可変、フナの可塑性。サケ科固有データなし | 中 | V-16 |
| 9 | ヤマメ 側線鱗数 側線有孔鱗数 Oncorhynchus masou lateral line scales | なし | 数値は出ず（種の一般情報のみ） | 低 | V-17 |
| 10 | pure water absorption a_w 550 nm 0.0565 / 650 nm 0.340 Pope Fry table | oceanopticsbook, omlc, optica, mdpi, copernicus, frontiersin, pmc | 質問の値は一致しないと返答（Sogandares & Fry で 550 nm 0.0697 との要約。本文未確認） | 中（値の割れを確認） | V-12 |
| 11 | サクラマス ヤマメ 計数形質 側線鱗数 背鰭条数 臀鰭条数 鰓耙数 幽門垂数 | なし | 側線鱗 118–134、背鰭軟条 12–14、臀鰭 12–14、鰓耙 11（全 16–18）、幽門垂 39–47（青森県産業技術センター系 PDF 群） | 高 | V-17 |

ローカル確認: tarball の grep／sed 多数（V-01〜V-08, V-19）、Python 再計算（V-04, V-14 計算例, V-17, V-18）。

## 5. 未検証（予算外）の主張

F-35（鰭の三層構造）、F-40（ゲーム魚モデルの数値）、F-41（Godot の頂点アニメ）、F-42（鱗素材）、F-28（周辺文献の存在）、F-33（Jensen ら 1999 の要旨）、F-34 の LEAN・Kaplanyan の詳細、F-37（GDC 2011 の存在）、F-39（GPU Gems の概要・WebGL 先行例）、スネルの窓の文献確認。いずれも元ファイルが A/B/C と明記済みで、仕様の分岐を決める数値ではない。
