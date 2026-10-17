export enum SuperDocExceptionCode {
  EditRejected = 'edit-rejected',
}

export function isRecoverableException(_payload: { code?: string; error: Error }): boolean {
  throw new Error('isRecoverableException is not implemented');
}
