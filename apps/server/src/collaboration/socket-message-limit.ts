export class SocketMessageLimit {
  constructor(_parameters: { now?: () => number } = {}) {}

  breached(_socket: object): boolean {
    throw new Error('SocketMessageLimit is not implemented');
  }
}
