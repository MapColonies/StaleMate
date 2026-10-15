import { CircleCheck, CircleDashed, CircleMinus, CircleX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CheckStatus } from '@/snapshot/types';
import { CHECK_STATUS_LABELS } from './labels';

const STYLES: Record<CheckStatus, { className: string; Icon: typeof CircleCheck }> = {
  passing: { className: 'text-emerald-600 dark:text-emerald-400', Icon: CircleCheck },
  failing: { className: 'text-red-600 dark:text-red-400', Icon: CircleX },
  pending: { className: 'text-amber-600 dark:text-amber-400', Icon: CircleDashed },
  none: { className: 'text-muted-foreground', Icon: CircleMinus },
};

export function CheckStatusBadge({ status }: { status: CheckStatus }) {
  const { className, Icon } = STYLES[status];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap', className)}>
      <Icon className="size-3.5" />
      {CHECK_STATUS_LABELS[status]}
    </span>
  );
}
