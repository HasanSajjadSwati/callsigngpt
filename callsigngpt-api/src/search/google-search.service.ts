import { Injectable, Logger } from '@nestjs/common';
import { SecretsService } from '../secrets/secrets.service';
import { AppConfigService } from '../config/app-config.service';
import { fetchWithTimeout } from '../common/http/fetch-with-timeout';

export type SearchResult = {
  title: string;
  link: string;
  snippet: string;
  /** Page body content (best-effort extraction, may be empty). */
  pageContent?: string;
  /** ISO date string from the search metadata, if available. */
  date?: string;
};

@Injectable()
export class GoogleSearchService {
  private readonly logger = new Logger(GoogleSearchService.name);
  /** Simple in-memory cache keyed by query+num, TTL 5 min. */
  private readonly cache = new Map<string, { ts: number; results: SearchResult[] }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly secrets: SecretsService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Run a Google Custom Search query.
   *
   * @param query  Search query text
   * @param opts.num  Number of results (1-10, default 8)
   * @param opts.dateRestrict  Google dateRestrict param e.g. "d1" (past 1 day), "w1" (past week)
   * @param opts.fetchPages  Whether to best-effort fetch page content for top results (default true)
   * @param opts.maxPageChars  Max chars to keep from each fetched page (default 3000)
   */
  async search(
    query: string,
    opts: {
      num?: number;
      dateRestrict?: string;
      fetchPages?: boolean;
      maxPageChars?: number;
    } = {},
  ): Promise<SearchResult[]> {
    const apiKey = await this.secrets.get('GOOGLE_SEARCH_API_KEY');
    const cx = await this.secrets.get('GOOGLE_SEARCH_CX');

    if (!apiKey || !cx) {
      this.logger.warn('Google search is not configured (missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX).');
      return [];
    }

    const num = Math.min(Math.max(opts.num ?? 8, 1), 10);
    const cacheKey = `${query}|${num}|${opts.dateRestrict ?? ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GoogleSearchService.CACHE_TTL_MS) {
      this.logger.debug(`Search cache hit for "${query}"`);
      return cached.results;
    }

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(num));
    if (opts.dateRestrict) {
      url.searchParams.set('dateRestrict', opts.dateRestrict);
    }

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

    let results: SearchResult[] = items
      .map((item: any) => {
        const title = this.cleanText(item?.title ?? '');
        const link = String(item?.link ?? '').trim();
        const snippet = this.trimSnippet(this.cleanText(item?.snippet ?? ''), 600);
        const date = this.extractDate(item);
        if (!title || !link) return null;
        return { title, link, snippet, date } as SearchResult;
      })
      .filter((item: SearchResult | null): item is SearchResult => Boolean(item));

    // Best-effort fetch page content for the top results
    const fetchPages = opts.fetchPages !== false;
    const maxPageChars = opts.maxPageChars ?? 3000;
    if (fetchPages && results.length > 0) {
      const top = results.slice(0, 4); // Fetch content for top 4 results
      const contents = await Promise.allSettled(
        top.map((r) => this.fetchPageContent(r.link, maxPageChars)),
      );
      for (let i = 0; i < top.length; i++) {
        const result = contents[i];
        if (result.status === 'fulfilled' && result.value) {
          results[i] = { ...results[i], pageContent: result.value };
        }
      }
    }

    // Cache results
    this.cache.set(cacheKey, { ts: Date.now(), results });

    // Evict old cache entries periodically
    if (this.cache.size > 100) {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (now - entry.ts > GoogleSearchService.CACHE_TTL_MS) {
          this.cache.delete(key);
        }
      }
    }

    return results;
  }

  /**
   * Best-effort fetch a page's main text content.
   * Strips HTML tags, scripts, styles, nav elements, and extracts readable text.
   */
  private async fetchPageContent(url: string, maxChars: number): Promise<string> {
    try {
      const resp = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CallSignGPT/1.0; +https://callsigngpt.com)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
        8000, // 8 second timeout per page
      );

      if (!resp.ok) return '';

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
        return '';
      }

      const html = await resp.text();
      return this.extractTextFromHtml(html, maxChars);
    } catch {
      return '';
    }
  }

  /**
   * Extract readable text from HTML, removing scripts, styles, nav, headers, footers.
   */
  private extractTextFromHtml(html: string, maxChars: number): string {
    let text = html;

    // Remove script and style blocks
    text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

    // Remove nav, header, footer, aside blocks (usually boilerplate)
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
    text = text.replace(/<header[\s\S]*?<\/header>/gi, ' ');
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
    text = text.replace(/<aside[\s\S]*?<\/aside>/gi, ' ');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, ' ');

    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();

    if (text.length > maxChars) {
      // Try to cut at a sentence boundary
      const cutoff = text.lastIndexOf('. ', maxChars);
      if (cutoff > maxChars * 0.5) {
        text = text.slice(0, cutoff + 1);
      } else {
        text = text.slice(0, maxChars) + '…';
      }
    }

    return text;
  }

  /**
   * Try to extract a date from the search result metadata.
   */
  private extractDate(item: any): string | undefined {
    // Google sometimes includes a date in the snippet (e.g., "Jan 15, 2026 — ...")
    // or in pagemap.metatags
    const metatags = item?.pagemap?.metatags?.[0];
    const published =
      metatags?.['article:published_time'] ??
      metatags?.['og:article:published_time'] ??
      metatags?.['date'] ??
      metatags?.['datePublished'] ??
      metatags?.['sailthru.date'];

    if (published) {
      const d = new Date(published);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }

    // Try to extract date from the beginning of the snippet
    const snippet = item?.snippet ?? '';
    const dateMatch = /^([A-Z][a-z]{2} \d{1,2}, \d{4})\s*[—–-]/.exec(snippet);
    if (dateMatch) return dateMatch[1];

    return undefined;
  }

  private cleanText(input: string): string {
    return String(input || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private trimSnippet(snippet: string, max = 600): string {
    if (!snippet) return '';
    if (snippet.length <= max) return snippet;
    return `${snippet.slice(0, max - 3)}...`;
  }
}
