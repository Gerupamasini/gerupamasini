# ヤマメの生態・行動（日本語資料）— 定位・採餌・縄張り・日周/季節・警戒/逃避 調査（ストリーム R11）

> 作成: ストリームR11（生態・行動、日本語資料担当）。**新規作成**（検索なしの初版は存在しなかった）。目的は、Three.js 上のヤマメ（*Oncorhynchus masou masou* 河川型）の行動モデル（定位場所・採餌・縄張り・日周・警戒/逃避）の根拠収集。
>
> **この文書を使う前に必ず読むこと（調査の限界）**
> 1. 検索は WebSearch で 21 回（標準モード、extended 0 回）。得られるのは「タイトル・URL・モデルが作った要約」だけで、**論文の本文・表・図は読めていない**。数値は全て検索要約の記載であり、要約が出典PDFのどれの記述かを特定できないものは、その旨を各 Finding に書いた（候補URLの列挙に留めた）。
> 2. **ヤマメ（河川型）の定位点の焦点流速（focal velocity）、底からの高さ、縄張り面積、反応距離・追尾距離、採餌頻度、時間帯別の活動量、警戒距離（FID）、逃避後の再出現時間は、数値として見つからなかった**（§4）。代用に使った値は全て「PROXY」と明記した。
> 3. 中野繁らの主要論文（Nakano 1995 J. Anim. Ecol. 64:75–84、Nakano 1995 Can. J. Zool. 73:1845–1854）は**書誌（題名・巻・頁）の存在確認のみ**で、中身の数値は取得できていない。
> 4. 証拠ランク: A=査読論文・公的機関資料で要約に数値/記述が明示、B=県・大学資料・解説で要約に記述（出典の特定が弱いものを含む）、C=釣り情報・出典未特定の要約、M=私の記憶（未検証）、P=ユーザー提供写真70枚からの観察。
> 5. 写真（P）は釣獲個体・水槽個体が多く、野外の自然な行動の根拠としては偏る（F-29）。

---

## 1. 要約（仕様に直結する結論）

**定位場所（流速・水深・高さ・構造物）**
1. **体サイズで定位場所が違う**。ごく小さい稚魚（全長 2.4–3.3 cm）は水深 2–14 cm（平均 6 cm）、流速は計測限界以下（5 cm/s と記録）の浅く遅い場所に定位し、調査区の平均（水深 10 cm、流速 37 cm/s）より浅く遅かった [F-04]。
2. 北海道の調整河川（登川）のサクラマス/ヤマメ幼魚（masu salmon, *O. masou*）は、**秋は水深が深く（35.4 ± 14.2 cm）流速が速く一様な（43.4 ± 23.1 cm/s）流心側**、**冬は岸際（channel margin）で流速約 20 cm/s、沈水カバーのある場所**を好んだ [F-01, F-02]。季節で定位場所を切り替える設計の根拠になる。ただしこれは「微生息場の利用」の平均で、定位点の焦点流速ではない可能性がある。
3. 冬は流速が遅く被覆度が高い場所が好まれ、**湧水支流は水温が高く流速が遅い越冬場所**になる（底生無脊椎動物量が1桁多い）[F-02, F-03]。
4. **プール（淵）では大半のヤマメが落水部（流入部）から最深部の間に定位**し、淵があると成魚の数が約1.5倍になる、という県資料の要約がある。5 cm 以上の礁（隠れ場）を入れると大半が隙間に退避した [F-05]（出典PDFの特定は不確実）。
5. 定位点は「流れが絞れた所・合流点など餌が集まる所」（釣り情報）[F-10]。生息流速は 10–35 cm/s の礫底（環境省資料、先行ストリームから継承、再確認なし）[F-06]。

**採餌**
6. **餌の約半分は陸生無脊椎動物**: 森林域の源流で、サクラマス・ニジマス・イワナ・オショロコマの年間摂餌個体数の 53%（Kawaguchi & Nakano 2001 の二次引用）[F-11]。
7. 採餌の時間帯は季節で変わる（県資料の要約）: **春は水温が上がる時刻に多く、夏は終日ならして、秋は夕刻に多い** [F-08]。釣り情報では、朝は流れの緩い深みにいて、水温上昇とともに流れの速い浅い所へ出る [F-09]。
8. **反応距離・追尾距離・採餌頻度はヤマメの数値が見つからなかった**。PROXY（他のサケ科、出典未特定）では、反応距離は種・光条件で 32.7 cm（キングサーモン幼魚の平均）〜187.1 cm（カットスロートトラウトの最大、好条件の光）と大きく幅があり、餌径が体長の 0.025 倍付近で最大になる [F-17]。先行ストリーム（r09）が継承した「定位点に留まる時間 81%、能動採餌 14%」は出典未特定 [F-18]。

**縄張り・順位**
9. **順位制はサイズ順に近い直線的な順位**: 河川魚4種（アユ、イワナ、サクラマス/ヤマメ、ウグイ）を体サイズ5階級に分けた観察で、ほぼ直線的な優劣順位が3か月続き、アユは6月に従位→8月に最優位へ逆転した [F-12]。ヤマメ幼魚では体が大きいほど「近い位置」を得る方向に選択が働くという要約がある [F-13]。
10. **縄張り面積の PROXY 式**: サケ科幼魚の種間回帰 log10(面積 m²) = 2.61 log10(尾叉長 cm) − 2.83（r² = 0.87、n = 23）。尾叉長 5 cm で約 0.10 m²、10 cm で約 0.60 m²、15 cm で約 1.7 m²、20 cm で約 3.7 m²（私の計算。外挿を含む）[F-15]。ヤマメ固有の式は見つからなかった。
11. ドリフト捕食のキングサーモン幼魚（PROXY）では、群れの中で最大・最優位の個体が**固定した排他的な採餌空間を攻撃的に守った** [F-16]。

**日周・季節・産卵**
12. サクラマスの稚魚（ふ化直後〜稚魚）は、**下流への移動が夜間、上流への移動が昼間**に多かった（北海道の人工水路）[F-19]。ヤマメ幼魚〜成魚の時間帯別活動量は見つからなかった。
13. 水温が約 10℃ を下回ると、サケ科幼魚は冬にほぼ完全に夜行性になる（大西洋サケ・ブラウントラウトの PROXY）[F-20]。ヤマメへの適用は未確認。生息上限は夏の最高水温 25℃ 以下（島根県）[F-07]。
14. **産卵**: 岐阜県の産卵床は水深 17–32 cm、流速 12.5–31.3 cm/s（ヤマメ・アマゴ）[F-21]。産卵期は10月下旬〜11月中旬、雌は体を横倒しにして波打たせ河床の砂礫を巻き上げて産卵床を掘り、雄は産卵期に全体が黒ずみ桜色の雲状斑が出る [F-22]。

**警戒・逃避**
15. 釣り情報では、ヤマメは**上流を向いて定位**し、人の気配で岩の下などに隠れる。釣り人は下流側から上流へ静かに進み、低い姿勢で後方から近づく。人の多い川の野生魚は特に神経質で、少し驚くだけで摂餌をやめる [F-23]。**警戒距離・逃避速度・再出現時間の数値は見つからなかった**。
16. PROXY: 大西洋サケの群れは光・音の刺激中に水底へ潜り、刺激が止むと元の水深・遊泳速度に戻った [F-24]。ブラウントラウト・大西洋サケの稚魚は驚くと底付近で短い突進をした [F-25]。

**写真（P）**
17. 自然な状態の水中フレーム8枚のうち高さを見積もれる5枚では、体の下縁は底から**約0.25〜1体高**にあり、6枚で背鰭が立っていた [F-27]。水槽写真の個体間距離（0〜1体長）を野外の縄張り間隔に使ってはならない [F-28]。

---

## 2. Findings

### F-01 北海道・登川のサクラマス/ヤマメ幼魚の微生息場（秋・冬）
- 主張/値: 微生息場スケールの解析で、幼魚は**秋に水深が深く（平均 35.4 ± 14.2 cm）流速が速く一様な（43.4 ± 23.1 cm/s）流心側**を好み、**冬は流速約 20 cm/s の岸際（channel margin）で沈水カバー（submerged cover）のある場所**を好んだ。
- 適用範囲: *O. masou* 幼魚（サイズ・年齢・n は要約に無い）。北海道の登川（Nobori River、調整河川）。秋と冬。数値は「平均 ± SD」と要約にある。測定が焦点流速か平均流速かは要約に無い（私の解釈では利用場所の平均流速の可能性が高い）。
- 出典: 登川（北海道）のサクラマス幼魚の物理環境と生息場利用に関する論文（Springer Link s10228-010-0201-3。誌名は要約に無い）。https://link.springer.com/article/10.1007/s10228-010-0201-3 ／ 要約の再掲: https://scite.ai/reports/r9Ld6V
- 証拠: [A] "preferred midstream habitat with greater depth (averaging 35.4 ± 14.2 cm) and high uniform current velocities (43.4 ± 23.1 cm/s) during autumn, while in winter ... channel margin habitat with moderate current (about 20 cm/s) and submerged cover"

### F-02 越冬場所は低流速・高被覆度、場所の決め手は季節とスケールで変わる
- 主張/値: サクラマス幼魚は越冬場所で「流速が遅く、被覆（cover）の度合いが高い場所」を好む。幼魚の分布を決める生息場条件は、**季節と解析スケールで異なる**。
- 適用範囲: *O. masou* 幼魚。冬。数値なし（F-01 の約 20 cm/s は別項）。
- 出典: 上の登川論文と、スケールの異なる解析の議論（要約の出典URLは F-01 と同じ候補）。https://link.springer.com/article/10.1007/s10228-010-0201-3 ／ https://scite.ai/reports/r9Ld6V
- 証拠: [A] "Masu salmon prefer places with low flow velocity and high degree of coverage in wintering habitats"; "habitat conditions ... differ according to the season and scale of analysis"（要約の文言。どの結果URLの文かは特定不能）

### F-03 湧水支流は暖かく流れの遅い越冬場所
- 主張/値: 湧水支流（spring-fed tributary）は、本流（降水依存の川）より**底生無脊椎動物の現存量が1桁多く**、水温が高く流速が遅いので、サクラマス幼魚の魅力的な越冬場所（季節的な避難場所）になる。
- 適用範囲: *O. masou* 幼魚。北海道（調査河川名は要約に無い）。冬。数値は「1桁」のみ。
- 出典: Ichthyology & Herpetology 111(1)（Ecosystem Functions of a Spring-Fed Tributary in Providing Foraging ...）。https://complete.bioone.org/journals/ichthyology-and-herpetology/volume-111/issue-1/i2022050/Ecosystem-Functions-of-a-Spring-Fed-Tributary-in-Providing-Foraging/10.1643/i2022050.full ／ 学会発表要旨: https://sfs-2026.p.asnevents.com.au/days/2026-05-19/abstract/134757
- 証拠: [A] "biomass of benthic macroinvertebrates was one-order of magnitude greater in spring-fed tributaries ... Warmer and slower current velocities ... attractive wintering habitat for juvenile masu salmon"

### F-04 ヤマメの稚魚（全長 2.4–3.3 cm）の定位位置の水深・流速
- 主張/値: 小型個体（全長 2.4–3.3 cm）の定位位置の水深は 2–14 cm（平均 6 cm）。定位位置の流速は全て流速計の計測限界以下で、5 cm/s と記録された。調査区間の平均は水深 10 cm、流速 37 cm/s。小型個体は区間平均より**浅く、流速の低い場所**を選んだ。
- 適用範囲: ヤマメ（河川型）の浮上直後〜稚魚期。河川名・季節・n は要約に無い。流速は計測限界の記録で、真の値ではない。
- 出典: 要約から単一のPDFに特定できない。候補（検索結果に出たもの）: https://catalog.lib.kyushu-u.ac.jp/opac_download_md/10879/p073.pdf ／ https://www.fish.rd.pref.gifu.lg.jp/kenkyu-houkoku/pdf-61-70/63-001.pdf
- 証拠: [A] "水深は2cm〜14cmの範囲にあり、平均水深は6cm。定位位置の流速は全て流速計の計測限界以下で5cm/秒と記録"（要約）

### F-05 淵（プール）内の定位位置、淵の効果、隠れ場への退避
- 主張/値: (a) **大部分のヤマメは落水部（プールへの流入部）から最深部の間に定位**している。(b) 5 cm 以上の礁（磯）を投入すると、ほとんどのヤマメは**礁の隙間に退避**する傾向があった。(c) 淵があるとヤマメ成魚の数が**約1.5倍**になる関係が報告されている。
- 適用範囲: ヤマメ（河川型、主に成魚〜大型個体と思われるが要約に体長無し）。調査河川・季節・n は要約に無い。(a)(b) と (c) は別資料の可能性がある。
- 出典: 検索結果に出た候補（要約からの特定は不確実）: https://catalog.lib.kyushu-u.ac.jp/opac_download_md/23570/p173.pdf ／ https://www.fish.rd.pref.gifu.lg.jp/gijutsu/shingyo-horyu/130213-shingyo-horyu.pdf ／ https://www.pref.tochigi.lg.jp/g65/documents/kennkyuuhoukoku07_22.pdf
- 証拠: [B] "大部分のヤマメは落水部から最深部の間に定位しており、礁の投入によってヤマメは礁の隙間に退避する傾向"; "淵があるとヤマメ成魚の数が1.5倍になる"（要約）

### F-06 生息流速 10–35 cm/s、礫底 0.5–5 cm（先行ストリームから継承）
- 主張/値: ヤマメは流速 10–35 cm/s、粒径 0.5–5.0 cm の礫底の渓流環境に生息する（環境省資料）。
- 適用範囲: ヤマメ（河川型）。サイズ・季節・流速の種類は不明。**今回は再検索していない（継承のみ）**。
- 出典: r09_swim_transient.md F-01（r01 F-32）が記録した環境省資料。https://www.env.go.jp/council/09water/y0910-03/mat03.pdf ／ https://www.env.go.jp/info/iken/h180317a/a-2.pdf（私は再確認していない）
- 証拠: [B] 継承。"inhabits stream valleys at flow velocities of 10-35 cm/s in gravel beds with pebbles of 0.5-5.0 cm diameter"

### F-07 生息水温の上限: 夏の最高水温 25℃ 以下
- 主張/値: ヤマメ（サクラマスの陸封型）は、夏の最高水温が 25℃ 以下に保たれる河川上流部に生息する。
- 適用範囲: ヤマメ。島根県の解説。季節は夏。最適水温や活動の閾値は無い。
- 出典: 島根県。https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html
- 証拠: [B] "上流部で夏の最高水温が25℃以下"（要約）

### F-08 摂餌行動の時間帯は季節で変わる（定性）
- 主張/値: ヤマメの摂餌行動は季節によって異なる。**春先は水温が上昇する時刻に多量に摂餌**、**夏はどの時間帯も均して摂餌**、**秋は夕刻に多く摂餌**する傾向。
- 適用範囲: ヤマメ（河川型）。調査河川・体長・n・方法（胃内容物か観察か）は要約に無い。数値なし。
- 出典: 要約からの特定は不確実。候補: https://catalog.lib.kyushu-u.ac.jp/opac_download_md/23570/p173.pdf ／ https://www.aomori-itc.or.jp/_files/00229821/226-229.pdf（青森県産業技術センターの報告。内容は未確認）
- 証拠: [B] "春先には水温が上昇する時刻に多量に摂餌する傾向、夏はどの時間帯も均して摂餌、秋期には夕刻に多く"（要約）

### F-09 季節と一日の中での流速・水深の嗜好（釣り情報）
- 主張/値: ヤマメ・アマゴは、春と秋の低水温期は緩い流れを好み、夏の高水温・渇水期は強い流れを好む。一日の中でも、**朝は流れの緩い所・深みにいて、水温が上がる昼に向けて流れの強い場所・浅い所へ出る**。
- 適用範囲: ヤマメ・アマゴ（釣り解説）。数値なし。体長・河川の指定なし。
- 出典: ホンダ釣り（フィッシング）の解説。https://www.honda.co.jp/fishing/enjoy/season/season-201704/step-2/
- 証拠: [C] "水温上昇とともに流れの速い浅い所へ"（要約）。F-08 と方向が一致するが独立した裏付けではない。

### F-10 定位する場所: 流れが絞れる所・合流点・落ち込み
- 主張/値: ヤマメは一定の場所に定位して流下する餌を待ち構える。ポイントは**流れが絞れた所や流れの合流点など、餌が集まりやすい場所**。
- 適用範囲: ヤマメ（釣り解説）。数値なし。
- 出典: シマノ。https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol41.html ／ https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol35.html
- 証拠: [C] "流れが絞れた所や流れの合流点など、エサが集まりやすい場所"（要約）

### F-11 餌の約半分は陸生無脊椎動物（落下昆虫を含む）
- 主張/値: 日本の源流で、サクラマス、ニジマス、イワナ（white-spotted char）、オショロコマ（Dolly Varden）の**年間摂餌個体数の 53% が陸生無脊椎動物**（Kawaguchi & Nakano 2001）。陸生無脊椎動物の流入は、ドリフト捕食する魚の年間エネルギー収支の最大半分に当たるが、流入量は季節で偏る。
- 適用範囲: 二次引用（学位論文等が Kawaguchi & Nakano 2001 を引用した記述）。魚種の混合値で、サクラマスだけの値かは要約から不明。「個体数ベース」の可能性がある。森林域/草地域の別は要約に無い。
- 出典: 二次引用の候補（要約からの特定は不確実）: https://www.redalyc.org/pdf/3699/369944289001.pdf ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC33350（Nakano & Murakami 2001 と思われる。本文は未確認）。原典は Kawaguchi Y., Nakano S. (2001) Freshwater Biology（誌名は私の記憶で、要約には無い）。
- 証拠: [B] "terrestrial invertebrates composed 53% of prey ingested for the annual diet of the masu salmon, rainbow trout, white-spotted char, and Dolly Varden"

### F-12 河川魚4種のサイズ構造をもつ順位（サクラマス含む）
- 主張/値: アユ、イワナ（white-spotted charr）、サクラマス/ヤマメ、ウグイの4種を各5つの体サイズ階級に分けて観察すると、**ほぼ直線的な優劣順位**が3か月間続いた。アユは6月は従位、7月に2位、**8月に最優位**となり、サケ類との順位が逆転した。小型ウグイは種内・種間の攻撃を受け続け最下位だった。攻撃は、微生息場の好みが似た種・サイズ群の間で激しかった。
- 適用範囲: 日本の河川（河川名・年は要約に無い）、6–8月。サクラマス幼魚〜（階級の体長は要約に無い）。
- 出典: Springer Link（著者・年・誌名は要約に無い）。https://link.springer.com/article/10.1007/BF02678571 （同じ結果集合の別候補: https://link.springer.com/article/10.1023/A:1007363927379 ）
- 証拠: [A] "almost linear dominance order ... Ayu were relatively subordinate in June, but became the second most dominant in July and the most dominant in August"

### F-13 サクラマス/ヤマメ幼魚: 体が大きいほど優位な位置を得る、北海道での出現時期
- 主張/値: パー（parr）間の相互作用の多変量回帰で、**より大きい体サイズが「proximate positions」（何への近さかは要約に無い）を得るのに有利**に選択が働いた。研究地では、サクラマスは冬に礫河床の間隙で孵化し、**4–5月の融雪後に浮上して外部摂餌を始める**。
- 適用範囲: 北海道のサクラマス幼魚（河川名は要約に無い）。要約の出典URLを特定できない（候補: Futamura ほか 2022 "Size dependent growth tactics of masu salmon"、Futamura ほか 2025、北大リポジトリの Oecologia 稿）。
- 出典: https://sites.warnercnr.colostate.edu/kanno/wp-content/uploads/sites/112/2022/03/Futamura-et-al.-2022-Size-dependent-growth-tactics-of-masu-salmon.pdf ／ https://sites.warnercnr.colostate.edu/kanno/wp-content/uploads/sites/112/2025/08/Futamura-et-al.-2025-Annual-variation-in-riverscape-habitat-use-by-masu-salmon-smolt.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/87777/Maintext_fig_oecologia.pdf
- 証拠: [A] "selection favoring larger body size for gaining more proximate positions in masu salmon parr interactions"; "emerge ... from April to May following snowmelt"（要約。どのURLの文かは特定不能）

### F-14 中野繁の主要な順位・定位場所の論文（書誌の確認のみ）
- 主張/値: (1) Nakano S. (1995) Individual differences in resource use, growth and emigration under the influence of a dominance hierarchy in fluvial red-spotted masu salmon in a natural habitat. *J. Anim. Ecol.* 64: 75–84。(2) Nakano S. (1995) Competitive interactions for foraging microhabitats in a size-structured interspecific dominance hierarchy of two sympatric stream salmonids in a natural habitat. *Can. J. Zool.* 73: 1845–1854。**題名から、順位が資源利用・成長・移出（emigration）に個体差を生む対象としてヤマメ（red-spotted masu salmon）が使われたことは言えるが、中身の数値・結論は取得できていない。**
- 適用範囲: 日本の河川型ヤマメ（fluvial red-spotted masu salmon）、自然河川。
- 出典: 書誌の確認に使った結果: https://link.springer.com/article/10.1007/BF02678571 （検索結果の書誌欄）／ https://www.biorxiv.org/content/10.1101/364182.full.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/14656/JFE2006-21-3.pdf
- 証拠: [A]（書誌のみ）"Individual differences in resource use, growth and emigration under the influence of a dominance hierarchy in fluvial red-spotted masu salmon in a natural habitat"

### F-15 縄張り面積と体長の種間回帰（サケ科幼魚、PROXY）
- 主張/値: Grant & Kramer (1990) は発表済みデータから種間回帰を作った: **log10(縄張り面積, m²) = 2.61 log10(尾叉長, cm) − 2.83**（r² = 0.87、n = 23）。浅い瀬・流れでは、コホートの密度推移がこの最大密度の回帰線によく沿った。
  - 私の計算（この式を代入。ヤマメ固有の値ではなく、式の適用範囲の体長も要約に無いので、大型個体は外挿）: 尾叉長 3 cm → 0.026 m²、5 cm → 0.099 m²、8 cm → 0.34 m²、10 cm → 0.60 m²、12 cm → 0.97 m²、15 cm → 1.7 m²、20 cm → 3.7 m²、25 cm → 6.6 m²。面積が等しい円の半径は 5 cm で 18 cm（3.5体長）、10 cm で 44 cm（4.4体長）、20 cm で 108 cm（5.4体長）。
- 適用範囲: **PROXY: サケ科幼魚（種間回帰）**。ヤマメ・サクラマスの縄張りの直接測定ではない。縄張りが「餌の流下を待つ空間」か「定位点の周り」かは式から決まらない。
- 出典: Grant J.W.A., Kramer D.L. (1990) Territory size as a predictor of the upper limit to population density of juvenile salmonids in streams. *Can. J. Fish. Aquat. Sci.* 47: 1724–1737。https://sitesreservoirproject.riptideweb.com/references/REF23/Volume%202/App11M_Yolo_Sutter_Bypass_Weir_Spill_Analysis/Grant%20and%20Kramer_1990_Territory%20Size.pdf
- 証拠: [A] "log10 territory size = 2.61 log10 length − 2.83, with an r² = 0.87 and n = 23"（要約）

### F-16 群れ内の縄張り: 優位個体は固定した排他的な採餌空間を守る（PROXY）
- 主張/値: ドリフト捕食するキングサーモン幼魚の3次元観察で、群れの中の**最大・最優位の個体の一部は、静止した排他的な採餌空間を攻撃的に守り**、明確に縄張り的だった。順位は動的に争われる。
- 適用範囲: **PROXY: キングサーモン（*O. tshawytscha*）幼魚**。サクラマスと似た行動と要約が述べたが、これは要約のモデルの推測で、資料の主張ではない。
- 出典: USGS。https://pubs.usgs.gov/publication/70269370
- 証拠: [A] "some of the largest, most dominant fish in groups aggressively defended stationary, exclusive feeding spaces and thus were unambiguously territorial"（要約）

### F-17 反応距離・捕食の成否（他のサケ科、PROXY、出典未特定）
- 主張/値: 反応距離（reactive distance）の平均はキングサーモン幼魚で 32.7 cm、カットスロートトラウト（沿岸型）の最大反応距離は好条件の光で 187.1 cm。反応距離は餌の直径が体長の 0.025 倍で最大、打撃距離（striking distance）は 0.025–0.051 倍で最大で、それより大きくても小さくても減る。流速が上がると捕食成功率は非線形に下がる。優位個体は劣位個体より多く捕食したが、**反応距離の差は無かった**。
- 適用範囲: **PROXY: キングサーモン、カットスロートトラウト**（要約は出典論文を特定していない）。ヤマメのデータではない。
- 出典: 検索結果に出たが、どの文がどのPDFのものかは特定不能: https://www.sfu.ca/biology/faculty/dill/publications/f84-139.pdf ／ https://www.sfu.ca/biology/faculty/dill/publications/z78-198.pdf ／ https://ouci.dntb.gov.ua/works/27PYVMx4 ／ https://openscholar.uga.edu/record/11698?ln=en
- 証拠: [C] "Reaction distance was maximal on prey whose diameter was 0.025 fish length"; "dominant fish captured significantly more prey than subordinates, though there was no significant difference in reactive distances"

### F-18 ドリフト捕食の時間配分（先行ストリーム r09 から継承、出典未特定）
- 主張/値: 定位点に留まる時間が大半（平均 81%）、能動的な採餌は観察時間の 14%。餌の約 2/3 は定位点より下流側で捕獲された。
- 適用範囲: 出典未特定のドリフト捕食研究の要約（種・河川不明）。ヤマメではない可能性が高い。**今回は再検索していない**。
- 出典: r09_swim_transient.md F-41（本リポジトリ内）。
- 証拠: [C] 継承。"定位点に留まる時間が大半（平均 81%）、能動的な採餌は観察時間の 14%"

### F-19 サクラマスのふ化直後〜稚魚の移動は、下流方向が夜、上流方向が昼
- 主張/値: 浮上したばかりの稚魚（fry）は、上下流の両方に移動し、**下流への移動は夜間、上流への移動は主に昼間**だった。浮上初期は、昼より夜に活動が大きかった。高流速は下流への移動を増やし上流への移動を減らす。大きい稚魚は上流へ移動するか産卵場に留まり、小さい稚魚より多く摂餌した。
- 適用範囲: サクラマス *O. masou* の稚魚。北海道の人工水路実験（体長・水温・n は要約に無い）。幼魚〜成魚には適用できない。
- 出典: 北海道立総合研究機構の報告と FAO AGRIS の書誌。https://www.hro.or.jp/upload/41034/81-kawamura.pdf ／ https://agris.fao.org/search/fr/records/647242bb53aa8c896303bf5d
- 証拠: [A] "downstream movements were typically nocturnal, but upstream movements were predominantly diurnal"; "greater activity at nighttime than in the daytime during the early period of emergence"

### F-20 水温約 10℃ 以下でサケ科幼魚は冬に夜行性へ（PROXY）
- 主張/値: サケ科の幼魚は、水温 10℃ 超では餌の量に応じて**夏は部分的に夜行性**、水温 10℃ を下回る**冬はほぼ完全に夜行性**になる。
- 適用範囲: **PROXY: 大西洋サケ・ブラウントラウト等の幼魚**（序文的な一般記述）。ヤマメでの確認なし。昼間の隠れ場所の形態（礫間隙など）は要約に無い。
- 出典: 大西洋サケ幼魚の越冬行動（温度と光）の学位論文。https://theses.gla.ac.uk/id/eprint/75895 ／ https://theses.gla.ac.uk/75895/1/13818631.pdf
- 証拠: [B] "partly nocturnal in summer ... above 10 ºC, to being almost completely nocturnal in winter when temperatures drop below 10 ºC"（要約）

### F-21 ヤマメ・アマゴの産卵床の水深・流速（岐阜県）
- 主張/値: ヤマメとアマゴの産卵床の水深は **17–32 cm**、流速は **12.5–31.3 cm/s**。流速はプロペラ式流速計で **60% 水深**の位置で測った。岐阜県の渓流の自然産卵場では、イワナとヤマメ・アマゴの産卵床の水深・流速・河床材料が測られた。
- 適用範囲: ヤマメ・アマゴ（亜種を区別せず）。岐阜県の渓流。産卵期（秋）。n は要約に無い。ヤマメだけの値ではない。
- 出典: 岐阜県水産研究所の研究報告（候補。要約からの特定は不確実）。https://www.fish.rd.pref.gifu.lg.jp/kenkyu-houkoku/pdf-61-70/63-001.pdf ／ https://www.fish.rd.pref.gifu.lg.jp/kenkyu-houkoku/pdf-61-70/61-001.pdf
- 証拠: [A] "ヤマメとアマゴの産卵床の水深は17～32cm、流速は12.5～31.3cm/s"; "流速はプロペラ式流速計を使用して60%水深の位置で測定"（要約）

### F-22 産卵行動と産卵期の雄の体色
- 主張/値: 産卵は10月下旬〜11月中旬に確認された。**雌は体を横倒しにして波打たせ、川底の砂利や砂を掘りながら巻き上げて産卵床を造る**。産卵期が近づくと**雄は全体が黒ずみ、桜色の不規則な雲状斑が浮き出る婚姻色**を示す。ほとんどの産卵床は**プールからステップ（瀬）への移行部**にあった。
- 適用範囲: ヤマメ（河川型）。調査河川は要約に無い。産卵床が「プールからステップへの移行部」にあるという記述の出典は要約から特定できない。
- 出典: 候補（要約からの特定は不確実）: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ https://agriknowledge.affrc.go.jp/RN/2010927243.pdf ／ https://www.pref.yamanashi.jp/documents/65434/jiho42_p50-51.pdf ／ https://www.daiwa.com/jp/live_with_nature/riverwalkstory/1256788_14582
- 証拠: [B] "メスが身体を横倒しにして波打たせ、川底の砂利や砂を掘りながら巻き上げる"; "雄は全体に黒ずみ、桜色の不規則な雲状斑が浮き出た婚姻色"（要約）

### F-23 警戒・逃避に関する釣り情報（定性）
- 主張/値: ヤマメ・イワナは**上流を向いて定位**し、人の気配を感じると岩の下に隠れる。このため釣り人は下流から上流へ向かって（後方から）近づく。野生のヤマメ、特に人の多い川の個体は神経質で、**少し驚いただけで摂餌への関心をすぐ失う**。低い姿勢での接近が勧められる。
- 適用範囲: ヤマメ・イワナ（釣り解説）。数値（距離・速度・再出現時間）なし。**要約の一文に「上流から接近すると隠れる」とあるが、同じ要約の別の文は「上流へ釣り上がると後ろから近づけて警戒されにくい」とあり、方向の記述が整合しない**（§3）。後者（魚は上流を向くので、後方=下流側からの接近が気づかれにくい）が一般的な理解で、私の解釈。
- 出典: ホンダ釣り、シマノ、長野県水産試験場の解説。https://www.honda.co.jp/fishing/enjoy/season/season-202107/step-2/ ／ https://www.honda.co.jp/fishing/picture-book/yamame/trap01/ ／ https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol57.html ／ https://www.pref.nagano.lg.jp/suisan/joho/sakanatachi/yamame.html
- 証拠: [C] "Wild yamame in populated river areas are particularly nervous and wary, and quickly lose interest in feeding if startled even slightly"（要約）

### F-24 刺激への反応と回復: 大西洋サケの群れは水底へ潜り、止むと元に戻る（PROXY）
- 主張/値: 光・超低周波音・音刺激に対して、大西洋サケの群れは**刺激の間は水底へ潜り**（鉛直分布が大きく変化）、刺激が止むと**元の遊泳水深と遊泳速度に戻った**。
- 適用範囲: **PROXY: 大西洋サケ（*Salmo salar*）の群れ**、人工刺激（人影・足音ではない）。ヤマメの野外の反応ではない。回復時間の値は要約に無い。
- 出典: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3656933/
- 証拠: [A] "diving to the bottom for the duration of stimulus, but fish returned to their pre-stimulus swimming depths and speeds once exposure had ceased"（要約）

### F-25 稚魚の驚愕反応の型と回復（PROXY、出典未特定）
- 主張/値: サケ科稚魚の模擬捕食攻撃への反応は種で違う。ブラウントラウトと大西洋サケの稚魚は**水底付近で短い突進**、イワナ類（Arctic charr）の稚魚は主に上向きの突進か静止。別の（魚種不明の）研究では、驚愕反応と潜時は騒音停止後およそ 2 分以内に回復した。
- 適用範囲: **PROXY: ブラウントラウト、大西洋サケ、Arctic charr の稚魚**（水槽）。回復の「2分」は魚種が要約に無い。ヤマメの値ではない。
- 出典: 検索結果に出たが、どのURLの文かは特定不能: https://vocal-communication.bio.bris.ac.uk/pdfs/Rapid_recovery.pdf ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6634859
- 証拠: [C] "brown trout and Atlantic salmon fry performed short swimming bursts near the aquarium bottom"; "rapid recovery of startle responses ... within 2 minutes after noise cessation"

### F-26 研究者・機関の整理
- 主張/値: 中野繁（所属は要約に無い。川の魚の生活史・食性・行動の研究から出発。**水中釣り（underwater angling）**で個体を取り出し、測定・標識して戻す手法を開発したと紹介されている）。ヤマメ（red-spotted masu salmon）の順位制・資源利用・移出（F-14）、陸生無脊椎動物の流入（F-11）。Futamura ら（論文PDFが Colorado State University の Kanno 研究室サイト上にある。北海道のサクラマスの成長戦術・河川景観での生息場利用、F-13）。川那部浩哉、森誠一、野上祐作、北大北方生物圏FSCは**今回の検索では該当する論文・記述を確認できなかった**（検索結果に出ていない。人物・業績を推測では書かない）。
- 適用範囲: 研究者の紹介。
- 出典: 中野繁の手法の紹介は要約の出典URLを特定できない（検索で出た候補: https://www.kyoto-u.ac.jp/research-news/2025-10-23 ／ https://nrid.nii.ac.jp/nrid/1000050217791/、内容は未確認）。
- 証拠: [B] "developed unique techniques for stream research including underwater angling which allowed him to remove, measure, mark, and replace individual fish"（要約）

### F-27 写真（P）: 自然な水中フレームでの底からの高さと姿勢
- 主張/値: 写真70枚のうち水中自然（in_water_natural）は12枚。そのうち釣獲後・掛かり・平置きの4枚（p011, p019, p067, p070）を除く**自然な8枚**（p005, p006, p007, p023, p026, p036, p040, p054）を数えた。底（礫・岩）から魚体下縁までの高さを見積もれた5枚: p026 約0.25体高、p005 約0.7体高、p036 約1体高、p040 約1体高、p023 の個体B 約1体高以内。背鰭が立っている明示があるのは p005, p006, p023A, p026, p040, p054（小さく立つ）の**6/8枚**（残り2枚は判別不能）。場所の例: p054 は岩の張り出し下の暗い淀み、p023 の個体A は暗い流木/岸際近くの上層、p006 と p026 は浅い瀬の礫際で腹を基質に近づけ、p036 は礫の岩棚の上でホバリング様に定位。
- 適用範囲: ヤマメと同定した（確信度は写真ごとに差がある）写真。サイズ・流速・水深は不明。**高さは注釈者の px 見積もり**。n が小さい。
- 出典: /home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json〜catalog_c07.json の posture_behavior 欄（先行ストリーム r09 F-10, F-12, F-14 と同じ所見を、今回数え直した）。
- 証拠: [P] "底の礫面から魚体下縁まで約60px（体高の約0.7倍）の高さを保ち、緩い定位"（p005）

### F-28 写真（P）: 個体間距離と群れの偏り
- 主張/値: 水槽（11枚）では、並走する2尾の距離が約1/3体長（p018）、個体間距離約0.3–0.5体長（p028）、約0.5–1体長（p029）、鼻先がほぼ接触（p016）。自然水中の p023 では B・C・D が距離 0.1–0.5 体長で、全個体が頭を同じ向き（画像左）に向けた。水槽の複数個体が同方向を向く例が多い（p014, p015, p018, p041）。
- 適用範囲: **高密度の水槽と、釣獲後の小群。縄張り間隔・野外の個体間距離の根拠にならない**（F-15 の縄張り面積と整合しない値が出るのは、そのため）。
- 出典: catalog_c01〜c07.json の posture_behavior 欄。
- 証拠: [P] "2尾の距離は体長の約1/3で、並走している"（p018）

### F-29 写真（P）: 写真セットの構成と偏り
- 主張/値: 70枚の撮影状況（context）は ground 19、landing_net 13、in_water_natural 12、aquarium 11、hand 10、other 5。**釣獲後（地面・タモ・手）が42枚（60%）**、水槽が11枚（16%）、自然水中の自由行動と言えるのは約8枚（11%）。ライフステージは juvenile 26、parr 18、adult_nonspawning 15、unknown 6、spawning_male 4、post_spawn 1。体長の推定は 45/70 枚で unknown。
- 適用範囲: 本プロジェクトの写真セット。逃避、警戒、群れ、縄張りの行動根拠としては使えない。
- 出典: catalog_c01〜c07.json（context, life_stage, size_class_est 欄の私の集計）。
- 証拠: [P] 集計。

### F-30 写真（P）: ライズ・ジャンプのフレーム
- 主張/値: p007 は水面直下で頭付近から同心円の波紋が広がり、体は右上へ強く湾曲し、鰓孔が開き、尾鰭は畳まれていた（捕食直後または方向転換と注釈者は推定）。p031 は水面からジャンプした空中の瞬間で、体はほぼ水平、尾柄は緩く下へ屈曲、尾鰭は下向き、胸鰭・腹鰭は下へ開き、背鰭は立ち、口は閉じていた。
- 適用範囲: 各1枚。p007 の「ライズ直後」は推定。
- 出典: catalog_c01〜c07.json の posture_behavior 欄。
- 証拠: [P] "水面からジャンプして空中にいる瞬間。体はほぼ水平で、尾柄がゆるく下へ屈曲し尾鰭は下向き"（p031）

### F-31 順位と定位位置の対応（記憶、未検証）
- 主張/値: 優位な個体ほど、流下餌が多く隠れ場に近い「良い」定位点（流れの落ち込み直下の流心側、大石の前面や後ろなど）を占め、劣位個体は周縁や不利な位置に追いやられ、成長が劣り、移出（流出）しやすい、という構図。F-14 の題名（順位の影響下での資源利用・成長・移出の個体差）と方向は合うが、具体的な位置や数値は未取得。
- 適用範囲: 私の記憶による一般化。サケ科全般の知識を混ぜている可能性がある。
- 出典: なし（検索要約なし）。
- 証拠: [M] 未検証。確信度: 方向は中、具体的な位置は低。

### F-32 攻撃行動の型（記憶、未検証）
- 主張/値: 縄張り・順位の攻撃は、体を向けての接近、突進（追い払い）、体側を見せる誇示、咬みつき、鰭を広げる姿勢の組み合わせ、と記憶している。ヤマメで体色の急変（威嚇色）があるかは確認していない。
- 適用範囲: サケ科幼魚一般の記憶。ヤマメでの頻度・距離・継続時間は不明。
- 出典: なし。
- 証拠: [M] 未検証。確信度: 低〜中。

### F-33 薄明の摂餌ピーク（記憶、未検証）
- 主張/値: 夏は朝夕の薄明に摂餌が増える、という釣りと研究の一般認識。F-08 は秋が夕刻に多いとし、夏は「均して」とするので、**夏の薄明ピークは F-08 と食い違う可能性**がある。
- 適用範囲: サケ科一般の記憶。
- 出典: なし。
- 証拠: [M] 未検証。確信度: 低。

### F-34 逃避先と再出現（記憶、未検証）
- 主張/値: 驚いたヤマメは最寄りの隠れ場（岩の下、オーバーハングした岸、倒木、深み）へ短い突進で逃げ、危険が去ると数分〜数十分で元の定位点に戻る、という一般的な認識。F-23 の「岩の下に隠れる」とは整合するが、時間の数値は確認できていない。
- 適用範囲: 私の記憶と釣りの一般認識。時間は根拠なし。
- 出典: なし。
- 証拠: [M] 未検証。確信度: 逃避先は中、再出現時間は低（数値は使わない）。

---

## 3. 資料間の矛盾・不一致

1. **流速の値の大きな幅（測定対象・体サイズ・季節の違い）**: 稚魚（全長 2.4–3.3 cm）の定位点 ≤ 5 cm/s（計測限界、区間平均 37 cm/s）[F-04]、環境省の生息流速 10–35 cm/s [F-06]、登川の幼魚の秋の利用場所 43.4 ± 23.1 cm/s と冬の約 20 cm/s [F-01]、産卵床 12.5–31.3 cm/s（60%水深）[F-21]。**定位点の焦点流速、利用場所の平均流速、区間平均流速が混在している**。サイズが大きいほど速い流れに出る方向では整合するが、同一基準の表は作れない。
2. **日周の方向**: 釣り情報は「朝は緩い流れ・深み → 昼は速い浅場」[F-09]、PROXY は「冬は夜行性」[F-20]、サクラマスの稚魚は「下流移動は夜、上流移動は昼」[F-19]。魚種・ステージ・季節が違い、同じ軸の比較ではない。ヤマメの夜間の定位場所は未取得。
3. **夏の摂餌の時間帯**: F-08（夏は終日均す）と記憶 F-33（薄明ピーク）。
4. **接近方向の記述の食い違い（F-23 の要約内）**: 「上流から接近すると隠れる」と「上流へ釣り上がると後方から近づけて警戒されにくい」が同居する。魚が上流を向くことから後者を採用したが、これは私の解釈。
5. **反応距離の桁の差**: 32.7 cm（キングサーモン幼魚）と 187.1 cm（カットスロート、好条件の光）[F-17]。種・体サイズ・光環境が違う。ヤマメは未取得。
6. **順位と捕食成功**: 優位個体は多く捕食するが反応距離には差が無い [F-17]。優位性の利点が「距離」ではなく「位置・成功率」にあることを示唆するが、ヤマメでは未確認。
7. **写真と文献の個体間距離**: 水槽・釣獲後の写真の 0.1–1 体長 [F-28] と、F-15 の縄張り（5 cm の魚で円換算半径 3.5 体長）は大きく矛盾する。写真の方が偏っている（F-29）。
8. **「ヤマメ」とアマゴ・サクラマスの混在**: 産卵床の数値はヤマメ・アマゴ混合 [F-21]。登川の値は *O. masou*（サクラマス幼魚で、ヤマメの河川型を含むと思われるが要約に無い）[F-01]。稚魚の移動は降海型のサクラマスの稚魚 [F-19]。

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル/アニメ/行動実装に必要だが確認できなかった事項

1. **ヤマメの定位点の焦点流速（cm/s）と平均流速の体長別の値**、および底からの高さ（cm または体高比）。F-01, F-04 は利用場所の平均または稚魚のみ。成魚（20–30 cm）の値は無い。
2. **基質（礫径）への選好、岩・倒木・岸際・淵尻・ヨレ（渦・偏流）の利用率**: 淵の落水部〜最深部 [F-05] と、流れが絞れる所・合流点 [F-10] のみ。淵尻、ヨレの定量値は無い。
3. **縄張り面積のヤマメ固有値（体長依存）、追い払いの距離・速度・頻度、威嚇時の体色・姿勢、野外の個体間距離、密度**。F-15 は PROXY の種間回帰のみ。中野繁らの論文の中身（数値）は取得できていない（F-14）。
4. **反応距離・追尾距離・追尾後に元の位置へ戻る経路と時間・採餌頻度（回/分または回/時）・捕食成功率**（ヤマメ）。F-17, F-18 は PROXY または出典未特定。
5. **時間帯別（時刻ごと）の活動量・採餌量、夜間の定位場所、夜行性の程度**（ヤマメ）。F-08 は季節ごとの定性、F-19・F-20 は他のステージ/他種。
6. **越冬場所の詳細（成魚・河川型ヤマメ）**: 水温と活動量の関係の数値、昼間の隠れ場所の構造。F-02, F-03 は北海道の幼魚、F-20 は PROXY。
7. **警戒距離（FID）、人影・足音・水面の影・鳥への反応の種別、逃避の方向・速度、再出現までの時間**。F-23 は定性、F-24, F-25 は PROXY。ヤマメの数値は無い。釣り人の知見は C ランクのみ。
8. **産卵期の雌雄の位置関係、雄間の闘争、産卵行動の秒単位の時間**。F-22 は定性。
9. **中野繁以外の研究者**（川那部浩哉、森誠一、野上祐作、北大北方生物圏FSC）の業績。検索結果に該当が出なかった。人物の業績は推測で書いていない。
10. 要約が数値を示さなかったため採用しなかったもの: Nakano 1995 の2論文の結果、Fausch 1984 や Hughes & Dill 1990 の最適定位モデル（検索せず。r09 F-25 に書誌のみ）。
11. 本調査が検索しなかった課題: 体長依存の遊泳速度と定位流速の関係、水温と呼吸頻度（鰓蓋拍動）の関係、日本の渓流での体長別の個体数密度。

---

## 5. 出典一覧（検索結果に出たURLのみ。重複排除）

**ヤマメ・サクラマス（*O. masou*）の生態**
- https://link.springer.com/article/10.1007/s10228-010-0201-3 — 登川（北海道）の幼魚の微生息場 [F-01, F-02]
- https://scite.ai/reports/r9Ld6V — 同上の要約 [F-01, F-02]
- https://complete.bioone.org/journals/ichthyology-and-herpetology/volume-111/issue-1/i2022050/Ecosystem-Functions-of-a-Spring-Fed-Tributary-in-Providing-Foraging/10.1643/i2022050.full — 湧水支流 [F-03]
- https://sfs-2026.p.asnevents.com.au/days/2026-05-19/abstract/134757 — 同上の学会要旨 [F-03]
- https://catalog.lib.kyushu-u.ac.jp/opac_download_md/10879/p073.pdf — 稚魚の定位候補 [F-04]
- https://catalog.lib.kyushu-u.ac.jp/opac_download_md/23570/p173.pdf — 淵・採餌時間帯の候補 [F-05, F-08]
- https://www.fish.rd.pref.gifu.lg.jp/kenkyu-houkoku/pdf-61-70/63-001.pdf — 岐阜県、産卵床・稚魚の候補 [F-04, F-21]
- https://www.fish.rd.pref.gifu.lg.jp/kenkyu-houkoku/pdf-61-70/61-001.pdf — 岐阜県、産卵の候補 [F-21]
- https://www.fish.rd.pref.gifu.lg.jp/gijutsu/shingyo-horyu/130213-shingyo-horyu.pdf — 淵・放流の候補 [F-05]
- https://www.pref.tochigi.lg.jp/g65/documents/kennkyuuhoukoku07_22.pdf — 栃木県、淵の候補 [F-05]
- https://www.aomori-itc.or.jp/_files/00229821/226-229.pdf — 青森県、摂餌の候補（内容は未確認）[F-08]
- https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html — 水温上限 [F-07]
- https://www.env.go.jp/council/09water/y0910-03/mat03.pdf ／ https://www.env.go.jp/info/iken/h180317a/a-2.pdf — 生息流速（継承）[F-06]
- https://www.hro.or.jp/upload/41034/81-kawamura.pdf ／ https://agris.fao.org/search/fr/records/647242bb53aa8c896303bf5d — 稚魚の日周移動 [F-19]
- https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ https://agriknowledge.affrc.go.jp/RN/2010927243.pdf ／ https://www.pref.yamanashi.jp/documents/65434/jiho42_p50-51.pdf ／ https://www.daiwa.com/jp/live_with_nature/riverwalkstory/1256788_14582 — 産卵行動の候補 [F-22]
- https://www.pref.nagano.lg.jp/suisan/joho/sakanatachi/yamame.html — 長野県水産試験場 [F-23]
- https://www.honda.co.jp/fishing/enjoy/season/season-201704/step-2/ ／ https://www.honda.co.jp/fishing/enjoy/season/season-202107/step-2/ ／ https://www.honda.co.jp/fishing/picture-book/yamame/trap01/ — 釣り情報 [F-09, F-23]
- https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol41.html ／ .../vol35.html ／ .../vol57.html — 釣り情報 [F-10, F-23]

**順位・縄張り・研究者**
- https://link.springer.com/article/10.1007/BF02678571 ／ https://link.springer.com/article/10.1023/A:1007363927379 — 4種の順位 [F-12, F-14]
- https://www.biorxiv.org/content/10.1101/364182.full.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/14656/JFE2006-21-3.pdf — Nakano 書誌の確認 [F-14]
- https://sites.warnercnr.colostate.edu/kanno/wp-content/uploads/sites/112/2022/03/Futamura-et-al.-2022-Size-dependent-growth-tactics-of-masu-salmon.pdf ／ .../2025/08/Futamura-et-al.-2025-Annual-variation-in-riverscape-habitat-use-by-masu-salmon-smolt.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/87777/Maintext_fig_oecologia.pdf — [F-13]
- https://www.redalyc.org/pdf/3699/369944289001.pdf ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC33350 — 陸生無脊椎動物 [F-11]
- https://www.kyoto-u.ac.jp/research-news/2025-10-23 ／ https://nrid.nii.ac.jp/nrid/1000050217791/ — 中野繁の紹介候補（内容は未確認）[F-26]

**PROXY（他のサケ科）**
- https://sitesreservoirproject.riptideweb.com/references/REF23/Volume%202/App11M_Yolo_Sutter_Bypass_Weir_Spill_Analysis/Grant%20and%20Kramer_1990_Territory%20Size.pdf — [F-15]
- https://pubs.usgs.gov/publication/70269370 — [F-16]
- https://www.sfu.ca/biology/faculty/dill/publications/f84-139.pdf ／ https://www.sfu.ca/biology/faculty/dill/publications/z78-198.pdf ／ https://ouci.dntb.gov.ua/works/27PYVMx4 ／ https://openscholar.uga.edu/record/11698?ln=en — 反応距離 [F-17]
- https://theses.gla.ac.uk/id/eprint/75895 ／ https://theses.gla.ac.uk/75895/1/13818631.pdf — 冬の夜行性 [F-20]
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3656933/ — [F-24]
- https://vocal-communication.bio.bris.ac.uk/pdfs/Rapid_recovery.pdf ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6634859 — [F-25]

**ローカル（P）**
- /home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json 〜 catalog_c07.json — [F-27〜F-30]
- /home/user/gerupamasini/docs/yamame/research/r09_swim_transient.md — 継承 [F-18]、関連 F-10〜F-14, F-25

---

## 6. 検索ログ（クエリ・mode・有用度）

総検索回数: **21 回**（standard 21、extended 0）。割当 26 回以内。注記: S06 は結果が3ブロック、S14 は4ブロック、S20 は2ブロックで返った（ツール内部で複数回検索された可能性。内部ラウンド数を足すと最大27回相当になりうるが、予算超過の通知は一度も出ていない）。

| # | クエリ（要旨） | mode | 有用度 |
|---|---|---|---|
| S01 | ヤマメ 定位 流速 水深 採餌 流下 定位点 | standard | 中（淵内の定位、淵の効果1.5倍、岐阜県産卵床） |
| S02 | ヤマメ 縄張り 体長 面積 追い払い 攻撃 優位個体 … 中野繁 | standard | 低（一般情報のみ） |
| S03 | ヤマメ 夜行性 昼間 夜間 活動 日周 … 越冬 | standard | 無〜低 |
| S04 | Nakano 1995 Individual differences … dominance hierarchy … masu salmon | standard | 中（書誌の確認のみ） |
| S05 | masu salmon focal velocity water depth position drift feeding … habitat suitability | standard | 高（登川の秋・冬の値、湧水支流） |
| S06 | サクラマス幼魚 ヤマメ 縄張り 順位制 … Nakano … Journal of Animal Ecology | standard | 中（Nakano Can J Zool の書誌、水中釣りの手法） |
| S07 | territory size body length juvenile masu salmon … | standard | 中（多種の順位、Futamura、キングサーモンの縄張り） |
| S08 | masu salmon parr diel activity nocturnal diurnal drift feeding … | standard | 中〜高（稚魚の日周移動、冬の夜行性） |
| S09 | ヤマメ 越冬 冬季 水温 低下 淵 深み 岩陰 … | standard | 低〜中（水温上限25℃、流速嗜好の日内変化） |
| S10 | ヤマメ 当歳魚 1歳魚 定位位置 流速 cm/s 水深 cm … | standard | 高（稚魚の定位の数値、産卵床の数値） |
| S11 | ヤマメ 警戒心 人影 足音 水面 影 逃げる 距離 釣り … | standard | 中（Cランクの定性） |
| S12 | aggressive interactions foraging behaviour microhabitat use four sympatric stream fishes masu salmon … | standard | 高（4種の順位） |
| S13 | Nakano 1995 Competitive interactions for foraging microhabitats … | standard | 低（書誌の確認のみ） |
| S14 | ヤマメ 流下物 摂餌 行動 定位位置から … 元の位置に戻る 摂餌頻度 | standard | 中（数値なし。季節別の摂餌時間帯） |
| S15 | salmonid drift feeding reaction distance attack distance return to focal position … | standard | 中（PROXY、出典未特定） |
| S16 | ヤマメ 摂餌行動 春先には水温が上昇する時刻に多量に摂餌 … | standard | 低（S14 の再確認と流速嗜好） |
| S17 | Grant Kramer 1990 Territory size as a predictor … | standard | 高（回帰式） |
| S18 | ヤマメ 産卵行動 雌 尾鰭で河床を掘る 雄 婚姻色 … | standard | 中（産卵行動・婚姻色） |
| S19 | juvenile masu salmon winter habitat use concealment cover … | standard | 中（F-01, F-02 の再確認） |
| S20 | trout flight initiation distance approaching observer human disturbance … | standard | 低〜中（サケ科の FID の数値なし。大西洋サケの群れの反応） |
| S21 | Kawaguchi Nakano 2001 terrestrial invertebrates annual resource budget … | standard | 中（53%、二次引用） |

**所感**: 日本語の県資料・釣り情報は定性的な記述が多く、数値は稚魚の定位、産卵床、登川の幼魚の3系統に限られた。要約が出典PDFを特定しない例が多く、候補URLの列挙に留めた。中野繁らの中身の数値は、論文の本文が読めない制約で取得できなかった。
