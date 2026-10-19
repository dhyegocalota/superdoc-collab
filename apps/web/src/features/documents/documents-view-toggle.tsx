import { LayoutGrid, List } from 'lucide-react';
import type { ReactNode } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CARDS_VIEW_LABEL, DOCUMENTS_VIEW_LABEL, TABLE_VIEW_LABEL } from './documents-copy';
import { DocumentsView, isDocumentsView } from './use-documents-view';

const VIEW_LABELS: Record<DocumentsView, string> = {
  [DocumentsView.Cards]: CARDS_VIEW_LABEL,
  [DocumentsView.Table]: TABLE_VIEW_LABEL,
};

const VIEW_ICONS: Record<DocumentsView, ReactNode> = {
  [DocumentsView.Cards]: <LayoutGrid />,
  [DocumentsView.Table]: <List />,
};

type DocumentsViewToggleProps = { view: DocumentsView; onChange: (view: DocumentsView) => void };

export function DocumentsViewToggle({ view, onChange }: DocumentsViewToggleProps) {
  function choose(value: string): void {
    if (!isDocumentsView(value)) return;
    onChange(value);
  }

  return (
    <ToggleGroup type="single" role="radiogroup" aria-label={DOCUMENTS_VIEW_LABEL} value={view} onValueChange={choose}>
      {Object.values(DocumentsView).map((option) => (
        <ToggleGroupItem key={option} value={option} aria-label={VIEW_LABELS[option]}>
          {VIEW_ICONS[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
