import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { SecretsService } from '../secrets/secrets.service';

describe('RedisService', () => {
  let service: RedisService;

  const secretsMock = {
    require: jest.fn(async (key: string) =>
      key === 'UPSTASH_REDIS_REST_URL' ? 'https://example.com' : 'token',
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: SecretsService, useValue: secretsMock },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
