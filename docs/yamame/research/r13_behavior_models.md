# 行動モデル・人工魚・手続き的遊泳アニメの先行事例（計算機科学／ゲーム）— ヤマメ3Dモデル向け調査（第3版：第2版の34回に加え、今回さらに WebSearch 23回で Gap を補強）

> 作成: ストリームR13。**第3版（上書き更新）**。経緯: 今回の依頼文は既存ファイルを「検索なしで書かれた初版」と説明していたが、読んだ時点のファイルは既に**第2版（standard 34 回で Part A を裏取り済み）**だった（初版は検索0回で全て記憶 M）。そこで第2版の内容と写真由来（P）の所見はそのまま残し、§4 の Gap と §3 の未解決点のうち優先度の高いものに絞って、**今回 standard モード 23 回（割当 28 回以内、extended 0 回、予算エラーなし）**を追加した。追加分は §1 の項目 28〜37、F-40〜F-44、および既存 F-02／05／07／08／10／31／34／36／39 への追記で、本文中に「第3版」と明記してある。第2版の検索ログ（#1〜#34）は §6 に残し、今回の分は #A1〜#A23 として別表にした。
>
> **この文書を使う前に必ず読むこと（調査の限界）**
> 1. **検索結果は「題名・URL・モデルが作った要約」のみ。論文全文は読めていない。** 式・係数・閾値・表の数値は、要約に明示されたものだけ採用した。要約に無い数値は Gap として §4 に書いた。
> 2. **ランクの扱い**: 初版の M を、検索要約が裏付けたものだけ B（教材・解説・技術報告）または A（査読論文・公的機関資料）に引き上げた。裏付けの無い M は「M」のまま残し、文中で明示した。
> 3. **一部の検索呼び出しは1回で複数の検索ブロックを返した**（第2版: #8, #13, #22, #23, #32。第3版: #A1 は3ブロック、#A2 は5ブロック）。ハーネス側の課金カウントは、本書の「呼び出し回数」（第2版 34、第3版 23）より多い可能性がある。第3版は呼び出し 23 回で止め、ブロック数まで数えた場合の超過を避けた。
> 4. **ヤマメ固有の実測は、遊泳キネマティクス（稚魚のみ）以外にほぼ無い。** 運動学・高速スタート・胸鰭・Kármán gait・側線の数値の大半は **PROXY（ニジマス等）**。計算機科学・ゲームの事例は魚種を問わない一般論で、ヤマメの根拠にはならない。
> 5. Part B（F-12〜F-27）は先行ストリーム r07・r08・r09・r11 の検索所見の**継承**で、本ストリームでは再検索していない。ランクは元ファイルのまま。F-28・F-29 は写真（P）の集計。
> 6. 「設計案」「推論」と書いた箇所は私の設計判断であって資料の主張ではない。

---

## 1. 要約（仕様に直結する結論。末尾の [F番号] は根拠 finding）

**A. 計算機科学・ゲームの先行事例（検索で裏取り済みを中心に）**

1. **Tu & Terzopoulos (1994) の人工魚は4層構造**: 物理モデル（23 質点・91 バネ、うち 12 本が筋）→ 運動制御器（Swim-MC、Left-turn-MC、Right-turn-MC）→ 知覚（視覚＝300° の球面角・半径は水の透明度で決まる、水温センサ）→ 行動（習慣・精神状態・意図生成器・行動ルーチン）。上の層が下の層を呼び出す（B）。Three.js の層分け（知覚／意図選択／運動学）の雛形に使える（設計案）。ヤマメ固有の根拠ではない。[F-01, F-03, F-04]
2. **意図生成器は「各フレームで、習慣・精神状態・感覚入力から意図を1つ選ぶ」**。精神状態は H（空腹）・L（性衝動）・F（恐れ）の3変数（各 0.0〜1.0）。**まず恐れを判定し、恐れが閾値未満なら空腹と性衝動を計算し、大きい方が閾値を超えれば摂餌か交尾を起動**する、という優先構造（B）。意図（行動ルーチン）は8種: avoiding-static-obstacle、avoiding-fish、eating-food、mating、leaving、wandering、escaping、schooling。**習慣は「感覚刺激と3状態変数を結ぶ重みのパターン」で、個体の好み（明暗・冷温・群れ）を与える**。閾値の値は未取得。[F-02]
3. **運動制御の考え方**: 人工魚では**後部の筋で前進、前部の筋で旋回**。ヤマメ実装では「行動層は高水準コマンド（目標速度・向き）だけを渡し、運動層（体波）が実行する」分離を借りる（設計案）。[F-03]
4. **Reynolds (1999) 操舵行動**は、動きを高位（目標設定・戦略）／中位（操舵）／低位（移動手段）の3レベルに分け、中位の操舵が移動手段から独立していると述べる。操舵の例は seek/flee、pursue/evade、arrival、wander、obstacle avoidance、containment（B）。**Reynolds (1987) の boids は各個体が近傍の局所知覚だけで動く**（B）。ヤマメ幼魚は縄張り性で順位制（r11）なので、群れの結合・整列を既定にする根拠は弱い。[F-05, F-23]
5. **inSTREAM（Railsback ら）**は日ステップの個体ベースモデルで、**各個体が自分の現在セルと移動半径内のセルの潜在適応度を評価し、最大のセルへ動く**（A）。適応度は「期待成熟度」（将来の生存確率 × 繁殖サイズへの到達割合）。**期待成熟度を最大化する規則だけが、現実のトラウトの6つの生息場所選択パターンを全て再現**（成長最大化は3つ、生存最大化は2つ。Railsback & Harvey 2002、A）。移動半径は v7.2 から「体長のロジスティック関数が上限へ近づく」形（A）。視覚シミュレーションでは**「定位点の選択」にだけ借りる**のが現実的（設計案）。[F-06, F-34]
6. **ドリフト捕食モデル**: Fausch (1984) は「魚は、遅い流速の定位点で、速い流れが餌を運ぶ近傍を選び、純エネルギー収支（NEI）を最大化する」と提案。Hughes & Dill (1990) は定位点の遊泳コストと捕獲成功から NEI を推定し、現在の多くのモデルの土台（B）。ただし**同モデルは餌の検出・捕獲と遊泳コストについて非現実的な仮定を含む**とも評される（B）。日本（北海道）では NEI と渓流サケ科の現存量が相関（Urabe ら 2010、A）。[F-07, F-35, F-36]
7. **ゲームAIの使い分け（検索で裏取り）**: 行動ツリーは Halo 2（Isla, GDC 2005）で提示され、1体あたり約 50 の行動を扱った（B）。Utility AI は Dill & Mark の GDC 2010 講演（応答曲線、母集団分布、重み付き乱数）と Mark & Lewis の GDC 2015 講演（IAUS）で広まった（B）。**Sea of Thieves のサメは「周回するか攻撃するか」だけの単純な行動ツリー**（B）。→ ヤマメは意図が少なく連続的な欲求が競合するので、**Utility 型の意図選択＋小さな状態機械**が素直（設計案）。[F-08, F-09]
8. **水中 AI の運動学的な制約の先行例（Sea of Thieves、PROXY: サメ）**: 小さな方向修正を繰り返して止まらない動き／円弧で泳ぎ、直径が旋回率を決める／**旋回率に速度依存の上限**／鋭い補正旋回の前に減速して向きを合わせてから加速／深度差は単純なベジエ曲線で昇降（B）。サメは泳ぎ続けないと呼吸できない前提なので、**ヤマメの定位（その場保持）には適用できない部分がある**。旋回率上限・旋回前の減速の考え方は流用可能。[F-09]
9. **ABZU の魚群は「強化した boids＋高効率シェーダ」で数千匹を動かし、捕食者の接近で散る、食物連鎖がある**と二次資料が述べる（B/C）。GDC 講演（Matt Nava）は芸術面中心で、**魚AIの技術的な数値は無い**。**Subnautica の魚AIは Subnautica 2（UE5）の行動ツリー＋刺激システムの記述しか得られず**（C、出典の質に難）、初代の内部構造は未確認。[F-09]
10. **LOD AI**: 「Simulation LOD」「LOD AI」と呼ばれ、**カメラとの距離に応じて更新頻度を落とし、最遠では起動トリガーまで更新を止める**。tick rate と、欲求値の更新頻度（need tick rate）を分ける例がある（B/C）。具体的な頻度の数値は無い。[F-10]
11. **手続き的アニメーション（実装方式）**: (a) **頂点シェーダ方式**（Godot 公式ドキュメント: 左右運動・中心まわりの回転・マスク付き進行波・ねじれの4モーションを cos 波で頂点に加える。ボーンの CPU 計算は数千匹に拡張できない）(B)、(b) **ボーンチェーンの位相遅れ方式**（各節の遅れを増やして蛇・ウナギ・魚らしい動きにする、C）、(c) **Gates (2001, UBC 技術報告) の運動学モデル**（定常遊泳・急発進・旋回の3モード。振幅が尾へ増える様式で anguilliform／subcarangiform／carangiform を区別。急発進は背骨の角度で L 字を指定し往復）(B)。[F-30, F-32, F-33, F-11]
12. **旋回の与え方の選択肢（相互に別モデル）**: (a) 人工魚: 前部の筋の非対称収縮、(b) 波形オフセット（周波数・振幅はそのまま、波全体を片側へ偏らせる）、(c) **曲率のパルス（体の中央付近から後方へ伝わる一過的な曲率。Giant danio の通常の旋回で、振幅・幅・速度で記述できる）**、(d) 急発進の C 字／L 字。パルス方式は定常遊泳とも矛盾なく接続できると報告（SICB 要旨、B、PROXY: ダニオ）。ヤマメの通常旋回の曲率の実測は無い。[F-03, F-31, F-17]
13. **感覚の簡略化**: Tu & Terzopoulos の視野 300°（CG 上の設定値）、釣り解説の「水中で水平 330°・真後ろに約 30° の死角」（C）。**どちらもヤマメの実測ではない**。側線は「1〜2 体長」の近傍で動く源を検出（複数の研究の要約、PROXY: ゴールドフィッシュ等、A/B）。視野角・反応距離・側線距離は調整可能な値にして根拠なしを明記。[F-04, F-37]
14. **ドリフト捕食の3D映像研究（ニュージーランドのブラウントラウト、Otago のステレオ映像）は存在**するが、**検索要約には迎撃距離・復帰時間などの数値が無い**。[F-38]
15. **警戒距離（FID）のサケ科データは見つからなかった**。魚一般で FID は体サイズと正の相関、という要約のみ（C）。[F-39]

**B. 手続き的遊泳アニメの生物学的パラメータ（継承。PROXY を多く含む）**

16. **体波は進行波 y(x,t) = A(x)·sin(2π(x/λ − f·t)) の形で書け、振幅包絡 A(x) は頭から尾へ二次多項式で増える**（44種の比較で個体の約90〜92%が二次多項式、Di Santo ら 2021、A）。係数は未取得。サイスの例（PROXY）は A(0)=0.02 L、A(0.2)=0.01 L、A(1.0)=0.10 L。[F-12]
17. **波長はニジマスで約 0.9 L で速度に依存しない。尾端振幅も速度に依存せず、周波数が速度とともに増える**（Webb ら 1984、Webb 1988、A・PROXY）。ヤマメ稚魚（全長 4.4〜8.8 cm）は振幅/全長 ≈ 0.12 で一定、尾鰭振動数 20.8〜39.1 Hz（流速 48〜137 cm/s）、60分臨界遊泳速度 3.5〜6.9 BL/s（平均 5.5）。**成魚（15〜30 cm）には適用不可**。[F-12, F-13]
18. **速度域の目安（魚道設計）**: 巡航は体長の 2〜3（〜4）倍/s、突進は約 10 倍/s（B）。ヤマメ成魚の値は無い。[F-14]
19. **胸鰭**は 0.5〜1.0 BL/s の定速遊泳では体側に畳み、定位・低速・旋回・制動で能動的に使う（ニジマス、A）。[F-15]
20. **障害物の後流**: Kármán gait（尾端振幅が自由流の約3倍、体波長 > 1 L、尾鰭振動数は渦放出周波数に一致）、側方の吸引域では entraining（体波を止め、体をまっすぐ角度をつけて保持）（ニジマス、A・PROXY）。実験流速 30〜70 cm/s はヤマメの生息流速 10〜35 cm/s より速い。[F-16, F-22]
21. **旋回・逃避**: 最小旋回半径は全長の 0.17〜0.18 倍（曲率の上限 ≈ 5.6/L、ニジマス、A・PROXY）。高速スタートは3段階、主加速段階 0.07〜0.10 s、最小潜時 5〜20 ms。曲率の位相は筋の短縮から遅れる。[F-17]
22. **バースト＆コースト**は PROXY（コイ約 45% 節約）。サケ科の実測は無いので既定は無効寄り。[F-18]
23. **ドリフト捕食のサイクル**: 定位点に留まる時間が観察時間の平均 81%、能動採餌 14%、餌の約 2/3 は定位点より下流側で捕獲（出典未特定、C）。迎撃速度は予測最大持続遊泳速度（coho／steelhead、A・PROXY）。反応距離と流速の関係は文献間で食い違う。PROXY の反応距離は 32.7 cm〜187.1 cm。[F-19, F-20, F-21]
24. **ヤマメ／サクラマスの定位・縄張り・日周**: 生息流速 10〜35 cm/s（B）。登川の幼魚は秋に流心側（深さ 35.4 ± 14.2 cm、流速 43.4 ± 23.1 cm/s）、冬は岸際の流速約 20 cm/s で沈水カバーのある場所（A）。順位はほぼ直線的（A）。縄張り面積の PROXY 式 log10(m²) = 2.61 log10(尾叉長 cm) − 2.83（A）。[F-22, F-23, F-24]
25. **警戒・逃避の挙動は定性的資料のみ**（上流を向いて定位、人の気配で岩の下に隠れる、C。PROXY: 刺激中は水底へ潜り、止むと元の水深・速度に戻る、A）。警戒距離・逃避速度・再出現時間の数値は無い。[F-25, F-39]
26. **頭部アニメ用**: O. m. masou の側線は頭部管8本＋体幹管1本（査読）。ニジマスの摂餌ストライクで神経頭蓋が 2〜18° 挙上、換気頻度 57±4〜78±4 回/分（A・PROXY）。サケ科の開口時間・最大開口角は無い。[F-26, F-27]
27. **写真（P）**: 水中フレーム 19 枚（自然 8＋水槽 11）の体の湾曲は、ほぼ直線 10、軽い湾曲 8、強い湾曲 1。口が開いているのは 2/19。水槽で頭を 14〜55° 上げて斜め上へ泳ぐ例が 3 枚。[F-28, F-29]

**C. 第3版で追加した所見（今回の検索 23 回による。PROXY を多く含む）**

28. **Tu & Terzopoulos の意図生成器の既定は wander**: 恐れ F が閾値未満のとき H と L を計算し、大きい方が閾値を超えれば摂餌か交尾を起動。**3つの状態変数のどれも閾値を超えなければ wander を起動**する（B）。さらに**知覚フィルタ**があり、直近の行動に不要な感覚情報を減らす（B）。→ ヤマメでは「恐れ・空腹・縄張り刺激のどれも閾値以下なら、既定意図は定位（その場で待機）」とする案（設計案）。閾値の値は依然として未取得。[F-02]
29. **ドリフト捕食モデルの検証結果**: Hughes ら (2003, CJFAS) は、最先端のドリフト捕食モデルが**総エネルギー獲得を約 2 倍過大評価**したと報告（AFS 2011 総説要旨、B。ブラウントラウト、ニュージーランド）。→ NEI 型スコアは**絶対値でなく定位点どうしの相対比較にだけ使う**（設計案）。迎撃距離・復帰時間の数値は今回も未取得。[F-07, F-36]
30. **Utility AI の「モメンタムボーナス」**: 直前に選んだ決定の得点に倍率ボーナスを掛け、近い得点どうしの振動を抑える（Utility Worlds のミドルウェア文書、B/C）。別の解説は「新しい行動が現行を一定のマージン以上上回るまで切り替えない」ヒステリシスを述べる（C）。→ 意図保持の根拠が M から B/C に上がった。倍率・マージンの値は未取得。[F-08]
31. **Reynolds (1999) の階層名と追加の操舵行動を確認**: 階層は action selection（戦略・目標・計画）／steering（経路決定）／locomotion（アニメーション・関節運動）。操舵には seek, flee, pursue, evade, wander, arrival, obstacle avoidance, containment に加え **wall following, path following, flow field following**、群れでは **leader following, unaligned collision avoidance** がある（red3d.com の検索要約、B）。→ ヤマメの定位に **flow field following（流れの場の追従）と arrival** を使う設計案に、概念上の裏付けが付いた。[F-05]
32. **LOD AI の実装例（Unreal Engine Mass）**: LOD は High／Medium／Low／Off の4段階で、各段階に距離と最大エンティティ数を設定でき、**段階ごとに更新周期 tick rate（秒）を持つ**。視錐台の内外で別の距離を設定できる。画面外の個体は Off で完全停止するより、低コストの処理で状態だけ進める方がよい、という解説もある（Epic 公式ドキュメントの検索要約＋ブログ、B/C）。具体的な距離・周期の数値は無い。[F-10]
33. **低速の定位・徘徊時の尾鰭打数（PROXY: ブラウントラウト）**: 湖で自由遊泳するブラウントラウトの超音波テレメトリで、尾鰭打数は**ほとんど 2.5 回/s を超えず（≒ 1 BL/s）、「好む」打数は 1.0〜2.0 回/s**（Ross, Watts & Young 1981, J. Fish Biol.、A・PROXY）。→ 定位・徘徊の体波周波数の既定は **1〜2.5 Hz（PROXY）**、高速側はヤマメ稚魚の 20.8〜39.1 Hz（F-13）、と二点が揃った。サイズ・水温・速度との式は要約に無い。大西洋サケの実験要約は**尾鰭打数が速度とともに線形に増え、相対尾鰭振幅はべき関数で増え、低速では振幅の調整の役割は小さい**と述べる（出典論文を特定できず、B）。[F-40]
34. **捕食者モデルへの反応（PROXY: 大西洋サケ）**: 野外でカワアイサのモデルを見せると、サケ稚魚〜parr の**摂餌率は 25〜39% 低下し、移動率は 123〜386% 増加**。底質の粒径が即時反応の型に、体サイズが移動反応の強さに影響（Dionne & Dodson 2002、A・PROXY）。→ 警戒状態では迎撃頻度を下げ、定位点の変更（移動）を増やす方向づけ（設計案）。**復帰時間の数値は取得できなかった**。[F-41]
35. **ドリフト捕食の中身（PROXY: アラスカのキングサーモン幼魚）**: 追った餌のうち **52% は捕獲後すぐ口から吐き出され、39% は目視で調べただけで捕獲せず、実際に摂取されたのは 9%**。非食物（デブリ）の取り扱いに採餌時間の 4〜25% を使う（B/A、要約）。→ 「口の開閉＝摂取」ではなく、**打撃 → 吐き出し／摂取**のサブ状態を持てる（設計案）。ヤマメの値は無い。[F-42]
36. **旋回モデルの出典を補足**: Giant danio の曲率パルスを含む「パルス／C-start／波形オフセット」の比較ロボットの論文は、Howe & Astley (2021)「Comparing the turn performance of different motor control schemes in multilink fish-inspired robots」（Bioinspiration & Biomimetics、DOI 10.1088/1748-3190/abe7cc）と**推定**される（題名は検索結果、内容は未取得）。[F-31]
37. **体波の位相速度**: ロボット魚（長さ 1.2 m）の実験で、横方向の運動は波長 λ と前から尾へ滑らかに増える振幅を持つ進行波であり、**抗力低減の必要条件は体波の位相速度が前進速度を上回ること**（Barrett ら 1999, J. Fluid Mech. 392:183–212、A・PROXY）。→ 体波の波速 = λ·f を前進速度より常に大きく取る（設計案。F-12 の λ ≈ 0.9 L と F-40 の f の組で成り立つかは、仕様書側で数値を入れて確かめること）。振幅包絡の具体式は今回も未確認。[F-43]

### 1.1 設計用の暫定値と状態（仕様書に転記する場合は「仮置き」「PROXY」を落とさないこと）

| パラメータ | 暫定値 | 状態 | ランク |
|---|---|---|---|
| エージェント層構造 | 知覚 → 意図選択（Utility 型）→ 局面の状態機械 → 操舵 → 体波（運動学） | Tu & Terzopoulos の4層、Reynolds の3レベルに倣う設計案 | B（構造）／設計案 |
| 精神状態の変数 | 警戒（F 相当）・空腹（H 相当）・縄張り刺激（新設） | Tu & Terzopoulos は H・L・F。ヤマメ向けの置換は設計案 | B／設計案 |
| 意図の優先順位 | 逃避 > 迎撃 > 縄張り防衛 > 移動 > 待機 | 恐れ判定が先、は Tu & Terzopoulos に倣う。順序の根拠はヤマメで無し | B（恐れ先行）／設計案 |
| 既定の意図 | 全ての状態変数が閾値以下なら「定位（待機）」 | Tu & Terzopoulos は閾値以下で wander を起動。ヤマメへの置換は設計案 | B／設計案（第3版） |
| 意図の保持 | モメンタムボーナス（直前の選択の得点に倍率）またはヒステリシス（新規が現行を一定マージン以上上回るまで切替えない） | 方式は Utility AI の実装文書に存在。倍率・マージンの値は無い | B/C（方式）／仮置き（値）（第3版） |
| 定位・徘徊時の尾鰭周波数 | 1〜2.5 Hz（好む打数 1.0〜2.0 Hz、≒ 1 BL/s で 2.5 Hz） | ブラウントラウト（湖、PROXY）。サイズ・水温は要約に無い | A（PROXY）（第3版） |
| 体波の位相速度 | λ·f > 前進速度 を保つ | ロボット魚の抗力低減の必要条件（PROXY） | A（PROXY）／設計案（第3版） |
| 視野角 | 調整可能（既定の根拠なし）。参考: CG 300°、釣り解説 330° | ヤマメの実測は無い | B/C（参考値のみ） |
| 側線の感知距離 | 調整可能。参考: 1〜2 体長 | PROXY（ゴールドフィッシュ等）。サケ科の実測は未取得 | A/B（PROXY） |
| 反応距離 | ヤマメは無い。PROXY は 32.7〜187.1 cm | 魚種・光条件で桁が違う | C（継承） |
| 体波の関数形 | y(x,t) = A(x)·sin(2π(x/λ − f·t))、A(x) は二次多項式 | 形のみ。係数なし | A（継承） |
| 包絡の代替係数 | A(x)/L = 0.02 − 0.0825x + 0.1625x²（x=0 頭〜1 尾） | サイス3点（PROXY）からの算出。振幅の定義不明（r08 の算出） | A値＋算出（継承） |
| 波長 λ | 約 0.9 L（速度に依存しない） | ニジマス PROXY | A（継承） |
| 尾端振幅 | 速度に依存しない。ヤマメ稚魚で振幅/全長 0.12。ニジマスのバースト中 0.17 L | 振幅の定義が不明 | A/B（継承） |
| 尾鰭振動数 f | 速度に比例。ヤマメ稚魚 20.8〜39.1 Hz（流速 48〜137 cm/s） | 式は未取得。成魚は未取得 | A（継承） |
| 巡航／突進 | 2〜4 BL/s ／ 約 10 BL/s | 魚道設計の目安 | B（継承） |
| 旋回の実装方式 | 曲率オフセット（波形オフセット）または曲率パルス。上限は半径 0.17 L | 通常旋回の曲率の実測は無い | B（パルス：ダニオ PROXY）／A（半径：ニジマス PROXY） |
| 旋回率の速度依存上限、鋭い旋回前の減速 | 採用する（設計案） | Sea of Thieves のサメ（PROXY、ゲーム）の設計に倣う | B（設計の存在）／設計案 |
| 高速スタート主加速段階 | 0.07 s（小）〜0.10 s（大）、最小潜時 5〜20 ms | ニジマス PROXY。電気刺激で誘発 | A（継承） |
| 定位点での待機割合 | 平均 81%（能動採餌 14%） | 出典論文の特定不能 | C（継承） |
| 迎撃速度 | 最大持続遊泳速度 | coho／steelhead PROXY | A（継承） |
| 警戒距離・再出現時間 | 無い。調整可能な値にして根拠なしと明記 | 同上 | — |
| AI の LOD | 距離に応じて意思決定の更新頻度を下げる。段階は High／Medium／Low／Off の4段階＋段階ごとの tick rate（UE Mass の構成例）。Off で完全停止するより低コストで状態を進める | 距離・周期の数値は無い | B/C |

---

## 2. Findings

> ランクの表記: A=査読論文・公的機関資料で、検索要約に数値/記述が明示／B=教材・解説・技術報告・学会要旨・ゲーム開発者向け記事／C=釣り情報・ブログ・出典未特定の要約・ファン wiki／M=私の記憶（検索で未確認）／P=ユーザー提供写真70枚（catalog_c0N.json）の集計。
> 「継承」は、先行ストリームの検索所見を再検索せず再掲したもの（元ファイルと F 番号を併記）。

### Part A — 計算機科学・ゲームの先行事例

### F-01 Tu & Terzopoulos (1994)「Artificial Fishes」の全体構造
- 主張/値: SIGGRAPH '94 の人工魚は、(1) **物理モデル**: **23 個の質点と 91 本のバネで体を作り、うち 12 本のバネを筋（収縮要素）として使う**。(2) **運動制御器**: 3 種類、Swim-MC（直進）、Left-turn-MC、Right-turn-MC。各 MC は特定のタスクに割り当てた「パラメータ付きの手続き」。(3) **知覚**: 視覚センサ（**300° の球面角、半径は水の透明度で決まる**）と、体の中心の水温センサ。(4) **行動**: 習慣・精神状態・意図生成器・行動ルーチン（F-02）。上の層が下の層を呼び出す。胸鰭（機能する鰭）は図示される。
  - 後続研究: Grzeszczuk & Terzopoulos (1995)「Automated learning of muscle-actuated locomotion through control abstraction」の題名が SIGGRAPH 歴史アーカイブに存在。学習（行動の学習）を扱う Artificial Life 誌 1994 年論文は **記憶（M）のまま未確認**。
- 適用範囲: 計算機科学の人工生命・キャラクターアニメーション。特定の魚種ではなく、獲物・捕食者・非捕食の魚が登場する。ヤマメ固有の知見ではない。
- 出典: https://education.siggraph.org/static/HyperGraph/animation/art_life/fish.htm ／ https://www.cs.princeton.edu/courses/archive/spr15/cos426/papers/Tu94.pdf ／ https://history.siggraph.org/?p=119677 ／ https://history.siggraph.org/?p=118720 ／ https://www.cs.rochester.edu/u/brown/Videre/001/articles/v1n1001.pdf（Animat Vision。300° の記述の出所はこれか SIGGRAPH 教材ページか特定不能）
- 証拠: [B] "The artificial fish model was created with 23 point masses and 91 springs, with twelve of the springs used as muscles." ／ "The fish vision covers a 300 degree spherical angle that extends out to a radius defined by the water's translucence."
- 実装への含意（設計案）: Three.js では質点バネ物理を作らず運動学（体波）で代替する。ただし「行動層は高水準コマンドだけを運動層に渡す」分離は有効。

### F-02 人工魚の精神状態・習慣・意図生成器・行動ルーチン
- 主張/値:
  - **精神状態は3変数**: H（hunger）、L（libido）、F（fear）。各 0.0〜1.0。値が高いほど食べる／交尾する／危険を避ける欲求が強い。
  - **習慣（habit）**: 「感覚刺激と3状態変数の関係を決める**重みのパラメータのパターン**」。アニメーターが魚の生まれつきの性格として、性別、明るさ／暗さ、冷たさ／暖かさ、群れの好みなどを設定する。
  - **意図生成器**: 「各時間ステップ（アニメーションの1フレーム）に、魚の習慣、精神状態、入ってくる感覚情報に基づいて意図を出し、行動ルーチンを選んで実行し、適切な運動制御器を動かす」。
  - **判定の順序**: まず恐れを誘う刺激を調べて F を更新する。**F が閾値未満なら H と L を計算**し、**大きい方が閾値を超えれば摂餌か交尾を起動**しうる。
  - **行動ルーチンは8種**: avoiding-static-obstacle、avoiding-fish、eating-food、mating、leaving、wandering、escaping、schooling。
  - 捕食者が現れると、魚はまず群れて身を守り、捕食者が近づくと散る、という挙動が出る。
  - **第3版で追加（検索 #A4 で確認、B）**: 「**恐れ・空腹・性衝動の3つの状態変数のどれも閾値を超えなければ wander 行動が起動**される」。また**知覚フィルタ**（直近の行動に不要な感覚情報を減らす）があり、意図生成器の入力は絞られる。
  - **未取得**: 閾値の値、障害物回避が全体で何番目か、意図を一定時間保持する仕組み（記憶に「持続の工夫があった」とあるが **M・確信度 低・未確認**。#A4 の要約にも保持の記述は無い）。
- 適用範囲: 計算機科学。ヤマメの行動に直接の根拠はない。
- 出典: F-01 と同じ（https://education.siggraph.org/static/HyperGraph/animation/art_life/fish.htm 、https://www.cs.princeton.edu/courses/archive/spr15/cos426/papers/Tu94.pdf ）。
- 証拠: [B] "At each time step ... the intention generator issues an intention based on the fish's habits, mental state, and incoming sensory information." ／ "a habit is a weighting parameter pattern which specifies how sensory stimuli relate to three state variables" ／（第3版）"If none of the three state variables is above their thresholds, then a wander behavior is initiated." ／ "A perceptual filter allows sensory information which is not vital to immediate behavioral needs to be reduced."（#A4 の要約。出典は上記の SIGGRAPH 教材ページと思われるが、どの文がどのページかは特定不能）
- 実装への含意（設計案・推論）: ヤマメの意図候補は、**定位（待機）／流下餌の迎撃／縄張り防衛（追い払い）／逃避・隠れる／移動（定位点の変更）／水面への摂餌（ライズ）**程度に絞れる。状態変数は**警戒（F 相当）、空腹（H 相当）、縄張り刺激（新設。L は繁殖期以外は不要）**。個体差は習慣（臆病さ、探索度の重み）で与える。**恐れの判定を最初に行い、閾値以上なら他の欲求を計算しない**構造は人工魚に倣える。優先順位の細部（迎撃 > 縄張り防衛 > 移動 > 待機）はヤマメの資料が無く、調整可能にする。

### F-03 人工魚の運動系: 筋の位相差による遊泳、前部筋での旋回
- 主張/値: 運動制御器は Swim-MC／Left-turn-MC／Right-turn-MC の3種。解説は「多くの魚は、**後部の筋で動く尾鰭で前進し、前部の筋で旋回する**」と説明する。進行波は、体の両側の筋を位相をずらして収縮させて作り、旋回は左右の収縮の非対称で作る（旋回の非対称収縮の細部は **M・確信度 中**）。
- 適用範囲: Tu & Terzopoulos の物理モデル。
- 出典: F-01 と同じ。
- 証拠: [B] "Most fish use the caudal fin, powered by the posterior (rear) muscles, to move forward and anterior (front) muscles to turn."
- 実装への含意: 旋回時に**体軸（midline）の曲率に片側へのオフセット（静的バイアス）を足す**実装は、この考え方と一致する（設計案）。他の旋回モデルとの関係は F-31、生物学側の旋回半径は F-17。

### F-04 人工魚の知覚: 視野と到達距離
- 主張/値: **視覚は 300° の球面角で、到達距離は水の透明度で決まる**（F-01）。センサは視覚と水温の2つ。視野の「遮蔽の考慮」「注意の焦点（focus）を選んで行動層へ渡す」は記憶（**M・確信度 中〜低・未確認**）。レンダリングによる合成視覚ではなく、世界モデルへの問い合わせで実装していたという記憶も **M のまま**（ただし後続の Animat Vision では視覚を能動的に扱う論文が存在する）。
- 適用範囲: 計算機科学。300° は CG 上の設定値で、ヤマメ（サケ科）の視野ではない。
- 出典: F-01 と同じ。https://web.cs.ucla.edu/~dt/animat-vision
- 証拠: [B] "two sensors, a temperature sensor at the center of the body and a visual sensor."
- 実装への含意（設計案・推論）: ヤマメ実装では、**視野角・最大感知距離・遮蔽判定を調整可能にし、資料が無いことを明記**する。参考値は CG の 300°、釣り解説の 330°（F-37）。いずれも測定値ではない。反応距離の PROXY は F-21。

### F-05 Reynolds の群れモデル（1987）と操舵行動（1999）
- 主張/値:
  - **Reynolds (1987)**「Flocks, Herds, and Schools: A Distributed Behavioral Model」（Computer Graphics 21(4)、1987年7月）: 「集団の運動は、自然の群れと同様の分散した行動モデルから生まれ、個体は自分の進路を自分で選ぶ。シミュレートした各個体は独立した行為者で、動的環境の局所知覚、シミュレートした物理法則、アニメーターが与えた行動の集合に従って航行する」。個体は boid と呼ばれ、**近傍の局所情報だけで群れる**。3つの局所規則の名称（衝突回避、速度合わせ、群れの中心化。一般に separation／alignment／cohesion と呼ぶ）は **M・確信度 高（検索要約は概念の一致までしか書かない）**。
  - **Reynolds (1999)**「Steering Behaviors For Autonomous Characters」（GDC 1999）: 自律キャラクターの動きを**3レベル**に分け、**中位の操舵行動**を中心に述べ、低位の locomotion（移動手段）に触れ、高位の目標設定・戦略に言及する。**操舵行動は移動手段から大きく独立**している。操舵の例は **seek と flee、pursue と evade、arrival、wander、obstacle avoidance と containment**。操舵行動の組合せで高位の目標を達成できる。
  - **第3版で確認（検索 #A14、red3d.com の索引、B）**: 3レベルの名称は **action selection（戦略・目標・計画）／steering（経路決定）／locomotion（アニメーション・関節運動）**。操舵行動に **path following、flow field following、wall following**、群れの行動に **leader following、unaligned collision avoidance** がある。leader following は separation と arrival の組合せで、arrival の目標は先導者の少し後ろの点。以前は M だったが B に上げた。
  - 記憶（**M・確信度 高、未確認のまま**）: 乗り物は質点で最大速度・最大操舵力を持つ。
- 適用範囲: 計算機科学の群れ・操舵。魚種は限定されない。
- 出典: https://www.cs.princeton.edu/courses/archive/spr01/cs598b/papers/reynolds87.pdf ／ https://my.eng.utah.edu/~cs6665/Reynolds-1987-FHS.pdf ／ https://www.cs.toronto.edu/~dt/siggraph97-course/cwr87 ／ `https://ics-websites.science.uu.nl/docs/vakken/mcrws/papers_new/Reynolds - 1999 - Steering behaviors for autonomous characters.pdf`（URL は検索結果のとおり、空白を含む）
- 証拠: [B] "Each simulated bird is implemented as an independent actor that navigates according to its local perception of the dynamic environment" ／ "divides motion behavior into three levels" ／（第3版）"hierarchy consisting of action selection (strategy, goals, planning), steering (path determination), and locomotion (animation, articulation)" ／ [M] boids の3規則名のみ
  - 第3版の追加出典（#A14 に出たURL）: https://www.red3d.com/cwr/papers/1999/gdc99steer.pdf ／ https://www.red3d.com/cwr/steer/ ／ https://www.red3d.com/cwr/steer/PathFollow.html ／ https://www.red3d.com/cwr/steer/Wall.html ／ https://www.red3d.com/cwr/steer/LeaderFollow.html ／ https://www.red3d.com/cwr/steer/Unaligned.html ／ http://www.red3d.com/cwr/presentations/2016_UCSC_Steering_Behaviors.pdf
- 実装への含意（設計案・推論）: ヤマメの定位は**「定位点への arrival／station-keeping」に流れの場の追従（flow-field following）を加えた形**で、障害物回避と containment（川幅・水深・水面）が基本。**cohesion／alignment は既定にせず**、幼魚の近距離の整列は水槽写真の観察 (F-28、P、偏りあり) の範囲で任意項目にする。縄張り性の根拠は F-23。

### F-06 inSTREAM（Railsback ら）の個体ベース・トラウトモデル
- 主張/値:
  - inSTREAM は、**河川・水路のサケ科個体群が、生息場所の改変（流量、水温、濁度、河道形態の変化）にどう応答するかを予測する**個体ベースモデル。**個体を日ステップで表現**し、個体群の応答は、生息場所と個体間（特に餌をめぐる競争）の作用から創発する。生息場所は**微小生息場所セル**で表し、駆動する入力は流量・水温・濁度。
  - 個体の行動: **生息場所選択（最良の採餌場所への移動）、摂餌と成長、死亡、産卵**。
  - **生息場所選択規則**: 個体は、**自分が知っているとみなされる半径内の、潜在適応度が最も高いセルへ動く**。適応度は、将来の生存と繁殖サイズへの到達に基づく。「期待成熟度」（Railsback ら 1999c）を使い、**現在のセルと移動先候補の各セルで潜在適応度を評価する**（適応度は個体の大きさ・種とセルの特性の関数）。
  - **成長**は餌の利用可能性と水理条件に依存。**死亡リスク**（陸上の捕食者、魚食魚、極端な条件）は生息場所と個体の変数の関数。
  - **ドリフト捕食**: 個体は、「**捕獲面積**」（流れに直交する長方形。大きさは水深・流速・魚の大きさ・水温に依存）を通る餌を全て捕獲する。捕獲面積は**反応距離**の考え方で計算する。濁度の影響も反応距離に入れられる。
  - **移動半径**: v7.2 から、**体長のロジスティック関数が最大半径へ近づく**形でモデル化。
  - 記憶（**M・確信度 低〜中、未確認**）: 大きい個体が先にセルを選ぶ優劣順序（体長順）、捕獲成功率が流速で下がる、遊泳コストが流速に依存、1日の複数回判断。
- 適用範囲: 北米・欧州のトラウト（ニジマス、ブラウントラウト、カットスロート等）の管理用。ヤマメ（日本）のパラメータは無い。
- 出典: Railsback S.F., Harvey B.C., Jackson S.K., Lamberson R.H. (2009) "InSTREAM: the individual-based stream trout research and environmental assessment model." USDA Forest Service Gen. Tech. Rep. PSW-GTR-218。https://research.fs.usda.gov/treesearch/33521 ／ https://research.fs.usda.gov/download/treesearch/33521.pdf ／ モデル記述: https://humboldt.edu/sites/default/files/ecological-modeling/2024-09/instream5-0modeldescription.pdf ／ https://humboldt.edu/sites/default/files/ecological-modeling/2024-09/instream6-1modeldescription.pdf ／ https://www.humboldt.edu/sites/default/files/ecological-modeling/2024-09/instream73userman2023-07-07.pdf ／ https://ecomodel.humboldt.edu/instream-and-insalmo-overview
- 証拠: [A] "Fish use habitat selection rules that move them to the cell offering highest potential fitness (within the radius that fish are assumed to be familiar with)" ／ "Starting with version 7.2, inSTREAM models the radius over which fish select habitat as a logistic function of length that approaches a maximum radius."
- 実装への含意（設計案・推論）: **個体群動態や成長の再現は不要**。「定位点の候補を河床メッシュ上で評価して選ぶ」部分だけを借り、評価関数を F-07 の簡略版（餌供給 × 捕獲可能性 − 遊泳コスト − リスク）にする。移動可能範囲を体長の関数にする（上限付きの S 字）考え方は流用できるが、**係数は未取得**。r11 の定位場所の資料（F-22）がヤマメ向けの重みの方向づけになる。

### F-07 ドリフト捕食モデル（NREI）: Fausch 1984、Hughes & Dill 1990、Hughes 1998、Hughes ら 2003
- 主張/値:
  - **Fausch (1984)**: サケ科の魚は、**純エネルギー摂取（NEI）が最大になるよう、流速の遅い定位点で、近くに餌を多く運ぶ速い流れがある位置を選ぶ**と提案した。理論は、人工・自然の水路での定位点の特徴の観察と、Chapman (1966) の概念モデルに基づく（AFS 2011 発表要旨）。
  - **Hughes & Dill (1990)**: 定位点の**遊泳コストと餌の捕獲成功**から、その位置のエネルギー的な損益を推定する。NEI は、**総摂取（模擬した餌捕獲）から、エネルギーコスト（基礎代謝、遊泳、消化）と損失（排糞、排泄）を引いたもの**。ベースにした魚は北極グレイリング（アラスカ内陸の亜寒帯山岳河川）。現在の生物エネルギー学ベースの生息場所選択・成長モデルの多くが、この「画期的な」モデルを土台にする。
  - NEI モデルは、反応距離、遊泳コスト、餌の捕獲成功の組み合わせが異なる。
  - Hughes (1998) は個体スケールのモデルを生息場所選択（異なるスケール）へ拡張、Hughes ら (2003) はブラウントラウトの3次元映像でモデルを検証（題名の存在は確認済み）。**第3版で追加（#A2, #A13）**: 同検証で、最先端のドリフト捕食モデルは**総エネルギー獲得を約 2 倍過大評価**した（AFS 2011 の総説関連発表の要旨、B）。書誌は Hughes N.F., Hayes J.W., Shearer K.A., Young R.G. (2003) "Testing a model of drift-feeding using three-dimensional videography of wild brown trout, Salmo trutta, in a New Zealand river", Can. J. Fish. Aquat. Sci. 60:1462–1476（検索要約）。**捕獲距離・復帰時間・定位点流速の数値は今回も得られなかった**。Hughes & Dill (1990) の書誌（題名「Position choice by drift-feeding salmonids: model and test for Arctic grayling (Thymallus arcticus) in subarctic mountain streams, interior Alaska」、CJFAS）も #A1 で確認。モデルの捕獲部分は Holling の捕食モデルの要素を使い、**捕獲率を魚の大きさ・流速・水深・水温・流下量の関数**として決める（要約）。**反応距離・捕獲確率・遊泳コストの式は #A1 でも得られなかった**。
  - 記憶（**M・確信度 中**）: 獲得 = 餌濃度 × 捕獲面積（反応距離で決まる）× 流速 × 捕獲確率 × 餌エネルギー。捕獲確率は流速が速いほど下がる。迎撃できる範囲は最大持続遊泳速度、流速、餌の通過時間で上限が決まる。**式の具体形・係数は未取得**。
- 適用範囲: 北極グレイリング、ブラウントラウト、ニジマス、サケ科全般。ヤマメへの適用は F-35（Urabe ら、北海道）が近いが、種の内訳は要約に無い。
- 出典:
  - https://afs.confex.com/afs/2011/webprogram/Paper4379.html（AFS 2011「An Historical Perspective on Drift Foraging Models for Stream Salmonids」）／ https://afs.confex.com/afs/2011/webprogram/Paper4381.html ／ https://afs.confex.com/afs/2011/webprogram/Paper4385.html
  - Hughes N.F., Dill L.M. (1990) Can. J. Fish. Aquat. Sci. 47:2039–2048（書誌は検索結果の題名・巻頁表記）
  - （M）Fausch K.D. (1984) Can. J. Zool. 62:441–451。Hughes N.F. (1998) Ecology 79:281–294。
  - Hughes ら (2003) 題名確認（継承）: https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river ／ 総説 https://link.springer.com/article/10.1007/s10641-013-0187-6
- 証拠: [B]（AFS 発表要旨）"fish maximize their net energy intake (NEI) by selecting focal positions in low water velocity near faster currents that deliver abundant drifting invertebrates" ／ [M] 式の骨格
- 実装への含意（設計案・推論）: 定位点の簡略スコア = **餌供給（近傍の速い流れの有無）× 迎撃可能性 − 定位点の流速コスト − リスク（浅い・被覆が無い）**。係数は根拠なしの調整値。迎撃速度・反応距離の PROXY 値は F-20、F-21。

### F-08 ゲームAIの意思決定方式の使い分け（行動ツリー／Utility AI／状態機械／GOAP）
- 主張/値:
  - **行動ツリー（BT）**: Damian Isla が GDC 2005「Handling complexity in the Halo 2 AI」で、ゲーム AI の作成法として初めて提示。**有限状態機械が主流だったゲーム AI の行き詰まりを打開**した。FSM より複雑な行動を設計者が簡単に制御できる。Halo 2 では**1キャラクターあたり約 50 の行動**を管理。GDC 2026 に「行動ツリーと自動計画の20周年」の Isla と Orkin の対談が予定される。
  - **Utility AI**: Dave Mark & Kevin Dill「Improving AI Decision Modeling Through Utility Theory」（GDC 2010 AI Summit）は、**応答曲線、母集団分布、重み付き乱数**で、エージェントの意思決定のモデル化を改善し、意思決定空間を広げ、端のケースを扱う。Dave Mark と ArenaNet の Mike Lewis は GDC 2015 で **IAUS（Infinite Axis Utility System）**を講演。IAUS はデータ駆動で自己完結的に設計。これらの講演で、Utility AI が FSM・BT・プランナーと並ぶ代表的アーキテクチャとして広く言及されるようになった。
  - **第3版で追加（#A7）**: Utility AI では、得点が近い「決定-対象」の組が振動して、エージェントが決定と対象を絶えず変える問題がある。Utility Worlds（Unity/ECS 向けミドルウェア）の文書は、**Momentum Bonus**（直前に選ばれた組の得点に倍率を掛け、次回の決定で優位にして振動を抑える）を挙げる（B/C）。別の解説は**ヒステリシス**（新しい行動が現行を一定のマージン以上上回るまで切り替えない）を述べる（C）。**講演資料（Dill & Mark、Mark & Lewis）自体での確認は無い**。倍率・マージンの値は未取得。
  - 記憶（**M**）: FSM は少数の局面に向くが状態が増えると遷移が爆発する。GOAP は F.E.A.R.（Orkin 2006）。
- 適用範囲: ゲーム AI 一般（人型・動物を問わない）。魚固有の知見ではない。
- 出典: https://en.wikipedia.org/wiki/Behavior_tree_(artificial_intelligence,_robotics_and_control) ／ https://schedule.gdconf.com/session/game-ai-fireside-chat-with-damian-isla-and-jeff-orkin-celebrating-20-years-of-behavior-trees-and-automated-planning-systems/917672 ／ https://gdcvault.com/play/1012410/Improving-AI-Decision-Modeling-Through ／ https://www.gamedeveloper.com/design/gdc-2010-day-1-2-ascending-the-ai-summit ／ https://en.wikipedia.org/wiki/Utility_system ／ https://www.gamedeveloper.com/programming/behavior-trees-for-ai-how-they-work ／（第3版、#A7）https://uintel-ecs.utilityworlds.com/Documentation/UtilityIntelligence/Decisions/ ／ https://uintel-go.utilityworlds.com/Documentation/UtilityIntelligence/Decisions/ ／ https://uintel-go.utilityworlds.com/Documentation/TipsAndTricks/Decisions/ ／ https://www.gbgames.com/2017/02/13/book-review-behavioral-mathematics-for-game-ai-by-dave-mark/（書評。ヒステリシスの文の出所は特定不能）
- 証拠: [B] "Behavior trees were successfully used to manage on the order of 50 behaviors per character in Halo 2." ／ "response curves, population distributions, and weighted randoms" ／（第3版）"The Momentum Bonus option ... adding a bonus to the last chosen decision-target pair in the next decision-making round ... eliminating oscillation."
- 実装への含意（設計案・推論）: ヤマメは意図が少なく（F-02）、欲求が連続的に競合（空腹 vs 恐れ）するので、**Utility AI で意図を選び、局面の遂行（迎撃の接近→打撃→復帰、逃避の高速スタート→隠れ場）は小さな状態機械で実装**するのが素直。BT／GOAP は過剰。ヒステリシスが無いと意図が毎フレーム入れ替わって見えるので、必須とする（第3版: 実装方式としては Momentum Bonus／マージン付きの切替が Utility AI のミドルウェア文書に存在する（B/C）。ヤマメでの必要性そのものは推論）。

### F-09 ゲームの魚AI・水中生物AI・遊泳アニメの事例（Sea of Thieves、ABZU、Subnautica）
- 主張/値:
  - **Sea of Thieves（Rare, UE4）のサメ AI**（Game Developer の AI and Games 連載、Part 2）:
    - **サメの行動ツリーは比較的単純で、獲物を周回するか攻撃するかだけ**。骸骨の AI も UE4 標準の行動ツリー。
    - 水中は通常のナビメッシュとは別の移動手段が必要で、Rare は **UE のナビゲーション枠組みに統合する水中用ナビゲーション**を作った。
    - **サメは止まれない**（現実のサメは呼吸のため泳ぎ続ける）ので、AI は**小さな方向修正を、速度を変えながら繰り返す**ことで再現した。
    - 攻撃指示が無い間は**円弧で泳ぎ、円の直径が旋回率を決める**。
    - **旋回率に上限**がある（高速時に急旋回しない）。**鋭い補正旋回が必要なら減速し、獲物と向きを揃えてから再加速**する。
    - 移動は2D（同じ深度）を前提とし、深度が合わないときは**単純なベジエ曲線**で昇降する。
  - **ABZÛ（Giant Squid）**: 二次資料は「**高性能なシェーダと強化した boids アルゴリズムの組み合わせ**で、数千匹の魚を同時に動かし、大きな餌玉（bait ball）を再現した」「魚は仲間と群れ、捕食者を見ると散る」「群れの行動の simulation と、大型捕食者が頂点にいる食物連鎖を作った」と述べる。GDC 講演「Creating the Art of ABZÛ」（Matt Nava）は美術面の講演で、**魚 AI の技術的な数値や式は検索で得られなかった**。「最も深い boids 実装」という評価は二次資料の意見（C）。
  - **Subnautica**: 検索で得たのは **Subnautica 2（UE5）の記述のみ**: 「行動ツリー＋カスタムの**刺激システム**（光、音、プレイヤーの接近・移動速度を意思決定に入れる）」「生き物が反応的に感じられることが目標で、常に状況を再評価する」。出典はファン wiki の履歴ページや報道で、**開発者の一次資料かどうか確認できない（C）**。初代 Subnautica（2018, Unity）の内部構造は**得られなかった**。「creature action を優先度で評価」という初版の記憶は**未確認の M（確信度 非常に低）**のまま。
- 適用範囲: ゲーム。Sea of Thieves のサメ（PROXY）は絶えず泳ぐ大型捕食者で、ヤマメの定位（その場保持）とは違う。
- 出典: https://www.gamedeveloper.com/design/the-secrets-of-skeleton-and-shark-ai-in-sea-of-thieves-part-2-of-4- ／ https://www.gamedeveloper.com/programming/building-a-pirate-s-paradise-the-ai-of-sea-of-thieves-part-1- ／ https://www.gdcvault.com/play/1024409/Creating-the-Art-of-ABZ ／ https://gamedeveloper.com/art/video-creating-the-striking-underwater-seascapes-of-i-abzu-i- ／ https://www.audiokinetic.com/fr/blog/abzu_game_audio ／ https://www.pcgamesn.com/abzu/abzu-journey-developer-interview ／ https://imft.ftn.uns.ac.rs/wp-content/uploads/2025/12/07META2025.pdf（「boids の最も深い実装」の出所候補。特定不能）／ https://krafton.com/en/?p=42110 ／ https://thegameswiki.com/subnautica-2/wiki/creature-ai-and-behavior-trees/history/3f4f264e-7ffb-4654-89eb-e5f9126d0671
- 証拠: [B] "a shark can't stop moving ... the AI equivalent replicates this behaviour by making lots of small corrective changes in direction at varying speeds." ／ "If a shark needs to make a tight corrective turn before attacking the player, it will slow down and ensure it's lined up" ／ [C] ABZÛ・Subnautica の記述
- 実装への含意（設計案）: (1) 旋回率に速度依存の上限を置き、鋭い旋回の前に減速する（ヤマメの最小旋回半径 0.17 L と整合、F-17）。(2) 水平の運動を主にして、深度は別の滑らかな曲線で追従させる（2D＋昇降の分離）。(3) 魚の AI の記事は群れ（boids）が中心で、**単独で定位するドリフト捕食魚の AI の先行例は見つからなかった**。

### F-10 LOD AI（距離・可視性による思考頻度の削減）
- 主張/値: 研究では行動のシミュレーションへ LOD を広げた用語として **「Simulation LOD」「LOD AI」**があり、「重要でない個体を見つけてその行動のシミュレーション品質を下げる」。実装の例: **各 AI が最も近いプレイヤーとの距離を計算し、距離に応じて更新頻度を決める**（近いほど高頻度、遠いほど低頻度、**最遠は「起床」トリガーに入るまで更新を止める**）。NPC の更新に tick rate（メインループの頻度）と need tick rate（欲求値の更新頻度）を別のパラメータにする例がある。LOD は離散（距離の閾値）でも連続でもよい。
- **第3版で追加（#A16、Epic 公式ドキュメントの検索要約、B）**: Unreal Engine の **Mass LOD は各エンティティの LOD を High／Medium／Low／Off の4値で出力**し、**各段階に有効距離と最大エンティティ数を設定**できる。視錐台の内か外か、距離で切られるか、見えているか、でエンティティをチャンクにまとめる。**Mass Simulation LOD は計算の可変周期更新を与える負荷分散の仕組みで、tick rate パラメータが「その LOD にいるときの更新周期（秒）」**を指定する（Variable Tick Parameters）。画面外の個体は、Off で完全停止するより、低コストの処理を回す低忠実度 LOD に割り当てる、という解説もある（ブログ、C）。
- 適用範囲: ゲームの群集・NPC 一般。魚固有ではない。具体的な頻度（Hz）・距離の数値は検索で得られなかった（#A16 でも設定可能な枠組みの説明のみ）。
- 出典（どの文がどの資料かは特定不能）: https://opus.bibliothek.uni-augsburg.de/opus4/files/46021/46021.pdf ／ https://github.com/IsaacMulcahy/RPG-AI-SYSTEM-WIKI/wiki/Performance-Tuning ／ https://aischool.lillytechsystems.com/game-ai/best-practices.html ／ https://discussions.unity.com/t/ai-in-a-open-world-co-op-game/563086 ／（第3版）https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-gameplay-in-unreal-engine ／ https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/MassSimulationVariableTickParameters ／ https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassLOD/FMassSimulationVariableTickParam- ／ https://bugnet.io/blog/how-to-fix-unreal-mass-entity-agents-not-advancing-when-off-screen
- 証拠: [B/C] "The AI's update frequency is based on this distance. If a player is very close, update frequently. If a player is far, update less frequently."
- 実装への含意（設計案・推論）: ヤマメの個体数は少数（10〜数十）が想定されるので、LOD は**意思決定頻度（近景は毎フレーム、遠景は数フレームに1回）と、遠景の体波の簡略化（頂点シェーダ）**に限れば十分。具体的な頻度は資料が無く、調整値にする。

### F-11 手続き的な魚の遊泳アニメーションの実装方式（一般）
- 主張/値: (1) **頂点シェーダ方式**（F-32）、(2) **ボーンチェーン方式**（F-33）、(3) **運動学モデル方式**（F-30）、(4) **旋回**（F-31）、(5) **速度連動**: 周波数を速度に比例させ、振幅と波長は速度で変えない（F-12 の生物学的所見に沿う）、(6) **コースト**: 振幅を 0 に減衰させて直線姿勢で滑走する（設計案）。(7) スプライン方式（体軸を空間曲線にしてメッシュを沿わせ、曲線長を保つ）は **M**（検索で出典未確認）。
- 適用範囲: コンピュータグラフィックス一般。
- 出典: F-30、F-32、F-33 を参照。
- 証拠: [C/M] 一般的な実装知識。個別の根拠は各 F。
- 実装への含意（設計案）: 正弦波パラメータの根拠は F-12、F-13（ヤマメ稚魚）、F-17（旋回・高速スタート）、F-16（障害物後流）。**尾端振幅を一定にして周波数だけで速度を変える**、**波長は約 0.9 L で固定**は査読論文（PROXY）の裏付けがある。ミッドラインの長さ保存は、振幅が大きい高速スタート（体が C 字になる）で重要（M・設計判断）。

### Part B — 生物学的パラメータ（先行ストリームから継承。本ストリームでは再検索していない）

### F-12 定常遊泳の体波: 包絡、波長、振幅、周波数（継承: r08 F-02〜F-09）
- 主張/値:
  - **振幅包絡は二次多項式**: 44種の体・尾鰭推進魚で、個体の約90%（別要約では92%）が二次多項式で記述でき、A(x) = A1·(a2·x² + a1·x + a0)/Σai（A1=尾端振幅）。線形項と二次項の係数に強い負の相関（r = −0.89）。全種共通のモデルは振幅変動の60%を説明。**係数の数値は未取得**。ウナギ型〜マグロ型で、頭/尾の振幅比は減らなかった（従来の予想に反する）。
  - サイスの定常遊泳（PROXY）: A(0) = 0.02 L、A(0.2) = 0.01 L、A(1.0) = 0.10 L（要約本文は「最小は0.1 L、そこから尾端までほぼ直線的」とも書き、3点の二次式と一致しない。r08 §3-2）。波長は 0.59〜1.54 L、典型は 1 L。
  - ニジマス（全長 5.5〜56 cm）: **波長は遊泳速度に独立で、小型魚ほど相対的に長い。尾鰭振幅は速度に独立で、大型魚ほど相対的に小さい。尾鰭振動数は魚の体長と速度の両方に依存**（Webb ら 1984）。ニジマスの推進波の長さは 0.9 L（Webb 1988）。
  - 一般: 尾鰭振幅 A ≃ 0.2 L（多種の一般則）、ニジマスのバースト中 0.17 L で一定、振動数は平均速度に線形に増加（要約）。
- 適用範囲: ニジマス（PROXY）、サイス（PROXY）、多種比較。ヤマメ成魚の運動学の実測は無い。振幅の定義（片振幅か peak-to-peak か）が資料間で不明。
- 出典: Di Santo ら (2021) PNAS 118(49):e2113206118。https://www.pnas.org/doi/10.1073/pnas.2113206118 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC8670443/ 。Webb, Kostecki & Stevens (1984) J. Exp. Biol. 109:77–95。https://journals.biologists.com/jeb/article/109/1/77/4184/The-Effect-of-Size-and-Swimming-Speed-on-Locomotor 。Webb (1988) J. Exp. Biol. 138:51。https://journals.biologists.com/jeb/article/138/1/51/5554/Steady-Swimming-Kinematics-of-Tiger-Musky-an 。サイス: https://journals.biologists.com/jeb/article/109/1/209/4156/Fast-Continuous-Swimming-of-Two-Pelagic-Predators 。
- 証拠: [A（継承: r08 F-02〜F-07, F-09）] "amplitude envelope ... second-degree polynomial ... strong negative correlation between the linear and quadratic terms (r = −0.89)"; "Wavelength was independent of swimming velocity ... amplitude was independent of velocity but relatively smaller in larger fish"
- 実装への含意: 体波の形式（二次包絡、速度非依存の波長・尾端振幅、周波数で速度を変える）の骨格は裏付けがある。**係数と、ヤマメ成魚の f–U 関係は未取得**。

### F-13 ヤマメ稚魚の遊泳の実測（継承: r08 F-10, F-11）
- 主張/値: **ヤマメ稚魚（全長 4.4〜8.8 cm、体長 3.7〜7.5 cm）**を断面平均流速 48〜137 cm/s の河川水で泳がせた実験で、**尾鰭の振幅/全長 ≈ 0.12（振動数や速度が増えてもほぼ一定）、尾鰭振動数 20.8〜39.1 回/秒**、遊泳速度と振動数は比例（実験式あり、**式は未取得**）。別の実験（体長 4.8〜7.1 cm、水温 13.7〜20.6 ℃、流速 17〜92 cm/s）で、**60分臨界遊泳速度は 16〜41 cm/s、体長の 3.5〜6.9 倍（平均 5.5、SD 1.1）**、体長と正の相関、水温の影響は小さい。
- 適用範囲: ヤマメ（O. m. masou）稚魚。実験場所は岩木川取水堰。**成魚（15〜30 cm）に適用不可**。他のサケ科では BL/s の臨界遊泳速度は小型ほど高く、低温で低い（コホ稚魚 7.3 → スモルト 5.5 L/s、大西洋サケ 1〜8 ℃で 1.27〜2.08 BL/s）。
- 出典: 泉・加藤 (2012) 農業農村工学会論文集 80(2):177–。https://www.jstage.jst.go.jp/article/jsidre/80/2/80_177/_article/-char/ja/ ／ 泉・加藤 (2011) 同 79(3):151–。https://www.jstage.jst.go.jp/article/jsidre/79/3/79_151/_article/-char/ja/
- 証拠: [A（継承: r08 F-10, F-11）] "振幅と全長との比は尾ひれの振動数や遊泳速度が増加してもほぼ一定でその値は0.12 ... 尾ひれを1秒間に20.8～39.1回振って泳ぎ"; "3.5～6.9倍（平均5.5、標準偏差1.1）"
- 実装への含意: ヤマメ稚魚（parr）の高速遊泳の体波の上限は実測がある。**低速（定位・徘徊）の振動数は未取得**。

### F-14 速度域の目安（継承: r08 F-14〜F-16, r09 F-40）
- 主張/値: 日本の魚道設計で、**瞬発（突進）速度は体長の約10倍/s、巡航速度は体長の2〜3倍/s**が一般的（国交省北海道開発局の資料の要約）。別の要約では、サケ科は耐久（持続）速度 3〜4 BL/s、サケ科・サバ科は 10 BL/s を超える突進速度。成魚の60分耐久遊泳速度（水温 12〜13 ℃以上）は、イワナ 85 cm/s、ウグイ 85、コイ 70、ギンブナ・オイカワ 65、カワムツ 55 cm/s（イワナは PROXY）。**ヤマメ成魚の値は無い**。
- 適用範囲: 日本の魚道設計。小型淡水魚一般。どの文書の記述かを要約が特定していない部分がある。
- 出典: https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000054w7-att/bunryu-shiryo-13.pdf ／ https://www.jstage.jst.go.jp/article/jscej1984/1999/622/1999_622_107/_article/-char/ja/
- 証拠: [B（継承）] "瞬発速度は通常体長の10倍程度、巡航速度は体長の2-3倍が一般的"
- 実装への含意: 行動の速度ラベル（待機／徘徊／巡航／突進）の上限の目安。**待機・徘徊の速度は資料が無い**。

### F-15 胸鰭・腹鰭・背鰭の使い方（継承: r08 F-17, r09 F-44, F-45, F-48; r10）
- 主張/値: ニジマスは 0.5 と 1.0 BL/s の定速遊泳中、**胸鰭を体側に畳んだまま**にする。胸鰭は定位（ホバリング）や低速の操縦（旋回、制動）で能動的に使う。**旋回では、外側の鰭を回して横向きの力を作り、内側の鰭は推力を後方へ向ける**。ホバリング中は胸鰭が前方への運動（protraction）で横向きの伴流を作り、補正力を生む。障害物（D型円柱）の後ろの定位では、胸鰭の行動は2種: (1) **制動**（鰭を体から離して持続的に張り出し、流れに逆らう）、(2) **Kármán gaiting**（鰭の一過的な展開と収納で、流れに直交する体の動きを制御）。Kármán gaiting 中の鰭の展開運動の50%超は筋活動なしで進んだ。大西洋サケの parr が胸鰭を負の揚力の水中翼として使うという仮説は広く提案され、検証論文はあるが**結果は要約に出なかった**。
- 適用範囲: ニジマス（PROXY）、大西洋サケ parr（PROXY）。水槽・水路。ヤマメは未確認。
- 出典: Drucker & Lauder (2003) J. Exp. Biol. 206:813–826。https://journals.biologists.com/jeb/article/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout ／ Gibbs, Akanyeti & Liao (2024) J. Exp. Biol. 227(5):jeb246275。https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in 。Arnold ら (1991)（題名と仮説のみ）。https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding
- 証拠: [A（継承: r08 F-17, r09 F-44, F-45）] "during constant-speed swimming at 0.5 and 1.0 body lengths per second, the pectoral fins remain adducted against the body"; "Sustained fin extensions during braking ... Transient fin extensions and retractions during Kármán gaiting controlled body movements in the cross-stream direction."
- 実装への含意: 胸鰭の状態を遊泳モードに連動させる（巡航=畳む、定位=小さく振る、旋回=外側を開く、制動=持続的に張り出す）。写真（P）では胸鰭を広げる例と畳む例の両方があり、低速・底近くで広げる傾向は弱い (r09 F-11)。

### F-16 障害物後流の遊泳モード: Kármán gait と entraining（継承: r08 F-18〜F-22, r09 F-29, F-46, F-47）
- 主張/値: ニジマスが円柱の後流の渦列の中で泳ぐと **Kármán gait**: 体の振幅と体波長が自由流より大きく、**尾鰭振動数は渦放出周波数に一致して自由流より低い**。尾端振幅は自由流の**約3倍**、体波長は渦列の波長の**約1.25倍**、体波の速度は流速より約25%速い。出現確率は流速 **30〜70 cm/s** で最大。尾鰭振動数は体サイズに依存しない（渦放出周波数の関数）。大きい魚ほど体波長が短く波速が遅い。Kármán gait の波は体の中央（自由流の開始点より 0.2 L 後方）から始まり、振幅包絡は尾へ非線形に増える。同定基準: 定位している、体に進行波がある、側方変位 > 1/2 L、体波長 > 1 L、一過的な小振幅・高周波の尾鰭振動がない。生きたトラウトは、軸筋の活動なしで一時的に Kármán gait できる。**Entraining**（円柱の側方の吸引域）: **体をリズミカルに波打たせず、体をまっすぐ、流れに対して角度をつけて保持し、擾乱は鰭で補正**。円柱の前（bow wake）では尾鰭振幅と体波速度が低い。
- 適用範囲: ニジマス（PROXY）。水路の円柱後流。流速 30〜70 cm/s は**ヤマメの生息流速 10〜35 cm/s（F-22）より速い**ので、渓流の岩の後ろにそのまま当てはめられない。
- 出典: Liao ら (2003) J. Exp. Biol. 206:1059。https://journals.biologists.com/jeb/article/206/6/1059/14048/The-Ka-rma-n-gait-novel-body-kinematics-of-rainbow 。Akanyeti & Liao (2013) J. Exp. Biol. 216:3442。https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/ 。Przybilla ら (2010) J. Exp. Biol. 213:2976。https://journals.biologists.com/jeb/article/213/17/2976/9891/Entraining-in-trout-a-behavioural-and-hydrodynamic 。Liao (2004)。https://pubmed.ncbi.nlm.nih.gov/15339945/
- 証拠: [A（継承: r08 F-18〜F-22, r09 F-46, F-47）] "tail beat frequency, which matched the vortex shedding frequency, was significantly lower"; "When entraining, trout show no rhythmic body undulations, holding the body straight and at an angle"
- 実装への含意（設計案）: 「岩・流木の背後／側方の流れの緩い場所」で体波を切り替える。**振幅3倍・周波数低下・体波を止める、の切替は査読論文（PROXY）に裏付けられるが、ヤマメの渓流の遅い流れで同じ現象が出るかは未検証**。

### F-17 高速スタート・旋回・逃避（継承: r09 F-31〜F-38）
- 主張/値:
  - **3 段階**: Stage 1（準備: 体が C または S 字に屈曲）→ Stage 2（推進: 加速）→ Stage 3（可変: 継続遊泳、制動、滑走）（Domenici & Blake 1997）。逃避と**摂餌ストライク**の両方に当てはまる。
  - **ニジマス 9.6〜38.7 cm（Webb 1976）**: 2 型（L 型＝反動旋回を伴う、S 型）。主加速段階の継続時間は体長とともに増え 0.07 s（最小群）〜0.10 s（最大群）。**最小旋回半径は両型とも全長の 0.17 倍**。加速度はサイズに依存しなかった。
  - **ニジマス 25.7 cm の活餌攻撃（Webb 1983）**: 最小旋回半径は 0.18（要約表記は ±0.2 で誤植の可能性）L（スモールマウスバス 0.11 ± 0.02 L）。速度・加速度に依存しない。
  - ニジマス（平均 0.32 m）の逃避: C 字は単峰（type I）、S 字は二峰（type II）の加速度曲線。平均最大加速度 59.7 ± 8.3 m/s²（カワカマス 120.2 ± 20.0）、逃避の継続時間は 0.085〜0.134 s の範囲（Harper & Blake 1990）。
  - 逃避の最小潜時は **5〜20 ms でサイズに依存しない**（総説の要約、出典論文の特定不能）。
  - 筋の短縮と体の屈曲は時間的に分離し、**体軸の曲率は筋の短縮から遅れる**（0.4 L と 0.7 L の両方、Goldbogen ら 2005）。
  - サケ科の Stage 2 の移動距離は全長に比例（孵化直後〜卵黄吸収後、Hale 1999）。
- 適用範囲: ニジマス（PROXY）。電気刺激による驚愕反応（捕食者の接近ではない）と、活餌への攻撃。水温・n は要約に無いものが多い。ヤマメの値は無い。C 型／S 型の頻度は未取得。
- 出典: Webb (1976) J. Exp. Biol. 65:157–177。https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance 。Webb (1983) J. Exp. Biol. 102:115–122。https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two 。Harper & Blake (1990)。https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo 。Domenici & Blake (1997)。https://tethys.pnnl.gov/publications/kinematics-performance-fish-fast-start-swimming 。Domenici & Hale (2019)。https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity 。Goldbogen ら (2005)。https://pubmed.ncbi.nlm.nih.gov/15755891/ 。Hale (1999)。https://pubmed.ncbi.nlm.nih.gov/10229693/
- 証拠: [A（継承: r09 F-31〜F-38）] "radius of 0.17 L"; "Minimum response latencies are in the order of 5–20 ms and independent of fish size."; "midline curvature lagged behind muscle shortening"
- 実装への含意（設計案）: 旋回の曲率の上限 = 半径 0.17 L（曲率 ≈ 5.6/L）。通常の旋回はこれより緩い（実測なし）。高速スタートは「Stage 1（C 字屈曲、数十 ms）→ Stage 2（推進、約 0.07〜0.10 s）→ Stage 3」の状態機械。**ヤマメ parr〜成魚（数 cm〜30 cm）への補間は私の判断で、検証は無い**。

### F-18 バースト＆コースト（継承: r09 F-30, F-39）
- 主張/値: 理論モデルは、バースト＆コースト遊泳が同じ距離の定常遊泳より **50%超**エネルギーを節約すると予測。koi carp では同じ平均速度の定常遊泳より **約45%**節約。cod と saithe の高速度映像では、周期が最も安い解を選ぶ傾向。機構は Bone-Lighthill の境界層薄化仮説。ニジマスのバースト中の尾鰭振幅は 0.17 L で一定、振動数は平均速度に線形に増加。
- 適用範囲: PROXY: koi carp、cod、saithe、ニジマス（学会要旨）。**サケ科・ヤマメの自然な遊泳でのバースト＆コーストの頻度の実測は見つからなかった**。
- 出典: Videler & Weihs (1982) J. Exp. Biol. 97:169–178。https://journals.biologists.com/jeb/article/97/1/169/34638/Energetic-advantages-of-burst-and-coast-swimming ／ koi: https://journals.biologists.com/jeb/article/210/12/2181/16867/Kinematics-hydrodynamics-and-energetic-advantages ／ https://sicb.org/abstracts/kinematic-analysis-of-burst-and-coast-swimming-in-rainbow-trout/
- 証拠: [A（継承: r09 F-39, r08 F-23）] "nearly 45% of energy is saved when burst-and-coast swimming is used by koi carps compared with steady swimming at the same mean speed."
- 実装への含意: 既定は無効寄り。有効にする場合は、バースト中の振幅一定・周波数を速度に連動、コースト中は振幅を減衰（設計案）。

### F-19 ドリフト捕食の時間配分と捕獲位置（継承: r09 F-41, r11 F-18）
- 主張/値: ドリフト捕食の魚は、定位点に留まり、**速い流れに短く出て**流下する無脊椎動物を迎撃する。ある研究で、魚は**観察時間の平均 81% を定位点で過ごし、能動的な採餌は 14%**。迎撃速度は期待された最大持続遊泳速度より遅く、**餌の約 2/3 は定位点より下流側で捕獲された**。採餌モデルの一部は、定位点を含む平面上の 5 cm² の格子セルで採餌体積を扱う。
- 適用範囲: ドリフト捕食のサケ科（種・サイズ・場所は要約が特定しない）。検索結果の集合に brown trout（NZ、Hughes ら 2003）、juvenile Chinook salmon、O. mykiss（カリフォルニア）の研究が含まれ、記述はこれらのいずれか。**ヤマメではない可能性が高い**。Piccolo ら 2008（F-20）の「Vmax で迎撃」とは食い違う（§3）。
- 出典: https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river ／ https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream ／ https://cdnsciencepub.com/doi/10.1139/cjfas-2020-0398
- 証拠: [C（継承: r09 F-41。出典論文の特定不能）] "Fish held focal positions in the water column most of the time (mean = 81%), with active foraging observed for 14% of observation periods ... captured about two-thirds of their prey downstream of their focal point"
- 実装への含意: 状態機械の時間配分の目安（待機 81%：採餌 14%：その他 5%）。**迎撃の向きは「下流側が多い」と仮置き**し、上流への突進を既定にしない。

### F-20 迎撃速度・検出距離と流速（継承: r09 F-42, F-43）
- 主張/値: coho salmon と steelhead の幼魚を流速 0.29〜0.61 m/s で比較した水槽実験（3D映像）。**捕獲確率と餌の検出距離は、流速の増加で有意に低下**。**迎撃速度は流速にも種にも影響されず、魚は全流速で、予測された最大持続遊泳速度（Vmax）で餌を迎撃**（Piccolo ら 2008）。一方、UGA の学位論文の要約では、**反応距離は北極グレイリングで流速との関係が弱い正または無く、ニジマスでは流速は捕獲に負の効果、反応距離には「ほとんど／全く効果なし」、定位流速（holding velocity）に正の効果**。
- 適用範囲: PROXY: coho、steelhead（幼魚、水槽）、北極グレイリング、ニジマス。数値（捕獲確率の低下幅）は要約が乱れており採用しない。学位論文は査読を経ない。
- 出典: Piccolo, Hughes & Bryant (2008) Can. J. Fish. Aquat. Sci.。https://research.fs.usda.gov/treesearch/31556 （候補。当該論文かは未確認）。学位論文: https://openscholar.uga.edu/record/3703/files/MerrittKieranMS.pdf ／ https://openscholar.uga.edu/record/20894/files/bozeman_bryan_b_201708_ms.pdf
- 証拠: [A（継承: r09 F-42）]／[B（継承: r09 F-43）] "fish intercepted prey at their predicted maximum sustainable swimming speed (Vmax) at all velocities"; "little to no effect on reactive distance"
- 実装への含意: 迎撃の速度 = その個体の最大持続遊泳速度（PROXY で支持）。反応距離を流速に依存させるかは、資料が割れているため**既定は依存させない**（設計判断）。

### F-21 反応距離の数値（継承: r11 F-17）
- 主張/値: 反応距離（reactive distance）の平均はキングサーモン幼魚で **32.7 cm**。カットスロートトラウト（沿岸型）の最大反応距離は好条件の光で **187.1 cm**。反応距離は餌の直径が体長の **0.025 倍**で最大、打撃距離（striking distance）は 0.025〜0.051 倍で最大で、それより大きくても小さくても減る。流速が上がると捕食成功率は非線形に下がる。優位個体は劣位個体より多く捕食したが、反応距離の差は無かった。
- 適用範囲: **PROXY: キングサーモン幼魚、カットスロートトラウト（沿岸型）**。要約が出典論文を特定していない。ヤマメのデータではない。
- 出典（候補。どの文がどのPDFかは特定不能）: https://www.sfu.ca/biology/faculty/dill/publications/f84-139.pdf ／ https://www.sfu.ca/biology/faculty/dill/publications/z78-198.pdf ／ https://openscholar.uga.edu/record/11698?ln=en
- 証拠: [C（継承: r11 F-17）] "Reaction distance was maximal on prey whose diameter was 0.025 fish length"
- 実装への含意: 反応距離は**魚種・光条件・餌の大きさ**で数倍〜数十倍変わるので、単一の既定値を「ヤマメの値」と呼ばない。調整可能にする。

### F-22 ヤマメ／サクラマスの定位場所（継承: r11 F-01, F-02, F-04, F-05, F-06, F-10）
- 主張/値:
  - 生息流速 10〜35 cm/s、粒径 0.5〜5.0 cm の礫底（環境省資料、B・継承）。
  - 北海道・登川のサクラマス／ヤマメ幼魚: **秋は水深が深く（35.4 ± 14.2 cm）、流速が速く一様な（43.4 ± 23.1 cm/s）流心側**、**冬は流速約 20 cm/s の岸際で沈水カバーのある場所**。冬は流速が遅く被覆度が高い場所を好む（A）。湧水支流は暖かく流れの遅い越冬場所。
  - ごく小さい稚魚（全長 2.4〜3.3 cm）は水深 2〜14 cm（平均 6 cm）の浅く遅い場所（定位位置の流速は計測限界以下の 5 cm/s と記録、区間平均は水深 10 cm・流速 37 cm/s）。
  - プール（淵）では大部分が落水部から最深部の間に定位。5 cm 以上の礁を入れると隙間へ退避（B）。
  - 釣り情報: 定位点は流れが絞れた所・合流点など餌が集まりやすい場所（C）。
- 適用範囲: 河川型ヤマメ／サクラマス幼魚。測定が焦点流速か利用場所の平均流速かが資料間で混在（§3）。
- 出典: https://link.springer.com/article/10.1007/s10228-010-0201-3 ／ https://www.env.go.jp/council/09water/y0910-03/mat03.pdf ／ https://catalog.lib.kyushu-u.ac.jp/opac_download_md/10879/p073.pdf ／ https://catalog.lib.kyushu-u.ac.jp/opac_download_md/23570/p173.pdf ／ https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol41.html
- 証拠: [A（継承: r11 F-01）] "preferred midstream habitat with greater depth (averaging 35.4 ± 14.2 cm) and high uniform current velocities (43.4 ± 23.1 cm/s) during autumn, while in winter ... channel margin habitat with moderate current (about 20 cm/s) and submerged cover"
- 実装への含意: 定位点スコア (F-07) の重みづけの方向づけ（深み・被覆・流速の勾配・季節）。**サイズ別の焦点流速、底からの高さの数値は無い**。

### F-23 順位・縄張り（継承: r11 F-12, F-13, F-15, F-16）
- 主張/値: アユ、イワナ、サクラマス／ヤマメ、ウグイを体サイズ5階級に分けた観察で、**ほぼ直線的な優劣順位**が3か月続いた（A）。サクラマス parr で、体が大きいほど優位な位置を得る方向に選択が働く（A）。縄張り面積の種間回帰（PROXY: サケ科幼魚、Grant & Kramer 1990）: **log10(面積 m²) = 2.61 log10(尾叉長 cm) − 2.83（r² = 0.87、n = 23）**。この式から尾叉長 5 cm → 約 0.10 m²、10 cm → 0.60 m²、20 cm → 3.7 m²（r11 の算出。外挿を含む）。ドリフト捕食のキングサーモン幼魚（PROXY）では最大・最優位の個体が固定した排他的な採餌空間を攻撃的に守った。
- 適用範囲: ヤマメ幼魚（順位）、サケ科幼魚（縄張り式・PROXY）。縄張りが「餌の流下を待つ空間」か「定位点の周り」かは式から決まらない。
- 出典: https://link.springer.com/article/10.1007/BF02678571 ／ https://sitesreservoirproject.riptideweb.com/references/REF23/Volume%202/App11M_Yolo_Sutter_Bypass_Weir_Spill_Analysis/Grant%20and%20Kramer_1990_Territory%20Size.pdf ／ https://pubs.usgs.gov/publication/70269370
- 証拠: [A（継承: r11 F-12, F-15, F-16）] "almost linear dominance order"; "log10 territory size = 2.61 log10 length − 2.83, with an r² = 0.87 and n = 23"
- 実装への含意（設計案）: 個体間の追い払い行動の発動距離に縄張り半径（式の円換算で 3.5〜5.4 体長）を使う案。**攻撃行動の型・頻度・距離はヤマメで未取得**（r11 F-32 は M）。

### F-24 日周・季節（継承: r11 F-08, F-09, F-19, F-20）
- 主張/値: 摂餌の時間帯は季節で変わる（春先は水温が上がる時刻、夏は終日ならして、秋は夕刻に多い、県資料の要約、B）。釣り情報では朝は緩い流れの深み、昼に向けて流れの速い浅場へ（C）。サクラマスの稚魚（ふ化直後）は下流移動が夜、上流移動が昼（北海道の人工水路、A）。水温約 10℃ 以下でサケ科幼魚は冬にほぼ完全に夜行性（PROXY: 大西洋サケ・ブラウントラウト、B）。
- 適用範囲: 季節・サイズ・魚種が資料ごとに違い、同じ軸の比較にならない（§3）。
- 出典: https://catalog.lib.kyushu-u.ac.jp/opac_download_md/23570/p173.pdf ／ https://www.honda.co.jp/fishing/enjoy/season/season-201704/step-2/ ／ https://www.hro.or.jp/upload/41034/81-kawamura.pdf ／ https://theses.gla.ac.uk/id/eprint/75895
- 証拠: [B（継承: r11 F-08, F-20）] "春先には水温が上昇する時刻に多量に摂餌する傾向、夏はどの時間帯も均して摂餌、秋期には夕刻に多く"
- 実装への含意: 昼間の可視化では、日周は「活動度の係数」程度に留める。**ヤマメ幼魚〜成魚の時間帯別活動量の数値は無い**。

### F-25 警戒・逃避・隠れる・復帰（継承: r11 F-23〜F-25, F-34）
- 主張/値: ヤマメ・イワナは上流を向いて定位し、人の気配で岩の下に隠れる。人の多い川の野生魚は特に神経質で、少し驚いただけで摂餌への関心を失う（釣り解説、C）。PROXY: 大西洋サケの群れは光・超低周波音・音の刺激の間は水底へ潜り、止むと元の遊泳水深と速度に戻った（A）。ブラウントラウト・大西洋サケの稚魚は驚くと水底付近で短い突進、Arctic charr は上向きの突進か静止。別の（魚種不明の）研究で驚愕反応と潜時は騒音停止後およそ2分以内に回復（C）。「驚いたヤマメは最寄りの隠れ場へ短い突進で逃げ、数分〜数十分で元の定位点に戻る」は私の記憶（M、時間は根拠なし）。
- 適用範囲: ヤマメ（釣り解説）、PROXY（大西洋サケ等）。警戒距離（FID）、逃避速度、再出現時間の数値は無い。
- 出典: https://www.honda.co.jp/fishing/enjoy/season/season-202107/step-2/ ／ https://www.pref.nagano.lg.jp/suisan/joho/sakanatachi/yamame.html ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3656933/ ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6634859 ／ https://vocal-communication.bio.bris.ac.uk/pdfs/Rapid_recovery.pdf
- 証拠: [C（継承: r11 F-23）] "Wild yamame in populated river areas are particularly nervous and wary, and quickly lose interest in feeding if startled even slightly"
- 実装への含意: 逃避の状態機械（警戒→高速スタート→隠れ場→待機→復帰）の遷移条件は、**警戒距離・復帰時間を調整可能な仮置き**にする。

### F-26 感覚: 側線系の解剖と、視覚・側線の資料（継承: r07 F-11, F-13; r09 F-49）
- 主張/値: **O. m. masou の側線系は、頭部側線管8本（supraorbital, infraorbital, otic, preopercular, mandibular, postotic, supratemporal, temporal）＋体幹側線管1本、表在神経丘グループ9**。preinfraorbital の表在神経丘群を持ち、infraorbital／mandibular／opercular の表在神経丘群を欠く（査読）。**視野**: 眼は頭部の両側にあり前方に狭い両眼視野の重なりと後方の盲域がある、という定性的な記憶のみ（r07 F-11、M）。**ヤマメ／サケ科の視野角、眼球の可動域、視力、瞳孔動態の数値は未取得**（本版の検索でも得られなかった、F-37）。ニジマスの乱流中の体の運動学に対する側線と視覚の役割を調べた論文（Liao 2006, J. Exp. Biol. 209:4077）の題名は確認したが、**内容は取得していない**。
- 適用範囲: O. m. masou（解剖）。それ以外は PROXY またはなし。
- 出典: "The lateral line system and its innervation in the masu salmon Oncorhynchus masou masou (Salmonidae)", Ichthyological Research (2021)。https://link.springer.com/article/10.1007/s10228-021-00843-0 ／ Liao (2006)（題名のみ）。https://pubmed.ncbi.nlm.nih.gov/17023602/
- 証拠: [A（継承: r07 F-13）]（側線管の数）／[M]（視野の定性的記述）
- 実装への含意（設計案）: 視覚＝円錐状の視野＋遮蔽判定、側線＝近距離の全方位の「動いている物」検出、の2チャネルに簡略化できる。数値は F-37。

### F-27 摂餌ストライクと呼吸の頭部アニメ用の数値（継承: r07 F-17, F-20, F-27）
- 主張/値: ニジマスの摂餌ストライクで神経頭蓋は最大 **2〜18°** 挙上する（28 ストライク、3個体）。多数の椎間関節（最大約 1/3）の小回転（多くは 3° 未満）が合算される（"neck-like"）。ニジマスの通常酸素下の換気頻度は **57 ± 4 回/分（対照）と 78 ± 4 回/分（軟水順化魚）**（平均 ± SEM、水温・体サイズは要約に無い）で、約 0.95〜1.3 Hz（算術）。水温が高いほど有意に増える（定性）。激しい運動後は頻度がほぼ変わらず、1回の換水量が増える。開口時間の桁は PROXY（ブルーギルの最大開口まで約 13 ms、ラージマウスバスは約 50 ms 以内に閉顎）のみで、**サケ科の最大開口角・開口時間は未取得**。
- 適用範囲: ニジマス（PROXY）、ブルーギル・ラージマウスバス（PROXY）。ヤマメは未確認。
- 出典: r07 F-27、F-20 の出典（r07 の出典一覧）。ヤマメの頭部の大きさ・口裂の位置は r07 F-15 など。
- 証拠: [A（継承: r07 F-27, F-20）]
- 実装への含意: 鰓蓋の開閉（呼吸）は 1 Hz 前後を既定にして水温連動を調整可能に。摂餌ストライクの開口〜閉口は「数十 ms」の桁の PROXY で、**ヤマメ用の根拠は無い**。

### F-28 写真（P）: 水中フレーム19枚の体の湾曲・口の開閉・頭のピッチ（ローカル集計）
- 主張/値: catalog_c01〜c07.json の context が「in_water_natural のうち自然な8枚（p005, p006, p007, p023, p026, p036, p040, p054）」と「aquarium の11枚（p014, p015, p016, p017, p018, p027, p028, p029, p041, p042, p049）」の計19枚を集計した（釣獲後・掛かり・平置きの in_water_natural 4枚＝p011, p019, p067, p070 は除外）。
  - **体の湾曲（注釈者の3区分 body_straightness）**: straight 10（自然 2＋水槽 8）、slightly_curved 8（自然 5＋水槽 3）、strongly_curved 1（自然 1: p007、ライズ直後または方向転換と推定）。
  - **口**: 開いているのは 2/19（p005＝摂餌／呼吸と推定して「大きく開く」、p016＝水槽で「わずかに開く」）。閉口 17。
  - **頭のピッチ（注釈者の見積もり。水槽が中心）**: 頭上げ p005 約 5°、p014 の A 魚 20〜30°、p018 の 2 尾 14〜18°（並走して上昇）、p028 の A・B 約 25〜55°；頭を下げ気味 p015 の T1、p026、p049；水平 p029, p041, p040。
  - 他の姿勢所見は r11 F-27（背鰭が立つ 6/8 枚など）、r09 F-10〜F-16 に既出。
- 適用範囲: ヤマメと同定した写真（確信度は写真ごとに差）。水槽は高密度で、野外の行動の根拠にならない（r11 F-28, F-29）。ピッチの角度は px 見積もりで、小さい n。湾曲の区分は主観。体の湾曲の大きさ（曲率）の数値は無い。
- 出典: /home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json〜catalog_c07.json（context, body_straightness, head_mouth.mouth_state, posture_behavior 欄の Python 集計）。
- 証拠: [P] "頭をやや上向き(約5度)にし口を開く(摂餌/呼吸)"（p005）；"体は右上へ強く湾曲し尾柄が上へ曲がる"（p007）
- 実装への含意: 定常遊泳・定位の大半で、体はほぼ直線〜軽い湾曲（19枚中18枚）。強い湾曲は方向転換・ライズ直後などの局面だけに出る、という扱いが写真の傾向と整合する。ピッチの上限（約 25〜55°）は、水槽で斜め上へ泳ぐ個体の見積もりであって、野外の通常行動の上限ではない。

### F-29 写真（P）: 自然な水中フレームでの底からの高さと背鰭（継承: r11 F-27, r09 F-10, F-14）
- 主張/値: 自然な水中8枚のうち底から魚体下縁までの高さを見積もれた5枚: 約 0.25 体高（p026）、約 0.7 体高（p005）、約 1 体高（p036, p040, p023 の個体 B）。背鰭が立っている明示がある例は 6/8 枚。水槽の複数個体が同方向を向く例が多い（p014, p015, p018, p041）が、水槽は高密度で野外の個体間距離の根拠にならない。
- 適用範囲: n が小さい。高さは注釈者の px 見積もり。
- 出典: catalog_c01〜c07.json の posture_behavior 欄（r11 F-27、F-28 の集計を継承）。
- 証拠: [P（継承）]
- 実装への含意: 定位時の底からの高さの初期値は 0.25〜1 体高（写真5枚の範囲）。背鰭は定位・遊泳中に立てる（6/8）。

### Part C — 本版で追加した手続き的アニメ・個体ベースモデル・感覚の所見

### F-30 Gates (2001)「Animation of Fish Swimming」（UBC 技術報告 TR-2001-19）
- 主張/値: **スレンダーな水生動物の移動の「2部構成モデル」**を、コンピュータアニメーション向けに示した8ページの報告。第1部は**運動学的モデルで、体の変形を3つの遊泳モード（定常遊泳、急発進、旋回）**で扱う。第2部は動力学的モデルで、結果として生じる推進を扱う。完全な動力学モデルほど一般的ではないが、**アニメーターに少数の直感的なパラメータを与え**、シミュレーションが効率的。
  - 推進様式は**振幅が体に沿ってどう変わるかで分類**: anguilliform（振幅が後方へ増え、体全体で大きい）、subcarangiform（後方の1/3〜1/2で急に増える）、carangiform（後方の1/3で急に増える）。
  - **急発進**: 魚は素早く特徴的な「L」字に屈曲し、主に尾鰭で水を押して大きな推力を出す。モデルでは**ユーザーが L 字の背骨の角度を定義**し、初期値から L 字の値へ、そして戻るように角度を変えて動かす。
  - 数式（振幅包絡の具体形、波長、周波数、旋回の式）は**検索要約に無く、未取得**。
- 適用範囲: 計算機科学（技術報告、査読の有無は不明）。魚種は特定されない。
- 出典: https://www.cs.ubc.ca/sites/default/files/tr/2001/TR-2001-19_0.pdf ／ https://cs.ubc.ca/tr/2001/tr-2001-19
- 証拠: [B] "a simple, two-part model of the locomotion of slender-bodied aquatic animals ... the first part is kinematic and addresses body deformations for three swimming modes: steady swimming, rapid starting, and turning."
- 実装への含意（設計案）: 「少数の直感的パラメータ」の方針は流用できる。ヤマメは carangiform〜subcarangiform の振幅分布（後方 1/3 で急に増える）を既定とし、F-12 の二次包絡で表す。急発進を「背骨の角度で L 字を指定して往復」する方式は、F-17 の Stage 1 に対応する簡易実装になる。

### F-31 旋回の曲率パルスモデルと波形オフセット（Giant danio、PROXY）
- 主張/値: **魚の旋回では、体軸に沿って前方から後方へ伝わる曲率のパルスが観察され、実験条件や方向転換の大きさによらない**。パルスは**振幅・幅・速度で記述できる一過的な波**。Giant danio（Devario aquepinnatus）の通常の方向転換は「体の中央付近から後方へ伝わる曲率のパルス」。**波形オフセット方式**では、振動の周波数と振幅は変えず、**波全体を右か左へ偏らせて**、魚が一方向へ曲がりやすくする。3Dプリントのロボットで、パルス、C-start、オフセットの3方式を実装・比較し、パルスは生きた魚に近い挙動を示す予備データがある。**パルス方式は定常遊泳と自然に接続でき、複雑な機動も作れる**と報告。
- 適用範囲: Giant danio（PROXY）、ロボット制御。サケ科・ヤマメでの確認は無い。パルスの振幅・幅・速度の数値は要約に無い。
- 出典: https://sicb.org/?p=39861 ／ https://sicb.org/?p=8043 ／ https://sicb.org/?p=11086 ／ https://sicb.org/abstracts/midlines-in-motion-connecting-midline-curvature-dynamics-to-heading-change-and-center-of-mass-deflection-in-fishes ／ https://meetings-archive.aps.org/mar/2019/v64/3 ／ https://blogs.uakron.edu/astleylab/wp-content/uploads/sites/1471/2021/04/Howe_2021_Bioinspir._Biomim._.pdf
- 証拠: [B（学会要旨）] "an anterior to posterior propagating pulse of curvature has been observed along the midline of the body, regardless of experimental treatment or heading change magnitude."
- 第3版の補足（#A6）: 上記の出典 Howe_2021_Bioinspir._Biomim._.pdf に当たる論文は、検索結果に出た Howe & Astley (2021) の2本のうち、**「Comparing the turn performance of different motor control schemes in multilink fish-inspired robots」**（Bioinspiration & Biomimetics、DOI https://doi.org/10.1088/1748-3190/abe7cc）と**推定**される（もう1本は「Testing the effects of body depth on fish maneuverability via robophysical models」、DOI https://doi.org/10.1088/1748-3190/ac33c1 で、体高の影響の論文）。**検索要約に曲率パルスの振幅・幅・速度の数値は無く、取得できなかった**。出典候補: https://meetings.aps.org/Meeting/MAR19/Session/V64.3 ／ https://sicb.org/?p=18174
- 実装への含意（設計案）: 旋回の実装は (a) 曲率オフセット（単純）、(b) 曲率パルス（自然）の2案を切替可能にする。パルスの伝播速度は、筋の活性化から曲率が遅れるという F-17（Goldbogen ら）と整合する。**ヤマメの通常旋回のパラメータは無い**。

### F-32 頂点シェーダによる魚の群れアニメ（Godot 公式ドキュメント）
- 主張/値: ボーンは CPU で動かすため数千匹には拡張できない。**頂点シェーダで頂点に変位を与えれば、アニメ全体を数行のコードで GPU 上で計算できる**。アニメは4つのモーション: **左右運動、体の中心まわりの回転（pivot）、マスク付きの進行波（panning wave）、マスク付きのねじれ（panning twist）**。全て model space の頂点に cos 波を加える。左右運動は VERTEX.x に cos(TIME) の分を足す。進行波は cos(time + body) × mask × wave（body は体に沿った位置、mask は体に沿った重み）。各モーションの量は uniform で制御する。
- 適用範囲: ゲームエンジンのチュートリアル（Godot）。Three.js でも同じ考え方で実装できる。生物学的な係数は含まない。
- 出典: https://docs.godotengine.org/en/latest/tutorials/performance/vertex_animation/animating_thousands_of_fish.html ／ https://docs.godotengine.org/en/3.1/tutorials/3d/vertex_animation/animating_thousands_of_fish.html
- 証拠: [B] "The animation consists of ... a side to side motion, a pivot motion around the center of the fish, a panning wave motion, and a panning twist motion" ／ "cos(time + body) * mask * wave"
- 実装への含意: 進行波の位相に体軸位置 x を入れ、mask に F-12 の二次包絡を使う。左右運動と回転は、F-31 の旋回オフセットに相当する要素として使える。

### F-33 ボーンチェーンの位相遅れによる魚・蛇らしい動き（一般）
- 主張/値: sine 波を作り、**パラメータで遅れ（位相差）を加え、ボーンチェーンの各節の遅れを段階的に増やすと、蛇・ウナギ・魚らしい動きになる**。尾・マント・触角など任意のチェーンに「進行波の遅れ」の技法を使える。ある解説は、節ごとに基本遅れの 1/7 ずつ遅れを増やす例を述べる。ジョイントチェーンに sine 波を与えるツールもある。
- 適用範囲: ゲーム制作・DCC ツールの一般的な解説。生物学的な根拠なし。
- 出典: https://seamless3d.com/tut/worm_animation ／ https://toolchefs.atlassian.net/wiki/spaces/ASD/pages/1137770611/Joint+Spline+Animation ／ https://www.abratabia.com/game-animation/procedural-animation.php （どの文がどの資料かは特定不能）
- 証拠: [C] "delaying each segment in a bone chain with progressively increasing delay values"
- 実装への含意: 節ごとの位相遅れの合計が体波長を決める。波長 ≈ 0.9 L（F-12）になるよう、全節の位相差の総和を 2π × (L / 0.9 L) の関係で設定する（設計案）。

### F-34 Railsback & Harvey (2002) 生息場所選択規則の比較（期待成熟度）
- 主張/値: ストリームのトラウトの個体ベースモデルで、**現実のトラウトの6つの生息場所選択パターンを再現できるかを、3つの選択目的で比較**した: 現在の成長率の最大化、現在の生存確率の最大化、**期待成熟度（EM）の最大化**。EM は、(1) 将来の期間にわたる飢餓などのリスクからの生存予測と、(2) その期間に繁殖サイズに到達する割合の**積**。結果: **成長最大化は3パターン、生存最大化は2パターン、EM 最大化は6パターン全てを再現**。水温や餌量の変化に伴う生息場所のシフトの2パターンは、現在の成長とリスクだけを考える目的では再現できず、EM で説明できた。
- 第3版で追加（#A3, #A5）: (1) EM の定義は検索で再確認（"the product of (1) predicted survival of starvation and other mortality risks over a future time horizon, and (2) the fraction of reproductive size attained over the time horizon"）。**時間軸（日数）の値と生存の式は今回も得られなかった**。(2) 移動規則の論文「**Movement rules for individual-based models of stream fish**」（Railsback, Harvey, Lamberson, Duffy、Ecological Modelling、1999。巻頁は M のまま）の存在と要旨を確認（B）。要旨: 個体ベースモデルの移動規則は、個体がいつ今の場所を離れるか、どこへ動くかを決め、シミュレーションの正確さに重要。**多くの魚は物理・生物条件の変化に素早く動くので、規則は到達可能な最良の場所を素早く選ばせるべき**。「死亡リスク／摂餌量の比を最小化すると適応度が最大になる」という理論は、典型的な IBM の移動決定には当てはまらず、よくある状況で重大な誤りを生む。出典候補: https://catalog.comses.net/publications/70312 ／ https://research.fs.usda.gov/treesearch/7914 ／ https://archive.epa.gov/ncer/publications/web/pdf/lamberson.pdf ／ https://www.frontiersin.org/journals/ecology-and-evolution/articles/10.3389/fevo.2025.1494539/abstract（同主題の新しい論文。内容は未確認）。
- 適用範囲: ストリームのトラウトの IBM（北米・欧州型のパラメータ）。ヤマメの検証は無い。
- 出典: Railsback S.F., Harvey B.C. (2002) Ecology 83(7):1817–1830。https://catalog.comses.net/publications/9071 ／ https://research.fs.usda.gov/treesearch/7905
- 証拠: [A] "maximizing EM reproduced all six patterns."
- 実装への含意（設計案）: 定位点の評価に「現在の餌の取り分」だけでなく**リスク項**（被覆、水深）を入れる方が、季節（水温）や餌量の変化に応じた移動を説明しやすい、という方向づけ。係数は無い。

### F-35 Urabe ら (2010) 北海道の渓流サケ科の NEI と生息密度
- 主張/値: 生物エネルギー学モデルから推定した**エネルギー的な潜在力（NEI）が、渓流サケ科の生息場所の質の指標として有効か**を、北海道の4つの流域の7つの渓流で検証。**各調査区の平均 NEI はサケ科の現存量と密接に関係**した（物理環境と流下餌の密度は調査地間で大きく違ったにもかかわらず）。
- 適用範囲: 北海道北部の渓流のサケ科（種の内訳は要約に無い。ヤマメ／イワナ類が含まれるかは未確認）。NEI の式・係数・反応距離は要約に無い。
- 出典: Urabe H., Nakajima M., Torao M., Aoyama T. (2010) Trans. Am. Fish. Soc. 139:1665–1676（書誌は DOI 10.1577/T09-210.1 と検索結果の題名から）。https://catalog.comses.net/publications/87172 ／ https://informahealthcare.com/doi/full/10.1577/T09-210.1
- 証拠: [A] "The mean NEI at each study reach was closely related to salmonid abundance"
- 実装への含意: 日本の渓流でも、NEI 型の定位点スコアが現存量と整合した例があり、F-07 の簡略スコアを使う根拠の一つ（ヤマメ単独の検証ではない）。

### F-36 ドリフト捕食モデルの前提への批判（Hughes & Dill 型）
- 主張/値: Hughes & Dill 型のモデルには**餌の検出・捕獲と遊泳コストについて非現実的な仮定が数多く含まれる**（AFS 2011 の総説関連発表の要旨）。Fausch (1984) の理論は Chapman (1966) の概念モデルを基にする。NEI モデルは、反応距離・遊泳コスト・捕獲成功の組み合わせ方で別々のバージョンがある。
- 適用範囲: ドリフト捕食モデル全般。どの仮定が非現実的かの個別内容は要約に無い。
- 出典: https://afs.confex.com/afs/2011/webprogram/Paper4379.html ／ https://afs.confex.com/afs/2011/webprogram/Paper4381.html
- 証拠: [B] "The model includes a number of unrealistic assumptions about prey detection and capture, and swimming costs."
- 第3版の追加（#A13）: 同じ総説関連発表の要旨が、**Hughes ら (2003, CJFAS) による最先端モデルの検証で、総エネルギー獲得が約 2 倍過大評価された**こと、それが「魚の成長と生息場所選択の正確な予測に重大な含意を持つ」ことを述べる（B）。出典候補: https://afs.confex.com/afs/2011/webprogram/Paper4378.html ／ https://afs.confex.com/afs/2011/webprogram/Paper4385.html ／ https://afs.confex.com/afs/2011/webprogram/Paper4379.html（どの文がどの要旨かは特定不能）。Paper4378 は「ドリフトするデブリがドリフト捕食魚と採餌モデルに与える影響」。
- 実装への含意: NEI の式を厳密に実装する必要は無く、**傾向（遅い定位点＋近傍の速い流れ＋被覆）を再現する簡略スコア**で十分、と位置づける（設計案）。第3版: 絶対値は約 2 倍ずれうるので、**定位点どうしの相対順位づけにだけ使う**。

### F-37 感覚の簡略化に使える数値（視野・側線）
- 主張/値:
  - **視野**: 釣り解説は「トラウトは水中で**水平方向 330°**の視野があり、真後ろに **30°** の死角がある」「死角は鼻先のすぐ前と尾の後方」「両眼で見える範囲があり、そこでは視力が良い」と述べる。**一般向け解説であり、種（ニジマス／ブラウントラウト／ヤマメ）と測定法は不明**。サケ科の視野角・両眼視野・網膜神経節細胞の密度・視力（cycles/degree）の査読値は、検索では得られなかった（他の魚種の例: 南極のノトセニア類 3.64 と 4.77 cycles/degree、マンボウ 3.37〜4.41 cycles/degree。PROXY で参考にならない）。
  - **側線**: 側線系の作動範囲は**1〜2 体長**と報告され、**源の位置と形は約 1 体長の範囲で決められる**。捕食魚は、1〜2 体長離れた獲物の双極子場を側線だけで測って位置を特定し、攻撃できる。ウェーブレット変換で、体長程度の距離の双極子源を再構成できる。**サケ科の側線の感知距離・閾値の実測は得られなかった**。
- 適用範囲: 視野＝釣り解説（C、種不明）。側線＝ゴールドフィッシュ等の実験・理論の要約（PROXY、A/B）。
- 出典: https://www.flyfisherman.com/editorial/how-trout-see/454967 ／ https://www.hatchmag.com/articles/can-fish-see-directly-behind-them/7716172 （視野の出所の候補。どの文がどの資料かは特定不能）／ https://cob.silverchair.com/jeb/article-split/209/8/1548/16661/Source-location-encoding-in-the-fish-lateral-line ／ https://pub.uni-bielefeld.de/record/1998965 ／ https://archive.aps.org/mar/2010/v10/8 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC2854557
- 証拠: [C]（視野）"Trout have a 330 degree horizontal vision beneath the water, leaving a 30 degree blind spot directly behind them." ／ [A/B・PROXY]（側線）"The operating range of the lateral line system has been reported to be one to two body lengths."
- 第3版の追加（#A11, #A12。結果は乏しい）:
  - **視力・視野の査読値は再び得られなかった**。出たのは、ゼブラフィッシュ幼生の視力、サケ科の網膜の錐体分布（Pacific salmonid の成熟個体、題名「Cone photoreceptor topography in the retina of sexually mature Pacific salmonid fishes」、https://pubmed.ncbi.nlm.nih.gov/9184985/ 、内容は未取得）、フライフィッシング解説（C）。解説サイトの記述として「光受容器は網膜の下部に密で、上方視の解像度が最大」「焦点が最もシャープなのは口の前 2〜3 インチ」「動きとコントラストの検出に優れる」があるが、**どのサイトのどの文か特定できず、査読根拠も無い（C）**。https://www.sexyloops.com/articles/whatsalmonidssee.shtml ／ https://www.seatrout-fishing.com/salmonid-vision.htm
  - **側線**: 側線の管系は圧力勾配を検出し、感覚網の配置と相関する圧力変動がニジマスの高精度モデルで測られた（Ristroph, Liao & Zhang 2015, Phys. Rev. Lett. 114:018102、A・PROXY）。側線は流速（表在神経丘）と加速度（管器官）を検出し、rheotaxis・被食回避・摂餌・群れに関与する（一般的な要約、B）。**サケ科の側線の感知距離・閾値の数値は #A11 でも得られなかった**。Liao (2006) J. Exp. Biol. 209:4077「The role of the lateral line and vision on body …」（検索結果の題名は途中で切れている。続きは記憶で「…kinematics and hydrodynamic preference of rainbow trout in turbulent flow」、M）の全文 PDF の URL（https://cob.silverchair.com/jeb/article-pdf/209/20/4077/1257217/4077.pdf ）は索引にあるが、**要約に数値は出なかった**。https://link.aps.org/doi/10.1103/PhysRevLett.114.018102
- 実装への含意（設計案）: 視覚＝水平 330°（死角 30°）を**仮の既定**として調整可能にし、「根拠は釣り解説のみ、種不明」と明記する。側線＝全方位・1〜2 体長の「動く物」検出（PROXY）。反応距離は F-21 の幅のまま調整可能。

### F-38 ドリフト捕食魚の3Dステレオ映像研究（存在の確認のみ）
- 主張/値: 野外のステレオ映像から、**魚と摂餌イベントの3次元位置を細かい時空間スケールで抽出する手法**が、縄張り性のブラウントラウトと非縄張り性のカワヒメマス類（roundhead galaxiid）の幼魚で検証された（Otago 大学）。ドリフト捕食魚の細かい空間利用は、エネルギー的なトレードオフに支えられ、位置取りが適応度にとって決定的、とされる。水槽でコホ幼魚の摂餌を撮影し、**反応場（reaction field）の3次元形状と探索体積の断面積**を推定した研究もある。**迎撃距離・復帰時間・定位点の流速などの数値は要約に無く、未取得**。
- 適用範囲: ブラウントラウト（NZ）、roundhead galaxiid、coho（水槽）。ヤマメではない。
- 出典: https://ourarchive.otago.ac.nz/esploro/outputs/journalArticle/Quantification-and-comparison-of-individual-space-use/9926516484401891 ／ https://www.sfu.ca/biology/faculty/dill/publications/f84-139.pdf （反応場の研究の候補。特定不能）
- 証拠: [B] "Digital imaging techniques have been used to manually extract the spatial position of fish and feeding events in three dimensions (3D) at fine spatiotemporal scales from in situ stereo-video footages."
- 実装への含意: 「反応場は球ではなく3次元形状を持つ」ことの示唆程度。ヤマメの迎撃の幾何は Gap。

### F-39 警戒距離（FID）: サケ科の数値は見つからず
- 主張/値: トラウト（ブラウン、ニジマス等）が人や捕食者の接近で逃げ始める距離（cm）を測った研究は、**検索（4つの下位検索）では見つからなかった**。魚一般の FID では**体のサイズと正の相関**があるという要約があるのみ（出典論文は特定不能）。野生と養殖のブラウントラウトで捕食者回避の行動が違う研究（経験と家畜化の役割）の題名が出たが、数値は無い。
- 適用範囲: 魚一般（PROXY 以前の問題として、サケ科の数値が無い）。
- 出典: https://blumsteinlab.eeb.ucla.edu/wp-content/uploads/sites/104/2019/09/Samia_etal_2019_FishFisheries.pdf （魚類 FID の総説の候補。内容は未確認）／ https://portalinvestigacion.uniovi.es/documentos/5e78c79f2999521b3d11d4b7
- 証拠: [C] "individual fish size was strongly and positively correlated with FID."
- 第3版の追加（#A22）: トラウトの FID を直接測った資料は**2回目の検索でも得られなかった**。出たのは、ブラウントラウト／ニジマスが導入された河川の**被食側の魚（darter 類）**の FID（トラウトがいる川で長い）と、サンゴ礁魚の FID の観察者・保護区の効果で、**サケ科の警戒距離ではない**（PROXY ですらない）。https://bearworks.missouristate.edu/articles-cnas/3287 ／ https://researchonline.jcu.edu.au/24518
- 実装への含意: 警戒距離は「体長に比例させる」調整値にするのが妥当だが、**係数は根拠なし**。

### Part D — 第3版で追加した所見（今回の検索 23 回）

### F-40 低速の定位・徘徊時の尾鰭打数と、速度に対する尾鰭周波数・振幅（PROXY: ブラウントラウト、大西洋サケ）
- 主張/値:
  - **ブラウントラウト（湖＝loch に生息、自由遊泳、超音波テレメトリ）**: 低速の定位（station-holding）行動で、**尾鰭打数が 2.5 回/s（≒ 体長 1 倍/s の速度に相当）を超えることはほとんど無く、「好む」打数は 1.0〜2.0 回/s**。したがって酸素負債を生む速度でほとんど泳がない。
  - **大西洋サケ（段階増速試験）の要約**: 尾鰭打数（TBF）は遊泳速度とともに**線形**に増える。**相対尾鰭振幅（TBA）は遊泳速度とともにべき関数で増え**、高速では振幅と周波数の両方を変え、**低速では振幅の調整は小さな役割**。ブラウントラウトの遊泳速度は尾鰭打数と相関し、その関係は体長に依存して、5 Hz を超える領域で独特の性質がある、という要約もある。
- 適用範囲: ブラウントラウト（湖のローホ、PROXY）。大西洋サケ（PROXY）。体サイズ、水温、サンプル数は要約に無い。河川のヤマメ成魚の低速遊泳の実測ではない。
- 出典: Ross L., Watts W., Young A.H. (1981) J. Fish Biol.「ultrasonic biotelemetry system for monitoring tail-beat rate from free-swimming loch-dwelling brown trout (Salmo trutta L.)」（題名は検索要約の記述。巻頁は未取得）。出典URLの候補（どの文がどの資料かは特定不能）: https://stir.ac.uk/research/hub/publication/653604 ／ https://link.springer.com/10.1186/s40317-023-00324-3 ／ https://imr.brage.unit.no/imr-xmlui/handle/11250/3087899?show=full ／ https://www.kmae-journal.org/articles/kmae/pdf/2002/04/kmae2002364s28.pdf ／ https://cob.silverchair.com/jeb/article-split/55/2/489/21667/The-Swimming-Energetics-of-TroutI-Thrust-and-Power
- 証拠: [A（PROXY）] "tail beat rates rarely exceeded 2.5 tail-beats per second (TB/s) corresponding to a velocity of 1 body length per second ... 'preferred' tail-beat rate of 1.0-2.0 TB/s"（#A21）／ [B（出典特定不能）] "tail beat frequency (TBF) increased linearly with swimming speed ... relative tail beat amplitude increased with swimming speed as a power function"（#A18）
- 実装への含意（設計案）: 定位・徘徊の体波周波数の既定は 1〜2.5 Hz（PROXY）。これとヤマメ稚魚の高速側 20.8〜39.1 Hz（F-13）の間は、**線形補間**で埋める案（f は速度に線形に増える、という要約に沿う）。**振幅は F-12 の「速度に依存しない尾端振幅」と食い違う**（§3-16）ので、尾端振幅は低速で小さく、速度とともに増える形を既定にし、F-12 の定数振幅は高速域の上限とする、という折衷を調整可能にする。成魚の係数は Gap。

### F-41 捕食者モデルへの反応: 摂餌率の低下と移動率の増加（PROXY: 大西洋サケ）
- 主張/値: 野外で**カワアイサ（common merganser）のモデル**に曝露する前後で、大西洋サケの(1)細かい底質の fry、(2)粗い底質の fry、(3)粗い底質の parr の活動を比べた。曝露後、**摂餌率は 25〜39% 低下し、移動率は 123〜386% 増加**。底質の粒径が即時の反応の型に、体サイズが移動反応の強さに影響した。
- 適用範囲: 大西洋サケ fry／parr（PROXY）。野外の人工模型。**復帰時間（摂餌が元に戻るまでの時間）、逃避距離、隠れ場所に入る割合は要約に無く、未取得**。猛禽・鳥類捕食者の総説（USGS）、日本生態学会第65回大会の要旨（https://esj.ne.jp/meeting/abst/65/H02-01.html 、内容未確認）も出たが数値は無い。
- 出典: Dionne M., Dodson J.J. (2002)（検索結果の PDF 名 Dionne.2002.pdf。誌名・巻頁は要約に無く未取得）。https://www.bio.ulaval.ca/labdodson/Papers%20Julian/Dionne.2002.pdf ／ https://www.usgs.gov/publications/a-review-factors-affecting-susceptibility-juvenile-salmonids-avian-predation
- 証拠: [A（PROXY）] "the feeding rate of juvenile salmon decreased by 25–39% and the moving rate increased by 123–386%"（#A17）
- 実装への含意（設計案）: 警戒状態（F-02 の F 相当が高い）では、迎撃（摂餌）の頻度を下げ、定位点の移動（徘徊）を増やす。比率は上記の幅を参考にできるが、ヤマメへの適用は検証されていない。

### F-42 ドリフト捕食の打撃の内訳: 吐き出し・目視のみ・摂取（PROXY: アラスカのキングサーモン幼魚）
- 主張/値: 追跡された餌候補のうち、**52% は捕獲されたがすぐ口から吐き出され、39% は目視で調べたが捕獲されず、摂取されたのは 9% のみ**。デブリ（非食物）の取り扱いに使った時間は、観察群で採餌時間全体の **4〜25%** で、採餌試行率とともに線形に増えた。採餌試行率と摂取率の相関は中程度（Kendall の τ = 0.55）。別研究（ブルックトラウトの当歳魚）は、捕獲された餌の **46% のみが摂取**されたと述べる。
- 適用範囲: キングサーモン幼魚（アラスカの清澄な河川、PROXY）、ブルックトラウト当歳魚（PROXY）。ヤマメの値は無い。
- 出典: 「Mechanisms of drift-feeding behavior in juvenile Chinook salmon and the role of inedible debris in a clear-water Alaskan stream」。https://www.usgs.gov/publications/mechanisms-drift-feeding-behavior-juvenile-chinook-salmon-and-role-inedible-debris-a ／ https://catalog.epscor.alaska.edu/es_AR/dataset/mechanisms-of-drift-feeding-behavior-in-juvenile-chinook-salmon-and-the-role-of-inedible-debris-in-a ／ https://pubs.usgs.gov/publication/70060527 ／ ブルックトラウトの記述の出典は特定不能（https://harkness.ca/PDFs/Contributions%201990s/Biro%20Ridgway%20McLaughlin%201996.pdf の可能性あり。未確認）。
- 証拠: [B（要約）] "Among all potential food items fish pursued, 52% were captured and quickly expelled from the mouth, 39% were visually inspected but not captured, and only 9% were ingested."（#A23）
- 実装への含意（設計案）: 迎撃のサブ状態に「接近 → 口を開く → 吐き出し／摂取 → 復帰」を持たせ、**口を開いても必ず摂取とは限らない**ことを表現できる。割合は PROXY で、ヤマメの既定にはしない。また、F-19 の「待機 81%：採餌 14%」は出典不明（C）なので、採餌の頻度の根拠は引き続き Gap。

### F-43 体波の進行波の条件と、ロボット魚（Barrett ら 1999）
- 主張/値: 長さ 1.2 m の魚型ロボット（柔軟な外皮、尾鰭付き、Re は最大 10^6、乱流促進あり）の実験で、**能動的に泳ぐ流線形の魚型体を推進する動力は、同じ速度で直線の剛体を曳く動力より有意に小さい**。**体の横方向の運動は、波長 λ と、前から尾へ滑らかに増える振幅を持つ進行波**。抗力低減の感度は、無次元周波数（ストローハル数）、体の振動振幅、波長 λ、尾鰭の迎え角と位相角に対して調べられた。**抗力低減の必要条件は、体波の位相速度が前進速度より大きいこと**。
- 適用範囲: ロボット魚の実験（PROXY）。生きたヤマメの測定ではない。**振幅包絡の具体式は、今回の検索（#A9）でも要約に出ず、未確認**。
- 出典: Barrett D.S. ほか (1999) "Drag reduction in fish-like locomotion", J. Fluid Mech. 392:183–212（検索要約は題名・誌名・巻頁と第一著者 D.S. Barrett を示す。共著者は検索結果に明示が無く、記憶では M.S. Triantafyllou ら＝M）。https://dspace.mit.edu/handle/1721.1/25618 ／ https://openaccess.library.uitm.edu.my/Record/mit_25618
- 証拠: [A（PROXY）] "A necessary condition for drag reduction is that the phase speed of the body wave be greater than the forward speed." ／ "The lateral motion of the body is in the form of a travelling wave with wavelength lambda and varying amplitude along the length, smoothly increasing from the front to the tail end"
- 実装への含意（設計案）: 体波の位相速度 = λ·f（λ ≈ 0.9 L、F-12）が前進速度を上回るように f と速度を対応づける。これは F-16（Kármán gait）の「体波の速度は流速より約 25% 速い」とも矛盾しない（ただし F-16 は後流中の特殊な歩容で、同列の比較ではない）。F-12 の「A(x)/L = 0.02 − 0.0825x + 0.1625x²」は、記憶（M）ではこの論文（RoboTuna）の包絡式と同形に見えるが、**今回の検索では確認できなかった**ので、出所は r08 の算出（サイス 3 点）のまま扱う。

### F-44 ゲームの野生動物 AI の「欲求ベース」実装例（二次資料）
- 主張/値: ゲーム開発者向けの二次資料や MOD ページは、動物 AI を**欲求（hunger、thirst、energy など）の変数で駆動する「needs-based AI」**で作る例を述べる。Unreal Engine の Ecosystem AI パックは、動物が採餌・狩り・睡眠・探索を行い、飲水・摂食・闘争／逃走の挙動を持つ。Subnautica 2 の MOD「Deep Ecosystem」は、「全ての生き物が hunger、energy、fear を持ち、飢えたら狩り、大きな捕食者から逃げ、疲れたら休む」と説明する。
- 適用範囲: ファン MOD、マーケットプレイスの商品説明、フォーラム（C）。開発元の一次資料ではない。Tu & Terzopoulos の H・L・F に似た変数が現代のゲーム MOD でも使われる、という確認程度。
- 出典: https://www.curseforge.com/subnautica-2/ue4ss-mods/deep-ecosystem ／ https://www.unrealengine.com/marketplace/en-US/product/ecosystem-ai ／ https://forum.terasology.org/threads/ideas-behind-implementing-animals-with-ai-in-terasology-part-1.1725/latest
- 証拠: [C] "Every creature has its own hunger, energy and fear, and acts on these attributes by hunting when starving, fleeing from larger predators, and resting when exhausted."（#A15）
- 実装への含意: 欲求ベース（連続値の状態変数＋閾値）という設計が、人工魚（F-02）とゲームの双方に見られる、という程度の裏付け。ヤマメの状態変数（警戒・空腹・縄張り刺激）にそのまま使える（設計案）。

---

## 3. 資料間の矛盾・不一致

1. **視野角**: Tu & Terzopoulos の人工魚は 300°（CG の設定値）、釣り解説は水平 330°（死角 30°）。記憶の「ほぼ全周」は M。いずれもヤマメの実測ではなく、方法も違う（F-04, F-37）。**既定値を決める根拠は無い**。
2. **Subnautica の記述の信頼性**: 検索で得たのは Subnautica 2（UE5）の「行動ツリー＋刺激システム」の記述で、出典の一部はファン wiki の履歴ページ。初代 Subnautica（Unity）は別のエンジン・別の実装で、同じとみなせない。初版の記憶「creature action を優先度で評価」も未確認（F-09）。
3. **F.E.A.R. の AI**: 検索要約の一つは「Killzone 2 と F.E.A.R. は Utility Tree を使う」と書くが、私の記憶（M）は F.E.A.R. = GOAP（Orkin 2006）。**未解決**。仕様書で F.E.A.R. に言及する場合は避けるか、検証してから使う（F-08）。
4. **サメの AI とヤマメ**: Sea of Thieves のサメは「止まれない」設計で、小さな方向修正を繰り返す。ヤマメは流れの中で定位してその場に留まる（r11、F-19）ので、**同じ動きを当てはめると定位が揺れる**。流用できるのは旋回率上限・旋回前の減速・円弧の考え方（F-09）。
5. **旋回のモデルが別物**: (a) 人工魚: 前部の筋の非対称収縮、(b) Gates: 背骨の角度の指定（急発進は L 字）、(c) ダニオ: 曲率のパルス、(d) ロボット: 波形オフセット、(e) ニジマス（Goldbogen）: 曲率の位相は筋から遅れる。どれも「旋回」を指すが、通常旋回か急発進か、実魚かモデルかが違い、**同じ軸で比較できない**（F-03, F-17, F-30, F-31）。
6. **ABZÛ の評価**: 「boids の最も深い実装」は二次資料の評価で、開発者の技術講演（GDC）は美術面中心。両者は食い違うのではなく、**技術面の一次資料が得られていない**（F-09）。
7. **反応距離と流速**: coho／steelhead 幼魚（水槽）では流速の増加で検出距離が有意に低下（Piccolo ら 2008、A）、ニジマス・北極グレイリングの学位論文では反応距離への影響は「ほとんど／全く無い」（B）。種・水槽／野外・学位論文か査読論文かが違う。**既定を決められない**（F-20）。inSTREAM は反応距離から捕獲面積を算出し、流速や濁度の影響を入れる（F-06）が、係数は未取得。
8. **迎撃の向きと速度**: 継承した要約（C）は「餌の約 2/3 は定位点より下流側で捕獲、迎撃速度は期待された最大持続遊泳速度より遅い」。一方、Piccolo ら 2008（A、PROXY）は「全流速で最大持続遊泳速度で迎撃」。前者は出典論文が特定不能で、実験設定も違う（F-19, F-20）。
9. **反応距離の桁**: キングサーモン幼魚の平均 32.7 cm とカットスロートの最大 187.1 cm では約6倍の差。魚種、サイズ、光条件、平均か最大かが違い、単純比較できない（F-21）。
10. **体波の振幅包絡**: サイスの 3 点値から作った二次式（最小は x ≈ 0.25 L）と、要約本文の「最小は 0.1 L、そこからほぼ直線的に増える」が一致しない。振幅が片振幅か peak-to-peak かも資料間で不明。尾端振幅 0.12（ヤマメ稚魚、振幅/全長）、0.17 L（ニジマスのバースト）、0.2 L（一般則）の関係は、定義が揃わず比較できない（F-12, F-13）。
11. **流速の値の混在**: 生息流速 10〜35 cm/s（環境省、B）、登川の幼魚の秋 43.4 ± 23.1 cm/s と冬約 20 cm/s（A）、稚魚の定位点 5 cm/s（計測限界）と区間平均 37 cm/s は、焦点流速・利用場所の平均流速・区間平均流速が混在している（F-22）。
12. **Kármán gait の流速範囲**: 出現確率が最大の流速 30〜70 cm/s（ニジマス）は、ヤマメの生息流速 10〜35 cm/s（B）の上限付近より速い（F-16）。
13. **群れの扱い**: Reynolds の boids は群れの結合・整列を前提にするが、ヤマメ幼魚は縄張り性で順位制（A）。水槽写真は同方向を向く個体が多いが、水槽は高密度（P）で根拠にならない（F-05, F-23, F-28）。ABZÛ の魚は群れ（ヤマメの参考にならない）。
14. **日周**: 釣り情報、県資料、PROXY（冬は夜行性）、サクラマス稚魚の移動は、種・ステージ・季節が違い、同じ軸の比較ではない（F-24）。
15. **書誌の信頼度**: Part A のうち検索で裏付けた書誌（Tu & Terzopoulos の SIGGRAPH '94、Reynolds 1987・1999、Railsback & Harvey 2002 の Ecology 83(7):1817–1830、Hughes & Dill 1990 の CJFAS 47:2039–2048、Dill & Mark GDC 2010、Isla GDC 2005）と、**検索で裏付けていない書誌**（Fausch 1984 の頁、Hughes 1998、Railsback ら 1999 の頁、Orkin 2006、Mark 2009 の書籍、Colledanchise & Ögren 2018）は区別すること。後者は F-07・F-08 で M と明示した。r08 で Bainbridge 1958 の頁が検索結果と食い違った前例がある。
16. **（第3版）尾端振幅と速度**: F-12 はニジマスで「尾端振幅は遊泳速度に依存しない」（Webb ら 1984）と書くが、F-40 の大西洋サケの要約は「相対尾鰭振幅は速度とともにべき関数で増え、低速では振幅の調整は小さな役割」と書く。魚種（ニジマス／大西洋サケ）、サイズ範囲、速度域、振幅の定義が違い、**解消できない**。後者は出典論文を特定できていない（B）。ヤマメ稚魚は振幅/全長 ≈ 0.12 でほぼ一定（F-13、A）で、前者に近い。既定は「高速域で一定、低速域は小さく」の折衷を調整可能にする。
17. **（第3版）NEI の評価**: Hughes ら (2003) は最先端のドリフト捕食モデルが総エネルギー獲得を約 2 倍過大評価したと述べる（F-07, F-36）。一方 Urabe ら (2010) は北海道の渓流でモデル由来の NEI が現存量と密接に関連したと述べる（F-35）。**前者は絶対値の誤差、後者は相対的な指標としての有効性**で、両立しうる。ただし種（ブラウントラウト／サケ科の混成）・場所・検証指標が違う。
18. **（第3版）人工魚論文の著者順と巻頁**: #A20 の要約は「Xiaoyuan Tu, Demetri Terzopoulos, and Radek Grzeszczuk」の順で、題名を「Artificial Fishes: Autonomous Locomotion, Perception, Behavior, and Learning in a Simulated Physical World」（Artificial Life）と示す。私の記憶（M）は「Terzopoulos, Tu & Grzeszczuk (1994) Artificial Life 1(4):327–351」。**著者順と巻頁は未解決**。仕様書では題名と年のみを使う。
19. **（第3版）Howe & Astley (2021) の2本**: 検索結果には同年 Bioinspiration & Biomimetics の2本（体高の影響／制御方式別の旋回性能の比較）が出た。パルス・C-start・波形オフセットの比較に当たるのは後者と**推定**したが、要約に内容が無く確定できない（F-31）。

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル／アニメ／行動実装に必要だが確認できなかった事項

**A. 本版の検索でも取得できなかった課題の中核**
1. **Tu & Terzopoulos の閾値と数値**: 意図生成器の閾値の値、障害物回避を含む全体の優先順位、意図の保持の仕組み、バネ定数、運動制御器の筋の駆動式、視覚の「遮蔽」「注意の焦点」の実装（要約に無い。論文 PDF の URL は得たが本文は読めない）。**第3版（#A4）で「全変数が閾値以下なら wander」「知覚フィルタ」は確認したが、閾値の値と意図の保持は依然として未取得。**
2. **inSTREAM の数式と係数**: 期待成熟度の定義式（時間軸、生存の項）、反応距離・捕獲成功率・遊泳コストの式、移動半径のロジスティック関数の係数、個体の処理順（体長順か）。
3. **ドリフト捕食モデルの式**（Hughes & Dill 1990 の捕獲確率・追跡距離・遊泳コストの式、Hughes ら 2003 の3次元映像の結果＝迎撃距離・復帰時間・定位点の流速）。要約に数値が無かった。**第3版（#A1, #A2, #A13）でも式と迎撃距離・復帰時間は得られず、得たのは「総エネルギー獲得を約 2 倍過大評価」の一文のみ。** 式を本文で読むには、検索ではなく論文全文が必要。
4. **ゲームの魚AI・遊泳アニメの技術的一次資料**: 初代 Subnautica（Unity）の creature AI、ABZÛ の魚シミュレーションの技術講演、Sea of Thieves の魚（サメ以外）のアニメ。Sea of Thieves のサメの AI の記事は得た（F-09）が、アニメ（体波）の実装は未取得。
5. **Utility AI の実装細部**: 応答曲線の形の選び方、Momentum Bonus の倍率やヒステリシスのマージンの標準値。講演資料の本文は読めていない。（第3版: 方式の存在は #A7 で確認、B/C。値は未取得）
6. **手続き的魚アニメの査読論文・数式**: Gates (2001) の数式（振幅包絡、旋回、急発進の角度）、曲率パルスの振幅・幅・速度の数値（ダニオ。第3版 #A6 でも得られず）、スプライン／ミッドラインの長さ保存の実装、**Three.js での実例（第3版 #A8 で検索したが、出たのは Godot の頂点シェーダ解説と Unity のボーン＋サイン波のみで、Three.js の実例は見つからなかった）**。RoboTuna 論文（Barrett ら 1999）の振幅包絡の具体式は #A9 でも要約に出ず未確認（F-43）。
7. **LOD AI の具体的な頻度・距離の数値**。（第3版 #A16: UE Mass の LOD は4段階・段階ごとの距離と tick rate を設定できる枠組みの説明のみで、既定値は未取得）
8. **感覚モデルの数値**: サケ科の視野（各眼の水平・鉛直、両眼視野の重なり角）、視力、瞳孔動態、側線の感知距離と閾値。視野は釣り解説の 330°/30°（C）のみ。（第3版 #A11, #A12 でも査読値は得られず）
9. **FID（警戒距離）、逃避速度、再出現時間**（サケ科）。（第3版 #A17, #A22 でも得られず。#A17 は大西洋サケの摂餌率・移動率の変化率のみ、F-41）

**B. 継承した Gap（先行ストリームから引き継ぎ、本ストリームでも未解決）**
10. ヤマメ**成魚**（15〜30 cm）の遊泳キネマティクス（f–U 関係、尾端振幅、波長、波速）。ヤマメ稚魚の f–U 実験式の式そのもの（未取得）。
11. 振幅包絡の係数（Di Santo ら 2021 の a0, a1, a2 の代表値、サケ科の値）、頭部のヨー振幅。
12. 低速（定位・徘徊）時の尾鰭振動数・振幅、定位時の微小動作。（第3版: 振動数だけ PROXY の幅が得られた＝ブラウントラウト 1.0〜2.5 回/s、F-40。**ヤマメ**の値、振幅、胸鰭・体の微小動作は未取得）
13. 反応距離・追跡距離・迎撃距離・復帰時間（ヤマメ）、ストライクの時間経過。
14. 縄張り行動（追い払いの型、頻度、距離）、ライズ（水面摂餌）の運動学。（第3版: #A10（英語、サケ科幼魚の agonistic behavior）と #A19（日本語、サクラマス・ヤマメ幼魚）で検索したが、コホ幼魚の agonistic behavior を Strikes／Chases／Approaches に分けて数える方法と、「条件（紫外線曝露）によって strike・chase が増え、approach が減る傾向」「ブルックトラウトとコホは4種のうち最も攻撃的でも縄張り性でもなかった」程度の定性的記述のみ（出典は https://dspace.library.uvic.ca/items/92dbbc99-68e5-4bc5-92fe-2d200086b7b3 と https://www.sfu.ca/biology/faculty/dill/publications/f85-213.pdf が候補。どの文かは特定不能）で、頻度（回/分）・距離の数値は無く、日本語はサケマスの生態一般の資料ばかりだった。ライズの運動学は第3版では検索していない）
15. 高速スタートの C 型／S 型の頻度、ヤマメ parr のサイズ依存。
16. サケ科の自然な遊泳でのバースト＆コーストの頻度。
17. 乱流・浅い礫底の渓流での定位保持（entraining／Kármán gait の渓流での出現）。

**C. 再開時に使う検索クエリの候補（検索予算が戻った場合）。第3版で試して成果が無かったものは「試行済」と書いた。**
- 試行済（式・数値は出ず）: Hughes & Dill 1990 の捕獲確率式（#A1）、Hughes ら 2003 の迎撃距離・復帰時間（#A2, #A13）、inSTREAM の EM の時間軸・移動半径係数（#A3）、Howe 2021 のパルスの数値（#A6）、Barrett 1999 の包絡式（#A9）、サケ科の視力・視野（#A12）、側線の感知距離（#A11）、サケ科の FID（#A22）、ヤマメ幼魚の攻撃頻度（#A19）。同じ語句で再検索しても出ない公算が高い。
- 未試行（第3版では予算の都合で実行せず。第2版でも未実行または失敗）:
  - `Gates "Animation of Fish Swimming" amplitude envelope equation rapid start backbone angle`（第2版 #12・#13 で要約のみ）
  - `GDC Vault Subnautica creature AI` ／ `ABZU shoaling simulation technical GPU boids Giant Squid`（第2版 #15〜#18 で二次資料のみ）
  - `trout surface feeding rise ascent angle speed strike kinematics video`（ライズの運動学）
  - `Dionne Dodson 2002 simulated avian predator Atlantic salmon parr feeding resumed minutes after exposure`（復帰時間）
  - `Ross Watts Young 1981 Journal of Fish Biology tail-beat rate brown trout loch telemetry swimming speed`（F-40 の出典特定と速度との関係式）
  - `Railsback Harvey Jackson Lamberson 2009 inSTREAM reactive distance capture success equation maximum swimming speed formula`（モデル記述 PDF の本文を狙う）

---

## 5. 出典一覧（URL付き、重複排除。すべて検索結果に出たURL）

**本版（第2版）で検索結果に出たURL**
- Tu & Terzopoulos: https://education.siggraph.org/static/HyperGraph/animation/art_life/fish.htm ／ https://history.siggraph.org/?p=119677 ／ https://www.cs.princeton.edu/courses/archive/spr15/cos426/papers/Tu94.pdf ／ https://graphics.stanford.edu/courses/cs348c-95-fall/reader/artificial/ ／ https://history.siggraph.org/?p=118720 ／ https://www.cs.rochester.edu/u/brown/Videre/001/articles/v1n1001.pdf ／ https://web.cs.ucla.edu/~dt/animat-vision ／ https://web.cs.ucla.edu/~dt/papers/ylem02/ylem01.htm
- Reynolds: https://www.cs.princeton.edu/courses/archive/spr01/cs598b/papers/reynolds87.pdf ／ https://my.eng.utah.edu/~cs6665/Reynolds-1987-FHS.pdf ／ https://www.cs.toronto.edu/~dt/siggraph97-course/cwr87 ／ `https://ics-websites.science.uu.nl/docs/vakken/mcrws/papers_new/Reynolds - 1999 - Steering behaviors for autonomous characters.pdf`
- inSTREAM／IBM: https://research.fs.usda.gov/treesearch/33521 ／ https://research.fs.usda.gov/download/treesearch/33521.pdf ／ https://humboldt.edu/sites/default/files/ecological-modeling/2024-09/instream5-0modeldescription.pdf ／ https://humboldt.edu/sites/default/files/ecological-modeling/2024-09/instream6-1modeldescription.pdf ／ https://www.humboldt.edu/sites/default/files/ecological-modeling/2024-09/instream73userman2023-07-07.pdf ／ https://ecomodel.humboldt.edu/instream-and-insalmo-overview ／ https://catalog.comses.net/publications/9071 ／ https://research.fs.usda.gov/treesearch/7905
- ドリフト捕食: https://afs.confex.com/afs/2011/webprogram/Paper4379.html ／ https://afs.confex.com/afs/2011/webprogram/Paper4381.html ／ https://afs.confex.com/afs/2011/webprogram/Paper4385.html ／ https://catalog.comses.net/publications/87172 ／ https://informahealthcare.com/doi/full/10.1577/T09-210.1 ／ https://ourarchive.otago.ac.nz/esploro/outputs/journalArticle/Quantification-and-comparison-of-individual-space-use/9926516484401891
- 手続き的アニメ: https://www.cs.ubc.ca/sites/default/files/tr/2001/TR-2001-19_0.pdf ／ https://cs.ubc.ca/tr/2001/tr-2001-19 ／ https://docs.godotengine.org/en/latest/tutorials/performance/vertex_animation/animating_thousands_of_fish.html ／ https://docs.godotengine.org/en/3.1/tutorials/3d/vertex_animation/animating_thousands_of_fish.html ／ https://sicb.org/?p=39861 ／ https://sicb.org/?p=8043 ／ https://sicb.org/?p=11086 ／ https://sicb.org/abstracts/midlines-in-motion-connecting-midline-curvature-dynamics-to-heading-change-and-center-of-mass-deflection-in-fishes ／ https://meetings-archive.aps.org/mar/2019/v64/3 ／ https://blogs.uakron.edu/astleylab/wp-content/uploads/sites/1471/2021/04/Howe_2021_Bioinspir._Biomim._.pdf ／ https://seamless3d.com/tut/worm_animation ／ https://toolchefs.atlassian.net/wiki/spaces/ASD/pages/1137770611/Joint+Spline+Animation ／ https://www.abratabia.com/game-animation/procedural-animation.php
- ゲーム: https://www.gamedeveloper.com/design/the-secrets-of-skeleton-and-shark-ai-in-sea-of-thieves-part-2-of-4- ／ https://www.gamedeveloper.com/programming/building-a-pirate-s-paradise-the-ai-of-sea-of-thieves-part-1- ／ https://www.gdcvault.com/play/1024409/Creating-the-Art-of-ABZ ／ https://gamedeveloper.com/art/video-creating-the-striking-underwater-seascapes-of-i-abzu-i- ／ https://www.audiokinetic.com/fr/blog/abzu_game_audio ／ https://www.pcgamesn.com/abzu/abzu-journey-developer-interview ／ https://imft.ftn.uns.ac.rs/wp-content/uploads/2025/12/07META2025.pdf ／ https://krafton.com/en/?p=42110 ／ https://thegameswiki.com/subnautica-2/wiki/creature-ai-and-behavior-trees/history/3f4f264e-7ffb-4654-89eb-e5f9126d0671
- ゲームAI: https://gdcvault.com/play/1012410/Improving-AI-Decision-Modeling-Through ／ https://www.gamedeveloper.com/design/gdc-2010-day-1-2-ascending-the-ai-summit ／ https://en.wikipedia.org/wiki/Utility_system ／ https://en.wikipedia.org/wiki/Behavior_tree_(artificial_intelligence,_robotics_and_control) ／ https://schedule.gdconf.com/session/game-ai-fireside-chat-with-damian-isla-and-jeff-orkin-celebrating-20-years-of-behavior-trees-and-automated-planning-systems/917672 ／ https://www.gamedeveloper.com/programming/behavior-trees-for-ai-how-they-work ／ https://opus.bibliothek.uni-augsburg.de/opus4/files/46021/46021.pdf ／ https://github.com/IsaacMulcahy/RPG-AI-SYSTEM-WIKI/wiki/Performance-Tuning ／ https://aischool.lillytechsystems.com/game-ai/best-practices.html ／ https://discussions.unity.com/t/ai-in-a-open-world-co-op-game/563086
- 感覚・FID: https://www.flyfisherman.com/editorial/how-trout-see/454967 ／ https://www.hatchmag.com/articles/can-fish-see-directly-behind-them/7716172 ／ https://cob.silverchair.com/jeb/article-split/209/8/1548/16661/Source-location-encoding-in-the-fish-lateral-line ／ https://pub.uni-bielefeld.de/record/1998965 ／ https://archive.aps.org/mar/2010/v10/8 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC2854557 ／ https://blumsteinlab.eeb.ucla.edu/wp-content/uploads/sites/104/2019/09/Samia_etal_2019_FishFisheries.pdf ／ https://portalinvestigacion.uniovi.es/documentos/5e78c79f2999521b3d11d4b7

**第3版で追加（今回の検索 #A1〜#A23 の結果に出たURL。使った文との対応は各 F を参照）**
- ドリフト捕食・inSTREAM: https://afs.confex.com/afs/2011/webprogram/Paper4378.html ／ https://afs.confex.com/afs/2011/webprogram/Session1758.html ／ https://par.nsf.gov/servlets/purl/10401633 ／ https://par.nsf.gov/biblio/10401631 ／ https://ouci.dntb.gov.ua/en/works/405O2N5l ／ https://catalog.comses.net/publications/70312 ／ https://research.fs.usda.gov/treesearch/7914 ／ https://research.fs.usda.gov/treesearch/69791 ／ https://archive.epa.gov/ncer/publications/web/pdf/lamberson.pdf ／ https://www.frontiersin.org/journals/ecology-and-evolution/articles/10.3389/fevo.2025.1494539/abstract
- 人工魚・Reynolds・ゲームAI: https://education.siggraph.hosting.acm.org/static/HyperGraph/animation/art_life/fish.htm ／ https://doi.org/10.1007/3-540-46593-6_7 ／ https://www.red3d.com/cwr/papers/1999/gdc99steer.pdf ／ https://www.red3d.com/cwr/steer/ ／ https://www.red3d.com/cwr/steer/PathFollow.html ／ https://www.red3d.com/cwr/steer/Wall.html ／ https://www.red3d.com/cwr/steer/LeaderFollow.html ／ https://www.red3d.com/cwr/steer/Unaligned.html ／ http://www.red3d.com/cwr/presentations/2016_UCSC_Steering_Behaviors.pdf ／ https://uintel-ecs.utilityworlds.com/Documentation/UtilityIntelligence/Decisions/ ／ https://uintel-go.utilityworlds.com/Documentation/UtilityIntelligence/Decisions/ ／ https://uintel-go.utilityworlds.com/Documentation/TipsAndTricks/Decisions/ ／ https://www.gbgames.com/2017/02/13/book-review-behavioral-mathematics-for-game-ai-by-dave-mark/ ／ https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-gameplay-in-unreal-engine ／ https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/MassSimulationVariableTickParameters ／ https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassLOD/FMassSimulationVariableTickParam- ／ https://bugnet.io/blog/how-to-fix-unreal-mass-entity-agents-not-advancing-when-off-screen ／ https://www.curseforge.com/subnautica-2/ue4ss-mods/deep-ecosystem ／ https://www.unrealengine.com/marketplace/en-US/product/ecosystem-ai ／ https://forum.terasology.org/threads/ideas-behind-implementing-animals-with-ai-in-terasology-part-1.1725/latest
- 手続き的アニメ・体波: https://dspace.mit.edu/handle/1721.1/25618 ／ https://openaccess.library.uitm.edu.my/Record/mit_25618 ／ https://doi.org/10.1088/1748-3190/abe7cc ／ https://doi.org/10.1088/1748-3190/ac33c1 ／ https://meetings.aps.org/Meeting/MAR19/Session/V64.3 ／ https://sicb.org/?p=18174 ／ https://itch.io/post/7316105 ／ https://docs.godotengine.org/en/4.6/tutorials/performance/vertex_animation/animating_thousands_of_fish.html
- 尾鰭打数・捕食者反応・採餌の内訳: https://stir.ac.uk/research/hub/publication/653604 ／ https://link.springer.com/10.1186/s40317-023-00324-3 ／ https://imr.brage.unit.no/imr-xmlui/handle/11250/3087899?show=full ／ https://www.kmae-journal.org/articles/kmae/pdf/2002/04/kmae2002364s28.pdf ／ https://cob.silverchair.com/jeb/article-split/55/2/489/21667/The-Swimming-Energetics-of-TroutI-Thrust-and-Power ／ https://www.bio.ulaval.ca/labdodson/Papers%20Julian/Dionne.2002.pdf ／ https://www.usgs.gov/publications/a-review-factors-affecting-susceptibility-juvenile-salmonids-avian-predation ／ https://esj.ne.jp/meeting/abst/65/H02-01.html ／ https://www.usgs.gov/publications/mechanisms-drift-feeding-behavior-juvenile-chinook-salmon-and-role-inedible-debris-a ／ https://pubs.usgs.gov/publication/70060527 ／ https://catalog.epscor.alaska.edu/es_AR/dataset/mechanisms-of-drift-feeding-behavior-in-juvenile-chinook-salmon-and-the-role-of-inedible-debris-in-a ／ https://harkness.ca/PDFs/Contributions%201990s/Biro%20Ridgway%20McLaughlin%201996.pdf
- 感覚・FID・縄張り: https://pubmed.ncbi.nlm.nih.gov/9184985/ ／ https://www.sexyloops.com/articles/whatsalmonidssee.shtml ／ https://www.seatrout-fishing.com/salmonid-vision.htm ／ https://link.aps.org/doi/10.1103/PhysRevLett.114.018102 ／ https://cob.silverchair.com/jeb/article-pdf/209/20/4077/1257217/4077.pdf ／ https://bearworks.missouristate.edu/articles-cnas/3287 ／ https://researchonline.jcu.edu.au/24518 ／ https://dspace.library.uvic.ca/items/92dbbc99-68e5-4bc5-92fe-2d200086b7b3 ／ https://www.sfu.ca/biology/faculty/dill/publications/f85-213.pdf

**書誌のみ（M・検索で未確認）**: Terzopoulos, Tu & Grzeszczuk (1994) Artificial Life 1(4):327–351（第3版 #A20 で題名「Artificial Fishes: Autonomous Locomotion, Perception, Behavior, and Learning in a Simulated Physical World」と誌名 Artificial Life は確認。著者順・巻頁は未解決、§3-18）; Railsback ら (1999) Ecological Modelling 123:73–89（第3版 #A5 で題名「Movement rules for individual-based models of stream fish」と著者・誌名・年は確認。巻頁は M）; Fausch (1984) Can. J. Zool. 62:441–451; Hughes (1998) Ecology 79:281–294; Orkin (2006) GDC; Mark (2009) 『Behavioral Mathematics for Game AI』（第3版 #A7 で書評ページの存在のみ確認）; Colledanchise & Ögren (2018)。Hughes ら (2003) CJFAS 60:1462–1476 は #A2 の要約で確認。

**継承した URL（先行ストリーム r07・r08・r09・r11 の検索結果。本版では再検索していない）**
- ドリフト捕食: https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river ／ https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream ／ https://cdnsciencepub.com/doi/10.1139/cjfas-2020-0398 ／ https://link.springer.com/article/10.1007/s10641-013-0187-6 ／ https://research.fs.usda.gov/treesearch/31556 ／ https://openscholar.uga.edu/record/3703/files/MerrittKieranMS.pdf ／ https://openscholar.uga.edu/record/20894/files/bozeman_bryan_b_201708_ms.pdf ／ https://openscholar.uga.edu/record/11698?ln=en ／ https://www.sfu.ca/biology/faculty/dill/publications/f84-139.pdf ／ https://www.sfu.ca/biology/faculty/dill/publications/z78-198.pdf
- 体波・定常遊泳: https://www.pnas.org/doi/10.1073/pnas.2113206118 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC8670443/ ／ https://journals.biologists.com/jeb/article/109/1/77/4184/The-Effect-of-Size-and-Swimming-Speed-on-Locomotor ／ https://journals.biologists.com/jeb/article/138/1/51/5554/Steady-Swimming-Kinematics-of-Tiger-Musky-an ／ https://journals.biologists.com/jeb/article/109/1/209/4156/Fast-Continuous-Swimming-of-Two-Pelagic-Predators ／ https://sicb.org/abstracts/kinematic-analysis-of-burst-and-coast-swimming-in-rainbow-trout/
- ヤマメ稚魚: https://www.jstage.jst.go.jp/article/jsidre/80/2/80_177/_article/-char/ja/ ／ https://www.jstage.jst.go.jp/article/jsidre/79/3/79_151/_article/-char/ja/
- 速度域: https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000054w7-att/bunryu-shiryo-13.pdf ／ https://www.jstage.jst.go.jp/article/jscej1984/1999/622/1999_622_107/_article/-char/ja/
- 胸鰭: https://journals.biologists.com/jeb/article/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout ／ https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding
- Kármán gait／entraining: https://journals.biologists.com/jeb/article/206/6/1059/14048/The-Ka-rma-n-gait-novel-body-kinematics-of-rainbow ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/ ／ https://journals.biologists.com/jeb/article/213/17/2976/9891/Entraining-in-trout-a-behavioural-and-hydrodynamic ／ https://pubmed.ncbi.nlm.nih.gov/15339945/
- 高速スタート: https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance ／ https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two ／ https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo ／ https://tethys.pnnl.gov/publications/kinematics-performance-fish-fast-start-swimming ／ https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity ／ https://pubmed.ncbi.nlm.nih.gov/15755891/ ／ https://pubmed.ncbi.nlm.nih.gov/10229693/
- バースト＆コースト: https://journals.biologists.com/jeb/article/97/1/169/34638/Energetic-advantages-of-burst-and-coast-swimming ／ https://journals.biologists.com/jeb/article/210/12/2181/16867/Kinematics-hydrodynamics-and-energetic-advantages
- 感覚（解剖）: https://link.springer.com/article/10.1007/s10228-021-00843-0 ／ https://pubmed.ncbi.nlm.nih.gov/17023602/
- 定位場所・順位・日周・警戒: https://link.springer.com/article/10.1007/s10228-010-0201-3 ／ https://www.env.go.jp/council/09water/y0910-03/mat03.pdf ／ https://catalog.lib.kyushu-u.ac.jp/opac_download_md/10879/p073.pdf ／ https://catalog.lib.kyushu-u.ac.jp/opac_download_md/23570/p173.pdf ／ https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol41.html ／ https://link.springer.com/article/10.1007/BF02678571 ／ https://sitesreservoirproject.riptideweb.com/references/REF23/Volume%202/App11M_Yolo_Sutter_Bypass_Weir_Spill_Analysis/Grant%20and%20Kramer_1990_Territory%20Size.pdf ／ https://pubs.usgs.gov/publication/70269370 ／ https://www.honda.co.jp/fishing/enjoy/season/season-201704/step-2/ ／ https://www.honda.co.jp/fishing/enjoy/season/season-202107/step-2/ ／ https://www.hro.or.jp/upload/41034/81-kawamura.pdf ／ https://theses.gla.ac.uk/id/eprint/75895 ／ https://www.pref.nagano.lg.jp/suisan/joho/sakanatachi/yamame.html ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3656933/ ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6634859 ／ https://vocal-communication.bio.bris.ac.uk/pdfs/Rapid_recovery.pdf

**ローカル資料**: /home/user/gerupamasini/docs/yamame/research/r07_eye_head_mouth.md、r08_swim_steady.md、r09_swim_transient.md、r11_ecology_jp.md（継承元）；/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json〜catalog_c07.json（F-28 の集計）。

---

## 6. 検索ログ（クエリ・mode・有用度、総検索回数）

**WebSearch 呼び出し回数: 第2版 34 回（当時の割当 40 回以内）＋ 第3版（今回）23 回（割当 28 回以内）。通算 57 回。全て mode=standard、extended 0 回。** 予算超過のエラー（"Web search was not performed"）は、第2版・第3版ともに発生しなかった。呼び出しによっては1回で複数の検索ブロックが返った（第2版: #8 は3ブロック、#12・#13 はそれぞれ複数、#22 は3ブロック、#23 は2ブロック、#32 は4ブロック。第3版: #A1 は3ブロック、#A2 は5ブロック）。ハーネス側のカウントが異なる場合は、こちらの回数より多い可能性がある（第3版は、ブロック数も含めた概算が 29 程度になった時点で、呼び出し 23 回で打ち切った）。

### 6.1 第2版の検索ログ（継承。#1〜#34）

有用度: 高=仕様に使える記述が得られた／中=概要・書誌の確認／低=関連は薄い／0=得られず。

| # | クエリ（要旨） | 結果 | 有用度 |
|---|---|---|---|
| 1 | Tu Terzopoulos Artificial Fishes 意図生成器・習慣・精神状態 | 習慣＝重みパターン、H/L/F、意図生成器の判定順 | 高 |
| 2 | artificial fish 23 nodes 91 springs 12 muscles 視野 300° | 300° 球面角・半径は水の透明度、水温センサ | 高 |
| 3 | artificial fish twelve muscles swim-MC left-turn-MC | 23質点・91バネ・12筋、3つの MC、前部筋で旋回 | 高 |
| 4 | artificial fish intention generator avoid 優先順位 | 8つの行動ルーチンの名称 | 高 |
| 5 | Reynolds Steering Behaviors 1999 GDC | 3レベル、操舵行動の例 | 中 |
| 6 | inSTREAM Railsback PSW-GTR-218 | 日ステップ、セル選択、書誌 | 中 |
| 7 | inSTREAM model description reactive distance movement radius（allowed_domains 指定） | 捕獲面積、期待成熟度、移動半径のロジスティック関数 | 高 |
| 8 | Hughes Dill 1990 position choice 書誌・モデル構成 | NEI の定義、書誌 | 中 |
| 9 | Hughes 2003 3D videography brown trout 結果の数値 | 数値なし（Otago の関連研究のみ） | 低 |
| 10 | procedural fish swimming animation spine bone chain vertex shader | Godot 公式の頂点シェーダ魚アニメ | 高 |
| 11 | procedural fish locomotion midline 旋回 曲率 | Gates 報告、曲率パルス・波形オフセット | 高 |
| 12 | "Animation of Fish Swimming" UBC TR-2001-19 | 著者 Gates、2部構成・3モード | 高 |
| 13 | Gates 振幅包絡・旋回パラメータ（allowed_domains cs.ubc.ca） | 振幅様式の分類、L 字の急発進。数式なし | 中 |
| 14 | fish turns pulse of curvature offset wave | ダニオのパルス旋回モデル（SICB 要旨） | 高 |
| 15 | Subnautica creature AI | Subnautica 2 の BT＋刺激システム（ファン wiki 等） | 低〜中 |
| 16 | Subnautica Unity Creature actions modding | 得られず | 0 |
| 17 | ABZU fish schools flocking GDC | 強化 boids＋シェーダ、食物連鎖（二次資料） | 中 |
| 18 | GDC Vault ABZU 魚 AI 講演 | 美術面の講演のみ | 低〜中 |
| 19 | Dill & Mark utility AI GDC 2010 | 講演の存在・内容の概要、IAUS | 中 |
| 20 | Isla Halo 2 behavior tree GDC 2005 | BT の導入、約 50 行動 | 中 |
| 21 | AI LOD game agents update frequency | LOD AI の用語、距離別の更新頻度 | 中 |
| 22 | trout visual field binocular overlap degrees | 330°/30° 死角（釣り解説） | 低〜中 |
| 23 | サケ科 視野 両眼視野 視力 網膜（日本語） | 得られず | 0 |
| 24 | lateral line detection range body lengths | 1〜2 体長（PROXY） | 中 |
| 25 | Historical Perspective on Drift Foraging Models（Fausch・Hughes & Dill） | Fausch の提案、非現実的な仮定 | 中 |
| 26 | Urabe 2010 bioenergetics habitat quality | 北海道の NEI と現存量の関係 | 中〜高 |
| 27 | サクラマス ヤマメ 反応距離 ドリフト採餌（日本語） | 数値なし | 低 |
| 28 | Sea of Thieves fish wildlife AI procedural animation | AI and Games 連載の存在 | 中 |
| 29 | Secrets of Skeleton and Shark AI（allowed_domains gamedeveloper.com 等） | サメの BT、旋回率の上限、減速、ベジエ | 高 |
| 30 | Railsback & Harvey 2002 habitat-selection rules | EM が6パターン全てを再現 | 高 |
| 31 | stereo video juvenile trout drift feeding behavior | Otago のステレオ映像研究（数値なし） | 低〜中 |
| 32 | flight initiation distance stream trout | サケ科の数値は無し（魚一般で体サイズと正相関） | 低 |
| 33 | Reynolds 1987 Flocks Herds Schools | 局所知覚の分散モデル | 中 |
| 34 | procedural animation fish spine chain phase delay | 位相遅れのボーンチェーン技法（一般） | 中 |

### 6.2 第3版（今回）の検索ログ（#A1〜#A23。全て mode=standard）

有用度: 高=仕様に使える記述が得られた／中=概要・書誌の確認／低=関連は薄い／0=得られず。

| # | クエリ（要旨） | 結果 | 有用度 |
|---|---|---|---|
| A1 | Hughes & Dill 1990 の反応距離・捕獲確率・最大捕獲距離の式（3ブロック） | 書誌（題名・CJFAS）、モデルの構成の説明。式は無し | 低〜中 |
| A2 | Hughes ら 2003 の3D映像、定位点流速・最大捕獲距離・復帰（5ブロック） | 書誌（CJFAS 60:1462–1476）、「総エネルギー獲得を約2倍過大評価」。数値は無し | 中 |
| A3 | inSTREAM の期待成熟度、時間軸、移動半径の係数 | EM の定義の再確認、移動規則論文の存在。係数は無し | 低〜中 |
| A4 | Tu & Terzopoulos の意図生成器、恐れ・空腹・性衝動の閾値、保持 | 全変数が閾値以下なら wander、知覚フィルタ | 高 |
| A5 | Movement rules for IBMs of stream fish（Railsback） | 論文の存在・要旨（素早い再選択、リスク/摂餌比の理論の不適合） | 中 |
| A6 | Howe & Astley 2021 のパルス旋回の振幅・幅・速度 | Howe & Astley 2021 の2本の題名・DOI。数値は無し | 中 |
| A7 | Utility AI のヒステリシス／モメンタム | Momentum Bonus（Utility Worlds 文書）、ヒステリシスの説明 | 中〜高 |
| A8 | Three.js 手続き的魚アニメ（脊柱・サイン波） | Godot の頂点シェーダ解説（既知）と Unity のボーン方式のみ | 低 |
| A9 | Barrett & Triantafyllou 1999 の振幅包絡式（0.02−0.0825x+0.1625x²） | 論文の存在、進行波・位相速度の条件。式は無し | 中 |
| A10 | サケ科幼魚の agonistic behavior の頻度（回/分） | Strikes／Chases／Approaches の分類、定性的。数値は無し | 低 |
| A11 | ニジマス等の側線の検出距離・閾値 | 側線の一般説明、Ristroph ら 2015。距離の数値は無し | 低 |
| A12 | ニジマスの視力・視野・両眼視野 | 視力の査読値は無し（ゼブラフィッシュ等）、解説サイトのみ | 0〜低 |
| A13 | ドリフト捕食モデルの検証「総エネルギー獲得を2倍過大評価」の出所 | AFS 2011 要旨群の文面を再確認 | 中 |
| A14 | Reynolds の操舵行動一覧（red3d.com 限定） | 3レベル名、path／flow field／wall／leader following | 高 |
| A15 | ゲームの野生動物 AI（欲求ベース、Utility AI） | 二次資料・MOD の欲求ベース実装（hunger／energy／fear） | 低 |
| A16 | UE Mass の LOD、更新周期、画面外 | 4段階 LOD、段階ごとの距離・最大数・tick rate の枠組み | 中 |
| A17 | サケ科幼魚の鳥類捕食者モデルへの反応、摂餌再開 | 大西洋サケの摂餌率 25〜39% 低下・移動率 123〜386% 増加 | 高 |
| A18 | サケ科の尾鰭打数と速度（線形）、低速定位、振幅 | 大西洋サケの TBF 線形・TBA べき関数、ブラウントラウトの定位時の打数 | 高 |
| A19 | サクラマス・ヤマメ幼魚の縄張り攻撃の頻度（日本語） | サケマス生態一般の資料のみ。数値は無し | 0 |
| A20 | Terzopoulos, Tu, Grzeszczuk 1994 Artificial Life の書誌 | 題名・誌名・著者順（要約の順）の確認 | 中 |
| A21 | ブラウントラウト定位時の打数「2.5 回/s、好む 1.0〜2.0」の出所 | Ross, Watts & Young 1981（J. Fish Biol.）と要約が特定 | 高 |
| A22 | サケ科の FID（接近者・釣り人） | 被食側魚類の FID と観察者効果のみ。サケ科の数値は無し | 0〜低 |
| A23 | ドリフト捕食の攻撃率・攻撃の側方距離・復帰時間 | キングサーモン幼魚の 52%／39%／9% の内訳。距離・復帰時間は無し | 中 |

- 第3版で M から B／A に引き上げた主張: Tu & Terzopoulos の「全変数が閾値以下なら wander」と知覚フィルタ（B）、Reynolds の3レベル名と追加の操舵行動（B）、Utility AI のモメンタム／ヒステリシスの方式（B/C）、Railsback ら (1999) の題名・主題（B）、Hughes ら (2003) の書誌と過大評価（B）、Barrett ら (1999) の書誌と位相速度条件（A・PROXY）、Mass LOD の枠組み（B）。M のまま残した主張: 人工魚の意図の保持、inSTREAM の体長順、F.E.A.R. = GOAP、NEI の式の具体形、スプライン方式、Barrett の包絡式、Liao (2006) の題名の後半。
- 第3版で追加した P（写真由来）の所見は無い。F-28、F-29 は第2版のまま保持した（写真の集計は再実行していない）。

- 検索ではない作業: 既存ファイル（第2版）と、先行ストリーム r07・r08・r09・r11 の継承所見、catalog_c01〜c07.json の集計結果（F-28）を引き継いだ。
- 本版で M から B／A に引き上げた主張: Tu & Terzopoulos の構造・精神状態・意図の判定順・行動ルーチン8種・23質点/91バネ/12筋・300° 視野（B）、Reynolds 1987/1999 の概念（B）、inSTREAM の決定規則・EM・捕獲面積・移動半径（A）、Railsback & Harvey 2002（A）、BT／Utility AI の講演の存在（B）、Sea of Thieves のサメ AI（B）。M のまま残した主張: Reynolds の規則名・レベル名、inSTREAM の体長順、F.E.A.R. = GOAP、ヒステリシス、意図の保持、NEI の式の具体形、スプライン方式。
