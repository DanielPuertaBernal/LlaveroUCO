import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  GraduationCap,
  School,
  Users,
  UsersRound,
  Monitor,
  BarChart3,
  Key,
  Package,
  ShieldCheck,
  UserCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  AlertTriangle,
  BookMarked,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ROLES } from '@/shared/constants';

const adminGroups = [
  {
    label: 'Operaciones',
    links: [
      { to: '/programacion', icon: CalendarDays, label: 'Programación' },
      { to: '/gestion-salones', icon: Key, label: 'Reservas Individuales' },
      { to: '/reservas-semestrales', icon: BookMarked, label: 'Reservas Semestrales' },
    ],
  },
  {
    label: 'Inventario',
    links: [
      { to: '/equipos', icon: Monitor, label: 'Inventario' },
      { to: '/prestamos', icon: Package, label: 'Préstamo de Equipos' },
    ],
  },
  {
    label: 'Reportes',
    links: [
      { to: '/historial', icon: BarChart3, label: 'Entrega de Llaves' },
      { to: '/notificaciones', icon: Bell, label: 'Notificaciones' },
      { to: '/novedades', icon: AlertTriangle, label: 'Novedades' },
      { to: '/monitores', icon: GraduationCap, label: 'Registro de Monitores' },
    ],
  },
  {
    label: 'Administración',
    links: [
      { to: '/comunidad', icon: UsersRound, label: 'Comunidad' },
      { to: '/salones', icon: School, label: 'Salones' },
      { to: '/porteros', icon: ShieldCheck, label: 'Porteros' },
      { to: '/usuarios', icon: Users, label: 'Usuarios' },
    ],
  },
];

const auxGroups = [
  {
    label: 'Operaciones',
    links: [
      { to: '/programacion', icon: CalendarDays, label: 'Programación' },
      { to: '/gestion-salones', icon: Key, label: 'Reservas Individuales' },
      { to: '/reservas-semestrales', icon: BookMarked, label: 'Reservas Semestrales' },
    ],
  },
  {
    label: 'Inventario',
    links: [
      { to: '/equipos', icon: Monitor, label: 'Inventario' },
      { to: '/prestamos', icon: Package, label: 'Préstamo de Equipos' },
    ],
  },
  {
    label: 'Reportes',
    links: [
      { to: '/historial', icon: BarChart3, label: 'Entrega de Llaves' },
      { to: '/notificaciones', icon: Bell, label: 'Notificaciones' },
      { to: '/novedades', icon: AlertTriangle, label: 'Novedades' },
      { to: '/monitores', icon: GraduationCap, label: 'Registro de Monitores' },
    ],
  },
];

export default function Sidebar({ usuario, collapsed, onToggle, onLogout }) {
  const groups = usuario?.rol === ROLES.ADMIN ? adminGroups : auxGroups;

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-60'
      )}
    >
      {/* Header */}
      <div className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground font-bold text-sm">
            AS
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="font-semibold text-sidebar-accent-foreground text-sm leading-tight truncate">
                Llavero
              </h1>
              <p className="text-xs text-sidebar-foreground/70 truncate mt-0.5">
                {usuario?.nombre}
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <span className="text-[11px] bg-sidebar-accent text-sidebar-accent-foreground px-2 py-0.5 rounded-full mt-2 inline-block">
            {usuario?.rol === ROLES.ADMIN ? 'Administrador' : 'Auxiliar'}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 px-3 pt-3 pb-1 select-none">
                {group.label}
              </p>
            )}
            {collapsed && <div className="my-1 border-t border-sidebar-border/50" />}
            {group.links.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-2',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                  )
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-sidebar-border space-y-1">
        <NavLink
          to="/perfil"
          title={collapsed ? 'Mi Perfil' : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              collapsed && 'justify-center px-2',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
            )
          }
        >
          <UserCircle className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Mi Perfil</span>}
        </NavLink>
        <button
          onClick={onLogout}
          title={collapsed ? 'Cerrar Sesión' : undefined}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Cerrar Sesión</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full mt-2 py-1.5 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent/30 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
