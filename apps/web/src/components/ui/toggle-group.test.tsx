import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

function renderGroup() {
  render(
    <ToggleGroup type="single" defaultValue="bottom" aria-label="Edits panel position">
      <ToggleGroupItem value="bottom" aria-label="Bottom">
        B
      </ToggleGroupItem>
      <ToggleGroupItem value="side" aria-label="Side">
        S
      </ToggleGroupItem>
    </ToggleGroup>,
  );
}

test('arrow keys move selection between two items', async () => {
  renderGroup();
  const user = userEvent.setup();
  const bottom = screen.getByRole('radio', { name: 'Bottom' });
  const side = screen.getByRole('radio', { name: 'Side' });
  expect(bottom).toBeChecked();
  expect(side).not.toBeChecked();
  await user.tab();
  expect(bottom).toHaveFocus();
  await user.keyboard('{ArrowRight}');
  expect(side).toHaveFocus();
  await user.keyboard(' ');
  expect(side).toBeChecked();
  expect(bottom).not.toBeChecked();
  await user.keyboard('{ArrowLeft}');
  expect(bottom).toHaveFocus();
});

test('exactly one item is in the tab order', () => {
  renderGroup();
  const tabIndexes = screen.getAllByRole('radio').map((item) => item.getAttribute('tabindex'));
  expect(tabIndexes).toEqual(['0', '-1']);
});

test('a toggle group is a named radio group', () => {
  renderGroup();
  expect(screen.getByRole('radiogroup', { name: 'Edits panel position' })).toBeInTheDocument();
});
