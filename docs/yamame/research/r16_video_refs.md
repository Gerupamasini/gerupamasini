# 動画・映像リファレンスの所在調査（遊泳・定位・捕食・逃避・産卵）— ヤマメ（Oncorhynchus masou masou 河川型）／サケ科トラウト — r16

> 作成: ストリームR16（動画・映像リファレンス担当）。**新規作成（既存の r16 ファイルなし）**。
>
> **この文書を使う前に必ず読むこと（調査の限界）**
> 1. **本ストリームでは WebSearch が 1 回も成功していない。** 割当は 26 回だったが、セッション全体の WebSearch 上限（200/200、他ストリームと共有）が既に使い切られていた。最初の 3 クエリ（「ヤマメ 水中 動画 捕食 渓流 定位」「ヤマメ 産卵 動画 水中」「trout underwater video drift feeding stream behaviour」）を同時に試したところ、3 件とも「Web search was not performed: this session has used its web search budget (200 of 200 ...)」と返った。指示どおり**そこで検索を止め**、迂回（WebFetch、curl、他の取得経路）は一切試していない。**実際に成功した検索回数は 0（試行 3 回、全て拒否）。**
> 2. その結果、**課題 1〜4 の核心（実写映像の URL・タイトル・チャンネル・長さ・ライセンス）は 1 件も確認できていない。** 下の「映像の URL」は 1 つも載せていない。URL を創作するよりも、空欄（Gap）にするほうが仕様書への害が小さいと判断した。
> 3. 本書にあるのは、次の 4 種類だけである。
>    - **(a) 先行ストリーム（r07、r08、r09、r12）が検索で確認済みの「映像（高速度映像・3D ビデオ）を使った研究論文」の書誌と URL の転載。** 論文であって、映像そのものの所在ではない。**付属動画があるか、公開か、ライセンスは何かは、全て未確認。** 本ストリームでは再検証していない（転載）。
>    - **(b) 写真 70 枚（photo_analysis/catalog_c01〜c07.json）由来の P 所見の転載**（r12 経由）。静止画であり、動画の代替にはならない。
>    - **(c) 私の記憶 M（全て未検証）。** 動画源の候補カテゴリと、縄張り・産卵の観察ポイント。番組名・チャンネル名・URL は挙げていない（記憶に頼った固有名は誤りの危険が大きいため）。
>    - **(d) 再実行用の検索計画**（§6）。
> 4. ユーザー依頼文は「ヤマメの骨格です。口や顔、鰓などの再現に利用してください」である。**骨格の画像・資料は本ストリームの入力に含まれておらず、photo_analysis の JSON にも「骨格・skeleton」に当たる語は無かった。** 骨格に基づく口・顔・鰓の再現のために、映像で確認すべき項目は F-07 にまとめた。ただし、それは骨格資料の内容を見た上での記述ではない。
> 5. 証拠ランク: A=査読論文・学術書・公的機関資料で要約に数値/記述が明示（先行ストリームが確認したものを転載）／B=図鑑・博物館・学会抄録・信頼できる解説／C=釣り・個人ブログ等／M=自分の記憶（未検証）／P=ユーザー提供写真 70 枚からの観察・集計。PROXY は適用範囲に明記。

---

## 1. 要約（仕様に直結する結論）

1. **ヤマメ／サクラマス／トラウトの実写映像（①定位・休息 ②ドリフト捕食と復帰 ③遊泳 ④旋回 ⑤逃避 ⑥縄張り争い ⑦産卵）の URL は、本調査では 1 件も確認できていない。** WebSearch 予算がセッション全体で枯渇していたため（0 回成功）。したがって実写映像の仕様書引用は不可。再調査が必要。[F-01]
2. **「映像を使った研究」は、先行ストリームの検索で書誌まで確認済み。** ドリフト捕食の 3D ビデオ解析（ブラウントラウト野外、coho／steelhead 水槽、Chinook 野外）が該当する。ただし全て PROXY で、論文であり、映像の公開は未確認。[F-02、F-03]
3. **逃避（C-start）は、ニジマス（PROXY）の高速スタートの定量論文が揃っている。** Webb 1976、Harper & Blake 1990、Webb 1983、Goldbogen ら 2005（高速度映像で体軸の運動学を解析）、サケ科稚仔魚の Hale 1999、総説 Domenici & Blake 1997・Domenici & Hale 2019・2023 のガイドライン。付属動画の有無は未確認。[F-04]
4. **逃避・旋回の実装用数値は、映像が無くても論文要約から得られている（PROXY: ニジマス）。** 逃避は C 型と S 型、主加速段階は 0.07〜0.10 s（9.6〜38.7 cm）、最小旋回半径は約 0.17〜0.18 L、最小潜時は 5〜20 ms（条鰭類一般）。数値の詳細と注意は r09 を参照すること。[F-04]
5. **定位・遊泳（①③）の映像ベースの運動学は、ニジマスで多い（PROXY）。** Kármán gait（Liao ら 2003、Akanyeti & Liao 2013a/b）、entraining（Przybilla ら 2010）、胸鰭・背鰭・腹鰭の機能（Drucker & Lauder 2003 ほか）、定常遊泳の運動学（Webb ら 1984）。映像は水槽・遊泳水路であり、自然河川のヤマメの映像ではない。[F-06]
6. **摂餌ストライク（②）の高速度映像は、サケ科 3 種（ニジマス含む）の舌咬み装置の学会抄録（250 Hz）が見つかっている（B）。** ヤマメが対象に含まれるかは不明。ドリフト餌への実際のストライクの映像・数値は未取得（r07、r09 と同じ Gap）。[F-05]
7. **口・鰓蓋の周期を映像で検証するときの目安（PROXY・転載）:** ニジマスの換気頻度は 57±4 回/分（対照）、78±4 回/分（軟水順化）。運動後は 1 回換水量（振幅）が増え、頻度はほとんど変わらない。吸引型の魚の開口時間（13 ms 程度）は ram 寄りのサケ科にそのまま使えない。[F-07]
8. **静止画の代替（P）:** 自然水中の定位フレームでは、腹縁と基質の距離は約 0.25〜1 体高（n=5）、背鰭が立つものは水中・水槽 23 フレーム中 11 枚。動画の代替ではなく、定位姿勢の静的な参照として使う。[F-08]
9. **動画源の候補カテゴリ（M、未検証・URL なし）:** 公共放送の自然番組、水産試験場・大学の公開映像、水族館の公式映像、研究室（遊泳運動学）の動画ページ、JEB 等の補足動画、一般の水中撮影チャンネル。いずれも存在・内容・権利は未確認。[F-09]
10. **縄張り争い（⑥）と産卵（⑦）は、本書に確認済みの資料が 0 件。** M として行動の型のみ記憶にある。ヤマメは産卵が秋、雌が産卵床を掘り雄が寄り添う、という一般的な知識のみで、季節・時間・頻度の数値は未取得。[F-10]
11. **ライセンス・埋め込み可否は全て不明。** 本書の論文はいずれも、補足動画の有無すら未確認。仕様書には「映像は再実行後に確認」と書く。[F-01、§4]
12. **仕様書の運用方針:** 実写映像の「見分けがつかない」基準は、現時点では (i) 写真 70 枚（P）、(ii) ニジマス等の PROXY 論文の数値、(iii) 再調査で得る映像リンクの 3 本立てで検証する。(iii) は未達。[F-01、F-04、F-06、F-08]

---

## 2. Findings

### F-01 本ストリームの実行記録（WebSearch 予算の枯渇）と、課題 1〜4 の結果
- 主張/値: WebSearch を 3 回試行し、3 回とも「Web search was not performed: this session has used its web search budget (200 of 200 WebSearch calls)」と返った。成功した検索は 0 回。割当 26 回のうち 0 回を使用（拒否された 3 回は予算に数えない扱いだが、念のため試行 3 回と記録）。
  - **課題 1（実写映像の表）: 確認できた映像 0 件。** 下表は、行動ごとの現状（映像なし／代替資料の所在）。
  - **課題 2（PROXY 映像）: 確認できた映像 0 件。** PROXY の論文は F-02〜F-06。
  - **課題 3（高速度撮影の公開映像・論文付属動画の URL）: 映像 URL 0 件。** 論文の URL は F-04〜F-06。
  - **課題 4（ライセンス・埋め込み可否）: 全て不明。**

| 行動 | 確認できた実写映像（URL） | 代替として使える資料（本書内） | 種 |
|---|---|---|---|
| ① 定位・休息 | なし（未確認） | F-06（Kármán gait、胸鰭の機能、Arnold ら 1991 の定位）、F-08（P: 写真） | PROXY: ニジマス、Atlantic salmon parr／P: ヤマメ写真 |
| ② ドリフト捕食と復帰 | なし | F-02、F-03（3D ビデオ解析の論文）、F-05（摂餌の高速度映像の抄録） | PROXY: ブラウントラウト、coho、steelhead、Chinook |
| ③ 遊泳（低速・巡航・高速） | なし | F-06（Webb ら 1984、Di Santo ら 2021 ほか） | PROXY: ニジマス ほか |
| ④ 旋回 | なし | F-04（Webb 1976、Webb 1983 の最小旋回半径） | PROXY: ニジマス |
| ⑤ 逃避（C-start） | なし | F-04（高速スタートの論文群） | PROXY: ニジマス、サケ科稚仔魚 |
| ⑥ 縄張り争い | なし | F-10（M のみ） | — |
| ⑦ 産卵行動 | なし | F-10（M のみ） | — |

- 適用範囲: 本ストリームの実行結果。ヤマメに限らない。
- 出典: 本ストリームの検索試行ログ（§6）。
- 証拠: 実行記録（証拠ランク対象外）。拒否メッセージ: "this session has used its web search budget (200 of 200 WebSearch calls)"。

### F-02 ブラウントラウトのドリフト捕食を 3D ビデオで解析した野外研究（Hughes ら 2003、PROXY）
- 主張/値: 題名に "three-dimensional videography of wild brown trout (Salmo trutta) in a New Zealand river" とある、ドリフト捕食モデルの検証研究。**題名と書誌のみ確認済み。数値（反応距離、捕獲成功、定位点の位置など）は要約に無く未取得。** 映像の公開、付属動画の有無、ライセンスは未確認。
- 適用範囲: PROXY: ブラウントラウト（野生、ニュージーランドの河川）。ヤマメ（日本の渓流）の映像ではない。サイズ・季節・水温は未取得。
- 出典: Hughes N.F., Hayes J.W., Shearer K.A., Young R.G. (2003) "Testing a model of drift-feeding using three-dimensional videography of wild brown trout, Salmo trutta, in a New Zealand river", Can. J. Fish. Aquat. Sci. 60:1462–1476。
  - https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river
  - （転載: r09 F-41、r12 Part A 経由。本ストリームでは再検証していない）
- 証拠: [A（書誌のみ・転載）] 題名 "Testing a model of drift-feeding using three-dimensional videography of wild brown trout"。

### F-03 coho／steelhead 幼魚の水槽 3D 映像解析（Piccolo ら 2008）と、Chinook 幼魚の野外 3D 映像研究（PROXY）
- 主張/値:
  - **Piccolo ら 2008（転載）:** 水槽で juvenile coho salmon と steelhead を流速 0.29〜0.61 m/s で比較（3D 映像解析）。捕獲確率と餌の検出距離は流速の増加で有意に低下。迎撃速度は流速にも種にも影響されず、全流速で予測最大持続遊泳速度（Vmax）で迎撃。（詳細と注意は r09 F-42、r12 を参照）
  - **Chinook 幼魚（書誌のみ）:** アラスカの透明な河川で、juvenile Chinook salmon のドリフト捕食の仕組みと、食べられない漂流物の役割を扱った研究。3D 映像研究と r09 が記録。数値は未取得。
  - 映像そのもの（付属動画）の有無は、いずれも未確認。
- 適用範囲: PROXY: coho、steelhead（水槽）、Chinook（野外、アラスカ）。いずれもヤマメではない。
- 出典:
  - Piccolo J.J., Hughes N.F., Bryant M.D. (2008) "Water velocity influences prey detection and capture by drift-feeding juvenile coho salmon (Oncorhynchus kisutch) and steelhead (Oncorhynchus mykiss irideus)", Can. J. Fish. Aquat. Sci.（巻頁は要約に無い）。URL（r09 は「対応未確認」と注記）: https://research.fs.usda.gov/treesearch/31556 ／ https://research.fs.usda.gov/treesearch/31555 ／ https://link.springer.com/article/10.1007/s10641-008-9330-1
  - "Mechanisms of drift-feeding behavior in juvenile Chinook salmon and the role of inedible debris in a clear-water Alaskan stream": https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream
- 証拠: [A（転載）] r09 F-42 の検索要約より "prey capture probability and detection distance decreased with water velocity"（要旨。原文の語句は r09 参照）。Chinook は [A（書誌のみ）]。

### F-04 逃避（C-start）・旋回の高速スタート研究群（映像・高速度解析。付属動画の有無は未確認）
- 主張/値: ⑤逃避と④旋回の運動学を扱う論文。各論文の要点は先行ストリーム r09 の転載（本ストリームでは再検証していない）。映像の URL は無い。

| 論文 | 要点（r09 の転載） | 種・条件 |
|---|---|---|
| Webb 1976 | 高速スタートは L 型・S 型。主加速段階は 0.07〜0.10 s（9.6〜38.7 cm）、最小旋回半径は 0.17 L | PROXY: ニジマス、電気刺激 |
| Harper & Blake 1990 | C 字は単峰、S 字は二峰の加速度曲線。平均最大加速度 59.7±8.3 m/s²（ニジマス 0.32 m）。逃避の継続時間は最大 0.134 s | PROXY: ニジマス、**加速度計**（映像ではない） |
| Webb 1983 | 活餌のミノーを攻撃するニジマス（25.7 cm）の最小旋回半径 0.18 L（要約の表記は 0.18±0.2 L） | PROXY: ニジマス |
| Goldbogen ら 2005 | 高速度映像で体軸の運動学を解析し、曲率が筋短縮から遅れる | PROXY: ニジマス |
| Hale 1999 | 孵化後初期発育で、Stage 2 の距離は全長に比例。卵黄吸収の終わりで体長比の性能が最大 | PROXY: chinook、coho、brown trout の稚仔魚 |
| Domenici & Blake 1997 | 高速スタートの 3 段階（Stage 1 準備、2 推進、3 可変）。逃避と摂餌ストライクの両方を扱う総説 | 条鰭類一般 |
| Domenici & Hale 2019 | 逃避反応の運動制御・運動学・行動の総説。最小潜時は 5〜20 ms の桁（要約。どの総説の文かは特定不能） | 条鰭類一般 |
| 2023 ガイドライン | 逃避の運動学・行動の実験・解析・報告の指針（JEB） | 条鰭類一般 |

- 適用範囲: 主に PROXY: ニジマス。ヤマメの高速スタートを撮った映像・論文は本書の範囲では見つかっていない。水温は多くの要約に無い。
- 出典:
  - Webb (1976) J. Exp. Biol. 65(1):157–177。https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance
  - Harper & Blake (1990) J. Exp. Biol. 150(1):321–342。https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo
  - Webb (1983) J. Exp. Biol. 102(1):115–122。https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two?redirectedFrom=fulltext ／ https://cob.silverchair.com/jeb/article-pdf/102/1/115/2428221/jexbio_102_1_115.pdf
  - Goldbogen ら (2005) J. Exp. Biol. 208(5):929–938。https://journals.biologists.com/jeb/article/208/5/929/15956/Fast-start-muscle-dynamics-in-the-rainbow-trout ／ https://pubmed.ncbi.nlm.nih.gov/15755891/
  - Hale (1999) J. Exp. Biol. 202(11):1465–1479。https://journals.biologists.com/jeb/article-abstract/202/11/1465/7927/Locomotor-mechanics-during-early-life-history?redirectedFrom=fulltext ／ https://pubmed.ncbi.nlm.nih.gov/10229693/
  - Domenici & Blake (1997) J. Exp. Biol. 200(8):1165–1178。https://tethys.pnnl.gov/publications/kinematics-performance-fish-fast-start-swimming ／ https://iris.cnr.it/handle/20.500.14243/268028
  - Domenici & Hale (2019) J. Exp. Biol. 222:jeb166009。https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity
  - （2023）J. Exp. Biol. 226(14):jeb245686。https://journals.biologists.com/jeb/article/226/14/jeb245686/324853/Kinematics-and-behaviour-in-fish-escape-responses
- 証拠: [A（転載）] 例: "The duration of the primary acceleration stages increased with size from 0.07 s ... overall radius of 0.17 L."（Webb 1976、r09 F-31 の検索要約）。Harper & Blake は加速度計での測定で、映像解析ではない点に注意。

### F-05 摂餌ストライク（②）の高速度映像: サケ科の舌咬み装置の学会抄録と、攻撃中の測定（PROXY）
- 主張/値:
  - **舌咬み装置（tongue-bite apparatus）:** ニジマス（O. mykiss）を含むサケ科 3 種を 250 Hz の高速度映像でコマ送り解析し、神経頭蓋と舌骨の動きが種間の差を最もよく説明した、という学会抄録（Sanford、Hofstra Univ.）。ヤマメが対象に含まれるかは不明。開口量・時間などの数値は要約に無い。映像の公開は未確認。
  - **攻撃中の測定:** Webb 1983 は、ニジマス 25.7 cm が活餌ミノーを攻撃するときの速度・加速度・旋回半径を測った（F-04）。Domenici & Blake 1997 は逃避と摂餌ストライクの両方を扱う。
  - **ドリフト餌へのストライク（開口・吸引・鰓蓋の動き）の実測値・映像は未取得**（r07、r09、r12 と同じ Gap）。
- 適用範囲: PROXY: ニジマスを含むサケ科 3 種（水槽）。
- 出典:
  - 舌咬み装置: https://sicb.org/?p=35129 （題目 "Comparative kinematic analysis of a novel feeding mechanism in salmonid fishes"）、関連: https://sicb.org/abstracts/evaluating-the-importance-of-new-structures-versus-new-muscle-activity-patterns-in-the-evolution-of-a-novel-feeding-mechanism-in-salmonid-fishes
  - Webb (1983)、Domenici & Blake (1997): F-04 の URL。
  - （転載: r07 F-16、F-17）
- 証拠: [B（転載）] 学会抄録の要約より "well-developed teeth on the dorsal surface of the anterior hyoid region and opposing teeth on the roof of the mouth"。250 Hz の記述は r07 の転載。

### F-06 定位・遊泳（①③）の映像ベースの運動学研究（ニジマス中心。PROXY）
- 主張/値: 以下は、水槽・遊泳水路で映像を解析した運動学の論文。映像の公開は未確認。数値の詳細は r08、r09、r10 を参照。
  - **Kármán gait**（障害物の後流で定位するときの体の動き）: Liao ら 2003（尾端振幅は自由流の約 3 倍とされる後続研究あり。尾びれ周波数は渦放出周波数に一致）、Akanyeti & Liao 2013a（流速・体サイズの効果）、2013b（運動学モデル）。
  - **entraining:** Przybilla ら 2010。体を波打たせず、まっすぐ、流れに角度を付けて保持し、鰭で補正する。
  - **胸鰭・背鰭・腹鰭:** Drucker & Lauder 2003（0.5 と 1.0 BL/s の定速遊泳中、胸鰭は体側に畳まれる。定位や低速の操縦で能動的に使う）、2024 の胸鰭の運動学・筋活動（JEB 227）、Standen & Lauder（背鰭、2005／brook trout 2007）、腹鰭（2008、2010）。
  - **定常遊泳:** Webb ら 1984（サイズと速度が運動学に与える効果、ニジマス）。Di Santo ら 2021（44 種の振幅包絡。サケ科を含むかは要約に無い）。
  - **定位（station-holding）:** Arnold ら 1991（Atlantic salmon parr の胸鰭の役割）、Webb 1989（底生魚 3 種）。
  - **総説:** Rheotaxis revisited（2020、魚が流れに向く行動）、ホバリングの不安定性のコスト（PMC）。
- 適用範囲: PROXY: ニジマス（主）、Atlantic salmon parr、brook trout。水槽・遊泳水路で、自然河川のヤマメではない。
- 出典:
  - Liao ら (2003) J. Exp. Biol. 206(6):1059–。https://journals.biologists.com/jeb/article/206/6/1059/14048/The-Ka-rma-n-gait-novel-body-kinematics-of-rainbow ／ https://pubmed.ncbi.nlm.nih.gov/15339945/
  - Akanyeti & Liao (2013a) J. Exp. Biol. 216(18):3442–3449。https://journals.biologists.com/jeb/article/216/18/3442/11608/The-effect-of-flow-speed-and-body-size-on-Karman ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/
  - Akanyeti & Liao (2013b) J. Exp. Biol. 216(24):4666。https://journals.biologists.com/jeb/article/216/24/4666/11863/A-kinematic-model-of-Karman-gaiting-in-rainbow
  - Przybilla ら (2010) J. Exp. Biol. 213(17):2976–2986。https://journals.biologists.com/jeb/article/213/17/2976/9891/Entraining-in-trout-a-behavioural-and-hydrodynamic
  - Drucker & Lauder (2003) J. Exp. Biol. 206:813–826。https://journals.biologists.com/jeb/article/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout ／ https://pubmed.ncbi.nlm.nih.gov/12547936
  - 胸鰭の運動学・筋活動（2024）J. Exp. Biol. 227(5):jeb246275。https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/
  - 背鰭・臀鰭・腹鰭: https://journals.biologists.com/jeb/article/208/23/4479/15977/Locomotor-function-of-the-dorsal-fin-in-rainbow ／ https://journals.biologists.com/jeb/article/210/2/325/17120/Hydrodynamic-function-of-dorsal-and-anal-fins-in ／ https://journals.biologists.com/jeb/article/211/18/2931/17665/Pelvic-fin-locomotor-function-in-fishes-three ／ https://journals.biologists.com/jeb/article/213/5/831/10106/Muscle-activity-and-hydrodynamic-function-of
  - Webb ら (1984) J. Exp. Biol. 109:77–95。https://journals.biologists.com/jeb/article/109/1/77/4184/The-Effect-of-Size-and-Swimming-Speed-on-Locomotor ／ https://cob.silverchair.com/jeb/article-pdf/109/1/77/2431967/jexbio_109_1_77.pdf
  - Di Santo ら (2021) PNAS 118(49):e2113206118。https://www.pnas.org/doi/10.1073/pnas.2113206118 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC8670443/ ／ https://sites.harvard.edu/glauder/files/2022/02/DiSanto.Goerig.etal_.megakinematics.ALL_.2021.pdf
  - Arnold ら (1991) J. Exp. Biol. 156:625–629。https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding
  - Rheotaxis revisited (2020) J. Exp. Biol. 223(23):jeb223008。https://journals.biologists.com/jeb/article/223/23/jeb223008/226046/Rheotaxis-revisited-a-multi-behavioral-and
  - ホバリング: https://pmc.ncbi.nlm.nih.gov/articles/PMC12280926
  - （全て転載: r08、r09、r10）
- 証拠: [A（転載）] 例: "during constant-speed swimming at 0.5 and 1.0 body lengths per second, the pectoral fins remain adducted against the body"（Drucker & Lauder 2003、r08 F-05）。

### F-07 口・顔・鰓蓋の動きを映像で再現・検証するときの目安（ユーザー依頼「口や顔、鰓の再現」に対応。転載）
- 主張/値: **映像から取るべき項目と、論文要約で既に得られている目安を併記する。映像由来の値は 0 件。**
  - **換気（鰓蓋の拍動）:** ニジマスの換気頻度は、通常酸素下で対照魚 57±4 回/分（0.95 Hz、周期 1.05 s）、軟水順化魚 78±4 回/分（1.30 Hz、周期 0.77 s）（平均±SEM）。水温・体サイズ・n は要約に無い。運動後は 1 回換水量（鰓蓋の開きの振幅）が増え、頻度と酸素利用率はほとんど変わらない。換気頻度の変化は鰓蓋圧の振幅の変化と独立に起こりうる。ニジマスの換気頻度は 10〜25 °C の範囲で高温ほど有意に増えるが、数値は未取得。
  - **摂餌の口の動き:** サケ科（ヤマメ）の最大開口角・開口時間・吸引距離・接近速度の実測値は未取得。吸引型の PROXY（ブルーギル: 最大開口まで約 13 ms、ラージマウスバス: 0〜8 ms で頭蓋挙上と開口、約 50 ms 以内に閉顎）は、ram 寄りのサケ科にそのまま使えるかが未検証。頭蓋の挙上は 2〜18°（r07 F-27）。
  - **映像で確認すべき項目（私の整理。M）:** ①静止時の口の閉じ方と上顎後端の位置、②換気 1 周期の口の開閉と鰓蓋の開閉の位相、③鰓蓋後縁の膜（鰓膜）の動き、④ストライク時の口の開き始めから閉顎までの時間、⑤ストライク時の頭蓋の挙上と鰓蓋の外転、⑥咳（鰓の掃除）の動き、⑦運動後の鰓蓋の振幅。
- 適用範囲: ニジマス（換気、PROXY）、ブルーギル・ラージマウスバス（吸引型の口の時間、PROXY）。ヤマメは数値なし。
- 出典: r07 F-17、F-20 の転載（本ストリームでは再検証していない）。URL は r07 に記載（吸引摂食の機構: https://en.wikipedia.org/wiki/Aquatic_feeding_mechanisms ほか。どの文がどの URL かは r07 でも特定不能）。
- 証拠: [A（換気、転載）／B（吸引型の時間、転載）／M（映像で確認すべき項目）]。r07 の検索要約より "average time to peak gape for bluegill ... approximately 13 ms"。

### F-08 写真 70 枚（P）による定位姿勢の静的参照（r12 から転載）
- 主張/値（r12 の集計をそのまま転載。本ストリームでは写真を見直していない）:
  - 自然水中の定位フレームで、魚体の腹縁は基質から約 0.25〜1 体高（p026 約 0.25、p005 約 0.7、p036・p040・p023B 約 1。n=5。スケール校正なし）。底に腹をつけて休む例は水槽（p017、p049）。
  - 定位中の鰭の姿勢は、水中・水槽 23 フレームのうち、背鰭が立つものが 11 枚、寝る／畳むが 2 枚、記述なしが 10 枚。胸鰭は、広げる 6、畳む・体側に沿う 8、垂れる・基質に押し付ける 6 で、一定の型は無い（手作業の分類）。
  - 写真は静止画のため、**時間変化（定位点からの出入り、尾びれ周波数、鰓蓋の周期）は一切得られない。**
- 適用範囲: P: ヤマメ（ユーザー提供写真）。高さ・距離は注釈者（AI）の目視推定。釣獲後に置かれた個体は除外されている。
- 出典: photo_analysis/catalog_c01〜c07.json（r12 Part B 経由）。
- 証拠: [P] 上記の集計。

### F-09 動画源の候補カテゴリ（記憶に基づく。存在・内容・権利は全て未確認。URL なし）
- 主張/値: 再調査（§6）で WebSearch により確認すべき候補の種類。**固有の番組名・チャンネル名・URL は、記憶の誤りを避けるため意図的に書かない。**
  1. 公共放送・自然ドキュメンタリーのアーカイブ（渓流魚、サクラマスの遡上・産卵の回がある可能性）。
  2. 国・道県の水産試験場、内水面研究機関、大学・研究室が公開する映像（サクラマス・ヤマメの生態、産卵、遡上）。
  3. 水族館の公式動画・公式 SNS（ヤマメ・サクラマス・イワナの展示水槽）。
  4. 魚類の遊泳運動学の研究室（Lauder 研、Liao 研などの動画ページ。F-06 の著者）。sites.harvard.edu/glauder は前ストリームの検索結果に出た（PDF のみ確認）。動画ページの有無は未確認。
  5. JEB、PNAS、PLOS などの補足動画（Supplementary Movie）。論文ごとに有無を確認する必要がある。
  6. 水中撮影者・釣り・自然観察の一般チャンネル（定評の有無は検索で確認。権利は個別に許諾が必要な場合が多い）。
- 適用範囲: ヤマメ、サクラマス、他のサケ科（PROXY）。
- 出典: なし（記憶）。
- 証拠: [M] 未検証。存在そのものを確認していない。

### F-10 縄張り争い（⑥）と産卵（⑦）の観察ポイント（記憶に基づく。確認済みの資料は 0 件）
- 主張/値:
  - **縄張り争い（M）:** 正面誇示、側面誇示（鰭を立てる）、突進（チャージ）、追跡、咬みつき（突つき）、旋回。頻度・持続時間・距離の数値は未取得（r12 F-23 の M と同じ）。写真（P）に闘争の場面は無い。
  - **産卵（M）:** 秋の産卵期に、雌が産卵床を作り、雄が寄り添う、という一般的な行動の流れ。尾で礫を掘る動作、体を震わせる動作、放卵・放精の瞬間の姿勢などが映像の見どころになりうるが、**ヤマメ・サクラマスについての具体的な時間・回数・体色の変化（婚姻色）の数値は未取得**。
  - 河川型ヤマメの婚姻色・体型の変化は r03 を参照すること（本ストリームでは再検証していない）。
- 適用範囲: M: サケ科一般の記憶。ヤマメ河川型に限定した確認は無い。
- 出典: なし（記憶）。r12 F-23（M）と整合。
- 証拠: [M] 未検証。

---

## 3. 資料間の矛盾・不一致

1. **映像由来か、加速度計由来か:** Harper & Blake 1990 の加速度は加速度計（皮下埋め込み）で測定。Webb 1976 や Goldbogen ら 2005 は映像を使う。r09 は、ニジマスの最大加速度に 34〜98 m/s² の幅があり、測定法（加速度計か、映像の 2 階微分か）、サイズ、水温の違いが原因の可能性としている。映像から加速度を出すと、フレームレート（時間分解能）に強く依存して値が変わる（私の推論。M）。
2. **逃避の刺激:** Webb 1976 は電気刺激（驚愕反応）、Webb 1983 は活餌への攻撃中の旋回。捕食者の接近（looming）への逃避ではない。野外のヤマメの逃避は、潜時・距離・方向が異なる可能性がある。
3. **PROXY の種:** 本書の運動学数値は、ほぼ全てニジマス（遊泳水路・水槽）。ドリフト捕食は coho、steelhead、ブラウントラウト、Chinook。ヤマメの動きとの差は不明。
4. **「映像あり」の意味:** 書誌上は「映像を使った研究」でも、補足動画が公開されているとは限らない。本書ではその区別を、全論文で「未確認」とした。

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル／アニメ／行動実装に必要だが確認できなかった事項

1. **実写映像の URL が 1 件も無い**（①〜⑦の全行動）。WebSearch 予算（200/200）の枯渇により、本ストリームは検索 0 回。→ 予算が回復した後の再実行が必要（§6 の計画）。
2. **ヤマメ・サクラマスの実写映像（水中・水槽）:** タイトル、チャンネル／機関、長さ、見どころ、ライセンス、埋め込み可否の全て。
3. **高速度映像の公開映像と論文付属動画の URL:** F-04〜F-06 の各論文に補足動画があるか、どこにあるか、権利は何か。
4. **ドリフト捕食（ストライク）の映像:** 開口から閉顎までの時間、鰓蓋の外転、定位点への復帰の軌跡。ヤマメ、近縁種ともに未取得。
5. **縄張り争いと産卵行動の映像:** 確認済みの資料が 0 件。
6. **ユーザーが言及した骨格の資料:** 依頼文の「ヤマメの骨格です」に当たる画像・資料が、本ストリームの入力に無かった。口・顔・鰓の再現には、骨格資料の内容（顎骨、鰓蓋骨、舌骨などの形と位置関係）を、映像の動きと突き合わせる作業が必要。
7. **ライセンス・埋め込み可否:** 全て不明。仕様書に映像を引用する場合は、各映像の利用条件を再確認すること。
8. **ヤマメ固有の運動学の数値:** 尾びれ周波数と速度の関係、逃避の潜時・速度、ストライクの時間など。PROXY（ニジマス等）の数値で暫定するしかない。

---

## 5. 出典一覧（URL付き。重複排除。先行ストリームの検索結果に出た URL の転載のみ。本ストリームで新たに取得した URL は 0 件）

- Hughes ら (2003) ブラウントラウト 3D ビデオ: https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river
- Chinook 幼魚のドリフト捕食: https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream
- Piccolo ら (2008)（対応は r09 が未確認とした）: https://research.fs.usda.gov/treesearch/31556 ／ https://research.fs.usda.gov/treesearch/31555 ／ https://link.springer.com/article/10.1007/s10641-008-9330-1
- Webb (1976): https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance
- Harper & Blake (1990): https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo
- Webb (1983): https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two?redirectedFrom=fulltext ／ https://cob.silverchair.com/jeb/article-pdf/102/1/115/2428221/jexbio_102_1_115.pdf
- Goldbogen ら (2005): https://journals.biologists.com/jeb/article/208/5/929/15956/Fast-start-muscle-dynamics-in-the-rainbow-trout ／ https://pubmed.ncbi.nlm.nih.gov/15755891/
- Hale (1999): https://journals.biologists.com/jeb/article-abstract/202/11/1465/7927/Locomotor-mechanics-during-early-life-history?redirectedFrom=fulltext ／ https://pubmed.ncbi.nlm.nih.gov/10229693/
- Domenici & Blake (1997): https://tethys.pnnl.gov/publications/kinematics-performance-fish-fast-start-swimming ／ https://iris.cnr.it/handle/20.500.14243/268028
- Domenici & Hale (2019): https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity
- 逃避の実験指針 (2023): https://journals.biologists.com/jeb/article/226/14/jeb245686/324853/Kinematics-and-behaviour-in-fish-escape-responses
- サケ科の舌咬み装置（SICB 抄録）: https://sicb.org/?p=35129 ／ https://sicb.org/abstracts/evaluating-the-importance-of-new-structures-versus-new-muscle-activity-patterns-in-the-evolution-of-a-novel-feeding-mechanism-in-salmonid-fishes
- 吸引摂食の機構（r07 経由。どの文がどの URL かは特定不能）: https://en.wikipedia.org/wiki/Aquatic_feeding_mechanisms
- Liao ら (2003) Kármán gait: https://journals.biologists.com/jeb/article/206/6/1059/14048/The-Ka-rma-n-gait-novel-body-kinematics-of-rainbow ／ https://pubmed.ncbi.nlm.nih.gov/15339945/
- Akanyeti & Liao (2013a): https://journals.biologists.com/jeb/article/216/18/3442/11608/The-effect-of-flow-speed-and-body-size-on-Karman ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/
- Akanyeti & Liao (2013b): https://journals.biologists.com/jeb/article/216/24/4666/11863/A-kinematic-model-of-Karman-gaiting-in-rainbow
- Przybilla ら (2010): https://journals.biologists.com/jeb/article/213/17/2976/9891/Entraining-in-trout-a-behavioural-and-hydrodynamic
- Drucker & Lauder (2003): https://journals.biologists.com/jeb/article/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout ／ https://pubmed.ncbi.nlm.nih.gov/12547936
- 胸鰭の運動学・筋活動 (2024): https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10984278/
- 背鰭・臀鰭・腹鰭: https://journals.biologists.com/jeb/article/208/23/4479/15977/Locomotor-function-of-the-dorsal-fin-in-rainbow ／ https://journals.biologists.com/jeb/article/210/2/325/17120/Hydrodynamic-function-of-dorsal-and-anal-fins-in ／ https://journals.biologists.com/jeb/article/211/18/2931/17665/Pelvic-fin-locomotor-function-in-fishes-three ／ https://journals.biologists.com/jeb/article/213/5/831/10106/Muscle-activity-and-hydrodynamic-function-of
- Webb ら (1984): https://journals.biologists.com/jeb/article/109/1/77/4184/The-Effect-of-Size-and-Swimming-Speed-on-Locomotor ／ https://cob.silverchair.com/jeb/article-pdf/109/1/77/2431967/jexbio_109_1_77.pdf
- Di Santo ら (2021): https://www.pnas.org/doi/10.1073/pnas.2113206118 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC8670443/ ／ https://sites.harvard.edu/glauder/files/2022/02/DiSanto.Goerig.etal_.megakinematics.ALL_.2021.pdf
- Arnold ら (1991): https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding
- Rheotaxis revisited (2020): https://journals.biologists.com/jeb/article/223/23/jeb223008/226046/Rheotaxis-revisited-a-multi-behavioral-and
- ホバリングのコスト: https://pmc.ncbi.nlm.nih.gov/articles/PMC12280926
- ローカル資料: /home/user/gerupamasini/docs/yamame/research/r03_lifestage_sex.md、r07_eye_head_mouth.md、r08_swim_steady.md、r09_swim_transient.md、r10_fins.md、r12_foraging_en.md、/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01〜c07.json

---

## 6. 検索ログ

### 6.1 実行結果（本ストリーム）
| # | クエリ | mode | 結果 | 有用度 |
|---|---|---|---|---|
| 1 | ヤマメ 水中 動画 捕食 渓流 定位 | standard | 拒否（"Web search was not performed ... 200 of 200"） | なし |
| 2 | ヤマメ 産卵 動画 水中 | standard | 拒否（同上） | なし |
| 3 | trout underwater video drift feeding stream behaviour | standard | 拒否（同上） | なし |

- **成功した検索回数: 0**（試行 3 回、全て予算枯渇で拒否）。mode:"extended" の使用は 0 回。指示に従い、拒否後は検索を止め、WebFetch・curl は試していない。
- 代わりに行った作業: 先行ファイル（r07、r08、r09、r12）の読み取り、photo_analysis の語の確認（骨格に当たる語なし）。

### 6.2 予算が回復した場合の再実行計画（割当 26 回、extended は最大 4 回）
優先度順。各クエリで allowed_domains を併用してもよい（journals.biologists.com、pmc.ncbi.nlm.nih.gov、jstage.jst.go.jp、youtube.com 等）。
1. ヤマメ 水中 動画 捕食 渓流 定位（日）
2. ヤマメ 産卵 動画 水中（日）
3. サクラマス 産卵 水中映像（日）
4. ヤマメ 縄張り 争い 水中 映像（日）
5. ヤマメ 水中撮影 ドライフライ ライズ 捕食 映像（日）
6. サクラマス 遡上 水中 映像 河川（日）
7. 水族館 ヤマメ 展示 動画（日）
8. 水産試験場 サクラマス 産卵 映像 公開（日）
9. trout underwater video drift feeding stream behaviour（英）
10. trout high-speed video C-start escape（英）
11. rainbow trout feeding strike high speed video supplementary movie（英）
12. masu salmon underwater footage Japan stream（英）
13. masu salmon spawning behaviour video redd digging（英）
14. brown trout territorial aggression underwater video agonistic display（英）
15. rainbow trout Kármán gait supplementary movie（英）
16. trout station holding video pectoral fin hovering（英）
17. Oncorhynchus mykiss gill ventilation opercular movement video X-ray high-speed（英）
18. salmonid feeding kinematics suction ram high-speed gape time rainbow trout（英）
19. Journal of Experimental Biology supplementary movie rainbow trout fast-start（英）
20. 補足動画の権利確認: JEB Supplementary Movie license CC BY（英）
21〜26. 上位の結果で見つかった論文名・著者名の深掘り（予備）

### 6.3 総検索回数
- 成功した検索回数: **0**。試行: 3（全て拒否）。
