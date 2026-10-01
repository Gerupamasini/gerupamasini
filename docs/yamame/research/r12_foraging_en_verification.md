# r12_foraging_en.md 独立検証レポート（懐疑的レビュー）

- 対象: `/home/user/gerupamasini/docs/yamame/research/r12_foraging_en.md`（773 行を全て読了。原本は書き換えていない）
- 検証担当: 独立検証（r12 検証）
- 検索: WebSearch **11 回 / 割当 11 回、全て mode=standard、extended 0、budget 拒否 0**。WebFetch・curl は使っていない。
- 検証した主張: **10 個（C1〜C10）**。C6 だけ「定性」と「数値」で判定が割れたため C6a／C6b の 2 行に分け、**判定行は 11 行**。
- 判定の種類: CONFIRMED-MULTI（独立 2 資料以上が一致）／CONFIRMED-SINGLE（1 資料が一致）／CONTRADICTED／UNVERIFIABLE。

## 0. 先に読むこと（この検証の限界）

1. 読めたのは検索結果の「タイトル・URL・モデルが作った要約」だけで、論文全文は読めていない。要約に数値が無いものは採用せず UNVERIFIABLE とした。
2. **「独立」の程度に差がある。** C1・C2・C5 は、原本と同じ URL（同じ要約元）が再び出ただけで、**第二の独立資料は得られていない**。この 3 件は「CONFIRMED-SINGLE（非独立）」と明記した。原本の記述が「検索結果に実在する」ことの再確認であり、数値の裏付けが 2 倍になったわけではない。
3. クエリに数値を含めた検索（#1、#2、#8、#11）は、検索側モデルが数値をなぞって返した可能性がある。数値を含めずに同じ数値が返った検索（#3 の 52/39/9、#7 の Wankowski の相対値）は、その疑いが小さい。#2 は数値入りのクエリでも「数値は結果に無い」と返ったので、なぞりだけではない。#1 は、クエリに入れていない n=23 と R²=0.87 が返ったので、要約に実際に載っていると読める。各行の備考に書いた。
4. ヤマメ（O. masou masou）以外のデータは全て PROXY のまま。この検証で PROXY がヤマメに昇格したものは無い。
5. 自分の記憶に由来する記述は M と明記した。M は判定の根拠にしていない。

---

## 1. 検証表

証拠ランク: A=査読論文・学術書・公的機関資料で要約文中に数値/記述が明示／B=図鑑・自治体・学位論文・解説・モデル要約のみ／C=釣り・個人サイト・出典不明／M=記憶（未検証）／P=ユーザー写真。

| 主張ID | 主張（要約） | 判定 | 補正値／範囲 | 新規出典 URL | 備考 |
|---|---|---|---|---|---|
| C1（F-22） | Grant & Kramer 1990: 幼若サケ科の種間回帰 log10(縄張り面積 m²) = 2.61 × log10(尾叉長 cm) − 2.83、R² = 0.87、n = 23 | **CONFIRMED-SINGLE（非独立）** | 補正なし。式・R²・n は一致。尾叉長 FL（全長ではない）。 | 新規なし。原本と同一の PDF が再び先頭に出た: https://sitesreservoirproject.riptideweb.com/references/REF23/Volume%202/App11M_Yolo_Sutter_Bypass_Weir_Spill_Analysis/Grant%20and%20Kramer_1990_Territory%20Size.pdf | クエリには 2.61 と 2.83 を入れたが、R²=0.87 と n=23 は入れていないのに要約に出た（A）。要約は「公表データから種間回帰を作り、最大密度回帰（その逆）と成長・死亡の軌跡を比べた。浅い生息場所（瀬、raceway）では軌跡がほぼ一致」と述べ、原本の F-22 の説明と一致。**独立した第二の資料（Grant ら 1998 など）は今回の検索では出なかった。** 原本の算出表（5〜30 cm）を局所計算で再点検し、全行が式と一致（例: FL10 → 0.60 m²、FL20 → 3.7 m²、FL30 → 10.6 m²）。適用サイズ範囲は要約に無く、未解決。 |
| C2（F-03） | Piccolo ら 2008（coho／steelhead 幼魚、水槽）: 流速 0.29 → 0.61 m/s で捕獲確率 65% → 10%、検出距離も低下、迎撃は全流速で Vmax | **CONFIRMED-SINGLE（非独立）** | 端点 65%／10%、流速 0.29／0.61 m/s は一致。**書誌を補足: Can. J. Fish. Aquat. Sci. 65: 266–275 (2008)**（#2 の要約）。 | 数値の再確認元は原本と同じ: https://research.fs.usda.gov/treesearch/31556（#11）。書誌の確認: https://link.springer.com/article/10.1007/s10641-008-9330-1 は**別の論文**（下の備考） | #2（ドメインを絞った検索）は、数値入りのクエリにもかかわらず「要約に 65%／10% は無い」と返した。数値は USDA Treesearch の要約にしか出ない。**原本の F-03 が「r09 の候補」と書いた Springer 10.1007/s10641-008-9330-1 は、題名が "Development of net energy intake models for drift-feeding juvenile coho salmon and steelhead" で、流速の論文ではない（訂正）。** 解釈の注意: 別パスの要約表記は "(-65% to 10%)"、今回の要約は "(65% to 10%, with an increase of velocity from 0.29 to 0.61)" と、"from" の有無が揺れる。自然な読みは「0.29 m/s で 65%、0.61 m/s で 10%」だが、**関数形は不明**。 |
| C3（F-38） | Chinook 幼魚（Chena 川）: 追った餌候補のうち 52% は捕獲後すぐ吐き出し、39% は視認のみで捕獲せず、9% が飲み込まれた。ゴミの処理は採餌時間の 4〜25% | **CONFIRMED-SINGLE** | 補正なし。52／39／9、4〜25% は一致。著者: Neuswanger, Wipfli, Rosenberger, Hughes（2014、Environ. Biol. Fishes）。 | https://www.usgs.gov/publications/mechanisms-drift-feeding-behavior-juvenile-chinook-salmon-and-role-inedible-debris-a ／ https://link.springer.com/article/10.1007/s10641-014-0227-x ／ https://fishbio.com/hungry-hungry-salmon/（解説、B） | クエリに数値を入れずに同じ数値が返った（#3）ので、なぞりの疑いは小さい。USGS・EPSCoR・OUCI は同じ抄録の転載で、**独立した別研究ではない**（1 研究）。Springer の URL で書誌（EBF）が確認できた。 |
| C4（F-44） | Chinook 幼魚の群れ内で、個体は競争相手の近傍を 1.0〜2.9 体長まで避けた（野外 3D 映像） | **CONFIRMED-SINGLE** | 補正なし。1.0〜2.9 体長。**掲載誌は Can. J. Fish. Aquat. Sci.（DOI 10.1139/cjfas-2022-0112）**。場所は Chena 川（アラスカ）。「瞬間的行動圏（momentary home range）」の概念で 3D 空間の広さ・排他性を測った。 | https://cdnsciencepub.com/doi/10.1139/cjfas-2022-0112 ／ https://www.researchgate.net/publication/364910517_Territories_within_groups_the_dynamic_competition_of_drift-feeding_juvenile_Chinook_salmon_in_3-dimensional_space | 原本は USGS の URL だった。今回は別ドメイン（cdnsciencepub、ResearchGate）で同じ論文の抄録が出た。クエリに 1.0〜2.9 を入れたため、なぞりの可能性は残る（#8）。掲載年は要約に無い（DOI の番号から 2022 年投稿と読めるだけで、出版年は未確認）。 |
| C5（F-37、F-46(3)） | 大西洋サケ幼魚（Wankowski 学位論文）: 反応距離は餌径が 0.025 体長で最大。0.025 体長以下の餌は 100% 摂食、0.051 体長の餌の 90%、0.105 体長の餌の 100% が拒否 | **CONFIRMED-SINGLE（非独立）** | 補正なし。追加で確認できた値: 捕食可能な餌の相対サイズ幅は 0.06 体長で、魚のサイズ（2.8〜20.3 cm）に依らず一定。全サイズ（4.2〜20.3 cm）で成長最大の餌径は 0.022〜0.026 体長。 | 新規なし。原本と同一の学位論文が再び出た: https://www.storre.stir.ac.uk/bitstream/1893/35136/1/Wankowski-thesis-1977.pdf ／ https://storre.stir.ac.uk/handle/1893/35136 | クエリに数値を入れずに同じ数値が返った（#7）。**F-46(3) の「0.06 体長、2.8〜20.3 cm」は、原本が「同じ学位論文の可能性」と書いた通り、同じ Wankowski 学位論文の記述と確認できた（帰属の未確定が解消）。** 学位論文（B）で、査読論文ではない。第二の独立資料は出ていない。 |
| C6a（F-29、F-49） | 大西洋サケ幼魚は、低水温になると昼行性から夜行性へ切り替わり、昼は基質の隙間に隠れる（定性） | **CONFIRMED-MULTI（定性のみ、PROXY: 大西洋サケ）** | 方向は一致。複数の独立した研究が低水温と夜行性・昼の隠れを扱う。 | 題名と要約で確認（#6）: https://cdnsciencepub.com/doi/10.1139/z95-051（"Low summer temperatures cause juvenile Atlantic salmon to become nocturnal"）／ https://cdnsciencepub.com/doi/10.1139/f99-078（"Nocturnal habitat use of Atlantic salmon parr in winter"）／ https://besjournals.onlinelibrary.wiley.com/doi/10.1111/j.1365-2656.2006.01088.x（Orpwood 2006）／ https://www.sciencedirect.com/science/article/abs/pii/S0003347297905509（"Seasonal changes in sheltering: effect of light and temperature on diel activity in juvenile salmon"） | **水温だけが切り替えを起こす可能性を、題名が直接支持する**（夏でも低温なら夜行性になる）。要約は「冬は昼に河床の避難所に隠れ、夜に出る。夜の定位は流れの遅い所」と述べるが、**数値は含まない**。ヤマメでの確認は無い。 |
| C6b（F-29、F-49） | 切り替えの水温: 8–12℃ 未満で昼の活動を抑制、6–8℃ で隠れ始める、10℃ 超で部分的夜行性／10℃ 未満でほぼ完全な夜行性 | **UNVERIFIABLE（数値）** | 今回の要約に温度の数値は一つも出なかった。8–12℃、6–8℃、10℃ のいずれも、独立には確認できていない。 | なし | 原本の数値は、複数ページを統合した要約（Johnston ら 2004 の候補を含む）由来で、帰属不確実と原本自身が書いている。**ヤマメの閾値は M にも無い。** 仕様では調整値の初期レンジとして扱い、根拠欄に「未検証・PROXY」と書く。 |
| C7（F-31） | Ueno ら 2009: 成魚（イワナ・ヤマメ）がいると、幼魚の定位点は岸際の浅く流速の低い場所へ移り、1 尾あたりの分布面積と摂餌頻度が有意に減る（日本の山地渓流の小支流、野外の実験区） | **CONFIRMED-SINGLE** | 補正なし。方向・対象は一致。**日本語題名は「小支流におけるイワナ，ヤマメ稚魚の定位点，行動圏および摂餌頻度に対する両種成魚の影響」。** 「分布面積」は日本語では「行動圏」と表記される。 | https://www.jstage.jst.go.jp/article/suisan/75/5/75_5_802/_article/-char/ja/ ／ https://www.jstage.jst.go.jp/article/suisan/75/5/75_5_802/_pdf/-char/ja | 日本語の抄録（J-STAGE）が英語抄録（原本が引用した miyagi.kopas.co.jp）と一致: 稚魚のみでは定位点・行動圏が全域に分布、成魚混生時は岸辺近くの浅い緩流部へ移動し、行動圏面積と摂餌頻度が減少。同じ論文の日本語版と英語版なので、**独立した別研究ではない**。流速・水深の絶対値は日本語の要約にも無い。 |
| C8（F-32） | 北海道のサクラマス幼魚は冬に水際（channel margin）の流速 約 20 cm/s・水中の被覆を好む（野登川） | **UNVERIFIABLE** | 約 20 cm/s は今回も確認できず。 | なし（確認できた周辺情報は下の備考） | 日本語クエリ（#5）の結果は北海道立総合研究機構（hro.or.jp）などの資料で、冬期の 20 cm/s は含まれなかった。要約が述べたのは、サクラマス稚魚が 5 月には川岸の植生のあるほとんど流れのない場所に、7 月には流速・水深の大きい場所にいたこと、生息密度は草地区間より森林区間で高く、森林区間の大礫・緩流区間で最も高かったこと（B、数値無し、資料の特定不能）。これは**冬ではなく**、F-34（台湾産陸封型）の「稚魚は低流速・被覆 → 成長すると中程度の流れの深み」と同方向の定性的な支持にとどまる。 |
| C9（F-01） | 環境省資料: ヤマメは流速 10〜35 cm/s、粒径 0.5〜5.0 cm の礫底の渓流に生息 | **UNVERIFIABLE** | 10〜35 cm/s は今回も確認できず。**注意: 産卵床の条件である可能性がある（私の推論、M／B）。** | なし（産卵床の数値は下の備考） | 日本語クエリ（#9）で出たのは**産卵床**の条件だった: 産卵場の水深 5–30 cm・流速 5–30 cm/s・粒径 10–30 mm が「ヤマメ／アマゴ類で共通して当てはまる条件」、ヤマメ／アマゴの産卵床は水深 10–32 cm（中央値 21.5 cm）、流速 10.0–52.1 cm/s（中央値 14.2 cm/s）（B、自治体・試験場資料の要約。どの資料か特定不能）。F-01 の「粒径 0.5〜5.0 cm の礫」は産卵床に典型的な粒径の範囲で、**F-01 の 10〜35 cm/s が「生息（定位）」ではなく「産卵床」の条件を指している可能性を排除できない。** 原本は F-01 を「焦点流速ではない」と注記済みだが、産卵床の可能性までは書いていない。 |
| C10（F-02） | ドリフト捕食の魚は観察時間の平均 81% を定位点で過ごし能動採餌は 14%。迎撃速度は期待される最大持続遊泳速度より遅く、餌の約 2/3 は定位点より下流側で捕獲（出典未特定、C） | **UNVERIFIABLE（81%／14%）。出典の絞り込みのみ** | 81%／14% は結果に出ず。 | https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river（原本の候補と同じ。#10 では「迎撃が最大持続遊泳速度より遅い」「餌の約 2/3 を定位点より下流側で捕獲」が NZ の brown trout の 3D 映像研究に由来するように見える、と検索側モデルが述べた） | 検索側モデルが「由来するように見える（appears）」と書いただけで、抄録の文は確認できていない。**81%／14% は「結果にない」と明言された。** 同じ要約が「捕獲確率は定位点からの横方向の距離とともに低下した」とも述べた（NZ brown trout の研究への帰属、B）。もし NZ の brown trout が出所なら、F-03（Piccolo: 水槽の coho／steelhead は Vmax で迎撃）と迎撃速度が食い違う点は、種と野外／水槽の違いとして §3-3 の説明が使える。 |

### 判定の集計（判定行 11）

- CONFIRMED-MULTI: 1（C6a。定性のみ）
- CONFIRMED-SINGLE: 6（C1、C2、C5 は非独立、C3、C4、C7）
- CONTRADICTED: 0
- UNVERIFIABLE: 4（C6b、C8、C9、C10）

**反証された主張は無かった。** ただし、原本の「候補 URL」の書誌誤り（C2）と、F-01 の意味づけの疑い（C9）は訂正対象である（§4）。

---

## 2. 仕様書で使うべき「採用値」

全て PROXY（ヤマメ以外）で、config の調整値として持ち、根拠欄にランクと PROXY を残すこと。

| 採用値 | 用途 | ランク／scope | 条件 |
|---|---|---|---|
| 縄張り面積 A(m²) = 10^(2.61 × log10(FL cm) − 2.83)（R²=0.87、n=23） | 個体の占有面積の上限的な目安。FL 10 cm で 0.60 m²、15 cm で 1.7 m²、20 cm で 3.7 m² | A、PROXY: 幼若サケ科の種間回帰（C1） | 適用サイズ範囲が不明のため、FL 20 cm 超は「外挿」と明記。尾叉長で入力し、全長を入れない。餌量・密度で変わる（F-24）ので補正項を持たせる。 |
| 捕獲確率の端点: 0.29 m/s で 約 65%、0.61 m/s で 約 10%（検出距離も流速で低下、迎撃は Vmax） | 流速が速い場合の捕獲成功の下げ方の目安 | A（要約のみ）、PROXY: coho／steelhead 幼魚、水槽（C2） | **この流速範囲（29〜61 cm/s）の内側だけで使う。** 関数形は不明。ヤマメの生息流速 10〜35 cm/s の大半はこの範囲より遅い。 |
| 追った餌候補の内訳: 吐き出し 52%、視認のみ 39%、飲み込み 9%。ゴミの処理が採餌時間の 4〜25% | 「見る → 近寄る → 吐き出す」の頻度の初期値 | A、PROXY: Chinook 幼魚、野外の透明な川（C3） | 割合は流下ゴミの量で変わる。調整値にする。 |
| 群れ内の最近接の競争相手の回避距離 1.0〜2.9 体長 | 同じ流れの中の複数個体の最小間隔の初期レンジ | A、PROXY: Chinook 幼魚（C4） | **縄張りの半径ではない。** F-22 から導く半径（FL 10 cm で約 4.4 体長）は最大密度を決める広さで、別の量。 |
| 餌サイズに対する反応は山型（最大は餌径 約 0.025 体長）、0.05 体長以上は大半を拒否、捕食可能な餌の相対幅 0.06 体長 | 餌サイズ別の反応・拒否の関数の形 | B（学位論文）、PROXY: 大西洋サケ幼魚、水路（C5） | 絶対値より**形（単峰、拒否）**を採る。ヤマメの比は未確認。 |
| 成魚（優位）の近くでは、幼魚（劣位）の定位点を岸際の浅い低流速域へ移し、行動範囲と摂餌頻度を減らす | 成魚と幼魚が混在するシーンの配置規則 | A、ヤマメ直接（Ueno ら 2009、野外の実験区）（C7） | **数値は無い。** 規則として使い、減少率は調整値。 |
| 低水温で昼の活動を抑え、昼は基質の隙間に隠れ、夜に出る（定性） | 水温による昼夜切り替えの有無 | A（題名・要約）、PROXY: 大西洋サケ（C6a） | 閾値は調整値。既定のレンジを置く場合も「未検証・PROXY」と書く。 |

---

## 3. 仕様書で「採用してはいけない」値・解釈

| 採用してはいけないもの | 理由 |
|---|---|
| 定位点滞在 81%・能動採餌 14% を固定値にすること（F-02） | 出典論文を特定できず、今回も 81%／14% は結果に出なかった（C10）。C ランク。 |
| 「Springer 10.1007/s10641-008-9330-1」を Piccolo ら 2008 の流速実験の出典として引用すること | この URL の題名は "Development of net energy intake models for drift-feeding juvenile coho salmon and steelhead" で、流速の論文ではない（C2）。流速の論文は Can. J. Fish. Aquat. Sci. 65:266–275。 |
| Piccolo の端点を直線で延長し、流速 10〜29 cm/s の捕獲確率を求めること | 傾き（局所計算で 約 1.7 ポイント/(cm/s)）で 10 cm/s まで延長すると約 98% になり、実在しない精度を作る。関数形は資料に無い（C2）。範囲外は上限を決めた調整値にする。 |
| 8–12℃、6–8℃、10℃ をヤマメの昼夜切り替え温度として固定すること | 今回も数値の独立確認が取れず（C6b）、対象は大西洋サケ。ヤマメの値は無い。 |
| F-01 の 10〜35 cm/s・粒径 0.5〜5.0 cm を、焦点流速や一般の定位流速に使うこと | 焦点流速ではないと原本も注記。さらに産卵床の条件である可能性を排除できない（C9）。生息（流速の既定レンジ）に使うなら、「産卵床の可能性・未検証」と明記。 |
| 冬の「水際・流速 約 20 cm/s」を固定の定位流速にすること（F-32） | 今回も確認できず（C8）。掲載誌・著者も不明。方向（冬は水際・被覆へ寄る）だけを使い、数値は調整値。 |
| F-44 の 1.0〜2.9 体長を縄張り半径として使うこと | 群れ内の最近接回避距離であって、縄張りの広さではない（C4）。 |
| F-22 の式を FL 20 cm 超へそのまま適用して「確定値」と書くこと | 適用サイズ範囲が資料に無い（C1）。 |
| 「Hughes & Dill 1990 = サイズに基づく攻撃」という書誌 | 原本が既に訂正済み。今回、題名 "Position Choice by Drift-Feeding Salmonids: Model and Test for Arctic Grayling in Subarctic Mountain Streams, Interior Alaska"（https://cdnsciencepub.com/doi/10.1139/f90-228）が検索結果に出て、位置選択のモデル論文であることを再確認。 |
| 下の「新規リード」の数値（題名・一行要約のみのもの） | 要約に数値の根拠が無い、または一行要約のみ。 |

---

## 4. 原本（r12_foraging_en.md）への訂正・追記の提案

原本は書き換えていない。次の訂正を、統合担当が仕様書へ反映することを提案する。

1. **F-03:** 候補 URL の `https://link.springer.com/article/10.1007/s10641-008-9330-1` は NEI モデル開発の論文で、流速の論文ではない。流速の論文の書誌は Can. J. Fish. Aquat. Sci. 65: 266–275 (2008)（#2 の要約）。数値の出典は USDA Treesearch 31556 の要約のみ。
2. **F-44:** 掲載誌を追記: Can. J. Fish. Aquat. Sci.、DOI 10.1139/cjfas-2022-0112（https://cdnsciencepub.com/doi/10.1139/cjfas-2022-0112）。
3. **F-46(3):** 「0.06 体長、2.8〜20.3 cm」は Wankowski 学位論文（大西洋サケ）の記述と確認できた。「帰属不確実」を解除してよい。
4. **F-38:** Springer の URL（https://link.springer.com/article/10.1007/s10641-014-0227-x）を書誌の出典に追加できる。
5. **F-01:** 「産卵床の条件の可能性」を注記する。F-33 の季節別流速選好や、F-35 の定位流速（PROXY）とは別の量として扱う。
6. **F-17(1):** Hughes & Dill 1990 の URL を追加: https://cdnsciencepub.com/doi/10.1139/f90-228。
7. **F-31:** 日本語題名と J-STAGE の URL を追加（C7）。
8. **F-02:** 出典の候補を NZ の brown trout の 3D 映像研究に絞れる可能性がある（検索側モデルの推定。81%／14% は未確認のまま C）。

---

## 5. 新規リード（検索結果に題名・一行要約が出ただけで、中身は未確認。採用不可）

| リード | 関係する原本の項目 | 状態 |
|---|---|---|
| "Application of a bioenergetics model to estimate the influence of habitat degradation by check dams and potential recovery of masu salmon populations"（Environ. Biol. Fishes）https://link.springer.com/article/10.1007/s10641-014-0218-y | ヤマメ（masu salmon）の生体エネルギー・採餌モデル（Gap の「ヤマメの NEI パラメータ」に近い可能性） | 題名のみ。次に抄録を確認すべき。 |
| 「山地河川におけるイワナの採餌場所選択性」（魚類学雑誌 56(2):111）https://www.jstage.jst.go.jp/article/jji/56/2/56_111/_article/-char/ja/ | 日本の charr の採餌場所の水深・流速（要約は「水深 10 cm 以上、流速 60 cm/s 未満の採餌場所を利用」） | 検索側モデルの一行要約のみ（B）。「採餌場所」が焦点位置と同じ量か不明。PROXY: イワナ。数値は採用しない。 |
| 「小支流におけるイワナ，ヤマメ当歳魚の生息数，移動分散および成長」（日本水産学会誌 67(4):703）https://www.jstage.jst.go.jp/article/suisan1932/67/4/67_4_703/_article/-char/ja/ | ヤマメ当歳魚の分散・成長（Ueno ら 2009 の先行研究の可能性） | 題名のみ。 |
| "Day and night drift-feeding by juvenile salmonids at low water temperatures"（Environ. Biol. Fishes）https://link.springer.com/article/10.1007/s10641-013-0190-y | 低水温の昼夜のドリフト捕食（F-29 の閾値の検証に使える可能性） | 題名のみ。 |
| "Axes of fear for stream fish: water depth and distance to cover"（Environ. Biol. Fishes）https://link.springer.com/article/10.1007/s10641-017-0585-2 | F-41 の steelhead 水深 20 cm 以下の回避の出所の候補 | 題名のみ。対応未確認。 |
| "Velocity and dominance affect prey capture and microhabitat selection in juvenile Chinook"（Environ. Biol. Fishes）https://link.springer.com/article/10.1007/s10641-018-0723-5 | F-46(1) の「焦点流速 12 cm/s」の出所の候補（原本は帰属不確実） | 題名のみ。この論文が Chena 川かは未確認。 |
| "Combining energetic profitability and cover effects to evaluate salmonid habitat quality"（Environ. Biol. Fishes）https://link.springer.com/article/10.1007/s10641-013-0217-4 | 被覆とエネルギー利益（F-16、F-41 の接続） | 題名のみ。 |
| 「捕獲確率は定位点からの横方向の距離とともに低下」（検索側モデルの要約、NZ brown trout の 3D 映像研究への帰属） | Gap「捕獲成功 vs 距離」の定性的な手がかり | B。数値無し。帰属も推定。 |
| ヤマメ／アマゴ産卵床: 水深 10–32 cm（中央値 21.5）、流速 10.0–52.1 cm/s（中央値 14.2）。産卵場の共通条件: 水深 5–30 cm、流速 5–30 cm/s、粒径 10–30 mm | 産卵（r03 の領域）。F-01 の解釈の補助 | B（資料の特定不能）。産卵床の数値で、採餌の根拠にしない。 |

---

## 6. 検索ログ（11 回、全て mode=standard、extended 0、budget 拒否 0）

有用度: 高=独立な裏付けまたは重要な訂正が得られた／中=同一資料の再確認または部分的な情報／低=成果が薄い。

| # | 対象 | クエリ（要旨） | domain 指定 | 有用度 | 得たもの |
|---|---|---|---|---|---|
| 1 | C1 | territory size increased with fork length juvenile salmonids regression log territory size 2.61 log length 2.83 maximum density | なし | 中 | 同一 PDF が再び先頭。R²=0.87・n=23 が要約に出た。独立資料なし。クエリに 2.61／2.83 を含む。 |
| 2 | C2 | drift-feeding juvenile coho salmon steelhead capture probability declined from 65% to 10% ... 0.29 to 0.61 m/s | cdnsciencepub、pmc、springer、usgs、researchgate | 中 | **書誌 CJFAS 65:266–275**。Springer 9330-1 が別論文と判明。数値は結果に無いと返った。1 回の呼び出しで内部検索が 3 回表示された（予算の消費が 1 回を超えた可能性）。 |
| 3 | C3 | Neuswanger juvenile Chinook salmon drift-feeding ... expelled from mouth ... percent debris | なし | 高 | 52／39／9、4〜25% を数値なしのクエリで取得。USGS、EPSCoR、OUCI、解説記事。 |
| 4 | C7 | イワナ ヤマメ 成魚 幼魚 定位位置 岸際 浅く流速 分布面積 摂餌頻度 小支流 日本水産学会誌 | jstage、miyagi.kopas、cir.nii、ci.nii | 高 | J-STAGE の日本語題名・抄録。関連 2 論文の題名。 |
| 5 | C8 | サクラマス 幼魚 冬期 微生息場所 水際 被覆 流速 約20cm/s 草 粗い基質 収容力 | なし | 低 | 20 cm/s は出ず。北海道の非冬期の定性的記述のみ。 |
| 6 | C6a／C6b | Atlantic salmon parr winter daytime concealment in substratum interstices emerge at night temperature below 8 C 10 C nocturnal feeding in pools | royalsocietypublishing、wiley、cdnsciencepub、pmc、sciencedirect、springer | 中 | 定性の独立な複数資料（題名）。温度の数値は出ず。 |
| 7 | C5 | Wankowski 1979 prey size selectivity juvenile Atlantic salmon reactive distance striking distance ... | なし | 高 | 数値なしのクエリで 0.025／0.051／0.105／0.06／0.022–0.026 を取得。同一学位論文。 |
| 8 | C4 | Chinook salmon aggregation drift-feeding ... avoided immediate proximity of competitors out to 1.0 to 2.9 body lengths | scholarworks.alaska、wiley、esajournals、cdnsciencepub、researchgate、usgs、springer | 高 | CJFAS の DOI と ResearchGate。クエリに 1.0〜2.9 を含む。 |
| 9 | C9 | ヤマメ 生息 流速 10〜35 cm/s 礫 粒径 渓流 選好流速 水深 適性 指数 河川環境 | なし | 中 | 10〜35 cm/s は出ず。産卵床の数値が出て、F-01 の解釈の疑いを得た。 |
| 10 | C10 | drift-feeding trout held focal position most of the time mean 81% active foraging 14% ... two-thirds of prey captured downstream | researchgate、sciencedirect、cdnsciencepub、springer、tandfonline、wiley | 中 | 81／14 は「無い」と明言。2/3・迎撃速度の出所が NZ brown trout 3D 映像研究に見えるとの推定。 |
| 11 | C2（再試行） | coho steelhead drift feeding capture success fell from 65% at 0.29 m/s to 10% at 0.61 m/s Piccolo Hughes Bryant ... | なし | 低 | 原本と同じ USDA Treesearch の要約が返っただけ。独立資料なし。クエリに数値を含む。 |

**合計: 11 回（standard 11、extended 0）。** 本ストリームの割当 11 回を使い切った。以降の確認が必要な項目（Piccolo の第二の資料、F-32 の野登川、F-01 の出典、F-29 の温度閾値、F-02 の出典）は、予算が使えるときの優先順位としてこの順に残す。
