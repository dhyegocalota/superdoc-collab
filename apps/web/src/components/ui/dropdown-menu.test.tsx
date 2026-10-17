import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

function renderMenu() {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup defaultValue="light">
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

test('exports a label, a separator and a radio group with radio items', async () => {
  expect([DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem].map((part) => typeof part)).toEqual([
    'function',
    'function',
    'function',
    'function',
  ]);
  renderMenu();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Open' }));
  expect(await screen.findByText('Theme')).toBeInTheDocument();
  expect(screen.getByRole('separator')).toBeInTheDocument();
  expect(screen.getByRole('menuitemradio', { name: 'Light' })).toBeChecked();
  expect(screen.getByRole('menuitemradio', { name: 'Dark' })).not.toBeChecked();
});

test('choosing a radio item checks it and unchecks the other', async () => {
  renderMenu();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));
  await user.click(screen.getByRole('button', { name: 'Open' }));
  expect(await screen.findByRole('menuitemradio', { name: 'Dark' })).toBeChecked();
  expect(screen.getByRole('menuitemradio', { name: 'Light' })).not.toBeChecked();
});
