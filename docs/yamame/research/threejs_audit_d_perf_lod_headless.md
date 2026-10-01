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
| 3 | **初回切替のヒッチ対策は「実キャンバスへ全レベル可視で 1 回描画」**（`autoUpdate=false` にして全 `visible=true`、描画後に戻す）。`renderer.compile()` だけでは初回描画の遅れが消えず、レンダーターゲットへのウォームアップは別プログラムを作るだけで無効 | 初回切替フレーム: 何もしない 85〜157 ms、`compile()` 後 72〜102 ms、実キャンバスへ全レベル描画後 2〜14 ms（定常 2〜9 ms）[H] | §2.2, §3-8 |
| 4 | **群れ（数百〜数千）は `THREE.LOD` を個体ごとに使わず**、距離バケット（tier）ごとに `InstancedMesh` を持ち毎フレーム行列を詰め直す（`mesh.count` を縮める）か、`BatchedMesh.setGeometryIdAt` で個体ごとにジオメトリを切り替える。ただし **BatchedMesh はスキニングもモーフも不可**、InstancedMesh はスキニング不可（モーフは `morphTexture` のみ）。**どちらも個体単位の LOD／カリングは自前** | `BatchedMesh.js` に skin／morph の文字列が 0 件、`WebGLPrograms.js:330` で skinning は `object.isSkinnedMesh` のみ [S]。InstancedMesh は 80,000 三角形全部を描く（視錐台外の個体も）[H] | §2.3 |
| 5 | **`SkinnedMesh`／`InstancedMesh` の `boundingSphere` は初回 1 回しか計算されない**。個体が動く系では **保守的な球を手動で 1 度だけ設定**し、毎フレームの `computeBoundingSphere()` は使わない（1.8k 頂点で 1.2 ms、51k 頂点で 22 ms）。動かさないなら `frustumCulled=false` も可 | root ボーンを 20 動かすと、視野内の体が丸ごと消えた [H] | §2.4 |
| 6 | **後処理は「必要最小限」**: 既定は `outputBufferType: HalfFloatType` + `renderer.setEffects([...])`（MSAA を保ったまま HDR→トーンマップが最後）か、`EffectComposer` に **`samples: 4` 付き** HalfFloat RT を渡して `RenderPass → UnrealBloomPass(弱) → OutputPass`。**GTAO／SSAO／SAO／SSR／Bokeh／Outline はそれぞれシーン全体を 1〜2 回描き直す**（GTAO 1 つで draw call 15→30、影マップも再描画）ので、入れるなら 1 つずつ測る | EffectComposer 既定 RT は MSAA 無し。GTAO+Bloom+Bokeh で renderer.render が 22 回、影マップ 3 回、skeleton.update 5 回 [H] | §2.6 |
| 7 | **AO／DOF を使う場合の 3 点セット**: (a) `renderer.shadowMap.autoUpdate=false` にして**フレーム先頭で 1 回だけ** `needsUpdate=true`（影 3 回→1 回）、(b) 水面など `onBeforeRender` を持つ物は**別レイヤー＋AO 用の別カメラ**で G-buffer から外す（入れ子の鏡面描画 2→1）、(c) 半透明（鰭・粒子）が G-buffer に不透明として書かれる点を確認 | [H] で (a)(b) を数値確認。(c) はソースの読み（`WebGLRenderLists.js:134`, `WebGLRenderer.js:2139`）[S] | §2.6, §3-2〜4 |
| 8 | **水中フォグは `onBeforeCompile` で自前実装**: 共有 uniform（σ の RGB、水の色）＋ビュー空間位置の varying で**放射距離**を fragment で `length()` し、`#include <tonemapping_fragment>` の**前**（線形）で `c·T + L·(1−T)`, `T=exp(−σ·r)`。標準 `FogExp2` は距離の**二乗**・平面深度・（canvas 直描きでは）sRGB 空間混合で、Beer–Lambert ではない | 標準フォグ・チャンク置換・自前版の 3 方式すべてで画素値が解析解と一致 [H]（自前版は `x4_fog.html` の `patchWaterFog` と同一ロジック。§1.3 のコードはその整形版） | §1.3, §2.7 |
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

// ③ 遠いレベルが非スキンの焼き込みなら mixer を止められる（スケルトンは「見えているスキンレベルがあるとき」だけ update される: WebGLObjects.js:46-56）
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
      float ndl = 1.0;   // 検証版はこの固定値。実装では clamp( dot( normal, uSunDirView ), 0.0, 1.0 )（normal はビュー空間、uSunDirView は自前 uniform）
      outgoingLight += diffuseColor.rgb * uStrength * min( cA, cB ) * ndl;
      #include <opaque_fragment>`);
};
```

- 検証したのは上のコードの `ndl=1.0`（法線項なし）版（`x5_caustics.html`）。床／InstancedMesh（球 2）／SkinnedMesh を 1 つのマテリアルで描画し、GL エラー 0、時間を変えると画素が変わることを確認 [H]。法線項（`dot(normal, uSunDirView)`）と、影（魚影・岩影）による遮蔽（`directLight` 側へ掛ける）は未実装・未検証。
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
| 切替ヒッチ（SwiftShader） | 非スキン・別マテリアルの遠レベルへの初回切替: プログラム数 +1、初回描画 85〜157 ms（定常 2〜9 ms）。`renderer.compile()` はプログラム登録を前倒しするが（切替時の増分が 0）初回描画は 72〜102 ms のまま。**実キャンバスへの全レベル可視描画**で 2〜14 ms。RT へのウォームアップ（16×16 の RT に全レベル描画）は、ウォームアップ中にプログラムが +2 増えるのに、切替時にさらに +1 増え、初回描画は 110〜123 ms のまま | `x1_lod.html`（`lodSkin_C_*`、4 種を 3 回ずつ実行） | H |
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

**各パスの追加コスト**（SwiftShader、640×360、8 メッシュ＋スキン 1。B＝Render+Output を 1 とした相対値、3 回の実行の範囲）:

| 構成 | `renderer.render` 回数 | 影マップ描画 | `skeleton.update` | 相対時間 | 備考 |
|---|---|---|---|---|---|
| A: 素の `render()` | 1 | 1 | 1 | 0.7〜0.96 | |
| B: Render＋Output | 2 | 1 | 2 | 1.0 | 全画面 1 draw が増えるだけで `frame` が +1 → スケルトンが 2 回更新される |
| C: ＋Bloom | 15 | 1 | 2 | 1.3〜1.5 | 全画面 13 draw（5 mip の H/V ブラー＋合成）。シーン再描画なし |
| D: ＋GTAO | 7 | **2** | 3 | 2.5〜3.1 | G-buffer 用に全シーンを `MeshNormalMaterial` で再描画（15 calls／20,034 三角形） |
| E: ＋Bokeh | 4 | **2** | 3 | 1.5〜2.1 | 深度用に全シーンを `MeshDepthMaterial`（RGBA パック）で再描画 |
| F: GTAO＋Bloom＋Bokeh | 22 | **3** | 5 | 3.8〜4.1 | calls 合計 64 |
| G: F ＋ 影を 1 回に | 22 | **1** | 3 | 3.5〜4.0 | 再描画パスは 8 calls／10,018 三角形（影の draw が消える）。SwiftShader では影 2 回分の差が時間のノイズに埋もれる（CPU ラスタは影の深度描画が軽い） |

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
| 追加描画回数（カメラが水面の上） | Reflector／Water／Refractor: +1。Water2（鏡面＋屈折）: +2。入れ子の中身（RT の draw 数）はシーン次第（鏡面像に何も入らなければ 0） | `x6_water.html` | H |
| 正射影 | `Reflector` は正射影カメラに対応（`:179-215`）、`Water.js` は透視のみ | `Reflector.js`, `Water.js:297-309` | S |
| WebGPU 用 | `WaterMesh.js`／`Water2Mesh.js` は別物（TSL）。WebGLRenderer では `Water.js`／`Water2.js` | `jsm/objects/` の一覧 | S |
| スネルの窓・全反射 | **どのアドオンにも無い**（水中から見上げる表現は自作）。`src`／`jsm` を `snell`／`total internal`／`critical angle` で grep した該当は薄膜干渉の式のコメント（`iridescence_fragment.glsl.js:60`, `PhysicalLightingModel.js:238`）だけで水面とは無関係。反転した `Reflector` は「水中側の像を水面に映す」ことまではできる | grep／`x6_water.html` | S/H |

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
2. **GTAO／SSAO／SAO／SSR／Bokeh／Outline は全シーンを再描画し、`shadowMap.autoUpdate=true` なら影マップも毎回描き直す**（`WebGLShadowMap.js:92-97` は `overrideMaterial` を見ない）。GTAO だけで draw call 15→30＋全画面 5（合計 35）、GTAO＋Bloom＋Bokeh 構成は影 3 回。`autoUpdate=false`＋フレーム先頭の `needsUpdate=true` で 1 回にできる（再描画パスは 15→8 calls、三角形 20,034→10,018）。[H]
3. **`skeleton.update()` は `render()` が増えるほど 1 フレーム内で増える**（素: 1、Render+Output: 2、GTAO: 3、GTAO+Bloom+Bokeh: 5）。骨 24×数百匹だと無視できないはず（[R]、未計測）。LOD で見えないレベルは更新されない（§2.2）が、複数 `render()` の影響は LOD では減らない。[H]
4. **G-buffer／深度パスにも `onBeforeRender` を持つ水面が入る**（`WebGLRenderer.js:2158`）。Reflector を含むシーンの GTAO で入れ子描画が 2 回（メイン＋G-buffer）。G-buffer 側は**水面を別レイヤーにして、AO 用の別カメラ（`layers=0` のみ、メインカメラの位置・向き・投影を毎フレーム複製）**を渡すと 1 回になる（`renderer.render` 9→8、入れ子 2→1）。また**半透明（鰭・粒子）は render list の分類は元マテリアルのまま、描画は不透明の override になる**ので G-buffer に実体として書かれる [S]。`Points`／`Line` だけは自動で隠れる（`GTAOPass.js:651-665`）。[H][S]
5. **EffectComposer の既定 RT には MSAA が無い**（`EffectComposer.js:69`）。`new WebGLRenderer({antialias:true})` は composer 経由の描画に効かない。`samples:4` の RT を渡すか、内蔵経路 (B) を使う。[S][H]
6. **`InstancedMesh`／`BatchedMesh`／`SkinnedMesh` の `boundingSphere` は最初に使われた時の 1 回だけ**（個体を動かすと誤カリング。Instanced と Skinned は実測 calls=0、BatchedMesh は同じ `Frustum.intersectsObject` の仕組みで [S]・未実測）。`SkinnedMesh.computeBoundingSphere()` はフレームごとに呼べる重さではない（51k 頂点で 22 ms）。手動の保守的な球を 1 度設定する。InstancedMesh は**個体単位のカリングが無い**ので、視野外の個体も全部描く（80,000 三角形のまま）。[H]
7. **`LOD` の状態は `.visible` に載っている**。(a) 最初の `update()` までは全レベルが可視、(b) **別カメラの `render()`（鏡面・Reflector・Water・composer の別カメラ）が走ると、そのカメラの選択で `.visible` と `getCurrentLevel()` が上書きされる**（実測: 主カメラは L0 で描画 = 画素は赤、フレーム後の `getCurrentLevel()`=1・旗 `01`）。主フレームの描画自体は影響を受けない（render list は構築済み）が、ゲームロジックで `getCurrentLevel()` を読むと鏡面カメラの値になる。距離は自前で測るか、`autoUpdate=false` にして描画後に手動 `lod.update(mainCamera)`。(c) `hysteresis` は `.visible` と結合しているので、自分で `.visible` を触ると壊れる。[H][S]
8. **LOD の最遠レベルを別プログラム（非スキン・別マテリアル）にすると、初回切替でコンパイル（＋初回描画）が起きる**。`renderer.compile()` はプログラムを前倒しで作る（切替時のプログラム数増分が 0）が、**SwiftShader では初回描画の遅れ（72〜102 ms）は残った**。確実なのは「実キャンバスで全レベルを可視にして 1 回描く」。**レンダーターゲットへのウォームアップは無意味**（`outputColorSpace`・`toneMapping` がキーに入り別プログラムになる: `WebGLPrograms.js:177-183`, `213`。実測: 16×16 の RT に全レベルを描いても切替時にプログラムがもう 1 つ増え、初回描画は 110〜123 ms）。同様に、フォグ・ライト数・影の有無が本番と違うウォームアップも別プログラム。[H][S]
9. **`ShaderChunk` の差し替えは「最初のコンパイルより前に 1 回だけ」**。キャッシュキーにチャンクの中身が入らないので、既存プログラムには効かない（`customProgramCacheKey` を変えた材だけ拾う）。しかも**グローバル**（全マテリアルに影響）。フォグを可変にしたい場合や一部の材だけ変えたい場合は `onBeforeCompile`＋共有 uniform（§1.3）。[H]
10. **標準フォグは「距離の二乗・平面深度・色空間依存」**: `exp(−(ρ·depth)²)`、`depth=−mvPosition.z`、canvas 直描きは sRGB 空間で混合・RT は線形空間で混合。**composer を入れるとフォグの見た目が変わる**。Beer–Lambert にしたいなら線形・放射距離・指数 1 次の自前実装。[S][H]
11. **放射距離を頂点で `length()` して `float` の varying で渡してはいけない**（大きな三角形で壊れる、実測：床の板で全面フォグ）。ビュー空間位置を `vec3` varying で渡し fragment で `length()`。[H]
12. **`SpotLight.map` の JSDoc は古い**（「castShadow=false だと無効」は誤り。r186 の実装では無影でも効く）。`texture.offset/repeat/rotation` は効かない、alpha は無視、円錐の外は無効。アニメさせるには RT を使うか、CanvasTexture／DataTexture の再アップロード（CPU→GPU）になる。[S][H]
13. **`Reflector`／`Water`／`Refractor` はカメラが面の裏側だと何もしない**（`Reflector.js:130-133`, `Water.js:252`, `Refractor.js:108-133`）。水中から水面を見上げる像を作るなら、メッシュを反転して置く（`rotation.x=+π/2` で鏡面 RT が描かれた）。スネルの窓の外側の全反射・窓の内側の屈折は自作。[S][H]
14. **Water 系の RT は HalfFloat（＋Reflector／Refractor は MSAA4）**で、シーンの再描画を伴う。Water2 は鏡面＋屈折の 2 回。`textureWidth/Height` 既定 512。水面の LOD（遠いほど RT を小さく／更新を間引く）は自前。[S][H]
15. **ヘッドレス環境は実機より「緩い」項目と「厳しい」項目がある**: `MAX_TEXTURE_SIZE` は 8192（実機 16384 より小）、`MAX_TEXTURE_IMAGE_UNITS`／`MAX_VERTEX_TEXTURE_IMAGE_UNITS` は 32（実機には 16 のものもある [R] → 影・環境・ボーン・モーフを同時に使う材が実機で超過しうる）、`MAX_VARYING_VECTORS` 31。時間は CPU ラスタで、初回 2.4〜3 s、定常 100 ms 級。**時間のしきい値でテストを落とさない**（同一マシンで 2 倍ぶれる）。[H]
16. **`file://` は不可**: ES module が CORS で読めない（`Access to script at 'file:///…' … has been blocked by CORS policy`、`--allow-file-access-from-files` を付けると読める）。ローカル HTTP サーバを立てる。[H]
17. **`readPixels`／`toDataURL` は `render()` と同じ JS タスク内で**（`preserveDrawingBuffer:false` の既定では、合成後は内容が無効になりうる）。`await` を挟むなら `preserveDrawingBuffer:true` か、`readRenderTargetPixels`。`page.screenshot()` は合成後の画面を撮るので問題ない。[H]
18. **BatchedMesh は描画ごと・影パスごとに O(個体数) の CPU 処理**（20,000 個体で約 4〜5 ms）。後処理の override パスにも毎回かかる。`sortObjects=false`／`perObjectFrustumCulled=false` で減る（0.2 ms まで）が、前者は透明物の順序、後者は視野外描画を失う。[H]
19. **`UnrealBloomPass` の `radius`／`threshold` には既定値が無い**（`UnrealBloomPass.js:46`）。省略すると undefined が uniform に入る。[S]
20. **EffectComposer／内蔵経路での `renderer.toneMapping`**: RT に描くとき材のシェーダには**トーンマップが掛からない**（`WebGLPrograms.js:177-183`）。最後の `OutputPass`（または内蔵出力）で 1 回だけ掛かる。自前のフォグを `tonemapping_fragment` の前（線形）に入れたのは、この両経路（canvas 直描き／RT）で同じ結果になるようにするため。検証したのは canvas 直描き経路のみで、RT 経路での一致は推論（[R]）。[S][H]

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

- Playwright 1.63 は Chromium の既定引数として `--enable-unsafe-swiftshader` と（headless 時）`--headless` を付ける（`playwright-core/lib/coreBundle.js:43337-43339`）。実際の GPU プロセスの引数には `--no-sandbox --disable-dev-shm-usage --headless --ozone-platform=headless --use-angle=swiftshader --enable-unsafe-swiftshader --use-gl=angle` が見えた（`ps` で確認。後ろの 3 つは本書が渡したもの）。**フラグは必須ではない**が、ソフトウェア経路を明示して挙動を固定するため標準として付ける。
- `file://` 読み込み: フラグ無し → CORS で失敗（`Access to script at 'file:///…three.module.js' … blocked by CORS`）、`--allow-file-access-from-files` → 成功（`file_test.mjs`）。**HTTP サーバを使う**。
- 決定性: `render_test.html` のスクリーンショットを 3 回連続で撮り md5 一致（`56cb3f6f5acdca01ed10ab9a8d57e1cf`）、PIL 差分 bbox = None。

### 5.6 実験ページ一覧と主な結果（付録 A に全文）

| ファイル | 内容 | 主な結果（§） |
|---|---|---|
| `render_test.html` | 5.4 の拡張版。GL 上限・拡張一覧、float RT、iridescence／clearcoat の A/B 画素差、GPU タイマークエリ | §2.10 |
| `x1_lod.html` | LOD の API 挙動（hysteresis・zoom・autoUpdate・複数カメラ）、SkinnedMesh レベルの skeleton 更新、切替ヒッチ（ウォームアップ無し／`compile()`／実キャンバス／RT の 4 条件） | §2.1, §2.2 |
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

（実行に使ったファイルをそのまま掲載する。`pages/file_scheme_test.html` の `file://` パスはセッション固有なので、再現時は自分の `THREE_ROOT` に書き換えること。）

### run.mjs

```js
// Usage: node run.mjs pages/<name>.html [--shot out.png] [--size 800x600] [--flags "a b c"] [--timeout 120000]
// - Serves THREE_ROOT at /three/ and ./pages at / via a local HTTP server (127.0.0.1, random port).
// - Launches /opt/pw-browsers/chromium (playwright-core, headless) and loads the page.
// - Page contract: set window.__result (JSON-serialisable) then window.__done = true.
// - Prints RESULT json + console lines. Optional screenshot of the whole page.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const THREE_ROOT = process.env.THREE_ROOT ||
  '/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/three-0.186.1/package';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const args = process.argv.slice(2);
const page_arg = args.find(a => /\.html(\?.*)?$/.test(a));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const shot = opt('shot'); const [W, H] = (opt('size', '800x600')).split('x').map(Number);
const timeout = Number(opt('timeout', '120000'));
const extraFlags = (opt('flags', '') || '').split(' ').filter(Boolean);
const PAGES = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'pages');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const isThree = u.startsWith('/three/');
  const base = isThree ? THREE_ROOT : PAGES;
  const f = path.join(base, isThree ? u.slice(7) : u.slice(1));
  if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: CHROMIUM, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...extraFlags],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/${path.basename(page_arg)}`);
try { await page.waitForFunction('window.__done === true', null, { timeout }); }
catch (e) { logs.push('[harness] timeout waiting for window.__done'); }
const result = await page.evaluate(() => window.__result);
if (shot) await page.screenshot({ path: shot });
console.log('RESULT ' + JSON.stringify(result, null, 2));
console.log(`--- console (wall ${Date.now() - t0} ms) ---\n` + logs.join('\n'));
await browser.close(); server.close();
```

### run_all.sh

```bash
#!/usr/bin/env bash
# Re-run every experiment behind threejs_audit_d_perf_lod_headless.md. Outputs -> results/*.out (+ PNG screenshots).
# Prereqs: node >= 22, `npm i playwright-core` in this dir, unpacked three@0.186.1 at THREE_ROOT (default in run.mjs), /opt/pw-browsers/chromium.
set -u
cd "$(dirname "$0")"; mkdir -p results
node probe2.mjs                                              > results/probe_flags.out 2>&1
node file_test.mjs "$PWD/pages/file_scheme_test.html"        > results/file_scheme.out 2>&1
node run.mjs pages/render_test.html --shot results/shot.png  > results/render_test.out 2>&1
node run.mjs pages/x1_lod.html        --size 320x240         > results/x1_lod.out 2>&1
node run.mjs pages/x2_instancing.html --size 320x240         > results/x2_instancing.out 2>&1
node run.mjs "pages/x3_post.html?mode=composer" --size 640x360 --timeout 400000 --shot results/x3_composer.png > results/x3_composer.out 2>&1
node run.mjs "pages/x3_post.html?mode=effects"  --size 640x360 --timeout 400000 --shot results/x3_effects.png  > results/x3_effects.out 2>&1
node run.mjs pages/x4_fog.html        --size 200x150         > results/x4_fog.out 2>&1
node run.mjs pages/x5_caustics.html   --size 240x240 --shot results/x5_caustics.png > results/x5_caustics.out 2>&1
node run.mjs pages/x6_water.html      --size 320x240         > results/x6_water.out 2>&1
node run.mjs pages/x7_misc.html       --size 320x240         > results/x7_misc.out 2>&1
for f in results/*.out; do echo "== $f ($(wc -l < $f) lines)"; done
```

### probe2.mjs

```js
import { chromium } from 'playwright-core';
const cases = {
  'full chromium, NO extra flags': { exe: '/opt/pw-browsers/chromium', args: [] },
  'full chromium, swiftshader flags': { exe: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  'headless_shell, NO extra flags': { exe: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: [] },
  'full chromium, --disable-gpu (expect no WebGL)': { exe: '/opt/pw-browsers/chromium', args: ['--disable-gpu'] },
  'full chromium, --disable-gpu + swiftshader flags': { exe: '/opt/pw-browsers/chromium', args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  'full chromium, --use-angle=swiftshader only': { exe: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader'] },
};
for (const [name, c] of Object.entries(cases)) {
  let b; try {
    b = await chromium.launch({ executablePath: c.exe, headless: true, args: c.args });
    const p = await b.newPage();
    const info = await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return { webgl2: false, ua: navigator.userAgent };
      const d = gl.getExtension('WEBGL_debug_renderer_info'); return { webgl2: true, r: gl.getParameter(d.UNMASKED_RENDERER_WEBGL), ua: navigator.userAgent }; });
    console.log(name, '|', b.version(), '|', JSON.stringify(info));
  } catch (e) { console.log(name, 'ERR', String(e).split('\n')[0]); } finally { if (b) await b.close(); }
}
```

### file_test.mjs

```js
import { chromium } from 'playwright-core';
const url = 'file://' + process.argv[2];
for (const [name, args] of [['no flag', []], ['--allow-file-access-from-files', ['--allow-file-access-from-files']]]) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args });
  const p = await b.newPage(); const logs = [];
  p.on('console', m => logs.push(m.text().slice(0, 160))); p.on('pageerror', e => logs.push('pageerror ' + e.message.slice(0, 160)));
  await p.goto(url);
  const ok = await p.waitForFunction('window.__done===true', null, { timeout: 5000 }).then(() => true, () => false);
  console.log(name, '=> loaded:', ok, ok ? JSON.stringify(await p.evaluate(() => window.__result)) : '', logs.slice(0, 2));
  await b.close();
}
```

### pages/file_scheme_test.html

```html
<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"file:///tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/three-0.186.1/package/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
window.__result = { rev: THREE.REVISION }; window.__done = true;
</script>
```

### pages/render_test.html

```html
<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const R = { three: THREE.REVISION };
const W = 800, H = 600;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();

// ---- GL capability report (what the future verification loop needs to know) ----
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
R.gl = {
  isWebGL2: renderer.capabilities.isWebGL2,
  VERSION: gl.getParameter(gl.VERSION),
  SHADING_LANGUAGE_VERSION: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
  RENDERER: gl.getParameter(gl.RENDERER),
  UNMASKED_VENDOR: dbg && gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL),
  UNMASKED_RENDERER: dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL),
  MAX_TEXTURE_SIZE: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  MAX_3D_TEXTURE_SIZE: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE),
  MAX_ARRAY_TEXTURE_LAYERS: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
  MAX_CUBE_MAP_TEXTURE_SIZE: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
  MAX_TEXTURE_IMAGE_UNITS: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
  MAX_VERTEX_ATTRIBS: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
  MAX_VERTEX_UNIFORM_VECTORS: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
  MAX_FRAGMENT_UNIFORM_VECTORS: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
  MAX_VARYING_VECTORS: gl.getParameter(gl.MAX_VARYING_VECTORS),
  MAX_SAMPLES: gl.getParameter(gl.MAX_SAMPLES),
  MAX_DRAW_BUFFERS: gl.getParameter(gl.MAX_DRAW_BUFFERS),
  MAX_UNIFORM_BLOCK_SIZE: gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE),
  ALIASED_LINE_WIDTH_RANGE: Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)),
  threeCapabilities: {
    maxTextures: renderer.capabilities.maxTextures, maxVertexTextures: renderer.capabilities.maxVertexTextures,
    maxTextureSize: renderer.capabilities.maxTextureSize, maxSamples: renderer.capabilities.maxSamples,
    precision: renderer.capabilities.precision, logarithmicDepthBuffer: renderer.capabilities.logarithmicDepthBuffer,
    reversedDepthBuffer: renderer.capabilities.reversedDepthBuffer,
  },
  extensions: gl.getSupportedExtensions().sort(),
};
const has = n => !!gl.getExtension(n);
R.ext = Object.fromEntries(['EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'EXT_float_blend', 'OES_texture_float_linear',
  'OES_texture_half_float_linear', 'WEBGL_multi_draw', 'EXT_disjoint_timer_query_webgl2', 'EXT_disjoint_timer_query', 'KHR_parallel_shader_compile',
  'EXT_texture_filter_anisotropic', 'WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_astc', 'EXT_texture_compression_bptc', 'EXT_texture_compression_rgtc',
  'OVR_multiview2', 'EXT_clip_control', 'WEBGL_clip_cull_distance', 'EXT_depth_clamp', 'WEBGL_provoking_vertex', 'WEBGL_debug_shaders'].map(n => [n, has(n)]));

// ---- scene ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b2a3a);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 50);
camera.position.set(0, 0.6, 8.2); camera.lookAt(0, 0.2, 0);
const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(3, 5, 4); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x335544, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -1.4; floor.receiveShadow = true; scene.add(floor);

// (1) MeshPhysicalMaterial sphere: iridescence + clearcoat
const sphereMat = new THREE.MeshPhysicalMaterial({
  color: 0x8899aa, metalness: 0.0, roughness: 0.25,
  clearcoat: 1.0, clearcoatRoughness: 0.08,
  iridescence: 1.0, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 400],
});
const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), sphereMat);
sphere.position.set(-1.9, 0.3, 0); sphere.castShadow = true; scene.add(sphere);

// (2) SkinnedMesh with 3 bones (vertical capsule-ish cylinder, bent at both joints)
const bones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()];
bones[0].position.y = -1.2; bones[1].position.y = 1.2; bones[2].position.y = 1.2; bones[0].add(bones[1]); bones[1].add(bones[2]);
const geo = new THREE.CylinderGeometry(0.35, 0.35, 3.6, 24, 36, false); // y in [-1.8, 1.8]
const pos = geo.attributes.position; const si = [], sw = [];
for (let i = 0; i < pos.count; i++) {
  const y = pos.getY(i) + 1.2; // bone0 at y=0 (world y: -1.2+... relative rest), bone1 at 1.2, bone2 at 2.4 (in mesh space with root at -1.2)
  // weights by height: linear blend between bone0/bone1 over [0.6,1.8], bone1/bone2 over [1.8,3.0] (mesh-space y shifted by +1.2 => [0,3.6])
  const ys = pos.getY(i) + 1.8; // [0,3.6]
  let w0 = 0, w1 = 0, w2 = 0;
  if (ys < 0.6) w0 = 1; else if (ys < 1.8) { const t = (ys - 0.6) / 1.2; w0 = 1 - t; w1 = t; }
  else if (ys < 3.0) { const t = (ys - 1.8) / 1.2; w1 = 1 - t; w2 = t; } else w2 = 1;
  si.push(0, 1, 2, 0); sw.push(w0, w1, w2, 0);
}
geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.45, metalness: 0.1 });
const skinned = new THREE.SkinnedMesh(geo, skinMat);
skinned.add(bones[0]); skinned.bind(new THREE.Skeleton(bones));
skinned.position.set(1.9, 0, 0); skinned.castShadow = true; scene.add(skinned);
bones[1].rotation.z = 0.55; bones[2].rotation.z = -0.9; // visible bend
scene.updateMatrixWorld(true);

// ---- first frame (includes shader compile) + steady frames, synced by 1-px readPixels ----
const px = new Uint8Array(4);
const sync = () => { gl.readPixels(W >> 1, H >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
let t = performance.now();
renderer.render(scene, camera); sync();
R.firstFrameMs = +(performance.now() - t).toFixed(1);
const ts = [];
for (let i = 0; i < 20; i++) {
  sphere.rotation.y += 0.05; bones[1].rotation.z = 0.55 * Math.cos(i * 0.3); // keep it dynamic (bones change each frame)
  const a = performance.now(); renderer.render(scene, camera); sync(); ts.push(performance.now() - a);
}
ts.sort((a, b) => a - b);
R.steadyFrameMs = { median: +ts[ts.length >> 1].toFixed(1), min: +ts[0].toFixed(1), max: +ts[ts.length - 1].toFixed(1), n: ts.length, size: `${W}x${H}`, antialias: true };
R.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length };

// ---- pixel sanity: sphere region and skinned-mesh region must differ from background ----
renderer.render(scene, camera);
const readPx = (x, y) => { const b = new Uint8Array(4); gl.readPixels(x, H - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return Array.from(b); };
const proj = (obj, dy = 0) => { const v = obj.getWorldPosition(new THREE.Vector3()); v.y += dy; v.project(camera); return [Math.round((v.x * 0.5 + 0.5) * W), Math.round((1 - (v.y * 0.5 + 0.5)) * H)]; };
const [sx, sy] = proj(sphere);
const half = new Uint8Array(4 * (W / 2) * H); gl.readPixels(W / 2, 0, W / 2, H, gl.RGBA, gl.UNSIGNED_BYTE, half);
let cream = 0; for (let i = 0; i < half.length; i += 4) if (half[i] > 150 && half[i] > half[i + 2] + 40) cream++;  // lit cream-coloured skin pixels (0xc9a46a-ish)
R.pixels = { background: readPx(10, 10), sphereCenter: readPx(sx, sy), skinnedCreamPixelsInRightHalf: cream };
// ---- iridescence/clearcoat actually change the pixels (A/B on the same frame) ----
function grab() { const r = 100; const buf = new Uint8Array(4 * (2 * r) * (2 * r));
  gl.readPixels(sx - r, H - (sy + r), 2 * r, 2 * r, gl.RGBA, gl.UNSIGNED_BYTE, buf); return buf; }
function diff(a, b) { let max = 0, n8 = 0, tot = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); tot++; if (d > max) max = d; if (d > 8) n8++; } return { maxAbsDiff: max, pixelsDiffGt8: n8, of: tot }; }
const keep = { iri: sphereMat.iridescence, cc: sphereMat.clearcoat };
sphereMat.iridescence = 0; sphereMat.clearcoat = 0; renderer.render(scene, camera); const g00 = grab();
sphereMat.iridescence = 1; sphereMat.clearcoat = 0; renderer.render(scene, camera); const g10 = grab();
sphereMat.iridescence = 0; sphereMat.clearcoat = 1; renderer.render(scene, camera); const g01 = grab();
sphereMat.iridescence = 1; sphereMat.clearcoat = 1; renderer.render(scene, camera); const g11 = grab();
R.materialAB = { iridescenceEffect: diff(g00, g10), clearcoatEffect: diff(g00, g01), bothEffect: diff(g00, g11) };
sphereMat.iridescence = keep.iri; sphereMat.clearcoat = keep.cc; renderer.render(scene, camera);
// ---- GPU timer query (EXT_disjoint_timer_query_webgl2 is *listed*; does it return data?) ----
async function gpuTimer() {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return { available: false };
  const out = [];
  for (let k = 0; k < 5; k++) {
    const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); renderer.render(scene, camera); gl.endQuery(ext.TIME_ELAPSED_EXT);
    let ok = false; for (let i = 0; i < 200; i++) { await new Promise(r => setTimeout(r, 10)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { ok = true; break; } }
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    out.push(ok ? { ms: +(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).toFixed(2), disjoint } : { ms: null, disjoint, note: 'result never became available' });
  }
  return { available: true, samples: out, qBits: gl.getQuery(ext.TIME_ELAPSED_EXT, ext.QUERY_COUNTER_BITS_EXT) };
}
R.gpuTimerQuery = await gpuTimer();

// ---- float render-target sanity (EXT_color_buffer_float actually usable by three) ----
function rtTest(type, name) {
  try {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type, format: THREE.RGBAFormat });
    renderer.setRenderTarget(rt); renderer.setClearColor(new THREE.Color(0.25, 2.5, 0.5), 1); renderer.clear();
    const buf = type === THREE.FloatType ? new Float32Array(4 * 4 * 4) : new Uint16Array(4 * 4 * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, 4, 4, buf); renderer.setRenderTarget(null);
    const v = type === THREE.FloatType ? Array.from(buf.slice(0, 4)) : Array.from(buf.slice(0, 4)).map(h => THREE.DataUtils.fromHalfFloat(h));
    rt.dispose(); return { ok: true, firstPixel: v.map(x => +x.toFixed(3)) };
  } catch (e) { return { ok: false, err: String(e).slice(0, 120) }; }
}
R.rt = { HalfFloat: rtTest(THREE.HalfFloatType), Float: rtTest(THREE.FloatType) };
renderer.setClearColor(0x000000, 0);
// float DataTexture sampling (vertex-shader bone texture uses RGBA32F, NEAREST)
R.skeletonBoneTexture = { type: skinned.skeleton.boneTexture && skinned.skeleton.boneTexture.type === THREE.FloatType ? 'FloatType' : String(skinned.skeleton.boneTexture && skinned.skeleton.boneTexture.type), size: skinned.skeleton.boneTexture && [skinned.skeleton.boneTexture.image.width, skinned.skeleton.boneTexture.image.height] };
renderer.render(scene, camera); // leave final frame on canvas
R.glError = gl.getError();
window.__result = R; window.__done = true;
</script>
```

### pages/x1_lod.html

```html
<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
const R = {};
const W = 320, H = 240;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(W, H); renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const px = new Uint8Array(4); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 500);
const mkScene = () => { const s = new THREE.Scene(); const l = new THREE.DirectionalLight(0xffffff, 2); l.position.set(1, 2, 3); s.add(l, new THREE.AmbientLight(0xffffff, 0.3)); return s; };

// ---------- 1a. LOD.addLevel / hysteresis / zoom / autoUpdate ----------
{
  const scene = mkScene();
  const mat = new THREE.MeshStandardMaterial({ color: 0x88aacc });
  const geos = [new THREE.SphereGeometry(1, 32, 24), new THREE.SphereGeometry(1, 16, 12), new THREE.SphereGeometry(1, 8, 6)];
  const tri = geos.map(g => g.index.count / 3);
  const lod = new THREE.LOD();
  lod.addLevel(new THREE.Mesh(geos[0], mat), 0, 0.5);   // hysteresis on level 0 must be ignored (loop starts at i=1)
  lod.addLevel(new THREE.Mesh(geos[1], mat), 20, 0.1);  // switch to L1 at >=20 ; back to L0 at <18
  lod.addLevel(new THREE.Mesh(geos[2], mat), 40, 0.0);
  scene.add(lod);
  R.lod_levelsOrder = lod.levels.map(l => ({ d: l.distance, h: l.hysteresis }));
  R.lod_visibleBeforeFirstRender = lod.levels.map(l => l.object.visible);   // all true until the renderer calls update()
  R.lod_currentLevelBeforeFirstRender = lod.getCurrentLevel();
  const at = d => { camera.position.set(0, 0, d); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); renderer.render(scene, camera); return { lvl: lod.getCurrentLevel(), tris: renderer.info.render.triangles, vis: lod.levels.map(l => +l.object.visible).join('') }; };
  const seq = (ds) => ds.map(d => `${d}:${at(d).lvl}`).join(' ');
  R.lod_trianglesPerLevel = tri;
  R.lod_sweepUp = seq([10, 17, 17.9, 18.1, 19.9, 20, 20.1, 25, 39.9, 40, 41]);
  R.lod_sweepDown = seq([41, 40, 39.9, 36.1, 35.9, 25, 20.1, 19.9, 18.1, 17.9, 17, 10]);  // L2->L1 with hysteresis 0 at 40 ; L1->L0 at 18
  R.lod_info_atL1 = at(25);
  // camera.zoom divides the distance (LOD.js:259)
  camera.zoom = 2; camera.updateProjectionMatrix(); R.lod_zoom2_at30_level = at(30).lvl + ' (zoom=1 would be 1; distance/zoom=15 -> 0)'; R.lod_zoom2_at45_level = at(45).lvl;
  camera.zoom = 1; camera.updateProjectionMatrix();
  // autoUpdate=false freezes the selection until lod.update(camera) is called manually
  lod.autoUpdate = false; at(10); const frozen = at(100).lvl; lod.update(camera); R.lod_autoUpdateFalse = { levelAfterRenderAt100: frozen, levelAfterManualUpdate: lod.getCurrentLevel() };
  lod.autoUpdate = true;
  // two renders with two cameras: the LAST render()'s camera wins (state lives in .visible flags)
  const camA = camera.clone(); camA.position.set(0, 0, 5); camA.lookAt(0, 0, 0); camA.updateMatrixWorld();
  const camB = camera.clone(); camB.position.set(0, 0, 60); camB.lookAt(0, 0, 0); camB.updateMatrixWorld();
  renderer.render(scene, camA); const a = lod.getCurrentLevel(); renderer.render(scene, camB); const b = lod.getCurrentLevel();
  R.lod_twoCameras = { afterCamNear: a, afterCamFar: b, visFlagsNow: lod.levels.map(l => +l.object.visible).join('') };
  // raycast uses getObjectForDistance(distance origin->LOD origin)
  R.lod_getObjectForDistance = [5, 25, 45].map(d => lod.levels.findIndex(l => l.object === lod.getObjectForDistance(d)));
  // single level: update() is a no-op (levels.length > 1 guard, LOD.js:254)
  const one = new THREE.LOD(); one.addLevel(new THREE.Mesh(geos[0], mat), 0); one.levels[0].object.visible = false; one.update(camera); R.lod_singleLevelUpdateNoop = one.levels[0].object.visible === false;
}

// ---------- 1b. SkinnedMesh as LOD levels ----------
function skinnedCylinder(nBones, radial, heightSeg, mat, sharedSkeleton, sharedBindMatrix) {
  const len = 4, geo = new THREE.CylinderGeometry(0.3, 0.1, len, radial, heightSeg);
  const pos = geo.attributes.position, si = [], sw = [];
  for (let i = 0; i < pos.count; i++) {
    const s = (pos.getY(i) + len / 2) / len * (nBones - 1); const i0 = Math.min(Math.floor(s), nBones - 2), f = s - i0;
    si.push(i0, i0 + 1, 0, 0); sw.push(1 - f, f, 0, 0);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const mesh = new THREE.SkinnedMesh(geo, mat);
  let skeleton = sharedSkeleton, bones;
  if (!skeleton) {
    bones = []; for (let i = 0; i < nBones; i++) { const b = new THREE.Bone(); b.position.y = i === 0 ? -len / 2 : len / (nBones - 1); if (i) bones[i - 1].add(b); bones.push(b); }
    mesh.add(bones[0]); skeleton = new THREE.Skeleton(bones); mesh.bind(skeleton);
  } else { mesh.bind(skeleton, sharedBindMatrix); }
  return { mesh, skeleton, bones };
}
const counters = new Map();
const origUpdate = THREE.Skeleton.prototype.update;
THREE.Skeleton.prototype.update = function () { counters.set(this, (counters.get(this) || 0) + 1); return origUpdate.call(this); };
const upd = (sk) => counters.get(sk) || 0;

function runVariant(name, build, dists) {
  const scene = mkScene(); const mat = new THREE.MeshStandardMaterial({ color: 0xccaa77 });
  const { lod, skeletons } = build(mat); scene.add(lod); const out = { dists: {} };
  dists.forEach((d, idx) => {
    camera.position.set(0, 0, d); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    skeletons.forEach(s => counters.set(s, 0));
    renderer.render(scene, camera); sync();
    out.dists[idx + ':' + d] = { level: lod.getCurrentLevel(), skeletonUpdates: skeletons.map(upd), boneTextureAllocated: skeletons.map(s => s.boneTexture !== null), programs: renderer.info.programs.length };
  });
  R['lodSkin_' + name] = out;
}
// A: ONE shared skeleton (16 bones), 2 geometries (high / low vertex count): the recommended layout
runVariant('A_sharedSkeleton', (mat) => {
  const hi = skinnedCylinder(16, 24, 48, mat); const lo = skinnedCylinder(16, 8, 16, mat, hi.skeleton, hi.mesh.bindMatrix);
  const lod = new THREE.LOD(); lod.addLevel(hi.mesh, 0); lod.addLevel(lo.mesh, 30);
  R.lodSkin_A_tris = [hi.mesh.geometry.index.count / 3, lo.mesh.geometry.index.count / 3];
  return { lod, skeletons: [hi.skeleton] };
}, [10, 50, 10]);
// B: separate skeleton per level (16 bones vs 6 bones)
runVariant('B_separateSkeletons', (mat) => {
  const hi = skinnedCylinder(16, 24, 48, mat); const lo = skinnedCylinder(6, 8, 16, mat);
  const lod = new THREE.LOD(); lod.addLevel(hi.mesh, 0); lod.addLevel(lo.mesh, 30);
  return { lod, skeletons: [hi.skeleton, lo.skeleton] };
}, [10, 50, 10]);

// C: far level is a NON-skinned Mesh (baked pose): a different shader program -> compile hitch at the first switch unless pre-compiled
async function hitch(precompile, variant) { // precompile: false | 'compile' | 'warmRender' | 'warmRT'
  const scene = mkScene(); const mat = new THREE.MeshStandardMaterial({ color: 0xccaa77, roughness: 0.3 });
  const mat2 = new THREE.MeshPhysicalMaterial(variant === 1 ? { color: 0xccaa77, roughness: 0.3, clearcoat: 1, iridescence: 1 } : variant === 2 ? { color: 0xccaa77, roughness: 0.3, sheen: 1, anisotropy: 0.5 } : variant === 3 ? { color: 0xccaa77, roughness: 0.3, transmission: 0.0, iridescence: 0.5, sheen: 0.5, clearcoat: 0.3 } : { color: 0xccaa77, roughness: 0.3, iridescence: 1, anisotropy: 0.4, clearcoat: 0.6 }); // different far material on purpose (distinct program per variant)
  const hi = skinnedCylinder(16, 24, 48, mat); const far = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.1, 4, 8, 4), mat2);
  const lod = new THREE.LOD(); lod.addLevel(hi.mesh, 0); lod.addLevel(far, 30); scene.add(lod);
  const visBefore = lod.levels.map(l => +l.object.visible).join('');
  const set = d => { camera.position.set(0, 0, d); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); };
  set(10); renderer.render(scene, camera); sync();                         // LOD.update hides the far level now
  const visAfterNear = lod.levels.map(l => +l.object.visible).join('');
  const p0 = renderer.info.programs.length;
  let tc = 0;
  if (precompile === 'compile') { const t = performance.now(); renderer.compile(scene, camera); tc = performance.now() - t; }
  if (precompile === 'warmRender') { // draw every level once (autoUpdate off, all visible) to the real canvas, then restore
    const t = performance.now(); lod.autoUpdate = false; lod.levels.forEach(l => l.object.visible = true);
    renderer.render(scene, camera); sync(); // to the canvas itself: the program key includes output colour space / tone mapping, so an RT warm-up would build different programs
    lod.autoUpdate = true; tc = performance.now() - t; }
  if (precompile === 'warmRT') { // same warm-up but into a render target: different outputColorSpace / toneMapping in the program key => useless
    const t = performance.now(); lod.autoUpdate = false; lod.levels.forEach(l => l.object.visible = true);
    const rt = new THREE.WebGLRenderTarget(16, 16); renderer.setRenderTarget(rt); renderer.render(scene, camera); sync(); renderer.setRenderTarget(null); rt.dispose();
    lod.autoUpdate = true; tc = performance.now() - t; }
  const p1 = renderer.info.programs.length;
  set(60); const t = performance.now(); renderer.render(scene, camera); sync(); const first = performance.now() - t;
  const p2 = renderer.info.programs.length;
  const t2 = performance.now(); renderer.render(scene, camera); sync(); const second = performance.now() - t2;
  return { visBefore, visAfterNear, programsBefore: p0, programsAfterCompile: p1, programsAfterSwitch: p2, compileMs: +tc.toFixed(0), firstFarFrameMs: +first.toFixed(0), secondFarFrameMs: +second.toFixed(0) };
}
R.lodSkin_C_hitch_noPrecompile = await hitch(false, 1);
R.lodSkin_C_hitch_withRendererCompile = await hitch('compile', 2);
R.lodSkin_C_hitch_withWarmRender = await hitch('warmRender', 3);
R.lodSkin_C_hitch_withWarmRenderToRT = await hitch('warmRT', 4);

// ---------- 1c. frustum culling happens per level object, not on the LOD node ----------
{
  const scene = mkScene(); const mat = new THREE.MeshStandardMaterial();
  const lod = new THREE.LOD(); lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat), 0); lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat), 50); scene.add(lod);
  lod.position.set(0, 0, -300); // behind the camera look direction? camera looks to -z from +z; put LOD far to the side instead
  lod.position.set(500, 0, 0); camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  renderer.render(scene, camera); R.lod_offscreen = { calls: renderer.info.render.calls, level: lod.getCurrentLevel(), note: 'LOD.update still runs for an off-screen LOD; its level objects are culled individually' };
}
R.glError = gl.getError();
window.__result = R; window.__done = true;
</script>
```

### pages/x2_instancing.html

```html
<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
const R = {};
const W = 320, H = 240;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(W, H); document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const px = new Uint8Array(4); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
const mkScene = () => { const s = new THREE.Scene(); s.background = new THREE.Color(0, 0, 0); s.add(new THREE.AmbientLight(0xffffff, 3)); return s; };
const mat = () => new THREE.MeshBasicMaterial({ color: 0xff8800 });
const look = (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); camera.updateMatrixWorld(); camera.updateProjectionMatrix(); };
const lit = () => { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); let n = 0; for (let i = 0; i < b.length; i += 4) if (b[i] > 100) n++; return n; };
const info = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
const M = new THREE.Matrix4();

// ---------- 2a. InstancedMesh: frustum culling is whole-object, bounding sphere cached ----------
{
  const scene = mkScene(); const geo = new THREE.IcosahedronGeometry(1, 1); const triPer = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  const N = 1000; const im = new THREE.InstancedMesh(geo, mat(), N); scene.add(im);
  for (let i = 0; i < N; i++) { M.makeTranslation((i % 10) * 4 - 18, Math.floor(i / 100) * 4 - 18, (Math.floor(i / 10) % 10) * -4); im.setMatrixAt(i, M); }
  im.instanceMatrix.needsUpdate = true;
  look(0, 0, 80, 0, 0, 0); renderer.render(scene, camera); sync();
  R.inst_all_in_view = { ...info(), triPer, expectedAllInstances: N * triPer, boundingSphere: im.boundingSphere && { c: im.boundingSphere.center.toArray().map(v => +v.toFixed(1)), r: +im.boundingSphere.radius.toFixed(1) } };
  // camera looks at a small corner: 99% of instances are outside the frustum but are still drawn (no per-instance culling)
  look(-18, -18, 20, -18, -18, 0); renderer.render(scene, camera); sync();
  R.inst_zoomedOnOneCorner = { ...info(), note: 'triangles still == all instances: InstancedMesh culls the whole object only' };
  // object completely outside -> whole mesh culled
  look(0, 0, 80, 0, 500, 80); renderer.render(scene, camera); R.inst_lookingAway = info();
  // mesh.count < N renders only the first `count` instances
  im.count = 100; look(0, 0, 80, 0, 0, 0); renderer.render(scene, camera); R.inst_count100 = info(); im.count = N;
  // stale bounding sphere: move every instance far away after the sphere was computed
  const scene2 = mkScene(); const im2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(), 10); scene2.add(im2);
  for (let i = 0; i < 10; i++) { M.makeTranslation(i * 2 - 9, 0, 0); im2.setMatrixAt(i, M); }
  look(0, 0, 40, 0, 0, 0); renderer.render(scene2, camera); sync(); R.inst_stale_before = { ...info(), lit: lit(), r: +im2.boundingSphere.radius.toFixed(1) };
  for (let i = 0; i < 10; i++) { M.makeTranslation(500 + i * 2, 0, 0); im2.setMatrixAt(i, M); } im2.instanceMatrix.needsUpdate = true;
  look(505, 0, 40, 505, 0, 0); renderer.render(scene2, camera); sync(); R.inst_stale_afterMove_culledWrongly = { ...info(), lit: lit() };
  im2.computeBoundingSphere(); renderer.render(scene2, camera); sync(); R.inst_stale_afterRecompute = { ...info(), lit: lit(), r: +im2.boundingSphere.radius.toFixed(1) };
  im2.boundingSphere = null; im2.frustumCulled = false; renderer.render(scene2, camera); sync(); R.inst_frustumCulledFalse = { ...info(), lit: lit() };
  // CPU cost of recomputing the sphere for large N (it loops over every instance)
  const big = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(), 20000);
  for (let i = 0; i < 20000; i++) { M.makeTranslation(Math.random() * 100, Math.random() * 100, Math.random() * 100); big.setMatrixAt(i, M); }
  const t = performance.now(); big.computeBoundingSphere(); R.inst_computeBoundingSphere20000_ms = +(performance.now() - t).toFixed(2);
  // InstancedMesh with a SkinnedMesh geometry does NOT skin (skinning flag is object.isSkinnedMesh only: WebGLPrograms.js:330)
  const sg = new THREE.CylinderGeometry(0.3, 0.3, 4, 8, 8); const pos = sg.attributes.position, si = [], sw = [];
  for (let i = 0; i < pos.count; i++) { const f = (pos.getY(i) + 2) / 4; si.push(0, 1, 0, 0); sw.push(1 - f, f, 0, 0); }
  sg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); sg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const imSkin = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0xff8800 }), 1); imSkin.setMatrixAt(0, M.identity()); const sc = mkScene(); sc.add(imSkin);
  look(0, 0, 10, 0, 0, 0); renderer.render(sc, camera);
  const progs = renderer.info.programs.filter(p => p.name === 'MeshBasicMaterial'); // list program params
  R.inst_skinGeometryDoesNotSkin = { isSkinnedMesh: imSkin.isSkinnedMesh, skeleton: imSkin.skeleton, note: 'no skeleton property -> no bone texture is bound; InstancedMesh cannot be a SkinnedMesh' };
}

// ---------- 2b. BatchedMesh: per-instance culling, per-instance geometry (LOD), multi-draw ----------
{
  const scene = mkScene();
  const g = [new THREE.IcosahedronGeometry(1, 3), new THREE.IcosahedronGeometry(1, 2), new THREE.IcosahedronGeometry(1, 0)];
  const tris = g.map(x => (x.index ? x.index.count : x.attributes.position.count) / 3);
  const verts = g.reduce((a, x) => a + x.attributes.position.count, 0);
  const idx = g.reduce((a, x) => a + (x.index ? x.index.count : 0), 0);
  const N = 1000;
  const bm = new THREE.BatchedMesh(N, verts, idx, mat()); scene.add(bm);
  const gid = g.map(x => bm.addGeometry(x));
  const ids = [];
  for (let i = 0; i < N; i++) { const id = bm.addInstance(gid[0]); ids.push(id); M.makeTranslation((i % 10) * 4 - 18, Math.floor(i / 100) * 4 - 18, (Math.floor(i / 10) % 10) * -4); bm.setMatrixAt(id, M); }
  R.batch_setup = { triangles_per_geometry: tris, geometryIds: gid, hasMultiDraw: !!gl.getExtension('WEBGL_multi_draw') };
  bm.perObjectFrustumCulled = true; bm.sortObjects = true;
  look(0, 0, 80, 0, 0, 0); renderer.render(scene, camera); sync(); R.batch_all_in_view = { ...info(), expectedIfAll: N * tris[0] };
  look(-18, -18, 20, -18, -18, 0); renderer.render(scene, camera); sync(); R.batch_zoomedCorner_perObjectCulled = { ...info(), lit: lit() };
  bm.perObjectFrustumCulled = false; renderer.render(scene, camera); sync(); R.batch_zoomedCorner_notCulled = info();
  bm.perObjectFrustumCulled = true;
  // per-instance LOD: switch geometry per distance with setGeometryIdAt (all geometries live in the same buffers)
  look(0, 0, 80, 0, 0, 0); const cp = camera.position;
  for (let i = 0; i < N; i++) { bm.getMatrixAt(ids[i], M); const p = new THREE.Vector3().setFromMatrixPosition(M); const d = p.distanceTo(cp); bm.setGeometryIdAt(ids[i], d < 85 ? gid[0] : d < 95 ? gid[1] : gid[2]); }
  renderer.render(scene, camera); sync(); const counts = [0, 0, 0]; for (let i = 0; i < N; i++) counts[gid.indexOf(bm.getGeometryIdAt(ids[i]))]++;
  R.batch_perInstanceLOD = { ...info(), instancesPerGeometry: counts, expectedTris: counts.reduce((a, c, k) => a + c * tris[k], 0) };
  // setVisibleAt
  for (let i = 0; i < N; i += 2) bm.setVisibleAt(ids[i], false); renderer.render(scene, camera); R.batch_halfHidden = info();
  // CPU cost of onBeforeRender (iterates all instances every render, and again for every shadow pass): measure directly
  const timeOBR = (n, sort, cull) => {
    const b = new THREE.BatchedMesh(n, 3 * 642, 3 * 1280 * 3, mat()); const gi = b.addGeometry(g[1]);
    for (let i = 0; i < n; i++) { const id = b.addInstance(gi); M.makeTranslation(Math.random() * 200 - 100, Math.random() * 200 - 100, Math.random() * -200); b.setMatrixAt(id, M); }
    b.sortObjects = sort; b.perObjectFrustumCulled = cull; b.computeBoundingSphere(); b.updateMatrixWorld(true);
    look(0, 0, 50, 0, 0, 0); camera.updateMatrixWorld(); const geo = b.geometry;
    for (let k = 0; k < 3; k++) b.onBeforeRender(renderer, scene, camera, geo, b.material);
    const t = performance.now(); const reps = 10; for (let k = 0; k < reps; k++) { b._visibilityChanged = true; b.onBeforeRender(renderer, scene, camera, geo, b.material); }
    return +((performance.now() - t) / reps).toFixed(3);
  };
  R.batch_onBeforeRender_ms = { '1000_sort+cull': timeOBR(1000, true, true), '5000_sort+cull': timeOBR(5000, true, true), '20000_sort+cull': timeOBR(20000, true, true), '20000_cull_only': timeOBR(20000, false, true), '20000_none': timeOBR(20000, false, false) };
  // single draw call? (multi_draw) -- calls counts
  bm.sortObjects = true; look(0, 0, 80, 0, 0, 0); for (let i = 0; i < N; i += 2) bm.setVisibleAt(ids[i], true); renderer.render(scene, camera); R.batch_drawCalls = info().calls;
}
R.glError = gl.getError();
window.__result = R; window.__done = true;
</script>
```

### pages/x3_post.html

```html
<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const R = {};
const W = 640, H = 360;
const params = new URLSearchParams(location.search);
const MODE = params.get('mode') || 'composer';
const renderer = new THREE.WebGLRenderer(MODE === 'effects' ? { antialias: true, outputBufferType: THREE.HalfFloatType } : { antialias: true });  // effects mode = r186 built-in HDR output path
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const px = new Uint8Array(4); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);

// --- scene: shadow-casting sun, floor, 6 physical spheres, 1 skinned mesh ---
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b2a3a);
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 60); camera.position.set(0, 2, 9); camera.lookAt(0, 0.3, 0); camera.updateMatrixWorld();
const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 }); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x335544, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1; floor.receiveShadow = true; scene.add(floor);
for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0x8899aa, roughness: 0.25, clearcoat: 1, iridescence: 1 })); m.position.set(i * 1.9 - 4.75, 0, -i * 0.8); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
const bones = []; for (let i = 0; i < 12; i++) { const b = new THREE.Bone(); b.position.y = i ? 0.3 : -1.8; if (i) bones[i - 1].add(b); bones.push(b); }
const sg = new THREE.CylinderGeometry(0.25, 0.1, 3.3, 16, 36); const sp = sg.attributes.position, si = [], sw = [];
for (let i = 0; i < sp.count; i++) { const s = (sp.getY(i) + 1.65) / 3.3 * 11; const i0 = Math.min(Math.floor(s), 10), f = s - i0; si.push(i0, i0 + 1, 0, 0); sw.push(1 - f, f, 0, 0); }
sg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); sg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
const fish = new THREE.SkinnedMesh(sg, new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.4 })); fish.add(bones[0]); fish.bind(new THREE.Skeleton(bones)); fish.position.set(0, 0.6, 2.5); fish.castShadow = true; fish.receiveShadow = true; scene.add(fish);
const wiggle = t => bones.forEach((b, i) => { if (i) b.rotation.z = 0.25 * Math.sin(t * 3 - i * 0.6); });

// --- instrumentation ---
let log = null;
const origRender = renderer.render.bind(renderer);
renderer.render = (s, c) => { const e = { shadowRuns: 0 }; log && log.push(e); const r = origRender(s, c); e.calls = renderer.info.render.calls; e.tris = renderer.info.render.triangles; e.override = !!(s.overrideMaterial); e.target = renderer.getRenderTarget() ? 'RT' : 'screen'; return r; };
const origShadow = renderer.shadowMap.render.bind(renderer.shadowMap);
renderer.shadowMap.render = (l, s, c) => { const need = renderer.shadowMap.enabled && (renderer.shadowMap.autoUpdate || renderer.shadowMap.needsUpdate) && l.length > 0; if (need && log && log.length) log[log.length - 1].shadowRuns++; return origShadow(l, s, c); };
let skelUpdates = 0; const origSk = THREE.Skeleton.prototype.update; THREE.Skeleton.prototype.update = function () { skelUpdates++; return origSk.call(this); };

function configs() {
  const mk = () => new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  const c = {};
  const bloom = () => new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.85);
  const gtao = () => { const p = new GTAOPass(scene, camera, W, H); p.output = GTAOPass.OUTPUT.Default; return p; };
  const bokeh = () => new BokehPass(scene, camera, { focus: 9, aperture: 0.002, maxblur: 0.01 });
  const build = (list) => { const comp = mk(); comp.addPass(new RenderPass(scene, camera)); list.forEach(f => comp.addPass(f())); comp.addPass(new OutputPass()); return comp; };
  c.A_plain = { direct: true };
  c.B_composer_Render_Output = { comp: build([]) };
  c.C_plus_Bloom = { comp: build([bloom]) };
  c.D_plus_GTAO = { comp: build([gtao]) };
  c.E_plus_Bokeh = { comp: build([bokeh]) };
  c.F_Render_GTAO_Bloom_Bokeh_Output = { comp: build([gtao, bloom, bokeh]) };
  c.G_same_as_F_but_shadow_once = { comp: build([gtao, bloom, bokeh]), shadowOnce: true };
  return c;
}
let t0 = 0;
function frame(cfg, k) {
  wiggle(k * 0.1); fish.rotation.y = k * 0.05;
  if (cfg.shadowOnce) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; }
  if (cfg.direct) renderer.render(scene, camera); else cfg.comp.render(1 / 60);
  renderer.shadowMap.autoUpdate = true;
}
R.mode = MODE;
const cfgs = MODE === 'composer' ? configs() : null;
if (MODE === 'composer') {
R.frames = {};
for (const [name, cfg] of Object.entries(cfgs)) {
  frame(cfg, 0); sync();                     // warm up (compile)
  const ms = [];
  for (let k = 1; k <= 4; k++) {
    log = []; skelUpdates = 0; renderer.info.reset();
    const a = performance.now(); frame(cfg, k); sync(); ms.push(performance.now() - a);
  }
  ms.sort((a, b) => a - b);
  R.frames[name] = {
    msMedian: Math.round(ms[1]), msMax: Math.round(ms[3]),
    rendererRenderInvocations: log.length,
    perInvocation: log.map(e => `${e.target}${e.override ? '+override' : ''} calls=${e.calls} tris=${e.tris} shadowRuns=${e.shadowRuns}`),
    shadowMapRuns: log.reduce((a, e) => a + e.shadowRuns, 0),
    sumCalls: log.reduce((a, e) => a + e.calls, 0),
    infoCallsAfterFrame_whatYouSee: renderer.info.render.calls, infoTrianglesAfterFrame: renderer.info.render.triangles,
    skeletonUpdatesPerFrame: skelUpdates,
  };
}
// info.autoReset=false + manual reset around the frame gives the true total
renderer.info.autoReset = false;
const cF = cfgs.F_Render_GTAO_Bloom_Bokeh_Output;
renderer.info.reset(); frame(cF, 9); sync();
R.autoResetFalse_F = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
renderer.info.autoReset = true;

}
if (MODE === 'effects') {
R.A_plain_hdrOutputPath = (() => { frame({ direct: true }, 0); sync(); const ms = []; for (let k = 1; k <= 4; k++) { log = []; const a = performance.now(); frame({ direct: true }, k); sync(); ms.push(performance.now() - a); } ms.sort((a, b) => a - b); return { msMedian: Math.round(ms[1]), perInvocation: log.map(e => `${e.target} calls=${e.calls} tris=${e.tris}`) }; })();
// --- renderer.setEffects path (r186): HDR scene RT with MSAA kept, tone mapping applied last ---
renderer.setEffects([ (() => { const p = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.85); return p; })() ]);
{
  frame({ direct: true }, 0); sync(); const ms = []; for (let k = 1; k <= 4; k++) { log = []; skelUpdates = 0; const a = performance.now(); frame({ direct: true }, k); sync(); ms.push(performance.now() - a); } ms.sort((a, b) => a - b);
  R.setEffects_Bloom = { msMedian: Math.round(ms[1]), perInvocation: log.map(e => `${e.target}${e.override ? '+override' : ''} calls=${e.calls} tris=${e.tris}`), infoCallsAfterFrame: renderer.info.render.calls };
}
{ // GTAO + Bloom + Bokeh through setEffects (same passes; no OutputPass needed)
  const g = new GTAOPass(scene, camera, W, H); g.output = GTAOPass.OUTPUT.Default;
  renderer.setEffects([g, new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.85), new BokehPass(scene, camera, { focus: 9, aperture: 0.002, maxblur: 0.01 })]);
  frame({ direct: true }, 0); sync(); const ms = []; for (let k = 1; k <= 4; k++) { log = []; skelUpdates = 0; const a = performance.now(); frame({ direct: true }, k); sync(); ms.push(performance.now() - a); } ms.sort((a, b) => a - b);
  R.setEffects_GTAO_Bloom_Bokeh = { msMedian: Math.round(ms[1]), invocations: log.length, perInvocation: log.map(e => `${e.target}${e.override ? '+override' : ''} calls=${e.calls} tris=${e.tris} shadowRuns=${e.shadowRuns}`), skeletonUpdates: skelUpdates };
}
}
// final visual: composer F
if (MODE === 'composer') frame(cfgs.F_Render_GTAO_Bloom_Bokeh_Output, 3);
R.glError = gl.getError();
window.__result = R; window.__done = true;
</script>
```

### pages/x4_fog.html

```html
<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { ShaderChunk } from 'three';
const R = {};
const W = 200, H = 150;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.toneMapping = THREE.NoToneMapping;   // output: sRGB canvas, no tone mapping => exact numbers
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
const lin2srgb = c => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const to8 = v => Math.round(Math.min(Math.max(v, 0), 1) * 255);
const px = (x, y) => { const b = new Uint8Array(4); gl.readPixels(x, H - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return Array.from(b.slice(0, 3)); };
const CX = W >> 1, CY = H >> 1;
const base = [0.9, 0.6, 0.3];                       // linear albedo of the unlit quad
const waterLin = [0.02, 0.18, 0.28];                // linear "veiling light" colour of the water
const fogColor = new THREE.Color().setRGB(...waterLin);
function quadAt(d, mat) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), mat); m.position.set(0, 0, -d); return m; }
function shot(scene, d, mesh) { camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1); camera.updateMatrixWorld(); mesh.position.z = -d; renderer.setClearColor(0x000000, 1); renderer.render(scene, camera); return px(CX, CY); }
const mkBasic = () => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...base), toneMapped: false });
const dists = [1, 3, 6, 12];

// ---------- F0: stock FogExp2 ----------
const rho = 0.12;
{
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(fogColor, rho); const mat = mkBasic(); const q = quadAt(1, mat); scene.add(q);
  const out = {};
  for (const d of dists) {
    const f = 1 - Math.exp(-rho * rho * d * d);
    const enc = base.map(lin2srgb), fc = waterLin.map(lin2srgb);
    out[d] = { pixel: shot(scene, d, q), expected_mixInSRGB: enc.map((e, i) => to8(e * (1 - f) + fc[i] * f)), expected_mixInLinearThenEncode: base.map((b, i) => to8(lin2srgb(b * (1 - f) + waterLin[i] * f))), fogFactor: +f.toFixed(4) };
  }
  R.F0_stockFogExp2 = out;
  R.F0_programs = renderer.info.programs.length;
}

// ---------- F0c: the same stock fog rendered into a HalfFloat render target (composer / setEffects path): mixes in LINEAR space ----------
{
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(fogColor, rho); const m = mkBasic(); m.customProgramCacheKey = () => 'stock-rt'; const q = quadAt(1, m); scene.add(q);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }); const out = {};
  for (const d of dists) {
    camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1); camera.updateMatrixWorld(); q.position.z = -d; renderer.setRenderTarget(rt); renderer.setClearColor(0, 1); renderer.render(scene, camera);
    const buf = new Uint16Array(4); renderer.readRenderTargetPixels(rt, CX, CY, 1, 1, buf); renderer.setRenderTarget(null);
    const f = 1 - Math.exp(-rho * rho * d * d);
    out[d] = { linearPixel: Array.from(buf.slice(0, 3)).map(h => +THREE.DataUtils.fromHalfFloat(h).toFixed(4)), expected_mixInLinear: base.map((b, i) => +(b * (1 - f) + waterLin[i] * f).toFixed(4)) };
  }
  R.F0c_stockFog_inRenderTarget = out; rt.dispose();
}
// ---------- F1: replace the ShaderChunk AFTER the first compile -> ignored for the same program key ----------
const SIGMA = [1.0, 0.16, 0.044];                    // per-channel ratio baked into the shader (R absorbed fastest)
ShaderChunk.fog_pars_fragment = ShaderChunk.fog_pars_fragment.replace('#ifdef FOG_EXP2', '#define WATER_ABSORB vec3(1.0, 0.16, 0.044)\n\t#ifdef FOG_EXP2');
ShaderChunk.fog_fragment = `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		vec3 fogT = exp( - fogDensity * WATER_ABSORB * vFogDepth );
		gl_FragColor.rgb = gl_FragColor.rgb * fogT + fogColor * ( 1.0 - fogT );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#endif
#endif
`;
{
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(fogColor, rho); const mat = mkBasic(); const q = quadAt(1, mat); scene.add(q);
  const progBefore = renderer.info.programs.length;
  R.F1a_afterPatch_sameProgramKey = { pixel_d6: shot(scene, 6, q), stockWouldBe: R.F0_stockFogExp2[6].pixel, programsDelta: renderer.info.programs.length - progBefore, note: 'pixel equals stock => patched chunk NOT used: program cache key does not include chunk text' };
  // new program key -> picks the patched chunk
  const mat2 = mkBasic(); mat2.customProgramCacheKey = () => 'water-fog-v1'; const q2 = quadAt(1, mat2); scene.remove(q); scene.add(q2);
  const out = {};
  for (const d of dists) {
    const T = SIGMA.map(s => Math.exp(-rho * s * d)); const enc = base.map(lin2srgb), fc = waterLin.map(lin2srgb);
    out[d] = { pixel: shot(scene, d, q2), expected_mixInSRGB: enc.map((e, i) => to8(e * T[i] + fc[i] * (1 - T[i]))), idealLinear: base.map((b, i) => to8(lin2srgb(b * T[i] + waterLin[i] * (1 - T[i])))), T: T.map(v => +v.toFixed(3)) };
  }
  R.F1b_patchedChunk_newKey = out;
  R.F1_programsTotal = renderer.info.programs.length;
}
// restore stock chunks for F2 (independent of the patched ones)
ShaderChunk.fog_pars_fragment = ShaderChunk.fog_pars_fragment.replace('#define WATER_ABSORB vec3(1.0, 0.16, 0.044)\n\t', '');
ShaderChunk.fog_fragment = `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
// ---------- F2: per-material onBeforeCompile, shared uniforms, radial distance, applied in LINEAR before tone mapping ----------
const uSigma = { value: new THREE.Vector3(0.12, 0.12 * 0.16, 0.12 * 0.044) };   // 1/m, per channel (shared by every patched material)
const uLight = { value: new THREE.Vector3(...waterLin) };                        // linear veiling light
function patchWaterFog(mat) {
  mat.fog = false;                                                              // disable the stock fog (no double fog)
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWaterSigma = uSigma; sh.uniforms.uWaterLight = uLight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWaterPos = mvPosition.xyz;');   // view-space position interpolates exactly; length() is taken per fragment
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;\nuniform vec3 uWaterSigma;\nuniform vec3 uWaterLight;')
      .replace('#include <tonemapping_fragment>', 'vec3 waterT = exp( - uWaterSigma * length( vWaterPos ) );\ngl_FragColor.rgb = gl_FragColor.rgb * waterT + uWaterLight * ( 1.0 - waterT );\n#include <tonemapping_fragment>');
  };
  mat.customProgramCacheKey = () => 'water-fog-v3';
  return mat;
}
{
  const scene = new THREE.Scene(); const mat = patchWaterFog(mkBasic()); const q = quadAt(1, mat); scene.add(q);
  const out = {};
  for (const d of dists) {
    const s = uSigma.value; const T = [s.x, s.y, s.z].map(v => Math.exp(-v * d));
    out[d] = { pixel: shot(scene, d, q), expected_linearBeer: base.map((b, i) => to8(lin2srgb(b * T[i] + waterLin[i] * (1 - T[i])))) };
  }
  R.F2_onBeforeCompile_linear = out;
  const progs = renderer.info.programs.length;
  uSigma.value.set(0.3, 0.3 * 0.16, 0.3 * 0.044);                               // dynamic update, no recompile
  const s = uSigma.value; const T = [s.x, s.y, s.z].map(v => Math.exp(-v * 6));
  R.F2_dynamicUniform_d6 = { pixel: shot(scene, 6, q), expected: base.map((b, i) => to8(lin2srgb(b * T[i] + waterLin[i] * (1 - T[i])))), programsDelta: renderer.info.programs.length - progs };
  uSigma.value.set(0.12, 0.12 * 0.16, 0.12 * 0.044);
  // radial vs planar: pick an off-axis pixel (corner) on a plane at planar depth 10
  const d = 10; const x = 4, y = 4;                                              // near top-left corner
  const ndcX = (x + 0.5) / W * 2 - 1, ndcY = 1 - (y + 0.5) / H * 2; const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const vx = ndcX * tanH * camera.aspect, vy = ndcY * tanH; const radial = d * Math.sqrt(1 + vx * vx + vy * vy);
  camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1); camera.updateMatrixWorld(); q.position.z = -d; renderer.render(scene, camera);
  const sg = uSigma.value; const Tr = [sg.x, sg.y, sg.z].map(v => Math.exp(-v * radial)), Tp = [sg.x, sg.y, sg.z].map(v => Math.exp(-v * d));
  R.F2_radialVsPlanar = { pixel: px(x, y), expectedRadial: base.map((b, i) => to8(lin2srgb(b * Tr[i] + waterLin[i] * (1 - Tr[i])))), expectedPlanar: base.map((b, i) => to8(lin2srgb(b * Tp[i] + waterLin[i] * (1 - Tp[i])))), planarDepth: d, radialDist: +radial.toFixed(3) };
  // same corner with the STOCK vFogDepth (= -mvPosition.z, planar)
  const scene2 = new THREE.Scene(); scene2.fog = new THREE.FogExp2(fogColor, rho); const m2 = mkBasic(); m2.customProgramCacheKey = () => 'stock2'; const q2 = quadAt(d, m2); scene2.add(q2); renderer.render(scene2, camera);
  const f = (dist) => 1 - Math.exp(-rho * rho * dist * dist); const enc = base.map(lin2srgb), fc = waterLin.map(lin2srgb);
  R.F0_stock_corner = { pixel: px(x, y), expectedPlanar: enc.map((e, i) => to8(e * (1 - f(d)) + fc[i] * f(d))), expectedIfRadial: enc.map((e, i) => to8(e * (1 - f(radial)) + fc[i] * f(radial))) };
}
// ---------- F2b: the NAIVE variant (varying float = length(mvPosition.xyz) per vertex) on a big quad ----------
{
  const scene = new THREE.Scene(); const m = mkBasic(); m.fog = false;
  m.onBeforeCompile = (sh) => { sh.uniforms.uWaterSigma = uSigma; sh.uniforms.uWaterLight = uLight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWaterDist;').replace('#include <project_vertex>', '#include <project_vertex>\nvWaterDist = length( mvPosition.xyz );');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWaterDist;\nuniform vec3 uWaterSigma;\nuniform vec3 uWaterLight;').replace('#include <tonemapping_fragment>', 'vec3 waterT = exp( - uWaterSigma * vWaterDist );\ngl_FragColor.rgb = gl_FragColor.rgb * waterT + uWaterLight * ( 1.0 - waterT );\n#include <tonemapping_fragment>'); };
  m.customProgramCacheKey = () => 'naive-radial'; const q = quadAt(6, m); scene.add(q);
  const s = uSigma.value; const T = [s.x, s.y, s.z].map(v => Math.exp(-v * 6));
  R.F2b_naivePerVertexRadial_bigQuad_d6 = { pixel: shot(scene, 6, q), correctWouldBe: base.map((b, i) => to8(lin2srgb(b * T[i] + waterLin[i] * (1 - T[i])))), note: 'quad is 1000x1000: per-vertex length() (~707) is interpolated linearly -> wrong in the middle' };
  // same naive varying but on a finely tessellated plane
}
// ---------- F3: patched material on SkinnedMesh + InstancedMesh compiles and renders (varyings from mvPosition include instancing/skinning) ----------
{
  const scene = new THREE.Scene(); camera.position.set(0, 0, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const mat = patchWaterFog(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })); scene.add(new THREE.AmbientLight(0xffffff, 2));
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 16, 12), mat, 3); [-2, 0, 2].forEach((x, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, -i * 20))); scene.add(im);
  const bones = [new THREE.Bone(), new THREE.Bone()]; bones[1].position.y = 1; bones[0].add(bones[1]);
  const g = new THREE.CylinderGeometry(0.2, 0.2, 2, 8, 4); const p = g.attributes.position, si = [], sw = []; for (let i = 0; i < p.count; i++) { const f = Math.min(Math.max(p.getY(i), 0), 1); si.push(0, 1, 0, 0); sw.push(1 - f, f, 0, 0); }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const sm = new THREE.SkinnedMesh(g, mat); sm.add(bones[0]); sm.bind(new THREE.Skeleton(bones)); sm.position.set(0, 1.5, 0); scene.add(sm);
  renderer.render(scene, camera);
  const err = gl.getError(); R.F3_skinned_instanced_patched = { glError: err, programsForMat: renderer.info.programs.filter(p => p.cacheKey && p.cacheKey.includes('water-fog-v3')).length, centerPixel: px(CX, CY), nearInstancePixel: px(CX - 50, CY + 5) };
}
R.glError = gl.getError();
window.__result = R; window.__done = true;
</script>
```

### pages/x5_caustics.html

```html
<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
const R = {};
const W = 240, H = 240;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 500); ortho.position.set(0, 50, 0); ortho.up.set(0, 0, -1); ortho.lookAt(0, 0, 0); ortho.updateMatrixWorld();
const rowPixels = (y) => { const b = new Uint8Array(W * 4); gl.readPixels(0, H - 1 - y, W, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); const r = []; for (let i = 0; i < W; i++) r.push(b[i * 4]); return r; };
const stats = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return { mean: +m.toFixed(1), min: Math.min(...a), max: Math.max(...a) }; };
const transitions = (a, thr) => { let n = 0; for (let i = 1; i < a.length; i++) if ((a[i - 1] > thr) !== (a[i] > thr)) n++; return n; };

// stripe texture: period 8 texels over 64 (8 stripes across the map), RGBA, alpha = 0 on purpose
function stripeTex(alpha = 255, rgb = [255, 255, 255]) {
  const d = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const on = (x >> 2) & 1; const i = (y * 64 + x) * 4; d[i] = on ? rgb[0] : 0; d[i + 1] = on ? rgb[1] : 0; d[i + 2] = on ? rgb[2] : 0; d[i + 3] = alpha; }
  const t = new THREE.DataTexture(d, 64, 64, THREE.RGBAFormat); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
function makeScene({ map, castShadow, height = 10, angle = 0.5, decay = 0 }) {
  const scene = new THREE.Scene(); const plane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 })); plane.rotation.x = -Math.PI / 2; plane.receiveShadow = true; scene.add(plane);
  const sp = new THREE.SpotLight(0xffffff, 8, 0, angle, 0, decay); sp.position.set(0, height, 0); sp.target.position.set(0, 0, 0); scene.add(sp, sp.target);
  sp.castShadow = castShadow; sp.shadow.mapSize.set(256, 256); if (map) sp.map = map;
  return { scene, sp, plane };
}
const draw = (scene, cam = ortho) => { renderer.setClearColor(0x000000, 1); renderer.render(scene, cam); };

// (a) map without castShadow, (b) with castShadow, (c) no map
{
  const a = makeScene({ map: stripeTex(), castShadow: false }); draw(a.scene); const rowA = rowPixels(H >> 1);
  const b = makeScene({ map: stripeTex(), castShadow: true }); draw(b.scene); const rowB = rowPixels(H >> 1);
  const c = makeScene({ map: null, castShadow: false }); draw(c.scene); const rowC = rowPixels(H >> 1);
  const centre = (r) => r.slice(60, 180);
  R.map_noCastShadow = { ...stats(centre(rowA)), transitions: transitions(centre(rowA), 40) };
  R.map_withCastShadow = { ...stats(centre(rowB)), transitions: transitions(centre(rowB), 40) };
  R.noMap = { ...stats(centre(rowC)), transitions: transitions(centre(rowC), 40) };
  R.doc_says = 'SpotLight.js:111 JSDoc: "disabled if castShadow is false"; WebGLLights.js:375-384 adds the map regardless (light.castShadow only affects numSpotShadowsWithMaps)';
  // (d) texture.offset/repeat/rotation are ignored (lights_fragment_begin.glsl.js:137 samples spotLightMap with raw spotLightCoord.xy)
  const m = stripeTex(); const e = makeScene({ map: m, castShadow: false }); draw(e.scene); const before = rowPixels(H >> 1).slice(60, 180);
  m.offset.set(0.0625, 0); m.repeat.set(2, 2); m.rotation = 0.3; m.center.set(0.5, 0.5); m.updateMatrix(); m.needsUpdate = true; draw(e.scene); const after = rowPixels(H >> 1).slice(60, 180);
  R.map_offsetRepeatRotationIgnored = { identical: before.every((v, i) => v === after[i]) };
  // (e) alpha ignored, RGB multiplies light colour
  const f = makeScene({ map: stripeTex(0, [0, 255, 128]), castShadow: false }); draw(f.scene); const px = new Uint8Array(4); let bestRow = rowPixels(H >> 1);
  const buf = new Uint8Array(W * 4); gl.readPixels(0, H - 1 - (H >> 1), W, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let maxG = 0, maxR = 0; for (let i = 60; i < 180; i++) { maxR = Math.max(maxR, buf[i * 4]); maxG = Math.max(maxG, buf[i * 4 + 1]); }
  R.map_alphaIgnored_rgbMultiplies = { maxR, maxG, note: 'alpha=0 texture still lights (alpha unused); R channel of the map is 0 => red 0' };
  // light cone limit: outside the cone the map has no effect (inSpotLightMap) and the cone cut-off applies
  const g = makeScene({ map: stripeTex(), castShadow: false, angle: 0.3 }); draw(g.scene); const rowG = rowPixels(H >> 1);
  const lit = rowG.map((v, i) => [v, i]).filter(([v]) => v > 20).map(([, i]) => i); R.map_coneExtentPx = lit.length ? [lit[0], lit[lit.length - 1]] : null;
}
// (f) render-target texture as map, updated every frame (GPU-generated animated caustic pattern)
{
  const rt = new THREE.WebGLRenderTarget(128, 128, { type: THREE.HalfFloatType }); rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
  const pat = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: 'varying vec2 vUv; uniform float uTime; void main(){ vec2 p = vUv * 6.2831853 * 3.; float a = sin(p.x + uTime) * sin(p.y - uTime * 0.7) + sin(p.x * 1.7 - uTime * 1.3 + p.y); float c = pow(1.0 - abs(a) * 0.5, 6.0); gl_FragColor = vec4(vec3(c) * 2.0, 1.); }' }));
  const patScene = new THREE.Scene(); patScene.add(pat); const patCam = new THREE.Camera();
  const s = makeScene({ map: rt.texture, castShadow: true });
  const frames = [];
  for (let k = 0; k < 3; k++) {
    pat.material.uniforms.uTime.value = k * 1.0; renderer.setRenderTarget(rt); renderer.render(patScene, patCam); renderer.setRenderTarget(null);
    draw(s.scene); frames.push(rowPixels(H >> 1).slice(60, 180));
  }
  const diff = (a, b) => a.reduce((n, v, i) => n + (Math.abs(v - b[i]) > 10 ? 1 : 0), 0);
  R.rtMap_animated = { stats: stats(frames[0]), pixelsChanged_f0_f1: diff(frames[0], frames[1]), pixelsChanged_f1_f2: diff(frames[1], frames[2]), glError: gl.getError(), note: 'RT.texture (HalfFloat, Repeat) works as SpotLight.map; GPU-animated, no CPU texture upload' };
}
// (g) pseudo-directional sun: far narrow spot with decay 0 => nearly parallel projection; compare stripe pitch on two depths
{
  const far = 300, ang = 0.025; // footprint half width ~ far*tan(ang) = 7.5 at y=0
  const scene = new THREE.Scene();
  const mk = (x0, x1, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 12), new THREE.MeshBasicMaterial()); return m; };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const pA = new THREE.Mesh(new THREE.PlaneGeometry(5, 10), mat); pA.rotation.x = -Math.PI / 2; pA.position.set(-2.5, 0, 0);       // y = 0
  const pB = new THREE.Mesh(new THREE.PlaneGeometry(5, 10), mat); pB.rotation.x = -Math.PI / 2; pB.position.set(2.5, -6, 0);        // y = -6 (deeper)
  const sp = new THREE.SpotLight(0xffffff, 8, 0, ang, 0, 0); sp.position.set(0, far, 0); sp.target.position.set(0, 0, 0); sp.map = stripeTex(); sp.castShadow = true; sp.shadow.mapSize.set(256, 256); sp.shadow.camera.near = 10; sp.shadow.camera.far = 400;
  scene.add(pA, pB, sp, sp.target);
  const cam = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 500); cam.position.set(0, 50, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  draw(scene, cam); const row = rowPixels(H >> 1);
  const edges = (x0, x1) => { const e = []; for (let i = x0 + 1; i < x1; i++) if ((row[i - 1] > 40) !== (row[i] > 40)) e.push(i); return e; };
  const eA = edges(2, 118), eB = edges(124, 238);
  const pitch = e => e.length > 3 ? +((e[e.length - 1] - e[0]) / (e.length - 1)).toFixed(3) : null;
  R.pseudoDirectional = { shallowPlane_y0_edgePitchPx: pitch(eA), deepPlane_y_minus6_edgePitchPx: pitch(eB), edgesA: eA.length, edgesB: eB.length, ratio_deep_over_shallow: pitch(eA) && pitch(eB) ? +(pitch(eB) / pitch(eA)).toFixed(4) : null, expectedRatioPointSource: +((far + 6) / far).toFixed(4) };
  // the same at a near distance for contrast
  const near = 12; sp.position.set(0, near, 0); sp.angle = 0.35; sp.shadow.camera.near = 1; sp.shadow.camera.far = 100; sp.shadow.camera.updateProjectionMatrix(); draw(scene, cam); const row2 = rowPixels(H >> 1);
  const e2 = (x0, x1) => { const e = []; for (let i = x0 + 1; i < x1; i++) if ((row2[i - 1] > 40) !== (row2[i] > 40)) e.push(i); return e; };
  const a2 = e2(2, 118), b2 = e2(124, 238);
  R.nearPointSource = { pitchShallow: pitch(a2), pitchDeep: pitch(b2), ratio: pitch(a2) && pitch(b2) ? +(pitch(b2) / pitch(a2)).toFixed(3) : null, expected: +((near + 6) / near).toFixed(3) };
}
// (h) planar-projected animated caustics via onBeforeCompile on SkinnedMesh + InstancedMesh receivers (no cone limit, any sun direction)
{
  const scene = new THREE.Scene(); scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const tex = (() => { const n = 128, d = new Uint8Array(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = x / n * 6.2831853 * 4, v = y / n * 6.2831853 * 4; const a = Math.sin(u) * Math.sin(v) + Math.sin(u * 1.7 + v); const c = Math.pow(1 - Math.abs(a) * 0.5, 6); const i = (y * n + x) * 4; d[i] = d[i + 1] = d[i + 2] = Math.min(255, c * 255); d[i + 3] = 255; } const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; })();
  const U = { tCaustic: { value: tex }, uTime: { value: 0 }, uScale: { value: 0.35 }, uStrength: { value: 4.0 } };
  const patch = (mat) => { mat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCausticWPos;').replace('#include <project_vertex>', `#include <project_vertex>
      vec4 cw = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        cw = instanceMatrix * cw;
      #endif
      vCausticWPos = ( modelMatrix * cw ).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCausticWPos;\nuniform sampler2D tCaustic; uniform float uTime, uScale, uStrength;')
      .replace('#include <opaque_fragment>', `float cA = texture2D( tCaustic, vCausticWPos.xz * uScale + vec2( uTime * 0.03, uTime * 0.02 ) ).r;
      float cB = texture2D( tCaustic, vCausticWPos.xz * uScale * 1.3 - vec2( uTime * 0.02, -uTime * 0.025 ) ).r;
      outgoingLight += diffuseColor.rgb * uStrength * min( cA, cB ) * clamp( normalize( vWorldNormalDummy ).y, 0.0, 1.0 );
      #include <opaque_fragment>`.replace('vWorldNormalDummy', 'vec3( 0.0, 1.0, 0.0 )')); };
    mat.customProgramCacheKey = () => 'caustic-planar-v1'; return mat; };
  const mat = patch(new THREE.MeshStandardMaterial({ color: 0x889988, roughness: 0.9 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 16, 12), mat, 2); im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-2, 0.6, 0)); im.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2, 0.6, 0)); scene.add(im);
  const bones = [new THREE.Bone(), new THREE.Bone()]; bones[1].position.y = 1; bones[0].add(bones[1]);
  const g = new THREE.CylinderGeometry(0.2, 0.2, 2, 8, 4); const p = g.attributes.position, si = [], sw = []; for (let i = 0; i < p.count; i++) { const f = Math.min(Math.max(p.getY(i), 0), 1); si.push(0, 1, 0, 0); sw.push(1 - f, f, 0, 0); }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const sm = new THREE.SkinnedMesh(g, mat); sm.add(bones[0]); sm.bind(new THREE.Skeleton(bones)); sm.position.set(0, 0.2, 3); sm.rotation.z = Math.PI / 2; scene.add(sm);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100); cam.position.set(0, 8, 7); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const snap = () => { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
  U.uTime.value = 0; draw(scene, cam); const s0 = snap(); const err0 = gl.getError();
  U.uTime.value = 20; draw(scene, cam); const s1 = snap(); let ch = 0, hi = 0; for (let i = 0; i < s0.length; i += 4) { if (Math.abs(s0[i] - s1[i]) > 12) ch++; if (s0[i] > 200) hi++; }
  R.planarCaustics = { glError: err0, pixelsChangedBetweenTimes: ch, brightPixels: hi, of: W * H };
}
R.glError = gl.getError();
window.__result = R; window.__done = true;
</script>
```

### pages/x6_water.html

```html
<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';
import { Water } from 'three/addons/objects/Water.js';
import { Water as Water2 } from 'three/addons/objects/Water2.js';

const R = {};
const W = 320, H = 240;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const px = new Uint8Array(4); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
const readPx = (x, y) => { const b = new Uint8Array(4); gl.readPixels(x, H - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return Array.from(b.slice(0, 3)); };

// instrumentation
let log = [];
const origRender = renderer.render.bind(renderer);
renderer.render = (s, c) => { const e = { depth: 0, shadowRuns: 0 }; log.push(e); const r = origRender(s, c); e.calls = renderer.info.render.calls; e.target = renderer.getRenderTarget() ? 'RT' : 'screen'; return r; };
const origShadow = renderer.shadowMap.render.bind(renderer.shadowMap);
renderer.shadowMap.render = (l, s, c) => { if (renderer.shadowMap.enabled && (renderer.shadowMap.autoUpdate || renderer.shadowMap.needsUpdate) && l.length > 0 && log.length) log[log.length - 1].shadowRuns++; return origShadow(l, s, c); };

const normalTex = (() => { const n = 64, d = new Uint8Array(n * n * 4); for (let i = 0; i < n * n; i++) { d[i * 4] = 128 + (Math.random() * 20 - 10); d[i * 4 + 1] = 128 + (Math.random() * 20 - 10); d[i * 4 + 2] = 255; d[i * 4 + 3] = 255; } const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; })();
function baseScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x5577aa);
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 8, 4); sun.castShadow = true; sun.shadow.mapSize.set(512, 512); scene.add(sun, new THREE.AmbientLight(0xffffff, 0.4));
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshStandardMaterial({ color: 0xcc8844 })); m.position.set(i * 2 - 3, -1.5, -2); m.castShadow = true; scene.add(m); }
  return scene;
}
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
const setCam = (y, z = 8) => { camera.position.set(0, y, z); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); };
function frameLog(scene) { log = []; renderer.render(scene, camera); sync(); return { invocations: log.length, perInvocation: log.map(e => `${e.target} calls=${e.calls} shadowRuns=${e.shadowRuns}`), infoCallsAfterFrame: renderer.info.render.calls, shadowRunsTotal: log.reduce((a, e) => a + e.shadowRuns, 0) }; }
const plane = () => new THREE.PlaneGeometry(20, 20);

// baseline
{ const s = baseScene(); setCam(3); R.baseline = frameLog(s); R.baseline.infoCalls_trueFrame = R.baseline.infoCallsAfterFrame; }
// Reflector (+Y facing mirror)
{
  const s = baseScene(); const refl = new Reflector(plane(), { textureWidth: 256, textureHeight: 256, clipBias: 0.003, multisample: 4 }); refl.rotation.x = -Math.PI / 2; s.add(refl);
  setCam(3); R.reflector_cameraAbove = frameLog(s);
  setCam(-3); R.reflector_cameraBelow_facingAway = frameLog(s);
  refl.rotation.x = Math.PI / 2; setCam(-3); R.reflector_flipped_cameraBelow = frameLog(s);   // underside mirror: rotate the mesh so its normal points down
  R.reflector_rtFormat = { type: refl.getRenderTarget().texture.type === THREE.HalfFloatType ? 'HalfFloat' : refl.getRenderTarget().texture.type, samples: refl.getRenderTarget().samples };
}
// Water (old Water.js: mirror only, WebGLRenderer)
{
  const s = baseScene(); const wtr = new Water(plane(), { textureWidth: 256, textureHeight: 256, waterNormals: normalTex, sunDirection: new THREE.Vector3(0.7, 0.7, 0), sunColor: 0xffffff, waterColor: 0x001e0f, distortionScale: 3.7, fog: false }); wtr.rotation.x = -Math.PI / 2; s.add(wtr);
  setCam(3); R.water_Water = frameLog(s);
}
// Water2 (Reflector + Refractor: 2 extra scene renders)
{
  const s = baseScene(); const w2 = new Water2(plane(), { color: 0xaaddff, scale: 4, flowDirection: new THREE.Vector2(1, 1), textureWidth: 256, textureHeight: 256, normalMap0: normalTex, normalMap1: normalTex }); w2.rotation.x = -Math.PI / 2; s.add(w2);
  setCam(3); R.water_Water2 = frameLog(s);
}
// Refractor alone
{
  const s = baseScene(); const rf = new Refractor(plane(), { textureWidth: 256, textureHeight: 256, color: 0xaaaaaa }); rf.rotation.x = -Math.PI / 2; s.add(rf);
  setCam(3); R.refractor_cameraAbove = frameLog(s); setCam(-3); R.refractor_cameraBelow = frameLog(s);
}
// LOD x Reflector: LOD.update() is re-run with the reflection camera inside the nested render
{
  const s = baseScene(); const refl = new Reflector(new THREE.PlaneGeometry(6, 6), { textureWidth: 128, textureHeight: 128, multisample: 0 }); refl.rotation.y = -Math.PI / 2; refl.position.set(5, 0, 0); s.add(refl);   // vertical mirror at x=5, normal -x
  const red = new THREE.MeshBasicMaterial({ color: 0xff0000 }), green = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const lod = new THREE.LOD(); lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), red), 0); lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), green), 12); lod.position.set(0, 0, 0); s.add(lod);
  camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const dMain = camera.position.distanceTo(lod.position); const mirrored = new THREE.Vector3(10, 0, 10); const dMirror = mirrored.distanceTo(lod.position);
  log = []; renderer.render(s, camera); sync();
  R.lod_x_reflector = { invocations: log.length, distanceMainCamera: +dMain.toFixed(1), distanceMirrorCamera: +dMirror.toFixed(1), thresholdLevel1: 12, levelAfterFrame_getCurrentLevel: lod.getCurrentLevel(), visibleFlagsAfterFrame: lod.levels.map(l => +l.object.visible).join(''), mainCameraWouldPick: dMain >= 12 ? 1 : 0, mirrorCameraWouldPick: dMirror >= 12 ? 1 : 0, centerPixelOfMainFrame: readPx(W >> 1, H >> 1), note: 'red=level0, green=level1' };
  renderer.render(s, camera); R.lod_x_reflector.afterSecondFrame = { level: lod.getCurrentLevel(), centerPixel: readPx(W >> 1, H >> 1) };
}
R.glError = gl.getError();
window.__result = R; window.__done = true;
</script>
```

### pages/x7_misc.html

```html
<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const R = {};
const W = 320, H = 240;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const px = new Uint8Array(4); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
const lit = () => { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); let n = 0; for (let i = 0; i < b.length; i += 4) if (b[i] > 150 && b[i + 1] < 120) n++; return n; };

// ---------- 1. SkinnedMesh frustum culling uses a bounding sphere computed ONCE from the bind pose ----------
function skinnedTube(vertsAlong, radial, nBones = 24) {
  const len = 4, geo = new THREE.CylinderGeometry(0.3, 0.1, len, radial, vertsAlong);
  const pos = geo.attributes.position, si = [], sw = [];
  for (let i = 0; i < pos.count; i++) { const s = (pos.getY(i) + len / 2) / len * (nBones - 1); const i0 = Math.min(Math.floor(s), nBones - 2), f = s - i0; si.push(i0, i0 + 1, 0, 0); sw.push(1 - f, f, 0, 0); }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2200 }));
  const bones = []; for (let i = 0; i < nBones; i++) { const b = new THREE.Bone(); b.position.y = i === 0 ? -len / 2 : len / (nBones - 1); if (i) bones[i - 1].add(b); bones.push(b); }
  mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones)); return { mesh, bones, geo };
}
{
  const scene = new THREE.Scene(); const { mesh, bones } = skinnedTube(60, 12); scene.add(mesh);
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 100); cam.position.set(0, 0, 12); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  renderer.setClearColor(0, 1); renderer.render(scene, cam); sync(); const a = { calls: renderer.info.render.calls, litPixels: lit(), r: +mesh.boundingSphere.radius.toFixed(2) };
  // swim the whole body 20 units to the left by moving the root bone (not the mesh): body is in view only if the camera follows
  bones[0].position.x += 20; cam.position.x = 20; cam.lookAt(20, 0, 0); cam.updateMatrixWorld();
  renderer.render(scene, cam); sync(); const b = { calls: renderer.info.render.calls, litPixels: lit() };
  mesh.frustumCulled = false; renderer.render(scene, cam); sync(); const c = { calls: renderer.info.render.calls, litPixels: lit() };
  mesh.frustumCulled = true; mesh.computeBoundingSphere(); renderer.render(scene, cam); sync(); const d = { calls: renderer.info.render.calls, litPixels: lit(), r: +mesh.boundingSphere.radius.toFixed(2), center: mesh.boundingSphere.center.toArray().map(v => +v.toFixed(1)) };
  R.skinnedCulling = { bindPoseOk: a, rootBoneMoved_cached_sphere_culls_visible_body: b, frustumCulledFalse: c, afterComputeBoundingSphere: d };
  // cost of SkinnedMesh.computeBoundingSphere() (CPU skinning of every vertex)
  const cost = {};
  for (const [name, segs, radial] of [['~2k verts', 40, 40], ['~10k verts', 100, 100], ['~50k verts', 250, 200]]) {
    const t = skinnedTube(segs, radial); t.mesh.updateMatrixWorld(true); t.mesh.skeleton.update(); const n = t.geo.attributes.position.count;
    const t0 = performance.now(); const reps = 5; for (let k = 0; k < reps; k++) t.mesh.computeBoundingSphere(); cost[name] = { vertices: n, msPerCall: +((performance.now() - t0) / reps).toFixed(2) };
  }
  R.skinnedBoundingSphereCostMs = cost;
  // manual sphere: set once, conservative (covers the full swim envelope), no per-frame cost
  const m2 = skinnedTube(20, 8); m2.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 3.0); const sc = new THREE.Scene(); sc.add(m2.mesh); m2.bones[0].position.x += 2.5;
  const cam2 = new THREE.PerspectiveCamera(50, W / H, 0.1, 100); cam2.position.set(2.5, 0, 12); cam2.lookAt(2.5, 0, 0); cam2.updateMatrixWorld(); renderer.render(sc, cam2); sync();
  R.manualBoundingSphere = { calls: renderer.info.render.calls, litPixels: lit(), note: 'sphere stays (0,0,0,r=3): body displaced by 2.5 stays inside, no recompute' };
}

// ---------- 2. G-buffer passes re-trigger nested mirror renders; two-camera layer trick removes them ----------
{
  const run = async (useLayerTrick) => {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x335577);
    scene.add(new THREE.AmbientLight(0xffffff, 1)); const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(2, 5, 3); scene.add(dl);
    const fish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshStandardMaterial({ color: 0xdd8844 })); fish.position.set(0, 1, 0); scene.add(fish);
    const water = new Reflector(new THREE.PlaneGeometry(20, 20), { textureWidth: 128, textureHeight: 128, multisample: 0 }); water.rotation.x = -Math.PI / 2; scene.add(water);
    const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 100); cam.position.set(0, 3, 8); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const aoCam = cam.clone();
    if (useLayerTrick) { water.layers.set(1); cam.layers.enable(1); aoCam.layers.set(0); }   // water on layer 1: main camera sees layers 0+1, AO camera only layer 0
    const comp = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }));
    comp.addPass(new RenderPass(scene, cam)); const gtao = new GTAOPass(scene, useLayerTrick ? aoCam : cam, W, H); comp.addPass(gtao); comp.addPass(new OutputPass());
    let n = 0, nested = 0, depthNow = 0, maxDepth = 0; const orig = renderer.render.bind(renderer);
    renderer.render = (s, c) => { n++; depthNow++; maxDepth = Math.max(maxDepth, depthNow); if (depthNow > 1) nested++; const r = orig(s, c); depthNow--; return r; };
    if (useLayerTrick) { aoCam.position.copy(cam.position); aoCam.quaternion.copy(cam.quaternion); aoCam.updateMatrixWorld(); }
    comp.render(1 / 60); n = 0; nested = 0;                      // measure the second frame (programs compiled)
    comp.render(1 / 60); sync();
    renderer.render = orig; comp.dispose && comp.dispose();
    return { rendererRenderInvocations: n, nestedMirrorRenders: nested };
  };
  R.gtao_with_reflector_default = await run(false);
  R.gtao_with_reflector_layerTrick = await run(true);
}

// ---------- 3. reversedDepthBuffer option (r186) sanity ----------
{
  const c = document.createElement('canvas'); document.body.appendChild(c);
  const r2 = new THREE.WebGLRenderer({ canvas: c, reversedDepthBuffer: true, antialias: false }); r2.setSize(64, 64);
  const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00 })));
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100000); cam.position.set(0, 0, 3); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  r2.render(s, cam); const g2 = r2.getContext(); const b = new Uint8Array(4); g2.readPixels(32, 32, 1, 1, g2.RGBA, g2.UNSIGNED_BYTE, b);
  R.reversedDepth = { capabilityFlag: r2.capabilities.reversedDepthBuffer, centerPixel: Array.from(b.slice(0, 3)), glError: g2.getError(), cameraReversedDepth: cam.reversedDepth };
}

// ---------- 4. shared-skeleton LOD: both levels bend identically (silhouette bbox compare) ----------
{
  const hi = skinnedTube(48, 24, 12); const lo = skinnedTube(12, 8, 12);
  // rebind lo to hi's skeleton with hi's bindMatrix (do NOT call bind(skeleton) without a matrix: it would recompute boneInverses)
  lo.mesh.remove(lo.bones[0]); lo.mesh.bind(hi.mesh.skeleton, hi.mesh.bindMatrix);
  const lod = new THREE.LOD(); lod.addLevel(hi.mesh, 0); lod.addLevel(lo.mesh, 100); lod.autoUpdate = false; hi.mesh.add(hi.bones[0]);
  const scene = new THREE.Scene(); scene.add(lod);
  hi.bones.forEach((b, i) => { if (i) b.rotation.z = 0.18; });   // C-shaped bend over 11 joints
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 100); cam.position.set(0, 0, 9); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const bbox = () => { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (b[i] > 150 && b[i + 1] < 120) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } } return { n, x0, x1, y0, y1 }; };
  hi.mesh.visible = true; lo.mesh.visible = false; renderer.setClearColor(0, 1); renderer.render(scene, cam); sync(); const A = bbox();
  hi.mesh.visible = false; lo.mesh.visible = true; renderer.render(scene, cam); sync(); const B = bbox();
  R.sharedSkeletonLod = { hi: A, lo: B, sameSkeleton: hi.mesh.skeleton === lo.mesh.skeleton, tris: [hi.geo.index.count / 3, lo.geo.index.count / 3] };
}
R.glError = gl.getError();
window.__result = R; window.__done = true;
</script>
```
