import { type BootstrapProgress, BootstrapStage, SECOND_MS } from '@superdoc-collab/types';
import {
  bytesProgressDetail,
  convertingDetail,
  detailLine,
  documentsAheadDetail,
  estimatedConversionDetail,
  elapsedLabel,
  LAYING_OUT_DETAIL,
  pagesSoFarDetail,
  QUEUED_DETAIL,
  receivedDetail,
  receivingDetail,
  UNKNOWN_DOWNLOAD_DETAIL,
  UNKNOWN_PREPARING_DETAIL,
} from './open-progress-copy';
import type { OpenProgressView } from './open-progress-panel';
import { OpenStage } from './open-stage';

function fractionOf({ doneBytes, totalBytes }: { doneBytes: number; totalBytes: number }): number | null {
  if (totalBytes <= 0) return null;
  return Math.min(doneBytes / totalBytes, 1);
}

export function uploadingView({ sentBytes, totalBytes }: { sentBytes: number; totalBytes: number }): OpenProgressView {
  return {
    stage: OpenStage.Uploading,
    detail: bytesProgressDetail({ doneBytes: sentBytes, totalBytes }),
    fraction: fractionOf({ doneBytes: sentBytes, totalBytes }),
  };
}

const ESTIMATE_FRACTION_CAP = 0.95;
const ESTIMATE_ROUNDING_SECONDS = 5;

function estimatedSecondsOf(estimatedMs: number): number {
  return Math.max(ESTIMATE_ROUNDING_SECONDS, Math.round(estimatedMs / SECOND_MS / ESTIMATE_ROUNDING_SECONDS) * ESTIMATE_ROUNDING_SECONDS);
}

function preparingElapsedSeconds({
  preparingElapsedMs,
  answeredAt,
  startedAt,
  elapsedSeconds,
}: {
  preparingElapsedMs: number | null;
  answeredAt: number;
  startedAt: number;
  elapsedSeconds: number;
}): number {
  if (preparingElapsedMs === null) return elapsedSeconds;
  const nowMs = startedAt + elapsedSeconds * SECOND_MS;
  const sinceAnswerMs = Math.max(0, nowMs - answeredAt);
  return Math.floor((preparingElapsedMs + sinceAnswerMs) / SECOND_MS);
}

function timeFractionOf({ estimatedMs, elapsedSeconds }: { estimatedMs: number | null; elapsedSeconds: number }): number | null {
  if (estimatedMs === null || estimatedMs <= 0) return null;
  return Math.min((elapsedSeconds * SECOND_MS) / estimatedMs, ESTIMATE_FRACTION_CAP);
}

function queuedDetailOf({ bootstrap, elapsed }: { bootstrap: BootstrapProgress; elapsed: string }): string {
  const { queuePosition, queueWaitMs } = bootstrap;
  if (queuePosition === null || queueWaitMs === null || queuePosition === 0) return detailLine([QUEUED_DETAIL, elapsed]);
  return detailLine([documentsAheadDetail(queuePosition), `about ${elapsedLabel(estimatedSecondsOf(queueWaitMs))}`, elapsed]);
}

export function preparingView({
  bootstrap,
  elapsedSeconds,
  startedAt,
  answeredAt,
}: {
  bootstrap: BootstrapProgress | null;
  elapsedSeconds: number;
  startedAt: number;
  answeredAt: number;
}): OpenProgressView {
  const stage = OpenStage.Preparing;
  const elapsed = elapsedLabel(elapsedSeconds);
  if (!bootstrap) return { stage, detail: detailLine([UNKNOWN_PREPARING_DETAIL, elapsed]), fraction: null };
  if (bootstrap.stage === BootstrapStage.Queued) return { stage, detail: queuedDetailOf({ bootstrap, elapsed }), fraction: null };
  const { done, total, estimatedMs, preparingElapsedMs, documentXmlBytes } = bootstrap;
  const sizeBytes = documentXmlBytes;
  const preparingSeconds = preparingElapsedSeconds({ preparingElapsedMs, answeredAt, startedAt, elapsedSeconds });
  const bytesFraction = done > 0 ? fractionOf({ doneBytes: done, totalBytes: total }) : null;
  const timeFraction = timeFractionOf({ estimatedMs, elapsedSeconds: preparingSeconds });
  const isBytesAhead = bytesFraction !== null && (timeFraction === null || bytesFraction >= timeFraction);
  if (isBytesAhead) return { stage, detail: detailLine([receivedDetail(done), elapsed]), fraction: bytesFraction };
  const subject = sizeBytes > 0 ? convertingDetail(sizeBytes) : UNKNOWN_PREPARING_DETAIL;
  if (timeFraction !== null && estimatedMs !== null) {
    const estimatedSeconds = estimatedSecondsOf(estimatedMs);
    return {
      stage,
      detail: estimatedConversionDetail({ subject, estimatedSeconds, elapsedSeconds: preparingSeconds }),
      fraction: timeFraction,
    };
  }
  return { stage, detail: detailLine([subject, elapsed]), fraction: null };
}

export function downloadingView({ stateBytes, elapsedSeconds }: { stateBytes: number | null; elapsedSeconds: number }): OpenProgressView {
  const received = stateBytes === null ? UNKNOWN_DOWNLOAD_DETAIL : receivingDetail(stateBytes);
  return { stage: OpenStage.Downloading, detail: detailLine([received, elapsedLabel(elapsedSeconds)]), fraction: null };
}

export function renderingView({ pageCount, elapsedSeconds }: { pageCount: number; elapsedSeconds: number }): OpenProgressView {
  const pages = pageCount > 0 ? [pagesSoFarDetail(pageCount)] : [];
  return {
    stage: OpenStage.Rendering,
    detail: detailLine([LAYING_OUT_DETAIL, ...pages, elapsedLabel(elapsedSeconds)]),
    fraction: null,
  };
}

export type EditorLoadProgress = { isSynced: boolean; pageCount: number; hasFailed: boolean };

export function editorOpenView({
  loadProgress,
  stateBytes,
  elapsedSeconds,
}: {
  loadProgress: EditorLoadProgress;
  stateBytes: number | null;
  elapsedSeconds: number;
}): OpenProgressView {
  if (loadProgress.isSynced) return renderingView({ pageCount: loadProgress.pageCount, elapsedSeconds });
  return downloadingView({ stateBytes, elapsedSeconds });
}
