# three.js r186.1 マテリアル/シェーダ監査（監査A）

> 注: 監査エージェントが Write を拒否されたため、ワークフロー返却値（recommendations=§0〜§2、pitfalls=§3、unverified=§4〜§5）から復元。再現スクリプトと生出力は作業ディレクトリにあり、セッション終了で消える。

## §0〜§2 結論・確認事項

§0 凡例と前提: 対象は three@0.186.1 (REVISION=186) と @types/three@0.186.0。npm latest=0.186.1 (2026-09-24公開)。手元tarballのsha1/integrityはregistryと一致。[S]=実ソース確認(path:行。three@0.186.1/package/ 相対)、[R]=実行確認(ヘッドレスChromium+SwiftShader=CPUソフトウェアWebGL2。GPU実機ではない)、[C]=計算、[K]=一般知識(未検証)。型定義の実パスは types-three-0.186.0/three/ (課題文の package/ は存在しない)。docs/yamame/research/r14_render_tech.md (Part A) と突き合わせて矛盾なし。r14 Gap-12 (WebGPU/NodeMaterial側の虹彩・クリアコート・透過は未確認) は、ソース確認とWebGL2降格での実行確認まで解消。実WebGPUアダプタでの確認は未了 (U1)。

§1-R1 レンダラー選択: r186では WebGLRenderer+MeshPhysicalMaterial を本線にし、WebGPURenderer+TSL は『WebGL2へ自動降格する将来路線』として並走検証に留める。根拠: (a) onBeforeCompile/ShaderChunk差し替えはWebGLRenderer専用 [S src/materials/Material.js:526-528]。WebGPURenderer(降格後も)ではonBeforeCompileが一度も呼ばれなかった [R e4: onBeforeCompile_called=false]。(b) 同じJSDocが『カスタマイズの推奨はWebGPURenderer+Node/TSL』とも書く [S 同:526-528]。方向はTSLなので、GLSLパッチは機能単位の小関数に分け、後でTSLへ機械的に移せる形にする。(c) WebGPURenderer はWebGPU不可環境でWebGL2バックエンドへ自動降格 [S src/renderers/webgpu/WebGPURenderer.js:57-70]。本環境ではnavigator.gpuはあるがrequestAdapter失敗('No available adapters')でWebGLBackendになった。降格後もMeshPhysicalMaterialはMeshPhysicalNodeMaterialに自動置換され [S src/renderers/webgpu/nodes/StandardNodeLibrary.js:66; R e4]、SkinnedMeshの変形・iridescence・transmissionが動いた。スキン変形の画素数はWebGLRendererと完全一致 (420→393px) [R e4,e4b,e8]。(d) await renderer.init() 前のrender()は例外 [S src/renderers/common/Renderer.js:1498-1500]。実WebGPUアダプタでの動作・速度は未検証 (U1)。(e) TSLへ移す判断基準: ①computeで群泳/頂点アニメをGPU化したい、②パッチでは書けない大きさの自前BRDF(多層膜等)、③変形をシャドウへ自動反映したい(TSLはpositionNodeが影に自動再利用される [S src/renderers/common/Renderer.js:3574-3579])、のどれかが必須になったら。transmissionを使う/既存GLSLパッチを使う/安定優先ならWebGLのまま。(f) WebGLRenderer.setNodesHandler (TSLノードをWebGLRendererで動かす; src/renderers/WebGLRenderer.js:1066-1075) はexamples/jsmの実験アドオンで『VSMシャドウ/MRT/Transmission非対応』と自己申告 [S examples/jsm/tsl/WebGLNodesHandler.js:27-34]。本線にしない。

§1-R2 効果の値を『0と正の間』で動かさない: clearcoat/iridescence/sheen/anisotropy/transmission/dispersion/retroreflectivity と alphaTest は 0↔正 で material.version++ → プログラム再取得(初回はシェーダ再コンパイル) [S src/materials/MeshPhysicalMaterial.js:381-385(anisotropy。他も同型: 405-409,431-435,455-459,482-486,506-510,536-540), src/materials/Material.js:495-503(alphaTest)] [R e2: 5回の0→正遷移でversion 0→5、正の範囲内の値変更は5→5で不変]。濡れ具合のように時間で動かす量は、最初から正の値を入れて値だけ動かす。または ON/OFF 別マテリアルを作って renderer.compileAsync で事前コンパイルする [S src/renderers/WebGLRenderer.js:1515]。

§1-R3 サブテクスチャは親効果が正のときだけ有効: thicknessMap/transmissionMap←transmission、iridescenceMap/iridescenceThicknessMap←iridescence、clearcoatMap/clearcoatRoughnessMap/clearcoatNormalMap←clearcoat、sheenColorMap/sheenRoughnessMap←sheen、anisotropyMap←anisotropy [S src/renderers/webgl/WebGLPrograms.js:148-165] [R e2: 効果0のとき USE_*MAP は全てfalse]。例外は specularColorMap/specularIntensityMap で親ゲートが無く、設定した時点で常にサンプラーを消費する [S 同:161-162] [R e2: 効果0でも true]。

§1-R4 ORMパック: 専用スロットは無い。同一Textureを aoMap(R)/roughnessMap(G)/metalnessMap(B) の3スロットへ代入する。colorSpaceはNoColorSpace、UVセットは texture.channel。GLTFLoaderも同じ流儀 [S examples/jsm/loaders/GLTFLoader.js:3645-3646(metalnessMap/roughnessMapに同一metallicRoughnessTexture), 3709(aoMap)]。チャンネルはシェーダのコメントに明記: aomap_fragment.glsl.js:4(R), roughnessmap_fragment.glsl.js:8-9(G), metalnessmap_fragment.glsl.js:8-9(B) ('compatible with a combined OcclusionRoughnessMetallic (RGB) texture')。Node経路も同じ [S src/nodes/accessors/MaterialNode.js:196(.g),210(.b),405(.r)]。3スロット=3サンプラーを消費 [R e2b]。AOは間接光(拡散・IBL鏡面・clearcoat/sheenの間接)にしか掛からない [S src/renderers/shaders/ShaderChunk/aomap_fragment.glsl.js:7-23]。同一Textureを3スロットに使うと texture.channel も共有になる(AOだけ別UVにするなら別Textureオブジェクトが要る)。

§1-R5 サンプラー予算: r186のSTANDARD/PHYSICALは dfgLUT を常時1枠使う [S src/renderers/shaders/UniformsLib.js:38, src/renderers/WebGLRenderer.js:2743-2745, lights_physical_pars_fragment.glsl.js:3]。実測(SwiftShader, MAX_TEXTURE_IMAGE_UNITS=32) [R e2b]: bare+env=2(envMap,dfgLUT)、map/normal/ORM×3/emissive=8、そこへiridescence(2)+sheen(2)+clearcoat(3)の全マップを足すと15、transmission+transmissionMap+thicknessMap+影付き平行光1灯=11。WebGL2の最小保証は16 [K]。超過時は警告が出る [S src/renderers/webgl/WebGLTextures.js:512-526](以後の挙動は未検証)。影付きライト1灯ごとに+1、透過で transmissionSamplerMap +1。チャンネル詰め(R/Gを別効果に使う)をしてもサンプラーはスロット単位なので減らない。全部入りを1マテリアルに載せない。

§1-R6 onBeforeCompile運用規則: (1) 必ず customProgramCacheKey() を上書きする。既定は onBeforeCompile.toString() [S Material.js:544-547] なので、クロージャ値だけが違うパッチは同じプログラムを共有し、2枚目以降の焼き込み定数が無視される [R e3: 赤/青を焼き込んだ2枚が両方赤、customProgramCacheKey付与で赤/青]。動的値は shader.uniforms で渡す。(2) アンカー位置を守る: ライティング後に diffuseColor を変えても出力に効かない [R e3: 黒のまま]。粗さ→roughnessmap_fragment直後(roughnessFactor)、金属度→metalnessmap_fragment直後(metalnessFactor)、法線→normal_fragment_maps直後(normal)、放射→emissivemap_fragment直後(totalEmissiveRadiance)、BRDF入力→lights_physical_fragment直後(material.*)、ライト結果→lights_fragment_end直後(reflectedLight.*)、最終色→opaque_fragment直前(outgoingLight)。アンカー文字列 #include <名前> は各シェーダに1回ずつ [R chunk_map: 全アンカーcount=1]。(3) 頂点を手続き変形したら法線も合わせる: 法線系チャンクは begin_vertex より前 [S ShaderLib/meshphysical.glsl.js:33-38 対 :40-42]。(4) 影パスは別シェーダ: 可視マテリアルへのパッチは MeshDepthMaterial/MeshDistanceMaterial に効かない。同じ変形を mesh.customDepthMaterial/customDistanceMaterial にも入れる [S src/renderers/webgl/WebGLShadowMap.js:433-438] [R e7]。

§1-R7 アルファの使い分け: 硬い縁=alphaTest(MSAA下ならalphaToCoverage併用)、ソート不要の半透明=alphaHash(不透明パス・深度書込あり・影では無視)、通常の半透明=transparent。transparent:true+DoubleSide は既定で毎フレーム2回描画、version が毎フレーム+2、プログラム2本 [S src/renderers/WebGLRenderer.js:2165-2175, prepareMaterial :1364-1374] [R e6: 10フレームでversion+20]。薄い鰭などで品質差が無ければ forceSinglePass:true (version+0, プログラム1本) [R e6]。描画コール実測は §2-4。

§1-R8 transmissionは『追加レンダーパス』を要する: 透過物体が1つでも見えていると、不透明物体全部をもう一度、半精度(HalfFloat)・MSAA(>=4)・ミップ付きの専用ターゲットへ描く(実測: 不透明5+透過1 → 描画11回)。DoubleSideならさらに裏面1回、scene.overrideMaterial があるとパス自体が省略される [S src/renderers/WebGLRenderer.js:2002-2125, 2006-2010, 2020, 2076, 2081-2107] [R e1]。コスト低減は renderer.transmissionResolutionScale (既定1.0) [S WebGLRenderer.js:297, 2044]。透過物体同士は互いに映らない。薄膜・鰭には使わず、必要箇所(水滴・眼の角膜など)に限定する(r14と整合)。

§1-R9 DoubleSideは『法線・影・描画回数』に効く: (a) フラグメントで gl_FrontFacing により normal を反転し TBN も反転 [S normal_fragment_begin.glsl.js:14-16, 42-47]。BackSideでは normalScale/bumpScale を反転 [S src/renderers/webgl/WebGLMaterials.js:178,194-196]。(b) 影は shadowSide==null のとき FrontSide は裏面を、DoubleSide は両面を影に描く [S Material.js:332-342, WebGLShadowMap.js:484-488]。(c) transparent なら2回描画(R7)。透過+DoubleSide は透過ターゲットへ裏面を追加描画 (+1 call) [R e1: 12]。

§1-R10 色空間: カラーデータだけsRGB。map/emissiveMap/sheenColorMap/specularColorMap のみ SRGBColorSpace、ORM・法線・thickness等は NoColorSpace [S MeshStandardMaterial.js:100-110,175-184, MeshPhysicalMaterial.js:228-238,342-353]。Texture.colorSpace 既定は NoColorSpace で TextureLoader は設定しないため、map を放置すると明るく崩れる(128→188) [S src/textures/Texture.js:48,299] [R e5]。GLTFLoaderは自動設定 [S GLTFLoader.js:3636,3728,1127,1330]。ColorManagement有効・作業空間linear-sRGB、new Color(0x808080).r=0.2159 [S src/math/ColorManagement.js:21-23] [R e5]。renderer.outputColorSpace 既定 SRGB(WebGLRenderer.js:312)、toneMapping 既定 NoToneMapping(:277)、exposure 1(:285)。toneMapped は画面/XR描画時のみ有効でレンダーターゲットでは掛からない [S WebGLPrograms.js:178-185]。r186のoutputBufferType:HalfFloatType+setEffects([...])では内蔵出力パスがトーンマップ/色変換を行う(OutputPass不要と警告) [S WebGLRenderer.js:84,565-568,747-771]。

§1-R11 IBLはPMREM経由: scene.environment/material.envMap はMeshStandard系なら自動でPMREM化・キャッシュされる [S WebGLRenderer.js:2208-2209,2379-2380, src/renderers/webgl/WebGLEnvironments.js:71-139]。ただし texture.mapping を EquirectangularReflectionMapping(または Cube) にしないとIBLは無音で真っ黒 [S envmap_physical_pars_fragment.glsl.js:22-41 (CUBE_UV以外は vec3(0))] [R e5: 中心画素 0 対 255]。HDRLoaderは mapping を設定しない(呼び出し側で設定) [S examples/jsm/loaders/HDRLoader.js:16]。PMREMのサイズは入力から決まる: equirect 幅/4 を2の冪に丸めた値=cube辺、出力は 3*max(cube,112) x 4*cube の HalfFloat RGBA。equirect 1024x512 → 768x1024 (約6.3MB) [S src/extras/PMREMGenerator.js:226-231,258-268,285-297] [R e5] [C]。2048幅なら 1536x2048 (約25MB、ping-pong同サイズ) [C]。入力下限は equirect 64x32 / cube 16x16 [S PMREMGenerator.js:144,160]。8x4の equirect では変換が黒になった [R]。fromScene既定 size=256 (:107)。PMREMGeneratorは静的資源で、dispose()は他インスタンスにも影響 [S :202-206]。

§1-R12 KTX2: ミップを焼き、detectSupportを呼び、4の倍数で作る。圧縮テクスチャはGL側でミップ自動生成されない(generateMipmaps=false)ため、ファイルにミップが無いと minFilter=LinearFilter になりチラつく [S examples/jsm/loaders/KTX2Loader.js:453-455]。detectSupport(renderer) を呼ばないと例外 [S 同:379,411]。ETC1S/UASTCは4の倍数でないと警告 [S 同:726]。sRGB/linear/Display-P3 はKTX2のDFDで決まる [S 同:1251-1272]。変換先優先順 [S 同:793-880,899-922]: UASTC=ASTC4x4→BC7→ETC2→ETC1→BC1/3→PVRTC→RGBA32、ETC1S=ETC2→ETC1→BC7→BC1/3→PVRTC→RGBA32 (PVRTCは2の冪のみ)。LinuxデスクトップではMesaのエミュレーション回避のため ASTC/ETC1/ETC2 を無効化 [S 同:258-272]。トランスコーダ既定パスは import.meta.url 基準 [S 同:106-107,296]。法線はRG2チャンネル形式(RGFormat/BC5/EAC RG11)なら USE_PACKED_NORMALMAP でzを復元 [S WebGLPrograms.js:10-14,230]。通常画像は generateMipmaps=true・LinearMipmapLinear [S Texture.js:48,257]、anisotropy 既定1 [S :810] (getMaxAnisotropy は本環境16 [R e5])。DataTexture は Nearest・ミップ無し [S DataTexture.js:32,60]。圧縮の品質面の推奨(法線/ORMはUASTC等)は未検証 (U6)。

§1-R13 スキニング/モーフ: WebGL2ではボーン行列テクスチャ方式で実用上のボーン数上限は無い。boneTexture(float RGBA, 1行列=4画素)をtexelFetch、サイズは ceil(sqrt(bones*4)/4)*4 [S skinning_pars_vertex.glsl.js:7-20, src/objects/Skeleton.js:243-267]。モーフはMORPHTARGETS_COUNT回のループ+テクスチャ [S morphtarget_vertex.glsl.js:9-13]。SkinnedMesh と InstancedMesh は別々のMesh派生クラスで同一オブジェクトにできない [S src/objects/SkinnedMesh.js:38, InstancedMesh.js:28, BatchedMesh.js:182]。インスタンス単位のモーフ重みは InstancedMesh.morphTexture (morphinstance_vertex) で可能 [S WebGLPrograms.js:211, morphinstance_vertex.glsl.js:1-13]。skinning詳細は別監査 (threejs_audit_b_skinning_anim.md) に委ねる。

§1-R14 TSLへ移す場合に先に知るべき差: (1) clearcoatRoughnessMap のチャンネルが WebGL=G / Node=R と食い違う (Node側の不具合の可能性) [S lights_physical_fragment.glsl.js:71 対 src/nodes/accessors/MaterialNode.js:276]。glTFのclearcoatRoughnessはG。(2) transmissionは『不透明の再描画』ではなく『フレームバッファのコピー+ミップ生成』 [S src/nodes/display/ViewportTextureNode.js:89,198, src/nodes/functions/PhysicalLightingModel.js:70-83,544-572] [R e4b: WebGL2バックエンドで draw6/copyTex1/genMip1 (Front)、draw7/2/2 (Double)。WebGLRendererは11/12 draw]。(3) positionNodeはスキニング・モーフ・変位の後に適用され、シャドウにも再利用 [S src/materials/nodes/NodeMaterial.js:770-808, Renderer.js:3574-3579]。(4) alphaHashの座標: WebGLはスキニング前のposition属性 [S begin_vertex.glsl.js:4-6]、Nodeは positionLocal [S NodeMaterial.js:889-895] (頂点ステージ反映後の値と推定、未実行)。(5) three/webgpuビルドは非圧縮2.28MB、threeは0.66MB (+共通core 1.46MB) [R §5.1]。(6) 実WebGPUでは requestAdapter({featureLevel:'compatibility'}) で、core-features-and-limits が無い互換モードだとMSAAが0に落ちる [S src/renderers/webgpu/WebGPUBackend.js:217,258-263]。

§2.1.1 MeshPhysicalMaterial自身の全プロパティ。既定値は new MeshPhysicalMaterial() の実値 [R dump_defaults.mjs]。JSDocと食い違う箇所は★。ファイルは src/materials/MeshPhysicalMaterial.js。
defines {STANDARD:'',PHYSICAL:''} (:58-63)
anisotropy 0 (0-1; getter/setter :373-389; 0↔正でversion++)
anisotropyRotation 0 ★JSDoc(:73)と types/three/src/materials/MeshPhysicalMaterial.d.ts:13 は @default 1 だが実値0 (:75)。rad、tangentからCCW。uniformは (anisotropy*cos, anisotropy*sin) [S WebGLMaterials.js:548]
anisotropyMap null (:88) R,G=方向[-1,1] (2*rg-1を正規化)、B=強さ [lights_physical_fragment.glsl.js:141-143]、NoColorSpace、gate: anisotropy>0。tangent属性があれば使い、無ければUV導関数でTBN [normal_fragment_begin.glsl.js:24-38, WebGLPrograms.js:308]
clearcoat 0 (:399-415) / clearcoatMap null R (:100; shader :65) / clearcoatRoughness 0 (:108) / clearcoatRoughnessMap null ★WebGL=G (:120; lights_physical_fragment.glsl.js:71)、Node=R (MaterialNode.js:276) / clearcoatNormalScale (1,1) (:129) / clearcoatNormalMap null RGB接空間 (:140; clearcoat_normal_fragment_maps.glsl.js:4-7)。clearcoat F0は0.04固定 (lights_physical_fragment.glsl.js:60)、粗さは max(r,0.0525)+geometryRoughness (:76-78)
ior 1.5 (1.0-2.333; :148) / reflectivity(派生) 0.5 (ior=1.5; :161-172; 2.5*(ior-1)/(ior+1) をclamp) [R e6]
iridescence 0 (:423-439) / iridescenceMap null R (:184; shader :101) / iridescenceIOR 1.3 (:193) / iridescenceThicknessRange [100,400] nm (:202) / iridescenceThicknessMap null G (:217; thickness=(max-min)*G+min、マップ無しは常に最大値=[1]で[0]は未使用: lights_physical_fragment.glsl.js:105-113)。thickness==0 なら虹彩0 (lights_fragment_begin.glsl.js:32-40)。外側媒質は空気固定 evalIridescence(1.0,…) (:44-45)
sheen 0 (:500-516) / sheenColor #000000 (:225) 実効色は sheenColor*sheen (WebGLMaterials.js:419) / sheenColorMap null RGB sRGB (:238; shader :123) / sheenRoughness 1 (:246; shaderで[0.0001,1]にclamp :127) / sheenRoughnessMap null A (:258; shader :131)
transmission 0 (:530-546; >0の物体は透過リストへ WebGLRenderLists.js:130-153) / transmissionMap null R (:270; transmission_fragment.glsl.js:12) / thickness 0 (:280; メッシュのローカル座標系×モデル行列スケール transmission_pars_fragment.glsl.js:128-133) / thicknessMap null G (:292; transmission_fragment.glsl.js:18) / attenuationDistance Infinity (:302; ワールド単位) / attenuationColor (1,1,1) (:311)
dispersion 0 (:449-465; 透過物体のみ :444; 3つのIORで屈折サンプルを3回 transmission_pars_fragment.glsl.js:178-203)
retroreflectivity 0 (:476-492; 0-1; r186のソースに存在する比較的新しいプロパティ)
specularIntensity 1 (:320) / specularIntensityMap null A (:332; lights_physical_fragment.glsl.js:31) / specularColor (1,1,1) (:340) / specularColorMap null RGB sRGB (:353; shader :25)。マップ2つは親ゲート無し (WebGLPrograms.js:161-162)
specular合成: specularColor=min(((ior-1)/(ior+1))^2*specularColorFactor,1)*specularIntensityFactor、specularF90=mix(specularIntensityFactor,1,metalness) (lights_physical_fragment.glsl.js:35-46)。ior1.5でF0=0.04
copy() が全プロパティを写す (:548-602)

§2.1.2 継承プロパティのうち実装に効くもの (MeshStandardMaterial.js / Material.js)。
color #ffffff (Std:75)
roughness 1 / roughnessMap null G (Std:85,288; roughnessmap_fragment.glsl.js:9)。shaderで max(roughness,0.0525)+geometryRoughness、geometryRoughnessは法線マップ前の法線 nonPerturbedNormal の導関数 (lights_physical_fragment.glsl.js:7-12)
metalness 0 / metalnessMap null B (Std:96,300; metalnessmap_fragment.glsl.js:9)
aoMap null / aoMapIntensity 1 (Std:143,153) R。式 (R-1)*intensity+1、間接光のみ (aomap_fragment.glsl.js:5-23)。JSDocの『2つ目のUVが必要』は古く、実際は texture.channel (既定0) [S WebGLPrograms.js aoMapUv=getChannel(aoMap.channel)]
emissive #000000 / emissiveIntensity 1 / emissiveMap null (Std:162,170,184) RGB sRGB、uniformは emissive*intensity (WebGLMaterials.js:150)、emissiveが黒だとマップは見えない (emissivemap_fragment.glsl.js:14)
normalMap null / normalMapType TangentSpace(0) / normalScale (1,1) (Std:222,230,238)。RGのみ形式ならz復元 (normal_fragment_maps.glsl.js:23-33)
bumpMap null / bumpScale 1 (Std:198,206) R (bumpmap_pars_fragment.glsl.js:17)、法線マップがあれば無視
displacementMap null / displacementScale 1 ★JSDocは0 (Std:256, 266, JSDoc264) / displacementBias 0 (Std:276) R、objectNormal方向 (displacementmap_vertex.glsl.js:4)
alphaMap null G (Std:318; alphamap_fragment.glsl.js:4)
envMap null / envMapRotation Euler(0,0,0) / envMapIntensity 1 (Std:332,340,348)
lightMap null / lightMapIntensity 1 (Std:123) RGB、irradianceに加算 (lights_fragment_maps.glsl.js:4-11)
flatShading false / fog true (Std:394,402)
Material.js: side FrontSide (:88), vertexColors false (:99), opacity 1 (:111), transparent false (:124), alphaHash false (:135), depthTest true (:220), depthWrite true (:231), shadowSide null (:342), dithering false (:399), alphaToCoverage false (:409), premultipliedAlpha false (:417), forceSinglePass false (:431), allowOverride true (:439), toneMapped true (:458), alphaTest 0 (getter/setter :489-503)。transparent:false かつ NormalBlending かつ alphaToCoverage:false なら #define OPAQUE で出力α=1 (WebGLPrograms.js:264, opaque_fragment.glsl.js:2-4)

§2.2 テクスチャチャンネル早見表 (three / glTF対応)。map RGB(A) sRGB / baseColorTexture (GLTFLoader.js:3636)。aoMap R none / occlusionTexture (:3709)。roughnessMap G none / metallicRoughnessTexture (:3646)。metalnessMap B none / 同 (:3645)。normalMap RGB(またはRG) none / normalTexture (:3693)。emissiveMap RGB sRGB (:3728)。clearcoatMap R / clearcoatRoughnessMap G / KHR_materials_clearcoat (:922,934)。iridescenceMap R / iridescenceThicknessMap G / KHR_materials_iridescence (:1036,1066)。sheenColorMap RGB sRGB / sheenRoughnessMap A / KHR_materials_sheen (:1127,1133)。transmissionMap R / thicknessMap G / KHR_materials_transmission,volume (:1184,1230)。specularIntensityMap A / specularColorMap RGB sRGB / KHR_materials_specular (:1321,1330)。anisotropyMap RG=方向,B=強さ (:1433)。alphaMap G / bumpMap R / displacementMap R。ORM仕様(r186): Occlusion=R, Roughness=G, Metalness=B。専用ORMスロットは無く、同一Textureを3スロットへ代入する。GLTFLoaderは texture.channel = mapDef.texCoord を設定 (:3451)。

§2.3 onBeforeCompileで差し込めるShaderChunk (ShaderLib.physical = src/renderers/shaders/ShaderLib/meshphysical.glsl.js)。頂点シェーダ (行はmeshphysical.glsl.js): uv_vertex/color_vertex/morphinstance_vertex/morphcolor_vertex/batching_vertex :27-31 / beginnormal_vertex :33 (vec3 objectNormal=normal; 法線の初期値) / morphnormal_vertex :34 / skinbase_vertex :35 (boneMatX..W) / skinnormal_vertex :36 (skinMatrixを作りobjectNormal/objectTangentに適用) / defaultnormal_vertex :37 (transformedNormal、batching/instancing、normalMatrix、FLIP_SIDED反転) / normal_vertex :38 (vNormal/vTangent/vBitangent) / begin_vertex :40 (vec3 transformed=position; USE_ALPHAHASHならvPosition=position=スキニング前座標 begin_vertex.glsl.js:4-6) / morphtarget_vertex :41 / skinning_vertex :42 (transformedをボーン変形。この直後に差すと『スキニング後』の手続き変形) / displacementmap_vertex :43 / project_vertex :44 (mvPosition,gl_Position) / worldpos_vertex :50 (worldPositionは USE_ENVMAP/DISTANCE/USE_SHADOWMAP/USE_TRANSMISSION/スポット座標のときだけ定義 worldpos_vertex.glsl.js:2) / shadowmap_vertex,fog_vertex :51-52。順序は法線(33-38)→位置(40-42)。*_pars_vertex は宣言置き場で、#include <common> の直後に自前関数/uniformを足すのが定石。

§2.3(続) フラグメントシェーダ (行はmeshphysical.glsl.js): map_fragment :175 / color_fragment :176 / alphamap_fragment :177 / alphatest_fragment :178 / alphahash_fragment :179 / roughnessmap_fragment :180 (float roughnessFactor。粗さの介入点=この直後) / metalnessmap_fragment :181 (metalnessFactor) / normal_fragment_begin :182 (normal, tbn, nonPerturbedNormal :74) / normal_fragment_maps :183 (normalMap/bumpMap適用。法線の最終介入点=この直後) / clearcoat_normal_fragment_begin,_maps :184-185 / emissivemap_fragment :186 (vec3 totalEmissiveRadiance。放射の介入点=この直後) / lights_physical_fragment :189 (PhysicalMaterial material を組む。BRDF入力の介入点=この直後に material.* を変更) / lights_fragment_begin :190 (幾何入力、iridescence事前計算、material.dfg、ライトループ point→spot→sun→directional→rectArea の順にRE_Direct、irradiance(ambient/probe/hemi/probe grid)) / lights_fragment_maps :191 (lightMap加算、IBLのiblIrradiance/radiance/clearcoatRadiance) / lights_fragment_end :192 (RE_IndirectDiffuse/RE_IndirectSpecular呼び出し。reflectedLight確定。ライト結果の介入点=この直後) / aomap_fragment :195 / 本体 :197-198 totalDiffuse,totalSpecular / transmission_fragment :200 (totalDiffuse=mix(totalDiffuse,transmitted.rgb,transmission) transmission_fragment.glsl.js:33) / 本体 :202-218 (outgoingLight=totalDiffuse+totalSpecular+totalEmissiveRadiance、sheen加算204-208、clearcoat合成 outgoingLight*(1-cc*Fcc)+clearcoat鏡面 210-218。放射もこの減衰を受ける。#includeではないので outgoingLight は #include <opaque_fragment> の直前に差す) / opaque_fragment :220 / tonemapping_fragment,colorspace_fragment,fog_fragment,premultiplied_alpha_fragment,dithering_fragment :221-225。
ライト計算そのものを差し替えるなら lights_physical_pars_fragment を置換し RE_Direct/RE_IndirectDiffuse/RE_IndirectSpecular を自前実装 (lights_physical_pars_fragment.glsl.js:487,549,583、マクロ :649-652)。BRDF_GGX :158、computeMultiscattering :397、EnvironmentBRDF :382、BRDF_Sheen :347、D_Charlie :326、V_GGX_SmithCorrelated :81、D_GGX :94。r186は直接光の多重散乱補償 material.multiScatteringCompensation を lights_fragment_begin.glsl.js:63-75 で計算。影パス: ShaderLib.depth/distance も begin_vertex/morphtarget_vertex/skinning_vertex/displacementmap_vertex を含む [R chunk_map.out]ので、同じパッチを customDepthMaterial/customDistanceMaterial に入れれば影も追従する。影マテリアルへ渡るのは alphaMap/alphaTest/map/displacementMap等のみで、alphaHash・opacity・transmission は渡らず、alphaToCoverage は固定 alphaTest=0.5 で近似 [S WebGLShadowMap.js:445-447,492-493]。

§2.4 アルファ/透過/DoubleSideの描画パスコスト。実測 renderer.info.render.calls (球16x8の不透明5個ベース) [R e1_transmission]: 不透明5=5 / +physical(transmission=0)=6 / +transmission=1 FrontSide=11 (透過ターゲットへ不透明5を再描画+5、本描画の透過1) / +transmission=1 DoubleSide=12 (+裏面1) / +transparent+DoubleSide(transmissionなし)=7 (同一物体を裏→表で2回) / 不透明0+transmission=1 → 1 (再描画対象なし。ターゲット確保・クリア・ミップは走る) / 不透明5+transmission+scene.overrideMaterial=6 (透過パス省略)。ソース対応: 分類は transmission>0 → transmissive、次に transparent、他は opaque [S WebGLRenderLists.js:130-153]。描画順 opaque→transmissive→transparent [S WebGLRenderer.js:1988-1990]。renderTransmissionPass [S WebGLRenderer.js:2002-2125]: overrideMaterialがあれば何もしない (:2006-2010)。専用ターゲット HalfFloat(対応時)/generateMipmaps/LinearMipmapLinear/samples=max(4,capabilities.samples) (:2014-2025)、カメラIDごと・レンダー状態ごとに1個 (:2012)。サイズ=viewport*transmissionResolutionScale (:2044; 既定1.0 :297)。パス中はトーンマップ無効 (:2065)、背景も描く (:2060)。描くのは不透明リストのみ (:2076) なので透過物体同士は映らない。DoubleSideの透過物体は裏面のみ追加描画 (:2081-2107; WEBGL_multisampled_render_to_texture があれば省略)。毎フレームMSAA resolveとミップ生成 (:2078-2079,2109-2112)。本描画は transmissionSamplerMap を渡し (WebGLMaterials.js:520-521)、textureBicubicのLOD指定(粗さ×IOR)で屈折を引く (transmission_pars_fragment.glsl.js:109-150)。メモリ目安 [C]: 1920x1080 HalfFloat RGBA で解決先約16.6MB(ミップ込み約22MB)+MSAA x4のカラーバッファ約66MB+深度 (実機未測定 U3)。
alphaHash [S alphahash_pars_fragment.glsl.js:4-65 (Wyman2017Hashed参照)]: フラグメントで dFdx/dFdy (:25-28) と hash3D を2回 (sinベース :12,39-41)。判定 a < getAlphaHashThreshold(vPosition) で discard (alphahash_fragment.glsl.js:4)。不透明パス・深度書込あり・ソート不要、OPAQUE維持で出力α=1、α=0.5で残存画素48.2% [R e3]。ノイズ低減はTAA (Material.js:127-135)。r186には examples/jsm/postprocessing/TAARenderPass.js あり。ノイズはposition属性(スキニング前)に固定されるので動くスキンメッシュでも模様が表面に貼り付く。インスタンスは全員同模様。影には無効。
alphaToCoverage: MSAA前提 (Material.js:402-405)、WebGLRenderer既定 antialias=false (:78)。SAMPLE_ALPHA_TO_COVERAGE有効化 (WebGLState.js:786-788)。alphaTest併用で smoothstep(alphaTest, alphaTest+fwidth(a), a) (alphatest_fragment.glsl.js:4-7)。OPAQUEが外れαが残る (WebGLPrograms.js:264)。[R e3] MSAA4ターゲットでα=0.5→平均128、MSAAなしは効かず255。
alphaTest: discardのみ、判定は a<alphaTest (等しければ残る) [R e3: alphaTest0.5/α0.5→全画素残る、0.6→0%]。

§2.5 NodeMaterial/TSLとWebGPURenderer (r186)。クラス: MeshPhysicalNodeMaterial(:20) extends MeshStandardNodeMaterial extends NodeMaterial。既定値は new MeshPhysicalMaterial() から setDefaultValues でコピー (src/materials/nodes/MeshPhysicalNodeMaterial.js:13,280, NodeMaterial.js:1219-1250)。上書きノード: clearcoatNode/clearcoatRoughnessNode/clearcoatNormalNode/sheenNode/sheenRoughnessNode/iridescenceNode/iridescenceIORNode/iridescenceThicknessNode/specularIntensityNode/specularColorNode/iorNode/transmissionNode/thicknessNode/attenuationDistanceNode/attenuationColorNode/dispersionNode/retroreflectivityNode/anisotropyNode (MeshPhysicalNodeMaterial.js:57-278)、Standardの emissiveNode/metalnessNode/roughnessNode (MeshStandardNodeMaterial.js:64,77,90)、NodeMaterialの colorNode/normalNode/opacityNode/positionNode/outputNode/fragmentNode/aoNode/envNode/lightsNode/alphaTestNode/maskNode 等 (NodeMaterial.js:103-382)。機能ON判定はプロパティまたはノード (useClearcoat等 MeshPhysicalNodeMaterial.js:292-370)。自動置換 StandardNodeLibrary.js:66。WebGL2降格 WebGPURenderer.js:41,57-70, Renderer.js:784-843 [R e4: 警告 'WebGPURenderer: WebGPU is not available, running under WebGL2 backend.']。初期化 await init() 必須 (Renderer.js:784,1498-1500)。
スキニング: NodeMaterial.setupPosition が object.isSkinnedMesh で skinning(object) を呼ぶ (NodeMaterial.js:776-780)。ボーン行列はUBO(bones*64B<=上限)かテクスチャ自動切替 (src/nodes/accessors/Skinning.js:58-86,232-283)。上限はWebGPU maxUniformBufferBindingSize (WebGPUCapabilities.js:40-43)、WebGL2バックエンド MAX_UNIFORM_BLOCK_SIZE (webgl-fallback/utils/WebGLCapabilities.js:75-83)。モーフは morphReference(object) (NodeMaterial.js:770-774)。[R e4,e8] 曲げたシリンダでWebGLRendererと画素数が完全一致 (420→393)。
iridescence: PhysicalLightingModel が evalIridescence (Belcour-Barla型) で iridescenceFresnel と F0近似を作る (PhysicalLightingModel.js:187-300,517-541)、厚みは iridescenceThicknessMap.g、マップ無しは最大値 (MaterialNode.js:341-355)。[R e4b] 同じ灰0x888888でOFF/ON比較すると平均RGB (41,41,41)→(40.7,43.5,42.8) と色相が動く。clearcoat/sheen/anisotropy/transmission/dispersion/retroreflection はPhysicalLightingModelのコンストラクタフラグで有効化 (PhysicalLightingModel.js:352-395,502-512,544-572,629-666)。
透過: viewportMipTexture (フレームバッファコピー+ミップ)、不透明の再描画なし、裏面用/表面用に別テクスチャ (PhysicalLightingModel.js:70-83,544-572; ViewportTextureNode.js:89,198)。[R e4b] WebGL2バックエンドで draw/copyTexSubImage2D/generateMipmap = 透過なし6/0/0、Front 6/1/1、Double 7/2/2。透過+DoubleSide+forceSinglePass===false は裏→表の2回 (src/renderers/common/RenderList.js:75-80, Renderer.js:3428-3460)。
alpha: NodeMaterial.setupDiffuseColor に alphaTest/alphaHash/alphaToCoverage (NodeMaterial.js:865-895)、alphaToCoverageはsamples>1が条件 (webgpu/utils/WebGPUPipelineUtils.js:212)。影: positionNode/castShadowPositionNode が影に自動反映 (Renderer.js:3574-3579)。onBeforeCompile は効かない (Material.js:526-528)。
Node経路とWebGL経路の差異: (1) clearcoatRoughnessMap WebGL=G / Node=R。(2) 透過の仕組み(再描画 対 フレームバッファコピー)。(3) alphaHash座標系。(4) volumeAttenuation: WebGLは isinf で明示分岐 (transmission_pars_fragment.glsl.js:154)、Nodeは attenuationDistance!=0 判定 (PhysicalLightingModel.js:88)。attenuationColorに0成分を入れるとlog(0)を踏むので避ける。

§2.6 WebGLRenderer対WebGPURenderer比較 (根拠)。成熟度: WebGL1はr163で廃止 (WebGLRenderer.js:58-62,102)。シェーダ改造: WebGL=onBeforeCompile+ShaderChunk(GLSL文字列)、WebGPU=TSLノード(GLSLパッチ不可) (Material.js:526-528, R e4)。非同期: WebGLは同期、WebGPUはawait init()必須 (Renderer.js:1498-1500)。スキニング: 両者同結果 (skinning_pars_vertex.glsl.js:7-20 / Skinning.js:58-86, R e8)。Physical機能: 同機能(差異は§2.5)。透過コスト: WebGL=不透明再描画+MSAA/HalfFloat/ミップ、Node=フレームバッファコピー+ミップ。影+変形: WebGLは影マテリアルへ別パッチ (WebGLShadowMap.js:433-438)、TSLは自動 (Renderer.js:3574-3579)。ポスト処理: WebGLはr186で outputBufferType:HalfFloatType+setEffects (WebGLRenderer.js:84,565-568,747-771)。配布サイズ: three.module.js 662,772B + three.core.js 1,458,113B、three.webgpu.js 2,284,850B + core (非圧縮ソース)。three.webgpu.js に WebGLRenderer は含まれない [R §5.1]。実機検証: WebGLはSwiftShaderで確認、WebGPUはWebGL2降格のみ確認で実WebGPU未確認 (U1)。

§2.7 色空間/PMREM/KTX2のソース根拠まとめ。色空間: ColorManagement.enabled=true・workingColorSpace=LinearSRGB (ColorManagement.js:21-23)。sRGBアップロードはSRGB8_ALPHA8でHWデコード (WebGLTextures.js:234)、非圧縮sRGBはRGBA8のみ (違反は警告 :2451)、圧縮はsRGB用内部形式を選ぶ (WebGLUtils.js:44-53,111-112,138-151,169)。toneMappedでもレンダーターゲット描画では掛からない (WebGLPrograms.js:178-185)。PMREM: fromScene(scene,sigma=0,near=0.1,far=100,{size=256,position}) :107 / fromEquirectangular :151 / fromCubemap :167、出力はHalfFloat RGBA CubeUV (mapping=CubeUVReflectionMapping=306) :285-297、GGX_SAMPLES=256 :37。[R e2,e5] fromScene既定→768x1024 HalfFloat srgb-linear。1024x512 equirect変換はCPU(SwiftShader)で約18ms (実機未測定)。envMapなしのbare physical+envでサンプラー2 (envMapはCubeUV 2Dアトラス1枚)。KTX2: §1-R12。ミップ: 非圧縮KTX2は levelCount===0 で実行時生成 (KTX2Loader.js:1213-1225)。


## §3 落とし穴

P1 サブマップが無言で無視される: thicknessMap/iridescenceThicknessMap等は親効果が0だと #define USE_*MAP が出ない [S WebGLPrograms.js:148-165] [R e2]。対策: 親効果を正にする。

P2 specularColorMap/specularIntensityMap は常時サンプラーを消費 [S WebGLPrograms.js:161-162] [R e2]。使わないなら null。

P3 効果の0↔正(と alphaTest の0↔正)で再コンパイル [S MeshPhysicalMaterial.js:381-385他, Material.js:495-503] [R e2]。→R2。

P4 sheenを上げても何も見えない: sheenColor既定が黒で実効色は sheenColor*sheen [S WebGLMaterials.js:419, MeshPhysicalMaterial.js:225]。

P5 iridescenceThicknessRange[0] が効かない: 厚みマップ無しでは最大値固定 [S lights_physical_fragment.glsl.js:111]。厚み0は虹彩0 [S lights_fragment_begin.glsl.js:32-40]。外側媒質は空気固定 (水中の薄膜色は正しく出ない。r14 F-01と一致) [S :44-45]。

P6 JSDoc/型定義の既定値の誤り: anisotropyRotation (doc 1 / 実0)、displacementScale (doc 0 / 実1)。@types/three も同じ誤りを引き継ぐ [S types/three/src/materials/MeshPhysicalMaterial.d.ts:13] [R dump_defaults]。実値を信じる。

P7 AOが直接光に効かない [S aomap_fragment.glsl.js:7-23]。直接光支配の絵ではAOが見えない。

P8 ORMは3スロット=3サンプラーで、同一Textureなら channel も共有 (R4)。

P9 サンプラー不足: dfgLUT常駐、影付きライトごと+1、透過で+1。全部入りで15/16 (R5) [R e2b]。

P10 onBeforeCompileの既定キャッシュキーで焼き込み定数が共有される (R6-1) [R e3]。

P11 位置だけ変形して法線が古い: 法線系チャンクは位置系より前 [S meshphysical.glsl.js:33-38 対 :40-42]。手続き変形を入れるなら beginnormal_vertex/skinnormal_vertex 付近でも同じ変形の微分を objectNormal に反映する。

P12 影が変形に追従しない (R6-4) [R e7]。さらに影は alphaHash/opacity/transmission も無視し、半透明の鰭が不透明な影を落とす [S WebGLShadowMap.js:445-447,492-493]。

P13 worldPosition が未定義: 条件付き定義 [S worldpos_vertex.glsl.js:2]。ワールド座標が要るパッチは自前で modelMatrix*vec4(transformed,1.0) を使う。

P14 alphaHashはインスタンス間で同一模様・影に効かない・導関数(dFdx/dFdy)を使う・TAA無しだと粒状ノイズが残る [S alphahash_pars_fragment.glsl.js:25-28, begin_vertex.glsl.js:4-6, Material.js:127-135]。

P15 alphaToCoverageはMSAAが無いと効かない [R e3: 255]。WebGLRenderer既定は antialias=false [S WebGLRenderer.js:78]。レンダーターゲットなら samples>0 が必要。

P16 transparent+DoubleSide は2回描画+毎フレーム version+2+プログラム2本 [R e6] [S WebGLRenderer.js:2165-2175]。forceSinglePass か alphaHash で回避。

P17 transmission: 透過物体同士は映らない / scene.overrideMaterial で透過パスが丸ごと消える / 解像度はviewport*transmissionResolutionScale / opacityは1にする (JSDoc MeshPhysicalMaterial.js:525) [S WebGLRenderer.js:2006-2010,2044,2076]。

P18 thickness (ローカル座標×モデルスケール) と attenuationDistance (ワールド単位) の単位が違う [S transmission_pars_fragment.glsl.js:128-133]。スケールした魚体で thickness を決めるとき混乱する。

P19 環境マップの mapping 未設定でIBLが真っ黒 [R e5]。入力が小さすぎる(<64x32)と変換が壊れる [R: 8x4で黒、256x128で白]。

P20 TextureLoader は colorSpace を設定しない。map/emissiveMap の設定忘れで明るく崩れる (128→188) [R e5]。

P21 toneMapped は画面/XRのみ。レンダーターゲット経由のポスト処理では自前でトーンマップするか、outputBufferType:HalfFloatType+setEffects を使う [S WebGLPrograms.js:178-185, WebGLRenderer.js:747-771]。

P22 KTX2: ミップ未焼き込みで LinearFilter になりチラつく / detectSupport 忘れで例外 / 4の倍数でないと警告 [S KTX2Loader.js:453-455,379,726]。

P23 DataTexture の既定は Nearest・ミップ無し [S DataTexture.js:32,60]。手作りのORM等でちらつく。

P24 非圧縮sRGBテクスチャは RGBA8 のみ [S WebGLTextures.js:2451]。

P25 Node経路: onBeforeCompile は呼ばれない / clearcoatRoughnessMap が R / init() 非同期 / 互換モードでMSAA 0 [S Material.js:526-528, MaterialNode.js:276, Renderer.js:1498-1500, WebGPUBackend.js:258-263] [R e4]。

P26 SkinnedMesh は InstancedMesh にできない [S SkinnedMesh.js:38, InstancedMesh.js:28]。群泳は SkinnedMesh を複数置く(ドローコール増)か、モーフ+InstancedMesh(morphTexture)。描画コストは未測定 (U7)。

P27 shadowSide既定: FrontSideは裏面を影に描くため、薄い鰭など非閉曲面では影が欠ける/漏れる。DoubleSide か shadowSide を明示 [S Material.js:332-342, WebGLShadowMap.js:484-488]。

P28 emissive が黒だと emissiveMap は見えない [S emissivemap_fragment.glsl.js:14 (totalEmissiveRadiance *= map)]。

P29 放射も clearcoat の減衰を受ける [S meshphysical.glsl.js:216 (outgoingLight*(1-cc*Fcc))]。発光を純加算にしたいなら opaque_fragment の後で足す。

P30 PMREMGeneratorは静的資源で、dispose() は他インスタンスにも影響。equirect 2048幅は約25MB (ping-pong同サイズ) [S PMREMGenerator.js:202-206] [C]。


## §4〜§5 未確認事項・実行コマンドと結果

U1 実WebGPUアダプタでの動作と速度: 本環境はSwiftShaderのみ。WebGPUBackend経路 (WGSL生成、互換モードのMSAA 0、UBO/ボーン) は未実行。

U2 GPU実機での描画時間・ドライバ差: [R]は正否・描画回数・形状の確認で、性能値ではない (SwiftShaderはCPU)。

U3 transmissionターゲットのメモリ実測: §2.4は計算のみ。transmissionResolutionScaleを下げたときの見た目の劣化も未評価。

U4 サンプラー上限: 実機の MAX_TEXTURE_IMAGE_UNITS (本環境32、WebGL2下限16 [K])。モバイル実値は未収集。

U5 TSLでのカスタムノード実装 (鱗・パーマーク・水中減衰など): Node経路で positionNode+影の再利用以外は未試作。

U6 KTX2エンコーダ設定の品質: 法線/ORMにUASTC、色にETC1Sという運用の品質・サイズは未検証 [K]。KTX2Loader.js:793付近が参照するKhronos KTX Developer Guideはネットワーク制限で未読。

U7 SkinnedMesh多数 対 InstancedMesh+モーフの描画コスト。

U8 alphaHash+TAAの見た目、alphaToCoverageの実機品質。

U9 Node経路の clearcoatRoughnessMap Rチャンネルが意図か不具合か (上流issueは未確認。GitHub到達不可)。

U10 SunLight/LightProbeGrid (examples/jsm/lights/SunLight.js, examples/jsm/lighting/LightProbeGridUtils.js) の物理マテリアルとの相互作用: lights_fragment_begin.glsl.js:155-179,246-252 に分岐があることのみ確認。

U11 @types/three@0.186.0 の型と実装の差: JSDoc既定値2件 (P6) しか見ていない。型の網羅比較は未実施。

U12 Chromium以外 (Firefox/Safari) での挙動 (拡張の有無、KTX2のトランスコード先)。

U13 NodeMaterialのalphaHashがスキニング後座標を使うという推定 (NodeMaterial.js:889-895 positionLocal) は未実行確認。

§5.1 入手物の完全性 [コマンド]: cd $S/three; sha1sum three-0.186.1.tgz types-three-0.186.0.tgz; npm view three@0.186.1 dist.integrity dist.shasum; npm view @types/three@0.186.0 dist.integrity dist.shasum; npm view three dist-tags --json; ls -la package/build; grep -c 'class WebGLRenderer' package/build/three.module.js package/build/three.webgpu.js。[結果] shasum 6d50f70c2c437f844179bbb56d6f5b774e1ca38a (three) / fc936323d7eeb885052fd5de352e3772f488ea99 (types) がregistryと一致、integrityも一致。latest=0.186.1 (time: 0.186.0=2026-09-08, 0.186.1=2026-09-24)。build サイズ: three.core.js 1458113 / three.module.js 662772 / three.webgpu.js 2284850 / three.tsl.js 36854 バイト。'class WebGLRenderer' は three.module.js に1、three.webgpu.js に0。three.module.js と three.webgpu.js はどちらも ./three.core.js を import。S=/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad (three は $S/three/three-0.186.1/package、型は $S/three/types-three-0.186.0/three)。

§5.2 既定値ダンプ [コマンド]: cd $S/threeaudit && node dump_defaults.mjs (build/three.module.js から new MeshPhysicalMaterial() を作り全プロパティ列挙; 出力 dump_defaults.out)。[結果抜粋] THREE.REVISION=186; anisotropy 0; anisotropyRotation 0; attenuationColor ffffff; attenuationDistance Infinity; clearcoat 0; clearcoatRoughness 0; clearcoatNormalScale (1,1); dispersion 0; displacementScale 1; ior 1.5; iridescence 0; iridescenceIOR 1.3; iridescenceThicknessRange [100,400]; retroreflectivity 0; sheen 0; sheenColor 000000; sheenRoughness 1; specularColor ffffff; specularIntensity 1; thickness 0; transmission 0; defines {STANDARD,PHYSICAL}; side 0; opacity 1; transparent false; alphaTest 0; alphaHash false; alphaToCoverage false; forceSinglePass false; toneMapped true; shadowSide null; aoMapIntensity 1; envMapIntensity 1; roughness 1; metalness 0; emissiveIntensity 1; normalScale (1,1); bumpScale 1。

§5.3 チャンク一覧とアンカー一意性 [コマンド]: cd $S/threeaudit && node chunk_map.mjs (src/renderers/shaders/ShaderLib.js の physical/depth/distance から #include を抽出; 出力 chunk_map.out)。[結果] physical 頂点33件・フラグメント55件の#includeを実行順に出力 (§2.3の表の元)。ShaderChunk総数142。計画したアンカー頂点12+フラグメント19は全て『トップレベルに1回ずつ』。ShaderLib.depth/distance の頂点側は begin_vertex, morphtarget_vertex, skinning_vertex, displacementmap_vertex 等を含む。

§5.4 ブラウザ実験の準備と環境 [コマンド]: cd $S/threeaudit; npm init -y; npm install puppeteer-core @sparticuz/chromium (Chromiumバイナリはnpmのtarballにあり /tmp/chromium へ展開); ./run_all.sh (pages/e1..e8 を harness.mjs で順に実行し eN_*.out へ保存)。環境: ANGLE+SwiftShader (Vulkanソフトウェア)、WebGL2、MAX_TEXTURE_IMAGE_UNITS=32、MAX_SAMPLES=4、navigator.gpu あり・requestAdapter 失敗 ('No available adapters')。threeは http://127.0.0.1 の静的サーバから importmap で読む (harness.mjs が /three/ に $S/three/three-0.186.1/package を、/ に pages/ を公開)。ページは window.__result を設定し window.__done=true で終了。

§5.4 結果一覧 [R]: e1_transmission = 描画コール 不透明5:5 / +physical(trans0):6 / +transmission1 Front:11 / Double:12 / +transparent+DoubleSide(transなし):7 / 不透明0+transmission:1 / overrideMaterial:6。e2_gating_pmrem = 効果0のとき USE_THICKNESSMAP, USE_TRANSMISSIONMAP, USE_TRANSMISSION, USE_IRIDESCENCEMAP, USE_IRIDESCENCE_THICKNESSMAP, USE_IRIDESCENCE, USE_CLEARCOATMAP, USE_CLEARCOAT_ROUGHNESSMAP, USE_CLEARCOAT, USE_SHEEN_COLORMAP, USE_SHEEN, USE_ANISOTROPYMAP, USE_ANISOTROPY は全てfalse、USE_SPECULAR_COLORMAP/USE_SPECULAR_INTENSITYMAP のみtrue。効果ON後は全てtrue。version 0→5 (5遷移)、正の範囲内の値変更は 5→5。PMREM.fromScene(RoomEnvironment,0.04) → 768x1024, HalfFloat, mapping 306, srgb-linear。e2b_samplers = bare+env: 2 [envMap,dfgLUT]; base PBR: 8 [map,aoMap,emissiveMap,envMap,dfgLUT,normalMap,roughnessMap,metalnessMap]; 全部入り(iridescence+sheen+clearcoat 全マップ): 15; transmission+maps+影付き平行光: 11 [map,aoMap,envMap,dfgLUT,transmissionMap,thicknessMap,transmissionSamplerMap,directionalShadowMap[0],normalMap,roughnessMap,metalnessMap]。

§5.4 結果一覧(続) [R]: e3_onbeforecompile_alpha = 同一toStringの2枚: 左右とも赤 [255,0,0] (期待は赤/青)、プログラム1本。customProgramCacheKey付与で 左[255,0,0] 右[0,0,255]。opaque_fragment直前でdiffuseColor変更(late anchor)は黒[0,0,0]のまま。alphaHash α0.5: 残存48.2%、USE_ALPHAHASH=true、varying vPosition=true、OPAQUE=true。alphaTest0.5/α0.5: 全残存、0.6: 0%、0.4: 全残存。alphaToCoverage: MSAA4ターゲット平均128、MSAAなし255、a2cなしMSAA4は255。SkinnedMesh+skinning_vertex後パッチ: boneTexture生成・USE_SKINNING・texelFetch(boneTexture)・パッチ文字列あり・#version 300 es。e4_webgpu_fallback = auto/forceWebGL とも WebGLBackend(WebGL2)、警告 'No available adapters' と 'WebGPURenderer: WebGPU is not available, running under WebGL2 backend.'、onBeforeCompile_called=false、MeshPhysicalMaterial→MeshPhysicalNodeMaterial、スキン直立420px・曲げ393px。e4b_webgpu_counts = WebGL2バックエンドで draw/copyTex/genMip: 透過なし6/0/0、Front 6/1/1、Double 7/2/2。虹彩OFF(41,41,41)→ON(40.7,43.5,42.8) (同じ0x888888)。

§5.4 結果一覧(続2) [R]: e5_env_colorspace = 既定 outputColorSpace=srgb, toneMapping=0, exposure=1, ColorManagement.enabled=true, working=srgb-linear, 新規Texture.colorSpace=''。envのmapping未設定→中心画素[0,0,0,255]、設定→[255,255,255,255] (256x128 HalfFloat equirect)。map=128: NoColorSpace→188、SRGB→128。Color(0x808080).r=0.2159。PMREM(1024x512)→768x1024 HalfFloat mapping306、18ms(CPU)。圧縮拡張 ASTC/ETC/S3TC/S3TC_srgb/BPTC/anisotropic すべてtrue (SwiftShader)、maxAnisotropy=16。e6_doublesided_version = 10フレームのversion増分: 不透明DoubleSide 0 (programs 1)、transparent+Double 20 (programs 2)、+forceSinglePass 0 (1)、alphaHash+Double 0 (1)。reflectivity既定0.5。e7_shadow_patch = 既定: 頂点シェーダ3本中パッチ入りは主マテリアルのみ (depth側0)。customDepthMaterial にパッチ→depthシェーダにもパッチ有り。e8_skin_parity_webgl = WebGLRendererで直立420px・曲げ393px (e4と一致)。

§5.5 実験ページ・ハーネスの所在: 全文は $S/threeaudit/{harness.mjs, dump_defaults.mjs, chunk_map.mjs, run_all.sh, pages/e1_transmission.html, e2_gating_pmrem.html, e2b_samplers.html, e3_onbeforecompile_alpha.html, e4_webgpu_fallback.html, e4b_webgpu_counts.html, e5_env_colorspace.html, e6_doublesided_version.html, e7_shadow_patch.html, e8_skin_parity_webgl.html} と対応する *.out。.mdへ埋め込む場合はこれらを付録として貼る。実験の設計メモ: 初版e3の『late anchor』テストはMeshBasicの出力順を誤解して失敗したためアンカーを color_fragment に直して再実行 (本結果は修正後)。e2/e4の初版にあった不正な測定(サンプラー数の誤ったプログラム参照、虹彩比較の下地色不一致)は削除し e2b / e4b に置換済み。
