import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppConfigService } from '../config/app-config.service';
import { SUPABASE_ADMIN_CLIENT } from '../common/supabase/supabase-admin.token';

type UsageResult = { totalCalls: number; dailyCap: number };

@Injectable()
export class UsageLoggerService {
  private readonly logger = new Logger(UsageLoggerService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Atomically increment the per-user/model daily counter in Supabase and
   * return the new total and cap. If the RPC fails, we log and propagate.
   */
  async incrementAndFetch(params: {
    userId: string;
    model: string;
    planTag: string;
    dailyCap: number;
  }): Promise<UsageResult> {
    try {
      const { data, error } = await this.supabase.rpc('increment_user_model_usage', {
        p_user_id: params.userId,
        p_model_key: params.model,
        p_plan: params.planTag,
        p_daily_cap: params.dailyCap,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const totalCalls = Number(row?.total_calls ?? row?.totalCalls);
      const dailyCap = Number(row?.daily_cap ?? row?.dailyCap ?? params.dailyCap);
      if (!Number.isFinite(totalCalls)) {
        throw new Error('RPC returned invalid total_calls');
      }
      return { totalCalls, dailyCap };
    } catch (err) {
      this.logger.error(`Supabase usage increment failed: ${String(err)}`);
      throw err;
    }
  }
}
