# シラタエビ (Exopalaemon orientis) リファレンス調査と設計根拠

本書は実装前に行った調査の記録であり、各項目に確度タグを付す。

| タグ | 意味 |
|---|---|
| **[E]** | シラタエビ（*E. orientis*）で確認された事実（文献・DB） |
| **[R]** | 近縁種（*Exopalaemon* 属、Palaemonidae、Caridea）から推定 |
| **[G]** | ゲーム／映像表現として補完した値（観察的妥当性はあるが文献値ではない） |

## 1. 分類

- **[E]** 学名 *Exopalaemon orientis* (Holthuis, 1950)。原記載は *Palaemon (Exopalaemon) orientis*。
  十脚目 Decapoda > コエビ下目 Caridea > テナガエビ科 Palaemonidae > *Exopalaemon*。
  分布: 日本・台湾・中国沿岸（北西太平洋）。底生〜遊泳性（benthopelagic）、汽水域。
- **[E]** 台湾では養殖池に侵入し、繁殖力が高いため害種とされる（Zool. Stud. 28(2)）。
- **[E]** 幼生飼育: 24.5 °C, 塩分 20 ppt、ふ化後 8–17 日で後期幼生（Zool. Stud. 28(2):139）。汽水適応を示す。

## 2. 形態・プロポーション

| 項目 | 採用値 | 確度 |
|---|---|---|
| 成体全長（額角先端〜尾節末端） | **55 mm**（雌は大型、~50–70 mm の範囲を想定） | [R]/[G] 属の典型サイズより |
| 頭胸甲長（眼窩後縁〜後縁） | 全長の 0.24 | [R] |
| 額角長 | 頭胸甲長の約 1.2（頭胸甲より長い） | [R] *Exopalaemon* 共通 |
| 額角歯式 | 背縁: 基部の隆起冠上に **5–7 歯** + 亜先端に **1–2 歯**、中央部は無歯。腹縁 **6–10 歯** | [R] *Exopalaemon* 属記載（FAO） |
| 額角形状 | 細長く、基部に高い隆起冠、先端は上方にわずかに反る | [R] |
| 腹部 | 6 節、第 6 節が最長（腹部の ~20%）、第 3 節背面が最も高いアーチ | [R] Caridea 一般 |
| 尾節 | 細長い三角、背面に 2 対の棘、先端に 2 対の後端棘 | [R] Palaemonidae |
| 頭胸甲の棘 | 触角棘・鰓前棘（branchiostegal spine）と鰓前溝あり、肝上棘なし | [R] 属の識別形質 |

### 付属肢
- **[R] 第 1 触角**: 3 節の柄部 + 3 本の鞭（外鞭は二叉で短い分枝が融合）。鞭は体長程度。
- **[R] 第 2 触角**: 鱗片（scaphocerite）が大きく、鞭は全長の **1.5–2 倍**と非常に長い。
- **[R] 眼**: 有柄複眼、角膜は黒褐色、額角基部の両側。眼柄は横に 30–40° 開く。
- **[R] 口器**: 第 3 顎脚は歩脚状で前方に伸び、摂餌・グルーミングに使う。
- **[R] 第 1 胸脚**: 細い鋏脚、グルーミング専用に近い（櫛状剛毛）。
- **[R] 第 2 胸脚**: 最も大きい鋏脚。*Exopalaemon* では雄でも *Macrobrachium* ほど肥大しない。
- **[R] 第 3–5 胸脚**: 歩脚、単指（dactylus）、節構成 coxa–basis–ischium–merus–carpus–propodus–dactylus（7 節）。
- **[R] 腹肢（遊泳脚）**: 5 対、二叉型（内肢・外肢）、周縁に羽状剛毛。雄の第 2 腹肢に雄性付属肢。
- **[R] 尾肢**: 内肢・外肢の 2 葉、外肢外縁に可動棘。尾節と合わせ尾扇を形成。

## 3. 外見・透明度・色彩

- **[E]/[R]** 生時はほぼ無色透明〜乳白色。和名「白田蝦」は加熱・死後に白濁する性質とも関連（Palaemonidae 一般の筋肉タンパク変性）[R]。
- **[R]** 体表に赤褐色〜黒褐色の点状色素胞が散在。特に腹節後縁、尾扇縁、触角基部、歩脚関節に集中。
- **[R]** 透けて見えるもの: 消化管（背側を走る暗色の線）、頭胸甲内の中腸腺（黄土〜褐色）、心臓域、成熟雌の卵巣（頭胸甲背側に緑〜黄色）、腹部の横紋筋（乳白色の縞）。
- **[R]** 抱卵雌: 腹肢に楕円卵塊。卵は発生初期に濃緑〜黄緑、発生が進むと透明化し眼点が見える。
- **[G]** 採用色: 殻 = ほぼ無色 (#f4f6f2, 透過率 0.85)、筋肉 = 薄い乳白 (#e9e2d8, 不透明度 0.35)、色素胞 = #6b2e1a / #3a2616。

## 4. 生態・行動

- **[E]** 汽水域・河口・内湾浅所・養殖池。
- **[R]** Palaemonidae の多くは夜行性傾向（夜間に摂餌・遊泳が増え、昼は底や物陰に静止）。
- **[R] 歩行**: 第 3–5 胸脚の 3 対 6 脚で歩行。左右交互・前後にずれたメタクロナル位相。速度 ~0.5–1.5 体長/s。
- **[R] 遊泳**: 腹肢のメタクロナル・ストローク（後方→前方に位相が伝搬、2–6 Hz）。腹部はやや伸展。
- **[R] ホバリング**: 腹肢の低振幅連続拍動＋歩脚を下垂させて姿勢保持。
- **[R] 探索**: 第 2 触角を左右非対称に大振幅で掃く、第 1 触角は小刻みに「フリック」（化学受容の嗅ぎ取り）。
- **[R] 摂餌**: 第 1・第 2 鋏脚で基質をつまみ、第 3 顎脚へ受け渡し。鋏脚が交互に口へ運ばれる。
- **[R] グルーミング**: 第 1 鋏脚の剛毛櫛で触角鞭を根元から先端へしごく。第 5 胸脚で腹部・鰓室を清掃。
- **[R] 逃避（caridoid escape / tail-flip）**:
  - 腹部屈曲 ~30 ms、加速度 >100 m/s²、体の回転 ~75°（*Pandalus danae*, Daniel & Meyhöfer 1989 JEB 143:245）。
  - 刺激後 ~20 ms で運動開始。複数回の連続フリップ（2–4 回）が一般的。
  - 小型個体ほど屈曲・再伸展が速い（同上）。本モデル（55 mm）には屈曲 25 ms、再伸展 60 ms を採用 [R]。
- **[R] 個体間距離**: 群れを作らない緩い集合。接触時に触角で相互確認、~1–2 体長の距離を保つ。
- **[R] 流れ**: 正の走流性（頭を上流へ）。流速が上がると底に脚を張って体高を下げる。

## 5. 設計への反映

- スケール: 1 unit = 1 m、全長 0.055。
- リグ: 節足動物の外骨格は各節が剛体であるため、スキニングではなく **節ごとの剛体メッシュを階層ボーン（Object3D）に直接ぶら下げる**。これは解剖学的に正しく、関節膜の重なりも再現しやすい。
- 触角鞭: Verlet チェーン（第 2 触角 24 節点、第 1 触角 12 節点）＋水抵抗＋基部の能動制御。
- 行動: Utility AI（内部状態 × 環境知覚 × ノイズ × 慣性ヒステリシス）。

## 出典

- SeaLifeBase: *Exopalaemon orientis* — https://sealifebase.org/summary/24573
- BISMaL (JAMSTEC) シラタエビ — https://www.godac.jamstec.go.jp/bismal/j/view/9051194
- Larval development of *Palaemon (Exopalaemon) orientis*, Zoological Studies 28(2):139 — https://zoolstud.sinica.edu.tw/Journals/28.2/139.pdf
- FAO species catalogue (Palaemonidae / *Exopalaemon* 属の形質) — https://www.fao.org/docrep/pdf/009/ad468e/ad468ePX.pdf
- Daniel, T.L. & Meyhöfer, E. (1989) Size limits in escape locomotion of carridean shrimp. J. Exp. Biol. 143:245 — https://cob.silverchair.com/jeb/article/143/1/245/5919/
- Caridoid escape reaction（総説）— https://en.wikipedia.org/wiki/Caridoid_escape_reaction
- Murphy et al., Hydrodynamics of the fast-start caridoid escape response in *Euphausia superba* — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10068603/

### 未確認事項（今後の課題）
- シラタエビ固有の全長分布、額角歯式の個体変異幅は原記載（Holthuis 1950）・日本産標本での確認が必要。
- 実個体の動画計測（歩行速度・腹肢周波数）は未実施。値はすべて [R] であり、動画入手後に `src/shrimp/anatomy.js` の定数を較正すること。
