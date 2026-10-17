import { AgentActionKind, AgentScope, AgentTool, DocumentRole, ShareLinkRole } from '@superdoc-history/types';
import { z } from 'zod';
import { defineTool, type AgentToolDefinition } from './agent-tool-definition';
import { jsonResult } from './tool-results';

type ShareTool = AgentTool.ListMembers | AgentTool.GetShareLinks | AgentTool.RotateShareLink;

const documentInput = { documentId: z.string().min(1).describe('The document id from list_documents') };

export const SHARE_TOOLS: Record<ShareTool, AgentToolDefinition> = {
  [AgentTool.ListMembers]: defineTool({
    scope: AgentScope.DocumentShare,
    minimumRole: DocumentRole.Reader,
    description: 'List the members of a document with their role and whether they are online.',
    inputSchema: z.object(documentInput),
    handle: ({ input, context }) => {
      const online = context.services.runtime.onlineUserIds(input.documentId);
      const members = context.services.documents
        .members(input.documentId)
        .map((member) => ({ ...member, online: online.has(member.user.id) }));
      return jsonResult({ members });
    },
  }),
  [AgentTool.GetShareLinks]: defineTool({
    scope: AgentScope.DocumentShare,
    minimumRole: DocumentRole.Owner,
    description: 'Reveal the edit and read share links of a document. The reveal is recorded on the document timeline.',
    inputSchema: z.object(documentInput),
    handle: ({ input, context }) => {
      const links = context.services.shareLinks.links(input.documentId);
      context.recordAction({ documentId: input.documentId, userId: context.principal.userId, kind: AgentActionKind.ShareLinkRevealed });
      return jsonResult(links);
    },
  }),
  [AgentTool.RotateShareLink]: defineTool({
    scope: AgentScope.DocumentShare,
    minimumRole: DocumentRole.Owner,
    description: 'Rotate the edit or read share link of a document, which revokes the old link. The rotation is recorded on the timeline.',
    inputSchema: z.object({ ...documentInput, role: z.enum(ShareLinkRole).describe('Which link to rotate: edit or read') }),
    handle: ({ input, context }) => {
      const links = context.services.shareLinks.rotate({ documentId: input.documentId, role: input.role });
      context.recordAction({ documentId: input.documentId, userId: context.principal.userId, kind: AgentActionKind.ShareLinkRotated });
      return jsonResult(links);
    },
  }),
};
