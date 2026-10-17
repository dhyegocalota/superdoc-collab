import { startCollaborationServer } from './collaboration-server';
import { readMainStoryText } from './document-content';

const port = Number(process.argv[2]);
if (!port) throw new Error('Usage: run-stack <port>');
const collaboration = await startCollaborationServer(port);
console.log(`COLLABORATION READY ws://127.0.0.1:${port}`);
setInterval(() => {
  [...collaboration.server.documents.values()].forEach((document) => console.log(`[room ${document.name}] updates=${collaboration.updates.length} text=${JSON.stringify(readMainStoryText(document).slice(0, 160))}`));
}, 5000);
