import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial, type IUniform, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { OsaganiLookLike } from './model';

/**
 * The untextured clay of the shape stage: one grey for the whole animal, so that the comparison with the photographs
 * is of the form alone (outline, teeth, eyestalks, legs, claws). The setae are left out; the abdomen is the sex's and
 * the chela the individual's form (the mature male's or the female's).
 */
export class ClayLook implements OsaganiLookLike {
  readonly uSex: IUniform<number>;
  readonly uMaleChela: IUniform<number>;
  private readonly shell: MeshStandardMaterial;
  readonly setae: Material;

  constructor(sex: 0 | 1 = 0, maleChela = sex === 0, color = 0xb9b3a9) {
    this.uSex = { value: sex };
    this.uMaleChela = { value: maleChela ? 1 : 0 };
    const m = new MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 });
    m.name = 'OsaganiClay';
    m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
      s.uniforms.uSex = this.uSex;
      s.uniforms.uMaleChela = this.uMaleChela;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aAux;\nuniform float uSex;\nuniform float uMaleChela;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  // the other sex's abdomen and the other form's chela fold away to nothing
  float fl = aAux.y;
  if ((fl > 0.5 && fl < 2.5 && abs(fl - (uSex + 1.0)) > 0.5) || (fl > 4.5 && fl < 6.5 && abs(fl - (6.0 - uMaleChela)) > 0.5)) transformed = vec3(0.0);`);
    };
    m.customProgramCacheKey = () => 'osagani-clay-v1';
    this.shell = m;
    this.setae = new MeshBasicMaterial({ color: 0x2a2620, side: DoubleSide, visible: false });
  }

  shellFor(): Material { return this.shell; }

  dispose(): void { this.shell.dispose(); this.setae.dispose(); }
}
