import type { ReactNode } from 'react';
import { BrandLink } from './brand-link';

export function AppTopBar({ left, right }: { left?: ReactNode; right: ReactNode }) {
  return (
    <header className="flex h-13 items-center gap-2 border-b px-3">
      <BrandLink />
      {left}
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}
