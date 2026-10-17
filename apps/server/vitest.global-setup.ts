import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'tsup';
import type { TestProject } from 'vitest/node';
import { PROJECTION_WORKER_FILE_VARIABLE } from './src/testing/projection-worker-variable';
import { serverBuildOptions } from './tsup.config';

const PROJECTION_WORKER_ENTRY_NAME = 'projection-worker';
const PROJECTION_WORKER_SOURCE = 'src/history/projection-worker.ts';
const BUNDLE_DIRECTORY = join('node_modules', '.cache', 'superdoc-history-vitest');

async function buildProjectionWorker(): Promise<void> {
  const outDirectory = join(import.meta.dirname, BUNDLE_DIRECTORY);
  await build({
    ...serverBuildOptions,
    entry: { [PROJECTION_WORKER_ENTRY_NAME]: PROJECTION_WORKER_SOURCE },
    outDir: outDirectory,
    clean: true,
    silent: true,
    config: false,
  });
  process.env[PROJECTION_WORKER_FILE_VARIABLE] = pathToFileURL(join(outDirectory, `${PROJECTION_WORKER_ENTRY_NAME}.js`)).href;
}

export default async function setup(project: TestProject): Promise<() => void> {
  await buildProjectionWorker();
  project.onTestsRerun(buildProjectionWorker);
  return () => {
    delete process.env[PROJECTION_WORKER_FILE_VARIABLE];
  };
}
