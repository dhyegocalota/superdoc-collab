export type OpenedBootstrap = { bootstrap?: { bootstrapApplied?: boolean } };

export function assertBootstrapApplied(opened: OpenedBootstrap): void {
  throw new Error(`assertBootstrapApplied is not implemented ${JSON.stringify(opened)}`);
}
