import { agentAuthorName, MINUTE_MS, RoomMode, SECOND_MS } from '@superdoc-history/types';
import { createSuperDocClient, type SuperDocClient, type SuperDocDocument } from '@superdoc/sdk';
import { LruMap } from '../limits/lru-map';
import { withTimeout } from '../limits/with-timeout';
import type { AgentDocumentSessions, AgentPerson } from './agent-tool-context';

export const MAX_AGENT_SESSIONS = 8;
export const AGENT_SESSION_IDLE_MS = 5 * MINUTE_MS;
export const AGENT_SESSION_OPEN_TIMEOUT_MS = 30 * SECOND_MS;
const AGENT_HOST_NAME = 'SuperDoc History agent';
const AGENT_HOST_EMAIL = 'agent@superdoc-history.local';
const SDK_RUNTIME = 'v2';
const COLLABORATION_PROVIDER = 'hocuspocus';

export type AgentSessionsClient = Pick<SuperDocClient, 'connect' | 'open' | 'dispose'>;
export type LocatedRoom = { roomMode: RoomMode; filePath: string };
type IdleSession = { document: SuperDocDocument; idleTimer: NodeJS.Timeout };
type SessionWork<Result> = { person: AgentPerson; documentId: string; work: (document: SuperDocDocument) => Promise<Result> };

export class AgentSessionOpenTimeoutError extends Error {
  constructor() {
    super('The document did not open in time');
  }
}

function createHostClient(): AgentSessionsClient {
  return createSuperDocClient({ user: { name: AGENT_HOST_NAME, email: AGENT_HOST_EMAIL } });
}

function closeQuietly(document: SuperDocDocument): Promise<void> {
  return document.close({ discard: true }).then(
    () => undefined,
    () => undefined,
  );
}

export class AgentSessions implements AgentDocumentSessions {
  private readonly idle: LruMap<IdleSession>;
  private readonly turns = new Map<string, Promise<void>>();
  private readonly client: AgentSessionsClient;
  private readonly issueRoomToken: (options: { userId: string; documentId: string }) => string;
  private readonly collaborationUrl: () => string;
  private readonly locateRoom: (documentId: string) => LocatedRoom;
  private readonly idleMs: number;
  private readonly openTimeoutMs: number;
  private connection: Promise<void> | null = null;

  constructor({
    issueRoomToken,
    collaborationUrl,
    locateRoom,
    createClient = createHostClient,
    maxSessions = MAX_AGENT_SESSIONS,
    idleMs = AGENT_SESSION_IDLE_MS,
    openTimeoutMs = AGENT_SESSION_OPEN_TIMEOUT_MS,
  }: {
    issueRoomToken: (options: { userId: string; documentId: string }) => string;
    collaborationUrl: () => string;
    locateRoom: (documentId: string) => LocatedRoom;
    createClient?: () => AgentSessionsClient;
    maxSessions?: number;
    idleMs?: number;
    openTimeoutMs?: number;
  }) {
    this.issueRoomToken = issueRoomToken;
    this.collaborationUrl = collaborationUrl;
    this.locateRoom = locateRoom;
    this.client = createClient();
    this.idle = new LruMap({ isOverBudget: (entries) => entries.size > maxSessions });
    this.idleMs = idleMs;
    this.openTimeoutMs = openTimeoutMs;
  }

  async run<Result>(options: SessionWork<Result>): Promise<Result> {
    const key = `${options.person.userId}:${options.documentId}`;
    const previous = this.turns.get(key);
    const turn = previous ? previous.then(() => this.runOnSession(options)) : this.runOnSession(options);
    const settled = turn.then(
      () => undefined,
      () => undefined,
    );
    this.turns.set(key, settled);
    try {
      return await turn;
    } finally {
      if (this.turns.get(key) === settled) this.turns.delete(key);
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.turns.values());
    const sessions = this.idle.values();
    this.idle.keys().forEach((key) => this.idle.delete(key));
    await Promise.all(sessions.map((session) => this.release(session)));
    await this.client.dispose();
  }

  private async runOnSession<Result>(options: SessionWork<Result>): Promise<Result> {
    const key = `${options.person.userId}:${options.documentId}`;
    const document = await this.checkout({ key, ...options });
    const result = await options.work(document).catch(async (error: unknown) => {
      await closeQuietly(document);
      throw error;
    });
    await this.checkin({ key, document });
    return result;
  }

  private async checkout({ key, person, documentId }: { key: string; person: AgentPerson; documentId: string }): Promise<SuperDocDocument> {
    const session = this.idle.peek(key);
    if (!session) return this.open({ person, documentId });
    clearTimeout(session.idleTimer);
    this.idle.delete(key);
    return session.document;
  }

  private async checkin({ key, document }: { key: string; document: SuperDocDocument }): Promise<void> {
    const idleTimer = setTimeout(() => {
      this.idle.delete(key);
      void closeQuietly(document);
    }, this.idleMs);
    idleTimer.unref();
    const evicted = this.idle.set({ key, value: { document, idleTimer } });
    await Promise.all(evicted.map(({ value }) => this.release(value)));
  }

  private release({ document, idleTimer }: IdleSession): Promise<void> {
    clearTimeout(idleTimer);
    return closeQuietly(document);
  }

  private connected(): Promise<void> {
    if (this.connection) return this.connection;
    this.connection = this.client.connect().catch((error: unknown) => {
      this.connection = null;
      throw error;
    });
    return this.connection;
  }

  private async open({ person, documentId }: { person: AgentPerson; documentId: string }): Promise<SuperDocDocument> {
    const { roomMode, filePath } = this.locateRoom(documentId);
    const seed = roomMode === RoomMode.Create ? { doc: filePath } : {};
    await this.connected();
    const opening = this.client.open(
      {
        runtime: SDK_RUNTIME,
        ...seed,
        userName: agentAuthorName(person.name),
        userEmail: person.email,
        collaboration: { providerType: COLLABORATION_PROVIDER, url: this.collaborationUrl(), documentId, roomMode },
      },
      { collaborationAuth: { type: 'token', token: this.issueRoomToken({ userId: person.userId, documentId }) } },
    );
    return withTimeout({
      work: opening,
      milliseconds: this.openTimeoutMs,
      onTimeout: () => {
        void opening.then(closeQuietly, () => undefined);
        throw new AgentSessionOpenTimeoutError();
      },
    });
  }
}
