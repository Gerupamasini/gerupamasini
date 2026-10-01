# 定常遊泳のキネマティクス（体波・振幅包絡・尾鰭振動数・速度）— サケ科／ヤマメ向け文献調査

> 作成: ストリームR08（定常遊泳キネマティクス担当）。目的はヤマメ（O. masou masou 河川型）の3D遊泳アニメーション仕様（体波、振幅包絡、尾鰭振動数、速度帯）の根拠収集。
>
> **この文書を使う前に必ず読むこと（調査の限界。重大）**
> 1. **本ストリームでは検索を1回も実行できていない。** セッションの WebSearch 上限（200回、他ストリームと共有）が既に使い切られており、課題指示の出発点クエリのうち4本（Videler & Hess 1984／Di Santo 2021／Liao 2003 Kármán gait／ヤマメ 遊泳速度 巡航速度 突進速度 魚道）を試したが、4件とも「上限到達（200/200）につき未実行」と返った。WebFetch も doi.org に対して `EGRESS_BLOCKED` だった。上限を迂回する手段（別経路での検索など）は取っていない。上限の引き上げ（環境変数 `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`）は利用者側の操作で、サブエージェントからは要求できない。
> 2. したがって本書の材料は次の2系統のみで、**新規の文献検索で得た証拠はゼロ**である。
>    - **(i) 継承**: 先行ストリーム r02 の F-20（ブラウントラウトの体型と持続遊泳能力）。ランクは先行ストリームの付与を継承した。元の検索結果も原典も私は再確認していない。
>    - **(ii) 記憶 M**: 私の記憶に基づく魚類遊泳学の知識。**検索で未確認**。資料名・著者・誌名・巻・頁・数値のいずれも誤りを含みうる。ヤマメ固有ではなく、ほぼ全てが PROXY（ニジマス、タラ類、サバ、一般的な魚類理論）である。**確信度**（高・中・低）は私の主観で、証拠ランクの代わりにはならない。
> 3. **本書の数値を仕様書にそのまま引用してはならない。** 仕様に数値を入れる場合は「検証前の仮置き」と明記し、本書の F 番号と確信度を併記すること。出典の URL は1件を除き取得できておらず、**創作していない**（書誌情報のみ）。
> 4. 「派生」「算出」と書いた数値は、記憶した値から私が換算した値で、資料に書かれた値ではない。
> 5. ヤマメまたはサクラマスの遊泳キネマティクス実測値、日本語の遊泳能力・魚道設計基準値は、**本書にも先行ストリームにも存在しない**（§4 参照）。

---

## 1. 要約（仕様に直結する結論。全て検証前）

1. **本書の全内容は M（記憶）または継承であり、検索による裏付けは無い。** 数値は「検証前の仮置き」としてのみ使うこと。[冒頭注記、§6]
2. サケ科（ニジマス、ブラウン、おそらくヤマメ）は一般に subcarangiform（準カランギフォーム）型に分類され、体波は主に体の後半部にあり、振幅は尾に向かって増える。ヤマメ自体の分類資料は未確認。確信度: 中。[F-01]
3. 横振幅包絡 A(x)/L は「頭部で小さく、胴前部〜胴中央で緩やかに増え、尾柄〜尾鰭で最大」という単調増加の形が基本で、Videler & Hess らは低次（二次）の多項式で近似した、という記憶がある。**係数は未取得**。確信度: 形は中、式は低。[F-02]
4. 頭部にも小さな側方運動（尾と逆位相の反動 recoil とヨー）がある。「頭は動かず尾だけ振る」実装は不適切。大きさは未確認。確信度: 中（存在）／無し（大きさ）。[F-03]
5. 尾端の振幅は、速度が中〜高の領域で体長のおよそ0.2倍でほぼ一定（Bainbridge 1958、ニジマス等）という記憶。**peak-to-peak か片振幅か不明**で、2倍の差が出る。確信度: 低〜中。[F-04]
6. 尾鰭振動数は遊泳速度にほぼ線形に増え、1振動あたりの進行距離（ストライド長）は体長の0.6〜0.8倍程度という記憶。これから **f ≈ 1.4 × (U/L) Hz** という暫定式を派生した（例: 1 BL/s で約1.4 Hz、3 BL/s で約4.3 Hz、10 BL/s で約14 Hz）。**速度ゼロへの外挿は禁止**（低速は胸鰭主体で尾の振動数は0にならない）。確信度: 低〜中。[F-05, F-07]
7. ストローハル数 St = f·A/U は巡航する遊泳動物で0.2〜0.4（多くは0.25〜0.35）（Taylor et al. 2003、Triantafyllou et al. 1993）。A は尾端の peak-to-peak 振幅。記憶した A≈0.2 L と組み合わせると、ストライド長は0.5〜1.0 L となり、要約6と矛盾しない（派生の検算）。確信度: 中。[F-06, F-07]
8. 推進波の速度 V は遊泳速度 U より大きい必要がある（Lighthill）。V/U の典型値は1を少し超える程度という記憶（1.1〜1.4前後）。体波長 λ は体長前後という記憶。いずれも数値は低確信。[F-08, F-09]
9. 遊泳能力の区分は Beamish (1978) による時間基準: sustained（持続、約200分超）／prolonged（長時間、約20秒〜200分）／burst（バースト、約20秒未満）。確信度: 高。**BL/s での境界は資料で未確認**。[F-10]
10. Ucrit は Brett (1964) の段階的流速増加法で測る持久指標。サケ科の値は2〜5 BL/s の幅という記憶で、体が大きいほど BL/s では低い。課題文の「3–5 BL/s?」と記憶の幅はおおむね一致するが、**どちらも未検証**。確信度: 低。[F-11]
11. バースト速度の目安は約10 BL/s（Wardle 1975 などで引用）。体長が大きいほど BL/s は低下する。確信度: 中（目安）／低（数値）。[F-12]
12. 高速域では、魚は「バースト＆コースト（数振動の加速→滑走）」を使う（Weihs 1974）。ヤマメの摂餌攻撃や定位復帰の演出に使える。確信度: 中。[F-13]
13. 低速域は胸鰭が主で、速度が上がると尾鰭が加わる、という段階的な歩容の推移がサケ科でも報告されている（Drucker & Lauder 2003 など）。**転換速度は未取得**。確信度: 低（数値）。[F-14]
14. 流れの中で定位する際、胸鰭は体を底へ押し付ける負の揚力を生む（サケのパーでの報告、Arnold, Webb & Holford 1991）。ヤマメの「底に張り付く」定位姿勢の根拠候補。確信度: 中。[F-15]
15. **運動学は地面に対する速度ではなく、水に対する速度（対水速度）で駆動すること。** 流速 v の流れの中で定位しているヤマメは、対地速度が0でも対水速度 v で泳いでいる。これは物理的に当然の帰結で、確信度: 高。[F-16]
16. Kármán gait（Liao et al. 2003）: 渦列の中で、ニジマスは大振幅・低周波数で、尾鰭の振動を渦の放出周波数に同期させ、筋活動を減らす。自由流での巡航より周波数が低く振幅が大きい、という方向のみの記憶。確信度: 中（方向）／無し（数値）。[F-17, F-18]
17. Entraining（弓波の利用）では、障害物の前面の圧力域で尾振りがほぼ止まり、位置保持できる（Webb 1998、Przybilla et al. 2010 ほか）。確信度: 中（定性）。[F-19]
18. **最重要の一次資料のうち、値を取得できなかったもの**: Webb, Kostecki & Stevens (1984)（ニジマスの体長・速度別の運動学）、Akanyeti & Liao (2013) 2編（Kármán gait の体波モデル、流速・体長の効果）、Di Santo et al. (2021)（多種の収斂）、Videler & Hess (1984)（振幅包絡の実測）。再検索の最優先対象（§4）。[F-20, F-21, F-22]
19. 日本語の魚道設計基準値（体長ごとの巡航速度・突進速度）は取得できていない。用語（巡航速度、突進速度）の対応は M で、値は無い。[F-23]
20. 体型が流線形の魚ほど最大代謝率が高く、持続遊泳能力に影響する（ブラウントラウト、PROXY、継承）。体高・体型の個体差を遊泳性能（持久力）に連動させる設計の根拠候補。[F-24]

### 設計用の暫定値（根拠は M と派生。検証後に差し替える。仕様書に転記する際は「仮置き」と明記）

| パラメータ | 暫定値 | 幅 | 出所 | 確信度 |
|---|---|---|---|---|
| 尾端振幅（peak-to-peak）/ L | 0.2 | 0.15–0.25（振幅の定義が未確認） | F-04 | 低〜中 |
| ストライド長 U/(f·L) | 0.7 | 0.5–1.0 | F-05, F-07 | 低〜中 |
| 尾鰭振動数 f [Hz] | 1.4 × (U/L) | 速度ゼロへ外挿しない | F-05（派生） | 低 |
| ストローハル数（検算用） | 0.3 | 0.2–0.4 | F-06 | 中 |
| 体波長 λ / L | 1.0 | 0.7–1.1 | F-09 | 低 |
| 波速比 V/U | 1.2 | 1.05–1.4 | F-08 | 低 |
| バースト速度（目安） | 約10 BL/s | 体が大きいほど低い | F-12 | 低〜中 |
| Ucrit（目安） | 約3 BL/s | 2–5 | F-11 | 低 |
| 頭部の側方運動振幅 | 未取得（調整パラメータ、尾端の数分の一以下） | — | F-03 | 無し |
| 振幅包絡の形 | 頭で小、尾に向かい単調増加（二次式型） | 係数は未取得 | F-02 | 形: 中 |

---

## 2. Findings

> ランクの表記: A=査読論文・公的機関資料で、検索要約に明示（先行ストリームの付与を継承）／B=図鑑・博物館・自治体等／C=二次資料・個人サイト等／M=記憶（未検証）。**確信度**は M の項に付ける私の主観（高・中・低）。
> 「出典」は書誌情報のみで、URL は取得できていない（創作していない）。

### F-01
- 主張/値: サケ科の遊泳様式は一般に subcarangiform（準カランギフォーム）に分類される。体波は主に体の後半部に現れ、振幅は尾に向かって増える。ウナギ型（anguilliform）ほど体全体が大きく波打たず、マグロ型（thunniform）ほど尾柄・尾鰭に限られない中間の様式。
- 適用範囲: サケ科全般（ニジマス、ブラウントラウトで特によく研究される）。ヤマメ自体の分類資料は未確認（PROXY: サケ科一般）。
- 出典: Breder (1926) "The locomotion of fishes", Zoologica 4:159–297／Lindsey (1978) "Form, function and locomotory habits in fish", Fish Physiology vol. 7／Sfakiotakis, Lane & Davies (1999) "Review of fish swimming modes for aquatic locomotion", IEEE J. Oceanic Eng. 24:237–252。URL 未取得。
- 証拠: [M] 確信度: 中。分類名の対応（サケ科＝subcarangiform）は教科書的に見た記憶だが、原典での記述箇所は確認していない。
- 要検証キーワード: "subcarangiform salmonid swimming mode"、"Lindsey 1978 form function locomotory habits"。

### F-02
- 主張/値: 横振幅包絡 A(x)（x=頭からの距離）は、頭部で小さく、尾に向かって単調に増え、尾端で最大になる。Videler & Hess（1984）は、タラ類のセイス（Pollachius virens）とサバ（Scomber scombrus）の高速連続遊泳を高速撮影で解析し、体の各点の横方向の運動を波として分解した。振幅包絡は二次の多項式（A(x)=c1·x + c2·x² 型）で記述できたという記憶がある。サバでは体の前部（重心付近）に振幅の最小点があるという記憶もある。**係数、最小点の位置、速度による変化はいずれも未取得**。
- 適用範囲: PROXY:Pollachius virens、Scomber scombrus（海産の巡航型捕食魚）。サケ科への直接の適用は未確認。
- 出典: Videler & Hess (1984) "Fast continuous swimming of two pelagic predators, saithe (Pollachius virens) and mackerel (Scomber scombrus): a kinematic analysis", J. Exp. Biol. 109:209–228／Hess & Videler (1984) "Fast continuous swimming of saithe (Pollachius virens): a dynamic analysis of bending moments and muscle power", J. Exp. Biol. 109:229–251。URL 未取得。
- 証拠: [M] 確信度: 形（単調増加）は中、二次式という点は低、係数は無し。
- 要検証キーワード: "Videler Hess 1984 amplitude envelope quadratic"、"saithe mackerel kinematic analysis lateral displacement".

### F-03
- 主張/値: 頭部は完全には静止せず、尾の動きに対する反動（recoil）として、逆位相の小さな側方運動とヨー（首振り）が生じる。Lighthill の large-amplitude elongated-body theory は、この反動を推力とともに予測する。頭部のヨー振幅は尾端より十分小さい。**数値は未取得**。
- 適用範囲: 一般的な魚類（理論）。サケ科での実測値は未確認。
- 出典: Lighthill (1960) "Note on the swimming of slender fish", J. Fluid Mech. 9:305–317／Lighthill (1971) "Large-amplitude elongated-body theory of fish locomotion", Proc. R. Soc. B 179:125–138。URL 未取得。
- 証拠: [M] 確信度: 存在は中、大きさは無し。
- 要検証キーワード: "head yaw amplitude trout swimming"、"recoil lateral head movement steady swimming"。

### F-04
- 主張/値: Bainbridge (1958) は、ニジマス・ウグイ属（dace）・キンギョの3種で、尾の振幅が体長の約0.2倍でほぼ一定で、速度の増加は主に尾鰭振動数の増加によるものだと報告した、という記憶。「速度 ≈ 振動数 × 振幅 × 定数」の関係。低速域では振幅が速度とともに増えて頭打ちになる可能性があるが、確認していない。**振幅が peak-to-peak か片振幅か、体長が全長か尾叉長かは未確認**。
- 適用範囲: PROXY:ニジマス（当時の学名 Salmo irideus または gairdneri）、dace、goldfish。サイズは体長数十 cm までの小〜中型魚。
- 出典: Bainbridge (1958) "The speed of swimming of fish as related to size and to the frequency and amplitude of the tail beat", J. Exp. Biol. 35:109–133。URL 未取得。
- 証拠: [M] 確信度: 低〜中。「0.2 L」の数字は記憶の核だが、定義が不明。
- 要検証キーワード: "Bainbridge 1958 tail beat amplitude 0.2 length trout dace goldfish"。

### F-05
- 主張/値: 尾鰭振動数 f は遊泳速度にほぼ線形に増える（Bainbridge 1958 ほか）。1尾鰭振動あたりに進む距離（ストライド長 U/f）は体長の約0.6〜0.8倍という数字が広く引用される、という記憶。体長が大きい魚は、同じ BL/s では振動数が低い（最大持続速度付近の振動数は体長にほぼ反比例する、という傾向）。
  - **派生**: ストライド長を0.7 L とすると f [Hz] ≈ 1.43 × (U/L)。例: 1 BL/s → 約1.4 Hz、2 → 約2.9 Hz、3 → 約4.3 Hz、5 → 約7.1 Hz、10 → 約14 Hz。実測では直線に正の切片があり、低速では歩容（胸鰭主体）が変わるため、U→0 への外挿は禁止。
- 適用範囲: PROXY:ニジマス、dace、goldfish（Bainbridge）。サケ科の他種、ヤマメへの適用は未確認。温度の効果は F-24 を参照。
- 出典: Bainbridge (1958) J. Exp. Biol. 35:109–133／Videler & Wardle (1991) "Fish swimming stride by stride: speed limits and endurance", Rev. Fish Biol. Fisheries 1:23–40／Webb, Kostecki & Stevens (1984)（F-21）。URL 未取得。
- 証拠: [M] 確信度: 低〜中。ストライド長の数字（0.6〜0.8 L）と原典の対応は未確認。派生式は本書の換算。
- 要検証キーワード: "stride length 0.7 body length tail beat trout"、"tail beat frequency swimming speed linear rainbow trout".

### F-06
- 主張/値: ストローハル数 St = f·A/U（f=尾鰭振動数、A=尾端の peak-to-peak 振幅、U=遊泳速度）は、巡航する魚・鳥・コウモリ・クジラ類でほぼ 0.2 < St < 0.4 に収まり、多くは 0.25〜0.35。振動する翼（フォイル）の推進効率が最大となる St は 0.25〜0.35 という理論結果。
- 適用範囲: 巡航中の魚類一般（PROXY: サケ科以外を含む）。バースト・加速・旋回中は対象外。
- 出典: Taylor, Nudds & Thomas (2003) "Flying and swimming animals cruise at a Strouhal number tuned for high power efficiency", Nature 425:707–711／Triantafyllou, Triantafyllou & Grosenbaugh (1993) "Optimal thrust development in oscillating foils with application to fish propulsion", J. Fluids Struct. 7:205–224。URL 未取得。
- 証拠: [M] 確信度: 中（範囲 0.2〜0.4 は広く引用される）。A の定義（peak-to-peak）の記憶は中。
- 要検証キーワード: "Strouhal number cruising 0.2 0.4 Taylor Nudds Thomas"、"Strouhal number trout swimming".

### F-07
- 主張/値: **派生（検算）**: F-04 の A/L≈0.2（peak-to-peak と仮定）と F-06 の St=0.2〜0.4 を St = f·A/U に代入すると、U/(f·L) = (A/L)/St = 0.5〜1.0。中央（St≈0.3）で約0.67。これは F-05 のストライド長0.6〜0.8 L と整合する。
  - A/L が片振幅（0.2 が半値）だった場合は peak-to-peak が0.4 L となり、ストライド長は1.0〜2.0 L となって F-05 と矛盾する。したがって 0.2 L は **peak-to-peak と読むのが整合的**、という推論であり、これは検証されていない。
- 適用範囲: 巡航中の魚類一般。PROXY。
- 出典: 本書の算出（F-04、F-05、F-06 の記憶値を使用）。
- 証拠: [M] 確信度: 低〜中。3つの記憶値が相互に整合するという点だけが根拠で、独立の裏付けではない。

### F-08
- 主張/値: 前進する推力を得るには、体を伝わる推進波の速度 V が遊泳速度 U より大きい必要がある（Lighthill の細長体理論）。V/U（波速比）の典型値は1を少し超える程度で、1.1〜1.4前後という記憶がある。スリップ（U/V）は0.7〜0.9程度。**サケ科・ヤマメでの実測値は未取得**。
- 適用範囲: 一般的な魚類（理論と複数種の実測）。PROXY。
- 出典: Lighthill (1960) J. Fluid Mech. 9:305–317／Lauder & Tytell (2006) "Hydrodynamics of undulatory propulsion", Fish Physiology vol. 23:425–468／Videler (1993) *Fish Swimming*, Chapman & Hall。URL 未取得。
- 証拠: [M] 確信度: 条件（V>U）は高、数値は低。
- 要検証キーワード: "wave speed ratio swimming speed trout body wave", "slip ratio undulatory swimming".

### F-09
- 主張/値: 体を伝わる波の波長 λ は、準カランギフォーム〜カランギフォームの魚で体長前後（およそ0.7〜1.1 L）という記憶。ニジマスの値は未確認。また速度が上がっても λ/L はあまり変わらない（振動数が上がる分、波速が上がる）という傾向の記憶があるが、確認していない。
- 適用範囲: PROXY: 一般的な魚類。
- 出典: なし（記憶）。確認すべき資料: Webb, Kostecki & Stevens (1984)／Videler & Hess (1984)／Di Santo et al. (2021)。
- 証拠: [M] 確信度: 低。**数値を仕様に転記してはならない。**

### F-10
- 主張/値: 遊泳能力の区分（Beamish 1978）: sustained（持続）は約200分を超えて疲労せず維持できる速度域、prolonged（長時間）は約20秒〜200分で疲労に至る速度域、burst（バースト）は約20秒未満で疲労に至る速度域。日本語の魚道設計での「巡航速度」「突進速度」は、おおむね prolonged／sustained と burst に対応する用語、という理解（記憶、対応は未確認）。
- 適用範囲: 魚類一般（サケ科のデータが多い）。
- 出典: Beamish (1978) "Swimming capacity", in Hoar & Randall (eds) *Fish Physiology* vol. 7 *Locomotion*, Academic Press, pp. 101–187。URL 未取得。
- 証拠: [M] 確信度: 区分の時間基準は高。日本語用語との対応は低。
- 要検証キーワード: "Beamish 1978 sustained prolonged burst 200 min 20 s"。

### F-11
- 主張/値: 臨界遊泳速度 Ucrit は Brett (1964) が導入した、流速を一定時間（例: 10〜60分）ごとに段階的に上げて疲労に至らせる試験の指標。Ucrit = U1 + (t1/t2) × U2（U1=最後まで完走した最高流速、U2=流速の増分、t1=疲労した段階での経過時間、t2=1段階の規定時間）。サケ科の Ucrit は、幼魚〜成魚で概ね2〜5 BL/s の幅（小型ほど BL/s では高い）という記憶。最適水温付近で最大になり、それより低温でも高温でも低下する、という傾向。
- 適用範囲: PROXY: ベニザケ（Oncorhynchus nerka）、ニジマスなどサケ科。ヤマメの値は未取得。
- 出典: Brett (1964) "The respiratory metabolism and swimming performance of young sockeye salmon", J. Fish. Res. Board Can. 21:1183–1226／Hammer (1995) "Fatigue and exercise tests with fish", Comp. Biochem. Physiol. 112A:1–20。URL 未取得。
- 証拠: [M] 確信度: 式は高、BL/s の値は低。
- 要検証キーワード: "Ucrit rainbow trout body lengths per second", "critical swimming speed Oncorhynchus masou".

### F-12
- 主張/値: バースト（突進）速度は約10 BL/s が目安とされる。Wardle (1975) は、魚の最大遊泳速度が筋の収縮速度に制限されることを示し、体長が大きい魚ほど BL/s としての最大速度は下がることを論じた、という記憶。最大振動数は体長にほぼ反比例し、高速では大きな魚ほど絶対速度は大きいが BL/s は小さい。
- 適用範囲: 魚類一般（PROXY）。サケ科の値の個別確認は未了。
- 出典: Wardle (1975) "Limit of fish swimming speed", Nature 255:725–727／Videler & Wardle (1991) Rev. Fish Biol. Fisheries 1:23–40。URL 未取得。
- 証拠: [M] 確信度: 目安としては中、サケ科の具体値は低。
- 要検証キーワード: "burst swimming speed 10 body lengths per second salmonid", "maximum swimming speed trout size".

### F-13
- 主張/値: 魚は高速域や間欠的な泳ぎで、数回の尾鰭振動で加速し、その後に体を真っすぐにして滑走（コースト）するバースト＆コースト（burst-and-coast）を使う。理論上、一定速度で泳ぐより省エネになる、という Weihs (1974) の解析。サケ科の摂餌攻撃（餌への突進と、そこから元の位置への復帰）でも、尾鰭の間欠的な駆動が見られるという一般的な記憶。
- 適用範囲: 魚類一般（PROXY）。ヤマメの実測は未確認。
- 出典: Weihs (1974) "Energetic advantages of burst swimming of fish", J. Theor. Biol. 48:215–229。URL 未取得。
- 証拠: [M] 確信度: 理論は中、ヤマメでの使用は低。

### F-14
- 主張/値: 低速域では胸鰭が主な推進・姿勢制御器官で、速度が上がると胸鰭に加えて尾鰭が加わり、さらに高速では尾鰭が主、胸鰭は畳まれるか姿勢制御に回る、という歩容（gait）の段階的な推移が魚類で広く知られる。ニジマスの胸鰭については、定位・直進・旋回・制動のそれぞれで胸鰭の使い方と流体力が測定されている（Drucker & Lauder 2003）。**歩容転換の速度（BL/s）は未取得**。
- 適用範囲: ニジマス（Oncorhynchus mykiss）が主。PROXY。
- 出典: Drucker & Lauder (2003) "Function of pectoral fins in rainbow trout: behavioral repertoire and hydrodynamic forces", J. Exp. Biol. 206:813–826。URL 未取得。
- 証拠: [M] 確信度: 定性は中、速度は無し。
- 要検証キーワード: "gait transition pectoral caudal trout speed", "pectoral fin station holding trout".

### F-15
- 主張/値: 大西洋サケ（Salmo salar）のパー（幼魚）が流れの中で河床に定位するとき、胸鰭は体を河床へ押し付ける負の揚力（下向きの力）を発生させる、という報告。底に張り付いて、遊泳筋の仕事をほとんど使わずに位置を保つ。
- 適用範囲: PROXY: Salmo salar パー。ヤマメのパーでの確認は未了。
- 出典: Arnold, Webb & Holford (1991) "The role of the pectoral fins in station-holding of Atlantic salmon parr (Salmo salar L.)", J. Exp. Biol. 156:625–629。URL 未取得。
- 証拠: [M] 確信度: 中（結論の方向）。数値は未取得。

### F-16
- 主張/値: 魚が筋力で出す推力は、水に対する速度（対水速度）で決まる。したがって、流速 v の流れの中で対地速度0のまま定位している魚は、対水速度 v で泳いでいるのと同じ運動学（尾鰭振動数、振幅、体波）になる。同じ魚が流れに乗って流下する場合は、対地速度が大きくても対水速度は小さく、尾の振動は小さくなる。
- 適用範囲: 物理的な原理。全ての魚類。
- 出典: なし（流体力学の一般原理）。
- 証拠: [M] 確信度: 高（原理）。実装上の含意: アニメーションの速度駆動量は対水速度（魚の速度ベクトル − 流速ベクトル）にすること。

### F-17
- 主張/値: Kármán gait（Liao et al. 2003）: ニジマスは、円柱または D 型の柱の後流にできる渦列（Kármán 渦列）の中で、体を大きくくねらせ、渦の間を縫うように「スラローム」する独特の体運動を示す。尾鰭振動数は渦の放出周波数に同期し、自由流で同じ速度で巡航するときよりも、**周波数が低く、体の横振幅が大きい**という方向の記憶がある（体波長も長いという記憶があるが、確信は低い）。筋電図（EMG）で赤筋の活動が減り、省エネになる。
- 適用範囲: ニジマス（PROXY）。実験は円柱後流の水路で、自然河川の渦（岩、倒木の後流）への外挿は仮説。
- 出典: Liao, Beal, Lauder & Triantafyllou (2003) "Fish exploiting vortices decrease muscle activity", Science 302:1566–1569／Liao, Beal, Lauder & Triantafyllou (2003) "The Kármán gait: novel body kinematics of rainbow trout swimming in a vortex street", J. Exp. Biol. 206:1059–1073／Liao (2004) "Neuromuscular control of trout swimming in a vortex street: implications for energy economy during the Kármán gait", J. Exp. Biol. 207:3495–3506。URL 未取得。
- 証拠: [M] 確信度: 方向（大振幅・低周波・渦に同期・EMG 低下）は中、数値は無し。
- 要検証キーワード: "Liao 2003 Karman gait amplitude wavelength tail beat frequency", "Karman gait body wavelength free-stream comparison".

### F-18
- 主張/値: 円柱後流の渦放出周波数は f_shed ≈ St_c × U/D（D=円柱直径、St_c≈0.2、広いレイノルズ数範囲で）。**ストローハル数 St_c は円柱の渦放出の値で、F-06 の遊泳の St とは別物**。Liao の実験で魚が同期するのは f_shed に対してである。自然河川では障害物のサイズ D と流速から魚が拾う渦の周波数を見積もれる、という実装上の含意。
- 適用範囲: 流体力学の一般知識（円柱）。D 型柱では値が少し異なる可能性がある。
- 出典: なし（流体力学の一般知識）。
- 証拠: [M] 確信度: 円柱の St_c≈0.2 は高。魚が同期する範囲は低。

### F-19
- 主張/値: Entraining（弓波・障害物前面の流れの利用）: 魚が障害物の前面（上流側）に生じる圧力の高い領域に入ると、尾の振動をほぼ止めたまま位置を保てる。ニジマス（円柱前面）、ブラウン系、ブルックトラウト（側線の役割）、リバーチャブ・スモールマウスバスなどで報告がある。
- 適用範囲: PROXY: ニジマス、ブルックトラウト、他。ヤマメでの報告は未確認。
- 出典: Webb (1998) "Entrainment by river chub Nocomis micropogon and smallmouth bass Micropterus dolomieu on cylinders", J. Exp. Biol. 201:2403–2412／Przybilla, Kunze, Rudert, Schuster & Brücker (2010) "Entraining in trout: a behavioural and hydrodynamic analysis", J. Exp. Biol. 213:2976–2986／Sutterlin & Waddy (1975) "Possible role of the posterior lateral line in obstacle entrainment by brook trout", J. Fish. Res. Board Can. 32:2441–2446／Liao (2007) "A review of fish swimming mechanics and behaviour in altered flows", Phil. Trans. R. Soc. B 362:1973–1993。URL 未取得。
- 証拠: [M] 確信度: 定性は中。サイズ・流速ごとの条件は無し。

### F-20
- 主張/値: Akanyeti & Liao (2013) は、(a) ニジマスの Kármán gait の運動学が流速・体長でどう変わるか、(b) Kármán gait の体の中心線を表す運動学モデル、の2編を出した、という記憶。振幅包絡と波のパラメータを式で与えている可能性が高い（**中身は未確認**）。ゲーム用の中心線モデルを作る際の、最優先の確認対象。
- 適用範囲: ニジマス（PROXY）。
- 出典: Akanyeti & Liao (2013) "The effect of flow speed and body size on Kármán gait kinematics in rainbow trout", J. Exp. Biol. 216（頁は未確認）／Akanyeti & Liao (2013) "A kinematic model of Kármán gaiting in rainbow trout", J. Exp. Biol. 216（頁は未確認）。URL 未取得。
- 証拠: [M] 確信度: 存在は中。内容は無し。

### F-21
- 主張/値: Webb, Kostecki & Stevens (1984) は、ニジマスの体サイズと遊泳速度が、尾鰭振動数・振幅・波長・波速などの運動学に与える効果を、サイズ別に測定した、という記憶。**本課題（ニジマスで振幅包絡と速度依存を得る）に最も近い一次資料の候補だが、値は一つも思い出せない。**
- 適用範囲: ニジマス（PROXY）。
- 出典: Webb, Kostecki & Stevens (1984) "The effect of size and swimming speed on locomotor kinematics of rainbow trout", J. Exp. Biol. 109:77–95。Webb (1971) "The swimming energetics of trout" I・II, J. Exp. Biol. 55／Webb (1975) *Hydrodynamics and energetics of fish propulsion*, Bull. Fish. Res. Board Can. 190。URL 未取得。
- 証拠: [M] 確信度: 存在は中。内容は無し。
- 要検証キーワード: "Webb Kostecki Stevens 1984 rainbow trout locomotor kinematics size speed"。

### F-22
- 主張/値: Di Santo et al. (2021) は、体型が大きく異なる多数の魚種（種数は40台という記憶）の定常遊泳を比較し、尾鰭振動数と遊泳速度の関係、体の振幅や波のパラメータなどが、体型の違いを超えて収斂（同じ範囲に収まる）することを報告した、という記憶。共著に Liao、Castro-Santos（魚道研究者）、Lauder らがいる。**具体的な数値（振幅、波長、波速、St など）は思い出せない。**
- 適用範囲: 多種（サケ科を含むかは未確認）。
- 出典: Di Santo, Goerig, Wainwright, Akanyeti, Liao, Castro-Santos & Lauder (2021) "Convergence of undulatory swimming kinematics across a diversity of fishes", Proc. Natl. Acad. Sci. USA 118(49):e2113206118。URL 未取得（doi.org は WebFetch で遮断）。
- 証拠: [M] 確信度: 存在・結論の方向は中、数値は無し。
- 要検証キーワード: "Di Santo 2021 convergence undulatory swimming kinematics", "tail beat frequency vs speed 44 species".

### F-23
- 主張/値: 日本語の資料（魚道設計）では、遊泳能力が「持続速度」「巡航速度」「突進速度」という語で与えられ、体長に対する倍率または絶対速度で整理され、魚道内の許容流速の設計基準に使われる、という一般的な記憶。**ヤマメ・サクラマスの値、体長ごとの値は一切思い出せない。**
- 適用範囲: 日本の魚道設計。
- 出典: なし（記憶）。確認すべき資料: 『最新・魚道の設計』（ダム・堰施設技術協会）、国内の魚道設計指針、Katopodis & Gervais (2016) "Fish swimming performance database and analyses", DFO Can. Sci. Advis. Sec. Res. Doc. 2016/002、Castro-Santos (2005) "Optimal swim speeds for traversing velocity barriers", J. Exp. Biol. 208:421–432、Powers & Orsborn (1985)（BPA 報告）。いずれも未確認。
- 証拠: [M] 確信度: 用語は中、値は無し。

### F-24
- 主張/値: （継承: r02 F-20）ブラウントラウト1歳・2歳の幼魚で、体型が細長い形から体高の高い形へ個体発生的に変わる。より流線形の体型は最大代謝率が高く、持続遊泳能力に影響する。幾何学的形態測定（GM）を使用。
  - 付記（M、低）: 尾鰭振動数の上限は筋の収縮速度で決まり、水温が上がると上限が上がる（温度で振動数が増える）。最大持続速度は最適水温付近で最大になる。数値は未取得。
- 適用範囲: PROXY: Salmo trutta。
- 出典: Sánchez-González J.-R., Nicieza A.G. (2023) Current Zoology 69(3):294-303。https://portalinvestigacion.uniovi.es/documentos/64b4eec52107cd1e6d71b7fe（r02 F-20 の記録による。私は再確認していない）。
- 証拠: [A]（継承）"a more streamlined body shape displayed higher maximum metabolic rates than a deep-bodied shape at both intraspecific and interspecific levels"。

---

## 3. 資料間の矛盾・不一致

本書には検索で得た資料がなく、**資料間の矛盾を直接比較できていない**。確認できる範囲の不一致・曖昧さを挙げる。

1. **課題文の目安と記憶の差**: 課題文の「低速0.5 BL/s〜巡航1–2〜Ucrit 3–5 BL/s?〜バースト10 BL/s?」は疑問符付きの推測で、資料の裏付けは無い。私の記憶（F-11: 2〜5 BL/s、F-12: 約10 BL/s）はおおむね同じ範囲だが、どちらも未検証で、一致は独立の裏付けにならない。
2. **振幅の定義**: 「尾端振幅 0.2 L」が peak-to-peak か片振幅かで2倍の差が出る。F-07 は peak-to-peak と読むと整合するという推論にとどまる。ストローハル数の A（peak-to-peak）と、数式 A(x)·sin(kx−ωt) の振幅（片振幅）を混同しないこと。
3. **体長の定義**: L が全長（TL）か尾叉長（FL）か標準体長（SL）かで BL/s の値が変わる（ヤマメは尾叉長と全長の差が数％〜十数％）。原典ごとの定義は未確認。
4. **振動数とサイズ**: 同じ BL/s でも小型魚ほど振動数が高い（F-05）。仕様で単一の「f–U」式を使うと、個体差（体長）が見かけの上で消える。ストライド長（U/(f·L)）を基準にする派生式は、この点を補正する仮置きだが検証していない。
5. **自由流と Kármán gait**: 同じ速度でも運動学（周波数・振幅）が異なる（F-17）。Entraining（F-19）ではさらに尾振りが止まる。遊泳状態（自由流／渦／弓波）に応じて運動学を切り替える必要があり、単一の速度駆動式では表現できない。
6. **サケ科 vs 他科**: 振幅包絡の形（F-02）は海産のタラ類・サバで得られた記憶で、サケ科の実測と異なる可能性がある。ウナギ（Tytell & Lauder 2004 など）はウナギ型（anguilliform）で、振幅が体全体で大きく、ヤマメの代用には適さない。

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル／アニメ／行動実装に必要だが確認できなかった事項

本ストリームは検索0回のため、**課題の5項目すべてが未回答**である。再検索の優先順位を付ける。

### 4-1. 課題1: 体軸に沿った横振幅包絡 A(x)/L（最優先）
- ニジマス／サケ科の A(x)/L の実測値（頭、胴前部、胴中央、尾柄、尾端の各点）と、速度による変化。**未取得**。
- 頭部ヨー振幅と、重心付近の振幅最小点の位置。未取得。
- 数式（二次式の係数）の確認。Videler & Hess (1984) と Webb et al. (1984) が第一候補。
- 推奨クエリ: `Videler Hess 1984 fast continuous swimming saithe mackerel amplitude envelope`／`Webb Kostecki Stevens 1984 rainbow trout locomotor kinematics size speed`／`rainbow trout midline kinematics body wave amplitude head tail`。

### 4-2. 課題2: f–U 関係、尾鰭振幅、体波長、波速、St、ヘッドヨー、温度・体長依存
- Bainbridge (1958) の原データの数値（振幅の定義、ストライド長）。未確認。
- 体波長 λ/L、波速 V/U のサケ科での実測値。未取得。
- 温度・体長依存の定量式。未取得。
- 推奨クエリ: `Bainbridge 1958 speed of swimming of fish tail beat frequency amplitude`／`trout tail beat frequency swimming speed body lengths per second`／`Strouhal number trout swimming`／`Di Santo 2021 convergence undulatory swimming kinematics`。

### 4-3. 課題3: 速度区分と歩容遷移
- Beamish (1978) の時間基準以外の、サケ科の BL/s での区分（低速、巡航、Ucrit、バースト）の数値。未確認。
- 歩容遷移（胸鰭のみ→胸鰭＋尾鰭→尾鰭）の速度（BL/s）。未取得。
- ヤマメ／サクラマスの Ucrit。未取得。
- 推奨クエリ: `salmonid critical swimming speed Ucrit body lengths per second`／`gait transition pectoral caudal fin trout speed`／`Drucker Lauder 2003 pectoral fins rainbow trout`／`Oncorhynchus masou swimming performance`。

### 4-4. 課題4: 流れの中の姿勢
- Kármán gait の体波パラメータ（振幅、周波数、波長）の数値。未取得（F-17 は方向のみ）。
- Entraining／弓波利用時の体波の数値。未取得。
- 自然河川（岩、倒木の後流）で魚が何を利用するかの定量資料。未取得。
- 推奨クエリ: `Liao 2003 Karman gait trout kinematics amplitude wavelength`／`Akanyeti Liao 2013 Karman gait kinematic model`／`Przybilla 2010 entraining trout`。

### 4-5. 課題5: 日本語資料
- ヤマメ／サクラマスの巡航速度・突進速度、魚道設計基準（体長ごと）。**一切未取得**。
- 推奨クエリ: `ヤマメ 遊泳速度 巡航 突進 魚道 体長`／`サクラマス 遊泳能力 突進速度 持続速度`／`魚道 設計 遊泳能力 サケ科 流速 許容`／`最新魚道の設計 巡航速度 突進速度`。

### 4-6. 実装に直結するその他の欠落
- 加速・減速・旋回・C-start・摂餌攻撃の運動学（本ストリームの範囲外だが、定常遊泳の包絡との接続が必要）。
- ヤマメの実写動画からの計測（中心線トラッキング）。実写映像の入手経路が無い。
- 体長10〜30 cm（河川型ヤマメの典型サイズ）での値。ニジマスの実験は体長が異なる可能性がある。
- 尾鰭の変形（尾鰭の曲がり、フォークの開閉）と鰭条の運動学。
- 背鰭・臀鰭・脂鰭の定常遊泳中の動き（受動か能動か）。

---

## 5. 出典一覧（URL付き、重複排除）

**URL を取得できた出典（継承、1件）**
- Sánchez-González J.-R., Nicieza A.G. (2023) Current Zoology 69(3):294-303 — https://portalinvestigacion.uniovi.es/documentos/64b4eec52107cd1e6d71b7fe（r02 F-20 の記録。私は再確認していない）

**書誌情報のみ（M。URL 未取得、原典未確認。誌名・巻・頁も記憶のため誤りを含みうる）**
- Akanyeti & Liao (2013) 2編（Kármán gait の流速・体長効果／運動学モデル）, J. Exp. Biol. 216
- Arnold, Webb & Holford (1991) J. Exp. Biol. 156:625–629
- Bainbridge (1958) J. Exp. Biol. 35:109–133
- Beamish (1978) Fish Physiology 7:101–187
- Breder (1926) Zoologica 4:159–297
- Brett (1964) J. Fish. Res. Board Can. 21:1183–1226
- Castro-Santos (2005) J. Exp. Biol. 208:421–432
- Di Santo et al. (2021) PNAS 118(49):e2113206118
- Drucker & Lauder (2003) J. Exp. Biol. 206:813–826
- Hammer (1995) Comp. Biochem. Physiol. 112A:1–20
- Hess & Videler (1984) J. Exp. Biol. 109:229–251
- Katopodis & Gervais (2016) DFO Can. Sci. Advis. Sec. Res. Doc. 2016/002
- Lauder & Tytell (2006) Fish Physiology 23:425–468
- Liao (2004) J. Exp. Biol. 207:3495–3506
- Liao (2007) Phil. Trans. R. Soc. B 362:1973–1993
- Liao, Beal, Lauder & Triantafyllou (2003) Science 302:1566–1569
- Liao, Beal, Lauder & Triantafyllou (2003) J. Exp. Biol. 206:1059–1073
- Lighthill (1960) J. Fluid Mech. 9:305–317
- Lighthill (1971) Proc. R. Soc. B 179:125–138
- Lindsey (1978) Fish Physiology 7
- Powers & Orsborn (1985) BPA 報告
- Przybilla et al. (2010) J. Exp. Biol. 213:2976–2986
- Sfakiotakis, Lane & Davies (1999) IEEE J. Oceanic Eng. 24:237–252
- Sutterlin & Waddy (1975) J. Fish. Res. Board Can. 32:2441–2446
- Taylor, Nudds & Thomas (2003) Nature 425:707–711
- Triantafyllou, Triantafyllou & Grosenbaugh (1993) J. Fluids Struct. 7:205–224
- Videler (1993) *Fish Swimming*, Chapman & Hall
- Videler & Hess (1984) J. Exp. Biol. 109:209–228
- Videler & Wardle (1991) Rev. Fish Biol. Fisheries 1:23–40
- Wardle (1975) Nature 255:725–727
- Webb (1971) The swimming energetics of trout I・II, J. Exp. Biol. 55
- Webb (1975) Bull. Fish. Res. Board Can. 190
- Webb (1998) J. Exp. Biol. 201:2403–2412
- Webb, Kostecki & Stevens (1984) J. Exp. Biol. 109:77–95
- 『最新・魚道の設計』（ダム・堰施設技術協会、書名のみの記憶）

ローカルの継承元
- `/home/user/gerupamasini/docs/yamame/research/r02_morph_en.md`（F-20）

---

## 6. 検索ログ

| # | ツール | クエリ／URL | 結果 | 有用ヒット数 |
|---|---|---|---|---|
| 1 | WebSearch (standard) | Videler Hess 1984 fast continuous swimming of two pelagic predators saithe and mackerel kinematic analysis amplitude envelope | 未実行: セッションの検索上限（200/200）到達 | 0 |
| 2 | WebSearch (standard) | Di Santo 2021 convergence of undulatory swimming kinematics across a diversity of fishes PNAS | 未実行: 同上 | 0 |
| 3 | WebSearch (standard) | Liao 2003 Karman gait rainbow trout kinematics body amplitude wavelength Science | 未実行: 同上 | 0 |
| 4 | WebSearch (standard) | ヤマメ 遊泳速度 巡航速度 突進速度 魚道 体長 | 未実行: 同上 | 0 |
| 5 | WebFetch | https://doi.org/10.1073/pnas.2113206118（Di Santo 2021 の要旨） | `EGRESS_BLOCKED`（doi.org 遮断）。以降 WebFetch は試さず | 0 |

- 実行できた検索: **0回**。上限到達を確認した後は、検索の再試行も、他経路による検索の迂回もしていない。
- 検索ではない情報源（ローカルファイルの読み取り）: `docs/yamame/research/` 内の r01〜r07 を `swim|遊泳|Ucrit|tail beat|Strouhal|BL/s|突進|巡航|魚道` で Grep し、遊泳に関する記述が r02 F-20（ブラウントラウト）だけであることを確認した（r06、r07 の該当は遊泳と無関係の文脈）。`photo_analysis/catalog_c01〜c07.json` は静止画の注釈で、運動学の情報は含まない。
- 課題のうち未実施の検索（出発点クエリ10本のうち、試行は4本、残り6本は上限到達後のため試行せず）: trout tail beat frequency swimming speed body lengths per second Bainbridge、rainbow trout midline kinematics body wave amplitude head tail、Strouhal number trout swimming、salmonid critical swimming speed Ucrit body lengths per second、サクラマス 遊泳能力 突進速度 持続速度、gait transition pectoral caudal fin trout speed。
- 再開の手順: 利用者が上限（`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`）を引き上げた後、§4 の推奨クエリを順に実行し、各 F の確信度を検索要約の根拠で置き換えること。最優先は F-02、F-04、F-05、F-21、F-22（振幅包絡と f–U 関係）。
