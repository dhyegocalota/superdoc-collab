import { MINUTE_MS, RoomMode, SECOND_MS } from '@superdoc-history/types';
import type { SuperDocClient } from '@superdoc/sdk';
import type { AgentDocumentSessions } from './agent-tool-context';

export const MAX_AGENT_SESSIONS = 8;
export const AGENT_SESSION_IDLE_MS = 5 * MINUTE_MS;
export const AGENT_SESSION_OPEN_TIMEOUT_MS = 30 * SECOND_MS;

export type AgentSessionsClient = Pick<SuperDocClient, 'connect' | 'open' | 'dispose'>;
export type LocatedRoom = { roomMode: RoomMode; filePath: string };

export class AgentSessionOpenTimeoutError extends Error {
  constructor() {
    super('The document did not open in time');
  }
}

export class AgentSessions implements AgentDocumentSessions {
  constructor(_options: {
    issueRoomToken: (options: { userId: string; documentId: string }) => string;
    collaborationUrl: () => string;
    locateRoom: (documentId: string) => LocatedRoom;
    createClient?: () => AgentSessionsClient;
    maxSessions?: number;
    idleMs?: number;
    openTimeoutMs?: number;
  }) {}

  run: AgentDocumentSessions['run'] = () => {
    throw new Error('AgentSessions.run is not implemented');
  };

  close(): Promise<void> {
    throw new Error('AgentSessions.close is not implemented');
  }
}
