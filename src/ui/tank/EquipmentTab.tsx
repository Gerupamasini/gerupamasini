import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { EQUIPMENT_KINDS, EQUIPMENT_LABELS, EQUIPMENT_MAX, FLOW_KINDS, type Endpoint, type EquipmentKind, type Vec3 } from '../../aquarium';
import { ui } from '../store';

/** Equipment is edited in the same paused tank editor and persisted by the existing save queue. */
export function EquipmentTab({ app }: { app: App }) {
  void ui.tankLayoutVersion.value;
  const rig = app.tank.equipment, layout = rig.currentLayout;
  const [kind, setKind] = useState<EquipmentKind>('spongeFilter');
  const [source, setSource] = useState(''), [target, setTarget] = useState('');
  const ports = [...rig.devices].flatMap(([id, d]) => [...d.ports.values()].map((p) => ({ device: id, port: p.name, kind: p.kind, role: p.role })));
  ports.push(...[...rig.tank.ports.values()].map((p) => ({ device: 'tank', port: p.name, kind: p.kind, role: p.role })), { device: 'mains', port: 'socket', kind: 'power', role: 'out' });
  const encode = (p: Endpoint) => JSON.stringify({ device: p.device, port: p.port });
  const from = ports.find((p) => encode(p) === source), to = ports.find((p) => encode(p) === target);
  const label = (id: string) => id === 'tank' ? '水槽' : id === 'mains' ? '壁コンセント' : EQUIPMENT_LABELS[layout.devices.find((d) => d.id === id)!.kind];
  const portLabel: Record<string, string> = { power: '電源', heater: 'ヒーター電源', sensor: '温度センサー', intake: '吸水口', return: '吐出口', air: 'エア口', in: 'IN', out: 'OUT', socket: 'コンセント' };
  const describe = (p: Endpoint) => `${label(p.device)} · ${portLabel[p.port] ?? p.port.replace('socket', 'コンセント ')}`;
  return <Fragment>
    <div class="equipment-summary"><span>水温 <strong class="num">{rig.temperature.toFixed(1)} °C</strong></span><span>循環 <strong class="num">{rig.flows.reduce((a, f) => a + f.flowRate, 0)} L/h</strong></span></div>
    <div class="equipment-view"><button onClick={() => app.tank.resetView()}>正面</button><button onClick={() => app.tank.focusEquipmentRear()}>配管・背面を見る</button></div>
    <h4>水槽台</h4>
    <div class="seg"><button class={layout.stand === 'wood' ? 'on' : ''} onClick={() => app.tankStand('wood')}>木製キャビネット</button><button class={layout.stand === 'metal' ? 'on' : ''} onClick={() => app.tankStand('metal')}>金属フレーム</button></div>
    <h4>設備 <span class="num">{layout.devices.length} / {EQUIPMENT_MAX}</span></h4>
    <div class="equipment-add"><select aria-label="追加する設備" value={kind} onChange={(e) => setKind(e.currentTarget.value as EquipmentKind)}>{EQUIPMENT_KINDS.map((k) => <option key={k} value={k}>{EQUIPMENT_LABELS[k]}</option>)}</select><button disabled={layout.devices.length >= EQUIPMENT_MAX} onClick={() => app.tankAddEquipment(kind)}>追加</button></div>
    {layout.devices.map((d) => {
      const device = rig.devices.get(d.id)!;
      const needsPower = device.ports.has('power'), active = needsPower ? device.powered : d.enabled;
      const thermostat = d.kind === 'heater' && layout.connections.find((c) => c.kind === 'power' && c.to.device === d.id && rig.devices.get(c.from.device)?.kind === 'thermostat');
      const waitingTemperature = thermostat && rig.devices.get(thermostat.from.device)?.powered;
      return <details key={d.id} class="equipment-card">
        <summary><span>{EQUIPMENT_LABELS[d.kind]}</span><span class={`equipment-status ${active ? 'active' : ''}`}>{active ? needsPower ? '通電' : '設置' : d.enabled ? waitingTemperature ? '温度待ち' : '電源待ち' : 'OFF'}</span></summary>
        <div class="equipment-actions"><button aria-pressed={d.enabled} onClick={() => app.tankChangeEquipment(d.id, { enabled: !d.enabled })}>{d.enabled ? 'OFFにする' : 'ONにする'}</button><button onClick={() => app.tankChangeEquipment(d.id, { rotation: d.rotation + Math.PI / 4 })}>45° 回転</button><button onClick={() => app.tankRemoveEquipment(d.id)}>取り外す</button></div>
        <div class="equipment-position">{(['X', '高さ', 'Z'] as const).map((axis, i) => <label key={axis}>{axis} (cm)<input type="number" step="0.5" min={i === 1 ? -72 : -80} max="80" value={Number((d.position[i] * 100).toFixed(1))} onChange={(e) => { const position = [...d.position] as Vec3; position[i] = Number(e.currentTarget.value) / 100; app.tankChangeEquipment(d.id, { position }); }} /></label>)}</div>
        {(FLOW_KINDS.includes(d.kind) || d.kind === 'thermostat' || d.kind === 'chiller') && <label class="equipment-setting">{FLOW_KINDS.includes(d.kind) ? '流量 (L/h)' : '設定温度 (°C)'}<input type="number" min={FLOW_KINDS.includes(d.kind) ? 0 : 16} max={FLOW_KINDS.includes(d.kind) ? 2000 : 32} step={FLOW_KINDS.includes(d.kind) ? 50 : 0.5} value={d.setting} onChange={(e) => app.tankChangeEquipment(d.id, { setting: Number(e.currentTarget.value) })} /></label>}
        {d.kind === 'heater' && <p class="small dim">100 W・サーモスタット接続時は設定温度に応じて通電します。</p>}
        {(d.kind === 'airStone' || d.kind === 'spongeFilter') && <p class="small dim">エアポンプとホースを接続すると気泡が発生します。</p>}
      </details>;
    })}
    <h4>接続</h4>
    <p class="small dim">設備を置いたあと、接続を整えます。電源タップは6口。エア口は1対1で接続します。</p>
    <button onClick={() => app.tankAutoConnect()}>標準配線・配管に整える</button>
    <details class="equipment-connect"><summary>手動で接続</summary>
      <label>供給側<select aria-label="供給側の端子" value={source} onChange={(e) => { setSource(e.currentTarget.value); setTarget(''); }}><option value="">端子を選択</option>{ports.filter((p) => p.role === 'out').map((p) => <option key={encode(p)} value={encode(p)}>{describe(p)}</option>)}</select></label>
      <label>接続先<select aria-label="接続先の端子" value={target} onChange={(e) => setTarget(e.currentTarget.value)}><option value="">端子を選択</option>{ports.filter((p) => p.role === 'in' && p.kind === from?.kind && p.device !== from.device).map((p) => <option key={encode(p)} value={encode(p)}>{describe(p)}</option>)}</select></label>
      <button disabled={!from || !to} onClick={() => { if (!from || !to) return; app.tankConnect({ id: `connection-${Date.now().toString(36)}`, kind: from.kind, from: { device: from.device, port: from.port }, to: { device: to.device, port: to.port }, radius: rig.resolvePort(to)!.radius }); }}>接続する</button>
    </details>
    <ul class="equipment-connections">{layout.connections.map((c) => <li key={c.id}><span><small>{c.kind === 'power' ? '電源' : c.kind === 'water' ? '水' : c.kind === 'air' ? 'エア' : 'センサー'}</small>{describe(c.from)} → {describe(c.to)}</span><button aria-label={`${describe(c.from)}の接続を外す`} onClick={() => app.tankDisconnect(c.id)}>外す</button></li>)}</ul>
    {rig.warnings.map((w) => <p key={w} class="small equipment-warning">{w}</p>)}
  </Fragment>;
}
