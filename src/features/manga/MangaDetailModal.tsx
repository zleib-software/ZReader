import React, { useState, useEffect } from 'react';
import { ChapterItem, MangaItem, getSmartMangaTitle } from '../../types/mangadex';
import { ScanlationBadge } from '../../components/ScanlationBadge';
import {
  X,
  Heart,
  Bookmark,
  BookOpen,
  DownloadSimple,
  CheckCircle,
  Eye,
  CalendarBlank,
  Sparkle,
  SpinnerGap,
  CaretDown,
  CaretUp,
  CaretLeft,
  CaretRight,
  ArrowsDownUp,
  MagnifyingGlass
} from '@phosphor-icons/react';

interface MangaDetailModalProps {
  mangaId: string | null;
  onClose: () => void;
  onReadChapter: (chapterId: string, mangaTitle: string, chapterNumber: string) => void;
}

export const MangaDetailModal: React.FC<MangaDetailModalProps> = ({
  mangaId,
  onClose,
  onReadChapter
}) => {
  const [manga, setManga] = useState<MangaItem | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [totalChapters, setTotalChapters] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [isAllLoaded, setIsAllLoaded] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [chapterFilter, setChapterFilter] = useState('');

  const [readChapters, setReadChapters] = useState<string[]>([]);
  const [downloadedChapters, setDownloadedChapters] = useState<string[]>([]);
  const [isFollowed, setIsFollowed] = useState(false);
  const [readingStatus, setReadingStatus] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<'pt-br' | 'en' | 'all'>('pt-br');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch Manga Details & Read/Library status on mangaId change
  useEffect(() => {
    if (!mangaId) return;

    let isMounted = true;
    const loadDetails = async () => {
      setIsLoading(true);
      try {
        const [detailsRes, readList, status, downloads] = await Promise.all([
          window.electronAPI.getMangaDetails(mangaId),
          window.electronAPI.getReadMarkers(mangaId).catch(() => []),
          window.electronAPI.getLibraryStatus(mangaId).catch(() => null),
          window.electronAPI.getDownloads().catch(() => [])
        ]);

        if (isMounted) {
          if (detailsRes?.data) {
            setManga(detailsRes.data);
          }
          setReadChapters(readList || []);
          setReadingStatus(status);
          setIsFollowed(!!status);

          const downloadedIds = downloads
            .filter((d: any) => d.manga_id === mangaId && d.status === 'completed')
            .map((d: any) => d.chapter_id);
          setDownloadedChapters(downloadedIds);
        }
      } catch (err) {
        console.error('Erro ao carregar detalhes do mangá:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    setPage(1);
    setIsAllLoaded(false);
    setChapterFilter('');
    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [mangaId]);

  // 2. Fetch Chapters (paginated by default or all if requested)
  useEffect(() => {
    if (!mangaId) return;

    let isMounted = true;
    const loadChapters = async () => {
      setIsLoadingChapters(true);
      try {
        const langFilter = selectedLanguage === 'all' ? ['pt-br', 'en', 'es'] : [selectedLanguage];
        const offset = (page - 1) * pageSize;
        const chRes = await window.electronAPI.getMangaChapters(
          mangaId,
          langFilter,
          pageSize,
          offset,
          order,
          false
        );
        if (isMounted && chRes?.data) {
          setChapters(chRes.data);
          setTotalChapters(chRes.total || chRes.data.length);
        }
      } catch (err) {
        console.error('Erro ao carregar capítulos paginados:', err);
      } finally {
        if (isMounted) setIsLoadingChapters(false);
      }
    };

    if (!isAllLoaded) {
      loadChapters();
    }

    return () => {
      isMounted = false;
    };
  }, [mangaId, selectedLanguage, page, order, isAllLoaded]);

  // Handler to fetch all chapters at once via backend pagination
  const handleLoadAllChapters = async () => {
    if (!mangaId || isLoadingChapters) return;
    setIsLoadingChapters(true);
    try {
      const langFilter = selectedLanguage === 'all' ? ['pt-br', 'en', 'es'] : [selectedLanguage];
      const chRes = await window.electronAPI.getMangaChapters(
        mangaId,
        langFilter,
        totalChapters || 1000,
        0,
        order,
        true
      );
      if (chRes?.data) {
        setChapters(chRes.data);
        setTotalChapters(chRes.total || chRes.data.length);
        setIsAllLoaded(true);
      }
    } catch (err) {
      console.error('Erro ao carregar todos os capítulos:', err);
    } finally {
      setIsLoadingChapters(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalChapters / pageSize));

  const filteredChapters = chapters.filter(ch => {
    if (!chapterFilter.trim()) return true;
    const q = chapterFilter.trim().toLowerCase();
    const chNum = (ch.attributes?.chapter || '').toLowerCase();
    const chTitle = (ch.attributes?.title || '').toLowerCase();
    return chNum.includes(q) || chTitle.includes(q);
  });

  if (!mangaId) return null;

  const title = manga ? getSmartMangaTitle(manga) : 'Carregando mangá...';

  const description =
    manga?.attributes?.description?.['pt-br'] ||
    manga?.attributes?.description?.en ||
    Object.values(manga?.attributes?.description || {})[0] ||
    'Sem sinopse disponível.';

  const coverRel = manga?.relationships.find(r => r.type === 'cover_art');
  const coverFileName = coverRel?.attributes?.fileName;
  const coverUrl = coverFileName
    ? `https://uploads.mangadex.org/covers/${mangaId}/${coverFileName}.512.jpg`
    : null;

  const author = manga?.relationships.find(r => r.type === 'author')?.attributes?.name;
  const artist = manga?.relationships.find(r => r.type === 'artist')?.attributes?.name;

  const handleToggleFollow = async () => {
    if (!isFollowed) {
      await window.electronAPI.followManga(mangaId);
      await window.electronAPI.setMangaStatus(mangaId, 'reading');
      setIsFollowed(true);
      setReadingStatus('reading');
    } else {
      await window.electronAPI.unfollowManga(mangaId);
      await window.electronAPI.setMangaStatus(mangaId, null);
      setIsFollowed(false);
      setReadingStatus(null);
    }
  };

  const handleChangeStatus = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value || null;
    setReadingStatus(val);
    await window.electronAPI.setMangaStatus(mangaId, val);
    if (val) setIsFollowed(true);
  };

  const handleToggleRead = async (chapterId: string) => {
    const isRead = readChapters.includes(chapterId);
    if (isRead) {
      await window.electronAPI.markChapterUnread(chapterId);
      setReadChapters(prev => prev.filter(id => id !== chapterId));
    } else {
      await window.electronAPI.markChapterRead(chapterId);
      setReadChapters(prev => [...prev, chapterId]);
    }
  };

  const handleDownload = async (chapterId: string) => {
    if (downloadedChapters.includes(chapterId)) return;
    const chap = chapters.find(c => c.id === chapterId);
    const meta = {
      mangaTitle: title,
      mangaCover: coverUrl || undefined,
      chapterNumber: chap?.attributes?.chapter || '?',
      chapterTitle: chap?.attributes?.title || ''
    };
    await window.electronAPI.queueDownload(mangaId, chapterId, meta);
    setDownloadedChapters(prev => [...prev, chapterId]);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-0 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <div className="relative w-full max-w-4xl h-full sm:h-[90dvh] bg-background-elevated border-0 sm:border border-white/[0.08] rounded-none sm:rounded-2xl overflow-hidden flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 w-8 h-8 rounded-full sm:rounded-lg bg-black/70 sm:bg-black/60 border border-white/20 sm:border-white/[0.1] flex items-center justify-center text-white hover:bg-white/[0.1] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hero Section with Backdrop Blur */}
        <div className="relative h-52 sm:h-64 max-h-[38vh] w-full overflow-hidden shrink-0">
          {coverUrl && (
            <img
              src={coverUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover filter blur-2xl opacity-15 scale-125"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background-elevated via-background-elevated/70 to-transparent" />

          {/* Hero Content */}
          <div className="relative h-full p-4 sm:p-6 flex items-end gap-3.5 sm:gap-6 z-10">
            {/* Poster */}
            <div className="w-24 sm:w-32 aspect-[2/3] rounded-lg overflow-hidden border border-white/[0.1] shrink-0 bg-background-card">
              {coverUrl ? (
                <img src={coverUrl} alt={title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <BookOpen weight="bold" className="w-8 h-8" />
                </div>
              )}
            </div>

            {/* Title & Metadata */}
            <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2 pb-1">
              <h1 className="text-base sm:text-xl md:text-2xl font-bold text-white leading-tight line-clamp-2">
                {title}
              </h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                {author && (
                  <span>
                    Autor: <strong className="text-slate-200 font-medium">{author}</strong>
                  </span>
                )}
                {artist && artist !== author && (
                  <span>
                    Arte: <strong className="text-slate-200 font-medium">{artist}</strong>
                  </span>
                )}
                {manga?.attributes?.status && (
                  <span className="capitalize text-primary font-medium">
                    {manga.attributes.status}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  onClick={handleToggleFollow}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    isFollowed
                      ? 'bg-accent-rose text-white'
                      : 'bg-primary text-[#0D0A0E] hover:bg-primary-hover'
                  }`}
                >
                  <Heart weight={isFollowed ? 'fill' : 'bold'} className="w-3.5 h-3.5" />
                  {isFollowed ? 'Seguindo' : 'Seguir Mangá'}
                </button>

                <select
                  value={readingStatus || ''}
                  onChange={handleChangeStatus}
                  className="px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-primary/60"
                >
                  <option value="" className="bg-[#171218]">Status na Biblioteca...</option>
                  <option value="reading" className="bg-[#171218]">Lendo</option>
                  <option value="plan_to_read" className="bg-[#171218]">Planejo Ler</option>
                  <option value="completed" className="bg-[#171218]">Concluído</option>
                  <option value="on_hold" className="bg-[#171218]">Em Espera</option>
                  <option value="dropped" className="bg-[#171218]">Abandonado</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6 overscroll-contain">
          {/* Synopsis */}
          <div className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sinopse</h2>
            <div className="text-xs text-slate-300 leading-relaxed relative">
              <p className={!isDescriptionExpanded ? 'line-clamp-3' : ''}>
                {description}
              </p>
              {description.length > 200 && (
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="mt-1 text-primary text-[11px] font-medium flex items-center gap-1 hover:underline"
                >
                  {isDescriptionExpanded ? (
                    <>Mostrar menos <CaretUp weight="bold" className="w-3 h-3" /></>
                  ) : (
                    <>Ler mais <CaretDown weight="bold" className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>

            {/* Tags */}
            {manga?.attributes?.tags && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {manga.attributes.tags.map(t => (
                  <span
                    key={t.id}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/[0.03] text-slate-300 border border-white/[0.07] font-medium"
                  >
                    {t.attributes.name.en}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Chapters Header, Filters & Pagination */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Capítulos Disponíveis
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/[0.08] font-mono">
                  {totalChapters > 0 ? `${totalChapters} total` : chapters.length}
                </span>

                {/* Sort Order Toggle */}
                <button
                  onClick={() => {
                    setOrder(o => (o === 'desc' ? 'asc' : 'desc'));
                    setPage(1);
                  }}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 hover:text-white border border-white/[0.08] transition-colors"
                  title={order === 'desc' ? 'Ordenado por mais recentes. Clique para ordenar do Cap. 1.' : 'Ordenado do Cap. 1. Clique para ordenar pelos mais recentes.'}
                >
                  <ArrowsDownUp weight="bold" className="w-3 h-3 text-primary" />
                  <span>{order === 'desc' ? 'Mais recentes' : 'Cap. 1 primeiro'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Chapter Number Filter */}
                <div className="relative flex items-center">
                  <MagnifyingGlass weight="bold" className="w-3 h-3 absolute left-2.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filtrar cap..."
                    value={chapterFilter}
                    onChange={e => setChapterFilter(e.target.value)}
                    className="w-28 sm:w-32 h-7 pl-7 pr-2 text-xs bg-white/[0.03] border border-white/[0.08] rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>

                {/* Language Selector */}
                <div className="flex items-center gap-1 bg-white/[0.03] p-0.5 rounded-md border border-white/[0.08] text-xs">
                  <button
                    onClick={() => { setSelectedLanguage('pt-br'); setPage(1); setIsAllLoaded(false); }}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                      selectedLanguage === 'pt-br' ? 'bg-white/[0.1] text-primary font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    PT-BR
                  </button>
                  <button
                    onClick={() => { setSelectedLanguage('en'); setPage(1); setIsAllLoaded(false); }}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                      selectedLanguage === 'en' ? 'bg-white/[0.1] text-primary font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => { setSelectedLanguage('all'); setPage(1); setIsAllLoaded(false); }}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                      selectedLanguage === 'all' ? 'bg-white/[0.1] text-primary font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todos
                  </button>
                </div>
              </div>
            </div>

            {/* Top Pagination Bar (when total > 100) */}
            {totalChapters > pageSize && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/[0.07] text-xs">
                <div className="text-slate-400 text-xs flex items-center gap-2">
                  {isAllLoaded ? (
                    <span className="text-primary font-medium flex items-center gap-1.5">
                      <CheckCircle weight="bold" className="w-4 h-4" />
                      Todos os {totalChapters} capítulos carregados
                    </span>
                  ) : (
                    <span>
                      Página <strong className="text-white">{page}</strong> de <strong className="text-white">{totalPages}</strong>
                      {' '}({((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, totalChapters)} de {totalChapters})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {!isAllLoaded ? (
                    <>
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1 || isLoadingChapters}
                        className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none text-xs flex items-center gap-1 transition-colors"
                      >
                        <CaretLeft weight="bold" className="w-3.5 h-3.5" />
                        <span>Anterior</span>
                      </button>

                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                        .map((p, idx, arr) => {
                          const prev = arr[idx - 1];
                          const hasGap = prev && p - prev > 1;
                          return (
                            <React.Fragment key={p}>
                              {hasGap && <span className="text-slate-600 px-0.5">...</span>}
                              <button
                                onClick={() => setPage(p)}
                                disabled={isLoadingChapters}
                                className={`min-w-[26px] h-6 px-1.5 rounded-md text-xs font-semibold transition-colors ${
                                  page === p
                                    ? 'bg-primary text-[#0D0A0E]'
                                    : 'bg-white/[0.03] border border-white/[0.08] text-slate-400 hover:text-white'
                                }`}
                              >
                                {p}
                              </button>
                            </React.Fragment>
                          );
                        })}

                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || isLoadingChapters}
                        className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none text-xs flex items-center gap-1 transition-colors"
                      >
                        <span>Próxima</span>
                        <CaretRight weight="bold" className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={handleLoadAllChapters}
                        disabled={isLoadingChapters}
                        className="ml-1 px-2.5 py-1 rounded-md bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                        title="Carregar todos os capítulos em segundo plano"
                      >
                        {isLoadingChapters && isAllLoaded ? (
                          <SpinnerGap weight="bold" className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkle weight="bold" className="w-3 h-3" />
                        )}
                        <span>Carregar Todos</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setIsAllLoaded(false); setPage(1); }}
                      className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-slate-400 hover:text-white text-xs transition-colors"
                    >
                      Modo Paginado (100 por pág.)
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Chapters List */}
            {isLoading || isLoadingChapters ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                <SpinnerGap weight="bold" className="w-5 h-5 animate-spin text-primary" />
                <span>Buscando capítulos na API da MangaDex...</span>
              </div>
            ) : filteredChapters.length > 0 ? (
              <div className="space-y-1.5">
                {filteredChapters.map(ch => {
                  const isRead = readChapters.includes(ch.id);
                  const isDownloaded = downloadedChapters.includes(ch.id);
                  const scanGroup = ch.relationships.find(r => r.type === 'scanlation_group')?.attributes?.name || null;
                  const chapterNum = ch.attributes.chapter ? `Cap. ${ch.attributes.chapter}` : 'Especial / One-Shot';
                  const chapterTitle = ch.attributes.title || '';

                  return (
                    <div
                      key={ch.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-4 transition-colors ${
                        isRead
                          ? 'bg-white/[0.01] border-white/[0.04] text-slate-500'
                          : 'bg-white/[0.03] border-white/[0.07] text-slate-200 hover:border-white/[0.15]'
                      }`}
                    >
                      {/* Left: Info & Scanlation Credit */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          onClick={() => handleToggleRead(ch.id)}
                          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                            isRead
                              ? 'text-primary bg-primary/10'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                          title={isRead ? 'Marcar como não lido' : 'Marcar como lido'}
                        >
                          <CheckCircle weight="bold" className="w-4 h-4" />
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-100">{chapterNum}</span>
                            {chapterTitle && (
                              <span className="text-xs text-slate-400 truncate max-w-xs">
                                — {chapterTitle}
                              </span>
                            )}
                          </div>

                          {/* SCANLATION CREDIT BADGE */}
                          <div className="mt-1">
                            <ScanlationBadge groupName={scanGroup} />
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Download button */}
                        <button
                          onClick={() => handleDownload(ch.id)}
                          disabled={isDownloaded}
                          className={`p-1.5 rounded-md border text-xs transition-colors ${
                            isDownloaded
                              ? 'bg-primary/10 border-primary/30 text-primary'
                              : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-slate-200'
                          }`}
                          title={isDownloaded ? 'Capítulo baixado para leitura offline' : 'Baixar capítulo'}
                        >
                          <DownloadSimple weight="bold" className="w-3.5 h-3.5" />
                        </button>

                        {/* Read button */}
                        <button
                          onClick={() => onReadChapter(ch.id, title, ch.attributes.chapter || '1')}
                          className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <Eye weight="bold" className="w-3.5 h-3.5" />
                          <span>Ler</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Pagination Bar (when total > 100 and not all loaded) */}
                {totalChapters > pageSize && !isAllLoaded && (
                  <div className="flex items-center justify-between pt-3 border-t border-background-border text-xs">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1 || isLoadingChapters}
                      className="px-3 py-1.5 rounded-lg bg-background-elevated border border-background-border text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition-colors"
                    >
                      <CaretLeft weight="bold" className="w-3.5 h-3.5" />
                      <span>Página Anterior</span>
                    </button>

                    <span className="text-slate-400 text-xs font-mono">
                      Pág. {page} / {totalPages}
                    </span>

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || isLoadingChapters}
                      className="px-3 py-1.5 rounded-lg bg-background-elevated border border-background-border text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition-colors"
                    >
                      <span>Próxima Página</span>
                      <CaretRight weight="bold" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                {chapterFilter ? 'Nenhum capítulo corresponde à busca digitada.' : 'Nenhum capítulo disponível para o idioma selecionado.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
