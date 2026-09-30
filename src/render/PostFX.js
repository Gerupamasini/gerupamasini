// Post-processing: MSAA HDR scene target (+ resolved depth) -> depth of field
// -> subtle bloom (scale glints, LED, bubbles) -> lens (chromatic aberration,
// vignette, grain) -> tone mapping + sRGB output.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DOFPass, LensPass } from './LensPasses.js';

export class PostFX {
  constructor(renderer, scene, camera, { samples = 4 } = {}) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
    rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.dof = new DOFPass(camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.14, 0.4, 1.05);
    this.lens = new LensPass();
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.dof);
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
  }
  render(dt) {
    this.composer.render(dt);
  }
}
