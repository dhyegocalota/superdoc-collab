import { OPEN_UNCOMMITTED_PER_MINUTE, presentOrNull } from '@superdoc-collab/types';
import { z } from 'zod';

// NB ADR 0011: two process-wide caps, concurrent jobs and hourly calls; the hourly one is consumed at the model call; over a cap the job is refused, never queued.
export const LLM_MAX_CONCURRENT_JOBS = 2;
export const LLM_MAX_CALLS_PER_HOUR = 60;
export const TRUSTED_PROXY_HOPS = 1;
const AUTH_SECRET_MIN_LENGTH = 32;

export class MissingEnvironmentVariableError extends Error {
  constructor(name: string) {
    super(`Missing environment variable: ${name}`);
  }
}

export class InvalidOriginError extends Error {
  constructor({ name, value }: { name: string; value: string }) {
    super(`Environment variable ${name} must be a bare origin, received: ${value}`);
  }
}

enum BooleanFlag {
  True = 'true',
  False = 'false',
}

const schema = z.object({
  PORT: z.coerce.number().int().positive(),
  APP_ORIGIN: z.url(),
  AUTH_SECRET: z.string().min(AUTH_SECRET_MIN_LENGTH),
  DATABASE_DIR: z.string().min(1),
  TRUST_PROXY: z.enum(BooleanFlag),
});

export class InvalidEnvironmentIntegerError extends Error {
  constructor({ name, value }: { name: string; value: string }) {
    super(`Environment variable ${name} must be an integer greater than zero, received: ${value}`);
  }
}

const limitSchema = z.coerce.number().int().positive();

const llmSchema = z.object({
  LLM_MAX_CONCURRENT_JOBS: z.string().optional(),
  LLM_MAX_CALLS_PER_HOUR: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.union([z.literal(''), z.url()]).optional(),
});

export type LlmSettings = {
  model: string | null;
  apiKey: string | null;
  baseUrl: string | null;
  maxConcurrentJobs: number;
  maxCallsPerHour: number;
};

export type Environment = {
  port: number;
  host: string | null;
  appOrigin: string;
  authSecret: string;
  databaseDirectory: string;
  trustProxy: boolean;
  trustedProxyHops: number;
  llm: LlmSettings;
  openUncommittedPerMinute: number;
};

function limitFrom({ name, value, fallback }: { name: string; value: string | undefined; fallback: number }): number {
  if (!value) return fallback;
  const parsed = limitSchema.safeParse(value);
  if (!parsed.success) throw new InvalidEnvironmentIntegerError({ name, value });
  return parsed.data;
}

export function loadLlmSettings(source: NodeJS.ProcessEnv): LlmSettings {
  const parsed = llmSchema.parse(source);
  return {
    model: presentOrNull(parsed.LLM_MODEL),
    apiKey: presentOrNull(parsed.OPENROUTER_API_KEY),
    baseUrl: presentOrNull(parsed.OPENROUTER_BASE_URL),
    maxConcurrentJobs: limitFrom({
      name: 'LLM_MAX_CONCURRENT_JOBS',
      value: parsed.LLM_MAX_CONCURRENT_JOBS,
      fallback: LLM_MAX_CONCURRENT_JOBS,
    }),
    maxCallsPerHour: limitFrom({ name: 'LLM_MAX_CALLS_PER_HOUR', value: parsed.LLM_MAX_CALLS_PER_HOUR, fallback: LLM_MAX_CALLS_PER_HOUR }),
  };
}

export function loadEnvironment(source: NodeJS.ProcessEnv): Environment {
  const missing = Object.keys(schema.shape).find((name) => source[name] === undefined);
  if (missing) throw new MissingEnvironmentVariableError(missing);
  const parsed = schema.parse(source);
  if (new URL(parsed.APP_ORIGIN).origin !== parsed.APP_ORIGIN)
    throw new InvalidOriginError({ name: 'APP_ORIGIN', value: parsed.APP_ORIGIN });
  return {
    port: parsed.PORT,
    host: presentOrNull(source.HOST),
    appOrigin: parsed.APP_ORIGIN,
    authSecret: parsed.AUTH_SECRET,
    databaseDirectory: parsed.DATABASE_DIR,
    trustProxy: parsed.TRUST_PROXY === BooleanFlag.True,
    trustedProxyHops: limitFrom({ name: 'TRUSTED_PROXY_HOPS', value: source.TRUSTED_PROXY_HOPS, fallback: TRUSTED_PROXY_HOPS }),
    llm: loadLlmSettings(source),
    openUncommittedPerMinute: limitFrom({
      name: 'OPEN_UNCOMMITTED_PER_MINUTE',
      value: source.OPEN_UNCOMMITTED_PER_MINUTE,
      fallback: OPEN_UNCOMMITTED_PER_MINUTE,
    }),
  };
}
