import { h } from 'preact';
import { ui } from '../store';

export function Toasts() {
  return (
    <div class="toasts">
      {ui.toasts.value.map((tt) => <div key={tt.id} class={`toast ${tt.kind}`}>{tt.text}</div>)}
    </div>
  );
}
