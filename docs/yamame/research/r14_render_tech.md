# r14 リアルタイム魚類レンダリング技法（皮膚／鱗／粘液／眼／鰭／水中）— Three.js(WebGL) 向け

> **調査制約・方法（必読）**
> 1. **【改訂履歴】初版（検索なし）→ 本改訂（WebSearch 30 回、すべて mode: standard、拒否 0 回）。** 初版は WebSearch が予算切れ（200/200）で 3 回とも拒否されたため、実ソース確認（Part A）・写真再集計（Part B）・計算（Part C）・記憶メモ（Part D）だけで書かれていた。本改訂では割当 30 回を使い切り、Part E（F-27〜F-42）として検索で得た情報を追加し、Part D の記憶メモのうち裏取りできたものにだけ注記とランク更新を入れた。**検索結果は「タイトル・URL・モデルの要約」のみで論文全文は読めていない。** 要約が明示した記述だけを A/B/C に上げ、式・係数・数値表が要約に出なかったものは M のまま残した（例: Toksvig の式、純水の 550/600/650 nm の吸収係数、GPU Gems の実装詳細）。特に検索 #10 は、クエリに入れた数値（0.0565 等）を要約が「そのようだ」と言い換えて返しただけで、**数値の裏取りにはなっていない**ので採用していない。
> 2. 代わりに、指示で許可されている **npm 経由**で `three@0.186.1`（2026-10-01 時点の npm の `latest`）と `@gltf-transform/extensions@4.5.1` をスクラッチパッドに取得し、**実ソースコードを直接読んだ**。これは「Three.js r186 の実装が何をしているか」についての一次確認であり、本書では **[B(code)]** と表記する（A〜C の枠外なので、集計上は B に計上）。論文の主張が正しいことの証拠ではなく、「実装がこうなっている」という事実のみを保証する。
> 3. 写真由来の所見は `docs/yamame/photo_analysis/catalog_c01〜c07.json`（70 枚、ヤマメ判定 57 枚）をこの場で再集計したもの（ランク **P**）。語のカウントは日本語キーワードの機械的一致で粗い。他ストリーム（r06, r07）の記述を引く場合は「二次引用」と明記し、元のランクを継承した。
> 4. 数値計算（**M（計算）**）は、入力値が M または別ストリーム（C/M）由来であるため、結果も M。
> 5. ヤマメ自体のレンダリング実例は存在しない。光学定数（グアニン屈折率など）はすべて仮定パラメータ。
> 6. **ユーザー依頼文（ヤマメの骨格を口・顔・鰓の再現に使う）について**: 骨格の画像は、スクラッチパッド内の `scratchpad/skeleton/s01.jpg`（366×550 px、青染色の透明骨格標本、ラベル断片 "…ncorhynchus"）として存在することを、作業の終盤で確認した（最初はリポジトリとセッション添付の PDF ページ画像しか探しておらず、見落としていた。PDF ページ画像は「3D モデリング用 実写写真資料 70 枚」で骨格図ではない）。画像は頭を下にした斜め上からの短縮像で、頭部は濃い青の塊に見え、顎・鰓蓋の個々の骨は本書の担当範囲では判別できなかった。骨格の解析は別ストリーム `r15_cranial_osteology.md` が担当しており、その結論（個々の頭蓋骨の同定・接続は短縮・重なり・ボケのため不可）と同じ立場である。**骨格由来の寸法は本書に反映していない**。レンダリング側で骨格から必要になる要件は F-26 に書いた。
> 7. 証拠ランク: A=査読論文・学術書・公的機関資料で要約文中に明示／B=図鑑・自治体・博物館・信頼できる解説（本書では実ソースコードの直接確認を B(code) とする）／C=釣り・個人ブログ・販売ページ（自己申告のポリ数など）／M=自分の記憶（未検証）／P=ユーザー提供写真 70 枚からの観察・集計。
> 8. 検索で得た情報のうち、**ヤマメ（サケ科）以外の種・分野のデータには scope に PROXY を明記**した（例: PROXY:ニシン、PROXY:ウミウシの粘液、PROXY:海洋水、PROXY:ヒトの眼）。ゲーム用魚モデルの数値は販売ページの自己申告（C）で、種・用途・LOD が揃っていない。

---

## 1. 要約（仕様に直結する結論）

各行末の [F番号] は §2 の根拠 Finding。**[M] を含む行は検証されていない仮定**であり、数値仕様にそのまま採用しないこと。[B(code)] は「Three.js r186.1 のコードがそうなっている」ことのみを保証する。

1. **銀色を Three.js の `iridescence`（薄膜干渉）で作らない。** r186 の虹彩実装は Belcour–Barla 型の Fourier 空間評価（高調波は m=1,2 の 2 次まで）で、**単層の薄膜・スカラーの膜屈折率・膜の外側媒質は空気固定（IOR=1.0）・Fresnel は s/p 分離なしの Schlick** という制約を持つ。魚の銀色は（r06 F-33 によれば）広帯域・非偏光の多層反射体なので、単層の狭帯域干渉色とは性質が違う。銀色は「ほぼ無彩色の金属的鏡面（環境反射）＋弱い虹彩」で作る。**検索での裏取り**: Belcour–Barla は Fourier 領域の畳み込みとガウスフィルタで分光応答を事前積分する薄膜手法（A、要約記載）[F-27]。銀色の魚の虹色素胞は非周期（aperiodic）の光子構造で、グアニン（n=1.83）と細胞質（n=1.33）の大きな屈折率差により可視域を広帯域に反射する（A、PROXY は主にニシン等）[F-30]。一方サケ科（トラウト）の虹色素胞を「各層が反射したい波長の 1/4 の光学厚をもつ理想多層膜」として扱うモデル記述もある（A/B、検索要約）[F-31]。 [F-01][F-18][F-19][F-27][F-30][F-31]
2. **水中の薄膜色は r186 では正しく出ない。** `evalIridescence(1.0, …)` が呼ばれ、膜の外側は常に空気と仮定される。水中（n≈1.333）の見えを厳密にやるなら、シェーダ改造（`onBeforeCompile`）で外側 IOR を渡す必要がある。ただし本書では水中での虹色の寄与は小さいという写真所見（虹色の言及は r06 F-18 によれば 70 枚中 6 枚）に合わせ、**改造せず弱い虹彩を載せる程度**を既定案とする。 [F-01][F-19]
3. **デフォルトの膜厚範囲 [100, 400] nm は、グアニン板の 1/4 波長厚（n=1.83 と仮定すると 450–650 nm で約 61–89 nm）より厚い側にずれている。** 一次の反射を狙うなら `iridescenceThicknessRange` の下限を 60 nm 前後まで下げる余地がある。**グアニン n=1.83・細胞質 n=1.33 は検索で A に上がった**（PROXY を含む、F-30）が、ヤマメの板の厚み・層数は未確認。なお検索要約にある「ニシンの鱗のグアニン板の厚み約 130 nm」は、n=1.83 の 1/4 波長条件（可視域で 約 61–89 nm）と合わず、**要約の取り違えの可能性があるため採用しない**（矛盾 7）。 [F-02][F-17][F-30]
4. **空気中の濡れ光沢は `clearcoat`、水中では使わない（または弱める）。** 写真（ヤマメ判定 57 枚、skin 記述）で「水膜」の語は空気中の 39 枚中 12 枚、水中・水槽 18 枚中 0 枚。「マット／つや消し／サテン」は空気中 7/39、水中 9/18。水中では水と粘液・表皮の屈折率がほぼ同じで界面の鏡面反射がほぼ無い（r06 F-28, M）ので、水中の光沢は下の銀色層の反射が主。**検索での補強**: ウミウシの粘液（PROXY）の屈折率は 1.3371–1.3854 で海水（約 1.34）と同程度かやや高く、粘液層での反射は小さく可視域でほぼ透明（A、Zool. Stud. 2024）[F-32]。濡れた材質は水膜の鏡面反射と内部散乱の組合せで見え方が決まり、粗い／粉状の材質は濡れると暗くなる（Jensen ら 1999、A）[F-33]。魚体は多孔質でないので暗化は小さいという判断は M のまま。 [F-10][F-16][F-32][F-33]
5. **Three.js の clearcoat は F0=0.04（IOR 1.5 相当）固定。** 水膜（n=1.333）の F0 は 0.0204。非減衰の clearcoat=1 は、垂直入射で絶対誤差 +0.02、80° で +0.06（0.410 対 0.348）。**clearcoat=0.5 に絞ると垂直では合うが 80° で 0.205 と過小**になる。どちらも完全には合わないので、厳密にしたい場合は `clearcoatF0` を 0.02 にするシェーダ改造を許容する。 [F-03][F-16]
6. **鱗の法線マップは必ず「分散つきフィルタ」が要る。** Three.js の `geometryRoughness` は**法線マップ前の幾何法線 (`nonPerturbedNormal`) の導関数**から作られ、法線マップ由来の微細な法線分散は粗さに反映されない。通常の mipmap は法線の平均化で平坦化し、遠距離で鱗が消えて、ハイライトがちらつく。対策として Toksvig／LEAN 系の粗さ補正を、粗さマップの各 mip にオフラインで焼き込む案がある。**検索で確認できたこと**: Toksvig は「平均化した法線が短くなる程度」を法線のばらつきの尺度として鏡面指数（粗さ）を調整する（NVIDIA 技術資料、B）、LEAN は法線分布を 2D ガウス（平均＋2×2 共分散）として線形にフィルタ可能な形で持ち、MIP／異方性フィルタのハードウェアで使える（I3D 2010、A、前処理でもGPU上の生成でも可）、Kaplanyan らは NDF をスロープ領域でフィルタし法線マップ・デファード描画と併用できる（HPG 2016、A）[F-34]。式・係数は要約に出ていないので M のまま（F-21）。 [F-06][F-21][F-34]
7. **鱗ピッチは遠距離で必ずサブピクセルになる（M 計算）。** r06 の暫定ピッチ 0.55–0.9 %SL を使うと、SL 200 mm の個体（鱗ピッチ 1.1–1.8 mm）は、縦 FOV 50°・1080 px でカメラ距離 約 0.64–1.04 m 以上でピッチが 2 px 未満（ナイキスト以下）、約 1.27–2.08 m 以上で 1 px 未満になる。**数 m 以内の観察でも鱗の格子は折り返し（エイリアシング）の領域に入る**。 [F-14]
8. **鱗は幾何ではなく法線マップ＋粗さ＋AO で作り、ディスプレイスメントは使わない。** `displacementMap` は頂点を法線方向に動かす方式で、鱗ピッチ 1 mm 級に必要な頂点密度が現実的でない。r186 の WebGL 用マテリアルにはパララックス・オクルージョン・マッピング（POM）が無い（TSL 側に単純な UV オフセットの `parallaxUV` があるのみ）。写真側も「鱗の凹凸は極小」（p049、r06 経由の二次引用）。 [F-07][F-10]
9. **鱗テクスチャの密度（M 計算）**: 体長方向の鱗数は 111–182 枚（0.9–0.55 %SL）。1 枚あたり 4–8 texel とすると体長方向に約 440–1450 texel、すなわち **1k〜2k のテクスチャ幅**が必要（UV 展開で体側に集約する場合）。 [F-14]
10. **鰭は `transmission` ではなくアルファ合成の薄膜＋追加の透過光項で作る。** r186 の `transmission` は、透過物体が 1 つでも見えるとき**不透明物体を半精度・MSAA(≥4)・ミップ付きのレンダーターゲットにもう一度描画**し、スクリーン空間で屈折サンプリングする方式で、**透過物体同士は互いに見えない**。多数の魚の鰭や眼に使うと描画コストが 2 倍近くになり、鰭同士の重なりが破綻する。 [F-04]
11. **鰭の透過光（バックライト）は、アドオンの `SubsurfaceScatteringShader`（Barré-Brisebois & Bouchard, GDC 2011 型の近似）の考え方が使える。** ただしこれは MeshPhong ベースで PBR ではない。鰭では、`scatteringHalf = normalize(L + N*distortion)` と `pow(saturate(dot(V, -H)), power)` による視線依存の透過項を、PBR シェーダに `onBeforeCompile` で足すのが現実的（M の設計案）。この近似の出典（GDC 2011、Frostbite 2／Battlefield 3 での採用）は検索で存在を確認（B）。**鰭の構造**は、2 層の表皮が真皮を挟み、真皮は骨性の鰭条で補強された三層構造と記述される（SICB 要約、A）ので、「薄い半透明膜＋鰭条に沿った厚み・吸収の濃淡」というモデル化と整合する。鰭膜の厚み（µm）は 2 回の検索でも得られず Gap。 [F-08][F-23][F-35][F-37]
12. **水中の減衰は `FogExp2` では物理的に違う。** r186 の指数フォグは `1 - exp(-(密度×深度)^2)`（距離の**二乗**）で、フォグ色も 1 色・密度もスカラー。Beer–Lambert（exp(-c·r)）かつ波長（RGB）別の減衰にするには、`fog_fragment` を差し替える必要がある。一方 `KHR_materials_volume` 相当の `attenuationColor/attenuationDistance` は物体内部の厚み方向の RGB 別 Beer 則であり、**カメラと魚の間の水の減衰は表現できない**。 [F-05][F-04][F-15]
13. **純水の吸収は赤で急増する（M）**: r06 F-30 の値（650 nm で a≈0.34 m⁻¹、550 nm で 0.064、465 nm で ≈0.010 は M）から、RGB 別の `attenuationColor`（attenuationDistance=1 m で R/G/B≈0.71/0.94/0.99）が得られる。**渓流の実効減衰（CDOM・懸濁粒子）はこれより大きく、青緑側に偏る**ので、純水値は下限。観察距離 0.3–2 m の魚では赤の損失は小さく、見た目の水の色は主に散乱光（背景水色）の混合になる（M）。**検索で確認できたのは次の 3 点のみ**: (a) Pope & Fry (1997, Appl. Opt. 36, 8710–8723) の純水吸収は 418 nm で最小 0.0044±0.0006 m⁻¹（A、要約記載）、(b) 赤が青緑より速く減衰する／直接透過成分は波長別係数で指数減衰する（Beer–Lambert）という一般記述（B、複数の要約）、(c) 実時間の水中分光レンダリングは海洋学の拡散下向き減衰係数 Kd のデータベースから放射伝達方程式の解析近似を作る（Monzon ら 2024、A、PROXY:海洋水）[F-38]。550/600/650 nm の個別値は 2 回の検索でも確認できず M のまま。 [F-15][F-25][F-38]
14. **コースティクスと神の光は Three.js コアに既製品が無い。** r186.1 の `src`・`examples/jsm` に "caustic" を含むファイルは無く、ゴッドレイは TSL/WebGPU 用の `GodraysNode`（シャドウマップを使うスクリーン空間レイマーチ）のみ。WebGL 用は自作が必要。コースティクスは `SpotLight.map`（投影テクスチャ）への動くパターン投影という案があるが、方向光ではなくスポットライトが必要（`SpotLight.map` の存在はコード確認、手法の妥当性は M）。**検索で見つかった WebGL／Three.js 側の先行例**（いずれも C、品質・ライセンス未確認）: 太陽方向に投影するコースティクス模様で変調した深度バッファ復元のレイマーチ神の光（gitee の WaterThreeJS）、Evan Wallace の WebGL コースティクスの記事、Maxime Heckel の R3F コースティクス記事、Three.js WebGPU/TSL の水中デモ（forum）。原典側では GPU Gems 1 第 2 章（Guardado & Sánchez-Crespo）が「見た目重視の実時間手法」、GPU Gems 3 第 13 章（Mitchell）が「前景を黒にマスクしたフレームバッファへの放射状ブラー」（B）。 [F-08][F-25][F-39]
15. **眼は幾何で作り、パララックスは実形状から得る。** 魚の水晶体はほぼ球形で角膜は水中で光学的にほぼ無効（r07 F-10, C）、虹彩は金色の細い環で外周に暗い眼窩縁（金 46/57、暗輪・眼窩影 34/57, P）。したがって、**透明な薄い角膜の球冠の背後に、虹彩・瞳孔の円盤メッシュを数 %眼径だけ奥に置く**構成にすれば、虹彩パララックスは実形状から自然に出る（M の設計案）。角膜は鏡面（環境反射）専用の薄い層にし、`transmission` は使わない。眼のハイライト（映り込み）の記述は空気中 18/39、水中 1/18 で、空気中の撮影ほど目立つ。検索で、実時間の眼シェーダには「虹彩深度（iris depth）」と瞳孔位置のパラメータをもつ虹彩パララックスマッピングを既定とする例（CryEngine 文書、B、PROXY:ヒト）、「放射状のグラデーションで高さを与える単純なバンプオフセット（レンズ要素なし）でもパララックスが出る」という制作者フォーラムの記述（C）があり、**幾何で奥行きを作る案とシェーダのオフセットで作る案の両方に先行例がある**。魚眼での角膜・虹彩の実測値や魚眼専用シェーダは見つからなかった [F-36]。 [F-11][F-24][F-04][F-36]
16. **瞳孔は円形の固定が基本**（円形 39、楕円 7/57 は斜め視点、P）。真骨魚の瞳孔は固定が大半という総説（r07 F-30, B）と整合。瞳孔径の動的変化は実装しなくてよい。 [F-11]
17. **口・鰓の内部は「見える場面が限られる」ので、常時レンダリングしない。** 口の状態（ヤマメ判定 57 枚）は閉 34、開 14、ルアーで掛かっている 8、不明 1。鰓腔の赤は握りで鰓蓋が開いた 1 枚（p061）にのみ明記があり、開口中の口内は暗く舌は桃色（p012）または灰紫（p047）。口・鰓蓋の開閉で内部が露出する瞬間だけ、暗い口内材質／赤い鰓弁材質を見せる（P の所見に基づく設計）。 [F-12][F-26]
18. **ゲーム用魚モデルの事例は販売ページの自己申告（C）でのみ確認できた。** トラウト（リグ付き）3,892 三角形・全長 約 43.8 cm、タイ科（Gilthead sea bream）2,654 三角形＋4K/2K/1K の PBR（BaseColor/Normal/Roughness/Metallic/AO）、オオクチバス 926 三角形、魚群用パック LOD0 平均 約 1000 三角形から LOD 最下位 50 三角形未満（全種で同一スケルトン）、釣りゲーム向け 4 LOD（4,096／896／188／107 頂点）。**ボーン数は 1 件も確認できなかった（Gap）**。ヤマメ「遊泳の近接観察用」の LOD0 は 数千〜1 万三角形台が目安になりうるが、これは上記の C 値からの観察で、仕様値ではない。Three.js 側の技術制約は次のとおり確認済み: 頂点あたりのボーン影響は 4、ボーン行列は 1 ボーン＝4 texel のテクスチャ、`LOD.addLevel(object, distance, hysteresis)`、モーフターゲットは `DataArrayTexture` に格納される。多数の魚を出す場合は、ボーンをCPUで動かさず、頂点シェーダ内の波状変形（左右の揺れ・旋回・進行波・ねじり）＋インスタンス描画で数千匹を出す手法が公式文書（Godot）にある（B）が、近接観察する主役のヤマメには使えず、群れ用 LOD の候補にとどまる [F-41]。 [F-09][F-40][F-41]
19. **Three.js 側のバージョン固定の注意**: 本書のコード確認は r186.1。`iridescenceThicknessRange` や `clearcoatF0` の扱い、`transmission` のレンダーターゲット（half float・MSAA）の挙動は版で変わりうる。実装時は同じバージョンで再確認する（§4 Gap-12）。 [F-01][F-03][F-04]
20. **多層膜（グアニン／細胞質）の本格近似には周辺文献がある（本文未読）。** 周期多層膜の干渉を Huxley の方法で効率よく正確に計算する手法（SIGGRAPH Asia 2023 ポスター）、複数層の薄膜干渉を GPU で実時間に解く学位論文（Utrecht）、ヘビの皮膚を「薄膜層＋吸収媒質に囲まれた拡散下地」の 2 層で扱う研究（Zaragoza 2023）、自然物の干渉色の古典（Hiroshima, Pacific Graphics 2000）が検索で見つかった。魚の銀色の専用レンダリング論文は見つからなかった。Three.js の単層虹彩では足りない場合の調査起点になるが、**精度・コスト・実装難度は未確認**。 [F-28][F-30]

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
- 【検索による更新】入力のグアニン n=1.83 と細胞質 n≈1.33 は検索で A（PROXY を含む、F-30）。n=1.33 の細胞質では 1/4 波長厚が 84.6／103.4／122.2 nm（λ=450／550／650 nm、本書の再計算）。グアニン板の厚みの文献値（要約の「ニシンの鱗で約 130 nm」）に n=1.83 を使うと 1/4 波長条件の波長は 4×1.83×130 ≈ 952 nm で可視域外になり、上の 61–89 nm と合わない。要約の取り違え（別の量、別の組織）の可能性があるため**採用しない**（矛盾 7）。

---

### Part D — 技法の記憶メモ（ランク M：すべて未検証。検索ができなかったため、論文名・著者・年は検証用リードである）

### F-18 薄膜干渉の実時間近似（Belcour & Barla 2017）
- 主張/値（記憶）: Belcour & Barla, "A Practical Extension to Microfacet Theory for the Modeling of Varying Iridescence", ACM Transactions on Graphics 36(4)（SIGGRAPH 2017）。薄膜の反射を分光領域で積分する代わりに、光路差の周波数（Fourier）空間で評価し、CIE の XYZ 感度曲線をガウス関数で近似して閉形式にする。微小面理論に組み込む際は Fresnel 項を薄膜の Fresnel に置き換え、膜厚を変えられる。Three.js の実装（F-01）はこの手法に沿っている（コメント URL と Fourier 空間・ガウス近似は [B(code)] で確認）。論文本文が主張する精度・コスト・高調波の次数に関する記述は、検索できていないので未確認。
- 適用範囲: 論文が扱うのは単層薄膜。多層膜（グアニン／細胞質の積層）の実時間近似は別の文献が要る（未調査）。
- 出典: なし（記憶）。検証用リード: Belcour & Barla (2017) 上記。
- 証拠: [M]（論文内容）。実装との対応のみ [B(code)]。
- 【検索による更新】論文の存在・著者・年・方式の骨子（Fourier 領域の畳み込み＋ガウスフィルタによる分光応答の事前積分）は検索で A に上がった（F-27）。「高調波 2 次」「XYZ 感度のガウス近似の係数」「精度・コスト」は要約に出ず M のまま（コード側の 2 次は F-01 で確認）。

### F-19 魚の銀色を「広帯域鏡面＋弱い虹彩」で作る設計案
- 主張/値: 魚の銀色は高屈折率のグアニン板と低屈折率の細胞質を交互に積んだ多層反射体で、ニシン・イワシ類では光学軸の向きが異なる 2 集団の結晶で偏光を打ち消し、層間隔の分布で広帯域化する（r06 F-33, A, PROXY:ニシン・イワシ等の二次引用）。サケ科での層構造は未確認。一方 Three.js の虹彩は単層・スカラー IOR（F-01）。→ 設計案（M）: 銀色成分は `metalness` を高めに、F0 をほぼ無彩色（わずかに青緑寄り）にし、環境反射で見せる。虹彩は `iridescence` を弱く（鰓蓋・腹側・体側境界の局所にマスクをかけ）載せ、色相の角度依存を足す。写真で虹色（青紫〜桃）の言及は 70 枚中 6 枚（r06 F-18, P の二次引用）。
- 適用範囲: ヤマメの銀化度（パー〜スモルト、r06 F-01/F-02）による差は別パラメータ。
- 出典: なし（記憶、設計案）。二次引用: r06_skin_scale_optics.md F-33（A, PROXY）、F-18（P）。
- 証拠: [M]（設計案）。
- 【検索による更新】ニシン・イワシ類以外でも、銀色の魚の虹色素胞が「非周期の光子構造で広帯域反射」（A, PROXY）、グアニン n=1.83／細胞質 n=1.33（A）、サケ科でも虹色素胞内に反射板があり皮膚の反射率が銀化（パー→スモルト）で上がり皮膚グアニン濃度と相関する（USGS, A）ことを確認した（F-30, F-31）。**ヤマメ固有の板の厚み・層数・傾きは依然として未確認**。設計案（広帯域鏡面＋弱い虹彩）の方向性と矛盾する証拠は見つからなかった。

### F-20 濡れた／粘液表面のモデル化
- 主張/値（記憶）: 濡れた不透明表面の見えは、(a) 表面の粗さ低下（水が微細凹凸を埋める）、(b) 水膜／粘液の薄い誘電体層による鏡面（F0≈0.02）、(c) 多孔質材質では拡散色の暗化（Jensen らの濡れ材質の研究）、の組合せで近似される。魚体は多孔質でないので、(c) の暗化は小さい（M）。粘液層の厚みは、PROXY の孫引きで「500–600 Å と 1–2 µm」（r06 F-37, C。何を測った値か不明）。厚み約 1 µm 以上の膜では白色光の干渉縞は平均化されて目立たない（M）。→ 設計案: 乾燥時の `roughness` を高め、濡れ状態でクリアコートを足す（`clearcoat`＝1、`clearcoatRoughness` を小さく）、水滴・水膜の波紋は `clearcoatNormalMap` に入れる。初期値は調整用の仮置きであり、実測値ではない。
- 適用範囲: 空気中の魚体。水中では F-16 のとおり界面反射が消えるので無効。
- 出典: なし（記憶）。検証用リード: Jensen, Legakis & Dorsey (1999) "Rendering of Wet Materials"（Eurographics Rendering Workshop）。
- 証拠: [M]。厚み値は [C]（r06 F-37 の孫引き）。
- 【検索による更新】(a) Jensen, Legakis & Dorsey (1999) の存在と要旨（濡れた材質は種類と視条件で暗く・明るく・鏡面的に見え、液体が表面と内部にあることが原因、表面の水の反射モデルと内部散乱を組み合わせる、粗い／粉状の材質は濡れると暗くなる）を A で確認（F-33）。(b) 粘液の屈折率は、ウミウシ（PROXY）で 1.3371–1.3854、海水（約 1.34）と同程度かやや高い、可視域でほぼ透明（A, F-32）。魚の粘液の屈折率・厚みは見つからず Gap のまま。(c) **乾燥／湿潤のラフネス差の数値は見つからなかった**（ゲーム向け記事は「拡散を暗く、鏡面を強く」という定性的な記述のみ、B）。

### F-20b（参考）湿潤時の「粘液は水に近い屈折率」からの含意（M の推論）
- 主張/値: 粘液の n が水に近い（上記 (b)）なら、水中での粘液層と周囲の水の界面の鏡面反射はほぼ無く、空気中でも粘液膜の F0 は 水膜と同程度（約 0.02）か僅かに上（n=1.385 で ((1.385−1)/(2.385))²=0.0261）。Three.js の clearcoat F0=0.04 は過大側である点（F-16）は変わらない。
- 適用範囲: 平らな膜を仮定。PROXY:ウミウシ粘液の n を魚に転用した推論。
- 出典: 本書の計算（入力: F-32）。
- 証拠: [M（計算）]。

### F-21 法線マップのミップによる光沢の消失への対策（Toksvig、LEAN、分布フィルタ）
- 主張/値（記憶）:
  - **Toksvig (2004, "Mipmapping Normal Maps", Journal of Graphics Tools)**: ミップで平均した（正規化前の）法線の長さ |Na| から、鏡面指数 s を s' = ft·s、ft = |Na| / (|Na| + s(1−|Na|)) に下げる。計算例（本書）: s=64 で |Na|=1.0／0.99／0.95／0.90／0.80 に対し s'=64.0／38.9／14.7／7.9／3.8。
  - **LEAN mapping (Olano & Baker 2010, I3D)**: 法線の平均勾配 B と二次モーメント M をテクセルごとに持ち、線形フィルタ可能にして、共分散から粗さ（異方性を含む）を復元する。
  - **Kaplanyan et al. (2016, HPG)** の法線分布のフィルタリング、**Tokuyoshi & Kaplanyan (2019)** の幾何的鏡面アンチエイリアスは、Three.js の `geometryRoughness`（F-06）に近い系統。
  - r186 では法線マップ由来の分散を扱う組込みが無い（F-06）ので、実装案は (1) オフラインで各ミップ階層の粗さを Toksvig／LEAN 的に補正した粗さマップを作る、(2) シェーダ内で法線マップの分散を別マップ（分散マップ）で持つ、の 2 通り。
- 適用範囲: GGX／Beckmann を使う鏡面。公式の詳細・係数は未確認。
- 出典: なし（記憶）。検証用リード: 上記の著者・年・誌名。
- 証拠: [M]。計算例のみ [M（計算）]。
- 【検索による更新】Toksvig（NVIDIA 技術資料）、LEAN（I3D 2010）、Kaplanyan ら（HPG 2016）は存在と方式の骨子を確認した（F-34）。**Toksvig の式 ft=|Na|/(|Na|+s(1−|Na|)) は要約に出ていないので M のまま**（計算例も M（計算））。「Tokuyoshi & Kaplanyan (2019)」は検索していないので M のまま。LEAN の発表年 2010、I3D、Civilization V での採用は A に上がった。

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
- 【検索による更新】Barré-Brisebois & Bouchard (GDC 2011) の存在と Frostbite 2／Battlefield 3 での採用は B で確認（F-37）。パラメータの意味・既定値は要約に出ず、F-08 のコード確認が唯一の根拠。Jimenez らの皮膚透過は今回検索していないので M のまま。鰭の厚みは Gap。

### F-24 眼のレンダリング（角膜、虹彩、瞳孔、スペキュラ）の設計案
- 主張/値（記憶＋設計案）: 人間のキャラクター向けの眼シェーダ（角膜の屈折による虹彩のパララックス、強膜の SSS、ウェットな縁など）の知識は多いが、魚眼には当てはまらない部分がある。魚眼は水晶体がほぼ球形で、角膜は水中でほぼ屈折力を持たない（r07 F-10, C）。→ 設計案: (1) 眼窩に球形の眼球メッシュ、(2) 虹彩（金色の環、F-11）と瞳孔（黒の円盤、F-11）を円盤状メッシュにして、角膜の球冠の奥に数 %眼径だけ離して置く（視差は実形状で得る）、(3) 角膜は透明で、環境反射（`specularIntensity`、小さな粗さ）と湿り気のハイライトのみを担当し、`transmission` は使わない（F-04 のコストと、透過物体同士が映らない制約のため）、(4) 虹彩の金色は異方的な反射層（グアニン）を持つ可能性があるが未検証。(5) 空気中の写真では映り込みが目立つ（F-11）ので、空気中・水中でハイライト強度を変える。
- 適用範囲: 設計案。空気中の魚眼で角膜の屈折がどう見えるか（空気／角膜界面の屈折、M）は未確認。
- 出典: なし（記憶、設計案）。二次引用: r07 F-10（C）、F-30（B）。
- 証拠: [M]。
- 【検索による更新】虹彩パララックスの実装慣行は F-36 に記載（PROXY:ヒト、B/C）。魚眼の角膜・虹彩の光学（空気中での角膜屈折の見え）の資料は見つからず Gap のまま。

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
- 【検索による更新】GPU Gems 1 第 2 章・GPU Gems 3 第 13 章の存在と概要、Pope & Fry (1997) の存在と 418 nm の最小値、水中の実時間分光レンダリング（Monzon ら 2024）、WebGL／Three.js の先行例を確認した（F-38, F-39）。**Evan Wallace の WebGL Water（2011）の「屈折格子の面積比」方式の記述は、記事の存在のみ確認**（本文未読）。スネルの窓は今回検索しておらず M のまま。

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

### Part E — 検索（WebSearch 30 回）で得た情報

注意: 以下はすべて「検索結果の要約」から取った。**論文本文は読んでいない**ので、式・係数・数値表は要約に明示されたものだけを書いた。要約が出典を特定しなかった記述は、その旨を付記した。

### F-27 Belcour & Barla (2017) の存在と方式の骨子
- 主張/値: Laurent Belcour（Unity Technologies）と Pascal Barla（INRIA）が SIGGRAPH 2017 で発表したホワイトペーパー "A Practical Extension to Microfacet Theory for the Modeling of Varying Iridescence"（掲載誌 ACM TOG 36(4) は記憶 M）。要約の記述: (a) 任意の粗さの下地層の上にある、膜厚が変化する薄膜による虹彩を微小面理論に拡張する、(b) 干渉効果を **Fourier 領域の畳み込みとガウスフィルタで事前積分**する、(c) 分光積分を解析的に事前積分することで **RGB（三刺激）レンダラと分光レンダラの間で一貫した見えを出す最初の材質モデル**と主張、(d) 誘電体・導体上の反射と誘電体を通る透過に使える、(e) マルチスケール描画に適応でき、アーティスト向けパラメータがあり、オーバヘッドは制作で許容できる範囲。
- 適用範囲: 薄膜が単層か多層かは要約に記載なし（Three.js の実装は単層、F-01）。性能の数値（ms）、誤差の数値は出なかった。ヤマメ（魚）の記述なし。
- 出典: Unity ブログ https://blog.unity.com/es/technology/a-practical-extension-to-microfacet-theory-for-the-modeling-of-varying-iridescence 、SIGGRAPH History Archive https://history.siggraph.org/?p=102374 。関連: OpenPBR の論文 https://arxiv.org/pdf/2512.23696 が検索 #1 と #2 の両方に出たが、要約から内容は確認できなかった。
- 証拠: [A] 要約: "pre-integrates interference effects using Fourier-domain convolutions and Gaussian filtering".

### F-28 多層膜・自然物の干渉色に関するレンダリング文献（調査起点）
- 主張/値（要約）:
  - SIGGRAPH Asia 2023 ポスター "Efficient and Accurate Physically Based Rendering of Periodic Multilayer Structures with Iridescence"：周期多層膜の干渉を **Huxley の方法**で効率よく正確に計算する。同じ検索結果に Computer Graphics Forum 43(2) の PDF（`cgf15017`）が出たが、タイトルが要約に無く、同一論文かは未確認。
  - 要約の一般記述: 複数の薄膜の古典的な転送行列法は繰り返し数とともに複雑になる。より効率的な閉形式の反射率式と、RGB 向けに効率的な分光積分を可能にする近似がグラフィクスに導入されている。
  - Utrecht 大学の学位論文 "Rendering Iridescent Objects in Real-time"：多層薄膜干渉による鏡面反射と鏡面透過を GPU シェーダ（OpenGL の PBR レンダラ）で実時間化。膜厚が物体表面で空間的に変化する場合も扱う。
  - Zaragoza 大学のヘビ皮膚の外観モデル（2023）：爬虫類の鱗は虹色素胞（板状）や黒色素胞など複数の色素細胞の層でできており、皮膚を「虹色の模様を作る薄膜層」と「吸収媒質に囲まれた暗化用の拡散下地」の 2 層で表す。Chalmers の学位論文 "Real-time physically based snake scale rendering" もある。
  - 広島大（Kin ら, Pacific Graphics 2000）"Rendering Iridescent Colors Appearing on Natural Objects"：自然物を覆う多層膜内の干渉を考慮した虹色の描画。NSF PAR に鳥の羽の虹色のナノ構造モデリング論文もある。
- 適用範囲: PROXY:ヘビ・鳥・一般物体。**魚（特に銀色の魚）の専用レンダリング論文は、検索 #14・#15 で見つからなかった。**
- 出典: https://asia.siggraph.org/2023/index.html%3Fpost_type=page&p=14494&id=pos_199&sess=sess200.html 、https://diglib7.eg.org/bitstream/handle/10.1111/cgf15017/v43i2_04_15017.pdf 、https://studenttheses.uu.nl/handle/20.500.12932/15359 、https://graphics.unizar.es/projects/SnakeSkinAppearance_2023/ 、https://odr.chalmers.se/items/3b995d7f-0d31-4d0b-90c5-0ad4f3736d90/full 、https://home.hiroshima-u.ac.jp/~kin/publications/PG00/iridescent_colors.pdf 、https://par.nsf.gov/biblio/10592960-appearance-modeling-iridescent-feathers-diverse-nanostructures
- 証拠: [A]（ポスター・論文の存在）／[C]（学位論文の内容は要約のみ）。性能・精度は未確認。

### F-29 薄膜仕様のパラメータ記述（Three.js／glTF との単位・範囲の違い）
- 主張/値: 検索 #2 の要約に、薄膜厚を **µm 単位**で指定し「[0,1] の（ソフト）範囲」が干渉効果を観察する典型的な厚みに対応し「一般的な値は 0.02 から 2.0 超」、薄膜 IOR の範囲を [1..2.5] とする仕様記述が出た（出典サイトは OpenPBR 系の文書または Blender 向けアドオンの文書とみられるが、**要約は出典を特定していない**）。Three.js のドキュメントの複製ページには `iridescenceIOR` を「虹彩の RGB 色ずれの強さを屈折率で表した値」とし、範囲を 1.0〜2.333 とする記述がある。glTF 拡張の既定は 1.3 と 100–400 nm（F-02、コード確認）。要約の一般記述として、虹彩は下地の上に置かれた**単層の薄い誘電体膜**としてモデル化され、膜の上下面の反射と内部反射の干渉で生じ、厚みと IOR が色縞の強さ・間隔・色相を決める。
- 適用範囲: 単層モデル。多層・膜上の水膜の扱いは記述なし。Three.js ドキュメントは古い版の複製の可能性がある。
- 出典: https://gltf-transform.dev/modules/extensions/classes/KHRMaterialsIridescence 、https://neofixer.arizona.edu/css/CSSOrbit/asteroidJS/three/docs/api/en/materials/MeshPhysicalMaterial.html 、https://arxiv.org/pdf/2512.23696
- 証拠: [B] "thin_film_thickness ... in micrometers"（要約）。

### F-30 グアニン多層反射体の屈折率・構造（銀色の魚）
- 主張/値（要約）: (1) 無水グアニンの屈折率は反射方向で **n=1.83**、低屈折率の細胞質は水で決まり **n=1.33**。(2) 無水グアニン結晶と細胞質が交互に積まれた多層で、建設的・破壊的干渉により鏡のような光沢を生む。(3) 板状結晶は面内の極めて高い屈折率を光に向ける。(4) **銀色の魚の虹色素胞は非周期（aperiodic）の光子構造をもち、グアニンと細胞質の屈折率差が大きいので可視光を広帯域に反射する。** (5) ニシンの鱗のグアニン板の厚みは約 130 nm、浮き袋の板の幾何学的厚みは約 19 nm と要約にあるが、**n=1.83 で 130 nm の板は可視域の 1/4 波長条件に合わず（F-17）、取り違えの可能性があるため採用しない**。
- 適用範囲: 主にニシン等（PROXY:ニシン、他に Weizmann 研の総説・実験論文、ネオンテトラの Bragg 反射の arXiv 論文が結果に出た）。サケ科での板の厚み・層数は要約に無い。**要約はどの数値がどの論文かを特定していない。**
- 出典: https://www.weizmann.ac.il/molgen/gur/sites/molgen.gur/files/2024-10/Eyal%20et%20al%202022.pdf 、https://weizmann.ac.il/molgen/gur/sites/molgen.gur/files/2024-10/Gur%20et%20al%202012.pdf 、https://www.weizmann.ac.il/molgen/gur/sites/molgen.gur/files/2024-10/Gur%20et%20al%202014.pdf 、https://pmc.ncbi.nlm.nih.gov/articles/PMC4345507 、https://arxiv.org/html/2406.07819v1 、https://mail.mjcrescimanno.people.ysu.edu/recentpapers/laserFish1.pdf
- 証拠: [A] "anhydrous guanine ... refractive index of 1.83"、"aperiodic photonic structures ... broadband reflection"（要約）。PROXY。

### F-31 サケ科の虹色素胞と皮膚反射率（銀化）
- 主張/値（要約）: (1) サケ科の皮膚の虹色素胞は、グアニンまたはヒポキサンチンの複屈折結晶の反射板をもつ。トラウトには反射板を細胞質にもつ虹色素胞が **2 型**見つかった（要約が https://link.springer.com/doi/10.1007/BF00222271 のものか特定していない）。(2) 銀色の魚の反射は主にグアニン結晶板の積層による。積層は「反射したい波長の 1/4 の光学厚を各層にもつ理想多層反射体」としてモデル化される。(3) 板の傾き角と厚みの違いが虹色の光沢を作る。薄い板が小さな角度で並ぶと青紫、厚い板と薄い板が多数あり角度が大きいと青・緑・銀金色になる（**種と出典は要約に無い**）。(4) 米国地質調査所（USGS）の論文: 皮膚反射率はパー・スモルト変態（銀化）の間に増加し、鰓の ATPase 活性および**皮膚のグアニン濃度と有意に相関**した（若いサケ科魚の非致死的な銀化指標）。
- 適用範囲: サケ科（種は要約に明示なし。USGS の対象はサケ科の幼魚）。ヤマメ固有の数値なし。数値（反射率の値、板厚）は出なかった。
- 出典: https://link.springer.com/doi/10.1007/BF00222271 、https://pubs.usgs.gov/publication/70180320 、https://pmc.ncbi.nlm.nih.gov/articles/PMC4345507
- 証拠: [A] "Skin reflectance increased during the parr-smolt transformation ... correlated with ... skin guanine concentration"（要約）。(3) は出典不特定のため [C]。

### F-32 粘液の屈折率（PROXY:ウミウシ）
- 主張/値: ウミウシの粘液の屈折率は **1.3371〜1.3854**、海水（約 1.34）と同程度かやや大きく、粘液層での光の反射は一般に小さい。可視域の吸収スペクトルから粘液層はほぼ透明で、体色を妨げにくいと考えられる。魚類（硬骨魚）の皮膚粘液は、免疫・浸透圧調節・摩擦低減の記述はあったが、**屈折率・厚みの光学データは見つからなかった**。
- 適用範囲: PROXY:ウミウシ（海産の軟体動物）。魚への転用は M の推論。
- 出典: Zoological Studies 63 (2024) https://zoolstud.sinica.edu.tw/Journals/63/63-02.pdf 、https://zoolstud.sinica.edu.tw/news/2024_63-02.html
- 証拠: [A] "Refractive indices of mucus ranged from 1.3371 to 1.3854"（要約）。PROXY。

### F-33 濡れた材質のレンダリング
- 主張/値: (1) Jensen, Legakis & Dorsey, "Rendering of Wet Materials", Rendering Techniques '99, pp. 273–282（1999）。濡れた材質は種類と視条件で**暗く、明るく、または鏡面的に**見え、原因は表面と内部の液体。表面の水の反射モデルと内部散乱を組み合わせる。砂・アスファルト・粘土のような粗い／粉状の材質は濡れると暗くなる。(2) ゲーム向け解説（fxguide）: 従来のゲームの照明モデルでは「拡散項を暗く、鏡面項を強く」。PBR では二重層・多孔性・内部相互作用が絡み、BRDF パラメータを乾燥時から調整する。(3) 後続: 多孔性と飽和度を考慮する WetSpongeCake（arXiv 2401.15628）、湿潤時の暗化の原因は屈折率コントラストの低下に関連するという記述。
- 適用範囲: 多孔質・粉状の材質が中心。**魚体（非多孔質、粘液層）への適用は M の推論。乾燥／湿潤のラフネス差の数値は見つからなかった。** Lagarde の "Water drop 3b" は検索 #30 の要約に出ず、本文は未確認。
- 出典: https://graphics.ucsd.edu/~henrik/papers/rendering_wet_materials/ 、https://groups.csail.mit.edu/graphics/pubs/wet_materials_egwr99.pdf 、https://diglib.eg.org/handle/10.2312/EGWR.EGWR99.273-282 、https://www.fxguide.com/?p=43362 、https://arxiv.org/html/2401.15628v3
- 証拠: [A]（Jensen ら 1999 の要旨）／[B]（fxguide）。

### F-34 法線マップのフィルタリング: Toksvig、LEAN、Kaplanyan ら
- 主張/値（要約）:
  - **Toksvig, "Mipmapping Normal Maps"（NVIDIA の技術資料, 2006 年版）**: 平均化・補間した単位法線の長さは、フットプリント内の法線が全て同一でない限り 1 より短くなる。この短縮を法線のばらつきの尺度として、鏡面ハイライトのエイリアシングを除く。法線の変化が激しいとき、鏡面指数（粗さ）を調整してハイライトを大きくする。べき乗関数を 2D テクスチャ参照に置き換える安価な実装も示される。**式は要約に無い。**
  - **LEAN Mapping（Olano & Baker, I3D 2010）**: バンプの評価を個々のバンプの接空間ではなく、ポリゴン面の共通の接空間で行い、法線分布を MIP・異方性フィルタのハードウェアで**線形にフィルタ可能な形**で保存する。バンプを接空間上の**オフセンターの 2D ガウス分布**（平均と 2×2 対称共分散行列）でモデル化。必要なテクスチャは前処理でも、時間変化する法線マップでは GPU 上でも生成可能。Civilization V（2010 年秋）で使用。後続に LEADR（SIGGRAPH Asia 2013）。
  - **Kaplanyan, Hill, Patney & Lefohn, "Filtering Distributions of Normals for Shading Antialiasing"（HPG 2016, Best Paper）**: 微小面材質の NDF を、ピクセルフットプリントなどから推定した領域でハーフベクトルのスロープ領域（平行平面領域）においてフィルタする。GPU 向き・時間的に安定で、デファード描画・法線マップ・法線マップ用フィルタ法と併用できる。
  - 結果に出た補助資料（本文未確認、リードのみ）: "Rock-solid shading"（selfshadow.com の講演資料）、"Material Advances in WWII"（realtimerendering.com の講義ノート）、Khronos フォーラム・Unity フォーラムの Toksvig 係数の議論。
- 適用範囲: 一般の鏡面 BRDF。Three.js への組込みは F-06 のとおり未対応で、実装は自作が必要。ヤマメの鱗への適用例は見つからなかった。
- 出典: https://developer.download.nvidia.cn/whitepapers/2006/Mipmapping_Normal_Maps.pdf 、https://userpages.cs.umbc.edu/olano/papers/lean/ 、https://www.cse.chalmers.se/edu/year/2011/course/TDA361/Advanced%20Computer%20Graphics/LEANMapping.pdf 、https://mdsoar.org/items/7babd5a3-62b6-4195-9fe3-af97c308bb0a 、https://research.nvidia.com/publication/2016-06_filtering-distributions-normals-shading-antialiasing 、https://diglib.eg.org/handle/10.2312/hpg20161201 、https://perso.liris.cnrs.fr/victor.ostromoukhov/publications/pdf/SAsia2013-LEADR.pdf 、https://www.selfshadow.com/talks/rock_solid_shading_v1.pdf 、https://realtimerendering.com/advances/s2018/MaterialAdvancesInWWII-course_notes.pdf
- 証拠: [A] LEAN "models bumps with off-center 2D Gaussian distributions of normal vectors"、Kaplanyan "filtering the NDF ... in the slope domain"（要約）。Toksvig は [B]（技術資料）。

### F-35 硬骨魚の鰭の構造（鰭条・膜）
- 主張/値（要約）: 硬骨魚の鰭は共通して**三層構造**で、2 層の表皮が、骨性の鰭条で補強された真皮を挟む。中間の真皮は、表皮層の間および鰭条の間・周囲に渡る秩序だったコラーゲン層でできている。鰭条（lepidotrichia）は対になる半鰭条（hemitrichia）が actinotrichia を囲む骨性の棒で、**トラウト**では 2 本の平行で対称な骨性の半鰭条が関節のある節を作り、近位から遠位へ向けて石灰化する。**鰭膜の厚み（µm）の数値は 2 回目の検索でも出なかった。**
- 適用範囲: 硬骨魚一般、トラウトの発生の記述（種は要約に明示なし）。ヤマメの鰭膜の厚み・透過率は無し。
- 出典: https://sicb.org/?p=32710 、https://sicb.org/?p=21056
- 証拠: [A]（学会要旨の要約）"trilaminar structure, consisting of two layers of epidermis sandwiching a layer of dermis ... reinforced with bony fin rays"。

### F-36 眼シェーダの実装慣行（PROXY:ヒト／キャラクター）
- 主張/値（要約）: CryEngine の眼シェーダ文書は、パラメータに iris depth（虹彩の深さ）、瞳孔位置の UV（X, Y）を挙げ、**新しいシェーダは既定で "Iris Parallax Mapping"** を使う。眼の主要部は強膜・虹彩・瞳孔・角膜（虹彩の「風防」）。フランス INRIA の解剖学的な眼のモデル化は、角膜界面の屈折を考慮し、複数回の屈折と内部散乱を含む。制作者フォーラム（polycount）では「レンズ要素を足さなくても、放射状グラデーションで高さを与える単純なバンプオフセットで虹彩のパララックスが出る」という記述がある。
- 適用範囲: ヒト・CG キャラクターの眼。**魚眼（球形水晶体、角膜の屈折力がほぼ無い、金色の虹彩）は対象外**。魚眼のレンダリング事例は見つからなかった。
- 出典: https://cryengine.com/docs/static/engines/cryengine-3/categories/1114113/pages/1048594 、https://hal-univ-tlse3.archives-ouvertes.fr/INRIA/inria-00166304 、https://animationsinstitut.de/en/research/tools/frapper/real-time-eye-shading 、https://galacean.antgroup.com/engine/en/docs/graphics/material/builtinShaders/digitalHuman/eye 、https://polycount.com/discussion/comment/1075451
- 証拠: [B]（CryEngine 文書）／[C]（polycount）。PROXY:ヒト。

### F-37 薄い半透明表面の透過近似（GDC 2011）の存在確認
- 主張/値: Colin Barré-Brisebois と Marc Bouchard の GDC 2011 講演 "Approximating Translucency for a Fast, Cheap and Convincing Subsurface Scattering Look" は、Frostbite 2 エンジン（Battlefield 3）に統合された、高速でスケーラブルな透過近似。Alan Zucconi の Unity 解説（Part 1）に実装例がある。**厚みマップ・歪み・べき乗・スケールの式やパラメータの意味は要約に出なかった**ので、F-08 のコード（Three.js アドオンの実装）が唯一の根拠。
- 適用範囲: ゲームの汎用的な半透明（植物・皮膚・蝋など）。魚の鰭への適用例は見つからなかった。
- 出典: https://frostbite.com/frostbite/news/approximating-translucency-for-a-fast-cheap-and-convincing-subsurface-scattering-look 、https://www.alanzucconi.com/2017/08/30/fast-subsurface-scattering-1/
- 証拠: [B]。

### F-38 水中の光の減衰（純水の吸収、実時間分光レンダリング）
- 主張/値: (1) Pope & Fry, "Absorption spectrum (380–700 nm) of pure water. II. Integrating cavity measurements", Applied Optics 36, 8710–8723 (1997)。積分キャビティ法。**吸収の最小は 418 nm で 0.0044±0.0006 m⁻¹**（要約記載）。独立な光熱法の結果とよく一致（要約。結果に出た DOI 10.1364/AO.36.008699 の論文が光熱法の対になる論文かどうかは、要約からは確認できていない）。他の波長の値は表のページ（omlc.org）に行き着いたが、要約には出ず、**550/600/650 nm の個別値は 2 回の検索（#8, #10）で確認できなかった**。(2) 赤い光は青緑より速く減衰し、深さとともに顕著になる。Beer–Lambert の法則に従い、直接透過成分は波長依存の減衰係数で距離とともに指数的に減る（一般記述、複数の要約）。(3) Monzon, Gutierrez, Akkaynak & Muñoz, "Real-Time Underwater Spectral Rendering", Computer Graphics Forum 2024（Eurographics 2024）: 鉛直方向の放射照度の減衰を拡散下向き減衰係数 Kd で特徴づけ、実測データベースから放射伝達方程式の解析近似を得て、モンテカルロの参照解に近い結果を桁違いに短い時間で出す。体積影と、水面近くの空間的に変化する動的照明を含む。光学的水質タイプを切り替えられる。
- 適用範囲: (1) は純水。(3) は PROXY:海洋水（Jerlov 型の水質）で、**日本の渓流の水質ではない**。係数の実数値は要約に無い。
- 出典: https://omlc.org/spectra/water/abs/pope97.html 、https://0-dx-doi-org.brum.beds.ac.uk/10.1364/AO.36.008699 、https://diglib.eg.org/handle/10.1111/cgf15009 、https://graphics.unizar.es/projects/EG24Underwater/ 、https://arxiv.org/pdf/1301.1984
- 証拠: [A] "The absorption minimum is at 0.0044±0.0006 m⁻¹ at 418 nm"（要約）。

### F-39 コースティクス・神の光の原典と WebGL／Three.js 先行例
- 主張/値: (1) GPU Gems 1 第 2 章 "Rendering Water Caustics"（Juan Guardado, Daniel Sánchez-Crespo, 2004）: 水中のコースティクスを実時間で描く「見た目重視（aesthetics-driven）」の方法。ほとんどのハードウェアで簡単に実装できる。**手法の細部（投影テクスチャ、深度減衰など）は要約に出なかった。** 別に、Game Developer の "Inexpensive underwater caustics using Cg" がある。(2) GPU Gems 3 第 13 章 "Volumetric Light Scattering as a Post-Process"（Kenny Mitchell, EA）: 大気中の影による体積散乱をポストプロセスで再現。従来の日光散乱の解析モデルに体積オクルージョンを加え、**前景を黒、背景（空）を色つきにマスクしたフレームバッファに放射状ブラー**をかけるピクセルシェーダ。不透明物体によるオクルージョンを正しく扱う。(3) Three.js／WebGL の先行例: gitee の WaterThreeJS（太陽方向に投影したコースティクス模様で変調した、深度バッファ復元のレイマーチ神の光。アニメする砂底のコースティクス）、Evan Wallace "Rendering Realtime Caustics in WebGL"（Medium）、Maxime Heckel の R3F コースティクス記事（屈折光線を断片シェーダで模す）、Three.js WebGPU＋TSL の水中デモ（Three.js フォーラム。体積フォグ・神の光・コースティクス・手続き的植生）。
- 適用範囲: 一般の水中シーン。魚体表面へのコースティクスの当たり方（鱗でのちらつき）の記述は無し。先行例のライセンス・品質は未確認。
- 出典: https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics 、https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process 、https://gamedeveloper.com/programming/inexpensive-underwater-caustics-using-cg 、https://gitee.com/theyn/WaterThreeJS 、https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c 、https://blog.maximeheckel.com/posts/caustics-in-webgl 、https://discourse.threejs.org/t/deep-abyss-underwater-experience/92214
- 証拠: [B]（原典の存在と概要）／[C]（先行例）。

### F-40 ゲーム用魚モデルのポリ数・LOD・テクスチャ（販売ページの自己申告）
- 主張/値（要約。URL との対応は結果の並びからの推定を含む）:

  | 資産 | 数値（自己申告） |
  |---|---|
  | リグ付きトラウト（Superhive） | 3,892 三角形、実寸 約 43.8 cm、静的メッシュも同梱 |
  | Gilthead sea bream（Superhive） | 2,654 三角形、4K／2K／1K の PNG（BaseColor, Normal, Roughness, Metallic, AO） |
  | オオクチバス（CGTrader） | 465 頂点・926 三角形、リグ付き、遊泳・左旋回・右旋回 |
  | 北米淡水魚 10 種（ニジマス・レイクトラウト含む） | 1 モデル 300〜370 頂点、重ならない UV |
  | 魚群システム用パック（ArtStation） | 9 メッシュ・12 種、LOD 3 段以上（1800 から 50 未満の三角形）、LOD0 平均 約 1000 三角形、**全種で同じスケルトン** |
  | オーストラリアンテイラー（Fab） | 4 LOD: LOD0 4,096 頂点、LOD1 896、LOD2 188、LOD3 107、ループ遊泳アニメ付き |
  | ローポリ魚 4 匹（CGTrader） | 平均 約 400 ポリゴン、遊泳アニメ付き |
  | リグ付きブリーム／アーチャーフィッシュ／骨格つきコイ | 810 ／ 8,055 ／ 88,243 ポリゴン（解剖学表示用のコイ） |

  - 一般記述: 近年のモデルは Unity HDRP/URP や Unreal 向けに 2K の PBR 材質。**ボーン数は 1 件も出なかった。**
- 適用範囲: 販売ページの自己申告で、種・用途（ゲーム、教材、解剖図）・LOD・三角形／頂点／ポリゴンの数え方が揃っていない。Three.js（WebGL）での実測ではない。ヤマメの仕様値として使えるのは、桁（数百〜数千三角形が「ゲーム用」、数万が「解剖・高精細」）の目安まで。
- 出典: https://superhivemarket.com/products/rigged-trout-3d-model 、https://superhivemarket.com/products/gilthead-sea-bream-3d-model--game-ready 、https://www.cgtrader.com/3d-models/animal/fish/low-poly-largemouth-bass 、https://www.cgtrader.com/3d-models/animal/fish/animated-freshwater-fish-3458131c-cdfe-430e-a329-96099676d73d 、https://www.artstation.com/a/8310282 、https://www.fab.com/listings/21220295-af9b-4b4b-a427-60a6f6c373c6 、https://www.cgtrader.com/free-3d-models/animal/fish/low-poly-fish-b981402c-4bac-491b-a4d8-6bc91b8e08b0 、https://www.cgtrader.com/3d-models/animal/fish/gilthead-bream-rigged 、https://www.cgtrader.com/3d-models/animal/fish/archerfish 、https://superhivemarket.com/products/bony-carp-anatomy-structure-rigged-for-blender
- 証拠: [C]。

### F-41 多数の魚の頂点シェーダアニメーション（Godot 公式文書）
- 主張/値（要約）: 骨のアニメーションを CPU で動かすと毎フレーム数千の演算が要り、数千個体は不可能。頂点シェーダ内の変形（左右の揺れ、中心まわりの旋回、進行波、ねじりの 4 つの動き）をユニフォームで制御し、静的メッシュのインスタンス描画を併用すると、低性能機でも数千匹のアニメーション魚を出せる。
- 適用範囲: Godot エンジンの MultiMeshInstance の解説（検索の意図は Abzû の GDC 資料だったが、**Abzû の資料は結果に出なかった**）。Three.js では `InstancedMesh`＋頂点シェーダに読み替える必要がある（M）。近接観察用の主役個体には向かない。
- 出典: https://docs.godotengine.org/en/3.2/tutorials/3d/vertex_animation/animating_thousands_of_fish.html
- 証拠: [B]（エンジン公式文書）。

### F-42 鱗の PBR テクスチャ素材と手続き生成の手がかり
- 主張/値（要約）: 市販の魚鱗 PBR テクスチャは 8192×8192 と 4096×4096 px で、Albedo、反射、光沢、高さ／ディスプレイスメント、粗さ、金属度、AO、法線マップを含み、Unreal／Unity 用プリセットがある。手続き的な生成は、オフセット付きの帯（行ごとにずらす）で千鳥配置、Voronoi＋波打ちで形を作り、高さマップから法線を計算する、という一般記述（Unreal の Procedural 関数リファレンス、Unity Shader Graph の例のコミット）。ヘビの鱗のリアルタイム物理ベース描画の学位論文（Chalmers）がある。
- 適用範囲: 一般の鱗素材。**魚の鱗の体長比・重なり量・列の傾きの数値、遠距離の消失対策の実例は見つからなかった**（F-14 の計算が唯一の目安）。
- 出典: https://cgaxis.com/product/fish-scales-pbr-texture-4 、https://docs.unrealengine.com/4.27/RenderingAndGraphics/Materials/Functions/Reference/Procedurals 、https://plastichub.unity.cn/unity-tech-cn/ShaderGraph_ExampleLibrary/commit/f84f5f90-9b66-4733-8719-2fad116b3bce 、https://odr.chalmers.se/items/3b995d7f-0d31-4d0b-90c5-0ad4f3736d90/full
- 証拠: [C]。

---

## 3. 資料間の矛盾・不一致

1. **クリアコートの F0**: Three.js は 0.04 固定（IOR 1.5 相当、F-03）、水膜は 0.0204（F-16、M 計算）。係数を 0.5 にして垂直入射に合わせると掠め角で過小（80° で 0.205 対 0.348）、1.0 のままだと垂直で 2 倍・80° で +0.06。どちらも厳密には合わない。**未解決**。
2. **虹彩の既定レンジと、グアニン 1/4 波長厚**: Three.js／glTF の既定 100–400 nm（F-02）に対し、グアニン n=1.83 の仮定では 61–89 nm（F-17）。グアニン n、層構造が未確認なので、どちらが「正しい」とは言えない。
3. **銀色の性質**: 薄膜干渉（狭帯域の虹色）対 広帯域・非偏光の多層反射（r06 F-33, A, PROXY:ニシン・イワシ）。写真側の虹色の言及は 6/70 と少ない（r06 F-18, P）。→ 本書は「広帯域鏡面＋弱い虹彩」を採るが（F-19）、サケ科（ヤマメ）の反射体の直接証拠は無い。
4. **水中の光沢**: 写真集計では空気中 39 枚で「水膜」12／「濡れ」27、水中・水槽 18 枚で 0／5（F-10）。r06 F-17 の先行集計では、空気中（ヤマメ判定 39 枚）の 34 枚に「濡れた艶／水膜」とあり、**語の定義（水膜のみか、濡れ・艶を含むか）で数が違う**。本書は元の語を表に示した。傾向（空気中で多い）は両者で一致。
5. **粘液の厚み**: r06 F-37（C, 孫引き）で「500–600 Å と 1–2 µm」とあり、何を測った値か不明。薄膜干渉として扱うか否かの判断（F-20）に影響する。**未解決**。
6. **純水の吸収係数**: r06 F-30 でも「Smith & Baker (1981) と Pope & Fry (1997) で細部が異なる」と注記されている。本書も同じ記憶値を使っている（550 nm で 0.064）。別の記憶では 550 nm で 0.056–0.06 付近という感触があり、1/e 深さが 16–18 m の間で揺れる。いずれも M で、検証できていない。**（改訂）** 検索で確認できたのは 418 nm の最小 0.0044±0.0006 m⁻¹（F-38, A）だけで、550 nm 付近の値は確認できていない。最小値 0.0044 m⁻¹ は、本書が F-15 で 465 nm に仮定した 0.010 m⁻¹ と矛盾はしない（最小より大きい）が、465 nm の値の裏付けにもならない。
7. **グアニン板の厚み（改訂で追加）**: 検索要約のニシンの鱗のグアニン板「約 130 nm」（および浮き袋の板「約 19 nm」）は、n=1.83 の可視域 1/4 波長条件（約 61–89 nm、F-17）と合わない（130 nm なら条件を満たす波長は約 952 nm）。要約が板の厚みではなく別の量（積層周期、鱗全体の厚み、細胞質層との和など）を指した可能性があり、**どれが正しいか決められない**。仕様には使わない。
8. **銀色の反射体の設計（改訂で追加）**: 銀色の魚は「非周期の光子構造による広帯域反射」（F-30）という記述と、サケ科の積層を「各層が 1/4 波長光学厚の理想多層膜」とする記述（F-31）が併存する。前者は広帯域の鏡面で、後者は波長選択的な干渉色になる。ヤマメ（サケ科）のどちらに近いか、またパー・スモルト・成魚での違いは未確認。→ 実装は「広帯域鏡面＋弱い虹彩」（要約 1）を既定にして、虹彩の強さを銀化度の関数にする案が矛盾しない。
9. **薄膜の単位と範囲（改訂で追加）**: glTF／Three.js は nm 単位で既定 100–400 nm、IOR 既定 1.3（F-02、コード確認）。検索で出た別の仕様記述は µm 単位で「一般的な値は 0.02〜2.0 超」、IOR 範囲 [1..2.5]、Three.js ドキュメントの複製には 1.0〜2.333（F-29）。単位が違うだけで 0.1–0.4 µm は両立するが、IOR の上限（2.333 対 2.5）と「強さを表す値」という説明の違いは未整理。
10. **ゲーム用魚モデルの規模（改訂で追加）**: 810 から 88,243 ポリゴン、100 から数千三角形、LOD0 の頂点 4,096 まで幅が大きい（F-40）。三角形・頂点・ポリゴンの数え方、種、用途（ゲーム、教材、解剖）が揃っていないため、**平均や中央値を出さない**。
11. **粘液の光学（改訂で追加）**: ウミウシの粘液の n=1.3371–1.3854（海水と同程度、ほぼ透明）に対し、r06 F-37 の孫引きの厚み「500–600 Å と 1–2 µm」（C）は何を測った値か不明。n が水に近ければ、膜が µm 級でも界面反射は弱く、干渉縞は目立たない方向（M の推論、F-20b）だが、魚の粘液の n は未測定。

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル／アニメ／行動実装に必要だが確認できなかった事項

改訂で WebSearch 30 回を使い、調査課題 1〜7 のうち「手法・論文の存在と骨子」「グアニンの屈折率」「ゲーム魚モデルの規模」は裏付けを得た。**一方、ヤマメ（サケ科）固有の光学定数・寸法、および式・係数・数値表は、今回の検索でも取得できていない。** 下の各 Gap の「状態」は改訂後のもの。

- **Gap-1（課題 1）** [一部解消]: Belcour & Barla (2017) の骨子は確認（F-27）。**未取得**: 高調波の次数・精度・コスト・制限事項の本文記述、KHR_materials_iridescence 仕様本文の制約記述（検索 #2 の要約は単層モデルという一般記述のみ）、多層膜（グアニン／細胞質）の実時間近似の中身（F-28 の文献は存在確認のみで本文未読）、**魚の構造色の専用レンダリング事例（見つからず）**。
- **Gap-2（課題 2）** [一部解消]: Jensen ら 1999 の要旨（F-33）、ウミウシ粘液の屈折率（F-32, PROXY）を確認。**未取得**: 乾燥／湿潤のラフネス差の数値、魚の粘液の屈折率・厚み・散乱、魚体（非多孔質）の濡れ表現の先行例、Lagarde の "Water drop 3b" の本文。
- **Gap-3（課題 3）** [一部解消]: Toksvig／LEAN／Kaplanyan らの存在と骨子（F-34）。**未取得**: Toksvig の式の確認、LEAN の格納形式の詳細（B と M の項の定義）、Three.js への組込み例、鱗の法線マップ生成の魚向け先行事例（F-42 は一般素材のみ）、鱗の寸法（mm／体長比）。ヤマメの鱗ピッチは側線有孔鱗数からの暫定換算（F-14）だけで、直接の実測が無い。
- **Gap-4（課題 4）** [ほぼ未解消]: 鰭の三層構造（F-35）と GDC 2011 の存在（F-37）のみ。**未取得**: 鰭膜の厚み（µm）と透過率、鰭条のバンプの寸法、鰭への透過近似の適用例、Barré-Brisebois らの式・パラメータの本文。
- **Gap-5（課題 5）** [ほぼ未解消]: 人間向け眼シェーダの慣行のみ（F-36, PROXY）。**未取得**: 魚眼のレンダリング事例、角膜の厚み・屈折率、空気中での魚眼角膜の見え方、虹彩の反射層（グアニン）の厚み、Jimenez らの眼・皮膚の文献。
- **Gap-6（課題 6）** [一部解消]: Pope & Fry の存在と 418 nm の最小値（F-38）、GPU Gems 原典と WebGL 先行例（F-39）。**未取得**: 日本の渓流の可視域の吸収・散乱スペクトル（Kd）、純水の 550/600/650 nm の吸収係数の数値出典、コースティクス／神の光の手法の本文、スネルの窓の実装資料（未検索）、鱗の列の傾き・重なり量・段差・隆起線間隔。
- **Gap-7（課題 7）** [一部解消]: 販売ページの自己申告（C）でポリ数・LOD・テクスチャ解像度を確認（F-40）。**未取得**: ボーン数（1 件も出ず）、Three.js／WebGL での実測、ヤマメ近接観察用 LOD の根拠になる実例、ゲーム会社の技術資料（CEDEC 等は検索 #17 で出ず）。
- **Gap-8**: 魚体の質感に関する実時間レンダリングの先行研究（皮膚シェーダ、鱗、虹色）は、検索 #5・#14・#15・#28 でも**専用の論文・事例は見つからなかった**（ヘビ皮膚・鳥の羽・一般の虹色物体のみ、F-28）。
- **Gap-9**: `SubsurfaceScatteringShader` を PBR（`MeshPhysicalMaterial`）へ移植する際のコストと見た目の検証（実装・実測はしていない）。
- **Gap-10**: モーフターゲット数の上限（`DataArrayTexture` の層数、環境依存）、口・鰓蓋に必要なボーン数。
- **Gap-11**: ユーザー提供の骨格画像（s01.jpg）は、頭部が短縮・重なりで判別できず、種も未確認（Oncorhynchus 属らしき標本）。口・顔・鰓の骨格由来の寸法（F-26）は、側面（または正面）から撮った頭部骨格の資料が得られるまで、本書では反映できない。r15_cranial_osteology.md の結論を参照すること。
- **Gap-12**: Three.js のコード確認は r186.1 のみ。WebGPU（NodeMaterial）側の虹彩・クリアコート・透過の実装は未確認。実際に描いて見た目を確認する作業は未実施。
- **Gap-13**: 水中・水槽・空気中の写真の色・光沢を実測する計測（測色・測光）。写真は AI による目視記述で、露出・画像処理に依存する。

### 次回、検索予算が使える場合の優先クエリ案（今回の 30 回で取れなかったもの。論文本文の文を予想した形）
1. 純水の吸収係数の数値表: omlc.org の Pope & Fry 表の本文に出る形（"550.0 0.0565" のような表の行）を allowed_domains: omlc.org で。検索 #8・#10 は要約が数値を返さなかった。
2. 銀色の魚のグアニン板の**厚み**と層数: "guanine crystal thickness nm ... brown trout OR rainbow trout OR salmon skin iridophore stack of n platelets"。今回の ニシン 130 nm（矛盾 7）の取り違えを確かめるため、"herring guanine crystals ... thickness of 20 nm" 型の文も試す（Jordan ら、Gur ら）。
3. 鰭膜の厚み: "fin ray ... interray membrane ... thickness ... µm ... trout OR zebrafish"（検索 #23 は構造のみ）。
4. 魚眼の角膜・虹彩: "teleost cornea refractive power in air ... iris argentea ... guanine"（r07 の領域）と、魚眼の CG 実装例 "fish eye shader cornea".
5. LEAN の式: "LEAN mapping ... B_n ... M_n ... covariance Σ = M − B Bᵀ ..." 型の本文（chalmers の PDF が索引されている）。Toksvig の式: "ft = |Na| / (|Na| + s (1 − |Na|))" 型。
6. 乾燥／湿潤のラフネス差: "wet surface roughness decreases water film ... specular ... Lagarde" の本文。
7. ボーン数: "fish rig 20 joints OR bones spine tail fin ... skeletal mesh" 型。CEDEC／GDC の魚資料。
8. 多層膜の実時間近似: "periodic multilayer ... Huxley ... closed form ... real-time" の本文（asia.siggraph.org のポスター、diglib7.eg.org の PDF）。

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

### 5.4 検証用リード（記憶。未検証、URL なし）— 改訂後に残ったもの
- Toksvig (2004) J. Graphics Tools（NVIDIA の技術資料は F-34 で確認済みだが、掲載誌・年は M）／Tokuyoshi & Kaplanyan (2019)／Jimenez et al. (2010) IEEE CG&A／Wallace (2011) WebGL Water（記事の存在のみ確認）／Smith & Baker (1981)（PDF が検索 #10 に出たが本文未確認）／ACM TOG 36(4)（Belcour & Barla の掲載誌）。
- 改訂で存在を確認し 5.5 へ移したもの: Belcour & Barla (2017)、Olano & Baker (2010)、Kaplanyan ら (2016)、Jensen ら (1999)、Barré-Brisebois & Bouchard (GDC 2011)、GPU Gems 1 第 2 章、GPU Gems 3 第 13 章、Pope & Fry (1997)。

### 5.5 検索で得た出典（URL は検索結果に出たもののみ。本文は未読で、要約に基づく）
- 薄膜干渉・多層膜: https://blog.unity.com/es/technology/a-practical-extension-to-microfacet-theory-for-the-modeling-of-varying-iridescence 、https://history.siggraph.org/?p=102374 、https://arxiv.org/pdf/2512.23696 、https://gltf-transform.dev/modules/extensions/classes/KHRMaterialsIridescence 、https://neofixer.arizona.edu/css/CSSOrbit/asteroidJS/three/docs/api/en/materials/MeshPhysicalMaterial.html 、https://asia.siggraph.org/2023/index.html%3Fpost_type=page&p=14494&id=pos_199&sess=sess200.html 、https://diglib7.eg.org/bitstream/handle/10.1111/cgf15017/v43i2_04_15017.pdf 、https://studenttheses.uu.nl/handle/20.500.12932/15359 、https://graphics.unizar.es/projects/SnakeSkinAppearance_2023/ 、https://odr.chalmers.se/items/3b995d7f-0d31-4d0b-90c5-0ad4f3736d90/full 、https://home.hiroshima-u.ac.jp/~kin/publications/PG00/iridescent_colors.pdf 、https://par.nsf.gov/biblio/10592960-appearance-modeling-iridescent-feathers-diverse-nanostructures
- 魚の光学（グアニン、虹色素胞、粘液、鰭）: https://www.weizmann.ac.il/molgen/gur/sites/molgen.gur/files/2024-10/Eyal%20et%20al%202022.pdf 、https://weizmann.ac.il/molgen/gur/sites/molgen.gur/files/2024-10/Gur%20et%20al%202012.pdf 、https://www.weizmann.ac.il/molgen/gur/sites/molgen.gur/files/2024-10/Gur%20et%20al%202014.pdf 、https://pmc.ncbi.nlm.nih.gov/articles/PMC4345507 、https://arxiv.org/html/2406.07819v1 、https://mail.mjcrescimanno.people.ysu.edu/recentpapers/laserFish1.pdf 、https://link.springer.com/doi/10.1007/BF00222271 、https://pubs.usgs.gov/publication/70180320 、https://zoolstud.sinica.edu.tw/Journals/63/63-02.pdf 、https://zoolstud.sinica.edu.tw/news/2024_63-02.html 、https://sicb.org/?p=32710 、https://sicb.org/?p=21056
- 濡れ・法線フィルタ: https://graphics.ucsd.edu/~henrik/papers/rendering_wet_materials/ 、https://groups.csail.mit.edu/graphics/pubs/wet_materials_egwr99.pdf 、https://diglib.eg.org/handle/10.2312/EGWR.EGWR99.273-282 、https://www.fxguide.com/?p=43362 、https://arxiv.org/html/2401.15628v3 、https://developer.download.nvidia.cn/whitepapers/2006/Mipmapping_Normal_Maps.pdf 、https://userpages.cs.umbc.edu/olano/papers/lean/ 、https://www.cse.chalmers.se/edu/year/2011/course/TDA361/Advanced%20Computer%20Graphics/LEANMapping.pdf 、https://mdsoar.org/items/7babd5a3-62b6-4195-9fe3-af97c308bb0a 、https://research.nvidia.com/publication/2016-06_filtering-distributions-normals-shading-antialiasing 、https://diglib.eg.org/handle/10.2312/hpg20161201 、https://perso.liris.cnrs.fr/victor.ostromoukhov/publications/pdf/SAsia2013-LEADR.pdf 、https://www.selfshadow.com/talks/rock_solid_shading_v1.pdf 、https://realtimerendering.com/advances/s2018/MaterialAdvancesInWWII-course_notes.pdf
- 眼・半透明・水中: https://cryengine.com/docs/static/engines/cryengine-3/categories/1114113/pages/1048594 、https://hal-univ-tlse3.archives-ouvertes.fr/INRIA/inria-00166304 、https://animationsinstitut.de/en/research/tools/frapper/real-time-eye-shading 、https://galacean.antgroup.com/engine/en/docs/graphics/material/builtinShaders/digitalHuman/eye 、https://polycount.com/discussion/comment/1075451 、https://frostbite.com/frostbite/news/approximating-translucency-for-a-fast-cheap-and-convincing-subsurface-scattering-look 、https://www.alanzucconi.com/2017/08/30/fast-subsurface-scattering-1/ 、https://omlc.org/spectra/water/abs/pope97.html 、https://0-dx-doi-org.brum.beds.ac.uk/10.1364/AO.36.008699 、https://arxiv.org/pdf/1301.1984 、https://diglib.eg.org/handle/10.1111/cgf15009 、https://graphics.unizar.es/projects/EG24Underwater/
- コースティクス・神の光: https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics 、https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process 、https://gamedeveloper.com/programming/inexpensive-underwater-caustics-using-cg 、https://gitee.com/theyn/WaterThreeJS 、https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c 、https://blog.maximeheckel.com/posts/caustics-in-webgl 、https://discourse.threejs.org/t/deep-abyss-underwater-experience/92214
- ゲーム資産・魚アニメ・鱗素材: https://superhivemarket.com/products/rigged-trout-3d-model 、https://superhivemarket.com/products/gilthead-sea-bream-3d-model--game-ready 、https://www.cgtrader.com/3d-models/animal/fish/low-poly-largemouth-bass 、https://www.cgtrader.com/3d-models/animal/fish/animated-freshwater-fish-3458131c-cdfe-430e-a329-96099676d73d 、https://www.artstation.com/a/8310282 、https://www.fab.com/listings/21220295-af9b-4b4b-a427-60a6f6c373c6 、https://www.cgtrader.com/free-3d-models/animal/fish/low-poly-fish-b981402c-4bac-491b-a4d8-6bc91b8e08b0 、https://www.cgtrader.com/3d-models/animal/fish/gilthead-bream-rigged 、https://www.cgtrader.com/3d-models/animal/fish/archerfish 、https://superhivemarket.com/products/bony-carp-anatomy-structure-rigged-for-blender 、https://docs.godotengine.org/en/3.2/tutorials/3d/vertex_animation/animating_thousands_of_fish.html 、https://cgaxis.com/product/fish-scales-pbr-texture-4 、https://docs.unrealengine.com/4.27/RenderingAndGraphics/Materials/Functions/Reference/Procedurals 、https://plastichub.unity.cn/unity-tech-cn/ShaderGraph_ExampleLibrary/commit/f84f5f90-9b66-4733-8719-2fad116b3bce

---

## 6. 検索ログ

### 6.1 外部検索（WebSearch）— 改訂での実行 30 回（すべて mode: standard、拒否 0 回）
（初版の拒否 3 回は本改訂とは別。初版では予算 200/200 で拒否され、結果なし。）WebFetch、curl での外部取得は行っていない。#2〜#3、#4〜#5 のように同時に 2 件ずつ発行したものが多い。有用度: 高＝仕様に直結する新情報、中＝存在確認や定性的記述、低＝新情報なし／不採用。

| # | クエリ（要旨） | mode | 得られたもの | 有用度 | 反映先 |
|---|---|---|---|---|---|
| 1 | Belcour Barla 2017 "A Practical Extension to Microfacet Theory..." Fourier space Gaussian XYZ | standard | 方式の骨子（Fourier 畳み込み＋ガウス、RGB と分光で一貫） | 高 | F-27 |
| 2 | KHR_materials_iridescence specification thickness iridescenceIor limitations single layer | standard | µm 単位の仕様記述、単層モデル、IOR 範囲（出典不特定） | 中 | F-29 |
| 3 | Toksvig "Mipmapping Normal Maps" specular power normal length | standard | 技術資料の存在と骨子（式なし） | 中 | F-34 |
| 4 | LEAN Mapping Olano Baker 2010 ... covariance filtering | standard | 2D ガウス分布・線形フィルタ・Civ V | 高 | F-34 |
| 5 | fish scales procedural normal map shader real-time iridescent silver fish skin Unity Unreal | standard | 市販の鱗テクスチャのみ。専用の技法記事なし | 低 | F-42 |
| 6 | Jensen Legakis Dorsey "Rendering of Wet Materials" | standard | 1999 年論文の要旨 | 中 | F-33 |
| 7 | GPU Gems "Rendering Water Caustics" Guardado Sánchez-Crespo | standard | 章の存在と概要のみ（細部なし） | 低〜中 | F-39 |
| 8 | Pope and Fry 1997 absorption spectrum pure water ... 550/600/650 nm | standard | 418 nm の最小値 0.0044±0.0006 m⁻¹ | 中 | F-38 |
| 9 | real-time underwater rendering wavelength-dependent absorption red fog Beer-Lambert | standard | 一般記述、Real-Time Underwater Spectral Rendering の発見 | 中 | F-38 |
| 10 | pure water absorption coefficient 550 nm 0.0565 ... 650 nm 0.3400 Pope Fry table | standard | **数値は確認できず**（要約がクエリの数値を言い換えただけ。不採用） | 低 | F-38 の注記、矛盾 6 |
| 11 | "Real-Time Underwater Spectral Rendering" CGF 2024 Kd ... | standard | Monzon ら 2024 の方式（Kd データベース、RTE 解析近似） | 中 | F-38 |
| 12 | real-time eye rendering iris parallax cornea refraction offset UV | standard | CryEngine 文書、iris depth、パララックスの単純オフセット | 中 | F-36 |
| 13 | Barré-Brisebois Bouchard "Approximating Translucency..." thickness map distortion power scale | standard | 講演の存在と Frostbite 2 採用（式なし） | 低〜中 | F-37 |
| 14 | rendering fish skin iridescence multilayer guanine crystal reflector real-time scale shader paper | standard | ヘビ皮膚・多層膜・Utrecht 論文など周辺文献（魚専用は無し） | 高 | F-28 |
| 15 | real-time rendering multilayer thin film interference transfer matrix GPU Airy | standard | 周期多層膜（Huxley）、転送行列法の複雑さ | 中〜高 | F-28 |
| 16 | game ready fish 3D model rigged polygon count triangles bones texture 2048 LOD trout | standard | トラウト 3,892 三角形ほか多数 | 高 | F-40 |
| 17 | 魚 3DCG モデリング ゲーム ポリゴン数 ボーン リギング 鱗 テクスチャ シェーダー CEDEC | standard | 追加のポリ数例。CEDEC 資料は出ず | 低〜中 | F-40 |
| 18 | guanine crystal refractive index 1.83 cytoplasm 1.34 iridophore platelet thickness nm | standard | n=1.83／1.33、非周期構造の広帯域反射、板厚（要約に疑義） | 高 | F-30 |
| 19 | Abzû GDC fish rendering ... vertex animation texture instancing | standard | Abzû の資料は出ず。Godot の頂点アニメ文書 | 中 | F-41 |
| 20 | real-time wet surface rendering PBR water layer reduces roughness darkens albedo | standard | 販売ページ・fxguide のみ。数値なし | 低 | F-33 |
| 21 | Kaplanyan Hill Patney Lefohn "Filtering Distributions of Normals..." HPG 2016 | standard | 論文の存在と骨子 | 中 | F-34 |
| 22 | salmonid trout skin iridophore guanine platelets stacked ... smolt reflectance | standard | トラウト虹色素胞 2 型、USGS の銀化と皮膚グアニン | 高 | F-31 |
| 23 | fin membrane thickness trout pectoral fin soft rays lepidotrichia ... micrometers | standard | 三層構造のみ。厚みの数値なし | 中 | F-35 |
| 24 | Mitchell GPU Gems 3 chapter 13 "Volumetric Light Scattering as a Post-Process" | standard | 放射状ブラー、マスク方式 | 中 | F-39 |
| 25 | three.js WebGL underwater caustics shader god rays SpotLight projected caustics | standard | WebGL／Three.js の先行例 4 件 | 中 | F-39 |
| 26 | "Efficient and Accurate Physically Based Rendering of Periodic Multilayer Structures with Iridescence" Huxley | standard | ポスターの存在（本文なし） | 低〜中 | F-28 |
| 27 | fish skin mucus layer refractive index thickness teleost | standard | ウミウシ粘液 n=1.3371–1.3854（PROXY）。魚の値なし | 高 | F-32 |
| 28 | procedural overlapping fish scale pattern height map normal map shader staggered shingle | standard | 一般的な千鳥配置の手がかりのみ | 低 | F-42 |
| 29 | rigged fish 3D model bones count skeleton joints ... LOD1 LOD2 triangles trout salmon | standard | 魚群パックの LOD、4 LOD の頂点数。ボーン数は出ず | 中 | F-40 |
| 30 | Lagarde "Water drop 3b: Physically based wet surfaces" porosity roughness | standard | 本文は出ず（fxguide と湿潤暗化の一般記述） | 低 | F-33 |

### 6.2 ローカル調査（検索ではないが本書の根拠）
- npm からの `three@0.186.1`、`@gltf-transform/extensions@4.5.1` の取得とソース読解（F-01〜F-09）。有用度: 高（Three.js 実装の確認）。
- 写真カタログ 70 枚の再集計（F-10〜F-12）。有用度: 中（語の一致が粗い）。
- r06、r07、r10 の既存記述の参照（二次引用）。有用度: 中。
- 数値計算（Python、F-14〜F-17）。有用度: 中（入力が M／二次のため結果も M）。
- セッションの添付 PDF ページ画像（3D モデリング用 実写写真資料 70 枚）の確認: ヤマメの骨格図は含まれていなかった。骨格画像は `scratchpad/skeleton/s01.jpg` で確認（目視のみ。詳細解析は r15 に委ねた）。

### 6.3 総検索回数
- 本改訂で実行成立した WebSearch: **30 回**（割当 30 回を使い切り）。mode:"extended": 0 回。予算拒否: 0 回。WebFetch／curl の外部取得: 0 回。
- 初版の拒否された呼び出し 3 回は上記 30 回に含まない（成立していない）。
