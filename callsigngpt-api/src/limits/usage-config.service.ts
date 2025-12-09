import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ModelConfig, ModelConfigService } from '../llm/model-config.service';

export type ModelRuleConfig = Pick<ModelConfig, 'modelKey' | 'isPremium' | 'perModelCap' | 'fallbackModel'>;

export type AppSettingsConfig = {
  dailyQuotaResetHours: number;
  fallbackModel?: string | null;
};

export type UsageConfig = {
  app: AppSettingsConfig;
  modelRules: Record<string, ModelRuleConfig>;
};

@Injectable()
export class UsageConfigService {
  private readonly logger = new Logger(UsageConfigService.name);
  private readonly supabase: SupabaseClient;
  private cache?: { value: UsageConfig; expiresAt: number };
  private readonly cacheMs = 60_000; // light in-memory cache to avoid repeated hits

  constructor(private readonly modelConfig: ModelConfigService) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !serviceKey) {
      throw new Error('Supabase credentials missing for usage caps');
    }
    this.supabase = createClient(url, serviceKey);
  }

  isGpt5Model(model: string): boolean {
    return /gpt-5/i.test(model || '');
  }

  isPremiumModel(model: string): boolean {
    return /gpt-5|gpt-4|gpt-4o|claude-3|gemini-1\.5-pro|mistral-large|llama-405b|deepseek-v3/i.test(
      model || '',
    );
  }

  private requirePositive(name: string, val: any): number {
    const n = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(n) || n <= 0) {
      throw new InternalServerErrorException(`${name} missing or invalid in Supabase config`);
    }
    return n;
  }

  private extractSettings(settings: any[] | null): AppSettingsConfig {
    const map: Record<string, any> = {};
    for (const row of settings || []) {
      if (!row?.key) continue;
      map[String(row.key).toUpperCase()] = row.value;
    }
    const resetHours = this.requirePositive('DAILY_QUOTA_RESET_HOURS', map['DAILY_QUOTA_RESET_HOURS']);
    const fallbackModel = map['FALLBACK_MODEL'];
    return {
      dailyQuotaResetHours: Math.max(1, Math.floor(resetHours)),
      fallbackModel: typeof fallbackModel === 'string' ? fallbackModel : null,
    };
  }

  private buildConfig(
    models: ModelConfig[],
    settings: any[] | null,
  ): UsageConfig {
    const app = this.extractSettings(settings);

    const ruleMap: Record<string, ModelRuleConfig> = {};
    for (const model of models || []) {
      const key = String(model?.modelKey || '').toLowerCase().trim();
      if (!key) continue;
      const perModelCap = this.requirePositive(`per_model_cap (${key})`, model?.perModelCap);
      ruleMap[key] = {
        modelKey: key,
        isPremium: Boolean(model?.isPremium),
        perModelCap: Math.floor(perModelCap),
        fallbackModel: model?.fallbackModel ?? null,
      };
    }

    return {
      app,
      modelRules: ruleMap,
    };
  }

  async getConfig(): Promise<UsageConfig> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    try {
      const [models, settings] = await Promise.all([
        this.modelConfig.listModels(),
        this.supabase.from('app_settings').select('key,value'),
      ]);

      if (settings.error) throw settings.error;

      const config = this.buildConfig(models, settings.data);
      this.cache = { value: config, expiresAt: now + this.cacheMs };
      return config;
    } catch (err) {
      this.logger.error(`Failed to load usage config from Supabase: ${String(err)}`);
      throw new InternalServerErrorException('Usage caps config unavailable');
    }
  }

  findRuleForModel(model: string, cfg: UsageConfig): ModelRuleConfig | undefined {
    const key = (model || '').toLowerCase();
    if (!key) return undefined;
    if (cfg.modelRules[key]) return cfg.modelRules[key];
    let best: ModelRuleConfig | undefined;
    for (const [ruleKey, rule] of Object.entries(cfg.modelRules)) {
      if (key.includes(ruleKey)) {
        if (!best || ruleKey.length > (best.modelKey?.length || 0)) {
          best = rule;
        }
      }
    }
    return best;
  }
}
