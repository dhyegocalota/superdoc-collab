import type { ReactNode } from 'react';

export function RequireAdmin({ children }: { children: ReactNode }): never {
  void children;
  throw new Error('RequireAdmin is not implemented');
}
