import { describe, expect, test } from 'vitest';
import { MissingEnvironmentVariableError, loadEnvironment } from './environment';

const complete: Record<string, string> = { PORT: '3000', APP_ORIGIN: 'http://localhost:5173', AUTH_SECRET: 'x'.repeat(32), DATABASE_DIR: '/tmp/data' };

describe('loadEnvironment', () => {
  test('parses a complete environment', () => {
    expect(loadEnvironment(complete)).toEqual({ port: 3000, appOrigin: 'http://localhost:5173', authSecret: 'x'.repeat(32), databaseDirectory: '/tmp/data' });
  });
  test.each(Object.keys(complete))('names %s when it is missing', (name) => {
    const { [name]: _removed, ...rest } = complete;
    expect(() => loadEnvironment(rest)).toThrow(new MissingEnvironmentVariableError(name));
  });
  test('rejects a short AUTH_SECRET', () => {
    expect(() => loadEnvironment({ ...complete, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });
});
