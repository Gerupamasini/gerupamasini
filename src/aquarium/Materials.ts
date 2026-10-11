import { DataTexture, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, type Material } from 'three';
import type { EquipmentStyle } from './catalog';

/** One palette per aquarium, shared by every device and all three LODs. No canvas or image downloads. */
export class EquipmentMaterials {
  private readonly textures: DataTexture[] = [];
  private grain(wood = false): DataTexture {
    const n = 128, data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const h = ((Math.imul(x + 13, 1597334677) ^ Math.imul(y + 7, 3812015801)) >>> 0) / 4294967295;
      const v = wood ? 170 + 36 * Math.sin(x * 0.19 + Math.sin(y * 0.08) * 0.9) + h * 12 : 220 + h * 24;
      const i = (y * n + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
    const t = new DataTexture(data, n, n, RGBAFormat); t.wrapS = t.wrapT = RepeatWrapping; t.needsUpdate = true;
    this.textures.push(t); return t;
  }
  readonly glass = new MeshPhysicalMaterial({ color: 0xe8f6f0, roughness: 0.06, metalness: 0, transmission: 1, thickness: 0.006, ior: 1.52, attenuationColor: 0xc4e8d3, attenuationDistance: 1.8, transparent: true, opacity: 0.3, depthWrite: false });
  readonly blackPlastic = new MeshStandardMaterial({ color: 0x252a2b, roughness: 0.43 });
  readonly clearPlastic = new MeshPhysicalMaterial({ color: 0x9baeb0, roughness: 0.26, transparent: true, opacity: 0.43, depthWrite: false });
  readonly rubber = new MeshStandardMaterial({ color: 0x151a1a, roughness: 0.88 });
  readonly metal = new MeshStandardMaterial({ color: 0xb9c2c5, metalness: 0.92, roughness: 0.29 });
  readonly paintedMetal = new MeshStandardMaterial({ color: 0x3d484d, metalness: 0.42, roughness: 0.38 });
  readonly wood = new MeshStandardMaterial({ color: 0x68472f, roughness: 0.65 });
  readonly silicone = new MeshStandardMaterial({ color: 0xb5c1b9, transparent: true, opacity: 0.5, roughness: 0.7, depthWrite: false });
  readonly ceramic = new MeshStandardMaterial({ color: 0x788d95, roughness: 0.98 });
  readonly indicator = new MeshStandardMaterial({ color: 0x70d4ac, emissive: 0x40bc8a, emissiveIntensity: 0.8 });
  readonly lamp = new MeshStandardMaterial({ color: 0xe9f8ff, emissive: 0xc8eeff, emissiveIntensity: 2.5 });
  readonly lampOff = new MeshStandardMaterial({ color: 0xc4cdce, roughness: 0.45 });
  readonly display = new MeshStandardMaterial({ color: 0x0c2225, roughness: 0.25 });
  readonly ivoryPlastic = new MeshStandardMaterial({ color: 0xe8e0cb, roughness: 0.43 });
  readonly ivoryMetal = new MeshStandardMaterial({ color: 0xe8e0cb, metalness: 0.35, roughness: 0.38 });
  readonly ivoryWood = new MeshStandardMaterial({ color: 0xd4c8a9, roughness: 0.65 });
  readonly ivoryCeramic = new MeshStandardMaterial({ color: 0xded6c3, roughness: 0.98 });
  readonly brushedMetal = new MeshStandardMaterial({ color: 0x83979d, metalness: 0.78, roughness: 0.42 });
  readonly charcoalCeramic = new MeshStandardMaterial({ color: 0x36464b, roughness: 0.98 });
  constructor() {
    const grain = this.grain();
    for (const m of [this.blackPlastic, this.rubber, this.paintedMetal, this.ceramic, this.ivoryPlastic, this.ivoryMetal, this.ivoryCeramic, this.brushedMetal, this.charcoalCeramic]) { m.roughnessMap = grain; m.bumpMap = grain; m.bumpScale = m === this.ceramic || m === this.charcoalCeramic || m === this.ivoryCeramic ? 0.0003 : 0.000025; }
    const wood = this.grain(true); wood.colorSpace = SRGBColorSpace; this.wood.map = wood; this.wood.bumpMap = wood; this.wood.bumpScale = 0.00012;
    this.ivoryWood.map = wood; this.ivoryWood.bumpMap = wood; this.ivoryWood.bumpScale = 0.00012;
    this.clearPlastic.roughnessMap = grain; this.glass.roughnessMap = grain;
  }
  forStyle(material: Material, style: EquipmentStyle): Material {
    if (style === 'ivory') {
      if (material === this.blackPlastic || material === this.clearPlastic) return this.ivoryPlastic;
      if (material === this.ceramic) return this.ivoryCeramic;
      if (material === this.paintedMetal) return this.ivoryMetal;
      if (material === this.wood) return this.ivoryWood;
    }
    if (style === 'studio') {
      if (material === this.blackPlastic || material === this.paintedMetal || material === this.clearPlastic) return this.brushedMetal;
      if (material === this.ceramic) return this.charcoalCeramic;
    }
    return material;
  }
  dispose(): void { for (const v of Object.values(this)) if ((v as Material)?.isMaterial) (v as Material).dispose(); for (const t of this.textures) t.dispose(); }
}
