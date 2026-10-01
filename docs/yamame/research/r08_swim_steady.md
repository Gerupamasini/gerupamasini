# 定常遊泳のキネマティクス（体波・振幅包絡・尾鰭振動数・速度）— サケ科／ヤマメ向け文献調査（検索26回で更新）

> 作成: ストリームR08。初版は検索0回（上限到達）だったが、今回は WebSearch を26回（割当どおり）実行し、初版の M（記憶）主張を裏取り・修正・補完した。
>
> **この文書の読み方（限界）**
> 1. 検索結果は「タイトル・URL・モデルが作った要約」のみで、論文全文は読めていない。**数式の係数・表の値・図の値は、要約に書かれていない限り取得できていない**（Gap）。
> 2. 要約が「どの文書の記述か」を特定していない場合は、その旨を各 F に書き、ランクを下げた。
> 3. 証拠ランク A/B/C/M/P は課題指示どおり。**M は検索で未確認の私の記憶**で、誌名・頁・数値に誤りがありうる（実際、Bainbridge 1958 の頁は検索結果と食い違った。§3-4）。
> 4. 「算出」「派生」は、資料の値から本書が計算した値で、資料には書かれていない。
> 5. **ヤマメ固有の実測が2件見つかった**（稚魚、全長4〜9 cm の尾鰭運動学と臨界遊泳速度、F-10・F-11）。成魚（河川型 15〜30 cm 級）のヤマメ・サクラマスの遊泳キネマティクス実測値は、今回も見つからなかった。

---

## 1. 要約（仕様に直結する結論。末尾の [F番号] は根拠 finding）

1. **体波の振幅包絡は二次多項式で表せる。** 44種の体・尾鰭推進魚の比較で、個体の約90〜92%（要約中に90%と92%の2表記、§3-3）が二次多項式で記述でき、形は A(x) = A1·(a2·x² + a1·x + a0)/Σai（A1=尾端振幅）。線形項と二次項の係数は強い負の相関（r = −0.89）。全種共通の統一モデルは振幅変動の60%を説明する。**係数の数値は未取得**。[F-04]
2. **頭部の振幅は尾端より小さいが、ゼロではない。** サイス（PROXY）の例: A(0)=0.02、A(0.2)=0.01、A(1.0)=0.10（単位は体長 L。片振幅か peak-to-peak かは未確認）。この3点を通る二次式は **A(x) = 0.02 − 0.0825x + 0.1625x²**（本書の算出。最小は x≈0.25 L で A≈0.0096、頭/尾 = 0.2）。ただし要約本文は「最小は頭から0.1 L、そこから尾端までほぼ直線的に増加」とも書き、**算出結果と一致しない**（§3-2）。[F-02]
3. **波長は体長前後で、遊泳速度に依存しない。** ニジマス: λ ≈ 0.9 L（Webb 1988、速度に依存せず）。ニジマス（全長5.5〜56 cm）では λ は速度に独立で、小型魚ほど相対的に長い。サイスの瞬間波長は 0.59〜1.54 L の幅があり、典型は 1 L。[F-03, F-06, F-07]
4. **尾端振幅は速度に依存しない（振動数で速度を稼ぐ）。** ニジマスでは尾鰭振幅は速度に独立で、大型魚ほど相対的に小さい。ヤマメ稚魚では振幅/全長 ≈ 0.12 で、振動数・遊泳速度が増えてもほぼ一定。[F-06, F-08, F-10]
5. **ヤマメ稚魚（全長4.4〜8.8 cm、体長3.7〜7.5 cm）の尾鰭振動数は 20.8〜39.1 Hz**（断面平均流速 48〜137 cm/s の高速域）。遊泳速度と振動数は比例関係で、論文は実験式を与えているが、**式は未取得**。[F-10]
6. **ヤマメ稚魚の60分臨界遊泳速度は 16〜41 cm/s（体長の 3.5〜6.9 倍、平均5.5、SD 1.1）**。体長4.8〜7.1 cm、水温13.7〜20.6 ℃、体長と正の相関、水温の影響は小さい。[F-11]
7. **BL/s で表した臨界遊泳速度は、小型・幼魚ほど高く、低温で低い。** コホ（Oncorhynchus kisutch）は稚魚の最大 7.3 L/s から、スモルトの 5.5 L/s まで。大西洋サケは、低温（8、4、1 ℃）で 2.08、1.69、1.27 BL/s。ヤマメ成魚（15〜30 cm）に稚魚の 5.5 BL/s をそのまま使ってはならない。[F-11, F-12, F-13]
8. **日本の魚道設計の目安**: 突進（瞬発）速度は体長の約10倍、巡航速度は体長の2〜3倍（小型淡水魚一般、国交省資料の検索要約）。大型のサケ類は突進 10 BL/s、巡航 3〜4 BL/s、サケ科は耐久（持続）速度 3〜4 BL/s という記述もある。成魚の60分耐久遊泳速度（水温12〜13 ℃以上）は、イワナ（PROXY）85 cm/s、ウグイ85、コイ70、ギンブナ・オイカワ65、カワムツ55 cm/s。**ヤマメ成魚の値は無い**。[F-14, F-15, F-16]
9. **ニジマスは 0.5〜1.0 BL/s の定速遊泳では胸鰭を体側に畳んでいる**（Drucker & Lauder 2003）。胸鰭は定位・低速・旋回などの操縦で使われる。歩容転換の速度（BL/s）は未取得。[F-17]
10. **Kármán gait は自由流の巡航とは別の体運動**: 尾端振幅は自由流の約3倍、体波長 > 1 L、体の側方変位 > 0.5 L、尾鰭振動数は渦放出周波数に一致して自由流より低く、体サイズに依存しない。[F-18, F-19, F-21]
11. **Kármán gait の体波は体の後方から始まる**: 波の開始点は自由流より 0.2 L 体の後方。振幅包絡（peak-to-peak）は尾へ向かい非線形に増え、後半部では波速が一定。流速 30〜70 cm/s で出現確率が最大、円柱後流の速度欠損は約40%の領域を使う（ニジマス）。[F-19, F-20]
12. **Entraining（円柱への張り付き）では体を波打たせない**: 体をまっすぐ、流れに対して角度を付けて保持し、擾乱は鰭で補正する。円柱の前方（bow wake）では、尾鰭振幅と波速が他の条件より低い。**初版の記述（前面の高圧域で位置保持）は不正確**で、entraining は円柱の側方・下流の吸引域である（§3-7）。[F-22]
13. **バースト＆コースト**（ニジマス）: バースト中の尾鰭振幅は 0.17 L で一定、振動数は平均速度に線形に増加（学会要旨）。[F-23]
14. **運動学の駆動量は対水速度**（物理原理、M・確信度高）。流速 v の流れで定位するヤマメは、対地速度0でも対水速度 v の運動学で泳ぐ。Kármán gait では局所流速が下がるため、この原理だけでは不十分。[F-30, F-18]
15. **体型の細い個体ほど最大代謝が高く持続遊泳に有利**（ブラウントラウト、PROXY、継承）。[F-24]
16. **まだ裏付けがない（M のまま）**: ストローハル数（0.2〜0.4）、波速比 V/U、スリップ、ストライド長、頭部の反動、Beamish の持久区分、Wardle のバースト限界、胸鰭の負の揚力（F-25〜F-34）。

### 設計用の暫定値（検証状況を明記。仕様書へ転記する際は「仮置き」と書くこと）

| パラメータ | 暫定値 | 根拠・状況 | ランク |
|---|---|---|---|
| 包絡の関数形 | A(x) = A_tail·(a2x²+a1x+a0)/Σa（二次） | Di Santo 2021。係数は未取得 | A（形のみ） |
| 包絡の暫定係数（代替） | A(x)/L = 0.02 − 0.0825x + 0.1625x²（x=0..1、頭→尾） | サイス3点値（PROXY）からの算出。尾端 0.10。定義未確認 | A値＋算出 |
| 頭/尾 振幅比 | 約 0.2（サイス算出）。Di Santo はモード間で傾向なし | 振幅定義未確認 | A値＋算出 |
| 尾端振幅 / L | ニジマス〜0.17（バースト中）〜0.2、ヤマメ稚魚 0.12（全長比）。速度に依存しない。大型ほど小さい | 振幅の定義（片振幅／peak-to-peak）が資料間で不明 | A/B |
| 体波長 λ / L | 0.9（ニジマス）。サイスの瞬間値 0.59〜1.54。速度に独立 | Webb 1988、Videler & Hess（要約） | A |
| 尾鰭振動数 f | 速度に比例。ヤマメ稚魚 20.8〜39.1 Hz（流速 48〜137 cm/s）。式は未取得 | Izumi & Kato 2012 | A |
| 60分臨界遊泳速度 | ヤマメ稚魚 3.5〜6.9 BL/s（平均5.5）。成魚は未取得 | Izumi & Kato 2011 | A |
| 巡航／突進（日本の設計目安） | 巡航 2〜4 BL/s、突進 約10 BL/s | 国交省資料等の検索要約 | B |
| 胸鰭 | 0.5〜1.0 BL/s の定速遊泳では体側に畳む | Drucker & Lauder 2003 | A |
| Kármán gait | 振幅 約3倍、λ>1L、f=渦放出周波数、変位>0.5L | Liao 2003、Akanyeti & Liao 2013 | A |
| Entraining | 体波なし。体をまっすぐ角度を付けて保持 | Przybilla 2010 | A |
| 頭部ヨー振幅 | 未取得 | — | — |
| ストローハル数、波速比、スリップ | 未取得（M のみ） | F-25, F-26 | M |

---

## 2. Findings

> ランクの表記: A=査読論文・公的機関資料で、検索要約に数値/記述が明示／B=解説・学会要旨・出典特定不能の要約／C=個人サイト等（今回なし）／M=記憶（未検証）／P=写真（運動学の情報なし）。
> 「出典」の URL は、すべて今回の検索結果に出たもの。

### F-01
- 主張/値: サイスの高速連続遊泳（速度範囲はサバがサイスの約2倍）では、サバの方が尾鰭振幅がやや大きく、尾柄付近の曲率が強い、というのが両種の主な違いだった。無次元の運動学量は、広い速度範囲でほとんど変化しなかった。
- 適用範囲: PROXY:Pollachius virens（サイス）、Scomber scombrus（サバ）。海産の巡航型捕食魚。
- 出典: Videler & Hess (1984) "Fast continuous swimming of two pelagic predators, saithe (Pollachius virens) and mackerel (Scomber scombrus): a kinematic analysis", J. Exp. Biol. 109:209–228。https://journals.biologists.com/jeb/article/109/1/209/4156/Fast-Continuous-Swimming-of-Two-Pelagic-Predators ／ 書誌: https://fishbase.mnhn.fr/references/FBRefSummary.php?id=500
- 証拠: [A] "The speed range of mackerel was twice as fast as that of saithe ... greater tail amplitude ... stronger curvature near the caudal peduncle in mackerel"

### F-02
- 主張/値: サイスの振幅包絡: 頭から0.1 L に最小があり、そこから尾端の最大までほぼ直線的に増える。定常遊泳するサイスの局所振幅は A(0)=0.02、A(0.2)=0.01、A(1.0)=0.10（L=体長）。
  - **算出（本書）**: 3点を通る二次式は A(x) = 0.02 − 0.0825x + 0.1625x²。最小は x = 0.254、A ≈ 0.0096。A(0.1)≈0.0134。頭/尾 = 0.2。要約本文の「最小は0.1 L、ほぼ直線的」とは一致しない。3点値は補間であり、論文の当てはめ式そのものではない。
  - 単位・定義（片振幅か peak-to-peak か、体長が全長か）は要約に無い。もし 0.10 L が片振幅なら peak-to-peak は 0.20 L となる（仮定）。
- 適用範囲: PROXY:サイス。
- 出典: 検索結果の要約は、同一クエリの結果群（Videler & Hess 1984 の上記ページ、および Large-amplitude undulatory fish swimming: fluid mechanics coupled to internal mechanics, J. Exp. Biol. 202:3431 = https://journals.biologists.com/jeb/article/202/23/3431/8338/Large-amplitude-undulatory-fish-swimming-fluid）のどれの記述かを特定していない。
- 証拠: [A（出典文書の特定は不確実）] "minimum at a distance 0.1L from the snout tip and increases ... almost linearly to a maximum amplitude at the tail tip ... A(0) = 0.02, A(0.2) = 0.01, and A(1.0) = 0.10"

### F-03
- 主張/値: サイスの定常遊泳中、体に現れる波の波長は 0.59 L〜1.54 L の間で変動し、典型は体長1本分（1 L）。
- 適用範囲: PROXY:サイス。
- 出典: F-02 と同じ検索結果群（特定不能）。
- 証拠: [A（出典文書の特定は不確実）] "wavelength ... varies between 0.59L and 1.54L ... A typical wavelength is equal to 1 body length"

### F-04
- 主張/値: Di Santo ら (2021) は44種の体・尾鰭（BCF）推進魚を比較し、定常遊泳の振幅包絡が二次多項式で記述できることを示した（個体の90%、別の要約では92%）。統一モデルは A(x) = A1·(a2·x² + a1·x + a0)/Σai（A1=尾端振幅）で、全種の振幅変動の60%を説明する。多項式係数は遊泳モード（ウナギ型〜マグロ型）で分離せず連続体を成し、線形項と二次項に強い負の相関（r = −0.89, P < 0.001）。
- 適用範囲: 44種の多種比較（サケ科を含むかは要約に無い）。係数は未取得。
- 出典: Di Santo, Goerig, Wainwright, Akanyeti, Liao, Castro-Santos, Lauder (2021) "Convergence of undulatory swimming kinematics across a diversity of fishes", PNAS 118(49):e2113206118。https://www.pnas.org/doi/10.1073/pnas.2113206118 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC8670443/ ／ https://sites.harvard.edu/glauder/files/2022/02/DiSanto.Goerig.etal_.megakinematics.ALL_.2021.pdf ／ https://www.usgs.gov/publications/convergence-undulatory-swimming-kinematics-across-diversity-fishes
- 証拠: [A] "amplitude envelope ... second-degree polynomial ... strong negative correlation between the linear and quadratic terms (r = −0.89)"

### F-05
- 主張/値: Di Santo ら (2021): 推進波の波長は、ウナギ型に分類される種で短く、マグロ型で長いが、種内・種間のばらつきが大きい。頭/尾の振幅比は、ウナギ型からマグロ型へ向かって減るという従来の予想に反して、減少しなかった。ウナギとマグロのように形態が大きく違う種でも、2次元の体軸（midline）運動学は統計的に類似する。
- 適用範囲: 44種。ヤマメは未確認。サケ科は「準カランギフォーム」（F-34）だが、運動学は連続体で分類に依存しない、という結論。
- 出典: F-04 と同じ（https://www.oeb.harvard.edu/news/convergence-undulatory-swimming-movement-across-diversity-fishes も）。
- 証拠: [A] "no decrease in head:tail amplitude from the anguilliform to thunniform mode of locomotion as expected from the traditional classification"

### F-06
- 主張/値: Webb, Kostecki & Stevens (1984): ニジマス（全長5.5〜56.0 cm）で、定速遊泳中の尾鰭後縁の振動数 f、振幅 a、深さ d と、推進波の長さ λ を測定（16 mm 映画フィルム、水槽での段階的流速増加）。結果: **λ は遊泳速度に独立で、小型魚ほど相対的に長い。f は魚の体長と遊泳速度の両方に依存する。a は速度に独立で、大型魚ほど相対的に小さい。d は速度に独立で、大型魚ほど相対的に大きい。** 回帰式の係数は要約に無い。
- 適用範囲: ニジマス（PROXY）。全長5.5〜56.0 cm。
- 出典: Webb, Kostecki & Stevens (1984) "The effect of size and swimming speed on locomotor kinematics of rainbow trout", J. Exp. Biol. 109:77–95。https://journals.biologists.com/jeb/article/109/1/77/4184/The-Effect-of-Size-and-Swimming-Speed-on-Locomotor ／ https://cob.silverchair.com/jeb/article-pdf/109/1/77/2431967/jexbio_109_1_77.pdf
- 証拠: [A] "Wavelength was independent of swimming velocity ... Tail beat frequency was related to both fish length and swimming velocity, amplitude was independent of velocity but relatively smaller in larger fish"

### F-07
- 主張/値: ニジマス（generalist cruiser）とタイガーマスキー（待ち伏せ加速型）の定常遊泳（最大85 cm/s）の比較: マスキーの尾鰭振動数はどの速度でもトラウトより約2 Hz 高く、尾鰭振幅は 0.04 L 小さい。両者の積（f×a）はほぼ同じ。推進波の長さは速度に独立で、マスキー 0.8 L、**ニジマス 0.9 L**。
- 適用範囲: ニジマス（PROXY）。サイズは要約に無い。
- 出典: Webb (1988) 'Steady' swimming kinematics of tiger musky, an esociform accelerator, and rainbow trout, a generalist cruiser, J. Exp. Biol. 138:51–。https://journals.biologists.com/jeb/article/138/1/51/5554/Steady-Swimming-Kinematics-of-Tiger-Musky-an（著者名・年は検索要約に無く、私の記憶による補記。巻号は URL に基づく。）
- 証拠: [A] "The length of the propulsive wave was independent of speed, and was 0.8L for musky, somewhat smaller than the value for trout, 0.9L."

### F-08
- 主張/値: Bainbridge (1958): ダス（dace）、ニジマス、キンギョ（体長30 cm 以下）の連続遊泳を記録。同じ尾鰭振動数での速度は魚の体長に直接比例する。別の要約（学会要旨）は、ニジマス・ダス・キンギョ・タラ・イルカなど多くの魚で、巡航中の尾鰭振幅は一定で、速度は尾鰭振動数と線形に相関する、と述べる。
- 適用範囲: ニジマス、ダス、キンギョ（体長30 cm 以下）。ヤマメへの適用は未確認。
- 出典: Bainbridge (1958) J. Exp. Biol. 35（頁は §3-4）。書誌: https://www.umesc.usgs.gov/data_library/fisheries/fish_passage/bainbridge.html ／ https://www.fishbase.se/references/FBRefSummary.php?id=3499 ／ 学会要旨: https://sicb.org/abstracts/revisiting-the-relationship-between-tail-beat-frequency-amplitude-and-speed-in-swimming-fishes/
- 証拠: [B] "Speed at any particular frequency of tail beat is shown to be directly related to the length of the specimen" ／ "constant tail-beat amplitude during cruise ... speed ... correlated linearly with ... tail-beat frequency"

### F-09
- 主張/値: 一般スケーリングとして、尾鰭振幅は A ≃ 0.2 L（オタマジャクシ〜クジラ）。ニジマスのバースト遊泳中は 0.17 L（要約の表記は 0.17±0.1 L で、±0.1 は大きすぎる印象があり未確認）で一定、尾鰭振動数は平均速度に線形に増加。
- 適用範囲: 多種（一般則）。ニジマスのバースト遊泳。振幅の定義（片振幅／peak-to-peak）は要約に無い。
- 出典: 要約は複数文書の混合で、どの文書の記述か特定不能。候補（結果に出たもの）: https://pmc.ncbi.nlm.nih.gov/articles/PMC10492801/ ／ https://arxiv.org/pdf/2002.09176 ／ https://sicb.org/abstracts/kinematic-analysis-of-burst-and-coast-swimming-in-rainbow-trout/
- 証拠: [B] "Tail beat amplitude follows A ≃ 0.2L ... in rainbow trout during burst swimming, tail beat amplitude remained constant at 0.17±0.1 L"

### F-10
- 主張/値: **ヤマメ稚魚の尾部の動き**（Izumi & Kato 2012）。野外の魚道地点にスタミナトンネルを設置し、断面平均流速 48〜137 cm/s の河川水を流して、全長4.4〜8.8 cm（体長3.7〜7.5 cm）の稚魚を遊泳させ、高速度カメラで尾鰭の動きを解析。**振幅と全長の比は、尾鰭の振動数や遊泳速度が増加してもほぼ一定で 0.12**。稚魚は尾鰭を **1秒間に 20.8〜39.1 回**振って泳ぎ、高振動数域でも遊泳速度と振動数の間に比例関係が認められ、遊泳速度と尾鰭振動数の実験式が得られた。**式、振幅の定義（片振幅か peak-to-peak か）、速度と振動数の組は要約に無い**。
- 適用範囲: ヤマメ（Oncorhynchus masou masou）稚魚。放流用稚魚と推定されるが要約に由来は無い。全長4.4〜8.8 cm。高流速域（体長比で約 6〜37 BL/s、算出）。成魚には適用不可。
- 出典: 泉完・加藤幸（検索要約の著者表記）「河川水を用いたヤマメ稚魚の尾部の動きと遊泳速度」農業農村工学会論文集 80(2):177–。https://www.jstage.jst.go.jp/article/jsidre/80/2/80_177/_article/-char/ja/ （要約の一つは掲載誌を「日本農業土木学会誌」と書くが、URL の jsidre は農業農村工学会論文集。§3-10）
- 証拠: [A] "振幅と全長との比は尾ひれの振動数や遊泳速度が増加してもほぼ一定でその値は0.12 ... 尾ひれを1秒間に20.8～39.1回振って泳ぎ"

### F-11
- 主張/値: **ヤマメ稚魚の臨界遊泳速度**（Izumi & Kato 2011）。幅15 cm × 高さ15 cm × 長さ100 cm の小型水路に断面平均流速 17〜92 cm/s の河川水を流し、体長 4.8〜7.1 cm の稚魚を遊泳させた。水温 13.7〜20.6 ℃。**推定された60分間臨界遊泳速度は 16〜41 cm/s で、体長との間に正の相関**。体長の倍数では **3.5〜6.9 倍（平均5.5、標準偏差1.1）**。水温の違いによる影響は小さいと推察された。
- 適用範囲: ヤマメ稚魚（体長4.8〜7.1 cm）。実験場所は岩木川取水堰（青森県と推定されるが要約は「岩木川取水堰」とのみ）。成魚には適用不可。60分臨界遊泳速度は推定値で、Brett の古典的 Ucrit とは手順が異なる可能性がある（要約に手順の記載なし）。
- 出典: 泉完・加藤幸「河川水を用いたヤマメ稚魚の臨界遊泳速度に関する実験」農業農村工学会論文集 79(3):151–（2011年6月）。https://www.jstage.jst.go.jp/article/jsidre/79/3/79_151/_article/-char/ja/ ／ https://ndlsearch.ndl.go.jp/books/R000000004-I11166922
- 証拠: [A] "推定された60分間臨界遊泳速度は16～41cm/sで、体長との間に正の相関 ... 3.5～6.9倍（平均5.5、標準偏差1.1）"

### F-12
- 主張/値: 他のサケ科の臨界遊泳速度（BL/s）: コホ（O. kisutch）は稚魚から前期スモルトまでで、稚魚の最大 7.3 L/s からスモルトの 5.5 L/s まで変化し、稚魚・後期稚魚・スモルト前段階はスモルトより高い。大西洋サケ（Salmo salar）は低温順化で 8 ℃: 2.08、4 ℃: 1.69、1 ℃: 1.27、8→1 ℃: 1.44 BL/s。
- 適用範囲: PROXY:O. kisutch（稚魚〜スモルト、塩分・水温の実験）、S. salar（低温実験。サイズは要約に無い）。
- 出典: Glova & McInerney (1977)（著者名は私の記憶。検索結果の題は "Critical Swimming Speeds of Coho Salmon (Oncorhynchus kisutch) Fry to Smolt Stages in Relation to Salinity and Temperature"）https://cdnsciencepub.com/doi/10.1139/f77-021 ／ "Cardiorespiratory physiology and swimming capacity of Atlantic salmon (Salmo salar) at cold temperatures", J. Exp. Biol. 226(17):jeb245990。https://journals.biologists.com/jeb/article/226/17/jeb245990/327617/Cardiorespiratory-physiology-and-swimming-capacity ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10499030/
- 証拠: [A] "varying from a peak of 7.3 L/s in fry to 5.5 L/s in smolts" ／ "Ucrit was 2.08 and 1.69 body lengths (BL) s−1 in the 8 and 4°C-acclimated groups, but only 1.27 and 1.44 BL s−1 in the 1°C-acclimated and 8–1°C fish"

### F-13
- 主張/値: 大西洋サケの Ucrit は温度に対して山形で、18 ℃で最大（93.1±1.2 cm/s）、3 ℃で 74.8±0.5 cm/s、23 ℃で 84.8±1.6 cm/s に低下した。
- 適用範囲: PROXY:S. salar。魚のサイズは要約に無い。
- 出典: "The effect of thermal acclimation on aerobic scope and critical swimming speed in Atlantic salmon, Salmo salar", J. Exp. Biol. 220(15):2757。https://journals.biologists.com/jeb/article/220/15/2757/17866/The-effect-of-thermal-acclimation-on-aerobic-scope
- 証拠: [A] "Critical swimming speed peaked at 18°C (93.1±1.2 cm s−1), and decreased significantly at the extreme temperatures to 74.8±0.5 and 84.8±1.6 cm s−1 at 3 and 23°C"

### F-14
- 主張/値: 日本の魚道設計の資料（国交省北海道開発局の分流資料）の要約: 遊泳速度には瞬発速度（突進速度）と巡航速度があり、**瞬発速度は通常体長の10倍程度、巡航速度は体長の2〜3倍**が一般的。堰横魚道では隔壁越流部の最大流速が突進速度程度、高水敷魚道では水路横断面の流れが巡航速度（長時間遊泳可能な速度）以下であることが求められる。最小水深は10 cm 以上。
- 適用範囲: 日本の魚道設計。小型淡水魚一般（特定魚種は要約に無い）。ヤマメの値は無い。
- 出典: 国土交通省北海道開発局の資料 "13. 遊泳速度と必要水深"（分流資料13）。https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000054w7-att/bunryu-shiryo-13.pdf ／ https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000055vu-att/bunryu-shiryo-13.pdf
- 証拠: [B] "瞬発速度は通常体長の10倍程度、巡航速度は体長の2-3倍が一般的"（検索要約）

### F-15
- 主張/値: 土木学会論文集（1999, No. 622）「魚道の設計に資する淡水魚類の耐久遊泳速度」の要約: 水温12〜13 ℃以上における成魚の耐久遊泳速度（60分）は、**イワナとウグイが85 cm/s、コイが70 cm/s、キンブナ・ギンブナとオイカワが65 cm/s、カワムツが55 cm/s** 程度。ヤマメの成魚の値は要約に無い。
- 適用範囲: 日本の淡水魚の成魚。イワナ（Salvelinus leucomaenis）はサケ科の近縁（PROXY:イワナ）。体長の範囲は要約に無い。
- 出典: https://www.jstage.jst.go.jp/article/jscej1984/1999/622/1999_622_107/_article/-char/ja/ （著者名は検索要約が「鈴木興道」と書くが未確認）
- 証拠: [A] "水温12～13℃以上における成魚の耐久遊泳速度（60分）は、イワナとウグイが85cm/s ..."（検索要約）

### F-16
- 主張/値: サケ科やサバ科の魚類は 10 BL/s を超える突進速度を発揮する。サケ科の耐久（持続）速度は 3〜4 BL/s。大型のサケ類の魚道設計の目安は、突進速度 10 BL/s、巡航速度 3〜4 BL/s、最小幅は 1/2·BL 以上。
- 適用範囲: サケ科一般（大型のサケ類）。ヤマメ・サクラマス固有の値ではない。
- 出典: 検索結果群（国会図書館リサーチ・ナビ「魚の泳ぐ速度（遊泳速度）」https://rnavi.ndl.go.jp/research_guide/entry/theme-honbun-400314.php、塚本勝巳「魚類の遊泳運動」https://www.jstage.jst.go.jp/article/hikakuseiriseika1990/10/4/10_4_249/_pdf、「魚類の遊泳速度と遊泳能力」https://www.jstage.jst.go.jp/article/fishengold/10/1/10_31/_pdf、F-14 の国交省資料）の要約で、**どの文書の記述かは特定できない**。
- 証拠: [B] "サケ科やサバ科の魚類は10BL/sをこえる値の突進速度 ... サケ科の魚類では3-4BL/sの耐久速度"（検索要約）

### F-17
- 主張/値: Drucker & Lauder (2003): ニジマスは 0.5 と 1.0 BL/s の定速遊泳中、胸鰭を体側に畳んだままにする。胸鰭は、定位（station holding、止水中のホバリング）や低速時の操縦（旋回、制動など）で能動的に使われる。BCF 魚の中には、比較的高速でも尾鰭と胸鰭を併用する種がある。別研究では、胸鰭から尾鰭に切り替わる歩容転換速度は、尾鰭を推進に使い始める速度と定義されるが、多くの魚は純粋な胸鰭推進から純粋な尾鰭推進へ完全には移らない。**転換速度の数値は未取得**。
- 適用範囲: ニジマス（PROXY）。
- 出典: Drucker & Lauder (2003) "Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces", J. Exp. Biol. 206:813–826。https://journals.biologists.com/jeb/article/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout
- 証拠: [A] "during constant-speed swimming at 0.5 and 1.0 body lengths per second, the pectoral fins remain adducted against the body"（検索要約）

### F-18
- 主張/値: Liao, Beal, Lauder & Triantafyllou (2003): ニジマスの Kármán gait は、渦列の中での新しい体運動。**自由流の遊泳と比べ、体の振幅と体波長が大きく、尾鰭振動数は渦放出周波数に一致して、自由流より有意に低い**。ニジマスは渦の波長より長い体波長を使う。尾端振幅は自由流の約3倍（後続研究）。
- 適用範囲: ニジマス（PROXY）。円柱後流の水槽実験。自然河川への外挿は仮説。
- 出典: https://journals.biologists.com/jeb/article/206/6/1059/14048/The-Ka-rma-n-gait-novel-body-kinematics-of-rainbow ／ 振幅3倍は https://pmc.ncbi.nlm.nih.gov/articles/PMC11658682/ や https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/ の検索要約
- 証拠: [A] "Kármán gaiting fish had larger body amplitudes and body wavelength than free-stream swimming fish ... tail beat frequency, which matched the vortex shedding frequency, was significantly lower"

### F-19
- 主張/値: Akanyeti & Liao (2013a): Kármán gait の出現確率は流速 30〜70 cm/s で最大。尾鰭振動数は測定した渦放出周波数に一致し、渦放出周波数は流速に線形に増える。**自由流と対照的に、Kármán gait の尾鰭振動数は体サイズに依存せず、渦放出周波数の関数**。ニジマスは円柱後流で、速度欠損が公称流速の約40%の領域で Kármán gait を使う。Kármán gait の体の尾鰭振幅は体サイズとともに増える。大きい魚ほど体波長が短く波速が遅い（自由流では体サイズとともに波長・波速が増える）。
- 適用範囲: ニジマス（PROXY）。
- 出典: Akanyeti & Liao (2013) "The effect of flow speed and body size on Kármán gait kinematics in rainbow trout", J. Exp. Biol. 216(18):3442–3449。https://journals.biologists.com/jeb/article/216/18/3442/11608/The-effect-of-flow-speed-and-body-size-on-Karman ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/ ／ https://research.aber.ac.uk/en/publications/the-effect-of-flow-speed-and-body-size-on-k%C3%A1rm%C3%A1n-gait-kinematics-/
- 証拠: [A] "tail-beat frequency for Kármán gaiting fish did not depend on body size and was a function of the vortex shedding frequency" ／ "velocity deficit is about 40% of the nominal flow"

### F-20
- 主張/値: Akanyeti & Liao (2013b): Kármán gait の体軸運動学を解析式で表した最初のモデル。体の曲げは進行波の式で、振幅・波長・振動数は自由流とは大きく異なる。**振幅包絡（各点の peak-to-peak 振幅）は尾に向かって非線形に増え、進行波は体の後方で一定速度で進む。Kármán gait では波の開始点が、自由流の開始点より 0.2 L 体の後方になる。** モデルのパラメータ値は要約に無い。
- 適用範囲: ニジマス（PROXY）。
- 出典: "A kinematic model of Kármán gaiting in rainbow trout", J. Exp. Biol. 216(24):4666。https://journals.biologists.com/jeb/article/216/24/4666/11863/A-kinematic-model-of-Karman-gaiting-in-rainbow
- 証拠: [A] "The amplitude envelope (peak-to-peak amplitude ...) increases non-linearly towards the tail ... the wave is initiated at the body center, which is 0.2L ... further down the body"

### F-21
- 主張/値: Kármán gait を同定する5つの基準: (1) 魚が定位し、上流や下流へ流されない、(2) 体に進行波がある、(3) 体の側方変位が大きい（> 1/2 L）、(4) 体波長が長い（> 1 L）、(5) 一過性の小振幅・高周波の尾鰭振動がない。
- 適用範囲: ニジマス（PROXY）。
- 出典: F-19 の PMC3749907 等の検索要約。総説: https://pmc.ncbi.nlm.nih.gov/articles/PMC6324577/
- 証拠: [A] "the body displays a large lateral displacement (>½ L), ... the body posture adopts a long wavelength (>1 L)"

### F-22
- 主張/値: Przybilla ら (2010): ニジマスの entraining（円柱の側方の速度勾配の大きい吸引域）の行動・流体解析。entraining する魚は**体をリズミカルに波打たせず、体をまっすぐ、流れに対して角度を付けて保持し、擾乱は鰭で補正**する（自己が作る流体ノイズの最小化の可能性）。円柱の前（bow wake）で泳ぐ魚は、他の条件より尾鰭振幅と体波速度が低い。実験の時間配分: 円柱の右側で entraining 13.6%、左側 14.2%、bow wake 域 28.3%。円柱があるときに entraining が最も省エネ。
- 適用範囲: ニジマス（PROXY）。D 形円柱または丸い前縁の半無限平板。
- 出典: Przybilla, Kunze, Rudert, Schuster & Brücker (2010) "Entraining in trout: a behavioural and hydrodynamic analysis", J. Exp. Biol. 213(17):2976–2986。https://journals.biologists.com/jeb/article/213/17/2976/9891/Entraining-in-trout-a-behavioural-and-hydrodynamic
- 証拠: [A] "When entraining, trout show no rhythmic body undulations, holding the body straight and at an angle" ／ "lower tail-beat amplitudes and body wave speeds" in front of a cylinder

### F-23
- 主張/値: ニジマスのバースト＆コースト遊泳の運動学（学会要旨）。バースト中の尾鰭振幅は一定（F-09）、尾鰭振動数は平均速度に線形に増える。
- 適用範囲: ニジマス（PROXY）。要旨のみで数値の詳細は無い。
- 出典: https://sicb.org/abstracts/kinematic-analysis-of-burst-and-coast-swimming-in-rainbow-trout/ ／ https://arxiv.org/pdf/2002.09176
- 証拠: [B] "during bursting in rainbow trout, tail beat frequency increased linearly with the average swimming speed"（検索要約）

### F-24
- 主張/値: （継承: r02 F-20）ブラウントラウト1歳・2歳の幼魚で、体型が細長い形から体高の高い形へ個体発生的に変わる。より流線形の体型は最大代謝率が高く、持続遊泳能力に影響する。
- 適用範囲: PROXY:Salmo trutta。
- 出典: Sánchez-González J.-R., Nicieza A.G. (2023) Current Zoology 69(3):294-303。https://portalinvestigacion.uniovi.es/documentos/64b4eec52107cd1e6d71b7fe（r02 F-20 の記録による。再確認していない）
- 証拠: [A（継承）] "a more streamlined body shape displayed higher maximum metabolic rates than a deep-bodied shape at both intraspecific and interspecific levels"

### F-25（M・未検証）ストローハル数
- 主張/値: St = f·A/U（A=尾端の peak-to-peak 振幅）は、巡航する魚・鳥・コウモリ・クジラ類で 0.2〜0.4（多くは 0.25〜0.35）。
- 適用範囲: 巡航中の動物一般（PROXY）。
- 出典: Taylor, Nudds & Thomas (2003) Nature 425:707–711／Triantafyllou et al. (1993) J. Fluids Struct. 7:205–224（書誌は記憶。URL 未取得）。今回の検索結果に "Optimal Strouhal number for swimming animals"（arxiv 1102.0223）が出たが内容は未確認。
- 証拠: [M] 確信度: 中。検索で裏付けられていない。

### F-26（M・未検証）波速比とスリップ
- 主張/値: 推力を得るには推進波の速度 V が遊泳速度 U を超える必要がある（Lighthill）。V/U は1.1〜1.4前後という記憶。ニジマスでの実測値は未取得。
- 出典: Lighthill (1960) J. Fluid Mech. 9:305–317／Lauder & Tytell (2006) Fish Physiology 23（記憶。URL 未取得）。
- 証拠: [M] 確信度: 条件（V>U）は高、数値は低。F-20 は Kármán gait の後半部で波速が一定と述べるのみ。

### F-27（M・算出）ストライド長と f–U の暫定式
- 主張/値: 初版の算出: ストライド長 U/(f·L) ≈ 0.6〜0.8 とすると f ≈ 1.4×(U/L) Hz。**今回の検索で独立の裏付けは得られなかった。** 弱い整合性のみ: ヤマメ稚魚の体長3.7〜7.5 cm、流速48〜137 cm/s からの U/BL は約 6〜37 BL/s で、この式は約 9〜52 Hz を与え、観測された 20.8〜39.1 Hz（F-10）を含む。ただし速度と振動数の組が不明で、検証にはならない。
- 証拠: [M] 確信度: 低。U→0 への外挿は禁止。

### F-28（M）Beamish の持久区分
- 主張/値: sustained（約200分超）、prolonged（約20秒〜200分）、burst（約20秒未満）。日本語の巡航速度・突進速度との対応は F-14・F-16 で緩く裏付けられるが、時間基準の対応は未確認。
- 出典: Beamish (1978) Fish Physiology 7:101–187（記憶）。
- 証拠: [M] 確信度: 区分は高、対応は低。

### F-29（M）バースト速度の体長依存
- 主張/値: Wardle (1975): 魚の最大遊泳速度は筋収縮速度で制限され、体が大きいほど BL/s としての最大は下がる。Weihs (1974) はバースト＆コーストの省エネ性を解析。
- 出典: Wardle (1975) Nature 255:725–727／Weihs (1974) J. Theor. Biol. 48:215–229（記憶）。
- 証拠: [M] 確信度: 方向は中。F-16 の「突進 10 BL/s」は日本語資料で B ランクの裏付けあり。

### F-30（M）運動学の駆動量は対水速度
- 主張/値: 筋力が出す推力は対水速度で決まる。流速 v の流れで定位する魚は、対地速度0でも対水速度 v で泳ぐ。流下する魚は対水速度が小さく、尾の振動は小さくなる。ただし Kármán gait（F-18, F-19）では、局所流速（速度欠損約40%）以上に振動数が低く、渦放出周波数に支配される。entraining（F-22）では体波が止まる。したがって「対水速度のみ」で駆動する実装は、渦・弓波の領域では修正が必要。
- 出典: 流体力学の一般原理。
- 証拠: [M] 確信度: 原理は高。

### F-31（M）頭部の反動
- 主張/値: 頭部には尾の動きと逆位相の小さな側方運動とヨーがある（Lighthill 1960, 1971）。大きさは未取得。F-02 のサイス A(0)=0.02 L は、頭部運動の存在を支持する（定義未確認）。
- 証拠: [M]（存在は F-02 により部分的に A）

### F-32（M）胸鰭の負の揚力
- 主張/値: 大西洋サケのパーは、胸鰭で体を河床へ押し付けて定位する（Arnold, Webb & Holford 1991, J. Exp. Biol. 156:625–629）。ヤマメのパーへの適用は未確認。
- 証拠: [M] 確信度: 中。

### F-33（M）円柱の渦放出
- 主張/値: 円柱後流の渦放出周波数 f_shed ≈ St_c·U/D、St_c≈0.2。F-25 の遊泳 St とは別の量。Kármán gait の尾鰭振動数はこの f_shed に一致する（F-19）。
- 証拠: [M] 確信度: St_c は高。

### F-34（M）遊泳様式の分類
- 主張/値: サケ科は準カランギフォーム（subcarangiform）。ただし F-05 は、従来の遊泳モード分類は運動学を正確に表さず、魚種は連続体上にある、と結論する。したがって分類名は設計の根拠にならない。
- 出典: Breder (1926)／Lindsey (1978)（記憶）。
- 証拠: [M]

---

## 3. 資料間の矛盾・不一致

1. **尾端振幅の定義と値**: ヤマメ稚魚 0.12（振幅/全長、F-10）、ニジマスのバースト 0.17 L、一般則 0.2 L（F-09）。さらに Webb 1984 は「振幅は大型魚ほど相対的に小さい」（F-06）。ヤマメ稚魚（4〜9 cm）は小型なので、小型ほど相対的に大きい傾向なら 0.2 L より大きいはずだが、実測は 0.12 と小さい。**振幅が片振幅か peak-to-peak か、体長が全長か尾叉長か、が資料間で未確認のため、差を解消できない。**
2. **サイス包絡の形**: 要約は「最小は頭から0.1 L、尾端までほぼ直線的」と書くが、同じ要約の3点値（0.02, 0.01, 0.10）を通る二次式は最小が x≈0.25 L で、直線的でもない（F-02）。どちらかが要約の誤り、または文書の混在の可能性がある。
3. **二次多項式の当てはめ率**: Di Santo の要約が「90%」と「92%」の2表記を出した（F-04）。原文確認が必要。
4. **Bainbridge (1958) の頁**: 初版の記憶は 35:109–133、検索要約（FishBase 系）は 35:129-153。**どちらが正しいか未確認。**
5. **BL/s の臨界遊泳速度**: ヤマメ稚魚 3.5〜6.9 BL/s（F-11）、コホ 5.5〜7.3 L/s（F-12）、低温の大西洋サケ 1.3〜2.1 BL/s（F-12）、日本の資料の「サケ科の耐久 3〜4 BL/s」（F-16）、初版の記憶「2〜5 BL/s」。**体のサイズ、水温、手順（60分推定 vs 段階的流速増加）、全長か体長か**の違いで説明できるが、成魚のヤマメには直接の値が無い。
6. **巡航速度**: 国交省資料の要約は「体長の2〜3倍」（小型淡水魚一般、F-14）、別の要約は「大型のサケ類は3〜4 BL/s」（F-16）。魚種・サイズの違い。
7. **Entraining の場所**: 初版（M）は「障害物前面の高圧域で尾振りが止まる」と書いたが、Przybilla 2010（F-22）では entraining は円柱の側方・下流の吸引域で体波が止まり、前面の bow wake では尾鰭振幅と波速が「低い」（ゼロではない）。**初版の記述を訂正した。**
8. **Kármán gait の体波長とサイズ**: Akanyeti & Liao (2013a) は「Kármán gait では大型魚ほど体波長が短い」、自由流では「体サイズとともに体波長・波速が増える」と書く（F-19）。一方 Webb 1984 は、自由流の λ/L は小型魚ほど相対的に長い（F-06）。絶対値（cm）と相対値（L 比）の混同に注意。
9. **自由流のニジマスの値の混入**: 検索要約の一つは「自由流: 尾鰭振動数 2.5±0.1 Hz、体波長 0.9±0.4 cm、尾鰭振幅 0.18±0.05 cm」と書くが、波長・振幅の単位（cm）が体長比（L）の誤記と思われ、不整合。**採用しない。** 同様に、ある要約の「尾鰭振幅は 0.04 L に比例」は、Webb 1988 の「マスキーは 0.04 L 小さい」（F-07）の誤読と思われ、採用しない。
10. **ヤマメ稚魚の尾鰭論文の掲載誌**: 要約の一つが「日本農業土木学会誌」、別が「農業農村工学会論文集」。URL（jsidre）は後者。

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル／アニメ／行動実装に必要だが確認できなかった事項

1. **振幅包絡の係数**（Di Santo の a0, a1, a2、またはニジマスの値）。要約は関数形と統計量のみ。PMC8670443 または Harvard の PDF の本文・図表が必要（検索では読めない）。
2. **振幅の定義**（片振幅か peak-to-peak か）と、頭部ヨー・頭部側方振幅の数値（ニジマス／サケ科）。
3. **ニジマスの f–U 関係の式**（Webb 1984 の回帰式）、BL/s 単位での f の値（1, 2, 3 BL/s など）。Izumi & Kato (2012) の実験式も未取得。
4. **波速比 V/U、スリップ、ストライド長、ストローハル数のサケ科実測値**（M のまま）。
5. **ヤマメ／サクラマス成魚の遊泳キネマティクスと遊泳能力**: 巡航・突進・臨界遊泳速度の BL/s と cm/s、体長15〜30 cm 級の値。稚魚（F-10, F-11）とイワナ成魚（F-15）、一般的なサケ科の目安（F-16）しかない。
6. **歩容転換速度**（胸鰭のみ → 胸鰭＋尾鰭 → 尾鰭）の BL/s。Drucker & Lauder は 0.5〜1.0 BL/s で胸鰭を畳むとのみ（F-17）。
7. **温度依存性の定量式**（振動数の上限・振幅）。Ucrit の山形の温度依存（F-13）のみ。
8. **サケ科の Kármán gait／entraining 時の体波パラメータの数値**（振幅の絶対値、波長 > 1 L の実値、波速）。Kármán gait の判定基準は取得（F-21）。
9. **ヤマメの魚道設計基準（体長別の突進速度・巡航速度・許容流速）**: 日本の資料の一般的な目安のみ（F-14〜F-16）。「最新・魚道の設計」等の原典は未確認。
10. **バースト／加速／旋回／C-start／摂餌攻撃の運動学**（r09 が担当）との接続。バースト＆コーストの数値（F-23）は要旨のみ。
11. **尾鰭自体の変形**（フォークの開閉、鰭条の曲げ）、背鰭・臀鰭・脂鰭の定常遊泳中の動き。
12. 実写動画からの中心線計測（映像の入手経路なし）。写真70枚（P）は静止画で、運動学の情報は無い。

---

## 5. 出典一覧（URL付き、重複排除。すべて今回の検索結果に出たもの）

**サイス・サバ（PROXY）**
- Videler & Hess (1984) J. Exp. Biol. 109:209 — https://journals.biologists.com/jeb/article/109/1/209/4156/Fast-Continuous-Swimming-of-Two-Pelagic-Predators ／ 書誌 https://fishbase.mnhn.fr/references/FBRefSummary.php?id=500
- Large-amplitude undulatory fish swimming: fluid mechanics coupled to internal mechanics, J. Exp. Biol. 202:3431 — https://journals.biologists.com/jeb/article/202/23/3431/8338/Large-amplitude-undulatory-fish-swimming-fluid

**多種・ニジマス**
- Di Santo et al. (2021) PNAS — https://www.pnas.org/doi/10.1073/pnas.2113206118 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC8670443/ ／ https://sites.harvard.edu/glauder/files/2022/02/DiSanto.Goerig.etal_.megakinematics.ALL_.2021.pdf ／ https://www.usgs.gov/publications/convergence-undulatory-swimming-kinematics-across-diversity-fishes ／ https://www.oeb.harvard.edu/news/convergence-undulatory-swimming-movement-across-diversity-fishes
- Webb, Kostecki & Stevens (1984) J. Exp. Biol. 109:77 — https://journals.biologists.com/jeb/article/109/1/77/4184/The-Effect-of-Size-and-Swimming-Speed-on-Locomotor ／ https://cob.silverchair.com/jeb/article-pdf/109/1/77/2431967/jexbio_109_1_77.pdf
- Tiger musky vs rainbow trout, J. Exp. Biol. 138:51 — https://journals.biologists.com/jeb/article/138/1/51/5554/Steady-Swimming-Kinematics-of-Tiger-Musky-an
- Bainbridge (1958) — https://www.umesc.usgs.gov/data_library/fisheries/fish_passage/bainbridge.html ／ https://www.fishbase.se/references/FBRefSummary.php?id=3499
- 学会要旨 — https://sicb.org/abstracts/revisiting-the-relationship-between-tail-beat-frequency-amplitude-and-speed-in-swimming-fishes/ ／ https://sicb.org/abstracts/kinematic-analysis-of-burst-and-coast-swimming-in-rainbow-trout/
- 一般則の候補 — https://pmc.ncbi.nlm.nih.gov/articles/PMC10492801/ ／ https://arxiv.org/pdf/2002.09176
- Drucker & Lauder (2003) — https://journals.biologists.com/jeb/article/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout
- Liao et al. (2003) Kármán gait — https://journals.biologists.com/jeb/article/206/6/1059/14048/The-Ka-rma-n-gait-novel-body-kinematics-of-rainbow
- Akanyeti & Liao (2013a) — https://journals.biologists.com/jeb/article/216/18/3442/11608/The-effect-of-flow-speed-and-body-size-on-Karman ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/ ／ https://research.aber.ac.uk/en/publications/the-effect-of-flow-speed-and-body-size-on-k%C3%A1rm%C3%A1n-gait-kinematics-/
- Akanyeti & Liao (2013b) — https://journals.biologists.com/jeb/article/216/24/4666/11863/A-kinematic-model-of-Karman-gaiting-in-rainbow
- Kármán 渦列の総説 — https://pmc.ncbi.nlm.nih.gov/articles/PMC6324577/ ／ 円柱列後流のニジマス https://pmc.ncbi.nlm.nih.gov/articles/PMC11658682/ ／ Liao (2007) 総説 https://pmc.ncbi.nlm.nih.gov/articles/PMC2442850/
- Przybilla et al. (2010) — https://journals.biologists.com/jeb/article/213/17/2976/9891/Entraining-in-trout-a-behavioural-and-hydrodynamic

**サケ科の臨界遊泳速度**
- コホ — https://cdnsciencepub.com/doi/10.1139/f77-021
- 大西洋サケ（低温）— https://journals.biologists.com/jeb/article/226/17/jeb245990/327617/Cardiorespiratory-physiology-and-swimming-capacity ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10499030/
- 大西洋サケ（温度順化）— https://journals.biologists.com/jeb/article/220/15/2757/17866/The-effect-of-thermal-acclimation-on-aerobic-scope

**日本語**
- ヤマメ稚魚の尾部の動き — https://www.jstage.jst.go.jp/article/jsidre/80/2/80_177/_article/-char/ja/
- ヤマメ稚魚の臨界遊泳速度 — https://www.jstage.jst.go.jp/article/jsidre/79/3/79_151/_article/-char/ja/ ／ https://ndlsearch.ndl.go.jp/books/R000000004-I11166922
- 淡水魚類の耐久遊泳速度 — https://www.jstage.jst.go.jp/article/jscej1984/1999/622/1999_622_107/_article/-char/ja/
- 国交省北海道開発局 遊泳速度と必要水深 — https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000054w7-att/bunryu-shiryo-13.pdf ／ https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000055vu-att/bunryu-shiryo-13.pdf
- 国立国会図書館 魚の泳ぐ速度 — https://rnavi.ndl.go.jp/research_guide/entry/theme-honbun-400314.php
- 塚本勝巳「魚類の遊泳運動」— https://www.jstage.jst.go.jp/article/hikakuseiriseika1990/10/4/10_4_249/_pdf
- 「魚類の遊泳速度と遊泳能力」— https://www.jstage.jst.go.jp/article/fishengold/10/1/10_31/_pdf

**継承（r02）**
- Sánchez-González & Nicieza (2023) — https://portalinvestigacion.uniovi.es/documentos/64b4eec52107cd1e6d71b7fe

**書誌のみ（M。URL 未取得、未検証）**: Breder 1926／Lindsey 1978／Lighthill 1960, 1971／Taylor, Nudds & Thomas 2003／Triantafyllou et al. 1993／Beamish 1978／Wardle 1975／Weihs 1974／Arnold, Webb & Holford 1991／Lauder & Tytell 2006／Videler 1993

---

## 6. 検索ログ（WebSearch 26回／割当26回。mode はすべて standard。extended は未使用）

| # | クエリ（要旨） | 絞り込みドメイン | 有用度 |
|---|---|---|---|
| 1 | Videler Hess 1984 fast continuous swimming saithe mackerel amplitude envelope | なし | 低（書誌のみ） |
| 2 | saithe mackerel amplitude of lateral movement increases towards tail, wavelength | JEB 系 | **高**（F-01〜F-03） |
| 3 | Webb Kostecki Stevens 1984 rainbow trout size speed locomotor kinematics | なし | 中（F-06、定性） |
| 4 | "total length from 5.5 to 56.0 cm" rainbow trout tail beat | JEB 系 | 低（#3 と重複） |
| 5 | Di Santo 2021 Convergence ... tail beat frequency body wavelength amplitude | なし | 中（F-04, F-05） |
| 6 | Di Santo Goerig megakinematics polynomial coefficients | harvard/pnas/pmc | 中（統計量） |
| 7 | Karman gait rainbow trout body wavelength amplitude tail beat frequency Liao 2003 | JEB/Science/harvard | **高**（F-18） |
| 8 | Akanyeti Liao effect of flow speed and body size on Kármán gait | JEB/aber/pubmed | **高**（F-19） |
| 9 | A kinematic model of Kármán gaiting in rainbow trout | JEB/pubmed/aber | **高**（F-20） |
| 10 | Bainbridge 1958 speed of swimming tail beat dace goldfish | なし | 中（F-08） |
| 11 | rainbow trout tail beat frequency increased linearly with speed | JEB/pmc/harvard | 低〜中 |
| 12 | Revisiting relationship between tail beat frequency, amplitude, speed | sicb/oup | 中（F-09, F-23） |
| 13 | Steady swimming kinematics tiger musky vs rainbow trout | JEB/pubmed/pmc | **高**（F-07、λ=0.9L） |
| 14 | ヤマメ 遊泳能力 巡航速度 突進速度 体長 魚道 設計 | なし | 中（F-14） |
| 15 | critical swimming speed Ucrit salmonids BL/s | pmc/JEB/cdnsciencepub/wiley | 中〜高（F-12, F-13） |
| 16 | ヤマメ 突進速度 cm/s 持続速度 巡航速度 遊泳試験 | jstage/nii/go.jp/lg.jp | **高**（ヤマメ論文2件発見） |
| 17 | Drucker Lauder gait transition pectoral caudal | JEB/pmc/oup/harvard | 中（F-17） |
| 18 | 河川水を用いたヤマメ稚魚の尾部の動きと遊泳速度 | jstage | **高**（F-10） |
| 19 | 河川水を用いたヤマメ稚魚の臨界遊泳速度に関する実験 | jstage/ndl | **高**（F-11） |
| 20 | ヤマメ稚魚 尾ひれ 振動数 実験式 | jstage/ndl/affrc/nii | 低（式は未取得） |
| 21 | 魚道の設計に資する淡水魚類の耐久遊泳速度 | jstage/nii/ndl | 中（F-15） |
| 22 | Kármán gaiting trout body wavelength amplitude (PMC) | pmc | **高**（F-21） |
| 23 | サケ科 突進速度 サクラマス サケ イワナ 魚道 設計 | jstage/mlit/go.jp/lg.jp/ac.jp | 中（F-16） |
| 24 | Di Santo unifying model head amplitude tail amplitude Strouhal | pmc/harvard/usgs | 低〜中（関数形のみ。結果が複数回の内部再検索を含んだ可能性あり） |
| 25 | freestream rainbow trout tail beat frequency 1,2,3 BL/s | pmc/JEB | 低（単位が崩れた要約、採用せず。§3-9） |
| 26 | Entraining in trout behavioural and hydrodynamic analysis | JEB/pmc/pubmed | **高**（F-22） |

- 総検索回数: **26**（extended は0回）。
- 予算超過・拒否の応答は無し。
- 次回の最優先（本文が読める環境で）: Di Santo 2021 の本文・補足（係数、頭/尾振幅比、波長、波速、St）、Webb 1984 の回帰式（f–U、a/L、λ/L）、Izumi & Kato 2012 の実験式、Akanyeti & Liao 2013 のモデルパラメータ。
