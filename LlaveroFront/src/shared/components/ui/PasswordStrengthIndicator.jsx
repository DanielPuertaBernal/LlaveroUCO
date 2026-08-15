import { useMemo } from 'react';
import { cn } from '@/shared/lib/utils';
import { Check, X } from 'lucide-react';

const PASSWORD_RULES = [
  { label: 'Mínimo 8 caracteres', test: (v) => v.length >= 8 },
  { label: 'Una letra mayúscula', test: (v) => /[A-Z]/.test(v) },
  { label: 'Una letra minúscula', test: (v) => /[a-z]/.test(v) },
  { label: 'Un número', test: (v) => /[0-9]/.test(v) },
  { label: 'Un carácter especial', test: (v) => /[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\/~`]/.test(v) },
];

export function passwordRules() {
  return PASSWORD_RULES;
}

export default function PasswordStrengthIndicator({ password = '', confirmPassword }) {
  const results = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(password) })),
    [password],
  );

  const passedCount = results.filter((r) => r.passed).length;
  const pending = results.filter((r) => !r.passed);
  const passwordsMatch = confirmPassword !== undefined && confirmPassword.length > 0 && password === confirmPassword;

  if (!password) return null;

  return (
    <div className="space-y-1.5 mt-1.5">
      <div className="flex gap-1">
        {results.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < passedCount
                ? passedCount <= 2
                  ? 'bg-destructive'
                  : passedCount <= 4
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                : 'bg-muted',
            )}
          />
        ))}
      </div>

      {pending.length > 0 && (
        <ul className="space-y-0.5">
          {pending.map((r) => (
            <li key={r.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <X className="h-3 w-3 shrink-0" />
              {r.label}
            </li>
          ))}
        </ul>
      )}

      {confirmPassword !== undefined && confirmPassword.length > 0 && (
        <p className={cn(
          'flex items-center gap-1.5 text-xs font-medium',
          passwordsMatch ? 'text-green-600 dark:text-green-400' : 'text-destructive',
        )}>
          {passwordsMatch
            ? <><Check className="h-3.5 w-3.5" /> Las contraseñas coinciden</>
            : <><X className="h-3.5 w-3.5" /> Las contraseñas no coinciden</>
          }
        </p>
      )}
    </div>
  );
}
