import { thumbnailApiPath } from '@superdoc-collab/types';
import { useState } from 'react';
import { cn } from '@/lib/utils';

enum ThumbnailState {
  Image = 'image',
  Preview = 'preview',
  TitleOnly = 'title-only',
}

const FRAME_CLASS = 'relative aspect-[4/5] overflow-hidden border-b bg-paper text-paper-foreground';
const TEXT_FRAME_CLASS = 'px-5 pt-6';

type DocumentThumbnailProps = { documentId: string; title: string; preview: string | null; thumbnailUpdatedAt: number | null };

export function DocumentThumbnail({ documentId, title, preview, thumbnailUpdatedAt }: DocumentThumbnailProps) {
  const [failedUpdatedAt, setFailedUpdatedAt] = useState<number | null>(null);

  if (thumbnailUpdatedAt !== null && failedUpdatedAt !== thumbnailUpdatedAt) {
    return (
      <div aria-hidden="true" data-testid="document-thumbnail" data-state={ThumbnailState.Image} className={FRAME_CLASS}>
        <img
          src={thumbnailApiPath({ documentId, updatedAt: thumbnailUpdatedAt })}
          alt={preview ? preview : title}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUpdatedAt(thumbnailUpdatedAt)}
          className="size-full object-cover object-top"
        />
      </div>
    );
  }

  const state = preview ? ThumbnailState.Preview : ThumbnailState.TitleOnly;

  return (
    <div aria-hidden="true" data-testid="document-thumbnail" data-state={state} className={cn(FRAME_CLASS, TEXT_FRAME_CLASS)}>
      {preview ? (
        <p className="text-[9px] leading-[13px] break-words whitespace-pre-line">{preview}</p>
      ) : (
        <p className="line-clamp-4 text-sm font-semibold break-words">{title}</p>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-paper" />
    </div>
  );
}
