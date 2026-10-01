# ヤマメ(Oncorhynchus masou masou 河川型)の生活史段階・性差・婚姻色・季節変化による形態/体色の変化 — r03

> **調査方法の制約（必読）**
> - Bash/curl と WebFetch は遮断（WebFetch を1回試行し EGRESS_BLOCKED を確認、以後試行せず）。情報源は WebSearch の「要約文」のみで、論文・PDF の全文は読めていない。本書の数値・記述は**すべて検索結果の要約文に明示されたものだけ**を採用した。要約文は機械要約であり、(a) どの URL の記述か特定できない、(b) 種・生活史型のラベルが入れ替わる（実例: Q1 の要約は「ヤマメ」と書いたが、同じヒット群を使った Q20 の要約は同じ記述を「サクラマス」と書いた）、(c) 他種（シシャモ等）の記述が混入する、という欠陥を実際に観測した。該当箇所は各 Finding に「要原典確認」と明記した。**数値・色の記述を3Dモデル仕様に使う前に、各 Finding の「原典候補」を一次資料で確認すること。**
> - **検索予算の枯渇**: 本セッションの WebSearch 上限（200回、他ストリームと共有）に達し、本ストリームは有効検索 **33回** で打ち切られた（課題の目標 40〜80回に未達）。上限到達後の3回は「実行されず」と返却された。未実行クエリは「4. Gaps」末尾に列挙した。追加検索が必要なら環境変数 `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` の引き上げが必要（ユーザー判断事項）。
> - **証拠ランク**: A=査読論文・大学紀要・公的研究機関の正式報告で、要約文に数値/記述が明示 / B=自治体・研究機関の解説ページ・図鑑・公的DB / C=Wikipedia系・釣りメディア・出典不明 / M=調査員の記憶（未検証。**本書では M は1件も使っていない**）。出典文書が候補複数のうち特定不能な場合は、文書種別でランクを付け「候補」と明記し、要約の信頼性に疑義があるものは1段下げた。
> - **PROXY**: ヤマメ（河川型）以外のデータは scope に "PROXY:○○" と明記した。

---

## 1. 要約（仕様に直結する結論）

1. **生活史に応じた外観クラスを最低4つ持たせる**: (a) 当歳〜若魚 parr（パーマーク明瞭）、(b) 河川残留の成魚ヤマメ、(c) 早熟雄（成熟した残留雄・parr 型）、(d) 銀化（スモルト）〜降海型サクラマス。ヤマメ型の成魚と降海型は体サイズも外観も大きく違い、かつては別種扱いされた。 [F-05][F-06][F-07][F-18]
2. **銀化は「パーマーク消失＋銀白化」で、段階的に進む**: parr→silvery parr→smolt の各移行でグアニン／ヒポキサンチンが顕著に増加。ただしグアニン量の多さが銀化の見た目と常に相関するわけではない（要約記述）。移行途中の個体（一部パーマークが残る）が存在しうる（PROXY の一般則）。 [F-17][F-18]
3. **銀化の駆動要因は体サイズと光周期の二経路**: 1年目の夏（サイズ駆動・光周期制限）と翌春（光周期駆動・サイズ制限）。給餌操作実験では FL 12cm 超の個体のみ鰓 NKA 活性が上昇（12cm 以下では上昇が見られなかった）。→ 銀化の下限サイズ目安として FL 12cm を参照（外観の銀白化そのものの閾値ではなく、生理指標の閾値。要原典確認）。 [F-15][F-16]
4. **性と生活史の強い偏り**: 北海道の湖（Shumarinai Lake とされるが要約内の帰属は未確認）の銀化魚は 1+ で78.0%、2+ で88.9%が雌。成熟 parr は調べた78尾すべて雄。河川残留雌は稀で 1+ 以降に成熟、残留雄は 0+ から成熟。→ 個体群生成では「残留成魚ヤマメは雄に偏る」が既定。 [F-12][F-28]
5. **早熟雄（成熟した残留雄）の外観**: 未成熟魚より体高が高く、体色が暗色化し、パーマークが未成熟魚よりくっきり見える。海水適応能は発達しない。二次性徴（鼻曲り等）はほとんど発達しない。 [F-05][F-09]
6. **早熟雄の成熟サイズ**: 0+ の雄は7月時点で FL 約70mm が成熟の臨界サイズ、1+ の雄は全て FL 90mm 超。河川型雄は 0+〜2+ で成熟。 [F-10]
7. **降海型雄の婚姻期**: 全体に黒ずみ、体側に不定形の雲状の桜色（桃色）斑、吻が伸びて下方に屈曲（鼻曲り）、両顎の歯が肥大、背が盛り上がる（hump depth）。雌も婚姻色を示すが雄ほど顕著でない。 [F-01][F-08]
8. **河川型ヤマメの成熟期の色は資料間で不一致（最大の未解決事項）**: 「黒ずむが桜色にはならない」[F-02] / 「黒っぽい体に薄桃〜濃紅の婚姻色が体側から鰭まで不定形に出る」[F-03] / 「背が暗化し、体側の縞が鮮紅色になり腹部で淡色の縦帯に融合」[F-04]。実装は暫定で「黒化＋不定形な淡桃〜紅の斑、強度に個体差、雄で強い」とし、要原典確認。 [F-02][F-03][F-04]
9. **河川型雄の鼻曲り（kype）の有無・大きさは資料なし**: 降海型雄の二次性徴の記述（吻長・hump depth）はあるが、河川型ヤマメの成熟雄に同程度の鼻曲りが出るかは見つからなかった。早熟雄は二次性徴がほぼ未発達との記述と整合的に、河川型小型雄では弱いか無しを暫定とするが**推測**。 [F-08][F-09]（Gap）
10. **河川残留ヤマメは産卵後に死なず、複数年繰り返し産卵する**（産卵期は秋 9〜10月）。降海型は一度産卵して死ぬ。産卵後個体の見た目（痩せ・鰭損傷等）の資料は取得できず。 [F-13][F-14]（Gap）
11. **年齢-体長（北海道の良好成長例）**: 尾叉長 0+ 14.1cm / 1+ 19.4cm / 2+ 23.2cm / 3+ 28.2cm（逆算値の可能性、要原典確認）。当歳の夏〜秋の実測は 6.65–8.1cm 台。→ 年齢別サイズ分布の中心は成長の良否で大きく変わる。 [F-21][F-22]
12. **雌の成熟年齢は資料で幅がある**: 1+（稀）/「2年目」/ 2+（個体群の80%、性別・種不明）。 [F-12][F-23]
13. **基本外観（B）**: 背面は黄褐色〜暗青緑、小黒点が背に散在、腹は白、体側にパーマーク7〜10個。背の基調色の記述は資料で異なる。 [F-19]
14. **性差の形態計測値（頭長・顎長・体高・鰭）は本ストリームでは取得できず**。降海型雄で「体サイズ補正後の hump depth と吻長」が代表的二次性徴という記述のみ。数値は r01（韓国産マス PROXY の吻長/頭長・上顎長/頭長の性差）を参照。 [F-08]（Gap）
15. **地域差**: 降海型では緯度が高いほど雄が大きく、45°N 付近でサイズ二型の向きが逆転（PROXY:降海型、日本海側22集団）。ヤマメの体色・パーマークの地域差の定量値は取得できず。分布は北海道・本州日本海側・太平洋側は伊豆半島以北など（B）。 [F-24][F-26]（Gap）
16. **環境による体色変化**: ヤマメ固有の資料は無し。一般論（色素胞の顆粒の凝集・拡散で背景に適応、優位個体は明るい基質により馴染み従属個体は暗色になる）は種不明の資料のみ。 [F-27]（Gap）
17. **季節別（春〜冬）の体色の資料は取得できず**。確認できたのは「銀化魚は4〜6月ごろ降海」「産卵期は秋（9〜10月）」等の季節性のみ。 [F-18][F-14]（Gap）

---

## 2. Findings

### F-01
- 主張/値: 降海型（サクラマス）は遡上するにつれて体側の銀白色の金属光沢を徐々に失い、産卵期が近づくと二次性徴が現れる。**雄は全体に黒ずみ、体側に不定形（雲状）の桜色（桃色）斑（婚姻色）が出る。吻が伸長して下方に屈曲し、両顎の歯が大きくなる。雌も婚姻色を示すが雄ほど顕著でない。**
- 適用範囲: PROXY:降海型サクラマス（北海道系の行政・研究機関資料、遡上〜産卵期＝秋）。※ Q1 の要約は主語を「ヤマメ」と記したが、同じヒット群の Q20 要約は「サクラマス」と記したため、降海型の記述と判断（ラベル入れ替わり事例）。
- 出典（候補・どの文書の記述かは要約から特定不能）: 北海道立総合研究機構（hro.or.jp）資料 https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ 北海道庁 https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
- 証拠: [B]（公的機関の解説）要約文より「males become darker overall with irregular cloudy cherry-pink coloring, snout elongated and curves downward, jaw teeth enlarged. Females also display nuptial coloring but less prominently.」要原典確認。

### F-02
- 主張/値: **河川で性成熟したヤマメは体色が黒ずむが、サクラマスのように桜色にはならない。**
- 適用範囲: ヤマメ（河川型）/ 成熟個体（性別の区別は要約に無し）/ 産卵期（秋）/ 地域不明。
- 出典（候補）: 関泰夫・小島将男(1977)「吾妻川起源のヤマメの銀毛化変態と成熟に関する研究」水産増殖 24(2)（検索結果の見出しは24巻2号だが URL は 25/2 を示す。巻号の食い違いは未確認） https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja ／ 奥多摩さかな養殖センター https://www.tokyo-aff.or.jp/site/aquafarming/yamame.html ／ 群馬県 https://www.pref.gunma.jp/page/20806.html ／ https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ／ hro.or.jp（F-01）。Q18 でも同趣旨が出た（候補: agriknowledge 2010927243 https://agriknowledge.affrc.go.jp/RN/2010927243.pdf ほか）。
- 証拠: [B]（複数クエリで再現。ただし記述元の文書は特定不能）要約文より「降海せずに河川で性成熟したヤマメは体色は黒ずむが、サクラマスのように桜色にはならない」。F-03・F-04 と不一致 → 「3. 矛盾」参照。要原典確認。

### F-03
- 主張/値: 繁殖期のヤマメは**体全体が黒っぽくなり、薄い桃色から濃い紅色までの婚姻色が体側から鰭などに不定形に現れる**（サクラマスの明確な桜色とは異なる）。ヤマメの雌はしばしば「2年目」に成熟し、婚姻色は「ブナ毛」とならずに体色が黒ずむ（幼形成熟＝ネオテニーの好例とされる）。
- 適用範囲: ヤマメ（河川型）/ 雌雄（雌の記述を含む）/ 産卵期。「2年目」が満1歳（1+）か満2歳（2+）かは要約に無し。
- 出典（候補・特定不能）: Q19 のヒット群に ja.wikipedia ヤマメ https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ・サクラマス https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9 ほかが含まれる。文体は百科事典的で Wikipedia 由来の可能性が高いが未確認。Q9 でも「婚姻色はブナ毛とならずに体色が黒ずむ」が出現（hro.or.jp 36117 / 島根県 https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html ほかがヒット）。
- 証拠: [C]（出典特定不能・百科事典的）要約文より「繁殖期になると、ヤマメの体全体が黒っぽくなり、薄い桃色から濃い紅色までの婚姻色が体側からヒレなどに不定形に表れる」。要原典確認。

### F-04
- 主張/値: 英語の公的DB（国土交通省 多言語DB）は成熟したマス（masu salmon）を次のように記述する: 成熟個体は**背が暗化し、体側の縞（stripes on the body sides）が緋色〜深紅の濃い赤色になり、腹部で一つの淡色の縦帯に融合する。桜色（pink）になる**。
- 適用範囲: 国交省多言語DB「サクラマス(ヤマメ)」/ Masu Salmon。河川型か降海型か、雄か雌かは要約に無し。「stripes」がパーマークを指すのか他の縞かは**要約に明示が無い（調査員の推測を排し未確定）**。
- 出典: 国土交通省 多言語DB https://www.mlit.go.jp/tagengo-db/en/R2-00580.html （日本語版 https://www.mlit.go.jp/tagengo-db/R2-00580.html ）。同時ヒット: Wikipedia「Yamame」https://wikipedia.com/wiki/Yamame
- 証拠: [B]（公的DB）要約文より「A masu salmon which has reached sexual maturity has a darkened back, and the stripes on the body sides become bright red with crimson tinge to merge on the abdomen into one common longitudinal band of lighter color. They turn pink…」要原典確認（記述の由来・対象型が不明）。

### F-05
- 主張/値: **早熟雄（成熟した河川残留雄）は、他の多くの未成熟魚に較べて体高が高く、体色が暗色化し、体側のパーマークが未成熟魚よりくっきり見える。銀化魚とは違い海水適応能も発達しない。**
- 適用範囲: サクラマス（ヤマメ型）の早熟雄（parr）/ 北海道系の研究と思われるが地域は要約に無し。
- 出典（候補・特定不能）: Q7 のヒット群: サクラマス雄の生活史型と産卵環境および発眼率の関係 https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_16-00006/_article/-char/ja/ ／ ヤマメ養殖魚との交雑によるサクラマスのスモルト時期および成熟年齢の変化 https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_22-00024/_pdf ／ https://www.jstage.jst.go.jp/article/nl2001jsce/2002/104/2002_104_104_24/_pdf/-char/ja ／ ESJ61 S05-2 https://esj.ne.jp/meeting//abst/61/S05-2.html ／ サクラマスの生活史パラメータの推定… https://fra.repo.nii.ac.jp/record/2009615/files/sapporo_sk_13_3.pdf 。Q21・Q34 でも同趣旨が再現したが、どれの記述かは不明。
- 証拠: [B]（学術・研究機関系の文書と推定されるが文書特定不能のため A から1段下げ）要約文より「早熟雄は…体高が高く、体色が暗色化しており、体側にある斑紋（パーマーク）が未成熟魚よりもくっきりとして見え、…海水適応能も発達しない」。要原典確認。

### F-06
- 主張/値: 「オソコリンカス」は「曲った吻」の意で、二次性徴の「鼻曲り」を指す。サクラマスの二次性徴として吻の変化が知られる。降海型と河川残留型は体サイズや外観が大きく異なるため、**かつては別種とみなされていた**。
- 適用範囲: サクラマス（降海型の雄の二次性徴の記述）。
- 出典（候補）: F-05 と同じ Q7 のヒット群（jstage suisan 22-00024、ビワマス論文 https://www.jstage.jst.go.jp/article/jji/58/2/58_171/_pdf 等）。文書特定不能。
- 証拠: [B]（文書特定不能）要約文より「『曲った吻』の意で二次性徴の『鼻曲り』をさす」「降海型と河川残留型とでは体サイズや外観が大きく異なるため，両者はかつて別種としてみなされていた」。

### F-07
- 主張/値: 雄のマスは生活史で2群に分けられる: **降海型（尾叉長30–50cm、成熟年齢3–4歳）と河川型（resident form、10–20cm）**。
- 適用範囲: Oncorhynchus masou の雄。河川型「10–20cm」の測定量（FL か SL か）と、これが成熟した早熟雄のサイズを指すのか全河川型かは要約に無し（降海型にのみ「fork length」と明記）。
- 出典（候補）: Sexual selection on mature male parr of masu salmon (Oncorhynchus masou): Does sneaking behavior favor small body size and less-developed sexual characters? https://www.researchgate.net/publication/225706209_Sexual_selection_on_mature_male_parr_of_masu_salmon_Oncorhynchus_masou_Does_sneaking_behavior_favor_small_body_size_and_less-developed_sexual_characters （Q8 の先頭ヒット。要約の記述がこの文書由来かは未確認）
- 証拠: [A]（査読論文の抄録と推定）要約文より「Male masu salmon can be divided into two life history-based groups: the anadromous form (fork length 30-50 cm; age at maturity 3-4 years), and the resident form (10-20 cm).」F-21（河川型が良好成長で 23–28cm）と大きさの扱いが異なる → 「3. 矛盾」。

### F-08
- 主張/値: 降海型雄の代表的な二次性徴は**体サイズ補正後の hump depth（背の隆起の深さ）と吻長（snout length）**。移動性の雄の二次性徴として「鉤状に曲がった吻（hooked snout）と盛り上がった背（humped back）」が挙げられ、PROXY のギンザケでは総重量・体サイズ・hump depth・kype 長が二次性徴形質として測定されている。サケ科一般の kype は「一部の雄で産卵期前に下顎先端に生じる鉤状の構造」で、産卵場への遡上前〜遡上中の数週間で発達し、雄同士の優劣関係の形成に関わり、大きさが雄の産卵頻度を左右すると考えられている。
- 適用範囲: (a) 降海型サクラマス雄（A）。(b) PROXY:ギンザケ O. kisutch の二次性徴計測（A）。(c) PROXY:サケ科一般の kype の定義（C: Wikipedia 系）。**河川型ヤマメ雄に同様の形質がどの程度出るかの記述は無し**。
- 出典: (a) ESJ 日本生態学会 第59回大会 P2-223J https://esj.ne.jp/meeting/abst/59/P2-223J.html（候補）／ Q8: https://www.researchgate.net/publication/225706209_Sexual_selection_on_mature_male_parr_of_masu_salmon_Oncorhynchus_masou_Does_sneaking_behavior_favor_small_body_size_and_less-developed_sexual_characters (b) Secondary sexual characters and sperm traits in coho salmon Oncorhynchus kisutch https://www.researchgate.net/publication/45827007_Secondary_sexual_characters_and_sperm_traits_in_coho_salmon_Oncorhynchus_kisutch ／ https://core.ac.uk/display/102054948 (c) Kype https://en.wikipedia.com/wiki/Kype
- 証拠: (a) [A] 「In anadromous masu salmon males, representative secondary sexual traits include hump depth and snout length (after adjusting for body size).」(b) [A/PROXY] 「…total mass, body size, hump depth and kype length.」(c) [C/PROXY] 「hook-like secondary sex characteristic which develops at the distal tip of the lower jaw… size believed to determine male spawning frequency.」記述元文書の特定は要約から不能。

### F-09
- 主張/値: 早熟雄（precocious male / mature male parr）は**小型で二次性徴がほとんど（または全く）発達せず、スニーキングで雌に近づく**。降海型雄は大型で二次性徴が発達し、闘争する。masu salmon の parr では、体サイズ以外の形態形質は繁殖成功に寄与せず、これが parr で二次性徴が発達しない一因かもしれない。parr 間では「より大きい体サイズ」がスニーキング成功に有利（小型有利という予測に反する）。
- 適用範囲: Oncorhynchus masou の成熟雄 parr（河川残留雄）。
- 出典: Sexual selection on mature male parr of masu salmon (Oncorhynchus masou)… https://www.researchgate.net/publication/225706209_Sexual_selection_on_mature_male_parr_of_masu_salmon_Oncorhynchus_masou_Does_sneaking_behavior_favor_small_body_size_and_less-developed_sexual_characters （Q3・Q8・Q26 で同一内容が再現。論文名はヒットに明示。URL 先頭の候補: 北大紀要 https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22184/7(2)_P87-108.pdf ほか）
- 証拠: [A]（査読論文、3クエリで再現）要約文より「Precocious males have a small body size with little or no development of sexual characters… No morphological characters other than body size contributed to the reproductive success of parr.」

### F-10
- 主張/値: **河川型（fluvial form）の雄（成熟 parr）は 0+〜2+ 歳で成熟する。成熟する 0+ の雄は未成熟の 0+ より体長が大きく、7月時点で尾叉長 約70mm が臨界サイズ。1+ の雄は全て尾叉長 90mm 超に成長していた。**
- 適用範囲: Oncorhynchus masou の河川型雄 / 北海道系の研究と推定（要約に地域なし）/ 7月時点（0+）。
- 出典（候補・特定不能）: 北大水産学部紀要等 https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22122/1_P39-42.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23606/28(2)_P66-73.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23571/26(4)_P321-326.pdf（Utoh 1976）／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22184/7(2)_P87-108.pdf （Q3・Q32 のヒット）
- 証拠: [A]（大学紀要。Q3・Q32 で同一記述が再現、ただし4候補のうちどれかは不明）要約文より「critical size of about 70 mm in fork length in July」「all collected 1+ male fish had grown more than 90 mm in fork length」「matured at 0+~2+」。要原典確認。

### F-11
- 主張/値: 湖沼型（lake-run form）の成熟年齢は雄 1+〜3+、雌 2+ と 3+。成熟時の平均尾叉長は雄 約280mm、雌 約350mm で、降海型成魚よりはるかに小さい。
- 適用範囲: **PROXY:湖沼型（陸封湖沼降下型）サクラマス**。河川型ヤマメの値ではない。湖名は要約に無し（Q27 の別要約が「Shumarinai Lake」に言及するが同一文書の記述か未確認）。
- 出典（候補）: Q32 のヒット群（北大紀要 1_P39-42、28(2)_P66-73、neo-science 79-83 https://eprints.lib.hokudai.ac.jp/repo/huscap/all/38510/79-83-neo-science.pdf 等）。
- 証拠: [A/PROXY]（大学紀要と推定）要約文より「Age at maturity of lake-run form was 1+~3+ in males and 2+ and 3+ in females… mean fork length at maturity… about 280mm in males and about 350mm in females」。

### F-12
- 主張/値: **性により生活史が強く偏る**。(1) 降海するスモルトの大半は雌（1+ の78.0%、2+ の88.9%が雌）。(2) 調べた成熟 parr 78尾はすべて雄で、うち 36尾（46.2%）が 0+、41尾（52.6%）が 1+（合計77尾、残り1尾の年齢は要約に無し）。(3) 河川残留雄は 0+ で成熟しうるが、河川残留雌は 1+ で成熟し稀。(4) 雌は体サイズが繁殖成功を左右するため大半が回遊型を採る。
- 適用範囲: Oncorhynchus masou（北海道。(1) は湖＝Shumarinai Lake とされるが要約内の帰属は未確認）/ スモルト年齢 1+・2+。
- 出典（候補・要約が複数文書を混合している疑い）: Kitanishi et al. (2012) Fine scale relationships between sex, life history, and dispersal of masu salmon, Ecol. Evol. 2(5):920–929 https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3399158/ ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22122/1_P39-42.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23606/28(2)_P66-73.pdf ／ https://link.springer.com/article/10.1007/s10641-005-3039-1
- 証拠: [A]（査読論文・紀要。ただし文書特定不能）要約文より「78.0% of 1+ smolts and 88.9% of 2+ smolts were females」「All of 78 mature parr examined were male… 36 (46.2%) and 41 (52.6%) were 0+ and 1+」「resident female salmon are rare」。要原典確認。

### F-13
- 主張/値: 河川生活期の masu salmon parr は発育過程で、銀化して降海する群と河川に残る群に分かれる。**河川残留型は雄に多く、1歳目から幼魚形のまま成熟でき、繁殖後も生き残って再び成熟しうる**（Ono & Kubo らの知見として引用）。
- 適用範囲: Oncorhynchus masou（北海道）。
- 出典: Utoh H. (1976)「サクラマス Oncorhynchus masou Brevoort の降海型と河川残留型の分化機構に関する研究：1．早熟な河川残留型の体生長と性成熟」（Study of the Mechanism of Differentiation between the Stream Resident Form and the Seaward Migratory Form in Masu Salmon…: I. Growth and sexual maturity of precocious masu salmon parr）北海道大学水産学部研究彙報 26(4):321–326 https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23571/26(4)_P321-326.pdf （https://eprints.lib.hokudai.ac.jp/dspace/handle/2115/23571 ）
- 証拠: [A]（大学紀要。論文名・著者・巻号が要約に明示）要約文より「resident-type individuals are more common in males, and they can mature as early as the first year of life while remaining in their juvenile form, and can continue to survive after the breeding season to mature again.」

### F-14
- 主張/値: **ヤマメの産卵期は9〜10月。産卵後も斃死せず、数年繰り返し産卵する**。降海型が川で一度だけ産卵して死ぬのと異なる。産卵後の外観（痩せ・鰭損傷・体色の黒化など）の記述は取得できなかった。
- 適用範囲: ヤマメ（河川型）/ 性別の区別は要約に無し（雌を指す文脈）。
- 出典（候補）: 島根県 https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html ／ https://agriknowledge.affrc.go.jp/RN/2010927243.pdf ／ 環境省資料 https://www.env.go.jp/council/content/i_07/900428219.pdf ／ 北海道 https://www.hro.or.jp/upload/54755/ima1034.pdf （Q29 のヒット。文書特定不能）。英語 Wikipedia「Yamame」（https://wikipedia.com/wiki/Yamame ）も「Yamame left in the river have a small body, but lay eggs several times」（C）。
- 証拠: [B]（行政・公的資料と推定）要約文より「ヤマメの産卵期は9から10月で、産卵後も斃死することなく、数年繰り返し産卵します」。F-13 の Utoh (1976) と整合。

### F-15
- 主張/値: **masu salmon は、1年目の夏の「光周期制限・サイズ駆動」の銀化と、翌春の「サイズ制限・光周期駆動」の銀化の二経路を持つ**。春の銀化は冬の進めた光周期で誘導され（鰓 Na+,K+-ATPase 活性化で確認）、幼魚は光周期によらず8月に鰓 NKA 活性の追加ピークを示した。
- 適用範囲: Oncorhynchus masou（実験条件・飼育個体、サイズ別・光周期操作）。外観（パーマーク／銀白化）そのものの記述は含まれない。
- 出典: Ugachi et al. (2023) Size-driven parr-smolt transformation in masu salmon (Oncorhynchus masou), Scientific Reports https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ ／ https://link.springer.com/10.1038/s41598-023-43632-7 ／ https://doaj.org/article/06cddc561f3a4e3d93b1ec547033a879
- 証拠: [A]（査読論文、論文名・誌名・年が要約に明示）要約文より「photoperiod-limited, size-driven smoltification during the first summer and size-limited, photoperiod-driven smoltification the following spring.」

### F-16
- 主張/値: 給餌操作をした masu salmon 幼魚では、**尾叉長12cmを超える個体のみ**鰓 NKA 活性の上昇（銀化の生理的指標）を示し、体サイズが銀化の重要因子であることを示す。
- 適用範囲: Oncorhynchus masou 幼魚 / 給餌操作実験 / 外観（銀白化）ではなく鰓 NKA 活性の指標。
- 出典（候補・特定不能）: Ugachi et al. 2023（F-15 の URL）／ 北大水産学部研究彙報 21(2):123–127 https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf （Q16 のヒット）。
- 証拠: [A]（査読論文／大学紀要のいずれか）要約文より「only fish exceeding a fork length of 12 cm exhibited an increased gill NKA activity」。要原典確認（r01 も同閾値を引用）。

### F-17
- 主張/値: parr から smolt への変化（暗色の parr → 銀色の smolt）は皮膚へのグアニン結晶の沈着による。**masu salmon では、parr→silvery parr、silvery parr→smolt の両方の移行でグアニンとヒポキサンチンが顕著に増加した。ただし大量のグアニンが銀化の見た目と必ずしも相関しない**（見た目と生化学の関係は直線的でない）。
- 適用範囲: (a) Oncorhynchus masou（北大の古い紀要と推定）。(b) 「グアニン結晶沈着が銀化の原因」は PROXY:サケ科一般（種不明・出典不明）。
- 出典（候補・特定不能）: 北大水産学部研究彙報 21(2):123–127 https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf 。(b) 候補: McMahon et al. 1988 J. Fish Biol. https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf ／ USGS Skin reflectance as a non-lethal measure of smoltification for juvenile salmonids https://pubs.usgs.gov/publication/70180320
- 証拠: (a) [A（候補）]「a remarkable increase of guanine and hypoxanthine was found at both occasions of change from parr to silvery parr and from silvery parr to smolt」 (b) [C/PROXY]「caused by the deposition of guanine crystals in the skin」。要原典確認。

### F-18
- 主張/値: **スモルト化＝パーマークが消えて体が銀白色になる。降海は4〜6月ごろ。降海後のサクラマスにはパーマークが無い。** 銀化は銀白化が強まり体側の斑紋がほとんど見えなくなることとされ、成熟した河川残留雄（パーマークがくっきり）との大きな相違点。ヤマメとサクラマスは大きさ・パーマーク・（腹部青斑点？）の有無で判別できる（F-20）。PROXY の一般則: 移行途中（transitional）の個体が存在し、ある調査では降海個体の50%が完全に銀化、45%が移行期、5%がまだ parr 様の体色を保持していた（種・文書不明）。
- 適用範囲: (a) ヤマメ／サクラマス（B）。(b) PROXY:サケ科一般（種・出典不明。サケ科 smolt の一般記述）。
- 出典: (a) 群馬県 https://www.pref.gunma.jp/page/20806.html ／ https://www.honda.co.jp/fishing/picture-book/sakuramasu/index.html ／ https://agriknowledge.affrc.go.jp/RN/2030927242.pdf （Q25 のヒット群。文書特定不能）、(b) Q4 のヒット群: https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf ほか。ヤマメの飼育・スモルト化研究候補: 山形県 https://www.pref.yamagata.jp/documents/6277/seika0706.pdf
- 証拠: (a) [B] 要約文より「パーマークが消えて体が銀白色になり(スモルト化)、4~6月ごろに海へと下ります」「スモルト化とは銀白化が強まり、体側部の斑紋(パーマーク)がほとんど見えなくなる」(b) [C/PROXY]「50% of seaward migrants were completely silvered, 45% were in a transitional phase, and 5% still retained coloration characteristics of parr」。

### F-19
- 主張/値: ヤマメの基本外観: **背は黄褐色（または暗青緑）で小黒点が散在、腹は白、体側に楕円形のパーマークが7〜10個**。パーマークは紫がかった色と記述する資料がある。
- 適用範囲: ヤマメ（河川型）/ 季節・サイズ・地域不明。
- 出典（候補・特定不能）: 本田技研 https://www.honda.co.jp/fishing/picture-book/yamame/ ／ https://www.honda.co.jp/fishing/picture-book/stn-kawa-koshou/ ／ 北海道庁 https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html ／ hro.or.jp 36117 ／ 島根県（F-14 の URL）。背の基調色の記述は Q11（暗青緑）と Q20（黄褐色）で異なる。
- 証拠: [B]（図鑑・自治体解説）Q20 要約文より「yellowish-brown dorsal region with small black spots, white ventral region, 7-10 parr marks on their body sides」、Q11 要約文より「dark blue-green back and silvery body sides, … oval-shaped dark spots called parr marks」「purple-colored parr marks」。r01（青森 8–10 個）と整合。

### F-20
- 主張/値: ヤマメとサクラマスは形態的特徴（大きさ、パーマークと「腹部青斑点」の有無）で判別できる。
- 適用範囲: ヤマメ vs サクラマス / 群馬県系資料。「腹部青斑点」の語は要約の表記のまま。**他資料と整合する表現か未確認（要原典確認、誤訳・誤要約の可能性あり）**。
- 出典（候補）: 群馬県 https://www.pref.gunma.jp/page/20806.html ／ https://www.pref.gunma.jp/uploaded/attachment/46107.pdf
- 証拠: [B（疑義あり）]要約文より「ヤマメとサクラマスは形態的な特徴（大きさ、パーマークと腹部青斑点の有無）から判別が可能です」。

### F-21
- 主張/値: **北海道の河川のヤマメで尾叉長 0+: 14.1cm、1+: 19.4cm、2+: 23.2cm、3+: 28.2cm（「特に成長が良かった個体の例」とされる）。** 同じ調査地で採集された 0+ ヤマメの平均尾叉長は 8.1cm。抱卵ヤマメの鱗の年輪間隔の計測で 2+ に 23.2cm に達していた。
- 適用範囲: ヤマメ（河川型）/ 北海道（河川名は要約の表記が「人住内川」で誤記の疑い、確認不能）/ 良好成長個体。14.1cm は「年輪形成時の逆算体長」と推定されるが、**逆算か実測かは要約に明示なし**。同一調査地の 0+ 平均 8.1cm（採集時期は要約に無し）と同時期の値ではない可能性が高い。
- 出典（候補）: https://fra.repo.nii.ac.jp/record/2009718/files/sapporo_sk_3_8.pdf （Q10・Q13・Q29 の3クエリすべてのヒットに含まれる）／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/84947/32_p445-451_LT80.pdf （Q10 のみ）。
- 証拠: [A]（水産研究機関の報告と推定）要約文より「0+歳で14.1 cm、1+歳で19.4 cm、2+歳で23.2 cm、3+歳で28.2 cmの尾叉長」「0+歳ヤマメの平均尾叉長は8.1 cm」。要原典確認（体長型・サイズ範囲・n 不明）。

### F-22
- 主張/値: **青森県の0歳ヤマメの体長は、7月18日に平均6.65cm、9月12日に平均7.23cm**。
- 適用範囲: ヤマメ（河川型）/ 当歳（0+）/ 青森県 / 測定量は「体長」（SL か FL かは要約に無し）、調査河川・年・n は要約に無し。
- 出典（候補）: 青森県産業技術センター内水面研究所 https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf ／ https://www.aomori-itc.or.jp/_files/00230483/241-244.pdf ／ https://www.aomori-itc.or.jp/_files/00228138/259-264.pdf （Q10 のヒット群。どれかは特定不能）
- 証拠: [B/A]（公的研究機関報告）要約文より「0才ヤマメの体長は7月18日時点で平均6.65 cm、9月12日時点で平均7.23 cm」。要原典確認。

### F-23
- 主張/値: 雌ヤマメの成熟年齢の記述は資料により幅がある: (i) 「雌はしばしば2年目に成熟」（F-03）、(ii) 河川残留雌は **1+ で成熟し稀**（F-12）、(iii) 一つの要約が「2+ で個体群の80%が性成熟」と記載（種・性別・河川は要約に無し）。さらに要約は「雄は早期に雌より速く成長する傾向」とも記すが対象不明。
- 適用範囲: ヤマメ／masu salmon（河川型）。(iii) は長野県の調査資料（調査期間 2002年5月14日〜9月29日の記載あり）が候補だが、対象魚種がヤマメと確認できない（イワナ・アマゴと混在するヒット群）。
- 出典（候補・特定不能）: 長野県 https://www.pref.nagano.lg.jp/kanken/johotekyo/kenkyuhokoku/hozen/documents/kh13_55_59.pdf ／ Q14 の他ヒット
- 証拠: [C]（対象種・文書とも不確実）要約文より「2+ year old fish… most individuals reaching sexual maturity at 2+ years (80% of population)」。**採用不可に近い。仕様には使わず、リードとして記録**。

### F-24
- 主張/値: **降海型 masu salmon（日本海側の22集団、北緯37°〜49°）では、雄の体サイズと相対体サイズは緯度とともに増加し、雌の体サイズは緯度と相関しない。雄の増加により、サイズ二型の向きは北緯45°付近で逆転する。** 説明仮説は、降海の性差に由来する実効性比の上昇または降海型雄への性選択の強まり。別研究（Weir et al. 2016, Am. Nat.）は、スニーカー雄を持つ種（大西洋サケ・masu salmon）で、闘争雄の体サイズとサイズ二型（雄:雌）が緯度とともに増加するとした（スニーカー雄がいない種では見られない）。
- 適用範囲: **PROXY:降海型サクラマス（成魚）**。河川型ヤマメの地域差ではない。
- 出典: Tamate & Maekawa (2006) Latitudinal variation in sexual size dimorphism of sea-run masu salmon, Oncorhynchus masou, Evolution 60:196–201 https://bioone.org/journals/evolution/volume-60/issue-1/05-324.1/LATITUDINAL-VARIATION-IN-SEXUAL-SIZE-DIMORPHISM-OF-SEA-RUN-MASU/10.1554/05-324.1.full ／ Weir, Kindsvater, Young & Reynolds (2016) Sneaker males affect fighter male body size and sexual size dimorphism in salmon, Am. Nat. https://datadryad.org/dataset/doi:10.5061/dryad.76rd1 ／ https://www.researchgate.net/publication/304068754_Sneaker_Males_Affect_Fighter_Male_Body_Size_and_Sexual_Size_Dimorphism_in_Salmon
- 証拠: [A]（査読論文、論文名・著者・誌名・年が要約に明示）要約文より「Male size and the relative body size increased with latitude, but female size did not… reversal of sexual size dimorphism, with the switch-point being around 45°N.」

### F-25
- 主張/値: 回遊型集団の研究で、**同年齢では雌成魚の体長が雄より大きい（雌優位のサイズ二型）**ことが報告されている。
- 適用範囲: masu salmon の回遊型（降海型）。河川型ヤマメの値ではない（PROXY:回遊型）。年齢・地域・計測量は要約に無し。
- 出典（候補・特定不能）: Zool. Sci. 32(4) Interpopulation Comparison of Sex-Biased Mortality and Sexual Size Dimorphism… https://bioone.org/journals/zoological-science/volume-32/issue-4/zs140287/Interpopulation-Comparison-of-Sex-Biased-Mortality-and-Sexual-Size-Dimorphism/10.2108/zs140287.full ／ Q32 のヒット群（Futamura et al. 2022 など）。
- 証拠: [A（候補）]要約文より「female adults were larger in body length than males of the same age, indicating female-biased sexual size dimorphism (SSD)」。F-24 と向きが異なる → 「3. 矛盾」。要原典確認。

### F-26
- 主張/値: ヤマメの分布は、北海道、本州の日本海側、太平洋側は伊豆半島以北、九州は西側および番匠川以北の東側。アマゴは伊豆半島以西の太平洋側、四国、九州北東部に分布し、サクラマス系とは分布が重ならない。北海道ではヤマメを「ヤマベ」と呼ぶ。
- 適用範囲: ヤマメ（O. m. masou 河川型）／アマゴ。地域差の外観は含まない。
- 出典（候補）: 環境省資料 https://www.env.go.jp/council/content/i_07/900428352.pdf ／ 水産研究・教育機構 https://fra.repo.nii.ac.jp/records/131 ／ 「ヤマベ」: Wikipedia「Yamame」https://wikipedia.com/wiki/Yamame （C）
- 証拠: [B]（Q24 要約。文書特定不能）要約文より「Yamame inhabit… throughout Hokkaido, the Japan Sea side of Honshu, north of the Izu Peninsula on the Pacific side, and the western side of Kyushu…」。

### F-27
- 主張/値: 魚類の体色変化の一般機構: 背景の明るさの変化に応じ、ホルモンと神経が色素胞に作用して色素顆粒が分散・凝集する。急な温度変化は体色変化の速度に影響する。別の魚種では、優位個体は明るい基質により馴染み、従属個体は暗色を示した。**ヤマメ／サケ科に特化した資料は見つからなかった**。
- 適用範囲: **PROXY:種不明の魚類一般**（一部は両生類・ハゼ類の資料が混在）。ヤマメ／サケ科の実測値ではない。
- 出典（候補・特定不能）: https://orb.binghamton.edu/research_days_posters_2024/52 ／ Q15 のヒット群の他資料。
- 証拠: [C/PROXY]要約文より「Fish can change body color in response to changes in background brightness through hormones and nervous system signals acting on chromatophores」「dominant fish matching light substrates more effectively while subordinates displayed darker coloration」。**3Dモデルの季節・環境色の仕様根拠としては不足**。

### F-28
- 主張/値: ヤマメとアマゴでスモルト化には有意な性差があり、**北海道では雌のほぼ全てがスモルト化する**。青色の水槽での飼育でスモルト化を促進できるとの記述がある（飼育・増殖研究）。
- 適用範囲: ヤマメ／アマゴ（飼育・増殖研究の要約。「北海道」が飼育個体群か野生個体群か不明）。
- 出典（候補・特定不能）: 山形県 https://www.pref.yamagata.jp/documents/6277/seika0706.pdf ／ https://www200.pref.yamagata.jp/documents/6277/22kenkyuuseika3.pdf ／ 滋賀県 https://www.pref.shiga.lg.jp/file/attachment/5161341.pdf ／ 青森県 https://www.aomori-itc.or.jp/_files/00225076/360-362.pdf （Q2 のヒット）
- 証拠: [C/B（要約が一般化しすぎ）]要約文より「nearly all females in Hokkaido undergoing smoltification, and it can be enhanced by rearing them in blue-colored tanks」。F-12 の湖の雌率78–89% と同方向。

---

## 3. 資料間の矛盾・不一致

1. **河川型ヤマメの成熟期の体色**（最重要）: F-02「黒ずむが桜色にならない」／ F-03「黒っぽい体に薄桃〜濃紅の婚姻色が体側から鰭にかけ不定形に出る」／ F-04（国交省 多言語DB）「背が暗化、体側の縞が鮮紅色となり腹部で淡色の縦帯に融合、桜色になる」。F-04 は対象型（河川型／降海型）が不明で、F-03 は出典が百科事典的。F-02〜F-03 の差は「桜色」の定義（明確な桜色か、不定形の淡桃〜紅か）の違いでもありうるが**要約からは解消できない**。実装時は写真ストリームの観察（雄の産卵期個体）で決める。降海型（F-01）は黒化＋雲状の桜色斑で比較的記述が一致。
2. **種／生活史型ラベルの入れ替わり**: Q1 は F-01 の記述を「ヤマメ」と、Q20 は同じヒット群で「サクラマス」と要約した。降海型の記述が河川型に混入する危険があるため、F-01 は PROXY 扱い。
3. **背の基調色**: 黄褐色（Q20）と暗青緑（Q11）。同じ個体群内の個体差・照明・サイズ差かは不明。r01 は「暗青緑〜褐色」としており両者を包含する範囲として扱える。
4. **河川型雄のサイズ**: F-07 は河川型 10–20cm（測定量不明）、F-10 は成熟下限 FL 70mm(0+)〜90mm超(1+)、F-21 は良好成長個体で 2+ 23.2cm・3+ 28.2cm。F-07 の「10–20cm」は早熟雄（parr 型）の範囲を指す可能性があるが、要約に明示はない。
5. **当歳のサイズ**: F-21（14.1cm＝年輪逆算の可能性）、F-21 同調査地の採集平均 8.1cm、F-22（青森 7月 6.65cm→9月 7.23cm）。測定法（逆算／実測、FL／体長）、時期、地域が異なるため同一スケールで比較不可。仕様では当歳の秋の実測 7–8cm 台を採り、14cm は「満1歳時の逆算値候補」として扱う。
6. **雄と雌のサイズ二型の向き**: F-25（同年齢で雌が大きい）と F-24（北緯45°以北で雄が大きく、二型の向きが逆転）。後者は降海型集団間の緯度クラインで、前者は条件の違う集団の記述の可能性。いずれも降海型であり、河川型には適用できない。
7. **雌の成熟年齢**: F-12「1+（稀）」／ F-03「2年目」／ F-23「2+ で80%」。「2年目」が 1+ か 2+ か、F-23 の対象種が不明のため確定不可。
8. **要約への他種混入**: Q9 の要約は産卵期の雄の体色を説明するのにシシャモの記述（胸鰭・腹鰭が丸みを帯び臀鰭が大きくなる）を持ち出した。ヤマメの資料ではないため不採用（本書では使用していない）。

---

## 4. 見つからなかったこと（Gaps）

3Dモデル／アニメ／行動実装に必要だが確認できなかった事項。影響度（高/中/低）は仕様への影響の調査員判断。

| # | 欠落事項 | 影響 | 備考 |
|---|---|---|---|
| G1 | **河川型ヤマメの性差形態の定量値**（頭長・上顎長・吻長・体高・鰭長）。雌雄の体高差。 | 高 | 降海型雄の hump depth・吻長が代表形質という記述のみ（F-08）。数値は r01（韓国産マス PROXY）を参照。 |
| G2 | **河川型成熟雄の鼻曲り（kype）の有無・大きさ・形状**、顎歯の肥大程度。 | 高 | 早熟雄は二次性徴ほぼ未発達（F-09）。大型の河川型雄・2+以降の雄は不明。 |
| G3 | **産卵期の色の分布・色相の定量**（体側のどこが何色か、鰭の色変化、腹部）。F-02/03/04 の不一致の解消。 | 高 | 写真ストリームで補う必要。 |
| G4 | **産卵後個体（ケルト）の外観**（痩せ・黒ずみ・鰭損傷・体表の損傷・白濁など）。 | 中 | 本調査で一切取得できず（Q9）。 |
| G5 | **季節別体色（春〜冬）**。 | 中 | 季節性は産卵（秋）・降海（4–6月）のみ（F-14, F-18）。 |
| G6 | **水温・餌・照度・背景による体色変化（ヤマメ／サケ科）**。 | 中 | 種不明の一般論のみ（F-27）。 |
| G7 | **地域差（北海道／東北／日本海側／太平洋側）の体色・パーマークの違い**。 | 中 | 分布のみ（F-26）。r01 に丹沢の沢ごとの差の記述あり。 |
| G8 | **成長段階別のパーマーク**（稚魚→parr→成魚の個数・濃さ・輪郭・消退）。銀化魚の残存パーマークの濃度。パーマーク出現体長。 | 高 | 個数7–10のみ（F-19, r01）。 |
| G9 | **河川残留型の割合**（地域別の定量）。 | 中 | 雌の銀化率・成熟 parr の性比のみ（F-12, F-28）。 |
| G10 | **銀化魚の外観詳細**（鰭縁の黒化・尾鰭の暗色・体高の変化・肥満度低下）。 | 中 | 未実行（予算切れ）。r01 は「スモルト化で細身・銀化・肥満度低下」を引用。 |
| G11 | **年齢-体長の標準値**（地域・河川別、体重・肥満度）。 | 中 | 北海道1例（F-21）と青森0+（F-22）のみ。 |
| G12 | **稚魚期（卵黄嚢期〜浮上〜稚魚）の外観**。 | 低 | 未調査。 |
| G13 | **成熟雄の体高増加の定量**。 | 中 | 「体高が高い」との定性記述のみ（F-05）。 |
| G14 | **視覚資料（写真・映像）による検証**。 | 高 | 本ストリームは視覚資料にアクセスできない。 |

### 未確認の有望ヒット（要約に内容が出なかった。原典確認用リード）
- 大型アマゴ・ヤマメの形態及び生態に関する知見（水産増殖 39(3):279）: https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja ← **大型個体の形態**（r01 が引用する Kato 1991 と同一かは未確認）
- 石田力三「講座 ヤマメ」調理科学 13(1):27: https://www.jstage.jst.go.jp/article/cookeryscience1968/13/1/13_27/_pdf/-char/ja
- 関泰夫・小島将男(1977)「吾妻川起源のヤマメの銀毛化変態と成熟に関する研究」水産増殖 24(2): https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja ← **銀毛化と成熟（ヤマメ）の直接資料。最優先で全文確認。**
- Futamura et al. (2022) masu smolt size selective mortality: https://sites.warnercnr.colostate.edu/kanno/wp-content/uploads/sites/112/2022/12/Futamura-et-al.-2022-masu-smolt-size-selective-mortality.pdf
- Skin reflectance as a non-lethal measure of smoltification for juvenile salmonids（USGS）: https://pubs.usgs.gov/publication/70180320 ← 銀化の反射率（PROXY）
- 青森 内水面研究所（体色・背景に関するヒット）: https://www.aomori-itc.or.jp/_files/00061476/343-346.pdf
- 埼玉県 ヤマメ関連: https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html
- Studies on the biology of sexually mature male salmon parr, Salmo salar, in insular Newfoundland（PROXY:大西洋サケ、成熟雄 parr）: https://memorial.scholaris.ca/items/4fecd773-099a-43e3-910a-11f72d099503
- Primary and secondary sexual characters in alternative reproductive tactics of Chinook salmon（PROXY）: https://www.sciencedirect.com/science/article/abs/pii/S0016648011004552
- Zool. Sci. 32(4) 性特異的死亡率とサイズ二型（F-25 の候補）: https://bioone.org/journals/zoological-science/volume-32/issue-4/zs140287/Interpopulation-Comparison-of-Sex-Biased-Mortality-and-Sexual-Size-Dimorphism/10.2108/zs140287.full

### 検索予算の枯渇により未実行のクエリ（追加調査が許可された場合の優先順）
1. 関泰夫 小島将男 1977 ヤマメ 銀毛化変態 成熟 （内容検索）／ ヤマメ 銀毛 外観 鰭縁 黒色 尾鰭
2. サクラマス 銀化 パーマーク 消失 体長 閾値（Utoh 1976 系、北大紀要）
3. ヤマメ 産卵後 外観 / masu salmon kelt appearance / post-spawning mortality 河川残留 雄 雌
4. ヤマメ 性差 頭長 顎長 体高 雌雄 計測 / Oncorhynchus masou sexual dimorphism head length jaw length body depth
5. ヤマメ 地域差 パーマーク 数 北海道 東北 日本海側 太平洋側 / 朱点 個体群差
6. サケ科 体色 背景 適応 照度 水温 メラニン（Oncorhynchus mykiss／Salmo salar／Salvelinus 等 PROXY）
7. ヤマメ 季節 体色 冬 春 夏 / 流域 河川残留型 割合
8. masu salmon yamame male kype lower jaw resident mature 大型 河川型 雄 鼻曲がり
9. ヤマメ 稚魚 パーマーク 出現 体長 / 浮上稚魚 外観

---

## 5. 出典一覧（検索結果に出た URL のみ。重複排除。採用候補と、リードとして記録したものを含む）

**学術論文・大学紀要・研究機関報告（A 相当候補）**
- Ugachi et al. (2023) Size-driven parr-smolt transformation in masu salmon, Sci. Rep. — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ ／ https://link.springer.com/10.1038/s41598-023-43632-7 ／ https://doaj.org/article/06cddc561f3a4e3d93b1ec547033a879
- Kitanishi et al. (2012) Fine scale relationships between sex, life history, and dispersal of masu salmon, Ecol. Evol. 2(5):920–929 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3399158/
- Tamate & Maekawa (2006) Latitudinal variation in sexual size dimorphism of sea-run masu salmon, Evolution 60:196–201 — https://bioone.org/journals/evolution/volume-60/issue-1/05-324.1/LATITUDINAL-VARIATION-IN-SEXUAL-SIZE-DIMORPHISM-OF-SEA-RUN-MASU/10.1554/05-324.1.full
- Weir, Kindsvater, Young & Reynolds (2016) Sneaker males affect fighter male body size and sexual size dimorphism in salmon, Am. Nat. — https://datadryad.org/dataset/doi:10.5061/dryad.76rd1 ／ https://www.researchgate.net/publication/304068754_Sneaker_Males_Affect_Fighter_Male_Body_Size_and_Sexual_Size_Dimorphism_in_Salmon
- Sexual selection on mature male parr of masu salmon (Oncorhynchus masou)… — https://www.researchgate.net/publication/225706209_Sexual_selection_on_mature_male_parr_of_masu_salmon_Oncorhynchus_masou_Does_sneaking_behavior_favor_small_body_size_and_less-developed_sexual_characters
- Secondary sexual characters and sperm traits in coho salmon Oncorhynchus kisutch（PROXY）— https://www.researchgate.net/publication/45827007_Secondary_sexual_characters_and_sperm_traits_in_coho_salmon_Oncorhynchus_kisutch ／ https://core.ac.uk/display/102054948
- Utoh H. (1976) サクラマスの降海型と河川残留型の分化機構に関する研究 1，北大水産学部研究彙報 26(4):321–326 — https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23571/26(4)_P321-326.pdf ／ https://eprints.lib.hokudai.ac.jp/dspace/handle/2115/23571
- 北大水産学部研究彙報等 — https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22122/1_P39-42.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23606/28(2)_P66-73.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22184/7(2)_P87-108.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/38510/79-83-neo-science.pdf ／ https://eprints.lib.hokudai.ac.jp/dspace/handle/2115/38510 ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/84947/32_p445-451_LT80.pdf
- 水産研究・教育機構 — https://fra.repo.nii.ac.jp/record/2009718/files/sapporo_sk_3_8.pdf ／ https://fra.repo.nii.ac.jp/record/2009615/files/sapporo_sk_13_3.pdf ／ https://fra.repo.nii.ac.jp/records/131
- 日本水産学会誌 等（jstage）— https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_22-00024/_pdf ／ https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_16-00006/_article/-char/ja/ ／ https://www.jstage.jst.go.jp/article/nl2001jsce/2002/104/2002_104_104_24/_pdf/-char/ja ／ https://www.jstage.jst.go.jp/article/jji/58/2/58_171/_pdf ／ https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja ／ https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja ／ https://www.jstage.jst.go.jp/article/cookeryscience1968/13/1/13_27/_pdf/-char/ja
- 日本生態学会大会要旨 — https://esj.ne.jp/meeting/abst/59/P2-223J.html ／ https://esj.ne.jp/meeting//abst/61/S05-2.html
- その他学術 — https://link.springer.com/article/10.1007/s10641-005-3039-1 ／ https://bioone.org/journals/zoological-science/volume-32/issue-4/zs140287/Interpopulation-Comparison-of-Sex-Biased-Mortality-and-Sexual-Size-Dimorphism/10.2108/zs140287.full ／ https://sites.warnercnr.colostate.edu/kanno/wp-content/uploads/sites/112/2022/12/Futamura-et-al.-2022-masu-smolt-size-selective-mortality.pdf
- PROXY（サケ科一般）— https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf ／ https://pubs.usgs.gov/publication/70180320 ／ https://www.usgs.gov/publications/skin-reflectance-non-lethal-measure-smoltification-juvenile-salmonids ／ https://www.sciencedirect.com/science/article/abs/pii/S0016648011004552 ／ https://memorial.scholaris.ca/items/4fecd773-099a-43e3-910a-11f72d099503

**公的機関・自治体・研究機関の解説（B 相当候補）**
- 北海道立総合研究機構 — https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ https://www.hro.or.jp/upload/54755/ima1034.pdf
- 北海道庁 — https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
- 国土交通省 多言語DB — https://www.mlit.go.jp/tagengo-db/en/R2-00580.html ／ https://www.mlit.go.jp/tagengo-db/R2-00580.html
- 農林水産研究（agriknowledge）— https://agriknowledge.affrc.go.jp/RN/2010927243.pdf ／ https://agriknowledge.affrc.go.jp/RN/2030927242.pdf
- 環境省 — https://www.env.go.jp/council/content/i_07/900428219.pdf ／ https://www.env.go.jp/council/content/i_07/900428352.pdf
- 青森県産業技術センター内水面研究所 — https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf ／ https://www.aomori-itc.or.jp/_files/00230483/241-244.pdf ／ https://www.aomori-itc.or.jp/_files/00228138/259-264.pdf ／ https://www.aomori-itc.or.jp/_files/00225076/360-362.pdf ／ https://www.aomori-itc.or.jp/_files/00061476/343-346.pdf
- 長野県 — https://www.pref.nagano.lg.jp/kanken/johotekyo/kenkyuhokoku/hozen/documents/kh13_55_59.pdf
- 山形県 — https://www.pref.yamagata.jp/documents/6277/seika0706.pdf ／ https://www200.pref.yamagata.jp/documents/6277/22kenkyuuseika3.pdf
- 滋賀県 — https://www.pref.shiga.lg.jp/file/attachment/5161341.pdf
- 群馬県 — https://www.pref.gunma.jp/page/20806.html ／ https://www.pref.gunma.jp/uploaded/attachment/46107.pdf
- 島根県 — https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html
- 埼玉県 — https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html
- 奥多摩さかな養殖センター — https://www.tokyo-aff.or.jp/site/aquafarming/yamame.html
- 本田技研 釣り図鑑 — https://www.honda.co.jp/fishing/picture-book/yamame/ ／ https://www.honda.co.jp/fishing/picture-book/stn-kawa-koshou/ ／ https://www.honda.co.jp/fishing/picture-book/sakuramasu/index.html

**Wikipedia 系（C）**
- https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ／ https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9 ／ https://wikipedia.com/wiki/Yamame ／ https://en.wikipedia.com/wiki/Kype
- 魚体色変化（種不明・PROXY）— https://orb.binghamton.edu/research_days_posters_2024/52

---

## 6. 検索ログ

有効検索 33回 + WebFetch 1回（遮断）+ 予算枯渇により「実行されず」3回。Q 番号は実行順の通し番号で、本文中の「Q○」参照はこの表の番号に対応する（WebFetch を Q6 として数えている）。「採用F」は当該クエリの要約が根拠として使われた Finding（「なし」は採用できる記述が得られなかった）。1回あたりの返却は約8〜10件。

| Q | クエリ | 採用F |
|---|---|---|
| 1 | ヤマメ 婚姻色 鼻曲がり 産卵期 雄 雌 違い | F-01 |
| 2 | ヤマメ 銀毛 スモルト 河川残留型 雄 早熟 | F-28 |
| 3 | masu salmon precocious male parr maturation morphology | F-09, F-10 |
| 4 | masu salmon smolt silvering parr marks disappear | F-18(PROXY) |
| 5 | Oncorhynchus masou spawning male kype secondary sexual characteristics | F-08 |
| 6 | （WebFetch）pref.hokkaido.lg.jp/sr/gid/fis023.html | EGRESS_BLOCKED（以後試行せず） |
| 7 | サクラマス 二次性徴 雄 体高 吻長 降海型 河川型 比較（allowed: jstage, hokudai, nii, cir.nii, esj） | F-05, F-06 |
| 8 | masu salmon anadromous male hump depth snout length secondary sexual traits sneaker parr（extended） | F-07, F-08, F-09 |
| 9 | ヤマメ 産卵後 体色 痩せ 鰭 損傷 雄 黒ずむ | F-03（G4 は取得不能。シシャモの記述が混入→不採用） |
| 10 | ヤマメ 年齢 体長 成長 1歳 2歳 3歳 尾叉長 河川 | F-21, F-22 |
| 11 | ヤマメ 季節 体色 変化 春 夏 秋 冬 パーマーク | F-19（季節差は取得不能） |
| 12 | Size-driven parr-smolt transformation in masu salmon Oncorhynchus masou | F-15 |
| 13 | ヤマメ 河川残留型 割合 雌 雄 降海 スモルト化 性差 体長 | F-21（再現） |
| 14 | ヤマメ 尾叉長 年齢査定 鱗 0+ 1+ 2+ 平均 河川 渓流 成長（allowed: nii, hokudai, jstage, aomori, nagano, gifu） | F-23（採用不可に近い） |
| 15 | ヤマメ 体色 背景 適応 水温 照度 体色変化 黒化 色素胞 | F-27(PROXY) |
| 16 | masu salmon parr mark number size smolt silvering guanine skin color change | F-16, F-17 |
| 17 | yamame Oncorhynchus masou masou river resident male nuptial coloration spawning | F-04, F-14(C) |
| 18 | ヤマメ 産卵期 雄 体色 赤み 婚姻色 産卵床 渓流 観察 | F-02 |
| 19 | ヤマメ 成熟 雄 桜色にならない 体色 黒ずむ 河川残留型 サクラマス 婚姻色 桜色（extended） | F-02, F-03 |
| 20 | サクラマス 婚姻色 体側 赤 桃色 雄 パーマーク 赤みを帯びる 遡上 銀毛 ブナ毛 | F-01, F-19 |
| 21 | サクラマス 河川型 雄 パーマーク 成熟 雄 体色 暗色 体高 銀化魚 比較 外部形態（allowed: jstage, esj, nii, hokudai） | F-05 |
| 22 | 吾妻川起源のヤマメの銀毛化変態と成熟に関する研究 関泰夫 小島将男 水産増殖 | なし（論文本体はヒットせず。タイトルは Q19 のヒットから取得） |
| 23 | サクラマス 降海型と河川残留型の分化機構に関する研究 早熟な河川残留型の体生長と性成熟 | F-13 |
| 24 | 大型アマゴ・ヤマメの形態及び生態に関する知見 水産増殖 39 | F-26（リード: 論文本体の内容は出ず） |
| 25 | ヤマメ（サクラマス） 群馬県 水産試験場 特徴 パーマーク 産卵期 | F-18, F-20 |
| 26 | Sexual selection on mature male parr of masu salmon Oncorhynchus masou sneaking body size sexual characters | F-09 |
| 27 | masu salmon smolt sex ratio females migrate males residents proportion of precocious male parr Hokkaido stream | F-12 |
| 28 | Oncorhynchus masou masou iteroparity post-spawning survival resident female male repeat spawner | なし（スチールヘッド等 PROXY の一般論のみ） |
| 29 | ヤマメ 雌 成熟 年齢 2歳 産卵 後 生残 繰り返し産卵 再成熟 河川残留 | F-14, F-21 |
| 30 | Latitudinal variation in sexual size dimorphism of sea-run masu salmon Oncorhynchus masou Evolution 2006 fork length hump | F-24 |
| 31 | Fine scale relationships between sex, life history, and dispersal of masu salmon fork length mature male parr | F-12(候補) |
| 32 | masu salmon fluvial form mature male fork length age 0+ 1+ 2+ resident female maturation size | F-10, F-11, F-25 |
| 33 | Sneaker males affect fighter male body size and sexual size dimorphism in salmon masu salmon head hump snout | F-24 |
| 34 | 早熟雄 他の未成熟魚に較べると体高が高く 体色が暗色化 パーマークがくっきり 海水適応能 サクラマス | F-05（出典候補の追加のみ。新規記述なし） |
| 35〜37 | オソコリンカス 曲った吻 サクラマス 二次性徴 鼻曲り 河川型 雄 ／ サクラマス 銀化 パーマーク 消失 体長 閾値 スモルト 尾叉長… ／ ヤマメ 銀毛 パーマー 消える 鱗 グアニン 銀毛魚 外観… | **実行されず（WebSearch 上限 200/200 到達）** |

注: 返却件数ベースの「有用ヒット数」は、要約文が文書を特定せず混合しているため信頼できる指標にならないと判断し、代わりに「採用F」列で有用性を示した。
