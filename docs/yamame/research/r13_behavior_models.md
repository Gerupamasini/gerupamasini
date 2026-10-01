# 行動モデル・人工魚・手続き的遊泳アニメの先行事例（計算機科学／ゲーム）— ヤマメ3Dモデル向け調査（検索0回・初版）

> 作成: ストリームR13。**新規作成**（既存の検索なし初版は存在しなかった）。
>
> **この文書を使う前に必ず読むこと（調査の限界）**
> 1. **本ストリームでは WebSearch を1回も実行できていない。** セッションの WebSearch 上限（200回、全ストリーム共有）が既に使い切られており、最初の1本（Tu & Terzopoulos 1994 の検索）は「Web search was not performed ... budget (200 of 200)」と返った。**上限を迂回する手段（WebFetch、curl 等）は取っていない。** 上限の引き上げ（環境変数 `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`）は利用者側の操作で、サブエージェントからは要求できない。
> 2. したがって **課題1〜3（Tu & Terzopoulos、Reynolds、inSTREAM、NREI／Hughes、ゲームAI、Utility AI／行動ツリー、LOD AI）は、全て私の記憶＝証拠ランク M（未検証）**。書誌（誌名・巻・頁・年）にも誤りがありうる。**仕様書に引用する場合は「文献名と概念のみ。内容は未検証」と書くこと。** 個々の M 主張の確信度は各 F に書いた。
> 3. 課題4（手続き的体波・旋回・速度連動）と課題5（感覚）に対しては、**先行ストリーム r07・r08・r09・r11 が検索で得た A/B/C ランクの所見を「継承」として再掲**した。これらは本ストリームで再検索・再確認していない。ランクは元ファイルの表記のまま（「A（継承）」と書く）。元の検索要約には論文全文の数値・式・表が含まれておらず、その限界（係数が無い、振幅の定義が不明、など）も元ファイルのとおり引き継ぐ。
> 4. **ヤマメ固有の実測は、遊泳キネマティクス（稚魚のみ）以外にほぼ無い。** 運動学・高速スタート・胸鰭・Kármán gait の数値の大半は **PROXY（ニジマス等）**。
> 5. ローカル資料からの新規作業は、写真カタログ（catalog_c01〜c07.json、70枚）の水中フレーム19枚の体の湾曲・口の開閉・頭のピッチの集計1件のみ（F-28、証拠 P）。
> 6. 「設計案」「推論」と書いた箇所は、私の設計判断であって資料の主張ではない。

---

## 1. 要約（仕様に直結する結論。末尾の [F番号] は根拠 finding）

**A. 計算機科学・ゲームの先行事例（全て M。仕様書には「参考文献名」としてのみ引用可）**

1. **Tu & Terzopoulos (1994) の人工魚は「物理モデル＋筋アクチュエータ → 運動制御 → 知覚 → 行動（精神状態＋意図生成器）」の階層構造**で、行動層が運動制御器を呼び出し、運動制御器が筋を駆動する、という設計である（M・確信度 高〜中）。Three.js 実装の層分け（知覚／意図選択／運動学）の雛形に使える（設計案）。ヤマメ固有の根拠ではない。[F-01, F-02]
2. 人工魚の行動層は、**精神状態（空腹・恐れ・性衝動などの 0〜1 の状態量）と「習慣」パラメータ（個体差の係数）から、優先順位つきの規則で単一の「意図」を選ぶ意図生成器**を持つ（M・確信度 中）。緊急度の高い意図（障害物回避、逃避）が先に判定される構造だったと記憶するが、**規則の順序と閾値の値は引用不可**。[F-02]
3. 人工魚の知覚は、**視野に角度と到達距離の制限があり、遮蔽を考慮した「見える物の一覧」を行動層に渡す**構造（M・確信度 中〜低）。視野角の具体値（記憶では「ほぼ全周に近い広い視野」）は**採用不可**。ヤマメの視野角・両眼視野の数値は r07 でも未取得。[F-04, F-26]
4. **Reynolds の操舵行動（steering behaviors）は「行動選択 → 操舵 → 移動」の3層**で、seek / flee / arrival / wander / obstacle avoidance / containment / path following / flow-field following などの原始的な操舵力を合成する（M・確信度 高）。ヤマメは**幼魚が縄張り性で順位制**（r11）なので、boids の cohesion／alignment を既定の行動にするのは根拠が弱い。水槽写真で同方向を向く個体が多い（P）が、水槽は高密度で野外の根拠にならない（r11 F-28）。[F-05, F-23, F-28]
5. **inSTREAM（Railsback ら）は、個体を河床セル（水深・流速・被覆）に置き、移動可能範囲内でセルを評価して選ぶ個体ベースモデル**（M・確信度 中）。評価は成長（ドリフト捕食の純エネルギー）と生存（捕食リスクなど）の組み合わせ。視覚シミュレーションでは**簡略化して「焦点位置（定位点）の選択」にだけ借りる**のが現実的（設計案）。[F-06]
6. **ドリフト捕食モデル（Fausch 1984、Hughes & Dill 1990、Hughes 1998、Hughes ら 2003）の中核は「定位点の純エネルギー収支 = 流下餌の捕獲量 − 遊泳コスト（定位点の流速と迎撃の追跡）」**（M・確信度 中）。定位点は「流速が遅い場所の隣に速い流れがある」位置になる。Hughes ら 2003 のブラウントラウト3次元映像研究の書誌は検索で確認済み（r09、数値は未取得）。[F-07]
7. **ゲームAIの使い分け（推論）**: 魚の行動は「連続的な欲求（空腹・恐れ・縄張り）に応じて少数の意図を切り替える」性質なので、**意図選択は Utility AI（スコア比較＋ヒステリシス）、攻撃・逃避の物理的な局面（接近→打撃→復帰）は小さな状態機械**、という組み合わせが素直。行動ツリーは意図が少ないと過剰。LOD AI は距離・画面占有率で思考頻度を落とす。いずれも M と推論で、ヤマメの根拠ではない。[F-08, F-10]
8. **Subnautica／ABZU／Sea of Thieves の魚AI・遊泳アニメの技術記事・GDC 講演は、記憶に信頼できる内容がない。未確認として仕様書に引用しない。** [F-09]

**B. 手続き的遊泳アニメの生物学的パラメータ（継承。PROXY を多く含む）**

9. **体波は進行波 y(x,t) = A(x)·sin(2π(x/λ − f·t)) の形で書け、振幅包絡 A(x) は頭から尾へ二次多項式で増える**（44種の比較で個体の約90〜92%が二次多項式で記述、Di Santo ら 2021、A・継承）。係数の数値は未取得。サイスの例（PROXY）は A(0)=0.02 L、A(0.2)=0.01 L、A(1.0)=0.10 L で、頭部の振幅は尾端の約 0.2 倍。[F-12]
10. **波長はニジマスで約 0.9 L で速度に依存しない。尾端振幅も速度に依存せず、周波数が速度とともに増える**（Webb ら 1984、Webb 1988、A・継承・PROXY）。ヤマメ稚魚（全長 4.4〜8.8 cm）の実測は、振幅/全長 ≈ 0.12 で一定、尾鰭振動数 20.8〜39.1 Hz（流速 48〜137 cm/s）、60分臨界遊泳速度 3.5〜6.9 BL/s（平均5.5）。**成魚（15〜30 cm）には適用不可。成魚の振動数と速度の関係式は未取得。** [F-12, F-13]
11. **速度域の目安（日本の魚道設計）**: 巡航は体長の 2〜4 倍/s、突進は約 10 倍/s（B・継承）。ヤマメ成魚の値は無い。[F-14]
12. **胸鰭は 0.5〜1.0 BL/s の定速遊泳では体側に畳む。定位・低速・旋回・制動で能動的に使う**（ニジマス、A・継承）。旋回では外側の鰭を開いて横力を出し、内側は後方へ推力を出す。障害物の背後での定位では、持続的に張り出す制動と、一過的な展開・収納による横方向制御を切り替える（Gibbs ら 2024、A・継承）。[F-15]
13. **障害物の後流では「Kármán gait」（尾端振幅が自由流の約3倍、体波長 > 1 L、尾鰭振動数は渦放出周波数に一致）、円柱の側方の吸引域では「entraining」（体波を止め、体をまっすぐ、流れに角度をつけて保持）**（ニジマス、A・継承・PROXY）。岩・流木の背後で遊泳モードを切り替える設計の根拠になるが、実験流速（30〜70 cm/s）はヤマメの生息流速 10〜35 cm/s より速い。[F-16, F-22]
14. **旋回・逃避**: 最小旋回半径は全長の 0.17〜0.18 倍（ニジマス 25.7 cm の活餌攻撃、およびサイズ群を変えた逃避、A・継承・PROXY）。曲率の上限は約 5.6/L。**高速スタートは 3 段階（Stage 1 準備のC/S字屈曲 → Stage 2 推進 → Stage 3 可変）**、主加速段階は 0.07 s（小）〜0.10 s（大）、最小潜時 5〜20 ms。型は C 型と S 型があり、頻度は未取得。旋回時の曲率は、曲率の位相が筋の活性化から遅れる（Goldbogen ら 2005）ので、**活性化波を遅らせて曲率を作る**実装が裏付けられる。[F-17]
15. **バースト＆コースト（尾を数回振る→直線姿勢で滑走）は PROXY（コイ約45%、理論 50% 超）で省エネ。サケ科の実測は無い**ので、既定は無効寄りにして高速域・加速直後の選択肢に留める。[F-18]
16. **ドリフト捕食のサイクル**: 定位点に留まる時間が観察時間の平均 81%、能動的な採餌は 14%、**餌の約 2/3 は定位点より下流側で捕獲**（出典論文の特定不能な要約、C・継承）。迎撃速度は予測された最大持続遊泳速度（coho／steelhead 幼魚、水槽、A・継承・PROXY）。**反応距離と流速の関係は文献間で食い違う**（低下する／影響なし）。ヤマメの反応距離・追跡距離は未取得。PROXY の反応距離は 32.7 cm（キングサーモン幼魚の平均）〜187.1 cm（カットスロートの最大、好条件の光）、餌径が体長の 0.025 倍で最大。[F-19, F-20, F-21]
17. **定位場所・縄張り・日周（ヤマメ／サクラマス）**: 生息流速 10〜35 cm/s（環境省、B）。登川の幼魚は秋に流心側（深さ 35.4 ± 14.2 cm、流速 43.4 ± 23.1 cm/s）、冬は岸際の流速約 20 cm/s で沈水カバーのある場所（A）。順位はほぼ直線的でサイズ順に近く（A）、縄張り面積の PROXY 式 log10(m²) = 2.61 log10(尾叉長 cm) − 2.83（A、サケ科幼魚の種間回帰）。冬は水温約 10℃ 以下でほぼ夜行性（PROXY）。[F-22, F-23, F-24]
18. **警戒・逃避の挙動は定性的な資料のみ**: 上流を向いて定位し、人の気配で岩の下に隠れる、少しの驚きで摂餌をやめる（釣り情報、C）。PROXY では刺激中は水底へ潜り、止むと元の水深・遊泳速度に戻る（大西洋サケの群れ、A）。**警戒距離（FID）、逃避速度、再出現時間の数値は無い。** [F-25]
19. **感覚・頭部のアニメ用**: 側線は頭部管8本＋体幹管1本（O. m. masou、査読）。視野・視力・瞳孔動態の数値は無い。ニジマスの摂餌ストライクで神経頭蓋が 2〜18° 挙上、換気頻度は 57±4〜78±4 回/分（ニジマス、A・継承・PROXY）。開口時間・最大開口角のサケ科値は無い。[F-26, F-27]
20. **写真（P）**: 水中フレーム 19 枚（自然 8＋水槽 11）の体の湾曲は、ほぼ直線 10、軽い湾曲 8、強い湾曲 1。口が開いているのは 2/19。水槽で頭を 14〜55° 上げて斜め上へ泳ぐ例が 3 枚（p014, p018, p028）。[F-28]

### 1.1 設計用の暫定値と状態（仕様書に転記する場合は「仮置き」「PROXY」を落とさないこと）

| パラメータ | 暫定値 | 状態 | ランク |
|---|---|---|---|
| 体波の関数形 | y(x,t) = A(x)·sin(2π(x/λ − f·t))、A(x) は二次多項式 | 形のみ。係数なし | A（継承） |
| 包絡の代替係数 | A(x)/L = 0.02 − 0.0825x + 0.1625x²（x=0 頭〜1 尾） | サイス3点（PROXY）からの算出。振幅の定義不明。r08 の算出 | A値＋算出（継承） |
| 波長 λ | 約 0.9 L（速度に依存しない） | ニジマス PROXY | A（継承） |
| 尾端振幅 | 速度に依存しない。ヤマメ稚魚で振幅/全長 0.12。ニジマスのバースト中 0.17 L | 振幅の定義（片振幅／peak-to-peak）が不明 | A/B（継承） |
| 尾鰭振動数 f | 速度に比例。ヤマメ稚魚 20.8〜39.1 Hz（流速 48〜137 cm/s） | 式は未取得。成魚は未取得 | A（継承） |
| 巡航／突進 | 2〜4 BL/s ／ 約 10 BL/s | 魚道設計の目安。ヤマメ固有でない | B（継承） |
| 最小旋回半径 | 0.17〜0.18 L | ニジマス PROXY。限界性能 | A（継承） |
| 高速スタート主加速段階 | 0.07 s（小）〜0.10 s（大）、最小潜時 5〜20 ms | ニジマス PROXY。電気刺激で誘発 | A（継承） |
| 定位点での待機割合 | 平均 81%（能動採餌 14%） | 出典論文の特定不能 | C（継承） |
| 迎撃速度 | 最大持続遊泳速度 | coho／steelhead PROXY | A（継承） |
| 反応距離 | ヤマメは無い。PROXY は 32.7〜187.1 cm | 魚種・光条件で桁が違う | C（継承） |
| 視野角・両眼視野 | 無い | 調整可能な値にして「根拠なし」と明記 | — |
| 警戒距離・再出現時間 | 無い | 同上 | — |
| 意図選択の枠組み | Utility 型＋小さな状態機械 | 設計案 | M／推論 |

---

## 2. Findings

> ランクの表記: A=査読論文・公的機関資料で、検索要約に数値/記述が明示／B=県・大学資料・解説・学会要旨／C=釣り情報・出典未特定の要約／M=私の記憶（**本ストリームでは検索で未確認**）／P=ユーザー提供写真70枚（catalog_c0N.json）の集計。
> 「継承」は、先行ストリームが検索で得た所見を本ストリームで再検索せず再掲したもの。元ファイル名と F 番号を併記した。**本ストリームで新たに検索で裏付けた所見は0件。**

### Part A — 計算機科学・ゲームの先行事例（全て M）

### F-01 Tu & Terzopoulos (1994)「Artificial Fishes」の全体構造
- 主張/値: SIGGRAPH '94 の人工魚は、(1) **物理モデル**（質点・バネ・ダッシュポットの網で作った体と、筋として働く収縮バネ）、(2) **運動系**（筋を駆動する運動制御器。直進遊泳、左旋回、右旋回など）、(3) **知覚系**（視覚的な感覚器と、水温など環境の感覚）、(4) **行動系**（精神状態、習慣、意図生成器、行動ルーチン）の階層で、上の層が下の層を呼び出す。流体力は水中の抗力・推力の近似式で与え、筋の収縮の位相をずらして体に進行波を作る。胸鰭は旋回・ピッチ・制動に使う。後続研究で、運動制御器の学習（Grzeszczuk & Terzopoulos 1995）と、行動の学習（Artificial Life 誌 1994）を扱った。
  - 記憶している細部（**確信度 低〜中。数値は引用不可**）: 体モデルは 23 個の質点と 91 本のバネ、そのうち 12 本が筋、という記憶。
- 適用範囲: 計算機科学の人工生命・キャラクターアニメーション。特定の魚種ではなく、サメ（捕食者）、獲物、非捕食の魚が登場する。ヤマメ固有の知見ではない。
- 出典（書誌は記憶。URL なし）:
  - Tu X., Terzopoulos D. (1994) "Artificial fishes: Physics, locomotion, perception, behavior." Proc. ACM SIGGRAPH '94, pp. 43–50.
  - Terzopoulos D., Tu X., Grzeszczuk R. (1994) "Artificial fishes: Autonomous locomotion, perception, behavior, and learning in a simulated physical world." Artificial Life 1(4):327–351.
  - Grzeszczuk R., Terzopoulos D. (1995) "Automated learning of muscle-actuated locomotion through control abstraction." Proc. SIGGRAPH '95.
  - Tu X. (1996) Univ. of Toronto 博士論文（のち書籍化）。
- 証拠: [M] 検索なし。確信度: 階層構造は高〜中、書誌の頁・巻は中、バネ・質点の数は低〜中。
- 実装への含意（設計案・推論）: Three.js では物理（質点バネ）を作らず、運動学（体波）で代替するのが現実的。ただし**「行動層が運動層へ高水準のコマンド（速度・向き・体波の振幅）だけを渡す」という分離**は有効。

### F-02 人工魚の精神状態・習慣・意図生成器
- 主張/値: 行動系は、**精神状態の変数**（空腹 hunger、恐れ fear、性衝動 libido など。0〜1 の連続量で、時間とともに増減し、行動で下がる）、**習慣（個体のパラメータ。種や個体ごとに、空腹の閾値、恐れの減衰、群れる傾向などが違う）**、**意図生成器**（知覚情報と精神状態から、その時点で実行する単一の意図を選ぶ。緊急度の高い意図、例えば衝突回避や逃避が優先される）、**行動ルーチン**（意図に応じて目標速度・向きを運動系へ渡す）からなる。意図の例: 障害物回避、捕食者からの逃避、摂餌、交尾、群れ、徘徊（wander）。**選んだ意図は、一定時間保持する工夫（意図の持続）があった**という記憶（確信度 低）。
- 適用範囲: 計算機科学。ヤマメの行動に直接の根拠はない。
- 出典: F-01 と同じ（URL なし）。
- 証拠: [M] 検索なし。確信度: 構造（状態量→意図→ルーチン）は中〜高、優先順位の詳細・数値・「持続」の工夫は低。
- 実装への含意（設計案・推論）: ヤマメの意図候補は、**定位（待機）／流下餌の迎撃／縄張り防衛（追い払い）／逃避・隠れる／移動（定位点の変更）／水面への摂餌（ライズ）**程度に絞れる。状態量は**空腹、警戒、縄張り刺激**。個体差は習慣パラメータ（臆病さ、探索度）で与える。優先順位は「逃避 > 迎撃 > 縄張り防衛 > 移動 > 待機」を既定にし、**根拠（資料）はなく、調整可能にする**。

### F-03 人工魚の運動系: 筋の位相差による遊泳、旋回の与え方
- 主張/値: 遊泳は、体の両側の筋を**位相をずらして収縮**させて進行波を作ることで推進する。旋回は、**左右の筋の収縮に非対称（偏り）を与える**ことで行う。筋の収縮の速さや強さを運動制御器のパラメータにし、行動層は「どちらへ、どのくらい」だけを指定する。
- 適用範囲: Tu & Terzopoulos の物理モデル。
- 出典: F-01 と同じ。
- 証拠: [M] 検索なし。確信度: 中。
- 実装への含意: 旋回時に**体軸（midline）の曲率に静的なバイアス（片側へのオフセット）を足す**という実装は、この考え方と一致する（設計案）。裏付けとなる生物学側の所見は F-17（旋回半径、曲率の位相遅れ）。

### F-04 人工魚の知覚: 視野の制限と注意の焦点
- 主張/値: 魚は、**限られた視野角と到達距離（水の濁りによる制限）の中で、遮蔽を考慮して見える物（餌、障害物、他の魚）を取得**し、その中から**注意の焦点（focus）**を選んで行動層に渡す、という構造と記憶している。レンダリングによる視覚（合成視覚）ではなく、世界モデルへの問い合わせで実装されていた（確信度 中〜低）。
  - 視野角は「広い（ほぼ全周に近い）」と記憶するが、**数値は記憶にない／採用不可**。
- 適用範囲: 計算機科学。ヤマメの視野ではない。
- 出典: F-01 と同じ。
- 証拠: [M] 検索なし。確信度: 構造は中〜低。
- 実装への含意（設計案・推論）: ヤマメ実装では、**視野角・最大感知距離・遮蔽判定を調整可能にし、資料が無いことを明記**する。反応距離の PROXY 数値は F-21。ヤマメの両眼視野・各眼の視野は r07 F-11 でも未取得。

### F-05 Reynolds の群れモデル（1987）と操舵行動（1999）
- 主張/値: (1) **Reynolds (1987)**: boids。各個体が近傍の仲間だけを見て、**分離（separation）、整列（alignment）、結合（cohesion）**の3つの局所規則に従い、群れの運動が生まれる。(2) **Reynolds (1999) GDC**: 自律キャラクターの行動を**行動選択（action selection）→ 操舵（steering）→ 移動（locomotion）の3層**に分け、操舵層の原始的な行動を提示した。seek、flee、pursuit、evasion、arrival、wander、obstacle avoidance、containment、wall following、path following、flow-field following、leader following、unaligned collision avoidance など。乗り物は質点で、最大速度・最大操舵力を持ち、操舵力を合成して加速度とする。
- 適用範囲: 計算機科学の群れ・操舵。魚種は限定されない。
- 出典（書誌は記憶。URL なし）:
  - Reynolds C.W. (1987) "Flocks, herds and schools: A distributed behavioral model." Computer Graphics 21(4):25–34 (SIGGRAPH '87).
  - Reynolds C.W. (1999) "Steering behaviors for autonomous characters." Game Developers Conference 1999.
- 証拠: [M] 検索なし。確信度: 3規則・3層・主要な操舵行動の名前は高。頁・年は中〜高。
- 実装への含意（設計案・推論）: ヤマメの定位は**「定位点への arrival／station-keeping」に流れの場の追従（flow-field following）を加えた形**で、障害物回避と containment（川幅・水深・水面）が基本。**cohesion／alignment は既定にせず、幼魚の近距離の整列は水槽写真の観察 (F-28、P、偏りあり) の範囲で任意項目にする**。縄張り性の根拠は F-23。

### F-06 inSTREAM（Railsback ら）の個体ベース・トラウトモデル
- 主張/値: inSTREAM（individual-based Stream Trout Research and Environmental Assessment Model）は、**個体を水深・流速・被覆などを持つ河床セルに置き、各個体が移動可能な範囲にあるセルを評価して最良のセルへ移動する**、トラウト個体群のシミュレーションである。評価は成長（ドリフト捕食の純エネルギー）と生存（捕食リスク、高温、飢餓など）の組み合わせ（「期待成熟度」＝将来の成長と生存の積に近い指標）で、**移動可能距離は体長に応じて増える**。大きい個体が先にセルを選ぶ**優劣の順序（体長順）**を持つ。1日あたり複数回の判断（摂餌時間帯と隠れる時間帯の選択）を含む。
  - 記憶している細部（**確信度 低〜中**）: 餌の捕獲面積は反応距離と流速から計算し、捕獲成功率は流速の増加で下がる。遊泳コストは流速に依存する。
- 適用範囲: ニジマス、ブラウントラウト、カットスロートなど北米・欧州のトラウト個体群の管理用。ヤマメ（日本）のパラメータは無い。
- 出典（書誌は記憶。URL なし）:
  - Railsback S.F., Harvey B.C., Jackson S.K., Lamberson R.H. (2009) "InSTREAM: the individual-based stream trout research and environmental assessment model." USDA Forest Service Gen. Tech. Rep. PSW-GTR-218.
  - Railsback S.F., Lamberson R.H., Harvey B.C., Duffy W.E. (1999) "Movement rules for individual-based models of stream fish." Ecological Modelling 123:73–89.
  - Railsback S.F., Harvey B.C. (2002) "Analysis of habitat-selection rules using an individual-based model." Ecology 83:1817–1830.
  - Railsback S.F., Grimm V. 『Agent-Based and Individual-Based Modeling』（トラウト個体ベースモデルの例を含む教科書）。
- 証拠: [M] 検索なし。確信度: 概念（セル評価、体長順、移動範囲）は中、書誌の頁・年は中〜低、細部は低。
- 実装への含意（設計案・推論）: **個体群動態や成長の再現は不要**。「定位点の候補を河床メッシュ上で評価して選ぶ」部分だけを借り、評価関数を F-07 の簡略版（餌供給 × 捕獲可能性 − 遊泳コスト − リスク）にする。r11 の定位場所の資料（F-22）が、ヤマメ向けの重みの方向づけ（深み、被覆、流速）になる。

### F-07 ドリフト捕食モデル（NREI）: Fausch 1984、Hughes & Dill 1990、Hughes 1998、Hughes ら 2003
- 主張/値: 流下餌を食べるサケ科の**定位点は、純エネルギー摂取率（net rate of energy intake, NREI）が最大になる位置**として説明される。NREI = 流下餌からのエネルギー獲得 − 遊泳コスト。獲得は、餌濃度 × 捕獲面積（反応距離で決まる）× 流速 × 捕獲確率 × 餌のエネルギーで、捕獲確率は流速が速いほど下がる。遊泳コストは**定位点の流速**（遅いほど安い）と、迎撃のための追跡で増える。したがって最適な位置は、**流速の遅い定位点のすぐ隣に餌を運ぶ速い流れがある場所**になる。迎撃できる範囲は、魚の最大持続遊泳速度と水の流速、餌が通過する時間で上限が決まる。Hughes (1998) は個体スケールのモデルを生息場所（スケール）の選択へ拡張し、Hughes ら (2003) はブラウントラウトの3次元映像でモデルを検証した。
  - 書誌の確認（検索結果）: Hughes ら (2003) の論文と、総説 "A historical perspective on drift foraging models for stream salmonids"（Springer）は r09 の検索で題名の存在を確認（B・継承、**数値の記述は取得していない**）。
- 適用範囲: ブラウントラウト、北極グレイリング、ニジマス、サケ科全般。ヤマメへの適用は未確認。
- 出典:
  - （M・書誌は記憶）Fausch K.D. (1984) "Profitable stream positions for salmonids: relating specific growth rate to net energy gain." Can. J. Zool. 62:441–451.
  - （M）Hughes N.F., Dill L.M. (1990) "Position choice by drift-feeding salmonids: model and test for Arctic grayling (Thymallus arcticus) in subarctic mountain streams, interior Alaska." Can. J. Fish. Aquat. Sci. 47:2039–2048.
  - （M）Hughes N.F. (1998) "A model of habitat selection by drift-feeding stream salmonids at different scales." Ecology 79:281–294.
  - （題名を検索で確認・継承）Hughes N.F., Hayes J.W., Shearer K.A., Young R.G. (2003) "Testing a model of drift-feeding using three-dimensional videography of wild brown trout, Salmo trutta, in a New Zealand river", Can. J. Fish. Aquat. Sci. 60:1462–1476。https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river
  - （題名を検索で確認・継承）総説 "A historical perspective on drift foraging models for stream salmonids"。https://link.springer.com/article/10.1007/s10641-013-0187-6
- 証拠: [M]（モデルの骨格）／[B・継承]（書誌の存在）。確信度: 骨格は中〜高、式の具体形・係数は記憶に無い。
- 実装への含意（設計案・推論）: 定位点の選択に使う**簡略スコア = 餌供給（流速 × 近傍の速い流れの有無）× 迎撃可能性 − 定位点の流速コスト − リスク（水深が浅い・被覆が無い）**。係数は根拠なしの調整値にする。迎撃速度や反応距離の PROXY 値は F-20、F-21。

### F-08 ゲームAIの意思決定方式の使い分け（Utility AI／行動ツリー／状態機械／GOAP）
- 主張/値: (1) **有限状態機械（FSM）／階層 FSM**: 状態と遷移が明示的で、少数の局面（待機→接近→打撃→復帰）に向く。状態が増えると遷移が爆発する。(2) **行動ツリー（BT）**: 条件・選択・並列のノードで階層的に意思決定する。Halo 2 のAI（Isla, GDC 2005）で知られる。多数の行動を整理しやすい。(3) **Utility AI（効用ベース）**: 各行動の効用（0〜1 のスコア）を、状況の変数に曲線（応答曲線）を当てて計算し、最大のものを選ぶ。連続的な欲求の競合に向き、「The Sims」の欲求ベースの選択（物体が欲求への効果を広告する方式）、Dave Mark／Kevin Dill の講演（GDC 2010 付近）で知られる。ヒステリシスやモメンタム（直前の選択に加点）で振動を抑える。(4) **GOAP**: 目標から行動列を計画する（F.E.A.R.、Orkin 2006）。
- 適用範囲: ゲームAI一般（人型・動物を問わない）。魚固有の知見ではない。
- 出典（書誌は記憶。URL なし）:
  - Isla D. (2005) "Handling complexity in the Halo 2 AI." GDC 2005.
  - Mark D. (2009) 『Behavioral Mathematics for Game AI』Cengage.
  - Dill K., Mark D. (2010) "Improving AI decision modeling through utility theory." GDC 2010.
  - Orkin J. (2006) "Three states and a plan: The AI of F.E.A.R." GDC 2006.
  - Colledanchise M., Ögren P. (2018) 『Behavior Trees in Robotics and AI』CRC Press.
- 証拠: [M] 検索なし。確信度: 各方式の特徴は高、講演の年・題名の細部は中。
- 実装への含意（設計案・推論）: ヤマメは意図が少なく（F-02）、欲求が連続的に競合（空腹 vs 恐れ）するので、**Utility AI で意図を選び、局面の遂行（迎撃の接近→打撃→復帰、逃避の高速スタート→隠れ場）は小さな状態機械で実装**するのが素直。BT／GOAP は過剰。**ヒステリシスが無いと、意図が毎フレーム入れ替わって見える**ので必須。

### F-09 ゲームの魚AI・遊泳アニメの事例（Subnautica、ABZU、Sea of Thieves など）— **確認できなかった**
- 主張/値: 記憶に、**信頼して書ける技術的な内容がない**。次は噂・印象レベルで、仕様書には引用しない。
  - Subnautica（Unknown Worlds）: 生物がコンポーネント化された「行動（creature action）」を優先度で評価して実行する構造、と modding コミュニティの解説で見た記憶（確信度 **非常に低**）。
  - ABZU（Giant Squid）: 大量の魚の群れがプレイヤーに反応して動く表現で知られる。技術記事・GDC 講演の内容は記憶にない。
  - Sea of Thieves（Rare）: 魚・サメのAI／アニメの技術記事は記憶にない。
- 適用範囲: ゲーム。
- 出典: なし。
- 証拠: [M]（確信度 非常に低）。検索で確認できていない。
- 注: 課題3の中核だが、検索予算の枯渇で Gap（§4）。

### F-10 LOD AI（距離・可視性による思考頻度の削減）
- 主張/値: 多数のエージェントを扱うゲームでは、**カメラからの距離や画面占有率に応じて、意思決定の更新頻度を落とす、知覚の検索を粗くする、遠方は単純な経路追従（群れの中心に追従）に切り替える**、という AI の LOD が一般的に使われる。遠方の個体のアニメは頂点シェーダ内の体波（CPU のボーンを使わない）にする、という方法もある。
- 適用範囲: ゲームの群集・動物AI一般。
- 出典: なし（一般論の記憶）。
- 証拠: [M] 検索なし。確信度: 概念は中、具体的な事例・数値は無い。
- 実装への含意（設計案・推論）: ヤマメの個体数は少数（10〜数十）が想定されるので、**LOD は意思決定頻度（例: 近景は毎フレーム、遠景は数フレームに1回）と、遠景の体波の簡略化**に限れば十分。具体的な頻度は資料が無い。

### F-11 手続き的な魚の遊泳アニメーションの実装方式
- 主張/値: 一般に使われる方式は次のとおり。(1) **頂点シェーダ方式**: 体の前後軸の座標 x に対して、側方への変位 y = A(x)·sin(2π(x/λ − f·t)) を加える。包絡 A(x) を頭から尾へ増やす。ボーンが不要で軽い。(2) **ボーン（骨格）チェーン方式**: 脊柱に沿った各ジョイントの回転を、位相を遅らせた正弦で駆動する（θ_i(t) = θ_max,i·sin(ωt − φ·i)）。進行波を曲率の波として表す。(3) **スプライン／ミッドライン方式**: 体軸を空間曲線（スプライン）で表し、時間ごとに形を計算し、体のメッシュを曲線に沿わせる。曲線の長さを保つ（伸縮しない）ように調整できる。(4) **旋回**: 曲率に静的なバイアスを足す（頭側から尾側へ向かう曲がり）。(5) **速度連動**: 周波数を速度に比例させ、振幅と波長は速度で変えない（F-12 の生物学的所見に沿う）。(6) **コースト**: 振幅を 0 に減衰させて直線姿勢で滑走する。
- 適用範囲: コンピュータグラフィックス一般。具体的な論文・ゲームの出典は記憶にない。
- 出典: なし（一般的な実装知識の記憶。本ストリームでは出典を検索で特定していない）。
- 証拠: [M] 確信度: 方式の概要は中〜高。**どの方式が特定のゲームで使われたかは未確認。**
- 実装への含意（設計案・推論）: 正弦波のパラメータの根拠は F-12、F-13（ヤマメ稚魚の実測）、F-17（旋回・高速スタート）、F-16（障害物後流）。**尾端振幅を一定にして周波数だけで速度を変える**、**波長は約 0.9 L で固定**、は査読論文（PROXY）の裏付けがある。ミッドラインの長さ保存は、振幅が大きい高速スタート（体が C 字になる）で重要（M・設計判断）。

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
- 適用範囲: ヤマメ（O. m. masou）稚魚。放流用と推定されるが要約に由来なし。実験場所は岩木川取水堰。**成魚（15〜30 cm）に適用不可**。他のサケ科では BL/s の臨界遊泳速度は小型ほど高く、低温で低い（コホ稚魚 7.3 → スモルト 5.5 L/s、大西洋サケ 1〜8 ℃で 1.27〜2.08 BL/s）。
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
- 主張/値: **O. m. masou の側線系は、頭部側線管8本（supraorbital, infraorbital, otic, preopercular, mandibular, postotic, supratemporal, temporal）＋体幹側線管1本、表在神経丘グループ9**。preinfraorbital の表在神経丘群を持ち、infraorbital／mandibular／opercular の表在神経丘群を欠く（査読）。**視野**: 眼は頭部の両側にあり前方に狭い両眼視野の重なりと後方の盲域がある、という定性的な記憶のみ（r07 F-11、M）。**ヤマメ／サケ科の視野角、眼球の可動域、視力、瞳孔動態の数値は未取得**。ニジマスの乱流中の体の運動学に対する側線と視覚の役割を調べた論文（Liao 2006, J. Exp. Biol. 209:4077）の題名は検索で確認したが、**内容は取得していない**。側線の感知距離（体長の1〜2倍程度、という一般的な記憶）は M・確信度 低で、**採用不可**。
- 適用範囲: O. m. masou（解剖）。それ以外は PROXY またはなし。
- 出典: "The lateral line system and its innervation in the masu salmon Oncorhynchus masou masou (Salmonidae)", Ichthyological Research (2021)。https://link.springer.com/article/10.1007/s10228-021-00843-0 ／ Liao (2006)（題名のみ）。https://pubmed.ncbi.nlm.nih.gov/17023602/
- 証拠: [A（継承: r07 F-13）]（側線管の数）／[M]（視野の定性的記述、側線の感知距離）
- 実装への含意（設計案）: 視覚＝円錐状の視野＋遮蔽判定、側線＝近距離（体長の数倍以内）の全方位の「動いている物」検出、の2チャネルに簡略化できるが、**視野角・距離の既定値に根拠は無い**ので、調整可能にして「根拠なし」と明記する。

### F-27 摂餌ストライクと呼吸の頭部アニメ用の数値（継承: r07 F-17, F-20, F-27）
- 主張/値: ニジマスの摂餌ストライクで神経頭蓋は最大 **2〜18°** 挙上する（28 ストライク、3個体）。多数の椎間関節（最大約 1/3）の小回転（多くは 3° 未満）が合算される（"neck-like"）。ニジマスの通常酸素下の換気頻度は **57 ± 4 回/分（対照）と 78 ± 4 回/分（軟水順化魚）**（平均 ± SEM、水温・体サイズは要約に無い）で、約 0.95〜1.3 Hz（算術）。水温が高いほど有意に増える（定性）。激しい運動後は頻度がほぼ変わらず、1回の換水量が増える。開口時間の桁は PROXY（ブルーギルの最大開口まで約 13 ms、ラージマウスバスは約 50 ms 以内に閉顎）のみで、**サケ科の最大開口角・開口時間は未取得**。
- 適用範囲: ニジマス（PROXY）、ブルーギル・ラージマウスバス（PROXY）。ヤマメは未確認。
- 出典: r07 F-27、F-20 の出典（r07 の出典一覧）。ヤマメの頭部の大きさ・口裂の位置は r07 F-15 など。
- 証拠: [A（継承: r07 F-27, F-20）]
- 実装への含意: 鰓蓋の開閉（呼吸）は 1 Hz 前後を既定にして水温連動を調整可能に。摂餌ストライクの開口〜閉口は「数十 ms」の桁の PROXY で、**ヤマメ用の根拠は無い**。

### F-28 写真（P）: 水中フレーム19枚の体の湾曲・口の開閉・頭のピッチ（本ストリームの新規ローカル集計）
- 主張/値: catalog_c01〜c07.json の context が「in_water_natural のうち自然な8枚（p005, p006, p007, p023, p026, p036, p040, p054）」と「aquarium の11枚（p014, p015, p016, p017, p018, p027, p028, p029, p041, p042, p049）」の計19枚を集計した（釣獲後・掛かり・平置きの in_water_natural 4枚＝p011, p019, p067, p070 は除外）。
  - **体の湾曲（注釈者の3区分 body_straightness）**: straight 10（自然 2＋水槽 8）、slightly_curved 8（自然 5＋水槽 3）、strongly_curved 1（自然 1: p007、ライズ直後または方向転換と推定）。
  - **口**: 開いているのは 2/19（p005＝摂餌／呼吸と推定して「大きく開く」、p016＝水槽で「わずかに開く」）。閉口 17。
  - **頭のピッチ（注釈者の見積もり。水槽が中心）**: 頭上げ p005 約 5°、p014 の A 魚 20〜30°、p018 の 2 尾 14〜18°（並走して上昇）、p028 の A・B 約 25〜55°；頭を下げ気味 p015 の T1、p026、p049；水平 p029, p041, p040。
  - 他の姿勢所見は r11 F-27（背鰭が立つ 6/8 枚など）、r09 F-10〜F-16 に既出。
- 適用範囲: ヤマメと同定した写真（確信度は写真ごとに差）。水槽は高密度で、野外の行動の根拠にならない（r11 F-28, F-29）。ピッチの角度は px 見積もりで、小さい n。湾曲の区分は主観。体の湾曲の大きさ（曲率）の数値は無い。
- 出典: /home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json〜catalog_c07.json（context, body_straightness, head_mouth.mouth_state, posture_behavior 欄の本ストリームでの Python 集計）。
- 証拠: [P] "頭をやや上向き(約5度)にし口を開く(摂餌/呼吸)"（p005）；"体は右上へ強く湾曲し尾柄が上へ曲がる"（p007）
- 実装への含意: 定常遊泳・定位の大半で、体はほぼ直線〜軽い湾曲（19枚中18枚）。強い湾曲は方向転換・ライズ直後などの局面だけに出る、という扱いが写真の傾向と整合する。ピッチの上限（約 25〜55°）は、水槽で斜め上へ泳ぐ個体の見積もりであって、野外の通常行動の上限ではない。

### F-29 写真（P）: 自然な水中フレームでの底からの高さと背鰭（継承: r11 F-27, r09 F-10, F-14）
- 主張/値: 自然な水中8枚のうち底から魚体下縁までの高さを見積もれた5枚: 約 0.25 体高（p026）、約 0.7 体高（p005）、約 1 体高（p036, p040, p023 の個体 B）。背鰭が立っている明示がある例は 6/8 枚。水槽の複数個体が同方向を向く例が多い（p014, p015, p018, p041）が、水槽は高密度で野外の個体間距離の根拠にならない。
- 適用範囲: n が小さい。高さは注釈者の px 見積もり。
- 出典: catalog_c01〜c07.json の posture_behavior 欄（r11 F-27、F-28 の集計を継承）。
- 証拠: [P（継承）]
- 実装への含意: 定位時の底からの高さの初期値は 0.25〜1 体高（写真5枚の範囲）。背鰭は定位・遊泳中に立てる（6/8）。

---

## 3. 資料間の矛盾・不一致

1. **反応距離と流速**: coho／steelhead 幼魚（水槽）では流速の増加で検出距離が有意に低下（Piccolo ら 2008、A）、ニジマス・北極グレイリングの学位論文では反応距離への影響は「ほとんど／全く無い」（B）。種・水槽／野外・学位論文か査読論文かが違う。**既定を決められない**（F-20）。r09 の初版 M（流速が速いほど短くなる）も確実ではない。
2. **迎撃の向きと速度**: 初版の M 記憶（上流側へ迎撃）に対し、継承した要約（C）は「餌の約 2/3 は定位点より下流側で捕獲、迎撃速度は期待された最大持続遊泳速度より遅い」。一方、Piccolo ら 2008（A、PROXY）は「全流速で最大持続遊泳速度で迎撃」。前者は出典論文が特定不能で、実験設定（野外か水槽か）も違う（F-19, F-20）。
3. **反応距離の桁**: キングサーモン幼魚の平均 32.7 cm とカットスロートの最大 187.1 cm では約6倍の差。魚種、サイズ、光条件、平均か最大かが違い、単純比較できない（F-21）。
4. **体波の振幅包絡**: サイスの 3 点値から作った二次式（最小は x ≈ 0.25 L）と、要約本文の「最小は 0.1 L、そこからほぼ直線的に増える」が一致しない。振幅が片振幅か peak-to-peak かも資料間で不明。尾端振幅 0.12（ヤマメ稚魚、振幅/全長）、0.17 L（ニジマスのバースト）、0.2 L（一般則）の関係は、定義が揃わず比較できない（F-12, F-13）。
5. **流速の値の混在**: 生息流速 10〜35 cm/s（環境省、B）、登川の幼魚の秋 43.4 ± 23.1 cm/s と冬約 20 cm/s（A）、稚魚の定位点 5 cm/s（計測限界）と区間平均 37 cm/s は、焦点流速・利用場所の平均流速・区間平均流速が混在している。サイズが大きいほど速い流れに出る方向では整合するが、同一基準の表は作れない（F-22）。
6. **Kármán gait の流速範囲**: 出現確率が最大の流速 30〜70 cm/s（ニジマス）は、ヤマメの生息流速 10〜35 cm/s（B）の上限付近より速い。渓流の遅い流れで同じ現象が起きるかは不明（F-16）。
7. **群れの扱い**: Reynolds の boids は群れの結合・整列を前提にするが、ヤマメ幼魚は縄張り性で順位制（A）。水槽写真は同方向を向く個体が多いが、水槽は高密度（P）で根拠にならない（F-05, F-23, F-28）。
8. **日周**: 釣り情報（朝は緩い流れ・昼は速い浅場）、県資料（春先は水温上昇時刻、秋は夕刻）、PROXY（冬は夜行性）、サクラマス稚魚（下流移動は夜、上流移動は昼）は、種・ステージ・季節が違い、同じ軸の比較ではない（F-24）。
9. **M の書誌と実際の誌名・頁**: 本書の Part A の書誌は全て記憶で、r08 で Bainbridge 1958 の頁が検索結果と食い違った前例がある。Part A の頁・年は検証前の値として扱うこと。

---

## 4. 見つからなかったこと（Gaps）— 3Dモデル／アニメ／行動実装に必要だが確認できなかった事項

**A. 検索予算の枯渇により「検索自体ができなかった」課題（最優先で再調査）**
1. **Tu & Terzopoulos 1994 の本文確認**: 質点・バネ・筋の数、運動制御器の種類、知覚（視野角・到達距離・遮蔽）、意図生成器の優先順位・習慣パラメータ・意図の持続の仕組み。F-01〜F-04 は全て M。
2. **Reynolds の操舵行動の本文確認**（GDC 1999 資料は reynolds.org にあると記憶するが未確認、URL を創作しない）。
3. **inSTREAM の決定規則**（期待成熟度の定義、移動範囲と体長の関係、反応距離・捕獲成功率の式、日内の判断の回数）。Railsback ら 2009（PSW-GTR-218）の確認。
4. **ドリフト捕食モデルの式**（Hughes & Dill 1990 の捕獲確率・追跡距離・遊泳コストの式、Hughes ら 2003 の3次元映像の結果＝迎撃距離・復帰時間・定位点の流速）。r09 でも数値は未取得。
5. **ゲームの魚AI・遊泳アニメの事例**: Subnautica、ABZU、Sea of Thieves、その他の GDC 講演・技術ブログ。Utility AI／行動ツリー／状態機械の使い分けと、LOD AI の具体的な頻度・切替距離の実例。**F-09 は実質的に空**。
6. **手続き的魚アニメーションの先行実装**: 脊柱スプライン／ボーンチェーン／波伝播の実装記事や論文、旋回時の曲率付与の具体的な式、ミッドライン制御（長さ保存）の方法。F-11 は一般論の M。
7. **感覚モデルの数値**: 魚の視野（各眼の水平・鉛直、両眼視野の重なり角）、側線の感知距離と閾値、サケ科の視力（解像度）。r07 も未取得。

**B. 継承した Gap（先行ストリームから引き継ぎ、本ストリームでも未解決）**
8. ヤマメ**成魚**（15〜30 cm）の遊泳キネマティクス（f–U 関係、尾端振幅、波長、波速）。ヤマメ稚魚の f–U 実験式の式そのもの（未取得）。
9. 振幅包絡の係数（Di Santo ら 2021 の a0, a1, a2 の代表値、サケ科の値）、頭部のヨー振幅。
10. 低速（定位・徘徊）時の尾鰭振動数・振幅、定位時の微小動作。
11. 反応距離・追跡距離・迎撃距離・復帰時間（ヤマメ）、ストライクの時間経過。
12. 警戒距離（FID）、逃避速度、再出現時間、驚愕から平常に戻るまでの時間（ヤマメ）。
13. 縄張り行動（追い払いの型、頻度、距離）、ライズ（水面摂餌）の運動学。
14. 高速スタートの C 型／S 型の頻度、ヤマメ parr のサイズ依存。
15. サケ科の自然な遊泳でのバースト＆コーストの頻度。
16. 乱流・浅い礫底の渓流での定位保持（entraining／Kármán gait の渓流での出現）。

**C. 再開時に使う検索クエリの候補（検索予算が戻った場合）**
- `Tu Terzopoulos "Artificial fishes" physics locomotion perception behavior learning`
- `Reynolds "Steering behaviors for autonomous characters" GDC 1999`
- `inSTREAM individual-based model trout Railsback PSW-GTR-218`
- `Railsback Harvey "Analysis of habitat-selection rules using an individual-based model" expected maturity`
- `Hughes Dill 1990 position choice drift-feeding salmonids net energy intake model reactive distance`
- `Hughes Hayes Shearer Young 2003 brown trout 3D videography maximum pursuit distance return`
- `procedural fish swimming animation spine bone chain traveling wave game GDC`
- `fish AI game design Subnautica creature behavior` ／ `ABZU fish flocking technical talk`
- `utility AI behavior tree animals game wildlife wildlife AI LOD`
- `trout visual field binocular overlap` ／ `lateral line detection distance trout body lengths`

---

## 5. 出典一覧（URL付き、重複排除。すべて先行ストリーム r07・r08・r09・r11 の検索結果に出たURLの継承。本ストリームでは検索結果に出たURLは0件）

**Part A（M・URL なし。書誌は記憶）**: Tu & Terzopoulos (1994) SIGGRAPH '94; Terzopoulos, Tu & Grzeszczuk (1994) Artificial Life 1(4); Grzeszczuk & Terzopoulos (1995) SIGGRAPH '95; Reynolds (1987) SIGGRAPH '87; Reynolds (1999) GDC; Railsback ら (1999, 2002, 2009); Fausch (1984); Hughes & Dill (1990); Hughes (1998); Isla (2005) GDC; Mark (2009); Dill & Mark (2010) GDC; Orkin (2006) GDC; Colledanchise & Ögren (2018)。

**継承した URL**
- ドリフト捕食: https://www.researchgate.net/publication/237175560_Testing_a_model_of_drift-feeding_using_three-dimensional_videography_of_wild_brown_trout_Salmo_trutta_in_a_New_Zealand_river
- https://www.researchgate.net/publication/261222452_Mechanisms_of_drift-feeding_behavior_in_juvenile_Chinook_salmon_and_the_role_of_inedible_debris_in_a_clear-water_Alaskan_stream
- https://cdnsciencepub.com/doi/10.1139/cjfas-2020-0398
- https://link.springer.com/article/10.1007/s10641-013-0187-6
- https://research.fs.usda.gov/treesearch/31556
- https://openscholar.uga.edu/record/3703/files/MerrittKieranMS.pdf
- https://openscholar.uga.edu/record/20894/files/bozeman_bryan_b_201708_ms.pdf
- https://openscholar.uga.edu/record/11698?ln=en
- https://www.sfu.ca/biology/faculty/dill/publications/f84-139.pdf
- https://www.sfu.ca/biology/faculty/dill/publications/z78-198.pdf
- 体波・定常遊泳: https://www.pnas.org/doi/10.1073/pnas.2113206118 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC8670443/
- https://journals.biologists.com/jeb/article/109/1/77/4184/The-Effect-of-Size-and-Swimming-Speed-on-Locomotor
- https://journals.biologists.com/jeb/article/138/1/51/5554/Steady-Swimming-Kinematics-of-Tiger-Musky-an
- https://journals.biologists.com/jeb/article/109/1/209/4156/Fast-Continuous-Swimming-of-Two-Pelagic-Predators
- https://sicb.org/abstracts/kinematic-analysis-of-burst-and-coast-swimming-in-rainbow-trout/
- ヤマメ稚魚: https://www.jstage.jst.go.jp/article/jsidre/80/2/80_177/_article/-char/ja/ ／ https://www.jstage.jst.go.jp/article/jsidre/79/3/79_151/_article/-char/ja/
- 速度域: https://www.hkd.mlit.go.jp/ob/tisui/kds/chiyodashinsuiro/ctll1r00000054w7-att/bunryu-shiryo-13.pdf ／ https://www.jstage.jst.go.jp/article/jscej1984/1999/622/1999_622_107/_article/-char/ja/
- 胸鰭: https://journals.biologists.com/jeb/article/206/5/813/14090/Function-of-pectoral-fins-in-rainbow-trout ／ https://journals.biologists.com/jeb/article/227/5/jeb246275/344160/Kinematics-and-muscle-activity-of-pectoral-fins-in ／ https://journals.biologists.com/jeb/article/156/1/625/6344/The-Role-of-the-Pectoral-Fins-in-Station-Holding
- Kármán gait／entraining: https://journals.biologists.com/jeb/article/206/6/1059/14048/The-Ka-rma-n-gait-novel-body-kinematics-of-rainbow ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC3749907/ ／ https://journals.biologists.com/jeb/article/213/17/2976/9891/Entraining-in-trout-a-behavioural-and-hydrodynamic ／ https://pubmed.ncbi.nlm.nih.gov/15339945/
- 高速スタート: https://journals.biologists.com/jeb/article/65/1/157/22210/The-Effect-of-Size-on-the-Fast-Start-Performance ／ https://journals.biologists.com/jeb/article-abstract/102/1/115/4213/Speed-Acceleration-and-Manoeuvrability-of-Two ／ https://journals.biologists.com/jeb/article/150/1/321/5700/Fast-Start-Performance-of-Rainbow-Trout-Salmo ／ https://tethys.pnnl.gov/publications/kinematics-performance-fish-fast-start-swimming ／ https://journals.biologists.com/jeb/article/222/18/jeb166009/223422/Escape-responses-of-fish-a-review-of-the-diversity ／ https://pubmed.ncbi.nlm.nih.gov/15755891/ ／ https://pubmed.ncbi.nlm.nih.gov/10229693/
- バースト＆コースト: https://journals.biologists.com/jeb/article/97/1/169/34638/Energetic-advantages-of-burst-and-coast-swimming ／ https://journals.biologists.com/jeb/article/210/12/2181/16867/Kinematics-hydrodynamics-and-energetic-advantages
- 感覚: https://link.springer.com/article/10.1007/s10228-021-00843-0 ／ https://pubmed.ncbi.nlm.nih.gov/17023602/
- 定位場所・順位・日周・警戒: https://link.springer.com/article/10.1007/s10228-010-0201-3 ／ https://www.env.go.jp/council/09water/y0910-03/mat03.pdf ／ https://catalog.lib.kyushu-u.ac.jp/opac_download_md/10879/p073.pdf ／ https://catalog.lib.kyushu-u.ac.jp/opac_download_md/23570/p173.pdf ／ https://fish.shimano.com/ja-JP/content/fishingstyle/article/river/vol41.html ／ https://link.springer.com/article/10.1007/BF02678571 ／ https://sitesreservoirproject.riptideweb.com/references/REF23/Volume%202/App11M_Yolo_Sutter_Bypass_Weir_Spill_Analysis/Grant%20and%20Kramer_1990_Territory%20Size.pdf ／ https://pubs.usgs.gov/publication/70269370 ／ https://www.honda.co.jp/fishing/enjoy/season/season-201704/step-2/ ／ https://www.honda.co.jp/fishing/enjoy/season/season-202107/step-2/ ／ https://www.hro.or.jp/upload/41034/81-kawamura.pdf ／ https://theses.gla.ac.uk/id/eprint/75895 ／ https://www.pref.nagano.lg.jp/suisan/joho/sakanatachi/yamame.html ／ https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3656933/ ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC6634859 ／ https://vocal-communication.bio.bris.ac.uk/pdfs/Rapid_recovery.pdf

**ローカル資料**: /home/user/gerupamasini/docs/yamame/research/r07_eye_head_mouth.md、r08_swim_steady.md、r09_swim_transient.md、r11_ecology_jp.md（継承元）；/home/user/gerupamasini/docs/yamame/photo_analysis/catalog_c01.json〜catalog_c07.json（F-28 の集計）。

---

## 6. 検索ログ（クエリ・mode・有用度、総検索回数）

**実行できた WebSearch: 0 回（割当 26 回のうち 0 回、extended 0 回）。**

| # | mode | クエリ | 結果 | 有用度 |
|---|---|---|---|---|
| 1 | standard | Tu Terzopoulos "Artificial Fishes: Physics, Locomotion, Perception, Behavior" SIGGRAPH 1994 intention generator habits | **未実行**: 「this session has used its web search budget (200 of 200)」と返った | 0 |

- 1 回目で上限到達と判明したため、以後は検索を試みていない。**上限の迂回（WebFetch、curl、他ツール）は行っていない。**
- 検索ではない作業: (a) 先行ストリーム r07、r08、r09、r11 の通読と Grep（継承した所見の再掲。ランクは元ファイルのまま）、(b) catalog_c01〜c07.json（70枚）の Python 集計（context、body_straightness、head_mouth.mouth_state、posture_behavior の通読。F-28）。
- 課題1〜3（Tu & Terzopoulos、Reynolds、inSTREAM、NREI、ゲームAI、Utility AI／行動ツリー、LOD AI）に対する新規の検索結果は 0 件で、F-01〜F-11 は全て M。課題4・5 は継承した所見（F-12〜F-27）で部分的に答えた。
- 再開時のクエリ候補は §4-C に記載。
