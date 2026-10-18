import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { queryClient } from '@/lib/query-client';
import { useTheme } from '@/lib/use-theme';

export function Providers({ children }: { children: ReactNode }) {
  useTheme();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
