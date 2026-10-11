import { signal } from '@preact/signals';
import { DEFAULT_NET, migrateTools } from '../core/Save';
import type { GameData } from '../data/loader';
import type { SpeciesDef } from '../data/schemas';
import type { Individual, IndividualRecord } from '../creatures/Individual';
import { toRecord } from '../creatures/Individual';
import type { SpeciesProgress, SaveV1 } from '../core/Save';
import { toast, t } from '../ui/store';

export const REWARDS = { discover: 100, capture: 50, behavior: 30, sex: 20, perTenIndividuals: 20 };

/** CR handed out each time the observer level goes up */
export const CR_PER_LEVEL = 150;
/** at most this many tools go to the flat */
export const LOADOUT_MAX = 3;

/** the observer level for a research total: 1 at 0, 2 at 100, 3 at 400, 4 at 900 … */
export function levelFor(research: number): number {
  return Math.floor(Math.sqrt(Math.max(0, research) / 100)) + 1;
}

/** the research total at which the next level begins */
export function nextLevelAt(level: number): number {
  return 100 * level * level;
}

/** proficiency is shared by every net (the hand is the same), and separate per other tool */
export function skillKeyOf(tool: { id: string; type: string }): string {
  return tool.type === 'capture' ? 'hand_net' : tool.id;
}

/** catches with a tool at which its proficiency reaches the next level (Lv1 … Lv5) */
export const SKILL_STEPS = [3, 8, 15, 25, 40];
export const SKILL_MAX = SKILL_STEPS.length;

export function skillLevelFor(catches: number): number {
  let lv = 0;
  for (const step of SKILL_STEPS) if (catches >= step) lv++;
  return lv;
}

/** a little research from an animal let go of into the lab instead of the tank: a few points plus one per centimetre */
export function researchFor(rec: IndividualRecord): number {
  return 5 + Math.round(rec.length_mm / 10);
}

/** Species progress, individual records, research points and money. Emits toasts for firsts. */
export class Encyclopedia {
  readonly progress = signal<Record<string, SpeciesProgress>>({});
  readonly research = signal(0);
  readonly money = signal(0);
  readonly caseItems = signal<IndividualRecord[]>([]);
  readonly tankItems = signal<IndividualRecord[]>([]);
  readonly caseMax = 6;
  /** catches made with each tool: the hand grows surer with use */
  readonly skills = signal<Record<string, number>>({});
  /** tools owned, and the (at most two) carried to the flat in key order */
  readonly owned = signal<string[]>([DEFAULT_NET, 'shovel']);
  readonly loadout = signal<string[]>([DEFAULT_NET, 'shovel']);
  private levelClaimed = 1;
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
    this.claimLevels();
    this.onChanged?.();
  }

  get level(): number {
    return levelFor(this.research.value);
  }

  /** Each new observer level pays out CR, once. */
  private claimLevels(): void {
    const lv = this.level;
    while (this.levelClaimed < lv) {
      this.levelClaimed++;
      this.money.value += CR_PER_LEVEL;
      toast(`${t('toast.levelUp')} Lv${this.levelClaimed}  +${CR_PER_LEVEL} CR`, 'success');
    }
  }

  /** debug: CR by hand */
  addMoney(cr: number): void {
    this.money.value = Math.max(0, this.money.value + cr);
    this.onChanged?.();
  }

  owns(toolId: string): boolean {
    return this.owned.value.includes(toolId);
  }

  /** Buy a tool with CR; false when it is owned already or the CR is short. */
  buy(tool: { id: string; ja: string; price_cr: number }): boolean {
    if (this.owns(tool.id) || this.money.value < tool.price_cr) return false;
    this.money.value -= tool.price_cr;
    this.owned.value = [...this.owned.value, tool.id];
    toast(`${t('toast.bought')}: ${tool.ja}  −${tool.price_cr} CR`, 'success');
    this.onChanged?.();
    return true;
  }

  carries(toolId: string): boolean {
    return this.loadout.value.includes(toolId);
  }

  /** Take a tool along or leave it; at most two go, and the last one stays. */
  toggleCarry(toolId: string): boolean {
    if (!this.owns(toolId)) return false;
    const cur = this.loadout.value;
    if (cur.includes(toolId)) {
      if (cur.length <= 1) return false;
      this.loadout.value = cur.filter((id) => id !== toolId);
    } else {
      if (cur.length >= LOADOUT_MAX) return false;
      this.loadout.value = [...cur, toolId];
    }
    this.onChanged?.();
    return true;
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

  skillCount(toolId: string): number {
    return this.skills.value[toolId] ?? 0;
  }

  skillLevel(toolId: string): number {
    return skillLevelFor(this.skillCount(toolId));
  }

  /** Count catches made with a tool; says so when the hand gets surer. */
  addSkill(toolId: string, toolName: string, n = 1): void {
    this.setSkill(toolId, this.skillCount(toolId) + n, toolName);
  }

  setSkill(toolId: string, count: number, toolName?: string): void {
    const before = this.skillLevel(toolId);
    this.skills.value = { ...this.skills.value, [toolId]: Math.max(0, Math.round(count)) };
    const after = this.skillLevel(toolId);
    if (after > before && toolName) toast(`${t('toast.skillUp')}: ${toolName} Lv${after}`, 'success');
    this.onChanged?.();
  }

  /** Let an animal in the case go. */
  release(rec: IndividualRecord): void {
    const sp = this.species(rec.speciesId);
    this.caseItems.value = this.caseItems.value.filter((r) => r.id !== rec.id);
    toast(`${t('toast.released')}: ${sp?.names.ja ?? rec.speciesId} #${String(rec.number).padStart(4, '0')}`, 'info');
    this.onChanged?.();
  }

  /** Hand an animal in the case over to the lab: a little research, and it is gone. */
  toResearch(rec: IndividualRecord): number {
    const sp = this.species(rec.speciesId);
    const points = researchFor(rec);
    this.caseItems.value = this.caseItems.value.filter((r) => r.id !== rec.id);
    this.award(points, `${t('toast.toResearch')}: ${sp?.names.ja ?? rec.speciesId} #${String(rec.number).padStart(4, '0')}`);
    this.onChanged?.();
    return points;
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
    this.skills.value = { ...(s.player.skills ?? {}) };
    this.owned.value = [...new Set([DEFAULT_NET, 'shovel', ...migrateTools(s.player.tools)])];
    const loadout = migrateTools(s.player.loadout ?? [DEFAULT_NET, 'shovel']).filter((id) => this.owned.value.includes(id)).slice(0, LOADOUT_MAX);
    this.loadout.value = loadout.length ? loadout : [DEFAULT_NET];
    this.levelClaimed = s.player.levelClaimed ?? 1;
    this.stats = { captures: s.stats.captures, observations: s.stats.observations };
  }

  writeSave(s: SaveV1): void {
    s.encyclopedia = { ...this.progress.value };
    s.player.research = this.research.value;
    s.player.money = this.money.value;
    s.case = [...this.caseItems.value];
    s.tank.individuals = [...this.tankItems.value];
    s.player.skills = { ...this.skills.value };
    s.player.tools = [...this.owned.value];
    s.player.loadout = [...this.loadout.value];
    s.player.levelClaimed = this.levelClaimed;
    s.stats.captures = this.stats.captures;
    s.stats.observations = this.stats.observations;
  }
}
