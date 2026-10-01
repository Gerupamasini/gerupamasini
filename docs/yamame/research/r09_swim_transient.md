# 過渡的運動（C-start・捕食ストライク・旋回・加減速・定位保持）— サケ科／ヤマメ（O. masou masou 河川型）の文献・写真調査 — r09

> 作成: ストリームR09（過渡的運動担当）。目的はヤマメ3Dモデルの遊泳アニメーション（C-start、捕食突進、旋回、加減速、定位保持）と行動モデルの仕様根拠収集。
>
> **この文書を使う前に必ず読むこと（調査の限界。重大）**
> 1. **本ストリームでは新規の文献検索が1件も成立していない。** 課題指定の出発点クエリ3本（Domenici & Blake 1997／rainbow trout C-start Stage 1・2／Webb 1976）を `mode: "extended"` で発行したが、3件とも「このセッションの WebSearch 上限（200/200、全ストリーム共有）に到達済みのため未実行」と返った。WebFetch（journals.biologists.com の Domenici & Blake 1997 のページ）は `EGRESS_BLOCKED`。以後の試行はしていない。上限を迂回する手段（Bash/curl、別経路の検索）は取っていない。上限の引き上げ（環境変数 `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`）は利用者側の操作で、サブエージェントからは要求できない。
> 2. したがって、**課題1〜5（C-start、捕食ストライク、旋回・減速、定位保持、加減速の時間スケール）について、検索要約で確認できた数値・記述は 0 件**。本書の材料は次の3系統だけである。
>    - **(i) 継承（Part A, F-01〜F-08）**: 先行ストリーム r01・r02 が検索要約から記録した記述のうち、運動性能・体型・鰭に関係するものを二次引用した。ランクは先行ストリームの付与を継承した（「r02 F-05」のように元の番号を併記）。**私は元の検索結果も原典も再確認していない。**
>    - **(ii) 写真由来 C(P)（Part B, F-09〜F-17）**: プロジェクトの参照写真70枚の注釈カタログ（`/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01〜c07.json`）のうち、水中（自然水中12枚・水族館11枚）の23枚の `posture_behavior`・`fins` 欄を私が読み、鰭の展開、姿勢、底からの高さなどを整理した。先行ストリーム r05〜r07 と同じ表記で **C(P)** とする。注釈は目視推定（px 計測）で、**私は画像そのものを見直していない**（JSON の記述のみ）。1フレームの静止画であり、運動の時間変化は分からない。
>    - **(iii) 記憶 M（Part C, F-18〜F-30）**: 私の記憶に基づく魚類運動学・行動生態学の知識。**全て未検証**。文献名・著者・年・誌名は「検証用リード」であり、URL は付けない（創作しない）。数値は「桁の目安」だけで、各項目に確信度（高・中・低）を付けた。**この確信度は私の記憶の自己評価であり、資料による裏付けではない。**
> 3. 結果として、**ヤマメ河川型の過渡的運動について、査読済みの実測値は本書にも先行ストリームにも存在しない**。Part C の数値は、仕様に入れる場合は「根拠なしの仮置き値」と明記し、検索予算が使えるときに §6 の再実行クエリで原典に置き換えること。
> 4. 「派生」「算出」と書いた値は、資料の比から私が換算したもので、資料に書かれた値ではない。写真由来の件数・角度は注釈者（AI）の目視推定である。
> 5. **証拠ランク**: A=査読論文・学術書・公的機関資料で、検索要約に数値/記述が明示（Part A は先行ストリームの付与を継承）／B=図鑑・博物館・自治体・公的DB／C=釣りメディア・個人サイト・出典不明、および C(P)=写真注釈の集計／M=記憶（未検証）。PROXY は scope に明記。

---

## 1. 要約（仕様に直結する結論）

> 1〜2 は調査の到達度、3〜14 は設計上の構造的結論（ランクは各 F を参照）、15〜18 は注意点。**数値で確定できる遷移運動パラメータは一つもない。**

1. **ヤマメ（河川型）の C-start・捕食ストライク・旋回・定位保持の実測値は、本書にも r01〜r07 にも存在しない。** 課題1〜5 の数値（継続時間、屈曲角、潜時、加速度、旋回半径、追跡距離、立ち上がり時間）は、全て未取得か M（桁の目安）である。仕様書では「未確定・差し替え可能なパラメータ」として扱うこと。[F-18〜F-30, §4]
2. 新規検索は 0 件。出発点クエリ3本は上限到達で未実行、WebFetch は遮断。再実行用の優先クエリを §6 に置いた。[§6]
3. **C-start は「Stage 1（準備: 体を C 字に屈曲）→ Stage 2（推進: 反対側へ屈曲して加速）→ Stage 3（可変: 巡航・滑走・再屈曲）」の3段階の状態機械で実装する構造が妥当**（Weihs 1973 の枠組み、M・確信度高）。各段の継続時間と屈曲角は、パラメータとして外から与える。[F-18]
4. **サケ科の逃避は C-start 系**（M・中）。S-start（体を S 字にして突進）は、カワカマス類などの待ち伏せ捕食者の捕食ストライクで報告された型（M・中）。**ヤマメの捕食に S-start を当てる根拠は確認できていない**ので、ドリフト捕食は C-start とは別の運動（中程度の加速の迎撃）として設計する。[F-19, F-25]
5. **逃避の継続時間・潜時などの時間スケールは体長に比例して伸びる傾向**（M・中）。実装は「基準体長に対する時間 × 体長比」で与え、温度補正を別に持つ。ヤマメの絶対値は未取得。加速度のサイズ依存の向きは、記憶が曖昧（低）。[F-22, F-21]
6. **逃避には「短潜時（Mauthner 細胞経路、刺激から数 ms〜十数 ms の桁、低〜中）」と「長潜時（数十 ms 以上、低）」の2系統がある**（M）。脅威の種類で、反応の遅れと応答確率を分けるとよい（音・接触・急な視覚的接近は短潜時、ゆっくり近づく大型物体は長潜時）。[F-20]
7. **逃避方向は刺激から遠ざかる側が大多数で、旋回角の分布は広い**（M・中）。真後ろ一択にせず、刺激の方位と距離で分布を持たせる。[F-23]
8. **背鰭・臀鰭・尾鰭（中央鰭）は C-start の加速に寄与する**（Webb の中央鰭除去実験、M・低〜中）。Stage 2 で背鰭・臀鰭を立て、尾鰭を広げて有効面積を増やす姿勢を採る。写真では、背鰭は水中の自由遊泳・定位のフレーム19枚中13枚で立っていた。[F-24, F-10, F-13]
9. **ドリフト捕食は「定位点 → 餌の検出 → 迎撃（上流・側方・上下）→ 捕食 → 流下しながら定位点へ復帰」の往復の幾何で実装する**（M・中。査読論文名はリードを F-25 に列記）。この往復が行動モデル（なぜその場所にいるか、なぜ今泳いだか）の説明の核になる。[F-25]
10. **捕食の反応距離・追跡距離は、餌の大きさ・流速・視認性で変わる**（M・中・定性的）。数値は取得できていない。最大追跡距離は、行動ストリームで確認する。[F-26]
11. **河川型ヤマメの生息流速は 10〜35 cm/s（環境省資料の要約、B・継承）**。定位に使う局所流速（焦点流速）と周囲流速の区別は資料に無い。[F-01]
12. **旋回は体の屈曲を主とし、胸鰭・腹鰭・背鰭・臀鰭が補助する**（M・中・定性的）。トラウトの胸鰭は定位・旋回・制動・上下移動で使い方が違う（Drucker & Lauder 2003 を検証リードとする）。最小旋回半径は体長の 0.1〜0.3 倍の桁と記憶しているが（低）、**数値は採用不可**。[F-27, F-28]
13. **定位保持**: 写真（C(P)、水中19枚）では、底から体高の 0.25〜1 倍の高さで定位するフレームがあり（p005, p026, p036, p040, p014 など）、胸鰭を広げたのは7枚、腹鰭・臀鰭を下方へ開いたのは8枚、背鰭を立てたのは13枚だった。胸鰭を広げるのは低速・底近くの定位に偏るように見えるが、単一フレームで因果は言えない。休息中の parr が腹を底につけ、胸鰭・腹鰭で体を支える例は p017 の1枚（p049 は腹が岩に接する程度）。サケ科 parr が胸鰭で負の揚力を作って底に押しつけられるという報告（Arnold, Webb & Holford 1991）を記憶しているが未検証（M・中）。[F-11, F-12, F-14, F-28]
14. **岩・流木の周辺では、流れに乗る定位（Kármán gait）や、障害物の上流側の船首波での定位が報告されている**（Liao ら、M・中〜高）。障害物の近傍の定位行動と体の動き（低い尾びれ周波数・大きい体振幅）を、実装の選択肢にできる。乱流下の姿勢補償（ピッチ・ロール）は定性的に実装し、数値は仮置きにする。[F-29]
15. **バースト&コースト（尾を数回振って加速→直線で滑走）は理論的に省エネ**（Weihs 1974、M・中）。サケ科での使用頻度は未確認なので、高速域・加速直後の選択肢として持ち、既定値は無効寄りにする。[F-30]
16. **写真に見る体の曲がり**: 水中23枚のうち、ほぼ直線10・わずかに湾曲12・強い湾曲1（p007: 水面の波紋から、ライズ直後または水面近くの方向転換と推測、注釈者の推定）。定位・低速遊泳の体は直線に近く、強い湾曲は過渡的な運動に限る、という設計と整合する。ただし1フレームで、運動の位相は分からない。[F-16]
17. **体型の個体差が運動性能に及ぶ方向**（PROXY）: 流線形が強いほど最大代謝率が高い（ブラウントラウト、A）。放流・飼育由来は、丸い体、大きい尾柄、短い背鰭、欠けた鰭の方向（ギンザケ・ヤマメ、A/B）。大型の河川型ヤマメは、尾柄高・鰭の大きさに幼魚の特徴を残す（Kato 1991、A）。**運動性能への定量効果は未確認**。個体差の軸として使う場合は、見た目と性能を結びつける根拠が無いと明記する。[F-02, F-03, F-06, F-07]
18. **水族館の写真は定位・群れの根拠にしない**。parr が高密度の水槽で、頭が同じ向き・体長の 0〜1 倍の距離で並ぶフレームがあるが（p016, p018, p023, p028, p029）、野外の縄張り間隔を示すものではない。[F-17]

---

## 2. Findings

> **Part A（F-01〜F-08）: 継承した文献記述（運動・体型に関係するもの）。** 私は原典・元の検索結果を再確認していない。
> **Part B（F-09〜F-17）: 写真注釈カタログの集計 C(P)。**
> **Part C（F-18〜F-30）: 記憶 M。** 検証用リードに URL は付けない。

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
> - 全て検索で確認していない。**出典欄の文献は「記憶に基づく検証用リード」で、書誌（著者・年・誌名・巻頁）の細部に誤りがありうる。** URL は付けない。
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

### F-20 Mauthner 細胞と潜時（短潜時・長潜時）
- 主張/値: 逃避の C-start は、後脳の一対の大型ニューロン（Mauthner 細胞）が引き金になる**短潜時経路**で説明される。Mauthner 細胞が一側で発火すると、反対側の体幹筋が収縮し、体が刺激から遠ざかる側へ C 字に曲がる。ただし全ての高速スタートが Mauthner 細胞によるわけではなく、**Mauthner 細胞を介さない長潜時の C-start** も、ゆっくり近づく刺激（視覚的接近）などで起こる。
  - 潜時の桁（金魚などの記憶、温度依存）: 音・接触刺激の短潜時で、刺激から筋活動まで**数 ms〜10 ms 台**（確信度: 低〜中）。長潜時の経路は**数十 ms 以上**（確信度: 低）。トラウトの値は記憶に無い。
- 適用範囲: 条鰭類一般（主に金魚など）。ヤマメ・サケ科の潜時、温度依存（河川水温 5〜20℃）、視覚的接近刺激への潜時は未確認。
- 出典（検証用リード、URL なし）:
  - Eaton R.C., Bombardieri R.A., Meyer D.L. (1977) "The Mauthner-initiated startle response in teleost fish." J. Exp. Biol. 66:65–81.
  - Eaton R.C., Lee R.K.K., Foreman M.B. (2001) "The Mauthner cell and other identified neurons of the brainstem escape network of fish." Prog. Neurobiol. 63:467–485.
  - Korn H., Faber D.S. (2005) "The Mauthner cell half a century later: a neurobiological model for decision-making?" Neuron 47:13–28.
- 証拠: [M] 検索要約なし（記憶）。確信度: 高（Mauthner 細胞の役割と収縮の左右関係）、中（長潜時経路の存在）、低（ms の桁）。

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

### F-22 サイズ（体長）依存の方向
- 主張/値: 高速スタートの**継続時間は体長が大きいほど長くなる**（体長にほぼ比例、確信度: 中）。そのため、最高速度は m/s では体長とともに増える傾向、体長比（L/s）では小型ほど大きい傾向（確信度: 低〜中）。**最大加速度（m/s²）のサイズ依存の向きは、記憶が曖昧**（確信度: 低。「ほぼ一定または減少」の印象があるが、確認できない）。Webb (1976) は、ニジマスの体サイズと高速スタート性能の関係を調べた論文（題名より）。
- 適用範囲: 条鰭類一般、ニジマス（Webb 1976）。ヤマメの体サイズ範囲（parr 数 cm〜成魚 30 cm 前後）での検証は無い。
- 出典（検証用リード）: Webb (1976)、Domenici & Blake (1997)（書誌は F-18, F-19）。
- 証拠: [M] 検索要約なし。確信度: 中（時間が体長に比例）、低（加速度の向き）。

### F-23 逃避方向と旋回角の分布、状況依存性
- 主張/値: C-start は、**刺激から遠ざかる側へ頭を向ける応答が大多数**（刺激が側方のとき。割合は「高い」としか言えない。確信度: 中）。旋回角（Stage 1 の屈曲角と Stage 2 の向きの変化）の分布は広く、刺激の方位・距離・強度、捕食者の接近速度、個体の状態で変わる（確信度: 中）。応答は、刺激の強さや状況に依存して確率的に起こる。
- 適用範囲: 条鰭類一般。ヤマメの角度分布・応答確率は未確認。
- 出典（検証用リード、URL なし）:
  - Domenici P. (2010) "Context-dependent variability in the components of fish escape response: integrating locomotor performance and behavior." J. Exp. Zool. A 313:59–79.
  - Domenici P., Blagburn J.M., Bacon J.P. (2011) "Animal escapology I / II." J. Exp. Biol. 214:2463–2473, 2474–2487.
  - Domenici P., Blake R.W. (1991) "The kinematics and performance of the escape response in the angelfish (Pterophyllum eimekei)." J. Exp. Biol. 156:187–205.
- 証拠: [M] 検索要約なし。確信度: 中（away 応答が多数であること、状況依存）、低（割合・角度の数値）。

### F-24 中央鰭と体型が高速スタート性能に与える影響
- 主張/値: Webb は、ニジマスの中央鰭（背鰭・臀鰭・尾鰭）を切除した実験で、高速スタートの性能が低下することを報告した（題名より。効果の大きさは記憶に無い。確信度: 低〜中）。Webb (1978) は7種の硬骨魚で体型と高速スタート性能の関係を調べた（題名より。結論の細部は記憶に無い。確信度: 低）。一般に、体の後半部の深さ（有効な推進面積）が大きいほど加速に有利とされる（確信度: 低〜中）。
- 適用範囲: ニジマス（Webb 1977）、7種の比較（Webb 1978）。ヤマメは未確認。
- 出典（検証用リード、URL なし）:
  - Webb P.W. (1977) "Effects of median-fin amputation on fast-start performance of rainbow trout (Salmo gairdneri)." J. Exp. Biol. 68:123–135.
  - Webb P.W. (1978) "Fast-start performance and body form in seven species of teleost fish." J. Exp. Biol. 74:211–226.
- 証拠: [M] 検索要約なし。確信度: 低〜中。
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
- 含意（私の推論）: 行動モデルの「なぜその場所にいるか」を、定位点＝（流速の遅さ＋近くに速い流れ＋隠れ場所）で説明でき、「なぜ今泳いだか」を、餌の検出から迎撃までの1サイクルで説明できる。

### F-26 捕食の反応距離・追跡距離（定性的のみ）
- 主張/値: 餌を検出して攻撃を始める距離（反応距離）は、**餌が大きいほど、水が澄んで明るいほど大きく、流速が速いほど短くなる**（確信度: 中・定性的）。遠くまで追うほど、迎撃に必要な遊泳速度と遊泳コストが増え、最大追跡距離は魚の持続・短時間速度と流速で制限される（モデル上の考え方、確信度: 中）。数値（例: 反応距離が体長の何倍、最大追跡距離が何 cm）は、記憶に信頼できるものが無い。反応距離は「数十 cm〜体長の数倍」程度の桁と漠然と記憶しているが（確信度: 低）、**採用不可**。
- 適用範囲: ドリフト捕食のモデル研究の記憶（F-25 の文献）。ヤマメは未確認。
- 出典（検証用リード）: F-25 と同じ。
- 証拠: [M] 検索要約なし。確信度: 中（定性）、低（数値）。

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

### F-28 胸鰭の使い方（トラウト）と、底に押し付ける定位
- 主張/値: ニジマスの胸鰭は、定位・旋回・制動・上下移動などの行動ごとに異なる使い方をし、鰭が発生する力が水流計測（DPIV）で測られた（Drucker & Lauder 2003 の題名「Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces」より。具体的な角度・力の値は記憶に無い。確信度: 中・定性）。大西洋サケの parr は、胸鰭を使って底に押し付ける力（負の揚力）を作り、底近くで流れに耐える、という報告がある（Arnold, Webb & Holford 1991。確信度: 中）。底生魚の定位の研究（Webb 1989）も同様の考え方。
- 適用範囲: ニジマス、大西洋サケの parr（PROXY）。ヤマメは未確認。F-11, F-14 の写真（胸鰭・腹鰭を下へ押し付けて体を支える parr: p017）と矛盾しないが、写真は休息フレームで、流れの中での負の揚力の証拠ではない。
- 出典（検証用リード、URL なし）:
  - Drucker E.G., Lauder G.V. (2003) "Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces." J. Exp. Biol. 206:813–826.
  - Arnold G.P., Webb P.W., Holford B.H. (1991) "The role of the pectoral fins in station-holding of Atlantic salmon parr (Salmo salar L.)." J. Exp. Biol. 156:625–629.
  - Webb P.W. (1989) "Station-holding by three species of benthic fishes." J. Exp. Biol. 145:303–320.
  - Kalleberg H. (1958) "Observations in a stream tank of territoriality and competition in juvenile salmon and trout (Salmo salar L. and S. trutta L.)." Rep. Inst. Freshw. Res. Drottningholm 39:55–98.
- 証拠: [M] 検索要約なし。確信度: 中（鰭の使い分け、負の揚力の報告）、低（力の大きさ・角度）。

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

---

## 3. 資料間の矛盾・不一致

> 本ストリームは新規の検索が 0 件のため、新たな資料間の矛盾は検出できていない。以下は、既存の記述間で未解決の差と、定義の揺れである。

1. **尾鰭の切れ込みの深さ（幼魚 vs 成魚）**: 先行ストリームの記憶（r01 F-33, M）は「幼魚の方が切れ込みが深く、成魚で浅くなる」。一方、写真 p049（水族館の parr）の注釈は「浅く湾入（切れ込み深さ約5%標準体長）」で、parr の切れ込みが浅い例になっている（C(P)）。タイワンマスの成魚は浅い二叉（B, PROXY）。→ **未解決**。運動（推進面積、尾びれのアスペクト）に効くので、原典（図鑑・形態計測）で確認が必要。[F-04]
2. **高速スタートの段階定義**: Stage 3 の扱い（含めない著者と、可変段階として含める著者）や、Stage 1 の終わりの定義は、著者で揺れる（記憶、M）。→ **未確認**。実装では3段階の状態機械を採るが、段階の切り替えは「屈曲角が最大に達した時点」など、自分で定義して明記する。[F-18]
3. **ドリフト捕食は C-start 系か S-start 系か**: サケ科の逃避が C-start 系であること（M・中）と、S-start がカワカマス類の待ち伏せ捕食に典型であること（M・中）は、記憶では整合するが、**ヤマメの捕食突進がどちらに近いかは、記憶に無い**。→ **未確認**。[F-19]
4. **サイズ依存の向き（加速度）**: 継続時間が体長に比例して伸びることには確信があるが（M・中）、最大加速度（m/s²）のサイズ依存の向きは記憶が曖昧（M・低）。→ **未確認**。[F-22]
5. **写真由来の胸鰭の姿勢と、文献の期待の食い違いの可能性**: 写真（C(P)）では、胸鰭を広げたフレームが低速・定位に多いが、単一フレームであり、胸鰭を広げる＝制動中、という解釈も成り立つ（流れの中での定位か、減速中かを区別できない）。→ **未解決**。[F-11, F-28]
6. **水槽と野外の差**: 水族館・水槽のフレーム（p014〜p018, p027〜p029, p041, p042, p049）は、個体間距離・向き・上昇ピッチの根拠として使えない。自然水中の写真は p005, p006, p007, p023, p026, p036, p040, p054 の8枚のみ。[F-15, F-17]

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル/アニメ/行動実装に必要だが確認できなかった事項

> 課題1〜5 の項目は**全て未確認**（検索ゼロのため）。以下に、必要な値と優先度を示す。優先度 ★★★＝実装の中核で、数値が無いと挙動が決まらない。

### 課題1: C-start / 逃避

| 必要な項目 | 状態 | 優先度 |
|---|---|---|
| ヤマメ／トラウトの Stage 1・Stage 2 の継続時間（体長・温度別） | 未取得（F-21 は M・低〜中の桁） | ★★★ |
| 体の屈曲角（Stage 1 終了時の頭—尾角度、曲率分布） | 未取得 | ★★★ |
| Mauthner 潜時（トラウト、水温別）、視覚的接近への潜時 | 未取得（F-20 は M） | ★★ |
| ピーク加速度・ピーク速度（トラウトの体長別） | 未取得（F-21 は M・低） | ★★★ |
| 逃避の移動距離（最初の 50 ms、100 ms）、逃避後の遊泳距離 | 未取得 | ★★ |
| 旋回角度の分布と away 応答の割合 | 未取得（F-23 は定性的 M） | ★★ |
| サイズ依存（parr 数 cm〜成魚 30 cm） | 未取得（F-22 は M） | ★★ |
| Webb 1976/1978、Domenici & Blake 1997、Harper & Blake 1990 の本文・表 | **原典を一度も開けていない** | ★★★ |

### 課題2: 捕食ストライク
- ヤマメ／トラウトの攻撃開始距離（反応距離）、攻撃中の速度プロファイル、迎撃の方向（上流／側方／上下）の割合: **未取得**（F-25, F-26 は M・定性的）。
- 口の開き（開口量、開口の時間）と吸引: ヤマメ固有の値は **未取得**（r07 も同様）。
- 捕食後の減速・旋回・定位点への復帰の時間、復帰経路（流下しながら戻る距離）: **未取得**。
- 最大追跡距離（流速・餌サイズ・体長別）: **未取得**。
- ドリフト捕食が高速スタート（C/S-start）に当たるかどうか: **未確認**（§3-3）。
- 日本語資料（渓流魚の流下餌採餌、定位点）: **日本語の検索が 0 件**。

### 課題3: 旋回・減速
- 最小旋回半径／L（トラウト）、旋回中の体の曲率分布: **未取得**（F-27 の「0.1〜0.3 L」は M・低で採用不可）。
- 旋回時の胸鰭・腹鰭・背鰭・臀鰭の関与の定量（角度、タイミング）: **未取得**。ロール・ピッチ連動: **未取得**。
- 胸鰭による制動の方法と減速の時間スケール: **未取得**（F-28 は M・定性的）。
- サケ科でのバースト&コースト: **未確認**（F-30）。

### 課題4: 流れの中の定位保持
- 尾鰭の微小振動（振幅・周波数）、胸鰭の使い方、体の傾き（ピッチ）、乱流下の補償動作の**数値**: **未取得**（F-29 は M・定性的）。
- ホバリング（流れの無い所での位置保持）の鰭の使い方: **未取得**。
- 野外のヤマメの定位点の流速（焦点流速）、定位の高さ、頭の向き: **未取得**（F-01 は「生息流速」で別物の可能性）。

### 課題5: 加速・減速の時間スケール
- 0 → 巡航の立ち上がり時間、巡航 → 0 の減速時間（自発的な加減速）: **未取得**（F-30）。
- 巡航の尾びれ周波数と速度の関係は、定常遊泳ストリームの担当（本書は扱わない）。

### 仕様化にあたっての方針（提案）
- 上記の数値は、**パラメータ化して外部から差し替え可能にし、「根拠なしの仮置き」であることをコード・仕様書上で明示する**。
- 逃避・捕食・旋回・定位の**構造**（3段階、往復の幾何、鰭の切り替え、Kármán gait の選択肢）は、Part C の文献リードに基づく設計として提示できるが、リードの原典確認が先。

---

## 5. 出典一覧（URL付き。重複排除）

> 本ストリームの検索で得た URL は **0 件**。以下は (a) 先行ストリーム r01・r02 の検索要約に出たものの二次引用、(b) 写真カタログの各写真の掲載ページである。私は、これらのページを開いていない（WebFetch は遮断）。Part C の文献は URL なしの検証用リード（F-18〜F-30 の各項に書誌）。

**(a) 先行ストリームの二次引用**
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
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5551095/ （F-07, 候補）
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/ （F-07, 候補・Fenkes et al. 2018）
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ （F-08, 近傍）
- https://sicb.org/?p=36638 （F-08）

**(b) 写真カタログの掲載ページ（C(P)）**: F-09 に ID 別に列記（ana.co.jp、fish.shimano.com、ameblo.jp、note.com、hitoumi.jp、plaza.rakuten.co.jp、gao-aqua.jp、hatenablog.com、tonysharks.com、parks.or.jp、web.tsuribito.co.jp）。

**(c) 検証用リード（URL なし・記憶）**: Weihs 1973; Webb 1976, 1977, 1978, 1983, 1989; Webb & Skadsen 1980; Webb & Fairchild 2001; Harper & Blake 1990, 1991; Domenici & Blake 1991, 1997; Domenici 2010; Domenici et al. 2011; Domenici & Hale 2019; Eaton et al. 1977, 2001; Korn & Faber 2005; Hale 2002; Drucker & Lauder 2003; Arnold et al. 1991; Kalleberg 1958; Standen & Lauder 2007; Standen 2010; Walker 2004; Weihs 2002; Blake 2004; Liao et al. 2003; Liao 2004, 2006, 2007; Taguchi & Liao 2011; Enders et al. 2003; Fausch 1984; Hughes & Dill 1990; Hughes 1998; Hughes et al. 2003; Hughes & Kelly 1996; Bachman 1984; Hill & Grossman 1993; Weihs 1974; Videler & Weihs 1982; Videler 1993; Beamish 1978（書誌は F-18〜F-30 の各項）。

---

## 6. 検索ログ

### 6-1 実行した試行（全て不成立）

| # | 種別 | クエリ／URL | mode | 結果 |
|---|---|---|---|---|
| 1 | WebSearch | Domenici Blake 1997 kinematics and performance of fish fast-start swimming | extended | 未実行（上限 200/200 到達） |
| 2 | WebSearch | rainbow trout C-start escape stage 1 stage 2 duration turning angle acceleration | extended | 未実行（同上） |
| 3 | WebSearch | Webb 1976 fast-start rainbow trout body size | extended | 未実行（同上） |
| 4 | WebFetch | https://journals.biologists.com/jeb/article/200/8/1165/7547/The-kinematics-and-performance-of-fish-fast-start | — | EGRESS_BLOCKED（journals.biologists.com） |

- 有用ヒット数: 0。以後の検索・取得は試行していない（上限到達を確認し、迂回はしていない）。
- ローカルの作業: r01〜r07（`/home/user/gerupamasini/docs/yamame/research/`）の関連記述の抽出、写真カタログ70枚のうち水中23枚の `posture_behavior`・`fins`・`body_straightness`・`context` の集計（これは検索ではない）。r01〜r07 のうち、運動に直接関係する記述は r01 F-32（流速）、r02 F-18・F-20（体型）などの周辺情報だけだった。

### 6-2 検索予算が使えるときの再実行クエリ（優先順）

> 各クエリの末尾は、解消したい Gap を示す。`allowed_domains` の例: journals.biologists.com, royalsocietypublishing.org, ncbi.nlm.nih.gov, sciencedirect.com, springer.com, wiley.com, nrcresearchpress.com, jstage.jst.go.jp, cir.nii.ac.jp, researchgate.net。

**課題1（C-start）**
1. `Webb 1976 effect of size on fast-start performance of rainbow trout Salmo gairdneri piscivorous predator-prey` — F-21, F-22 の原典
2. `Domenici Blake 1997 kinematics and performance of fish fast-start swimming stage 1 stage 2 maximum acceleration` — F-18, F-21
3. `Harper Blake 1990 fast-start performance of rainbow trout and northern pike` — F-19, F-21
4. `Webb 1978 fast-start performance and body form in seven species of teleost fish` — F-24
5. `Webb 1977 median-fin amputation fast-start rainbow trout` — F-24
6. `rainbow trout escape response latency temperature Mauthner` — F-20
7. `salmonid escape response looming stimulus latency non-Mauthner C-start` — F-20
8. `juvenile salmonid fast-start escape turning angle away response stimulus direction` — F-23
9. `Domenici 2010 context-dependent variability fish escape response` — F-23
10. `Domenici Hale 2019 escape responses of fish review kinematics` — F-18〜F-23 の総説（全体の確認用）
11. `brown trout brook trout escape response fast start kinematics size temperature` — 近縁種の PROXY
12. `ヤマメ 逃避反応 急発進 C字 屈曲` ／ `渓流魚 逃避 反応 潜時` — 日本語の有無の確認

**課題2（捕食ストライク）**
13. `trout drift feeding attack distance reaction distance prey size water velocity` — F-26
14. `Hughes Hayes Shearer Young 2003 three-dimensional videography brown trout drift feeding` — F-25, F-26
15. `trout feeding strike kinematics drift prey capture maneuver return to focal point` — F-25
16. `brook trout rainbow trout attack speed capture maneuver` — 近縁種
17. `Hughes Kelly hydrodynamic model energetic cost swimming maneuvers drift feeding salmonids` — F-25
18. `Bachman 1984 foraging behavior free-ranging wild hatchery brown trout` — F-25
19. `salmonid prey capture mouth gape suction strike time` — 口の開き（r07 とも連携）
20. `ヤマメ 捕食 突進 距離 流下 餌` ／ `渓流魚 流下 採餌 定位 反応距離` — 日本語（アマゴ・ヤマメ・イワナ）
21. `Nakano 1995 red-spotted masu salmon dominance hierarchy foraging` ／ `Nakano Furukawa-Tanaka 1994 foraging tactics chars` — 日本の渓流魚の採餌（行動ストリームとの重複確認）
22. `maximum chase distance trout drift feeding swimming speed burst` — 最大追跡距離

**課題3（旋回・減速）**
23. `trout minimum turning radius maneuverability body length` — F-27
24. `Webb Fairchild 2001 performance and maneuverability of three species of teleostean fishes` — F-27
25. `Webb 1983 speed acceleration and manoeuvrability of two teleost fishes` — F-27
26. `Drucker Lauder 2003 function of pectoral fins in rainbow trout behavioral repertoire hydrodynamic forces` — F-28
27. `Standen Lauder 2007 dorsal anal fins brook trout hydrodynamic function` ／ `Standen 2010 pelvic fins trout` — F-27
28. `burst and coast swimming salmonids deceleration` — F-30
29. `Weihs 2002 stability versus maneuverability aquatic locomotion` — F-27
30. `fish turning curvature body bending maneuver rainbow trout kinematics` — 曲率分布
31. `pectoral fin braking trout deceleration` — F-28, F-30
32. `rainbow trout roll pitch coupling turn banking` — ロール・ピッチ連動

**課題4（定位保持）**
33. `trout holding station current pectoral fin tail beat position` — F-29
34. `Arnold Webb Holford 1991 pectoral fins station-holding Atlantic salmon parr` — F-28
35. `Webb 1989 station-holding benthic fishes negative lift` — F-28
36. `Liao 2003 Karman gait rainbow trout vortices` ／ `Liao 2006 rainbow trout turbulence lateral line vision body kinematics` — F-29
37. `Taguchi Liao 2011 rainbow trout turbulence oxygen consumption` ／ `Enders 2003 turbulence cost swimming juvenile Atlantic salmon` — F-29
38. `trout hovering low speed pectoral fin tail beat frequency amplitude` — 微小振動の数値
39. `salmonid focal point velocity depth height above substrate wild` — 定位の高さ・焦点流速
40. `Kalleberg 1958 territoriality juvenile salmon trout stream tank` — parr の休息姿勢と鰭

**課題5（加減速の時間スケール）**
41. `rainbow trout acceleration from rest voluntary swimming time to cruising speed` — 立ち上がり時間
42. `salmonid deceleration gliding coasting drag time constant` — 減速
43. `Videler Weihs 1982 burst-and-coast` ／ `Weihs 1974 energetic advantages burst swimming` — F-30

**日本語の補強（検索ゼロの穴埋め）**
44. `ヤマメ 遊泳 速度 尾びれ 周波数` ／ `サクラマス 遊泳力 突進速度 体長` — 遊泳能力（水産工学、魚道設計の資料が出る可能性が高い）
45. `魚道 ヤマメ 突進速度 巡航速度 体長` ／ `サケ科 魚 突進速度 遊泳速度 魚道設計` — 日本の魚道設計の公的資料（バースト速度の数値源）
