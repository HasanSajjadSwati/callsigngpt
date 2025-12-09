import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service';
import { ModelConfigService } from './model-config.service';
import { SecretsService } from '../secrets/secrets.service';

describe('LlmService', () => {
  let service: LlmService;

  const modelConfigMock = {
    getModel: jest.fn(),
    listModels: jest.fn(),
  };

  const secretsMock = {
    require: jest.fn(async () => 'test-api-key'),
    get: jest.fn(async () => undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        { provide: ModelConfigService, useValue: modelConfigMock },
        { provide: SecretsService, useValue: secretsMock },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
