# r10_fins.md 独立検証（懐疑的レビュー）

- 検証対象: `/home/user/gerupamasini/docs/yamame/research/r10_fins.md`（元ファイルは未変更）
- 方法: 影響の大きい 10 主張を選び、元の調査員とは異なるクエリ（言語・言い回し・allowed_domains）で WebSearch を **11 回**（全て mode=standard、割当 11 回ちょうど。予算エラーは出なかった）実行。WebFetch は未使用。
- 制約: 検索結果は「タイトル・URL・モデルが作った要約」のみ。論文全文は読めていない。以下の判定は**要約文に書かれていた範囲**に限る。
- 判定の厳格さ: 同一論文のアブストラクトが別ホスト（ResearchGate、出版社サイト等）に出ただけでは「独立2資料」とは数えず CONFIRMED-SINGLE とした。そのため今回 CONFIRMED-MULTI は 0 件。
- 「エコー」リスク: クエリに数値を入れた検索（#1, #2, #7）は、要約が数値を鵜呑みで返す可能性がある。#1 と #7 は要約が原文調の追加文言を含んでいたので採用したが、#2 は要約自身が「数値は結果に無い」と述べたので UNVERIFIABLE とした。

---

## 1. 検証結果の表

| ID | 主張（元ファイルの F 番号） | 判定 | 補正値 / 範囲 | 新規出典 URL | 備考 |
|---|---|---|---|---|---|
| V-01 | ニジマス胸鰭: 鰭基部は操縦中に 30° 超回転、旋回で横力 平均 2.7 mN、体のヨー回転 4–41 °/s（F-18, Drucker & Lauder 2003, PROXY:O. mykiss） | **CONFIRMED-SINGLE** | 補正なし。「mean 2.7 mN」「4–41 degrees s⁻¹」「rotating the fin base over 30 degrees」が要約に原文調で出現 | https://www.researchgate.net/publication/10933289_Function_of_pectoral_fins_in_rainbow_trout_behavioral_repertoire_and_hydrodynamic_forces | 元の PubMed/JEB と**同じ論文のアブストラクト**を別ホストで再確認。独立した第2論文ではない。クエリに数値を入れたため要約が数値を拾っただけの可能性は残るが、文言はクエリと異なる原文調だった。体長・水温は依然不明 |
| V-02 | ニジマス腹鰭: 腹鰭上流 −0.02 m/s、下流 −0.034 m/s、後流の流れ角 33.84±2.4°（F-26, Standen 2010） | **UNVERIFIABLE（数値）**／定性は部分的に支持 | 数値は再現できず。要約自身が「0.02 / 0.034 m/s / 33.84° は結果に含まれない」と明記 | https://www.researchgate.net/publication/23241901_Pelvic_fin_locomotor_function_in_fishes_Three-dimensional_kinematics_in_rainbow_trout_Oncorhynchus_mykiss ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6477606/ | 定性（腹鰭が臀鰭の迎え角に影響、体の振動を減衰、腹鰭の動きは規則的）は要約で支持。数値は仕様に入れるな（アニメ実装への影響も小さい） |
| V-03 | ニジマス背鰭: 推力ほぼ無し・側方力が主、側:後方 ≈ 6:1（1.0 L/s）、2.0 L/s で後流に運動量を加えない（F-27, Drucker & Lauder 2005） | **CONFIRMED-SINGLE（数値は幅あり）** | 側方:推力比は要約では「**5–6**」（元ファイルは「ほぼ 6:1」）。「2.0 L/s で背鰭は後流に運動量を加える役割を失う」は一致 | https://www.researchgate.net/publication/7429670_Locomotor_function_of_the_dorsal_fin_in_rainbow_trout_Kinematic_patterns_and_hydrodynamic_forces | クエリの「6:1」と異なる「5–6」が返ったためエコーではない。ただし要約が別論文（ブルーギル背鰭, semanticscholar の sunfish）を混ぜた可能性があり、5–6 がトラウトの値かは断定不可。「振幅・側方力は 0.5 L/s で最大」「背鰭高は速度で低下」は今回は再確認できず（UNVERIFIABLE） |
| V-04 | 脂鰭切除: steelhead 幼魚 SL 5–18 cm、10–39 cm/s、スモルトで尾鰭振幅 平均 +8%（−3〜+23%）、**小型個体（12 cm）では差なし**（F-21, Reimchen & Temple 2004） | **CONTRADICTED（サイズ条件のみ）**／他は CONFIRMED-SINGLE | +8%（−3〜+23%）、SL 5–18 cm、10–39 cm/s は一致。**差なしは「小型（<7 cm）と大型（>12 cm）」の両方**。効果が出たのは中間サイズ（スモルト, 約 7–12 cm）。元ファイルの「小型個体（12 cm）では差なし」は誤り | https://cdnsciencepub.com/doi/10.1139/z04-069 | 出版社ページ（Can. J. Zool.）の要約。要約文のみのため、仕様に載せるなら原典で閾値を再確認すること。ヤマメ parr（小型）では脂鰭除去の効果は出ない側（<7 cm）の可能性があるが、これは推論 |
| V-05 | ヤマメの鰭条数（F-01 青森: 背12–13/胸12–14/腹9/臀12–14、別報告 胸13–15・腹8–9・臀11–14。F-02 北海道7河川: 背・胸・臀は集団間有意差、腹は無し。F-03 二次資料: 背13–18/胸14–17/腹9–12/臀11–18） | **UNVERIFIABLE（個数値）**／F-02 は CONFIRMED-SINGLE | 個数値は再確認できず。F-02 の「7形質（脊椎骨・上/下鰓耙・背/胸/腹/臀鰭条）を計数し、うち脊椎骨・下鰓耙・背・胸・臀鰭条の5形質で有意差」は再確認 | https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57（F-02 と同一 URL。独立ではない）／ 日本語クエリ #5 で出た候補（要約に数値なし）: https://eprints.lib.hokudai.ac.jp/repo/huscap/all/24086/42(4)_P147-159.pdf ／ https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf | 日本語・英語（ロシア個体群語入り）の 2 回とも鰭条の数値は返らなかった。**青森値と二次資料値の食い違い（元ファイル §3-1〜4）は未解決**。腹鰭条が集団間で有意差なしなのに資料間で値がずれる点も未解決 |
| V-06 | 鰭先端の色: HRO「天然のヤマメには背・腹・尻びれの先端に白色部を持つものがある。降海時期には背びれと尾びれの先端が黒くなる」（F-31/F-04）。継承 F-04「降海期に背鰭先端が白」、継承 F-05「背・腹・臀・尾の先端が黒い」と食い違い | **CONFIRMED-SINGLE（スモルトの背びれ先端の黒化）**。「天然ヤマメの背・腹・尻びれ先端の白」は独立確認できず（HRO 単独 B ＋写真 P） | **スモルト化で背びれ先端が黒化**（前期=4月頃に先端が黒化、中期=5月に進行、後期=6月に背びれは完全に黒く、体色は銀白色・パーマーク消失）。→ 継承 F-04 の「降海期に背鰭先端が白」は**反証**。尾びれ先端の黒・腹/臀びれの黒は今回の要約に無く未確認 | https://www.weblio.jp/content/Smoltification ／ https://pedia.3rd-in.co.jp/wiki/スモルト ／ https://www.hro.or.jp/upload/38618/o7u1kr00000099ye.pdf ／ https://www.pref.miyagi.jp/documents/1119/847862.pdf（要約がどの URL の記述か特定できない。weblio か Hokkaido 系資料と推定） | 出典 URL の帰属は不明のためランク B（保守的）。この黒化は**スモルト（降海型）の段階的変化**であり、河川残留型の parr/成魚の既定色ではない。アマゴ/ヤマメ判別を狙った検索 #10 は朱点の有無の説明のみで、鰭の縁色は返らなかった（HRO PDF が再び先頭付近に出たが新情報なし） |
| V-07 | ニジマス胸鰭: 定速遊泳 0.5・1.0 BL/s では体側に畳む（adducted）。制動は持続的な張り出し（外転筋・内転筋とも動員）、Kármán 歩行は一過的な出し入れで 50% 超が筋活動なし（F-24, Gibbs 2024） | **CONFIRMED-SINGLE（独立性は弱い）** | 補正なし。要約: 「During constant-speed swimming (0.5 and 1.0 BL s⁻¹) the pectoral fins remain adducted against the body」「sustained extensions during braking / transient extensions and retractions during Kármán gaiting」「over 50% … in the absence of muscle activity」 | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/（元と同一）／ 関連（要約に当該文なし）: https://www.researchgate.net/publication/277436689_The_Karman_gait_novel_body_kinematics_of_rainbow_trout_swimming_in_a_vortex_street ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6324577/ | 元ファイルが指摘した「この文が Gibbs 2024 か Drucker & Lauder 2003 かの帰属不明」は**解消せず**。クエリに速度値を入れたためエコーの疑いは残るが、他の細部は元の要約と一致。2 BL/s 以上の胸鰭の挙動は依然 Gap |
| V-08 | 尾鰭の主鰭条は O. mykiss で 19 本（PROXY）。内訳「10+9」は未確認（F-22） | **CONFIRMED-SINGLE（19 本）**／「10+9」は UNVERIFIABLE | 19 本は再現。「10 本＋9 本」「分枝 17＋不分枝 2」の内訳は要約が「結果に無い」と明記 | https://fishbase.se/physiology/Oncorhynchus_mykiss ／ https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T5.html ／ https://journals.sjp.ac.lk/index.php/vjs/article/download/1160/344（要約が「19 rays」をどの URL から取ったか特定不能） | 19 が「主鰭条」か「全鰭条」かも要約からは不明。**内訳 10+9 は私の記憶（M）でも「サケ科は 10+9 で 19」と覚えているが、今回の検索では裏取りできていない**。ヤマメ（O. masou）の尾鰭条数は未確認のまま（PROXY のみ） |
| V-09 | 鰭起点の位置（%SL）: ブラウントラウト 背鰭前長 47.6 / 腹鰭前長 55.2 / 臀鰭前長 76.4（F-10, PROXY）。写真 p049 は 49.1 / 55.6 / 74.3 でほぼ一致（F-14） | **UNVERIFIABLE（ヤマメ値）** | ヤマメ（O. masou）の背鰭前長・腹鰭前長・臀鰭前長（%SL）は検索で出ず。ブラウントラウト表（元と同じ kmae T3）が再出現しただけで新情報なし | （新規なし）https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T3.html ／ 韓国産 masou の形態研究（要約に数値なし）: https://agris.fao.org/search/en/records/64735c4053aa8c896308e0e9 | 鰭の位置はモデリングで最重要の 1 つだが、**文献値はブラウントラウト（PROXY）＋ 写真 1 個体のみ**。写真読みの再計算は §3 で整合を確認 |
| V-10 | 脂鰭の縁色: ブラウントラウトは橙〜赤縁、ニジマスは黒縁（PROXY）。ヤマメの橙縁は写真で未確認（F-29, F-13） | **UNVERIFIABLE（ヤマメ）** | ヤマメの脂鰭の縁色を述べる資料は再び出なかった。アマゴ/ヤマメ判別の記述は朱点の有無が中心で、脂鰭の縁には触れない | https://www.pref.shimane.lg.jp/infra/nature/shizen/shimane/sizennkansatu/doubutu_kaisetu/sakana.html ／ https://tsurihack.com/881（要約に脂鰭の記述なし） | Gap 継続。仕様では「縁なし〜淡い暗縁」を既定とする元の判断（写真 P）に頼るしかない |

### 集計

- 検証した主張: 10（V-01〜V-10）
- CONFIRMED-MULTI: 0 ／ CONFIRMED-SINGLE: 5（V-01, V-03, V-06, V-07, V-08）／ CONTRADICTED: 1（V-04）／ UNVERIFIABLE: 4（V-02, V-05, V-09, V-10）
- 元ファイルの修正が必要な箇所: V-04（サイズ条件）、V-06（継承 F-04 の「降海期に背鰭先端が白」）、V-03（比の幅 5–6）

---

## 2. 仕様書で使うべき「採用値」と、使ってはいけない「不採用値」

### 2-A. 採用してよい値（条件付き）

| 項目 | 採用値 | 条件・ランク |
|---|---|---|
| 胸鰭の基部回転 | 操縦中に **30° 超** | PROXY:O. mykiss、A（V-01）。ヤマメでの確認なし |
| 旋回の横力・ヨー回転 | 横力 平均 **2.7 mN**、ヨー **4–41 °/s** | PROXY:O. mykiss、A（V-01）。魚の体長が不明なので**絶対値をそのままアニメの角速度として使うのは不可**。「旋回時のヨー角速度は数十 °/s オーダー」程度の目安 |
| 胸鰭の使い方 | 0.5–1.0 BL/s の定常遊泳は体側に畳む。制動は持続的に張り出す。Kármán 歩行は一過的に出し入れ（50% 超は受動） | PROXY:O. mykiss、A（V-07、単独）。2 BL/s 以上は仕様に書かず Gap と明記 |
| 背鰭の機能 | 推力はほぼ無く側方力が主。側方:後方（推力）比は **約 5〜6 : 1**（1.0 L/s）。2.0 L/s では後流に運動量を加えない | PROXY:O. mykiss、A（V-03）。比は「6:1」と書かず「約5–6:1」 |
| 脂鰭の機能 | 受動的な柔らかい葉として扱ってよい。切除効果は +8%（−3〜+23%）、**効果はスモルトサイズ（約 7–12 cm）で出て、<7 cm と >12 cm では出ない** | PROXY:O. mykiss steelhead、A（V-04）。閾値は要約文のみなので、仕様に載せる前に原典確認 |
| スモルト（降海型）の鰭色 | 背びれ先端が黒化（4月頃に開始、6月に背びれ全体が黒） | B（V-06）。**降海型/スモルトのバリアント限定**。河川残留型の parr・成魚の既定にしない |
| 尾鰭の主鰭条数 | 19 本（総数のみ） | PROXY:O. mykiss、B（V-08）。内訳は書かない |
| 鰭条数の個体差 | 背・胸・臀は集団間で変動、腹は変動が小さい（北海道7河川） | A（F-02 の再確認）。**個数の中心値と幅は未確定**。生成は「青森値を暫定の中心、二次資料の幅を裾」のように、**出典単独・食い違い未解決**の注記付きで仮置きする |
| 鰭先端の白（天然ヤマメの背・腹・尻びれ） | 「持つものがある」（出現する個体がいる）として扱う | B（HRO 単独、V-06）＋写真 P（腹 13/48, 臀 20/47, 背 6/46）。頻度は不明 |

### 2-B. 採用してはいけない値・記述

| 項目 | 不採用の理由 |
|---|---|
| 「脂鰭除去は小型個体（12 cm）では差なし」 | **誤り**（V-04）。差なしは <7 cm と >12 cm。12 cm はむしろ効果が出る側の上限 |
| 「降海期に背鰭先端が白い」（継承 F-04 の旧記述） | **反証**（V-06）。スモルト化では背びれ先端が**黒化**する。白縁は河川型の parr/成魚の記述（HRO 単独）で、降海期の記述ではない |
| 腹鰭の流速低下 0.02 / 0.034 m/s、後流の流れ角 33.84±2.4° | 検証失敗（V-02）。数値は仕様に入れない。入れる場合は「未検証」と注記 |
| 「側方:後方力比は 6:1」と断定すること | 第2の要約は 5–6。「約5–6:1」とする |
| 尾鰭の「10+9」内訳を事実として書くこと | 検索で未確認（V-08）。記憶（M）の域を出ない |
| 尾鰭の「中央鰭条が背・腹鰭条に 25° と 50° 遅れる」 | 元ファイルが既に不採用。今回も出典を特定できず（帰属不明のまま）。採用しない |
| ヤマメの脂鰭の橙縁 | 文献・写真とも根拠なし（V-10）。ブラウントラウトの形質をヤマメに移してはいけない |
| 鰭条数の二次資料値（背13–18、臀14–18、胸14–17 等）を「ヤマメの標準値」とすること | 青森値との食い違いが未解決（V-05）。亜種混在・数え方の差の可能性があり、単独で標準値にしない |
| 鰭の起点（%SL）を文献値として「ヤマメの値」と書くこと | ヤマメ値は無く、ブラウントラウト（PROXY）と写真 1 個体のみ（V-09）。仕様では PROXY/P と明記して幅を持たせる |

---

## 3. 元ファイル内の整合チェック（検索ではなくローカル計算）

写真由来（P）の主張は検索検証の対象外だが、記載座標からの再計算で整合を確認した。

- p049: SL = √(1151²+40²) ≈ 1151.7 px。背鰭前長 565/1151.7 = 49.1%、腹鰭前長 640 → 55.6%、臀鰭前長 856 → 74.3%、脂鰭 前端 930 → 80.8%・後端 1024 → 88.9%、脂鰭基底 94 px → 8.2%、FL/SL = 1289/1151 = 1.12。いずれも F-14 の表と一致。
- p049 尾鰭: 両葉先端 x の平均 1433.5 − 切れ込み x 1413 ≈ 21 px（1.8%SL）、尾鰭高さ 272 px → 23.6%SL。一致。
- p029: SL = 925 px、切れ込み 164 − 先端平均 125 ≈ 39 px（4.1%SL）。一致。
- **軽微な不整合**: 元ファイル §1 の要約 7 は「尾鰭長の約 **11**–22%」だが、F-15 の本文は p049 = 21/160 = **13%**、p029 = 38/172 = 22%。正しくは「約 13–22%」。
- §1 の要約 6 の「ブラウントラウト表と ±2.5 ポイント以内」は、差 1.5 / 0.4 / 2.1 ポイントで整合。

---

## 4. 検索ログ（11 回、全て mode=standard）

| # | クエリ（要旨） | 対象 | allowed_domains | 有用度 | 得たもの |
|---|---|---|---|---|---|
| 1 | rainbow trout pectoral fins turning braking lateral force 2.7 mN … yaw 4-41 deg/s … fin base more than 30 degrees | V-01 | cob.silverchair.com, europepmc.org, sites.harvard.edu, researchgate.net | 高 | ResearchGate の Drucker & Lauder 2003 ページ。2.7 mN / 4–41 °/s / 30° 超が原文調で再確認 |
| 2 | pelvic fins trout flow upstream slowed 0.02 m/s downstream 0.034 … flow angle 33.84 | V-02 | cob.silverchair.com, europepmc.org, ncbi.nlm.nih.gov, researchgate.net, scholar.archive.org | 低 | 数値は出ず。定性（臀鰭の迎え角への影響）のみ |
| 3 | dorsal fin rainbow trout little thrust strong side forces 6:1 … 2.0 L/s no momentum | V-03 | cob.silverchair.com, europepmc.org, researchgate.net, semanticscholar.org | 高 | 側方:推力比「5–6」、2.0 L/s で運動量を加えない |
| 4 | adipose fin removal steelhead smolts caudal fin amplitude 8% … 10 to 39 cm/s | V-04 | cdnsciencepub.com, researchgate.net, semanticscholar.org, europepmc.org | 高 | +8%（−3〜+23%）再確認。**差なしは <7 cm と >12 cm**（元の「12 cm 小型」は誤り） |
| 5 | サクラマス ヤマメ 計数形質 背鰭条数 胸鰭条数 腹鰭条数 臀鰭条数 脊椎骨数 鰓耙数 集団間 変異 | V-05 | なし | 低 | 候補 PDF の列挙のみ。数値は要約に無い |
| 6 | サクラマス スモルト 銀化 背びれ 尾びれ 先端 黒い 幼魚 パーマーク 腹びれ 尻びれ 先端 白い 特徴 | V-06 | なし | 中〜高 | スモルト化で背びれ先端が黒化（4月頃〜6月）。降海期の「先端が白」は反証 |
| 7 | rainbow trout steady swimming pectoral fins held adducted 0.5 1.0 BL/s … Kármán gait | V-07 | biorxiv.org, europepmc.org, researchgate.net, royalsocietypublishing.org, pmc.ncbi.nlm.nih.gov | 中 | F-24 の文言を再現。帰属は未解決 |
| 8 | salmonid caudal fin 19 principal rays 10 upper 9 lower 17 branched … | V-08 | なし | 中 | O. mykiss 尾鰭 19 本は再現。内訳 10+9 は不明 |
| 9 | Oncorhynchus masou morphometrics predorsal prepelvic preanal length % SL adipose fin base caudal peduncle | V-09 | なし | 低 | ヤマメ値なし。ブラウントラウト表が再出現 |
| 10 | ヤマメ アマゴ 見分け方 脂びれ 縁 黒 赤 朱点 背びれ 尾びれ 縁取り | V-10 | なし | 低 | 朱点の有無の説明のみ。鰭の縁色なし |
| 11 | masu salmon Oncorhynchus masou meristic characters D A P V … Russian Primorye Sakhalin Japan | V-05 | なし | 低 | Mano et al. 1991 の AGRIS 記録が再出現（F-02 の再確認のみ）。ロシア個体群の数値なし |

### 検証できなかったこと（次に検索予算が使えるなら）

1. ヤマメ（O. masou）の鰭条数の一次データ（青森県報告 PDF の表そのもの、または J-STAGE の計数形質論文）。V-05 の食い違いを解くのに最優先。
2. Reimchen & Temple 2004 の原典で「<7 cm / >12 cm では差なし」の閾値とスモルトの体長範囲。
3. Standen 2008/2010 の PDF 本文（周波数・振幅・位相、0.02/0.034 m/s、33.84°）。
4. ヤマメの鰭起点（%SL）・脂鰭サイズの文献値。
5. Gibbs 2024 と Drucker & Lauder 2003 のどちらが「0.5–1.0 BL/s で胸鰭を畳む」と述べているかの特定。
