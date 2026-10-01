# ドリフト捕食・微小生息場所選択・縄張り・捕食者回避行動（Drift-feeding, microhabitat selection, territoriality and anti-predator behaviour）— サケ科／ヤマメ（O. masou masou 河川型）— r12（第2版: WebSearch 40 回で更新）

> 作成: ストリームR12（行動生態・英語文献担当）。**第2版（検索で更新）。** 初版は WebSearch 上限到達のため検索 0 回で書かれた。本版は WebSearch を **40 回（全て mode=standard）** 実行し、初版の Gap と重要な M 主張を裏取り・補完して上書きした。目的は、ヤマメ3Dモデルの行動（定位、ドリフト捕食、縄張り闘争、逃避、夜間・冬期の行動）を実装するための仕様根拠の収集。
>
> **この文書を使う前に必ず読むこと（調査の限界）**
> 1. **検索で読めたのは「タイトル・URL・モデルが作った要約」だけで、論文全文は一度も読めていない。** 要約に数値が書かれていないものは採用せず Gap にした。URL と記述の対応が検索結果から確認できないものは「対応未確認」と書いた。
> 2. **ヤマメ（O. masou masou）の焦点流速・焦点高・反応距離・捕獲成功関数・最大捕獲距離・逃避開始距離（FID）・警報物質反応・回復時間・夜間摂餌の実測値は、40 回の検索でも見つからなかった。** ヤマメを直接扱う資料で中身を確認できたのは、Ueno ら 2009（F-31）、北海道のサクラマス幼魚の冬期生息場所（F-32）、日本の公的資料の季節別流速選好（F-33）、環境省資料の生息流速（F-01）に限られる。残りは全て PROXY（ニジマス、coho、steelhead、brown trout、大西洋サケ、charr、グレイリング）である。
> 3. 課題に挙がった 5 論文の確認状況: **Grant & Kramer 1990 は回帰式を確認（A、F-22）。** Fausch 1984 と Hughes & Dill 1990 は書誌とモデルの骨格を確認（数値パラメータは未取得、F-16、F-17）。Nakano 1995 は書誌のみ（内容未取得、F-21）。Nakano, Fausch & Kitano 1999 は書誌と骨格を確認（対象は charr で masu salmon ではない、F-20）。Grant & Noakes 1987 は書誌のみ（F-20）。
> 4. 「私の推論」「派生」「算出」と書いた箇所は、資料に書かれた値ではない。写真由来の高さ・距離は注釈者（AI）の目視推定で、スケール校正なし。
> 5. **証拠ランク**: A=査読論文・学術書で、検索要約に数値/記述が明示／B=公的機関資料・学位論文・解説・出典の誌名が特定できない要約／C=釣り・個人サイト・出典不明の要約／M=記憶（未検証）／P=ユーザー提供写真 70 枚からの観察・集計。PROXY は適用範囲に明記。1 つの F の中に複数ランクが混ざる場合は、各行の末尾に個別に付けた。
> 6. F 番号は初版から変更していない（他文書 r16 などが F-23 などを参照しているため）。初版の F-01〜F-30 は同じ番号のまま内容を更新し、新規は F-31 以降に追加した。
> 7. **Part E（F-43〜F-49）と §3 の 15〜19、§4 末尾、§5 末尾、§6 末尾は、同一ストリームの別パス（WebSearch 34 回、全て standard）が、上記の第2版（40 回）の書き込み後に追記したもの。** 第2版の本文は変更していない。第2版と重複しない内容（Liao 2006 の結果、Chinook の個体間距離 1.0–2.9 体長と機動の型、charr の二つの採餌様式、日陰・驚愕反応、ヤマメ関連の日本語の記述など）だけを足した。このため **本ストリームの検索の合計は 40 + 34 = 74 回**（全体予算 200 回に対する消費はこの合計）。

---

## 1. 要約（仕様に直結する結論）

> 1 は全体の注意。2〜6 は定位とドリフト捕食、7〜10 は縄張りと優劣、11〜13 は捕食者回避と感覚、14〜16 は流れ・冬期・夜間、17〜18 は実装上の扱い。**数値の多くは PROXY で、ヤマメで確認できた数値はほぼ無い。**

1. **ヤマメを直接扱う中身の確認できた行動資料は少ない。** (a) 大型ヤマメ幼魚は、成魚が同居すると定位点が岸際の浅く流速の低い場所へ移り、分布面積と摂餌頻度が有意に減る（Ueno ら 2009、野外の実験区。A）[F-31]。(b) 河川型は縄張りを持つことが多い（FishBase。B）[F-10]。(c) 北海道のサクラマス幼魚は、冬は水際で流速 約 20 cm/s・水中に隠れ場所のある場所を好む（B〜A）[F-32]。それ以外の数値は全て PROXY。仕様では「近縁サケ科の暫定値」と明記し、パラメータは調整可能にする。[F-01、F-10、F-31、F-32]
2. **行動の骨格は「定位点で待機 → 流下餌を検出 → 短く迎撃 → 定位点付近へ復帰」。** Fausch (1984) の正味エネルギー獲得モデルと Hughes & Dill (1990) の NREI モデルが基礎で、**魚は「流速の低い場所で、速い流れの餌を取れる位置」を選ぶ**。位置の利益は、餌の運搬量から定位と迎撃の遊泳コストを引いて決まり、優位個体が高利益の位置を占める（検索要約で確認。式・係数は未取得）。[F-16、F-17]
3. **定位点の高さ・流速:** ヤマメの焦点高・焦点流速は未取得。PROXY として、brown trout は水柱の「下側 5 cm」にいることが多く、その場所は同じ流れの中の他の場所より乱流が弱い（Cotel ら 2006。A）。サケ科の焦点位置は「低流速域が高流速域に隣接する所」にできる（B）。写真（P）では腹縁–基質が約 0.25〜1 体高（n=5、目視）。[F-35、F-28、F-13]
4. **捕獲確率は流速で急に下がる:** coho と steelhead の幼魚（水槽）では、流速 0.29 → 0.61 m/s で捕獲確率が 65% → 10%、検出距離も低下し、迎撃は全流速で最大持続遊泳速度（Vmax）で行われた（Piccolo ら 2008。A、PROXY）。ただし UGA の学位論文群は、反応距離と流速の関係を「弱い／なし／ニジマスの劣位個体では負」とし、結果が分かれる。[F-03、F-04、F-37]
5. **時間配分と迎撃:** 定位点滞在 約 81%・能動採餌 約 14%、餌の約 2/3 は定位点より下流側で捕獲（出典未特定の要約。C）。Chinook 幼魚（Chena 川）では、追った餌のうち 52% は捕獲後すぐ吐き出し、39% は見ただけで捕獲せず、飲み込んだのは 9%（A、PROXY）。**「見る → 近寄る → 吐き出す」の拒否行動を入れる根拠になる。** [F-02、F-38]
6. **餌サイズ:** 大西洋サケでは、反応距離が最大になる餌の直径は体長の 0.025 倍で、それより大きくても小さくても短くなり、体長の 0.051 倍の餌は 90%、0.105 倍の餌は 100% が拒否された（学位論文の要約。B、PROXY）。一方、湖産ニジマスの魚食性の視覚検出では、餌が大きいほど反応距離が長い（A、PROXY）。**「大きい餌ほど遠くから反応する」と単純化しない。** [F-37]
7. **縄張りの大きさ（A に昇格）:** 幼若サケ科の種間回帰は **log10(縄張り面積 m²) = 2.61 × log10(尾叉長 cm) − 2.83、R² = 0.87、n = 23**（Grant & Kramer 1990）。式をそのまま使った算出値は、尾叉長 10 cm で約 0.60 m²、15 cm で約 1.7 m²、20 cm で約 3.7 m²。ヤマメ固有ではなく、回帰の適用サイズ範囲は未取得（25 cm 以上は外挿の可能性）。[F-22]
8. **縄張りの大きさは体長のほかに餌量と密度で変わる:** 大西洋サケでは体長と年齢で変動の 88% を説明し、餌量は追加で 2%（餌が多いほど小さい）。侵入圧・視覚的隔離・流速は有意でなかった（Keeley & Grant 1995）。高密度では縄張りが小さくなり、5 cm の魚の下限は約 0.13 m²（大西洋サケ）。[F-24]
9. **優劣:** グレイリングの池内では、最大個体が流心近くの最深部付近を占め、小さい個体ほど下流側・側方へ追いやられる（Hughes の学位論文 要約。B）。Charr では大型個体が良い焦点位置でドリフト捕食を続け、小型の劣位個体は餌が少ないと底生採餌に切り替える（Nakano ら 1999 の要約。A、PROXY）。**実装は「サイズ順に良い位置を割り当てる」「餌が乏しいと劣位個体は底を探す」で足りる。** NZ の brown trout では、実際の個体間隔が NREI モデルの予測より広かった（縄張り排他の効果。A、PROXY）。[F-17、F-20、F-21、F-31、F-40]
10. **闘争行動:** coho と cutthroat の稚魚では、追跡（chase）・咬みつき（nip）・側面誇示（lateral display）が攻撃行動全体の 80% 超（A、PROXY）。大西洋サケの小群では、最大級の 1 尾が攻撃行動の 67% を行った。攻撃は餌がある時に最も多く、3℃ では低く 5℃ で高い（種は要約が特定せず）。**頻度（回/時）・持続時間・距離の数値は未取得。** パーマークを闘争信号として動的に変える根拠は無い（イワメ–アマゴ比較。A、PROXY）。[F-11、F-23、F-39]
11. **逃避の開始距離（FID）:** 魚類全般のメタ解析で、**体サイズが大きいほど FID が長く、最も強い調整因子は群れ行動**（Samia ら 2019。A、魚類全般）。サケ科・ヤマメの FID の数値は見つからなかった。逃避の運動学は r09 の PROXY 値（潜時 5–20 ms、最小旋回半径 約 0.17–0.18 L）。[F-42、F-06]
12. **リスクと隠れ場所:** steelhead（約 120 mm FL）は、水深 20 cm 以下では、餌を極端に多く与えても給餌装置を使わなかった（A、PROXY）。大西洋サケは捕食リスクがあると採餌を減らし、基質内に隠れる時間が増え、捕食者模型の通過後は、空腹度が同じなら優位個体が先に採餌を再開した。**回復時間の分・秒の数値は未取得。** 渓流のカワセミによる捕食は、水中の隠れ場所と岸の日陰で下がる（B）。警報物質（ニジマス幼魚が同種の皮膚抽出物に反応）は書誌のみ確認、反応の中身は未取得。[F-41、F-25]
13. **走流性の感覚基盤:** 流れへの定位は、側線（水の動き）と、視覚・前庭・触覚（体が流される動き）で支えられ、**単独の感覚でも成り立つが、側線は流れの空間構造、視覚は水の透明度、前庭・触覚は流されに耐える能力に限界がある**（Coombs ら 2020 のレビュー要約。A）。ニジマスの Kármán gait では、視覚と側線の両方が働く（Liao 2006。A、PROXY）。[F-27]
14. **岩の背後・渦での定位:** ニジマスは、渦の幅が全長の 1.5 倍以上のとき一貫して渦を利用し、渦の中では波長と Strouhal 数が増え、尾びれ周波数が下がる。尾びれ周波数は体長でなく渦放出周波数に従う（Dial ら 2024。A、PROXY）。流速 50 cm/s を超えると、避難所を出て餌を取る攻撃のコストが 67% 増え、成功率が 40% 下がり、避難所の利用は得にならない（A、PROXY）。ヤマメの生息流速（10–35 cm/s）より速い範囲の実験が多い点に注意。[F-36、F-08、F-01]
15. **低水温・夜間:** 大西洋サケ幼魚は、水温が 8–12℃ を下回ると昼の活動を抑えて基質内に隠れ（6–8℃ で隠れ始めるとする記述もある）、夜に活動を移す。0℃ 未満でも採餌するが、近氷点での採餌は夜間調査でのみ記録された（A、PROXY）。夜の摂餌効率は光量 0.1 lx 未満で有意に下がる（満月・晴天でも昼の約 35%、おそらく約 10%。二次引用）。**ヤマメの閾値は未確認。** [F-29]
16. **冬期:** 越冬するサケ科は、避難所のある低流速の微小生息場所を好み、主に夜行性で、同種・他種との相互作用は少ない（レビュー要約。A）。北海道のサクラマス幼魚は、冬に水際の流速 約 20 cm/s・水中の被覆（草、粗い基質）を好み、温かい湧水支流に集まる。水温が 0℃ 近くまで下がる支流では密度が下がる（移出）。[F-30、F-32]
17. **鰭の姿勢（P）:** 水中・水槽 23 フレームのうち、背鰭が立つものが 11 枚、胸鰭は広げる 6／畳む 8／垂れる 6。一定の型は無い。口は閉が既定で摂餌時に開く。[F-15、F-07]
18. **実装方針（私の推論）:** 状態機械は「定位 → 検出 → 迎撃 → 捕獲または拒否 → 復帰」「闘争（誇示 → 追跡）」「驚愕・逃避 → 退避 → 回復」「低水温・夜間の隠れ」に分け、全ての距離・速度・頻度・閾値を `config` の調整値にし、根拠欄に「A／B／C／M／PROXY／P」を残す。**固定してよい数値は、縄張り面積の式（F-22）と、PROXY として明示した上での Piccolo ら 2008 の端点（F-03）程度。** [全体]

---

## 2. Findings

> **Part A（F-01〜F-12）:** 先行ストリーム（r01、r05、r09）が確認した記述の転載。今回の検索で補強したものは F-03、F-04、F-09 に追記した。
> **Part B（F-13〜F-15）:** 写真 70 枚のカタログからの集計 P。水中・水槽の 23 フレーム（自然水中 12、水槽 11）を使用。
> **Part C（F-16〜F-30）:** 初版では全て記憶 M だった項目。今回の検索で裏取りできた部分は [A]/[B] に更新し、裏取りできなかった部分は [M] のまま残した（各行にランクを付記）。
> **Part D（F-31〜F-42）:** 今回の検索で新たに得た項目。

---

### Part A — 先行ストリームが確認した記述（転載＋今回の補強）

### F-01 ヤマメの生息流速・河床（環境省・島根県資料）
- 主張/値: ヤマメは **流速 10〜35 cm/s、粒径 0.5〜5.0 cm の礫底**の渓流に生息する（環境省資料）。同じ結果集合でアマゴは **流速 15 cm/s・水深 10〜30 cm**、夏期最高水温 25℃以下の渓流（島根県）。
- 適用範囲: ヤマメ（河川型）、アマゴ。サイズ・季節・「生息流速」が局所流速か平均流速かは要約に無い。**焦点流速（定位点の流速）ではない可能性が高い（r09 の解釈）。**
- 出典: 環境省資料／島根県水産資料。r09 F-01（r01 F-32 から継承）の転載。今回の検索では再確認していない。
  - https://www.env.go.jp/council/09water/y0910-03/mat03.pdf
  - https://www.env.go.jp/info/iken/h180317a/a-2.pdf
  - https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html
- 証拠: [B（r09 転載）] "Yamame ... inhabits stream valleys at flow velocities of 10-35 cm/s in gravel beds with pebbles of 0.5-5.0 cm diameter"（先行ストリームが記録した要約）。
- 実装への含意（私の推論）: 流れ場の既定値の範囲を決める根拠にはなるが、定位点の流速には使えない。

### F-02 ドリフト捕食の時間配分と捕獲位置（出典未特定の要約）
- 主張/値: ドリフト捕食の魚は、水中の定位点に留まり、速い流れに短く出て流下する無脊椎動物を迎撃する。ある研究で、**魚は観察時間の平均 81% を定位点で過ごし、能動的な採餌は 14%**。**迎撃速度は期待された最大持続遊泳速度より遅く、餌の約 2/3 は定位点より下流側で捕獲された**。採餌モデルの一部は、定位点を含む平面上の 5 cm² の格子セルとして採餌体積を扱う。
- 適用範囲: ドリフト捕食のサケ科（種、サイズ、場所は要約が特定していない）。検索結果の集合には brown trout の 3D 映像研究（ニュージーランド）、juvenile Chinook salmon の 3D 映像研究、カリフォルニアの O. mykiss の研究が含まれ、記述はこれらのいずれかに由来する（r09 の推定）。**今回の検索でも出典論文は特定できなかった。ヤマメではない。**
- 出典: r09 F-41 の転載（候補。記述との対応は未確認）。
  - https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river
  - https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream
  - https://cdnsciencepub.com/doi/10.1139/cjfas-2020-0398
  - https://link.springer.com/article/10.1007/s10641-013-0187-6
- 証拠: [C（出典論文の特定不能）] "Fish held focal positions in the water column most of the time (mean = 81%), with active foraging observed for 14% of observation periods ... captured about two-thirds of their prey downstream of their focal point"（検索要約）。
- 実装への含意（私の推論）: 定位（微小な尾・鰭の動き）を既定の状態とし、迎撃は短時間にする。迎撃の向きは下流側を多数とし、上流への突進を既定にしない。出典未特定なので参考扱い。

### F-03 流速が検出距離・捕獲確率・迎撃速度に与える影響（Piccolo ら 2008。coho／steelhead 幼魚）— 今回の検索で数値を確認
- 主張/値: 水槽で juvenile coho salmon と steelhead を **流速 0.29〜0.61 m/s** で比較（3D 映像解析）。**捕獲確率は流速の増加に伴い有意に低下し、流速 0.29 → 0.61 m/s で 65% → 10%**。**餌の検出距離も流速で有意に低下**（種の効果なし、流速×種の交互作用なし）。**迎撃速度は流速にも種にも影響されず、全流速で、予測された最大持続遊泳速度（Vmax）で迎撃した。**
- 適用範囲: **PROXY: coho salmon／steelhead（降海型ニジマス）幼魚**、水槽、流速 0.29〜0.61 m/s。体長・水温・n・検出距離の絶対値は要約に無い。捕獲確率の関数形は要約に無い（端点のみ）。
- 出典: Piccolo J.J., Hughes N.F., Bryant M.D. (2008) "Water velocity influences prey detection and capture by drift-feeding juvenile coho salmon (Oncorhynchus kisutch) and steelhead (Oncorhynchus mykiss irideus)", Can. J. Fish. Aquat. Sci.（誌名は r09 の記録。巻頁は要約に無い）。検索結果の先頭が USDA Treesearch 31556 で、要約は「全文 PDF はここ」と述べた。
  - https://research.fs.usda.gov/treesearch/31556
  - https://research.fs.usda.gov/treesearch/31555 （同著者の別論文の候補）
  - https://ouci.dntb.gov.ua/en/works/405O2N5l （"Development of net energy intake models for drift-feeding juvenile coho salmon and steelhead" の書誌）
  - https://link.springer.com/article/10.1007/s10641-008-9330-1 （r09 の候補。対応未確認）
- 証拠: [A] "significant, velocity-dependent decreases in capture probability (from 65% to 10%, with an increase of velocity from 0.29 to 0.61 m·s-1) and prey detection distance ... fish intercepted prey at their predicted maximum sustainable swimming speed at all velocities"（検索要約、検索 #28）。
- 実装への含意（私の推論）: 捕獲確率の端点（0.29 m/s で 65%、0.61 m/s で 10%）を PROXY の既定値に使える。**線形と仮定した場合の算出値は約 1.7 ポイント/(cm/s)**（関数形は資料に無い）。ヤマメの生息流速 10–35 cm/s の大半は、この実験の流速範囲より遅いので外挿になる。迎撃速度を「その個体の最大持続遊泳速度」とする規則は PROXY で支持される。

### F-04 反応距離と流速（学位論文の要約。ニジマス・北極グレイリング・ブルックチャー）— 今回の検索で補強
- 主張/値: UGA の Drift Model Project の学位論文群の要約として、**(1) 北極グレイリング: 反応距離（reactive distance）は流速と弱い正の関係または無関係。捕獲成功は流速で低下し、定位流速（holding velocity）は流速で上昇。(2) ニジマス: 反応距離は劣位個体で全流速（30 cm/s を除く）で低く、流速で負の影響を受けた、とする記述と、流速は捕獲に負、反応距離にはほとんど／全く効果なしとする記述が併存。(3) ブルックチャー: 反応距離に強く一貫した効果を持つ変数は無かった。(4) 優位個体は劣位個体より多くの餌を捕獲したが、定位流速と反応距離は同程度で、サイズの差と無関係に優劣が捕獲成功に効く。**
- 適用範囲: PROXY: 北極グレイリング、ニジマス、ブルックチャー。実験室か野外かは要約が特定していない。学位論文（査読を経ない）。どの学位論文の記述か、要約が特定していない。
- 出典: UGA 学位論文（Merritt、Bozeman、Sliger の各 MS 論文と推定。対応未確認）。検索 #1、#2 で再確認。
  - https://openscholar.uga.edu/record/3703/files/MerrittKieranMS.pdf
  - https://openscholar.uga.edu/record/20894/files/bozeman_bryan_b_201708_ms.pdf
  - https://openscholar.uga.edu/record/5581/files/Ridge%20Sliger%20Thesis%20Final.pdf
- 証拠: [B] "Reactive distance displayed a weak (positive) or nonexistent relationship with velocity ... Dominant fish captured more prey than subordinate fish, but had similar holding velocities and reactive distances"（検索要約）。
- 矛盾: F-03（流速増で検出距離が低下）と食い違う（§3-1）。
- 実装への含意（私の推論）: 検出距離の流速依存は、既定を弱めにして調整値にする。優位個体の捕獲成功が高いのは、サイズでなく優劣の効果という解釈。

### F-05 日本の魚道設計における遊泳速度の一般値
- 主張/値: 日本語の検索要約に、**突進（瞬発）速度は通常体長の約 10 倍／s、巡航速度は体長の 2〜3 倍／s が一般的**、**ニジマスの巡航速度と突進速度は標準体長比でそれぞれ 4.7 と 9.3** という記述が出た。魚道設計での定義は「突進速度=瞬間的な遊泳が可能な速度、巡航速度=長時間の遊泳が可能な速度」。
- 適用範囲: 魚一般の設計値。ヤマメ・サクラマス固有の値は要約に無い。ニジマスの 4.7／9.3 は標準体長比の算出値と記される。どの文書の記述か要約が特定していない。
- 出典: r09 F-40 の転載（候補。記述との対応は未確認）。
  - https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000055vu-att/bunryu-shiryo-13.pdf
  - https://www.aomori-itc.or.jp/_files/00230483/241-244.pdf
  - https://www.aomori-itc.or.jp/_files/00229463/212-215.pdf
  - https://www.pref.nagano.lg.jp/suisan/jigyokenkyu/documents/05b.pdf
  - https://www.pref.okayama.jp/uploaded/attachment/136414.pdf
- 証拠: [B（r09 転載・出典文書の特定不能）] 「瞬発速度は通常体長の10倍程度、巡航速度は体長の2-3倍が一般的」。
- 実装への含意（私の推論）: 迎撃の上限速度と、通常遊泳の上限速度の桁の目安。体長 15 cm に当てはめると（算出）、巡航は 30–45 cm/s、突進は 150 cm/s 前後。F-03 の Vmax がこの間のどこかは不明。具体値は r08・r09 を参照。

### F-06 逃避（高速スタート）の運動学の PROXY 値（r09 の要点のみ）
- 主張/値: ニジマス（全長 9.6–38.7 cm、電気刺激）で高速スタートは L 型と S 型の 2 型。**主加速段階の継続時間は体長とともに増え、0.07 s（最小群）から 0.10 s（最大群）。最小旋回半径は全長に比例して 0.17 L。加速度は体サイズに依存しない**（Webb 1976）。ニジマス（0.32 m）の平均最大加速度は **59.7 ± 8.3 m/s²**、逃避の継続時間は最大 0.134 s（Harper & Blake 1990）。**最小潜時は 5–20 ms の桁でサイズに依存しない**（総説の要約）。活餌への攻撃中のニジマス（25.7 cm）の最小旋回半径は **0.18 L**（Webb 1983）。
- 適用範囲: **PROXY: ニジマス**、実験室。水温・n は要約に無い。刺激は電気刺激や活餌で、野外のヤマメの逃避ではない。**逃避の開始距離（人・鳥に対して）は、これらの論文の要約に無い。**
- 出典: r09 F-31、F-32、F-35、F-37 の転載。
  - Webb 1976, J. Exp. Biol. 65(1):157–177: https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance
  - Harper & Blake 1990, J. Exp. Biol. 150(1):321–342: https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo
  - Webb 1983, J. Exp. Biol. 102(1):115–122: https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two?redirectedFrom=fulltext
  - Domenici & Hale 2019, J. Exp. Biol. 222:jeb166009: https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity
- 証拠: [A（r09 転載）] "The duration of the primary acceleration stages increased with size from 0.07 s ... to 0.10 s ... overall radius of 0.17 L."／"Minimum response latencies are in the order of 5–20 ms and independent of fish size."（検索要約）
- 実装への含意: 逃避アニメの詳細は r09 を正とする。本書（行動）は「いつ・どの距離で逃避を起動するか」の側を担当する。その値は F-42 を参照（数値は無い）。

### F-07 ニジマスの胸鰭の使い方（定位・ホバリング・乱流下の制動）
- 主張/値: 胸鰭は定位、旋回、制動などの行動で使い分けられる。**低速・ホバリングでは鰭が渦を放出し、ホバリング中の胸鰭の前方運動（protraction）で主に横向きの伴流ができ、補正力を作る機能を示唆する**（Drucker & Lauder 2003）。円柱後流での定位保持では、胸鰭の行動は 2 種ある（Gibbs, Akanyeti & Liao 2024）。(1) **制動（braking）**: 鰭を体から離して持続的に張り出し、流れに逆らう。外転筋・内転筋の両方が動員された。(2) **Kármán gaiting**: 鰭の一過的な展開と収納が横方向の体の動きを制御し、展開運動の 50% 超は筋活動なしで進んだ。魚は円柱直後の吸引領域を避けた。
- 適用範囲: PROXY: ニジマス（水槽・水路）。角度・力・水温・流速・体長・n は要約に無い。
- 出典: r09 F-44、F-45 の転載。
  - Drucker & Lauder 2003, J. Exp. Biol. 206(5):813–826: https://journals.biologists.com/jeb/article-abstract/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout?redirectedFrom=fulltext ／ https://pubmed.ncbi.nlm.nih.gov/12547936
  - Gibbs, Akanyeti & Liao 2024, J. Exp. Biol. 227(5):jeb246275: https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/
- 証拠: [A（r09 転載）] "pectoral fins produce predominantly lateral wakes during fin protraction while hovering, suggesting a corrective force producing function."／"Sustained fin extensions during braking ... Transient fin extensions and retractions during Kármán gaiting controlled body movements in the cross-stream direction."
- 実装への含意（私の推論）: 定位中は両胸鰭を小さく前後に振る。岩の背後では 2 モード（持続的に張り出す／一過的に開閉）を切り替える。

### F-08 Kármán gait（障害物後流での遊泳）
- 主張/値: Kármán gait は、**体全体の大きな横振幅、長い体波長、渦放出周波数にわずかに高い程度まで低下した尾びれ周波数**で同定される（Liao 2004）。**出現確率は流速 30〜70 cm/s で最大**。尾びれ周波数は流速とともに直線的に増える渦放出周波数に一致した。**体波の速度は流速（名目値）より約 25% 速く、体波長は後流の波長より約 25% 長い。尾の振幅は自由流の約 3 倍**（Akanyeti & Liao 2013）。生きたトラウトは軸筋の活動なしで一時的に Kármán gait できる。
- 適用範囲: PROXY: ニジマス、円柱後流の水路。流速範囲・体長範囲・水温は要約に無い。**ヤマメの生息流速 10–35 cm/s（F-01）より速い範囲の実験で、そのままヤマメの渓流の定位に使えない。**
- 出典: r09 F-46、F-47 の転載。
  - Liao 2004, J. Exp. Biol. 207:3495–3506: https://pubmed.ncbi.nlm.nih.gov/15339945/
  - Akanyeti & Liao 2013, J. Exp. Biol. 216(18):3442: https://journals.biologists.com/jeb/article/216/18/3442/11608/The-effect-of-flow-speed-and-body-size-on-Karman ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/
- 証拠: [A（r09 転載）] "The highest probability of Kármán gaiting occurred at intermediate flow speeds between 30 and 70 cm s⁻¹ ... Tail-beat amplitudes ... were almost three times larger in magnitude [than freestream]."
- 実装への含意（私の推論）: 岩・流木の背後では尾の振幅を増やし周波数を下げる状態を設ける。ヤマメの流速範囲で出現するかは不明なので、既定は弱めにする。F-36 の 2024 年の結果（渦の利用条件）も参照。

### F-09 乱流・側線・視覚・定位保持に関する文献（書誌の再確認）
- 主張/値: 次の論文は **題名と書誌が確認できたが、結果の数値は取得できていない。**
  - Liao J.C. (2006) "The role of the lateral line and vision on body kinematics and hydrodynamic preference of rainbow trout in turbulent flow", J. Exp. Biol. 209(20):4077–4090（今回、巻頁 4077–4090・DOI 10.1242/jeb.02487 の書誌を検索要約で確認）。**要約の記述は「視覚と側線の両方が Kármán gait の間に能動的な役割を果たした」の 1 文のみ**（F-27 に記載）。
  - Coombs, Bak-Coleman & Montgomery (2020) "Rheotaxis revisited: a multi-behavioral and multisensory perspective on how fish orient to flow", J. Exp. Biol. 223(23):jeb223008 — 要約の中身は F-27 に記載。
  - Arnold G.P., Webb P.W., Holford B.H. (1991) "The role of the pectoral fins in station-holding of Atlantic salmon parr (Salmo salar L.)", J. Exp. Biol. 156:625–629。今回、書誌（著者・年・誌名・頁）を検索要約で確認したが、**結果（胸鰭が負の揚力を作る水中翼として働くか）は取得できていない。**
  - Webb P.W. (1989) "Station-holding by three species of benthic fishes", J. Exp. Biol. 145:303–320（初版のまま）。
  - "Inherent instability leads to high costs of hovering in near-neutrally buoyant fishes"（PMC。初版のまま）。
- 適用範囲: ニジマス、大西洋サケ parr、底生魚（PROXY）。ヤマメは未確認。
- 出典:
  - https://pubmed.ncbi.nlm.nih.gov/17023602/
  - https://journals.biologists.com/jeb/article/223/23/jeb223008/226046/Rheotaxis-revisited-a-multi-behavioral-and
  - https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding
  - https://journals.biologists.com/jeb/article-abstract/145/1/303/5622/Station-Holding-by-three-Species-of-Benthic-Fishes?redirectedFrom=fulltext
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC12280926
- 証拠: [A（書誌＋1文の記述）] "both vision and lateral line system played active roles during Kármán gaiting"（Liao 2006 についての検索要約、検索 #15）。Arnold ら 1991 は初版の記述 "The hypothesis that pectoral fins are important to station-holding in Atlantic salmon, acting as hydrofoils generating negative lift, has been commonly proposed." のまま（検索 #17 では結果の記述を得られず）。
- 実装への含意: 胸鰭が負の揚力を出すかは未確認なので、定位中の体の「下向きの力」を再現する根拠にはできない。

### F-10 FishBase の記述: 河川型は源流域に生息し縄張りを持つことが多い
- 主張/値: FishBase の O. masou の記述として「河川型は源流域に生息し縄張りを持つことが多い」。同じ項に最大 79.0 cm TL、最大公表体重 10.0 kg（種全体の極値。降海型を含む）。
- 適用範囲: O. masou 種全体の解説。縄張りの大きさ・期間・性・サイズは書かれていない。
- 出典: r01 F-23 の転載。
  - https://www.fishbase.se/summary/Oncorhynchus-masou.html ／ https://fishbase.se/summary/242
- 証拠: [B（r01 転載）] 縄張りの記述は一文のみ。数値無し。
- 実装への含意: 「ヤマメ河川型は縄張りを持つ」こと自体の定性的な根拠。縄張り面積は F-22（サケ科の種間回帰）を参照。

### F-11 体側模様（パーマーク・黒点）の縄張り維持効果はほとんど無い（イワメ–アマゴ比較）
- 主張/値: **イワメ–アマゴ比較から、体側模様（パーマーク・黒点）は中立進化で、従来指摘された隠蔽効果・縄張り維持効果はほとんど無いと考えられる。** イワメとアマゴは、体側模様以外に成長・サイズ・食性・性比・適応度などに有意差が無い。
- 適用範囲: **PROXY: アマゴ（イワメ型、三重県）**。ヤマメ河川型の機能を直接支持するものではない。ギンザケ幼魚の背景一致（crypsis）実験とは結論の方向が異なる（r05 の注）。
- 出典: KAKEN 課題 04J09581 の要約。https://kaken.nii.ac.jp/grant/KAKENHI-PROJECT-04J09581 ／ 森・名越 (1986) https://mie-u.repo.nii.ac.jp/records/5636（r05 F-41 の転載）
- 証拠: [A（r05 転載、PROXY）] 「パーマークや黒点などの体側模様は中立的な進化であり、隠蔽の効果やナワバリ維持の効果は、ほとんどないものと思われます」（要約）。
- 実装への含意（私の推論）: 縄張り闘争のときにパーマークの色や濃さを変える演出は、根拠が無いので入れない。

### F-12 優劣・攻撃性と体色などの関連（サケ科、帰属不確実）
- 主張/値: (a) 大西洋サケ幼魚の **強膜（眼の白目）の色**: 優位個体は淡い強膜色が安定し、従属個体は日ごとに変動した。(b) **早熟 parr は未熟 parr より高い社会的順位と高い攻撃性を示した**（種は要約に無し。北大リポジトリのヒットと推定されるが未確認）。(c) ニジマスや大西洋サケの皮膚メラニン斑の量はストレス応答性と関連するとされ、斑の多い個体はより攻撃的という示唆がある。ただし後の研究で、養殖ニジマスでは斑パターンと成長・競争能力に関連が無かった。**パーマークの数やコントラストと優劣を直接結ぶ資料は見つからなかった**（r05 の記録）。
- 適用範囲: PROXY: 大西洋サケ（強膜、斑）、ニジマス（斑）、種不明（早熟 parr）。斑は成魚/大型個体のメラニン斑で、パーマークとは別。
- 出典: r05 F-42 の転載（帰属不確実）。
  - Eye colour in juvenile Atlantic salmon: effects of social status, aggression and foraging success: https://katalog.lib.cas.cz/KNAV/EdsRecord/edb,8520900
  - https://ore.exeter.ac.uk/repository/handle/10036/104585?show=full
  - https://eprints.lib.hokudai.ac.jp/repo/huscap/all/21900/44(1)_P22-25.pdf （早熟 parr の候補）
  - https://orbit.dtu.dk/en/publications/emergence-time-and-skin-melanin-spot-patterns-do-not-correlate-wi/ （反例）
- 証拠: [B（r05 転載。帰属不確実）]。
- 実装への含意（私の推論）: 強膜色などの微細な社会信号は、3D モデルの再現対象としては優先度が低い。

---

### Part B — 写真 70 枚のカタログからの集計 P（初版のまま。今回の検索では変更していない）

> 使用: `docs/yamame/photo_analysis/catalog_c01〜c07.json` の `context`、`posture_behavior`、`head_mouth` 欄。70 枚の内訳は、地上 19、タモ網 13、自然水中 12、水槽 11、手 10、その他 5。**水中の定位・遊泳に使えるのは自然水中 12 枚と水槽 11 枚（計 23）。** そのうち自然水中の p011・p019・p067・p070 は釣獲後に水へ置いた／掛かった個体で、自発行動ではない。水槽は過密・ガラス面で、野外の行動の根拠にならない（r09 F-14 と同じ注意）。魚体サイズはほぼ「不明」。

### F-13 定位中の底からの高さ（自然水中）
- 主張/値: 自然水中で定位・低速遊泳と読める 5 枚の腹縁–基質の距離（目視推定）: **p026 約 0.25 体高（頭を下げて礫際）**、**p005 約 0.7 体高（約 60 px、体高の約 0.7 倍）**、**p036 体高程度（礫の岩棚の上、ホバリング様）**、**p040 約 1 体高**、**p023 の個体 B は基質上約 1 体高以内**（個体 A は暗い流木・岸際近くの上層）。水槽では p014 が底から体高 1 個分程度、p049 は腹が岩の上端に接する程度、p017 は礫の上に腹をつけて休止。
- 適用範囲: ヤマメ（種同定の確信度は写真ごとに異なる）。parr〜成魚、サイズ不明。**スケール校正なし、遠近の影響あり。流速・水深・季節は判別不能。**
- 出典: ユーザー提供写真のカタログ（`posture_behavior` 欄。p005、p023、p026、p036、p040、p014、p017、p049）。
- 証拠: [P] p005「底の礫面から魚体下縁まで約60px(体高の約0.7倍)の高さを保ち、緩い定位」。p036「体高程度の距離…静止、ホバリング様に定位」。
- 実装への含意（私の推論）: 定位時の腹縁–底の距離は「0.25〜1 体高」を初期レンジにする。n=5。**文献の焦点高（ヤマメ）は未取得。PROXY の brown trout は水柱の下側 5 cm（F-35）で、体高の定義が違うので直接比較しない。**

### F-14 向きと個体間距離
- 主張/値: **水槽・自然水中ともに、複数個体は同じ方向を向く傾向**（p014 2 尾が同方向、p015 の全個体が左向き、p041 の多くが同方向、p023 の B・C・D が全て画像左向き）。個体間距離の目視推定は、水槽 p018 で約 1/3 体長（並走）、p028 で約 0.3–0.5 体長、p029 で約 0.5–1 体長、p016 で鼻先がほぼ接触（距離ほぼ 0）。自然水中の p023 では小群 B・C・D の距離が 0.1–0.5 体長（画像上は重なる）。p019 は釣獲後の 2 尾が体の約 1/3 が重なる近さ。
- 適用範囲: **過密の水槽（p014〜p018、p027〜p029、p041、p042、p049）と釣獲後・捕獲直後の小群（p019、p023）。縄張り行動や野外の個体間距離の根拠にはならない**（r09 F-14 と同じ判断）。向きがそろうのは、流れへの定位か、同調（群れ行動の可能性）かを写真から判別できない。
- 出典: ユーザー提供写真のカタログ（p014、p015、p016、p018、p019、p023、p028、p029、p041）。
- 証拠: [P] p023「B・C・Dは小群で距離0.1-0.5体長(画像上は重なる)で、いずれも頭を画像左へ向ける(同方向を向く)。全体で緩い集合。」
- 実装への含意: 縄張り・間隔の設計には使えない（間隔は F-22、F-24、F-40 を参照）。「複数個体は上流を向いて並ぶ」という向きの揃え方の参考のみ。

### F-15 定位中の鰭と口の状態
- 主張/値: 水中・水槽の 23 フレーム（posture_behavior 記述）を私が手作業で分類した集計（主観を含む。p014 は 2 尾を別に数えるので胸鰭の合計は 24）。**背鰭: 立つ／直立 11 枚**（p005、p006、p016、p018、p023、p026、p029、p040、p042、p049、p054）、寝る／畳む 2 枚（p011、p041）、記述なし 10 枚。**胸鰭: 広げる 6**（p005、p006、p014 の A 魚、p016、p018 は軽く、p019）、**畳む・体側に沿う（半開きを含む）8**（p014 の B 魚、p027、p028、p029、p040、p041、p042、p049）、**垂れる・基質に押し付ける・触れそう 6**（p007、p011、p017、p026、p054、p067）、記述なし／見えない 4（p015、p023、p036、p070）。例: p005 は胸鰭を大きく広げて下後方へ、背鰭は立てて後傾、臀鰭は後方に流れ、腹鰭は半ば閉じる。p040 は胸鰭を畳み、腹鰭は閉、背鰭は立ち、尾鰭を広く展開。**口の状態（`head_mouth.mouth_state`、自然水中 12 枚）: 開 2 枚（p005 は頭を約 5° 上げて口を開く＝摂餌／呼吸、p019 は釣獲後でわずかに開く）、閉 9 枚（p011 は分類欄が閉だが自由記述では「わずかに開く」）、鉤掛かり 1 枚（p067）。** p007 は頭付近から同心円状の波紋が広がり、ライズ直後または水面近くの方向転換と推測される（推定）。
- 適用範囲: ヤマメ（parr〜成魚、種同定の確信度は写真ごと）。一瞬のフレームで、頻度や持続時間は分からない。定位・摂餌・呼吸の区別は付かない。
- 出典: ユーザー提供写真のカタログ（`posture_behavior`、`head_mouth` 欄）。
- 証拠: [P] p005「頭をやや上向き(約5度)にし口を開く(摂餌/呼吸)。胸鰭を大きく広げて下後方へ、背鰭は立てて後傾」。p007「同心円状の波紋…捕食(ライズ)直後または水面近くでの方向転換と推測される(推定)」。
- 実装への含意（私の推論）: 背鰭は立てた状態を既定にする。胸鰭は畳む／広げるの両方を確率的に使う。口は閉を既定にして、摂餌時に開く。

---

### Part C — 初版で記憶（M）だった項目を検索で更新（F-16〜F-30）

> 各行の末尾の [A]/[B]/[C]/[M] は、その行の根拠ランク。**M のまま残した行は、今回の検索でも裏取りできなかったもの。**

### F-16 Fausch (1984) の「採餌位置の正味エネルギー獲得」モデル
- 主張/値: 流下餌を食べる河川性サケ科の採餌位置は、**餌から得るエネルギー（その位置で魚が利用できる流下無脊椎動物のエネルギー）から、その位置を保つ遊泳コストを引いた「潜在的利益（potential profit）」＝正味エネルギー獲得**で評価される。**魚は、流速の低い場所（遊泳コストが小さい）で、近くに速い流れ（餌の運搬量が大きい）がある位置を選んで正味エネルギー獲得を最大にする。**[A、検索 #12] 人工河川での試験では、ニジマス類とサケ類の幼魚の成長率が正味エネルギー獲得に関係し、**優劣の制約の中で最適な位置が、サケ科が競う資源だった**。[B。この試験が Fausch 1984 自身のものか後続研究かは要約から確定できない] 魚が大きいほど、また優位であるほど、利益の高い位置を占めるという予測 [M]。式・係数は未取得 [M]。
- 適用範囲: 河川性サケ科（検証の対象種とサイズは要約に無い）。ヤマメは未確認。
- 出典: Fausch K.D. (1984) "Profitable stream positions for salmonids: relating specific growth rate to net energy gain", Can. J. Zool. 62:441–451（書誌は検索要約で確認）。
  - https://afs.confex.com/afs/2011/webprogram/Paper4379.html （"An Historical Perspective on Drift Foraging Models for Stream Salmonids"。記述の根拠として最有力、対応未確認）
  - https://d.lib.msu.edu/etd/44429/OBJ/download （MSU 学位論文。対応未確認）
  - https://sites.warnercnr.colostate.edu/kurtf/wp-content/uploads/sites/99/2026/01/Fausch_Complete_Publications_Webpage_1-5-26.pdf （Fausch の業績一覧）
- 証拠: [A] "fish maximize their net energy intake (NEI) by selecting focal positions in low water velocity near faster currents that deliver abundant drifting invertebrates"（検索要約）。
- 実装への含意（私の推論）: 「なぜその場所にいるか」を、**低流速の定位点＋近くの速い流れ＋隠れ場所**で説明する、シーン上の定位点の配置規則に使える。

### F-17 Hughes & Dill (1990) と Hughes のモデル系（NREI）
- 主張/値: (1) **Hughes & Dill (1990)** は、北極グレイリング（アラスカ内陸の亜寒帯山地渓流）の **定位点の選択を予測するモデルを作り、野外で検証した**（書誌・対象種・場所は検索要約で確認）[A、検索 #1]。モデルの構成（餌の流下量、反応距離、捕獲確率、迎撃と復帰の遊泳コスト）は記憶 [M]。**課題文の "Hughes & Dill 1990 size-based aggression" は書誌の混同。Hughes & Dill 1990 は位置選択のモデル論文で、サイズに基づく優劣は Hughes (1992) 以降の研究。** (2) **Hughes の学位論文（1991）とそれに基づく論文（1992a、b）**: グレイリングは位置を利益で順位付ける。**池内では最大の魚が流心の中央で最深部近くを占め、小さい魚ほど下流側・側方に位置する。大型個体は小型個体を最良の位置から排除する。**位置の競争が、流域全体と池内の分布パターンを作る。グレイリングは小さな山地渓流で利用できる最速の水を概ね選んだ。[B。学位論文の要約と、出典を特定できない引用文] (3) Hughes (1998)、Hughes & Kelly (1996)、Hughes ら (2003、brown trout の 3D 映像) は書誌のみ（初版の記憶）[M]。
- 適用範囲: PROXY: 北極グレイリング（アラスカ）、brown trout（ニュージーランド）。ヤマメは未確認。
- 出典: Hughes N.F., Dill L.M. (1990) Can. J. Fish. Aquat. Sci. 47:2039–2048。
  - https://scholarworks.alaska.edu/handle/11122/9378?show=full （Hughes の学位論文 "The behavioral ecology of Arctic grayling distribution in interior Alaskan streams"）
  - https://impact.ornl.gov/en/publications/mechanics-of-foraging-success-and-optimal-microhabitat-selection-/ （"Mechanics of foraging success and optimal microhabitat selection in Alaskan Arctic grayling"。題名のみ）
  - https://link.springer.com/article/10.1023/A%3A1016010723609 （検索 #1 の先頭に出たが、当該論文との対応は未確認）
- 証拠: [A（書誌）／B（学位論文の要約）] "Within individual pools, the largest fish holds position in the middle of the current, near the deepest part of the pool, and smaller fish hold positions progressively further downstream or to the side of the pool."（検索 #27 の要約）
- 実装への含意（私の推論）: 1 回の採餌サイクルの利益を「得た餌 − 迎撃と復帰のコスト」で数えるロジックを作れば、魚が自然に低流速かつ速い流れに近い位置を選ぶ配置になる。**サイズ順に「流心近く／最深部 → 下流側・側方」へ位置を割り当てる規則は、グレイリングで確認できた（PROXY）。** パラメータは全て調整値。

### F-18 反応距離・捕獲成功・最大捕獲距離（定性的のみ。数値は Gap）
- 主張/値: (1) **捕獲成功は流速で低下する**（F-03、F-04。A／B）。(2) **反応距離と流速の関係は文献間で食い違う**（F-03 は低下、F-04 は弱い／なし／劣位のニジマスでは負）。(3) **反応距離は餌サイズに対して単調でない場合がある**（大西洋サケ。F-37）。(4) **反応距離と魚の体長の比例関係、捕獲成功の距離依存の関数形、最大捕獲距離（cm または体長比）は、今回の検索でも見つからなかった。** 記憶（「大きい魚ほど反応距離が長い」「最大捕獲距離は最大遊泳速度と流速で決まる」）は [M] のまま。
- 適用範囲: ドリフト捕食のモデル研究一般。ヤマメは未確認。
- 出典: F-03、F-04、F-37 を参照。検索 #2（"reactive distance increased with fish length ..." の文型クエリ）では UGA の学位論文要約しか得られなかった。
- 証拠: [B（UGA 学位論文の要約）、M（体長依存・最大捕獲距離）]。
- 実装への含意（私の推論）: 検出距離 = 体長 × 係数（調整値）× 餌サイズ係数 × 流速係数、のようにパラメータ化し、係数は「根拠なし」と明記して出す。流速係数は F-03 を PROXY として使うなら「流速増で低下」、F-04 を使うなら「ほぼ無し」で、既定は弱い低下にする。

### F-19 捕獲行動（迎撃・復帰）と餌サイズ選択
- 主張/値: (1) 魚は定位点から出て餌を迎撃し、摂餌後は定位点付近へ戻る。**「魚は餌を取るために数インチ〜1 フィート（約 2.5〜30 cm）動いて、ほぼ同じ保持位置に戻る」という解説がある**[C。釣り解説サイト、または研究者の解説投稿。どちらの記述かは未確認。数値は目安]。復帰が遊泳か流れに任せるかは未確認 [M]。(2) **餌サイズ選択:** 大きい餌を選択的に食べる（Ringler 1979、Bannon & Ringler 1986 の記憶）[M]。大西洋サケでの餌サイズと反応距離・拒否の関係は F-37 [B]。(3) **捕獲の頻度（1 時間あたりの攻撃数）、迎撃距離の分布、復帰時間・復帰経路は、今回の検索（#25）でも数値が得られなかった。** (4) 拒否行動（捕獲後の吐き出し）は F-38 [A、PROXY]。
- 適用範囲: ブラウントラウト、大西洋サケ parr、ニジマスなど（PROXY）。ヤマメの摂餌頻度は未確認。
- 出典: https://bluequillangler.com/pages/how-trout-feed ／ https://www.troutnut.com/topic/9060/Some-animations-on-how-fish-react-to-prey （C。どちらが出所か未確認）。Ringler 1979、Bannon & Ringler 1986 は書誌が曖昧なので省略。
- 証拠: [C（復帰距離）、M（それ以外）]。
- 実装への含意（私の推論）: 迎撃の距離は「数 cm〜十数 cm」を初期レンジとして調整値にする（C の目安）。頻度は仮置きで、根拠なしと明記する。

### F-20 採餌モードと餌資源（Grant & Noakes 1987、Nakano ら 1998・1999）
- 主張/値: (1) **Grant & Noakes (1987)**: "Movers and stayers: foraging tactics of young-of-the-year brook charr, Salvelinus fontinalis", J. Anim. Ecol. 56:1001–1013。ブルックチャー当歳魚に、動き回る型と定位点で待つ型があるという内容（書誌は検索要約で確認。要約の題名表記は "strayers" だが、"stayers" の誤記と判断）[A（書誌）、M（内容の詳細）]。(2) **Nakano, Fausch & Kitano (1999)**: "Flexible niche partitioning via a foraging mode shift: a proposed mechanism for coexistence in stream-dwelling charrs", J. Anim. Ecol. 68（書誌は検索要約で確認）。要約: **大型個体は良い焦点位置を維持してドリフト捕食（陸生・水生無脊椎動物）を続け、小型の劣位個体はより不利な焦点位置につき、ドリフト餌が乏しいと底生採餌に切り替える。** オショロコマ（Dolly Varden）は行動と形態の適応的な変化で底生採餌に有利になる [A、PROXY]。**対象は charr で masu salmon ではない。** (3) **Nakano ら (1998)**: 北日本の森林渓流でニジマスが陸生無脊椎動物を選択的に摂食（記憶。題名・誌名は未確認）[M]。(4) 北海道の苫小牧研究林（Horonai 川）では、屋根を張って陸生昆虫の入力を減らす実験で、魚による水生の草食無脊椎動物への捕食が強まり栄養カスケードが起きた（検索要約。魚種は要約が特定していない）[B、PROXY]。
- 適用範囲: PROXY: ブルックチャー、オショロコマ、アメマス、ニジマス。ヤマメは未確認。
- 出典:
  - https://sites.warnercnr.colostate.edu/wp-content/uploads/sites/112/2020/09/Nakano-et-al.-2020-charr-ecol-character-displacement.pdf （Nakano ら 2020。上の要約文の出所と推定、対応未確認）
  - https://umimpact.umt.edu/en/publications/evaluating-a-pattern-of-ecological-character-displacement-charr-j/
  - https://link.springer.com/article/10.1023/A:1007363927379 （検索 #5 の先頭。当該論文との対応は未確認）
  - https://kaken.nii.ac.jp/en/grant/KAKENHI-PROJECT-11440224/ （(4) の出所の候補）
- 証拠: [A] "larger individuals maintain favorable focal points and typically utilize drift foraging to prey on terrestrial and aquatic invertebrates while smaller subordinate individuals take up less favorable focal points and when drift prey is scarce, shift to benthic foraging"（検索要約、#5）。
- 実装への含意（私の推論）: 個体ごとに「ドリフト捕食型／底生探索型」の傾向を持たせ、サイズが小さい個体は餌が少ない時に底の近くを探索させる、という設計ができる。ヤマメでの割合は不明。

### F-21 優劣と位置・成長・移出（Fausch & White 1981、Nakano 1995、Hughes 1992）
- 主張/値: (1) **Nakano (1995)**: "Individual differences in resource use, growth and emigration under the influence of a dominance hierarchy in fluvial red-spotted masu salmon in a natural habitat", J. Anim. Ecol. 64:75–84 — **書誌は検索要約で確認（検索 #4）。中身の要約は得られなかった。** 対象は "red-spotted masu salmon"（アマゴ系統の呼称。**ヤマメ O. masou masou ではない**）。結論の骨格「優位な個体ほど良い採餌位置を占めて成長が良く、劣位は移出しやすい」は記憶 [M]。(2) **Fausch & White (1981)**: ミシガン州の河川でブルックトラウトとブラウントラウトの競争を扱う（記憶。[M]）。(3) Hughes (1992): F-17 の通り [B]。(4) 同類の関連論文: "Predation risk and resource abundance mediate foraging behaviour and intraspecific resource partitioning among consumers in dominance hierarchies"（bioRxiv。題名のみ）。
- 適用範囲: PROXY: アマゴ（Nakano 1995）、ブルックトラウト、ブラウントラウト、北極グレイリング。
- 出典:
  - https://www.biorxiv.org/content/10.1101/364182.full.pdf
  - https://eprints.lib.hokudai.ac.jp/repo/huscap/all/91784/Ryo_Futamura.pdf （マスサケの研究の学位論文。Nakano 1995 の引用文脈。題名のみ）
- 証拠: [A（Nakano 1995 の書誌のみ）、M（結論）]。
- 実装への含意（私の推論）: 個体サイズに応じた「位置の序列」を、シーン上の位置に割り当てる設計ができる（F-17 の規則）。劣位個体が下流や縁へ移る演出の根拠は F-31（Ueno ら 2009、ヤマメ）の方が直接的。

### F-22 縄張り面積と体長の関係（Grant & Kramer 1990）— A に昇格
- 主張/値: Grant & Kramer (1990) は、幼若サケ科の **縄張り面積（m²）と尾叉長（cm）の種間回帰** を示した。**log10(縄張り面積, m²) = 2.61 × log10(尾叉長, cm) − 2.83、R² = 0.87、n = 23**。浅い生息場所（瀬、raceway）では、同一年級群の密度の推移が最大密度の回帰にほぼ沿い、縄張り面積が個体群密度の上限を決めるという仮説を強く支持した。この式をそのまま使った **算出値（私の計算。式が正しいと仮定した場合）**:

  | 尾叉長 (cm) | 縄張り面積 (m²) | 円相当半径 (m) | 一辺（正方形相当）(m) |
  |---|---|---|---|
  | 5 | 0.10 | 0.18 | 0.31 |
  | 8 | 0.34 | 0.33 | 0.58 |
  | 10 | 0.60 | 0.44 | 0.78 |
  | 12 | 0.97 | 0.56 | 0.99 |
  | 15 | 1.7 | 0.74 | 1.3 |
  | 20 | 3.7 | 1.1 | 1.9 |
  | 25 | 6.6 | 1.4 | 2.6 |
  | 30 | 11 | 1.8 | 3.3 |

- 適用範囲: 幼若サケ科の種間回帰（n = 23 の単位は要約に無い）。**PROXY: ヤマメ固有ではない。** 回帰の適用サイズ範囲は要約に無い（体長 20 cm 以上は外挿の可能性が高い）。縄張り面積は餌量と密度で変わる（F-24）。尾叉長 FL で、全長ではない。
- 出典: Grant J.W.A., Kramer D.L. (1990) "Territory size as a predictor of the upper limit to population density of juvenile salmonids in streams", Can. J. Fish. Aquat. Sci. 47:1724–1737。McGill 大学。
  - https://sitesreservoirproject.riptideweb.com/references/REF23/Volume%202/App11M_Yolo_Sutter_Bypass_Weir_Spill_Analysis/Grant%20and%20Kramer_1990_Territory%20Size.pdf
- 証拠: [A] "interspecific regression of territory size (m²) on fork length (cm): log₁₀ territory size = 2.61 log₁₀ length − 2.83, with an R² of 0.87 and n = 23"（検索要約、検索 #3）。表の数値は式からの算出（A に基づく派生）。
- 実装への含意（私の推論）: 縄張り間の最小間隔（隣の個体の定位点の距離）の上限的な目安として、体長 10 cm で一辺 約 0.8 m、半径 約 0.4 m の桁。**これは「最大密度」を決める縄張りの広さで、実際の間隔はこれより広いことがある（F-40）。** ヤマメの成魚（20–30 cm）に外挿する場合は、調整値として扱う。

### F-23 闘争行動の型（Kalleberg 1958、Keenleyside & Yamamoto 1962）
- 主張/値: 幼若サケ科の縄張り闘争は、(i) **正面誇示（frontal display）**、(ii) **側面誇示（lateral display）**: 体側を見せ、背鰭・胸鰭などを立てる、(iii) **突進（charge）と追跡（chase）**、(iv) **咬みつき（nip）**、(v) 並んで旋回する **circling** といった型からなる。段階的に激しくなり、多くは誇示や短い追跡で終わる（記憶）[M]。**部分的な裏取り:** coho と cutthroat の稚魚では、追跡・咬みつき・側面誇示が攻撃行動全体の 80% 超（F-39）[A、PROXY]。**頻度（回/時）、持続時間、追跡の距離は、今回の検索（#19）でも数値が得られなかった。**
- 適用範囲: PROXY: 大西洋サケ、coho、cutthroat、サケ科幼魚。ヤマメ（O. masou masou）の闘争の型の記載は、確認できない。
- 出典: Kalleberg 1958（Rep. Inst. Freshw. Res. Drottningholm 39:55–98）、Keenleyside & Yamamoto 1962（Behaviour 19:139–169）は書誌が記憶のみ。F-39 を参照。
- 証拠: [M（型の分類）、A（80% 超。F-39）]。写真 70 枚（P）に闘争の場面は確認できない（F-14）。
- 実装への含意（私の推論）: 闘争は「接近 → 側面誇示（鰭を立てる）→ 突進・追跡 → 離脱」の 4 段階程度の状態にし、持続時間は短く仮置きにする。

### F-24 縄張り面積の調整因子（Keeley & Grant 1995 ほか）— A に昇格。初版の記憶（視覚的隔離）は裏付けられず
- 主張/値: (1) **大西洋サケ幼魚（幅広い河川条件・体サイズ）**: 縄張り面積の変動の **88% が体サイズと年齢で説明され**、体サイズとともに増えた。**餌量は縄張り面積と逆相関する唯一の有意な環境相関因子だが、追加で説明する割合は 2%**。**侵入圧、視覚的隔離、流速は縄張り面積と有意に関係しなかった**（Keeley & Grant 1995）。(2) **steelhead（ブリティッシュコロンビアの河川）**: 体サイズを統制すると、縄張り面積は流下無脊椎動物の量と逆相関し、局所の魚密度（侵入圧）とも逆相関（Keeley の野外研究。要約の記述）。(3) **大西洋サケ当歳魚の密度操作**: 密度の増加で縄張りは小さくなり、5 cm の魚の漸近的な最小面積は約 **0.13 m²**。(4) 関連論文の題名: "Effect of food abundance on aggressiveness and territory size of juvenile rainbow trout"、"Territorial and foraging behaviour of juvenile Mediterranean trout under changing conditions of food and competitors"（題名のみ）。
- 適用範囲: PROXY: 大西洋サケ（1、3）、steelhead（2）。ヤマメは未確認。
- 出典:
  - https://agris.fao.org/search/ar/records/65df79cb7c7033e84bedc24a （"Allometric and environmental correlates of territory size in juvenile Atlantic salmon (Salmo salar)"）
  - https://openpolar.no/Record/crwiley:10.1111%2Feff.12120 （"Density-dependent territory size and individual growth rate in juvenile Atlantic salmon"）
  - https://open.library.ubc.ca/cIRcle/collections/831/items/1.0088809 （Keeley の学位論文の候補。対応未確認）
  - https://czaw.org/?p=2323 （ニジマス。題名のみ）
  - https://docta.ucm.es/entities/publication/5c8096e2-27e6-40a7-9bfd-909c3bbd05b2 （題名のみ）
- 証拠: [A] "88% of the variation in territory size was explained by differences in body size and age ... food explained an additional 2% ... intruder pressure, visual isolation, and current velocity were not significantly related to territory size"（検索要約、#36）。
- 矛盾: 初版の記憶（Imre、Grant & Keeley の「視覚的に隔離されると縄張りが小さくなる」）は、今回の検索で裏付けられなかった。Keeley & Grant 1995 では視覚的隔離は有意でなかった（§3-9）。
- 実装への含意（私の推論）: 縄張り面積は体長で決め、餌量と密度による調整は小さい補正項にする。「岩・倒木の多い所で間隔を詰める」根拠は、現時点では無い（M として撤回）。

### F-25 捕食者回避: 警報物質、凍結・隠れ、採餌の抑制
- 主張/値: (1) 書誌: **Brown & Smith (1997) "Conspecific skin extracts elicit antipredator responses in juvenile rainbow trout (Oncorhynchus mykiss)", Can. J. Zool. 75:1916–1922**（検索要約で確認 [A（書誌）]）。**反応の中身（採餌の抑制、凍結、隠れ場所への退避など）は、検索結果に出ず、記憶のまま** [M]。(2) 大西洋サケは、捕食リスクのもとで採餌を減らし、基質内に隠れる時間が増える（F-41）[A、PROXY]。(3) 魚が経験から捕食者を学習し警戒する（Kelley & Magurran 2003 の総説など。記憶）[M]。(4) **ヤマメ（O. masou masou）の警報物質反応の記載は、検索（#11）でも確認できない。**
- 適用範囲: PROXY: ニジマス、大西洋サケ。
- 出典: 書誌（Brown & Smith 1997）の URL は、検索結果に当該論文のページが出なかったため付けない。関連: https://pherobase.com/literature/data/details/S/3276 （警報フェロモンの文献一覧の候補。対応未確認）
- 証拠: [A（書誌のみ）、M（反応の中身）]。
- 実装への含意（私の推論）: 警戒状態（動きを止める／低い位置で定位／隠れ場所へ移動）と、そこからの回復を状態機械に持たせる。化学的な警報はシーン内に捕食者が現れるイベントで代用できる。回復時間は調整値（F-41）。

### F-26 影・頭上の刺激、人への反応、回復時間（数値 Gap）
- 主張/値: 渓流のサケ科は、頭上を通過する影や急な動きに反応して逃避し、隠れ場所に入る [M。一般知識]。**サケ科・ヤマメに特化した FID、影への反応の潜時、回復時間の数値は、検索（#9、#10、#37、#39）でも見つからなかった。** 魚類全般の FID と体サイズの関係、steelhead の水深回避、大西洋サケの採餌再開は F-41、F-42 に記載。日本語の資料は「ヤマメは警戒心が強い」という定性的記述のみ（C）。
- 適用範囲: サケ科一般。ヤマメの FID・回復時間は未確認。
- 出典: https://www.pref.nagano.lg.jp/suisan/joho/sakanatachi/yamame.html ／ https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol35.html （検索 #37 の結果。「警戒心が強い」の記述の出所の候補。対応未確認。C〜B）
- 証拠: [M（一般知識）、C（警戒心が強いという記述）]。
- 実装への含意（私の推論）: 逃避起動の条件は、「距離の閾値（調整値）」「頭上の影の通過」「急な動き」の OR にして、距離は **絶対距離（m）** で設定でき、魚の体サイズに応じて増える（F-42）ようにしておく。回復時間は、数秒〜数分の幅で調整値にする（根拠なし）。

### F-27 流れへの定位（走流性、rheotaxis）の感覚基盤 — A に昇格
- 主張/値: (1) **Coombs, Bak-Coleman & Montgomery (2020) のレビュー要約**: 走流性に使える感覚情報は、**側線への水の動きの手がかり**と、**魚が下流に流された時の体の動きの手がかり（視覚、前庭、触覚）**。**走流性は単一の感覚でも成り立つが、各感覚に限界がある: 側線は流れの空間的特性に、視覚は水の透明度に、前庭などの体の動きの手がかりは魚が下流への変位に耐える能力に制限される。**[A] (2) **Liao (2006)**: ニジマスの乱流中の Kármán gait で **視覚と側線の両方が能動的な役割を果たした**[A、PROXY、F-09]。(3) 関連論文の題名: 盲目の洞窟魚で、側線が非一様流中の走流性に必要（J. Exp. Biol. 218(10):1603）、"Sedentary behavior as a factor in determining lateral line contributions to rheotaxis"（J. Exp. Biol. 217(13):2338）、"The spatiotemporal dynamics of rheotactic behavior depends on flow speed and available sensory information"（J. Exp. Biol. 216(21):4011）、"Atlantic salmon kelt rheotaxis and position choice are influenced by flow velocity and turbulence in a regulated river"（PMC。題名のみ）。(4) 古典 Arnold (1974) "Rheotropism in fishes", Biol. Rev. 49:515–576 は書誌が記憶 [M]。
- 適用範囲: 魚一般（PROXY: 洞窟魚、ニジマス）。ヤマメ固有の記載は無い。視覚と側線の寄与の割合（％）は要約に無い。
- 出典:
  - https://journals.biologists.com/jeb/article/223/23/jeb223008/226046/Rheotaxis-revisited-a-multi-behavioral-and
  - https://journals.biologists.com/jeb/article/218/10/1603/770/The-lateral-line-is-necessary-for-blind-cavefish
  - https://journals.biologists.com/jeb/article/217/13/2338/12236/Sedentary-behavior-as-a-factor-in-determining
  - https://journals.biologists.com/jeb/article/216/21/4011/11677/The-spatiotemporal-dynamics-of-rheotactic-behavior
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC13357317/
  - https://pubmed.ncbi.nlm.nih.gov/17023602/ （Liao 2006）
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC2442850/ （"A review of fish swimming mechanics and behaviour in altered flows"。題名のみ）
- 証拠: [A] "sensory information available for rheotaxis includes water-motion cues to the lateral line and body-motion cues to visual, vestibular or tactile senses when fish are swept downstream ... each sense has its own limitations"（検索要約、#14）。
- 実装への含意（私の推論）: 定位は「上流を向く」を既定にし、暗い場面でも向きを保つ（側線等の寄与）。流れが弱い所や無い所（水槽）では向きがばらつく。水が濁って視界が悪い場面では、向きの保持を弱めて下流へ流される量を増やす、という調整の理由になる。

### F-28 定位のエネルギー、岩の背後の退避、乱流の選好
- 主張/値: (1) 流れで定位する魚の遊泳コストは **対水速度** で決まり、定位点の流速が低いほど安い（Fausch 1984 の前提、F-16）[A]。(2) **Cotel, Webb & Tritico (2006) "Do brown trout choose locations with reduced turbulence?", Trans. Am. Fish. Soc. 135(3):610–619**: ブラウントラウトの物理的な生息条件（隠れ場所、水深、流速）は、強い乱流を生む高剪断域と関連している。**ブラウントラウトは通常、水柱の下側 5 cm にいる（剪断力で乱流が強い層）。ブラウントラウトの占有位置の乱流強度は、トラウトのいない同様の位置より低いが、平均的な渓流の典型値より高い。**[A、PROXY] (3) 岩・倒木・くぼみの背後や側方の低流速の退避所で定位し、近くの速い流れから餌を取る典型（Hayes & Jowett 1994 などの生息場所選択研究の記憶）[M]。(4) 避難所の利用の得失は F-36。
- 適用範囲: PROXY: ブラウントラウト、ニジマス。ヤマメは未確認。
- 出典: https://deepblue.lib.umich.edu/items/898a1be5-9a78-4df4-93e9-b981b351851b ／ https://scholarworks.umass.edu/entities/publication/4d1fa9b7-584f-4b54-8beb-78af6154c88c （Cotel ら 2006 の記録ページ。(2) の出所の候補）
- 証拠: [A] "Brown trout were usually found in the lower 5 cm of the stream where shear forces result in high turbulence, and locations occupied by brown trout had lower turbulence intensity than similar locations without brown trout but higher turbulence intensity than is typical of an average stream"（検索要約、#35）。
- 実装への含意（私の推論）: 定位点の選択は、F-16 の規則（低流速＋近くの速い流れ＋隠れ場所）に、「同じ流れの中では乱流が弱めの場所」という項を足す。ただし乱流が全くない場所ではなく、平均より強い層（河床近く）にいる。岩の背後では F-07、F-08、F-36 の挙動を使う。

### F-29 昼夜の切り替えと夜間の行動（Fraser ら 1993 ほか）— 部分的に A
- 主張/値: (1) **Fraser, Metcalfe & Thorpe (1993) "Temperature-dependent switch between diurnal and nocturnal foraging in salmon", Proc. R. Soc. Lond. B 252:135–139**（書誌確認）。検索要約: **秋から初冬に水温が下がると、淵にすむ大西洋サケとブラウントラウトの幼魚の活動が顕著に低下し、主に昼行性から夜行性の活動パターンに切り替わった。0℃ 未満でも活発に採餌したが、近氷点での採餌は夜間調査でのみ記録された。**[A。ただしこの要約が Fraser ら 1993 自身の結果か、同じ結果集合の別論文かは URL との対応が未確認] (2) **温度閾値:** 大西洋サケ幼魚は、水温が **8–12℃ を下回る** と昼の活動を抑制し、河床の避難所に隠れる。**6–8℃** で隠れ行動が始まるという記述もある。冬は昼に基質の隙間で隠れ、夜は基質上または基質の近くの流れの遅い場所で定位する[A、PROXY。複数論文の要約。初版の「約 10℃」の記憶は、この 8–12℃ の幅の中に入る]。(3) **Fraser & Metcalfe (1997)** "The costs of becoming nocturnal: feeding efficiency in relation to light intensity in juvenile Atlantic salmon", Funct. Ecol. 11:385–391（書誌確認）。二次引用の要約: **光量 0.1 lx 未満で摂餌効率が有意に低下する。晴天の満月でも昼の効率の約 35%、おそらく約 10%。**[A、二次引用]。関連題名: "Effects of light level and growth history on attack distances of visually foraging juvenile salmon in experimental tanks"（題名のみ）。(4) **ヤマメで夜間に摂餌する頻度や、昼夜の切り替えの温度は、検索（#34）でも確認できない。**
- 適用範囲: PROXY: 大西洋サケ parr、ブラウントラウト（欧州の河川）。ヤマメ（O. masou masou）は未確認。
- 出典:
  - https://link.springer.com/article/10.1023/A:1007691316864 ／ https://eprints.gla.ac.uk/71319 ／ https://theses.gla.ac.uk/75895/ ／ https://theses.gla.ac.uk/75895/1/13818631.pdf （昼夜・水温・光の学位論文。記述の出所の候補）
  - https://www.bio.ulaval.ca/labdodson/Papers%20Julian/Johnston%20et%20al%202004.pdf （Johnston ら 2004。閾値 8–12℃ の記述の候補）
  - https://www.kmae-journal.org/10.1051/kmae/2011083/pdf ／ https://link.springer.com/article/10.1023/A:1021372822784 （Fraser & Metcalfe 1997 の二次引用の候補）
  - https://acnpsearch.tweb-dev.unibo.it/singlejournalindex/9762145 （攻撃距離と光量の題名）
- 証拠: [A] "Juvenile Atlantic salmon suppress their daytime activity when water temperature drops below a threshold of 8–12°C, then conceal themselves within streambed refuges"（検索要約、#34。複数ページの統合要約）。"feeding efficiency of salmonids is significantly reduced at light intensities lower than 0.1lx (Fraser and Metcalfe, 1997)"（#29）。
- 実装への含意（私の推論）: 昼夜の行動を、水温（と光量）をパラメータにして切り替える設計ができる。ヤマメの閾値は不明なので、PROXY の 8–12℃ を既定の幅にして調整値にする。夜間のシーンは、動きを減らし、隠れ場所の近くで低く定位させ、迎撃の距離と成功率を下げる（光量依存）程度にする。

### F-30 冬期・低水温の行動（隠れ場所への集合）— 部分的に A
- 主張/値: (1) **越冬するサケ科は、避難所のある低流速の微小生息場所を好み、主に夜行性で、同種・他種との相互作用は比較的少ない**（越冬生態のレビュー "Life in the ice lane: the winter ecology of stream salmonids" の要約）[A、PROXY]。(2) 氷の被覆は鳥や哺乳類からの頭上の隠れ場所になり、警戒と昼間の隠れる必要を減らして摂餌量を増やす、という記述も検索結果にあった（出所のページは特定できず）[B]。(3) **Cunjak (1996)** "Winter habitat of selected stream fishes and potential impacts from land-use activity", Can. J. Fish. Aquat. Sci. 53(Suppl. 1):267–282（書誌確認）。内容の要約は得られなかった。(4) 北海道のサクラマス幼魚の冬期生息場所は F-32。(5) ニジマスの冬の隠れ場所から夜に出現する割合が光量に依存したという研究（Contor & Griffith 1995）は書誌が記憶のみ [M]。
- 適用範囲: PROXY: 大西洋サケ、ニジマス、ブラウントラウトなど（北米・欧州）。ヤマメの冬期の行動は F-32（北海道のサクラマス）を参照。
- 出典:
  - https://wicri-demo.istex.fr/Wicri/Eau/explor/LotaV3/Site/fr/Main/Exploration/bibRecord.php?hk=000769 （"Life in the ice lane" の書誌）
  - https://informahealthcare.com/doi/ref/10.1577/M03-196.1 （検索 #23 の結果。内容は未確認）
- 証拠: [A（レビューの要約）] "overwintering salmonids generally prefer sheltered, low velocity microhabitats, are mainly nocturnal, and interact relatively little with conspecifics or interspecifics"（検索要約、#23）。
- 実装への含意（私の推論）: 低水温シーンでは、定位点を隠れ場所（礫の隙間、淵、水際の被覆）へ寄せ、迎撃の頻度を下げ、動きを遅くし、個体間の闘争を減らす。数値は調整値。

---

### Part D — 今回の検索で新たに得た項目（F-31〜F-42）

### F-31 ヤマメ幼魚の定位点は、成魚の存在で岸際の浅く流速の低い場所へ移る（Ueno ら 2009）— ヤマメの直接資料
- 主張/値: 日本の山地渓流の小支流（地域は要約に無い）の野外実験区で、幼魚（小型のイワナ類［white-spotted charr、Salvelinus leucomaenis］、大型のイワナ類、大型の**ヤマメ Oncorhynchus masou masou**）を放し、**幼魚のみ／幼魚＋成魚のイワナ類／幼魚＋成魚ヤマメ** の 3 処理で、焦点位置、移動の追跡による分布面積、摂餌頻度を記録した。**成魚がいると、幼魚の焦点位置は岸際に移り、そこは有意に浅く、流速が低かった。さらに、1 尾あたりの分布面積と摂餌頻度は有意に減った。** 幼魚のみの条件では、焦点位置と分布面積は実験区全体に広がった。
- 適用範囲: ヤマメ（大型幼魚）とアメマス（小型・大型幼魚）。日本の山地渓流の小支流、野外の実験区。焦点流速・水深の絶対値、体長、n、季節は要約に無い。
- 出典: Ueno T., Tanaka Y., Maruyama T. (2009) "Effects of adult white-spotted charr Salvelinus leucomaenis and masu salmon Oncorhynchus masou masou on focal points, distribution area and foraging frequency of both juveniles in a small tributary of a Japanese mountain stream", Nippon Suisan Gakkaishi 75(5):802–809。
  - https://www.miyagi.kopas.co.jp/JSFS/jsfs-english/E-PUB/75-5/p0802.html
- 証拠: [A] "In the presence of adult fishes, the focal points of juveniles shifted to near-shore margins which were significantly shallower and lower in water velocity. Moreover, the size of distribution area per fish and feeding frequency were decreased significantly."（検索要約、#8）
- 実装への含意（私の推論）: **成魚（優位個体）の近くでは、幼魚（劣位個体）の定位点を岸際の浅い低流速域に移し、行動範囲と摂餌頻度を減らす**という規則を直接使える。成魚と幼魚の混在シーンの配置の根拠になる。

### F-32 北海道のサクラマス幼魚の冬期生息場所（水際・流速 約 20 cm/s・被覆、湧水支流）
- 主張/値: (1) **野登川（Nobori River、北海道）の微小生息場所研究:** サクラマス幼魚は冬に **水際（channel margin）で流速 約 20 cm/s、水中の被覆がある場所を好んだ**。草の被覆は収容力が極めて高く、粗い基質の被覆は大型の幼魚の冬の生息場所になった。[A または B。掲載誌・著者は検索結果に出ず] (2) **湧水支流:** サクラマス幼魚は冬に湧水支流に特に集まる。**湧水支流は温かく流速が遅く、越冬場所として魅力的。** 北海道の 2 つの支流の比較で、冬の水温が比較的高い小支流ではサケ個体数が移入で増加し、水温が 0℃ 近くまで下がる中規模支流では移出で密度が低下した。[A]
- 適用範囲: サクラマス（O. masou masou）幼魚（ヤマメ河川型と同種）、北海道。体長・水深・n は要約に無い。「約 20 cm/s」は冬の水際の微小生息場所の流速で、F-01 の生息流速（10–35 cm/s）の範囲内。
- 出典:
  - https://scite.ai/reports/r9Ld6V ／ https://www.iahr.org/library/info?pid=19421 （野登川。(1) の出所の候補）
  - https://complete.bioone.org/journals/ichthyology-and-herpetology/volume-111/issue-1/i2022050/Ecosystem-Functions-of-a-Spring-Fed-Tributary-in-Providing-Foraging/10.1643/i2022050.full ／ https://asih.kglmeridian.com/view/journals/cope/111/1/article-p44.xml ／ https://link.springer.com/article/10.1007/s10228-010-0201-3 ／ https://sfs-2026.m.asnevents.com.au/schedule/session/27998/abstract/134757 （湧水支流・北海道の支流。(2) の出所の候補）
- 証拠: [A/B] "Juvenile masu salmon preferred a channel margin habitat type with a moderate current (about 20 cm/s) and submerged cover during winter"（検索要約、#22）。"Juvenile masu salmon were especially aggregated in spring-fed tributaries in winter compared to other seasons."（#21）
- 実装への含意（私の推論）: 冬のシーンでは、定位点を水際の低流速域（約 20 cm/s 前後）と被覆（草、粗い基質）の近くへ寄せる。**冬の「水際・被覆」の記述は、夏の「流れの速い本流側の定位」（F-33）と反対方向の変化なので、季節で定位位置の既定を切り替える。**

### F-33 ヤマメ・アマゴの季節別の流速選好（日本の公的資料・釣り解説）
- 主張/値: 日本語資料の要約: **春と秋の低水温期は流れの緩い場所を好み、夏の高水温・渇水期は強い流れ（酸素が豊富で餌が流れてくる主流の近く）を好む**。初夏にかけて水温が上がると、本流の近くを選ぶ。上流側の落ち込みでできる深い淵は、餌場と隠れ場所になる。産卵期は 9〜10 月。
- 適用範囲: ヤマメ・アマゴ（日本）。流速・水深・サイズの数値は要約に無い。公的資料（神奈川県、島根県）と釣り解説（Honda、Shimano）の統合要約で、どの記述がどの資料のものかは未確認。
- 出典:
  - https://www.pref.kanagawa.jp/documents/95322/5112suigi08.pdf ／ https://www.pref.kanagawa.jp/documents/87850/yamaokudeinochiwotunaguyamame.pdf ／ https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html （B）
  - https://www.honda.co.jp/fishing/enjoy/season/season-201704/step-2/ ／ https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol34.html （C）
- 証拠: [B（公的資料）／C（釣り解説）] 「春秋の低水温期は緩い流れ、夏の高水温・渇水期は強い流れを好む」（検索要約、#20）。
- 実装への含意（私の推論）: 水温の上昇に応じて、定位点を「緩い流れ → 主流の近く」に移す季節規則の根拠（定性）。数値は無い。

### F-34 台湾産陸封サクラマス（O. masou formosanus）の稚魚〜幼魚の微小生息場所（PROXY）
- 主張/値: 要約: **孵化直後の稚魚は、ほぼ流れの無い、水中の被覆が豊富な場所を広く使った。体長 5〜9 cm の魚の 50% 超が、流れが中程度（0.1〜0.86 m/s）で被覆の少ない深い水に移った。** 別の要約: **高流速は下流への移動を促し上流への移動を減らす。大型の稚魚は上流へ移動するか産卵場に留まり、小型より多く摂餌した**（サクラマス稚魚の分散の研究。対応未確認）。
- 適用範囲: **PROXY: O. masou formosanus（台湾の陸封型）**。サイズ範囲は 5〜9 cm。流速範囲の「0.1〜0.86 m/s」は利用された流速の幅で、選好値ではない。
- 出典: https://zoolstud.sinica.edu.tw/Journals/37.4/269.html ／ https://zoolstud.sinica.edu.tw/issue.php?id=1798 ／ https://agris.fao.org/search/fr/records/647242bb53aa8c896303bf5d （"Ecological studies on the dispersal of newly emerged masu salmon fry, Oncorhynchus masou"。対応未確認）
- 証拠: [B] "Newly emerged fry extensively used habitats with nearly no current velocity and abundant instream cover. More than 50% of the salmon from 5 to 9 cm moved into deeper water having moderate current (0.1 to 0.86 m/sec) and less instream cover."（検索要約、#6）
- 実装への含意（私の推論）: 稚魚は低流速・被覆の多い場所、成長すると水深のある中程度の流れに出る、というサイズ依存の規則（定性）。

### F-35 サケ科の焦点位置の特徴（低流速域が高流速域に隣接、乱流が弱い、サイズ・季節依存）— 数値は PROXY の定性
- 主張/値: 検索要約（出典が複数のページにまたがり、対応未確認）: (1) **サケ科の焦点位置は、低流速域が高流速域に隣接する所にできる。** (2) **幼魚のニジマスの焦点位置は、平均流速の幅広い範囲で、乱流が弱いことで特徴づけられた。** (3) **当歳のブラウントラウトは、活動ごとに異なる物理特性の焦点位置を使い、成長すると流れの速い、より深い場所に移った（水中観察、育成河川）。** (4) **ユタ州 Green 川のニジマス: 33 cm を超える魚は焦点流速が低い位置を見つけ、33 cm 以下の魚は夏に冬よりずっと速い焦点流速の位置を使った。** (5) F-28 の Cotel ら 2006: ブラウントラウトは水柱の下側 5 cm。**ヤマメの焦点流速（cm/s）・焦点高（cm）の数値は見つからなかった。**
- 適用範囲: PROXY: ニジマス、ブラウントラウト（北米、ニュージーランド）。サイズ・水温・季節は一部のみ要約にある。
- 出典（候補。どの記述の出所かは未確認）:
  - https://arc.lib.montana.edu/robert-behnke/objects/2491-23-08.pdf
  - https://mro.massey.ac.nz/handle/10179/12603 ／ https://mro.massey.ac.nz/items/70010e8f-3dfd-45db-a681-12d71a481092
  - https://informahealthcare.com/doi/abs/10.1577/T04-069.1
  - https://digitalcommons.usu.edu/etd/6433
  - https://scholarworks.umass.edu/entities/publication/5b10cfd5-9212-41db-8508-895892013092
- 証拠: [B] "Salmonid focal positions occur in low-velocity areas adjacent to high-velocity ones."／"rainbow trout larger than 33 cm find positions with low focal velocities, while fish less than 33 cm use positions with much higher focal velocities during summer compared to winter"（検索要約、#24）。
- 実装への含意（私の推論）: 定位点は「低流速のポケットが速い流れの縁にある所」。大型個体ほど低流速側、小型個体は速い流れ側、という傾向は F-17（グレイリング）と方向が異なるため、サイズ依存の符号は固定せず調整値にする（§3-5）。

### F-36 岩・渦の避難所の利用と、避難所を出て餌を取る攻撃のコスト（ニジマス）
- 主張/値: (1) **Dial, Collins, Liao & Tobalske (2024)** J. Exp. Biol. 227(15): ニジマスは、**渦の直径（幅）が全長の 1.5 倍以上のとき一貫して流れの避難所（渦）を利用**した。全サイズ群で、**渦の中では自由流に比べて波長と Strouhal 数が増加し、尾びれ周波数が低下し、渦の中での遊泳に必要な出力が小さいことを示唆**した。**尾びれ周波数は体長ではなく渦の放出周波数に従った。**試行の 17% では、せん断層からエネルギーを得ていると示唆される遊泳をした。(2) **ドリフト捕食するニジマスの酸素消費（Whitney 研究所）:** 高流速域では**避難所の利用はエネルギー的に得にならない。流速 50 cm/s を超えると、避難所から餌を攻撃するコストが 67% 増え、攻撃の成功率が 40% 低下して、純損失になる。** (3) 関連題名: "Refuging rainbow trout selectively exploit flows behind tandem cylinders"（J. Exp. Biol. 219(14):2182）、"Swimming smarter, not harder: fishes exploit habitat heterogeneity to increase locomotor performance"（J. Exp. Biol. 228 Suppl. 1）、"Swimming kinematics of rainbow trout behind a 3×5 cylinder array"（J. Exp. Biol. 227(23)）。
- 適用範囲: **PROXY: ニジマス**（水路）。体長・水温・流速の範囲は要約に無い（(2) は 50 cm/s 超の高流速）。**ヤマメの生息流速 10–35 cm/s（F-01）より速い範囲の実験**で、そのままは使えない。
- 出典:
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC11418164/ ／ https://journals.biologists.com/jeb/article/227/15/jeb247829/361512/Body-length-determines-flow-refuging-for-rainbow
  - https://sicb.org/?p=16388 ／ https://www.biorxiv.org/content/10.1101/2019.12.26.889055.full.pdf
  - https://journals.biologists.com/jeb/article/219/14/2182/15396/Refuging-rainbow-trout-selectively-exploit-flows
  - https://journals.biologists.com/jeb/article/228/Suppl_1/JEB247918/365643/Swimming-smarter-not-harder-fishes-exploit-habitat
- 証拠: [A] "Rainbow trout take advantage of flow refuges when vortex diameter exceeds fish total length by 1.5 times"；"At flow velocities >50 cm/s, refuging causes a net energetic loss due to a 67% increase in the cost of attacking prey and a 40% reduction in attack success rate."（検索要約、#16、#33）
- 実装への含意（私の推論）: 岩の背後（渦が体長の 1.5 倍以上の幅）では、尾びれ周波数を下げ、体の波長を長くする。流速が遅い（ヤマメの生息流速）場合は、避難所を出て餌を取る攻撃のコストが小さい側になるはずで、避難所の近くを定位点にする既定は妥当（私の推論）。

### F-37 反応距離・餌サイズ・拒否（大西洋サケ、ニジマス）と、優劣・体サイズの効果
- 主張/値: (1) **大西洋サケ幼魚（Wankowski の学位論文、1977）:** 反応距離は **餌の直径が体長の 0.025 倍のとき最大**、ストライク距離（striking distance）は餌の直径が体長の 0.025〜0.051 倍で最大。**どちらも、それより大きい餌・小さい餌で短くなった。** 直径が体長の 0.025 倍以下の餌は 100% が摂食され、**0.051 倍の餌の 90%、0.105 倍の餌の 100% が拒否された。** 水路（recirculating flume）でドリフト物を主に食べた。(2) **湖産ニジマス（魚食性の視覚検出。光、濁り、餌サイズの影響）:** 反応距離は餌が大きいほど長い。(3) UGA の学位論文群（F-04）: 大型の優位個体は、小型の劣位個体より捕獲成功が高い。捕獲成功は流速と負に関係。
- 適用範囲: PROXY: 大西洋サケ幼魚（水路）、湖産ニジマス（魚食性、ドリフト捕食ではない）。ヤマメは未確認。体長・水温・流速は要約に無い。
- 出典:
  - https://www.storre.stir.ac.uk/bitstream/1893/35136/1/Wankowski-thesis-1977.pdf ／ https://storre.stir.ac.uk/handle/1893/35136
  - https://ouci.dntb.gov.ua/works/27PYVMx4 （"Visual Prey Detection Responses of Piscivorous Trout and Salmon: Effects of Light, Turbidity, and Prey Size"）
- 証拠: [B（学位論文）／A（ニジマスの視覚検出論文の題名と要約）] "reaction distance was maximal on prey whose diameter was 0.025 fish length, and striking distance was maximal on prey of 0.025 to 0.051 fish length, with both decreasing on larger and smaller prey"（検索要約、#38）。
- 実装への含意（私の推論）: 餌サイズ（体長比）に対する反応のしやすさは「小さすぎず大きすぎない餌で最大」の山型にし、大きすぎる餌（体長の 約 5〜10%）は近づいても拒否する。山型の中心（体長の 約 2.5%）は大西洋サケの値で、ヤマメで未確認。

### F-38 餌とゴミの識別・拒否行動（Chinook 幼魚、Chena 川）
- 主張/値: 高精細ビデオによる野外観察（アラスカの透明な Chena 川）で、ドリフト捕食する juvenile Chinook salmon が追った全ての食物候補のうち、**52% は捕獲後すぐに口から吐き出され、39% は視覚的に確認しただけで捕獲されず、飲み込まれたのは 9%**。ゴミの処理にかける時間は、採餌試行率とともに直線的に増え、採餌時間全体の **4〜25%** を占めた。採餌試行率は摂食率と中程度にしか相関しなかった（Kendall の τ = 0.55）。
- 適用範囲: **PROXY: Chinook salmon 幼魚**、野外（透明な川）。体長・水温・流速・n は要約に無い。
- 出典: Environmental Biology of Fishes 97(5):489–503 (2014) "Mechanisms of drift-feeding behavior in juvenile Chinook salmon and the role of inedible debris in a clear-water Alaskan stream"。
  - https://pubs.usgs.gov/publication/70060527
  - https://catalog.epscor.alaska.edu/dataset/mechanisms-of-drift-feeding-behavior-in-juvenile-chinook-salmon-and-the-role-of-inedible-debris-in-a
  - https://afs.confex.com/afs/2011/webprogram/Paper4378.html （"The Effect of Drifting Debris on Drift-Feeding Fish and Foraging Models"。題名のみ）
- 証拠: [A] "52% were captured and quickly expelled from the mouth, 39% were visually inspected but not captured, and only 9% were ingested"（検索要約、#32）。
- 実装への含意（私の推論）: 流下物の多くは餌でなく、魚は「見る → 近寄る → 取る → 吐き出す」を高頻度で行う。迎撃の動作は、餌の候補の約半数で口を開閉して吐き出すアニメ、4 割で近寄って見るだけ、という割合の目安に使える（PROXY）。

### F-39 攻撃行動の構成・偏り・水温依存（coho、cutthroat、大西洋サケ）
- 主張/値: (1) **coho と cutthroat の稚魚:** 追跡（chase）、咬みつき（nip）、側面誇示（lateral display）が攻撃行動全体の **80% 超**。coho は非接触の行動を、cutthroat は咬みつきをより多く使う。咬みつきの大半は優位個体が行い、劣位個体の全行動は優位個体の存在に影響される。(2) **大西洋サケ幼魚（餌が限られる条件、攻撃行動を 1 日 3 時間記録）:** 全てのグループで開始時に、**通常は比較的大型の 1 尾が攻撃行動の大半（全体で 67%）を行った。** (3) **水温と餌（種は要約が特定していない）:** どちらのサケ科も **餌がある時に最も攻撃的**。**3℃ では攻撃性が低く、どちらの種も瀬を防衛しない。5℃ では攻撃性が高まり、両種とも摂餌中に瀬を防衛する。** 攻撃の頻度は、同所・異所の両方で摂餌成功と正の相関。
- 適用範囲: PROXY: coho、cutthroat（稚魚）、大西洋サケ（幼魚）、種不明の 2 種（水温）。頻度（回/時）の数値、距離、持続時間は要約に無い。
- 出典（候補。どの記述の出所かは未確認）:
  - https://www.sfu.ca/biology/faculty/dill/publications/f85-213.pdf ／ https://summit.sfu.ca/_flysystem/fedora/sfu_migrate/6415/b16649217.pdf
  - https://www.stir.ac.uk/research/hub/publication/750147 （"Alternative competitive strategies and the cost of food acquisition in juvenile Atlantic salmon (Salmo salar)"）
  - https://ideas.repec.org/a/oup/beheco/v14y2003i1p127-134.html ／ https://orca.cardiff.ac.uk/id/eprint/62625/ ／ https://repositorio.ispa.pt/bitstreams/86fe2bdb-f026-4f8f-8817-c15f78af7032/download
- 証拠: [A] "Coho and cutthroat trout fry use chases, nips and lateral displays comprising more than 80% of their total aggressive activity"；"one (usually relatively large) fish performed most (67% overall) of the aggressive acts"；"at 3°C, aggression is low and neither species defends riffles; at 5°C, aggression is higher"（検索要約、#19）。
- 実装への含意（私の推論）: 闘争は少数の優位個体が起こす。行動の種類は追跡・咬みつき・側面誇示の 3 つで大半。水温が低い（3℃ 前後）と闘争は減る。数値（頻度）は調整値。

### F-40 野外の個体間隔は NREI モデルの予測より広い（NZ の brown trout）
- 主張/値: ニュージーランドの河川の 80 m × 20 m の淵で、River2D と流下量・採餌モデルを組み合わせた予測では、**淵に brown trout が 6〜7 尾入ると予測されたが、観察は 5 尾**。魚の分布は NREI が最大の谷筋（thalweg）に沿うと正しく予測されたが、**採餌による餌の枯渇を補正すると、予測された採餌位置は観察された位置より間隔が狭かった。** 別の研究では、in situ のステレオ映像から、縄張りを持つ brown trout と縄張りを持たない roundhead galaxiid の幼魚の 3 次元位置と摂餌イベントを抽出した。
- 適用範囲: **PROXY: brown trout**（ニュージーランド）。個体間隔の絶対値（m、体長比）は要約に無い。
- 出典: Ecological Modelling 207(2):171–188 (2007)（著者は検索結果に出ず）。
  - https://ideas.repec.org/a/eee/ecomod/v207y2007i2p171-188.html
  - https://ourarchive.otago.ac.nz/esploro/outputs/journalArticle/Quantification-and-comparison-of-individual-space-use/9926516484401891
  - https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river （F-02 と同じ）
- 証拠: [A] "when adjusted for depletion by feeding fish the predicted drift-feeding locations were more closely spaced than observed fish locations"（検索要約、#18）。
- 実装への含意（私の推論）: 個体の間隔は、餌条件だけで決めた配置より広くする（縄張りの排他）。間隔の絶対値は F-22 の縄張り面積から導く上限的な目安に、さらに余裕を持たせる、という扱い。

### F-41 捕食リスク・水深・被覆・採餌再開（steelhead、大西洋サケ、鳥類）
- 主張/値: (1) **steelhead（約 120 mm FL）:** 水深が浅いほど「諦める時の収穫率（giving-up harvest rate）」が急に上がり、**水深 20 cm 以下では、極端に高い餌供給率を提示しても給餌装置を使わなかった**（水深と被覆までの距離を変えた野外の実験。出所のページは特定できず）。(2) **大西洋サケ:** 短期の行動実験で、捕食リスクのもとで採餌と活動が強く影響され、**採餌を減らし、基質内に隠れる時間が増える。** ドリフト餌の提示に続いて空中の捕食者模型を提示し、どの魚が採餌を再開するかを記録した実験では、**空腹度が同じなら優位個体が先に採餌を再開し、空腹度が違えば社会的順位に関係なく空腹な個体が再開した。**（再開までの時間の数値は要約に無い。）(3) **鳥類:** 渓流のトラウトでは、水中の被覆と岸の植生の日陰が、カワセミ（Belted Kingfisher）などによる捕食の影響を減らして生存率を上げる [B]。(4) 被覆は、成長（餌）と生存のトレードオフの中で使われる（Grand & Dill 1997 の coho の研究: 被覆はあるが餌が少ない区画と、餌は多いが被覆の無い区画の分布）[A、題名と設計のみ]。
- 適用範囲: PROXY: steelhead（約 120 mm FL）、大西洋サケ幼魚、coho、トラウト一般。ヤマメは未確認。
- 出典:
  - https://research.fs.usda.gov/treesearch/54224 ／ https://research.fs.usda.gov/treesearch/49962 ／ https://pubs.usgs.gov/publication/70256605 （"A review of factors affecting the susceptibility of juvenile salmonids to avian predation"）
  - https://www.sfu.ca/biology/faculty/dill/publications/grandanddill1997.pdf （Grand & Dill 1997, Behav. Ecol.）
  - https://www.sfu.ca/biology/faculty/dill/publications/j.1439-0310.1995.tb01095.x.pdf ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC5089841 ／ https://www.birdresearchnw.org/98Rpt.pdf
- 証拠: [A] "Juvenile steelhead about 120 mm fork length exhibited sharp increases in giving-up harvest rate with decreasing water depth and refused to use the feeding device even when offered extreme food delivery rates in water ≤20 cm deep"；"when both fish were at equal hunger levels, the dominant fish was more likely to resume foraging first"（検索要約、#10、#39）。
- 実装への含意（私の推論）: 定位点の選択に「水深が浅すぎる所（20 cm 以下）を避ける」「被覆までの距離が短い所を好む」規則を入れる（PROXY の steelhead 約 12 cm）。捕食者の通過後は、まず隠れる／動きを止め、その後に優位個体から採餌を再開する、という順序。再開までの時間は調整値。

### F-42 逃避開始距離（FID）は体サイズとともに長くなる（魚類全般のメタ解析）
- 主張/値: 魚類の FID（捕食者が接近した時に逃げ始める距離）のメタ解析で、**魚の体サイズは FID と強く正の相関を示し、この体サイズ–FID 関係の分散を説明する最も重要な調整因子は群れ行動（shoaling）だった。群れの大きさと FID の間に有意な関係は検出されなかった。** 人の存在の増加は、リスクの知覚の変化を通して魚の逃避の判断を変える。**サケ科・ヤマメの FID（m）の数値は、今回の検索（#9、#37）でも見つからなかった。** 関連: 導入されたニジマスとブラウントラウトがいる河川で、ダーター類（Etheostoma）の警戒心をスノーケリングで測った研究（FID）— トラウトの FID ではない。
- 適用範囲: 魚類全般（メタ解析。種ごとの値は要約に無い）。サケ科の渓流魚に特化した数値は無い。
- 出典: Samia ら 2019, Fish and Fisheries（題名は検索結果に出ず、ファイル名から）。
  - https://blumsteinlab.eeb.ucla.edu/wp-content/uploads/sites/104/2019/09/Samia_etal_2019_FishFisheries.pdf
  - https://link.springer.com/article/10.1007/s10750-021-04561-6 （ダーター類の研究の候補。対応未確認）
- 証拠: [A] "Individual fish size was strongly and positively correlated with FID and the most important moderator that explained the variance in the individual body size-FID relationship was shoaling behavior."（検索要約、#9）
- 実装への含意（私の推論）: 逃避を起動する距離は、体サイズが大きい個体ほど長くする（絶対距離 m の調整値＋体サイズ係数）。群れる個体では係数を変える。数値は根拠なし。

---

## 3. 資料間の矛盾・不一致

1. **反応距離と流速:** Piccolo ら 2008（coho／steelhead 幼魚、0.29–0.61 m/s、水槽）は、流速の増加で検出距離が低下し、捕獲確率が 65% → 10%。UGA の学位論文群は、グレイリングで反応距離と流速の関係は弱い正または無し、ニジマスで劣位個体は流速で負（または影響ほぼ無し）、ブルックチャーで一貫した効果は無し。→ **種、実験条件（水槽か野外か）、流速範囲、測定法の違いで未解決。ヤマメは未確認。** [F-03、F-04、F-18、F-37]
2. **反応距離と餌サイズ:** 湖産ニジマスの魚食性の視覚検出では、餌が大きいほど反応距離が長い。大西洋サケのドリフト捕食（Wankowski の学位論文）では、餌の直径が体長の 0.025 倍で最大、それより大きくても小さくても短い。→ 餌の種類（魚食か無脊椎動物か）、サイズ範囲の違いの可能性。「大きい餌ほど遠くから反応する」と単純化しない。[F-37]
3. **迎撃速度:** Piccolo ら 2008 は、全流速で最大持続遊泳速度 Vmax で迎撃。出典未特定の要約（F-02）は、期待される最大持続遊泳速度より遅く迎撃。→ 種、野外と水槽の違いの可能性。[F-02、F-03]
4. **迎撃の向き:** 初版の記憶は「上流側・側方・上下へ迎撃」。出典未特定の要約は、餌の約 2/3 を定位点より下流側で捕獲。→ **下流側が多数**の方を採用し、記憶の方は弱める。ヤマメでの割合は未確認。[F-02、F-19]
5. **サイズと焦点流速の向き:** グレイリングでは最大個体が流心近くの最良の位置を占め、小型個体は下流側・側方へ追われる（F-17）。ユタ州のニジマスでは 33 cm 超の大型魚の焦点流速が低く、33 cm 以下の魚は夏に速い焦点流速を使う（F-35）。→ **サイズと焦点流速の符号が資料間で逆**に見える（種、季節、水量の違い）。ヤマメの符号は未確認。調整値として符号を固定しない。[F-17、F-35]
6. **生息流速と焦点流速と実験流速:** 環境省資料のヤマメの生息流速 10–35 cm/s は、生息域の記述。焦点流速（定位点の流速）は一般にそれより低いと考えられる（私の推論）が、確認できる数値が無い。Kármán gait の出現流速（30–70 cm/s）、避難所が得にならない流速（50 cm/s 超）、Piccolo ら 2008 の実験流速（29–61 cm/s）は、いずれもこの生息流速より速い範囲。→ **流速の値は用途ごとに別の量なので、混同しない。** [F-01、F-03、F-08、F-36]
7. **パーマークの縄張り機能:** イワメ–アマゴ比較は縄張り維持効果をほとんど無しとする（A、PROXY）。一方、サケ科の他の体色要素（強膜色、メラニン斑）は優劣や攻撃性と関連した報告がある（帰属不確実）。→ 体色全般が無関係とは言えないが、**パーマークの動的変化を闘争信号として実装する根拠は無い。** [F-11、F-12]
8. **Nakano の論文の対象種:** 課題文は Nakano 1995 と Nakano, Fausch & Kitano 1999 を masu salmon の論文として挙げている。検索で、1995 年は "red-spotted masu salmon"（アマゴ系統）の論文であること、1999 年は charr（Dolly Varden とアメマス系）の論文であることが、題名・要約から確認できた。いずれもヤマメ（O. masou masou）ではない。→ ヤマメには PROXY として扱う。ヤマメを直接扱う優劣と定位の資料は Ueno ら 2009（F-31）。[F-20、F-21、F-31]
9. **視覚的隔離と縄張り面積:** 初版の記憶（Imre、Grant & Keeley: 視覚的に隔離されると縄張りが小さくなる）は、今回の検索では確認できなかった。Keeley & Grant 1995（大西洋サケ）では、視覚的隔離・侵入圧・流速は縄張り面積と有意に関係しなかった。→ 記憶の方を撤回し、体サイズと餌量を主因とする。ただし、steelhead では局所の魚密度（侵入圧）と逆相関。[F-24]
10. **Hughes & Dill 1990 の主題:** 課題文は "size-based aggression" と書くが、検索で Hughes & Dill 1990 は位置選択のモデルと検証の論文であることを確認。サイズに基づく優劣と位置の順位は Hughes (1992) 以降（学位論文 1991 を含む）。→ 課題文の書誌の混同。[F-17]
11. **夜行性への切り替えの水温:** 初版の記憶（約 10℃）に対し、検索要約は「8–12℃ 未満で昼の活動を抑制」「6–8℃ で隠れ行動が始まる」と幅がある。→ 研究・集団・指標の違い。ヤマメでの値は未確認。[F-29]
12. **冬の位置:** 北海道のサクラマス幼魚は冬に水際・流速 約 20 cm/s・被覆を好む（F-32）。大西洋サケは冬に昼は基質の隙間に隠れ、夜は基質上の遅い流れに出る（F-29）。→ 矛盾ではなく、被覆の種類（草、粗い基質、基質の隙間）と観察法の違い。ヤマメの冬の行動は両方の成分をサイズ別に持つ可能性（私の推論）。[F-29、F-32]
13. **避難所の得失:** ニジマスは渦の幅が体長の 1.5 倍以上で避難所を使い、遊泳出力が下がる（F-36 (1)）。一方、流速 50 cm/s 超で餌を取る場合は避難所から出る攻撃のコストが増えて得にならない（F-36 (2)）。→ 定位保持のコストと摂餌のコストの違い。流速範囲の違い。[F-36]
14. **攻撃性の水温依存と低水温での採餌:** 3℃ では攻撃性が低い（F-39）。一方、0℃ 未満でも夜間に採餌する個体がいる（F-29）。→ 攻撃（縄張り防衛）と採餌は別の量。低温では闘争が減り、夜の採餌は続く。[F-29、F-39]

---

## 4. 見つからなかったこと（Gaps）— 3D モデル／アニメ／行動実装に必要だが確認できなかった事項

> **WebSearch 40 回（全て standard）で、以下は見つからなかった。** 「存在しない」ではなく「検索要約からは確認できなかった」。要約に数値が無いものは採用していない。

1. **課題 1（焦点流速・深さ・底上高・NREI パラメータ）:**
   - ヤマメ（O. masou masou）の **焦点流速（cm/s）、焦点の水深、底からの高さ（cm または体高比）** の実測値。PROXY も、Cotel ら 2006 の「下側 5 cm」とサイズ別の定性的記述（F-35）以外は無い。
   - **反応距離 vs 魚の体長** の回帰式、**捕獲成功率 vs 距離** の関数、**最大捕獲距離**（cm、または体長比）。Piccolo ら 2008 の捕獲確率の端点（F-03）と、大西洋サケの餌サイズ比（F-37）のみ。
   - Fausch 1984、Hughes & Dill 1990、Grant & Noakes 1987、Nakano 1995 の **本文・抄録の内容**（Fausch 1984 と Hughes & Dill 1990 は骨格のみ、Grant & Noakes と Nakano 1995 は書誌のみ）。
2. **課題 2（捕獲の動作）:**
   - ヤマメの Vmax（最大持続遊泳速度）。迎撃中の遊泳速度の PROXY は「Vmax で迎撃」（F-03）のみ。
   - 定位点への復帰時間・経路。1 時間あたりの攻撃数。餌サイズ選択の数値（餌長 vs 魚体長。大西洋サケの体長比のみ、F-37）。昼夜の摂餌量の違い、夜間摂餌の割合。
   - 口の開閉の時間（開口時間、吸引の速度）。これは r07（頭部・口）の担当。
3. **課題 3（縄張り・優劣・闘争）:**
   - **ヤマメ固有の縄張り面積**（体長別、季節別）。F-22 は種間回帰（PROXY）。回帰の適用サイズ範囲。
   - 闘争行動の頻度（回/時）、持続時間、追跡距離、誇示の姿勢（鰭の角度）。
   - 野外での個体間の距離（最近接個体の距離。NZ の brown trout で「予測より広い」とだけ、F-40）。
   - Nakano 1995 の結果（ヤマメではなくアマゴ）。日本語資料（ヤマメ・アマゴの縄張り、サクラマス幼魚の縄張り）— 検索 #7 では見つからなかった。
4. **課題 4（捕食者回避）:**
   - 人・鳥への **逃避開始距離（FID）の数値**（サケ科・ヤマメ）、影・頭上刺激への反応の潜時、逃避の距離、隠れ場所までの距離。
   - 警報物質の反応の中身（ヤマメ・サクラマス。ニジマスの書誌のみ）。**捕食者通過後に採餌を再開するまでの時間（秒・分）**。
   - 捕食者の種類別（サギ類、カワセミ、カワウ、ミンク、人）の反応。
5. **課題 5（定位）:**
   - 走流性の視覚と側線の寄与の割合（％）。Liao 2006 の結果の数値。Arnold ら 1991 の結果（胸鰭が負の揚力を作るか）。
   - 定位保持のエネルギー（酸素消費、尾の振動の振幅・周波数）の数値。低流速（10–35 cm/s）での尾の動き。ヤマメの岩の背後での定位の実測。
6. **課題 6（冬期・低水温・夜間）:**
   - **ヤマメの夜間行動、昼夜の切り替えの水温**（PROXY は大西洋サケの 8–12℃）。低水温での遊泳速度・反応の遅れ（逃避の潜時、迎撃速度の水温依存）。
   - 野登川（北海道）の冬期生息場所の論文の著者・誌名（F-32 (1)）。
7. **その他:**
   - 検索結果のうち未確認の候補: ESJ（日本生態学会）の 65 回大会 H02-01 の要旨（検索 #10、#39 で出たが内容は確認していない）。Fraser ら 1993 の要約が、同論文自身のものか別論文のものか。Piccolo ら 2008 の URL 31555 と 31556 のどちらがどの論文か（31556 が速度の論文と推定）。
   - 季節による行動の変化（産卵期の雄の闘争、スモルト化期の降下行動）は、本書の範囲外。r03（生活史・性）との接続が必要。

---

## 5. 出典一覧（URL 付き。重複排除。検索結果に出た URL のみ）

**ヤマメ・サクラマス（直接）**
- 環境省（ヤマメの生息流速）: https://www.env.go.jp/council/09water/y0910-03/mat03.pdf ／ https://www.env.go.jp/info/iken/h180317a/a-2.pdf （F-01）
- 島根県: https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html （F-01、F-33）
- Ueno ら 2009: https://www.miyagi.kopas.co.jp/JSFS/jsfs-english/E-PUB/75-5/p0802.html （F-31）
- 野登川・湧水支流: https://scite.ai/reports/r9Ld6V ／ https://www.iahr.org/library/info?pid=19421 ／ https://complete.bioone.org/journals/ichthyology-and-herpetology/volume-111/issue-1/i2022050/Ecosystem-Functions-of-a-Spring-Fed-Tributary-in-Providing-Foraging/10.1643/i2022050.full ／ https://asih.kglmeridian.com/view/journals/cope/111/1/article-p44.xml ／ https://link.springer.com/article/10.1007/s10228-010-0201-3 ／ https://sfs-2026.m.asnevents.com.au/schedule/session/27998/abstract/134757 （F-32）
- 神奈川県・長野県・釣り解説: https://www.pref.kanagawa.jp/documents/95322/5112suigi08.pdf ／ https://www.pref.kanagawa.jp/documents/87850/yamaokudeinochiwotunaguyamame.pdf ／ https://www.honda.co.jp/fishing/enjoy/season/season-201704/step-2/ ／ https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol34.html ／ https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol35.html ／ https://www.pref.nagano.lg.jp/suisan/joho/sakanatachi/yamame.html （F-26、F-33）
- 台湾産陸封サクラマス: https://zoolstud.sinica.edu.tw/Journals/37.4/269.html ／ https://zoolstud.sinica.edu.tw/issue.php?id=1798 ／ https://agris.fao.org/search/fr/records/647242bb53aa8c896303bf5d （F-34）
- FishBase（O. masou）: https://www.fishbase.se/summary/Oncorhynchus-masou.html ／ https://fishbase.se/summary/242 （F-10）
- イワメ–アマゴ（体側模様）: https://kaken.nii.ac.jp/grant/KAKENHI-PROJECT-04J09581 ／ https://mie-u.repo.nii.ac.jp/records/5636 （F-11）
- 魚道設計の遊泳速度: https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000055vu-att/bunryu-shiryo-13.pdf ／ https://www.aomori-itc.or.jp/_files/00230483/241-244.pdf ／ https://www.aomori-itc.or.jp/_files/00229463/212-215.pdf ／ https://www.pref.nagano.lg.jp/suisan/jigyokenkyu/documents/05b.pdf ／ https://www.pref.okayama.jp/uploaded/attachment/136414.pdf （F-05）

**ドリフト捕食・NREI・焦点位置**
- Fausch 1984 関連: https://afs.confex.com/afs/2011/webprogram/Paper4379.html ／ https://d.lib.msu.edu/etd/44429/OBJ/download ／ https://sites.warnercnr.colostate.edu/kurtf/wp-content/uploads/sites/99/2026/01/Fausch_Complete_Publications_Webpage_1-5-26.pdf （F-16）
- Hughes・グレイリング: https://scholarworks.alaska.edu/handle/11122/9378?show=full ／ https://impact.ornl.gov/en/publications/mechanics-of-foraging-success-and-optimal-microhabitat-selection-/ ／ https://link.springer.com/article/10.1023/A%3A1016010723609 （F-17）
- Piccolo ら 2008: https://research.fs.usda.gov/treesearch/31556 ／ https://research.fs.usda.gov/treesearch/31555 ／ https://ouci.dntb.gov.ua/en/works/405O2N5l ／ https://link.springer.com/article/10.1007/s10641-008-9330-1 （F-03）
- UGA 学位論文: https://openscholar.uga.edu/record/3703/files/MerrittKieranMS.pdf ／ https://openscholar.uga.edu/record/20894/files/bozeman_bryan_b_201708_ms.pdf ／ https://openscholar.uga.edu/record/5581/files/Ridge%20Sliger%20Thesis%20Final.pdf （F-04）
- ドリフト捕食の時間配分（出典未特定の要約の候補）: https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river ／ https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream ／ https://cdnsciencepub.com/doi/10.1139/cjfas-2020-0398 ／ https://link.springer.com/article/10.1007/s10641-013-0187-6 （F-02）
- NZ の brown trout: https://ideas.repec.org/a/eee/ecomod/v207y2007i2p171-188.html ／ https://ourarchive.otago.ac.nz/esploro/outputs/journalArticle/Quantification-and-comparison-of-individual-space-use/9926516484401891 （F-40）
- Chinook: https://pubs.usgs.gov/publication/70060527 ／ https://catalog.epscor.alaska.edu/dataset/mechanisms-of-drift-feeding-behavior-in-juvenile-chinook-salmon-and-the-role-of-inedible-debris-in-a ／ https://afs.confex.com/afs/2011/webprogram/Paper4378.html （F-38）
- 大西洋サケの餌サイズ: https://www.storre.stir.ac.uk/bitstream/1893/35136/1/Wankowski-thesis-1977.pdf ／ https://storre.stir.ac.uk/handle/1893/35136 ／ https://ouci.dntb.gov.ua/works/27PYVMx4 （F-37）
- 焦点位置の特徴: https://arc.lib.montana.edu/robert-behnke/objects/2491-23-08.pdf ／ https://mro.massey.ac.nz/handle/10179/12603 ／ https://mro.massey.ac.nz/items/70010e8f-3dfd-45db-a681-12d71a481092 ／ https://informahealthcare.com/doi/abs/10.1577/T04-069.1 ／ https://digitalcommons.usu.edu/etd/6433 ／ https://scholarworks.umass.edu/entities/publication/5b10cfd5-9212-41db-8508-895892013092 （F-35）
- Cotel ら 2006: https://deepblue.lib.umich.edu/items/898a1be5-9a78-4df4-93e9-b981b351851b ／ https://scholarworks.umass.edu/entities/publication/4d1fa9b7-584f-4b54-8beb-78af6154c88c （F-28）
- 採餌モード・charr: https://sites.warnercnr.colostate.edu/wp-content/uploads/sites/112/2020/09/Nakano-et-al.-2020-charr-ecol-character-displacement.pdf ／ https://umimpact.umt.edu/en/publications/evaluating-a-pattern-of-ecological-character-displacement-charr-j/ ／ https://link.springer.com/article/10.1023/A:1007363927379 ／ https://kaken.nii.ac.jp/en/grant/KAKENHI-PROJECT-11440224/ ／ https://www.biorxiv.org/content/10.1101/364182.full.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/91784/Ryo_Futamura.pdf （F-20、F-21）
- 釣り解説（復帰距離）: https://bluequillangler.com/pages/how-trout-feed （F-19、C）

**縄張り・闘争**
- Grant & Kramer 1990: https://sitesreservoirproject.riptideweb.com/references/REF23/Volume%202/App11M_Yolo_Sutter_Bypass_Weir_Spill_Analysis/Grant%20and%20Kramer_1990_Territory%20Size.pdf （F-22）
- Keeley・縄張り: https://agris.fao.org/search/ar/records/65df79cb7c7033e84bedc24a ／ https://openpolar.no/Record/crwiley:10.1111%2Feff.12120 ／ https://open.library.ubc.ca/cIRcle/collections/831/items/1.0088809 ／ https://czaw.org/?p=2323 ／ https://docta.ucm.es/entities/publication/5c8096e2-27e6-40a7-9bfd-909c3bbd05b2 （F-24）
- 攻撃行動: https://www.sfu.ca/biology/faculty/dill/publications/f85-213.pdf ／ https://summit.sfu.ca/_flysystem/fedora/sfu_migrate/6415/b16649217.pdf ／ https://www.stir.ac.uk/research/hub/publication/750147 ／ https://ideas.repec.org/a/oup/beheco/v14y2003i1p127-134.html ／ https://orca.cardiff.ac.uk/id/eprint/62625/ ／ https://repositorio.ispa.pt/bitstreams/86fe2bdb-f026-4f8f-8817-c15f78af7032/download （F-39）
- 優劣と体色: https://katalog.lib.cas.cz/KNAV/EdsRecord/edb,8520900 ／ https://ore.exeter.ac.uk/repository/handle/10036/104585?show=full ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/21900/44(1)_P22-25.pdf ／ https://orbit.dtu.dk/en/publications/emergence-time-and-skin-melanin-spot-patterns-do-not-correlate-wi/ （F-12）

**捕食者回避**
- 水深・被覆・鳥・採餌再開: https://research.fs.usda.gov/treesearch/54224 ／ https://research.fs.usda.gov/treesearch/49962 ／ https://pubs.usgs.gov/publication/70256605 ／ https://www.sfu.ca/biology/faculty/dill/publications/grandanddill1997.pdf ／ https://www.sfu.ca/biology/faculty/dill/publications/j.1439-0310.1995.tb01095.x.pdf ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC5089841 ／ https://www.birdresearchnw.org/98Rpt.pdf （F-41）
- FID: https://blumsteinlab.eeb.ucla.edu/wp-content/uploads/sites/104/2019/09/Samia_etal_2019_FishFisheries.pdf ／ https://link.springer.com/article/10.1007/s10750-021-04561-6 （F-42）
- 警報物質: https://pherobase.com/literature/data/details/S/3276 （F-25。対応未確認）
- 逃避の運動学: https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance ／ https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo ／ https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two?redirectedFrom=fulltext ／ https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity （F-06）

**定位・走流性・流れの避難所**
- 胸鰭: https://journals.biologists.com/jeb/article-abstract/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout?redirectedFrom=fulltext ／ https://pubmed.ncbi.nlm.nih.gov/12547936 ／ https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/ （F-07）
- Kármán gait: https://pubmed.ncbi.nlm.nih.gov/15339945/ ／ https://journals.biologists.com/jeb/article/216/18/3442/11608/The-effect-of-flow-speed-and-body-size-on-Karman ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/ （F-08）
- 走流性: https://journals.biologists.com/jeb/article/223/23/jeb223008/226046/Rheotaxis-revisited-a-multi-behavioral-and ／ https://journals.biologists.com/jeb/article/218/10/1603/770/The-lateral-line-is-necessary-for-blind-cavefish ／ https://journals.biologists.com/jeb/article/217/13/2338/12236/Sedentary-behavior-as-a-factor-in-determining ／ https://journals.biologists.com/jeb/article/216/21/4011/11677/The-spatiotemporal-dynamics-of-rheotactic-behavior ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC13357317/ ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC2442850/ ／ https://pubmed.ncbi.nlm.nih.gov/17023602/ （F-09、F-27）
- 定位保持（題名のみ）: https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding ／ https://journals.biologists.com/jeb/article-abstract/145/1/303/5622/Station-Holding-by-three-Species-of-Benthic-Fishes?redirectedFrom=fulltext ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC12280926 （F-09）
- 流れの避難所・エネルギー: https://pmc.ncbi.nlm.nih.gov/articles/PMC11418164/ ／ https://journals.biologists.com/jeb/article/227/15/jeb247829/361512/Body-length-determines-flow-refuging-for-rainbow ／ https://sicb.org/?p=16388 ／ https://www.biorxiv.org/content/10.1101/2019.12.26.889055.full.pdf ／ https://journals.biologists.com/jeb/article/219/14/2182/15396/Refuging-rainbow-trout-selectively-exploit-flows ／ https://journals.biologists.com/jeb/article/228/Suppl_1/JEB247918/365643/Swimming-smarter-not-harder-fishes-exploit-habitat （F-36）

**冬期・低水温・夜間**
- 昼夜・水温・光: https://link.springer.com/article/10.1023/A:1007691316864 ／ https://eprints.gla.ac.uk/71319 ／ https://theses.gla.ac.uk/75895/ ／ https://theses.gla.ac.uk/75895/1/13818631.pdf ／ https://www.bio.ulaval.ca/labdodson/Papers%20Julian/Johnston%20et%20al%202004.pdf ／ https://www.kmae-journal.org/10.1051/kmae/2011083/pdf ／ https://link.springer.com/article/10.1023/A:1021372822784 ／ https://acnpsearch.tweb-dev.unibo.it/singlejournalindex/9762145 （F-29）
- 越冬レビュー: https://wicri-demo.istex.fr/Wicri/Eau/explor/LotaV3/Site/fr/Main/Exploration/bibRecord.php?hk=000769 ／ https://informahealthcare.com/doi/ref/10.1577/M03-196.1 （F-30）

**ローカル資料**
- 写真カタログ: `/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json` 〜 `catalog_c07.json` （F-13〜F-15）
- 先行ストリームの文書: `/home/user/gerupamasini/docs/yamame/research/r01_morph_jp.md`、`r05_parr_pigment_en.md`、`r07_eye_head_mouth.md`、`r09_swim_transient.md`

---

## 6. 検索ログ（クエリ・mode・有用度、総検索回数）

**実行した検索: 40 回（割当 40 回、全て mode=standard、extended は使用していない）。** "Web search was not performed ... budget" の応答は一度も返らなかった。WebFetch・curl は使っていない。有用度: 高=本文の数値・結論が要約に出た／中=書誌確認または定性的情報／低=書誌のみ・関連薄／無=無関係。

| # | mode | クエリ（要旨） | 有用度 | 得たもの |
|---|---|---|---|---|
| 1 | standard | Hughes Dill 1990 position choice drift-feeding Arctic grayling reaction distance prey length fish length | 中 | 書誌確認（F-17）。数値無し |
| 2 | standard | reactive distance increased with fish length prey length ... maximum capture distance capture success decreased with distance and velocity（本文の文型クエリ） | 高 | UGA 学位論文群の結論（F-04、F-37） |
| 3 | standard | Grant Kramer 1990 territory size predictor ... body length | 高 | 回帰式 2.61／−2.83／R² 0.87／n 23（F-22） |
| 4 | standard | Nakano 1995 individual differences in resource use ... red-spotted masu salmon | 低 | 書誌のみ（F-21） |
| 5 | standard | Nakano Fausch Kitano 1999 flexible niche partitioning ... foraging mode shift | 中 | 書誌＋大型個体／小型個体の採餌モード（F-20） |
| 6 | standard | masu salmon juvenile stream focal point water velocity depth drift feeding dominant ... | 高 | Ueno ら 2009 の内容、台湾産陸封型（F-31、F-34） |
| 7 | standard | ヤマメ 縄張り 体長 面積 摂餌 定位 流速 潜水観察 ナワバリ 攻撃 | 低 | 一般的な生息記述のみ |
| 8 | standard | Nippon Suisan Gakkaishi 75(5) 802-809 2009 masu salmon ... | 高 | 題名・著者・結果（F-31） |
| 9 | standard | flight initiation distance salmonid trout human approach stream angler disturbance | 中 | 魚類全般の FID メタ解析（F-42） |
| 10 | standard | juvenile salmonid response to overhead avian predator model silhouette shadow ... | 中 | steelhead の水深回避、カワセミ（F-41） |
| 11 | standard | Brown Smith 1997 conspecific skin extracts ... rainbow trout alarm substance | 低 | 書誌のみ（F-25） |
| 12 | standard | Fausch 1984 profitable stream positions ... focal point velocity | 中 | モデルの骨格と書誌（F-16） |
| 13 | standard | Fraser Metcalfe Thorpe 1993 temperature-dependent switch diurnal nocturnal foraging salmon below 10 C | 中 | 書誌＋昼行性から夜行性、0℃ 未満の夜間採餌（F-29） |
| 14 | standard（allowed_domains: journals.biologists.com, pubmed, pmc） | Rheotaxis revisited multi-behavioral multisensory ... | 高 | 感覚別の限界（F-27） |
| 15 | standard（同上） | Liao 2006 lateral line and vision ... turbulent flow | 中 | 書誌、視覚と側線の両方が働く（F-09、F-27） |
| 16 | standard（allowed_domains: pmc, journals.biologists.com） | Body length determines flow refuging for rainbow trout behind wing dams ... | 高 | 渦幅 ≥1.5 全長、尾びれ周波数低下（F-36） |
| 17 | standard | Arnold Webb Holford 1991 pectoral fins station-holding Atlantic salmon parr negative lift | 低 | 書誌のみ（F-09） |
| 18 | standard | Testing a model of drift-feeding 3D videography wild brown trout New Zealand ... | 中 | 予測より広い個体間隔（F-40） |
| 19 | standard | juvenile salmonids aggressive interactions per hour chases nips dominant ... nearest neighbour distance | 中 | 攻撃の構成 80% 超、67%、水温依存（F-39） |
| 20 | standard | ヤマメ 越冬 冬季 淵 隠れ場所 水温 低下 行動 夜間 採餌 渓流 | 低 | 季節別の流速選好（F-33） |
| 21 | standard | masu salmon winter habitat overwintering juvenile low temperature nocturnal stream Japan | 高 | 湧水支流、北海道の支流（F-32） |
| 22 | standard | juvenile masu salmon winter channel margin moderate current 20 cm/s submerged cover ... | 高 | 野登川 約 20 cm/s（F-32） |
| 23 | standard | Cunjak 1996 winter habitat of selected stream fishes ... | 中 | 書誌、越冬レビューの要約（F-30） |
| 24 | standard | mean focal point velocity cm/s mean focal height above substrate juvenile trout ... | 中 | 定性的な焦点位置の特徴（F-35） |
| 25 | standard | drift-feeding trout return to focal position after prey attack attack rate per hour ... | 中 | 復帰距離（C）、酸素消費の抄録（F-19、F-36） |
| 26 | standard | Grant Noakes 1987 movers and stayers ... brook charr | 低 | 書誌のみ（F-20） |
| 27 | standard | Hughes 1992 ranking of feeding positions drift-feeding Arctic grayling dominance hierarchies ... | 高 | 池内のサイズ順の位置（F-17） |
| 28 | standard | Piccolo Hughes Bryant 2008 water velocity influences prey detection and capture ... | 高 | 捕獲確率 65% → 10%（F-03） |
| 29 | standard | Fraser Metcalfe 1997 costs of becoming nocturnal ... light intensity | 中 | 0.1 lx 未満で効率低下（F-29） |
| 30 | standard | Grand Dill 1997 energetic equivalence of cover to juvenile coho ... | 低 | 書誌と設計のみ（F-41） |
| 31 | standard | Kawaguchi Nakano 2001 terrestrial invertebrates annual resource budget ... masu salmon | 低 | 関連薄（F-20 (4) に一部） |
| 32 | standard | Mechanisms of drift-feeding behavior in juvenile Chinook salmon ... inedible debris | 中 | 52%／39%／9%（F-38） |
| 33 | standard | oxygen consumption in drift feeding trout energetic implications refuge attack cost | 高 | 50 cm/s 超で +67%／−40%（F-36） |
| 34 | standard | juvenile Atlantic salmon become nocturnal below 10 C hide in substrate winter | 高 | 閾値 8–12℃、6–8℃（F-29） |
| 35 | standard | Cotel Webb Tritico 2006 brown trout reduced turbulence | 高 | 下側 5 cm、乱流（F-28） |
| 36 | standard | Keeley territory size juvenile salmonids food abundance visual isolation | 高 | 88%、+2%、視覚的隔離は有意でない（F-24） |
| 37 | standard | ヤマメ 警戒心 人影 足音 振動 逃げる 距離 メートル ... | 低 | 「警戒心が強い」のみ（F-26） |
| 38 | standard | drift-feeding salmonids prey size selection larger prey ... reaction distance | 中 | 大西洋サケの餌サイズ比（F-37） |
| 39 | standard | juvenile salmonid after simulated predator attack froze hid time to resume feeding ... | 中 | 採餌再開の順序（時間の数値無し）（F-41） |
| 40 | standard（allowed_domains: esj.ne.jp） | 日本生態学会 H02-01 渓流 サケ科魚類 魚食性鳥類 捕食リスク ... | 無 | 目的の要旨は得られず |

**総検索回数: 40（standard 40、extended 0）。** 検索以外の情報源: 先行ストリームの文書（r01、r05、r07、r09）の転載（Part A）、写真カタログ 70 枚のローカル集計（Part B）、初版の記憶（Part C のうち裏取りできなかった行は [M]）。

**次回、検索予算が使える場合の優先クエリ（未実行・優先順）:**
1. `Nakano 1995 Journal of Animal Ecology 64 75 masu salmon dominance hierarchy emigration growth` を `allowed_domains` で britishecologicalsociety.org などに絞る（Nakano 1995 の中身）。
2. `Hughes Dill 1990 reaction distance regression fish length Arctic grayling` を cdnsciencepub.com に絞る（反応距離の体長依存）。
3. `ヤマメ 夜間 摂餌 日周 胃内容物`、`サクラマス 幼魚 越冬 水温 隠れ場所`（日本語の夜間・冬期）。
4. `masu salmon alarm substance` ／ `salmonid startle response distance snorkeler cm`（警報物質、FID の数値）。
5. 野登川（Nobori River）のサクラマス冬期生息場所の論文の著者・誌名（F-32 (1) の確定）。
