import React, { useState, useEffect } from 'react';
import { useSmoothScroll } from '../../hooks/useSmoothScroll';
import {
  Bell,
  BellSlash,
  ArrowsClockwise,
  Checks,
  Check,
  BookOpen,
  ArrowSquareOut,
  Clock,
  Sparkle,
  SpinnerGap,
  WifiSlash
} from '@phosphor-icons/react';

export interface NotificationItem {
  id: string; // chapter_id
  manga_id: string;
  manga_title: string;
  manga_cover?: string | null;
  chapter_number: string;
  chapter_title?: string | null;
  translated_language: string;
  publish_at: string;
  is_read: number;
  created_at: number;
}

interface NotificationsViewProps {
  onSelectManga: (mangaId: string) => void;
  onReadChapter: (mangaId: string, chapterId: string, mangaTitle: string, chapterNum: string) => void;
  onUpdateUnreadCount?: (count: number) => void;
  isOfflineMode: boolean;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  onSelectManga,
  onReadChapter,
  onUpdateUnreadCount,
  isOfflineMode
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadLocalNotifications = async () => {
    try {
      const list = await window.electronAPI.getNotifications();
      setNotifications(list || []);
      const count = await window.electronAPI.getUnreadNotificationsCount();
      onUpdateUnreadCount?.(count);
    } catch (err) {
      console.error('Erro ao carregar notificações:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckUpdates = async () => {
    if (isOfflineMode || isChecking) return;
    setIsChecking(true);
    setStatusMessage('Buscando novos capítulos das suas obras...');

    try {
      const res = await window.electronAPI.checkNotifications();
      if (res?.notifications) {
        setNotifications(res.notifications);
        onUpdateUnreadCount?.(res.unreadCount);
        if (res.newFound > 0) {
          setStatusMessage(`🎉 Encontrados ${res.newFound} novo(s) capítulo(s)!`);
        } else {
          setStatusMessage('Você já está em dia com todas as suas obras!');
        }
        setTimeout(() => setStatusMessage(null), 3500);
      }
    } catch (err: any) {
      console.error('Erro ao buscar novidades:', err);
      setStatusMessage('Falha ao checar novidades. Tente novamente.');
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsChecking(false);
    }
  };

  const handleMarkAsRead = async (chapterId: string) => {
    try {
      await window.electronAPI.markNotificationRead(chapterId);
      setNotifications(prev =>
        prev.map(n => (n.id === chapterId ? { ...n, is_read: 1 } : n))
      );
      const count = await window.electronAPI.getUnreadNotificationsCount();
      onUpdateUnreadCount?.(count);
    } catch (err) {
      console.error('Erro ao marcar como lida:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await window.electronAPI.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      onUpdateUnreadCount?.(0);
      setStatusMessage('Todas as notificações foram marcadas como lidas.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Erro ao marcar todas como lidas:', err);
    }
  };

  const handleOpenChapter = (n: NotificationItem) => {
    handleMarkAsRead(n.id);
    onReadChapter(n.manga_id, n.id, n.manga_title, n.chapter_number);
  };

  useEffect(() => {
    loadLocalNotifications();
    if (!isOfflineMode) {
      handleCheckUpdates();
    }
  }, [isOfflineMode]);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const displayedList = notifications.filter(n => (filter === 'unread' ? !n.is_read : true));

  const formatPublishDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Recentemente';

      const diffSecs = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSecs < 60) return 'Agora mesmo';
      if (diffSecs < 3600) return `Há ${Math.floor(diffSecs / 60)} min`;
      if (diffSecs < 86400) return `Há ${Math.floor(diffSecs / 3600)} hora(s)`;
      if (diffSecs < 172800) return 'Ontem';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch {
      return 'Recentemente';
    }
  };

  const scrollRef = useSmoothScroll();

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 w-full overflow-y-auto p-3.5 sm:p-6 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              <Bell weight="bold" className="w-4 h-4 text-primary" />
              Notificações de Capítulos Novos
            </h1>
            {unreadCount > 0 && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-accent-rose/20 text-accent-rose border border-accent-rose/30">
                {unreadCount} nova(s)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Acompanhe automaticamente novos lançamentos das obras da sua biblioteca
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {!isOfflineMode && (
            <button
              onClick={handleCheckUpdates}
              disabled={isChecking}
              className="px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Buscar capítulos novos agora"
            >
              <ArrowsClockwise weight="bold" className={`w-3.5 h-3.5 text-primary ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Verificando...' : 'Verificar Novidades'}</span>
            </button>
          )}

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors"
              title="Marcar todas como lidas"
            >
              <Checks weight="bold" className="w-3.5 h-3.5 text-accent-emerald" />
              <span>Marcar Todas Lidas</span>
            </button>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center gap-5 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`pb-1 font-medium transition-colors relative ${
                filter === 'all'
                  ? 'text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Todas ({notifications.length})</span>
              {filter === 'all' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`pb-1 font-medium transition-colors relative ${
                filter === 'unread'
                  ? 'text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Não Lidas ({unreadCount})</span>
              {filter === 'unread' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      {statusMessage && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-2.5 text-xs text-slate-200 animate-in fade-in duration-150">
          {isChecking ? (
            <SpinnerGap weight="bold" className="w-4 h-4 text-primary animate-spin shrink-0" />
          ) : (
            <Sparkle weight="bold" className="w-4 h-4 text-primary shrink-0" />
          )}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Offline Mode Banner */}
      {isOfflineMode && (
        <div className="p-3 rounded-lg bg-accent-amber/10 border border-accent-amber/20 flex items-center gap-2.5 text-xs text-amber-200">
          <WifiSlash weight="bold" className="w-4 h-4 text-accent-amber shrink-0" />
          <span>Modo Offline: exibindo notificações já registradas no histórico local.</span>
        </div>
      )}

      {/* Notification Cards List */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center gap-2 text-xs text-slate-400">
          <SpinnerGap weight="bold" className="w-4 h-4 animate-spin text-primary" />
          <span>Carregando notificações...</span>
        </div>
      ) : displayedList.length > 0 ? (
        <div className="space-y-2">
          {displayedList.map(n => (
            <div
              key={n.id}
              className={`p-3 rounded-lg border transition-colors flex items-center justify-between gap-4 ${
                !n.is_read
                  ? 'bg-white/[0.04] border-white/[0.12] hover:border-white/[0.2]'
                  : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]'
              }`}
            >
              {/* Left Column: Cover & Info */}
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Manga Cover */}
                <div
                  onClick={() => onSelectManga(n.manga_id)}
                  className="w-11 h-15 rounded-md overflow-hidden bg-background-elevated shrink-0 cursor-pointer relative group border border-white/[0.08]"
                  title="Ver detalhes da obra"
                >
                  {n.manga_cover ? (
                    <img
                      src={n.manga_cover}
                      alt={n.manga_title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <BookOpen weight="bold" className="w-5 h-5" />
                    </div>
                  )}
                  {!n.is_read && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent-rose" />
                  )}
                </div>

                {/* Text Info */}
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      onClick={() => onSelectManga(n.manga_id)}
                      className="text-xs sm:text-sm font-semibold text-slate-100 hover:text-primary transition-colors cursor-pointer truncate max-w-sm"
                      title={n.manga_title}
                    >
                      {n.manga_title}
                    </h3>
                    <span className="text-[11px] font-mono text-primary font-medium shrink-0">
                      Capítulo {n.chapter_number}
                    </span>
                    <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-white/[0.04] text-slate-400 border border-white/[0.07] shrink-0">
                      {n.translated_language}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    {n.chapter_title && (
                      <span className="truncate max-w-xs text-slate-300 font-medium">
                        "{n.chapter_title}"
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock weight="bold" className="w-3 h-3" />
                      {formatPublishDate(n.publish_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Ler Capítulo */}
                <button
                  onClick={() => handleOpenChapter(n)}
                  className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Abrir e ler este capítulo agora"
                >
                  <BookOpen weight="bold" className="w-3.5 h-3.5" />
                  <span>Ler Capítulo</span>
                </button>

                {/* Ver Obra */}
                <button
                  onClick={() => onSelectManga(n.manga_id)}
                  className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white transition-colors"
                  title="Ver detalhes da obra"
                >
                  <ArrowSquareOut weight="bold" className="w-3.5 h-3.5" />
                </button>

                {/* Marcar como lida */}
                {!n.is_read ? (
                  <button
                    onClick={() => handleMarkAsRead(n.id)}
                    className="p-1.5 rounded-md bg-white/[0.04] hover:bg-accent-emerald/15 hover:border-accent-emerald/30 border border-white/[0.08] text-slate-400 hover:text-accent-emerald transition-colors"
                    title="Marcar como lida"
                  >
                    <Check weight="bold" className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="p-1.5 text-slate-600" title="Já lida">
                    <Checks weight="bold" className="w-3.5 h-3.5 text-slate-600" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="py-24 text-center text-slate-500 space-y-3">
          <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
            <BellSlash weight="bold" className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">
              {filter === 'unread' ? 'Nenhuma notificação não lida.' : 'Nenhum novo capítulo no momento.'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Você está 100% em dia com as obras da sua biblioteca! Novos lançamentos aparecerão aqui assim que saírem.
            </p>
          </div>

          {!isOfflineMode && (
            <button
              onClick={handleCheckUpdates}
              disabled={isChecking}
              className="px-5 py-2 rounded-md bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-bold inline-flex items-center gap-2 transition-all shadow-sm"
            >
              <ArrowsClockwise weight="bold" className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              Verificar Novidades Agora
            </button>
          )}
        </div>
      )}
    </div>
  );
};
