# 各鰭（胸・腹・背・臀・脂・尾）の形態・機能・動かし方 — ヤマメ（O. masou masou 河川型）向け調査

> 作成: ストリームR10（鰭担当）。目的はヤマメの3Dモデル・遊泳アニメーション仕様のうち「各鰭」の根拠収集。
>
> **この文書を使う前に必ず読むこと（調査の限界。重大）**
> 1. **本ストリームでは文献検索を1回も実行できていない。** セッションの WebSearch 上限（200回、他ストリームと共有）が既に使い切られており、課題指示の出発点クエリのうち4本（Drucker & Lauder 2003／Standen 2008／Standen & Lauder 2005／脂鰭の機能 Reimchen & Temple 2004）を試したが、4件とも「上限到達（200/200）につき未実行」と返った。WebFetch も `EGRESS_BLOCKED` だった（journals.biologists.com）。上限を迂回する手段は取っていない。上限の引き上げ（環境変数 `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`）は利用者側の操作である。
> 2. したがって **新規の文献検索で得た証拠はゼロ**。本書の材料は次の3系統のみ。
>    - **(i) 継承（§2-A）**: 先行ストリーム r01〜r08 の Findings のうち鰭に関するもの。ランクは先行ストリームの付与を継承し、元の検索結果も原典も **私は再確認していない**。
>    - **(ii) 写真由来（§2-B, ランク C(P)）**: リポジトリ内の参照写真 70 枚（`docs/yamame/photo_analysis/catalog_c01〜c07.json` の注釈）の集計と、私自身が写真 p016, p029, p049, p053, p064 を直接開いて観察し、`tools/photo/grid.py` の座標格子で p049, p029 の鰭位置・寸法を読んだ値。n が極小で、ほぼ全て幼魚（parr）・水槽・鰭が展開した瞬間の1枚であり、**成魚・遊泳中の動的な値ではない**。
>    - **(iii) 記憶（§2-C, ランク M）**: 課題指示が挙げた論文の書誌と、方向性のみの記憶。**数値は一つも持っていない**。書誌（誌名・巻・頁・年）も誤りを含みうる。
> 3. **課題1〜6のうち、鰭の運動学（角度・位相・振幅）と流体力に関する実測値は1件も取得できていない。** 仕様書に鰭の動かし方の数値を入れる場合は「設計上の仮置き（根拠なし）」と明記すること。
> 4. 「派生」「算出」と書いた数値は、座標読みから私が換算した値であり、資料に書かれた値ではない。

---

## 1. 要約（仕様に直結する結論。各行末に根拠 Finding を [F番号] で示す）

**形態・計数（ヤマメ河川型の文献値）**
1. 鰭条数（青森県のヤマメ河川型）: 背鰭 12–13、胸鰭 12–14（別報告 13–15）、腹鰭 9（別報告 8–9）、臀鰭 12–14（別報告 11–14）。公的機関の事業報告の機械要約で、要原典確認。 [F-01] 〔A・継承〕
2. 鰭条数は文献間でも集団間でも食い違う。二次資料は背鰭 13–18／12–17、臀鰭 14–18／11–14／12–17、胸鰭 14–17、腹鰭 9–12（Christie 1970 は「大半が10」）。北海道7河川の集団では背・胸・臀鰭条が有意に異なり、腹鰭条は異ならなかった。個体差生成では固定値でなく範囲（腹鰭は狭く、背・胸・臀は広く）とする。 [F-02][F-03] 〔A/C・継承〕
3. 幼魚〜若魚では成魚より鰭が相対的に大きい可能性。Kato (1991) は大型のアマゴ・ヤマメが降海型に似るが「尾柄高・鰭の大きさ・鱗のパターンに幼魚の特徴を残す」と報告。成長に伴う鰭の相対サイズ変化の数値は無い。 [F-06] 〔A・継承〕
4. 飼育・放流由来の鰭の変化: 埼玉県はヤマメ放流魚で鰭の欠け・くすみを記述。ギンザケ飼育魚は背鰭が短い（PROXY）。流れの運動をさせたブラウントラウトでは尾鰭面積は変わらなかった（PROXY）。個体差では「鰭の欠け・擦れ」を養殖/放流由来のオプションとして持てる。 [F-07] 〔A(PROXY)/B・継承〕
5. 雄は背鰭の高さと基底長が大きい傾向（サケ科全般のレビュー）。繁殖期の一回繁殖型サケ属では鰭の伸長が顕著。ヤマメ河川型の雌雄差の数値は無い。 [F-08] 〔A・継承（科レベル）〕

**写真由来（幼魚・水槽・n=2 の直接計測を含む。成魚には外挿しない）**
6. 鰭の起点（対SL, p049 の1枚）: 背鰭 49%、腹鰭 56%、臀鰭 74%。ブラウントラウトの表（背 47.6、腹 55.2、臀 76.4%SL, PROXY）と ±2.5 ポイント以内で一致。 [F-14][F-10] 〔C/A(PROXY)〕
7. 尾鰭は**浅い二叉**: 展開した状態で切れ込み深さ 1.8%SL（p049）／4.1%SL（p029）（尾鰭長の約 11–22%）、鰭の高さ（両葉先端間）は 22–24%SL。FL/SL≈1.12（p049）。葉先は丸みのある尖り。台湾亜種の「成魚は浅い二叉」とも整合。 [F-15][F-09] 〔C/B(PROXY)〕
8. 脂鰭は**小さな肉質の葉**: 基底 6–8%SL、高さ約 3%SL、位置は約 81–92%SL（臀鰭基部の後半の上方〜尾柄前部）。灰〜クリーム〜灰緑〜灰紫の半透明で、鰭条は見えない。縁取りは暗色（2枚）、白（1枚）、無し（数枚）で一貫せず、**橙縁は写真で確認されなかった**。後ろへ寝かせた姿勢（p049, p029）と小さく立つ姿勢（p016）があり、柔軟に動く。 [F-13][F-14] 〔C〕
9. 背鰭は基底 13–15%SL・高さ約 10%SL（p049, p029）。水中の遊泳・定位写真 12 枚中 10 枚で直立、陸上・捕獲後の個体 15 枚では倒れる。仕様の既定姿勢は直立、陸上ポーズでのみ倒す。 [F-14][F-16] 〔C〕
10. 胸鰭: 基部は鰓蓋直後の腹縁寄り（体高の腹側約 1/6 の高さ, p049）。長さは p049 で 13%SL（体側に添えた状態の下限）。色は黄〜橙〜琥珀の半透明が多い（描写のある 53 枚中 40 枚）が、白灰・淡黄緑・オリーブの個体もある。前縁が暗帯になる個体が 7 枚。 [F-12][F-14] 〔C〕
11. 腹鰭・臀鰭: 半透明の青白〜クリーム〜淡黄で、**前縁・外縁が白い**個体が多い（腹鰭 13/48、臀鰭 20/47 の描写枚数）。p049 では腹鰭・臀鰭の下縁と鰭条に沿って橙赤。臀鰭の前縁の鰭条が最も長い（p049 で前縁長 12%SL）。 [F-12][F-14][F-17] 〔C〕
12. 尾鰭の下葉縁・基部に赤〜橙を持つ個体が 57 枚中 17 枚（約 30%）。橙色の網・木漏れ日等の色かぶりを除外できず、B 以上の資料には出てこない。実装では個体差パラメータとして弱く入れ、既定は灰褐〜暗灰の半透明。 [F-12][F-17] 〔C〕
13. 背鰭・脂鰭・尾鰭に黒点がある（HRO・サクラマス）が、写真で背鰭に黒点が明示されたのは 4 枚、尾鰭の斑は「見えない」が大半。鰭の斑は少数・小型・低コントラストに留める。 [F-04][F-12] 〔B/C〕

**運動・機能（根拠は全て記憶＝未検証。数値無し）**
14. 胸鰭が定位・制動・旋回・上昇/下降で使い分けられることは Drucker & Lauder (2003, ニジマス) が扱った、という書誌的リードのみ。角度・位相・左右非対称の具体は未取得。 [F-18] 〔M〕
15. 水中写真 16 枚の鰭姿勢（§F-16）は、定位（胸・腹鰭を基質へ下向きに当てる／体側に添える）、ピッチ上げ（胸・腹・臀鰭を広げる）、低速遊泳（胸鰭は体側、背鰭直立、尾鰭展開）という最低限の「ポーズ辞書」になる。これは静止画の注釈で、運動学ではない。 [F-16] 〔C〕
16. 脂鰭の機能は 3 仮説（流体制御／感覚／痕跡）が文献にある、という記憶のみ。ゲーム内では「受動的に流れと体の動きに従う柔らかい葉」で足りるが、根拠は弱い。 [F-21] 〔M〕

**設計案（証拠ではない。仮置き）**
17. 鰭は「鰭条ボーン（扇状に分岐）＋薄い膜」で作り、尾鰭は 19 本程度の主鰭条（10+9, M）に対応する放射状の放射ボーン 5–7 本＋頂点ウェイトで受動たわみ（開き・カップ）を表現。脂鰭は 2–3 ボーンの受動チェーン。 [F-13][F-22][F-23] 〔設計案〕
18. 鰭姿勢は行動状態の関数（定位=背鰭直立・胸鰭は体側/基質へ・腹臀鰭は軽く開く、加速/高速=全鰭を畳む、ピッチ上げ/制動=胸・腹鰭を広げる）として実装し、角度は未検証の初期値とする。 [F-16][F-18][F-19] 〔設計案〕

---

## 2. Findings

### A. 継承（先行ストリームの検索結果。本ストリームでは再検証していない）

#### F-01
- 主張/値: 青森県のヤマメ（河川型）の外部形態として **背鰭条 12–13 軟条、胸鰭条 12–14 軟条、腹鰭条 9 軟条、臀（尻）鰭条 12–14 軟条**（同報告にパーマーク 8–10 個、側線鱗 118–134）。別の記述として、青森県旭川のヤマメは **背鰭条 12–13、胸鰭条 13–15、腹鰭条 8–9、臀鰭条 11–14**。
- 適用範囲: ヤマメ河川型／青森県の河川／n・体長範囲・調査年は要約に無い。計数に不分枝条を含むかは不明。
- 出典: 青森県産業技術センター（内水面研究所）「サケ、マス保護水面管理事業に伴うサクラマス調査」https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html ／ https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf（旭川の記述がどのURL由来かは要約から特定不能）。〔r01 F-01, F-03 から継承〕
- 証拠: [A・継承] 「外部形態では背鰭条数12-13軟条、胸鰭条数12-14軟条、腹鰭条数9軟条、尻鰭条数12-14軟条…」（r01 が3回の独立クエリで再現したと記録。機械要約のため要原典確認）。

#### F-02
- 主張/値: 北海道日本海側7河川のサクラマス集団（1990年5–6月採集、1歳魚が93%）で、脊椎骨・下鰓耙・**背鰭条・胸鰭条・臀鰭条**の5形質で集団間に有意差（ANOVA）。**腹鰭条と上鰓耙は有意差なし**。平均値・SD は要約に無い。
- 適用範囲: O. masou（1歳魚＝河川残留/スモルト前を含む）／北海道日本海側のみ。
- 出典: Mano S., Kanno Y., Kinoshita T., Maeda T., Kyushin K. (1991) "Ecological characteristics and variations in numerical characters of masu salmon, Oncorhynchus masou populations in rivers of Japan sea coast of Hokkaido". https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57 〔r02 F-08 から継承〕
- 証拠: [A・継承] "significant differences in the means were observed in regards to five characters (vertebrae, lower gill rakers, dorsal fin rays, pectoral fin rays and anal fin rays) among seven populations."

#### F-03
- 主張/値: 二次資料の鰭条数。英語: 背鰭軟条 13–18（別資料 12–17）、臀鰭軟条 14–18（別資料 11–14）、腹鰭 9–11。日本語（サクラマス）: 背鰭 13–18、胸鰭 14–17、腹鰭 10–12、臀鰭 12–17。Christie (1970) のまとめでは O. masou は「太い尾柄」「**腹鰭条が少ない（大半が10）**」。F-01 の青森値（腹鰭 9、臀鰭 12–14）より上側にずれる資料が多い。
- 適用範囲: O. masou（亜種混在、河川型/降海型の区別なし）。出典の帰属は未確定（候補URL列挙）。
- 出典（候補）: https://www.fishbase.se/summary/Oncorhynchus-masou.html ／ https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/ ／ https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html ／ https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf ／ Christie (1970) https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf 〔r02 F-05–F-07 から継承〕
- 証拠: [C・継承] "The dorsal fin has 13-18 soft rays, the anal fin has 14-18 soft rays, though another source indicates a dorsal fin with 12-17 rays, an anal fin with 11-14 rays."（Christie の腹鰭条は r02 が A としたが r06 が C に降格。ここでは C）。差の原因が「主鰭条/総数」の数え方かもしれないという仮説は M（r02 F-28）で未検証。

#### F-04
- 主張/値: 北海道立総合研究機構（HRO）のサクラマス解説: **頭部を除く背部と背鰭・脂鰭・尾鰭に黒点**があり、頭部背面には黒点が無い。降海期には**背鰭先端に白色部を持つもの**がある。
- 適用範囲: サクラマス（降海型中心）。河川型ヤマメへの適用は未確認。
- 出典: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf 〔r01 F-16, r04 F-21/F-26 から継承〕
- 証拠: [B・継承] 「頭部を除く背部と背鰭・脂鰭・尾鰭に黒点」「背鰭先端に白色部を持つものがある」（要約）。

#### F-05
- 主張/値: 「背部から側線にかけて黒点が散在。**背鰭・腹鰭・臀鰭・尾鰭の先端が黒い**」というヤマメの記述（日本語資料）。F-04（背鰭・脂鰭・尾鰭の黒点）と範囲が異なる。
- 適用範囲: ヤマメ。どの URL 由来かは帰属未確定。
- 出典（候補）: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://museum.umic.jp/kawa/zukan/sakana/yamame.html ／ https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html ／ https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF ／ https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1 〔r02 F-14, r04 F-22 から継承〕
- 証拠: [C・継承] 「背鰭・腹鰭・臀鰭・尾鰭の先端が黒い」。単独では仕様に使わない（r04 の判断を継承）。

#### F-06
- 主張/値: Kato (1991) 水産増殖 39(3):279–288: 大型のアマゴ・ヤマメは降海型に似るが、**尾柄高・鰭の大きさ・鱗のパターンに幼魚の特徴を残す**。ヤマメは 2+歳以上で約 300 mm に達する。
- 適用範囲: ヤマメ/アマゴ（河川・ダム湖の大型個体、福井県ほか）。鰭の相対サイズの数値は要約に無い。
- 出典: https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ 〔r01 F-14 から継承〕
- 証拠: [A・継承] 「they retain juvenile characteristics in caudal peduncle height, fin size, and scale patterns compared to anadromous forms」（要約）。

#### F-07
- 主張/値: (a) 埼玉県: ヤマメ放流魚（養殖魚）は天然魚に比べ色彩が薄く体型が丸い、**鰭が欠けている/色がくすむ**傾向。(b) ギンザケ飼育成魚は野生魚に比べ **背鰭が短い**、尾柄が大きい（PROXY: O. kisutch）。(c) 32週の流れ運動をさせたブラウントラウト parr は、GM 解析で体高と**尾鰭面積に変化なし**（PROXY: Salmo trutta）。(d) ノルウェーの河川間でタイセイヨウサケ幼魚を区別する形質は頭長・体高・**鰭の大きさ**（PROXY: Salmo salar）。
- 適用範囲: (a) ヤマメ成魚放流・埼玉県。(b)(c)(d) は全て PROXY。
- 出典: (a) https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html ／ (b) https://link.springer.com/article/10.1023/A:1007646332666 ／ (c) https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/（Fenkes et al. 2018 候補。帰属未確定）／ (d) https://www.researchgate.net/publication/263057933_Morphological_variability_of_Atlantic_salmon_Salmo_salar_and_brown_trout_Salmo_trutta_in_different_river_environments 〔r01 F-20/F-21, r02 F-23/F-24 から継承〕
- 証拠: (a) [B・継承]「放流魚（養殖魚）は天然魚に比較して、色彩も薄く、体型も丸いなど」。(b) [A・継承]「larger caudal peduncles, shorter dorsal fins」。(c) [A・継承]（r02 の要約）。(d) [B・継承]「Head length, body depth and fin size are the characters that best discriminate…」。

#### F-08
- 主張/値: サケ科の性的二型: **背鰭の高さと基底長の雄優位**が Oncorhynchus, Salmo, Coregonus, Prosopium, Thymallus で報告。一回繁殖型の Oncorhynchus では繁殖期に吻の伸長、背部の隆起、**鰭の伸長**、皮膚の肥厚、婚姻色が顕著。
- 適用範囲: サケ科全般（Thymallus のレビューによる比較記述）。O. masou 河川型の雌雄差の数値は無い。
- 出典: "General patterns of sexual dimorphism in graylings (Thymallus), with a comparison to other salmonid species", Rev. Fish Biol. Fisheries (2021). https://link.springer.com/article/10.1007/s11160-021-09694-4 〔r02 F-25 から継承〕
- 証拠: [A・継承（科レベル）] r02 の要約引用「The transformation of the jaws … most characteristic for semelparous Oncorhynchus (upper jaw)…」。鰭に関する文言は r02 の言い換え。

#### F-09
- 主張/値: タイワンマス（O. m. formosanus, 成魚約30 cm）: **尾鰭は成魚で浅い二叉・等尾型**、背鰭と脂鰭は明確に離れる、**鰭は銀緑色**。
- 適用範囲: **PROXY: O. m. formosanus（台湾陸封型）**。日本産亜種より体高が高く、臀鰭条・胸鰭条が少ないとの報告がある。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://www.fishbase.se/summary/16686 〔r02 F-03, r07 から継承〕
- 証拠: [B・継承] "The caudal fin displays a shallow fork and is homocercal in adults"（要約）。

#### F-10
- 主張/値: ブラウントラウト（N=138、平均 SL 160.6 mm）の対SL比: 背鰭前長 **47.6%**、腹鰭前長 **55.2%**、臀鰭前長 **76.4%**、背鰭起点の体高 23.9%、臀鰭起点の体高 17.8%。
- 適用範囲: **PROXY: Salmo trutta**／幼若〜若魚サイズ／個体群不明。
- 出典: https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T3.html 〔r02 F-18 から継承〕
- 証拠: [A・継承] "Preanal length averaged 76.4% of standard length, prepelvic length averaged 55.2%, and predorsal length averaged 47.6%."

#### F-11
- 主張/値: 韓国産 Oncorhynchus 3種（シロザケ・ヤマメ［masu］・ニジマス）の比較で、体高・尾柄高・**背鰭長・臀鰭長（対SL）**に種間差があるが、**ヤマメ個別の数値は要約に無い**。
- 適用範囲: PROXY: 韓国産 O. masou（降海型か陸封型か不明）。
- 出典: Korean Journal of Ichthyology 5(1):96–112 (1993). https://koreascience.kr/article/JAKO199327236818661.page 〔r01 F-13, r02 F-04 から継承〕
- 証拠: [A・継承] 要約（鰭長の種間差。数値無し）。仕様に使える数値は無い。

---

### B. 写真由来の観察（ランク C(P)。私自身の集計・直接観察・座標読み）

**共通の注意**: 写真はウェブ上の個人ブログ・釣果・図鑑サイト等。種判定は先行ストリームの注釈（yamame ラベル 57 枚、信頼度 0.45–0.85）で、アマゴ・交雑の混入を除外できない。照明・網の色・HDR 加工・水膜で色が変わる。鰭は写った瞬間の姿勢で、運動学の情報ではない。

#### F-12
- 主張/値: 鰭の色・縁の集計（`catalog_c01〜c07.json` の `fins.*` 文字列を私が正規表現で数えた。yamame ラベル 57 枚。分母は「その鰭の描写がある枚数」の概算で、先頭が「確認不能/写っていない」等の枚数を除いた値）。
  - **胸鰭**: 描写あり約 53 枚。黄・橙・琥珀・山吹系の語を含む 40 枚。前縁/外縁に暗帯・オリーブ帯 7 枚（p003, p012, p022, p033, p034, p042, p052）。先端・縁が淡い 8 枚。白灰・淡黄緑・オリーブ灰の個体も存在（p006, p021, p054, p060, p062 など）。
  - **腹鰭**: 描写あり約 48 枚。前縁・外縁・先端が白い 13 枚（p007, p016, p021, p024, p028, p032, p033, p034, p039, p042, p062, p063, p064）。
  - **臀鰭**: 描写あり約 47 枚。前縁・外縁・先端が白い 20 枚（p009, p016, p021, p024, p028, p029, p032, p033, p034, p035, p041, p042, p043, p045, p049, p052, p058, p060, p061, p064）。
  - **背鰭**: 描写あり約 46 枚。白い先端・前縁 6 枚（p010, p014, p016, p026, p029, p042）。黒点・暗い細点が明示されたのは 4 枚（p002 基部付近, p032 黒点列, p042 小黒点, p069 黒点）、「斑点なし」が明示されたのは 2 枚（p011, p018）。
  - **尾鰭**: 描写あり約 47 枚。下葉または下縁が橙・赤・赤褐・ピンク橙・琥珀 17 枚（p002, p003, p008, p009, p011, p012, p024, p028, p033, p034, p035, p041, p047, p049, p052, p053, p060）。「浅い二叉/浅く湾入/切れ込みは浅い」13 枚（p003, p008, p009, p010, p023, p028, p030, p035, p040, p049, p060, p064, p069）。「中程度に二叉」1 枚（p002）。
- 適用範囲: 収集写真 57 枚（幼魚 26・parr 18・成魚 15 等を含む）。成魚と幼魚の層別はしていない。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`。個別写真のURLは §5。
- 証拠: [C(P)] 先行 r06 F-19（キーワード集計）は腹鰭の前縁白 14・臀鰭 19・尾鰭下葉縁の赤橙 16 と報告しており、本集計（13・20・17）と ±1 の差。正規表現と判定語の違いによる（例: 本集計は p011 を尾鰭の橙に含めたが、p011 は岩の色映りの可能性が注釈にある）。

#### F-13
- 主張/値: **脂鰭**。描写が得られたのは 57 枚中 15 枚（p012, p016, p017, p018, p021, p023, p026, p029, p032, p033, p040, p042, p049, p050, p064）、可能性止まり 1 枚（p052）、同定不能・不可視が大半。
  - 形: 小さな葉形・楕円・丸い突起。
  - 色: 灰・淡灰・クリーム・灰緑・灰紫・灰青の半透明が 12 枚前後、暗褐 2 枚（p050, p064）。
  - 縁: 暗い縁取り 2 枚（p040, p064 は「黒い縁取り」）、白縁 1 枚（p016）、縁取りなし 2–3 枚（p032, p049, p033〔焦点外〕）。p026 は「橙の縁取りは見えない」。**橙縁を明示した写真は無い**。p029 は根元に黒い線。
  - 姿勢: p049 は後方へ寝かせた葉、p029 も尾柄背縁に寝て根元に黒線、p016 は小さく立つ丸い葉。可動性があると見える。
  - 私の直接観察（p049, p029, p016 を開いて確認）: p049 の脂鰭は薄灰紫〜白っぽい半透明で縁取りは無く、前縁側が体背縁から緩く立ち上がり後縁が丸い「親指状」の葉。鰭条は見えない。
- 適用範囲: 収集写真、幼魚中心。焦点外・遮蔽が多く、成魚の形状はほぼ不明。
- 出典: `catalog_c01〜c07.json`（fins.adipose）、および p016 https://www.hitoumi.jp/zukan/fish/190712092542.php ／ p029 https://www.parks.or.jp/suizokukan/guide/001/001082.html ／ p049 https://www.gao-aqua.jp/animal/29487.html の画像を直接観察。
- 証拠: [C(P)] 注釈例（p064）「暗褐色の小さな葉状、黒い縁取り」、（p032）「灰紫色の小さな楕円形、半透明、縁取りの橙/黒なし」。

#### F-14
- 主張/値: **直接の座標読み**（n=2 個体）。`tools/photo/grid.py` の格子上で元画像の画素座標を読み、SL（吻端〜尾鰭基部）で割った。読み取り誤差の目安は座標 ±5 px、SL の終点（尾鰭基部の定義）±15 px（約 ±1.3%）、ぼけた腹鰭・臀鰭の寸法は ±15% 程度。
  | 項目（%SL） | p049（parr, 水槽, SL≈1152 px） | p029（parr, 水槽, 中央個体, SL≈925 px） | 備考 |
  |---|---|---|---|
  | 背鰭起点（前方からの距離） | 49.1 | — | ブラウントラウト 47.6（PROXY, F-10） |
  | 腹鰭起点 | 55.6 | — | 同 55.2 |
  | 臀鰭起点 | 74.3 | — | 同 76.4 |
  | 背鰭 基底長 | 15.4 | 13.4 | 後方へ倒れ気味 |
  | 背鰭 高さ（鰭の先端〜基底） | 9.6 | 10.4 | カタログ p049「約110px」と一致 |
  | 胸鰭 長さ（基部〜先端） | 13.3 | （体側に畳まれ測定不可） | 体側に添えた状態の下限。基部は体高の腹側約 1/6 の高さ |
  | 腹鰭 前縁長 | 10.1 | — | ぼけ、±15% |
  | 臀鰭 前縁（最長）長 | 11.9 | 11.3 | 前縁の鰭条が最長。±15% |
  | 脂鰭 基底長 | 8.2 | 6.1–6.4 | |
  | 脂鰭 高さ | 2.9 | 3.0 | |
  | 脂鰭 位置（前端〜後端） | 80.8〜88.9 | 85.7〜91.7 | 臀鰭基部の後半の上方〜尾柄前部。2個体で約5ポイントの差（読みの誤差を含む） |
  | 尾鰭 高さ（両葉先端間） | 23.7 | 22.3 | 展開した状態 |
  | 尾鰭 切れ込み深さ | 1.8 | 4.1 | F-15 |
  | FL/SL | 1.12 | — | 切れ込み点までを FL とした |
  読み取った座標（元画像 px）: p049: 吻端(124,537)、尾鰭基部(1275,497)、背鰭起点(689,391)・先端(801,286)・後端付着(865,417)、腹鰭起点(764,652)・先端(873,694)、臀鰭起点(980,615)・前縁先端(1113,647)、胸鰭基部(396,623)・先端(548,645)、脂鰭前端(1054,433)・後端(1148,445)・頂点(1111,403)、尾鰭 上葉先端(1441,361)・下葉先端(1426,633)・切れ込み(1413,494)。p029（右向きの中央個体）: 吻端(1195,495)、尾鰭基部(270,524)、背鰭起点(620,422)・先端(605,329)・後端付着(742,398)、脂鰭 x=346–402・y=452–490、尾鰭 上葉先端(98,446)・下葉先端(152,652)・切れ込み(164,552)、臀鰭起点(384,576)・先端(452,656)。
- 適用範囲: **幼魚（parr）2 個体、水槽内、鰭が展開した瞬間の1枚ずつ**。体長は不明（水槽の parr と推定）。成魚・遊泳中の動的形状には外挿できない。種判定は信頼度 0.60（p049）と 0.75（p029）。
- 出典: p049 https://www.gao-aqua.jp/animal/29487.html ／ p029 https://www.parks.or.jp/suizokukan/guide/001/001082.html の画像（`docs/yamame/photo_analysis` の p049, p029）。
- 証拠: [C(P)] 私の直接の座標読みからの算出（「派生」）。系統的な計測（多数の写真・2名の独立評価）は `tools/photo/morpho_stats.py` が `landmarks_c*_*.json` から出す設計だが、**実データの `landmarks_c*_*.json` はリポジトリ内に存在しない**（スクラッチパッドに合成テストデータ p999 のみ）。それが作成された時点で、`P1_len_over_SL`, `P2_len_over_SL`, `D_height_over_SL`, `A_height_over_SL`, `Ad_height_over_SL`, `caudal_*` を本表の置き換えに使うこと。

#### F-15
- 主張/値: **尾鰭の形**（p049, p029 を直接観察）。展開した状態で、後縁は浅い凹（emarginate〜浅い二叉）。両葉の先端は丸みを帯びた尖り（p049 の上葉先端は丸く、下葉先端はやや尖る）。切れ込み深さは p049 で 21 px（1.8%SL、尾鰭長 約160 px の 13%）、p029 で 38 px（4.1%SL、尾鰭長 約172 px の 22%）。両葉先端間の高さは 22–24%SL。p049 の鰭面積（多角形近似）は SL² の約 0.027、アスペクト比（高さ²/面積）は約 2.0（n=1、展開状態、輪郭は私の座標読み）。鰭条は基部から放射状に約 20 本前後が見え、遠位で分枝して網目状になる（p049）。後縁は薄く透明。
  - **カタログ p049 の「切れ込み深さ約5%SL」と本読みの 1.8%SL は食い違う**。カタログの座標（上葉先端 (1385,358)、下葉先端 (1375,628)）は私の読み（(1441,361)、(1426,633)）より約 55 px 前方にあり、先端を読み違えた可能性が高い。本読みの根拠は §F-14 の座標。
  - 他の写真の傾向: 浅い二叉 13/47 枚、中程度 1 枚（p002）。屈曲・折れ・ぼけで測れない写真が大半。
- 適用範囲: 幼魚 2 個体＋カタログ。成魚の切れ込み（r01: 幼魚の方が深く成魚で浅くなる傾向という M 記述あり）は未確認。
- 出典: 上記写真の直接観察、`catalog_c01〜c07.json`、F-09（台湾亜種の「成魚は浅い二叉」）。
- 証拠: [C(P)] 座標読みからの算出。FL/SL と切れ込みは F-14 の座標による。

#### F-16
- 主張/値: **水中（aquarium 11・in_water_natural 12 のうち yamame ラベルは 18 枚）の鰭姿勢**。`posture_behavior` 注釈から、自然な遊泳・定位とみなせる 16 枚の鰭姿勢を整理（p011 は釣獲後に置かれた個体、p067 は取り込み場面で除外）。
  | 状態 | 写真 | 胸鰭 | 腹・臀鰭 | 背鰭 | 尾鰭・体 |
  |---|---|---|---|---|---|
  | 瀬の礫底で定位 | p006 | 扇状に広げる | — | 直立 | 体は軽く湾曲、尾部が振れる |
  | 流木際の上層で定位 | p023 | 見えない | 腹鰭は下後方へ軽く開く、臀鰭も開く | 直立 | 体は直線 |
  | 礫上で休止（腹を底につける） | p017 | 腹鰭とともに下へ押し付けて体を支える | 同左 | 直立（注釈で明示無し） | 体は直線・水平 |
  | 底近くで低速滞留 | p049 | 体側に添える | 下方へ軽く開く（安定を取る） | 直立（高さ約 110px） | 脂鰭は寝かせる、尾鰭は緩く広がる |
  | 底近くのホバリング様定位 | p036 | 不明 | — | — | 体は水平・直線 |
  | 基質近く・頭を下げる | p026 | 下後方へ伸ばして基質に触れそう | — | 直立 | 尾鰭は大きく開き下葉が基質近く、尾部はカーブ |
  | 岩下の淀みで定位 | p054 | 下に垂れて展開 | 腹鰭は垂れて展開、臀鰭は下後方 | 小さく立つ | 頭をやや上げ尾柄が約 35° 腹側に下垂 |
  | 低速遊泳（水平） | p040 | 体側に畳む | 腹鰭は閉じる | 直立 | 尾鰭は広く展開 |
  | 低速遊泳（水平） | p029 | 畳む | — | 直立 | 尾鰭を広げる |
  | 低速遊泳・停止 | p041 | 半開きで体側に添える | 腹鰭は下へ軽く開く | 畳んだまま | — |
  | 低速遊泳（頭やや上） | p042 | 体側に沿って半開 | 腹鰭・臀鰭は下方へ開く | ほぼ直立 | — |
  | 並走遊泳（水平） | p014 の B 魚 | 体側に沿わせる | — | — | — |
  | 並走遊泳（頭上げ 20–30°） | p014 の A 魚 | 側方へ広げる | 腹鰭を広げる（橙味） | — | ピッチ上向き |
  | 並走上昇（頭上げ 14–18°） | p018 | 軽く広げる | 腹鰭・臀鰭を軽く広げる | 直立 | 尾鰭を広げて推進、体は軽く弓なり |
  | 斜め上向き遊泳（頭上げ 25–55°） | p028 | 体側に沿って下後方へ | 閉じ気味 | — | 尾鰭は下後方 |
  | 水平遊泳（群中） | p016 | 注釈:「大きく側方へ広がる」。私の観察では扇状に開き後方・下へ向く | 腹鰭・臀鰭は下方へ開く | 直立 | 尾柄がわずかに下方へ湾曲、鰭の先端が白い |
  | 水面近くの急旋回/ライズ直後と推測 | p007 | 垂れる | 腹鰭は下へ伸びる | — | 体は強く湾曲、尾鰭は畳まれる |
  集計: 背鰭の姿勢が注釈された水中写真 12 枚中、直立 10 枚（p006, p016, p018, p023, p026, p029, p040, p042, p049, p054）、倒れ/畳み 2 枚（p011＝釣獲後に置かれた個体、p041＝低速滞留）。陸上・手持ち・網内の個体（`air` 39 枚）では背鰭が倒れる記述が 15 枚（p001, p002, p008, p010, p013, p021, p022, p030, p032, p035, p039, p051, p053, p055, p060）、直立が 3 枚（p045, p052, p058）。
  読み取れる傾向（C）: 頭上げ（上昇）のとき胸鰭・腹鰭・臀鰭を広げる例が 2 枚（p014 の A 魚、p018）、p028 は頭上げでも畳み気味で一致しない。定位では背鰭直立が基本で、胸・腹鰭は下向きに展開するか基質へ当てる。
- 適用範囲: 水槽の parr〜juvenile が中心。流速・水温・個体間距離は不明。**1枚の静止画であり、鰭の動き（周期・位相・角度の時間変化）は一切分からない**。
- 出典: `catalog_c01〜c07.json`（posture_behavior）。p016, p029, p049 は私が画像を開いて直接確認。各写真のURLは §5。
- 証拠: [C(P)] 注釈例（p017）「礫の上に腹をつけて休止…胸鰭と腹鰭を下へ押し付けて体を支える」、（p018）「胸鰭・腹鰭・臀鰭を軽く広げ、尾鰭を広げて推進。背鰭は直立」。

#### F-17
- 主張/値: **鰭の局所色**（p049, p016, p053 を直接観察）。
  - p049: 背鰭の前縁寄りの鰭条の遠位に橙赤の斑（座標 約 (780–850, 300–335)）。腹鰭の鰭条と下縁に橙赤、臀鰭の下縁と鰭条に橙赤で前縁は白。尾鰭の下縁に細い赤線。胸鰭は淡い半透明の白紫で橙は乏しい。
  - p016: 背鰭・臀鰭・腹鰭の遠位が白く、尾鰭の両葉先端も白っぽい。脂鰭は白っぽい縁（描写あり）。
  - p053（信頼度 high の屋外写真）: 尾鰭の両葉が橙〜赤橙（下葉が最も濃い）で、胸鰭・腹鰭・臀鰭は橙黄。礫の橙色の映り込みと鰭本来の色を分けられない。
  - これらは個体間・撮影条件間で大きく異なり、「ヤマメの鰭の標準色」として一つに固定できない。
- 適用範囲: 収集写真 3 枚（幼魚）。
- 出典: p049 https://www.gao-aqua.jp/animal/29487.html ／ p016 https://www.hitoumi.jp/zukan/fish/190712092542.php ／ p053 https://note.com/kateri/n/n2b0c356686b3
- 証拠: [C(P)] 私の直接観察（画像を開いて目視）。色値のサンプリング（`tools/photo/colorsample.py`）は未実施。

---

### C. 記憶（ランク M。検索で未確認。数値無し）

> 以下の書誌（著者・年・題名・誌名・巻・頁）は私の記憶で、誤りを含みうる。URL は取得していない（創作していない）。内容の記述は「方向性の記憶」で、確信度は私の主観（高・中・低）。**仕様書へ引用する前に、§4 の検索クエリで原典の要旨を確認すること。**

#### F-18
- 主張/値: **胸鰭の行動レパートリー**。Drucker EG, Lauder GV (2003) "Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces", J. Exp. Biol. 206:813–826（書誌は r08 F-14 の記憶と一致）。ニジマスで、定位・直進・旋回・制動・上昇/下降など行動ごとの胸鰭の使い方と流体力を測った、という内容のはず（確信度: 中）。鰭を行動ごとに異なる向きの力の発生器として使う、左右の鰭を非対称に使うことがある、という方向（確信度: 低〜中）。**角度・位相・振幅・力の数値は記憶に無い。旋回で内側・外側のどちらの鰭が何をするかは確信が無く、書かない。**
  - 関連（r08 F-15 から継承、M・確信度: 中）: Arnold GP, Webb PW, Holford BH (1991) J. Exp. Biol. 156:625–629 — 大西洋サケの parr は流れの中で河床に定位するとき、胸鰭で体を底へ押し付ける負の揚力を作る（PROXY: Salmo salar）。
  - 関連（r08 F-14 から継承、M）: 低速では胸鰭が主、速度が上がると尾鰭が加わり、高速では胸鰭は畳まれるか姿勢制御に回る、という歩容の段階的な推移。転換速度は未取得。
- 適用範囲: ニジマス（O. mykiss）= PROXY。ヤマメでの確認は無い。
- 出典: なし（記憶）。URL 未取得。
- 証拠: [M] 確信度: 書誌は中、内容は方向のみ低〜中。

#### F-19
- 主張/値: **腹鰭の3次元運動学**。Standen EM (2008) "Pelvic fin locomotor function in fishes: three-dimensional kinematics in rainbow trout (Oncorhynchus mykiss)", J. Exp. Biol. 211:2931–2942（確信度: 書誌は中）。腹鰭が重心付近にあり、ピッチ・ロール・上下動の制御に使われうるという議論の文脈のはず。**具体的な結果（どの行動で展開するか、角度、位相）の記憶は無い**（確信度: 内容は低）。
- 適用範囲: ニジマス = PROXY。
- 出典: なし（記憶）。
- 証拠: [M] 確信度: 書誌は中、内容は無いに等しい。F-16（写真: 頭上げ時に腹鰭を広げる例、定位時に軽く開く例）が方向として矛盾しないことだけ記す。

#### F-20
- 主張/値: **背鰭・臀鰭と中央鰭**。(a) Standen EM, Lauder GV (2005) "Dorsal and anal fin function in bluegill sunfish Lepomis macrochirus: three-dimensional kinematics during propulsion and maneuvering", J. Exp. Biol. 208:2753–2763（確信度: 書誌は中）— **PROXY: ブルーギル（棘条を持つスズキ系）**。サケ科ではない。(b) Standen EM, Lauder GV (2007) "Hydrodynamic function of the dorsal and anal fins in brook trout (Salvelinus fontinalis)", J. Exp. Biol. 210:325–339（確信度: 書誌は中〜低）— **PROXY: ブルックトラウト（サケ科イワナ属）**。背鰭・臀鰭が定常遊泳でも能動的に動いて後流（渦）を作り、尾鰭がそれを受けるという方向の記憶（確信度: 低）。振幅・位相の数値は記憶に無い。(c) Webb PW (1977) "Effects of median-fin amputation on fast-start performance of rainbow trout (Salmo gairdneri)", J. Exp. Biol. 68:123–135（確信度: 書誌は中）— 中央鰭（背・臀・尾）の切除が急発進（fast-start）の性能を下げる、という方向（確信度: 中）。
- 適用範囲: (a) ブルーギル、(b) ブルックトラウト、(c) ニジマス。全て PROXY。
- 出典: なし（記憶）。
- 証拠: [M] 確信度: 上記の通り。ヤマメの背鰭・臀鰭の能動/受動の別は未確認（r08 §4-6 も同じ欠落を記録）。

#### F-21
- 主張/値: **脂鰭の機能仮説と形**。(a) Reimchen TE, Temple NF (2004) "Hydrodynamic and phylogenetic aspects of the adipose fin in fishes", Can. J. Zool. 82:910–916（確信度: 書誌は中〜高）— 脂鰭は流れの中で動き、尾鰭へ向かう流れを調整する流体制御の仮説、切除すると尾の振幅が増えるという実験結果の方向（確信度: 低〜中）。(b) Buckland-Nicks JA, Gillis M, Reimchen TE (2012) "Neural network detected in a presumed vestigial trait: ultrastructure of the salmonid adipose fin", Proc. R. Soc. B 279:553–563（確信度: 書誌は中）— サケ科の脂鰭に神経網があり、感覚器の可能性を示す（確信度: 中）。(c) 養殖・放流魚の標識として脂鰭切除が広く行われている（確信度: 高。一般知識）。(d) 脂鰭は鰭条を持たない肉質の鰭（確信度: 高。r06 F-29 と同じ）。(e) ブラウントラウトの脂鰭は橙赤の縁取りを持つことがある、ニジマスは暗色の縁取りが多いという一般知識（確信度: ブラウンは中、ニジマスは低。r05 F-31 が同趣旨を M として記録）。ヤマメの縁色は写真で橙縁が確認されなかった（F-13）。
- 適用範囲: 主にニジマス・サケ科一般。ヤマメ固有の確認は無い。
- 出典: なし（記憶）。
- 証拠: [M] 確信度: 上記の通り。「脂鰭の実サイズ」「縁の橙」について資料で確認できていない。

#### F-22
- 主張/値: **尾鰭の形状制御と鰭条**。(a) Lauder GV (2000) "Function of the caudal fin during locomotion in fishes: kinematics, flow visualization, and evolutionary patterns", Am. Zool. 40:101–122（確信度: 書誌は中）— 尾鰭は受動的に曲がるだけでなく、遊泳速度や行動で形状（開き、カップ形成、後縁の動き）が変わる、という方向（確信度: 中）。(b) Flammang BE, Lauder GV (2009) "Caudal fin shape modulation and control during acceleration, braking and backing maneuvers in bluegill sunfish", J. Exp. Biol. 212:277–286（確信度: 書誌は中〜低）— **PROXY: ブルーギル**。加速・制動で尾鰭の開き（スパン）を能動的に変える方向。(c) Alben S, Madden PG, Lauder GV (2007) "The mechanics of active fin-shape control in ray-finned fishes", J. R. Soc. Interface 4:243–256（r06 F-29 から継承したリード）。(d) サケ科の尾鰭の主鰭条（principal rays）は 10+9=19 本という記憶（確信度: 中。他の多くの真骨魚は 9+8=17）。分枝した副鰭条・前方の不分枝条（procurrent rays）の本数は記憶に無い。
- 適用範囲: (a) 一般（魚類）、(b) ブルーギル = PROXY、(d) サケ科一般。ヤマメの尾鰭の剛性（曲げ剛性の勾配）・鰭条の分節間隔・アスペクト比の文献値は無い。
- 出典: なし（記憶）。
- 証拠: [M] 確信度: 上記の通り。

#### F-23
- 主張/値: **鰭の構造一般**（r06 F-29 から継承）。サケ科の背鰭・臀鰭・胸鰭・腹鰭・尾鰭は、分節し先端が分枝する軟条（鰭条）と、その間の薄い鰭膜からなる。鰭条は左右1対の半条（hemitrichia）からなる。脂鰭は鰭条を持たない。サケ科に鰭棘は無い。鰭膜の厚み（µm）、鰭条の分枝パターン、不分枝条の本数、色素胞の分布は未確認。
- 適用範囲: 条鰭類・サケ科一般。
- 出典: なし（記憶）。
- 証拠: [M] 確信度: 構造の定性は高、数値は無し。鰭条数のみ F-01（A）。

---

## 3. 資料間の矛盾・不一致

| # | 項目 | 資料A | 資料B | 補足 |
|---|------|-------|-------|------|
| 1 | 臀鰭条数 | 11–14／12–14（青森, F-01） | 14–18（英語二次資料）、12–17（日本語二次資料）(F-03) | 地域・亜種・数え方（主鰭条/総数）・集団差のいずれか。F-02 は臀鰭条が集団間で有意に異なると示す。数え方の仮説は M（未検証）。 |
| 2 | 背鰭条数 | 12–13（青森, F-01） | 13–18／12–17（F-03） | 同上 |
| 3 | 胸鰭条数 | 12–14／13–15（青森, F-01） | 14–17（F-03） | 同上。F-02 は胸鰭条の集団差を示す |
| 4 | 腹鰭条数 | 9／8–9（青森, F-01） | 9–11／10–12、Christie「大半が10」(F-03) | 腹鰭条は集団間で有意差なし（F-02）なのに値が資料でずれる。数え方か亜種差か未確認 |
| 5 | 鰭先端の黒 | 背鰭・脂鰭・尾鰭に黒点（HRO, B, F-04） | 背鰭・腹鰭・臀鰭・尾鰭の先端が黒い（C, 帰属不明, F-05） | 写真では腹鰭・臀鰭は前縁/先端が**白い**描写が多く（13/48, 20/47, F-12）、F-05 の「腹鰭・臀鰭の先端が黒い」を支持しない。F-05 は仕様に使わない |
| 6 | 鰭の色 | 台湾亜種（PROXY）の「銀緑色の鰭」(B, F-09) | 写真: 胸鰭は黄橙〜琥珀が多数（40/53）、尾鰭は灰褐〜暗灰の半透明（F-12） | 亜種差か光環境か不明。r06 も同じ矛盾を記録 |
| 7 | 尾鰭下葉縁の赤橙 | 写真 17/57（約30%, F-12） | B 資料（自治体・図鑑）の要約には出てこない | 色かぶり・網の色・アマゴ交雑の可能性を除外できない。r06 と同じ |
| 8 | 尾鰭の切れ込み深さ | カタログ p049「約5%SL」 | 本読み p049 = 1.8%SL、p029 = 4.1%SL (F-15) | カタログの先端座標が前方にずれている疑い。2個体の間でも 1.8–4.1% の差があり、個体差・姿勢・展開度のいずれもありうる |
| 9 | 脂鰭の縁 | 暗縁（p040, p064）／白縁（p016）／縁なし（p032, p049）(F-13) | ブラウントラウトで橙赤縁（M, F-21） | ヤマメで橙縁は確認されず。縁の有無は個体差か照明か不明（r05 も同じ） |
| 10 | 脂鰭の位置 | p049: 80.8–88.9%SL | p029: 85.7–91.7%SL (F-14) | 約5ポイントの差。尾鰭基部の定義（±1.3%）と脂鰭の寝かせ方、個体差を含む |
| 11 | 記憶と写真（腹鰭・臀鰭の白い前縁） | r04 F-42（記憶）は「確証なし」 | 写真は 13/48・20/47 で明示（F-12） | 写真を優先してよいが、イワナ類の白い鰭縁との混同は写真の種判定精度に依存（r06 と同じ） |
| 12 | 集計の差 | r06 F-19: 腹鰭白縁 14、臀鰭 19、尾鰭下葉赤橙 16 | 本集計: 13、20、17 (F-12) | 判定語の違い。±1 は誤差として扱う |
| 13 | 胸鰭の姿勢 | p016 注釈「大きく側方へ広がる」 | 私の目視: 扇状に開き後方・下に向く (F-16) | 正面からの視点が無いため「側方への広がり」は判定できない |

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル/アニメ/行動実装に必要だが確認できなかった事項

**課題1〜6への回答状況**
1. **胸鰭の行動別運動学（Drucker & Lauder 2003）**: 原典の要旨を一度も読めていない。ブレーキ・旋回・定位・上昇/下降ごとの鰭の角度・位相・左右非対称・鰭条の屈曲。**未取得**（書誌のみ F-18）。
2. **腹鰭の3Dキネマティクス（Standen 2008）**: ピッチ・ロール制御の具体。**未取得**（書誌のみ F-19）。
3. **背鰭・臀鰭の運動と後流（Standen & Lauder 2005/2007）**: 振幅・位相・サケ科での能動/受動の別。**未取得**（書誌のみ F-20。2005 年はブルーギルで PROXY）。
4. **脂鰭の機能（Reimchen & Temple 2004 ほか）**: 機能仮説の実験結果の定量、形状、実サイズ（%SL）、縁の橙の有無。写真から 6–8%SL（基底）・約3%SL（高さ）・位置 81–92%SL（n=2, 幼魚）だけ得た（F-14）。文献値は**未取得**。
5. **尾鰭**: 剛性・曲げ剛性の勾配、アスペクト比（写真1枚で約2.0）、遊泳中の形状変化（カップ形成・後縁の遅れ）、鰭条数（記憶で主鰭条 19）。**文献値は未取得**。
6. **各鰭のサイズ/SL・形状・縁の色・斑点**: ヤマメ文献値は**ゼロ**。写真2枚の寸法（F-14）と色の集計（F-12）のみ。成魚の値は無い。

**その他、実装に必要な欠落**
- **鰭の可動範囲**: 各鰭の展開角・畳み角の上限下限、動く速さ（Hz）、左右の位相差。静止画では取れない。
- **鰭と速度/行動の関係**: どの速度（BL/s）で胸鰭を畳むか（歩容転換速度）、ホバリング時の胸鰭の拍動頻度、制動時の胸鰭の展開角、C-start・急旋回時の鰭の使い方、摂餌攻撃時の鰭の姿勢。r08 の同じ欠落を再確認。
- **鰭の相対サイズの成長変化**: 幼魚（parr）→成魚で胸鰭・腹鰭・背鰭・尾鰭の%SL がどう変わるか（Kato 1991 は定性のみ）。
- **鰭の雌雄差・繁殖期変化**: 河川型ヤマメ雄の鰭の伸長・婚姻色の鰭への出方の数値。
- **鰭条数と配置**: 各鰭の主鰭条の本数と鰭条間隔（%SL）、尾鰭の鰭条数（記憶で 19）、鰭条の分枝回数。
- **鰭膜の光学**: 厚み、透過率、色素胞（黄・橙・黒）の分布。F-23 も未確認。
- **鰭の色の標準値**: 胸鰭の橙黄、腹鰭・臀鰭の前縁の白と下縁の橙赤、尾鰭下葉縁の赤橙、背鰭遠位の橙赤斑について、色素の根拠（カロテノイド等）と個体差の頻度。写真の色サンプリング（`colorsample.py`）も未実施。
- **脂鰭の位置・大きさの成魚値**: 写真は parr の水槽 2 枚のみ。
- **鰭の欠け・擦れ・水カビ**: 発生頻度と形（F-07 は定性のみ）。
- **実写動画からの鰭の追跡**: 動画の入手経路が無い。

**再開の手順（優先順）**: 利用者が検索上限を引き上げた後、次を順に実行して F-18〜F-22 の確信度を検索要約の根拠で置き換える。必要に応じて `allowed_domains` に `journals.biologists.com`, `jstage.jst.go.jp`, `pubmed.ncbi.nlm.nih.gov`, `royalsocietypublishing.org`, `cdnsciencepub.com`, `researchgate.net` を指定。
1. `Drucker Lauder 2003 "Function of pectoral fins in rainbow trout" behavioral repertoire hydrodynamic forces`（要旨の行動別記述）
2. `Standen 2008 pelvic fin locomotor function three-dimensional kinematics rainbow trout`
3. `Standen Lauder 2007 hydrodynamic function dorsal anal fins brook trout`／`Standen Lauder 2005 dorsal anal fin bluegill`
4. `Reimchen Temple 2004 adipose fin hydrodynamic phylogenetic`／`Buckland-Nicks Gillis Reimchen 2012 adipose fin neural network`
5. `adipose fin salmonid size relative standard length`／`ヤマメ 脂鰭 色 縁 橙`／`ヤマメ 脂鰭 大きさ`
6. `Lauder 2000 caudal fin function kinematics flow visualization`／`rainbow trout caudal fin flexural stiffness fin ray`／`trout caudal fin aspect ratio`
7. `Webb 1977 median fin amputation fast-start rainbow trout`
8. `trout fin ray number pectoral pelvic anal masu salmon`／`ヤマメ 鰭条数 胸鰭 腹鰭`
9. `pectoral fin braking turning trout`／`trout pectoral fin station holding negative lift`／`gait transition pectoral caudal fin trout speed`
10. `salmonid fin shape ontogeny parr fin size body length`／`ヤマメ 成長 鰭 相対長`
11. 写真側: 実データの `landmarks_c*_*.json` が揃い次第、`python3 tools/photo/morpho_stats.py` で `P1_len_over_SL`, `P2_len_over_SL`, `D_*`, `A_*`, `Ad_*`, `caudal_*` を再集計し、F-14 の表を置き換える（p049, p029 の2枚だけで鰭寸法を決めないこと）。

---

## 5. 出典一覧（URL付き、重複排除）

**文献・公的資料（先行ストリームが検索結果で得た URL。本ストリームでは再確認していない）**
- 青森県産業技術センター（内水面研究所）: https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html（F-01）
- Mano et al. (1991) 北海道日本海側7河川のサクラマス: https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57（F-02）
- Christie (1970) A Review of the Japanese Salmons Oncorhynchus masou and O. rhodurus: https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf（F-03）
- 二次資料（鰭条数の候補、帰属未確定）: https://www.fishbase.se/summary/Oncorhynchus-masou.html ／ https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/ ／ https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html ／ https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf（F-03）
- 北海道立総合研究機構（HRO）: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf（F-04）
- 鰭先端の黒の記述の候補（帰属未確定）: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://museum.umic.jp/kawa/zukan/sakana/yamame.html ／ https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html ／ https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF ／ https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1（F-05）
- Kato (1991) 水産増殖 39(3):279–288: https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/（F-06）
- 埼玉県: https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html（F-07a）
- ギンザケ飼育 vs 野生の幾何学的形態測定: https://link.springer.com/article/10.1023/A:1007646332666（F-07b）
- ブラウントラウトの流れ運動（候補）: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/ ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5551095/（F-07c）
- ノルウェーのサケ・ブラウン幼魚の形態変異: https://www.researchgate.net/publication/263057933_Morphological_variability_of_Atlantic_salmon_Salmo_salar_and_brown_trout_Salmo_trutta_in_different_river_environments（F-07d）
- Thymallus の性的二型レビュー: https://link.springer.com/article/10.1007/s11160-021-09694-4（F-08）
- タイワンマス: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://www.fishbase.se/summary/16686（F-09）
- ブラウントラウトの対SL比: https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T3.html（F-10）
- 韓国の Oncorhynchus 形態研究: https://koreascience.kr/article/JAKO199327236818661.page（F-11）

**写真（F-12〜F-17。`docs/yamame/photo_analysis/catalog_c01〜c07.json` の source_url）**
- p016: https://www.hitoumi.jp/zukan/fish/190712092542.php
- p029: https://www.parks.or.jp/suizokukan/guide/001/001082.html
- p049: https://www.gao-aqua.jp/animal/29487.html
- p053: https://note.com/kateri/n/n2b0c356686b3
- p064: https://gokaseriver.blog.fc2.com/blog-entry-597.html
- その他の引用写真: p002 https://anglers.jp/catches/4687440 ／ p003 https://anglers.jp/catches/5841529 ／ p006 https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol63.html ／ p007 https://www.ana.co.jp/travelandlife/article/001841/ ／ p012 https://remix-com.amebaownd.com/posts/34118208/ ／ p014 https://ameblo.jp/hiyokomushi2/entry-12076486309.html ／ p017 https://plaza.rakuten.co.jp/nekomac/diary/202506270002/ ／ p018 https://www.gao-aqua.jp/blog/18889.html ／ p023 https://ameblo.jp/sagaminotsurisi/entry-12887824774.html ／ p026 https://ameblo.jp/sagaminotsurisi/entry-12846341589.html ／ p028・p040・p041・p042 https://tonysharks.com/Tree_of_life/Eukaryote/Opisthokonta/Yamame/Yamame.html ／ p032 https://www.kumagera.ne.jp/kikuti/dna-kaisetu.html ／ p033・p034・p035 https://ameblo.jp/makotoyamame/entry-12626540773.html ／ p036 https://mizubesin.hatenablog.com/entry/2014/05/21/222020 ／ p054 https://ameblo.jp/oshoro123/entry-12528849856.html
  （他の写真 ID の URL は各カタログ JSON の `source_url` を参照）

**書誌情報のみ（M。URL 未取得、原典未確認。誌名・巻・頁・年も記憶のため誤りを含みうる）**
- Drucker EG, Lauder GV (2003) J. Exp. Biol. 206:813–826 — Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces（F-18）
- Arnold GP, Webb PW, Holford BH (1991) J. Exp. Biol. 156:625–629（F-18）
- Standen EM (2008) J. Exp. Biol. 211:2931–2942 — Pelvic fin locomotor function in fishes: three-dimensional kinematics in rainbow trout（F-19）
- Standen EM, Lauder GV (2005) J. Exp. Biol. 208:2753–2763（F-20, PROXY: ブルーギル）
- Standen EM, Lauder GV (2007) J. Exp. Biol. 210:325–339（F-20, PROXY: ブルックトラウト）
- Webb PW (1977) J. Exp. Biol. 68:123–135（F-20）
- Reimchen TE, Temple NF (2004) Can. J. Zool. 82:910–916（F-21）
- Buckland-Nicks JA, Gillis M, Reimchen TE (2012) Proc. R. Soc. B 279:553–563（F-21）
- Lauder GV (2000) Am. Zool. 40:101–122（F-22）
- Flammang BE, Lauder GV (2009) J. Exp. Biol. 212:277–286（F-22, PROXY: ブルーギル）
- Alben S, Madden PG, Lauder GV (2007) J. R. Soc. Interface 4:243–256（F-22; r06 F-29 から継承したリード）

**ローカルファイル（継承元・集計元）**
- `/home/user/gerupamasini/docs/yamame/research/r01_morph_jp.md`（F-01, F-03, F-13, F-14, F-16, F-20, F-21）
- `/home/user/gerupamasini/docs/yamame/research/r02_morph_en.md`（F-03〜F-08, F-14, F-18, F-23〜F-25, F-28）
- `/home/user/gerupamasini/docs/yamame/research/r04_parr_jp.md`（F-21, F-22, F-26, F-42）
- `/home/user/gerupamasini/docs/yamame/research/r05_parr_pigment_en.md`（F-25, F-26, F-31）
- `/home/user/gerupamasini/docs/yamame/research/r06_skin_scale_optics.md`（F-19, F-20, F-29）
- `/home/user/gerupamasini/docs/yamame/research/r08_swim_steady.md`（F-14, F-15, F-17, §4-6）
- `/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json 〜 catalog_c07.json`
- `/home/user/gerupamasini/tools/photo/grid.py`, `colorsample.py`, `morpho_stats.py`

---

## 6. 検索ログ

| # | ツール | クエリ／URL | 結果 | 有用ヒット数 |
|---|---|---|---|---|
| 1 | WebSearch (extended) | Drucker Lauder 2003 function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces | 未実行: セッションの検索上限（200/200）到達 | 0 |
| 2 | WebSearch (extended) | Standen 2008 pelvic fin locomotor function in fishes: three-dimensional kinematics in rainbow trout | 未実行: 同上 | 0 |
| 3 | WebSearch (standard) | Standen Lauder 2005 dorsal and anal fin function in bluegill sunfish Lepomis macrochirus wake | 未実行: 同上 | 0 |
| 4 | WebSearch (extended) | adipose fin function Reimchen Temple 2004 hydrodynamic variation … / adipose fin salmonid | 未実行: 同上 | 0 |
| 5 | WebFetch | https://journals.biologists.com/jeb/article/206/5/813/9248（Drucker & Lauder 2003 の頁を想定。**URL は私の推測で、実在を確認していない**） | `EGRESS_BLOCKED`（journals.biologists.com 遮断）。以降 WebFetch は試さず | 0 |

- 実行できた検索: **0回**。上限到達を確認した後は、検索の再試行も、他経路による検索の迂回もしていない。
- 検索ではない情報源（ローカルの読み取りと画像観察）:
  - `docs/yamame/research/` の r01〜r08 を `Drucker|Standen|Reimchen|adipose|脂鰭|pectoral|pelvic|胸鰭|腹鰭|背鰭|臀鰭|尾鰭|caudal|dorsal fin|anal fin` で Grep し、鰭に関する Findings を該当箇所を開いて読んだ。Drucker & Lauder 2003 への言及は r08 のみ（書誌のみ・M）で、Standen 2008、Standen & Lauder 2005、Reimchen & Temple 2004 への言及は r01〜r08 のどこにも無かった。
  - `photo_analysis/catalog_c01〜c07.json`（70 枚）の `fins.*`・`posture_behavior` を Python で正規表現集計（F-12, F-13, F-16）。集計した枚数は yamame ラベル 57 枚。
  - 写真 p016, p029, p049, p053, p064 を Read で直接開いて観察。p049（4 領域）・p029（2 領域）・p016（1 領域）を `tools/photo/grid.py` の座標格子付きで拡大し、座標を目視で読んだ（F-14, F-15, F-17）。計算は Python（SL で割る、多角形面積）。
  - 実データの `landmarks_c*_*.json` はリポジトリ・スクラッチパッドのいずれにも無かった（合成テストの p999/c99 のみ）。
- 未実施: 検索全般（上限）、色サンプリング（`colorsample.py`）、他の写真の座標読み、動画の確認。
- 再開の手順: §4 末尾の優先クエリ 1〜11 を、検索上限の引き上げ後に実行する。
