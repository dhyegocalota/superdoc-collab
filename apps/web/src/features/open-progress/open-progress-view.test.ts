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
const SENT_BYTES = 4_980_736;

function preparing({ stage, done, total }: { stage: BootstrapStage; done: number; total: number }) {
  return preparingView({ bootstrap: { ...bootstrapAt(stage), done, total, stateBytes: null }, elapsedSeconds: 12 });
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

test('a queued bootstrap says it waits for its turn', () => {
  const view = preparing({ stage: BootstrapStage.Queued, done: 0, total: TOTAL_BYTES });
  expect(view).toEqual({ stage: OpenStage.Preparing, detail: 'Waiting for its turn · 12 s', fraction: null });
});

test.each([
  ['a preparing bootstrap of unknown size', bootstrapAt(BootstrapStage.Preparing)],
  ['a legacy answer with no bootstrap', null],
])('%s still ticks the elapsed time', (_, bootstrap) => {
  const view = preparingView({ bootstrap, elapsedSeconds: 75 });
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
