import { describe, expect, test } from 'vitest';
import { InvalidOriginError, MissingEnvironmentVariableError, loadEnvironment } from './environment';

const complete: Record<string, string> = { PORT: '3000', APP_ORIGIN: 'http://localhost:5173', AUTH_SECRET: 'x'.repeat(32), DATABASE_DIR: '/tmp/data', TRUST_PROXY: 'false' };

describe('loadEnvironment', () => {
  test('parses a complete environment', () => {
    expect(loadEnvironment(complete)).toEqual({ port: 3000, appOrigin: 'http://localhost:5173', authSecret: 'x'.repeat(32), databaseDirectory: '/tmp/data', trustProxy: false });
  });
  test.each(Object.keys(complete))('names %s when it is missing', (name) => {
    const { [name]: _removed, ...rest } = complete;
    expect(() => loadEnvironment(rest)).toThrow(new MissingEnvironmentVariableError(name));
  });
  test('parses TRUST_PROXY true', () => {
    expect(loadEnvironment({ ...complete, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
  });
  test('rejects an invalid TRUST_PROXY', () => {
    expect(() => loadEnvironment({ ...complete, TRUST_PROXY: 'yes' })).toThrow();
  });
  test('rejects a short AUTH_SECRET', () => {
    expect(() => loadEnvironment({ ...complete, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });
  test.each(['http://host/', 'http://host/path', 'HTTP://Host:3000', 'http://user:secret@host:3000'])('rejects APP_ORIGIN %s that is not a bare origin', (value) => {
    expect(() => loadEnvironment({ ...complete, APP_ORIGIN: value })).toThrow(new InvalidOriginError({ name: 'APP_ORIGIN', value }));
  });
  test('accepts a bare loopback APP_ORIGIN', () => {
    expect(loadEnvironment({ ...complete, APP_ORIGIN: 'http://127.0.0.1:3000' }).appOrigin).toBe('http://127.0.0.1:3000');
  });
});
