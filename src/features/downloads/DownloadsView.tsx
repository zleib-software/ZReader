import React, { useState, useEffect } from 'react';
import { useSmoothScroll } from '../../hooks/useSmoothScroll';
import { DownloadItem } from '../../types/mangadex';
import {
  DownloadSimple,
  Pause,
  Play,
  Trash,
  FolderOpen,
  HardDrive,
  CheckCircle,
  WarningCircle,
  SpinnerGap,
  BookOpen,
  WifiSlash,
  Sparkle,
  ArrowSquareOut
} from '@phosphor-icons/react';

interface DownloadsViewProps {
  onReadChapter?: (mangaId: string, chapterId: string, mangaTitle: string, chapterNumber: string) => void;
  onSelectManga?: (mangaId: string) => void;
  isOfflineMode?: boolean;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  onReadChapter,
  onSelectManga,
  isOfflineMode
}) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'completed' | 'active'>('all');
  const [storageUsage, setStorageUsage] = useState<{ usedBytes: number; formatted: string }>({
    usedBytes: 0,
    formatted: '0 MB'
  });
  const [downloadsPath, setDownloadsPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const loadDownloads = async () => {
    try {
      const [list, storage, dirPath] = await Promise.all([
        window.electronAPI.getDownloads(),
        window.electronAPI.getStorageUsage(),
        window.electronAPI.getDownloadsPath()
      ]);
      setDownloads(list || []);
      setStorageUsage(storage);
      setDownloadsPath(dirPath);
    } catch (err) {
      console.error('Erro ao carregar downloads:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDownloads();
    const interval = setInterval(loadDownloads, 2000);
    return () => clearInterval(interval);
  }, []);

  const handlePause = async (chapterId: string) => {
    await window.electronAPI.pauseDownload(chapterId);
    loadDownloads();
  };

  const handleResume = async (chapterId: string) => {
    await window.electronAPI.resumeDownload(chapterId);
    loadDownloads();
  };

  const handleDelete = async (chapterId: string) => {
    await window.electronAPI.deleteDownload(chapterId);
    loadDownloads();
  };

  const handleOpenFolder = async () => {
    await window.electronAPI.openDownloadsFolder();
  };

  const completedCount = downloads.filter(d => d.status === 'completed').length;
  const activeCount = downloads.filter(d => d.status === 'downloading' || d.status === 'queued').length;

  const filteredDownloads = downloads.filter(d => {
    if (filterTab === 'completed') return d.status === 'completed';
    if (filterTab === 'active') return d.status === 'downloading' || d.status === 'queued' || d.status === 'paused';
    return true;
  });

  const scrollRef = useSmoothScroll();

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 w-full overflow-y-auto p-3.5 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Offline Mode Alert Banner */}
        {isOfflineMode && (
          <div className="p-4 rounded-xl bg-accent-amber/10 border border-accent-amber/20 flex items-center justify-between gap-3 text-xs text-accent-amber animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-amber/20 flex items-center justify-center shrink-0">
                <WifiSlash weight="bold" className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold">Você está em Modo Offline</p>
                <p className="text-[11px] text-slate-300">
                  Apenas os capítulos baixados abaixo estão acessíveis sem necessidade de internet. Clique em "Ler Offline" para ler instantaneamente.
                </p>
              </div>
            </div>
            <span className="font-mono font-bold px-2 py-0.5 rounded bg-accent-amber/20 text-[10px]">
              {completedCount} capítulos prontos
            </span>
          </div>
        )}

        {/* Header & Storage Card */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              <DownloadSimple weight="bold" className="w-4 h-4 text-primary" />
              Downloads & Leitura Offline
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Acesse e gerencie suas obras salvas para ler a qualquer hora sem internet
            </p>
          </div>

          {/* Disk space & folder action */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.07] text-xs text-slate-400">
              <HardDrive weight="bold" className="w-3.5 h-3.5 text-slate-300" />
              <span>Espaço em disco:</span>
              <strong className="text-white font-mono">{storageUsage.formatted}</strong>
            </div>

            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-slate-200 transition-colors"
              title="Abrir pasta de downloads no explorador do Windows"
            >
              <FolderOpen weight="bold" className="w-3.5 h-3.5 text-primary" />
              <span>Abrir Pasta</span>
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        {downloads.length > 0 && (
          <div className="flex items-center gap-6 border-b border-white/[0.08] pb-2 text-xs">
            <button
              onClick={() => setFilterTab('all')}
              className={`pb-1 font-medium transition-colors relative ${
                filterTab === 'all'
                  ? 'text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Todos ({downloads.length})</span>
              {filterTab === 'all' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setFilterTab('completed')}
              className={`pb-1 font-medium transition-colors relative ${
                filterTab === 'completed'
                  ? 'text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Prontos Offline ({completedCount})</span>
              {filterTab === 'completed' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
              )}
            </button>
            {activeCount > 0 && (
              <button
                onClick={() => setFilterTab('active')}
                className={`pb-1 font-medium transition-colors relative ${
                  filterTab === 'active'
                    ? 'text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Em Andamento ({activeCount})</span>
                {filterTab === 'active' && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Downloads List */}
        {isLoading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-xs text-slate-400">
            <SpinnerGap weight="bold" className="w-4 h-4 animate-spin text-primary" />
            <span>Verificando fila de downloads...</span>
          </div>
        ) : filteredDownloads.length > 0 ? (
          <div className="space-y-2.5">
            {filteredDownloads.map(item => {
              const progressPercent =
                item.pages_total > 0
                  ? Math.round((item.pages_done / item.pages_total) * 100)
                  : 0;

              const isCompleted = item.status === 'completed';
              const mangaTitle = item.manga_title || 'Mangá';
              const chapterNum = item.chapter_number || '?';

              return (
                <div
                  key={item.chapter_id}
                  className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.07] hover:border-white/[0.15] transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  {/* Left: Poster + Manga Title & Chapter */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Poster Cover */}
                    <div className="w-11 h-15 rounded-md overflow-hidden bg-background-elevated border border-white/[0.08] shrink-0 flex items-center justify-center">
                      {item.manga_cover ? (
                        <img
                          src={item.manga_cover}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen weight="bold" className="w-5 h-5 text-slate-600" />
                      )}
                    </div>

                    {/* Titles */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          onClick={() => onSelectManga?.(item.manga_id)}
                          className="text-xs sm:text-sm font-semibold text-slate-100 hover:text-primary transition-colors cursor-pointer truncate max-w-sm"
                          title="Clique para ver os detalhes deste mangá"
                        >
                          {mangaTitle}
                        </h3>

                        {/* Status Badge */}
                        <span
                          className={`text-[9px] font-medium tracking-wide px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            isCompleted
                              ? 'bg-primary/10 text-primary border border-primary/25'
                              : item.status === 'downloading'
                              ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/25'
                              : item.status === 'paused'
                              ? 'bg-accent-amber/10 text-accent-amber border border-accent-amber/25'
                              : 'bg-white/[0.04] text-slate-400 border border-white/[0.08]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isCompleted
                                ? 'bg-primary'
                                : item.status === 'downloading'
                                ? 'bg-accent-cyan animate-pulse'
                                : item.status === 'paused'
                                ? 'bg-accent-amber'
                                : 'bg-slate-400'
                            }`}
                          />
                          <span>
                            {isCompleted
                              ? 'Pronto Offline'
                              : item.status === 'downloading'
                              ? 'Baixando'
                              : item.status === 'paused'
                              ? 'Pausado'
                              : item.status === 'failed'
                              ? 'Falhou'
                              : 'Na Fila'}
                          </span>
                        </span>
                      </div>

                      {/* Chapter identifier & sub-info */}
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <span className="font-mono text-primary font-medium text-[11px]">
                          Capítulo {chapterNum}
                        </span>
                        {item.chapter_title && (
                          <span className="text-slate-400 italic truncate text-[11px] max-w-xs">
                            "{item.chapter_title}"
                          </span>
                        )}
                      </div>

                      {/* Progress Bar (if active or paused) */}
                      {!isCompleted && (
                        <div className="w-full max-w-xs flex items-center gap-2.5 pt-0.5">
                          <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {item.pages_done} / {item.pages_total} ({progressPercent}%)
                          </span>
                        </div>
                      )}

                      {/* Completed note */}
                      {isCompleted && (
                        <p className="text-[10px] text-slate-500">
                          {item.pages_total} páginas salvas • Leitura local
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Ler Offline Button (Always available for completed downloads) */}
                    {isCompleted && (
                      <button
                        type="button"
                        onClick={() => onReadChapter?.(item.manga_id, item.chapter_id, mangaTitle, chapterNum)}
                        className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        title="Ler este capítulo agora mesmo sem internet"
                      >
                        <BookOpen weight="bold" className="w-3.5 h-3.5" />
                        <span>Ler Offline</span>
                      </button>
                    )}

                    {/* Ver Obra Button */}
                    <button
                      type="button"
                      onClick={() => onSelectManga?.(item.manga_id)}
                      className="px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white text-xs font-medium transition-colors"
                      title="Ver sinopse e detalhes completos da obra"
                    >
                      Ver Obra
                    </button>

                    {item.status === 'downloading' && (
                      <button
                        onClick={() => handlePause(item.chapter_id)}
                        className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white transition-colors"
                        title="Pausar"
                      >
                        <Pause weight="bold" className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {item.status === 'paused' && (
                      <button
                        onClick={() => handleResume(item.chapter_id)}
                        className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-primary transition-colors"
                        title="Retomar"
                      >
                        <Play weight="bold" className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(item.chapter_id)}
                      className="p-1.5 rounded-md bg-white/[0.04] hover:bg-accent-rose/15 border border-white/[0.08] hover:border-accent-rose/40 text-slate-400 hover:text-accent-rose transition-colors"
                      title="Excluir capítulo baixado"
                    >
                      <Trash weight="bold" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-24 text-center text-slate-500 space-y-3 bg-background-card/40 rounded-xl border border-background-border p-8">
            <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-500">
              <DownloadSimple weight="bold" className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-300">Nenhum capítulo baixado encontrado.</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Abra qualquer mangá e clique no ícone de download de um capítulo. Todos os capítulos baixados ficarão listados aqui com o botão <strong>"Ler Offline"</strong> para você ler sem internet!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
