import { Module } from '@nestjs/common';
import { LimitsInterceptor } from './limits.interceptor';
import { UsageConfigService } from './usage-config.service';
import { UsageLoggerService } from './usage-logger.service';
import { TierConfigService } from './tier-config.service';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [LlmModule],
  providers: [LimitsInterceptor, UsageConfigService, UsageLoggerService, TierConfigService],
  exports: [LimitsInterceptor, UsageConfigService, UsageLoggerService, TierConfigService],
})
export class LimitsModule {}
