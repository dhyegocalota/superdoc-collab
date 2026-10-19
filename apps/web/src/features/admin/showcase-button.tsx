import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { createShowcase } from './admin-api';
import { ACTION_FAILED_MESSAGE, SHOWCASE_BUTTON_LABEL, SHOWCASE_CREATED_TOAST, SHOWCASE_DESCRIPTION } from './admin-copy';

export function ShowcaseButton() {
  const queryClient = useQueryClient();
  const descriptionId = useId();
  const { mutate, isPending, isError } = useMutation({
    mutationFn: createShowcase,
    onSuccess: async () => {
      toast(SHOWCASE_CREATED_TOAST);
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" disabled={isPending} aria-describedby={descriptionId} onClick={() => mutate()}>
        {SHOWCASE_BUTTON_LABEL}
      </Button>
      <p id={descriptionId} className="text-xs text-muted-foreground">
        {SHOWCASE_DESCRIPTION}
      </p>
      {isError && <ErrorMessage>{ACTION_FAILED_MESSAGE}</ErrorMessage>}
    </div>
  );
}
