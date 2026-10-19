import { InvitesRepository } from './admin/invites';
import { PasswordResetLinkCapture } from './admin/password-reset-links';
import { MissingDemoPasswordError, seedDemoUsers } from './auth/seed-demo-users';
import { createAuth } from './auth/auth';
import { loadEnvironment } from './config/environment';
import { AUTH_DATABASE_FILE, openDatabase } from './database/connection';
import { runMigrations } from './database/migrate';

const DEMO_PASSWORD_ENVIRONMENT_VARIABLE = 'DEMO_PASSWORD';
const FAILURE_EXIT_CODE = 1;

function readDemoPassword(source: NodeJS.ProcessEnv): string {
  const password = source[DEMO_PASSWORD_ENVIRONMENT_VARIABLE];
  if (!password) throw new MissingDemoPasswordError();
  return password;
}

async function seed(): Promise<void> {
  const environment = loadEnvironment(process.env);
  const password = readDemoPassword(process.env);
  const database = openDatabase({ directory: environment.databaseDirectory, fileName: AUTH_DATABASE_FILE });
  try {
    runMigrations(database);
    const invites = new InvitesRepository({ database, appOrigin: environment.appOrigin, now: Date.now });
    const auth = createAuth({
      database,
      environment,
      invites,
      passwordResetLinks: new PasswordResetLinkCapture(),
      closeConnectionsOfUser: () => undefined,
    });
    const result = await seedDemoUsers({ auth, database, invites, password });
    console.log(`created: ${result.created.join(', ')}`);
    console.log(`existing: ${result.existing.join(', ')}`);
  } finally {
    database.sqlite.close();
  }
}

seed().then(
  () => process.exit(0),
  (error: Error) => {
    console.error(error.message);
    process.exit(FAILURE_EXIT_CODE);
  },
);
