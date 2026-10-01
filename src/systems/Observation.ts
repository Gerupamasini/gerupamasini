import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { signal } from '@preact/signals';
import type { Individual } from '../creatures/Individual';
import type { CreatureSystem } from '../creatures/CreatureSystem';

export const SPEEDS = [0.25, 0.5, 1, 2] as const;

export interface ObserveState {
  speciesName: string;
  speciesId: string;
  individualId: string;
  speedIndex: number;
  recorded: string[];
  sex: string;
  stage: string;
}

/** Lock-on orbit camera around one individual with adjustable simulation speed and behaviour recording. */
export class Observation {
  readonly state = signal<ObserveState | null>(null);
  private controls: OrbitControls | null = null;
  private target: Individual | null = null;
  private savedNear = 0.05;
  private readonly follow = new Vector3();
  private readonly tmp = new Vector3();
  private unsub: (() => void) | null = null;
  onBehavior: ((speciesId: string, behaviorId: string) => void) | null = null;

  constructor(private readonly camera: PerspectiveCamera, private readonly canvas: HTMLCanvasElement, private readonly creatures: CreatureSystem) {}

  get active(): boolean {
    return this.target !== null;
  }

  get targetId(): string | null {
    return this.target?.id ?? null;
  }

  get speed(): number {
    return SPEEDS[this.state.value?.speedIndex ?? 2];
  }

  enter(ind: Individual): void {
    this.exit();
    this.target = ind;
    const anchor = this.creatures.anchorOf(ind.id) ?? ind.pos.clone();
    const len = ind.length_mm / 1000;
    this.savedNear = this.camera.near;
    this.camera.near = Math.max(0.002, len * 0.02);
    this.camera.updateProjectionMatrix();
    const controls = new OrbitControls(this.camera, this.canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = Math.max(0.03, len * 0.5);
    controls.maxDistance = Math.max(1.5, len * 14);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.enablePan = false;
    controls.zoomSpeed = 0.8;
    controls.target.copy(anchor);
    // start from the player's eye, pulled in to a sensible distance along the same direction
    const dir = this.tmp.copy(this.camera.position).sub(anchor);
    dir.y = Math.max(dir.y, 0.1 * dir.length());
    dir.setLength(Math.min(Math.max(len * 5, 0.35), controls.maxDistance));
    this.camera.position.copy(anchor).add(dir);
    controls.update();
    this.controls = controls;
    this.follow.copy(anchor);
    this.state.value = {
      speciesName: ind.species.names.ja, speciesId: ind.species.id, individualId: ind.id, speedIndex: 2, recorded: [],
      sex: ind.sex, stage: ind.stage,
    };
    this.unsub = this.creatures.events.on('behavior', (e) => {
      if (!this.target || e.individualId !== this.target.id) return;
      const st = this.state.value;
      if (st && !st.recorded.includes(e.behaviorId)) this.state.value = { ...st, recorded: [...st.recorded, e.behaviorId] };
      this.onBehavior?.(this.target.species.id, e.behaviorId);
    });
  }

  cycleSpeed(dir: 1 | -1): void {
    const st = this.state.value;
    if (!st) return;
    const i = Math.max(0, Math.min(SPEEDS.length - 1, st.speedIndex + dir));
    this.state.value = { ...st, speedIndex: i };
  }

  setSpeedIndex(i: number): void {
    const st = this.state.value;
    if (st) this.state.value = { ...st, speedIndex: i };
  }

  update(): void {
    const c = this.controls, ind = this.target;
    if (!c || !ind) return;
    if (!this.creatures.get(ind.id)) { this.exit(); return; }
    const anchor = this.creatures.anchorOf(ind.id);
    if (anchor) {
      const delta = this.tmp.copy(anchor).sub(this.follow);
      this.follow.copy(anchor);
      c.target.add(delta);
      this.camera.position.add(delta);
    }
    c.update();
  }

  exit(): void {
    if (!this.controls) return;
    this.controls.dispose();
    this.controls = null;
    this.target = null;
    this.unsub?.();
    this.unsub = null;
    this.camera.near = this.savedNear;
    this.camera.updateProjectionMatrix();
    this.state.value = null;
  }
}
