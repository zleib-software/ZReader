import React from 'react';
import { Compass, Bookmarks, DownloadSimple, Gear, ShieldCheck, WifiHigh, WifiSlash, SignIn, User, Bell } from '@phosphor-icons/react';
import { UserProfile } from '../../types/mangadex';

interface SidebarProps {
  activeTab: 'browse' | 'library' | 'downloads' | 'notifications' | 'settings';
  setActiveTab: (tab: 'browse' | 'library' | 'downloads' | 'notifications' | 'settings') => void;
  profile: UserProfile | null;
  mangadexConnected: boolean;
  mangadexUsername: string | null;
  onOpenAuthModal: () => void;
  isOfflineMode: boolean;
  setIsOfflineMode: (offline: boolean) => void;
  activeDownloadsCount: number;
  unreadNotificationsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  profile,
  mangadexConnected,
  mangadexUsername,
  onOpenAuthModal,
  isOfflineMode,
  setIsOfflineMode,
  activeDownloadsCount,
  unreadNotificationsCount = 0
}) => {
  return (
    <aside className="hidden md:flex w-56 bg-background-elevated/90 border-r border-background-border flex-col justify-between select-none shrink-0 h-full overflow-y-auto">
      {/* Navigation */}
      <div className="p-3 space-y-5">
        {/* User Card */}
        <div className="px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-white text-xs shrink-0 overflow-hidden">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User weight="bold" className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 truncate">
                {profile?.name || 'Perfil Local'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${mangadexConnected ? 'bg-primary' : 'bg-slate-500'}`} />
                <span className="text-[10px] text-slate-400 truncate">
                  {mangadexConnected ? (mangadexUsername || 'MangaDex Conectado') : 'Sem MangaDex'}
                </span>
              </div>
            </div>
          </div>

          {!mangadexConnected && (
            <button
              onClick={onOpenAuthModal}
              className="mt-2 w-full py-1 px-2 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-slate-300 hover:text-white text-[10px] font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <SignIn weight="bold" className="w-3 h-3 text-primary" />
              Conectar MangaDex
            </button>
          )}
        </div>

        {/* Primary Menu */}
        <nav className="space-y-1">
          <button
            onClick={() => setActiveTab('browse')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors ${
              activeTab === 'browse'
                ? 'bg-white/[0.07] text-white font-semibold'
                : 'text-slate-400 font-normal hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <Compass weight={activeTab === 'browse' ? 'bold' : 'regular'} className={`w-4 h-4 ${activeTab === 'browse' ? 'text-primary' : 'text-slate-400'}`} />
            <span>Explorar</span>
          </button>

          <button
            onClick={() => setActiveTab('library')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors ${
              activeTab === 'library'
                ? 'bg-white/[0.07] text-white font-semibold'
                : 'text-slate-400 font-normal hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <Bookmarks weight={activeTab === 'library' ? 'bold' : 'regular'} className={`w-4 h-4 ${activeTab === 'library' ? 'text-primary' : 'text-slate-400'}`} />
            <span>Biblioteca</span>
          </button>

          <button
            onClick={() => setActiveTab('downloads')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors ${
              activeTab === 'downloads'
                ? 'bg-white/[0.07] text-white font-semibold'
                : 'text-slate-400 font-normal hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <DownloadSimple weight={activeTab === 'downloads' ? 'bold' : 'regular'} className={`w-4 h-4 ${activeTab === 'downloads' ? 'text-primary' : 'text-slate-400'}`} />
              <span>Downloads</span>
            </div>
            {activeDownloadsCount > 0 && (
              <span className="w-4 h-4 rounded bg-primary/20 text-primary font-bold text-[9px] flex items-center justify-center">
                {activeDownloadsCount}
              </span>
            )}
          </button>
        </nav>

        {/* Secondary Menu */}
        <div className="pt-2 border-t border-white/[0.06] space-y-1">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors ${
              activeTab === 'notifications'
                ? 'bg-white/[0.07] text-white font-semibold'
                : 'text-slate-400 font-normal hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Bell weight={activeTab === 'notifications' ? 'bold' : 'regular'} className={`w-4 h-4 ${activeTab === 'notifications' ? 'text-primary' : 'text-slate-400'}`} />
              <span>Notificações</span>
            </div>
            {unreadNotificationsCount > 0 && (
              <span className="min-w-4 h-4 px-1 rounded bg-accent-rose/20 border border-accent-rose/30 text-accent-rose font-semibold text-[9px] flex items-center justify-center">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors ${
              activeTab === 'settings'
                ? 'bg-white/[0.07] text-white font-semibold'
                : 'text-slate-400 font-normal hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <Gear weight={activeTab === 'settings' ? 'bold' : 'regular'} className={`w-4 h-4 ${activeTab === 'settings' ? 'text-primary' : 'text-slate-400'}`} />
            <span>Configurações</span>
          </button>
        </div>
      </div>

      {/* Footer / Offline Toggle / Badge */}
      <div className="p-3 border-t border-background-border space-y-2">
        {/* Offline Mode Toggle Button */}
        <button
          onClick={() => setIsOfflineMode(!isOfflineMode)}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] border transition-colors ${
            isOfflineMode
              ? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber font-medium'
              : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200'
          }`}
          title="Alternar modo offline para exibir apenas capítulos baixados no PC"
        >
          <div className="flex items-center gap-2">
            {isOfflineMode ? <WifiSlash weight="bold" className="w-3.5 h-3.5" /> : <WifiHigh weight="bold" className="w-3.5 h-3.5" />}
            <span>Modo Offline</span>
          </div>
          <span className="text-[9px] uppercase font-mono">
            {isOfflineMode ? 'Ativo' : 'Online'}
          </span>
        </button>

        {/* Zero Trackers Badge */}
        <div className="flex items-center gap-1.5 px-1 text-[10px] text-slate-500">
          <ShieldCheck weight="bold" className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="truncate">100% Gratuito & Sem Rastreadores</span>
        </div>
      </div>
    </aside>
  );
};
