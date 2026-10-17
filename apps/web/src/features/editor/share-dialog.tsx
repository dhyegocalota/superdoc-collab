import { LINK_COPIED_MESSAGE, SECOND_MS, ShareLinkRole, type ShareLinks } from '@superdoc-history/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fetchShareLinks, rotateShareLink, shareLinksQueryKey } from './editor-api';
import {
  COPY_LABEL,
  RESET_FAILED_MESSAGE,
  RESET_LINK_LABEL,
  SHARE_DIALOG_DESCRIPTION,
  SHARE_DIALOG_TITLE,
  SHARE_LABEL,
  SHARE_LINK_LABELS,
} from './editor-copy';

const SHARE_ROLES = Object.values(ShareLinkRole);

export const COPIED_NOTICE_MS = 3 * SECOND_MS;

type ShareLinkRowProps = { documentId: string; role: ShareLinkRole; url: string };

function ShareLinkRow({ documentId, role, url }: ShareLinkRowProps) {
  const queryClient = useQueryClient();
  const [isCopied, setIsCopied] = useState(false);
  const label = SHARE_LINK_LABELS[role];
  const {
    mutate: rotate,
    isPending,
    isError,
  } = useMutation({
    mutationFn: () => rotateShareLink({ documentId, role }),
    onSuccess: (links: ShareLinks) => {
      setIsCopied(false);
      queryClient.setQueryData(shareLinksQueryKey(documentId), links);
    },
  });

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(url);
    setIsCopied(true);
  }

  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label={`${label} address`} />
        <Button variant="outline" onClick={copy}>
          {COPY_LABEL}
        </Button>
        <Button variant="outline" disabled={isPending} onClick={() => rotate()}>
          {RESET_LINK_LABEL}
        </Button>
      </div>
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {RESET_FAILED_MESSAGE}
        </p>
      )}
      {isCopied && (
        <p role="status" className="text-sm text-muted-foreground">
          {LINK_COPIED_MESSAGE}
        </p>
      )}
    </div>
  );
}

export function ShareDialog({ documentId }: { documentId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data } = useQuery({ queryKey: shareLinksQueryKey(documentId), queryFn: () => fetchShareLinks(documentId), enabled: isOpen });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={SHARE_LABEL}>
          <Share2 />
          <span className="hidden sm:inline">{SHARE_LABEL}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{SHARE_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{SHARE_DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {data && SHARE_ROLES.map((role) => <ShareLinkRow key={role} documentId={documentId} role={role} url={data[role]} />)}
      </DialogContent>
    </Dialog>
  );
}
