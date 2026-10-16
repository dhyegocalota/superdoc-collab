import { z } from 'zod';

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

export type Environment = { port: number; appOrigin: string; authSecret: string; databaseDirectory: string; trustProxy: boolean };

export function loadEnvironment(source: NodeJS.ProcessEnv): Environment {
  const missing = Object.keys(schema.shape).find((name) => source[name] === undefined);
  if (missing) throw new MissingEnvironmentVariableError(missing);
  const parsed = schema.parse(source);
  if (new URL(parsed.APP_ORIGIN).origin !== parsed.APP_ORIGIN) throw new InvalidOriginError({ name: 'APP_ORIGIN', value: parsed.APP_ORIGIN });
  return { port: parsed.PORT, appOrigin: parsed.APP_ORIGIN, authSecret: parsed.AUTH_SECRET, databaseDirectory: parsed.DATABASE_DIR, trustProxy: parsed.TRUST_PROXY === BooleanFlag.True };
}
