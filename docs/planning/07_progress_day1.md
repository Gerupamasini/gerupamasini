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

