import { signal } from '@preact/signals';
import type { TideExtremum } from '../tide/TideModel';
import type { IndividualRecord } from '../creatures/Individual';

export type Screen = 'boot' | 'title' | 'home' | 'field' | 'observe' | 'capture' | 'zukan' | 'ticket' | 'tidetable' | 'menu' | 'error';

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
  stats: { calls: number; tris: number; creatures: number; visible: number; lod1: number };
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'warn';
}

export const ui = {
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
  /** debug mode on (F3 or ?debug=1) */
  debug: signal(false),
  debugState: signal<DebugState>({ timeOverride: false, tideOverride: null, overcast: 0, markers: true, stats: { calls: 0, tris: 0, creatures: 0, visible: 0, lod1: 0 } }),
  markers: signal<Marker[]>([]),
  /** side panel shown on the home screen */
  homePanel: signal<'none' | 'tank'>('none'),
  /** creature info card on the home screen */
  homeInfo: signal<IndividualRecord | null>(null),
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
