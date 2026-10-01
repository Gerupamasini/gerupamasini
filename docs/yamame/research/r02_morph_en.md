# Oncorhynchus masou の形態・計測値・アロメトリー（英語資料中心の文献調査）

> 作成: ストリームR02（英語資料担当）。対象: ヤマメ（O. masou masou 河川型）の3Dモデル仕様の根拠収集。
>
> **この文書を使う前に必ず読むこと（調査の限界）**
> 1. WebFetch / Bash は遮断されており、論文・図鑑の本文は一度も開けていない。すべての「証拠」は **WebSearch 応答に書かれた要約文**（タイトル・URL・要約）に限られる。
> 2. WebSearch の要約文は検索ツールが生成したもので、個々の数値がどのURLに由来するかが明記されない場合がある。その場合は「出典（候補）」として結果セット内のURLを並記し、「帰属未確定」と書いた。ランクはその不確かさを織り込んで保守的に付けた。
> 3. セッションのWebSearch上限（200回、他ストリームと共有）に達したため、**57回の検索で打ち切り**になった（以降3回は実行拒否）。予定していたFishBase形態ページ、FAO同定シート、サケ科の鰭長・眼径の相対値などの追加検索は未実施。
> 4. **ヤマメ（河川型 O. m. masou）自身の「%SL」実測値（眼径・吻長・上顎長・尾柄高・各鰭長）は一つも取得できていない。** 取得できたのは、(a) タイワンマス亜種の比、(b) ブラウントラウトの比、(c) 計数形質の範囲、(d) 成長に伴う形態変化の定性的記述、のみ。仕様書に数値を入れる場合は PROXY と明記すること。
> 5. 「派生」と書いた数値は、資料の比を私が換算したもの。資料に書かれた値ではない。

---

## 1. 要約（仕様に直結する結論）

1. ヤマメ自身の頭長・体高・眼径・吻長の%SL実測値は本調査では未取得。使える最も近い数値は **タイワンマス（O. m. formosanus）成魚の比**で、体長/頭長=4.20、体長/体高=3.48、頭長/吻長=4.41、頭長/眼径=3.43、頭長/眼間隔=4.12。派生で頭長≒23.8%、体高≒28.7%、吻長≒5.4%、眼径≒6.9%（いずれも「体長」をSLと仮定した換算）。PROXY:formosanus。[F-01]
2. タイワンマスは日本産亜種より**体高が高く**、脊椎骨・臀鰭条・胸鰭条が少ないと報告されている。したがって上の体高28.7%は日本のヤマメには深すぎる側の値と見るべきで、設計の上限側の参照値にとどめる（この推論は私の解釈）。[F-02]
3. ブラウントラウト（PROXY:Salmo trutta、N=138、平均SL 160.6 mm）の表から、**背鰭起点の体高=23.9%SL、臀鰭起点の体高=17.8%SL、背鰭前長=47.6%SL、腹鰭前長=55.2%SL、臀鰭前長=76.4%SL**。鰭の取り付け位置のPROXYとして使える。[F-18]
4. 韓国の研究では、雄の頭長/尾叉長はシロザケ24.7%が最大、ニジマス21.6%が最小で、ヤマメはその間にあると読める（ヤマメの値自体は要約に無い）。頭長を21〜25%FLに収める根拠にできるが、ヤマメ固有の値ではない。[F-04]
5. 韓国の研究では体高・尾柄高・背鰭長・臀鰭長（対SL）、吻長・眼径・上顎長・頬長（対頭長）で種間差があり、**眼径/頭長が新しい分類形質**とされた。ヤマメ固有の数値は未入手で、原典（Korean J. Ichthyol. 5(1):96-112, 1993）の表が最優先の取得対象。[F-04]
6. 計数形質の範囲（二次資料・帰属未確定）: 背鰭13-18（別資料12-17）、臀鰭14-18（別資料11-14、日本語資料12-17）、胸鰭14-17、腹鰭9-12（Christie 1970は「大半が10」）、鰓耙16-22（Christie 1970は「大半が18-19」）、幽門垂35-68（平均47.05）または35-76、鰓条骨11-15、側線鱗120-140。**臀鰭条数などは資料間で大きく食い違う**ので、個体差の乱数分布を作る際に一点値を使わないこと。[F-05, F-06, F-07]
7. 計数形質は集団間で有意に異なる（北海道日本海側7河川の1990年標本で、脊椎骨・下鰓耙・背鰭条・胸鰭条・臀鰭条は有意差、腹鰭条と上鰓耙は有意差なし）。脊椎骨数（腹椎・尾椎）には遺伝成分がある。個体差生成では集団内分布を持たせ、地域差を別軸にするのが妥当。[F-08, F-09]
8. 亜種間（マス・アマゴ・ビワマス）は形態・計数形質が非常によく似ており、決め手は**赤色斑の有無、鱗の形態、幽門垂数、側線上方の横列鱗数**。アマゴ・サツキマスは赤色斑あり、ヤマメは黒点のみ。[F-10]
9. 神奈川県（太平洋側のヤマメ南限）にはヤマメとアマゴの中間的形質を持つ個体群がいる。赤色点の有無を連続変異として扱う根拠になる。[F-11]
10. パーマークは**成長で消える**。大型の河川残留ヤマメ（2年以上で約300 mm）はパーマークを失うと報告され、栃木県の判別基準では全長30 cm以下の個体はヤマメ（パーマークまたは腹部青斑点あり）、31 cm以上でどちらも見えなければサクラマスとされる。モデルの年齢・サイズ段階にパーマークの濃淡変化を入れる根拠。[F-12, F-13]
11. パーマークの個数は資料により6-9個、7-10個と食い違う（タイワンマスは9個の楕円斑＋側線上に11-13個の小黒点）。個数の分布を作る際は両レンジを併記して扱う。[F-14, F-03]
12. サイズは河川型で全長20〜30 cmが普通、30 cm前後〜40 cmが上限側という日本語資料の記述がある。英語資料の「平均50-58 cm、最大79 cm TL・10 kg」は降海型を含む種全体の値で、河川型の仕様には使えない。[F-13, F-15]
13. 成魚の尾鰭は**浅い二叉**（タイワンマス成魚の記述、PROXY）。背鰭と脂鰭ははっきり離れる。[F-03]
14. 肥満度（K=体重×1000/尾叉長³）はパー（parr）で14.09/14.18、スモルトで12.19/12.06（早熟雄由来の同群）、0歳由来スモルトで11.30/11.49。スモルト化で体が約13-15%細くなる（Kの比）。幼魚→降海前の体型変化の目安。[F-16]
15. 成長に伴う変化の一般則（PROXY）: ニジマス幼魚は大きくなるほど頭部の割合が小さくなり胴中央は等成長。ブラウントラウト幼魚は細長い体型から体高の高い体型へ変わる。成長ホルモン遺伝子導入ギンザケでは同体サイズの対照より眼径が約30%小さかった（相対眼径は成長速度にも依存しうる）。[F-19, F-20, F-22]
16. 飼育（ハッチェリー）由来のブラウントラウトは野生より頭が短く流線形が弱いという報告がある。放流由来の個体差を作るときに使える（PROXY）。[F-23]
17. サケ科の繁殖期形態変化（吻の伸長、鉤状の顎、背部の隆起、鰭の伸長、皮膚の肥厚、婚姻色）は一回繁殖型（semelparous）のサケ属で顕著で、背鰭の高さと基底長は雄で大きい種が多い。**ヤマメ固有の雌雄差データは未入手**。[F-25]
18. 幾何学的形態測定（GM）については、サケ科（ブラウントラウト、ギンザケ、イワナ類）の方法論的論文の存在は確認できたが、**ヤマメ/サクラマスのGM研究と変形の極値は見つからなかった**。[F-26]

---

## 2. Findings

### F-01
- 主張/値: タイワンマス成魚の比。体長/頭長=4.20、体長/体高=3.48、頭長/吻長=4.41、頭長/眼径=3.43、頭長/眼間隔=4.12。
  - 派生（私の算術。「体長」=SL と仮定。TLなら小さくなる）: 頭長≒23.8%、体高≒28.7%、吻長≒22.7%頭長≒5.4%、眼径≒29.2%頭長≒6.9%、眼間隔≒24.3%頭長≒5.8%。
  - 「体長」がSL・FL・TLのどれかは要約に書かれていない。
- 適用範囲: PROXY:O. m. formosanus（タイワンマス、台湾）、成魚。ヤマメ（O. m. masou）ではない。
- 出典（候補、帰属未確定）: en.wikipedia「Oncorhynchus masou formosanus」。一次資料は Jan R.Q., Jaung L.C., Lin Y.S., Chang K.H. (1990) "A morphometric and meristic study of the landlocked salmon in Taiwan, in comparison with other members of the genus Oncorhynchus (Salmonidae)", Bull. Inst. Zool. Acad. Sin. 29(Suppl.):41-59 と推定されるが未確認。
  - https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus
  - https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf
- 証拠: [B] "The ratio of body length to head length in adults is typically 4.20, body length to body height ratio is 3.48, head length to snout length ratio is 4.41, head length to eye diameter ratio is 3.43"（検索要約）。

### F-02
- 主張/値: タイワンマスは日本産亜種より脊椎骨・臀鰭条・胸鰭条が少なく、体高が高い。背鰭条と胸鰭条は研究間で変異が大きく、他の計数値は研究間で比較的一貫。
  - 1990年の研究はChichiawan Streamの52個体を使用し、Oncorhynchus属7種の25の計数・計測形質を比較。計数・計測だけでは系統は解明できないと結論。
  - 分子マーカーと形態の併用が4亜種の識別に有望（Hsu 2010）。
- 適用範囲: PROXY:formosanus 対 日本産亜種。成魚。
- 出典: 上記 zoolstud PDF（Jan et al. 1990、本文未読）、scholars.ntou.edu.tw のプロジェクト記録、Hsu et al. 2010 Aquaculture Research。
  - https://scholars.ntou.edu.tw/cris/project/pj03139
  - https://onlinelibrary.wiley.com/doi/10.1111/j.1365-2109.2010.02533.x
  - https://link.springer.com/article/10.1007/s10228-019-00688-8（"Formosa landlocked salmon is not a subspecies of cherry salmon complex – evidence from meristic characters" という趣旨の要約が出ている。結論は上記と異なる立場で、帰属未確定）
- 証拠: [B] "can be separated from the Japanese subspecies by having fewer vertebrae, anal fin rays, pectoral fin rays, and higher body depth"（帰属未確定）。"Except for the more variable dorsal and pectoral rays, meristic values were relatively consistent"（A相当だが同じく要約）。

### F-03
- 主張/値: タイワンマスの記述。成魚約30 cm、幼魚平均約15 cm。体側に9個の楕円形暗色斑（パーマーク）と、側線上方に11-13個の小黒点。尾鰭は成魚で浅い二叉・等尾型。背鰭の前後（脂鰭）は明確に離れる。頭頂は緑、眼と鰓蓋周辺は銀色。鰭は銀緑色。40 cmを超えることは稀で4年以上生きることは稀。
  - FishBase（O. formosanus）の最大長は57.0 cm TL と要約に出た。上の「稀に40 cm超」と食い違う（§3）。
- 適用範囲: PROXY:formosanus。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus 、https://www.fishbase.se/summary/16686 、https://fishbase.org/summary/16686 、https://lifeoftaiwan.com/nature/the-formosan-landlocked-salmon-taiwans-unique-natural-wonders-part-1/
- 証拠: [B] "nine elliptical dark spots and 11-13 smaller black spots on each side of the body"; "The caudal fin displays a shallow fork and is homocercal in adults"。

### F-04
- 主張/値: 韓国の Oncorhynchus 属調査（1989-1990年、シロザケ・ヤマメ[masu salmon]・ニジマス）。
  - 雌の13形質、雄の11形質（体型、幽門垂数、鰓耙数）で種間に有意差。
  - 体高、尾柄高、背鰭長、臀鰭長（対SL）、吻長、眼径、上顎長、頬長（対頭長）で種間差。
  - 雄の頭長/尾叉長は、シロザケ24.7%が最大、ニジマス21.6%が最小。雌は種間差なし。
  - 脊椎骨数・鰓耙数・幽門垂数・側線鱗数が分類形質として有用。眼径/頭長が新しい分類基準。
  - **ヤマメ（masu）個別の数値は要約に無い。**
- 適用範囲: 韓国産。種はO. keta、O. masou、O. mykiss。性別別。サイズ範囲は要約に無い。
- 出典: Korean Journal of Ichthyology 5(1):96-112 (1993) "Morphological study of Oncorhynchus spp. (Pisces: Salmonidae) in Korea - IV. Comparison of morphological characters of chum salmon, masu salmon and rainbow trout"。
  - https://koreascience.kr/article/JAKO199327236818661.page
  - https://www.koreascience.or.kr/article/JAKO199327236818661.page
  - https://koreascience.or.kr/article/JAKO199327236818661.pub
- 証拠: [A] "In the ratio of head length to fork length of the male, chum salmon showed the highest value (24.7%) and rainbow trout the lowest (21.6%), with no difference found in the female."

### F-05
- 主張/値: Christie (1970) のまとめによる O. masou の特徴。細かい黒点、**太い尾柄**、腹鰭条数が少ない（大半が10）、幽門垂が少なく短い（35-68、平均47.05）、鰓耙が少ない（16-22、大半が18-19）。
- 適用範囲: 日本産サケ科（サクラマス/アマゴ）を北米向けに概説した報告。サイズ・サンプル数は要約に無い。ヤマメ（河川型）に限定した値ではない。
- 出典: W.J. Christie (1970) "A Review of the Japanese Salmons Oncorhynchus masou and O. rhodurus with Particular Reference to Their Potential for Introduction into Ontario Waters", Research Information Paper (Fisheries) No. 37, Ontario。
  - https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf
- 証拠: [A] "fewer ventral fin rays (mostly 10), shorter and less numerous pyloric caeca (35-68, mean 47.05), and a small number of gill rakers (16-22, mostly 18-19)"（検索要約。表そのものは未確認）。

### F-06
- 主張/値: 英語の二次資料（FishBase系、Wikipedia系、Grokipedia等）の計数値。
  - 背鰭軟条13-18、臀鰭軟条14-18。別資料は背鰭12-17、臀鰭11-14。
  - 鰓条骨11-15。"gill rays very short, 18-22"（鰓耙の意味と思われるが用語が混在）。
  - 幽門垂35-76（別資料35-68）。腹鰭9-11本。
  - 側線鱗120-140、"transverse scale counts 43-56"（横列鱗の数え方が不明）。
  - 派生（私の算術、要検証）: 側線鱗120-140枚が体長の約76%（1−頭長23.8%）に並ぶとすると1枚あたり約0.54-0.63%SL。
- 適用範囲: O. masou（亜種混在、河川型/降海型の区別なし）。
- 出典（候補、帰属未確定。Grokipediaは生成AIによる百科でランクを下げた）:
  - https://grokipedia.com/page/Oncorhynchus_masou
  - https://allfishes.org/fishes/marine/masu-salmon
  - https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/
  - https://www.fishbase.se/summary/Oncorhynchus-masou.html
  - https://www.ncbi.nlm.nih.gov/datasets/taxonomy/8020/
  - https://www.inaturalist.org/taxa/187787-Oncorhynchus-masou-masou
- 証拠: [C] "The dorsal fin has 13-18 soft rays, the anal fin has 14-18 soft rays, though another source indicates a dorsal fin with 12-17 rays, an anal fin with 11-14 rays."

### F-07
- 主張/値: 日本語の二次資料の計数値。
  - サクラマス: 背鰭13-18、胸鰭14-17、腹鰭10-12、臀鰭12-17。
  - 単一値の記載: 脊椎骨63、側線鱗134、鰓耙16、幽門垂43（個体か、特定資料の代表値か不明。n・範囲なし）。
  - 別の結果群に「側線鱗27-32」「幽門垂40-54」という記載がある（側線鱗27-32は横列鱗など別の数え方と思われ、F-06の120-140とは定義が違う可能性が高い。使わないこと）。
- 適用範囲: サクラマス/ヤマメ（亜種 masou）。河川型/降海型の区別は資料に依存。
- 出典（候補、帰属未確定）:
  - https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
  - https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf
  - https://www.zukan-bouz.com/syu/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9
  - https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9
  - https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 証拠: [C] "背鰭は13-18本、胸鰭は14-17本、腹鰭は10-12本、臀鰭は12-17本"（検索要約。出典URLの特定はできていない）。

### F-08
- 主張/値: 北海道日本海側7河川のサクラマス集団（1990年5-6月採集、1歳魚が93%）で、脊椎骨、上鰓耙、下鰓耙、背鰭条、胸鰭条、腹鰭条、臀鰭条の7形質を計数。脊椎骨・下鰓耙・背鰭条・胸鰭条・臀鰭条の5形質で集団間に有意差（ANOVA）。腹鰭条と上鰓耙は有意差なし。マハラノビス距離で3群に分かれ、Kokamotsu川は孤立。
- 適用範囲: O. masou（1歳魚＝河川残留/スモルト前を含む）。北海道日本海側のみ。平均値・SDは要約に無い。
- 出典: Mano S., Kanno Y., Kinoshita T., Maeda T., Kyushin K. (1991) "Ecological characteristics and variations in numerical characters of masu salmon, Oncorhynchus masou populations in rivers of Japan sea coast of Hokkaido"。
  - https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57
- 証拠: [A] "significant differences in the means were observed in regards to five characters (vertebrae, lower gill rakers, dorsal fin rays, pectoral fin rays and anal fin rays) among seven populations."

### F-09
- 主張/値: サクラマスの腹椎数と尾椎数には遺伝成分があり、両者の遺伝相関が推定されている（数値は要約に無い）。
- 適用範囲: O. m. masou、養殖/試験集団（詳細不明）。
- 出典: Ando D., Mano S., Koide N., Nakajima M. (2008) "Estimation of heritability and genetic correlation of number of abdominal and caudal vertebrae in masu salmon", Fisheries Science 74:293-298。
  - https://link.springer.com/article/10.1111/j.1444-2906.2008.01531.x
- 証拠: [A] "suggest that abdominal and caudal vertebrae are governed by genetic components"（検索要約。タイトル水準の確認が中心）。

### F-10
- 主張/値: ビワマス（O. biwaensis、2025年記載）はマスとアマゴに比べ**幽門垂が多く、側線上方の横列鱗が少ない**ことで容易に区別できる。O. ishikawae はアマゴと確認。別の研究では、3タイプ（マス・アマゴ・ビワマス）は形態・計数形質が互いによく似ており、鱗の形態と、幼魚・成魚の側線上下の赤色斑の有無が識別形質。アマゴは側面に朱点があり、マス（ヤマメ）は黒点のみ。
- 適用範囲: O. masou 種複合体。成魚/幼魚。
- 出典:
  - Fujioka Y., Kuwahara M., Tabata R. et al. Ichthyological Research 73:188-200（オンライン2025-06-21）https://link.springer.com/article/10.1007/s10228-025-01032-z
  - https://en.wikipedia.org/wiki/Oncorhynchus_masou_macrostomus
  - https://bioone.org/journals/zoological-science/volume-15/issue-6/zsj.15.971/Genetic-Relationship-between-Masu-and-Amago-Salmon-Examined-through-Sequence/10.2108/zsj.15.971.full
- 証拠: [A] "The new species can be easily distinguished from Masu salmon and Amago salmon among the species complex in having more pyloric caeca and fewer transverse scales above the lateral line."

### F-11
- 主張/値: 神奈川県（相模川・酒匂川水系）の陸封O. masou上流個体群は、形態はアマゴとヤマメに似るが、遺伝的にはアマゴに近い。神奈川県は太平洋岸のヤマメ分布の南限とされ、ヤマメとアマゴの中間的特徴を持つ個体がいる。県の図鑑はヤマメを「体側に小判型のパーマークが並び、成魚にも同じように見られ、朱点はない」と記す。
- 適用範囲: 神奈川県の陸封個体群（O. masou）。定量値なし。
- 出典:
  - Marine Biotechnology 22:812-823 (2020) https://link.springer.com/article/10.1007/s10126-020-09975-2 、https://pubmed.ncbi.nlm.nih.gov/32488506
  - https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html
- 証拠: [A] "the morphological features seen here were similar to amago and yamame. However, both populations were genetically related to amago."

### F-12
- 主張/値: 大型のアマゴ・ヤマメは、体側の赤色斑の有無と鱗の模様で種間差が明瞭。**両者とも体が大きくなるとパーマークを失う**。河川で育った大型ヤマメは2年以上で約300 mm、成長はサクラマスに劣る。雄の7年目の個体も観察された。
- 適用範囲: アマゴ・ヤマメ（福井県の調査）。「300 mm」が体長か全長かは要約に無い。
- 出典: 加藤文男 (1991)「大型アマゴ・ヤマメの形態及び生態に関する知見」水産増殖 39(3):279-。
  - https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/
  - なお、Pacific Salmon Life Histories の Kato (1991) "Life histories of masu and amago salmon" (pp.449-520) と同姓同頭文字だが、同一人物かは未確認。
- 証拠: [A] "Both Amago and Yamame lose their parr marks as their bodies grow larger."

### F-13
- 主張/値: 栃木県の判別基準では、ヤマメは「パーマークと腹部青斑点の両方あるいはいずれかが確認でき、全長30 cm以下の個体はヤマメの可能性が高い」、サクラマスは「全長31 cm以上でパーマークと腹部青斑点の両方が確認できない」。神奈川県の図鑑はヤマメを全長30 cm位まで、別の資料は全長40 cm位まで、体長20-30 cmが通常と記す。サクラマス降海型は35-70 cm。
- 適用範囲: 日本の河川型ヤマメと降海型サクラマス。調査上の判別基準で、生物学的境界値ではない。
- 出典（候補）:
  - https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf
  - https://www.pref.tochigi.lg.jp/g65/documents/sakuramasu2016ankeitomatome.pdf
  - https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html
  - https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9
- 証拠: [B] "全長30cm以下の個体はヤマメの可能性が高いのに対し、サクラマスは全長31cm以上でパーマークと腹部青斑点の両方が確認できません"（検索要約。URL帰属は候補）。

### F-14
- 主張/値: パーマークの個数・位置と斑点の記述（日本語資料）。
  - 「体側中央に楕円形の比較的大きなパーマークが6-9個」と「7-10個」の2系統の記載。
  - 背部から側線にかけて黒点が散在。背鰭・腹鰭・臀鰭・尾鰭の先端が黒い。
  - 小判型のパーマークが成魚にも残る（F-11, F-12との関係は§3）。
- 適用範囲: ヤマメ（O. m. masou）。どの記述がどのURL由来かは帰属未確定。
- 出典（候補）:
  - https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html
  - https://museum.umic.jp/kawa/zukan/sakana/yamame.html
  - https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html
  - https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF
  - https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1
- 証拠: [C] "体側中央に楕円形の比較的大きなパーマークが6-9個並ぶという記載もありますが、別の資料では体側に７～10個のパーマークがある"。

### F-15
- 主張/値: O. masou（種全体）のサイズ。成魚の平均体長50-58 cm・体重2-2.5 kg、沿海地方では71 cm・9 kgまで、最大記録は79 cm TL・10 kg（FishBase系の記載）。
- 適用範囲: 降海型（サクラマス）を含む種全体。**河川型ヤマメの仕様には使えない**（F-13の20-40 cmを使う）。
- 出典（候補）:
  - https://www.fishbase.se/summary/Oncorhynchus-masou.html
  - https://animalia.bio/oncorhynchus-masou?environment=1343
  - https://grokipedia.com/page/Oncorhynchus_masou
  - https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=909
- 証拠: [C] "maximum recorded size being 79 cm total length and 10 kg"（帰属未確定）。

### F-16
- 主張/値: 肥満度 K=体重×1000/尾叉長³（g, cm）。早熟雄由来のスモルトは12.19と12.06、同群のパーは14.09と14.18。0歳パー由来のスモルトは11.30と11.49。スモルトとパーの平均差は1%水準で有意。
  - 派生: スモルトのKはパーより約13.5-15%低い（12.19/14.09=0.865、12.06/14.18=0.850）。同じ尾叉長で体積が約14%小さい＝体が細い。
- 適用範囲: 北海道系（"Hokkaido-Nikko strain"の記載。2群が別系統か別年かは要約に無い）。飼育下の可能性が高い。
- 出典（候補）:
  - https://fra.repo.nii.ac.jp/records/2007545
  - https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22122/1_P39-42.pdf
- 証拠: [A] "Mean condition factor of smolts from precocious male were 12.19 and 12.06 respectively, while means of parr ... were 14.09 and 14.18"。

### F-17
- 主張/値: スモルト化の開始に体サイズの閾値がある。1年目の夏にスモルト化が進むのは尾叉長12 cmを超える個体で、鰓Na+,K+-ATPase活性が上昇した。2年目の春は、サイズが満たされていれば日長で進む。
- 適用範囲: O. masou（飼育実験）。幼魚の段階定義（パー/スモルト）に使える。
- 出典: "Size-driven parr-smolt transformation in masu salmon (Oncorhynchus masou)" Scientific Reports 2023。
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/
  - https://link.springer.com/10.1038/s41598-023-43632-7
- 証拠: [A] "only fish exceeding a fork length of 12 cm exhibited an increased gill Na+,K+-ATPase (NKA) activity."

### F-18
- 主張/値: ブラウントラウト（N=138、平均SL 160.6 mm）の対SL比。背鰭起点の体高=23.9%、臀鰭起点の体高=17.8%、臀鰭前長=76.4%、腹鰭前長=55.2%、背鰭前長=47.6%。頭長・眼径・尾柄高は表が途切れて取得できず。
- 適用範囲: PROXY:Salmo trutta。幼若〜若魚サイズ。どの個体群か、他分類群との共表かは要約に無い。
- 出典: https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T3.html
- 証拠: [A] "body depth at the origin of the dorsal fin measuring 23.9% of standard length ... Preanal length averaged 76.4% of standard length, prepelvic length averaged 55.2%, and predorsal length averaged 47.6%."

### F-19
- 主張/値: ニジマス幼魚（0.6-10.9 g）のデジタル形態測定で、大きくなるほど頭部が相対的に小さくなり、胴の中央部は等成長を示す（予備的結果）。
- 適用範囲: PROXY:Oncorhynchus mykiss。飼育幼魚。
- 出典: Salminen K., Gibb A.C., "Is the growth of juvenile rainbow trout allometric?" SICB。
  - https://sicb.org/?p=36638
- 証拠: [A] "as the fish becomes larger, the head becomes proportionally smaller, although the mid-section of the fish shows isometric growth"（学会要旨。査読論文ではない点に注意）。

### F-20
- 主張/値: ブラウントラウト1歳・2歳の幼魚で、体型が細長い形から体高の高い形へ個体発生的に変わる。より流線形の体型は最大代謝率が高く、持続遊泳能力に影響する。幾何学的形態測定（GM）を使用。
- 適用範囲: PROXY:Salmo trutta。
- 出典: Sánchez-González J.-R., Nicieza A.G. (2023) Current Zoology 69(3):294-303。
  - https://portalinvestigacion.uniovi.es/documentos/64b4eec52107cd1e6d71b7fe
- 証拠: [A] "a more streamlined body shape displayed higher maximum metabolic rates than a deep-bodied shape at both intraspecific and interspecific levels"。

### F-21
- 主張/値: 魚類の初期個体発生では頭部の正のアロメトリーが一般的で、卵黄嚢期・屈曲前期に頭長と尾長が加速して成長する。
- 適用範囲: 種不明（Asian Fisheries Society掲載の初期発育アロメトリー論文の要約）。仔魚期の話で、稚魚〜成魚の仕様には直接使えない。
- 出典: https://www.asianfisheriessociety.org/publication/downloadfile.php?id=1045&file=Y0dSbUx6QTBOVFV4Tmpjd01ERTBNakEyTURBM05UQXVjR1Jt
- 証拠: [B] "Positive allometric growth of the head is a common feature in the early ontogeny of fish."

### F-22
- 主張/値: 成長ホルモン遺伝子導入ギンザケは、同体サイズの非導入個体に比べ**眼径が約30%小さく**、眼径と耳石サイズの相関が強かった。肥満度は対照と差がなく、体全体の比率はほぼ正常だった。大型の対照は24 g、導入個体は約500 gに達した。
- 適用範囲: PROXY:O. kisutch、GH導入個体。急成長個体では、体サイズに対して眼が相対的に小さくなりうるという示唆（私の解釈）。自然個体のデータではない。
- 出典（候補、帰属未確定）: "Genetically modified growth affects allometry of eye and brain in salmonids" Can. J. Zool.（DOI 10.1139/z11-126）と、同結果セットのPMC2848618。
  - https://dx.doi.org/10.1139/z11-126
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC2848618
- 証拠: [A] "Transgenic fish had smaller eyes (−30% eye diameter) when compared to non-transgenic fish of matching body size."

### F-23
- 主張/値: (a) 飼育由来のブラウントラウトは野生由来より頭が短く、流線形が弱い。(b) 家畜化で眼が小さくなるという研究題目がある。(c) 流れの運動を32週与えたブラウントラウトのparrは、GM解析では体高と尾鰭面積に変化がなかったが、肥満度と成長軌道は改善した。
- 適用範囲: PROXY:Salmo trutta（および複数のサケ科）。飼育・放流個体の個体差設計に使える。
- 出典（候補）:
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5551095/
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/ （Fenkes et al. 2018, J. Fish Biol. 93:360-369）
  - https://research.ucc.ie/en/publications/domestication-induced-reduction-in-eye-size-revealed-in-multiple/
- 証拠: [A] "reared in hatcheries have shorter heads and are less streamlined compared with individuals from natural rearing habitat"（帰属は上記候補のいずれか）。

### F-24
- 主張/値: ノルウェー各河川のタイセイヨウサケ幼魚を区別する形質として、頭長・体高・鰭の大きさが最も有効。
- 適用範囲: PROXY:Salmo salar（幼魚）。河川環境（流速）による形態の地域差の存在を示す。
- 出典: "Morphological variability of Atlantic salmon Salmo salar and brown trout Salmo trutta in different river environments"
  - https://www.researchgate.net/publication/263057933_Morphological_variability_of_Atlantic_salmon_Salmo_salar_and_brown_trout_Salmo_trutta_in_different_river_environments
- 証拠: [B] "Head length, body depth and fin size are the characters that best discriminate among juvenile S. salar from different rivers in Norway."

### F-25
- 主張/値: サケ科の繁殖期の形態変化と性的二型。
  - 一回繁殖型のサケ属（semelparous Oncorhynchus）は、吻の伸長、歯の肥大、鉤状の顎、背部の隆起、鰭の伸長、皮膚の肥厚、婚姻色が顕著。
  - 顎の変形はOncorhynchusでは上顎、Salmo・Salvelinusでは下顎で顕著。
  - 背鰭の高さと基底長の雄優位は、Oncorhynchus、Salmo、Coregonus、Prosopium、Thymallus で報告。
  - 成魚のヤマメ（河川残留）での雌雄差の数値は取得できていない。
- 適用範囲: サケ科全般（Thymallus 属 [グレイリング] のレビューで、サケ科他属と比較している。O. masouへの適用は未確認）。
- 出典: "General patterns of sexual dimorphism in graylings (Thymallus), with a comparison to other salmonid species", Rev. Fish Biol. Fisheries (2021)。
  - https://link.springer.com/article/10.1007/s11160-021-09694-4
- 証拠: [A] "The transformation of the jaws ... tends to be most characteristic for semelparous Oncorhynchus (upper jaw), and iteroparous Salmo and Salvelinus (lower jaw)."

### F-26
- 主張/値: サケ科のGM研究の存在確認（変形量などの数値は取得できず）。
  - ブラウントラウトのGMで性的・遺伝子型的二型（Aquat. Living Resour. 2006）。
  - ギンザケの野生 vs 飼育成魚のGM（Procrustes座標＋薄板スプライン）。頭の大きさ・吻形・体幹の高さ・流線形の変化と性的二型の減少を検出。
  - 同所性3形のホッキョクイワナで頭部・体の個体発生軌道が違う（PMC5606865）。
  - 成熟ベニザケでの眼窩中央〜尾部下骨（hypural）間長の変化（N. Am. J. Fish. Manage. 2000）。
  - **O. masou（ヤマメ/サクラマス）のGM研究と、変形の極値は見つからなかった。**
- 適用範囲: PROXY: Salmo trutta、O. kisutch、Salvelinus alpinus、O. nerka。
- 出典:
  - https://www.alr-journal.org/10.1051/alr:2006004
  - https://link.springer.com/article/10.1023/A:1007646332666
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5606865/
  - https://www.tandfonline.com/doi/abs/10.1577/1548-8675(2000)020%3C0245:CIMTHL%3E2.0.CO;2
- 証拠: [A] "Multivariate analysis of shape variation by Procrustes coordinates, visualized by thin-plate splines, can indicate morphometric differentiation including ... changes in head size, snout shape, trunk depth, and body streamlining."（タイトル・要約水準）。

### F-27
- 主張/値: 計測点の定義（検索で出た一例）。標準体長（SL）は上顎の先端（symphysis）から尾鰭基部中央まで。体高（BD）は背鰭起点の位置。頭長（HL）は上顎先端から鰓蓋後端まで。
- 適用範囲: 種は要約に明記されていない（ElewaのJABS論文と、ResearchGateの図）。O. masou の資料が同じ定義とは限らない。タイワンマスの比（F-01）の「体長」定義も未確認。
- 出典:
  - https://www.m.elewa.org/JABS/2010/34/5.pdf
  - https://www.researchgate.net/figure/Morphometric-measurements-1-Standard-length-SL-from-upper-jaw-symphysis-to-middle_fig16_249657347
- 証拠: [B] "standard length (SL) is measured from upper jaw symphysis to middle base of caudal fin, body depth (BD) at level of origin of dorsal fin, and head length (HL) from upper jaw symphysis to posterior tip of operculum"。

### F-28（M: 未検証の仮説）
- 主張/値: F-06・F-07の背鰭・臀鰭条数の食い違い（例: 臀鰭11-14と14-18）は、「主鰭条（分枝鰭条）」と「痕跡的な不分枝鰭条を含む総数」という数え方の差による可能性がある。サケ科には鰭棘がないという一般知識に基づく推測。
- 適用範囲: 不明。
- 出典: なし（私の記憶）。
- 証拠: [M] 検証していない。Nakabo編 "Fishes of Japan" や FishBase の定義（"total" か否か）で確認すること。

---

## 3. 資料間の矛盾・不一致

| # | 項目 | 資料A | 資料B | 補足 |
|---|------|-------|-------|------|
| 1 | 臀鰭条数 | 14-18（F-06） | 11-14（F-06、別の英語資料）、12-17（F-07、日本語） | 種・亜種・数え方（総数/主鰭条）・集団差のいずれか。F-08は臀鰭条が集団間で有意に違うと示す。F-28は未検証の仮説 |
| 2 | 背鰭条数 | 13-18（F-06、F-07） | 12-17（F-06） | 同上 |
| 3 | 腹鰭条数 | 大半が10（Christie、F-05） | 9-11（F-06）、10-12（F-07） | |
| 4 | 鰓耙数 | 16-22、大半が18-19（Christie、F-05） | 18-22（F-06、用語が "gill rays"）、単一値16（F-07） | F-06は鰓耙か鰓条骨かが紛らわしい |
| 5 | 幽門垂数 | 35-68、平均47.05（F-05） | 35-76（F-06）、40-54（F-07）、単一値43（F-07） | 集団・サイズ・亜種差の可能性。ビワマスは多い（F-10） |
| 6 | 側線鱗/横列鱗 | 側線鱗120-140、横列43-56（F-06） | 27-32（F-07、定義不明） | 別の数え方。27-32は側線鱗の枚数ではないと思われるが確認できず |
| 7 | パーマーク個数 | 6-9個 | 7-10個（F-14）。タイワンマスは9個（F-03） | 数え方（小さな前後の斑を含めるか）の差が疑われる。確認できず |
| 8 | パーマークの持続 | 成魚にも同じように見られる（神奈川県図鑑、F-11） | 大きくなると消える（加藤1991、F-12）。全長31 cm以上で見えなければサクラマス（栃木県、F-13） | 「成魚」の定義（小型成熟魚か大型魚か）が違う可能性。サイズ依存の変化として扱うのが整合的（私の解釈） |
| 9 | 体高 | タイワンマス成魚で体長/体高=3.48（≒28.7%、F-01） | ブラウントラウト背鰭起点体高23.9%SL（F-18） | 種・サイズ・計測点・「体長」の定義が全て異なる。直接比較できない。F-02はタイワンマスが日本産亜種より体高が高いと述べる |
| 10 | 最大サイズ | 種で79 cm TL・10 kg（F-15） | タイワンマスのFishBase最大57.0 cm TL（F-03）、同亜種は稀に40 cm超・成魚約30 cm（F-03） | 最大記録と典型値の差。FishBase記載は高い側に偏るので典型値には使えない |
| 11 | タイワンマスの分類位置 | 計数・計測だけでは系統不明（F-02） | 計数形質の証拠から「サクラマス複合体の亜種ではない」との趣旨の見出し（F-02） | 後者は要約のみで帰属不明。形態から亜種/種の線引きができるほど差が大きいか、小さいかが割れている |
| 12 | ビワマス等の亜種識別 | 形態・計数形質がよく似て識別できない（F-10） | 幽門垂数・横列鱗数で容易に識別（F-10、2025年の記載論文） | 以前の研究は3型を識別できず、2025年の研究が識別形質を示した、という時間差の可能性 |
| 13 | 飼育の影響 | 飼育由来は頭が短く流線形が弱い（F-23a） | 流れの運動で体高と尾鰭面積は変わらない（F-23c） | 前者は由来集団の比較、後者は短期の運動実験。矛盾というより別の要因 |

---

## 4. 見つからなかったこと（Gaps）

### 4.1 3Dモデル仕様に必要だが確認できなかった事項（優先度順）
1. **ヤマメ（河川型 O. m. masou）の%SL実測値**: 体高（最大）、体幅、頭長、吻長、眼径、眼間隔、上顎長、尾柄高、尾柄長、背鰭前長・腹鰭前長・臀鰭前長、各鰭長・鰭基底長。FishBaseの形態ページ、Nakabo編 Fishes of Japan、Korean J. Ichthyol.(1993) の表、Jan et al. (1990) の表が本命だが、いずれも本文未読。
2. **断面形状**: 背中から尾柄までの断面（幅/高さ比）、腹部の形、尾柄の断面。数値も図も取得できなかった。
3. **眼球**: 眼の位置（吻端から眼中心までの距離、頭高に対する位置）、眼径の成長に伴う相対値の変化（ヤマメ）。F-22はGH導入ギンザケのみ。
4. **口と顎**: 口裂角度、上顎後端と眼の位置関係（資料の「上顎後端は眼の後縁を超える」という確認ができなかった）、下顎の突出、成熟雄の鉤状化の有無と程度（ヤマメ）。
5. **鰭の寸法と形**: 胸鰭・腹鰭・背鰭・脂鰭・臀鰭・尾鰭の長さ・面積・縁形状。尾鰭の切れ込み量（成魚の浅い二叉はタイワンマスの記述のみ、F-03）。鰭条数ごとの鰭条の間隔と分枝。
6. **鱗**: 鱗の大きさと成長に伴う変化、体部位ごとの鱗密度、側線の位置・孔数。F-06の120-140枚は帰属未確定のC級データのみ。「鱗が形態の識別形質」（F-10）の内容（隆起線の本数など）も未取得。
7. **成長に伴う形態変化（ヤマメ）**: 稚魚→幼魚→成魚の頭長・眼径・体高・鰭長の相対成長係数。F-19・F-20・F-21はPROXY（ニジマス、ブラウントラウト、種不明）。
8. **雌雄差（ヤマメ）**: 成魚の体高・鰭長・吻形の雌雄差と、繁殖期の変化（追星、鉤状顎、婚姻色）。F-25はサケ科一般。
9. **早熟雄（残留型）・降海型（サクラマス/スモルト）との体型差**: F-16は肥満度のみ。ヤマメの降海前後の体高・頭長の変化は未取得。
10. **幾何学的形態測定（GM）**: ヤマメ/サクラマスのGMランドマークと、Procrustes座標の変形極値（PC軸の±）は見つからなかった。サケ科の他種でも変形量の数値は未取得。
11. **肥満度の個体分布**: 野生ヤマメの季節別Kの平均・SD。F-16は飼育のスモルト化研究のみ。
12. **計数形質の正式な平均±SD・n**: F-08（北海道7河川）の平均値、Christie (1970) の表、タイワンマスの52個体の表。

### 4.2 存在は確認できたが本文を読めなかった一次資料（次に取得すべきリード）
- Jan R.Q. et al. (1990) 台湾陸封サケの計数・計測形質。PDF: https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf （同じ増刊号に https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/27.pdf 、https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/1.pdf も検索に出た。内容未確認）
- Korean J. Ichthyol. 5(1):96-112 (1993) の表（性別・種別の%SL、%HL）。https://koreascience.kr/article/JAKO199327236818661.page
- Dorofeyeva E.A. (2008) Trudy ZIN 312(1-2) "Morphological characters of lake forms of salmonid fishes of the genera Salmo and Oncorhynchus"（ビワ湖のマス湖沼型を含む）。PDF: https://www.zin.ru/Journals/trudyzin/doc/vol_312_1_2/TZ_312_1_2_Dorofeeva.pdf
- Fujioka et al. (2025) ビワマス記載論文の計数・計測表（マス・アマゴとの比較表を含む可能性）。https://link.springer.com/article/10.1007/s10228-025-01032-z
- Kato F. (1991) in Groot & Margolis (eds.) Pacific Salmon Life Histories, pp.449-520（マス・アマゴの生活史と形態）。
- Christie (1970) の計数表。https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf
- Mano et al. (1991) 北海道7河川の計数形質の平均値。https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57
- kmae 2020 論文の表T3（ブラウントラウトの全形質）。https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T3.html
- FishBase の種別「形態」ページ（URL形式はO. mykissで確認: https://fishbase.se/physiology/Oncorhynchus_mykiss ）。O. masou版のURLは今回の結果に出ていないので作らない。
- 北海道のサケ科魚類解説PDF群（【形態】欄あり。サクラマスの頁は未特定）: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ほか。
- 青森県産業技術センターの魚体測定記録（ヤマメの体長・体重データの可能性）: https://www.aomori-itc.or.jp/_files/00230483/241-244.pdf ほか。
- 鹿児島大学博物館の紀要PDF（検索で計数形質の質問に出たが内容未確認）: https://www.museum.kagoshima-u.ac.jp/ichthy/INHFJ_2025_059_018.pdf
- Nakabo T. (ed.) "Fishes of Japan with Pictorial Keys to the Species"（オンラインで確認できず）。
- Hsu et al. (2010)、Sánchez-González & Nicieza (2023)、Fenkes et al. (2018) の全文。

### 4.3 方法論上の制約
- 検索要約が生成文で、個々の数値のURL帰属が曖昧なものが多い（F-06, F-07, F-13〜F-16, F-22, F-23）。本文を読める環境で上記リードを開いて確認するまで、これらは仕様書の確定値にしないこと。
- 検索上限に到達したため、英語での「鰭長・眼径・尾柄高の%SL」「サケ科の鰭面積」「眼径の個体発生」「ヤマメの雌雄差」「ヤマメの鱗」の検索は未実施。

---

## 5. 出典一覧（URL付き、重複排除。検索結果に出たURLのみ）

論文・公的資料・学会資料
1. Jan et al. 1990 PDF — https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf
2. Bull. Inst. Zool. Acad. Sin. 29 Suppl. 目次 — https://zoolstud.sinica.edu.tw/293SUPPLEMENT.html
3. 同増刊号の他論文 — https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/27.pdf 、https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/1.pdf
4. 国立台湾海洋大学の研究者プロジェクト記録 — https://scholars.ntou.edu.tw/cris/project/pj03139
5. Hsu et al. 2010, Aquaculture Research — https://onlinelibrary.wiley.com/doi/10.1111/j.1365-2109.2010.02533.x
6. Taiwan salmon or salmon in Taiwan?（Ichthyol. Res.） — https://link.springer.com/article/10.1007/s10228-019-00688-8
7. Formosan landlocked salmon レビュー — https://marres.namr.gov.tw/vol_file.aspx?lang=en&fid=20251212160135
8. Korean J. Ichthyol. 5(1):96-112 (1993) — https://koreascience.kr/article/JAKO199327236818661.page 、https://www.koreascience.or.kr/article/JAKO199327236818661.page 、https://koreascience.or.kr/article/JAKO199327236818661.pub
9. Christie 1970 — https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf
10. Mano et al. 1991（AGRIS） — https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57
11. Ando et al. 2008 — https://link.springer.com/article/10.1111/j.1444-2906.2008.01531.x
12. Fujioka et al. 2025（ビワマス新種） — https://link.springer.com/article/10.1007/s10228-025-01032-z
13. Zool. Sci. 15(6): 971（マスとアマゴ） — https://bioone.org/journals/zoological-science/volume-15/issue-6/zsj.15.971/Genetic-Relationship-between-Masu-and-Amago-Salmon-Examined-through-Sequence/10.2108/zsj.15.971.full
14. Marine Biotechnology 22:812-823 (2020) — https://link.springer.com/article/10.1007/s10126-020-09975-2 、https://pubmed.ncbi.nlm.nih.gov/32488506
15. Dorofeyeva 2008 — https://www.zin.ru/Journals/trudyzin/eng/publication.html?id=10 、https://www.zin.ru/Journals/trudyzin/doc/vol_312_1_2/TZ_312_1_2_Dorofeeva.pdf
16. 加藤文男 1991 水産増殖 39(3) — https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/
17. Size-driven parr-smolt transformation（Sci. Rep. 2023） — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10547828/ 、https://link.springer.com/10.1038/s41598-023-43632-7
18. 肥満度（スモルト/パー）資料 — https://fra.repo.nii.ac.jp/records/2007545 、https://eprints.lib.hokudai.ac.jp/repo/huscap/all/22122/1_P39-42.pdf
19. ブラウントラウト形態表 — https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/T3.html
20. SICB 要旨（ニジマス幼魚のアロメトリー） — https://sicb.org/?p=36638
21. Sánchez-González & Nicieza 2023 — https://portalinvestigacion.uniovi.es/documentos/64b4eec52107cd1e6d71b7fe
22. Asian Fisheries Society（初期発育アロメトリー） — https://www.asianfisheriessociety.org/publication/downloadfile.php?id=1045&file=Y0dSbUx6QTBOVFV4Tmpjd01ERTBNakEyTURBM05UQXVjR1Jt
23. GH導入ギンザケの眼・脳アロメトリー — https://dx.doi.org/10.1139/z11-126 、https://pmc.ncbi.nlm.nih.gov/articles/PMC2848618
24. 飼育と野生のマス類の形態 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5551095/ 、https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6174970/ 、https://research.ucc.ie/en/publications/domestication-induced-reduction-in-eye-size-revealed-in-multiple/
25. 河川環境とサケ科の形態 — https://www.researchgate.net/publication/263057933_Morphological_variability_of_Atlantic_salmon_Salmo_salar_and_brown_trout_Salmo_trutta_in_different_river_environments
26. サケ科の性的二型 — https://link.springer.com/article/10.1007/s11160-021-09694-4
27. GM関連 — https://www.alr-journal.org/10.1051/alr:2006004 、https://link.springer.com/article/10.1023/A:1007646332666 、https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5606865/ 、https://www.tandfonline.com/doi/abs/10.1577/1548-8675(2000)020%3C0245:CIMTHL%3E2.0.CO;2
28. 計測点定義の例 — https://www.m.elewa.org/JABS/2010/34/5.pdf 、https://www.researchgate.net/figure/Morphometric-measurements-1-Standard-length-SL-from-upper-jaw-symphysis-to-middle_fig16_249657347
29. USGS NAS（cherry salmon） — https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=909
30. FishBase — https://www.fishbase.se/summary/Oncorhynchus-masou.html 、https://www.fishbase.se/summary/16686 、https://fishbase.org/summary/16686 、https://fishbase.se/physiology/Oncorhynchus_mykiss

行政・図鑑・解説（B/C）
31. 神奈川県 淡水魚類図鑑 ヤマメ — https://www.pref.kanagawa.jp/docs/a4y/images/yamame.html
32. 栃木県 サクラマス資料 — https://www.pref.tochigi.lg.jp/g65/documents/sakura2017matome2.pdf 、https://www.pref.tochigi.lg.jp/g65/documents/sakuramasu2016ankeitomatome.pdf
33. 北海道庁 サクラマス（ヤマメ） — https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
34. さけ・ます資源管理センターニュース No.8 — https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf
35. 北海道立総合研究機構 魚類解説PDF — https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
36. 上田地域こども自然電子図鑑 ヤマメ — https://museum.umic.jp/kawa/zukan/sakana/yamame.html
37. 大阪府環境農林水産総合研究所 ヤマメ — https://www.knsk-osaka.jp/zukan/zukan_database/tansui/2750b34e3c47c34/1950b71361cfd15.html
38. 日本語版Wikipedia — https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9 、https://ja.wikipedia.org/wiki/%E3%83%A4%E3%83%9E%E3%83%A1 、https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%BC%E3%83%9E%E3%83%BC%E3%82%AF
39. zukan-bouz — https://www.zukan-bouz.com/syu/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9 、https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1
40. 英語版Wikipedia — https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus 、https://en.wikipedia.org/wiki/Oncorhynchus_masou_macrostomus 、https://en.wikipedia.org/wiki/Oncorhynchus_masou
41. Grokipedia（生成AI百科、C扱い） — https://grokipedia.com/page/Oncorhynchus_masou
42. allfishes / marinelifeid / iNaturalist / NCBI Taxonomy / animalia.bio — https://allfishes.org/fishes/marine/masu-salmon 、https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/ 、https://www.inaturalist.org/taxa/187787-Oncorhynchus-masou-masou 、https://www.ncbi.nlm.nih.gov/datasets/taxonomy/8020/ 、https://animalia.bio/oncorhynchus-masou?environment=1343
43. Life of Taiwan — https://lifeoftaiwan.com/nature/the-formosan-landlocked-salmon-taiwans-unique-natural-wonders-part-1/
44. 青森県産業技術センター（未読リード） — https://www.aomori-itc.or.jp/_files/00230483/241-244.pdf
45. 鹿児島大学博物館（未読リード） — https://www.museum.kagoshima-u.ac.jp/ichthy/INHFJ_2025_059_018.pdf

（45項目、ユニークURL 72本。）

---

## 6. 検索ログ

WebSearch 実行57回（成功）、上限到達による拒否3回、WebFetch 1回（fishbase.se が遮断）。「有用」は、仕様に使える内容または次に取得すべき一次資料の特定につながった結果の数。

| # | 言語 | クエリ（要旨） | mode | 有用 |
|---|------|----------------|------|------|
| 1 | EN | O. masou morphometric measurements body depth head length SL | extended | 3 |
| 2 | EN | FishBase O. masou dorsal/anal soft rays（fishbase限定） | standard | 0 |
| 3 | EN | masu salmon meristic counts gill rakers pyloric caeca LL scales | standard | 1 |
| 4 | EN | O. m. formosanus 体長/頭長 4.20、体高 3.48 | extended | 1 |
| 5 | EN | Formosan landlocked salmon morphometric meristic parr marks | standard | 2 |
| 6 | EN | O. m. ishikawae amago morphology comparison | extended | 3 |
| 7 | EN | Kato 1991 Life histories of masu and amago salmon | standard | 1 |
| 8 | EN | Christie Review of the Japanese salmons（gill rakers等） | extended | 3 |
| 9 | EN | Chichiawan Stream 52 specimens morphometric | extended | 2 |
| 10 | EN | Kanagawa landlocked O. masou morphological | standard | 1 |
| 11 | EN | Biwa salmon new species diagnosis | extended | 2 |
| 12 | EN | O. masou "gill rakers" "pyloric caeca" "vertebrae" 等 | extended | 2 |
| 13 | EN | O. m. ishikawae description fin rays Wikipedia | standard | 0 |
| 14 | EN | Jan 1990 morphometric meristic landlocked salmon Taiwan | extended | 2 |
| 15 | JA | サクラマス ヤマメ 体高 体長 頭長 比 | standard | 0 |
| 16 | EN | Jan Jaung Lin Chang 等（sinica/ntou限定） | extended | 1 |
| 17 | EN | Taiwan salmon 100th anniversary morphology | extended | 2 |
| 18 | EN | O. masou Amur Primorye Sakhalin meristic | extended | 1 |
| 19 | EN | Morphological characters of lake forms of Salmo and Oncorhynchus | standard | 1 |
| 20 | EN | "Dorsal soft rays (total)" O. masou | standard | 1 |
| 21 | EN | O. formosanus FishBase rays vertebrae | standard | 1 |
| 22 | JA | ヤマメ 背鰭 臀鰭 鰭条数 側線鱗 鰓耙 幽門垂 椎骨数 | standard | 1 |
| 23 | EN | Ando heritability abdominal caudal vertebrae masu | standard | 1 |
| 24 | JA | サクラマス 背鰭条数 13-18 胸鰭 14-17 … | extended | 0 |
| 25 | EN | Variation morphological characteristics masu Hokkaido | extended | 2 |
| 26 | JA | Fishes of Japan Nakabo 計数形質 サクラマス | standard | 0 |
| 27 | EN | Morphological study Oncorhynchus Korea IV（koreascience限定） | extended | 1 |
| 28 | EN | Morphological study Korea masu body depth head length | extended | 1 |
| 29 | EN | Korean J. Ichthyol masu meristic | standard | 0 |
| 30 | EN | "13 factors of the female and 11 factors of the male" | standard | 1 |
| 31 | EN | GH pseudogene female masu morphological | standard | 0 |
| 32 | EN | subspecies morphological differences amago masu Biwa scale | extended | 1 |
| 33 | EN | salmonid allometric growth head eye fin juvenile | extended | 3 |
| 34 | EN | geometric morphometrics salmonid body shape | extended | 3 |
| 35 | EN | brown trout morphometrics %SL | standard | 1 |
| 36 | EN | ontogenetic allometry rainbow trout | standard | 1 |
| 37 | EN | Declining metabolic scaling brown trout body shape | standard | 1 |
| 38 | EN | Body shape and robustness response to water flow brown trout parr | standard | 1 |
| 39 | EN | Genetically modified growth allometry eye brain salmonids | standard | 1 |
| 40 | EN | Sexual dimorphism graylings vs other salmonids | standard | 1 |
| 41 | JA | ヤマメ 相対成長 体高 頭長 眼径（jstage等限定） | extended | 1 |
| 42 | JA | サクラマス スモルト化 形態変化 肥満度 | standard | 0 |
| 43 | EN | masu smoltification morphological changes condition factor | standard | 2 |
| 44 | JA | 大型アマゴ・ヤマメの形態及び生態に関する知見 | extended | 1 |
| 45 | EN | condition factor smolt parr masu 12.19 14.09 | standard | 1 |
| 46 | JA | 講座 ヤマメ 石田力三 体形 パーマーク | standard | 1 |
| 47 | JA | 淡水魚類図鑑 ヤマメ 神奈川県 | standard | 1 |
| 48 | EN | O. masou description snout jaw maxilla caudal fin | standard | 1 |
| 49 | JA | サクラマス 形態 ウィキペディア 側線鱗 | standard | 0 |
| 50 | JA | ヤマメ 上顎後端 眼 後縁 パーマーク 8〜12個 | extended | 1 |
| 51 | JA | サクラマス ヤマメ 外部形態 椎骨63 側線鱗134 | extended | 1 |
| 52 | EN | masu "caudal peduncle" stout "ventral fin rays" 35-68 | extended | 1 |
| 53 | JA | hro.or.jp 形態 サケ科 側線鱗数 幽門垂数（hro限定） | extended | 1 |
| 54 | JA | ヤマメ 側線鱗数 幽門垂 40-54 NIES | standard | 0 |
| 55 | EN | Oncorhynchus biwaensis abstract pyloric caeca scale rows | extended | 1 |
| 56 | EN | Kanagawa landlocked Marine Biotechnology abstract | extended | 1 |
| 57 | EN | agris masu Hokkaido seven rivers numerical characters | standard | 1 |
| 58-60 | EN | brown trout %SL table / FishBase O. mykiss morphology / FAO coho sheet | - | 実行拒否（検索上限） |

WebFetch: https://www.fishbase.se/summary/Oncorhynchus-masou.html は EGRESS_BLOCKED。以降は試さず。

終了理由: 検索上限（200回、セッション共有）に到達したため。結果が同じ資料の繰り返しになる前に打ち切られており、**英語での%SL実測値の探索は不十分なまま**である。
