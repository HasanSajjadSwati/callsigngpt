'use client';

import Link from 'next/link';

export default function TermsPage() {
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
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Terms and Conditions</h1>
            <p className="text-sm text-zinc-400">Last updated: January 2025</p>
          </div>

          <div className="prose prose-invert prose-zinc max-w-none space-y-6 text-zinc-300">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">1. Acceptance of Terms</h2>
              <p className="text-sm leading-relaxed">
                By accessing and using CallSignGPT (&quot;the Service&quot;), you acknowledge that you have read,
                understood, and agree to be bound by these Terms and Conditions. If you do not agree to
                these terms, please do not use our Service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">2. Description of Service</h2>
              <p className="text-sm leading-relaxed">
                CallSignGPT is a multi-model AI chat application that provides access to various large
                language models (LLMs) including but not limited to Claude, GPT, Google Gemini, Mistral,
                and Deepseek. The Service allows users to interact with these AI models through a unified
                interface.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">3. User Accounts</h2>
              <p className="text-sm leading-relaxed">
                To access certain features of the Service, you must create an account. You are responsible
                for maintaining the confidentiality of your account credentials and for all activities
                that occur under your account. You agree to notify us immediately of any unauthorized
                use of your account.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">4. Acceptable Use</h2>
              <p className="text-sm leading-relaxed">You agree not to use the Service to:</p>
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>Generate content that is illegal, harmful, threatening, abusive, or harassing</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe upon the intellectual property rights of others</li>
                <li>Attempt to gain unauthorized access to our systems or networks</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Use automated systems to access the Service without permission</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">5. Intellectual Property</h2>
              <p className="text-sm leading-relaxed">
                The Service, including its original content, features, and functionality, is owned by
                Strativ and is protected by international copyright, trademark, and other intellectual
                property laws. You retain ownership of any content you create using the Service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">6. Privacy</h2>
              <p className="text-sm leading-relaxed">
                Your use of the Service is also governed by our Privacy Policy. By using the Service,
                you consent to the collection and use of information as described in our Privacy Policy.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">7. Disclaimer of Warranties</h2>
              <p className="text-sm leading-relaxed">
                The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
                either express or implied. We do not guarantee that the Service will be uninterrupted,
                secure, or error-free. AI-generated content may contain inaccuracies and should not be
                relied upon as professional advice.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">8. Limitation of Liability</h2>
              <p className="text-sm leading-relaxed">
                To the fullest extent permitted by law, Strativ shall not be liable for any indirect,
                incidental, special, consequential, or punitive damages arising out of or relating to
                your use of the Service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">9. Changes to Terms</h2>
              <p className="text-sm leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of any
                material changes by posting the updated Terms on the Service. Your continued use of
                the Service after such modifications constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">10. Contact Information</h2>
              <p className="text-sm leading-relaxed">
                If you have any questions about these Terms, please contact us at{' '}
                <a href="https://strativ.io/" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                  strativ.io
                </a>.
              </p>
            </section>
          </div>
        </div>
      </div>

      <footer className="relative mt-auto pt-6 text-center">
        <a
          href="https://strativ.io/"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-zinc-400 hover:text-white transition"
        >
          Powered By Strativ
        </a>
      </footer>
    </main>
  );
}
