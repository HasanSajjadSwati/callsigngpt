// src/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { LlmModule } from '../llm/llm.module';
import { LimitsModule } from '../limits/limits.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [LlmModule, LimitsModule, AuthModule, PrismaModule], // <-- add PrismaModule
  controllers: [ChatController],
})
export class ChatModule {}
