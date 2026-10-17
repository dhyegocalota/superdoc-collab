import { AgentActionKind, AgentScope, AgentTool, DocumentRole, documentPagePath, ShareLinkRole } from '@superdoc-history/types';
import { z } from 'zod';
import { DESTRUCTIVE_ANNOTATIONS, defineDocumentTool, READ_ONLY_ANNOTATIONS, type AgentToolDefinition } from './agent-tool-definition';
import { jsonResult } from './tool-results';

const SHARE_INSTRUCTION =
  'Open this document in the app and choose Share to copy the edit or read link. Link secrets are never sent to AI clients.';

type ShareTool = AgentTool.ListMembers | AgentTool.GetShareLinks | AgentTool.RotateShareLink;

export const SHARE_TOOLS: Record<ShareTool, AgentToolDefinition> = {
  [AgentTool.ListMembers]: defineDocumentTool({
    annotations: READ_ONLY_ANNOTATIONS,
    scope: AgentScope.DocumentShare,
    minimumRole: DocumentRole.Reader,
    description: 'List the members of a document with their role and whether they are online.',
    shape: {},
    handle: ({ input, context }) => {
      const online = context.services.runtime.onlineUserIds(input.documentId);
      const members = context.services.documents
        .members(input.documentId)
        .map((member) => ({ ...member, online: online.has(member.user.id) }));
      return jsonResult({ members });
    },
  }),
  [AgentTool.GetShareLinks]: defineDocumentTool({
    annotations: READ_ONLY_ANNOTATIONS,
    scope: AgentScope.DocumentShare,
    minimumRole: DocumentRole.Owner,
    description: 'Point to the Share dialog of a document, where the person copies the edit or read link. No link secret is returned.',
    shape: {},
    handle: ({ input, context }) =>
      jsonResult({ documentUrl: `${context.appOrigin}${documentPagePath(input.documentId)}`, instruction: SHARE_INSTRUCTION }),
  }),
  [AgentTool.RotateShareLink]: defineDocumentTool({
    annotations: DESTRUCTIVE_ANNOTATIONS,
    scope: AgentScope.DocumentShare,
    minimumRole: DocumentRole.Owner,
    description:
      'Rotate the edit or read share link of a document, which revokes the old link. No link secret is returned. The rotation is recorded on the timeline.',
    shape: { role: z.enum(ShareLinkRole).describe('Which link to rotate: edit or read') },
    handle: ({ input, context }) => {
      context.services.shareLinks.rotate({ documentId: input.documentId, role: input.role });
      context.recordAction({ documentId: input.documentId, userId: context.principal.userId, kind: AgentActionKind.ShareLinkRotated });
      return jsonResult({
        rotated: input.role,
        documentUrl: `${context.appOrigin}${documentPagePath(input.documentId)}`,
        instruction: SHARE_INSTRUCTION,
      });
    },
  }),
};
