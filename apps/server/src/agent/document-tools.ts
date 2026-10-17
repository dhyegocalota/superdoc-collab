import { AgentActionKind, AgentScope, AgentTool, DOCX_MIME_TYPE, DocumentRole } from '@superdoc-history/types';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { AgentToolContext } from './agent-tool-context';
import { defineTool, personOf, type AgentToolDefinition } from './agent-tool-definition';
import { jsonResult, required } from './tool-results';

type DocumentTool = AgentTool.InspectDocument | AgentTool.EditDocument | AgentTool.ExportDocx;

enum EditAction {
  ReplaceText = 'replace_text',
  InsertParagraphs = 'insert_paragraphs',
  InsertHeading = 'insert_heading',
}

enum ToolkitTool {
  Inspect = 'superdoc_inspect',
  PerformAction = 'superdoc_perform_action',
}

export const MAX_EDITS = 50;
export const MAX_TEXTS = 100;
export const MAX_TEXT_LENGTH = 10_000;
const TRACKED_CHANGE_MODE = 'tracked';
const MAXIMUM_HEADING_LEVEL = 6;
const EXPORT_DIRECTORY_PREFIX = 'superdoc-history-export-';
const EXPORT_FILE_NAME = 'document.docx';
const EXPORT_URI_PREFIX = 'superdoc-history://documents/';
const DOCX_URI_SUFFIX = '.docx';
const documentInput = { documentId: z.string().min(1).describe('The document id from list_documents') };
const editInputSchema = z.object({
  ...documentInput,
  action: z.enum(EditAction).describe('What to do: replace_text, insert_paragraphs or insert_heading'),
  edits: z
    .array(z.object({ find: z.string().min(1), replace: z.string() }))
    .min(1)
    .optional()
    .describe('For replace_text: the text to find and its replacement'),
  texts: z.array(z.string().min(1)).min(1).optional().describe('For insert_paragraphs: one text per paragraph'),
  text: z.string().min(1).optional().describe('For insert_heading: the heading text'),
  level: z.number().int().min(1).max(MAXIMUM_HEADING_LEVEL).optional().describe('For insert_heading: the heading level'),
});

type EditInput = z.infer<typeof editInputSchema>;

const ACTION_ARGUMENTS: Record<EditAction, (input: EditInput) => Record<string, unknown>> = {
  [EditAction.ReplaceText]: ({ edits }) => ({ edits: required({ value: edits, field: 'edits', tool: EditAction.ReplaceText }) }),
  [EditAction.InsertParagraphs]: ({ texts }) => ({ texts: required({ value: texts, field: 'texts', tool: EditAction.InsertParagraphs }) }),
  [EditAction.InsertHeading]: ({ text, level }) => ({
    text: required({ value: text, field: 'text', tool: EditAction.InsertHeading }),
    level: required({ value: level, field: 'level', tool: EditAction.InsertHeading }),
  }),
};

async function exportedBytes({ context, documentId }: { context: AgentToolContext; documentId: string }): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), EXPORT_DIRECTORY_PREFIX));
  const out = join(directory, EXPORT_FILE_NAME);
  try {
    await context.sessions.run({ person: personOf(context), documentId, work: (document) => document.save({ out }) });
    return await readFile(out);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const DOCUMENT_TOOLS: Record<DocumentTool, AgentToolDefinition> = {
  [AgentTool.InspectDocument]: defineTool({
    scope: AgentScope.DocumentEdit,
    minimumRole: DocumentRole.Editor,
    description: 'Inspect the live document: its paragraphs, revision and open tracked changes. Use findText to locate text.',
    inputSchema: z.object({ ...documentInput, findText: z.string().min(1).optional().describe('Text to locate in the document') }),
    handle: async ({ input, context }) => {
      const args = input.findText ? { findText: input.findText } : {};
      const snapshot = await context.sessions.run({
        person: personOf(context),
        documentId: input.documentId,
        work: (document) => context.toolkit.dispatch(document, ToolkitTool.Inspect, args),
      });
      return jsonResult(snapshot);
    },
  }),
  [AgentTool.EditDocument]: defineTool({
    scope: AgentScope.DocumentEdit,
    minimumRole: DocumentRole.Editor,
    description:
      'Edit the live document. Every change is a tracked change signed as the person plus AI; the person accepts or rejects it in the app.',
    inputSchema: editInputSchema,
    handle: async ({ input, context }) => {
      const args = { action: input.action, ...ACTION_ARGUMENTS[input.action](input), changeMode: TRACKED_CHANGE_MODE };
      const receipt = await context.sessions.run({
        person: personOf(context),
        documentId: input.documentId,
        work: (document) => context.toolkit.dispatch(document, ToolkitTool.PerformAction, args),
      });
      return jsonResult(receipt);
    },
  }),
  [AgentTool.ExportDocx]: defineTool({
    scope: AgentScope.DocumentExport,
    minimumRole: DocumentRole.Reader,
    description: 'Export the live document, with its tracked changes, as a DOCX file.',
    inputSchema: z.object(documentInput),
    handle: async ({ input, context }) => {
      const bytes = await exportedBytes({ context, documentId: input.documentId });
      context.recordAction({ documentId: input.documentId, userId: context.principal.userId, kind: AgentActionKind.DocumentExported });
      const uri = `${EXPORT_URI_PREFIX}${input.documentId}${DOCX_URI_SUFFIX}`;
      return { content: [{ type: 'resource', resource: { uri, mimeType: DOCX_MIME_TYPE, blob: bytes.toString('base64') } }] };
    },
  }),
};
