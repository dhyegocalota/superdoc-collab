import { AgentActionKind, AgentScope, AgentTool, DOCX_MIME_TYPE, DocumentRole, RoomMode } from '@superdoc-history/types';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { AgentToolContext } from './agent-tool-context';
import { AgentChangeMode } from './agent-change-mode';
import { defineDocumentTool, personOf, type AgentToolDefinition } from './agent-tool-definition';
import { AgentToolError, jsonResult, required, type ToolErrorDetails } from './tool-results';

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
const MAXIMUM_HEADING_LEVEL = 6;
const OK_RECEIPT_STATUS = 'ok';
const UNREADABLE_RECEIPT_MESSAGE = 'The edit returned a receipt that could not be read';
const receiptSchema = z.object({
  status: z.string(),
  errors: z.array(z.object({ code: z.string(), message: z.string() })).optional(),
  nextStep: z.string().optional(),
});
const EXPORT_DIRECTORY_PREFIX = 'superdoc-history-export-';
const EXPORT_FILE_NAME = 'document.docx';
const EXPORT_URI_PREFIX = 'superdoc-history://documents/';
const DOCX_URI_SUFFIX = '.docx';
const editShape = {
  action: z.enum(EditAction).describe('What to do: replace_text, insert_paragraphs or insert_heading'),
  edits: z
    .array(z.object({ find: z.string().min(1).max(MAX_TEXT_LENGTH), replace: z.string().max(MAX_TEXT_LENGTH) }))
    .min(1)
    .max(MAX_EDITS)
    .optional()
    .describe('For replace_text: the text to find and its replacement'),
  texts: z
    .array(z.string().min(1).max(MAX_TEXT_LENGTH))
    .min(1)
    .max(MAX_TEXTS)
    .optional()
    .describe('For insert_paragraphs: one text per paragraph'),
  text: z.string().min(1).max(MAX_TEXT_LENGTH).optional().describe('For insert_heading: the heading text'),
  level: z.number().int().min(1).max(MAXIMUM_HEADING_LEVEL).optional().describe('For insert_heading: the heading level'),
};

type EditInput = z.infer<z.ZodObject<typeof editShape>>;

const ACTION_ARGUMENTS: Record<EditAction, (input: EditInput) => Record<string, unknown>> = {
  [EditAction.ReplaceText]: ({ edits }) => ({ edits: required({ value: edits, field: 'edits', tool: EditAction.ReplaceText }) }),
  [EditAction.InsertParagraphs]: ({ texts }) => ({ texts: required({ value: texts, field: 'texts', tool: EditAction.InsertParagraphs }) }),
  [EditAction.InsertHeading]: ({ text, level }) => ({
    text: required({ value: text, field: 'text', tool: EditAction.InsertHeading }),
    level: required({ value: level, field: 'level', tool: EditAction.InsertHeading }),
  }),
};

function requireAppliedReceipt(receipt: unknown): void {
  const parsed = receiptSchema.safeParse(receipt);
  if (!parsed.success) throw new AgentToolError({ message: UNREADABLE_RECEIPT_MESSAGE });
  const { status, errors, nextStep } = parsed.data;
  if (status === OK_RECEIPT_STATUS) return;
  const reasons = errors ? errors.map(({ code, message }) => `${code}: ${message}`).join('; ') : '';
  const message = reasons ? `The edit ${status}: ${reasons}` : `The edit ${status}`;
  const details: ToolErrorDetails = nextStep ? { status, nextStep } : { status };
  throw new AgentToolError({ message, details });
}

async function exportedBytes({ context, documentId }: { context: AgentToolContext; documentId: string }): Promise<Uint8Array> {
  const { runtime, storage } = context.services;
  if (runtime.roomMode(documentId) === RoomMode.Create) return storage.read(documentId);
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
  [AgentTool.InspectDocument]: defineDocumentTool({
    scope: AgentScope.DocumentEdit,
    minimumRole: DocumentRole.Editor,
    description: 'Inspect the live document: its paragraphs, revision and open tracked changes. Use findText to locate text.',
    shape: { findText: z.string().min(1).max(MAX_TEXT_LENGTH).optional().describe('Text to locate in the document') },
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
  [AgentTool.EditDocument]: defineDocumentTool({
    scope: AgentScope.DocumentEdit,
    minimumRole: DocumentRole.Editor,
    description:
      'Edit the live document. Every change is a tracked change signed as the person plus AI; the person accepts or rejects it in the app. A receipt that is not ok is returned as an error. Paragraphs inserted straight after a heading take its style, because the SDK offers no paragraph style argument.',
    shape: editShape,
    handle: async ({ input, context }) => {
      const args = { action: input.action, ...ACTION_ARGUMENTS[input.action](input), changeMode: AgentChangeMode.Tracked };
      const receipt = await context.sessions.run({
        person: personOf(context),
        documentId: input.documentId,
        work: (document) => context.toolkit.dispatch(document, ToolkitTool.PerformAction, args),
      });
      requireAppliedReceipt(receipt);
      return jsonResult(receipt);
    },
  }),
  [AgentTool.ExportDocx]: defineDocumentTool({
    scope: AgentScope.DocumentExport,
    minimumRole: DocumentRole.Reader,
    description: 'Export the live document, with its tracked changes, as a DOCX file.',
    shape: {},
    handle: async ({ input, context }) => {
      const bytes = await exportedBytes({ context, documentId: input.documentId });
      context.recordAction({ documentId: input.documentId, userId: context.principal.userId, kind: AgentActionKind.DocumentExported });
      const uri = `${EXPORT_URI_PREFIX}${input.documentId}${DOCX_URI_SUFFIX}`;
      return { content: [{ type: 'resource', resource: { uri, mimeType: DOCX_MIME_TYPE, blob: Buffer.from(bytes).toString('base64') } }] };
    },
  }),
};
