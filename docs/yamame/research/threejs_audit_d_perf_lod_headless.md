# Three.js r186 監査 D: LOD／性能計測／後処理／水中表現／ヘッドレス描画検証

> 担当: 「LOD／性能／水中表現／ヘッドレス描画検証」。対象は **three@0.186.1**（`REVISION = '186'`: `src/constants.js:1`）と **@types/three@0.186.0**。
> 方針: 記憶ではなく実ソースを grep/Read し、主張には `ファイル:行` を付ける。可能なものは **ヘッドレス Chromium 141 上の WebGL2 で実際に描画して確かめた**。
>
> **この文書の読み方**
> - 根拠の種別: **[S]** ソースの該当行を直接読んで確認 / **[H]** ヘッドレス Chromium（SwiftShader 上の WebGL2）で実際に描画・実行して確認 / **[R]** ソースからの推論（実行していない）/ **[U]** 未確認。
> - `src/…` は `three-0.186.1/package/src/…`、`jsm/…` は同 package の `examples/jsm/…` を指す。
> - **時間（ms）はすべて SwiftShader（CPU ラスタライザ）の値**で、GPU の値ではない。同一マシンでも実行ごとに最大 2 倍ぶれる。使ってよいのは**相対比と、描画回数・draw call 数などの整数カウント**だけ。
> - 本書の [H] の数値は `run_all.sh`（付録 A）で再取得でき、描画結果は 3 回連続でビット一致した（§5.5）。
> - 他の監査との関係: スキニング／カリング／mixer の詳細は `threejs_audit_b_skinning_anim.md`（以下 **B**）、マテリアル／色空間は `threejs_audit_a_materials.md`、水中光学の数値は `r14_render_tech.md`（以下 **r14**）を参照。本書はそれらと重複しない範囲（LOD・計測・後処理・フォグ・コースティクス・水面アドオン・ヘッドレス検証）を扱う。

---

## 1. 結論（実装方針に直結する推奨）

### 1.1 推奨一覧

| # | 推奨 | 理由（要点） | 詳細 |
|---|---|---|---|
| 1 | **主役（近景）の LOD は `THREE.LOD` に「同一 `Skeleton`・同一 `bindMatrix` を共有する `SkinnedMesh` を、頂点数違いのジオメトリで並べる」**。最遠だけ非スキンの `Mesh`（焼き込みポーズ）にする | スケルトンは見えているレベルの分しか `update()` されず、共有なら 1 回／フレーム。共有スケルトンで曲げた 2352 三角形と 208 三角形のシルエットは 1 px 以内で一致 [H] | §2.2 |
| 2 | **`hysteresis` は 0.1〜0.2 を level ≥ 1 に付ける**（level 0 の値は無視される） | 「粗い側へは距離 D で切替、細かい側へ戻るのは D×(1−h) 未満」。[H] で 20 / 18 を確認 | §2.1 |
| 3 | **初回切替のヒッチ対策は「実キャンバスへ全レベル可視で 1 回描画」**（`autoUpdate=false` にして全 `visible=true`、描画後に戻す）。`renderer.compile()` だけでは初回描画の遅れが消えず、レンダーターゲットへのウォームアップは別プログラムを作るだけで無効 | 初回切替フレーム: 何もしない 85〜151 ms、`compile()` 後 72〜99 ms、実キャンバスへ全レベル描画後 4〜14 ms（定常 2〜5 ms）[H] | §2.2, §3-8 |
| 4 | **群れ（数百〜数千）は `THREE.LOD` を個体ごとに使わず**、距離バケット（tier）ごとに `InstancedMesh` を持ち毎フレーム行列を詰め直す（`mesh.count` を縮める）か、`BatchedMesh.setGeometryIdAt` で個体ごとにジオメトリを切り替える。ただし **BatchedMesh はスキニングもモーフも不可**、InstancedMesh はスキニング不可（モーフは `morphTexture` のみ）。**どちらも個体単位の LOD／カリングは自前** | `BatchedMesh.js` に skin／morph の文字列が 0 件、`WebGLPrograms.js:330` で skinning は `object.isSkinnedMesh` のみ [S]。InstancedMesh は 80,000 三角形全部を描く（視錐台外の個体も）[H] | §2.3 |
| 5 | **`SkinnedMesh`／`InstancedMesh` の `boundingSphere` は初回 1 回しか計算されない**。個体が動く系では **保守的な球を手動で 1 度だけ設定**し、毎フレームの `computeBoundingSphere()` は使わない（1.8k 頂点で 1.2 ms、51k 頂点で 22 ms）。動かさないなら `frustumCulled=false` も可 | root ボーンを 20 動かすと、視野内の体が丸ごと消えた [H] | §2.4 |
| 6 | **後処理は「必要最小限」**: 既定は `outputBufferType: HalfFloatType` + `renderer.setEffects([...])`（MSAA を保ったまま HDR→トーンマップが最後）か、`EffectComposer` に **`samples: 4` 付き** HalfFloat RT を渡して `RenderPass → UnrealBloomPass(弱) → OutputPass`。**GTAO／SSAO／SAO／SSR／Bokeh／Outline はそれぞれシーン全体を 1〜2 回描き直す**（GTAO 1 つで draw call 15→30、影マップも再描画）ので、入れるなら 1 つずつ測る | EffectComposer 既定 RT は MSAA 無し。GTAO+Bloom+Bokeh で renderer.render が 22 回、影マップ 3 回、skeleton.update 5 回 [H] | §2.6 |
| 7 | **AO／DOF を使う場合の 3 点セット**: (a) `renderer.shadowMap.autoUpdate=false` にして**フレーム先頭で 1 回だけ** `needsUpdate=true`（影 3 回→1 回）、(b) 水面など `onBeforeRender` を持つ物は**別レイヤー＋AO 用の別カメラ**で G-buffer から外す（入れ子の鏡面描画 2→1）、(c) 半透明（鰭・粒子）が G-buffer に不透明として書かれる点を確認 | [H] で (a)(b) を数値確認。(c) はソースの読み（`WebGLRenderLists.js:134`, `WebGLRenderer.js:2139`）[S] | §2.6, §3-2〜4 |
| 8 | **水中フォグは `onBeforeCompile` で自前実装**: 共有 uniform（σ の RGB、水の色）＋ビュー空間位置の varying で**放射距離**を fragment で `length()` し、`#include <tonemapping_fragment>` の**前**（線形）で `c·T + L·(1−T)`, `T=exp(−σ·r)`。標準 `FogExp2` は距離の**二乗**・平面深度・（canvas 直描きでは）sRGB 空間混合で、Beer–Lambert ではない | 標準フォグ・チャンク置換・自前版の 3 方式すべてで画素値が解析解と 1 階調以内で一致 [H]（§1.3 のコードをそのまま実行して確認） | §1.3, §2.7 |
| 9 | **コースティクスは「平面投影の `onBeforeCompile`（世界座標 XZ、2 層の `min`、時間オフセット）」を第一候補**。`SpotLight.map` は「遠方・狭角・`decay=0` のスポット」で疑似平行光として使えるが、`texture.offset/repeat/rotation` は効かず、円錐外は無効、alpha は無視。**ただし JSDoc の「castShadow=false だと無効」は r186 では誤り**（無影でも効く）。アニメは `RenderTarget.texture` を `map` に渡せば GPU だけで回る | 平面投影は SkinnedMesh／InstancedMesh／床で GL エラー無く描画 [H]。SpotLight.map の各挙動を画素で確認 [H] | §1.4, §2.9 |
| 10 | **水面は `Reflector`／`Water`／`Water2`（Reflector+Refractor）を使えるが、各々シーンを 1〜2 回再描画**（HalfFloat・MSAA4 の RT）。**カメラが水の下（面の裏側）にいると何も描かない**ので、水中から見上げる面は**メッシュを反転**して置く。入れ子の描画は `renderer.info` の数値と `LOD` の状態を上書きする | カメラ下方 → 描画 1 回のみ、反転すると鏡面 RT が描かれる [H]。`LOD.getCurrentLevel()` が鏡面カメラの選択に化ける [H] | §2.8 |
| 11 | **計測**: `renderer.info.autoReset=false` ＋フレーム先頭で自前 `reset()`（後処理や水面があると既定では**最後の 1 回の render() の値しか残らない**）。時間は「1 画素 `readPixels` で同期」＋（あれば）`EXT_disjoint_timer_query_webgl2`。ヘッドレスでは後者も値を返すが **CPU ラスタ時間** | composer 構成の `info.render.calls` は 1（実際は 64）[H] | §1.5, §2.5 |
| 12 | **ヘッドレス検証ループの標準手順**: `playwright-core` + `/opt/pw-browsers/chromium` + **ローカル HTTP サーバ**（`file://` は ES module が CORS で失敗）。フラグ不要（付けても同じ）。**描画は決定論的**でスクリーンショットの md5 が 3 回一致。時間のしきい値でテストを落とさない | §5 に最小コードと手順 | §5 |

### 1.2 LOD の組み立て（近景の魚 1 匹分）

```js
// ① 同一スケルトン・同一 bindMatrix を共有（bindMatrix を渡さないと calculateInverses() が走って boneInverses が壊れる: SkinnedMesh.js:230-247）
const hi  = new THREE.SkinnedMesh(geoLOD0, mat); hi.add(rootBone); hi.bind(skeleton);
const mid = new THREE.SkinnedMesh(geoLOD1, mat); mid.bind(skeleton, hi.bindMatrix);   // 骨は hi 側にだけ add する（二重に add しない）
const far = new THREE.Mesh(geoFarBaked, matFar);                                        // 最遠: 非スキン（焼き込みポーズ）。別プログラムになる点に注意（§3-8）

const lod = new THREE.LOD();                                  // LOD ノードを「魚の中心」に置く（距離は LOD ノード原点で測られる: LOD.js:257）
lod.addLevel(hi,  0);
lod.addLevel(mid, 6,  0.15);                                  // 6 m 以遠で mid。戻りは 6×0.85=5.1 m 未満
lod.addLevel(far, 20, 0.15);
group.add(lod);                                               // 個体の移動・回転は「mesh と骨の共通の親 Group」で行う（B §1.5）

// ② ウォームアップ（ロード画面の裏で 1 回）。実キャンバスに、全レベル可視で描く
lod.autoUpdate = false; lod.levels.forEach(l => (l.object.visible = true));
renderer.render(scene, camera);
lod.autoUpdate = true;                                        // 次の render() の projectObject で update() が可視状態を正しく戻す

// ③ 遠いレベルが見えている個体は mixer の更新を間引ける（見えない骨は skeleton.update もテクスチャ更新もされない: WebGLObjects.js:46-56）
if (lod.getCurrentLevel() >= 2) action.paused = true;         // ただし Reflector 等を使うなら getCurrentLevel() を信用しない（§3-7）
```

- 群れ（§1.1 の 4）は、tier ごとの `InstancedMesh` に「距離で振り分けた個体の行列だけを先頭から詰める → `mesh.count = n; mesh.instanceMatrix.needsUpdate = true`」（`InstancedMesh.js:339-344`, `WebGLObjects.js:22-44`）。視錐台判定は自前で行い、`boundingSphere` は群れ全体を覆う球を手動設定する（§2.4）。
- `BatchedMesh` は `setGeometryIdAt` で個体ごとの LOD ができ（[H] 1000 個体を 3 段に振り分けて 1 draw call、三角形数が期待値と一致）、視錐台判定と距離ソートも内蔵する。ただし**剛体のみ**。

### 1.3 水中フォグ（波長別吸収）— 推奨実装（実行確認済み [H]）

```js
// 共有 uniform: 全マテリアルが同じオブジェクトを参照するので、1 回の更新で全体に反映される（再コンパイル不要）
const uWaterSigma = { value: new THREE.Vector3(0.34, 0.064, 0.010) };  // 1/m、線形 RGB。値は r14 F-15 の純水下限（M・未検証）。渓流の実効値はもっと大きい
const uWaterLight = { value: new THREE.Vector3(0.02, 0.18, 0.28) };    // 線形 RGB の「水の色」（無限遠で収束する色）

function patchWaterFog(mat) {
  mat.fog = false;                                   // 標準フォグを切る（二重掛け防止）
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWaterSigma = uWaterSigma; sh.uniforms.uWaterLight = uWaterLight;   // 同一オブジェクトをそのまま代入
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWaterPos = mvPosition.xyz;');   // ビュー空間位置: 補間が厳密。length() は fragment で
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;\nuniform vec3 uWaterSigma;\nuniform vec3 uWaterLight;')
      .replace('#include <tonemapping_fragment>',
        'vec3 waterT = exp( - uWaterSigma * length( vWaterPos ) );\n' +
        'gl_FragColor.rgb = gl_FragColor.rgb * waterT + uWaterLight * ( 1.0 - waterT );\n' +   // 線形・トーンマップ前
        '#include <tonemapping_fragment>');
  };
  mat.customProgramCacheKey = () => 'water-fog-v3';  // 既定は onBeforeCompile.toString()（Material.js:544-548）。挙動を変えたら必ずキーも変える
  return mat;
}
```

- 画素検証（NoToneMapping・sRGB canvas、アルベド線形 (0.9,0.6,0.3)、水色 (0.02,0.18,0.28)、σ=(0.12, 0.0192, 0.00528)）: d=1/3/6/12 m で出力 (231,202,149)/(208,200,149)/(179,196,149)/(131,190,149) が解析解 `sRGB(c·T+L·(1−T))` と完全一致。`uWaterSigma` を実行中に変えても**プログラム数は増えず**画素も解析解どおり。広角コーナーの画素は放射距離（12.43）の解析解と一致し、平面深度（10）の解析解とは不一致 [H]。
- **適用できるシェーダ**: `project_vertex` と `tonemapping_fragment` を両方持つもの = basic／lambert／phong／matcap／toon／physical（= Standard も）／points／linedashed／shadow（`ShaderLib/*.glsl.js` を grep [S]）。**Sprite は `project_vertex` が無い**（`sprite.glsl.js:15-35` が `mvPosition` を自前計算）ので別のフックが要る。`Water.js` 等の ShaderMaterial は `fog_fragment` を直接 include する（`Water.js:209`）ので、水面は §2.7 の「チャンク置換」方式のほうが合う。
- `InstancedMesh`／`SkinnedMesh` には、`mvPosition` が `project_vertex.glsl.js` 内でスキニング後・インスタンス行列後に作られる（`ShaderChunk/project_vertex.glsl.js:1-18` [S]）ため、そのまま乗る。Standard の SkinnedMesh＋InstancedMesh で GL エラー無しを確認 [H]。

### 1.4 コースティクス — 平面投影（推奨）と `SpotLight.map`（代替）

```js
// 受け面（床・岩・魚体）に共通で足す。世界座標 XZ を 2 つの時間オフセットで引き、min を取る（明線の交差が出る）
const U = { tCaustic: { value: tex /* RepeatWrapping の RGBA（R に強度） */ }, uTime: { value: 0 }, uScale: { value: 0.35 }, uStrength: { value: 4.0 } };
mat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCausticWPos;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 cw = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        cw = instanceMatrix * cw;
      #endif
      vCausticWPos = ( modelMatrix * cw ).xyz;`);                       // transformed はスキニング後
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCausticWPos;\nuniform sampler2D tCaustic; uniform float uTime, uScale, uStrength;')
    .replace('#include <opaque_fragment>', `
      float cA = texture2D( tCaustic, vCausticWPos.xz * uScale + vec2( uTime * 0.03, uTime * 0.02 ) ).r;
      float cB = texture2D( tCaustic, vCausticWPos.xz * uScale * 1.3 - vec2( uTime * 0.02, -uTime * 0.025 ) ).r;
      outgoingLight += diffuseColor.rgb * uStrength * min( cA, cB ) * clamp( dot( normal, uSunDirView ), 0.0, 1.0 );  // uSunDirView は自前 uniform（要追加）
      #include <opaque_fragment>`);
};
```

- 上のコードは**検証版では法線項を `vec3(0,1,0)` の固定値で置いている**（x5_caustics.html）。実装では `normal`（ビュー空間）と太陽方向（ビュー空間）の内積を使うこと。固定値版で 床／InstancedMesh（球 2）／SkinnedMesh を 1 つのマテリアルで描画し、GL エラー 0、時間を変えると画素が変わることを確認 [H]。影（魚影・岩影）で光を遮るには別途 `directLight` 側へ掛ける必要がある（未実装・未検証）。
- **`SpotLight.map` を使う場合の実測仕様**（§2.9）: (a) castShadow=false でも効く、(b) `texture.offset/repeat/rotation` は無視される、(c) alpha は使われず RGB が光色に乗る、(d) 投影は shadow カメラの透視投影なので、遠く（300）・狭角（0.025 rad）・`decay=0` に置けば平行光に近い（深さ 6 m 違いの縞ピッチ比 1.022、点光源なら 1.020 の理論どおりで、近距離 12 m では 1.50）、(e) `WebGLRenderTarget.texture`（HalfFloat・Repeat）を `map` に渡して毎フレーム描き換えられる。

### 1.5 計測レシピ

```js
renderer.info.autoReset = false;                         // 後処理・水面・composer があると、既定は最後の render() の値しか残らない
function measure(fn) {
  renderer.info.reset(); const t0 = performance.now(); fn();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // 1 画素の読み戻し = GPU 完了待ち（gl.finish() は当てにしない）
  const { calls, triangles, points, lines } = renderer.info.render;     // calls には影マップの draw も含まれる
  return { ms: performance.now() - t0, calls, triangles, frame: renderer.info.render.frame,
           geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length };
}
```

- `info.reset()` が消すのは `calls/triangles/points/lines` だけで、`frame` と `memory` は消さない（`WebGLInfo.js:52-59`）。`frame` は `render()` 1 回ごとに +1（`WebGLRenderer.js:1729`）で、**composer や水面があると「1 フレーム = 複数 frame」**。
- GPU 時間は `EXT_disjoint_timer_query_webgl2`（SwiftShader でも利用可・`disjoint=false`・値は 98〜142 ms で CPU ラスタ時間と一致 [H]）。実ブラウザでの可用性は未確認（§4）。

---

## 2. 確認事項と根拠（ファイル:行）

### 2.1 `THREE.LOD`（`src/objects/LOD.js`）

| 項目 | 内容 | 根拠 | 種別 |
|---|---|---|---|
| `addLevel(object, distance=0, hysteresis=0)` | `distance` は `Math.abs`。昇順に挿入（`distance < levels[l].distance` で止まる）。`this.add(object)` でレベルは **LOD の子**になる。戻り値は `this` | `LOD.js:116-140`（`118`, `124-134`, `136`） | S |
| `levels` | `{object, distance, hysteresis}` の配列。`defineProperties` で配列自体は差し替え不可 | `LOD.js:62-73` | S |
| `autoUpdate` | 既定 `true`。レンダラが `projectObject` の中で `update(camera)` を呼ぶ（`layers` が通る LOD のみ。視錐台判定は無い） | `LOD.js:83`, `WebGLRenderer.js:1864-1874` | S |
| `update(camera)` | レベルが 2 つ以上のときだけ動く。距離 = `camera.matrixWorld` の位置と **LOD ノードの `matrixWorld` 位置**の距離 ÷ `camera.zoom`。`levels[0].visible=true`、i=1.. で「`levels[i].object.visible` なら `levelDistance -= levelDistance*hysteresis`」→ `distance >= levelDistance` なら i−1 を隠して i を表示、でなければ break。残りは `visible=false`。`_currentLevel = i−1` | `LOD.js:250-298`（`254`, `256-259`, `261`, `265-286`, `288`, `290-292`） | S |
| hysteresis の意味 | **現在そのレベルが見えているときだけ**、そのレベルの開始距離が D → D(1−h) に下がる。粗い側への切替は常に D ちょうど、細かい側へ戻るのは D(1−h) 未満。level 0 の hysteresis は参照されない（ループが i=1 から） | `LOD.js:265-273`、JSDoc `113` | S |
| 実測（D=20, h=0.1；D=40, h=0） | 上り: 17.9→L0, 19.9→L0, 20→L1, 39.9→L1, 40→L2。下り: 41→L2, 40→L2, 39.9→L1, 20.1→L1, 19.9→L1, 18.1→L1, **17.9→L0**。level 0 に h=0.5 を付けても挙動不変 | `x1_lod.html`（`lod_sweepUp/Down`） | H |
| `camera.zoom` | `distance / zoom`。zoom=2 で距離 30 は実効 15 → L0、距離 45 は L1 | `LOD.js:259` | S/H |
| `autoUpdate=false` | 描画してもレベル不変、手動 `lod.update(camera)` で更新 | `x1_lod.html`（`lod_autoUpdateFalse`） | H |
| 初期状態 | 最初の `update()` までは **全レベルが `visible=true`**、`getCurrentLevel()=0`。レベルが 1 つの LOD は `update()` が何もしない | `LOD.js:254`, `x1_lod.html` | S/H |
| カメラが複数 | `render()` ごとに `update(その camera)`。**最後に呼んだカメラの選択が `.visible` に残る** | `x1_lod.html`（`lod_twoCameras`: 近 L0 → 遠 L2、旗 `001`） | H |
| レイキャスト | `getObjectForDistance(raycaster.ray.origin までの距離)` を使う（zoom は無視） | `LOD.js:188-220`, `228-240` | S |
| 視錐台 | LOD ノード自体は判定されない。各レベルの Mesh が個別に判定される。画面外でも `update()` は走る（`level` が更新され、`calls=0`） | `WebGLRenderer.js:1872-1874` vs `1912-1914`, `x1_lod.html`（`lod_offscreen`） | S/H |
| 影 | 影パスは `visible=false` の物を飛ばす → 隠れているレベルは影も描かない | `WebGLShadowMap.js:520` | S |

### 2.2 `SkinnedMesh` を LOD のレベルにする

| 項目 | 内容 | 根拠 | 種別 |
|---|---|---|---|
| `skeleton.update()` の条件 | `objects.update(object)` が `skeleton` ごとに 1 回／`info.render.frame` で呼ぶ。`objects.update` を通るのは、メイン描画の `projectObject` を通過した物（`visible`・layers・視錐台）と、影パスで通過した物だけ → **隠れたレベルのスケルトンは更新されない** | `WebGLObjects.js:46-56`, `WebGLRenderer.js:1912-1916`, `WebGLShadowMap.js:526-530` | S |
| 実測（共有 1 スケルトン） | 近 L0／遠 L1 のどちらでも `skeleton.update` は 1 回／描画。ボーンテクスチャも 1 つ | `x1_lod.html`（`lodSkin_A`） | H |
| 実測（レベルごとに別スケルトン 16 骨／6 骨） | 見えている側だけ更新（[1,0]→[0,1]）。**一度も描かれていない側の `boneTexture` は `null` のまま**（遠側は初回表示まで未確保） | `x1_lod.html`（`lodSkin_B`: `boneTextureAllocated [true,false]`） | H |
| 共有の仕方 | `bind(skeleton, bindMatrix)`。**`bindMatrix` を省略すると `updateMatrixWorld(true)` ＋ `skeleton.calculateInverses()` が走る**ので、2 つ目以降のレベルには必ず 1 つ目の `bindMatrix` を渡す | `SkinnedMesh.js:230-247`（`234-242`） | S |
| 見た目の一致 | 共有スケルトンで 11 関節を曲げ、2352 三角形（L0）と 208 三角形（L1）を別々に描画: 画素数 1345／1324、外接矩形は x1 のみ 1 px 差 | `x7_misc.html`（`sharedSkeletonLod`） | H |
| 骨の更新自体は止まらない | 骨は `Object3D` なので、メッシュが `visible=false` でも `updateMatrixWorld` は子を辿る（`visible` を見ない）。mixer を止めない限り骨の計算は続く | `Object3D.js:1176-1214` | S |
| プログラムが別になる | `skinning: object.isSkinnedMesh === true`、`toneMapping`・`outputColorSpace`（RT かどうか）もキーに入る → 非スキンの遠景、RT でのウォームアップは**別プログラム** | `WebGLPrograms.js:177-183`, `213`, `330`, `436-445`, `490` | S |
| 切替ヒッチ（SwiftShader） | 非スキン・別マテリアルの遠レベルへの初回切替: プログラム数 +1、初回描画 85〜151 ms（定常 2〜5 ms）。`renderer.compile()` はプログラム登録を前倒しするが（切替時の増分が 0）初回描画は 72〜99 ms のまま。**実キャンバスへの全レベル可視描画**で 4〜14 ms。RT へのウォームアップはプログラム数が切替時にさらに +1 | `x1_lod.html`（`lodSkin_C_*`） | H |
| `compile()` の走査 | `scene.traverse`（不可視も含む）で全メッシュのマテリアルを準備。ライトは `traverseVisible`。`compileAsync` は `KHR_parallel_shader_compile` が無いと 10 ms 待ちに退化 | `WebGLRenderer.js:1396-1499`, `1515-1569` | S |

### 2.3 `InstancedMesh`／`BatchedMesh` の対応範囲

| 機能 | InstancedMesh | BatchedMesh | 根拠 |
|---|---|---|---|
| draw call | 1（`renderInstances`） | 1（`WEBGL_multi_draw`。無い環境は個体数ぶんループ） | `WebGLRenderer.js:1315-1339` [S]、calls=1 [H] |
| 個体の変換 | `setMatrixAt` ＋ `instanceMatrix.needsUpdate` | `setMatrixAt` | `InstancedMesh.js:339-344`; `BatchedMesh.js:1075` |
| 個体の色 | `setColorAt`（`instanceColor`） | `setColorAt`（colorsTexture） | `InstancedMesh.js:322-327`; `BatchedMesh.js:1109` |
| 個体ごとに別ジオメトリ | 不可 | 可（`addGeometry` → `addInstance(geometryId)` / `setGeometryIdAt`）。**全ジオメトリが index の有無・属性名・itemSize・normalized で一致**している必要 | `BatchedMesh.js:418-446`, `561`, `627`, `1201-1211` |
| 個体単位の視錐台カリング | **無い**（オブジェクト全体で 1 つの球）。視野外の個体も全部描く | `perObjectFrustumCulled`（既定 true）。幾何ごとの球を個体行列で変換して判定 | `Frustum.js:146-166`; `BatchedMesh.js:211`, `1560-1619`, `1648-1677` |
| 個体単位の距離ソート | 無い | `sortObjects`（既定 true、不透明は前→後、透明は後→前）／`customSort` | `BatchedMesh.js:221`, `247`, `1583-1632` |
| 個体の非表示 | `mesh.count` を縮める（先頭 count 個だけ描く）か行列を潰す | `setVisibleAt` | `InstancedMesh.js:84`; `BatchedMesh.js:1163` |
| スキニング | **不可**（`skinning` は `object.isSkinnedMesh` のみ） | **不可**（`BatchedMesh.js` に `skin`／`morph` の文字列が 0 件: `grep -c -i "skin\|morph"` = 0） | `WebGLPrograms.js:330` |
| モーフ | `morphTexture`＋`setMorphAt`（全個体が同じジオメトリ。B 参照） | 不可 | `InstancedMesh.js:355-386` |
| 影 | 通常どおり | `onBeforeShadow` が影カメラで同じ選別を行う | `BatchedMesh.js:1688-1692` |
| バウンディング | `boundingSphere` は null で始まり、**初回のカリング時に 1 度だけ**全個体から計算（O(count)）。以後、個体を動かしても更新されない | `InstancedMesh.js:95-100`, `151-178`; `Frustum.js:148-152` | S |
| CPU コスト | `computeBoundingSphere()` 20,000 個体で 5〜10 ms | `onBeforeRender` が**描画ごと・影パスごとに全個体を走査**: 1,000 個体 0.7〜1.1 ms／5,000 個体 1.3 ms／20,000 個体 4.3〜4.7 ms（ソート＋カリング）、カリングのみ 1.7〜2.2 ms、無し 0.15〜0.2 ms | `BatchedMesh.js:1523-1686` [S]、`x2_instancing.html` [H]（Chromium の JS 時間。GPU 無関係） |

実測 [H]（`x2_instancing.html`）:
- InstancedMesh 1000 個体（80 三角形）: 視野内 80,000 三角形、**視野を 1 隅にズームしても 80,000 三角形のまま**、視野外へ向けると 0 draw call、`count=100` で 8,000。
- 個体を 500 離れた所へ動かして `setMatrixAt` ＋ `needsUpdate` しても球は旧位置のままで **calls=0（誤カリング）**。`computeBoundingSphere()` を呼ぶか `frustumCulled=false` で復帰。
- BatchedMesh 1000 個体: 全視野 320,000 三角形 = 1 draw call。1 隅ズームで個体単位カリングにより 78,400、`perObjectFrustumCulled=false` で 320,000。距離で 3 ジオメトリに振り分け（132／264／604 個体）→ 101,840 三角形（期待値と一致）、`setVisibleAt` で半分隠すと 50,920。

### 2.4 視錐台カリング

- メッシュ系の判定は `Mesh.intersectsFrustum` → `Frustum.intersectsObject`（`Mesh.js:226-230`, `Frustum.js:146-166`）。**`object.boundingSphere` を持つ型（Instanced／Batched／Skinned）はそれを、持たない型は `geometry.boundingSphere` を**使い、null なら**その場で 1 回計算**する。
- `SkinnedMesh` の球は**バインドポーズ**から計算され、`computeBoundingSphere()` を呼ばない限り更新されない（JSDoc に明記: `SkinnedMesh.js:133-137`）。実測 [H]: root ボーンを 20 動かし、カメラを追従させて体が視野内でも **calls=0**（誤カリング）。`frustumCulled=false` または `computeBoundingSphere()` で復帰。**1 回の再計算コスト**は 1.8k 頂点 1.2 ms、10.6k 頂点 4.8〜5.0 ms、51k 頂点 21〜22 ms（全頂点を CPU スキニング）。
- 実用: 魚ごとに **泳ぎの全可動域を覆う球**を 1 度だけ手動設定（`mesh.boundingSphere = new THREE.Sphere(center, r)`）。球が体の変形に追随する必要は無く、[H] で「球は原点・半径 3 のまま、体が 2.5 ずれても描画される」ことを確認。root ボーンは動かさず親 `Group` を動かす（B §1.5）。
- 影パスの判定は**影カメラの錐台**に対して行われる（`WebGLShadowMap.js:526`）。メインカメラの視野外の物が視野内へ影を落とすのは正しく描かれる。

### 2.5 `renderer.info`

| 項目 | 内容 | 根拠 | 種別 |
|---|---|---|---|
| フィールド | `memory.{geometries,textures}`, `render.{frame,calls,triangles,points,lines}`, `programs`, `autoReset`, `reset()` | `WebGLInfo.js:5-16`, `52-68` | S |
| 自動リセット | `render()` の冒頭近く（`info.render.frame++` の直後）で `autoReset` なら `reset()`。つまり **render() を呼ぶたびに前の calls/triangles が消える** | `WebGLRenderer.js:1729-1731` | S |
| 影の draw も calls に入る | 3 メッシュ描画＋影 2 → `calls=5`、8 メッシュ（床＋球 6＋魚）＋影 7 → `calls=15` | `render_test.html`, `x3_post.html`（A_plain） | H |
| 後処理／水面での見え方 | EffectComposer（Render+Output）で `info.render.calls` = **1**（最後の全画面 1 draw のみ）、GTAO+Bloom+Bokeh 構成でも 1（実際は 64 calls／60,121 三角形）。`autoReset=false` ＋自前 `reset()` で 64 が取れる。Reflector／Water を含むフレームも、入れ子描画のたびに reset されるので以後の分しか残らない（calls=1 など） | `x3_post.html`, `x6_water.html` | H |
| 公式の勧め | JSDoc が「後処理があるなら `autoReset=false` ＋手動 `reset()`」と明記 | `WebGLRenderer.js:540-559` | S |
| BatchedMesh／Instanced | multi_draw の BatchedMesh は calls=1、triangles は選別後の合計。Instanced は `count × 三角形数`（頂点で捨てられる個体も数える） | `x2_instancing.html` | H |

### 2.6 後処理

**2 つの経路がある**（r186 で `WebGLRenderer` に内蔵経路が追加されている）:

| 経路 | 内容 | 根拠 |
|---|---|---|
| (A) `EffectComposer`（`jsm/postprocessing/EffectComposer.js`） | 既定の RT は `HalfFloatType` だが **`samples` 指定なし = MSAA 無し**。`renderTarget2 = renderTarget.clone()`。`addPass` が `setSize(幅×pixelRatio)` を呼ぶ。最後のパスが `renderToScreen`。**`antialias:true` はここでは効かない** → `new EffectComposer(renderer, new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 }))` と渡す（[H] で動作） | `EffectComposer.js:52-81`, `149-152`, `214-237` |
| (B) 内蔵 `outputBufferType` ＋ `setEffects` | コンストラクタに `outputBufferType: HalfFloatType`（または Float）→ シーンを（`antialias` なら 4x MSAA の）HDR RT に描き、トーンマップ＋色空間変換を**最後に**全画面 1 draw で行う。`setEffects([...])` は同じ `Pass` インターフェイス（`render(renderer, writeBuffer, readBuffer, deltaTime)`）の物を受け、`OutputPass` は不要（入れると警告）。`toneMapping===NoToneMapping` かつ効果無しのときは内蔵 RT を使わない。MSAA はシーン RT のみ（効果は単一サンプルのピンポン RT） | `WebGLRenderer.js:84`, `114`, `565-569`, `747-773`, `1659`, `1745`; `WebGLOutput.js:31-43`, `138-160`, `162-198`, `206-261` |
| 実測 [H] | (B) で `UnrealBloomPass`／`GTAOPass`／`BokehPass` が動作（GL エラー無し、画像も正常）。GTAO+Bloom+Bokeh の ms は (A) の約 0.7〜0.8 倍（ノイズ大）。(B) でも G-buffer 系パスは入れ子で `renderer.render(scene…)` を呼ぶ（`_isCompositing` 中は内蔵 RT を使わない: `WebGLOutput.js:165`） | `x3_post.html?mode=effects` |

**各パスの追加コスト**（SwiftShader、640×360、8 メッシュ＋スキン 1。B＝Render+Output を 1 とした相対値、2 回の実行の範囲）:

| 構成 | `renderer.render` 回数 | 影マップ描画 | `skeleton.update` | 相対時間 | 備考 |
|---|---|---|---|---|---|
| A: 素の `render()` | 1 | 1 | 1 | 0.6〜0.95 | |
| B: Render＋Output | 2 | 1 | 2 | 1.0 | 全画面 1 draw が増えるだけで `frame` が +1 → スケルトンが 2 回更新される |
| C: ＋Bloom | 15 | 1 | 2 | 1.4〜1.5 | 全画面 13 draw（5 mip の H/V ブラー＋合成）。シーン再描画なし |
| D: ＋GTAO | 7 | **2** | 3 | 2.8〜3.1 | G-buffer 用に全シーンを `MeshNormalMaterial` で再描画（15 calls／20,034 三角形） |
| E: ＋Bokeh | 4 | **2** | 3 | 1.5〜2.1 | 深度用に全シーンを `MeshDepthMaterial`（RGBA パック）で再描画 |
| F: GTAO＋Bloom＋Bokeh | 22 | **3** | 5 | 3.9〜4.1 | calls 合計 64 |
| G: F ＋ 影を 1 回に | 22 | **1** | 3 | 3.9〜3.7 | 再描画パスは 8 calls／10,018 三角形（影の draw が消える） |

- GTAO: `GTAOPass.js:161`（`MeshNormalMaterial`）、`317-322`（HalfFloat の法線 RT＋`DepthTexture`）、`502-506`（G-buffer 描画）、`621-649`（`scene.overrideMaterial` に差し替えて `renderer.render(scene, camera)`）、`651-665`（隠すのは `Points`／`Line` だけ）。コンストラクタ `GTAOPass(scene, camera, width, height, parameters, aoParameters, pdParameters)`（`:56`）。
- Bokeh: `BokehPass.js:63-75`（深度 RT は HalfFloat・Nearest）、`139-150`（`overrideMaterial=MeshDepthMaterial(RGBADepthPacking)` で再描画）。
- SSAOPass（`:194`, `287`）／SAOPass（`:125`, `246`）は法線 override で**シーン +1**、SSRPass は**ビューティ＋法線の +2**（`:545`, `550`、selective なら更に +1）、OutlinePass は**深度＋マスクの +2**（`:331-351`）、TAARenderPass／SSAARenderPass は **2^sampleLevel 回**（SSAA の既定 `sampleLevel=4` → 16 回: `SSAARenderPass.js:61`）。
- `UnrealBloomPass(resolution, strength=1, radius, threshold)`: **radius／threshold に既定値が無い**（`UnrealBloomPass.js:46`, `63`, `70`）。内部は半解像度＋5 mip の HalfFloat RT、`needsSwap=false`、加算ブレンドで入力に足す（`:94-129`, `:186-195`）。`resolution` の既定は 256×256 だが `addPass` の `setSize` で上書きされる。
- `OutputPass`: `renderer.toneMapping`／`outputColorSpace` から define を作り、トーンマップ＋sRGB 変換を行う（`OutputPass.js:90-131`）。**composer では最後に置く。内蔵経路 (B) では不要**。
- **`scene.overrideMaterial` の挙動**: render list の分類（opaque／transparent／transmissive）は**元のマテリアル**で行われ（`WebGLRenderLists.js:122-144`）、描画だけ override に差し替わる（`WebGLRenderer.js:2128-2149`、`allowOverride=false` の材は除外: `Material.js:433-439`）。override 中は**透過パスはスキップ**される（`WebGLRenderer.js:2002-2010`）。`object.onBeforeRender` は override 中も呼ばれる（`:2158`）→ **Reflector／Water が G-buffer パスでも鏡面の入れ子描画を再発火する**（§3-4）。
- 影マップの更新条件: `autoUpdate===false && needsUpdate===false` なら何もしない（`WebGLShadowMap.js:92-97`）、描画後に `needsUpdate=false`（`:376`）。`scene.overrideMaterial` の有無は見ないので、**AO／Bokeh の再描画ごとに影も描き直される** [H]。`Reflector`／`Water`／`Refractor` は自分の入れ子描画の間だけ `autoUpdate=false` にしている（`Reflector.js:223-236`, `Water.js:318-335`, `Refractor.js:236-246`）。
- スケルトンの再更新: `skeleton.update()` は `info.render.frame` が変わるたびに 1 回（`WebGLObjects.js:50-54`）。`frame` は `render()` ごとに +1 で、しかも**メイン描画の `projectObject` の後・影パスの前**に増える（`WebGLRenderer.js:1709`, `1729`, `1737`）ため、素の描画でも「影パスで更新」になる。composer で `render()` が増えるほど 1 フレーム内の更新が増える（1→2→3→5）[H]。コスト自体は骨数×行列 1 個ずつ＋ボーンテクスチャ再アップロード。

### 2.7 フォグ（`Fog`／`FogExp2`）と `ShaderChunk` 差し替え

| 項目 | 内容 | 根拠 | 種別 |
|---|---|---|---|
| 標準式 | `FOG_EXP2`: `1 − exp(−density²·depth²)`（**距離の二乗**）、それ以外 `smoothstep(near, far, depth)`。`mix(gl_FragColor.rgb, fogColor, fogFactor)`。色は vec3 1 つ、密度はスカラー | `ShaderChunk/fog_fragment.glsl.js:1-17`, `fog_pars_fragment.glsl.js:1-18` | S |
| 深度の定義 | `vFogDepth = −mvPosition.z`（**平面深度**、放射距離ではない） | `fog_vertex.glsl.js:4` | S |
| uniform の更新 | `fog.color`（出力色空間で）、`near/far` か `density` だけ。**他のプロパティは渡らない**（vec3 係数を足したいなら共有 uniform を自前で） | `WebGLMaterials.js:25-40` | S |
| 適用順 | `tonemapping_fragment` → `colorspace_fragment` → **`fog_fragment`**（physical／basic／points／sprite いずれも）。つまり canvas 直描きでは**トーンマップ後・sRGB エンコード後の値に混ぜる** | `ShaderLib/meshphysical.glsl.js:221-225`, `meshbasic.glsl.js:109-113`, `points.glsl.js:81-84`, `sprite.glsl.js:74-76` | S |
| 空間による見た目差 | canvas 直描き: 混合は **sRGB 空間**（d=6 m: 実画素 (161,169,147) = sRGB 混合の解析解。線形混合なら (195,175,147)）。RT（composer／内蔵経路）に描くとき: **線形空間**（RT の `outputColorSpace` は作業色空間: `WebGLPrograms.js:213`、トーンマップは RT では掛からない: `:177-183`）で、線形混合の解析解と 4 桁一致 → **composer を入れるとフォグの見た目が変わる** | `x4_fog.html`（F0, F0c） | H |
| `FOG_EXP2`／`USE_FOG` の定義 | `material.fog===true && scene.fog` のとき `#define USE_FOG`、`FogExp2` のとき `#define FOG_EXP2`。プログラムキーには `fog`・`useFog`・`fogExp2` が入る | `WebGLPrograms.js:316-317`, `472`, `555`; `WebGLProgram.js:491-492`, `683-684` | S |
| チャンクの置換 | `ShaderChunk` は可変の素のオブジェクトなので代入で差し替えられる（`ShaderChunk.js:128`）。**ただしプログラムキャッシュキーにチャンクの中身は入らない**。同じ材質構成で一度コンパイルされていると、後から差し替えても無視される（同じキーで d=6 m の画素が標準のまま、プログラム数の増分 0）。別キー（`customProgramCacheKey` を変える）の材だけ新チャンクを拾う | `x4_fog.html`（F1a, F1b） | H |
| チャンク置換版の画素 | 密度スカラーを共通スケールに、`WATER_ABSORB` の vec3 比を `#define`（定数）にして `exp(−fogDensity·ABSORB·depth)`: 解析解（**sRGB 空間で混合した場合**）と完全一致。線形の理想解とは最大 44 階調ずれる（d=12 m の R: 87 対 131） | `x4_fog.html`（F1b） | H |
| 放射距離を per-vertex の `float` varying で渡すと壊れる | 大きな三角形で `length(mvPosition.xyz)` を頂点で補間すると中央が誤る（1000×1000 の板で d=6 m の画素が (39,118,144) = ほぼ全面フォグ）。ビュー空間位置の vec3 varying なら厳密 | `x4_fog.html`（F2b vs F2） | H |
| 平面深度と放射距離 | 広角（FOV 50°）の隅 (4,4) 画素、平面深度 10 に対し放射 12.43: 標準フォグは平面深度の解析解 (87,138,145) と一致、放射なら (61,127,145) | `x4_fog.html`（F0_stock_corner） | H |
| `Water.js` | `fog` オプション（既定 false）。`fog_pars_fragment`／`fog_fragment` を include（`Water.js:68`, `175`, `209`, `221`）→ チャンク置換版は効く | `Water.js` | S |

### 2.8 `Reflector`／`Refractor`／`Water`／`Water2`（`jsm/objects/`）

| 項目 | 内容 | 根拠 | 種別 |
|---|---|---|---|
| 仕組み | `onBeforeRender` の中で鏡面（反射）カメラを作り、斜め近平面クリップ（Lengyel）で面の裏側を切り、`renderer.render(scene, camera)` を**入れ子で**呼んで RT に描く。自身は `visible=false` にして描画 | `Reflector.js:116-253`（`217-251`） | S |
| RT | `WebGLRenderTarget(textureWidth, textureHeight, { samples: multisample, type: HalfFloatType })`、既定 512×512、`multisample=4`。`Water.js` は MSAA 無し（`:88`）。`Water2` は Reflector＋Refractor の 2 枚 | `Reflector.js:79-83`, `101`; `Water.js:55-56`, `88`; `Refractor.js:71-75`, `90`; `Water2.js:95-101` | S |
| 影 | 入れ子描画の間は `renderer.shadowMap.autoUpdate=false`（影を再計算しない） | `Reflector.js:223-236`; `Water.js:318-335`; `Refractor.js:236-246` | S/H（shadowRuns=0） |
| 面の裏側から | `Reflector`: `view.dot(normal) > 0`（カメラが背後）なら **何もしない**（`forceUpdate=true` で強制）。`Water`: 同条件で return。`Refractor`: `visible()` が偽なら描かない。実測: カメラ y=−3（面は +Y 向き）→ `renderer.render` 1 回のみ。メッシュを反転（`rotation.x=+π/2`）すると鏡面 RT が描かれた（入れ子 1 回、RT の draw 4） | `Reflector.js:130-133`; `Water.js:252`; `Refractor.js:108-133`; `x6_water.html` | S/H |
| 追加描画回数（カメラが水面の上） | Reflector／Water: +1。Water2／Refractor は +1〜2（Water2 は鏡面＋屈折で入れ子 2） | `x6_water.html` | H |
| 正射影 | `Reflector` は正射影カメラに対応（`:179-215`）、`Water.js` は透視のみ | `Reflector.js`, `Water.js:297-309` | S |
| WebGPU 用 | `WaterMesh.js`／`Water2Mesh.js` は別物（TSL）。WebGLRenderer では `Water.js`／`Water2.js` | `jsm/objects/` の一覧 | S |
| スネルの窓・全反射 | **どのアドオンにも無い**（水中から見上げる表現は自作）。反転した `Reflector` は「水中側の像を水面に映す」ことまではできる | grep（"snell" 等）なし／`x6_water.html` | S/H |

### 2.9 コースティクスに使える機構

| 機構 | 結果 | 根拠 | 種別 |
|---|---|---|---|
| `SpotLight.map`（投影テクスチャ） | `light.map` があれば `spotLightMap` に積まれ、**`castShadow` に依らず**有効（`castShadow` は「影付きのスポットのうちマップ付きの数」にしか効かない）。ソート順は [影＋マップ, 影, マップのみ, なし] | `WebGLLights.js:155`, `375-388`; `lights_fragment_begin.glsl.js:125-139`; `SpotLight.js:105-116`（JSDoc は「castShadow=false だと無効」と書くが**実装と食い違う**） | S/H（縞 7 本、無マップは 0） |
| サンプリング | `texture2D(spotLightMap[i], spotLightCoord.xy)`（`spotLightCoord = vSpotLightCoord.xyz / w`、`vSpotLightCoord = spotLightMatrix * worldPos`）。`directLight.color *= spotColor.rgb`（**alpha は使わない**）。範囲外（`abs(coord*2−1) < 1` でない）は無効 | `lights_fragment_begin.glsl.js:134-139`; `shadowmap_vertex.glsl.js:77` | S/H |
| `texture.offset/repeat/rotation/center` | **無効**（uv 変換を通らない）。同一画素を確認 | 同上 | H |
| 円錐 | 光の円錐の外は光が無い。マップは shadow カメラの正方形に貼られる | `SpotLightShadow` | S/H（円錐内 55〜193 px） |
| 疑似平行光 | `position.y=300, angle=0.025, decay=0, shadow.camera.near=10/far=400`: 深度差 6 m の縞ピッチ比 1.022（点光源の理論値 306/300=1.020）。同条件で 12 m に近づけると 1.50（理論値 1.50）。`decay=0` で距離減衰なし（`getDistanceAttenuation` が `pow(d,0)=1`） | `lights_pars_begin.glsl.js:56-71`; `x5_caustics.html` | S/H |
| RT をマップに | `WebGLRenderTarget.texture`（HalfFloat、Repeat）を `light.map` に渡し、毎フレームフルスクリーン pass で描き換え → 縞が動く（フレーム間で 93〜109 画素が変化） | `x5_caustics.html`（`rtMap_animated`） | H |
| `DirectionalLight` | `map` プロパティ無し（`DirectionalLight.js`） | grep | S |
| 平面投影の `onBeforeCompile` | §1.4。円錐制限なし、任意の太陽方向、影の有無に依らない | `x5_caustics.html`（`planarCaustics`） | H |
| ゴッドレイ | WebGL 用の既製品なし（`GodraysNode` は TSL/WebGPU）。r14 F-08 のとおり | r14 | — |

### 2.10 ヘッドレス環境の実測値（`render_test.html`、800×600、antialias=true）

| 項目 | 値 |
|---|---|
| ブラウザ | Chromium 141.0.7390.37（`/opt/pw-browsers/chromium` → `chromium-1194/chrome-linux/chrome`）、`HeadlessChrome/141` |
| `VERSION` / GLSL | `WebGL 2.0 (OpenGL ES 3.0 Chromium)` / `WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)` |
| `RENDERER` | `WebKit WebGL`（マスク値）。`UNMASKED_RENDERER_WEBGL` = **`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`**、`UNMASKED_VENDOR` = `Google Inc. (Google)` |
| `MAX_TEXTURE_SIZE` | **8192**（実 GPU は 16384 が多い。8k テクスチャは載らない）。`MAX_CUBE_MAP_TEXTURE_SIZE` 16384、`MAX_3D_TEXTURE_SIZE` 2048、`MAX_ARRAY_TEXTURE_LAYERS` 2048 |
| `MAX_VERTEX_TEXTURE_IMAGE_UNITS` | **32**（ボーンテクスチャは頂点シェーダで読むので必須。実機は 16〜32）。`MAX_TEXTURE_IMAGE_UNITS` 32、`MAX_COMBINED_TEXTURE_IMAGE_UNITS` 64 |
| その他の上限 | `MAX_VERTEX_ATTRIBS` 16、`MAX_VERTEX_UNIFORM_VECTORS` 4096、`MAX_FRAGMENT_UNIFORM_VECTORS` 4096、`MAX_VARYING_VECTORS` 31、`MAX_SAMPLES` **4**、`MAX_DRAW_BUFFERS` 6、`MAX_UNIFORM_BLOCK_SIZE` 65536、線幅 [1,1]、three の `capabilities.precision`=`highp` |
| float／half float | `EXT_color_buffer_float` ✓、`EXT_color_buffer_half_float` ✓、`EXT_float_blend` ✓、`OES_texture_float_linear` ✓。**RGBA16F／RGBA32F の RT に描いて読み戻すと (0.25, 2.5, 0.5, 1) がそのまま戻る**（1 を超える値を保持）。ボーンテクスチャは `FloatType`（3 骨で 4×4）。`OES_texture_half_float_linear` は false だが WebGL2 では half float の線形フィルタは標準機能で、RT／bloom は動作する |
| その他の拡張 | `WEBGL_multi_draw` ✓（BatchedMesh）、`EXT_disjoint_timer_query_webgl2` ✓（値が返る）、`EXT_texture_filter_anisotropic` ✓、`EXT_clip_control` ✓（`reversedDepthBuffer:true` で描画成功、`capabilities.reversedDepthBuffer=true`）、`OVR_multiview2` ✓、S3TC／ETC／ETC1／ASTC／BPTC／RGTC ✓、`KHR_parallel_shader_compile` ✗、`WEBGL_provoking_vertex` ✗ |
| 描画 | 球（`MeshPhysicalMaterial`：iridescence=1・iridescenceIOR=1.3・thickness [100,400]・clearcoat=1）と 3 ボーンの `SkinnedMesh`（曲げ 0.55／−0.9 rad）、影付き平行光、`RoomEnvironment` の PMREM。画像は正常（`shot.png`）。**iridescence の有無で球の 1,939 画素が最大 36 階調、clearcoat で 3,034 画素が最大 64 階調変わる**（A/B 比較）→ シェーダ経路が実際に効いている |
| 時間 | **初回フレーム 2.4〜3.0 s**（シェーダコンパイル＋PMREM 含む）。定常 **98〜126 ms**／フレーム（800×600・MSAA4・影付き・calls=5・15,586 三角形・13 プログラム）。GPU タイマーの値は 98〜142 ms（CPU ラスタ時間） |
| 決定性 | 同じ `render_test.html` を 3 回実行したスクリーンショットの md5 が一致（`56cb3f6f…`）。最小ページ（付録）を別ディレクトリで一から再構築した場合も md5 一致（`a6de69ba…`） |

---

## 3. 落とし穴

1. **`renderer.info` は最後の `render()` 呼び出しの分しか残らない**（`WebGLRenderer.js:1731`）。EffectComposer／`setEffects`／Reflector・Water を使うと、フレーム後の `calls` は 1 になる（実測: 合計 64 なのに 1）。`info.autoReset=false`＋フレーム先頭で `reset()`。`frame` は `render()` ごとに増える。[S][H]
2. **GTAO／SSAO／SAO／SSR／Bokeh／Outline は全シーンを再描画し、`shadowMap.autoUpdate=true` なら影マップも毎回描き直す**（`WebGLShadowMap.js:92-97` は `overrideMaterial` を見ない）。GTAO だけで draw call 15→30、GTAO＋Bokeh 構成は影 3 回。`autoUpdate=false`＋フレーム先頭の `needsUpdate=true` で 1 回にできる（再描画パスは 15→8 calls、三角形 20,034→10,018）。[H]
3. **`skeleton.update()` は `render()` が増えるほど 1 フレーム内で増える**（素: 1、Render+Output: 2、GTAO: 3、GTAO+Bloom+Bokeh: 5）。骨 24×数百匹だと無視できない。LOD で見えないレベルは更新されない（§2.2）が、複数 `render()` の影響は LOD では減らない。[H]
4. **G-buffer／深度パスにも `onBeforeRender` を持つ水面が入る**（`WebGLRenderer.js:2158`）。Reflector を含むシーンの GTAO で入れ子描画が 2 回（メイン＋G-buffer）。G-buffer 側は**水面を別レイヤーにして、AO 用の別カメラ（`layers=0` のみ、メインカメラの位置・向き・投影を毎フレーム複製）**を渡すと 1 回になる（`renderer.render` 9→8、入れ子 2→1）。また**半透明（鰭・粒子）は render list の分類は元マテリアルのまま、描画は不透明の override になる**ので G-buffer に実体として書かれる [S]。`Points`／`Line` だけは自動で隠れる（`GTAOPass.js:651-665`）。[H][S]
5. **EffectComposer の既定 RT には MSAA が無い**（`EffectComposer.js:69`）。`new WebGLRenderer({antialias:true})` は composer 経由の描画に効かない。`samples:4` の RT を渡すか、内蔵経路 (B) を使う。[S][H]
6. **`InstancedMesh`／`BatchedMesh`／`SkinnedMesh` の `boundingSphere` は最初に使われた時の 1 回だけ**（個体を動かすと誤カリング、実測 calls=0）。`SkinnedMesh.computeBoundingSphere()` はフレームごとに呼べる重さではない（51k 頂点で 22 ms）。手動の保守的な球を 1 度設定する。InstancedMesh は**個体単位のカリングが無い**ので、視野外の個体も全部描く（80,000 三角形のまま）。[H]
7. **`LOD` の状態は `.visible` に載っている**。(a) 最初の `update()` までは全レベルが可視、(b) **別カメラの `render()`（鏡面・Reflector・Water・composer の別カメラ）が走ると、そのカメラの選択で `.visible` と `getCurrentLevel()` が上書きされる**（実測: 主カメラは L0 で描画 = 画素は赤、フレーム後の `getCurrentLevel()`=1・旗 `01`）。主フレームの描画自体は影響を受けない（render list は構築済み）が、ゲームロジックで `getCurrentLevel()` を読むと鏡面カメラの値になる。距離は自前で測るか、`autoUpdate=false` にして描画後に手動 `lod.update(mainCamera)`。(c) `hysteresis` は `.visible` と結合しているので、自分で `.visible` を触ると壊れる。[H][S]
8. **LOD の最遠レベルを別プログラム（非スキン・別マテリアル）にすると、初回切替でコンパイル（＋初回描画）が起きる**。`renderer.compile()` はプログラムを前倒しで作る（切替時のプログラム数増分が 0）が、**SwiftShader では初回描画の遅れ（72〜99 ms）は残った**。確実なのは「実キャンバスで全レベルを可視にして 1 回描く」。**レンダーターゲットへのウォームアップは無意味**（`outputColorSpace`・`toneMapping` がキーに入り別プログラムになる: `WebGLPrograms.js:177-183`, `213`）。同様に、フォグ・ライト数・影の有無が本番と違うウォームアップも別プログラム。[H][S]
9. **`ShaderChunk` の差し替えは「最初のコンパイルより前に 1 回だけ」**。キャッシュキーにチャンクの中身が入らないので、既存プログラムには効かない（`customProgramCacheKey` を変えた材だけ拾う）。しかも**グローバル**（全マテリアルに影響）。フォグを可変にしたい場合や一部の材だけ変えたい場合は `onBeforeCompile`＋共有 uniform（§1.3）。[H]
10. **標準フォグは「距離の二乗・平面深度・色空間依存」**: `exp(−(ρ·depth)²)`、`depth=−mvPosition.z`、canvas 直描きは sRGB 空間で混合・RT は線形空間で混合。**composer を入れるとフォグの見た目が変わる**。Beer–Lambert にしたいなら線形・放射距離・指数 1 次の自前実装。[S][H]
11. **放射距離を頂点で `length()` して `float` の varying で渡してはいけない**（大きな三角形で壊れる、実測：床の板で全面フォグ）。ビュー空間位置を `vec3` varying で渡し fragment で `length()`。[H]
12. **`SpotLight.map` の JSDoc は古い**（「castShadow=false だと無効」は誤り。r186 の実装では無影でも効く）。`texture.offset/repeat/rotation` は効かない、alpha は無視、円錐の外は無効。アニメさせるには RT を使うか、CanvasTexture／DataTexture の再アップロード（CPU→GPU）になる。[S][H]
13. **`Reflector`／`Water`／`Refractor` はカメラが面の裏側だと何もしない**（`Reflector.js:130-133`, `Water.js:252`, `Refractor.js:108-133`）。水中から水面を見上げる像を作るなら、メッシュを反転して置く（`rotation.x=+π/2` で鏡面 RT が描かれた）。スネルの窓の外側の全反射・窓の内側の屈折は自作。[S][H]
14. **Water 系の RT は HalfFloat（＋Reflector／Refractor は MSAA4）**で、シーンの再描画を伴う。Water2 は鏡面＋屈折の 2 回。`textureWidth/Height` 既定 512。水面の LOD（遠いほど RT を小さく／更新を間引く）は自前。[S][H]
15. **ヘッドレス環境は実機より「緩い」項目と「厳しい」項目がある**: `MAX_TEXTURE_SIZE` は 8192（実機 16384 より小）、`MAX_TEXTURE_IMAGE_UNITS`／`MAX_VERTEX_TEXTURE_IMAGE_UNITS` は 32（実機 16 のものもある → 影・環境・ボーン・モーフを同時に使う材が実機で超過しうる）、`MAX_VARYING_VECTORS` 31。時間は CPU ラスタで、初回 2.4〜3 s、定常 100 ms 級。**時間のしきい値でテストを落とさない**（同一マシンで 2 倍ぶれる）。[H]
16. **`file://` は不可**: ES module が CORS で読めない（`Access to script at 'file:///…' … has been blocked by CORS policy`、`--allow-file-access-from-files` を付けると読める）。ローカル HTTP サーバを立てる。[H]
17. **`readPixels`／`toDataURL` は `render()` と同じ JS タスク内で**（`preserveDrawingBuffer:false` の既定では、合成後は内容が無効になりうる）。`await` を挟むなら `preserveDrawingBuffer:true` か、`readRenderTargetPixels`。`page.screenshot()` は合成後の画面を撮るので問題ない。[H]
18. **BatchedMesh は描画ごと・影パスごとに O(個体数) の CPU 処理**（20,000 個体で約 4〜5 ms）。後処理の override パスにも毎回かかる。`sortObjects=false`／`perObjectFrustumCulled=false` で減る（0.2 ms まで）が、前者は透明物の順序、後者は視野外描画を失う。[H]
19. **`UnrealBloomPass` の `radius`／`threshold` には既定値が無い**（`UnrealBloomPass.js:46`）。省略すると undefined が uniform に入る。[S]
20. **EffectComposer／内蔵経路での `renderer.toneMapping`**: RT に描くとき材のシェーダには**トーンマップが掛からない**（`WebGLPrograms.js:177-183`）。最後の `OutputPass`（または内蔵出力）で 1 回だけ掛かる。自前のフォグを `tonemapping_fragment` の前に入れたのは、この両経路（canvas 直描き／RT）で同じ結果になるようにするため。[S][H]

---

## 4. 未確認／要追加検証

- **実 GPU の性能**（統合 GPU・モバイル含む）。本書の ms はすべて SwiftShader の CPU ラスタ時間。LOD 距離・AO の可否・Bokeh の可否の「ms の閾値」は決められない。実機で `renderer.info` の calls／三角形と GPU タイマーを取り直すこと。
- `EXT_disjoint_timer_query_webgl2` の**実ブラウザでの可用性**（セキュリティ上の制限で無効なことがある）。ヘッドレスでは使えた。
- **GTAO × 水中フォグ**の相互作用: G-buffer パスにはフォグが無く、AO は乗算で合成されるため、遠景（フォグ色に近い像）が暗く沈む可能性がある。未実測（[R]）。
- **水中から水面を見上げる像**（スネルの窓＋全反射）の実装。`Reflector` の反転は動作確認のみで、見た目の検証・窓の屈折像は未実装。
- **コースティクスの影（魚影・岩影による遮蔽）**と太陽方向の扱い（`directLight` に掛ける実装）。`SpotLight.map` 方式の影付きは、影マップ 1 枚＋スポット 1 灯の制約内で動作確認のみ。平面投影版の法線項は検証版で固定値。
- **LOD レベル間のポップ**の緩和（クロスフェード、ディザ、`alphaHash`）。`THREE.LOD` は即時切替のみ。
- **影専用の低ポリ LOD**（`customDepthMaterial`・`castShadow` をレベルごとに切替）。ソースの読み（隠れたレベルは影を描かない）のみ。
- 数千匹規模の **InstancedMesh＋`morphTexture`** や、InstancedMesh へのカスタム・スキニングの実描画・実機性能（B の設計案と同じく未検証）。
- `BatchedMesh` の `setGeometryIdAt` を魚の遠景 LOD（剛体の焼き込みポーズ）に使った場合の見た目と、ポーズ更新方法（ジオメトリ再書き込みは `setGeometryAt` が重い可能性）。
- VRAM の実測（ボーン／モーフテクスチャ、PMREM、RT 群）。`info.memory` は件数のみ。
- `headless_shell`（`chromium_headless_shell-1194`）で WebGL2 が使えることは確認したが、描画の画素一致までは未比較。
- WebGPU／TSL 経路（`SunLight`、`GodraysNode` など）は対象外。
- `KHR_parallel_shader_compile` が無い環境で `compileAsync` が実質同期になる影響（SwiftShader では 10 ms 待ちに退化）。実機（拡張あり）の挙動は未確認。

---

## 5. 実行したコマンドと結果（再現できる形）

### 5.1 環境

- Linux 6.18、4 コア・16 GB、`node v22.22.0`、`npm 10.9.4`、`playwright-core 1.63.0`、Chromium **141.0.7390.37**（`/opt/pw-browsers/chromium-1194`、`/opt/pw-browsers/chromium` はそのシンボリックリンク）、three@0.186.1（`npm pack three@0.186.1`）。
- npm レジストリには到達可能（`playwright-core` と `three` の取得に使用）。ブラウザのダウンロードは不要（`executablePath` を指定する）。

### 5.2 最小手順（新規ディレクトリで通った。セットアップ約 4 秒、描画約 8 秒）

```bash
mkdir -p headless_test && cd headless_test
npm init -y >/dev/null && npm i playwright-core@1.63.0
npm pack three@0.186.1 && mkdir -p three && tar xzf three-0.186.1.tgz -C three      # → three/package/{build,examples/jsm,src}
# 下の 5.3 を min_run.mjs、5.4 を min_page.html として保存
THREE_ROOT=$PWD/three/package node min_run.mjs min_page.html shot.png
```

### 5.3 `min_run.mjs`（HTTP サーバ＋playwright-core＋スクリーンショット。22 行）

```js
// node min_run.mjs <page.html> [shot.png]   -- page must set window.__result and window.__done = true
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const THREE_ROOT = process.env.THREE_ROOT;           // unpacked three@0.186.1 "package" dir (has build/ and examples/jsm/)
const PAGE = path.resolve(process.argv[2]), SHOT = process.argv[3];
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = u.startsWith('/three/') ? path.join(THREE_ROOT, u.slice(7)) : path.join(path.dirname(PAGE), u.slice(1));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })).newPage();
page.on('console', m => console.log(`[${m.type()}] ${m.text()}`)); page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/${path.basename(PAGE)}`);
await page.waitForFunction('window.__done === true', null, { timeout: 120000 });
console.log(JSON.stringify(await page.evaluate(() => window.__result), null, 1));
if (SHOT) await page.screenshot({ path: SHOT });
await browser.close(); server.close();
```

### 5.4 `min_page.html`（物理マテリアルの球＋3 ボーンのスキンメッシュ＋影＋PMREM。34 行）

```html
<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const W = 800, H = 600, R = {};
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; document.body.appendChild(renderer.domElement);
const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
R.gl = { webgl2: renderer.capabilities.isWebGL2, renderer: dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL), MAX_TEXTURE_SIZE: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS), EXT_color_buffer_float: !!gl.getExtension('EXT_color_buffer_float'), OES_texture_float_linear: !!gl.getExtension('OES_texture_float_linear') };
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b2a3a);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 50); camera.position.set(0, 0.6, 8.2); camera.lookAt(0, 0.2, 0);
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 5, 4); sun.castShadow = true; scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x335544, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.4; floor.receiveShadow = true; scene.add(floor);
const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), new THREE.MeshPhysicalMaterial({ color: 0x8899aa, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 400] }));
sphere.position.set(-1.9, 0.3, 0); sphere.castShadow = true; scene.add(sphere);
const bones = [0, 1, 2].map(() => new THREE.Bone()); bones[0].position.y = -1.2; bones[1].position.y = 1.2; bones[2].position.y = 1.2; bones[0].add(bones[1]); bones[1].add(bones[2]);
const geo = new THREE.CylinderGeometry(0.35, 0.35, 3.6, 24, 36), p = geo.attributes.position, si = [], sw = [];
for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 1.8; let w0 = 0, w1 = 0, w2 = 0;
  if (y < 0.6) w0 = 1; else if (y < 1.8) { const t = (y - 0.6) / 1.2; w0 = 1 - t; w1 = t; } else if (y < 3.0) { const t = (y - 1.8) / 1.2; w1 = 1 - t; w2 = t; } else w2 = 1; si.push(0, 1, 2, 0); sw.push(w0, w1, w2, 0); }
geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
const skinned = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.45 })); skinned.add(bones[0]); skinned.bind(new THREE.Skeleton(bones));
skinned.position.set(1.9, 0, 0); skinned.castShadow = true; scene.add(skinned); bones[1].rotation.z = 0.55; bones[2].rotation.z = -0.9;
const px = new Uint8Array(4), sync = () => gl.readPixels(W >> 1, H >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // 1-px readback = wait for the GPU
let t = performance.now(); renderer.render(scene, camera); sync(); R.firstFrameMs = Math.round(performance.now() - t);   // includes shader compile
const ts = []; for (let i = 0; i < 20; i++) { const a = performance.now(); renderer.render(scene, camera); sync(); ts.push(performance.now() - a); }
ts.sort((a, b) => a - b); R.steadyMedianMs = Math.round(ts[10]);
R.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length };   // calls include the shadow pass
const cream = new Uint8Array(4 * (W / 2) * H); gl.readPixels(W / 2, 0, W / 2, H, gl.RGBA, gl.UNSIGNED_BYTE, cream); let n = 0;                  // read in the SAME task as render()
for (let i = 0; i < cream.length; i += 4) if (cream[i] > 150 && cream[i] > cream[i + 2] + 40) n++; R.skinnedPixels = n; R.glError = gl.getError();
window.__result = R; window.__done = true;
</script>
```

実行結果（5.2 のコマンド）:

```
gl: webgl2=true, renderer="ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    MAX_TEXTURE_SIZE=8192, MAX_VERTEX_TEXTURE_IMAGE_UNITS=32, EXT_color_buffer_float=true, OES_texture_float_linear=true
firstFrameMs ≈ 2900 (2400〜3100)   steadyMedianMs ≈ 105 (98〜126)   info = {calls:5, triangles:15586, programs:13}
skinnedPixels = 21011   glError = 0   → shot.png (md5 a6de69ba1ecd578cfb91f74bb25857cc)
```

### 5.5 起動フラグの実測（`probe2.mjs`、すべて WebGL2＝SwiftShader）

| 起動条件 | 結果 |
|---|---|
| フルChromium、追加フラグなし | WebGL2 ✓、`ANGLE (… SwiftShader …)` |
| フルChromium、`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`（**本書の標準**） | 同上 |
| `chromium_headless_shell-1194/chrome-linux/headless_shell`、追加フラグなし | 同上 |
| フルChromium、`--disable-gpu` | 同上（WebGL は無効にならずソフトウェアに落ちる） |
| フルChromium、`--disable-gpu` ＋ SwiftShader フラグ | 同上 |
| フルChromium、`--use-angle=swiftshader` のみ | 同上 |

- Playwright 1.63 は既定で `--enable-unsafe-swiftshader`、`--headless`、`--no-sandbox`、`--disable-dev-shm-usage`、`--ozone-platform=headless` 等を付ける（`playwright-core/lib/coreBundle.js:43337-43339`、実プロセスの `ps` でも確認）。**フラグは必須ではない**が、ソフトウェア経路を明示して挙動を固定するため標準として付ける。
- `file://` 読み込み: フラグ無し → CORS で失敗（`Access to script at 'file:///…three.module.js' … blocked by CORS`）、`--allow-file-access-from-files` → 成功（`file_test.mjs`）。**HTTP サーバを使う**。
- 決定性: `render_test.html` のスクリーンショットを 3 回連続で撮り md5 一致（`56cb3f6f5acdca01ed10ab9a8d57e1cf`）、PIL 差分 bbox = None。

### 5.6 実験ページ一覧と主な結果（付録 A に全文）

| ファイル | 内容 | 主な結果（§） |
|---|---|---|
| `render_test.html` | 5.4 の拡張版。GL 上限・拡張一覧、float RT、iridescence／clearcoat の A/B 画素差、GPU タイマークエリ | §2.10 |
| `x1_lod.html` | LOD の API 挙動（hysteresis・zoom・autoUpdate・複数カメラ）、SkinnedMesh レベルの skeleton 更新、切替ヒッチ（3 種のウォームアップ） | §2.1, §2.2 |
| `x2_instancing.html` | InstancedMesh のカリング・stale 球、BatchedMesh の個体カリング・LOD・CPU コスト | §2.3 |
| `x3_post.html?mode=composer\|effects` | EffectComposer 7 構成の render 回数・影・skeleton・info、`setEffects` 経路 | §2.5, §2.6 |
| `x4_fog.html` | 標準フォグ・チャンク置換・`onBeforeCompile` 版の画素検証、RT 内のフォグ空間、per-vertex 放射距離の失敗例 | §1.3, §2.7 |
| `x5_caustics.html` | `SpotLight.map` の各挙動、RT マップ、疑似平行光、平面投影版 | §1.4, §2.9 |
| `x6_water.html` | Reflector／Water／Water2／Refractor の描画回数、裏面、LOD との相互作用 | §2.8 |
| `x7_misc.html` | SkinnedMesh の誤カリングと球の再計算コスト、G-buffer×Reflector×レイヤー別カメラ、`reversedDepthBuffer`、共有スケルトン LOD の一致 | §2.4, §2.6 |
| `run.mjs`, `run_all.sh` | 汎用ランナー（`--shot`、`--size`、`--timeout`、クエリ付きページ可）、全実験の一括実行（約 55 秒） | — |

- 作業ディレクトリ: `/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/headless_test/`（セッション固有で消える可能性がある。**付録 A に全文を載せた**）。出力は `results/*.out`、スクリーンショットは `results/*.png`（`shot.png`, `x3_composer.png`, `x3_effects.png`, `x5_caustics.png`）。
- 再実行: 付録 A のファイルを `headless_test/` と `headless_test/pages/` に置き、`npm i playwright-core@1.63.0`、`THREE_ROOT`（`run.mjs` 冒頭の既定値を変えるか環境変数 `THREE_ROOT`）を設定して `./run_all.sh`。

### 5.7 本書の数値の取り方（再現時の注意）

- 画素の読み戻しは `render()` と同じタスクで行う（§3-17）。
- ms を比較するときは同一実行内の相対値を使う（§冒頭の注意）。
- 整数カウント（render 回数、影マップ描画回数、skeleton 更新回数、draw call、三角形数、プログラム数）は実行間で完全に再現する。

---

## 付録 A: テストスクリプト全文

（以下、実行に使ったファイルをそのまま掲載する）
