# r08_swim_steady.md 独立検証レポート（懐疑的レビュー）

> 検証対象: /home/user/gerupamasini/docs/yamame/research/r08_swim_steady.md（元ファイルは未変更）
> WebSearch: **11回 / 割当11回**、mode はすべて standard（extended 0回）。予算超過・拒否の応答なし。
> 制約: 検索結果は「タイトル・URL・モデル要約」のみ。全文は読めない。**要約は誤読・過剰推論を含む**（下記 V-10 参照）ので、要約中の数値は「その文が資料の本文にある」ことの保証にならない。
> 注意: 検索1・2・3・4・5 は、1回の呼び出しの中でツールが内部的に複数回の再検索をした形跡がある（結果ブロックが複数）。呼び出し回数としては1回で数えた。
> 「独立」の扱い: 同じ論文を別ドメイン（ResearchGate、Semantic Scholar、CiNii 等）で索引したものは、**別の索引だが同一の根拠**。CONFIRMED-MULTI にはしない。
> **クエリに数値を含めた検索（検索3、6）は誘導的**で、要約が数値を復唱しただけの可能性がある。これらは確認度を一段下げて扱った。

## 1. 検証表

判定: CONFIRMED-MULTI（独立2資料以上が一致）／ CONFIRMED-SINGLE（1資料のみ。同一論文の別索引を含む）／ CONTRADICTED ／ UNVERIFIABLE

| 主張ID | 主張（要約） | 判定 | 補正値／範囲 | 新規出典URL | 備考 |
|---|---|---|---|---|---|
| V-01（元 F-04） | Di Santo 2021: 44種で振幅包絡の約90%（別要約92%）が二次多項式、統一モデルが振幅変動の60%を説明、線形項と二次項の相関 r=−0.89 | **UNVERIFIABLE**（数値）／ 骨子のみ CONFIRMED-SINGLE | 「44種、BCF推進、遊泳モードは離散でなく連続体」は検索要約で再確認。**90/92%、60%、r=−0.89 は再現できず** | 新規なし（ResearchGate／arXiv の無関係論文が出ただけ。PNAS／PMC が出なかった） | 二次多項式という関数形そのものは仕様に使ってよいが、率・相関を仕様書に数値で書くのは不可。係数 a0,a1,a2 は引き続き Gap |
| V-02（元 F-02, F-03） | サイス（PROXY）の包絡 A(0)=0.02, A(0.2)=0.01, A(1.0)=0.10 L、最小は頭から0.1 L で以後ほぼ直線。波長 0.59〜1.54 L、典型1 L | **UNVERIFIABLE** | 数値は再確認できず。**本書の二次式 A=0.02−0.0825x+0.1625x² は採用不可**（下記 §2） | https://cob.silverchair.com/jeb/article-pdf/109/1/209/2432345/jexbio_109_1_209.pdf（Videler & Hess 1984 の全文PDFが索引されている。要約からは数値が出なかった。別のクエリで本文に当たる余地あり） | 検索2は書誌情報と「サバは尾振幅が大きく尾柄部の曲率が強い」までしか返さなかった。元の3点値の出典文書（Videler & Hess 1984か、J. Exp. Biol. 202:3431か）は今回も特定できず |
| V-03（元 F-10） | ヤマメ稚魚（全長4.4〜8.8 cm）の尾鰭振動数 20.8〜39.1 Hz、振幅/全長 ≈ 0.12（振動数・速度に依存せず） | **CONFIRMED-SINGLE**（同一J-STAGEページ。クエリが数値入りで誘導的） | 数値は同じ。式は未取得のまま | https://www.jstage.jst.go.jp/browse/jsidre/80/2/_contents/-char/ja/（巻号目次）／ https://kaken.nii.ac.jp/en/file/KAKENHI-PROJECT-20580259/20580259seika.pdf（科研費成果報告書。内容未確認） | **独立な第二資料は得られず**。さらに内部矛盾の指摘あり（§2-B）: この周波数は定常巡航の値ではない |
| V-04（元 F-11） | ヤマメ稚魚の60分臨界遊泳速度 16〜41 cm/s、体長の3.5〜6.9倍（平均5.5、SD1.1） | **UNVERIFIABLE**（数値の独立再現なし。論文の存在のみ検索3で再確認） | 元の値をそのまま「単一資料・未再現」として扱う | https://eprints.lib.hokudai.ac.jp/dspace/handle/2115/44722 ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/95748/ForHUSCAP_ShimizuCBP.pdf（北大。ヤマメ vs サケ稚魚の臨界遊泳速度の候補。数値未確認） | 英語クエリでは泉・加藤論文が出なかった。北大の研究（ヤマメ稚魚の遊泳試験）が別系統の候補。ヤマメ成魚の値は依然ゼロ |
| V-05（元 F-14, F-16） | 突進速度は体長の約10倍、巡航速度は体長の2〜3倍（国交省）／サケ科の耐久速度 3〜4 BL/s、突進 >10 BL/s | **UNVERIFIABLE**（10 BL/s、3〜4 BL/s は再確認できず）。「流速が体長の2〜3倍程度が移動の限界」という要旨のみ弱い一致 | 突進10 BL/s は B 級のまま。ヤマメ固有ではない | https://www.maff.go.jp/j/nousin/attach/pdf/tousyukou-31.pdf（頭首工の魚道設計。遊泳速度の設計値の候補。未確認）／ https://www.jstage.jst.go.jp/article/jscejb/65/4/65_4_296/_pdf（突進速度、アユ・オイカワ等。サケ科でない） | 要約が「突進と持続の差は約2〜3倍」と書くなど内容が崩れており、使えない。元の国交省PDF／NDLページが再度出ただけで独立ではない |
| V-06（元 F-15） | 土木学会論文集1999 No.622: 60分の耐久遊泳速度（水温12〜13℃以上）はイワナ・ウグイ 85、コイ 70、ギンブナ・オイカワ 65、カワムツ 55 cm/s | **CONFIRMED-SINGLE**（同一論文を CiNii が別索引。クエリが数値入りで誘導的） | 数値は一致。追加情報: 8〜9℃以下で低下（要約）。実験は1993春〜1994冬の大型水路（要約） | https://cir.nii.ac.jp/crid/1390001205309281664 ／ https://cir.nii.ac.jp/crid/1050001338672811904（「イワナ・ニジマス・カジカの遊泳特性」。サケ科の遊泳値の候補。未確認） | 「体重に比例」という要約文は意味不明で採用しない。魚の体長範囲は依然不明。PROXY:イワナ |
| V-07（元 F-17） | Drucker & Lauder 2003: ニジマスは 0.5・1.0 BL/s の定速遊泳で胸鰭を体側に畳む。胸鰭は定位・旋回・制動で使う | **CONFIRMED-SINGLE**（同一論文の抄録を ResearchGate と Semantic Scholar が索引。文言一致） | 追加情報（要約）: 定位（ホバリング）時は胸鰭を体の下へ下ろし、長軸まわりに捻って前後にスカル運動。旋回・制動時は逆向きに翼幅方向へ回旋し、左右・上下に振れる。旋回では側方の力が出て体のヨー回転を駆動する | https://www.researchgate.net/publication/10933289_Function_of_pectoral_fins_in_rainbow_trout_behavioral_repertoire_and_hydrodynamic_forces ／ https://www.semanticscholar.org/paper/Function-of-pectoral-fins-in-rainbow-trout:-and-Drucker-Lauder/fb50c2bcae8575cf4e50189d22140746cdbc2372 ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/（乱流中の定位、胸鰭の運動学と筋活動。題のみ確認） ／ https://www.researchgate.net/publication/7429670_Locomotor_function_of_the_dorsal_fin_in_rainbow_trout_Kinematic_patterns_and_hydrodynamic_forces（背鰭の機能。Gap 11 の候補） | 適用範囲は 0.5〜1.0 BL/s の水槽内定速遊泳に限る。流れの中の定位（河川の定位）には当てはめない（乱流中の定位は別論文の題で胸鰭の活動が示唆されるが、内容未確認） |
| V-08（元 F-22） | Przybilla 2010: entraining のニジマスは体を波打たせずまっすぐ角度を付けて保持／円柱前（bow wake）では尾鰭振幅と体波速度が低い／時間配分 13.6%・14.2%・28.3%／entraining が最も省エネ | **CONFIRMED-SINGLE**（定性のみ。元と同じ JEB ページ）。**時間配分の数値は UNVERIFIABLE**。「entraining が最も省エネ」は**要約間で食い違い** | 定性: 「規則的な軸方向の波打ちがない」「bow wake では他の条件より尾鰭振幅・体波速度が低い」は再確認。時間配分 13.6/14.2/28.3% は要約が「見つからなかった」と回答 | https://journals.biologists.com/jeb/article/213/17/2976/9891/Entraining-in-trout-a-behavioural-and-hydrodynamic（元と同じ）／ https://journals.biologists.com/jeb/article/209/20/4077/16399/The-role-of-the-lateral-line-and-vision-on-body（Liao 2006。側線と視覚、乱流中の体運動学。内容未確認） | 今回の要約は「bow wake が定位に最もエネルギー的に有利な領域かもしれない」と書き、元の F-22 の「entraining が最も省エネ」と逆向きに読める。**どちらも原文未確認なので、仕様書は省エネ序列を書かない**。3つの定位位置（円柱の上流＝bow wake／側方＝entraining／下流＝Kármán gait）という区分は要約で再確認 |
| V-09（元 F-18, F-19, F-21） | Kármán gait: 尾鰭振動数＝渦放出周波数（自由流より低く体サイズに非依存）、尾端振幅は自由流の約3倍、出現確率は流速30〜70 cm/s で最大、速度欠損約40% | **CONFIRMED-MULTI**（定性の核: Liao 2003 と Akanyeti & Liao 2013a の2論文が一致）。数値の 30〜70 cm/s、約3倍、40% は **CONFIRMED-SINGLE**（Akanyeti & Liao 2013a のみ） | 追加・補正: ①尾鰭振動数は渦放出周波数に「一致」（2013a）／「一致するがわずかに高い」（Liao 2003 の要約）の2表記。**f_尾 ≈ f_渦（高くても僅差）**で扱う。②Kármán gait で大型魚ほど体波長が短く波速が遅いのは、自由流（大型ほど波長・波速が増える）と逆（再確認）。③尾鰭振幅は体サイズとともに増える（自由流と同じ傾向で、大きさが約3倍）。④要約が「体波速度は公称流速より約25%速く、速度欠損約40%に対応」と書くが、文が崩れていて意味が取れない。**採用しない** | https://pubmed.ncbi.nlm.nih.gov/12582148/（Liao 2003）／ https://www.semanticscholar.org/paper/The-effect-of-flow-speed-and-body-size-on-K%C3%A1rm%C3%A1n-in-Akanyeti-Liao/e009b7a412d2071fe92c3c5eaf1ebe2779b58d24 ／ https://www.researchgate.net/publication/8372513_Neuromuscular_control_of_trout_swimming_in_a_vortex_street_Implications_for_energy_economy_during_the_Karman_gait ／ https://journals.biologists.com/jeb/article/227/23/jeb247873/363304/Swimming-kinematics-of-rainbow-trout-behind-a-3-5（円柱列後流、2024） | 自由流のニジマスの λ/L・振幅/L は検索9で再び出ず（Gap のまま）。「速度欠損約40%」は「局所流速が公称の約60%」と読むのが自然だが、元の日本語「40%の領域」とは曖昧なため、原文確認までは「欠損約40%」と書く |
| V-10（元 F-09, F-23） | 尾鰭振幅は A ≃ 0.2 L（オタマジャクシ〜クジラ）、ニジマスのバースト中は 0.17 L で一定、振動数は平均速度に線形 | 一般則 A≈0.2 L: **CONFIRMED-SINGLE**（同趣旨の文が複数ページに出るが、どの文書か要約が特定しない）。**0.17 L は UNVERIFIABLE** | 追加: 加速中の尾鰭振幅は定常遊泳より約25%大きい（学会要旨 sicb.org/?p=12916 の題と要約）。速度は主に尾鰭振動数で調節し、振幅は速度に対して変化が小さく非線形（要約） | https://sicb.org/?p=12916 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC8634626 ／ https://www.arxiv.org/pdf/2301.10466 ／ https://sicb.org/abstracts/undulatory-propulsion-in-swimming-fish-evidence-of-fluid-body-resonance-effects-on-tail-beat-frequency | 検索11の要約は「25%高い＝約0.25 L で 0.17 L と整合」と結論したが、**「25%増し」を「0.25 L」と読み替えるのは誤り**で、0.17 L の裏付けにならない。「振幅は一定」は「変化が小さい」に弱める。振幅の定義（片振幅か peak-to-peak か）は今回も不明 |

## 2. 内部整合チェック（検索不要、ローカル計算）

### A. 元 F-02 のサイス包絡は、二次式にしてはならない
- 元の3点 A(0)=0.02、A(0.2)=0.01、A(1.0)=0.10（単位 L）と、要約本文の「頭から0.1 L に最小、以後尾端までほぼ直線的に増加」は、**区分線形なら矛盾なく両立する**。0.2〜1.0 L を直線とすると傾きは (0.10−0.01)/0.8 = 0.1125 per L、A(x)=0.01+0.1125·(x−0.2)（本書の算出）。頭 0〜0.1 L で 0.02 から最小（0.01 弱）まで下がる。
- 元の二次式 A=0.02−0.0825x+0.1625x² は最小が x≈0.25 L にずれ、「0.1 L に最小、以後ほぼ直線」と食い違う。つまり矛盾は**元の二次式の当てはめが作った人工物**で、資料の記述の矛盾ではない。
- ただし、3点値そのものが検索2で再確認できなかったので、区分線形も**仮置き（PROXY:サイス、未検証）**。仕様書には「最小は頭近く、中央から尾へほぼ直線的に増加」という定性的記述と、頭の振幅が尾端より小さいが非ゼロ、にとどめる。
- 頭/尾振幅比 ≈ 0.2（元の表）は 0.02/0.10 の単純比で、同じ理由で未検証。

### B. 元 F-10（尾鰭 20.8〜39.1 Hz）は「定常巡航」の値ではない
- F-10 の水路平均流速は 48〜137 cm/s。F-11 の 60分臨界遊泳速度は 16〜41 cm/s（体長 4.8〜7.1 cm）。F-10 の流速は F-11 の臨界遊泳速度の約1.2〜8.6倍（算出）。60分持続できない速度なので、F-10 の振動数は**短時間（バースト〜遷延域）の値**とみるのが自然。
- したがって「ヤマメの定常遊泳の尾鰭振動数」として仕様書に使ってはいけない。使うなら「高速（BL/s で約6〜37、算出）での短時間遊泳の上限域」と明記する。F-10 と F-11 は別実験（場所・魚・手法）で、同じ個体群ではない可能性があるため、これは推論であり確定ではない。
- 振幅/全長 0.12 は「全長比」で、定義（片振幅か peak-to-peak か）が不明。ニジマスの 0.2 L（定義不明）とは直接比較できない。

### C. 元 F-26（M）の波速比との接点
- 今回の要約の一つ「Kármán gait の体波速度は公称流速より約25%速い」が正しければ、V/U≈1.25 は元 F-26 の「1.1〜1.4前後」（M）と整合的だが、要約が崩れていて確認にならない。M のまま維持。

## 3. 仕様書で使うべき値／使ってはいけない値

### 採用してよい値（条件付き）
| パラメータ | 採用値 | 確認度 | 条件 |
|---|---|---|---|
| 包絡の関数形 | 尾に向かって増える二次（放物線）形。頭は小さいが非ゼロ | 形のみ A（V-01 は骨子のみ） | 係数は未取得。「90/92%」「r=−0.89」は書かない |
| 尾端振幅 / L | 約0.1〜0.2 L の範囲で仮置き。速度に対して変化は小さい | V-10 CONFIRMED-SINGLE（一般則）、F-10 の 0.12 は単一 | 振幅の定義（片振幅か peak-to-peak か）を仕様書に明記し「未確認」と書く |
| 速度の調節 | 速度は主に尾鰭振動数で変える（振幅は変化が小さい） | V-10、元 F-06/F-08 | ヤマメ成魚の f–U 式は Gap |
| 体波長 | 約0.9 L（ニジマス）。速度に独立 | **今回検証せず**（元 F-06/F-07 のまま。A 級の単一資料） | 仮置き。サイス値 0.59〜1.54 L は使わない（V-02 未検証） |
| 胸鰭 | 0.5〜1.0 BL/s の定速遊泳では体側に畳む。定位・旋回・制動で能動的に動かす | V-07 CONFIRMED-SINGLE（抄録が2索引で一致） | 水槽内ニジマスの値。河川での定位時の胸鰭の姿勢は断定しない |
| 定位・障害物回り | 円柱の上流（bow wake）／側方（entraining）／下流（Kármán gait）の3つの定位位置。entraining は体をほぼ波打たせず、まっすぐ角度を付けて保持 | V-08（定性）、V-09 | 時間配分や省エネ序列は書かない |
| Kármán gait | f_尾 ≈ f_渦（体サイズに非依存）、尾端振幅は自由流の約3倍、体波長 >1 L、側方変位 >0.5 L、出現流速の目安 30〜70 cm/s | V-09 CONFIRMED-MULTI（核）／SINGLE（数値） | ニジマス・円柱後流の水槽実験。自然河川への外挿は仮説 |
| ヤマメ稚魚の Ucrit | 16〜41 cm/s、3.5〜6.9 BL/s（平均5.5） | V-04 単一・未再現 | 稚魚（体長4.8〜7.1 cm）限定。成魚に使わない |
| 持続遊泳の目安（成魚） | イワナ 85 cm/s（60分、水温12〜13℃以上）等 | V-06 CONFIRMED-SINGLE | PROXY:イワナ。ヤマメ成魚の値は無い。8〜9℃以下で低下 |
| 設計目安（日本） | 巡航 2〜3（〜4）BL/s、突進 約10 BL/s | V-05 UNVERIFIABLE（B級のまま） | 「仮置き・B級」と明記。ヤマメ固有ではない |

### 採用してはいけない値・記述
1. **サイスの二次式 A(x)=0.02−0.0825x+0.1625x²**（元 F-02／設計表）。3点値が未検証で、要約本文の形とも一致しない（§2-A）。
2. **Di Santo の「約90%／92%」「60%」「r=−0.89」を数値として仕様書に書くこと**（V-01、再現できず）。
3. **サイスの波長 0.59〜1.54 L（典型1 L）**（V-02）。
4. **ヤマメ稚魚の尾鰭振動数 20.8〜39.1 Hz を「定常巡航の振動数」として使うこと**（§2-B）。
5. **ニジマスのバースト振幅 0.17 L**（V-10。裏付けなし）、およびそれを「0.25 L」と読み替える要約の記述。
6. **entraining の時間配分 13.6%／14.2%／28.3%**、および「entraining が最も省エネ」という序列（V-08）。
7. **Kármán gait の「体波速度は公称流速の約25%増し」**（V-09、要約が崩れている）。
8. **「耐久遊泳速度は体重に比例」**（V-06 の要約。意味不明）。
9. 「突進と持続の差は約2〜3倍」（V-05 の要約。国交省資料の「巡航は体長の2〜3倍」と取り違えている）。
10. 元 §3-9 で既に不採用としたものは引き続き不採用。

### 次に当たるべき資料（検索で URL が出たが、数値は未確認）
- Videler & Hess 1984 本文: https://cob.silverchair.com/jeb/article-pdf/109/1/209/2432345/jexbio_109_1_209.pdf
- 農水省 頭首工の魚道設計（遊泳速度の設計値）: https://www.maff.go.jp/j/nousin/attach/pdf/tousyukou-31.pdf
- CiNii「イワナ・ニジマス・カジカの遊泳特性」: https://cir.nii.ac.jp/crid/1050001338672811904
- 北大のヤマメ稚魚の遊泳試験: https://eprints.lib.hokudai.ac.jp/repo/huscap/all/95748/ForHUSCAP_ShimizuCBP.pdf
- ニジマスの日常遊泳の構成（行動アニメ向け）: https://www.researchgate.net/publication/237183621_Composition_and_Mechanics_of_Routine_Swimming_of_Rainbow_Trout_Oncorhynchus_mykiss
- ニジマスのサイズと遊泳速度の関係: https://www.researchgate.net/publication/237178510_A_Relation_of_Size_to_Swimming_Speed_in_Rainbow_Trout

### 今回検証しなかった主要な主張（割当の都合）
体波長 0.9 L（元 F-06/F-07）、コホ・大西洋サケの Ucrit（F-12/F-13）、Kármán gait の波の開始位置 0.2 L（F-20）、サイス・サバの比較（F-01）。これらは元の評価（A級・単一資料）のまま、未検証として扱う。

## 4. 検索ログ（11回／割当11回、すべて mode=standard）

| # | クエリ（要旨） | allowed_domains | 結果・有用度 |
|---|---|---|---|
| 1 | undulatory swimming kinematics 44 species amplitude envelope second-degree polynomial, linear/quadratic coefficients negatively correlated | pubmed, europepmc, semanticscholar, researchgate, eurekalert | 低。PNAS／PMC が出ず、無関係論文（arXiv、ResearchGate）のみ。「44種・連続体」の骨子だけ再確認。V-01 は UNVERIFIABLE |
| 2 | saithe Pollachius virens steady swimming amplitude minimum near snout … wavelength 0.59–1.54 | なし | 低〜中。Videler & Hess 1984 の全文PDFの所在（cob.silverchair）を確認。要約には数値なし。V-02 は UNVERIFIABLE |
| 3 | ヤマメ稚魚 尾ひれ 振動数 20.8 39.1 回 振幅 全長 比 0.12 スタミナトンネル | cir.nii, agriknowledge, kaken, semanticscholar, researchmap, jstage | 中。J-STAGE の2論文（jsidre 80(2)、79(3)）が再度出て存在確認。クエリが数値入りで誘導的。科研費報告書 20580259 を発見（内容未確認）。V-03 は CONFIRMED-SINGLE |
| 4 | juvenile masu salmon yamame critical swimming speed 60 min river water … 3.5 6.9 times | なし | 低〜中。泉・加藤は出ず。北大の masu salmon Ucrit 研究（候補）を発見。V-04 は UNVERIFIABLE |
| 5 | 魚の遊泳速度 巡航速度は体長の何倍 突進速度は体長の10倍 サケ科 持続速度 BL/s 魚道 | rnavi.ndl, maff, nilim, pwri, env, kantei | 低。NDL リサーチ・ナビは再出（元と同じ）。要約が崩れ、10 BL/s・3〜4 BL/s は再確認できず。農水省 頭首工 魚道設計PDFを候補として発見。V-05 は UNVERIFIABLE |
| 6 | 淡水魚類の耐久遊泳速度 60分 イワナ ウグイ 85cm/s … | library.jsce, cir.nii, ci.nii, jstage, semanticscholar | 中。CiNii の別索引で一致（誘導的クエリ）。「イワナ・ニジマス・カジカの遊泳特性」を発見。V-06 は CONFIRMED-SINGLE |
| 7 | rainbow trout pectoral fins held against body adducted … 0.5 and 1.0 BL/s … | pubmed, researchgate, semanticscholar, europepmc | **高**。ResearchGate／Semantic Scholar で抄録文言が一致し、胸鰭の動作の詳細が追加。背鰭・乱流中定位の関連論文を発見。V-07 は CONFIRMED-SINGLE |
| 8 | trout entraining cylinder no rhythmic body undulation … percentage of time … | pubmed, researchgate, semanticscholar, europepmc, biologists | 中。JEB の同一ページが再出。定性は一致、時間配分は「見つからない」。bow wake が有利かもしれないという記述（元と食い違い）。V-08 |
| 9 | free-stream swimming rainbow trout body wavelength relative to BL, amplitude, frequency vs Kármán gaiting | biologists, biorxiv, pmc, researchgate | 中〜高。Kármán gait の振幅約3倍、大型ほど波長短・波速遅、f は渦放出周波数に依存。自由流の λ/L・振幅/L の数値は出ず。V-09 |
| 10 | Kármán gaiting probability highest 30 to 70 cm/s; frequency matched shedding; deficit 40% | pubmed, europepmc, semanticscholar, researchgate, ouci | 中〜高。30〜70 cm/s、f＝渦放出周波数を再確認。「約25%速い体波速度」の要約は崩れており不採用。V-09 |
| 11 | tail-beat amplitude approx 0.2 body length independent of speed; burst amplitude 0.17 L | なし | 中。A≈0.2 L の一般則を再確認（文書特定不能）。0.17 L は再確認できず。「加速中は25%増し」を発見。要約の「0.25 L」読み替えは誤り。V-10 |

- 総検索回数: **11**（extended は0回）。予算拒否の応答なし。
- 判定の内訳（10主張）: CONFIRMED-MULTI 1（V-09 の核）／ CONFIRMED-SINGLE 5（V-03, V-06, V-07, V-08 の定性, V-10 の一般則）／ CONTRADICTED 0 ／ UNVERIFIABLE 4（V-01, V-02, V-04, V-05）。ただし V-03・V-06 はクエリが数値入りで誘導的、V-03・V-04・V-06・V-07・V-08 の「単一」は同一論文の別索引にすぎない。
