import { cn } from '@/shared/lib/utils';
import { cva } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

export default function StatusBadge({ variant, children, className }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      {children}
    </span>
  );
}
