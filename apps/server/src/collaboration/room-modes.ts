import { RoomMode } from '@superdoc-collab/types';
import type { OpenBudget } from '../limits/open-budget';
import type { BootstrapState } from './bootstrap-state';

export type RoomModeAnswer = { isSpent: false; roomMode: RoomMode } | { isSpent: true; waitMs: number };

export type RoomModes = { resolve: (parameters: { documentId: string; userId: string }) => RoomModeAnswer };

export function createRoomModes({ bootstrap, openBudget }: { bootstrap: BootstrapState; openBudget: OpenBudget }): RoomModes {
  return {
    resolve: ({ documentId, userId }) => {
      if (bootstrap.isKnownCommitted(documentId)) return { isSpent: false, roomMode: RoomMode.Join };
      const waitMs = openBudget.waitMs({ userId, documentId });
      if (waitMs !== null) return { isSpent: true, waitMs };
      if (bootstrap.isCommitted(documentId)) return { isSpent: false, roomMode: RoomMode.Join };
      openBudget.record({ userId, documentId });
      return { isSpent: false, roomMode: RoomMode.Create };
    },
  };
}
