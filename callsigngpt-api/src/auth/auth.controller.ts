// src/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  UseGuards,
  Req,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from './supabase-admin.service';

type Plan = 'free';

@Controller('auth')
@UseGuards(SupabaseJwtGuard)
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  /**
   * Return the current user's app profile (and auto-create if missing).
   */
  @Get('me')
  async me(@Req() req: any) {
    const { id, email } = req.user as { id: string; email: string };

    // Ensure there's a row for this user in your app DB
    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { id, email }, // if your id is db-generated, remove "id" here
    });

    // return a minimal, stable shape
    return {
      id: user.id,
      email: user.email,
      name: (user as any).name ?? null,
      phone: (user as any).phone ?? null,
      tier: 'free',
    };
  }

  /**
   * Frontend calls this right after sign-up to ensure a DB row exists,
   * and to optionally set display name on first sync.
   */
  @Post('sync')
  async sync(@Req() req: any, @Body() body: { name?: string; phone?: string }) {
    const { id, email } = req.user as { id: string; email: string };

    const hasProfileUpdates = body.name !== undefined || body.phone !== undefined;
    let user;

    if (!hasProfileUpdates) {
      user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await this.prisma.user.create({ data: { id, email } });
      }
    } else {
      user = await this.prisma.user.upsert({
        where: { email },
        update: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
        },
        create: {
          id,
          email,
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
        },
      });

      await this.supabaseAdmin.updateUserMeta(id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
      });
    }

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: (user as any).name ?? null,
        phone: (user as any).phone ?? null,
        tier: 'free',
      },
    };
  }

  /**
   * Update name / phone in your app DB (and user_metadata in Supabase).
   */
  @Post('update-profile')
  async updateProfile(
    @Req() req: any,
    @Body() dto: { name?: string; phone?: string },
  ) {
    const { id, email } = req.user as { id: string; email: string };

    const user = await this.prisma.user.update({
      where: { email },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
    });

    await this.supabaseAdmin.updateUserMeta(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
    });

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: (user as any).name ?? null,
        phone: (user as any).phone ?? null,
        tier: 'free',
      },
    };
  }

  /**
   * Update the user's plan/tier in your app DB.
   */
  @Post('update-plan')
  async updatePlan(@Req() req: any, @Body() dto: { plan: Plan }) {
    // Tiering disabled: always free, ignore requested plan.
    const { email } = req.user as { id: string; email: string };
    await this.prisma.user.update({
      where: { email },
      data: { tier: 'free' },
    });

    return {
      ok: true,
      user: {
        id: (req.user as any).id,
        email,
        name: ((req.user as any).name as string) ?? null,
        phone: ((req.user as any).phone as string) ?? null,
        tier: 'free',
      },
    };
  }

  /**
   * Change password:
   * 1) verify old password
   * 2) set new password
   */
  @Post('change-password')
  async changePassword(
    @Req() req: any,
    @Body() dto: { oldPassword: string; newPassword: string },
  ) {
    const { id, email } = req.user as { id: string; email: string };

    if (!dto?.oldPassword || !dto?.newPassword) {
      throw new BadRequestException('oldPassword and newPassword are required');
    }

    const ok = await this.supabaseAdmin.verifyPassword(email, dto.oldPassword);
    if (!ok) throw new BadRequestException('Old password is incorrect');

    await this.supabaseAdmin.setPassword(id, dto.newPassword);

    return { ok: true };
  }

  @Delete('account')
  async deleteAccount(@Req() req: any) {
    const { id, email } = req.user as { id: string; email: string };
    const warnings: string[] = [];

    async function bestEffort<T>(
      label: string,
      fn: () => Promise<T>,
      opts?: { required?: boolean },
    ) {
      try {
        return await fn();
      } catch (error) {
        console.warn(`[auth.deleteAccount] ${label} failed:`, error);
        if (opts?.required) {
          throw new InternalServerErrorException(`${label} failed`);
        }
        warnings.push(`${label} failed`);
        return null;
      }
    }

    const deletedById = await bestEffort('delete prisma user by id', async () => {
      await this.prisma.user.delete({ where: { id } });
    });
    if (deletedById === null) {
      await bestEffort('delete prisma user by email', async () => {
        await this.prisma.user.delete({ where: { email } });
      });
    }

    await bestEffort('delete conversations', async () => {
      await this.supabaseAdmin.deleteUserConversations(id);
    });
    await bestEffort('revoke user sessions', async () => {
      await this.supabaseAdmin.revokeUserSessions(id);
    });
    await bestEffort(
      'delete supabase auth user',
      async () => {
        await this.supabaseAdmin.deleteUser(id);
      },
      { required: true },
    );

    return { ok: true, warnings };
  }
}
