import { vi } from 'vitest';

type ProgressEventLike = { lengthComputable: boolean; loaded: number; total: number };

const ORIGINAL_REQUEST = globalThis.XMLHttpRequest;

export class FakeUploadRequest {
  static requests: FakeUploadRequest[] = [];

  method = '';
  path = '';
  body: unknown = null;
  status = 0;
  responseText = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  upload: { onprogress: ((event: ProgressEventLike) => void) | null } = { onprogress: null };

  open(method: string, path: string): void {
    this.method = method;
    this.path = path;
  }

  send(body: unknown): void {
    this.body = body;
    FakeUploadRequest.requests.push(this);
  }

  reportProgress(event: ProgressEventLike): void {
    this.upload.onprogress?.(event);
  }

  respond({ status, body }: { status: number; body: unknown }): void {
    this.status = status;
    this.responseText = body === null ? '' : JSON.stringify(body);
    this.onload?.();
  }

  failToConnect(): void {
    this.onerror?.();
  }
}

export function stubUploadRequests(): void {
  FakeUploadRequest.requests = [];
  vi.stubGlobal('XMLHttpRequest', FakeUploadRequest);
}

export function restoreUploadRequests(): void {
  vi.stubGlobal('XMLHttpRequest', ORIGINAL_REQUEST);
}

export function latestUploadRequest(): FakeUploadRequest {
  const latest = FakeUploadRequest.requests.at(-1);
  if (!latest) throw new Error('no upload request was sent');
  return latest;
}
