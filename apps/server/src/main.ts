import { loadEnvironment } from './config/environment';
import { startServer } from './server';

export const WEB_DIST_ENVIRONMENT_VARIABLE = 'WEB_DIST_DIR';

function readOptionalWebDistDirectory(source: NodeJS.ProcessEnv): string | null {
  const webDistDirectory = source[WEB_DIST_ENVIRONMENT_VARIABLE];
  if (webDistDirectory) return webDistDirectory;
  return null;
}

const running = await startServer({
  environment: loadEnvironment(process.env),
  webDistDirectory: readOptionalWebDistDirectory(process.env),
});
console.log(`listening on :${running.port}`);
process.on('SIGTERM', () => {
  void running.stop().then(() => process.exit(0));
});
