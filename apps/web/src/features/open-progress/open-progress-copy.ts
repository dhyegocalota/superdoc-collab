import { OpenStage } from './open-stage';

export const OPEN_STAGE_LABELS: Record<OpenStage, string> = {
  [OpenStage.Uploading]: 'Uploading',
  [OpenStage.Preparing]: 'Preparing on the server',
  [OpenStage.Downloading]: 'Downloading',
  [OpenStage.Rendering]: 'Rendering',
};

export const OPEN_PROGRESS_LABEL = 'Opening the document';

export function stageAnnouncement(stage: OpenStage): string {
  return `${OPEN_STAGE_LABELS[stage]}, in progress`;
}
