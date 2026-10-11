import { useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { INTRO_QUESTS } from '../../aquarium/progression';

export function QuestList({ app }: { app: App }) {
  const [page, setPage] = useState(0), p = app.aquariumProgression;
  const last = Math.ceil(INTRO_QUESTS.length / 2) - 1;
  return <div class="intro-quests">
    <p class="small dim">達成するとCRを自動で受け取れます（各1回）。</p>
    <div class="intro-quest-list">{INTRO_QUESTS.slice(page * 2, page * 2 + 2).map(q => {
      const done = p.questRewards.includes(q.id);
      return <article class={`intro-quest ${done ? 'done' : ''}`} key={q.id} data-quest={q.id}>
        <div><strong>{done ? '✓ ' : ''}{q.title}</strong><span class="num">{done ? '受取済み' : `+${q.cr} CR`}</span></div>
        <p>{q.hint}</p>
      </article>;
    })}</div>
    <div class="intro-quest-pages"><button class="btn ghost sm" disabled={!page} onClick={() => setPage(page - 1)}>前へ</button><span>{page + 1}/{last + 1} · 達成{p.questRewards.length}/{INTRO_QUESTS.length}</span><button class="btn ghost sm" disabled={page === last} onClick={() => setPage(page + 1)}>次へ</button></div>
  </div>;
}
