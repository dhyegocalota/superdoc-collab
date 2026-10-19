import type { ReactNode, RefObject } from 'react';
import type { SuperDoc } from 'superdoc';

export type ShortcutsDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  canEdit: boolean;
  superdoc: SuperDoc | null;
  returnFocusRef: RefObject<HTMLElement | null>;
};

export function ShortcutsDialog(props: ShortcutsDialogProps): ReactNode {
  throw new Error(`ShortcutsDialog is not implemented for ${props.isOpen}`);
}
