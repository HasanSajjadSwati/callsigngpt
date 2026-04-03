// src/payment/payment.module.ts
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { AppConfigModule } from '../config/app-config.module';
import { SupabaseAdminModule } from '../common/supabase/supabase-admin.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AppConfigModule, SupabaseAdminModule, PrismaModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
