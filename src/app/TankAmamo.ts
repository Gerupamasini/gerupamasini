import { Box3, Matrix4, Ray, Vector3, type Camera, type Intersection, type Raycaster } from 'three';
import type { Quality } from '../core/Settings';
import { AmamoKit, AmamoPatch } from '../world/amamo';

export const TANK_AMAMO_RADIUS = 0.065;
type Flow = { direction: Vector3; flowRate: number };

/** One tank owns the shared materials; each decoration only owns its shoot attributes and instances. */
export class TankAmamo {
  private kit_: AmamoKit | null = null;
  readonly plants = new Set<TankAmamoPlant>();
  private readonly position = new Vector3();
  get kit(): AmamoKit | null { return this.kit_; }

  constructor(private readonly prepare?: (kit: AmamoKit) => void) {}

  create(seed: number): TankAmamoPlant {
    if (!this.kit_) {
      this.kit_ = new AmamoKit();
      this.kit_.uniforms.uAmCurrent.value.set(0.012, 0.006);
      this.kit_.uniforms.uAmWave.value.set(1, 0, 0.012, 0.05);
      this.prepare?.(this.kit_);
    }
    const plant = new TankAmamoPlant(this, this.kit_, seed);
    this.plants.add(plant);
    return plant;
  }

  update(camera: Camera, waterWorldY: number, quality: Quality, dt = 0, flows?: readonly Flow[]): void {
    const kit = this.kit_; if (!kit) return;
    kit.uniforms.uAmTime.value += dt;
    kit.uniforms.uAmWater.value = waterWorldY;
    if (flows) {
      const current = kit.uniforms.uAmCurrent.value;
      current.set(0.012, 0.006);
      for (const flow of flows) { current.x += flow.direction.x * flow.flowRate / 30000; current.y += flow.direction.z * flow.flowRate / 30000; }
      current.clampLength(0, 0.055);
    }
    const minimum = quality === 'minimal' ? 2 : quality === 'low' ? 1 : 0;
    for (const plant of this.plants) {
      const distance = plant.getWorldPosition(this.position).distanceTo(camera.position);
      const lod = Math.max(minimum, distance > 2.5 ? 2 : distance > 0.95 ? 1 : 0) as 0 | 1 | 2;
      plant.setLod(lod, 1, quality === 'high' ? 0 : -1);
      // These are planted interiors: their roots and runners remain under the bed.
      plant.rootRhizome.visible = false;
    }
  }

  release(plant: TankAmamoPlant): void {
    this.plants.delete(plant);
    if (!this.plants.size) { this.kit_?.dispose(); this.kit_ = null; }
  }

  dispose(): void { for (const plant of [...this.plants]) plant.dispose(); }
}

/** The existing meadow model, planted as a small juvenile clump at the decoration's origin. */
export class TankAmamoPlant extends AmamoPatch {
  private disposed = false;
  private readonly pickBounds: Box3;
  private readonly pickRay = new Ray();
  private readonly pickMatrix = new Matrix4();
  private readonly pickPoint = new Vector3();

  constructor(private readonly owner: TankAmamo, kit: AmamoKit, seed: number) {
    super({ x: 0, z: 0, radius: 0.04, density: 600, kind: 'pioneer', seed, kit,
      ground: { heightAt: () => 0 }, maxShoots: 3, lengthAt: () => 0.22 });
    this.name = 'AquariumAmamo';
    this.pickBounds = new Box3(new Vector3(-TANK_AMAMO_RADIUS, 0, -TANK_AMAMO_RADIUS), new Vector3(TANK_AMAMO_RADIUS, this.maxLength, TANK_AMAMO_RADIUS));
    // Raycasting the undeformed leaf buffers would select invisible 60cm-long blades.
    this.traverse(part => { if (part !== this) part.raycast = () => {}; });
    this.setLod(1, 1, -1);
    this.rootRhizome.visible = false;
  }

  override raycast(raycaster: Raycaster, hits: Intersection[]): void {
    if (!this.visible) return;
    this.pickMatrix.copy(this.matrixWorld).invert();
    this.pickRay.copy(raycaster.ray).applyMatrix4(this.pickMatrix);
    if (!this.pickRay.intersectBox(this.pickBounds, this.pickPoint)) return;
    this.pickPoint.applyMatrix4(this.matrixWorld);
    const distance = this.pickPoint.distanceTo(raycaster.ray.origin);
    if (distance >= raycaster.near && distance <= raycaster.far) hits.push({ distance, point: this.pickPoint.clone(), object: this });
  }

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    super.dispose();
    this.owner.release(this);
  }
}
