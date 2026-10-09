/** Equipment coordinates and dimensions are metres; flow rates are litres/hour. */
export const EQUIPMENT_KINDS = ['glassLid', 'lightFixture', 'ledLight', 'filter', 'canisterFilter', 'topFilter', 'spongeFilter', 'airPump', 'airStone', 'heater', 'thermometer', 'thermostat', 'flowPump', 'circulationPump', 'chiller', 'powerStrip'] as const;
export type EquipmentKind = typeof EQUIPMENT_KINDS[number];
export type Vec3 = [number, number, number];
export interface TankDimensions { width: number; depth: number; height: number; glass: number; waterHeight: number }
export const STANDARD_TANK: TankDimensions = { width: 0.6, depth: 0.3, height: 0.36, glass: 0.006, waterHeight: 0.3 };
export interface EquipmentRecord { id: string; kind: EquipmentKind; itemId?: string; position: Vec3; rotation: number; enabled: boolean; setting: number }
export interface Endpoint { device: string; port: string }
export type ConnectionKind = 'power' | 'water' | 'air' | 'sensor';
export interface ConnectionRecord { id: string; kind: ConnectionKind; from: Endpoint; to: Endpoint; radius: number; via?: Vec3[] }
export interface EquipmentLayout { version: 1; stand: 'wood' | 'metal'; tankItemId?: string; standItemId?: string; devices: EquipmentRecord[]; connections: ConnectionRecord[]; temperature: number }
export const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
  glassLid: 'ガラス蓋', lightFixture: '照明器具', ledLight: 'LEDライト', filter: '水中フィルター', canisterFilter: '外部フィルター', topFilter: '上部フィルター', spongeFilter: 'スポンジフィルター', airPump: 'エアポンプ', airStone: 'エアストーン', heater: 'ヒーター', thermometer: '水温計', thermostat: 'サーモスタット', flowPump: '水流ポンプ', circulationPump: '小型循環ポンプ', chiller: 'クーラー', powerStrip: '電源タップ',
};
export const EQUIPMENT_MAX = 24;
export const FLOW_KINDS: EquipmentKind[] = ['filter', 'canisterFilter', 'topFilter', 'flowPump', 'circulationPump'];
export function equipmentPlacement(kind: EquipmentKind, d = STANDARD_TANK): Vec3 {
  const w = d.width / 2, z = -d.depth / 2;
  switch (kind) {
    case 'glassLid': return [0, d.height + 0.004, 0];
    case 'ledLight': case 'lightFixture': return [0, d.height + 0.07, 0];
    case 'filter': return [-w + 0.055, 0.12, z + 0.032];
    case 'canisterFilter': return [-w + 0.095, -0.69, z + 0.1];
    case 'topFilter': return [0, d.height + 0.045, z + 0.04];
    case 'spongeFilter': return [-w + 0.08, 0.06, z + 0.07];
    case 'airPump': return [w - 0.06, -0.036, z - 0.038];
    case 'airStone': return [-w + 0.06, 0.054, z + 0.05];
    case 'heater': return [w - 0.045, 0.17, z + 0.012];
    case 'thermometer': return [w - 0.012, 0.25, d.depth / 2 - 0.01];
    case 'thermostat': return [w + 0.035, 0.06, z - 0.045];
    case 'flowPump': return [w - 0.024, 0.24, z + 0.065];
    case 'circulationPump': return [-w + 0.065, 0.07, z + 0.055];
    case 'chiller': return [w + 0.19, -0.71, 0.01];
    case 'powerStrip': return [0, -0.1, z - 0.075];
  }
}
export function makeEquipment(kind: EquipmentKind, id: string, d = STANDARD_TANK): EquipmentRecord {
  return { id, kind, itemId: `${kind}-initial`, position: equipmentPlacement(kind, d), rotation: 0, enabled: true, setting: FLOW_KINDS.includes(kind) ? (kind === 'flowPump' ? 600 : 300) : kind === 'thermostat' || kind === 'chiller' ? 24 : 1 };
}
export function defaultEquipmentLayout(d = STANDARD_TANK): EquipmentLayout {
  return { version: 1, stand: 'wood', temperature: 24, devices: ['glassLid', 'ledLight', 'canisterFilter', 'airPump', 'airStone', 'heater', 'thermometer', 'thermostat', 'powerStrip'].map((k) => makeEquipment(k as EquipmentKind, k, d)), connections: [] };
}
/** Defensive migration: old layouts acquire defaults; malformed imports never enter TubeGeometry. */
export function normalizeEquipment(raw: unknown, dimensions = STANDARD_TANK): EquipmentLayout {
  if (!raw || typeof raw !== 'object' || (raw as EquipmentLayout).version !== 1) return defaultEquipmentLayout(dimensions);
  const r = raw as EquipmentLayout, ids = new Set<string>();
  const devices = (Array.isArray(r.devices) ? r.devices : []).slice(0, EQUIPMENT_MAX).flatMap((x) => {
    if (!x || typeof x.id !== 'string' || !x.id || x.id === 'tank' || x.id === 'mains' || ids.has(x.id) || !EQUIPMENT_KINDS.includes(x.kind)) return [];
    ids.add(x.id);
    const base = makeEquipment(x.kind, x.id, dimensions);
    const bounds = [Math.max(0.8, dimensions.width / 2 + 0.4), Math.max(0.8, dimensions.height + 0.2), Math.max(0.8, dimensions.depth / 2 + 0.2)];
    const position = Array.isArray(x.position) && x.position.length === 3 && x.position.every(Number.isFinite) ? x.position.map((v, i) => Math.max(i === 1 ? -0.72 : -bounds[i], Math.min(bounds[i], v))) as Vec3 : base.position;
    return [{ ...base, itemId: typeof x.itemId === 'string' ? x.itemId : base.itemId, position, rotation: Number.isFinite(x.rotation) ? x.rotation % (Math.PI * 2) : 0, enabled: x.enabled !== false, setting: Number.isFinite(x.setting) ? Math.max(0, Math.min(FLOW_KINDS.includes(x.kind) ? 2000 : x.kind === 'thermostat' || x.kind === 'chiller' ? 32 : 1, x.setting)) : base.setting }];
  });
  const connections = (Array.isArray(r.connections) ? r.connections : []).slice(0, 80).filter((c) => c && typeof c.id === 'string' && ['power', 'water', 'air', 'sensor'].includes(c.kind) && c.from && c.to && [c.from, c.to].every((p) => typeof p.device === 'string' && typeof p.port === 'string')).map((c) => ({ ...c, radius: Number.isFinite(c.radius) ? Math.max(0.001, Math.min(0.012, c.radius)) : 0.003, via: Array.isArray(c.via) ? c.via.slice(0, 16).filter((p) => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isFinite(v) && Math.abs(v) < 2)) : undefined }));
  return { version: 1, stand: r.stand === 'metal' ? 'metal' : 'wood', tankItemId: typeof r.tankItemId === 'string' ? r.tankItemId : 'tank-initial', standItemId: typeof r.standItemId === 'string' ? r.standItemId : r.stand === 'metal' ? 'stand-studio' : 'stand-initial', devices, connections, temperature: Number.isFinite(r.temperature) ? Math.max(5, Math.min(40, r.temperature)) : 24 };
}
