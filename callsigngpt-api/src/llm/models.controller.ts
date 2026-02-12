import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ModelConfigService } from './model-config.service';

type PublicModelInfo = {
  modelKey: string;
  provider: string;
  isPremium: boolean;
  displayName: string | null;
};

@Controller('models')
export class ModelsController {
  constructor(private readonly modelConfig: ModelConfigService) {}

  @Public()
  @Get()
  async list(): Promise<PublicModelInfo[]> {
    const models = await this.modelConfig.listModels();
    return models.map((m) => ({
      modelKey: m.modelKey,
      provider: m.provider,
      isPremium: m.isPremium,
      displayName: m.displayName ?? null,
    }));
  }
}
