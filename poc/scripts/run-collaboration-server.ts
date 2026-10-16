import { startCollaborationServer } from '../server/collaboration-server';

const [port, databasePath] = process.argv.slice(2);
if (!port || !databasePath) throw new Error('Usage: run-collaboration-server <port> <databasePath>');
await startCollaborationServer({ port: Number(port), databasePath });
console.log('READY');
