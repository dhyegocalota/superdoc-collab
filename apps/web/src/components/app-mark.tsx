import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppMark({ className }: { className?: string }) {
  return (
    <span className={cn('flex size-6 items-center justify-center rounded-sm bg-primary text-primary-foreground', className)}>
      <FileText aria-hidden className="size-3/5" />
    </span>
  );
}
