import { IMPERSONATION_SESSION_MS, UserRole } from '@superdoc-collab/types';
import type { Auth } from './auth';

type ImpersonatorRow = { role: string | null; banned: boolean | null };
type AuthAdapter = Awaited<Auth['$context']>['adapter'];

export function impersonationEndOf(createdAt: Date): number {
  return createdAt.getTime() + IMPERSONATION_SESSION_MS;
}

export async function isImpersonationValid({
  adapter,
  impersonatedBy,
  createdAt,
}: {
  adapter: AuthAdapter;
  impersonatedBy: string;
  createdAt: Date;
}): Promise<boolean> {
  const hasExpired = impersonationEndOf(createdAt) < Date.now();
  if (hasExpired) return false;
  const impersonator = await adapter.findOne<ImpersonatorRow>({ model: 'user', where: [{ field: 'id', value: impersonatedBy }] });
  if (!impersonator) return false;
  return impersonator.role === UserRole.Admin && !impersonator.banned;
}
