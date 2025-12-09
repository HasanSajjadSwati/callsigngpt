import { Module } from '@nestjs/common';
import { LimitsInterceptor } from './limits.interceptor';
import { UsageConfigService } from './usage-config.service';
import { UsageLoggerService } from './usage-logger.service';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [LlmModule],
  providers: [LimitsInterceptor, UsageConfigService, UsageLoggerService],
  exports: [LimitsInterceptor, UsageConfigService, UsageLoggerService],
})
export class LimitsModule {}
