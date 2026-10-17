import { ClientActor } from '@superdoc-collab/types';
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { AuthorNames } from './author-names';
import { agentMarkLabel } from './timeline-copy';

const AUTHORS = {
  ana: { id: '1', name: 'Ana', actor: ClientActor.Human },
  'ana#agent': { id: '1', name: 'Ana', actor: ClientActor.Agent },
  bob: { id: '2', name: 'Bob · AI', actor: ClientActor.Human },
};

test('names follow the keys, join with a comma and only the agent carries the icon', () => {
  const { container } = render(<AuthorNames authors={AUTHORS} authorKeys={['bob', 'ana', 'ana#agent']} />);
  expect(container).toHaveTextContent('Bob · AI, Ana, Ana');
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.getByRole('img', { name: agentMarkLabel('Ana') })).toBeInTheDocument();
});

test('an unknown author key throws instead of printing nothing', () => {
  expect(() => render(<AuthorNames authors={AUTHORS} authorKeys={['carla']} />)).toThrow();
});
