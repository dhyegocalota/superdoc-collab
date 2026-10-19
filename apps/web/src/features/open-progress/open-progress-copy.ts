import { OpenStage } from './open-stage';

export const OPEN_STAGE_LABELS: Record<OpenStage, string> = {
  [OpenStage.Uploading]: 'Uploading',
  [OpenStage.Preparing]: 'Preparing on the server',
  [OpenStage.Downloading]: 'Downloading',
  [OpenStage.Rendering]: 'Rendering',
};
