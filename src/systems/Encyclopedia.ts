import { signal } from '@preact/signals';
import type { GameData } from '../data/loader';
import type { SpeciesDef } from '../data/schemas';
import type { Individual, IndividualRecord } from '../creatures/Individual';
import { toRecord } from '../creatures/Individual';
import type { SpeciesProgress, SaveV1 } from '../core/Save';
import { toast, t } from '../ui/store';

export const REWARDS = { discover: 100, capture: 50, behavior: 30, sex: 20, perTenIndividuals: 20 };

/** Species progress, individual records, research points and money. Emits toasts for firsts. */
export class Encyclopedia {
  readonly progress = signal<Record<string, SpeciesProgress>>({});
  readonly research = signal(0);
  readonly money = signal(0);
  readonly caseItems = signal<IndividualRecord[]>([]);
  readonly tankItems = signal<IndividualRecord[]>([]);
  readonly caseMax = 6;
  stats = { captures: 0, observations: 0 };
  /** called after any change worth saving */
  onChanged: (() => void) | null = null;

  constructor(private readonly data: GameData) {}

  entry(speciesId: string): SpeciesProgress {
    const p = this.progress.value[speciesId];
    if (p) return p;
    const fresh: SpeciesProgress = { behaviors: {}, individuals: [], nextNumber: 1 };
    this.progress.value = { ...this.progress.value, [speciesId]: fresh };
    return fresh;
  }

  private touch(speciesId: string, patch: Partial<SpeciesProgress>): void {
    const cur = this.entry(speciesId);
    this.progress.value = { ...this.progress.value, [speciesId]: { ...cur, ...patch } };
    this.onChanged?.();
  }

  award(points: number, label: string): void {
    this.research.value += points;
    toast(`${label}  +${points} ${t('progress.research')}`, 'success');
  }

  species(id: string): SpeciesDef | undefined {
    return this.data.species.get(id);
  }

  /** Locking a creature in observation mode counts as discovery (and registration for non-collectable species). */
  onObserved(ind: Individual, nowMs: number): void {
    const sp = ind.species;
    const e = this.entry(sp.id);
    this.stats.observations++;
    if (!e.discovered) {
      this.touch(sp.id, { discovered: nowMs, observed: nowMs });
      this.award(REWARDS.discover, `${t('toast.newSpecies')}: ${sp.names.ja}`);
    } else if (!e.observed) this.touch(sp.id, { observed: nowMs });
    if (sp.sex.dimorphic) this.noteSex(sp, ind.sex, nowMs);
  }

  onBehavior(speciesId: string, behaviorId: string, nowMs: number): boolean {
    const sp = this.species(speciesId);
    if (!sp) return false;
    const def = sp.encyclopedia.behaviors.find((b) => b.id === behaviorId);
    if (!def) return false;
    const e = this.entry(speciesId);
    if (e.behaviors[behaviorId]) return false;
    this.touch(speciesId, { behaviors: { ...e.behaviors, [behaviorId]: nowMs } });
    this.award(REWARDS.behavior, `${t('toast.behavior')}: ${def.ja}`);
    return true;
  }

  private noteSex(sp: SpeciesDef, sex: Individual['sex'], nowMs: number): void {
    const e = this.entry(sp.id);
    if (sex === 'm' && !e.maleSeen) { this.touch(sp.id, { maleSeen: nowMs }); this.award(REWARDS.sex, `${sp.names.ja} ♂`); }
    if (sex === 'f' && !e.femaleSeen) { this.touch(sp.id, { femaleSeen: nowMs }); this.award(REWARDS.sex, `${sp.names.ja} ♀`); }
  }

  /** Register a captured individual; returns the record or null when the case is full. */
  onCaptured(ind: Individual, nowMs: number, tideLevel: number): IndividualRecord | null {
    if (this.caseItems.value.length >= this.caseMax) return null;
    const sp = ind.species;
    const e = this.entry(sp.id);
    const rec = toRecord(ind, e.nextNumber, nowMs, tideLevel);
    const individuals = [...e.individuals, rec];
    const first = !e.captured;
    const wasDiscovered = !!e.discovered;
    this.touch(sp.id, { individuals, nextNumber: e.nextNumber + 1, captured: e.captured ?? nowMs, discovered: e.discovered ?? nowMs });
    this.stats.captures++;
    if (!wasDiscovered) this.award(REWARDS.discover, `${t('toast.newSpecies')}: ${sp.names.ja}`);
    if (first) this.award(REWARDS.capture, `${t('toast.captured')}: ${sp.names.ja}`);
    else toast(`${t('toast.captured')}: ${sp.names.ja} #${String(rec.number).padStart(4, '0')}`, 'info');
    if (individuals.length % 10 === 0) this.award(REWARDS.perTenIndividuals, `${sp.names.ja} ${individuals.length} 個体`);
    this.noteSex(sp, ind.sex, nowMs);
    this.caseItems.value = [...this.caseItems.value, rec];
    this.onChanged?.();
    return rec;
  }

  moveToTank(rec: IndividualRecord): void {
    this.caseItems.value = this.caseItems.value.filter((r) => r.id !== rec.id);
    this.tankItems.value = [...this.tankItems.value, rec];
    this.onChanged?.();
  }

  moveToCase(rec: IndividualRecord): boolean {
    if (this.caseItems.value.length >= this.caseMax) return false;
    this.tankItems.value = this.tankItems.value.filter((r) => r.id !== rec.id);
    this.caseItems.value = [...this.caseItems.value, rec];
    this.onChanged?.();
    return true;
  }

  applySave(s: SaveV1): void {
    this.progress.value = { ...s.encyclopedia };
    this.research.value = s.player.research;
    this.money.value = s.player.money;
    this.caseItems.value = [...s.case];
    this.tankItems.value = [...s.tank.individuals];
    this.stats = { captures: s.stats.captures, observations: s.stats.observations };
  }

  writeSave(s: SaveV1): void {
    s.encyclopedia = { ...this.progress.value };
    s.player.research = this.research.value;
    s.player.money = this.money.value;
    s.case = [...this.caseItems.value];
    s.tank.individuals = [...this.tankItems.value];
    s.stats.captures = this.stats.captures;
    s.stats.observations = this.stats.observations;
  }
}
