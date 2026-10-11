import type { IndividualRecord } from '../creatures/Individual';
import { defaultTankLayout, ITEM_RADIUS, type TankLayout } from '../app/TankLayout';
import { defaultEquipmentLayout, equipmentPlacement, TANK_DIMENSIONS, type TankSize } from './state';
import { equipmentItem, tankSizeItemId } from './catalog';

export interface RoomTank { id: string; size: TankSize; position: [number, number]; individuals: IndividualRecord[]; layout: TankLayout; lastSimMs: number }
export interface AquariumRoom { version: 1; tanks: RoomTank[]; mainTankId: string | null }
export const ROOM_LIMITS = { minX: -2.85, maxX: 2.85, minZ: -0.8, maxZ: 1.7 };
export const ROOM_SLOT_LEVELS = [1, 5, 10] as const;
export const roomCapacity = (level: number): number => ROOM_SLOT_LEVELS.filter(lv => level >= lv).length;
export const initialRoom = (tank: { individuals: IndividualRecord[]; layout?: TankLayout; lastSimMs: number }): AquariumRoom => ({ version: 1, mainTankId: 'aquarium-1', tanks: [{ ...tank, id: 'aquarium-1', size: equipmentItem(tank.layout?.equipment?.tankItemId)?.size ?? 60, position: [0, 0], individuals: [...tank.individuals], layout: tank.layout ?? defaultTankLayout() }] });
export function newRoomTank(id: string, size: TankSize, position: [number, number]): RoomTank {
  const equipment = defaultEquipmentLayout(TANK_DIMENSIONS[size]);
  equipment.tankItemId = tankSizeItemId('tank', size); equipment.standItemId = tankSizeItemId('stand', size);
  return { id, size, position: [...position], individuals: [], layout: { ...defaultTankLayout(), equipment }, lastSimMs: Date.now() };
}
/** Include cabinet, bundled wiring and the space beside it for appliances. */
export function tankFootprint(size: TankSize): [number, number] { const d = TANK_DIMENSIONS[size]; return [d.width + 0.5, d.depth + 0.3]; }
export function canPlaceTank(tanks: RoomTank[], size: TankSize, position: [number, number], excluding?: string): boolean {
  if (!position.every(Number.isFinite)) return false;
  const [w, d] = tankFootprint(size), [x, z] = position;
  if (x - w / 2 < ROOM_LIMITS.minX || x + w / 2 > ROOM_LIMITS.maxX || z - d / 2 < ROOM_LIMITS.minZ || z + d / 2 > ROOM_LIMITS.maxZ) return false;
  return tanks.every(t => { const [tw, td] = tankFootprint(t.size); return t.id === excluding || Math.abs(x - t.position[0]) >= (w + tw) / 2 + 0.04 || Math.abs(z - t.position[1]) >= (d + td) / 2 + 0.04; });
}
export function freeTankPosition(tanks: RoomTank[], size: TankSize): [number, number] | null {
  for (const z of [0, 0.85, -0.35, 1.2]) for (const x of [0, -1.8, 1.8, -1.2, 1.2, -2.1, 2.1]) if (canPlaceTank(tanks, size, [x, z])) return [x, z];
  return null;
}
/** Change the container, keeping animal sizes and restoring preset plumbing for the new footprint. */
export function resizedTankLayout(layout: TankLayout, from: TankSize, to: TankSize, tankItemId = tankSizeItemId('tank', to)): TankLayout {
  const old = TANK_DIMENSIONS[from], d = TANK_DIMENSIONS[to], equipment = defaultEquipmentLayout(d);
  const stand = equipmentItem(layout.equipment?.standItemId);
  equipment.tankItemId = tankItemId; equipment.standItemId = stand?.size === to ? stand.id : tankSizeItemId('stand', to);
  if (layout.equipment) {
    equipment.temperature = layout.equipment.temperature;
    equipment.devices = layout.equipment.devices.map(r => {
      const base = equipmentPlacement(r.kind, old), next = equipmentPlacement(r.kind, d);
      return { ...r, position: [next[0] + (r.position[0] - base[0]) * d.width / old.width, next[1] + (r.position[1] - base[1]) * (r.position[1] < 0 ? 1 : d.height / old.height), next[2] + (r.position[2] - base[2]) * d.depth / old.depth] };
    });
  }
  return { substrate: layout.substrate, equipment, items: layout.items.map(i => {
    const r = ITEM_RADIUS[i.type]; return { ...i, x: Math.max(-d.width / 2 + r, Math.min(d.width / 2 - r, i.x * d.width / old.width)), z: Math.max(-d.depth / 2 + r, Math.min(d.depth / 2 - r, i.z * d.depth / old.depth)) };
  }) };
}
