import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type SecretCache = Record<string, { value?: string; expiresAt: number }>;

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly supabase?: SupabaseClient;
  private readonly cache: SecretCache = {};
  private readonly cacheMs = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (url && serviceKey) {
      this.supabase = createClient(url, serviceKey);
    } else {
      this.logger.warn('Supabase credentials missing; SecretsService will fall back to process.env only.');
    }
  }

  private async fetchFromSupabase(key: string): Promise<string | undefined> {
    if (!this.supabase) {
      throw new InternalServerErrorException('Supabase credentials missing for secrets lookup');
    }

    try {
      const { data, error } = await this.supabase
        .from('app_secrets')
        .select('value')
        .eq('key', key)
        .limit(1);

      if (error) throw error;
      return data?.[0]?.value ?? undefined;
    } catch (err) {
      this.logger.error(`Failed to load secret "${key}" from Supabase: ${String(err)}`);
      throw new InternalServerErrorException(`Secret "${key}" unavailable`);
    }
  }

  /**
   * Return a secret from env (preferred for local dev) or Supabase.
   * Results are cached for a short window to avoid repeated DB hits.
   */
  async get(key: string): Promise<string | undefined> {
    if (process.env[key]) return process.env[key];

    const now = Date.now();
    const cached = this.cache[key];
    if (cached && cached.expiresAt > now) return cached.value;

    const value = await this.fetchFromSupabase(key);
    this.cache[key] = { value, expiresAt: now + this.cacheMs };
    return value;
  }

  /**
   * Same as get() but throws if the secret is missing.
   */
  async require(key: string): Promise<string> {
    const val = await this.get(key);
    if (!val) {
      throw new InternalServerErrorException(`${key} not configured in env or Supabase`);
    }
    return val;
  }
}
