# 眼球・頭部・口・鰓蓋の解剖と動き（サケ科／ヤマメ O. masou masou 河川型）の文献・写真調査

> 作成: ストリームR07（眼球・頭部・口・鰓蓋担当）。目的はヤマメの3Dモデル（眼球、頭部形状、口、鰓蓋、摂餌・呼吸の動き）の仕様根拠収集。**第2版（WebSearch 19回実行）。** 第1版は検索0回で書かれていた。
>
> **この文書を使う前に必ず読むこと（調査の限界）**
> 1. **検索は19回実行できた。20回目はセッションの共有上限（200/200）に達して拒否され、以後は検索していない（迂回なし）。** mode はすべて standard。検索結果は「題名・URL・モデルが作った要約」のみで、全文は読んでいない。数値は要約に明示されたものだけ採用した。
> 2. **それでも、課題の中心的な数値は見つからなかった。** ヤマメ（河川型）の眼径・頭長・吻長・口裂・上顎長（%SL、%HL）の実測値（検索3本）、トラウトの最大開口角・開口時間（検索5本）、両眼視野の査読済みの値、ヤマメの呼吸数の水温依存（回/分。検索4本）、河川型の成熟雄の鼻曲がり（検索2本）は、いずれも数値が得られなかった（§4）。
> 3. 材料は4系統で、各 Finding に区別して書いた。
>    - **(i) 新規検索（第2版）**: F-27〜F-31、および F-09、F-10、F-11、F-16、F-17、F-20、F-24 の追記部分。ランクは要約文に書かれた内容に対して付けた。出典と文の対応が結果集合から特定できないものは、その旨を明記した。
>    - **(ii) 継承**: 先行ストリーム r01〜r05（`/home/user/gerupamasini/docs/yamame/research/`）が検索要約から記録した記述。ランクは先行ストリームの付与を継承し、「r01 F-xx」のように元の番号を併記した（私は元の検索結果も原典も再確認していない）。
>    - **(iii) 写真由来 C(P)**: 参照写真70枚の注釈カタログ（`/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01〜c07.json`）の `eye` / `head_mouth` / `skin` 欄を第1版で集計したもの（r05 と同じ表記）。出典は釣り・ブログ・図鑑サイト等の写真で、注釈は目視推定（px 計測）。**画像そのものは見直していない。** 撮影の遠近・斜視・開口・水膜反射による誤差を含む。第2版では再集計していない。
>    - **(iv) 記憶 M**: 私の記憶に基づく一般的な魚類解剖・生理の知識。検索で未確認のもの。数値は原則書かず、書く場合も「桁の目安」と明記した。
> 4. 「派生」「算出」と書いた数値は、資料の比などから私が換算した値で、資料に書かれた値ではない。
> 5. 第2版の他ストリームとの関係: r09（過渡運動）も、トラウトの摂餌運動学（開口量・開口時間・吸引）を検索したが見つけられていない（r09 §4 課題2）。本書の結果と合致する。

---

## 1. 要約（仕様に直結する結論）

1. **眼の相対サイズは体サイズで大きく変わる。** 資料の記述は「幼魚（約200 mmまで）で頭長の20–30%、成魚で約10%」。写真由来の概算では、眼径（暗い眼窩縁を含む外径）/頭長の中央値が、パー（parr）で0.22（n=13）、幼魚で0.20（n=21）、成魚（非産卵期）で0.15（n=12）、産卵期の雄で0.14（n=3）。サケ科の飼育幼魚でも頭部寸法の比が成長とともに変わる（定性）。眼径を一定比で作らず、体長に連動させる。[F-01, F-05, F-29]
2. 台湾亜種成魚（PROXY、約30 cm）の比から派生した眼径/頭長は約0.29で、写真の成魚中央値（0.15）や種群の「サクラマス0.100」より大きい。**定義（眼窩縁込みか）・亜種・サイズの違いが大きく、単一の値にできない。** [F-02, F-03, F-05]
3. 眼は「金色の虹彩環」と「その外側の暗い眼窩縁／強膜」の二重構造で見え、**金環の外径は眼窩縁込みの外径の約0.52–0.9倍（中央値約0.64、n=10）**。眼球モデルは虹彩環径と外径を別パラメータで持つ。[F-06]
4. **眼位は頭部の上半分、吻寄り。** 眼前縁〜吻端は頭長の約0.27–0.34（写真n=4）、眼中心の高さは頭高の約1/3（写真1枚）。台湾亜種の吻長/頭長0.227（派生）とは定義が違うため食い違う。[F-07, §3-2]
5. **虹彩は金〜黄色の細い環（57枚中46枚が「金」）、瞳孔は黒く円形（48/57。楕円の7枚は斜め視点）。** 総説の要約では、真骨魚の大半は虹彩が固定で、光に対する瞳孔の収縮が無い（例外あり。サケ科での直接確認は無い）。**3Dは固定径の円形瞳孔でよい。** 産卵期〜産卵後の雄では虹彩が暗く金環が見えない写真がある（2枚）。[F-08, F-30]
6. **眼球の光学（C、一般の魚類）: 水晶体はほぼ球形、焦点距離（水晶体中心から網膜まで）は水晶体半径の約2.55倍（Matthiessen比。10種の測定で2.40–2.82）、角膜は水中で光学的にほぼ無効、調節は retractor lentis 筋による。** 3Dでは「大きな球形水晶体＋薄い透明角膜シェル」が妥当。ヤマメ／サケ科の数値は未確認。[F-10]
7. **脂瞼（adipose eyelid）: 検索で確認できた既知の例はニシン類・ボラ・アジ・サバ・サバヒーで、サケ科の記述は出なかった（C、否定的証拠）。** 写真2枚（p024、p031）の「脂瞼様の膜」は別構造の可能性がある。仕様では脂瞼を独立にモデル化しない。[F-09]
8. **視野に査読済みの数値は得られていない。** 一般向け解説（C）は、水平視野約330°、真後ろの死角約30°、両眼視（前方の重なり）約30°とする。各眼の水平視野を180°と置くと整合する（私の算術）。仮置き値として使い、「根拠は釣り解説」と明記する。眼球の可動域・輻輳は未確認。[F-11]
9. **吻は丸く鈍い（写真57枚中、「丸」48、「鈍」27）。** 頭背縁は吻から項へ緩やかな凸（18枚が凸と記述、凹は大型成魚1枚のみ）。上顎先端が下顎よりわずかに前に出る記述が18枚。[F-14]
10. **口裂の後端（上顎後端）は眼の中心直下〜眼の後縁のやや後方。** 閉口の写真では「眼後縁より後方」11、「眼中心直下」9。開口時や婚姻期の雄では後方に伸び、雄の1枚（p034）は眼中心の約2眼径後方。[F-15]
11. 頭長は標準体長の約23.8%（台湾亜種からの派生、PROXY）。韓国産の雄の頭長/尾叉長はシロザケ24.7%（最大）〜ニジマス21.6%（最小）で、マスは間（推論）。写真の1枚は頭長/SL≈0.26。頭長の定義は「上顎先端〜鰓蓋後端」。[F-03, F-04, F-26]
12. **雄・成熟個体は頭部の比が変わる。** 韓国産マス（PROXY、査読）の雄は、頭長に対する吻長・上顎長の比が雌より大きく、眼径の比は小さい。ブラウントラウト（PROXY、査読）では、未成熟個体は雌雄同形で、成熟した雄が相対的に長い頭長を得る（数値は要約に無し）。性・成熟段階で頭部比を変える設計の根拠になる。[F-04, F-23, F-28]
13. **歯は顎骨・鋤骨・口蓋骨・舌にある。サケ科には舌咬み装置（舌骨領域背面の歯と口蓋の対向歯）があり、捕獲後に餌を固定して裂く "raking" に使う（学会抄録、ニジマス含む3種）。** ヤマメ固有の歯列は未確認。[F-16]
14. **トラウトの摂餌運動学の数値（最大開口角、開口時間）は5本の検索でも見つからなかった。** 確認できた実測は、ニジマスの摂餌ストライクで神経頭蓋が最大2–18°挙上すること（28ストライク、3個体）と、多数の椎間関節（最大約1/3）の小回転（多くは3°未満）が合算されること（"neck-like"）。開口時間の桁は PROXY（ブルーギルの最大開口まで約13 ms、ラージマウスバスは約50 ms以内に閉顎）しかなく、サケ科への適用は未検証。[F-17, F-27]
15. **鰓蓋は大きく丸く、銀〜桃・ラベンダー・橙の金属光沢。** 前鰓蓋の弧と鰓蓋との間の縦溝が見える写真がある。後縁に淡い（白〜黄）縁。[F-18]
16. **呼吸（ニジマス、A）: 通常酸素下の換気頻度は 57±4 回/分（対照）と 78±4 回/分（軟水順化魚）（平均±SEM。水温・体サイズは要約に無し）、すなわち約0.95〜1.3 Hz（算術）。水温が高いほど換気頻度は有意に増える（定性。数値は取得できず）。** 激しい運動後は頻度がほぼ変わらず、1回の換水量（鰓蓋の振幅に相当）が主に増える。頻度と鰓蓋圧の振幅は独立に変わりうる。鰓蓋の開閉の振幅（mm・角度）は未取得。[F-20]
17. **鼻曲がり（kype）: 降海型の雄の二次性徴として顕著**（吻が伸びて下に曲がる、顎歯の肥大）。Oncorhynchus は上顎が伸びて吻を作る、Salmo・Salvelinus は下顎の変形が特徴的、という査読レビューの記述がある（A）。一方、写真の産卵期の雄2枚（p012、p034）は**下顎先端が上向きに反ったフック**で明瞭。河川型の成熟雄でどの程度出るかの定量資料は、検索2本でも見つからなかった。[F-21, F-22, F-31, §3-3]
18. 早熟雄（0+歳で成熟する河川残留のパー）は二次性徴がほとんど発達しない（A）。回遊型の雄は吻が長く背の隆起が大きいほど繁殖成功が高く、マスの隆起は骨成長で作られる（A）。小型雄に鼻曲がりを付けない根拠。[F-23, F-31]
19. **飼育・急成長・家畜化は頭部形状と眼径を変える**（PROXY: ギンザケ、ブラウントラウト、タイセイヨウサケ）。放流由来個体では頭が小さく吻の曲がりが弱い、眼が小さい方向。個体差生成の軸になるが、ヤマメでの検証は無い。[F-24]
20. 頭部側線管は8本（supraorbital, infraorbital, otic, preopercular, mandibular, postotic, supratemporal, temporal）＋体幹1本（O. m. masou、査読）。頭部の孔の配置の座標は未取得。[F-13]

---

## 2. Findings

> ランクの表記: A=査読論文・公的機関資料で、検索要約に明示（先行ストリームの付与を継承）／B=図鑑・博物館・自治体等／C=二次資料・Wikipedia系・個人サイト等／**C(P)**=参照写真70枚の注釈の集計（本書独自、上記の限界あり）／M=記憶（未検証）。
> 継承した Finding は「（継承: r01 F-10）」のように元の番号を併記する。
> 第2版の追記: 「【第2版で更新】」「【新規】」は、第2版の検索（19回）で内容を更新・追加した Finding。F-27〜F-31 は新規。

### F-01 眼径/頭長は成長で大きく低下する（種群の記述）
- 主張/値: 眼径は加齢で急減し、**幼魚（約200 mmまで）で頭長の20–30%、成魚で約10%**。同じ出典群で、体高は体長の28–31%、上顎長は雄14.9–17.1・雌12.6–13.2 %（"% of body length"、雄の単位は要約で欠落）とされる。
- 適用範囲: PROXY: O. masou 種全体（ロシア極東系の記述と推測、降海型成魚中心。ヤマメ河川型のサイズ別値ではない）。
- 出典: en.wikipedia「Oncorhynchus masou」、animalia.bio、wikiwand「Masu salmon」の結果集合（どのURLの文かは先行ストリームの要約から特定不能）。（継承: r01 F-10）
  - https://en.wikipedia.org/wiki/Oncorhynchus_masou
  - https://animalia.bio/oncorhynchus-masou
  - https://www.wikiwand.com/en/articles/Masu_salmon
- 証拠: [C] 先行ストリームが記録した要約 "eye diameter decreases sharply with age, from 20-30% of head length in juveniles (up to 200 mm) to nearly 10% in adults"。

### F-02 眼径/頭長・眼径/SL の種・型間比較
- 主張/値: **頭長に対する眼径の比** ビワマス 0.169±0.028、サツキマス 0.134±0.011、サクラマス 0.100±0.013。別の記述としてビワマス（O. biwaensis）の眼径 4.2–6.3 %SL（平均5.2%）、吻長 5.5–7.0 %SL（平均6.2%）。
- 適用範囲: サクラマス値は大型の降海型と推測されるが、サイズは要約に無い（ヤマメ河川型の体サイズではない可能性が高い）。他は PROXY:ビワマス・サツキマス。
- 出典: ja.wikipedia「ビワマス」（要約中の記述）。%SL の値は FishBase（O. biwaensis）と Dorofeeva 2008 の両方を含む結果集合から出ており、どちらの記述か特定不能。（継承: r01 F-07, F-09）
  - https://ja.wikipedia.org/wiki/%E3%83%93%E3%83%AF%E3%83%9E%E3%82%B9
  - https://fishbase.se/summary/71341
  - https://www.zin.ru/Journals/trudyzin/eng/publication.html?id=10
- 証拠: [C] "頭長に対する眼径の比は0.169±0.028、サツキマスは0.134±0.011、サクラマスは0.100±0.013"。先行ストリームは数値指定の再検索で再現できなかったと記録（要原典確認）。

### F-03 台湾亜種成魚の頭部の比（最も近い数値 PROXY）
- 主張/値: 成魚の比（資料の記載）: 体長/頭長=4.20、体長/体高=3.48、頭長/吻長=4.41、頭長/眼径=3.43、頭長/眼間隔=4.12。
  - **派生（私の算術。「体長」を SL と仮定）**: 頭長≒23.8%SL、吻長≒22.7%HL（≒5.4%SL）、眼径≒29.2%HL（≒6.9%SL）、眼間隔≒24.3%HL（≒5.8%SL）。「体長」が SL・FL・TL のどれかは要約に無い。
  - 同じ資料群の記述: 頭頂は緑、眼と鰓蓋周辺は銀色、尾鰭は浅い二叉、成魚約30 cm。
- 適用範囲: PROXY: O. m. formosanus（タイワンマス、台湾陸封型、成魚）。日本産亜種より体高が高く、脊椎骨・臀鰭条・胸鰭条が少ないと報告されている（先行ストリーム r02 F-02）。
- 出典: en.wikipedia「Oncorhynchus masou formosanus」。一次資料の候補は Jan et al. 1990（未確認）。（継承: r01 F-12, r02 F-01）
  - https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus
  - https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf
- 証拠: [C]（r01 は C、r02 は B と付与。保守的に C） "head length to snout length ratio is 4.41, head length to eye diameter ratio is 3.43, and head length to inter orbital width ratio is 4.12"。

### F-04 韓国産マス: 頭長/尾叉長と、吻長・眼径・上顎長の種間差・性差
- 主張/値: 韓国産サケ属（Korean J. Ichthyology 1993、シロザケ・マス・ニジマス）で、
  - 雄の頭長/尾叉長はシロザケ24.7%（最大）、ニジマス21.6%（最小）。雌は種間差なし。マスの値自体は要約に無く、「間にある」は私（先行ストリーム）の読み。
  - 体高・尾柄高・背鰭長・臀鰭長（対SL）と、吻長・眼径・上顎長・頬部（対頭長）に種間差があり、**眼径/頭長が新たな分類形質**になりうる。
  - **マスの雄は、頭長に対する吻長・上顎長の比が雌より大きく、眼径の比は雌より小さい。**
- 適用範囲: PROXY: 韓国産 O. masou（降海型か陸封型かは要約に無し）。数値は要約に無い。
- 出典: Korean Journal of Ichthyology（Morphological study of Oncorhynchus spp. in Korea IV, 1993）。巻号表記は先行ストリームの記録で 5(1):96-112。（継承: r01 F-13, r02 F-04）
  - https://koreascience.kr/article/JAKO199327236818661.page
- 第2版メモ（検索 #15）: 同論文の URL として https://koreascience.or.kr/article/JAKO199327236818661.pub も結果に出たが、要約は先行ストリームの記述（吻長・上顎長・眼径の種間差）の再確認にとどまり、数値表は無かった。
- 証拠: [A] "The ratios of snout length and upper jaw length to head length of males were larger than those of females, whereas eye diameter of males were smaller"。"In the ratio of head length to fork length of the male, chum salmon showed the highest value (24.7%) and rainbow trout the lowest (21.6%)"。

### F-05 写真由来: 眼径/頭長（暗い眼窩縁を含む外径系）の成長段階別分布
- 主張/値: 参照写真70枚のうち種ラベルが yamame の57枚から、眼径/頭長が数値で注釈された個体を集計（外径系を優先。金環のみの値しか無い写真は金環の値）。
  - パー（parr）: n=13、最小0.18、四分位0.20–0.22–0.24、最大0.29、平均0.22
  - 幼魚（juvenile）: n=21、最小0.10、四分位0.155–0.20–0.235、最大0.30、平均0.20（p022=0.10、p023=0.11は低解像度や虹彩環のみの可能性）
  - 成魚・非産卵期: n=12、最小0.11、四分位0.12–0.15–0.19、最大0.22、平均0.154
  - 産卵期の雄: n=3（0.14, 0.14, 0.18）、平均0.153
  - 算出は私が個体の値を手で採用して行った。頭部の短縮（斜視）で過大になる注釈（p017=0.29、p061=0.3）や、開口・近接で頭長が過大になる注釈（p033）は含み方に差がある（p017・p061は除外、p033は含む）。
- 適用範囲: 参照写真（釣果、図鑑、水槽等）の注釈。個体の体長は不明な写真が多い。段階（parr / juvenile / adult）は注釈者の外見判定で、年齢の実測ではない。頭長は「吻先〜鰓蓋後縁」の画像上の距離。
- 出典: `docs/yamame/photo_analysis/catalog_c01〜c07.json` の `eye.size_vs_head`。個別の掲載元の例（証拠の引用元）:
  - p013 https://anglers.jp/catches/6825477
  - p063 https://anglers.jp/catches/5485397
- 証拠: [C(P)] p013 "眼径/頭長は約0.22(眼径約45px、頭長約200px)"、p063 "眼外径約60px、頭長約480pxで約0.12。成魚相応に小さい"。傾向は F-01（20–30% → 約10%）と同方向だが、写真の成魚中央値（0.15）は「約10%」より大きい。

### F-06 写真由来: 金色の虹彩環の径は、暗い眼窩縁を含む外径の約0.5–0.9倍
- 主張/値: 同一個体で「虹彩環/頭長」と「暗い眼窩縁（強膜・眼窩影）を含めた値」が両方注釈された10例から、金環径/外径は **0.52–0.9、中央値約0.64**。例: p001 0.15 → 0.28、p002 0.11 → 0.21、p052 0.20 → 0.30、p053 0.17 → 0.27、p056 0.15 → 0.23、p049 0.16 → 0.28、p042 0.12 → 0.16、p024 0.10 → 0.15。
- 適用範囲: 参照写真の注釈。眼窩縁・強膜の暗色部の定義が個体・注釈者で揺れる。
- 出典: catalog_c01〜c07.json の `eye.size_vs_head`。
  - p052 https://anglers.jp/catches/4654214
  - p053 https://note.com/kateri/n/n2b0c356686b3
  - p056 https://anglers.jp/catches/2983720
  - p024 https://themissionflymag.com/yamame-wish-list-fish/
  - p001 https://www.ana.co.jp/travelandlife/article/000941/
- 証拠: [C(P)] p052 "虹彩環/頭長≈0.20(頭長≈275px)。暗い眼窩縁を含めると≈0.30"。

### F-07 写真由来: 眼位（頭部の上半分、吻寄り）と眼前縁〜吻端の距離
- 主張/値:
  - 眼前縁〜吻端の長さ（頭長比）: p053 約0.34（48 px / 142 px）、p041 約0.31（61 px、約1.4眼径）、p047 約0.27（74 px、約1.9眼径）、p022 約0.30（50 px / 165 px）。
  - 眼中心〜吻先: p022 約0.39 HL（頭がやや上向き）、p023 約0.20 HL。測り方（眼中心か前縁か）が違うため整合しない。
  - 眼中心の高さは頭高の約1/3（p024、大型成魚）。眼径/頭高=0.36（p065、幼魚の頭部アップ）。
  - 定性: 眼は「頭の上半部」「吻に近い」「背側寄り」（p023、p028、p031、p033、p047）。
- 適用範囲: 参照写真の注釈（斜視・頭の上向き・開口で誤差）。サイズ・性は一部不明。
- 出典: catalog の `eye.size_vs_head`・`eye.other`。
  - p053 https://note.com/kateri/n/n2b0c356686b3
  - p041 https://tonysharks.com/Tree_of_life/Eukaryote/Opisthokonta/Yamame/Yamame.html
  - p047 https://anglers.jp/catches/3195446
  - p022 https://www.honda.co.jp/fishing/news/news-20210330/
  - p024 https://themissionflymag.com/yamame-wish-list-fish/
  - p065 https://web.tsuribito.co.jp/suburb/keiryu-trbt-2020-06-anaba-01
- 証拠: [C(P)] p041 "眼の前縁から吻先まで約61px(約1.4眼径)"、p024 "眼中心の高さは頭高の約1/3"。台湾亜種の吻長/頭長0.227（F-03）との食い違いは §3-2。

### F-08 写真由来: 虹彩・瞳孔・角膜の見え方
- 主張/値（57枚中の自由記述の語の集計。1枚で複数語を含む）:
  - 虹彩の色の語: 金46、黄19、白11、銀10、青9、クリーム6、緑6、橙5、銅3。**細い金〜黄色の環が基本**。外周に暗色の輪（眼窩縁）が付く記述が多い。
  - 瞳孔: 黒で円形が48枚、楕円が7枚（斜め視点や開口による見え方）、確認不能2枚。
  - p003 に「虹彩環の前下方に鍵穴状の切れ込み」（注釈者は脈絡裂由来と推定、1/57、未検証）。
  - p004・p065 の頭部アップ: 強膜／角膜の上部に青緑の虹彩光沢（空や水膜の映り込みを含む）、上側に暗いリング。
  - **産卵期〜産卵後の雄**: p045「暗い青黒で金色の環は見えない」、p044「暗く、虹彩の環構造は不明」。ほかの雄（p012、p034）は金環が見える。
  - 眼の周囲に暗色〜青灰色の影（眼窩影）が多数（p001、p002、p012、p017 ほか）。
- 適用範囲: 参照写真（日中の屋外光、水膜の反射を含む）。ヤマメ・パー〜成魚、雌雄混在。
- 出典: catalog の `eye.iris` / `eye.pupil` / `eye.other`。
  - p003 https://anglers.jp/catches/5841529
  - p004・p065 https://web.tsuribito.co.jp/suburb/keiryu-trbt-2020-06-anaba-01
  - p044・p045 https://gecko0912.web.fc2.com/HP3/zukan/photo/12/yamame.htm
  - p012 https://remix-com.amebaownd.com/posts/34118208/
  - p034 https://ameblo.jp/makotoyamame/entry-12626540773.html
- 証拠: [C(P)] p003 "金色の細い環(外径≈48px)で、前下方に鍵穴状の切れ込み"、p045 "暗い青黒で金色の環は見えない。青白い反射の点がある"。

### F-09 脂瞼（adipose eyelid）【第2版で更新】
- 主張/値: **サケ科が脂瞼を持つという記述は、検索（#9）では見つからなかった。**
  - 文献側（百科事典系の要約）: 脂瞼は「一部の魚が持つ、眼の一部または全部を覆う透明な眼瞼」。例として挙がる分類群は milkfish（サバヒー）、isospondyls（ニシン類を含む）、アジ類（jacks）、ボラ類、サバ類。底生魚に多いが非底生魚にも見られる。多くは前部と後部の層に分かれ、層数は魚種により3〜5。機能は不明で、焦点の改善、偏光の検出、紫外線の遮断、異物からの保護などの仮説がある。**サケ科を例に挙げた記述は要約に無い（これは不在の証明ではない）。**
  - 写真側: 2枚に注釈がある。p024（大型成魚）「眼の上に緑がかった半透明の脂瞼様の膜が見える」、p031（種ラベル unclear）「前縁に淡青白の脂瞼(まぶた状の縁)」。2/57枚と少ない。
  - 解釈（私の推測、未検証）: 写真の「膜」は、眼窩縁の皮膚のひだ、角膜表面の粘液、水膜の反射のいずれかの可能性がある。**仕様では脂瞼を独立した構造としてモデル化せず、必要なら眼窩縁の半透明の皮膚リング（任意）にとどめる**ことを提案する。
- 適用範囲: 文献は硬骨魚一般（サケ科の記載なし）。写真は日本産ヤマメとされる個体（p031 は種不確実）。
- 出典:
  - https://en.wikipedia.org/wiki/Adipose_eyelid
  - https://handwiki.org/wiki/Biology:Adipose_eyelid
  - https://fao.org/docrep/pdf/006/ad471e/ad471e62.pdf （検索結果に出たが内容は未確認）
  - 写真: p024 https://themissionflymag.com/yamame-wish-list-fish/ 、p031 https://www.ana.co.jp/travelandlife/article/001841/
- 証拠: [C]（文献側。サケ科の記載なし＝否定的証拠）／[C(P)]（写真）。要約より "a transparent eyelid found in some species of fish, that covers some or all of the eye"。

### F-10 眼球の光学と構造（一般的な魚類）【第2版で更新】
- 主張/値:
  - **Matthiessen比**: 水晶体中心から網膜までの距離を水晶体半径で割った比で、ほとんどの魚で2.55で一定とされる。Matthiessen は10種の魚の水晶体の焦点距離を測り、平均が水晶体半径の2.55倍（変動2.40–2.82）。種によって2.3〜3.6の範囲という記述もある。（検索 #8、C）
  - **水晶体はほぼ球形、角膜は水中で光学的に無効**（水に浸かると角膜の屈折力が失われるため）。水晶体内部に、ほぼ放物線状の屈折率勾配がある。（C）
  - **遠近調節**: 真骨魚は retractor lentis 筋の収縮で焦点を調節する（水晶体を動かす）。（検索 #8 の要約。出典 URL との対応は特定不能、C）
  - **派生（私の算術。仮置き）**: 水晶体を眼球（網膜球）の中心に置くと、水晶体の直径は網膜球の直径の 1/2.55 ≒ 0.39。実際の魚眼では水晶体は眼球中心よりやや前寄りのことが多く、比は大きくなる（M）。数値は調整可能にする。
  - M（記憶、未検証）: 虹彩には銀白色〜金色に見える反射層（グアニン結晶を含む argentea）があり、金環の見えに対応すると考えられる。眼球は6本の眼筋で動き、体の傾き・旋回に伴う補償的な眼球運動がある。
  - 未取得: 水晶体と眼球全体の径の比（サケ科）、角膜の厚み、虹彩 argentea の厚み・色、サケ科の瞳孔収縮（瞳孔は F-30）。
- 適用範囲: 硬骨魚類一般（PROXY: 魚類全般）。サケ科・ヤマメで確認していない。
- 出典:
  - https://en.wikipedia.org/wiki/Matthiessen%27s_ratio
  - https://courses.edx.org/c4x/MITx/9.01x/asset/fish_lens.pdf （検索結果に出たが内容は未確認）
  - https://encyclopedia.pub/entry/33538 （同上）
- 証拠: [C] "found to be constant at 2.55 in most fishes"（Matthiessen's ratio の要約）。派生値と虹彩の記述は [M]。3Dでは、大きな球形水晶体、薄い透明角膜、瞳孔径を独立パラメータにする方針が自然。

### F-11 視野・眼球の可動・瞳孔動態【第2版で更新】
- 主張/値:
  - **査読論文に基づく値は取得できなかった**（検索 #6、#7）。得られたのは一般向け釣り解説の要約のみ（C）。
  - 一般向け解説の要約（C。どの記事のどの文かは特定不能）: トラウトは水中で水平視野が約330°、真後ろに約30°の死角がある。両眼視（立体視）の角度は「ほとんどの魚で30°程度」。また、後方・下方・上方・前方にも死角が生じる、という記述もある。単眼視野は体側、両眼視野は両眼の視野の重なる領域、という定義の説明。
  - **派生（私の算術。整合性の確認であり、独立の根拠ではない）**: 各眼の水平視野を180°とすると、2×180° − 30°（前方の重なり）= 330° となり、後方の死角は 360° − 330° = 30° で、上の3つの数が整合する。
  - 物理（M）: 水中から水面を見上げると、水面の屈折で見える範囲は円錐状（臨界角 arcsin(1/1.333) ≒ 48.6°、頂角約97°の Snell の窓）に限られる。水面近くでの警戒や飛来昆虫への反応の設計に関わる。
  - 未取得: 眼球の可動域、摂餌時の輻輳（両眼の前方への寄り）の有無、各眼の鉛直視野、視力（空間分解能）。網膜に関しては、ニジマスの視覚機能の発達（孵化後10日で視運動反応が始まり、外部栄養が始まるまで鋭敏度が増す）と、体サイズの異なるニジマスの視神経反応・網膜構造を扱う論文の題目が見つかっただけで、数値は無い（Gaps）。
- 適用範囲: 一般向け解説は「トラウト」（種不明）。Snell の窓は物理。
- 出典:
  - https://www.flyfisherman.com/editorial/how-trout-see/454967
  - https://www.hatchmag.com/articles/can-fish-see-directly-behind-them/7716172
  - https://blog.vailvalleyanglers.com/how-do-trout-see/
  - 網膜・視覚発達（題目のみ）: https://pubs.usgs.gov/publication/70027220 、https://pubmed.ncbi.nlm.nih.gov/8266629/
- 証拠: [C]（視野の数値）／[M]（Snell の窓）。要約より "Trout have a 330 degree horizontal vision beneath the water. This leaves a 30 degree blind spot directly behind them."。実装では「眼球の向きは頭に対して小さく動く」程度にとどめ、角度は根拠の弱い調整値と明記すること。

### F-12 鼻孔（前後2対）
- 主張/値:
  - 写真: 眼と吻端の間に前鼻孔が見える。p004「前鼻孔が眼と吻端の間の凹みとして見える」、p015「鼻孔が眼の前方に桃色の縁で見える」、p017「眼の前方(鼻孔付近)に白い小斑」、p028「眼の前方に鼻孔(白い点)あり」。全70枚中で鼻孔に触れた注釈は5枚（上記4枚と p065。p065 は頭部アップで、`measure_usable` の注記に「鼻孔」が高解像で写るとある）。
  - M: 硬骨魚の鼻孔は左右に前後2つずつあり、前鼻孔は皮膚のひだ（弁）で縁取られる、後鼻孔は眼寄りで単純、という一般知識。ヤマメでの大きさ・位置の実測値は無い。
- 適用範囲: 写真は日本産ヤマメ（図鑑・ブログ・釣果）。
- 出典: catalog の `eye.other` / `head_mouth.snout_profile`。
  - p004 https://web.tsuribito.co.jp/suburb/keiryu-trbt-2020-06-anaba-01
  - p015 https://note.com/kitasato_labo/n/n13a42411146a
  - p017 https://plaza.rakuten.co.jp/nekomac/diary/202506270002/
  - p028 https://tonysharks.com/Tree_of_life/Eukaryote/Opisthokonta/Yamame/Yamame.html
- 証拠: [C(P)]（M併記） p015 "鼻孔が眼の前方に桃色の縁で見える"。

### F-13 側線系（頭部側線管・神経丘）
- 主張/値: O. m. masou の側線系は、**頭部側線管8本（supraorbital, infraorbital, otic, preopercular, mandibular, postotic, supratemporal, temporal）＋体幹側線管1本、表在神経丘グループ9**。preinfraorbital の表在神経丘群を持ち、infraorbital / mandibular / opercular の表在神経丘群を欠く。飼育繁殖世代では総神経丘数が野生・F1より約10%少ない。
  - 写真（体側）: p068 の注釈「側線孔が白い数珠状に光る」。体側の孔列は空反射で目立つ場合がある。
  - 頭部の孔の座標（吻・下顎・前鰓蓋のどこにいくつ）は取得できていない。
- 適用範囲: ヤマメ／マス（日本産 O. m. masou）。
- 出典: The lateral line system and its innervation in the masu salmon Oncorhynchus masou masou (Salmonidae), Ichthyological Research 2021。Nakae, Hasegawa, Miyamoto 2022, Sci. Rep.（継承: r01 F-27）。p068 の掲載元は下記。
  - https://link.springer.com/article/10.1007/s10228-021-00843-0
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9537280/
  - https://gokaseriver.blog.fc2.com/blog-entry-130.html?sp
- 証拠: [A] "8 cephalic canals ... 1 trunk canal and 9 superficial neuromast groups"。写真は [C(P)]。

### F-14 写真由来: 吻の形と頭部の背側輪郭
- 主張/値（yamame ラベル57枚の `head_mouth.snout_profile` の語の集計。重複あり）:
  - 「丸」48、「鈍」27、「短」19、「尖」14、「長」5（「長」は「吻は長め」「下顎は太く長い」等を含む）。**基本は短く丸く鈍い吻**。「長め・尖る」の記述は産卵期の雄（p012、p034）のほか、p025（成魚）、p048（幼魚。「斜め上から見た像で実際より長く見える」と注釈）にある。「尖」は「尖った丸形」「先がやや尖る」等の弱い表現が多い。
  - 背側輪郭: 「凸」18枚（吻から項へ緩やかな凸）。凹みの記述は大型成魚の p024（吻の後ろで浅い凹み、項で凸、上顎先端が下向きに湾曲してわずかに鉤状）の1枚のみ。
  - 上顎が下顎よりわずかに前に出る記述が18枚。p024 は下顎が太く長い（約0.57頭長）。
  - 撮影バイアス: 57枚中、ルアーや毛鉤が掛かっているのが11枚、開口が18枚。開口では頭長の過大評価と上顎後端の後退が起きる（F-05、F-15）。
- 適用範囲: 参照写真の注釈。パー〜成魚、雌雄混在。
- 出典: catalog の `head_mouth.snout_profile`。
  - p024 https://themissionflymag.com/yamame-wish-list-fish/
  - p012 https://remix-com.amebaownd.com/posts/34118208/
  - p034 https://ameblo.jp/makotoyamame/entry-12626540773.html
- 証拠: [C(P)] p001 "短く鈍い丸形。背側プロファイルは吻から項へ緩やかな凸"、p024 "頭背縁は吻の後ろで浅い凹み、項で凸"。

### F-15 口裂: 上顎後端と眼の位置関係
- 主張/値:
  - 写真（yamame ラベル、口を閉じた34枚のうち上顎後端が判別できた21枚）: 「眼後縁より後方（behind_eye）」11、「眼中心直下（below_center）」9、「眼の前下方」1。判別不能13枚。
  - 開口時の例: p001 眼中心の約50 px（約1.1眼径）後方、p033 眼中心の約1眼径後方（眼後縁を約23 px越える）、p047 眼の後縁とほぼ同位置、**p034（産卵期の雄）眼中心の約2眼径後方**。開口で上顎が後方に引かれて見えるため、閉口時より過大。
  - 閉口の例: p053 上顎後端が眼の後縁より後方（中信頼）、p041 眼の中心直下〜やや後方。
  - 先行ストリームの記憶（M、未検証）: サケ属の成魚では上顎骨後端が眼の後縁を越える傾向があり、雄で顕著。（継承: r01 F-33）
- 適用範囲: 参照写真の注釈。斜視・開口・遠近で±15 px 程度の誤差が注釈に明記されている。
- 出典: catalog の `head_mouth.maxilla_end_vs_eye` / `opercle_notes`。
  - p053 https://note.com/kateri/n/n2b0c356686b3
  - p041 https://tonysharks.com/Tree_of_life/Eukaryote/Opisthokonta/Yamame/Yamame.html
  - p033・p034 https://ameblo.jp/makotoyamame/entry-12626540773.html
  - p047 https://anglers.jp/catches/3195446
  - p001 https://www.ana.co.jp/travelandlife/article/000941/
- 証拠: [C(P)] p041 "上顎後端は眼の中心直下〜やや後方(推定、口を閉じた斜め像で±15px)"、p034 "口角は眼中心から約100px(約2眼径)後方"。M は r01 F-33 の記憶部分。

### F-16 顎骨・歯・頭骨【第2版で更新】
- 主張/値:
  - 属レベルの歯の配置: **Salmo と Oncorhynchus では鋤骨が平坦（舟形でない）で、歯が鋤骨全体に二列／ジグザグ状に並ぶ**。Salvelinus（イワナ属）は舟形の鋤骨の前端に歯が限られる。成魚の Oncorhynchus では鋤骨歯と口蓋骨歯の間隔が広い（Salmo は狭い）。台湾亜種の記載では基鰓骨歯は無い。「歯条褶の形」の記述は原典不明で未検証。（継承: r01 F-28）
  - **舌咬み装置（tongue-bite apparatus）【新規・検索 #4】**: サケ科は、前部の舌骨領域の背面に発達した歯を持ち、口蓋（口腔の天井）に対向する歯がある。この機構は、捕獲した餌を固定して裂く "raking" 行動に使われる。ニジマス（O. mykiss）を含むサケ科3種を、250 Hz の高速度映像のコマ送り解析で比較し、神経頭蓋と舌骨の動きが種間の差を最もよく説明した、という学会抄録（Sanford、Hofstra Univ.）。ヤマメは対象に含まれるか不明。
  - M（私の記憶、未検証）: サケ科の上顎は前上顎骨と主上顎骨からなり、主上顎骨は長く歯を持つ。主上顎骨の背後に上主上顎骨（supramaxilla）がある。下顎は歯骨（歯あり）と関節角骨からなる。口蓋骨・鋤骨・舌（基舌骨）にも歯がある。
- 適用範囲: 属レベルの PROXY（r01）。舌咬み装置はサケ科3種（ニジマス含む）。ヤマメ固有の歯列は未確認。M はサケ科一般。
- 出典:
  - https://en.wikipedia.org/wiki/Oncorhynchus
  - https://en.wikipedia.org/wiki/Salvelinus
  - https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus
  - 舌咬み装置: https://sicb.org/?p=35129 （題目 "Comparative kinematic analysis of a novel feeding mechanism in salmonid fishes"）、関連: https://sicb.org/abstracts/evaluating-the-importance-of-new-structures-versus-new-muscle-activity-patterns-in-the-evolution-of-a-novel-feeding-mechanism-in-salmonid-fishes
- 証拠: [C]（継承部分）"In the former two genera the teeth form a double or zigzag series over the whole of the vomer bone, which is flat and not boat-shaped"。[B]（舌咬み装置。学会抄録）要約より "well-developed teeth on the dorsal surface of the anterior hyoid region and opposing teeth on the roof of the mouth"。M の部分は [M] 未検証。

### F-17 摂餌（吸引・ストライク）のキネマティクス【第2版で更新】
- 主張/値:
  - **サケ科（ヤマメ）の最大開口角・開口時間・吸引距離・接近速度の実測値は、5本の検索（#1〜#5）でも見つからなかった。** トラウトで確認できた運動学は、頭蓋の挙上（F-27）と舌咬み装置（F-16）の記述のみ。
  - 一般機構（百科事典系・総説系の要約。C〜B）: 吸引摂食は、神経頭蓋（真皮頭蓋）の背側への回転、懸垂骨の側方への拡張、下顎と舌骨の押し下げで口腔を拡大して陰圧を作る。拡張の初期相は、舌骨の押し下げ、頭蓋の回転、顎の突出、開口で起こる。鰓蓋弁と鰓条骨の弁（opercular and branchiostegal valves）は、口の開口部を通る流量を最適にする制御装置として働く。ニジマス（Salmo gairdneri）で流体力学の理論予測が実験的に検証された、という記述がある（どの文献かは特定不能）。
  - ram–suction 連続体（捕食者の接近＝ram と吸引の相対的寄与）の枠組みがあり、ram–suction 指標には、下顎の最大押し下げ、最大開口距離、最大舌骨押し下げ、およびその時刻などが使われる（学会抄録の要約）。サケ科がこの連続体のどこに位置するかの数値は未取得。
  - **PROXY の時間スケール（吸引型の魚。サケ科ではない）**:
    - ブルーギル（"bluegill"）: 最大開口までの時間（time to peak gape）の平均は約13 ms、力の記録は開始からピークまで約12 ms。最大流速は最大開口の95%と同時に起こる。吸引流の影響域は口から約1口径以内。
    - ラージマウスバス（"largemouth bass"）: 0–8 ms に頭蓋挙上と開口（餌への接触前）、16 ms に上顎骨の回転と口腔拡張のピーク、24 ms に餌が口へ吸い込まれ、約50 ms 以内に閉顎。
  - M（記憶）: サケ科は ram と吸引の混合型で、純粋な吸引型ではない。
  - **アニメへの仮置き（根拠は弱い。ヤマメ・トラウトの値ではない）**: 開口開始〜最大開口 10〜30 ms、閉顎完了まで約50〜100 ms 前後の範囲を調整可能な既定値にし、頭蓋挙上は F-27 の 2–18° を使う。上の桁は吸引型 PROXY の引用であり、ram 寄りのサケ科でそのまま成り立つかは未検証。
- 適用範囲: 時間スケールは PROXY: ブルーギル、ラージマウスバス（吸引型）。一般機構は硬骨魚類一般。ニジマスの流体力学の検証は文献不明。
- 出典（結果に出た URL。どの文がどの URL かは特定不能）:
  - https://en.wikipedia.org/wiki/Aquatic_feeding_mechanisms
  - https://vliz.be/imisdocs/publications/346500.pdf
  - https://biomechanics.ucr.edu/Higham%202011%20Fish%20Physiology.pdf
  - https://biomechanics.ucr.edu/Higham_etal_2006a.pdf
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC8753175
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC4507239
  - https://sicb.org/?p=28339 、https://sicb.org/?p=33737
- 証拠: [B]（PROXY の数値。要約中の明示値だが出典 URL を特定できない）／[C]（一般機構）／[M]（サケ科の混合型）。要約より "average time to peak gape for bluegill ... approximately 13 ms"。

### F-18 写真由来: 鰓蓋の形と色
- 主張/値（yamame ラベル57枚の `head_mouth.opercle_notes` の語の集計。重複あり）:
  - **鰓蓋は大きく丸い**（多数の注釈）。色の語は、銀18、黄7、橙4、桃4、紫4、金4、緑3、青3、赤褐1、ラベンダー1。個体・光で、銀白〜銀褐色／桃・ラベンダーの虹色光沢／橙〜赤褐のまだらと変わる。
  - 放射状の筋や貝殻状の隆起の記述が7枚、縦筋が6枚。
  - 前鰓蓋の弧（前鰓蓋骨の縁）が見える写真が複数ある（p022、p024、p033、p041、p047）。うち p022・p024 は、前鰓蓋と主鰓蓋の間の**縦溝**にも触れている。
  - 鰓蓋後縁は滑らかな弧で、**黄〜白の縁取り**（p002 後縁に黄色の縁取り、p033 後縁に黄味の縁・鰓膜は白、p012 後縁に明るい鰓膜）。鰓膜下端は胸鰭基部まで（p041）。
  - 産卵期の雄の鰓蓋: 大きな橙色の斑（p012）。p034 は表面が暗色でざらついた質感（濡れ・粘液・皮膚の肥厚の可能性）。
- 適用範囲: 参照写真の注釈。濡れた鰓蓋は水膜の鏡面反射で色が大きく変わる。
- 出典: catalog の `head_mouth.opercle_notes`。
  - p022 https://www.honda.co.jp/fishing/news/news-20210330/
  - p041 https://tonysharks.com/Tree_of_life/Eukaryote/Opisthokonta/Yamame/Yamame.html
  - p033・p034 https://ameblo.jp/makotoyamame/entry-12626540773.html
  - p012 https://remix-com.amebaownd.com/posts/34118208/
  - p002 https://anglers.jp/catches/4687440
- 証拠: [C(P)] p022 "前鰓蓋と主鰓蓋の間に縦溝"、p041 "鰓蓋は白〜桃で鏡面反射が強い。…鰓膜下端は胸鰭基部まで"。

### F-19 鰓蓋骨系・鰓条骨・鰓弁
- 主張/値:
  - 鰓条骨数: 青森県のヤマメ（河川型）の外部形態として「鰓条骨数11条」の記述がある。ただし「11」の部位は要約間で「鰓条骨」「gill raker bones」「branchial spines」と揺れ、鰓条骨か鰓耙か要原典確認。別の一般サイト要約は「branchiostegal 11–15」（C、帰属不明）。
  - M（記憶、未検証）: 鰓蓋は鰓蓋骨・前鰓蓋骨・間鰓蓋骨・下鰓蓋骨の4枚の骨と、その下の鰓条骨（膜で連結）からなり、後縁の膜（鰓膜）が弁として働く。鰓弁は血液の色で赤く、通常は鰓蓋に隠れる。鰓蓋の内側には擬鰓（赤い小さな腺状構造）がある、と記憶している。
  - ヤマメの鰓蓋の開口時に鰓弁がどの程度見えるかは、写真の注釈に明確な記述が無い。
- 適用範囲: ヤマメ（青森県の報告）／サケ科一般（M）。
- 出典: 青森県産業技術センター事業報告（継承: r01 F-01）。鰓条骨11–15の一般サイト（継承: r02、帰属不明）。
  - https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf
  - https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/
  - https://allfishes.org/fishes/marine/masu-salmon
- 証拠: [A]（青森、部位に曖昧さあり）「…側線鱗数118–134枚、鰓条骨数11条」（継承した記録の言い換え）。M の部分は [M] 未検証。

### F-20 呼吸サイクル（鰓蓋の拍動）【第2版で更新】
- 主張/値:
  - **ニジマスの換気頻度（検索 #12、A）**: 通常酸素下で、対照魚 57±4 回/分、軟水に順化した魚 78±4 回/分（平均±SEM）。低酸素下では換気頻度と振幅が増加。**水温・体サイズ・n は要約に無し。** 算術変換: 57回/分 = 0.95 Hz（周期1.05 s）、78回/分 = 1.30 Hz（周期0.77 s）。
  - 別のニジマス研究の要約（検索 #12。どの論文か特定不能、A）: 呼吸頻度は吸入 PO2 が約80 mmHg を超える範囲ではほぼ一定。400–600 g のニジマスで、吸入 PO2 を150から80 mmHg に下げると毎分の換水量が約0.2から0.6 L/kg/min に増え、さらに低い PO2 では 1–5 L/kg/min。低酸素下の酸素利用率は55%から約20%に低下し、換水量は13倍に増えた。
  - **運動後（検索 #11、A）**: 若齢ニジマスで、激しい運動の後は換水流量と代謝率がほぼ2倍になり、1回換水量（stroke volume）の増加が酸素消費増加への最大の寄与で、頻度と酸素利用率はほとんど変わらなかった。→ 動画では、運動後は鰓蓋の開閉の周期を保ったまま振幅（開き）を大きくする。
  - カテコールアミン（検索 #11、A）: 換気頻度の変化は、鰓蓋圧の振幅の変化と独立に起こりうる。→ 周期と振幅を独立パラメータにする根拠。
  - **水温依存（検索 #10、定性のみ）**: ニジマスの換気頻度は、試験温度10、15、20、25 °C のうち高温ほど有意に増加した、という要約がある。**数値（回/分）は取得できなかった。** 非サケ科の別種（種不明）では、鰓蓋拍動数が18 °C で 153±9.6、38 °C で 283±11.0 という要約が出たが、種も条件も不明で温度の幅が異なるため採用しない。
  - 総説（A）: 魚の呼吸調節（幼魚から成魚まで）を扱う総説が存在する（PMC9923008）。数値は要約に無い。
  - M（記憶、未検証）: 呼吸は口腔ポンプと鰓蓋腔の吸引ポンプが交互に働く二段構造。口を開いて口腔を拡大し水を吸い込み、口を閉じて口腔を収縮させて水を鰓へ押し出す。鰓蓋腔が拡大して水が鰓を通り、鰓蓋後縁の膜が開いて水が出る。口の前方の弁と鰓膜の弁が逆流を防ぐ。咳反射（鰓の掃除）の動きもある。
  - 先行 M の「静止時 50–90回/分程度」は、A の 57–78回/分と矛盾しない（範囲内）。ただし温度の対応は未確認。
  - 未取得: ヤマメ／サクラマスの数値、鰓蓋の開閉の振幅（mm、角度）、水温と換気頻度の数値関係（回/分/°C）。
- 適用範囲: ニジマス（O. mykiss / Salmo gairdneri、PROXY）。実験条件（水温・体サイズ）は要約に無し。
- 出典:
  - https://journals.biologists.com/jeb/article-abstract/198/12/2557/7087/The-effects-of-softwater-acclimation-on?redirectedFrom=fulltext
  - https://journals.biologists.com/jeb/article-abstract/53/3/529/21673/Responses-of-the-Respiratory-Pumps-to-Hypoxia-in?redirectedFrom=fulltext 、https://journals.biologists.com/jeb/article-abstract/46/2/317/21198/The-Effect-of-Hypoxia-Upon-the-Partial-Pressure-of?redirectedFrom=fulltext （PO2 80 mmHg・換水量の要約は、これらのどれか特定不能）
  - https://link.springer.com/article/10.1007/s10695-023-01247-9 （運動後の換水）
  - https://link.springer.com/article/10.1007/BF00263599 （カテコールアミン）
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC9923008/ （総説）
  - 水温（定性）: 候補 https://opus.lib.uts.edu.au/handle/10453/9597 （要約と URL の対応は特定不能）
- 証拠: [A] "ventilation frequency was ... 78±4 breaths min⁻¹ [softwater-acclimated] compared to 57±4 breaths min⁻¹ in control fish"（要約）。M の部分は [M] 未検証。実装では、鰓蓋と口の拍動を独立パラメータ（周期、振幅）にして、水温・遊泳速度・警戒で変える。温度の係数は根拠なしの仮置き。

### F-21 鼻曲がり（kype）・婚姻期の頭部の変化（文献）
- 主張/値:
  - **サケ科の繁殖期の顎の変形は、一回繁殖型の Oncorhynchus では上顎、複数回繁殖型の Salmo・Salvelinus では下顎で最も特徴的**（レビューの記述）。吻の伸長、歯の肥大、鉤状の顎、背部の隆起、鰭の伸長、皮膚の肥厚、婚姻色。
  - サクラマス（降海型）の雄: 全体に黒ずみ、体側に不定形（雲状）の桜色の斑。**吻が伸びて下方に屈曲し、両顎の歯が肥大**。雌も婚姻色を示すが雄ほど顕著でない。「オソコリンカス」は「曲がった吻」の意で、鼻曲がりを指す。（継承: r03 F-01、F-06）
  - 降海型雄の代表的な二次性徴は、体サイズ補正後の hump depth（背の隆起の深さ）と吻長。（継承: r03 F-08）
  - **河川型ヤマメ**: 性成熟したヤマメは体色が黒ずむがサクラマスのように桜色にはならない（B）／婚姻色は薄い桃色〜濃い紅色が不定形（C）。**河川型の成熟雄の鼻曲がりの有無・大きさ・形状の資料は無い。**（継承: r03 F-02、F-03、Gap G2）
  - サケ科一般の kype の定義（C、Wikipedia系）: 一部の雄で産卵期前に下顎先端に生じる鉤状の構造。
  - 【第2版・検索 #17、#18】河川型ヤマメの成熟雄の鼻曲がりの定量資料は、再検索でも見つからなかった。Oncorhynchus で上顎が伸びて吻を作る記述、マスの背の隆起は骨成長、回遊型の雄は吻が長いほど繁殖成功が高い、という記述は F-31。
- 適用範囲: 査読レビューはサケ科全般（Thymallus のレビュー内の比較）。降海型サクラマスの記述は PROXY。
- 出典: General patterns of sexual dimorphism in graylings (Thymallus), with a comparison to other salmonid species, Rev. Fish Biol. Fisheries 2021（継承: r02 F-25）。北海道立総合研究機構・北海道庁（継承: r03 F-01）。Kype（Wikipedia系、継承: r03 F-08）。
  - https://link.springer.com/article/10.1007/s11160-021-09694-4
  - https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
  - https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
  - https://en.wikipedia.com/wiki/Kype
- 証拠: [A]（レビュー） "The transformation of the jaws ... tends to be most characteristic for semelparous Oncorhynchus (upper jaw), and iteroparous Salmo and Salvelinus (lower jaw)."／[B] "snout elongated and curves downward, jaw teeth enlarged"（継承）。

### F-22 写真由来: 産卵期の雄の頭部（キペ）
- 主張/値（`head_mouth.jaw_kype` の集計: 全70枚で none 65、slight 3、clear 2。clear の2枚は産卵期の雄 p012・p034。none には「頭部が写らず未確認」の p035 を含む）:
  - p012（産卵期の雄、clear）: 「吻は長めで先端が尖る。**下顎が上顎より長く、先端が上向きに反ってフック状**。口内は暗く、舌は桃色」。
  - p034（産卵期の雄、clear）: 「吻は長めでやや尖り、吻端は上向き気味で、**下顎先端の鉤が上顎先端とかみ合う形**」。口角は眼中心の約2眼径後方。体は暗化、鰓蓋表面がざらついた質感。
  - p045（産卵期の雄、slight）: 口を開けて下顎が前方へ約13 px 突出。
  - p044（産卵後の雄、種ラベル unclear、slight）: 下顎が上顎より約12 px 前に突出、先端が上向きの可能性。
  - p024（非産卵期の大型成魚、slight）: 上顎先端が下向きに湾曲してわずかに鉤状、下顎は太く長い。
  - 産卵期の雄の4枚のうち p035 は頭部が写っていない。
- 適用範囲: 参照写真。**降海型（サクラマス）か河川型かは写真から判別できない**（p012・p034 は網上・地面での撮影）。サイズ不明。
- 出典: catalog の `head_mouth` / `eye`。
  - p012 https://remix-com.amebaownd.com/posts/34118208/
  - p034 https://ameblo.jp/makotoyamame/entry-12626540773.html
  - p044・p045 https://gecko0912.web.fc2.com/HP3/zukan/photo/12/yamame.htm
  - p024 https://themissionflymag.com/yamame-wish-list-fish/
- 証拠: [C(P)] p012 "下顎が上顎より長く、先端が上向きに反ってフック状"、p034 "下顎先端の鉤が上顎先端とかみ合う形"。F-21 の「Oncorhynchus は上顎の変形が特徴」との関係は §3-3。

### F-23 雌雄差・早熟雄（頭部に関する部分）
- 主張/値:
  - 韓国産マスの雄は頭長に対する吻長・上顎長の比が雌より大きく、眼径の比は小さい（F-04）。
  - **早熟雄（成熟した河川残留の雄パー）は小型で二次性徴がほとんど（または全く）発達せず、スニーキングで雌に近づく。** 体サイズ以外の形態形質は繁殖成功に寄与しない。体高が高く体色が暗化し、パーマークがくっきりして見える（別資料、B）。
  - 雄の生活史は降海型（尾叉長30–50 cm、成熟3–4歳）と河川型（resident form、10–20 cm）に分けられるとの記述がある（A、「10–20 cm」が早熟雄か河川型全体かは要約に無し）。
- 適用範囲: O. masou の雄（降海型と河川型）。ヤマメの成魚の雌雄差の数値は未取得。
- 出典: Sexual selection on mature male parr of masu salmon (Oncorhynchus masou): Does sneaking behavior favor small body size and less-developed sexual characters?（継承: r03 F-07, F-09）。
  - https://www.researchgate.net/publication/225706209_Sexual_selection_on_mature_male_parr_of_masu_salmon_Oncorhynchus_masou_Does_sneaking_behavior_favor_small_body_size_and_less-developed_sexual_characters
  - https://koreascience.kr/article/JAKO199327236818661.page
- 証拠: [A] "Precocious males have a small body size with little or no development of sexual characters… No morphological characters other than body size contributed to the reproductive success of parr."

### F-24 飼育・急成長・家畜化による頭部形状・眼径の変化（PROXY）【第2版で追記】
- 主張/値:
  - 成長ホルモン遺伝子導入ギンザケは、同じ体サイズの非導入個体に比べ**眼径が約30%小さい**（肥満度は差なし）。
  - ギンザケの飼育成魚は野生魚より、性的二形が大きく減少、**頭が小さく吻の曲がりが弱い**、体幹が深い、尾柄が大きい、背鰭が短い。
  - 飼育由来のブラウントラウトは野生より頭が短く流線形が弱い。
  - **【新規・検索 #16】タイセイヨウサケ（Salmo salar）で、複数の common garden 実験により家畜化に伴う眼サイズの縮小が示された**（論文題目 "Domestication-induced reduction in eye size revealed in multiple common garden experiments: The case of Atlantic salmon (Salmo salar L.)"。数値は要約に無し）。
- 適用範囲: PROXY: O. kisutch、Salmo trutta、Salmo salar。ヤマメでは未検証。個体差・放流個体の設計の方向性としてのみ使える。
- 出典: Genetically modified growth affects allometry of eye and brain in salmonids, Can. J. Zool.（継承: r02 F-22）。Evidence for Morphometric Differentiation of Wild and Captively Reared Adult Coho Salmon, Environ. Biol. Fishes（継承: r01 F-21）。
  - https://dx.doi.org/10.1139/z11-126
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC2848618
  - https://link.springer.com/article/10.1023/A:1007646332666
  - https://research.ucc.ie/en/publications/domestication-induced-reduction-in-eye-size-revealed-in-multiple/
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8477603/ （第2版で得たタイセイヨウサケの眼サイズ）
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5551095/
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/
- 証拠: [A] "Transgenic fish had smaller eyes (−30% eye diameter) when compared to non-transgenic fish of matching body size."／"smaller heads and less hooked snouts"（継承）。

### F-25 頭部の色・黒点（眼周囲、鰓蓋、頬）
- 主張/値:
  - 台湾亜種成魚（PROXY）: 頭頂は緑、**眼と鰓蓋周辺は銀色**。
  - 「頭部を除く背部と背鰭・脂鰭・尾鰭に黒点があり、頭部背面には黒点が無い」（サクラマス降海型の解説、HRO、B）。
  - 釣りサイトの記述（C、未検証）: 目の周りに数個の黒点があるのはヤマメとアマゴに固有。
  - 写真（先行ストリーム r05 の集計）: 項・頬・鰓蓋に小黒点が数個〜約12個の個体がある。明確な「鰓蓋の黒斑」は写真で一貫して確認されない。眼周囲は暗い輪（F-08）。
- 適用範囲: 台湾亜種は PROXY。HRO は降海型中心。
- 出典: （継承: r05 F-13, F-14, F-26、r01 F-15, F-16）
  - https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus
  - https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
  - https://tsurihack.com/881
  - https://www.honda.co.jp/fishing/picture-book/yamame/
- 証拠: [C]（台湾亜種・釣りサイト）／[B]（HRO） "頭部を除く背部と背鰭・脂鰭・尾鰭に黒点"（継承）。

### F-26 頭長・計測点の定義
- 主張/値:
  - 一例の定義（種は要約に明記されず）: 標準体長（SL）は上顎の先端（symphysis）から尾鰭基部中央まで、頭長（HL）は上顎先端から鰓蓋後端まで、体高（BD）は背鰭起点の位置。
  - 神奈川県立生命の星・地球博物館の調査報告32号は、ヤマメの計測項目に TL、SL、頭長、吻長、眼径、体高、体幅を挙げているとされる（本文は未読）。
  - 【第2版・検索 #14】神奈川県の別の報告書（https://www.pref.kanagawa.jp/uploaded/attachment/10225.pdf）も、採集したヤマメの全長・体長・頭長・吻長・眼径・体高・体幅・パーマーク・腹部黒点を測定したと要約される。値は要約に無し。
  - 写真計測ツール（`tools/photo/morpho_stats.py`）の HL は「吻端〜鰓蓋後端の直線距離」で、上の定義と整合する。ただし本書作成時点で `docs/yamame/photo_analysis/` には landmark 計測（landmarks_*.json、morphometrics.json）の出力が無く、HL/SL の写真由来の集計値は存在しない（作業用ディレクトリに合成テスト用の c99 があるのみで、実写の値ではないため使っていない）。
- 適用範囲: 一般的な魚類計測の定義。O. masou の資料が同じ定義とは限らない（台湾亜種の「体長」の定義も未確認）。
- 出典:
  - https://www.m.elewa.org/JABS/2010/34/5.pdf
  - https://www.researchgate.net/figure/Morphometric-measurements-1-Standard-length-SL-from-upper-jaw-symphysis-to-middle_fig16_249657347
  - https://nh.kanagawa-museum.jp/assets/icp/pdf/nhr32_115-122_kaneko_s.pdf
- 証拠: [B] "standard length (SL) is measured from upper jaw symphysis to middle base of caudal fin, ... and head length (HL) from upper jaw symphysis to posterior tip of operculum"（継承: r02 F-27）。


### F-27 ニジマスの摂餌ストライク中の神経頭蓋の挙上（XROMM）【新規・検索 #2、#3】
- 主張/値: ニジマス（Oncorhynchus mykiss）の摂餌中の神経頭蓋と前方24個の椎骨の3次元運動を X 線動体再構成（XROMM）で測定（**28ストライク、3個体**）。**神経頭蓋の最大挙上は 2〜18°。** トラウトは、椎間関節の最大約1/3で、小さな背側回転（大半が3°未満）を合算して神経頭蓋を持ち上げる。頭と体幹が「首のように」動く運動（neck-like）として報告された。
  - 要約に無かったもの: ストライクの継続時間、開口角、舌骨・鰓蓋の運動（時間経過は要約に無し）。
- 適用範囲: PROXY: ニジマス（体サイズ・飼育条件は要約に無し）。ヤマメは未測定。
- 出典（結果に出た URL。「28ストライク、2–18°」と「3°未満」の文は、これらの結果集合から出ており、個々の対応は特定不能）:
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8385379/ （題目 "A neck-like vertebral motion in fish"）
  - https://par.nsf.gov/biblio/10516045
  - https://sicb.org/?p=43945
- 証拠: [A] "Trout combine small (most less than 3°) dorsal rotations over up to a third of their intervertebral joints to elevate the neurocranium"（要約）。頭部アニメに「頭の挙上は小さく、2〜18°の範囲」を使える。

### F-28 ブラウントラウトの頭長の成熟による変化と性差（PROXY）【新規・検索 #16】
- 主張/値: ブラウントラウト（Salmo trutta）の体節の個体発生と性的二形の研究で、**未成熟個体は雌雄同形（monomorphic）、成熟個体は雌雄とも幼魚の様式から離れ、雄は相対的に大きな頭長を得る。** 数値（比、サイズ）は要約に無し。
- 適用範囲: PROXY: Salmo trutta（雄の頭長が成熟で相対的に大きくなる方向）。ヤマメ（河川型の成熟雄）で同じか未検証。韓国産マスの雄の吻長・上顎長の比が大きい（F-04）という記述と同方向。
- 出典:
  - https://research-portal.st-andrews.ac.uk/en/publications/the-ontogenetic-development-of-body-segments-and-sexual-dimorphis/ （題目 "The ontogenic development of body segments and sexual dimorphism in brown trout (Salmo trutta L)"）
  - https://staffprofiles.bournemouth.ac.uk/display/journal-article/389897
- 証拠: [A]（抄録の要約）"males acquiring a greater relative head length"。

### F-29 飼育サケ科幼魚（0+、1+）の頭部寸法と成長に伴う変化（PROXY）【新規・検索 #16】
- 主張/値: 淡水産サケ科の第2世代の飼育幼魚（0+と1+歳）で、種内・種間の形態変異と成長に伴う変化を調べた研究。測定項目に眼径（ED）と頭長（HL）を含む。**0+歳では種間の形態がよく似ており、成長するほど種間差が顕著になる。** 種を最もよく識別する形質は、体高と頭部寸法、および胸鰭長。数値は要約に無し。
- 適用範囲: PROXY: 淡水産サケ科の複数種（種名は要約に無し）。→ ヤマメの頭部寸法比も成長段階（0+と1+以上）で変えるべき、という定性的な根拠。
- 出典（どちらの文書の記述か特定不能）:
  - https://jukuri.luke.fi/server/api/core/bitstreams/e4102165-ae6b-4210-89ba-98049dd86dcb/content
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC1634950
- 証拠: [B]（Luke（フィンランド天然資源研究所）リポジトリの文書と推測。査読論文かは要約から確認できず）要約より "interspecific differences become more pronounced" as they grow。

### F-30 瞳孔は固定が大半（真骨魚の総説）【新規・検索 #19】
- 主張/値: **真骨魚は、少数の例外を除いて虹彩が固定で、光に対する瞳孔反応を持たない。** 瞳孔運動をする少数の真骨魚でも、視覚機能のためではなく、底生種で眼を目立たなくする（カモフラージュ）役割という記述。メダカ（medaka）は強い光で瞳孔が小さくなる（縮瞳）。アセチルコリン等の投与で縮瞳し、虹彩が自律神経で制御されることを示唆。**サケ科での瞳孔反応は要約に無く、未確認。**
- 適用範囲: 真骨魚一般（総説）。メダカは例外的な例。サケ科は未確認。→ 写真の「瞳孔は黒く円形」（F-08、48/57枚）と整合。仕様では固定径の円形瞳孔（眼径に対する比は調整値）とし、動的な収縮は入れない（根拠は上の総説の要約のみ）。
- 出典:
  - https://openaccess.city.ac.uk/19785 （総説 "The pupillary light responses of animals: a review of their distribution, dynamics, mechanisms and functions"。著者・年は要約に無し）
  - https://openaccess.city.ac.uk/id/eprint/19785/1/Pupil%20review%20for%20CRO.pdf
  - https://kaken.nii.ac.jp/grant/KAKENHI-PROJECT-24657051 （メダカの瞳孔の研究課題）
- 証拠: [A]（総説の要約）"Teleost fish, with a few exceptions, have irises that remain fixed"。メダカの縮瞳は [B]（科研費データベース）。

### F-31 マス（O. masou）の二次性徴: 背の隆起は骨成長、吻、河川残留雄の成熟年齢【新規・検索 #17】
- 主張/値:
  - 日本の太平洋サケ4種で背の隆起（dorsal hump）の形態を解析した研究があり、**マスとシロザケは結合組織の増加・骨成長の増え方が他種より小さく、隆起は骨組織の成長で形成される**（結合組織ではない）。
  - 回遊型の雄は、吻が長く隆起が大きいほど高い繁殖成功を得る。
  - Oncorhynchus（「曲がった吻」の意）では、上顎が下顎より伸びて「吻（snout）」を形成する（百科事典系の記述、C）。→ F-21 の査読レビュー（Oncorhynchus は上顎が特徴的）と整合。
  - 河川残留型: 雄は0+歳で成熟、雌は1+歳で成熟（雌は稀）。残留雄の一部は生き残って再び産卵する（反復繁殖）。
  - 早熟雄（パー）では、体サイズ以外の形態形質は繁殖成功に寄与せず、二次性徴の未発達につながった可能性（F-23 と同じ文）。
  - **見つからなかった**: 河川型成熟雄の鼻曲がり（上顎・下顎の変形量、サイズ・年齢との関係）の定量資料（検索 #17、#18）。
- 適用範囲: O. masou の回遊型と河川残留型（北海道大学系資料を含む）。ヤマメ河川型の大型成熟雄の頭部形状は未確認。
- 出典（どの文がどの URL か特定不能）:
  - https://eprints.lib.hokudai.ac.jp/repo/huscap/all/70887/Susuki2017%20JM-3.pdf
  - https://afs.confex.com/afs/2015/webprogram/Paper18884.html
  - https://en.wikipedia.org/wiki/Kype
- 証拠: [A]（隆起・繁殖成功・成熟年齢。論文要約）"Migratory males having longer snout and larger hump can acquire higher reproductive success"。[C]（上顎が伸びて吻を作る、の記述）。

---

## 3. 資料間の矛盾・不一致

1. **眼径/頭長の値が桁で割れる。** 幼魚20–30%→成魚約10%（F-01）、サクラマス0.100（F-02）、台湾亜種成魚の派生0.29（F-03）、写真の成魚中央値0.15・パー0.22（F-05）、ビワマス0.169（F-02）。サイズ（30 cm級の河川型か50 cm級の降海型か）、亜種、計測の定義（暗い眼窩縁を含めるか。含めると金環のみの約1.5倍、F-06）が揃っておらず、**解消できない**。仕様では「体長連動の関数」にして、定義を明記する。
2. **吻長（眼前縁〜吻端）**: 台湾亜種は頭長の約0.227（吻長/頭長=1/4.41、F-03）。写真の「眼前縁〜吻端」は頭長の約0.27–0.34（F-07）。写真は眼窩の暗色縁を前縁に含めている可能性、斜視、幼魚と成魚の違い、そもそも「吻長」の定義（吻端〜眼窩前縁か）が資料に無い。**解消できない。**
3. **顎の変形部位**: 査読レビューは「Oncorhynchus では上顎の変形が最も特徴的」（F-21）。日本語資料は「吻が伸びて下に屈曲し、両顎の歯が肥大」（上顎の下曲がりと整合）。一方、写真の産卵期の雄2枚（p012、p034）は**下顎先端の上向きのフック**が明瞭（F-22）。kype の一般定義（Wikipedia系）も「下顎先端」。「特徴的」は排他ではなく、両方が起こる可能性があるが、資料はどちらか一方の記述になっている。**ヤマメで上顎・下顎のどちらがどの程度変形するかは未確定。**
4. **河川型の成熟雄の鼻曲がり**: 早熟雄（parr）は二次性徴がほぼ無い（F-23）、降海型の雄では顕著（F-21）、写真の2枚（F-22）は明瞭なフックだが降海型か河川型か不明。大型の河川型雄の資料は無い。
5. **上顎後端と眼**: 先行ストリームの記憶（M）は「成魚で眼の後縁を越える」。写真の閉口例は「眼後縁より後方」11、「眼中心直下」9（F-15）で、約半数は後縁に届かない。開口時の見かけの後退を含むため、閉口時の位置は不確実。
6. **頭長/体長**: 台湾亜種の派生23.8%SL（単位は体長が SL と仮定、F-03）、韓国産の雄の頭長/尾叉長21.6–24.7%（F-04、FL基準）、写真1枚のHL/SL≈0.26（p031、種ラベル unclear）。基準長が違う。
7. **鰓条骨数**: 青森ヤマメ「11」（部位に曖昧さ）と、一般サイトの「branchiostegal 11–15」（F-19）。後者はサケ属一般の混入の可能性。
8. **虹彩の色**: 写真の大多数は金〜黄の環（F-08）。台湾亜種の記述は「眼と鰓蓋周辺は銀色」（F-25）。虹彩環の色と眼周囲の皮膚・鰓蓋の色は別の部位の記述である可能性が高く、直接の矛盾とは言い切れない。
9. **視野（第2版）**: 一般向け解説（C）は「水平約330°、後方の死角約30°」とする一方、「後方・下方・上方・前方にも死角が生じる」という記述もあり、全体の死角の説明が一貫しない。両眼視野の「約30°」も、解説サイトの記述で査読値ではない。各眼180°・重なり30°・死角30°の組み合わせは算術的に整合する（F-11）が、独立の確認ではない。**解消できない。**
10. **瞳孔（第2版）**: 総説は「真骨魚の大半は虹彩が固定」（F-30）。写真注釈は「瞳孔は黒く円形」が大半（F-08）で整合するが、サケ科での直接確認は無い。一方で、メダカのように縮瞳する例外が報告されているため、サケ科が例外でないとは断定できない。
11. **呼吸数（第2版）**: 同一論文内で対照魚57±4回/分と軟水順化魚78±4回/分で約37%の差（F-20）。水温が高いほど換気頻度が増える（定性）ため、「ニジマスの安静時の回/分」を単一の値にできない。先行の記憶（50–90回/分程度）は範囲として矛盾しない。
12. **脂瞼（第2版）**: 写真2枚（2/57）に「脂瞼様の膜」の注釈（F-09）があるが、文献（百科事典系）が挙げる脂瞼の例にサケ科は無い。写真の膜の同定ができず、**解消できない**（不在の証明でもない）。
13. **上顎の伸長（第2版）**: 百科事典系の「Oncorhynchus は上顎が伸びて吻を作る」（F-31）は F-21 の査読レビューと整合する。写真2枚の下顎フック（F-22）は、この「上顎の伸長」と併存しうる（§3-3 の未解決点は続く）。
14. **著者表記（第2版）**: 検索 #15 の要約は韓国産サケ属の形態研究（F-04）の著者を "Myoung & Kim, 1993" と書いたが、結果の題目・URL では確認できていない。F-04 の出典は URL を正とする。

---

## 4. 見つからなかったこと（Gaps）

3Dモデル／アニメ／行動の実装に必要だが、検索19回でも確認できなかった事項（◎=特に必要）。各項に、試した検索（#番号は §6）と次の一手を付ける。

1. ◎ **ヤマメ（河川型）の頭長・吻長・眼径・上顎長・眼間隔・頭高・頭幅（%SL、%HL）のサイズ別・雌雄別の実測値。** 試した検索: #14（日本語）、#15（英語）、#16（サケ科の成長）。結果は「計測項目を測った」「種間差がある」という要約だけで、値は無かった。台湾亜種の比（F-03）と種群の定性記述しか無い。次の一手: FishBase O. masou の形態欄（WebFetch が遮断）、Korean J. Ichthyol. 1993 の表（F-04）、神奈川県の報告書（https://www.pref.kanagawa.jp/uploaded/attachment/10225.pdf、頭長・吻長・眼径を測定とあるが値は要約に無し）、Fujioka et al. 2025（ビワマス新種記載）、Nakabo 編 Fishes of Japan。**写真の landmark 計測を実施するのが最も確実。**
2. ◎ **眼球の寸法**: 水晶体径/眼球径（サケ科）、角膜の厚み、虹彩 argentea の色・厚み、眼の頭部からの突出量。Matthiessen比（魚類一般、C）しか得られなかった。サケ科の眼の解剖の文献は未取得（#8）。
3. ◎ **視野**: 査読論文のトラウトの両眼視野の前方重複角、各眼の水平・鉛直視野、盲域、視力（#6、#7）。得られたのは一般向け解説（C）のみ。眼球の可動域・輻輳も未確認。ニジマスの網膜・視神経反応の論文の題目は見つかったが数値は無い。
4. ◎ **摂餌の動き**: サケ科（ニジマス、ブラウントラウト、ヤマメ）の最大開口角、開口〜最大開口の時間、閉口までの時間、吸引距離、接近速度、舌骨・鰓蓋の運動量（#1〜#5）。頭蓋挙上 2–18°（F-27）のみ。**ドリフト餌への実際のストライク映像・数値は未取得**（r09 も同様）。
5. ◎ **口裂**: 閉口時の上顎後端と眼の位置関係（実測）、口裂の長さ/頭長、口角の角度、下顎の突出量、唇の厚み。写真注釈のみ（F-15）。
6. **歯・顎骨**: ヤマメの歯の配置（前上顎骨・主上顎骨・歯骨・鋤骨・口蓋骨・舌）、上主上顎骨の有無。舌咬み装置の定性記述（F-16）のみで、歯の本数・位置の座標は無い。
7. **鼻孔・頭部側線孔**: 前後鼻孔の大きさ・位置、頭部の側線孔（吻・下顎・前鰓蓋）の座標と個数。未検索（検索予算）。
8. ◎ **鰓蓋**: 鰓蓋・下鰓蓋・前鰓蓋・間鰓蓋・鰓条骨の位置関係の図、**鰓蓋の開閉の振幅（mm、角度）**、**ヤマメの呼吸数の水温依存（回/分）**、鰓弁（赤）の見え方、咳反射（#10〜#13）。ニジマスの安静時 57–78回/分（水温不明）と、運動後に振幅が主に増えること（F-20）のみ。
9. ◎ **鼻曲がり**: 河川型ヤマメの成熟雄での発達の程度、サイズ・年齢との関係、上顎・下顎の形、顎歯の肥大（#17、#18）。降海型の記述と、早熟雄で未発達という記述（F-21、F-23、F-31）のみ。
10. **脂瞼**: サケ科（ヤマメ）にあるかは、否定的証拠のみ（F-09）。サケ科の眼の組織学の資料があれば確認できる。
11. **瞳孔のサケ科での確認**: 総説は「真骨魚の大半は固定」（F-30）とするが、サケ科は未確認。
12. 眼周囲の黒点・頬の黒点の分布。眼の色（虹彩）の雌雄・季節・婚姻期の変化（F-08 の p044、p045 の暗色眼は2枚のみ）。夜間の瞳孔・眼の反射（行動ストリームと関係）。
13. 写真の実写 landmark 計測（HL/SL、眼位、口裂）は本リポジトリに出力が無く、頭部の比の写真由来の集計を作れていない（F-26）。写真カタログの目視推定のみ。
14. 参照動画: 摂餌時の口・鰓蓋・眼の動きの映像資料（本課題では動画の調査も未実施）。
15. 水温と換気頻度の数値関係、体サイズ依存（ヤマメ）。F-20 の温度係数は仮置きしかできない。

**検索予算が再び使える場合の次の一手（優先順、日英）**
- `masu salmon OR yamame head length percent standard length eye diameter snout length Oncorhynchus masou masou`（FishBase、J-STAGE の魚類学雑誌、神奈川県博の報告書を狙う）
- `rainbow trout OR brown trout OR cutthroat strike kinematics peak gape ms high-speed drift feeding`（"Salmonid" の cranial kinematics、Sanford 論文の全文）
- `salmonid visual field binocular overlap rainbow trout eye position degrees`（Hughes / Northmore / Browman）
- `rainbow trout opercular frequency 5 10 15 20 °C breaths per minute temperature acclimation`
- `male resident masu salmon kype lower jaw hook mature parr secondary sexual characters jaw teeth`

---


## 5. 出典一覧（URL付き、重複排除）

**注（第2版）: 第2版の検索で得た URL は「第2版の検索で得た URL」の節にまとめた。下記のうち文献系（Wikipedia、行政、学術）のURLは、先行ストリーム（r01〜r05）が検索結果で得たものを転記した。私は内容を再確認していない。写真系のURLは、写真カタログ `catalog_c01〜c07.json` の `source_url` である。**

学術・公的・準公的資料（継承）
- Morphological study of Oncorhynchus spp. in Korea IV, Korean J. Ichthyology 1993 — https://koreascience.kr/article/JAKO199327236818661.page
- Sexual selection on mature male parr of masu salmon (Oncorhynchus masou) — https://www.researchgate.net/publication/225706209_Sexual_selection_on_mature_male_parr_of_masu_salmon_Oncorhynchus_masou_Does_sneaking_behavior_favor_small_body_size_and_less-developed_sexual_characters
- General patterns of sexual dimorphism in graylings (Thymallus), Rev. Fish Biol. Fisheries 2021 — https://link.springer.com/article/10.1007/s11160-021-09694-4
- The lateral line system and its innervation in the masu salmon, Ichthyological Research 2021 — https://link.springer.com/article/10.1007/s10228-021-00843-0
- Nakae, Hasegawa, Miyamoto 2022, Sci. Rep. — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9537280/
- Genetically modified growth affects allometry of eye and brain in salmonids — https://dx.doi.org/10.1139/z11-126 、 https://pmc.ncbi.nlm.nih.gov/articles/PMC2848618
- Evidence for Morphometric Differentiation of Wild and Captively Reared Adult Coho Salmon — https://link.springer.com/article/10.1023/A:1007646332666
- Domestication-induced reduction in eye size（題目レベル） — https://research.ucc.ie/en/publications/domestication-induced-reduction-in-eye-size-revealed-in-multiple/
- 飼育と野生のブラウントラウトの形態 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5551095/ 、 https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/
- 青森県産業技術センター事業報告 — https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf
- 北海道立総合研究機構（サクラマス解説） — https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 北海道庁 — https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
- 神奈川県立生命の星・地球博物館 調査報告32号 — https://nh.kanagawa-museum.jp/assets/icp/pdf/nhr32_115-122_kaneko_s.pdf
- Jan et al. 1990（台湾亜種、一次資料候補） — https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf
- Dorofeeva 2008, Trudy ZIN — https://www.zin.ru/Journals/trudyzin/eng/publication.html?id=10
- 計測点の定義 — https://www.m.elewa.org/JABS/2010/34/5.pdf 、 https://www.researchgate.net/figure/Morphometric-measurements-1-Standard-length-SL-from-upper-jaw-symphysis-to-middle_fig16_249657347
- FishBase（O. biwaensis） — https://fishbase.se/summary/71341

百科事典・二次資料（継承）
- https://en.wikipedia.org/wiki/Oncorhynchus_masou
- https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus
- https://en.wikipedia.org/wiki/Oncorhynchus
- https://en.wikipedia.org/wiki/Salvelinus
- https://en.wikipedia.com/wiki/Kype
- https://ja.wikipedia.org/wiki/%E3%83%93%E3%83%AF%E3%83%9E%E3%82%B9
- https://animalia.bio/oncorhynchus-masou
- https://www.wikiwand.com/en/articles/Masu_salmon
- https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/
- https://allfishes.org/fishes/marine/masu-salmon
- https://tsurihack.com/881
- https://www.honda.co.jp/fishing/picture-book/yamame/

第2版の検索で得た URL（要約のみ確認。全文は未読。どの文がどの URL かは各 Finding の注記を参照）
- 摂餌・頭蓋: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8385379/ 、https://par.nsf.gov/biblio/10516045 、https://sicb.org/?p=43945 、https://sicb.org/?p=35129 、https://sicb.org/abstracts/evaluating-the-importance-of-new-structures-versus-new-muscle-activity-patterns-in-the-evolution-of-a-novel-feeding-mechanism-in-salmonid-fishes 、https://en.wikipedia.org/wiki/Aquatic_feeding_mechanisms 、https://vliz.be/imisdocs/publications/346500.pdf 、https://biomechanics.ucr.edu/Higham%202011%20Fish%20Physiology.pdf 、https://biomechanics.ucr.edu/Higham_etal_2006a.pdf 、https://pmc.ncbi.nlm.nih.gov/articles/PMC8753175 、https://pmc.ncbi.nlm.nih.gov/articles/PMC4507239 、https://sicb.org/?p=28339 、https://sicb.org/?p=33737
- 眼・視野・瞳孔・脂瞼: https://en.wikipedia.org/wiki/Matthiessen%27s_ratio 、https://courses.edx.org/c4x/MITx/9.01x/asset/fish_lens.pdf 、https://encyclopedia.pub/entry/33538 、https://www.flyfisherman.com/editorial/how-trout-see/454967 、https://www.hatchmag.com/articles/can-fish-see-directly-behind-them/7716172 、https://blog.vailvalleyanglers.com/how-do-trout-see/ 、https://pubs.usgs.gov/publication/70027220 、https://pubmed.ncbi.nlm.nih.gov/8266629/ 、https://openaccess.city.ac.uk/19785 、https://openaccess.city.ac.uk/id/eprint/19785/1/Pupil%20review%20for%20CRO.pdf 、https://kaken.nii.ac.jp/grant/KAKENHI-PROJECT-24657051 、https://en.wikipedia.org/wiki/Adipose_eyelid 、https://handwiki.org/wiki/Biology:Adipose_eyelid 、https://fao.org/docrep/pdf/006/ad471e/ad471e62.pdf
- 呼吸: https://journals.biologists.com/jeb/article-abstract/198/12/2557/7087/The-effects-of-softwater-acclimation-on?redirectedFrom=fulltext 、https://journals.biologists.com/jeb/article-abstract/53/3/529/21673/Responses-of-the-Respiratory-Pumps-to-Hypoxia-in?redirectedFrom=fulltext 、https://journals.biologists.com/jeb/article-abstract/46/2/317/21198/The-Effect-of-Hypoxia-Upon-the-Partial-Pressure-of?redirectedFrom=fulltext 、https://link.springer.com/article/10.1007/s10695-023-01247-9 、https://link.springer.com/article/10.1007/BF00263599 、https://pmc.ncbi.nlm.nih.gov/articles/PMC9923008/ 、https://opus.lib.uts.edu.au/handle/10453/9597
- 頭部形態・性差・成長: https://research-portal.st-andrews.ac.uk/en/publications/the-ontogenetic-development-of-body-segments-and-sexual-dimorphis/ 、https://staffprofiles.bournemouth.ac.uk/display/journal-article/389897 、https://jukuri.luke.fi/server/api/core/bitstreams/e4102165-ae6b-4210-89ba-98049dd86dcb/content 、https://pmc.ncbi.nlm.nih.gov/articles/PMC1634950 、https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8477603/ 、https://koreascience.or.kr/article/JAKO199327236818661.pub 、https://www.pref.kanagawa.jp/uploaded/attachment/10225.pdf
- 二次性徴・鼻曲がり: https://eprints.lib.hokudai.ac.jp/repo/huscap/all/70887/Susuki2017%20JM-3.pdf 、https://afs.confex.com/afs/2015/webprogram/Paper18884.html 、https://en.wikipedia.org/wiki/Kype

写真（カタログ `source_url`。本書が引用した写真のみ。C(P)）
- p001 https://www.ana.co.jp/travelandlife/article/000941/
- p002 https://anglers.jp/catches/4687440
- p003 https://anglers.jp/catches/5841529
- p004・p065 https://web.tsuribito.co.jp/suburb/keiryu-trbt-2020-06-anaba-01
- p012 https://remix-com.amebaownd.com/posts/34118208/
- p013 https://anglers.jp/catches/6825477
- p015 https://note.com/kitasato_labo/n/n13a42411146a
- p017 https://plaza.rakuten.co.jp/nekomac/diary/202506270002/
- p022 https://www.honda.co.jp/fishing/news/news-20210330/
- p024 https://themissionflymag.com/yamame-wish-list-fish/
- p028・p040・p041・p042 https://tonysharks.com/Tree_of_life/Eukaryote/Opisthokonta/Yamame/Yamame.html
- p031 https://www.ana.co.jp/travelandlife/article/001841/
- p033・p034・p035 https://ameblo.jp/makotoyamame/entry-12626540773.html
- p044・p045・p046 https://gecko0912.web.fc2.com/HP3/zukan/photo/12/yamame.htm
- p047 https://anglers.jp/catches/3195446
- p049 https://www.gao-aqua.jp/animal/29487.html
- p051 https://fukuoka-fishing.com/entry/fukuoka-trout
- p052 https://anglers.jp/catches/4654214
- p053 https://note.com/kateri/n/n2b0c356686b3
- p056 https://anglers.jp/catches/2983720
- p060 https://anglers.jp/catches/6882516
- p063 https://anglers.jp/catches/5485397
- p068 https://gokaseriver.blog.fc2.com/blog-entry-130.html?sp

ローカルの継承元（先行ストリームの記録）
- `/home/user/gerupamasini/docs/yamame/research/r01_morph_jp.md`
- `/home/user/gerupamasini/docs/yamame/research/r02_morph_en.md`
- `/home/user/gerupamasini/docs/yamame/research/r03_lifestage_sex.md`
- `/home/user/gerupamasini/docs/yamame/research/r04_parr_jp.md`
- `/home/user/gerupamasini/docs/yamame/research/r05_parr_pigment_en.md`
- `/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json` 〜 `catalog_c07.json`

---

## 6. 検索ログ

**WebSearch 実行回数: 19回（すべて mode: standard。extended は使っていない）。20回目は共有上限（200/200）到達で拒否され、以後の検索・迂回はしていない。** 有用度: 高=課題の数値・記述が要約に明示、中=定性または PROXY、低=周辺情報のみ、無=使える情報なし。

| # | mode | クエリ（要旨） | 結果の要点 | 有用度 |
|---|---|---|---|---|
| 1 | standard | rainbow trout suction feeding kinematics gape angle time to peak gape strike duration ms | ブルーギル中心。最大開口まで約13 ms、流れの影響域は約1口径以内。トラウトの値は無し | 低（PROXY） |
| 2 | standard | Oncorhynchus mykiss prey capture kinematics ram-suction index jaw protrusion hyoid depression cranial elevation | ニジマスの XROMM（神経頭蓋の挙上）の存在、ram–suction 指標の変数 | 中 |
| 3 | standard | XROMM rainbow trout neurocranium elevation ... time to peak gape | 28ストライク・3個体・頭蓋挙上 2–18°、椎間関節の小回転（3°未満）。時間は無し | 高（F-27） |
| 4 | standard | salmonid feeding kinematics high-speed video 250 Hz rainbow trout lower jaw depression ... | サケ科の舌咬み装置の学会抄録（250 Hz、ニジマス含む3種）。開口量・時間の数値は無し | 中（F-16） |
| 5 | standard | Salmo gairdneri OR trout prey capture mouth opening time milliseconds cine film ... | 吸引摂食の一般機構、ラージマウスバスの時間経過（0–8, 16, 24, 約50 ms）。トラウトの値は無し | 低〜中（PROXY） |
| 6 | standard | rainbow trout binocular visual field frontal overlap degrees blind sector ... | 釣り解説の要約のみ（水平約330°、死角約30°、両眼視約30°）。査読値は無し | 中（C、F-11） |
| 7 | standard | rainbow trout retinal ganglion cell topography visual acuity ... lens diameter eye size | ニジマスの視覚発達・網膜の論文の題目のみ。数値は無し | 低 |
| 8 | standard | teleost spherical lens Matthiessen ratio 2.55 ... retractor lentis accommodation salmonid trout eye | Matthiessen比 2.55（2.40–2.82）、角膜は水中で無効、retractor lentis。サケ科の値は無し | 中（C、F-10） |
| 9 | standard | adipose eyelid salmonid trout ... | 脂瞼の既知の例はニシン・ボラ・アジ・サバ・サバヒー。サケ科の記述無し | 中（否定的証拠、F-09） |
| 10 | standard | ventilation frequency breaths per minute increased with temperature rainbow trout opercular beats ... | ニジマスで高温ほど換気頻度が増える（定性）。数値は無し | 低 |
| 11 | standard（domains: cob.silverchair.com, pmc, springer） | respiratory pumps rainbow trout temperature changes frequency ... amplitude buccal opercular pressure | 運動後は1回換水量が主に増え頻度は不変。頻度と振幅は独立に変わりうる | 中（F-20） |
| 12 | standard（domains: pmc, cob.silverchair.com, journals.biologists.com） | "ventilation frequency" rainbow trout resting normoxia "breaths min" ... | 57±4 と 78±4 回/分（JEB 198）、PO2 80 mmHg 超で頻度ほぼ一定 | 高（F-20） |
| 13 | standard | ヤマメ OR サクラマス OR マス 鰓蓋運動 呼吸数 水温 回/分 ニジマス 鰓蓋 拍動 | 青森県の報告書のみ。呼吸数の値は無し | 無 |
| 14 | standard | ヤマメ 頭長 吻長 眼径 上顎長 体長比 計測 河川型 サクラマス 形態 比較 表 | 計測項目を測ったという報告書（神奈川県ほか）のみ。値は無し | 無（Gap） |
| 15 | standard | Oncorhynchus masou morphometric measurements head length snout length orbit diameter upper jaw length percent of standard length ... | Korean J. Ichthyol. 1993 の要約再確認のみ。値の表は無し | 無（Gap） |
| 16 | standard | salmonid ontogeny allometry eye diameter relative to head length decreases with body size brown trout Atlantic salmon ... | ブラウントラウトの成熟雄の頭長、飼育幼魚の頭部寸法の成長変化、タイセイヨウサケの眼サイズ縮小（すべて定性） | 中（F-24、F-28、F-29） |
| 17 | standard | masu salmon Oncorhynchus masou resident mature males secondary sexual characteristics kype hooked jaw snout elongation ... | 背の隆起は骨成長、回遊型の雄は吻が長いほど有利、残留雄の成熟年齢。河川型の鼻曲がりの値は無し | 中（F-31） |
| 18 | standard | ヤマメ 産卵期 雄 鼻曲がり 下顎 先端 鉤状 婚姻色 河川型 吻 伸長 | HRO の既知の記述（吻が下に曲がる、歯の肥大）の再確認。河川型の新情報は無し | 低 |
| 19 | standard | teleost pupil constriction light intensity rainbow trout iris pupillary response ... argentea guanine | 総説: 真骨魚の大半は虹彩が固定。メダカは縮瞳。サケ科・argentea の記述は無し | 高（F-30） |
| 20 | standard | trout eye movements range of rotation degrees convergence prey fixation optokinetic ... | **未実行: 共有上限（200/200）到達** | —（回数に含めない） |

- 使用した検索予算: 19回（割当30回のうち）。共有上限に達したため、次のクエリは未実施: `salmonid head skeleton maxilla supramaxilla premaxilla teeth`、`ヤマメ 鼻孔 側線孔 頭部`、`ヤマメ 眼 大きさ 視力 視野`、眼球運動・可動域のクエリ（#20 は拒否）。
- 第1版での試行（再掲）: WebFetch で FishBase（https://www.fishbase.se/summary/Oncorhynchus-masou.html）→ `EGRESS_BLOCKED`。第1版の WebSearch 3回は上限到達で未実行。第2版では WebFetch は試していない。
- 検索ではない情報源: 先行ストリーム r01〜r05 の記述の継承、`catalog_c01〜c07.json` の集計（第1版）、第2版で他ストリーム r06・r08・r09・r10 を Grep し、眼・口・鰓蓋に関する新しい数値が無いことを確認した（r09 §4 課題2 は、トラウトの摂餌運動学が見つからなかったと記録している）。
