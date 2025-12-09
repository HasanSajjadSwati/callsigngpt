import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3001),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  CORS_ORIGINS: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  MAX_IMAGE_DATA_CHARS: z.coerce.number().int().positive().optional(),
  MODEL_CONFIG_CACHE_MS: z.coerce.number().int().nonnegative().default(30_000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  DATABASE_URL: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),

  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
