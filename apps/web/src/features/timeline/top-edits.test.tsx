import { ClientActor, documentPagePath, type TopicSummaries } from '@superdoc-collab/types';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import { TOP_EDITS_LABEL } from './timeline-copy';
import { TopEdits } from './top-edits';

const ROUTE = documentPagePath(DOCUMENT_ID);
const base = timelineWith({
  volumes: [
    [100, 300, 0],
    [240, 200, 0],
  ],
  names: ['Budget', 'Hiring', 'Idle'],
});
const [budget, hiring] = base.bands;
const timeline = {
  ...base,
  authors: {
    ana: { id: '1', name: 'Ana Souza', actor: ClientActor.Human },
    bruno: { id: '2', name: 'Bruno Lima', actor: ClientActor.Human },
    carla: { id: '3', name: 'Carla Dias', actor: ClientActor.Human },
    diego: { id: '4', name: 'Diego Reis', actor: ClientActor.Human },
  },
  contributorsByBand: {
    [budget!.id]: [
      { authorKey: 'ana', inserted: 10, deleted: 0, wordsInserted: 2, wordsDeleted: 0 },
      { authorKey: 'bruno', inserted: 200, deleted: 0, wordsInserted: 8, wordsDeleted: 1 },
      { authorKey: 'carla', inserted: 90, deleted: 0, wordsInserted: 1, wordsDeleted: 2 },
      { authorKey: 'diego', inserted: 40, deleted: 0, wordsInserted: 1, wordsDeleted: 0 },
    ],
    [hiring!.id]: [{ authorKey: 'ana', inserted: 500, deleted: 0, wordsInserted: 5, wordsDeleted: 0 }],
  },
};
const summaries: TopicSummaries = { summaries: [{ topicId: budget!.id, sentence: 'Budget was cut by a third.', computedAtSequence: 3 }] };

test('rows follow volume, skip silent bands and show chip, avatars, words and the sentence', () => {
  renderWithProviders(<TopEdits timeline={timeline} summaries={summaries} />, { route: ROUTE });
  const chips = screen.getAllByRole('button');
  expect(chips.map((chip) => chip.textContent)).toEqual(['Hiring', 'Budget']);
  const row = screen.getByRole('button', { name: 'Budget' }).closest('li')!;
  expect(row.querySelector('.topic-swatch')).toHaveStyle({ '--topic-hue': String(budget!.hue) });
  expect(
    within(row)
      .getAllByTitle(/.+/)
      .map((avatar) => avatar.getAttribute('title')),
  ).toEqual(['Bruno Lima', 'Carla Dias', 'Diego Reis']);
  expect(row).toHaveTextContent('+12 words −3 words');
  expect(row).toHaveTextContent('Budget was cut by a third.');
});

test('each topic callout has the tinted background token', () => {
  renderWithProviders(<TopEdits timeline={timeline} summaries={summaries} />, { route: ROUTE });
  const callout = screen.getByText('Budget was cut by a third.');
  expect(callout).toHaveClass('topic-tint');
  expect(callout).toHaveStyle({ '--topic-hue': String(budget!.hue) });
  expect(callout.getAttribute('style')).toContain('--topic-saturation');
});

test('clicking a chip sets the topic and clicking again removes it', async () => {
  const user = userEvent.setup();
  const { router } = renderWithProviders(<TopEdits timeline={timeline} summaries={summaries} />, { route: ROUTE });
  await user.click(screen.getByRole('button', { name: 'Budget' }));
  expect(router.state.location.search).toBe(`?topic=${budget!.id}`);
  await user.click(screen.getByRole('button', { name: 'Budget' }));
  expect(router.state.location.search).toBe('');
});

test('equal volumes and equal contributions are ordered by id', () => {
  const tied = timelineWith({ volumes: [[50, 50]], names: ['Zed', 'Alpha'] });
  const [zed, alpha] = tied.bands;
  const reversed = {
    ...tied,
    bands: [
      { ...zed!, id: 'b-topic' },
      { ...alpha!, id: 'a-topic' },
    ],
    authors: timeline.authors,
    contributorsByBand: {
      'b-topic': [
        { authorKey: 'carla', inserted: 5, deleted: 0, wordsInserted: 1, wordsDeleted: 0 },
        { authorKey: 'ana', inserted: 5, deleted: 0, wordsInserted: 1, wordsDeleted: 0 },
        { authorKey: 'bruno', inserted: 5, deleted: 0, wordsInserted: 1, wordsDeleted: 0 },
      ],
    },
  };
  renderWithProviders(<TopEdits timeline={reversed} summaries={undefined} />, { route: ROUTE });
  expect(screen.getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Alpha', 'Zed']);
  const row = screen.getByRole('button', { name: 'Zed' }).closest('li')!;
  expect(
    within(row)
      .getAllByTitle(/.+/)
      .map((avatar) => avatar.getAttribute('title')),
  ).toEqual(['Ana Souza', 'Bruno Lima', 'Carla Dias']);
});

test('no band with edits renders nothing, not an empty heading', () => {
  renderWithProviders(<TopEdits timeline={timelineWith({ volumes: [[0]], names: ['Budget'] })} summaries={undefined} />, { route: ROUTE });
  expect(screen.queryByRole('heading', { name: TOP_EDITS_LABEL })).not.toBeInTheDocument();
});
