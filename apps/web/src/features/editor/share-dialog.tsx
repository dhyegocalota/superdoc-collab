import { LINK_COPIED_MESSAGE, SECOND_MS, ShareLinkRole, type ShareLinks } from '@superdoc-history/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchShareLinks, rotateShareLink, shareLinksQueryKey } from './editor-api';
import {
  COPY_FAILED_MESSAGE,
  COPY_LABEL,
  LOADING_SHARE_LINKS_LABEL,
  RESET_FAILED_MESSAGE,
  RESET_LINK_LABEL,
  SHARE_DIALOG_DESCRIPTION,
  SHARE_DIALOG_TITLE,
  SHARE_LABEL,
  SHARE_LINK_LABELS,
} from './editor-copy';

const SHARE_ROLES = Object.values(ShareLinkRole);

export const COPIED_NOTICE_MS = 3 * SECOND_MS;

enum CopyState {
  Idle = 'idle',
  Copied = 'copied',
  Failed = 'failed',
}

type ShareLinkRowProps = { documentId: string; role: ShareLinkRole; url: string };

function ShareLinkRow({ documentId, role, url }: ShareLinkRowProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState(CopyState.Idle);
  const label = SHARE_LINK_LABELS[role];
  const {
    mutate: reset,
    isPending,
    isError,
  } = useMutation({
    mutationFn: () => rotateShareLink({ documentId, role }),
    onSuccess: (links: ShareLinks) => {
      setCopyState(CopyState.Idle);
      queryClient.setQueryData(shareLinksQueryKey(documentId), links);
    },
  });

  useEffect(() => {
    if (copyState !== CopyState.Copied) return;
    const timer = window.setTimeout(() => setCopyState(CopyState.Idle), COPIED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState(CopyState.Copied);
    } catch {
      inputRef.current?.select();
      setCopyState(CopyState.Failed);
    }
  }

  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <Input ref={inputRef} readOnly value={url} aria-label={`${label} address`} />
        <Button variant="outline" onClick={copy}>
          {COPY_LABEL}
        </Button>
        <Button variant="outline" disabled={isPending} aria-busy={isPending} onClick={() => reset()}>
          {RESET_LINK_LABEL}
        </Button>
      </div>
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {RESET_FAILED_MESSAGE}
        </p>
      )}
      {copyState === CopyState.Copied && (
        <p role="status" className="text-sm text-muted-foreground">
          {LINK_COPIED_MESSAGE}
        </p>
      )}
      {copyState === CopyState.Failed && (
        <p role="status" className="text-sm text-muted-foreground">
          {COPY_FAILED_MESSAGE}
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
        {!data && (
          <div role="status" aria-label={LOADING_SHARE_LINKS_LABEL} className="space-y-4">
            {SHARE_ROLES.map((role) => (
              <Skeleton key={role} className="h-16 w-full" />
            ))}
          </div>
        )}
        {data && SHARE_ROLES.map((role) => <ShareLinkRow key={role} documentId={documentId} role={role} url={data[role]} />)}
      </DialogContent>
    </Dialog>
  );
}
