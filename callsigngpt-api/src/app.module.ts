import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { LimitsModule } from './limits/limits.module';
import { LlmModule } from './llm/llm.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
import { SupabaseJwtGuard } from './auth/supabase-jwt.guard';
import { AccountModule } from './account/account.module';
import { ConversationsController } from './conversations/conversations.controller';
import { ConversationsModule } from './conversations/conversations.module';
@Module({
  imports: [
    PrismaModule,   // <-- make Prisma visible in AppModule scope
    AuthModule,
    LimitsModule,
    LlmModule,
    ChatModule,
    HealthModule,
    AccountModule,
    ConversationsModule,
ConfigModule.forRoot({
      isGlobal: true,
      // load these in order; first existing file wins on a given key
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: SupabaseJwtGuard }, // global auth
  ],
})
export class AppModule {}
