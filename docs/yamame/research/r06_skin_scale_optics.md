# r06 鱗・粘液・銀色反射（グアニン）・鰭膜の光学とマテリアル（ヤマメ Oncorhynchus masou masou 河川型）

> **調査制約（必読）— 本ストリームは新規の外部証拠を1件も取得できていない。**
> 1. WebSearch はセッション上限（200/200）に到達済みで、本ストリームで発行した 4 回（グアニン多層膜／サケ科円鱗／ニジマス虹色素胞反射／日本語「魚 鱗 グアニン…」）はいずれも "Web search was not performed" で返った。WebFetch 1 回（en.wikipedia.org）は EGRESS_BLOCKED。→ 課題 1〜6 の「検索による新規A/B証拠」は **0 件**。
> 2. 代替として行ったこと（すべて §6 に記録）:
>    - **Part A（F-01〜F-13）**: 既存の r01〜r04 の Finding のうち、鱗・体色・銀化・鰭に関わるものを**二次引用**。URL・証拠ランクは各 r0x に記載のものをそのまま転記し、本ストリームは原典を再確認していない。r0x 側で「要原典確認」「帰属不明」とされたものはその注記を残した。
>    - **Part B（F-14〜F-21）**: `docs/yamame/photo_analysis/catalog_c01〜c07.json`（70枚の写真に対する皮膚・鰭・光沢の目視記述）を集計。**証拠ランクは C**（AIによる目視記述であり、測色・測光の計測値ではない。信頼度 high は 70 枚中 3 枚のみ）。件数は日本語キーワードの機械的カウントで、粗い。
>    - **Part C（F-22〜F-30）**: 調査員（Claude）の記憶に基づく物理・解剖の知識で、**全て証拠ランク M（未検証）**。屈折率など M の入力値から数値計算した結果も M（計算）として区別して示す。文献名は「記憶に基づく検証用リード」であり、URL は付けない（創作しない）。
> 3. したがって **Part C の光学定数・反射率・厚みは暫定値（仮定）であり、サケ科での実測ではない**。仕様に採用する場合は「仮定パラメータ」として扱い、検索予算が使えるときに §4 の Gap から優先的に確認すること（§6 末尾に再実行用クエリを置いた）。
> 4. 証拠ランク: A=査読論文・学術書・公的機関資料（要約に明示）／B=図鑑・自治体・博物館・信頼できる解説／C=釣りメディア・個人サイト・AI生成・写真目視記述／M=記憶（未検証）。Part A の「A」は「一次資料側のランクがAだが、本ストリームでは二次引用」の意。
> 5. PROXY の運用: ヤマメ以外のデータは scope に "PROXY:" と明記。

---

## 1. 要約（仕様に直結する結論）

各行末の [F番号] は §2 の根拠 Finding。**[M] を含む行は未検証の仮定**であり、そのまま数値仕様にしないこと。

1. **銀白色は「銀化度 s」という連続パラメータの別レイヤーとして持つ**。マスでは parr→silvery parr→smolt の各段階でグアニン／ヒポキサンチンが顕著に増加し、スモルト化でパーマークが見えなくなる。一方、グアニン量と見た目の銀化は必ずしも直線的に対応しない（要約記述）。河川型ヤマメでも体側下半は灰青白〜銀白で、パーマークは残る。 [F-01][F-02][F-10][F-14]
2. 銀化度 s を上げるとパーマークと背色のコントラストが下がる関係（スモルト）と、成熟した河川残留雄が暗色化してパーマークが逆にくっきりする関係（早熟雄）の**両方向**を個体パラメータで表現できるようにする。パーマークと銀色層の層順序（どちらが上か）を示す資料は無い。 [F-02][F-13][Gap-10]
3. **側面の銀色は、狭帯域の虹色（薄膜干渉の見本のような色）ではなく、広帯域でほぼ無彩色の鏡面成分として実装する**のが物理的に妥当。同じ間隔の積層では波長ピークが角度で大きく青側へずれ（計算: 内部入射角 0→40° で 550→455 nm）、斜めではp偏光反射が落ちる（60°で 0.18）。魚が広帯域・無偏光に近い銀色を作るのは、間隔の異なる積層の重ね合わせによるとされる（記憶）。 [F-23][F-24][F-25] （すべて M）
4. 写真でも**虹色（青紫〜桃）・真珠光沢の言及は 70 枚中 6 枚**にとどまり、主に鰓蓋・腹側・体側境界。全面的な虹色ではなく「ごく弱い角度依存の色味」を銀白成分に乗せる程度が妥当。 [F-18]
5. **水中と空気中でグロス（表面反射）を分ける**。空気中の写真（ヤマメ判定 39 枚）では 34 枚に「濡れた艶／水膜」の記述、15 枚に背縁沿いの線状・帯状の水膜ハイライトがある一方、水中・水槽（18 枚）ではマット〜サテン調の記述が 10 枚、線状ハイライトは 3 枚のみ。物理的にも粘液・水・表皮の屈折率がほぼ同じため、水中ではその界面の鏡面反射はほぼゼロ（計算: 水/粘液 7×10⁻⁶）。→ クリアコート的な光沢は「空気中（釣り上げ・水面上）」用、水中では銀色層の環境反射を主体にする。 [F-17][F-28]（F-17 は C、F-28 は M）
6. **鱗は「巨大な凹凸」ではなく、微細な格子状の縁ハイライト＋微弱な法線変調として表現する**。空気中の写真 39 枚中 37 枚で鱗の格子が視認される一方、水中・水槽では 8/18 に低下。写真の記述にも「鱗の凹凸は大きくなく極小さい」（p049）とある。鱗は皮膚に埋没し表皮で覆われる（記憶）ため、立体的な凹凸ではなく鱗縁・鱗列の明暗として見える。 [F-15][F-16][F-27]
7. **鱗のピッチ（暫定）**: 側線有孔鱗 118–134 枚（青森, A）／120–140（C）から、側線列の長さを 0.76×SL と仮定すると 1 枚あたり約 0.54–0.64 %SL。写真 p042 の「点状反射の中心間隔 ≈ 体高の 1/25」は体高≈22%SL を仮定すると約 0.9 %SL。→ **暫定レンジ 0.55–0.9 %SL（SL 200 mm で約 1.1–1.8 mm）**。ただし両者は定義が異なる（有孔鱗列 vs 反射点間隔）ため差を並記する。 [F-06][F-16][矛盾-2]
8. **側線上横列鱗は 27–32（サクラマス, C）と 43–56（AI百科, C）で数え方が食い違う**。仕様に使うなら定義を確定してから。鱗数・鰭条数は個体差パラメータだが、**資料間で値が割れるため一点値でなく幅を持たせる**。 [F-06][F-07][F-05]
9. **鰭は半透明＋鰭条の濃淡**で作る。写真（ヤマメ判定 57 枚）で「半透明」の語を含む割合は胸鰭 34・腹鰭 33・臀鰭 38・背鰭 31・尾鰭 23 枚。鰭条が見える記述は胸鰭 17・背鰭 15・腹鰭 14・尾鰭 9・臀鰭 4 枚と少なく、**鰭条は「うっすら見える」程度**。胸鰭は黄〜橙味（黄 31／橙 24 枚）が主。 [F-19]
10. **腹鰭・臀鰭の白い前縁（外縁）**: ヤマメ判定写真で腹鰭 14/57、臀鰭 19/57 が白い前縁・外縁を明示（背鰭 7、胸鰭 6）。r04 の記憶ベースでは「確証なし」とされていた事項で、写真側では約 1/4〜1/3 の個体に出る。サケ科の他種（イワナ）との混同可能性は写真ごとの判定に依存。 [F-19]
11. **尾鰭の下葉縁が赤〜橙を帯びる個体が多い**（ヤマメ判定 57 枚中 16 枚、約 28%）。信頼度 high の p053 では上葉が褐橙(145,118,72)・下葉が橙赤(184,124,79)。ただし橙色の網など色かぶりの混入可能性があり、アマゴ疑い個体（p019, p057, p070）にも同様の記述がある。背鰭・脂鰭・尾鰭の黒点と先端の暗色は B 資料に記述あり。 [F-20][F-10]
12. **脂鰭は写真では同定困難（ヤマメ判定 57 枚中 31 枚が「同定不能」）**。鰭条を持たない肉質の鰭（記憶）。形状・色は写真ストリームの高解像度側面写真で別途確認が必要。 [F-19][F-29]
13. **鰭条数（青森ヤマメ, A）**: 背 12–13、胸 12–14、腹 9、臀 12–14（旭川産は胸 13–15、腹 8–9、臀 11–14）。分枝／不分枝の区別は要約に無い。他資料（C）は背 13–18、臀 14–18 などより広い。個体差生成は F-04 を中心に、F-05 の幅を外側の裾として扱う。 [F-04][F-05]
14. **粘液は個体の「濡れ」状態パラメータとして扱う**。写真では、網や取り込み後の個体（p021, p044, p045）で粘液の剥離・白い擦過斑が見られる。婚姻期雄や取り込み後の個体用に「擦れ・粘液剥離」の任意オーバーレイを持たせる根拠。粘液の厚み・屈折率・散乱の資料は取得できず。 [F-21][F-28][Gap-5]
15. **水中の光（M・暫定）**: 純水の吸収は赤側で急に増え（1/e 深さ: 500 nm ≈ 49 m, 550 nm ≈ 16 m, 600 nm ≈ 4.5 m, 650 nm ≈ 2.9 m, 700 nm ≈ 1.6 m）、観察距離 3 m で 600/650/700 nm の透過は 0.51/0.36/0.15。実際の渓流は溶存有機物（CDOM）・懸濁粒子で青側も減衰するため、**純水値は下限の目安**。水面直下の「スネルの窓」は全角 97.2°。 [F-30]（M）
16. **体色基調（B）**: 背は暗青緑〜暗青、または黄褐色（資料間で割れる）、体側は銀白、腹は白。黒点は背部・背鰭・脂鰭・尾鰭に分布し頭部背面には無い。降海型で背鰭先端に白色部。写真での背側は暗褐色(98,83,74)などの記述（p001）。対陰影の光学的説明は記憶ベース（暗色＝メラニン、腹＝反射・散乱による明色）。 [F-10][F-26]
17. **本ストリームで取得できなかった最重要項目**: サケ科のグアニン結晶層の厚み・層数・反射スペクトル、鱗径(mm)、鱗の埋没度、粘液の厚み、表皮の透明度、鰭膜の厚み、清流の吸収スペクトル。→ すべて仮定パラメータ（§4）。 [Gap-1〜Gap-8]

---

## 2. Findings

### Part A — 既存ストリーム（r01〜r04）からの二次引用

### F-01
- 主張/値: マス（masu salmon）では、parr→silvery parr、silvery parr→smolt の**両方の移行でグアニンとヒポキサンチンが顕著に増加**した。ただし大量のグアニンが銀化の見た目と必ずしも相関しない。parr→smolt の暗色→銀色の変化は皮膚へのグアニン結晶の沈着による（この後半の一般則は PROXY の記述）。µg/g や µg/cm² などの数値は要約に無い。
- 適用範囲: (a) Oncorhynchus masou（北大水産学部研究彙報とみられる; 年・サイズ・n・部位は不明）。(b) PROXY:サケ科一般（種・出典不明）。
- 出典: 北大水産学部研究彙報 21(2):123–127（候補・特定不能; r03 F-17／r04 F-35 経由）https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf ／ PROXY 候補: McMahon et al. 1988, J. Fish Biol. https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf
- 証拠: [B]（r03 は A 候補としたが文書特定不能のため r04 が B に降格。本ストリームは原典未確認）「a remarkable increase of guanine and hypoxanthine was found at both occasions of change from parr to silvery parr and from silvery parr to smolt」（r03/r04 の引用）。

### F-02
- 主張/値: スモルト化＝**パーマークが消えて体が銀白色になる**。降海は 4〜6 月ごろ。銀化は「銀白化が強まり、体側部の斑紋（パーマーク）がほとんど見えなくなる」ことと説明される。成熟した河川残留雄ではパーマークがくっきり残り、体高が高く体色が暗色化する。PROXY の一般則として移行途中の個体があり、ある調査では降海個体の 50% が完全に銀化、45% が移行期、5% が parr 様の体色（種・文書不明）。Kato (1991) は大型のアマゴ・ヤマメでは体が大きくなるとパーマークを失うと記す（F-08）。
- 適用範囲: ヤマメ／サクラマス（B）。移行割合は PROXY:サケ科一般。
- 出典: 群馬県 https://www.pref.gunma.jp/page/20806.html ／ https://www.honda.co.jp/fishing/picture-book/sakuramasu/index.html ／ https://agriknowledge.affrc.go.jp/RN/2030927242.pdf （r03 F-18 のヒット群で文書特定不能）。PROXY 移行割合の候補: McMahon et al. 1988（F-01 と同 URL）。
- 証拠: [B] 「パーマークが消えて体が銀白色になり(スモルト化)、4~6月ごろに海へと下ります」（r03 の引用）。割合は [C/PROXY]。
- 設計上の含意（推論; 資料の主張ではない）: 銀化度 s を上げるとパーマーク／背色のコントラストが下がる。ただし**パーマークが銀色層の下に隠れるのか、パーマーク自体が薄れるのか、層順序を示す資料は無い**。

### F-03
- 主張/値: 「サケ科幼魚のスモルト化の非致死的指標としての皮膚反射率（Skin reflectance as a non-lethal measure of smoltification for juvenile salmonids）」という USGS 掲載の文献が存在する。**検索要約から得られたのは題名のみで、反射率の値・波長・測定条件は未取得**。同じ「PROXY（サケ科スモルト・皮膚反射）」群として Mighell 1978 のスモルト関連資料（NWFSC）も r04 に挙げられているが、内容は未確認。
- 適用範囲: PROXY:サケ科幼魚（種不明）。
- 出典: https://pubs.usgs.gov/publication/70180320 ／ https://www.usgs.gov/publications/skin-reflectance-non-lethal-measure-smoltification-juvenile-salmonids ／ https://www.webapps.nwfsc.noaa.gov/assets/26/6745_06272011_103138_Mighell.1978-rev.pdf （r03・r04 経由）
- 証拠: [C]（題名のみ・内容未確認）。**次に検索予算が使えるとき最優先で本文要約を確認する対象**（Gap-3）。

### F-04
- 主張/値: 青森県のヤマメ（河川型）の鰭条数: **背 12–13 軟条、胸 12–14、腹 9、臀（尻）12–14**。旭川産は背 12–13、胸 13–15、腹 8–9、臀 11–14。不分枝条／分枝条の区別は要約に無い。同報告に側線鱗 118–134、パーマーク 8–10 個。
- 適用範囲: ヤマメ（河川型）／青森県の河川／n・体長範囲不明。
- 出典: 青森県産業技術センター 内水面研究所「サケ、マス保護水面管理事業に伴うサクラマス調査」https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html ／ https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf （r01 F-01・F-03 経由）
- 証拠: [A]（公的機関の報告; r01 は 3 回の独立クエリで同一数値を再現。ただし要約は機械要約で要原典確認）「背鰭条数12-13軟条、胸鰭条数12-14軟条、腹鰭条数9軟条、尻鰭条数12-14軟条、…側線鱗数118-134枚」（r01 の引用）。

### F-05
- 主張/値: 二次資料（C）の計数は幅が広く食い違う。英語の二次資料: 背鰭軟条 13–18（別資料 12–17）、臀鰭軟条 14–18（別資料 11–14／日本語資料 12–17）、胸鰭 14–17、腹鰭 9–12。Christie (1970) は腹鰭条数が少なく「大半が 10」と記す。
- 適用範囲: O. masou 種全体／サクラマス・ヤマメの混在。F-04 の青森値（背 12–13 など）と比べ**上側に広い**。河川型固有値としては F-04 を優先（r01 の判断）。
- 出典: https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/ ／ https://allfishes.org/fishes/marine/masu-salmon ／ Christie (1970) https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf （r01 §3・r02 F-05/F-06/F-07 経由）
- 証拠: [C]（Christie の腹鰭条数のみ r02 が A とした要約; 他は帰属不明）「fewer ventral fin rays (mostly 10)」（r02 の引用）。

### F-06
- 主張/値: **側線有孔鱗数**: 青森ヤマメ 118–134 枚（F-04 と同報告; A）。他に 120–140（Grokipedia=AI生成; C）、130–240（ロシア系の記述; 範囲が異常に広く外れ値の疑い; C）。単一値として 134 の記載もあるが n・範囲不明。AI百科は「円鱗は小さく脱落しやすい」「細かい鱗に覆われる」とも記す（C）。
  - **算出（本ストリーム; 仮定つき）**: 側線列が体の約 76%SL（=1−頭長 23.8%SL; 頭長比は台湾亜種 PROXY 由来で r02 が算出した仮定）に並ぶとすると、1 枚あたりの間隔は 0.76/134=0.57%SL〜0.76/118=0.64%SL（A 値）、120–140 枚なら 0.54–0.63%SL。SL 100/150/200/250 mm では約 0.57–0.64／0.86–0.96／1.1–1.3／1.4–1.6 mm。**これは列に沿った中心間隔の目安で、鱗径そのものではない**（鱗は重なる）。
- 適用範囲: ヤマメ（青森, A）／O. masou 種全体（C）。計数が有孔鱗のみか全鱗列かは未確認。
- 出典: https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf ／ https://grokipedia.com/page/Oncorhynchus_masou （r01 F-01・F-10・F-11、r02 F-06/F-07 経由）
- 証拠: [A]（118–134）／[C]（他）。「The lateral line comprises 120-140 scales…」（Grokipedia の要約, r02 の引用）。算出部分は本ストリームの計算。

### F-07
- 主張/値: **側線上横列鱗数**: サクラマス 27–32、サツキマス（アマゴ）25–34、ビワマス 21–27（日本語 Wikipedia 系・自治体資料の併記; 記述元不明）。一方 Grokipedia は "transverse scale counts 43–56" と記し、**計数基準が異なる可能性**。r01 は「背鰭起部から側線までの斜めの鱗列数」と注記。2025 年のビワマス新種記載（Fujioka et al.）は「側線上方の横列鱗が少ない」ことでマス・アマゴと区別できると記す。
- 適用範囲: サクラマス（降海型・河川型を含む種群）。ヤマメ専用の値ではない。
- 出典: https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9 ／ https://grokipedia.com/page/Oncorhynchus_masou ／ Fujioka et al. (2025) Ichthyological Research 73:188 https://link.springer.com/article/10.1007/s10228-025-01032-z （r01 F-04/F-06/F-09、r02 F-10、r04 経由）
- 証拠: [C]（27–32 は出典不明, 43–56 は AI 生成）／ビワマスとの識別の記述のみ [A]「fewer transverse scales above the lateral line」。

### F-08
- 主張/値: Kato (1991): 大型のアマゴ・ヤマメでも**体側の朱点の有無と鱗の特徴で種間差が明瞭**。大型の河川型は降海型に似るが、**尾柄高・鰭の大きさ・鱗のパターンに幼魚の特徴を残す**。鱗の特徴の具体（隆起線の本数・形など）は要約に無い。別検索で「ヤマメの鱗の隆起線が頂部で消失／不明瞭」との断片が core.ac.uk に出たが、同論文かは不明（r01）。
- 適用範囲: アマゴ・ヤマメ（福井県の河川・ダム湖の大型個体）。
- 出典: 加藤文男 (1991)「大型アマゴ・ヤマメの形態及び生態に関する知見」水産増殖 39(3):279–288. https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/ （r01 F-14／r02 F-12／r04 F-08 経由）
- 証拠: [A]「they retain juvenile characteristics in caudal peduncle height, fin size, and scale patterns compared to anadromous forms」（r01 の引用）。隆起線の断片は [C]（帰属不明）。

### F-09
- 主張/値: ヤマメの鱗は年齢査定に用いられ、北海道の河川の天然ヤマメ（「特に成長が良かった個体の例」）で、鱗の年輪間隔の計測から FL 0+:14.1 cm／1+:19.4／2+:23.2／3+:28.2 cm と報告されている。→ 本ストリームの用途は、ヤマメの鱗に**年輪（輪紋）が刻まれている**ことの間接的裏付けのみ。輪紋間隔（mm や µm）の数値は要約に無い。
- 適用範囲: 北海道の河川・ヤマメ（河川型）・良好成長個体の例。r01 F-24 は「1 個体例（a wild Yamame specimen）の可能性」、r03 F-21 は逆算体長か実測かが不明と注記。
- 出典: https://fra.repo.nii.ac.jp/record/2009718/files/sapporo_sk_3_8.pdf ／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/84947/32_p445-451_LT80.pdf （r03 F-21 経由）。r01 F-24 は別の候補 https://www.aomori-itc.or.jp/_files/00229142/247-249.pdf 。どの文書の記述かは両ストリームとも特定不能。
- 証拠: [A（r03 の評価; 水産研究機関の報告と推定）]「0+歳で14.1 cm、1+歳で19.4 cm、2+歳で23.2 cm、3+歳で28.2 cmの尾叉長」（r03 の引用）。年輪の存在の裏付けとしてのみ使用。鱗径・輪紋間隔の数値は取得できず（Gap-1）。

### F-10
- 主張/値: **体色基調**: ヤマメの背は黄褐色または暗青緑（資料間で割れる）、小黒点が散在、腹は白、体側にパーマーク 7–10 個（紫がかった色との記述あり）。降海型（サクラマス）は背が暗青〜暗緑、体側が銀白色、腹が白。**黒点は頭部を除く背部と背鰭・脂鰭・尾鰭にあり、頭部背面には無い**。降海期の個体には**背鰭先端に白色部**を持つものがある。ヤマメ（陸封）では「背部から側線にかけて黒点、背鰭・腹鰭・臀鰭・尾鰭の先端が黒い」との記述もあるが帰属未確定（C）。
- 適用範囲: ヤマメ（河川型）／サクラマス（降海型）。背鰭先端の白は降海期の記述で河川型への適用は未確認。
- 出典: https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ https://www.honda.co.jp/fishing/picture-book/yamame/ ／ https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html ／ https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html （r01 F-16、r03 F-19、r04 F-03/F-21/F-22/F-26/F-28 経由）
- 証拠: [B] 「yellowish-brown dorsal region with small black spots, white ventral region, 7-10 parr marks」「dark blue-green back and silvery body sides」（r03 の引用）。

### F-11
- 主張/値: 台湾亜種 O. m. formosanus 成魚（約 30 cm）: **頭頂は緑、眼と鰓蓋周辺は銀色、鰭は銀緑色**、体側に楕円形の暗色斑 9 個＋側線上方の小黒点 11–13 個。
- 適用範囲: **PROXY:O. m. formosanus**（台湾陸封型）。ヤマメ（masou）の値として使用不可。写真ではヤマメの鰭は半透明で橙・黄味（F-19）であり、「銀緑色の鰭」とは異なる。
- 出典: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus ／ https://www.fishbase.se/summary/16686 ／ https://lifeoftaiwan.com/nature/the-formosan-landlocked-salmon-taiwans-unique-natural-wonders-part-1/ （r04 F-04 経由）
- 証拠: [C]（r01 は C, r02 は B と評価が割れている; 保守側で C）。

### F-12
- 主張/値: 魚類の体色変化の一般機構として、背景の明るさに応じ、ホルモンと神経が色素胞に作用して色素顆粒が分散・凝集する。急な温度変化は変化速度に影響し、別の魚種では優位個体が明るい基質に馴染み従属個体が暗色になった。**ヤマメ／サケ科に特化した資料は見つかっていない**。
- 適用範囲: **PROXY:魚類一般（種不明; 一部は両生類・ハゼ類の資料の混在）**。川底色に応じたヤマメの体色変化の根拠にはならない。
- 出典: https://orb.binghamton.edu/research_days_posters_2024/52 （r03 F-27／r04 F-34 経由）
- 証拠: [C/PROXY] 「Fish can change body color in response to changes in background brightness through hormones and nervous system signals acting on chromatophores」（r03 の引用）。

### F-13
- 主張/値: (a) 降海型は遡上につれて体側の銀白色の金属光沢を失い、産卵期が近づくと雄は全体に黒ずみ、体側に不定形（雲状）の桜色斑（婚姻色）が出る。吻が伸長して下方に屈曲し、顎の歯が大きくなる。雌も婚姻色を示すが雄ほど顕著でない（PROXY:降海型サクラマス）。(b) **河川で性成熟したヤマメは体色が黒ずむが、サクラマスのように桜色にはならない**（r03 F-02; 記述元の文書は特定不能）。(c) 早熟雄（成熟した河川残留雄）は体高が高く、体色が暗色化し、パーマークが未成熟魚よりくっきり見える（r03 F-05）。
- 適用範囲: (a) PROXY:降海型サクラマス。(b) ヤマメ（河川型）成熟個体。(c) 河川残留早熟雄。写真側では spawning_male のヤマメ判定 3 枚（p012, p034, p035）が「橙黄土〜銅桃褐の体側」「赤褐〜桃銅の側帯」「桃〜ラベンダーの染み」と記述し（p035 は low）、(b) の「桜色にならない」と程度の面で食い違う（§3-12）。
- 出典: (a) https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf ／ https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html （r03 F-01）。(b) 関・小島 (1977) 水産増殖（候補）https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja ほか（r03 F-02）。(c) https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_16-00006/_article/-char/ja/ （候補; r03 F-05）。写真は catalog_c0x.json（p012, p034, p035）。
- 証拠: [B]（r03 の評価。いずれも記述元の文書は特定不能）／写真記述は [C]。

---

### Part B — 写真カタログ（70 枚）からの集計　【すべて証拠ランク C】

> 出典は `docs/yamame/photo_analysis/catalog_c01.json〜catalog_c07.json`（各写真の `source_url` を含む）。記述は AI による目視で、画像内座標・px 値はスケールが不明なため**絶対長に変換できない**。集計はヤマメ判定（`species_ident.label=="yamame"`）57 枚を主とし、必要に応じて 70 枚全体の数を併記する。キーワード集計は粗く、同一写真が複数項目に数えられる。写真は PROXY ではなくヤマメ本体だが、アマゴ疑い（5 枚）・同定不明（5 枚）などが混在する。

### F-14
- 主張/値: 70 枚の内訳は context が ground 19／landing_net 13／in_water_natural 12／aquarium 11／hand 10／other 5。色・光の信頼度は **high 3／med 38／low 29**（high は p019=アマゴ疑い、p020=種 other、p053=ヤマメ）。ヤマメ判定 57 枚では high 1（p053）／med 33／low 23。→ **水中の自然光で高信頼の側面写真が事実上無い**ため、写真集計から水中の質感・色を決め切れない。
- 適用範囲: 収集した 70 枚（ウェブ画像）。
- 出典: catalog_c01〜c07.json（個別 URL は §5 の表）。
- 証拠: [C] カタログ記載の信頼度の集計。

### F-15
- 主張/値: **鱗の視認性**（`skin.scales_visible`）: 70 枚中 55 枚で True。文脈別（70 枚）: ground 18/19、hand 10/10、landing_net 11/13、other 5/5、aquarium 7/11、**in_water_natural 4/12**。ヤマメ判定 57 枚では、空気中（ground／landing_net／hand／other の 39 枚）で **37 枚**、水中・水槽（18 枚）で **8 枚**（自然水中 2/9、水槽 6/9）。
- 適用範囲: 収集写真。水中で鱗が見えにくいのは、解像度・屈折歪み・水膜の有無・被写体距離の違いも寄与する（写真側の注記: p005, p006, p007, p036, p054 など）。
- 出典: catalog_c01〜c07.json。
- 証拠: [C]。→ 鱗の微細パターンは「近距離の高品質描画（High LOD）で出す要素」とする根拠。

### F-16
- 主張/値: **鱗の見え方**: 菱形（斜め）格子または点状の明暗として記述（70 枚全体で、光沢・反射の欄に「格子」の語を含む写真 32 枚、「菱形」3 枚）。例: 「鱗の菱形格子が約10px間隔で見える」(p024)、「鱗縁のハイライトが白い点列として明瞭」(p002)、「鱗の凹凸は大きくなく、極小さい」(p049)、「規則的な菱形の鱗格子が全体に見える（間隔約5–6px）」(p029)、「細かい鱗の凹凸感」(p022)、「体側は鱗1枚ごとの点状の鏡面反射が規則的に並ぶ（中心間隔 ≈8–9px、体高約220pxの約1/25）」(p042)。**唯一、絶対比に変換できる p042**: 体高の約 1/25〜1/27。体高≈22%SL（仮定）なら中心間隔 ≈0.8–0.9%SL。パーマーク内にも鱗の格子が重なる記述あり（p035, p057）。
- 適用範囲: 写真の px 値は撮影距離・解像度依存で、p042 以外は絶対比に変換不能。p042 は水槽内の成魚（adult_nonspawning）、反射点の間隔であり鱗ピッチそのものとは限らない。
- 出典: catalog_c01〜c07.json（p002, p022, p024, p029, p035, p042, p049, p057 の個別 URL は §5）。
- 証拠: [C]。→ F-06 の 0.54–0.64%SL との差は矛盾-2。

### F-17
- 主張/値: **光沢の種類と空気中／水中の差**（ヤマメ判定 57 枚; キーワード集計）。
  | 区分 | n | 「濡れ・艶・水膜」語 | 線状・帯状・水膜ハイライト語 | マット／サテン／拡散語 |
  |---|---|---|---|---|
  | 空気中（ground, landing_net, hand, other） | 39 | 34 | 15 | 8 |
  | 水中・水槽 | 18 | 6 | 3（自然水中 3, 水槽 0） | 10（自然水中 3, 水槽 7） |
  代表: 空気中=背縁沿いの白〜空色の線状ハイライト（水膜）、鰓蓋の銀白〜真珠状の面反射、鱗1枚ごとの点状ハイライト（p033, p042, p047）。水中・水槽=「つや消しに近いサテン調」(p023)、「体表の鏡面反射は見えない」(p026)、「体表はマットで柔らかな光沢」(p014, p015)、水槽照明・ガラス反射の混入。一方、空気中でも曇天の個体は「サテン調で鏡面ではない」(p024, p025)と、光環境・水膜量・HDR/シャープ処理（p011, p055 が明記）で見え方が大きく変わる。
- 適用範囲: 収集写真。撮影者の画像処理・露出の影響を除けない。
- 出典: catalog_c01〜c07.json。
- 証拠: [C]。物理的な裏付けは F-28（M）。

### F-18
- 主張/値: **虹色・構造色・真珠光沢の言及**: 70 枚中 6 枚（p019 鰓蓋に青紫の光沢＝アマゴ疑い・high／p022 鰓蓋に銀紫の金属光沢＋背〜体側境界に空色の鏡面帯／p031 体側の桃〜金色が角度依存の構造色成分を含む可能性＝同定不明／p043 銀色光沢と「虹色の干渉色（青紫〜桃）」／p062 鰓蓋・腹側の真珠状の虹彩光沢／p065 項の鱗列に沿う真珠状の白点＝同定不明）。ヤマメ判定は p022, p043, p062 の 3 枚。主に鰓蓋・腹側・体側境界で、全身が虹色になる記述は無い。
- 適用範囲: 収集写真（フラッシュ・HDR・色かぶりの混入あり）。
- 出典: catalog_c01〜c07.json（p019, p022, p031, p043, p062, p065 の URL は §5）。
- 証拠: [C]。→ 銀色成分は無彩色寄りで、角度依存の紫〜桃の色味は弱い付加成分とする根拠（F-24/F-25 の物理と整合）。

### F-19
- 主張/値: **鰭の透明度・色・鰭条**（ヤマメ判定 57 枚; キーワード集計）。
  | 鰭 | 「透明/半透明」 | 黄 | 橙 | 暗/黒 | 鰭条が見える | 前縁・外縁が白（明示） | 同定不能 |
  |---|---|---|---|---|---|---|---|
  | 胸鰭 | 34 | 31 | 24 | 12 | 17 | 6 | 2 |
  | 腹鰭 | 33 | 10 | 11 | 5 | 14 | 14 | 4 |
  | 臀鰭 | 38 | 5 | 4 | 2 | 4 | 19 | 2 |
  | 背鰭 | 31 | 2 | 4 | 21 | 15 | 7 | 6 |
  | 尾鰭 | 23 | 3 | 18 | 25 | 9 | — | 16 |
  | 脂鰭 | 5 | — | 4 | 7 | — | — | **31** |
  代表: 胸鰭「橙黄色(196,152,82)」(p001)、「鮮やかな琥珀〜橙黄(191,152,68)」(p013)、前縁に暗帯(p033, p034)。腹鰭・臀鰭「半透明、白い前縁」(p009)、「前縁が白く鰭条明瞭」(p032)、基部が橙・黄橙(p003, p020)。背鰭「半透明で暗い鰭条」「白い先端」(p016, p029)。**脂鰭は 57 枚中 31 枚で同定不能**。
- 適用範囲: 収集写真。「白」語は青白・淡白を含み、前縁白の明示は右から2列目の件数。アマゴ疑い・同定不明を除いたヤマメ判定のみの集計。色名は色かぶり（網の色・青かぶり）の影響を受ける。
- 出典: catalog_c01〜c07.json。
- 証拠: [C]。r04 F-42（記憶; 「腹鰭・臀鰭の前縁が白いかは確証なし」）を、写真側が約 1/4（腹鰭）〜1/3（臀鰭）の個体で支持。

### F-20
- 主張/値: **尾鰭下葉縁・基部の赤〜橙**: ヤマメ判定 57 枚中 **16 枚**で下葉（縁）が橙・赤・赤褐・ピンク橙などと記述（p002, p003, p008, p009, p012, p024, p028, p033, p034, p035, p041, p047, p049, p052, p053, p060）。信頼度 high の p053: 上葉は褐橙の半透明(145,118,72)、下葉は橙赤(184,124,79)で下縁が最も濃い。p019（アマゴ疑い・high）も下葉下縁が橙赤（中央値≈(136,97,81)〜(156,108,78)）。他に尾鰭基部が橙褐（p001）。「暗」「黒」の語を含む尾鰭の記述は 25 枚で、全体は灰褐〜暗褐の半透明で縁が暗色の記述が多い。切れ込みは浅い二叉が多く、p049 は切れ込み深さ約 5%SL と記す。
- 適用範囲: 収集写真。橙・琥珀色の網（p048, p064 など）や木漏れ日による色かぶり、釣り上げ後の状態を除外できない。アマゴ疑い（p019, p057, p070）にも類似記述。
- 出典: catalog_c01〜c07.json。
- 証拠: [C]。

### F-21
- 主張/値: **皮膚の損傷・粘液剥離**: p044（post_spawn, landing_net）「粘液が剥がれ、白い擦過斑（鱗／表皮の損傷または水カビ様）が不規則に付く」、p045（spawning_male）「表皮が剥がれた白い擦過斑が多数、粘液の艶は弱い」、p021（hand, 半水没）「白い擦過状の粘液筋が体側に複数」。いずれも産卵期後の個体または取り込み・手持ちの個体。
- 適用範囲: 3 枚の収集写真（低〜中信頼）。
- 出典: catalog_c01〜c07.json（p021, p044, p045）。
- 証拠: [C]。→ 繁殖期雄・取り込み後の個体用の任意オーバーレイ（擦れ・粘液剥離）の根拠。

---

### Part C — 調査員の記憶（M: 未検証）と、M の入力による数値計算

> 以下は**検索で確認できていない**。文献名は記憶に基づく検証用リードで、題名・巻頁に誤りがありうる。計算はすべて「理想化（無損失・平行平板・散乱なし・下層のメラニン吸収なし）」で、実在の皮膚より反射が高く出る。

### F-22
- 主張/値: 魚類の銀白色（体側・腹側の金属光沢）は、虹色素胞（iridophore）内で**薄板状のグアニン結晶（生体由来の無水グアニン）が細胞質をはさんで積層した多層膜反射体**による、というのが古典的な説明。結晶は面内の屈折率が高く（n≈1.8 台; 記憶の値は 1.83）、細胞質（n≈1.33–1.37）との屈折率差で干渉反射を生む。各層の**光学厚み n·d が反射波長の約 1/4** のとき強め合う。計算上の四分の一波長厚み（λ0=550 nm）は、グアニン n=1.83 で d=75 nm、細胞質 n=1.34 で d=103 nm。実在の魚の結晶の厚み・間隔・枚数は魚種・部位で異なり、**サケ科の値は不明**。
- 適用範囲: 魚類一般（銀色魚の研究が中心）。ヤマメ／サケ科への直接の適用は未確認。
- 出典: なし（記憶）。検証用リード（URLなし）: Denton & Land (1971) "Mechanism of reflexion in silvery layers of fish and cephalopods", Proc. R. Soc. Lond. B 178:43–61／Land (1972) "The physics and biology of animal reflectors", Prog. Biophys. Mol. Biol. 24:75–106／Denton & Nicol (1966) "A survey of reflectivity in silvery teleosts", J. Mar. Biol. Assoc. UK 46:685–722／Denton (1970) Phil. Trans. R. Soc. B 258:285–313（銀色反射体の配置）。サケ科スモルトの皮膚グアニン: Johnston & Eales (1967)（アトランティックサーモン; 題名は記憶）。
- 証拠: [M] 記憶。部分的に F-01（スモルトでグアニン増加）と整合。

### F-23
- 主張/値: **理想的な四分の一波長積層の反射率（転送行列計算）**。条件: n_グアニン=1.83（d=75.1 nm）、n_細胞質=1.34（d=102.6 nm）、周囲も n=1.34、λ0=550 nm、垂直入射、N=グアニン／細胞質の対の数。
  | N | R(550 nm) | R(450 nm) | R(650 nm) |
  |---|---|---|---|
  | 2 | 0.31 | 0.19 | 0.25 |
  | 4 | 0.72 | 0.08 | 0.42 |
  | 6 | 0.91 | 0.08 | 0.31 |
  | 10 | 0.99 | 0.00 | 0.18 |
  | 20 | 1.00 | 0.00 | 0.38 |
  - 単一界面のフレネル反射（垂直）: グアニン/細胞質 2.4%、空気/水 2.04%、空気/粘液(n=1.34) 2.11%、**水(1.333)/粘液(1.34) 7×10⁻⁶**、水/表皮（n=1.38 を仮定）3×10⁻⁴。
  - → **数対（4〜6 対）の積層で、ピーク波長で 7〜9 割の反射**が理想的には得られる。実際の枚数・厚みは不明（Gap-2）。単一間隔の積層の反射帯は狭く（上表で 450 nm・650 nm は低い）、単独では「色付き」になる。
- 適用範囲: 計算（M の屈折率入力）。実測ではない。
- 出典: 本ストリームの計算（セッションの scratchpad 上の使い捨てスクリプト tmm.py による転送行列法; 垂直入射・平行平板・無損失。入力値は本文に全て記載した F-22 の記憶値で、再現可能）。
- 証拠: [M（計算）]。

### F-24
- 主張/値: **角度・偏光依存**（N=10 の単一間隔積層, 内部入射角 θ は媒質内の角度; 水中観察では外側の水と n がほぼ等しく、水中の見込み角にほぼ等しい）。
  | θ | s偏光のピーク波長 | p偏光のピーク反射率 |
  |---|---|---|
  | 0° | 550 nm | 0.99 |
  | 20° | 525 nm | 0.99 |
  | 40° | 455 nm | 0.87 |
  | 60° | ≤380 nm（計算範囲の下限; 紫外側へ） | 0.18 |
  - → 単一間隔の積層は、**斜めから見るほど青側へシフトし、p偏光の反射が落ちて強く偏光する**。したがって「虹色の干渉色」をそのまま体側全面に使うと、実物の銀色（広帯域・無彩色）とは異なる見た目になる。
- 適用範囲: 計算（M）。
- 出典: 本ストリームの計算（F-23 と同じ）。
- 証拠: [M（計算）]。

### F-25
- 主張/値: 魚は広帯域・無偏光に近い銀色を、**間隔（厚み）の異なる積層を重ねる**／結晶の傾きを持たせる、といった構造で実現するとされる（記憶）。計算例: グアニン／細胞質 20 対で四分の一波長中心を 450→650 nm に線形に変えた（チャープ）積層は、R=0.16(400 nm)、0.59(425)、0.81(450)、0.96(475)、0.99(500)、1.00(525–600)、0.97(625)、0.93(650)、0.77(675)、0.41(700) と**可視域のほぼ全体で高反射**になる（理想化）。さらに、体側の反射体は皮膚面に対して傾き、側方の環境を映す「垂直ミラー」として働くという考えが海産銀色魚（ニシン類など）で提唱されている（Denton）。サケ科の河川魚でこの傾きが同様かは不明。
- 適用範囲: 魚類一般（主に海産遊泳魚）。ヤマメの河川環境への適用は未確認。
- 出典: なし（記憶）。検証用リード: Jordan, Partridge & Roberts (2012) "Non-polarizing broadband multilayer reflectors in fish", Nature Photonics 6:759–763／Denton (1970) Phil. Trans. R. Soc. B 258:285–313。計算は本ストリーム。
- 証拠: [M]（機構の記述）／[M（計算）]（チャープ例）。→ 実装上は、銀色成分を**無彩色・広帯域の環境反射（環境マップを反映）**として持ち、角度による緩い色味（F-18）と偏光は基本無視、とする案（設計案）。

### F-26
- 主張/値: **皮膚の色の層構造と対陰影**（記憶）。表皮は生きた細胞からなる薄い半透明の層（粘液細胞を含む）で、体色は主に真皮の色素胞（メラニン色素胞=黒、黄色素胞/赤色素胞=黄〜橙〜赤、虹色素胞=銀・構造色）の配置で決まる。背側は暗色（メラニン）が優勢、腹側は色素が少なく白〜銀の反射・散乱で明るく、体側は銀の反射が優勢という**対陰影（countershading）**の配置が一般的。サケ科の層順序（表面側から何の色素胞が並ぶか）、各色素胞の密度、パーマーク・朱点を作る色素の種類は未確認。
- 適用範囲: 魚類一般。ヤマメ固有の確認なし。
- 出典: なし（記憶）。検証用リード: Thayer (1896) Auk 13:477–482（対陰影の古典）／Rowland (2009) Phil. Trans. R. Soc. B 364:519–527（対陰影総説）／Fujii (2000) Pigment Cell Res 13:300–319（色素胞の運動）／Kelsh (2004) Pigment Cell Res 17:326–336（魚の色素パターン）。
- 証拠: [M]。体色の記述（暗青緑〜褐の背、銀白の体側、白い腹）は F-10（B）と整合。

### F-27
- 主張/値: **サケ科の鱗の構造**（記憶）。円鱗（cycloid）で、骨質の外層と膠原線維の板からなる弾性鱗。鱗は真皮の鱗嚢に収まり**表皮で覆われて皮膚に埋没**し、後縁を向けて瓦状に重なる。配列は斜めの列（体表で菱形格子に見える; F-16 と整合）。鱗の表面には成長に伴う同心円状の隆起（circuli）があり、年輪（annulus）が形成される（年齢査定に利用; F-09 と整合）。鱗は体長に比例して大きくなる。→ **鱗は立体的な凹凸ではなく、鱗縁・隆起線・下の銀色層の明暗として見える**。サケ科の鱗が現れる体長、鱗径(mm)／体長の関係、隆起線の間隔は未確認。
- 適用範囲: 硬骨魚類（サケ科）一般。ヤマメ固有値なし。
- 出典: なし（記憶）。検証用リード: Sire & Akimenko (2004) "Scale development in fish: a review…", Int. J. Dev. Biol. 48:233–247（題名は記憶）。
- 証拠: [M]。「鱗を巨大な凹凸として表現しない」という仕様方針（依頼文）と、F-15/F-16 の写真記述（凹凸は極小）が整合。

### F-28
- 主張/値: **粘液・表皮の光学**（記憶＋物理計算）。魚の粘液は大部分が水とムチンで、屈折率は水に近い（n≈1.33–1.35 と考えられる）。表皮も半透明。このため:
  - **水中**: 水と粘液・表皮の界面の屈折率差がほぼ無く、その界面の鏡面反射はほぼゼロ（F-23: 7×10⁻⁶〜3×10⁻⁴）。水中の「光沢」はその下の**銀色層（虹色素胞）の反射**であり、表面のクリアコートではない。
  - **空気中（釣り上げ・水面上）**: 水膜・粘液と空気の界面に鏡面反射（垂直 2.0%、入射角 60° で 6%、70° で 13%、80° で 35%、85° で 58%; 非偏光, n=1.333 の計算）が加わり、背縁沿いの線状ハイライトや点状の水滴ハイライトを作る（F-17 と整合）。
  - 粘液の**厚み（µm）、屈折・散乱の実測値、乾燥時の見え方の差は未確認**（Gap-5）。
- 適用範囲: 物理的推論（M）。粘液の厚みなどは未確認。
- 出典: なし（記憶）。フレネル計算は本ストリーム。
- 証拠: [M（計算＋推論）]。写真集計（F-17: 水中・水槽でマット〜サテン 10/18）と方向が一致するが、写真は照明・画像処理に依存。

### F-29
- 主張/値: **鰭膜と鰭条**（記憶）。サケ科の背鰭・臀鰭・胸鰭・腹鰭・尾鰭は、分節し先端が分枝する軟条（鰭条）と、その間の薄い鰭膜からなる。鰭条は左右 1 対の半条（hemitrichia）からなる。脂鰭は鰭条を持たない肉質の突起。鰭膜は薄く半透明で、色素（黄〜橙）は鰭条に沿って／基部に集まる傾向がある（写真 F-19・F-20 と整合）。**鰭膜の厚み（µm）、鰭条の分枝パターン、不分枝条の本数、色素胞の分布は未確認**。
- 適用範囲: 条鰭類・サケ科一般。ヤマメ固有値なし。
- 出典: なし（記憶）。検証用リード（鰭の力学・構造）: Alben, Madden & Lauder (2007) "The mechanics of active fin-shape control in ray-finned fishes", J. R. Soc. Interface 4:243–256。
- 証拠: [M]。鰭条数のみ F-04（A）。

### F-30
- 主張/値: **水中・水面の光学**（記憶＋物理計算）。
  - 純水の吸収係数 a [m⁻¹]（記憶の値; Smith & Baker 1981 と Pope & Fry 1997 で細部が異なり、どの値がどちらの出典かは特定できない; ±10% の不確かさとして扱う）: 500 nm≈0.020、550≈0.064、600≈0.22、650≈0.34、700≈0.62。1/e 深さは約 49／16／4.5／2.9／1.6 m。
  - 透過率（純水, 計算）: 0.5 m で 500/550/600/650/700 nm = 0.99/0.97/0.89/0.84/0.73、1 m で 0.98/0.94/0.80/0.71/0.54、3 m で 0.94/0.83/0.51/0.36/0.15。
  - 自然の渓流は溶存有機物（CDOM）と懸濁粒子の吸収・散乱が加わり、青側の減衰が強く、緑〜黄褐色に偏る傾向（一般則; 渓流の実測値は未確認）。
  - 水面直下の光は、屈折率 1.333 の水面で臨界角 48.6°、**スネルの窓は全角 97.2°**。窓の外側は全反射で水底や周囲を映す。水中から水面（水→空気）の非偏光フレネル反射は入射角 45° で約 14%、48° で約 43%、49° 以上で全反射（計算）。
  - 水面上から見ると、屈折により水深は paraxial では実深度の 1/1.333≈0.75 に見える（物理）。
- 適用範囲: 純水＋一般則。日本の渓流水の実測は無い（Gap-8）。
- 出典: なし（記憶）。検証用リード: Pope & Fry (1997) "Absorption spectrum (380–700 nm) of pure water. II. Integrating cavity measurements", Appl. Opt. 36:8710–8723／Smith & Baker (1981) "Optical properties of the clearest natural waters (200–800 nm)", Appl. Opt. 20:177–184／Kirk "Light and Photosynthesis in Aquatic Ecosystems"／Lythgoe (1979) "The Ecology of Vision"。透過率・フレネルは本ストリームの計算。
- 証拠: [M（記憶値の計算）]。

---

## 3. 資料間の矛盾・不一致

1. **側線有孔鱗数**: 青森ヤマメ 118–134（A）／Grokipedia 120–140（C）／ロシア系 130–240（C; 異常に広く外れ値の疑い）／単一値 134。種・地域・計数法（有孔鱗のみか全鱗列か）が異なる可能性。 [F-06]
2. **鱗の間隔の推定値**: 側線列の算出 0.54–0.64%SL（仮定: 列長 0.76SL）と、写真 p042 の反射点間隔 ≈0.8–0.9%SL（仮定: 体高 22%SL）は約 1.4〜1.6 倍の差。有孔鱗列と体側上部の鱗、反射点間隔と鱗ピッチ、個体差、仮定（列長・体高比）の違いによる可能性があり、本ストリームでは解消できない。 [F-06][F-16]
3. **側線上横列鱗数**: 27–32（サクラマス; 出典不明, C）と 43–56（AI百科, C）。数え方（背鰭起部から側線までの斜列か、別の計数か）が不明。 [F-07]
4. **背の基調色**: 暗青緑（Q11 系）と黄褐色（Q20 系）。個体差・光環境・サイズ差か不明（r03）。写真集計では背側の暗褐色（p001 など）の記述が多い。 [F-10]
5. **鰭の色**: 台湾亜種（PROXY）の「銀緑色の鰭」（C）と、ヤマメ写真の半透明で橙・黄味の胸鰭、灰褐の尾鰭（C）は異なる。亜種差または光環境の差。 [F-11][F-19]
6. **尾鰭の下葉縁の赤橙**: 写真では約 28% に出現するが、B 資料（自治体・図鑑）の要約には現れない。色かぶり・撮影状況（網の色）・アマゴ交雑の可能性を除外できない。 [F-20][F-10]
7. **腹鰭・臀鰭の前縁の白**: r04 F-42（記憶）は「確証なし」、写真は腹鰭 14/57・臀鰭 19/57 で明示。記憶より写真を優先してよいが、イワナ類（白い鰭縁が標準）との混同の可能性は写真側の同定精度に依存。 [F-19]
8. **銀化の程度とグアニン量**: 見た目の銀化はグアニンの量と必ずしも相関しない（F-01, 要約記述）。「グアニン結晶沈着＝銀化の原因」の一般則（PROXY）と、量と外観の非直線性は同時に成り立ちうるが、どの変数（結晶の配向・層の整い・厚み・枚数）が外観を決めるかは資料が無い。 [F-01][F-22]
9. **パーマークの消失とサイズ**: Kato (1991) は大型個体で消えると記し、神奈川県は成魚にも見られると記す（r04）。「成魚」の定義（小型成熟魚か大型魚か）の差と考えられるが未確認。銀色層との関係は不明。 [F-02][F-08]
10. **水中と空気中の光沢**: 水中・水槽でマット〜サテンが優勢、空気中で艶が優勢という傾向（C）は物理的説明（M）と整合するが、写真の画像処理（HDR・シャープ）や露出の影響が混入し、絶対的な結論にはできない。 [F-17][F-28]
11. **水中の見え方の記憶と写真**: r04 F-43（記憶）の「水中ではパーマークが暗い青灰色」「側面の銀白成分が環境色を映す」を裏付ける写真記述は、本ストリームでは確認できていない（水中の高信頼写真が無いため; F-14）。
12. **河川型ヤマメ成熟雄の婚姻色**: B 資料（r03 F-02）は「黒ずむが桜色にはならない」、写真（p034 銅〜桃褐＋赤褐〜桃銅の側帯, p035 桃〜ラベンダーの染み[low], p012 橙黄土）は桃〜銅色の色味を示す。色かぶり・HDR 処理・個体差・「桜色」の定義の差のいずれかで、解消できない。 [F-13]

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル／アニメ／行動実装に必要だが確認できなかった事項

> 凡例: 優先度 最高／高／中。「暫定」欄は本ストリームが提示できる代替（出典は M または C で、仕様には『仮定』と明記すること）。

| ID | 項目 | 優先度 | 暫定（根拠ランク） |
|---|---|---|---|
| Gap-1 | **サケ科（ヤマメ）の鱗径（mm）／体長、領域別の鱗の大きさ・密度、埋没度（皮膚中の深さ）、輪紋（circuli）の間隔、鱗の出現体長** | 高 | 側線有孔鱗列の中心間隔 0.54–0.64%SL（F-06, 仮定つき）、写真 p042 ≈0.8–0.9%SL（F-16）。鱗径は列間隔より大きい（重なる）が比は不明 |
| Gap-2 | **グアニン結晶層の厚み・枚数・間隔・配向、反射スペクトル（サケ科・ヤマメ）、偏光特性** | 最高 | 四分の一波長モデルの計算（F-23〜F-25; M）。実測無し |
| Gap-3 | **皮膚反射率の測定値（背・体側・腹の反射スペクトル、BRDF）**。USGS の「皮膚反射率によるスモルト化指標」（F-03）は題名のみ取得 | 最高 | なし（写真の色サンプルは別ストリーム）。次回は F-03 の本文要約確認が最優先 |
| Gap-4 | 偏光反射（サケ科の体側）が実在するか、強さ | 中 | F-24（M, 単一間隔積層の計算）。実装では無視可能 |
| Gap-5 | **粘液層の厚み（µm）・屈折・散乱、表皮の厚みと透明度、乾燥時（空気中で乾いた皮膚）の見え方の違い** | 高 | F-28（M; 屈折率は水に近い）。写真 F-17/F-21（C）。厚みの数値なし |
| Gap-6 | **鰭膜の厚み、鰭条の分枝構造・不分枝条本数、色素（黄〜橙）の分布、前縁の白の位置**。鰭条数は F-04（A）のみ | 高 | 写真 F-19/F-20（C）。厚みは仮定 |
| Gap-7 | **脂鰭の形状・色・位置・大きさ**（写真で 57 枚中 31 枚が同定不能） | 高 | 鰭条を持たない（M）。形状は別ストリーム／高解像度側面写真で確認 |
| Gap-8 | **日本の渓流水（清流）の吸収・散乱スペクトルと拡散減衰係数 Kd、水中の分光照度**、水面からの屈折下の見え方の実写比較 | 最高 | 純水値（F-30; M）のみ。CDOM・濁りの定量は無し |
| Gap-9 | メラニン・黄／赤色素胞の層順序と密度、パーマークと朱点を作る色素の種類、パーマークが銀色層の上か下か | 高 | F-26（M; 一般論）。パーマークの視認性と銀化度の関係は F-02（B） |
| Gap-10 | 銀化度 s（段階・サイズ・季節）と外観パラメータの定量関係。河川型ヤマメ成魚の体側の銀の強さの測定 | 高 | F-01/F-02（B）, 写真 F-14〜F-19（C） |
| Gap-11 | 鱗の隆起線の本数・形（ヤマメ／アマゴの識別形質とされる; Kato 1991 と Fujioka 2025 が示唆） | 中 | 内容不明（F-07/F-08） |
| Gap-12 | 水中の高信頼写真（偏光フィルタなし／あり、スケール付き、近接マクロ）が無い。70 枚中 high は 3 枚で、水中の自然光の側面写真は実質なし | 高 | F-14。写真ストリーム側の追加収集が必要 |
| Gap-13 | 腹側や鰓蓋の半透明・皮下散乱（SSS）の寄与の資料 | 中 | なし |
| Gap-14 | 鱗サイズ・鰭条数・パーマークなどの**個体差の分布形（平均±SD, 相関）** | 高 | 鰭条数は範囲のみ（F-04, F-05）。SD なし |

### 次回、検索予算が使える場合の優先クエリ案（日英）
1. `Skin reflectance as a non-lethal measure of smoltification for juvenile salmonids`（本文要約: 波長・反射率の値）
2. `salmon smolt skin guanine crystals thickness iridophore layers Johnston Eales`
3. `Denton Land mechanism of reflexion in silvery layers of fish`／`Jordan Partridge Roberts non-polarizing broadband multilayer reflectors fish`
4. `rainbow trout OR brown trout scale length mm fork length scale size relationship`／`salmonid scale development first scale appearance body length`
5. `trout skin mucus layer thickness µm`／`fish epidermis thickness trout skin histology`
6. `trout fin membrane thickness fin ray branching hemitrichia salmonid`／`adipose fin salmonid structure no rays`
7. `clear stream water spectral attenuation CDOM Kd mountain stream underwater light spectrum`
8. `ヤマメ 鱗 隆起線 アマゴ 識別`（allowed: jstage.jst.go.jp, cir.nii.ac.jp）／`サクラマス 銀毛 グアニン 皮膚 北大 水産学部 研究彙報`
9. `countershading fish skin reflectance dorsal ventral trout`／`salmonid skin colour carotenoid xanthophore pteridine parr mark melanophore`

---

## 5. 出典一覧（URL付き。重複排除）

> 注: **以下の URL は r01〜r04 の本文または写真カタログに記載されたもので、本ストリームでは取得・再確認していない**。r01〜r04 で「候補」「帰属不明」とされたものは §2 の各 Finding の注記に従う。Part C の文献名は URL 無しの記憶リード（§2 F-22〜F-30）。

### 5.1 文献・資料（二次引用）
- 青森県産業技術センター 内水面研究所 サクラマス調査報告 — https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf
- 青森県産業技術センター 水産上重要な魚類 — https://www.aomori-itc.or.jp/soshiki/suisan_sougou/useful/kaisangyorui/jyuuyougyorui.html
- 青森県産業技術センター（旭川） — https://www.aomori-itc.or.jp/_files/00226059/372-384.pdf
- 北大水産学部研究彙報 21(2):123–127 — https://eprints.lib.hokudai.ac.jp/repo/huscap/all/23419/21(2)_P123-127.pdf
- McMahon et al. (1988) J. Fish Biol.（PROXY） — https://ougfc.montana.edu/mcmahon/documents/McMahon_et_al-1988-Journal_of_Fish_Biology%201.pdf
- USGS 皮膚反射率スモルト化指標（題名のみ） — https://pubs.usgs.gov/publication/70180320
- USGS（同題名の別ページ） — https://www.usgs.gov/publications/skin-reflectance-non-lethal-measure-smoltification-juvenile-salmonids
- Mighell (1978) NWFSC（内容未確認） — https://www.webapps.nwfsc.noaa.gov/assets/26/6745_06272011_103138_Mighell.1978-rev.pdf
- 加藤 (1991) 水産増殖 39(3):279–288 — https://www.jstage.jst.go.jp/article/aquaculturesci1953/39/3/39_3_279/_article/-char/ja/
- Fujioka et al. (2025) Ichthyological Research 73:188 — https://link.springer.com/article/10.1007/s10228-025-01032-z
- Grokipedia（AI生成; C） — https://grokipedia.com/page/Oncorhynchus_masou
- 日本語 Wikipedia「サクラマス」（C） — https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9
- Christie (1970) Review of the Japanese salmons — https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf
- marinelifeid（C） — https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/
- allfishes（C） — https://allfishes.org/fishes/marine/masu-salmon
- 北海道立総合研究機構（HRO）サクラマス — https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 本田技研 魚図鑑 ヤマメ — https://www.honda.co.jp/fishing/picture-book/yamame/
- 本田技研 魚図鑑 サクラマス — https://www.honda.co.jp/fishing/picture-book/sakuramasu/index.html
- 北海道庁 — https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
- 島根県 — https://www.pref.shimane.lg.jp/industry/suisan/shinkou/kawa_mizuumi/seibutu/yamame.html
- 群馬県 — https://www.pref.gunma.jp/page/20806.html
- 農研機構 AgriKnowledge — https://agriknowledge.affrc.go.jp/RN/2030927242.pdf
- 台湾亜種 Wikipedia（PROXY） — https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus
- FishBase（台湾亜種ページ; PROXY） — https://www.fishbase.se/summary/16686
- Life of Taiwan（PROXY） — https://lifeoftaiwan.com/nature/the-formosan-landlocked-salmon-taiwans-unique-natural-wonders-part-1/
- 魚類の体色変化の一般機構（PROXY） — https://orb.binghamton.edu/research_days_posters_2024/52
- ヤマメの鱗年輪による年齢別体長（候補） — https://fra.repo.nii.ac.jp/record/2009718/files/sapporo_sk_3_8.pdf
- 同（候補） — https://eprints.lib.hokudai.ac.jp/repo/huscap/all/84947/32_p445-451_LT80.pdf
- 同（r01 の候補） — https://www.aomori-itc.or.jp/_files/00229142/247-249.pdf
- 関・小島 (1977) 吾妻川起源ヤマメの銀毛化変態と成熟（候補） — https://www.jstage.jst.go.jp/article/aquaculturesci1953/25/2/25_2_50/_pdf/-char/ja
- サクラマス雄の生活史型と産卵環境（候補; 早熟雄の体色） — https://www.jstage.jst.go.jp/article/suisan/advpub/0/advpub_16-00006/_article/-char/ja/

### 5.2 写真（本文で個別に引用した写真のみ。全 70 枚の `source_url` は catalog_c01〜c07.json）
| ID | 判定 | context | 信頼度 | URL |
|---|---|---|---|---|
| p001 | yamame | ground | med | https://www.ana.co.jp/travelandlife/article/000941/ |
| p002 | yamame | landing_net | med | https://anglers.jp/catches/4687440 |
| p003 | yamame | landing_net | med | https://anglers.jp/catches/5841529 |
| p008 | yamame | hand | low | https://web.tsuribito.co.jp/suburb/chichibu-yamame1806 |
| p009 | yamame | ground | med | https://zukan.com/fish/leaf94673 |
| p012 | yamame | landing_net | med | https://remix-com.amebaownd.com/posts/34118208/ |
| p014 | yamame | aquarium | low | https://ameblo.jp/hiyokomushi2/entry-12076486309.html |
| p015 | mixed_multiple | aquarium | low | https://note.com/kitasato_labo/n/n13a42411146a |
| p017 | yamame | aquarium | low | https://plaza.rakuten.co.jp/nekomac/diary/202506270002/ |
| p018 | yamame | aquarium | low | https://www.gao-aqua.jp/blog/18889.html |
| p019 | amago_or_hybrid_suspect | in_water_natural | high | https://web.tsuribito.co.jp/suburb/keiryu-trbt-201904-seitai-01 |
| p020 | other | hand | high | https://smogeru2020.seesaa.net/article/499633710.html |
| p021 | yamame | hand | low | https://ameblo.jp/alpschar/entry-12680633028.html |
| p022 | yamame | hand | med | https://www.honda.co.jp/fishing/news/news-20210330/ |
| p023 | yamame | in_water_natural | med | https://ameblo.jp/sagaminotsurisi/entry-12887824774.html |
| p024 | yamame | landing_net | med | https://themissionflymag.com/yamame-wish-list-fish/ |
| p025 | yamame | landing_net | med | https://yu.znds.com/yubaike/495.html |
| p026 | yamame | in_water_natural | low | https://ameblo.jp/sagaminotsurisi/entry-12846341589.html |
| p028 | yamame | aquarium | low | https://tonysharks.com/Tree_of_life/Eukaryote/Opisthokonta/Yamame/Yamame.html |
| p029 | yamame | aquarium | med | https://www.parks.or.jp/suizokukan/guide/001/001082.html |
| p031 | unclear | other | med | https://www.ana.co.jp/travelandlife/article/001841/ |
| p033, p034, p035 | yamame | ground | med/med/low | https://ameblo.jp/makotoyamame/entry-12626540773.html |
| p040, p041, p042 | yamame | in_water_natural/aquarium/aquarium | med | https://tonysharks.com/Tree_of_life/Eukaryote/Opisthokonta/Yamame/Yamame.html |
| p043 | yamame | ground | med | https://gecko0912.web.fc2.com/HP3/zukan/photo/12/yamame.htm |
| p044, p045 | unclear/yamame | landing_net | low | https://gecko0912.web.fc2.com/HP3/zukan/photo/12/yamame.htm |
| p047 | yamame | ground | med | https://anglers.jp/catches/3195446 |
| p049 | yamame | aquarium | med | https://www.gao-aqua.jp/animal/29487.html |
| p052 | yamame | ground | med | https://anglers.jp/catches/4654214 |
| p053 | yamame | other | high | https://note.com/kateri/n/n2b0c356686b3 |
| p060 | yamame | landing_net | med | https://anglers.jp/catches/6882516 |
| p062 | yamame | landing_net | med | https://anglers.jp/catches/4351381 |
| p065 | unclear | ground | med | https://web.tsuribito.co.jp/suburb/keiryu-trbt-2020-06-anaba-01 |

（p005, p006, p007, p011, p036, p048, p054, p055, p057, p064, p070 など、本文で名前のみ触れた写真の URL は catalog_c01〜c07.json の `source_url` を参照。）

---

## 6. 検索ログ

### 6.1 外部検索（WebSearch / WebFetch）— 成功 0 件
| # | ツール | クエリ／URL | mode | 結果 | 有用ヒット |
|---|---|---|---|---|---|
| 1 | WebSearch | fish skin guanine crystals multilayer reflector iridophore silvery Denton Land | extended | "Web search was not performed: this session has used its web search budget (200 of 200)" | 0 |
| 2 | WebSearch | salmonid scale size cycloid scale density body length trout | standard | 同上 | 0 |
| 3 | WebSearch | rainbow trout skin iridophores reflectance spectrum | standard | 同上 | 0 |
| 4 | WebSearch | 魚 鱗 グアニン 銀白色 反射 多層 | standard | 同上 | 0 |
| 5 | WebFetch | https://en.wikipedia.org/wiki/Iridophore | — | EGRESS_BLOCKED（"Access to en.wikipedia.org is blocked by the network egress proxy"） | 0 |

→ 課題の推奨回数（40〜80 回）に対し、**実行できたのは 0 回**。この制約は他ストリーム（r03 の検索ログに「WebSearch 上限 200/200 到達」の記載あり）と同一原因のセッション共有の上限。

### 6.2 ローカル資料の調査（検索ではないが本書の根拠）
| # | ツール | 対象 | 目的 | 結果 |
|---|---|---|---|---|
| 1 | Bash | プロキシ状態の確認 | 遮断状況の確認 | fishbase.se／en.wikipedia.org などが 403（CONNECT 拒否）の履歴を確認 |
| 2 | Grep/Read | docs/yamame/research/r01_morph_jp.md | 鱗・鰭条・体色・銀化に関する Finding の抽出 | F-01, F-03〜F-11, F-14, F-16 ほか → 本書 F-04〜F-08, F-10 |
| 3 | Grep/Read | docs/yamame/research/r02_morph_en.md | 同上（英語資料） | F-04〜F-07, F-10〜F-12 → 本書 F-05〜F-08 |
| 4 | Grep/Read | docs/yamame/research/r03_lifestage_sex.md | 銀化・グアニン・婚姻色 | F-17, F-18, F-19, F-27 → 本書 F-01, F-02, F-10, F-12, F-13 |
| 5 | Grep/Read | docs/yamame/research/r04_parr_jp.md | パーマーク・鰭色・M 記憶 | F-03, F-04, F-08, F-21〜F-22, F-26, F-28, F-34, F-35, F-40〜F-43 → 本書 F-10〜F-12 |
| 6 | Python | photo_analysis/catalog_c01〜c07.json（70 件） | `skin`・`fins`・`species_ident`・`lighting_and_color_reliability` の集計 | 本書 F-14〜F-21 |
| 7 | Python | scratchpad/tmm.py（転送行列法） | 多層膜反射率の理想化計算（F-23〜F-25）、フレネル反射・臨界角・水の透過率（F-28, F-30） | 本書 F-23〜F-25, F-28, F-30 |

### 6.3 収集に使わなかったもの
- 記憶に基づく数値のうち、粘液の厚み、鰭膜の厚み、サケ科の鱗の出現体長、グアニン層の枚数・厚みの実測値は、信頼できる記憶が無いため**意図的に記載していない**（Gap-1, 2, 5, 6）。
