# r03 独立検証レポート（懐疑的レビュー）— ヤマメの生活史段階・性差・婚姻色

- 検証対象: /home/user/gerupamasini/docs/yamame/research/r03_lifestage_sex.md（元ファイルは未変更）
- 検証者の制約: WebSearch の要約文のみ（論文全文は読めない）。mode は全て "standard"、**WebSearch 呼び出し 11 回**（割当 11 回ちょうど）。WebFetch は未使用。
- 記憶由来の知識は本書では使っていない（M ランクの記載は「推測」と明示した箇所のみ）。
- 検証対象は 10 クレーム群（元ファイルの F-02/03/04、F-12、F-28、F-16、F-09、F-07、F-13/14、F-10、F-21/22、F-19/18）。F-05（早熟雄の外観）は 1 回試みたが何も得られず「未検証」のまま（末尾参照）。
- 判定の定義: CONFIRMED-MULTI=独立 2 資料以上が一致 / CONFIRMED-SINGLE=1 資料（同一論文の別ホスト含む）/ CONTRADICTED=反証あり / UNVERIFIABLE=今回の検索では確認も反証もできず。
- **重要な注意**: 本検証の「新規出典」も元調査と同様に検索エンジンの機械要約であり、要約が URL に紐づかない事例（下記 V1, V7, V10）がある。出典 URL は「候補」。数値を仕様に入れる前に原典確認が必要、という元ファイルの警告は有効のまま。

---

## 1. 検証結果の表

| 主張ID | 主張（要約） | 判定 | 補正値/範囲 | 新規出典URL | 備考 |
|---|---|---|---|---|---|
| V1a | F-02: 河川で成熟したヤマメは黒ずむが**桜色にはならない** | **CONTRADICTED（絶対形は不可）** | 「桜色には全くならない」は採用不可。国立科学博物館DB等の要約は「産卵期が近づくと体が黒ずみ桜色のまだら模様が現れる。これは雄の婚姻色」と記載（種全体の記述で、河川型限定かは不明）。実装は「黒化＋淡い不定形の桜色斑（個体差・雄>雌）」を既定にし、写真(P)で最終決定 | https://www.kahaku.go.jp/research/db/zoology/uodas_freshdb/area/salmonidae/055.html ／ https://www.tokyo-zoo.net/encyclopedia/species_detail?move=-1&species_code=280 | 2 クエリ(S5, S8)で同一文が再現。ただし S8 の同ページは「サクラマス（ヤマメ）」と両型を一括する項目で、**ヤマメ限定の記述とは言えない**。F-02 の「桜色にならない」は元調査でも出典特定不能(B)。ランク: B |
| V1b | F-03: 繁殖期のヤマメは黒っぽくなり、淡桃〜濃紅の婚姻色が体側から鰭に不定形に出る | CONFIRMED-SINGLE（部分） | 「黒化＋桜色(桃色)のまだら」までは再現。**「濃紅」「鰭にも出る」「雌は2年目に成熟」は今回確認できず** | 同上（kahaku） | 色の強度・分布の定量は依然 Gap(G3)。ランク: B（部分）/C（残部） |
| V1c | F-04: 国交省多言語DB「成熟個体は背が暗化し、体側の縞が緋色〜深紅になり腹部で淡色の縦帯に融合」 | CONFIRMED-SINGLE（文面の存在のみ。**適用範囲を再設定**） | 同文が再現し、直後に「For this reason, it was given the name cherry salmon」と続くことが判明。→ これは**サクラマス（種名の由来を説明する文脈＝降海型/種レベル）の記述**と解釈するのが妥当で、河川型ヤマメの仕様根拠にはしない。「stripes」がパーマークか否かは依然不明 | https://www.mlit.go.jp/tagengo-db/common/001549246.docx ／ https://www.mlit.go.jp/tagengo-db/common/001564130.pdf（S6 のヒット。内容は未確認） | 「名の由来」の一文は検索要約の追記で、MLIT 文書そのものの一節かは未確認。推測を含む（解釈）。ランク: B（適用範囲は解釈） |
| V2a | F-12(数値): 銀化魚の雌率 1+ で78.0%・2+ で88.9%、成熟 parr 78尾すべて雄（0+ 36尾=46.2%、1+ 41尾=52.6%） | **UNVERIFIABLE** | 数値は 2 つの検索(S1, S11)でも再現せず。S11 の要約は「Shumarinai 湖の論文の具体的パーセントは検索結果に含まれない」と明記。**数値は仕様に入れない**（PROXY:湖沼型、湖名・年も未確認） | — | 元の「Shumarinai Lake とされるが帰属未確認」の疑義を解消できず |
| V2b | F-12(定性): 雌は大半が回遊型、河川残留雄は雌より小型で早く成熟し、スニーキングに頼る | **CONFIRMED-MULTI** | (i) Kitanishi 2012 要約「淡水残留雄は回遊群より1桁小さいサイズで成熟し、スニーク交尾に依存。雌の大半は回遊型（体サイズが繁殖力を左右）」。(ii) 北大 Fish Biol. 93:490–500 候補の要約「北海道では雌の大半と雄の少数が降海型」。(iii) 別要約「スモルトの性比は南で雌:雄=3〜4:1、北で1:1に近づく（南ほど雄が残留・早熟）」 | https://onlinelibrary.wiley.com/doi/10.1002/ece3.228 ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3399158/ ／ https://eprints.lib.hokudai.ac.jp/dspace/bitstream/2115/75360/1/Fish%20Biol._93_490-500.pdf ／ https://besjournals.onlinelibrary.wiley.com/doi/10.1111/1365-2656.12240（Morita 2014: 水温上昇・初期成長改善で残留雄の出現が増加） | (iii) の出典は要約からは特定不能（候補: https://link.springer.com/chapter/10.1007/978-3-031-44389-3_12 ）。**個体群生成の性比は地域依存（北=ほぼ1:1〜南=雌3〜4倍）で、固定値にしない**。副次情報: 遺伝的雄マーカーを持つ表現型雌が河川により最大67%（Yamamoto 2012, https://pubmed.ncbi.nlm.nih.gov/22268436/ ）— 性判定と見た目の関係には影響しないが、性比の解釈に注意 |
| V3 | F-28: 北海道では雌の**ほぼ全て**がスモルト化する | **CONTRADICTED（誇張）** | 「雌の大半(majority)と雄の少数(minority)が降海型」が妥当。「ほぼ全て」は採用不可。F-12 の雌率78〜89%は湖沼型 PROXY の別現象 | https://eprints.lib.hokudai.ac.jp/dspace/bitstream/2115/75360/1/Fish%20Biol._93_490-500.pdf（候補） | 元調査自身も「要約が一般化しすぎ」と注記済み。今回の独立クエリでも"majority of females"と記述され、nearly all とは一致せず |
| V4 | F-16: 給餌操作した幼魚で FL 12cm 超の個体のみ鰓 NKA 活性が上昇 | **CONFIRMED-SINGLE** | FL 12 cm。**追加ニュアンス**: 短日条件では 6 月に 12 cm を超えても銀化の兆候なし → 12cm は「必要条件」であり「十分条件」ではない。さらに 8 月に光周期によらない NKA の追加ピーク（F-15 も再確認） | https://www.nature.com/articles/s41598-023-43632-7 ／ https://pubmed.ncbi.nlm.nih.gov/37789097/ | 同一論文(Ugachi 2023)のミラーなので独立 2 資料にはならない。**外観(銀白化)の閾値ではなく生理指標**。関連タイトルのみ: Interaction between body size and commencement of smoltification in masu salmon（PubMed 40040271）、アマゴ版 https://link.springer.com/article/10.1007/s12562-015-0943-y。ランク: A |
| V5 | F-09: 早熟雄(成熟parr)は小型で二次性徴がほぼ無く、スニーキング。体サイズ以外の形態形質は繁殖成功に寄与しない | **CONFIRMED-SINGLE** | 出典が特定できた: **Koseki & Maekawa (2000) Behav. Ecol. Sociobiol.**。「スニーキングは小型を有利にする」という予測に反し、parr 間では**相対的に大きい体サイズが有利**（parr 内の優劣関係による）。降海型雄は鉤状吻(hooked snout)と盛り上がった背(humped back) | https://link.springer.com/article/10.1007/s002650000231 | 元調査(researchgate)と同一論文の出版社版抄録で再確認。F-07 の cm 数値は今回の要約に出ず。ランク: A |
| V6 | F-07: 雄の降海型 FL 30–50cm（3–4歳成熟）、河川型 10–20cm | **UNVERIFIABLE** | 数値の再現なし。隣接データ: 国立科学博物館DBの要約は最大サイズとして「降海個体 約60cm／陸封個体 約30cm」（測定量不明）。河川型 10–20cm は**早熟雄/平均的残留個体の範囲**で、河川型全体の上限(約30cm)ではない可能性が高い | https://www.kahaku.go.jp/research/db/zoology/uodas_freshdb/area/salmonidae/055.html | F-21（2+ 23.2cm, 3+ 28.2cm）・kahaku 30cm と整合させるなら「河川型成魚の通常範囲は ~10–30cm（資料により上限が異なる）」と並記。ランク: 数値は B(最大サイズ) |
| V7a | F-14: ヤマメの産卵期は 9〜10 月 | **CONFIRMED-MULTI（範囲で並記）** | 9〜10月（kahaku/Tokyo Zoo 系要約）／ 9月開始〜11月（別要約、野生親魚は10月上旬〜11月に産卵場へ移動）。→ **9月〜11月、中心は 9–10 月** | https://www.tokyo-zoo.net/encyclopedia/species_detail?move=-1&species_code=280 ／ https://www.jstage.jst.go.jp/article/suisan/76/4/76_4_652/_article（候補・要約の帰属不明） | 地域依存（北海道/東北/関東で時期差は未取得）。ランク: B |
| V7b | F-13/F-14: 河川残留型は産卵後も死なず繰り返し産卵 | **CONFIRMED-MULTI（雄のみ）／雌は未確認** | **河川残留「雄」は iteroparous** — 2 資料目として Shumarinai 湖の生活環要約（「降海/降湖型(ほぼ全ての雌と少数の雄)は semelparous、河川残留雄は iteroparous」）が Utoh(1976) と一致。一方 **河川残留雌が反復産卵する**という F-14 の含意は今回確認できず（同要約は「その個体群の雌は全て湖沼型」） | https://link.springer.com/article/10.1007/s102280200061 ／ https://researchmap.jp/read0134945/published_papers/15410555 ／ https://fra.repo.nii.ac.jp/records/2007365 （いずれも S6 のヒット。要約の帰属は不明） | 仕様では「産卵後も生存する個体は主に残留雄」を既定にし、残留雌の反復産卵は低頻度・未確認扱い。産卵後個体の外観(G4)は依然ゼロ |
| V8 | F-10: 0+ 雄の成熟臨界サイズ FL 約70mm（7月）、1+ 雄は全て FL 90mm 超 | **UNVERIFIABLE（ヤマメ/masu では）** | 数値はヤマメで再現せず。**PROXY:大西洋サケ**で「成熟 parr 雄に FL 70–72mm の閾値（個体群内・間で共通）」という記述が独立に出現 → F-10 の 70mm が Salmo salar の記述と**取り違えられた可能性**を排除できない。定性（0+で体が大きい雄ほど成熟しやすい／初期成長が良いと残留雄が増える）は masu salmon で CONFIRMED（Morita 2014 要約） | https://cdnsciencepub.com/doi/10.1139/f86-154 （PROXY:Variation in Male Parr Maturation… Atlantic Salmon、タイトルのみ確認） ／ https://besjournals.onlinelibrary.wiley.com/doi/10.1111/1365-2656.12240 | **70mm/90mm を仕様の確定値にしない**。「0+ 雄の成熟下限は FL ~7cm 台という報告候補あり(要原典)」止まり |
| V9a | F-22: 青森 0歳ヤマメの体長 7月18日 平均 6.65cm、9月12日 7.23cm | CONFIRMED-SINGLE | 6.65 / 7.23cm を再確認。**別の河川では7月平均 8.25cm** → 7月の 0+ は **6.65〜8.25cm** | https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf ／ https://www2.suigi.pref.iwate.jp/wp-content/uploads/2026/03/20260325result006.pdf （候補） ／ https://www.pref.tochigi.lg.jp/g65/documents/h30_15.pdf （候補） | 青森の同一 PDF が再度ヒットしたため「独立」ではない。8.25cm の出典文書は要約から特定不能（岩手/栃木/青森のいずれか）。体長型(SL/FL)不明 |
| V9b | F-21: 北海道 0+ 14.1 / 1+ 19.4 / 2+ 23.2 / 3+ 28.2 cm（尾叉長） | **CONTRADICTED（0+ のラベル）** | 独立クエリの要約は同一系列を **「0+ 8.1cm（±1.7 SD）、1+ 19.4、2+ 23.2、3+ 28.2」** と記述。→ **14.1cm を 0+ の値として使わない**（年輪逆算の可能性＝推測）。確認できた値: 0+ 8.1±1.7cm（採集時期不明）、1+ 19.4、2+ 23.2、3+ 28.2cm（良好成長の例） | https://fra.repo.nii.ac.jp/record/2009718/files/sapporo_sk_3_8.pdf （S9 で再ヒット。同一PDF） | 14.1 と 8.1 が 0+ で併存する矛盾は原典(上記PDF)でしか解けない。いずれにせよ 19.4/23.2/28.2 は「成長良好個体」で標準値ではない。ランク: A候補（原典要確認） |
| V10a | F-19: ヤマメの基本外観（体側に楕円形のパーマーク、背は黄褐色／暗青緑） | CONFIRMED-MULTI（**色の記述は不一致のまま並記**） | パーマークは体側の楕円形(小判型)斑。背の色は資料で 3 通り: 黄褐色(Q20)／暗青緑(Q11)／**抹茶色〜薄緑**（今回）。パーマーク色: 紫がかる／**淡青色（銀色の地に）**／暗色。→ 色は**個体・照明・個体群差の範囲として扱い、写真(P)で決定**。個数 7–10 は今回再現せず | https://www.tokyo-zoo.net/encyclopedia/species_detail?move=-1&species_code=280 ／ https://www.kahaku.go.jp/research/db/zoology/uodas_freshdb/area/salmonidae/055.html | 抹茶色〜薄緑の文は ja.wikipedia 由来の可能性（出典特定不能）。ランク: B/C |
| V10b | F-18: 銀化(スモルト)でパーマークが消え銀白色になる。河川に残る個体は幼魚の体色を保つ | **CONFIRMED-MULTI** | 「降海するものはパーマークが失われ銀白色になり、サクラマスと呼ばれる」「河川で一生を過ごすものは成長しても**幼魚の体色を保ち続ける**」（kahaku）。元調査の群馬県・本田技研と一致。降海時期 4–6 月は今回再確認できず（ただし「北海道では2年目の春にparr-smolt transformation」の要約あり＝春と整合） | https://www.kahaku.go.jp/research/db/zoology/uodas_freshdb/area/salmonidae/055.html ／ https://eprints.lib.hokudai.ac.jp/dspace/bitstream/2115/75360/1/Fish%20Biol._93_490-500.pdf | 「河川残留成魚は parr の体色(パーマーク含む)を保つ」は外観クラス分けの重要根拠。ランク: B |

---

## 2. 仕様書で使うべき「採用値」

| 項目 | 採用値 | ランク/根拠 |
|---|---|---|
| 外観クラス（分岐の骨格） | 河川残留ヤマメ＝一生 parr 体色（パーマーク保持）／降海型＝パーマーク消失の銀白色。この 2 分岐は独立 2 資料以上で一致 | B（V10b） |
| 銀化の生理的サイズ目安 | FL 12cm 超の個体のみ鰓 NKA 上昇（必要条件。短日で 12cm 超でも銀化せず）。外観の閾値としては使わない | A（V4, Nature Sci. Rep. 2023） |
| 銀化の二経路 | 1年目夏（サイズ駆動・光周期制限）／翌春（光周期駆動・サイズ制限）、8月に光周期非依存の NKA 追加ピーク | A（V4） |
| 早熟雄(成熟 parr)の形態 | 二次性徴はほぼ無い（体サイズ以外の形態形質は繁殖成功に寄与しない）。降海型雄は鉤状吻＋盛り上がった背 | A（V5, Koseki & Maekawa 2000） |
| 性と生活史（定性） | 雌の大半は回遊型、残留は主に雄で雌より小型・早熟。**性比は地域依存**（南: スモルトの雌が雄の 3〜4 倍／北: ほぼ 1:1） | A/B（V2b） |
| 産卵期 | 9月〜11月（中心 9–10 月） | B（V7a） |
| 産卵後の生存 | 残留**雄**は産卵後も生存し反復産卵（降海/降湖型は一度産卵して死ぬ） | A/B（V7b） |
| 成熟期の雄の色 | 黒化＋淡い不定形の桜色(桃色)のまだら、雄で顕著・個体差あり（暫定既定）。濃紅・鰭の赤みは未確認 → 写真(P)で調整 | B（V1a/V1b） |
| 0+ のサイズ | 7月 6.65〜8.25cm、9月 7.23cm（青森ほか）、北海道 0+ 8.1±1.7cm FL（採集時期不明） | B/A候補（V9） |
| 成魚サイズ上限の目安 | 河川型 約30cm／降海型 約60cm（最大サイズ、測定量不明）。北海道良好成長例: 1+ 19.4, 2+ 23.2, 3+ 28.2cm FL | B（V6, V9b） |
| 背の基調色・パーマーク色 | 黄褐／暗青緑／抹茶〜薄緑、パーマークは銀色地に淡青〜紫がかる〜暗色。**固定せず写真(P)の色サンプルで確定** | B/C（V10a） |

## 3. 仕様書で「採用してはいけない」値・主張

| 項目 | 理由 |
|---|---|
| 「河川型の成熟ヤマメは桜色に**ならない**」(F-02 の絶対形) | 独立 B 資料が「黒ずみ桜色のまだら（雄の婚姻色）」と記述（V1a）。ヤマメ限定か否かは未確定だが、絶対形は不可 |
| MLIT 多言語DB の「体側の縞が緋色〜深紅になり腹部で縦帯に融合」(F-04) をヤマメ(河川型)の色として使うこと | 「cherry salmon の名の由来」の文脈＝種/降海型の記述と解釈される（V1c）。stripes の指示対象も不明 |
| 「北海道では雌のほぼ全てがスモルト化」(F-28) | 「大半(majority)」が正（V3） |
| 銀化魚の雌率 78.0% / 88.9%、成熟 parr 78尾=全雄、36尾/41尾の内訳 (F-12 数値) | 再現せず・湖沼型 PROXY・帰属未確認（V2a）。使うなら「PROXY:湖沼型、未検証」と明記 |
| 0+ ヤマメ FL 14.1cm (F-21) | 同系列が 0+ = 8.1±1.7cm と要約された（V9b）。14.1 は逆算値等の可能性があり 0+ の実測値として使わない |
| 0+ 雄の成熟臨界サイズ FL 70mm（7月）、1+ 雄 90mm 超 (F-10) | masu では再現せず、大西洋サケの 70–72mm 閾値との取り違えの可能性（V8） |
| 河川型雄 10–20cm / 降海型 30–50cm FL・3–4 歳成熟 (F-07) の数値 | 再現せず（V6）。特に 10–20cm を河川型の全範囲として使わない |
| 河川残留**雌**が数年繰り返し産卵する（F-14 の雌への含意） | 確認できず。同要約はその個体群の雌を全て湖沼型・semelparous とする（V7b） |
| 「2+ で個体群の80%が成熟」(F-23)、種不明の体色変化一般論 (F-27) | 元調査どおり不採用。今回も裏付けなし |

## 4. 未検証・追加で見つけたリード

- **F-05（早熟雄は体高が高く、暗色化し、パーマークがくっきり）**: S3 で試みたが該当記述が出ず **UNVERIFIABLE**。外観クラス(c)の根拠であり影響が大きい。写真(P)に成熟雄の個体があれば、そちらで検証する。
- **F-17（グアニン/ヒポキサンチン増加）、F-24/F-25（サイズ二型）、F-11、F-15 の一部**: 検索予算の都合で再検証していない。F-25（同齢で雌が大きい）は S11 の要約に「Tamate & Maekawa (2004) Female-biased mortality rate and sexual size dimorphism of migratory masu salmon」というタイトルが出ており、方向（雌優位）は整合的（本文の数値は未確認）。
- 追加リード: Latitudinal variation in the growth and maturation of masu salmon parr（https://cdnsciencepub.com/doi/10.1139/F10-028 ）— G7/G9（地域差・残留率）の候補。Partial Migration in Salmonids: Masu salmon and white-spotted charr（https://link.springer.com/chapter/10.1007/978-3-031-44389-3_12 ）。Effects of photoperiod manipulation on precociously maturing males（https://link.springer.com/article/10.1007/s12562-025-01950-x ）。Influence of photoperiod and temperature on sexual maturation in masu salmon（https://link.springer.com/article/10.1007/s10499-025-01898-w ）。いずれもタイトルのみ確認で内容未取得。

---

## 5. 検索ログ（WebSearch 11 回、mode=standard のみ）

| S | クエリ（要旨） | allowed_domains | 有用度 | 対応クレーム/結果 |
|---|---|---|---|---|
| 1 | Kitanishi masu salmon sex life history dispersal smolts females proportion mature parr all male Hokkaido | pmc/wiley/ncbi | 中 | V2b 定性は確認、V2a 数値は出ず。GH偽遺伝子の副次情報 |
| 2 | Ugachi size-driven parr-smolt masu salmon FL 12 cm NKA feeding photoperiod | pmc/nature/ncbi | 高 | V4 確認＋「短日で12cm超でも銀化せず」のニュアンス |
| 3 | masu salmon mature male parr morphology darker body deeper body parr marks distinct seawater adaptability | なし | 低 | F-05 は確認できず。V3 の補強（北海道は雌の大半・雄の少数が降海）のみ |
| 4 | Sexual selection on mature male parr… Behav Ecol Sociobiol, anadromous 30–50 cm resident 10–20 cm | springer/oup/hokudai/pubmed | 高 | V5 確認（Koseki & Maekawa 2000 と特定）。V6 数値は出ず |
| 5 | ヤマメ 婚姻色 繁殖期 雄 体色 黒ずむ ピンク … 図鑑 | kahaku/zukan/tokyo-zoo 等 | 高 | V1a/V1b（黒ずみ桜色のまだら）、V7a、V10a（背: 抹茶〜薄緑） |
| 6 | resident masu salmon yamame spawning Sept–Oct repeat spawner survive iteroparous | なし | 高 | V7a（9〜11月）、V7b（残留雄 iteroparous）。雌への含意は否定的 |
| 7 | masu salmon mature males stripes bright red crimson merge abdomen longitudinal band | なし | 中 | V1c（同文再現＋「cherry salmon の名の由来」の文脈）。MLIT 文書自体は表示されず。※返却に2つの結果ブロック |
| 8 | サクラマス ヤマメ 体側 パーマーク 小黒点 背 体色 産卵期 雄 陸封型 体長 国立科学博物館 | kahaku/biodic/zukan-bouz 等 | 高 | V1a 再現、V10b、V6 隣接データ（最大 60/30cm） |
| 9 | ヤマメ 満1歳 満2歳 体長 cm 成長 河川 平均 尾叉長 当歳魚 秋 | なし | 高 | V9a（別河川 8.25cm）、V9b（0+ = 8.1±1.7 の系列表記） |
| 10 | masu salmon male precocious maturation 0+ threshold FL July size-dependent | wiley/cdnsci/springer/pubmed/pmc | 中 | V8（70–72mm は大西洋サケの記述として出現）、Morita 2014 の定性 |
| 11 | sex ratio of smolts masu salmon female-biased 1+ 2+ percent females Shumarinai Lake mature parr all male | springer/cdnsci/oup/sciencedirect/jstage | 中 | V2a 数値は出ず、地理的クライン(3〜4:1→1:1)を取得。※**返却に5つの結果ブロック**（ツール内部で複数回検索された可能性あり） |

予算に関する注記: 呼び出し回数は 11 回（割当どおり）。ただし S7（2 ブロック）と S11（5 ブロック）はツールが複数の内部検索結果を返しており、共有カウンタが呼び出し単位でなく内部検索単位で数えていた場合は最大 16 回相当を消費した可能性がある。以降の検索割当を管理する側で確認されたい。「Web search was not performed」の返却は 1 回もなかった。
