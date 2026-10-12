import { describe, expect, it } from 'vitest';
import type { MeshStandardMaterial } from 'three';
import { CoralKit } from '../../src/world/coral/kit';
import { createWaves } from '../../src/world/Waves';
import { coralSurfaceAtlas } from '../../src/world/coral/surface-textures';

function compiledUniforms(material: MeshStandardMaterial) {
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <lights_fragment_end>',
  } as Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as Parameters<MeshStandardMaterial['onBeforeCompile']>[1]);
  return shader.uniforms;
}

describe('coral surface lighting', () => {
  it('keeps already compiled sunlight caustics in sync when water waves are edited or replaced', () => {
    const kit = new CoralKit();
    const first = createWaves({ seed: 5 });
    kit.setWaves(first);
    const uniforms = compiledUniforms(kit.material('montipora_foliosa', 1));
    const gainBinding = uniforms.uWaveGain;
    expect(uniforms.uWaveA.value).toBe(first.uniforms.uWaveA.value);
    expect(uniforms.uWaveB.value).toBe(first.uniforms.uWaveB.value);
    first.uniforms.uWaveGain.value = 0.37;
    expect(gainBinding.value).toBe(0.37);

    const second = createWaves({ seed: 61 });
    kit.setWaves(second);
    expect(uniforms.uWaveGain).toBe(gainBinding);
    second.uniforms.uWaveGain.value = 0.82;
    second.uniforms.uWaveA.value = second.uniforms.uWaveA.value.slice();
    expect(gainBinding.value).toBe(0.82);
    expect(uniforms.uWaveA.value).toBe(second.uniforms.uWaveA.value);
    expect(uniforms.uWaveB.value).toBe(second.uniforms.uWaveB.value);
    expect(first.uniforms.uWaveGain.value).toBe(0.37);
    kit.dispose();
  });

  it('keeps wave arrays and close-up surface textures out of distant material bindings', () => {
    const kit = new CoralKit();
    const material = kit.material('platygyra_daedalea', 2);
    const uniforms = compiledUniforms(material);
    expect(material.defines?.CORAL_DETAIL).toBe(0);
    expect(uniforms.uWaveA).toBeUndefined();
    expect(uniforms.uWaveB).toBeUndefined();
    expect(uniforms.uWaveGain).toBeUndefined();
    expect(uniforms.uCoralSurface).toBeUndefined();
    kit.dispose();
  });
  it('preserves linear 16-bit relief when filtering the surface atlas to coarser mips', () => {
    const atlas = coralSurfaceAtlas('montipora_foliosa');
    const levels = atlas.texture.mipmaps as Array<{ data: Uint8Array; width: number; height: number }>;
    expect(levels.at(-1)?.width).toBe(1);
    const heightAt = (data: Uint8Array, i: number) => data[i] * 256 + data[i + 1];
    for (let level = 1; level < levels.length; level++) {
      const prior = levels[level - 1],
        current = levels[level];
      // Include all four corners and an interior sample, across every scale used by a distant camera.
      for (const [x, y] of [
        [0, 0],
        [current.width - 1, 0],
        [0, current.height - 1],
        [current.width - 1, current.height - 1],
        [Math.floor(current.width / 2), Math.floor(current.height / 2)],
      ]) {
        const source = (y * 2 * prior.width + x * 2) * 4;
        const mean =
          (heightAt(prior.data, source) +
            heightAt(prior.data, source + 4) +
            heightAt(prior.data, source + prior.width * 4) +
            heightAt(prior.data, source + prior.width * 4 + 4)) /
          4;
        expect(Math.abs(heightAt(current.data, (y * current.width + x) * 4) - mean)).toBeLessThanOrEqual(0.5);
      }
    }
    expect(atlas.texture.generateMipmaps).toBe(false);
  });
});
