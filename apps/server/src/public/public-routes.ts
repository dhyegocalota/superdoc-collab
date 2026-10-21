import { getConnInfo } from '@hono/node-server/conninfo';
import {
  CACHE_CONTROL_HEADER,
  HttpStatus,
  NO_STORE_CACHE_CONTROL,
  anonymousViewerOf,
  PUBLIC_MEMBERS_SEGMENT,
  PUBLIC_PREPARING_MESSAGE,
  PUBLIC_SUMMARY_SEGMENT,
  PUBLIC_RATE_LIMITED_MESSAGE,
  PublicAccess,
  RETRY_AFTER_SECONDS,
  RoomMode,
  secondsRoundedUp,
  signedInViewerOf,
  type PublicMembers,
  type PublicOpened,
  type PublicSummary,
} from '@superdoc-collab/types';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { Auth } from '../auth/auth';
import { readSession } from '../auth/session';
import { signPublicRoomToken } from '../collaboration/public-room-tokens';
import type { Environment } from '../config/environment';
import { DocumentNotFoundError } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import { clientAddressOf, FORWARDED_FOR_HEADER, UNKNOWN_CLIENT_ADDRESS_MESSAGE } from '../http/client-address';
import { retryLater } from '../http/retry-later';

const COOKIE_HEADER = 'cookie';

export function createPublicRoutes({ auth, environment, services }: { auth: Auth; environment: Environment; services: AppServices }): Hono {
  const { documents, runtime, publicReads, publicConnections, insightsRepository } = services;
  const routes = new Hono();

  routes.use('*', async (context, next) => {
    const remoteAddress = getConnInfo(context).remote.address;
    if (!remoteAddress) return context.json({ error: UNKNOWN_CLIENT_ADDRESS_MESSAGE }, HttpStatus.BadRequest);
    const address = clientAddressOf({
      forwardedFor: context.req.header(FORWARDED_FOR_HEADER),
      remoteAddress,
      trustProxy: environment.trustProxy,
      trustedProxyHops: environment.trustedProxyHops,
    });
    const waitMs = publicReads.waitMs(address);
    if (waitMs !== null) {
      return retryLater({
        context,
        body: { error: PUBLIC_RATE_LIMITED_MESSAGE },
        status: HttpStatus.TooManyRequests,
        retryAfterSeconds: secondsRoundedUp(waitMs),
      });
    }
    publicReads.record(address);
    context.header(CACHE_CONTROL_HEADER, NO_STORE_CACHE_CONTROL);
    await next();
  });

  routes.get('/:documentId', async (context) => {
    const documentId = context.req.param('documentId');
    const hasCookie = context.req.header(COOKIE_HEADER) !== undefined;
    const user = hasCookie ? await readSession({ auth, headers: context.req.raw.headers }) : null;
    const isMember = user !== null && documents.findRole({ documentId, userId: user.id }) !== null;
    if (isMember) return context.json({ access: PublicAccess.Member } satisfies PublicOpened);
    const document = documents.findPublic(documentId);
    if (!document) throw new DocumentNotFoundError();
    if (runtime.roomMode(documentId) !== RoomMode.Join) {
      return retryLater({
        context,
        body: { error: PUBLIC_PREPARING_MESSAGE },
        status: HttpStatus.ServiceUnavailable,
        retryAfterSeconds: RETRY_AFTER_SECONDS,
      });
    }
    const visitorId = randomUUID();
    const viewer = user === null ? anonymousViewerOf(visitorId) : signedInViewerOf({ visitorId, name: user.name });
    const roomToken = signPublicRoomToken({ secret: environment.authSecret, documentId, viewer, now: Date.now() });
    return context.json({ access: PublicAccess.Visitor, document, viewer, roomToken } satisfies PublicOpened);
  });

  routes.get(`/:documentId/${PUBLIC_SUMMARY_SEGMENT}`, (context) => {
    const documentId = context.req.param('documentId');
    if (!documents.findPublic(documentId)) throw new DocumentNotFoundError();
    return context.json({ summary: insightsRepository.latestSelectionSummary(documentId) } satisfies PublicSummary);
  });

  routes.get(`/:documentId/${PUBLIC_MEMBERS_SEGMENT}`, (context) => {
    const documentId = context.req.param('documentId');
    if (!documents.findPublic(documentId)) throw new DocumentNotFoundError();
    const online = runtime.onlineUserIds(documentId);
    const members = documents
      .membersWithColorSlots(documentId)
      .filter((member) => online.has(member.user.id))
      .map(({ user, colorSlot }) => ({ name: user.name, colorSlot }));
    return context.json({ members, visitors: publicConnections.visitorsOf(documentId) } satisfies PublicMembers);
  });

  return routes;
}
