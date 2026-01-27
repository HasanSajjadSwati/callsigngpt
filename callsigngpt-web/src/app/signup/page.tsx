'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { normalizePhoneInput } from '@/lib/phone';
import { COUNTRY_OPTIONS } from '@/lib/countries';
import StatusDialog from '@/components/StatusDialog';
import { GoogleAuthButton } from '@/components/GoogleAuthButton';

const DEFAULT_COUNTRY =
  COUNTRY_OPTIONS[0] ?? { iso: 'US', name: 'United States', dialCode: '+1', flag: 'placeholder' };
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_HELP =
  'Use at least 8 characters, including uppercase, lowercase, a number, and a symbol.';
const SIGNUP_FEATURES = [
  {
    title: 'Unlimited history + autosave',
    desc: 'Keep every conversation synced, searchable, and ready to hand off.',
    kicker: 'Memory',
  },
  {
    title: 'Realtime streaming',
    desc: 'See responses appear instantly across your favorite providers.',
    kicker: 'Speed',
  },
  {
    title: 'Team-ready roles (soon)',
    desc: 'Prepare your workspace for RBAC, shared billing, and approvals.',
    kicker: 'Collab',
  },
  {
    title: 'Secure authentication',
    desc: 'Hardened auth with social sign-in and encryption baked in.',
    kicker: 'Security',
  },
];

const SIGNUP_CHIPS = ['Multi-model routing', 'Priority access', 'Workspace analytics'];

export default function SignupPage() {
  const router = useRouter();
  const { signUp, signInWithGoogle, loading, session } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [selectedCountryIso, setSelectedCountryIso] = useState(DEFAULT_COUNTRY.iso);
  const [countrySearch, setCountrySearch] = useState('');
  const [countryListOpen, setCountryListOpen] = useState(false);
  const countryPickerRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: '', message: '' });
  const selectedCountry =
    COUNTRY_OPTIONS.find((option) => option.iso === selectedCountryIso) ?? DEFAULT_COUNTRY;
  const filteredCountries = useMemo(() => {
    const term = countrySearch.trim().toLowerCase();
    if (!term) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter((country) => {
      const dial = country.dialCode.replace('+', '');
      const matchesName = country.name.toLowerCase().includes(term);
      const matchesIso = country.iso.toLowerCase().includes(term);
      const matchesDial =
        country.dialCode.toLowerCase().includes(term) ||
        dial.startsWith(term.replace('+', ''));
      return matchesName || matchesIso || matchesDial;
    });
  }, [countrySearch]);
  const inputClass =
    'h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm sm:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40 transition backdrop-blur';

  // Redirect after signup once auth has loaded
  useEffect(() => {
    if (!loading && session) {
      router.replace('/');
    }
  }, [loading, session, router]);

  useEffect(() => {
    if (!countryListOpen) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (!countryPickerRef.current) return;
      if (!countryPickerRef.current.contains(event.target as Node)) {
        setCountryListOpen(false);
        setCountrySearch('');
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [countryListOpen]);

  return (
    <main className="relative min-h-screen flex flex-col overflow-x-hidden overflow-y-auto px-4 py-8 text-zinc-100 sm:px-6 md:px-8 lg:px-14 lg:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-[-120px] h-64 w-64 rounded-full bg-purple-500/12 blur-[120px]" />
        <div className="absolute right-[-50px] top-16 h-56 w-56 rounded-full bg-pink-400/12 blur-[110px]" />
        <div className="absolute -bottom-32 left-1/2 h-72 w-72 -translate-x-1/2 transform rounded-full bg-orange-300/10 blur-[130px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 sm:gap-8 lg:gap-8">
        <div className="grid gap-6 md:grid-cols-[1.08fr_0.92fr] md:items-start lg:items-stretch lg:gap-8 xl:gap-12 lg:h-full">
          <section className="glass-panel gradient-border relative order-2 overflow-hidden rounded-[32px] border border-white/10 p-6 shadow-[0_30px_120px_rgba(2,6,23,.6)] sm:p-8 md:order-1 lg:h-full">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(236,72,153,0.16),transparent_38%),radial-gradient(circle_at_88%_0%,rgba(94,92,255,0.14),transparent_40%),radial-gradient(circle_at_45%_110%,rgba(255,160,122,0.12),transparent_30%)]" />
            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3 text-left">
                  <p className="text-[11px] uppercase tracking-[0.35em] text-pink-100/90">Create workspace</p>
                  <img
                    src="/logo.png"
                    alt="CallSignGPT"
                    className="h-auto w-[clamp(4rem,9vw,5rem)] object-contain opacity-90"
                    draggable={false}
                  />
                  <h1 className="text-2xl font-semibold leading-tight text-white sm:text-3xl md:text-4xl">
                    Build faster with multi-model workflows in one sleek interface.
                  </h1>
                  <p className="text-sm text-zinc-400 sm:text-base">
                    Launch a new account to unlock synced chat history, premium routing, and priority access to upcoming releases.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white shadow-inner">
                  <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_0_6px_rgba(251,191,36,0.18)]" />
                  New
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 auto-rows-fr">
                {SIGNUP_FEATURES.map((item) => (
                  <div
                    key={item.title}
                    className="h-full rounded-2xl border border-white/5 bg-white/5 p-4 text-left shadow-[0_15px_45px_rgba(2,6,23,.35)] flex flex-col justify-between gap-2"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                      {item.kicker}
                    </p>
                    <p className="mt-2 text-base font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-sm text-zinc-400">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {SIGNUP_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-200"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-300" />
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-panel gradient-border relative order-1 w-full rounded-[28px] border border-white/10 p-6 shadow-[0_25px_90px_rgba(2,6,23,.6)] sm:p-8 md:order-2 md:sticky md:top-1 lg:static lg:h-full">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPasswordError(null);
                if (!PASSWORD_REGEX.test(password)) {
                  setPasswordError(PASSWORD_HELP);
                  passwordRef.current?.focus();
                  return;
                }
                const formattedPhone =
                  phoneDigits && selectedCountry?.dialCode
                    ? `${selectedCountry.dialCode}${phoneDigits}`
                    : undefined;
                const { error } = await signUp(email, password, name, formattedPhone);
                if (error) {
                  setStatusDialog({
                    open: true,
                    title: 'Sign up failed',
                    message: error || 'Unable to create your account. Please try again.',
                  });
                  return;
                }
                router.replace('/');
              }}
              className="space-y-5 sm:space-y-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 text-left">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-500">
                    Join us
                  </span>
                  <h2 className="text-2xl font-semibold text-white">Create your account</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-200">
                  Launch
                </span>
              </div>

              <div className="space-y-3">
                <GoogleAuthButton
                  loading={googleLoading}
                  label="Sign up with Google"
                  onClick={async () => {
                    setGoogleLoading(true);
                    const { error } = await signInWithGoogle('/');
                    if (error) {
                      setStatusDialog({
                        open: true,
                        title: 'Google sign-up failed',
                        message: error,
                      });
                      setGoogleLoading(false);
                    }
                  }}
                />
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-[11px]">Or create with email</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </div>

              <div className="space-y-3">
                <input
                  className={inputClass}
                  placeholder="Full name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="space-y-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div
                      ref={countryPickerRef}
                      className="relative z-10 flex h-12 w-full items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 text-sm text-zinc-100 transition focus-within:border-emerald-400/40 focus-within:ring-2 focus-within:ring-emerald-400/40 backdrop-blur sm:w-40 lg:w-48"
                    >
                      <button
                        type="button"
                        className="flex h-full w-full items-center justify-between gap-2 text-sm font-semibold text-zinc-100"
                        onClick={() => {
                          setCountryListOpen((open) => !open);
                          setCountrySearch('');
                        }}
                        aria-haspopup="listbox"
                        aria-expanded={countryListOpen}
                        aria-label="Select country code"
                      >
                        <span className="truncate">{selectedCountry.dialCode}</span>
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4 text-zinc-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {countryListOpen && (
                        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur">
                          <input
                            autoFocus
                            type="text"
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setCountryListOpen(false);
                                setCountrySearch('');
                              }
                            }}
                            placeholder="Search country or code"
                            className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                          />
                          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/5 bg-white/5">
                            {filteredCountries.length ? (
                              filteredCountries.map((country) => (
                                <button
                                  key={country.iso}
                                  type="button"
                                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-100 hover:bg-white/10"
                                  onClick={() => {
                                    setSelectedCountryIso(country.iso);
                                    setCountryListOpen(false);
                                    setCountrySearch('');
                                  }}
                                >
                                  <span className="truncate">{country.name}</span>
                                  <span className="ml-3 text-xs text-zinc-400">
                                    {country.dialCode}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-sm text-zinc-500">No matches</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <input
                      className={`${inputClass} flex-1`}
                      placeholder="Phone (optional)"
                      inputMode="tel"
                      value={phoneDigits}
                      onChange={(e) => {
                        const digitsOnly = normalizePhoneInput(e.target.value).replace(/\D/g, '');
                        setPhoneDigits(digitsOnly);
                      }}
                    />
                  </div>
                </div>
                <input
                  className={inputClass}
                  placeholder="Email address"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  ref={passwordRef}
                  type="password"
                  className={`${inputClass} ${passwordError ? 'border-rose-400/60 ring-rose-400/40' : ''}`}
                  placeholder="Password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPassword(next);
                    if (passwordError && PASSWORD_REGEX.test(next)) {
                      setPasswordError(null);
                    }
                  }}
                  aria-describedby="password-help"
                  aria-invalid={Boolean(passwordError)}
                />
                <p
                  id="password-help"
                  className={`text-xs ${passwordError ? 'text-rose-400' : 'text-zinc-500'}`}
                >
                  {passwordError ?? PASSWORD_HELP}
                </p>
              </div>

              <button className="w-full rounded-2xl bg-gradient-to-r from-purple-400 via-pink-400 to-orange-300 px-4 py-3.5 text-sm font-semibold text-black shadow-lg shadow-purple-500/30 transition hover:shadow-purple-400/50 sm:text-base">
                Create account
              </button>

              <p className="text-center text-xs text-zinc-500">
                By continuing you agree to our{' '}
                <a href="/terms" className="text-zinc-300 underline-offset-4 hover:underline">Terms</a> and{' '}
                <a href="/terms" className="text-zinc-300 underline-offset-4 hover:underline">Privacy Policy</a>.
              </p>

              <div className="text-center text-sm text-zinc-400">
                Already have an account?{' '}
                <a href="/login" className="font-semibold text-zinc-200 underline-offset-4 hover:underline">
                  Sign in
                </a>
              </div>
            </form>
            <StatusDialog
              open={statusDialog.open}
              title={statusDialog.title}
              message={statusDialog.message}
              variant="error"
              onClose={() => setStatusDialog({ open: false, title: '', message: '' })}
            />
          </section>
        </div>
      </div>
      <footer className="relative mt-auto pt-6 text-center space-y-2">
        <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-400">
          <a href="/terms" className="hover:text-white transition">
            Terms & Conditions
          </a>
          <span className="text-zinc-600">|</span>
          <a href="/privacy" className="hover:text-white transition">
            Privacy Policy
          </a>
        </div>
        <a
          href="https://strativ.io/"
          target="_blank"
          rel="noreferrer"
          className="block text-[11px] text-zinc-400 hover:text-white transition"
        >
          Powered By Strativ
        </a>
      </footer>
    </main>
  );
}
