export interface MangaCacheRecord {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: string | null;
  content_rating: string | null;
  tags_json: string | null;
  cached_at: number;
}

export interface ChapterCacheRecord {
  id: string;
  manga_id: string;
  chapter_number: string | null;
  title: string | null;
  language: string;
  scanlation_group: string | null;
  cached_at: number;
}

export interface LibraryRecord {
  manga_id: string;
  status: string;
  added_at: number;
}

export interface ReadingProgressRecord {
  chapter_id: string;
  manga_id: string;
  last_page: number;
  read_at: number;
  synced_to_mangadex: number;
}

export interface DownloadRecord {
  chapter_id: string;
  manga_id: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'paused';
  local_path: string | null;
  pages_total: number;
  pages_done: number;
  downloaded_at: number | null;
  manga_title?: string | null;
  manga_cover?: string | null;
  chapter_number?: string | null;
  chapter_title?: string | null;
}

export interface NotificationRecord {
  id: string;
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

export class AppDatabaseMobile {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('zreader_mobile_db', 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('manga_cache')) {
          db.createObjectStore('manga_cache', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('chapters_cache')) {
          const store = db.createObjectStore('chapters_cache', { keyPath: 'id' });
          store.createIndex('manga_id', 'manga_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('library')) {
          db.createObjectStore('library', { keyPath: 'manga_id' });
        }

        if (!db.objectStoreNames.contains('reading_progress')) {
          const store = db.createObjectStore('reading_progress', { keyPath: 'chapter_id' });
          store.createIndex('manga_id', 'manga_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('downloads')) {
          const store = db.createObjectStore('downloads', { keyPath: 'chapter_id' });
          store.createIndex('manga_id', 'manga_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('app_settings')) {
          db.createObjectStore('app_settings', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('notifications')) {
          db.createObjectStore('notifications', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    const db = await this.dbPromise;
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // Manga Cache
  public async saveMangaCache(record: MangaCacheRecord): Promise<void> {
    const store = await this.getStore('manga_cache', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getMangaCache(id: string): Promise<MangaCacheRecord | null> {
    const store = await this.getStore('manga_cache', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // Chapters Cache
  public async saveChaptersCache(chapters: ChapterCacheRecord[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('chapters_cache', 'readwrite');
    const store = tx.objectStore('chapters_cache');
    for (const ch of chapters) {
      store.put(ch);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getCachedChapters(mangaId: string): Promise<ChapterCacheRecord[]> {
    const store = await this.getStore('chapters_cache', 'readonly');
    const index = store.index('manga_id');
    return new Promise((resolve, reject) => {
      const req = index.getAll(mangaId);
      req.onsuccess = () => {
        const list = (req.result || []) as ChapterCacheRecord[];
        list.sort((a, b) => {
          const numA = parseFloat(a.chapter_number || '0') || 0;
          const numB = parseFloat(b.chapter_number || '0') || 0;
          return numB - numA;
        });
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Library
  public async setLibraryStatus(mangaId: string, status: string | null): Promise<void> {
    const store = await this.getStore('library', 'readwrite');
    return new Promise((resolve, reject) => {
      if (!status) {
        const req = store.delete(mangaId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } else {
        const req = store.put({ manga_id: mangaId, status, added_at: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }
    });
  }

  public async getLibrary(): Promise<(LibraryRecord & MangaCacheRecord)[]> {
    const db = await this.dbPromise;
    const tx = db.transaction(['library', 'manga_cache'], 'readonly');
    const libStore = tx.objectStore('library');
    const mangaStore = tx.objectStore('manga_cache');

    return new Promise((resolve, reject) => {
      const libReq = libStore.getAll();
      libReq.onsuccess = async () => {
        const libs = (libReq.result || []) as LibraryRecord[];
        const results: (LibraryRecord & MangaCacheRecord)[] = [];

        for (const lib of libs) {
          const mReq = mangaStore.get(lib.manga_id);
          await new Promise<void>((res) => {
            mReq.onsuccess = () => {
              const manga = (mReq.result || {}) as MangaCacheRecord;
              results.push({
                ...manga,
                manga_id: lib.manga_id,
                status: lib.status,
                added_at: lib.added_at,
                title: manga.title || 'Mangá',
                description: manga.description || null,
                cover_url: manga.cover_url || null,
                content_rating: manga.content_rating || 'safe',
                tags_json: manga.tags_json || null,
                cached_at: manga.cached_at || 0
              });
              res();
            };
            mReq.onerror = () => res();
          });
        }
        results.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
        resolve(results);
      };
      libReq.onerror = () => reject(libReq.error);
    });
  }

  public async getLibraryStatus(mangaId: string): Promise<string | null> {
    const store = await this.getStore('library', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(mangaId);
      req.onsuccess = () => resolve(req.result?.status || null);
      req.onerror = () => reject(req.error);
    });
  }

  // Reading Progress
  public async saveReadingProgress(record: ReadingProgressRecord): Promise<void> {
    const store = await this.getStore('reading_progress', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getChapterProgress(chapterId: string): Promise<ReadingProgressRecord | null> {
    const store = await this.getStore('reading_progress', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(chapterId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async getMangaReadChapters(mangaId: string): Promise<string[]> {
    const store = await this.getStore('reading_progress', 'readonly');
    const index = store.index('manga_id');
    return new Promise((resolve, reject) => {
      const req = index.getAll(mangaId);
      req.onsuccess = () => {
        const rows = (req.result || []) as ReadingProgressRecord[];
        resolve(rows.map(r => r.chapter_id));
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Downloads
  public async upsertDownload(record: DownloadRecord): Promise<void> {
    const store = await this.getStore('downloads', 'readwrite');
    return new Promise((resolve, reject) => {
      const reqGet = store.get(record.chapter_id);
      reqGet.onsuccess = () => {
        const existing = reqGet.result;
        const merged: DownloadRecord = {
          ...existing,
          ...record,
          manga_title: record.manga_title || existing?.manga_title || null,
          manga_cover: record.manga_cover || existing?.manga_cover || null,
          chapter_number: record.chapter_number || existing?.chapter_number || null,
          chapter_title: record.chapter_title || existing?.chapter_title || null
        };
        const reqPut = store.put(merged);
        reqPut.onsuccess = () => resolve();
        reqPut.onerror = () => reject(reqPut.error);
      };
      reqGet.onerror = () => reject(reqGet.error);
    });
  }

  public async getDownloads(): Promise<DownloadRecord[]> {
    const store = await this.getStore('downloads', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as DownloadRecord[];
        list.sort((a, b) => (b.downloaded_at || 0) - (a.downloaded_at || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getDownload(chapterId: string): Promise<DownloadRecord | null> {
    const store = await this.getStore('downloads', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(chapterId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteDownload(chapterId: string): Promise<void> {
    const store = await this.getStore('downloads', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(chapterId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getDownloadedChaptersForManga(mangaId: string): Promise<DownloadRecord[]> {
    const store = await this.getStore('downloads', 'readonly');
    const index = store.index('manga_id');
    return new Promise((resolve, reject) => {
      const req = index.getAll(mangaId);
      req.onsuccess = () => {
        const list = ((req.result || []) as DownloadRecord[]).filter(d => d.status === 'completed');
        list.sort((a, b) => (b.downloaded_at || 0) - (a.downloaded_at || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // App Settings
  public async getSetting(key: string, defaultValue: string = ''): Promise<string> {
    const store = await this.getStore('app_settings', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result?.value ?? defaultValue);
      req.onerror = () => reject(req.error);
    });
  }

  public async setSetting(key: string, value: string): Promise<void> {
    const store = await this.getStore('app_settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllSettings(): Promise<Record<string, string>> {
    const store = await this.getStore('app_settings', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as { key: string; value: string }[];
        const res: Record<string, string> = {};
        for (const r of rows) {
          res[r.key] = r.value;
        }
        resolve(res);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Notifications
  public async getNotifications(unreadOnly = false): Promise<NotificationRecord[]> {
    const store = await this.getStore('notifications', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        let list = (req.result || []) as NotificationRecord[];
        if (unreadOnly) {
          list = list.filter(n => !n.is_read);
        }
        list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        resolve(list.slice(0, 100));
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async addNotification(n: NotificationRecord): Promise<void> {
    const store = await this.getStore('notifications', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(n);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async markNotificationRead(chapterId: string): Promise<void> {
    const store = await this.getStore('notifications', 'readwrite');
    return new Promise((resolve, reject) => {
      const reqGet = store.get(chapterId);
      reqGet.onsuccess = () => {
        if (reqGet.result) {
          const item = { ...reqGet.result, is_read: 1 };
          const reqPut = store.put(item);
          reqPut.onsuccess = () => resolve();
          reqPut.onerror = () => reject(reqPut.error);
        } else {
          resolve();
        }
      };
      reqGet.onerror = () => reject(reqGet.error);
    });
  }

  public async markAllNotificationsRead(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('notifications', 'readwrite');
    const store = tx.objectStore('notifications');
    const req = store.openCursor();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const updated = { ...cursor.value, is_read: 1 };
        cursor.update(updated);
        cursor.continue();
      }
    };
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getUnreadNotificationsCount(): Promise<number> {
    const notifs = await this.getNotifications(true);
    return notifs.length;
  }

  public async clearAllData(): Promise<void> {
    const db = await this.dbPromise;
    const storeNames = ['library', 'reading_progress', 'downloads', 'chapters_cache', 'manga_cache', 'app_settings', 'notifications'];
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
