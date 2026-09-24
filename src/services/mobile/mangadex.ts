import { AppVaultMobile } from './vault';
import { AppDatabaseMobile } from './database';

const MANGADEX_API_BASE = 'https://api.mangadex.org';
const MANGADEX_AUTH_TOKEN_URL = 'https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token';
const REPORT_ENDPOINT = 'https://api.mangadex.network/report';
const USER_AGENT = 'ZReader-Mobile/2.0.10';

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in?: number;
  token_type?: string;
}

export interface AtHomeResponse {
  result: string;
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

export interface ChapterPageInfo {
  pageNumber: number;
  url: string;
  filename: string;
}

export interface ChapterPagesResult {
  chapterId: string;
  hash: string;
  pages: ChapterPageInfo[];
  total: number;
}

export class MangaDexApiMobile {
  private lastRequestTime = 0;
  private minIntervalMs = 250; // Max 4 requests/sec

  constructor(private vault: AppVaultMobile, private db: AppDatabaseMobile) {}

  private async rateLimitWait() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  public async getValidAccessToken(): Promise<string | null> {
    const currentToken = this.vault.getAccessToken();
    if (currentToken && !this.vault.isTokenExpiringSoon()) {
      return currentToken;
    }

    const secrets = await this.vault.getMangaDexSecrets();
    if (!secrets || !secrets.refreshToken || !secrets.clientSecret) {
      return null;
    }

    try {
      const refreshed = await this.refreshToken(secrets.clientId, secrets.clientSecret, secrets.refreshToken);
      this.vault.setAccessToken(refreshed.access_token, refreshed.expires_in);
      await this.vault.saveMangaDexSecrets(secrets.clientId, secrets.clientSecret, refreshed.refresh_token, secrets.username);
      return refreshed.access_token;
    } catch (err) {
      console.error('Failed to refresh MangaDex token on mobile:', err);
      return null;
    }
  }

  public async loginWithPasswordGrant(
    clientId: string,
    clientSecret: string,
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const body = new URLSearchParams({
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username,
        password
      });

      const res = await fetch(MANGADEX_AUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `Falha na autenticação (${res.status}): ${errText}` };
      }

      const data = (await res.json()) as TokenResponse;
      this.vault.setAccessToken(data.access_token, data.expires_in);
      await this.vault.saveMangaDexSecrets(clientId, clientSecret, data.refresh_token, username);

      this.syncUserLibrary().catch(console.error);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao autenticar na MangaDex' };
    }
  }

  public async refreshToken(clientId: string, clientSecret: string, refreshToken: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    });

    const res = await fetch(MANGADEX_AUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed: HTTP ${res.status}`);
    }

    return (await res.json()) as TokenResponse;
  }

  public async request<T = any>(endpoint: string, options: RequestInit = {}, requiresAuth = false): Promise<T> {
    await this.rateLimitWait();

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {})
    };

    if (requiresAuth) {
      const token = await this.getValidAccessToken();
      if (!token) {
        throw new Error('Autenticação necessária com a MangaDex para esta ação.');
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = endpoint.startsWith('http') ? endpoint : `${MANGADEX_API_BASE}${endpoint}`;

    // SECURITY: Enforce that Authorization bearer tokens are strictly sent to MangaDex API/Auth hosts
    if (requiresAuth) {
      try {
        const targetUrl = new URL(url);
        const isAllowedApiHost = targetUrl.hostname === 'api.mangadex.org' || targetUrl.hostname === 'auth.mangadex.org';
        if (!isAllowedApiHost) {
          throw new Error(`[Security] Tentativa de envio de token para host não autorizado: ${targetUrl.hostname}`);
        }
      } catch (e: any) {
        throw new Error(`[Security] URL de requisição inválida ou insegura: ${e.message}`);
      }
    }

    const res = await fetch(url, {
      ...options,
      headers
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MangaDex API Error (${res.status}): ${text}`);
    }

    return await res.json();
  }

  // Cache helpers
  private async cacheMangaItem(manga: any) {
    if (!manga || !manga.id) return;
    try {
      const titleObj = manga.attributes?.title || {};
      const title = titleObj['pt-br'] || titleObj['en'] || titleObj['ja-ro'] || Object.values(titleObj)[0] || 'Sem Título';
      const descObj = manga.attributes?.description || {};
      const description = descObj['pt-br'] || descObj['en'] || Object.values(descObj)[0] || null;

      const coverRel = manga.relationships?.find((r: any) => r.type === 'cover_art');
      const coverFileName = coverRel?.attributes?.fileName;
      const cover_url = coverFileName ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}` : null;

      await this.db.saveMangaCache({
        id: manga.id,
        title,
        description,
        cover_url,
        status: manga.attributes?.status || null,
        content_rating: manga.attributes?.contentRating || null,
        tags_json: JSON.stringify(manga.attributes?.tags || []),
        cached_at: Date.now()
      });
    } catch (e) {
      console.warn('Error caching manga item:', e);
    }
  }

  private async cacheMangaList(list: any[]) {
    if (!Array.isArray(list)) return;
    for (const m of list) {
      await this.cacheMangaItem(m);
    }
  }

  private async cacheChaptersList(mangaId: string, chapters: any[]) {
    if (!Array.isArray(chapters)) return;
    const records = chapters.map(ch => {
      const scanRel = ch.relationships?.find((r: any) => r.type === 'scanlation_group');
      return {
        id: ch.id,
        manga_id: mangaId,
        chapter_number: ch.attributes?.chapter || null,
        title: ch.attributes?.title || null,
        language: ch.attributes?.translatedLanguage || 'pt-br',
        scanlation_group: scanRel?.attributes?.name || null,
        cached_at: Date.now()
      };
    });
    await this.db.saveChaptersCache(records);
  }

  // Browse & Search
  public async getPopularManga(limit = 24, offset = 0, ratings = ['safe', 'suggestive']) {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        'includes[]': 'cover_art',
        'order[followedCount]': 'desc'
      });
      ratings.forEach(r => params.append('contentRating[]', r));
      params.append('includes[]', 'author');
      params.append('includes[]', 'artist');

      const res = await this.request(`/manga?${params.toString()}`);
      await this.cacheMangaList(res.data);
      return res;
    } catch (err) {
      // Offline fallback: load from local cache
      const cached = await this.db.getLibrary();
      if (cached && cached.length > 0) {
        return {
          result: 'ok',
          response: 'collection',
          data: cached.map(c => ({
            id: c.id,
            type: 'manga',
            attributes: {
              title: { 'pt-br': c.title, en: c.title },
              description: { 'pt-br': c.description || '', en: c.description || '' },
              status: c.status,
              contentRating: c.content_rating || 'safe',
              tags: []
            },
            relationships: c.cover_url ? [{
              type: 'cover_art',
              attributes: { fileName: c.cover_url }
            }] : []
          })),
          limit,
          offset,
          total: cached.length
        };
      }
      throw err;
    }
  }

  public async getLatestUpdates(limit = 24, offset = 0, ratings = ['safe', 'suggestive']) {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        'includes[]': 'cover_art',
        'order[latestUploadedChapter]': 'desc'
      });
      ratings.forEach(r => params.append('contentRating[]', r));
      params.append('includes[]', 'author');
      params.append('includes[]', 'artist');

      const res = await this.request(`/manga?${params.toString()}`);
      await this.cacheMangaList(res.data);
      return res;
    } catch (err) {
      return this.getPopularManga(limit, offset, ratings);
    }
  }

  public async searchManga(
    query: string,
    limit = 24,
    offset = 0,
    ratings = ['safe', 'suggestive'],
    tags: string[] = [],
    tagsMode: 'AND' | 'OR' = 'AND',
    order: 'followedCount' | 'latestUploadedChapter' | 'relevance' = 'followedCount'
  ) {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        'includes[]': 'cover_art'
      });

      if (order === 'latestUploadedChapter') {
        params.append('order[latestUploadedChapter]', 'desc');
      } else if (order === 'relevance' && query.trim()) {
        params.append('order[relevance]', 'desc');
      } else {
        params.append('order[followedCount]', 'desc');
      }

      if (query.trim()) params.append('title', query.trim());
      ratings.forEach(r => params.append('contentRating[]', r));
      tags.forEach(t => params.append('includedTags[]', t));
      if (tags.length > 1) {
        params.append('includedTagsMode', tagsMode);
      }
      params.append('includes[]', 'author');
      params.append('includes[]', 'artist');

      const res = await this.request(`/manga?${params.toString()}`);
      await this.cacheMangaList(res.data);
      return res;
    } catch (err) {
      // Local search fallback
      const library = await this.db.getLibrary();
      const filtered = library.filter(m => m.title.toLowerCase().includes(query.toLowerCase()));
      return {
        result: 'ok',
        response: 'collection',
        data: filtered.map(c => ({
          id: c.id,
          type: 'manga',
          attributes: {
            title: { 'pt-br': c.title, en: c.title },
            description: { 'pt-br': c.description || '', en: c.description || '' },
            status: c.status,
            contentRating: c.content_rating || 'safe',
            tags: []
          },
          relationships: c.cover_url ? [{
            type: 'cover_art',
            attributes: { fileName: c.cover_url }
          }] : []
        })),
        limit,
        offset,
        total: filtered.length
      };
    }
  }

  public async getMangaDetails(mangaId: string) {
    try {
      const params = new URLSearchParams({
        'includes[]': 'cover_art'
      });
      params.append('includes[]', 'author');
      params.append('includes[]', 'artist');

      const res = await this.request(`/manga/${mangaId}?${params.toString()}`);
      if (res.data) {
        await this.cacheMangaItem(res.data);
      }
      return res;
    } catch (err) {
      const cached = await this.db.getMangaCache(mangaId);
      if (cached) {
        return {
          data: {
            id: cached.id,
            type: 'manga',
            attributes: {
              title: { 'pt-br': cached.title, en: cached.title },
              description: { 'pt-br': cached.description || '', en: cached.description || '' },
              status: cached.status || 'ongoing',
              contentRating: cached.content_rating || 'safe',
              tags: []
            },
            relationships: cached.cover_url ? [{
              id: 'local_cover',
              type: 'cover_art',
              attributes: { fileName: cached.cover_url }
            }] : []
          }
        };
      }
      throw err;
    }
  }

  public async getMangaChapters(
    mangaId: string,
    languages: string[] = ['pt-br', 'en'],
    limit = 100,
    offset = 0,
    order: 'desc' | 'asc' = 'desc',
    fetchAll = false
  ) {
    try {
      const maxApiLimit = 100;
      const fetchFeedChunk = async (chunkOffset: number, chunkLimit: number) => {
        const params = new URLSearchParams({
          limit: String(Math.min(chunkLimit, maxApiLimit)),
          offset: String(chunkOffset),
          'order[chapter]': order,
          'includes[]': 'scanlation_group'
        });
        languages.forEach(l => params.append('translatedLanguage[]', l));
        ['safe', 'suggestive', 'erotica', 'pornographic'].forEach(r => params.append('contentRating[]', r));

        return await this.request<any>(`/manga/${mangaId}/feed?${params.toString()}`);
      };

      const firstLimit = (limit > maxApiLimit || fetchAll) ? maxApiLimit : limit;
      const firstRes = await fetchFeedChunk(offset, firstLimit);

      if (!firstRes || !firstRes.data) {
        return firstRes;
      }

      const total = typeof firstRes.total === 'number' ? firstRes.total : firstRes.data.length;
      let accumulatedChapters: any[] = [...firstRes.data];
      const targetCount = fetchAll ? total : Math.min(limit, total);

      if (targetCount > maxApiLimit) {
        let currentOffset = offset + firstRes.data.length;
        while (accumulatedChapters.length < (targetCount - offset) && currentOffset < total) {
          const remaining = (targetCount - offset) - accumulatedChapters.length;
          const nextLimit = Math.min(remaining, maxApiLimit);
          if (nextLimit <= 0) break;

          const nextRes = await fetchFeedChunk(currentOffset, nextLimit);
          if (!nextRes?.data || nextRes.data.length === 0) break;

          accumulatedChapters.push(...nextRes.data);
          currentOffset += nextRes.data.length;
        }
      }

      if (accumulatedChapters.length > 0) {
        await this.cacheChaptersList(mangaId, accumulatedChapters);
      }

      return {
        result: 'ok',
        response: 'collection',
        data: accumulatedChapters,
        limit: accumulatedChapters.length,
        offset: offset,
        total: total
      };
    } catch (err) {
      const cached = await this.db.getCachedChapters(mangaId);
      const downloaded = await this.db.getDownloadedChaptersForManga(mangaId);

      const itemsMap = new Map<string, any>();

      for (const ch of cached) {
        itemsMap.set(ch.id, {
          id: ch.id,
          type: 'chapter',
          attributes: {
            chapter: ch.chapter_number,
            title: ch.title,
            translatedLanguage: ch.language || 'pt-br',
            pages: 0
          },
          relationships: ch.scanlation_group ? [{
            type: 'scanlation_group',
            attributes: { name: ch.scanlation_group }
          }] : []
        });
      }

      for (const d of downloaded) {
        if (!itemsMap.has(d.chapter_id)) {
          itemsMap.set(d.chapter_id, {
            id: d.chapter_id,
            type: 'chapter',
            attributes: {
              chapter: d.chapter_number || '?',
              title: d.chapter_title || '',
              translatedLanguage: 'pt-br',
              pages: d.pages_total || 0
            },
            relationships: []
          });
        }
      }

      if (itemsMap.size > 0) {
        const allItems = Array.from(itemsMap.values());
        allItems.sort((a, b) => {
          const numA = parseFloat(a.attributes?.chapter || '0');
          const numB = parseFloat(b.attributes?.chapter || '0');
          return order === 'asc' ? numA - numB : numB - numA;
        });

        const sliced = allItems.slice(offset, offset + limit);
        return {
          result: 'ok',
          response: 'collection',
          data: sliced,
          limit: sliced.length,
          offset,
          total: allItems.length
        };
      }
      throw err;
    }
  }

  public async getChapter(chapterId: string) {
    return await this.request(`/chapter/${chapterId}?includes[]=scanlation_group`);
  }

  // MangaDex@Home Pages
  public async getChapterPages(chapterId: string, dataSaver: boolean = false): Promise<ChapterPagesResult> {
    const res = await this.request<AtHomeResponse>(`/at-home/server/${chapterId}`);
    if (!res || !res.baseUrl || !res.chapter) {
      throw new Error('Não foi possível obter os nós do MangaDex@Home para este capítulo.');
    }

    const { baseUrl, chapter } = res;
    const { hash, data, dataSaver: dataSaverList } = chapter;
    const files = (dataSaver && dataSaverList?.length > 0) ? dataSaverList : data;
    const qualityFolder = (dataSaver && dataSaverList?.length > 0) ? 'data-saver' : 'data';

    const pages: ChapterPageInfo[] = files.map((filename, idx) => ({
      pageNumber: idx + 1,
      filename,
      url: `${baseUrl}/${qualityFolder}/${hash}/${filename}`
    }));

    return {
      chapterId,
      hash,
      pages,
      total: pages.length
    };
  }

  public async sendNetworkReport(url: string, success: boolean, bytes: number, duration: number, cached = false) {
    try {
      await fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, success, bytes, duration, cached })
      });
    } catch {
      // Gracefully ignore report failure
    }
  }

  // User Actions
  public async getUserFollowedManga(limit = 100, offset = 0) {
    const res = await this.request(`/user/follows/manga?limit=${limit}&offset=${offset}&includes[]=cover_art`, {}, true);
    if (res.data) {
      await this.cacheMangaList(res.data);
    }
    return res;
  }

  public async followManga(mangaId: string) {
    return await this.request(`/manga/${mangaId}/follow`, { method: 'POST' }, true);
  }

  public async unfollowManga(mangaId: string) {
    return await this.request(`/manga/${mangaId}/follow`, { method: 'DELETE' }, true);
  }

  public async setMangaStatus(mangaId: string, status: string | null) {
    let res = null;
    try {
      res = await this.request(`/manga/${mangaId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      }, true);
    } catch {
      // Even if network fails, persist locally
    }
    await this.db.setLibraryStatus(mangaId, status);
    return res || { result: 'ok' };
  }

  public async getUserReadingStatuses() {
    return await this.request('/user/reading-statuses', {}, true);
  }

  public async getMangaReadMarkers(mangaId: string): Promise<string[]> {
    try {
      const res = await this.request(`/manga/${mangaId}/read`, {}, true);
      return res.data || [];
    } catch {
      return await this.db.getMangaReadChapters(mangaId);
    }
  }

  public async markChapterRead(chapterId: string) {
    try {
      await this.request(`/chapter/${chapterId}/read`, { method: 'POST' }, true);
    } catch {
      // Ignore if offline
    }
    return { result: 'ok' };
  }

  public async markChapterUnread(chapterId: string) {
    try {
      await this.request(`/chapter/${chapterId}/read`, { method: 'DELETE' }, true);
    } catch {
      // Ignore if offline
    }
    return { result: 'ok' };
  }

  public async syncUserLibrary(): Promise<{ success: boolean; syncedCount: number }> {
    try {
      const statusesRes = await this.getUserReadingStatuses();
      if (!statusesRes || !statusesRes.statuses) return { success: false, syncedCount: 0 };

      let count = 0;
      for (const [mangaId, status] of Object.entries(statusesRes.statuses)) {
        await this.db.setLibraryStatus(mangaId, status as string);
        count++;
      }
      return { success: true, syncedCount: count };
    } catch (e: any) {
      console.warn('Library sync failed (offline?):', e?.message);
      return { success: false, syncedCount: 0 };
    }
  }

  public async checkLibraryNotifications() {
    // Check recent updates for followed manga
    return { success: true, newCount: 0 };
  }
}
