# 頭蓋・顎・鰓蓋・鰓弓・舌骨の骨格と動き（ヤマメ O. masou masou 河川型／サケ科）— 透明骨格標本画像の解析つき

> 作成: ストリームR15（頭蓋・顎・鰓蓋・鰓弓・舌骨担当）。目的は、ヤマメの3Dモデルの口・顔・鰓の骨格と動きの仕様根拠の収集。
> **この版（改訂版）の位置づけ**: 初版は WebSearch 予算が尽きた状態で書かれ（検索0回）、根拠は P・継承・M のみだった。本改訂では WebSearch を **34 回**（呼び出し回数。すべて mode="standard"、割当の上限ちょうど。拒否は発生せず）実行し、課題2〜6の裏取りを試みた。初版の P 所見（標本画像 s01.jpg の解析、F-01〜F-11）は**そのまま残した**。
> 根拠の種類は次の4つ。
> 1. **P**: ユーザー提供の透明骨格標本画像 s01.jpg（366×550 px）のグリッド付きズームと簡単な画素プロファイル解析。座標は s01.jpg の元画素座標。
> 2. **検索（A/B/C）**: 今回の WebSearch。検索結果は「題名・URL・モデルが作った要約」だけで本文を読めていないため、**要約文中に明示された記述だけを採用**し、要約と URL の対応が特定できないものは「出典候補」として並記して、ランクを一段下げた。
> 3. **継承**: 先行ストリーム r01 / r02 / r07 / r10 の検索結果（再検索していない）。
> 4. **M**: 私の記憶（**未検証**）。
> **今回の検索で分かったこと／分からなかったこと**: ニジマスの脊椎骨63（体幹33＋尾椎30）、舌咬み装置の歯板の配置、ブルックトラウトの raking の定量（頭蓋挙上36°、49 ms）、サケ科の尾部骨格の一般型（下尾骨6・尾神経棘3）、換気の位相などは取得できた。**一方、サケ科の顎の回転角・最大開口角・鰓蓋の外転角・鰓条骨の本数・歯の本数・担鰭骨の本数・ヤマメ固有の脊椎骨数と腹椎／尾椎の内訳は、今回の検索でも見つからなかった**（Gaps に明記）。M の記述は、仕様に採用する前に必ず検証すること。

---

## 1. 要約（仕様に直結する結論）

### 1-A. 標本画像 s01.jpg から言えること（P）

1. **画像は頭を下にした像で、可視域は「頭部＋体幹の腹椎域〜尾椎域の前半」まで。尾部（下尾骨・尾鰭支持骨）は画角外**。このため脊椎骨の総数、腹椎と尾椎の境界、尾部骨格はこの画像から計測できない。[F-01, F-02, F-10]
2. **向きは「画像左＝腹側、右＝背側」で整合する**。根拠は、(a) 細く長い肋骨の扇が左側にだけ出る、(b) 背鰭らしい大きな鰭条の扇が右、腹鰭と臀鰭らしい鰭が左にある、の2点（ただし推定）。[F-01, F-03, F-04, F-05, F-06]
3. **脊柱は、y≈126〜349 の範囲で約33〜34節を分解でき、周期（ピッチ）は平均≈6.6 px（5〜8 px）**。頭に近づくほど周期が短く（5〜6 px）なるのは、遠近の短縮による。y<126 は神経棘・血管棘が重なって節が分解できない。同じ周期なら y 0〜126 に約19節あり、可視域は合計およそ50節強と見積もれるが、これは外挿（推論）。[F-02]
4. **神経棘（右）と血管棘（左）は、細く密で、先端が尾の方向（画像の上）へ向く「魚の骨のヘリンボーン」配置**。腹椎域（y≈190〜345）では左側に、細く長い湾曲した肋骨様の線が扇状に出る（脊柱から約70〜90 px、すなわち椎間周期の約11〜14倍）。右の神経棘は同じ高さで約15〜25 px（周期の約2〜4倍）と短い（目測）。[F-03]
5. **背鰭は鰭条が約12〜14本（3本の走査線で 14/13/12）、鰭条の基部にあたる棒状の担鰭骨列に12〜15個の塊が見える**（ボケのため要確認）。青森のヤマメの背鰭条 12〜13（A、継承）と矛盾しない。[F-04, F-15]
6. **臀鰭は、基部の棒状の担鰭骨列に10〜11個の塊があり、鰭条は片側の群で7〜9本が分解できた（重なりのため下限）**。腹鰭は鰭条5〜7本が分解でき、腰帯の前方への細い突起（基鰭骨の前突起と思われる）が y≈205 まで伸びる。いずれも下限の値で、文献の 11〜14（臀）・8〜9（腹）の検証には使えない。[F-05, F-06]
7. **頭部は前腹側から斜めに、強く短縮して写る**。濃青の骨の塊（x≈150〜268、y≈335〜478）、顎先端は (195〜205, 470〜477)。左半分（x≈158〜195、y≈410〜475）に先端へ収束する細長い濃青の骨が2〜3本あり、その内側に**明るい点が縦に並ぶ列（約6〜10点、(176〜192, 436〜470)）が見え、歯列の可能性が高い（個数は数えられない）**。右には薄い青緑の丸い板状域（x≈205〜255、y≈400〜472）があり、鰓蓋系の薄い骨か口蓋側の構造かは**同定できない**。[F-08, F-09]
8. **標本はほぼ全体が青〜青緑一色で、骨と軟骨を色で区別できない**。この画像から骨化の程度は言えない。[F-10]

### 1-B. 文献由来（継承＋今回の検索）と記憶（M）

9. **脊椎骨数（ヤマメ／O. masou）**は 63〜66（ロシア系資料、C）、63〜69（AI生成百科、C）、単一値63（C）。他の Oncorhynchus（PROXY、FishBase、B）はギンザケ61〜69、キングサーモン67〜75、シロザケ59〜71、ベニザケ56〜67、ニジマス60〜66。台湾亜種は日本産より少ない（B）。北海道7河川で集団間に有意差（A）。**今回の検索でも O. masou の FishBase 値や一次文献の値は取得できなかった**。個体差生成は 63〜69 を仮置き（推論）とし、集団別の軸を持たせる。[F-12, F-13, F-14]
10. **腹椎／尾椎の内訳**: ニジマス（PROXY）は総数63＝体幹椎33＋尾椎30（B）。33/63 は約52%（算術）。ヤマメの内訳は未取得。腹椎数・尾椎数には遺伝成分がある（A）。発生初期の水温でも脊椎骨数の平均が変わる（B。サクラマスの飼育試験で 16 °C 区が 9・12 °C 区より多い傾向）。[F-33, F-34, F-14]
11. **鰭条数**: 青森ヤマメ（河川型、A）は背12〜13、胸12〜14、腹9、臀12〜14。二次資料はこれより広い（C）。ニジマス（PROXY、B）は背鰭＝不分枝4＋分枝10〜12、臀鰭＝不分枝3＋分枝6〜12。尾鰭の主鰭条は O. mykiss で19本（B）。担鰭骨の本数は未取得（検索で得た「背鰭7〜9本」等は採用しない）。[F-15, F-16, F-17, F-40, F-41]
12. **鰓耙・鰓弓・鰓条骨**: O. masou の鰓耙は 16〜22（大半18〜19）（C）。ニジマス（PROXY、B）は鰓弓4対、第1鰓弓の鰓耙17〜21（別資料16〜17）。Oncorhynchus の古い記載では「サケ型：鰓耙20〜40・鰓条骨12〜16」「マス型：鰓耙10〜15・鰓条骨10〜14」（C、種の帰属不明）。**ヤマメの鰓条骨の本数は今回も確認できない**（青森の「11」は曖昧）。[F-18, F-19, F-39, F-48]
13. **歯**: ニジマス（PROXY、B/C）は前上顎骨・主上顎骨・歯骨・口蓋骨・鋤骨柄・舌に、小さく円錐形で内側へ曲がった歯を持ち、鋤骨の歯は1〜2列。咽頭にも歯がある。**舌咬み装置は、基舌骨（舌）の歯板と、鋤骨・副蝶形骨・口蓋骨（dermopalatine）・翼状骨の対向歯板で構成される**（B）。Salmo では咽頭歯板が2対あり、成魚でも鰓弓の骨と癒合しない（B/C）。歯の本数・大きさは未取得。[F-20, F-21, F-38, F-39]
14. **懸垂骨と骨の参照先**: 舌顎骨は耳殻（舌顎窩）に背側で関節し、腹側は方形骨と続骨に関節して、鰓蓋骨を支える（ニジマス、B）。鰓蓋骨系4枚（鰓蓋・前鰓蓋・下鰓蓋・間鰓蓋）と鰓条骨は、Idaho Virtual Museum のニジマス（スチールヘッド）標本ページに個別要素として載る（モデリング用の参照先、B）。[F-36, F-37]
15. **顎・舌骨・鰓蓋の運動順序（PROXY：吸引摂食の硬骨魚類一般、A）**: 頭蓋挙上と下顎押し下げが先、舌骨押し下げ・鰓蓋の外転・胸帯の後退が後。鰓蓋リンクにより、下顎押し下げは舌骨の動きと独立に位相をずらせる。下顎は最大開口で押し下げが止まるが舌骨は後退を続け、鰓蓋の外転は顎が開き始めてから始まり、顎が閉じ始めてからピークになる。**サケ科自身の時間経過と角度は見つからなかった**。捕食では体の突進（body ram）が主要因で吸引の寄与は小さい（棘鰭類40種、PROXY。サケ科は含まれない）。[F-43, F-44, F-23, F-24]
16. **頭の挙上量（行動で別の値）**: ニジマスの捕食ストライクで神経頭蓋の最大挙上 2〜18°（A）。ブルックトラウト（PROXY：イワナ属）の raking のパワーストロークでは平均36°（口を開けたままの咀嚼は16°）、胸帯の後退 0.85 cm（頭長の21%）、所要時間 平均49 ms（咀嚼は77 ms）（A）。動作モード別に別プリセットを持たせる。[F-22, F-45]
17. **換気**: ニジマスの換気頻度 0.95〜1.3 Hz（周期0.77〜1.05 s、A）。運動後は周期でなく振幅が増える（A）。位相はトラウトで、口腔の拡張が鰓蓋外転の開始の約1/4周期前に始まる（B。要約の表記に揺れあり、要確認）。[F-26, F-46]
18. **繁殖期の顎と外観**: Oncorhynchus は上顎、Salmo・Salvelinus は下顎の変形が特徴的（A、レビュー）。ただし写真の産卵期の雄2枚は下顎先端の上向きフックが明瞭（P）。口を閉じた21枚で、上顎後端は眼の後縁より後方11・眼中心直下9・前下方1（P）。鰓蓋は大きく丸く、前鰓蓋の弧と縦溝、後縁に黄〜白の縁（P）。顎のモーフは「上顎の伸び・下曲がり」と「下顎先端のフック」を別チャンネルにする。[F-25, F-11]
19. **尾部骨格と頭部比率**: サケ科の一般型は下尾骨6・尾神経棘（uroneural）3（A、イワナ属の研究。一部個体は7と4）。上尾骨（epural）の本数は未取得。台湾亜種（PROXY、C）の頭部比は、体長/頭長 4.20、頭長/吻長 4.41、頭長/眼径 3.43、頭長/眼間幅 4.12。[F-42, F-49, F-17]
20. **（M／推論、未検証）リギング**: 顎・舌骨・鰓蓋を連動する一体のリンク機構として組み、1本の駆動値で下顎の押し下げ、主上顎骨の回転、舌骨の押し下げ、鰓蓋の外転、鰓条骨膜の展開をつなぐ。順序は F-43、振幅は F-22 / F-45、周期は F-26 / F-46 を使い、**角度・係数は文献値が無いためパラメータとして露出させる**。[F-28, F-29, F-32]

---

## 2. Findings

### F-01
- 主張/値: 画像 s01.jpg（366×550 px、透明骨格標本、ガラス容器内）の概要。上辺（x≈0〜170、y≈0〜12）に標本ラベルの断片があり、"…ncorhynchus" 様の文字が途中で切れて見える程度で、**種は判読できない**（ユーザー情報でも種の確証なし）。
  - 向き: 頭が下。頭部は y≈335〜478、顎先端 ≈(200, 475)。脊柱は頭から上へ伸び、上辺 (222, 0) で画角外に出る。尾部は画角外。
  - 脊柱の中心線: (222,0) → (227,60) → (232,120) → (236,180) → (249,260) → (253,320) → (241,340) と、右へ約30 px 振れてから頭に入る緩いS字。
  - 向きの推定: 左＝腹側、右＝背側。根拠は肋骨の扇が左のみ、背鰭様の扇が右、腹鰭様・臀鰭様が左、の3点（本ストリームの推定）。
  - 体のスケール（mm）は不明。スケールバーなし。体長・個体サイズは不明。
  - 色: 全体が青（脊椎・頭部は濃青、鰭条・肋骨は青緑〜淡い青緑）。
- 適用範囲: 種不明の Oncorhynchus 属らしき透明骨格標本1個体（ユーザー提供の情報による）。ヤマメに限定できない。個体サイズ、固定・染色法、年齢は不明。
- 出典: /tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/skeleton/s01.jpg（ユーザー提供画像）。解析は tools/photo/grid.py によるグリッド付きズームと、numpy による画素プロファイルの簡易計数。
- 証拠: [P] 画像の直接観察（グリッド座標で記録）。

### F-02
- 主張/値: 脊柱の椎骨の見え方。
  - y≈126〜349 の範囲で、脊柱中心線に沿った明暗の周期から**約34個の明部ピーク＝約33節の椎間**が検出できた。周期は 5〜8 px（平均≈6.6 px）。y≈190〜260 は約7 px、y≈330〜349 は5〜6 px で、頭に近づくほど短い（遠近の短縮、または頭部付近の椎骨が短いかは、この画像からは区別できない）。
  - y<126 は両側の棘が重なり、節が分解できない（ピーク検出は無効）。
  - 外挿（推論）: y 0〜126 が同じ周期 6.6 px なら約19節、可視域は合計およそ50節強。文献の総数（F-12、63〜69）と比べると、尾端側の約10〜15節が画角外にあることになる（推論であり、実測ではない）。
  - 椎体の見かけの縦横比: y≈260〜300 で幅≈12〜15 px、周期≈6.6 px（長さ／幅 ≈0.45〜0.55）。ただし画像のボケと視点の傾きがあり、**椎体のアスペクト比としては採用しない**。
  - 頭との境界: 脊柱が頭に入るのは ≈(238〜245, 345〜375)。そこに濃い暗点 ≈(222〜228, 380〜388) があるが、同定できない。最初の数個の椎骨は頭部の濃青の下に隠れる。
  - 鰭の位置を「頭側の脊柱入口から数えた椎骨番号」に換算すると、**腹鰭の基部は約26番付近、背鰭の範囲は約18〜34番付近、臀鰭は約38〜48番付近**（y 方向の距離を周期6.6 pxで割った概算。y<126 の周期は外挿のため臀鰭は信頼度低、頭側の隠れた椎骨と遠近の短縮のため全体に±3〜5）。
- 適用範囲: s01.jpg の1個体、種不明。遠近の影響を含む。
- 出典: s01.jpg（ユーザー提供）。
- 証拠: [P] 脊柱中心の画素プロファイル（赤チャンネル）の局所ピーク検出。周期の列は 7,6,8,6,7,5,8,6,7,7,7,6,7,7,7,7,7,6,7,7,6,7,6,7,6,7,6,6,6,6,5,5 px（y=126以降）。

### F-03
- 主張/値: 神経棘・血管棘・肋骨の見え方（座標は s01 の元画素）。
  - **右（背側）の神経棘**: 脊柱の右縁から出る細く密な棘が、y≈0〜130（x≈245〜275）と y≈190〜300（x≈255〜280）に見える。先端は尾の側（画像の上）へ傾く。同じ高さの腹椎域では長さ約15〜25 px（目測、椎間周期の約2〜4倍）。
  - **左（腹側）**: y≈0〜125（x≈190〜220）は、血管棘（尾椎域）が右の神経棘と同様に細く密で、先端は尾側へ向く。
  - **y≈190〜345（x≈160〜245）は、細く長く湾曲した肋骨様の線が扇状に出る**。遠位端は x≈160〜190、脊柱からの距離は約70〜90 px（椎間周期の約11〜14倍、棘の約3〜5倍）。頭の側に近いほど肋骨が短く、頭側へ湾曲する。
  - 計数: 垂直の走査線（x=180/190/200/210、y=190〜300 を横切る）で、肋骨様の暗線の交差が 25 / 26 / 24 / 23 本（約4.2 px間隔）。椎間周期（6.6 px）より密で、**1椎骨あたり1.5本前後に見える**。肋骨が扇状に広がる幾何学（斜めの交差）の影響か、肋骨（pleural ribs）に加えて別の細い骨（上肋骨や筋間骨の類）が同時に写っているかは**区別できない**。
  - y≈125〜190 は移行域で、左側の棘は肋骨へ連続的に長くなる。
  - 未同定の細い線: (165〜245, 275〜288) に、扇の中を横切る細い青緑のフィラメントがあり、脊柱側の端が太い。転位した肋骨か、別の構造かは不明。
  - (170〜230, 280〜340) は肋骨がまばらな空白域。
- 適用範囲: s01.jpg の1個体、種不明。
- 出典: s01.jpg（ユーザー提供）。
- 証拠: [P] グリッド付きズーム（x100〜366 × y0〜200、x100〜366 × y180〜360）と垂直走査線のピーク計数（閾値と平滑化に依存。±2本程度の誤差）。

### F-04
- 主張/値: **背鰭（と推定）**の骨格。
  - 範囲: x≈280〜352、y≈125〜232。右側（背側）。
  - 担鰭骨列: (288,150) → (308,222) に沿う棒状構造で、ここに12〜15個の塊（3本の走査線で 14 / 15 / 12 個）。ボケのため、個々の担鰭骨（近位・中間・遠位の分節）は区別できない。
  - 鰭条: 扇状に広がる平行な細い線で、**約12〜14本**（鰭条に垂直な3本の走査線で 14 / 13 / 12）。鰭条は基部から尾側（画像の右上）へ向かい、脊柱軸からの傾きは約40°（(288,215) → (345,150) の方向）。鰭条はやや湾曲（外側が凸）。分節（鰭条の横線）や分岐は、解像度が足りず見えない。
  - 位置: 腹鰭らしい鰭の基部（y≈170〜180）より約50 px（約7椎骨相当）前方（画像の下）が背鰭の起点（y≈225〜230）で、**腹鰭の起点は背鰭基底の後半の下にある**ように見える。
- 適用範囲: s01.jpg の1個体、種不明。標本の鰭が広げられているかは不明（固定時の姿勢）。
- 出典: s01.jpg（ユーザー提供）。
- 証拠: [P] ズーム（x270〜366 × y110〜240、8倍）と走査線計数。

### F-05
- 主張/値: **臀鰭（と推定）**の骨格。
  - 範囲: x≈105〜195、y≈30〜105。左側（腹側）で、脊柱から約50〜60 px 離れている（鰭が試料の姿勢でカメラ側に開いて写る）。
  - 担鰭骨列: (180,42) → (166,88) に沿う棒状構造で、10〜11個の塊（3本の走査線で 10 / 10 / 11）。
  - 鰭条: 棒の左側へ約-30°で並ぶ平行線の群が、**分解できたもので約7〜9本**（走査線で 9 / 6 / 7。鰭が重なりボケているため下限）。棒の右側にも淡い線が数本見え、同じ鰭の続きか別の構造かは不明。
  - 位置: 脊柱上の椎骨番号で約38〜48番付近（F-02の外挿に依存、信頼度低）。
- 適用範囲: s01.jpg の1個体、種不明。
- 出典: s01.jpg（ユーザー提供）。
- 証拠: [P] ズーム（x100〜200 × y20〜120、8倍）と走査線計数。

### F-06
- 主張/値: **腹鰭（と推定）と腰帯**。
  - 範囲: x≈112〜165、y≈130〜205（鰭条部）。左側。
  - 鰭条: 左上方向へ放射する線が**約5〜7本**（走査線で 5 / 6 / 6）。鰭条同士と基部が重なる。
  - 腰帯: 鰭の基部から細い突起が y≈205 まで下（頭側）へ伸びる（x≈150〜160）。**基鰭骨（腰帯）の前方への突起**と見られるが断定できない。
  - 基部の位置は、背鰭基底の後半の側方（F-04）。
- 適用範囲: s01.jpg の1個体、種不明。
- 出典: s01.jpg（ユーザー提供）。
- 証拠: [P] ズーム（x100〜180 × y120〜210、8倍）。

### F-07
- 主張/値: **胸鰭・胸鰭帯の領域**は写りが弱い。
  - (110〜175, 290〜350) に、焦点の外れた淡い青緑の細い線の束（胸鰭条と思われる、数えられない）。
  - (162〜175, 292〜345) に、頭から上方へ湾曲して伸びる細い濃い青緑の突起。**烏口骨（cleithrum）などの胸鰭帯の一部の可能性**があるが同定できない。
  - 肩甲骨・烏口骨・基鰭骨の配置、担鰭骨（radials）の数は読み取れない。
- 適用範囲: s01.jpg の1個体、種不明。
- 出典: s01.jpg（ユーザー提供）。
- 証拠: [P] ズーム（x100〜220 × y270〜360、8倍）。

### F-08
- 主張/値: **頭部（顎と歯）の写り方**。
  - 全体: 前腹側からの斜視で、頭が強く短縮する。濃青の塊は x≈150〜268、y≈335〜478。顎先端は ≈(195〜205, 470〜477)。
  - 顎: 左半分 (158〜195, 410〜475) に、先端へ収束する細長い濃青の骨が2〜3本。外側の1本に細長い明条（(160〜168, 412〜440)）が付く。**前上顎骨・主上顎骨・歯骨のどれがどの線かは、この画像からは同定できない**。
  - 歯: 内側の2本の間に、**明るい点が縦に並ぶ列（約6〜10点、(176〜192, 436〜470)）**が見える。歯列の可能性が高いが、個数・大きさ・どの骨かは言えない。
  - 右半分: 薄い青緑の丸い板状域（x≈205〜255、y≈400〜472）が、顎先端のすぐ右に接する。外縁に沿って濃青の暗い縁が (200,475) → (262,395) → (268,385) と走る。薄い板状骨（鰓蓋系）か、口蓋側・舌骨側の構造かは判別不能。
  - 頭頂側（画像の上）: 暗い弧状の帯が (160,372) → (200,345) → (240,350) に走り、頭の後縁（鰓蓋系・肩帯の縁）の可能性がある（同定できない）。
- 適用範囲: s01.jpg の1個体、種不明。
- 出典: s01.jpg（ユーザー提供）。
- 証拠: [P] ズーム（x100〜300 × y300〜500、7倍。x140〜260 × y380〜480、10倍でコントラスト強調）。

### F-09
- 主張/値: **鰓蓋・鰓域の写り方**。
  - (150〜190, 360〜395) に、湾曲した平行線の扇状の縞が見える。**鰓条骨（branchiostegal rays）か、鰓耙・鰓弁（gill rakers / filaments）の候補**だが、本数を数えられず、どちらか決められない。
  - 鰓蓋骨系（鰓蓋・前鰓蓋・間鰓蓋・下鰓蓋）の個々の骨の輪郭は分離して見えない（重なり、短縮、ボケ）。
  - 鰓弓（4対）、咽頭歯、舌骨弓の個々の要素は識別できない。
- 適用範囲: s01.jpg の1個体、種不明。
- 出典: s01.jpg（ユーザー提供）。
- 証拠: [P] ズーム（x100〜300 × y300〜500）。

### F-10
- 主張/値: **この画像から言えないこと／言えること**（解像度・視点・画角の限界）。
  - 言えない: (1) 椎骨の総数、腹椎／尾椎の境界、尾部骨格（下尾骨・尾神経棘・尾鰭支持）— 画角外。(2) 前上顎骨・主上顎骨・上主上顎骨・歯骨・関節骨・方形骨・舌顎骨・鰓蓋骨系の個々の同定と接続 — 短縮・重なり・ボケ。(3) 歯の本数と大きさ。(4) 鰓条骨の本数、鰓弓4対、鰓耙数、咽頭歯。(5) 担鰭骨の本数と鰭条の分節・分岐。(6) 種の同定、サイズ。(7) 骨と軟骨の区別（全体が青系一色。M: 通常の二重染色は骨を赤、軟骨を青に染めるため、この標本は単染色か画像処理の可能性があるが未確認）。(8) 実際の可動域（固定標本）。
  - 言える: 脊柱の周期（約6.6 px）と椎骨のヘリンボーン配置、腹側に肋骨の扇、背鰭・腹鰭・臀鰭らしい鰭の相対位置と鰭条数のおおよその目安（下限）、顎先端に歯列らしい構造があること、頭部に薄い板状域があること。
  - 画素解像度の目安: 椎骨1節が約6〜7 px、鰭条の間隔が約3〜5 px。細部の同定にはこの2〜3倍以上の解像度が必要。
- 適用範囲: s01.jpg。
- 出典: s01.jpg（ユーザー提供）。
- 証拠: [P] 直接観察と、本書の F-02〜F-09 の限界。

### F-11
- 主張/値: **写真70枚（yamame ラベル57枚）由来の口・顎・鰓蓋の外部所見**（先行 r07 の集計を継承、写真の再注釈はしていない）。
  - 上顎後端と眼: 口を閉じた34枚のうち上顎後端が判別できた21枚で、眼後縁より後方（behind_eye）11、眼中心直下（below_center）9、眼の前下方1。判別不能13枚。開口時は上顎が後方へ引かれて見えるため過大（例: 産卵期の雄 p034 は眼中心の約2眼径後方）。
  - 吻・顎: 吻は「丸い・鈍い」が基本。上顎が下顎よりわずかに前に出る記述が18枚。p024（大型成魚）は下顎が太く長い（約0.57頭長）。開口は18枚。p001 の開口では下顎が約10〜12 px 下がる（その写真の縮尺）。p012 は舌が桃色。
  - 鰓蓋: 大きく丸い。前鰓蓋の弧が見える写真が複数（p022、p024、p033、p041、p047）。p022・p024 は前鰓蓋と主鰓蓋の間に縦溝。後縁は滑らかな弧で、黄〜白の縁取りと白い鰓膜。鰓膜の下端は胸鰭基部まで（p041）。放射状の筋や貝殻状の隆起の記述が7枚。
  - 産卵期の雄（p012、p034）: 下顎先端が上向きに反ったフック（上顎先端とかみ合う）。
  - 撮影バイアス: 57枚中、ルアーや毛鉤が掛かっているのが11枚、開口が18枚。
- 適用範囲: 参照写真（釣果、図鑑、水槽等）の注釈。パー〜成魚、雌雄混在。
- 出典: docs/yamame/photo_analysis/catalog_c0N.json（head_mouth の各項目）と r07（F-14, F-15, F-18, F-22）。
- 証拠: [P] catalog の `head_mouth.maxilla_end_vs_eye`、`opercle_notes` の集計。本ストリームでは catalog 全文（c01〜c07）を機械検索し、歯・舌・鰓弁・鰓耙に触れる記述が p012 の「舌は桃色」1件のみで、歯の記述は無い（「歯車状」は眼の虹彩の形容）ことを確認した。したがって写真由来の歯列の所見は無い。

### F-12
- 主張/値: O. masou の脊椎骨数。(a) 英語 Wikipedia 系の記述: **63〜66**。(b) Grokipedia（AI生成百科）: **63〜69**。(c) 日本語の二次資料の単一値: **63**（個体か代表値か不明、n・範囲なし）。
  - ロシア極東系の記述が出典と推測されるが、要約には原典が無い。
  - 台湾亜種 O. m. formosanus は、日本産亜種より脊椎骨・臀鰭条・胸鰭条が少ないと報告されている（B、r02 F-02）。
- 適用範囲: (a) O. masou 種全体（主に降海型成魚の記述）、(b) 種全体（AI生成）、(c) サクラマス／ヤマメ（亜種 masou）。**ヤマメ（河川型）固有の値ではない**。
- 出典（継承 r01 F-10, F-11, r02 F-07, r02 F-02）:
  - https://en.wikipedia.org/wiki/Oncorhynchus_masou
  - https://animalia.bio/oncorhynchus-masou
  - https://www.wikiwand.com/en/articles/Masu_salmon
  - https://grokipedia.com/page/Oncorhynchus_masou
  - https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html （日本語の候補。帰属未確定）
- 証拠: [C] "gill rays are very short, 18–22 ... vertebrae 63–66"（r01 F-10 の要約）。AI生成の (b) は最低信頼。URL と文の対応は特定不能。

### F-13
- 主張/値: **PROXY（FishBase の他種 Oncorhynchus）の脊椎骨数**: ギンザケ 61〜69、キングサーモン 67〜75、シロザケ 59〜71、ベニザケ 56〜67、ニジマス 60〜66（背鰭軟条／臀鰭軟条は r01 F-29 参照）。O. masou の FishBase 値は取得できていない。
- 適用範囲: **PROXY: O. kisutch, O. tshawytscha, O. keta, O. nerka, O. mykiss**。ヤマメの値として使用不可。属内の幅の目安のみ。
- 出典（継承 r01 F-29）:
  - https://www.fishbase.se/summary/Oncorhynchus-kisutch.html
  - https://fishbase.se/summary/241
  - https://www.fishbase.se/summary/oncorhynchus-nerka.html
  - https://fishbase.se/summary/Oncorhynchus-tshawytscha
  - https://www.fishbase.se/summary/oncorhynchus-mykiss.html
- 証拠: [B] "O. kisutch: 9-13 dorsal soft rays, 12-17 anal soft rays, 61-69 vertebrae"（要約）。

### F-14
- 主張/値: **計数形質の集団間差と遺伝成分**。
  - 北海道日本海側7河川のサクラマス集団（1990年5〜6月採集、1歳魚が93%）で、**脊椎骨、下鰓耙、背鰭条、胸鰭条、臀鰭条の5形質で集団間に有意差（ANOVA）。腹鰭条と上鰓耙は有意差なし**。平均値・SDは要約に無し。
  - サクラマスの**腹椎数と尾椎数には遺伝成分がある**（遺伝率・遺伝相関が推定されたが数値は要約に無し）。
- 適用範囲: O. m. masou、北海道日本海側の河川（1歳魚中心）。腹椎・尾椎の個数は未取得。
- 出典（継承 r02 F-08, F-09）:
  - Mano S., Kanno Y., Kinoshita T., Maeda T., Kyushin K. (1991) 北海道日本海側河川のサクラマス集団の計数形質。 https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57
  - Ando D., Mano S., Koide N., Nakajima M. (2008) "Estimation of heritability and genetic correlation of number of abdominal and caudal vertebrae in masu salmon", Fisheries Science 74:293-298。 https://link.springer.com/article/10.1111/j.1444-2906.2008.01531.x
- 証拠: [A] "significant differences in the means were observed in regards to five characters (vertebrae, lower gill rakers, dorsal fin rays, pectoral fin rays and anal fin rays) among seven populations."／"suggest that abdominal and caudal vertebrae are governed by genetic components"（検索要約。タイトル水準の確認が中心）。

### F-15
- 主張/値: **青森県のヤマメ（河川型）の外部形態（鰭条）**: 背鰭条 12〜13 軟条、胸鰭条 12〜14、腹鰭条 9、尻（臀）鰭条 12〜14（同報告にパーマーク8〜10個、側線鱗118〜134）。別の記述として青森県旭川のヤマメは背12〜13、胸13〜15、腹8〜9、臀11〜14。不分枝条と分枝条の区別は要約に無し。
- 適用範囲: ヤマメ（河川型）、青森県の河川。調査年・n・体長範囲は要約に無し。
- 出典（継承 r01 F-01, F-03）: 青森県産業技術センター（内水面研究所）「サケ、マス保護水面管理事業に伴うサクラマス調査」 https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf
- 証拠: [A]（公的機関の事業報告。r01 で3回の独立クエリが同一数値を再現）「外部形態では背鰭条数12-13軟条、胸鰭条数12-14軟条、腹鰭条数9軟条、尻鰭条数12-14軟条…」（要約の言い換え。要原典確認）。

### F-16
- 主張/値: **二次資料の鰭条数**。英語: 背鰭軟条13〜18（別資料12〜17）、臀鰭軟条14〜18（別資料11〜14）、腹鰭9〜11。日本語（サクラマス）: 背13〜18、胸14〜17、腹10〜12、臀12〜17。Christie (1970) は O. masou を「腹鰭条が少ない（大半が10）」とまとめる（r02 は A、r06／r10 は C に降格）。数え方（主鰭条／総数）の違いという仮説は M（未検証）。
- 適用範囲: サクラマス／ヤマメ（亜種 masou）または種全体。河川型と降海型の区別は資料に依存。F-15 より上側。
- 出典（継承 r02 F-06, F-07, r10 F-03）:
  - https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
  - https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf
  - https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9
  - https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
- 証拠: [C] "The dorsal fin has 13-18 soft rays, the anal fin has 14-18 soft rays, though another source indicates a dorsal fin with 12-17 rays, an anal fin with 11-14 rays."（検索要約。出典URLの特定不能）。

### F-17
- 主張/値: **尾鰭の主鰭条数と尾部骨格（PROXY）**。O. mykiss の尾鰭条は 19本（サケ科で典型）。「主鰭条数は分枝鰭条数に2を足した数」という記述もある（17分枝＋2不分枝）。10+9 の内訳は未確認。サケ科の尾部骨格は一般に**下尾骨 6、尾神経棘 3**。イワナ属（Salvelinus alpinus）では下尾骨7、尾神経棘4の個体が見つかっている（先祖返り）。
- 適用範囲: PROXY: O. mykiss（鰭条数）、サケ科一般（尾部骨格）。ヤマメの尾部骨格の数は未確認。
- 出典（継承 r10 F-22）:
  - 鰭条数 https://publication.plazi.org/GgServer/html/03A3D24DFF854B70B4CEFB2FFD87650C
  - 尾部骨格 https://openpolar.no/Record/crwiley:10.1002%2Fjmor.10775
- 証拠: [B] "O. mykiss は尾鰭条 19 本"（r10 F-22 の検索要約）。尾部骨格の数は先行ストリームの要約で、サケ科一般の記述として扱う。
- 追記（本改訂の検索）: 「下尾骨6・尾神経棘3」がサケ科の一般型であることは、イワナ属の尾部骨格の研究の要約で再確認できた（F-42、A）。上尾骨 epural の本数は未取得。

### F-18
- 主張/値: **鰓耙数**。Christie (1970) のまとめで、O. masou は鰓耙が少なく**16〜22（大半が18〜19）**。ロシア系の英語資料は "gill rays very short, 18–22"（用語が鰓条か鰓耙か混在）。Grokipedia は第1鰓弓の鰓耙 19〜26（短く、太く、滑らかで、間隔が広い）。日本語二次資料の単一値16。北海道7河川の比較で下鰓耙は集団間で有意差、上鰓耙は有意差なし（F-14）。上鰓耙・下鰓耙の内訳の個数は未取得。
- 適用範囲: O. masou（日本産サケ科を北米向けに概説した報告を含む）。ヤマメ（河川型）固有の値ではない。
- 出典（継承 r02 F-05, r01 F-11）:
  - https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf （W.J. Christie 1970, Research Information Paper (Fisheries) No. 37, Ontario）
  - https://grokipedia.com/page/Oncorhynchus_masou
- 証拠: [C]（Christie は検索要約のみで表そのものは未確認、先行ストリームで降格の記録があるため C に統一）"a small number of gill rakers (16-22, mostly 18-19)"。

### F-19
- 主張/値: **鰓条骨数**。青森県のヤマメ（河川型）の外部形態に「鰓条骨数11条」の記述がある。ただし「11」の部位が要約間で「鰓条骨」「gill raker bones」「branchial spines」と揺れ、鰓条骨（branchiostegal rays）か鰓耙か不明。別の一般サイトの要約は "branchiostegal 11–15"（帰属不明、種全体の混入の可能性）。
- 適用範囲: 青森県のヤマメ（河川型）／O. masou 種全体（帰属不明）。左右どちらか片側の数かは不明。
- 出典（継承 r01 F-01, F-06）:
  - https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf
  - https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/
  - https://allfishes.org/fishes/marine/masu-salmon
- 証拠: [C]（公的資料だがラベルが曖昧なため降格）"鰓条骨数11条"（要約の言い換え）、"branchiostegal 11–15"。

### F-20
- 主張/値: **歯の配置（属レベル）**。**Salmo と Oncorhynchus では、鋤骨が平坦（舟形でない）で、歯が鋤骨全体に二列／ジグザグ状に並ぶ**。Salvelinus（イワナ属）は舟形の鋤骨の前端に歯が限られる。成魚の Oncorhynchus では鋤骨歯と口蓋骨歯の間隔が広い（Salmo は狭い）。台湾亜種 O. m. formosanus の記載では**基鰓骨歯は無い**。「歯条褶の形」の記述は原典不明で未検証。
- 適用範囲: 属レベル（PROXY）。ヤマメの歯の本数・大きさ・位置の座標は未取得。
- 出典（継承 r07 F-16, r01 F-28）:
  - https://en.wikipedia.org/wiki/Oncorhynchus
  - https://en.wikipedia.org/wiki/Salvelinus
  - https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus
- 証拠: [C] "In the former two genera the teeth form a double or zigzag series over the whole of the vomer bone, which is flat and not boat-shaped"（検索要約。URL と文の対応は不確実）。
- 追記（本改訂の検索）: ニジマス（PROXY）では、鋤骨の歯は1〜2列で（Salmo trutta と共通）、口蓋骨・鋤骨柄・主上顎骨・前上顎骨・歯骨・舌にも歯がある（F-38、B/C）。Oncorhynchus 属としては整合する。ヤマメの本数は未取得。

### F-21
- 主張/値: **舌咬み装置（tongue-bite apparatus）**。サケ科は、前部の舌骨領域の背面に発達した歯を持ち、口蓋（口腔の天井）に対向する歯がある。この機構は、捕獲した餌を固定して裂く "raking" に使われる。ニジマス（O. mykiss）を含むサケ科3種を、250 Hz の高速度映像のコマ送りで比較し、神経頭蓋と舌骨の動きが種間の差を最もよく説明した。ヤマメが対象に含まれるかは不明。
- 適用範囲: サケ科3種（ニジマス含む、学会抄録）。ヤマメは未確認。
- 出典（継承 r07 F-16）: Sanford（Hofstra Univ.）学会抄録 "Comparative kinematic analysis of a novel feeding mechanism in salmonid fishes"。
  - https://sicb.org/?p=35129
  - https://sicb.org/abstracts/evaluating-the-importance-of-new-structures-versus-new-muscle-activity-patterns-in-the-evolution-of-a-novel-feeding-mechanism-in-salmonid-fishes
- 証拠: [B]（学会抄録）"well-developed teeth on the dorsal surface of the anterior hyoid region and opposing teeth on the roof of the mouth"。
- 追記（本改訂の検索）: 舌骨側の歯板は基舌骨（強く骨化）にあり、対向歯板は鋤骨・副蝶形骨・口蓋骨（dermopalatine）・翼状骨にある（F-38、B）。ブルックトラウトの raking の定量（頭蓋挙上36°、胸帯後退 0.85 cm＝頭長の21%、49 ms）は F-45（A、PROXY）。

### F-22
- 主張/値: ニジマス（Oncorhynchus mykiss）の摂餌中の神経頭蓋と前方24個の椎骨の3次元運動を X 線動体再構成（XROMM）で測定（**28ストライク、3個体**）。**神経頭蓋の最大挙上は 2〜18°**。トラウトは、椎間関節の最大約1/3で、小さな背側回転（大半が3°未満）を合算して神経頭蓋を持ち上げる。頭と体幹が「首のように」動く運動（neck-like）として報告された。要約に無かったもの: ストライクの継続時間、開口角、舌骨・鰓蓋の運動。
- 適用範囲: PROXY: ニジマス（体サイズ・飼育条件は要約に無し）。ヤマメは未測定。
- 出典（継承 r07 F-27）:
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8385379/ （題目 "A neck-like vertebral motion in fish"）
  - https://par.nsf.gov/biblio/10516045
  - https://sicb.org/?p=43945
- 証拠: [A] "Trout combine small (most less than 3°) dorsal rotations over up to a third of their intervertebral joints to elevate the neurocranium"（要約）。

### F-23
- 主張/値: **摂餌の時間スケール（PROXY、吸引型の魚。サケ科ではない）**。ブルーギル: 最大開口までの時間（time to peak gape）の平均は約13 ms、力の記録は開始からピークまで約12 ms。最大流速は最大開口の95%と同時に起こる。吸引流の影響域は口から約1口径以内。ラージマウスバス: 0〜8 ms に頭蓋挙上と開口（餌への接触前）、16 ms に上顎骨の回転と口腔拡張のピーク、24 ms に餌が口へ吸い込まれ、約50 ms 以内に閉顎。サケ科の最大開口角・開口時間・吸引距離は、先行ストリームの5本の検索（r07 #1〜#5、r09 #12）でも見つからなかった。
- 適用範囲: **PROXY: ブルーギル、ラージマウスバス**（吸引型）。ram 寄りのサケ科への適用は未検証。
- 出典（継承 r07 F-17。どの文がどの URL かは特定不能）:
  - https://en.wikipedia.org/wiki/Aquatic_feeding_mechanisms
  - https://vliz.be/imisdocs/publications/346500.pdf
  - https://biomechanics.ucr.edu/Higham%202011%20Fish%20Physiology.pdf
  - https://biomechanics.ucr.edu/Higham_etal_2006a.pdf
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC8753175
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC4507239
- 証拠: [B]（PROXY の数値。要約中の明示値だが出典 URL を特定できない）"average time to peak gape for bluegill ... approximately 13 ms"。

### F-24
- 主張/値: **一般機構（硬骨魚類一般）**。吸引摂食は、神経頭蓋（真皮頭蓋）の背側への回転、懸垂骨の側方への拡張、下顎と舌骨の押し下げで口腔を拡大して陰圧を作る。拡張の初期相は、舌骨の押し下げ、頭蓋の回転、顎の突出、開口で起こる。鰓蓋弁と鰓条骨の弁（opercular and branchiostegal valves）は、口の開口部を通る流量を最適にする制御装置として働く。ram–suction 連続体の枠組みがあり、指標には下顎の最大押し下げ、最大開口距離、最大舌骨押し下げ、およびその時刻などが使われる（学会抄録の要約）。
- 適用範囲: 硬骨魚類一般（百科事典系・総説系の要約）。サケ科（ヤマメ）の数値ではない。サケ科が ram–suction 連続体のどこに位置するかは未取得。
- 出典: F-23 と同じ結果集合（継承 r07 F-17）。 https://en.wikipedia.org/wiki/Aquatic_feeding_mechanisms ほか。
- 証拠: [C]（一般機構。総説・百科事典の要約）。

### F-25
- 主張/値: **サケ科の繁殖期の顎の変形は、一回繁殖型の Oncorhynchus では上顎、複数回繁殖型の Salmo・Salvelinus では下顎で最も特徴的**（レビューの記述）。吻の伸長、歯の肥大、鉤状の顎、背部の隆起、鰭の伸長、皮膚の肥厚、婚姻色。降海型サクラマスの雄は、吻が伸びて下方に屈曲し、両顎の歯が肥大（B）。河川型ヤマメの成熟雄の鼻曲がりの定量資料は見つからなかった。写真の産卵期の雄2枚（p012、p034）は下顎先端の上向きのフックが明瞭（F-11）。
- 適用範囲: 査読レビューはサケ科全般（Thymallus のレビュー内の比較）。降海型の記述は PROXY。
- 出典（継承 r07 F-21）:
  - https://link.springer.com/article/10.1007/s11160-021-09694-4 （General patterns of sexual dimorphism in graylings (Thymallus), with a comparison to other salmonid species, Rev. Fish Biol. Fisheries 2021）
  - https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf
  - https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html
- 証拠: [A]（レビュー）"The transformation of the jaws ... tends to be most characteristic for semelparous Oncorhynchus (upper jaw), and iteroparous Salmo and Salvelinus (lower jaw)."

### F-26
- 主張/値: **ニジマスの換気頻度**: 通常酸素下で、対照魚 57±4 回/分、軟水に順化した魚 78±4 回/分（平均±SEM）。算術変換: 0.95 Hz（周期1.05 s）と 1.30 Hz（周期0.77 s）。低酸素下では換気頻度と振幅が増加。運動後は換水量と代謝率がほぼ2倍になり、1回換水量（stroke volume）の増加が最大の寄与で、頻度は変わらなかった。カテコールアミンでは換気頻度の変化が鰓蓋圧の振幅の変化と独立に起こりうる。水温が高いほど頻度が増える（10・15・20・25 °C で有意、数値は未取得）。鰓蓋の開閉の振幅（mm・角度）は未取得。
- 適用範囲: ニジマス（PROXY）。実験条件（水温・体サイズ）は要約に無し。ヤマメ／サクラマスの数値は未取得。
- 出典（継承 r07 F-20）:
  - https://journals.biologists.com/jeb/article-abstract/198/12/2557/7087/The-effects-of-softwater-acclimation-on?redirectedFrom=fulltext
  - https://link.springer.com/article/10.1007/s10695-023-01247-9 （運動後の換水）
  - https://link.springer.com/article/10.1007/BF00263599 （カテコールアミン）
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC9923008/ （総説）
- 証拠: [A] "ventilation frequency was ... 78±4 breaths min⁻¹ [softwater-acclimated] compared to 57±4 breaths min⁻¹ in control fish"（要約）。

### F-27
- 主張/値: O. m. masou の側線系は、**頭部側線管8本（supraorbital, infraorbital, otic, preopercular, mandibular, postotic, supratemporal, temporal）＋体幹側線管1本、表在神経丘グループ9**。preinfraorbital の表在神経丘群を持ち、infraorbital / mandibular / opercular の表在神経丘群を欠く。頭部の孔の座標（吻・下顎・前鰓蓋のどこにいくつ）は未取得。
  - 頭部側線管は頭の皮骨（眼窩上・眼下・前鰓蓋・下顎の骨など）の中を通る。表面の孔の配置の座標は仕様に使えるが、取得できていない。
- 適用範囲: O. m. masou（サクラマス／ヤマメ）。
- 出典（継承 r07 F-13）:
  - https://link.springer.com/article/10.1007/s10228-021-00843-0 （The lateral line system and its innervation in the masu salmon, Ichthyological Research 2021）
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9537280/
- 証拠: [A] "8 cephalic canals ... 1 trunk canal and 9 superficial neuromast groups"。

### F-28
- 主張/値（**M：私の記憶、未検証。サケ科一般。数値は付けない**。初版の記述を残し、今回の検索で裏取りできた部分に印を付けた）: 頭蓋骨要素の目録と接続関係。
  - 上顎: 前上顎骨（小さく、歯を持つ）と主上顎骨（長く、歯を持ち、口裂の縁の大部分を作る）。主上顎骨の背後縁に上主上顎骨（supramaxilla）が付く。前上顎骨は主上顎骨より動きが小さい（サケ科の上顎の突出は小さい）。
    - 【検索の結果】主上顎骨が頑丈で弓状、前端に上向きの大きな突起、口縁は凸、という記述は古典的記載の要約にある（F-35、C）。**上主上顎骨は、要約では「2枚」とされ、私の記憶の「1枚」と食い違う（F-35、F-3章）。未確定**。
  - 下顎: 歯骨（歯あり）、関節角骨（anguloarticular）、後関節骨（retroarticular）、メッケル軟骨。顎関節は下顎の関節骨と方形骨の間。
    - 【検索の結果】Oncorhynchus で歯骨と angular-articular が形の変化で機能的にまとまって進化する、という学会抄録の記述がある（F-35、B）。
  - 懸垂骨: 舌顎骨（hyomandibula）、後翼状骨、内翼状骨、外翼状骨、方形骨、続骨（symplectic）、口蓋骨。舌顎骨は神経頭蓋に関節し、鰓蓋骨とも関節する。前鰓蓋骨は舌顎骨と方形骨の後縁に沿う。
    - 【検索の結果】ニジマスの舌顎骨は、背側で耳殻の舌顎窩、腹側で方形骨と続骨に関節し、鰓蓋骨を支える（F-36、B）。**ここは支持された**。
  - 鰓蓋骨系: 鰓蓋骨、前鰓蓋骨、間鰓蓋骨、下鰓蓋骨の4枚。鰓蓋骨は舌顎骨との関節で回転する。間鰓蓋骨は靱帯で下顎の後端へつながる（M）。
    - 【検索の結果】ニジマス標本の要素一覧に preopercle, opercle, subopercle, interopercle, branchiostegal rays が並ぶ（F-37、B）。**4枚の構成は支持された**。靱帯のつながりは未確認。
  - 舌骨弓: 尾舌骨（urohyal）、基舌骨（basihyal、舌。歯を持つ）、下舌骨、角舌骨（ceratohyal）、上舌骨（epihyal）、間舌骨（interhyal）。鰓条骨は角舌骨と上舌骨に付き、鰓条骨膜で連結する。
    - 【検索の結果】基舌骨が強く骨化し歯板を持つ点は支持された（F-38、B）。その他は未確認。
  - 歯を持つ骨（M と F-20, F-21, F-38, F-39 の合算）: 前上顎骨、主上顎骨、歯骨、鋤骨、口蓋骨、基舌骨（舌）、咽頭歯板。**検索で支持（B/C）**。
  - 文献候補: Stearley & Smith (1993) "Phylogeny of the Pacific trouts and salmons (Oncorhynchus) and genera of the family Salmonidae", Trans. Am. Fish. Soc. 122(1):1-33 — **書誌は検索で確認（33現生種・亜種と4化石種、119形質、現生サケ亜科は7属）**が、本文（骨学形質の記述）は読めていない。Sanford (1990) "The phylogenetic relationships of salmonoid fishes", Bull. Br. Mus. Nat. Hist. (Zool.) — 題名と誌名を検索で確認（比較骨学と筋学を使用）。Norden 1961 は未確認。
- 適用範囲: サケ科一般（M）＋ニジマス等（検索の部分裏取り）。ヤマメの個体での確認は無い。
- 出典: 記憶＋F-35〜F-39 の各出典。書誌確認の候補URL: https://research.calacademy.org/research/ichthyology/catalog/getref.asp?id=26683 （Stearley & Smith の書誌かは要約から断定できない）
- 証拠: [M] 未検証。支持された部分は F-35〜F-39 の各ランク（B/C）に従う。

### F-29
- 主張/値（**M：未検証**。検索で支持された部分を併記）: 顎の機構。
  - 下顎回転軸: 顎関節（下顎の関節骨と方形骨）を通る左右方向の軸で、下顎が下がると口が開く。
  - 主上顎骨: 前端付近で口蓋骨・神経頭蓋側に関節し、口が開くと下顎との靱帯結合によって前方へ振れる（回転）。口を閉じると戻る。前上顎骨はほとんど動かない（突出が小さい。M）。
    - 【検索の結果】硬骨魚類一般の記述として、「下顎が下がると主上顎骨の後端が下がり、前端が前上顎骨の外側部を前へ押して、前上顎骨が前へ滑る（突出）」「主上顎骨のねじれは、下顎押し下げまたは A1 筋の収縮で始まる」がある（C、F-43）。**サケ科の主上顎骨の回転角・前上顎骨の可動量は見つからなかった**。
  - 舌骨の押し下げ: 筋（胸骨舌骨筋）が尾舌骨を肩帯方向へ引いて舌骨弓を下げ、口腔底を押し下げて口腔を拡大する。
    - 【検索の結果】拡張相は、口の開きに続いて、懸垂骨の側方への拡張と舌骨の腹側回転が同時に起こる（硬骨魚類一般、A/C、F-43）。
  - 鰓蓋: 鰓蓋骨が舌顎骨との関節で外転し、鰓蓋腔が拡大する。四節リンク（opercular four-bar linkage）は多くの硬骨魚で知られる（サケ科での確認なし）。
    - 【検索の結果】総説の要約に「鰓蓋リンクにより、前方の拡張（下顎押し下げ）を後方の筋が舌骨運動と独立に駆動でき、顎と舌骨の位相をずらせる」とある（PROXY：吸引摂食の硬骨魚、A、F-43）。SICB の抄録 "Opercular-linkage disruption: a test of the four-bar linkage model" がある（魚種は要約に無し。https://sicb.org/?p=34346 ）。
  - 鰓条骨膜: 舌骨が下がると鰓条骨が外に開き、膜が張られて口腔の側壁と鰓蓋腔の弁を作る（M）。鰓蓋弁と鰓条骨弁が、口の開口部を通る流量の制御装置として働く（F-24、C）。
  - 呼吸では、口腔ポンプと鰓蓋腔の吸引ポンプが交互に働く二段構造（トラウトで位相の記述あり。F-46）。
- 適用範囲: 硬骨魚類一般（M＋PROXY）。サケ科、ヤマメの角度・係数は未取得。
- 出典: 記憶＋F-43、F-46、F-24 の各出典。
- 証拠: [M] 未検証。方向は F-22、F-43、F-46 と整合するが、サケ科の数値は無い。

### F-30
- 主張/値（**M：未検証。数値は付けない**）: 鰓弓・咽頭歯のうち、検索で支持されなかった部分。
  - 各弓は基鰓骨（正中）、下鰓骨、角鰓骨、上鰓骨、咽頭鰓骨から成る。弓の前縁に鰓耙、後縁に鰓弁（鰓糸）が並ぶ。第5鰓弓は鰓弁を持たず、角鰓骨5に下咽頭歯板が付く。上咽頭歯板は咽頭鰓骨側に付く。
  - 【検索で支持された部分】鰓弓が4対であること、ニジマスの第1鰓弓の鰓耙数（17〜21）、Salmo の咽頭歯板が2対で鰓弓の骨と癒合しないこと、咽頭鰓骨3の咽頭歯は **F-39** を参照。
  - 鰓弁（鰓糸と鰓薄板）の数と寸法: 検索（「ニジマス 第1鰓弓の鰓糸数・鰓薄板密度」）では、定量値を含む要約が返らなかった（方法論の論文のみ）。未取得。
- 適用範囲: 硬骨魚類一般（M）。サケ科、ヤマメは未確認。
- 出典: 記憶。
- 証拠: [M] 未検証。r07 F-19 の M（鰓弁が血液の色で赤く、通常は鰓蓋に隠れる）とは整合するが、独立した確認ではない。

### F-31
- 主張/値（**M：未検証。数値は付けない**）: 軸骨格と尾部骨格の用語。
  - 椎骨は腹椎（肋骨を持つ）と尾椎（血管棘を持つ）に分かれ、腹椎は椎体に肋骨（pleural ribs）と上肋骨・筋間骨を伴う。F-14 の「腹椎数と尾椎数」はこの区分。
  - 尾部は、尾端の椎体が上へ曲がる（尾端骨）形で、下尾骨（hypurals）が扇状に並んで主鰭条を支える。サケ科の一般型は F-42（下尾骨6、尾神経棘3。A）で、ニジマスの主鰭条19本は F-17。
  - 胸鰭帯は烏口骨（cleithrum）を主体とし、肩甲骨・烏口骨・基鰭骨と放射骨を含む。腰帯（基鰭骨）は左右1対で、腹鰭が付く（検索「サケ科の胸鰭の放射骨の数」では数値が返らなかった。未取得）。
  - ニジマスの「総数63＝体幹33＋尾椎30」は F-33（B、PROXY）。ただし「体幹椎」が肋骨を持つ腹椎と同義かは要約に無い。
- 適用範囲: 硬骨魚類一般／サケ科（M）。ヤマメの個数は未取得。
- 出典: 記憶。F-17、F-33、F-42 は各 Finding の出典を参照。
- 証拠: [M] 未検証。

### F-32
- 主張/値（**M／推論：設計案であり文献根拠ではない**）: リギング（ボーン／モーフ）への落とし込み案。検索で得た値を反映して改訂した。
  - **脊柱**: 総数は F-12/F-13/F-33 の 63〜69 を目安にする（個体差の分布の中心は未確定。発生水温でも変わる、F-34）。椎骨1節ごとのボーンは必須でなく、少数のボーンのスキニングで補間してよい（設計判断）。神経棘・血管棘・肋骨はメッシュ上の「ヘリンボーン」配置（F-03：棘は椎間周期の約2〜4倍、腹椎域の肋骨は周期の約11〜14倍、いずれも標本画像の目測）で表現する。
  - **動作の順序（PROXY：吸引摂食の硬骨魚一般、F-43）**: 頭蓋挙上と下顎押し下げ → 舌骨押し下げ・鰓蓋の外転・胸帯の後退、の順に前から後ろへ波のように進める。下顎と舌骨の位相は別パラメータ（鰓蓋リンクのため独立にずらせる）。鰓蓋の外転は、顎が開き始めてから始まり、顎が閉じ始めてからピークになる。**これは吸引型の魚の記述で、サケ科（体の突進が主、F-44 は PROXY）での確認は無い**。
  - **頭の挙上**: 神経頭蓋を、体幹前方24椎骨に分配した小さな背側回転の合計で持ち上げる。捕食ストライクは 2〜18°（ニジマス、F-22）、raking のパワーストロークは平均36°（ブルックトラウト、F-45）。2つのプリセットにする。
  - **下顎**: 顎関節に左右軸のボーンを置き、開口角は**パラメータ（サケ科の文献値なし）**。写真 p001 の開口では下顎が約10〜12 px 下がる程度（F-11）。時間スケールは、サケ科で見つかった値は raking の所要49 ms（F-45）のみ。ブルーギルの最大開口まで約13 ms（F-23）は PROXY で、トラウトへの適用は未検証。
  - **主上顎骨**: 下顎の開き角に結合した従動ボーン（結合係数は文献値なし）。前上顎骨は固定（M）。
  - **舌骨**: 下顎の開き角に結合して腹後方へ押し下げる従動ボーン。raking では胸帯が頭長の約21%後退する（F-45）。鰓条骨膜は、舌骨の押し下げと鰓蓋の外転で形が変わるシェイプキー（モーフ）にする。
  - **鰓蓋**: 舌顎骨との関節（鰓蓋の前背縁）を軸にした外転ボーン。周期は 0.77〜1.05 s（F-26、ニジマス）で、振幅（開き）は別パラメータ。運動後は周期を保って振幅を増やす（F-26）。口腔の拡張は鰓蓋外転の約1/4周期前に始める（F-46、要確認）。
  - **モーフ**: 口の開閉、鰓蓋の開き、鰓条骨膜の展開、頬の膨らみ（口腔拡張）、繁殖期の顎（上顎の伸びと下曲がり、下顎先端のフック。F-25, F-11）。
  - **歯**: 口腔の内側に、前上顎骨・主上顎骨・歯骨・口蓋骨・鋤骨（1〜2列）・舌（基舌骨の歯板）の歯列を小さな円錐（内側へ曲がる）として配置する（F-20, F-21, F-38）。**本数と大きさは未取得で、仮置き**。咽頭歯は見えないため省略できる（設計判断）。
  - **骨の形の参照**: 個々の頭蓋骨の形は Idaho Virtual Museum のニジマス標本ページ等（F-37）を見て作る。
- 適用範囲: 設計案（推論）。根拠は F-03, F-11, F-12, F-22, F-25, F-26, F-33, F-43, F-45, F-46 と F-28〜F-31（M）。
- 出典: なし（推論）。
- 証拠: [M] 推論。ここでの数値はすべて他の Finding からの引用で、本節で新たに作った数値は無い。

### F-33
- 主張/値: ニジマス（O. mykiss）の脊椎骨は**計63（体幹椎33＋尾椎30）**で、種の同定に使える、という記述。検索要約は、同じ情報が論文 "Calcium and Phosphorus Contents, and Microstructure of Vertebrae in Rainbow Trout (Oncorhynchus mykiss) at Different Developmental Stages"（Progress in Fishery Sciences, 2023年10月）にも現れると述べる。同論文の標本は4段階（平均体重 4, 35, 644, 2,129 g）。椎骨の Ca/P モル比は成長に伴い有意に増加（骨化度が上がる）。micro-CT で椎体の分節は成長とともに明瞭になり、構造が完全になる。
- 適用範囲: **PROXY: O. mykiss**（淡水養殖個体と思われる。n・範囲は要約に無し）。「体幹椎」が肋骨を持つ腹椎と同義かは不明。FishBase のニジマス 60〜66（F-13）の範囲内。ヤマメへの適用は未検証。
- 出典: https://doaj.org/article/dc8bd61f4d8c4fbe8f435c205a8d64a8 （Progress in Fishery Sciences, Oct 2023）。出典候補（63の記述の所在はどちらか特定できない）: https://paleo.iri.isu.edu/ViewSpecimen.aspx?id=766 （Idaho Virtual Museum）、https://agris.fao.org/search/en/records/67599cfcc7a957febdfe657e
- 証拠: [B] "Rainbow trout (Oncorhynchus mykiss) has a total of 63 vertebrae (including 33 trunk vertebrae and 30 caudal vertebrae)"（検索要約。一次ページの文面は未確認のため A としない）。

### F-34
- 主張/値: サケ・サクラマスでは、**発生初期の水温により脊椎骨数が変異し、平均値が異なる**（北海道の水産機関の広報の記述。発生時の水温が異なる群の判別に使える可能性にも言及）。サクラマスの飼育水温試験（9, 12, 16 °C）では、脊椎骨数は 16 °C で増える傾向。数え方は X 線写真で、神経棘を持つ第1椎骨から尾部棒状骨（尾端）まで。具体的な本数は要約に無し。
- 適用範囲: サケ・サクラマス（O. m. masou）の孵化場・試験場の飼育個体。ヤマメ（河川型）の野生個体の水温影響は未取得。
- 出典: https://www.hro.or.jp/upload/41227/dayori91sake.pdf 。出典候補（16 °C の試験の所在は特定できない）: https://eprints.lib.hokudai.ac.jp/repo/huscap/all/24086/42(4)_P147-159.pdf 、https://www.aomori-itc.or.jp/_files/00229791/217-220.pdf
- 証拠: [B] "サケやサクラマスでは、発生初期の水温により脊椎骨数が変異し平均値が異なる"（検索要約の言い換え。報告書の本文は未確認）。

### F-35
- 主張/値: サケ科の上顎・下顎の骨の古典的記載（検索要約）。
  - **主上顎骨**: 頑丈で弓状。前端に上向きの大きな突起があり、口縁側は凸。主上顎骨は前上顎骨の上方へ、長く細い突起として上内側に伸び、篩骨域の前部に付く（要約の "attachment in the front of the ethmoidal region"）。
  - **上主上顎骨**: 「2枚の大きな上主上顎骨が主上顎骨の上部に重なる。後ろの1枚が最も深く、前上顎骨板の上縁の上へ細い突起を前に出す」と要約された（**対象魚種は要約に無く、サケ科の古典的記載とだけ分かる**）。
  - **前上顎骨・主上顎骨・歯骨の形は種に固有で、サケ科の同定に使える**（Oncorhynchus の歯骨は angular-articular と機能的にまとまり、形の変化が相補的）。
  - 絶滅種 O. rastrosus は前上顎骨に巨大な円錐歯1本を持ち、歯骨の正中端には微小な歯のみ（顎の歯の位置の多様性の例。ヤマメには適用しない）。
- 適用範囲: サケ科の古典的記載（OCR 化された古い文献の要約、魚種不明）。ヤマメ固有ではない。
- 出典（要約と URL の対応は特定不能）: https://collections.lib.utah.edu/details?id=263433 、https://collections.lib.utah.edu/details?id=263429 、https://collections.lib.utah.edu/details?id=263431 、https://archpress.lib.sfu.ca/index.php/archpress/catalog/download/49/20/906?inline=1 、https://sicb.org/?p=15656 （Meeting Abstract）、https://digitalcommons.pcom.edu/scholarly_papers/1638/ 、https://researchprofiles.library.pcom.edu/en/publications/the-sabertooth-salmon-oncorhynchus-rastrosus-gets-a-facelift/
- 証拠: [C] "Two large supramaxillaries overlap the upper portion of the maxilla, with the hinder being deepest"（OCR 古文献の検索要約。魚種不明）。歯骨の記述は学会抄録（B）。

### F-36
- 主張/値: ニジマスの**舌顎骨**の初期発生（孵化後1〜30日）の研究。舌顎骨は対をなす軟骨性骨（endochondral bone）で、舌骨弓の上部に関わる。顎の懸垂に関わり、**鰓蓋骨を支える**。背側は耳殻の舌顎窩（hyomandibular fossa）、腹側は方形骨と続骨（symplectic）に関節する。また同論文は、ニジマスの頭部形態（頭蓋骨の骨）の研究が他にあることを示す。
- 適用範囲: O. mykiss（稚魚期の発生。成魚の寸法は無し）。
- 出典（要約と URL の対応は特定不能）: https://www.vliz.be/imisdocs/publications/396850.pdf 、https://marineinfo.org/id/publication/383702
- 証拠: [B] "The hyomandibular ... takes part in jaw suspension and supports the opercle, dorsally articulating with the otic capsule at the hyomandibular fossa, and ventrally with the quadrate and symplectic"（検索要約。対象論文の特定が不確実なため B）。

### F-37
- 主張/値: **骨の形の参照先（数値ではなく画像資料）**。Idaho Virtual Museum（Idaho Museum of Natural History）のスチールヘッド（O. mykiss）の標本ページには、preopercle、opercle、subopercle、interopercle、branchiostegal rays などの骨が個別要素として載る。同ミュージアムにはキングサーモン（Chinook）、カットスロート（Cutthroat）の骨格ページもある。North Atlantic Biocultural Organization（NABO）の fish bone manual に頭蓋（skull）のページがある。**これらの画像の寸法・ライセンスは未確認**。
- 適用範囲: O. mykiss（ニジマス／スチールヘッド）ほか。ヤマメの骨との差は未確認。
- 出典: https://paleo.iri.isu.edu/ViewSpecimen.aspx?id=766 、https://paleo.iri.isu.edu/ViewSpecimen.aspx?ID=767 、https://virtual.imnh.iri.isu.edu/Osteo/View/Chinook_Salmon/765 、https://virtual.imnh.iri.isu.edu/Osteo/View/Cutthroat_trout/771 、https://www.nabohome.org/products/manuals/fishbone/fish/Skull/skull.htm
- 証拠: [B] 博物館のデジタル標本ページ（要約が要素名を列挙。画像は未閲覧）。

### F-38
- 主張/値: **歯の配置（ニジマス、PROXY）と舌咬み装置の歯板**。
  - ニジマスの歯は小さく発達し、円錐形で内側に曲がり、**主上顎骨・前上顎骨・下顎（歯骨）・口蓋骨・鋤骨の柄・舌**にある。別の記述では「主上顎骨・前上顎骨間（intermaxillary）・口蓋骨・下顎に歯があり、鋤骨・舌・咽頭には2列」。鋤骨の歯は1〜2列（Salmo trutta と O. mykiss で共通）。
  - 組織学の論文（ニジマスの口腔咽頭腔）: 口腔咽頭腔は、口、口腔、歯、舌、咽頭から成る。**口蓋骨歯と鋤骨歯**を持つ。舌は先端・体・根に分かれ、歯、味蕾、糸状乳頭に似た乳頭を持ち、舌根の深部に骨軟骨組織がある。味蕾は口蓋の前部と咽頭の後部に局在し、咽頭に口蓋器官（palatal organ）がある。
  - **舌咬み装置（tongue-bite apparatus）**: 基舌骨（強く骨化）に歯板があり、それに向き合って、鋤骨・副蝶形骨・口蓋骨（dermopalatine）・翼状骨に歯板または単独の歯がある。サケ科3種（ニジマス、ブラウントラウト、ブルックトラウト）は、構造がよく似ていても、250 Hz の高速度映像で運動パターンは3種とも異なる。
  - **歯の本数・大きさ・傾き**: 検索（「サケ科の骨ごとの歯数」）でも、要約に数値は無かった。未取得。
- 適用範囲: PROXY: O. mykiss（Salmo trutta、S. fontinalis は舌咬み装置のみ）。ヤマメは未確認。
- 出典（要約と URL の対応は特定不能）: https://journals.usamvcluj.ro/index.php/zootehnie/article/view/5355 （組織学）、https://sicb.org/?p=35129 、https://sicb.org/?p=31727 （舌咬み装置の抄録）、https://www.infish.com.pl/wydawnictwo/Archives/Fasc/work_pdf/Vol19Fasc1/Vol19-Fasc1-%20w02.pdf （鋤骨歯1〜2列）、https://www.fishbase.org/summary/oncorhynchus-mykiss.html 、https://palaeo-electronica.org/2001_2/fish/onchor_m.htm 、https://collections.lib.utah.edu/details?id=275160
- 証拠: [B] "O. mykiss presents palatine and vomerian teeth"（組織学論文の要約）／"tooth plates on the basihyal (which is heavily ossified) and directly opposing tooth plates ... on the vomer, parasphenoid, dermopalatine and pterygoid"（抄録の要約）。「二列」の古い記述は [C]。

### F-39
- 主張/値: **鰓弓・鰓耙・咽頭歯板（Salmo／ニジマス）**。
  - ニジマスは**鰓弓が4対**。第1鰓弓の鰓耙は**17〜21**（別の資料では16〜17）。
  - Salmo の論文（"Notes on the Chondrocranium and Branchial Skeleton of Salmo"）の要約: **咽頭歯板は2対あり、成魚でも鰓弓の固有の骨と癒合しない**。独立した咽頭歯は通常、咽頭鰓骨3に付く。
  - ニジマスの鰓弓の神経支配: 第1弓は舌咽神経の後鰓裂枝と迷走神経の前鰓裂枝、第2〜4弓は迷走神経の前後の枝（モデル化には不要）。
  - 鰓条骨の本数、ニジマスの咽頭歯の本数は、要約に無かった。
- 適用範囲: ニジマス（PROXY）、Salmo（咽頭歯板）。ヤマメの鰓耙は F-18（16〜22）。
- 出典（要約と URL の対応は特定不能）: https://www.fishbase.org/summary/oncorhynchus-mykiss.html 、https://palaeo-electronica.org/2001_2/fish/onchor_m.htm 、https://aquaticpath.phhp.ufl.edu/fg2/anat/internal.rt.html 、https://agris.fao.org/search/fr/records/65de51eb4c5aef494fdba4d2 （Salmo の咽頭歯板）
- 証拠: [B] "Rainbow trout have 17-21 gill rakers over the first gill arch, though another source indicates 16-17"（検索要約。FishBase 系／標本ページ系の記述と思われるが対応は不確実）。咽頭歯板は [C]（書誌 agris の要約）。

### F-40
- 主張/値: **ニジマスの鰭条（不分枝／分枝の区別あり、PROXY）**: 背鰭は**不分枝4本＋分枝10〜12本**、臀鰭は**不分枝3本＋分枝6〜12本**。胸鰭は「13本」という要約（出典不明）。これは F-15（青森ヤマメ：背12〜13軟条）と F-16（二次資料：背13〜18、臀14〜18等）の差が**「分枝条のみ」か「不分枝を含む総数」かの数え方の違い**で説明できる可能性を示すが、青森資料の数え方は要約に無く、**未検証の仮説のまま**。
- 適用範囲: PROXY: O. mykiss。
- 出典（要約と URL の対応は特定不能）: https://www.fishbase.org/summary/oncorhynchus-mykiss.html 、https://palaeo-electronica.org/2001_2/fish/onchor_m.htm
- 証拠: [B]（PROXY）"The dorsal fin has 4 unbranched and 10-12 branched rays; the anal fin has 3 unbranched and 6-12 branched rays"（検索要約）。胸鰭13本は [C]。

### F-41
- 主張/値（**採用しない**）: 検索要約に「ニジマスの背鰭の担鰭骨（pterygiophore）は7〜9本で椎骨11〜18番の間、臀鰭の担鰭骨は12〜14本で椎骨14〜21番の間」とあった。**この値は採用しない**。理由は、(1) 背鰭の担鰭骨が分枝条（10〜12）より少ない、(2) 臀鰭の位置が椎骨14〜21番では腹鰭より前になり、標本画像（臀鰭は背鰭・腹鰭より尾側。F-02、F-05）と合わない、(3) 出典の特定ができない（要約の元は複数の無関係なページ）。標本画像の担鰭骨の塊は、背鰭12〜15、臀鰭10〜11（F-04、F-05。ボケのため要確認）。
- 適用範囲: ニジマス（PROXY）の疑わしい要約。
- 出典（要約と URL の対応は特定不能）: https://www.ru.ac.za/media/rhodesuniversity/content/ichthyology/documents/Anatomy_Lecture_3.pdf 、https://arc.lib.montana.edu/robert-behnke/objects/2491-32-11.pdf
- 証拠: [C] "seven to nine rod-like ... pterygiophores of the dorsal fin ... between vertebrae 11 and 18"（検索要約。上記の理由で不採用）。

### F-42
- 主張/値: **サケ科の尾部骨格の一般型は、下尾骨（hypural）6、尾神経棘（uroneural）3**。イワナ属 Salvelinus alpinus の尾部骨格の発生と変異の研究で、一部の個体は**下尾骨7、尾神経棘4**で、これは「サケ科の一般型」からの逸脱として報告された。サケ科は、前尾椎と尾椎（ural）の両方の神経棘に由来する上尾骨（epural）を同時に持つ、という記述もある（基部の真骨類と共通）。上尾骨の本数、尾椎の数、尾鰭の主鰭条の内訳（分枝・不分枝）は要約に無い。
- 適用範囲: サケ科の一般型（根拠はイワナ属の論文の要約＝PROXY: Salvelinus alpinus）。Oncorhynchus、ヤマメの個体数は未確認。
- 出典: https://openpolar.no/Record/crwiley:10.1002%2Fjmor.10775 （Ontogeny, variation, and homology in Salvelinus alpinus caudal skeleton, J. Morphol.）。epural の記述: https://agris.fao.org/search/en/records/676558defccf879925c0f83c （"Epural bones in teleost fishes: A problem of phylogenetic homology"）
- 証拠: [A] "In contrast to the generalized condition for salmonids, seven hypurals (instead of six), and four uroneurals (instead of three) have been found in some specimens"（査読論文の検索要約）。epural の記述は [B]。

### F-43
- 主張/値: **顎・舌骨・鰓蓋の運動順序（PROXY：吸引摂食の硬骨魚類一般。サケ科の記述ではない）**。
  - 拡張相は、口の開きに続いて、**懸垂骨の外転と舌骨の腹側回転（押し下げ）が同時に**起こる。
  - 頭蓋挙上と下顎押し下げが、舌骨押し下げ・鰓蓋の広がり・胸帯の後退に先行する。頭部の運動は前から後ろへの波として進み、水と餌を口腔に引き込む。
  - **鰓蓋リンクにより、前方の拡張（下顎押し下げ）を後方の筋が舌骨と独立に駆動でき、顎と舌骨の位相をずらせる**（口が舌骨運動より先に開き始め、ピークに達しうる）。
  - 下顎押し下げは最大開口で終わるが、舌骨は後退を続けて、その後にピーク変位に達する。**鰓蓋の外転は、顎が開き始めてから始まり、顎が閉じ始めてからピークになる**。
  - 硬骨魚類一般の突出の機構として、下顎が下がると主上顎骨の後端が下がり、前端が前上顎骨の外側部を前へ押して前上顎骨が滑る（突出）。
  - 数値（角度・ms）は要約に無い。サケ科が属する魚群（Protacanthopterygii）での検証は無い。
- 適用範囲: PROXY: 吸引摂食をする硬骨魚類一般（総説・比較研究。魚種は要約に無い）。
- 出典（どの文がどの URL かは特定不能）: https://pmc.ncbi.nlm.nih.gov/articles/PMC12517347/ （A mechanical perspective on suction feeding in fishes, J. Exp. Biol. 228(18) jeb250567）、https://journals.biologists.com/jeb/article/228/18/jeb250567/369343/A-mechanical-perspective-on-suction-feeding-in 、https://biomechanics.ucr.edu/Day%20et%20al%202015%20ICB.pdf 、https://fishlab.ucdavis.edu/wp-content/uploads/sites/397/2020/05/Mehta-Wainwright-2007.pdf 、https://en.wikipedia.org/wiki/Cranial_kinesis 、https://par.nsf.gov/servlets/purl/10192305
- 証拠: [A]（PROXY の総説）"cranial elevation and jaw depression precede hyoid depression, opercular flaring, and pectoral girdle retraction"／"opercular abduction starts after the jaws begin to open and reaches its peak after the jaws begin to close"（検索要約）。突出の機構は [C]。

### F-44
- 主張/値: 吸引摂食をする**棘鰭類40種**の高速度映像の比較で、**捕食者の接近のうち「体の突進（body ram）」の変動が、捕食戦略の多様性の主要因**で、吸引の寄与距離は広い系統・生態の標本でも小さい（吸引が極端に大きい領域は空白）。ram–suction の一直線の連続体ではない、という結論。
- 適用範囲: **PROXY**: 棘鰭類（spiny-rayed fishes）40種。**サケ科は含まれない**（サケ科が軟条の魚群であること自体は M）。ヤマメの突進距離・速度は未取得。
- 出典: https://cob.silverchair.com/jeb/article/doi/10.1242/jeb.129015/262046/am/Body-ram-not-suction-is-the-primary-axis-of 、https://cob.silverchair.com/jeb/article-pdf/doi/10.1242/jeb.129015/2038543/jeb_129015v1.pdf （Body ram, not suction, is the primary axis of suction-feeding diversity in spiny-rayed fishes, J. Exp. Biol.。DOI 10.1242/jeb.129015。著者・年は要約に無し）
- 証拠: [A]（PROXY）"variation in body ram is the major factor underlying the diversity of prey-capture strategies among suction-feeding fishes"（検索要約）。

### F-45
- 主張/値: **ブルックトラウト（Salvelinus fontinalis）の舌咬み装置による raking（捕食後の餌の固定・引き裂き）の運動学**（250 Hz の高速度映像）。raking のパワーストロークは、**神経頭蓋の挙上が平均36°**（口を開けたままの咀嚼 open-mouth chewing は16°）、**胸帯の後退が 0.85 cm（頭長の21%）**（咀嚼は 0.41 cm、頭長の10%）、**所要時間が平均49 ms**（咀嚼は77 ms）。個体は餌を取り込んだあと、数回 rake してから、口を開けたままの咀嚼を繰り返した。咀嚼は舌骨の背腹方向の動きが主。
  - 同じ誌の関連論文として、サケ科とアロワナ類の raking の筋活動パターン（収斂）、舌咬み装置の形態の比較（JEB 211）がある（要約のみ）。
- 適用範囲: **PROXY: Salvelinus fontinalis**（イワナ属）。魚体サイズ・水温・n は要約に無し。ニジマス・ヤマメへの適用は未検証。ストライク（捕食）の運動ではなく、捕獲後の餌処理の運動。
- 出典: https://journals.biologists.com/jeb/article/204/22/3905/32920/Kinematic-analysis-of-a-novel-feeding-mechanism-in （J. Exp. Biol. 204(22):3905, "Kinematic analysis of a novel feeding mechanism in the brook trout Salvelinus fontinalis (Teleostei: Salmonidae): behavioral modulation of a functional novelty"。著者名は要約に無し）。関連: https://journals.biologists.com/jeb/article/211/21/3378/17848/Biomechanics-of-a-convergently-derived-prey 、https://journals.biologists.com/jeb/article/211/6/989/18071/Is-a-convergently-derived-muscle-activity-pattern
- 証拠: [A]（PROXY）"significantly greater neurocranial elevation (raking, 36°; open-mouth chewing, 16°) and retraction of the pectoral girdle (raking, 0.85 cm or 21% of head length ...)... raking is significantly shorter in duration (mean 49 ms) than open-mouth chewing (mean 77 ms)"（検索要約）。

### F-46
- 主張/値: **トラウトの換気の位相**。口腔（buccal cavity）は**鰓蓋の外転（abduction）が始まる約1/4周期前に拡張を始め**、約1/5周期前に収縮を始める、と要約された（収縮の記述は「abduction の前」となっており、内転 adduction の誤記の可能性がある。**要確認**）。呼吸装置は、口腔の圧力ポンプと、対をなす鰓蓋の吸引ポンプが、連続した鰓の幕で隔てられた構造で、両者がほぼ連続した水流を鰓の上に作る。鰓蓋の吸引ポンプは鰓蓋の外側への拡張で、口腔と鰓蓋腔の圧力差を作る。口腔と鰓蓋腔は機械的に連結しており、その連結が換気の運動に影響する（SICB 抄録）。
  - 周期は F-26（0.77〜1.05 s、ニジマス）。1周期内の位相の数値は上記のみ。
- 適用範囲: トラウト（ニジマスと思われるが要約に種名なし）。温度・サイズ不明。
- 出典（どの文がどの URL かは特定不能）: https://sites.harvard.edu/glauder/files/2022/03/Lauder1980BiofluidMechanics.pdf 、https://sicb.org/?p=38852 （Influence of mechanical linkages between the buccal and gill chambers on ventilatory kinematics）、https://nature.com/articles/179255a0.pdf 、https://cob.silverchair.com/jeb/article-pdf/53/3/529/3179455/jexbio_53_3_529.pdf 、https://cob.silverchair.com/jeb/article-pdf/63/3/537/3185249/jexbio_63_3_537.pdf
- 証拠: [B]（総説・古い研究の要約）"In trout, the buccal cavity begins to expand about a quarter of a cycle before abduction of the operculum starts"。

### F-47
- 主張/値: **Oncorhynchus 2種の咬合力と開口の関係**。キングサーモン（O. tshawytscha）では最大咬合力が最大開口の**67%**で、カラフトマス（O. gorbuscha）では**43%**で生じる。頭蓋の解剖学的な測定値は2種で有意差がなく、最大咬合力が出る開口が違う。キングサーモンは大きい・逃げる餌に大きな力を使え、カラフトマスは濾過摂食的で極端な開口での力が要らない、と解釈。最大開口角・下顎の長さの数値は要約に無い。
- 適用範囲: **PROXY: O. tshawytscha, O. gorbuscha**（成魚と思われる。体サイズ・n は要約に無し）。ヤマメは未測定。
- 出典: https://cob.silverchair.com/jeb/article-pdf/223/20/jeb223180/1980056/jeb223180.pdf （The bite force-gape relationship as an avenue of biomechanical adaptation to trophic niche in two salmonid fishes, J. Exp. Biol. 223(20) jeb223180, Kaczmarek & Gidmark 2020）、https://datadryad.org/dataset/doi:10.5061/dryad.sn02v6x2c （データ）
- 証拠: [A]（PROXY）"maximum bite force achieved at 67% of maximum gape for king salmon and 43% of maximum gape for pink salmon"（検索要約）。

### F-48
- 主張/値: **Oncorhynchus の古い分類記載のグループ別の範囲**（検索要約）: 臀鰭が長く、発達した鰭条が14〜17、鰓耙が20〜40、鰓条骨が12〜16（グループ1）。臀鰭が短く、鰭条が9〜13、鰓耙が10〜15、鰓条骨が10〜14（グループ2）。**どちらが O. masou に当たるかは要約に無い**。ヤマメの鰓耙16〜22（F-18）は2グループの中間で、鰓条骨は10〜16のどこかにあるはずだが、確定できない。
- 適用範囲: Oncorhynchus 属の古い記載（グループ名は要約に無く、太平洋サケ類／マス類と推測するのは M）。ヤマメ固有ではない。
- 出典（候補）: https://archive.org/download/biostor-14292/biostor-14292.pdf 、https://repository.si.edu/server/api/core/bitstreams/863ffd97-8144-4fed-993d-5da8101d78f4/content
- 証拠: [C] "anal fins are described as elongate with 14-17 developed rays with gill rakers 20-40 and branchiostegals 12-16, or alternatively anal fins shorter with 9-13 developed rays, gill rakers 10-15 and branchiostegals 10-14"（検索要約。出典の特定が不確実）。

### F-49
- 主張/値: **台湾亜種（O. m. formosanus）の頭部比**: 体長/頭長 4.20、体長/体高 3.48、頭長/吻長 4.41、頭長/眼径 3.43、頭長/眼間幅 4.12。チチャ湾渓（Chichiawan Stream）で採集した52個体の計数・計測の研究があり、「背鰭条と胸鰭条の変動が大きい以外は、計数形質は諸研究で比較的一致」と述べる。25の計数・計測形質を7種の Oncorhynchus で比べ、計数・計測だけでは台湾亜種の系統は解明できないと結論。脊椎骨数は要約に無し。
- 適用範囲: **PROXY: O. m. formosanus**（台湾の陸封型。亜種が違い、サイズ・性別・平均か範囲かは要約に無し）。ヤマメ（亜種 masou）の頭部比は F-11 などの写真計測を優先する。
- 出典（比率がどちらの文書の記述か特定不能）: https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus 、https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf （Zoological Studies 29(3) Suppl.）
- 証拠: [C] "body length to head length ratio of approximately 4.20 ... head length to snout length ratio of 4.41, head length to eye diameter ratio of 3.43"（検索要約。Wikipedia 系の可能性があり C）。

---

## 3. 資料間の矛盾・不一致

1. **脊椎骨数**: O. masou は 63〜66（C）、63〜69（C、AI生成）、単一値63（C）。他種 PROXY は 56〜75 と幅が広く、ニジマスは FishBase 60〜66（B）に対し別の記述で「総数63（体幹33＋尾椎30）」（B、F-33）。台湾亜種は日本産より少ない（B）。集団間で有意差があり（A）、腹椎／尾椎の個数は遺伝成分を持ち（A）、発生水温でも平均が変わる（B、F-34）。単一の「ヤマメの脊椎骨数」は確定できない（F-12〜F-14、F-33、F-34）。
2. **鰓条骨と鰓耙の混同**: 青森資料の「11」は鰓条骨か鰓耙か曖昧。"gill rays 18–22" は鰓耙のことと思われるが用語が混在。Christie の鰓耙 16〜22（大半 18〜19）、Grokipedia の 19〜26、日本語単一値 16、ニジマスの第1鰓弓 17〜21（別資料 16〜17）。古い記載のグループ別の範囲（鰓耙 20〜40／10〜15、鰓条骨 12〜16／10〜14、F-48）のどちらに O. masou が入るかは不明。鰓条骨 11〜15 は帰属不明（F-18, F-19, F-39, F-48）。
3. **鰭条数**: 青森ヤマメ（A）と二次資料（C）で上側のずれ（背12〜13 対 13〜18、臀12〜14 対 14〜18、腹9 対 10〜12）。ニジマス（PROXY、B）は背鰭＝不分枝4＋分枝10〜12（総数14〜16）で、数え方（分枝条のみ／不分枝を含む総数）の違いで説明できる可能性があるが、**青森資料の数え方は未確認で仮説のまま**。標本画像（P）の背鰭 12〜14 本は A と整合するが、臀鰭・腹鰭は重なりで下限しか数えられず比較できない（F-04〜F-06, F-15, F-16, F-40）。
4. **肋骨様の線の密度**: 画像では椎間周期 6.6 px に対し、肋骨様の線が約4.2 px 間隔。1椎骨あたり約1.5本に見え、肋骨（pleural ribs）だけでなく別の細い骨が写っているのか、扇の幾何学による見かけかは不明（F-03）。
5. **顎の変形部位**: 査読レビューは Oncorhynchus で上顎の変形が最も特徴的とする一方、写真の産卵期の雄2枚は下顎先端の上向きのフックが明瞭（F-25, F-11）。排他ではなく両方が起こる可能性があるが、ヤマメでの内訳は未確定。
6. **向きの推定**: 画像の左＝腹側は、本ストリームの推定（肋骨の扇、鰭の位置）。ユーザー指示の推定と一致するが、画像から独立に確定したものではない（F-01）。
7. **Christie (1970) のランク**: r02 は A、r06／r10 は C に降格。本書は C に統一（F-16, F-18）。
8. **r07 の M と本書の M**: 上顎の構成（前上顎骨・主上顎骨・上主上顎骨）は r07 の M と本書の M（F-28）で同じだが、同じ記憶の再掲であり、独立の確認ではない。
9. **上主上顎骨の枚数（新規）**: 私の記憶（M）は1枚、古典的記載の検索要約（C、魚種不明）は「2枚の大きな上主上顎骨」（F-35）。サケ科・Oncorhynchus で何枚かは**未確定**。モデルは1枚で作り、枚数は後で確認する。
10. **担鰭骨の本数（新規）**: 検索要約の「ニジマスの背鰭の担鰭骨7〜9本、臀鰭12〜14本（椎骨14〜21番）」（C）は、標本画像（P：背鰭の塊12〜15、臀鰭10〜11、臀鰭は腹鰭より尾側）および鰭条数と矛盾するため**採用しない**（F-41）。
11. **頭の挙上量（新規）**: ニジマスの捕食ストライクで 2〜18°（A、F-22）、ブルックトラウトの raking で平均36°（A、F-45）。種（Oncorhynchus 対 Salvelinus）と動作（捕食対餌処理）が違い、**矛盾ではなく行動別の値**と解釈する（未検証）。
12. **顎の時間スケール（新規）**: サケ科の値は raking の49 ms（F-45）だけで、口を開く動作そのものの値は無い。PROXY（ブルーギル13 ms）をそのまま使えるかは未検証（F-23）。
13. **呼吸の位相の記述（新規）**: F-46 の要約は口腔の収縮開始を「鰓蓋の外転の約1/5周期前」としており、内転の誤記の疑いがある。

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル／アニメ／行動実装に必要だが確認できなかった事項

**今回の検索で埋まった／部分的に埋まったもの**: 歯のある骨の一覧と舌咬み装置の歯板（F-38、定性のみ）、ニジマスの脊椎骨 63＝33＋30（F-33、PROXY）、ブルックトラウトの raking の頭蓋挙上36°・49 ms（F-45、PROXY）、サケ科の尾部骨格の一般型（F-42）、舌顎骨の関節（F-36）、鰓蓋骨系4枚の構成（F-37）、ニジマスの鰓耙・鰭条（F-39, F-40）、換気の位相（F-46）。

**まだ埋まらないもの**:

1. **顎・頭蓋の骨の個々の形と接続（課題2）**: 前上顎骨・主上顎骨・上主上顎骨・歯骨・関節骨・方形骨の寸法比、接続の靱帯。F-35 は魚種不明の古典的記載の要約のみ。上主上顎骨が1枚か2枚か（F-35 と M の食い違い）。**対策**: Idaho Virtual Museum のニジマス標本ページ（F-37）の画像を直接見る。Sanford (2000) "Salmonid fish osteology and phylogeny"（Theses Zoologicae）を探す（検索では見つからなかった）。
2. **鰓蓋骨系の形（課題2）**: 鰓蓋・前鰓蓋・間鰓蓋・下鰓蓋の輪郭と頭長に対する大きさ。
3. **鰓条骨の本数（課題2）**: ヤマメの片側の本数。青森の「11」は曖昧、11〜15は帰属不明、古い記載は10〜16（F-48、帰属不明）。ニジマスの本数は今回も得られなかった。
4. **鰓弓4対・鰓弁・咽頭歯（課題2、4）**: 鰓耙の上・下の個数、咽頭歯の本数・形、鰓糸の数と鰓薄板の密度。ニジマスの第1鰓弓の鰓耙（17〜21）と Salmo の咽頭歯板2対（F-39）のみ。
5. **顎の機構の数値（課題3）**: サケ科の下顎の最大開口角、主上顎骨の回転角、前上顎骨の可動量、舌骨の押し下げ量、鰓蓋の外転角、鰓蓋腔の容積、鰓条骨膜の展開幅、開口の時間経過。検索（サケ科の上顎の運動、ニジマスの摂餌運動学、gape cycle）でも見つからず、PROXY（吸引型一般の順序 F-43、ブルーギル13 ms F-23）と raking（F-45）のみ。
6. **歯の本数と大きさ（課題4）**: 前上顎骨・主上顎骨・歯骨・鋤骨・口蓋骨・舌・咽頭歯の本数、歯の長さ、傾き。F-38 は配置の定性のみ。
7. **脊椎骨の内訳（課題5）**: ヤマメの腹椎数・尾椎数、肋骨を持つ椎骨の範囲、上肋骨、尾部骨格（上尾骨 epural の本数を含む）、尾鰭支持の詳細。O. masou 固有の値は FishBase 等で取得できなかった（検索で FishBase の O. masou ページの数値は返らず）。F-33（ニジマス PROXY）、F-42（サケ科の一般型）のみ。
8. **鰭の骨格（課題6）**: 背鰭・臀鰭・胸鰭・腹鰭の担鰭骨数（F-41 は不採用）、各鰭の基部の位置（椎骨番号）、胸鰭帯・腰帯の形。標本画像（F-04〜F-07）の下限・概算のみ。
9. **標本画像の側の不足**: 種の同定（ラベルが読めない）、スケール、固定前の体長。尾部、頭部の側面像、背面像、より高解像度の画像があれば、F-10 の「言えないこと」の多くが解消できる。**追加で欲しい画像**: (a) 頭部の真横（左側面）像、(b) 尾部（尾鰭・下尾骨）の像、(c) 口を開いた像、(d) 鰓蓋を外した像。
10. **ヤマメの成熟雄の顎の形状（河川型）**: 定量資料なし（F-25）。
11. **頭部側線管の孔の座標**: 未取得（F-27）。
12. **サケ科の捕食時の突進距離・速度、口を開く動作の時間**: 未取得（F-44 は棘鰭類）。ニジマス／ヤマメの捕食で body ram がどれだけか。
13. **文献候補（本文は未確認）**: Stearley & Smith (1993) Trans. Am. Fish. Soc. 122(1):1-33（骨学形質119。書誌は検索で確認）、Sanford (1990) Bull. Br. Mus. Nat. Hist. (Zool.)（比較骨学。題名を検索で確認）、Sanford (2000) Salmonid fish osteology and phylogeny（検索で見つからず）、Norden 1961（未確認）、Lauder (1980)、Anker (1974)（M、未確認）、Beam theory predicts muscle deformation and vertebral curvature during feeding in rainbow trout (J. Exp. Biol. 226(20) jeb245788。題名のみ確認、要約は読めていない)。
14. **今回の検索の限界**: 要約だけで本文を読めていないため、F-33〜F-49 のうち出典URLの対応が不確実なものは、ランクを B/C に下げている。論文の本文が読める環境なら、F-33（63＝33＋30）、F-38（歯板）、F-43（運動順序）、F-46（位相）を最初に原典で確認すること。

---

## 5. 出典一覧（URL付き。重複排除。「出典候補」は検索要約との対応が特定できないもの）

- ユーザー提供画像: /tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/skeleton/s01.jpg（P）
- 写真カタログ: /home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json 〜 catalog_c07.json（P）
- 先行ストリームの書: /home/user/gerupamasini/docs/yamame/research/r01_morph_jp.md、r02_morph_en.md、r07_eye_head_mouth.md、r10_fins.md
- **以下は継承（初版で記載。再検索していない）**
- https://www.aomori-itc.or.jp/_files/00228510/450-456.pdf （F-15, F-19）
- https://en.wikipedia.org/wiki/Oncorhynchus_masou 、https://animalia.bio/oncorhynchus-masou 、https://www.wikiwand.com/en/articles/Masu_salmon 、https://grokipedia.com/page/Oncorhynchus_masou （F-12, F-18）
- https://www.fishbase.se/summary/Oncorhynchus-kisutch.html 、https://fishbase.se/summary/241 、https://www.fishbase.se/summary/oncorhynchus-nerka.html 、https://fishbase.se/summary/Oncorhynchus-tshawytscha 、https://www.fishbase.se/summary/oncorhynchus-mykiss.html （F-13）
- https://agris.fao.org/search/en/records/6471f58e2a40512c710eef57 （F-14、Mano ら 1991）
- https://link.springer.com/article/10.1111/j.1444-2906.2008.01531.x （F-14、Ando ら 2008）
- https://www.pref.hokkaido.lg.jp/sr/gid/fis023.html 、https://www.fra.go.jp/shigen/salmon/files/salmon08_p11-14.pdf 、https://ja.wikipedia.org/wiki/%E3%82%B5%E3%82%AF%E3%83%A9%E3%83%9E%E3%82%B9 、https://www.hro.or.jp/upload/36117/o7u1kr00000008vd.pdf （F-12, F-16, F-25）
- https://www.afs-oc.org/wp-content/uploads/2017/08/Christie-Review-of-the-Japanese-salmons.pdf （F-18）
- https://www.marinelifeid.com/identification/masu-salmon-oncorhynchus-masou-masou/ 、https://allfishes.org/fishes/marine/masu-salmon （F-19）
- https://publication.plazi.org/GgServer/html/03A3D24DFF854B70B4CEFB2FFD87650C （F-17）
- https://en.wikipedia.org/wiki/Oncorhynchus 、https://en.wikipedia.org/wiki/Salvelinus 、https://en.wikipedia.org/wiki/Oncorhynchus_masou_formosanus （F-20, F-49）
- https://sicb.org/?p=35129 、https://sicb.org/abstracts/evaluating-the-importance-of-new-structures-versus-new-muscle-activity-patterns-in-the-evolution-of-a-novel-feeding-mechanism-in-salmonid-fishes （F-21, F-38）
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8385379/ 、https://par.nsf.gov/biblio/10516045 、https://sicb.org/?p=43945 （F-22）
- https://en.wikipedia.org/wiki/Aquatic_feeding_mechanisms 、https://vliz.be/imisdocs/publications/346500.pdf 、https://biomechanics.ucr.edu/Higham%202011%20Fish%20Physiology.pdf 、https://biomechanics.ucr.edu/Higham_etal_2006a.pdf 、https://pmc.ncbi.nlm.nih.gov/articles/PMC8753175 、https://pmc.ncbi.nlm.nih.gov/articles/PMC4507239 （F-23, F-24）
- https://link.springer.com/article/10.1007/s11160-021-09694-4 （F-25）
- https://journals.biologists.com/jeb/article-abstract/198/12/2557/7087/The-effects-of-softwater-acclimation-on?redirectedFrom=fulltext 、https://link.springer.com/article/10.1007/s10695-023-01247-9 、https://link.springer.com/article/10.1007/BF00263599 、https://pmc.ncbi.nlm.nih.gov/articles/PMC9923008/ （F-26）
- https://link.springer.com/article/10.1007/s10228-021-00843-0 、https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9537280/ （F-27）
- **以下は今回の検索（本改訂）で出た URL**
- https://doaj.org/article/dc8bd61f4d8c4fbe8f435c205a8d64a8 、https://agris.fao.org/search/en/records/67599cfcc7a957febdfe657e （F-33）
- https://paleo.iri.isu.edu/ViewSpecimen.aspx?id=766 、https://paleo.iri.isu.edu/ViewSpecimen.aspx?ID=767 、https://virtual.imnh.iri.isu.edu/Osteo/View/Chinook_Salmon/765 、https://virtual.imnh.iri.isu.edu/Osteo/View/Cutthroat_trout/771 、https://www.nabohome.org/products/manuals/fishbone/fish/Skull/skull.htm （F-33, F-37）
- https://www.hro.or.jp/upload/41227/dayori91sake.pdf 、https://eprints.lib.hokudai.ac.jp/repo/huscap/all/24086/42(4)_P147-159.pdf 、https://www.aomori-itc.or.jp/_files/00229791/217-220.pdf （F-34）
- https://collections.lib.utah.edu/details?id=263433 、https://collections.lib.utah.edu/details?id=263429 、https://collections.lib.utah.edu/details?id=263431 、https://collections.lib.utah.edu/details?id=275160 、https://archpress.lib.sfu.ca/index.php/archpress/catalog/download/49/20/906?inline=1 、https://sicb.org/?p=15656 、https://digitalcommons.pcom.edu/scholarly_papers/1638/ 、https://researchprofiles.library.pcom.edu/en/publications/the-sabertooth-salmon-oncorhynchus-rastrosus-gets-a-facelift/ （F-35, F-38）
- https://www.vliz.be/imisdocs/publications/396850.pdf 、https://marineinfo.org/id/publication/383702 （F-36）
- https://journals.usamvcluj.ro/index.php/zootehnie/article/view/5355 、https://sicb.org/?p=31727 、https://www.infish.com.pl/wydawnictwo/Archives/Fasc/work_pdf/Vol19Fasc1/Vol19-Fasc1-%20w02.pdf （F-38）
- https://palaeo-electronica.org/2001_2/fish/onchor_m.htm 、https://aquaticpath.phhp.ufl.edu/fg2/anat/internal.rt.html 、https://agris.fao.org/search/fr/records/65de51eb4c5aef494fdba4d2 （F-39, F-40）
- https://www.ru.ac.za/media/rhodesuniversity/content/ichthyology/documents/Anatomy_Lecture_3.pdf 、https://arc.lib.montana.edu/robert-behnke/objects/2491-32-11.pdf （F-41、不採用）
- https://openpolar.no/Record/crwiley:10.1002%2Fjmor.10775 、https://agris.fao.org/search/en/records/676558defccf879925c0f83c （F-17, F-42）
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12517347/ 、https://journals.biologists.com/jeb/article/228/18/jeb250567/369343/A-mechanical-perspective-on-suction-feeding-in 、https://biomechanics.ucr.edu/Day%20et%20al%202015%20ICB.pdf 、https://fishlab.ucdavis.edu/wp-content/uploads/sites/397/2020/05/Mehta-Wainwright-2007.pdf 、https://en.wikipedia.org/wiki/Cranial_kinesis 、https://par.nsf.gov/servlets/purl/10192305 、https://sicb.org/?p=34346 （F-29, F-43）
- https://cob.silverchair.com/jeb/article/doi/10.1242/jeb.129015/262046/am/Body-ram-not-suction-is-the-primary-axis-of 、https://cob.silverchair.com/jeb/article-pdf/doi/10.1242/jeb.129015/2038543/jeb_129015v1.pdf （F-44）
- https://journals.biologists.com/jeb/article/204/22/3905/32920/Kinematic-analysis-of-a-novel-feeding-mechanism-in 、https://journals.biologists.com/jeb/article/211/21/3378/17848/Biomechanics-of-a-convergently-derived-prey 、https://journals.biologists.com/jeb/article/211/6/989/18071/Is-a-convergently-derived-muscle-activity-pattern （F-45）
- https://sites.harvard.edu/glauder/files/2022/03/Lauder1980BiofluidMechanics.pdf 、https://sicb.org/?p=38852 、https://nature.com/articles/179255a0.pdf 、https://cob.silverchair.com/jeb/article-pdf/53/3/529/3179455/jexbio_53_3_529.pdf 、https://cob.silverchair.com/jeb/article-pdf/63/3/537/3185249/jexbio_63_3_537.pdf （F-46）
- https://cob.silverchair.com/jeb/article-pdf/223/20/jeb223180/1980056/jeb223180.pdf 、https://datadryad.org/dataset/doi:10.5061/dryad.sn02v6x2c （F-47）
- https://archive.org/download/biostor-14292/biostor-14292.pdf 、https://repository.si.edu/server/api/core/bitstreams/863ffd97-8144-4fed-993d-5da8101d78f4/content （F-48）
- https://zoolstud.sinica.edu.tw/Journals/29.3SUPPLEMENT/41.pdf （F-49）
- https://research.calacademy.org/research/ichthyology/catalog/getref.asp?id=26683 （F-28、書誌確認の候補）
- https://journals.biologists.com/jeb/article/226/20/jeb245788/334186/Beam-theory-predicts-muscle-deformation-and （Gaps 13、題名のみ）

---

## 6. 検索ログ

**WebSearch の呼び出し回数: 34 回**（割当 34、mode はすべて "standard"、拒否なし）。ただし次の4回は、1回の呼び出しの中で複数の検索ブロックが返った（#15: 3ブロック、#18: 2ブロック、#28: 3ブロック、#29: 4ブロック）。ツール側が内部で追加検索をしたとみられ、**全体予算の消費は呼び出し回数34より大きい可能性がある**（実消費は不明）。以降の調査員は、予算の残りを確認してから検索すること。

| # | クエリ（要旨） | mode | 結果と有用度 |
|---|---|---|---|
| 1 | salmonid cranial osteology premaxilla maxilla supramaxilla dentary Oncorhynchus skull bones description | standard | 中。主上顎骨・上主上顎骨の古典的記載（OCR）、歯骨と angular-articular の抄録（F-35） |
| 2 | Oncorhynchus mykiss skull osteology opercle preopercle interopercle subopercle branchiostegal rays hyomandibula | standard | 中。舌顎骨の関節、Idaho Virtual Museum の要素一覧（F-36, F-37） |
| 3 | Oncorhynchus masou vertebrae number abdominal caudal vertebrae | standard | 中。ニジマス63＝33＋30（F-33）。O. masou の内訳は無し |
| 4 | steelhead Oncorhynchus mykiss total of 63 vertebrae 33 trunk 30 caudal osteology | standard | 中。F-33 の再確認（出典の特定は不能） |
| 5 | サケ科 頭骨 骨格 前上顎骨 主上顎骨 上主上顎骨 鰓条骨 サクラマス ヤマメ 骨格標本 | standard | 低。サクラマスの形態（青森）と絶滅サケ属の前上顎骨。骨学の記述は無し |
| 6 | Calcium and Phosphorus Contents, and Microstructure of Vertebrae in Rainbow Trout ... | standard | 低。椎骨の骨化・Ca/P（F-33 の補足） |
| 7 | Oncorhynchus masou fishbase vertebrae dorsal soft rays anal soft rays masu salmon | standard | 無〜低。FishBase の O. masou 数値は返らず |
| 8 | rainbow trout prey capture kinematics maximum gape angle hyoid depression cranial elevation ... ram suction | standard | 中。拡張相の一般的な順序（F-43）。サケ科の角度は無し |
| 9 | salmonid tongue-bite apparatus basihyal teeth vomer palatine teeth Oncorhynchus feeding raking Sanford | standard | 高。舌咬み装置の歯板の配置（F-38）、ブルックトラウトの論文の所在（F-45） |
| 10 | Sanford 2000 Salmonid fish osteology and phylogeny Teleostei Salmonidae Theses Zoologicae | standard | 低。Sanford (1990) の題名のみ。2000年の書は見つからず |
| 11 | rainbow trout feeding kinematics gape angle lower jaw depression hyoid retraction opercular abduction ...（許可ドメイン指定） | standard | 中。鰓蓋リンクと運動順序（F-43）。魚種は吸引型一般 |
| 12 | trout time to peak gape milliseconds feeding strike ram-suction index ... | standard | 低。TTPG の定義とブルーギル値の再確認。サケ科の値は無し |
| 13 | rainbow trout gill arches gill rakers pharyngeal teeth number branchiostegal rays 10-12 ... | standard | 中。鰓弓4対、鰓耙17〜21、鰭条の不分枝・分枝（F-39, F-40） |
| 14 | Morpho-Histological Peculiarities of Oro-Pharyngeal Cavity of Rainbow Trout ... teeth ... | standard | 中。口蓋骨歯・鋤骨歯、舌の構造（F-38） |
| 15 | rainbow trout teeth maxilla premaxilla dentary vomer palatine tongue basibranchial pharyngeal tooth plates ...（3ブロック） | standard | 中。歯のある骨、咽頭歯板2対（F-38, F-39） |
| 16 | Stearley Smith 1993 Phylogeny of the Pacific trouts and salmons ... osteological characters | standard | 低。書誌のみ確認（119形質、33現生種・亜種） |
| 17 | salmonid caudal skeleton hypurals uroneurals epurals preural centra principal caudal fin rays Oncorhynchus 19 rays | standard | 中。サケ科の一般型（下尾骨6・尾神経棘3、F-42） |
| 18 | salmonid pectoral fin skeleton radials scapula coracoid cleithrum rainbow trout ...（2ブロック） | standard | 低。胸鰭の放射骨数は返らず（Gap） |
| 19 | rainbow trout dorsal fin pterygiophores number proximal radials anal fin ... pelvic girdle basipterygium | standard | 低。疑わしい値（F-41、不採用） |
| 20 | ヤマメ サクラマス 脊椎骨数 椎骨数 腹椎 尾椎 計数形質 | standard | 中。水温と脊椎骨数の話題（F-34）。ヤマメの本数は無し |
| 21 | Oncorhynchus masou vertebrae 63 64 65 66 masu salmon meristic counts branchiostegal rays gill rakers pyloric caeca | standard | 低。古い記載のグループ別範囲（F-48）。Taiwan の研究の所在 |
| 22 | Formosan landlocked salmon O. m. formosanus morphometric meristic vertebrae gill rakers branchiostegal ... | standard | 中。頭部比（F-49）。脊椎骨数は無し |
| 23 | サクラマス 飼育水温 脊椎骨数 増加 X線写真 神経棘 尾部棒状骨 水温 9℃ 12℃ 16℃ | standard | 中。発生水温で脊椎骨数が変わる（F-34） |
| 24 | Oncorhynchus formosanus Formosan landlocked salmon fishbase vertebrae dorsal spines soft rays anal soft rays | standard | 無。数値は返らず |
| 25 | サケ サクラマス 頭骨 鰓蓋骨 前鰓蓋骨 間鰓蓋骨 下鰓蓋骨 歯骨 前上顎骨 主上顎骨 同定 遺跡 出土魚骨 | standard | 無。骨学の記述は返らず |
| 26 | salmonid upper jaw kinesis maxilla rotation premaxilla protrusion trout mouth opening mechanism ... | standard | 低。硬骨魚一般の突出機構（F-43）。サケ科の値は無し |
| 27 | rainbow trout ventilation opercular abduction buccal expansion phases kinematics ... | standard | 中。トラウトの口腔・鰓蓋の位相（F-46） |
| 28 | Oncorhynchus branchiostegal rays count 10 11 12 rainbow trout steelhead cutthroat masou Behnke ...（3ブロック） | standard | 無〜低。本数は返らず（Gap） |
| 29 | gape cycle duration trout strike mouth opening time ms Atlantic salmon brown trout rainbow trout ...（4ブロック） | standard | 低。サケ科の開口時間は返らず |
| 30 | The bite force-gape relationship ... two salmonid fishes maximum gape angle lower jaw | standard | 中。Oncorhynchus 2種の咬合力と開口（F-47）。角度は無し |
| 31 | number of teeth on premaxilla maxilla dentary vomer palatine in salmonids ... tooth counts per bone | standard | 低。鋤骨歯1〜2列のみ。本数は無し |
| 32 | rainbow trout first gill arch gill filaments number per arch gill rakers lamellae per mm ... | standard | 無。鰓糸数の定量は返らず |
| 33 | trout ram feeding salmonid ram-suction continuum prey capture mostly ram ... | standard | 中。棘鰭類40種の body ram（F-44、PROXY） |
| 34 | salmonid raking behavior hyoid retraction neurocranial elevation kinematics ...（許可ドメイン指定） | standard | 高。ブルックトラウトの raking の定量（F-45） |

本書の根拠となった非検索の作業（初版から継承）:
- s01.jpg を Read で開き、grid.py でグリッド付きズーム（全体 s25、頭部 7倍と10倍、背鰭・臀鰭・腹鰭・胸鰭域 8倍、体幹中央・上部 5倍）。numpy／PIL による脊柱中心線の追跡、周期のピーク検出、鰭条・担鰭骨・肋骨の走査線計数（各3〜4本）。今回の改訂でも s01.jpg を Read で開き直し、初版の記述（頭を下にした像、脊柱は上辺 (222,0) で画角外に出る、青系一色、頭部は下端の濃青の塊）と矛盾しないことを確認した（再計測はしていない）。
- 既存ファイル r07、r01、r02、r10 の関連箇所の読込み（継承）。catalog_c01〜c07 の head_mouth・caveats の機械検索（歯・舌・鰓弁・鰓耙に触れる写真は p012 の1枚のみ）。
