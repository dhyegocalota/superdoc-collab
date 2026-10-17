import { BIN_LADDER_MS } from '@superdoc-history/history';
import {
  AgentScope,
  AgentTool,
  DocumentRole,
  FILTER_MAX_LENGTH,
  RETRY_AFTER_SECONDS,
  SELECTION_SUMMARY_TOO_SOON_MESSAGE,
} from '@superdoc-history/types';
import { z } from 'zod';
import { buildBinEdits, buildDocumentTimeline } from '../history/timeline-service';
import { documentTopics } from '../insights/document-topics';
import { LLM_BUSY_MESSAGE } from '../insights/llm-client';
import { SelectionRequestOutcome, type RequestedSelection } from '../insights/selection-summaries-service';
import { defineTool, type AgentToolDefinition } from './agent-tool-definition';
import { absentAsNull, AgentToolError, jsonResult } from './tool-results';

type ReadTool =
  AgentTool.ListDocuments | AgentTool.GetTimeline | AgentTool.GetBinEdits | AgentTool.ListTopics | AgentTool.SummarizeSelection;

const documentInput = { documentId: z.string().min(1).describe('The document id from list_documents') };
const filterInput = {
  term: z.string().min(1).max(FILTER_MAX_LENGTH).optional().describe('Only edits whose text contains this term'),
  author: z.string().min(1).max(FILTER_MAX_LENGTH).optional().describe('Only edits by authors whose name or email contains this text'),
};
const binMsInput = z
  .number()
  .int()
  .refine((value) => BIN_LADDER_MS.includes(value))
  .optional()
  .describe('The binMs returned by get_timeline');

export const READ_TOOLS: Record<ReadTool, AgentToolDefinition> = {
  [AgentTool.ListDocuments]: defineTool({
    scope: AgentScope.HistoryRead,
    minimumRole: DocumentRole.Reader,
    description: 'List the documents the person is a member of, with their role on each.',
    inputSchema: z.object({}),
    handle: ({ context }) => jsonResult(context.services.documents.list(context.principal.userId)),
  }),
  [AgentTool.GetTimeline]: defineTool({
    scope: AgentScope.HistoryRead,
    minimumRole: DocumentRole.Reader,
    description: 'Read how a document evolved: time bins, topic or author bands, contributors and authors. At most 120 bins.',
    inputSchema: z.object({ ...documentInput, ...filterInput }),
    handle: ({ input, context }) => {
      const { services } = context;
      services.insights.topics.ensure(input.documentId);
      const timeline = buildDocumentTimeline({
        services,
        documentId: input.documentId,
        filter: { term: absentAsNull(input.term), author: absentAsNull(input.author) },
        binMs: null,
      });
      services.insights.topics.onTimelineRead(input.documentId);
      return jsonResult(timeline);
    },
  }),
  [AgentTool.GetBinEdits]: defineTool({
    scope: AgentScope.HistoryRead,
    minimumRole: DocumentRole.Reader,
    description: 'Read the edit runs of one timeline bin with their authors. Pass the bin start and binMs from get_timeline.',
    inputSchema: z.object({
      ...documentInput,
      ...filterInput,
      binStart: z.number().int().describe('The start of the bin'),
      binMs: binMsInput,
    }),
    handle: ({ input, context }) =>
      jsonResult(
        buildBinEdits({
          services: context.services,
          documentId: input.documentId,
          filter: { term: absentAsNull(input.term), author: absentAsNull(input.author) },
          binStart: input.binStart,
          binMs: absentAsNull(input.binMs),
        }),
      ),
  }),
  [AgentTool.ListTopics]: defineTool({
    scope: AgentScope.HistoryRead,
    minimumRole: DocumentRole.Reader,
    description: 'List the topics of a document and the status of the topic analysis.',
    inputSchema: z.object(documentInput),
    handle: ({ input, context }) => {
      context.services.insights.topics.ensure(input.documentId);
      return jsonResult(documentTopics({ services: context.services, documentId: input.documentId }));
    },
  }),
  [AgentTool.SummarizeSelection]: defineTool({
    scope: AgentScope.HistoryRead,
    minimumRole: DocumentRole.Editor,
    description:
      'Summarize in one sentence what a selection of edits changed. Starts the summary when none is fresh; call again to read it. When busy or too soon the error carries retryAfterSeconds.',
    inputSchema: z.object({
      ...documentInput,
      ...filterInput,
      topic: z.string().min(1).max(FILTER_MAX_LENGTH).optional().describe('Only edits in the topic with this id'),
      at: z.number().int().nonnegative().optional().describe('Only edits in the bin that starts at this time'),
      binMs: binMsInput,
    }),
    handle: ({ input, context }) => {
      const { documentId } = input;
      const selection: RequestedSelection = {
        term: absentAsNull(input.term),
        author: absentAsNull(input.author),
        topic: absentAsNull(input.topic),
        at: absentAsNull(input.at),
        binMs: absentAsNull(input.binMs),
      };
      const { selection: summaries } = context.services.insights;
      const result = summaries.request({ documentId, selection });
      if (result.outcome === SelectionRequestOutcome.TooSoon)
        throw new AgentToolError({ message: SELECTION_SUMMARY_TOO_SOON_MESSAGE, details: { retryAfterSeconds: result.retryAfterSeconds } });
      if (result.outcome === SelectionRequestOutcome.Busy)
        throw new AgentToolError({ message: LLM_BUSY_MESSAGE, details: { retryAfterSeconds: result.retryAfterSeconds } });
      if (result.outcome === SelectionRequestOutcome.Unavailable)
        throw new AgentToolError({ message: result.reason, details: { retryAfterSeconds: RETRY_AFTER_SECONDS } });
      return jsonResult(summaries.read({ documentId, selection }));
    },
  }),
};
