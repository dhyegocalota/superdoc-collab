import { SECOND_MS } from '@superdoc-collab/types';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { EDITOR_OPEN_STAGES, OpenStage } from './open-stage';
import { TickingOpenProgressPanel } from './ticking-open-progress-panel';

const STARTED_AT = new Date('2026-10-19T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ now: STARTED_AT });
});

afterEach(() => {
  vi.useRealTimers();
});

test('the detail line follows the seconds since the start without the parent rendering again', () => {
  render(
    <TickingOpenProgressPanel
      title={null}
      stages={EDITOR_OPEN_STAGES}
      startedAt={STARTED_AT.getTime()}
      viewAt={(elapsedSeconds) => ({ stage: OpenStage.Downloading, detail: `${elapsedSeconds} s`, fraction: null })}
      action={null}
    />,
  );
  expect(screen.getByTestId('open-progress-detail')).toHaveTextContent('0 s');
  act(() => vi.advanceTimersByTime(4 * SECOND_MS));
  expect(screen.getByTestId('open-progress-detail')).toHaveTextContent('4 s');
});
