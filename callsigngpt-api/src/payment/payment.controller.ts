// src/payment/payment.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { PaymentService } from './payment.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('payment')
@UseGuards(SupabaseJwtGuard)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * GET /payment/plans — public, returns active plan pricing for the checkout UI.
   * All values (prices, tax rates) come from Supabase `plan_pricing` table.
   */
  @Public()
  @Get('plans')
  async getPlans() {
    return this.paymentService.getActivePlans();
  }

  /**
   * POST /payment/calculate — authenticated, calculates total with discounts & tax.
   * Promo codes and domain discounts are validated server-side.
   */
  @Post('calculate')
  async calculate(
    @Req() req: any,
    @Body() body: { planId: string; billingPeriod?: 'monthly' | 'annual'; promoCode?: string },
  ) {
    const user = req.user as { id: string; email: string };
    if (!body.planId) throw new BadRequestException('planId is required');

    return this.paymentService.calculateCheckout({
      planId: body.planId,
      billingPeriod: body.billingPeriod ?? 'monthly',
      promoCode: body.promoCode,
      userEmail: user.email,
    });
  }

  /**
   * POST /payment/validate-promo — authenticated, checks if a promo code is valid.
   */
  @Post('validate-promo')
  async validatePromo(
    @Body() body: { code: string; planId: string },
  ) {
    if (!body.code || !body.planId) {
      throw new BadRequestException('code and planId are required');
    }
    const promo = await this.paymentService.validatePromoCode(body.code, body.planId);
    if (!promo) {
      return { valid: false, message: 'Invalid or expired promo code' };
    }
    return {
      valid: true,
      discountPercent: promo.discount_percent,
    };
  }

  /**
   * POST /payment/create-session — authenticated, starts a checkout session.
   * Returns a redirect URL to the payment gateway's hosted checkout page.
   * Card data is handled entirely by the gateway — never touches our server.
   */
  @Post('create-session')
  async createSession(
    @Req() req: any,
    @Body() body: { planId: string; billingPeriod?: 'monthly' | 'annual'; promoCode?: string },
  ) {
    const user = req.user as { id: string; email: string };
    if (!body.planId) throw new BadRequestException('planId is required');

    return this.paymentService.createCheckoutSession({
      userId: user.id,
      userEmail: user.email,
      planId: body.planId,
      billingPeriod: body.billingPeriod ?? 'monthly',
      promoCode: body.promoCode,
    });
  }

  /**
   * POST /payment/webhook — public (gateway-authenticated via signature).
   * Receives payment confirmation events from the payment gateway.
   * Verifies the webhook signature before processing any data.
   */
  @Public()
  @Post('webhook')
  async handleWebhook(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const signature = (req.headers['stripe-signature'] ||
      req.headers['x-webhook-signature'] ||
      '') as string;

    const rawBody = req.body as Buffer;

    const handled = await this.paymentService.handleWebhook(rawBody, signature);
    if (!handled) {
      this.logger.warn('Webhook rejected — invalid signature or unhandled event');
      return res.status(400).send({ error: 'Invalid signature' });
    }
    return res.status(200).send({ received: true });
  }

  /**
   * POST /payment/cancel — authenticated, cancels the user's subscription.
   */
  @Post('cancel')
  async cancel(@Req() req: any) {
    const user = req.user as { id: string };
    await this.paymentService.cancelSubscription(user.id);
    return { ok: true, message: 'Subscription cancelled. You are now on the Free plan.' };
  }
}
