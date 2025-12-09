// callsigngpt-api/src/chat/chat.controller.ts

import { Controller, Get, Post, Body, Req, Res, UseInterceptors, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LimitsInterceptor } from '../limits/limits.interceptor';
import { Public } from '../common/decorators/public.decorator';
import { LlmService } from '../llm/llm.service';
import { ModelConfigService } from '../llm/model-config.service';

@UseInterceptors(LimitsInterceptor)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly llm: LlmService,
    private readonly modelConfig: ModelConfigService,
  ) {}

  @Public()
  @Get('ping')
  ping() {
    return { ok: true };
  }

  // Quick manual test endpoint
  @Public()
  @Post('test')
  async test(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const origin = (req.headers.origin as string) || '*';
    res.status(200);
    res.raw.setHeader('Access-Control-Allow-Origin', origin);
    res.raw.setHeader('Vary', 'Origin');
    res.raw.setHeader('Access-Control-Allow-Credentials', 'true');

    res.raw.setHeader('Content-Type', 'text/event-stream');
    res.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    res.raw.setHeader('Connection', 'keep-alive');
    res.raw.flushHeaders?.();

    const sendDelta = (s: string) =>
      res.raw.write(`data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}\n\n`);

    sendDelta('hello ');
    setTimeout(() => sendDelta('world'), 300);
    setTimeout(() => { res.raw.write('data: [DONE]\n\n'); res.raw.end(); }, 600);
  }

  @Post()
  async chat(@Body() body: any, @Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const user = (req as any).user as { id: string; tier?: string } | undefined;
    if (!user?.id) throw new BadRequestException('Unauthorized');
    const overrideModel = (req as any).llmOverrideModel as string | undefined;
    const fallbackReason = (req as any).llmFallbackReason as string | undefined;
    if (overrideModel) {
      body.model = overrideModel;
    }

    const origin = (req.headers.origin as string) || '*';
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
      const msg = err?.message || 'stream failed';
      try {
        // Also surface error as a data frame so the client displays it
        res.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.raw.write('data: [DONE]\n\n');
      } catch {}
      res.raw.end();
      throw err;
    }
  }

  @Public()
  @Post('gemini-test')
  async geminiTest(@Body() body: any, @Res() res: FastifyReply) {
    res.status(200);
    res.raw.setHeader('Content-Type', 'text/event-stream');
    res.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    res.raw.setHeader('Connection', 'keep-alive');
    res.raw.flushHeaders?.();

    // Pick a model from Supabase (prefer Google/Gemini; fallback to any enabled model)
    const models = await this.modelConfig.listModels();
    const chosen =
      models.find((m) => m.provider === 'google') ||
      models.find((m) => m.modelKey) ||
      null;
    if (!chosen) {
      throw new InternalServerErrorException('No models configured');
    }

    try {
      for await (const chunk of this.llm.stream(
        { model: chosen.modelKey, messages: body?.messages ?? [{ role: 'user', content: 'Say hi' }] },
        undefined
      )) {
        res.raw.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
      }
      res.raw.write('data: [DONE]\n\n');
      res.raw.end();
    } catch (e: any) {
      try { res.raw.write(`event: error\ndata: ${JSON.stringify({ message: e?.message || 'error' })}\n\n`); } catch {}
      res.raw.end();
    }
  }
}
