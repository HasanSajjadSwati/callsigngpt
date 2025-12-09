import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ModelConfigService, ModelConfig } from './model-config.service';

@Controller('models')
export class ModelsController {
  constructor(private readonly modelConfig: ModelConfigService) {}

  @Public()
  @Get()
  async list(): Promise<ModelConfig[]> {
    return this.modelConfig.listModels();
  }
}
