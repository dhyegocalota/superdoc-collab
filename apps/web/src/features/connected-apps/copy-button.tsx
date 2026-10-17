import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { COPIED_LABEL, COPY_LABEL, copyLabel } from './connected-apps-copy';

export function CopyButton({ subject, text }: { subject: string; text: string }) {
  const [isCopied, setIsCopied] = useState(false);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
  }

  return (
    <Button variant="outline" size="sm" aria-label={copyLabel(subject)} onClick={copy}>
      {isCopied ? <Check /> : <Copy />}
      {isCopied ? COPIED_LABEL : COPY_LABEL}
    </Button>
  );
}
