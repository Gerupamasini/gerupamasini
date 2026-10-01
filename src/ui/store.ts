import { signal } from '@preact/signals';
import type { TideExtremum } from '../tide/TideModel';

export type Screen = 'boot' | 'title' | 'field' | 'observe' | 'capture' | 'zukan' | 'tank' | 'ticket' | 'menu' | 'error';

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
