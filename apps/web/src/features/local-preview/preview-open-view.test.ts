import { BootstrapStage } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { bootstrapAt } from '@/testing/opened-document';
import { OpenStage } from '@/features/open-progress/open-stage';
import { PREVIEW_OPENING_DETAIL } from './local-preview-copy';
import { previewOpenView } from './preview-open-view';

const STARTED_AT = 1_000_000;
const ELAPSED_SECONDS = 7;

function viewWith(overrides: { pageCount?: number; bootstrap?: ReturnType<typeof bootstrapAt> | null } = {}) {
  return previewOpenView({
    bootstrap: bootstrapAt(BootstrapStage.Queued),
    pageCount: 0,
    elapsedSeconds: ELAPSED_SECONDS,
    startedAt: STARTED_AT,
    answeredAt: STARTED_AT,
    ...overrides,
  });
}

test('stays on the Preparing stage and names the preview before the server detail', () => {
  const view = viewWith();
  expect(view.stage).toBe(OpenStage.Preparing);
  expect(view.detail.startsWith(PREVIEW_OPENING_DETAIL)).toBe(true);
  expect(view.detail).toContain('7 s');
});

test('adds the pages laid out so far once there are some', () => {
  expect(viewWith({ pageCount: 0 }).detail).not.toContain('so far');
  expect(viewWith({ pageCount: 123 }).detail).toContain('123 so far');
});

test('keeps the server fraction of the bar', () => {
  const bootstrap = { ...bootstrapAt(BootstrapStage.Preparing), done: 400, total: 1000 };
  expect(viewWith({ bootstrap }).fraction).toBe(0.4);
});

test('without an open answer yet the detail still names the preview', () => {
  expect(viewWith({ bootstrap: null }).detail.startsWith(PREVIEW_OPENING_DETAIL)).toBe(true);
});
