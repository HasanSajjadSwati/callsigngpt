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
    if (!raw) {
      // In production, do NOT reflect all origins — require explicit configuration
      if (this.isProduction) {
        throw new Error(
          'CORS_ORIGINS must be set in production (comma-separated list of allowed origins)',
        );
      }
      return true; // allow all in development only
    }
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
    const key = this.config.get('SUPABASE_ANON_KEY', { infer: true });
    if (!key) {
      throw new Error(
        'SUPABASE_ANON_KEY is not configured. ' +
        'Do NOT fall back to the service role key — it has admin privileges.',
      );
    }
    return key;
  }

  get supabaseJwtSecret(): string {
    const secret = this.config.get('SUPABASE_JWT_SECRET', { infer: true });
    if (!secret) {
      throw new Error(
        'SUPABASE_JWT_SECRET is required for local JWT verification.',
      );
    }
    return secret;
  }

  get maxImageDataChars(): number | undefined {
    return this.config.get('MAX_IMAGE_DATA_CHARS', { infer: true }) ?? undefined;
  }

  get modelConfigCacheMs(): number {
    return this.config.get('MODEL_CONFIG_CACHE_MS', { infer: true }) ?? 30_000;
  }

  /** Default max response tokens when not specified by client or model config. */
  get defaultMaxTokens(): number {
    return this.config.get('DEFAULT_MAX_TOKENS', { infer: true }) ?? 4096;
  }

  /** Default temperature when not specified by client or model config. */
  get defaultTemperature(): number {
    return this.config.get('DEFAULT_TEMPERATURE', { infer: true }) ?? 0.7;
  }
}
