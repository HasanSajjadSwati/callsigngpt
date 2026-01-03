import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ModelConfigService } from './model-config.service';
import { ModelsController } from './models.controller';
import { SecretsModule } from '../secrets/secrets.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [SecretsModule, SearchModule],
  providers: [LlmService, ModelConfigService],
  controllers: [ModelsController],
  exports: [LlmService, ModelConfigService],
})
export class LlmModule {}
