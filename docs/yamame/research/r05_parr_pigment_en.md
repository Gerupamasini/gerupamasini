# Parr marks, chromatophores and pattern formation in salmonids (English) — r05

> **調査方法の制約（必読・最重要）**
> - **本ストリームは新規の Web 検索を 1 回も実行できなかった。** セッションの WebSearch 上限（`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` = 200、全ストリーム共有）が他ストリームで既に消費済みで、開始直後に発行した 3 クエリ（parr marks / masu parr mark number / chromatophores）はいずれも「Web search was not performed: this session has used its web search budget (200 of 200)」と返却された。WebFetch（en.wikipedia.org/wiki/Parr_mark）は `EGRESS_BLOCKED`。プロキシの迂回は行っていない（`/root/.ccr/README.md` の「403/407 は回避せず報告」に従う）。
> - したがって本書は **(A) r01 / r02 / r03 が既に取得した検索要約の中から、パーマーク・色素・模様に関係する記述を二次転記したもの**、**(B) 写真ストリームの注釈カタログ（`docs/yamame/photo_analysis/catalog_c01〜c07.json`、70 枚）を集計した観察統計**、**(C) 調査員の記憶に基づく M ランクの手がかり（数値なし・URL なし）** だけで構成される。**私自身は転記元の URL を一つも開いていない。**
> - 転記元の要約は検索ツールによる機械要約で、(a) どの URL の記述か特定できない、(b) 種・生活史型のラベルが入れ替わる、(c) 他種の記述が混入する、という欠陥が r01〜r03 で実際に観測されている。**転記した Finding はすべて「二次転記・要原典確認」であり、ランクは転記元のランクを保守的に維持または1段下げたもの。**
> - 課題 4 項目のうち、**項目 2（色素胞の種類と層構造・体色変化の速度と範囲）と項目 3（反応拡散/Turing 等の模様形成モデル）は文献根拠がほぼ皆無**（M ランクの手がかりのみ）。項目 1（パーマーク）は日本語の公的資料の断片は転記できたが、**英語の査読論文（ontogeny・遺伝・左右差・優劣/攻撃性との関係）は 1 本も取得できていない**。項目 4（脂鰭・鰭縁・鰓蓋・暈つき斑）は写真観察（非文献）以外の根拠がない。
> - **証拠ランク**: A=査読論文・学術書・公的機関の正式報告で要約に数値/記述が明示 / B=図鑑・自治体・博物館・信頼できる解説 / C=Wikipedia 系・釣りメディア・出典不明・AI 生成百科、および下記写真観察 / M=調査員の記憶（未検証）。**C(P)=写真カタログ由来の観察**（文献ではない。注釈は AI による目視で、スケール・照明・色再現に不確実性あり。ランクは C 扱い）。
> - **PROXY**: ヤマメ（河川型）以外のデータは scope に "PROXY:○○" と明記した。
> - 転記元の表記: 「r03 F-17」= `r03_lifestage_sex.md` の F-17、以下同様。

---

## 1. 要約（仕様に直結する結論）

1. **文献ベースの裏取りは大半が未達**: 英語一次文献（パーマークの発生・数・遺伝・左右差・優劣との関係、色素胞、模様形成モデル）は取得ゼロ。以下の結論は日本語公的資料の二次転記と写真観察が中心で、色素胞・模様形成は M 止まり。仕様化の前に Section 4 の優先クエリで補う必要がある。 [F-27][F-28][F-29][F-30]
2. **パーマークの個数**: 公的報告（青森県）8–10 個 [A]。他資料は 6–9 / 7–10 / 9–10 と食い違う。写真注釈（yamame ラベル 54 枚、片側の可視数）は 5–12 個、最頻 8–9、平均 8.6（SD 1.4）。→ 個数分布は「7–10 を中心、5–6 と 11–12 を稀な裾」とし、一点値にしない。 [F-01][F-02][F-21]
3. **パーマークはサイズ・年齢で薄れ、消える**: 大型のアマゴ・ヤマメは体が大きくなるとパーマークを失う（Kato 1991 [A]）。栃木県の判別基準は全長 31 cm 以上でパーマークも腹部青斑点も見えなければサクラマス。一方、神奈川県図鑑は「成魚にも同じように見られる」。→ サイズ連動でコントラストを下げ、完全消失閾値は固定しない（資料間不一致）。 [F-04]
4. **スモルト化＝パーマーク消失＋銀白化、段階的に進む**: parr→silvery parr→smolt でグアニン/ヒポキサンチンが増加（r03 の A 候補、文書未特定のため B）。体サイズ駆動の閾値は FL 12 cm（鰓 NKA 活性、[A]）、肥満度は parr 約 14 → smolt 約 12（[A]）。移行途中の個体（一部パーマーク残存）は PROXY の一般則として存在。 [F-05][F-06][F-07]
5. **パーマークの色**は「紫黒色・赤紫色」（島根県）と「青色」（神奈川県）で不一致。写真注釈は「暗灰褐色（中心やや青灰）」（p001）。→ 暗い青紫〜青灰のベースに照明依存の色相振れを持たせる。 [F-03][F-21]
6. **ヤマメの朱点は基本なし、アマゴは朱点あり**（識別形質、[B]）。ただし神奈川県の丹沢ヤマメには「少数の朱点が入る」沢があり、神奈川県陸封個体群はヤマメとアマゴの中間的形質（遺伝的にはアマゴに近い、[A]）。→ 朱点は「無し」を既定、低頻度で少数の朱点を許容する連続変異として扱う。 [F-09][F-10][F-12]
7. **側線部の淡い紅色**: 陸封個体は側線部にうっすら紅をはく（NIES、[B]）。写真では体側上半〜側線付近のサーモンピンク〜橙の拡散帯が 70 枚中 39 枚で記述され、明瞭なピンクの縦走帯としては出ない（p001）。 [F-15][F-24]
8. **黒点**: 背部から側線にかけて小黒点、背鰭・脂鰭・尾鰭にも黒点があり頭部背面には無い（HRO、[B]）。写真では側線下に円形の青灰〜黒斑が 70 枚中 59 枚で記述され、個数は 3〜60 超と個体差が極めて大きい。栃木・群馬の判別基準にある「腹部青斑点」に対応する可能性があるが**これは調査員の推論**。 [F-13][F-23][F-15]
9. **パーマークは均一・左右対称な模様ではない**: 間隔の不均等、前方ほど細く傾き後方ほど短い楕円、中央部が最大、背側の中間マークが千鳥に入る、隣接マークの融合/二重化（写真 70 枚の注釈）。左右の比較ができる資料（同一個体の両側）は無い。 [F-22]
10. **模様は体型と独立に変異しうる**: 体側模様を欠く「イワメ」はアマゴと基本差が無く本質的差は体側模様のみ（[A]、PROXY:アマゴ）。マスには体形・背鰭黒色素など多面的な基準で少なくとも 5 型以上の parr 型（Kubo、[C]）。→ 模様パラメータ軸は体型パラメータ軸と独立に振る。 [F-11][F-08]
11. **鰭縁**: 腹鰭・臀鰭・背鰭の前縁が白い個体が写真 70 枚中約 38 枚で記述（文字列検索による概算）。HRO は降海期に背鰭先端に白色部を持つ個体があると記す（[B]）。胸鰭は橙黄色の例（p001, p013）。 [F-25][F-13]
12. **脂鰭**: 小さい葉形で灰〜クリーム〜灰青の半透明。縁取りは暗色（p040, p064）、白縁（p016）、縁取り無し（p031, p032, p033, p049）が混在し、橙縁は確認されず。一貫した「黒縁/橙縁」は資料からも写真からも支持されない。 [F-26]
13. **鰓蓋・頭部**: 鰓蓋は銀褐色〜淡桃/ラベンダーの虹彩光、橙褐色のまだらもある。項・頬・鰓蓋に小黒点が数個〜約 12 個の個体がある。明確な「鰓蓋の黒斑」は写真で一貫して確認されず（p041 に暗色ぼかし 1 個のみ）。 [F-26][F-14]
14. **成熟雄（早熟雄）は体色が暗色化しパーマークがくっきり見える**（[B]）。婚姻色は資料間で不一致（黒ずむが桜色にならない / 薄桃〜濃紅が不定形 / 体側の縞が鮮紅色になり腹部で淡色帯に融合）。 [F-16][F-17]
15. **養殖・放流魚は天然魚より色彩が薄く体型が丸い**（埼玉県、[B]）。→ 個体差生成に「由来（天然/放流）」軸を持たせる根拠。 [F-18]
16. **背景適応の体色変化**は、ヤマメ/サケ科固有の資料が見つからなかった（種不明の一般論のみ）。変化速度・範囲は仕様化不能。 [F-19][F-30]
17. **色素胞の 5 種類（メラノ/キサント/エリスロ/イリドフォア/ロイコフォア）と層構造**、赤橙色の由来、Turing/反応拡散モデルは M ランクの手がかりのみ。仕様に使う場合は Section 4 の優先クエリで検証すること。 [F-27][F-28]

---

## 2. Findings

### Part A. 日本語公的資料・学術要約からの二次転記（r01 / r02 / r03 由来）

### F-01
- 主張/値: 青森県のヤマメ（河川型）の外部形態: **パーマーク 8–10 個**、背鰭条 12–13、胸鰭条 12–14、腹鰭条 9、臀鰭条 12–14、側線鱗 118–134。
- 適用範囲: ヤマメ（河川型）/ 青森県の河川 / 調査年・n・体長範囲は要約に無し。
- 出典: 青森県産業技術センター内水面研究所「サケ、マス保護水面管理事業に伴うサクラマス調査」 https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html （転記元 r01 F-01。r01 では 3 回の独立クエリで同一数値が再現）
- 証拠: [A]（公的機関の事業報告、二次転記・要原典確認）要約文より「パールマーク8-10個、側線鱗数118-134枚」。

### F-02
- 主張/値: 資料によるパーマーク個数の食い違い: 「体側中央に楕円形の比較的大きなパーマークが **6–9 個**」と「**7–10 個**」の 2 系統（日本語資料）、Grokipedia（AI 生成）幼魚で **9–10 個**、台湾亜種は **楕円斑 9 個＋側線上方の小黒点 11–13 個**、アマゴは **7–11 個**（東京都）。背鰭・腹鰭・臀鰭・尾鰭の先端が黒いとの記述（C）。
- 適用範囲: ヤマメ（O. m. masou）、アマゴ、PROXY:O. m. formosanus。どの記述がどの URL 由来かは帰属未確定。
- 出典（候補）: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://museum.umic.jp/kawa/zukan/sakana/yamame.html ／ https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html ／ https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF ／ https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1 ／ https://grokipedia.com/page/Oncorhynchus_masou ／ https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html （転記元 r02 F-14, r01 F-11/F-12/F-15）
- 証拠: [C]（出典不明が混在）r02 要約より「体側中央に楕円形の比較的大きなパーマークが6-9個並ぶという記載もありますが、別の資料では体側に７～10個のパーマークがある」。数え方（小さな前後の斑を含めるか）の差が疑われるが確認できず。

### F-03
- 主張/値: パーマークの色の記述が資料で異なる: 「**紫黒色・赤紫色**」（島根県）、「**青色**」（神奈川県・ja.wikipedia）、「purple-colored parr marks」「dark blue-green back … oval-shaped dark spots called parr marks」（r03 の要約）。降海型幼魚の体側に「大型で小判形の暗青色パーマークが数個以上」（Kubo 系資料の可能性）。
- 適用範囲: ヤマメ（河川型）および降海型サクラマス幼魚 / 保存状態・照明・サイズ・地域は不明。
- 出典（候補）: https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html ／ https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ／ https://www.honda.co.jp/fishing/picture-book/yamame/ ／ http://salmon.fra.affrc.go.jp/kankobutu/srhsh/data/srhsh245.pdf （転記元 r01 F-15/F-26、r03 F-19）
- 証拠: [B]（自治体・図鑑）r03 要約より「purple-colored parr marks」。色の食い違いは §3 参照。

### F-04
- 主張/値: **パーマークは体の成長とともに薄れ、大型個体では失われる。** Kato (1991): 大型のアマゴ・ヤマメ（河川/ダム湖、福井県）は体側の朱点の有無と鱗の特徴で種間差が明瞭、**両者とも体が大きくなるとパーマークを失う**。降海型に似るが尾柄高・鰭の大きさ・鱗のパターンに幼魚の特徴を残す。河川で育った大型ヤマメは 2 歳以上で約 300 mm（測定量不明）。栃木県の判別基準: ヤマメは「パーマークと腹部青斑点の両方あるいはいずれかが確認でき、全長 30 cm 以下」、サクラマスは「全長 31 cm 以上でパーマークと腹部青斑点の両方が確認できない」。**対立する記述**: 神奈川県図鑑は「小判型のパーマークが並び、成魚にも同じように見られる」。
- 適用範囲: ヤマメ/アマゴ（福井県の大型個体）、栃木県の調査上の判別基準（生物学的境界値ではない）、神奈川県図鑑（「成魚」の定義が不明）。
- 出典: 加藤文男 (1991)「大型アマゴ・ヤマメの形態及び生態に関する知見」水産増殖 39(3):279–288. https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ ／ 栃木県 https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf ・ https://www.pref.tochigi.lg.jp/g65/documents/sakuramasu2016ankeitomatome.pdf ／ 神奈川県 https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html （転記元 r02 F-12/F-13/§3、r01 F-14/F-15）
- 証拠: [A]（査読誌の書誌、要約に記述明示。二次転記・要原典確認）r02 要約より「Both Amago and Yamame lose their parr marks as their bodies grow larger.」栃木県の基準は [B]。

### F-05
- 主張/値: **スモルト化＝パーマークが消えて体が銀白色になる。降海は 4–6 月ごろ**。銀化は銀白化が強まり体側の斑紋がほとんど見えなくなることとされる。PROXY の一般則として移行途中（transitional）の個体が存在し、ある調査では降海個体の 50% が完全に銀化、45% が移行期、5% が parr 様の体色を保持（種・文書不明）。
- 適用範囲: (a) ヤマメ/サクラマス（B）。(b) PROXY:サケ科一般（種・出典不明）。
- 出典: (a) 群馬県 https://www.pref.gunma.jp/page/20806.html ／ https://www.honda.co.jp/fishing/picture-book/sakuramasu/index.html ／ https://agriknowledge.affrc.go.jp/RN/2030927242.pdf (b) https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf （転記元 r03 F-18。文書特定不能）
- 証拠: (a) [B]「パーマークが消えて体が銀白色になり(スモルト化)、4~6月ごろに海へと下ります」(b) [C/PROXY]「50% of seaward migrants were completely silvered, 45% were in a transitional phase, and 5% still retained coloration characteristics of parr」。

### F-06
- 主張/値: parr から smolt への変化（暗色の parr → 銀色の smolt）は皮膚へのグアニン結晶の沈着による。masu salmon では **parr→silvery parr、silvery parr→smolt の両方の移行でグアニンとヒポキサンチンが顕著に増加**。ただし大量のグアニンが銀化の見た目と必ずしも相関しない。
- 適用範囲: (a) Oncorhynchus masou（北大の紀要と推定、文書未特定）。(b) 「グアニン結晶沈着が銀化の原因」は PROXY:サケ科一般。
- 出典（候補・特定不能）: 北大水産学部研究彙報 21(2):123–127 https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf ／ PROXY: https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf ／ USGS https://pubs.usgs.gov/publication/70180320 （転記元 r03 F-17。r03 は A 候補としたが、文書未特定のため B に降格）
- 証拠: [B]「a remarkable increase of guanine and hypoxanthine was found at both occasions of change from parr to silvery parr and from silvery parr to smolt」（要約）。要原典確認。

### F-07
- 主張/値: masu salmon の銀化は体サイズ駆動と光周期駆動の二経路。**FL 12 cm 超の個体のみ鰓 NKA 活性が上昇**。光周期操作で**肥満度の低下と体の銀化**が通常（5 月）より 3 か月早く起きた。肥満度 K=体重×1000/FL³ は parr 14.09 / 14.18、早熟雄由来 smolt 12.19 / 12.06、0 歳由来 smolt 11.30 / 11.49（smolt は parr より約 13.5–15% 低い＝r02 の算術）。
- 適用範囲: Oncorhynchus masou の飼育系統（日本、"Hokkaido-Nikko strain" の記載）。外観の色そのものの数値は無い。
- 出典: Size-driven parr-smolt transformation in masu salmon (Oncorhynchus masou). Sci. Rep. 2023. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ ／ https://link.springer.com/10.1038/s41598-023-43632-7 ／ 肥満度表の候補 https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22122/1_P39-42.pdf ・ https://fra.repo.nii.ac.jp/records/2007545 （転記元 r02 F-16/F-17、r01 F-25、r03 F-15/F-16）
- 証拠: [A]（査読論文、二次転記）「only fish exceeding a fork length of 12 cm exhibited an increased gill NKA activity」「reduction in condition factor and body silvering」。

### F-08
- 主張/値: サケ科幼魚→スモルトの一般則: 渓流の幼魚は deep-bodied でパーマークが顕著、スモルトはパーマークを失い銀化しより細身。**マスでは Kubo が、体形・大きさ・背鰭の黒色素・銀化・行動などから少なくとも 5 型以上の parr 型を認めた**（表現型多型）。
- 適用範囲: サケ科一般＋マス（Kubo）。引用元は Mighell 1978 (NOAA) / McCormick らが混在し特定不能。
- 出典（候補）: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ ／ https://www.webapps.nwfsc.noaa.gov/assets/26/6745_06272011_103138_Mighell.1978-rev.pdf ／ http://salmon.fra.affrc.go.jp/kankobutu/srhsh/data/srhsh245.pdf （転記元 r01 F-31）
- 証拠: [C]（引用元特定不能）「Stream-dwelling juveniles are deep-bodied and have prominent parr marks … Kubo … recognizing at least five or more types of parr」（要約）。

### F-09
- 主張/値: 神奈川県酒匂川水系の在来「丹沢ヤマメ」は、外部形態が**パーマークや小黒点が多い、少数の朱点が入る**など沢によって異なる。mtDNA ハプロタイプも複数出現。東京都は外部形態（パーマークの数・形状・朱点）の解析を実施。
- 適用範囲: ヤマメ（河川型）/ 神奈川県酒匂川水系（太平洋側の分布南限域）。定量値なし。
- 出典: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html （どちらの文かは特定不能。転記元 r01 F-18）
- 証拠: [B]「外部形態はパーマークや小黒点が多い、少数の朱点が入る、その沢によって異なる特徴があり」（要約）。

### F-10
- 主張/値: 神奈川県（相模川・酒匂川水系）の陸封 O. masou 上流個体群は、**形態はアマゴとヤマメに似るが遺伝的にはアマゴに近い**。ヤマメとアマゴの中間的特徴を持つ個体がいる。
- 適用範囲: 神奈川県の陸封個体群。定量値なし。
- 出典: Marine Biotechnology 22:812–823 (2020) https://link.springer.com/article/10.1007/s10126-020-09975-2 ／ https://pubmed.ncbi.nlm.nih.gov/32488506 （転記元 r02 F-11）
- 証拠: [A]（査読論文、二次転記）「the morphological features seen here were similar to amago and yamame. However, both populations were genetically related to amago.」

### F-11
- 主張/値: 三重県三国谷の**イワメ（体側模様を欠く型）とアマゴ**の比較で、成長・体サイズ・摂餌・性比・肥満度などに基本的差が無く、**本質的な差は体側模様のみ**。→ 模様は体型・生態と独立に変異しうる。
- 適用範囲: PROXY:アマゴ（イワメ型）。
- 出典: 森誠一・名越誠 (1986) 三重県三国谷のイワメとアマゴにおける形態比較. 三重大学水産学部研究報告 13:135–143. https://cir.nii.ac.jp/crid/1050001202938999296 ／ https://mie-u.repo.nii.ac.jp/records/5636 （転記元 r01 F-19）
- 証拠: [A]（書誌と要旨が要約に明示、二次転記）「the only essential difference between them is their side patterns」（要約）。

### F-12
- 主張/値: **ヤマメの識別に使われる赤色斑**: マス（ヤマメ）・アマゴ・ビワマスは形態・計数形質が互いによく似ており、鱗の形態と、幼魚・成魚の**側線上下の赤色斑の有無**が識別形質。**アマゴは側面に朱点があり、マス（ヤマメ）は黒点のみ**。神奈川県図鑑は「小判型のパーマークが並び、成魚にも見られる。アマゴと異なり朱点はない」。東京都: アマゴは体側に 7–11 個の青色パーマークと朱点。Kato (1991) も「体側の朱点の有無と鱗の特徴で種間差が明瞭」。
- 適用範囲: O. masou 種複合体（ヤマメ vs アマゴ）。成魚/幼魚。
- 出典: Fujioka Y., Kuwahara M., Tabata R. et al. Ichthyological Research 73:188–200 (2025) https://link.springer.com/article/10.1007/s10228-025-01032-z ／ https://en.wikipedia.org/wiki/Oncorhynchus_masou_macrostomus ／ https://bioone.org/journals/zoological-science/volume-15/issue-6/zsj.15.971/Genetic-Relationship-between-Masu-and-Amago-Salmon-Examined-through-Sequence/10.2108/zsj.15.971.full ／ https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html （転記元 r02 F-10, r01 F-14/F-15）
- 証拠: [B]（赤色斑の記述は「別の研究では」と帰属が曖昧なため A から降格）「アマゴは側面に朱点があり、マス（ヤマメ）は黒点のみ」「アマゴと異なり朱点はありません」。

### F-13
- 主張/値: **黒点の分布**（北海道立総合研究機構のサクラマス解説）: 降海型は背が暗青〜暗緑、体側が銀白色、腹が白色。**頭部を除く背部と背鰭・脂鰭・尾鰭に黒点があり、頭部背面には黒点が無い**。降海期は体側が銀白色になりパーマークが見えにくくなり、**背鰭先端に白色部を持つものがある**。ヤマメの別資料: 背部から側線にかけて黒点が散在し、背鰭・腹鰭・臀鰭・尾鰭の先端が黒い（C）。Christie (1970) も O. masou の特徴として「細かい黒点」を挙げる。
- 適用範囲: サクラマス（降海型中心）。背鰭先端の白色部・黒点分布が河川型にも通じるかは要確認。
- 出典: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ Christie (1970) https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf （転記元 r01 F-16、r02 F-05/F-14）
- 証拠: [B] r01 要約より「頭部を除く背部と背鰭・脂鰭・尾鰭に黒点」。尾鰭先端が黒いとの記述は [C]。

### F-14
- 主張/値: **PROXY:台湾亜種 O. m. formosanus（成魚約 30 cm）**の体色記述: 濃緑色の体に銀色の腹、体側に**楕円形の暗色斑（パーマーク）9 個**と**側線上方の小黒点 11–13 個**、**頭頂は緑、眼と鰓蓋周辺は銀色、鰭は銀緑色**。尾鰭は成魚で浅い二叉、背鰭と脂鰭は明確に離れる。
- 適用範囲: **PROXY:O. m. formosanus（台湾陸封型）**。ヤマメの値ではない。台湾亜種は日本産亜種より体高が高く脊椎骨・臀鰭条・胸鰭条が少ないとの報告もある（r02 F-02）。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://www.fishbase.se/summary/16686 ／ https://lifeoftaiwan.com/nature/the-formosan-landlocked-salmon-taiwans-unique-natural-wonders-part-1/ ／ 一次資料候補 https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf （Jan et al. 1990、未確認）（転記元 r02 F-02/F-03）
- 証拠: [B]（PROXY、Wikipedia 系を含む）「nine elliptical dark spots and 11-13 smaller black spots on each side of the body」。

### F-15
- 主張/値: ヤマメの基本外観（自治体・研究機関・図鑑）: 背は黄褐色（または暗青緑〜褐色）で小黒点が散在、腹は白。**陸封個体は体側にパーマーク、側線部にうっすら紅をはく**（NIES）。ヤマメの判別基準に「**腹部青斑点**」の語が出る（栃木県・群馬県。他資料と整合する表現か未確認、誤要約の可能性）。目の周りに数個の黒点があるのはヤマメとアマゴに固有との釣り情報（C、未検証）。
- 適用範囲: ヤマメ（河川型）/ 季節・サイズ・地域不明。背の基調色は「暗青緑」と「黄褐色」で資料が異なる（§3）。
- 出典: NIES https://www.nies.go.jp/biodiversity/invasive/DB/detail/50830.html ／ https://fishai.jp/815 ／ https://www.honda.co.jp/fishing/picture-book/yamame/ ／ 群馬県 https://www.pref.gunma.jp/page/20806.html ・ https://www.pref.gunma.jp/uploaded/attachment/46107.pdf ／ 栃木県 https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf （転記元 r01 F-15、r03 F-19/F-20）
- 証拠: [B]「陸封個体は体側に…黒いパーマークが並び、側線部にはうっすらと紅をはいている」（NIES 要約）。「腹部青斑点」は [B（疑義あり）]。

### F-16
- 主張/値: **早熟雄（成熟した河川残留雄）は、未成熟魚に較べ体高が高く、体色が暗色化し、体側のパーマークが未成熟魚よりくっきり見える**。海水適応能は発達せず、二次性徴（鼻曲り等）はほとんど発達しない。
- 適用範囲: サクラマス（ヤマメ型）の早熟雄（parr）/ 北海道系の研究と推定、地域は要約に無し。
- 出典（候補・特定不能）: https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_16-00006/_article/-char/ja/ ／ https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_22-00024/_pdf ／ https://esj.ne.jp/meeting//abst/61/S05-2.html ／ https://fra.repo.nii.ac.jp/record/2009615/files/sapporo_sk_13_3.pdf （転記元 r03 F-05/F-09）
- 証拠: [B]（文書特定不能のため A から1段下げ）「体高が高く、体色が暗色化しており、体側にある斑紋（パーマーク）が未成熟魚よりもくっきりとして見え」。

### F-17
- 主張/値: **河川型ヤマメ成熟期の体色は資料間で不一致**（最大の未解決事項）。(i) 河川で性成熟したヤマメは「体色は黒ずむが、サクラマスのように桜色にはならない」（複数クエリで再現、B）。(ii) 「体全体が黒っぽくなり、薄い桃色から濃い紅色までの婚姻色が体側からヒレなどに不定形に表れる」（Wikipedia 系の可能性、C）。(iii) 国土交通省多言語 DB: 成熟した masu salmon は「背が暗化、体側の stripes が緋色〜深紅になり腹部で一つの淡色の縦帯に融合、pink になる」（B、対象型・「stripes」がパーマークか不明）。PROXY:降海型雄は黒ずみ＋体側に不定形な雲状の桜色（桃色）斑（B）。
- 適用範囲: ヤマメ（河川型）産卵期（秋）/ 雌雄の区別は要約に無し。
- 出典（候補）: https://www.mlit.go.jp/tagengo-db/en/R2-00580.html ／ https://www.mlit.go.jp/tagengo-db/R2-00580.html ／ https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja （関・小島 1977、内容未取得のリード）／ https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 （転記元 r03 F-01〜F-04）
- 証拠: [B]（MLIT）「A masu salmon which has reached sexual maturity has a darkened back, and the stripes on the body sides become bright red with crimson tinge to merge on the abdomen into one common longitudinal band of lighter color.」

### F-18
- 主張/値: 埼玉県の研究: **放流魚（養殖魚）は天然魚に比べ色彩が薄く体型が丸い**、鰭が欠けている/色がくすむ傾向。10 月放流魚は体色・体型とも天然魚に近く、12 月放流魚は体色のみ近い（1991 年度）。
- 適用範囲: ヤマメ（成魚放流・埼玉県）。
- 出典: https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html （転記元 r01 F-20）
- 証拠: [B]「放流魚（養殖魚）は天然魚に比較して、色彩も薄く、体型も丸いなど」（要約）。

### F-19
- 主張/値: 魚類の体色変化の一般機構: 背景の明るさの変化に応じ、ホルモンと神経が色素胞に作用して色素顆粒が分散・凝集する。急な温度変化は体色変化の速度に影響する。別の魚種では、優位個体は明るい基質により馴染み、従属個体は暗色を示した。**ヤマメ/サケ科に特化した資料は見つからなかった**（変化速度・範囲の数値なし）。
- 適用範囲: **PROXY:種不明の魚類一般**（両生類・ハゼ類の資料が混在）。サケ科の実測値ではない。
- 出典（候補・特定不能）: https://orb.binghamton.edu/research_days_posters_2024/52 ／ https://www.aomori-itc.or.jp/_files/00061476/343-346.pdf （青森内水面研究所の体色・背景関連ヒット。内容未取得のリード）（転記元 r03 F-27）
- 証拠: [C/PROXY]「Fish can change body color in response to changes in background brightness through hormones and nervous system signals acting on chromatophores」。仕様根拠としては不足。

### F-20
- 主張/値: Christie (1970) による O. masou の特徴まとめ: **細かい黒点、太い尾柄**、腹鰭条数が少ない（大半が 10）、幽門垂が少なく短い（35–68、平均 47.05）、鰓耙 16–22（大半が 18–19）。
- 適用範囲: 日本産サケ科（サクラマス/アマゴ）を北米向けに概説した報告。ヤマメ（河川型）に限定した値ではない。
- 出典: W.J. Christie (1970) A Review of the Japanese Salmons Oncorhynchus masou and O. rhodurus…, Ontario Research Information Paper (Fisheries) No. 37. https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf （転記元 r02 F-05）
- 証拠: [A]（報告書の要約、表そのものは未確認）「fewer ventral fin rays (mostly 10), shorter and less numerous pyloric caeca (35-68, mean 47.05)…」（黒点の記述は要約の言い換え）。

### Part B. 写真カタログ由来の観察（文献ではない。`docs/yamame/photo_analysis/catalog_c01〜c07.json` を集計）

> 70 枚（lateral_left 29 / lateral_right 28 / multi_fish 9 / head_closeup 2 / oblique 2）。各レコードは AI による目視注釈で、サイズの px 値は画像ごとに異なりスケール無し。種ラベルは yamame 57、amago_or_hybrid_suspect 5、unclear 5、mixed_multiple 1、char_iwana_type 1、other 1。**アマゴ疑いのラベルは赤斑の有無を判断材料に含むため、赤斑の集計は循環を含む。** 水膜グレア・過露出・低解像度で色の信頼度は med が主体。

### F-21
- 主張/値: **パーマーク片側可視数の分布**（パーマーク数が記録された 63 枚のうち yamame ラベル n=54）: 5:2 / 6:2 / 7:5 / **8:16 / 9:14 / 10:12** / 11:2 / 12:1。平均 8.6、SD 1.4（母集団 SD）。種ラベル全体（n=63）では 8:17 / 9:17 / 10:14 / 7:6 / 5:3 / 6:3 / 11:2 / 12:1。ラベル信頼度 0.7 以上の yamame（n=16）は 8:4 / **9:7** / 10:2 / 11:2 / 12:1。段階別（yamame, 範囲）: juvenile n=21 は 7–10、parr n=16 は 6–10、adult_nonspawning n=11 は 7–12、spawning_male n=3 は 7–9、unknown n=3 は 5–7。`extends_below_lateral_line` が True と記録されたのは 56 枚（残り 14 枚は null、False は 0 枚）。パーマークのコントラスト（全ラベル 70 枚）は juvenile n=26 で high 10 / med 15 / low 1、adult_nonspawning n=15 で high 2 / med 8 / low 5。
- 適用範囲: ヤマメ中心の公開写真 70 枚（出典サイトは各レコードの `source_url`）。部分的に隠れた個体・一部が不明瞭なマークを含む。個体のサイズ・地域・季節は未調整。adult_nonspawning の低コントラストは照明や撮影条件と交絡しうる。
- 出典: `docs/yamame/photo_analysis/catalog_c01.json`〜`catalog_c07.json`（集計は本ストリームで実施）。
- 証拠: [C(P)] 注釈例（p001）「縦長の明瞭なパーマーク約10本」。文献値 8–10（F-01）と整合的だが、文献の数え方との同一性は未確認。

### F-22
- 主張/値: **パーマークの幾何と不規則性**（注釈の記述）: (1) 縦長の楕円〜やや前傾した帯状。前方ほど細く傾き、後方ほど短い楕円・円形に近づく（p001, p011, p013）。(2) 濃さは前方または中央部が最も濃く大きく、後方ほど淡く細い（p002, p013, p051, p053）。(3) 間隔は不均等（p001: 約 35–65px、p041: 50–60px で尾側ほど狭く小さい、p049: 70–125px）。(4) 背側のみの中間マークが主マークの間に交互に出る（p011 約 4 個）。(5) 斑が前後・上下にずれる千鳥配置、一部が側線を挟んで上下に分離（p022, p032, p033, p069）。(6) 隣接マークの融合・二重化（p012, p013, p033）。(7) 体側の円形斑と一部が接する（p012）。(8) 上端が背面の暗帯に融合（p051）。**左右の比較は、全レコードが片側のみのため評価不能。**
- 適用範囲: 写真 70 枚の注釈。px はスケール無し。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（parr_marks.irregularities）。
- 証拠: [C(P)] 注釈例（p033）「多くの斑が体側上部と下部(側線下)で上下に分かれて位置が少しずれる千鳥状。第5斑付近で斑が二重化。」

### F-23
- 主張/値: **側線下の円形斑（青灰〜黒）**: 注釈 70 件中 59 件で個数または配置が記述され（6 件は判別不能）、うち約 20 件が青灰〜青黒と記述。個数・大きさの個体差が極めて大きい: p003 黒い丸斑約 30（径 10–25px、体中央〜腹側に 2–3 列で中央部に密）、p002 青灰の丸斑約 9（12–28px）、p004 青灰約 10（12–25px）、p011 青黒の小円約 12–14 が横一列（径は眼径の 0.2–0.5 倍、体中央が最大）、p012 灰黒の小円斑 60 超（4–8px、3–4 列の不規則配置）、p013 黒い円斑約 8（20–30px、前半で大きく後半で小さい）、p014 B 魚で 3–4 個。**栃木県・群馬県の判別基準に出る「腹部青斑点」に対応する可能性があるが、これは調査員の推論で資料の主張ではない。**
- 適用範囲: 写真 70 枚（側線下が水の歪み等で判別できないものを除く）。個体の大きさ・解像度・距離が違うため個数は比較精度が低い。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（spots.black_below_LL）。対応づけ候補の文献: https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf ／ https://www.pref.gunma.jp/page/20806.html
- 証拠: [C(P)] 注釈例（p012）「LL下に径4-8pxの灰黒の小円斑が60個以上、3-4列の不規則な列で並び、腹側まで広がる」。

### F-24
- 主張/値: **赤橙色の斑と側帯**: 赤橙斑が「あり」と記録されたのは yamame ラベル 57 枚中 3 枚（p001: パーマーク間の拡散した鮭肉色斑 4–5 個, sRGB 中央値≈(165,113,92), Lab a*≈18, 輪郭不鮮明; p033: 鮮橙 1 個（径約 5px）＋面的な淡橙帯; p038: 約 3 個だが過露出で白に近く判別不確実）。amago_or_hybrid_suspect 5 枚中 4 枚（p019: 橙赤〜朱色≈(202,114,68), 径 4–8px, 輪郭明瞭な円形; p057: ≈(178,105,70); p037: 朱赤〜赤橙, 径 3–6px; p070: 鈍い煉瓦赤〜桃で淡い暈を伴う）、unclear 2 枚（p065, p066: 暗い錆赤で、黒点が赤褐色化したものの可能性）。**体側の側帯（サーモンピンク〜橙の拡散帯）は 70 枚中 39 枚で記録**。例: p002 ≈(219,190,162)、p013 ≈(223,191,167)、p025 ≈(206,181,140)。p001 は「明確なピンクの縦走帯ではなく橙色味」。
- 適用範囲: 写真 70 枚。ラベル付けに赤斑を使っているため循環あり。色は水膜グレア・露出の影響を受ける（信頼度 med 中心）。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（spots.red_orange_spots, lateral_band）。
- 証拠: [C(P)] 注釈例（p019）「橙赤〜朱色（中央値約sRGB 202,114,68）。径約4-8px、輪郭は明瞭で円形。」

### F-25
- 主張/値: **鰭の前縁が白い**: 腹鰭・臀鰭・背鰭などに「白い前縁/白縁」と記述された写真が 70 枚中約 38 枚（文字列検索による概算。偽陽性を含みうる）。例: 腹鰭（p005, p007, p016, p024, p028, p032, p033, p039, p042）、臀鰭（p009, p016, p024, p029, p032, p033, p034, p035, p037, p045, p049, p052, p058, p061, p066）、背鰭（p010 半透明で白縁、p029 半透明クリーム黄で前縁白）、胸鰭（p013 橙黄色で前縁に白い鰭条、p044/p045 黒灰の鰭で前縁に青白い縁）。**鰭の色**: 胸鰭は橙黄〜琥珀（p001 ≈(196,152,82), p013 ≈(191,152,68)）、腹鰭・臀鰭は半透明の青灰〜クリーム〜淡黄〜桃、基部が橙褐〜赤褐の例（p052 臀鰭基部が赤褐色, p049 臀鰭の下縁が赤橙）。
- 適用範囲: 写真 70 枚。水中・水面反射や鰭が擦れた部分が白く見える可能性（p026 は「擦れ/反射の可能性」と自注）。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（fins）。文献側: HRO（降海期に背鰭先端に白色部を持つ個体あり）https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 証拠: [C(P)] 注釈例（p016）「白い前縁と暗灰の鰭条、先端が白い。」

### F-26
- 主張/値: **脂鰭と頭部/鰓蓋の斑**。脂鰭: 70 枚中、形状・色まで記述できたのは約 14 枚（残りは不可視・不確実）。小さい葉形で、灰・淡灰・クリーム色・灰青・灰紫・灰緑の半透明（p012, p016, p017, p018, p021, p023, p029, p032, p033, p049）。**縁取りは暗色（p040「縁に暗い縁取り」, p064「黒い縁取り」）、白縁（p016）、縁取り無し（p031「縁取りの黒はなし」, p032「縁取りの橙/黒なし」, p033, p049）が混在し、橙縁は確認されなかった**（p059 も「橙縁は確認できない」）。p029 は根元に黒い線。p031（unclear ラベル）は赤褐〜褐色の脂鰭。頭部/鰓蓋: 鰓蓋は銀褐色に淡桃褐のまだら（p001）、淡ピンク〜ラベンダーの虹彩光（p010）、橙褐色の大きな斑状（p012）、銀（p009）。項・頬・鰓蓋の小黒点は、p002 で 2 個、p004 で約 12 個（吻・頬・項）、p011/p013/p014 で数個、p009 では無し。**明確な「鰓蓋の黒斑」は一貫して確認されず**（p041 に暗色ぼかし 1 個のみ）。
- 適用範囲: 写真 70 枚。焦点外・遮蔽・水膜で判別できない個体が多い。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（fins.adipose, spots.opercle_head_spots）。
- 証拠: [C(P)] 注釈例（p064）「暗褐色の小さな葉状、黒い縁取り」、（p032）「灰紫色の小さな楕円形、半透明、縁取りの橙/黒なし」。

### Part C. 調査員の記憶（M。未検証。数値は記載しない。仕様に使わず検証用の手がかりとして扱う）

### F-27
- 主張/値: 硬骨魚類の皮膚には、黒〜褐色の**メラノフォア**、黄色の**キサントフォア**、赤〜橙色の**エリスロフォア**、グアニン結晶による反射/虹色の**イリドフォア**、白色の**ロイコフォア**（出現は限られる）があり、真皮内で層をなして配置され、赤橙色の斑や鰭の黄〜橙色は主にカロテノイド（アスタキサンチン系など）を含む色素胞に由来する、という一般知識。サケ科の赤斑がどの色素胞/色素に由来するか、パーマークの下層構造（メラノフォア密度・イリドフォアとの関係）はヤマメで未確認。
- 適用範囲: 硬骨魚類一般（サケ科固有かは未確認）。
- 出典: なし（検索で未確認）。確認用の書誌候補（書誌事項の正確性も未確認）: Fujii R. (1993) "Coloration and chromatophores", in The Physiology of Fishes。F-06 のグアニン沈着（銀化）のみ検索要約に裏付けがある。
- 証拠: [M] 記憶。未検証。

### F-28
- 主張/値: 魚の縞/斑模様に対して反応拡散（Turing 型）モデルを適用した研究群がある、という一般知識。確認用の書誌候補（記憶、詳細未確認）: Kondo & Asai (1995, Nature; タテジマキンチャクダイの縞)、Kondo & Miura (2010, Science; 総説)、Miyazawa, Okamoto & Kondo (2010, Nat. Commun.; サケ科の交雑個体で親種の模様が混ざる現象を扱った報告と記憶するが、対象種は未確認)。縞→斑の遷移がパラメータ/領域サイズの変化で説明されるというモデル一般の性質は記憶にあるが、**ヤマメのパーマーク間隔の統計やモデルパラメータは一切未取得**。
- 適用範囲: 魚類一般/モデル論。ヤマメ固有ではない。
- 出典: なし（検索で未確認）。
- 証拠: [M] 記憶。未検証。

### F-29
- 主張/値: パーマークの機能: ギンザケ幼魚（coho parr）で基質色の選好と反射率からクリプシス（保護色）を示唆した研究があるという記憶（Donnelly & Dill 1984, J. Fish Biol. と記憶、書誌・結論とも未確認）。パーマークと優劣・攻撃性の関係（優位個体の体色、パーマーク濃度の変化）については、検索要約に出た種不明の一般論（F-19「優位個体は明るい基質に馴染み従属個体は暗色」）以外に資料なし。
- 適用範囲: PROXY:O. kisutch（記憶）。
- 出典: なし（検索で未確認）。
- 証拠: [M] 記憶。未検証。

### F-30
- 主張/値: 魚の体色変化には、色素顆粒の凝集/拡散による生理的変化（秒〜分〜時間スケール）と、色素胞の数・密度・形態が変わる形態的変化（日〜週スケール）があり、ホルモン（MCH, α-MSH 等）と神経が関与する、という一般知識。ニジマス等のサケ科での変化速度・色域の実測値は未取得。確認用の書誌候補（記憶、詳細未確認）: Sugimoto M. (2002) Morphological color changes in fish. Microsc. Res. Tech.。
- 適用範囲: 硬骨魚類一般。
- 出典: なし（検索で未確認）。
- 証拠: [M] 記憶。未検証。

### F-31
- 主張/値: ブラウントラウトの赤斑には淡色の暈（halo）が付くことがある、また脂鰭の縁に橙赤の縁取りが出ることがあるという一般知識。ヤマメの黒点や赤斑に暈が付くか、脂鰭に縁取りがあるかは文献では未確認。写真注釈では、アマゴ疑い個体 p070 の赤褐色斑に「淡い暈を伴う」との記述があり（F-24）、ヤマメ個体の脂鰭には橙縁の記述は無い（F-26）。
- 適用範囲: PROXY:Salmo trutta（記憶）。
- 出典: なし（検索で未確認）。
- 証拠: [M] 記憶。未検証。

---

## 3. 資料間の矛盾・不一致

1. **パーマークの個数**: 青森県 8–10（F-01）／日本語資料 6–9 と 7–10（F-02）／AI 百科 9–10／台湾亜種 9＋小黒点 11–13（F-14）／アマゴ 7–11／写真注釈（yamame n=54）5–12、最頻 8–9、平均 8.6（F-21）。数え方（小さな前後の斑や側線下の斑を含めるか）の差が疑われるが、資料からは確認できない。
2. **パーマークの色**: 「紫黒色・赤紫色」（島根県）／「青色」（神奈川県・ja.wikipedia）／「purple-colored」（r03 要約）／写真注釈「暗灰褐色（中心やや青灰）」（p001）。保存状態・照明・サイズ・地域のいずれによる差かは不明。暗い青紫として表現されうる範囲とみなすのが穏当だが、これは調査員の解釈。
3. **成魚でのパーマークの有無**: 神奈川県図鑑「成魚にも同じように見られる」／ Kato 1991「体が大きくなるとパーマークを失う」／栃木県「全長 31 cm 以上でパーマークも腹部青斑点も無ければサクラマス」。「成魚」の定義（小型成熟魚か大型魚か）の違いの可能性。サイズ依存の変化として扱うのが整合的（r02 §3 と同じ解釈）。
4. **朱点の有無**: 神奈川県・東京都「ヤマメに朱点なし」／丹沢ヤマメ「少数の朱点が入る」沢がある／神奈川県陸封個体群は形態がアマゴ・ヤマメに似て遺伝的にはアマゴに近い／陸封個体は側線部に「うっすら紅」（NIES）／写真では yamame ラベルでも拡散した鮭肉色の斑（p001）や単発の橙点（p033）が出る。→ 「朱点の有無」は二値でなく連続的で、拡散した淡い赤みと輪郭明瞭な朱点が混在しうる。
5. **産卵期（成熟）の体色**: F-17 の 3 系統（黒ずむが桜色にならない／薄桃〜濃紅が不定形／体側の縞が鮮紅色で腹部の淡色帯に融合）。MLIT の「stripes」がパーマークか不明。写真ストリームの産卵期雄（spawning_male は全ラベルで n=4、yamame ラベルは 3）の色サンプルで決める必要がある（本書では未集計）。
6. **背の基調色**: 黄褐色 vs 暗青緑（r03 の指摘どおり）。同一個体群内の個体差・照明・サイズ差かは不明。
7. **脂鰭の縁**: 写真注釈内で暗縁（p040, p064）／白縁（p016）／無縁取り（p031, p032, p033, p049）が混在し一貫しない。個体差か照明/焦点の影響かは不明。
8. **種/生活史型ラベルの入れ替わり**: r03 の指摘のとおり、同じヒット群の要約が「ヤマメ」と「サクラマス」で入れ替わる事例があり、降海型の記述（黒点分布、桜色の婚姻色など）が河川型に混入しうる。F-13 の HRO 記述は降海型中心。
9. **「stripes」「縞」の用語**: MLIT 英文 DB の stripes、日本語資料のパーマークなどの語が同一対象を指すかは不明。

---

## 4. 見つからなかったこと（Gaps）— 3D モデル/アニメ/行動実装に必要だが確認できなかった事項

> 本ストリームは検索 0 回のため、課題の 4 項目すべてで英語一次文献が欠落している。下表の「影響」は仕様への影響の調査員判断。

| # | 課題項目 | 欠落事項 | 影響 |
|---|---|---|---|
| G1 | 1 | **Oncorhynchus（masu / coho / chinook / rainbow）のパーマーク個数・形状・発生（ontogeny）の英語査読文献**。パーマークが何 mm 体長で現れ、どう変化し、スモルト化でどう消えるか（組織学的に何が起きるか） | 高 |
| G2 | 1 | **遺伝・環境による制御**（パーマーク数/形状の遺伝率、成長速度・温度・光との関係） | 高 |
| G3 | 1 | **個体間変異と左右差**（同一個体の左右のパーマーク数・位置・形の差）。写真カタログも全レコードが片側のみ | 高 |
| G4 | 1 | **優劣・攻撃性・保護色との関係**（M 以外の確認、サケ科でのパーマーク濃度と社会的順位） | 中 |
| G5 | 2 | **サケ科の色素胞の種類と層構造**（メラノ/キサント/エリスロ/イリド/ロイコフォアの分布と、パーマーク・赤斑・黒点・体側ピンク・鰭の黄橙のそれぞれの由来） | 高 |
| G6 | 2 | **背景適応の体色変化の速度と範囲**（ニジマス等の実測値、ヤマメは皆無）。昼夜・ストレスでの変化 | 中 |
| G7 | 2 | **ヤマメの体側ピンク（側線部の紅）・胸鰭の橙黄・鰭縁の白の色素学的根拠**（カロテノイド含量、餌依存） | 中 |
| G8 | 3 | **模様形成モデル**（反応拡散/Turing、縞→斑の遷移）のサケ科への適用例と、パーマーク間隔の統計（平均間隔・変動係数・体長依存） | 中 |
| G9 | 3 | **パーマークを手続き生成するための定量制約**（個数分布は F-21 の写真観察のみ。間隔・高さ・傾きの定量は px のみでスケール無し） | 高 |
| G10 | 4 | **脂鰭の縁取りの色・有無**（ヤマメ）、**鰭縁（白前縁）の資料根拠**（写真観察のみ）、**鰓蓋の暗色斑の有無** | 中 |
| G11 | 4 | **暈つき斑（halo）のヤマメでの有無**（ブラウントラウトとの対比、M のみ） | 低 |
| G12 | — | **季節差・年齢差・地域差の定量的な体色データ**（r03 G5/G7 と同じ。写真は季節/地域を調整していない） | 中 |
| G13 | — | **水中照明での見え方**（水深・濁度・波長別の減衰でパーマークや赤みがどう見えるか） | 中 |

### 検索予算の枯渇により未実行のクエリ（追加調査が許可された場合の優先順）
予算引き上げ（`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`）が必要。ユーザー判断事項。推奨 `allowed_domains`: ncbi.nlm.nih.gov, journals.biologists.com, royalsocietypublishing.org, sciencedirect.com, springer.com, wiley.com, nature.com, plos.org, frontiersin.org, pnas.org, jstage.jst.go.jp, cir.nii.ac.jp, repo.nii.ac.jp, fishbase.se, researchgate.net。

1. `parr marks salmonid development number genetics Oncorhynchus`（extended）
2. `parr mark variation individual left right asymmetry trout`
3. `masu salmon parr mark number` ／ `Oncorhynchus masou parr mark ontogeny smoltification disappear`
4. `chromatophores salmonid skin melanophores xanthophores iridophores`（extended）
5. `carotenoid red spots trout skin astaxanthin erythrophore` ／ `salmonid red spots carotenoid erythrophore xanthophore`
6. `Turing pattern salmonid spots stripes reaction diffusion trout`（extended）／ `hybrid char colour pattern blending Turing Kondo`
7. `parr marks dominance aggression camouflage juvenile salmon` ／ `coho parr crypsis substrate colour parr marks`
8. `rainbow trout background colour change melanophore aggregation` ／ `salmonid morphological colour change melanophore density background`
9. `adipose fin colour margin salmonid` ／ `brown trout red spots halo ocellated spots` ／ `opercle dark spot masu salmon`
10. `ヤマメ パーマーク 個数 個体差 左右` ／ `サクラマス パーマーク 形成 発生 稚魚 体長` ／ `ヤマメ 朱点 個体群 割合`
11. `サケ科 色素胞 メラニン キサントフォア カロテノイド ヤマメ 体色` ／ `ヤマメ 体色 背景 適応 実験`
12. `関泰夫 小島将男 1977 ヤマメ 銀毛化変態 成熟`（r03 でタイトルのみ確認、内容未取得）

---

## 5. 出典一覧（URL 付き。本ストリームで開いた URL は 0。以下はすべて r01 / r02 / r03 が検索結果で得た URL の転記）

**学術論文・報告書（A / A 候補）**
- Size-driven parr-smolt transformation in masu salmon, Sci. Rep. 2023 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ ／ https://link.springer.com/10.1038/s41598-023-43632-7
- 加藤文男 (1991) 大型アマゴ・ヤマメの形態及び生態に関する知見, 水産増殖 39(3):279–288 — https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/
- Marine Biotechnology 22:812–823 (2020)（神奈川県陸封個体群）— https://link.springer.com/article/10.1007/s10126-020-09975-2 ／ https://pubmed.ncbi.nlm.nih.gov/32488506
- 森・名越 (1986) イワメとアマゴ, 三重大学水産学部研究報告 13:135–143 — https://cir.nii.ac.jp/crid/1050001202938999296 ／ https://mie-u.repo.nii.ac.jp/records/5636
- Christie (1970) Review of the Japanese Salmons — https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf
- Fujioka et al. (2025) Ichthyological Research 73:188–200 — https://link.springer.com/article/10.1007/s10228-025-01032-z
- 北大水産学部研究彙報（グアニン/肥満度）— https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22122/1_P39-42.pdf ／ https://fra.repo.nii.ac.jp/records/2007545
- 日本水産学会誌・日本生態学会・水産研究・教育機構（早熟雄）— https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_16-00006/_article/-char/ja/ ／ https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_22-00024/_pdf ／ https://esj.ne.jp/meeting//abst/61/S05-2.html ／ https://fra.repo.nii.ac.jp/record/2009615/files/sapporo_sk_13_3.pdf
- 関・小島 (1977)（リード）— https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja
- Zool. Sci. 15(6)（アマゴ・マスの遺伝的関係）— https://bioone.org/journals/zoological-science/volume-15/issue-6/zsj.15.971/Genetic-Relationship-between-Masu-and-Amago-Salmon-Examined-through-Sequence/10.2108/zsj.15.971.full
- Jan et al. (1990)（台湾亜種、未確認）— https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf

**公的機関・自治体・図鑑（B）**
- 青森県産業技術センター内水面研究所 — https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html ／ https://www.aomori-itc.or.jp/_files/00061476/343-346.pdf
- 北海道立総合研究機構 — https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 神奈川県 — https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html
- 東京都島しょ農林水産総合センター — https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html
- 島根県 — https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html
- 栃木県 — https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf ／ https://www.pref.tochigi.lg.jp/g65/documents/sakuramasu2016ankeitomatome.pdf
- 群馬県 — https://www.pref.gunma.jp/page/20806.html ／ https://www.pref.gunma.jp/uploaded/attachment/46107.pdf
- 埼玉県 — https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html
- 国立環境研究所 NIES — https://www.nies.go.jp/biodiversity/invasive/DB/detail/50830.html
- 国土交通省 多言語 DB — https://www.mlit.go.jp/tagengo-db/en/R2-00580.html ／ https://www.mlit.go.jp/tagengo-db/R2-00580.html
- 農林水産研究（agriknowledge）— https://agriknowledge.affrc.go.jp/RN/2030927242.pdf
- 北海道さけ・ますふ化場（Kubo 候補）— http://salmon.fra.affrc.go.jp/kankobutu/srhsh/data/srhsh245.pdf
- 魚類図鑑・博物館 — https://museum.umic.jp/kawa/zukan/sakana/yamame.html ／ https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html ／ https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1 ／ https://fishai.jp/815 ／ https://www.honda.co.jp/fishing/picture-book/yamame/ ／ https://www.honda.co.jp/fishing/picture-book/sakuramasu/index.html
- FishBase（台湾亜種）— https://www.fishbase.se/summary/16686

**Wikipedia 系・AI 生成・一般（C）、PROXY**
- https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ／ https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF ／ https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://en.wikipedia.org/wiki/Oncorhynchus_masou_macrostomus ／ https://grokipedia.com/page/Oncorhynchus_masou ／ https://lifeoftaiwan.com/nature/the-formosan-landlocked-salmon-taiwans-unique-natural-wonders-part-1/
- PROXY（サケ科一般・種不明）— https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf ／ https://pubs.usgs.gov/publication/70180320 ／ https://www.webapps.nwfsc.noaa.gov/assets/26/6745_06272011_103138_Mighell.1978-rev.pdf ／ https://orb.binghamton.edu/research_days_posters_2024/52

**写真ストリーム（文献ではない）**
- `docs/yamame/photo_analysis/catalog_c01.json` 〜 `catalog_c07.json`（70 枚。各レコードの `source_url` に元写真）

---

## 6. 検索ログ

| # | ツール | クエリ/URL | 結果 | 有用ヒット数 |
|---|---|---|---|---|
| 1 | WebSearch (standard) | parr marks salmonid development number genetics Oncorhynchus | **実行されず**（WebSearch 上限 200/200 到達） | 0 |
| 2 | WebSearch (standard) | masu salmon parr mark number | **実行されず**（同上） | 0 |
| 3 | WebSearch (standard) | chromatophores salmonid skin melanophores xanthophores iridophores | **実行されず**（同上） | 0 |
| 4 | WebFetch | https://en.wikipedia.org/wiki/Parr_mark | `EGRESS_BLOCKED`（en.wikipedia.org はネットワークエグレスプロキシで遮断。以後試行せず） | 0 |

- 有効検索回数: **0**（目標 40〜80 回に対して未達。原因はセッション共有の検索予算枯渇であり、クエリ設計やヒット重複によるものではない）。
- 以降の作業は、既存の r01（部分読み＋パーマーク/色関連の Grep）、r02（同）、r03（全文）と、写真カタログ 7 ファイル（Python による JSON 集計）の読み取りのみ。いずれもローカルファイルで、外部通信は行っていない。
- 参考: 同一予算を共有した先行ストリームの有効検索回数は r03 が 33 回、r02 が 57 回（各文書の記載による）。
- 迂回の試行なし: `/root/.ccr/README.md` を確認したが、403/407 の組織ポリシー拒否は回避しない方針に従い、curl 等での代替取得は行っていない。
- 写真カタログ集計: yamame ラベル n=54 のパーマーク数（F-21）、側線下の円形斑（F-23）、赤橙斑/側帯（F-24）、白前縁（F-25）、脂鰭/頭部（F-26）は Python で文字列/数値を集計。白前縁と円形斑の判定は正規表現による概算で、偽陽性/偽陰性を含みうる。
