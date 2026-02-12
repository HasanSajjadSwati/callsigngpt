import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ConversationsService, Msg } from './conversations.service';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';

@UseGuards(SupabaseJwtGuard)
@Controller('conversations') // mounted at http://localhost:3001/conversations
export class ConversationsController {
  constructor(private readonly svc: ConversationsService) {}

  @Get()
  async list(@Req() req: FastifyRequest) {
    const user = (req as any).user as { id: string };
    // Sidebar expects: { conversations: [{id,title,updatedAt}, ...] }
    return { conversations: await this.svc.list(user.id) };
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: FastifyRequest) {
    const user = (req as any).user as { id: string };
    return this.svc.get(user.id, id);
  }

  @Post()
  async create(@Req() req: FastifyRequest, @Body() body: { title?: string; messages?: Msg[] }) {
    const user = (req as any).user as { id: string };
    const { title, messages } = body || {};
    return this.svc.create(user.id, title, messages);
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Req() req: FastifyRequest, @Body() body: { title?: string; messages?: Msg[] }) {
    const user = (req as any).user as { id: string };
    const { title, messages } = body || {};
    return this.svc.update(user.id, id, { title, messages });
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: FastifyRequest) {
    const user = (req as any).user as { id: string };
    return this.svc.delete(user.id, id);
  }
}
