export class ImpersonationTimers {
  arm(_: { socketId: string; endsAt: number; onEnd: () => void }): void {
    throw new Error('ImpersonationTimers.arm is not implemented');
  }

  clear(_: string): void {
    throw new Error('ImpersonationTimers.clear is not implemented');
  }
}
