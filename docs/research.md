# シロチドリ（Kentish Plover）Research

対象種: シロチドリ *Charadrius alexandrinus* Linnaeus, 1758
（近年の分類改訂で *Anarhynchus alexandrinus* とする体系もある [S26]。本プロジェクトでは一般に通用する *C. alexandrinus* 表記を使い、コード内では `kentishPlover` と呼ぶ）

---

## 0. 調査方法と制約（最初に必ず読むこと）

| 項目 | 内容 |
|---|---|
| 調査日 | 2026-09-30 |
| 手段 | Web検索（出典URL付き抜粋を返すエンジン）。1件ごとに出典URLを控え、抜粋中の数値・記述だけを採用した |
| **制約** | この開発環境の外向き通信は組織ポリシーにより npm / GitHub 以外すべて遮断されていた（WebFetch・curl とも `EGRESS_BLOCKED` / `connect_rejected`）。そのため **論文本文・PDF・写真・動画を直接開けていない**。すべての値は「検索エンジンが出典から抜き出した文章」を経由している |
| 影響 | (1) 表・図の全体を確認できていないため、平均値±SD の多くは範囲値でしか得られていない。(2) **写真・動画を自分の目で解析できない**ため、歩行周期・首の動きの振幅などは、生体力学の一般則（スケーリング則）と文章記述から導出した推定値である。推定値には必ず「推定」と明記し、根拠の式を残した |
| 信頼度の付け方 | **A** = 査読論文/公的機関、値を抜粋で直接確認 / **B** = 信頼できる図鑑・機関サイト、または査読論文だが抜粋経由で文脈が一部不明 / **C** = 一般向けサイト・観察記録・近縁種からの外挿 / **D** = 資料が見つからず物理・スケーリング則から導出した推定 |
| 今後の作業 | 通信制限のない環境で、[S1][S10][S13][S15] の本文と、Macaulay Library 等の動画でのフレーム解析を行い、`KentishPloverConfig.js` の `evidence` 注記付きの値を更新すること |

---

## 1. 参考文献一覧

| ID | 資料名 | URL | 使用した情報 | 信頼度 |
|---|---|---|---|---|
| S1 | Küpper C. et al. 2009. *Kentish Versus Snowy Plover: Phenotypic and Genetic Analyses of Charadrius alexandrinus…* The Auk 126(4):839–852 | https://academic.oup.com/auk/article/126/4/839/5148486 | 跗蹠長 Kentish ≈29 mm / Snowy ≈25 mm。個体群別 跗蹠 24.78±0.89 〜 28.85 mm、翼長 106.55±3.47 〜 111.79±3.18 mm | A（抜粋経由） |
| S2 | 日本国内の標識・計測報告（検索抜粋では「日本野鳥研究所の報告書」と記載。候補: env.go.jp 報告書 PDF） | https://www.env.go.jp/chemi/report/h14-06/52-56.pdf ほか | 全長150–175 mm、自然翼長102–123 mm、尾長42–50 mm、跗蹠23–30 mm、嘴峰13–19 mm | B（抜粋の出典文書が一意に特定できない） |
| S3 | Wader Study Group Bulletin 62:17–23（アラビア半島での捕獲個体計測） / Almalki et al. 2017 補足資料 | https://sora.unm.edu/sites/default/files/journals/iwsgb/n062/p00017-p00023.pdf / https://bioone.org/journals/supplementalcontent/10.13157//arla.64.1.2017.ra1/supplementary_material_art_1_almalki_et_al.pdf | 翼長102–113 mm（平均108）、跗蹠26–30 mm、嘴14.5–17 mm、尾42–48 mm、雌雄の形態差なし（同集団） | B |
| S4 | Oiseaux.net Kentish Plover | https://oiseaux.net/birds/kentish.plover.html | 全長16 cm、体重41 g (37–49)、翼開長42–45 cm | C |
| S5 | 京都府レッドデータブック2015 / 石川県RDB シロチドリ | https://www.pref.kyoto.jp/kankyo/rdb/bio/db/bird0027.html / https://www.pref.ishikawa.lg.jp/sizen/reddata/rdb_2009/4_ato/kennsaku2/documents/2-28sirotidori.pdf | 全長17 cm、翼長11 cm、体重45 g。雄夏羽: 頭頂茶褐色、上面・雨覆灰褐色、前頭に黒帯、額から続く眉斑白、過眼線と胸側黒、喉〜体下面白。雌は頭頂・前頭・過眼線・胸側が砂褐色。雄冬羽は雌に似る。干潟・海岸・河川敷、ゴカイ類・甲殻類 | B |
| S6 | コトバンク（日本大百科全書/世界大百科）シロチドリ | https://kotobank.jp/word/%E3%81%97%E3%82%8D%E3%81%A1%E3%81%A9%E3%82%8A-3154890 | 雄夏羽: 白い額と赤褐色の頭頂の間に黒帯、黒い過眼線、白い眉斑、背は灰褐色、喉と頸は白。雌は前頭・頭頂・過眼線・頸の斑が背と同様の灰褐色。全長15–17 cm | B |
| S7 | Naturalis Biodiversity Center, BRIS / Birds of Europe: *Charadrius alexandrinus* | https://bris.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/nsr_taxon.php?id=112332 | 白い下面、比較的長い黒っぽい脚、明瞭な白い後頸の襟、胸帯は決して完全にならない。雄: 白い額と前頭の黒斑、頭頂残りと後頭は橙赤褐色、眼を通る細い黒線とその上の白線。雌は前頭黒斑・赤褐色頭頂を欠き、胸斑と過眼線は暗褐色。幼鳥: 脚暗色、明瞭な胸斑なし、上面灰褐色、額白。飛翔時に長い白い翼帯と、暗色の尾の白い外側 | B |
| S8 | Wikipedia “Kentish plover”（検索抜粋） | https://en.wikipedia.org/wiki/Kentish_plover | 雌雄とも白い下面・灰褐色の背・暗色の脚・暗色の嘴。雄は不完全な黒い胸帯・黒い過眼線・黒い前頭帯。非繁殖期は両性とも淡く、雄の赤褐色頭頂が消失 | C（二次資料、他資料と一致する範囲のみ採用） |
| S9 | dos Remedios N. et al. 2016? *Ontogenic differences in sexual size dimorphism across four plover populations* (PMC4957268) | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4957268/ | 成鳥の雄偏りの性的サイズ二型は約4%（主に跗蹠）。体重40–44 g | A（抜粋経由） |
| S10 | Argüelles-Ticó A. et al. 2016. *Geographic variation in breeding system and environment predicts melanin-based plumage ornamentation of male and female Kentish plovers.* Behav Ecol Sociobiol | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4701778/ | 雄は黒い不完全胸帯・黒い過眼線・黒い前頭帯、雌では同部位が淡褐色。黒斑の大きさは個体群・個体で変異する → 個体差パラメータ `melaninPatchScale` の根拠 | A（抜粋経由） |
| S11 | Lafferty K.D. 2001. *Disturbance to wintering western snowy plovers.* Biological Conservation 101:315–325 | https://copr.nrs.ucsb.edu/wp-content/uploads/2023/06/2001_Lafferty1.pdf | 越冬個体は約40 m で撹乱に反応（繁殖個体の報告値約80 m の半分）。犬・カラス・馬には飛んで逃げる確率が高く、人や他のシギチには歩いて離れることが多い | A（抜粋経由、北米の近縁種 Snowy Plover） |
| S12 | *Responses of Imperiled Snowy Plovers (Charadrius nivosus) to Anthropogenic and Natural Disturbance.* Waterbirds 44(4) 2021 | https://complete.bioone.org/journals/waterbirds/volume-44/issue-4/063.044.0412/ | 50 m 以内では歩行者に対する反応確率 >0.2。犬に対しては20 m 以内に入る前に必ず移動。歩行者・犬には捕食者や競合種より長い距離で反応 | A（抜粋経由、近縁種） |
| S13 | *Behavioural Plasticity in Foraging Mode of Typical Plovers.* Ardea 95(2) 2007 | https://bioone.org/journals/ardea/volume-95/issue-2/078.095.0208/ | チドリ類は静止と短い走行を交互に行い、走行の終わりにつつくか再び停止する。条件により sandpiper 型（連続歩行で探る）採餌も行う | A（抜粋経由） |
| S14 | Pienkowski M.W. (Durham thesis) *Aspects of the ecology and behaviour of ringed and grey plovers* / Condor 92 p245 | https://etheses.durham.ac.uk/id/eprint/7868 / https://sora.unm.edu/sites/default/files/journals/condor/v092n01/p0245-p0245.pdf | チドリは staccato な run–stop–search、シギ科は連続歩行。活動を running（停止と採餌/停止の間の急速移動）と waiting（停止して地表を走査）に分類 | A/B（抜粋経由） |
| S15 | Kuwae T. 2007? *Diurnal and nocturnal feeding rate in Kentish plovers on an intertidal flat as recorded by telescopic video systems.* Marine Biology（marineinfo.org 259486） | https://marineinfo.org/doc/publication/259486 | 日本の干潟での研究。多毛類・カニの密度が高い場所で採餌試行率と成功率が共に上昇。成功率は干出後の経過時間とともに増加（多毛類の活動増加による手がかりの増加）。夜間の干出時間は昼の1.7倍、夜間に3.7倍の餌を得うる。低風速で試行率上昇、高温で試行率↑成功率↓ | A（抜粋経由） |
| S16 | Sex-related seasonal differences in foraging strategy of the Kentish plover. Condor 111(4) 2009 / Univ. Sevilla idUS 11441/44313 | https://bioone.org/journals/The-Condor/volume-111/issue-4/cond.2009.080062/ / https://idus.us.es/handle/11441/44313 | 主餌はゴカイ *Nereis (Hediste) diversicolor*（消費生物量の80%以上、スペイン）。繁殖期は雌雄とも摂取速度を上げ昼間の採餌時間を短縮 | A（抜粋経由） |
| S17 | *Male but not female Kentish plovers modulate foraging behaviour according to tide during incubation.* J Ornithol 2023 | https://link.springer.com/article/10.1007/s10336-023-02067-7 | 潮汐に応じた採餌行動の調整（雄） | B（タイトルのみ） |
| S18 | *Foraging Behavior of Non-Breeding Semipalmated Plovers.* Waterbirds 33(1) | https://bioone.org/journals/Waterbirds/volume-33/issue-1/063.033.0107/ | 採餌率は約25 pecks/min で頭打ち（近縁種） | B（近縁種） |
| S19 | USGS “An overview of the world’s plovers” / The Canadian Encyclopedia “Plover” | https://pubs.usgs.gov/publication/70222188 / https://thecanadianencyclopedia.ca/en/article/plover | チドリは比例的に大きな眼、視覚による採餌が必須（obligate visual foragers）、全種が run–stop–peck | A/B |
| S20 | Univ. Birmingham 2008 Waders news（ヨーロッパムナグロの眼窩上骨 *Os supraorbitale aliforme*） | https://www.birmingham.ac.uk/news/latest/2008/10/7Oct-Waders.aspx | 大きな眼を支える骨構造、頭上に広い盲域 | B（近縁 Pluvialis） |
| S21 | Cantlay J.C., Portugal S.J., Martin G.R. — *Visual fields and foraging ecology of Blacksmith Lapwings* (Ibis) | https://sjportugal.com/wp-content/uploads/2019/04/cantlay-portugal-and-martin.pdf | 視覚誘導でピンポイントに啄む鳥の特徴: 狭く縦に短い両眼視野、嘴先端は両眼視野の中心付近。足ふるわせ（foot-trembling）は視覚誘導ではなく隠れた餌を追い出し両眼視野に入れるための行動 | A（抜粋経由、近縁チドリ科） |
| S22 | “Foot-trembling feeding method of the Little Ringed Plover” (Bird Ecology Study Group) / Biota Neotropica | https://besgroup.org/2015/11/24/foot-trembling-feeding-method-of-the-little-ringed-plover/ / https://www.scielo.br/j/bn/a/tSyGHW9CMqVFdx9jf3JwbQC/ | 片脚ずつ素早く震わせる。foot-tapping（地面を叩く）と leg-shaking（触れない）に細分 | B/C |
| S23 | Earls K.D. 2000. *Kinematics and mechanics of ground take-off in the starling and quail.* J Exp Biol 203 | https://cob.silverchair.com/jeb/article-pdf/207/8/1345/1251467/1345.pdf（引用元）| 地上離陸は脚主導。離陸時の垂直速度の88–91%を脚が生む | A（抜粋経由、他種） |
| S24 | Gatesy S.M. & Biewener A.A. 1991. *Bipedal locomotion: effects of speed, size and limb posture in birds and humans.* J Zool | https://biewenerlab.oeb.harvard.edu/ | 鳥のデューティ比は歩行でヒトと同程度かやや小、走行ではヒトより大きい。大腿骨はほぼ水平 | A（抜粋経由） |
| S25 | Pennycuick C.J. 1990 *Predicting wingbeat frequency and wavelength of birds.* J Exp Biol 150:171 / 2001 | https://cob.silverchair.com/jeb/article/150/1/171/5695/ | f = 1.08·m^(1/3)·g^(1/2)·b^(-1)·S^(-1/4)·ρ^(-1/3) | A（式のみ） |
| S26 | BirdGuides “Focus on Kentish Plover” / thaibirding “lost plover” | https://www.birdguides.com/articles/species-profiles/focus-on-kentish-plover/ / https://thaibirding.com/ornithology/lostplover.htm | 分類: *Anarhynchus*。*nihonensis* は東アジア（日本・朝鮮半島・中国東部・台湾）で繁殖し、嘴がやや大きい。*dealbatus*（White-faced Plover）は嘴が大きく脚が淡いピンク灰色 | B |
| S27 | Madeira Birds / Naturalis (flight) | https://www.madeirabirds.com/node/103 | 飛翔時の翼は尖り後退角、速く軽快な飛翔、滑空して着地。長い白い翼帯、暗色の尾の外側が白 | C/B |
| S28 | Birds of Saudi Arabia “Kentish Plover feigning injury” / The Scientist 2022 | https://www.birdsofsaudiarabia.com/2015/06/kentish-plover-feigning-injury-sabkhat.html | 擬傷（broken-wing display）。巣やヒナから捕食者を引き離す。繁殖期のみ | B/C |
| S29 | Springer BF01647512（チドリ類の換羽） | https://link.springer.com/article/10.1007/BF01647512 | シロチドリは淡色で露出した生息地のため繁殖羽の摩耗が激しく、繁殖後換羽の前に特別な「夏の換羽」を行う。1年目に冬羽と第1回夏羽を獲得 | B |
| S30 | Ringed Plover territory, British Birds / Auk 101:197 (winter plover aggression) | https://britishbirds.co.uk/journal/article/territory-ringed-plover / https://sora.unm.edu/sites/default/files/journals/auk/v101n01/p0197-p0199.pdf | 渡り・越冬期のチドリの攻撃行動は主に採餌個体間で起こる。高密度で個体距離を回避だけで保てないとき追い払いが起こる。越冬チドリの採餌群は散開 | A/B（近縁種） |
| S31 | biostor 140949（シギチの塒）/ Lincs Bird Club 2023 | https://archive.org/download/biostor-140949/biostor-140949.pdf / https://www.lincsbirdclub.co.uk/site/index.php/information/lbc-articlebloglist/725-gibpointkentishplover | 満潮時に塒を形成、満潮後2–3時間で採餌場へ。シロチドリが片脚で休息・睡眠を試みる観察。泥干潟の縁を短い突進で走り回る | B/C |
| S32 | Necker R. “Head-bobbing of walking birds – a review” | https://reinhold-necker.de/seite10.html | 頭部振り（head-bobbing）は hold 相と thrust 相を持つ。種により有無が異なる | B |
| S33 | Notornis 23(4):302–309 / Colby “Comfort behaviour in birds” | https://www.birdsnz.org.nz/wp-content/uploads/2011/03/Notornis_23_4_302-309.pdf | 快適行動: 身震い、伸び、羽繕い。**間接的頭掻き**（脚を下げた翼の上から回す）。両翼伸ばし（手首で軽く曲げた両翼を背上に数秒上げる）。シギチの水浴び | B |
| S34 | BirdLife Australia BARC（Semipalmated/Ringed Plover の趾間膜） | https://archive.birdlife.org.au/documents/barc/SUB1166.pdf | Ringed Plover は外趾–中趾間のみ小さな蹼、Semipalmated は3趾間。**シロチドリ固有の記述は得られず** | B（近縁種のみ） |
| S35 | Cornell Lab All About Birds / Birds of the World: Snowy Plover | https://www.allaboutbirds.org/guide/Snowy_Plover/id | 近縁 Snowy Plover: 15–17 cm, 34–58 g、嘴黒、脚灰〜黒灰。基本羽では雌雄同色 | A/B（近縁種） |
| S36 | Earls/Heers “transition from leg to wing forces during take off” | https://umimpact.umt.edu/en/publications/transition-from-leg-to-wing-forces-during-take-off-in-birds/ | 脚→翼への力の移行 | B |
| S37 | Stankowich & Blumstein 2005 / Piping Plover FID (Avian Cons. Ecol. 11(1):5) | https://www.ace-eco.org/vol11/iss1/art5/ | FID は接近速度・直進性・群れサイズ・過去の撹乱に依存、保護区の緩衝距離設計に使われる | B（抜粋で一般論のみ） |

---

## 2. 形態（Morphology）

### 2.1 計測値の比較と採用値

| 項目 | S1 | S2（日本） | S3（アラビア） | S4/S5/その他 | **採用値** | 採用理由 |
|---|---|---|---|---|---|---|
| 全長 | – | 150–175 mm | – | 15–17 cm [S4,S6]、17 cm [S5] | **160 mm** | 複数資料の中央。17 cm は日本図鑑の丸め値と判断 |
| 翼長（自然翼長） | 106.6–111.8 mm（集団平均） | 102–123 mm | 102–113（平均108） | 11 cm [S5] | **108 mm** | S1・S3 の平均域の中央。S2 の上限123 は外れ値的範囲の端と判断 |
| 翼開長 | – | – | – | 42–45 cm [S4] | **430 mm** | 範囲中央 |
| 体重 | – | – | – | 41 g (37–49) [S4], 40–44 g [S9], 45 g [S5] | **42 g** | 査読論文 S9 の範囲中央 |
| 尾長 | – | 42–50 mm | 42–48 | – | **45 mm** | 両資料の重なりの中央 |
| 跗蹠長 | ≈29 mm（Kentish） | 23–30 mm | 26–30 | – | **28 mm** | S1 の Kentish 値（28.4–28.9）と S3 の中央 |
| 嘴峰長 | – | 13–19 mm | 14.5–17 | – | **16 mm** | nihonensis は嘴がやや大きい [S26] ため中央よりやや長め |
| 性差 | 約4% 雄が大（主に跗蹠）[S9] | – | 差なし [S3] | – | 雄 = 1.00、雌 = 0.97（跗蹠・体スケール） | 査読論文 S9 を採用。S3 との矛盾は集団差として記録 |

### 2.2 計測値が得られなかった部位（推定・信頼度D）

以下は資料に計測値が見つからなかったため、上記の採用値から比例で導いた。**写真との照合もできていない**（§0参照）。`morphology.md` に導出を記す。

| 項目 | 推定値 | 導出 |
|---|---|---|
| 嘴の基部高さ／幅 | 4.3 mm / 4.0 mm | 嘴峰16 mm に対し Charadrius の細い嘴（長さ/高さ ≈ 3.5–4） |
| 嘴先端の膨らみ（dertrum） | 先端 1/3 で高さが中央部より約15%増 | チドリ属の一般形態（嘴中央がくびれ先端が膨らむ）。資料未取得 |
| 眼（瞼裂の直径） | 5.4 mm | 「比例的に大きな眼」[S19][S20]。嘴峰の約1/3と仮定 |
| 頭部（後頭〜嘴基部） | 25 mm、頭幅 17 mm | 全長160 − 嘴16 − 尾45 − 胴 の残差と、頭が大きく丸いシルエット |
| 脛足根の露出（羽毛のない部分） | 11 mm | 跗蹠28 mm の約40% |
| 中趾（爪含む） | 19 mm、内趾 13 mm、外趾 15 mm | 跗蹠長比 ≈0.68（小型チドリ類の一般比） |
| 後趾（hallux） | なし | チドリ属の一般的特徴（本セッションで直接の出典は取得できず。信頼度B–C） |
| 趾間膜 | 実装しない | シロチドリ固有の記述なし [S34]。Ringed Plover の「外趾–中趾間の小さな蹼」を流用しない |
| 羽毛による輪郭の膨らみ | 胴体：骨格＋筋肉の外形から 3–6 mm、頭部 1–2 mm、胸・脇 5–7 mm | 小型鳥類の一般的な羽毛層厚。資料未取得（D） |

### 2.3 シルエットの要点（文章資料からの要約）

- 小型で丸い胴体、大きく丸い頭、短い嘴、比較的長い黒っぽい脚 [S7]
- 立位では体軸がほぼ水平〜わずかに前上がり、首は羽毛に埋もれて短く見える（警戒時に伸びる）
- 翼を畳むと初列風切の先端は尾端付近に届く（推定、写真未確認）

---

## 3. 羽色（Plumage）

### 3.1 部位別（文章資料の統合）

| 部位 | 雄 夏羽 | 雌 夏羽 | 冬羽（雌雄） | 幼鳥 | 出典 |
|---|---|---|---|---|---|
| 額 | 白 | 白（やや褐色味） | 白 | 白 | S5,S6,S7 |
| 前頭（額の後ろ） | **黒い横帯** | なし（褐色） | なし | なし | S5,S6,S7 |
| 頭頂・後頭 | **橙赤褐色** | 砂灰褐色 | 灰褐色 | 灰褐色 | S6,S7,S8 |
| 眉斑 | 白（額から続く） | 白っぽい | 白っぽい | 淡色 | S5,S7 |
| 過眼線（眼先〜耳羽） | **黒**（細い線、耳羽で太くなる） | 暗褐色 | 褐色 | 淡褐色 | S5,S7,S10 |
| 耳羽 | 黒 | 暗褐色 | 褐色 | 灰褐色 | S7 |
| 後頸 | 白い襟（明瞭） | 白い襟 | 白い襟 | 白い襟 | S7 |
| 背・肩羽・雨覆 | 灰褐色（砂色） | 灰褐色 | 灰褐色 | 灰褐色、淡色羽縁 | S5,S7,S29(幼鳥羽縁は観察記録) |
| 風切 | 暗色、白い翼帯 | 同 | 同 | 同 | S7,S27 |
| 腰・尾 | 中央暗色、**外側白** | 同 | 同 | 同 | S7,S27 |
| 喉・胸中央・腹・下尾筒 | 白 | 白 | 白 | 白 | S5,S7 |
| 胸側斑 | **黒、不完全（中央で繋がらない）** | 暗褐色 | 褐色 | ほぼなし | S5,S7,S10 |
| 嘴 | 黒 | 黒 | 黒 | 黒 | S8,S35 |
| 脚 | 黒〜暗灰色 | 同 | 同 | 暗色 | S7,S8,S35（*dealbatus* は淡いピンク灰 [S26]） |
| 虹彩 | 暗褐色（本種の直接記述は取得できず） | 同 | 同 | 同 | 近縁チドリ類の記載からの推定（C） |
| 眼瞼輪 | 目立つ色の輪なし（黄色いアイリングを持つコチドリとの識別点として広く知られる。本セッションで出典未取得） | | | | C |

### 3.2 RGB値について

写真のピクセル値を直接取ることは要件で禁止されており、かつ本環境では写真自体を取得できなかった。したがって **色値は文章記述（「灰褐色」「砂色」「橙赤褐色」「白」）をもとに、屋外昼光下の鳥類羽毛の典型的な反射率範囲に合わせて設定した推定値（信頼度C–D）**である。色は linear-sRGB ではなく sRGB で `KentishPloverConfig.js > plumage.palettes` に集約し、照明条件の異なる実写真との比較で後から調整できる構造にした。白い羽は純白 (1,1,1) を避け、約0.86–0.90（羽毛の拡散反射率の上限）に抑える。

### 3.3 最初に実装する個体タイプ

**成鳥 雄 夏羽（東アジア個体群 *nihonensis*）** を基準個体とする。

理由:
1. 識別上もっとも特徴が多い（黒い前頭帯・橙赤褐色の頭頂・黒い過眼線・不完全な黒い胸側斑・白い後頸襟）。鳥に詳しい人が「シロチドリだ」と判断する手がかりが最大。
2. ゲームの舞台が日本の干潟であり、日本で繁殖する *nihonensis* が妥当。
3. 雌・冬羽は「黒斑を褐色に置き換え、頭頂の赤褐色を消す」差分として同じ UV レイアウト上で生成できる（パレット切替で実装済み）。

デモでは雄夏羽と雌夏羽を混在させる（繁殖期4–7月 [S5] の干潟を想定）。

---

## 4. 骨格（Skeleton）

- 鳥の脚は「大腿骨（体内、ほぼ水平 [S24]）→ 膝（羽毛内に隠れる）→ 脛足根（上部は羽毛、下部が裸出）→ 足根間関節（外見上“逆向きの膝”に見える踵）→ 跗蹠（足根中足骨）→ 趾」。人型リグの流用は不可。
- 首は多数の頸椎による S 字構造で、羽毛に隠れて短く見える。休息時は頭を肩に沈め、警戒時に伸ばす。
- 翼: 上腕骨 → 尺骨/橈骨（前腕、次列風切が付く）→ 手根中手骨（手首〜手、初列風切10枚が付く）。小翼羽は第2指。
- 初列風切10枚は Charadriiformes 一般（検索抜粋で10枚の初列を持つシギの換羽記載を確認 [S29 周辺]、信頼度B）。次列は小型チドリで約11–12枚（推定C）。尾羽12枚（一般、C）。

---

## 5. 行動（Behavior）

### 5.1 採餌: run–stop–peck
- チドリは視覚採餌者で、静止（走査）と短い走行を交互に行い、走行の終点で啄むか再び停止する [S13][S14][S19]。
- シギ科は連続歩行、チドリは staccato [S14]。→ **一定速度で歩きつつ一定周期で啄む実装は誤り**。
- 静止中に餌の手がかり（多毛類の動き、カニの移動）を検出してから走る。手がかりの量は干出後の経過時間とともに増える [S15]。
- 条件によっては sandpiper 型の連続採餌も行う [S13] → 高密度・湿った泥では短い歩行探索モードを許す。
- 足ふるわせ（foot-trembling）: 片脚を素早く震わせて隠れた餌を動かし、両眼視野に入れる [S21][S22]。
- 主餌: 多毛類（ゴカイ）、カニ、端脚類、昆虫 [S5][S15][S16]。
- 啄み頻度の上限の目安: 近縁種で約25 pecks/min [S18]。

### 5.2 警戒・逃避
- 越冬個体は約40 m、繁殖個体は約80 m で撹乱に反応 [S11]。歩行者に対して50 m 以内で反応確率 >0.2 [S12]。
- 人には歩いて離れることが多く、犬・カラス・馬には飛ぶことが多い [S11]。
- FID は接近速度・直進性・過去の撹乱で変化 [S37]。
→ 段階的反応（警戒→歩いて離れる→走る→飛ぶ）と、脅威種別による係数を設定ファイルに持たせる。

### 5.3 社会行動
- 越冬期は群れで生活し忙しく動き回る [S5]。ただし採餌群は散開し、個体距離は主に回避で維持、密度が高いと追い払いが起こる [S30]。→ Boids 的な同期移動ではなく「個体距離＋まれな追い払い」。
- 満潮時は塒で密集し、満潮後2–3時間で採餌場へ移る [S31]。
- 驚いた個体が飛ぶと周囲も飛ぶ（群れの伝播、一般的なシギチの性質。S31 等から間接的）。

### 5.4 休息・快適行動
- 片脚立ちでの休息・睡眠がシロチドリで観察されている [S31]。嘴を肩羽に差し込む姿勢はシギチ一般で知られるが、本種の直接記述は取得できず（C）。
- 羽繕い、身震い、両翼伸ばし、翼と脚の片側伸ばし、**間接的頭掻き（脚を下げた翼の上から回す）** [S33]。

### 5.5 飛翔・離着陸
- 翼は尖って後退角、速く軽快、着地前に滑空 [S27]。
- 地上離陸は脚主導で、垂直速度の約9割を脚が生む（他種の実験）[S23]。
- 羽ばたき周波数（本種の実測は取得できず）: Pennycuick の式 [S25] に m=0.042 kg, b=0.43 m, S≈0.0195 m²（アスペクト比9.5と仮定）, ρ=1.225 を入れると **f ≈ 6.8 Hz**。小型シギチの実測はこれより高い傾向がある可能性があり（未確認）、巡航 7.5 Hz、離陸 9 Hz を初期値とし設定で調整可能にした（D）。

### 5.6 歩行・走行（推定、D）
写真・動画を解析できないため、脚長（股関節高 h ≈ 45 mm）からフルード数スケーリングで決定:
- 歩行: Fr = v²/(gh) ≈ 0.14 → v ≈ 0.25 m/s、ストライド周波数 ≈ 2.8 Hz、ストライド長 ≈ 2h
- 走行: Fr ≈ 3.8 → v ≈ 1.3 m/s、ストライド周波数 ≈ 7 Hz、ストライド長 ≈ 4h、デューティ比 ≈ 0.45（鳥は走行でもヒトより高いデューティ比 [S24]）
- 頭部: チドリの走行は「滑るように」見え、明瞭な head-bobbing をする鳥とは異なる（一般的観察、S32 のレビューでは種差がある）。→ 頭部を空間に対して安定化させる制御を実装し、ボブは行わない。

---

## 6. 潮位・地形への反応
- 採餌場は干出直後の湿った泥・砂の縁。干出後時間とともに多毛類の手がかりが増える [S15]。
- 満潮時は乾いた砂浜・高い砂州の塒 [S31]。
- 低風速で採餌試行率が高い [S15]（風は将来の拡張パラメータとして予約）。

---

## 7. 研究結果から実装へ（Evidence → Specification → Implementation 対応表）

| Evidence | Specification | Implementation |
|---|---|---|
| S1,S2,S3 計測値 | `morphology.md` §1 | `KentishPloverConfig.morphology` |
| S5,S6,S7,S10 羽色 | `morphology.md` §4 | `KentishPloverConfig.plumage`, `KentishPloverMaterials.js` |
| S13,S14,S15,S19,S21 run–stop–peck | `behavior.md` §2 | `KentishPloverAI.js` FORAGE_SEARCH/SCAN/RUN/PECK |
| S11,S12,S37 FID | `behavior.md` §3 | `KentishPloverConfig.disturbance` |
| S30,S31 社会・塒 | `behavior.md` §4 | `SocialField` in `KentishPloverAI.js` |
| S23,S25,S27 飛翔 | `animation_reference.md` §10–12 | `KentishPloverAnimator.js` flight layer |
| S24 + スケーリング | `animation_reference.md` §2–3 | gait planner + foot IK |
| S31,S33 休息・快適行動 | `animation_reference.md` §7–8 | preen variants, rest variants |
