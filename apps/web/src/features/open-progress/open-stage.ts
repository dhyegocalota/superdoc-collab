export enum OpenStage {
  Uploading = 'uploading',
  Preparing = 'preparing',
  Downloading = 'downloading',
  Rendering = 'rendering',
}

export const EDITOR_OPEN_STAGES: OpenStage[] = [OpenStage.Preparing, OpenStage.Downloading, OpenStage.Rendering];
