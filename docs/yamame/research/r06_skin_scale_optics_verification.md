# r06 鱗・粘液・銀色反射・鰭膜の光学 — 独立検証（懐疑的レビュー）

対象: `docs/yamame/research/r06_skin_scale_optics.md`（元ファイルは未変更）
検証日: 2026-10-01 ／ 検証者: 独立検証担当（先行調査員とは別クエリ・別ドメインで実施）

## 0. 実施条件と読み方

- WebSearch は **11 回（割当 11 回）**、すべて mode="standard"、予算拒否は発生せず。WebFetch・Bash/curl による外部アクセスは未使用。
- 検索結果は題名・URL・モデル要約のみで本文は未読。**要約に数値が無かった項目は「UNVERIFIABLE」**とし、数値を採用していない。自分の記憶由来の知識は証拠ランク M と明記した。
- ローカル計算（F-23/24/25/28/30）は検索ではなく、転送行列法とフレネル式を Python で独立に再計算して整合確認した（§3）。
- 判定の定義: CONFIRMED-MULTI（独立 2 資料以上が一致）／CONFIRMED-SINGLE（1 資料のみ、または元と同一 URL の再引用で独立性なし）／CONTRADICTED（反証あり）／UNVERIFIABLE（検索要約から確認も反証もできない）。
- 証拠ランク: A=査読論文・公的機関／B=図鑑・解説／C=個人・不明／M=記憶（未検証）／P=ユーザー写真。
- 注: 検索 #6 は 1 回の呼び出しの中でツールが内部的に追加の検索を 2 回走らせた（結果リストが 3 組返った）。予算会計上は 1 回として数えたが、内部で追加消費された可能性がある。

---

## 1. 検証結果の表

| ID | 主張（要約） | 元の根拠 | 判定 | 補正値／範囲 | 新規出典 URL | 備考 |
|---|---|---|---|---|---|---|
| V-01 | ヤマメ（青森）の鰭条数: 背 12–13／胸 12–14／腹 9／臀 12–14（F-04, 元ランク A） | 青森県 内水面研究所 | **UNVERIFIABLE**（数値）／ 定性部分のみ CONFIRMED-SINGLE | 数値の独立確認はできず。**定性: マス（O. masou）では背鰭条数・胸鰭条数が他の計数形質より変異が大きい**（北海道 7 河川個体群の比較研究の要約）。属内の参考（PROXY）: FishBase 要約でチヌーク 背 10–14／臀 13–19、ギンザケ 背 9–13／臀 12–17、サケ 背 10–14／臀 13–17 | https://www.miyagi.kopas.co.jp/JSFS/jsfs-english/E-PUB/76-1/p020.html（候補; どの文書の記述か要約から確定不能）／ https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57（候補）／ https://fishbase.org/summary/244 ／ https://www.fishbase.org/summary/Oncorhynchus-kisutch.html ／ https://fishbase.org/summary/241 | 検索 3 回（#1 日本語・#2 英語・#7 FishBase 指定）でヤマメ／マスの数値は一度も要約に現れなかった。属内範囲と矛盾はない（臀鰭 12–14 は属の範囲の下側）。元ファイルの「F-04 を中心、F-05 を裾」という扱いは妥当。背・胸の分散を大きくする根拠は得られた |
| V-02 | 側線有孔鱗 118–134（青森, A）／120–140（C）、側線上横列鱗 27–32 vs 43–56（F-06, F-07） | 青森県・Grokipedia ほか | **UNVERIFIABLE** | 数値の独立確認なし。F-07 の 43–56 は AI 生成百科（C）単独で、計数基準が違う疑いが残る | https://www.kahaku.go.jp/research/db/zoology/uodas/course/taxonomy/meristics/（計数法の解説のみ）／ https://www.zukan-bouz.com/syu/%E3%83%A4%E3%83%9E%E3%83%A1（要約に数値なし） | #1/#2 の要約に鱗数は出なかった。**鱗ピッチ（0.54–0.64 %SL）は「列長 0.76 SL」の仮定付き算出で、鱗数が未確認のまま**。仕様では範囲 0.55–0.9 %SL を「仮定」と明記して使う（元ファイルの結論を維持） |
| V-03 | 純水の吸収係数 a [m⁻¹]: 500/550/600/650/700 nm = 0.020/0.064/0.22/0.34/0.62、1/e 深さ 49/16/4.5/2.9/1.6 m（F-30, 元ランク M） | 記憶 | **UNVERIFIABLE**（一部は不一致の兆候） | **600 nm は検索要約で「約 0.266 m⁻¹」**（出典の対応は要約から不明）。M の 0.22 と合わせ **600 nm: 0.22–0.27 m⁻¹**（1/e 深さ 3.8–4.5 m、3 m 透過 0.45–0.52）。吸収の最小は **418 nm で 0.0044 ± 0.0006 m⁻¹（減衰長 約 227 m）**と要約に明記。500/550/650/700 nm の値は要約に出ず未確認 | https://opg.optica.org/ao/viewmedia.cfm?uri=ao-36-33-8710&html=true ／ https://en.wikipedia.org/wiki/Optical_properties_of_water_and_ice ／ https://omlc.org/spectra/water/abs/pope97.html ／ https://oceancolor.gsfc.nasa.gov/resources/docs/rsr/sources/hires/water_coef_fine_z09.txt（データファイルの所在のみ） | 検索 2 回（#3, #11）。表の数値は要約に出ない。M の値は **±10% でなく 600 nm で最大 約 20% ずれうる**ことを仕様に明記する。ローカル計算（1/e 深さ・透過率）の算術は再現（§3）。純水値は渓流の下限の目安（元ファイルの注記を維持） |
| V-04 | グアニン結晶 n≈1.83、細胞質 n≈1.33–1.37 の高低屈折率多層膜（F-22, M／F-33, A） | 記憶＋Jordan 2012 | グアニン n=1.83: **CONFIRMED-MULTI**／細胞質 n: **UNVERIFIABLE**／等方仮定: **CONTRADICTED（簡略化として修正）** | 無水グアニンは「反射方向で n=1.83」。ただし**結晶は強い複屈折で、屈折率は 1.85, 1.81, 1.46**（従来モデルは等方 1.83 と仮定していた）との記述が要約にある。細胞質の数値は要約に無い | https://pmc.ncbi.nlm.nih.gov/articles/PMC3496938 ／ https://weizmann.ac.il/molgen/gur/sites/molgen.gur/files/2024-10/Gur%20et%20al%202012.pdf ／ https://amp.spie.org/news/4951-inspiration-from-the-reflective-sides-of-silvery-fish ／ https://physicsworld.com/a/silvery-fish-fool-predators-with-their-skin/（どの文書の記述かは要約から確定不能） | F-23〜F-25 の計算は**等方 1.83 の理想化**であり、実結晶の複屈折は無視している。レンダリング（Three.js）では銀色を無彩色の広帯域ミラー成分として実装するので影響は小さいが、**「n=1.83/1.34 は実測値」と書かない** |
| V-05 | 銀色は高 n グアニン板と低 n 細胞質の多層膜で、ニシン・イワシでは 2 集団の複屈折結晶で非偏光・広帯域（F-33, F-25, 要約 3） | Jordan, Partridge & Roberts 2012 | **CONFIRMED-SINGLE**（根拠の中核は Jordan 2012 の 1 件。ニュース・解説は同研究の報道で独立ではない） | 変更なし。「サケ科でも同じ広帯域・無偏光か」は**未確認**（PROXY: ニシン・イワシ） | https://physicsworld.com/a/silvery-fish-fool-predators-with-their-skin/ ／ https://amp.spie.org/news/4951-inspiration-from-the-reflective-sides-of-silvery-fish ／ https://weizmann.ac.il/molgen/gur/sites/molgen.gur/files/2024-10/Gur%20et%20al%202012.pdf | 検索 #4 の題名・要約は元の F-33 と同じ「multilayer stacks」の記述を返した。判断（側面の銀は広帯域・ほぼ無彩色の鏡面成分）の方向は妥当 |
| V-06 | 色素細胞の層順序（F-34 サケ暗色皮膚／F-35 ブラウントラウト）と「ヤマメの層順序は資料なし」 | Cell Tissue Res; Djurdjevič ら | **CONFIRMED-SINGLE**（元と同一 URL の再引用で独立性なし） | 暗域: 黒色素胞が上から他の細胞を覆う／明域: 虹・黄色素胞が露出（再確認）。**新規の細部: 基底膜近くに「黒色素胞に囲まれた虹色素胞」、その下に黄色素胞**との記述が要約にある（F-34 の「黄色素胞は不規則に分布」と完全には一致しない） | https://pmc.ncbi.nlm.nih.gov/articles/PMC4609195 ／ https://revistas.um.es/hh/article/view/128911/120011 ／ https://link.springer.com/doi/10.1007/BF00222271（以上、元と同一）／ https://pmc.ncbi.nlm.nih.gov/articles/PMC8770521/ ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6509846（内容の対応未確認） | 検索 #5。**層順序は PROXY（ブラウントラウト／サケ）の記述同士でも細部が割れる**。ヤマメのパーマークが銀層の上か下かは依然不明。仕様では層順序を固定せず、パーマーク可視度＝銀化度 s の関数として持つ |
| V-07 | 粘液層の厚み: Harris & Hunt (1975) の「500–600 Å と 1–2 µm」（F-37, B 孫引き） | SINTEF 孫引き | **UNVERIFIABLE** | 数値の独立確認なし。要約は「粘液層の厚みを直接・客観的に測る市販法は無く、組織切片による間接的定量」と述べる（元と同じ SINTEF 系の記述を含む）。粘液の保存は凍結切片でも不安定で、定量の妨げになるとの記述あり | https://www.ntnuopen.ntnu.no/ntnu-xmlui/handle/11250/2507039（サケ粘液のバリア特性）／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6015023/figure/Fig1 ／ https://nofima.com/worth-knowing/fish-skin-and-its-protective-properties/ | 検索 #6（内部で追加検索あり）。**粘液厚の数値は採用しない**。レンダリング上は「水と屈折率がほぼ等しい薄い膜」で足り、厚み自体は法線・粗さの二次パラメータ扱いにできる |
| V-08 | スモルト化で皮膚グアニンが増加し銀化する。マスでは parr→silvery parr→smolt の両段階でグアニンとヒポキサンチンが増加し、量と見た目は必ずしも比例しない（F-01, F-31） | 北大研究彙報／Haner 1995 | 一般則（グアニン結晶の沈着が parr→smolt の銀化を生む）: **CONFIRMED-MULTI**／「両段階でグアニン＋ヒポキサンチン増加・量と外観が非比例」: **CONFIRMED-SINGLE（元資料のみ。今回確認できず）** | 一般則は #4 の要約（サケ科でパーマーク parr→銀 smolt は皮膚へのグアニン結晶沈着）と、日本語資料（グアニン結晶＝光を反射する板で構造色を生む）で確認。定量関係は未取得 | https://journals.iucr.org/c/issues/2026/07/00/yd3070/yd3070.pdf（元と同一）／ https://www.jstage.jst.go.jp/article/shikizai/89/6/89_178/_pdf ／ https://www.jstage.jst.go.jp/article/suisan/89/1/89_22-00024/_pdf ／ https://cir.nii.ac.jp/crid/1050845763672735488 | 検索 #4, #8。**新規の手がかり（採用しない）**: 要約に「ヤマメは淡水 1 年（時に 2 年）後、早春〜6 月にパーマークを失って銀毛化し、メス 100%・オス約 70% が銀毛化して降海」とあるが、どの文書・地域か特定できない（C） |
| V-09 | 鱗は皮膚に埋没し表皮で覆われる。円鱗は骨質外層＋線維板の 2 層で、前方が皮膚ポケットに入る（F-27 M／F-41 B） | 記憶／palaeo-electronica | **CONFIRMED-MULTI**（定性。PROXY: 硬骨魚類一般・ニジマス） | 各鱗は真皮ポケットに挿入され、ポケット外の部分も薄い皮膚（表皮）で覆われる。円鱗はサケなどの軟鰭類に多く、瓦状に重なる。2 層（骨質＋繊維層）も複数資料で一致。**鱗径(mm)／体長は依然 UNVERIFIABLE** | https://australian.museum/learn/animals/fishes/cycloid-and-ctenoid-scales/ ／ https://en.wikipedia.org/wiki/Fish_scale ／ https://repositorio.unesp.br/bitstream/handle/11449/111498/S1519-69842013000300023.pdf?sequence=1 ／ https://sites.harvard.edu/glauder/files/2022/03/Wainwright.Lauder.Mucus_.Matters.2018.pdf | 検索 #9。F-27（M）は定性面で PROXY 裏付けあり。「鱗を巨大な凹凸にせず、微細格子＋微弱な法線変調」という方針に変更なし |
| V-10 | 「サケ科／ヤマメの体色変化に特化した資料は見つかっていない」（F-12, C/PROXY：魚類一般） | binghamton ポスター | **CONTRADICTED（定性）** | **ニジマスで背景順応が実在**: 黒背景で血漿 α-MSH が上昇し皮膚が暗化（メラニン顆粒の分散）／α2 アドレナリン受容体作動でメラニン凝集→明るく見える。**稚魚(parr)の黒色素胞は光に直接応答せず、スモルトの黒色素胞は光応答（クリプトクロム・メラノプシン発現）**。ヤマメ自体は UNVERIFIABLE。変化の時定数（秒〜時間）は要約に無し | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4232760/ ／ https://nora.nerc.ac.uk/id/eprint/7671/ ／ https://research.chalmers.se/publication/123331 ／ https://www.cambridge.org/core/journals/animal/article/abs/genetic-covariation-in-skin-pigmentation-patterns-and-growth-in-rainbow-trout/EE2B7AA89CBE91ECD7687D19728CDA9A | 検索 #10。F-12 の「川底色に応じた体色変化の根拠にならない」は**撤回**。仕様に「背景順応（明暗）」の個体パラメータを任意で持たせる根拠になる（PROXY: ニジマス）。付随: 黒点（スポット）は真黒色素（eumelanin）をもつ色素胞（ニジマス・タイセイヨウサケ、要約） |
| V-11 | F-23〜F-25, F-28, F-30 の数値計算（転送行列・フレネル・スネルの窓・透過率）の再現 | ローカル計算（M 入力） | **再現 OK（算術は一致）** | §3 参照。算術上の誤りは見つからなかった | （ローカル計算。scratchpad の chk.py） | 入力値（n, 吸収係数）自体の真偽は V-03, V-04 のとおり |

---

## 2. 仕様書で使うべき「採用値」と「採用してはいけない値」

### 2.1 採用値（ランクと条件つき）

| 項目 | 採用 | 条件・ランク |
|---|---|---|
| 側面の銀色の作り方 | 広帯域・ほぼ無彩色の鏡面（環境反射）成分。角度で緩く色味が変わる程度の弱い虹色を上乗せ | 根拠: Jordan 2012（ニシン・イワシ, PROXY, V-05）＋写真 6/70（P, F-18）。サケ科の分光値は未取得なので「設計案」と明記 |
| 銀化度 s | 連続パラメータ。s↑でパーマーク／背色のコントラスト↓。グアニン結晶沈着が銀化の原因（一般則） | V-08 CONFIRMED-MULTI（一般則のみ）。量と外観の定量関係は仮定 |
| 鱗の表現 | 鱗縁・鱗列の微細な格子＋微弱な法線変調。鱗は表皮に覆われ重なる | V-09 CONFIRMED-MULTI（定性）。振幅の上限の目安: 体長 300 mm で突出約 0.1 mm（C, 種不明, 体長の約 0.03%） |
| 鱗ピッチ | 暫定 0.55–0.9 %SL（SL 200 mm で約 1.1–1.8 mm） | 「仮定」と明記。鱗数・列長・p042 の定義差が未解消（V-02） |
| 鰭条数 | 青森値（背 12–13／胸 12–14／腹 9／臀 12–14）を中心、F-05 の幅を裾。**背鰭・胸鰭は分散を大きめ** | V-01: 数値は単独（A）で未検証。変異が大きいという定性は支持 |
| 粘液・水膜の光学 | 水中: 粘液界面の鏡面反射は無視（n≈水）。空気中: 水膜と空気の界面にフレネル（垂直 2.0%、60° で 6%、70° で 13%、80° で 35%、85° で 58%） | 物理計算を再現（V-11, M 入力）。粘液の屈折率は M（Gap） |
| 水中の吸収 | 純水値を下限の目安として使い、**600 nm は 0.22–0.27 m⁻¹ の範囲**で扱う。実際の渓流は CDOM・懸濁で青側も減衰するので別パラメータ（水質）にする | V-03: UNVERIFIABLE を含む。スネルの窓 97.2°、水→空気の全反射臨界角 48.6° は物理（再現 OK） |
| 体色の背景順応 | 個体の「明暗」を背景に応じて変えるオプション。パーマーク・黒点の濃淡は黒色素胞の分散・凝集で表現 | V-10 CONFIRMED-MULTI（PROXY: ニジマス）。稚魚と銀化後で光応答が違う。時定数は未取得なので仮定 |
| 色素細胞の層順序 | 固定しない。「黒色素胞が上にあれば暗、虹・黄が露出すれば明」を一般則とし、パーマーク可視度を s の関数にする | V-06 CONFIRMED-SINGLE。ヤマメでの確認なし |

### 2.2 採用してはいけない値・記述

| 項目 | 理由 |
|---|---|
| 「グアニン n=1.83 と細胞質 n=1.34 は実測値」 | グアニンは強い複屈折（1.85/1.81/1.46）で、1.83 は等方近似。細胞質 n は要約に無く M（V-04） |
| F-23 の「グアニン 75 nm／細胞質 103 nm の四分の一波長」を実魚の層厚とすること | 計算上の理想化。別の要約は「約 100 nm のグアニン板」（PROXY・単独）とあり、層厚はサケ科で未確認 |
| 粘液層厚「500–600 Å／1–2 µm」（Harris & Hunt）をヤマメの粘液厚として使うこと | 何を測った値か不明な孫引きで、20 倍の幅があり、独立確認なし（V-07） |
| 粘液細胞高（夏 31.1 µm／冬 162.5 µm など, F-39） | 種不明（元ファイルも不採用） |
| 純水 a の M 値を最終値として固定すること（特に 600 nm = 0.22 の一点値） | 検索要約は 600 nm で約 0.266 と述べる。範囲で扱う（V-03） |
| 「MicroED でサケの結晶は β 多形」（F-33(d)） | 今回の検索要約は「サケで α 多形」と述べ、要約同士が矛盾。出典を確認できず、レンダリングにも不要。**どちらも採用しない** |
| 側線上横列鱗「43–56」（AI 生成百科） | C 単独で計数基準も不明（V-02） |
| 「サケ科の体色変化は不明」とする F-12 の注記 | ニジマスで背景順応が確認された（V-10）。ただしヤマメ固有の時定数は不明 |
| 鱗の出現体長 約 45 mm／約 30 mm／8–13 mm TL（F-40） | 種・文書不明で互いに矛盾（元の矛盾-16）。今回も未解消 |
| ヤマメの鰭条数を FishBase の属内範囲（チヌーク・ギンザケ・サケ）で置き換えること | 別種の値で、参考（PROXY）に限る |

---

## 3. ローカル再計算（検索なし・M 入力の算術チェック）

条件は元ファイルと同じ（n_guanine=1.83, n_cytoplasm=1.34, 周囲 n=1.34, λ0=550 nm, 無損失・平行平板・垂直入射）。

| 項目 | 元ファイルの値 | 再計算 | 判定 |
|---|---|---|---|
| 四分の一波長厚（グアニン／細胞質） | 75 nm／103 nm | 75.1 nm／102.6 nm | 一致 |
| R(550 nm), N=2/4/6/10/20 | 0.31/0.72/0.91/0.99/1.00 | 0.31/0.72/0.91/0.99/1.00 | 一致 |
| R(450 nm) | 0.19/0.08/0.08/0.00/0.00 | 0.19/0.08/0.08/0.00/0.00 | 一致 |
| R(650 nm) | 0.25/0.42/0.31/0.18/0.38 | 0.25/0.42/0.31/0.18/0.37 | 一致（丸め差 1） |
| 単一界面フレネル | グアニン/細胞質 2.4%、空気/水 2.04%、空気/粘液 2.11%、水/粘液 7×10⁻⁶、水/表皮 3×10⁻⁴ | 2.39%、2.04%、2.11%、6.9×10⁻⁶、3.0×10⁻⁴ | 一致 |
| N=10 の s 偏光ピーク波長（0/20/40/60°） | 550/525/455/≤380 nm | 550/525/454/380（下限）nm | 一致 |
| N=10 の p 偏光ピーク反射率 | 0.99/0.99/0.87/0.18 | 0.99/0.99/0.87/0.18 | 一致 |
| チャープ 20 対（450→650 nm）の反射率 | 0.16(400)…0.41(700) | 0.16/0.59/0.81/0.96/0.99/1.00/1.00/1.00/0.97/0.93/0.77/0.41（400/425/450/475/500/525/550/600/625/650/675/700） | 一致 |
| 水の 1/e 深さ（500/550/600/650/700 nm） | 49/16/4.5/2.9/1.6 m | 50.0/15.6/4.5/2.9/1.6 m | 一致（500 nm は a=0.0204 なら 49 m。丸め） |
| 純水の透過率（0.5/1/3 m） | 0.99/0.97/0.89/0.84/0.73 ほか | 0.99/0.98/0.90/0.84/0.73 ほか（3 m: 0.94/0.83/0.52/0.36/0.16） | 一致（0.01 の丸め差） |
| スネルの窓／臨界角 | 97.2°／48.6° | 97.21°／48.61° | 一致 |
| 水→空気の非偏光反射（45°/48°/49°） | 約 14%／約 43%／全反射 | 13.9%／43.3%／100% | 一致 |
| 空気→水の非偏光反射（0/60/70/80/85°） | 2.0/6/13/35/58% | 2.0/6/13.3/34.8/58.4% | 一致 |

追加の物理上の注意（M, 元ファイルの誤りではない）: 空気中で魚体を見るとき、水膜・皮膚内の屈折角は sinθ_int = sinθ_air / n により最大でも約 48° に制限される。したがって空気中の写真では、F-24 の「60° 以上で紫外側へシフト」まで色が動くことは起きにくく、虹色の角度依存は水中（内部角と見込み角が近い）の方が大きい。写真で虹色の言及が少ない（6/70, F-18）ことと矛盾しない。

---

## 4. 検索ログ（11 回, すべて mode="standard"）

有用度: 高=判定に直接使えた／中=定性的に使えた／低=ほぼ得るものなし。

| # | クエリ（要旨） | ドメイン指定 | 有用度 | 得られたもの |
|---|---|---|---|---|
| 1 | ヤマメ 背鰭条数 臀鰭条数 胸鰭条数 側線鱗数 側線上方横列鱗数 形態 計数 サクラマス | jstage, fishbase.se, zukan-bouz, kahaku, affrc | 低 | 数値は要約に出ず。計数形質の解説ページ（kahaku）と図鑑ページの所在のみ → V-01, V-02 |
| 2 | Oncorhynchus masou masu salmon meristic counts dorsal fin rays anal fin rays pectoral fin rays scales in lateral line pyloric caeca gill rakers | なし | 中 | 北海道 7 河川個体群の計数形質の比較で背・胸鰭条数が変異大（数値なし）→ V-01 |
| 3 | pure water absorption coefficient m-1 550 nm 0.0565 600 nm 0.2224 650 nm 0.34 700 nm 0.6244 Pope Fry 1997 table | なし | 低 | 数値は要約に出ず。標準データとしての位置づけのみ → V-03 |
| 4 | guanine crystal refractive index n=1.83 in-plane cytoplasm refractive index 1.33 silvery fish iridophore multilayer reflector layer thickness nm salmonid OR trout OR salmon | なし | 高 | グアニン n=1.83、結晶の複屈折 1.85/1.81/1.46、サケ科の parr→smolt でグアニン沈着、MicroED のサケの多形（α と要約）→ V-04, V-05, V-08 |
| 5 | parr marks rainbow trout OR Atlantic salmon OR masu salmon skin melanophores iridophores xanthophores dermis layers histology parr mark pigment cells location | なし | 中 | 色素細胞の層構成（元と同一 URL＋新規の細部）、黒点は eumelanin の色素胞 → V-06, V-10 |
| 6 | Atlantic salmon skin mucus layer thickness micrometres measured histology OR cryosection mucus thickness 10 µm 50 µm salmonid epidermis | なし | 低 | 粘液厚の直接測定法が無いこと、凍結切片での保存の不安定性。数値なし（呼び出し内で追加検索が内部的に走った）→ V-07 |
| 7 | FishBase Oncorhynchus masou Dorsal soft rays (total) Anal soft rays (total) Vertebrae masu salmon cherry salmon diagnosis | fishbase.se/.us/.org, wikipedia.org, fishbase.mnhn.fr | 中 | O. masou のページは出ず。チヌーク・ギンザケ・サケの背・臀鰭条数（PROXY）→ V-01 |
| 8 | サクラマス ヤマメ 銀毛化 皮膚 グアニン ヒポキサンチン 増加 パー シルバーパー スモルト 体色 銀白色 変化 | jstage, 北大 eprints, cir.nii, repo.nii, agriknowledge | 中 | 銀毛化の時期・割合の記述（出典特定不能）、グアニン結晶＝反射板で構造色 → V-08 |
| 9 | teleost cycloid scales covered by epidermis embedded in dermal scale pockets imbricated overlapping scales salmonid scale exposed portion posterior field | なし | 中 | 鱗が真皮ポケットに挿入され薄い皮膚で覆われる、2 層構造、瓦状配列（定性）→ V-09 |
| 10 | rainbow trout OR Atlantic salmon OR salmonid background adaptation skin darkening lightening melanophore aggregation dispersion black versus white background physiological colour change | なし | 高 | ニジマスの背景順応（α-MSH, 凝集・分散）、parr の黒色素胞は光非感受／smolt は光応答 → V-10 |
| 11 | absorption coefficient of pure water at 600 nm is about 0.22 m-1 at 700 nm about 0.6 m-1 red light attenuated within metres, minimum near 420 nm 0.01 m-1 Pope and Fry | oceanopticsbook, omlc, pmc, opg.optica, nasa, wikipedia | 中 | 600 nm 約 0.266 m⁻¹、最小 418 nm で 0.0044 m⁻¹（減衰長 約 227 m）→ V-03 |

予算: 11/11 使用。拒否（"Web search was not performed"）は一度も出ていないため、迂回の必要は生じなかった。

---

## 5. 元ファイルへの反映が必要な修正点（優先順）

1. **F-12 を修正**: 「サケ科に特化した資料は見つかっていない」は誤り。ニジマスで背景順応（α-MSH による暗化、メラニン凝集による明化）が確認でき、稚魚の黒色素胞は光非感受・スモルトでは光応答する（V-10）。Gap の「体色変化」を PROXY ありに更新する。
2. **F-22/F-23/F-24 に「グアニン結晶は強い複屈折（1.85/1.81/1.46）。n=1.83 は等方近似」と注記**し、層厚・屈折率は仮定パラメータであることを再度明記する（V-04）。
3. **F-30 の 600 nm の値に範囲（0.22–0.27 m⁻¹）を併記**し、最小吸収（418 nm で 0.0044 m⁻¹）を追記する。M の値の不確かさは「±10%」では足りない（V-03）。
4. **F-33(d) の多形（β）に「今回の検索は α と要約し矛盾」と注記**し、採用しない（レンダリングに不要）。
5. **F-34/F-35 の層順序に「基底膜近くに虹色素胞（黒色素胞が囲む）、その下に黄色素胞」という別記述あり」を並記**する（V-06）。
6. F-04（鰭条数）・F-06/F-07（鱗数）は**今回の検索 3 回（#1, #2, #7）でも独立確認できなかった**ことを備考に追記。背・胸鰭条数の分散を大きくする根拠（V-01）は追加してよい。
