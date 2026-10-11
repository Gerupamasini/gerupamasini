import { BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Vector3 } from 'three';

/** One draw per emitter, 48 points; no per-bubble meshes or allocations in update. */
export class BubbleEmitter extends Points<BufferGeometry, ShaderMaterial> {
  constructor() {
    const count = 48, seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { seeds[i * 3] = (i * 0.6180339) % 1; seeds[i * 3 + 1] = (i * 0.7548776) % 1; seeds[i * 3 + 2] = (i * 0.5698403) % 1; }
    super(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(seeds, 3)), new ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, water: { value: 0.3 }, source: { value: new Vector3() }, current: { value: new Vector3() }, viewportHeight: { value: 720 } },
      vertexShader: `uniform float time, water, viewportHeight; uniform vec3 source, current; varying float age;
      void main() { float height = max(water - source.y, 0.01); age = fract(position.x + time * (0.105 + position.y * 0.07) / height);
        vec3 p = source + vec3((position.y - 0.5) * 0.013 + sin(age * 12.0 + position.z * 30.0) * 0.002, age * height, (position.z - 0.5) * 0.008);
        p += current * age * height * 0.4;
        vec4 v = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * v;
        gl_PointSize = clamp(viewportHeight * projectionMatrix[1][1] * 0.0012 / max(-v.z, 0.01), 1.0, 12.0); }`,
      fragmentShader: `varying float age; void main() { vec2 p = gl_PointCoord - 0.5; float r = length(p); if (r > 0.5) discard;
        float rim = smoothstep(0.28, 0.42, r) * (1.0 - smoothstep(0.42, 0.5, r));
        float shine = exp(-120.0 * dot(p - vec2(-0.16, -0.15), p - vec2(-0.16, -0.15)));
        gl_FragColor = vec4(vec3(0.76, 0.9, 1.0), (rim * 0.35 + shine * 0.8) * smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.9, 1.0, age))); }`,
    }));
    this.frustumCulled = false; this.renderOrder = 2;
  }
  update(time: number, source: Vector3, water: number, viewportHeight: number, current = new Vector3()): void {
    this.material.uniforms.time.value = time; this.material.uniforms.source.value.copy(source); this.material.uniforms.water.value = water; this.material.uniforms.viewportHeight.value = viewportHeight; this.material.uniforms.current.value.copy(current);
  }
  override dispose(): void { this.geometry.dispose(); this.material.dispose(); this.removeFromParent(); }
}
