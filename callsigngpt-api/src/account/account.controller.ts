import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { AccountService } from './account.service';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  // Auth required (not marked @Public)
  @Get('me')
  async me(@Req() req: any) {
    const user = req.user as { email?: string } | undefined;
    if (!user?.email) return { ok: false, message: 'No user' };
    const record = await this.account.me(user.email);
    return { ok: true, user: record ?? null };
  }

  @Put()
  async update(@Req() req: any, @Body() dto: UpdateAccountDto) {
    const user = req.user as { email?: string } | undefined;
    if (!user?.email) return { ok: false, message: 'No user' };
    const record = await this.account.update(user.email, dto);
    return { ok: true, user: record };
  }

  // Optional: a public, tiny check
  @Public()
  @Get('ping')
  ping() {
    return { ok: true };
  }
}
