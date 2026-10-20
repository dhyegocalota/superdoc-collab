import { MINUTE_MS, SECOND_MS } from '@superdoc-collab/types';
import { formatByteCount, formatCount } from '@/lib/format-quantity';
import { UPLOADING_MESSAGE } from '@/features/documents/documents-copy';
import { PREPARING_DOCUMENT_MESSAGE } from '@/features/editor/waiting-copy';
import { OpenStage } from './open-stage';

export const OPEN_STAGE_LABELS: Record<OpenStage, string> = {
  [OpenStage.Uploading]: UPLOADING_MESSAGE,
  [OpenStage.Preparing]: PREPARING_DOCUMENT_MESSAGE,
  [OpenStage.Downloading]: 'Downloading…',
  [OpenStage.Rendering]: 'Rendering…',
};

export const OPEN_PROGRESS_LABEL = 'Opening the document';

export function stageAnnouncement({ stages, stage }: { stages: OpenStage[]; stage: OpenStage }): string {
  return `Step ${stages.indexOf(stage) + 1} of ${stages.length}: ${OPEN_STAGE_LABELS[stage]}`;
}

const DETAIL_SEPARATOR = ' · ';
const SECONDS_PER_MINUTE = MINUTE_MS / SECOND_MS;

export const QUEUED_DETAIL = 'Waiting for its turn';
export const UNKNOWN_PREPARING_DETAIL = 'Preparing the file';
export const UNKNOWN_DOWNLOAD_DETAIL = 'Receiving the document';
export const LAYING_OUT_DETAIL = 'Laying out the pages';

export function elapsedLabel(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);
  const seconds = elapsedSeconds % SECONDS_PER_MINUTE;
  if (minutes === 0) return `${seconds} s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} s`;
}

export function detailLine(parts: string[]): string {
  return parts.join(DETAIL_SEPARATOR);
}

export function bytesProgressDetail({ doneBytes, totalBytes }: { doneBytes: number; totalBytes: number }): string {
  return `${formatByteCount(doneBytes)} of ${formatByteCount(totalBytes)}`;
}

export function convertingDetail(sizeBytes: number): string {
  return `Converting ${formatByteCount(sizeBytes)} of text and layout`;
}

export function receivedDetail(receivedBytes: number): string {
  return `Received ${formatByteCount(receivedBytes)}`;
}

export function receivingDetail(stateBytes: number): string {
  return `Receiving ${formatByteCount(stateBytes)}`;
}

export function pagesSoFarDetail(pageCount: number): string {
  return `${formatCount(pageCount)} so far`;
}

export function estimatedConversionDetail({
  subject,
  estimatedSeconds,
  elapsedSeconds,
}: {
  subject: string;
  estimatedSeconds: number;
  elapsedSeconds: number;
}): string {
  return detailLine([subject, `about ${elapsedLabel(estimatedSeconds)}`, `${elapsedLabel(elapsedSeconds)} elapsed`]);
}
