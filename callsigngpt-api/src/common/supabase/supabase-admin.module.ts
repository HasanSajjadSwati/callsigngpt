import { Global, Module } from '@nestjs/common';
import { SUPABASE_ADMIN_CLIENT } from './supabase-admin.token';
import { createClient } from '@supabase/supabase-js';
import { AppConfigService } from '../../config/app-config.service';
import { AppConfigModule } from '../../config/app-config.module';

/**
 * Provides a single shared SupabaseClient (service-role) across the app.
 * Import this module once; inject via `@Inject(SUPABASE_ADMIN_CLIENT)`.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: SUPABASE_ADMIN_CLIENT,
      useFactory: (config: AppConfigService) => {
        const url = config.supabaseUrl;
        const serviceKey = config.supabaseServiceRoleKey;
        if (!url || !serviceKey) {
          throw new Error('Supabase credentials missing (URL / service role key)');
        }
        return createClient(url, serviceKey);
      },
      inject: [AppConfigService],
    },
  ],
  exports: [SUPABASE_ADMIN_CLIENT],
})
export class SupabaseAdminModule {}
