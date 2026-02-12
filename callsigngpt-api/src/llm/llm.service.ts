import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ModelConfigService, type ModelConfig } from './model-config.service';
import { SecretsService } from '../secrets/secrets.service';
import { AppConfigService } from '../config/app-config.service';
import { fetchWithTimeout } from '../common/http/fetch-with-timeout';
import { GoogleSearchService, type SearchResult } from '../search/google-search.service';

const DEFAULT_FALLBACK_MODEL = 'basic:gpt-4o-mini';
const SEARCH_STATUS_PREFIX = '[[[SEARCH_STATUS]]]';

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ChatContentPart[] };

function extractInlineData(content: string): string {
  // Replace data URLs with decoded text when possible, otherwise a placeholder
  return content.replace(/data:([a-z0-9+/.-]+);base64,([A-Za-z0-9+/=]+)/gi, (_m, mime, b64) => {
    const isTextLike = /^text\/|json$|xml$|csv$|markdown$/i.test(mime || '');
    const isDocLike = /(pdf|msword|officedocument|spreadsheet|presentation|excel|powerpoint)/i.test(
      mime || '',
    );
    try {
      const buf = Buffer.from(String(b64), 'base64');
      const MAX_TEXT = 200_000;
      if (isTextLike) {
        const text = buf.toString('utf-8');
        return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}... [truncated text from ${mime}]` : text;
      }
      if (isDocLike) {
        const MAX_BIN = 120_000; // keep payload manageable for LLM
        const preview = b64.length > MAX_BIN ? `${b64.slice(0, MAX_BIN)}... [truncated base64 from ${mime}]` : b64;
        return `[document ${mime} base64 preview]\n${preview}`;
      }
      return `[embedded file: ${mime}]`;
    } catch {
      return `[embedded file: ${mime}]`;
    }
  });
}

type ChatBody = {
  model: string; // e.g. "basic:gpt-4o-mini"
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  search?: { mode?: 'auto' | 'always' | 'off' };
  forceSearch?: boolean;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly modelConfig: ModelConfigService,
    private readonly secrets: SecretsService,
    private readonly config: AppConfigService,
    private readonly search: GoogleSearchService,
  ) {}

  /**
   * Main entry called by ChatController. Routes by provider.
   * Now filters out empty messages globally to prevent 400 errors.
   */
  async *stream(body: ChatBody, user?: { id: string }) {
    if (!body?.model) {
      throw new BadRequestException('model is required');
    }
    if (!Array.isArray(body?.messages)) {
      throw new BadRequestException('messages must be an array');
    }

    const friendly = body.model;

    // Filter out empty or whitespace-only messages (supports string or multimodal content)
    const cleaned = (body.messages || []).filter((m) => {
      if (Array.isArray(m?.content)) return m.content.length > 0;
      return typeof m?.content === 'string' && m.content.trim().length > 0;
    });

    // Normalize file/text content to keep payload sizes manageable and readable
    const normalized = cleaned.map((m) => {
      if (Array.isArray(m.content)) {
        const parts = m.content.map((p) =>
          p.type === 'text' ? { ...p, text: extractInlineData(p.text) } : p,
        );
        return { ...m, content: parts };
      }
      return { ...m, content: extractInlineData(m.content) };
    });

    const withPolicy = this.ensureSearchPolicy(normalized);
    const rawSearchQuery = this.extractSearchQuery(withPolicy);
    const searchMode = body?.search?.mode;
    const forceSearch = searchMode === 'always' || body?.forceSearch === true;
    const blockSearch = searchMode === 'off';
    const shouldSearch = Boolean(
      rawSearchQuery && !blockSearch && (forceSearch || this.shouldUseSearch(rawSearchQuery)),
    );

    let enriched = withPolicy;
    if (shouldSearch && rawSearchQuery) {
      // Refine the raw user text into a concise, effective search query
      const refinedQuery = await this.refineSearchQuery(rawSearchQuery, withPolicy);
      yield this.formatSearchStatusChunk('start', refinedQuery);

      // Determine if this is a freshness-sensitive query needing date restriction
      const dateRestrict = this.detectDateRestrict(rawSearchQuery);

      enriched = await this.maybeInjectSearch(withPolicy, {
        query: refinedQuery,
        force: true,
        dateRestrict,
      });
      yield this.formatSearchStatusChunk('done', refinedQuery);
    }

    const entry = await this.modelConfig.getModel(friendly);

    // Some models (e.g., GPT-5 Nano) only accept default temperature.
    const temperatureOverride =
      /gpt-5/i.test(entry.providerModel) ? undefined : body.temperature ?? entry.temperatureDefault ?? this.config.defaultTemperature;
    const maxTokensOverride = body.max_tokens ?? entry.maxTokensDefault ?? this.config.defaultMaxTokens;

    const tried = new Set<string>();
    for await (const piece of this.streamWithEntry({
      entry,
      normalized: enriched,
      temperature: temperatureOverride,
      maxTokens: maxTokensOverride,
      tried,
    })) {
      yield piece;
    }
  }

  private async maybeInjectSearch(
    messages: ChatMessage[],
    opts: { query?: string | null; force?: boolean; dateRestrict?: string } = {},
  ): Promise<ChatMessage[]> {
    const query = opts.query ?? this.extractSearchQuery(messages);
    if (!query) return messages;
    if (!opts.force && !this.shouldUseSearch(query)) return messages;

    let results: SearchResult[] = [];
    try {
      results = await this.search.search(query, {
        num: 8,
        dateRestrict: opts.dateRestrict,
        fetchPages: true,
        maxPageChars: 3000,
      });
    } catch (err: any) {
      this.logger.warn(`Web search failed: ${err?.message || err}`);
      return messages;
    }

    if (!results.length) {
      // If date-restricted search returned nothing, retry without date restriction
      if (opts.dateRestrict) {
        this.logger.debug(`Date-restricted search returned 0 results, retrying without restriction`);
        try {
          results = await this.search.search(query, {
            num: 8,
            fetchPages: true,
            maxPageChars: 3000,
          });
        } catch {
          return messages;
        }
      }
      if (!results.length) return messages;
    }

    const injected: ChatMessage = {
      role: 'system',
      content: this.formatSearchMessage(query, results),
    };

    return this.insertAfterSystem(messages, injected);
  }

  private ensureSearchPolicy(messages: ChatMessage[]): ChatMessage[] {
    const hasPolicy = messages.some((msg) => {
      if (msg.role !== 'system') return false;
      if (Array.isArray(msg.content)) return false;
      return typeof msg.content === 'string' && msg.content.includes('Search policy:');
    });

    if (hasPolicy) return messages;

    const policy: ChatMessage = {
      role: 'system',
      content: [
        'Search policy:',
        '- You have real-time web search capabilities. Web search runs automatically for queries likely to need current or factual information.',
        '- When web search results are provided in the system context, you MUST use them as your primary source and cite URLs inline (e.g., [Source Title](url)).',
        '- When page content is provided alongside search results, use it for detailed, accurate answers rather than relying only on snippets.',
        '- If asked whether you can browse or search the web, answer yes confidently.',
        '- Always prefer information from the search results over your training data when the results are relevant.',
        '- If search results contain dates, mention them to help the user assess freshness.',
        '- If the search results seem outdated or irrelevant for the query, acknowledge this limitation.',
      ].join('\n'),
    };

    return this.insertAfterSystem(messages, policy);
  }

  /**
   * Extract a search query from the conversation.
   * Uses the last user message as the primary source, but also considers
   * recent conversation context for follow-up questions like "what about today?"
   */
  private extractSearchQuery(messages: ChatMessage[]): string | null {
    // Find the last user message
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return null;

    const lastUserText = this.messageToText(messages[lastUserIdx].content);
    const cleaned = this.sanitizeSearchText(lastUserText);
    if (!cleaned) return null;

    // If the last user message is short and appears to be a follow-up,
    // prepend context from the preceding user/assistant exchange
    const isLikelyFollowUp =
      cleaned.length < 60 &&
      /^(what|how|when|where|who|why|which|is|are|was|were|did|does|do|can|could|will|would|should|and|but|also|tell me|show me|find|any|more)\b/i.test(cleaned);

    if (isLikelyFollowUp && lastUserIdx >= 2) {
      // Grab the previous user message for topic context
      for (let i = lastUserIdx - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'user') {
          const prevText = this.sanitizeSearchText(this.messageToText(messages[i].content));
          if (prevText && prevText.length > 5) {
            // Combine: "previous topic" + "follow-up question"
            const combined = `${prevText.slice(0, 120)} ${cleaned}`;
            return this.sanitizeSearchText(combined) || cleaned;
          }
          break;
        }
      }
    }

    return cleaned;
  }

  private messageToText(content: ChatMessage['content']): string {
    if (Array.isArray(content)) {
      return content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n');
    }
    return content ?? '';
  }

  private sanitizeSearchText(text: string): string {
    if (!text) return '';
    let out = String(text);
    out = out.replace(/data:[^\s]+;base64,[A-Za-z0-9+/=]+/gi, '');
    const markers = ['\nData (base64', '\nContent preview:', '\n[document', '\n[embedded file'];
    for (const marker of markers) {
      const idx = out.indexOf(marker);
      if (idx !== -1) {
        out = out.slice(0, idx);
      }
    }
    out = out.replace(/\s+/g, ' ').trim();
    if (out.length > 400) out = out.slice(0, 400).trim();
    return out;
  }

  private shouldUseSearch(text: string): boolean {
    const normalized = text.toLowerCase();
    const trimmed = normalized.trim();
    if (trimmed.length < 6) return false;

    // ── Instant reject: user explicitly opts out ──
    const optOut =
      /\b(no\s+search|don't\s+search|do\s+not\s+search|without\s+search|no\s+web|offline|from\s+memory|don't\s+browse|do\s+not\s+browse)\b/;
    if (optOut.test(trimmed)) return false;

    // ── Instant accept: user explicitly wants search ──
    const explicit =
      /\b(search\s+(for|the|online|web)|google\s+it|browse\s+the\s+web|look\s*up|lookup|check\s+online|find\s+online|search\s+online|web\s+search|search\s+the\s+web|google\s+for)\b/;
    if (explicit.test(trimmed)) return true;

    // ── Scoring system ──
    let score = 0;

    // --- Strong signals for search (+3 each) ---

    // Freshness: user wants current/recent/latest info
    const freshness =
      /\b(latest|recent|recently|today|right now|now|current|currently|as of|up[- ]?to[- ]?date|this week|this month|this year|breaking|news|update|updated|newest|live|just announced|just released|just happened|trending|ongoing|happening)\b/;
    if (freshness.test(trimmed)) score += 3;

    // Dynamic/real-time data that changes frequently
    const dynamic =
      /\b(price|prices|pricing|stock|stocks|market|quote|exchange rate|rate|rates|weather|forecast|score|scores|standings|odds|availability|release date|release|launched|launches|earnings|filing|results|schedule|timetable|tickets|traffic|outage|incident|status|downtime|service status|salary|salaries|cost|revenue|valuation|market cap|gdp|inflation|unemployment|interest rate|poll|polls|election|vote|votes)\b/;
    if (dynamic.test(trimmed)) score += 3;

    // --- Medium signals (+2 each) ---

    // Question words asking for factual info (who/what/when/where)
    const factualQuestion =
      /\b(who is|who are|who was|who were|who won|who invented|who founded|who created|what is|what are|what was|what were|what happened|when is|when was|when did|when will|when does|where is|where are|where was|where can|how much|how many|how old|how tall|how far|how long does)\b/;
    if (factualQuestion.test(trimmed)) score += 2;

    // Time references (recent years, relative time)
    // Only match years 2023+ as likely wanting current info
    const timeRef =
      /\b(202[3-9]|20[3-9]\d|yesterday|tomorrow|last week|next week|last month|next month|last year|next year|q[1-4]\s*20\d{2}|this quarter|last quarter)\b/;
    if (timeRef.test(trimmed)) score += 2;

    // Verification / fact-checking
    const verification =
      /\b(confirm|verify|fact[- ]?check|check|source|sources|cite|citation|reference|references|link|links|proof|evidence|according to)\b/;
    if (verification.test(trimmed)) score += 2;

    // Comparisons that often need current data
    const comparison =
      /\b(compare|comparison|vs\.?|versus|better than|best|top\s+\d+|ranking|ranked|benchmark|benchmarks|alternative|alternatives|competitor|competitors)\b/;
    if (comparison.test(trimmed)) score += 2;

    // Named entities that suggest factual lookup (people, companies, products, places)
    const namedEntity =
      /\b(ceo|cto|president|prime minister|founder|company|corporation|startup|government|ministry|agency|university|country|city|capital|population|wikipedia)\b/;
    if (namedEntity.test(trimmed)) score += 2;

    // --- Weak signals (+1 each) ---

    // Question marks suggest information-seeking
    if (/\?/.test(trimmed)) score += 1;

    // "How to" questions that might need current guides
    const howTo = /\b(how to|how do|how can|how should|steps to|guide|tutorial|walkthrough|instructions)\b/;
    if (howTo.test(trimmed)) score += 1;

    // Specific product/tech names that change often
    const techProducts =
      /\b(iphone|ipad|macbook|pixel|galaxy|windows|macos|ios|android|chrome|firefox|safari|chatgpt|gpt[- ]?\d|gemini|claude|openai|google|microsoft|apple|amazon|meta|nvidia|tesla|spacex|bitcoin|ethereum|crypto)\b/;
    if (techProducts.test(trimmed)) score += 1;

    // Regulatory / legal / policy questions
    const regulatory =
      /\b(law|legal|regulation|policy|legislation|act|bill|ruling|court|supreme court|ban|banned|approved|fda|sec|eu|regulation|sanctions|tariff|tax)\b/;
    if (regulatory.test(trimmed)) score += 1;

    // Sports, entertainment, events
    const eventsEntertainment =
      /\b(game|match|tournament|championship|world cup|olympics|super bowl|grammy|oscar|emmy|concert|festival|show|episode|season|premiere|trailer|movie|film|album|song|award)\b/;
    if (eventsEntertainment.test(trimmed)) score += 1;

    // Health / medical queries users often want current info on
    const health =
      /\b(covid|vaccine|pandemic|outbreak|virus|disease|treatment|drug|medication|fda approved|clinical trial|symptoms|diagnosis|cure|side effects|recall)\b/;
    if (health.test(trimmed)) score += 1;

    // --- Penalties (reduce score) ---

    // Summarization / editing tasks (user has the content already)
    const summarize =
      /\b(summarize|rewrite|paraphrase|translate|proofread|edit|grammar|fix typos|rephrase|shorten|simplify this|explain this code)\b/;
    if (summarize.test(trimmed)) score -= 3;

    // Creative writing tasks
    const creative =
      /\b(write me|write a|draft a|story|poem|lyrics|roleplay|fiction|creative|dialogue|letter|essay|speech|toast|joke|riddle)\b/;
    if (creative.test(trimmed)) score -= 3;

    // Pure coding tasks
    const coding =
      /```|`[^`]+`|\b(stack trace|exception|error log|compile|refactor|debug|function|class|method|typescript|javascript|python|java\b|c\+\+|c#|rust|golang|node\.js|react|angular|vue|sql|query|database|api endpoint|algorithm|data structure|binary tree)\b/;
    if (coding.test(trimmed)) score -= 3;

    // Pure math / theoretical
    const math =
      /\b(derive|solve|integral|theorem|proof|equation|calculate|simplify|matrix|eigenvalue|differential|polynomial|factorial)\b/;
    if (math.test(trimmed)) score -= 3;

    // Conversational / greeting (never needs search)
    const conversational =
      /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|got it|understood|good|great|nice|cool|awesome|bye|goodbye|see you)\b/;
    if (conversational.test(trimmed)) score -= 5;

    // Very short inputs that are likely conversational
    if (trimmed.length < 15 && score <= 0) return false;

    return score >= 2;
  }

  private formatSearchMessage(query: string, results: SearchResult[]): string {
    const lines = [
      'Web search results (live, retrieved just now).',
      `Query: ${query}`,
      `Retrieved: ${new Date().toISOString()}`,
      '',
      'Results:',
      ...results.map((result, idx) => {
        const parts: string[] = [];
        parts.push(`${idx + 1}. ${result.title}`);
        parts.push(`   URL: ${result.link}`);
        if (result.date) parts.push(`   Date: ${result.date}`);
        if (result.snippet) parts.push(`   Snippet: ${result.snippet}`);
        if (result.pageContent) {
          parts.push(`   Page content: ${result.pageContent}`);
        }
        return parts.join('\n');
      }),
      '',
      'Instructions:',
      '- Use these search results as your PRIMARY source for answering the user\'s question.',
      '- Cite sources inline using markdown links: [Source Title](url)',
      '- When page content is available, prefer it over snippets for detailed answers.',
      '- If results have dates, mention the recency of information.',
      '- If none of the results directly answer the question, say so honestly.',
    ];

    return lines.join('\n');
  }

  private formatSearchStatusChunk(state: 'start' | 'done', query: string): string {
    return `${SEARCH_STATUS_PREFIX}${JSON.stringify({ state, query })}`;
  }

  /**
   * Detect whether this query needs date-restricted search results.
   * Returns a Google dateRestrict string like "d1" (past day), "w1" (past week), etc.
   */
  private detectDateRestrict(text: string): string | undefined {
    const lower = text.toLowerCase();

    // Today / right now / just happened
    if (/\b(today|right now|just now|just happened|breaking|this morning|tonight|this afternoon)\b/.test(lower)) {
      return 'd1'; // past 1 day
    }

    // This week / recent days
    if (/\b(this week|past few days|last few days|recent days)\b/.test(lower)) {
      return 'w1'; // past 1 week
    }

    // This month / past weeks
    if (/\b(this month|past week|last week|past couple weeks|recent weeks)\b/.test(lower)) {
      return 'm1'; // past 1 month
    }

    // This year / past months
    if (/\b(this year|past month|last month|recent months|past few months)\b/.test(lower)) {
      return 'm3'; // past 3 months
    }

    // Current year reference
    const currentYear = new Date().getFullYear();
    if (new RegExp(`\\b${currentYear}\\b`).test(lower)) {
      return 'y1'; // past 1 year
    }

    // Generic freshness keywords — use past month as sensible default
    if (/\b(latest|newest|recent|recently|current|currently|up[- ]?to[- ]?date|trending|ongoing)\b/.test(lower)) {
      return 'm1'; // past 1 month
    }

    return undefined;
  }

  /**
   * Use a fast LLM call to refine the raw user text into a concise, effective Google search query.
   * Falls back to the raw text if the refinement fails.
   */
  private async refineSearchQuery(rawQuery: string, messages: ChatMessage[]): Promise<string> {
    // For short, already-focused queries, skip refinement
    if (rawQuery.length < 40 && !/\b(it|this|that|they|them|those|these|he|she|his|her)\b/i.test(rawQuery)) {
      return rawQuery;
    }

    try {
      const apiKey = await this.secrets.get('OPENAI_API_KEY');
      if (!apiKey) return rawQuery;

      // Build minimal context: last 3 user/assistant messages
      const recentContext = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-4)
        .map((m) => {
          const text = this.messageToText(m.content);
          return `${m.role}: ${text.slice(0, 150)}`;
        })
        .join('\n');

      const resp = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 60,
            temperature: 0,
            messages: [
              {
                role: 'system',
                content:
                  'You convert user messages into concise Google search queries. Output ONLY the search query text, nothing else. Keep it under 12 words. Include the current year if the user wants recent information. Do not add quotes unless needed for exact phrases.',
              },
              {
                role: 'user',
                content: `Conversation context:\n${recentContext}\n\nUser's latest message: "${rawQuery}"\n\nCurrent date: ${new Date().toISOString().split('T')[0]}\n\nGenerate a concise Google search query:`,
              },
            ],
          }),
        },
        5000, // 5 second timeout — must be fast
      );

      if (!resp.ok) return rawQuery;
      const json = await resp.json().catch(() => null);
      const refined = json?.choices?.[0]?.message?.content?.trim();
      if (refined && refined.length >= 3 && refined.length < 150) {
        this.logger.debug(`Refined search query: "${rawQuery}" → "${refined}"`);
        return refined;
      }
    } catch (err: any) {
      this.logger.debug(`Search query refinement failed (using raw): ${err?.message}`);
    }

    return rawQuery;
  }

  private insertAfterSystem(messages: ChatMessage[], injected: ChatMessage): ChatMessage[] {
    const idx = messages.findIndex((msg) => msg.role !== 'system');
    if (idx === -1) return [...messages, injected];
    return [...messages.slice(0, idx), injected, ...messages.slice(idx)];
  }

  private async *streamWithEntry(params: {
    entry: ModelConfig;
    normalized: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    tried: Set<string>;
  }): AsyncGenerator<string, void, unknown> {
    const { entry, normalized, temperature, maxTokens, tried } = params;
    if (tried.has(entry.modelKey)) {
      throw new InternalServerErrorException(`Fallback loop detected for model ${entry.modelKey}`);
    }
    tried.add(entry.modelKey);

    const fallbackKeyRaw = entry.fallbackModel || DEFAULT_FALLBACK_MODEL || null;
    const fallbackKey =
      fallbackKeyRaw && fallbackKeyRaw !== entry.modelKey ? fallbackKeyRaw : null;

    try {
      switch (entry.provider) {
        case 'openai': {
          for await (const piece of this.streamOpenAI({
            model: entry.providerModel,
            messages: normalized,
            temperature: temperature ?? 1,
            max_tokens: maxTokens,
          }))
            yield piece;
          return;
        }

        case 'google': {
          for await (const piece of this.streamGoogleGemini({
            model: entry.providerModel,
            messages: normalized.map((msg) => ({
              ...msg,
              // Gemini doesn't take OpenAI-style image_url; flatten to text notice
              content: Array.isArray(msg.content)
                ? msg.content
                    .map((part) =>
                      part.type === 'text' ? part.text : '[image attached]'
                    )
                    .join('\n\n')
                : msg.content,
            })),
            temperature: temperature ?? this.config.defaultTemperature,
            max_tokens: maxTokens,
          }))
            yield piece;
          return;
        }

        case 'anthropic': {
          for await (const piece of this.streamAnthropic({
            model: entry.providerModel,
            messages: normalized.map((msg) => ({
              ...msg,
              content: Array.isArray(msg.content)
                ? msg.content
                    .map((part) =>
                      part.type === 'text' ? part.text : '[image attached]'
                    )
                    .join('\n\n')
                : msg.content,
            })),
            temperature: temperature ?? this.config.defaultTemperature,
            max_tokens: maxTokens ?? this.config.defaultMaxTokens,
          }))
            yield piece;
          return;
        }

        case 'mistral': {
          for await (const piece of this.streamMistral({
            model: entry.providerModel,
            messages: normalized.map((msg) => ({
              ...msg,
              content: Array.isArray(msg.content)
                ? msg.content
                    .map((part) =>
                      part.type === 'text' ? part.text : '[image attached]'
                    )
                    .join('\n\n')
                : msg.content,
            })),
            temperature: temperature ?? this.config.defaultTemperature,
            max_tokens: maxTokens,
          }))
            yield piece;
          return;
        }

        case 'deepseek': {
          for await (const piece of this.streamDeepSeek({
            model: entry.providerModel,
            messages: normalized.map((msg) => ({
              ...msg,
              content: Array.isArray(msg.content)
                ? msg.content
                    .map((part) =>
                      part.type === 'text' ? part.text : '[image attached]'
                    )
                    .join('\n\n')
                : msg.content,
            })),
            temperature: temperature ?? this.config.defaultTemperature,
            max_tokens: maxTokens,
          }))
            yield piece;
          return;
        }

        case 'together': {
          for await (const piece of this.streamTogether({
            model: entry.providerModel,
            messages: normalized.map((msg) => ({
              ...msg,
              content: Array.isArray(msg.content)
                ? msg.content
                    .map((part) =>
                      part.type === 'text' ? part.text : '[image attached]'
                    )
                    .join('\n\n')
                : msg.content,
            })),
            temperature: temperature ?? this.config.defaultTemperature,
            max_tokens: maxTokens,
          }))
            yield piece;
          return;
        }

        default: {
          yield `[router] Unsupported provider: ${(entry as any).provider}`;
          return;
        }
      }
    } catch (err: any) {
      const msg = err?.message || '';
      const noContent = /no content/i.test(msg);
      const unsupportedParam = /unsupported parameter|not supported/i.test(msg);
      const upstreamError = /openai error|bad request|400|422/i.test(msg);
      const timedOut = /timed out/i.test(msg);
      const canFallback = fallbackKey && !tried.has(fallbackKey);
      const shouldFallback = canFallback && (noContent || unsupportedParam || upstreamError || timedOut);
      if (!shouldFallback) throw err;

      let fallbackEntry: ModelConfig | null = null;
      try {
        fallbackEntry = await this.modelConfig.getModel(fallbackKey);
      } catch {
        fallbackEntry = null;
      }

      if (!fallbackEntry) throw err;

      for await (const piece of this.streamWithEntry({
        entry: fallbackEntry,
        normalized,
        temperature,
        maxTokens,
        tried,
      })) {
        yield piece;
      }
      return;
    }
  }

  // ---------------------------
  // OpenAI (SSE chat.completions)
  // ---------------------------
  private async *streamOpenAI(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens?: number;
  }) {
    const apiKey = await this.secrets.require('OPENAI_API_KEY');
    const modelName = String(opts.model || '').toLowerCase();
    const forbidsTemperature = /(?:^|-)o1|nano/.test(modelName);
    const forbidsTokens = /nano/.test(modelName);

    // Truncate/guard image sizes to reduce request size
    // Allow large images; default ~50MB base64 unless overridden
    const MAX_IMAGE_CHARS = Math.max(
      10_000,
      this.config.maxImageDataChars ?? 50_000_000,
    );
    const trimImage = (url: string) => {
      if (url.length > MAX_IMAGE_CHARS) {
        // hard fail before hitting provider limits
        throw new BadRequestException(
          `Image is too large for this model. Max size is ~${Math.floor(MAX_IMAGE_CHARS / 1024)}KB base64.`
        );
      }
      return url;
    };

    const normalizedMessages = opts.messages.map((m) => {
      if (!Array.isArray(m.content)) return m;
      const parts = m.content.map((p) =>
        p.type === 'image_url' ? { ...p, image_url: { url: trimImage(p.image_url.url) } } : p
      );
      return { ...m, content: parts };
    });

    const hasImage = opts.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => (p as any)?.type === 'image_url')
    );

    // If images are present, avoid sending temperature for models that disallow it
    const payload: any = {
      model: opts.model,
      messages: normalizedMessages,
      stream: true,
    };
    if (!hasImage && !forbidsTemperature && typeof opts.temperature === 'number') {
      payload.temperature = opts.temperature;
    }
    if (!forbidsTokens && opts.max_tokens) {
      // Newer OpenAI models (e.g., gpt-5 / gpt-4.1 / o1 variants) require max_completion_tokens
      const useCompletionParam = /gpt-5|gpt-4\.1|(?:^|-)o1/i.test(opts.model);
      payload[useCompletionParam ? 'max_completion_tokens' : 'max_tokens'] = opts.max_tokens;
    }

    const resp = await this.fetchWithUpstreamTimeout(
      'OpenAI',
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `OpenAI error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const flattenContent = (content: any): string => {
      if (!content) return '';
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map((c) => flattenContent(c))
          .filter((s) => typeof s === 'string' && s.length > 0)
          .join('');
      }
      if (typeof content === 'object') {
        // Handle OpenAI content blocks (text + reasoning), plus any nested text/value
        return (
          flattenContent((content as any).text) ||
          flattenContent((content as any).value) ||
          flattenContent((content as any).content) ||
          ''
        );
      }
      return '';
    };

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let yielded = false;
    let sawDone = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        for (const l of lines) {
          const line = l.startsWith('data:') ? l.slice(5).trim() : l;

          if (!line || line === '[DONE]') {
            if (line === '[DONE]') sawDone = true;
            continue;
          }

          try {
            const obj = JSON.parse(line);
            const delta = obj?.choices?.[0]?.delta;
            const message = obj?.choices?.[0]?.message;
            const piece =
              flattenContent(delta?.content) ||
              flattenContent(delta?.reasoning_content) ||
              flattenContent(delta?.text) ||
              flattenContent(message?.content) ||
              flattenContent(obj?.content) ||
              flattenContent(obj?.text);
            if (piece && piece.length > 0) {
              yielded = true;
              yield piece;
            }
          } catch {
            // ignore malformed fragments; continue
          }
        }
      }

      if (sawDone) break;
    }

    // Flush any trailing buffer that lacked the final double newline
    const leftover = buffer.trim();
    if (leftover) {
      try {
        const obj = JSON.parse(leftover);
        const delta = obj?.choices?.[0]?.delta;
        const message = obj?.choices?.[0]?.message;
        const piece =
          flattenContent(delta?.content) ||
          flattenContent(delta?.reasoning_content) ||
          flattenContent(delta?.text) ||
          flattenContent(message?.content) ||
          flattenContent(obj?.content) ||
          flattenContent(obj?.text);
        if (piece && piece.length > 0) {
          yielded = true;
          yield piece;
        }
      } catch {
        // ignore
      }
    }

    if (!yielded) {
      throw new InternalServerErrorException(
        `OpenAI stream returned no content for model ${opts.model}`,
      );
    }
  }

// -------------------------------------------
// Google Gemini (NDJSON or Chunked JSON) — robust streaming (no logs)
// -------------------------------------------
private async *streamGoogleGemini(opts: {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature: number;
  max_tokens?: number;
}) {
  const apiKey = await this.secrets.require('GOOGLE_API_KEY');

  const { system, contents } = this.toGeminiContents(opts.messages);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    opts.model,
  )}:streamGenerateContent?alt=sse`;

  const payload: any = {
    contents,
    generationConfig: {
      temperature: opts.temperature,
      ...(opts.max_tokens ? { maxOutputTokens: opts.max_tokens } : {}),
    },
  };
  if (system) payload.systemInstruction = system;

  const resp = await this.fetchWithUpstreamTimeout('Gemini', url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => '');
    throw new InternalServerErrorException(
      `Gemini error ${resp.status}: ${txt || resp.statusText}`,
    );
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawFull = '';
  let totalYielded = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    rawFull += chunk;

    // Parse SSE / NDJSON lines
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      // Strip SSE "data: " prefix (alt=sse mode)
      if (line.startsWith('data: ')) {
        line = line.slice(6);
      } else if (line.startsWith('data:')) {
        line = line.slice(5);
      }
      if (!line || line === '[DONE]') continue;

      try {
        const obj = JSON.parse(line);
        const text =
          obj?.candidates?.[0]?.content?.parts?.[0]?.text ??
          obj?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text)
            .filter(Boolean)
            .join('');
        if (typeof text === 'string' && text.length > 0) {
          totalYielded += text.length;
          yield text;
        }
      } catch {
        // Ignore invalid JSON fragments (multi-line objects)
      }
    }
  }

  // Fallback: The API sent one full JSON instead of NDJSON lines
  if (totalYielded === 0) {
    // Strip SSE "data: " prefixes from the raw response and concatenate JSON objects
    const stripped = rawFull
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && l !== '[DONE]')
      .map((l) => (l.startsWith('data: ') ? l.slice(6) : l.startsWith('data:') ? l.slice(5) : l))
      .filter(Boolean);

    // Try to parse each stripped line individually first
    for (const jsonStr of stripped) {
      try {
        const obj = JSON.parse(jsonStr);
        const text =
          obj?.candidates?.[0]?.content?.parts?.[0]?.text ??
          obj?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text)
            .filter(Boolean)
            .join('');
        if (typeof text === 'string' && text.length > 0) {
          totalYielded += text.length;
          yield text;
        }
      } catch {
        // not valid JSON on its own, try full blob below
      }
    }

    // If still nothing, try parsing the entire raw blob as one JSON
    if (totalYielded === 0) {
      const all = rawFull.trim();
      try {
        const parsed = JSON.parse(all);
        const frames = Array.isArray(parsed) ? parsed : [parsed];

        for (const obj of frames) {
          const text =
            obj?.candidates?.[0]?.content?.parts?.[0]?.text ??
            obj?.candidates?.[0]?.content?.parts
              ?.map((p: any) => p?.text)
              .filter(Boolean)
              .join('');
          if (typeof text === 'string' && text.length > 0) {
            totalYielded += text.length;
            yield text;
          }
        }
      } catch {
        throw new InternalServerErrorException('Gemini stream parse failed');
      }
    }
  }
}



  private toGeminiContents(messages: ChatMessage[]): {
    system?: { role: 'system'; parts: { text: string }[] };
    contents: Array<{ role: 'user' | 'model'; parts: { text: string }[] }>;
  } {
    let systemText = '';
    const contents: Array<{ role: 'user' | 'model'; parts: { text: string }[] }> = [];

    const toText = (content: ChatMessage['content']) => {
      if (Array.isArray(content)) {
        return content
          .map((p) => (p.type === 'text' ? p.text : '[image attached]'))
          .join('\n\n');
      }
      return content ?? '';
    };

    for (const m of messages) {
      if (m.role === 'system') {
        systemText += (systemText ? '\n\n' : '') + toText(m.content);
      } else if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: toText(m.content) }] });
      } else if (m.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: toText(m.content) }] });
      }
    }

    // ✅ Explicitly cast role as the literal 'system' to satisfy TypeScript
    const system = systemText
      ? ({ role: 'system' as const, parts: [{ text: systemText }] })
      : undefined;

    return { system, contents };
  }


  // -----------------------------
  // Anthropic (Messages streaming)
  // -----------------------------
  private async *streamAnthropic(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens: number;
  }) {
    const apiKey = await this.secrets.require('ANTHROPIC_API_KEY');

    const { system, messages } = this.toAnthropicMessages(opts.messages);

    const resp = await this.fetchWithUpstreamTimeout('Anthropic', 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        system,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `Anthropic error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = frame.split('\n');
        let dataLine = '';
        for (const l of lines) if (l.startsWith('data:')) dataLine = l.slice(5).trim();
        if (!dataLine || dataLine === '[DONE]') continue;

        try {
          const obj = JSON.parse(dataLine);
          if (obj?.type === 'content_block_delta' && obj?.delta?.type === 'text_delta') {
            const text = obj.delta.text;
            if (typeof text === 'string' && text.length > 0) yield text;
          }
        } catch { }
      }
    }
  }

  private toAnthropicMessages(messages: ChatMessage[]): {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    let system = '';
    const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const toText = (content: ChatMessage['content']) => {
      if (Array.isArray(content)) {
        return content
          .map((p) => (p.type === 'text' ? p.text : '[image attached]'))
          .join('\n\n');
      }
      return content ?? '';
    };

    for (const m of messages) {
      if (m.role === 'system') system += (system ? '\n\n' : '') + toText(m.content);
      else if (m.role === 'user') out.push({ role: 'user', content: toText(m.content) });
      else if (m.role === 'assistant') out.push({ role: 'assistant', content: toText(m.content) });
    }
    return { system: system || undefined, messages: out };
  }

  // -----------------------------
  // Mistral (OpenAI-compatible SSE)
  // -----------------------------
  private async *streamMistral(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens?: number;
  }) {
    const apiKey = await this.secrets.require('MISTRAL_API_KEY');
    const base = (await this.secrets.get('MISTRAL_BASE_URL')) || 'https://api.mistral.ai/v1';

    const url = `${base.replace(/\/+$/, '')}/chat/completions`;
    const resp = await this.fetchWithUpstreamTimeout('Mistral', url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `Mistral error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
        if (!line || line === '[DONE]') {
          if (line === '[DONE]') return;
          continue;
        }
        try {
          const obj = JSON.parse(line);
          const piece = obj?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece.length > 0) yield piece;
        } catch { }
      }
    }
  }

  // -----------------------------
  // DeepSeek (OpenAI-compatible SSE)
  // -----------------------------
  private async *streamDeepSeek(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens?: number;
  }) {
    const apiKey = await this.secrets.require('DEEPSEEK_API_KEY');
    const base = (await this.secrets.get('DEEPSEEK_BASE_URL')) || 'https://api.deepseek.com/v1';

    const url = `${base.replace(/\/+$/, '')}/chat/completions`;
    const resp = await this.fetchWithUpstreamTimeout('DeepSeek', url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `DeepSeek error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
        if (!line || line === '[DONE]') {
          if (line === '[DONE]') return;
          continue;
        }
        try {
          const obj = JSON.parse(line);
          const piece = obj?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece.length > 0) yield piece;
        } catch { }
      }
    }
  }

  // -----------------------------
  // Together (OpenAI-compatible SSE)
  // -----------------------------
  private async *streamTogether(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens?: number;
  }) {
    const apiKey = await this.secrets.require('TOGETHER_API_KEY');
    const base = (await this.secrets.get('TOGETHER_BASE_URL')) || 'https://api.together.xyz/v1';

    const url = `${base.replace(/\/+$/, '')}/chat/completions`;
    const resp = await this.fetchWithUpstreamTimeout('Together', url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `Together error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
        if (!line || line === '[DONE]') {
          if (line === '[DONE]') return;
          continue;
        }
        try {
          const obj = JSON.parse(line);
          const piece = obj?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece.length > 0) yield piece;
        } catch { }
      }
    }
  }

  private async fetchWithUpstreamTimeout(label: string, url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchWithTimeout(url, init, this.config.requestTimeoutMs);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new InternalServerErrorException(`${label} request timed out`);
      }
      throw new InternalServerErrorException(`${label} request failed: ${err?.message || err}`);
    }
  }
}
