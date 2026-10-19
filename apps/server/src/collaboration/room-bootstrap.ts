import type { BootstrapProgress } from '@superdoc-collab/types';

export type BootstrapRun = (request: { documentId: string; filePath: string; url: string; token: string }) => Promise<void>;

export class RoomBootstrap {
  constructor(_: {
    run: BootstrapRun;
    issueToken: (parameters: { userId: string; documentId: string; attempt: string }) => string;
    collaborationUrl: () => string;
    ownerOf: (documentId: string) => string | null;
    fileBytesOf: (documentId: string) => number;
    filePathOf: (documentId: string) => string;
  }) {}

  progressOf(_documentId: string): BootstrapProgress | null {
    throw new Error('RoomBootstrap.progressOf is not implemented');
  }

  request(_documentId: string): BootstrapProgress {
    throw new Error('RoomBootstrap.request is not implemented');
  }

  begin(_documentId: string): string {
    throw new Error('RoomBootstrap.begin is not implemented');
  }

  isCurrent(_: { documentId: string; attempt: string }): boolean {
    throw new Error('RoomBootstrap.isCurrent is not implemented');
  }

  ready(_: { documentId: string; stateBytes: number }): void {
    throw new Error('RoomBootstrap.ready is not implemented');
  }

  forget(_documentId: string): void {
    throw new Error('RoomBootstrap.forget is not implemented');
  }
}
