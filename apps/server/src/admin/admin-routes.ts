import {
  AdminResource,
  HttpStatus,
  INVITE_ALREADY_ACCEPTED_MESSAGE,
  INVITE_NOT_FOUND_MESSAGE,
  LAST_ADMIN_MESSAGE,
  PASSWORD_RESET_SEGMENT,
  SHOWCASE_SEGMENT,
  UserRole,
} from '@superdoc-collab/types';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { RevokeOutcome } from './invites';
import { SetRoleOutcome } from './users';

const INVALID_ROLE_MESSAGE = 'The role must be admin or user';
const USER_NOT_FOUND_MESSAGE = 'User not found';
const roleSchema = z.object({ role: z.enum(UserRole) });

export function createAdminRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const { invites, adminUsers, passwordResets, showcase, documents } = services;
  const routes = new Hono<SignedIn>();

  routes.get(`/${AdminResource.Users}`, (context) => context.json(adminUsers.list()));

  routes.post(`/${AdminResource.Users}/:id/role`, async (context) => {
    const parsed = roleSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: INVALID_ROLE_MESSAGE }, HttpStatus.BadRequest);
    const id = context.req.param('id');
    const outcome = adminUsers.setRole({ id, role: parsed.data.role });
    if (outcome === SetRoleOutcome.NotFound) return context.json({ error: USER_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    if (outcome === SetRoleOutcome.LastAdmin) return context.json({ error: LAST_ADMIN_MESSAGE }, HttpStatus.Conflict);
    return context.json({ id, role: parsed.data.role });
  });

  routes.post(`/${AdminResource.Users}/:id/${PASSWORD_RESET_SEGMENT}`, async (context) => {
    const userId = context.req.param('id');
    const email = adminUsers.emailOf(userId);
    if (email === null) return context.json({ error: USER_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    return context.json(await passwordResets.create({ userId, email }), HttpStatus.Created);
  });

  routes.get(`/${AdminResource.Invites}`, (context) => context.json(invites.list()));

  routes.post(`/${AdminResource.Invites}`, (context) =>
    context.json(invites.create({ createdBy: context.var.user.id }), HttpStatus.Created),
  );

  routes.delete(`/${AdminResource.Invites}/:id`, (context) => {
    const outcome = invites.revoke(context.req.param('id'));
    if (outcome === RevokeOutcome.NotFound) return context.json({ error: INVITE_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    if (outcome === RevokeOutcome.AlreadyAccepted) return context.json({ error: INVITE_ALREADY_ACCEPTED_MESSAGE }, HttpStatus.Conflict);
    return context.body(null, HttpStatus.NoContent);
  });

  routes.post(`/${SHOWCASE_SEGMENT}`, async (context) => {
    const userId = context.var.user.id;
    const documentId = await showcase.create({ ownerUserId: userId });
    return context.json(documents.summary({ documentId, userId }), HttpStatus.Created);
  });

  return routes;
}
