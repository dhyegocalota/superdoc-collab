import { spawn, type ChildProcess } from 'node:child_process';

const READY_SIGNAL = 'READY';
const START_TIMEOUT_MS = 30_000;

export class ServerProcess {
  private child: ChildProcess | null = null;

  constructor(private readonly options: { port: number; databasePath: string }) {}

  async start(): Promise<void> {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/run-collaboration-server.ts', String(this.options.port), this.options.databasePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Collaboration server did not start.')), START_TIMEOUT_MS);
      child.stdout?.on('data', (chunk: Buffer) => {
        if (!chunk.toString().includes(READY_SIGNAL)) return;
        clearTimeout(timer);
        resolve();
      });
      child.once('exit', (code) => reject(new Error(`Collaboration server exited early with ${code}.`)));
    });
  }

  async kill(signal: NodeJS.Signals): Promise<void> {
    const child = this.child;
    if (!child) throw new Error('Collaboration server is not running.');
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill(signal);
    await exited;
    this.child = null;
  }
}
