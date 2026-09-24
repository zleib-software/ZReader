import { contextBridge, ipcRenderer, webFrame } from 'electron';

export const api = {
  // UI Scale / Zoom
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),

  // Auth
  getProfile: () => ipcRenderer.invoke('auth:getProfile'),
  setupLocalProfile: (password: string, name?: string) => ipcRenderer.invoke('auth:setupLocalProfile', password, name),
  unlockLocalProfile: (password: string) => ipcRenderer.invoke('auth:unlockLocalProfile', password),
  connectMangaDex: (clientId: string, clientSecret: string, username: string, password: string) =>
    ipcRenderer.invoke('auth:connectMangaDex', clientId, clientSecret, username, password),
  getMangaDexStatus: () => ipcRenderer.invoke('auth:getMangaDexStatus'),
  disconnectMangaDex: () => ipcRenderer.invoke('auth:disconnectMangaDex'),
  resetApp: () => ipcRenderer.invoke('auth:resetApp'),

  // MangaDex Browse & Details
  getPopularManga: (limit?: number, offset?: number, ratings?: string[]) =>
    ipcRenderer.invoke('mangadex:getPopular', limit, offset, ratings),
  getLatestManga: (limit?: number, offset?: number, ratings?: string[]) =>
    ipcRenderer.invoke('mangadex:getLatest', limit, offset, ratings),
  searchManga: (
    query: string,
    limit?: number,
    offset?: number,
    ratings?: string[],
    tags?: string[],
    tagsMode?: 'AND' | 'OR',
    order?: 'followedCount' | 'latestUploadedChapter' | 'relevance'
  ) => ipcRenderer.invoke('mangadex:search', query, limit, offset, ratings, tags, tagsMode, order),
  getMangaDetails: (mangaId: string) => ipcRenderer.invoke('mangadex:getDetails', mangaId),
  getMangaChapters: (mangaId: string, languages?: string[], limit?: number, offset?: number, order?: 'desc' | 'asc', fetchAll?: boolean) =>
    ipcRenderer.invoke('mangadex:getChapters', mangaId, languages, limit, offset, order, fetchAll),
  getChapterPages: (chapterId: string, dataSaver?: boolean) =>
    ipcRenderer.invoke('mangadex:getChapterPages', chapterId, dataSaver),
  fetchPageImage: (url: string) => ipcRenderer.invoke('mangadex:fetchPageImage', url),
  saveCurrentPage: (imageUrl: string, defaultFilename: string) =>
    ipcRenderer.invoke('reader:savePageImage', imageUrl, defaultFilename),

  // User Library & Actions
  getUserFollows: (limit?: number, offset?: number) => ipcRenderer.invoke('mangadex:getUserFollows', limit, offset),
  followManga: (mangaId: string) => ipcRenderer.invoke('mangadex:followManga', mangaId),
  unfollowManga: (mangaId: string) => ipcRenderer.invoke('mangadex:unfollowManga', mangaId),
  setMangaStatus: (mangaId: string, status: string | null) => ipcRenderer.invoke('mangadex:setMangaStatus', mangaId, status),
  getUserReadingStatuses: () => ipcRenderer.invoke('mangadex:getUserReadingStatuses'),
  getReadMarkers: (mangaId: string) => ipcRenderer.invoke('mangadex:getReadMarkers', mangaId),
  markChapterRead: (chapterId: string) => ipcRenderer.invoke('mangadex:markChapterRead', chapterId),
  markChapterUnread: (chapterId: string) => ipcRenderer.invoke('mangadex:markChapterUnread', chapterId),
  syncLibrary: () => ipcRenderer.invoke('mangadex:syncLibrary'),

  // Local Database
  getLibrary: () => ipcRenderer.invoke('db:getLibrary'),
  getLibraryStatus: (mangaId: string) => ipcRenderer.invoke('db:getLibraryStatus', mangaId),
  saveReadingProgress: (progress: { chapter_id: string; manga_id: string; last_page: number; read_at: number; synced_to_mangadex: number }) =>
    ipcRenderer.invoke('db:saveReadingProgress', progress),
  getChapterProgress: (chapterId: string) => ipcRenderer.invoke('db:getChapterProgress', chapterId),
  getMangaReadChapters: (mangaId: string) => ipcRenderer.invoke('db:getMangaReadChapters', mangaId),
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('db:setSetting', key, value),

  // Downloads & Offline
  queueDownload: (mangaId: string, chapterId: string, meta?: { mangaTitle?: string; mangaCover?: string; chapterNumber?: string; chapterTitle?: string }) => ipcRenderer.invoke('downloads:queue', mangaId, chapterId, meta),
  pauseDownload: (chapterId: string) => ipcRenderer.invoke('downloads:pause', chapterId),
  resumeDownload: (chapterId: string) => ipcRenderer.invoke('downloads:resume', chapterId),
  deleteDownload: (chapterId: string) => ipcRenderer.invoke('downloads:delete', chapterId),
  getDownloads: () => ipcRenderer.invoke('downloads:list'),
  getStorageUsage: () => ipcRenderer.invoke('downloads:getStorageUsage'),
  getDownloadsPath: () => ipcRenderer.invoke('downloads:getDownloadsPath'),
  getOfflinePages: (mangaId: string, chapterId: string) => ipcRenderer.invoke('downloads:getOfflinePages', mangaId, chapterId),
  openDownloadsFolder: () => ipcRenderer.invoke('downloads:openFolder'),

  // Notifications
  getNotifications: (unreadOnly?: boolean) => ipcRenderer.invoke('notifications:getAll', unreadOnly),
  checkNotifications: () => ipcRenderer.invoke('notifications:check'),
  markNotificationRead: (chapterId: string) => ipcRenderer.invoke('notifications:markRead', chapterId),
  markAllNotificationsRead: () => ipcRenderer.invoke('notifications:markAllRead'),
  getUnreadNotificationsCount: () => ipcRenderer.invoke('notifications:getUnreadCount'),

  // System & Window
  openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
  selectDirectory: () => ipcRenderer.invoke('system:selectDirectory'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  onDeepLink: (callback: (url: string) => void) => {
    const subscription = (_: any, url: string) => callback(url);
    ipcRenderer.on('deep-link', subscription);
    return () => ipcRenderer.removeListener('deep-link', subscription);
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);
