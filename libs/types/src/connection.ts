export enum ConnectionState {
  Online = 'online',
  Lost = 'lost',
  Reconnecting = 'reconnecting',
  Recovered = 'recovered',
  Failed = 'failed',
}

export enum ConnectionFailureReason {
  AccessDenied = 'access-denied',
  ConnectionFailed = 'connection-failed',
  SyncTimeout = 'sync-timeout',
  WorkerTransportFailed = 'worker-transport-failed',
  SessionEnded = 'session-ended',
  HeavyRoomsFull = 'heavy-rooms-full',
  Unknown = 'unknown',
}

export enum SuperdocCollaborationState {
  Connecting = 'connecting',
  Synced = 'synced',
  Degraded = 'degraded',
  Failed = 'failed',
}
