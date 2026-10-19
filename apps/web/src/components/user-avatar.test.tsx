import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { agentMarkLabel } from '@/features/timeline/timeline-copy';
import { UserAvatar, UserAvatarSize } from './user-avatar';

const NAME = 'Ana Lima';
const ONLINE_DOT_SELECTOR = '.bg-online';

function renderAvatar(props: Partial<Parameters<typeof UserAvatar>[0]> = {}) {
  return render(<UserAvatar name={NAME} colorSlot={3} size={UserAvatarSize.Large} isAgent={false} isOnline={false} {...props} />);
}

test('renders the initials of the name', () => {
  const { container } = renderAvatar();
  expect(container.firstElementChild).toHaveTextContent('AL');
});

test('every colour slot maps to its author background class', () => {
  const slots = [1, 2, 3, 4, 5, 6] as const;
  const classes = slots.map((colorSlot) => {
    const { container, unmount } = renderAvatar({ colorSlot });
    const matching = slots.filter((slot) => container.firstElementChild!.classList.contains(`bg-author-${slot}`));
    unmount();
    return matching;
  });
  expect(classes).toEqual(slots.map((slot) => [slot]));
});

test('an agent carries the agent mark and a human does not', () => {
  const { unmount } = renderAvatar({ isAgent: true });
  expect(screen.getByRole('img', { name: agentMarkLabel(NAME) })).toBeInTheDocument();
  unmount();
  renderAvatar();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('the online dot shows only while online', () => {
  const { container, rerender } = renderAvatar({ isOnline: true });
  expect(container.querySelector(ONLINE_DOT_SELECTOR)).toBeInTheDocument();
  rerender(<UserAvatar name={NAME} colorSlot={3} size={UserAvatarSize.Large} isAgent={false} isOnline={false} />);
  expect(container.querySelector(ONLINE_DOT_SELECTOR)).not.toBeInTheDocument();
});
