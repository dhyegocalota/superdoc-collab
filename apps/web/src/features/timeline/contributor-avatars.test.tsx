import { ClientActor } from '@superdoc-collab/types';
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { FIXTURE_AGENT_AUTHOR_KEY, FIXTURE_AUTHOR_KEY, FIXTURE_AUTHOR_NAME, timelineWith } from '@/testing/timeline-fixtures';
import { ContributorAvatars } from './contributor-avatars';
import { agentMarkLabel } from './timeline-copy';

const { authors } = timelineWith({ volumes: [[1]], names: ['Budget'] });
const contributor = { inserted: 10, deleted: 0, wordsInserted: 2, wordsDeleted: 0 };

test('a human author shows no AI badge', () => {
  render(<ContributorAvatars authors={authors} contributors={[{ authorKey: FIXTURE_AUTHOR_KEY, ...contributor }]} />);
  expect(screen.getByTitle(FIXTURE_AUTHOR_NAME)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('an agent author shows the AI badge and keeps the human initials', () => {
  render(<ContributorAvatars authors={authors} contributors={[{ authorKey: FIXTURE_AGENT_AUTHOR_KEY, ...contributor }]} />);
  const avatar = screen.getByTitle(FIXTURE_AUTHOR_NAME);
  expect(authors[FIXTURE_AGENT_AUTHOR_KEY]!.actor).toBe(ClientActor.Agent);
  expect(avatar).toContainElement(screen.getByRole('img', { name: agentMarkLabel(FIXTURE_AUTHOR_NAME) }));
  expect(avatar).toHaveTextContent(/^A/);
});

test('a human whose name looks like an AI shows no AI icon', () => {
  const lookalike = { bob: { id: 'user-2', name: 'Bob · AI', actor: ClientActor.Human } };
  render(<ContributorAvatars authors={lookalike} contributors={[{ authorKey: 'bob', ...contributor }]} />);
  expect(screen.getByTitle('Bob · AI')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
