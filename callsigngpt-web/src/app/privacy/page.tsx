'use client';

import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <main className="relative min-h-screen flex flex-col overflow-y-auto px-4 py-8 text-zinc-100 sm:px-6 md:px-8 lg:px-14 lg:py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 -top-24 h-64 w-64 rounded-full bg-emerald-500/15 blur-[120px]" />
        <div className="absolute right-[-60px] top-10 h-56 w-56 rounded-full bg-indigo-500/12 blur-[120px]" />
        <div className="absolute -bottom-28 left-1/2 h-72 w-72 -translate-x-1/2 transform rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      <div className="relative mx-auto w-full max-w-4xl flex-1">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
        </div>

        <div className="glass-panel gradient-border rounded-[32px] border border-white/10 p-6 shadow-[0_30px_120px_rgba(2,6,23,.6)] sm:p-8 md:p-10">
          <div className="space-y-2 mb-8">
            <p className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/80">Legal</p>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Privacy Policy</h1>
            <p className="text-sm text-zinc-400">Last updated: January 2026</p>
          </div>

          <p className="text-sm leading-relaxed text-zinc-300 mb-6">
            Welcome to CallSignGPT. Your privacy matters to us. This Privacy Policy explains how we
            collect, use, store, and protect your information when you use our platform, website, APIs,
            and related services.
          </p>

          <div className="prose prose-invert prose-zinc max-w-none space-y-6 text-zinc-300">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">1. Information We Collect</h2>

              <h3 className="text-base font-medium text-zinc-200">1.1 Information You Provide</h3>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>Name, email address, organization name</li>
                <li>Account credentials and authentication details</li>
                <li>Billing and subscription information</li>
                <li>Prompts, inputs, and configuration settings you submit to the platform</li>
                <li>Support requests and communications</li>
              </ul>

              <h3 className="text-base font-medium text-zinc-200">1.2 Information Collected Automatically</h3>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>IP address and device information</li>
                <li>Browser type, operating system, and usage logs</li>
                <li>API usage metrics, request volume, and performance data</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>

              <h3 className="text-base font-medium text-zinc-200">1.3 AI and Model Data</h3>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>CallSignGPT does not train public or third-party models on your private data by default</li>
                <li>Enterprise customers may opt into or out of logging and retention policies</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">2. How We Use Your Information</h2>
              <p className="text-sm leading-relaxed">We use your information to:</p>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>Provide, operate, and improve CallSignGPT</li>
                <li>Authenticate users and enforce access controls</li>
                <li>Process payments and manage subscriptions</li>
                <li>Monitor performance, security, and abuse prevention</li>
                <li>Comply with legal and regulatory obligations</li>
                <li>Communicate updates, security notices, and support responses</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">3. Data Storage and Security</h2>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>Data is stored using industry-standard security practices</li>
                <li>Encryption is applied in transit and at rest where applicable</li>
                <li>Role-Based Access Control (RBAC) limits internal access</li>
                <li>Audit logs are maintained for enterprise environments</li>
              </ul>
              <p className="text-sm leading-relaxed">
                Despite our efforts, no system is completely secure. You use the service at your own risk.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">4. Data Sharing</h2>
              <p className="text-sm leading-relaxed">We do not sell your personal data.</p>
              <p className="text-sm leading-relaxed">We may share data only with:</p>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>Trusted infrastructure and payment providers</li>
                <li>Legal authorities when required by law</li>
                <li>Internal systems required to operate the service</li>
              </ul>
              <p className="text-sm leading-relaxed">
                All third parties are bound by confidentiality and data protection obligations.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">5. Data Retention</h2>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>Account data is retained while your account is active</li>
                <li>Logs and usage data are retained based on your plan or configuration</li>
                <li>You may request deletion of your data, subject to legal requirements</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">6. Your Rights</h2>
              <p className="text-sm leading-relaxed">
                Depending on your jurisdiction, you may have the right to:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>Access your personal data</li>
                <li>Request correction or deletion</li>
                <li>Restrict or object to certain processing</li>
                <li>Export your data</li>
              </ul>
              <p className="text-sm leading-relaxed">
                Requests can be made via official support channels.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">7. Cookies</h2>
              <p className="text-sm leading-relaxed">
                We use cookies for authentication, analytics, and performance optimization. You can
                control cookies through your browser settings.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">8. Changes to This Policy</h2>
              <p className="text-sm leading-relaxed">
                We may update this Privacy Policy from time to time. Continued use of CallSignGPT
                constitutes acceptance of the updated policy.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">9. Contact</h2>
              <p className="text-sm leading-relaxed">
                For privacy-related questions, contact us at:{' '}
                <a href="mailto:contact@strativ.io" className="text-emerald-400 hover:underline">
                  contact@strativ.io
                </a>
              </p>
            </section>
          </div>
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
