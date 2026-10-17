import type { BetterAuthPlugin } from 'better-auth';
import type { InvitesRepository } from '../admin/invites';
import type { AuthDatabase } from '../database/connection';

const PLUGIN_ID = 'sign-up-gate';

export function createSignUpGate(_options: { invites: InvitesRepository; database: AuthDatabase }): BetterAuthPlugin {
  return { id: PLUGIN_ID };
}
