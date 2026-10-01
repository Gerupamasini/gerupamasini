// Small glTF 2.0 binary (GLB) writer.

const COMPONENT = {
  Int8Array: 5120,
  Float32Array: 5126,
  Uint32Array: 5125,
  Uint16Array: 5123,
  Uint8Array: 5121,
};
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export class GLBBuilder {
  constructor(generator = 'mahaze-procedural-builder') {
    this.json = {
      asset: { version: '2.0', generator },
      extensionsUsed: [],
      scene: 0,
      scenes: [],
      nodes: [],
      meshes: [],
      materials: [],
      textures: [],
      images: [],
      samplers: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
    };
    this.parts = [];
    this.byteLength = 0;
  }

  useExtension(name) {
    if (!this.json.extensionsUsed.includes(name)) this.json.extensionsUsed.push(name);
  }

  addBufferView(buffer, target, byteStride) {
    const pad = (4 - (this.byteLength % 4)) % 4;
    if (pad) {
      this.parts.push(Buffer.alloc(pad));
      this.byteLength += pad;
    }
    const view = { buffer: 0, byteOffset: this.byteLength, byteLength: buffer.length };
    if (target) view.target = target;
    if (byteStride) view.byteStride = byteStride;
    this.parts.push(buffer);
    this.byteLength += buffer.length;
    this.json.bufferViews.push(view);
    return this.json.bufferViews.length - 1;
  }

  addAccessor(array, type, { target, minMax = false, normalized = false, byteStride, count } = {}) {
    const buf = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const bufferView = this.addBufferView(buf, target, byteStride);
    const nc = NUM_COMPONENTS[type];
    const acc = {
      bufferView,
      componentType: COMPONENT[array.constructor.name],
      count: count ?? array.length / nc,
      type,
    };
    if (normalized) acc.normalized = true;
    if (minMax) {
      const min = new Array(nc).fill(Infinity);
      const max = new Array(nc).fill(-Infinity);
      for (let i = 0; i < array.length; i++) {
        const c = i % nc;
        if (array[i] < min[c]) min[c] = array[i];
        if (array[i] > max[c]) max[c] = array[i];
      }
      acc.min = min;
      acc.max = max;
    }
    this.json.accessors.push(acc);
    return this.json.accessors.length - 1;
  }

  addSampler(s) {
    this.json.samplers.push(s);
    return this.json.samplers.length - 1;
  }

  addImage(buffer, mimeType, name) {
    const bufferView = this.addBufferView(buffer);
    this.json.images.push({ name, mimeType, bufferView });
    return this.json.images.length - 1;
  }

  addTexture(source, sampler, name) {
    this.json.textures.push({ name, source, sampler });
    return this.json.textures.length - 1;
  }

  addMaterial(m) {
    this.json.materials.push(m);
    return this.json.materials.length - 1;
  }

  addMesh(name, primitives, extras) {
    const m = { name, primitives };
    if (extras) m.extras = extras;
    this.json.meshes.push(m);
    return this.json.meshes.length - 1;
  }

  addNode(node) {
    this.json.nodes.push(node);
    return this.json.nodes.length - 1;
  }

  addSkin(skin) {
    this.json.skins = this.json.skins || [];
    this.json.skins.push(skin);
    return this.json.skins.length - 1;
  }

  /** clip: { name, channels: [{ node, path, times: Float32Array, values: Float32Array }] } */
  addAnimation(clip) {
    this.json.animations = this.json.animations || [];
    const samplers = [], channels = [];
    const timeCache = new Map();
    for (const ch of clip.channels) {
      let input = timeCache.get(ch.times);
      if (input === undefined) {
        input = this.addAccessor(ch.times, 'SCALAR', { minMax: true });
        timeCache.set(ch.times, input);
      }
      const type = ch.path === 'rotation' ? 'VEC4' : ch.path === 'weights' ? 'SCALAR' : 'VEC3';
      const output = this.addAccessor(ch.values, type);
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: ch.node, path: ch.path } });
    }
    this.json.animations.push({ name: clip.name, samplers, channels });
  }

  addScene(name, nodes, extras) {
    const s = { name, nodes };
    if (extras) s.extras = extras;
    this.json.scenes.push(s);
    return this.json.scenes.length - 1;
  }

  /**
   * Adds a triangle primitive and returns the primitive object.
   * Normals / tangents are stored as normalized int8 and UVs as normalized uint16 (KHR_mesh_quantization).
   */
  primitive({ position, normal, tangent, uv, indices, material, extraAttributes = {}, targets = null }) {
    this.useExtension('KHR_mesh_quantization');
    this.json.extensionsRequired = this.json.extensionsRequired || [];
    if (!this.json.extensionsRequired.includes('KHR_mesh_quantization')) this.json.extensionsRequired.push('KHR_mesh_quantization');
    const n = position.length / 3;
    const q8 = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
    const nrm = new Int8Array(n * 4);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) nrm[i * 4 + c] = q8(normal[i * 3 + c]);
    const attributes = {
      POSITION: this.addAccessor(position, 'VEC3', { target: 34962, minMax: true }),
      NORMAL: this.addAccessor(nrm, 'VEC3', { target: 34962, normalized: true, byteStride: 4, count: n }),
    };
    if (tangent) {
      const tq = new Int8Array(n * 4);
      for (let i = 0; i < n * 4; i++) tq[i] = q8(tangent[i]);
      attributes.TANGENT = this.addAccessor(tq, 'VEC4', { target: 34962, normalized: true });
    }
    if (uv) {
      const uq = new Uint16Array(uv.length);
      for (let i = 0; i < uv.length; i++) uq[i] = Math.max(0, Math.min(65535, Math.round(uv[i] * 65535)));
      attributes.TEXCOORD_0 = this.addAccessor(uq, 'VEC2', { target: 34962, normalized: true });
    }
    for (const [k, v] of Object.entries(extraAttributes)) {
      attributes[k] = this.addAccessor(v.array, v.type, { target: 34962, normalized: !!v.normalized });
    }
    const idx = this.addAccessor(indices, 'SCALAR', { target: 34963 });
    const prim = { attributes, indices: idx, material, mode: 4 };
    if (targets && targets.length) prim.targets = targets.map((d) => ({ POSITION: this.addAccessor(d, 'VEC3', { target: 34962, minMax: true }) }));
    return prim;
  }

  toBuffer() {
    const json = this.json;
    if (!json.extensionsUsed.length) delete json.extensionsUsed;
    if (json.extensionsRequired && !json.extensionsRequired.length) delete json.extensionsRequired;
    for (const n of json.nodes) if (n.children && !n.children.length) delete n.children;
    for (const k of ['textures', 'images', 'samplers', 'materials']) if (!json[k].length) delete json[k];
    const bin = Buffer.concat(this.parts);
    const binPad = (4 - (bin.length % 4)) % 4;
    const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)]);
    json.buffers = [{ byteLength: binChunk.length }];
    let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
    const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
    jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
    const total = 12 + 8 + jsonBuf.length + 8 + binChunk.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(total, 8);
    const jh = Buffer.alloc(8);
    jh.writeUInt32LE(jsonBuf.length, 0);
    jh.writeUInt32LE(0x4e4f534a, 4);
    const bh = Buffer.alloc(8);
    bh.writeUInt32LE(binChunk.length, 0);
    bh.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([header, jh, jsonBuf, bh, binChunk]);
  }
}
