import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/shared/components/ThemeProvider';
import { cn } from '@/shared/lib/utils';

export default function TopBar() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="h-14 shrink-0 flex items-center justify-end px-6 border-b border-border bg-card">
      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={cn(
            'inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        >
          {theme === 'dark' ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>
    </header>
  );
}
