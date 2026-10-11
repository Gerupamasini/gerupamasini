# 干潟図鑑 — Steam 版（UE5）

Steam 版は Unreal Engine 5 で作る（決定は `docs/planning/10_engine_decision.md`、計画は `docs/planning/11_ue5_port_plan.md`）。
Web 版（リポジトリ直下、Three.js）とデータ（`public/data/`）を共有する。

## 準備（Windows）

1. Unreal Engine 5.8（5.8.3 で開発）と Visual Studio 2022（「C++ によるゲーム開発」）を入れる。別の版を使う場合は `HigataZukan/HigataZukan.uproject` の `EngineAssociation` を変える
2. Git LFS を入れる（`git lfs install`）。`.uasset` / `.umap` は LFS に入る
3. リポジトリ直下で `npm ci` と `npm run unreal:sync-data` を実行する。`public/data/` の JSON が `HigataZukan/Content/Data/` に写る
4. `HigataZukan.uproject` を右クリック →「Generate Visual Studio project files」を選び、開いてビルドする

## 構成

| 場所 | 内容 |
|---|---|
| `HigataZukan/Source/HigataZukan/` | ゲーム本体のモジュール |
| `HigataZukan/Source/HigataTide/` | 潮汐。`TideCore/` は UE のヘッダーを使わない C++（`src/tide/` の移植）、`UTideSubsystem` はブループリントとゲームから使う窓口 |
| `tests/tide/` | `TideCore` のゴールデンテスト。UE なしでビルドでき、CI で動く |

## 潮汐の使い方

```cpp
UTideSubsystem* Tide = GetGameInstance()->GetSubsystem<UTideSubsystem>();
Tide->LoadStation(TEXT("jma_yokosuka"));             // Content/Data/tide/stations/jma_yokosuka.json
const double LevelM = Tide->GetLevelAt(FDateTime::UtcNow());   // 平均水面からの高さ（m）
TArray<FTideExtremum> Today = Tide->GetExtrema(FromUtc, ToUtc);
```

ブループリントからも同じ名前で呼べる（カテゴリ「Tide」）。

## テスト

```bash
npm run unreal:test-tide     # C++ の潮汐が TypeScript と一致するか（CMake と C++17 のコンパイラが必要）
```

`src/tide/` を意図して変えたときは、次の手順で両方をそろえる。

1. `npx vitest run tests/unit/tideGoldenUnreal.test.ts -u` でフィクスチャを作り直す
2. 同じ変更を `TideCore.cpp` に入れる
3. `npm run unreal:test-tide` が通ることを確かめる
