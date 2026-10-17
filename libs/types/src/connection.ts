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
  Unknown = 'unknown',
}
