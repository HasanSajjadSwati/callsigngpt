import { Injectable, Logger } from '@nestjs/common';
import { SecretsService } from '../secrets/secrets.service';
import { AppConfigService } from '../config/app-config.service';
import { fetchWithTimeout } from '../common/http/fetch-with-timeout';

export type SearchResult = {
  title: string;
  link: string;
  snippet: string;
};

@Injectable()
export class GoogleSearchService {
  private readonly logger = new Logger(GoogleSearchService.name);

  constructor(
    private readonly secrets: SecretsService,
    private readonly config: AppConfigService,
  ) {}

  async search(query: string, opts: { num?: number } = {}): Promise<SearchResult[]> {
    const apiKey = await this.secrets.get('GOOGLE_SEARCH_API_KEY');
    const cx = await this.secrets.get('GOOGLE_SEARCH_CX');

    if (!apiKey || !cx) {
      this.logger.warn('Google search is not configured (missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX).');
      return [];
    }

    const num = Math.min(Math.max(opts.num ?? 5, 1), 10);
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(num));

    let resp: Response;
    try {
      resp = await fetchWithTimeout(url.toString(), { method: 'GET' }, this.config.requestTimeoutMs);
    } catch (err: any) {
      this.logger.warn(`Google search request failed: ${err?.message || err}`);
      return [];
    }

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      this.logger.warn(`Google search error ${resp.status}: ${txt || resp.statusText}`);
      return [];
    }

    const json = await resp.json().catch(() => null);
    const items = Array.isArray(json?.items) ? json.items : [];

    return items
      .map((item: any) => {
        const title = this.cleanText(item?.title ?? '');
        const link = String(item?.link ?? '').trim();
        const snippet = this.trimSnippet(this.cleanText(item?.snippet ?? ''));
        if (!title || !link) return null;
        return { title, link, snippet };
      })
      .filter((item: SearchResult | null): item is SearchResult => Boolean(item));
  }

  private cleanText(input: string): string {
    return String(input || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private trimSnippet(snippet: string, max = 280): string {
    if (!snippet) return '';
    if (snippet.length <= max) return snippet;
    return `${snippet.slice(0, max - 3)}...`;
  }
}
