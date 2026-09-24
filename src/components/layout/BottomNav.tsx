import React from 'react';
import { Compass, Bookmarks, DownloadSimple, Gear, Bell } from '@phosphor-icons/react';

interface BottomNavProps {
  activeTab: 'browse' | 'library' | 'downloads' | 'notifications' | 'settings';
  setActiveTab: (tab: 'browse' | 'library' | 'downloads' | 'notifications' | 'settings') => void;
  activeDownloadsCount: number;
  unreadNotificationsCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  activeDownloadsCount,
  unreadNotificationsCount
}) => {
  const tabs = [
    {
      id: 'browse' as const,
      label: 'Explorar',
      icon: Compass
    },
    {
      id: 'library' as const,
      label: 'Biblioteca',
      icon: Bookmarks
    },
    {
      id: 'downloads' as const,
      label: 'Downloads',
      icon: DownloadSimple,
      badge: activeDownloadsCount > 0 ? activeDownloadsCount : null,
      badgeColor: 'bg-primary text-black'
    },
    {
      id: 'notifications' as const,
      label: 'Avisos',
      icon: Bell,
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : null,
      badgeColor: 'bg-accent-rose text-white'
    },
    {
      id: 'settings' as const,
      label: 'Ajustes',
      icon: Gear
    }
  ];

  return (
    <nav className="w-full shrink-0 md:hidden bg-[#171218]/95 backdrop-blur-xl border-t border-white/[0.08] z-30 flex items-center justify-around px-1 sm:px-2 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] select-none">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 active:scale-95 ${
              isActive ? 'text-primary' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon
                weight={isActive ? 'fill' : 'regular'}
                className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(181,217,76,0.5)]' : ''}`}
              />
              {tab.badge !== null && tab.badge !== undefined && (
                <span
                  className={`absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none ${tab.badgeColor}`}
                >
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </div>
            <span className={`text-[10px] mt-1 font-medium tracking-tight ${isActive ? 'font-bold text-white' : 'text-slate-400'}`}>
              {tab.label}
            </span>
            {isActive && (
              <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary shadow-[0_0_6px_#b5d94c]" />
            )}
          </button>
        );
      })}
    </nav>
  );
};
