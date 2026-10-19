enum ThumbnailState {
  Preview = 'preview',
  TitleOnly = 'title-only',
}

type DocumentThumbnailProps = { title: string; preview: string | null };

export function DocumentThumbnail({ title, preview }: DocumentThumbnailProps) {
  const state = preview ? ThumbnailState.Preview : ThumbnailState.TitleOnly;

  return (
    <div
      aria-hidden="true"
      data-testid="document-thumbnail"
      data-state={state}
      className="relative aspect-[4/5] overflow-hidden border-b bg-paper px-5 pt-6 text-paper-foreground"
    >
      {preview ? (
        <p className="text-[9px] leading-[13px] break-words whitespace-pre-line">{preview}</p>
      ) : (
        <p className="line-clamp-4 text-sm font-semibold break-words">{title}</p>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-paper" />
    </div>
  );
}
