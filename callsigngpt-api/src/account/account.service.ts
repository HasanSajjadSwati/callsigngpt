import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async me(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(email: string, dto: UpdateAccountDto) {
    return this.prisma.user.update({
      where: { email },
      data: {
        name: dto.name ?? undefined,
        phone: dto.phone ?? undefined,
      },
    });
  }
}
