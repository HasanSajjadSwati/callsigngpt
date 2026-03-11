export type PricingPlan = {
  id: string;
  name: string;
  price: number | null; // null = free
  currency: string;
  period: string;
  description: string;
  features: string[];
  highlight?: boolean;
  badge?: string;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: null,
    currency: 'PKR',
    period: '/month',
    description: 'Get started with essential AI models',
    features: [
      'GPT 4o-mini',
      'GPT-4o',
      'GPT-5 Nano',
      'Mistral small',
      'DeepSeek V3',
      'Gemini 2.5 Flash',
      'Restricted limits',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 1799,
    currency: 'PKR',
    period: '/month',
    description: 'Everything in Free plus premium models',
    badge: 'Popular',
    highlight: true,
    features: [
      'Everything in Free, plus:',
      'GPT 5.2',
      'GPT 5.1',
      'GPT 4.1',
      'Gemini 3 Flash',
      'Gemini 3 Pro',
      'DeepSeek V3.2',
      'DeepSeek V3.1',
      'Mistral medium',
      'Perplexity AI',
      'Grok 4.1 fast reasoning',
      'Image generation',
      'Extended limits',
    ],
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    price: 2999,
    currency: 'PKR',
    period: '/month',
    description: 'Everything in Pro plus advanced models',
    features: [
      'Everything in Pro, plus:',
      'GPT 5.4',
      'GPT 5.3',
      'Gemini 3.1 Flash lite',
      'Grok 4.2',
      'Claude Sonnet 4.5',
      'Extended limits',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 5999,
    currency: 'PKR',
    period: '/month',
    description: 'Everything in Pro Plus plus enterprise features',
    badge: 'Best Value',
    features: [
      'Everything in Pro Plus, plus:',
      'Claude Opus 4.6',
      'Claude Opus 4.5',
      'Claude Haiku 4.5',
      'Gemini 3.1 Pro',
      'Undetectable.ai (20K words/month)',
      'Extended limits',
    ],
  },
];

export function formatPrice(price: number | null, currency: string): string {
  if (price === null) return 'Free';
  return `${currency} ${price.toLocaleString()}`;
}
