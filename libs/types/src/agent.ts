export enum ClientActor {
  Human = 'human',
  Agent = 'agent',
}

export enum AgentScope {
  HistoryRead = 'history:read',
  DocumentEdit = 'document:edit',
  DocumentExport = 'document:export',
  DocumentShare = 'document:share',
}

export enum AgentActionKind {
  ShareLinkRotated = 'share-link-rotated',
  DocumentExported = 'document-exported',
}

export enum AgentTool {
  ListDocuments = 'list_documents',
  GetTimeline = 'get_timeline',
  GetBinEdits = 'get_bin_edits',
  ListTopics = 'list_topics',
  SummarizeSelection = 'summarize_selection',
  InspectDocument = 'inspect_document',
  EditDocument = 'edit_document',
  ExportDocx = 'export_docx',
  ListMembers = 'list_members',
  GetShareLinks = 'get_share_links',
  RotateShareLink = 'rotate_share_link',
}

export const OFFLINE_ACCESS_SCOPE = 'offline_access';
const AGENT_NAME_SUFFIX = ' · AI';

export function agentAuthorName(name: string): string {
  return `${name}${AGENT_NAME_SUFFIX}`;
}
