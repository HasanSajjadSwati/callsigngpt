import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../common/supabase/supabase-admin.token';

export type TierLimits = {
  tier: string;
  dailyTotalCap: number;
  perModelCapMultiplier: number;
};

/**
 * Tier hierarchy (ascending): free → pro → pro_plus → enterprise.
 * A user with tier X can access any model whose minTier ≤ X.
 */
const TIER_RANK: Record<string, number> = {
  free: 0,
  pro: 1,
  pro_plus: 2,
  enterprise: 3,
};

/** Default limits when `tier_limits` table is empty or not yet created. */
const DEFAULT_TIER_LIMITS: Record<string, TierLimits> = {
  free: { tier: 'free', dailyTotalCap: 100, perModelCapMultiplier: 1 },
  pro: { tier: 'pro', dailyTotalCap: 500, perModelCapMultiplier: 3 },
  pro_plus: { tier: 'pro_plus', dailyTotalCap: 1000, perModelCapMultiplier: 5 },
  enterprise: { tier: 'enterprise', dailyTotalCap: 5000, perModelCapMultiplier: 10 },
};

@Injectable()
export class TierConfigService {
  private readonly logger = new Logger(TierConfigService.name);
  private cache?: { data: Record<string, TierLimits>; expiresAt: number };
  private readonly cacheMs = 60_000;

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /** Returns the numeric rank of a tier for comparison. */
  static tierRank(tier: string): number {
    return TIER_RANK[(tier || 'free').toLowerCase()] ?? 0;
  }

  /** True if `userTier` can access a model that requires `minTier`. */
  static canAccess(userTier: string, minTier: string): boolean {
    return TierConfigService.tierRank(userTier) >= TierConfigService.tierRank(minTier);
  }

  /** The minimum tier label to show in UI for a given tier name. */
  static tierLabel(tier: string): string {
    switch ((tier || 'free').toLowerCase()) {
      case 'pro': return 'Pro';
      case 'pro_plus': return 'Pro Plus';
      case 'enterprise': return 'Enterprise';
      default: return 'Free';
    }
  }

  /**
   * Load per-tier limits from the `tier_limits` Supabase table.
   * Falls back to sensible defaults if the table doesn't exist yet.
   */
  async getTierLimits(): Promise<Record<string, TierLimits>> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.data;

    try {
      const { data, error } = await this.supabase
        .from('tier_limits')
        .select('tier, daily_total_cap, per_model_cap_multiplier')
        .eq('active', true);

      if (error) throw error;

      const map: Record<string, TierLimits> = { ...DEFAULT_TIER_LIMITS };
      for (const row of data ?? []) {
        const tier = (row.tier || '').toLowerCase();
        if (!tier) continue;
        map[tier] = {
          tier,
          dailyTotalCap: Math.max(1, Math.floor(Number(row.daily_total_cap) || 100)),
          perModelCapMultiplier: Math.max(0.1, Number(row.per_model_cap_multiplier) || 1),
        };
      }

      this.cache = { data: map, expiresAt: now + this.cacheMs };
      return map;
    } catch (err) {
      this.logger.warn(`tier_limits table unavailable, using defaults: ${String(err)}`);
      // Return defaults — the table may not exist yet
      const map = { ...DEFAULT_TIER_LIMITS };
      this.cache = { data: map, expiresAt: now + this.cacheMs };
      return map;
    }
  }

  /** Get limits for a specific tier, with fallback to free defaults. */
  async getLimitsForTier(tier: string): Promise<TierLimits> {
    const all = await this.getTierLimits();
    return all[(tier || 'free').toLowerCase()] ?? all['free'] ?? DEFAULT_TIER_LIMITS['free'];
  }

  /**
   * Calculate the effective per-model cap for a given tier.
   * base cap × tier multiplier.
   */
  async getEffectiveModelCap(baseCap: number, tier: string): Promise<number> {
    const limits = await this.getLimitsForTier(tier);
    return Math.max(1, Math.floor(baseCap * limits.perModelCapMultiplier));
  }
}
