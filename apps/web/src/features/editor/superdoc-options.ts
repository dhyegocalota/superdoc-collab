import type { RoomMode, SessionUser } from '@superdoc-history/types';
import type { Config } from 'superdoc';

export enum DocumentMode {
  Viewing = 'viewing',
  Editing = 'editing',
}

export function superdocOptions({
  container,
  documentId,
  file,
  documentMode,
  collaborationPath,
  roomMode,
  user,
  viewport,
}: {
  container: HTMLElement;
  documentId: string;
  file: Blob;
  documentMode: DocumentMode;
  collaborationPath: string;
  roomMode: RoomMode;
  user: SessionUser;
  viewport: Window;
}): Config {
  return {} as Config;
}
