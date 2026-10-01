# ヤマメ(Oncorhynchus masou masou 河川型)の形態計測・計数形質（日本語資料）— r01

> **調査方法の制約（必読）**: Bash/curl と WebFetch は遮断（WebFetch を1回試行し EGRESS_BLOCKED を確認、以後試行せず）。情報源は WebSearch の「要約文」のみで、論文・PDF の全文は読めていない。したがって本書の数値・記述は**すべて検索結果の要約文に明示されたものだけ**を採用している。要約文は機械要約であり、(a) どの URL の記述かが特定できない、(b) 項目名のラベルが入れ替わる、(c) 同一クエリを言い換えると同じ数値を再現できない、という欠陥が実際に観測された。該当するものは各 Finding に「要原典確認」と明記した。**数値を3Dモデル仕様に使う前に、各 Finding の「原典候補」を一次資料で確認すること。**
>
> **証拠ランクの運用**: A=査読論文・学術書・公的機関の正式報告で、要約文に数値/記述が明示 / B=自治体・研究機関の解説ページ・図鑑・データベース / C=Wikipedia 系・釣り情報・個人サイト・出典不明 / M=調査員の記憶（未検証）。ランクは「資料の種別」と「要約文での明示度」の両方で付けており、要約の信頼性に疑義があるものは1段下げている。
>
> **PROXY の運用**: ヤマメ以外（サクラマス全般・アマゴ・ビワマス・台湾亜種 formosanus・韓国産マス・他のOncorhynchus）のデータは scope に "PROXY:" と明記した。

---

## 1. 要約（仕様に直結する結論）

1. **最大体高/体長**: サクラマス・ヤマメ 23.5–29.9%、アマゴ(サツキマス) 24.8–30.4%（ja.wikipedia 由来、原典未特定）。一方ロシア系記述は 28–31%（降海型中心）、台湾亜種成魚(PROXY)は比から算出して約 28.7%。→ 河川型ヤマメの体高は「約24–30%」を暫定レンジとし、深体個体（北海道の「イタマス」）を個体差の裾として扱う。**分母が SL か TL/FL かは要約に無い**。 [F-04][F-05][F-10][F-12][F-16]
2. **頭長/SL**: 河川型ヤマメの直接値は取得できず。台湾亜種成魚(PROXY)の SL/HL=4.20 から約 23.8%（算出）。 [F-12]（Gap）
3. **眼径は体サイズで大きく変わる（アロメトリー）**: 眼径/頭長は幼魚(≤200mm)で 20–30%、大型成魚で約 10%（ロシア系記述）。サクラマス(大型降海型) 0.100±0.013、サツキマス 0.134±0.011、ビワマス 0.169±0.028（ja.wikipedia ビワマス）。台湾陸封成魚(PROXY, 約30cm)は 3.43 から約 0.29。→ **ヤマメの眼は「15–30cm の陸封魚サイズ」で頭長比 約0.2–0.3 の可能性が高いが、直接値は無い（推定であり資料値ではない）**。眼を一定比で作らず、サイズに連動させる必要がある。 [F-07][F-10][F-12][F-09]
4. **鰭条数（青森ヤマメ）**: 背12–13、胸12–14、腹9、臀12–14（いずれも「軟条」表記）。旭川産サブセットは背12–13、胸13–15、腹8–9、臀11–14。不分枝条/分枝条の区別は要約に無い。 [F-01][F-03]
5. **側線有孔鱗数**: 青森ヤマメ 118–134（実測報告）。他に 120–140（AI百科）、130–240（ロシア系・外れ値の疑い）。側線上横列鱗数はサクラマス 27–32、サツキマス 25–34、ビワマス 21–27。 [F-01][F-04][F-05][F-06][F-10][F-11]
6. **パーマーク数**: 青森ヤマメ 8–10 個。アマゴ 7–11 個、台湾亜種 9 個＋小黒点 11–13 個、AI百科 9–10。丹沢のヤマメは「パーマーク・小黒点が多い／少数の朱点が入る」など**沢ごとに外部形態が異なる**（個体群差）。 [F-01][F-11][F-12][F-15][F-18]
7. **幽門垂数**: サクラマス・ヤマメ 40–54（ja.wikipedia）、他資料 35–68 / 35–76。アマゴ 32–58、ビワマス 46–77。青森報告の内部形態は要約のラベルが崩れており（「幽門垂数16-18本、幽門数39-47」）、鰓耙と幽門垂の取り違えの疑い。 [F-02][F-04][F-05][F-06][F-10][F-11]
8. **脊椎骨数 63–66（ロシア系）/63–69（AI百科）、鰓耙数 18–22 / 19–26（短く太く疎ら）**。いずれも C ランクで、ヤマメ（河川型）固有値ではない。 [F-10][F-11]
9. **サイズ**: 河川型ヤマメは概ね全長30cmまで（自治体・NIES）、40cmとする記載もあり。降海型・湖沼型は60–70cm。種全体の最大は 79.0cm TL/10kg（FishBase）。大型の河川型は尾柄高・鰭の大きさ・鱗に**幼魚形質を残す**（Kato 1991）。 [F-14][F-15][F-04][F-23]
10. **体長-体重**: 北海道網走川水系 W=0.0106·FL^3.0397（FL 1.9–21.9cm, n=8208, R²=0.949）。この式から FL 10/15/20cm でそれぞれ約 11.6/39.8/95.5 g（算出）。 [F-22]（要原典確認）
11. **性差**: 韓国産マス(PROXY)で、雄は頭長に対する吻長・上顎長の比が雌より大きく、眼径比が小さい。産卵期の雄は黒ずみ、桜色の雲状斑、吻が伸びて下に曲がり、顎の歯が強大化。 [F-13][F-17]
12. **成長段階**: 幼魚(パーマーク明瞭)は体高が高く、スモルト化で細身・銀化・肥満度低下。陸封魚は成長してもパーマークが薄れるだけで残る。スモルト化の閾値は FL 12cm（駆動は体サイズ）。 [F-25][F-31][F-14][F-15]
13. **放流・養殖魚との差**: 体色が薄く体型が丸い、鰭欠損。10月放流魚は体色・体型とも天然魚に近づく。サケ科の一般則として飼育魚は頭が小さく体幅(体の厚み)・尾柄が大きく背鰭が短い傾向（PROXY:ギンザケ）。 [F-20][F-21]
14. **近縁種識別**: アマゴ=体側の朱点（ヤマメには無い）。ビワマス(新種 O. biwaensis 2025)=幽門垂が多く側線上横列鱗が少なく眼が大きい。イワナ=白点、歯の分布（鋤骨の形）が異なる。ニジマス/ブラウンの形態識別点は要約から取得できず。 [F-08][F-06][F-15][F-28]
15. **口裂（上顎後端と眼の位置関係）、吻形状、横断面形（体幅/体高）、尾柄高、背鰭前長・腹鰭前長・臀鰭前長、鰭基底長/高さ、脂鰭の位置・大きさ、尾鰭切れ込みの深さは、数値も記述も取得できなかった**。写真ストリーム/原典確認で補う必要がある。（Gaps参照）
16. **質的な外観情報（B）**: 背は暗青緑〜褐色、腹は白、側線部にうっすら紅色、背部・背鰭・脂鰭・尾鰭に小黒点（頭部背面には無い）、降海期は背鰭先端に白色部を持つ個体あり。 [F-16][F-15]
17. **側線系**: 体幹側線管は1本、頭部側線管8本（Ichthyol. Res. 2021）。飼育世代で神経丘数が約10%減少。外観実装上は「有孔鱗が体側中央に1列」で足りる。 [F-27]

---

## 2. Findings

### F-01
- 主張/値: 青森県のヤマメ（河川型）の性状として、外部形態は **背鰭条数12–13軟条、胸鰭条数12–14軟条、腹鰭条数9軟条、尻(臀)鰭条数12–14軟条、パーマーク8–10個、側線鱗数118–134枚、鰓条骨数11条**。※「11」の部位は要約間で「鰓条骨」「gill raker bones」「branchial spines」と揺れており、鰓条骨(branchiostegal rays)か鰓耙かは要原典確認。
- 適用範囲: ヤマメ（河川型）/ 青森県の河川 / 調査年・n・体長範囲は要約に無し。
- 出典: 青森県産業技術センター（内水面研究所）「サケ、マス保護水面管理事業に伴うサクラマス調査」 https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf （同内容が https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html の検索でも再現）
- 証拠: [A]（公的機関の事業報告。3回の独立クエリで同一数値が再現）「外部形態では背鰭条数12-13軟条、胸鰭条数12-14軟条、腹鰭条数9軟条、尻鰭条数12-14軟条、パールマーク8-10個、側線鱗数118-134枚、鰓条骨数11条」（要約文の言い換え）。要原典確認。

### F-02
- 主張/値: 同報告の内部形態として要約が示した文言は「幽門垂数16-18本、幽門数39-47」。別の要約では「16-18 pyloric caeca and 39-47 gill rakers」。**ラベルが入れ替わっている疑い**（サクラマス系の幽門垂は他資料で35–76、鰓耙は16–26 のため、39–47=幽門垂、16–18=鰓耙と解釈するのが自然だが、これは調査員の推測であり資料の主張ではない）。
- 適用範囲: F-01 と同じ。
- 出典: https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf
- 証拠: [B]（要約のラベル不整合のため A から降格）「内部形態では幽門垂数16-18本、幽門数39-47など」。**そのまま仕様に使用しないこと。**

### F-03
- 主張/値: 青森県旭川(Asahi River)のヤマメ: **背鰭条数12–13、胸鰭条数13–15、腹鰭条数8–9、臀鰭条数11–14**。
- 適用範囲: ヤマメ（河川型）/ 青森県旭川 / n 不明。
- 出典: 青森県産業技術センター「水産上重要な魚類」関連資料 https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html および同報告 https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf（どちらの記述かは要約から特定不能）
- 証拠: [A]「In Aomori Prefecture's Asahi River, Yamame characteristics show dorsal fin rays of 12-13, pectoral fin rays of 13-15, ventral fin rays of 8-9, and anal fin rays of 11-14」（要約）。要原典確認。

### F-04
- 主張/値: ja.wikipedia「サクラマス」の記載として **幽門垂数 40–54、側線上横列鱗数 27–32、体長に対する体高比 23.5–29.9%**。サイズは降海型が最大全長70cm・10kg、河川残留型（ヤマメ）は30cm程度まで。
- 適用範囲: サクラマス（降海型・河川型を含む種群の記述、ヤマメ専用ではない）/ 分母（SL/TL/FL）不明 / 引用元の論文は要約から見えない。
- 出典: https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9 （同数値が複数の検索結果に併記されたいばらき魚顔帳 https://www.pref.ibaraki.jp/nourinsuisan/naisuishi/gyogancho/documents/040_sakuramasu.pdf 等でも提示されたが、記述元の特定不能）
- 証拠: [C]「幽門垂数: 40-54、側線上横列鱗数: 27-32、体長に対する体高比: 23.5-29.9%」（要約）。出典不明のため C。

### F-05
- 主張/値: サツキマス/アマゴ: **側線上横列鱗数 25–34、幽門垂数 32–58、体長に対する体高比 24.8–30.4%**。ビワマスとの比較文では「アマゴ32–58」と再掲。
- 適用範囲: PROXY:アマゴ/サツキマス（O. masou ishikawae）。
- 出典: https://ja.wikipedia.org/wiki/%E3%82%B5%E3%83%84%E3%82%AD%E3%83%9E%E3%82%B9 、https://pedia.3rd-in.co.jp/wiki/%E3%82%B5%E3%83%84%E3%82%AD%E3%83%9E%E3%82%B9 （Wikipedia ミラー）
- 証拠: [C]「scales on the lateral line 25-34, pyloric caeca 32-58, and body depth to body length ratio of 24.8-30.4%」（要約。"scales on the lateral line" は「側線上横列鱗数」の意と解釈、要確認）。

### F-06
- 主張/値: ビワマスと近縁種の比較: **幽門垂 ビワマス46–77／アマゴ32–58、側線上横列鱗 サクラマス27–32／ビワマス21–27**。計測形質（体高比・吻長比・眼径比・体幅比）に差があり、「体長比 3.4–4.3、体高比 3.5–4.5」とも記載（**比の定義が要約に無く、解釈不能。仕様に使用不可**。自然な読みは SL/頭長=3.4–4.3 → 頭長23.3–29.4%SL、SL/体高=3.5–4.5 → 体高22.2–28.6%SL だが、これは算出上の仮の読みである）。
- 適用範囲: PROXY:ビワマス（O. biwaensis）と比較対象のサクラマス・アマゴ。
- 出典: https://ja.wikipedia.org/wiki/%E3%83%93%E3%83%AF%E3%83%9E%E3%82%B9
- 証拠: [C]「幽門垂の数がビワマス46～77、アマゴ32～58、側線上の横列鱗数はサクラマスが27～32枚、ビワマスが21～27枚」（要約）。

### F-07
- 主張/値: **頭長に対する眼径の比**: ビワマス 0.169±0.028、サツキマス 0.134±0.011、サクラマス 0.100±0.013。
- 適用範囲: サクラマス（おそらく大型降海型成魚。**河川型ヤマメの体サイズでは無いと推測されるが、サイズは要約に無い**）/ PROXY:サツキマス・ビワマス。
- 出典: ja.wikipedia ビワマス（要約中の記述）https://ja.wikipedia.org/wiki/%E3%83%93%E3%83%AF%E3%83%9E%E3%82%B9 。原典の論文名は要約に無し。再現クエリ（数値指定）では再現できず。
- 証拠: [C]「頭長に対する眼径の比は0.169±0.028、サツキマスは0.134±0.011、サクラマスは0.100±0.013」（要約）。要原典確認。

### F-08
- 主張/値: Fujioka, Kuwahara, Tabata, Fuke & Nakabo (2025) が **ビワマスを新種 Oncorhynchus biwaensis として記載**。Masu salmon (O. m. masou) および Amago salmon (O. m. ishikawae) と「幽門垂が多く、側線上の横列鱗が少ない」点で区別可能。O. ishikawae はアマゴと同定、O. rhodurus の同一性は異なると結論。形態再記載＋MIG-seq による非交雑個体の確認。数値は要約に無し。
- 適用範囲: ビワマス（PROXY）。ただし同論文は masu salmon・amago の比較データを含むはずで、**ヤマメの計測表の最有力原典候補**。
- 出典: Fujioka Y, Kuwahara M, Tabata R, Fuke Y, Nakabo T. 2025. The Biwa salmon, a new species of Oncorhynchus (Salmonidae) endemic to Lake Biwa, Japan. Ichthyological Research. https://link.springer.com/article/10.1007/s10228-025-01032-z ／ 日本魚類学会 https://www.fish-isj.jp/rename/3718/ ／ 摂南大学プレス https://www.setsunan.ac.jp/upload/news/content/no2512.pdf
- 証拠: [A]「can be easily distinguished from Masu salmon and Amago salmon among the species complex in having more pyloric caeca and fewer transverse scales above the lateral line」（要約）。

### F-09
- 主張/値: ビワマス（O. biwaensis）の **眼径 4.2–6.3%SL（平均5.2%）、吻長 5.5–7.0%SL（平均6.2%）**。
- 適用範囲: PROXY:ビワマス。サイズ不明。
- 出典: 要約は「Oncorhynchus biwaensis」の FishBase ページ https://fishbase.se/summary/71341 と Dorofeeva（Trudy ZIN, 2008）https://www.zin.ru/Journals/trudyzin/eng/publication.html?id=10 を含む結果集合から出力されており、**どちらの記述かは特定不能**。
- 証拠: [C]「For the Biwa salmon, the eye diameter is 4.2-6.3% of SL (5.2% average), and the snout length is 5.5-7.0% of SL (6.2%)」（要約）。

### F-10
- 主張/値: 英語版 Wikipedia 系（animalia.bio, wikiwand 等のミラーを含む結果集合）にある O. masou の記述（ロシア極東系の文献由来と推測されるが要約に原典は無い）:
  - 体高は体長の **28–31%**（「relatively large」）。
  - 側線鱗 **130–240**（※幅が異常に広く、誤記/別の計数基準の疑い）。
  - 鰓耙（要約は "Gill rays are very short, 18–22"）、脊椎骨 **63–66**、幽門垂 **35–76**。
  - 上顎長は雄 **14.9–17.1**、雌 **12.6–13.2% of body length**（雄の単位は要約で欠落）。
  - **眼径は加齢で急減: 幼魚(~200mm)で頭長の20–30%、成魚で約10%**。
  - 体は紡錘形で流線型、やや側扁、細かい鱗に覆われる。成魚の平均全長 50–58cm、2–2.5kg、極東沿海地方で最大 71cm・9kg。成熟個体は背が暗化し体側の斑紋が赤く縁取られ腹部で淡色帯になる。
- 適用範囲: PROXY:O. masou 種全体（主に降海型成魚の記述）。ヤマメ（河川型）の数値ではない。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus_masou 、https://animalia.bio/oncorhynchus-masou 、https://www.wikiwand.com/en/articles/Masu_salmon （どの URL の文かは要約から特定不能）
- 証拠: [C]「The body is relatively large, its height ranging from 28 to 31% of the body length」「eye diameter decreases sharply with age, from 20-30% of head length in juveniles (up to 200 mm) to nearly 10% in adults」（要約）。

### F-11
- 主張/値: Grokipedia（AI生成百科）の O. masou: 側線 **120–140 鱗**、"transverse scale counts 43–56"（※ja.wikipediaの27–32と比較不能、計数法が異なる可能性）、第1鰓弓の鰓耙 **19–26**（短く、太く、滑らかで、間隔が広い）、幽門垂 **35–68**、脊椎骨 **63–69**。幼魚はオリーブ緑〜褐色の背と銀色の体側、側線を横切る楕円形パーマークが典型的に **9–10 個**。体は流線型で鰭は脂鰭あり、円鱗は小さく脱落しやすい。
- 適用範囲: PROXY:O. masou 種全体。
- 出典: https://grokipedia.com/page/Oncorhynchus_masou
- 証拠: [C]（AI生成のため最低信頼）「The lateral line comprises 120-140 scales... Rakers on first gill arch range from 19 to 26, are short, stout, smooth, and widely spaced」（要約）。

### F-12
- 主張/値: 台湾亜種 O. m. formosanus（サラマオマス/タイワンマス）の成魚の比（Wikipedia 記載）: **体長/頭長 4.20、体長/体高 3.48、頭長/吻長 4.41、頭長/眼径 3.43、頭長/眼間幅 4.12**。成魚約30cm、最大57cm、幼魚平均約15cm。濃緑色の体に銀色の腹、体側に **楕円形の暗色斑(パーマーク)9個と、より小さな黒点11–13個**。基鰓骨歯は無い、円鱗、前後の背鰭は明瞭に分離。
  - **調査員による算出（資料の主張ではない）**: 頭長 ≈23.8%、体高 ≈28.7%、吻長 ≈5.4%、眼径 ≈6.9%、眼間幅 ≈5.8%（いずれも「体長」を SL と仮定した%）、眼径/頭長 ≈0.29、吻長/頭長 ≈0.23。
- 適用範囲: **PROXY:O. m. formosanus**（台湾陸封型・成魚約30cm）。体長の定義（SL/TL）は要約に無い。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus
- 証拠: [C]「The ratio of body length to head length in adults is typically 4.20, body length to body height ratio is 3.48, head length to snout length ratio is 4.41, head length to eye diameter ratio is 3.43, and head length to inter orbital width ratio is 4.12」（要約）。

### F-13
- 主張/値: Morphological study of Oncorhynchus spp. in Korea IV（Korean J. Ichthyology, 1993）: シロザケ・マス(masu)・ニジマスを比較し、体高・尾柄高・背鰭長・臀鰭長（対SL）と、吻長・眼径・上顎長・頬部（対頭長）に種間差。**眼径/頭長が韓国産サケ類の新たな分類基準**になりうる。体型・幽門垂・鰓耙の13形質(雌)/11形質(雄)で種間有意差。**masu について、雄は頭長に対する吻長・上顎長の比が雌より大きく、眼径の比は雌より小さい**（性的二形）。
- 適用範囲: **PROXY:韓国産 O. masou（サンチョン）**。降海型か陸封型かは要約に無し。数値は要約に無し。
- 出典: Korean Journal of Ichthyology（1993）https://koreascience.kr/article/JAKO199327236818661.page （巻号表記は検索結果の記載に基づく）
- 証拠: [A]（査読誌、要約に記述が明示）「The ratios of snout length and upper jaw length to head length of males were larger than those of females, whereas eye diameter of males were smaller」（要約）。

### F-14
- 主張/値: Kato (1991)「大型アマゴ・ヤマメの形態及び生態に関する知見」水産増殖 39(3):279–288: 大型のアマゴ・ヤマメでも **体側の朱点の有無と鱗の特徴で種間差が明瞭**。体が大きくなるとパーマークは消える。**降海型に似るが、尾柄高・鰭の大きさ・鱗のパターンに幼魚の特徴を残す**。ヤマメは2+歳以上で約300mmに達し、サクラマスより成長が劣る。大型アマゴは2+–3+歳で300–500mm、2+歳で80%超が成熟。
- 適用範囲: ヤマメ/アマゴ（河川・ダム湖の大型個体、福井県ほか）。
- 出典: 水産増殖 39(3):279-288, 1991. https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ （著者名は要約の記載「Fumio Kato, Fukui Prefecture Koshi High School」。別の検索結果では「ヤマメの鱗の隆起線が頂部で消失/不明瞭」との記述も core.ac.uk に出たが同論文かは不明）
- 証拠: [A]「they retain juvenile characteristics in caudal peduncle height, fin size, and scale patterns compared to anadromous forms」（要約）。

### F-15
- 主張/値: 自治体・研究機関・図鑑の定性記述（B）:
  - 河川型ヤマメは体側に小判型のパーマークが並び成魚にも残る、**朱点は無い**（アマゴと区別）。最大 約30cm（東京都/神奈川県）、降海型・湖沼型は銀白色でパーマークが消え最大70cm前後（東京都）。NIES は降海60cm・陸封30cm。ja.wikipedia ヤマメは全長40cmまで。
  - 陸封個体は**体側にパーマーク、側線部にうっすら紅をはく**（NIES）。腹は白、背には黒斑が多い（fishai）。パーマークは成長とともに薄くなる。
  - パーマークの色: 「紫黒色・赤紫色」（島根県）、「青色」（神奈川県/ja.wikipedia）→ 矛盾は §3。
  - アマゴは体側に **7–11個の青色パーマーク** と朱点（東京都）。
  - 河川型の分布は神奈川県酒匂川以北の本州太平洋側、日本海全域、北海道、九州ほか（島根県）。
  - 釣り情報(C): 目の周りに数個の黒点があるのはヤマメとアマゴに固有、との記述あり（未検証）。
- 適用範囲: ヤマメ（河川型）/ 日本各地。
- 出典: 東京都島しょ農林水産総合センター https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html ／ 神奈川県 https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ NIES https://www.nies.go.jp/biodiversity/invasive/DB/detail/50830.html ／ 島根県 https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html ／ fishai https://fishai.jp/815 ／ ja.wikipedia https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ／ 釣りサイト https://www.honda.co.jp/fishing/picture-book/yamame/ , https://tsurihack.com/881
- 証拠: [B]「体側には小判型のパーマークが並び、成魚にも同じように見られます。アマゴと異なり朱点はありません」（神奈川県要約）／ [B]「陸封個体は体側に…黒いパーマークが並び、側線部にはうっすらと紅をはいている」（NIES要約）。

### F-16
- 主張/値: 北海道立総合研究機構(HRO)の魚類解説（サクラマス）: 降海型は背が暗青〜暗緑、体側が銀白色、腹が白色。**頭部を除く背部と背鰭・脂鰭・尾鰭に黒点**があり、頭部背面には黒点が無い。体形は比較的細長いが、**稀に体高の著しく高い個体「イタマス」**がいる。降海期には体側が銀白色になりパーマークが見えにくくなり、**背鰭先端に白色部を持つものがある**。ヤマメ(本州以南)は北海道ではヤマベ。
- 適用範囲: サクラマス（降海型中心）。背鰭先端の白色部・黒点分布は河川型にも通じる可能性があるが要確認。
- 出典: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 証拠: [B]「体形は比較的細長いが、まれに『イタマス』と呼ばれる体高の著しく高い個体もあります」（要約）。

### F-17
- 主張/値: 産卵期（9–10月）に遡上・成熟した雄は全体が黒ずみ、**桜色の不規則な雲状斑の婚姻色**、**吻が伸びて下に曲がり、両顎の歯が強大化**。雌も婚姻色を示すが雄ほど顕著でない。河川残留型は産卵後も死なず繰り返し産卵。婚姻色は「薄い桃色から濃い紅色まで体側からヒレなどに不定形に現れる」。
- 適用範囲: ヤマメ/サクラマス（降海型の記述が混在。河川型ヤマメの吻の変形の程度は未確認）。
- 出典: ja.wikipedia ヤマメ https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ほか（検索結果集合に島根県・HRO等を含み、どの文かは特定不能）
- 証拠: [C]「繁殖期になると、体全体が黒っぽくなり、薄い桃色から濃い紅色までの婚姻色が体側からヒレなどに不定形に表れます」（要約）。

### F-18
- 主張/値: 神奈川県の試験研究では、**酒匂川水系の在来「丹沢ヤマメ」は外部形態がパーマークや小黒点が多い、少数の朱点が入るなど、沢によって異なる**。mtDNAのハプロタイプも複数出現。東京都は外部形態（パーマークの数・形状・朱点）の解析を実施。
- 適用範囲: ヤマメ（河川型）/ 神奈川県酒匂川水系（分布の南限域）。朱点が少数入るヤマメが存在しうる点は、PHASE7 個体差の幅に直結。
- 出典: https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html 、https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html （どちらの文かは要約から特定不能）
- 証拠: [B]「外部形態はパーマークや小黒点が多い、少数の朱点が入る、その沢によって異なる特徴があり」（要約）。

### F-19
- 主張/値: 三重県三国谷のイワメとアマゴの形態比較（森・名越 1986, 三重大学水産学部研究報告 13:135–143）: イワメ（体側模様を欠く型）とアマゴの間に成長・体サイズ・摂餌・性比・肥満度などの基本的差は無く、**本質的な差は体側模様のみ**。→ 模様は体型と独立に大きく変異しうる。
- 適用範囲: PROXY:アマゴ（イワメ型）。
- 出典: 森誠一・名越誠. 1986. 三重県三国谷のイワメとアマゴにおける形態比較. 三重大学水産学部研究報告 13:135-143. https://cir.nii.ac.jp/crid/1050001202938999296 ／ https://mie-u.repo.nii.ac.jp/records/5636
- 証拠: [A]（書誌と要旨が要約に明示）「no significant differences in fundamental ecological characteristics ... suggesting that the only essential difference between them is their side patterns」（要約）。

### F-20
- 主張/値: 埼玉県の研究: 放流魚（養殖魚）は天然魚に比べ **色彩が薄く体型が丸い**、**鰭が欠けている/色がくすむ**傾向。1991年度は10月放流魚が体色・体型とも天然魚に近く、12月放流魚は体色のみ近い。1992年度は9・10月放流魚で体色が近い。
- 適用範囲: ヤマメ（成魚放流・埼玉県）。
- 出典: https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html
- 証拠: [B]「放流魚（養殖魚）は天然魚に比較して、色彩も薄く、体型も丸いなど」（要約）。

### F-21
- 主張/値: 飼育 vs 野生のギンザケ成魚の幾何学的形態測定: 飼育魚は**性的二形が大きく減少、頭が小さく吻の曲がりが弱い、体幹が深い、尾柄が大きい、背鰭が短い、後体部が大きく、流線型が低下**。孵化場に水流が無いことが形態変異の主因と指摘。
- 適用範囲: **PROXY:Oncorhynchus kisutch**（ギンザケ）成魚。ヤマメでの検証は無い。個体差/飼育由来バリエーション設計の方向性としてのみ利用可。
- 出典: Evidence for Morphometric Differentiation of Wild and Captively Reared Adult Coho Salmon: A Geometric Analysis. Environ. Biol. Fishes（Springer）https://link.springer.com/article/10.1023/A:1007646332666 （著者・年は要約に無し）
- 証拠: [A]（査読論文、要約に記述明示）「Captively reared coho salmon adults were differentiated from wild fish by sharply reduced sexual dimorphism, smaller heads and less hooked snouts, increased trunk depth, larger caudal peduncles, shorter dorsal fins」（要約）。

### F-22
- 主張/値: 網走川水系（北海道東部）のマス(O. masou)の体長–体重関係 **W = a·FL^b, a=0.0106 (95%CI 0.0103–0.0109), b=3.0397 (3.0245–3.0550), n=8,208, FL 1.9–21.9cm, W 0.1–161.5g, R²=0.949**。10種同時報告で b は 2.790–3.294。
  - **算出（調査員）**: FL 5/10/15/20/21.9 cm → W ≈ 1.4/11.6/39.8/95.5/125.9 g。K=W×100/FL³ ≈ 1.13/1.16/1.18/1.19/1.20（式の有効範囲内の内挿）。
- 適用範囲: マス(O. masou)・北海道網走川水系・2007年6月–2011年11月・冬期除く月1回採集。**河川型/降海型・性別・季節別の内訳は要約に無し**（FL 21.9cm 以下のため幼魚・小型陸封魚が主体と推測されるが資料の主張ではない）。
- 出典: Yamamoto, Tabata, Fukushige, Inoue, Furutsu, Hiroya, Kanaiwa. 2022. Length–weight relations of ten freshwater fish species (Actinopterygii) from Abashiri River basin, eastern Hokkaido, Japan. Acta Ichthyologica et Piscatoria 52(2):95–99. https://doaj.org/article/8d2b35fbe13d423ca657816a19b8f533 ／ https://aiep.pensoft.net/article_preview.php?id=81301
- 証拠: [A]（査読論文）「a = 0.0106 (95% CI: 0.0103–0.0109), b = 3.0397 (95% CI: 3.0245–3.0550), n = 8,208, fork length 1.9–21.9 cm」（要約）。**注意**: 係数を含む問い合わせ文で再検索した際は「係数は抜粋に表示されない」と返答されており、再現性に疑義。要原典確認。

### F-23
- 主張/値: FishBase の O. masou（種全体）: **最大 79.0cm TL（雄/不明）、最大公表体重 10.0kg**。FWS の生態リスク評価も同数値を引用。ベイズ推定の体長–体重（TL基準）: **a=0.00955 (0.00608–0.01500), b=3.03 (2.90–3.16)**。アマゴ(O. rhodurus 名義) 最大 44.2cm TL。FishBase 記載「河川型は源流域に生息し縄張りを持つことが多い」。
- 適用範囲: O. masou 種全体（主に降海型の極値）。ヤマメの典型値ではない。
- 出典: https://www.fishbase.se/summary/Oncorhynchus-masou.html 、https://fishbase.se/summary/242 、https://www.fishbase.se/summary/Oncorhynchus-rhodurus.html 、https://www.fws.gov/sites/default/files/documents/Ecological-Risk-Screening-Summary-Cherry-Salmon.pdf
- 証拠: [B]「maximum length is 79.0 cm TL for male/unsexed, and the maximum published weight is 10.0 kg」（要約）。ベイズ推定値の帰属ページは要約から特定不能（C相当の可能性）。

### F-24
- 主張/値: 年齢別体長の例: 「天然ヤマメ1尾の鱗解析」で **0+歳 FL 14.1cm、1+歳 19.4cm、2+歳 23.2cm、3+歳 28.2cm**。別記述: 0+歳12月の平均体長 10.13cm（一部12cmでスモルト化完了）。放流後翌年3月に尾叉長13cm超を採捕対象。河川内の大型ヤマメは2+歳以上で約300mm（F-14）。
- 適用範囲: ヤマメ（河川型）/ **河川名・n・分母の定義が要約に無く、1個体例の可能性**（「a wild Yamame specimen」と表現）。
- 出典: 検索結果集合に含まれた自治体PDF（候補: https://www.aomori-itc.or.jp/_files/00229142/247-249.pdf ほか岩手・神奈川・宮崎・岐阜・群馬の報告書）。**どの文書かは特定不能**。
- 証拠: [C]（出典未特定）「0+ years (age 0) at 14.1 cm fork length, 1+ years at 19.4 cm, 2+ years at 23.2 cm, and 3+ years at 28.2 cm」（要約）。

### F-25
- 主張/値: マス(O. masou)のスモルト化は体サイズ駆動: **FL 12cm 超の幼魚のみ**が年間を通じてエラ Na+/K+-ATPase 活性を上昇。夏（光周期制限・サイズ駆動）と春（サイズ制限・光周期駆動）の2段階。光周期操作で**肥満度の低下と体の銀化**が通常（5月）より3か月早く起きた。肥満度は K=W×100/FL³ で算出。
- 適用範囲: マス(O. masou)の飼育系統（日本）。河川型ヤマメの体型への直接数値は無し。
- 出典: Size-driven parr-smolt transformation in masu salmon (Oncorhynchus masou). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ （肥満度式の帰属は PMC10547828 か Ogura et al. 2024 J. Fish Biol. https://doi.org/10.1111/jfb.15631 のどちらか）
- 証拠: [A]「An L_F of 12 cm is the threshold size above which juvenile O. masou increase gill NKA activity」「reduction in condition factor and body silvering」（要約）。

### F-26
- 主張/値: サクラマス幼魚の発育段階（北海道さけ・ますふ化場研究報告28号 久保達郎 の可能性）: **幼魚初期(5–7月)体長40–60mm、中期(7–9月)平均60–80mm、後期(9月後半–10月末)に相分化が明瞭**。夏末に7–12cm（NASREC ニュース）。降海型幼魚の体側には大型で小判形の暗青色パーマークが数個以上並ぶ。
- 適用範囲: サクラマス幼魚（北海道）。
- 出典: 候補 http://salmon.fra.affrc.go.jp/kankobutu/srhsh/data/srhsh245.pdf 、https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf （どちらの文かは要約から特定不能）
- 証拠: [C]（出典特定不能）「幼魚初期は5月から7月にかけて体長40-60mm、幼魚中期は7月から9月にかけて平均体長60-80mm」（要約）。

### F-27
- 主張/値: O. m. masou の側線系: **頭部側線管8本（supraorbital, infraorbital, otic, preopercular, mandibular, postotic, supratemporal, temporal）＋体幹側線管1本、表在神経丘グループ9**。preinfraorbital 表在神経丘群を持ち、infraorbital / mandibular / opercular 表在神経丘群を欠く。飼育繁殖世代では**総神経丘数が野生・F1より約10%少ない**（頭部・体幹とも）。
- 適用範囲: ヤマメ/マス（日本産O. m. masou）。
- 出典: The lateral line system and its innervation in the masu salmon Oncorhynchus masou masou (Salmonidae). Ichthyological Research, 2021. https://link.springer.com/article/10.1007/s10228-021-00843-0 ／ Nakae, Hasegawa, Miyamoto 2022, Sci. Rep. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9537280/
- 証拠: [A]「8 cephalic canals ... 1 trunk canal and 9 superficial neuromast groups」（要約）。

### F-28
- 主張/値: 歯の配置（属レベル）: **Salmo と Oncorhynchus では鋤骨が平坦（舟形でない）で、歯が鋤骨全体に二列/ジグザグ状に並ぶ。Salvelinus(イワナ属)は舟形の鋤骨の前端に歯が限られる**。成魚の Oncorhynchus では鋤骨歯と口蓋骨歯の間隔が広い（Salmo は狭い）。台湾亜種の記載では基鰓骨歯は無い。「歯条褶の形: Oncorhynchus=十字(+)、Salmo=T、Salvelinus=M」との要約記述も出たが原典不明で**未検証**。
- 適用範囲: PROXY:サケ科属レベル。ヤマメ固有の歯列記載は取得できず。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus 、https://en.wikipedia.org/wiki/Salvelinus 、https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus （検索結果集合。帰属不確実）
- 証拠: [C]「In the former two genera the teeth form a double or zigzag series over the whole of the vomer bone, which is flat and not boat-shaped」（要約）。

### F-29
- 主張/値（PROXY, FishBase の他種Oncorhynchus）: 背鰭軟条/臀鰭軟条/脊椎骨数 — ギンザケ 9–13/12–17/61–69、キングサーモン 10–14/13–19/67–75、シロザケ 10–14/13–17/59–71、ベニザケ 11–16/13–18/56–67、ニジマス 14–16/6–12/60–66。**O. masou の FishBase 値は検索で取得できず**（ページ自体は存在: fishbase.se/summary/242）。
- 適用範囲: PROXY: O. kisutch, O. tshawytscha, O. keta, O. nerka, O. mykiss。ヤマメの値として使用不可。比較の目安のみ。
- 出典: https://www.fishbase.se/summary/Oncorhynchus-kisutch.html 、https://fishbase.se/summary/241 、https://www.fishbase.se/summary/oncorhynchus-nerka.html 、https://fishbase.se/summary/Oncorhynchus-tshawytscha 、https://www.fishbase.se/summary/oncorhynchus-mykiss.html
- 証拠: [B]「O. kisutch: 9-13 dorsal soft rays, 12-17 anal soft rays, 61-69 vertebrae」等（要約）。

### F-30
- 主張/値: 分類・学名: ja.wikipedia 等は、ホロタイプの検討から **O. m. masou=降海型サクラマスと陸封型ヤマメ、O. m. ishikawae=アマゴ・サツキマス、O. masou subsp.=ビワマス**と整理（Kimura 1990 に言及）。FishBase はアマゴを O. rhodurus 名義で掲載、ビワマスは 2025 年に O. biwaensis として新種記載（F-08）。
- 適用範囲: 命名・分類。
- 出典: https://en.wikipedia.org/wiki/Biwa_trout 、https://link.springer.com/article/10.1007/s10228-025-01032-z 、https://www.fishbase.se/summary/Oncorhynchus-rhodurus.html
- 証拠: [B]「O. masou masou applies to the anadromous masu salmon and land-locked Yamame, O. masou ishikawai applies to the Amago and sea-run Satsuki salmon」（要約、帰属先 URL 不確実）。

### F-31
- 主張/値: サケ科幼魚→スモルトの一般則: 渓流の幼魚(parr)は体が deep-bodied でパーマークが顕著、スモルトはパーマークを失い銀化し**より細身(slender)**。マスでは Kubo が体形・大きさ・背鰭の黒色素・銀化・行動などから**少なくとも5型以上のパーマー(parr)型**を認めた（表現型多型）。マスのスモルトは平均 FL 110–130mm。
- 適用範囲: サケ科一般（大西洋サケ文献を含む結果集合）＋マス（Kubo）。**引用元は Mighell 1978(NOAA) / McCormick らの文献が混在し、特定不能**。
- 出典: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ （近傍）、結果集合に含まれた https://www.webapps.nwfsc.noaa.gov/assets/26/6745_06272011_103138_Mighell.1978-rev.pdf
- 証拠: [C]「Stream-dwelling juveniles are deep-bodied and have prominent parr marks, while smolts ... a more slender body form」「Kubo ... recognizing at least five or more types of parr」（要約）。

### F-32
- 主張/値（形態以外・行動ストリーム向けの副次情報）: ヤマメは流速10–35cm/s、粒径0.5–5.0cmの礫底の渓流環境に生息（環境省資料）。アマゴは流速15cm/s・水深10–30cm。夏期最高水温25℃以下の渓流（島根県）。
- 適用範囲: ヤマメ（河川型）。**r01 の担当外だが、行動・環境ストリームの手がかりとして記録**。
- 出典: https://www.env.go.jp/council/09water/y0910-03/mat03.pdf 、https://www.env.go.jp/info/iken/h180317a/a-2.pdf 、https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html
- 証拠: [B]「Yamame ... inhabits stream valleys at flow velocities of 10-35 cm/s in gravel beds with pebbles of 0.5-5.0 cm diameter」（要約）。

### F-33（調査員の記憶・未検証）
- 主張/値: 以下は資料で確認できていない一般知識。**仕様に使う前に必ず裏取りすること**。
  1. サケ属の成魚では上顎骨後端が眼の後縁を越える（雄で顕著）傾向がある。
  2. 尾鰭は浅い二叉で、幼魚の方が切れ込みが深く、成魚で浅くなる傾向。
  3. 脂鰭が背鰭の後方・尾柄寄りにある（位置の数値は記憶でも確証が無いため記載しない）。
  4. 側線上横列鱗数は「背鰭起部から側線までの斜めの鱗列数」の意。
- 適用範囲: サケ科一般の記憶。
- 出典: なし（記憶）。
- 証拠: [M] 未検証。数値化せず。

---

## 3. 資料間の矛盾・不一致

1. **側線有孔鱗数**: 青森ヤマメ 118–134（F-01, 実測報告）／AI百科 120–140（F-11）／ロシア系記述 130–240（F-10）。後者は範囲が異常に広く外れ値の疑い。種・地域・計数法（有孔鱗のみか全鱗列か）の違いも未確認。
2. **幽門垂数**: ja.wikipedia 40–54（F-04）／AI百科 35–68（F-11）／ロシア系 35–76（F-10）／青森報告の要約 39–47 または 16–18（ラベル不整合, F-02）／アマゴ32–58（F-05）／ビワマス46–77（F-06）。降海型・河川型・地域差か、計数法差か、特定できない。
3. **鰓耙数**: AI百科 19–26 ／ ロシア系 18–22 ／ 青森（疑い）16–18。第1鰓弓のみか全鰓弓かが要約に無い。
4. **脊椎骨数**: 63–66（ロシア系）／ 63–69（AI百科）。
5. **体高/体長**: 23.5–29.9%（ja.wikipedia サクラマス・ヤマメ）／ 28–31%（ロシア系 relatively large）／ 台湾亜種成魚の算出約28.7%（F-12）／ アマゴ 24.8–30.4%。同一種内の個体・サイズ・地域・分母（SL/TL/FL）の差の可能性。北海道の「イタマス」のような深体個体も実在（F-16）。
6. **背・臀鰭条数**: 青森ヤマメ 背12–13・臀12–14（F-01）に対し、一般サイトの要約は「dorsal soft rays 13–18, anal soft rays 14–18, branchiostegal 11–15」（https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/ 、https://allfishes.org/fishes/marine/masu-salmon を含む結果集合）。後者は C で帰属不明、Oncorhynchus 属一般の記述の混入の可能性が高く、**ヤマメの値としては F-01 を優先**。
7. **パーマーク数/色**: 青森ヤマメ 8–10／AI百科 9–10／台湾亜種 9（+小黒点11–13）／アマゴ 7–11（東京都）／別資料「アマゴ約10」。色は「紫黒色・赤紫色」（島根県）と「青色」（神奈川県・ja.wikipedia・東京都のアマゴ）が併存 → 暗い青紫として表現されるか、個体/光条件/保存状態/地域で見え方が異なる可能性。
8. **最大サイズ**: 河川型ヤマメ 約30cm（東京都・神奈川県・NIES）／35cm（複数サイト）／40cm（ja.wikipedia）／大型河川個体 約300mm@2+（Kato 1991）／ダム湖・湖沼型は50cm超（東京都・奥多摩湖）。種全体の最大 79.0cm TL・10kg（FishBase）は降海型の極値。
9. **年齢別体長**: 0+歳 FL 14.1cm（1個体例, F-24）／0+歳12月平均 10.13cm（別資料）。河川・水温・放流群で異なる。
10. **眼径比**: 幼魚20–30%HL → 成魚約10%HL（F-10）／ サクラマス0.100（F-07）／ 台湾亜種成魚約0.29（F-12）／ ビワマス0.169。サイズ・型により桁違いに変わるため、単一の比で固定できない。
11. **側線上横列鱗数**: ja.wikipedia 27–32（サクラマス）と AI百科の "transverse scale counts 43–56" は計数基準が異なる可能性（43–56 は別基準の可能性、未確認）。
12. **分類の揺れ**: アマゴ/サツキマスの学名 O. masou ishikawae（日本魚類学会/Fujioka 2025）と O. rhodurus（FishBase）。ビワマスは O. m. rhodurus → O. biwaensis (2025)。
13. **検索要約の再現性**: 同一数値でも言い換えクエリで再現できないケース（F-22, F-07）が観測された。要約を鵜呑みにせず原典確認を前提とする。

---

## 4. 見つからなかったこと（Gaps）

**3Dモデル仕様に直接必要だが、本調査の検索要約では確認できなかった事項**

1. 河川型ヤマメの **頭長・吻長・眼径・上顎長（対SL, サイズ別）** の実測値。（台湾亜種の算出値と、種群全体の眼径/頭長しか無い）
2. **尾柄高/SL、体幅/体高（横断面形）、体幅/SL**、背から尾柄への断面変化に関する記述。
3. **背鰭前長・腹鰭前長・臀鰭前長・脂鰭前長（対SL）**、胸鰭長・腹鰭長、背鰭/臀鰭の基底長と高さ、脂鰭の大きさ。
4. **尾鰭の切れ込みの深さ**（尾叉長/標準体長・尾鰭上下葉長）の数値。
5. **上顎後端と眼の位置関係（口裂）**、吻の形状（背面/側面観）、下顎先端の位置、成魚の雄の鉤顎(kype)の発達度。
6. **標準体長–尾叉長–全長の換算**（ヤマメ）。
7. **肥満度の標準値**（ヤマメ天然魚・季節別）と、W=aL^b の河川型成魚（FL>22cm）の係数。
8. **鱗**: 鱗サイズ（mm）、鱗列の配置（斜列の角度）、鱗の成長輪、側線鱗の大きさ・位置の記述。
9. **歯列**: ヤマメ固有の歯の配置（顎骨・鋤骨・口蓋骨・舌）。
10. **雌雄差**: 河川型ヤマメでの定量データ（韓国産マスの定性的な結果のみ）。
11. **成長段階による形態変化**: 幼魚(parr)〜成魚の体高比・頭長比・眼径比の変化を示す連続データ（スモルト化時の細身化は定性記述のみ）。
12. **FishBase O. masou の Morphology/Meristic 欄**（背鰭軟条・臀鰭軟条・脊椎骨）は要約に出ず。直接閲覧が必要: https://www.fishbase.se/summary/Oncorhynchus-masou.html 。
13. **ニジマス・ブラウントラウト・イワナとの形態識別点**（尾鰭の形状、黒点の分布、脂鰭の縁など）は断片的で、仕様にできる情報が無い。
14. 写真・動画から得られる実寸比は本ストリームの範囲外だが、上記の欠落（特に1–5）は**写真ストリームの計測で補完**するのが現実的。

**原典確認の最有力リード（URLは検索結果に出たもの。全文は未読）**
- Fujioka et al. 2025（ビワマス新種記載; masu salmon/amago の計数・計測表を含むと推測）https://link.springer.com/article/10.1007/s10228-025-01032-z
- 青森県産業技術センター 事業報告（F-01/F-03/F-02 の原典）https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf , https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf
- Kato 1991（水産増殖 39(3):279）https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/
- Korean J. Ichthyol. IV（吻長・上顎長・眼径の対頭長比表）https://koreascience.kr/article/JAKO199327236818661.page
- 神奈川県立生命の星・地球博物館 調査報告32号 115–122（ヤマメの計測項目: TL, SL, 頭長, 吻長, 眼径, 体高, 体幅）https://nh.kanagawa-museum.jp/assets/icp/pdf/nhr32_115-122_kaneko_s.pdf ／ https://www.pref.kanagawa.jp/uploaded/attachment/10225.pdf
- 三重大学 森・名越 1986 全文 https://mie-u.repo.nii.ac.jp/record/5636/files/AN0023428X0001305.pdf
- Dorofeeva 2008（Trudy ZIN; ビワマスとサケ属湖沼型の形態）https://www.zin.ru/Journals/trudyzin/eng/publication.html?id=10
- Kato 1991 in Groot & Margolis, Pacific Salmon Life Histories, pp.449–520（書籍; マス/アマゴの形態・生活史の標準的総説）
- Nakabo (ed.) Fishes of Japan with Pictorial Keys（各種の meristic characters を掲載）
- 久保達郎 北海道さけ・ますふ化場研究報告 28号（相分化と変態）http://salmon.fra.affrc.go.jp/kankobutu/srhsh/data/srhsh245.pdf
- 東京都島しょ農林水産総合センター資料（体長比の問い合わせで反復ヒット、内容は未確認）https://www.ifarc.metro.tokyo.lg.jp/archive/resources/content/3355/20130904-164155.pdf
- 石田力三「講座 ヤマメ」（反復ヒット、内容は未確認）https://www.jstage.jst.go.jp/article/cookeryscience1968/13/1/13_27/_pdf/-char/ja
- ブラウントラウト幼魚の流れと体形（PROXY: Salmo trutta）https://pmc.ncbi.nlm.nih.gov/articles/PMC6174970/

---

## 5. 出典一覧（URL付き・重複排除）

**公的機関・自治体・研究機関**
1. https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf — 青森県産業技術センター サクラマス調査報告（F-01,02）
2. https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf — 同 河川保護水面調査（F-03）
3. https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html — 水産上重要な魚類（F-01,03）
4. https://www.aomori-itc.or.jp/soshiki/suisan_naisuimen/naisuimen/sakuramasu.html — 青森県 サクラマス解説
5. https://www.aomori-itc.or.jp/_files/00229142/247-249.pdf — 候補（F-24）
6. https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf — HRO サクラマス（F-16）
7. https://www.ifarc.metro.tokyo.lg.jp/archive/27,926,55,225.html — 東京都 ヤマメ（F-15,18）
8. https://www.ifarc.metro.tokyo.lg.jp/archive/resources/content/3355/20130904-164155.pdf — 東京都（リード）
9. https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html — 神奈川県 ヤマメ（F-15,18）
10. https://www.pref.kanagawa.jp/uploaded/attachment/10225.pdf — 神奈川県（リード）
11. https://nh.kanagawa-museum.jp/assets/icp/pdf/nhr32_115-122_kaneko_s.pdf — 神奈川県立博物館（リード）
12. https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html — 島根県（F-15,32）
13. https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html — 埼玉県（F-20）
14. https://www.pref.ibaraki.jp/nourinsuisan/naisuishi/gyogancho/documents/040_sakuramasu.pdf — いばらき魚顔帳（F-04）
15. https://www.nies.go.jp/biodiversity/invasive/DB/detail/50830.html — 国立環境研究所（F-15）
16. https://www.env.go.jp/council/09water/y0910-03/mat03.pdf — 環境省（F-32）
17. https://www.env.go.jp/info/iken/h180317a/a-2.pdf — 環境省（F-32）
18. http://salmon.fra.affrc.go.jp/kankobutu/srhsh/data/srhsh245.pdf — 久保達郎（F-26 候補）
19. https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf — さけ・ます資源管理センターニュース No.8（F-26）
20. https://www.fws.gov/sites/default/files/documents/Ecological-Risk-Screening-Summary-Cherry-Salmon.pdf — US FWS（F-23）

**学術論文・学術データベース**
21. https://link.springer.com/article/10.1007/s10228-025-01032-z — Fujioka et al. 2025（F-08）
22. https://www.fish-isj.jp/rename/3718/ — 日本魚類学会（F-08）
23. https://www.setsunan.ac.jp/upload/news/content/no2512.pdf — 摂南大学プレスリリース（F-08）
24. https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ — Kato 1991（F-14）
25. https://koreascience.kr/article/JAKO199327236818661.page — Korean J. Ichthyol.（F-13）
26. https://doaj.org/article/8d2b35fbe13d423ca657816a19b8f533 — Yamamoto et al. 2022（F-22）
27. https://aiep.pensoft.net/article_preview.php?id=81301 — 同（F-22）
28. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ — Size-driven parr-smolt（F-25）
29. https://doi.org/10.1111/jfb.15631 — Ogura et al. 2024 J. Fish Biol.（F-25 候補）
30. https://link.springer.com/article/10.1007/s10228-021-00843-0 — 側線系（F-27）
31. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9537280/ — 飼育による神経丘減少（F-27）
32. https://link.springer.com/article/10.1023/A:1007646332666 — ギンザケ形態（F-21, PROXY）
33. https://cir.nii.ac.jp/crid/1050001202938999296 — 森・名越 1986（F-19）
34. https://mie-u.repo.nii.ac.jp/records/5636 — 同リポジトリ（F-19）
35. https://mie-u.repo.nii.ac.jp/record/5636/files/AN0023428X0001305.pdf — 同全文（リード）
36. https://www.zin.ru/Journals/trudyzin/eng/publication.html?id=10 — Dorofeeva 2008（F-09 候補）
37. https://pmc.ncbi.nlm.nih.gov/articles/PMC6174970/ — ブラウントラウト幼魚の体形（PROXY, リード）
38. https://www.jstage.jst.go.jp/article/cookeryscience1968/13/1/13_27/_pdf/-char/ja — 石田力三 講座ヤマメ（リード）
39. https://www.webapps.nwfsc.noaa.gov/assets/26/6745_06272011_103138_Mighell.1978-rev.pdf — Mighell 1978（F-31 候補）

**データベース・百科・図鑑**
40. https://www.fishbase.se/summary/Oncorhynchus-masou.html — FishBase O. masou（F-23）
41. https://fishbase.se/summary/242 — 同（F-23）
42. https://www.fishbase.se/summary/Oncorhynchus-rhodurus.html — FishBase O. rhodurus（F-23,30）
43. https://www.fishbase.se/summary/Oncorhynchus-kisutch.html（F-29）
44. https://fishbase.se/summary/241（F-29）
45. https://www.fishbase.se/summary/oncorhynchus-nerka.html（F-29）
46. https://fishbase.se/summary/Oncorhynchus-tshawytscha（F-29）
47. https://www.fishbase.se/summary/oncorhynchus-mykiss.html（F-29）
48. https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9 — サクラマス（F-04）
49. https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 — ヤマメ（F-15,17）
50. https://ja.wikipedia.org/wiki/%E3%83%93%E3%83%AF%E3%83%9E%E3%82%B9 — ビワマス（F-06,07）
51. https://ja.wikipedia.org/wiki/%E3%82%B5%E3%83%84%E3%82%AD%E3%83%9E%E3%82%B9 — サツキマス（F-05）
52. https://pedia.3rd-in.co.jp/wiki/%E3%82%B5%E3%83%84%E3%82%AD%E3%83%9E%E3%82%B9 — ミラー（F-05）
53. https://en.wikipedia.org/wiki/Oncorhynchus_masou（F-10）
54. https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus（F-12）
55. https://en.wikipedia.org/wiki/Biwa_trout（F-30）
56. https://en.wikipedia.org/wiki/Oncorhynchus ／ https://en.wikipedia.org/wiki/Salvelinus（F-28）
57. https://animalia.bio/oncorhynchus-masou（F-10）
58. https://www.wikiwand.com/en/articles/Masu_salmon（F-10）
59. https://grokipedia.com/page/Oncorhynchus_masou（F-11）
60. https://fishai.jp/815 — 写真から探せる魚図鑑（F-15）
61. https://www.honda.co.jp/fishing/picture-book/yamame/（F-15, C）
62. https://tsurihack.com/881（F-15, C）
63. https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/（§3-6, C）
64. https://allfishes.org/fishes/marine/masu-salmon（§3-6, C）
65. https://fishbase.se/summary/71341 — FishBase O. biwaensis（F-09 候補）

（URL 総数: 66。#56 は en.wikipedia の Oncorhynchus と Salvelinus の2件をまとめて記載。）

---

## 6. 検索ログ

凡例: [std]=standard, [ext]=extended。「有用」= 仕様に使える数値/記述が要約に明示された度合い（0=無し, 1=部分, 2=複数）。WebFetch は1回（aomori-itc.or.jp）で EGRESS_BLOCKED を確認し、以後使用せず。総 WebSearch 呼び出し 108 回（一部は内部で複数の再検索に展開された）。

| # | クエリ（要旨） | モード | 有用 |
|---|---|---|---|
| 1 | ヤマメ 形態 体高 体長比 標準体長 | std | 0 |
| 2 | サクラマス ヤマメ 形態 比較 側線鱗数 幽門垂数 鰓耙数 | std | 1 |
| 3 | サケ科 計数形質 ヤマメ アマゴ 比較 | std | 0 |
| 4 | ヤマメ 脊椎骨数 | std | 0 |
| 5 | ヤマメ 尾柄高 眼径 頭長 体長比 測定 | std | 0（リード） |
| 6 | 日本産魚類検索 サケ科 ヤマメ 特徴 鰭条数 | std | 0 |
| 7 | ヤマメ 体長体重関係 肥満度 係数 | std | 0 |
| 8 | ヤマメ O. masou masou 形態 臀鰭 パーマーク 側線鱗 鰓耙 幽門垂 | ext | 1 |
| 9 | O. masou masou morphology meristic characters | ext | 1 |
| 10 | ヤマメ 上顎後端 眼 位置 口裂 | std | 0 |
| 11 | O. masou fishbase morphology | std | 0 |
| 12 | O. masou "Dorsal soft rays" fishbase.se | std | 0 |
| 13 | Meristic and morphometric variations fluvial Japanese charr | std | 0（イワナ） |
| 14 | 三重県美杉 イワメ アマゴ 形態比較 | std | 1 |
| 15 | 神奈川県 淡水魚類図鑑 ヤマメ | std | 1 |
| 16 | ヤマメ 体型 比較 計測形質 野生 放流 養殖（J-STAGE等） | ext | 1 |
| 17 | アマゴ サツキマス ヤマメ サクラマス 識別 朱点 計数形質 | ext | 1 |
| 18 | masu salmon morphometrics body depth head length %SL | ext | 2 |
| 19 | O. masou ishikawae amago description | std | 0 |
| 20 | Kato 1991 Life histories masu amago | std | 0 |
| 21 | サクラマス 形態 幽門垂 鰓耙 側線鱗 Wikipedia | std | 2 |
| 22 | 大型アマゴ・ヤマメの形態及び生態に関する知見 | std | 1 |
| 23 | ヤマメ 年齢 体長 成長 尾叉長 | std | 1 |
| 24 | サクラマス 体高 23.5 29.9 幽門垂 40-54 | std | 0 |
| 25 | サクラマス群 salmoneel 特徴 | std | 1 |
| 26 | ヤマメ 図鑑 特徴 吻 口 上顎 パーマーク 尾鰭 | std | 0 |
| 27 | アマゴ 計数形質 jstage/cir.nii/岐阜/三重 | ext | 0 |
| 28 | O. masou description (wikipedia/animalia/fishbase) | std | 1 |
| 29 | O. m. formosanus morphology ratios | std | 2 |
| 30 | masu salmon Sakhalin Primorye description scales GR PC | ext | 2 |
| 31 | lateral line system masu salmon | std | 1 |
| 32 | 北海道 サクラマス 形態 背は暗青緑色（hro.or.jp） | std | 1 |
| 33 | Estimation of heritability ... vertebrae masu salmon | std | 0 |
| 34 | サクラマス 脊椎骨数 水温 | std | 0 |
| 35 | ヤマメ 鰓耙数 幽門垂数 側線鱗数 河川 集団 比較 | ext | 1 |
| 36 | ヤマメ 形態（ja.wikipedia） | std | 1 |
| 37 | ヤマメ 島根県 内水面の生物 | std | 1 |
| 38 | ヤマメ NIES 侵入生物DB | std | 1 |
| 39 | ヤマメ 魚図鑑（fishai/zukan） | std | 1 |
| 40 | geometric morphometrics masu / wild vs hatchery | ext | 1 |
| 41 | masu parr smolt morphology fin size | ext | 1 |
| 42 | ヤマメ 標準体長 尾叉長 全長 換算 | std | 0 |
| 43 | ヤマメ 放流魚 天然魚 形態 比較 | ext | 1 |
| 44 | 頭長は標準体長の / 体高は標準体長の ヤマメ サクラマス アマゴ ビワマス | ext | 2 |
| 45 | ビワマス 形態 計測 計数 魚類学雑誌 | ext | 1 |
| 46 | O. masou Biwa trout taxonomy Kikko | std | 1 |
| 47 | Size-driven parr-smolt transformation masu | std | 1 |
| 48 | ビワマス 眼径/頭長 0.169 0.134 0.100 | std | 0（再現せず） |
| 49 | アマゴ サツキマス 24.8 30.4 幽門垂 32 58 | std | 1 |
| 50 | Morphological characters of lake forms Salmo Oncorhynchus Biwa | std | 1 |
| 51 | O. masou subsp. Biwa Kimura holotype | ext | 1 |
| 52 | O. biwaensis diagnosis pyloric caeca transverse scales | ext | 1 |
| 53 | O. biwaensis fishbase | std | 0 |
| 54 | ビワマス 新種 O. biwaensis 記載 | ext | 1 |
| 55 | fish-isj 67(2) 215 サケ科 | std | 0 |
| 56 | "Biwa salmon" abstract pyloric caeca 46 77 | ext | 1 |
| 57 | ビワマス 新種記載 摂南大学 | std | 0 |
| 58 | Biwa trout Wikipedia | std | 0 |
| 59 | ビワマス Wikipedia 形態 | std | 1 |
| 60 | 青森県 ヤマメ 臀鰭軟条数 12-14 | ext | 0 |
| 61 | サクラマス 大瀬崎 側線鱗 134 | std | 0 |
| 62 | 北海道 サクラマス 外部形態 内部形態 | ext | 0 |
| 63 | 北海道さけ・ますふ化場研究報告 サクラマス幼魚 | ext | 1 |
| 64 | さけ・ます資源管理センターニュース サクラマス | std | 0 |
| 65 | 久保達郎 サクラマス幼魚の相分化と変態 | std | 0 |
| 66 | 水産上重要な魚類 サケ目 サクラマス 青森県 | std | 2 |
| 67 | パーマーク サケ科 幼魚 数 位置 個体差 | std | 1 |
| 68 | ヤマメ 背鰭条数 12-13 胸鰭 12-14 | std | 0 |
| 69 | Asahi River Aomori yamame fin rays | std | 0 |
| 70 | サケ、マス保護水面管理事業 サクラマス調査 外部形態 | std | 2 |
| 71 | ヤマメ アマゴ イワナ ニジマス ブラウン 見分け方 | std | 1 |
| 72 | ヤマメ 肥満度 K=W/L3 | std | 0 |
| 73 | ヤマメ 尾叉長 体重 関係式 W=aFL^b | std | 2 |
| 74 | masu salmon length-weight condition factor | ext | 1 |
| 75 | masu salmon LWR Abashiri a=0.0106 b=3.0397 | std | 1（係数は再現せず） |
| 76 | Acta Ichthyol. Piscat. Abashiri LWR | std | 1 |
| 77 | Cherry Salmon FWS ERSS size | std | 1 |
| 78 | O. masou age growth fork length stream-resident | ext | 0 |
| 79 | ヤマメ 鱗 年齢査定 14.1 19.4 23.2 28.2 | std | 0 |
| 80 | Iteroparity of stream resident masu salmon | std | 0 |
| 81 | ヤマメ 雌雄 体サイズ 早熟雄 | std | 0 |
| 82 | ヤマメ 産卵期 雄 婚姻色 吻 | std | 1 |
| 83 | masu upper jaw 14.9–17.1% males eye 20–30% HL | std | 1 |
| 84 | O. masou body height 28–31% upper jaw Primorye | ext | 1 |
| 85 | O. masou Wikipedia 130–240 scales | std | 1 |
| 86 | Korean J. Ichthyol. masu morphological ratios | ext | 2 |
| 87 | GH pseudogene female masu morphology | std | 0 |
| 88 | Life history forms male masu Primor'e | std | 0 |
| 89 | ヤマメ 体型 細長い 側扁 ぼうずコンニャク | std | 0 |
| 90 | サクラマス 降海型 側扁 上顎の後端 日本産魚類検索 | std | 0 |
| 91 | O. masou maxilla extends beyond eye key | std | 0 |
| 92 | Nakabo Fishes of Japan Salmonidae O. masou | ext | 0 |
| 93 | O. masou branchiostegal dorsal rays vertebrae Taiwan Korea | ext | 1（帰属不明） |
| 94 | O. m. formosanus counts | std | 0 |
| 95 | サクラマス 背びれ 脂びれ 尾びれ 黒点（hro.or.jp） | std | 1 |
| 96 | サケ属 歯 配列 鋤骨 基鰓骨歯（日本語） | std | 0 |
| 97 | ヤマメ 鱗 隆起線 アマゴ | std | 0 |
| 98 | Oncorhynchus teeth vomer palatine basibranchial | std | 1 |
| 99 | サケ科 歯条 十字型 T字型 M字型 | ext | 0 |
| 100 | tooth-band-folds Oncorhynchus Salmo Salvelinus | ext | 1 |
| 101 | O. masou FishBase "Max length 79.0 cm TL" | std | 1 |
| 102 | O. masou FishBase biology fluviatile form | std | 1 |
| 103 | O. rhodurus FishBase fin soft rays | std | 1 |
| 104 | 大型アマゴ・ヤマメ J-STAGE 利根川 | ext | 1 |
| 105 | Domestication masu salmon lateral line pored scales | std | 1 |
| 106 | ヤマメ 成長 パーマーク 薄くなる 体型変化 | std | 0 |
| 107 | ヤマメ 外部形態 計数 計測（東京都・神奈川県・岐阜県） | ext | 1 |
| 108 | Japanese salmonid O. masou FL/SL caudal fork depth hatchery wild | ext | 0 |

**終了判断**: 後半（#80以降）は新規の数値がほぼ得られず、同じ自治体PDF・Wikipedia系・FishBase が反復して返却されたため、これ以上の検索は費用対効果が低いと判断して終了した。
