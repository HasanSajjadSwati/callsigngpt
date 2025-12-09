import { Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { Redis } from '@upstash/redis';
import { SecretsService } from '../secrets/secrets.service';

@Injectable()
export class RedisService implements OnModuleInit {
  public client?: Redis;

  constructor(private readonly secrets: SecretsService) {}

  async onModuleInit(): Promise<void> {
    const [url, token] = await Promise.all([
      this.secrets.require('UPSTASH_REDIS_REST_URL'),
      this.secrets.require('UPSTASH_REDIS_REST_TOKEN'),
    ]);

    this.client = new Redis({ url, token });
  }

  getClient(): Redis {
    if (!this.client) {
      throw new InternalServerErrorException('Redis client not initialized');
    }
    return this.client;
  }
}
