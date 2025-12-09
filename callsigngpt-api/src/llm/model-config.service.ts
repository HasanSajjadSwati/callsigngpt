import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfigService } from '../config/app-config.service';

export type Provider =
  | 'openai'
  | 'google'
  | 'anthropic'
  | 'mistral'
  | 'deepseek'
  | 'together'
  | string;

export type ModelConfig = {
  modelKey: string;
  provider: Provider;
  providerModel: string;
  isPremium: boolean;
  perModelCap: number;
  fallbackModel?: string | null;
  temperatureDefault?: number | null;
  maxTokensDefault?: number | null;
  displayName?: string | null;
};

type Cache = {
  models: Record<string, ModelConfig>;
  expiresAt: number;
};

@Injectable()
export class ModelConfigService {
  private readonly logger = new Logger(ModelConfigService.name);
  private readonly supabase: SupabaseClient;
  private cache?: Cache;
  private readonly cacheMs: number;

  constructor(private readonly config: AppConfigService) {
    const url = this.config.supabaseUrl;
    const serviceKey = this.config.supabaseServiceRoleKey;
    if (!url || !serviceKey) {
      throw new Error('Supabase credentials missing for model config');
    }
    this.supabase = createClient(url, serviceKey);
    this.cacheMs = Math.max(0, Number(this.config.modelConfigCacheMs ?? 0));
  }

  private normalize(key: string): string {
    return (key || '').trim().toLowerCase();
  }

  private normalizeProvider(p: string): Provider {
    const val = this.normalize(p);
    switch (val) {
      case 'openai':
        return 'openai';
      case 'google':
        return 'google';
      case 'anthropic':
        return 'anthropic';
      case 'mistral':
      case 'mistralai':
        return 'mistral';
      case 'deepseek':
        return 'deepseek';
      case 'together':
      case 'together.ai':
        return 'together';
      default:
        if (val) return val;
        throw new InternalServerErrorException('provider missing in model_definitions');
    }
  }

  private validateEntry(row: any): void {
    if (!row?.provider_model || String(row.provider_model).trim().length === 0) {
      throw new InternalServerErrorException(
        `provider_model missing for model ${row?.model_key || '[unknown]'}`,
      );
    }
  }

  private async load(): Promise<Cache> {
    const now = Date.now();
    if (this.cacheMs > 0 && this.cache && this.cache.expiresAt > now) return this.cache;

    let defs;
    try {
      defs = await this.supabase
        .from('model_definitions')
        .select(
          'model_key,provider,provider_model,is_premium,per_model_cap,fallback_model,temperature_default,max_tokens_default,display_name,enabled',
        )
        .eq('enabled', true);
    } catch (err) {
      this.logger.error(`Failed to query Supabase for model definitions: ${String(err)}`);
      throw new InternalServerErrorException('Model config unavailable');
    }

    if (defs.error) throw new InternalServerErrorException(defs.error.message);

    const models: Record<string, ModelConfig> = {};
    for (const row of defs.data || []) {
      const key = this.normalize(row?.model_key);
      if (!key) continue;
      const provider = this.normalizeProvider(String(row?.provider || ''));
      this.validateEntry(row);
      const cap = Number(row?.per_model_cap);
      if (!Number.isFinite(cap) || cap <= 0) {
        throw new InternalServerErrorException(`per_model_cap missing/invalid for model ${row?.model_key}`);
      }
      models[key] = {
        modelKey: key,
        provider,
        providerModel: row?.provider_model,
        isPremium: Boolean(row?.is_premium),
        perModelCap: Math.floor(cap),
        fallbackModel: row?.fallback_model ?? null,
        temperatureDefault: row?.temperature_default ?? null,
        maxTokensDefault: row?.max_tokens_default ?? null,
        displayName: row?.display_name ?? null,
      };
    }

    if (!Object.keys(models).length) {
      throw new InternalServerErrorException('No enabled models configured in Supabase');
    }

    if (this.cacheMs > 0) {
      this.cache = { models, expiresAt: now + this.cacheMs };
      return this.cache;
    }
    return { models, expiresAt: now };
  }

  /**
   * Resolve a friendly key (or alias) to a model definition from Supabase.
   */
  async getModel(key: string): Promise<ModelConfig> {
    const cfg = await this.load();
    const norm = this.normalize(key);
    const entry = cfg.models[norm];
    if (!entry) {
      throw new InternalServerErrorException(`Unknown model key: ${key}`);
    }
    return entry;
  }

  /**
   * List all enabled models (normalized keys) for pickers/UI.
   */
  async listModels(): Promise<ModelConfig[]> {
    const cfg = await this.load();
    return Object.values(cfg.models);
  }
}
