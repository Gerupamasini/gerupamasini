import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { App } from '../app/App';
import type { Action, Input } from '../core/Input';
import { ui } from './store';

/** Each finger owns its button until release, including release outside the button. */
export function HoldButton({ input, action, children, className = '' }: { input: Input; action: Action; children: string; className?: string }) {
  const pointer = useRef<number | null>(null);
  const [held, setHeld] = useState(false);
  const release = () => { pointer.current = null; input.setTouchAction(action, false); setHeld(false); };
  useEffect(() => {
    const hidden = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      input.setTouchAction(action, false);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [input, action]);
  return <button class={`touch-button ${className} ${held ? 'held' : ''}`} data-action={action} aria-pressed={held}
    onPointerDown={(e) => {
      e.preventDefault();
      if (pointer.current !== null) return;
      pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId);
      input.setTouchAction(action, true); setHeld(true);
    }}
    onPointerUp={(e) => { if (e.pointerId === pointer.current) release(); }}
    onPointerCancel={(e) => { if (e.pointerId === pointer.current) release(); }}
    onLostPointerCapture={(e) => { if (e.pointerId === pointer.current) release(); }}
    onContextMenu={(e) => e.preventDefault()}>{children}</button>;
}

export function MovementStick({ input, label }: { input: Input; label: string }) {
  const pointer = useRef<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const release = () => { pointer.current = null; input.setTouchMove(0, 0); setOffset({ x: 0, y: 0 }); };
  useEffect(() => {
    const hidden = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      input.setTouchMove(0, 0);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [input]);
  const move = (e: PointerEvent, el: HTMLDivElement) => {
    const r = el.getBoundingClientRect(), radius = r.width * 0.32;
    const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    const length = Math.hypot(dx, dy), fraction = Math.min(1, length / radius);
    const x = length > 0 ? dx / length : 0, y = length > 0 ? dy / length : 0;
    const strength = Math.max(0, (fraction - 0.12) / 0.88);
    input.setTouchMove(x * strength, -y * strength);
    setOffset({ x: x * fraction * radius, y: y * fraction * radius });
  };
  return <div class="touch-stick" role="group" aria-label={label}
    onPointerDown={(e) => {
      e.preventDefault(); if (pointer.current !== null) return;
      pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e, e.currentTarget);
    }}
    onPointerMove={(e) => { if (pointer.current === e.pointerId) move(e, e.currentTarget); }}
    onPointerUp={(e) => { if (pointer.current === e.pointerId) release(); }}
    onPointerCancel={(e) => { if (pointer.current === e.pointerId) release(); }}
    onLostPointerCapture={(e) => { if (pointer.current === e.pointerId) release(); }}>
    <span class="stick-cross" aria-hidden="true" />
    <i style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} aria-hidden="true" />
    <span class="stick-label">{label}</span>
  </div>;
}

/** Only gameplay controls live here; overlays keep their own close and selection buttons. */
export function TouchControls({ app }: { app: App }) {
  const screen = ui.screen.value;
  const [more, setMore] = useState(false);
  const [tools, setTools] = useState(false);
  const [actions, setActions] = useState(false);
  const input = app.input;
  // HUD updates keep the posture label in sync with the controller.
  void ui.hud.value;
  useEffect(() => () => input.clearTouch(), [input]);
  if (ui.transition.value || ui.mapOpen.value || (screen === 'home' && ui.homePanel.value !== 'none')) return null;
  if (screen === 'capture') return <div class="touch-controls touch-capture"><HoldButton input={input} action="interact">次へ</HoldButton></div>;
  if (screen !== 'field') return null;
  const tool = app.data.tools.get(ui.tool.value);
  return <div class="touch-controls touch-field">
    <div class="touch-toolbar">
      <button class="touch-button" onClick={() => { setTools(false); setActions(false); setMore(!more); }} aria-expanded={more} aria-controls="touch-more">{more ? '閉じる' : 'メニュー'}</button>
    </div>
    {more && <nav id="touch-more" class="touch-more" aria-label="干潟メニュー">
      <button class="touch-button" onClick={() => app.toggleMap()}>地図</button>
      <button class="touch-button" onClick={() => app.openCase()}>ケース</button>
      <button class="touch-button" onClick={() => app.openOverlay('zukan')}>図鑑</button>
      <button class="touch-button" onClick={() => app.openOverlay('ticket')}>潮時チケット</button>
      <button class="touch-button" onClick={() => app.toggleSunglasses()}>サングラス</button>
      <button class="touch-button" onClick={() => app.enterHome()}>自宅へ</button>
      <button class="touch-button" onClick={() => { setMore(false); setActions(true); }}>追加操作</button>
      <button class="touch-button" onClick={() => app.openOverlay('menu')}>設定</button>
    </nav>}
    <MovementStick input={input} label="移動" />
    <div class="touch-tool-select">
      <button class="touch-button" aria-label={`道具を選ぶ：${tool?.ja ?? ''}`} aria-expanded={tools} aria-controls="touch-tool-options" onClick={() => { setMore(false); setActions(false); setTools(!tools); }}>{tool?.ja ?? '道具'} ▾</button>
      {tools && <div id="touch-tool-options" class="touch-tool-options">
        {app.encyclopedia.loadout.value.map((id) => <button key={id} class="touch-button" aria-pressed={id === ui.tool.value} onClick={() => { app.setTool(id); setTools(false); }}>{app.data.tools.get(id)?.ja ?? id}</button>)}
      </div>}
    </div>
    {actions && <div class="touch-extra-actions">
      <button class="touch-button touch-extra-close" onClick={() => setActions(false)}>操作を閉じる</button>
      <HoldButton input={input} action="crouch">{app.player?.lowView ? '立つ' : '低い視点'}</HoldButton>
      <HoldButton input={input} action="run">走る</HoldButton>
      <HoldButton input={input} action="jump">ジャンプ</HoldButton>
      <HoldButton input={input} action="zoom">望遠</HoldButton>
    </div>}
    <div class="touch-actions">
      <HoldButton input={input} action="interact" className="touch-primary">{tool?.type === 'optic' ? '双眼鏡' : '採集'}</HoldButton>
      <HoldButton input={input} action="observe">観察</HoldButton>
    </div>
  </div>;
}
