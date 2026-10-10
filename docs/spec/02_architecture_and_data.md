# 『干潟図鑑』 アーキテクチャ・フォルダ構成・データ設計（圧縮版 2/4）

版: 0.1（2026-10-01）

---

## 1. 技術スタック

| 層 | 選定 | 備考 |
|---|---|---|
| 言語 | TypeScript 5（strict） | |
| ビルド | Vite | `VITE_BASE` でベースパスを切替。GitHub Pages は `/gerupamasini/` |
| 3D | three ^0.186.0 | WebGLRenderer。WebGL2 必須。`EXT_color_buffer_float` が無い環境は HDR ポストとヒーロー材質を無効化 |
| UI | Preact + @preact/signals | DOM オーバーレイ。ゲーム状態は signals で公開 |
| 検証 | zod | 全 JSON データを起動時とビルド時に検証 |
| 保存 | idb-keyval（IndexedDB） | |
| テスト | vitest、Playwright（同梱 Chromium） | 単体と描画スモーク |
| 整形 | eslint、prettier | 最小構成 |
| パッケージ | npm | ワークスペースは使わない。種のモデルビルダーは `tools/` 配下 |

## 2. システム構成図

```
┌──────────────────────── UI（Preact、DOM オーバーレイ） ────────────────────────┐
│ Title / Loading / HUD / Observe / Capture / Zukan / Tank / Ticket / Menu       │
└────────────▲──────────────────────────────────────────────┬────────────────────┘
             │ signals（状態の購読）                           │ commands（操作）
┌────────────┴──────────────────────────────────────────────▼────────────────────┐
│ App 状態機械: Boot → Title → Field ⇄ Observe → Home(Tank) → Field              │
│ core: GameClock  Save  Input  EventBus  Settings(Quality)  Strings             │
├───────────────────────────────────────────────────────────────────────────────┤
│ world: Terrain  Water  Sky/Sun  TideModel  Habitat（深さ・底質・露出・濡れ）     │
│ player: FPSController  Wading  InteractionRay                                 │
│ creatures: Registry  Spawner  Population  Individual  LODManager              │
│            Brain（BT ランタイム）  Driver（種ごと）  BehaviorRecorder             │
│ systems: Capture(HandNet)  Observation(OrbitCam, timeScale)  Encyclopedia  Tank│
├───────────────────────────────────────────────────────────────────────────────┤
│ render: Renderer  Passes(opaque → hero → post)  QualityPresets  Layers        │
├───────────────────────────────────────────────────────────────────────────────┤
│ data（JSON、zod）: species  behaviors  maps  tide  items  strings  manifest    │
│ assets: models(glb)  textures  audio        save: IndexedDB                   │
└───────────────────────────────────────────────────────────────────────────────┘
```

依存の向き: UI → App → systems → world/creatures → render/core。下位層は上位層を知らない。creatures は three のオブジェクトを持つが UI を知らない。

## 3. フォルダ構成

```
/
├─ index.html
├─ package.json  vite.config.ts  tsconfig.json  .eslintrc.cjs  .prettierrc
├─ .github/workflows/deploy-pages.yml   ci.yml
├─ public/
│  └─ data/
│     ├─ manifest.json                  読み込むデータ一覧とバージョン
│     ├─ species/<species_id>.json
│     ├─ behaviors/<tree_id>.json
│     ├─ maps/<map_id>.json  maps/<map_id>/height.png  substrate.png
│     ├─ tide/stations/<station_id>.json
│     ├─ items/tools.json
│     └─ strings/ja.json
├─ src/
│  ├─ main.ts                           起動
│  ├─ app/        App.ts(状態機械)  GameLoop.ts  Scenes(Field, Tank)
│  ├─ core/       GameClock.ts  Save.ts  Input.ts  EventBus.ts  Settings.ts  Strings.ts  Rng.ts
│  ├─ data/       schemas/*.ts(zod)  loader.ts  ids.ts
│  ├─ tide/       harmonics.ts  astro.ts  TideModel.ts
│  ├─ world/      Terrain.ts  TerrainGen.ts  Water.ts  Sky.ts  Sun.ts  Habitat.ts
│  ├─ player/     FPSController.ts  Wading.ts  InteractionRay.ts
│  ├─ creatures/
│  │  ├─ Registry.ts  Spawner.ts  Population.ts  Individual.ts  IndividualGen.ts  LODManager.ts
│  │  ├─ brain/     BehaviorTree.ts  nodes.ts  conditions.ts  actions.ts  Perception.ts
│  │  ├─ drivers/   Driver.ts(interface)  index.ts(登録)  ClipWalker.ts  ClipSwimmer.ts  ClipFlyer.ts
│  │  ├─ models/    ModelLoader.ts  ModelCache.ts  MaterialTiers.ts
│  │  └─ species/
│  │     ├─ mahaze/        driver(pose.ts, behavior.ts)  hero/(materials glsl)  index.ts
│  │     ├─ shiratae/      placeholder.ts  driver.ts
│  │     └─ shirochidori/  placeholder.ts  driver.ts
│  ├─ systems/    Capture.ts  HandNet.ts  Observation.ts  Encyclopedia.ts  Progress.ts  Tank.ts  Ticket.ts
│  ├─ render/     Renderer.ts  Passes.ts  Quality.ts  Layers.ts  Post.ts
│  ├─ ui/         App.tsx  hud/  zukan/  observe/  capture/  tank/  ticket/  menu/  store.ts
│  └─ assets/     models/<species_id>/*.glb  textures/  audio/
├─ tools/
│  ├─ models/mahaze/   既存ビルダー（build.mjs、anatomy.mjs …）
│  ├─ terrain/bake-map.mjs            地形生成 → height.png と substrate.png
│  └─ data/validate.mjs               全 JSON の zod 検証
├─ tests/          unit/  smoke/
└─ docs/           planning/  spec/
```

マハゼの既存ブランチは履歴ごとマージし、`src/` と `tools/` と `models/` を上記へ移動する。vendor の three.js は削除して npm に置き換える。

## 4. 実行時の構成

### 4.1 起動
1. 設定読み込み、WebGL2 と拡張の検出、品質プリセットの決定。
2. `manifest.json` を読み、全データを並列取得して zod で検証。失敗はエラー画面。
3. 地図: `height.png`（16 bit グレースケール）を Float32 配列へ、`substrate.png` を底質インデックスへ。地形メッシュ生成。
4. 潮位観測点を読み、TideModel を初期化。
5. 種レジストリを構築。遠景モデル（lod2）を先読み。ヒーローと lod1 は必要時に遅延読み込み。
6. セーブがあれば復元。タイトルへ。

### 4.2 ループ
`requestAnimationFrame` 駆動、`dt` は 0.1 秒で頭打ち。順序:
1. GameClock.update（現実時刻、チケット残り）
2. TideModel.level(now) → Water.setLevel、Sun.update(now)
3. Habitat.update（2 秒ごと。水位変化を深さと露出に反映）
4. Spawner.update（1 秒ごと。プレイヤー周辺のセルを評価）
5. Brain.tick（個体の LOD に応じて 5 / 2 / 0.5 Hz）
6. Driver.update（近距離は毎フレーム、中距離は 2 フレームに 1 回、遠距離は 4 フレームに 1 回）。観察モードの `simScale` を dt に掛ける。GameClock には掛けない。
7. Player.update、InteractionRay、Observation.update
8. Render

### 4.3 シーン
Field と Tank は別の `THREE.Scene`。レンダラーとモデルキャッシュは共有。切替時は Field を保持したまま非表示にし、戻るときに再利用する。

### 4.4 描画パス
- 低・中品質: 直接描画。`renderer.toneMapping = ACESFilmic`。
- 高品質またはヒーロー表示あり: 不透明パス → RT（HalfFloat、MSAA 4）→ ヒーローパス（RT を `uBg` として参照）→ ポスト（ブルーム、ACES、ビネット）。マハゼビューアと同じ構成。
- レイヤー: 0 既定、1 水面、2 ヒーロー個体、3 ヒーローの奥に描くひれ。

## 5. 主要インターフェース

```ts
// core/GameClock.ts
export interface TicketState { targetGameMs: number; startedRealMs: number; remainingSec: number; paused: boolean }
export interface GameClock {
  nowReal(): number;          // Date.now()
  nowGame(): number;          // チケット中は再現時刻、通常は nowReal()
  ticket: TicketState | null;
  useTicket(targetGameMs: number): void;
  cancelTicket(): void;
  update(): void;
}

// tide/TideModel.ts
export interface TideModel {
  level(tMs: number): number;                       // 平均海面からの高さ [m]
  extrema(fromMs: number, toMs: number): { t: number; level: number; kind: 'high' | 'low' }[];
}

// world/Terrain.ts
export type Substrate = 'sand' | 'muddy_sand' | 'mud' | 'gravel' | 'channel';
export interface Terrain {
  size: number; res: number;
  heightAt(x: number, z: number): number;           // T.P. [m]
  normalAt(x: number, z: number, out: Vector3): Vector3;
  substrateAt(x: number, z: number): Substrate;
}

// world/Habitat.ts
export type HabitatTag = 'exposed_sand' | 'exposed_mud' | 'waterline' | 'shallow' | 'pool' | 'channel' | 'deep';
export interface HabitatSample { depth: number; substrate: Substrate; exposed: boolean; wetness: number; distToWater: number; tags: HabitatTag[] }

// creatures/Individual.ts
export interface Individual {
  id: string; speciesId: string;
  pos: Vector3; heading: number;
  length_mm: number; weight_g: number; sex: 'm' | 'f' | 'unknown'; stage: string; traits: string[];
  alert: number;                                     // 0..1
  lod: 0 | 1 | 2 | 3;                                // 0 = hero
  brain: BrainState; driver: Driver | null;
}

// creatures/drivers/Driver.ts
export type IntentKind = 'rest' | 'wander' | 'moveTo' | 'flee' | 'forage' | 'display' | 'burrow' | 'special';
export interface Intent { kind: IntentKind; target?: Vector3; from?: Vector3; urgency: number; param?: string }
export interface DriverContext { terrain: Terrain; waterLevel: number; habitat: HabitatSample; player: Vector3; simScale: number }
export interface BehaviorEvent { individualId: string; behaviorId: string; t: number }
export interface Driver {
  attach(root: Object3D, model: LoadedModel, individual: Individual): void;
  setIntent(intent: Intent): void;
  update(dt: number, ctx: DriverContext): void;
  onEvent(cb: (e: BehaviorEvent) => void): () => void;
  dispose(): void;
}
```

## 6. データ設計

### 6.1 ID 規約
- 種 ID は学名の小文字スネークケース: `acanthogobius_flavimanus`（マハゼ）、`exopalaemon_orientis`（シラタエビ）、`charadrius_alexandrinus`（シロチドリ）。
- 行動 ID はスネークケース: `rest`, `dart`, `yawn`, `flee`, `forage_peck`, `tail_flip_escape`。
- 地図 ID: `kasai_west`。観測点 ID: `jma_tokyo`。

### 6.2 種データ `species/<id>.json`

```json
{
  "id": "acanthogobius_flavimanus",
  "names": { "ja": "マハゼ", "sci": "Acanthogobius flavimanus", "en": "Yellowfin goby" },
  "taxon": { "group": "fish", "family": "Gobiidae" },
  "collectable": true,
  "protected": false,
  "model": {
    "hero": "mahaze/mahaze_juvenile.hero.glb",
    "lod1": "mahaze/mahaze_juvenile.lod1.glb",
    "lod2": "mahaze/mahaze_juvenile.lod2.glb",
    "modelLength_mm": 50.5,
    "driver": "mahaze",
    "clips": { "idle": "Idle", "move": "Swim", "special": ["Yawn"] }
  },
  "size": { "length_mm": { "min": 40, "max": 200, "mean": 95, "sd": 35 }, "weightCoef": { "a": 8.7e-6, "b": 3.1 } },
  "sex": { "maleRatio": 0.5 },
  "stages": [ { "id": "juvenile", "ja": "幼魚", "maxLength_mm": 60 }, { "id": "young", "ja": "若魚", "maxLength_mm": 110 }, { "id": "adult", "ja": "成魚" } ],
  "traits": [ { "id": "large", "ja": "大型個体", "when": "length_pct>=90" }, { "id": "small", "ja": "小型個体", "when": "length_pct<=10" } ],
  "variation": { "scaleFromLength": true, "tint": { "hueDeg": [-6, 6], "sat": [0.9, 1.1], "val": [0.9, 1.05] } },
  "spawn": [
    { "tags": ["shallow", "pool"], "substrate": ["sand", "muddy_sand", "mud"], "depth_m": [0.05, 1.0],
      "time": ["day", "dusk", "night"], "season": ["spring", "summer", "autumn"], "tide": "any",
      "density_per_100m2": 1.2, "group": [1, 3], "maxPopulation": 40 }
  ],
  "brain": { "tree": "fish_benthic", "params": { "fleeDistance_m": 1.6, "restMean_s": 20, "dartDistance_m": [0.06, 0.16] } },
  "capture": { "tools": ["hand_net"], "baseDifficulty": 0.5, "alertPenalty": 0.4 },
  "encyclopedia": {
    "description": "内湾の砂泥底に多いハゼ。…",
    "habitatHint": "浅い水中や潮だまりの砂泥底。",
    "behaviors": [
      { "id": "rest", "ja": "着底休止" }, { "id": "dart", "ja": "ダッシュ" }, { "id": "yawn", "ja": "あくび" },
      { "id": "alert", "ja": "警戒姿勢" }, { "id": "flee", "ja": "逃走" }
    ],
    "placeholderModel": false
  }
}
```

要点:
- `model.driver` が未指定なら汎用ドライバ（`clipWalker` / `clipSwimmer` / `clipFlyer`）を `taxon.group` と `locomotion` から選ぶ。
- `spawn[]` の各要素は独立した出現ルール。`tags` と `substrate` は Habitat の値で評価、`time` は太陽高度から（day / dusk / night / dawn）、`tide` は `any` / `low` / `rising` / `high` / `falling`。
- `encyclopedia.behaviors[].id` はドライバが発火する `BehaviorEvent.behaviorId` と一致させる。

### 6.3 行動ツリー `behaviors/<tree_id>.json`
03 で定義。ノード型は `selector`, `sequence`, `condition`, `action`, `cooldown`, `random`。条件と行動は名前でカタログ参照し、引数は `params` から差し込める（`"$fleeDistance_m"`）。

### 6.4 地図 `maps/<map_id>.json`

```json
{
  "id": "kasai_west", "names": { "ja": "西のなぎさ" },
  "station": "jma_tokyo",
  "origin": { "lat": 35.636, "lon": 139.858 },
  "size_m": 320, "resolution": 256,
  "height": { "file": "kasai_west/height.png", "min_tp_m": -2.0, "max_tp_m": 3.0 },
  "substrate": { "file": "kasai_west/substrate.png", "palette": ["sand", "muddy_sand", "mud", "gravel", "channel"] },
  "spawnStart": { "x": 20, "z": -140, "heading": 180 },
  "bounds": { "walkable": [[-160, -160], [160, 160]], "noEntry": [] },
  "props": []
}
```

### 6.5 潮位観測点 `tide/stations/<id>.json`

```json
{
  "id": "jma_tokyo", "names": { "ja": "東京" }, "lat": 35.65, "lon": 139.77,
  "phaseReference": "JST135E", "mslAboveChartDatum_cm": null,
  "constituents": [
    { "name": "M2", "amplitude_cm": 47.73, "phase_deg": 153.73 },
    { "name": "S2", "amplitude_cm": 23.64, "phase_deg": 181.77 },
    { "name": "K1", "amplitude_cm": 25.07, "phase_deg": 178.91 },
    { "name": "O1", "amplitude_cm": 19.57, "phase_deg": 160.28 }
  ],
  "source": { "name": "気象庁 潮汐調和定数（60 分潮）東京 2025", "note": "暫定 4 分潮。全 60 分潮へ差し替え予定" }
}
```

### 6.6 アイテム `items/tools.json`
`{ "id": "hand_net", "ja": "手網", "type": "capture", "targets": ["fish", "crustacean"], "minigame": "timing", "params": { "barSpeed": 1.2, "bandWidth": 0.22 } }`

### 6.7 文字列 `strings/ja.json`
UI 文字列は全部ここ。種名と解説は種データ側に持つ。

### 6.8 検証
`tools/data/validate.mjs` が zod スキーマで全 JSON を検証し、種の `behaviors[].id` がツリーで発火可能か、`model` のファイルが存在するか、`tree` が存在するかを突き合わせる。`npm run check` と CI で実行。

## 7. パフォーマンス設計

### 7.1 予算（中品質、1280×720、dpr 1）
| 項目 | 予算 |
|---|---|
| ドローコール | 300 以下 |
| 三角形 | 150 万以下 |
| 地形 | 256×256 グリッド、1 ドローコール、底質はスプラット 1 マテリアル |
| 水面 | 1 ドローコール |
| 空 | 1 ドローコール |
| 生物 | lod1 最大 4 体（各 10 万三角形以下）、lod2 最大 200 体（各 4 千以下）、鳥は lod2 を 120 m まで |

### 7.2 LOD と更新頻度
| 段階 | 条件 | ジオメトリ | 材質 | 駆動 | 脳 |
|---|---|---|---|---|---|
| 0 ヒーロー | 観察ロック中、水槽 | hero.glb | 独自シェーダー（マハゼ）または標準 | 手続き | 5 Hz |
| 1 近距離 | 6 m 以内、近い 4 体まで | lod1.glb | 標準 PBR（透過あり） | 手続きまたはクリップ、毎フレーム | 5 Hz |
| 2 中距離 | 40 m 以内（鳥は 120 m） | lod2.glb | 標準 PBR（透過なし、ひれは alphaTest） | クリップ、2 フレームに 1 回 | 2 Hz |
| 3 遠距離 | それ以外 | 非表示（鳥のみ点ビルボード） | なし | 位置のみ、4 フレームに 1 回 | 0.5 Hz |

- 全個体にバウンディングスフィアを持たせ、フラスタムカリングを有効にする。
- 同一 lod2 モデルはジオメトリとマテリアルを共有。スキン付きなのでインスタンス化はせず、個体ごとの `SkinnedMesh` で `AnimationMixer` の更新間引きを行う。将来 200 体超が必要になればベイク済み頂点アニメーションテクスチャへ移行する。
- テクスチャ: hero 2048、lod1 1024、lod2 512。KTX2 圧縮は翌週以降。

### 7.3 品質プリセット（27 回目で 4 段。`src/core/Settings.ts` の `QUALITY_PRESETS`）
| 段 | 内容 |
|---|---|
| 超軽量 | dpr 0.67 かつ 90 万画素まで、マルチサンプルなし、影なし、水の軽い式（波 1 本おき、泡 1 回読み、汀のノイズなし）、寄せ波の立体化なし、鏡なし、生物 35 %・描画距離 0.6 倍（鳥は除く、8 m 以上）、牡蠣 2,000、アマモ 35 %、接地影なし、水槽の波紋・集光・光芒を間引く、ヒーロー材質なし |
| 低 | dpr 1 かつ 160 万画素まで、マルチサンプルなし、影なし、生物 60 %・描画距離 0.85 倍、牡蠣 5,000、アマモ 60 % |
| 中 | dpr 1 かつ 300 万画素まで、マルチサンプル 4、影 1024、鏡 0.4、寄せ波の立体化 12 歩 |
| 高 | dpr 1.5 かつ 600 万画素まで、マルチサンプル 4、影 2048、鏡 0.5、寄せ波の立体化 16 歩、アマモの影 |

初回起動（保存した設定なし）で GPU 名が内蔵（Intel / AMD の APU / Mali / Adreno / PowerVR）かソフトウェア描画なら「低」で始めて保存する。描画バッファの縮小は 0.5 倍が下限。設定で変更可。干潟で 20 fps を下回る時間が続くと「超軽量」を案内するトースト。

## 8. ビルドと配布

- `npm run dev` 開発、`npm run build` 本番、`npm run check`（tsc、eslint、vitest、データ検証）、`npm run smoke`（Playwright でスクリーンショット）。
- モデルは `src/assets/models/` に置き `?url` で取り込む。ハッシュ付き URL になりキャッシュが壊れない。
- GitHub Pages: `.github/workflows/deploy-pages.yml` が `main` への push と手動実行で動く。リポジトリ設定で Pages の Source を GitHub Actions にする。github-pages 環境のデプロイ可能ブランチが `main` のみの場合、作業ブランチを `main` へ反映する必要がある。
- 読み込み画面で 19 MB のヒーローモデルは遅延読み込みにし、初回表示は lod2（1 MB 前後）で始める。

## 9. Git 運用

- `main` は配布可能な状態を保つ。作業は `claude/*` ブランチ。
- コミット接頭辞: `feat:` `fix:` `data:` `model:` `docs:` `chore:`。
- データだけの変更はコードレビュー不要。`npm run check` が通ること。

## 10. 拡張手順

種の追加:
1. `public/data/species/<id>.json` を書く。
2. 行動ツリーを既存から選ぶか `behaviors/<tree>.json` を追加。
3. `tools/models/<id>/build.mjs` でモデル 3 段階を生成し `src/assets/models/<id>/` へ。
4. 汎用ドライバで足りない場合だけ `src/creatures/species/<id>/driver.ts` を追加し `drivers/index.ts` に登録。これが唯一のコード変更。
5. `npm run check` で検証。

地域の追加:
1. `tools/terrain/bake-map.mjs` で `height.png` と `substrate.png` を生成。
2. `maps/<id>.json` と `tide/stations/<id>.json` を追加。
3. 種データの `spawn[]` に地域条件 `maps` を足す（省略時は全地域）。
