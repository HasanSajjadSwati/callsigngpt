'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PRICING_PLANS, formatPrice } from '@/lib/pricing';
import { getApiBase } from '@/lib/apiBase';
import { HttpClient } from '@/lib/httpClient';

type CheckoutCalc = {
  plan: { id: string; name: string; monthly_price: number; currency: string; tax_rate: number };
  basePrice: number;
  discountPercent: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
};

function CheckoutPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('plan') || '';
  const { session, accessToken, tier, loading: authLoading } = useAuth();

  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [calc, setCalc] = useState<CheckoutCalc | null>(null);
  const [calcLoading, setCalcLoading] = useState(true);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const plan = PRICING_PLANS.find((p) => p.id === planId);

  const getClient = useCallback(() => {
    if (!accessToken) return null;
    return new HttpClient({
      baseUrl: getApiBase(),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }, [accessToken]);

  // Redirect if not logged in or invalid plan
  useEffect(() => {
    if (authLoading) return;
    if (!session) { router.replace('/login'); return; }
    if (!plan || plan.price === null) { router.replace('/account'); return; }
    if (tier === planId) { router.replace('/account'); return; }
  }, [authLoading, session, plan, tier, planId, router]);

  // Calculate price whenever plan, billing period, or promo changes
  useEffect(() => {
    const client = getClient();
    if (!client || !planId) return;

    let cancelled = false;
    setCalcLoading(true);
    setCalcError(null);

    client
      .post<CheckoutCalc>('/payment/calculate', {
        planId,
        billingPeriod,
        promoCode: promoStatus?.valid ? promoCode : undefined,
      })
      .then((data) => { if (!cancelled) setCalc(data); })
      .catch((err) => { if (!cancelled) setCalcError(err?.message || 'Failed to load pricing'); })
      .finally(() => { if (!cancelled) setCalcLoading(false); });

    return () => { cancelled = true; };
  }, [planId, billingPeriod, promoStatus, getClient, promoCode]);

  async function handleValidatePromo() {
    const client = getClient();
    if (!client || !promoCode.trim()) return;

    setPromoLoading(true);
    setPromoStatus(null);
    try {
      const res = await client.post<{ valid: boolean; discountPercent?: number; message?: string }>(
        '/payment/validate-promo',
        { code: promoCode.trim(), planId },
      );
      setPromoStatus(
        res.valid
          ? { valid: true, message: `${res.discountPercent}% discount applied!` }
          : { valid: false, message: res.message || 'Invalid code' },
      );
    } catch {
      setPromoStatus({ valid: false, message: 'Could not validate code' });
    } finally {
      setPromoLoading(false);
    }
  }

  async function handleCheckout() {
    const client = getClient();
    if (!client || !calc) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await client.post<{ url?: string; message?: string }>('/payment/create-session', {
        planId,
        billingPeriod,
        promoCode: promoStatus?.valid ? promoCode : undefined,
      });
      if (res.url) {
        // Redirect to payment gateway's hosted checkout page
        window.location.assign(res.url);
      } else {
        setSubmitError(res.message || 'Payment gateway is not yet configured. Contact support.');
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Unable to start checkout');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !plan) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen px-4 py-10 text-zinc-100 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/account')}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 transition hover:border-white/25 hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-semibold">Checkout</h1>
        </div>

        {/* Plan Summary */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{plan.name} Plan</h2>
              <p className="mt-1 text-sm text-zinc-400">{plan.description}</p>
            </div>
            {plan.badge && (
              <span className="rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                {plan.badge}
              </span>
            )}
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-1.5 text-sm text-zinc-300">
            {plan.features.slice(0, 8).map((f, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 text-emerald-400" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* Billing Period Toggle */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Billing Period</h3>
          <div className="flex gap-3">
            {(['monthly', 'annual'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setBillingPeriod(period)}
                className={`flex-1 rounded-xl border py-3 text-center text-sm font-medium transition ${
                  billingPeriod === period
                    ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                    : 'border-white/10 text-zinc-400 hover:border-white/25'
                }`}
              >
                {period === 'monthly' ? 'Monthly' : 'Annual'}
                {period === 'annual' && (
                  <span className="ml-1.5 text-[10px] text-emerald-400">Save ~17%</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Promo Code */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Promo Code</h3>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter code"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase());
                setPromoStatus(null);
              }}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-400/50 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
            />
            <button
              onClick={handleValidatePromo}
              disabled={promoLoading || !promoCode.trim()}
              className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-50"
            >
              {promoLoading ? 'Checking…' : 'Apply'}
            </button>
          </div>
          {promoStatus && (
            <p className={`mt-2 text-xs ${promoStatus.valid ? 'text-emerald-400' : 'text-red-400'}`}>
              {promoStatus.message}
            </p>
          )}
        </section>

        {/* Price Breakdown */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">Order Summary</h3>
          {calcLoading ? (
            <p className="text-sm text-zinc-500">Calculating…</p>
          ) : calcError ? (
            <p className="text-sm text-red-400">{calcError}</p>
          ) : calc ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-zinc-300">
                <span>{calc.plan.name} — {billingPeriod}</span>
                <span>{formatPrice(calc.basePrice, calc.currency)}</span>
              </div>
              {calc.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount ({calc.discountPercent}%)</span>
                  <span>−{formatPrice(calc.discountAmount, calc.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-400">
                <span>Tax ({calc.plan.tax_rate}%)</span>
                <span>{formatPrice(calc.taxAmount, calc.currency)}</span>
              </div>
              <div className="border-t border-white/10 pt-3">
                <div className="flex justify-between text-lg font-semibold text-white">
                  <span>Total</span>
                  <span>{formatPrice(calc.totalAmount, calc.currency)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {/* Pay Button */}
        {submitError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
            {submitError}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={submitting || calcLoading || !!calcError}
          className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 py-4 text-sm font-bold text-black shadow-lg shadow-emerald-500/20 transition hover:shadow-emerald-400/40 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Redirecting to payment…' : `Pay ${calc ? formatPrice(calc.totalAmount, calc.currency) : ''}`}
        </button>

        <p className="text-center text-xs text-zinc-500">
          You will be redirected to our secure payment partner. Your card details never touch our servers.
        </p>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutPageInner />
    </Suspense>
  );
}
