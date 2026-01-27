import { HttpClient } from './httpClient';
import { getApiBase } from './apiBase';

type ModelMeta = { modelKey: string; displayName?: string | null; provider?: string; providerModel?: string };

const DEFAULT_TTL_MS = 60_000;

class ModelCache {
  private cache: { data: ModelMeta[]; expiresAt: number } | null = null;
  private inflight: Promise<ModelMeta[]> | null = null;
  private readonly client: HttpClient;
  private readonly ttl: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttl = ttlMs;
    this.client = new HttpClient({ baseUrl: getApiBase() });
  }

  async list(): Promise<ModelMeta[]> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.data;
    if (this.inflight) return this.inflight;

    this.inflight = this.client
      .get<ModelMeta[]>('/models')
      .then((response) => {
        const models = Array.isArray(response) ? response : [];
        this.cache = { data: models, expiresAt: now + this.ttl };
        return this.cache.data;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }
}

export const modelCache = new ModelCache();
