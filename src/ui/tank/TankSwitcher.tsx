import type { App } from '../../app/App';

export function TankSwitcher({ app, editor = false }: { app: App; editor?: boolean }) {
  const room = app.aquariumRoom.value;
  if (!room.tanks.length) return <button class="btn room-add-home" onClick={() => app.openRoomPlacement()}>水槽を設置</button>;
  if (room.tanks.length === 1 && !editor) return null;
  return <nav class={`tank-switcher ${editor ? 'editor-switcher' : 'home-switcher'}`} aria-label="水槽の切り替え">
    {room.tanks.map((tank, index) => <button key={tank.id} class={`btn ${tank.id === app.activeTankId.value ? 'on' : ''}`} aria-label={`水槽${index + 1}を見る`} aria-pressed={tank.id === app.activeTankId.value} title={`${tank.size}cm${tank.id === room.mainTankId ? '・メイン水槽' : ''}`} disabled={app.roomBusy.value} onClick={() => void app.selectRoomTank(tank.id)}>{index + 1}{tank.id === room.mainTankId && <small aria-hidden="true">★</small>}</button>)}
    <span>{app.currentRoomTank?.size}cm</span>
  </nav>;
}
