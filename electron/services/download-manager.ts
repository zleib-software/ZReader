import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { AppDatabase, DownloadRecord } from '../storage/database';
import { MangaDexHomeService } from './mangadex-home';

export class DownloadManager {
  private activeJobs = new Map<string, { abortController: AbortController; isPaused: boolean }>();
  private queue: string[] = [];
  private isProcessing = false;
  private maxConcurrent = 3;
  private downloadsDir: string;

  constructor(private db: AppDatabase, private homeService: MangaDexHomeService) {
    const userStorage = this.db.getSetting('downloads_path');
    if (userStorage && fs.existsSync(userStorage)) {
      this.downloadsDir = userStorage;
    } else {
      const defaultPath = path.join(app?.getPath('userData') || process.cwd(), 'downloads');
      this.downloadsDir = defaultPath;
    }
    if (!fs.existsSync(this.downloadsDir)) {
      fs.mkdirSync(this.downloadsDir, { recursive: true });
    }
    // Auto-repair existing downloads with missing manga titles or chapter numbers
    setTimeout(() => this.selfHealDownloadsMetadata(), 1500);
  }

  public async selfHealDownloadsMetadata(): Promise<void> {
    try {
      const downloads = this.db.getDownloads();
      for (const d of downloads) {
        if (!d.manga_title || d.manga_title === 'Mangá' || !d.chapter_number || d.chapter_number === '?') {
          this.homeService.api.getChapter(d.chapter_id).then((res: any) => {
            if (res?.data) {
              const chapNum = res.data.attributes?.chapter || '?';
              const chapTitle = res.data.attributes?.title || '';
              const mangaRel = res.data.relationships?.find((r: any) => r.type === 'manga');
              let resolvedTitle = d.manga_title;
              if (mangaRel?.attributes?.title) {
                const titles = mangaRel.attributes.title;
                const altTitles = Array.isArray(mangaRel.attributes?.altTitles) ? mangaRel.attributes.altTitles : [];
                if (titles['pt-br']) resolvedTitle = titles['pt-br'];
                else if (titles['pt']) resolvedTitle = titles['pt'];
                else if (titles['en']) resolvedTitle = titles['en'];
                else {
                  for (const alt of altTitles) {
                    if (alt['en']) {
                      resolvedTitle = alt['en'];
                      break;
                    }
                  }
                  if (!resolvedTitle || resolvedTitle === d.manga_title) {
                    resolvedTitle = titles['ja-ro'] || titles['ko-ro'] || titles['zh-ro'] || (Object.values(titles)[0] as string);
                  }
                }
              }
              this.db.upsertDownload({
                ...d,
                chapter_number: chapNum,
                chapter_title: chapTitle,
                manga_title: (resolvedTitle && resolvedTitle !== 'Mangá') ? resolvedTitle : d.manga_title
              });
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Error during self-healing downloads metadata:', err);
    }
  }

  public getDownloadsPath(): string {
    return this.downloadsDir;
  }

  public setDownloadsPath(newPath: string) {
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
    }
    this.downloadsDir = newPath;
    this.db.setSetting('downloads_path', newPath);
  }

  public async getStorageUsage(): Promise<{ usedBytes: number; formatted: string }> {
    let totalBytes = 0;
    const calculateDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          calculateDir(full);
        } else if (entry.isFile()) {
          const stat = fs.statSync(full);
          totalBytes += stat.size;
        }
      }
    };

    calculateDir(this.downloadsDir);

    let formatted = `${(totalBytes / 1024 / 1024).toFixed(1)} MB`;
    if (totalBytes > 1024 * 1024 * 1024) {
      formatted = `${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    return { usedBytes: totalBytes, formatted };
  }

  public queueChapterDownload(
    mangaId: string,
    chapterId: string,
    meta?: {
      mangaTitle?: string;
      mangaCover?: string;
      chapterNumber?: string;
      chapterTitle?: string;
    }
  ) {
    const existing = this.db.getDownload(chapterId);
    if (existing && existing.status === 'completed') return;

    this.db.upsertDownload({
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

  public pauseDownload(chapterId: string) {
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
    const d = this.db.getDownload(chapterId);
    if (d) {
      this.db.upsertDownload({ ...d, status: 'paused' });
    }
  }

  public resumeDownload(chapterId: string) {
    const d = this.db.getDownload(chapterId);
    if (!d) return;
    this.queueChapterDownload(d.manga_id, chapterId);
  }

  private sanitizeId(id: string): string {
    return (id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  public deleteDownload(chapterId: string) {
    this.pauseDownload(chapterId);
    const d = this.db.getDownload(chapterId);
    if (d?.local_path && fs.existsSync(d.local_path)) {
      // SECURITY: Ensure d.local_path is strictly inside downloadsDir before removing
      const resolved = path.resolve(d.local_path);
      const downloadsBase = path.resolve(this.downloadsDir);
      const rel = path.relative(downloadsBase, resolved);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        try {
          fs.rmSync(resolved, { recursive: true, force: true });
        } catch (err) {
          console.error('Error deleting local chapter folder:', err);
        }
      } else {
        console.warn(`[Security] Blocked attempt to delete path outside downloadsDir: ${resolved}`);
      }
    }
    this.db.deleteDownload(chapterId);
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeJobs.size < this.maxConcurrent) {
      const chapterId = this.queue.shift();
      if (!chapterId) break;

      const record = this.db.getDownload(chapterId);
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

    // SECURITY: Sanitize IDs to prevent directory traversal
    const safeMangaId = this.sanitizeId(record.manga_id);
    const safeChapterId = this.sanitizeId(record.chapter_id);
    const targetDir = path.resolve(this.downloadsDir, safeMangaId, safeChapterId);

    // Ensure targetDir stays strictly within downloadsDir
    const rel = path.relative(path.resolve(this.downloadsDir), targetDir);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`[Security] Caminho de download inválido: ${targetDir}`);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    this.db.upsertDownload({
      ...record,
      status: 'downloading',
      local_path: targetDir
    });

    try {
      // 1. Resolve chapter pages from MangaDex@Home
      const pagesInfo = await this.homeService.getChapterPages(record.chapter_id);
      const totalPages = pagesInfo.pages.length;

      let pagesDone = 0;
      this.db.upsertDownload({
        ...record,
        status: 'downloading',
        local_path: targetDir,
        pages_total: totalPages,
        pages_done: 0
      });

      // 2. Download page by page with retry and reporting
      for (const page of pagesInfo.pages) {
        if (abortController.signal.aborted) {
          return;
        }

        const ext = path.extname(page.filename) || '.jpg';
        const pageFileName = `page_${String(page.pageNumber).padStart(3, '0')}${ext}`;
        const pageFilePath = path.join(targetDir, pageFileName);

        if (!fs.existsSync(pageFilePath)) {
          // Download with retry backoff
          let attempts = 0;
          let downloaded = false;
          while (attempts < 3 && !downloaded) {
            attempts++;
            const result = await this.homeService.fetchPageWithReport(page.url, false);
            if (result.success && result.buffer) {
              fs.writeFileSync(pageFilePath, result.buffer);
              downloaded = true;
            } else {
              // Wait with exponential backoff before retry
              await new Promise(r => setTimeout(r, attempts * 1000));
            }
          }

          if (!downloaded) {
            throw new Error(`Falha ao baixar página ${page.pageNumber}`);
          }
        }

        pagesDone++;
        this.db.upsertDownload({
          ...record,
          status: 'downloading',
          local_path: targetDir,
          pages_total: totalPages,
          pages_done: pagesDone
        });
      }

      // 3. Mark completed
      this.db.upsertDownload({
        ...record,
        status: 'completed',
        local_path: targetDir,
        pages_total: totalPages,
        pages_done: totalPages,
        downloaded_at: Date.now()
      });
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        this.db.upsertDownload({
          ...record,
          status: 'failed',
          local_path: targetDir
        });
      }
    } finally {
      this.activeJobs.delete(record.chapter_id);
      this.processQueue();
    }
  }

  // Get local pages for offline reading
  public getOfflineChapterPages(mangaId: string, chapterId: string): string[] | null {
    const d = this.db.getDownload(chapterId);
    if (!d || d.status !== 'completed' || !d.local_path || !fs.existsSync(d.local_path)) {
      return null;
    }

    const resolved = path.resolve(d.local_path);
    const downloadsBase = path.resolve(this.downloadsDir);
    const rel = path.relative(downloadsBase, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      console.warn(`[Security] Blocked attempt to read offline pages outside downloadsDir: ${resolved}`);
      return null;
    }

    const files = fs.readdirSync(resolved)
      .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return files.map(f => `file://${path.join(d.local_path!, f).replace(/\\/g, '/')}`);
  }
}
