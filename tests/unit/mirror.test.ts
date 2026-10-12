import { describe, expect, it } from 'vitest';
import {
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { MirrorView } from '../../src/render/Mirror';
import { Terrain } from '../../src/world/Terrain';
import { WaterPass } from '../../src/world/Water';
import { createWaves } from '../../src/world/Waves';
import { surfUniforms } from '../../src/world/Surf';

function rendererMock() {
  const initialTarget = new WebGLRenderTarget(1, 1),
    cameras: PerspectiveCamera[] = [],
    shadowMap = { autoUpdate: true };
  let target: WebGLRenderTarget | null = initialTarget;
  const gl = {
    shadowMap,
    info: { render: { calls: 1, triangles: 12 } },
    getDrawingBufferSize: (size: Vector2) => size.set(800, 600),
    getRenderTarget: () => target,
    setRenderTarget: (next: WebGLRenderTarget | null) => (target = next),
    clear: () => {},
    render: (_scene: Scene, camera: PerspectiveCamera) => cameras.push(camera.clone()),
  } as unknown as WebGLRenderer;
  return { gl, cameras, initialTarget, shadowMap };
}

function cameraAt(y: number, level = 0): PerspectiveCamera {
  const camera = new PerspectiveCamera(60, 4 / 3, 0.05, 180);
  camera.position.set(2, y, 6);
  camera.lookAt(0, level, 0);
  camera.updateMatrixWorld();
  return camera;
}

function clipPoint(point: Vector3, camera: PerspectiveCamera): Vector4 {
  return new Vector4(point.x, point.y, point.z, 1)
    .applyMatrix4(camera.matrixWorldInverse)
    .applyMatrix4(camera.projectionMatrix);
}

describe('water reflection camera', () => {
  it.each([false, true])('clips the opposite side of a nonzero tide plane (below=%s)', (below) => {
    const level = 1.25,
      side = below ? -1 : 1,
      camera = cameraAt(level + side * 2, level),
      mirror = new MirrorView(0.5),
      renderer = rendererMock();
    try {
      mirror.render(renderer.gl, new Scene(), camera, level, below);
      expect(mirror.valid).toBe(true);
      expect(renderer.cameras).toHaveLength(1);
      const reflected = renderer.cameras[0],
        retained = clipPoint(new Vector3(0, level + side, -2), reflected),
        rejected = clipPoint(new Vector3(0, level - side, -2), reflected);
      expect(reflected.position.y).toBeCloseTo(level - side * 2, 10);
      expect(retained.w).toBeGreaterThan(0);
      expect(retained.z).toBeGreaterThanOrEqual(-retained.w);
      expect(retained.z).toBeLessThanOrEqual(retained.w);
      expect(rejected.z).toBeLessThan(-rejected.w);
      expect(mirror.target.width).toBe(400);
      expect(mirror.target.height).toBe(300);
      if (below) expect(mirror.target.depthTexture).not.toBeNull();
      else expect(mirror.target.depthTexture).toBeNull();
      expect(renderer.gl.getRenderTarget()).toBe(renderer.initialTarget);
      expect(renderer.shadowMap.autoUpdate).toBe(true);
    } finally {
      mirror.dispose();
      renderer.initialTarget.dispose();
    }
  });

  it('reconstructs submerged hits from the rendered oblique depth without counting the first ray leg twice', () => {
    const level = 0.65,
      camera = cameraAt(level - 2, level),
      mirror = new MirrorView(0.5),
      renderer = rendererMock();
    try {
      mirror.render(renderer.gl, new Scene(), camera, level, true);
      const reflected = renderer.cameras[0],
        hit = new Vector3(0, level - 1, -2),
        clip = clipPoint(hit, reflected),
        uvDepth = new Vector4(
          0.5 + (clip.x / clip.w) * 0.5,
          0.5 + (clip.y / clip.w) * 0.5,
          0.5 + (clip.z / clip.w) * 0.5,
          1,
        );
      for (const value of [uvDepth.x, uvDepth.y, uvDepth.z]) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThan(1);
      }
      const reconstructed = uvDepth.applyMatrix4(mirror.textureMatrixInverse);
      reconstructed.divideScalar(reconstructed.w);
      const worldHit = new Vector3(reconstructed.x, reconstructed.y, reconstructed.z);
      expect(worldHit.distanceTo(hit)).toBeLessThan(1e-8);

      const t = (level - reflected.position.y) / (hit.y - reflected.position.y),
        surface = reflected.position.clone().lerp(hit, t),
        firstLeg = camera.position.distanceTo(surface),
        reflectedLeg = worldHit.distanceTo(surface),
        unfoldedDistance = reflected.position.distanceTo(hit);
      expect(firstLeg).toBeGreaterThan(0);
      expect(reflectedLeg).toBeGreaterThan(0);
      expect(firstLeg + reflectedLeg).toBeCloseTo(unfoldedDistance, 9);
    } finally {
      mirror.dispose();
      renderer.initialTarget.dispose();
    }
  });

  it('invalidates a previous reflection when disabled, below the legacy surface, or inside the waterline margin', () => {
    const mirror = new MirrorView(0.5),
      renderer = rendererMock(),
      scene = new Scene();
    try {
      mirror.render(renderer.gl, scene, cameraAt(2), 0);
      expect(mirror.valid).toBe(true);
      mirror.scale = 0;
      mirror.render(renderer.gl, scene, cameraAt(2), 0);
      expect(mirror.valid).toBe(false);
      mirror.scale = 0.5;
      for (const [y, below] of [
        [-2, false],
        [0.01, false],
        [-0.01, true],
        [2, true],
      ] as const) {
        mirror.render(renderer.gl, scene, cameraAt(y), 0, below);
        expect(mirror.valid).toBe(false);
      }
      expect(renderer.cameras).toHaveLength(1);
    } finally {
      mirror.dispose();
      renderer.initialTarget.dispose();
    }
  });

  it('skips downward underwater views but renders when any part of the frustum can see the surface', () => {
    const mirror = new MirrorView(0.5),
      renderer = rendererMock(),
      scene = new Scene(),
      camera = new PerspectiveCamera(60, 4 / 3, 0.05, 180);
    camera.position.set(0, -2, 0);
    const aim = (y: number, z: number): void => {
      camera.lookAt(0, y, z);
      camera.updateMatrixWorld();
      mirror.render(renderer.gl, scene, camera, 0, true);
    };
    try {
      aim(-8, -2);
      expect(mirror.valid).toBe(false);
      expect(renderer.cameras).toHaveLength(0);
      expect(mirror.target.depthTexture).toBeNull();
      expect(mirror.target.samples).toBe(0);

      // The centre ray points down, but the top of the frame still crosses the water plane.
      aim(-2.3, -6);
      expect(mirror.valid).toBe(true);
      expect(renderer.cameras).toHaveLength(1);
      expect(mirror.target.depthTexture).not.toBeNull();
      expect(mirror.target.samples).toBe(4);

      aim(1, -6);
      expect(mirror.valid).toBe(true);
      expect(renderer.cameras).toHaveLength(2);

      aim(-8, -2);
      expect(mirror.valid).toBe(false);
      expect(renderer.cameras).toHaveLength(2);
      expect(mirror.stats).toEqual({ calls: 0, triangles: 0 });
    } finally {
      mirror.dispose();
      renderer.initialTarget.dispose();
    }
  });

  it('opts clear-water maps into underwater reflection while preserving estuary and quality gates', () => {
    const n = 3,
      terrain = new Terrain(
        { n, size: 4, heights: new Float32Array(n * n).fill(-3), substrate: new Uint8Array(n * n) },
        ['sand'],
      ),
      water = new WaterPass(terrain, createWaves(), surfUniforms(null)),
      renderer = rendererMock(),
      camera = cameraAt(-1),
      scene = new Scene();
    try {
      water.setMirror(0.5);
      water.prepare(renderer.gl, scene, camera);
      expect(water.uniforms.uMirrorOn.value).toBe(0);
      expect(renderer.cameras).toHaveLength(0);

      water.setBody(0.018, 0.105, 0.16, 0.025, { absorption: [0.1, 0.025, 0.012] });
      water.prepare(renderer.gl, scene, camera);
      expect(water.uniforms.uMirrorOn.value).toBe(1);
      expect(renderer.cameras).toHaveLength(1);
      expect(water.uniforms.tMirrorDepth.value).not.toBeNull();

      water.mirrorGate = () => false;
      water.prepare(renderer.gl, scene, camera);
      expect(water.uniforms.uMirrorOn.value).toBe(0);
      water.mirrorGate = () => true;
      water.setBody(0.16, 0.172, 0.14, 1);
      water.prepare(renderer.gl, scene, camera);
      expect(water.uniforms.uMirrorOn.value).toBe(0);
      water.setBody(0.018, 0.105, 0.16, 0.025, { absorption: [0.1, 0.025, 0.012] });
      water.setMirror(0);
      expect(water.uniforms.tMirror.value).toBeNull();
      expect(water.uniforms.tMirrorDepth.value).toBeNull();
      water.prepare(renderer.gl, scene, camera);
      expect(renderer.cameras).toHaveLength(1);
    } finally {
      water.dispose();
      terrain.dispose();
      renderer.initialTarget.dispose();
    }
  });
});
