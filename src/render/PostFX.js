// Post-processing: MSAA HDR scene target (+ resolved depth) without the
// translucent fins, which go to their own layer (see FinLayer.js) -> depth of
// field -> fin layer blurred by its own depth and composited -> subtle bloom
// (scale glints, LED, bubbles) -> lens (chromatic aberration, vignette,
// grain) -> tone mapping + sRGB output.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DOFPass, LensPass } from './LensPasses.js';
import { SceneLayersPass, FinCompositePass } from './FinLayer.js';
import { FIN_LAYER } from './SharedUniforms.js';

export class PostFX {
  constructor(renderer, scene, camera, { samples = 4 } = {}) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
    rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new SceneLayersPass(scene, camera, FIN_LAYER, samples);
    this.dof = new DOFPass(camera);
    this.fins = new FinCompositePass(this.renderPass, this.dof);
    // lens veiling glare only for genuinely bright highlights (LED, specular
    // sparkles), never for lit skin or fins, however white
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.04, 0.2, 4.5);
    this.lens = new LensPass();
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.dof);
    this.composer.addPass(this.fins);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.lens);
    this.composer.addPass(this.output);
    this.enabled = true;
  }
  setSize(w, h) {
    this.composer.setSize(w, h);
  }
  setPixelRatio(r) {
    this.composer.setPixelRatio(r);
  }
  setSamples(n) {
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (t.samples !== n) {
        t.samples = n;
        t.dispose();
      }
    }
    this.renderPass.setSamples(n);
  }
  render(dt) {
    this.composer.render(dt);
  }
}
