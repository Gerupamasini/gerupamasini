import type { App } from '../../app/App';
import { ui } from '../store';
import { QuestList } from './QuestList';
import { INTRO_QUESTS } from '../../aquarium/progression';

/** Short optional guidance at the edge; never covers the animals in the centre. */
export function FirstSteps({ app }: { app: App }) {
  const p = app.aquariumProgression;
  if (ui.guideDismissed.value) return <button class="btn first-steps quest-reopen" onClick={() => { ui.guideDismissed.value = false; app.requestSave(); }}>クエスト {p.questRewards.length}/{INTRO_QUESTS.length}</button>;
  return <aside class="first-steps" aria-label="はじめての採集">
    <details><summary>手引き・クエスト {p.questRewards.length}/{INTRO_QUESTS.length}</summary>
      <QuestList app={app} />
      <button class="btn sm" onClick={() => app.openShop('filters')}>ショップで設備を解放・強化</button>
      <button class="btn sm" onClick={() => { ui.guideDismissed.value = true; app.requestSave(); }}>案内を閉じる</button>
    </details>
  </aside>;
}
