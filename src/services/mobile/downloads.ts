import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { AppDatabaseMobile, DownloadRecord } from './database';
import { MangaDexApiMobile } from './mangadex';

export class DownloadManagerMobile {
  private activeJobs = new Map<string, { abortController: AbortController; isPaused: boolean }>();
  private queue: string[] = [];
  private isProcessing = false;
  private maxConcurrent = 2; // Mobile network friendly
  private blobDbPromise: Promise<IDBDatabase>;

  constructor(private db: AppDatabaseMobile, private api: MangaDexApiMobile) {
    this.blobDbPromise = this.initBlobDB();
  }

  private initBlobDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('zreader_mobile_blobs', 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('blobs')) {
          const store = db.createObjectStore('blobs', { keyPath: 'key' });
          store.createIndex('chapter_id', 'chapter_id', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async saveBlobLocally(chapterId: string, pageNumber: number, blob: Blob): Promise<void> {
    const db = await this.blobDbPromise;
    const tx = db.transaction('blobs', 'readwrite');
    const store = tx.objectStore('blobs');
    const key = `${chapterId}_page_${String(pageNumber).padStart(3, '0')}`;
    store.put({
      key,
      chapter_id: chapterId,
      page_number: pageNumber,
      blob,
      type: blob.type
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async getBlobsForChapter(chapterId: string): Promise<string[]> {
    const db = await this.blobDbPromise;
    const tx = db.transaction('blobs', 'readonly');
    const store = tx.objectStore('blobs');
    const index = store.index('chapter_id');
    return new Promise((resolve, reject) => {
      const req = index.getAll(chapterId);
      req.onsuccess = () => {
        const rows = (req.result || []) as { page_number: number; blob: Blob }[];
        rows.sort((a, b) => a.page_number - b.page_number);
        const urls = rows.map(r => URL.createObjectURL(r.blob));
        resolve(urls);
      };
      req.onerror = () => reject(req.error);
    });
  }

  private async deleteBlobsForChapter(chapterId: string): Promise<void> {
    const db = await this.blobDbPromise;
    const tx = db.transaction('blobs', 'readwrite');
    const store = tx.objectStore('blobs');
    const index = store.index('chapter_id');
    const req = index.getAllKeys(chapterId);
    req.onsuccess = () => {
      const keys = req.result || [];
      for (const k of keys) {
        store.delete(k);
      }
    };
  }

  public async getDownloadsPath(): Promise<string> {
    if (Capacitor.isNativePlatform()) {
      try {
        const uri = await Filesystem.getUri({
          directory: Directory.Data,
          path: 'downloads'
        });
        return uri.uri;
      } catch {
        return 'Armazenamento Interno (Capacitor/Data)';
      }
    }
    return 'Armazenamento Local do Dispositivo (IndexedDB)';
  }

  public async getStorageUsage(): Promise<{ usedBytes: number; formatted: string }> {
    const downloads = await this.db.getDownloads();
    const completed = downloads.filter(d => d.status === 'completed');
    // Estimate ~1.2MB per page
    let totalBytes = 0;
    for (const d of completed) {
      totalBytes += (d.pages_total || 0) * 1.2 * 1024 * 1024;
    }

    let formatted = `${(totalBytes / 1024 / 1024).toFixed(1)} MB`;
    if (totalBytes > 1024 * 1024 * 1024) {
      formatted = `${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    return { usedBytes: totalBytes, formatted };
  }

  public async queueChapterDownload(
    mangaId: string,
    chapterId: string,
    meta?: {
      mangaTitle?: string;
      mangaCover?: string;
      chapterNumber?: string;
      chapterTitle?: string;
    }
  ) {
    const existing = await this.db.getDownload(chapterId);
    if (existing && existing.status === 'completed') return;

    await this.db.upsertDownload({
      chapter_id: chapterId,
      manga_id: mangaId,
      status: 'queued',
      local_path: null,
      pages_total: 0,
      pages_done: 0,
      downloaded_at: null,
      manga_title: meta?.mangaTitle || existing?.manga_title || null,
      manga_cover: meta?.mangaCover || existing?.manga_cover || null,
      chapter_number: meta?.chapterNumber || existing?.chapter_number || null,
      chapter_title: meta?.chapterTitle || existing?.chapter_title || null
    });

    if (!this.queue.includes(chapterId)) {
      this.queue.push(chapterId);
    }
    this.processQueue();
  }

  public async pauseDownload(chapterId: string) {
    const job = this.activeJobs.get(chapterId);
    if (job) {
      job.isPaused = true;
      job.abortController.abort();
      this.activeJobs.delete(chapterId);
    }
    const idx = this.queue.indexOf(chapterId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }
    const d = await this.db.getDownload(chapterId);
    if (d) {
      await this.db.upsertDownload({ ...d, status: 'paused' });
    }
  }

  public async resumeDownload(chapterId: string) {
    const d = await this.db.getDownload(chapterId);
    if (!d) return;
    await this.queueChapterDownload(d.manga_id, chapterId);
  }

  public async deleteDownload(chapterId: string) {
    await this.pauseDownload(chapterId);
    const d = await this.db.getDownload(chapterId);

    if (Capacitor.isNativePlatform() && d) {
      try {
        await Filesystem.rmdir({
          directory: Directory.Data,
          path: `downloads/${d.manga_id}/${chapterId}`,
          recursive: true
        });
      } catch (e) {
        // Ignore deletion if not present
      }
    }

    await this.deleteBlobsForChapter(chapterId);
    await this.db.deleteDownload(chapterId);
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeJobs.size < this.maxConcurrent) {
      const chapterId = this.queue.shift();
      if (!chapterId) break;

      const record = await this.db.getDownload(chapterId);
      if (!record || record.status === 'paused') continue;

      this.downloadChapter(record).catch(err => {
        console.error(`Chapter download failed for ${chapterId}:`, err);
      });
    }

    this.isProcessing = false;
  }

  private async downloadChapter(record: DownloadRecord) {
    const abortController = new AbortController();
    this.activeJobs.set(record.chapter_id, { abortController, isPaused: false });

    await this.db.upsertDownload({
      ...record,
      status: 'downloading'
    });

    try {
      // 1. Resolve chapter pages
      const pagesInfo = await this.api.getChapterPages(record.chapter_id);
      const totalPages = pagesInfo.pages.length;

      let pagesDone = 0;
      await this.db.upsertDownload({
        ...record,
        status: 'downloading',
        pages_total: totalPages,
        pages_done: 0
      });

      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        try {
          await Filesystem.mkdir({
            directory: Directory.Data,
            path: `downloads/${record.manga_id}/${record.chapter_id}`,
            recursive: true
          });
        } catch {}
      }

      // 2. Download each page
      for (const page of pagesInfo.pages) {
        if (abortController.signal.aborted) return;

        let attempts = 0;
        let downloaded = false;

        while (attempts < 3 && !downloaded) {
          attempts++;
          try {
            const startTime = Date.now();
            const res = await fetch(page.url, { signal: abortController.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const blob = await res.blob();
            const duration = Date.now() - startTime;

            if (isNative) {
              // Convert blob to base64 for native Filesystem writing
              const reader = new FileReader();
              const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onloadend = () => {
                  const b64 = (reader.result as string).split(',')[1];
                  resolve(b64);
                };
                reader.onerror = reject;
              });
              reader.readAsDataURL(blob);
              const base64Data = await base64Promise;

              const ext = page.filename.includes('.') ? page.filename.substring(page.filename.lastIndexOf('.')) : '.jpg';
              const filePath = `downloads/${record.manga_id}/${record.chapter_id}/page_${String(page.pageNumber).padStart(3, '0')}${ext}`;

              await Filesystem.writeFile({
                directory: Directory.Data,
                path: filePath,
                data: base64Data,
                recursive: true
              });
            }

            // Always save to blob store for instant WebView retrieval
            await this.saveBlobLocally(record.chapter_id, page.pageNumber, blob);

            // Report network success
            this.api.sendNetworkReport(page.url, true, blob.size, duration, false);

            downloaded = true;
          } catch (e: any) {
            if (abortController.signal.aborted) return;
            await new Promise(r => setTimeout(r, attempts * 800));
          }
        }

        if (!downloaded) {
          throw new Error(`Falha ao baixar página ${page.pageNumber}`);
        }

        pagesDone++;
        await this.db.upsertDownload({
          ...record,
          status: 'downloading',
          pages_total: totalPages,
          pages_done: pagesDone
        });
      }

      // 3. Mark completed
      await this.db.upsertDownload({
        ...record,
        status: 'completed',
        local_path: `downloads/${record.manga_id}/${record.chapter_id}`,
        pages_total: totalPages,
        pages_done: totalPages,
        downloaded_at: Date.now()
      });
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        await this.db.upsertDownload({
          ...record,
          status: 'failed'
        });
      }
    } finally {
      this.activeJobs.delete(record.chapter_id);
      this.processQueue();
    }
  }

  // Get offline pages for ReaderModal
  public async getOfflineChapterPages(mangaId: string, chapterId: string): Promise<string[] | null> {
    const d = await this.db.getDownload(chapterId);
    if (!d || d.status !== 'completed') {
      return null;
    }

    // Try blob store first (immediate object URLs)
    const blobUrls = await this.getBlobsForChapter(chapterId);
    if (blobUrls && blobUrls.length > 0) {
      return blobUrls;
    }

    // If native filesystem:
    if (Capacitor.isNativePlatform()) {
      try {
        const folderPath = `downloads/${mangaId}/${chapterId}`;
        const dir = await Filesystem.readdir({
          directory: Directory.Data,
          path: folderPath
        });

        const files = dir.files
          .map(f => (typeof f === 'string' ? f : f.name))
          .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        if (files.length > 0) {
          const urls: string[] = [];
          for (const file of files) {
            const uri = await Filesystem.getUri({
              directory: Directory.Data,
              path: `${folderPath}/${file}`
            });
            urls.push(Capacitor.convertFileSrc(uri.uri));
          }
          return urls;
        }
      } catch (e) {
        console.warn('Could not read from native filesystem:', e);
      }
    }

    return null;
  }
}
