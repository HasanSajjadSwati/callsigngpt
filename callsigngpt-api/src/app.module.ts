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
import { ConversationsModule } from './conversations/conversations.module';
import { AppConfigModule } from './config/app-config.module';
import { envSchema } from './config/env.schema';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // load these in order; first existing file wins on a given key
      envFilePath: ['.env.local', '.env'],
      validate: (rawEnv) => envSchema.parse(rawEnv),
    }),
    AppConfigModule,
    PrismaModule,   // <-- make Prisma visible in AppModule scope
    AuthModule,
    LimitsModule,
    LlmModule,
    ChatModule,
    HealthModule,
    AccountModule,
    ConversationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SupabaseJwtGuard }, // global auth
  ],
})
export class AppModule {}
