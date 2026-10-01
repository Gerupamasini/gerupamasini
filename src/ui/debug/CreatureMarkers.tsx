import { h } from 'preact';
import { ui } from '../store';

/** Labels projected over every live creature (debug mode). */
export function CreatureMarkers() {
  if (!ui.debug.value || !ui.debugState.value.markers) return null;
  return (
    <div class="markers">
      {ui.markers.value.map((m) => (
        <div key={m.id} class={`marker ${m.kind}`} style={{ left: `${m.x}px`, top: `${m.y}px` }}>{m.text}</div>
      ))}
    </div>
  );
}
