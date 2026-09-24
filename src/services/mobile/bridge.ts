import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { AppDatabaseMobile } from './database';
import { AppVaultMobile } from './vault';
import { MangaDexApiMobile } from './mangadex';
import { DownloadManagerMobile } from './downloads';

export function initMobileBridge() {
  if (typeof window === 'undefined') return;

  // If already in Electron desktop, do not override
  if (window.electronAPI && typeof (window as any).process !== 'undefined') {
    return;
  }

  const db = new AppDatabaseMobile();
  const vault = new AppVaultMobile();
  const api = new MangaDexApiMobile(vault, db);
  const downloads = new DownloadManagerMobile(db, api);

  let isFullscreen = false;

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.removeProperty('zoom');
  }

  const mobileAPI = {
    // UI Scale / Zoom (no mobile, não aplicamos style.zoom para não corromper o cálculo de viewport do Chromium)
    setZoomFactor: (_factor: number) => {
      // No-op seguro em WebView Android/iOS
    },
    getZoomFactor: () => 1,

    // Auth
    getProfile: () => vault.getProfile(),
    setupLocalProfile: (password: string, name?: string) => vault.saveLocalProfile(password, name),
    unlockLocalProfile: (password: string) => vault.unlockWithPassword(password),
    connectMangaDex: (clientId: string, clientSecret: string, username: string, password: string) =>
      api.loginWithPasswordGrant(clientId, clientSecret, username, password),
    getMangaDexStatus: async () => {
      const secrets = await vault.getMangaDexSecrets();
      return {
        connected: !!secrets && !!secrets.refreshToken,
        username: secrets?.username || null
      };
    },
    disconnectMangaDex: async () => {
      await vault.clearMangaDexSecrets();
      return { success: true };
    },
    resetApp: async () => {
      await vault.resetAllData();
      await db.clearAllData();
      return { success: true };
    },

    // MangaDex Browse & Details
    getPopularManga: (limit?: number, offset?: number, ratings?: string[]) =>
      api.getPopularManga(limit, offset, ratings),
    getLatestManga: (limit?: number, offset?: number, ratings?: string[]) =>
      api.getLatestUpdates(limit, offset, ratings),
    searchManga: (
      query: string,
      limit?: number,
      offset?: number,
      ratings?: string[],
      tags?: string[],
      tagsMode?: 'AND' | 'OR',
      order?: 'followedCount' | 'latestUploadedChapter' | 'relevance'
    ) => api.searchManga(query, limit, offset, ratings, tags, tagsMode, order),
    getMangaDetails: (mangaId: string) => api.getMangaDetails(mangaId),
    getMangaChapters: (mangaId: string, languages?: string[], limit?: number, offset?: number, order?: 'desc' | 'asc', fetchAll?: boolean) =>
      api.getMangaChapters(mangaId, languages, limit, offset, order, fetchAll),
    getChapterPages: (chapterId: string, dataSaver?: boolean) =>
      api.getChapterPages(chapterId, dataSaver),
    fetchPageImage: async (url: string) => {
      try {
        const parsed = new URL(url);
        const ALLOWED_IMAGE_HOSTS = [
          'mangadex.org',
          'mangadex.network',
          'uploads.mangadex.org',
          'api.mangadex.network'
        ];
        const isAllowed = ALLOWED_IMAGE_HOSTS.some(
          h => parsed.hostname === h || parsed.hostname.endsWith('.' + h)
        );
        if (!isAllowed || !['https:', 'http:'].includes(parsed.protocol)) {
          return { success: false, error: 'Host ou protocolo não permitido para imagens.' };
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        return new Promise<any>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({ success: true, dataUrl: reader.result as string });
          };
          reader.onerror = () => resolve({ success: false, error: 'Falha ao processar imagem' });
          reader.readAsDataURL(blob);
        });
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao buscar imagem' };
      }
    },
    saveCurrentPage: async (imageUrl: string, defaultFilename: string) => {
      try {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = defaultFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return { success: true, filePath: defaultFilename };
      } catch (e: any) {
        return { success: false, error: e?.message };
      }
    },

    // User Library & Actions
    getUserFollows: (limit?: number, offset?: number) => api.getUserFollowedManga(limit, offset),
    followManga: (mangaId: string) => api.followManga(mangaId),
    unfollowManga: (mangaId: string) => api.unfollowManga(mangaId),
    setMangaStatus: (mangaId: string, status: string | null) => api.setMangaStatus(mangaId, status),
    getUserReadingStatuses: () => api.getUserReadingStatuses(),
    getReadMarkers: (mangaId: string) => api.getMangaReadMarkers(mangaId),
    markChapterRead: (chapterId: string) => api.markChapterRead(chapterId),
    markChapterUnread: (chapterId: string) => api.markChapterUnread(chapterId),
    syncLibrary: () => api.syncUserLibrary(),

    // Local Database
    getLibrary: () => db.getLibrary(),
    getLibraryStatus: (mangaId: string) => db.getLibraryStatus(mangaId),
    saveReadingProgress: async (progress: { chapter_id: string; manga_id: string; last_page: number; read_at: number; synced_to_mangadex: number }) => {
      await db.saveReadingProgress(progress);
      return { success: true };
    },
    getChapterProgress: (chapterId: string) => db.getChapterProgress(chapterId),
    getMangaReadChapters: (mangaId: string) => db.getMangaReadChapters(mangaId),
    getSettings: () => db.getAllSettings(),
    setSetting: async (key: string, value: string) => {
      await db.setSetting(key, value);
      return { success: true };
    },

    // Downloads & Offline
    queueDownload: async (mangaId: string, chapterId: string, meta?: { mangaTitle?: string; mangaCover?: string; chapterNumber?: string; chapterTitle?: string }) => {
      await downloads.queueChapterDownload(mangaId, chapterId, meta);
      return { success: true };
    },
    pauseDownload: async (chapterId: string) => {
      await downloads.pauseDownload(chapterId);
      return { success: true };
    },
    resumeDownload: async (chapterId: string) => {
      await downloads.resumeDownload(chapterId);
      return { success: true };
    },
    deleteDownload: async (chapterId: string) => {
      await downloads.deleteDownload(chapterId);
      return { success: true };
    },
    getDownloads: () => db.getDownloads(),
    getStorageUsage: () => downloads.getStorageUsage(),
    getDownloadsPath: () => downloads.getDownloadsPath(),
    getOfflinePages: (mangaId: string, chapterId: string) => downloads.getOfflineChapterPages(mangaId, chapterId),
    openDownloadsFolder: async () => ({ success: true }),

    // Notifications
    getNotifications: (unreadOnly?: boolean) => db.getNotifications(unreadOnly),
    checkNotifications: () => api.checkLibraryNotifications(),
    markNotificationRead: async (chapterId: string) => {
      await db.markNotificationRead(chapterId);
      return { success: true };
    },
    markAllNotificationsRead: async () => {
      await db.markAllNotificationsRead();
      return { success: true };
    },
    getUnreadNotificationsCount: () => db.getUnreadNotificationsCount(),

    // System & Window Controls
    openExternal: async (url: string) => {
      window.open(url, '_blank');
      return { success: true };
    },
    selectDirectory: async () => null,
    minimize: () => {},
    maximize: () => {},
    close: () => {},
    toggleFullscreen: async () => {
      isFullscreen = !isFullscreen;
      if (Capacitor.isNativePlatform()) {
        try {
          if (isFullscreen) {
            await StatusBar.hide();
          } else {
            await StatusBar.show();
          }
        } catch {}
      } else {
        if (isFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else if (!isFullscreen && document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
      return isFullscreen;
    },
    onDeepLink: (_callback: (url: string) => void) => {
      return () => {};
    }
  };

  // Polyfill window.electronAPI
  (window as any).electronAPI = mobileAPI;
}
