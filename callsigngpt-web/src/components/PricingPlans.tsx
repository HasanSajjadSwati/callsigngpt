'use client';

import React from 'react';
import { PRICING_PLANS, formatPrice, type PricingPlan } from '@/lib/pricing';

type PricingPlansProps = {
  currentPlan?: string;
  onSelectPlan?: (plan: PricingPlan) => void;
  compact?: boolean;
};

export default function PricingPlans({ currentPlan = 'free', onSelectPlan, compact = false }: PricingPlansProps) {
  return (
    <div className={`grid gap-4 ${compact ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
      {PRICING_PLANS.map((plan) => {
        const isCurrentPlan = currentPlan === plan.id;
        const isHighlight = plan.highlight;
        
        return (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
              isHighlight
                ? 'border-emerald-400/40 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
                : 'border-white/10 bg-white/5'
            } ${isCurrentPlan ? 'ring-2 ring-emerald-400/60' : ''}`}
          >
            {plan.badge && (
              <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                {plan.badge}
              </span>
            )}

            <div className="mb-4 space-y-1">
              <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
              <p className="text-xs text-zinc-400">{plan.description}</p>
            </div>

            <div className="mb-4">
              <span className="text-2xl font-bold text-white">
                {formatPrice(plan.price, plan.currency)}
              </span>
              {plan.price !== null && (
                <>
                  <span className="text-sm text-zinc-400">{plan.period}</span>
                  <span className="ml-1 text-xs text-zinc-500">+Tax</span>
                </>
              )}
            </div>

            <ul className={`mb-6 flex-1 space-y-2 text-sm ${compact ? 'max-h-48 overflow-y-auto pr-1' : ''}`}>
              {plan.features.map((feature, idx) => {
                const isInherit = feature.startsWith('Everything in');
                return (
                  <li key={idx} className="flex items-start gap-2">
                    {isInherit ? (
                      <span className="mt-0.5">
                        <svg viewBox="0 0 20 20" className="h-4 w-4 text-purple-400" fill="currentColor">
                          <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                        </svg>
                      </span>
                    ) : (
                      <span className="mt-0.5">
                        <svg viewBox="0 0 20 20" className="h-4 w-4 text-emerald-400" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                    <span className={isInherit ? 'font-medium text-purple-300' : 'text-zinc-300'}>
                      {feature}
                    </span>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={() => onSelectPlan?.(plan)}
              disabled={isCurrentPlan}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition ${
                isCurrentPlan
                  ? 'cursor-default border border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                  : isHighlight
                    ? 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 text-black shadow-md shadow-emerald-500/20 hover:shadow-emerald-400/40'
                    : 'border border-white/15 bg-white/5 text-white hover:border-white/30 hover:bg-white/10'
              }`}
            >
              {isCurrentPlan ? 'Current Plan' : plan.price === null ? 'Get Started' : 'Upgrade'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

type PricingComparisonProps = {
  currentPlan?: string;
  onSelectPlan?: (plan: PricingPlan) => void;
};

export function PricingComparison({ currentPlan = 'free', onSelectPlan }: PricingComparisonProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Choose Your Plan</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Unlock powerful AI models and extended limits
        </p>
      </div>
      <PricingPlans currentPlan={currentPlan} onSelectPlan={onSelectPlan} />
    </div>
  );
}

type PricingBadgeProps = {
  plan: string;
};

export function PricingBadge({ plan }: PricingBadgeProps) {
  const planData = PRICING_PLANS.find((p) => p.id === plan);
  if (!planData) return null;

  const colors: Record<string, string> = {
    free: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
    pro: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    pro_plus: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    enterprise: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${colors[plan] || colors.free}`}>
      {planData.name}
    </span>
  );
}
