import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Lenis from 'lenis';
import {
  X,
  CaretLeft,
  CaretRight,
  CornersOut,
  CornersIn,
  Columns,
  Square,
  Scroll,
  Sun,
  Moon,
  SpinnerGap,
  CheckCircle,
  Faders,
  DownloadSimple,
  BookOpen,
  Sparkle,
  ArrowRight,
  Funnel,
  MagnifyingGlass,
  CaretDown,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowCounterClockwise,
  ArrowClockwise,
  WarningCircle,
  ArrowsInSimple,
  ArrowsOutLineHorizontal,
  ArrowsOutLineVertical
} from '@phosphor-icons/react';

interface ReaderModalProps {
  chapterId: string | null;
  mangaId: string | null;
  mangaTitle: string;
  chapterNumber: string;
  onClose: () => void;
  onChapterChange?: (chapterId: string, chapterNumber: string) => void;
}

type ReaderMode = 'single' | 'double' | 'webtoon';
type ReaderTheme = 'black' | 'dark' | 'sepia' | 'light';
export type ScaleMode = 'fit' | 'fit-width' | 'fit-height';

export const ReaderModal: React.FC<ReaderModalProps> = ({
  chapterId,
  mangaId,
  mangaTitle,
  chapterNumber,
  onClose,
  onChapterChange
}) => {
  // Current active chapter state (can transition to next chapter)
  const [currentChapterId, setCurrentChapterId] = useState<string>(chapterId || '');
  const [currentChapterNumber, setCurrentChapterNumber] = useState<string>(chapterNumber);

  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0); // 0-indexed
  const [readerMode, setReaderMode] = useState<ReaderMode>('single');
  const [theme, setTheme] = useState<ReaderTheme>('black');
  const [brightness, setBrightness] = useState<number>(100);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [preloadProgress, setPreloadProgress] = useState<{ loaded: number; total: number; percent: number }>({
    loaded: 0,
    total: 0,
    percent: 0
  });

  // Modo de Escala: 'fit' (Preencher/Página Inteira - padrão), 'fit-width' (Largura), 'fit-height' (Altura)
  const [scaleMode, setScaleMode] = useState<ScaleMode>(() => {
    try {
      const saved = localStorage.getItem('zreader_reader_scale_mode');
      if (saved === 'fit' || saved === 'fit-width' || saved === 'fit-height') {
        return saved;
      }
    } catch {}
    return 'fit';
  });

  useEffect(() => {
    try {
      localStorage.setItem('zreader_reader_scale_mode', scaleMode);
    } catch {}
  }, [scaleMode]);

  // Zoom on pages via Ctrl + mouse scroll, pinch-to-zoom or hotkeys
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 50% to 300%
  const [showZoomBadge, setShowZoomBadge] = useState(false);

  // Auto-hide floating zoom badge
  useEffect(() => {
    if (showZoomBadge) {
      const timer = setTimeout(() => setShowZoomBadge(false), 1600);
      return () => clearTimeout(timer);
    }
  }, [zoomLevel, showZoomBadge]);

  // Capture Ctrl + Wheel for zooming pages smoothly
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY < 0 ? 10 : -10;
        setZoomLevel(prev => Math.min(400, Math.max(50, prev + delta)));
        setShowZoomBadge(true);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Suporte a pinch-to-zoom em telas touch / mobile
  useEffect(() => {
    let initialPinchDistance = 0;
    let initialZoom = 100;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialPinchDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        initialZoom = zoomLevel;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistance > 0) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const scale = currentDistance / initialPinchDistance;
        const newZoom = Math.min(400, Math.max(50, Math.round((initialZoom * scale) / 5) * 5));
        setZoomLevel(newZoom);
        setShowZoomBadge(true);
      }
    };

    const handleTouchEnd = () => {
      initialPinchDistance = 0;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [zoomLevel]);

  const isMobile = useMemo(() => {
    return (
      typeof window !== 'undefined' &&
      (Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
        /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
        window.innerWidth < 640)
    );
  }, []);

  // Estados para Gestos Touch Fluidos (Swipe, Pan e Zoom nos Cantos)
  const [touchDragOffset, setTouchDragOffset] = useState<number>(0);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const [pageTransitionDirection, setPageTransitionDirection] = useState<'next' | 'prev' | null>(null);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const [zoomOrigin, setZoomOrigin] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const singlePageImgRef = useRef<HTMLImageElement>(null);
  const singleTapTimerRef = useRef<any>(null);

  const [chaptersList, setChaptersList] = useState<any[]>([]);
  const [isEndOfMangaModalOpen, setIsEndOfMangaModalOpen] = useState(false);
  const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [chapterLangFilter, setChapterLangFilter] = useState<'all' | 'pt-br' | 'en'>('all');

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isSavingPage, setIsSavingPage] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const webtoonContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<any>(null);

  // Estados para recarregar página atual, bypass de cache e Cache em Memória RAM
  const [reloadKeys, setReloadKeys] = useState<Record<number, number>>({});
  const [isReloadingPage, setIsReloadingPage] = useState(false);
  const [pageErrors, setPageErrors] = useState<Record<number, boolean>>({});
  const [ramCache, setRamCache] = useState<Record<number, string>>({});
  const [failAttempts, setFailAttempts] = useState<Record<number, number>>({});
  const [isFetchingRam, setIsFetchingRam] = useState<Record<number, boolean>>({});

  // Limpeza explícita: Garante que o Cache RAM seja deletado da memória 
  // ao desmontar o componente ou ao sair do capítulo atual.
  useEffect(() => {
    return () => {
      setRamCache({});
      setIsFetchingRam({});
    };
  }, [currentChapterId]);

  // Motor de rolagem Lenis: Ativo apenas em Desktop (em touch/mobile desativamos para permitir rolagem nativa a 120Hz fluida)
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const isTouchOrMobile =
      typeof window !== 'undefined' &&
      (('ontouchstart' in window) ||
        navigator.maxTouchPoints > 0 ||
        /android|iphone|ipad|ipod/i.test(navigator.userAgent));

    if (readerMode !== 'webtoon' || isLoading || !viewportRef.current || isTouchOrMobile) {
      if (lenisRef.current) {
        lenisRef.current.destroy();
        lenisRef.current = null;
      }
      return;
    }

    const wrapper = viewportRef.current;
    const content = webtoonContainerRef.current || (wrapper.firstElementChild as HTMLElement) || wrapper;

    const lenis = new Lenis({
      wrapper,
      content,
      autoRaf: true,
      smoothWheel: true,
      lerp: 0.12,
      duration: 0.85,
      wheelMultiplier: 1.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
    });

    lenisRef.current = lenis;

    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [readerMode, isLoading, currentChapterId]);

  // Recalcular dimensões do Lenis caso o usuário aplique Zoom no Webtoon
  useEffect(() => {
    if (readerMode === 'webtoon' && lenisRef.current) {
      const t = setTimeout(() => {
        lenisRef.current?.resize();
      }, 160);
      return () => clearTimeout(t);
    }
  }, [zoomLevel, readerMode]);

  // Sync prop changes if parent updates chapterId
  useEffect(() => {
    if (chapterId && chapterId !== currentChapterId) {
      setCurrentChapterId(chapterId);
      setCurrentChapterNumber(chapterNumber);
    }
  }, [chapterId, chapterNumber]);

  // Fetch all chapters of the manga to enable auto-advance to next chapter
  useEffect(() => {
    if (!mangaId) return;

    let isMounted = true;
    window.electronAPI.getMangaChapters(mangaId, ['pt-br', 'en'], 1000, 0, 'asc', true)
      .then((res: any) => {
        if (isMounted && res?.data && Array.isArray(res.data)) {
          // Sort chapters numerically ascending: e.g. 1, 2, 3, 3.5, 4...
          const sorted = [...res.data].sort((a, b) => {
            const numA = parseFloat(a.attributes?.chapter || '0');
            const numB = parseFloat(b.attributes?.chapter || '0');
            if (numA === numB) {
              return (a.attributes?.chapter || '').localeCompare(b.attributes?.chapter || '');
            }
            return numA - numB;
          });
          setChaptersList(sorted);
        }
      })
      .catch(console.error);

    return () => {
      isMounted = false;
    };
  }, [mangaId]);

  // Ensure webtoon mode always starts at the top of the chapter on load or chapter change
  useEffect(() => {
    if (readerMode === 'webtoon' && viewportRef.current) {
      viewportRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [readerMode, currentChapterId]);

  useEffect(() => {
    if (!isLoading && readerMode === 'webtoon' && viewportRef.current) {
      viewportRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [isLoading, readerMode]);

  // Filtered chapters for the in-reader chapter selector drawer
  const filteredChapters = useMemo(() => {
    return chaptersList.filter(chap => {
      if (chapterLangFilter !== 'all') {
        if (chap.attributes?.translatedLanguage !== chapterLangFilter) return false;
      }
      if (chapterSearch.trim()) {
        const q = chapterSearch.trim().toLowerCase();
        const num = (chap.attributes?.chapter || '').toLowerCase();
        const title = (chap.attributes?.title || '').toLowerCase();
        return num.includes(q) || title.includes(q);
      }
      return true;
    });
  }, [chaptersList, chapterLangFilter, chapterSearch]);

  const handleSelectChapter = (chap: any) => {
    const nextId = chap.id;
    const nextNum = chap.attributes?.chapter || '';
    setCurrentChapterId(nextId);
    setCurrentChapterNumber(nextNum);
    setCurrentPage(0);
    setIsChapterModalOpen(false);
    onChapterChange?.(nextId, nextNum);
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  };

  // Compute next chapter in the same language or overall list
  const nextChapter = useMemo(() => {
    if (chaptersList.length === 0 || !currentChapterId) return null;
    const current = chaptersList.find(c => c.id === currentChapterId);
    const lang = current?.attributes?.translatedLanguage;
    const sameLang = chaptersList.filter(c => !lang || c.attributes?.translatedLanguage === lang);
    const list = sameLang.length > 0 ? sameLang : chaptersList;
    const currentIdx = list.findIndex(c => c.id === currentChapterId);
    if (currentIdx >= 0 && currentIdx < list.length - 1) {
      return list[currentIdx + 1];
    }
    return null;
  }, [chaptersList, currentChapterId]);

  // Load and PRELOAD ALL pages before releasing access to reading
  useEffect(() => {
    if (!currentChapterId || !mangaId) return;

    // Limpar cache em RAM e estados de erro/tentativa ao trocar de capítulo
    setRamCache({});
    setFailAttempts({});
    setIsFetchingRam({});
    setPageErrors({});
    setReloadKeys({});

    let isMounted = true;

    const fetchAndPreloadPages = async () => {
      setIsLoading(true);
      setPreloadProgress({ loaded: 0, total: 0, percent: 0 });

      try {
        let urls: string[] = [];

        // 1. Check if downloaded locally for instant offline reading
        const offlinePages = await window.electronAPI.getOfflinePages(mangaId, currentChapterId);
        if (offlinePages && offlinePages.length > 0) {
          urls = offlinePages;
        } else {
          // 2. Fetch pages list from MangaDex@Home
          const atHomeRes = await window.electronAPI.getChapterPages(currentChapterId);
          if (atHomeRes?.pages && atHomeRes.pages.length > 0) {
            urls = atHomeRes.pages.map((p: any) => p.url);
          }
        }

        if (!isMounted) return;

        if (urls.length === 0) {
          setPages([]);
          setIsLoading(false);
          return;
        }

        setPages(urls);
        const total = urls.length;
        let loadedCount = 0;
        setPreloadProgress({ loaded: 0, total, percent: 0 });

        // Helper to preload a single image and update progress
        const preloadSingleImage = (url: string): Promise<void> => {
          return new Promise((resolve) => {
            const img = new Image();
            img.referrerPolicy = 'no-referrer';
            img.onload = () => {
              if (isMounted) {
                loadedCount++;
                setPreloadProgress({
                  loaded: loadedCount,
                  total,
                  percent: Math.round((loadedCount / total) * 100)
                });
              }
              resolve();
            };
            img.onerror = () => {
              if (isMounted) {
                loadedCount++;
                setPreloadProgress({
                  loaded: loadedCount,
                  total,
                  percent: Math.round((loadedCount / total) * 100)
                });
              }
              resolve();
            };
            img.src = url;
          });
        };

        // Preload in batches of 6 parallel requests for fast bufferless reading
        const BATCH_SIZE = 6;
        for (let i = 0; i < urls.length; i += BATCH_SIZE) {
          if (!isMounted) return;
          const batch = urls.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(preloadSingleImage));
        }

        // Restore last reading progress if available
        const progress = await window.electronAPI.getChapterProgress(currentChapterId);
        if (isMounted && progress?.last_page && progress.last_page > 0) {
          setCurrentPage(Math.min(progress.last_page - 1, total - 1));
        } else if (isMounted) {
          setCurrentPage(0);
        }

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Erro ao carregar e pré-carregar páginas do capítulo:', err);
        if (isMounted) setIsLoading(false);
      }
    };

    fetchAndPreloadPages();

    return () => {
      isMounted = false;
    };
  }, [currentChapterId, mangaId]);

  // Save progress & Mark Read on completion
  const handlePageChange = useCallback((newPage: number) => {
    if (pages.length === 0) return;
    const clamped = Math.max(0, Math.min(newPage, pages.length - 1));
    setCurrentPage(clamped);
    setZoomLevel(100);
    setZoomOrigin({ x: 50, y: 50 });
    setPanOffset({ x: 0, y: 0 });

    if (currentChapterId && mangaId) {
      window.electronAPI.saveReadingProgress({
        chapter_id: currentChapterId,
        manga_id: mangaId,
        last_page: clamped + 1,
        read_at: Date.now(),
        synced_to_mangadex: 1
      });

      // Auto mark read if user reaches the last page
      if (clamped === pages.length - 1) {
        window.electronAPI.markChapterRead(currentChapterId).catch(() => {});
      }
    }
  }, [pages.length, currentChapterId, mangaId]);

  // Advance to next chapter or show End-of-Manga modal if already at the newest chapter
  const goToNextChapter = useCallback(() => {
    if (nextChapter) {
      const nextId = nextChapter.id;
      const nextNum = nextChapter.attributes?.chapter || '';
      setCurrentChapterId(nextId);
      setCurrentChapterNumber(nextNum);
      setCurrentPage(0);
      onChapterChange?.(nextId, nextNum);
    } else {
      setIsEndOfMangaModalOpen(true);
    }
  }, [nextChapter, onChapterChange]);

  // Next page action (strictly Occidental LTR): jumps to next chapter if on the last page!
  const goNext = useCallback(() => {
    if (pages.length === 0) return;
    const step = readerMode === 'double' ? 2 : 1;
    const targetPage = currentPage + step;

    if (targetPage >= pages.length) {
      // Reached the end of the chapter! Jump straight to the next chapter or trigger end modal
      goToNextChapter();
      return;
    }

    handlePageChange(targetPage);
  }, [currentPage, readerMode, pages.length, handlePageChange, goToNextChapter]);

  // Prev page action
  const goPrev = useCallback(() => {
    const step = readerMode === 'double' ? 2 : 1;
    handlePageChange(currentPage - step);
  }, [currentPage, readerMode, handlePageChange]);

  // Transições animadas ultra-suaves para mudança de página
  const triggerAnimatedNext = useCallback(() => {
    setPageTransitionDirection('next');
    setTimeout(() => {
      goNext();
      setPageTransitionDirection(null);
    }, 130);
  }, [goNext]);

  const triggerAnimatedPrev = useCallback(() => {
    setPageTransitionDirection('prev');
    setTimeout(() => {
      goPrev();
      setPageTransitionDirection(null);
    }, 130);
  }, [goPrev]);

  // Aplica o zoom focado exatamente no canto ou ponto onde o usuário deu os dois toques
  const applyDoubleTapZoom = useCallback((clientX: number, clientY: number) => {
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }

    if (zoomLevel > 100) {
      setZoomLevel(100);
      setZoomOrigin({ x: 50, y: 50 });
      setPanOffset({ x: 0, y: 0 });
      setShowZoomBadge(true);
      return;
    }

    const img = singlePageImgRef.current;
    let originX = 50;
    let originY = 50;

    if (img) {
      const rect = img.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const rawX = ((clientX - rect.left) / rect.width) * 100;
        const rawY = ((clientY - rect.top) / rect.height) * 100;
        originX = Math.max(0, Math.min(100, Math.round(rawX)));
        originY = Math.max(0, Math.min(100, Math.round(rawY)));
      }
    }

    setZoomOrigin({ x: originX, y: originY });
    setZoomLevel(200);
    setPanOffset({ x: 0, y: 0 });
    setShowZoomBadge(true);
  }, [zoomLevel]);

  // Gestos de toque na página (Swipe horizontal, Pan em zoom e Double-Tap Zoom no canto)
  const handleReaderTouchStart = (e: React.TouchEvent) => {
    if (readerMode === 'webtoon' || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;

    // Detector de toque duplo no canto ou na página
    if (timeSinceLastTap > 30 && timeSinceLastTap < 320 && touchStartRef.current) {
      const dist = Math.hypot(clientX - touchStartRef.current.x, clientY - touchStartRef.current.y);
      if (dist < 50) {
        e.preventDefault();
        applyDoubleTapZoom(clientX, clientY);
        lastTapTimeRef.current = 0;
        touchStartRef.current = null;
        setIsTouchDragging(false);
        setTouchDragOffset(0);
        return;
      }
    }

    touchStartRef.current = { x: clientX, y: clientY, time: now };
    lastTapTimeRef.current = now;
    initialPanRef.current = { ...panOffset };
  };

  const handleReaderTouchMove = (e: React.TouchEvent) => {
    if (readerMode === 'webtoon' || !touchStartRef.current || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Se estiver com Zoom ativo (> 100%), o arrasto move a imagem ampliada (Pan)
    if (zoomLevel > 100) {
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        setPanOffset({
          x: initialPanRef.current.x + deltaX,
          y: initialPanRef.current.y + deltaY
        });
      }
      return;
    }

    // Se estiver em 100%, o arrasto horizontal move a página (Swipe)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      setIsTouchDragging(true);
      const isFirstPage = currentPage === 0 && deltaX > 0;
      const isLastPage = currentPage >= pages.length - 1 && deltaX < 0;
      const resistance = (isFirstPage || isLastPage) ? 0.3 : 0.85;
      setTouchDragOffset(deltaX * resistance);
    }
  };

  const handleReaderTouchEnd = () => {
    if (zoomLevel > 100) {
      touchStartRef.current = null;
      return;
    }

    if (isTouchDragging) {
      if (touchDragOffset < -45) {
        triggerAnimatedNext();
      } else if (touchDragOffset > 45) {
        triggerAnimatedPrev();
      }
      setTouchDragOffset(0);
      setIsTouchDragging(false);
      touchStartRef.current = null;
      return;
    }

    touchStartRef.current = null;
  };

  // Gerenciador de toques com debounce de 240ms para permitir toque duplo nos cantos sem virar página
  const handleZoneTap = useCallback((action: 'prev' | 'toggle' | 'next', e: React.MouseEvent) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;

    // Se foi um clique duplo com mouse no PC:
    if (timeSinceLastTap > 30 && timeSinceLastTap < 320) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      applyDoubleTapZoom(e.clientX, e.clientY);
      lastTapTimeRef.current = 0;
      return;
    }

    lastTapTimeRef.current = now;

    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
    }

    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      if (action === 'prev') {
        triggerAnimatedPrev();
      } else if (action === 'next') {
        triggerAnimatedNext();
      } else {
        setShowControls(prev => !prev);
      }
    }, 240);
  }, [triggerAnimatedPrev, triggerAnimatedNext, applyDoubleTapZoom]);

  // Rastrear dinamicamente a página visível no modo Webtoon conforme a rolagem desce
  useEffect(() => {
    if (readerMode !== 'webtoon' || isLoading || pages.length === 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    let timeoutId: any = null;
    const handleScroll = () => {
      if (timeoutId) return;
      timeoutId = setTimeout(() => {
        timeoutId = null;
        if (!viewport) return;

        const viewportRect = viewport.getBoundingClientRect();
        const targetY = viewportRect.top + viewportRect.height * 0.35;

        const pageNodes = viewport.querySelectorAll('[data-page-index]');
        let closestIndex = 0;
        let minDiff = Infinity;

        pageNodes.forEach((node) => {
          const rect = node.getBoundingClientRect();
          const nodeCenter = rect.top + rect.height * 0.5;
          const diff = Math.abs(nodeCenter - targetY);
          if (diff < minDiff) {
            minDiff = diff;
            const idxStr = node.getAttribute('data-page-index');
            if (idxStr !== null) {
              closestIndex = parseInt(idxStr, 10);
            }
          }
        });

        if (closestIndex !== currentPage) {
          handlePageChange(closestIndex);
        }
      }, 80);
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [readerMode, isLoading, pages.length, currentPage, handlePageChange]);

  // Baixa rapidamente a imagem diretamente via Node.js para a memória RAM de forma transparente
  const fetchPageToRamCache = useCallback(async (pageIdx: number) => {
    const rawUrl = pages[pageIdx];
    if (!rawUrl) return;
    if (ramCache[pageIdx] || isFetchingRam[pageIdx]) return;

    setIsFetchingRam(prev => ({ ...prev, [pageIdx]: true }));
    setSaveToast(`Recarregando imagem da página ${pageIdx + 1}...`);

    try {
      const cleanUrl = rawUrl.split('?')[0];
      const res = await window.electronAPI.fetchPageImage(cleanUrl);

      if (res.success && res.dataUrl) {
        setRamCache(prev => ({ ...prev, [pageIdx]: res.dataUrl! }));
        setPageErrors(prev => {
          const next = { ...prev };
          delete next[pageIdx];
          return next;
        });
        setSaveToast(null);
      } else {
        throw new Error(res.error || 'Falha ao recarregar imagem');
      }
    } catch (err: any) {
      console.error(`Erro ao recarregar página ${pageIdx + 1}:`, err);
      setSaveToast(`Erro ao carregar página ${pageIdx + 1}`);
      setTimeout(() => setSaveToast(null), 3000);
    } finally {
      setIsFetchingRam(prev => ({ ...prev, [pageIdx]: false }));
    }
  }, [pages, ramCache, isFetchingRam]);

  // Registra falha de carregamento da imagem e ativa o download interno se atingir 3 tentativas
  const handleImageError = useCallback((idx: number) => {
    if (ramCache[idx]) {
      setPageErrors(prev => ({ ...prev, [idx]: true }));
      return;
    }

    setPageErrors(prev => ({ ...prev, [idx]: true }));
    setFailAttempts(prev => {
      const currentCount = prev[idx] || 0;
      const nextCount = currentCount + 1;
      if (nextCount >= 3 && !ramCache[idx] && !isFetchingRam[idx]) {
        // Dispara de forma transparente o download acelerado na 3ª falha
        setTimeout(() => {
          fetchPageToRamCache(idx);
        }, 80);
      }
      return { ...prev, [idx]: nextCount };
    });
  }, [ramCache, isFetchingRam, fetchPageToRamCache]);

  // Recarregar a página atual (dispara mecanismo interno na 3ª tentativa de forma transparente)
  const handleReloadCurrentPage = useCallback(() => {
    const targetIdx = currentPage;
    const nextCount = (failAttempts[targetIdx] || 0) + 1;
    setFailAttempts(prev => ({ ...prev, [targetIdx]: nextCount }));

    if (nextCount >= 3) {
      fetchPageToRamCache(targetIdx);
      return;
    }

    setIsReloadingPage(true);
    const now = Date.now();

    setReloadKeys(prev => ({
      ...prev,
      [targetIdx]: now
    }));

    setPageErrors(prev => {
      const next = { ...prev };
      delete next[targetIdx];
      return next;
    });

    setSaveToast(`Recarregando imagem da página ${targetIdx + 1}...`);
    setTimeout(() => {
      setIsReloadingPage(false);
      setSaveToast(null);
    }, 1500);
  }, [currentPage, failAttempts, fetchPageToRamCache]);

  // Recarregar uma página específica que falhou
  const handleReloadSpecificPage = useCallback((idx: number) => {
    const nextCount = (failAttempts[idx] || 0) + 1;
    setFailAttempts(prev => ({ ...prev, [idx]: nextCount }));

    if (nextCount >= 3) {
      fetchPageToRamCache(idx);
      return;
    }

    const now = Date.now();
    setReloadKeys(prev => ({
      ...prev,
      [idx]: now
    }));

    setPageErrors(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });

    setSaveToast(`Recarregando imagem da página ${idx + 1}...`);
    setTimeout(() => {
      setSaveToast(null);
    }, 1500);
  }, [failAttempts, fetchPageToRamCache]);

  // Retorna a URL final da imagem priorizando o Cache em Memória RAM
  const getImageSource = useCallback((idx: number) => {
    if (ramCache[idx]) {
      return ramCache[idx];
    }
    const rawUrl = pages[idx];
    if (!rawUrl) return '';
    const reloadKey = reloadKeys[idx];
    if (!reloadKey) return rawUrl;
    const separator = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${separator}retry=${reloadKey}`;
  }, [ramCache, pages, reloadKeys]);

  // Keyboard Navigation: ArrowUp & ArrowRight advance; ArrowDown & ArrowLeft go back!
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();

      if (e.key === 'Escape') {
        if (isChapterModalOpen) {
          setIsChapterModalOpen(false);
          return;
        }
        if (isEndOfMangaModalOpen) {
          setIsEndOfMangaModalOpen(false);
          return;
        }
        onClose();
        return;
      }
      if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
        e.preventDefault();
        window.electronAPI.toggleFullscreen().then(setIsFullscreen);
        return;
      }

      // Atalhos de Zoom: Ctrl + '+' / Ctrl + '-' / Ctrl + '0'
      if (e.ctrlKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setZoomLevel(z => Math.min(400, z + 10));
          setShowZoomBadge(true);
          return;
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setZoomLevel(z => Math.max(50, z - 10));
          setShowZoomBadge(true);
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          setZoomLevel(100);
          setShowZoomBadge(true);
          return;
        }
      }

      if (isLoading || isEndOfMangaModalOpen || isChapterModalOpen) return;

      // Navegação por setas e teclado ultra-fluida com Lenis no Webtoon:
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (readerMode === 'webtoon') {
          if (lenisRef.current) {
            const current = lenisRef.current.scroll;
            lenisRef.current.scrollTo(current + 240, {
              duration: 0.35,
              easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
            });
          } else if (viewportRef.current) {
            viewportRef.current.scrollTop += 240;
          }
        } else {
          goPrev();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (readerMode === 'webtoon') {
          if (lenisRef.current) {
            const current = lenisRef.current.scroll;
            lenisRef.current.scrollTo(current - 240, {
              duration: 0.35,
              easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
            });
          } else if (viewportRef.current) {
            viewportRef.current.scrollTop -= 240;
          }
        } else {
          goNext();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (readerMode === 'webtoon') {
          if (lenisRef.current) {
            const current = lenisRef.current.scroll;
            lenisRef.current.scrollTo(current + 380, {
              duration: 0.4,
              easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
            });
          } else if (viewportRef.current) {
            viewportRef.current.scrollTop += 380;
          }
        } else {
          goNext();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (readerMode === 'webtoon') {
          if (lenisRef.current) {
            const current = lenisRef.current.scroll;
            lenisRef.current.scrollTo(current - 380, {
              duration: 0.4,
              easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
            });
          } else if (viewportRef.current) {
            viewportRef.current.scrollTop -= 380;
          }
        } else {
          goPrev();
        }
      } else if (e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        if (readerMode === 'webtoon') {
          const jump = (viewportRef.current?.clientHeight || 600) * 0.85;
          if (lenisRef.current) {
            lenisRef.current.scrollTo(lenisRef.current.scroll + jump, { duration: 0.45 });
          } else if (viewportRef.current) {
            viewportRef.current.scrollTop += jump;
          }
        } else {
          goNext();
        }
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        if (readerMode === 'webtoon') {
          const jump = (viewportRef.current?.clientHeight || 600) * 0.85;
          if (lenisRef.current) {
            lenisRef.current.scrollTo(lenisRef.current.scroll - jump, { duration: 0.45 });
          } else if (viewportRef.current) {
            viewportRef.current.scrollTop -= jump;
          }
        } else {
          goPrev();
        }
      } else if (e.key === 'Home') {
        if (readerMode === 'webtoon' && lenisRef.current) {
          e.preventDefault();
          lenisRef.current.scrollTo(0, { duration: 0.6 });
        }
      } else if (e.key === 'End') {
        if (readerMode === 'webtoon' && lenisRef.current) {
          e.preventDefault();
          lenisRef.current.scrollTo(lenisRef.current.limit, { duration: 0.6 });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readerMode, goNext, goPrev, onClose, isLoading, isEndOfMangaModalOpen, isChapterModalOpen]);

  // Mouse activity timer for hiding top/bottom controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setShowSettingsMenu(false);
    }, 3500);
  };

  // Save current page locally like a clean snapshot ("print")
  const handleSaveCurrentPage = async () => {
    const currentUrl = ramCache[currentPage] || pages[currentPage];
    if (!currentUrl) return;

    setIsSavingPage(true);
    try {
      const cleanTitle = mangaTitle.replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_');
      const defaultName = `${cleanTitle}_Cap${currentChapterNumber}_Pag${currentPage + 1}.jpg`;
      const res = await window.electronAPI.saveCurrentPage(currentUrl, defaultName);
      if (res.success && res.filePath) {
        setSaveToast(`Página ${currentPage + 1} salva com sucesso!`);
        setTimeout(() => setSaveToast(null), 3500);
      } else if (res.error) {
        setSaveToast(`Erro: ${res.error}`);
        setTimeout(() => setSaveToast(null), 3500);
      }
    } catch (err: any) {
      setSaveToast(err?.message || 'Erro ao salvar a página atual.');
      setTimeout(() => setSaveToast(null), 3500);
    } finally {
      setIsSavingPage(false);
    }
  };

  if (!chapterId && !currentChapterId) return null;

  // Background style based on theme
  const themeBgClass =
    theme === 'black'
      ? 'bg-black text-slate-100'
      : theme === 'dark'
      ? 'bg-slate-950 text-slate-100'
      : theme === 'sepia'
      ? 'bg-[#f4ecd8] text-[#433422]'
      : 'bg-white text-slate-900';

  return (
    <div
      ref={containerRef}
      data-reader-modal="true"
      onMouseMove={handleMouseMove}
      className={`fixed inset-0 z-[10000] select-none flex flex-col overflow-hidden transition-colors duration-300 ${themeBgClass}`}
    >
      {/* Night brightness filter overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-40 transition-opacity duration-200"
        style={{
          backgroundColor: '#000000',
          opacity: (100 - brightness) / 100
        }}
      />

      {/* Floating Toast Feedback for Saving Page */}
      {saveToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl bg-background-card/95 border border-primary/40 shadow-2xl backdrop-blur-md text-xs font-semibold text-slate-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200">
          <CheckCircle weight="bold" className="w-4 h-4 text-accent-emerald shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Top Controls Bar */}
      <header
        className={`h-[calc(3.25rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] px-3 sm:px-4 fixed top-0 inset-x-0 z-50 flex items-center justify-between bg-black/92 sm:bg-black/85 backdrop-blur-xl border-b border-white/10 transition-transform duration-300 ${
          showControls ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 active:bg-white/25 hover:bg-white/20 flex items-center justify-center text-white transition-all shrink-0 active:scale-95"
            title="Sair do leitor (Esc)"
          >
            <X weight="bold" className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex flex-col">
            <h2 className="text-xs font-bold text-white truncate max-w-[140px] sm:max-w-xs md:max-w-md">
              {mangaTitle}
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="font-semibold text-primary">Cap. {currentChapterNumber}</span>
              {pages.length > 0 && <span>• {currentPage + 1}/{pages.length}</span>}
            </div>
          </div>
        </div>

        {/* Center: Mode Selectors (Ocidental Single, Double, Webtoon - Desktop) */}
        {!isLoading && (
          <div className="hidden md:flex items-center gap-1 bg-white/10 p-1 rounded-xl">
            <button
              onClick={() => setReaderMode('single')}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                readerMode === 'single' ? 'bg-primary text-[#0D0A0E] font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="Página Única (Ocidental)"
            >
              <Square weight="bold" className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setReaderMode('double')}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                readerMode === 'double' ? 'bg-primary text-[#0D0A0E] font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="Página Dupla (Ocidental)"
            >
              <Columns weight="bold" className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setReaderMode('webtoon')}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                readerMode === 'webtoon' ? 'bg-primary text-[#0D0A0E] font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="Rolagem Contínua (Webtoon)"
            >
              <Scroll weight="bold" className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Botão de Ver Todos os Capítulos */}
          <button
            type="button"
            onClick={() => setIsChapterModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/10 active:bg-white/25 hover:bg-white/20 border border-white/10 text-slate-200 hover:text-white transition-all text-xs font-semibold shrink-0 active:scale-95"
            title="Ver todos os capítulos disponíveis e trocar"
          >
            <Funnel weight="bold" className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Capítulos</span>
            <span className="text-[10px] font-mono text-[#0D0A0E] font-bold px-1.5 py-0.5 rounded bg-primary">
              {chaptersList.length || '...'}
            </span>
          </button>

          {/* Desktop Only: Botão Recarregar Página Atual */}
          {!isLoading && pages.length > 0 && (
            <button
              type="button"
              onClick={handleReloadCurrentPage}
              disabled={isReloadingPage || isFetchingRam[currentPage]}
              className="hidden sm:flex px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 hover:border-accent-cyan/40 text-slate-200 hover:text-white text-xs font-medium items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
              title={`Recarregar a imagem da página atual (${currentPage + 1})`}
            >
              <ArrowClockwise weight="bold" className={`w-3.5 h-3.5 text-accent-cyan ${(isReloadingPage || isFetchingRam[currentPage]) ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Recarregar</span>
            </button>
          )}

          {/* Desktop Only: Botão Baixar Página Atual */}
          {!isLoading && pages.length > 0 && (
            <button
              type="button"
              onClick={handleSaveCurrentPage}
              disabled={isSavingPage}
              className="hidden sm:flex px-2.5 py-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary hover:text-white text-xs font-medium items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
              title="Salvar a imagem da página atual no seu computador"
            >
              <DownloadSimple weight="bold" className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Baixar</span>
            </button>
          )}

          {/* Settings Drawer Button */}
          {!isLoading && (
            <div className="relative">
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="w-9 h-9 rounded-xl bg-white/10 active:bg-white/25 hover:bg-white/20 flex items-center justify-center text-white transition-all active:scale-95"
                title="Ajustes de Leitura"
              >
                <Faders weight="bold" className="w-4 h-4 text-slate-200" />
              </button>

              {/* Dropdown Menu */}
              {showSettingsMenu && (
                <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] p-4 rounded-2xl bg-slate-900/95 backdrop-blur-2xl border border-white/15 shadow-2xl space-y-4 text-xs text-slate-200 z-50 animate-in fade-in zoom-in-95 duration-150">
                  {/* Modo de Leitura no Mobile */}
                  <div className="md:hidden">
                    <span className="block mb-1.5 text-[11px] text-slate-400">Modo de Leitura</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReaderMode('single')}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                          readerMode === 'single' ? 'border-primary bg-primary text-[#0D0A0E]' : 'border-white/10 bg-white/5 text-slate-400'
                        }`}
                      >
                        <Square weight="bold" className="w-3.5 h-3.5" />
                        <span>Página a Página</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReaderMode('webtoon')}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                          readerMode === 'webtoon' ? 'border-primary bg-primary text-[#0D0A0E]' : 'border-white/10 bg-white/5 text-slate-400'
                        }`}
                      >
                        <Scroll weight="bold" className="w-3.5 h-3.5" />
                        <span>Webtoon (Rolar)</span>
                      </button>
                    </div>
                  </div>

                  {/* Brightness Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Sun weight="bold" className="w-3.5 h-3.5 text-accent-amber" /> Brilho Noturno
                      </span>
                      <span>{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-primary h-2 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Theme Selector */}
                  <div>
                    <span className="block mb-1.5 text-[11px] text-slate-400">Tema de Fundo</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['black', 'dark', 'sepia', 'light'] as ReaderTheme[]).map(t => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={`py-1.5 rounded-lg border text-[10px] uppercase font-bold transition-all ${
                            theme === t ? 'border-primary bg-primary text-[#0D0A0E]' : 'border-white/10 bg-white/5 text-slate-400'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Escalonamento / Escala da Página */}
                  {readerMode !== 'webtoon' && (
                    <div>
                      <span className="block mb-1.5 text-[11px] text-slate-400">Escalonamento da Página</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setScaleMode('fit')}
                          className={`py-1.5 px-1 rounded-lg border text-[10px] font-bold transition-all flex flex-col items-center gap-1 ${
                            scaleMode === 'fit'
                              ? 'border-primary bg-primary text-[#0D0A0E]'
                              : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                          }`}
                          title="Preencher tela mostrando a página 100% inteira sem cortes"
                        >
                          <ArrowsInSimple weight="bold" className="w-3.5 h-3.5" />
                          <span>Preencher</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setScaleMode('fit-width')}
                          className={`py-1.5 px-1 rounded-lg border text-[10px] font-bold transition-all flex flex-col items-center gap-1 ${
                            scaleMode === 'fit-width'
                              ? 'border-primary bg-primary text-[#0D0A0E]'
                              : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                          }`}
                          title="Ajustar à largura da tela (rola verticalmente)"
                        >
                          <ArrowsOutLineHorizontal weight="bold" className="w-3.5 h-3.5" />
                          <span>Largura</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setScaleMode('fit-height')}
                          className={`py-1.5 px-1 rounded-lg border text-[10px] font-bold transition-all flex flex-col items-center gap-1 ${
                            scaleMode === 'fit-height'
                              ? 'border-primary bg-primary text-[#0D0A0E]'
                              : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                          }`}
                          title="Ajustar à altura da tela"
                        >
                          <ArrowsOutLineVertical weight="bold" className="w-3.5 h-3.5" />
                          <span>Altura</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Ações Rápidas (Mobile) */}
                  <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReloadCurrentPage}
                      disabled={isReloadingPage || isFetchingRam[currentPage]}
                      className="flex-1 py-2 px-2 rounded-xl bg-white/10 active:bg-white/20 border border-white/10 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <ArrowClockwise weight="bold" className={`w-3.5 h-3.5 text-accent-cyan ${(isReloadingPage || isFetchingRam[currentPage]) ? 'animate-spin' : ''}`} />
                      <span>Recarregar</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCurrentPage}
                      disabled={isSavingPage}
                      className="flex-1 py-2 px-2 rounded-xl bg-primary/20 active:bg-primary/30 border border-primary/40 text-primary text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <DownloadSimple weight="bold" className="w-3.5 h-3.5" />
                      <span>Baixar Img</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fullscreen (Desktop only) */}
          {!isMobile && (
            <button
              onClick={() => {
                window.electronAPI.toggleFullscreen().then(setIsFullscreen);
              }}
              className="hidden sm:flex w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 items-center justify-center text-white transition-colors"
              title="Tela cheia (F11 ou F)"
            >
              {isFullscreen ? <CornersIn weight="bold" className="w-4 h-4" /> : <CornersOut weight="bold" className="w-4 h-4" />}
            </button>
          )}
        </div>
      </header>

      {/* Floating Zoom Toast / Indicator */}
      {showZoomBadge && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[80] px-3.5 py-1.5 rounded-full bg-slate-900/90 backdrop-blur-md border border-white/20 text-white text-xs font-mono font-bold flex items-center gap-2 shadow-2xl animate-in fade-in zoom-in-90 duration-150 select-none">
          <MagnifyingGlassPlus weight="bold" className="w-3.5 h-3.5 text-primary" />
          <span>Zoom: {zoomLevel}%</span>
          {zoomLevel !== 100 && (
            <button
              onClick={() => {
                setZoomLevel(100);
                setShowZoomBadge(true);
              }}
              className="text-[10px] text-primary hover:underline ml-1 font-sans flex items-center gap-0.5"
              title="Redefinir zoom para 100%"
            >
              <ArrowCounterClockwise weight="bold" className="w-2.5 h-2.5" />
              <span>Redefinir</span>
            </button>
          )}
        </div>
      )}

      <main
        ref={viewportRef}
        className={`flex-1 min-h-0 w-full flex relative overflow-auto transition-all duration-300 ${
          showControls
            ? 'pt-[calc(3rem+env(safe-area-inset-top,0px))] pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]'
            : 'pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]'
        } ${
          readerMode === 'webtoon'
            ? zoomLevel > 100
              ? 'justify-start items-start'
              : 'justify-center items-start'
            : (zoomLevel > 100 || scaleMode === 'fit-width')
            ? 'justify-center items-start'
            : 'items-center justify-center'
        }`}
      >
        {/* Loading Screen: Gated until 100% of pages are loaded */}
        {isLoading ? (
          <div className="flex flex-col items-center max-w-md w-full px-6 py-8 mx-auto text-center space-y-5 bg-background-card border border-background-border rounded-xl shadow-2xl backdrop-blur-xl">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary animate-pulse">
                <BookOpen className="w-8 h-8" />
              </div>
              <div className="absolute -top-1 -right-1">
                <SpinnerGap className="w-6 h-6 animate-spin text-accent-cyan" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">Carregando Capítulo</h3>
              <p className="text-xs text-slate-400 line-clamp-1">
                {mangaTitle} • Capítulo {currentChapterNumber}
              </p>
            </div>

            {/* Progress Bar & Percentage */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>Páginas: {preloadProgress.loaded} de {preloadProgress.total}</span>
                <span className="text-primary font-mono">{preloadProgress.percent}%</span>
              </div>

              <div className="w-full h-2.5 bg-background-elevated rounded-full overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent-cyan transition-all duration-200 rounded-full"
                  style={{ width: `${preloadProgress.percent}%` }}
                />
              </div>

              <p className="text-[11px] text-slate-500 pt-1">
                O leitor será liberado automaticamente com 100% das imagens prontas para uma leitura sem travamentos.
              </p>
            </div>

            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              Cancelar Leitura
            </button>
          </div>
        ) : pages.length > 0 ? (
          readerMode === 'webtoon' ? (
            /* Continuous Vertical Scroll (Webtoon) with Zoom support */
            <div
              ref={webtoonContainerRef}
              className="m-auto flex flex-col items-center transition-[width] duration-150 shrink-0"
              style={{
                width: zoomLevel === 100 
                  ? 'min(100%, 46rem)' 
                  : `${(46 * (zoomLevel / 100)).toFixed(1)}rem`,
                minWidth: zoomLevel > 100 ? `${zoomLevel}%` : undefined,
                maxWidth: 'none'
              }}
            >
              {pages.map((_, idx) => (
                <div
                  key={idx}
                  data-page-index={idx}
                  className="w-full flex flex-col items-center relative min-h-[60px]"
                >
                  {isFetchingRam[idx] ? (
                    <div className="w-full my-6 p-8 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in">
                      <SpinnerGap className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-sm font-bold text-white">Carregando página {idx + 1}...</p>
                    </div>
                  ) : pageErrors[idx] ? (
                    <div className="w-full my-4 p-8 rounded-xl bg-white/5 border border-accent-rose/30 flex flex-col items-center justify-center text-center space-y-3">
                      <WarningCircle className="w-8 h-8 text-accent-rose animate-pulse" />
                      <div>
                        <p className="text-sm font-bold text-white">
                          Página {idx + 1} não carregou
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          O servidor CDN oscilou ou demorou a responder ao navegador.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReloadSpecificPage(idx)}
                        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 transition-all border border-white/10"
                      >
                        <ArrowClockwise className="w-3.5 h-3.5" />
                        <span>Recarregar página</span>
                      </button>
                    </div>
                  ) : (
                    <img
                      key={`${idx}-${reloadKeys[idx] || 0}-${ramCache[idx] ? 'ram' : 'net'}`}
                      src={getImageSource(idx)}
                      alt={`Página ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      onError={() => handleImageError(idx)}
                      onLoad={() => {
                        setPageErrors(prev => {
                          if (!prev[idx]) return prev;
                          const next = { ...prev };
                          delete next[idx];
                          return next;
                        });
                      }}
                      className="w-full object-contain reader-image"
                    />
                  )}
                </div>
              ))}

              {/* End of chapter card in webtoon mode */}
              <div className="w-full my-8 p-6 rounded-xl bg-background-card border border-background-border text-center space-y-3">
                <p className="text-xs text-slate-400">Você chegou ao final do Capítulo {currentChapterNumber}!</p>
                {nextChapter ? (
                  <button
                    onClick={goToNextChapter}
                    className="px-5 py-2.5 rounded-md bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-bold inline-flex items-center gap-2 transition-all shadow-sm"
                  >
                    <span>Ir para o Capítulo {nextChapter.attributes?.chapter || 'Próximo'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setIsEndOfMangaModalOpen(true)}
                    className="px-5 py-2.5 rounded-md bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-bold inline-flex items-center gap-2 transition-all shadow-sm"
                  >
                    <span>Final da Obra</span>
                  </button>
                )}
              </div>
            </div>
          ) : readerMode === 'double' ? (
            /* Double Page (Spread) with Zoom support */
            <div
              className={`m-auto flex items-center justify-center select-none gap-2 sm:gap-3 flex-row ${
                zoomLevel > 100 || scaleMode === 'fit-width'
                  ? 'min-w-full min-h-full p-2 sm:p-4'
                  : 'w-full h-full max-w-full max-h-full p-0.5 sm:p-2'
              }`}
            >
              {/* Left Page (currentPage) */}
              {isFetchingRam[currentPage] ? (
                <div className="p-8 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in">
                  <SpinnerGap className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs font-bold text-white">Carregando página {currentPage + 1}...</p>
                </div>
              ) : pageErrors[currentPage] ? (
                <div className="p-8 rounded-xl bg-white/5 border border-accent-rose/30 flex flex-col items-center text-center space-y-3">
                  <WarningCircle className="w-8 h-8 text-accent-rose animate-pulse" />
                  <div>
                    <p className="text-xs font-bold text-white">Página {currentPage + 1} não carregou</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReloadSpecificPage(currentPage)}
                    className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm border border-white/10"
                  >
                    <ArrowClockwise className="w-3.5 h-3.5" />
                    <span>Recarregar</span>
                  </button>
                </div>
              ) : (
                <img
                  key={`${currentPage}-${reloadKeys[currentPage] || 0}-${ramCache[currentPage] ? 'ram' : 'net'}`}
                  src={getImageSource(currentPage)}
                  alt={`Página ${currentPage + 1}`}
                  referrerPolicy="no-referrer"
                  onError={() => handleImageError(currentPage)}
                  onLoad={() => {
                    setPageErrors(prev => {
                      if (!prev[currentPage]) return prev;
                      const next = { ...prev };
                      delete next[currentPage];
                      return next;
                    });
                  }}
                  style={{
                    maxHeight: zoomLevel > 100
                      ? 'none'
                      : scaleMode === 'fit-width'
                      ? 'none'
                      : showControls
                      ? 'calc(100dvh - 6.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'
                      : 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
                    maxWidth: zoomLevel > 100 ? 'none' : 'calc(50% - 0.5rem)',
                    width: zoomLevel > 100 ? `${zoomLevel / 2}%` : 'auto',
                    height: zoomLevel > 100
                      ? 'auto'
                      : scaleMode === 'fit-height'
                      ? showControls
                        ? 'calc(100dvh - 6.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'
                        : 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'
                      : 'auto',
                    objectFit: 'contain'
                  }}
                  className="reader-image shadow-2xl transition-[max-height,max-width] duration-150 shrink-0 select-none"
                />
              )}

              {/* Right Page (currentPage + 1) */}
              {currentPage + 1 < pages.length && (
                isFetchingRam[currentPage + 1] ? (
                  <div className="p-8 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in">
                    <SpinnerGap className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-xs font-bold text-white">Carregando página {currentPage + 2}...</p>
                  </div>
                ) : pageErrors[currentPage + 1] ? (
                  <div className="p-8 rounded-xl bg-white/5 border border-accent-rose/30 flex flex-col items-center text-center space-y-3">
                    <WarningCircle className="w-8 h-8 text-accent-rose animate-pulse" />
                    <div>
                      <p className="text-xs font-bold text-white">Página {currentPage + 2} não carregou</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReloadSpecificPage(currentPage + 1)}
                      className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm border border-white/10"
                    >
                      <ArrowClockwise className="w-3.5 h-3.5" />
                      <span>Recarregar</span>
                    </button>
                  </div>
                ) : (
                  <img
                    key={`${currentPage + 1}-${reloadKeys[currentPage + 1] || 0}-${ramCache[currentPage + 1] ? 'ram' : 'net'}`}
                    src={getImageSource(currentPage + 1)}
                    alt={`Página ${currentPage + 2}`}
                    referrerPolicy="no-referrer"
                    onError={() => handleImageError(currentPage + 1)}
                    onLoad={() => {
                      setPageErrors(prev => {
                        if (!prev[currentPage + 1]) return prev;
                        const next = { ...prev };
                        delete next[currentPage + 1];
                        return next;
                      });
                    }}
                    style={{
                      maxHeight: zoomLevel > 100
                        ? 'none'
                        : scaleMode === 'fit-width'
                        ? 'none'
                        : showControls
                        ? 'calc(100dvh - 6.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'
                        : 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
                      maxWidth: zoomLevel > 100 ? 'none' : 'calc(50% - 0.5rem)',
                      width: zoomLevel > 100 ? `${zoomLevel / 2}%` : 'auto',
                      height: zoomLevel > 100
                        ? 'auto'
                        : scaleMode === 'fit-height'
                        ? showControls
                          ? 'calc(100dvh - 6.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'
                          : 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'
                        : 'auto',
                      objectFit: 'contain'
                    }}
                    className="reader-image shadow-2xl transition-[max-height,max-width] duration-150 shrink-0 select-none"
                  />
                )
              )}
            </div>
          ) : (
            /* Single Page (Occidental) with Zoom support */
            <div
              onTouchStart={handleReaderTouchStart}
              onTouchMove={handleReaderTouchMove}
              onTouchEnd={handleReaderTouchEnd}
              className={`m-auto flex items-center justify-center select-none overflow-hidden ${
                zoomLevel > 100 || scaleMode === 'fit-width'
                  ? 'min-w-full min-h-full p-1 sm:p-4'
                  : 'w-full h-full max-w-full max-h-full p-0.5 sm:p-2'
              }`}
            >
              {isFetchingRam[currentPage] ? (
                <div className="p-8 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in">
                  <SpinnerGap className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm font-bold text-white">Carregando página {currentPage + 1}...</p>
                </div>
              ) : pageErrors[currentPage] ? (
                <div className="p-8 rounded-xl bg-white/5 border border-accent-rose/30 flex flex-col items-center text-center space-y-3">
                  <WarningCircle className="w-8 h-8 text-accent-rose animate-pulse" />
                  <div>
                    <p className="text-xs font-bold text-white">
                      Página {currentPage + 1} não carregou
                    </p>
                    <p className="text-xs text-slate-400 max-w-xs mt-0.5">
                      O servidor CDN oscilou ou demorou a responder ao navegador.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReloadSpecificPage(currentPage)}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 border border-white/10 transition-all shadow-sm"
                  >
                    <ArrowClockwise className="w-3.5 h-3.5" />
                    <span>Recarregar página</span>
                  </button>
                </div>
              ) : (
                <img
                  ref={singlePageImgRef}
                  key={`${currentPage}-${reloadKeys[currentPage] || 0}-${ramCache[currentPage] ? 'ram' : 'net'}`}
                  src={getImageSource(currentPage)}
                  alt={`Página ${currentPage + 1}`}
                  referrerPolicy="no-referrer"
                  onError={() => handleImageError(currentPage)}
                  onLoad={() => {
                    setPageErrors(prev => {
                      if (!prev[currentPage]) return prev;
                      const next = { ...prev };
                      delete next[currentPage];
                      return next;
                    });
                  }}
                  style={{
                    maxWidth: zoomLevel > 100 ? 'none' : '100%',
                    maxHeight: scaleMode === 'fit-width'
                      ? 'none'
                      : showControls
                      ? 'calc(100dvh - 6.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'
                      : 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
                    width: scaleMode === 'fit-width' ? '100%' : 'auto',
                    height: scaleMode === 'fit-height'
                      ? showControls
                        ? 'calc(100dvh - 6.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'
                        : 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'
                      : 'auto',
                    objectFit: 'contain',
                    transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                    transform: zoomLevel > 100
                      ? `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomLevel / 100})`
                      : isTouchDragging
                      ? `translate3d(${touchDragOffset}px, 0, 0) scale(1)`
                      : pageTransitionDirection === 'next'
                      ? 'translate3d(-24px, 0, 0) scale(1)'
                      : pageTransitionDirection === 'prev'
                      ? 'translate3d(24px, 0, 0) scale(1)'
                      : 'translate3d(0, 0, 0) scale(1)',
                    opacity: isTouchDragging
                      ? Math.max(0.65, 1 - Math.abs(touchDragOffset) / 450)
                      : pageTransitionDirection
                      ? 0.5
                      : 1,
                    transition: isTouchDragging || (zoomLevel > 100 && (Math.abs(panOffset.x) > 0 || Math.abs(panOffset.y) > 0))
                      ? 'none'
                      : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.16s ease-out',
                    willChange: isTouchDragging || pageTransitionDirection || zoomLevel > 100 ? 'transform, opacity' : 'auto'
                  }}
                  className="reader-image shadow-2xl select-none pointer-events-auto"
                />
              )}
            </div>
          )
        ) : (
          <div className="text-xs text-slate-500">Nenhuma página encontrada para este capítulo.</div>
        )}

        {/* Click/Touch zones for Occidental navigation */}
        {readerMode !== 'webtoon' && !isLoading && zoomLevel === 100 && (
          <>
            <div
              onClick={(e) => handleZoneTap('prev', e)}
              className="absolute left-0 inset-y-0 w-1/4 sm:w-1/3 cursor-w-resize z-20"
              title="Voltar página (dois toques para zoom no canto)"
            />
            <div
              onClick={(e) => handleZoneTap('toggle', e)}
              className="absolute left-1/4 sm:left-1/3 w-2/4 sm:w-1/3 inset-y-0 cursor-pointer z-20"
              title="Alternar controles (dois toques para zoom)"
            />
            <div
              onClick={(e) => handleZoneTap('next', e)}
              className="absolute right-0 inset-y-0 w-1/4 sm:w-1/3 cursor-e-resize z-20"
              title="Avançar página (dois toques para zoom no canto)"
            />
          </>
        )}
      </main>

      {/* Bottom Floating Navigation Bar */}
      {!isLoading && (
        <footer
          className={`min-h-[3.25rem] pb-[env(safe-area-inset-bottom,0px)] px-2 sm:px-6 fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-1 sm:gap-2 bg-black/90 backdrop-blur-md border-t border-white/10 transition-transform duration-300 ${
            showControls ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          {/* Botão Anterior */}
          <div className="flex items-center shrink-0">
            {readerMode !== 'webtoon' && (
              <button
                onClick={triggerAnimatedPrev}
                disabled={currentPage === 0}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-30 disabled:active:scale-100 text-white flex items-center justify-center transition-all shrink-0"
                title="Página Anterior (Seta Esquerda)"
              >
                <CaretLeft className="w-4 h-4 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>

          {/* Page Slider / Indicator */}
          <div className="flex-1 flex items-center justify-center gap-1 sm:gap-2.5 min-w-0 max-w-xs sm:max-w-md">
            {readerMode !== 'webtoon' && pages.length > 0 && (
              <>
                <span className="text-[10px] sm:text-xs font-bold text-slate-200 font-mono shrink-0 whitespace-nowrap">
                  {currentPage + 1}/{pages.length}
                </span>
                <input
                  type="range"
                  min={0}
                  max={pages.length - 1}
                  value={currentPage}
                  onChange={(e) => handlePageChange(Number(e.target.value))}
                  className="flex-1 min-w-[45px] max-w-[95px] sm:max-w-[200px] accent-primary h-1.5 sm:h-1 bg-white/25 rounded-lg cursor-pointer touch-none"
                />
              </>
            )}
          </div>

          {/* Ações Direitas: Escala, Zoom (Mobile + Desktop) e Próxima Página */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Modo de Escala Toggle Rápido (Preencher / Largura / Altura) */}
            {readerMode !== 'webtoon' && (
              <button
                type="button"
                onClick={() => {
                  setScaleMode(prev => {
                    const next = prev === 'fit' ? 'fit-width' : prev === 'fit-width' ? 'fit-height' : 'fit';
                    return next;
                  });
                }}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 transition-all shrink-0"
                title={`Modo de Escala: ${
                  scaleMode === 'fit'
                    ? 'Preencher (Página Inteira)'
                    : scaleMode === 'fit-width'
                    ? 'Ajustar Largura'
                    : 'Ajustar Altura'
                }. Clique para alternar.`}
              >
                {scaleMode === 'fit' ? (
                  <>
                    <ArrowsInSimple weight="bold" className="w-3.5 h-3.5 text-primary" />
                    <span className="hidden md:inline text-[11px]">Preencher</span>
                  </>
                ) : scaleMode === 'fit-width' ? (
                  <>
                    <ArrowsOutLineHorizontal weight="bold" className="w-3.5 h-3.5 text-accent-cyan" />
                    <span className="hidden md:inline text-[11px]">Largura</span>
                  </>
                ) : (
                  <>
                    <ArrowsOutLineVertical weight="bold" className="w-3.5 h-3.5 text-accent-amber" />
                    <span className="hidden md:inline text-[11px]">Altura</span>
                  </>
                )}
              </button>
            )}

            {/* Zoom Controls (Disponível no Mobile e Desktop) */}
            <div className="flex items-center bg-white/10 px-1 sm:px-1.5 py-1 rounded-xl border border-white/10 text-xs shrink-0">
              <button
                onClick={() => {
                  setZoomLevel(z => Math.max(50, z - 15));
                  setShowZoomBadge(true);
                }}
                className="p-1 text-slate-300 hover:text-white active:scale-90 rounded hover:bg-white/10 transition-all"
                title="Diminuir Zoom"
              >
                <MagnifyingGlassMinus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setZoomLevel(100);
                  setZoomOrigin({ x: 50, y: 50 });
                  setPanOffset({ x: 0, y: 0 });
                  setShowZoomBadge(true);
                }}
                className="px-1 sm:px-1.5 py-0.5 font-mono text-[10px] sm:text-[11px] font-semibold text-slate-200 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Clique para redefinir zoom para 100%"
              >
                {zoomLevel}%
              </button>
              <button
                onClick={() => {
                  setZoomLevel(z => Math.min(400, z + 15));
                  setShowZoomBadge(true);
                }}
                className="p-1 text-slate-300 hover:text-white active:scale-90 rounded hover:bg-white/10 transition-all"
                title="Aumentar Zoom"
              >
                <MagnifyingGlassPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Botão Próximo */}
            {readerMode !== 'webtoon' && (
              <button
                onClick={triggerAnimatedNext}
                className="w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-2 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 active:scale-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shrink-0"
                title={
                  currentPage >= pages.length - 1
                    ? nextChapter
                      ? `Pular para o Capítulo ${nextChapter.attributes?.chapter || 'Próximo'}`
                      : 'Capítulo mais recente da obra'
                    : 'Próxima Página (Seta Direita)'
                }
              >
                {currentPage >= pages.length - 1 ? (
                  nextChapter ? (
                    <>
                      <span className="hidden sm:inline text-[11px] font-bold text-primary">Cap. {nextChapter.attributes?.chapter || '→'}</span>
                      <CaretRight weight="bold" className="w-4 h-4 text-primary" />
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline text-[11px]">Fim</span>
                      <Sparkle weight="bold" className="w-3.5 h-3.5 text-accent-amber" />
                    </>
                  )
                ) : (
                  <CaretRight weight="bold" className="w-4 h-4 text-primary" />
                )}
              </button>
            )}
          </div>
        </footer>
      )}

      {/* Modal de Final de Obra / Capítulo Mais Recente */}
      {isEndOfMangaModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-md bg-background-card border border-background-border rounded-xl p-6 shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
              <Sparkle className="w-7 h-7 text-primary" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-white leading-snug">
                Que pena, você chegou no capítulo mais recente dessa obra...
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Você leu todos os capítulos disponíveis de <strong className="text-slate-200">{mangaTitle}</strong> até o momento! Fique de olho na MangaDex para as próximas atualizações.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsEndOfMangaModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-md bg-background-elevated hover:bg-background-hover text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                Rever Capítulo
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2 rounded-md bg-primary hover:bg-primary-hover text-xs font-bold text-[#0D0A0E] transition-all shadow-sm"
              >
                Voltar para Detalhes da Obra
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Drawer de Seleção Rápida de Capítulos Dentro do Reader */}
      {isChapterModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-lg bg-background-card border border-background-border rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-background-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Funnel className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Todos os Capítulos</h3>
                  <p className="text-[11px] text-slate-400 line-clamp-1">{mangaTitle}</p>
                </div>
              </div>
              <button
                onClick={() => setIsChapterModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                title="Fechar (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Busca & Filtro de Idiomas */}
            <div className="p-3 border-b border-background-border space-y-2 bg-background-elevated/40">
              <div className="relative">
                <MagnifyingGlass className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar capítulo por número ou título..."
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  className="w-full bg-background-card border border-background-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 mr-1">Idioma:</span>
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'pt-br', label: '🇧🇷 PT-BR' },
                  { id: 'en', label: '🇺🇸 EN' }
                ].map(lang => (
                  <button
                    key={lang.id}
                    onClick={() => setChapterLangFilter(lang.id as any)}
                    className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors border ${
                      chapterLangFilter === lang.id
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista com Rolagem */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-white/5">
              {filteredChapters.length > 0 ? (
                filteredChapters.map((chap) => {
                  const isCurrent = chap.id === currentChapterId;
                  const chapNum = chap.attributes?.chapter || 'Extra';
                  const chapTitle = chap.attributes?.title;
                  const lang = chap.attributes?.translatedLanguage;
                  const scanGroup = chap.relationships?.find((r: any) => r.type === 'scanlation_group')?.attributes?.name;

                  return (
                    <button
                      key={chap.id}
                      onClick={() => handleSelectChapter(chap)}
                      className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between transition-all group ${
                        isCurrent
                          ? 'bg-primary/15 border border-primary/30 text-white font-semibold shadow-sm'
                          : 'hover:bg-white/5 border border-transparent text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                          isCurrent ? 'bg-primary text-[#0D0A0E] font-bold' : 'bg-white/10 text-slate-400 group-hover:text-white'
                        }`}>
                          {chapNum}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-100 truncate">
                              Capítulo {chapNum}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-primary text-[#0D0A0E]">
                                Lendo agora
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 truncate">
                            {chapTitle && <span className="truncate italic">"{chapTitle}"</span>}
                            {scanGroup && <span>• {scanGroup}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-400">
                          {lang || 'pt-br'}
                        </span>
                        <CaretRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-primary transition-colors" />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  Nenhum capítulo encontrado para o filtro aplicado.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
