import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

function ThemeMenu() {
  const [theme, setTheme] = useState('light');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function renderMenu() {
  render(<ThemeMenu />);
}

test('shows a label, a separator and a radio group with radio items', async () => {
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
