# シラタエビ (Exopalaemon orientis) — Three.js リアルタイム生体モデル

実寸（1 unit = 1 m、全長 55 mm）で作った、解剖学的に分節したシラタエビのモデル、行動 AI、水中環境です。

```
npm install
npx http-server -c-1 -p 8080 .   # または任意の静的サーバ
# http://localhost:8080 を開く
```

## 構成

| ファイル | 内容 |
|---|---|
| `docs/RESEARCH.md` | 文献調査、および確度タグ（[E] 種で確認 / [R] 近縁種から推定 / [G] ゲーム補完） |
| `src/shrimp/anatomy.js` | 比率・歯式・可動域・運動パラメータ（動画計測で較正するための一元管理） |
| `src/shrimp/geometry.js` | 外骨格チューブ（関節膜属性 `aJoint` 付き）、節（podomere）、額角（歯を形状で表現） |
| `src/shrimp/materials.js` | 外骨格の transmission/IOR/clearcoat/sheen ＋ onBeforeCompile による色素胞・微細凹凸・関節の濃度差 |
| `src/shrimp/ShrimpModel.js` | 頭胸甲・額角・眼・第1/第2触角・第3顎脚・P1–P5・腹節 1–6（側甲付き）・腹肢・尾節・尾肢・内臓・卵塊 |
| `src/shrimp/Flagellum.js` | 触角鞭の Verlet 鎖（水抵抗・曲げ剛性・底面接触） |
| `src/shrimp/Shrimp.js` | 移動の物理、足の IK と raycast 接地、メタクロナル歩容と遊泳、tail-flip、プロシージャルアニメ |
| `src/shrimp/Brain.js` | Utility AI（内部状態、個体性格、softmax による確率選択、慣性、反射層） |
| `src/World.js` | 砂泥底、岩、隠れ家、アマモ、コースティクス、浮遊粒子、流れ場、底質の巻き上げ |

## 操作
- 昼夜スライダ：夜は活動量が上がり、昼は隠れ家を選びやすくなる。
- 流速／流向：正の走流性で上流を向く。流れが強いと体高が下がる。
- クリック：個体を選ぶ／刺激を与える（距離と強さに応じて startle か tail-flip）／餌を落とす（化学受容 → investigate → feed）。
- スローモーション ×0.1 で tail-flip の各相（潜時 20 ms → 屈曲 25 ms → 滑走 → 再伸展 60 ms → 連続フリップ → 姿勢回復）を観察できる。
