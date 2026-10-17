import { Button } from '@/components/ui/button';
import { NEW_DOCUMENT_LABEL } from './documents-copy';

export function NewDocumentButton({ isPending, onCreate }: { isPending: boolean; onCreate: () => void }) {
  return (
    <Button disabled={isPending} onClick={onCreate}>
      {NEW_DOCUMENT_LABEL}
    </Button>
  );
}
