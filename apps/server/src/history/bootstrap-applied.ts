import { BootstrapNotAppliedError } from './projection-messages';

export type OpenedBootstrap = { bootstrap?: { bootstrapApplied?: boolean } };

export function assertBootstrapApplied(opened: OpenedBootstrap): void {
  const isApplied = opened.bootstrap?.bootstrapApplied !== false;
  if (!isApplied) throw new BootstrapNotAppliedError();
}
