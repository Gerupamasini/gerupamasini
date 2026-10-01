# 各鰭（胸・腹・背・臀・脂・尾）の形態・機能・動かし方 — ヤマメ（O. masou masou 河川型）向け調査（第2版：検索で裏取り済み）

> 作成: ストリームR10（鰭担当）。目的はヤマメの3Dモデル・遊泳アニメーション仕様のうち「各鰭」の根拠収集。
> 第1版は検索なし（上限到達で0回）で書かれた。**第2版（本書）は WebSearch を 26 回実行**（extended 2 回、standard 24 回。割当 26 回ちょうど）し、第1版の記憶（M）の主張のうち Drucker & Lauder 2003、Standen 2008/2010、Drucker & Lauder 2005、Standen & Lauder 2007、Reimchen & Temple 2004 などを要約文レベルで A に格上げした。WebFetch は試していない。

> **この文書を使う前に必ず読むこと**
> 1. 検索結果は「タイトル・URL・モデルが作った要約」のみで、論文全文は読めていない。本書の数値は**要約文に書かれていたものだけ**を採用し、要約が「数値は含まれない」としたものは Gap にした。要約が複数ページを混ぜている場合は、帰属不明と明記した。
> 2. 鰭の運動学・流体力の文献は**ほぼ全てニジマス（O. mykiss）・ブルックトラウト・ブルーギル等＝PROXY**。ヤマメ（O. masou）の鰭運動の実測論文は検索で1件も出なかった。サケ科同士（ニジマス、ブルックトラウト）の形態学的類似に頼る外挿である。
> 3. **鰭の角度・周波数・位相の具体値は、胸鰭基部の回転（30°超）、旋回時のヨー角速度（4–41°/s）、腹鰭後流の流れ角（33.84±2.4°）以外ほぼ取れていない。** 動かし方の数値を仕様に入れる場合は「設計上の仮置き（根拠なし）」と明記すること。
> 4. 写真由来（§2-B, ランク P）は幼魚・水槽・鰭が展開した瞬間の1枚で、n は極小。成魚・遊泳中の動的な値ではない。「派生」「算出」は座標読みからの私の換算値で、資料に書かれた値ではない。
> 5. §2-A の「継承」は先行ストリーム r01〜r08 が検索で得た内容で、本ストリームで再確認していない（F-04 のみ今回の検索で同じ PDF の別の文が出て補強された）。

---

## 1. 要約（仕様に直結する結論。各行末に根拠 Finding を [F番号] で示す）

**形態・計数・個体差**
1. 鰭条数（青森県のヤマメ河川型）: 背鰭 12–13、胸鰭 12–14（別報告 13–15）、腹鰭 9（別報告 8–9）、臀鰭 12–14（別報告 11–14）。二次資料は背 13–18/12–17、胸 14–17、腹 9–12（Christie は大半が10）、臀 11–18 と幅がある。北海道7河川では背・胸・臀鰭条が集団間で有意に異なり、腹鰭条は異ならなかった。個体生成は固定値でなく範囲（腹鰭は狭く、背・胸・臀は広く）にする。 [F-01][F-02][F-03]
2. 尾鰭の主鰭条は O. mykiss で 19 本とされる（PROXY）。第1版の記憶「10+9」と総数は整合するが、内訳は未確認。 [F-22]
3. 鰭の成長変化: 大型のアマゴ・ヤマメは尾柄高・鰭の大きさ・鱗に幼魚の特徴を残す（Kato 1991）。タイセイヨウサケ parr では背・尾・臀鰭が体長に対し直線的、胸・腹・脂鰭は曲線的（PROXY）。数値は無い。 [F-06][F-30]
4. 飼育/放流魚は鰭が欠ける・短い。ヒレの劣化は胸鰭と背鰭に集中し、脂鰭は最後まで残った（タイセイヨウサケ飼育 parr: 7か月で胸鰭 13–20%、背鰭 15–18%、最終的に胸 35–65%、背 32–58%。PROXY）。埼玉県はヤマメ放流魚の鰭の欠け・くすみを記述。個体差オプション「胸鰭・背鰭の欠け・擦れ」の根拠。 [F-07][F-30]
5. **鰭先端の白**: HRO の解説に「天然のヤマメには背びれ・腹びれ・尻びれの先端に白色部を持つものがある」。降海期には背びれ・尾びれの先端が黒くなる。写真でも腹鰭・臀鰭の前縁/先端の白は 13/48・20/47 枚。河川型parrの既定は白縁（腹・臀）、黒先端は降海期の記述。 [F-31][F-04][F-12]

**写真由来（幼魚・水槽・n=2 の直接計測を含む。成魚に外挿しない）**
6. 鰭の起点（対SL, p049）: 背鰭 49%、腹鰭 56%、臀鰭 74%（ブラウントラウト表と±2.5ポイント以内, PROXY）。 [F-14][F-10]
7. 尾鰭は**浅い二叉**: 展開時の切れ込み深さ 1.8%SL（p049）／4.1%SL（p029）（尾鰭長の約 11–22%）、鰭の高さ 22–24%SL、FL/SL≈1.12。写真47枚中13枚が「浅い二叉」。 [F-15][F-12][F-09]
8. 脂鰭は**小さな肉質の葉**: 基底 6–8%SL、高さ約 3%SL、位置 81–92%SL。灰〜クリーム〜灰紫の半透明で鰭条は見えない。縁は暗色2枚・白1枚・無し数枚で一貫せず、**橙縁は写真で未確認**。PROXY では、ニジマスの脂鰭は黒縁（一部に斑）、ブラウントラウトは橙〜赤縁（B）。ヤマメの既定は縁なし〜淡い暗縁。 [F-13][F-14][F-29]
9. 背鰭は基底 13–15%SL・高さ約 10%SL。水中の遊泳・定位写真12枚中10枚で直立、陸上個体では倒れる。尾鰭下葉縁の赤〜橙は 57枚中17枚（約30%）だが色かぶりを除外できない。胸鰭は黄〜橙〜琥珀の半透明が多い（40/53）。 [F-14][F-16][F-12][F-17]

**運動・機能（根拠はニジマス等＝PROXY の要約文。数値は少ない）**
10. 定常遊泳（0.5–1.0 BL/s）: 胸鰭は体側に畳む（adducted）。 [F-24]
11. 定位（ホバリング）: 胸鰭を体の下へ下げ、長軸方向にひねり、前後にスカル運動。推力が出るのは引き戻し半ストロークのみ。 [F-18]
12. 制動・旋回: 胸鰭はホバリングと**逆方向のスパン回転**をし、左右方向と上下方向に振れる。浅い取付角でも鰭基部は30°超回転する。旋回で横向きの力（平均 2.7 mN）が出て、体のヨー回転（4–41 °/s）を駆動する。減速時の力の作用線は重心より下。制動中は鰭を持続的に張り出し、外転筋と内転筋が両方働く。 [F-18][F-24]
13. Kármán 歩行（渦列後流）での定位: 胸鰭を一過的に出し入れして横方向の移動を制御する。伸展の半分超は筋活動なし（受動）。 [F-24]
14. 腹鰭: 低速定常遊泳（0.13–1.36 BL/s）で左右の鰭が対側的に周期振動（能動＋受動）し、体の揺れを減衰し姿勢を安定させる。操縦時は旋回の内側と外側で動きが異なる非対称の「トリム用フォイル」。後流は腹側の流れを 0.02–0.034 m/s 遅くし、臀鰭の迎え角に影響する（流れ角 33.84±2.4°）。 [F-19][F-26]
15. 背鰭: 推力は小さく側方力が主（側:後方 ≈ 6:1, 1.0 L/s）。振幅と側方力は低速（0.5 L/s）で最大、速度が上がると減少し、2.0 L/s では後流に運動量を加えない。背鰭高は速度が上がるほど低くなる傾向。尾鰭は背鰭が作る渦の鎖の中心を通る。 [F-27]
16. 臀鰭（PROXY: ブルックトラウト）: 背鰭・臀鰭は前後方向・背腹方向に湾曲する能動運動をし、横向きのジェットで主にロール安定に働く。臀鰭は背鰭と同じ側へジェットを出し、背鰭のロールモーメントを相殺する。 [F-20]
17. 脂鰭: 機能仮説は「尾鰭へ向かう渦の制御」または「前尾部の乱流センサー」。ニジマス steelhead（SL 5–18 cm）で切除すると尾鰭振幅が平均 +8%（範囲 −3〜+23%）、12 cm の小型魚では差なし。ブラウントラウトの脂鰭には神経網。アニメでは「受動的に流れに従う柔らかい葉」で足りる。 [F-21][F-32]
18. 尾鰭: 柔軟な鰭条が流体荷重に応じて曲がりつつ、鰭全体の向きを保つ（McCutchen 1970）。中央が遅れて「カップ状」に変形する記述は帰属不明の要約文。 [F-22]

**設計案（証拠ではない。仮置き）**
19. 鰭は「鰭条ボーン（扇状）＋薄い膜」。尾鰭は放射ボーン 5–7 本＋ウェイトで受動たわみと中央遅れ（カップ）。脂鰭は 2–3 ボーンの受動チェーン。鰭姿勢は行動状態の関数（定常=胸鰭畳み・背鰭直立・腹鰭は小振幅で交互振動、定位=胸鰭を下へ出し前後スカル、制動=胸鰭を持続的に外へ張る＋全鰭を広げる、旋回=内外で非対称）。角度・周波数・位相は全て仮置き。 [F-18][F-19][F-24][F-27]

---

## 2. Findings

### A. 継承（先行ストリームの検索結果。F-04 以外は本ストリームでは再検証していない）

#### F-01
- 主張/値: 青森県のヤマメ（河川型）の外部形態として **背鰭条 12–13 軟条、胸鰭条 12–14 軟条、腹鰭条 9 軟条、臀（尻）鰭条 12–14 軟条**（同報告にパーマーク 8–10 個、側線鱗 118–134）。別の記述として、青森県旭川のヤマメは **背鰭条 12–13、胸鰭条 13–15、腹鰭条 8–9、臀鰭条 11–14**。
- 適用範囲: ヤマメ河川型／青森県の河川／n・体長範囲・調査年は要約に無い。不分枝条を含むかは不明。
- 出典: 青森県産業技術センター（内水面研究所）「サケ、マス保護水面管理事業に伴うサクラマス調査」https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html ／ https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf（旭川の記述がどのURL由来かは要約から特定不能）。〔r01 F-01, F-03 から継承〕
- 証拠: [A] 「外部形態では背鰭条数12-13軟条、胸鰭条数12-14軟条、腹鰭条数9軟条、尻鰭条数12-14軟条…」（r01 が3回の独立クエリで再現。機械要約のため要原典確認）。

#### F-02
- 主張/値: 北海道日本海側7河川のサクラマス集団（1990年5–6月採集、1歳魚が93%）で、脊椎骨・下鰓耙・**背鰭条・胸鰭条・臀鰭条**の5形質で集団間に有意差（ANOVA）。**腹鰭条と上鰓耙は有意差なし**。平均値・SD は要約に無い。
- 適用範囲: O. masou（1歳魚）／北海道日本海側のみ。
- 出典: Mano S., Kanno Y., Kinoshita T., Maeda T., Kyushin K. (1991) "Ecological characteristics and variations in numerical characters of masu salmon, Oncorhynchus masou populations in rivers of Japan sea coast of Hokkaido". https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57 〔r02 F-08 から継承〕
- 証拠: [A] "significant differences in the means were observed in regards to five characters (vertebrae, lower gill rakers, dorsal fin rays, pectoral fin rays and anal fin rays) among seven populations."

#### F-03
- 主張/値: 二次資料の鰭条数。英語: 背鰭軟条 13–18（別資料 12–17）、臀鰭軟条 14–18（別資料 11–14）、腹鰭 9–11。日本語（サクラマス）: 背鰭 13–18、胸鰭 14–17、腹鰭 10–12、臀鰭 12–17。Christie (1970) は O. masou を「太い尾柄」「**腹鰭条が少ない（大半が10）**」とまとめる。F-01 の青森値より上側にずれる資料が多い。
- 適用範囲: O. masou（亜種混在、河川型/降海型の区別なし）。出典の帰属は未確定（候補URL列挙）。
- 出典（候補）: https://www.fishbase.se/summary/Oncorhynchus-masou.html ／ https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/ ／ https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html ／ https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf ／ Christie (1970) https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf 〔r02 F-05–F-07 から継承〕
- 証拠: [C] "The dorsal fin has 13-18 soft rays, the anal fin has 14-18 soft rays, though another source indicates a dorsal fin with 12-17 rays, an anal fin with 11-14 rays."（Christie の腹鰭条は r02 が A、r06 が C に降格。ここでは C）。数え方（主鰭条/総数）の差という仮説は M（未検証）。

#### F-04
- 主張/値: 北海道立総合研究機構（HRO）のサクラマス解説: **頭部を除く背部と背鰭・脂鰭・尾鰭に黒点**があり、頭部背面には黒点が無い。降海期には背鰭先端に白色部を持つもの（継承時の要約）。**今回の検索（#18）で同じ PDF の別の要約が出た**: 「天然のヤマメには背びれ・腹びれ・尻びれの先端に白色部を持つものがある」「降海時期には体側が銀白色に変わり、パーマークが見えにくくなり、背びれと尾びれの先端が黒くなる」「側線に沿って淡い赤橙色の縦帯」。継承時の「降海期に背鰭先端が白」と今回の「天然ヤマメの背・腹・臀鰭先端が白／降海期に背・尾鰭先端が黒」は**食い違う**（§3-5）。今回の方が詳しく、鰭ごとに分けて書いてある。
- 適用範囲: ヤマメ（河川型）の鰭先端の白、降海期（スモルト）の鰭先端の黒。要約は同一PDFの別箇所の抜粋と見られ、PDF本文は未確認。
- 出典: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf 〔r01 F-16, r04 F-21/F-26 から継承。今回 #18 の検索結果でも同URLが先頭に出た〕
- 証拠: [B] 「天然のヤマメには背びれ、腹びれ、尻びれの先端に白色部を持つものがある」「降海時期には…背びれと尾びれの先端が黒くなる」（要約）。

#### F-05
- 主張/値: 「背部から側線にかけて黒点が散在。**背鰭・腹鰭・臀鰭・尾鰭の先端が黒い**」というヤマメの記述（日本語資料）。F-04（背鰭・脂鰭・尾鰭の黒点）と範囲が異なる。F-04 の今回要約と合わせると、降海期（スモルト）の記述が混ざっている可能性があるが、**未検証の仮説**。
- 適用範囲: ヤマメ。どの URL 由来かは帰属未確定。
- 出典（候補）: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://museum.umic.jp/kawa/zukan/sakana/yamame.html ／ https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html ／ https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF ／ https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1 〔r02 F-14, r04 F-22 から継承〕
- 証拠: [C] 「背鰭・腹鰭・臀鰭・尾鰭の先端が黒い」。単独では仕様に使わない。

#### F-06
- 主張/値: Kato (1991) 水産増殖 39(3):279–288: 大型のアマゴ・ヤマメは降海型に似るが、**尾柄高・鰭の大きさ・鱗のパターンに幼魚の特徴を残す**。ヤマメは 2+歳以上で約 300 mm に達する。
- 適用範囲: ヤマメ/アマゴ（河川・ダム湖の大型個体、福井県ほか）。鰭の相対サイズの数値は要約に無い。
- 出典: https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ 〔r01 F-14 から継承〕
- 証拠: [A] 「they retain juvenile characteristics in caudal peduncle height, fin size, and scale patterns compared to anadromous forms」（要約）。

#### F-07
- 主張/値: (a) 埼玉県: ヤマメ放流魚（養殖魚）は天然魚に比べ色彩が薄く体型が丸い、**鰭が欠けている/色がくすむ**傾向。(b) ギンザケ飼育成魚は野生魚に比べ **背鰭が短い**、尾柄が大きい（PROXY: O. kisutch）。(c) 32週の流れ運動をさせたブラウントラウト parr は、体高と**尾鰭面積に変化なし**（PROXY: Salmo trutta）。(d) ノルウェーの河川間でタイセイヨウサケ幼魚を区別する形質は頭長・体高・**鰭の大きさ**（PROXY: Salmo salar）。
- 適用範囲: (a) ヤマメ成魚放流・埼玉県。(b)(c)(d) は全て PROXY。
- 出典: (a) https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html ／ (b) https://link.springer.com/article/10.1023/A:1007646332666 ／ (c) https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/（帰属未確定）／ (d) https://www.researchgate.net/publication/263057933_Morphological_variability_of_Atlantic_salmon_Salmo_salar_and_brown_trout_Salmo_trutta_in_different_river_environments 〔r01 F-20/F-21, r02 F-23/F-24 から継承〕
- 証拠: (a) [B] 「放流魚（養殖魚）は天然魚に比較して、色彩も薄く、体型も丸いなど」。(b) [A] 「larger caudal peduncles, shorter dorsal fins」。(c) [A]。(d) [B] 「Head length, body depth and fin size are the characters that best discriminate…」。

#### F-08
- 主張/値: サケ科の性的二型: **背鰭の高さと基底長の雄優位**が Oncorhynchus, Salmo, Coregonus, Prosopium, Thymallus で報告。一回繁殖型の Oncorhynchus では繁殖期に吻の伸長、背部の隆起、**鰭の伸長**、皮膚の肥厚、婚姻色が顕著。
- 適用範囲: サケ科全般（Thymallus のレビューによる比較記述）。O. masou 河川型の雌雄差の数値は無い。
- 出典: "General patterns of sexual dimorphism in graylings (Thymallus), with a comparison to other salmonid species", Rev. Fish Biol. Fisheries (2021). https://link.springer.com/article/10.1007/s11160-021-09694-4 〔r02 F-25 から継承〕
- 証拠: [A（科レベル）] r02 の要約引用。鰭に関する文言は r02 の言い換え。

#### F-09
- 主張/値: タイワンマス（O. m. formosanus, 成魚約30 cm）: **尾鰭は成魚で浅い二叉・等尾型**、背鰭と脂鰭は明確に離れる、**鰭は銀緑色**。
- 適用範囲: **PROXY: O. m. formosanus（台湾陸封型）**。日本産亜種より体高が高く、臀鰭条・胸鰭条が少ないとの報告がある。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://www.fishbase.se/summary/16686 〔r02 F-03, r07 から継承〕
- 証拠: [B] "The caudal fin displays a shallow fork and is homocercal in adults"（要約）。

#### F-10
- 主張/値: ブラウントラウト（N=138、平均 SL 160.6 mm）の対SL比: 背鰭前長 **47.6%**、腹鰭前長 **55.2%**、臀鰭前長 **76.4%**、背鰭起点の体高 23.9%、臀鰭起点の体高 17.8%。
- 適用範囲: **PROXY: Salmo trutta**／幼若〜若魚サイズ／個体群不明。
- 出典: https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T3.html 〔r02 F-18 から継承〕
- 証拠: [A] "Preanal length averaged 76.4% of standard length, prepelvic length averaged 55.2%, and predorsal length averaged 47.6%."

#### F-11
- 主張/値: 韓国産 Oncorhynchus 3種（シロザケ・ヤマメ［masu］・ニジマス）の比較で、体高・尾柄高・**背鰭長・臀鰭長（対SL）**に種間差があるが、**ヤマメ個別の数値は要約に無い**。
- 適用範囲: PROXY: 韓国産 O. masou（降海型か陸封型か不明）。
- 出典: Korean Journal of Ichthyology 5(1):96–112 (1993). https://koreascience.kr/article/JAKO199327236818661.page 〔r01 F-13, r02 F-04 から継承〕
- 証拠: [A] 要約（鰭長の種間差。数値無し）。仕様に使える数値は無い。

---

### B. 写真由来の観察（ランク P。私自身の集計・直接観察・座標読み。第1版から維持）

**共通の注意**: 写真はウェブ上の個人ブログ・釣果・図鑑サイト等。種判定は先行ストリームの注釈（yamame ラベル 57 枚、信頼度 0.45–0.85）で、アマゴ・交雑の混入を除外できない。照明・網の色・HDR 加工・水膜で色が変わる。鰭は写った瞬間の姿勢で、運動学の情報ではない。

#### F-12
- 主張/値: 鰭の色・縁の集計（`catalog_c01〜c07.json` の `fins.*` 文字列を正規表現で数えた。yamame ラベル 57 枚。分母は「その鰭の描写がある枚数」の概算）。
  - **胸鰭**: 描写あり約 53 枚。黄・橙・琥珀・山吹系の語を含む 40 枚。前縁/外縁に暗帯・オリーブ帯 7 枚（p003, p012, p022, p033, p034, p042, p052）。先端・縁が淡い 8 枚。白灰・淡黄緑・オリーブ灰の個体も存在（p006, p021, p054, p060, p062 など）。
  - **腹鰭**: 描写あり約 48 枚。前縁・外縁・先端が白い 13 枚（p007, p016, p021, p024, p028, p032, p033, p034, p039, p042, p062, p063, p064）。
  - **臀鰭**: 描写あり約 47 枚。前縁・外縁・先端が白い 20 枚（p009, p016, p021, p024, p028, p029, p032, p033, p034, p035, p041, p042, p043, p045, p049, p052, p058, p060, p061, p064）。
  - **背鰭**: 描写あり約 46 枚。白い先端・前縁 6 枚（p010, p014, p016, p026, p029, p042）。黒点・暗い細点が明示されたのは 4 枚（p002 基部付近, p032 黒点列, p042 小黒点, p069 黒点）、「斑点なし」が明示されたのは 2 枚（p011, p018）。
  - **尾鰭**: 描写あり約 47 枚。下葉または下縁が橙・赤・赤褐・ピンク橙・琥珀 17 枚（p002, p003, p008, p009, p011, p012, p024, p028, p033, p034, p035, p041, p047, p049, p052, p053, p060）。「浅い二叉/浅く湾入/切れ込みは浅い」13 枚（p003, p008, p009, p010, p023, p028, p030, p035, p040, p049, p060, p064, p069）。「中程度に二叉」1 枚（p002）。
- 適用範囲: 収集写真 57 枚（幼魚 26・parr 18・成魚 15 等を含む）。成魚と幼魚の層別はしていない。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`。個別写真のURLは §5。
- 証拠: [P] 先行 r06 F-19（キーワード集計）は腹鰭の前縁白 14・臀鰭 19・尾鰭下葉縁の赤橙 16 と報告しており、本集計（13・20・17）と ±1 の差。**腹鰭・臀鰭の前縁/先端の白は、今回の検索で HRO の解説（F-31）が「背・腹・尻びれの先端に白色部を持つものがある」と記しており、B 資料と方向が一致**。

#### F-13
- 主張/値: **脂鰭**。描写が得られたのは 57 枚中 15 枚（p012, p016, p017, p018, p021, p023, p026, p029, p032, p033, p040, p042, p049, p050, p064）、可能性止まり 1 枚（p052）、同定不能・不可視が大半。
  - 形: 小さな葉形・楕円・丸い突起。
  - 色: 灰・淡灰・クリーム・灰緑・灰紫・灰青の半透明が 12 枚前後、暗褐 2 枚（p050, p064）。
  - 縁: 暗い縁取り 2 枚（p040, p064 は「黒い縁取り」）、白縁 1 枚（p016）、縁取りなし 2–3 枚（p032, p049, p033〔焦点外〕）。p026 は「橙の縁取りは見えない」。**橙縁を明示した写真は無い**。p029 は根元に黒い線。
  - 姿勢: p049 は後方へ寝かせた葉、p029 も尾柄背縁に寝て根元に黒線、p016 は小さく立つ丸い葉。可動性があると見える。
  - 私の直接観察（p049, p029, p016 を開いて確認）: p049 の脂鰭は薄灰紫〜白っぽい半透明で縁取りは無く、前縁側が体背縁から緩く立ち上がり後縁が丸い「親指状」の葉。鰭条は見えない。
- 適用範囲: 収集写真、幼魚中心。焦点外・遮蔽が多く、成魚の形状はほぼ不明。
- 出典: `catalog_c01〜c07.json`（fins.adipose）、および p016 https://www.hitoumi.jp/zukan/fish/190712092542.php ／ p029 https://www.parks.or.jp/suizokukan/guide/001/001082.html ／ p049 https://www.gao-aqua.jp/animal/29487.html の画像を直接観察。
- 証拠: [P] 注釈例（p064）「暗褐色の小さな葉状、黒い縁取り」、（p032）「灰紫色の小さな楕円形、半透明、縁取りの橙/黒なし」。

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
- 証拠: [P] 私の直接の座標読みからの算出（「派生」）。系統的な計測は `tools/photo/morpho_stats.py` が `landmarks_c*_*.json` から出す設計だが、**実データの `landmarks_c*_*.json` はリポジトリ内に存在しない**。作成後に `P1_len_over_SL`, `P2_len_over_SL`, `D_height_over_SL`, `A_height_over_SL`, `Ad_height_over_SL`, `caudal_*` で本表を置き換えること。

#### F-15
- 主張/値: **尾鰭の形**（p049, p029 を直接観察）。展開した状態で、後縁は浅い凹（emarginate〜浅い二叉）。両葉の先端は丸みを帯びた尖り（p049 の上葉先端は丸く、下葉先端はやや尖る）。切れ込み深さは p049 で 21 px（1.8%SL、尾鰭長 約160 px の 13%）、p029 で 38 px（4.1%SL、尾鰭長 約172 px の 22%）。両葉先端間の高さは 22–24%SL。p049 の鰭面積（多角形近似）は SL² の約 0.027、アスペクト比（高さ²/面積）は約 2.0（n=1、展開状態、輪郭は私の座標読み）。鰭条は基部から放射状に約 20 本前後が見え、遠位で分枝して網目状になる（p049）。後縁は薄く透明。
  - **カタログ p049 の「切れ込み深さ約5%SL」と本読みの 1.8%SL は食い違う**。カタログの座標（上葉先端 (1385,358)、下葉先端 (1375,628)）は私の読み（(1441,361)、(1426,633)）より約 55 px 前方にあり、先端を読み違えた可能性が高い。
  - 他の写真の傾向: 浅い二叉 13/47 枚、中程度 1 枚（p002）。屈曲・折れ・ぼけで測れない写真が大半。
  - 「鰭条約20本」は F-22 の「主鰭条19本（O. mykiss, PROXY, B）」と矛盾しない（目視の概数）。
- 適用範囲: 幼魚 2 個体＋カタログ。成魚の切れ込み（r01: 幼魚の方が深く成魚で浅くなる傾向という M 記述あり）は未確認。
- 出典: 上記写真の直接観察、`catalog_c01〜c07.json`、F-09（台湾亜種の「成魚は浅い二叉」）。
- 証拠: [P] 座標読みからの算出。FL/SL と切れ込みは F-14 の座標による。

#### F-16
- 主張/値: **水中（aquarium・in_water_natural のうち yamame ラベルは 18 枚）の鰭姿勢**。`posture_behavior` 注釈から、自然な遊泳・定位とみなせる 16 枚の鰭姿勢を整理（p011 は釣獲後に置かれた個体、p067 は取り込み場面で除外）。
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

  集計: 背鰭の姿勢が注釈された水中写真 12 枚中、直立 10 枚（p006, p016, p018, p023, p026, p029, p040, p042, p049, p054）、倒れ/畳み 2 枚（p011＝釣獲後に置かれた個体、p041＝低速滞留）。陸上・手持ち・網内の個体（`air` 39 枚）では背鰭が倒れる記述が 15 枚、直立が 3 枚（p045, p052, p058）。
  読み取れる傾向（P）: 頭上げ（上昇）のとき胸鰭・腹鰭・臀鰭を広げる例が 2 枚（p014 の A 魚、p018）、p028 は頭上げでも畳み気味で一致しない。定位では背鰭直立が基本で、胸・腹鰭は下向きに展開するか基質へ当てる。**低速遊泳で胸鰭を体側に畳む写真（p040, p029）は、ニジマスで「0.5–1.0 BL/s では胸鰭は体側に畳まれる」とする要約（F-24）と同じ方向。ただし p016 では水平遊泳中に胸鰭が広がっており、群中の parr が定常遊泳でも胸鰭を使う可能性（または静止画の一瞬）は排除できない。**
- 適用範囲: 水槽の parr〜juvenile が中心。流速・水温・個体間距離は不明。**1枚の静止画であり、鰭の動き（周期・位相・角度の時間変化）は一切分からない**。
- 出典: `catalog_c01〜c07.json`（posture_behavior）。p016, p029, p049 は画像を直接確認。各写真のURLは §5。
- 証拠: [P] 注釈例（p017）「礫の上に腹をつけて休止…胸鰭と腹鰭を下へ押し付けて体を支える」、（p018）「胸鰭・腹鰭・臀鰭を軽く広げ、尾鰭を広げて推進。背鰭は直立」。

#### F-17
- 主張/値: **鰭の局所色**（p049, p016, p053 を直接観察）。
  - p049: 背鰭の前縁寄りの鰭条の遠位に橙赤の斑（座標 約 (780–850, 300–335)）。腹鰭の鰭条と下縁に橙赤、臀鰭の下縁と鰭条に橙赤で前縁は白。尾鰭の下縁に細い赤線。胸鰭は淡い半透明の白紫で橙は乏しい。
  - p016: 背鰭・臀鰭・腹鰭の遠位が白く、尾鰭の両葉先端も白っぽい。脂鰭は白っぽい縁（描写あり）。
  - p053（信頼度 high の屋外写真）: 尾鰭の両葉が橙〜赤橙（下葉が最も濃い）で、胸鰭・腹鰭・臀鰭は橙黄。礫の橙色の映り込みと鰭本来の色を分けられない。
  - これらは個体間・撮影条件間で大きく異なり、「ヤマメの鰭の標準色」として一つに固定できない。
- 適用範囲: 収集写真 3 枚（幼魚）。
- 出典: p049 https://www.gao-aqua.jp/animal/29487.html ／ p016 https://www.hitoumi.jp/zukan/fish/190712092542.php ／ p053 https://note.com/kateri/n/n2b0c356686b3
- 証拠: [P] 私の直接観察（画像を開いて目視）。色値のサンプリング（`tools/photo/colorsample.py`）は未実施。

---

### C. 今回の検索で得た運動学・機能の文献（A=査読論文の要約文に明示。ヤマメ以外は PROXY）

> 各 Finding の「証拠」欄の引用は検索結果の要約文から抜いたもの（英語は原文の言い換えの可能性あり）。論文全文は読んでいない。

#### F-18
- 主張/値: **胸鰭の行動レパートリー（ニジマス）**。
  - 浅い取付角にもかかわらず、**鰭基部は操縦中に30°超回転**できる。
  - **ホバリング**: 胸鰭は体の下へ下げられ（depressed beneath the body）、長軸方向にひねられ（twisted along their long axes）、**前後方向のスカル運動**（anteroposterior sculling）をする。
  - **旋回・制動**: 鰭は**ホバリングとは逆向きのスパン方向の回転**をし、**左右方向（mediolateral）と上下方向（dorsoventral）の振れ**を示す。
  - 後流の速度場と運動量流から、**操縦中に正の推力は出ない。例外はホバリングの引き戻し半ストローク（retraction half-stroke）**。
  - **旋回**では横向きの流体力（平均 **2.7 mN**）が生じ、その反作用が体の**ヨー回転（4–41 °/s）**を駆動する。
  - **減速（制動）**では後流の力の作用線が体の重心より**下**に来る。腹側に位置する対鰭による魚類の制動の古典的な力学モデルを支持する。
- 適用範囲: ニジマス（O. mykiss）= PROXY。魚の体長・水温・流速は要約に無い（力 mN の絶対値の解釈には体サイズが必要）。ヤマメでの確認は無い。
- 出典: Drucker EG, Lauder GV (2003) "Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces", J. Exp. Biol. 206(5):813–826, DOI 10.1242/jeb.00139。https://pubmed.ncbi.nlm.nih.gov/12547936 ／ https://journals.biologists.com/jeb/article/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout ／ https://www.semanticscholar.org/paper/Function-of-pectoral-fins-in-rainbow-trout:-and-Drucker-Lauder/fb50c2bcae8575cf4e50189d22140746cdbc2372
- 証拠: [A] "When hovering, the pectoral fins are depressed beneath the body and twisted along their long axes to allow anteroposterior sculling, while during turning and braking, the fins undergo spanwise rotation in the opposite direction"（要約）。検索 #1, #2, #16 で同じ内容が再現した。

#### F-19
- 主張/値: **腹鰭の3次元運動学（ニジマス）**。
  - 方法: ニジマスを可変流速水槽で **0.13–1.36 BL/s**（低速の定常遊泳）および操縦中に撮影。2台の高速カメラで腹側と側面を同時に撮影して3D解析。
  - 背景: 以前の切除実験は腹鰭の機能は小さく主に受動的な安定化と結論していたが、本研究は3つの新仮説を立てた。
  - **定常遊泳**: 腹鰭は規則的な**対側（contralateral）の周期**で振動する。この周期振動には**能動成分と受動成分**があり、**体の振動を減衰し体の位置を安定させる**のに働く可能性がある。
  - **操縦中**: 腹鰭の動きは変動的だが、**トリム用のフォイル（trimming foils）**として働くように見える。**旋回の内側の鰭と外側の鰭で動きが異なり、非対称**になる。
- 適用範囲: ニジマス = PROXY。魚の体長、振動の周波数・振幅・角度は要約に無い（原著は図表にあるはずだが未取得）。「contralateral」は左右の鰭が互いに反対側へ振れる意と私は解釈したが、位相差の数値は不明。
- 出典: Standen EM (2008) "Pelvic fin locomotor function in fishes: three-dimensional kinematics in rainbow trout (Oncorhynchus mykiss)", J. Exp. Biol. 211(18):2931–2942, DOI 10.1242/jeb.018572。https://pubmed.ncbi.nlm.nih.gov/18775930/ ／ https://journals.biologists.com/jeb/article/211/18/2931/17665/Pelvic-fin-locomotor-function-in-fishes-three ／ PDF https://cob.silverchair.com/jeb/article-pdf/211/18/2931/1558121/2931.pdf
- 証拠: [A] "During steady swimming, pelvic fins oscillate in a regular contralateral cycle…" "During manoeuvres, pelvic fins move variably but appear to act as trimming foils, with fins on the inside of the turn moving differently from those on the outside"（要約）。

#### F-20
- 主張/値: **背鰭・臀鰭の水力学（ブルックトラウト）**。背鰭と臀鰭は**能動的に動き**、**前後方向と背腹方向の両方に湾曲**する。ブルックトラウトでは**2つの回転中心を持つ細長い渦**が形成されるように見える。両鰭は**大きな横向き成分を持つジェットを作る渦**を出し、効果は推進ではなく**ロール安定**。背鰭はロール軸の上、臀鰭は下にあるため、臀鰭は背鰭と**同じ側へ横ジェット**を出し、両者のトルクは釣り合う。渦は下流へ流れ、尾鰭が左右に振れるときにそれと出会う。
- 適用範囲: **PROXY: ブルックトラウト（Salvelinus fontinalis、サケ科イワナ属）**。速度（L/s）、鰭の振幅・位相は要約に無い（検索 #7, #25 の要約は「0.5/1.0 L/s や位相は抽出できなかった」としている）。
- 出典: Standen EM, Lauder GV (2007) "Hydrodynamic function of dorsal and anal fins in brook trout (Salvelinus fontinalis)", J. Exp. Biol. 210(2):325–339。https://journals.biologists.com/jeb/article/210/2/325/17120/Hydrodynamic-function-of-dorsal-and-anal-fins-in ／ PDF（タイトルのみ確認）https://sites.harvard.edu/glauder/files/2022/03/Standen.Lauder.2007.pdf
- 証拠: [A] "produce substantial vortices that result in jets with a large lateral component, indicating that their effect is more on roll stability of the fish, rather than propulsion"（要約）。

#### F-21
- 主張/値: **脂鰭の機能仮説と切除実験**。
  - 脂鰭は「保存性が高く謎の多い、小さな**鰭条を持たない**鰭」で、中生代からサケ科などの基底的な真骨魚に残る。
  - 実験: **steelhead（O. mykiss）幼魚、SL 5–18 cm**。可変流速チャンバー（**10–39 cm/s**）で脂鰭除去の影響を調べ、尾鰭の運動の**振幅と周波数**を計測。
  - 結果: スモルト（大型個体）では脂鰭除去で**尾鰭振幅が平均 8% 増加（範囲 −3〜+23%）**。**小型個体（12 cm）では差なし**。
  - 結論（仮説）: 脂鰭は**尾鰭を包む渦を制御する**か、**尾の前方の受動的な乱流センサー**として働く。普及している標識目的の脂鰭切除は生物学的コストを持つ可能性がある。
  - 神経網: ブラウントラウトの脂鰭は**疎性結合組織**（細胞・コラーゲン線維・コラーゲンケーブルに伴う神経）からなり、電子顕微鏡で**神経網**（脳に似た星形細胞と連絡）が見つかった。感覚機能仮説を支持する（機能は未確定）。
- 適用範囲: Reimchen & Temple はニジマス（steelhead）= PROXY。Buckland-Nicks らはブラウントラウト = PROXY。ヤマメの脂鰭の実験は無い。
- 出典: Reimchen TE, Temple NF (2004) "Hydrodynamic and phylogenetic aspects of the adipose fin in fishes", Can. J. Zool. 82(6):910–916。要約の出典 URL は特定不能（候補）https://web.uvic.ca/~reimlab/adipose.pdf ／ https://uwe-repository.worktribe.com/output/1494854。Buckland-Nicks JA, Gillis M, Reimchen TE (2012) "Neural network detected in a presumed vestigial trait: ultrastructure of the salmonid adipose fin", Proc. R. Soc. B 279:553–563。解説記事（B）https://fishbio.com/study-adipose-fin/ ／ https://uvic.ca/news/topics/2011+is-fin-clipping-affecting-salmon-survival+media-tip ／ https://thefisheriesblog.com/2013/05/28/the-adipose-fin-old-mysteries-with-new-answers/
- 証拠: Reimchen & Temple [A] "Adipose fin removal on smolts produces an average 8% (range -3% to 23%) increase in caudal fin amplitude relative to unclipped fish across all velocities."（要約）。Buckland-Nicks [B]（解説記事の要約。論文の巻頁は私の記憶と一致するが、今回は論文本体の要約を見ていない）。

#### F-22
- 主張/値: **尾鰭の形状制御・柔軟性・鰭条数**。
  - Lauder (2000): 尾鰭の機能を、3次元キネマティクスと DPIV で、ヘテロセルカル型（サメ、チョウザメ）とホモセルカル型（**ブルーギル**）で比較。**ホモセルカル尾は傾いて連結した渦輪を作り、中心のジェットが後下方へ向き、体に前上方への反力を与える**。
  - McCutchen (1970) "The trout tail fin: a self-cambering hydrofoil", J. Biomech. 3(3):271（書誌のみ確認）。検索 #23 の要約: **ニジマス/トラウトの尾鰭は柔軟で、骨性の鰭条が流体荷重に合わせて曲がりつつ、鰭全体の向きは荷重に抗して保つ**。
  - 同じ検索 #23 の要約に、**尾鰭の中央が横運動で遅れて「カップ状」になり、中央の鰭条は背側・腹側の鰭条に対して 25° と 50°（360° 周期のうち）遅れる**とある。**種・出典が要約から特定できない**ため、数値は仕様に採用しない（参考のみ）。
  - 鰭条数: O. mykiss は**尾鰭条 19 本**で、サケ科で典型。「主鰭条数は分枝鰭条数に2を足した数」という記述もある（17 分枝＋2 不分枝）。10+9 の内訳は確認できず（第1版の記憶 M の「10+9」は総数と整合するのみ）。
  - サケ科の尾部骨格: 一般には下尾骨 6、尾神経棘 3。イワナ属（Salvelinus alpinus）では下尾骨 7、尾神経棘 4 の個体が見つかっている（先祖返り）。
- 適用範囲: Lauder 2000 は PROXY（ブルーギル等）。McCutchen 1970 はトラウト（種は要約に無し）。鰭条数は PROXY（O. mykiss、新亜種記載の Plazi 記録）。ヤマメの尾鰭の剛性（曲げ剛性の勾配）、鰭条の分節間隔、アスペクト比の文献値は検索で出なかった。
- 出典: Lauder GV (2000) Am. Zool. 40:101–122。https://sites.harvard.edu/glauder/files/2022/03/LauderAmZoo2000.pdf ／ https://bioone.org/journals/american-zoologist/volume-40/issue-1/0003-1569(2000)040[0101:FOTCFD]2.0.CO;2/Function-of-the-Caudal-Fin-During-Locomotion-in-Fishes/10.1668/0003-1569(2000)040[0101:FOTCFD]2.0.CO;2.full ／ McCutchen https://sciencedirect.com/science/article/abs/pii/0021929070900291?via=ihub%3D ／ 鰭条数 https://publication.plazi.org/GgServer/html/03A3D24DFF854B70B4CEFB2FFD87650C ／ 尾部骨格 https://openpolar.no/Record/crwiley:10.1002%2Fjmor.10775
- 証拠: [A（Lauder, McCutchen の書誌）／B（鰭条数、PROXY）] "The trout's tail fin is flexible and supported by bony rays that can bend in agreement with hydrodynamic load, yet steer the fin as a whole in opposition to the load"（検索 #23 の要約。McCutchen の要旨である可能性が高いが要約は複数ページを混ぜている）。

#### F-23
- 主張/値: **鰭の構造一般**（r06 F-29 から継承）。サケ科の背鰭・臀鰭・胸鰭・腹鰭・尾鰭は、分節し先端が分枝する軟条（鰭条）と、その間の薄い鰭膜からなる。鰭条は左右1対の半条（hemitrichia）からなる。脂鰭は鰭条を持たない（F-21 の要約「non-rayed fin」と一致）。サケ科に鰭棘は無い。鰭膜の厚み（µm）、鰭条の分枝パターン、不分枝条の本数、色素胞の分布は未確認。
- 適用範囲: 条鰭類・サケ科一般。
- 出典: なし（記憶）。
- 証拠: [M] 確信度: 構造の定性は高、数値は無し。

#### F-24
- 主張/値: **胸鰭：定位（station holding）・制動・Kármán 歩行（ニジマス）**。円柱（D 型断面）の後ろの渦列（von Kármán vortex street）の中で定位するニジマスの胸鰭の運動学と筋活動。
  - **制動**: 鰭を体から離して流れに逆らって**持続的に張り出す**（sustained extension）。前進速度が止まる動きと対応し、円柱直後の吸引領域を避ける。制動のすべての場面で**外転筋と内転筋の両方**が動員され、能動的に鰭を張り出す。
  - **Kármán 歩行**: **一過的な伸展と収納**で体の横方向（cross-stream）の動きを制御。伸展動作の **50% 超は筋活動なし（受動）**。
  - 定速遊泳（**0.5 と 1.0 BL/s**）では胸鰭は**体側に畳まれたまま（adducted）**。胸鰭は、ホバリング、低速旋回、制動での急減速などの**操縦行動で能動的に動員**される（検索 #26 の要約。この文が Gibbs et al. 2024 か Drucker & Lauder 2003 のどちらの記述かは要約から特定できない）。
- 適用範囲: ニジマス = PROXY。実験水槽の流速・体長・鰭の角度は要約に無い。
- 出典: Gibbs BJ, Akanyeti O, Liao JC (2024) "Kinematics and muscle activity of pectoral fins in rainbow trout (Oncorhynchus mykiss) station holding in turbulent flow", J. Exp. Biol. 227(5):jeb246275。https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/ ／ https://dx.doi.org/10.1242/jeb.246275
- 証拠: [A] "All braking events required recruitment from both the abductor and adductor musculature to actively extend a pectoral fin, while over 50% of fin extension movements during Kármán gaiting proceed in the absence of muscle activity."（要約）。

#### F-25
- 主張/値: Arnold GP, Webb PW, Holford BH (1991) "The role of the pectoral fins in station-holding of Atlantic salmon parr (Salmo salar L.)", J. Exp. Biol. 156:625–629 — **書誌のみ検索で存在確認**（タイトルは今回の要約で確認）。内容（流れの中で河床に定位するとき、胸鰭で負の揚力を作って体を底へ押し付ける）は第1版の記憶のまま **M**。要約は内容に触れていなかった。
- 適用範囲: タイセイヨウサケ parr = PROXY。
- 出典: URL なし（検索 #20 で書誌確認のみ。要約に個別 URL は無かった）。
- 証拠: [M]（内容）。書誌は検索で確認。写真 F-16 の p017（腹鰭・胸鰭を下へ押し付けて体を支える）は方向が一致するが、因果は示さない。

#### F-26
- 主張/値: **腹鰭の筋活動と水力学（ニジマス, Standen 2010）**。腹鰭は低速遊泳中に**能動的に振動**する。拮抗する**外転筋と内転筋が同時に収縮**し、その合成が左右の鰭の**対側の振動**を生む。腹鰭は腹側の流れを遅くし、ピッチとヨーの不安定性に影響する。**腹鰭の上流の流れは自由流より 0.02 m/s 遅く、下流は 0.034 m/s 遅い**。**腹鰭後流は臀鰭の迎え角に影響**し、腹鰭後流の流れ角は**最大 33.84±2.4°**。
- 適用範囲: ニジマス = PROXY。魚の体長・流速は要約に無い。上記の流速差は特定の実験条件での値。
- 出典: Standen EM (2010) "Muscle activity and hydrodynamic function of pelvic fins in trout (Oncorhynchus mykiss)", J. Exp. Biol. 213(5):831–841。https://journals.biologists.com/jeb/article/213/5/831/10106/Muscle-activity-and-hydrodynamic-function-of ／ PDF https://sites.harvard.edu/glauder/files/2022/03/Standen_JEB_10.pdf
- 証拠: [A] "flow upstream of the pelvic fins is slowed by 0.02 m s-1 and flow downstream of the pelvic fins is slowed by 0.034 m s-1 compared with free stream flow."（要約）。

#### F-27
- 主張/値: **背鰭の運動学と水力学（ニジマス）**。定常遊泳を **0.5、1.0、2.0 L/s** で誘導。
  - 背鰭は**追加の推力をほとんど生まず、強い側方力**を作る。**側方:後方の力の比は 1.0 L/s で約 6:1**。
  - **背鰭の振幅と側方力は低速で最大、速度とともに減少**。**背鰭の高さにも一貫して負の速度依存**がある。**2.0 L/s では背鰭は後流に運動量を加える役割を失う**。
  - 背鰭の後流は**尾へ向かう渦の鎖**で、**尾鰭はその渦の中心を通って振れる**。
  - 背鰭力は主に側方向のため、**ロールとヨーのモーメントが生じ、尾鰭・臀鰭・対鰭の力で打ち消す必要がある**。要旨の結論は「背鰭は推進より魚を水中で安定させる」。
- 適用範囲: ニジマス = PROXY。鰭の振幅の絶対値（%L）、位相は要約に無い。体長は不明。
- 出典: Drucker EG, Lauder GV (2005) "Locomotor function of the dorsal fin in rainbow trout: kinematic patterns and hydrodynamic forces", J. Exp. Biol. 208(23):4479–4494, DOI 10.1242/jeb.01922。https://journals.biologists.com/jeb/article/208/23/4479/15977/Locomotor-function-of-the-dorsal-fin-in-rainbow ／ 解説（Inside JEB）https://journals.biologists.com/jeb/article/208/23/i/15927/DORSAL-FIN-STABILISES-TROUT ／ PDF（タイトルのみ確認）https://sites.harvard.edu/glauder/files/2022/03/Drucker-Lauder2005.pdf
- 証拠: [A] "the dorsal fin generates little additional thrust, but strong side forces: the side:posterior force ratio is almost 6:1 at a swimming speed of 1.0 L s⁻¹"（要約）。

#### F-28
- 主張/値: 中央鰭の他の文献（書誌のみ・内容は記憶）。(a) Standen EM, Lauder GV (2005) "Dorsal and anal fin function in bluegill sunfish Lepomis macrochirus: three-dimensional kinematics during propulsion and maneuvering", J. Exp. Biol. 208:2753–2763（**PROXY: ブルーギル**）。(b) Webb PW (1977) "Effects of median-fin amputation on fast-start performance of rainbow trout (Salmo gairdneri)", J. Exp. Biol. 68:123–135 — 中央鰭の切除が急発進の性能を下げる、という方向の記憶。(c) 「Escaping Flatland: three-dimensional kinematics and hydrodynamics of median fins in fishes」J. Exp. Biol. 211(2):187（検索 #6, #7, #15, #25 の結果に出現。著者・内容は未確認）。(d) Alben S, Madden PG, Lauder GV (2007) J. R. Soc. Interface 4:243–256（鰭形状の能動制御。r06 F-29 から継承）。(e) Flammang BE, Lauder GV (2009) J. Exp. Biol. 212:277–286（ブルーギルの加速・制動での尾鰭形状制御。PROXY）。いずれも**今回の検索の要約では内容を確認していない**。
- 適用範囲: (a)(e) ブルーギル、(b) ニジマス。全て PROXY。
- 出典: なし（記憶。(c) は https://journals.biologists.com/jeb/article/211/2/187/17685/Escaping-Flatland-three-dimensional-kinematics-and が検索結果に出現）。
- 証拠: [M]（内容）。

#### F-29
- 主張/値: **脂鰭の縁色の PROXY**。ブラウントラウト: 脂鰭は**橙〜赤の縁**（「脂鰭に赤がある唯一のトラウト」、飼育魚では欠けることが多い）、透明ではなく、斑点なし。幼魚（parr）でも縁は赤〜橙。ニジマス: 脂鰭は**やや透明で黒縁**、時に斑点あり。
- 適用範囲: **PROXY: Salmo trutta／O. mykiss**。ヤマメの脂鰭の縁色は検索で出なかった（検索 #11 は無効）。写真（F-13）ではヤマメの橙縁は確認されず、暗縁2枚・白縁1枚・縁なし数枚。
- 出典（候補・帰属未特定）: https://www.wired2fish.com/trout/types-of-trout ／ https://australian.museum/learn/animals/fishes/brown-trout-salmo-trutta-linnaeus-1758/ ／ https://idfg.idaho.gov/fish/identification/resident ／ https://portal.ct.gov/DEEP/Fishing/Freshwater/Freshwater-Fishes-of-Connecticut/Brown-Trout ／ https://www.flyanglersonline.com/oldsite/features/streamdr/bert022105.php
- 証拠: [B] "The brown trout is the only trout species that has red on the adipose fin… although this color character is often absent in hatchery-reared fish"（要約）。

#### F-30
- 主張/値: **鰭の成長様式と飼育魚の鰭の劣化（タイセイヨウサケ parr）**。河川飼育の parr では**背鰭・尾鰭・臀鰭は体長（尾叉長）に対して直線的、胸鰭・腹鰭・脂鰭は曲線的**に成長。ハッチェリー飼育の parr では、腹・脂・尾・臀鰭は孵化後7か月時点で劣化の兆候なし、**胸鰭（13–20%）と背鰭（15–18%）**には劣化があった。試験終了時には脂鰭以外の全鰭に劣化があり、**胸鰭（35–65%）と背鰭（32–58%）**の鰭の損失が最大。ハッチェリー魚の全鰭は時間とともに短くなり、河川魚より鰭が短い。
- 適用範囲: **PROXY: Salmo salar parr**（河川飼育 vs ハッチェリー）。%の定義（長さの減少率か劣化した個体の割合か）は要約から特定できない。
- 出典: Pelis RM, McCormick SD (2003) "Fin development in stream- and hatchery-reared Atlantic salmon", Aquaculture（著者・年は検索結果の要約による）。https://pubs.usgs.gov/publication/70025750 ／ https://www.usgs.gov/publications/fin-development-stream-and-hatchery-reared-atlantic-salmon
- 証拠: [A] "All fins of hatchery-reared parr became shorter with time, demonstrating that hatchery-reared fish develop shorter fins than stream-reared fish."（要約）。

#### F-31
- 主張/値: **ヤマメの鰭の色（HRO 解説の要約, 日本語）**。「天然のヤマメには背びれ、腹びれ、尻びれの先端に白色部を持つものがある。降海時期には体側が銀白色に変わり、パーマークが見えにくくなり、背びれと尾びれの先端が黒くなる。」体側にパーマーク 7–10 個（同要約）。同 PDF の外部形態の節に、背鰭・脂鰭・尾鰭・胸鰭・腹鰭・臀鰭の記述があるとされるが、要約が示したのは上記のみ。
- 適用範囲: ヤマメ（北海道の解説、河川型と降海型の区別あり）。「天然の」と明記されており、放流魚は含まない可能性。出現頻度は不明。
- 出典: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf（検索 #18。F-04 と同一 PDF）。なお同検索で出た https://www.honda.co.jp/fishing/picture-book/yamame/ ／ https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html の要約には鰭の具体は無く、体長 約30 cm（河川型）／最大約70 cm（降海型）程度。
- 証拠: [B] 「天然のヤマメには背びれ、腹びれ、尻びれの先端に白色部を持つものがある」（要約）。写真 F-12（腹鰭 13/48、臀鰭 20/47、背鰭 6/46 の先端・前縁の白）と一致。

#### F-32
- 主張/値: **脂鰭の感覚機能の追加証拠（PROXY）**。(a) ナマズ類 Corydoras aeneus の脂鰭に分布する神経から記録した活動は、鰭膜の**動きと位置**（変位の大きさ）をコードしていた。(b) ニジマスの脂鰭で神経・グリア細胞マーカー遺伝子と、各種機械受容器のチャネルタンパク遺伝子の転写量を調べた論文があり、タイトルは「流れセンサーとしての機能を支持する」。
- 適用範囲: (a) PROXY: Corydoras aeneus（コリドラス、ナマズ目）。(b) PROXY: O. mykiss。ヤマメでは未確認。
- 出典: "Mechanosensation in an adipose fin", Proc. R. Soc. B 283(1826), 2016。https://pure.psu.edu/en/publications/mechanosensation-in-an-adipose-fin/ ／ "Gene Profiling in the Adipose Fin of Salmonid Fishes Supports Its Function as a Flow Sensor"（Genes 誌, 2019–2020 と見られる）。https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7016824/ ／ https://doaj.org/article/f118a9f9964a4cee913c628397fe6586
- 証拠: [A] "neural activity recorded from nerves innervating the fin showing encoding of information on both movement and position of the fin membrane"（検索 #10 の要約）。

#### F-33
- 主張/値: **対鰭と正中鰭の構造の一般論**。Lauder & Drucker (2004) は、魚の鰭は中央鰭と対鰭に大別され、基部で分節した骨性/軟骨性要素に支えられ、魚は**鰭の形（コンフォメーション）を筋で広く制御できる**と述べる。
- 適用範囲: 魚類一般（レビュー）。数値無し。
- 出典: Lauder GV, Drucker EG (2004) "Morphology and experimental hydrodynamics of fish fin control surfaces", IEEE J. Oceanic Eng. 29:556–571。https://bpb-us-e1.wpmucdn.com/sites.harvard.edu/dist/6/58/files/2022/03/Lauder.Drucker.2004.pdf
- 証拠: [A] "fish having extensive muscular control over fin conformation"（要約）。

---

## 3. 資料間の矛盾・不一致

| # | 項目 | 資料A | 資料B | 補足 |
|---|------|-------|-------|------|
| 1 | 臀鰭条数 | 11–14／12–14（青森, F-01） | 14–18（英語二次資料）、12–17（日本語二次資料）(F-03) | 地域・亜種・数え方（主鰭条/総数）・集団差のいずれか。F-02 は臀鰭条が集団間で有意に異なると示す。 |
| 2 | 背鰭条数 | 12–13（青森, F-01） | 13–18／12–17（F-03） | 同上 |
| 3 | 胸鰭条数 | 12–14／13–15（青森, F-01） | 14–17（F-03） | 同上。F-02 は胸鰭条の集団差を示す |
| 4 | 腹鰭条数 | 9／8–9（青森, F-01） | 9–11／10–12、Christie「大半が10」(F-03) | 腹鰭条は集団間で有意差なし（F-02）なのに値が資料でずれる。数え方か亜種差か未確認 |
| 5 | 鰭先端の黒／白 | HRO（検索 #18）: 天然ヤマメは背・腹・尻びれの**先端が白い**個体がある。**降海期に背びれ・尾びれの先端が黒くなる** (B, F-31) | 継承 F-04: 降海期に背鰭先端が白い。継承 F-05（C, 帰属不明）: 背・腹・臀・尾の先端が黒い | F-04 の継承文と今回文は同じ PDF の要約で食い違う。今回の方が鰭別で具体的なので優先する。F-05 の「黒」は降海期の記述が混ざった可能性があるが**未検証**。写真は腹・臀鰭の白が多く（13/48, 20/47）、F-31 を支持する |
| 6 | 鰭の色 | 台湾亜種（PROXY）の「銀緑色の鰭」(B, F-09) | 写真: 胸鰭は黄橙〜琥珀が多数（40/53）、尾鰭は灰褐〜暗灰の半透明 (F-12) | 亜種差か光環境か不明 |
| 7 | 尾鰭下葉縁の赤橙 | 写真 17/57（約30%, F-12） | B 資料の要約には出てこない | 色かぶり・網の色・アマゴ交雑の可能性を除外できない |
| 8 | 尾鰭の切れ込み深さ | カタログ p049「約5%SL」 | 本読み p049 = 1.8%SL、p029 = 4.1%SL (F-15) | カタログの先端座標が前方にずれている疑い。2個体間でも差 |
| 9 | 脂鰭の縁 | 写真: 暗縁（p040, p064）／白縁（p016）／縁なし（p032, p049）(F-13) | PROXY: ブラウントラウトは橙〜赤縁、ニジマスは黒縁 (F-29) | ヤマメで橙縁は確認されず。縁の有無は個体差か照明か不明 |
| 10 | 脂鰭の位置 | p049: 80.8–88.9%SL | p029: 85.7–91.7%SL (F-14) | 約5ポイントの差。尾鰭基部の定義（±1.3%）と脂鰭の寝かせ方、個体差を含む |
| 11 | 胸鰭の姿勢 | 要約: 定速遊泳（0.5–1.0 BL/s）で胸鰭は体側に畳む (F-24) | 写真 p016: 水平遊泳中に胸鰭が扇状に開く。p040, p029 は畳む (F-16) | ニジマス成魚の実験と、水槽の parr の静止画との差。群泳・個体の大きさ・速度の違いか、静止画の瞬間かを区別できない |
| 12 | 腹鰭の使い方 | 要約: 低速定常遊泳で腹鰭は周期的に振動（能動＋受動, F-19, F-26） | 写真: p040 は腹鰭を閉じる、p023・p049・p042 は軽く開く (F-16) | 静止画では振動を判定できない。「軽く開く」は振動の一瞬の可能性 |
| 13 | 脂鰭除去の効果 | Reimchen & Temple: 尾鰭振幅 平均 +8%（−3〜+23%）(F-21) | 同研究で小型魚（12 cm）は差なし | 効果は個体サイズと個体差に依存し、符号が逆転する個体もある。脂鰭の流体機能はヤマメ parr（小型）では小さいかもしれないが推論 |
| 14 | 集計の差 | r06 F-19: 腹鰭白縁 14、臀鰭 19、尾鰭下葉赤橙 16 | 本集計: 13、20、17 (F-12) | 判定語の違い。±1 は誤差 |
| 15 | 胸鰭の姿勢（p016） | p016 注釈「大きく側方へ広がる」 | 私の目視: 扇状に開き後方・下に向く (F-16) | 正面視点が無いため側方への広がりは判定不能 |

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル/アニメ/行動実装に必要だが確認できなかった事項

**課題1〜6への回答状況**
1. **胸鰭（Drucker & Lauder 2003）**: 行動別の定性的な記述は取得（F-18, F-24）。**未取得**: 各行動での展開角（度）、ストローク周波数（Hz）、位相、鰭条の屈曲量、左右非対称の内外の別（旋回で内側・外側のどちらが何をするか）、魚の体長と流速、定位・制動の速度条件。「基部の回転 30° 超」と「ヨー 4–41 °/s」「力 2.7 mN」だけが数値。
2. **腹鰭（Standen 2008/2010）**: 定常遊泳で対側に周期振動、操縦で内外非対称（F-19, F-26）は取得。**未取得**: 周波数、振幅（度）、位相差、定常遊泳と操縦で鰭を開く角度、どの行動（上昇・下降・ロール）で展開するか。
3. **背鰭・臀鰭（Drucker & Lauder 2005, Standen & Lauder 2007）**: 背鰭の速度依存（F-27）、臀鰭の相殺ジェット（F-20）は取得。**未取得**: 振幅（%L）、周波数（体の尾部ビート周波数と同じか）、背鰭・臀鰭・尾鰭の位相、臀鰭単独のニジマスのデータ（臀鰭は PROXY ブルックトラウト／ブルーギルのみ）。
4. **脂鰭（Reimchen & Temple 2004 ほか）**: 機能仮説と切除実験（F-21）、感覚仮説の追加証拠（F-32）は取得。**未取得**: ヤマメの脂鰭の実サイズ（%SL の文献値）、縁の橙の有無（文献）、成魚の形状、脂鰭の可動性の実測。写真 2 個体（F-14）のみ。
5. **尾鰭**: 柔軟性の定性（F-22）、鰭条数 19（PROXY）は取得。**未取得**: 曲げ剛性の勾配、鰭条の分節間隔、アスペクト比（文献値。写真1枚で約2.0）、遊泳中の形状変化の定量（カップ化の量、後縁の位相遅れ。要約の「25°/50°」は帰属不明で採用せず）、ヤマメの尾鰭の鰭条内訳（10+9は未確認）、尾鰭の面積、フォーク角。検索 #14（aspect ratio）は数値を返さなかった。
6. **各鰭のサイズ/SL、形状・縁の色・斑点（ヤマメ）**: 文献値は**ゼロ**（HRO の白い先端の記述のみ, F-31）。写真2枚の寸法（F-14）と色の集計（F-12）のみ。成魚の値は無い。

**その他、実装に必要な欠落**
- **鰭の可動範囲**: 各鰭の展開角・畳み角の上限下限、動く速さ（Hz）、左右の位相差。
- **鰭と速度/行動の関係**: 胸鰭が畳まれる上限速度は「0.5–1.0 BL/s で畳む」までで、**それ以上（2 BL/s 以上）での胸鰭・腹鰭の挙動**、C-start・急旋回・摂餌攻撃時の鰭の使い方、ブレーキ時の展開角が未取得。
- **鰭の相対サイズの成長変化**: ヤマメ parr→成魚の胸・腹・背・尾鰭の%SL。サケでは直線/曲線の別だけ（F-30, PROXY）。
- **鰭の雌雄差・繁殖期変化**: 河川型ヤマメ雄の鰭の伸長・婚姻色の鰭への出方。
- **鰭膜の光学**: 厚み、透過率、色素胞の分布。
- **鰭の色の標準値**: 色素の根拠（カロテノイド等）と個体差の頻度。写真の色サンプリング（`colorsample.py`）は未実施。
- **鰭の欠け・擦れ・水カビ**: 発生頻度は未取得（F-30 は PROXY の割合）。
- **実写動画からの鰭の追跡**: 動画の入手経路が無い。
- **全文 PDF の数値**: Drucker & Lauder 2005、Standen & Lauder 2007、Standen 2010 の PDF（sites.harvard.edu）、Standen 2008 の PDF（cob.silverchair.com）は検索に索引されていたが、要約は数値を返さなかった。別途、全文アクセスのある人が読めば角度・周波数が取れるはず。

---

## 5. 出典一覧（URL付き、重複排除）

**今回の検索で得た運動学・機能（F-18〜F-33）**
- Drucker & Lauder (2003) 胸鰭: https://pubmed.ncbi.nlm.nih.gov/12547936 ／ https://journals.biologists.com/jeb/article/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout ／ https://www.semanticscholar.org/paper/Function-of-pectoral-fins-in-rainbow-trout:-and-Drucker-Lauder/fb50c2bcae8575cf4e50189d22140746cdbc2372（F-18）
- Gibbs, Akanyeti & Liao (2024) 胸鰭の定位: https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/ ／ https://dx.doi.org/10.1242/jeb.246275（F-24）
- Standen (2008) 腹鰭: https://pubmed.ncbi.nlm.nih.gov/18775930/ ／ https://journals.biologists.com/jeb/article/211/18/2931/17665/Pelvic-fin-locomotor-function-in-fishes-three ／ https://cob.silverchair.com/jeb/article-pdf/211/18/2931/1558121/2931.pdf（F-19）
- Standen (2010) 腹鰭の筋活動: https://journals.biologists.com/jeb/article/213/5/831/10106/Muscle-activity-and-hydrodynamic-function-of ／ https://sites.harvard.edu/glauder/files/2022/03/Standen_JEB_10.pdf（F-26）
- Drucker & Lauder (2005) 背鰭: https://journals.biologists.com/jeb/article/208/23/4479/15977/Locomotor-function-of-the-dorsal-fin-in-rainbow ／ https://journals.biologists.com/jeb/article/208/23/i/15927/DORSAL-FIN-STABILISES-TROUT ／ https://sites.harvard.edu/glauder/files/2022/03/Drucker-Lauder2005.pdf（F-27）
- Standen & Lauder (2007) ブルックトラウト: https://journals.biologists.com/jeb/article/210/2/325/17120/Hydrodynamic-function-of-dorsal-and-anal-fins-in ／ https://sites.harvard.edu/glauder/files/2022/03/Standen.Lauder.2007.pdf（F-20）
- Escaping Flatland（著者未確認）: https://journals.biologists.com/jeb/article/211/2/187/17685/Escaping-Flatland-three-dimensional-kinematics-and（F-28）
- Reimchen & Temple (2004) 脂鰭: https://web.uvic.ca/~reimlab/adipose.pdf ／ https://uwe-repository.worktribe.com/output/1494854（候補）（F-21）
- Buckland-Nicks et al. (2012) の解説: https://fishbio.com/study-adipose-fin/ ／ https://uvic.ca/news/topics/2011+is-fin-clipping-affecting-salmon-survival+media-tip ／ https://thefisheriesblog.com/2013/05/28/the-adipose-fin-old-mysteries-with-new-answers/（F-21）
- 脂鰭の感覚: https://pure.psu.edu/en/publications/mechanosensation-in-an-adipose-fin/ ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7016824/ ／ https://doaj.org/article/f118a9f9964a4cee913c628397fe6586（F-32）
- 脂鰭の縁色 PROXY: https://www.wired2fish.com/trout/types-of-trout ／ https://australian.museum/learn/animals/fishes/brown-trout-salmo-trutta-linnaeus-1758/ ／ https://idfg.idaho.gov/fish/identification/resident ／ https://portal.ct.gov/DEEP/Fishing/Freshwater/Freshwater-Fishes-of-Connecticut/Brown-Trout ／ https://www.flyanglersonline.com/oldsite/features/streamdr/bert022105.php（F-29）
- Lauder (2000) 尾鰭: https://sites.harvard.edu/glauder/files/2022/03/LauderAmZoo2000.pdf ／ https://bioone.org/journals/american-zoologist/volume-40/issue-1/0003-1569(2000)040[0101:FOTCFD]2.0.CO;2/Function-of-the-Caudal-Fin-During-Locomotion-in-Fishes/10.1668/0003-1569(2000)040[0101:FOTCFD]2.0.CO;2.full（F-22）
- McCutchen (1970) トラウトの尾鰭: https://sciencedirect.com/science/article/abs/pii/0021929070900291?via=ihub%3D（F-22）
- 尾鰭条数（O. mykiss 19, PROXY）: https://publication.plazi.org/GgServer/html/03A3D24DFF854B70B4CEFB2FFD87650C ／ 尾部骨格（S. alpinus）: https://openpolar.no/Record/crwiley:10.1002%2Fjmor.10775（F-22）
- Pelis & McCormick (2003) タイセイヨウサケ parr の鰭: https://pubs.usgs.gov/publication/70025750 ／ https://www.usgs.gov/publications/fin-development-stream-and-hatchery-reared-atlantic-salmon（F-30）
- Lauder & Drucker (2004) レビュー: https://bpb-us-e1.wpmucdn.com/sites.harvard.edu/dist/6/58/files/2022/03/Lauder.Drucker.2004.pdf（F-33）
- HRO（ヤマメの鰭先端）: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf（F-04, F-31）／ 参考（鰭の具体なし）: https://www.honda.co.jp/fishing/picture-book/yamame/ ／ https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html

**継承（先行ストリームが検索結果で得た URL。F-01〜F-11）**
- 青森県産業技術センター（内水面研究所）: https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html（F-01）
- Mano et al. (1991): https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57（F-02）
- Christie (1970): https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf（F-03）
- 二次資料（鰭条数の候補、帰属未確定）: https://www.fishbase.se/summary/Oncorhynchus-masou.html ／ https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/ ／ https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html ／ https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf（F-03）
- 鰭先端の黒の記述の候補（帰属未確定）: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://museum.umic.jp/kawa/zukan/sakana/yamame.html ／ https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html ／ https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF ／ https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1（F-05）
- Kato (1991): https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/（F-06）
- 埼玉県: https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html（F-07a）
- ギンザケ飼育 vs 野生: https://link.springer.com/article/10.1023/A:1007646332666（F-07b）
- ブラウントラウトの流れ運動（候補）: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/ ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5551095/（F-07c）
- ノルウェーのサケ・ブラウン幼魚: https://www.researchgate.net/publication/263057933_Morphological_variability_of_Atlantic_salmon_Salmo_salar_and_brown_trout_Salmo_trutta_in_different_river_environments（F-07d）
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

**書誌情報のみ（M。URL 未取得、原典未確認。巻・頁・年は記憶のため誤りを含みうる）**
- Arnold GP, Webb PW, Holford BH (1991) J. Exp. Biol. 156:625–629（F-25。タイトルは検索で確認）
- Standen EM, Lauder GV (2005) J. Exp. Biol. 208:2753–2763（F-28, PROXY: ブルーギル）
- Webb PW (1977) J. Exp. Biol. 68:123–135（F-28）
- Alben S, Madden PG, Lauder GV (2007) J. R. Soc. Interface 4:243–256（F-28）
- Flammang BE, Lauder GV (2009) J. Exp. Biol. 212:277–286（F-28, PROXY: ブルーギル）

**ローカルファイル（継承元・集計元）**
- `/home/user/gerupamasini/docs/yamame/research/r01_morph_jp.md`, `r02_morph_en.md`, `r04_parr_jp.md`, `r05_parr_pigment_en.md`, `r06_skin_scale_optics.md`, `r08_swim_steady.md`
- `/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json 〜 catalog_c07.json`
- `/home/user/gerupamasini/tools/photo/grid.py`, `colorsample.py`, `morpho_stats.py`

---

## 6. 検索ログ

総検索回数: **26 回**（WebSearch。extended 2 回、standard 24 回。割当上限ちょうど。上限エラーは出なかった）。WebFetch は未使用。有用度: 高=要約に仕様に使える記述/数値あり、中=部分的、低=ほぼ無し。

| # | mode | クエリ（要旨） | 有用度 | 得たもの |
|---|---|---|---|---|
| 1 | extended | Drucker Lauder 2003 Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces | 高 | F-18（基部30°超、ホバリング/旋回/制動、2.7 mN、4–41 °/s） |
| 2 | standard | pectoral fins rainbow trout braking turning hovering sculling… Drucker Lauder 2003 abstract（allowed: pubmed, journals.biologists, semanticscholar, sites.harvard 等） | 高 | F-18 の再現（力の作用線は重心の下、引き戻し半ストロークのみ推力）。Lauder & Drucker 2004、Standen 2010、Gibbs 2024 が出現 |
| 3 | standard | Standen 2008 pelvic fin rainbow trout 3D kinematics abducted adducted…（allowed: pubmed 等） | 中 | F-19 の方法（0.13–1.36 BL/s、2台のカメラ） |
| 4 | standard | "Rainbow trout" pelvic fins "steady swimming" "0.13" "1.36" … | 高 | F-19（対側周期、能動＋受動、トリムフォイル、内外非対称） |
| 5 | standard | Standen 2010 Muscle activity and hydrodynamic function of pelvic fins in trout | 高 | F-26（0.02/0.034 m/s、33.84±2.4°、拮抗筋の同時収縮） |
| 6 | standard | Drucker Lauder 2005 Locomotor function of the dorsal fin in rainbow trout | 高 | F-27（6:1、低速で最大、2.0 L/s で役割喪失） |
| 7 | standard | Standen Lauder 2007 brook trout dorsal and anal fins… | 中 | F-20（ロール安定、トルクの釣り合い）。速度・位相は取れず |
| 8 | standard | Reimchen Temple 2004 Hydrodynamic and phylogenetic aspects of the adipose fin | 高 | F-21（steelhead 5–18 cm、10–39 cm/s、+8%、小型魚は差なし） |
| 9 | standard | Buckland-Nicks Gillis Reimchen 2012 Neural network … adipose fin | 中 | F-21（神経網）。解説記事のみ（B） |
| 10 | standard | Mechanosensation in an adipose fin Proc R Soc B … | 中 | F-32（Corydoras、ニジマスの遺伝子解析）。PROXY |
| 11 | standard | ヤマメ 脂鰭 縁 色 黒 橙 アマゴ 見分け 脂びれ | 低 | 脂鰭の縁色の記述なし（アマゴの朱点の説明のみ） |
| 12 | standard | salmonid caudal fin principal rays 10 + 9 … procurrent rays | 中 | F-22（O. mykiss 19 鰭条、尾部骨格）。10+9 の内訳は未確認 |
| 13 | standard | Lauder 2000 Function of the caudal fin … | 中 | F-22（ブルーギル等＝PROXY） |
| 14 | standard | rainbow trout caudal fin aspect ratio area span … | 低 | 数値なし（一般論のみ） |
| 15 | standard | dorsal fin rainbow trout 1.0 L s 2.0 L s … Drucker Lauder abstract（allowed: biologists 等） | 中 | F-27 の補足（0.5/1.0/2.0 L/s、渦の鎖） |
| 16 | standard | Kinematics and muscle activity of pectoral fins rainbow trout station holding turbulent flow（allowed: ncbi, journals.biologists） | 高 | F-24（制動の持続伸展、Kármán 歩行、50%超が受動） |
| 17 | standard | Lauder Drucker 2004 Morphology and experimental hydrodynamics of fish fin control surfaces | 低 | F-33（一般論） |
| 18 | standard | ヤマメ 外部形態 脂鰭 尾鰭 浅く二叉 胸鰭 腹鰭 臀鰭 先端 白色 黒点 背鰭 | 高 | F-31/F-04（天然ヤマメの背・腹・尻びれ先端の白、降海期の先端の黒） |
| 19 | standard | ヤマメ 魚図鑑 特徴 ヒレ … ホンダ 釣り（allowed: honda, ifarc, hro, kanagawa-museum） | 低 | 鰭の具体なし（河川型の体長 約30 cm 程度） |
| 20 | standard | Arnold Webb Holford 1991 … pectoral fins station-holding Atlantic salmon parr | 低 | F-25 の書誌確認のみ。USGS の鰭発達論文が出現（#21 へ） |
| 21 | standard | Fin development in stream- and hatchery-reared Atlantic salmon（allowed: usgs） | 高 | F-30（成長様式、胸・背鰭の劣化 %） |
| 22 | standard | brown trout adipose fin orange red margin vs rainbow trout black … | 中 | F-29（PROXY, B） |
| 23 | extended | trout caudal fin shape change during swimming fin ray flexibility passive bending cupping | 中 | F-22（McCutchen 1970 の要旨、カップ化の帰属不明の記述） |
| 24 | standard | "The trout tail fin: A self-cambering hydrofoil" Journal of Biomechanics 1970 | 低 | 書誌確認のみ（著者 McCutchen、J. Biomech. 3(3):271） |
| 25 | standard | brook trout dorsal and anal fins wake vortices… Standen Lauder 2007 | 中 | F-20 の再現 |
| 26 | standard | rainbow trout pectoral fins extended during braking … Gibbs Akanyeti Liao 2024（allowed: ncbi, journals.biologists） | 中 | F-24（0.5/1.0 BL/s で胸鰭を畳む。帰属は不明） |

- 検索ではない情報源（ローカルの読み取りと画像観察）: 第1版で、`docs/yamame/research/` の r01〜r08 を鰭関連語で Grep、`photo_analysis/catalog_c01〜c07.json`（70 枚、yamame ラベル 57 枚）の `fins.*`・`posture_behavior` を Python で集計（F-12, F-13, F-16）、写真 p016, p029, p049, p053, p064 を直接観察して `tools/photo/grid.py` の座標格子で p049, p029 の寸法を読んだ（F-14, F-15, F-17）。第2版では写真側の再計測はしていない。
- 未実施: 色サンプリング（`colorsample.py`）、他の写真の座標読み、動画の確認、全文 PDF の読み取り。
- 再開の手順（検索上限が再度使える場合の優先順）: (1) 論文全文（Drucker & Lauder 2003/2005, Standen 2008/2010, Standen & Lauder 2007）の角度・周波数・位相を表や図から取る。(2) `ヤマメ 脂鰭 大きさ 縁 橙` を別表現（例: サクラマス幼魚 脂鰭 黒縁）で再検索。(3) `trout caudal fin flexural stiffness fin ray` で尾鰭剛性の数値。(4) 実データの `landmarks_c*_*.json` が揃い次第 `python3 tools/photo/morpho_stats.py` で F-14 を置き換え。
