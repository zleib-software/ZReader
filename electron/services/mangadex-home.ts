import { MangaDexApi } from './mangadex-api';

const REPORT_ENDPOINT = 'https://api.mangadex.network/report';

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

export class MangaDexHomeService {
  constructor(public api: MangaDexApi) {}

  public async getChapterPages(chapterId: string, dataSaver: boolean = false): Promise<ChapterPagesResult> {
    const res = await this.api.request<AtHomeResponse>(`/at-home/server/${chapterId}`);
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

  // Fetches a single page image and sends the required network report
  public async fetchPageWithReport(
    imageUrl: string,
    isCachedLocally: boolean = false
  ): Promise<{ buffer?: Buffer; success: boolean; bytes: number; duration: number; error?: string }> {
    const startTime = Date.now();

    if (isCachedLocally) {
      // Local cached hits do not need external reporting or can report cached: true
      return { success: true, bytes: 0, duration: 0 };
    }

    try {
      // Note: NO authorization headers must ever be sent to MangaDex@Home nodes!
      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'ZReader/2.0.10'
        }
      });

      const duration = Date.now() - startTime;
      const success = res.ok;

      if (!success) {
        // Send failure report to MangaDex network
        this.sendNetworkReport(imageUrl, false, 0, duration, false).catch(() => {});
        return { success: false, bytes: 0, duration, error: `HTTP ${res.status}` };
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const bytes = buffer.byteLength;

      // Mandatory report callback to MangaDex network
      this.sendNetworkReport(imageUrl, true, bytes, duration, false).catch(err => {
        console.warn('Network report error (ignored gracefully):', err);
      });

      return { buffer, success: true, bytes, duration };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      this.sendNetworkReport(imageUrl, false, 0, duration, false).catch(() => {});
      return { success: false, bytes: 0, duration, error: err?.message || 'Falha ao baixar imagem' };
    }
  }

  // Mandatory MangaDex@Home report callback
  private async sendNetworkReport(
    url: string,
    success: boolean,
    bytes: number,
    duration: number,
    cached: boolean
  ): Promise<void> {
    // Only report MangaDex@Home node URLs, not uploads.mangadex.org
    if (url.includes('uploads.mangadex.org')) return;

    try {
      await fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ZReader/2.0.10'
        },
        body: JSON.stringify({
          url,
          success,
          bytes,
          duration: Math.max(1, duration),
          cached
        })
      });
    } catch {
      // Reporting should never disrupt reading flow if network flickers
    }
  }
}
