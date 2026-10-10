# 進捗メモ 1 日目（2026-10-01）

## できたこと
- 仕様 4 本（docs/spec/）、回答記録、マハゼモデル監査
- プロジェクト雛形（Vite + TypeScript + three 0.186 + Preact）、GitHub Pages ワークフロー、CI
- マハゼブランチの履歴統合、ビルダーの LOD 段階（hero / lod1 / lod2）
- 潮位（調和分解、暫定 4 分潮）、GameClock と潮時チケット、単体テスト
- 地形生成（kasai_west）、地形・水面・潮だまり・空と太陽・生息環境の実行時モジュール
- 一人称移動（水深制限、底質で減速）
- 生物: 種データ 3 種、行動ツリー 3 本、スポーン、LOD、マハゼ手続きドライバ、仮モデルのエビと鳥
- 観察モード、手網採集、図鑑と研究ポイント、IndexedDB セーブ、自宅の水槽、チケット UI
- ヒーロー材質（体積透過シェーダー）の統合: 観察ロック中と水槽で 3 パス描画。設定で無効化可、失敗時は標準 PBR へ自動フォールバック
- Playwright スモークテスト（一周の自動操作とスクリーンショット）、テスト手順書

## 未着手・次週
- 気象庁 60 分潮の取得と位相規約の検証（ネットワーク許可待ち）
- シラタエビ・シロチドリの写実モデル
- 写真、痕跡、水面の反射と屈折、水槽の複数個体とレイアウト、ショップ、チケット配布ルール
- 音
- 品質の自動選択、スマホ対応

## 確認してほしい技術判断
- 潮位の位相規約は `zone_speed`（時間帯の速度換算）を既定にした。満干の時刻が実際と約 20 分ずれる場合は `meridian_species` へ切り替える（データファイルの 1 項目）。

# 進捗メモ 2 回目（2026-10-01 夕方、フィードバック反映）

## 反映した指摘
- 視点が高い: 目の高さ 1.5 m、しゃがみ 0.55 m、右クリック（Z）で望遠ズーム。走りを 4.5 m/s に。
- ミニマップ: 干潟では右上に常時表示（底質、現在の水位、潮だまり、向き）。
- 澪筋: 砂州と内側の水路（海水が手前に入る地形）、7 本の網状の澪筋、西の大きな水路。砂面には漣痕のシェーディング。
- デバッグモード（F3）: 時刻・潮位・曇りの固定、生物マーカー、テレポート、統計、周囲スポーン。
- 水（Clearwater 参考）: 深さによる吸収の色付き、フレネル反射、3 スケールの風紋と太陽のきらめき、汀線の泡、水底のコースティクス。
- 水槽（Clearwater 参考）: 暗い室内の高級展示風、アクアリウム照明、ごく薄い水、波立つ水面の映り込み、砂のコースティクス、ガラス。最大 4 匹。
- ホーム画面: 大型水槽が主役。左上ステータス、右上リアル潮汐（月齢・潮回り・次の満干・残り時間・グラフ）、下部ガラス調ナビ（図鑑｜ショップ｜干潟へ｜水槽｜潮見表）。生物クリックで情報、水槽クリックで管理。潮見表（7 日分）。
- 図鑑: 種ページにモデルのターンテーブル表示。
- 水槽 v4（caustic-volume 参考、MIT）: 水面は 20 波の乱れた波＋GPU 波紋シミュレーション（192×96）。毎フレーム水面テクスチャを描き、水面の格子から照明を屈折させて床に投影した本物のコースティクス（512×256、面積比で加算）で砂と生物を照らす。水は吸収（Beer–Lambert、乗算パス）と散乱（加算パス、コースティクスの光の筋）、メニスカス、エアストーンの泡（はじけると波紋）、水槽クリックで波紋。

## 次
- ショップ・ガチャ（近日公開のまま）、水槽のレイアウト素材と背景・照明の解禁、水槽の大型化
- シラタエビ・シロチドリの写実モデル、写真、痕跡
- 気象庁 60 分潮（ネットワーク許可待ち）

# 進捗メモ 3 回目（2026-10-01 夜、フィードバック反映）

## 反映した指摘
- 水槽のガラスを透明に（暗い部屋のフレネル反射だけを残す）。
- M で干潟の全体図（底質、現在の水、潮だまりのラベル、現在地と向き、凡例、縮尺）。
- 水槽ボタン → 編集パネル。「生物」タブ（出し入れ）と「レイアウト」タブ: 底床 砂／泥／なし、小石・石・流木・貝殻・水草（手続き生成）を置いてドラッグで移動、回転、削除。セーブに保存。編集中は自動回転が止まる。
- 干潟の水を作り替え（`origin/claude/zealous-thompson-hz0r0g` の 葛西の渚ビューア `src/water.js` の画面空間パスを移植）: シーンを HDR+深度で描いてから、画素ごとに視線と水面の交点を求め、屈折（厚みに比例）・吸収・散乱・空のキューブマップ反射・太陽のきらめき・汀線の縁と泡・霞を合成。ヒーロー描画パイプラインにも組み込み（メインバッファに深度を付け、水を合成してからポスト）。
- 潮だまり: Habitat の潮だまり（面積・深さでふるい分け、2 セル膨張）のレベルをテクスチャにして、地形と水の両方が「潮位より上の潮だまり」を扱う。潮だまりは波が小さく（振幅 1/10）、吸収と散乱が弱い。
- 目の高さの設定（1.1〜1.9 m）。観察中のズーム: ホイール／+−／ボタンで距離、右クリック（Z）で望遠。

## 次
- 水面の起伏（頂点変位）と砕波の泡、潮だまりの縁の石
- ショップ・ガチャ、水槽の照明や背景の解禁
- シラタエビ・シロチドリの写実モデル、写真

# 進捗メモ 4 回目（2026-10-01 深夜、フィードバック反映）

## 反映した指摘
- 操作再開の不具合: ポインターロックの要求が失敗したときに何も起きなかった。失敗を検出して案内を出し、ドラッグで視点を回す方式に切り替える。「クリックで操作開始」は Enter / Space でも再開。
- 図鑑の背景を暗色に。
- 視点: 最初から水面近く（0.45 m）。C で立った視点（設定の目の高さ）と切り替え（ズームではない）。
- 小さい潮だまり（40 m² 未満）: 小さなハゼ（28〜48 mm）が 1〜2 匹だけ現れるルールを追加。
- アカエイの食痕: 砂・砂泥の平らな場所に 48 群（4〜12 個、半径 45〜70 cm、深さ 6〜12 cm）を地図の種から決定的に彫り込む。干出すると水が残る小さな潮だまりとして扱い（水面テクスチャ・静かな水）、1 日・1 窪みあたり 18 % で小さなハゼかエビが取り残される（プレイヤーが離れるまで保持）。地図格子を 1.18 m → 0.52 m（577²）に細分化。
- 軽量化: 地形を 25 m 四方のチャンク（144 個）に分け、距離で 3 段階の粗さ（60 m / 130 m、スカート付き）を遅延生成・解放。法線は事前計算。
- シラタエビ: `claude/epic-noether-hzhjhj` の手続きモデル（ロフトした甲、透ける組織、脚の IK 歩行、遊泳、尾扇の逃避、触角の物理）を移植し、ゲームの意図（休む・歩く・泳ぐ・逃げる・採餌・手入れ）に写像するスタブ脳で駆動。
- エドハゼ: `claude/awesome-ride-3rde4w` のモデル生成ツールをマハゼのパイプラインに合流（hero / lod1 / lod2）。姿勢・行動モジュールを体長・脊椎・休息時のひれの畳みで種ごとに設定できるように一般化。種データ（小さな潮だまり、泥の潮だまり）と図鑑。
- 水槽からハゼが出る: ドライバが水槽の壁で位置を止め、中央へ向き直す。ホーム画面のナビ文字の縦折れと水槽パネルの折り返しを修正。
- 地形の起伏（追加指示）: 地図の種から勾配ノイズを歪めて 4 スケール＋砂堆の畝を重ねる。海へ向かう勾配はそのまま、20〜40 cm の高まりと窪み。
- 泥と砂の分かれ方（追加指示）: 高さ格子を先に焼き、周囲 12 m との相対高度と傾斜を求めて「泥っぽさ」を連続値で評価（窪み・澪筋の縁・低地・西側は泥、高まり・砂州・斜面・浜上部は砂）。閾値で砂／砂泥／泥。
- 風紋（追加指示）: 均一な縞ではなく、海岸線平行の縞を 3 段階のノイズ変位で曲げた連続場（位相を曲げるので局所波長が破綻しない）。色と法線が同じ場を参照。区画ごとの有無。
- 出現と水位（追加指示）: 水中の生物は体長比の最低水深（15 %、最低 1.5 cm）を満たす場所だけに出現。時刻・潮位の変更とチケット、長い離脱後の復帰で個体群を作り直す。浅くなった個体は近くの深い水へ移動、無理なら消える。
- シラタエビの負荷: 1 匹 243 メッシュ・8.5 万三角形なので、3 m 超で内臓・卵・剛毛、6 m 超で脚と触角を非表示、視認距離 10 m。観察中は全部表示。
- 昼の光（品質の底上げ）: 砂が無彩色の灰色に見えていた。原因は three の仕様で、材質ごとの envMapIntensity は無視され scene.environmentIntensity（0.28）が全材質に使われるため、空の環境マップが太陽と同じ強さで砂を照らしていたこと。環境を太陽の 1/5 程度（0.09）に下げ、太陽を主光源に（2.6、わずかに暖色）、露出を下げ、砂の色を少し暖色に。砂粒は 1.7 cm の格子状だったのを 2 mm の斑点＋3 cm のむらに。

## 次
- 写真、痕跡の種類（カニの巣穴、ゴカイの糞塊）、砕波の泡
- ショップ・ガチャ、水槽の照明や背景の解禁
- シロチドリの写実モデル

# 進捗メモ 5 回目（2026-10-02、MahazeViewer の見た目に寄せる）

## 反映した指摘
- 水が「見やすすぎる」: MahazeViewer（Gerupamasini/MahazeViewer）の水の作りを移植。水中の視線の長さだけで底が濁りの色（オリーブ）に溶ける経路長フォグ（海 2.0/m・潮だまり 1.0/m）、太陽の前方散乱の明るみ。吸収・散乱のモデルは置き換え。
- 「規則正しい波はきもい」: 繰り返しの法線テクスチャをやめ、乱数の向き・位相・分散関係の速さで進む 20 成分の波（MahazeViewer の waves.js）に。各成分の位相を水面上で緩やかに揺らがせて（成分ごとに別のノイズ）、波頭が格子に揃わないように。急峻度は凪に近い 0.004〜0.013。画素の大きさで帯域制限（遠くはちらつかない）。
- 同じ波の場で水底のコースティクス（ヘッセ行列からの集光）、色調整と周辺減光、空の積雲、泥面の珪藻膜と還元層。

## 次
- 水面の起伏（頂点変位）と水中視点、浮遊物
- 写真、痕跡、ショップ

## 7 回目（タモの演出、エイの昼寝跡、質感）
- タモ: `Capture` を aim → swing → lift → check → done の段階にし、`NetView`（D 型の枠・柄・結び目の網袋・しずく）をカメラ空間の姿勢（枠の位置と手の位置）で動かす。網は最後に別レイヤーで描く（`App.renderNetOverlay`）。網に入った生物は lod1 モデル（またはドライバの形）を袋の底に寝かせて暴れさせる。
- 道具の計画: `docs/planning/08_tools_roadmap.md`。`ToolSchema.type` に dig / fishing / optic を追加。
- 昼寝跡: `FeedingPits` を解析形（`pitShape`）にし、`Terrain.heightAt` は基準グリッド + 穴の形。穴ごとに 60×60 の細かいパッチを粗いチャンクの上に描く（粗いほうは深く押し込んで隠す、polygonOffset）。潮だまりの水位は縁の足元より下に抑える。spill テクスチャは Nearest。殻は InstancedMesh 2 つ。
- 質感: MahazeViewer の粒（Worley）・糞粒・微細凹凸（導関数ノイズ）を移植、巣穴（穴＋襟／砂山）を追加。風紋の分岐は位相転位のペア（長い層 2 m セル、短い層 1 m セル）。ハッシュは整数版（座標が大きいので）。
- 直したバグ: ゲーム時刻を過去に動かすと Habitat が更新されなくなっていた（差の絶対値で判定）。

## 8 回目（道具、物理的なタモ、アサリ、水槽の編集画面）
- 道具: `ui.tool`（hand_net / shovel）、[1][2] で切り替え、HUD 右上にチップ。`App.useTool` が道具別に `swingNet` / `dig`。
- タモ: `Capture` は判定を持たない（swing → lift → check → done の演出だけ）。`App.swingNet` が `NetView.sweep`（カメラ空間の dip→scoop をワールドへ、地面に押し下げ）で掃いた線分から半径 24 cm + 体長/2 に入る生物を集め、逃げる確率 = baseDifficulty×0.45 + alertPenalty×alert + 0.35×(縁への近さ) (+0.25 警戒中) で決める。入らなかった近くの個体は flee。`capture.forceCatch` はスモーク用。
- スコップ: `ShovelView`（柄・刃・砂のスコップ・掘り出した貝）。`App.dig` が `ShovelView.digPoint` の位置で `ClamField.dig`（半径 14 cm）。水深 15 cm 超は掘れない。
- アサリ: branch vigilant-johnson の手続きモデル・ドライバ・種データを取り込み。`Spawner` は locomotion=burrow を飛ばし、`ClamField`（貝床 30 か所、約 2,700 個、4 m セルの空間ハッシュ）が位置・体長・seed を持つ。5 m 以内だけ水管（InstancedMesh、水中かつ驚いていないとき）と穴（InstancedMesh）を描く。足音（0.6 m 以内・2.2 m 以内で速い）で引っ込む。[F] で `observeClam`: その場に一時的な Individual を spawn（pitId=-2 で cull 対象外）して観察、終わると despawn。
- 水槽: `SAND_H` 5 cm の箱、`floor.heightAt` は砂の上面。`W_ABSORB` を下げた。`tankEdit` 画面（`App.openTankEdit/closeTankEdit`、`App.transition` の暗転 320 ms + 240 ms、`tank.updateFrozen`）。`tankPut` も暗転。`tank.nudgeCamera` で WASD。`tank.onBehavior` は mode==='home' のときだけ記録。
- 図鑑: `behaviors[].clip` で観察済み行動の再生（`ModelPreview.show(sp, clip)`）。
- 干潟の水: `uFogW` 2.0→1.1、`uFogPool` 1.0→0.35、`uEnvI` 0.72→0.6。

## 9 回目（網の判定、空振り、しゃがみ、アサリの見える化、水から出ない）
- 網の判定: `NetView.inZone(camera, p, margin)`。カメラ空間で視線（画面中央）に沿った縦長の楕円（半径 0.19 × 0.26 m + 体長/2）を、目の前 0.25 m から柄の長さ `REACH` 1.2 m まで伸ばした筒。`App.netZoneHits` がこれに入る採集可能な個体を集め、逃げる確率は `edge`（楕円の中心 0 〜 縁 1）で重み付け。旧 `sweep`（地面に押し下げた線分）は削除。網の姿勢は「突き出す」（`Q_THRUST`: 枠が視線に垂直）→ すくう → 確認、の slerp。デバッグ中はワイヤーフレームの筒（`NetView.zone`）を表示。
- 空振り: `Capture.EMPTY_PHASE_SEC`（swing .42 / lift .35 / check .2 / done .2）。`CaptureOverlay` は result==='fail' のとき描かない。`Capture.skip()` で check → done（[E]・クリック）。
- しゃがみ: `FPSController.crouching = lowView`（以前は `enabled && lowView` だったので、捕獲中に update が 1 回走ると立ち上がっていた）。
- アサリ: `ClamField.beds` を公開（45 床）、`teleport('clams')`、デバッグ統計に `clamsNear/clamsTotal`、12 m 以内のマーカー（kind: mollusc）、全体地図の貝床の輪。
- 水から出ない: `CreatureSystem.keepInWater`（毎フレーム、遠い個体は 8 フレームごと）。Entry ごとに `lastWet` を覚え、必要水深（体長の 15 %）を切ったら `Driver.holdAt(x, z, heading)` でそこへ戻し、`Habitat.nearestWater`（3 → 12 → 25 m）へ moveTo。`issue()` は水中種の目標を `waterBound` で水の切れる位置に手前で止め、flee は横方向のうち水の続く向きへ。`ShrimpWorld.constrain` に水際のフェンス（`DriverContext.minDepth`）を追加して尾扇の逃避も水際で止まる。視界外（20 m 超）で干上がった個体は最寄りの水へ置き直し、25 m 以内に水がなく 30 m より遠い個体だけ 30 秒後に消える。
- 「何も取れない」への対応: 逃走距離（マハゼ 1.6 m）が網の届く距離（1.2 m）より長く、しかも近づくだけで警戒度が 2 秒で 1 になっていた。`CreatureFrame` にプレイヤーの速度・姿勢・走りを渡し、警戒度の上がり方を「静止 0 / しゃがみ 0.4 / 歩き 1 / 走り 2.2」倍に。`player_within` の距離は `fleeDistance × (0.4 + 0.6 × alert) × (走り 1.6)`。逃げる確率は「楕円内なら基本的に入る」に変更: `0.6×alert²×(0.5+alertPenalty) + 0.25×edge² + 0.1×base ± 向き（後ろから −0.08、正面 +0.05）`、0〜0.85。判定は `ind.pos` に加えて描画上の体の位置（`anchorOf`）でも行い、余裕は max(6 cm, 体長/2)。網の届く距離 1.6 m、楕円 0.21 × 0.28 m。
- バージョン 0.6.0。「何も取れない」対応は 0.6.1。

## 10 回目（警戒心の個体差、道具の習熟度、水深の難易度、ケースの生物の処遇）
- 警戒心: `Individual.wariness = 0.7 + 0.6 × lengthPct/100`（`warinessFor`）。警戒度の上昇率と `player_within` の逃走距離に掛ける。
- 習熟度: `SaveV1.player.skills`（道具 id → 採集数、migrate で {} を補う）。`Encyclopedia.skills` signal、`SKILL_STEPS = [3, 8, 15, 25, 40]`、`skillLevelFor`、`addSkill`（Lv が上がるとトースト）、`setSkill`（デバッグ）。`App.onCaptureResolved` が `lastTool` で数える。効果: `App.netZoneScale = 1 + 0.12 × Lv`（`NetView.inZone` / 筒の scale 引数）、振り時間 × (1 − 0.05 Lv)、逃走率 × (1 − 0.1 Lv)、スコップの半径 × (1 + 0.1 Lv)。HUD チップの `.lv` バッジ、DebugPanel の「習熟」行。
- 水深: `App.swingSlow = clamp((depthHere − 0.15) / 0.45)`。`CaptureState.swingSec`（`Capture.start` の第 3 引数、swing の長さ、`NetView` もこれで補間）= 0.42 × (1 + 1.2 slow) × (1 − 0.05 Lv)。逃走率 += 0.35 × slow × (0.5 + alert)。HUD の `hud.deepSlow`。
- ケース: `Encyclopedia.release(rec)`、`toResearch(rec)`（`researchFor = 5 + cm`）、`App.caseRelease / caseToResearch`、`TankPanel` の観察ケース一覧にボタン。
- 単体テスト `tests/unit/progress.test.ts`。バージョン 0.7.0。

## 11 回目（立ったままの採集、ショップと道具の持ち替え、干潟の観察ケース）
- 届く距離: `App.netReach()` = min(reach_m / cos(pitch), √(reach_m² + 目の高さ²) + 0.1)。`NetView.inZone` / `update` に `reach` 引数。立ちの振りは ×1.15。
- 道具データ: `items/tools.json` に `price_cr` と `params.reach_m / hoop / swing / quiet / deep`。hand_net（1.5 m）、hand_net_short（1.1 m、0.85、0.7、0.75、1.2、200 CR）、hand_net_long（2.2 m、1.0、1.3、1.1、0.8、300 CR）、shovel。`ToolId` は string。
- セーブ: `player.tools`（所持）、`player.loadout`（2 つまで）、`player.levelClaimed`。migrate で補完。`Encyclopedia.owned / loadout / level / buy / toggleCarry / claimLevels（CR_PER_LEVEL 150）/ addMoney`。`skillKeyOf`（タモは共通キー hand_net）。
- UI: `ToolsPanel`（ホームのナビ「道具」= 旧ショップボタン）、HUD のチップは loadout から、[1][2] は loadout の順。`CaptureOverlay` は道具の type で判定。
- 観察ケース: `FieldCase`（板・柱 2 本・キャップ・焼印・アクリル 5 面・水と水面、`inner` 枠に生物。drivers は水槽と同じ bounds 方式、hero なし）。`App.openCase / closeCase`（`caseSpot` で水深 5 cm 未満の場所、OrbitControls、near 0.01）、mode `caseView`（Screen に追加、worldVisible に含む）、[Q]。`CaseOverlay` に一覧と逃がす／研究に回す。`caseRelease` は干潟では最寄りの水に `generateIndividual` で戻して flee。
- 単体テスト `tests/unit/tools.test.ts`。バージョン 0.8.0。

## 12 回目（行き先の地図、ショップの部屋、道具棚、ホームの作り直し）
- 地点: `SpotSchema`（id / ja / area / lat / lon / map|null / description）、`manifest.spots` → `data/spots.json`、`GameData.spots`、validate.mjs で地図参照を確認。`SpotSelect`（日本の輪郭 4 島と東京湾の海岸線を lon/lat の配列から SVG に、ピンと一覧）、`App.openSpots / enterField(spotId)`（地図が違うときは未対応のトースト）。
- ショップ: Screen `shop`、`App.openShop / closeShop` は `transition` で暗転、`ShopScreen`（CSS の部屋＋カード）。`ToolsPanel` からショップを外した。`openGacha` はトースト。
- 道具棚: `ToolShelf`（ペグボード、板、ランプ、道具ごとにペグ・タグ・番号・名札、タモは hoop/reach に応じた形、スコップ）。`TankScene.shelf / setShelfTools / pickTool / focusShelf / focusTank`（0.9 秒の smoothstep でカメラを補間、棚を見ている間は OrbitControls を止める）。`App.openTools / closeTools / syncShelf`、ホームのクリックは `tools` パネル中は棚の道具を拾う。
- ホーム: `HomeMenu` を参考画像の配置に作り直し（status / title / almanac / 7 タイルの nav）。`Icons` にタイル用アイコン。
- バージョン 0.9.0。

## 13 回目（地形の作り直し、使用中の道具、透明なケース、水面のケース、ホームの視点、潮見表でのチケット）
- 地形: `bake-map.mjs` の固定の澪筋・7 本の runnel・bar-and-runnel・固定の潮だまりを捨て、`growCreek`（3 m ステップ、gnoise の蛇行、北向きへ引き戻し、幅と深さは上流ほど細く浅い、確率 0.16 で左右交互に分岐、最大 4 次）で 4 本の幹から樹枝状の網を生成。`SEGS` を 12 m のバケツに入れ（各セグメントは土手の範囲 `DOME_R` 28 m まで登録: 届かないバケツでは距離が無限大になって土手が段差になるので注意）、`creekAt(x, z)` が最寄りのセグメントのガウス断面で `depth / weight / dist` を返す。底には `scour`（セグメントの `along` 座標の gnoise）で深みの鎖（河口付近は弱く）。高さ = 浜の断面 + relief（振幅を下げた）+ 土手のドーム 0.14 × smooth(0, 28, dist) − 回転楕円の潮だまり − 澪筋の切れ込み、下限 −3.45。基質は `channel` = weight > 0.5 かつ depth > 0.12。`teleport('creek' / 'runnel')` は基質が channel のセルを探す。`mapImages.ts` の色（岸の緑・上部の明るい砂・深さで濃くなる水・潮だまりの色）、`MapOverlay` のラベルは潮位より上の潮だまりだけ。
- 道具チップ: `.tool-chip.on` を強調（背景・枠・光・持ち上げ・番号キーの反転）、`hud.inUse`「使用中」のラベル、使っていない方は opacity 0.72。
- 観察ケース: `FieldCase` を透明なアクリルの箱に（`EdgesGeometry` の縁線、`makeRule` の cm 目盛りを前後の底辺に、`makeLabel`）。`place(x, y, z, yaw, afloat)`、`CASE_DRAFT` 0.11、`floating`。`update` は afloat のとき上下と傾きを付け、`floorY` を追従。`App.caseSpot` は `depthHere > 0.03` なら前方の水面、`openCase` は `max(ground, waterAt − CASE_DRAFT)` に置き、afloat のときは `maxPolarAngle` 0.4π、カメラは 0.36 m 上。
- ホームの視点: `TankScene.panCamera(right, forward, dt)`（視線方向と横方向にカメラと target を平行移動、距離に比例した速さ、床 −0.04 と ±2.4 m で止める）。`nudgeCamera` は削除。`minDistance` 0.012、`maxDistance` 3.2、`enablePan`（右ドラッグ）。`App.tankKeys` は Shift で 2.2 倍。
- 潮見表とチケット: `TicketDialog` を削除し、Screen `ticket` も `TideTable` を描く。日付は今日の前後 `TICKET_RANGE_DAYS` 日、曲線の `onMouseMove / onClick`（`getBoundingClientRect` から 10 分刻み）、極値の行もクリック可、`.tide-confirm` の確認カード（`tidePhaseAt` で潮の状態、`inRange` で範囲外は無効）→ `app.useTicket`。再現中は `.ticket-now` に「中断する」。`tidePhaseAt` は `src/tide/TideModel.ts`、単体テスト `tests/unit/tidePhase.test.ts`。
- バージョン 0.10.0。

## 14 回目（浅い澪筋、薄い凹凸、観察ケースの操作）
- 澪筋: 幹の深さ [0.6, 0.7, 0.55, 0.45]（以前の半分）、scour 0.5、channel 基質の閾値 depth > 0.07。
- 凹凸: `dimples(x, z)`（`DIMPLE_CELL` 18 m のジッタ格子、`dhash` で決定論的、7 割が窪み −(0.05〜0.2) m、残りが盛り上がり +(0.02〜0.06) m、半径 3〜9 m の回転楕円、底が平らな椀 `1 − smooth(0.4, 1, √q)`、海側 z > 80 で弱め、岸 z < −105 でフェード）。RELIEF の振幅を macro 0.16 / meso 0.09 / fine 0.04 / micro 0.014 / ridge 0.05 に、土手 0.09、固定の潮だまりは 0.1〜0.24 m。
- 計測: `tests/smoke/out/pool-stats.mjs`（焼いた高さ図の priority-flood から、潮位ごとに水面より上の潮だまりの数と、露出した干潟のうち 15 m 以内に深さ 5〜35 cm の水がある割合）。−0.9 m で 98 / 77 %、−0.5 で 75 / 75 %、−0.1 で 49 / 70 %、+0.3 で 21 / 58 %。
- タモ網: `src/assets/models/nets/`（6 種 × hero/lod1/lod2、`manifest.json`、`netMaterials.ts`）を `claude/gifted-darwin-0do0oc` からマージ。`ToolSchema.model`（GLB のベースパス）、`tools.json` を net_small / net_shallow / net_fine / net_deep / net_dframe / net_carbon + shovel に（`params` に mouth_w / mouth_h / bag_depth / handle_m を追加）。`Save.DEFAULT_NET`、`TOOL_RENAMES`、`migrateTools`（Encyclopedia.applySave と migrate の両方で）。`NetView` を GLB ベースに書き直し: `setTool(tool)` が hero を `instantiateModel` で読み、`fitToMouth` で Mouth ノードを原点・開口を +y・柄を +z（手の側）に合わせ、`prepareNet` で濡れ・泥のシェーダーを付ける。振りの段階で Bag のモーフ（Trail / Invert / Stream / Wet）と waterline を更新、着水で wet 1・mud 加算。突き出す距離は reach に応じて 0.8〜1.15 m。`ToolShelf` は立てかけ式のラック（PITCH 0.36、高さ 2.05、lod2 を Trail 1 で立てる、クリップ・タグ・名札）、`SHELF_POS` (−1.55, 0.05, −1.1)、`focusShelf` のカメラを 2.75 m 後ろに。`ModelLoader` の glob から nets の除外を外した。単体テスト `tests/unit/toolMigration.test.ts`、ブランチの `netModels.test.ts`。
- 観察ケース: `closeCase` → `focusGame()`（Q やクリックのジェスチャーで再ロック）、`caseKeys`（A/D 回転、W/S 接近）、`frame()` を try/catch で包み `step()` に分離（例外は 3 回までログ、1 回トースト `warn.frameError`）。
- 砂の色: `Terrain.SUBSTRATE_COLORS` を暗い灰褐色に（sand 0.40/0.355/0.285、muddy_sand 0.29/0.255/0.21、mud 0.165/0.15/0.13、gravel 0.33/0.32/0.29、channel 0.13/0.12/0.105）、`mapImages.SUB_COLORS` も同様。バージョン 0.11.0。

## 15 回目（ジャンプ、偏光サングラス、水、設定と観察ズームの修正、3D ショップ、シロチドリ）
- ジャンプ: `FPSController` に `airY / vy / dashVX,dashVZ / airborne / jumped`。`JUMP_V` 2.9、`GRAVITY` 13.5、走りからは `speedNowLast × DASH_BOOST 1.6`（最低 RUN × 0.6）を空中で保ち、キーで 1.2 m/s² だけ操舵。`depthHere < 0.25` のときだけ。Input に `jump: Space`、`sunglasses: KeyG`。
- 水: `Water` に `uReflK`（0.55、サングラス 0.22）と `uReflMax`（0.6 / 0.3）、`uFogW` 0.8（サングラス 0.6）、`setPolarized(on)`。`Settings.sunglasses`（既定 true）、`App.toggleSunglasses`、`updateSettings` と world 生成時に `water.setPolarized`。Root に `.sunglasses-tint`（multiply の茶色いグラデーション）と `.glasses-badge`。
- 設定: `ui.settings` シグナル（`updateSettings` と `loadSettings` 後に更新）。Menu は `ui.settings.value` を読む。
- 観察ズーム／ケースの操作不能: 原因は `styles.css` の `#ui > * { pointer-events: auto }` が `.markers`（デバッグの生物マーカー、画面全体）などの `pointer-events: none` を上書きしていたこと。ロック中は無関係だが、観察・ケース・ホームではマーカー層が全入力を奪う。`#ui > .markers, .sunglasses-tint, .shop-screen, .observe-bottom, .capture-reveal, .hud-cb, .hud-keys, .home-title { pointer-events: none }` を追加。`Input` のボタン状態は `pointerdown / pointerup / pointercancel` でも更新。
- ショップ: `ShopScene`（床・壁・カウンター・`ToolShelf` のラック・小包の台・スポット）、`setStock`（値札 `tag`、所持なら `lit`）、`pick`（網 id か `coming:<id>`）。`ShelfTool` に `tag / lit`。`App.shop`（初回の openShop で生成、`stockShop`、mode shop で描画、`onShopClick` → `ui.shopSelected`）。`ShopScreen` はカードのオーバーレイに。
- シロチドリ: GLB を `src/assets/models/plover/`、種データの hero/lod1/lod2 に同じファイル、`modelLength_mm` 165。`CreatureSystem` が `root.userData.clips` にクリップを載せ、`PloverDriver` が `AnimationMixer` で再生（ループ: idle / walk / run / forage / rest、ジェスチャー: peck / preen / alert / takeoff / landing / shake、クロスフェード）。プレースホルダーの手付けアニメは残した。
- バージョン 0.12.0。

## 16 回目（アサリの新モデル、シロチドリの頭）
- アサリ: `src/creatures/asari/{Asari,AsariMaterial,AsariModel}.js` を `claude/vigilant-johnson-xhb62w` から取り込み（centreY 0.2、mantlePivot の表示切り替え、水管の Y 字の分岐 `ANATOMY.siphonFork`、貝床の殻を砂に少し沈める）。種の説明文も更新。
- シロチドリ: `PloverDriver` の mixer に `finished` リスナー（終わったアクションを `fadeOut(0.2)`、`oneShot` を外す）。しぐさのクリップは `AnimationUtils.makeClipAdditive` で差分化し `AdditiveAnimationBlendMode` で再生（`GESTURE_CLIPS`）。クリップ解析（node で GLB の回転トラックを読む）: Walk は 0.36 秒周期で頭の振幅 50°・キー間 41°、Run は 0.10 秒周期で 30° → `steady`（neck0〜2 と head の回転・位置を `HEAD_SMOOTH_S` 0.16 秒で slerp/lerp）を mixer.update の後に適用。`setIntent` は attach 前でも落ちない（`here`）。ループの切り替えは `setEffectiveWeight(1)` してから `crossFadeTo`。
- バージョン 0.12.1。

## 28 回目（イシガレイ・アカエイ・アラムシロを東京湾の 2 つの浜へ）
- 探した結果: イシガレイは `claude/ishigarei-juvenile`（PR #34、1 コミット、本流より 28 後ろ）、アカエイは `claude/vibrant-pascal-bn5g33`（PR #44、4 コミット、98 後ろ）、アラムシロは PR #42 で本流に入っていて、`claude/fervent-archimedes-952bzo` に未マージの追補 1 コミット（0b2291a）。この順で逆にマージ（アラムシロ → イシガレイ → アカエイ）。
- 衝突: アラムシロは TESTING／package.json（両方残す）。イシガレイは README／package.json／`drivers/index.ts`（両方残す）。アカエイは README／TESTING／進捗／package(-lock)／manifest／`CreatureSystem`／`drivers/index.ts`: `CreatureSystem` は本流（`sampleAt` の `nowMs`、`nearDistance` の `near`）、`DriverEntry` も本流（`preview(seed, renderer)`、`nearDistance`）で、アカエイの `smoothNear: true` は `nearDistance: 10` に。manifest は両方。lock は本流。
- アカエイの規則は `maps` なし（全マップ）だったので浜ごとに書き直し（葛西: 満潮・上げ潮の砂浅場、摂餌痕のセル（`small_pool`）、澪筋（`channel`）、夏の夜の上げ潮; 走水: 沖の砂底 0.12/100 m²、2 m セルなので大きめ）。`channel` タグは底質 `channel` のセルにしか付かないので、澪の規則は底質に `channel` を含める（計画書の指摘: イシガレイの秋・アカエイ・アラムシロの澪の規則が不発だった）。アラムシロは葛西の規則 2 本を追加（JSON は本流の 1 行形式のまま）。イシガレイは昼寝跡の居残り（`Spawner.plan` の 10 枠に 1 つ、春〜夏）に加えた（`small_pool` の規則はセルの中心の水深で見るので不発だった）。レビューの指摘で: 計画はセルをプレイヤーから近い順に回す（上限に達する種が北に偏っていた）、アカエイの `dt` の上限を 0.1 s に（遠い個体の 2 フレームまとめ更新で遅れていた）、アカエイの `small_pool`＋満潮の規則は削除（タグは干出した穴にしか付かない）、走水の密度は 0.06、アラムシロの `waterline` を外し澪の規則の水深は 5 cm から、イシガレイの浮上の `glide` は 1 回だけ。性能の指摘で: アカエイのモデルは遠くで生まれても LOD0 の 55k 三角形を組んでいた（鰓孔と口の形のため）のを LOD1 の形で代用、体盤と尾は太陽の影を落とさない（接地影の板と二重だった）、ドライバの LOD の距離は `AKAEI_DETAIL`（`applyPreset` が `viewScale` と「LOD0 を許すか」= `lod1Count > 0` を配る）に従い、砂煙は接地影と同じスイッチ、`Spawner` の上限 `maxPopulation` も割合に従う（鳥は除く）。レビューの検証で確認された、種のシェーダプログラムが最後の個体と一緒に破棄され次に見えたとき同期コンパイルされる件（SwiftShader で初見 0.65〜0.86 s、再出現で同じだけ）は、`DriverEntry.keep`（各種の保持用モデル: アカエイは LOD1 と LOD2 のモデルと砂煙・接地影・掘り跡、イシガレイは全段、アラムシロは殻と軟体）を `CreatureSystem.keptModels()` がその浜の種ぶん組み、`FieldRenderer.compileKept` が読み込み中に HDR ターゲットを結んだ変種でコンパイルする（`applyPreset` でも組み直す。`tests/unit/keptShaders.test.ts` は保持用モデルが各段のマテリアルの鍵を全部持つことを見る）。同じ検証で、「遠くで生まれたアカエイが LOD0 を組まない」は `attach` が `this.lod`（初期値 0）で組むので初めての 1 尾には効いていなかった（ノードで初回 130〜150 ms）と分かり、新しい個体は LOD2 で生まれて最初の更新で距離に合わせ、形は保持用モデルと一緒に読み込み中に組む（LOD0 は `allowLod0` の画質だけ）。残課題（後続）: LOD2 の皮の起伏の計算、イシガレイの `updateMatrixWorld` 3 回。`SandFX` の接地影と掘り跡は `CONTACT_SHADOWS.enabled` に従う。`render:akaei` を render: 群へ、lock の版も 0.24.0。`tests/unit/spawnRules.test.ts` を追加、`hashirimizu.test.ts` の表に 3 種。docs: akaei／aramushiro／ishigarei の README と走水の README の表を更新、TESTING のブランチ由来の節を 28 回目の下へ。
- イシガレイの読み取りで分かったこと: ドライバが `ctx.canBurrow` を読まず砂のない水槽・ケースでも潜っていたので、潜れない所では潜る意図を休むに替え、埋まって生まれた個体は滑り出て砂を落とす（`IshigareiDriver`）。残課題（レビュー後に解消）: 潜った個体も網に入る → `canNetCapture`（埋没 50 % 未満のときだけ）、逃走は脳の水に沿った目標へ、逃走中の二度目の跳ねなし、砂のある水槽・ケースでは `special` の意図で潜る。
- 煙幕テストが落ちた: 葛西の「汀線」は干潮（この日の 12:30 は −44 cm）だと北岸の縁（x=0, z=−151）に落ち、60 m 以内で水のあるセルは昼寝跡の窪み 5 つだけ（セル中心の水深は −1 m 台で規則に合わない）なので、「周囲に生物」でマハゼが出ない。前に通っていたのは、夕方のチケットの潮位がテレポートの時点でまだ残っていたから（時刻を戻してから潮位が落ち着くまで数フレームかかる）。スクリプトは時刻を戻して 3 フレーム待ってから汀線へ行き、規則で出ないときは `debugSpawn` でマハゼを置いてから観察と網の手順へ。
- バージョン 0.24.0。

## アカエイ（ブランチ側の記録。28 回目で取り込み）
- 新種 `hemitrygon_akajei`（`public/data/species/`、行動ツリー `ray_benthic`、manifest）と `src/creatures/species/akaei/*`（`morphology` / `geometry` / `material` / `AkaeiModel` / `AkaeiDriver` / `SandFX`）。`DRIVERS.akaei`（`smoothNear`（本流では `nearDistance: 10`）: 10 m 以内は毎フレーム更新）。詳細は `docs/models/akaei/README.md`。
- モデル: DW = 1 単位で作り、ルートを体盤幅でスケール。体盤は閉じた殻（LOD0 96 行 × 44 列）、尾は 120 リング × 16 辺。骨格は体盤の格子 12 × 9 と尾 22（計 131）で全部位が共有、ジオメトリは LOD ごとに全個体で共有。皮膚は `aPlan`（bind 時の平面座標・面・輪郭半幅）から色・粗さ・粘液・凹凸・砂・透過をシェーダで計算（`akaei-skin` / `akaei-skin-lod2`）。
- 姿勢: `AkaeiPose` の解析場（進行波・はためき・反り・吻の持ち上げ・頭のポンプ・呼吸・地面への沿わせ）→ 格子ボーンの位置と傾き、弦長を保つ内寄せ。尾は追従チェーン（各節が前の節の向きへ緩和、付け根と棘が硬い、重さで砂に寝る、地面で止まる）。
- `CreatureSystem`: `Floor.sampleAt` を渡す、`smoothNear`（本流では `nearDistance: 10`） のドライバの近距離 lod 判定。種スキーマに `size.minDepthFraction`（`minDepthFor` が使う、既定 0.15、アカエイ 0.07）。
- テスト: `tests/unit/akaei.test.ts`（体盤の比率、各 LOD の有限性・スキン・法線の向き・三角形数、骨格と部位、波で頭が動かず縁が動く、5 行動、LOD と水面）。スモークに `24-akaei` / `24b-akaei-swim` / `24c-akaei-observe`。画像は `npm run render:akaei`。

## 27 回目（超軽量の画質と軽量化）
- 画質に **超軽量**（`Quality` 'minimal'、`QUALITY_ORDER`）。`QualityPreset` に `msaa`・`water: 'lite'|'full'`・`viewScale`・`contactShadows`・`oysters`・`tankWater`・`hero` が増え、`App.applyPreset()` が描画先のサンプル数（`FieldRenderer.setSamples`）、水と床の軽い式（`WaterPass.setLite`: `defines` の `WATER_LITE`・`WAVE_STRIDE 2`・`WAVE_AMP 1.4`；`Terrain.setLite`: `WAVE_STRIDE`・`WAVE_AMP` のみ；`Waves.ts` の両ループが `WAVE_STRIDE` 刻み）、水槽（`TankScene.setLite`）、接地影（`CONTACT_SHADOWS.enabled`）に配る。`World.create` も生成時に同じ段を当てる（先行 compile の前）。`MEADOW_QUALITY.minimal`、牡蠣礁は `preset.oysters`、`CreatureSystem.tierFor` は `viewScale` で描画距離と lod1 の距離を縮める。
- キャンバスの `antialias` は生成時に固定なので、`saveSettings` が画質を localStorage（`higata.quality`）に写し、`GameRenderer` が次の起動でそれを読んで `msaa` 0 の段（超軽量・低）ならマルチサンプルなしで作る。その線をまたぐ切り替えは `toast.reloadHint`。
- レビューの指摘で: `CreatureSystem.setPreset`（`applyPreset` から。割合か描画距離が縮めば観察中以外を `resetPopulation`）、`dropHeroViews` と `TankScene.refreshHero`（`applyHeroSetting` でヒーロー素材の有無が変わったとき）、重さの案内は `fieldSince`（干潟に入って 6 秒後から、入り直すたびに 0 から）、`ShadowLayer` は消した枠を再アップロードせず、無効のときはメッシュごと描かない。鳥は `viewScale` の対象外（双眼鏡のため）。
- 全段に効く軽量化: 水のパスの `camLevel`（眼の位置の寄せ波の高さ）を頂点シェーダ（`vCamLevel`）へ。
- `Spawner.plan(…, scale)`: 群れを置く確率に `creatureScale` を掛ける（セル・日ごとに決定的。鳥は除く）。これまでは `creatureScale` 0.6 でもほぼ全部出ていた（確率の式が効いておらず、計画が毎秒やり直されるので埋まる）。`forceSpawn(share)` はデバッグでは全部、計測では割合。`tierFor` の描画距離は `viewScale` を掛けても 8 m を下回らない（出現の環 10 m のすぐ内側に小さな生物が現れないように）。
- `QualityPreset.waterNormals`（どこも読んでいなかった）を削除。
- 設計書（6 読者 + 統合）の残り項目から: `QualityPreset.maxPixels`（描画バッファの画素の上限。`GameRenderer.resize` が `max(0.5, min(devicePixelRatio, maxDpr, sqrt(maxPixels / (w·h))))` を dpr にする: 超軽量 90 万・低 160 万・中 300 万・高 600 万。下限 0.5 倍なので 4K の CSS 解像度では上限を超える）、`HeroPipeline.setSamples`（ヒーローの主バッファも `msaa` に従う）、水槽の光芒の `SHAFT_N`（超軽量 4）、初回起動の GPU 判定（`GameRenderer.weakGpu`: `WEBGL_debug_renderer_info` の名前が Intel / UHD / Iris / HD Graphics / Mali / Adreno / PowerVR / SwiftShader / llvmpipe / VMware / VirtualBox か AMD の APU（Radeon(TM) Graphics / Vega）で、Intel Arc でなければ `loadSettings(firstRun)` が「低」で始めて保存し、`toast.autoQuality`。「Mesa」はドライバ名なので見ない）。
- 検証ワークフローの指摘で: 水槽の `removeOccupant` が墓標（`dropped`）を残し、`refreshHero` / `setOccupants` のモデル読み込み中に放した個体を再追加しない（`queued` の直列化だけでは放す操作をまたげなかった）。`dropHeroViews` はヒーロー段のビューをヒーロー材質の有無にかかわらず落とす（オンにした向きも作り直す）。牡蠣礁の段（`OysterReef.quality` は 3 段のまま）は 超軽量 → low。
- 計測の後に CPU プロファイル（`tests/smoke/out/cpu-profile.mjs`、gitignore）: 葛西の潮だまり（超軽量、209 匹）で JS は 1 フレーム 3 ms（`creatures.update`）、残りはソフトウェア描画と初回描画のシェーダコンパイル待ち（`getShaderInfoLog`）。CPU は律速ではない。
- 20 fps を下回るフレームが 8 秒分たまると一度だけ `toast.slowHint`。
- `tests/unit/quality.test.ts`（段の順・各段の MEADOW・軽い段ほどコストが増えないこと）。
- バージョン 0.23.0。

## 26 回目（アマモと寄せ波）
- `claude/festive-lamport-hd2row` の新しい先端（85f9c79）をマージ: `WaterPass` が寄せ波の水面の高さを 384² の半精度浮動小数の場に毎フレーム描く（`surfField`、`prepare()` で鏡の前に）、`FieldRenderer.compile()` がその quad も先に compile、`AmamoMeadow.setSurf()` → `tAmSurf`/`uAmSurf`、シェーダは `amStep` の終点で `amSurfEta` を読んで葉を水面に沿わせ、`leanM` で鞘より浅い所の株を根元から倒す（`ceilY` は寄せ波ありで 3.5 cm の余裕）。`World` は `setSurf(water.surfField)`。
- 衝突は World（私の `if (!layout)` 構造に `setSurf` を差し込む）、AmamoMeadow（`shootsNear` と `setSurf` の両方）、kit／shader（`uAmPush` と `tAmSurf` の両方、`amPush` と鞘の倒れの両方）。ヨウジウオの静水の uniforms に `tAmSurf`/`uAmSurf` を追加。
- レビュー（並列 5 視点）の指摘で、CPU 側の揺れ `flow.ts` に寄せ波ありの余裕（`ceil` 3.5 cm）と鞘の倒れ（`leanM`、`fallDir`）を移植（`ShootRef` に地面の勾配 `gx/gz`）。倒れの向きの乱数はシェーダ側も `amHashS` に揃えた。寄せ波の高さ自体は CPU では読まず平均 0。
- バージョン 0.22.0。

## 25 回目（ヒメハゼ、アミメハギ、イソスジエビ、ヨウジウオ）
- ヒメハゼ: `claude/sleepy-fermat-31sedx` は `Himehaze/` だけの単独プロジェクト（独自の three、ビューア、行動デモ、独自キーの GLB）で、ゲームには何も接続されていなかった。GLB 生成（anatomy / body / fins / eye / interior / rig と `src/fish/{species,pose}.js`）を `tools/models/himehaze/` に移し、エドハゼ型の `build.mjs`・`species.mjs` で **マハゼのパイプライン**（`--tier hero|lod1|lod2`、extras のキー `mahaze`、`src/assets/models/himehaze/himehaze[_male].<tier>.glb`）として作り直した。リグはマハゼと同じ 24 関節・同じモーフ名・同じクリップ（Idle / Swim / Yawn）なので `DRIVERS.mahaze` で動く。移植時にリグ extras の `axes.body`（関節位置と全長）が抜けていたのを足した（無いとマハゼの寸法で曲がる）。接地点は元プロジェクトの `CONTACT_S` から。ブランチの `game.html`・`src/game/*`・`vendor/three`・元 GLB は取り込まない（README は `docs/models/himehaze/`）。
- 繁殖期の雄: スキーマに `model.male`（繁殖期の雄のモデル）と `breeding.dressShare` を追加、`Individual.dress`（記録にも）、`modelFor(sp, stage, gravid, dress)`。他の種は dressShare 0 なので乱数の消費は変わらない（`tests/unit/himehaze.test.ts`）。
- アミメハギ（`claude/gifted-knuth-f8mcrk`）、イソスジエビ（`claude/beautiful-feynman-9mpsgl`）、ヨウジウオ（`claude/ecstatic-brahmagupta-8hdgd8`）を順にマージ。3 ブランチとも spawn 規則が最初から `maps: ["hashirimizu"]`。衝突は README／manifest／App（`setMeadow` と mark）／drivers の「両方残す」だけ。ヨウジウオの静水の uniforms とテストに、アミメハギ側で増えた `uAmPush` を足した。
- ヨウジウオは指定の 3 ブランチに無く（gifted-knuth が 2 回書かれていた）、全ブランチを `git grep` して `claude/ecstatic-brahmagupta-8hdgd8` を見つけた。
- バージョン 0.21.0。

## 24 回目（走水の軽量化）
- `claude/festive-lamport-hd2row` の新しい先端（28aba20）をマージ: `MEADOW_QUALITY`（mid の影なし、距離 4.5/13/36）、`CreatureSystem`（`AQUATIC_DIST` 14、`SHADOWLESS_MM` 80、このマップの種だけ preload）、`QUALITY_PRESETS` の maxDpr（mid 1、high 1.5）、`FieldRenderer.compile()` と `WaterPass.compileTarget()`（読み込み中に `compileAsync`）、`Surf.makeFoamTexture` のキャッシュ、水面の泡の帯、走水の pits 0、`performance.mark('world:*')`。衝突は App（`groundBoost` と mark）と World（私の `if (!layout)` 構造に mark を差し込む）の 2 か所。
- バージョン 0.20.0。

## 23 回目（横須賀 走水海岸）
- `claude/festive-lamport-hd2row` をマージ（走水マップ `public/data/maps/hashirimizu*`、`src/world/maps/hashirimizu/*`、アマモ場 `src/world/amamo/*`、寄せ波 `Surf.ts`、映り込み `render/Mirror.ts`、`Water.ts`・`Sky.ts`（雲層）・`Terrain.ts`（陸の高さ・砂の色・砂漣の向き・遡上の濡れ）、横須賀の潮位観測点、`App.leaveWorld()` によるマップ切り替え、`World.dispose()`、胴長の限界水深、`Habitat` の地物タグ eelgrass/eelgrass_edge/bare、spawn 規則の `maps`、種の `aquatic`）。衝突 15 ファイルを手で解決。
- 解決の方針: 葛西はそのまま（`World.create` は `layout` の無いマップで割石・牡蠣礁を作り、遠景は非表示のまま；layout のあるマップでアマモ場・小道具・遠景を作る）。`World.dispose()` で礁と石も解放。濡れた砂の暗さ（0.68）と粗さ（0.58/0.62/0.42）は 22 回目の値を維持し、遡上の水膜は 0.32。`Spawner` は debug の hidden と規則の `maps` の両方を見る。観察開始距離は 21 回目の `len × 7`。`FPSController.canStand` は `wadeDepth` と `groundAt`（石の上）の両方。
- 生き物の絞り込み: manifest は既存 8 種 + アラムシロ（`snail` ドライバ、`snail_crawl`）。ケフサイソガニ・ボラ・ミズヒキゴカイは manifest 外（ファイルとドライバ登録は残す）。シロチドリの走水規則を削除。ユビナガホンヤドカリは本流の完全モデルのまま、走水向けに eelgrass_edge/bare の規則を追加（一般規則は maps 無しで両方の浜に効く）。`tests/unit/hashirimizu.test.ts` を絞った種に合わせて修正、`AmamoMeadow` の底質表に rock を追加。
- 行き先は 葛西 西なぎさ と 横須賀 走水海岸 の 2 つ。
- ハク: `claude/gifted-feynman-uicxj4` をマージ（`src/creatures/species/haku/*`：写真に合わせた体形・口と鰓蓋の構造・銀の反射、群れの 5 状態と一斉逃避、LOD 3 段、接地影；種 `mugil_cephalus`（ボラ、段階 ハク ≤35 mm / オボコ）、行動木 `fish_school`、`DRIVERS.haku`（`nearDistance` 5）、`tests/unit/haku.test.ts`）。走水ブランチの簡易な `mullet` ドライバと種データは置き換え。spawn は晩冬〜夏（秋は出ない；F3 で 3〜5 月にすると見られる）で `maps` 無しの規則が両方の浜に効き、走水向けに eelgrass_edge/bare の規則を追加。衝突は README／TESTING／manifest／CreatureSystem（`nearDistance` に統一）／drivers を手で解決。
- バージョン 0.19.0。

## 22 回目（デバッグの生物選択、ホームの戻り先、抱卵エドハゼ、行き先、砂の反射、ケースと水槽の貝）
- デバッグの生物選択: `DebugState.hidden`（種 id）、`App.setSpeciesShown / setAllSpeciesShown / applyHiddenSpecies`（`CreatureSystem.setHiddenSpecies` → `Spawner.hidden` を飛ばし、いる個体は despawn；アサリは `clams.group.visible`、マガキは `reef.group.visible`；マーカーと HUD の対象も外す）。`DebugPanel` に「出す生物」の行。
- ホームへ戻る: `enterHome` で `homePanel='none'`、`homeInfo=null`、`TankScene.resetView()`（view='tank'、滑らかな移動なしで既定の水槽の構図、OrbitControls を有効に）。
- 抱卵エドハゼ: `tools/models/edohaze/build.mjs` は `GOBY_GRAVID=1` で `edohaze_gravid.<tier>.glb` を書く（`npm run model:edohaze-gravid -- --tier hero|lod1|lod2`）。スキーマ `model.gravid {hero,lod1,lod2}`、`breeding {months, gravidShare, offSeasonShare}`。`Individual.gravid`（`generateIndividual` で成魚の雌に月別の確率、特徴の変数 `gravid` → 特徴「抱卵」）、`IndividualRecord.gravid`、`modelFor(sp, stage, gravid)` が gravid の段を重ねる（CreatureSystem・App.displayModelFor・TankScene・FieldCase）。`tests/unit/gravid.test.ts`。
- 行き先: `spots.json` は kasai_west と yokosuka（map null = 準備中）だけ。
- 砂の反射: `Terrain` の粗さ（濡れ 0.58、石英 0.42、膜 0.62）、キャッシュキー v2。
- ケースと水槽の貝: `DriverContext.canBurrow`（ケース false、水槽は `sandTop > 0`）、`root.userData.startOnSurface`（ケース・水槽の placeholder）。`AsariBehavior` に `SURFACE_REST`（横たわって休む；潜れるなら 1.5〜4.5 秒後に `beginBurrow`；潜れない床では潜っていても burial を 0 へ戻して横たわる）。
- バージョン 0.18.0。

## 21 回目（ユビナガホンヤドカリ、図鑑のマガキ、石の見た目）
- ユビナガホンヤドカリ: `claude/ecstatic-allen-yjy81l` をマージ（`src/creatures/yubinagahonyadokari/*`、`DRIVERS.pagurus`（`nearDistance` 4.5 で近距離の placeholder 個体を毎フレーム更新）、`Floor.sampleAt`、`Driver.debugLabel`、種データ `pagurus_minutus.json`、行動木 `hermit_crab_tidal`、`hermit-lab.html` を vite の第 2 入力に、`tests/unit/pagurus.test.ts`）。衝突は README／package.json／manifest／App（デバッグ表示）／drivers/index（asari・hamaguri と pagurus）／Observation（小さな動物の開始距離）を手で解決。`capture.tools` は今の網 6 種に（ブランチの `hand_net` は無い）。スモークのヤドカリ節は今の網の流れ（`groundUnderReticle` → `holdAt` → `forceCatch` → `swingNet`）に書き直し、番号を 20〜23 に。小さな動物の観察開始距離は `len × 7`。
- 図鑑のマガキ: 種データ `crassostrea_gigas.json`（sessile、collectable false、行動 5 つ、段階 稚貝 ≤26 / 若貝 ≤60 / 成貝 ≤115 / 老貝）、行動木 `oyster_reef`（rest のみ）、`Spawner.FIELD_SPECIES` に追加（礁が置くので spawner は出さない）。`OysterReef` に個体ごとの seed・年齢・込み具合・殻長を保存し、`infoOf(i)`（行列・付着面・状態）、`setHidden(i)`（インスタンス描画から外す）、`pickRay(origin, dir, maxDist)`（レティクルの選択）。`OysterDriver`（`src/creatures/oyster/OysterDriver.ts`）: `OysterDriver.pending` 経由で `ReefOysterInfo` を受け取り、同じ genome を `DETAIL.hero` で組み立てて石の上に置く（行列の位置・向きだけ使い、面の d は scale 倍）、5 状態の行動を回して状態が変わるたびに `BehaviorEvent`（`OYSTER_BEHAVIOR_ID`）。`DRIVERS.oyster`（placeholder は空の Group、preview は成貝を伏せて少し開けた姿；preview は描画する renderer を受け取れるようにして、図鑑の ModelPreview は自分の renderer で atlas を焼く）。App: `targetOyster` / `watchedOyster` / `observeOyster()`、HUD の prompt、[F]、`exitObserve` で despawn と `setHidden(false)`。`CreatureSystem.anchorOf` は view が付く前は `ind.pos` を返す（これまで driver の anchor が原点を返し、spawn 直後の観察がマップ中央へ飛んでいた）。`tests/unit/oysterSpecies.test.ts`。
- 石の見た目: `makeRockMaterial` の作り直し（広いまだら 1.7/7/23 m⁻¹、鉄さびの斑、泥の皮膜、中潮位の薄い殻の痂、緑藻；粒・白い輪・板模様・細かい凹凸はやめた）。干潟の真ん中の捨て石の山（`layRevetment` の mounds）は削除。

- バージョン 0.17.0。

## 20 回目（ゴロタ場と牡蠣礁）
- `origin/claude/blissful-planck-cmjqvc` をマージ（`src/creatures/oyster/*`、`src/world/Riprap.ts`、World/App/FPSController の組み込み、ビューア、単体テスト 16 件）。競合は `World.ts` の遠景の行だけ（遠景は非表示のまま）。
- `Riprap`: `RockShape(seed, rounded)`（丸い礫: 超楕円の指数 1.9〜2.3、浅い面取り 1〜3）、`ROUND_PROTOS` 6 種を割石 8 種の後ろに追加。`layApron(rng)` が両土塁の裾（高さが 1 m で 0.12 m 以上上がる位置を探して）に沿って z 0.3〜0.5 m ごとに 1 個、`u = −ln(1 − r·0.985)·1.9` m 干潟側（6.5 m まで）、裾の近くは 35 % が大きめ、35 % は面の下部にも。`leveeSites(seed, top, bottom, spacing)` が rock 地質・高さ帯・斜面（n.y ≤ 0.97）・まだらノイズで土塁面の付着点を返し、`terrainSurface()` で地形面へ射影。`World` は `attachSites` に加えて `leveeSites` を礁へ渡す。
- 濡れ帯の減光 0.6 → 0.68。バージョン 0.16.0。

## 19 回目（道具棚、当たり判定、ジャンプ、軽量化、濡れた砂、石の土塁、泥干潟、新しい道具）
- `ToolShelf.loadTool`: type 別に lod2 GLB を置く（網: Mouth の z から `pos = (0, mouth_h/2, 0.08) − up·mz`、基底 side/open/up、傾き 0.1 rad；掘る道具: `length_m × 0.78` を下へ；双眼鏡: 台）。各道具に `hitMat`（opacity 0、colorWrite false）の `BoxGeometry(PITCH×0.92, top, 0.34)` を置き、`pick` はヒット列の最初の toolId。PITCH 0.3。`ShopScene` カメラ (0.3, 1.2, 2.95)、fov 46。
- `FPSController`: `jumpBaseY`（絶対高さ）で飛び、`airY = jumpBaseY − groundNow`、`held('jump')` で再ジャンプ。`zoomFov`（道具が視野を狭める）、見回し速度は `zoomFov / 70`。
- `CreatureSystem`: `LOD1_DIST` 10、`placeholderBeyond_m`（スキーマ）で遠くはプレースホルダー（シロチドリ 10 m）。`PitDebris` は `coarseValve(form)`（`AsariModel.js`、lod2 の 1/3 分割）と 18〜30 片。`World` は skyline を scene に入れない。
- `Terrain.ts`: 濡れ 0.6 倍・青み 0.55・粗さ 0.3。`rock`（index 5）: 布積みのブロック（`vWorldPos.z/0.55, y/0.32`、半ブロックずらし、目地 `joint`、`gRock` で法線にブロックごとの傾き）。`SubstrateSchema` に rock、`Habitat` は rock を exposed_sand 扱い（`WET_TAU_MS` 15 分）、`mapImages` に色。
- `bake-map.mjs`: 土塁は `idx.rock`、`mudZone()`（楕円 + fbm の縁）で `mudness += 0.5`。
- 道具: `tools.json` に dig_mini / dig_rake / dig_shovel / obs_binoculars（`length_m`、`depth_cm`、`swing`、`magnification`、`fov_deg`、`reach_m`）、`shovel` は `digging/dig_trowel`。`ShovelView.setTool`: GLB の `Blade_Center` を原点に、y 軸半回転で先端を −z、`prepareNet` で濡れ。`BinocularView`: 胸の前に持ち、`setRaised` で目に（`.binocular-mask`、2 円の mask-composite）。`App`: `digDef()`（手の掘る道具）、`dig()` は `digDepth_cm`（種）> `depth_cm`（道具）で `hud.tooShallow`、`useTool` は optic では何もしない、フィールド更新で E / 右クリック押下中に `zoomFov = 70 / 倍率`、`pickTarget` の距離は構えている間 `reach_m`。`LOADOUT_MAX` 3、`tool3` = Digit3。ショップは `model` のある道具すべて。
- バージョン 0.15.0。

## 18 回目（写真の色、北の土手と左右の土塁、遠景）
- 色: `Terrain.ts` の `SUBSTRATE_COLORS` を写真の実測（jpeg-js でサンプル: 乾いた砂 (127,131,128)、濡れた平坦部 (128,140,145)、遠くの平坦部 (160,179,195)）に合わせて無彩色系に（sand 0.44/0.44/0.42 など）。濡れ帯は 0.76 倍 + 青み 0.45。`mapImages.ts` の `SUB_COLORS` も灰色系、`BEACH` は砂利を除外、`SHORE`（緑）は h > 3.1 から。
- 地形: `bake-map.mjs` に `BANK`（landZ −152 / +5.0 m、footZ −144 / +1.55 m）と `bankMask(z)`、`LEVEE`（inner 133、crest 147、+2.9 m、sink z 100→148）と `leveeAt(x,z)`。`height()` は relief / creek / dimple を `(1 − bankMask)` で止め、土塁は `lerp(h, lv.h, lv.m)` で混ぜる。`substrate()` は土手・陸地・（平坦部より 0.25 m 以上高い）土塁を gravel に。`kasai_west.json` の `max_tp_m` 6.0。シェーダーに `land = smoothstep(3.1, 3.9, y)` の草土色。
- 遠景: `src/world/Skyline.ts`。`plane(bearing, width, height, bottomY, cw, ch, draw, base, haze)` が canvas に輪郭を描いた `MeshBasicMaterial`（`fog: false`、透明、`depthWrite: false`）の板を半径 1900 m の方位に立て、`update(eye, fog, day)` でカメラ xz に追従し `base.lerp(fog, haze) × (0.1 + 0.9 day)`。方位は緯度経度から計算（富士 253°、スカイツリー 332°、東京タワー 284°、観覧車 36°、ゲートブリッジ 225°、舞浜 76°）、大きさは `R·tan(角度)`。街と木立は 15° ごとの板（北半分）。`World` が生成・追従更新。
- バージョン 0.14.0。

## 17 回目（ハマグリ、昼寝跡の貝殻、エドハゼ）
- ハマグリ: 種データ `meretrix_lusoria.json`（ブランチ版の spawn をまばらに: density 0.12、group [1,1]、max 10）、manifest に追加、`DRIVERS.hamaguri`（`AsariDriver(FORMS.hamaguri)`）。`Spawner` は `FIELD_SPECIES`（アサリ）だけ貝床に任せ、他の潜砂種は通常どおり湧かせる。`App.dig` は刃の範囲（半径 + 4 cm）にいる潜砂種の個体（`pitId !== -2`）を 1 匹掘り上げて `creatures.remove`、HUD の案内は潜砂種にスコップのヒント。
- 昼寝跡の貝殻: `PitDebris` は `sharedGeometry(FORMS.asari).valve[2]` を `valveFragment`（非インデックス化して弦で三角形を選別、全属性を引き継ぐ）で 5 種に切り、`makeShellOuterMaterial({instanced, style})` + `aSeed` のインスタンスで描く。`World.pits` を公開。1 跡あたり 28〜48 片。`Terrain.ts` の跡の砕片（grit）は 4 mm セルの四角から、セル内の丸い粒（半径 0.16〜0.36 セル、位置をずらす、明るさの揺らぎ）に。
- エドハゼ: `edohaze.hero.glb` をブランチの `models/edohaze.glb`（31.4 万三角形、クリップ Idle/Swim/Yawn）に差し替え。ブランチの `tools/edohaze/*.mjs`（眼の盛り上がり `EYE_PROTRUDE`、皮膚のひだ、暗い体色、`GOBY_GRAVID`）を `tools/models/edohaze/` に取り込み（build は `GLBBuilder(SPECIES.generator)` と眼ノードの `translation: tr.offset`）、lod1/lod2 を再生成。
- マハゼの成長段階: `claude/adoring-faraday-h25n7c` の `tools/mahaze/*.mjs`（`variant.mjs` の `pick()` で幼魚↔成魚の定義を成長度 g で補間、`body.mjs` の `patterns` で模様 3 種のテクスチャ、`fins.mjs` の `paintFinAtlas(defs, log, k)`）を `tools/models/mahaze/` に取り込み、`build.mjs` をブランチ版 + 段階（`--tier`、ひれアトラスを lod1 1/2・lod2 1/4 に `downsample2`）に。出力は `mahaze_<variant>.<tier>.glb`、hero はブランチの GLB をそのままコピー（29〜31 MB、`extras.variant`）。
  - データ: `SpeciesSchema.stages[].model {hero,lod1,lod2}`（省略分は `model` から）。マハゼは stages を 幼魚 ≤75 / 若魚 ≤145 / 成魚 に変え、それぞれ juvenile / subadult / adult の GLB、`model` 本体は subadult（図鑑用）。size は mean 95 / sd 40。`validate.mjs` は stage のモデルも存在確認。
  - ランタイム: `creatures/models/choice.ts` の `modelFor(sp, stage)` と `variantOf(id)`（FNV-1a）。`instantiateModel(rel, variant?)` は `userData.gltfExtensions.KHR_materials_variants`（GLTFLoader が未知拡張として userData に残す）の mappings から素材を `parser.getDependency('material')` で取り、`prepareMaterial`（tier 調整）→ `mesh.material` → `parser.assignFinalMaterial(mesh)`。`CreatureSystem.setTier` / `preload`、`App.displayModelFor(ind)`、`FieldCase` / `TankScene` の occupant が stage モデル + id の模様を使う。hero の `BodyMaterial.js` に `uJaws`（`fishFrame.jaws`、無ければ従来値）。
  - テスト: `tests/unit/growthModels.test.ts`（段階の閾値、modelFor、GLB の variants と extras.variant、variantOf の分布）、ブラウザ確認 `mahaze-stages-check.mjs`。
- バージョン 0.13.0。

