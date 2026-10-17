import { BIN_LADDER_MS, MAX_BIN_MS } from '@superdoc-collab/history';
import {
  canonicalTimeZone,
  FILTER_MAX_LENGTH,
  isSupportedTimeZone,
  NON_NEGATIVE_INTEGER_PATTERN,
  TimelineQueryParam,
  WEEK_MS,
} from '@superdoc-collab/types';
import { z } from 'zod';

export const INVALID_TIMELINE_QUERY_MESSAGE = 'The timeline query is invalid';
const filterText = z
  .string()
  .trim()
  .max(FILTER_MAX_LENGTH)
  .optional()
  .transform((value) => (value ? value : null));
function isSupportedBinMs(value: number): boolean {
  return BIN_LADDER_MS.includes(value) || (value > 0 && value <= MAX_BIN_MS && value % WEEK_MS === 0);
}

const binMsParameter = z.coerce
  .number()
  .int()
  .refine(isSupportedBinMs)
  .optional()
  .transform((value) => (value === undefined ? null : value));
export const timelineQuerySchema = z.object({
  [TimelineQueryParam.Term]: filterText,
  [TimelineQueryParam.Author]: filterText,
  [TimelineQueryParam.BinMs]: binMsParameter,
  [TimelineQueryParam.TimeZone]: z.string().refine(isSupportedTimeZone).transform(canonicalTimeZone),
});
function isOptionalSafeInteger(value: string | undefined): boolean {
  if (!value) return true;
  return NON_NEGATIVE_INTEGER_PATTERN.test(value) && Number.isSafeInteger(Number(value));
}

const binStartParameter = z
  .string()
  .optional()
  .refine(isOptionalSafeInteger)
  .transform((value) => (value ? Number(value) : null));
export const editsQuerySchema = timelineQuerySchema.extend({ [TimelineQueryParam.BinStart]: z.coerce.number().int() });
export const selectionQuerySchema = timelineQuerySchema.extend({
  [TimelineQueryParam.Topic]: filterText,
  [TimelineQueryParam.At]: binStartParameter,
});
