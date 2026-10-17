import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const TOOLTIP_TEXT = 'Find in document';

function renderTooltip() {
  render(
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button">Find</button>
        </TooltipTrigger>
        <TooltipContent>{TOOLTIP_TEXT}</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
}

test('opens on keyboard focus', async () => {
  renderTooltip();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await userEvent.setup().tab();
  expect(await screen.findByRole('tooltip')).toHaveTextContent(TOOLTIP_TEXT);
});

test('closes on Escape and describes the trigger while open', async () => {
  renderTooltip();
  const user = userEvent.setup();
  await user.tab();
  await screen.findByRole('tooltip');
  expect(screen.getByRole('button', { name: 'Find' })).toHaveAccessibleDescription(TOOLTIP_TEXT);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
