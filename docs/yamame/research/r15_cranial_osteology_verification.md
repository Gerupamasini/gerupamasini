# r15_cranial_osteology.md 独立検証レポート

> 検証対象: `/home/user/gerupamasini/docs/yamame/research/r15_cranial_osteology.md`（元ファイルは未変更）
> 方法: 仕様への影響が大きい10主張を選び、元の調査員と異なる言い回し・ドメイン指定で WebSearch（**11回、すべて mode="standard"、拒否なし、割当ちょうど**）。
> 制約: 検索結果は「題名・URL・モデルが作った要約」のみ。論文全文は読めていない。**要約文中に明示された記述だけを採用**。要約の文と URL の対応が特定できないものは「出典候補」と明記し、ランクを下げた。自分の記憶は M（未検証）と明記。
> 対象外: s01.jpg（P）の観察、F-02〜F-11 の写真・ローカル計算。F-01〜F-11 は検証していない。
> 判定の凡例: CONFIRMED-MULTI（独立2資料以上が一致）/ CONFIRMED-SINGLE（再現したが元と同一論文・同一資料群、または単一資料）/ CONTRADICTED / UNVERIFIABLE（今回の検索で数値が返らず確認も反証もできない）。

---

## 1. 検証結果の表

| ID | 主張（要約） | 判定 | 補正値／範囲 | 新規出典URL | 備考 |
|---|---|---|---|---|---|
| V01 (F-33) | ニジマスの脊椎骨は計63（体幹椎33＋尾椎30） | CONFIRMED-SINGLE | 63（33＋30）。FishBase 系は範囲 60〜66 | https://nrm-fishbaselinux01.nrm.se/summary/SpeciesSummary.php?id=239 （FishBase ミラー。60〜66 の範囲）／ https://link.springer.com/article/10.1023/B:EBFI.0000022905.72702.0e （椎柱の領域区分の候補。下記） | 検索要約は「別の資料も同じ内訳」と述べたが、返った URL は元と同じ agris と doaj で、**独立ではない**（同一論文の2レコードの可能性）。新情報: 椎柱を3領域（頭後方の 8〜10 椎、体幹椎と最初の 18〜20 尾椎を含む中間域、尾端の ural 域）に分ける記述が要約にある。**URL との対応は不確実（C）**。「33」が肋骨を持つ腹椎と同義かは依然不明。PROXY: O. mykiss。ヤマメ値として使えない。 |
| V02 (F-45) | ブルックトラウトの raking: 頭蓋挙上 平均36°（咀嚼16°）、胸帯後退 0.85 cm＝頭長の21%（咀嚼 0.41 cm＝10%）、所要 平均49 ms（咀嚼77 ms） | CONFIRMED-SINGLE（数値は完全再現） | 36°／16°、0.85 cm（21%）／0.41 cm（10%）、49 ms／77 ms。**追加**: 舌骨の背腹方向の振れ 咀嚼0.26 cm、raking 0.14 cm。餌種（コオロギ・魚・ミミズ）で raking は変わらず高度に定型的 | https://journals.biologists.com/jeb/article/204/22/3905/32920/Kinematic-analysis-of-a-novel-feeding-mechanism-in （元と同一論文）／ https://pubmed.ncbi.nlm.nih.gov/19438765/ （Functional morphology and biomechanics of the tongue-bite apparatus in salmonid and osteoglossomorph fishes。題名のみ。数値は返らず） | 同一論文なので独立ではない。ただし要約文が原文どおりに全数値を再現した（A）。**算術**: 0.85 cm ＝ 頭長の21% なら頭長は約4.0 cm、0.41 cm＝10% でも約4.1 cm で整合。つまり供試魚は**頭長約4 cm の小型個体**。絶対値（cm）は仕様に使わず、頭長比で使うこと。舌骨 0.14 cm は頭長の約3.5%（算術、近似）。PROXY: Salvelinus fontinalis。捕獲後の餌処理の動作で、捕食ストライクではない。 |
| V03 (F-22 前半) | ニジマスは、小さな背側回転（大半3°未満）を椎間関節の最大約1/3で合算して神経頭蓋を持ち上げる | CONFIRMED-SINGLE（文面は再現）。ただし「約1/3」の解釈に注意 | 各関節 3°未満が大半。文面は "up to a third of their intervertebral joints"。別要約: 「前方の 20〜30% の椎間関節を背側へ回転」。別要約: 「背側屈曲は頭椎関節を越えて広がり、大きさは最初の約8つの椎間関節で頭尾方向に増える」 | https://journals.biologists.com/jeb/article/226/20/jeb245788/334186/Beam-theory-predicts-muscle-deformation-and ／ https://journals.biologists.com/jeb/article/223/18/jeb225649/225845/Fishes-can-use-axial-muscles-as-anchors-or-motors ／ https://journals.biologists.com/bio/article/7/9/bio036335/1737/Axial-morphology-and-3D-neurocranial-kinematics-in （いずれも関連論文の所在。どの文がどの URL かは特定不能） | 元の PMC8385379 が再度返った（同一資料）。**元ファイルの「椎間関節の最大約1/3」は、測定した前方24椎の範囲の1/3（約8関節）なのか、全椎柱の1/3なのかが曖昧**。「最初の約8関節で増える」「前方 20〜30%」の記述は、前者（前方約8関節）と読む方が整合する。リギングでは「首側の約8関節に小回転を分配」を採用し、「全椎柱の1/3」とは書かないこと。PROXY: O. mykiss。 |
| V04 (F-22 後半) | ニジマスの捕食ストライクで神経頭蓋の最大挙上 2〜18°、28ストライク、3個体、前方24椎を XROMM で測定 | CONFIRMED-SINGLE（数値は完全再現） | 2〜18°、28 strikes、3 fish、前方24椎。掲載誌は Proc. R. Soc. B（Ariel L. Camp、2021年。要約による） | https://news.liverpool.ac.uk/2021/08/25/researcher-discovers-neck-like-vertebral-motion-in-fish/ ／ https://www.sci.news/biology/fish-neck-motion-10002.html （報道系の二次資料。数値の所在は特定不能） | 一次論文は元と同一（sicb.org/?p=43945、par.nsf.gov/biblio/10516045 も再度返った）。報道系は二次なので「独立」とは数えない。PROXY: ニジマス。ヤマメ未測定。 |
| V05 (F-26) | ニジマスの換気頻度 57±4（対照）〜78±4（軟水順化）回/分＝0.95〜1.30 Hz | CONFIRMED-SINGLE（範囲内の別値。弱い） | 57〜78 回/分（元の値）。別資料の「運動前の呼吸数 77/分」（0.95〜1.30 Hz の範囲内、77/分＝約1.28 Hz） | https://cob.silverchair.com/jeb/article-pdf/46/2/329/3272963/jexbio_46_2_329.pdf ／ https://cob.silverchair.com/jeb/article-pdf/46/2/307/3272505/jexbio_46_2_307.pdf ／ https://cob.silverchair.com/jeb/article/97/1/325/34666/The-effect-of-changes-in-blood-oxygen-carrying ／ https://www.zoology.ubc.ca/~woodcm/Woodblog/wp-content/uploads/2023/12/Eom-and-Wood.FPB_.2023.pdf （いずれも候補。77/分がどれの値かは特定不能） | 「77/分」の出典 URL が特定できないため **C 扱い**。方向は整合: 高CO2・運動後は頻度でなく1回換水量（振幅）が主に増える（元ファイル F-26 の「運動後は周期でなく振幅が増える」と一致）。鰓蓋の振幅（mm・角度）は今回も未取得。PROXY: ニジマス。 |
| V06 (F-42/F-17) | サケ科の尾部骨格の一般型は下尾骨6・尾神経棘3（イワナ属の一部は7と4） | CONFIRMED-SINGLE（同一資料）。ただし別系統の記述との差あり | 下尾骨6、尾神経棘3（サケ科の一般型）。**上尾骨 epural の本数は未確定**（下記） | https://openpolar.no/Record/crwiley:10.1002%2Fjmor.10775 （元と同一）／ https://agris.fao.org/search/en/records/676558defccf879925c0f83c （Epural bones in teleost fishes。元と同一）／ https://www.kmae-journal.org/articles/kmae/full_html/2020/01/kmae200021/F3.html ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC7268543 ／ https://journals.sjp.ac.lk/index.php/vjs/article/download/1160/344 （どれかが下記の一般型の出典。特定不能） | 検索要約に別の記述があった: 「調べた全種の尾部骨格は、**2対の尾神経棘（UN1, UN2）、6本の遊離した下尾骨（HYP1〜6）、1本の準下尾骨、3本の正中の上尾骨（EP1〜3）**の一般型」。**魚種・分類群が要約に無く、サケ科とは限らない**（Sri Lanka 系の誌名やカダヤシ類の論文も同じ結果集合に混在）。このため epural＝3、尾神経棘＝「2対」は**ヤマメに採用しない**。下尾骨6は両者で一致。 |
| V07 (F-12/F-13) | O. masou の脊椎骨数 63〜66（C）／63〜69（AI生成）／63 | UNVERIFIABLE（2回検索しても数値が返らず） | 変更なし（63〜66 が C、63〜69 は最低信頼）。Mano ら（1991）が7形質を計数した事実のみ再確認 | FishBase の O. masou ページの所在: https://fishbase.se/summary/242 ／ https://fishbase.mnhn.fr/summary/242 ／ https://www.fishbase.org/summary/Oncorhynchus-masou+masou.html （検索要約に脊椎骨数なし。**人が手で開いて読むこと**）／ https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57 （元と同一）／ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/24086/42(4)_P147-159.pdf ／ https://koreascience.or.kr/article/JAKO199327236818661.pub ／ https://www.miyagi.kopas.co.jp/JSFS/jsfs-english/E-PUB/76-1/p020.html （いずれも候補。数値は返らず） | 北海道7河川の研究の要約で、計数形質は「脊椎骨、上鰓耙、下鰓耙、背鰭条、胸鰭条、腹鰭条、臀鰭条」の7つ、集団間差は5形質（脊椎骨・下鰓耙・背・胸・臀）、腹鰭条と上鰓耙は差なし（元の F-14 と一致）。台湾亜種との比較で「脊椎骨・鰓耙・鰭条の値は諸研究でおおむね一致」とも述べるが数値なし（F-49 と整合）。**脊椎骨数の数値は C のまま**。 |
| V08 (F-15/F-16) | 青森県ヤマメ（河川型）の鰭条: 背12〜13、胸12〜14、腹9、臀12〜14（A） | UNVERIFIABLE（日本語クエリでヤマメの数値が返らず） | 変更なし。元の資料も、要約の言い換えで原典未確認（元ファイル自身が「要原典確認」と記載） | なし（参考: https://www.honda.co.jp/fishing/picture-book/yamame/ は図鑑ページとして返ったが数値なし） | 検索要約に「第1鰓弓上枝鰓耙15、下枝32、**鰓条骨数は6**」という値があったが、結果集合はヤマメ以外（鹿児島大の魚類論文、イサキ、ヤマトミズン等）が主で、**ヤマメの値とは限らない。サケ科の鰓条骨6は少なすぎる。採用禁止**。 |
| V09 (F-18/F-19) | O. masou の鰓耙16〜22（大半18〜19、Christie）、鰓条骨「11」は曖昧、11〜15は帰属不明 | UNVERIFIABLE（鰓耙・鰓条骨の数値が返らず） | 変更なし | なし新規（候補: https://archive.org/download/biostor-14292/biostor-14292.pdf ／ https://repository.si.edu/server/api/core/bitstreams/863ffd97-8144-4fed-993d-5da8101d78f4/content は元と同じ古い記載。https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/27.pdf は台湾亜種の研究） | 要約の言及は定性のみ: 「鰓条骨と鰓耙を持つが、basibranchial tooth（基鰓骨歯）は大半の型で欠く」（出典 URL 特定不能。台湾亜種の「基鰓骨歯なし」F-20 と方向が整合するが独立確認とは言えない）。幽門垂の数 23〜63（平均41）は韓国のサンチョンオ（산천어）（産川魚。masou 系）の研究の値で、頭蓋仕様には不要。**ヤマメの鰓条骨本数は今回も未確定**。 |
| V10 (F-43/F-29) | 吸引摂食の運動順序: 頭蓋挙上・下顎押し下げが先、舌骨押し下げ・鰓蓋の広がり・胸帯後退が後。鰓蓋リンクで顎と舌骨の位相をずらせる。鰓蓋の外転は顎の開き始め後に始まり、顎が閉じ始めてからピーク | CONFIRMED-MULTI（順序について。PROXY: 非サケ科） | 順序は一致。別資料の表現: 「下顎押し下げのピーク → 上顎骨の突出 → 角舌骨の押し下げ → 鰓蓋の外転 → 懸垂骨の外転、の前から後ろへの波」。「鰓蓋の外転は口腔圧が最も陰圧になる時点で始まり、最大開口後の口腔の圧縮に対して遅れる」 | https://journals.biologists.com/jeb/article/88/1/49/23042/The-Suction-Feeding-Mechanism-in-Sunfishes-Lepomis ／ https://journals.biologists.com/jeb/article/212/21/3490/19005/Kinematics-of-suction-feeding-in-the-seahorse ／ https://journals.biologists.com/jeb/article/225/3/jeb243283/274351/Suction-feeding-biomechanics-of-Polypterus-bichir ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC12015573/ （Amia）／ https://journals.biologists.com/jeb/article/222/5/jeb193573/20630/Skeletal-kinematics-of-the-hyoid-arch-in-the （サメ）／ https://pmc.ncbi.nlm.nih.gov/articles/PMC12517347/ （元と同一）。どの文がどの URL かは特定不能 | **差異**: 元ファイルは「懸垂骨の外転と舌骨の腹側回転が同時」とするが、別系統の要約は懸垂骨の外転を波の最後に置く。種ごとの差とみられる。サケ科（ヤマメ）で懸垂骨の外転が舌骨押し下げと同時か後かは**未確認**。サケ科自身のタイミング・角度は今回も返らず。順序の定性のみ採用し、位相差はパラメータにする。 |

---

## 2. 仕様書で使うべき「採用値」

(A/B/C は証拠ランク。PROXY は種の代用。M は記憶で未検証。)

| 項目 | 採用値 | 条件 |
|---|---|---|
| ニジマスの脊椎骨総数 | 63（体幹33＋尾椎30）。範囲 60〜66 | PROXY: O. mykiss、B。ヤマメの内訳としては使わない |
| ヤマメ（O. masou）の脊椎骨数 | 暫定 63〜66（C）。個体差生成は 63〜69 を仮置き（推論）。集団軸・水温軸を持たせる | 一次値は未取得。FishBase の O. masou ページ（上記URL）を人が読んで確定すること |
| 捕食ストライクの神経頭蓋の挙上 | 2〜18°（28 strikes、3個体）。1関節あたり3°未満が大半。前方の約8関節に分配（頭尾方向に大きさが増える） | PROXY: ニジマス、A（二次資料で数値再現） |
| raking のパワーストローク | 頭蓋挙上 平均36°、胸帯後退 頭長の21%、所要 49 ms、舌骨の振れ 頭長の約3.5%（0.14 cm と頭長約4 cm からの算術。近似） | PROXY: ブルックトラウト、A。**cm は使わず頭長比で使う**。咀嚼モード: 16°、頭長の10%、77 ms、舌骨 0.26 cm（頭長の約6%） |
| 換気頻度 | 0.95〜1.30 Hz（57〜78 回/分、周期 0.77〜1.05 s）。運動後は周期を保って振幅を増やす | PROXY: ニジマス、A（範囲内の別値 77/分 も整合。C） |
| サケ科の尾部骨格 | 下尾骨6、尾神経棘3 | サケ科の一般型、A（イワナ属の論文要約）。epural の本数は未確定 |
| 顎・舌骨・鰓蓋の位相 | 頭蓋挙上と下顎押し下げが先 → 舌骨押し下げ → 鰓蓋の外転（顎の開き始めの後に始まり、閉じ始めの後にピーク）。位相は独立パラメータ | PROXY: 吸引型の硬骨魚（CONFIRMED-MULTI）。サケ科での確認なし。懸垂骨の外転の位置は種で異なる可能性 |

## 3. 仕様書で「採用してはいけない」値・記述

1. **鰓条骨数6、上枝鰓耙15、下枝鰓耙32**（V08 の検索要約）: 魚種が特定できない（非サケ科の結果集合）。ヤマメに使わない。
2. **epural＝3、尾神経棘＝2対**（V06 の別系統の要約）: 分類群不明。ヤマメに使わない。
3. **担鰭骨の本数（背7〜9、臀12〜14）**: 元ファイルの F-41 のとおり不採用を維持（今回の検索で支持も反証もなし）。
4. **ブルックトラウトの絶対値（0.85 cm、0.41 cm、0.26 cm、0.14 cm）**: 供試魚の頭長は約4 cm（算術）。ヤマメの頭に直接当てはめない。頭長比に換算して使う。
5. **「椎間関節の約1/3」を全椎柱の1/3として実装する**こと: 範囲の取り方が曖昧（V03）。
6. **ニジマスの「体幹椎33」をヤマメの腹椎数として使う**こと（V01）。
7. **ヤマメの脊椎骨数の単一の確定値**（63 など）として書くこと: V07 で確認できなかった。
8. **幽門垂 23〜63（韓国のサンチョンオ（산천어）系）、FishBase のサイズ（最大 79 cm TL、10 kg）**: 頭蓋仕様には不要。

## 4. 重要な補正（要点）

1. **V03**: 「約1/3」の解釈が曖昧。測定した前方24椎のうち頭側約8関節に回転を分配する、が整合する読み。
2. **V02**: ブルックトラウトの raking は供試魚の頭長が約4 cm（算術）。cm 値は頭長比に換算して使う。舌骨の振れ（raking 0.14 cm、咀嚼 0.26 cm）が追加された。
3. **V06**: 別系統の要約が epural＝3、尾神経棘＝2対を述べるが、分類群が不明。サケ科の一般型（下尾骨6・尾神経棘3）のみ採用し、epural は未確定として残す。
4. **V10**: 懸垂骨の外転のタイミングが資料間で違う（舌骨と同時／波の最後）。
5. **V07/V08/V09**: ヤマメの脊椎骨数・鰭条数・鰓耙・鰓条骨は今回も一次数値が返らず、C または未確認のまま。

## 5. 検証しなかった主張（元のランクのまま）

F-20（鋤骨歯の配置）、F-21、F-25（繁殖期の顎）、F-27（側線管）、F-34（水温と脊椎骨数）、F-35（上主上顎骨の枚数、1枚か2枚か）、F-36〜F-41、F-44、F-46（換気の位相）、F-47（咬合力 67%／43%）、F-48、F-49。これらは割当（11回）の都合で検索していない。再現できたかどうかの情報はない。優先して原典確認すべき順は、F-35（枚数の食い違い）、F-46（位相の誤記疑い）、F-47、F-34。

---

## 6. 検索ログ（WebSearch 11回、すべて mode="standard"、拒否なし）

| # | 対象 | クエリ（要旨） | ドメイン指定 | 有用度 |
|---|---|---|---|---|
| 1 | V01 | rainbow trout Oncorhynchus mykiss vertebral column abdominal vertebrae caudal vertebrae number total vertebrae count | なし | 中。63＝33＋30 を再現したが元と同一の2レコード。FishBase 60〜66、椎柱の3領域の記述が追加 |
| 2 | V02 | brook trout Salvelinus fontinalis raking neurocranial elevation pectoral girdle retraction duration ms open-mouth chewing tongue-bite | pubmed / journals.biologists / cob.silverchair | 高。要約が全数値を再現、舌骨の振れが追加。ただし同一論文 |
| 3 | V03 | trout feeding strike X-ray XROMM neurocranium elevation degrees intervertebral joints dorsal rotation neck-like motion | pubmed / pmc / journals.biologists | 中。「3°未満・約1/3」を再現、「前方 20〜30%」が追加 |
| 4 | V05 | rainbow trout resting ventilation frequency breaths per minute opercular movements normoxia gill ventilation rate | なし | 低〜中。77/分の別値。出典 URL 特定不能 |
| 5 | V06 | salmonid caudal skeleton six hypurals three uroneurals epural preural centra Oncorhynchus Salmo generalized condition | なし | 中。下尾骨6・尾神経棘3を再現。分類群不明の別系統の記述が混入 |
| 6 | V07 | Oncorhynchus masou masu salmon meristic counts vertebrae gill rakers dorsal/anal fin rays ... fluvial yamame morphology | なし | 低。数値なし。7形質と集団間差のみ |
| 7 | V08 | ヤマメ 背鰭条数 胸鰭条数 腹鰭条数 臀鰭条数 鰓耙数 鰓条骨数 計数形質 河川型 サクラマス 外部形態 | なし | 無〜低。ヤマメの数値は返らず。無関係な値が混入 |
| 8 | V09 | masu salmon Oncorhynchus masou branchiostegal rays number gill rakers first arch pyloric caeca description Salmonidae Japan | なし（1回の呼び出しで内部的に3ブロックの検索が返った。全体予算の実消費は11より大きい可能性あり） | 無〜低。鰓条骨・鰓耙の数値は返らず |
| 9 | V10 | opercular abduction begins after jaw opening reaches peak after jaws begin to close hyoid depression sequence suction feeding kinematics expansive phase | journals.biologists / pmc / academic.oup | 中〜高。順序を複数研究で再現、懸垂骨の外転の位置の差が判明 |
| 10 | V07（2回目） | Oncorhynchus masou cherry salmon fishbase "Vertebrae" dorsal soft rays anal soft rays ... | fishbase.se / fishbase.org / fishbase.us / nrm-fishbaselinux01.nrm.se / fishbase.mnhn.fr | 低。O. masou の FishBase ページの URL が得られたが、脊椎骨数は返らず |
| 11 | V04 | rainbow trout cranial elevation strikes maximum neurocranial elevation ranged degrees 28 strikes three individuals vertebral joints XROMM Camp | なし | 高。2〜18°、28 strikes、3個体を再現。掲載誌（Proc. R. Soc. B）が判明 |

---

## 7. 判定の内訳

- CONFIRMED-MULTI: 1（V10）
- CONFIRMED-SINGLE: 6（V01, V02, V03, V04, V05, V06）
- CONTRADICTED: 0
- UNVERIFIABLE: 3（V07, V08, V09）
