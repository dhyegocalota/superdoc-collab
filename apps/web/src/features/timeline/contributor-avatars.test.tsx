import { ClientActor } from '@superdoc-history/types';
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import {
  FIXTURE_AGENT_AUTHOR_KEY,
  FIXTURE_AGENT_AUTHOR_NAME,
  FIXTURE_AUTHOR_KEY,
  FIXTURE_AUTHOR_NAME,
  timelineWith,
} from '@/testing/timeline-fixtures';
import { ContributorAvatars } from './contributor-avatars';
import { AI_BADGE_LABEL } from './timeline-copy';

const { authors } = timelineWith({ volumes: [[1]], names: ['Budget'] });
const contributor = { inserted: 10, deleted: 0, wordsInserted: 2, wordsDeleted: 0 };

test('a human author shows no AI badge', () => {
  render(<ContributorAvatars authors={authors} contributors={[{ authorKey: FIXTURE_AUTHOR_KEY, ...contributor }]} />);
  expect(screen.getByTitle(FIXTURE_AUTHOR_NAME)).toBeInTheDocument();
  expect(screen.queryByLabelText(AI_BADGE_LABEL)).not.toBeInTheDocument();
});

test('an agent author shows the AI badge and keeps the human initials', () => {
  render(<ContributorAvatars authors={authors} contributors={[{ authorKey: FIXTURE_AGENT_AUTHOR_KEY, ...contributor }]} />);
  const avatar = screen.getByTitle(FIXTURE_AGENT_AUTHOR_NAME);
  expect(authors[FIXTURE_AGENT_AUTHOR_KEY]!.actor).toBe(ClientActor.Agent);
  expect(avatar).toContainElement(screen.getByRole('img', { name: AI_BADGE_LABEL }));
  expect(avatar).toHaveTextContent(/^A/);
});
