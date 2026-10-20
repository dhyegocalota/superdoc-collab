import { OPEN_UNCOMMITTED_PER_MINUTE, UPLOADS_PER_MINUTE } from '@superdoc-collab/types';
import { describe, expect, test } from 'vitest';
import { LLM_MAX_CALLS_PER_HOUR, LLM_MAX_CONCURRENT_JOBS } from './environment';
import { InvalidEnvironmentIntegerError, InvalidOriginError, MissingEnvironmentVariableError, loadEnvironment } from './environment';

const complete: Record<string, string> = {
  PORT: '3000',
  APP_ORIGIN: 'http://localhost:5173',
  AUTH_SECRET: 'x'.repeat(32),
  DATABASE_DIR: '/tmp/data',
  TRUST_PROXY: 'false',
};

const noLlm = {
  model: null,
  apiKey: null,
  baseUrl: null,
  maxConcurrentJobs: LLM_MAX_CONCURRENT_JOBS,
  maxCallsPerHour: LLM_MAX_CALLS_PER_HOUR,
};

describe('loadEnvironment', () => {
  test('parses a complete environment', () => {
    expect(loadEnvironment(complete)).toEqual({
      port: 3000,
      host: null,
      appOrigin: 'http://localhost:5173',
      authSecret: 'x'.repeat(32),
      databaseDirectory: '/tmp/data',
      trustProxy: false,
      trustedProxyHops: 1,
      llm: noLlm,
      openUncommittedPerMinute: OPEN_UNCOMMITTED_PER_MINUTE,
      uploadsPerMinute: UPLOADS_PER_MINUTE,
      projectionWorkerHeapMegabytes: null,
      bootstrapHostHeapMegabytes: null,
      memoryLimitMegabytes: null,
    });
  });
  test.each(Object.keys(complete))('names %s when it is missing', (name) => {
    const { [name]: _removed, ...rest } = complete;
    expect(() => loadEnvironment(rest)).toThrow(new MissingEnvironmentVariableError(name));
  });
  test('binds the address HOST names and every interface without it', () => {
    expect(loadEnvironment({ ...complete, HOST: '127.0.0.1' }).host).toBe('127.0.0.1');
    expect(loadEnvironment({ ...complete, HOST: '' }).host).toBeNull();
  });

  test('parses TRUST_PROXY true', () => {
    expect(loadEnvironment({ ...complete, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
  });
  test('rejects an invalid TRUST_PROXY', () => {
    expect(() => loadEnvironment({ ...complete, TRUST_PROXY: 'yes' })).toThrow();
  });
  test('parses TRUSTED_PROXY_HOPS and defaults it to one', () => {
    expect(loadEnvironment({ ...complete, TRUSTED_PROXY_HOPS: '2' }).trustedProxyHops).toBe(2);
    expect(loadEnvironment({ ...complete, TRUSTED_PROXY_HOPS: '' }).trustedProxyHops).toBe(1);
  });
  test.each(['0', '-1', '1.5', 'two'])('refuses to start with TRUSTED_PROXY_HOPS %s, naming the variable', (value) => {
    expect(() => loadEnvironment({ ...complete, TRUSTED_PROXY_HOPS: value })).toThrow(/TRUSTED_PROXY_HOPS/);
  });
  test('rejects a short AUTH_SECRET', () => {
    expect(() => loadEnvironment({ ...complete, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });
  test.each(['http://host/', 'http://host/path', 'HTTP://Host:3000', 'http://user:secret@host:3000'])(
    'rejects APP_ORIGIN %s that is not a bare origin',
    (value) => {
      expect(() => loadEnvironment({ ...complete, APP_ORIGIN: value })).toThrow(new InvalidOriginError({ name: 'APP_ORIGIN', value }));
    },
  );
  test('accepts a bare loopback APP_ORIGIN', () => {
    expect(loadEnvironment({ ...complete, APP_ORIGIN: 'http://127.0.0.1:3000' }).appOrigin).toBe('http://127.0.0.1:3000');
  });
  test('leaves the LLM settings null when none are set', () => {
    expect(loadEnvironment(complete).llm).toEqual(noLlm);
  });
  test('treats empty LLM variables as absent', () => {
    expect(loadEnvironment({ ...complete, LLM_MODEL: '', OPENROUTER_API_KEY: '', OPENROUTER_BASE_URL: '' }).llm).toEqual(noLlm);
  });
  test('passes the LLM variables through', () => {
    expect(
      loadEnvironment({
        ...complete,
        LLM_MODEL: 'vendor/model',
        OPENROUTER_API_KEY: 'key',
        OPENROUTER_BASE_URL: 'http://localhost:9000/v1',
      }).llm,
    ).toEqual({ ...noLlm, model: 'vendor/model', apiKey: 'key', baseUrl: 'http://localhost:9000/v1' });
  });
  test('rejects an invalid OPENROUTER_BASE_URL', () => {
    expect(() => loadEnvironment({ ...complete, OPENROUTER_BASE_URL: 'not-a-url' })).toThrow();
  });
  test('reads the LLM limits when they are set', () => {
    const { llm } = loadEnvironment({ ...complete, LLM_MAX_CONCURRENT_JOBS: '5', LLM_MAX_CALLS_PER_HOUR: '500' });
    expect([llm.maxConcurrentJobs, llm.maxCallsPerHour]).toEqual([5, 500]);
  });
  test('treats empty LLM limits as unset', () => {
    const { llm } = loadEnvironment({ ...complete, LLM_MAX_CONCURRENT_JOBS: '', LLM_MAX_CALLS_PER_HOUR: '' });
    expect([llm.maxConcurrentJobs, llm.maxCallsPerHour]).toEqual([LLM_MAX_CONCURRENT_JOBS, LLM_MAX_CALLS_PER_HOUR]);
  });
  test.each([
    ['LLM_MAX_CONCURRENT_JOBS', 'abc'],
    ['LLM_MAX_CONCURRENT_JOBS', '0'],
    ['LLM_MAX_CALLS_PER_HOUR', '-3'],
    ['LLM_MAX_CALLS_PER_HOUR', '1.5'],
  ])('fails startup when %s is %s', (name, value) => {
    expect(() => loadEnvironment({ ...complete, [name]: value })).toThrow(new InvalidEnvironmentIntegerError({ name, value }));
  });
  test('reads the open budget when it is set', () => {
    expect(loadEnvironment({ ...complete, OPEN_UNCOMMITTED_PER_MINUTE: '5000' }).openUncommittedPerMinute).toBe(5000);
  });
  test('treats an empty open budget as unset', () => {
    expect(loadEnvironment({ ...complete, OPEN_UNCOMMITTED_PER_MINUTE: '' }).openUncommittedPerMinute).toBe(OPEN_UNCOMMITTED_PER_MINUTE);
  });
  test.each(['abc', '0', '-3', '1.5'])('fails startup when OPEN_UNCOMMITTED_PER_MINUTE is %s', (value) => {
    const name = 'OPEN_UNCOMMITTED_PER_MINUTE';
    expect(() => loadEnvironment({ ...complete, [name]: value })).toThrow(new InvalidEnvironmentIntegerError({ name, value }));
  });
  test('reads the upload budget when it is set', () => {
    expect(loadEnvironment({ ...complete, UPLOADS_PER_MINUTE: '5000' }).uploadsPerMinute).toBe(5000);
  });
  test('treats an empty upload budget as unset', () => {
    expect(loadEnvironment({ ...complete, UPLOADS_PER_MINUTE: '' }).uploadsPerMinute).toBe(UPLOADS_PER_MINUTE);
  });
  test.each(['abc', '0', '-3', '1.5'])('fails startup when UPLOADS_PER_MINUTE is %s', (value) => {
    const name = 'UPLOADS_PER_MINUTE';
    expect(() => loadEnvironment({ ...complete, [name]: value })).toThrow(new InvalidEnvironmentIntegerError({ name, value }));
  });
  test('reads the projection worker heap when it is set', () => {
    expect(loadEnvironment({ ...complete, PROJECTION_WORKER_HEAP_MEGABYTES: '256' }).projectionWorkerHeapMegabytes).toBe(256);
  });
  test('reads the bootstrap host heap when it is set', () => {
    expect(loadEnvironment({ ...complete, BOOTSTRAP_HOST_HEAP_MEGABYTES: '128' }).bootstrapHostHeapMegabytes).toBe(128);
  });
  test('reads the memory limit of the container when it is set', () => {
    expect(loadEnvironment({ ...complete, MEMORY_LIMIT_MEGABYTES: '4096' }).memoryLimitMegabytes).toBe(4096);
  });
  test.each([undefined, ''])('treats the memory limit as unknown when it is %j', (value) => {
    expect(loadEnvironment({ ...complete, MEMORY_LIMIT_MEGABYTES: value }).memoryLimitMegabytes).toBeNull();
  });
  test.each(['abc', '0', '-3', '1.5'])('fails startup when MEMORY_LIMIT_MEGABYTES is %s', (value) => {
    const name = 'MEMORY_LIMIT_MEGABYTES';
    expect(() => loadEnvironment({ ...complete, [name]: value })).toThrow(new InvalidEnvironmentIntegerError({ name, value }));
  });
  test.each([undefined, ''])('leaves the bootstrap host heap to Node when it is %j', (value) => {
    expect(loadEnvironment({ ...complete, BOOTSTRAP_HOST_HEAP_MEGABYTES: value }).bootstrapHostHeapMegabytes).toBeNull();
  });
  test.each([undefined, ''])('leaves the projection worker heap to Node when it is %j', (value) => {
    expect(loadEnvironment({ ...complete, PROJECTION_WORKER_HEAP_MEGABYTES: value }).projectionWorkerHeapMegabytes).toBeNull();
  });
  test.each(['abc', '0', '-3', '1.5'])('fails startup when PROJECTION_WORKER_HEAP_MEGABYTES is %s', (value) => {
    const name = 'PROJECTION_WORKER_HEAP_MEGABYTES';
    expect(() => loadEnvironment({ ...complete, [name]: value })).toThrow(new InvalidEnvironmentIntegerError({ name, value }));
  });
});
