import { AppRoute } from '@superdoc-collab/types';
import { Bot } from 'lucide-react';
import type { RefObject } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  CLOSE_LABEL,
  MANAGE_CONNECTED_APPS_LABEL,
  USE_WITH_AI_DESCRIPTION,
  USE_WITH_AI_LABEL,
  USE_WITH_AI_TITLE,
} from './connected-apps-copy';
import { UseWithAiContent } from './use-with-ai-content';

const DIALOG_CLASS_NAME = 'max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[560px]';

export type UseWithAiSlot = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function UseWithAiDialog({
  title,
  canEdit,
  isOpen,
  onOpenChange,
  returnFocusRef,
}: UseWithAiSlot & { title: string | null; canEdit: boolean }) {
  const isControlled = isOpen !== undefined;

  function returnFocus(event: Event): void {
    if (!returnFocusRef) return;
    event.preventDefault();
    returnFocusRef.current?.focus();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <Bot aria-hidden />
            {USE_WITH_AI_LABEL}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className={DIALOG_CLASS_NAME} onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{USE_WITH_AI_TITLE}</DialogTitle>
          <DialogDescription>{USE_WITH_AI_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <UseWithAiContent title={title} canEdit={canEdit} />
        <DialogFooter>
          <Button asChild variant="outline">
            <Link to={AppRoute.ConnectedApps}>{MANAGE_CONNECTED_APPS_LABEL}</Link>
          </Button>
          <DialogClose asChild>
            <Button variant="outline">{CLOSE_LABEL}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
