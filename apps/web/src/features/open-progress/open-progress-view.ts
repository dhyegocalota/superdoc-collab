import { BootstrapStage, type BootstrapProgress } from '@superdoc-collab/types';
import {
  bytesProgressDetail,
  convertingDetail,
  convertingProgressDetail,
  detailLine,
  elapsedLabel,
  LAYING_OUT_DETAIL,
  pagesSoFarDetail,
  QUEUED_DETAIL,
  receivingDetail,
  UNKNOWN_DOWNLOAD_DETAIL,
  UNKNOWN_PREPARING_DETAIL,
} from './open-progress-copy';
import type { OpenProgressView } from './open-progress-panel';
import { OpenStage } from './open-stage';

function fractionOf({ doneBytes, totalBytes }: { doneBytes: number; totalBytes: number }): number | null {
  if (totalBytes <= 0) return null;
  return doneBytes / totalBytes;
}

export function uploadingView({ sentBytes, totalBytes }: { sentBytes: number; totalBytes: number }): OpenProgressView {
  return {
    stage: OpenStage.Uploading,
    detail: bytesProgressDetail({ doneBytes: sentBytes, totalBytes }),
    fraction: fractionOf({ doneBytes: sentBytes, totalBytes }),
  };
}

function preparingDetailOf({ bootstrap, elapsed }: { bootstrap: BootstrapProgress | null; elapsed: string }): string {
  if (!bootstrap) return detailLine([UNKNOWN_PREPARING_DETAIL, elapsed]);
  const { stage, done, total } = bootstrap;
  if (stage === BootstrapStage.Queued) return detailLine([QUEUED_DETAIL, elapsed]);
  if (done > 0) return detailLine([convertingProgressDetail({ doneBytes: done, totalBytes: total }), elapsed]);
  if (total > 0) return detailLine([convertingDetail(total), elapsed]);
  return detailLine([UNKNOWN_PREPARING_DETAIL, elapsed]);
}

export function preparingView({
  bootstrap,
  elapsedSeconds,
}: {
  bootstrap: BootstrapProgress | null;
  elapsedSeconds: number;
}): OpenProgressView {
  const detail = preparingDetailOf({ bootstrap, elapsed: elapsedLabel(elapsedSeconds) });
  if (!bootstrap || bootstrap.done <= 0) return { stage: OpenStage.Preparing, detail, fraction: null };
  return { stage: OpenStage.Preparing, detail, fraction: fractionOf({ doneBytes: bootstrap.done, totalBytes: bootstrap.total }) };
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
