# ドリフト捕食・微小生息場所選択・縄張り・捕食者回避行動（Drift-feeding, microhabitat selection, territoriality and anti-predator behaviour）— サケ科／ヤマメ（O. masou masou 河川型）— r12

> 作成: ストリームR12（行動生態・英語文献担当）。**初版（新規作成。既存ファイルなし）**。目的は、ヤマメ3Dモデルの行動（定位、ドリフト捕食、縄張り闘争、逃避、夜間・冬期の行動）を実装するための仕様根拠の収集。
>
> **この文書を使う前に必ず読むこと（調査の限界）**
> 1. **本ストリームでは WebSearch を 1 回も実行できなかった。** 割当は 26 回だったが、セッション全体の WebSearch 上限（200/200、他ストリームと共有）が既に使い切られていた。最初の 3 クエリ（Fausch 1984、Hughes & Dill 1990、Nakano ら 1999）を試したところ、3 件とも「Web search was not performed ... budget」と返った。指示どおり検索をそこで止め、迂回はしていない（WebFetch・curl も試していない）。**実際に成功した検索回数は 0。**
> 2. そのため、本書の中身は次の 3 種類だけである。**(a) Part A: 先行ストリーム（r01、r05、r09）が検索で確認した記述の転載**（元のランクを残し、「転載」と明記。本ストリームでは再検証していない）。**(b) Part B: 写真 70 枚のカタログ（photo_analysis/catalog_c01〜c07.json）からの集計 P。** **(c) Part C: 私の記憶 M（全て未検証）。** 検索要約が一度も読めていないので、Part C の書誌（巻・頁・年）にも誤りがありうる。
> 3. **ヤマメ（O. masou masou）の採餌行動・縄張り・逃避距離などを直接測った資料は、本書のどの部分にも無い。** Part A の数値は全て PROXY（ニジマス、coho、steelhead など）か、出典未特定の要約である。Part C の数値は、Grant & Kramer 1990 の回帰式と Fraser ら 1993 の約 10℃ を除いて掲載していない。この 2 件も「要原典確認、仕様の既定値にしない」とする。
> 4. 課題に挙がった論文のうち、Fausch 1984、Hughes & Dill 1990、Grant & Noakes 1987、Nakano 1995、Nakano, Fausch & Kitano 1999 の **本文・抄録は一度も読めていない。** 反応距離の回帰式、捕獲成功の関数、最大捕獲距離、焦点流速・底上高の実測値は、全て **Gap**（§4）。
> 5. 「私の推論」「派生」「算出」と書いた箇所は、資料に書かれた値ではない。写真由来の高さ・距離は注釈者（AI）の目視推定で、スケール校正なし。
> 6. **証拠ランク**: A=査読論文・学術書で、検索要約に数値/記述が明示（Part A は r09 などが確認したもの）／B=公的機関資料・学位論文・解説／C=出典不明の要約・釣り・個人ブログ／M=記憶（未検証）／P=ユーザー提供写真 70 枚からの観察・集計。PROXY は適用範囲に明記。

---

## 1. 要約（仕様に直結する結論）

> 1 は全体の注意。2〜6 はドリフト捕食と定位、7〜9 は縄張りと優劣、10〜13 は捕食者回避と感覚、14〜15 は冬期・夜間、16〜18 は実装上の扱い。**数値の多くは PROXY か未検証 M である。**

1. **本書にはヤマメを直接測った行動数値が無い。** 検索 0 回。確認済み（r09 経由で A/B）の数値は全てニジマス・coho・steelhead など PROXY。仕様では「近縁サケ科の暫定値」と明記し、パラメータは調整可能にする。[全体、F-01〜F-09]
2. **行動の骨格（定位点で待機 → 流下餌を検出 → 短く迎撃 → 流れに乗って復帰）** は、Fausch 1984 と Hughes & Dill 1990 以降のドリフト捕食モデルの共通枠組みである。ただしモデルの中身は本書では記憶（M）のみ。[F-16、F-17]
3. **時間配分: 定位点滞在 約 81%、能動的な採餌 約 14%。餌の約 2/3 は定位点より下流側で捕獲。** 出典論文が特定できない要約（C）。仕様では「大半の時間は微小な定位動作、迎撃は短時間・下流側が多い」を仮置きにする。[F-02]
4. **迎撃速度:** coho／steelhead 幼魚（水槽、0.29–0.61 m/s）では、全流速で予測最大持続遊泳速度（Vmax）で迎撃した（A、PROXY）。別の（出典未特定）要約では Vmax より遅い。ヤマメでは不明。[F-03、F-02、§3-2]
5. **検出（反応）距離と捕獲確率は流速で低下する**（Piccolo ら 2008、A、PROXY）。一方、ニジマス・北極グレイリングの学位論文要約は「反応距離は流速の影響が小さい／なし」（B）。両者は並記し、距離の値は取得できていない。[F-03、F-04、§3-1]
6. **定位位置:** ヤマメ河川型の生息流速は 10–35 cm/s、粒径 0.5–5 cm の礫底（B。環境省資料）。これは生息域の記述で、焦点流速（focal velocity）ではない可能性が高い。焦点流速・底上高の実測値は未取得。[F-01、Gap]
7. **写真（P、自然水中の定位フレーム）では、魚体の腹縁は基質から約 0.25〜1 体高の範囲**（p026 約 0.25、p005 約 0.7、p036・p040・p023B 約 1）。n は 5 枚で、スケール校正が無く、釣獲後に置かれた個体は除いた。底に腹をつけて休む例は水槽（p017、p049）。[F-13]
8. **定位中の鰭の姿勢（P）:** 水中・水槽の 23 フレームのうち、背鰭が立つものは 11 枚（寝る／畳むは 2 枚、記述なし 10 枚）。胸鰭は「広げる」6、「畳む・体側に沿う（半開きを含む）」8、「垂れる・基質に押し付ける」6 で、一定の型は無い（手作業の分類。p014 は 2 尾を別に数えた）。ホバリング時の胸鰭は、前方への運動で主に側方の渦を出して補正力を作る（ニジマス、A、PROXY）。[F-15、F-07]
9. **障害物の背後・乱流での定位:** ニジマスでは Kármán gait（尾の振幅は自由流の約 3 倍、尾びれ周波数は渦放出周波数に一致、体波長は後流波長の約 1.25 倍）と、胸鰭の 2 モード（持続的な張り出しによる制動／一過的な展開・収納による横方向制御）が報告された（A、PROXY）。出現確率が最大の流速は 30–70 cm/s で、ヤマメの生息流速（10–35 cm/s）より速い範囲である。[F-08、F-07、F-01]
10. **縄張りの大きさ（M、要原典確認）:** 幼若サケ科の縄張り面積は体長の約 2.6 乗で増える（Grant & Kramer 1990 の回帰として記憶。式は F-22）。式をそのまま使うと、体長 10 cm で約 0.6 m²、20 cm で約 3.7 m²。**検証前は仕様の既定値にしない。** [F-22]
11. **優劣:** 体サイズに基づく階層ができ、優位個体が高利益の位置（流れの速い所に近く、定位点の流速が低い所）を占め、劣位個体は低利益位置に追われるか移出する、という枠組み（Fausch & White 1981、Hughes 1992、Nakano 1995 など。全て M）。[F-17、F-21]
12. **闘争行動の型（M）:** 正面誇示、側面誇示（鰭を立てる）、突進（チャージ）、追跡、咬みつき（突つき）、旋回。頻度・持続時間・距離の数値は未取得。写真（P）に闘争の場面は無い。[F-23、F-14]
13. **体側模様（パーマーク・黒点）の縄張り維持効果は、イワメ–アマゴ比較ではほとんど無いとされた**（A、PROXY:アマゴ）。パーマークの濃淡を闘争信号として動的に変える仕様には根拠が無い。サケ科の他種では、強膜の色などが優劣と関連した報告がある（帰属不確実、PROXY）。[F-11、F-12]
14. **捕食者回避:** 逃避の運動学（潜時 5–20 ms、最小旋回半径約 0.17–0.18 L、加速度の幅など）は r09 に PROXY 値がある。**逃避の開始距離（FID）、頭上の影への反応、警報物質への反応、回復時間は、検索できておらず、数値が無い。** 定性的な枠組み（凍結、隠れ場所への退避、採餌の抑制）は記憶（M）。[F-06、F-25、F-26]
15. **定位の感覚基盤（M）:** 明るい所では視覚（オプトモーター反応）、暗所や視覚を使えない時は側線・触覚・前庭が定位を担う、という整理が古典（Arnold 1974 など）。ニジマスの乱流中の側線と視覚の役割を調べた論文の題名（Liao 2006）は確認済みだが、結果は未取得。[F-27、F-09]
16. **冬期・低水温・夜間（M）:** 約 10℃ を下回ると、大西洋サケ parr は昼行性から夜行性に切り替え、昼は基質の間に隠れる（Fraser ら 1993 として記憶）。サケ科一般で、冬は礫間・淵・倒木下などの隠れ場所に集まり、昼間の採餌と攻撃が減る（Cunjak 1996 など。M）。**ヤマメでの確認は無い。** [F-29、F-30]
17. **餌の種類:** 渓流のサケ科は水生昆虫の流下に加えて、陸生昆虫（水面に落下）を大量に食べる。北日本の渓流でニジマスが陸生無脊椎動物を選択的に摂食した報告がある（Nakano ら 1998 として記憶、PROXY）。写真 p007 は水面のライズ直後と推定される（P、推定）。表層の摂餌行動（水面からの吸い込み）を実装する根拠にはなるが、頻度は不明。[F-20、F-15]
18. **実装方針（私の推論）:** 状態機械は「定位 → 検出 → 迎撃 → 捕獲 → 復帰」「闘争（誇示 → 追跡）」「驚愕・逃避 → 退避 → 回復」「夜間・冬期の隠れ」に分け、全ての距離・速度・頻度を `config` の調整値にして、根拠欄に「M／PROXY／P」を残す。上記の 2〜17 のうち数値で固定してよいものは、現状ほぼ無い。[全体]

---

## 2. Findings

> **Part A（F-01〜F-12）: 先行ストリームが検索で確認した記述の転載。** 本ストリームでは再検証していない。ランクと出典 URL は転載元のまま。
> **Part B（F-13〜F-15）: 写真 70 枚のカタログからの集計 P。** 水中・水槽の 23 フレーム（自然水中 12、水槽 11）を使用。
> **Part C（F-16〜F-30）: 記憶 M。** 全て未検証。書誌（巻・頁・年）の誤りがありうる。URL は検索結果に出ていないので付けない。

---

### Part A — 先行ストリームが確認した記述（転載）

### F-01 ヤマメの生息流速・河床（環境省・島根県資料）
- 主張/値: ヤマメは **流速 10〜35 cm/s、粒径 0.5〜5.0 cm の礫底**の渓流に生息する（環境省資料）。同じ結果集合でアマゴは **流速 15 cm/s・水深 10〜30 cm**、夏期最高水温 25℃以下の渓流（島根県）。
- 適用範囲: ヤマメ（河川型）、アマゴ。サイズ・季節・「生息流速」が局所流速か平均流速かは要約に無い。**焦点流速（定位点の流速）ではない可能性が高い（r09 の解釈）。**
- 出典: 環境省資料／島根県水産資料。r09 F-01（r01 F-32 から継承）の転載。
  - https://www.env.go.jp/council/09water/y0910-03/mat03.pdf
  - https://www.env.go.jp/info/iken/h180317a/a-2.pdf
  - https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html
- 証拠: [B（r09 転載）] "Yamame ... inhabits stream valleys at flow velocities of 10-35 cm/s in gravel beds with pebbles of 0.5-5.0 cm diameter"（先行ストリームが記録した要約）。
- 実装への含意（私の推論）: 流れ場の既定値の範囲を決める根拠にはなるが、定位点の流速には使えない。

### F-02 ドリフト捕食の時間配分と捕獲位置（出典未特定の要約）
- 主張/値: ドリフト捕食の魚は、水中の定位点に留まり、速い流れに短く出て流下する無脊椎動物を迎撃する。ある研究で、**魚は観察時間の平均 81% を定位点で過ごし、能動的な採餌は 14%**。**迎撃速度は期待された最大持続遊泳速度より遅く、餌の約 2/3 は定位点より下流側で捕獲された**（上流側ではなく）。採餌モデルの一部は、定位点を含む平面上の 5 cm² の格子セルとして採餌体積を扱う。
- 適用範囲: ドリフト捕食のサケ科（種、サイズ、場所は要約が特定していない）。検索結果の集合には brown trout の 3D 映像研究（Hughes ら 2003、ニュージーランド）、juvenile Chinook salmon の 3D 映像研究、カリフォルニアの O. mykiss の研究が含まれており、記述はこれらのいずれかに由来する（r09 の推定）。**ヤマメではない。**
- 出典: r09 F-41 の転載（候補。記述との対応は未確認）。
  - https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river
  - https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream
  - https://cdnsciencepub.com/doi/10.1139/cjfas-2020-0398
  - https://link.springer.com/article/10.1007/s10641-013-0187-6
- 証拠: [C（r09 転載・出典論文の特定不能）] "Fish held focal positions in the water column most of the time (mean = 81%), with active foraging observed for 14% of observation periods ... captured about two-thirds of their prey downstream of their focal point"（検索要約）。
- 実装への含意（私の推論）: 定位（微小な尾・鰭の動き）を既定の状態とし、迎撃は短時間にする。迎撃の向きは下流側を多数とし、上流への突進を既定にしない。出典未特定なので参考扱い。

### F-03 流速が検出距離・捕獲確率・迎撃速度に与える影響（Piccolo ら 2008。coho／steelhead 幼魚）
- 主張/値: 水槽で juvenile coho salmon と steelhead を **流速 0.29〜0.61 m/s** で比較（3D 映像解析）。**捕獲確率と餌の検出距離は、流速の増加で有意に低下**（種の効果、流速×種の交互作用はなし）。**迎撃速度は流速にも種にも影響されず、全流速で、予測された最大持続遊泳速度（Vmax）で迎撃した。**
- 適用範囲: **PROXY: coho salmon／steelhead（降海型ニジマス）幼魚**、水槽。捕獲確率の低下幅は要約の表記が乱れており（"from -65% to 10%"）、**採用しない**（r09 の判断）。体長・水温・n は要約に無い。
- 出典: Piccolo J.J., Hughes N.F., Bryant M.D. (2008) "Water velocity influences prey detection and capture by drift-feeding juvenile coho salmon (Oncorhynchus kisutch) and steelhead (Oncorhynchus mykiss irideus)", Can. J. Fish. Aquat. Sci.（巻頁は要約に無い）。r09 F-42 の転載。
  - https://research.fs.usda.gov/treesearch/31556 （検索結果にあった候補。当該論文かは未確認）
  - https://research.fs.usda.gov/treesearch/31555 （同上）
  - https://link.springer.com/article/10.1007/s10641-008-9330-1 （同上）
- 証拠: [A（r09 転載）] "fish intercepted prey at their predicted maximum sustainable swimming speed (Vmax) at all velocities ... prey detection distance [decreased with velocity]"（検索要約。URL と記述の対応は未確認）。
- 実装への含意（私の推論）: 迎撃速度を「その個体の最大持続遊泳速度」とする単純な規則は文献で支持される（PROXY）。検出距離は流速が増すと短くする。

### F-04 反応距離と流速（学位論文の要約。ニジマス・北極グレイリング）
- 主張/値: UGA の Drift Model Project の学位論文の要約として、**反応距離（reactive distance）は北極グレイリングで流速との関係が弱い正または無い。ニジマスでは、流速は捕獲に負の効果、反応距離にはほとんど／全く効果なし、定位流速（holding velocity）に正の効果**。
- 適用範囲: PROXY: 北極グレイリング、ニジマス。実験室か野外かは要約が特定していない。学位論文（査読を経ない）。どの学位論文の記述か、要約が特定していない。
- 出典: r09 F-43 の転載（候補）。
  - https://openscholar.uga.edu/record/3703/files/MerrittKieranMS.pdf
  - https://openscholar.uga.edu/record/20894/files/bozeman_bryan_b_201708_ms.pdf
  - https://openscholar.uga.edu/record/5581/files/Ridge%20Sliger%20Thesis%20Final.pdf
- 証拠: [B（r09 転載）] "Reactive distance displayed a weak (positive) or nonexistent relationship with velocity ... water velocity had a negative effect on prey capture, little to no effect on reactive distance, and a positive effect on holding velocity in rainbow trout studies."
- 矛盾: F-03（流速増で検出距離が低下）と食い違う（§3-1）。

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
- 実装への含意（私の推論）: 迎撃の上限速度と、通常遊泳の上限速度の桁の目安。上の倍率を体長 15 cm に当てはめると（算出）、巡航は 30–45 cm/s、突進は 150 cm/s 前後。F-03 の Vmax（最大持続遊泳速度）がこの間のどこに当たるかは不明で、ヤマメの Vmax は Gap。具体値は r08・r09 を参照。

### F-06 逃避（高速スタート）の運動学の PROXY 値（r09 の要点のみ）
- 主張/値: ニジマス（全長 9.6–38.7 cm、電気刺激）で高速スタートは L 型と S 型の 2 型。**主加速段階の継続時間は体長とともに増え、0.07 s（最小群）から 0.10 s（最大群）。最小旋回半径は全長に比例して 0.17 L。加速度は体サイズに依存しない**（Webb 1976）。ニジマス（0.32 m）の平均最大加速度は **59.7 ± 8.3 m/s²**、逃避の継続時間は最大 0.134 s（Harper & Blake 1990）。**最小潜時は 5–20 ms の桁でサイズに依存しない**（総説の要約。出典未特定）。活餌への攻撃中のニジマス（25.7 cm）の最小旋回半径は **0.18 L**（Webb 1983）。
- 適用範囲: **PROXY: ニジマス**、実験室。水温・n は要約に無い。刺激は電気刺激や活餌で、野外のヤマメの逃避ではない。**逃避の開始距離（人・鳥に対して）は、これらの論文の要約に無い。**
- 出典: r09 F-31、F-32、F-35、F-37 の転載。
  - Webb 1976, J. Exp. Biol. 65(1):157–177: https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance
  - Harper & Blake 1990, J. Exp. Biol. 150(1):321–342: https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo
  - Webb 1983, J. Exp. Biol. 102(1):115–122: https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two?redirectedFrom=fulltext
  - Domenici & Hale 2019, J. Exp. Biol. 222:jeb166009: https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity
- 証拠: [A（r09 転載）] "The duration of the primary acceleration stages increased with size from 0.07 s ... to 0.10 s ... overall radius of 0.17 L."／"Minimum response latencies are in the order of 5–20 ms and independent of fish size."（検索要約）
- 実装への含意: 逃避アニメの詳細は r09 を正とする。本書（行動）は「いつ・どの距離で逃避を起動するか」の側を担当するが、その値が無い（Gap）。

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
- 実装への含意（私の推論）: 岩・流木の背後では尾の振幅を増やし周波数を下げる状態を設ける。ヤマメの流速範囲で出現するかは不明なので、既定は弱めにする。

### F-09 乱流・側線・視覚・定位保持に関する題名のみ確認した文献（内容は未取得）
- 主張/値: 次の論文の **題名と URL だけ** が r09 の検索結果に出た。**内容の要約は得られていない。数値・結論は採用しない。**
  - Liao J.C. (2006) "The role of the lateral line and vision on body kinematics and hydrodynamic preference of rainbow trout in turbulent flow", J. Exp. Biol. 209(20):4077– 。https://pubmed.ncbi.nlm.nih.gov/17023602/
  - "Rheotaxis revisited: a multi-behavioral and multisensory perspective on how fish orient to flow", J. Exp. Biol. 223(23):jeb223008 (2020)。https://journals.biologists.com/jeb/article/223/23/jeb223008/226046/Rheotaxis-revisited-a-multi-behavioral-and
  - Arnold G.P., Webb P.W., Holford B.H. (1991) "The role of the pectoral fins in station-holding of Atlantic salmon parr (Salmo salar L.)", J. Exp. Biol. 156:625–629。仮説（胸鰭が負の揚力を作る水中翼として働く）が提案され、これを検証した論文、という記述までで、**結果は未確認**。https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding
  - Webb P.W. (1989) "Station-holding by three species of benthic fishes", J. Exp. Biol. 145:303–320。https://journals.biologists.com/jeb/article-abstract/145/1/303/5622/Station-Holding-by-three-Species-of-Benthic-Fishes?redirectedFrom=fulltext
  - "Inherent instability leads to high costs of hovering in near-neutrally buoyant fishes"（PMC）。https://pmc.ncbi.nlm.nih.gov/articles/PMC12280926
- 適用範囲: ニジマス、大西洋サケ parr、底生魚（PROXY）。ヤマメは未確認。著者・年は、題名ページの巻号と r09 の記憶による（要約には著者が出なかった）。
- 出典: r09 F-48、F-49 の転載（上記 URL）。
- 証拠: [A（題名の存在のみ）] "The hypothesis that pectoral fins are important to station-holding in Atlantic salmon, acting as hydrofoils generating negative lift, has been commonly proposed."（Arnold ら 1991 についての検索要約）
- 実装への含意: 次回の検索で抄録を確認する優先度が高い（§6 の未実行クエリ）。

### F-10 FishBase の記述: 河川型は源流域に生息し縄張りを持つことが多い
- 主張/値: FishBase の O. masou の記述として「河川型は源流域に生息し縄張りを持つことが多い」。同じ項に最大 79.0 cm TL、最大公表体重 10.0 kg（種全体の極値。降海型を含む）。
- 適用範囲: O. masou 種全体の解説。縄張りの大きさ・期間・性・サイズは書かれていない。
- 出典: r01 F-23 の転載。
  - https://www.fishbase.se/summary/Oncorhynchus-masou.html ／ https://fishbase.se/summary/242
- 証拠: [B（r01 転載）] 縄張りの記述は一文のみ。数値無し。
- 実装への含意: 「ヤマメ河川型は縄張りを持つ」こと自体の定性的な根拠。縄張り面積の根拠にはならない（F-22 を参照）。

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
- 証拠: [B（r05 転載。帰属不確実）]。r05 の抜粋は上の主張欄の通り。
- 実装への含意（私の推論）: 強膜色などの微細な社会信号は、3D モデルの再現対象としては優先度が低い。

---

### Part B — 写真 70 枚のカタログからの集計 P

> 使用: `docs/yamame/photo_analysis/catalog_c01〜c07.json` の `context`、`posture_behavior`、`head_mouth` 欄。70 枚の内訳は、地上 19、タモ網 13、自然水中 12、水槽 11、手 10、その他 5。**水中の定位・遊泳に使えるのは自然水中 12 枚と水槽 11 枚（計 23）。** そのうち自然水中の p011・p019・p067・p070 は釣獲後に水へ置いた／掛かった個体で、自発行動ではない。水槽は過密・ガラス面で、野外の行動の根拠にならない（r09 F-14 と同じ注意）。魚体サイズはほぼ「不明」。

### F-13 定位中の底からの高さ（自然水中）
- 主張/値: 自然水中で定位・低速遊泳と読める 5 枚の腹縁–基質の距離（目視推定）: **p026 約 0.25 体高（頭を下げて礫際）**、**p005 約 0.7 体高（約 60 px、体高の約 0.7 倍）**、**p036 体高程度（礫の岩棚の上、ホバリング様）**、**p040 約 1 体高**、**p023 の個体 B は基質上約 1 体高以内**（個体 A は暗い流木・岸際近くの上層）。水槽では p014 が底から体高 1 個分程度、p049 は腹が岩の上端に接する程度、p017 は礫の上に腹をつけて休止。
- 適用範囲: ヤマメ（種同定の確信度は写真ごとに異なる）。parr〜成魚、サイズ不明。**スケール校正なし、遠近の影響あり。流速・水深・季節は判別不能。**
- 出典: ユーザー提供写真のカタログ（`posture_behavior` 欄。p005、p023、p026、p036、p040、p014、p017、p049）。
- 証拠: [P] p005「底の礫面から魚体下縁まで約60px(体高の約0.7倍)の高さを保ち、緩い定位」。p036「体高程度の距離…静止、ホバリング様に定位」。
- 実装への含意（私の推論）: 定位時の腹縁–底の距離は「0.25〜1 体高」を初期レンジにする。ただし n=5、焦点高の文献値（Gap）による裏付けは無い。

### F-14 向きと個体間距離
- 主張/値: **水槽・自然水中ともに、複数個体は同じ方向を向く傾向**（p014 2 尾が同方向、p015 の全個体が左向き、p041 の多くが同方向、p023 の B・C・D が全て画像左向き）。個体間距離の目視推定は、水槽 p018 で約 1/3 体長（並走）、p028 で約 0.3–0.5 体長、p029 で約 0.5–1 体長、p016 で鼻先がほぼ接触（距離ほぼ 0）。自然水中の p023 では小群 B・C・D の距離が 0.1–0.5 体長（画像上は重なる）。p019 は釣獲後の 2 尾が体の約 1/3 が重なる近さ。
- 適用範囲: **過密の水槽（p014〜p018、p027〜p029、p041、p042、p049）と釣獲後・捕獲直後の小群（p019、p023）。縄張り行動や野外の個体間距離の根拠にはならない**（r09 F-14 と同じ判断）。向きがそろうのは、流れへの定位か、同調（群れ行動の可能性）かを写真から判別できない。
- 出典: ユーザー提供写真のカタログ（p014、p015、p016、p018、p019、p023、p028、p029、p041）。
- 証拠: [P] p023「B・C・Dは小群で距離0.1-0.5体長(画像上は重なる)で、いずれも頭を画像左へ向ける(同方向を向く)。全体で緩い集合。」
- 実装への含意: 縄張り・間隔の設計には使えない。「複数個体は上流を向いて並ぶ」という向きの揃え方の参考のみ。

### F-15 定位中の鰭と口の状態
- 主張/値: 水中・水槽の 23 フレーム（posture_behavior 記述）を私が手作業で分類した集計（主観を含む。p014 は 2 尾を別に数えるので胸鰭の合計は 24）。**背鰭: 立つ／直立 11 枚**（p005、p006、p016、p018、p023、p026、p029、p040、p042、p049、p054）、寝る／畳む 2 枚（p011、p041）、記述なし 10 枚。**胸鰭: 広げる 6**（p005、p006、p014 の A 魚、p016、p018 は軽く、p019）、**畳む・体側に沿う（半開きを含む）8**（p014 の B 魚、p027、p028、p029、p040、p041、p042、p049）、**垂れる・基質に押し付ける・触れそう 6**（p007、p011、p017、p026、p054、p067）、記述なし／見えない 4（p015、p023、p036、p070）。例: p005 は胸鰭を大きく広げて下後方へ、背鰭は立てて後傾、臀鰭は後方に流れ、腹鰭は半ば閉じる。p040 は胸鰭を畳み、腹鰭は閉、背鰭は立ち、尾鰭を広く展開。**口の状態（`head_mouth.mouth_state`、自然水中 12 枚）: 開 2 枚（p005 は頭を約 5° 上げて口を開く＝摂餌／呼吸、p019 は釣獲後でわずかに開く）、閉 9 枚（p011 は分類欄が閉だが自由記述では「わずかに開く」）、鉤掛かり 1 枚（p067）。** p007 は頭付近から同心円状の波紋が広がり、ライズ直後または水面近くの方向転換と推測される（推定）。
- 適用範囲: ヤマメ（parr〜成魚、種同定の確信度は写真ごと）。一瞬のフレームで、頻度や持続時間は分からない。定位・摂餌・呼吸の区別は付かない。
- 出典: ユーザー提供写真のカタログ（`posture_behavior`、`head_mouth` 欄）。
- 証拠: [P] p005「頭をやや上向き(約5度)にし口を開く(摂餌/呼吸)。胸鰭を大きく広げて下後方へ、背鰭は立てて後傾」。p007「同心円状の波紋…捕食(ライズ)直後または水面近くでの方向転換と推測される(推定)」。
- 実装への含意（私の推論）: 背鰭は立てた状態を既定にする。胸鰭は畳む／広げるの両方を確率的に使う。口は閉を既定にして、摂餌時に開く。

---

### Part C — 記憶 M（全て未検証）

> **Part C の全ての項目の証拠は [M] である。** 検索要約が一度も読めていないので、書誌の細部（巻・頁・年・共著者）には誤りがありうる。数値は、掲載しているものに限り「要原典確認」と付ける。確信度は私の主観で、「高／中／低」。

### F-16 Fausch (1984) の「採餌位置の正味エネルギー獲得」モデル
- 主張/値: 流下餌を食べる河川性サケ科の採餌位置を、**餌から得るエネルギー（定位点の周囲を流れる餌の量と、魚が迎撃できる範囲で決まる）から、定位と迎撃の遊泳コストを引いた正味エネルギー獲得**で評価するモデル。位置の利益は、**定位点の流速が低い（遊泳コストが小さい）こと**と、**近くに速い流れがある（餌の運搬量が大きい）こと**の組合せで決まる。魚の成長率は正味エネルギー獲得と結びつく、と予測する。魚が大きいほど、また優位であるほど、利益の高い位置を占めると予測する。（確信度: 中。骨格のみ）
- 適用範囲: 河川性サケ科（検証の対象種とサイズの記憶が曖昧）。ヤマメは未確認。
- 出典: Fausch K.D. (1984) "Profitable stream positions for salmonids: relating specific growth rate to net energy gain", Can. J. Zool. 62:441–451（書誌は記憶。r09 F-25 も同じ記憶由来）。URL は検索結果に出ていないので付けない。
- 証拠: [M] 検索要約なし。モデルの式・パラメータ値は記憶に無い。
- 実装への含意（私の推論）: 「なぜその場所にいるか」を、**低流速の定位点＋近くの速い流れ＋隠れ場所**で説明する、シーン上の定位点の配置規則に使える。

### F-17 Hughes & Dill (1990) と Hughes のモデル系（NREI）
- 主張/値: Hughes & Dill (1990) は、北極グレイリング（アラスカの亜寒帯の山地渓流）の **定位点の選択**を、正味エネルギー摂取速度（NREI: net rate of energy intake）を最大にする位置として予測し、野外で検証した。モデルは、(i) 餌の流下量（流速×餌密度）、(ii) 魚が餌を検出できる反応距離、(iii) その範囲内の餌を捕獲できる確率、(iv) 迎撃と復帰を含む遊泳コスト、を組み合わせる。Hughes (1992) は、**優劣の階層の中で、優位個体ほど NREI の高い位置を占める**ことをグレイリングで示した。Hughes (1998) はこれを異なるスケールの生息場所選択に拡張し、Hughes ら (2003) はブラウントラウトを 3D 映像で測ってモデルを検証した（題名は r09 が検索結果で確認、ResearchGate の URL は F-02）。Hughes & Kelly (1996) は、遊泳操作のエネルギーコストを幾何と力学から推定するモデルを出した。（確信度: 中。骨格のみ。式・係数は記憶に無い）
- 適用範囲: PROXY: 北極グレイリング、ブラウントラウト。ヤマメは未確認。**課題文の「Hughes & Dill 1990 size-based aggression」は書誌の混同の可能性がある。** 記憶では、サイズに基づく攻撃と優劣を扱った論文は別の研究（Abbott ら 1985、chinook の幼魚）で、Hughes & Dill 1990 はモデルの論文である。
- 出典: Hughes N.F., Dill L.M. (1990) "Position choice by drift-feeding salmonids: model and test for Arctic grayling (Thymallus arcticus) in subarctic mountain streams, interior Alaska", Can. J. Fish. Aquat. Sci. 47:2039–2048。Hughes N.F. (1992)（グレイリングの優劣と位置の順位。誌名・頁は記憶が曖昧）。Hughes N.F. (1998) Ecology 79:281–294。Hughes & Kelly (1996) Can. J. Fish. Aquat. Sci. 53:2484–2493。（書誌は記憶）
- 証拠: [M] 検索要約なし。
- 実装への含意（私の推論）: 1 回の採餌サイクルの利益を「得た餌 − 迎撃と復帰のコスト」で数えるロジックを作れば、魚が自然に（流れの速い所に近い低流速の位置を選ぶ）配置になる。ただしパラメータは全て調整値。

### F-18 反応距離・捕獲成功・最大捕獲距離（定性的のみ。数値は Gap）
- 主張/値: NREI 系のモデルでの共通の考え方（確信度: 中・定性）。(1) **反応距離（餌を検出して攻撃を始める距離）は、餌が大きいほど長く、水が澄んで明るいほど長い。魚の体長が大きいほど長い**（体長との比例関係を仮定するモデルが多い、と記憶）。(2) **捕獲成功率は、魚と餌の距離が長いほど、また流速が速いほど低下する。** (3) **最大捕獲距離（これ以上は追わない距離）は、魚の最大遊泳速度と流速で決まる**（魚が餌の流下に追いつける範囲）。(4) 追跡が遠くなるほど遊泳コストが増える。**反応距離が体長の何倍か、捕獲成功の関数形、最大捕獲距離が何 cm かは、記憶に信頼できる数値が無い。**
- 適用範囲: ドリフト捕食のモデル研究一般。ヤマメは未確認。**流速と反応距離の関係は文献間で食い違う**（F-03 と F-04）。
- 出典: F-17 と同じ文献系（書誌は記憶）。
- 証拠: [M] 検索要約なし。確信度: 中（定性）、数値は無し。
- 実装への含意（私の推論）: 検出距離 = 体長 × 係数（調整値）× 餌サイズ係数 × 流速係数、のようにパラメータ化し、係数は「根拠なし」と明記して出す。

### F-19 捕獲行動（迎撃・復帰）と餌サイズ選択
- 主張/値: (1) 魚は定位点から出て餌を迎撃し、摂餌後は流れに乗って定位点付近へ戻る（復帰は多くの場合、再び遊泳するよりも流れに任せる部分が大きい、という記憶。確信度: 低〜中）。F-02 の「餌の約 2/3 は下流側で捕獲」は、この形と整合する。(2) **ドリフト捕食のサケ科は、大きな餌を選択的に食べる傾向がある**（ブラウントラウト、大西洋サケ parr などの古典的研究。Ringler 1979、Bannon & Ringler 1986 として記憶。確信度: 中。書誌は曖昧）。(3) **捕獲の頻度（1 時間あたりの攻撃数）、迎撃距離の分布、復帰時間・復帰経路は、記憶に信頼できる数値が無い。**
- 適用範囲: ブラウントラウト、大西洋サケ parr、ニジマスなど（PROXY）。ヤマメの摂餌頻度は未確認。
- 出典: Ringler N.H. (1979)、Bannon E., Ringler N.H. (1986)（誌名・巻頁は記憶が曖昧なので省略）。
- 証拠: [M] 検索要約なし。
- 実装への含意（私の推論）: 餌のサイズを乱数で決め、大きい餌ほど反応する確率と距離が上がるロジックは自然。頻度は仮置きで、根拠なしと明記する。

### F-20 採餌モードと餌資源（Grant & Noakes 1987、Nakano ら 1998・1999）
- 主張/値: (1) **Grant & Noakes (1987)**: ブルックチャー（Salvelinus fontinalis）の当歳魚に、**「mover（動き回って探す）」と「stayer（定位点で待つ）」という個体差のある採餌戦術**があると報告した（確信度: 中。論文名は "Movers and stayers: foraging tactics of young-of-the-year brook charr", J. Anim. Ecol. 56 と記憶。頁は曖昧）。(2) **Nakano, Fausch & Kitano (1999)**: 北海道の渓流で、オショロコマ（Salvelinus malma）とアメマス（S. leucomaenis）が、**ドリフト捕食と底生採餌（探索）の間で採餌モードを切り替えて**ニッチを分けて共存する、という機構を提案した（"Flexible niche partitioning via a foraging mode shift ..." J. Anim. Ecol. 68 と記憶。確信度: 中）。課題文は masu salmon と書くが、**この論文の対象は masu salmon ではなく charr の 2 種**というのが私の記憶。(3) **Nakano ら (1998)**: 北日本の森林渓流で、ニジマスが陸生無脊椎動物を選択的に摂食した（題名は "Selective foraging on terrestrial invertebrates by rainbow trout in a forested headwater stream in northern Japan", Ecol. Res. 13 と記憶。確信度: 中。PROXY: ニジマス）。
- 適用範囲: PROXY: ブルックチャー、オショロコマ、アメマス、ニジマス。ヤマメは未確認。
- 出典: 書誌は記憶。URL は検索結果に出ていないので付けない。
- 証拠: [M] 検索要約なし。
- 実装への含意（私の推論）: 個体ごとに「待機型／探索型」の傾向を持たせる設計が可能だが、ヤマメ（河川型）で確認された割合は不明。表層（陸生昆虫の落下）を取る行動を、全てのドリフト捕食に混ぜる選択肢がある。

### F-21 優劣と位置・成長・移出（Fausch & White 1981、Nakano 1995、Hughes 1992）
- 主張/値: (1) **Fausch & White (1981)**: ミシガン州の河川で、ブルックトラウト（Salvelinus fontinalis）とブラウントラウトの **競争と、体サイズによる優劣、利益の高い定位点（岸や倒木の近くの低流速の位置）の占有**を調べた（Can. J. Fish. Aquat. Sci. 38 と記憶。確信度: 中）。(2) **Nakano (1995)**: 天然河川で、"red-spotted masu salmon"（記憶では、アマゴ系統の呼称。学名は O. rhodurus か O. masou ishikawae と表記が分かれる）の **優劣の階層**の中で、個体ごとの資源利用・成長・移出（emigration）の違いを追った（題名は "Individual differences in resource use, growth and emigration under the influence of a dominance hierarchy in fluvial red-spotted masu salmon in a natural habitat", J. Anim. Ecol. 64:75–84 と記憶。確信度: 中。**対象がヤマメ（O. masou masou）ではなくアマゴであることに注意。** 調査地・n・季節は記憶に無い）。結論の骨格は、**優位な個体ほど良い採餌位置を占めて成長が良く、劣位は移出しやすい**。(3) Hughes (1992): F-17 の通り。
- 適用範囲: PROXY: ブルックトラウト、ブラウントラウト、北極グレイリング、アマゴ（Nakano 1995。ヤマメに最も近い近縁だが亜種／種の扱いが分かれる）。
- 出典: 書誌は記憶（URL なし）。
- 証拠: [M] 検索要約なし。Nakano 1995 の調査地・結果の詳細は記憶が曖昧で、確信度は中〜低。
- 実装への含意（私の推論）: 個体サイズに応じた「位置の序列」（上流側・中央・低流速・隠れ場所の近く）を、シーン上の位置に割り当てる設計ができる。劣位の個体が下流や縁へ移る、という演出の根拠にはなるが、数値は無い。

### F-22 縄張り面積と体長の関係（Grant & Kramer 1990）
- 主張/値: Grant & Kramer (1990) は、幼若サケ科（複数種、複数河川の既報値を集めた）の **縄張り面積が体長の約 2.6 乗で増える**回帰を示し、縄張りの大きさから個体群密度の上限を予測できると論じた。式の記憶: **log10(縄張り面積, m²) = 2.61 × log10(体長, cm) − 2.83**（確信度: 中〜低。係数は要原典確認。体長が全長か尾叉長かも要確認）。この式をそのまま使った場合の **算出値（私の計算。式が正しいと仮定した場合のみ）**:

  | 体長 (cm) | 縄張り面積 (m²) | 円相当半径 (m) |
  |---|---|---|
  | 5 | 0.10 | 0.18 |
  | 8 | 0.34 | 0.33 |
  | 10 | 0.60 | 0.44 |
  | 15 | 1.7 | 0.74 |
  | 20 | 3.7 | 1.1 |
  | 25 | 6.6 | 1.5 |
  | 30 | 11 | 1.8 |

- 適用範囲: 幼若サケ科（Salmo、Oncorhynchus、Salvelinus を含むと記憶）。**PROXY: ヤマメ固有ではない。** 回帰の適用サイズ範囲（上限）は記憶に無い。体長 20 cm 以上は外挿の可能性が高い。環境（餌の量、視覚的な隔離、密度）で大きく変わることが後の研究で示された、と記憶（確信度: 低）。
- 出典: Grant J.W.A., Kramer D.L. (1990) "Territory size as a predictor of the upper limit to population density of juvenile salmonids in streams", Can. J. Fish. Aquat. Sci. 47:1724–1737（書誌は記憶）。
- 証拠: [M] 検索要約なし。**上の表は式の整合性（桁）を見るための参考で、仕様の既定値にしてはならない。**
- 実装への含意（私の推論）: 縄張り間の最小間隔（隣の個体の定位点の距離）の目安として、体長 10 cm で半径 0.4 m 程度の桁、という大きさのチェックには使える。

### F-23 闘争行動の型（Kalleberg 1958、Keenleyside & Yamamoto 1962）
- 主張/値: 幼若サケ科（大西洋サケ、ブラウントラウトなど）の縄張り闘争は、(i) **正面誇示（frontal display）**: 相手に向かって鰭を広げる、(ii) **側面誇示（lateral display）**: 体側を見せ、背鰭・胸鰭などを立てる、(iii) **突進（charge）と追跡（chase）**、(iv) **咬みつき（nip）**、(v) 並んで旋回する **circling** といった型からなる。段階的に激しくなり、多くは誇示や短い追跡で終わる（確信度: 中。型の分類の骨格のみ）。**行動の頻度（回/時）、持続時間、追跡の距離は、記憶に信頼できる数値が無い。**
- 適用範囲: PROXY: 大西洋サケ（Keenleyside & Yamamoto 1962, Behaviour 19:139–169 と記憶）、サケ科幼魚（Kalleberg 1958, Rep. Inst. Freshw. Res. Drottningholm 39:55–98）。ヤマメ（O. masou masou）の闘争の型の記載は、記憶では確認できない。r09 F-28 にも Kalleberg 1958 の書誌が出る（記憶由来）。
- 出典: 書誌は記憶（URL なし）。
- 証拠: [M] 検索要約なし。写真 70 枚（P）に闘争の場面は確認できない（F-14）。
- 実装への含意（私の推論）: 闘争は「接近 → 側面誇示（鰭を立てる）→ 突進・追跡 → 離脱」の 4 段階程度の状態にし、持続時間は短く仮置きにする。

### F-24 視覚的な隔離と密度依存（低確信度のリード）
- 主張/値: 幼若サケ科では、**個体同士が互いを見えなくなると縄張りが小さくなり、密度が上がる**（視覚的な隔離の効果）、という研究があると記憶（Imre, Grant & Keeley の仕事、2002 年前後。確信度: 低）。縄張りの大きさは餌の量と密度にも左右される（確信度: 低）。
- 適用範囲: PROXY: ニジマスなど。ヤマメは未確認。
- 出典: 書誌は記憶が曖昧で、掲載しない。
- 証拠: [M]、確信度: 低。
- 実装への含意（私の推論）: 岩・倒木のある複雑な地形では間隔を詰めてよい、という調整の理由になりうる。数値は無い。

### F-25 捕食者回避: 警報物質、凍結・隠れ、採餌の抑制
- 主張/値: (1) サケ科の幼魚は、**同種の損傷した皮膚から出る化学的な警報手がかり**に反応して、**採餌の抑制、凍結（動きを止める）、隠れ場所への退避、動き回る活動の変化**などの警戒行動を示す（Brown & Smith 1997 の「同種の皮膚抽出物がニジマス幼魚の対捕食者行動を引き起こす」と記憶。確信度: 中。書誌は曖昧）。ostariophysan（コイ科など）の "Schreckstoff" とは別の機構だが、機能は似ると考えられている（確信度: 低〜中）。(2) 魚は経験から捕食者を学習し、その後に捕食者の匂いや姿に警戒する（Kelley & Magurran 2003 の総説、Mirza & Chivers の ブルックトラウト研究を記憶。確信度: 中）。(3) **ヤマメ（O. masou masou）の警報物質反応の記載は、記憶では確認できない。**
- 適用範囲: PROXY: ニジマス、ブルックトラウトなど。
- 出典: 書誌は記憶（URL なし）。
- 証拠: [M] 検索要約なし。
- 実装への含意（私の推論）: 警戒状態（動きを止める／低い位置で定位／隠れ場所へ移動）と、そこからの回復（時間は未取得、仮置き）を状態機械に持たせる。化学的な警報はシーン内に捕食者が現れるイベントで代用できる。

### F-26 影・頭上の刺激、人への反応、回復時間（数値 Gap）
- 主張/値: 渓流のサケ科は、頭上を通過する影や急な動きに反応して逃避し、隠れ場所（岸の下、倒木、岩の陰、深み）に入る。鳥類の捕食者（日本ではサギ類、カワセミ、カワウなどが魚食性）は、頭上からの接近と水面への突入で捕食する。人が岸から近づくときの逃避開始距離（FID）は、水の濁り、人の動き、水深、魚のサイズで変わるはずだが、**数値は記憶に無い。** 逃避後に定位点へ戻るまでの時間も、記憶に信頼できる数値が無い。（確信度: 定性のみ。中〜低）
- 適用範囲: サケ科一般。ヤマメの FID・回復時間は未確認。
- 出典: なし（一般知識の記憶）。
- 証拠: [M] 検索要約なし。写真（P）に捕食者・逃避の場面は無い（p067 は釣掛かり、F-15）。
- 実装への含意（私の推論）: 逃避起動の条件は、「距離の閾値（調整値）」「頭上の影の通過」「急な動き」の OR にして、距離は体長の倍数ではなく **絶対距離（m）**で設定できるようにしておく。回復時間は、数秒〜数分の幅で調整値にする（根拠なし）。

### F-27 流れへの定位（走流性、rheotaxis）の感覚基盤
- 主張/値: 魚が流れに頭を向ける定位（rheotaxis）は、**明るい環境では視覚（周囲の移動をとらえるオプトモーター反応）が主要**で、**暗所や視覚を使えないときは側線（水流の変化）・触覚・前庭（加速度・重力）が補う**、という整理が古典（Arnold 1974 "Rheotropism in fishes", Biol. Rev. 49:515–576 と記憶。確信度: 中〜高）。盲目のメキシコ洞窟魚が側線で走流性を示した研究（Montgomery, Baker & Carton 1997, Nature 389:960–963 と記憶。確信度: 中。PROXY）。ニジマスで乱流中の側線と視覚の役割を調べた論文の題名（Liao 2006）と 2020 年の総説 "Rheotaxis revisited" の題名は、r09 が確認済み（F-09）。**結果は未取得。**
- 適用範囲: 魚一般（PROXY: 洞窟魚、ニジマス）。ヤマメ固有の記載は無い。
- 出典: 書誌は記憶。題名の確認済みのものは F-09。
- 証拠: [M]（題名のみ A、F-09）。
- 実装への含意（私の推論）: 定位は「上流を向く」を既定にし、明るさが低い場面でも向きを保つ（側線等の寄与）。流れが弱い所や無い所（水槽）では向きがばらつく。

### F-28 定位のエネルギー、岩の背後の退避、乱流の選好
- 主張/値: (1) 流れで定位する魚の遊泳コストは、**対水速度**で決まる。定位点の流速が低いほど安い（Fausch 1984 の前提、F-16）。(2) **岩・倒木・河床のくぼみの背後や側方の低流速の場所（退避所）**に定位し、近くの速い流れから餌を取る、という形が典型（Fausch 1984、Hayes & Jowett 1994 などの生息場所選択研究。確信度: 中）。(3) 乱流の選好: Cotel, Webb & Tritico (2006) "Do brown trout choose locations with reduced turbulence?" の題名を記憶。結果は **ブラウントラウトが乱流の小さい場所を選ぶ**方向だったと記憶（確信度: 低〜中）。ニジマスは乱流中で酸素消費が減る場合がある、という題名の論文（Taguchi & Liao 2011）は r09 が題名を確認済み（F-09 相当）。
- 適用範囲: PROXY: ブラウントラウト、ニジマス、大西洋サケ。ヤマメは未確認。
- 出典: 書誌は記憶（URL なし）。
- 証拠: [M] 検索要約なし。
- 実装への含意（私の推論）: 定位点の選択は、F-16 の規則（低流速＋近くの速い流れ＋隠れ場所）に、乱流が小さい場所を好む、という項を足す。岩の背後では F-07 と F-08 の挙動を使う。

### F-29 昼夜の切り替えと夜間の行動（Fraser ら 1993 ほか）
- 主張/値: **Fraser, Metcalfe & Thorpe (1993)** "Temperature-dependent switch between diurnal and nocturnal foraging in salmon", Proc. R. Soc. B 252:135–139 と記憶。大西洋サケの幼魚（parr）は、**水温が約 10℃ を下回ると、昼行性の採餌から夜行性へ切り替わり、昼は基質の間に隠れる**（確信度: 中。10℃ という閾値は要原典確認）。Fraser & Metcalfe (1997) は、夜に採餌する場合の摂餌効率が光量に依存する（暗いほど効率が下がる）ことを報告した、と記憶（"The costs of becoming nocturnal: feeding efficiency in relation to light intensity in juvenile Atlantic salmon", Funct. Ecol. 11 と記憶。確信度: 中）。**ヤマメで夜間に摂餌する頻度や、夜行性への切り替えの温度は、記憶では確認できない。** 日本の資料の記憶も不確かで、採用しない。
- 適用範囲: PROXY: 大西洋サケ parr（欧州の河川）。ヤマメ（O. masou masou）は未確認。ブラウントラウトやニジマスでは、夜間の摂餌が昼間より多い例が報告されている、という一般的な記憶もあるが、確信度は低い。
- 出典: 書誌は記憶（URL なし）。
- 証拠: [M] 検索要約なし。
- 実装への含意（私の推論）: 昼夜の行動を、水温（と光量）をパラメータにして切り替える設計ができるが、ヤマメの閾値は不明。夜間のシーンを作る場合は、動きを減らし、隠れ場所の近くで低く定位させる程度に留める。

### F-30 冬期・低水温の行動（隠れ場所への集合）
- 主張/値: 冬期（低水温）の渓流のサケ科は、**昼間は礫の隙間（インタースティシャル空間）、深い淵、倒木、アンダーカットなどの隠れ場所に入り、採餌と攻撃的行動が減る**。夜間に隠れ場所から出て移動する個体がある（Cunjak 1996, "Winter habitat of selected stream fishes and potential impacts from land-use activity", Can. J. Fish. Aquat. Sci. 53(Suppl. 1):267–282 と記憶。確信度: 中）。ニジマスが冬の隠れ場所から夜に出現する割合が光量に依存した、という研究（Contor & Griffith 1995, Hydrobiologia 299:179–183 と記憶。確信度: 低〜中）。冬期は集団で同じ隠れ場所を使う例がある、という記憶（確信度: 低）。**ヤマメでの冬期の行動（越冬場所、水温の閾値）の記述は、記憶に無い。**
- 適用範囲: PROXY: 大西洋サケ、ニジマス、ブラウントラウトなど（北米・欧州）。ヤマメは未確認。
- 出典: 書誌は記憶（URL なし）。
- 証拠: [M] 検索要約なし。
- 実装への含意（私の推論）: 低水温シーンでは、定位点を隠れ場所（礫の隙間、淵）へ寄せ、迎撃の頻度を下げ、動きを遅くする。数値は調整値。

---

## 3. 資料間の矛盾・不一致

1. **反応距離と流速:** Piccolo ら 2008（coho／steelhead 幼魚、0.29–0.61 m/s、水槽）は、流速の増加で検出距離が低下。UGA の学位論文要約（ニジマス・北極グレイリング）は、反応距離は流速の影響が小さい／ない、ただし捕獲には負の効果。→ **種、実験条件、流速範囲、測定法の違いで未解決。ヤマメは未確認。** [F-03、F-04、F-18]
2. **迎撃速度:** Piccolo ら 2008 は、全流速で最大持続遊泳速度 Vmax で迎撃。出典未特定の要約（brown trout か Chinook か O. mykiss）は、期待される最大持続遊泳速度より遅く迎撃。→ 種、野外と水槽の違いの可能性。[F-02、F-03]
3. **迎撃の向き:** 私の記憶（r09 の初版 F-25 も同様の記憶）は「上流側・側方・上下へ迎撃」。出典未特定の要約は、餌の約 2/3 を定位点より下流側で捕獲。→ **下流側が多数**の方を採用し、記憶の方は弱める。ヤマメでの割合は未確認。[F-02、F-19]
4. **生息流速と焦点流速:** 環境省資料のヤマメの生息流速 10–35 cm/s は、生息域の記述。焦点流速（定位点の流速）は一般にそれより低いと考えられる（私の推論）が、確認できる数値が無い。Kármán gait の出現流速（30–70 cm/s）は、この生息流速より速い。→ **流速の値は用途ごとに別の量なので、混同しない。** [F-01、F-08]
5. **パーマークの縄張り機能:** イワメ–アマゴ比較は縄張り維持効果をほとんど無しとする（A、PROXY）。一方、サケ科の他の体色要素（強膜色、メラニン斑）は優劣や攻撃性と関連した報告がある（帰属不確実）。→ 体色全般が無関係とは言えないが、**パーマークの動的変化を闘争信号として実装する根拠は無い。** [F-11、F-12]
6. **Nakano の論文の対象種:** 課題文は Nakano 1995 と Nakano, Fausch & Kitano 1999 を masu salmon の論文として挙げている。私の記憶では、1995 年は "red-spotted masu salmon"（アマゴ）、1999 年はオショロコマとアメマス（charr 2 種）が対象で、いずれもヤマメ（O. masou masou）ではない。→ **原典確認まで、対象種を断定せず、ヤマメには PROXY として扱う。** [F-20、F-21]
7. **課題文の書誌の混同の可能性:** 「Hughes & Dill 1990 size-based aggression」は、記憶ではモデル論文（位置選択）であり、サイズに基づく攻撃は別論文。[F-17]
8. **夜行性の閾値:** Fraser ら 1993 の約 10℃ は大西洋サケ parr の値（M）。ブラウントラウト・ニジマス・ヤマメで同じとは限らない。→ 種ごとの値が必要。[F-29]

---

## 4. 見つからなかったこと（Gaps）— 3D モデル／アニメ／行動実装に必要だが確認できなかった事項

> **全体の原因: WebSearch の上限到達（200/200）により、検索が 1 回も実行できなかった。** 以下は「存在しない」ではなく「本ストリームでは確認できていない」。

1. **課題 1（焦点流速・深さ・底上高・NREI パラメータ）:**
   - Fausch 1984、Hughes & Dill 1990、Grant & Noakes 1987、Nakano 1995、Nakano, Fausch & Kitano 1999 の **本文・抄録の内容**（全て未読）。
   - ヤマメ（O. masou masou）の **焦点流速（cm/s）、焦点の水深、底からの高さ（cm または体高比）** の実測値。
   - **反応距離 vs 魚の体長** の回帰式、**捕獲成功率 vs 距離・流速** の関数、**最大捕獲距離**（cm、または体長比）。
   - 流速が低い／高いときの定位点の変化（Piccolo ら 2008 と UGA 学位論文は、流速と反応距離で食い違う）。
2. **課題 2（捕獲の動作）:**
   - 迎撃中の遊泳速度（Vmax で迎撃という PROXY はあるが、ヤマメの Vmax が無い）。
   - 定位点への復帰時間・経路。1 時間あたりの攻撃数。
   - 餌サイズ選択の数値（餌長 vs 魚体長）。昼夜の摂餌量の違い、夜間摂餌の割合。
   - 口の開閉の時間（開口時間、吸引の速度）。これは r07（頭部・口）の担当だが、本書の行動側の情報としても未取得。
3. **課題 3（縄張り・優劣・闘争）:**
   - Grant & Kramer 1990 の **回帰式の確認**（F-22 は記憶）。ヤマメ固有の縄張り面積（体長別、季節別）。
   - 優劣の階層の安定性。闘争行動の頻度（回/時）、持続時間、追跡距離、誇示の姿勢（鰭の角度）。
   - 野外での個体間の距離（最近接個体の距離）。ヤマメの縄張り期間（季節）。
   - 日本語資料（ヤマメ・アマゴの縄張り、サクラマス幼魚の縄張り）。
4. **課題 4（捕食者回避）:**
   - 人・鳥への **逃避開始距離（FID）**、影・頭上刺激への反応の潜時、逃避の距離、隠れ場所までの距離。
   - 警報物質（ヤマメ・サクラマスでの確認）。回復時間。捕食者の種類別（サギ類、カワセミ、カワウ、ミンク、人）の反応。
   - 隠れ場所の使い方（岸のアンダーカット、倒木、岩の陰、水深）。
5. **課題 5（定位）:**
   - 走流性の感覚基盤の **結果**（Liao 2006、"Rheotaxis revisited" 2020 は題名のみ）。ヤマメ・サケ科幼魚での視覚と側線の寄与の割合。
   - 定位保持のエネルギー（酸素消費、尾の振動の振幅・周波数）の数値。低流速（10–35 cm/s）での尾の動き。
   - 胸鰭が負の揚力を作る（Arnold ら 1991）の検証結果。岩の背後での定位の実測（ヤマメ）。
6. **課題 6（冬期・低水温・夜間）:**
   - ヤマメの越冬場所・水温の閾値・夜間の行動の記述。Fraser ら 1993 の約 10℃ の確認。
   - 低水温での遊泳速度・反応の遅れ（逃避の潜時、迎撃の速度の水温依存）。
7. **その他:** 季節による行動の変化（産卵期の雄の闘争、スモルト化期の降下行動）は、本書の範囲外だが、r03（生活史・性）との接続が必要。

---

## 5. 出典一覧（URL 付き。重複排除）

> 本ストリームで新たに検索して得た URL は無い。以下は先行ストリーム（r01、r05、r09）が検索結果で得た URL の転載で、**本ストリームでは各ページの内容を確認していない。**

- 環境省（ヤマメの生息流速・河床）: https://www.env.go.jp/council/09water/y0910-03/mat03.pdf ／ https://www.env.go.jp/info/iken/h180317a/a-2.pdf （F-01）
- 島根県（アマゴの生息）: https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html （F-01）
- ドリフト捕食の時間配分（出典未特定の要約の候補）: https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river ／ https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream ／ https://cdnsciencepub.com/doi/10.1139/cjfas-2020-0398 ／ https://link.springer.com/article/10.1007/s10641-013-0187-6 （F-02、F-17）
- Piccolo ら 2008（候補）: https://research.fs.usda.gov/treesearch/31556 ／ https://research.fs.usda.gov/treesearch/31555 ／ https://link.springer.com/article/10.1007/s10641-008-9330-1 （F-03）
- UGA 学位論文: https://openscholar.uga.edu/record/3703/files/MerrittKieranMS.pdf ／ https://openscholar.uga.edu/record/20894/files/bozeman_bryan_b_201708_ms.pdf ／ https://openscholar.uga.edu/record/5581/files/Ridge%20Sliger%20Thesis%20Final.pdf （F-04）
- 魚道設計の遊泳速度: https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000055vu-att/bunryu-shiryo-13.pdf ／ https://www.aomori-itc.or.jp/_files/00230483/241-244.pdf ／ https://www.aomori-itc.or.jp/_files/00229463/212-215.pdf ／ https://www.pref.nagano.lg.jp/suisan/jigyokenkyu/documents/05b.pdf ／ https://www.pref.okayama.jp/uploaded/attachment/136414.pdf （F-05）
- 逃避の運動学: https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance ／ https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo ／ https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two?redirectedFrom=fulltext ／ https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity （F-06）
- 胸鰭の機能: https://journals.biologists.com/jeb/article-abstract/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout?redirectedFrom=fulltext ／ https://pubmed.ncbi.nlm.nih.gov/12547936 ／ https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/ （F-07）
- Kármán gait: https://pubmed.ncbi.nlm.nih.gov/15339945/ ／ https://journals.biologists.com/jeb/article/216/18/3442/11608/The-effect-of-flow-speed-and-body-size-on-Karman ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/ （F-08）
- 題名のみ確認した文献: https://pubmed.ncbi.nlm.nih.gov/17023602/ ／ https://journals.biologists.com/jeb/article/223/23/jeb223008/226046/Rheotaxis-revisited-a-multi-behavioral-and ／ https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding ／ https://journals.biologists.com/jeb/article-abstract/145/1/303/5622/Station-Holding-by-three-Species-of-Benthic-Fishes?redirectedFrom=fulltext ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC12280926 （F-09）
- FishBase（O. masou）: https://www.fishbase.se/summary/Oncorhynchus-masou.html ／ https://fishbase.se/summary/242 （F-10）
- イワメ–アマゴ（体側模様）: https://kaken.nii.ac.jp/grant/KAKENHI-PROJECT-04J09581 ／ https://mie-u.repo.nii.ac.jp/records/5636 （F-11）
- 優劣と体色: https://katalog.lib.cas.cz/KNAV/EdsRecord/edb,8520900 ／ https://ore.exeter.ac.uk/repository/handle/10036/104585?show=full ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/21900/44(1)_P22-25.pdf ／ https://orbit.dtu.dk/en/publications/emergence-time-and-skin-melanin-spot-patterns-do-not-correlate-wi/ （F-12）
- 写真カタログ: `/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json` 〜 `catalog_c07.json` （F-13〜F-15）
- 先行ストリームの文書: `/home/user/gerupamasini/docs/yamame/research/r01_morph_jp.md`、`r05_parr_pigment_en.md`、`r07_eye_head_mouth.md`、`r09_swim_transient.md`

---

## 6. 検索ログ（クエリ・mode・有用度、総検索回数）

**実行できた検索: 0 回（割当 26 回、extended 枠 4 回は未使用）。** WebSearch のセッション上限（200/200）が既に使い切られており、試行した 3 件は全て「Web search was not performed ... budget」と返った。指示どおり、そこで検索を止めた。WebFetch・curl は試していない。

| # | mode | クエリ | 結果 | 有用度 |
|---|---|---|---|---|
| 1 | standard | Fausch 1984 profitable stream positions for salmonids: relating specific growth rate to net energy gain focal velocity | 未実行（上限到達 200/200） | 0 |
| 2 | standard | Hughes Dill 1990 size-based aggression and dominance in juvenile chinook salmon drift feeding reaction distance model | 未実行（同上） | 0 |
| 3 | standard | Nakano Fausch Kitano 1999 masu salmon Dolly Varden drift feeding territory foraging mode shift stream | 未実行（同上） | 0 |

本書の作成に使った、検索以外の情報源:
- 先行ストリームの文書（r01、r05、r07、r09）の読み込み。Part A に転載（検索結果の URL と要約は、各文書の記録のまま）。
- 写真カタログ 70 枚（catalog_c01〜c07.json）のローカル集計（Part B）。
- 私の記憶（Part C。全て M）。

**次回、検索予算が使える場合の優先クエリ（未実行。優先順）:**
1. `Hughes Dill 1990 position choice drift-feeding Arctic grayling reaction distance prey length fish length regression` （allowed_domains: cdnsciencepub.com, pubmed.ncbi.nlm.nih.gov）
2. `Fausch 1984 profitable stream positions salmonids net energy gain focal point velocity capture` 
3. `Grant Kramer 1990 territory size predictor upper limit population density juvenile salmonids log territory size body length`
4. `Nakano 1995 dominance hierarchy red-spotted masu salmon emigration growth natural habitat`
5. `Nakano Fausch Kitano 1999 flexible niche partitioning foraging mode shift stream-dwelling charrs`
6. `ヤマメ 縄張り 体長 面積 追い払い 攻撃 頻度` ／ `ヤマメ 定位 流速 cm/s 水深 底からの高さ 潜水観察`
7. `trout flight initiation distance human approach stream` ／ `salmonid overhead shadow response startle bird predator simulated`
8. `juvenile salmonid chemical alarm cue skin extract rainbow trout antipredator` ／ `masu salmon alarm substance`
9. `Fraser Metcalfe Thorpe 1993 temperature-dependent switch diurnal nocturnal foraging salmon` ／ `Cunjak 1996 winter habitat stream fishes`
10. `Liao 2006 lateral line vision rainbow trout turbulent flow kinematics hydrodynamic preference` ／ `Rheotaxis revisited multisensory fish orient flow`
11. `ヤマメ 冬 越冬 淵 夜間 行動 水温` ／ `サクラマス 幼魚 越冬 隠れ場所`
