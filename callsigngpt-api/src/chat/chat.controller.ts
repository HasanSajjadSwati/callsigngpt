// callsigngpt-api/src/chat/chat.controller.ts

import { Controller, Get, Post, Body, Req, Res, UseInterceptors, BadRequestException, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LimitsInterceptor } from '../limits/limits.interceptor';
import { Public } from '../common/decorators/public.decorator';
import { LlmService } from '../llm/llm.service';
import { AppConfigService } from '../config/app-config.service';
import { ChatDto } from '../llm/dto/chat.dto';

@UseInterceptors(LimitsInterceptor)
@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);
  constructor(
    private readonly llm: LlmService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get('ping')
  ping() {
    return { ok: true };
  }

  private getSafeOrigin(requestOrigin: string | undefined): string {
    const configured = this.config.corsOrigins;
    if (configured === true) return requestOrigin || '*';
    if (!requestOrigin) return configured[0] || '*';
    return configured.includes(requestOrigin) ? requestOrigin : configured[0] || '*';
  }

  @Post()
  async chat(@Body() body: ChatDto, @Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const user = (req as any).user as { id: string; tier?: string } | undefined;
    if (!user?.id) throw new BadRequestException('Unauthorized');
    const overrideModel = (req as any).llmOverrideModel as string | undefined;
    const fallbackReason = (req as any).llmFallbackReason as string | undefined;
    if (overrideModel) {
      body.model = overrideModel;
    }

    const origin = this.getSafeOrigin(req.headers.origin as string | undefined);
    res.status(200);
    res.raw.setHeader('Access-Control-Allow-Origin', origin);
    res.raw.setHeader('Vary', 'Origin');
    res.raw.setHeader('Access-Control-Allow-Credentials', 'true');

    res.raw.setHeader('Content-Type', 'text/event-stream');
    res.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    res.raw.setHeader('Connection', 'keep-alive');
    res.raw.flushHeaders?.();

    if (fallbackReason === 'quota-exceeded-gpt5') {
      const notice = 'GPT-5 daily limit reached. Using GPT-4o Mini (free) for this request.';
      try {
        res.raw.write(`data: ${JSON.stringify({ text: notice })}\n\n`);
      } catch {
        // swallow
      }
    }

    // Helpful debug: see what provider/model we normalized to
    try {
      for await (const chunk of this.llm.stream(body, user)) {
        // Emit OpenAI-style SSE frames so the web parser can handle all providers uniformly
        res.raw.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
      }
      res.raw.write('data: [DONE]\n\n');
      res.raw.end();
    } catch (err: any) {
      const rawMsg = err?.message || 'stream failed';
      this.logger.error(`Chat stream error: ${rawMsg}`, err?.stack);
      // Sanitize: only expose safe error messages to the client
      const safeMsg = /quota|limit|unauthorized|forbidden/i.test(rawMsg)
        ? rawMsg
        : 'An error occurred while processing your request.';
      try {
        res.raw.write(`data: ${JSON.stringify({ error: safeMsg })}\n\n`);
        res.raw.write('data: [DONE]\n\n');
      } catch {}
      res.raw.end();
    }
  }
}
