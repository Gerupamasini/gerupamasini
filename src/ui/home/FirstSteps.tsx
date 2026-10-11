import type { App } from '../../app/App';
import { ui } from '../store';

/** Short optional guidance at the edge; never covers the animals in the centre. */
export function FirstSteps({ app }: { app: App }) {
  if (ui.guideDismissed.value) return null;
  return <aside class="first-steps" aria-label="はじめての採集">
    <details><summary>はじめての採集</summary>
      <p>①「干潟へ」で場所を選び、潮見表で干潮に合わせます。</p>
      <p>②水際の生物は網、砂の中の貝はスコップで採集。図鑑の生息ヒントも参考に。</p>
      <p>③ケースの生物を持ち帰り、「水槽」で移します。研究所に提供すると研究ポイントが増えます。</p>
      <p>研究100 RPごとに設備ガチャチケット1枚。</p>
      <button class="btn sm" onClick={() => { ui.guideDismissed.value = true; app.requestSave(); }}>案内を閉じる</button>
    </details>
  </aside>;
}
