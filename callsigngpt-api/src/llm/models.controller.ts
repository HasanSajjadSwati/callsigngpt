import { Controller, Get, Req } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ModelConfigService } from './model-config.service';
import { TierConfigService } from '../limits/tier-config.service';

type PublicModelInfo = {
  modelKey: string;
  provider: string;
  isPremium: boolean;
  displayName: string | null;
  minTier: string;
  minTierLabel: string;
  accessible: boolean;
};

@Controller('models')
export class ModelsController {
  constructor(private readonly modelConfig: ModelConfigService) {}

  @Public()
  @Get()
  async list(@Req() req: any): Promise<PublicModelInfo[]> {
    const models = await this.modelConfig.listModels();
    const userTier = ((req?.user?.tier as string) || 'free').toLowerCase();

    return models.map((m) => ({
      modelKey: m.modelKey,
      provider: m.provider,
      isPremium: m.isPremium,
      displayName: m.displayName ?? null,
      minTier: m.minTier,
      minTierLabel: TierConfigService.tierLabel(m.minTier),
      accessible: TierConfigService.canAccess(userTier, m.minTier),
    }));
  }
}
