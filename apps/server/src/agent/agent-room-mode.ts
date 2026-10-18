import { OPEN_RATE_LIMITED_MESSAGE, secondsRoundedUp, type RoomMode } from '@superdoc-collab/types';
import type { DocumentRuntime } from '../collaboration/collaboration-runtime';
import { AgentToolError } from './tool-results';

export function agentRoomMode({ runtime, documentId, userId }: { runtime: DocumentRuntime; documentId: string; userId: string }): RoomMode {
  const answer = runtime.roomModeFor({ documentId, userId });
  if (!answer.isSpent) return answer.roomMode;
  throw new AgentToolError({ message: OPEN_RATE_LIMITED_MESSAGE, details: { retryAfterSeconds: secondsRoundedUp(answer.waitMs) } });
}
