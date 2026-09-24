import { AppVault } from '../storage/vault';
import { AppDatabase } from '../storage/database';
import { globalMangaDexLimiter } from './rate-limiter';

const MANGADEX_API_BASE = 'https://api.mangadex.org';
const MANGADEX_AUTH_TOKEN_URL = 'https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token';
const USER_AGENT = 'ZReader/2.0.10';

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in?: number;
  token_type?: string;
}

export class MangaDexApi {
  constructor(private vault: AppVault, private db: AppDatabase) {}

  public async getValidAccessToken(): Promise<string | null> {
    const currentToken = this.vault.getAccessToken();
    if (currentToken && !this.vault.isTokenExpiringSoon()) {
      return currentToken;
    }

    // Attempt token refresh using stored refresh_token and client_secret
    const secrets = this.vault.getMangaDexSecrets();
    if (!secrets || !secrets.refreshToken || !secrets.clientSecret) {
      return null;
    }

    try {
      const refreshed = await this.refreshToken(secrets.clientId, secrets.clientSecret, secrets.refreshToken);
      this.vault.setAccessToken(refreshed.access_token, refreshed.expires_in);
      this.vault.saveMangaDexSecrets(secrets.clientId, secrets.clientSecret, refreshed.refresh_token, secrets.username);
      return refreshed.access_token;
    } catch (err) {
      console.error('Failed to proactively refresh MangaDex token:', err);
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
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT
        },
        body: body.toString()
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `Falha na autenticação (${res.status}): ${errText}` };
      }

      const data = (await res.json()) as TokenResponse;
      this.vault.setAccessToken(data.access_token, data.expires_in);
      this.vault.saveMangaDexSecrets(clientId, clientSecret, data.refresh_token, username);

      // Trigger instant library sync immediately upon login!
      this.syncUserLibrary().catch(err => {
        console.error('Erro na sincronização imediata pós-login:', err);
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro de conexão ao autenticar na MangaDex' };
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
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: body.toString()
    });

    if (!res.ok) {
      throw new Error(`Erro ao renovar token: ${res.status}`);
    }

    return (await res.json()) as TokenResponse;
  }

  public async request<T = any>(endpoint: string, options: RequestInit = {}, requiresAuth = false): Promise<T> {
    return globalMangaDexLimiter.schedule(async () => {
      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        ...(options.headers as Record<string, string> || {})
      };

      if (requiresAuth) {
        const token = await this.getValidAccessToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
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

      const res = await fetch(url, { ...options, headers });

      if (res.status === 401 && requiresAuth) {
        // Force refresh and retry once
        const secrets = this.vault.getMangaDexSecrets();
        if (secrets?.refreshToken) {
          try {
            const refreshed = await this.refreshToken(secrets.clientId, secrets.clientSecret, secrets.refreshToken);
            this.vault.setAccessToken(refreshed.access_token, refreshed.expires_in);
            this.vault.saveMangaDexSecrets(secrets.clientId, secrets.clientSecret, refreshed.refresh_token, secrets.username);
            headers['Authorization'] = `Bearer ${refreshed.access_token}`;
            const retryRes = await fetch(url, { ...options, headers });
            if (!retryRes.ok) throw new Error(`HTTP ${retryRes.status}`);
            return await retryRes.json();
          } catch (e) {
            throw new Error('Sessão expirada. Por favor, reconecte sua conta MangaDex.');
          }
        }
      }

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Erro na API da MangaDex (${res.status}): ${errBody}`);
      }

      if (res.status === 204) {
        return {} as T;
      }

      return (await res.json()) as T;
    });
  }

  // Browse & Search
  public async getPopularManga(limit = 24, offset = 0, ratings: string[] = ['safe', 'suggestive']) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      'order[followedCount]': 'desc',
      'includes[]': 'cover_art'
    });
    ratings.forEach(r => params.append('contentRating[]', r));
    params.append('includes[]', 'author');
    params.append('includes[]', 'artist');

    const res = await this.request(`/manga?${params.toString()}`);
    this.cacheMangaList(res.data);
    return res;
  }

  public async getLatestUpdates(limit = 24, offset = 0, ratings: string[] = ['safe', 'suggestive']) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      'order[latestUploadedChapter]': 'desc',
      'includes[]': 'cover_art'
    });
    ratings.forEach(r => params.append('contentRating[]', r));
    params.append('includes[]', 'author');
    params.append('includes[]', 'artist');

    const res = await this.request(`/manga?${params.toString()}`);
    this.cacheMangaList(res.data);
    return res;
  }

  public async searchManga(
    query: string,
    limit = 24,
    offset = 0,
    ratings: string[] = ['safe', 'suggestive'],
    tags: string[] = [],
    tagsMode: 'AND' | 'OR' = 'AND',
    order: 'followedCount' | 'latestUploadedChapter' | 'relevance' = 'followedCount'
  ) {
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
    this.cacheMangaList(res.data);
    return res;
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
        this.cacheMangaItem(res.data);
      }
      return res;
    } catch (err) {
      // Offline fallback: load from local cache
      const cached = this.db.getMangaCache(mangaId);
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

      // 1. Fetch first chunk
      const firstLimit = (limit > maxApiLimit || fetchAll) ? maxApiLimit : limit;
      const firstRes = await fetchFeedChunk(offset, firstLimit);

      if (!firstRes || !firstRes.data) {
        return firstRes;
      }

      const total = typeof firstRes.total === 'number' ? firstRes.total : firstRes.data.length;
      let accumulatedChapters: any[] = [...firstRes.data];

      // 2. If caller asked for more than 100 items (or fetchAll), paginate through subsequent chunks
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
        this.cacheChaptersList(mangaId, accumulatedChapters);
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
      // Offline fallback: load cached or downloaded chapters from local database
      const cached = this.db.getCachedChapters(mangaId);
      const downloaded = this.db.getDownloadedChaptersForManga(mangaId);

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

  // User Library & Follows
  public async getUserFollowedManga(limit = 100, offset = 0) {
    const res = await this.request(`/user/follows/manga?limit=${limit}&offset=${offset}&includes[]=cover_art`, {}, true);
    if (res.data) {
      this.cacheMangaList(res.data);
    }
    return res;
  }

  public async getUserReadingStatuses() {
    return await this.request('/user/reading-statuses', {}, true);
  }

  public async setMangaStatus(mangaId: string, status: string | null) {
    let res = null;
    try {
      res = await this.request(`/manga/${mangaId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      }, true);
    } catch (e) {
      console.warn('Aviso ao sincronizar status na MangaDex (removendo localmente):', e);
    }
    this.db.setLibraryStatus(mangaId, status);
    return res || { success: true };
  }

  public async followManga(mangaId: string) {
    return await this.request(`/manga/${mangaId}/follow`, { method: 'POST' }, true);
  }

  public async unfollowManga(mangaId: string) {
    let res = null;
    try {
      res = await this.request(`/manga/${mangaId}/follow`, { method: 'DELETE' }, true);
    } catch (e) {
      console.warn('Aviso ao desseguir na MangaDex (removendo localmente):', e);
    }
    this.db.setLibraryStatus(mangaId, null);
    return res || { success: true };
  }

  public async markChapterRead(chapterId: string) {
    return await this.request(`/chapter/${chapterId}/read`, { method: 'POST' }, true);
  }

  public async markChapterUnread(chapterId: string) {
    return await this.request(`/chapter/${chapterId}/read`, { method: 'DELETE' }, true);
  }

  public async syncUserLibrary(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const token = await this.getValidAccessToken();
      if (!token) {
        return { success: false, count: 0, error: 'Não autenticado na MangaDex. Conecte sua conta primeiro.' };
      }

      // 1. Obter statuses de leitura de todos os mangás do usuário
      const statusMap: Record<string, string> = {};
      try {
        const statusesRes = await this.request('/user/reading-statuses', {}, true);
        if (statusesRes?.statuses) {
          Object.assign(statusMap, statusesRes.statuses);
        }
      } catch (e) {
        console.warn('Aviso: erro ao obter reading-statuses:', e);
      }

      // 2. Buscar todos os mangás seguidos com paginação (limit=100)
      let offset = 0;
      let hasMore = true;
      let totalFetched = 0;
      const processedIds = new Set<string>();

      while (hasMore) {
        const followsRes = await this.request(
          `/user/follows/manga?limit=100&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist`,
          {},
          true
        );

        if (followsRes?.data && Array.isArray(followsRes.data) && followsRes.data.length > 0) {
          this.cacheMangaList(followsRes.data);
          for (const item of followsRes.data) {
            processedIds.add(item.id);
            const status = statusMap[item.id] || 'reading';
            this.db.setLibraryStatus(item.id, status);
          }
          totalFetched += followsRes.data.length;
          offset += followsRes.data.length;
          if (followsRes.data.length < 100 || (followsRes.total && offset >= followsRes.total)) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      // 3. Se houver mangás em reading-statuses que não vieram nos follows, buscar detalhes em lotes de 50
      const missingIds = Object.keys(statusMap).filter(id => !processedIds.has(id));
      if (missingIds.length > 0) {
        for (let i = 0; i < missingIds.length; i += 50) {
          const batch = missingIds.slice(i, i + 50);
          const params = new URLSearchParams({ limit: '50' });
          params.append('includes[]', 'cover_art');
          params.append('includes[]', 'author');
          params.append('includes[]', 'artist');
          batch.forEach(id => params.append('ids[]', id));
          try {
            const batchRes = await this.request(`/manga?${params.toString()}`);
            if (batchRes?.data && Array.isArray(batchRes.data)) {
              this.cacheMangaList(batchRes.data);
              for (const item of batchRes.data) {
                this.db.setLibraryStatus(item.id, statusMap[item.id] || 'reading');
              }
            }
          } catch (e) {
            console.warn('Aviso: erro ao obter lote de mangás pendentes:', e);
          }
        }
      }

      const totalCount = this.db.getLibrary().length;
      return { success: true, count: totalCount };
    } catch (err: any) {
      console.error('Erro na sincronização da biblioteca:', err);
      return { success: false, count: 0, error: err?.message || 'Falha ao sincronizar biblioteca' };
    }
  }

  // Caching Helpers
  private cacheMangaList(list: any[]) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      this.cacheMangaItem(item);
    }
  }

  private cacheMangaItem(item: any) {
    if (!item || !item.id) return;
    const titles = item.attributes?.title || {};
    const altTitles = Array.isArray(item.attributes?.altTitles) ? item.attributes.altTitles : [];

    let title: string = titles['pt-br'] || titles['pt'] || '';
    if (!title) {
      title = titles['en'] || '';
    }
    if (!title) {
      for (const alt of altTitles) {
        if (alt['en']) {
          title = alt['en'];
          break;
        }
      }
    }
    if (!title) {
      title = titles['ja-ro'] || titles['ko-ro'] || titles['zh-ro'] || '';
    }
    if (!title) {
      for (const alt of altTitles) {
        if (alt['ja-ro'] || alt['ko-ro'] || alt['zh-ro']) {
          title = alt['ja-ro'] || alt['ko-ro'] || alt['zh-ro'] || '';
          break;
        }
      }
    }
    if (!title) {
      title = (Object.values(titles)[0] as string) || 'Sem título';
    }

    const description = item.attributes?.description?.['pt-br'] ||
                        item.attributes?.description?.pt ||
                        item.attributes?.description?.en ||
                        Object.values(item.attributes?.description || {})[0] ||
                        null;

    let coverUrl: string | null = null;
    const coverRel = item.relationships?.find((r: any) => r.type === 'cover_art');
    if (coverRel?.attributes?.fileName) {
      coverUrl = `https://uploads.mangadex.org/covers/${item.id}/${coverRel.attributes.fileName}.512.jpg`;
    }

    const tags = (item.attributes?.tags || []).map((t: any) => t.attributes?.name?.en || '').filter(Boolean);

    this.db.saveMangaCache({
      id: item.id,
      title,
      description: typeof description === 'string' ? description : null,
      cover_url: coverUrl,
      status: item.attributes?.status || null,
      content_rating: item.attributes?.contentRating || null,
      tags_json: JSON.stringify(tags),
      cached_at: Date.now()
    });
  }

  private cacheChaptersList(mangaId: string, chapters: any[]) {
    if (!Array.isArray(chapters)) return;
    const records = chapters.map(ch => {
      const scanGroup = ch.relationships?.find((r: any) => r.type === 'scanlation_group')?.attributes?.name || null;
      return {
        id: ch.id,
        manga_id: mangaId,
        chapter_number: ch.attributes?.chapter || null,
        title: ch.attributes?.title || null,
        language: ch.attributes?.translatedLanguage || 'en',
        scanlation_group: scanGroup,
        cached_at: Date.now()
      };
    });
    this.db.saveChaptersCache(records);
  }

  // Notifications for library works
  public async getMangaReadMarkers(mangaId: string): Promise<string[]> {
    const local = this.db.getMangaReadChapters(mangaId);
    try {
      const res = await this.request(`/manga/${mangaId}/read`, {}, true);
      if (res?.data && Array.isArray(res.data)) {
        return Array.from(new Set([...local, ...res.data]));
      }
    } catch (e) {
      // Offline fallback
    }
    return local;
  }

  public getNotifications(unreadOnly = false) {
    return this.db.getNotifications(unreadOnly);
  }

  public markNotificationRead(chapterId: string) {
    this.db.markNotificationRead(chapterId);
    return { success: true };
  }

  public markAllNotificationsRead() {
    this.db.markAllNotificationsRead();
    return { success: true };
  }

  public getUnreadNotificationsCount() {
    return this.db.getUnreadNotificationsCount();
  }

  public async checkLibraryNotifications(): Promise<{
    notifications: any[];
    unreadCount: number;
    newFound: number;
  }> {
    try {
      const library = this.db.getLibrary();
      if (!library || library.length === 0) {
        return {
          notifications: this.db.getNotifications(),
          unreadCount: this.db.getUnreadNotificationsCount(),
          newFound: 0
        };
      }

      const libraryMangaMap = new Map<string, { title: string; cover?: string | null }>();
      for (const item of library) {
        libraryMangaMap.set(item.manga_id, {
          title: item.title || 'Mangá',
          cover: item.cover_url
        });
      }

      let chaptersFound: any[] = [];
      const token = await this.getValidAccessToken();

      // Se autenticado, puxar o feed oficial de follows da conta
      if (token) {
        try {
          const feedRes = await this.request(
            '/user/follows/manga/feed?limit=60&translatedLanguage[]=pt-br&translatedLanguage[]=en&order[publishAt]=desc&includes[]=manga',
            {},
            true
          );
          if (feedRes?.data && Array.isArray(feedRes.data)) {
            chaptersFound = feedRes.data;
          }
        } catch (e) {
          console.warn('Aviso: erro no feed de follows autenticado, usando fallback:', e);
        }
      }

      // Se não autenticado ou feed vazio, consultar os capítulos recentes das obras da biblioteca
      if (chaptersFound.length === 0) {
        const topMangaIds = library.slice(0, 15).map(m => m.manga_id);
        for (const mId of topMangaIds) {
          try {
            const chRes = await this.request(
              `/chapter?manga=${mId}&translatedLanguage[]=pt-br&translatedLanguage[]=en&order[publishAt]=desc&limit=3&includes[]=manga`
            );
            if (chRes?.data && Array.isArray(chRes.data)) {
              chaptersFound.push(...chRes.data);
            }
          } catch (e) {
            // Silencioso em fallback
          }
        }
      }

      let newCount = 0;
      for (const ch of chaptersFound) {
        const mangaRel = ch.relationships?.find((r: any) => r.type === 'manga');
        const mangaId = mangaRel?.id || ch.manga_id;
        if (!mangaId) continue;

        const mangaInfo = libraryMangaMap.get(mangaId);
        if (!mangaInfo) continue;

        // Verificar se usuário já leu
        const readMarkers = this.db.getMangaReadChapters(mangaId);
        if (readMarkers.includes(ch.id)) {
          continue;
        }

        const mangaTitle = mangaRel?.attributes ? resolveMangaTitle(mangaRel.attributes) : mangaInfo.title;
        const chapterNum = ch.attributes?.chapter || 'Especial';
        const chapterTitle = ch.attributes?.title || null;
        const lang = ch.attributes?.translatedLanguage || 'pt-br';
        const publishAt = ch.attributes?.publishAt || new Date().toISOString();

        this.db.addNotification({
          id: ch.id,
          manga_id: mangaId,
          manga_title: mangaTitle,
          manga_cover: mangaInfo.cover || null,
          chapter_number: chapterNum,
          chapter_title: chapterTitle,
          translated_language: lang,
          publish_at: publishAt,
          is_read: 0,
          created_at: Date.now()
        });
        newCount++;
      }

      return {
        notifications: this.db.getNotifications(),
        unreadCount: this.db.getUnreadNotificationsCount(),
        newFound: newCount
      };
    } catch (err) {
      console.error('Erro ao verificar novidades:', err);
      return {
        notifications: this.db.getNotifications(),
        unreadCount: this.db.getUnreadNotificationsCount(),
        newFound: 0
      };
    }
  }
}

export function resolveMangaTitle(attributes: any): string {
  if (!attributes) return 'Sem título';
  const titles = attributes.title || {};
  const altTitles = Array.isArray(attributes.altTitles) ? attributes.altTitles : [];

  let title: string = titles['pt-br'] || titles['pt'] || '';
  if (!title) title = titles['en'] || '';
  if (!title) {
    for (const alt of altTitles) {
      if (alt['en']) {
        title = alt['en'];
        break;
      }
    }
  }
  if (!title) title = titles['ja-ro'] || titles['ko-ro'] || titles['zh-ro'] || '';
  if (!title) {
    for (const alt of altTitles) {
      if (alt['ja-ro'] || alt['ko-ro'] || alt['zh-ro']) {
        title = alt['ja-ro'] || alt['ko-ro'] || alt['zh-ro'] || '';
        break;
      }
    }
  }
  if (!title) title = (Object.values(titles)[0] as string) || 'Sem título';
  return title;
}
