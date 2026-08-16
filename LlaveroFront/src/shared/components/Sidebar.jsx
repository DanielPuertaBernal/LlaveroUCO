import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  ChevronDown,
  Bell,
  AlertTriangle,
  BookMarked,
  Settings,
  X,
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
      { to: '/historial', icon: BarChart3, label: 'Entrega de Llaves' },
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
      { to: '/notificaciones', icon: Bell, label: 'Notificaciones' },
      { to: '/novedades', icon: AlertTriangle, label: 'Novedades' },
    ],
  },
  {
    label: 'Administración',
    links: [
      { to: '/usuarios', icon: Users, label: 'Usuarios del Sistema' },
      { to: '/porteros', icon: ShieldCheck, label: 'Porteros' },
      { to: '/comunidad', icon: UsersRound, label: 'Comunidad' },
      { to: '/monitores', icon: GraduationCap, label: 'Registro de Monitores' },
      { to: '/salones', icon: School, label: 'Salones' },
      { to: '/configuracion', icon: Settings, label: 'Configuración' },
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
      { to: '/historial', icon: BarChart3, label: 'Entrega de Llaves' },
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
      { to: '/notificaciones', icon: Bell, label: 'Notificaciones' },
      { to: '/novedades', icon: AlertTriangle, label: 'Novedades' },
      { to: '/monitores', icon: GraduationCap, label: 'Registro de Monitores' },
    ],
  },
];

const porteriaGroups = [
  {
    label: 'Operaciones',
    links: [
      { to: '/programacion', icon: CalendarDays, label: 'Programación' },
      { to: '/historial', icon: BarChart3, label: 'Entrega de Llaves' },
    ],
  },
  {
    label: 'Equipos',
    links: [{ to: '/prestamos', icon: Package, label: 'Recepción de Equipos' }],
  },
  {
    label: 'Reportes',
    links: [{ to: '/novedades', icon: AlertTriangle, label: 'Novedades' }],
  },
];

export default function Sidebar({ usuario, collapsed, onToggle, onLogout, mobileOpen, onCloseMobile }) {
  const groups =
    usuario?.rol === ROLES.ADMIN
      ? adminGroups
      : usuario?.rol === ROLES.PORTERIA
        ? porteriaGroups
        : auxGroups;
  const [openGroups, setOpenGroups] = useState({});
  const [collapsedPopover, setCollapsedPopover] = useState(null); // { label, top, left } | null

  function toggleGroup(label) {
    setOpenGroups((prev) => ({ ...prev, [label]: prev[label] !== true }));
  }

  function toggleCollapsedGroup(label, e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setCollapsedPopover((prev) => (prev?.label === label ? null : { label, top: rect.top, left: rect.right + 8 }));
  }

  useEffect(() => {
    if (!collapsedPopover) return;
    function handleClick() {
      setCollapsedPopover(null);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [collapsedPopover]);

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 ease-in-out',
        'fixed inset-y-0 left-0 z-50 w-60',
        'md:static md:z-auto',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        collapsed ? 'md:w-[68px]' : 'md:w-60'
      )}
    >
      {/* Header */}
      <div className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-[0_2px_6px_rgba(209,213,219,0.7)]">
            <img
              src="/logo-uco-icon.svg"
              alt="Universidad Católica de Oriente"
              className="h-full w-full object-contain"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-sidebar-accent-foreground text-sm leading-tight truncate">
                Llavero
              </h1>
              <p className="text-xs text-sidebar-foreground/70 truncate mt-0.5">
                {usuario?.nombre}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden shrink-0 p-1 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent/30 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!collapsed && (
          <span className="text-[11px] bg-sidebar-accent text-sidebar-accent-foreground px-2 py-0.5 rounded-full mt-2 inline-block">
            {usuario?.rol === ROLES.ADMIN
              ? 'Administrador'
              : usuario?.rol === ROLES.PORTERIA
                ? 'Portería'
                : 'Auxiliar'}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
        {groups.map((group, index) => {
          const isOpen = openGroups[group.label] === true;
          const isCollapsedGroupOpen = collapsedPopover?.label === group.label;
          const GroupIcon = group.links[0].icon;

          if (collapsed) {
            return (
              <div key={group.label}>
                {index > 0 && <div className="mx-2 my-3 border-t border-sidebar-border" />}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapsedGroup(group.label, e);
                  }}
                  title={group.label}
                  className={cn(
                    'flex items-center justify-center w-full px-2 py-2 rounded-lg transition-colors',
                    isCollapsedGroupOpen
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                  )}
                >
                  <GroupIcon className="h-[18px] w-[18px] shrink-0" />
                </button>
                {isCollapsedGroupOpen &&
                  createPortal(
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ position: 'fixed', top: collapsedPopover.top, left: collapsedPopover.left }}
                      className="z-50 min-w-[200px] rounded-lg border border-sidebar-border bg-sidebar shadow-xl py-2"
                    >
                      <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 px-3 pb-1 select-none">
                        {group.label}
                      </p>
                      {group.links.map(({ to, icon: Icon, label }) => (
                        <NavLink
                          key={to}
                          to={to}
                          onClick={() => setCollapsedPopover(null)}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                            )
                          }
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          <span className="truncate">{label}</span>
                        </NavLink>
                      ))}
                    </div>,
                    document.body
                  )}
              </div>
            );
          }

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-3 pt-3 pb-1 select-none text-[10px] uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={cn('h-3 w-3 transition-transform', !isOpen && '-rotate-90')}
                />
              </button>
              {isOpen &&
                group.links.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onCloseMobile}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                ))}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-sidebar-border space-y-1">
        <NavLink
          to="/perfil"
          onClick={onCloseMobile}
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

        {/* Collapse toggle (solo desktop — en móvil el sidebar es un drawer, no colapsa) */}
        <button
          onClick={onToggle}
          className="hidden md:flex items-center justify-center w-full mt-2 py-1.5 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent/30 transition-colors"
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
