import {
  AdminResource,
  CANNOT_ARCHIVE_SELF_MESSAGE,
  CANNOT_IMPERSONATE_ADMIN_MESSAGE,
  CANNOT_IMPERSONATE_ARCHIVED_MESSAGE,
  CANNOT_IMPERSONATE_SELF_MESSAGE,
  HttpStatus,
  LAST_ADMIN_MESSAGE,
  UserAction,
  UserRole,
} from '@superdoc-collab/types';
import { Hono, type Context } from 'hono';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';

const USER_NOT_FOUND_MESSAGE = 'User not found';
const SET_COOKIE_HEADER = 'set-cookie';

export function createUserAccessRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const { adminUsers, userAccess } = services;
  const routes = new Hono<SignedIn>();

  async function archive(context: Context<SignedIn>): Promise<Response> {
    const userId = context.req.param('id') as string;
    const target = adminUsers.find(userId);
    if (!target) return context.json({ error: USER_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    const isLastActiveAdmin = target.role === UserRole.Admin && !target.isArchived && adminUsers.countActiveAdmins() === 1;
    if (isLastActiveAdmin) return context.json({ error: LAST_ADMIN_MESSAGE }, HttpStatus.Conflict);
    if (userId === context.var.user.id) return context.json({ error: CANNOT_ARCHIVE_SELF_MESSAGE }, HttpStatus.BadRequest);
    await userAccess.archive({ userId, headers: context.req.raw.headers });
    return context.json({ ...target, isArchived: true });
  }

  async function restore(context: Context<SignedIn>): Promise<Response> {
    const userId = context.req.param('id') as string;
    const target = adminUsers.find(userId);
    if (!target) return context.json({ error: USER_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    await userAccess.restore({ userId, headers: context.req.raw.headers });
    return context.json({ ...target, isArchived: false });
  }

  async function impersonate(context: Context<SignedIn>): Promise<Response> {
    const userId = context.req.param('id') as string;
    const adminId = context.var.user.id;
    const target = adminUsers.find(userId);
    if (!target) return context.json({ error: USER_NOT_FOUND_MESSAGE }, HttpStatus.NotFound);
    if (userId === adminId) return context.json({ error: CANNOT_IMPERSONATE_SELF_MESSAGE }, HttpStatus.BadRequest);
    if (target.isArchived) return context.json({ error: CANNOT_IMPERSONATE_ARCHIVED_MESSAGE }, HttpStatus.BadRequest);
    if (target.role === UserRole.Admin) return context.json({ error: CANNOT_IMPERSONATE_ADMIN_MESSAGE }, HttpStatus.BadRequest);
    const sessionHeaders = await userAccess.impersonate({ userId, headers: context.req.raw.headers });
    console.info(`impersonation started by ${adminId} as ${userId}`);
    sessionHeaders.getSetCookie().forEach((cookie) => context.header(SET_COOKIE_HEADER, cookie, { append: true }));
    return context.body(null, HttpStatus.NoContent);
  }

  const handlers: Record<UserAction, (context: Context<SignedIn>) => Promise<Response>> = {
    [UserAction.Archive]: archive,
    [UserAction.Restore]: restore,
    [UserAction.Impersonate]: impersonate,
  };
  Object.values(UserAction).forEach((action) => routes.post(`/${AdminResource.Users}/:id/${action}`, handlers[action]));

  return routes;
}
