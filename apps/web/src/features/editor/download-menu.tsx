import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SuperDoc } from 'superdoc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShortcutHint } from '@/features/shortcuts/shortcut-hint';
import { ShortcutTooltipContent } from '@/features/shortcuts/shortcut-tooltip-content';
import { ShortcutId } from '@/features/shortcuts/shortcuts';
import { DownloadFormat } from './download-format';
import { repairExportedDocx } from './repair-exported-docx';
import { PrintView } from '@/features/versions/print-view';
import {
  DOWNLOAD_BUTTON_LABEL,
  DOWNLOAD_FORMAT_LABELS,
  DOWNLOAD_LABEL,
  DOWNLOAD_OPTIONS_LABEL,
  PDF_FAILED_MESSAGE,
  PDF_PRINT_HINT,
  PREPARING_PDF_MESSAGE,
} from './editor-copy';

export const LOADING_DOCUMENT_REASON_ID = 'loading-document-reason';

export const DOWNLOAD_SHORTCUT_IDS: Record<DownloadFormat, ShortcutId> = {
  [DownloadFormat.Docx]: ShortcutId.DownloadDocx,
  [DownloadFormat.Pdf]: ShortcutId.DownloadPdf,
};

export function DownloadMenu({ isDisabled, onDownload }: { isDisabled: boolean; onDownload: (format: DownloadFormat) => void }) {
  const reasonId = isDisabled ? LOADING_DOCUMENT_REASON_ID : undefined;

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="rounded-r-none"
            disabled={isDisabled}
            aria-describedby={reasonId}
            onClick={() => onDownload(DownloadFormat.Docx)}
          >
            {DOWNLOAD_BUTTON_LABEL}
          </Button>
        </TooltipTrigger>
        <ShortcutTooltipContent label={DOWNLOAD_LABEL} shortcutId={DOWNLOAD_SHORTCUT_IDS[DownloadFormat.Docx]} />
      </Tooltip>
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
              <DropdownMenuShortcut>
                <ShortcutHint shortcutId={DOWNLOAD_SHORTCUT_IDS[format]} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function useDownload({ superdoc, onDownloadDocx }: { superdoc: SuperDoc | null; onDownloadDocx: () => void }): {
  download: (format: DownloadFormat) => void;
  printView: ReactNode;
} {
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const isPreparingPdf = useRef(false);
  const preparingToastId = useRef<string | number | null>(null);

  const dismissPreparingToast = useCallback(() => {
    if (preparingToastId.current === null) return;
    toast.dismiss(preparingToastId.current);
    preparingToastId.current = null;
  }, []);

  useEffect(() => dismissPreparingToast, [dismissPreparingToast]);

  const closePrintView = useCallback(() => {
    isPreparingPdf.current = false;
    dismissPreparingToast();
    setPdfFile(null);
  }, [dismissPreparingToast]);

  const failPdf = useCallback(() => {
    isPreparingPdf.current = false;
    dismissPreparingToast();
    toast.error(PDF_FAILED_MESSAGE);
    setPdfFile(null);
  }, [dismissPreparingToast]);

  function preparePdf(): void {
    if (!superdoc || isPreparingPdf.current) return;
    isPreparingPdf.current = true;
    preparingToastId.current = toast.loading(PREPARING_PDF_MESSAGE, { description: PDF_PRINT_HINT });
    superdoc.export({ triggerDownload: false }).then(repairExportedDocx).then(setPdfFile, failPdf);
  }

  const downloaders: Record<DownloadFormat, () => void> = {
    [DownloadFormat.Docx]: onDownloadDocx,
    [DownloadFormat.Pdf]: preparePdf,
  };

  return {
    download: (format) => downloaders[format](),
    printView: pdfFile && <PrintView file={pdfFile} onClose={closePrintView} onFailed={failPdf} />,
  };
}
