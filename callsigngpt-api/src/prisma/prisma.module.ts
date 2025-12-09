import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Module({
  providers: [PrismaService],
  exports: [PrismaService],       // <-- export so other modules (AppModule) can use it
})
export class PrismaModule {}
