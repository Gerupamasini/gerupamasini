# 水槽基本設備

[実装画面のスクリーンショット（正面・背面）](screenshots/README.md)

`src/aquarium/` はメートル単位の独立した Three.js `Group` を提供する。水槽本体・台・蓋・2種類の照明・5種類のろ過/循環機器・エア設備・温度管理・電源・可変ホース/コードを同じ規格で扱う。ゲームでは自宅 → 水槽 → **設備** から配置、回転、ON/OFF、流量、設定温度、接続を変更できる。**配管・背面を見る** でサービス側を確認できる。

## 設計基準と調査の範囲

一般的な60 cm水槽、外部式/水中式/上部式/エアリフト式ろ過、100 Wのガラス管ヒーターを基準にした汎用品デザイン。メーカーのロゴ、製品名、固有の筐体形状は使用しない。

構造確認のために下記の公式製品ページを取得したが、このクラウド環境ではいずれもHTTP 403で拒否された。ページ内容を閲覧・検証したとは扱っていない。寸法は本実装の設計値であり、特定製品の測定値ではない。

- [Fluval 107 外部フィルター](https://fluvalaquatics.com/us/shop/product/107-performance-canister-filter)
- [Aqueon QuietFlow 水中フィルター](https://www.aqueon.com/products/filtration-media/quietflow-internal-power-filters)
- [Aqueon 水槽ヒーター](https://www.aqueon.com/products/heating/preset-heaters)

| 設備 | 設計寸法/構造 | 配置・接続 |
| --- | --- | --- |
| AquariumTank | 内寸600 × 300 × 360 mm、ガラス6 mm、水位300 mm | 底板・側板・縁・シリコン継ぎ目。吸水/吐水の端子は背面上縁 |
| AquariumStand | 高さ730 mm、台面640 × 340 mm | 木製の扉付きキャビネット、または金属脚・背面筋交い。背面は配管用に開放 |
| GlassLid | 4 mmの2分割ガラス、後部45 mmのサービス開口 | 支持クリップ、取っ手。ホースを蓋に貫通させない |
| LightFixture / LEDLight | 幅614 mm、金属筐体、独立支持アーム・発光面 | 電源端子。ON/OFFは発光・実ライト・水面反射/コースティクスへ連動 |
| Filter | 42 × 150 × 40 mm | 水中モーター・吸水スリット・ノズル・吸盤 |
| CanisterFilter | 約151 × 283 × 146 mm | 台の内部。吸水管 → IN → キャニスター → OUT → 吐水管 |
| TopFilter | 幅390 mm、蓋付きボックス | 水中ポンプ、揚水管、濾過槽、重力落水管、支持部を1つの独立Groupに収納 |
| SpongeFilter | 直径82 mm、揚水管高さ約220 mm | エア口 → 多孔質スポンジ → エアリフトの出口。気泡は出口から発生 |
| AirPump / AirStone | ポンプ85 × 54 × 53 mm、ストーン35 × 8 × 13 mm | ポンプは背面の防振棚。4 mm外径のエア管に逆止弁を付ける |
| Heater | 直径16 mm、長さ約200 mm | ガラス管・内部素子・キャップ・吸盤。水中に設置 |
| Thermometer / Thermostat | 32 × 23 mmの水温計、70 × 95 mmの制御器 | 水温計のセンサー出力 → サーモ入力 → ヒーター電源。3桁の温度を実ジオメトリで表示 |
| FlowPump / CirculationPump | 約46 mmのガード付きポンプ/40 mm角の小型ポンプ | 吸盤、吐出方向、流量を保持。水中にある吐出口のみ水流を出す |
| Chiller | 220 × 300 × 270 mm | 台の横。通気グリル、表示器、IN/OUT、脚、電源。外部フィルター後段に直列接続 |
| PowerStrip | 270 × 25 × 42 mm、6口 | 背面の乾いた位置。壁コンセント → タップ → 機器。追加タップへの給電も可能 |
| Cable / Hose | 可変始点・終点・中間点・半径・たわみ | CatmullRomCurve3 + TubeGeometry。ホース外径16 mm、エア管外径4 mmを標準とする |

## 共通API

```ts
import { AquariumEquipment, EquipmentMaterials, Heater, Hose } from '@/aquarium';

// 一式。dimensionsを変更すると水槽・台・照明・蓋と標準配置がサイズに追従する。
const equipment = new AquariumEquipment({
  width: 0.9, depth: 0.45, height: 0.45, glass: 0.008, waterHeight: 0.38,
});
scene.add(equipment);
equipment.update(dt, camera, renderer.domElement.height);
const velocity = equipment.sampleFlow(worldPosition); // m/s、近傍のみ。流量の設定単位はL/h
const saved = equipment.currentLayout; // JSONで保存できる独立コピー
equipment.setLayout(saved);

// 単体配置も同じ共有パレットを使う。
const materials = new EquipmentMaterials();
const heater = new Heater({ materials });
const hose = new Hose(materials, [0, 0.4, -0.2], [0, -0.4, -0.2], 0.008,
  [[0.1, 0.4, -0.2], [0.1, -0.4, -0.2]], 0.03);
hose.setPath([0, 0.4, -0.2], [0.2, -0.4, -0.2]);
```

全機器は外部に安定した接続端子を持つ。端子は`kind: power | water | air | sensor`、`role: in | out`、局所座標、向き、半径を持つ。端子はLODの外にあるので、表示切替で接続点が動かない。`connect()`は端子の種別、向き、使用済み端子、口径、電源等の循環を検証し、問題があれば日本語の理由を返す。各端子は1対1。分岐を暗黙に生成しない。

`ConnectionRecord.via`で背面の通し位置を指定できる。指定がなければ、接続端子の向きに沿った出口、上縁を越える経路、背面の水平/垂直経路、電源のドリップループを生成する。設備の位置・回転変更後に配管を再構築する。`AquariumEquipment`全体の移動・Y回転にも対応する。水面は水平を前提とする。

`autoConnect()`は配線を標準構成へ置き換える。外部フィルターがあれば閉じた水回路を作り、クーラーがあれば直列に入れる。エアポンプは1台につきストーンまたはスポンジ1台を接続する。追加設備を置くだけでは自動的に通電させない。電源タップが不足した場合は追加・手動接続できる。

## 描画と動作

- LOD0: 0〜0.95 m、面取り、フィン、スリット、ネジ。LOD1: 0.95〜1.9 m、円周分割を削減、細部を省略。LOD2: 1.9 m以上、基本シルエット。細い配線は遠距離で非表示。距離はThree.js LODによるカメラ距離。
- 静的ジオメトリは各機器の`body / supports / emitter / detail`内で材質ごとに結合する。フィンやグリルの数だけdraw callを増やさない。全LODでマテリアルを共有する。
- 共通材質はglass、black plastic、clear plastic、rubber、metal、painted metal、wood、silicone。セラミック、表示、発光ON/OFF用の共通材質のみ追加。微細な凹凸と粗さ、木目、薄いホースの曇りを小さな共有DataTextureで表す。外部テクスチャ/フォントやRigは不要。
- 水槽単体はIOR 1.52の物理ガラス。ゲーム統合では既存の光学ガラスシェーダーと水の屈折・吸収・反射・コースティクスを再利用する。照明の位置と方向の変更も水シェーダーに渡す。
- 発泡は1設備48点、1drawの粒子シェーダー。エア接続・通電・水中設置に連動し、浮上・微細な揺れ・水流による変位・水面の波紋を持つ。
- ポンプは`{ position, direction, flowRate, radius, device }`を公開する。吐出方向/流量を既存水面の方向性のある微小波と波紋へ渡す。生物の遊泳挙動への強制移流は追加していない。
- 水温計は電池式として扱う。サーモスタットはセンサー接続が必要で、±0.2 °Cのヒステリシスでヒーター給電を制御する。クーラーは±0.3 °C。熱モデルは水量・100 Wヒーター・150 W冷却・室温22 °Cへの緩い放熱を用いる簡易モデルで、化学/水質シミュレーションではない。
- 編集中は既存の仕様通り時間を止める。配置、ON/OFF、LODと照明は反映する。動く気泡・温度推移・水面シミュレーションは自宅画面に戻ると再開する。
- `dispose()`で機器・配管のジオメトリを破棄する。共有パレットは所有者が最後に一度だけ破棄する。

保存先は既存の`SaveV1.tank.layout.equipment`。従来のセーブに設備がなければ標準一式を追加し、既に設備データがあるセーブでは取り外した機器を勝手に復活させない。座標、有限値、識別子、接続を復元時に検査する。

## 検証

```bash
npm run check
npm run build
CHROMIUM_PATH=/usr/bin/chromium node tests/smoke/aquarium.mjs
```

単体テストは全機器・3段階LOD・共通材質・有限ジオメトリ、可変寸法、端子追従、循環/重複の拒否、電源の伝播、空の水回路、温度制御、保存復元を検証する。専用ブラウザテストは設備UI、電源OFF/ON、設備追加・位置/流量変更、全モデルの描画、背面、IndexedDBの復元とシェーダー/ページエラーを検証する。画像は既存のignoredディレクトリ`tests/smoke/out/aquarium-*.png`に出力する。

これは汎用の手続きモデル実装であり、「AAA品質」を客観的に認定するものではない。実機GPU上での負荷測定、実製品の資料との最終照合、接写品質のアートレビューは別途必要。現在のゲーム水槽は既存の固定60 cm寸法を維持し、可変寸法は設備ライブラリのAPIで提供する。
