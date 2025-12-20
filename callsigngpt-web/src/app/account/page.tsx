'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isValidPhoneLength, normalizePhoneInput } from '@/lib/phone';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusDialog from '@/components/StatusDialog';
import { getApiBase } from '@/lib/apiBase';
import { HttpClient } from '@/lib/httpClient';

type MeResponse = {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  tier?: string | null; // backend may call it "tier" or "plan"
  plan?: string | null;
};

export default function AccountPage() {
  const router = useRouter();
  const { session, loading: authLoading, accessToken, signOut } = useAuth();

  // ui state
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // profile state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [plan, setPlan] = useState('free');

  // password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [clearingHistory, setClearingHistory] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'error' | 'success' | 'info';
  }>({ open: false, title: '', message: '', variant: 'info' });

  const showStatusDialog = (
    title: string,
    message: string,
    variant: 'error' | 'success' | 'info' = 'info'
  ) => {
    setStatusDialog({ open: true, title, message, variant });
  };

  const formattedPlan = 'Free';
  const inputClass =
    'w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-300/50 transition backdrop-blur';
  const cardClass =
    'glass-panel gradient-border rounded-[28px] border border-white/10 p-6 backdrop-blur';
  const pillClass =
    'inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide uppercase text-zinc-300';
  const PHONE_LENGTH_ERROR = 'Phone number must be between 10 and 15 digits.';

  // --- Fetcher --------------------------------------------------------------
  async function loadMe() {
    if (!accessToken) return;
    const client = new HttpClient({
      baseUrl: getApiBase(),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setLoadingProfile(true);
    setError(null);
    try {
      const data = await client.get<MeResponse>('/auth/me');

      if (!data?.email) {
        // token invalid/expired
        router.replace('/login');
        return;
      }

      setEmail(data.email ?? session?.user?.email ?? '');
      setName((data.name ?? (session?.user?.user_metadata?.name as string) ?? '') as string);
      const normalizedPhone = normalizePhoneInput(
        (data.phone ?? (session?.user?.user_metadata?.phone as string) ?? '') as string
      );
      setPhone(normalizedPhone);
      setPhoneError(isValidPhoneLength(normalizedPhone) ? null : PHONE_LENGTH_ERROR);
      setPlan((data.tier ?? data.plan ?? 'free') as string);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load profile');
    } finally {
      setLoadingProfile(false);
    }
  }

  // Wait until auth is ready, then fetch
  useEffect(() => {
    if (authLoading) return; // still figuring out session
    if (!session) {
      router.replace('/login');
      return;
    }
    // prefill email from session immediately for nicer UX
    setEmail(session.user?.email ?? '');
    setName((session.user?.user_metadata?.name as string) ?? '');
    const normalizedPhone = normalizePhoneInput((session.user?.user_metadata?.phone as string) ?? '');
    setPhone(normalizedPhone);
    setPhoneError(isValidPhoneLength(normalizedPhone) ? null : PHONE_LENGTH_ERROR);
    loadMe();
  }, [authLoading, session, accessToken]);

  // --- Actions --------------------------------------------------------------
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const client = new HttpClient({
      baseUrl: getApiBase(),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!isValidPhoneLength(phone)) {
      setPhoneError(PHONE_LENGTH_ERROR);
      showStatusDialog('Invalid phone number', PHONE_LENGTH_ERROR, 'error');
      return;
    }
    try {
      await client.post('/auth/update-profile', { name, phone });
      showStatusDialog('Profile updated', 'Your profile details have been saved.', 'success');
      loadMe();
    } catch (err: any) {
      showStatusDialog('Update failed', err.message || 'Could not save your profile.', 'error');
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const client = new HttpClient({
      baseUrl: getApiBase(),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    try {
      await client.post('/auth/change-password', { oldPassword, newPassword });
      showStatusDialog('Password changed', 'Your password was updated successfully.', 'success');
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      showStatusDialog(
        'Password change failed',
        err.message || 'Could not update your password. Please try again.',
        'error'
      );
    }
  }

  async function updatePlan(e: React.FormEvent) {
    e.preventDefault();
    showStatusDialog('Plan updates unavailable', 'Only the free plan is available right now.', 'info');
  }

  async function clearConversationHistoryRequest() {
    const res = await fetch('/api/conversations/clear', {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error('Failed to clear history');
    }
  }

  async function clearHistory() {
    setClearingHistory(true);
    setStatusMessage(null);
    try {
      await clearConversationHistoryRequest();
      setStatusMessage('Conversation history cleared.');
    } catch (err: any) {
      setStatusMessage(err?.message ?? 'Unable to clear conversations.');
    } finally {
      setClearingHistory(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  async function handleDeleteAccount() {
    if (!accessToken || deletingAccount) return;
    const client = new HttpClient({
      baseUrl: getApiBase(),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setDeletingAccount(true);
    setStatusMessage(null);
    try {
      // best effort: remove stored conversations first
      try {
        await clearConversationHistoryRequest();
      } catch (err) {
        console.warn('[account] failed to clear history before deletion:', err);
      }

      await client.delete('/auth/account');
      try {
        await signOut();
      } catch (err) {
        console.warn('[account] signOut after delete failed:', err);
      }
      router.replace('/login');
    } catch (err: any) {
      setStatusMessage(err?.message ?? 'Unable to delete account. Please try again.');
    } finally {
      setDeletingAccount(false);
      setDeleteAccountOpen(false);
    }
  }

  // --- UI -------------------------------------------------------------------
  return (
    <main className="relative min-h-screen px-4 py-10 text-zinc-100 sm:px-8 lg:px-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <div className="flex justify-end">
          <button
            aria-label="Close settings"
            onClick={() => router.push('/')}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        <section className="glass-panel gradient-border rounded-[36px] border border-white/10 p-8 shadow-[0_35px_120px_rgba(2,6,23,.55)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.35em] text-zinc-500">Account</p>
              <h1 className="text-3xl font-semibold lg:text-4xl">Welcome back, {name || 'there'} 👋</h1>
              <p className="text-sm text-zinc-400">
                Manage profile, plan, security and workspace housekeeping — all in one place.
              </p>
            </div>
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm backdrop-blur">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Current plan</span>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-400">
                  {formattedPlan}
                </span>
              </div>
              <div className="text-zinc-300">
                <p className="text-lg font-semibold text-white">{email}</p>
                <p className="text-[11px] uppercase tracking-[0.4em] text-zinc-500">
                  ID: {session?.user?.id ?? '—'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {(error || statusMessage) && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              error
                ? 'border border-red-500/30 bg-red-500/5 text-red-200'
                : 'border border-emerald-400/30 bg-emerald-500/5 text-emerald-200'
            }`}
          >
            {error ?? statusMessage}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-5">
          <section className={`${cardClass} space-y-6 lg:col-span-3`}>
            <div className="space-y-1">
              <span className={pillClass}>Profile</span>
              <p className="text-sm text-zinc-400">Update your public-facing identity and contact details.</p>
            </div>
            <form onSubmit={saveProfile} className="space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Email</label>
                <input className={`${inputClass} mt-2`} value={email} disabled />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Display name</label>
                  <input
                    className={`${inputClass} mt-2`}
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Phone</label>
                  <input
                    inputMode="tel"
                    maxLength={16}
                    className={`${inputClass} mt-2`}
                    placeholder="+1 555 123 4567"
                    value={phone}
                    onChange={(e) => {
                      const normalized = normalizePhoneInput(e.target.value);
                      setPhone(normalized);
                      setPhoneError(isValidPhoneLength(normalized) ? null : PHONE_LENGTH_ERROR);
                    }}
                    aria-invalid={Boolean(phoneError)}
                  />
                  {phoneError && <p className="mt-2 text-xs text-rose-400">{phoneError}</p>}
                </div>
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-2.5 text-sm font-medium text-black shadow-lg shadow-white/20 transition hover:shadow-white/40 disabled:opacity-60"
                disabled={loadingProfile || Boolean(phoneError)}
              >
                Save profile
              </button>
            </form>
          </section>

          <section className={`${cardClass} space-y-6 lg:col-span-2`}>
            <div className="space-y-1">
              <span className={pillClass}>Plan</span>
              <p className="text-sm text-zinc-400">Only the free plan is available right now.</p>
            </div>
            <form onSubmit={updatePlan} className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Choose plan
                </label>
                <select
                  className={`${inputClass} mt-2 appearance-none cursor-not-allowed`}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  disabled
                >
                  <option value="free" className="text-black">
                    Free
                  </option>
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-400 via-sky-400 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30 disabled:opacity-60"
                disabled
              >
                Update plan
              </button>
              <p className="text-xs text-zinc-500">Plan upgrades are temporarily disabled.</p>
            </form>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <section className={`${cardClass} space-y-6 lg:col-span-3`}>
            <div className="space-y-1">
              <span className={pillClass}>Security</span>
              <p className="text-sm text-zinc-400">Keep your workspace protected with a refreshed password.</p>
            </div>
            <form onSubmit={changePassword} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Old password</label>
                <input
                  type="password"
                  className={`${inputClass} mt-2`}
                  placeholder="••••••••"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">New password</label>
                <input
                  type="password"
                  className={`${inputClass} mt-2`}
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-2.5 text-sm font-medium text-black shadow-lg shadow-white/20 transition hover:shadow-white/40 disabled:opacity-60"
                  disabled={!oldPassword || !newPassword}
                >
                  Change password
                </button>
              </div>
            </form>
          </section>

          <section className={`${cardClass} space-y-6 lg:col-span-2`}>
            <div className="space-y-1">
              <span className={pillClass}>Workspace</span>
              <p className="text-sm text-zinc-400">
                Clear chat history, sign out, or permanently remove your workspace.
              </p>
            </div>
            <div className="space-y-4">
              <button
                onClick={clearHistory}
                disabled={clearingHistory}
                className="w-full rounded-2xl border border-white/10 px-5 py-2.5 text-sm text-zinc-100 transition hover:border-rose-400/50 hover:text-white disabled:opacity-50"
              >
                {clearingHistory ? 'Clearing history…' : 'Clear conversation history'}
              </button>
              <button
                onClick={handleSignOut}
                className="w-full rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-200 transition hover:border-red-400 hover:bg-red-500/20"
              >
                Sign out
              </button>
              <button
                onClick={() => setDeleteAccountOpen(true)}
                disabled={deletingAccount}
                className="w-full rounded-2xl border border-red-700/60 bg-red-700/10 px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:border-red-500 hover:bg-red-700/20 disabled:opacity-60"
              >
                {deletingAccount ? 'Deleting account…' : 'Delete account'}
              </button>
              <p className="text-xs text-zinc-500">
                Clearing history removes all conversations from this account. Delete account removes every record
                associated with your identity across CallSignGPT.
              </p>
            </div>
          </section>
        </div>
      </div>
      <ConfirmDialog
        isOpen={deleteAccountOpen}
        title="Delete account"
        message="This permanently removes your chats, settings, and authentication. This action cannot be undone."
        confirmText={deletingAccount ? 'Deleting...' : 'Delete account'}
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          if (!deletingAccount) setDeleteAccountOpen(false);
        }}
      />
      <StatusDialog
        open={statusDialog.open}
        title={statusDialog.title}
        message={statusDialog.message}
        variant={statusDialog.variant}
        onClose={() => setStatusDialog((prev) => ({ ...prev, open: false }))}
      />
    </main>
  );
}
