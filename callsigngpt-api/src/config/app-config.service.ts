import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.schema';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get host(): string {
    return this.config.get('HOST', { infer: true }) ?? '0.0.0.0';
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get bodyLimitBytes(): number {
    return this.config.get('BODY_LIMIT_BYTES', { infer: true }) ?? 50 * 1024 * 1024;
  }

  get requestTimeoutMs(): number {
    return this.config.get('REQUEST_TIMEOUT_MS', { infer: true }) ?? 60_000;
  }

  get corsOrigins(): true | string[] {
    const raw = this.config.get('CORS_ORIGINS', { infer: true });
    if (!raw) return true; // reflect request origin
    const origins = raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return origins.length ? origins : true;
  }

  get rateLimitMax(): number {
    return this.config.get('RATE_LIMIT_MAX', { infer: true }) ?? 120;
  }

  get rateLimitWindowMs(): number {
    return this.config.get('RATE_LIMIT_WINDOW_MS', { infer: true }) ?? 60_000;
  }

  get supabaseUrl(): string {
    return this.config.get('SUPABASE_URL', { infer: true });
  }

  get supabaseServiceRoleKey(): string {
    return this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });
  }

  get supabaseAnonKey(): string {
    return (
      this.config.get('SUPABASE_ANON_KEY', { infer: true }) ??
      this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true })
    );
  }

  get supabaseJwtSecret(): string | undefined {
    return this.config.get('SUPABASE_JWT_SECRET', { infer: true }) ?? undefined;
  }

  get maxImageDataChars(): number | undefined {
    return this.config.get('MAX_IMAGE_DATA_CHARS', { infer: true }) ?? undefined;
  }

  get modelConfigCacheMs(): number {
    return this.config.get('MODEL_CONFIG_CACHE_MS', { infer: true }) ?? 30_000;
  }
}
