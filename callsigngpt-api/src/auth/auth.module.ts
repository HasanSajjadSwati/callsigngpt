// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseAdminService } from './supabase-admin.service';
import { SupabaseJwtGuard } from './supabase-jwt.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [SupabaseAdminService, SupabaseJwtGuard],
  exports: [],
})
export class AuthModule {}
