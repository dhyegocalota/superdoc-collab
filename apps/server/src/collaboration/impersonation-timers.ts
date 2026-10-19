type ImpersonationTimer = ReturnType<typeof setTimeout>;

export class ImpersonationTimers {
  private readonly timers = new Map<string, ImpersonationTimer>();

  arm({ socketId, endsAt, onEnd }: { socketId: string; endsAt: number; onEnd: () => void }): void {
    this.clear(socketId);
    const timer = setTimeout(
      () => {
        this.timers.delete(socketId);
        onEnd();
      },
      Math.max(endsAt - Date.now(), 0),
    );
    timer.unref();
    this.timers.set(socketId, timer);
  }

  clear(socketId: string): void {
    clearTimeout(this.timers.get(socketId));
    this.timers.delete(socketId);
  }
}
