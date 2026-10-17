export class OpenBudget {
  constructor(_parameters: { windowMs: number; maxDocuments: number; now?: () => number }) {}

  waitMs(_parameters: { userId: string; documentId: string }): number | null {
    throw new Error('OpenBudget is not implemented');
  }

  record(_parameters: { userId: string; documentId: string }): void {
    throw new Error('OpenBudget is not implemented');
  }
}
