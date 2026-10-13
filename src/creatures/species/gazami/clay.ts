import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial, type IUniform, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { GazamiLookLike } from './model';

/**
 * The untextured clay of the shape stage: one grey for the whole animal, so that the comparison with the photographs
 * is of the form alone (outline, teeth, legs, claws, paddles). The setae are left out; the abdomen is the sex's.
 */
export class ClayLook implements GazamiLookLike {
  readonly uSex: IUniform<number>;
  private readonly shell: MeshStandardMaterial;
  readonly setae: Material;

  constructor(sex: 0 | 1 = 0, color = 0xb9b3a9) {
    this.uSex = { value: sex };
    const m = new MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 });
    m.name = 'GazamiClay';
    m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
      s.uniforms.uSex = this.uSex;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aAux;\nattribute float aPart;\nuniform float uSex;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  // the other sex's abdomen folds away to nothing
  if (aPart > 1.5 && aPart < 2.5 && aAux.y > 0.5 && aAux.y < 2.5 && abs(aAux.y - (uSex + 1.0)) > 0.5) transformed = vec3(0.0);`);
    };
    m.customProgramCacheKey = () => 'gazami-clay-v2';
    this.shell = m;
    this.setae = new MeshBasicMaterial({ color: 0x2a2620, side: DoubleSide, visible: false });
  }

  shellFor(): Material { return this.shell; }

  dispose(): void { this.shell.dispose(); this.setae.dispose(); }
}
