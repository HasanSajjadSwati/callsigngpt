import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { SecretsModule } from '../secrets/secrets.module';

@Module({
  imports: [SecretsModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
