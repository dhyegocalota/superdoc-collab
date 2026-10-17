import type { SuperDocExceptionPayload } from 'superdoc';

export enum SuperDocExceptionCode {
  EditRejected = 'edit-rejected',
}

export function isRecoverableException(payload: SuperDocExceptionPayload): boolean {
  const code = 'code' in payload ? payload.code : null;
  return code === SuperDocExceptionCode.EditRejected;
}
