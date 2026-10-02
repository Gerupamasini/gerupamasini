# 実装契約（モジュール間の約束）— 変更するときは必ず全員に通知

対象: ヤマメ 3D モデルのビルドパイプライン（`tools/build-assets/*.mjs`）。仕様の正準は `docs/yamame/spec/`。

## 1. 座標・単位
- 単位はメートル。基準個体 SL = 0.19 m（`assets/src/params.json` の `sl_m`）。
- 軸: **+X = 前（吻）, +Y = 上（背）, +Z = 右**。休止姿勢は直線。体のローカル原点は s = 0.5（`x = (0.5 − s)·SL`）。
- `s`: 吻端 0 〜 尾鰭基部 1（SL 弧長の比）。`s < 0` は丸い吻の端（キャップ、長さ `cap_length_over_sl` = 0.016）。
- `alpha`: 体軸まわりの角。**0 = 背正中線, π/2 = 右体側(+Z), π = 腹正中線, 3π/2 = 左体側**。
- 体表面関数は `tools/build-assets/surface.mjs` の `createSurface(params)`:
  `point(s, alpha, offset=0)`（offset は外向き法線方向の m）, `normal(s, alpha)`, `section(s)`（c, h, w: SL 比。中心高さ・半高・半幅）, `alphaAtHeight(s, y_m)`, `sToX/xToS`。
  **この関数が体のロフトの正準**。各モジュールはこれを使って体への取り付け位置を決める（体メッシュ本体は別途 loft.mjs が同じ関数から作る。頭部の細部＝眼窩・鰓蓋・口は loft 側で追加の変位を入れるので、体への取り付けは 0.3〜0.5 mm 体内へ埋め込んで隙間を作らないこと）。

## 2. 体の UV（`textures.mjs` が従う）
- 第1 UV: **u = clamp(s, 0, 1), v = alpha / (2π)**（v は 0〜1 で一周、背正中線に継ぎ目。継ぎ目の頂点は v=0 側と v=1 側に分ける）。
- テクスチャ画像は左上原点（PNG 通常）。**画像の x = u·(W−1), y = v·(H−1)**（glTF の UV 規約: 左上が (0,0)）。v=0.25 付近が右体側の中央、v=0.75 が左体側の中央、v=0.5 が腹の中心。
- 模様は**物理スケール**で作る: 鱗ピッチなどは SL 0.7%（約 1.3 mm）。u 方向の物理長は `(s)·SL`、v 方向の円周は s ごとに異なるので、`surface` から各 s の周長を数値積分して物理座標へ写してから模様を作る。

## 3. 色空間・出力形式
- アルベド = sRGB（8bit RGBA）、法線 = 線形（タンジェント空間、緑 = +V 方向 ... **glTF 規約: 緑チャンネル = 上向き（+Y of tangent frame）**）、ORM = 線形（R = AO, G = roughness, B = metalness）。
- 画像は `{width, height, data: Uint8Array RGBA}`。PNG 保存は `tools/build-assets/png.mjs` の `writePng(file, img)`。
- 純粋関数・Node のみ（three.js に依存しない）。乱数は seed 付き（`mulberry32` など）で**決定論的**。外部ネットワーク不要。

## 4. ボーン名（リグ; 脊椎・顎などは loft/rig 側が担当）
`fish_root`, `spine_00..spine_23`（s_j = j/24）, `jaw_lower`, `maxilla_L/R`, `hyoid`, `opercle_L/R`, `eye_L/R`,
鰭: `pectoral_L/R`（基部）+ ray 群 3（`pectoral_L_r0..r2`）, `pelvic_L/R`（+ r0..r1）, `dorsal_hinge`（+ `dorsal_r0..r2`）, `anal_hinge`（+ `anal_r0..r1`）, `adipose_01/02`, `caudal_hub`, `caudal_ray_u2,u1,mid,l1,l2`。
鰭モジュールは頂点属性で「どの条群に属するか」を渡す（下記）。

## 5. モジュール別インターフェース
### 5.1 `tools/build-assets/textures.mjs`
```js
export function generateBodyTextures({ surface, params, genome = {}, seed = 1, width = 2048, height = 1024 })
  -> { albedo, normal, orm, mouth: { albedo }, report }   // report: 生成した模様の記録（パーマークの位置・大きさ、黒点数、色など）
export function renderLateralPreview({ surface, textures, side: 'right'|'left', pxPerMeter }) -> image   // 側面直交の簡易プレビュー(CPU)
```
`genome` は任意（未指定は spec 03 の既定）。仕様: `docs/yamame/spec/03_色彩模様仕様.md`（パーマーク個数・位置・形・色、黒点、桃色帯、背/体側/腹の色、銀、鱗の見え方、個体差）。参照: `docs/yamame/photo_analysis/*`。

### 5.2 `tools/build-assets/fins.mjs`
```js
export function buildFins({ surface, params, genome = {}, seed = 1 })
  -> { geometry: { positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint32Array,
                   attrs: { _FINID: Float32Array,   // 0 dorsal,1 adipose,2 pectoral_R,3 pectoral_L,4 pelvic_R,5 pelvic_L,6 anal,7 caudal
                            _FINT: Float32Array,    // 鰭の条方向の位置 0(前縁側)〜1(後縁側)
                            _FINR: Float32Array } },// 付け根 0 〜 先端 1
       ranges: [{ name, start, count }], // indices の範囲
       textures: { albedo (RGBA, alpha=膜の透明度), normal, orm }, report }
```
鰭は半透明の膜（条の隆起・条間の薄い膜・先端の透け・縁の色）。**板ポリに見えない**こと: 条ごとの微細な起伏、縁のゆらぎ、付け根の肉質の盛り上がり、鰭ごとの自然な反り。脂鰭は肉質の小さな葉（厚みのある立体、不透明）。

### 5.3 `tools/build-assets/eyes.mjs`
```js
export function buildEyes({ surface, params, genome = {}, seed = 1 })
  -> { left: EyeAsset, right: EyeAsset, textures: { iris: image, ... }, report }
// EyeAsset = { center: [x,y,z] (体ローカル, 眼ボーンの位置), axis: [x,y,z] (視線方向), radius,
//              parts: { ball: Geo, cornea: Geo, orbit: Geo } }   // Geo = { positions, normals, uvs, indices } は眼ローカル座標（原点=眼球中心、+Z=視線方向、+Y=上）
```
眼は「黒い瞳孔・金〜黄の細い虹彩環・その外側の暗い眼窩縁/強膜・透明な角膜」。spec 02 §2.7 / 06 §6.6。

## 6. 作業規則
- 自分の担当ファイル（と `tests/unit/<module>.test.mjs`）だけを編集する。`surface.mjs`, `params.json`, 他モジュールは編集しない（変更が必要なら最終報告で提案）。
- 生成物のプレビューは `/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/preview/` に置く（リポジトリには画像を入れない）。headless 描画は `node tools/headless/render-snapshot.mjs "/viewer/<page>.html" <out.png>`（`window.__ready = true` で撮影）。three は `/node_modules/three/build/three.module.js`（importmap は `viewer/smoke.html` を参照）。
- 数値の根拠は spec のタグを引く。資料に無い設計値はコードコメントに `[E]` と書く。
