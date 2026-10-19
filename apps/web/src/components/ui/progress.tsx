import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { PERCENT_MULTIPLIER } from '@superdoc-collab/types';
import { cn } from '@/lib/utils';

function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const percent = typeof value === 'number' ? value : null;
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full bg-primary motion-reduce:animate-none motion-reduce:transition-none',
          percent === null ? 'w-1/3 animate-pulse' : 'w-full flex-1 transition-transform',
        )}
        style={percent === null ? undefined : { transform: `translateX(-${PERCENT_MULTIPLIER - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
