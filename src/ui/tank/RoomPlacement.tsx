import { useEffect, useRef, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { canPlaceTank, freeTankPosition, ROOM_LIMITS, ROOM_SLOT_LEVELS, tankFootprint, TANK_DIMENSIONS, TANK_SIZES, type TankSize } from '../../aquarium';

const W = 570, H = 250;
const mapPoint = (position: [number, number]) => [(position[0] - ROOM_LIMITS.minX) * 100, (position[1] - ROOM_LIMITS.minZ) * 100];

export function RoomPlacement({ app }: { app: App }) {
  const room = app.aquariumRoom.value, busy = app.roomBusy.value, limit = app.roomTankLimit;
  const [selected, setSelected] = useState<string | null>(app.activeTankId.value);
  const [size, setSize] = useState<TankSize>(45);
  const [position, setPosition] = useState<[number, number]>([0, 0]);
  const dragging = useRef(false), dragOffset = useRef<[number, number]>([0, 0]), svg = useRef<SVGSVGElement>(null);
  useEffect(() => { app.tank.setViewInputEnabled(false); app.tank.frameRoom(); return () => app.tank.setViewInputEnabled(true); }, [app]);
  const tank = room.tanks.find(t => t.id === selected), adding = !tank;
  const valid = canPlaceTank(room.tanks, tank?.size ?? size, position, tank?.id);
  useEffect(() => { if (selected && !tank) setSelected(room.tanks[0]?.id ?? null); }, [room.tanks, selected]);
  useEffect(() => { setPosition(tank ? [...tank.position] : freeTankPosition(room.tanks, size) ?? [0, 0]); }, [selected, size, tank?.position[0], tank?.position[1]]);
  const fromPointer = (clientX: number, clientY: number): [number, number] => {
    const node = svg.current!, matrix = node.getScreenCTM()!, point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return [Math.round((point.x / 100 + ROOM_LIMITS.minX) * 20) / 20, Math.round((point.y / 100 + ROOM_LIMITS.minZ) * 20) / 20];
  };
  const dimensions = TANK_DIMENSIONS[tank?.size ?? size], ghost = mapPoint(position), footprint = tankFootprint(tank?.size ?? size);
  const dragPosition = (x: number, y: number): [number, number] => { const p = fromPointer(x, y); return [Math.round((p[0] - dragOffset.current[0]) * 20) / 20, Math.round((p[1] - dragOffset.current[1]) * 20) / 20]; };
  return <section class="room-placement glass" aria-label="部屋に水槽を設置">
    <header class="room-heading"><div><span class="eyebrow">MY AQUARIUM ROOM</span><h2>部屋に水槽を設置</h2></div><button class="btn" disabled={busy} onClick={() => app.closeRoomPlacement()}>戻る</button></header>
    <div class="room-capacity"><strong>設置 {room.tanks.length}/{limit}台</strong><span>Lv.5で2台 · Lv.10で3台</span><span class="room-slots">{ROOM_SLOT_LEVELS.map((lv, i) => <span class={app.encyclopedia.level >= lv ? 'unlocked' : ''} key={lv}>{i + 1}{app.encyclopedia.level < lv ? ` 🔒Lv.${lv}` : ''}</span>)}</span></div>
    <div class="room-body">
      <div class="room-plan-area"><svg ref={svg} class="room-plan" viewBox={`0 0 ${W} ${H}`} aria-label="水槽の配置図。タップして選択、ドラッグして移動" role="img"
        onPointerDown={e => { if (busy) return; if (e.target === e.currentTarget || (e.target as Element).classList.contains('room-floor')) { setPosition(fromPointer(e.clientX, e.clientY)); dragging.current = adding; dragOffset.current = [0, 0]; if (adding) e.currentTarget.setPointerCapture(e.pointerId); } }}
        onPointerMove={e => { if (dragging.current && !busy) setPosition(dragPosition(e.clientX, e.clientY)); }}
        onPointerUp={e => { if (dragging.current && !busy && tank) app.moveRoomTank(tank.id, dragPosition(e.clientX, e.clientY)); dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}>
        <defs><pattern id="room-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#293944" stroke-width="1" /></pattern></defs>
        <rect class="room-floor" width={W} height={H} rx="7" fill="url(#room-grid)" /><text x="12" y="25" class="room-wall-label">窓・棚側</text>
        {room.tanks.map((item, i) => { const [x, y] = mapPoint(item.position), [w, d] = tankFootprint(item.size); return <g key={item.id} class={`room-tank ${item.id === selected ? 'selected' : ''}`} onPointerDown={e => { if (busy) return; e.stopPropagation(); setSelected(item.id); setPosition([...item.position]); dragging.current = item.id === selected; const p = fromPointer(e.clientX, e.clientY); dragOffset.current = [p[0] - item.position[0], p[1] - item.position[1]]; if (dragging.current) svg.current!.setPointerCapture(e.pointerId); }}>
          <rect x={x - w * 50} y={y - d * 50} width={w * 100} height={d * 100} rx="5" /><text x={x} y={y + 7} text-anchor="middle">{i + 1} · {item.size}cm{item.id === room.mainTankId ? ' ★' : ''}</text>
        </g>; })}
        <rect class={`room-ghost ${valid ? 'valid' : 'invalid'}`} x={ghost[0] - footprint[0] * 50} y={ghost[1] - footprint[1] * 50} width={footprint[0] * 100} height={footprint[1] * 100} rx="5" pointer-events="none" />
      </svg><p class="room-map-hint">図をタップして位置を選択。選んだ水槽はドラッグで移動。</p><nav class="room-tank-list" aria-label="部屋の水槽">{room.tanks.map((item, i) => <button class={`btn ${selected === item.id ? 'on' : ''}`} disabled={busy} onClick={() => setSelected(item.id)} key={item.id}>{i + 1} · {item.size}cm</button>)}<button class={`btn ${adding ? 'on' : ''}`} disabled={busy || room.tanks.length >= limit} onClick={() => setSelected(null)}>＋追加</button></nav></div>
      <div class="room-form">
        {adding ? <label class="room-size">水槽の種類<select aria-label="追加する水槽のサイズ" disabled={busy} value={size} onChange={e => setSize(Number(e.currentTarget.value) as TankSize)}>{TANK_SIZES.map(s => <option value={s} key={s}>{s}cm水槽＋標準台</option>)}</select></label> : <h3>水槽{room.tanks.findIndex(t => t.id === selected) + 1} · {tank.size}cm</h3>}
        <p class="room-dimensions">幅{dimensions.width * 100} × 奥行{dimensions.depth * 100} × 高さ{dimensions.height * 100}cm<br />標準台：高さ73cm</p>
        <div class="room-position">{(['左右', '前後'] as const).map((label, i) => <label key={label}>{label} (m)<input aria-label={`水槽の${label}位置`} type="number" step="0.05" disabled={busy} value={position[i]} onChange={e => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) setPosition(p => i === 0 ? [n, p[1]] : [p[0], n]); }} /></label>)}</div>
        <p class={`room-validity ${valid ? '' : 'invalid'}`} aria-live="polite">{valid ? 'この位置に設置できます' : '他の水槽や壁と重ならない位置を選んでください'}</p>
        {adding ? <button class="btn primary" disabled={busy || !valid || room.tanks.length >= limit} onClick={async () => { if (await app.addRoomTank(size, position)) setSelected(app.activeTankId.value); }}>水槽と標準台を設置</button> : <>
          <button class="btn" disabled={busy || !valid} onClick={() => app.moveRoomTank(tank.id, position)}>この位置に移動</button>
          <button class="btn room-main" disabled={busy} aria-pressed={tank.id === room.mainTankId} onClick={() => app.setMainTank(tank.id)}>{tank.id === room.mainTankId ? '★ メイン水槽' : 'メイン水槽にする'}</button>
          <div class="room-secondary"><button class="btn" disabled={busy} onClick={async () => { await app.selectRoomTank(tank.id); app.closeRoomPlacement(); app.openTankEdit(); }}>この水槽を編集</button><button class="btn danger" disabled={busy} onClick={() => void app.removeRoomTank(tank.id)}>撤去する</button></div>
        </>}
        <p class="room-removal-note">撤去した設備は再利用できます。生物はケースへ戻ります。</p>
      </div>
    </div>
  </section>;
}
