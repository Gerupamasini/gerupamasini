# r07（眼球・頭部・口・鰓蓋）独立検証レポート

> 検証対象: `/home/user/gerupamasini/docs/yamame/research/r07_eye_head_mouth.md`（元ファイルは書き換えていない）
> 方法: 元の調査員とは異なるクエリ・言語・ドメインで WebSearch を **11回**（全て mode: standard、割当どおり）。検索結果は「題名・URL・モデルが作った要約」のみで全文は読んでいない。数値は要約に明示されたものだけ採用した。「算術」と書いたものは私の換算で、資料の値ではない。
> 記憶由来の知識は M（未検証）と明記した。
> 重要な注意: 11回の呼び出しのうち、#5（視野）と #6（呼吸）では、1回の呼び出しの結果に複数の検索ブロック（"Let me search more specifically..." 等）が含まれていた。ツール側で内部的に追加検索が行われた可能性があり、共有予算（200回）の消費が呼び出し回数より多い可能性がある。呼び出し自体は11回で、予算拒否は一度も出ていない。

判定の定義: CONFIRMED-MULTI（独立2資料以上が一致）／CONFIRMED-SINGLE／CONTRADICTED（反証あり）／UNVERIFIABLE。

---

## 1. 検証結果の表

| ID | 元の主張（要約） | 判定 | 補正値／範囲 | 新規出典URL | 備考 |
|---|---|---|---|---|---|
| V-01 | F-01: 眼径/頭長は幼魚（約200 mmまで）で20–30%、成魚で約10%（O. masou 種全体） | UNVERIFIABLE | 数値の再現なし。方向（成長で眼の相対サイズが縮小）の根拠は写真由来 C(P) と一般知識 M のみ | S2（ロシア極東系クエリ）では該当記述が出ず。S9（サケ科の眼径アロメトリー）でも「眼径/頭長が体長とともに減少」を示す記述は要約に無し | S9 の要約自身が「その関係を直接示す結果は無い」と述べた。数値は仕様の根拠にしない。方向は残してよいが根拠は C(P)＋M と書く |
| V-02 | F-02: 眼径/頭長 ビワマス0.169±0.028、サツキマス0.134±0.011、サクラマス0.100±0.013 | UNVERIFIABLE | 再現できず。別の記述として FishBase 系の「ビワマス眼径 4.2–6.3 %SL（平均5.2%）」は再確認された（元の F-02 と同じ値） | S1 で得た候補URL（内容未確認）: https://www.fish-isj.jp/publication/pdf/67/6702_215.pdf 、https://www.fish-isj.jp/html/english/journal/JJI65-2.pdf 、https://fishbase.se/summary/71341 | 要約は「眼径/頭長の比が種判別の指標」とだけ述べ、0.169/0.134/0.100 は出なかった。元ファイルも「要原典確認」としており整合 |
| V-03 | F-03: 台湾亜種成魚の比（体長/頭長4.20、体長/体高3.48、頭長/吻長4.41、頭長/眼径3.43、頭長/眼間隔4.12） | CONFIRMED-SINGLE | 同じ5つの比が再現。別クエリで同一文が返ったが、結果集合に en.wikipedia と zoolstud.sinica と FishBase が混在し、どの文書の文かは特定不能 | https://fishbase.org/summary/16686 （O. formosanus。数値の有無は未確認）、https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/1.pdf （同上）、https://scholars.ntou.edu.tw/cris/project/pj03139 （台湾の研究課題。Chichiawan 渓で52個体を採集、との記述） | 元と同じ文のため独立とは言えない（Wikipedia 由来の可能性が高い）。「体長」の定義（SL/FL/TL）は今回も不明。算術の再検算: 1/4.20=0.238、1/4.41=0.227、1/3.43=0.292、1/4.12=0.243 で元の派生値と一致 |
| V-04 | F-10: Matthiessen比は多くの魚で2.55（10種の測定で2.40–2.82）。範囲は種により2.3–3.6という記述もある | CONFIRMED-SINGLE | 2.55（Matthiessen の10種平均）／10種の変動 2.40–2.82／報告された全範囲は 2.19–2.82（要約の記述）。「2.3–3.6」は要約では「3.6から2.3へ低下しうる」という種内の記述で、元ファイルの書き方と食い違う | https://cob.silverchair.com/jeb/article/214/16/2724/10381/Adaptation-in-the-optical-properties-of-the （魚の水晶体光学。内容未確認）、https://cob.silverchair.com/jeb/article/210/16/2923/17016/Multifocal-lenses-in-coral-reef-fishes （同上）、https://www.sciencedirect.com/science/article/pii/0042698995003290 （S5 で出た題目 "Image Formation by the Crystalline Lens and Eye of the Rainbow Trout"。内容未確認） | 要約文は Wikipedia 系の同一文。JEB の論文が結果に出たが数値は要約に無い。ニジマスの水晶体光学の論文（Vision Research 1995 と思われる題目）が存在することが分かったので、サケ科の水晶体値を探すならここ（Gap）。算術: 1/2.55=0.392（水晶体を眼球中心に置く場合のみ）は元の記述どおり正しい |
| V-05 | F-11: トラウトの水平視野約330°、死角約30°、両眼視約30° | UNVERIFIABLE（トラウト）。PROXY の範囲は下記 | 両眼視野（水平）の査読値: ゼブラフィッシュ 33±3.54°、ゴールデンシャイナー 31±1.67°（コイ科、非捕食者）／サンゴ礁の捕食魚（coral trout＝ハタの仲間でサケ科ではない、painted comber、blacktip grouper）36°・40°・54°／エイ類 46–72° | https://pmc.ncbi.nlm.nih.gov/articles/PMC4540049/ （"Vision in two cyprinid fish: implications for collective behavior"）、https://journals.biologists.com/jeb/article/211/4/482/18035/Visual-fields-of-four-batoid-fishes-a-comparative | 「ほとんどの魚で約30°」はコイ科（非捕食者）の値には合うが、捕食魚では36–54°と大きい。サケ科の査読値は3回の内部検索でも出なかった。元ファイルの「根拠は釣り解説」という注記は正しい。数値は仮置きのまま |
| V-06 | F-20: ニジマス換気頻度 57±4（対照）／78±4（軟水順化）回/分、水温依存は定性のみ（数値は取得できず） | 範囲は CONFIRMED-MULTI（57–78付近、温度不明）。ただし**温度依存の数値が新規に得られ、補正が必要** | (a) 別資料: 安静前の呼吸数 77/min（温度不明、JEB 46:307 の要約）。(b) 別資料（韓国語系の論文と推定、要約経由）: ニジマスの鰓蓋運動数 OMN = 4.4847·WT + 59.2150（水温 WT 4–23 °C、線形）。**算術**: 4 °C→約77、10 °C→約104、15 °C→約126、20 °C→約149、23 °C→約162 回/分。→ 10–15 °C では元の57–78より高い | https://cob.silverchair.com/jeb/article/46/2/307/21194/Changes-in-Blood-Pressure-Heart-Rate-and-Breathing 、https://koreascience.or.kr/article/JAKO200810103419161.pdf （OMN式の出典候補。検索結果にこのURLが出たが、式がこの文書の記述かは要約から断定できない）、https://pmc.ncbi.nlm.nih.gov/articles/PMC9773365/table/TB1 （内容未確認） | 元の「静止時50–90回/分程度（M）」は、10–15 °C の線形式（104–126）と食い違う。体サイズ・順化・計測法が違う可能性があり、**どちらかが誤りとは断定できないが、単一値にはできない**。OMN式は要約経由で原文未確認のため「候補」扱い。元の換算（57回/分=0.95 Hz、78回/分=1.30 Hz）は正しい |
| V-07 | F-27: ニジマスのストライクで神経頭蓋の最大挙上2–18°、28ストライク・3個体、椎間関節の最大約1/3で小回転（大半3°未満） | CONFIRMED-MULTI | 全て再現。新規の詳細: 最大挙上時の背屈量は最初の8椎間関節で吻尾方向に増加し、第11椎後関節付近で最小になる | https://par.nsf.gov/biblio/10331496 、https://news.liverpool.ac.uk/2021/08/25/researcher-discovers-neck-like-vertebral-motion-in-fish/ 、https://www.sci.news/biology/fish-neck-motion-10002.html 、https://www.labmanager.com/researcher-discovers-neck-like-vertebral-motion-in-fish-26599 | 注意: 複数の記事は同じ論文（Camp、2021、"A neck-like vertebral motion in fish"）に基づく。測定の独立再現ではなく、記述の一致。論文の誌名は今回の要約から確認できていない |
| V-08 | F-17: サケ科の開口時間・開口角は未取得（PROXY: ブルーギル最大開口まで約13 ms 等）。アニメ仮置き 10–30 ms／閉顎50–100 ms | UNVERIFIABLE | サケ科の値は見つからず。PROXY の追加: ガー（ram摂餌型）のストライクは25–40 ms（要約）。ブルーギル13 msは今回再確認していない | https://sites.harvard.edu/glauder/files/2022/03/LauderPendergast1992.pdf （内容未確認）、https://jan.ucc.nau.edu/acg/publications/Ferry-Graham_et_al_2008.pdf （同上）、https://sicb.org/?p=37649 （ram摂餌3種の比較。数値は要約に無し） | 元ファイルの仮置き（10–30 ms／50–100 ms）は「トラウトの値ではない」と明記されており正しい。この検索でも裏付けは増えなかった。ガー25–40 ms は桁の参考のみ |
| V-09 | F-21／§3-3: Oncorhynchus は上顎の変形が特徴的（査読レビュー）／写真2枚は下顎先端の上向きフック | CONFIRMED-SINGLE（両方が併存する、という整理） | 要約の記述: Oncorhynchus では上顎が下顎より伸びて「吻（snout）」を作る。同時に kype は下顎先端（歯骨 dentary）の骨の針状突起から成長し、**前上顎骨の左右に窪みができて、口を閉じると kype がそこにはまる**。繁殖後に再吸収される（複数回繁殖個体）。kype は「一部の雄の下顎先端に産卵期前に生じる鉤状構造」 | https://en.wikipedia.org/wiki/Kype 、https://fishionary.fisheries.org/?p=634 （AFS の用語集。内容は定義のみと推定）、https://pmc.ncbi.nlm.nih.gov/articles/PMC6502380 、https://pmc.ncbi.nlm.nih.gov/articles/PMC1571185 （両PMCの内容は未確認）、https://research.bangor.ac.uk/portal/en/researchoutputs/evolutionary-drivers-of-kype-size-in-atlantic-salmon-salmo-salar-domestication-age-and-genetics(fe15daaa-a97e-4d3d-8f5a-e75224e5a37c).html | 元の §3-3 の矛盾（上顎か下顎か）は、「上顎の伸長（吻）＋下顎のフック（kype）で、閉口時に噛み合う」と整理でき、写真 p012・p034 の「下顎フックが上顎先端とかみ合う」（F-22）と整合する。ただし要約の kype の骨成長の記述は Atlantic salmon（Salmo）の研究と思われ、O. masou 固有ではない（PROXY）。河川型成熟雄の発達量は今回も不明 |
| V-10 | F-30: 真骨魚は大半が固定の虹彩（瞳孔反応なし）。サケ科は未確認 | UNVERIFIABLE（サケ科） | サケ科の瞳孔反応の記述は結果に出ず。元ファイルの主張（総説：大半の真骨魚は固定）自体は今回再確認していない | S11 の結果に出た関連文献（題目のみ）: https://dspace.library.uvic.ca/items/3cfe6bcc-9d36-4c78-9b90-db2872d0e915 （サケ科の視覚生物学、偏光感受性）、https://pubs.usgs.gov/publication/70027220 | 「結果に出なかった」ことは「固定である」ことの証拠にならない。仕様は元のとおり「固定径の円形瞳孔を既定、動的収縮は任意パラメータ（既定0）」が安全 |

### 付随確認（上の10件には数えない）

- F-24（家畜化で眼径が小さくなる）: S9 でタイセイヨウサケの common garden 実験が再確認された。「家畜化個体は、同じ環境で育てた野生個体より体サイズ補正後の眼径が小さい」（https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8477603/ 。元と同じ論文で独立ではない）。新規の定性情報: Burrishoole 集水域の Atlantic salmon・ブラウントラウトのパーは別の集水域より眼が大きく、濁水や餌の少なさへの応答の可能性（要約の仮説）。ブラウントラウトの系統間で眼径と眼後長が小さい系統がある（要約）。ギンザケの「眼径−30%」（遺伝子導入）は再確認できず（CONFIRMED-SINGLE の元の記録のまま）。→ 個体差生成の軸に「生息環境（濁り）で眼径を増減」を追加してよいが、数値は無い。
- 元ファイルの算術の検算（全て正しい）: 57/60=0.95 Hz、78/60=1.30 Hz、2×180°−30°=330°、Snell の窓の臨界角 arcsin(1/1.333)=48.6°（頂角約97°）、1/2.55=0.392、台湾亜種の派生値（頭長0.238SL、吻長0.227HL＝0.054SL、眼径0.292HL＝0.069SL、眼間隔0.243HL＝0.058SL）。

---

## 2. 仕様書で使うべき「採用値」

1. **摂餌時の神経頭蓋の挙上: 2–18°**（ニジマス、28ストライク、3個体。PROXY: ニジマス。V-07 CONFIRMED-MULTI）。個々の椎間関節の背屈は大半が3°未満で、最初の約8関節で吻尾方向に大きくなる。頭と体幹が「首のように」連動する運動として作る。
2. **眼の水晶体の光学: Matthiessen比 2.55 を既定値（調整可能）**。10種の測定の変動は2.40–2.82、報告全体の範囲は2.19–2.82。水晶体を眼球の中心に置く場合、水晶体径/網膜球径≈0.39（算術。実魚では水晶体はやや前寄りで比は大きくなる、M）。PROXY: 魚類一般（サケ科の値は未確認。V-04）。
3. **呼吸（鰓蓋）の周期は温度の関数にし、単一値に固定しない。** 根拠のある範囲: ニジマス 57–78 回/分（温度・体サイズ不明、JEB 198 および JEB 46 の別値77）。温度依存の候補式 OMN = 4.4847·WT + 59.215（4–23 °C）は 10 °C で約104、15 °C で約126 回/分。→ 既定は**約1–2.1 Hz の範囲で温度・遊泳速度・警戒により可変**、周期と振幅は独立パラメータ（元の F-20 の方針を維持）。OMN 式は要約経由で原文未確認なので、式の係数は「候補値」と明記する。
4. **顎の婚姻期変形: 産卵期の雄のみ。上顎が伸びて吻を作り、同時に下顎先端にフック（kype）が出て、閉口時に上顎前上顎骨の窪みにはまる。** 写真 p012・p034（下顎フック＋上顎先端とのかみ合い）と整合する。小型の早熟雄（河川残留パー）には付けない（元の F-23／F-31）。河川型の成熟雄の発達量は未確認のため、量は調整可能パラメータにする。
5. **台湾亜種の比は PROXY として次の範囲で参考にする:** 頭長≈0.238 SL（体長=SL と仮定した場合）、吻長≈0.227 HL。**scope に "PROXY:O. m. formosanus" を明記**。単独の根拠にはしない（V-03 CONFIRMED-SINGLE）。
6. **瞳孔: 固定径の円形を既定**（写真由来 48/57 枚が円形。動的収縮は任意パラメータで既定0。サケ科での確認は無い、V-10）。
7. **両眼視野（前方重複）は調整可能パラメータとし、既定の目安を 30–50° の範囲に置く**（PROXY: コイ科 31–33°、捕食魚 36–54°。トラウトの査読値は無い、V-05）。この範囲は私の整理で、資料にある「トラウトの値」ではない。

## 3. 「採用してはいけない値」（仕様書に事実として書かない）

1. 眼径/頭長 0.169／0.134／0.100（ビワマス・サツキマス・サクラマス）を**一次根拠として**引用すること（V-02 UNVERIFIABLE）。
2. 「眼径は幼魚で頭長の20–30%、成魚で約10%」の**数値**（V-01 UNVERIFIABLE）。方向（成長で小さくなる）だけを残し、根拠は写真集計 C(P)（パー0.22、幼魚0.20、成魚0.15）と一般知識 M と明記する。
3. 台湾亜種の派生値「眼径/頭長 ≈0.29」を**日本産ヤマメの成魚の眼径**として使うこと（元ファイルの §3-1 でも解消不能とされた外れ値で、今回も補強する根拠が無い）。
4. 「トラウトの水平視野330°、死角30°、両眼視30°」を事実として引用すること（V-05。コイ科の値は31–33°だが、捕食魚は36–54°）。
5. 「トラウトの開口〜最大開口 10–30 ms、閉顎 50–100 ms」をトラウトの実測として引用すること（V-08。元ファイルの仮置きの注記を必ず付ける）。
6. 「ニジマスの安静時換気頻度は57–78回/分」を**水温を問わない標準値**として使うこと（V-06。10–15 °C の線形式は104–126回/分）。元ファイルの記憶（M）「50–90回/分」も同様に単一値として使わない。
7. 「サケ科の瞳孔は固定」を事実として断言すること（V-10。サケ科の確認は無い）。
8. Matthiessen比の範囲を「2.3–3.6」と書くこと（今回の要約では「2.3から3.6の範囲で低下しうる」という種内の記述で、報告された範囲は2.19–2.82）。
9. 「ギンザケ遺伝子導入で眼径−30%」をヤマメの個体差の係数として使うこと（PROXY、数値の再確認なし）。

## 4. 元ファイルの修正提案（元ファイルは未変更）

- F-20 に、温度依存の候補式（OMN = 4.4847·WT + 59.215、4–23 °C）と「10–15 °C で約104–126回/分」を追記し、§3-11 の矛盾に「温度を揃えると食い違う」を加える。F-20 の「先行 M の 50–90回/分は矛盾しない」は撤回または「温度条件により食い違う」に修正する。
- F-10 の「種によって2.3〜3.6の範囲」を「報告された全範囲は2.19–2.82」に直す。
- §3-3（顎の変形部位）に、「上顎の伸長（吻）と下顎のフック（kype）は併存し、閉口時に噛み合う」という整理（V-09、Wikipedia 系の要約。PROXY を含む）を追記する。
- F-11 に、コイ科の両眼視野（31–33°）と捕食魚（36–54°）の PROXY を追記し、「ほとんどの魚で30°」を弱める。
- F-24 の出典はそのままでよい（独立ではないが矛盾なし）。

## 5. 検索ログ（11回、全て mode: standard）

| # | 対象ID | クエリ（要旨） | domain指定 | 結果の要点 | 有用度 |
|---|---|---|---|---|---|
| S1 | V-02 | Oncorhynchus biwaensis masou ishikawae eye diameter ratio head length 0.169 0.134 0.100 | なし | 0.169等は出ず。FishBase 系の 4.2–6.3 %SL を再確認。fish-isj.jp のPDFが候補として出た（内容未確認） | 低 |
| S2 | V-01 | masu salmon eye diameter decreases with age % head length juveniles adults Sakhalin Primorye | なし | 該当記述なし（個体群生態の論文が中心） | 無 |
| S3 | V-03 | Formosan landlocked salmon morphometrics head length snout eye diameter interorbital | なし | 5つの比を再現（Wikipedia 系の同一文）。52個体採集の記述 | 中（独立でない） |
| S4 | V-04 | fish lens Matthiessen's ratio 2.55 range 2.4 2.8 Land Nilsson | なし | 2.55、2.40–2.82、全範囲2.19–2.82、JEB 214・210 の候補 | 中 |
| S5 | V-05 | rainbow trout binocular visual field overlap degrees monocular field | pmc, cob.silverchair, journals.biologists, pubmed, sciencedirect | トラウトの値は無し。コイ科 31–33°、捕食魚 36–54°、エイ 46–72°。内部で複数回の再検索の痕跡 | 中（PROXY） |
| S6 | V-06 | rainbow trout resting ventilation rate breaths per minute opercular beat frequency 10 °C 15 °C | なし | OMN = 4.4847·WT + 59.2150（4–23 °C）、安静前呼吸数77/min（温度不明）。内部で複数回の再検索の痕跡 | 高 |
| S7 | V-07 | Camp neck-like vertebral motion in fish rainbow trout XROMM neurocranium elevation | なし | 2–18°、28ストライク、3個体、<3°、最大1/3の関節を再確認。第8関節／第11関節の詳細が新規 | 高 |
| S8 | V-08 | brook / brown / rainbow trout prey capture high-speed video time to maximum gape ms ram feeding | なし | サケ科の値は無し。ガー25–40 ms（PROXY） | 低 |
| S9 | V-01（補助）、F-24 | juvenile salmonid eye diameter % head length decreases with fork length allometry | なし | アロメトリーの記述は無し。家畜化でタイセイヨウサケの眼が小さい（再確認）、集水域差 | 低〜中 |
| S10 | V-09 | spawning male Pacific salmon kype upper jaw elongation lower jaw hook Oncorhynchus premaxilla dentary | なし | 上顎の吻形成＋下顎フックが前上顎骨の窪みにはまる、骨の針状突起から成長、再吸収 | 中〜高 |
| S11 | V-10 | rainbow trout OR salmonid pupil light reflex iris constriction Oncorhynchus mykiss | なし | サケ科の瞳孔反応の記述なし（視覚発達・偏光感受性の文献の題目のみ） | 低 |

- 予算ルール違反なし（拒否通知は0回、extended 不使用、WebFetch 不使用）。
- 今回の検索では確認できず、次の一手になるもの: ニジマスの水晶体光学（Vision Research 1995、上記 sciencedirect 候補）、神経頭蓋挙上の論文本体（PMC8385379。誌名確認）、ヤマメの眼径・頭長の実測（FishBase O. masou の形態欄、Nakabo 編、写真 landmark 計測が最も確実）。
