import React, { useState, useEffect } from 'react';
import { useSmoothScroll } from '../../hooks/useSmoothScroll';
import { LibraryEntry } from '../../types/mangadex';
import { BookOpen, Bookmarks, WifiSlash, SpinnerGap, ArrowsClockwise, CheckCircle, Trash } from '@phosphor-icons/react';

interface LibraryViewProps {
  onSelectManga: (mangaId: string) => void;
  isOfflineMode: boolean;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onSelectManga, isOfflineMode }) => {
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // States for removing manga from library
  const [mangaToRemove, setMangaToRemove] = useState<{ id: string; title: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Load from local database first, then optionally sync from MangaDex
  const loadLibraryFromDb = async () => {
    try {
      const localLib = await window.electronAPI.getLibrary();
      setLibrary(localLib || []);
    } catch (err) {
      console.error('Erro ao ler biblioteca local:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!mangaToRemove || isRemoving) return;
    setIsRemoving(true);
    const { id, title } = mangaToRemove;

    try {
      // Optimistic update
      setLibrary(prev => prev.filter(m => m.manga_id !== id));
      setMangaToRemove(null);

      // Persist local removal & sync with MangaDex
      await Promise.all([
        window.electronAPI.setMangaStatus(id, null),
        window.electronAPI.unfollowManga(id).catch(() => {})
      ]);

      setFeedbackMessage(`"${title}" foi removido da sua biblioteca.`);
      setTimeout(() => setFeedbackMessage(null), 3500);
    } catch (err) {
      console.error('Erro ao remover da biblioteca:', err);
      loadLibraryFromDb();
      setFeedbackMessage('Falha ao remover mangá. Tente novamente.');
      setTimeout(() => setFeedbackMessage(null), 3500);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleSync = async () => {
    if (isOfflineMode || isSyncing) return;
    setIsSyncing(true);
    setSyncMessage('Puxando títulos e histórico da sua conta MangaDex...');

    try {
      const result = await window.electronAPI.syncLibrary();
      if (result?.success) {
        setSyncMessage(`Sincronização concluída! ${result.count} títulos carregados.`);
        await loadLibraryFromDb();
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        setSyncMessage(result?.error || 'Erro ao sincronizar. Verifique se sua conta MangaDex está conectada.');
        setTimeout(() => setSyncMessage(null), 5000);
      }
    } catch (err: any) {
      setSyncMessage(err?.message || 'Falha ao sincronizar com a MangaDex.');
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setIsSyncing(false);
      await loadLibraryFromDb();
    }
  };

  useEffect(() => {
    loadLibraryFromDb();
    if (!isOfflineMode) {
      handleSync();
    }
  }, [isOfflineMode]);

  const filteredLibrary = library.filter(item => {
    if (activeFilter === 'all') return true;
    return item.status === activeFilter;
  });

  const scrollRef = useSmoothScroll();

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 w-full overflow-y-auto p-3.5 sm:p-6 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-background-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              <Bookmarks weight="bold" className="w-4 h-4 text-primary" />
              Minha Biblioteca
            </h1>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
              {library.length} títulos
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Sincronizada nativamente com os follows e statuses da sua conta MangaDex
          </p>
        </div>

        {/* Sync & Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sync Button */}
          {!isOfflineMode && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl bg-background-elevated hover:bg-background-hover border border-background-border text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Puxar mangás seguidos e histórico da MangaDex agora"
            >
              <ArrowsClockwise weight="bold" className={`w-3.5 h-3.5 text-primary ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar MangaDex'}</span>
            </button>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center gap-5 overflow-x-auto text-xs">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'reading', label: 'Lendo' },
              { id: 'plan_to_read', label: 'Planejo Ler' },
              { id: 'completed', label: 'Concluídos' },
              { id: 'on_hold', label: 'Em Espera' },
              { id: 'dropped', label: 'Abandonados' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`pb-1.5 font-medium transition-colors relative whitespace-nowrap ${
                  activeFilter === f.id
                    ? 'text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{f.label}</span>
                {activeFilter === f.id && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncMessage && (
        <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-2.5 text-xs text-slate-200 animate-in fade-in duration-200">
          {isSyncing ? (
            <SpinnerGap weight="bold" className="w-4 h-4 text-primary animate-spin shrink-0" />
          ) : (
            <CheckCircle weight="bold" className="w-4 h-4 text-accent-emerald shrink-0" />
          )}
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Offline banner if active */}
      {isOfflineMode && (
        <div className="p-3.5 rounded-xl bg-accent-amber/10 border border-accent-amber/25 flex items-center gap-2.5 text-xs text-amber-200">
          <WifiSlash weight="bold" className="w-4 h-4 text-accent-amber shrink-0" />
          <span>Modo Offline ativo: exibindo mangás com dados em cache local.</span>
        </div>
      )}

      {/* Feedback banner */}
      {feedbackMessage && (
        <div className="p-3.5 rounded-xl bg-accent-emerald/15 border border-accent-emerald/30 flex items-center gap-2.5 text-xs text-emerald-200 animate-in fade-in duration-200">
          <CheckCircle weight="bold" className="w-4 h-4 text-accent-emerald shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Grid of Library Manga (5 columns on desktop) */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center gap-2 text-xs text-slate-400">
          <SpinnerGap weight="bold" className="w-4 h-4 animate-spin text-primary" />
          <span>Carregando sua biblioteca...</span>
        </div>
      ) : filteredLibrary.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-3 sm:gap-6 pt-2">
          {filteredLibrary.map(item => (
            <div
              key={item.manga_id}
              onClick={() => onSelectManga(item.manga_id)}
              className="group cursor-pointer flex flex-col select-none transition-transform duration-200 hover:-translate-y-1 relative"
            >
              {/* Cover Poster */}
              <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-background-elevated border border-white/[0.07] transition-all duration-300 group-hover:border-white/[0.2]">
                {item.cover_url ? (
                  <img
                    src={item.cover_url}
                    alt={item.title || 'Mangá'}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700">
                    <BookOpen weight="bold" className="w-8 h-8" />
                  </div>
                )}

                {/* Status Indicator (Top-Left) */}
                <div className="absolute top-2 left-2 pointer-events-none">
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-slate-300 border border-white/[0.08] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>
                      {item.status === 'reading'
                        ? 'Lendo'
                        : item.status === 'plan_to_read'
                        ? 'Planejo Ler'
                        : item.status === 'completed'
                        ? 'Concluído'
                        : item.status === 'on_hold'
                        ? 'Em Espera'
                        : item.status === 'dropped'
                        ? 'Abandonado'
                        : item.status}
                    </span>
                  </span>
                </div>

                {/* Botão de Remover ao Passar o Mouse (Top-Right) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMangaToRemove({
                      id: item.manga_id,
                      title: item.title || 'este mangá'
                    });
                  }}
                  className="absolute top-2 right-2 w-6 h-6 rounded bg-black/80 hover:bg-accent-rose text-slate-300 hover:text-white border border-white/20 hover:border-accent-rose flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-150 z-10"
                  title="Remover da biblioteca"
                >
                  <Trash weight="bold" className="w-3 h-3" />
                </button>
              </div>

              {/* Title on page surface */}
              <div className="pt-2.5 pb-1 flex flex-col">
                <h3 className="text-[13px] font-semibold text-slate-200 line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                  {item.title || 'Carregando título...'}
                </h3>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center text-slate-500 space-y-3">
          <Bookmarks weight="bold" className="w-12 h-12 mx-auto text-slate-600" />
          <div>
            <p className="text-sm font-semibold text-slate-300">
              {library.length === 0
                ? 'Nenhum mangá encontrado na sua biblioteca local.'
                : 'Nenhum mangá com este filtro de leitura.'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Se você possui títulos seguidos na MangaDex, clique no botão abaixo para puxar todos os seus dados agora.
            </p>
          </div>

          {!isOfflineMode && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-5 py-2 rounded-md bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-bold inline-flex items-center gap-2 transition-all shadow-sm"
            >
              <ArrowsClockwise weight="bold" className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Puxar Meus Títulos da MangaDex
            </button>
          )}
        </div>
      )}

      {/* Modal de Confirmação de Remoção da Biblioteca */}
      {mangaToRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-md bg-background-card border border-background-border rounded-xl p-6 shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 rounded-xl bg-accent-rose/10 border border-accent-rose/20 flex items-center justify-center text-accent-rose mx-auto">
              <Trash weight="bold" className="w-7 h-7 text-accent-rose" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-white leading-snug">
                Remover da Biblioteca?
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tem certeza que deseja remover <strong className="text-slate-200">"{mangaToRemove.title}"</strong> da sua biblioteca? Ele não aparecerá mais na sua lista de leituras.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMangaToRemove(null)}
                disabled={isRemoving}
                className="flex-1 px-4 py-2.5 rounded-md bg-background-elevated hover:bg-background-hover text-xs font-medium text-slate-300 hover:text-white transition-colors border border-background-border"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={isRemoving}
                className="flex-1 px-4 py-2.5 rounded-md bg-accent-rose hover:bg-rose-600 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-2"
              >
                {isRemoving ? (
                  <>
                    <SpinnerGap weight="bold" className="w-3.5 h-3.5 animate-spin" />
                    <span>Removendo...</span>
                  </>
                ) : (
                  <>
                    <Trash weight="bold" className="w-3.5 h-3.5" />
                    <span>Confirmar Remoção</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
