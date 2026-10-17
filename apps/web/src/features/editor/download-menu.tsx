import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SuperDoc } from 'superdoc';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DownloadFormat } from './download-format';
import { DOWNLOAD_BUTTON_LABEL, DOWNLOAD_FORMAT_LABELS, DOWNLOAD_OPTIONS_LABEL } from './editor-copy';

export const LOADING_DOCUMENT_REASON_ID = 'loading-document-reason';

export function DownloadMenu({ isDisabled, onDownload }: { isDisabled: boolean; onDownload: (format: DownloadFormat) => void }) {
  const reasonId = isDisabled ? LOADING_DOCUMENT_REASON_ID : undefined;

  return (
    <div className="hidden items-center sm:flex">
      <Button
        variant="outline"
        className="rounded-r-none"
        disabled={isDisabled}
        aria-describedby={reasonId}
        onClick={() => onDownload(DownloadFormat.Docx)}
      >
        {DOWNLOAD_BUTTON_LABEL}
      </Button>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="-ml-px rounded-l-none"
                disabled={isDisabled}
                aria-label={DOWNLOAD_OPTIONS_LABEL}
                aria-describedby={reasonId}
              >
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{DOWNLOAD_OPTIONS_LABEL}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {Object.values(DownloadFormat).map((format) => (
            <DropdownMenuItem key={format} onSelect={() => onDownload(format)}>
              {DOWNLOAD_FORMAT_LABELS[format]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function useDownload(_options: { superdoc: SuperDoc | null; onDownloadDocx: () => void }): {
  download: (format: DownloadFormat) => void;
  printView: ReactNode;
} {
  throw new Error('useDownload is not implemented');
}
