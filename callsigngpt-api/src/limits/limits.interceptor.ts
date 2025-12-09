import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { UsageConfigService, ModelRuleConfig } from './usage-config.service';
import { UsageLoggerService } from './usage-logger.service';

const pickModel = (req: any) =>
  req.body?.model || req.query?.model || req.headers['x-llm-model'] || 'unknown';

@Injectable()
export class LimitsInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly usageConfig: UsageConfigService,
    private readonly usageLogger: UsageLoggerService,
  ) {}

  private async precheck(userId: string, model: string, req: any) {
    const cfg = await this.usageConfig.getConfig();
    const rule: ModelRuleConfig | undefined = this.usageConfig.findRuleForModel(model, cfg);
    if (!rule) {
      throw new InternalServerErrorException(`Model rule not configured in Supabase for model "${model}"`);
    }
    if (!rule.perModelCap || rule.perModelCap <= 0) {
      throw new InternalServerErrorException(`per_model_cap missing/invalid for model "${rule.modelKey}"`);
    }
    const wantsGpt5 = this.usageConfig.isGpt5Model(model);
    const hours = Math.max(1, Math.floor(Number(cfg.app.dailyQuotaResetHours)));
    const ruleKey = rule.modelKey || model;
    let effectiveModel = model;

    const cap = Math.max(1, Math.floor(Number(rule.perModelCap)));

    const usage = await this.usageLogger.incrementAndFetch({
      userId,
      model: ruleKey,
      planTag: (req?.user?.tier as string) || 'model-rule',
      dailyCap: cap,
    });

    if (usage.totalCalls > cap) {
      const fallbackModel =
        rule?.fallbackModel ?? cfg.app.fallbackModel ?? null;
      if (fallbackModel) {
        effectiveModel = fallbackModel;
        if (req?.body) req.body.model = fallbackModel;
        if (req) {
          (req as any).llmOverrideModel = fallbackModel;
          (req as any).llmFallbackReason = wantsGpt5 ? 'quota-exceeded-gpt5' : 'quota-exceeded';
        }
      } else {
        throw new HttpException(
          `Daily quota exceeded. Try again in ${hours} hour${hours === 1 ? '' : 's'} (model=${ruleKey}, cap=${cap})`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // monthly counters now tracked via Supabase usage table; no Redis increments here
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return next.handle();

    const req = context.switchToHttp().getRequest();
    const user: { id: string; tier?: string } | undefined = req.user;
    if (!user?.id) return next.handle(); // Auth guard will respond

    const model = String(pickModel(req));
    await this.precheck(user.id, model, req);
    return next.handle();
  }
}
