import { Sun, Moon, Menu } from 'lucide-react';
import { useTheme } from '@/shared/components/ThemeProvider';
import { cn } from '@/shared/lib/utils';

export default function TopBar({ onOpenMenu }) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 sm:px-6 border-b border-border bg-card">
      <button
        onClick={onOpenMenu}
        className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Abrir menú"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

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
