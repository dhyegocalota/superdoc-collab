import type { UploadProgress } from '@/lib/api';

export function UploadProgressStatus({ progress }: { progress: UploadProgress | null }): never {
  throw new Error('UploadProgressStatus is not implemented');
}
