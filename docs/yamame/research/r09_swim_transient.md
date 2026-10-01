# 過渡的運動（C-start・捕食ストライク・旋回・加減速・定位保持）— サケ科／ヤマメ（O. masou masou 河川型）の文献・写真調査 — r09

> 作成: ストリームR09（過渡的運動担当）。**第2版（検索あり）**。目的はヤマメ3Dモデルの遊泳アニメーション（C-start、捕食突進、旋回、加減速、定位保持）と行動モデルの仕様根拠収集。
>
> **この文書を使う前に必ず読むこと（調査の限界）**
> 1. **版の履歴**: 初版は WebSearch 上限到達のため検索 0 件（記憶 M と写真 P だけ）で書かれた。今回の第2版で **WebSearch を 26 回（standard 25 + extended 1）実行**し、Part D（F-31〜F-49）を追加した。Part A（F-01〜F-08）と Part B（F-09〜F-17）は初版のまま。Part C（F-18〜F-30）は初版の本文を残し、各項に「更新（第2版）」行を足して、検索で裏取りできた点と修正した点を示した。
> 2. **情報源の性質**: WebSearch が返すのは「題名・URL・モデルが作った要約」だけで、**論文の全文・表・図は一度も読んでいない**。Part D の数値は、要約に明示されていた抄録レベルの記述に限った。要約に数値が無かった項目（Domenici & Blake 1997 の表、Webb 1978、Webb & Fairchild 2001 の旋回値など）は採用せず、Gap にした。要約中の誤植らしき表記（例: Webb 1983 の「0.18 ± 0.2L」）は、そのまま記して疑義を注記した。
> 3. **ヤマメ（O. masou masou）の過渡的運動を直接測った資料は、26 回の検索でも 1 件も出なかった。** 確認できた数値は全て **PROXY**（主にニジマス Salmo gairdneri = O. mykiss の実験室データ。ほか coho／steelhead 幼魚、ブラウントラウト）。水温、飼育条件、n、各群の体長は要約に無いことが多い。刺激も電気刺激（Webb 1976）や活餌への攻撃（Webb 1983）で、野外のヤマメの行動そのものではない。
> 4. **出典未特定の要約**: 検索要約には、どの論文の記述か特定できないものがあった（F-33、F-35、F-40、F-41、F-43）。これらは注記を付け、ランクを下げるか「参考扱い」とした。
> 5. 「派生」「算出」と書いた値は、資料の値から私が換算したもので、資料に書かれた値ではない。写真由来の件数・角度は注釈者（AI）の目視推定である。
> 6. **証拠ランク**: A=査読論文・学術書・総説で、検索要約に数値/記述が明示（出典未特定のものは注記）／B=公的機関資料・学位論文など／C=出典不明の要約、釣りメディア、C(P)=写真注釈の集計（Part B は初版どおり P 扱い）／M=記憶（未検証）。PROXY は scope に明記。

---

## 1. 要約（仕様に直結する結論）

> 1〜2 は到達度、3〜9 は逃避・旋回、10〜11 は捕食、12〜16 は鰭・定位・加減速、17〜19 は補足と未解決。**ヤマメの値ではなく、ニジマス中心の PROXY** である点に注意。

1. **ヤマメ（河川型）の C-start・捕食ストライク・旋回・定位保持を直接測った資料は、検索 26 回でも見つからなかった。** 確認できた数値は全て PROXY（主にニジマス）。仕様では「ニジマス実測に基づく暫定値」と明記し、差し替え可能なパラメータとして持つこと。[F-31, F-32, F-37, §4]
2. **高速スタート（逃避と摂餌ストライクを含む）の段階構造**: Stage 1（準備: 体が C 字または S 字に屈曲）→ Stage 2（推進: 加速）→ Stage 3（可変: 継続遊泳・制動・滑走）。状態機械で実装する構造は文献で裏付けられた（初版の M を A に引き上げ）。[F-36]
3. **ニジマスの高速スタートは 2 型**: **L／C 型**（体を L・U・C 字に曲げ、反動旋回を伴う。加速度の時系列は単峰）と **S 型**（S 字、旋回なしで加速。二峰）。**初版の「S-start はカワカマス類に典型で、トラウトの逃避は C 系」という記憶は修正が必要**で、S 型もトラウトで記録されている。[F-31, F-32]
4. **継続時間**: 主加速段階の継続時間は、全長 9.6–38.7 cm の 7 群で **0.07 s（最小群）〜0.10 s（最大群）**、体長とともに増加（Webb 1976、電気刺激）。逃避全体の継続時間は、ニジマス（平均 0.32 m）で最大 0.134 s（Harper & Blake 1990）。定義が違うので同じ尺度で比べないこと。[F-31, F-32]
5. **加速度**: ニジマス（平均 0.32 m）の平均最大加速度は **59.7 ± 8.3 m/s²**（皮下加速度計、Harper & Blake 1990）。Webb 1976 は「加速度は体サイズに依存しない」。出典未特定の値（最大 97.8 m/s²、平均 34.38 m/s²）も要約に出たが参考扱い。[F-31, F-32, F-33]
6. **最小旋回半径は 0.17 L（Webb 1976、高速スタート、L 型・S 型とも）／0.18 L（Webb 1983、25.7 cm のニジマスが活餌ミノーを攻撃）**。smallmouth bass は 0.11 L。速度・加速度に依存しない。これは**限界性能の最小値**で、通常遊泳の旋回半径ではない（解釈）。初版の M「0.1〜0.3 L」と矛盾しない。[F-31, F-37]
7. **潜時**: 最小潜時は **5–20 ms でサイズに依存しない**（総説の要約。どの総説か特定不能）。ヤマメの値、水温別の値、視覚的接近への潜時は未取得。[F-35]
8. **サイズ依存の向きは発育段階で逆**: 稚魚〜成魚（Webb 1976 の 9.6–38.7 cm）では継続時間が体長とともに増える（体長が約 4 倍で継続時間は約 1.4 倍。比例ではない。派生）。孵化直後〜卵黄吸収終了のサケ科（chinook、coho、brown trout）では継続時間が短縮して卵黄吸収終了時に最小となり、Stage 2 の移動距離は全長に比例する（Hale 1999）。parr〜成魚は前者の範囲。[F-31, F-34]
9. **体の曲がりの位相**: 高速スタート中、体軸の曲率は筋の短縮より遅れる（0.4 L と 0.7 L の位置で計測）。屈曲は筋トルクと流体抵抗の相互作用で決まる。アニメーションに「筋入力 → 曲率の遅れ」を入れる根拠になる。[F-38]
10. **ドリフト捕食の時間配分と幾何（出典未特定の要約）**: 定位点に留まる時間が大半（平均 81%）、能動的な採餌は観察時間の 14%。餌の約 2/3 は**定位点より下流側**で捕獲され、迎撃速度は期待される最大持続遊泳速度より遅かった。初版の「上流側へ迎撃」という M の想定を弱める。[F-41]
11. **反応距離と流速は文献で食い違う**: coho／steelhead 幼魚（流速 0.29–0.61 m/s）では、捕獲確率と検出距離が流速増で低下し、迎撃速度は流速・種に依らず最大持続遊泳速度 Vmax [F-42]。ニジマス・北極グレイリングの学位論文では、反応距離は流速の影響が小さい／ない [F-43]。**ヤマメの攻撃開始距離、口の開き、復帰時間、最大追跡距離の数値は未取得**。
12. **胸鰭はニジマスで定位・旋回・制動・ホバリングに使い分けられる**。低速・ホバリングでは胸鰭が渦を放出し、前進時に主に横向きの伴流（補正力）を作る。旋回では外側の鰭を回して横向きの力を作り、内側の鰭は後方へ推力を向ける（この記述の一部は bluegill との比較）。[F-44]
13. **乱流下の定位保持（円柱後流）**: 制動時は胸鰭を体から離して**持続的に**張り出し（外転筋・内転筋の両方が活動）、Kármán gait 中は胸鰭の**一過的な**展開・収納で横方向の体の動きを制御する（展開の半分超は筋活動なし）。[F-45]
14. **Kármán gait の運動学**: 大きな横振幅、長い体波長、低い尾びれ周波数（渦放出周波数に同期・ほぼ一致）、尾端の振幅は自由流の約 3 倍。出現確率は流速 30–70 cm/s で最大（ヤマメの生息流速 10–35 cm/s より速い範囲の実験）。尾端の横振幅は渦の横間隔の約 1.5 倍、体中心の振幅は約 70% 小さい。[F-46, F-47, F-01]
15. **「胸鰭で負の揚力を作り底に押し付ける」は仮説として広く提案され、Arnold ら 1991 が検証した論文だが、検証結果の記述は取得できなかった。** 採用不可（仕様では「仮説」と書く）。[F-48]
16. **バースト&コースト**: 理論でエネルギー節約（50% 超の予測）。コイ（koi）の実測で約 45%。サケ科での使用頻度は未取得なので、既定は無効寄り。日本の魚道設計の一般値では、突進速度は体長の約 10 倍／s、巡航速度は 2–3 倍／s（ニジマスで 4.7 と 9.3、B/C、出典文書は特定不能）。[F-39, F-40]
17. **写真（C(P)）の所見は初版のまま有効**: 水中の自由遊泳・定位で背鰭が立つ例が多い（19 枚中 13 枚）、胸鰭は広げる／畳むの両方、体はほぼ直線〜わずかな湾曲で強い湾曲は 1／23 枚。文献の「定位・低速で胸鰭・腹鰭・背鰭を使う」と矛盾しない。[F-10, F-11, F-12, F-16]
18. **水族館の写真は定位・群れの根拠にしない**（高密度の水槽）。[F-17]
19. **数値が確定できない主要項目**（§4）: Stage 1 と Stage 2 を分けた継続時間、Stage 1 終了時の屈曲角、逃避の移動距離、旋回角度の分布と away 応答の割合、ストライク開始距離・口の開き・復帰時間、最大追跡距離、胸鰭制動の減速時間、定位時の尾の微小振動、自発的な加減速の時間スケール。

---

## 2. Findings

> **Part A（F-01〜F-08）: 継承した文献記述（運動・体型に関係するもの）。初版のまま。** 私は原典・元の検索結果を再確認していない。
> **Part B（F-09〜F-17）: 写真注釈カタログの集計 C(P)。初版のまま。**
> **Part C（F-18〜F-30）: 記憶 M。初版の本文を残し、各項末尾に「更新（第2版）」を追加。**
> **Part D（F-31〜F-49）: 第2版の検索で得た文献記述（検索要約）。** 本書の数値の主な根拠。

---

### Part A — 継承した文献記述

### F-01 河川型ヤマメの生息流速（定位流速の上位参照）
- 主張/値: ヤマメは流速 10〜35 cm/s、粒径 0.5〜5.0 cm の礫底の渓流環境に生息する（環境省資料）。同じ結果集合でアマゴは流速 15 cm/s・水深 10〜30 cm、夏期最高水温 25℃以下の渓流（島根県）。
- 適用範囲: ヤマメ（河川型）。サイズ・季節・「生息流速」が局所流速か平均流速かは要約に無い。定位点の焦点流速（focal velocity）を示す値ではない可能性が高い（私の解釈）。
- 出典: 環境省資料／島根県水産資料。（継承: r01 F-32）
  - https://www.env.go.jp/council/09water/y0910-03/mat03.pdf
  - https://www.env.go.jp/info/iken/h180317a/a-2.pdf
  - https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html
- 証拠: [B] "Yamame ... inhabits stream valleys at flow velocities of 10-35 cm/s in gravel beds with pebbles of 0.5-5.0 cm diameter"（先行ストリームが記録した要約）。

### F-02 サケ科 O. masou の「太い尾柄」と腹鰭条数
- 主張/値: Christie (1970) のまとめによる O. masou の特徴として、細かい黒点、**太い尾柄**、腹鰭条数が少ない（大半が10）、幽門垂が少なく短い（35〜68、平均47.05）、鰓耙が少ない（16〜22、大半が18〜19）。
- 適用範囲: 日本産サケ科（サクラマス/アマゴ）を北米向けに概説した報告。ヤマメ（河川型）に限定した値ではない。「太い」の基準（他種との比較か、%SL か）は要約に無い。
- 出典: W.J. Christie (1970) "A Review of the Japanese Salmons Oncorhynchus masou and O. rhodurus with Particular Reference to Their Potential for Introduction into Ontario Waters", Research Information Paper (Fisheries) No. 37, Ontario。（継承: r02 F-05）
  - https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf
- 証拠: [A] "fewer ventral fin rays (mostly 10), shorter and less numerous pyloric caeca (35-68, mean 47.05), and a small number of gill rakers (16-22, mostly 18-19)"（先行ストリームの要約。表そのものは未確認）。

### F-03 大型ヤマメが幼魚的な尾柄高・鰭の大きさを残す
- 主張/値: 大型のアマゴ・ヤマメは降海型に似るが、**尾柄高・鰭の大きさ・鱗のパターンに幼魚の特徴を残す**。ヤマメは2+歳以上で約300 mmに達し、サクラマスより成長が劣る。体が大きくなるとパーマークは消える。
- 適用範囲: アマゴ・ヤマメ（河川・ダム湖の大型個体、福井県ほか）。
- 出典: Kato F. (1991)「大型アマゴ・ヤマメの形態及び生態に関する知見」水産増殖 39(3):279–288。（継承: r01 F-14）
  - https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/
- 証拠: [A] "they retain juvenile characteristics in caudal peduncle height, fin size, and scale patterns compared to anadromous forms"（先行ストリームの要約）。
- 運動への含意（私の推論）: 尾柄高と鰭面積は推進・加速に関わるはずだが、値が無く、定量に使えない。

### F-04 尾鰭の形（切れ込み）
- 主張/値: タイワンマス成魚の尾鰭は**浅い二叉**で等尾型（PROXY）。一方、先行ストリームは記憶（M）として「幼魚の方が切れ込みが深く、成魚で浅くなる傾向」を記録している。
- 適用範囲: PROXY: O. m. formosanus（成魚のみ）。幼魚の切れ込みはヤマメ・タイワンマスとも資料が無い。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://www.fishbase.se/summary/16686 （継承: r02 F-03）。記憶部分は r01 F-33（出典なし）。
- 証拠: [B] "The caudal fin displays a shallow fork and is homocercal in adults"（成魚の記述）。幼魚が深いという点は [M]。
- 矛盾: §3-1 を参照（写真 p049 の parr の切れ込みは約5% SL と浅い）。

### F-05 ブラウントラウトの正中鰭位置と体高（運動学の幾何の参考）
- 主張/値: ブラウントラウト（N=138、平均SL 160.6 mm）の対SL比。背鰭起点の体高=23.9%、臀鰭起点の体高=17.8%、臀鰭前長=76.4%、腹鰭前長=55.2%、背鰭前長=47.6%。頭長・眼径・尾柄高は表が途切れて取得できず。
- 適用範囲: PROXY: Salmo trutta。幼若〜若魚サイズ。どの個体群かは要約に無い。ヤマメの値ではない。
- 出典: https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T3.html （継承: r02 F-18）
- 証拠: [A] "body depth at the origin of the dorsal fin measuring 23.9% of standard length ... Preanal length averaged 76.4% of standard length, prepelvic length averaged 55.2%, and predorsal length averaged 47.6%."
- 運動への含意（私の推論）: 腹鰭が SL の約55%、背鰭起点が約48%という配置は、重心周りの旋回・ピッチ制御で鰭の位置を決める際の参考になる。ただし PROXY で、ヤマメの数値ではない。

### F-06 流線形の度合いと最大代謝率・持続遊泳能力（PROXY）
- 主張/値: ブラウントラウトの1歳・2歳幼魚で、体型が細長い形から体高の高い形へ個体発生的に変わる。より流線形の体型は最大代謝率が高く、持続遊泳能力に影響する。幾何学的形態測定（GM）を使用。
- 適用範囲: PROXY: Salmo trutta 幼魚。種内・種間の両方で成り立つとの要約。
- 出典: Sánchez-González J.-R., Nicieza A.G. (2023) Current Zoology 69(3):294–303。（継承: r02 F-20）
  - https://portalinvestigacion.uniovi.es/documentos/64b4eec52107cd1e6d71b7fe
- 証拠: [A] "a more streamlined body shape displayed higher maximum metabolic rates than a deep-bodied shape at both intraspecific and interspecific levels"。
- 注意: 持続遊泳（代謝）に関する結果であり、C-start など短時間の爆発的運動の性能とは別。

### F-07 飼育・放流由来の体型・鰭の違い（個体差軸の候補）
- 主張/値: (a) 飼育 vs 野生のギンザケ成魚: 飼育魚は性的二形が大きく減少し、頭が小さく吻の曲がりが弱く、体幹が深く、**尾柄が大きく、背鰭が短く**、流線型が低下する。孵化場に水流が無いことが主因と指摘。(b) 埼玉県のヤマメ: 放流魚（養殖魚）は天然魚に比べ色彩が薄く体型が丸く、鰭が欠ける傾向。10月放流魚は体色・体型とも天然魚に近い。(c) 飼育由来のブラウントラウトは野生由来より頭が短く流線形が弱い（候補出典のいずれかの要約）。
- 適用範囲: (a) PROXY: O. kisutch 成魚。(b) ヤマメ（成魚放流・埼玉県）。(c) PROXY: S. trutta。
- 出典: （継承: r01 F-21, r01 F-20, r02 F-23）
  - https://link.springer.com/article/10.1023/A:1007646332666
  - https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5551095/ ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/
- 証拠: (a) [A] "Captively reared coho salmon adults were differentiated from wild fish by sharply reduced sexual dimorphism, smaller heads and less hooked snouts, increased trunk depth, larger caudal peduncles, shorter dorsal fins"。(b) [B] 「放流魚（養殖魚）は天然魚に比較して、色彩も薄く、体型も丸いなど」。(c) [A] "reared in hatcheries have shorter heads and are less streamlined compared with individuals from natural rearing habitat"（帰属は候補のいずれか）。
- 運動への含意（私の推論）: 個体差生成で「放流由来の個体」を作るなら、丸い体・欠けた鰭・やや低い遊泳持久力、という方向の組み合わせが根拠のある変異。ただし性能への定量効果は未確認。

### F-08 成長に伴う体型の変化（parr は深い体、smolt は細身／頭の相対サイズ）
- 主張/値: (a) サケ科の渓流の幼魚（parr）は深い体でパーマークが顕著、スモルトはパーマークを失い銀化し、より細身になる（一般則）。マスでは Kubo が少なくとも5型以上の parr 型を認めた。マスのスモルトは平均 FL 110〜130 mm。(b) ニジマス幼魚（0.6〜10.9 g）の予備的結果として、大きくなるほど頭が相対的に小さくなり、胴の中央部は等成長を示す。
- 適用範囲: (a) サケ科一般＋マス（引用元は Mighell 1978 / McCormick らが混在し特定不能）。(b) PROXY: O. mykiss 飼育幼魚。学会要旨で査読論文ではない。
- 出典: （継承: r01 F-31, r02 F-19）
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ （近傍）
  - https://sicb.org/?p=36638
- 証拠: (a) [C] "Stream-dwelling juveniles are deep-bodied and have prominent parr marks, while smolts ... a more slender body form"。(b) [A] "as the fish becomes larger, the head becomes proportionally smaller, although the mid-section of the fish shows isometric growth"（学会要旨）。
- 運動への含意（私の推論）: 成長段階で体の細長さが変わるので、屈曲の剛性・波長・尾柄の細さを、サイズ・段階に連動させる余地がある。値は無い。

---

### Part B — 写真注釈カタログの集計 C(P)（水中23枚）

> **共通の注意（F-09〜F-17）**
> - 対象は `catalog_c01〜c07.json` の水中23枚（`context` が `in_water_natural` 12 + `aquarium` 11）。私は画像を見直しておらず、JSON の注釈者（AI）の目視記述だけを読んだ。
> - 注釈の信頼度は、照明・水膜・ガラス越し・被写界深度で低い（`lighting_and_color_reliability` は多くが low）。
> - 種同定の確信度が低いものを含む（p005: unclear 0.4、p026: yamame 0.45、p027: char_iwana_type 0.9 でヤマメではなくイワナ類 = PROXY）。ヤマメ（確信度0.5以上）として扱えるのは p006, p007, p014, p016, p017, p018, p023, p028, p029, p036, p040, p041, p042, p049, p054（p015 は複数種の混在）。
> - すべて静止画の1フレーム。運動の位相・速度・流向は不明。

### F-09 サンプルの範囲と除外
- 主張/値: 水中23枚のうち、釣獲後に水中へ置いた・水膜下に平置き・掛かった状態の4枚（p011, p019, p070, p067）は遊泳姿勢の参考にならないので除外した。残り19枚（p005, p006, p007, p014, p015, p016, p017, p018, p023, p026, p027, p028, p029, p036, p040, p041, p042, p049, p054）を姿勢の観察に使う。生活史段階は parr 10、juvenile 3、adult_nonspawning 3、unknown 3。
- 適用範囲: 日本国内の釣り・ブログ・水族館・図鑑サイトの写真。parr が多く、成魚は p006・p028・p042 の3枚のみ。水族館（飼育・高密度）が11枚あり、野外の行動を代表しない可能性が高い。
- 出典: 写真カタログ `catalog_c01〜c07.json`。主な source_url は次の通り（各 ID の元ページ）。
  - p005, p007: https://www.ana.co.jp/travelandlife/article/001841/
  - p006: https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol63.html
  - p014: https://ameblo.jp/hiyokomushi2/entry-12076486309.html
  - p015: https://note.com/kitasato_labo/n/n13a42411146a
  - p016: https://www.hitoumi.jp/zukan/fish/190712092542.php
  - p017: https://plaza.rakuten.co.jp/nekomac/diary/202506270002/
  - p018: https://www.gao-aqua.jp/blog/18889.html
  - p023: https://ameblo.jp/sagaminotsurisi/entry-12887824774.html
  - p026: https://ameblo.jp/sagaminotsurisi/entry-12846341589.html
  - p027: https://mandokuselife-archives.hatenablog.com/entry/afda9416d2e9b0c7e784190ff76882f1
  - p028, p040, p041, p042: https://tonysharks.com/Tree_of_life/Eukaryote/Opisthokonta/Yamame/Yamame.html
  - p029: https://www.parks.or.jp/suizokukan/guide/001/001082.html
  - p036: https://mizubesin.hatenablog.com/entry/2014/05/21/222020
  - p049: https://www.gao-aqua.jp/animal/29487.html
  - p054: https://ameblo.jp/oshoro123/entry-12528849856.html
  - 除外: p011 https://web.tsuribito.co.jp/suburb/trbt1804yamame02 ／ p019 https://web.tsuribito.co.jp/suburb/keiryu-trbt-201904-seitai-01 ／ p067 https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol80.html ／ p070 https://ameblo.jp/alpschar/entry-12676680182.html
- 証拠: [C(P)] 写真注釈の集計（私の目視ではなく、カタログの記述に基づく）。

### F-10 背鰭は水中の自由遊泳・定位で立っている例が多い
- 主張/値: 19枚のうち、背鰭が立つ（高く立つ・直立・後傾して立つ・高い三角形）と記述されたのは13枚（p005, p006, p014（A魚）, p016, p017, p018, p023, p026, p029, p040, p042, p049, p054）。畳まれて低いのは p041 の1枚。残り5枚（p007, p015, p027, p028, p036）は判別できない。
- 適用範囲: parr 主体（上記 F-09）。速度・加速度は不明。成魚は p006, p042 で背鰭が立つ。
- 出典: 写真カタログ（F-09 の各 URL）。
- 証拠: [C(P)] 例 p049: 「背鰭は立て(高さ約110px)、脂鰭は寝かせる」、p041: 「背鰭は畳んだまま」。
- 含意（私の推論）: 定位・低速遊泳の既定姿勢は「背鰭を立てる」。畳む状態も存在するので、逃避・高速時・休息時の切り替えを持たせる余地がある。

### F-11 胸鰭の姿勢は「広げる」と「体側に添える」の両方があり、低速・底近くで広げる傾向（弱い）
- 主張/値: 胸鰭を**広げる・下後方へ伸ばす・扇状に開く**: p005, p006, p014（A魚）, p016, p018, p026, p054（垂れて展開）の7枚。**体側に添える・畳む・半開**: p014（B魚）, p023（A魚）, p028（A魚）, p029, p040, p041, p042, p049, p027（イワナ類）の9枚。**垂れる**: p007。判別不能: p015, p017, p036。
  - 広げているフレームには、底近くでゆっくり定位（p005, p006, p026, p054）、他個体との近接（p016）、上昇中の並走（p014A, p018）が多い。
  - 体側に添えているフレームには、水平の巡航的な遊泳（p029, p040）、水平の低速遊泳（p041, p042, p049）が多い。
- 適用範囲: parr・juvenile 主体。流速・遊泳速度は写真から分からない。**単一フレームで因果は言えない。**
- 出典: 写真カタログ（F-09 の各 URL）。
- 証拠: [C(P)] 例 p005: 「胸鰭を大きく広げて下後方へ」、p040: 「胸鰭は体側に沿って畳まれ…尾鰭は広く展開」。
- 含意（私の推論）: 「低速・定位・制動では胸鰭を開き、巡航では畳む」という仮説と矛盾しない。ただし仮説であり、Part C の F-28（M）と合わせて原典で検証すること。

### F-12 腹鰭・臀鰭は、低速・定位でやや下方に開く例が多い
- 主張/値: 腹鰭・臀鰭が下方へ軽く開く・広げる: p014（A魚）, p016, p018, p023（A魚）, p041, p042, p049, p054 の8枚。閉じ気味: p027（イワナ類）, p028, p040 の3枚。半ば閉じる: p005。
- 適用範囲: F-11 と同様。
- 出典: 写真カタログ（F-09 の各 URL）。
- 証拠: [C(P)] 例 p049: 「腹鰭・臀鰭は下方へ軽く開いて安定を取る」（注釈者の解釈を含む）、p040: 「腹鰭は閉」。
- 含意（私の推論）: 低速・定位の姿勢で腹鰭・臀鰭を開く、速度が上がると閉じる、という切り替えを持てる。

### F-13 尾鰭は広げる／畳むの両方の状態が見える
- 主張/値: 尾鰭が広く開く・扇状に広がる: p016, p018, p026, p029, p040, p049 の6枚。畳まれて細い刃状に見える: p005, p007, p027 の3枚。体軸から約35°下方へ垂れる: p054（暗い淀みで定位）。残りはぼけ・枠外・遮蔽で判別不能。
- 適用範囲: F-11 と同様。尾鰭が畳まれて見える p005 は、側面像ではなく向きの違いの可能性もあると注釈にある。
- 出典: 写真カタログ（F-09 の各 URL）。
- 証拠: [C(P)] 例 p007: 「尾鰭は畳まれる」（強い湾曲・方向転換直後と推測されるフレーム）、p054: 「尾柄から尾鰭が腹側へ約35度下垂」。
- 含意（私の推論）: 尾鰭の開閉（有効面積）は、速度・加速で変わる制御パラメータとして持てる。

### F-14 底からの高さと接底
- 主張/値: 底（礫・岩）から魚体下縁までの高さ（注釈者の px 見積もり、体高比）: p026 約0.25体高、p005 約0.7体高、p036 約1体高、p040 約1体高、p014 約1体高、p023 の個体B 約1体高以内。p049 は腹が岩の上端に接する程度。p017 は礫の上に腹をつけて休止し、胸鰭と腹鰭を下へ押し付けて体を支える。p023 の個体A は暗い流木・岸際近くの上層で定位。
- 適用範囲: parr・juvenile 主体。水深・流速は不明。水族館の底は砂礫の人工環境を含む。
- 出典: 写真カタログ（F-09 の各 URL）。
- 証拠: [C(P)] 例 p017: 「礫の上に腹をつけて休止、体は直線でほぼ水平。胸鰭と腹鰭を下へ押し付けて体を支える」。
- 含意（私の推論）: 定位点の高さを、底から 0〜1 体高の範囲（休息は接底）に置く、という初期設定は写真と矛盾しない。ただし根拠は少数枚で、流速との関係は不明。

### F-15 ピッチ（頭の上げ下げ）
- 主張/値: 頭上げ: p005 約5°、p018 約14〜18°（2尾が並走して上昇）、p014（A魚）約20〜30°（B魚は水平）、p028 約25〜55°（2尾が斜め上向き）、p054 頭をやや上向き（尾柄から尾鰭が腹側へ約35°垂れる）。頭下げ: p026（頭を下げて礫際へ向ける）、p049（やや頭下げ）、p015 の T1（わずかに頭下がり）。水平: p029, p041, p015 の F魚。p040 は水平〜軽い頭上げ。
- 適用範囲: 水族館（ガラス面近く）の上昇フレームが多く、野外のライズ行動を代表するか不明。
- 出典: 写真カタログ（F-09 の各 URL）。
- 証拠: [C(P)] 例 p018: 「2尾が同方向(右)を向き、頭を上にして14-18度で並走して上昇」。
- 含意（私の推論）: ピッチは 0°を中心に、捕食・ライズ・底の採餌で±数十°まで動く、というレンジ設計の参考。数値は仮置き。

### F-16 体の湾曲の頻度
- 主張/値: 水中23枚（F-09 で除外した4枚を含む）の `body_straightness` は、ほぼ直線（straight）10、わずかに湾曲（slightly_curved）12、強く湾曲（strongly_curved）1（p007）。70枚全体では straight 31、slightly_curved 37、strongly_curved 2。
  - 湾曲が目立つ水中フレーム: p007（水面近くで右上へ強く湾曲、同心円の波紋から捕食（ライズ）直後または方向転換と注釈者が推測。推定）、p006（浅瀬で定位しながら尾部が左上へ振れる）、p016（尾柄がわずかに下方へ湾曲し尾鰭がねじれて見える。旋回の開始か方向転換の可能性、推定）、p018（並走して上昇、体が軽く弓なりに撓む）、p026（尾部がカーブし、ゆっくりした定位動作に見える）。
- 適用範囲: 静止画。湾曲の大きさ（曲率・角度）の定量は無い（p070 は水膜下に平置きで約25〜45°だが除外対象）。
- 出典: 写真カタログ（F-09 の各 URL）。
- 証拠: [C(P)] 例 p007: 「体は右上へ強く湾曲し尾柄が上へ曲がる」。
- 含意（私の推論）: 定位・低速では体はほぼ直線〜わずかな湾曲、強い湾曲は短い過渡的運動に限られる、と設計して矛盾しない。

### F-17 水族館での個体間距離と向き（野外の根拠にしない）
- 主張/値: p016 は近接個体と鼻先がほぼ接触（距離ほぼ0）、p018 は並走する2尾の距離が体長の約1/3、p028 は個体間距離が約0.3〜0.5体長、p029 は約0.5〜1体長、p023（自然水中）は小群で0.1〜0.5体長。頭の向きは、p014, p015, p018, p023, p028 で同方向の個体が多い。p015 は水槽内の流れへの定位の可能性があるが、流れは写真から確認できない。
- 適用範囲: 高密度の水槽（p014〜p018, p027〜p029, p041, p042, p049）と、釣獲後の小群（p023）。**縄張り行動や野外の個体間距離の根拠にはならない。**
- 出典: 写真カタログ（F-09 の各 URL）。
- 証拠: [C(P)] 例 p016: 「左端に別個体の頭が写り、鼻先が主魚の鼻先とほぼ接触する(個体間距離ほぼ0)」。
- 含意: 縄張り・間隔の設計は行動ストリームの文献で決める。ここでは使わない。

---

### Part C — 記憶 M（未検証）

> **共通の注意（F-18〜F-30）**
> - 本文は初版（検索なし）のまま残した。**第2版の検索で裏取りできた点・修正した点は、各項末尾の「更新（第2版）」と Part D（F-31〜F-49）を見ること。** 出典欄の文献は「記憶に基づく検証用リード」で、書誌（著者・年・誌名・巻頁）の細部に誤りがありうる。URL は付けていない（確認できた URL は Part D と §5 にある）。
> - 確信度（高・中・低）は私の記憶の自己評価。数値は「桁の目安」で、ヤマメ河川型の値ではない。
> - 仕様に採用する場合は、「根拠なしの仮置き」と明記し、原典に置き換えること。

### F-18 高速スタート（fast-start）の3段階の枠組み
- 主張/値: 魚類の逃避の高速スタートは、**Stage 1（準備段階: 体が C 字（または S 字）に屈曲する。変位は小さい）→ Stage 2（推進段階: 反対側へ屈曲して水を後ろへ押し、主な加速を生む）→ Stage 3（可変: 連続遊泳・滑走・2回目の屈曲など）**に分けられる。C 字の屈曲は、頭部と尾部の角度差が大きい形。
- 適用範囲: 条鰭類一般（トラウトを含む）。段階の定義（特に Stage 3 と、Stage 1 の終わりの定義）は著者で揺れる（§3-2）。
- 出典（検証用リード、URL なし）:
  - Weihs D. (1973) "The mechanism of rapid starting of slender fish." Biorheology 10:343–350.
  - Domenici P., Blake R.W. (1997) "The kinematics and performance of fish fast-start swimming." J. Exp. Biol. 200:1165–1178.
  - Domenici P., Hale M.E. (2019) "Escape responses of fish: a review of the diversity in motor control, kinematics and behaviour." J. Exp. Biol. 222:jeb166009.
- 証拠: [M] 検索要約なし（記憶）。確信度: 高（用語と3段階の骨格）、中（各段の定義の細部）。
- 更新（第2版）: 3 段階の枠組み（Stage 1 準備＝C／S 字に屈曲、Stage 2 推進、Stage 3 可変）は、Domenici & Blake 1997 の検索要約で確認した（F-36、**A に更新**）。同論文が逃避と摂餌ストライクの両方を扱うことも確認。Domenici & Hale 2019 は総説として存在を確認（F-35）。Weihs 1973 は未検索。

### F-19 C-start と S-start、サケ科の使い分け
- 主張/値: 高速スタートは、体が C 字になる **C-start**（逃避に典型）と、体が S 字になってから突進する **S-start**（待ち伏せ捕食者の捕食ストライクに典型）に分けられる。S-start はカワカマス類（Esox）の捕食で報告された型。ニジマスは C-start 系の逃避で研究され、カワカマスとの比較研究がある（Harper & Blake 1990）。**ヤマメ・サケ科のドリフト捕食（小さな流下餌の迎撃）が、高速スタートに分類される運動かどうかは、記憶では確認できない。**
- 適用範囲: 条鰭類。ヤマメ固有ではない。
- 出典（検証用リード、URL なし）:
  - Webb P.W. (1976) "The effect of size on the fast-start performance of rainbow trout Salmo gairdneri, and a consideration of piscivorous predator-prey interactions." J. Exp. Biol. 65:157–177.
  - Harper D.G., Blake R.W. (1990) "Fast-start performance of rainbow trout Salmo gairdneri and northern pike Esox lucius." J. Exp. Biol. 150:321–342.
  - Harper D.G., Blake R.W. (1991) "Prey capture and the fast-start performance of northern pike Esox lucius." J. Exp. Biol. 155:175–192.
  - Webb P.W., Skadsen J.M. (1980) "Strike tactics of Esox." Can. J. Zool. 58:1462–1469.
  - Hale M.E. (2002) "S- and C-start escape responses of the muskellunge (Esox masquinongy) require alternative neuromotor mechanisms." J. Exp. Biol. 205:2005–2016.
- 証拠: [M] 検索要約なし（記憶）。確信度: 高（C/S の区別）、中（サケ科の逃避が C-start 系であること）、低（ドリフト捕食の運動分類）。
- 更新（第2版）: **修正あり。** ニジマスの高速スタートには L／C 型と S 型の**両方**が記録されている（Webb 1976、Harper & Blake 1990。F-31, F-32）。初版の「S-start はカワカマス類に典型で、トラウトは C-start 系」という記憶は不完全だった。Webb 1976、Harper & Blake 1990 の書誌は確認した。Webb & Skadsen 1980、Harper & Blake 1991、Hale 2002 は未検索。ドリフト捕食の運動分類は依然〔未〕。

### F-20 Mauthner 細胞と潜時（短潜時・長潜時）
- 主張/値: 逃避の C-start は、後脳の一対の大型ニューロン（Mauthner 細胞）が引き金になる**短潜時経路**で説明される。Mauthner 細胞が一側で発火すると、反対側の体幹筋が収縮し、体が刺激から遠ざかる側へ C 字に曲がる。ただし全ての高速スタートが Mauthner 細胞によるわけではなく、**Mauthner 細胞を介さない長潜時の C-start** も、ゆっくり近づく刺激（視覚的接近）などで起こる。
  - 潜時の桁（金魚などの記憶、温度依存）: 音・接触刺激の短潜時で、刺激から筋活動まで**数 ms〜10 ms 台**（確信度: 低〜中）。長潜時の経路は**数十 ms 以上**（確信度: 低）。トラウトの値は記憶に無い。
- 適用範囲: 条鰭類一般（主に金魚など）。ヤマメ・サケ科の潜時、温度依存（河川水温 5〜20℃）、視覚的接近刺激への潜時は未確認。
- 出典（検証用リード、URL なし）:
  - Eaton R.C., Bombardieri R.A., Meyer D.L. (1977) "The Mauthner-initiated startle response in teleost fish." J. Exp. Biol. 66:65–81.
  - Eaton R.C., Lee R.K.K., Foreman M.B. (2001) "The Mauthner cell and other identified neurons of the brainstem escape network of fish." Prog. Neurobiol. 63:467–485.
  - Korn H., Faber D.S. (2005) "The Mauthner cell half a century later: a neurobiological model for decision-making?" Neuron 47:13–28.
- 証拠: [M] 検索要約なし（記憶）。確信度: 高（Mauthner 細胞の役割と収縮の左右関係）、中（長潜時経路の存在）、低（ms の桁）。
- 更新（第2版）: 最小潜時は **5–20 ms でサイズ非依存**（総説の要約。どの総説か特定不能。F-35）。初版の「数 ms〜10 ms 台」より上限が広い。長潜時の経路、トラウトの潜時の数値、水温依存は〔未〕。Eaton ら、Korn & Faber は未検索。

### F-21 高速スタートの数値の桁の目安（採用不可・仮置き用）
- 主張/値（全て M・ヤマメの値ではない・出典で確認できていない）:

| 項目 | 桁の目安 | 確信度 | 備考 |
|---|---|---|---|
| Stage 1 の継続時間 | 約10〜数十 ms | 低〜中 | 体長依存（F-22）。温度で変わる |
| Stage 2 の継続時間 | 約10〜数十 ms | 低〜中 | 同上 |
| Stage 1+2 の合計 | 約100 ms 未満 | 低〜中 | 小型〜中型魚 |
| 最大屈曲（頭と尾の角度差） | 90°超〜180°前後 | 低 | C 字が深い |
| 最高速度 | 体長比で数〜十数 L/s | 低 | 小型ほど大きい傾向（F-22） |
| 最大加速度 | 数十〜100 m/s² 超 | 低 | 魚種・サイズで大きく異なる |
| 潜時（短潜時） | 数 ms〜10 ms 台 | 低〜中 | F-20 |
| 潜時（長潜時） | 数十 ms 以上 | 低 | F-20 |
| 旋回角（頭の向きの変化） | 分布は広い | 低 | F-23 |

- 適用範囲: 条鰭類一般の記憶。トラウトやヤマメ河川型の実測値ではない。移動距離（最初の数十 ms で体長の何倍進むか）は、記憶に信頼できる値が無く、表に入れていない。
- 出典（検証用リード）: Webb (1976), Webb (1978), Harper & Blake (1990), Domenici & Blake (1997)（書誌は F-18, F-19, F-24）。
- 証拠: [M] 検索要約なし。確信度は上表の通り（低〜中）。**仕様に数値を入れる場合は、「根拠なしの仮置き」と明記すること。**
- 更新（第2版）: 表の桁の目安のうち、Stage 1+2 の合計「約100 ms 未満」は、ニジマスの主加速段階 0.07〜0.10 s（F-31）、逃避全体の最大 0.134 s（F-32）と**整合**。最大加速度「数十〜100 m/s² 超」は、59.7 ± 8.3 m/s²（F-32）、34〜98 m/s²（出典未特定、F-33）と整合。最大屈曲角、Stage 別の継続時間、体長比の最高速度、旋回角の分布は〔未〕のまま。**ニジマスの実測値（F-31, F-32）に置き換えられる項目は §4 の暫定パラメータ表を使う。**

### F-22 サイズ（体長）依存の方向
- 主張/値: 高速スタートの**継続時間は体長が大きいほど長くなる**（体長にほぼ比例、確信度: 中）。そのため、最高速度は m/s では体長とともに増える傾向、体長比（L/s）では小型ほど大きい傾向（確信度: 低〜中）。**最大加速度（m/s²）のサイズ依存の向きは、記憶が曖昧**（確信度: 低。「ほぼ一定または減少」の印象があるが、確認できない）。Webb (1976) は、ニジマスの体サイズと高速スタート性能の関係を調べた論文（題名より）。
- 適用範囲: 条鰭類一般、ニジマス（Webb 1976）。ヤマメの体サイズ範囲（parr 数 cm〜成魚 30 cm 前後）での検証は無い。
- 出典（検証用リード）: Webb (1976)、Domenici & Blake (1997)（書誌は F-18, F-19）。
- 証拠: [M] 検索要約なし。確信度: 中（時間が体長に比例）、低（加速度の向き）。
- 更新（第2版）: **加速度の向きが確定**: ニジマス 9.6–38.7 cm で、加速度はサイズに依存しない（Webb 1976、F-31）。継続時間は体長とともに増えるが、**「体長にほぼ比例」という初版の記憶は過大**だった（体長範囲は約 4 倍だが 0.07→0.10 s で約 1.4 倍、F-31。派生）。ただし**孵化直後〜卵黄吸収終了では逆**で、継続時間は短縮し、Stage 2 の移動距離は全長に比例する（Hale 1999、F-34）。体長比の速度（L/s）のサイズ依存は〔未〕。

### F-23 逃避方向と旋回角の分布、状況依存性
- 主張/値: C-start は、**刺激から遠ざかる側へ頭を向ける応答が大多数**（刺激が側方のとき。割合は「高い」としか言えない。確信度: 中）。旋回角（Stage 1 の屈曲角と Stage 2 の向きの変化）の分布は広く、刺激の方位・距離・強度、捕食者の接近速度、個体の状態で変わる（確信度: 中）。応答は、刺激の強さや状況に依存して確率的に起こる。
- 適用範囲: 条鰭類一般。ヤマメの角度分布・応答確率は未確認。
- 出典（検証用リード、URL なし）:
  - Domenici P. (2010) "Context-dependent variability in the components of fish escape response: integrating locomotor performance and behavior." J. Exp. Zool. A 313:59–79.
  - Domenici P., Blagburn J.M., Bacon J.P. (2011) "Animal escapology I / II." J. Exp. Biol. 214:2463–2473, 2474–2487.
  - Domenici P., Blake R.W. (1991) "The kinematics and performance of the escape response in the angelfish (Pterophyllum eimekei)." J. Exp. Biol. 156:187–205.
- 証拠: [M] 検索要約なし。確信度: 中（away 応答が多数であること、状況依存）、低（割合・角度の数値）。
- 更新（第2版）: 旋回角の分布、away 応答の割合は〔未〕のまま（Domenici ら 2010/2011 の抄録は未検索）。ニジマスの L 型は反動旋回を伴い、S 型は伴わない（F-31）。最小旋回半径は 0.17 L（F-31）。

### F-24 中央鰭と体型が高速スタート性能に与える影響
- 主張/値: Webb は、ニジマスの中央鰭（背鰭・臀鰭・尾鰭）を切除した実験で、高速スタートの性能が低下することを報告した（題名より。効果の大きさは記憶に無い。確信度: 低〜中）。Webb (1978) は7種の硬骨魚で体型と高速スタート性能の関係を調べた（題名より。結論の細部は記憶に無い。確信度: 低）。一般に、体の後半部の深さ（有効な推進面積）が大きいほど加速に有利とされる（確信度: 低〜中）。
- 適用範囲: ニジマス（Webb 1977）、7種の比較（Webb 1978）。ヤマメは未確認。
- 出典（検証用リード、URL なし）:
  - Webb P.W. (1977) "Effects of median-fin amputation on fast-start performance of rainbow trout (Salmo gairdneri)." J. Exp. Biol. 68:123–135.
  - Webb P.W. (1978) "Fast-start performance and body form in seven species of teleost fish." J. Exp. Biol. 74:211–226.
- 証拠: [M] 検索要約なし。確信度: 低〜中。
- 更新（第2版）: 中央鰭切除の効果の大きさ、Webb 1978 の結論は〔未〕（要約が出なかった）。背鰭・臀鰭・腹鰭の機能に関する論文の題名のみ確認（F-49）。
- 含意（私の推論）: Stage 2 の前後で、背鰭・臀鰭・尾鰭を広げて有効面積を増やす姿勢を採る設計（F-10, F-13 の写真は、背鰭が立つ・尾鰭が広がる状態が普通であることを示す）。

### F-25 ドリフト捕食の往復幾何（定位点 → 迎撃 → 復帰）
- 主張/値: 流れの中で流下餌を食べるサケ科は、流速の遅い場所（岩・倒木・岸・底の陰）にある定位点から、流れの速い側に流れてくる餌を検出し、**上流側・側方・上下へ迎撃して捕食し、流れに乗って定位点へ戻る**（確信度: 中）。採餌位置の選択は、エネルギー収支（流下餌の量 − 遊泳コスト）で説明するモデルがある（確信度: 中）。
- 適用範囲: ブラウントラウト、ニジマス、カワヒメマス類、北極グレイリングなどの研究の記憶。ヤマメ（日本の渓流）の実測は、記憶では確認できない。
- 出典（検証用リード、URL なし）:
  - Fausch K.D. (1984) "Profitable stream positions for salmonids: relating specific growth rate to net energy gain." Can. J. Zool. 62:441–451.
  - Hughes N.F., Dill L.M. (1990) "Position choice by drift-feeding salmonids: model and test for Arctic grayling (Thymallus arcticus) in subarctic mountain streams, interior Alaska." Can. J. Fish. Aquat. Sci. 47:2039–2048.
  - Hughes N.F. (1998) "A model of habitat selection by drift-feeding stream salmonids at different scales." Ecology 79:281–294.
  - Hughes N.F., Hayes J.W., Shearer K.A., Young R.G. (2003) "Testing a model of drift-feeding using three-dimensional videography of wild brown trout, Salmo trutta, in a New Zealand river." Can. J. Fish. Aquat. Sci. 60:1462–1476.
  - Hughes N.F., Kelly L.H. (1996) "A hydrodynamic model for estimating the energetic cost of swimming maneuvers from a description of their geometry and dynamics." Can. J. Fish. Aquat. Sci. 53:2484–2493.
  - Bachman R.A. (1984) "Foraging behavior of free-ranging wild and hatchery brown trout in a stream." Trans. Am. Fish. Soc. 113:1–32.
  - Hill J., Grossman G.D. (1993) "An energetic model of microhabitat use for rainbow trout and rosyside dace." Ecology 74:685–698.
- 証拠: [M] 検索要約なし。確信度: 中（往復の骨格、エネルギー収支モデル）、低（書誌の細部）。
- 更新（第2版）: 往復の骨格（定位点に留まり、短く速い流れに出て迎撃）は、ドリフト捕食研究の要約で支持された（F-41、出典未特定）。ただし**餌の約 2/3 は定位点より下流側で捕獲**という記述があり（F-41）、「上流側へ迎撃」の想定は弱める。Hughes ら 2003 の書誌は確認、数値は〔未〕。Fausch 1984、Hughes & Dill 1990 などは未検索。
- 含意（私の推論）: 行動モデルの「なぜその場所にいるか」を、定位点＝（流速の遅さ＋近くに速い流れ＋隠れ場所）で説明でき、「なぜ今泳いだか」を、餌の検出から迎撃までの1サイクルで説明できる。

### F-26 捕食の反応距離・追跡距離（定性的のみ）
- 主張/値: 餌を検出して攻撃を始める距離（反応距離）は、**餌が大きいほど、水が澄んで明るいほど大きく、流速が速いほど短くなる**（確信度: 中・定性的）。遠くまで追うほど、迎撃に必要な遊泳速度と遊泳コストが増え、最大追跡距離は魚の持続・短時間速度と流速で制限される（モデル上の考え方、確信度: 中）。数値（例: 反応距離が体長の何倍、最大追跡距離が何 cm）は、記憶に信頼できるものが無い。反応距離は「数十 cm〜体長の数倍」程度の桁と漠然と記憶しているが（確信度: 低）、**採用不可**。
- 適用範囲: ドリフト捕食のモデル研究の記憶（F-25 の文献）。ヤマメは未確認。
- 出典（検証用リード）: F-25 と同じ。
- 証拠: [M] 検索要約なし。確信度: 中（定性）、低（数値）。
- 更新（第2版）: **流速と反応距離の関係は文献間で食い違う**（F-42: 流速増で検出距離が低下／F-43: 影響が小さい）。初版の「流速が速いほど反応距離が短くなる」は確実でなく、弱める。迎撃速度は最大持続遊泳速度 Vmax（F-42、PROXY）。反応距離・追跡距離の数値は〔未〕のまま。

### F-27 旋回の力学と鰭の関与
- 主張/値: 魚の旋回性能は、**安定性と機動性のトレードオフ**（体の硬さ・鰭の配置）で整理される（確信度: 中）。柔軟な体を持つ魚は、体の屈曲により小さい半径で旋回できる（確信度: 中）。最小旋回半径は、体長の **0.1〜0.3 倍程度の桁**と記憶している（確信度: 低。**採用不可**）。旋回に胸鰭・腹鰭・背鰭・臀鰭が関わること（外側の鰭を広げて制動・ヨーを作る、背鰭・臀鰭をラダー／安定板として使う）は、複数種の研究にある（確信度: 中・定性的）。ロール・ピッチとの連動の詳細（バンクして旋回するか等）は、ヤマメでは記憶に無い。
- 適用範囲: 条鰭類一般、トラウト・ブルーギル等の研究の記憶。
- 出典（検証用リード、URL なし）:
  - Weihs D. (2002) "Stability versus maneuverability in aquatic locomotion." Integr. Comp. Biol. 42:127–134.
  - Webb P.W. (1983) "Speed, acceleration and manoeuvrability of two teleost fishes." J. Exp. Biol. 102:115–122.
  - Webb P.W., Fairchild A.G. (2001) "Performance and maneuverability of three species of teleostean fishes." Can. J. Zool. 79:1866–1877.
  - Walker J.A. (2004) "Kinematics and performance of maneuvering control surfaces in teleost fishes." IEEE J. Ocean. Eng. 29:572–584.
  - Standen E.M., Lauder G.V. (2007) "Hydrodynamic function of dorsal and anal fins in brook trout (Salvelinus fontinalis)." J. Exp. Biol. 210:325–339.
  - Standen E.M. (2010) "Muscle activity and hydrodynamic function of pelvic fins in trout (Oncorhynchus mykiss)." J. Exp. Biol. 213:831–841.
  - Blake R.W. (2004) "Fish functional design and swimming performance." J. Fish Biol. 65:1193–1222.
- 証拠: [M] 検索要約なし。確信度: 中（定性）、低（数値・書誌の細部）。
- 更新（第2版）: **最小旋回半径を A に更新**: 0.17 L（Webb 1976）、0.18 L（Webb 1983、25.7 cm のニジマスが活餌を攻撃）、smallmouth bass 0.11 L（F-31, F-37）。初版の「0.1〜0.3 L」と矛盾しないが、限界性能の最小値である点に注意。胸鰭の関与は Drucker & Lauder 2003 で A（外側鰭で横力、F-44）。背鰭・臀鰭・腹鰭の定量、Webb & Fairchild 2001、Weihs 2002、Walker 2004 は〔未〕。

### F-28 胸鰭の使い方（トラウト）と、底に押し付ける定位
- 主張/値: ニジマスの胸鰭は、定位・旋回・制動・上下移動などの行動ごとに異なる使い方をし、鰭が発生する力が水流計測（DPIV）で測られた（Drucker & Lauder 2003 の題名「Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces」より。具体的な角度・力の値は記憶に無い。確信度: 中・定性）。大西洋サケの parr は、胸鰭を使って底に押し付ける力（負の揚力）を作り、底近くで流れに耐える、という報告がある（Arnold, Webb & Holford 1991。確信度: 中）。底生魚の定位の研究（Webb 1989）も同様の考え方。
- 適用範囲: ニジマス、大西洋サケの parr（PROXY）。ヤマメは未確認。F-11, F-14 の写真（胸鰭・腹鰭を下へ押し付けて体を支える parr: p017）と矛盾しないが、写真は休息フレームで、流れの中での負の揚力の証拠ではない。
- 出典（検証用リード、URL なし）:
  - Drucker E.G., Lauder G.V. (2003) "Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces." J. Exp. Biol. 206:813–826.
  - Arnold G.P., Webb P.W., Holford B.H. (1991) "The role of the pectoral fins in station-holding of Atlantic salmon parr (Salmo salar L.)." J. Exp. Biol. 156:625–629.
  - Webb P.W. (1989) "Station-holding by three species of benthic fishes." J. Exp. Biol. 145:303–320.
  - Kalleberg H. (1958) "Observations in a stream tank of territoriality and competition in juvenile salmon and trout (Salmo salar L. and S. trutta L.)." Rep. Inst. Freshw. Res. Drottningholm 39:55–98.
- 証拠: [M] 検索要約なし。確信度: 中（鰭の使い分け、負の揚力の報告）、低（力の大きさ・角度）。
- 更新（第2版）: 胸鰭の使い分けは Drucker & Lauder 2003 の要約で A（F-44）。**負の揚力（Arnold ら 1991）は「仮説を検証した論文がある」までで、結果は未確認**（F-48）。初版の「報告がある（M・中）」は弱める。

### F-29 流れの中の定位: 障害物の背後・前面、乱流下の補償
- 主張/値: ニジマスが円柱の背後（渦列の中）で泳ぐと、**体の振幅が大きく、尾びれ周波数が低く、渦に同期して体をくねらせて渦の間をすり抜ける「Kármán gait」**を示し、軸筋の活動が減ってエネルギーを節約する（Liao ら 2003/2004、確信度: 中〜高）。円柱の上流側の船首波（bow wake）でも定位でき、その場合の尾の動きは小さい（Liao 2006/2007 の記憶、確信度: 中）。乱流中のニジマスは、体のピッチ・ロールの補償や鰭の微調整で姿勢を保ち、乱流では酸素消費が変わる（Taguchi & Liao 2011、Enders ら 2003 の記憶、確信度: 低〜中）。尾の微小振動の振幅・周波数、胸鰭の補償動作の数値は、記憶に無い。
- 適用範囲: ニジマス、大西洋サケ幼魚（PROXY）。水槽・水路実験。ヤマメ（野外・日本の渓流）の定位保持は未確認。
- 出典（検証用リード、URL なし）:
  - Liao J.C., Beal D.N., Lauder G.V., Triantafyllou M.S. (2003) "Fish exploiting vortices decrease muscle activity." Science 302:1566–1569.
  - Liao J.C. (2004) "Neuromuscular control of trout swimming in a vortex street: implications for energy economy during the Karman gait." J. Exp. Biol. 207:3495–3506.
  - Liao J.C. (2006) "The role of the lateral line and vision on body kinematics and hydrodynamic preference of rainbow trout in turbulent flow." J. Exp. Biol. 209:4077–4090.
  - Liao J.C. (2007) "A review of fish swimming mechanics and behaviour in altered flows." Phil. Trans. R. Soc. B 362:1973–1993.
  - Taguchi M., Liao J.C. (2011) "Rainbow trout consume less oxygen in turbulence: the energetics of swimming behaviors at different speeds." J. Exp. Biol. 214:1428–1436.
  - Enders E.C., Boisclair D., Roy A.G. (2003) "The effect of turbulence on the cost of swimming for juvenile Atlantic salmon (Salmo salar)." Can. J. Fish. Aquat. Sci. 60:1149–1160.
- 証拠: [M] 検索要約なし。確信度: 中〜高（Kármán gait の骨格）、中（船首波定位）、低〜中（乱流下の細部）。
- 更新（第2版）: Kármán gait の骨格を **A に更新**（Liao 2004、Akanyeti & Liao 2013。F-46, F-47）: 尾の振幅は自由流の約 3 倍、流速 30–70 cm/s で出現確率最大、体波長は後流波長の約 1.25 倍。胸鰭の 2 モードは Gibbs ら 2024（F-45）。船首波定位、乱流下のピッチ・ロール補償、Taguchi & Liao 2011、Enders ら 2003 は〔未〕（Liao 2006 は題名のみ、F-49）。
- 含意（私の推論）: 岩・流木の背後と前面で、尾の動きの質（振幅大・周波数低 vs 微小）を切り替える設計が、実装の選択肢になる。ただしヤマメでの確認は未了。

### F-30 バースト&コーストと加減速
- 主張/値: **バースト&コースト（尾を数回振って加速し、直線姿勢で滑走して減速する遊泳）は、同じ平均速度の連続遊泳よりエネルギーが少ない**と理論的に示されている（Weihs 1974、Videler & Weihs 1982。節約率は理論値で最大数十%の桁と記憶、確信度: 低）。減速は、滑走中は抗力による受動的減速、能動的な制動は胸鰭（F-28）を使う、という考え方（確信度: 中）。サケ科の自然な遊泳でのバースト&コーストの頻度は、記憶に無い。自発的な加速（逃避ではない加速）は、逃避の最大加速度より**1〜2桁小さい**と思うが、記憶に数値が無い（確信度: 低）。ヤマメの 0 → 巡航の立ち上がり時間・巡航 → 0 の減速時間は取得できていない。
- 適用範囲: 理論研究と一部の魚種の観察の記憶。ヤマメ・サケ科は未確認。
- 出典（検証用リード、URL なし）:
  - Weihs D. (1974) "Energetic advantages of burst swimming of fish." J. Theor. Biol. 48:215–229.
  - Videler J.J., Weihs D. (1982) "Energetic advantages of burst-and-coast swimming of fish at high speeds." J. Exp. Biol. 97:169–178.
  - Videler J.J. (1993) Fish Swimming. Chapman & Hall.
  - Beamish F.W.H. (1978) "Swimming capacity." In: Fish Physiology vol. 7 (Hoar & Randall eds.), Academic Press（持続・長時間・バーストの速度域の分類）.
- 証拠: [M] 検索要約なし。確信度: 中（理論の骨格）、低（数値・サケ科での使用頻度）。
- 更新（第2版）: バースト&コーストの省エネは PROXY で確認（理論 50% 超、コイ約 45%。F-39）。サケ科での頻度は〔未〕。Weihs 1974 は未検索。日本の魚道設計の突進・巡航速度は F-40。

---

### Part D — 第2版の検索で得た文献記述（検索要約ベース）

> **共通の注意（F-31〜F-49）**
> - 根拠は WebSearch の要約（題名・URL・モデルが作った要約）。論文全文・表・図は未読。抄録レベルの数値だけを採用した。
> - 種は主に **ニジマス（旧学名 Salmo gairdneri、現 Oncorhynchus mykiss）= PROXY**。ヤマメ・サクラマス（O. masou）の値は無い。ヤマメへ転用する場合は「近縁サケ科の暫定値」と明記すること。
> - 水温、n、各群の体長は要約に無いものが多い。温度依存（河川水温 5〜20℃）は別途の不確実性として残る。

### F-31 ニジマスの高速スタート: 2 型、継続時間、旋回半径、加速度のサイズ依存（Webb 1976）
- 主張/値: 7 群のニジマス（全長 9.6–38.7 cm）を直流電気刺激で逃避させた。高速スタートは 2 型で、**L 型**（体が L または U 字に屈曲し、通常は反動旋回を伴う）と **S 型**（S 字、反動旋回なしで加速）。**主加速段階の継続時間は体長とともに増え、最小群 0.07 s から最大群 0.10 s**。最小旋回半径は両型とも全長 L に比例し、**全体で 0.17 L**。**加速度は体サイズに依存しなかった。** 同じ要約の文脈で、最大速度は最大 2.85 m/s、平均速度 1.63 m/s（S. gairdneri、Webb 1976 に帰属と表示された）。
- 適用範囲: PROXY: ニジマス、9.6–38.7 cm TL、実験室、電気刺激（驚愕反応。捕食者の接近ではない）。水温、n、各群の体長は要約に無い。「主加速段階」が Stage 1+2 を指すのか Stage 2 のみなのかは要約から不明。最大・平均速度の数値と体長群の対応も要約に無い（派生の L/s 換算はしない）。
- 出典: Webb P.W. (1976) "The effect of size on the fast-start performance of rainbow trout Salmo gairdneri, and a consideration of piscivorous predator-prey interactions", J. Exp. Biol. 65(1):157–177。
  - https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance
- 証拠: [A] "The duration of the primary acceleration stages increased with size from 0.07 s for the group of smallest fish to 0.10 s for the group of largest fish. ... overall radius of 0.17 L."（検索要約中の抄録文）
- 実装への含意: Stage 継続時間の体長スケール（0.07→0.10 s、約 4 倍の体長範囲で 1.4 倍）と、最小旋回半径 0.17 L は、ニジマスの実測に基づく暫定値として使える。ヤマメ parr〜成魚の範囲（数 cm〜30 cm）に補間するのは私の判断で、検証は無い。

### F-32 ニジマスとカワカマスの逃避加速度・継続時間（Harper & Blake 1990）
- 主張/値: ニジマス（平均全長 0.32 m）とカワカマス（Esox lucius、0.38 m）の逃避を、皮下埋め込み加速度計で測定。**ニジマスでは、C 字の高速スタートは単峰の加速度—時間曲線（type I）、S 字の高速スタートは二峰（type II）**。カワカマスは type I・II に加えて、方向変化を伴わない S 字の第 2 の高速スタート（三峰、type III）も行う。**平均最大加速度は、カワカマス 120.2 ± 20.0 m/s²、ニジマス 59.7 ± 8.3 m/s²**。逃避の継続時間は、カワカマス type I の 0.085 s からニジマス（S. gairdneri）の 0.134 s まで。
- 適用範囲: PROXY: ニジマス（ヤマメではない）、実験室、水温は要約に無い。逃避全体の継続時間で、Stage 1+2 の継続時間と一致するかは不明。
- 出典: Harper D.G., Blake R.W. (1990) "Fast-start performance of rainbow trout Salmo gairdneri and northern pike Esox lucius", J. Exp. Biol. 150(1):321–342。
  - https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo
- 証拠: [A] "Overall mean maximum acceleration rates for pike were 120.2±20.0 ms⁻² and 59.7±8.3 ms⁻² for trout. The duration of the escapes ranges from 0.085 s for E. lucius type I to 0.134 s for S. gairdneri."
- 実装への含意: ニジマス系では **C 型（直進加速で反動旋回あり）と S 型（二峰）が両方起こる**として、逃避の型を確率で選べる。型ごとの頻度は要約に無い。

### F-33 出典未特定: ニジマスの最大加速度と 2 段階の継続時間（参考扱い）
- 主張/値: 検索要約に、ニジマスの最大加速度として「**97.8 m/s²**」、別の研究の「全体平均の最大値 3438 cm/s²（= 34.38 m/s²）」、33 cm のトラウトで「**各段階 約 0.075 s（2 段階の合計 0.150 s）**」が出た。
- 適用範囲: PROXY: ニジマス。どの論文の値か、要約が特定していない。測定法（加速度計か、高速度映像の微分か）も不明。**採用は参考扱い**（仕様の既定値にしない）。
- 出典: 検索クエリ 2 の要約（上記 F-31、F-32 の URL と同じ結果集合）。個別論文の特定不能。
- 証拠: [C] "Maximum acceleration rates for rainbow trout reach 97.8 m/s²... overall mean maximum rate of 3438 cm/s²"（検索要約。出典論文の特定不能）。
- 注: F-32 の平均最大加速度 59.7 ± 8.3 m/s² は、97.8 と 34.38 の間にある。測定法・サイズ・水温の差があり得る（§3-2）。

### F-34 サケ科の高速スタートの発育・サイズ依存（Hale 1999 ほか）
- 主張/値: chinook salmon、coho salmon、brown trout の孵化後初期発育で逃避の運動学を比較。**段階の継続時間、最大速度、最大加速度は発育状態に強く依存し、Stage 2 の移動距離は全長（TL）に比例してスケールする。** 性能は卵黄吸収の終わり（eleutheroembryo から juvenile への移行）で最大になる。この時点で各段階の継続時間は最小、最大速度・最大加速度は体長比で最大。別の chinook salmon の研究（Integr. Comp. Biol. 36:695）の要約では、成魚の C-start の継続時間は体長とともに増え、未成熟魚では逆に減る。
- 適用範囲: PROXY: chinook、coho、brown trout の**孵化直後〜卵黄吸収後の稚仔魚**。ヤマメの parr（数 cm〜）〜成魚は、卵黄吸収後の範囲で、Webb 1976（9.6–38.7 cm）のサイズ依存（継続時間が増える方向）に近いと考えられる（推論）。
- 出典: Hale M.E. (1999) "Locomotor mechanics during early life history: effects of size and ontogeny on fast-start performance of salmonid fishes", J. Exp. Biol. 202(11):1465–1479。
  - https://journals.biologists.com/jeb/article-abstract/202/11/1465/7927/Locomotor-mechanics-during-early-life-history?redirectedFrom=fulltext
  - https://pubmed.ncbi.nlm.nih.gov/10229693/
  - （Chinook の別研究）https://academic.oup.com/icb/article-abstract/36/6/695/263737?redirectedFrom=fulltext
- 証拠: [A] "the overall distance traveled during stage 2, scales with total body length ... Thus, escape behavior reaches its maximum size-specific performance at a relatively small size, just as the fish absorbs its yolk."
- 注: ICB 1996 の著者・年は要約に無く、確認していない。

### F-35 逃避の最小潜時と、逃避の一般的な特徴（総説の要約・出典未特定）
- 主張/値: 逃避は、速筋の収縮による体の急速な屈曲（しばしば C 字）と、それに続くバースト遊泳で起こる。**最小潜時は 5–20 ms の桁で、魚のサイズに依存しない。**
- 適用範囲: 条鰭類一般の総説。ヤマメ・水温別の値、視覚的接近（looming）刺激への潜時は要約に無い。この文がどの総説（下記 2 件のどちらか）かは要約が特定していない。
- 出典: 検索クエリ 18 の結果集合に含まれる総説:
  - Domenici P., Hale M.E. (2019) "Escape responses of fish: a review of the diversity in motor control, kinematics and behaviour", J. Exp. Biol. 222:jeb166009。https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity
  - （2023）"Kinematics and behaviour in fish escape responses: guidelines for conducting, analysing and reporting experiments", J. Exp. Biol. 226(14):jeb245686。https://journals.biologists.com/jeb/article/226/14/jeb245686/324853/Kinematics-and-behaviour-in-fish-escape-responses
- 証拠: [A（出典論文の特定不能）] "Minimum response latencies are in the order of 5–20 ms and independent of fish size."（検索要約）
- 初版 F-20 の「短潜時: 数 ms〜10 ms 台（低〜中）」を、5–20 ms（サイズ非依存）に更新。

### F-36 高速スタートの 3 段階の定義（Domenici & Blake 1997）と、PROXY の Stage 1 継続時間
- 主張/値: 高速スタートは、運動学的に 3 段階に分けられる。**Stage 1（準備の動作: 体が特徴的な C 字または S 字に屈曲）→ Stage 2（推進の動作: 加速）→ Stage 3（可変: 継続する遊泳動作、制動、または単なる滑走停止）**。同論文は逃避と**摂餌ストライク**の両方を扱い、魚種間（体形・生息環境の違い）の性能も比較する。カワカマスは重力加速度の 10 倍を超える加速度（要約の記述。10 g ≈ 98 m/s² は私の換算）。
- PROXY（サケ科以外・参考のみ）: ある catfish（検索要約の記述。種・論文は特定不能）の逃避で、**Stage 1 の継続時間は 20.8–108.3 ms、平均 51.6 ± 3.0 ms**。
- 適用範囲: 条鰭類一般（PROXY を含む）。サケ科の Stage 1 / Stage 2 を分けた値は、要約からは得られなかった。
- 出典: Domenici P., Blake R.W. (1997) "The kinematics and performance of fish fast-start swimming", J. Exp. Biol. 200(8):1165–1178。
  - https://tethys.pnnl.gov/publications/kinematics-performance-fish-fast-start-swimming
  - https://iris.cnr.it/handle/20.500.14243/268028
  - （catfish の PROXY）https://pmc.ncbi.nlm.nih.gov/articles/PMC4295168/ （検索結果集合に含まれた。値の出典がこの論文かは要約から特定できない）
- 証拠: [A] "a preparatory stroke (Stage 1) in which the body bends into a characteristic 'C' or 'S' shape; a propulsive stroke (Stage 2) that accelerates the fish; and a variable stage (Stage 3)"（検索要約）。catfish の値は [C]（出典未特定）。
- 初版 F-18（M）の 3 段階の枠組みを、A に更新。

### F-37 ニジマスの旋回半径（活餌ミノーへの攻撃中。Webb 1983）
- 主張/値: ニジマス（Salmo gairdneri、全長 25.7 cm）と smallmouth bass（Micropterus dolomieu、23.6 cm）が活餌のミノーを攻撃するときの、速度、加速度、旋回半径を測定。観察は、各運動学変数について最大性能の限界までの範囲を含む。**最小旋回半径は速度・加速度に依存しない。全長 L に対する最小半径は、トラウトで 0.18 ± 0.2 L（要約の表記どおり。± は 0.02 の誤植の可能性、未確認）、バスで 0.11 ± 0.02 L。**
- 適用範囲: PROXY: ニジマス 25.7 cm（実験室、活餌）。水温は要約に無い。**自然な捕食攻撃の中での測定**という点は、電気刺激の Webb 1976 とは異なる。F-31 の 0.17 L と近い値で、整合する。
- 出典: Webb P.W. (1983) "Speed, acceleration and manoeuvrability of two teleost fishes", J. Exp. Biol. 102(1):115–122。
  - https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two?redirectedFrom=fulltext
  - https://cob.silverchair.com/jeb/article-pdf/102/1/115/2428221/jexbio_102_1_115.pdf
- 証拠: [A] "Speed, acceleration rate and turning radius were measured for rainbow trout (Salmo gairdneri length 25·7 cm) and smallmouth bass ... attacking live minnows." / "minimum radii were 0.18 ± 0.2L for trout and 0.11 ± 0.02L for bass."（検索要約）
- 実装への含意: 旋回の曲率の上限は、全長の約 0.17〜0.18 倍の半径（曲率 ≈ 5.6/L）。通常の遊泳ではもっと緩い旋回になる（私の推論。実測値なし）。

### F-38 高速スタート中の体の曲がりと筋の位相（Goldbogen ら 2005）
- 主張/値: ニジマスの外側の速筋の長さ変化を sonomicrometry で測り、高速度映像で体軸の運動学を同時に解析。**筋の短縮は体の屈曲と時間的に分離しており（おそらく流体力のため）、体軸の曲率は筋の短縮から遅れる。前方（0.4 L）でも後方（0.7 L）でも同様**。高速スタート中の屈曲が、筋トルクと流体抵抗の相互作用で決まるというモデルを支持する。
- 適用範囲: PROXY: ニジマス、誘発された高速スタート、実験室。位相差の大きさ（ms 値）は要約に無い。
- 出典: Goldbogen J.A., Shadwick R.E., Fudge D.S., Gosline J.M. (2005) "Fast-start muscle dynamics in the rainbow trout Oncorhynchus mykiss: phase relationship of white muscle shortening and body curvature", J. Exp. Biol. 208(5):929–938（ページ終端は要約に無い）。
  - https://journals.biologists.com/jeb/article/208/5/929/15956/Fast-start-muscle-dynamics-in-the-rainbow-trout
  - https://pubmed.ncbi.nlm.nih.gov/15755891/
- 証拠: [A] "midline curvature lagged behind muscle shortening at both the anterior (0.4 L) and posterior (0.7 L) axial positions."（検索要約）
- 実装への含意: 屈曲波を「筋の活性化波」から遅らせて生成する形式にすれば、曲率の位相遅れを再現できる。数値は仮置き。

### F-39 バースト&コースト（PROXY: コイ・タラ・セイス）
- 主張/値: 理論モデルは、バースト&コースト遊泳で、与えられた距離を泳ぐエネルギーが **50% 超**節約されると予測する。koi carp（Cyprinus carpio koi）では、同じ平均速度の定常遊泳より **約 45%** のエネルギーが節約された。cod と saithe の高速度映像では、バースト&コーストの周期が最も安い解を選ぶ傾向がある。節約の機構は Bone-Lighthill の境界層薄化仮説（体が波打つと皮膚摩擦抗力が増すので、波打つ相と滑走相を交互にすると総抗力が下がる）で、デューティ比（バースト時間／滑走時間）などで決まる。
- 適用範囲: PROXY: koi carp、cod、saithe。**サケ科・ヤマメのバースト&コーストの実測は見つからなかった。**
- 出典:
  - Videler J.J., Weihs D. (1982) "Energetic advantages of burst-and-coast swimming of fish at high speeds", J. Exp. Biol. 97(1):169–178。https://journals.biologists.com/jeb/article/97/1/169/34638/Energetic-advantages-of-burst-and-coast-swimming
  - （koi）"Kinematics, hydrodynamics and energetic advantages of burst-and-coast swimming of koi carps (Cyprinus carpio koi)", J. Exp. Biol. 210(12):2181–。https://journals.biologists.com/jeb/article/210/12/2181/16867/Kinematics-hydrodynamics-and-energetic-advantages
- 証拠: [A] "nearly 45% of energy is saved when burst-and-coast swimming is used by koi carps compared with steady swimming at the same mean speed."（検索要約）
- 実装への含意: 初版 F-30 の M を裏付ける。ただしサケ科での使用は不明。既定は無効寄り、高速域・加速直後の選択肢として残す。

### F-40 日本の魚道設計の遊泳速度の一般値（突進・巡航）
- 主張/値: 日本語の検索要約に、**瞬発（突進）速度は通常体長の約 10 倍／s、巡航速度は体長の 2–3 倍／s が一般的**、**ニジマスの巡航速度と突進速度は標準体長比でそれぞれ 4.7 と 9.3（と計算されている）**、という記述が出た。ワカサギの例（体長 6〜7 cm 台で遊泳速度 107〜141 cm/s、体長の 15〜20 倍／s）も出た。魚道設計での定義は「突進速度=瞬間的な遊泳が可能な速度、巡航速度=長時間の遊泳が可能な速度」。
- 適用範囲: 魚一般の設計値（ヤマメ・サクラマス固有の値は要約に無い）。ニジマスの 4.7／9.3 は標準体長（SL）比の算出値と記される。どの文書の記述か要約が特定していない。
- 出典（候補。記述との対応は未確認）:
  - https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000055vu-att/bunryu-shiryo-13.pdf
  - https://www.aomori-itc.or.jp/_files/00230483/241-244.pdf
  - https://www.aomori-itc.or.jp/_files/00229463/212-215.pdf
  - https://www.pref.nagano.lg.jp/suisan/jigyokenkyu/documents/05b.pdf
  - https://www.pref.okayama.jp/uploaded/attachment/136414.pdf
- 証拠: [B（公的機関資料の検索要約。出典文書の特定不能）] 「瞬発速度は通常体長の10倍程度、巡航速度は体長の2-3倍が一般的」。
- 注: これは**速度**の目安で、加速・減速の時間スケールではない。F-31 の最大速度 2.85 m/s と矛盾しない大きさ（体長との対応は不明）。r08（定常遊泳）とも整合するが、ヤマメ固有の値は依然として無い。

### F-41 ドリフト捕食の時間配分と捕獲位置（出典未特定の要約）
- 主張/値: ドリフト捕食の魚は、水中の定位点に留まり、**速い流れに短く出て**流下する無脊椎動物を迎撃する。ある研究で、**魚は観察時間の平均 81% を定位点で過ごし、能動的な採餌は 14%**。**迎撃速度は期待された最大持続遊泳速度より遅く、餌の約 2/3 は定位点より下流側で捕獲された**（上流側ではなく）。採餌モデルの一部は、定位点を含む平面上の 5 cm² の格子セルとして採餌体積を扱う。
- 適用範囲: ドリフト捕食のサケ科（種、サイズ、場所は要約が特定していない）。検索結果の集合には、brown trout の 3D 映像研究（Hughes ら 2003、NZ）、juvenile Chinook salmon の 3D 映像研究、O. mykiss のカリフォルニアの河川研究（流量・餌の流下が減る時期）が含まれており、記述はこれらのいずれかに由来する。**Piccolo ら 2008（F-42）の「Vmax で迎撃」とは食い違う**（§3-5）。
- 出典（候補。記述との対応は未確認）:
  - Hughes N.F. ら (2003) "Testing a model of drift-feeding using three-dimensional videography of wild brown trout, Salmo trutta, in a New Zealand river", Can. J. Fish. Aquat. Sci. 60:1462–1476。https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river
  - "Mechanisms of drift-feeding behavior in juvenile Chinook salmon and the role of inedible debris in a clear-water Alaskan stream"。https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream
  - "Foraging modes and movements of Oncorhynchus mykiss as flow and invertebrate drift recede in a California stream"。https://cdnsciencepub.com/doi/10.1139/cjfas-2020-0398
  - 総説: "A historical perspective on drift foraging models for stream salmonids"。https://link.springer.com/article/10.1007/s10641-013-0187-6
- 証拠: [C（出典論文の特定不能）] "Fish held focal positions in the water column most of the time (mean = 81%), with active foraging observed for 14% of observation periods ... captured about two-thirds of their prey downstream of their focal point"（検索要約）。
- 実装への含意: 往復（定位点→迎撃→復帰）の「定位点にいる時間が大半」は、静止（微小な定位動作）の時間を長く取る根拠になる。迎撃の向きは**下流側が多数**と仮置きにし、上流への突進を既定にしない。ただし出典未特定なので参考扱い。

### F-42 流速が検出距離・捕獲確率・迎撃速度に与える影響（coho／steelhead 幼魚。Piccolo ら 2008）
- 主張/値: 水槽の実験で、juvenile coho salmon と steelhead を流速 0.29〜0.61 m/s で比較（3D 映像解析、反復測定の分散分析）。**捕獲確率と餌の検出距離は流速の増加で有意に低下**（種の効果と流速×種の交互作用はなし）。**迎撃速度は流速にも種にも影響されず、魚は全流速で、予測された最大持続遊泳速度（Vmax）で餌を迎撃した。**
- 適用範囲: PROXY: coho salmon／steelhead（降海型ニジマス）の幼魚、水槽。数値の記述（捕獲確率の低下幅）は要約の表記が乱れており（"from -65% to 10%"）、**採用しない**。
- 出典: Piccolo J.J., Hughes N.F., Bryant M.D. (2008) "Water velocity influences prey detection and capture by drift-feeding juvenile coho salmon (Oncorhynchus kisutch) and steelhead (Oncorhynchus mykiss irideus)", Can. J. Fish. Aquat. Sci.（巻頁は要約に無い）。
  - https://research.fs.usda.gov/treesearch/31556 （検索結果にあった候補。当該論文かは未確認）
  - https://research.fs.usda.gov/treesearch/31555 （同上）
  - https://link.springer.com/article/10.1007/s10641-008-9330-1 （同上）
- 証拠: [A] "fish intercepted prey at their predicted maximum sustainable swimming speed (Vmax) at all velocities ... prey detection distance [decreased with velocity]"（検索要約。URL と記述の対応は未確認）。
- 実装への含意: 迎撃の速度を「その個体の最大持続遊泳速度」にする、という単純な規則は文献で支持される（PROXY）。

### F-43 反応距離と流速（学位論文。ニジマス・北極グレイリング）
- 主張/値: UGA の Drift Model Project の学位論文の要約として、**反応距離（reactive distance）は北極グレイリングで流速との関係が弱い正または無い。ニジマスでは、流速は捕獲に負の効果、反応距離にはほとんど／全く効果なし、定位流速（holding velocity）に正の効果**。
- 適用範囲: PROXY: 北極グレイリング、ニジマス。実験室または野外は要約が特定していない。学位論文（査読を経ない）。**どの学位論文の記述か、要約が特定していない。**
- 出典（候補）:
  - https://openscholar.uga.edu/record/3703/files/MerrittKieranMS.pdf
  - https://openscholar.uga.edu/record/20894/files/bozeman_bryan_b_201708_ms.pdf
  - https://openscholar.uga.edu/record/5581/files/Ridge%20Sliger%20Thesis%20Final.pdf
- 証拠: [B（学位論文の検索要約）] "Reactive distance displayed a weak (positive) or nonexistent relationship with velocity ... water velocity had a negative effect on prey capture, little to no effect on reactive distance, and a positive effect on holding velocity in rainbow trout studies."
- 矛盾: F-42（流速増で検出距離が低下）と食い違う。初版 F-26（M: 流速が速いほど反応距離は短くなる）は、確実ではなくなった。§3-4。

### F-44 ニジマスの胸鰭の行動別の使い方（Drucker & Lauder 2003）
- 主張/値: 胸鰭は、**定位（holding station）、旋回、制動**などの行動の繰り返しの中で使われる。**低速の遊泳では対鰭を振動させて推力を出し、低速・ホバリングでは鰭が渦を放出する。ホバリング中の胸鰭の前方への運動（protraction）で、主に横向きの伴流ができ、補正力を作る機能を示唆する。** 旋回では、胴の筋肉と胸鰭を併用して向きを変え、sunfish とトラウトでは**外側の鰭を回して横向きの力を作り、体を水平に回す。内側の鰭は推力を後方へ向けて前進させる**。制動では、鰭が制動機構として使われ得る（sunfish は両鰭を回して力を前方へ向け、反力が重心を通る、という記述は bluegill の別論文に由来する可能性がある）。
- 適用範囲: PROXY: ニジマス（温度制御された水槽、vortex 可視化）。具体的な角度・力の値は要約に無い。
- 出典: Drucker E.G., Lauder G.V. (2003) "Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces", J. Exp. Biol. 206(5):813–826。
  - https://journals.biologists.com/jeb/article-abstract/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout?redirectedFrom=fulltext
  - https://pubmed.ncbi.nlm.nih.gov/12547936
- 証拠: [A] "at low speeds and hovering they shed vortices ... pectoral fins produce predominantly lateral wakes during fin protraction while hovering, suggesting a corrective force producing function."（検索要約。旋回・制動の文は sunfish との比較の混在あり）
- 実装への含意: 旋回では外側の胸鰭を開き（横力）、内側を後ろ向きに動かす。ホバリングでは両胸鰭を小さく前後に振る。初版 F-28（M）の「行動ごとの使い分け」を A に更新。

### F-45 乱流下の定位保持: 胸鰭の制動と Kármán gait（Gibbs, Akanyeti & Liao 2024）
- 主張/値: ニジマスが D 型断面の円柱の後ろの不安定流で位置を保持する間の胸鰭の運動学と筋活動を調べた。**胸鰭の行動は 2 種**。(1) **制動（braking）**: 鰭を体から離した位置で持続的に張り出して流れに逆らい、前進速度が止まるのと関連した。魚は円柱の直後の吸引領域を避けていた。(2) **Kármán gaiting**: 鰭の一過的な展開と収納が、横方向（cross-stream）の体の動きを制御した。**制動の事象は全て、外転筋と内転筋の両方の動員を必要とした。Kármán gaiting 中の鰭の展開運動の 50% 超は筋活動なしで進んだ。**
- 適用範囲: PROXY: ニジマス、水路、D 型円柱の後流（乱流）。水温・流速・体長・n は要約に無い。
- 出典: Gibbs B.J., Akanyeti O., Liao J.C. (2024) "Kinematics and muscle activity of pectoral fins in rainbow trout (Oncorhynchus mykiss) station holding in turbulent flow", J. Exp. Biol. 227(5):jeb246275。
  - https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/
- 証拠: [A] "Sustained fin extensions during braking, where the fin was held out to maintain its position away from the body and against the flow ... Transient fin extensions and retractions during Kármán gaiting controlled body movements in the cross-stream direction."（検索要約）
- 実装への含意: 障害物の背後での定位では、胸鰭の動きを 2 モード（持続的な張り出しによる制動／一過的な展開・収納による横方向制御）で切り替える。後者の展開は一部が受動的（筋活動なし）なので、バネ・ダンパーで近似する余地がある（私の推論）。

### F-46 Kármán gait の体の運動学と筋活動（Liao 2004）
- 主張/値: Kármán gait は、**体全体の大きな横振幅、長い体波長、低下した尾びれ周波数（渦放出周波数よりわずかに高い）**で同定される。筋電では、Kármán gaiting の魚は**前方の赤色軸筋だけを活動**させた。**生きたトラウトは軸筋の活動なしで一時的に Kármán gait できる**。生きた個体でも死んだ個体でも、周波数は円柱の渦放出周波数に近づき、体波長は後流の波長より長かった。
- 適用範囲: PROXY: ニジマス、円柱後流の水路。数値（Hz、振幅 %L）は要約に無い（F-47 を参照）。
- 出典: Liao J.C. (2004) "Neuromuscular control of trout swimming in a vortex street: implications for energy economy during the Kármán gait", J. Exp. Biol. 207:3495–3506。
  - https://pubmed.ncbi.nlm.nih.gov/15339945/
  - （同グループの原著）Liao J.C., Beal D.N., Lauder G.V., Triantafyllou M.S. (2003) "The Kármán gait: novel body kinematics of rainbow trout swimming in a vortex street", J. Exp. Biol. 206(6):1059–。https://journals.biologists.com/jeb/article/206/6/1059/14048/The-Ka-rma-n-gait-novel-body-kinematics-of-rainbow
  - 総説: https://pmc.ncbi.nlm.nih.gov/articles/PMC6324577/ ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC2442850/
- 証拠: [A] "The Kármán gait is identifiable by large lateral amplitudes across the body, a longer body wavelength, and a decreased tail beat frequency slightly higher than the vortex shedding frequency"（検索要約）。
- 初版 F-29（M）の Kármán gait の骨格を A に更新。

### F-47 Kármán gait に対する流速と体長の効果（Akanyeti & Liao 2013）
- 主張/値: **Kármán gait の出現確率は、中間の流速 30〜70 cm/s で最大**。尾びれ周波数は、流速とともに直線的に増える渦放出周波数に一致した。**体波の速度は、流速（名目値）より約 25% 速く、体波長は円柱後流の波長より約 25% 長かった。** 体長の効果: 尾の振幅は、自由流の遊泳と同様に体長とともに増え、**自由流より約 3 倍大きかった**。大きな魚は、小さな魚より体波長が短く体波速度が遅く、自由流（体波長・速度は体長とともに増える）とは逆だった。**尾端の横振幅は、渦の期待される横間隔より約 50% 大きく、体の中心の振幅は約 70% 小さかった。**
- 適用範囲: PROXY: ニジマス、水路（円柱後流）。流速の範囲、体長の範囲は要約に無い。ヤマメの生息流速 10–35 cm/s（F-01）より速い範囲の実験なので、ヤマメの渓流の定位にそのまま使えない。
- 出典: Akanyeti O., Liao J.C. (2013) "The effect of flow speed and body size on Kármán gait kinematics in rainbow trout", J. Exp. Biol. 216(18):3442–。
  - https://journals.biologists.com/jeb/article/216/18/3442/11608/The-effect-of-flow-speed-and-body-size-on-Karman
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/
- 証拠: [A] "The highest probability of Kármán gaiting occurred at intermediate flow speeds between 30 and 70 cm s⁻¹ ... Tail-beat amplitudes ... were almost three times larger in magnitude [than freestream]."（検索要約）
- 実装への含意: 障害物後流での遊泳（Kármán gait）に切り替えるときは、尾の振幅を自由流の約 3 倍にし、周波数を渦放出周波数に合わせ、体波長を後流波長の約 1.25 倍とする、という規則が使える（PROXY。ヤマメへの転用は未検証）。

### F-48 胸鰭の負の揚力と底近くの定位保持（Arnold ら 1991、Webb 1989）
- 主張/値: **大西洋サケ parr の定位保持（station-holding）で、胸鰭が負の揚力を作る水中翼として働く、という仮説は広く提案されており、Arnold, Webb & Holford (1991) がこれを検証した。検証結果（支持か否か）の記述は、検索要約に出なかった。** 一般論として、底生魚は、抗力と摩擦力（摩擦係数×水中重量、体と鰭の揚力で決まる）の釣り合いで流れによる下流への移動に抵抗し、臨界速度を超えると摩擦が抗力に足りず、泳ぐか隠れ場所を探す必要がある（要約の一般記述）。
- 適用範囲: PROXY: 大西洋サケ parr（Salmo salar）。ヤマメは未確認。初版 F-28 の「負の揚力の報告がある（M・中）」は、**「仮説を検証した論文がある。結果は未確認」へ弱める**。
- 出典:
  - Arnold G.P., Webb P.W., Holford B.H. (1991) "The role of the pectoral fins in station-holding of Atlantic salmon parr (Salmo salar L.)", J. Exp. Biol. 156:625–629。https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding
  - Webb P.W. (1989) "Station-holding by three species of benthic fishes", J. Exp. Biol. 145:303–320。https://journals.biologists.com/jeb/article-abstract/145/1/303/5622/Station-Holding-by-three-Species-of-Benthic-Fishes?redirectedFrom=fulltext
- 証拠: [A（書誌と仮説の記述のみ。結果は不明）] "The hypothesis that pectoral fins are important to station-holding in Atlantic salmon, acting as hydrofoils generating negative lift, has been commonly proposed."（検索要約）

### F-49 鰭の機能に関する文献リード（題名のみ確認。内容は未取得）
- 主張/値: 検索結果に、次の論文の題名が出た。**内容の要約は得られていない**ので、数値・結論は採用しない。次回の検索で抄録を確認する優先度が高い。
  - 背鰭・臀鰭: "Hydrodynamic function of dorsal and anal fins in brook trout (Salvelinus fontinalis)", J. Exp. Biol. 210(2):325–（Standen & Lauder 2007）。https://journals.biologists.com/jeb/article/210/2/325/17120/Hydrodynamic-function-of-dorsal-and-anal-fins-in ／ "Locomotor function of the dorsal fin in rainbow trout: kinematic patterns and hydrodynamic forces", J. Exp. Biol. 208(23):4479–（2005）。https://journals.biologists.com/jeb/article/208/23/4479/15977/Locomotor-function-of-the-dorsal-fin-in-rainbow
  - 腹鰭: "Muscle activity and hydrodynamic function of pelvic fins in trout (Oncorhynchus mykiss)", J. Exp. Biol. 213(5):831–（2010）。https://journals.biologists.com/jeb/article/213/5/831/10106/Muscle-activity-and-hydrodynamic-function-of ／ "Pelvic fin locomotor function in fishes: three-dimensional kinematics in rainbow trout", J. Exp. Biol. 211(18):2931–（2008）。https://journals.biologists.com/jeb/article/211/18/2931/17665/Pelvic-fin-locomotor-function-in-fishes-three
  - 定位・ホバリング: "Inherent instability leads to high costs of hovering in near-neutrally buoyant fishes"（PMC）。https://pmc.ncbi.nlm.nih.gov/articles/PMC12280926 ／ "Rheotaxis revisited: a multi-behavioral and multisensory perspective on how fish orient to flow", J. Exp. Biol. 223(23):jeb223008（2020）。https://journals.biologists.com/jeb/article/223/23/jeb223008/226046/Rheotaxis-revisited-a-multi-behavioral-and
  - 乱流・側線・視覚: "The role of the lateral line and vision on body kinematics and hydrodynamic preference of rainbow trout in turbulent flow", J. Exp. Biol. 209(20):4077–（2006）。https://pubmed.ncbi.nlm.nih.gov/17023602/
  - 高速スタートの関連記事: "Webb scales fast-start maneuvers", J. Exp. Biol. 214(6):875（題名のみ。内容は未取得）。https://journals.biologists.com/jeb/article/214/6/875/10627/WEBB-SCALES-FAST-START-MANEUVERS
- 適用範囲: ニジマス、brook trout。ヤマメは未確認。著者名・年は、題名ページの巻号と私の記憶による（要約には著者が出なかった）。
- 証拠: [A（題名の存在のみ）]。

---

## 3. 資料間の矛盾・不一致

> 第2版の検索で出た矛盾を 1〜7、初版から残る未解決を 8〜11 に並べる。丸めず並記する。

1. **「S-start はカワカマス類に典型」（初版 F-19, M）と、トラウトの S 型の記録**: Harper & Blake 1990 は、ニジマスで C 字（単峰）と S 字（二峰）の 2 型を報告。Webb 1976 も L 型と S 型の 2 型を報告。→ **初版の記憶は不完全で、トラウトにも S 型がある**。用語も不一致（Webb は "L-start"、Harper & Blake は "C-shaped"）。S 型と C 型のそれぞれの頻度、ドリフト捕食で使う型は未確認。[F-31, F-32, F-19]
2. **ニジマスの最大加速度の値**: Harper & Blake 1990 は平均最大 59.7 ± 8.3 m/s²（0.32 m、加速度計）。出典未特定の要約は 97.8 m/s² と平均 34.38 m/s²。Webb 1976 は「加速度はサイズに依存しない」とする。→ **34〜98 m/s² の幅**があり、測定法（加速度計 vs 高速度映像の 2 階微分）、サイズ、水温、刺激で変わると考えられる（推論）。仕様では範囲で持つ。[F-31, F-32, F-33]
3. **継続時間の定義**: Webb 1976 は「主加速段階」で 0.07〜0.10 s、Harper & Blake 1990 は「逃避の継続時間」で最大 0.134 s（ニジマス）、出典未特定の要約は 33 cm のニジマスで各段階約 0.075 s（合計 0.150 s）。Stage の切り方と終了の判定が異なる。→ 比較するときは定義を揃える。実装では Stage 1・Stage 2 を自分で定義し明記する。[F-31, F-32, F-33, F-36]
4. **反応距離と流速**: Piccolo ら 2008（coho／steelhead 幼魚、0.29–0.61 m/s）は、流速の増加で検出距離が低下。UGA の学位論文要約（ニジマス・北極グレイリング）は、反応距離は流速の影響が小さい／ない。初版 F-26（M）は「流速が速いほど短くなる」。→ **種、実験条件、流速範囲、測定法の違いで未解決**。ヤマメは未確認。[F-42, F-43, F-26]
5. **迎撃速度**: Piccolo ら 2008 は、全流速で最大持続遊泳速度 Vmax で迎撃。出典未特定の要約（brown trout か Chinook か O. mykiss）は、期待される最大持続遊泳速度より遅く迎撃。→ 種、野外と水槽の違いの可能性。[F-41, F-42]
6. **迎撃の向き**: 初版 F-25（M）は「上流側・側方・上下へ迎撃」。出典未特定の要約は、餌の約 2/3 を定位点より下流側で捕獲。→ **下流側が多数**で、初版の記述は弱める。ヤマメでの割合は未確認。[F-41, F-25]
7. **サイズ依存の向きが発育段階で逆**: Webb 1976（9.6–38.7 cm）は、体長とともに継続時間が増える。Hale 1999・ICB 1996 の要約は、孵化直後〜卵黄吸収終了では継続時間が短縮し、成魚の継続時間は増える。→ 矛盾ではなく発育段階の違い（要約の記述）。ヤマメの稚魚〜成魚のどの範囲がどちらに当たるかは未確認（推論では卵黄吸収後の範囲）。[F-31, F-34]
8. **尾鰭の切れ込みの深さ（幼魚 vs 成魚）**（初版から残る）: r01 F-33（M）は「幼魚の方が深く、成魚で浅い」。写真 p049 の parr は約 5% SL と浅い（C(P)）。タイワンマス成魚は浅い二叉（B, PROXY）。→ **未解決**。[F-04]
9. **高速スタートの段階定義**（初版から残る）: Stage 3 の扱いや Stage 1 の終わりの定義は著者で揺れる（M）。Domenici & Blake 1997 の要約は Stage 3 を「可変」とする。[F-18, F-36]
10. **写真の胸鰭の姿勢と文献の期待**（初版から残る）: 写真は低速・定位で胸鰭を広げるフレームが多いが、単一フレームで、制動中か定位かを区別できない。文献（F-45）は、制動では胸鰭を**持続的に**体から離して張り出し、Kármán gaiting では一過的に展開・収納する、と時間変化で区別している。→ 単一フレームでは区別不能。[F-11, F-45]
11. **水槽と野外の差**: 水族館・水槽のフレームは、個体間距離・向き・上昇ピッチの根拠として使えない。文献側も、ほぼ全てが水槽・水路の実験で、野外のヤマメの渓流の定位とは条件が違う。[F-15, F-17, F-45, F-47]

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル/アニメ/行動実装に必要だが確認できなかった事項

> 状態: 〔確認〕=ニジマス等の PROXY で値あり／〔部分〕=一部のみ／〔未〕=未取得。優先度 ★★★＝実装の中核。

### 課題1: C-start / 逃避
| 必要な項目 | 状態 | 優先度 |
|---|---|---|
| ヤマメ（O. masou）の C-start 全般 | 〔未〕直接の資料なし | ★★★ |
| ニジマスの主加速段階の継続時間（体長別） | 〔確認〕0.07〜0.10 s（9.6〜38.7 cm、電気刺激）。F-31 | ★★ |
| **Stage 1 と Stage 2 を分けた継続時間（トラウト）** | 〔未〕Domenici & Blake 1997 の表は未読。PROXY の catfish Stage 1 の範囲のみ（F-36）。 | ★★★ |
| 体の屈曲角（Stage 1 終了時の頭—尾角度、曲率分布） | 〔未〕 | ★★★ |
| ピーク加速度（ニジマス） | 〔部分〕59.7 ± 8.3 m/s²（0.32 m）。他の値は出典未特定（F-32, F-33） | ★★ |
| ピーク速度（体長別）と移動距離（最初の 50〜100 ms） | 〔部分〕最大 2.85 m/s の記述（体長との対応不明）。稚魚期の Stage 2 距離は全長に比例（F-34）。成魚期の距離は〔未〕 | ★★ |
| 潜時（Mauthner の短潜時、長潜時、水温別） | 〔部分〕最小 5〜20 ms、サイズ非依存（F-35）。トラウトの水温別・視覚的接近は〔未〕 | ★★ |
| 旋回角度の分布と away 応答の割合 | 〔未〕（Domenici ら 2010/2011 の抄録は未検索） | ★★ |
| 反動旋回の有無（L 型 vs S 型）の頻度 | 〔未〕 | ★★ |
| Webb 1978（7 種の体形と性能）、Webb 1977（中央鰭切除）の内容 | 〔未〕検索せず（予算外） | ★ |

### 課題2: 捕食ストライク
- **攻撃開始距離（反応距離）の数値（ヤマメ／トラウト）**: 〔未〕。流速との関係は文献間で食い違う（F-42, F-43）。
- **迎撃速度**: 〔部分〕Vmax で迎撃（coho／steelhead、F-42）／それより遅い（出典未特定、F-41）。ヤマメは〔未〕。
- **口の開き（開口量、開口の時間）、吸引**: 〔未〕。サケ科の摂餌運動学の検索（クエリ 12）は、トラウトの結果が出なかった（r07 も同様）。
- **捕食後の減速・旋回・定位点への復帰の時間と経路**: 〔未〕。迎撃の約 2/3 が下流側（F-41, 出典未特定）という幾何の示唆のみ。
- **最大追跡距離（流速・餌・体長別）**: 〔未〕。
- **ドリフト捕食が高速スタート（C/S 型）に当たるか**: 〔未確認〕。F-36 の要約は、高速スタートは逃避と摂餌ストライクの両方を含むとするが、サケ科のドリフト捕食がどちらに近いかは不明。
- **日本語資料**: ヤマメ／渓流魚の採餌・定位の日本語検索（クエリ 21）は、数値を含む資料が出なかった。

### 課題3: 旋回・減速
- **最小旋回半径**: 〔確認〕0.17 L（Webb 1976）、0.18 L（Webb 1983）、バス 0.11 L。F-31, F-37。これは限界性能の最小値。**通常遊泳の旋回半径、曲率分布**は〔未〕。
- **旋回時の鰭の関与**: 〔部分〕胸鰭（外側の鰭で横力、内側で後方推力。F-44）。背鰭・臀鰭・腹鰭の定量は〔未〕（題名のみ F-49）。ロール・ピッチ連動は〔未〕。
- **胸鰭制動と減速の時間スケール**: 〔部分〕制動時の胸鰭の持続的な張り出し（F-45）。減速時間は〔未〕。
- **バースト&コースト**: 〔部分〕PROXY（コイ約 45%、F-39）。サケ科は〔未〕。

### 課題4: 流れの中の定位保持
- **尾の微小振動（振幅・周波数）、体のピッチ・ロールの補償**: 〔未〕。Kármán gait の振幅は自由流の約 3 倍（F-47）という相対値のみ。
- **胸鰭の使い方**: 〔確認〕制動／Kármán gaiting（F-45）、ホバリング（F-44）。**数値（角度、周波数）は〔未〕**。
- **底に押し付ける定位（負の揚力）**: 〔未〕。仮説を検証した論文の存在のみ（F-48）。
- **野外ヤマメの定位点の流速（焦点流速）、底からの高さ、頭の向き**: 〔未〕（F-01 の「生息流速」は別物の可能性）。
- **ホバリングのコスト**: 〔未〕。題名のみ（F-49）。

### 課題5: 加速・減速の時間スケール
- **自発的な加減速（0 → 巡航、巡航 → 0）の立ち上がり・減速時間**: 〔未〕。
- **逃避の加速の時間スケール**: 〔部分〕0.07〜0.10 s（主加速段階、F-31）。
- **突進・巡航速度**: 〔部分〕日本の魚道設計の一般値（約 10 L/s、2〜3 L/s。F-40）。ヤマメ固有は〔未〕。

### 仕様化にあたっての方針（提案）
- 下表を**暫定パラメータ**として外部から差し替え可能にし、「ニジマス PROXY」「未検証の補間」をコード・仕様書に明示する。
- 構造（3 段階、L／C 型と S 型の選択、往復の幾何、胸鰭の 2 モード、Kármán gait の切り替え）は文献で裏付けが取れた（A）。数値は PROXY。

| パラメータ | 暫定値 | 根拠・ランク | 備考 |
|---|---|---|---|
| 主加速段階の継続時間 | 0.07 s（約 10 cm）〜0.10 s（約 39 cm）。中間は線形補間（私の判断） | F-31 [A, PROXY] | Stage 1/2 の内訳は〔未〕 |
| 逃避全体の継続時間（上限の目安） | 約 0.13 s（0.32 m のニジマス） | F-32 [A, PROXY] | 定義が F-31 と異なる |
| 最大加速度 | 約 35〜100 m/s²（平均最大 59.7 ± 8.3 を中心に） | F-32 [A], F-33 [C] | サイズ非依存（F-31） |
| 最小旋回半径（逃避・攻撃の限界） | 0.17〜0.18 L | F-31, F-37 [A, PROXY] | 通常の旋回は大きい（推論） |
| 逃避の型 | L／C 型と S 型の 2 型を確率で選択（頻度は〔未〕） | F-31, F-32 [A] | |
| 最小潜時 | 5〜20 ms | F-35 [A] | ヤマメ・水温別は〔未〕 |
| 迎撃速度 | その個体の最大持続遊泳速度（既定） | F-42 [A, PROXY] | F-41 は「より遅い」 |
| 定位点に留まる時間 | 観察時間の 8 割前後（平均 81%） | F-41 [C] | 出典未特定 |
| 迎撃の向き | 下流側 約 2/3（既定） | F-41 [C] | 出典未特定 |
| 乱流・障害物後流での遊泳 | 尾の振幅を自由流の約 3 倍、周波数を渦放出周波数に同期 | F-47 [A, PROXY] | 30〜70 cm/s の水路実験 |
| 突進速度／巡航速度 | 約 10 L/s／2〜3 L/s | F-40 [B] | ヤマメ固有は〔未〕 |
| バースト&コースト | 既定は無効寄り | F-39 [A, PROXY] | サケ科の頻度は〔未〕 |

---

## 5. 出典一覧（URL付き。重複排除）

> 全て検索結果に出た URL。個別の URL が当該の記述の出典かは、要約が特定していないものがある（F-33, F-35, F-40, F-41, F-42, F-43 の注記を参照）。URL は開いていない（WebFetch は使用せず）。

**(a) 先行ストリーム（r01・r02）からの二次引用（初版）**
- https://www.env.go.jp/council/09water/y0910-03/mat03.pdf （F-01）
- https://www.env.go.jp/info/iken/h180317a/a-2.pdf （F-01）
- https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html （F-01）
- https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf （F-02）
- https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ （F-03）
- https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus （F-04）
- https://www.fishbase.se/summary/16686 （F-04）
- https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T3.html （F-05）
- https://portalinvestigacion.uniovi.es/documentos/64b4eec52107cd1e6d71b7fe （F-06）
- https://link.springer.com/article/10.1023/A:1007646332666 （F-07）
- https://www.pref.saitama.lg.jp/b0915/kenkyuseika/yamame-hyouryujiki-tennenka.html （F-07）
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5551095/ ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/ （F-07, 候補）
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ （F-08, 近傍）
- https://sicb.org/?p=36638 （F-08）

**(b) 写真カタログの掲載ページ（C(P)）**: F-09 に ID 別に列記（初版のまま）。

**(c) 第2版の検索で得た URL（Part D）**
- 高速スタート・逃避:
  - https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance （F-31 Webb 1976）
  - https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo （F-32 Harper & Blake 1990）
  - https://journals.biologists.com/jeb/article-abstract/202/11/1465/7927/Locomotor-mechanics-during-early-life-history?redirectedFrom=fulltext ／ https://pubmed.ncbi.nlm.nih.gov/10229693/ （F-34 Hale 1999）
  - https://academic.oup.com/icb/article-abstract/36/6/695/263737?redirectedFrom=fulltext （F-34 Chinook）
  - https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity ／ https://journals.biologists.com/jeb/article/226/14/jeb245686/324853/Kinematics-and-behaviour-in-fish-escape-responses （F-35）
  - https://tethys.pnnl.gov/publications/kinematics-performance-fish-fast-start-swimming ／ https://iris.cnr.it/handle/20.500.14243/268028 （F-36 Domenici & Blake 1997）
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC4295168/ （F-36 PROXY catfish、対応未確認）
  - https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two?redirectedFrom=fulltext ／ https://cob.silverchair.com/jeb/article-pdf/102/1/115/2428221/jexbio_102_1_115.pdf （F-37 Webb 1983）
  - https://journals.biologists.com/jeb/article/208/5/929/15956/Fast-start-muscle-dynamics-in-the-rainbow-trout ／ https://pubmed.ncbi.nlm.nih.gov/15755891/ （F-38）
  - https://journals.biologists.com/jeb/article/214/6/875/10627/WEBB-SCALES-FAST-START-MANEUVERS （F-49 題名のみ）
- バースト&コースト・速度:
  - https://journals.biologists.com/jeb/article/97/1/169/34638/Energetic-advantages-of-burst-and-coast-swimming ／ https://journals.biologists.com/jeb/article/210/12/2181/16867/Kinematics-hydrodynamics-and-energetic-advantages （F-39）
  - https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000055vu-att/bunryu-shiryo-13.pdf ／ https://www.aomori-itc.or.jp/_files/00230483/241-244.pdf ／ https://www.aomori-itc.or.jp/_files/00229463/212-215.pdf ／ https://www.pref.nagano.lg.jp/suisan/jigyokenkyu/documents/05b.pdf ／ https://www.pref.okayama.jp/uploaded/attachment/136414.pdf （F-40、対応未確認）
- ドリフト捕食:
  - https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river ／ https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream ／ https://cdnsciencepub.com/doi/10.1139/cjfas-2020-0398 ／ https://link.springer.com/article/10.1007/s10641-013-0187-6 （F-41、対応未確認）
  - https://research.fs.usda.gov/treesearch/31556 ／ https://research.fs.usda.gov/treesearch/31555 ／ https://link.springer.com/article/10.1007/s10641-008-9330-1 （F-42 Piccolo ら 2008、対応未確認）
  - https://openscholar.uga.edu/record/3703/files/MerrittKieranMS.pdf ／ https://openscholar.uga.edu/record/20894/files/bozeman_bryan_b_201708_ms.pdf ／ https://openscholar.uga.edu/record/5581/files/Ridge%20Sliger%20Thesis%20Final.pdf （F-43、対応未確認）
- 鰭・定位・乱流:
  - https://journals.biologists.com/jeb/article-abstract/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout?redirectedFrom=fulltext ／ https://pubmed.ncbi.nlm.nih.gov/12547936 （F-44）
  - https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/ （F-45）
  - https://pubmed.ncbi.nlm.nih.gov/15339945/ ／ https://journals.biologists.com/jeb/article/206/6/1059/14048/The-Ka-rma-n-gait-novel-body-kinematics-of-rainbow ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6324577/ ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC2442850/ （F-46）
  - https://journals.biologists.com/jeb/article/216/18/3442/11608/The-effect-of-flow-speed-and-body-size-on-Karman ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/ （F-47）
  - https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding ／ https://journals.biologists.com/jeb/article-abstract/145/1/303/5622/Station-Holding-by-three-Species-of-Benthic-Fishes?redirectedFrom=fulltext （F-48）
  - https://journals.biologists.com/jeb/article/210/2/325/17120/Hydrodynamic-function-of-dorsal-and-anal-fins-in ／ https://journals.biologists.com/jeb/article/208/23/4479/15977/Locomotor-function-of-the-dorsal-fin-in-rainbow ／ https://journals.biologists.com/jeb/article/213/5/831/10106/Muscle-activity-and-hydrodynamic-function-of ／ https://journals.biologists.com/jeb/article/211/18/2931/17665/Pelvic-fin-locomotor-function-in-fishes-three ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC12280926 ／ https://journals.biologists.com/jeb/article/223/23/jeb223008/226046/Rheotaxis-revisited-a-multi-behavioral-and ／ https://pubmed.ncbi.nlm.nih.gov/17023602/ （F-49 題名のみ）

**(d) 検証用リード（URL なし・記憶。Part C）**: Weihs 1973; Webb 1976（→ F-31 で確認）, 1977, 1978, 1983（→ F-37 で確認）, 1989（→ F-48 で書誌確認）; Webb & Skadsen 1980; Webb & Fairchild 2001（書誌のみ確認、値は未取得）; Harper & Blake 1990（→ F-32 で確認）, 1991; Domenici & Blake 1991, 1997（→ F-36 で確認）; Domenici 2010; Domenici ら 2011; Domenici & Hale 2019（→ F-35 の候補）; Eaton ら 1977, 2001; Korn & Faber 2005; Hale 2002; Drucker & Lauder 2003（→ F-44 で確認）; Arnold ら 1991（→ F-48 で書誌確認）; Kalleberg 1958; Standen & Lauder 2007（題名のみ）; Standen 2010（題名のみ）; Walker 2004; Weihs 2002; Blake 2004; Liao ら 2003（題名のみ）; Liao 2004（→ F-46）, 2006（題名のみ）, 2007（総説、PMC に存在）; Taguchi & Liao 2011; Enders ら 2003; Fausch 1984; Hughes & Dill 1990; Hughes 1998; Hughes ら 2003（書誌のみ確認）; Hughes & Kelly 1996; Bachman 1984; Hill & Grossman 1993; Weihs 1974; Videler & Weihs 1982（→ F-39 で書誌確認）; Videler 1993; Beamish 1978。

---

## 6. 検索ログ

### 6-1 第2版で実行した検索（総数 26 回: standard 25、extended 1）

> 有用度: 高=数値や具体的な記述が得られ採用／中=一部採用または書誌・定性的な確認／低=書誌のみ・重複／無=採用できる情報なし。割当（最大 26 回、extended は最大 4 回）を使い切った。

| # | mode | クエリ（要旨） | 有用度 | 得たもの |
|---|---|---|---|---|
| 1 | standard | Domenici Blake 1997 kinematics and performance of fish fast-start swimming stage 1 stage 2 duration maximum acceleration | 中 | 3 段階の定義（F-36）。数値は無し |
| 2 | standard（domains: biologists, silverchair, PMC, harvard） | rainbow trout fast-start escape maximum acceleration m s-2 stage 1 duration ms stage 2 duration ms turning angle latency | 高 | 加速度・段階時間・旋回半径の数値（出典未特定を含む。F-33）、論文名リスト |
| 3 | standard（domains: biologists, silverchair） | Webb 1976 effect of size fast-start rainbow trout ... abstract | 高 | F-31 |
| 4 | standard（同上） | Harper Blake 1990 fast-start rainbow trout northern pike abstract ... | 高 | F-32 |
| 5 | standard | Hughes Hayes Shearer Young 2003 drift-feeding 3D videography brown trout reaction distance ... | 低 | 書誌のみ（F-41） |
| 6 | standard | drift-feeding trout reaction distance prey size water velocity ... return to focal position | 中 | UGA 学位論文の要約（F-43） |
| 7 | standard | Arnold Webb Holford 1991 pectoral fins station-holding Atlantic salmon parr abstract | 低 | 書誌のみ |
| 8 | standard（domains: biologists, silverchair, harvard, pubmed） | Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces ... | 中 | F-44、関連論文の題名（F-49） |
| 9 | standard（domains: biologists, pubmed, PMC） | Kinematics and muscle activity of pectoral fins in rainbow trout station holding in turbulent flow abstract | 高 | F-45 |
| 10 | standard（同上） | Liao 2004 neuromuscular control of trout swimming in a vortex street Karman gait ... | 高 | F-46、PMC の関連論文 |
| 11 | standard（domains: PMC, biologists） | effect of flow speed and body size on Kármán gait kinematics in rainbow trout ... | 高 | F-47 |
| 12 | standard（domains: biologists, PMC, oup, wiley, royalsociety） | rainbow trout prey capture kinematics time to peak gape ... suction ram feeding | 無 | トラウトの摂餌運動学は出ず（他種のみ） |
| 13 | standard | Piccolo Hughes Bryant 2008 water velocity ... drift-feeding juvenile coho salmon and steelhead | 高 | F-42 |
| 14 | standard | Webb Fairchild 2001 performance and maneuverability of three species ... | 低 | 書誌のみ。値は無し |
| 15 | standard（domains: silverchair, biologists） | Webb 1983 speed acceleration and manoeuvrability of two teleost fishes ... | 中 | F-37 の前半（抄録冒頭） |
| 16 | standard | "rainbow trout" "smallmouth bass" attacking live minnows turning radius ... Webb 1983 | 高 | F-37 の旋回半径の数値 |
| 17 | standard（domains: biologists, pubmed, PMC） | Fast-start muscle dynamics in the rainbow trout ... C-start | 低〜中 | F-38（数値は少ない） |
| 18 | standard（domains: PMC, biologists, royalsociety, oup, wiley） | juvenile Atlantic salmon OR brown trout OR Chinook escape response C-start latency ms ... | 中 | F-35、Chinook の発育研究（F-34） |
| 19 | standard（domains: biologists, pubmed, oup） | Locomotor mechanics during early life history ... salmonid fishes abstract | 高 | F-34 |
| 20 | standard | ヤマメ サクラマス 突進速度 体長 倍 毎秒 遊泳能力 魚道 設計 ... | 中 | F-40（出典文書は特定不能） |
| 21 | standard | ヤマメ 採餌行動 定位位置 流速 cm/s 流下無脊椎動物 攻撃 距離 体長 中野繁 ... | 無 | 数値を含む資料なし |
| 22 | standard（domains: biologists, PMC, royalsociety, pubmed） | burst-and-coast swimming salmonid trout energy savings ... Videler Weihs | 中 | F-39（PROXY のみ。サケ科は無し） |
| 23 | **extended** | drift-feeding salmonid foraging attack: fish left focal position, intercepted drifting prey at distance cm ... return time | 中 | F-41（出典未特定）。距離・復帰時間の数値は無し |
| 24 | standard（domains: biologists, pubmed, silverchair） | The role of the pectoral fins in station-holding of Atlantic salmon parr ... negative lift | 中 | F-48（仮説の記述。結果は無し） |
| 25 | standard | An escape theory model for directionally moving prey ... juvenile Chinook salmon Sabal 2020 | 無 | 行動生態の抄録のみ。今回の課題に不要 |
| 26 | standard（domains: pubmed, biologists, PMC, harvard） | Drucker Lauder 2003 pectoral fin rainbow trout DPIV ... | 低 | F-44 の補足（ホバリング時の横向き伴流） |

- **総検索回数: 26（standard 25、extended 1）。** 割当上限に到達したため、以後の検索はしていない。WebFetch は今回使用していない（初版で EGRESS_BLOCKED を確認済み）。
- 初版の「検索 0 件」は、今回の 26 回に含まれない。

### 6-2 次に検索予算が使えるときの優先クエリ

1. `Domenici Blake 1997 table stage 1 stage 2 duration turning angle rainbow trout brown trout` — Stage 別の値（★★★）。全文・表を読める資料（cob.silverchair.com の PDF など）を allowed_domains で狙う。
2. `Webb 1978 fast-start performance and body form in seven species of teleost fish` ／ `Webb 1977 median-fin amputation fast-start rainbow trout` — 体形・中央鰭の効果。
3. `Domenici 2010 context-dependent variability fish escape response` ／ `salmonid looming stimulus escape latency non-Mauthner` — 旋回角・away 応答の割合・潜時。
4. `Hughes Hayes Shearer Young 2003 brown trout reactive distance capture maneuver mean distance cm` — 反応距離・迎撃距離の数値。
5. `Standen Lauder 2007 brook trout dorsal anal fin turning` ／ `Standen 2010 pelvic fin trout maneuvering` — 背鰭・臀鰭・腹鰭の旋回での関与。
6. `Inherent instability leads to high costs of hovering near-neutrally buoyant fishes` ／ `Rheotaxis revisited` — ホバリングと定位。
7. `rainbow trout tail beat frequency amplitude holding station low flow velocity focal` ／ `salmonid focal point velocity height above substrate wild` — 定位時の尾の動き・焦点流速。
8. `ヤマメ アマゴ 流下 採餌 攻撃 反応距離 観察` ／ `魚道 ヤマメ 突進速度 体長` — 日本語資料（今回は数値が出なかった）。
