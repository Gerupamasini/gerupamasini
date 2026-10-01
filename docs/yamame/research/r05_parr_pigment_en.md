# Parr marks, chromatophores and pattern formation in salmonids (English) — r05

> **版: v2（検索による更新版）。** 初版（検索 0 回・二次転記と写真集計のみ）に対し、WebSearch を **31 回** 実行して裏取り・補完した（割当 30 回を 1 回超過。末尾の検索ログ参照。最後の 1 回は有用情報ゼロ）。
>
> **調査方法の制約（必読）**
> - 情報源は WebSearch の「タイトル・URL・モデル生成の要約」だけで、**論文全文は 1 本も読んでいない**。下記の [A] は「要約文中に数値/記述が明示されている」という意味であり、全文確認済みという意味ではない。要約が複数 URL を混ぜて出力する場合があり（r01〜r03 で実例あり）、**どの URL の記述か特定できないものは出典欄に「帰属不確実」と明記し、ランクを [B]/[C] に下げた**。
> - 要約に数値が無かった事項（パーマーク間隔の統計、体色変化の速度・範囲、ヤマメの色素胞の層構造、パーマーク出現時の体長 など）は**採用せず Gap とした**。
> - **証拠ランク**: A=査読論文・学術書・公的機関資料で、要約に数値/記述が明示 / B=図鑑・自治体・博物館・信頼できる解説（または帰属不確実な学術的記述） / C=Wikipedia 系・釣り/一般サイト・出典不明・AI 生成百科 / M=調査員の記憶（未検証） / **P=ユーザー提供の写真 70 枚（`docs/yamame/photo_analysis/catalog_c01〜c07.json`）の AI 注釈からの観察・集計**（文献ではない。スケール・照明・色再現に不確実性）。
> - **PROXY**: ヤマメ（河川型 *O. masou masou*）以外のデータは scope に "PROXY:○○" と明記した。**本ストリームの新規検索で得た英語文献の大半は PROXY（アマゴ、ブラウントラウト、ニジマス、大西洋サケ、ギンザケ、イワナ類）であり、ヤマメ自身の色素胞・パーマーク発生の一次データではない。**
> - 転記元の表記: 「r03 F-17」= `r03_lifestage_sex.md` の F-17、以下同様。F-01〜F-26 は初版の番号を維持（一部の注記・ランクを更新）。F-27 以降が今回の追加。

---

## 1. 要約（仕様に直結する結論）

1. **パーマーク数は遺伝性が高い**: ヤマメで親子回帰の遺伝率 **0.400**、子の数は特に**雌親魚**の数に影響され、孵化後 4 か月以降に選抜可能（岩手県、[A]）。大西洋サケ（PROXY）でも parr mark 数の QTL と、コントラスト分散の **26%** を説明する QTL がある。→ 個体生成では「個数」「コントラスト」を互いに独立な遺伝的軸とし、集団（河川・由来）ごとに平均がずれる設計が根拠を持つ。 [F-28][F-29]
2. **個数の分布**: 青森県の公的報告は **8–10 個**[A]。他資料は 6–9 / 7–10 / 9–10 と食い違う。写真注釈（yamame ラベル n=54、片側可視数）は 5–12、最頻 8–9、平均 8.6（SD 1.4）。ブラウントラウト *S. t. macrostigma* は 11–13 個（PROXY）。→ 一点値にせず「7–10 を中心、5–6 と 11–12 を稀な裾」。 [F-01][F-02][F-21][F-30]
3. **形成過程のモデル**: アマゴの早期発生では「縞」から出発し、**向きの変更とピーク挿入**を経て、成長とともに**ジグザグ状の斑**に至る過程が、成長するドメイン上の **Turing 型反応拡散モデル**で再現される（Phys. Rev. E 2011、PROXY:アマゴ、[A]）。写真の「千鳥配置・上下分離・隣接融合/二重化」（F-22）はこの種の過程と整合的だが、**これは調査員の推論**で、モデルパラメータ・特性波長は取得できていない。 [F-31][F-22]
4. **反応拡散の一般性**: 「局所自己活性化＋長距離抑制」型 RD モデルは、反転した斑（白斑 vs 黒斑）の親種を交雑すると**迷路状**の中間型を必ず生むと予測し、サケ科交雑で確認された（Nat. Commun. 2010、[A]）。→ 手続き生成で斑↔迷路↔縞をパラメータ連続変化で作る根拠。ヤマメのパーマーク固有の係数は無い。 [F-32]
5. **皮膚の層構造（PROXY:トラウト）**: トラウト皮膚の主要な色素胞はメラノ・キサント・イリドの 3 型（＋ブラウントラウトでエリスロ）。**明暗の差は主にメラノフォアの位置と密度**で決まり、暗い領域ではメラノフォアが他の色素胞を覆い、明るい領域ではイリドフォアとキサントフォアが露出する。真皮深部（stratum compactum の下）にイリドフォア層がある。 [F-33]
6. **黒斑・赤斑の細胞構成（PROXY:ブラウントラウト）**: 黒斑＝多数のメラノフォア＋type 1 エリスロフォア＋type L イリドフォア（キサントフォア無し）、赤斑＝type 2 エリスロフォア（大型の erythrosome）のみ。ヤマメの朱点は基本無いため、これは「稀な朱点を作る場合の構造」の参考に留まる。 [F-34][F-12]
7. **斑の暈（halo）**: ブラウントラウトでは多くの斑が淡色の暈で囲まれる（[C]、PROXY）。ヤマメの暈の文献は無し。写真ではアマゴ疑い個体 p070 の赤褐斑のみ「淡い暈」。→ ヤマメの黒点に暈を既定で付ける根拠は無い。 [F-35][F-24]
8. **銀化（スモルト化）**: parr→smolt はグアニン結晶の皮膚沈着で銀白化し、パーマークが覆い隠される。PROXY の記述で、**鰓蓋の斑は銀化後も見える**、**鰭縁が黒化する**。masu では 2 段階（parr→silvery parr→smolt）でグアニン/ヒポキサンチンが増加（[B]）。河川残留ヤマメのパーマーク低下は「サイズ連動」と「銀化マスキング」の両方がありうる（機構は未確認）。 [F-36][F-04][F-06][F-05]
9. **背景適応の体色変化**: サケ科幼魚は基質の明るさと頭上照度に応じて体色を変える（[B]、帰属不確実）。ニジマスのメラノフォアは MSH で分散、α2 作動で凝集（薬理試験、[A]）。**変化速度・色域の数値は見つからず、仕様化できない**。実装は「明暗が連続的に変わる」程度に留め、数値根拠を主張しない。 [F-37][F-38][F-19]
10. **保護色としての機能は議論が割れる**: ギンザケ幼魚で基質色選好と反射率から背景一致（パーマークは波長吸収、銀色の側面は無彩色反射）が示された（[A]、PROXY）。一方、イワメ–アマゴ比較では体側模様は中立進化で隠蔽・縄張り効果はほぼ無いとされる（[A]、PROXY:アマゴ）。 [F-39][F-41]
11. **優劣・攻撃性との関係**: パーマークそのものと優劣を結ぶ資料は見つからず。関連資料は (a) 黒色メラニン斑の多さ（ニジマス・大西洋サケ）とストレス応答/攻撃性の推測（養殖ニジマスでは相関なし）、(b) 強膜色（優位個体は安定して淡色）、(c) 早熟 parr は高順位・高攻撃性。成熟雄はパーマークが「くっきり」見える（[B]）。 [F-42][F-16]
12. **種間差**: coho は幅が狭く間隔が広い、chinook は大きく間隔より幅が広い、steelhead/rainbow はほぼ円形、pink は無し（[B]、PROXY）。ヤマメの縦長楕円の形は日本資料と写真に従い、他種の記述は流用しない。 [F-43][F-22]
13. **左右差・個体差**: パーマークの左右差を測った資料は見つからず（写真も全レコード片側のみ）。太平洋サケの計数形質（鱗・鰓耙・鰓条骨）では左右非対称が普通（鱗で比較の約 72%）。→ 左右は完全ミラーにせず独立にサンプルするのが妥当（調査員の推論）。 [F-45][F-22]
14. **パーマークの幾何（写真）**: 高さ/眼窩外径の比は yamame 29 枚で中央値 1.9（平均 2.06, SD 0.96, 範囲 0.85–5.5、斜視・歪みを含み精度低）。縦長楕円で前方ほど細く傾き、後方ほど短い。間隔は不均等。 [F-27][F-22]
15. **パーマークは成長で薄れ、大型で失われる**（Kato 1991 [A]、栃木県の判別基準は全長 31 cm 以上）。神奈川県図鑑は「成魚にも見られる」で食い違い。ブラウントラウトは「若い成魚で残り、成魚で消える」との記述（[C]）。→ サイズ連動でコントラストを下げ、消失閾値は固定しない。 [F-04][F-40]
16. **朱点**: ヤマメは基本無し・アマゴは有り（[B]）。丹沢ヤマメには少数の朱点が入る沢があり、神奈川の陸封個体群は遺伝的にアマゴに近い（[A]）。→ 朱点は「無し」を既定、低頻度で少数・連続変異。 [F-12][F-10][F-09][F-24]
17. **鰭**: 白い前縁は写真 70 枚中約 38 枚で記述（[P]）。他のサケ科でも「白い前縁（＋その後ろに黒帯、ブラウントラウトは更に赤）」が識別形質として挙げられる（[B]、PROXY）。脂鰭の縁取りは暗色・白・無しが混在し橙縁は無い（[P]）。ニジマスは脂鰭が黒縁、coho は暗縁（[B]、PROXY）。 [F-25][F-26][F-46]
18. **鰓蓋・頭部**: 鰓蓋に明確な黒斑は写真で一貫せず、項・頬・鰓蓋の小黒点は数個〜約 12 個の個体がある（[P]）。PROXY では銀化後も鰓蓋の斑は残る。 [F-26][F-36]
19. **最大の未解決**: ヤマメの色素胞・赤み（側線部の紅、胸鰭の橙黄）の由来、パーマーク間隔の統計、体色変化の速度・範囲、パーマーク出現時期（体長）は文献で取得できず。仕様化する場合は「見た目の根拠は写真 P、機構は PROXY」と明記すること。 [F-24][F-33][F-44][Section 4]

---

## 2. Findings

### Part A. 日本語公的資料・学術要約からの二次転記（r01 / r02 / r03 由来。初版から維持）

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
- 主張/値: **パーマークは体の成長とともに薄れ、大型個体では失われる。** Kato (1991): 大型のアマゴ・ヤマメ（河川/ダム湖、福井県）は体側の朱点の有無と鱗の特徴で種間差が明瞭、**両者とも体が大きくなるとパーマークを失う**。降海型に似るが尾柄高・鰭の大きさ・鱗のパターンに幼魚の特徴を残す。河川で育った大型ヤマメは 2 歳以上で約 300 mm（測定量不明）。栃木県の判別基準: ヤマメは「パーマークと腹部青斑点の両方あるいはいずれかが確認でき、全長 30 cm 以下」、サクラマスは「全長 31 cm 以上でパーマークと腹部青斑点の両方が確認できない」。**対立する記述**: 神奈川県図鑑は「小判型のパーマークが並び、成魚にも同じように見られる」。ブラウントラウトについては F-40 参照（PROXY）。
- 適用範囲: ヤマメ/アマゴ（福井県の大型個体）、栃木県の調査上の判別基準（生物学的境界値ではない）、神奈川県図鑑（「成魚」の定義が不明）。
- 出典: 加藤文男 (1991)「大型アマゴ・ヤマメの形態及び生態に関する知見」水産増殖 39(3):279–288. https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ ／ 栃木県 https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf ・ https://www.pref.tochigi.lg.jp/g65/documents/sakuramasu2016ankeitomatome.pdf ／ 神奈川県 https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html （転記元 r02 F-12/F-13/§3、r01 F-14/F-15）
- 証拠: [A]（査読誌の書誌、要約に記述明示。二次転記・要原典確認）r02 要約より「Both Amago and Yamame lose their parr marks as their bodies grow larger.」栃木県の基準は [B]。

### F-05
- 主張/値: **スモルト化＝パーマークが消えて体が銀白色になる。降海は 4–6 月ごろ**。銀化は銀白化が強まり体側の斑紋がほとんど見えなくなることとされる（今回の検索でも岩手県関連の要約が同文を返した）。PROXY の一般則として移行途中（transitional）の個体が存在し、ある調査では降海個体の 50% が完全に銀化、45% が移行期、5% が parr 様の体色を保持（種・文書不明）。
- 適用範囲: (a) ヤマメ/サクラマス（B）。(b) PROXY:サケ科一般（種・出典不明）。
- 出典: (a) 群馬県 https://www.pref.gunma.jp/page/20806.html ／ https://www.honda.co.jp/fishing/picture-book/sakuramasu/index.html ／ https://agriknowledge.affrc.go.jp/RN/2030927242.pdf (b) https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf （転記元 r03 F-18。文書特定不能）
- 証拠: (a) [B]「パーマークが消えて体が銀白色になり(スモルト化)、4~6月ごろに海へと下ります」(b) [C/PROXY]「50% of seaward migrants were completely silvered, 45% were in a transitional phase, and 5% still retained coloration characteristics of parr」。

### F-06
- 主張/値: parr から smolt への変化（暗色の parr → 銀色の smolt）は皮膚へのグアニン結晶の沈着による。masu salmon では **parr→silvery parr、silvery parr→smolt の両方の移行でグアニンとヒポキサンチンが顕著に増加**。ただし大量のグアニンが銀化の見た目と必ずしも相関しない。**今回の検索で「グアニン結晶の沈着が銀化の原因」というサケ科一般則は複数の要約で再確認された（F-36）**が、masu 固有の上記文の原典は依然として特定できていない。
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
- 主張/値: 三重県三国谷の**イワメ（体側模様を欠く型）とアマゴ**の比較で、成長・体サイズ・摂餌・性比・肥満度などに基本的差が無く、**本質的な差は体側模様のみ**。→ 模様は体型・生態と独立に変異しうる。（機能面の含意は F-41）
- 適用範囲: PROXY:アマゴ（イワメ型）。
- 出典: 森誠一・名越誠 (1986) 三重県三国谷のイワメとアマゴにおける形態比較. 三重大学水産学部研究報告 13:135–143. https://cir.nii.ac.jp/crid/1050001202938999296 ／ https://mie-u.repo.nii.ac.jp/records/5636 （転記元 r01 F-19）
- 証拠: [A]（書誌と要旨が要約に明示、二次転記）「the only essential difference between them is their side patterns」（要約）。

### F-12
- 主張/値: **ヤマメの識別に使われる赤色斑**: マス（ヤマメ）・アマゴ・ビワマスは形態・計数形質が互いによく似ており、鱗の形態と、幼魚・成魚の**側線上下の赤色斑の有無**が識別形質。**アマゴは側面に朱点があり、マス（ヤマメ）は黒点のみ**。神奈川県図鑑は「小判型のパーマークが並び、成魚にも見られる。アマゴと異なり朱点はない」。東京都: アマゴは体側に 7–11 個の青色パーマークと朱点。Kato (1991) も「体側の朱点の有無と鱗の特徴で種間差が明瞭」。今回の検索（日本語）でもアマゴ＝朱点あり・ヤマメ＝朱点なしが再確認された（神奈川県アマゴ図鑑 https://www.pref.kanagawa.jp/docs/a4y/images/amago.html、[B]）。
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
- 主張/値: **早熟雄（成熟した河川残留雄）は、未成熟魚に較べ体高が高く、体色が暗色化し、体側のパーマークが未成熟魚よりくっきり見える**。海水適応能は発達せず、二次性徴（鼻曲り等）はほとんど発達しない。社会行動面は F-42（早熟 parr は高順位・高攻撃性、種は未確認）。
- 適用範囲: サクラマス（ヤマメ型）の早熟雄（parr）/ 北海道系の研究と推定、地域は要約に無し。
- 出典（候補・特定不能）: https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_16-00006/_article/-char/ja/ ／ https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_22-00024/_pdf ／ https://esj.ne.jp/meeting//abst/61/S05-2.html ／ https://fra.repo.nii.ac.jp/record/2009615/files/sapporo_sk_13_3.pdf （転記元 r03 F-05/F-09）
- 証拠: [B]（文書特定不能のため A から1段下げ）「体高が高く、体色が暗色化しており、体側にある斑紋（パーマーク）が未成熟魚よりもくっきりとして見え」。

### F-17
- 主張/値: **河川型ヤマメ成熟期の体色は資料間で不一致**（最大の未解決事項）。(i) 河川で性成熟したヤマメは「体色は黒ずむが、サクラマスのように桜色にはならない」（複数クエリで再現、B）。(ii) 「体全体が黒っぽくなり、薄い桃色から濃い紅色までの婚姻色が体側からヒレなどに不定形に表れる」（Wikipedia 系の可能性、C）。(iii) 国土交通省多言語 DB: 成熟した masu salmon は「背が暗化、体側の stripes が緋色〜深紅になり腹部で一つの淡色の縦帯に融合、pink になる」（B、対象型・「stripes」がパーマークか不明）。PROXY:降海型雄は黒ずみ＋体側に不定形な雲状の桜色（桃色）斑（B）。
- 適用範囲: ヤマメ（河川型）産卵期（秋）/ 雌雄の区別は要約に無し。
- 出典（候補）: https://www.mlit.go.jp/tagengo-db/en/R2-00580.html ／ https://www.mlit.go.jp/tagengo-db/R2-00580.html ／ https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja （関・小島 1977「吾妻川起源のヤマメの銀毛化変態と成熟に関する研究」、今回の検索でもタイトルのみヒット・内容未取得）／ https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 （転記元 r03 F-01〜F-04）
- 証拠: [B]（MLIT）「A masu salmon which has reached sexual maturity has a darkened back, and the stripes on the body sides become bright red with crimson tinge to merge on the abdomen into one common longitudinal band of lighter color.」

### F-18
- 主張/値: 埼玉県の研究: **放流魚（養殖魚）は天然魚に比べ色彩が薄く体型が丸い**、鰭が欠けている/色がくすむ傾向。10 月放流魚は体色・体型とも天然魚に近く、12 月放流魚は体色のみ近い（1991 年度）。
- 適用範囲: ヤマメ（成魚放流・埼玉県）。
- 出典: https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html （転記元 r01 F-20）
- 証拠: [B]「放流魚（養殖魚）は天然魚に比較して、色彩も薄く、体型も丸いなど」（要約）。

### F-19
- 主張/値: 魚類の体色変化の一般機構: 背景の明るさの変化に応じ、ホルモンと神経が色素胞に作用して色素顆粒が分散・凝集する。急な温度変化は体色変化の速度に影響する。別の魚種では、優位個体は明るい基質により馴染み、従属個体は暗色を示した。**今回の追加検索でもヤマメ固有の資料は見つからなかった。サケ科（ニジマス・ギンザケ等）の PROXY 資料は F-37〜F-39 に記載。変化速度・色域の数値は依然として皆無。**
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
- 出典: `docs/yamame/photo_analysis/catalog_c01.json`〜`catalog_c07.json`（集計は初版で実施）。
- 証拠: [P] 注釈例（p001）「縦長の明瞭なパーマーク約10本」。文献値 8–10（F-01）と整合的だが、文献の数え方との同一性は未確認。

### F-22
- 主張/値: **パーマークの幾何と不規則性**（注釈の記述）: (1) 縦長の楕円〜やや前傾した帯状。前方ほど細く傾き、後方ほど短い楕円・円形に近づく（p001, p011, p013）。(2) 濃さは前方または中央部が最も濃く大きく、後方ほど淡く細い（p002, p013, p051, p053）。(3) 間隔は不均等（p001: 約 35–65px、p041: 50–60px で尾側ほど狭く小さい、p049: 70–125px）。(4) 背側のみの中間マークが主マークの間に交互に出る（p011 約 4 個）。(5) 斑が前後・上下にずれる千鳥配置、一部が側線を挟んで上下に分離（p022, p032, p033, p069）。(6) 隣接マークの融合・二重化（p012, p013, p033）。(7) 体側の円形斑と一部が接する（p012）。(8) 上端が背面の暗帯に融合（p051）。**左右の比較は、全レコードが片側のみのため評価不能。**
- 適用範囲: 写真 70 枚の注釈。px はスケール無し。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（parr_marks.irregularities）。
- 証拠: [P] 注釈例（p033）「多くの斑が体側上部と下部(側線下)で上下に分かれて位置が少しずれる千鳥状。第5斑付近で斑が二重化。」

### F-23
- 主張/値: **側線下の円形斑（青灰〜黒）**: 注釈 70 件中 59 件で個数または配置が記述され（6 件は判別不能）、うち約 20 件が青灰〜青黒と記述。個数・大きさの個体差が極めて大きい: p003 黒い丸斑約 30（径 10–25px、体中央〜腹側に 2–3 列で中央部に密）、p002 青灰の丸斑約 9（12–28px）、p004 青灰約 10（12–25px）、p011 青黒の小円約 12–14 が横一列（径は眼径の 0.2–0.5 倍、体中央が最大）、p012 灰黒の小円斑 60 超（4–8px、3–4 列の不規則配置）、p013 黒い円斑約 8（20–30px、前半で大きく後半で小さい）、p014 B 魚で 3–4 個。**栃木県・群馬県の判別基準に出る「腹部青斑点」に対応する可能性があるが、これは調査員の推論で資料の主張ではない。**
- 適用範囲: 写真 70 枚（側線下が水の歪み等で判別できないものを除く）。個体の大きさ・解像度・距離が違うため個数は比較精度が低い。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（spots.black_below_LL）。対応づけ候補の文献: https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf ／ https://www.pref.gunma.jp/page/20806.html
- 証拠: [P] 注釈例（p012）「LL下に径4-8pxの灰黒の小円斑が60個以上、3-4列の不規則な列で並び、腹側まで広がる」。

### F-24
- 主張/値: **赤橙色の斑と側帯**: 赤橙斑が「あり」と記録されたのは yamame ラベル 57 枚中 3 枚（p001: パーマーク間の拡散した鮭肉色斑 4–5 個, sRGB 中央値≈(165,113,92), Lab a*≈18, 輪郭不鮮明; p033: 鮮橙 1 個（径約 5px）＋面的な淡橙帯; p038: 約 3 個だが過露出で白に近く判別不確実）。amago_or_hybrid_suspect 5 枚中 4 枚（p019: 橙赤〜朱色≈(202,114,68), 径 4–8px, 輪郭明瞭な円形; p057: ≈(178,105,70); p037: 朱赤〜赤橙, 径 3–6px; p070: 鈍い煉瓦赤〜桃で淡い暈を伴う）、unclear 2 枚（p065, p066: 暗い錆赤で、黒点が赤褐色化したものの可能性）。**体側の側帯（サーモンピンク〜橙の拡散帯）は 70 枚中 39 枚で記録**。例: p002 ≈(219,190,162)、p013 ≈(223,191,167)、p025 ≈(206,181,140)。p001 は「明確なピンクの縦走帯ではなく橙色味」。
- 適用範囲: 写真 70 枚。ラベル付けに赤斑を使っているため循環あり。色は水膜グレア・露出の影響を受ける（信頼度 med 中心）。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（spots.red_orange_spots, lateral_band）。
- 証拠: [P] 注釈例（p019）「橙赤〜朱色（中央値約sRGB 202,114,68）。径約4-8px、輪郭は明瞭で円形。」

### F-25
- 主張/値: **鰭の前縁が白い**: 腹鰭・臀鰭・背鰭などに「白い前縁/白縁」と記述された写真が 70 枚中約 38 枚（文字列検索による概算。偽陽性を含みうる）。例: 腹鰭（p005, p007, p016, p024, p028, p032, p033, p039, p042）、臀鰭（p009, p016, p024, p029, p032, p033, p034, p035, p037, p045, p049, p052, p058, p061, p066）、背鰭（p010 半透明で白縁、p029 半透明クリーム黄で前縁白）、胸鰭（p013 橙黄色で前縁に白い鰭条、p044/p045 黒灰の鰭で前縁に青白い縁）。**白縁の直後に暗色帯が記述されたのは、本版の正規表現による再検索（概算）で p016（暗灰の鰭条＋白い先端）と p044（黒灰の鰭＋青白い前縁）の 2 枚のみ**で、ブラウントラウトやブルックトラウトの「白縁→黒帯」（F-46）のような二重縁は、ヤマメ写真では一貫して確認されない。**鰭の色**: 胸鰭は橙黄〜琥珀（p001 ≈(196,152,82), p013 ≈(191,152,68)）、腹鰭・臀鰭は半透明の青灰〜クリーム〜淡黄〜桃、基部が橙褐〜赤褐の例（p052 臀鰭基部が赤褐色, p049 臀鰭の下縁が赤橙）。
- 適用範囲: 写真 70 枚。水中・水面反射や鰭が擦れた部分が白く見える可能性（p026 は「擦れ/反射の可能性」と自注）。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（fins）。文献側: HRO（降海期に背鰭先端に白色部を持つ個体あり）https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 証拠: [P] 注釈例（p016）「白い前縁と暗灰の鰭条、先端が白い。」

### F-26
- 主張/値: **脂鰭と頭部/鰓蓋の斑**。脂鰭: 70 枚中、形状・色まで記述できたのは約 14 枚（残りは不可視・不確実）。小さい葉形で、灰・淡灰・クリーム色・灰青・灰紫・灰緑の半透明（p012, p016, p017, p018, p021, p023, p029, p032, p033, p049）。**縁取りは暗色（p040「縁に暗い縁取り」, p064「黒い縁取り」）、白縁（p016）、縁取り無し（p031「縁取りの黒はなし」, p032「縁取りの橙/黒なし」, p033, p049）が混在し、橙縁は確認されなかった**（p059 も「橙縁は確認できない」）。p029 は根元に黒い線。p031（unclear ラベル）は赤褐〜褐色の脂鰭。頭部/鰓蓋: 鰓蓋は銀褐色に淡桃褐のまだら（p001）、淡ピンク〜ラベンダーの虹彩光（p010）、橙褐色の大きな斑状（p012）、銀（p009）。項・頬・鰓蓋の小黒点は、p002 で 2 個、p004 で約 12 個（吻・頬・項）、p011/p013/p014 で数個、p009 では無し。**明確な「鰓蓋の黒斑」は一貫して確認されず**（p041 に暗色ぼかし 1 個のみ）。
- 適用範囲: 写真 70 枚。焦点外・遮蔽・水膜で判別できない個体が多い。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（fins.adipose, spots.opercle_head_spots）。
- 証拠: [P] 注釈例（p064）「暗褐色の小さな葉状、黒い縁取り」、（p032）「灰紫色の小さな楕円形、半透明、縁取りの橙/黒なし」。

### F-27（新規・写真集計）
- 主張/値: **パーマーク高さ ÷ 眼窩外径（注釈中の倍率表現を正規表現で抽出）**: yamame ラベル 57 枚中 29 枚で倍率が抽出でき（範囲表記は中点を採用）、**中央値 1.9、平均 2.06、SD 0.96（母集団 SD）、範囲 0.85–5.5**。多数は 1.2–2.5 倍に分布（昇順: 0.85, 0.9, 1.1, 1.2, 1.3, 1.4×4, 1.6×2, 1.7, 1.75, 1.9×2, 2.0×5, 2.2, 2.25, 2.5, 2.75×2, 3.5×3, 5.5）。**左右別の片側可視数（yamame ラベル、別個体）**: lateral_left n=25 で平均 8.4（範囲 5–11）、lateral_right n=23 で平均 8.96（範囲 5–12）、multi_fish n=5 で平均 8.4、oblique_rear n=1 で 7。
- 適用範囲: 写真注釈。眼窩外径の測り方（虹彩環か眼窩外径か）、斜視、屈折歪み、パーマークの「高さ」の取り方が注釈ごとに異なる（p003 は眼窩外径 75–90px、p011 は「斜め撮影のため参考値」）。**左右の差は別個体の集団比較であり、同一個体の左右非対称の証拠ではない**（左右差は評価不能のまま）。倍率が 5.5 や 3.5 の個体は眼が小さく写った遠近・ピンボケの可能性を排除できない。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（parr_marks.height_vs_eye_diameter, visible_count_one_side, view）。本版で集計。
- 証拠: [P] 注釈例（p001）「マーク高≈55-65px、眼窩外径≈44px … 眼窩外径の約1.3-1.5倍」。

### Part C. 今回の検索で得た文献（新規。要約のみ・全文未読）

### F-28（新規）
- 主張/値: **ヤマメのパーマーク数は遺伝性が高い。** 異なるパーマーク数をもつ親魚の相互交配で、交配区（子）のパーマーク数は親魚のパーマーク数の影響を受け、**特に雌親魚のパーマーク数の影響が大きい**。親子回帰で算出した**遺伝率は 0.400（高い値）**で、パーマーク数には高い遺伝的変異性がある。結論として、パーマーク数の育種は**孵化後 4 か月以降**に個体選択（特に雌親魚の選択）で行うのが効率的。
- 適用範囲: ヤマメ（養殖系統と推定。系統名・年・n・標準誤差・計数方法は要約に無し）/ 岩手県の資料。遺伝率は単一値で信頼区間なし。
- 出典: 岩手県「8yamame-oyako.pdf」（岩手県内水面水産技術センター系の研究成果資料と推定、帰属はファイル名のみ）https://www.pref.iwate.jp/_res/projects/default_project/_page_/001/008/640/8yamame-oyako.pdf（日本語クエリ 2 回で同一文が再現）
- 証拠: [A]（公的機関資料、要約に数値明示）「パーマーク数に関する遺伝率を親子回帰によって算出したところ、0.400と高い値を示し、パーマーク数には高い遺伝的変異性があることが示されている」。

### F-29（新規）
- 主張/値: 大西洋サケ（欧州系×北米系の F1 雄を欧州/北米雌に戻し交配した 4 家系、各 N=300）で、15 形態ランドマークと 2 皮膚色素形質を含む parr 形質の QTL マッピング。**連鎖群 AS22 に parr mark 数の QTL、そのホモログ AS24 に parr mark コントラストの表現型分散の 26% を説明する大きな QTL**。体形・鰭位置の高有意 QTL が 7 連鎖群に 25 個、成長・肥満度が 6 連鎖群に 16 個。出身河川間の成長・体形・皮膚色素の変異の多くが遺伝的であることを裏付ける（Guelph 大の解説）。
- 適用範囲: **PROXY:*Salmo salar*（parr）**。ヤマメの値ではないが、「数」と「コントラスト」が別の遺伝子座で制御されうる点は一般性が期待される（調査員の推論）。
- 出典: Mapping of quantitative trait loci associated with size, shape, and parr mark traits using first- and second-generation backcrosses between European and North American Atlantic salmon (*Salmo salar*). Genome (2017). https://cdnsciencepub.com/doi/10.1139/gen-2017-0026 ／ 解説 https://www.uoguelph.ca/cbs/news/2018/04/genetics-help-power-atlantic-salmon-restoration
- 証拠: [A]「linkage group AS22 contained a QTL for parr mark number; its homolog AS24 contained a large QTL, which explained 26% of the phenotypic variance in parr mark contrast」（要約）。

### F-30（新規）
- 主張/値: *Salmo* 3 種（*S. abanticus*, *S. caspius*, *S. labrax*）と養殖ブラウントラウト 2 エコタイプ（*S. trutta macrostigma*, *S. t. fario*）でパーマークの**数と大きさ（長さ・幅）に群間の有意差**。**最多は *S. t. macrostigma* の 11–13 個**。*macrostigma* のパーマークは発達中安定。11 河川から電気ショッカーで採集した親から人工授精・飼育し、1 年間追跡。
- 適用範囲: **PROXY:*Salmo*（トルコ）**。ヤマメ（8–10 個、F-01）より多い。
- 出典: Kocabaş M., Başçınar N., Kutluyer F. (2016) Indian Journal of Fisheries 63(2):123–126. https://epubs.icar.org.in/index.php/IJF/article/view/51840 ／ https://avesis.ktu.edu.tr/publication/details/f88d45af-00d7-4961-b5fa-377ec4e303b1/comparison-of-number-and-shape-of-parr-marks-in-three-species-of-the-genus-salmo-and-two-ecotypes-of-cultured-brown-trout-salmo-trutta-from-turkey
- 証拠: [A]「The highest number of parr marks (11-13) was recorded in S. trutta macrostigma. Parr marks on the skin of S. trutta macrostigma was found to remain stable during development.」（要約）。

### F-31（新規）
- 主張/値: **アマゴのパーマーク形成の Turing 型モデル。** 成長するドメイン上の標準的な反応拡散モデル（相互作用・拡散するモルフォゲン）で、拡散駆動不安定性が、実験で観察されるパーマーク形成の**一過性（transient）パターン**を再現しうる。アマゴは**早期発生で縞状**を示し、それが**向きの変更（reorientation）とピークの挿入（peak insertion）**を経て、成長とともに**ジグザグ状の斑パターン**になる。表面の成長を実験由来の成長関数でモデル化し、結論として**表面の成長プロファイル、表面幾何、曲率が RD 系の重要因子**。
- 適用範囲: **PROXY:アマゴ（*O. masou ishikawa*、ヤマメと同種 *O. masou* の別亜種/型）**。モデル式、パラメータ、特性波長、体長スケール、パーマーク数への当てはめは要約に無い。
- 出典: Modeling parr-mark pattern formation during the early development of Amago trout. Phys. Rev. E 84, 041923 (2011). https://journals.aps.org/pre/abstract/10.1103/PhysRevE.84.041923 ／ https://research-portal.st-andrews.ac.uk/en/publications/modeling-parr-mark-pattern-formation-during-the-early-development/ （著者名は検索結果の要約に出なかった。記憶では Venkataraman, Sekimura, Gaffney, Maini, Madzvamuse らだが [M]・未検証）
- 証拠: [A]「exhibits stripes during early development that evolve through reorientation and peak insertion to form zigzag spot patterns as the fish grows to adulthood」（要約）。**写真 F-22 の千鳥配置・中間マーク・二重化との対応は調査員の推論。**

### F-32（新規）
- 主張/値: **反応拡散モデルのサケ科での実証。** Miyazawa, Okamoto & Kondo (2010) Nat. Commun. 1:66。「局所自己活性化＋長距離抑制」型の RD モデルが、**反転した斑模様（暗地に白斑 vs 明地に黒斑）の親種を交配すると、必ず迷路状（labyrinthine）の中間型の雑種が生じる**と予測。サケ科交雑（char の雌 × salmon/trout の雄など）で確認。模様が柔軟（flexible）な種同士の交雑で中間型が生じる現象を "pattern blending" と呼ぶ。後続に Sci. Adv. (2020) "Pattern blending enriches the diversity of animal colorations"。一般向け記事は「char とサケ/マスのあらゆる組合せの子が迷路状」と記す。
- 適用範囲: サケ科（char × salmon/trout 交雑）。ヤマメのパーマークではなく、斑・迷路・縞を連続的に作る RD の性質を示す PROXY。モデル式・パラメータは要約に無い。
- 出典: https://www.nature.com/articles/ncomms1071 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC2982180/ ／ https://www.science.org/doi/10.1126/sciadv.abb9107 ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7710386/ ／ 解説（タイトルのみ確認）Metz (2011) Turing patterns: how the fish got its spots. Pigment Cell Melanoma Res. https://onlinelibrary.wiley.com/doi/10.1111/j.1755-148X.2010.00814.x ／ 一般記事 https://www.nationalgeographic.com/science/article/spots-plus-spots-equals-maze-how-animals-create-living-patterns
- 証拠: [A]「crossing between animals having inverted spot patterns … will necessarily result in hybrid offspring that have camouflaged labyrinthine patterns as 'blended' intermediate phenotypes」（要約）。一般記事の「every single combination」は [B]。

### F-33（新規）
- 主張/値: **トラウト皮膚の色素胞と層構造。** 3 種（ブラウントラウト、ニジマス、char）の背・側・腹の皮膚 **60 標本**の組織学的検討で、**メラノフォア、キサントフォア、イリドフォアの 3 型**を確認。メラノフォアは色素の凝集状態/分散状態の両方が見られ、イリドフォアは光反射性の板状結晶を含む**2 型**。**明暗の差は主にメラノフォアの位置と密度に依存**し、暗い領域ではメラノフォアが他の色素胞を覆い、明るい領域ではイリドフォアとキサントフォアが通常露出する。**真皮深部（stratum compactum の下）では、樹状のイリドフォア層が少数のメラノフォアにわずかに遮蔽される**。一般則: イリドフォアはグアニン等のプリン結晶を含み、メラノフォアはメラノソーム、キサントフォアはキサントソーム、エリスロフォアは赤色素、ロイコフォアは白色素。メラニンは可視光をほぼ全て吸収し、キサント/エリスロフォアはカロテノイドとプテリジンを含む。
- 適用範囲: **PROXY:ブラウントラウト・ニジマス・char（種別の内訳は要約に無し）**。ヤマメの皮膚断面の層構造は未取得。層の厚さ・密度の数値は要約に無い。
- 出典: Morphological analysis of chromatophores in the skin of trout（著者名は Semantic Scholar の URL スラッグに "Kaleta" とあるのみ、年は不明）https://www.researchgate.net/publication/281315391_Morphological_analysis_of_chromatophores_in_the_skin_of_trout ／ https://www.semanticscholar.org/paper/Morphological-analysis-of-chromatophores-in-the-of-Kaleta/f5b2ecfff1cc4a279d8a7e5382b88aeab6a26496 ／ Isolation of Chromatophores from Brown Trout (Salmo trutta) Skin. Fishes 7(2):72 https://www.mdpi.com/2410-3888/7/2/72 ／ 一般解説 Australian Museum https://australian.museum/learn/animals/fishes/fish-chromatophores/ ／ 構造 https://link.springer.com/article/10.1007/BF00222271
- 証拠: [A]（PROXY）「the difference between light and dark pigmentation of trout skin depends primarily on the position and density of melanophores, in the dark region covering other chromatophores, and in the light region with the iridophores and xanthophores usually exposed」。一般則（ロイコフォア等）は [B]（博物館解説）。

### F-34（新規）
- 主張/値: **ブラウントラウトの黒斑・赤斑の細胞構成。** 斑のある皮膚領域に 2 型のエリスロフォア: **type 1**（キサントフォアに似た超微細構造だが、カロテノイド小胞のみでキサントソームが無い）が**黒斑**に、**type 2**（カロテノイド小胞よりずっと大きい丸い細胞小器官 "erythrosome" で密に満たされる）が**赤斑のみ**に存在。要約の別の記述では、**黒斑＝メラノフォアが多く、キサントフォア無し、type 1 エリスロフォアと type L イリドフォアあり／赤斑＝type 2 エリスロフォア**（この文の帰属は同論文と推定されるが確定できない）。赤斑で特異的に発現する遺伝子には、メラノジェネシスやキサントフォア分化に関わる遺伝子の**パラログ**が多く、複製遺伝子が新機能を獲得して赤斑に特徴的な細胞亜型の起源に寄与したと示唆。サケ科でエリスロフォアの超微細構造が記載されたのはこの研究が初。
- 適用範囲: **PROXY:*Salmo trutta*（ブラウントラウト）**。ヤマメの黒点・稀な朱点・側線部の紅に同じ構造があるかは未確認。
- 出典: Genetic and correlative light and electron microscopy evidence for the unique differentiation pathway of erythrophores in brown trout skin. Sci. Rep. (2022). https://www.nature.com/articles/s41598-022-04799-7 ／ https://pubmed.ncbi.nlm.nih.gov/35046436/ ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8770521/ ／ 関連 Comparative transcriptome analysis of trout skin pigment cells. BMC Genomics (2019) https://pmc.ncbi.nlm.nih.gov/articles/PMC6509846/ ／ https://link.springer.com/article/10.1186/s12864-019-5714-1
- 証拠: [A]（PROXY）「Type 2 erythrophores … densely filled with one type of round organelle of much larger size than carotenoid vesicles (named erythrosomes) and located only in the red spots of brown trout skin」。

### F-35（新規）
- 主張/値: ブラウントラウトでは**多くの斑が淡色の暈（halo）で囲まれ、しばしば赤みを帯びる。赤斑は淡色の暈で縁取られることがある**。
- 適用範囲: **PROXY:*Salmo trutta***。ヤマメに暈があるかは文献で未確認。写真ではアマゴ疑い p070 の赤褐斑に「淡い暈を伴う」（F-24）のみ。
- 出典: 帰属不確実（このクエリのヒットは Sci. Rep./Fishes のほか https://www.ozanimals.com/Fish/Brown-Trout/Salmo/trutta.html、https://ncfishes.com/?p=3239 など一般サイトを含む）
- 証拠: [C]「Most spots on brown trout are surrounded by a pale halo and often reddish」（要約。査読論文の記述か一般サイトの記述か特定不能）。

### F-36（新規）
- 主張/値: **銀化の色素学（PROXY:サケ科、主にギンザケ）。** 暗色の parr から銀色の smolt への変化は**皮膚へのグアニン結晶の沈着**で、スモルト化の最も顕著な外観変化の一つ。グアニン結晶の層が斑点と幼魚の縞模様を覆い隠すが、**鰓蓋ではそれらがなお見える**（帰属: 米国資料、PROXY）。淡水の parr から降海期の smolt への移行で、環境で誘発されホルモンで調節される色素変化により、**パーマークの消失、体側の銀白化、鰭縁の黒化**が起こる。ギンザケの色素胞は 3 型（メラノ・キサント・イリド）で、構造は皮膚部位・年齢・生理状態で変わる。イリドフォアはグアニン/ヒポキサンチンの反射板を含み、少なくとも 2 つの形状がある。一般則として、parr は縦の暗色縞を持つ若いサケ科、smolt はその縞がスケール/皮膚のグアニンで隠れて銀色になったもの。
- 適用範囲: **PROXY:サケ科（主にギンザケ *O. kisutch*、種は文ごとに異なる/不明）**。ヤマメ河川型の「パーマークが成長で薄れる」現象が銀化マスキングか色素胞の減少かは未確認。**「鰭縁の黒化」は HRO の「降海期の背鰭先端に白色部を持つ個体あり」（F-13）と食い違い**（種・鰭・個体差の可能性）。
- 出典: Gorbman et al. (1982) Morphological indices of developmental progress in the parr-smolt coho salmon, *Oncorhynchus kisutch*. https://www.sciencedirect.com/science/article/abs/pii/0044848682900047 ／ https://www.webapps.nwfsc.noaa.gov/assets/2/7025_06252012_123111_Gorbman.et.al.1982.pdf ／ 鰓蓋・鰭縁の記述は帰属不確実: https://www.npshistory.com/publications/wildlife/nbs-rib/94-37.pdf ／ https://www.cambridge.org/core/product/identifier/S0025315400040625/type/journal_article ／ https://link.springer.com/doi/10.1007/BF00222271 ／ USGS（タイトルのみ）Skin reflectance as a non-lethal measure of smoltification for juvenile salmonids https://pubs.usgs.gov/publication/70180320
- 証拠: [B]（Gorbman の parr/smolt 定義は A 相当だが、鰓蓋・鰭縁の記述は帰属不確実）「Guanine crystals form a layer in the skin and obscure the spots and fingerling markings (although these are still visible on the gill covers)」「loss of parr marks, silvering of sides, and blackening of fin margins」（要約）。

### F-37（新規）
- 主張/値: **背景適応のホルモン制御（要約）。** 黒い背景は血漿 α-MSH を上げて体色を暗化し、白い背景は MCH の産生を増して体色を淡くする（いずれも下垂体/視床下部由来）。サケ科の parr は基質の明るさと頭上照度の強さに応じて体色を変える（crypsis の一部）。形態的（長期）変化は栄養・日射・背景適応・社会的相互作用で起こり、発生的な恒久変化とは別。スモルトのメラノフォアは cryptochrome・melanopsin の発現を伴う光応答を示す。
- 適用範囲: **PROXY:硬骨魚/サケ科（種・出典が文ごとに不明）**。**変化速度（秒/分/日）、明度の変化幅、色域の数値は要約に無い**。ヤマメの実測は皆無。
- 出典: 帰属不確実（このクエリのヒットに https://www.sfu.ca/biology/faculty/dill/publications/j.1095-8649.1984.tb04865.x.pdf 〔F-39〕、https://www.biorxiv.org/content/10.1101/570861.full.pdf、https://journals.viamedica.pl/folia_histochemica_cytobiologica/article/download/FHC.2012.0034/15248、https://nora.nerc.ac.uk/id/eprint/7671/ などが含まれるが、どの文がどれ由来か特定不能）
- 証拠: [C]「A black background increases the plasma levels of α-MSH, which darkens the body color, whereas a white background increases the production of melanin-concentrating hormone (MCH)…」（要約）。

### F-38（新規）
- 主張/値: **ニジマスのメラノフォアは機能的で、MSH に対して分散、続く薬剤で凝集する。α2-アドレナリン受容体の刺激で色素が凝集し「淡い」外観になる。** 凝集応答はメデトミジン添加後 30 分で撮影し 5 段階スケールで評価。ある曝露では**1 日以内に曝露魚が有意に淡色化**した。
- 適用範囲: **PROXY:*O. mykiss*（長期のメデトミジン曝露試験）**。薬理的刺激による淡色化であり、自然な背景適応の速度ではない。ヤマメでは未検証。
- 出典: Colour and melanophore function in rainbow trout after long term exposure to the new antifoulant medetomidine. https://research.chalmers.se/en/publication/123331 ／ https://core.ac.uk/works/289850809
- 証拠: [A]（PROXY・用途に注意）「Rainbow trout melanophores are functional and can respond to melanophore stimulating hormone (MSH) by dispersion and to subsequent agents by aggregation」（要約）。

### F-39（新規）
- 主張/値: **ギンザケ parr の保護色（crypsis）の検証。** 基質色選好の実験で、適切な背景を選ぶ行動が確認された。写真/反射の吸光分光から、**背景一致は「銀色の側面による無彩色反射（achromatic reflectance）」と「パーマークによる特定波長の吸収」で達成**されると示唆。別研究（PMC4814047）の題名: ギンザケは**暗い環境を好み、暗い環境でより攻撃的でない**。
- 適用範囲: **PROXY:*O. kisutch*（parr）**。ヤマメのパーマークの反射スペクトルは未取得。
- 出典: Donnelly W.A. & Dill L.M. (1984) Evidence for crypsis in coho salmon, *Oncorhynchus kisutch* (Walbaum), parr: substrate colour preference and achromatic reflectance. J. Fish Biol. 25:183–195. https://www.sfu.ca/biology/faculty/dill/publications/j.1095-8649.1984.tb04865.x.pdf ／ https://summit.sfu.ca/_flysystem/fedora/sfu_migrate/5195/b14970211.pdf ／ Coho Salmon (*Oncorhynchus kisutch*) Prefer and Are Less Aggressive in Darker Environments https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4814047/
- 証拠: [A]（PROXY）「background matching is achieved through achromatic reflectance and absorption of wavelengths by the silvery sides and parr marks, respectively」（要約）。

### F-40（新規）
- 主張/値: **パーマークの分布と一般機能（要約）。** パーマークは**ニジマス属（*Oncorhynchus*）のすべての幼魚（カラフトマスを除く）、*Prosopium*、*Salmo*、*Salvelinus*、*Thymallus* の幼魚**に見られる色素胞の集合。渓流生活期の体色は背のカウンターシェーディングと、銀色の体側に沿う明瞭な縞状パーマークで特徴づけられる。「パーマークのある種は無い種に比べ生残が高く、抗捕食行動と保護色による」との記述、「parr は cryptic と受け入れられているが機構の追加研究は無い」との記述。ブラウントラウトでは**パーマークは若い成魚で残り、成魚で消える**との記述。
- 適用範囲: サケ科一般（PROXY）。ブラウントラウトの記述は PROXY:*S. trutta*。
- 出典: 帰属不確実（主に Donnelly & Dill 系の序論と推定: https://www.sfu.ca/biology/faculty/dill/publications/j.1095-8649.1984.tb04865.x.pdf ／ 生残に関する文は https://scholarsbank.uoregon.edu//bitstreams/6949347f-7b0d-4f24-aabe-3a2c012414cd/download の可能性があるが未確認／ ブラウントラウトの文は https://www.extension.purdue.edu/extmedia/fnr/fnr-579-w.pdf 等の解説資料と推定、未確認）
- 証拠: [B]（学術的記述だが帰属不確実。ブラウントラウトの文は [C]）「aggregations of chromatophores called parr marks occur on all juvenile Oncorhynchus (except pink salmon), and all juvenile Prosopium, Salmo, Salvelinus and Thymallus species」。

### F-41（新規）
- 主張/値: **イワメ–アマゴ比較から、体側模様（パーマーク・黒点）は中立進化で、従来指摘された隠蔽効果・縄張り維持効果はほとんど無いと考えられる。** 遺伝学的分析は、遺伝的浮動によりマークレス表現型（パーマークなし）の固定が異なる亜集団で起こった可能性を示唆。イワメとアマゴは体側模様以外に成長・サイズ・食性・性比・適応度などに有意差が無い（F-11 と同一研究群）。
- 適用範囲: **PROXY:アマゴ（イワメ型、三重県）**。ヤマメ河川型の機能を直接支持するものではない。F-39（ギンザケの crypsis 実験）とは結論の方向が異なる（§3）。
- 出典: 日本学術振興会 科研費（KAKEN）課題 04J09581 の要約 https://kaken.nii.ac.jp/grant/KAKENHI-PROJECT-04J09581 ／ 森・名越 (1986) https://mie-u.repo.nii.ac.jp/records/5636
- 証拠: [A]（公的研究費課題の要約、PROXY）「パーマークや黒点などの体側模様は中立的な進化であり、隠蔽の効果やナワバリ維持の効果は、ほとんどないものと思われます」（要約）。

### F-42（新規）
- 主張/値: **優劣・攻撃性・体色（サケ科）。** (a) ニジマスと大西洋サケで皮膚の黒色**メラニン斑の量**は「ほぼ無斑〜密に斑」まで個体差が大きく、ストレス応答性と関連: ストレス応答性で選抜したニジマスで低コルチゾール応答系は一貫してより斑が多い。大西洋サケでは斑の多い個体はストレスへの生理・行動反応が小さい。ストレス応答性は攻撃性と関連するため「斑の多い個体はより攻撃的」と示唆される（推測を含む）。**一方、後の研究では養殖ニジマスで皮膚メラニン斑パターンと成長・ストレス応答の強さ・競争能力に関連が無かった**（飼育化の度合い）。(b) 大西洋サケ幼魚の強膜（眼の白目）の色: 優位個体は淡い強膜色が安定、従属個体は日ごとに変動。(c) 早熟 parr は未熟 parr より高い社会的順位と高い攻撃性を示した（種は要約に無し。Hokkaido Univ. リポジトリの 44(1) P22–25 のヒットと推定されるが未確認）。(d) 初期試験で優位だったサケは、実験河川への定着率が低く定着後の成長が低かった（帰属不確実）。**パーマークのコントラスト/数と優劣を直接結ぶ資料は見つからなかった。**
- 適用範囲: **PROXY:*O. mykiss*（斑）、*S. salar*（斑・強膜）、種不明（早熟 parr）**。斑は成魚/大型個体のメラニン斑でパーマークとは別。
- 出典: https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00319/pdf ／ https://nora.nerc.ac.uk/id/eprint/7671/ ／ https://sicb.org/?p=7999 ／ https://www.nmbu.no/en/node/47262 ／ https://pub.epsilon.slu.se/id/document/11342835 ／ 反例 emergence time and skin melanin spot patterns do not correlate with … https://orbit.dtu.dk/en/publications/emergence-time-and-skin-melanin-spot-patterns-do-not-correlate-wi/ ／ 強膜 Eye colour in juvenile Atlantic salmon: effects of social status, aggression and foraging success https://katalog.lib.cas.cz/KNAV/EdsRecord/edb,8520900 ／ 社会的順位 https://ore.exeter.ac.uk/repository/handle/10036/104585?show=full ／ 早熟 parr 候補 https://eprints.lib.hokudai.ac.jp/repo/huscap/all/21900/44(1)_P22-25.pdf ／ 北極イワナの社会ストレスと色素（題名のみ）https://repositorio.unesp.br/items/a196eb82-fbf3-438b-beb4-d67a9bc961e1/full
- 証拠: [A]（PROXY）「In Atlantic salmon, individuals with more spots showed a reduced physiological and behavioural response to stress」「a later study found no relationship between skin melanin spot pattern and growth performance, stress response intensity, or competitive ability in farmed rainbow trout」（要約）。(d) は [C]。

### F-43（新規）
- 主張/値: **ニジマス属の幼魚のパーマークの種間差。** カラフトマス（pink）は**パーマークなし**。coho は**幅が狭く、パーマーク間の空きが通常パーマークより大きい**。chinook は BC の主要 5 種の稚魚で**最も大きいパーマーク**で、側線をまたいで揃い**幅が間隔より広い**、大きな長円形。steelhead/rainbow は**ほぼ円形**（中背線上の「parr-like marks」約 5 の記述あり）。chum は幅が狭く等間隔で側線より上。cutthroat は体側にパーマークがあるが背に斑なし。脂鰭: cutthroat は縁の色素に 1–2 の途切れ、rainbow は縁の色素が連続または 1 箇所の途切れ、coho は脂鰭に暗縁で中央は不透明。
- 適用範囲: **PROXY:太平洋サケ・トラウト（ヤマメ以外）**。ヤマメの縦長楕円（F-22）とは別形質として扱うこと。要約に数値の個数・間隔の数は無い（「約 5」を除く）。複数資料の混在で帰属不確実。
- 出典: DFO Pacific Salmon Glossary https://www.pac.dfo-mpo.gc.ca/fm-gp/salmon-saumon/gloss-eng.html ／ ID カード類 https://www.adfg.alaska.gov/static/home/library/pdfs/habitat/adfg_hr_id_cards_v1.1.pdf ・ https://idfg.idaho.gov/old-web/docs/fish/rules/archive/fishIdentification.pdf ・ https://repository.library.noaa.gov/view/noaa/6233/noaa_6233_DS1.pdf ・ https://www.kitsap.gov/pw/Documents/Kitsap_Salmon_Guide_Salmon_ID_Poster.pdf
- 証拠: [B]（官庁・行政の識別資料、帰属不確実）「Chinook salmon have parr marks that are even across the lateral line and wider than interspaces」「juvenile Rainbow trout/Steelhead have almost round parr marks」。

### F-44（新規）
- 主張/値: **イワナ（*Salvelinus leucomaenis*）でパーマークによる個体識別が可能。** 尾の根元（体長 **32 mm**）で見える明瞭なパーマークで個体識別でき、魚を傷つけない。別要約には「パーマーク数は体長 **50 mm** まで増加する」との記述がある（どちらも書誌の題名「パーマークによるイワナの個体識別法」関連の要約で、原文は未確認）。→ パーマークは稚魚期に前から後ろへ（尾柄側まで）出そろい、以後は個体識別に使える安定性があるという含意（調査員の推論）。
- 適用範囲: **PROXY:ニッポンイワナ（日本産イワナ）の稚魚**。ヤマメに当てはまるかは未確認。**ヤマメ/サクラマスでパーマークが何 mm で出現するかの資料は見つからなかった。**
- 出典: A method for identifying individual Japanese charr, *Salvelinus leucomaenis*, using parr marks. https://agris.fao.org/search/ar/records/6472483908fd68d5460089df ／ パーマークによるイワナの個体識別法. 魚類学雑誌 54(2):187 https://www.jstage.jst.go.jp/article/jji1950/54/2/54_2_187/_article/-char/ja/
- 証拠: [A]（PROXY・要約のみ）「尾の根元（体長32mm）で見える明らかなパーマークを持つイワナの個体識別が可能であり、この方法は魚を傷つけることなく実施できる」。「50 mm まで増加」は検索クエリ中の語を要約が反復した可能性があり、**採用せず参考扱い**。

### F-45（新規）
- 主張/値: **太平洋サケの対をなす計数形質の左右非対称。** 側線鱗の比較の約 **72%**、鰓耙の約 **59%**、鰓条骨の約 **70%**、胸鰭条の約 **26%** で左右差があった。ベニザケで右の鰓耙数が左を有意に上回り、全種で左の鰓条骨数が右を上回った。変動非対称（FA）は左右のばらつきが無作為で独立なパターンと定義される。
- 適用範囲: **PROXY:ベニザケ・シロザケ・カラフトマスの計数形質**。**色素パターン（パーマーク）の左右差ではない。ヤマメのパーマークの左右差を測定した資料は見つからなかった。**
- 出典: Bilateral Asymmetry in Paired Meristic Characters of Pacific Salmon. https://scholarspace.manoa.hawaii.edu/items/1425f90b-8d8a-4f63-8050-280e0f6bd594
- 証拠: [A]（PROXY・別形質）「asymmetries occurring in approximately 72% of lateral line scale comparisons, 59% of gill raker comparisons, 70% of branchiostegal ray comparisons, and 26% of pectoral fin ray comparisons」（要約）。

### F-46（新規）
- 主張/値: **他のサケ科の鰭縁の識別記述。** ブラウントラウト: 腹鰭・胸鰭・臀鰭の前縁に**薄い白帯→その後ろに黒帯→赤みを帯びる**。胸・腹・臀鰭に白縁。**ブラウントラウトはトラウト類で唯一、脂鰭に赤がある**。ニジマス: 頭・体・ほとんどの鰭に小さな暗色斑、体側に桃〜赤の帯、**脂鰭は黒縁**。ブルックトラウト: 胸・腹・臀鰭に**白い前縁（黒で縁取られる）**。
- 適用範囲: **PROXY:*S. trutta*, *O. mykiss*, *S. fontinalis***。ヤマメの鰭には適用しない。F-25/F-26 と比較: ヤマメ写真では白前縁は多い（約 38/70）が、直後の黒帯はほぼ記述されず、橙〜赤の脂鰭縁は確認されない。
- 出典: https://blogs.cornell.edu/fieldbio2100/files/2016/07/NTRES-2100-Fishes-Fall-2016-29xq4s2.pdf ／ https://www.wired2fish.com/trout/types-of-trout ／ https://www.extension.purdue.edu/extmedia/fnr/fnr-579-w.pdf ／ https://niwa.co.nz/sites/default/files/sites/default/files/key_to_salmonid_species.pdf （どの文がどの URL 由来か帰属不確実）
- 証拠: [B]（識別ガイド、帰属不確実）「Pelvic, pectoral, and anal fins have thin white stripe on leading edge followed by black stripe then reddish coloration」「brown trout is the only trout species that has red on the adipose fin」「adipose fin black-edged」（要約）。

### F-47（新規・非サケ科の PROXY、手続き生成の類推用）
- 主張/値: **東アフリカのシクリッド *Haplochromis latifasciatus* の縦縞の細胞基盤。** 縞のマクロな見え方は主に**メラノフォア密度の上昇とメラニン蓄積**で説明され、成魚の暗色縞は縞間の黄色部より**メラノフォア密度が 2〜3 倍高い**。縞形質に 2 つの QTL（メラノフォアのメラニン化度、メラノフォア数の空間変動）が見つかり、合わせて縞の分散の **26.6%** を説明。メラニン合成遺伝子 *tyr*・*tyrp1a* の発現は暗色縞で 5〜6 倍。
- 適用範囲: **PROXY:シクリッド（非サケ科）**。サケ科のパーマークが同じ機構とは限らない。「縞＝メラノフォア密度の周期的な上昇」という描画モデルの類推材料。
- 出典: Developmental and Cellular Basis of Vertical Bar Color Patterns in the East African Cichlid Fish *Haplochromis latifasciatus*. Front. Cell Dev. Biol. (2020) https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7026194/ ／ https://www.frontiersin.org/journals/cell-and-developmental-biology/articles/10.3389/fcell.2020.00062/full
- 証拠: [A]（非サケ科）「In adults, melanic bars are characterized by a two to threefold higher density of melanophores than in the intervening yellow interbars」（要約）。なお同じ要約の「The dark parr marks on salmon juveniles are likely created by vertical bands of melanophores」は帰属不明の一文で採用しない。

### Part D. 調査員の記憶（M。未検証。数値なし。仕様に使わず検証用の手がかりとして扱う）

### F-48
- 主張/値: 書誌候補（記憶・正確性未確認）: Fujii R. (1993) "Coloration and chromatophores", in The Physiology of Fishes（色素胞総説）／ Sugimoto M. (2002) Morphological color changes in fish. Microsc. Res. Tech.（形態的体色変化の総説）／ Kondo & Asai (1995, Nature; タテジマキンチャクダイの縞)・Kondo & Miura (2010, Science; RD 総説) ／ F-31 の著者名（Venkataraman, Sekimura, Gaffney, Maini, Madzvamuse）。**赤斑・鰭の黄橙色が主にカロテノイド（アスタキサンチン系）に由来する**という一般知識は、F-34 の「カロテノイド小胞」と F-33 の一般則（キサント/エリスロフォアはカロテノイドとプテリジン）で部分的に支持されたが、**サケ科の赤斑の色素が具体的に何か（アスタキサンチンかキサントフィル類か）、ヤマメの側線部の紅の由来は検索で確認できなかった**。
- 適用範囲: 硬骨魚類一般/モデル論。
- 出典: なし（検索で未確認）。
- 証拠: [M] 記憶。未検証。

---

## 3. 資料間の矛盾・不一致

1. **パーマークの個数**: 青森県 8–10（F-01）／日本語資料 6–9 と 7–10（F-02）／AI 百科 9–10／台湾亜種 9＋小黒点 11–13（F-14）／アマゴ 7–11／写真注釈（yamame n=54）5–12、最頻 8–9、平均 8.6（F-21）／ブラウントラウト *macrostigma* 11–13（F-30、PROXY）。数え方（小さな前後の斑や側線下の斑を含めるか）の差が疑われるが、資料からは確認できない。種の差（*Salmo* > *O. masou*）の可能性は排除できない。
2. **パーマークの色**: 「紫黒色・赤紫色」（島根県）／「青色」（神奈川県・ja.wikipedia）／「purple-colored」（r03 要約）／写真注釈「暗灰褐色（中心やや青灰）」（p001）。保存状態・照明・サイズ・地域のいずれによる差かは不明。F-33 の層構造（メラノフォアが覆う暗域）からは、色相が下層のイリドフォアの反射（青〜紫の構造色）に左右されうるが、**これは調査員の推論で、ヤマメでの検証は無い**。
3. **成魚でのパーマークの有無**: 神奈川県図鑑「成魚にも同じように見られる」／ Kato 1991「体が大きくなるとパーマークを失う」／栃木県「全長 31 cm 以上でパーマークも腹部青斑点も無ければサクラマス」／ブラウントラウト「若い成魚で残り成魚で消える」（F-40、C）。「成魚」の定義（小型成熟魚か大型魚か）の違いの可能性。サイズ依存の変化として扱うのが整合的。
4. **朱点の有無**: 神奈川県・東京都「ヤマメに朱点なし」／丹沢ヤマメ「少数の朱点が入る」沢がある／神奈川県陸封個体群は形態がアマゴ・ヤマメに似て遺伝的にはアマゴに近い／陸封個体は側線部に「うっすら紅」（NIES）／写真では yamame ラベルでも拡散した鮭肉色の斑（p001）や単発の橙点（p033）が出る。→ 「朱点の有無」は二値でなく連続的で、拡散した淡い赤みと輪郭明瞭な朱点が混在しうる。
5. **産卵期（成熟）の体色**: F-17 の 3 系統（黒ずむが桜色にならない／薄桃〜濃紅が不定形／体側の縞が鮮紅色で腹部の淡色帯に融合）。MLIT の「stripes」がパーマークか不明。
6. **背の基調色**: 黄褐色 vs 暗青緑（r03 の指摘どおり）。
7. **脂鰭の縁**: 写真注釈内で暗縁（p040, p064）／白縁（p016）／無縁取り（p031, p032, p033, p049）が混在。PROXY ではニジマス「黒縁」、coho「暗縁」、ブラウントラウト「赤」（F-43/F-46）と種で異なる。ヤマメの縁の色は文献で確認できない。
8. **種/生活史型ラベルの入れ替わり**: 同じヒット群の要約が「ヤマメ」と「サクラマス」で入れ替わる事例があり、降海型の記述が河川型に混入しうる。F-13 の HRO 記述は降海型中心。
9. **「stripes」「縞」の用語**: MLIT 英文 DB の stripes、日本語資料のパーマークなどの語が同一対象を指すかは不明。
10. **パーマークの機能（保護色 vs 中立）**: ギンザケ parr では基質色選好と反射率から crypsis が支持される（F-39）。イワメ–アマゴ比較では体側模様は中立進化で隠蔽・縄張り効果はほぼ無いとされる（F-41）。F-40 の「parr は cryptic と受け入れられているが機構研究は無い」と合わせ、**機能は未決着**。→ 実装でパーマークを「必ず背景適応で濃淡が変わる」ものとして固定しない。
11. **斑の量と攻撃性**: ニジマス選抜系・大西洋サケでは斑の多さとストレス応答の低さが関連（F-42 a）だが、養殖ニジマスでは無相関。野生/養殖の差の可能性（要約の示唆）。パーマークでの検証は無い。
12. **銀化時の鰭縁**: PROXY は「鰭縁の黒化」（F-36）、HRO は降海期の背鰭先端に「白色部」（F-13）、ヤマメ写真は白前縁が多数（F-25）。種・鰭・季節・サイズの違いと考えられるが未確認。
13. **パーマーク消失の機構**: Kato 1991（サイズに伴う消失、F-04）と、銀化によるグアニン層のマスキング（F-36）は別機構でも同時進行でもありうる。河川型ヤマメで何が起きているかは資料が無い。
14. **グアニンと見かけの銀化**: 大量のグアニンが銀化の見た目と必ずしも相関しない（F-06）一方、グアニン沈着が銀化の原因とする一般則（F-36）。層位・結晶配向の違いか未確認。

---

## 4. 見つからなかったこと（Gaps）— 3D モデル/アニメ/行動実装に必要だが確認できなかった事項

| # | 課題項目 | 欠落事項 | 状態（v2） | 影響 |
|---|---|---|---|---|
| G1 | 1 | **ヤマメ/サクラマスのパーマークの出現時期（体長 mm・日齢）と形成順序**、スモルト化での組織学的変化（メラノフォアが消えるのか、イリドフォア層で覆われるのか） | 未達。PROXY のイワナ（32 mm 付近で尾柄側のマークが見える、F-44、要約のみ）とアマゴの Turing モデル（F-31）のみ | 高 |
| G2 | 1 | **環境による制御**（温度・成長速度・光・餌がパーマーク数/濃さに与える影響）、遺伝率の追試・集団間差 | 遺伝は部分的に取得（ヤマメ h²=0.400 の単一値、F-28／PROXY の QTL、F-29）。環境効果は未達 | 中〜高 |
| G3 | 1 | **同一個体の左右差**（パーマーク数・位置・形） | 未達。写真は全レコード片側のみ。PROXY の計数形質の左右非対称（F-45）のみ | 高 |
| G4 | 1 | **パーマークと優劣・攻撃性の直接資料** | 未達。メラニン斑（F-42）、強膜色、crypsis（F-39）、中立進化（F-41）は間接情報のみ | 中 |
| G5 | 2 | **ヤマメの色素胞の種類と層構造**、パーマーク・黒点・体側ピンク・鰭の黄橙のそれぞれの由来 | 未達。PROXY（トラウト一般、ブラウントラウトの赤斑/黒斑）は取得（F-33/F-34）。ヤマメの側線部の紅・胸鰭の橙黄の色素は未確認 | 高 |
| G6 | 2 | **背景適応の体色変化の速度と範囲（明度・色域の数値）** | 未達。機構（α-MSH/MCH、F-37）と薬理試験（F-38）のみ。ヤマメ・ニジマスの自然背景での時間応答は皆無 | 高 |
| G7 | 2 | **カロテノイド含量・餌依存性**（赤み・橙黄の季節変化） | 未達 | 中 |
| G8 | 3 | **パーマーク間隔の統計**（平均間隔、変動係数、体長依存）と RD モデルの具体パラメータ（特性波長、成長率） | 未達。Phys. Rev. E (2011) の式・係数は要約に無く、全文閲覧が必要。写真は px のみでスケール無し（F-22/F-27） | 高 |
| G9 | 3 | **パーマークを手続き生成するための定量制約**（個数分布・間隔・高さ・傾き・後方への縮小率） | 個数は F-01/F-21、高さ比は F-27（精度低）。間隔・傾きは未達 | 高 |
| G10 | 4 | **脂鰭の縁取りの色・有無**（ヤマメ）、**鰭縁（白前縁）の文献根拠**（ヤマメ）、**鰓蓋の暗色斑の有無** | 未達。PROXY（F-46）と写真のみ | 中 |
| G11 | 4 | **暈つき斑（halo）のヤマメでの有無** | 未達。ブラウントラウトで [C]（F-35） | 低 |
| G12 | — | **季節差・年齢差・地域差の定量的な体色データ** | 未達 | 中 |
| G13 | — | **水中照明での見え方**（水深・濁度・波長別の減衰でパーマークや赤みがどう見えるか） | 未達 | 中 |
| G14 | 3 | **PRE 2011（アマゴ）、Sci. Rep. 2022（ブラウントラウトのエリスロフォア）の全文**（モデルの詳細、細胞の層位・厚さ、斑内の細胞密度） | 要約のみ。全文が読めないため数値化できず | 高 |
| G15 | 1 | **ヤマメのパーマーク数と体サイズ/年齢の関係**（縦断データ）、大型個体での消失の定量 | 未達。Kato (1991) の全文未読 | 中 |

### 今回確認できなかった／追跡できなかったリード
- 岩手県内水面水産技術センター研究報告 第13号（2026年3月）に「サクラマスの海水適応と背景色」の研究があるとの示唆があるが、要約内容は取得できず（https://www2.suigi.pref.iwate.jp/wp-content/uploads/2026/03/20260325bulletin013.pdf）。masu の背景色と体色の関係に直結する可能性があり、全文確認の価値あり。
- 東京都・神奈川県・山形県・岐阜県・滋賀県・長野県の PDF が日本語パーマーク検索にヒットしたが、内容は取得できず（例: https://www.ifarc.metro.tokyo.lg.jp/archive/resources/content/3355/20130904-164335.pdf、https://www.pref.kanagawa.jp/uploaded/attachment/10225.pdf、https://www.fish.rd.pref.gifu.lg.jp/kenkyu-houkoku/pdf-61-70/69-001.pdf）。
- Individual identification of bony fishes using unique body markings（https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12861832/）: 斑・縞の経時安定性の総説の可能性。内容未取得。
- 関・小島 (1977) 吾妻川起源ヤマメの銀毛化変態と成熟（F-17）。

---

## 5. 出典一覧（URL 付き。検索結果に出た URL のみ。重複排除）

**査読論文・学術書・学術報告（A）**
- Phys. Rev. E 84, 041923 (2011) アマゴのパーマーク形成の Turing モデル — https://journals.aps.org/pre/abstract/10.1103/PhysRevE.84.041923 ／ https://research-portal.st-andrews.ac.uk/en/publications/modeling-parr-mark-pattern-formation-during-the-early-development/
- Miyazawa, Okamoto & Kondo (2010) Nat. Commun. 1:66 — https://www.nature.com/articles/ncomms1071 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC2982180/
- Pattern blending enriches the diversity of animal colorations. Sci. Adv. (2020) — https://www.science.org/doi/10.1126/sciadv.abb9107 ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7710386/
- Metz (2011) Turing patterns: how the fish got its spots（題名のみ）— https://onlinelibrary.wiley.com/doi/10.1111/j.1755-148X.2010.00814.x
- QTL parr mark traits, Atlantic salmon. Genome (2017) — https://cdnsciencepub.com/doi/10.1139/gen-2017-0026
- Kocabaş et al. (2016) Indian J. Fish. 63(2):123–126 — https://epubs.icar.org.in/index.php/IJF/article/view/51840 ／ https://avesis.ktu.edu.tr/publication/details/f88d45af-00d7-4961-b5fa-377ec4e303b1/comparison-of-number-and-shape-of-parr-marks-in-three-species-of-the-genus-salmo-and-two-ecotypes-of-cultured-brown-trout-salmo-trutta-from-turkey
- Morphological analysis of chromatophores in the skin of trout — https://www.researchgate.net/publication/281315391_Morphological_analysis_of_chromatophores_in_the_skin_of_trout ／ https://www.semanticscholar.org/paper/Morphological-analysis-of-chromatophores-in-the-of-Kaleta/f5b2ecfff1cc4a279d8a7e5382b88aeab6a26496
- Erythrophores in brown trout skin. Sci. Rep. (2022) — https://www.nature.com/articles/s41598-022-04799-7 ／ https://pubmed.ncbi.nlm.nih.gov/35046436/ ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8770521/
- Isolation of Chromatophores from Brown Trout Skin. Fishes 7(2):72 — https://www.mdpi.com/2410-3888/7/2/72 ／ https://doi.org/10.3390/fishes7020072
- Comparative transcriptome analysis of trout skin pigment cells. BMC Genomics (2019) — https://pmc.ncbi.nlm.nih.gov/articles/PMC6509846/ ／ https://link.springer.com/article/10.1186/s12864-019-5714-1
- Donnelly & Dill (1984) J. Fish Biol. 25:183–195 — https://www.sfu.ca/biology/faculty/dill/publications/j.1095-8649.1984.tb04865.x.pdf ／ https://summit.sfu.ca/_flysystem/fedora/sfu_migrate/5195/b14970211.pdf
- Coho Salmon Prefer and Are Less Aggressive in Darker Environments — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4814047/
- Gorbman et al. (1982) Morphological indices … parr-smolt coho salmon — https://www.sciencedirect.com/science/article/abs/pii/0044848682900047 ／ https://www.webapps.nwfsc.noaa.gov/assets/2/7025_06252012_123111_Gorbman.et.al.1982.pdf
- Colour and melanophore function in rainbow trout … medetomidine — https://research.chalmers.se/en/publication/123331 ／ https://core.ac.uk/works/289850809
- Melanin spots / stress（PROXY）— https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00319/pdf ／ https://nora.nerc.ac.uk/id/eprint/7671/ ／ https://sicb.org/?p=7999 ／ https://www.nmbu.no/en/node/47262 ／ https://pub.epsilon.slu.se/id/document/11342835 ／ https://orbit.dtu.dk/en/publications/emergence-time-and-skin-melanin-spot-patterns-do-not-correlate-wi/
- Eye colour in juvenile Atlantic salmon — https://katalog.lib.cas.cz/KNAV/EdsRecord/edb,8520900 ／ 社会的順位 https://ore.exeter.ac.uk/repository/handle/10036/104585?show=full ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/21900/44(1)_P22-25.pdf
- Bilateral asymmetry in paired meristic characters of Pacific salmon — https://scholarspace.manoa.hawaii.edu/items/1425f90b-8d8a-4f63-8050-280e0f6bd594
- Haplochromis latifasciatus vertical bars. Front. Cell Dev. Biol. (2020) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7026194/ ／ https://www.frontiersin.org/journals/cell-and-developmental-biology/articles/10.3389/fcell.2020.00062/full
- Japanese charr parr-mark ID — https://agris.fao.org/search/ar/records/6472483908fd68d5460089df ／ https://www.jstage.jst.go.jp/article/jji1950/54/2/54_2_187/_article/-char/ja/
- Size-driven parr-smolt transformation in masu salmon. Sci. Rep. 2023 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ ／ https://link.springer.com/10.1038/s41598-023-43632-7
- 加藤文男 (1991) 水産増殖 39(3):279–288 — https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/
- Marine Biotechnology 22:812–823 (2020) — https://link.springer.com/article/10.1007/s10126-020-09975-2 ／ https://pubmed.ncbi.nlm.nih.gov/32488506
- 森・名越 (1986) 三重大学水産学部研究報告 13:135–143 — https://cir.nii.ac.jp/crid/1050001202938999296 ／ https://mie-u.repo.nii.ac.jp/records/5636 ／ KAKEN 課題 https://kaken.nii.ac.jp/grant/KAKENHI-PROJECT-04J09581
- Christie (1970) — https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf
- Fujioka et al. (2025) Ichthyological Research 73:188–200 — https://link.springer.com/article/10.1007/s10228-025-01032-z
- 北大水産学部研究彙報（グアニン/肥満度）— https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22122/1_P39-42.pdf ／ https://fra.repo.nii.ac.jp/records/2007545
- 水産学会誌・生態学会・水産研究・教育機構（早熟雄）— https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_16-00006/_article/-char/ja/ ／ https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_22-00024/_pdf ／ https://esj.ne.jp/meeting//abst/61/S05-2.html ／ https://fra.repo.nii.ac.jp/record/2009615/files/sapporo_sk_13_3.pdf
- 関・小島 (1977)（リード）— https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja
- Zool. Sci. 15(6) — https://bioone.org/journals/zoological-science/volume-15/issue-6/zsj.15.971/Genetic-Relationship-between-Masu-and-Amago-Salmon-Examined-through-Sequence/10.2108/zsj.15.971.full
- Jan et al. (1990)（台湾亜種、未確認）— https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf

**公的機関・自治体・図鑑・識別資料・解説（B）**
- 岩手県（ヤマメ親子回帰・遺伝率）— https://www.pref.iwate.jp/_res/projects/default_project/_page_/001/008/640/8yamame-oyako.pdf
- DFO Pacific Salmon Glossary — https://www.pac.dfo-mpo.gc.ca/fm-gp/salmon-saumon/gloss-eng.html
- ID カード/識別資料 — https://www.adfg.alaska.gov/static/home/library/pdfs/habitat/adfg_hr_id_cards_v1.1.pdf ／ https://idfg.idaho.gov/old-web/docs/fish/rules/archive/fishIdentification.pdf ／ https://repository.library.noaa.gov/view/noaa/6233/noaa_6233_DS1.pdf ／ https://www.kitsap.gov/pw/Documents/Kitsap_Salmon_Guide_Salmon_ID_Poster.pdf ／ https://niwa.co.nz/sites/default/files/sites/default/files/key_to_salmonid_species.pdf ／ https://blogs.cornell.edu/fieldbio2100/files/2016/07/NTRES-2100-Fishes-Fall-2016-29xq4s2.pdf ／ https://www.extension.purdue.edu/extmedia/fnr/fnr-579-w.pdf
- Australian Museum（色素胞解説）— https://australian.museum/learn/animals/fishes/fish-chromatophores/ ／ 構造 https://link.springer.com/article/10.1007/BF00222271
- 米国資料・銀化（帰属不確実）— https://www.npshistory.com/publications/wildlife/nbs-rib/94-37.pdf ／ https://www.cambridge.org/core/product/identifier/S0025315400040625/type/journal_article ／ https://pubs.usgs.gov/publication/70180320
- Guelph 大の解説（大西洋サケ QTL）— https://www.uoguelph.ca/cbs/news/2018/04/genetics-help-power-atlantic-salmon-restoration
- 青森県産業技術センター内水面研究所 — https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html ／ https://www.aomori-itc.or.jp/_files/00061476/343-346.pdf
- 北海道立総合研究機構 — https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 神奈川県 — https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html ／ https://www.pref.kanagawa.jp/docs/a4y/images/amago.html
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
- 一般向け記事 — https://www.nationalgeographic.com/science/article/spots-plus-spots-equals-maze-how-animals-create-living-patterns

**Wikipedia 系・AI 生成・一般・帰属不確実（C）、PROXY**
- https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 ／ https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF ／ https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://en.wikipedia.org/wiki/Oncorhynchus_masou_macrostomus ／ https://grokipedia.com/page/Oncorhynchus_masou ／ https://lifeoftaiwan.com/nature/the-formosan-landlocked-salmon-taiwans-unique-natural-wonders-part-1/
- ブラウントラウトの暈 — https://www.ozanimals.com/Fish/Brown-Trout/Salmo/trutta.html ／ https://ncfishes.com/?p=3239 ／ https://www.wired2fish.com/trout/types-of-trout
- 背景適応ホルモンの要約（帰属不確実）— https://www.biorxiv.org/content/10.1101/570861.full.pdf ／ https://journals.viamedica.pl/folia_histochemica_cytobiologica/article/download/FHC.2012.0034/15248 ／ https://scholarsbank.uoregon.edu//bitstreams/6949347f-7b0d-4f24-aabe-3a2c012414cd/download
- PROXY（サケ科一般・種不明）— https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf ／ https://www.webapps.nwfsc.noaa.gov/assets/26/6745_06272011_103138_Mighell.1978-rev.pdf ／ https://orb.binghamton.edu/research_days_posters_2024/52

**写真ストリーム（文献ではない）**
- `docs/yamame/photo_analysis/catalog_c01.json` 〜 `catalog_c07.json`（70 枚。各レコードの `source_url` に元写真）

---

## 6. 検索ログ

> 全て WebSearch。mode は extended を 4 回（上限 4）、他は standard。**総検索回数 31 回**（割当 30 回を **1 回超過**。途中のカウントを 1 つ誤り、30 回で打ち止めのつもりで 31 回目を発行してしまった。31 回目の結果は有用情報ゼロで、これを除いても結論は変わらない。以後検索は行っていない）。有用度: ◎=新規の核心情報 / ○=補強・部分的 / △=ほぼ無駄・リード程度 / ×=無し。

| # | mode | クエリ（要旨） | 有用度 | 得たもの |
|---|---|---|---|---|
| 1 | extended | parr marks salmonid development number genetics Oncorhynchus | ○ | parr/smolt 定義（Gorbman 1982）、DFO 用語集の種間差（F-43） |
| 2 | standard | masu salmon parr marks number … yamame Oncorhynchus masou juvenile | △ | パーマーク数の記述なし（鱗発達・分散の論文のみ） |
| 3 | extended | chromatophores salmonid skin melanophores xanthophores iridophores erythrophores trout layering dermis | ◎ | トラウトの色素胞・層構造（F-33）、エリスロフォア 2 型 |
| 4 | standard | unique differentiation pathway of erythrophores brown trout red spots … halo (allowed: nature/ncbi/pmc/mdpi) | ◎ | 黒斑/赤斑の細胞構成（F-34） |
| 5 | extended | Turing pattern salmonid … Miyazawa Okamoto Kondo | ◎ | pattern blending（F-32） |
| 6 | standard | parr marks function dominance aggression … social status Atlantic salmon coho | ◎ | crypsis、早熟 parr、強膜色（F-40/F-42） |
| 7 | standard | rainbow trout background colour change melanophore aggregation dispersion time course | ○ | ニジマスのメラノフォア機能（F-38）。時間経過の数値なし |
| 8 | standard | Donnelly Dill 1984 crypsis coho parr | ◎ | F-39 |
| 9 | standard | Morphological analysis of chromatophores in the skin of trout Kaleta … per mm2 | ○ | F-33 再確認（密度の数値は無し） |
| 10 | standard | parr marks first appear at fork length mm alevin fry … ontogeny | △ | Kocabaş 2016 のリード（出現体長は無し） |
| 11 | standard | parr mark number heritability families rainbow trout OR Atlantic salmon OR chinook | × | 成長形質の遺伝率のみ（パーマーク無し） |
| 12 | standard | comparison of number and shape of parr marks … Salmo … Turkey | ○ | F-30 |
| 13 | standard | パーマーク 数 個体差 ヤマメ アマゴ 稚魚 パーマーク形成 体長 発生 | ◎ | ヤマメ遺伝率 0.400、イワメ中立進化（F-28/F-41） |
| 14 | standard | ヤマメ パーマーク数 遺伝率 0.400 親魚 雌親魚 交配 … | ◎ | 出典ファイル特定（岩手県 8yamame-oyako.pdf） |
| 15 | standard | 岩手県 ヤマメ パーマーク数 育種 親子回帰 …（allowed: iwate, kaken, jstage） | △ | イワナ個体識別の題名のみ |
| 16 | standard | イワメ アマゴ パーマーク 黒点 体側模様 中立進化 … | ◎ | KAKEN 課題（F-41） |
| 17 | standard | パーマークによるイワナの個体識別法 … 50mm | ○ | F-44（32 mm。50 mm は不採用） |
| 18 | standard | salmonid white leading edge fins … adipose fin colour carotenoid … | ○ | 他種の鰭縁（F-46） |
| 19 | standard | salmonid body colour background adaptation white black tank … | ○ | α-MSH/MCH（F-37、帰属不確実） |
| 20 | standard | bilateral asymmetry parr marks left right … | △ | 計数形質の左右非対称のみ（F-45、PROXY） |
| 21 | standard | 岩手県内水面水産技術センター 研究報告 第13号 ヤマメ パーマーク 体色 背景色 | △ | 第13号に masu の背景色研究があるとのリードのみ |
| 22 | standard | Miyazawa Okamoto Kondo 2010 … (allowed: nature/ncbi/pmc/science.org) | ○ | F-32 再確認、Sci. Adv. 2020 |
| 23 | standard | アマゴ 朱点 色素胞 カロテノイド 赤色素胞 … | △ | 朱点の有無の再確認のみ（色素学的資料なし） |
| 24 | standard | melanin-based skin spots salmonid … stress responsiveness aggression dominance | ◎ | F-42 |
| 25 | standard | brown trout red spots … pale halo ocellated … | ○ | F-35（帰属不確実）、F-34 再確認 |
| 26 | standard | smoltification silvering skin guanine iridophores parr marks masked … | ○ | F-36 |
| 27 | extended | parr mark formation developmental mechanism salmonid larvae vertical bars … | ◎ | PRE 2011（F-31）、QTL、シクリッド（F-47） |
| 28 | standard | juvenile salmonid identification key parr marks … rainbow cutthroat coho chinook … | ○ | F-43 |
| 29 | standard | Modeling parr-mark pattern formation … Amago trout … | ○ | F-31 の補強（式・係数は取得できず） |
| 30 | standard | Mapping of quantitative trait loci … parr mark traits … Atlantic salmon | ○ | F-29 |
| 31 | standard | サクラマス 水槽 背景色 黒 白 海水適応 体色 銀化 パーマーク … | × | 有用情報なし（**割当超過の 1 回**） |

- 総検索回数: **31 回**（standard 27、extended 4）。有用度の内訳: ◎ 10 回（#3, 4, 5, 6, 8, 13, 14, 16, 24, 27）、○ 13 回（#1, 7, 9, 12, 17, 18, 19, 22, 25, 26, 28, 29, 30）、△ 6 回（#2, 10, 15, 20, 21, 23）、× 2 回（#11, #31）。
- 予算エラー（"Web search was not performed … budget"）は発生しなかった。WebFetch・curl は使用していない。
- ローカル作業: 既存 r05 初版の読み込み、写真カタログ 7 ファイルの Python 再集計（F-27 の高さ/眼窩外径比、左右別のパーマーク数、白縁の直後の暗色帯、脂鰭の縁の記述）。外部通信なし。
