# r05 検証レポート（独立検証・懐疑的レビュー）

対象: `docs/yamame/research/r05_parr_pigment_en.md`（元ファイルは未変更）
検証日: 2026-10-01 / WebSearch 実行 **11 回**（割当 11 回、全て mode=standard、予算エラーなし、WebFetch/curl 不使用）

## 0. 検証方法と限界（必読）

- 情報源は WebSearch の「タイトル・URL・モデル生成の要約」のみ。全文は読んでいない。
- 検証は原調査員と異なる言い回し・言語・`allowed_domains` で行った。ただし**要約が同じ原典を返す場合が多く**（岩手県 PDF、J-STAGE の Kato 1991、ICAR の Kocabaş など）、その場合は「再現」であって「独立 2 資料」ではない。本レポートでは、同一原典の再現は **CONFIRMED-SINGLE** とし、CONFIRMED-MULTI は付けていない箇所が多い。
- 検索 #6 は 1 回の呼び出しの中で要約モデルが複数回の内部検索を行った形跡がある（結果が 3 ブロックで返った）。予算カウントは「呼び出し 1 回」として計上したが、実消費が多い可能性がある。
- 選んだ主張は 10 個。写真由来（P）とローカル計算は対象外。
- 自分の記憶由来の知識は証拠ランク M と明記し、判定の根拠には使っていない。

## 1. 検証結果の表

| ID | 主張（要約） | 判定 | 補正値/範囲 | 新規出典 URL | 備考 |
|---|---|---|---|---|---|
| V1 | F-01/F-02: ヤマメのパーマーク数 8–10 個（青森県）。他資料 6–9 / 7–10 | **UNVERIFIABLE**（反証もなし） | 変更なし。独立資料では個数を取得できなかった | 手掛かりのみ（要約本文は未読）: https://www.kahaku.go.jp/research/db/zoology/uodas_freshdb/area/salmonidae/055.html ／ https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf ／ https://nrifs.fra.affrc.go.jp/news/news11/kiso.html | 検索 #1（英語）#7（日本語、jstage/fra/affrc/kahaku 指定）とも、要約は「パーマーク数の具体値は見つからなかった」と回答。「小判状の斑紋がある」ことのみ再確認。元の「8–10」は青森県 1 資料（A、二次転記）のまま。写真集計（P: 平均 8.6、SD 1.4）とは整合するが、これは文献の独立確認ではない |
| V2 | F-28: ヤマメのパーマーク数の遺伝率 0.400（親子回帰）。子の数は特に雌親魚の影響、孵化後 4 か月以降に選抜可能 | **CONFIRMED-SINGLE** | h² = 0.400（単一推定値、SE・n 不明）。「孵化後約 4 か月から形質が安定」 | 同一 URL が再度先頭ヒット: https://www.pref.iwate.jp/_res/projects/default_project/_page_/001/008/640/8yamame-oyako.pdf | 英語クエリでも同じ岩手県 PDF が返り、要約は「岩手県内水面水産技術センターと東北大学の研究者」と記述（新情報。元は「センター系と推定」）。独立の第 2 資料は無い。同じ結果に出たシロザケの脊椎骨数の遺伝率など他形質の論文は無関係 |
| V3 | F-31: アマゴのパーマーク形成の Turing 型モデル（縞 → 向き変更とピーク挿入 → ジグザグ斑）。Phys. Rev. E 84, 041923 (2011) | **CONFIRMED-SINGLE**（書誌は確認） | 定性的内容のみ。式・パラメータ・特性波長は依然取得不可 | https://wrap.warwick.ac.uk/39797 ／ https://people.maths.ox.ac.uk/maini/PKM%20publications/321.pdf ／ https://sro.sussex.ac.uk/id/eprint/43246/ （いずれも検索結果に出たがスニペット本文は未読。同一論文の機関リポジトリ版の可能性） | 要約は著者を **Venkataraman, Sekimura, Gaffney, Maini, Madzvamuse** と返した。元ファイル F-31/F-48 の著者名は [M] だったので、検索要約により裏付けを得た（ランクは B 相当、全文未読）。内容文は元と同一（St Andrews の要約が再度ヒット）で独立ではない |
| V4 | F-04: Kato (1991) — 大型アマゴ・ヤマメは体が大きくなるとパーマークを失い、朱点の有無と鱗相で種間差が明瞭 | **CONFIRMED-SINGLE** | 「失う」の定量閾値なし。サイズ連動でコントラストを下げ、消失閾値は固定しない（元の方針を維持） | 同一: https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ | 日本語クエリ（jstage/nii 指定）でも J-STAGE の同一ページが 1 位。要約は「体側の赤点の有無と鱗相の種間差」「パーマークを失う」を再現。栃木県「31 cm 以上」基準と神奈川県「成魚にも見られる」の食い違いは今回再検証していない（未検証のまま） |
| V5 | F-33: トラウト皮膚 60 標本の組織学。明暗差は主にメラノフォアの位置と密度、暗域ではメラノフォアが他を覆い明域ではイリド・キサントが露出、真皮深部にイリドフォア層 | **UNVERIFIABLE**（再現できず。一部は間接的に支持） | 「60 標本」「stratum compactum 下のイリドフォア層」は採用しない。明域に type L イリドフォアが限局するという点のみ #5/#9 で支持 | PROXY 候補: https://pmc.ncbi.nlm.nih.gov/articles/PMC6509846/ ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC4232760/ （ニジマス parr と smolt でメラノフォアの光感受性が異なる） | 検索 #5 の要約に「色素胞の多い領域ではイリドフォアが上層、凝集メラノフォアが下層」とあるが、これはサケ科以外の種（サンゴマス類・ヤモリ等のヒット混在）の記述の可能性が高く、**F-33 の「暗域でメラノフォアが上に重なる」と積層順が逆**。サケ科に流用しない。F-33 は元ファイルでも [A, PROXY] としているが、層の上下関係は仕様化しないこと |
| V6 | F-36/F-06: スモルト化の銀白化は皮膚へのグアニン（とヒポキサンチン）の沈着。パーマークが覆われる。鰓蓋の斑は銀化後も見える。鰭縁が黒化する | **CONFIRMED-SINGLE**（一般則のみ）。鰓蓋・鰭縁は **UNVERIFIABLE** | 一般則: 「スモルト化でパーマークが退行し、体の銀化が進む」「皮膚・鱗にグアニン/ヒポキサンチンが沈着、甲状腺ホルモンで増える」。鰓蓋に斑が残る・鰭縁黒化は未確認 | https://pmc.ncbi.nlm.nih.gov/articles/PMC10547828 （マス Sci. Rep. 2023、再ヒット）／ https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2024.1482306/pdf （甲状腺ホルモンとメラニン/非メラニン色素。要約の文との対応は未確定） | 要約は文ごとの出典を明示しなかった（帰属不確実）。サケ科の銀化の機構（purine 沈着が銀白化を起こす）自体は妥当と見てよいが、鰓蓋・鰭縁の細部は元の PROXY（ギンザケ）記述が再確認できなかった。河川型ヤマメの見た目の仕様には使わない |
| V7 | F-30: *Salmo trutta macrostigma* のパーマーク数は 11–13 個で最多。パーマークは発達中安定 | **CONFIRMED-SINGLE**（PROXY） | 11–13 個は養殖ブラウントラウト *macrostigma* の値（トルコ）。ヤマメには適用しない | https://epubs.icar.org.in/index.php/IJF/article/download/51840/24684/488414 ／ https://avesis.ktu.edu.tr/yayin/f88d45af-00d7-4961-b5fa-377ec4e303b1/comparison-of-number-and-shape-of-parr-marks-in-three-species-of-the-genus-salmo-and-two-ecotypes-of-cultured-brown-trout-salmo-trutta-from-turkey | 同一論文（Kocabaş et al. 2016）のホスト違いで、要約文も同一。他種・他エコタイプの個数（*S. t. fario* 等）は要約に出ず未取得 |
| V8 | F-34: ブラウントラウトの斑の細胞構成 — 黒斑＝多数のメラノフォア＋type 1 エリスロフォア（キサントフォア無し）＋**type L イリドフォア**、赤斑＝type 2 エリスロフォア（大型 erythrosome）のみ | 主要部 **CONFIRMED-MULTI**（Sci. Rep. 2022 と BMC Genomics 2019 が別ヒット）／「黒斑に type L イリドフォア」は **CONTRADICTED** | 黒斑: メラノフォアが表皮直下、その下に type 1 エリスロフォア。赤斑: type 2 エリスロフォアのみ。**type L イリドフォアは「明るい領域」のみ**（黒斑には無い）。type 1 は「黒斑をメラノフォアと共に形成」 | https://pmc.ncbi.nlm.nih.gov/articles/PMC8770521/ ／ https://link.springer.com/content/pdf/10.1186/s12864-019-5714-1.pdf ／ https://www.mdpi.com/2410-3888/7/2/72 | 検索 #5 と #9（別クエリ・別ドメイン指定）の双方で「type L iridophores were present exclusively in the light area of brown trout skin」と返った。元 F-34 の「黒斑に type L イリドフォアあり」は取り違えの疑いが強い（元ファイル自身も「この文の帰属は同論文と推定されるが確定できない」と注記）。全文未読の要約ベースの反証である点に注意 |
| V9 | F-29: 大西洋サケの QTL — AS22 に parr mark 数、AS24 に parr mark コントラスト分散の 26% を説明する QTL | **CONFIRMED-SINGLE**（PROXY） | 数値 26% は再現。**家系数は不一致**: 元ファイル「4 家系（各 N=300）」、今回の要約「3 つの雑種戻し交配家系」。家系数・N は仕様に書かない | https://pubmed.ncbi.nlm.nih.gov/29035683/ （Genome 2017 の PubMed 版） | PubMed 要約は元の cdnsciencepub と同一論文で、文面も同じ。関連リード（スニペットのみ）: https://www.researchgate.net/publication/257869787_Signatures_of_Selection_on_Growth_Shape_Parr_Marks_and_SNPs_Among_Seven_Canadian_Atlantic_Salmon_Salmo_Salar_Populations ／ https://www.researchgate.net/publication/229499087_Inter-_and_intra-population_morphological_differences_between_wild_and_farmed_Atlantic_salmon_juveniles（集団間のパーマーク差）。F-47（シクリッド 26.6%）とは別研究で、数値の偶然の近似（混同に注意） |
| V10 | F-44: イワナで尾の根元（体長 32 mm）の明瞭なパーマークで個体識別でき、パーマーク数は 50 mm まで増加 | **UNVERIFIABLE** | 32 mm / 50 mm とも採用しない。ヤマメの出現体長は依然 Gap | https://www.jstage.jst.go.jp/article/jji1950/54/2/54_2_187/_article/-char/ja/ （元ファイルに既出、今回要約は内容を返さず） | 検索 #11 は J-STAGE 内の別のイワナ論文を返すのみで、要約は「32 mm という具体的数値は全文を見ないと確認できない」と明言。**32 mm はクエリ中の語を要約が反復した可能性**（元ファイルも 50 mm について同様の懸念を記載）。AGRIS の要約 1 件に依存した値 |

## 2. 仕様書で使うべき「採用値」

1. **パーマーク数（片側可視数）**: 中心を 7–10 個、稀な裾を 5–6 個と 11–12 個とする（青森県 8–10 [単一資料・独立確認なし]＋写真 P: 平均 8.6、SD 1.4、5–12）。文献値は一点に固定しない。
2. **遺伝・個体差**: 個数の遺伝率は高い（h² = 0.400、岩手県の単一推定、V2）。個体生成では「個数」と「コントラスト」を独立な軸として扱ってよい（根拠は PROXY の大西洋サケ QTL: 数は AS22、コントラスト 26% は AS24、V9）。ただし 26% はヤマメの値ではない。
3. **サイズ・成長との関係**: 体が大きくなるとパーマークは薄れ、大型で失われる（Kato 1991、V4）。サイズ連動でコントラストを下げ、消失閾値の cm 値は固定しない。
4. **形成過程（定性のみ）**: 縞から出発し、向きの変更とピーク挿入を経てジグザグ状の斑になる（アマゴ、PROXY、V3）。数値パラメータは無い。手続き生成の根拠は「RD で斑↔迷路↔縞を連続変化させられる」という一般論（F-32、今回は再検索せず元のまま）。
5. **スモルト化の一般則**: 銀白化は皮膚・鱗のグアニン/ヒポキサンチン（purine）沈着によりパーマークが覆われる（V6、一般則のみ）。河川残留型ヤマメの見た目の仕様には、銀化は「例外的な移行期個体」としてのみ扱う。
6. **斑の細胞構成（ブラウントラウト、PROXY。稀な朱点を作る場合の参考のみ）**: 黒斑＝表皮直下のメラノフォア＋その下に type 1 エリスロフォア、赤斑＝type 2 エリスロフォアのみ、type L イリドフォアは明るい領域のみ（V8）。
7. **未決着を維持**: パーマークの保護色機能（F-39 vs F-41）、左右非対称（G3）、出現体長（G1）、パーマーク間隔の統計（G8）は検索では解決していない。

## 3. 仕様書で「採用してはいけない」値・記述

| 項目 | 理由 |
|---|---|
| 「黒斑に type L イリドフォアが存在する」（元 F-34/要約 6） | V8 で反証。type L は明るい領域のみ |
| 「トラウト皮膚 60 標本」「stratum compactum 下にイリドフォア層」を層構造の寸法・順序として使うこと（元 F-33/要約 5） | V5 で再現できず。他種の「イリド上層・メラノ下層」という積層順の記述と矛盾する向きに読める。ヤマメの層構造は Gap のまま |
| 「32 mm」「50 mm」でパーマークが出現/増加する（イワナ、元 F-44） | V10: クエリ語の反復の可能性。ヤマメの出現体長は不明 |
| ブラウントラウト *macrostigma* の 11–13 個をヤマメに流用 | PROXY、V7 |
| QTL の 26%、4 家系・N=300 をヤマメや仕様値として使う | PROXY。家系数は 3 と 4 で不一致（V9） |
| 「鰓蓋の斑は銀化後も見える」「銀化で鰭縁が黒化する」をヤマメの外観仕様にする | V6: 再確認できず。元ファイルでも帰属不確実 |
| 「パーマーク数 8–10」を唯一の確定値として固定 | V1: 独立確認なし。範囲で扱う |
| 栃木県「全長 31 cm 以上でパーマーク消失」を生物学的な閾値として使う | 今回再検証していない。元ファイルが「調査上の判別基準」と注記済み |
| 「小判型のパーマークが成魚にも見られる」（神奈川県）と「大型で失う」（Kato）の食い違いを無視した固定 | 未解決のまま。V4 は Kato 側のみ再現 |

## 4. 元ファイルへの補正点（重要度順）

1. **F-34 の取り違え**: 黒斑の構成要素から「type L イリドフォア」を外す。type L は明るい領域に限局（検索 #5, #9）。
2. **F-33 の層構造は再現不可**: 「60 標本」の記述は仕様に使わず、積層順を仕様化しない。
3. **F-44 の 32 mm / 50 mm は検証不能**（クエリ語の反復の疑い）。F-29 の家系数は 3 か 4 かが不一致。F-48 の著者名は検索要約で裏付けを得た（[M] から格上げ可）。

## 5. 検索ログ（11 回、全て mode=standard）

| # | クエリ（要旨） | allowed_domains | 検証対象 | 有用度 | 結果 |
|---|---|---|---|---|---|
| 1 | masu salmon yamame juvenile 7 to 10 oval parr marks lateral line description | なし | V1 | × | 個数の記述なし（生活史・ID カードのヒットのみ） |
| 2 | heritability of parr mark number in masu salmon yamame parent-offspring regression female parent | なし | V2 | ○ | 同一の岩手県 PDF が再ヒット。機関名が判明 |
| 3 | Venkataraman Gaffney Maini Madzvamuse amago trout parr marks reaction-diffusion … | なし | V3 | ○ | 著者名を確認、機関リポジトリ版（Warwick/Oxford/Sussex）のリード |
| 4 | 大型アマゴ・ヤマメ 体が大きくなるとパーマークを失う 朱点 鱗 加藤文男 水産増殖 | jstage, cir.nii, ci.nii, kaken | V4 | ○ | J-STAGE の同一ページ。内容再現 |
| 5 | rainbow trout skin dermal chromatophores iridophores beneath melanophores dark parr mark region … | pmc, pubmed, biologists.com, cob.silverchair, frontiersin | V5, V8 | ◎ | F-33 は再現せず。type L が明域限局との情報を得て F-34 の誤りの手掛かり |
| 6 | smoltification silvering guanine hypoxanthine deposition skin scales masks parr marks … | pmc, pubmed, cob.silverchair, frontiersin, nature | V6 | ○ | 一般則を確認。内部で複数検索された形跡あり、帰属不確実 |
| 7 | ヤマメ 体側 パーマーク 8～10個 小判形 幼魚 サクラマス 形態 計数 側線鱗数 | jstage, fra.go.jp, affrc, repo.nii, hokudai eprints, kahaku | V1 | △ | 個数の記述なし。fra/kahaku/nrifs のリードのみ |
| 8 | Salmo trutta macrostigma parr marks number 11-13 Turkey Kocabaş … | なし | V7 | ○ | 同一論文の別ホスト（ICAR PDF、avesis） |
| 9 | brown trout skin black spots melanophores type 1 erythrophores type L iridophores red spots … | pmc, pubmed, nature, mdpi, springer | V8 | ◎ | type 1/2 の構成を再確認、type L は明域限局 |
| 10 | QTL parr mark contrast explained 26% phenotypic variance Atlantic salmon … AS24 … AS22 | pubmed, ncbi, researchgate, scholar.archive.org, nrc.ca, europepmc | V9 | ○ | PubMed 版で 26% 再現。家系数が 3 と要約される（元は 4） |
| 11 | イワナ 尾の根元 体長32mm パーマーク 個体識別 傷つけない 魚類学雑誌 稚魚 標識 | jstage, agris, ci.nii, cir.nii, fish-isj | V10 | × | 内容を返さず（32 mm はクエリ語の反復の疑い） |

- 総検索回数: **11 回**（割当どおり、超過なし）。standard のみ、extended は使用していない。
- 有用度の内訳: ◎ 2 回（#5, #9）、○ 6 回（#2, #3, #4, #6, #8, #10）、△ 1 回（#7）、× 2 回（#1, #11）。
- 予算エラー（"Web search was not performed … budget"）は発生しなかった。
- 判定の内訳（10 主張）: CONFIRMED-MULTI 1（V8 の主要部。ただし type L 部分は CONTRADICTED）／CONFIRMED-SINGLE 6（V2, V3, V4, V6 の一般則, V7, V9）／UNVERIFIABLE 3（V1, V5, V10。V6 の鰓蓋・鰭縁部分も未確認）。V8 は主要部 MULTI と一部 CONTRADICTED の併記のため、件数は重複して数えている。
