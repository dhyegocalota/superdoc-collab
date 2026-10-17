import { AgentActionKind, AgentScope, AgentTool, DocumentRole, ShareLinkRole } from '@superdoc-collab/types';
import { z } from 'zod';
import { defineDocumentTool, type AgentToolDefinition } from './agent-tool-definition';
import { jsonResult } from './tool-results';

type ShareTool = AgentTool.ListMembers | AgentTool.GetShareLinks | AgentTool.RotateShareLink;

export const SHARE_TOOLS: Record<ShareTool, AgentToolDefinition> = {
  [AgentTool.ListMembers]: defineDocumentTool({
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
    scope: AgentScope.DocumentShare,
    minimumRole: DocumentRole.Owner,
    description: 'Reveal the edit and read share links of a document. The reveal is recorded on the document timeline.',
    shape: {},
    handle: ({ input, context }) => {
      const links = context.services.shareLinks.links(input.documentId);
      context.recordAction({ documentId: input.documentId, userId: context.principal.userId, kind: AgentActionKind.ShareLinkRevealed });
      return jsonResult(links);
    },
  }),
  [AgentTool.RotateShareLink]: defineDocumentTool({
    scope: AgentScope.DocumentShare,
    minimumRole: DocumentRole.Owner,
    description: 'Rotate the edit or read share link of a document, which revokes the old link. The rotation is recorded on the timeline.',
    shape: { role: z.enum(ShareLinkRole).describe('Which link to rotate: edit or read') },
    handle: ({ input, context }) => {
      const links = context.services.shareLinks.rotate({ documentId: input.documentId, role: input.role });
      context.recordAction({ documentId: input.documentId, userId: context.principal.userId, kind: AgentActionKind.ShareLinkRotated });
      return jsonResult(links);
    },
  }),
};
