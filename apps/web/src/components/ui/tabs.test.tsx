import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

function renderTabs() {
  render(
    <Tabs defaultValue="claude">
      <TabsList aria-label="Clients">
        <TabsTrigger value="claude">Claude</TabsTrigger>
        <TabsTrigger value="cursor">Cursor</TabsTrigger>
      </TabsList>
      <TabsContent value="claude">Claude snippet</TabsContent>
      <TabsContent value="cursor">Cursor snippet</TabsContent>
    </Tabs>,
  );
}

test('selects one tab panel at a time', async () => {
  renderTabs();
  const user = userEvent.setup();
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Claude snippet');
  expect(screen.queryByText('Cursor snippet')).not.toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Cursor' }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Cursor snippet');
  expect(screen.queryByText('Claude snippet')).not.toBeInTheDocument();
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
});

test('arrow keys move between tabs and the selected tab is announced', async () => {
  renderTabs();
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole('tab', { name: 'Claude' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'Claude' })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Cursor' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'Cursor' })).toHaveAttribute('aria-selected', 'true');
});
