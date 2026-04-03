import { Injectable, InternalServerErrorException } from '@nestjs/common';

/** Set of env key names known to hold sensitive secrets. */
const SENSITIVE_KEYS = new Set([
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'ANTHROPIC_API_KEY',
  'MISTRAL_API_KEY',
  'DEEPSEEK_API_KEY',
  'TOGETHER_API_KEY',
  'GOOGLE_SEARCH_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'DATABASE_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]);

@Injectable()
export class SecretsService {
  private readEnv(key: string): string | undefined {
    const raw = process.env[key];
    if (!raw) return undefined;
    const value = raw.trim();
    return value.length ? value : undefined;
  }

  /**
   * Return a secret from the environment.
   */
  async get(key: string): Promise<string | undefined> {
    return this.readEnv(key);
  }

  /**
   * Same as get() but throws if the secret is missing.
   * Error message never reveals the key name for sensitive keys.
   */
  async require(key: string): Promise<string> {
    const val = this.readEnv(key);
    if (!val) {
      const safeLabel = SENSITIVE_KEYS.has(key) ? 'A required secret' : key;
      throw new InternalServerErrorException(`${safeLabel} not configured`);
    }
    return val;
  }

  /** Check if a key name holds a sensitive value (for log redaction). */
  static isSensitive(key: string): boolean {
    return SENSITIVE_KEYS.has(key);
  }

  /** Mask a secret for safe logging — show first 4 and last 4 chars only. */
  static redact(value: string): string {
    if (value.length <= 10) return '***';
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }
}
