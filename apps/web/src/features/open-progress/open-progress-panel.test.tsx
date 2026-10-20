import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { MAXIMIZE_PROGRESS_LABEL, MINIMIZE_PROGRESS_LABEL, OPEN_STAGE_LABELS, stageAnnouncement } from './open-progress-copy';
import { BootstrapStage } from '@superdoc-collab/types';
import { bootstrapAt } from '@/testing/opened-document';
import { preparingView } from './open-progress-view';
import { OpenProgressPanel, type OpenProgressView, type PanelMinimization } from './open-progress-panel';
import { EDITOR_OPEN_STAGES, OpenStage } from './open-stage';

const PREPARED = 12_400;
const TOTAL = 56_800;
const PREPARING_VIEW: OpenProgressView = { stage: OpenStage.Preparing, detail: '12,400 of 56,800 paragraphs', fraction: PREPARED / TOTAL };

function renderPanel({ view = PREPARING_VIEW, title = 'Heavy' as string | null, action = null as React.ReactNode } = {}) {
  render(<OpenProgressPanel title={title} stages={EDITOR_OPEN_STAGES} view={view} action={action} />);
}

function stageItem(stage: OpenStage): HTMLElement {
  return screen.getByText(OPEN_STAGE_LABELS[stage]).closest('li')!;
}

test('a number gives a determinate bar with its value and its detail', () => {
  renderPanel();
  const bar = screen.getByRole('progressbar');
  expect(bar).toHaveAttribute('aria-valuenow', '22');
  expect(bar).toHaveAttribute('aria-valuetext', PREPARING_VIEW.detail);
  expect(screen.getByText(PREPARING_VIEW.detail)).toBeInTheDocument();
});

test('no number gives an indeterminate bar', () => {
  renderPanel({ view: { stage: OpenStage.Downloading, detail: 'Receiving 36.5 MB · 12 s', fraction: null } });
  const bar = screen.getByRole('progressbar');
  expect(bar).not.toHaveAttribute('aria-valuenow');
  expect(bar).toHaveAttribute('data-state', 'indeterminate');
});

test.each([
  [OpenStage.Preparing, ['current', 'pending', 'pending']],
  [OpenStage.Downloading, ['done', 'current', 'pending']],
  [OpenStage.Rendering, ['done', 'done', 'current']],
])('at %s the stages read %j', (stage, states) => {
  renderPanel({ view: { stage, detail: '', fraction: null } });
  expect(EDITOR_OPEN_STAGES.map((listed) => stageItem(listed).getAttribute('data-state'))).toEqual(states);
  expect(stageItem(stage)).toHaveAttribute('aria-current', 'step');
});

test('the panel is one polite status that carries the stage and the document title', () => {
  renderPanel({ view: { stage: OpenStage.Rendering, detail: '', fraction: null } });
  const status = screen.getByRole('status');
  expect(status).toHaveAttribute('aria-live', 'polite');
  expect(within(status).getByText('Heavy')).toBeInTheDocument();
  expect(within(status).getByText(stageAnnouncement({ stages: EDITOR_OPEN_STAGES, stage: OpenStage.Rendering }))).toBeInTheDocument();
  expect(screen.getByTestId('open-progress')).toHaveAttribute('data-stage', OpenStage.Rendering);
});

test('a missing title and an action are both honoured', () => {
  renderPanel({ title: null, action: <button type="button">Leave</button> });
  expect(screen.queryByText('Heavy')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
});

test('the bar of an estimated conversion follows the fraction it is shown', () => {
  const bootstrap = { ...bootstrapAt(BootstrapStage.Preparing), total: 9_961_472, stateBytes: null, estimatedMs: 40_000 };
  renderPanel({ view: preparingView({ bootstrap, elapsedSeconds: 12, startedAt: 0, answeredAt: 0, preparedOnDeviceOf: null }) });
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
});

function renderMinimizable({ isMinimized }: { isMinimized: boolean }): PanelMinimization {
  const minimization: PanelMinimization = { isMinimized, onMinimizedChange: vi.fn() };
  render(<OpenProgressPanel title="Heavy" stages={EDITOR_OPEN_STAGES} view={PREPARING_VIEW} action={null} minimization={minimization} />);
  return minimization;
}

test('without a minimization the panel carries no minimize control', () => {
  renderPanel();
  expect(screen.queryByRole('button', { name: MINIMIZE_PROGRESS_LABEL })).not.toBeInTheDocument();
});

test('a maximized panel offers to minimize and asks for it on click', () => {
  const minimization = renderMinimizable({ isMinimized: false });
  fireEvent.click(screen.getByRole('button', { name: MINIMIZE_PROGRESS_LABEL }));
  expect(minimization.onMinimizedChange).toHaveBeenCalledWith(true);
  expect(stageItem(OpenStage.Preparing)).toBeInTheDocument();
});

test('a minimized panel is a thin bar with the stage and the detail, and offers to maximize', () => {
  const minimization = renderMinimizable({ isMinimized: true });
  const bar = screen.getByTestId('open-progress');
  expect(bar).toHaveAttribute('data-minimized', 'true');
  expect(bar).toHaveAttribute('data-stage', OpenStage.Preparing);
  expect(within(bar).getByText(OPEN_STAGE_LABELS[OpenStage.Preparing])).toBeInTheDocument();
  expect(screen.getByTestId('open-progress-detail')).toHaveTextContent(PREPARING_VIEW.detail);
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: MAXIMIZE_PROGRESS_LABEL }));
  expect(minimization.onMinimizedChange).toHaveBeenCalledWith(false);
});
