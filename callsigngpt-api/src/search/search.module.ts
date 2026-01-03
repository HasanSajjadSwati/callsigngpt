import { Module } from '@nestjs/common';
import { GoogleSearchService } from './google-search.service';
import { SecretsModule } from '../secrets/secrets.module';

@Module({
  imports: [SecretsModule],
  providers: [GoogleSearchService],
  exports: [GoogleSearchService],
})
export class SearchModule {}
