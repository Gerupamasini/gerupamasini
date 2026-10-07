import { DEFAULT_SETTINGS, type SettingsData } from '../core/Settings';
import { signal } from '@preact/signals';
import type { TideExtremum } from '../tide/TideModel';
import type { IndividualRecord } from '../creatures/Individual';

/** the tool in the player's hands on the flat */
/** a tool id from items/tools.json */
export type ToolId = string;

export type Screen = 'boot' | 'title' | 'home' | 'tankEdit' | 'field' | 'observe' | 'capture' | 'caseView' | 'zukan' | 'ticket' | 'tidetable' | 'menu' | 'spots' | 'shop' | 'error';

export interface HudState {
  timeText: string;
  dateText: string;
  tideLevel: number;
  tideRate: number;
  extrema: TideExtremum[];
  tideCurve: { t: number; level: number }[];
  ticket: { remainingSec: number; phase: 'active' | 'ending'; targetText: string } | null;
  caseCount: number;
  caseMax: number;
  prompt: string | null;
  tooDeep: boolean;
  research: number;
  money: number;
  tod: string;
  season: string;
  fps: number;
  pointerLocked: boolean;
}

export interface Marker {
  id: string;
  x: number;
  y: number;
  text: string;
  kind: string;
}

export interface DebugState {
  timeOverride: boolean;
  tideOverride: number | null;
  overcast: number;
  markers: boolean;
  /** species kept out of the world for now (ids) */
  hidden: string[];
  stats: { calls: number; tris: number; creatures: number; visible: number; lod1: number; clamsNear: number; clamsTotal: number; oysters?: string; oystersTotal?: number; amamo?: string };
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'warn';
}

export const ui = {
  /** the live settings (the menu's sliders and buttons read this) */
  settings: signal<SettingsData>({ ...DEFAULT_SETTINGS }),
  /** the tool (id) or parcel ('coming:<id>') picked on the shop's shelves */
  shopSelected: signal<string | null>(null),
  screen: signal<Screen>('boot'),
  overlayFrom: signal<Screen>('field'),
  loading: signal({ frac: 0, label: '' }),
  error: signal<string | null>(null),
  hasSave: signal(false),
  strings: signal<Record<string, string>>({}),
  hud: signal<HudState>({
    timeText: '--:--', dateText: '', tideLevel: 0, tideRate: 0, extrema: [], tideCurve: [], ticket: null,
    caseCount: 0, caseMax: 6, prompt: null, tooDeep: false, research: 0, money: 0, tod: 'day', season: 'autumn', fps: 0, pointerLocked: false,
  }),
  toasts: signal<Toast[]>([]),
  tool: signal<ToolId>('net_small'),
  /** a short dark curtain with a word on it while screens change (null = none) */
  transition: signal<string | null>(null),
  /** a newer deploy than the one running (see Build.checkForNewBuild) */
  newBuild: signal<import('../core/Build').BuildInfo | null>(null),
  /** debug mode on (F3 or ?debug=1) */
  debug: signal(false),
  debugState: signal<DebugState>({ timeOverride: false, tideOverride: null, overcast: 0, markers: true, hidden: [], stats: { calls: 0, tris: 0, creatures: 0, visible: 0, lod1: 0, clamsNear: 0, clamsTotal: 0 } }),
  markers: signal<Marker[]>([]),
  /** side panel shown on the home screen */
  homePanel: signal<'none' | 'tank' | 'tools'>('none'),
  /** the spot picked on the map (its id) */
  spot: signal<string | null>(null),
  /** creature info card on the home screen */
  homeInfo: signal<IndividualRecord | null>(null),
  /** full-map overview on the flat (M) */
  mapOpen: signal(false),
  /** tank panel tab */
  tankTab: signal<'fish' | 'layout'>('fish'),
  /** selected decoration in the tank layout editor */
  tankSelected: signal<string | null>(null),
  /** bumped whenever the tank layout changes, so the editor re-renders */
  tankLayoutVersion: signal(0),
};

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3200): void {
  const id = ++toastId;
  ui.toasts.value = [...ui.toasts.value, { id, text, kind }].slice(-5);
  setTimeout(() => { ui.toasts.value = ui.toasts.value.filter((t) => t.id !== id); }, ms);
}

export function t(key: string, fallback?: string): string {
  return ui.strings.value[key] ?? fallback ?? key;
}
