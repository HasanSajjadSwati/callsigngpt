// src/payment/payment.service.ts
//
// PAYMENT SECURITY ARCHITECTURE
// ==============================
// 1. Card credentials NEVER touch our servers — all payment processing
//    uses the gateway's client-side tokenization / hosted checkout.
// 2. We only store: payment intent IDs, subscription status, plan ID.
// 3. Card data is NOT stored, logged, or transmitted through our backend.
// 4. Webhook signature verification ensures payment events are authentic.
// 5. All pricing (plan prices, tax rates) are fetched from Supabase tables
//    so they can be reconfigured without code changes.
// 6. Promo codes and domain discounts are validated server-side only.
//

import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { SUPABASE_ADMIN_CLIENT } from '../common/supabase/supabase-admin.token';

export interface PlanPricing {
  id: string;
  name: string;
  monthly_price: number;
  annual_price: number | null;
  currency: string;
  tax_rate: number; // percentage, e.g. 17 for 17%
  active: boolean;
}

export interface PromoCode {
  code: string;
  discount_percent: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  current_uses: number;
  active: boolean;
  applicable_plans: string[] | null; // null = all plans
}

export interface DomainDiscount {
  domain: string;
  discount_percent: number;
  active: boolean;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Fetch all active plan pricing from Supabase (for checkout display).
   * Pricing is fully configurable via Supabase console.
   */
  async getActivePlans(): Promise<PlanPricing[]> {
    const { data, error } = await this.supabase
      .from('plan_pricing')
      .select('id, name, monthly_price, annual_price, currency, tax_rate, active')
      .eq('active', true)
      .order('monthly_price', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch plans: ${error.message}`);
      throw new BadRequestException('Unable to load pricing');
    }
    return data ?? [];
  }

  /**
   * Calculate the final checkout amount including tax and discounts.
   * All discount validation happens server-side only.
   */
  async calculateCheckout(params: {
    planId: string;
    billingPeriod: 'monthly' | 'annual';
    promoCode?: string;
    userEmail: string;
  }): Promise<{
    plan: PlanPricing;
    basePrice: number;
    discountPercent: number;
    discountAmount: number;
    taxableAmount: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
  }> {
    // 1. Fetch the plan
    const { data: plan, error: planErr } = await this.supabase
      .from('plan_pricing')
      .select('*')
      .eq('id', params.planId)
      .eq('active', true)
      .single();

    if (planErr || !plan) {
      throw new BadRequestException('Invalid or inactive plan');
    }

    const basePrice =
      params.billingPeriod === 'annual' && plan.annual_price != null
        ? plan.annual_price
        : plan.monthly_price;

    // 2. Calculate discount (promo code OR domain discount — take higher)
    let discountPercent = 0;

    // Check promo code
    if (params.promoCode) {
      const promo = await this.validatePromoCode(params.promoCode, params.planId);
      if (promo) {
        discountPercent = promo.discount_percent;
      }
    }

    // Check domain discount
    const domain = params.userEmail.split('@')[1]?.toLowerCase();
    if (domain) {
      const domainDiscount = await this.getDomainDiscount(domain);
      if (domainDiscount && domainDiscount.discount_percent > discountPercent) {
        discountPercent = domainDiscount.discount_percent;
      }
    }

    // 3. Calculate amounts
    const discountAmount = Math.round(basePrice * (discountPercent / 100));
    const taxableAmount = basePrice - discountAmount;
    const taxAmount = Math.round(taxableAmount * (plan.tax_rate / 100));
    const totalAmount = taxableAmount + taxAmount;

    return {
      plan,
      basePrice,
      discountPercent,
      discountAmount,
      taxableAmount,
      taxAmount,
      totalAmount,
      currency: plan.currency,
    };
  }

  /**
   * Validate a promo code. Returns null if invalid/expired/exhausted.
   */
  async validatePromoCode(code: string, planId: string): Promise<PromoCode | null> {
    const { data, error } = await this.supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .eq('active', true)
      .single();

    if (error || !data) return null;

    const now = new Date().toISOString();
    if (data.valid_from && data.valid_from > now) return null;
    if (data.valid_until && data.valid_until < now) return null;
    if (data.max_uses != null && data.current_uses >= data.max_uses) return null;
    if (
      data.applicable_plans &&
      Array.isArray(data.applicable_plans) &&
      !data.applicable_plans.includes(planId)
    ) {
      return null;
    }

    return data as PromoCode;
  }

  /**
   * Get domain-level discount (e.g., all @strativ.io emails get 20% off).
   */
  async getDomainDiscount(domain: string): Promise<DomainDiscount | null> {
    const { data, error } = await this.supabase
      .from('domain_discounts')
      .select('*')
      .eq('domain', domain.toLowerCase())
      .eq('active', true)
      .single();

    if (error || !data) return null;
    return data as DomainDiscount;
  }

  /**
   * Increment promo code usage after successful payment.
   */
  async incrementPromoUsage(code: string): Promise<void> {
    await this.supabase.rpc('increment_promo_usage', {
      p_code: code.toUpperCase().trim(),
    });
  }

  /**
   * Update user tier after successful payment confirmation.
   */
  async activateSubscription(userId: string, planId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tier: planId },
    });
    this.logger.log(`Subscription activated: user=${userId} plan=${planId}`);
  }

  // ─── PAYMENT GATEWAY ───────────────────────────────────────────

  /**
   * Create a checkout session and return the hosted payment URL.
   * The frontend redirects the user to this URL — card data is collected
   * entirely on the gateway's domain (PCI-compliant hosted checkout).
   *
   * When the payment gateway SDK is integrated, replace the inner body with
   * the gateway's createSession / createPaymentLink call.
   */
  async createCheckoutSession(params: {
    userId: string;
    userEmail: string;
    planId: string;
    billingPeriod: 'monthly' | 'annual';
    promoCode?: string;
  }): Promise<{ url: string | null; sessionId: string | null; message?: string }> {
    // 1. Recalculate server-side (never trust client-provided amounts)
    const calc = await this.calculateCheckout({
      planId: params.planId,
      billingPeriod: params.billingPeriod,
      promoCode: params.promoCode,
      userEmail: params.userEmail,
    });

    // 2. Record pending payment in Supabase
    const { data: payment, error: insertErr } = await this.supabase
      .from('payments')
      .insert({
        user_id: params.userId,
        plan_id: params.planId,
        billing_period: params.billingPeriod,
        promo_code: params.promoCode || null,
        base_price: calc.basePrice,
        discount_amount: calc.discountAmount,
        tax_amount: calc.taxAmount,
        total_amount: calc.totalAmount,
        currency: calc.currency,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr || !payment) {
      this.logger.error(`Failed to create payment record: ${insertErr?.message}`);
      throw new BadRequestException('Unable to initialize payment');
    }

    // ───────────────────────────────────────────────────────────────
    // TODO: Replace with actual gateway SDK call. Example (Stripe):
    //
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // const session = await stripe.checkout.sessions.create({
    //   mode: 'subscription',
    //   customer_email: params.userEmail,
    //   line_items: [{ price: gatewayPriceId, quantity: 1 }],
    //   metadata: { paymentId: payment.id, userId: params.userId },
    //   success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    //   cancel_url: `${frontendUrl}/checkout/cancel`,
    // });
    // return { url: session.url, sessionId: session.id };
    // ───────────────────────────────────────────────────────────────

    this.logger.warn(
      `Payment gateway not configured. Payment ${payment.id} (${calc.currency} ${calc.totalAmount}) recorded as pending.`,
    );

    return {
      url: null,
      sessionId: payment.id,
      message:
        'Payment gateway is not yet configured. Your order has been recorded — please contact support to finalize your upgrade.',
    };
  }

  /**
   * Verify a webhook signature and process the payment event.
   * Returns true if the event was handled, false if signature verification failed.
   *
   * Integration steps:
   * 1. Set PAYMENT_WEBHOOK_SECRET in environment
   * 2. Replace signature verification with gateway SDK
   * 3. Map gateway event types to internal actions
   */
  async handleWebhook(rawBody: Buffer, signatureHeader: string): Promise<boolean> {
    // ───────────────────────────────────────────────────────────────
    // TODO: Replace with actual gateway verification. Example (Stripe):
    //
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // const event = stripe.webhooks.constructEvent(
    //   rawBody, signatureHeader, process.env.STRIPE_WEBHOOK_SECRET
    // );
    // ───────────────────────────────────────────────────────────────

    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.warn('PAYMENT_WEBHOOK_SECRET not set — rejecting webhook');
      return false;
    }

    // PLACEHOLDER: In production, use the gateway SDK to verify the signature.
    // Never trust webhook data without cryptographic signature verification.
    this.logger.warn('Webhook signature verification not yet implemented');
    return false;
  }

  /**
   * Confirm a payment by ID (called after webhook verification or manual confirmation).
   */
  async confirmPayment(paymentId: string): Promise<void> {
    const { data: payment, error } = await this.supabase
      .from('payments')
      .select('user_id, plan_id, promo_code, status')
      .eq('id', paymentId)
      .single();

    if (error || !payment) {
      this.logger.error(`Payment not found: ${paymentId}`);
      throw new BadRequestException('Payment not found');
    }

    if (payment.status === 'confirmed') {
      this.logger.debug(`Payment ${paymentId} already confirmed — skipping`);
      return;
    }

    // Activate subscription
    await this.activateSubscription(payment.user_id, payment.plan_id);

    // Increment promo usage if applicable
    if (payment.promo_code) {
      await this.incrementPromoUsage(payment.promo_code);
    }

    // Mark payment as confirmed
    await this.supabase
      .from('payments')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', paymentId);

    this.logger.log(`Payment ${paymentId} confirmed for user ${payment.user_id}`);
  }

  /**
   * Cancel a user's subscription — downgrade to free.
   */
  async cancelSubscription(userId: string): Promise<void> {
    // TODO: Also cancel on the payment gateway side when integrated
    await this.prisma.user.update({
      where: { id: userId },
      data: { tier: 'free' },
    });
    this.logger.log(`Subscription cancelled for user ${userId}`);
  }
}
