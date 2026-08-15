import { forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Wrapper de campo de formulario con label, input y error.
 * Compatible con react-hook-form register() o cualquier prop set.
 */
export function FormField({
  label,
  error,
  children,
  className,
  required,
  htmlFor,
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-foreground"
        >
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

/**
 * Input estilizado para el design system.
 */
export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors',
        'placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});

/**
 * Textarea estilizado para el design system.
 */
export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm shadow-sm transition-colors',
        'placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});

/**
 * Select estilizado para el design system.
 */
export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});

/**
 * Checkbox estilizado con label.
 */
export function Checkbox({ label, className, ...props }) {
  return (
    <label className={cn('flex items-center gap-2 text-sm text-foreground cursor-pointer', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
        {...props}
      />
      {label}
    </label>
  );
}
