import {
  agentAuthorName,
  DOCUMENT_NOT_READY_ERROR,
  type DocumentRole,
  MINUTE_MS,
  RoomMode,
  SECOND_MS,
  secondsRoundedUp,
} from '@superdoc-collab/types';
import { createSuperDocClient, type SuperDocClient, type SuperDocDocument } from '@superdoc/sdk';
import { LruMap } from '../limits/lru-map';
import { withTimeout } from '../limits/with-timeout';
import type { AgentDocumentSessions, AgentPerson } from './agent-tool-context';
import { ROOM_TOKEN_TTL_MS } from './room-tokens';
import { AgentToolError } from './tool-results';

const MAX_AGENT_SESSIONS = 8;
const AGENT_SESSION_IDLE_MS = 5 * MINUTE_MS;
const AGENT_SESSION_OPEN_TIMEOUT_MS = 30 * SECOND_MS;
const AGENT_HOST_NAME = 'SuperDoc History agent';
const AGENT_HOST_EMAIL = 'agent@superdoc-history.local';
const SDK_RUNTIME = 'v2';
const COLLABORATION_PROVIDER = 'hocuspocus';
const SESSION_BUSY_MESSAGE = 'Every document room is in use';
const SESSION_OPEN_TIMEOUT_MESSAGE = 'The document did not open in time';

export type AgentSessionsClient = Pick<SuperDocClient, 'connect' | 'open' | 'dispose'>;
type LocatedRoom = { roomMode: RoomMode };
type RoleOf = (options: { userId: string; documentId: string }) => DocumentRole | null;
type OpenedSession = {
  document: SuperDocDocument;
  openedAt: number;
  role: DocumentRole | null;
  userName: string;
  idleTimer: NodeJS.Timeout | null;
};
type SessionWork<Result> = { person: AgentPerson; documentId: string; work: (document: SuperDocDocument) => Promise<Result> };
type SessionTraits = { role: DocumentRole | null; userName: string };

export class AgentSessionBusyError extends AgentToolError {
  constructor(retryAfterSeconds: number) {
    super({ message: SESSION_BUSY_MESSAGE, details: { retryAfterSeconds } });
  }
}

export class AgentSessionOpenTimeoutError extends AgentToolError {
  constructor() {
    super({ message: SESSION_OPEN_TIMEOUT_MESSAGE });
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
  private readonly idle: LruMap<OpenedSession>;
  private readonly turns = new Map<string, Promise<void>>();
  private readonly waiting: (() => void)[] = [];
  private readonly client: AgentSessionsClient;
  private readonly issueRoomToken: (options: { userId: string; documentId: string }) => string;
  private readonly collaborationUrl: () => string;
  private readonly locateRoom: (options: { documentId: string; userId: string }) => LocatedRoom;
  private readonly roleOf: RoleOf;
  private readonly now: () => number;
  private readonly maxSessions: number;
  private readonly idleMs: number;
  private readonly openTimeoutMs: number;
  private readonly tokenLifetimeMs: number;
  private active = 0;
  private connection: Promise<void> | null = null;

  constructor({
    issueRoomToken,
    collaborationUrl,
    locateRoom,
    roleOf,
    now = Date.now,
    tokenLifetimeMs = ROOM_TOKEN_TTL_MS,
    createClient = createHostClient,
    maxSessions = MAX_AGENT_SESSIONS,
    idleMs = AGENT_SESSION_IDLE_MS,
    openTimeoutMs = AGENT_SESSION_OPEN_TIMEOUT_MS,
  }: {
    issueRoomToken: (options: { userId: string; documentId: string }) => string;
    collaborationUrl: () => string;
    locateRoom: (options: { documentId: string; userId: string }) => LocatedRoom;
    roleOf: RoleOf;
    now?: () => number;
    tokenLifetimeMs?: number;
    createClient?: () => AgentSessionsClient;
    maxSessions?: number;
    idleMs?: number;
    openTimeoutMs?: number;
  }) {
    this.issueRoomToken = issueRoomToken;
    this.collaborationUrl = collaborationUrl;
    this.locateRoom = locateRoom;
    this.roleOf = roleOf;
    this.now = now;
    this.tokenLifetimeMs = tokenLifetimeMs;
    this.client = createClient();
    this.maxSessions = maxSessions;
    this.idle = new LruMap({ isOverBudget: (entries) => entries.size + this.active > maxSessions });
    this.idleMs = idleMs;
    this.openTimeoutMs = openTimeoutMs;
  }

  run<Result>(options: SessionWork<Result>): Promise<Result> {
    const { userId } = options.person;
    const previous = this.turns.get(userId);
    const turnPromise = previous ? this.untilTurn(previous).then(() => this.runOnSession(options)) : this.runOnSession(options);
    const turnEnded = turnPromise.then(
      () => undefined,
      () => undefined,
    );
    const tail = previous ? Promise.all([previous, turnEnded]).then(() => undefined) : turnEnded;
    this.turns.set(userId, tail);
    void tail.then(() => {
      if (this.turns.get(userId) === tail) this.turns.delete(userId);
    });
    return turnPromise;
  }

  async close(): Promise<void> {
    await Promise.all(this.turns.values());
    const sessions = this.idle.values();
    this.idle.keys().forEach((key) => this.idle.delete(key));
    await Promise.all(sessions.map((session) => this.release(session)));
    await this.client.dispose();
  }

  private untilTurn(previous: Promise<void>): Promise<void> {
    return withTimeout({
      work: previous,
      milliseconds: this.openTimeoutMs,
      onTimeout: () => {
        throw new AgentSessionBusyError(secondsRoundedUp(this.openTimeoutMs));
      },
    });
  }

  private async runOnSession<Result>(options: SessionWork<Result>): Promise<Result> {
    const key = `${options.person.userId}:${options.documentId}`;
    const session = await this.checkout({ key, ...options });
    const result = await options.work(session.document).catch(async (error: unknown) => {
      this.free();
      await closeQuietly(session.document);
      throw error;
    });
    await this.checkin({ key, session });
    return result;
  }

  private isCurrent({ session, role, userName }: { session: OpenedSession } & SessionTraits): boolean {
    const isSameIdentity = session.role === role && session.userName === userName;
    const isTokenLive = this.now() - session.openedAt < this.tokenLifetimeMs - this.openTimeoutMs;
    return isSameIdentity && isTokenLive;
  }

  private async checkout({ key, person, documentId }: { key: string; person: AgentPerson; documentId: string }): Promise<OpenedSession> {
    const traits: SessionTraits = { role: this.roleOf({ userId: person.userId, documentId }), userName: agentAuthorName(person.name) };
    const cached = this.idle.peek(key);
    if (cached && this.isCurrent({ session: cached, ...traits })) {
      this.idle.delete(key);
      if (cached.idleTimer) clearTimeout(cached.idleTimer);
      this.active++;
      return cached;
    }
    if (cached) {
      this.idle.delete(key);
      await this.release(cached);
    }
    await this.reserve();
    return this.open({ person, documentId, ...traits }).catch((error: unknown) => {
      this.free();
      throw error;
    });
  }

  private async reserve(): Promise<void> {
    const deadline = Date.now() + this.openTimeoutMs;
    while (this.active >= this.maxSessions) await this.waitForSlot(Math.max(deadline - Date.now(), 0));
    this.active++;
    const excess = this.idle.size() + this.active - this.maxSessions;
    const oldest = this.idle.keys().slice(0, Math.max(excess, 0));
    await Promise.all(
      oldest.map((key) => {
        const session = this.idle.peek(key);
        this.idle.delete(key);
        if (!session) return Promise.resolve();
        return this.release(session);
      }),
    );
  }

  private waitForSlot(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiting.splice(this.waiting.indexOf(wake), 1);
        reject(new AgentSessionBusyError(secondsRoundedUp(this.openTimeoutMs)));
      }, milliseconds);
      this.waiting.push(wake);
    });
  }

  private free(): void {
    this.active--;
    const next = this.waiting.shift();
    if (next) next();
  }

  private async checkin({ key, session }: { key: string; session: OpenedSession }): Promise<void> {
    const idleTimer = setTimeout(() => {
      this.idle.delete(key);
      void closeQuietly(session.document);
    }, this.idleMs);
    idleTimer.unref();
    session.idleTimer = idleTimer;
    this.free();
    const evicted = this.idle.set({ key, value: session });
    await Promise.all(evicted.map(({ value }) => this.release(value)));
  }

  private release({ document, idleTimer }: OpenedSession): Promise<void> {
    if (idleTimer) clearTimeout(idleTimer);
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

  private async open({
    person,
    documentId,
    role,
    userName,
  }: { person: AgentPerson; documentId: string } & SessionTraits): Promise<OpenedSession> {
    const { roomMode } = this.locateRoom({ documentId, userId: person.userId });
    if (roomMode === RoomMode.Create) throw new AgentToolError({ message: DOCUMENT_NOT_READY_ERROR });
    await this.connected();
    const opening = this.client.open(
      {
        runtime: SDK_RUNTIME,
        userName,
        userEmail: person.email,
        collaboration: { providerType: COLLABORATION_PROVIDER, url: this.collaborationUrl(), documentId, roomMode },
      },
      { collaborationAuth: { type: 'token', token: this.issueRoomToken({ userId: person.userId, documentId }) } },
    );
    const document = await withTimeout({
      work: opening,
      milliseconds: this.openTimeoutMs,
      onTimeout: () => {
        void opening.then(closeQuietly, () => undefined);
        throw new AgentSessionOpenTimeoutError();
      },
    });
    return { document, openedAt: this.now(), role, userName, idleTimer: null };
  }
}
