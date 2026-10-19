import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { SummarizeEditsButton } from './summarize-edits-button';
import { SUMMARIZE_EDITS_LABEL, SUMMARIZING_LABEL } from './timeline-copy';

test('is enabled when idle, and while running is disabled, reads Summarizing… and has aria-busy', async () => {
  const user = userEvent.setup();
  const onSummarize = vi.fn();
  const { rerender } = render(<SummarizeEditsButton isRunning={false} onSummarize={onSummarize} />);
  const idle = screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL });
  expect(idle).toBeEnabled();
  expect(idle).not.toHaveAttribute('aria-busy', 'true');
  await user.click(idle);
  expect(onSummarize).toHaveBeenCalledTimes(1);
  rerender(<SummarizeEditsButton isRunning onSummarize={onSummarize} />);
  const running = screen.getByRole('button', { name: SUMMARIZING_LABEL });
  expect(running).toBeDisabled();
  expect(running).toHaveAttribute('aria-busy', 'true');
});

test('its tooltip carries the Ctrl+Alt+S hint', async () => {
  render(<SummarizeEditsButton isRunning={false} onSummarize={vi.fn()} />);
  await userEvent.hover(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  const tooltip = await screen.findByRole('tooltip');
  expect([...tooltip.querySelectorAll('kbd')].map((pill) => pill.textContent)).toEqual(['Ctrl', 'Alt', 'S']);
});
