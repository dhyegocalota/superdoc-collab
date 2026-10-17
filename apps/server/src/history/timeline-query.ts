import { BIN_LADDER_MS } from '@superdoc-history/history';
import { FILTER_MAX_LENGTH, TimelineQueryParam } from '@superdoc-history/types';
import { z } from 'zod';

export const INVALID_TIMELINE_QUERY_MESSAGE = 'The timeline query is invalid';
const DIGITS_PATTERN = /^\d+$/;
const filterText = z.string().trim().max(FILTER_MAX_LENGTH).optional().transform((value) => (value ? value : null));
const binMsParameter = z.coerce.number().int().refine((value) => BIN_LADDER_MS.includes(value)).optional().transform((value) => (value === undefined ? null : value));
export const timelineQuerySchema = z.object({ [TimelineQueryParam.Term]: filterText, [TimelineQueryParam.Author]: filterText, [TimelineQueryParam.BinMs]: binMsParameter });
const binStartParameter = z.string().optional().refine((value) => !value || (DIGITS_PATTERN.test(value) && Number.isSafeInteger(Number(value)))).transform((value) => (value ? Number(value) : null));
export const editsQuerySchema = timelineQuerySchema.extend({ [TimelineQueryParam.BinStart]: z.coerce.number().int() });
export const selectionQuerySchema = timelineQuerySchema.extend({ [TimelineQueryParam.Topic]: filterText, [TimelineQueryParam.At]: binStartParameter });

export function queryOf({ read, names }: { read: (name: string) => string | undefined; names: string[] }): Record<string, string | undefined> {
  return Object.fromEntries(names.map((name) => [name, read(name)]));
}
