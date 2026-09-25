export interface MangaItem {
  id: string;
  type: string;
  attributes: {
    title: Record<string, string>;
    altTitles?: Record<string, string>[];
    description: Record<string, string>;
    isLocked?: boolean;
    links?: Record<string, string>;
    originalLanguage?: string;
    lastVolume?: string;
    lastChapter?: string;
    publicationDemographic?: string;
    status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
    year?: number;
    contentRating: 'safe' | 'suggestive' | 'erotica' | 'pornographic';
    tags: Array<{
      id: string;
      type: string;
      attributes: {
        name: Record<string, string>;
        group: string;
      };
    }>;
    state?: string;
    chapterNumbersResetOnNewVolume?: boolean;
    createdAt?: string;
    updatedAt?: string;
    latestUploadedChapter?: string;
  };
  relationships: Array<{
    id: string;
    type: 'author' | 'artist' | 'cover_art' | 'manga' | 'scanlation_group';
    attributes?: Record<string, any>;
  }>;
}

export interface ChapterItem {
  id: string;
  type: string;
  attributes: {
    volume?: string;
    chapter?: string;
    title?: string;
    translatedLanguage: string;
    externalUrl?: string;
    publishAt: string;
    readableAt: string;
    createdAt: string;
    updatedAt: string;
    pages: number;
    version: number;
  };
  relationships: Array<{
    id: string;
    type: 'scanlation_group' | 'manga' | 'user';
    attributes?: Record<string, any>;
  }>;
}

export interface UserProfile {
  type: 'local';
  name?: string;
  email?: string;
  avatarUrl?: string;
  hasPassword?: boolean;
  createdAt: number;
}

export interface LibraryEntry {
  manga_id: string;
  status: 'reading' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_read';
  added_at: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  manga_status: string | null;
  content_rating: string | null;
  tags_json: string | null;
}

export interface DownloadItem {
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

export function getSmartMangaTitle(manga: {
  attributes: {
    title: Record<string, string>;
    altTitles?: Record<string, string>[];
  };
}): string {
  const titles = manga.attributes?.title || {};
  const altTitles = Array.isArray(manga.attributes?.altTitles) ? manga.attributes.altTitles : [];

  // 1. Título original em português brasileiro direto do site (attributes.title)
  if (titles['pt-br']) return titles['pt-br'];
  if (titles['pt']) return titles['pt'];

  // 2. Título prioritário em inglês direto do site (attributes.title)
  if (titles['en']) return titles['en'];

  // 3. Título prioritário em inglês nos títulos alternativos (ex: Solo Leveling, Solo Leveling: Ragnarok)
  for (const alt of altTitles) {
    if (alt['en']) return alt['en'];
  }

  // 4. Título romanizado oficial direto (ja-ro, ko-ro, zh-ro)
  if (titles['ja-ro']) return titles['ja-ro'];
  if (titles['ko-ro']) return titles['ko-ro'];
  if (titles['zh-ro']) return titles['zh-ro'];

  // 5. Título romanizado nos títulos alternativos
  for (const alt of altTitles) {
    if (alt['ja-ro']) return alt['ja-ro'];
    if (alt['ko-ro']) return alt['ko-ro'];
    if (alt['zh-ro']) return alt['zh-ro'];
  }

  // 6. Primeiro título canônico original disponível no site (ex: Japonês ou Coreano original)
  const canonicalValues = Object.values(titles);
  if (canonicalValues.length > 0 && canonicalValues[0]) {
    return canonicalValues[0];
  }

  // 7. Apenas como último recurso absoluto se não houver inglês nem título nativo: procurar qualquer altTitle
  for (const alt of altTitles) {
    const firstVal = Object.values(alt)[0];
    if (firstVal) return firstVal;
  }

  return 'Sem título';
}
