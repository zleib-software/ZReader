import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { AppVault } from '../storage/vault';
import { AppDatabase } from '../storage/database';
import { MangaDexApi } from '../services/mangadex-api';
import { MangaDexHomeService } from '../services/mangadex-home';
import { DownloadManager } from '../services/download-manager';

export function registerIpcHandlers(
  vault: AppVault,
  db: AppDatabase,
  api: MangaDexApi,
  homeService: MangaDexHomeService,
  downloads: DownloadManager,
  mainWindow: BrowserWindow
) {
  // Auth Handlers
  ipcMain.handle('auth:getProfile', async () => {
    return vault.getProfile();
  });

  ipcMain.handle('auth:setupLocalProfile', async (_, password: string, name?: string) => {
    return vault.saveLocalProfile(password, name);
  });

  ipcMain.handle('auth:unlockLocalProfile', async (_, password: string) => {
    return vault.unlockWithPassword(password);
  });

  ipcMain.handle('auth:connectMangaDex', async (_, clientId: string, clientSecret: string, username: string, password: string) => {
    return await api.loginWithPasswordGrant(clientId, clientSecret, username, password);
  });

  ipcMain.handle('auth:getMangaDexStatus', async () => {
    const secrets = vault.getMangaDexSecrets();
    return {
      connected: !!secrets && !!secrets.refreshToken,
      username: secrets?.username || null
    };
  });

  ipcMain.handle('auth:disconnectMangaDex', async () => {
    vault.clearMangaDexSecrets();
    return { success: true };
  });

  ipcMain.handle('auth:resetApp', async () => {
    vault.resetAllData();
    db.clearAllData();
    return { success: true };
  });

  // MangaDex Browse & Details
  ipcMain.handle('mangadex:getPopular', async (_, limit?: number, offset?: number, ratings?: string[]) => {
    return await api.getPopularManga(limit, offset, ratings);
  });

  ipcMain.handle('mangadex:getLatest', async (_, limit?: number, offset?: number, ratings?: string[]) => {
    return await api.getLatestUpdates(limit, offset, ratings);
  });

  ipcMain.handle('mangadex:search', async (_, query: string, limit?: number, offset?: number, ratings?: string[], tags?: string[], tagsMode?: 'AND' | 'OR', order?: 'followedCount' | 'latestUploadedChapter' | 'relevance') => {
    return await api.searchManga(query, limit, offset, ratings, tags, tagsMode, order);
  });

  ipcMain.handle('mangadex:getDetails', async (_, mangaId: string) => {
    return await api.getMangaDetails(mangaId);
  });

  ipcMain.handle('mangadex:getChapters', async (_, mangaId: string, languages?: string[], limit?: number, offset?: number, order?: 'desc' | 'asc', fetchAll?: boolean) => {
    return await api.getMangaChapters(mangaId, languages, limit, offset, order, fetchAll);
  });

  ipcMain.handle('mangadex:getChapterPages', async (_, chapterId: string, dataSaver?: boolean) => {
    return await homeService.getChapterPages(chapterId, dataSaver);
  });

  ipcMain.handle('mangadex:fetchPageImage', async (_, url: string) => {
    try {
      const cleanUrl = url.split('?')[0];

      // SECURITY: Validate URL against allowlist to prevent SSRF attacks
      try {
        const parsed = new URL(cleanUrl);
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
          return { success: false, error: 'Host ou protocolo não permitido para carregamento de imagens.' };
        }
      } catch {
        return { success: false, error: 'URL inválida.' };
      }

      // 1. Tentar via homeService (com relatório para a rede MangaDex)
      let buffer: Buffer | null = null;
      try {
        const res = await homeService.fetchPageWithReport(cleanUrl, false);
        if (res.success && res.buffer) {
          buffer = res.buffer;
        }
      } catch (err) {
        console.warn('Falha no homeService.fetchPageWithReport:', err);
      }

      // 2. Fallback direto via Node.js fetch caso o nó MD@Home oscile (mesmo método do download/salvar)
      if (!buffer) {
        const directRes = await fetch(cleanUrl, {
          headers: {
            'User-Agent': 'ZReader/2.0.10'
          }
        });
        if (directRes.ok) {
          const arrayBuf = await directRes.arrayBuffer();
          buffer = Buffer.from(arrayBuf);
        }
      }

      if (buffer && buffer.byteLength > 0) {
        // Detectar MIME type pelos magic bytes do buffer
        let mime = 'image/jpeg';
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
          mime = 'image/png';
        } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
          mime = 'image/webp';
        } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
          mime = 'image/gif';
        }

        return {
          success: true,
          dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
        };
      }

      return { success: false, error: 'Não foi possível obter a imagem da página' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao carregar imagem' };
    }
  });

  // User Library & Interactions
  ipcMain.handle('mangadex:getUserFollows', async (_, limit?: number, offset?: number) => {
    return await api.getUserFollowedManga(limit, offset);
  });

  ipcMain.handle('mangadex:followManga', async (_, mangaId: string) => {
    return await api.followManga(mangaId);
  });

  ipcMain.handle('mangadex:unfollowManga', async (_, mangaId: string) => {
    return await api.unfollowManga(mangaId);
  });

  ipcMain.handle('mangadex:setMangaStatus', async (_, mangaId: string, status: string | null) => {
    return await api.setMangaStatus(mangaId, status);
  });

  ipcMain.handle('mangadex:getUserReadingStatuses', async () => {
    return await api.getUserReadingStatuses();
  });

  ipcMain.handle('mangadex:getReadMarkers', async (_, mangaId: string) => {
    return await api.getMangaReadMarkers(mangaId);
  });

  ipcMain.handle('mangadex:markChapterRead', async (_, chapterId: string) => {
    return await api.markChapterRead(chapterId);
  });

  ipcMain.handle('mangadex:markChapterUnread', async (_, chapterId: string) => {
    return await api.markChapterUnread(chapterId);
  });

  ipcMain.handle('mangadex:syncLibrary', async () => {
    return await api.syncUserLibrary();
  });

  // Local Database
  ipcMain.handle('db:getLibrary', async () => {
    return db.getLibrary();
  });

  ipcMain.handle('db:getLibraryStatus', async (_, mangaId: string) => {
    return db.getLibraryStatus(mangaId);
  });

  ipcMain.handle('db:saveReadingProgress', async (_, progress: { chapter_id: string; manga_id: string; last_page: number; read_at: number; synced_to_mangadex: number }) => {
    db.saveReadingProgress(progress);
    return { success: true };
  });

  ipcMain.handle('db:getChapterProgress', async (_, chapterId: string) => {
    return db.getChapterProgress(chapterId);
  });

  ipcMain.handle('db:getMangaReadChapters', async (_, mangaId: string) => {
    return db.getMangaReadChapters(mangaId);
  });

  ipcMain.handle('db:getSettings', async () => {
    return db.getAllSettings();
  });

  ipcMain.handle('db:setSetting', async (_, key: string, value: string) => {
    db.setSetting(key, value);
    return { success: true };
  });

  // Downloads
  ipcMain.handle('downloads:queue', async (_, mangaId: string, chapterId: string, meta?: any) => {
    downloads.queueChapterDownload(mangaId, chapterId, meta);
    return { success: true };
  });

  ipcMain.handle('downloads:pause', async (_, chapterId: string) => {
    downloads.pauseDownload(chapterId);
    return { success: true };
  });

  ipcMain.handle('downloads:resume', async (_, chapterId: string) => {
    downloads.resumeDownload(chapterId);
    return { success: true };
  });

  ipcMain.handle('downloads:delete', async (_, chapterId: string) => {
    downloads.deleteDownload(chapterId);
    return { success: true };
  });

  ipcMain.handle('downloads:list', async () => {
    return db.getDownloads();
  });

  ipcMain.handle('downloads:getStorageUsage', async () => {
    return await downloads.getStorageUsage();
  });

  ipcMain.handle('downloads:getDownloadsPath', async () => {
    return downloads.getDownloadsPath();
  });

  ipcMain.handle('downloads:getOfflinePages', async (_, mangaId: string, chapterId: string) => {
    return downloads.getOfflineChapterPages(mangaId, chapterId);
  });

  ipcMain.handle('downloads:openFolder', async () => {
    shell.openPath(downloads.getDownloadsPath());
    return { success: true };
  });

  // System
  ipcMain.handle('system:openExternal', async (_, url: string) => {
    // SECURITY: Validate protocol to prevent RCE via shell.openExternal
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        console.warn(`[Security] Blocked openExternal with disallowed protocol: ${parsed.protocol}`);
        return { success: false, error: 'Apenas URLs http/https são permitidas.' };
      }
    } catch {
      console.warn(`[Security] Blocked openExternal with invalid URL: ${url}`);
      return { success: false, error: 'URL inválida.' };
    }
    shell.openExternal(url);
    return { success: true };
  });

  ipcMain.handle('system:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      downloads.setDownloadsPath(result.filePaths[0]);
      return result.filePaths[0];
    }
    return null;
  });

  // Notifications
  ipcMain.handle('notifications:getAll', async (_, unreadOnly?: boolean) => {
    return api.getNotifications(unreadOnly);
  });

  ipcMain.handle('notifications:check', async () => {
    return await api.checkLibraryNotifications();
  });

  ipcMain.handle('notifications:markRead', async (_, chapterId: string) => {
    return api.markNotificationRead(chapterId);
  });

  ipcMain.handle('notifications:markAllRead', async () => {
    return api.markAllNotificationsRead();
  });

  ipcMain.handle('notifications:getUnreadCount', async () => {
    return api.getUnreadNotificationsCount();
  });

  // Window Controls
  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow.close();
  });

  ipcMain.handle('window:toggleFullscreen', () => {
    const nextState = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(nextState);
    return nextState;
  });

  // Save single page image locally ("print" function)
  ipcMain.handle('reader:savePageImage', async (_, imageUrl: string, defaultFilename: string) => {
    try {
      const extMatch = imageUrl.match(/\.(png|jpg|jpeg|webp)/i) || defaultFilename.match(/\.(png|jpg|jpeg|webp)/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';

      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Salvar Página Atual',
        defaultPath: defaultFilename.endsWith(`.${ext}`) ? defaultFilename : `${defaultFilename}.${ext}`,
        filters: [
          { name: 'Imagens', extensions: [ext, 'png', 'jpg', 'jpeg', 'webp'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, cancelled: true };
      }

      let buffer: Buffer;

      if (imageUrl.startsWith('file://') || imageUrl.startsWith('data:')) {
        if (imageUrl.startsWith('data:')) {
          const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          // SECURITY: Validate file:// path to prevent arbitrary file read (path traversal)
          // Strictly allow only files inside the downloads directory (never userData or vault)
          const localPath = decodeURIComponent(imageUrl.replace(/^file:\/\/\/?/, ''));
          const resolvedPath = path.resolve(localPath);
          const downloadsDir = path.resolve(downloads.getDownloadsPath());
          const relative = path.relative(downloadsDir, resolvedPath);
          const isWithinAllowed = !relative.startsWith('..') && !path.isAbsolute(relative);
          if (!isWithinAllowed) {
            console.warn(`[Security] Blocked file read outside downloads directory: ${resolvedPath}`);
            return { success: false, error: 'Acesso negado: caminho fora do diretório de downloads permitido.' };
          }
          buffer = fs.readFileSync(resolvedPath);
        }
      } else {
        // SECURITY: Validate remote URL protocol and allowed image hosts to prevent SSRF
        try {
          const parsedSaveUrl = new URL(imageUrl);
          const ALLOWED_IMAGE_HOSTS = [
            'mangadex.org',
            'mangadex.network',
            'uploads.mangadex.org',
            'api.mangadex.network'
          ];
          const isAllowedHost = ALLOWED_IMAGE_HOSTS.some(
            h => parsedSaveUrl.hostname === h || parsedSaveUrl.hostname.endsWith('.' + h)
          );
          if (!isAllowedHost || !['https:', 'http:'].includes(parsedSaveUrl.protocol)) {
            return { success: false, error: 'Host ou protocolo não permitido para download de imagem.' };
          }
        } catch {
          return { success: false, error: 'URL inválida.' };
        }
        const res = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'ZReader/2.0.10'
          }
        });
        if (!res.ok) {
          throw new Error(`Falha ao baixar imagem (HTTP ${res.status})`);
        }
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      }

      fs.writeFileSync(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    } catch (err: any) {
      console.error('Erro ao salvar página atual:', err);
      return { success: false, error: err?.message || 'Erro ao salvar a imagem' };
    }
  });
}
