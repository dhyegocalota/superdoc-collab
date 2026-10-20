import { BootstrapStage } from '@superdoc-collab/types';
import { describe, expect, test } from 'vitest';
import { bootstrapAt } from '@/testing/opened-document';
import {
  downloadingView,
  editorOpenView,
  preparingView,
  renderingView,
  uploadingView,
  type EditorLoadProgress,
} from './open-progress-view';
import { OpenStage } from './open-stage';

const TOTAL_BYTES = 9_961_472;
const PAGE_STARTED_AT = 1_700_000_000_000;
const SENT_BYTES = 4_980_736;

function preparing({ stage, done, total }: { stage: BootstrapStage; done: number; total: number }) {
  return preparingView({
    bootstrap: { ...bootstrapAt(stage), done, total, fileBytes: TOTAL_BYTES, stateBytes: null },
    elapsedSeconds: 12,
    startedAt: PAGE_STARTED_AT,
  });
}

function estimating({
  done = 0,
  estimatedMs,
  elapsedSeconds,
  stage = BootstrapStage.Preparing,
  preparingSecondsAgo = null,
}: {
  done?: number;
  estimatedMs: number | null;
  elapsedSeconds: number;
  stage?: BootstrapStage;
  preparingSecondsAgo?: number | null;
}) {
  const nowMs = PAGE_STARTED_AT + elapsedSeconds * 1000;
  const preparingSince = preparingSecondsAgo === null ? null : nowMs - preparingSecondsAgo * 1000;
  const bootstrap = {
    ...bootstrapAt(stage),
    done,
    total: TOTAL_BYTES,
    fileBytes: TOTAL_BYTES,
    stateBytes: null,
    estimatedMs,
    preparingSince,
  };
  return preparingView({ bootstrap, elapsedSeconds, startedAt: PAGE_STARTED_AT });
}

test('uploading is a determinate bar of the bytes sent', () => {
  const view = uploadingView({ sentBytes: SENT_BYTES, totalBytes: TOTAL_BYTES });
  expect(view).toEqual({ stage: OpenStage.Uploading, detail: '4.8 MB of 9.5 MB', fraction: 0.5 });
});

test('preparing with progress is a determinate bar naming the bytes received', () => {
  const view = preparing({ stage: BootstrapStage.Preparing, done: SENT_BYTES, total: TOTAL_BYTES });
  expect(view).toEqual({ stage: OpenStage.Preparing, detail: 'Received 4.8 MB · 12 s', fraction: 0.5 });
});

test('preparing with no progress yet names the file size on an indeterminate bar', () => {
  const view = preparing({ stage: BootstrapStage.Preparing, done: 0, total: TOTAL_BYTES });
  expect(view).toEqual({ stage: OpenStage.Preparing, detail: 'Converting a 9.5 MB file · 12 s', fraction: null });
});

test('bytes received beyond the estimated total fill the bar and no more', () => {
  const view = preparing({ stage: BootstrapStage.Preparing, done: TOTAL_BYTES * 2, total: TOTAL_BYTES });
  expect(view.fraction).toBe(1);
});

test('an estimate with no bytes yet fills the bar by the time elapsed over the estimate and names both', () => {
  expect(estimating({ estimatedMs: 40_000, elapsedSeconds: 12 })).toEqual({
    stage: OpenStage.Preparing,
    detail: 'Converting a 9.5 MB file · about 40 s · 12 s elapsed',
    fraction: 0.3,
  });
});

test('the time bar stops at 95% when the conversion outlasts its estimate', () => {
  expect(estimating({ estimatedMs: 40_000, elapsedSeconds: 100 }).fraction).toBe(0.95);
});

test.each([
  [42_000, 'about 40 s'],
  [43_000, 'about 45 s'],
  [1_000, 'about 5 s'],
  [65_000, 'about 1 min 5 s'],
])('an estimate of %i ms reads %s, rounded to five seconds', (estimatedMs, expected) => {
  expect(estimating({ estimatedMs, elapsedSeconds: 1 }).detail).toContain(expected);
});

test('a few bytes received do not hide the estimate', () => {
  const view = estimating({ done: 3_584, estimatedMs: 40_000, elapsedSeconds: 12 });
  expect(view.fraction).toBe(0.3);
  expect(view.detail).toContain('about 40 s');
});

test('bytes ahead of the estimate take over the bar and the detail', () => {
  const view = estimating({ done: TOTAL_BYTES * 0.8, estimatedMs: 40_000, elapsedSeconds: 12 });
  expect(view.fraction).toBe(0.8);
  expect(view.detail).toBe('Received 7.6 MB · 12 s');
});

test('the estimate runs from when Preparing began, so a joiner arriving mid-conversion does not start at zero', () => {
  expect(estimating({ estimatedMs: 40_000, elapsedSeconds: 5, preparingSecondsAgo: 30 })).toEqual({
    stage: OpenStage.Preparing,
    detail: 'Converting a 9.5 MB file · about 40 s · 30 s elapsed',
    fraction: 0.75,
  });
});

test('a long queue does not enter Preparing near the end of the bar', () => {
  const view = estimating({ estimatedMs: 40_000, elapsedSeconds: 100, preparingSecondsAgo: 2 });
  expect(view.fraction).toBe(0.05);
  expect(view.detail).toContain('2 s elapsed');
});

test('a Preparing start in the future of this clock counts as zero elapsed', () => {
  expect(estimating({ estimatedMs: 40_000, elapsedSeconds: 5, preparingSecondsAgo: -3 }).fraction).toBe(0);
});

test('the conversion names the size of the file, not the estimated state', () => {
  const bootstrap = { ...bootstrapAt(BootstrapStage.Preparing), total: 38_000_000, fileBytes: TOTAL_BYTES, stateBytes: null };
  const view = preparingView({ bootstrap, elapsedSeconds: 12, startedAt: PAGE_STARTED_AT });
  expect(view.detail).toBe('Converting a 9.5 MB file · 12 s');
});

test('a queued bootstrap ignores the estimate and no estimate keeps the bar indeterminate', () => {
  expect(estimating({ stage: BootstrapStage.Queued, estimatedMs: 40_000, elapsedSeconds: 12 }).fraction).toBeNull();
  expect(estimating({ estimatedMs: null, elapsedSeconds: 12 }).fraction).toBeNull();
});

test('a queued bootstrap says it waits for its turn', () => {
  const view = preparing({ stage: BootstrapStage.Queued, done: 0, total: TOTAL_BYTES });
  expect(view).toEqual({ stage: OpenStage.Preparing, detail: 'Waiting for its turn · 12 s', fraction: null });
});

test.each([
  ['a preparing bootstrap of unknown size', bootstrapAt(BootstrapStage.Preparing)],
  ['a legacy answer with no bootstrap', null],
])('%s still ticks the elapsed time', (_, bootstrap) => {
  const view = preparingView({ bootstrap, elapsedSeconds: 75, startedAt: PAGE_STARTED_AT });
  expect(view).toEqual({ stage: OpenStage.Preparing, detail: 'Preparing the file · 1 min 15 s', fraction: null });
});

test('downloading names the state size when the answer carries it', () => {
  expect(downloadingView({ stateBytes: 36_500_000, elapsedSeconds: 12 })).toEqual({
    stage: OpenStage.Downloading,
    detail: 'Receiving 34.8 MB · 12 s',
    fraction: null,
  });
});

test('downloading without a state size only counts the time', () => {
  expect(downloadingView({ stateBytes: null, elapsedSeconds: 3 })).toEqual({
    stage: OpenStage.Downloading,
    detail: 'Receiving the document · 3 s',
    fraction: null,
  });
});

test.each([
  [0, 'Laying out the pages · 12 s'],
  [123, 'Laying out the pages · 123 so far · 12 s'],
  [1234, 'Laying out the pages · 1,234 so far · 12 s'],
])('rendering with %i pages laid out reads %s', (pageCount, detail) => {
  expect(renderingView({ pageCount, elapsedSeconds: 12 })).toEqual({ stage: OpenStage.Rendering, detail, fraction: null });
});

describe('the view while the editor loads', () => {
  const FRESH: EditorLoadProgress = { isSynced: false, pageCount: 0, hasFailed: false };

  test('before collaboration is synced it is the download with the size of the state', () => {
    expect(editorOpenView({ loadProgress: FRESH, stateBytes: 36_500_000, elapsedSeconds: 12 })).toEqual(
      downloadingView({ stateBytes: 36_500_000, elapsedSeconds: 12 }),
    );
  });

  test('once synced it is the rendering with the pages laid out so far', () => {
    expect(
      editorOpenView({ loadProgress: { ...FRESH, isSynced: true, pageCount: 7 }, stateBytes: 36_500_000, elapsedSeconds: 12 }),
    ).toEqual(renderingView({ pageCount: 7, elapsedSeconds: 12 }));
  });
});
