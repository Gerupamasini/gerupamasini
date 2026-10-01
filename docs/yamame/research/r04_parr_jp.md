# ヤマメ(Oncorhynchus masou masou 河川型)のパーマーク・黒点・朱点・体色（日本語資料）— r04

> **調査方法の制約（必読・本書の性格）**
> 1. **新規の Web 検索は 1 件も実行できなかった**。このセッションの WebSearch 予算（200/200）は先行ストリーム r01〜r03 が使い切っており、本ストリームが発行した 4 クエリはすべて「予算超過のため未実行」で返った。WebFetch も `ja.wikipedia.org` で EGRESS_BLOCKED を 1 回確認し、以後試行していない。Bash/curl は遮断。
> 2. したがって本書は **新規一次調査ではなく**、(a) 先行ストリームの成果物 `r01_morph_jp.md` / `r02_morph_en.md` / `r03_lifestage_sex.md` のうち、パーマーク・斑点・体色に関わる Finding の **再整理（二次引用）**、(b) 調査員の **記憶（証拠ランク M・未検証）**、(c) 取得できなかった事項の **Gap 一覧** で構成される。
> 3. 二次引用の Finding は、元ストリームの証拠ランクと「要約文からの根拠」をそのまま持ち込み、**ランクを上げていない**。元の要約文が機械要約であることによる欠陥（出典 URL の帰属不能・ラベル入れ替わり）も元ストリームの注意書きごと引き継いでいる。各 Finding の「引用元」欄に元ファイルと F 番号を示す。
> 4. 検索結果に出なかった URL・著者・数値は一切創作していない。M は「記憶であり、仕様に使う前に写真ストリーム・原典で必ず検証すること」を意味する。
>
> **証拠ランク**: A=査読論文・学術書・公的機関資料で要約文に記述明示 / B=図鑑・博物館・自治体・研究機関解説・公的 DB / C=Wikipedia 系・釣り情報・個人サイト・AI 生成百科・出典不明 / M=調査員の記憶（未検証）。PROXY は scope に明記。

---

## 1. 要約（仕様に直結する結論）

1. **パーマーク数（片側）**: 青森県の実測報告でヤマメ 8–10 個 [F-01]。図鑑・解説系は 7–10 個、別系統で 6–9 個と記載が割れる [F-02][F-03]。割れの理由（数え方・地域・サイズ）は未確認。仕様の暫定コアは「7–10 個」、裾（6, 11）は資料で未確認 [F-01][F-02]。
2. **近縁（PROXY）の個数**: アマゴ 7–11 個 [F-06]、台湾亜種 O. m. formosanus は楕円形斑 9 個＋側線上方の小黒点 11–13 個 [F-04]。ヤマメの値として流用しない。
3. **形・色**: 「小判型（楕円形）」が体側に並び、側線を横切る [F-07][F-05]。色は「紫黒色・赤紫色」（島根県）と「青色」（神奈川県・ja.wikipedia）が併存し一致しない [F-07]。→ 暗い青〜青紫系の幅を持たせ、照明・個体で振る。
4. **サイズによる消長**: 加藤（1991）は大型のアマゴ・ヤマメが体の成長とともにパーマークを失うと報告 [F-08]。一方、神奈川県図鑑は「成魚にも同じように見られる」 [F-07]。栃木県は全長 30 cm 以下でパーマークまたは腹部青斑点があればヤマメ、31 cm 以上で両方とも無ければサクラマスとする運用基準 [F-09]。→ 「30 cm 前後から薄れうる」というサイズ依存の連続変化として扱うのが整合的（調査員の解釈、資料の主張ではない）。
5. **銀化（降海型の過程）**: スモルト化でパーマークが見えなくなり銀白化する。皮膚へのグアニン・ヒポキサンチン増加を伴う [F-10][F-35]。河川型ヤマメのモデルには原則適用せず、「降海型バリアント」用の別外観とする。
6. **朱点**: ヤマメには無い、アマゴには有る、が日本語公的資料の標準的記述 [F-15][F-16][F-17]。体側の赤色斑の有無と鱗の模様で、大型個体でも種間差が明瞭 [F-16]。
7. **ただし例外の存在**: 神奈川県酒匂川水系の在来「丹沢ヤマメ」には少数の朱点が入る個体群があり、沢ごとに外観が異なる [F-18]。相模川・酒匂川の陸封個体群は形態がアマゴ・ヤマメ双方に似るが遺伝的にはアマゴ寄りで、中間的特徴の個体もいる [F-19][F-20]。→ 個体差システムに「朱点ごく少数」の稀なバリアントを**地域フラグ付き**で許容する余地（発生頻度は資料に無し）。
8. **黒点の分布**: 頭部を除く背部、背鰭・脂鰭・尾鰭に黒点があり、頭部背面には無い（北海道立総合研究機構、サクラマス解説＝降海型中心）[F-21]。ヤマメの記述として「背部〜側線にかけて散在、背鰭・腹鰭・臀鰭・尾鰭の先端が黒い」(C) [F-22]。目の周りの黒点は釣りサイト記述のみ (C) [F-24]。**黒点の大きさ・個数・側線下の分布・鰓蓋の黒点は資料に無し**（Gap）。
9. **体色の基調**: 背は暗青緑〜暗青、または黄褐色に小黒点（資料間で基調色が異なる）、腹は白 [F-03][F-23][F-28]。降海型は体側が銀白色 [F-28]。台湾亜種(PROXY)は頭頂が緑、眼・鰓蓋周辺が銀色、鰭は銀緑色 [F-04]。
10. **側線部の淡い紅色**: 陸封個体は「側線部にうっすらと紅をはく」（NIES）[F-25]。桃/赤の縦走帯（体側の縦帯）がヤマメに常在するという資料は無い。
11. **鰭の色**: 背鰭・脂鰭・尾鰭の黒点と先端黒 [F-21][F-22]、降海型の背鰭先端の白色部 [F-26]。**胸鰭・腹鰭・臀鰭の色、脂鰭の縁色、尾鰭の縁色は信頼できる資料が取得できなかった**。
12. **成熟期（婚姻色）— 河川型は資料が三分**: 「黒ずむが桜色にならない」 [F-30]、「黒っぽい体に薄桃〜濃紅の婚姻色が体側から鰭まで不定形」 [F-31]、「背が暗化し体側の縞が緋色〜深紅になり腹部で淡色の縦帯に融合・桜色」 [F-32]。降海型（サクラマス）は雄が黒ずみ雲状の桜色斑 [F-29]。暫定は「黒化＋不定形な淡桃〜紅、雄で強い」だが**要写真確認**。
13. **早熟雄（成熟した河川残留雄）**: 体高が高く、体色が暗色化し、パーマークが未成熟魚よりくっきり見える [F-11]。
14. **養殖・放流魚**: 色彩が薄く体型が丸く、鰭の欠け・くすみ。10月放流魚は天然魚に近づく [F-33]。
15. **模様の個体差の幅**: 体型や生活が同じでも体側模様だけが本質的に異なる型（イワメ＝模様を欠く型、PROXY:アマゴ）が実在 [F-14]。マスの幼魚には体形・大きさ・背鰭の黒色素などで 5 型以上の parr 型が認められる [F-12]。→ パーマークを完全対称・定型テクスチャにしない根拠だが、左右非対称・融合・分裂の頻度は資料が無い（M のみ [F-39]）。
16. **遺伝・環境要因**: パーマーク数・斑点・体色の遺伝率や環境効果を示す資料は取得できなかった。関連しうる資料は、計数形質の河川間差（北海道日本海側 7 河川）[F-36]、椎骨数の遺伝成分 [F-37]、ヤマメ・アマゴ間の塩基配列に基づく遺伝的関係研究の存在（内容不明）[F-38] のみ。
17. **季節差・年齢差・川底色などの環境差・水中照明下の見え方**: 河川型ヤマメ固有の資料は取得できず。一般機構（色素胞の顆粒の凝集・拡散で背景に応じて明暗が変わる、PROXY・種不明）のみ [F-34]。
18. **本書の限界**: 以上の大半は二次引用で、数値の多くは要約文に基づく。3D の仕様値として確定するには原典（Gap 表の「原典候補」）または写真計測での確認が必須。

---

## 2. Findings

### F-01
- 主張/値: 青森県のヤマメ（河川型）の外部形態として **パーマーク 8–10 個**（同報告に背鰭条 12–13、胸鰭条 12–14、腹鰭条 9、臀鰭条 12–14、側線鱗 118–134）。片側か両側か、計数範囲（小さい前後の斑を含むか）は要約に無し。
- 適用範囲: ヤマメ（河川型）/ 青森県の河川 / n・体長範囲・調査年は要約に無し。
- 出典: 青森県産業技術センター（内水面研究所）「サケ、マス保護水面管理事業に伴うサクラマス調査」 https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html 〔引用元: r01 F-01、二次引用〕
- 証拠: [A] 公的機関の事業報告。元ストリームは 3 回の独立クエリで同一数値を再現。「パールマーク8-10個」（要約文の言い換え）。要原典確認。

### F-02
- 主張/値: 日本語の図鑑・解説に **パーマーク個数の 2 系統の記載**: 「体側中央に楕円形の比較的大きなパーマークが 6–9 個」と「体側に 7–10 個」。背部から側線にかけて黒点が散在すると併記。
- 適用範囲: ヤマメ（O. m. masou）。どの記述がどの URL か帰属未確定。
- 出典（候補）: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://museum.umic.jp/kawa/zukan/sakana/yamame.html ／ https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html ／ https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF ／ https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1 〔引用元: r02 F-14、二次引用〕
- 証拠: [C] 「体側中央に楕円形の比較的大きなパーマークが6-9個並ぶという記載もありますが、別の資料では体側に７～10個のパーマークがある」（元ストリームの引用）。

### F-03
- 主張/値: ヤマメの基本外観: **背は黄褐色（または暗青緑）で小黒点が散在、腹は白、体側に楕円形のパーマークが 7–10 個**。パーマークを「紫がかった色」と記す資料がある。背の基調色は Q11（暗青緑）と Q20（黄褐色）で異なる。
- 適用範囲: ヤマメ（河川型）/ 季節・サイズ・地域不明。
- 出典（候補）: https://www.honda.co.jp/fishing/picture-book/yamame/ ／ https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html ／ https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html 〔引用元: r03 F-19、二次引用〕
- 証拠: [B] 「yellowish-brown dorsal region with small black spots, white ventral region, 7-10 parr marks on their body sides」「purple-colored parr marks」（元ストリームの引用要約）。

### F-04
- 主張/値: 台湾亜種 O. m. formosanus の成魚（約 30 cm）: 体側に **9 個の楕円形暗色斑（パーマーク）と、側線上方の 11–13 個の小黒点**。頭頂は緑、眼と鰓蓋周辺は銀色、鰭は銀緑色。尾鰭は成魚で浅い二叉。背鰭と脂鰭ははっきり離れる。
- 適用範囲: **PROXY:O. m. formosanus**（台湾陸封型）。ヤマメの値として使用不可。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://www.fishbase.se/summary/16686 ／ https://lifeoftaiwan.com/nature/the-formosan-landlocked-salmon-taiwans-unique-natural-wonders-part-1/ 〔引用元: r01 F-12、r02 F-03、二次引用〕
- 証拠: [B] 「nine elliptical dark spots and 11-13 smaller black spots on each side of the body」（元ストリームの引用）。元 r01 は同じ記述を C としており、r02 は B。ここでは保守側の扱いとして B/C の範囲と読む。

### F-05
- 主張/値: AI 生成百科の O. masou 記述: 幼魚はオリーブ緑〜褐色の背と銀色の体側、**側線を横切る楕円形パーマークが典型的に 9–10 個**。
- 適用範囲: PROXY:O. masou 種全体（AI 生成百科）。
- 出典: https://grokipedia.com/page/Oncorhynchus_masou 〔引用元: r01 F-11、二次引用〕
- 証拠: [C] AI 生成のため最低信頼。「Rakers on first gill arch…」など同ページ他記述の要約から。パーマークの個数・「側線を横切る」配置は他資料（F-07 等）と矛盾しないが単独では使わない。

### F-06
- 主張/値: アマゴは **体側に 7–11 個の青色パーマークと朱点**（東京都島しょ農林水産総合センター解説）。別資料に「アマゴ約 10」。
- 適用範囲: **PROXY:アマゴ（O. masou ishikawae）**。
- 出典: https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html 〔引用元: r01 F-15・§3、二次引用〕
- 証拠: [B] 「アマゴは体側に7–11個の青色パーマークと朱点」（元ストリームの記載）。

### F-07
- 主張/値: 神奈川県の図鑑解説: ヤマメは「体側には**小判型のパーマーク**が並び、**成魚にも同じように見られます**。アマゴと異なり朱点はありません」。NIES: 陸封個体は体側にパーマークが並ぶ。**パーマークの色**は島根県が「紫黒色・赤紫色」、神奈川県・ja.wikipedia が「青色」と記述。
- 適用範囲: ヤマメ（河川型）/ 日本各地。
- 出典: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html ／ https://www.nies.go.jp/biodiversity/invasive/DB/detail/50830.html ／ https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 〔引用元: r01 F-15・§3-7、二次引用〕
- 証拠: [B] 「体側には小判型のパーマークが並び、成魚にも同じように見られます。アマゴと異なり朱点はありません」（神奈川県要約）。色の不一致は §3-2。

### F-08
- 主張/値: 加藤（Kato 1991）: 大型のアマゴ・ヤマメでも **体側の朱点（赤色斑）の有無と鱗の特徴で種間差が明瞭**。**両者とも体が大きくなるとパーマークを失う**。降海型に似るが、尾柄高・鰭の大きさ・鱗のパターンに幼魚の特徴を残す。ヤマメは 2+ 歳以上で約 300 mm（体長か全長かは要約に無し）。
- 適用範囲: アマゴ・ヤマメ（福井県の河川・ダム湖の大型個体）。
- 出典: 加藤文男（1991）「大型アマゴ・ヤマメの形態及び生態に関する知見」水産増殖 39(3):279–288. https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ 〔引用元: r01 F-14、r02 F-12、二次引用〕
- 証拠: [A] 「Both Amago and Yamame lose their parr marks as their bodies grow larger.」（元 r02 の引用）。

### F-09
- 主張/値: 栃木県の判別基準: ヤマメは「パーマークと腹部青斑点の両方あるいはいずれかが確認でき、全長 30 cm 以下の個体はヤマメの可能性が高い」、サクラマスは「全長 31 cm 以上でパーマークと腹部青斑点の両方が確認できない」。調査上の運用基準で生物学的境界値ではない。
- 適用範囲: 栃木県の調査における河川型ヤマメと降海型サクラマスの判別。
- 出典（候補）: https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf ／ https://www.pref.tochigi.lg.jp/g65/documents/sakuramasu2016ankeitomatome.pdf 〔引用元: r02 F-13、二次引用〕
- 証拠: [B] 「全長30cm以下の個体はヤマメの可能性が高いのに対し、サクラマスは全長31cm以上でパーマークと腹部青斑点の両方が確認できません」（元 r02 の引用。URL 帰属は候補）。

### F-10
- 主張/値: スモルト化＝**パーマークが消えて体が銀白色になる**。降海は 4–6 月ごろ。銀化は「銀白化が強まり、体側の斑紋（パーマーク）がほとんど見えなくなる」ことと説明される。成熟した河川残留雄ではパーマークがくっきり残る点が対照的。PROXY の一般則として移行途中の個体（ある調査で降海個体の 50% が完全銀化、45% が移行期、5% が parr 様の体色）。
- 適用範囲: (a) ヤマメ／サクラマス（群馬県系資料）(b) PROXY:サケ科一般（種・出典不明）。
- 出典: https://www.pref.gunma.jp/page/20806.html ／ https://www.honda.co.jp/fishing/picture-book/sakuramasu/index.html ／ https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf 〔引用元: r03 F-18、二次引用。文書の特定は元ストリームでも不能〕
- 証拠: [B] 「パーマークが消えて体が銀白色になり(スモルト化)、4~6月ごろに海へと下ります」（元 r03 の引用）。(b) は [C/PROXY]。

### F-11
- 主張/値: **早熟雄（成熟した河川残留雄）は、他の多くの未成熟魚に較べて体高が高く、体色が暗色化し、体側のパーマークが未成熟魚よりくっきり見える**。銀化魚と異なり海水適応能も発達しない。
- 適用範囲: サクラマス（ヤマメ型）の早熟雄 parr / 北海道系の研究と思われるが地域は要約に無し。
- 出典（候補・特定不能）: https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_16-00006/_article/-char/ja/ ほか r03 F-05 に列挙 〔引用元: r03 F-05、二次引用〕
- 証拠: [B] 学術系文書と推定されるが文書特定不能のため A から 1 段下げ（元ストリームの判断）。「体高が高く、体色が暗色化しており、体側にある斑紋（パーマーク）が未成熟魚よりもくっきりとして見え」。

### F-12
- 主張/値: 渓流の幼魚（parr）は deep-bodied でパーマークが顕著、スモルトはパーマークを失い銀化し細身になる。マスでは **Kubo が体形・大きさ・背鰭の黒色素・銀化・行動などから少なくとも 5 型以上の parr 型**を認めた（表現型多型）。
- 適用範囲: サケ科一般＋マス（Kubo）。**引用元は Mighell 1978 (NOAA) と McCormick らの文献が混在し特定不能**。
- 出典: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/（近傍）／ https://www.webapps.nwfsc.noaa.gov/assets/26/6745_06272011_103138_Mighell.1978-rev.pdf 〔引用元: r01 F-31、二次引用〕
- 証拠: [C] 「Stream-dwelling juveniles are deep-bodied and have prominent parr marks…」「Kubo … recognizing at least five or more types of parr」（元ストリームの要約引用）。parr 型の具体的な外観差は不明。

### F-13
- 主張/値: サクラマス幼魚（降海型）の体側には **大型で小判形の暗青色パーマークが数個以上**並ぶ。幼魚初期（5–7 月）体長 40–60 mm、中期（7–9 月）平均 60–80 mm、後期（9 月後半–10 月末）に相分化が明瞭。
- 適用範囲: サクラマス幼魚（北海道）。ヤマメ幼魚の外観を直接示したものではない。
- 出典（候補）: http://salmon.fra.affrc.go.jp/kankobutu/srhsh/data/srhsh245.pdf ／ https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf 〔引用元: r01 F-26、二次引用〕
- 証拠: [C] 出典特定不能。「幼魚初期は5月から7月にかけて体長40-60mm」（元ストリームの要約引用）。

### F-14
- 主張/値: 三重県三国谷の **イワメ（体側模様を欠く型）とアマゴ**の比較: 成長・体サイズ・摂餌・性比・肥満度などの基本的差は無く、**本質的な差は体側模様のみ**。
- 適用範囲: **PROXY:アマゴ（イワメ型）**。ヤマメでの同様の型は資料に無し。
- 出典: 森誠一・名越誠（1986）三重県三国谷のイワメとアマゴにおける形態比較. 三重大学水産学部研究報告 13:135–143. https://cir.nii.ac.jp/crid/1050001202938999296 ／ https://mie-u.repo.nii.ac.jp/records/5636 〔引用元: r01 F-19、二次引用〕
- 証拠: [A] 書誌と要旨が要約に明示。「no significant differences in fundamental ecological characteristics … the only essential difference between them is their side patterns」（元ストリームの引用）。

### F-15
- 主張/値: 日本語の公的資料（神奈川県・東京都・NIES 等）は、**河川型ヤマメには朱点が無い**（アマゴとの区別点）とする。アマゴは体側の朱点を持つ。
- 適用範囲: ヤマメ（河川型）・アマゴ / 日本各地（資料により地域が異なる）。
- 出典: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html ／ https://www.nies.go.jp/biodiversity/invasive/DB/detail/50830.html 〔引用元: r01 F-15、r02 F-11、二次引用〕
- 証拠: [B] 「アマゴと異なり朱点はありません」（神奈川県要約、元ストリームの引用）。

### F-16
- 主張/値: （F-08 と同論文）大型個体でも **体側の朱点の有無と鱗の特徴で、アマゴとヤマメの種間差が明瞭**。鱗の特徴の内容（隆起線など）は要約に無い（別検索で「ヤマメの鱗の隆起線が頂部で消失/不明瞭」との断片が core.ac.uk に出たが同論文かは不明）。
- 適用範囲: 福井県のアマゴ・ヤマメ。
- 出典: https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ 〔引用元: r01 F-14、二次引用〕
- 証拠: [A] 元ストリームの要約引用（F-08 参照）。

### F-17
- 主張/値: O. masou 種複合体（マス＝ヤマメ／アマゴ／ビワマス）の識別: 形態・計数形質は互いによく似るが、**鱗の形態と、幼魚・成魚の側線上下の赤色斑の有無**が識別形質。**アマゴは側面に朱点があり、マス（ヤマメ）は黒点のみ**。ビワマス新種 O. biwaensis（2025 年記載）は幽門垂が多く側線上方の横列鱗が少ない点でマス・アマゴと区別される。
- 適用範囲: O. masou 種複合体 / 幼魚・成魚。赤色斑の記述がどの文書由来か（Fujioka et al. 2025 本文か、英語版 Wikipedia か）は帰属未確定。
- 出典: Fujioka Y. et al. (2025) Ichthyological Research 73:188–200 https://link.springer.com/article/10.1007/s10228-025-01032-z ／ https://en.wikipedia.org/wiki/Oncorhynchus_masou_macrostomus ／ https://bioone.org/journals/zoological-science/volume-15/issue-6/zsj.15.971/Genetic-Relationship-between-Masu-and-Amago-Salmon-Examined-through-Sequence/10.2108/zsj.15.971.full 〔引用元: r02 F-10、二次引用〕
- 証拠: [B] 赤色斑の記述は出典帰属不能のため B（元 r02 は同 Finding を A としているが、A 根拠は幽門垂・横列鱗の部分）。

### F-18
- 主張/値: 神奈川県の試験研究: 酒匂川水系の在来「丹沢ヤマメ」は、外部形態が **パーマークや小黒点が多い、少数の朱点が入る、など沢によって異なる**。mtDNA のハプロタイプも複数出現。東京都は外部形態（パーマークの数・形状・朱点）の解析を実施。
- 適用範囲: ヤマメ（河川型）/ 神奈川県酒匂川水系（太平洋側分布の南限域）。「少数の朱点」を持つ個体の割合・位置・大きさは要約に無し。
- 出典: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html（どちらの文かは特定不能）〔引用元: r01 F-18、二次引用〕
- 証拠: [B] 「外部形態はパーマークや小黒点が多い、少数の朱点が入る、その沢によって異なる特徴があり」（元ストリームの引用）。

### F-19
- 主張/値: 神奈川県（相模川・酒匂川水系）の陸封 O. masou 上流個体群は、**形態はアマゴ・ヤマメに似るが、遺伝的にはアマゴに近い**。神奈川県は太平洋側ヤマメ分布の南限とされ、ヤマメとアマゴの中間的特徴を持つ個体がいる。
- 適用範囲: 神奈川県の陸封個体群（O. masou）。定量値なし。
- 出典: Marine Biotechnology 22:812–823 (2020) https://link.springer.com/article/10.1007/s10126-020-09975-2 ／ https://pubmed.ncbi.nlm.nih.gov/32488506 ／ https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html 〔引用元: r02 F-11、二次引用〕
- 証拠: [A] 「the morphological features seen here were similar to amago and yamame. However, both populations were genetically related to amago.」（元 r02 の引用）。「中間的特徴の個体がいる」の部分は県資料側の記述で B 相当。

### F-20
- 主張/値: ヤマメの分布は、太平洋側では神奈川県酒匂川以北の本州、日本海側全域、北海道（ヤマベ）、九州ほか。分布は「伊豆半島以北など」とする資料もある。アマゴとの分布境界域（神奈川・静岡周辺）で外観が重なりうることは F-18・F-19 から読めるが、**交雑域の個体の見え方を記述した資料は取得できていない**。
- 適用範囲: 日本の河川型ヤマメの分布（B）。
- 出典: https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html ／ https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html 〔引用元: r01 F-15、r03 §1-15、二次引用〕
- 証拠: [B] 「河川型の分布は神奈川県酒匂川以北の本州太平洋側、日本海全域、北海道、九州ほか」（元 r01 の記載）。

### F-21
- 主張/値: 北海道立総合研究機構（HRO）のサクラマス解説: 降海型は背が暗青〜暗緑、体側が銀白色、腹が白色。**頭部を除く背部と背鰭・脂鰭・尾鰭に黒点**があり、**頭部背面には黒点が無い**。降海期は体側が銀白色になりパーマークが見えにくくなる。
- 適用範囲: サクラマス（降海型中心）。河川型ヤマメにも通じる可能性は高いが、要確認。
- 出典: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf 〔引用元: r01 F-16、二次引用〕
- 証拠: [B] 元ストリームの要約引用（「頭部背面には黒点が無い」「背鰭・脂鰭・尾鰭に黒点」）。

### F-22
- 主張/値: ヤマメの黒点・鰭先端の記述: **背部から側線にかけて黒点が散在。背鰭・腹鰭・臀鰭・尾鰭の先端が黒い**。
- 適用範囲: ヤマメ（O. m. masou）。どの URL 由来かは帰属未確定。「腹鰭・臀鰭の先端が黒い」は他資料（F-21 は背鰭・脂鰭・尾鰭のみ）と範囲が異なる。
- 出典（候補）: F-02 と同じ 5 URL 〔引用元: r02 F-14、二次引用〕
- 証拠: [C] 元 r02 が F-02 と同一 Finding 内で C としたもの。単独では仕様に使わない。

### F-23
- 主張/値: 図鑑サイト fishai: ヤマメは**腹が白く、背には黒斑が多い**。NIES は陸封個体の「黒いパーマーク」を記述。
- 適用範囲: ヤマメ（河川型）。
- 出典: https://fishai.jp/815 ／ https://www.nies.go.jp/biodiversity/invasive/DB/detail/50830.html 〔引用元: r01 F-15、二次引用〕
- 証拠: [B] 元ストリームの要約引用。「黒斑」の大きさ・個数は無し。

### F-24
- 主張/値: 釣り情報サイトに「**目の周りに数個の黒点があるのはヤマメとアマゴに固有**」との記述。
- 適用範囲: ヤマメ・アマゴ / 釣りサイト（未検証）。
- 出典: https://www.honda.co.jp/fishing/picture-book/yamame/ ／ https://tsurihack.com/881 〔引用元: r01 F-15、二次引用。どちらの文かは不明〕
- 証拠: [C] 元ストリームが「未検証」と明記。鰓蓋・頬の黒点の有無は他の資料で確認できていない。

### F-25
- 主張/値: NIES: 陸封個体は体側にパーマーク、**側線部に「うっすらと紅をはいている」**。
- 適用範囲: ヤマメ（陸封個体）/ 個体の性・季節・サイズは要約に無し。
- 出典: https://www.nies.go.jp/biodiversity/invasive/DB/detail/50830.html 〔引用元: r01 F-15、二次引用〕
- 証拠: [B] 「陸封個体は体側に…黒いパーマークが並び、側線部にはうっすらと紅をはいている」（元ストリームの引用）。

### F-26
- 主張/値: 降海期のサクラマスには **背鰭先端に白色部を持つもの**がある（HRO）。
- 適用範囲: サクラマス（降海期）。河川型への適用は未確認。
- 出典: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf 〔引用元: r01 F-16、二次引用〕
- 証拠: [B] 元ストリームの要約引用。

### F-27
- 主張/値: 群馬県等の資料で、ヤマメとサクラマスは形態的特徴（大きさ、パーマークと「**腹部青斑点**」の有無）で判別可能。栃木県基準にも同語（F-09）。**「腹部青斑点」が具体的に何を指すか（腹側のパーマーク様の青い斑か等）は要約に無い**。
- 適用範囲: ヤマメ vs サクラマス / 群馬県・栃木県。
- 出典: https://www.pref.gunma.jp/page/20806.html ／ https://www.pref.gunma.jp/uploaded/attachment/46107.pdf 〔引用元: r03 F-20、二次引用〕
- 証拠: [B] 元ストリームが「疑義あり（誤訳・誤要約の可能性）」と付記。仕様に使用しない。

### F-28
- 主張/値: 体色の基調: 降海型は**背が暗青〜暗緑、体側が銀白色、腹が白**（HRO）。河川型はパーマークを背景として、背は暗青緑〜褐色（F-03）。
- 適用範囲: サクラマス降海型（HRO）／ヤマメ河川型（F-03）。
- 出典: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf 〔引用元: r01 F-16、r03 F-19〕
- 証拠: [B] 元ストリームの引用。

### F-29
- 主張/値: **降海型（サクラマス）の婚姻色**: 遡上につれ銀白色の金属光沢を失い、**雄は全体が黒ずみ、体側に不定形（雲状）の桜色（桃色）斑**。吻が伸びて下方に屈曲、両顎の歯が肥大。雌も婚姻色を示すが雄ほど顕著でない。
- 適用範囲: PROXY:降海型サクラマス（北海道系の行政・研究機関資料）。元ストリームの要約は主語を「ヤマメ」と記したが同一ヒット群の別要約は「サクラマス」で、降海型の記述と判断（ラベル入れ替わり事例）。
- 出典（候補）: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html 〔引用元: r03 F-01、r01 F-17、二次引用〕
- 証拠: [B] 「males become darker overall with irregular cloudy cherry-pink coloring, snout elongated and curves downward…」（元ストリームの引用）。

### F-30
- 主張/値: **「河川で性成熟したヤマメは体色が黒ずむが、サクラマスのように桜色にはならない」**。
- 適用範囲: ヤマメ（河川型）/ 成熟個体（性別の区別は要約に無し）/ 産卵期（9–10 月）。
- 出典（候補）: 関泰夫・小島将男（1977）「吾妻川起源のヤマメの銀毛化変態と成熟に関する研究」水産増殖 https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja ／ https://www.tokyo-aff.or.jp/site/aquafarming/yamame.html ／ https://www.pref.gunma.jp/page/20806.html 〔引用元: r03 F-02、二次引用。記述元文書は特定不能〕
- 証拠: [B] 元ストリームは複数クエリで再現と記録。F-31・F-32 と不一致（§3-4）。

### F-31
- 主張/値: 繁殖期のヤマメは**体全体が黒っぽくなり、薄い桃色から濃い紅色までの婚姻色が体側から鰭などに不定形に現れる**（サクラマスの明確な桜色とは異なる）。ヤマメの雌はしばしば「2 年目」に成熟し、婚姻色は「ブナ毛」とならずに体色が黒ずむ。
- 適用範囲: ヤマメ（河川型）/ 雌雄（雌の記述を含む）/ 産卵期。「2 年目」が満 1 歳か満 2 歳かは要約に無し。
- 出典（候補・特定不能）: https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ほか 〔引用元: r03 F-03、r01 F-17、二次引用〕
- 証拠: [C] 出典特定不能・百科事典的。「薄い桃色から濃い紅色までの婚姻色が体側からヒレなどに不定形に表れる」（元ストリームの引用）。

### F-32
- 主張/値: 国土交通省の多言語 DB（英語）は成熟したマス（masu salmon）を、**背が暗化し、体側の縞（stripes on the body sides）が緋色〜深紅の濃い赤色になり、腹部で一つの淡色の縦帯に融合する**。ピンクになる、と記す。「stripes」がパーマークか他の縞かは要約に無い。
- 適用範囲: 国交省多言語 DB「サクラマス(ヤマメ)」/ 河川型か降海型か、雌雄かは要約に無し。
- 出典: https://www.mlit.go.jp/tagengo-db/en/R2-00580.html ／ https://www.mlit.go.jp/tagengo-db/R2-00580.html 〔引用元: r03 F-04、二次引用〕
- 証拠: [B] 「stripes on the body sides become bright red with crimson tinge to merge on the abdomen into one common longitudinal band of lighter color」（元ストリームの引用）。**これが「体側の桃/赤色の縦走帯」に最も近い唯一の記述**だが、成熟期限定・対象型不明。

### F-33
- 主張/値: 埼玉県の研究: 放流魚（養殖魚）は天然魚に比べ **色彩が薄く、体型が丸く、鰭が欠けている／くすむ**傾向。1991 年度は 10 月放流魚が体色・体型とも天然魚に近く、12 月放流魚は体色のみ近い。
- 適用範囲: ヤマメ（成魚放流・埼玉県）。
- 出典: https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html 〔引用元: r01 F-20、二次引用〕
- 証拠: [B] 「放流魚（養殖魚）は天然魚に比較して、色彩も薄く、体型も丸いなど」（元ストリームの引用）。

### F-34
- 主張/値: 魚類の体色変化の一般機構: 背景の明るさの変化に応じ、ホルモンと神経が色素胞に作用して色素顆粒が分散・凝集する。急な温度変化は体色変化の速度に影響する。別の魚種では優位個体は明るい基質に馴染み、従属個体は暗色を示した。**ヤマメ／サケ科に特化した資料は見つかっていない**。
- 適用範囲: **PROXY:魚類一般（種不明）**。ヤマメの川底の色による体色変化の根拠にはならない。
- 出典: https://orb.binghamton.edu/research_days_posters_2024/52 〔引用元: r03 F-27、二次引用〕
- 証拠: [C] 「Fish can change body color in response to changes in background brightness through hormones and nervous system signals acting on chromatophores」（元ストリームの引用）。

### F-35
- 主張/値: parr から smolt への変化（暗色 → 銀色）は皮膚へのグアニン結晶の沈着による。masu salmon では **parr → silvery parr、silvery parr → smolt の両方の移行でグアニンとヒポキサンチンが顕著に増加**。ただし大量のグアニンが銀化の見た目と必ずしも相関しない。
- 適用範囲: (a) Oncorhynchus masou（北大の古い紀要と推定）(b) 「グアニン結晶沈着が銀化の原因」は PROXY:サケ科一般。
- 出典（候補・特定不能）: https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf ／ https://pubs.usgs.gov/publication/70180320 〔引用元: r03 F-17、二次引用〕
- 証拠: [B] 元ストリームは (a) を A 候補としたが文書特定不能のため、ここでは B とする。要原典確認。

### F-36
- 主張/値: 北海道日本海側 7 河川のサクラマス集団（1990 年 5–6 月採集、1 歳魚が 93%）で、脊椎骨・下鰓耙・背鰭条・胸鰭条・臀鰭条の 5 形質に **集団（河川）間で有意差**（ANOVA）。腹鰭条と上鰓耙は有意差なし。**体色・パーマークの河川間差を示した資料ではない**。
- 適用範囲: O. masou（北海道日本海側）。計数形質のみ。
- 出典: Mano S., Kanno Y., Kinoshita T., Maeda T., Kyushin K. (1991) https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57 〔引用元: r02 F-08、二次引用〕
- 証拠: [A] 「significant differences in the means were observed in regards to five characters … among seven populations」（元ストリームの引用）。模様・体色の河川間変異の「類推」材料としてのみ使う（根拠としては弱い）。

### F-37
- 主張/値: サクラマスの腹椎数・尾椎数には遺伝成分があり遺伝相関が推定されている（数値は要約に無し）。**パーマーク数の遺伝率を示した資料ではない**。
- 適用範囲: O. m. masou 養殖/試験集団。
- 出典: Ando D., Mano S., Koide N., Nakajima M. (2008) Fisheries Science 74:293–298. https://link.springer.com/article/10.1111/j.1444-2906.2008.01531.x 〔引用元: r02 F-09、二次引用〕
- 証拠: [A] 「suggest that abdominal and caudal vertebrae are governed by genetic components」（元ストリームの引用、タイトル水準）。

### F-38
- 主張/値: 日本動物学会誌に **マスとアマゴの遺伝的関係を塩基配列で検討した論文**（Zoological Science 15(6)）の存在。内容（判別に使える塩基置換・マーカー）は要約から取得できていない。
- 適用範囲: ヤマメ（masu）・アマゴ。
- 出典: https://bioone.org/journals/zoological-science/volume-15/issue-6/zsj.15.971/Genetic-Relationship-between-Masu-and-Amago-Salmon-Examined-through-Sequence/10.2108/zsj.15.971.full 〔引用元: r02 F-10 の出典欄、二次引用〕
- 証拠: [B] タイトルと URL のみが元ストリームの検索結果に現れた。記述内容は未確認のため、DNA 判別の方法・精度に関する結論としては使用不可。

### F-39（調査員の記憶・未検証）
- 主張/値: パーマーク周りの形態（定性）の記憶: (1) 縦長の楕円〜小判型で、側線付近で最も太く背側・腹側に向かって細る。(2) 前方（鰓蓋直後）の 1〜2 個と尾柄部の斑は小さく不明瞭になりやすい。(3) 左右で個数・位置・形が一致しないのが普通で、隣り合う斑の融合や 1 個の斑の分裂（縦に二つに割れる）が見られる。(4) 斑の輪郭は魚体や光で境界のシャープさが変わる。
- 適用範囲: サケ科の写真から得た一般的印象としての記憶。ヤマメに限った確認はしていない。
- 出典: なし（記憶）。
- 証拠: [M] 未検証。**外観ストリームの写真計測で必ず確認**。数値化しない。

### F-40（調査員の記憶・未検証）
- 主張/値: アマゴの朱点の記憶: 側線付近〜やや下に、パーマークの間（前後）に点在する小〜中の橙赤色の点で、周囲に淡い縁取りを持つことがある。ヤマメでは通常欠くが、F-18 のように少数入る個体群があるとされる。
- 適用範囲: PROXY:アマゴ（記憶）。ヤマメの「少数の朱点」の位置・数・色は記憶でも確証なし。
- 出典: なし（記憶）。
- 証拠: [M] 未検証。**位置・個数・大きさは仕様に使わない**。

### F-41（調査員の記憶・未検証）
- 主張/値: 黒点の記憶: 黒点は側線より上に多く、背とパーマークの間に不規則に散らばる。大きさは眼径より小さい点が中心で、鰓蓋・頬にも小さい黒点が出る個体がある。側線より下（腹側）は黒点が少なく、腹は無斑に近い。
- 適用範囲: ヤマメの写真から得た印象の記憶（確証なし）。
- 出典: なし（記憶）。F-21〜F-24 の資料記述（背部に黒点、頭部背面には無し、眼周囲の黒点）と部分的にしか整合を確認していない。
- 証拠: [M] 未検証。数値化しない。

### F-42（調査員の記憶・未検証）
- 主張/値: 鰭色の記憶: 生きた個体の胸鰭・腹鰭・臀鰭は半透明で淡い黄〜橙がかった色調に見えることが多く、背鰭・尾鰭・脂鰭は黒点があり先端が暗い。腹鰭・臀鰭の前縁が白く縁取られる個体がいるかどうかは**確証なし**。
- 適用範囲: ヤマメ（記憶・確証なし）。F-04 の台湾亜種「銀緑色」の鰭とは異なる印象で、種・地域・光で変わる可能性がある。
- 出典: なし（記憶）。
- 証拠: [M] 未検証。**鰭色は写真ストリームでサンプルして決める**。

### F-43（調査員の記憶・未検証）
- 主張/値: 水中での見え方の記憶: 水中では水色の青〜緑被りでパーマークが暗い青灰色に見え、水面からの斜光（スネルの窓）で背が暗く体側がやや明るく見える、側面の銀白色成分が環境色を映す、等。
- 適用範囲: 一般的な魚の水中写真から得た印象の記憶。ヤマメ固有の測定値ではない。
- 出典: なし（記憶）。
- 証拠: [M] 未検証。レンダリング仕様の「見え方」は写真計測と物理（吸収・散乱）で決め、本記述は仕様根拠にしない。

---

## 3. 資料間の矛盾・不一致

1. **パーマーク個数**: 青森実測 8–10 [F-01]／図鑑 7–10 [F-02][F-03]／別の図鑑 6–9 [F-02]／AI 百科 9–10 [F-05]／アマゴ 7–11 [F-06]（PROXY）／台湾亜種 9＋小黒点 11–13 [F-04]（PROXY）。数え方（鰓蓋直後や尾柄の小さな斑を含めるか）、地域、サイズの違いが疑われるが資料に無く、**解消できない**。
2. **パーマークの色**: 「紫黒色・赤紫色」（島根県）、「紫がかった色」[F-03]、「青色」（神奈川県・ja.wikipedia・東京都のアマゴ）[F-06][F-07]、「暗青色」（サクラマス幼魚）[F-13]、「黒い」（NIES）[F-25]。個体・光条件・撮影・保存状態・地域のどれで差が出るかは資料に無い。暗い青〜紫黒の連続範囲として扱うのが整合的（調査員の解釈）。
3. **成魚のパーマークの有無**: 神奈川県「成魚にも同じように見られる」[F-07]／加藤 1991「体が大きくなるとパーマークを失う」[F-08]／栃木県基準「31 cm 以上で見えなければサクラマス」[F-09]／サクラマス降海型は銀化で消失 [F-10]。「成魚」の定義（小型成熟魚 vs 大型魚）の差か、河川・個体差かは未確認。サイズ依存の連続変化とする仮説は調査員の解釈。
4. **河川型の成熟期の体色**（最大の未解決事項）: 「黒ずむが桜色にならない」[F-30]／「黒っぽい体に薄桃〜濃紅が不定形に」[F-31]／「背が暗化し、体側の縞が緋色〜深紅になり腹部で淡色の縦帯に融合・ピンクになる」[F-32]／降海型は雲状の桜色斑 [F-29]。「桜色」の定義、対象型（河川型・降海型）、雌雄の違いが要約から確定できない。
5. **朱点の有無**: 「ヤマメに朱点は無い」[F-15]／「丹沢ヤマメに少数の朱点が入る個体がある」[F-18]。公的資料の「ヤマメは朱点なし」は典型的記述で、地域個体群の例外を許す。矛盾というより適用範囲の差と解するが、遺伝的にはアマゴ寄りの個体群も存在する [F-19]。例外個体の頻度は不明。
6. **背の基調色**: 暗青緑 [F-28][F-05 のオリーブ緑〜褐色] vs 黄褐色 [F-03]。サイズ（幼魚か成魚か）、季節、環境、河川型か降海型かのいずれかの可能性があるが、資料に無い。
7. **鰭先端の黒**: F-21 は「背鰭・脂鰭・尾鰭に黒点」、F-22 は「背鰭・腹鰭・臀鰭・尾鰭の先端が黒い」。腹鰭・臀鰭の扱いが異なる。F-22 は C で帰属不明のため、腹鰭・臀鰭の先端が黒いとは仕様に書けない。
8. **「腹部青斑点」** [F-09][F-27]: 他の資料に同様の記述が無く、何を指すか不明。
9. **台湾亜種の資料間差**: 元 r01 は C、元 r02 は B。FishBase の最大長 57 cm と Wikipedia の「40 cm 超は稀」も食い違う（元 r02 §3）。

---

## 4. 見つからなかったこと（Gaps）— 3D モデル/アニメ/行動実装に必要だが確認できなかった事項

### 4.1 Gap 一覧

| # | 事項 | 重要度 | 状況 |
|---|------|--------|------|
| G1 | **パーマーク個数の分布**（片側、平均±SD、最頻値、河川・サイズ別、左右差、小斑の計数基準） | 最高 | 範囲値のみ（6–10）。分布・計数基準なし |
| G2 | **パーマークの位置・大きさ・形**（体軸方向の位置を %SL で、体高に対する縦の長さ・幅、斑間の間隔、側線との位置関係、第 1 斑の位置、尾柄の斑の有無） | 最高 | 「小判型・楕円形・側線を横切る」の定性記述のみ。数値ゼロ |
| G3 | **輪郭**（境界のシャープさ、ぼかし幅）、**濃淡**、**色（RGB/Lab）**、サイズ・年齢・成熟状態による濃度変化の定量 | 最高 | 色名の不一致（F-07）。測色値なし。→ 写真ストリームでサンプルする |
| G4 | **左右非対称・融合・分裂の頻度** | 高 | 資料なし。M の記憶のみ（F-39） |
| G5 | **パーマークの出現体長・ヤマメ稚魚〜parr〜成魚の連続変化**（個数・濃さ・消退） | 高 | サクラマス幼魚の定性（F-13）、大型個体で消失（F-08）。連続データなし |
| G6 | **朱点を持つヤマメの出現頻度・地域・位置・個数・色・大きさ**。ヤマメに赤/橙の斑点が出る例の婚姻期での出現の有無 | 高 | 丹沢の「少数の朱点」（F-18）の定性記述のみ。婚姻期の朱点は資料なし |
| G7 | **交雑域（神奈川・静岡周辺）の個体の見え方**（アマゴ型・ヤマメ型の中間型の外観） | 中 | 「中間的特徴の個体がいる」（F-19）のみ。具体像なし |
| G8 | **黒点の大きさ（mm または %SL）・数・密度・分布図**（背・体側上部・側線下・鰓蓋・頬・頭部・背鰭・脂鰭・尾鰭） | 最高 | 「背部に散在、頭部背面なし」の定性記述（F-21）。鰓蓋・頬は C 記述のみ（F-24） |
| G9 | **体側の桃/赤の縦走帯**（「側線部のうっすらとした紅」[F-25]、成熟期の縞の赤化 [F-32]）の出現条件（サイズ・性・季節・健康状態）と幅・位置・輝度 | 高 | 非常に限定的。出現条件の資料なし |
| G10 | **背・体側・腹・頭・鰓蓋の部位別の色**（測色値）。体側の銀白成分（虹色素胞）の量、地色の黄色味 | 最高 | 色名レベル。基調色の記述も割れる（§3-6） |
| G11 | **鰭の色**: 胸鰭・腹鰭・臀鰭・脂鰭（縁・基部）・尾鰭（縁）の色と透明度。鰭先端の白・黒の有無 | 高 | 背鰭・脂鰭・尾鰭の黒点（F-21）、降海型の背鰭先端の白（F-26）のみ |
| G12 | **婚姻色・季節差・年齢差**（河川型ヤマメ）: 雄雌別の色の変化量、出現時期、強度の個体差 | 高 | 資料が三分（F-30〜F-32）。季節別（春〜冬）の体色は取得不能 |
| G13 | **環境（川底の色・光・水温・照度）による体色の変化**（ヤマメ／サケ科） | 中 | 一般機構（F-34）のみ。ヤマメ固有なし |
| G14 | **水中照明下の見え方**（水中写真の測色、青被り、偏光、虹色の見え方） | 中 | 資料なし。M の印象のみ（F-43） |
| G15 | **パーマーク数・斑点・体色の遺伝／環境要因**（遺伝率、飼育環境・餌・成長速度の効果） | 中 | 取得不能。関連は椎骨の遺伝成分（F-37）と計数形質の河川間差（F-36）のみ |
| G16 | **河川間・地域間の模様・体色変異の定量**（北海道・東北・日本海側・太平洋側） | 中 | 丹沢の沢ごとの差の定性（F-18）のみ |
| G17 | **DNA 判別の記述**（マーカー、判別精度、交雑個体の外観との対応） | 中 | マス・アマゴの塩基配列研究の存在（F-38）、神奈川個体群の遺伝解析（F-19）のみ。内容未読 |
| G18 | **鱗の色・虹色素胞の層構造・鱗ごとのパターン**（体色の質感に直結）、ヤマメの鱗の隆起線の詳細 | 中 | 取得不能。F-16 の「鱗の特徴」は内容不明 |
| G19 | **鰓蓋周辺の色**（銀・緑・赤味、鰓の透け）、眼の虹彩色、口内色 | 中 | 台湾亜種で「眼と鰓蓋周辺は銀色」（F-04、PROXY）のみ |
| G20 | 本書自体の限界: **新規の検索・原典の閲覧が一切できていない**（WebSearch 上限 200/200、WebFetch 遮断） | — | 本書のすべての Finding が二次引用または M |

### 4.2 次に取るべき行動（仕様確定に必要）
1. **写真ストリームの計測で G1〜G4・G8〜G11 を埋める**（ヤマメ実写の複数方向写真から、パーマーク個数・位置・形・色・黒点分布・鰭色をサンプル）。M の記憶（F-39〜F-43）はこの計測の仮説としてのみ使う。
2. **原典を一次資料で確認する候補**（いずれも先行ストリームの検索結果に出た URL）:
   - 加藤（1991）水産増殖 39(3):279 https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ （パーマーク消失のサイズ、鱗の特徴、赤色斑）
   - 関・小島（1977）「吾妻川起源のヤマメの銀毛化変態と成熟に関する研究」 https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja （成熟個体の体色、銀毛化の外観）
   - 森・名越（1986）三重大学水産学部研究報告 13:135 https://mie-u.repo.nii.ac.jp/record/5636/files/AN0023428X0001305.pdf （体側模様の変異）
   - Fujioka et al.（2025）Ichthyological Research 73:188 https://link.springer.com/article/10.1007/s10228-025-01032-z （マス・アマゴの識別形質の赤色斑・鱗）
   - 神奈川県立生命の星・地球博物館 調査報告 32 号 115–122 https://nh.kanagawa-museum.jp/assets/icp/pdf/nhr32_115-122_kaneko_s.pdf （ヤマメの計測項目。丹沢ヤマメの外観に関連する可能性）
   - Marine Biotechnology 22:812（2020）https://link.springer.com/article/10.1007/s10126-020-09975-2 （相模川・酒匂川の陸封個体群、遺伝と形態）
   - 東京都島しょ農林水産総合センター資料 https://www.ifarc.metro.tokyo.lg.jp/archive/resources/content/3355/20130904-164155.pdf （パーマークの数・形状・朱点の解析。内容未確認）
3. **次回 WebSearch が使える場合の検索クエリ案（日英）**: 「ヤマメ パーマーク 数 河川 比較」「アマゴ 朱点 ヤマメ 交雑 外部形態 酒匂川」「サクラマス 幼魚 パーマーク 出現 体長」「ヤマメ 体色 婚姻色 雄 写真」「masu salmon parr mark number heritability」「Oncorhynchus masou red spots amago yamame hybrid zone」「サケ科 パーマーク 色素胞 形成」など（本ストリームでは実行不能）。

---

## 5. 出典一覧（URL付き。重複排除）

すべて先行ストリーム r01〜r03 の WebSearch 結果に出現した URL で、**本ストリームでは内容を直接閲覧していない**。

**公的機関・自治体・研究機関**
- 青森県産業技術センター 事業報告: https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html
- 神奈川県 ヤマメ解説: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html
- 東京都島しょ農林水産総合センター: https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html ／ https://www.ifarc.metro.tokyo.lg.jp/archive/resources/content/3355/20130904-164155.pdf
- 国立環境研究所（NIES）侵入生物DB: https://www.nies.go.jp/biodiversity/invasive/DB/detail/50830.html
- 島根県 ヤマメ: https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html
- 北海道立総合研究機構（HRO）サクラマス解説: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 北海道庁: https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
- 群馬県: https://www.pref.gunma.jp/page/20806.html ／ https://www.pref.gunma.jp/uploaded/attachment/46107.pdf
- 栃木県: https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf ／ https://www.pref.tochigi.lg.jp/g65/documents/sakuramasu2016ankeitomatome.pdf
- 埼玉県: https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html
- 奥多摩さかな養殖センター: https://www.tokyo-aff.or.jp/site/aquafarming/yamame.html
- 国土交通省 多言語DB: https://www.mlit.go.jp/tagengo-db/en/R2-00580.html ／ https://www.mlit.go.jp/tagengo-db/R2-00580.html
- 水産研究・教育機構 関連: http://salmon.fra.affrc.go.jp/kankobutu/srhsh/data/srhsh245.pdf ／ https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf
- 神奈川県立生命の星・地球博物館: https://nh.kanagawa-museum.jp/assets/icp/pdf/nhr32_115-122_kaneko_s.pdf

**学術論文・書誌**
- 加藤文男（1991）水産増殖 39(3): https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/
- 関・小島（1977）水産増殖: https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja
- 森・名越（1986）三重大学水産学部研究報告: https://cir.nii.ac.jp/crid/1050001202938999296 ／ https://mie-u.repo.nii.ac.jp/records/5636 ／ https://mie-u.repo.nii.ac.jp/record/5636/files/AN0023428X0001305.pdf
- Fujioka et al.（2025）Ichthyological Research: https://link.springer.com/article/10.1007/s10228-025-01032-z
- Marine Biotechnology 22:812–823（2020）: https://link.springer.com/article/10.1007/s10126-020-09975-2 ／ https://pubmed.ncbi.nlm.nih.gov/32488506
- Zoological Science 15(6) マス・アマゴの遺伝的関係: https://bioone.org/journals/zoological-science/volume-15/issue-6/zsj.15.971/Genetic-Relationship-between-Masu-and-Amago-Salmon-Examined-through-Sequence/10.2108/zsj.15.971.full
- Mano et al.（1991）北海道日本海側7河川: https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57
- Ando et al.（2008）Fisheries Science 74:293: https://link.springer.com/article/10.1111/j.1444-2906.2008.01531.x
- Ugachi et al.（2023）Sci. Rep.: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/
- 北大水産学部研究彙報 21(2):123–127（グアニン）: https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf
- サケ科スモルト・皮膚反射（PROXY）: https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf ／ https://pubs.usgs.gov/publication/70180320 ／ https://www.webapps.nwfsc.noaa.gov/assets/26/6745_06272011_103138_Mighell.1978-rev.pdf
- 魚類体色変化の一般（PROXY）: https://orb.binghamton.edu/research_days_posters_2024/52

**図鑑・解説・百科・釣り情報（B/C）**
- https://fishai.jp/815
- https://museum.umic.jp/kawa/zukan/sakana/yamame.html
- https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html
- https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1
- https://www.honda.co.jp/fishing/picture-book/yamame/ ／ https://www.honda.co.jp/fishing/picture-book/sakuramasu/index.html
- https://tsurihack.com/881
- https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ／ https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF
- https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://en.wikipedia.org/wiki/Oncorhynchus_masou_macrostomus
- https://www.fishbase.se/summary/16686
- https://lifeoftaiwan.com/nature/the-formosan-landlocked-salmon-taiwans-unique-natural-wonders-part-1/
- https://grokipedia.com/page/Oncorhynchus_masou （AI 生成、最低信頼）

---

## 6. 検索ログ

**本ストリーム（r04）で実行した操作**

| # | 種別 | クエリ/対象 | 結果 | 有用ヒット数 |
|---|------|-------------|------|-------------|
| 1 | WebSearch (standard) | ヤマメ パーマーク 数 個 アマゴ 朱点 違い | 未実行（セッション予算 200/200 超過） | 0 |
| 2 | WebSearch (standard) | ヤマメ 朱点 出る 個体 アマゴ 交雑 | 未実行（同上） | 0 |
| 3 | WebSearch (standard) | パーマーク 数 遺伝 サケ科 ヤマメ | 未実行（同上） | 0 |
| 4 | WebSearch (standard) | ヤマメ 体側 黒点 分布 背部 鰓蓋 | 未実行（同上） | 0 |
| 5 | WebFetch | https://ja.wikipedia.org/wiki/ヤマメ | EGRESS_BLOCKED（ドメイン遮断）。以後試行せず | 0 |
| 6 | Read/Grep（ローカル） | `docs/yamame/research/r01_morph_jp.md`, `r02_morph_en.md`, `r03_lifestage_sex.md` のパーマーク・朱点・黒点・体色・婚姻色・銀化・交雑・遺伝に関する記述 | 成功。上記 F-01〜F-38 の元データ | 約38件 |

**先行ストリームで本テーマに寄与した検索（各ファイル §検索ログ参照。本ストリームは再実行していない）**
- r01: 「パーマーク サケ科 幼魚 数 位置 個体差」(#67)、「ヤマメ 産卵期 雄 婚姻色 吻」(#82)、「サクラマス 背びれ 脂びれ 尾びれ 黒点（hro.or.jp）」(#95)、「ヤマメ 成長 パーマーク 薄くなる 体型変化」(#106、有用 0)、「三重県美杉 イワメ アマゴ 形態比較」(#14) ほか
- r02: 「Formosan landlocked salmon morphometric meristic parr marks」(#5)、「ヤマメ 上顎後端 眼 後縁 パーマーク 8〜12個」(#50) ほか
- r03: 婚姻色・銀毛・早熟雄・体色変化に関する Q1〜Q34（Q35〜37 は上限到達により未実行）

**本ストリームの総括**: 検索 0 件（予算消尽）、WebFetch 遮断 1 件、有用な新規一次情報 0。二次整理と Gap 明示が成果の全て。
