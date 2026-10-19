import type { SuperDoc } from 'superdoc';
import type { DownloadFormat } from '@/features/editor/download-format';

export type UseShortcutsOptions = {
  superdoc: SuperDoc | null;
  canEdit: boolean;
  onDownload: (format: DownloadFormat) => void;
  onShowShortcuts: () => void;
};

export function useShortcuts(options: UseShortcutsOptions): void {
  throw new Error(`useShortcuts is not implemented for ${options.canEdit}`);
}
