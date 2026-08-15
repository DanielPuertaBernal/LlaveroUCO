import { useState } from 'react';
import { Bell, Send, Clock, Settings } from 'lucide-react';
import EnviarTab from './tabs/EnviarTab';
import HistorialTab from './tabs/HistorialTab';
import ConfiguracionTab from './tabs/ConfiguracionTab';
import { useEstadisticasNotificaciones } from './notificacionesApi';

const TABS = [
  { id: 'enviar', label: 'Enviar', icon: Send },
  { id: 'historial', label: 'Historial', icon: Clock },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
];

export default function NotificacionesPage() {
  const [activeTab, setActiveTab] = useState('enviar');
  const { data: stats } = useEstadisticasNotificaciones();
  const pendientes = stats?.pendientes ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6" />
          Notificaciones
        </h1>
        <p className="text-muted-foreground text-sm">Gestión de notificaciones por correo electrónico</p>
      </div>

      <div className="border-b border-border">
        <nav className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {id === 'historial' && pendientes > 0 && (
                <span className="ml-1 text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                  {pendientes}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {activeTab === 'enviar' && <EnviarTab />}
        {activeTab === 'historial' && <HistorialTab />}
        {activeTab === 'configuracion' && <ConfiguracionTab />}
      </div>
    </div>
  );
}
