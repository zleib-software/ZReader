import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

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
  status: string; // reading | completed | on_hold | dropped | plan_to_read
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
  id: string; // chapter_id
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

export class AppDatabase {
  private db: DatabaseSync;

  constructor(customPath?: string) {
    const userDataPath = customPath || app?.getPath('userData') || process.cwd();
    const dbDir = path.join(userDataPath, 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'mangadex_reader.sqlite');
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      -- metadados cacheados da MangaDex (título, capa, status, tags, content_rating)
      CREATE TABLE IF NOT EXISTS manga_cache (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        cover_url TEXT,
        status TEXT,
        content_rating TEXT,
        tags_json TEXT,
        cached_at INTEGER
      );

      -- capítulos cacheados
      CREATE TABLE IF NOT EXISTS chapters_cache (
        id TEXT PRIMARY KEY,
        manga_id TEXT REFERENCES manga_cache(id),
        chapter_number TEXT,
        title TEXT,
        language TEXT,
        scanlation_group TEXT,
        cached_at INTEGER
      );

      -- espelho local da biblioteca (fonte da verdade continua sendo a MangaDex)
      CREATE TABLE IF NOT EXISTS library (
        manga_id TEXT PRIMARY KEY REFERENCES manga_cache(id),
        status TEXT, -- reading | completed | on_hold | dropped | plan_to_read
        added_at INTEGER
      );

      -- progresso de leitura local, sincronizado com a MangaDex quando online
      CREATE TABLE IF NOT EXISTS reading_progress (
        chapter_id TEXT PRIMARY KEY,
        manga_id TEXT,
        last_page INTEGER,
        read_at INTEGER,
        synced_to_mangadex INTEGER DEFAULT 0
      );

      -- fila e histórico de downloads
      CREATE TABLE IF NOT EXISTS downloads (
        chapter_id TEXT PRIMARY KEY,
        manga_id TEXT,
        status TEXT, -- queued | downloading | completed | failed | paused
        local_path TEXT,
        pages_total INTEGER DEFAULT 0,
        pages_done INTEGER DEFAULT 0,
        downloaded_at INTEGER,
        manga_title TEXT,
        manga_cover TEXT,
        chapter_number TEXT,
        chapter_title TEXT
      );

      -- preferências do app (tema, filtro de content rating, direção de leitura padrão etc.)
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- notificações de novos capítulos das obras seguidas
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        manga_id TEXT NOT NULL,
        manga_title TEXT NOT NULL,
        manga_cover TEXT,
        chapter_number TEXT,
        chapter_title TEXT,
        translated_language TEXT,
        publish_at TEXT,
        is_read INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);

    // Safe column migrations for existing databases
    try { this.db.exec('ALTER TABLE downloads ADD COLUMN manga_title TEXT'); } catch {}
    try { this.db.exec('ALTER TABLE downloads ADD COLUMN manga_cover TEXT'); } catch {}
    try { this.db.exec('ALTER TABLE downloads ADD COLUMN chapter_number TEXT'); } catch {}
    try { this.db.exec('ALTER TABLE downloads ADD COLUMN chapter_title TEXT'); } catch {}
  }

  // Manga Cache
  public saveMangaCache(record: MangaCacheRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO manga_cache (id, title, description, cover_url, status, content_rating, tags_json, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        cover_url = excluded.cover_url,
        status = excluded.status,
        content_rating = excluded.content_rating,
        tags_json = excluded.tags_json,
        cached_at = excluded.cached_at
    `);
    stmt.run(
      record.id,
      record.title,
      record.description,
      record.cover_url,
      record.status,
      record.content_rating,
      record.tags_json,
      record.cached_at
    );
  }

  public getMangaCache(id: string): MangaCacheRecord | null {
    const stmt = this.db.prepare('SELECT * FROM manga_cache WHERE id = ?');
    return (stmt.get(id) as unknown as MangaCacheRecord) || null;
  }

  // Chapters Cache
  public saveChaptersCache(chapters: ChapterCacheRecord[]) {
    const stmt = this.db.prepare(`
      INSERT INTO chapters_cache (id, manga_id, chapter_number, title, language, scanlation_group, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        chapter_number = excluded.chapter_number,
        title = excluded.title,
        language = excluded.language,
        scanlation_group = excluded.scanlation_group,
        cached_at = excluded.cached_at
    `);
    for (const ch of chapters) {
      stmt.run(
        ch.id,
        ch.manga_id,
        ch.chapter_number,
        ch.title,
        ch.language,
        ch.scanlation_group,
        ch.cached_at
      );
    }
  }

  public getCachedChapters(mangaId: string): ChapterCacheRecord[] {
    const stmt = this.db.prepare('SELECT * FROM chapters_cache WHERE manga_id = ? ORDER BY CAST(chapter_number AS REAL) DESC');
    return (stmt.all(mangaId) as unknown as ChapterCacheRecord[]) || [];
  }

  // Library
  public setLibraryStatus(mangaId: string, status: string | null) {
    if (!status) {
      const stmt = this.db.prepare('DELETE FROM library WHERE manga_id = ?');
      stmt.run(mangaId);
      return;
    }
    const stmt = this.db.prepare(`
      INSERT INTO library (manga_id, status, added_at)
      VALUES (?, ?, ?)
      ON CONFLICT(manga_id) DO UPDATE SET
        status = excluded.status
    `);
    stmt.run(mangaId, status, Date.now());
  }

  public getLibrary(): (LibraryRecord & MangaCacheRecord)[] {
    const stmt = this.db.prepare(`
      SELECT l.manga_id, l.status, l.added_at,
             m.title, m.description, m.cover_url, m.status as manga_status, m.content_rating, m.tags_json
      FROM library l
      LEFT JOIN manga_cache m ON l.manga_id = m.id
      ORDER BY l.added_at DESC
    `);
    return (stmt.all() as unknown as (LibraryRecord & MangaCacheRecord)[]) || [];
  }

  public getLibraryStatus(mangaId: string): string | null {
    const stmt = this.db.prepare('SELECT status FROM library WHERE manga_id = ?');
    const res = stmt.get(mangaId) as { status: string } | undefined;
    return res?.status || null;
  }

  // Reading Progress
  public saveReadingProgress(record: ReadingProgressRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO reading_progress (chapter_id, manga_id, last_page, read_at, synced_to_mangadex)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chapter_id) DO UPDATE SET
        last_page = excluded.last_page,
        read_at = excluded.read_at,
        synced_to_mangadex = excluded.synced_to_mangadex
    `);
    stmt.run(
      record.chapter_id,
      record.manga_id,
      record.last_page,
      record.read_at,
      record.synced_to_mangadex
    );
  }

  public getChapterProgress(chapterId: string): ReadingProgressRecord | null {
    const stmt = this.db.prepare('SELECT * FROM reading_progress WHERE chapter_id = ?');
    return (stmt.get(chapterId) as unknown as ReadingProgressRecord) || null;
  }

  public getMangaReadChapters(mangaId: string): string[] {
    const stmt = this.db.prepare('SELECT chapter_id FROM reading_progress WHERE manga_id = ?');
    const rows = stmt.all(mangaId) as { chapter_id: string }[];
    return rows.map(r => r.chapter_id);
  }

  // Downloads
  public upsertDownload(record: DownloadRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO downloads (
        chapter_id, manga_id, status, local_path, pages_total, pages_done, downloaded_at,
        manga_title, manga_cover, chapter_number, chapter_title
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chapter_id) DO UPDATE SET
        status = excluded.status,
        local_path = excluded.local_path,
        pages_total = excluded.pages_total,
        pages_done = excluded.pages_done,
        downloaded_at = excluded.downloaded_at,
        manga_title = COALESCE(excluded.manga_title, downloads.manga_title),
        manga_cover = COALESCE(excluded.manga_cover, downloads.manga_cover),
        chapter_number = COALESCE(excluded.chapter_number, downloads.chapter_number),
        chapter_title = COALESCE(excluded.chapter_title, downloads.chapter_title)
    `);
    stmt.run(
      record.chapter_id,
      record.manga_id,
      record.status,
      record.local_path,
      record.pages_total,
      record.pages_done,
      record.downloaded_at,
      record.manga_title || null,
      record.manga_cover || null,
      record.chapter_number || null,
      record.chapter_title || null
    );
  }

  public getDownloads(): DownloadRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        d.chapter_id,
        d.manga_id,
        d.status,
        d.local_path,
        d.pages_total,
        d.pages_done,
        d.downloaded_at,
        COALESCE(d.manga_title, m.title, 'Mangá') as manga_title,
        COALESCE(d.manga_cover, m.cover_url) as manga_cover,
        COALESCE(d.chapter_number, c.chapter_number, '?') as chapter_number,
        COALESCE(d.chapter_title, c.title, '') as chapter_title
      FROM downloads d
      LEFT JOIN manga_cache m ON d.manga_id = m.id
      LEFT JOIN chapters_cache c ON d.chapter_id = c.id
      ORDER BY COALESCE(d.downloaded_at, 0) DESC
    `);
    return (stmt.all() as unknown as DownloadRecord[]) || [];
  }

  public getDownload(chapterId: string): DownloadRecord | null {
    const stmt = this.db.prepare(`
      SELECT 
        d.chapter_id,
        d.manga_id,
        d.status,
        d.local_path,
        d.pages_total,
        d.pages_done,
        d.downloaded_at,
        COALESCE(d.manga_title, m.title, 'Mangá') as manga_title,
        COALESCE(d.manga_cover, m.cover_url) as manga_cover,
        COALESCE(d.chapter_number, c.chapter_number, '?') as chapter_number,
        COALESCE(d.chapter_title, c.title, '') as chapter_title
      FROM downloads d
      LEFT JOIN manga_cache m ON d.manga_id = m.id
      LEFT JOIN chapters_cache c ON d.chapter_id = c.id
      WHERE d.chapter_id = ?
    `);
    return (stmt.get(chapterId) as unknown as DownloadRecord) || null;
  }

  public deleteDownload(chapterId: string) {
    const stmt = this.db.prepare('DELETE FROM downloads WHERE chapter_id = ?');
    stmt.run(chapterId);
  }

  public getDownloadedChaptersForManga(mangaId: string): DownloadRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        d.chapter_id,
        d.manga_id,
        d.status,
        d.local_path,
        d.pages_total,
        d.pages_done,
        d.downloaded_at,
        COALESCE(d.manga_title, m.title, 'Mangá') as manga_title,
        COALESCE(d.manga_cover, m.cover_url) as manga_cover,
        COALESCE(d.chapter_number, c.chapter_number, '?') as chapter_number,
        COALESCE(d.chapter_title, c.title, '') as chapter_title
      FROM downloads d
      LEFT JOIN manga_cache m ON d.manga_id = m.id
      LEFT JOIN chapters_cache c ON d.chapter_id = c.id
      WHERE d.manga_id = ? AND d.status = 'completed'
      ORDER BY d.downloaded_at DESC
    `);
    return (stmt.all(mangaId) as unknown as DownloadRecord[]) || [];
  }

  // App Settings
  public getSetting(key: string, defaultValue: string = ''): string {
    const stmt = this.db.prepare('SELECT value FROM app_settings WHERE key = ?');
    const res = stmt.get(key) as { value: string } | undefined;
    return res ? res.value : defaultValue;
  }

  public setSetting(key: string, value: string) {
    const stmt = this.db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  public getAllSettings(): Record<string, string> {
    const stmt = this.db.prepare('SELECT key, value FROM app_settings');
    const rows = stmt.all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }

  // Notifications
  public getNotifications(unreadOnly = false): NotificationRecord[] {
    const sql = unreadOnly
      ? 'SELECT * FROM notifications WHERE is_read = 0 ORDER BY publish_at DESC, created_at DESC LIMIT 100'
      : 'SELECT * FROM notifications ORDER BY publish_at DESC, created_at DESC LIMIT 100';
    return (this.db.prepare(sql).all() as unknown) as NotificationRecord[];
  }

  public addNotification(n: NotificationRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO notifications (
        id, manga_id, manga_title, manga_cover, chapter_number,
        chapter_title, translated_language, publish_at, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        manga_title = excluded.manga_title,
        manga_cover = COALESCE(excluded.manga_cover, notifications.manga_cover)
    `);
    stmt.run(
      n.id,
      n.manga_id,
      n.manga_title,
      n.manga_cover || null,
      n.chapter_number,
      n.chapter_title || null,
      n.translated_language,
      n.publish_at,
      n.is_read ?? 0,
      n.created_at || Date.now()
    );
  }

  public markNotificationRead(chapterId: string) {
    const stmt = this.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?');
    stmt.run(chapterId);
  }

  public markAllNotificationsRead() {
    this.db.exec('UPDATE notifications SET is_read = 1');
  }

  public getUnreadNotificationsCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0').get() as any;
    return row?.count || 0;
  }

  public clearAllData() {
    this.db.exec(`
      DELETE FROM library;
      DELETE FROM reading_progress;
      DELETE FROM downloads;
      DELETE FROM chapters_cache;
      DELETE FROM manga_cache;
      DELETE FROM app_settings;
      DELETE FROM notifications;
    `);
  }
}

