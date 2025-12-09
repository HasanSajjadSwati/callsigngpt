// src/lib/modelRouter.ts
export type ProviderRoute =
  | { provider: 'openai';   model: string }
  | { provider: 'google';   model: string }
  | { provider: 'mistral';  model: string }
  | { provider: 'deepseek'; model: string }
  | { provider: 'together'; model: string };

export function routeModel(key: string): ProviderRoute {
  // Map your UI keys → provider + provider-specific model names.
  // Add/remove entries here — but DO NOT keep a default branch.
  if (key === 'basic:gpt-4o-mini') {
    return { provider: 'openai', model: 'gpt-4o-mini' };
  }
  if (key === 'basic:gemini-2.5-flash') {
    return { provider: 'google', model: 'gemini-2.5-flash' };
  }
  if (key === 'basic:mistral-medium') {
    return { provider: 'mistral', model: 'mistral-medium' };
  }
  if (key === 'basic:deepseek-v3') {
    return { provider: 'deepseek', model: 'deepseek-chat' };
  }
  if (key === 'open:llama3-70b') {
    // Together’s current model name (adjust if you use a different one)
    return { provider: 'together', model: 'meta-llama/Meta-Llama-3-70B-Instruct-Turbo' };
  }

  // 🚫 No silent fallback:
  throw new Error(`Unknown model key: ${key}`);
}
