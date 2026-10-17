import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

type DocumentApi = NonNullable<NonNullable<SuperDoc['activeEditor']>['doc']>;

type PocWindow = Window & {
  poc: {
    ready: boolean;
    connectionStates: string[];
    errors: string[];
    getText: () => Promise<string>;
    documentApi: () => DocumentApi;
  };
};

const status = document.querySelector<HTMLSpanElement>('#status');
if (!status) throw new Error('The status element is missing.');

const params = new URLSearchParams(window.location.search);
const userId = params.get('user');
const serverUrl = params.get('server');
const documentId = params.get('document');
if (!userId || !serverUrl || !documentId) throw new Error('user, server and document params are required.');
const roomMode = params.get('mode') === 'create' ? 'create' : 'join';

const response = await fetch('/seed.docx');
if (!response.ok) throw new Error(`The seed document returned ${response.status}.`);

const pocWindow = window as unknown as PocWindow;
const email = `${userId}@example.com`;

const superdoc = new SuperDoc({
  selector: '#editor',
  documents: [
    {
      id: 'shared-document',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: await response.blob(),
      v2Collaboration: {
        providerType: 'hocuspocus',
        documentId,
        serverUrl,
        roomMode,
        token: email,
      },
    },
  ],
  user: { name: userId, email },
  onCollaborationReady: () => {
    pocWindow.poc.ready = true;
    status.textContent = 'Connected.';
  },
  onCollaborationConnectionChange: ({ state }) => {
    pocWindow.poc.connectionStates.push(state);
  },
  onException: (payload) => {
    if ('diagnosticCode' in payload) return;
    pocWindow.poc.errors.push(String(payload.error));
    status.textContent = 'Connection failed.';
  },
});

pocWindow.poc = {
  ready: false,
  connectionStates: [],
  errors: [],
  getText: async () => pocWindow.poc.documentApi().getText({}),
  documentApi: () => {
    const documentApi = superdoc.activeEditor?.doc;
    if (!documentApi) throw new Error('The active document is unavailable.');
    return documentApi;
  },
};
